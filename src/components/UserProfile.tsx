import "../componentStyling/UserProfile.css";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import { useAuth } from "../context/AuthContext";
import { X } from "lucide-react";

type UserProfileProps = {
  isOpen: boolean;
  onClose: () => void;
};

const UserProfile = ({ isOpen, onClose }: UserProfileProps) => {
  const { user, logout } = useAuth();
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="userProfileOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Profile and plan details"
      onClick={onClose}
    >
      <div
        className="userProfileModal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="userProfileHead">
          <strong>Profile & Plan</strong>
          <Button
            type="button"
            className="userProfileCloseBtn"
            onClick={onClose}
            aria-label="Close profile dialog"
            showImage
            image={<X size={18} />}
          />
        </div>

        <div className="userProfilePlanChip">Free Plan</div>

        <section className="userProfileSection">
          <h4>Signed in as</h4>
          <p className="userProfileIdentityName">
            {user?.displayName || user?.fullName || "Associate user"}
          </p>
          <p className="userProfileIdentityEmail">
            {user?.email || "No email available"}
          </p>
        </section>

        <section className="userProfileSection userProfileMetricSection">
          <h4>AI Calls</h4>
          <div className="userProfileMetricRow">
            <span>Research pipeline calls</span>
            <strong>12</strong>
          </div>
          <div className="userProfileMetricRow">
            <span>Matter extraction calls</span>
            <strong>9</strong>
          </div>
          <div className="userProfileMetricRow">
            <span>Drafting assistance calls</span>
            <strong>6</strong>
          </div>
        </section>

        <section className="userProfileSection">
          <h4>Sharing</h4>
          <p className="userProfileInlineMeta">
            Shared to user: <span>You</span>
          </p>
          <p className="userProfileInlineMeta">
            Organization: <span className="isMuted">Not added</span>
          </p>
        </section>

        <section className="userProfileSection">
          <h4>Team Plan Status</h4>
          <p className="userProfileStatusCard">
            All users are currently on Free plan.
          </p>
        </section>

        <div className="userProfileFooter">
          <Button
            type="button"
            className="userProfileUpgradeBtn"
            onClick={() => {
              void logout();
              onClose();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default UserProfile;
