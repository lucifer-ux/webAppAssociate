import "../componentStyling/LoginSignUpPage.css";
import Button from "./Button";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildApiUrl } from "../lib/apiBase";

const LoginSignUpPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const googleAuth = query.get("googleAuth");
    const accessToken = query.get("accessToken");

    if (googleAuth === "success") {
      if (accessToken) {
        localStorage.setItem("auth_token", accessToken);
      }
      navigate("/dashboard", { replace: true });
    }
  }, [location.search, navigate]);

  const handleClick = () => {
    console.log("click");
  };

  const handleGoogleLogin = () => {
    window.location.href = buildApiUrl("/auth/google");
  };

  const handleSsoLogin = () => {
    navigate("/dashboard");
  };

  return (
    <div className="loginPage">
      <section className="loginSide">
        <div className="loginCard">
          <img src="/logo.jpeg" alt="Associate logo" className="loginLogo" />
          <p className="loginSubtitle">Secure access to the legal workspace.</p>

          <div className="formField">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="practitioner@firm.com" />
          </div>

          <div className="formField">
            <div className="passwordHeader">
              <label htmlFor="password">Password</label>
              <a href="#" className="forgotPasswordLink">
                Forgot Password?
              </a>
            </div>
            <input id="password" type="password" />
          </div>

          <Button className="signInButton" type="button" onClick={handleClick}>
            Sign In
          </Button>

          <div className="orDivider">
            <span>OR</span>
          </div>

          <Button className="ssoButton" type="button" onClick={handleSsoLogin}>
            Sign in with firm SSO
          </Button>

          <Button className="googleButton" type="button" onClick={handleGoogleLogin}>
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
