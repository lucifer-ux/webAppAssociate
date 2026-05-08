import "../componentStyling/HomeDashboardStyling.css";
import { useMemo, useState } from "react";
import SideBar from "./SideBar";
import {
  ArrowUp,
  Bell,
  Bolt,
  BookOpen,
  Cable,
  Check,
  FilePlus2,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react";

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
  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000";
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [emails, setEmails] = useState<GmailTopEmailsResponse["emails"]>([]);
  const [emailError, setEmailError] = useState<string>("");
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [isSideBarCollapsed, setIsSideBarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "matterLibrary" | "activeResearch"
  >("matterLibrary");

  const latestEmails = useMemo(() => emails.slice(0, 2), [emails]);

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
      <header className="homeDashTopBar">
        <div className="topBarLeft">
          <button
            className="iconBtn sidebarToggleBtn"
            type="button"
            aria-label={isSideBarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setIsSideBarCollapsed((prev) => !prev)}
          >
            {isSideBarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <img src="/logo.jpeg" alt="Associate logo" className="topBarLogo" />
          <div className="searchWrap">
            <Search size={16} />
            <input type="text" placeholder="Search..." aria-label="Search" />
          </div>
        </div>

        <div className="topBarRight">
          <button className="iconBtn" type="button" aria-label="Lightning">
            <Bolt size={18} />
          </button>
          <button className="iconBtn" type="button" aria-label="Settings">
            <Settings size={18} />
          </button>
          <button
            className="iconBtn iconBtnWithDot"
            type="button"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="notifyDot" />
          </button>
          <button className="avatarBtn" type="button" aria-label="Profile">
            <User size={16} />
          </button>
        </div>
      </header>

      <SideBar
        isCollapsed={isSideBarCollapsed}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <nav className="rightToolsRail">
        <button className="toolRailItem" type="button">
          <BookOpen size={18} />
          <span>Files</span>
        </button>
        <button className="toolRailItem" type="button">
          <FilePlus2 size={18} />
          <span>Playbook</span>
        </button>
        <button className="toolRailItem" type="button">
          <ShieldCheck size={18} />
          <span>Compliance</span>
        </button>
      </nav>

      <main className={`homeDashMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}>
        {activeSection === "matterLibrary" && (
          <>
            <section className="welcomeBlock">
              <h1>Good morning, Counsellor</h1>
              <p>
                Here is your active matters snapshot, organized from your two latest
                Gmail communications.
              </p>
            </section>

            <section className="connectBanner">
              <div className="connectAccent" />
              <div className="connectCopy">
                <div className="connectIcon">
                  <Cable size={22} />
                </div>
                <div>
                  <h2>Connect your Email</h2>
                  <p>
                    Integrating your inbox allows Associate AI to automatically
                    extract critical legal insights, construct chronological
                    timelines, and surface relevant correspondence for your active
                    matters without manual data entry.
                  </p>
                  <ul>
                    <li>
                      <Check size={14} /> Secure OAuth 2.0
                    </li>
                    <li>
                      <Check size={14} /> Read-only access default
                    </li>
                    <li>
                      <Check size={14} /> SOC2 Compliant
                    </li>
                  </ul>
                </div>
              </div>
              <button
                type="button"
                className="authorizeBtn"
                onClick={handleAnalyzeEmails}
                disabled={isFetchingEmails}
              >
                <Cable size={16} />
                <span>{isFetchingEmails ? "Analyzing..." : "Analyze Emails"}</span>
              </button>
            </section>

            <section className="activeMattersSection" aria-live="polite">
              <h2>Active Matters</h2>
              {isFetchingEmails && (
                <p className="matterStatus">Loading latest emails...</p>
              )}
              {!isFetchingEmails && emailError && (
                <p className="matterStatus">{emailError}</p>
              )}
              {!isFetchingEmails && !emailError && latestEmails.length === 0 && (
                <p className="matterStatus">
                  Authorize connection, then click Analyze Emails to load your
                  inbox.
                </p>
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
                        <button
                          type="button"
                          className="emailCardTrigger"
                          onClick={() =>
                            setExpandedEmailId(isExpanded ? null : email.id)
                          }
                        >
                          <span className="matterIndex">Matter {index + 1}</span>
                          <h3>{email.subject || "(No Subject)"}</h3>
                        </button>
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
          </>
        )}

        {activeSection === "activeResearch" && (
          <section className="researchWorkspace">
            <div className="researchHead">
              <h1>Active Research</h1>
              <p>Search Workspace</p>
            </div>
            <div className="researchSearchBar">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search legal databases, filings, statutes, and notes..."
                aria-label="Search workspace"
              />
              <button type="button">
                <SlidersHorizontal size={16} />
                Filters
              </button>
            </div>

            <div className="researchGrid">
              <article>
                <h3>Research Threads</h3>
                <p>No active research threads yet. Start by searching a matter keyword.</p>
              </article>
              <article>
                <h3>Recent Authorities</h3>
                <p>Statutes, cases, and filings you open will appear here for quick return.</p>
              </article>
              <article>
                <h3>Workspace Notes</h3>
                <p>Capture your legal reasoning as you research and keep it linked to matters.</p>
              </article>
              <article>
                <h3>Saved Queries</h3>
                <p>Frequently used search prompts and filters will be saved in this panel.</p>
              </article>
            </div>
          </section>
        )}
      </main>

      <div className="chatDockWrap">
        <div className="chatDock">
          <div className="chatSparkle">
            <Sparkles size={18} />
          </div>
          <input
            type="text"
            placeholder="Draft a brief, analyze a document, or ask a legal question..."
          />
          <button
            className="chatIconBtn"
            type="button"
            aria-label="Attach file"
          >
            <Paperclip size={16} />
          </button>
          <button className="chatSendBtn" type="button" aria-label="Send">
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomeDashboard;
