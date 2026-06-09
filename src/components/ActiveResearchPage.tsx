import "../componentStyling/HomeDashboardStyling.css";
import Button from "./Button";
import { useMemo, useState } from "react";
import { BookOpen, MessagesSquare, ShieldCheck } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import ActiveResearch from "./ActiveResearch";
import type { SavedResearchApiItem } from "./ActiveResearch";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useLocation } from "react-router-dom";

export type RecentResearchItem = {
  id: string;
  query: string;
  createdAt: string;
};

const ActiveResearchPage = () => {
  const location = useLocation();
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const navState = useMemo(
    () =>
      (location.state as
        | {
            preloadedResearches?: Array<{
              id: SavedResearchApiItem["id"];
              query: SavedResearchApiItem["query"];
              createdAt: SavedResearchApiItem["createdAt"];
              intakePayload: SavedResearchApiItem["intakePayload"];
              finalPayload: SavedResearchApiItem["finalPayload"];
              selectedLaneId: SavedResearchApiItem["selectedLaneId"];
              clarificationAnswer: SavedResearchApiItem["clarificationAnswer"];
            }>;
            initialActiveResearchId?: string | null;
            startFreshResearch?: boolean;
          }
        | null) || null,
    [location.state],
  );
  const [recentResearches, setRecentResearches] = useState<RecentResearchItem[]>(
    () =>
      (navState?.preloadedResearches || []).map((item) => ({
        id: item.id,
        query: item.query,
        createdAt: item.createdAt,
      })),
  );
  const [activeResearchId, setActiveResearchId] = useState<string | null>(
    () =>
      navState?.startFreshResearch
        ? null
        : navState?.initialActiveResearchId || navState?.preloadedResearches?.[0]?.id || null,
  );
  const [isStartingFreshResearch, setIsStartingFreshResearch] = useState(
    () => Boolean(navState?.startFreshResearch),
  );
  const [conversationOpenRequest, setConversationOpenRequest] = useState(0);

  const handleSelectResearch = (id: string | null) => {
    setIsStartingFreshResearch(false);
    setActiveResearchId(id);
  };

  const handleStartResearch = () => {
    setIsStartingFreshResearch(true);
    setActiveResearchId(null);
  };

  return (
    <div className="homeDashPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
      />

      <SideBar
        isCollapsed={isSideBarCollapsed}
        activeSection="activeResearch"
        recentResearches={recentResearches}
        activeResearchId={activeResearchId}
        onSelectResearch={handleSelectResearch}
        onStartResearch={handleStartResearch}
      />

      <nav className="rightToolsRail">
        <Button className="toolRailItem" type="button">
          <BookOpen size={18} />
          <span>Files</span>
        </Button>
        <Button
          className="toolRailItem"
          type="button"
          onClick={() =>
            setConversationOpenRequest((request) => request + 1)
          }
        >
          <MessagesSquare size={18} />
          <span>Conversation</span>
        </Button>
        <Button className="toolRailItem" type="button">
          <ShieldCheck size={18} />
          <span>Compliance</span>
        </Button>
      </nav>

      <main
        className={`homeDashMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <ActiveResearch
          activeSection="activeResearch"
          recentResearches={recentResearches}
          activeResearchId={activeResearchId}
          onRecentResearchesChange={setRecentResearches}
          onActiveResearchChange={handleSelectResearch}
          initialResearches={(navState?.preloadedResearches || []) as SavedResearchApiItem[]}
          isStartingFreshResearch={isStartingFreshResearch}
          conversationOpenRequest={conversationOpenRequest}
        />
      </main>
    </div>
  );
};

export default ActiveResearchPage;
