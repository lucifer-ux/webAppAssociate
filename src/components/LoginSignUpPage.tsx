import "../componentStyling/LoginSignUpPage.css";
import Button from "./Button";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LoginSignUpPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    loginWithGoogle,
    loginWithPassword,
    pendingInviteEmail,
    refreshPendingInvite,
    signupWithPassword,
    verifyInviteCode,
  } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInviteStep, setIsInviteStep] = useState(false);
  const query = new URLSearchParams(location.search);
  const authError = query.get("googleAuth") === "error"
    ? query.get("reason") || "Google sign in failed."
    : "";
  const inviteStatus = query.get("invite") || "";
  const inviteMessage =
    inviteStatus === "required" || inviteStatus === "missing"
      ? "This email is not invited to Associate."
      : inviteStatus === "expired"
        ? "Your invite has expired."
        : inviteStatus === "revoked"
          ? "This invite is no longer active."
          : "";

  useEffect(() => {
    if (inviteStatus === "pending") {
      setIsInviteStep(true);
      void refreshPendingInvite();
    }
  }, [inviteStatus, refreshPendingInvite]);

  const submitPasswordForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        await signupWithPassword(email, password, displayName, inviteCode);
      } else {
        await loginWithPassword(email, password);
      }
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const inviteError = error as Error & { requiresInvite?: boolean };
      if (inviteError.requiresInvite) {
        setIsInviteStep(true);
      }
      setFormError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitInviteForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    try {
      await verifyInviteCode(inviteCode);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Invite verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((current) => (current === "login" ? "signup" : "login"));
    setFormError("");
    setInviteCode("");
  };

  return (
    <div className="loginPage">
      <section className="loginSide">
        <div className="loginCard">
          <img src="/logo.jpeg" alt="Associate logo" className="loginLogo" />
          <p className="loginSubtitle">Secure access to the legal workspace.</p>

          {(authError || formError || inviteMessage) && (
            <p className="loginError">
              {(formError || authError || inviteMessage).replace(/_/g, " ")}
            </p>
          )}

          {isInviteStep ? (
            <form className="loginForm" onSubmit={submitInviteForm}>
              <div className="invitePrompt">
                <span>Invite required</span>
                <strong>{pendingInviteEmail || email || "Verified email"}</strong>
              </div>

              <div className="formField">
                <label htmlFor="inviteCode">Invite code</label>
                <input
                  id="inviteCode"
                  autoComplete="one-time-code"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="22-character code"
                  maxLength={22}
                  required
                />
              </div>

              <Button className="signInButton" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Verifying..." : "Unlock workspace"}
              </Button>

              <p className="loginModeSwitch">
                Need to use another email?
                <button
                  type="button"
                  onClick={() => {
                    setIsInviteStep(false);
                    setFormError("");
                    setInviteCode("");
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </form>
          ) : (
          <>
          <form className="loginForm" onSubmit={submitPasswordForm}>
            {mode === "signup" ? (
              <div className="formField">
                <label htmlFor="displayName">Name</label>
                <input
                  id="displayName"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
            ) : null}

            <div className="formField">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="formField">
              <div className="passwordHeader">
                <label htmlFor="password">Password</label>
              </div>
              <input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                minLength={8}
                required
              />
            </div>

            {mode === "signup" ? (
              <div className="formField">
                <label htmlFor="signupInviteCode">Invite code</label>
                <input
                  id="signupInviteCode"
                  autoComplete="one-time-code"
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="22-character code"
                  maxLength={22}
                  required
                />
              </div>
            ) : null}

            <Button className="signInButton" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait..."
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>

          <p className="loginModeSwitch">
            {mode === "signup" ? "Already have an account?" : "Need an account?"}
            <button type="button" onClick={toggleMode}>
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>

          <div className="orDivider">OR</div>

          <Button className="googleButton primaryGoogleButton" type="button" onClick={loginWithGoogle}>
            <svg className="googleIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.4 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.6-4.8 9.6-7.3 0-.5 0-.8-.1-1.2H12z"
              />
              <path
                fill="#34A853"
                d="M3.4 7.8l3.2 2.3C7.4 8 9.5 6.5 12 6.5c1.9 0 3.2.8 3.9 1.5l2.7-2.6C17 3.4 14.7 2.4 12 2.4c-3.7 0-6.9 2.1-8.6 5.4z"
              />
              <path
                fill="#FBBC05"
                d="M12 21.6c2.6 0 4.9-.9 6.5-2.5l-3-2.5c-.8.5-1.9.9-3.5.9-2.5 0-4.6-1.6-5.3-3.9l-3.1 2.4c1.7 3.3 5 5.6 8.4 5.6z"
              />
              <path
                fill="#4285F4"
                d="M21.6 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.5-1.2 2.8-2.5 3.7l3 2.5c1.8-1.7 3.6-4.1 3.6-8.5z"
              />
            </svg>
            <span>Continue with Google</span>
          </Button>
          </>
          )}

          <p className="loginFooter">© 2026 Associate. All Restricted Access.</p>
        </div>
      </section>

      <section className="loginVisual" aria-label="Login visual placeholder">
        <div className="visualOverlay" />
      </section>
    </div>
  );
};

export default LoginSignUpPage;
