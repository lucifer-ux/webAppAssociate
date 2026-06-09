import "../componentStyling/HomeDashboardStyling.css";
import { useState } from "react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import MatterSection from "./MatterSection";
import RightSidebar from "./RightSidebar";
import Loader from "./Loader";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";

const MatterPage = () => {
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const { activeMatter, isSavedMattersLoading } = useMatterStore();
  const [conversationOpenRequest, setConversationOpenRequest] = useState(0);

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
        onOpenConversation={() =>
          setConversationOpenRequest((request) => request + 1)
        }
      />

      <main
        className={`homeDashMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <MatterSection conversationOpenRequest={conversationOpenRequest} />
      </main>
    </div>
  );
};

export default MatterPage;
