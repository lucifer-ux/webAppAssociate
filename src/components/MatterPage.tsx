import "../componentStyling/HomeDashboardStyling.css";
import { useState } from "react";
import ProductNavbar from "./ProductNavbar";
import MatterSection from "./MatterSection";
import RightSidebar from "./RightSidebar";
import Loader from "./Loader";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";
import "../componentStyling/TerraMatterWorkspace.css";

const MatterPage = () => {
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const {
    activeMatter,
    activeMatterId,
    isSavedMattersLoading,
    matters,
    setActiveMatterId,
  } = useMatterStore();
  const [conversationOpenRequest, setConversationOpenRequest] = useState(0);

  const openMatterUploader = () => {
    setActiveMatterId(null);
    sessionStorage.setItem("open_matter_uploader", "1");
    window.dispatchEvent(new Event("matter-uploader:open"));
  };

  if (isSavedMattersLoading && !activeMatter) {
    return (
      <div className="homeDashPage terraMatterPage">
        <ProductNavbar
          isSideBarCollapsed={isSideBarCollapsed}
          onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
        />
        <div className="productPageLoaderSurface">
          <Loader
            eyebrow="Matter Library"
            title="Loading Saved Matters"
            message="Preparing your saved matter workspace."
            stage="Hydrating saved matters from storage"
            progress={42}
            mode="inline"
            steps={[
              "Connecting to saved matter store",
              "Loading saved matters",
              "Preparing matter workspace",
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="homeDashPage terraMatterPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
      />

      <aside
        className={`terraMatterSidebar ${isSideBarCollapsed ? "collapsed" : ""}`}
        aria-label="Matters added"
      >
        <div className="terraMatterSidebarHead">
          <div>
            <h2>Associate AI</h2>
            <p>Senior Counsel</p>
          </div>
          <button
            type="button"
            className="terraMatterAddBtn"
            onClick={openMatterUploader}
          >
            <span aria-hidden="true">+</span>
            <strong>Add New Matter</strong>
          </button>
        </div>

        <div className="terraMatterListBlock">
          <p className="terraMatterListLabel">Matters Added</p>
          {matters.length ? (
            <div className="terraMatterList">
              {matters.map((matter) => {
                const documentCount =
                  matter.document_count ?? matter.documents?.length ?? 0;
                const isActive = matter.id === activeMatterId;

                return (
                  <button
                    key={matter.id}
                    type="button"
                    className={`terraMatterItem ${isActive ? "active" : ""}`}
                    onClick={() => setActiveMatterId(matter.id)}
                    title={matter.title}
                  >
                    <span className="terraMatterItemTitle">
                      {matter.title}
                    </span>
                    <span className="terraMatterItemMeta">
                      {matter.version > 1 ? `v${matter.version} · ` : ""}
                      {documentCount || 1}{" "}
                      {(documentCount || 1) === 1 ? "document" : "documents"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              className="terraMatterEmptyItem"
              onClick={openMatterUploader}
            >
              Add your first matter
            </button>
          )}
        </div>
      </aside>

      <RightSidebar
        onOpenConversation={() =>
          setConversationOpenRequest((request) => request + 1)
        }
      />

      <main
        className={`homeDashMain terraMatterMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <MatterSection conversationOpenRequest={conversationOpenRequest} />
      </main>
    </div>
  );
};

export default MatterPage;
