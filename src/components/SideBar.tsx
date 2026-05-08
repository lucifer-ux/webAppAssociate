import "../componentStyling/SideBar.css";
import {
  BookOpen,
  FilePlus2,
  FolderOpenDot,
  Gavel,
  HelpCircle,
  Search,
  Sparkles,
} from "lucide-react";

type SideBarProps = {
  isCollapsed: boolean;
  activeSection: "matterLibrary" | "activeResearch";
  onSectionChange: (section: "matterLibrary" | "activeResearch") => void;
};

const SideBar = ({
  isCollapsed,
  activeSection,
  onSectionChange,
}: SideBarProps) => {
  return (
    <nav className={`leftRail ${isCollapsed ? "collapsed" : ""}`}>
      <div className="leftRailHead">
        <h2>MATTERS</h2>
        <p>Legal Workspace</p>
      </div>

      <div className="leftRailLinks">
        <button
          className={`railItem ${activeSection === "matterLibrary" ? "active" : ""}`}
          type="button"
          onClick={() => onSectionChange("matterLibrary")}
        >
          <FolderOpenDot size={18} />
          <span>Matter Library</span>
        </button>
        <button
          className={`railItem ${activeSection === "activeResearch" ? "active" : ""}`}
          type="button"
          onClick={() => onSectionChange("activeResearch")}
        >
          <Search size={18} />
          <span>Active Research</span>
        </button>
        <button className="railItem" type="button">
          <Sparkles size={18} />
          <span>Synthesis</span>
        </button>
        <button className="railItem" type="button">
          <FilePlus2 size={18} />
          <span>Drafting</span>
        </button>
        <button className="railItem" type="button">
          <BookOpen size={18} />
          <span>Archives</span>
        </button>
      </div>

      <div className="recentMattersBlock">
        <div className="recentMattersHead">
          <h3>Recent matters</h3>
          <button
            type="button"
            className="recentMatterAddBtn"
            aria-label="Add matter"
          >
            +
          </button>
        </div>
        <button type="button" className="recentMatterItem isEmpty">
          No matters yet. Add a matter.
        </button>
      </div>

      <div className="leftRailFoot">
        <button className="railItem small" type="button">
          <Gavel size={16} />
          <span>Compliance</span>
        </button>
        <button className="railItem small" type="button">
          <HelpCircle size={16} />
          <span>Help</span>
        </button>
      </div>
    </nav>
  );
};

export default SideBar;
