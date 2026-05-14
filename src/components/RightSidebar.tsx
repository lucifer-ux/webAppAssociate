import { FilePlus2, Scale } from "lucide-react";
import Button from "./Button";

type RightPanelType = "obligations" | "playbook" | null;

type RightSidebarProps = {
  activeRightPanel: RightPanelType;
  onTogglePanel: (panel: Exclude<RightPanelType, null>) => void;
  pendingRedlineCount: number;
};

const RightSidebar = ({
  activeRightPanel,
  onTogglePanel,
  pendingRedlineCount,
}: RightSidebarProps) => (
  <nav className="rightToolsRail">
    <Button
      className={`toolRailItem ${activeRightPanel === "playbook" ? "active" : ""}`}
      type="button"
      onClick={() => onTogglePanel("playbook")}
    >
      <FilePlus2 size={18} />
      <span>Playbook</span>
      {pendingRedlineCount > 0 ? (
        <em className="toolRailBadge">{pendingRedlineCount}</em>
      ) : null}
    </Button>
    <Button
      className={`toolRailItem ${activeRightPanel === "obligations" ? "active" : ""}`}
      type="button"
      onClick={() => onTogglePanel("obligations")}
    >
      <Scale size={18} />
      <span>Obligations</span>
    </Button>
  </nav>
);

export default RightSidebar;
