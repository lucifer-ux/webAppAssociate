import "../componentStyling/UserProfile.css";
import { useEffect } from "react";
import Button from "./Button";
import { useAuth } from "../context/AuthContext";

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

  return (
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
          >
            ×
          </Button>
        </div>

        <div className="userProfilePlanChip">Free Plan</div>

        <section className="userProfileSection">
          <h4>Signed in as</h4>
          <p>{user?.displayName || user?.fullName || "Associate user"}</p>
          <p>{user?.email || "No email available"}</p>
        </section>

        <section className="userProfileSection">
          <h4>AI Calls</h4>
          <p>Research pipeline calls: 12</p>
          <p>Matter extraction calls: 9</p>
          <p>Drafting assistance calls: 6</p>
        </section>

        <section className="userProfileSection">
          <h4>Sharing</h4>
          <p>Shared to user: You</p>
          <p>Organization: Not added</p>
        </section>

        <section className="userProfileSection">
          <h4>Team Plan Status</h4>
          <p>All users are currently on Free plan.</p>
        </section>

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
  );
};

export default UserProfile;
