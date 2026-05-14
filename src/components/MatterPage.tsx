import "../componentStyling/HomeDashboardStyling.css";
import { useState } from "react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import MatterSection from "./MatterSection";
import RightSidebar from "./RightSidebar";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";

type RightPanel = "obligations" | "playbook" | null;

const MatterPage = () => {
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const { activeMatter, getPendingRedlineCount } = useMatterStore();
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanel>(null);
  const pendingRedlineCount = activeMatter
    ? getPendingRedlineCount(activeMatter.id)
    : 0;
  const handleTogglePanel = (panel: Exclude<RightPanel, null>) => {
    setActiveRightPanel((prev: RightPanel) => (prev === panel ? null : panel));
  };

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
