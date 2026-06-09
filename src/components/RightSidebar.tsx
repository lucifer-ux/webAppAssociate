import { MessagesSquare } from "lucide-react";
import Button from "./Button";

type RightSidebarProps = {
  onOpenConversation: () => void;
};

const RightSidebar = ({ onOpenConversation }: RightSidebarProps) => (
  <nav className="rightToolsRail">
    <Button
      className="toolRailItem"
      type="button"
      onClick={onOpenConversation}
    >
      <MessagesSquare size={18} />
      <span>Conversation</span>
    </Button>
  </nav>
);

export default RightSidebar;
