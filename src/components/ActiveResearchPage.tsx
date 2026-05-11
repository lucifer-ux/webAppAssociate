import "../componentStyling/HomeDashboardStyling.css";
import { useState } from "react";
import { BookOpen, FilePlus2, ShieldCheck } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import ActiveResearch from "./ActiveResearch";

export type RecentResearchItem = {
  id: string;
  query: string;
  createdAt: string;
};

const ActiveResearchPage = () => {
  const [isSideBarCollapsed, setIsSideBarCollapsed] = useState(false);
  const [recentResearches, setRecentResearches] = useState<RecentResearchItem[]>([]);
  const [activeResearchId, setActiveResearchId] = useState<string | null>(null);

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
        onSelectResearch={setActiveResearchId}
      />

      <nav className="rightToolsRail">
        <button className="toolRailItem" type="button">
          <BookOpen size={18} />
          <span>Files</span>
        </button>
        <button className="toolRailItem" type="button">
          <FilePlus2 size={18} />
          <span>Playbook</span>
        </button>
        <button className="toolRailItem" type="button">
          <ShieldCheck size={18} />
          <span>Compliance</span>
        </button>
      </nav>

      <main
        className={`homeDashMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <ActiveResearch
          activeSection="activeResearch"
          recentResearches={recentResearches}
          activeResearchId={activeResearchId}
          onRecentResearchesChange={setRecentResearches}
          onActiveResearchChange={setActiveResearchId}
        />
      </main>
    </div>
  );
};

export default ActiveResearchPage;
