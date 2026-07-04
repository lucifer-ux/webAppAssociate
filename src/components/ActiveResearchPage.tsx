import "../componentStyling/HomeDashboardStyling.css";
import Button from "./Button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ShieldCheck } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import ActiveResearch from "./ActiveResearch";
import type { SavedResearchApiItem } from "./ActiveResearch";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useLocation } from "react-router-dom";
import "../componentStyling/TerraMatterWorkspace.css";
import "../componentStyling/TerraResearch.css";

export type RecentResearchItem = {
  id: string;
  query: string;
  createdAt: string;
};

const ActiveResearchPage = () => {
  const location = useLocation();
  const queryResearchId = useMemo(
    () => new URLSearchParams(location.search).get("research"),
    [location.search],
  );
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
        : queryResearchId ||
          navState?.initialActiveResearchId ||
          navState?.preloadedResearches?.[0]?.id ||
          null,
  );
  const [isStartingFreshResearch, setIsStartingFreshResearch] = useState(
    () => Boolean(navState?.startFreshResearch),
  );

  useEffect(() => {
    if (!queryResearchId) return;
    setIsStartingFreshResearch(false);
    setActiveResearchId(queryResearchId);
  }, [queryResearchId]);

  const handleSelectResearch = useCallback((id: string | null) => {
    setIsStartingFreshResearch(false);
    setActiveResearchId(id);
  }, []);

  const handleStartResearch = () => {
    setIsStartingFreshResearch(true);
    setActiveResearchId(null);
  };

  return (
    <div className="homeDashPage terraMatterPage terraResearchPage">
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
        <Button className="toolRailItem" type="button">
          <ShieldCheck size={18} />
          <span>Compliance</span>
        </Button>
      </nav>

      <main
        className={`homeDashMain terraMatterMain terraResearchMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <ActiveResearch
          activeSection="activeResearch"
          recentResearches={recentResearches}
          activeResearchId={activeResearchId}
          onRecentResearchesChange={setRecentResearches}
          onActiveResearchChange={handleSelectResearch}
          initialResearches={(navState?.preloadedResearches || []) as SavedResearchApiItem[]}
          isStartingFreshResearch={isStartingFreshResearch}
        />
      </main>
    </div>
  );
};

export default ActiveResearchPage;
