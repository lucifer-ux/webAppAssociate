import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Button from "./Button";
import { buildApiUrl } from "../lib/apiBase";
import "../componentStyling/AdministrationPage.css";

type InviteRecord = {
  id: string;
  email: string;
  code?: string;
  status: string;
  note?: string;
  createdAt?: string;
  expiresAt?: string;
  acceptedAt?: string;
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const generateRandomToken = (length: number) => {
  const bytes = new Uint8Array(64);
  let token = "";
  while (token.length < length) {
    window.crypto.getRandomValues(bytes);
    token += btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }
  return token.slice(0, length);
};

const AdministrationPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [singleEmail, setSingleEmail] = useState("");
  const [singleNote, setSingleNote] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [latestInvites, setLatestInvites] = useState<InviteRecord[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteRecord[]>([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshInvites = async () => {
    const response = await fetch(buildApiUrl("/api/admin/invites"));
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      invites?: InviteRecord[];
    };
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Failed to load invites.");
    }
    setInviteRows(Array.isArray(payload.invites) ? payload.invites : []);
  };

  const checkAdminSession = async () => {
    try {
      const response = await fetch(buildApiUrl("/api/admin/auth/me"));
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        email?: string;
      };
      if (!response.ok || payload.success === false || !payload.email) {
        setAdminEmail("");
        return;
      }
      setAdminEmail(String(payload.email));
      await refreshInvites();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setGeneratedCode(generateRandomToken(50));
    void checkAdminSession();
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setIsSubmitting(true);
    try {
      const response = await fetch(buildApiUrl("/api/admin/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        email?: string;
      };
      if (!response.ok || payload.success === false || !payload.email) {
        throw new Error(payload.error || "Administration login failed.");
      }
      setAdminEmail(String(payload.email));
      setPassword("");
      setStatus("Administration access granted.");
      await refreshInvites();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Administration login failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setStatus("");
    setIsSubmitting(true);
    try {
      await fetch(buildApiUrl("/api/admin/auth/logout"), { method: "POST" });
      setAdminEmail("");
      setInviteRows([]);
      setLatestInvites([]);
      setStatus("Administration session closed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const createSingleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setIsSubmitting(true);
    try {
      const response = await fetch(buildApiUrl("/api/admin/invites"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: singleEmail,
          note: singleNote,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        invite?: InviteRecord;
      };
      if (!response.ok || payload.success === false || !payload.invite) {
        throw new Error(payload.error || "Invite could not be created.");
      }
      setLatestInvites([payload.invite]);
      setSingleEmail("");
      setSingleNote("");
      setStatus(`Invite created for ${payload.invite.email}.`);
      await refreshInvites();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Invite could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const createBulkInvites = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setIsSubmitting(true);
    try {
      const emails = Array.from(
        new Set(
          bulkEmails
            .split(/[\s,;\n\r]+/)
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      if (!emails.length) {
        throw new Error("Add at least one valid email.");
      }
      const response = await fetch(buildApiUrl("/api/admin/invites/bulk"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emails,
          note: bulkNote,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        created?: InviteRecord[];
        skipped?: Array<{ email: string; error: string }>;
      };
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Bulk invites could not be created.");
      }
      setLatestInvites(Array.isArray(payload.created) ? payload.created : []);
      setBulkEmails("");
      setBulkNote("");
      const skippedCount = Array.isArray(payload.skipped)
        ? payload.skipped.length
        : 0;
      setStatus(
        `Created ${Array.isArray(payload.created) ? payload.created.length : 0} invites${skippedCount ? `, skipped ${skippedCount}.` : "."}`,
      );
      await refreshInvites();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Bulk invites could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onBulkFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setBulkEmails((current) => `${current}\n${text}`.trim());
  };

  if (isLoading) {
    return <div className="routeLoading">Loading administration...</div>;
  }

  return (
    <div className="adminPage">
      <main className="adminShell">
        <section className="adminHero">
          <div>
            <p className="adminEyebrow">Administration</p>
            <h1>Invite access control</h1>
            <p className="adminSubtitle">
              Create and track invite codes that unlock the Associate workspace.
            </p>
          </div>
          {adminEmail ? (
            <div className="adminSessionCard">
              <span>Signed in as</span>
              <strong>{adminEmail}</strong>
              <Button
                className="adminGhostButton"
                onClick={() => void logout()}
                disabled={isSubmitting}
              >
                Sign out
              </Button>
            </div>
          ) : null}
        </section>

        {status ? <p className="adminStatus">{status}</p> : null}

        {!adminEmail ? (
          <section className="adminLoginPanel">
            <div>
              <p className="adminEyebrow">Restricted</p>
              <h2>Administration login</h2>
            </div>
            <form className="adminLoginForm" onSubmit={login}>
              <label htmlFor="adminEmail">Email</label>
              <input
                id="adminEmail"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="adminname"
                required
              />

              <label htmlFor="adminPassword">Password</label>
              <input
                id="adminPassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Administration password"
                required
              />

              <Button
                className="adminPrimaryButton"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </section>
        ) : (
          <section className="adminGrid">
            <section className="adminPanel adminPanelWide">
              <div className="adminPanelHeader">
                <div>
                  <p className="adminEyebrow">Utility</p>
                  <h2>Random invite code</h2>
                </div>
                <Button
                  className="adminGhostButton"
                  onClick={() => setGeneratedCode(generateRandomToken(50))}
                  disabled={isSubmitting}
                >
                  Generate another
                </Button>
              </div>
              <div className="adminCodePreview">{generatedCode}</div>
            </section>

            <form className="adminPanel" onSubmit={createSingleInvite}>
              <div className="adminPanelHeader">
                <div>
                  <p className="adminEyebrow">Single</p>
                  <h2>Create invite</h2>
                </div>
              </div>

              <label htmlFor="singleInviteEmail">Email</label>
              <input
                id="singleInviteEmail"
                type="email"
                value={singleEmail}
                onChange={(event) => setSingleEmail(event.target.value)}
                placeholder="lawyer@example.com"
                required
              />

              <label htmlFor="singleInviteNote">Note</label>
              <input
                id="singleInviteNote"
                value={singleNote}
                onChange={(event) => setSingleNote(event.target.value)}
                placeholder="Optional note"
              />

              <Button
                className="adminPrimaryButton"
                type="submit"
                disabled={isSubmitting}
              >
                Create invite
              </Button>
            </form>

            <form className="adminPanel" onSubmit={createBulkInvites}>
              <div className="adminPanelHeader">
                <div>
                  <p className="adminEyebrow">Bulk</p>
                  <h2>Bulk whitelist</h2>
                </div>
              </div>

              <label htmlFor="bulkInviteEmails">Emails</label>
              <textarea
                id="bulkInviteEmails"
                value={bulkEmails}
                onChange={(event) => setBulkEmails(event.target.value)}
                placeholder="Paste emails separated by comma, space, or new line"
              />

              <label htmlFor="bulkInviteFile">Upload file</label>
              <input
                id="bulkInviteFile"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(event) => void onBulkFile(event)}
              />

              <label htmlFor="bulkInviteNote">Note</label>
              <input
                id="bulkInviteNote"
                value={bulkNote}
                onChange={(event) => setBulkNote(event.target.value)}
                placeholder="Optional note"
              />

              <Button
                className="adminPrimaryButton"
                type="submit"
                disabled={isSubmitting}
              >
                Create bulk invites
              </Button>
            </form>

            <section className="adminPanel adminPanelWide">
              <div className="adminPanelHeader">
                <div>
                  <p className="adminEyebrow">Latest output</p>
                  <h2>Generated invite codes</h2>
                </div>
              </div>
              <div className="adminTableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>Invite ID</th>
                      <th>Email</th>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestInvites.length ? (
                      latestInvites.map((invite) => (
                        <tr key={`${invite.id}-${invite.email}`}>
                          <td>{invite.id}</td>
                          <td>{invite.email}</td>
                          <td className="adminMonoCell">{invite.code || ""}</td>
                          <td>{invite.status}</td>
                          <td>{formatDate(invite.expiresAt)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5}>
                          Generated codes appear here once at creation time.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="adminPanel adminPanelWide">
              <div className="adminPanelHeader">
                <div>
                  <p className="adminEyebrow">Registry</p>
                  <h2>Existing invites</h2>
                </div>
                <Button
                  className="adminGhostButton"
                  onClick={() => void refreshInvites()}
                  disabled={isSubmitting}
                >
                  Reload list
                </Button>
              </div>
              <div className="adminTableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>Invite ID</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Expires</th>
                      <th>Accepted</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inviteRows.map((invite) => (
                      <tr key={invite.id}>
                        <td>{invite.id}</td>
                        <td>{invite.email}</td>
                        <td>{invite.status}</td>
                        <td>{formatDate(invite.createdAt)}</td>
                        <td>{formatDate(invite.expiresAt)}</td>
                        <td>{formatDate(invite.acceptedAt)}</td>
                        <td>{invite.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  );
};

export default AdministrationPage;
