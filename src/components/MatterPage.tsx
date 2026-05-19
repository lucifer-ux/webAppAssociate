import "../componentStyling/HomeDashboardStyling.css";
import { useState } from "react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import MatterSection from "./MatterSection";
import RightSidebar from "./RightSidebar";
import Loader from "./Loader";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";

type RightPanel = "obligations" | "playbook" | null;

const MatterPage = () => {
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const { activeMatter, isSavedMattersLoading, getPendingRedlineCount } =
    useMatterStore();
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanel>(null);
  const pendingRedlineCount = activeMatter
    ? getPendingRedlineCount(activeMatter.id)
    : 0;
  const handleTogglePanel = (panel: Exclude<RightPanel, null>) => {
    setActiveRightPanel((prev: RightPanel) => (prev === panel ? null : panel));
  };

  if (isSavedMattersLoading && !activeMatter) {
    return (
      <Loader
        eyebrow="Matter Library"
        title="Loading Saved Matters"
        message="Preparing your saved matter workspace."
        stage="Hydrating saved matters from storage"
        progress={42}
        steps={[
          "Connecting to saved matter store",
          "Loading saved matters",
          "Preparing matter workspace",
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

      <RightSidebar
        activeRightPanel={activeRightPanel}
        onTogglePanel={handleTogglePanel}
        pendingRedlineCount={pendingRedlineCount}
      />

      <main
        className={`homeDashMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""} ${
          activeRightPanel ? "withRightPanel" : ""
        }`}
      >
        <MatterSection
          isObligationPanelOpen={activeRightPanel === "obligations"}
          isPlaybookPanelOpen={activeRightPanel === "playbook"}
          onCloseObligationPanel={() => setActiveRightPanel(null)}
          onClosePlaybookPanel={() => setActiveRightPanel(null)}
        />
      </main>
    </div>
  );
};

export default MatterPage;
