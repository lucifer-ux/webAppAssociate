import "../componentStyling/SideBar.css";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Gavel, HelpCircle } from "lucide-react";
import type { RecentResearchItem } from "./ActiveResearchPage";
import Loader from "./Loader";
import {
  useMatterStore,
  type MatterProcessedResult,
} from "../context/MatterStoreContext";

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

type MatterJobStatusResponse = {
  success: boolean;
  job_id?: string;
  status?: "processing" | "processed" | "failed";
  stage?: string;
  progress?: number;
  result?: MatterProcessedResult | null;
  error?: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000";
  const isDraftingRoute = location.pathname === "/dashboard/drafting";
  const isActiveResearchRoute = location.pathname === "/dashboard/active-research";
  const { matters, activeMatterId: storeActiveMatterId, addMatter, setActiveMatterId } =
    useMatterStore();

  const [isRecentResearchesOpen, setIsRecentResearchesOpen] = useState(true);
  const [isIngestingMatter, setIsIngestingMatter] = useState(false);
  const [ingestingFileName, setIngestingFileName] = useState("");
  const [timedOutJobId, setTimedOutJobId] = useState<string | null>(null);
  const [matterUploadNotice, setMatterUploadNotice] = useState("");

  const hasRecentResearches = recentResearches.length > 0;
  const visibleMatters = [
    ...matters.map((matter) => ({
      id: matter.id,
      title: matter.version > 1 ? `${matter.title} (v${matter.version})` : matter.title,
    })),
    ...recentMatters,
  ].filter(
    (matter, index, arr) =>
      arr.findIndex((item) => item.id === matter.id) === index,
  );
  const hasRecentMatters = visibleMatters.length > 0;

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

  const pollMatterJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(1500);
      const response = await fetch(
        `${apiBaseUrl}/api/matters/jobs/${encodeURIComponent(jobId)}`,
      );
      const payload = (await response.json()) as MatterJobStatusResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Matter ingestion status check failed.");
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
    try {
      const formData = new FormData();
      formData.append("matter", file);

      const response = await fetch(`${apiBaseUrl}/api/matters/upload`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | MatterUploadQueuedResponse
        | { success: false; error?: string };

      if (!response.ok || !payload?.success || !("job_id" in payload)) {
        const uploadError =
          "error" in payload
            ? payload.error
            : "Matter upload did not start.";
        throw new Error(
          String(uploadError || "Matter upload did not start."),
        );
      }

      const result = await pollMatterJob(payload.job_id);
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
          message="Uploading, extracting text, and classifying each page."
        />
      )}

      {timedOutJobId && !isIngestingMatter && (
        <div className="matterUploadRetry" role="status">
          <p>{matterUploadNotice || "Matter ingestion is still running."}</p>
          <button type="button" onClick={() => void retryMatterPolling()}>
            Retry status check
          </button>
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

      {isActiveResearchRoute && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Recent researches</h3>
            <button
              type="button"
              className="recentMatterAddBtn"
              aria-label={
                hasRecentResearches ? "Toggle recent researches" : "Open research"
              }
              onClick={() => {
                if (hasRecentResearches) {
                  setIsRecentResearchesOpen((prev) => !prev);
                } else {
                  navigate("/dashboard/active-research");
                }
              }}
            >
              {hasRecentResearches ? (
                isRecentResearchesOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )
              ) : (
                "+"
              )}
            </button>
          </div>

          {!hasRecentResearches && (
            <button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={() => navigate("/dashboard/active-research")}
            >
              No research yet.
            </button>
          )}

          {hasRecentResearches && isRecentResearchesOpen && (
            <div className="recentItemsList">
              {recentResearches.map((research) => (
                <button
                  key={research.id}
                  type="button"
                  className={`recentMatterItem ${research.id === activeResearchId ? "active" : ""}`}
                  onClick={() => onSelectResearch?.(research.id)}
                >
                  <span className="recentItemTitle">{research.query}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="recentSectionBlock">
        <div className="recentSectionHead">
          <h3>Matters added</h3>
        </div>

        {!hasRecentMatters && (
          <button
            type="button"
            className="matterAddTile"
            aria-label="Upload a matter"
            disabled={isIngestingMatter}
            onClick={() => uploaderRef.current?.click()}
          >
            <span className="matterAddPlus">+</span>
          </button>
        )}

        {hasRecentMatters && (
          <div className="recentItemsList">
            {visibleMatters.map((matter) => (
              <button
                key={matter.id}
                type="button"
                className={`recentMatterItem ${
                  matter.id === activeMatterId || matter.id === storeActiveMatterId
                    ? "active"
                    : ""
                }`}
                onClick={() => {
                  setActiveMatterId(matter.id);
                  onSelectMatter?.(matter.id);
                  if (location.pathname !== "/matter") {
                    navigate("/matter");
                  }
                }}
              >
                <span className="recentItemTitle">{matter.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="leftRailFoot">
        <button className="railItem small" type="button">
          <Gavel size={16} />
          <span>Compliance</span>
        </button>
        <button className="railItem small" type="button">
          <HelpCircle size={16} />
          <span>Help</span>
        </button>
      </div>
    </nav>
  );
};

export default SideBar;
