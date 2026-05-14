import "../componentStyling/HomeDashboardStyling.css";
import Button from "./Button";
import { useEffect, useMemo, useState } from "react";
import SideBar from "./SideBar";
import { ArrowUp, Cable, Paperclip } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import { useNavigate } from "react-router-dom";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";

type GmailTopEmailsResponse = {
  success: boolean;
  count: number;
  emails: Array<{
    id: string;
    threadId: string | null;
    from: string;
    subject: string;
    date: string;
    snippet: string;
  }>;
};

type GmailErrorResponse = {
  error: string;
};

const HomeDashboard = () => {
  const navigate = useNavigate();
  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000";
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [emails, setEmails] = useState<GmailTopEmailsResponse["emails"]>([]);
  const [emailError, setEmailError] = useState<string>("");
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const [draftInput, setDraftInput] = useState("");
  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
      timeZoneName: "short",
    }),
  );

  useEffect(() => {
    const tick = () =>
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
          timeZoneName: "short",
        }),
      );

    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const latestEmails = useMemo(() => emails.slice(0, 2), [emails]);

  const handleQuickResearchSubmit = () => {
    const trimmedQuery = draftInput.trim();
    if (!trimmedQuery) return;
    navigate("/dashboard/active-research", {
      state: {
        autoResearchQuery: trimmedQuery,
      },
    });
    setDraftInput("");
  };

  const handleAnalyzeEmails = async () => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      setEmails([]);
      setEmailError("Missing authentication token. Please sign in again.");
      return;
    }

    setIsFetchingEmails(true);
    setEmailError("");

    try {
      const res = await fetch(`${apiBaseUrl}/api/gmail/emails`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const payload = (await res.json()) as
        | GmailTopEmailsResponse
        | GmailErrorResponse;

      if ("error" in payload) {
        setEmails([]);
        setEmailError(payload.error);
        return;
      }

      if (!res.ok || !payload.success || !Array.isArray(payload.emails)) {
        setEmails([]);
        setEmailError("Unable to load emails right now. Please try again.");
        return;
      }

      setEmails(payload.emails);
      setExpandedEmailId(null);

      if (payload.emails.length === 0) {
        setEmailError("No emails were returned.");
      }
    } catch {
      setEmails([]);
      setEmailError("Failed to connect to Gmail endpoint.");
    } finally {
      setIsFetchingEmails(false);
    }
  };

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
              <h1 className="welcomeHeadingTitle">Good morning, Counsellor</h1>
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

          <section className="connectBanner">
            <div className="connectAccent" />
            <div className="connectCopy">
              <div className="connectIcon">
                <Cable size={22} />
              </div>
              <Button
                type="button"
                className="authorizeBtn"
                onClick={handleAnalyzeEmails}
                disabled={isFetchingEmails}
              >
                <Cable size={16} />
                <span>
                  {isFetchingEmails ? "Analyzing..." : "Analyze Emails"}
                </span>
              </Button>
            </div>
          </section>

          <section className="activeMattersSection" aria-live="polite">
            {isFetchingEmails && (
              <p className="matterStatus">Loading latest emails...</p>
            )}
            {!isFetchingEmails && emailError && (
              <p className="matterStatus">{emailError}</p>
            )}
            {latestEmails.length > 0 && (
              <div className="emailResults">
                {latestEmails.map((email, index) => {
                  const isExpanded = expandedEmailId === email.id;
                  return (
                    <article
                      key={email.id}
                      className={`emailCard ${isExpanded ? "expanded" : ""}`}
                    >
                      <Button
                        type="button"
                        className="emailCardTrigger"
                        onClick={() =>
                          setExpandedEmailId(isExpanded ? null : email.id)
                        }
                      >
                        <span className="matterIndex">Matter {index + 1}</span>
                        <h3>{email.subject || "(No Subject)"}</h3>
                      </Button>
                      {isExpanded && (
                        <div className="emailMetaPanel">
                          <p className="emailFrom">
                            {email.from || "Unknown sender"}
                          </p>
                          <p className="emailSnippet">
                            {email.snippet || "No snippet available."}
                          </p>
                          <time>{email.date || "Unknown date"}</time>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="activeResearchesSection">
            <div className="activeResearchesHead">
              <h2>Active Researches</h2>
            </div>
            <div className="activeResearchesGrid">
              <Button
                type="button"
                className="researchDemoCard startNew"
                onClick={() => navigate("/dashboard/active-research")}
              >
                <span className="startNewPlus">+</span>
                <span className="startNewHint">Start a new research</span>
              </Button>
            </div>
          </section>
        </>
      </main>

      <div className="chatDockWrap">
        <form
          className="chatDock"
          onSubmit={(event) => {
            event.preventDefault();
            handleQuickResearchSubmit();
          }}
        >
          <div className="chatSparkle">a.</div>
          <textarea
            value={draftInput}
            onChange={(event) => setDraftInput(event.target.value)}
            placeholder="Quick Research"
            aria-label="Draft input"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleQuickResearchSubmit();
              }
            }}
          />
          <Button
            className="chatIconBtn"
            type="button"
            aria-label="Attach file"
          >
            <Paperclip size={16} />
          </Button>
          <Button
            className="chatSendBtn"
            type="submit"
            aria-label="Send"
            disabled={!draftInput.trim()}
          >
            <ArrowUp size={18} />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default HomeDashboard;
