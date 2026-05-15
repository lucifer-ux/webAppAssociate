import "../componentStyling/SideBar.css";
import Button from "./Button";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RecentResearchItem } from "./ActiveResearchPage";
import Loader from "./Loader";
import {
  useMatterStore,
  type MatterProcessedResult,
} from "../context/MatterStoreContext";
import { listDrafts, type DraftSummary } from "./draftingApi";
import { buildApiUrl } from "../lib/apiBase";

export type RecentMatterItem = {
  id: string;
  title: string;
};

type SideBarProps = {
  isCollapsed: boolean;
  activeSection: "matterLibrary" | "activeResearch" | "drafting";
  recentMatters?: RecentMatterItem[];
  recentResearches?: RecentResearchItem[];
  activeMatterId?: string | null;
  activeResearchId?: string | null;
  onSelectMatter?: (id: string) => void;
  onSelectResearch?: (id: string) => void;
};

type MatterUploadQueuedResponse = {
  success: true;
  job_id: string;
  status: "processing";
  stage: string;
  progress: number;
};

type MatterUploadExistingResponse = {
  success: true;
  existing: true;
  result: MatterProcessedResult;
};

type MatterJobStatusResponse = {
  success: boolean;
  job_id?: string;
  status?: "processing" | "processed" | "failed";
  stage?: string;
  progress?: number;
  result?: MatterProcessedResult | null;
  error?: string | null;
};

type MatterLoaderState = {
  stage: string;
  progress: number;
  history: string[];
};

const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const getCollapsedMatterLabel = (title: string) => {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) return "MAT";
  return normalized.slice(0, 3);
};

class MatterPollingTimeoutError extends Error {
  jobId: string;

  constructor(jobId: string) {
    super("Matter ingestion is still running. You can retry the status check.");
    this.jobId = jobId;
  }
}

const SideBar = ({
  isCollapsed,
  recentMatters = [],
  recentResearches = [],
  activeMatterId = null,
  activeResearchId = null,
  onSelectMatter,
  onSelectResearch,
}: SideBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const isDraftingRoute =
    location.pathname === "/dashboard/drafting" || location.pathname === "/drafting";
  const isActiveResearchRoute =
    location.pathname === "/dashboard/active-research";
  const isMatterRoute = location.pathname === "/matter" || location.pathname === "/dashboard";
  const showResearchSection = isActiveResearchRoute;
  const showMatterSection = isMatterRoute;
  const showDraftSection = isDraftingRoute;
  const {
    matters,
    activeMatterId: storeActiveMatterId,
    addMatter,
    setMattersFromServer,
    setActiveMatterId,
  } = useMatterStore();

  const [isRecentResearchesOpen, setIsRecentResearchesOpen] = useState(true);
  const [draftTabs, setDraftTabs] = useState<DraftSummary[]>([]);
  const [isIngestingMatter, setIsIngestingMatter] = useState(false);
  const [ingestingFileName, setIngestingFileName] = useState("");
  const [timedOutJobId, setTimedOutJobId] = useState<string | null>(null);
  const [matterUploadNotice, setMatterUploadNotice] = useState("");
  const [matterLoaderState, setMatterLoaderState] = useState<MatterLoaderState>(
    {
      stage: "Queued matter ingestion",
      progress: 5,
      history: ["Queued matter ingestion"],
    },
  );

  const hasRecentResearches = recentResearches.length > 0;
  const visibleMatters = [
    ...matters.map((matter) => ({
      id: matter.id,
      title:
        matter.version > 1
          ? `${matter.title} (v${matter.version})`
          : matter.title,
    })),
    ...recentMatters,
  ].filter(
    (matter, index, arr) =>
      arr.findIndex((item) => item.id === matter.id) === index,
  );
  const hasRecentMatters = visibleMatters.length > 0;

  const updateLoaderStage = (stage?: string, progress?: number) => {
    if (!stage && typeof progress !== "number") return;

    setMatterLoaderState((current) => {
      const nextStage = stage || current.stage;
      const nextHistory =
        nextStage && current.history[current.history.length - 1] !== nextStage
          ? [...current.history, nextStage]
          : current.history;

      return {
        stage: nextStage,
        progress: typeof progress === "number" ? progress : current.progress,
        history: nextHistory,
      };
    });
  };

  useEffect(() => {
    if (location.pathname !== "/dashboard") {
      return;
    }

    const shouldOpenUploader = sessionStorage.getItem("open_matter_uploader");
    if (shouldOpenUploader !== "1") {
      return;
    }

    sessionStorage.removeItem("open_matter_uploader");
    uploaderRef.current?.click();
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadStoredMatters = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/matters"));
        const payload = (await response.json()) as {
          success?: boolean;
          matters?: MatterProcessedResult[];
        };
        if (cancelled || !response.ok || !payload?.success || !Array.isArray(payload.matters)) {
          return;
        }
        setMattersFromServer(payload.matters);
      } catch {
        // Ignore hydration failures; uploads still work.
      }
    };

    void loadStoredMatters();
    return () => {
      cancelled = true;
    };
  }, [setMattersFromServer]);

  useEffect(() => {
    if (!showDraftSection) return;
    let cancelled = false;

    void listDrafts()
      .then((drafts) => {
        if (cancelled) return;
        setDraftTabs(drafts);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftTabs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showDraftSection]);

  const pollMatterJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(1500);
      const response = await fetch(
        buildApiUrl(`/api/matters/jobs/${encodeURIComponent(jobId)}`),
      );
      const payload = (await response.json()) as MatterJobStatusResponse;
      updateLoaderStage(payload.stage, payload.progress);

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error || "Matter ingestion status check failed.",
        );
      }

      if (payload.status === "failed") {
        throw new Error(payload.error || "Matter ingestion failed.");
      }

      if (payload.status === "processed" && payload.result) {
        return payload.result;
      }
    }

    throw new MatterPollingTimeoutError(jobId);
  };

  const retryMatterPolling = async () => {
    if (!timedOutJobId) return;
    setIsIngestingMatter(true);
    setMatterUploadNotice("");
    try {
      const result = await pollMatterJob(timedOutJobId);
      addMatter(result);
      setTimedOutJobId(null);
      navigate("/matter");
    } catch (error) {
      if (error instanceof MatterPollingTimeoutError) {
        setTimedOutJobId(error.jobId);
        setMatterUploadNotice(error.message);
      } else {
        setTimedOutJobId(null);
        window.alert(
          error instanceof Error
            ? error.message
            : "Matter upload failed. Please try again.",
        );
      }
    } finally {
      setIsIngestingMatter(false);
      setIngestingFileName("");
    }
  };

  const handleMatterUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;

    setIsIngestingMatter(true);
    setIngestingFileName(file.name);
    setTimedOutJobId(null);
    setMatterUploadNotice("");
    setMatterLoaderState({
      stage: "Uploading file to backend",
      progress: 8,
      history: ["Uploading file to backend"],
    });
    try {
      const formData = new FormData();
      formData.append("matter", file);

      const response = await fetch(buildApiUrl("/api/matters/upload"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | MatterUploadQueuedResponse
        | MatterUploadExistingResponse
        | { success: false; error?: string };

      if (!response.ok || !payload?.success) {
        const uploadError =
          "error" in payload ? payload.error : "Matter upload did not start.";
        throw new Error(String(uploadError || "Matter upload did not start."));
      }

      let result: MatterProcessedResult;
      if ("existing" in payload && payload.existing && payload.result) {
        updateLoaderStage("Loaded existing matter from storage", 100);
        result = payload.result;
      } else if ("job_id" in payload) {
        updateLoaderStage(payload.stage, payload.progress);
        result = await pollMatterJob(payload.job_id);
      } else {
        throw new Error("Matter upload response was invalid.");
      }

      addMatter(result);
      if (input) input.value = "";
      navigate("/matter");
    } catch (error) {
      if (error instanceof MatterPollingTimeoutError) {
        setTimedOutJobId(error.jobId);
        setMatterUploadNotice(error.message);
      } else {
        window.alert(
          error instanceof Error
            ? error.message
            : "Matter upload failed. Please try again.",
        );
      }
    } finally {
      setIsIngestingMatter(false);
      setIngestingFileName("");
    }
  };

  return (
    <nav
      className={`leftRail ${isCollapsed ? "collapsed" : ""} ${isDraftingRoute ? "draftingRoute" : ""}`}
    >
      {isIngestingMatter && (
        <Loader
          fileName={ingestingFileName}
          message="Preparing your matter workspace with live ingestion status."
          stage={matterLoaderState.stage}
          progress={matterLoaderState.progress}
          steps={matterLoaderState.history}
        />
      )}

      {timedOutJobId && !isIngestingMatter && (
        <div className="matterUploadRetry" role="status">
          <p>{matterUploadNotice || "Matter ingestion is still running."}</p>
          <Button type="button" onClick={() => void retryMatterPolling()}>
            Retry status check
          </Button>
        </div>
      )}

      <input
        ref={uploaderRef}
        type="file"
        className="matterUploaderInput"
        aria-label="Upload matter file"
        accept=".pdf,application/pdf"
        onChange={(event) => {
          void handleMatterUpload(event);
        }}
      />

      {showResearchSection && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Recent researches</h3>
            <Button
              type="button"
              className="recentMatterAddBtn"
              aria-label={
                hasRecentResearches
                  ? "Toggle recent researches"
                  : "Open research"
              }
              onClick={() => {
                if (hasRecentResearches) {
                  setIsRecentResearchesOpen((prev) => !prev);
                } else {
                  navigate("/dashboard/active-research");
                }
              }}
              showImage={hasRecentResearches}
              image={
                isRecentResearchesOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )
              }
            >
              {hasRecentResearches ? null : "+"}
            </Button>
          </div>

          {!hasRecentResearches && (
            <Button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={() => navigate("/dashboard/active-research")}
            >
              No research yet.
            </Button>
          )}

          {hasRecentResearches && isRecentResearchesOpen && (
            <div className="recentItemsList">
              {recentResearches.map((research) => (
                <Button
                  key={research.id}
                  type="button"
                  className={`recentMatterItem ${research.id === activeResearchId ? "active" : ""}`}
                  onClick={() => onSelectResearch?.(research.id)}
                >
                  <span className="recentItemTitle">{research.query}</span>
                </Button>
              ))}
            </div>
          )}

          <Button
            type="button"
            className="researchStartTile"
            onClick={() => navigate("/dashboard/active-research")}
          >
            <span className="researchStartPlus">+</span>
            <span className="researchStartLabel">Start a new research</span>
          </Button>
        </div>
      )}

      {showMatterSection && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Matters added</h3>
          </div>

          {hasRecentMatters && (
            <div className="recentItemsList matterRecentList">
              {visibleMatters.map((matter) => (
                <Button
                  key={matter.id}
                  type="button"
                  className={`recentMatterItem matterRecentItem ${
                    matter.id === activeMatterId ||
                    matter.id === storeActiveMatterId
                      ? "active"
                      : ""
                  }`}
                  title={matter.title}
                  onClick={() => {
                    setActiveMatterId(matter.id);
                    onSelectMatter?.(matter.id);
                    if (location.pathname !== "/matter") {
                      navigate("/matter");
                    }
                  }}
                >
                  <span className="recentItemCompact" aria-hidden="true">
                    {getCollapsedMatterLabel(matter.title)}
                  </span>
                  <span className="recentItemTitle">{matter.title}</span>
                </Button>
              ))}
            </div>
          )}

          <Button
            type="button"
            className="matterAddTile matterAddTileSecondary"
            aria-label="Upload another matter"
            disabled={isIngestingMatter}
            onClick={() => uploaderRef.current?.click()}
          >
            <span className="matterAddPlus">+</span>
          </Button>
        </div>
      )}

      {showDraftSection && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Active drafts</h3>
          </div>

          {draftTabs.length > 0 ? (
            <div className="recentItemsList">
              {draftTabs.map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  className="recentMatterItem"
                  onClick={() => navigate(`/dashboard/drafting?draft=${encodeURIComponent(tab.id)}`)}
                  title={tab.title}
                >
                  <span className="recentItemTitle">{tab.title}</span>
                </Button>
              ))}
            </div>
          ) : (
            <Button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={() => navigate("/dashboard/drafting")}
            >
              No active drafts.
            </Button>
          )}
        </div>
      )}
    </nav>
  );
};

export default SideBar;
