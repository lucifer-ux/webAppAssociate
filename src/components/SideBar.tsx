import "../componentStyling/SideBar.css";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Gavel, HelpCircle } from "lucide-react";
import type { RecentResearchItem } from "./ActiveResearchPage";

export type RecentMatterItem = {
  id: string;
  title: string;
};

type SideBarProps = {
  isCollapsed: boolean;
  activeSection: "matterLibrary" | "activeResearch" | "drafting";
  recentMatters?: RecentMatterItem[];
  recentResearches?: RecentResearchItem[];
  activeMatterId?: string | null;
  activeResearchId?: string | null;
  onSelectMatter?: (id: string) => void;
  onSelectResearch?: (id: string) => void;
};

const SideBar = ({
  isCollapsed,
  recentMatters = [],
  recentResearches = [],
  activeMatterId = null,
  activeResearchId = null,
  onSelectMatter,
  onSelectResearch,
}: SideBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const isDraftingRoute = location.pathname === "/dashboard/drafting";
  const isActiveResearchRoute = location.pathname === "/dashboard/active-research";

  const [isRecentResearchesOpen, setIsRecentResearchesOpen] = useState(true);

  const hasRecentResearches = recentResearches.length > 0;
  const hasRecentMatters = recentMatters.length > 0;

  useEffect(() => {
    if (location.pathname !== "/dashboard") {
      return;
    }

    const shouldOpenUploader = sessionStorage.getItem("open_matter_uploader");
    if (shouldOpenUploader !== "1") {
      return;
    }

    sessionStorage.removeItem("open_matter_uploader");
    uploaderRef.current?.click();
  }, [location.pathname]);

  return (
    <nav
      className={`leftRail ${isCollapsed ? "collapsed" : ""} ${isDraftingRoute ? "draftingRoute" : ""}`}
    >
      <input
        ref={uploaderRef}
        type="file"
        className="matterUploaderInput"
        aria-label="Upload matter file"
      />

      {isActiveResearchRoute && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Recent researches</h3>
            <button
              type="button"
              className="recentMatterAddBtn"
              aria-label={
                hasRecentResearches ? "Toggle recent researches" : "Open research"
              }
              onClick={() => {
                if (hasRecentResearches) {
                  setIsRecentResearchesOpen((prev) => !prev);
                } else {
                  navigate("/dashboard/active-research");
                }
              }}
            >
              {hasRecentResearches ? (
                isRecentResearchesOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )
              ) : (
                "+"
              )}
            </button>
          </div>

          {!hasRecentResearches && (
            <button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={() => navigate("/dashboard/active-research")}
            >
              No research yet.
            </button>
          )}

          {hasRecentResearches && isRecentResearchesOpen && (
            <div className="recentItemsList">
              {recentResearches.map((research) => (
                <button
                  key={research.id}
                  type="button"
                  className={`recentMatterItem ${research.id === activeResearchId ? "active" : ""}`}
                  onClick={() => onSelectResearch?.(research.id)}
                >
                  <span className="recentItemTitle">{research.query}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="recentSectionBlock">
        <div className="recentSectionHead">
          <h3>Matters added</h3>
        </div>

        {!hasRecentMatters && (
          <button
            type="button"
            className="matterAddTile"
            aria-label="Upload a matter"
            onClick={() => uploaderRef.current?.click()}
          >
            <span className="matterAddPlus">+</span>
          </button>
        )}

        {hasRecentMatters && (
          <div className="recentItemsList">
            {recentMatters.map((matter) => (
              <button
                key={matter.id}
                type="button"
                className={`recentMatterItem ${matter.id === activeMatterId ? "active" : ""}`}
                onClick={() => onSelectMatter?.(matter.id)}
              >
                <span className="recentItemTitle">{matter.title}</span>
              </button>
            ))}
          </div>
        )}
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
