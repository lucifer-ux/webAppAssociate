import "../componentStyling/HomeDashboardStyling.css";
import Button from "./Button";
import { useEffect, useMemo, useState } from "react";
import SideBar from "./SideBar";
import ProductNavbar from "./ProductNavbar";
import { useNavigate } from "react-router-dom";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import type { SavedResearchApiItem } from "./ActiveResearch";
import { buildApiUrl } from "../lib/apiBase";
import Loader from "./Loader";
import SearchBar from "./SearchBar";
import { useAuth } from "../context/AuthContext";
import { useMatterStore } from "../context/MatterStoreContext";

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

const HomeDashboard = () => {
  const navigate = useNavigate();
  const [isWarmingBackend, setIsWarmingBackend] = useState(true);
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [warmupStage, setWarmupStage] = useState("Waking backend service");
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const [savedResearches, setSavedResearches] = useState<
    SavedResearchApiItem[]
  >([]);
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

  const activeMatterCards = useMemo(() => matters.slice(0, 4), [matters]);
  const displayNameValue = nameDraft ?? currentDisplayName;

  const handleQuickResearchSubmit = (query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    navigate("/dashboard/active-research", {
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
    <div className="homeDashPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
      />

      <SideBar isCollapsed={isSideBarCollapsed} activeSection="matterLibrary" />

      <main
        className={`homeDashMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <>
          <section className="welcomeBlock">
            <div className="welcomeHeadingRow">
              <h1 className="welcomeHeadingTitle">
                {greeting},{" "}
                <input
                  className="welcomeNameInput"
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
              <time className="welcomeCurrentTime" aria-live="polite">
                {currentTime}
              </time>
            </div>
          </section>

          <Button
            type="button"
            className="researchNudgeCard"
            onClick={() => navigate("/drafting")}
            aria-label="Open active research"
          >
            <span className="researchNudgeSpark">✦</span>
            <div className="researchNudgeCopy">
              <h3>Start a new matter</h3>
              <p>
                Just upload a matter and ask questions to move things along.
              </p>
            </div>
            <span className="researchNudgeArrow">→</span>
          </Button>

          <section className="activeMattersSection" aria-live="polite">
            <div className="activeMattersHead">
              <h2>Active Matters</h2>
            </div>
            {isSavedMattersLoading ? (
              <p className="matterStatus">Loading active matters...</p>
            ) : activeMatterCards.length > 0 ? (
              <div className="emailResults activeMatterCards">
                {activeMatterCards.map((matter, index) => (
                  <Button
                    key={matter.id}
                    type="button"
                    className="emailCard activeMatterCard"
                    onClick={() => {
                      setActiveMatterId(matter.id);
                      navigate("/matter");
                    }}
                  >
                    <span className="matterIndex">Matter {index + 1}</span>
                    <h3>{matter.title}</h3>
                    <p>{matter.fileName}</p>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="matterStatus">No active matters yet.</p>
            )}
          </section>

          <section className="activeResearchesSection">
            <div className="activeResearchesHead">
              <h2>Active Researches</h2>
            </div>
            <div className="activeResearchesGrid">
              {savedResearches.slice(0, 3).map((research) => (
                <Button
                  key={research.id}
                  type="button"
                  className="researchDemoCard savedResearchCard"
                  onClick={() =>
                    navigate("/dashboard/active-research", {
                      state: {
                        preloadedResearches: savedResearches,
                        initialActiveResearchId: research.id,
                      },
                    })
                  }
                >
                  <h3>{research.query}</h3>
                  <p>
                    Open this saved research in Active Research and continue
                    from where you left.
                  </p>
                </Button>
              ))}
              <Button
                type="button"
                className="researchDemoCard startNew"
                onClick={() =>
                  navigate("/dashboard/active-research", {
                    state: {
                      preloadedResearches: savedResearches,
                      startFreshResearch: true,
                    },
                  })
                }
              >
                <span className="startNewPlus">+</span>
                <span className="startNewHint">Start a new research</span>
              </Button>
            </div>
          </section>
        </>
      </main>

      <SearchBar
        activeSection="activeResearch"
        onSubmitQuery={handleQuickResearchSubmit}
        placeholderOverride="Quick Research"
      />
    </div>
  );
};

export default HomeDashboard;
