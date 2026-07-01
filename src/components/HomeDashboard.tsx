import "../componentStyling/HomeDashboardStyling.css";
import "../componentStyling/TerraDashboard.css";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SavedResearchApiItem } from "./ActiveResearch";
import { buildApiUrl } from "../lib/apiBase";
import Loader from "./Loader";
import SearchBar, { type SearchBarMode } from "./SearchBar";
import { useAuth } from "../context/AuthContext";
import UserProfile from "./UserProfile";
import {
  useMatterStore,
  type MatterRecord,
} from "../context/MatterStoreContext";
import PricingModal from "./PricingModal";
import { Plus } from "lucide-react";

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

const getFirstMatterNextStep = (matter: MatterRecord) => {
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
    taskLabel: "Review matter brief",
    contextLabel: matter.status === "processing" ? "Analysis in progress" : "Open matter workspace",
    statusLabel: matter.status === "processed" ? "Ready" : "Queued",
  };
};

const HomeDashboard = () => {
  const navigate = useNavigate();
  const [isWarmingBackend, setIsWarmingBackend] = useState(true);
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [warmupStage, setWarmupStage] = useState("Waking backend service");
  const [savedResearches, setSavedResearches] = useState<
    SavedResearchApiItem[]
  >([]);
  const [searchMode, setSearchMode] = useState<SearchBarMode>("normal");
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const { user, updateDisplayName } = useAuth();
  const { matters, setActiveMatterId, isSavedMattersLoading } =
    useMatterStore();
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

  useEffect(() => {
    let cancelled = false;
    const loadCredits = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/credits/me"));
        if (!response.ok) return;
        const payload = (await response.json()) as {
          credits?: { available?: number; balance?: number };
        };
        const value = Number(
          payload.credits?.available ?? payload.credits?.balance ?? Number.NaN,
        );
        if (!cancelled && Number.isFinite(value)) {
          setCreditBalance(value);
        }
      } catch {
        if (!cancelled) setCreditBalance(null);
      }
    };
    void loadCredits();
    const interval = window.setInterval(loadCredits, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const activeMatterCards = useMemo(() => matters.slice(0, 4), [matters]);
  const workQueueRows = useMemo(
    () =>
      activeMatterCards.slice(0, 4).map((matter) => {
        const documentCount =
          Number(matter.document_count || matter.documents?.length || 0) ||
          (matter.fileName ? 1 : 0);
        const nextStep = getFirstMatterNextStep(matter);

        return {
          id: matter.id,
          matter,
          documentCount,
          ...nextStep,
        };
      }),
    [activeMatterCards],
  );
  const displayNameValue = nameDraft ?? currentDisplayName;
  const userFirstName =
    displayNameValue.trim().split(/\s+/).filter(Boolean)[0] ||
    user?.email?.split("@")[0] ||
    "there";
  const userInitial = userFirstName.slice(0, 1).toUpperCase() || "A";
  const creditLabel =
    creditBalance === null
      ? "0 credits"
      : `${Math.max(0, Math.floor(creditBalance)).toLocaleString("en-IN")} credits`;

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
      <Loader
        eyebrow="Backend Warm-up"
        title="Preparing Dashboard"
        message="Render free-tier instance is waking up. This can take up to 60 seconds."
        stage={warmupStage}
        progress={warmupProgress}
        steps={[
          "Calling /health on backend",
          "Waiting for Render instance to scale up",
          "Initializing dashboard services",
        ]}
      />
    );
  }

  return (
    <div className="terraDashboardPage">
      <header className="terraTopNav">
        <div className="terraTopLeft">
          <button
            type="button"
            className="terraBrand"
            onClick={() => navigate("/dashboard")}
          >
            Associate
          </button>
        </div>
        <div className="terraTopRight">
          <nav className="terraRouteNav" aria-label="Primary">
            <button type="button" className="isActive" onClick={() => navigate("/dashboard")}>
              Dashboard
            </button>
            <button type="button" onClick={() => navigate("/matter")}>
              Matters
            </button>
            <button type="button" onClick={() => navigate("/research")}>
              Research
            </button>
            <button type="button" onClick={() => navigate("/dashboard/drafting")}>
              Drafting
            </button>
          </nav>
          <button
            className="terraNavButton"
            type="button"
            onClick={() => setIsPricingOpen(true)}
          >
            Pricing
          </button>
          <span className="terraCreditsChip">{creditLabel} remaining</span>
          <button
            type="button"
            className="terraUserCluster"
            aria-label="Open profile details"
            onClick={() => setIsProfileMenuOpen(true)}
          >
            <span className="terraAvatar">{userInitial}</span>
            <span className="terraUserName">{userFirstName}</span>
          </button>
        </div>
      </header>

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
                          row.statusLabel.toLowerCase().includes("ready") ? "is-ready" : ""
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
            <h2>Active Matters</h2>
            <div className="terraMatterGrid">
              {isSavedMattersLoading ? (
                <div className="terraMatterCard">
                  <h3>Loading matters</h3>
                  <p className="terraMatterCardMeta">Matter Library</p>
                </div>
              ) : (
                activeMatterCards.slice(0, 2).map((matter, index) => {
                  const documentCount =
                    Number(matter.document_count || matter.documents?.length || 0) ||
                    (matter.fileName ? 1 : 0);
                  const isReady = index === 0;
                  return (
                    <button
                      key={matter.id}
                      type="button"
                      className="terraMatterCard"
                      onClick={() => {
                        setActiveMatterId(matter.id);
                        navigate("/matter");
                      }}
                    >
                      <div>
                        <h3>{matter.title}</h3>
                        <p className="terraMatterCardMeta">
                          {isReady ? "Notice Response" : "Contract Review"} •{" "}
                          {documentCount} Doc{documentCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
              <div className="terraMatterCard terraStartMatterCard">
                <h3>Start a New Matter</h3>
                <p>
                  Securely upload documents to begin a new matter. Supported
                  files include contracts, notices, and pleadings.
                </p>
                <button
                  type="button"
                  className="terraUploadButton"
                  onClick={() => {
                    setActiveMatterId(null);
                    navigate("/matter");
                  }}
                >
                  UPLOAD DOCUMENTS
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
        mode={searchMode}
        onModeChange={setSearchMode}
      />
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        isAuthenticated
      />
      <UserProfile
        isOpen={isProfileMenuOpen}
        onClose={() => setIsProfileMenuOpen(false)}
      />
    </div>
  );
};

export default HomeDashboard;
