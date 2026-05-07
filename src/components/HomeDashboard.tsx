import "../componentStyling/HomeDashboardStyling.css";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Bell,
  Bolt,
  BookOpen,
  Cable,
  Check,
  FilePlus2,
  FolderOpenDot,
  Gavel,
  HelpCircle,
  Paperclip,
  Search,
  Settings,
  ShieldCheck,
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
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [topEmailSubjects, setTopEmailSubjects] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string>("");

  const activeMatterLines = useMemo(() => {
    if (topEmailSubjects.length > 0) {
      return topEmailSubjects;
    }

    if (isFetchingEmails) {
      return ["Loading latest emails..."];
    }

    if (emailError) {
      return [emailError];
    }

    return ["Authorize connection to load your latest email subjects."];
  }, [emailError, isFetchingEmails, topEmailSubjects]);

  const handleAuthorizeConnection = async () => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      setTopEmailSubjects([]);
      setEmailError("Missing authentication token. Please sign in again.");
      return;
    }

    setIsFetchingEmails(true);
    setEmailError("");

    try {
      const res = await fetch("http://localhost:8090/api/auth/gmail/top-emails", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      const payload = (await res.json()) as GmailTopEmailsResponse | GmailErrorResponse;

      if ("error" in payload) {
        setTopEmailSubjects([]);
        setEmailError(payload.error);
        return;
      }

      if (!res.ok || !payload.success || !Array.isArray(payload.emails)) {
        setTopEmailSubjects([]);
        setEmailError("Unable to load emails right now. Please try again.");
        return;
      }

      const subjects = payload.emails
        .map((email) => email.subject?.trim())
        .filter((subject): subject is string => Boolean(subject))
        .slice(0, 2);

      setTopEmailSubjects(subjects);

      if (subjects.length === 0) {
        setEmailError("No email subjects were returned.");
      }
    } catch {
      setTopEmailSubjects([]);
      setEmailError("Failed to connect to Gmail endpoint.");
    } finally {
      setIsFetchingEmails(false);
    }
  };

  return (
    <div className="homeDashPage">
      <header className="homeDashTopBar">
        <div className="topBarLeft">
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
          <button className="iconBtn iconBtnWithDot" type="button" aria-label="Notifications">
            <Bell size={18} />
            <span className="notifyDot" />
          </button>
          <button className="avatarBtn" type="button" aria-label="Profile">
            <User size={16} />
          </button>
        </div>
      </header>

      <nav className="leftRail">
        <div className="leftRailHead">
          <h2>MATTERS</h2>
          <p>Legal Workspace</p>
        </div>

        <div className="leftRailLinks">
          <button className="railItem active" type="button">
            <FolderOpenDot size={18} />
            <span>Matter Library</span>
          </button>
          <button className="railItem" type="button">
            <Search size={18} />
            <span>Active Research</span>
          </button>
          <button className="railItem" type="button">
            <Sparkles size={18} />
            <span>Synthesis</span>
          </button>
          <button className="railItem" type="button">
            <FilePlus2 size={18} />
            <span>Drafting</span>
          </button>
          <button className="railItem" type="button">
            <BookOpen size={18} />
            <span>Archives</span>
          </button>

          <div className="leftRailEmpty">
            <FilePlus2 size={18} />
            <p>No matters created yet.</p>
            <button type="button">New Case</button>
          </div>
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

      <main className="homeDashMain">
        <section className="welcomeBlock">
          <h1>Welcome to your Legal Workspace</h1>
          <p>
            To begin extracting insights, organizing communications, and drafting materials, let&apos;s establish your
            foundational data sources.
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
                Integrating your inbox allows Associate AI to automatically extract critical legal insights, construct
                chronological timelines, and surface relevant correspondence for your active matters without manual data
                entry.
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
          <button type="button" className="authorizeBtn" onClick={handleAuthorizeConnection} disabled={isFetchingEmails}>
            <Cable size={16} />
            <span>{isFetchingEmails ? "Authorizing..." : "Authorize Connection"}</span>
          </button>
        </section>

        <section className="activeMattersSection" aria-live="polite">
          <h2>Active Matters</h2>
          <ul>
            {activeMatterLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="quickGrid">
          <article className="quickCard">
            <div className="quickIcon">
              <FilePlus2 size={18} />
            </div>
            <h3>Establish a Matter</h3>
            <p>Manually define a new case, set jurisdictions, and upload foundational documents directly.</p>
            <div className="quickAction">
              <span>Start</span>
              <ArrowRight size={14} />
            </div>
          </article>

          <article className="quickCard">
            <div className="quickIcon">
              <BookOpen size={18} />
            </div>
            <h3>Explore Templates</h3>
            <p>Browse standard legal structures, brief formats, and contract shells pre-loaded in your library.</p>
            <div className="quickAction muted">
              <span>Browse</span>
              <ArrowRight size={14} />
            </div>
          </article>
        </section>
      </main>

      <div className="chatDockWrap">
        <div className="chatDock">
          <div className="chatSparkle">
            <Sparkles size={18} />
          </div>
          <input type="text" placeholder="Draft a brief, analyze a document, or ask a legal question..." />
          <button className="chatIconBtn" type="button" aria-label="Attach file">
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
