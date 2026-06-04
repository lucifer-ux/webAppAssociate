import "../componentStyling/SideBar.css";
import Button from "./Button";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { RecentResearchItem } from "./ActiveResearchPage";
import { useMatterStore } from "../context/MatterStoreContext";
import { listDrafts, type DraftSummary } from "./draftingApi";

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
  onStartResearch?: () => void;
};

const getCollapsedMatterLabel = (title: string) => {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) return "MAT";
  return normalized.slice(0, 3);
};

const getResearchSectionTitle = (query: string) => {
  const normalized = String(query || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Related matter";

  const firstClause =
    normalized.split(/[?.!,:;-]/).find((part) => part.trim()) || normalized;
  const words = firstClause
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const shortTitle = words.slice(0, 4).join(" ");
  if (!shortTitle) return "Related matter";
  return shortTitle.length > 32 ? `${shortTitle.slice(0, 29)}...` : shortTitle;
};

const getCollapsedResearchLabel = (query: string) => {
  const title = getResearchSectionTitle(query);
  const compact = title.replace(/[^a-zA-Z0-9]/g, "");
  if (!compact) return "RES";
  return compact.slice(0, 4).toUpperCase();
};

const SideBar = ({
  isCollapsed,
  recentMatters = [],
  recentResearches = [],
  activeMatterId = null,
  activeResearchId = null,
  onSelectMatter,
  onSelectResearch,
  onStartResearch,
}: SideBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isDraftingRoute =
    location.pathname === "/dashboard/drafting" ||
    location.pathname === "/drafting" ||
    location.pathname === "/draft";
  const isActiveResearchRoute =
    location.pathname === "/dashboard/active-research";
  const isMatterRoute = location.pathname === "/matter" || location.pathname === "/dashboard";
  const showResearchSection = isActiveResearchRoute;
  const showMatterSection = isMatterRoute;
  const showDraftSection = isDraftingRoute;
  const {
    matters,
    activeMatterId: storeActiveMatterId,
    isSavedMattersLoading,
    setActiveMatterId,
  } = useMatterStore();

  const [isRecentResearchesOpen, setIsRecentResearchesOpen] = useState(true);
  const [draftTabs, setDraftTabs] = useState<DraftSummary[]>([]);

  const hasRecentResearches = recentResearches.length > 0;
  const activeResearchItem =
    recentResearches.find((item) => item.id === activeResearchId) ||
    recentResearches[0] ||
    null;
  const researchSectionTitle = getResearchSectionTitle(
    activeResearchItem?.query || "",
  );
  const visibleMatters = [
    ...matters.map((matter) => ({
      id: matter.id,
      title:
        matter.version > 1
          ? `${matter.title} (v${matter.version})`
          : matter.title,
    })),
    ...recentMatters,
  ].filter(
    (matter, index, arr) =>
      arr.findIndex((item) => item.id === matter.id) === index,
  );
  const hasRecentMatters = visibleMatters.length > 0;

  useEffect(() => {
    if (!showDraftSection) return;
    let cancelled = false;

    void listDrafts()
      .then((drafts) => {
        if (cancelled) return;
        setDraftTabs(drafts);
      })
      .catch(() => {
        if (cancelled) return;
        setDraftTabs([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showDraftSection]);

  const openMatterUploader = () => {
    sessionStorage.setItem("open_matter_uploader", "1");
    window.dispatchEvent(new Event("matter-uploader:open"));
    navigate("/matter");
  };

  const startNewResearch = () => {
    onStartResearch?.();
    navigate("/dashboard/active-research");
  };

  return (
    <nav
      className={`leftRail ${isCollapsed ? "collapsed" : ""} ${isDraftingRoute ? "draftingRoute" : ""}`}
    >
      {showResearchSection && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3 title={activeResearchItem?.query || researchSectionTitle}>
              {researchSectionTitle}
            </h3>
            <div className="recentSectionActions">
              <Button
                type="button"
                className="recentMatterAddBtn"
                aria-label="Toggle recent researches"
                onClick={() => {
                  if (hasRecentResearches) {
                    setIsRecentResearchesOpen((prev) => !prev);
                  }
                }}
                disabled={!hasRecentResearches}
                showImage={hasRecentResearches}
                image={
                  isRecentResearchesOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )
                }
              />
              <Button
                type="button"
                className="recentMatterAddBtn"
                aria-label="Start a new research"
                onClick={startNewResearch}
              >
                +
              </Button>
            </div>
          </div>

          {!hasRecentResearches && (
            <Button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={startNewResearch}
            >
              No research yet.
            </Button>
          )}

          {hasRecentResearches && isRecentResearchesOpen && (
            <div className="recentItemsList">
              {recentResearches.map((research) => (
                <Button
                  key={research.id}
                  type="button"
                  className={`recentMatterItem ${research.id === activeResearchId ? "active" : ""}`}
                  onClick={() => {
                    onSelectResearch?.(research.id);
                    if (location.pathname !== "/dashboard/active-research") {
                      navigate("/dashboard/active-research");
                    }
                  }}
                >
                  <span className="recentItemTitle">{research.query}</span>
                </Button>
              ))}
            </div>
          )}

          {isCollapsed && hasRecentResearches && (
            <div className="collapsedActiveMatterList" aria-label="Active researches">
              {recentResearches.slice(0, 4).map((research) => (
                <Button
                  key={research.id}
                  type="button"
                  className="collapsedActiveMatterWord"
                  title={research.query}
                  onClick={() => {
                    onSelectResearch?.(research.id);
                    navigate("/dashboard/active-research");
                  }}
                >
                  {getCollapsedResearchLabel(research.query)}
                </Button>
              ))}
            </div>
          )}

          <Button
            type="button"
            className="researchStartTile"
            onClick={startNewResearch}
          >
            <span className="researchStartPlus">+</span>
            <span className="researchStartLabel">Start a new research</span>
          </Button>
        </div>
      )}

      {showMatterSection && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Matters added</h3>
          </div>

          {hasRecentMatters && (
            <div className="recentItemsList matterRecentList">
              {visibleMatters.map((matter) => (
                <Button
                  key={matter.id}
                  type="button"
                  className={`recentMatterItem matterRecentItem ${
                    matter.id === activeMatterId ||
                    matter.id === storeActiveMatterId
                      ? "active"
                      : ""
                  }`}
                  title={matter.title}
                  onClick={() => {
                    setActiveMatterId(matter.id);
                    onSelectMatter?.(matter.id);
                    if (location.pathname !== "/matter") {
                      navigate("/matter");
                    }
                  }}
                >
                  <span className="recentItemCompact" aria-hidden="true">
                    {getCollapsedMatterLabel(matter.title)}
                  </span>
                  <span className="recentItemTitle">{matter.title}</span>
                </Button>
              ))}
            </div>
          )}

          {!hasRecentMatters && !isSavedMattersLoading && (
            <Button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={openMatterUploader}
            >
              No matters yet.
            </Button>
          )}

          <Button
            type="button"
            className="matterAddTile matterAddTileSecondary"
            aria-label="Upload another matter"
            onClick={openMatterUploader}
          >
            <span className="matterAddPlus">+</span>
          </Button>
        </div>
      )}

      {showDraftSection && (
        <div className="recentSectionBlock">
          <div className="recentSectionHead">
            <h3>Active drafts</h3>
          </div>

          {draftTabs.length > 0 ? (
            <div className="recentItemsList">
              {draftTabs.map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  className="recentMatterItem"
                  onClick={() => navigate(`/dashboard/drafting?draft=${encodeURIComponent(tab.id)}`)}
                  title={tab.title}
                >
                  <span className="recentItemTitle">{tab.title}</span>
                </Button>
              ))}
            </div>
          ) : (
            <Button
              type="button"
              className="recentMatterItem isEmpty"
              onClick={() => navigate("/dashboard/drafting")}
            >
              No active drafts.
            </Button>
          )}
        </div>
      )}
    </nav>
  );
};

export default SideBar;
