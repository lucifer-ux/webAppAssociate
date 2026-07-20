import "../componentStyling/HomeDashboardStyling.css";
import "../componentStyling/TerraDashboard.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SavedResearchApiItem } from "./ActiveResearch";
import { listDrafts, type DraftSummary } from "./draftingApi";
import { buildApiUrl } from "../lib/apiBase";
import Loader from "./Loader";
import SearchBar from "./SearchBar";
import { useAuth } from "../context/AuthContext";
import {
  useMatterStore,
  type MatterRecord,
} from "../context/MatterStoreContext";
import { usePipelines, type PipelineJob } from "../context/PipelineContext";
import { Plus } from "lucide-react";
import ProductNavbar from "./ProductNavbar";

const getUserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

const getGreeting = (date: Date, timeZone: string) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone,
    }).format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good pre morning";
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const firstText = (...values: unknown[]) =>
  values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  )
    ?.trim() || "";

const getMatterDraftCandidates = (matter: MatterRecord) => {
  const candidates = [
    ...asArray(asRecord(matter.matterUnderstandingV2).draft_sequence),
    ...asArray(asRecord(matter.latestMatterUnderstandingV2).draft_sequence),
    ...asArray(asRecord(matter.atlasNextSteps).draftQueue),
    ...asArray(asRecord(matter.latestAtlasNextSteps).draftQueue),
  ]
    .map(asRecord)
    .map((item) => ({
      title: firstText(item.title, item.draft_type, item.draftType, item.id),
      draftType: firstText(item.draft_type, item.draftType, item.id, item.title),
      reason: firstText(item.rationale, item.description, item.status, "Draft to prepare"),
    }))
    .filter((item) => item.title);

  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = `${item.title}:${item.draftType}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeDraftKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

const findSavedDraftForCandidate = (
  matter: MatterRecord,
  candidate: { title: string; draftType: string },
  drafts: DraftSummary[],
) => {
  const titleKey = normalizeDraftKey(candidate.title);
  const typeKey = normalizeDraftKey(candidate.draftType);
  return drafts.find((draft) => {
    if (draft.matterId !== matter.id) return false;
    const draftTitleKey = normalizeDraftKey(draft.title);
    return (
      (titleKey && draftTitleKey.includes(titleKey)) ||
      (typeKey && draftTitleKey.includes(typeKey))
    );
  });
};

const findRunningDraftJobForMatter = (
  matter: MatterRecord,
  jobs: PipelineJob[],
) =>
  jobs.find(
    (job) =>
      job.source === "draft-job" &&
      job.matterId === matter.id &&
      (job.status === "queued" || job.status === "running"),
  );

const getFirstMatterNextStep = (
  matter: MatterRecord,
  drafts: DraftSummary[],
  jobs: PipelineJob[],
) => {
  const runningDraftJob = findRunningDraftJobForMatter(matter, jobs);
  if (runningDraftJob) {
    return {
      taskLabel: runningDraftJob.title || "Draft generation",
      contextLabel: runningDraftJob.statusMessage || runningDraftJob.stage || "Drafting is in progress",
      statusLabel: "Drafting",
    };
  }

  const draftCandidates = getMatterDraftCandidates(matter);
  const firstDraftCandidate = draftCandidates[0];
  if (firstDraftCandidate) {
    const savedDraft = findSavedDraftForCandidate(matter, firstDraftCandidate, drafts);
    return {
      taskLabel: savedDraft?.title || firstDraftCandidate.title,
      contextLabel: savedDraft
        ? "Ready draft stored"
        : firstDraftCandidate.reason,
      statusLabel: savedDraft ? "Draft done" : "Draft queued",
    };
  }

  const overviewSources = [
    matter.executiveSummary,
    asRecord(matter.latestExecutiveSummary).summary,
    matter.acceptedBrief,
  ].map(asRecord);
  for (const source of overviewSources) {
    const overview = asRecord(source.overview);
    const firstStep = asArray(overview.nextSteps)
      .map(asRecord)
      .find((step) => firstText(step.action, step.title, step.description));
    if (firstStep) {
      return {
        taskLabel: firstText(firstStep.action, firstStep.title, firstStep.description),
        contextLabel: firstText(firstStep.rationale, firstStep.description, "Brief next step"),
        statusLabel: firstText(firstStep.priority, "Ready"),
      };
    }
  }

  const atlasNextSteps = [
    matter.atlasNextSteps,
    matter.latestAtlasNextSteps,
  ].map(asRecord);
  for (const source of atlasNextSteps) {
    const doNow = asArray(source.doNow);
    const draftQueue = asArray(source.draftQueue);
    const systemWorkingOn = asArray(source.systemWorkingOn);
    const firstStep = [...doNow, ...draftQueue, ...systemWorkingOn]
      .map(asRecord)
      .find((step) => firstText(step.title, step.description));
    if (firstStep) {
      return {
        taskLabel: firstText(firstStep.title, firstStep.description),
        contextLabel: firstText(firstStep.description, firstStep.status, "Next step"),
        statusLabel: firstText(firstStep.status, firstStep.priority, "Queued"),
      };
    }
  }

  const groundSources = [
    matter.groundAnalysis,
    asRecord(matter.groundAnalysis).next_steps,
  ].map(asRecord);
  for (const source of groundSources) {
    const firstStep = asArray(source.recommended_next_steps)
      .map(asRecord)
      .find((step) => firstText(step.title, step.description));
    if (firstStep) {
      return {
        taskLabel: firstText(firstStep.title, firstStep.description),
        contextLabel: firstText(firstStep.description, firstStep.reason, "Grounded next step"),
        statusLabel: firstText(firstStep.status, firstStep.priority, "Queued"),
      };
    }
  }

  const planItems = asArray(matter.nextStepPlan?.items);
  for (const item of planItems) {
    const itemRecord = asRecord(item);
    const firstStep = asArray(itemRecord.recommended_next_steps)
      .map(asRecord)
      .find((step) => firstText(step.title, step.description));
    if (firstStep) {
      return {
        taskLabel: firstText(firstStep.title, firstStep.description),
        contextLabel: firstText(firstStep.description, firstStep.reason, itemRecord.title),
        statusLabel: firstText(firstStep.status, firstStep.priority, "Queued"),
      };
    }
  }

  return {
    taskLabel: matter.status === "processing" ? "Matter analysis" : "Open matter workspace",
    contextLabel: matter.status === "processing" ? "Analysis in progress" : "No draft queue yet",
    statusLabel: matter.status === "processed" ? "Ready" : "Queued",
  };
};

const getResearchSummary = (research: SavedResearchApiItem) =>
  firstText(
    research.finalPayload?.final_response?.short_answer,
    research.finalPayload?.final_response?.authority_selection_summary,
    research.finalPayload?.final_response?.analysis,
    "Completed deep research is ready to review.",
  );

const getResearchMeta = (research: SavedResearchApiItem) => {
  const authorityCount = research.finalPayload?.final_response?.key_authorities?.length || 0;
  const sourceCount = research.finalPayload?.final_response?.sources?.length || 0;
  return `${authorityCount} authorit${authorityCount === 1 ? "y" : "ies"} · ${sourceCount} source${
    sourceCount === 1 ? "" : "s"
  }`;
};

const HomeDashboard = () => {
  const navigate = useNavigate();
  const [isWarmingBackend, setIsWarmingBackend] = useState(true);
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [warmupStage, setWarmupStage] = useState("Waking backend service");
  const [savedResearches, setSavedResearches] = useState<
    SavedResearchApiItem[]
  >([]);
  const [savedDrafts, setSavedDrafts] = useState<DraftSummary[]>([]);
  const { user, updateDisplayName } = useAuth();
  const { matters, setActiveMatterId, isSavedMattersLoading } =
    useMatterStore();
  const { jobs } = usePipelines();
  const userTimeZone = getUserTimeZone();
  const currentDisplayName =
    user?.displayName || user?.fullName || user?.email?.split("@")[0] || "";
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: userTimeZone,
      timeZoneName: "short",
    }),
  );
  const greeting = useMemo(
    () => getGreeting(new Date(), userTimeZone),
    [currentTime, userTimeZone],
  );

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    const maxWarmupMs = 60_000;
    const pollEveryMs = 4_000;

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(100, (elapsed / maxWarmupMs) * 100);
      if (!cancelled) {
        setWarmupProgress(progress);
      }
      if (elapsed >= maxWarmupMs) {
        if (!cancelled) {
          setWarmupStage("Warm-up timeout reached, continuing");
          setIsWarmingBackend(false);
        }
        window.clearInterval(progressTimer);
      }
    }, 500);

    const pollHealth = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(buildApiUrl("/health"));
          if (response.ok) {
            if (!cancelled) {
              setWarmupProgress(100);
              setWarmupStage("Backend ready");
              setIsWarmingBackend(false);
            }
            break;
          }
        } catch {
          // Keep polling while backend wakes up.
        }
        const elapsed = Date.now() - start;
        if (elapsed >= maxWarmupMs) break;
        await new Promise((resolve) => window.setTimeout(resolve, pollEveryMs));
      }
      window.clearInterval(progressTimer);
    };

    void pollHealth();

    return () => {
      cancelled = true;
      window.clearInterval(progressTimer);
    };
  }, []);

  useEffect(() => {
    const tick = () =>
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: userTimeZone,
          timeZoneName: "short",
        }),
      );

    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [userTimeZone]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(buildApiUrl("/api/researches?limit=12"));
        const payload = (await response.json()) as {
          success?: boolean;
          researches?: SavedResearchApiItem[];
        };
        if (
          !response.ok ||
          !payload?.success ||
          !Array.isArray(payload.researches)
        ) {
          return;
        }
        if (cancelled) return;
        setSavedResearches(payload.researches);
      } catch {
        // no-op
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completedDraftJobSignature = useMemo(
    () =>
      jobs
        .filter((job) => job.source === "draft-job" && job.status === "succeeded")
        .map((job) => `${job.id}:${job.resultId || job.draftId || ""}:${job.completedAt || ""}`)
        .join("|"),
    [jobs],
  );

  useEffect(() => {
    let cancelled = false;
    void listDrafts()
      .then((drafts) => {
        if (!cancelled) setSavedDrafts(drafts);
      })
      .catch(() => {
        if (!cancelled) setSavedDrafts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [completedDraftJobSignature]);

  const activeMatterCards = useMemo(() => matters.slice(0, 4), [matters]);
  const completedResearchCards = useMemo(
    () =>
      savedResearches
        .filter((research) => Boolean(research.finalPayload?.final_response))
        .slice(0, 2),
    [savedResearches],
  );
  const workQueueRows = useMemo(
    () =>
      activeMatterCards.slice(0, 4).map((matter) => {
        const documentCount =
          Number(matter.document_count || matter.documents?.length || 0) ||
          (matter.fileName ? 1 : 0);
        const nextStep = getFirstMatterNextStep(matter, savedDrafts, jobs);

        return {
          id: matter.id,
          matter,
          documentCount,
          ...nextStep,
        };
      }),
    [activeMatterCards, jobs, savedDrafts],
  );
  const displayNameValue = nameDraft ?? currentDisplayName;
  const recentActivityMatters = activeMatterCards.slice(0, 3);

  const handleQuickResearchSubmit = (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    navigate("/research", {
      state: {
        autoResearchQuery: trimmedQuery,
        preloadedResearches: savedResearches,
      },
    });
  };

  const saveDisplayName = async () => {
    const trimmed = displayNameValue.trim();
    if (
      !trimmed ||
      trimmed === user?.displayName ||
      trimmed === user?.fullName
    )
      return;
    try {
      await updateDisplayName(trimmed);
      setNameDraft(null);
    } catch {
      setNameDraft(null);
    }
  };

  if (isWarmingBackend) {
    return (
      <div className="terraDashboardPage">
        <ProductNavbar
          isSideBarCollapsed={false}
          onToggleSidebar={() => undefined}
        />
        <div className="productPageLoaderSurface">
          <Loader
            eyebrow="Backend Warm-up"
            title="Preparing Dashboard"
            message="Render free-tier instance is waking up. This can take up to 60 seconds."
            stage={warmupStage}
            progress={warmupProgress}
            mode="inline"
            steps={[
              "Calling /health on backend",
              "Waiting for Render instance to scale up",
              "Initializing dashboard services",
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="terraDashboardPage">
      <ProductNavbar
        isSideBarCollapsed={false}
        onToggleSidebar={() => undefined}
      />

      <div className="terraDashboardShell">
        <aside className="terraSidebar">
          <div className="terraSidebarInner">
            <button
              type="button"
              className="terraNewMatterButton"
              onClick={() => {
                setActiveMatterId(null);
                navigate("/matter");
              }}
            >
              <Plus size={18} />
              NEW MATTER
            </button>
            <h3 className="terraSidebarTitle">Recent Activity</h3>
            <div className="terraActivityList">
              {recentActivityMatters.length ? (
                recentActivityMatters.map((matter, index) => {
                  const documentCount =
                    Number(matter.document_count || matter.documents?.length || 0) ||
                    (matter.fileName ? 1 : 0);
                  return (
                    <button
                      key={matter.id}
                      type="button"
                      className="terraActivityCard"
                      onClick={() => {
                        setActiveMatterId(matter.id);
                        navigate("/matter");
                      }}
                    >
                      <div className="terraActivityMeta">
                        <span className="terraActivityIndex">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="terraActivityTime">
                          {index === 0 ? "2h ago" : index === 1 ? "5h ago" : "1d ago"}
                        </span>
                      </div>
                      <h4>{matter.title}</h4>
                      <p>
                        {index === 0 ? "Notice Response" : "Contract Review"} •{" "}
                        {documentCount} Doc{documentCount === 1 ? "" : "s"}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className="terraActivityCard">
                  <h4>No recent matters</h4>
                  <p>Upload a matter to create the first activity item.</p>
                </div>
              )}
            </div>
            <div className="terraSystemAlert">
              <h4>System Alert</h4>
              <p>
                {activeMatterCards[0]
                  ? `Risk flagged on ${activeMatterCards[0].title} - 2h ago`
                  : "Matter monitoring is ready."}
              </p>
            </div>
          </div>
        </aside>

        <main className="terraDashboardMain">
          <header className="terraHero">
            <h1>
              {greeting},{" "}
              <input
                value={displayNameValue}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => void saveDisplayName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                aria-label="Display name"
              />
            </h1>
            <p>
              You have {workQueueRows.length} pending legal task
              {workQueueRows.length === 1 ? "" : "s"} across {matters.length} active
              matter{matters.length === 1 ? "" : "s"}.
            </p>
          </header>

          <section className="terraSection" aria-label="Work queue">
            <h2>Work Queue</h2>
            <div className="terraWorkQueue">
              <div className="terraWorkHeader" role="row">
                <span>Matter</span>
                <span>Task</span>
                <span>Status</span>
                <span>Context</span>
              </div>
              <div className="terraWorkRows">
                {workQueueRows.length ? (
                  workQueueRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="terraWorkRow"
                      onClick={() => {
                        setActiveMatterId(row.id);
                        navigate("/matter");
                      }}
                    >
                      <span className="terraWorkMatter">{row.matter.title}</span>
                      <span className="terraWorkTask">{row.taskLabel}</span>
                      <span
                        className={`terraStatusPill ${
                          row.statusLabel.toLowerCase().includes("ready") ||
                          row.statusLabel.toLowerCase().includes("done")
                            ? "is-ready"
                            : ""
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                      <span className="terraWorkContext">{row.contextLabel}</span>
                    </button>
                  ))
                ) : (
                  <div className="terraWorkRow">
                    <span className="terraWorkMatter">No matter tasks</span>
                    <span className="terraWorkTask">Upload a matter</span>
                    <span className="terraStatusPill">Queued</span>
                    <span className="terraWorkContext">
                      The first task appears after a matter is added.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="terraSection" aria-live="polite">
            <h2>Active Research</h2>
            <div className="terraMatterGrid">
              {completedResearchCards.length ? (
                completedResearchCards.map((research) => (
                  <button
                    key={research.id}
                    type="button"
                    className="terraMatterCard terraResearchCard"
                    onClick={() => navigate(`/research?research=${encodeURIComponent(research.id)}`)}
                  >
                    <div>
                      <h3>{research.query}</h3>
                      <p className="terraMatterCardMeta">{getResearchMeta(research)}</p>
                    </div>
                    <p className="terraResearchCardSummary">
                      {getResearchSummary(research)}
                    </p>
                  </button>
                ))
              ) : isSavedMattersLoading ? (
                <div className="terraMatterCard">
                  <h3>Loading research</h3>
                  <p className="terraMatterCardMeta">Active Research</p>
                </div>
              ) : (
                <div className="terraMatterCard">
                  <h3>No completed research yet</h3>
                  <p className="terraMatterCardMeta">Deep Research</p>
                  <p className="terraResearchCardSummary">
                    Run deep research from the search bar or the Research tab. Completed research will appear here.
                  </p>
                </div>
              )}
              <div className="terraMatterCard terraStartMatterCard">
                <h3>Start New Research</h3>
                <p>
                  Ask a legal question and Associate will run deep research,
                  save the output, and show it here when complete.
                </p>
                <button
                  type="button"
                  className="terraUploadButton"
                  onClick={() => {
                    navigate("/research", {
                      state: { startFreshResearch: true, preloadedResearches: savedResearches },
                    });
                  }}
                >
                  START RESEARCH
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <SearchBar
        activeSection="activeResearch"
        onSubmitQuery={handleQuickResearchSubmit}
        placeholderOverride="Search matters, clauses, statutes..."
        mode="normal"
        showModeSelector={false}
      />
    </div>
  );
};

export default HomeDashboard;
