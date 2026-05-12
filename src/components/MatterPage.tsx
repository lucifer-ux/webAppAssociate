import "../componentStyling/HomeDashboardStyling.css";
import { useState } from "react";
import { BookOpen, FilePlus2, ShieldCheck } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import MatterSection from "./MatterSection";

const MatterPage = () => {
  const [isSideBarCollapsed, setIsSideBarCollapsed] = useState(false);

  return (
    <div className="homeDashPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
      />

      <SideBar isCollapsed={isSideBarCollapsed} activeSection="matterLibrary" />

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
        <MatterSection />
      </main>
    </div>
  );
};

export default MatterPage;
