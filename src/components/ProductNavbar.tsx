import "../componentStyling/productNavbar.css";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bell,
  Bolt,
  ChevronDown,
  Highlighter,
  Home,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MessageSquare,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Redo2,
  Search,
  Settings,
  Share2,
  Underline,
  Undo2,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AccessRole, ParagraphStyle, ZoomLevel } from "./DraftingDocument";

type DraftingChromeProps = {
  documentTitle: string;
  onDocumentTitleChange: (value: string) => void;
  currentRole: AccessRole;
  requestEditPending: boolean;
  onRequestEdit: () => void;
  zoomLevel: ZoomLevel;
  onZoomChange: (value: ZoomLevel) => void;
  paragraphStyle: ParagraphStyle;
  onParagraphStyleChange: (value: ParagraphStyle) => void;
  fontFamily: string;
  fontFamilies: string[];
  onFontFamilyChange: (value: string) => void;
  fontSize: number;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
  colorChoices: string[];
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onHighlight: () => void;
  onSetTextColor: (color: string) => void;
  onInsertLink: () => void;
  onInsertImage: () => void;
  onOpenCommentComposer: () => void;
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignJustify: () => void;
  onBulletList: () => void;
  onNumberList: () => void;
  onOutdent: () => void;
  onIndent: () => void;
};

type ProductNavbarProps = {
  isSideBarCollapsed: boolean;
  onToggleSidebar: () => void;
  draftingChrome?: DraftingChromeProps;
};

const ProductNavbar = ({
  isSideBarCollapsed,
  onToggleSidebar,
  draftingChrome,
}: ProductNavbarProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showTopSearch = pathname === "/dashboard";
  const isDraftingRoute = pathname === "/dashboard/drafting" && draftingChrome;

  if (isDraftingRoute) {
    const roleLabel =
      draftingChrome.currentRole === "editor" ? "Editor access" : "View access";

    return (
      <header className="homeDashTopBar draftingChromeBar">
        <div className="draftChromePrimaryRow">
          <div className="topBarLeft">
            <button
              className="iconBtn sidebarToggleBtn"
              type="button"
              aria-label={isSideBarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleSidebar}
            >
              {isSideBarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <button
              type="button"
              className="iconBtn topBarHomeBtn"
              aria-label="Go to dashboard home"
              onClick={() => navigate("/dashboard")}
            >
              <Home size={18} />
            </button>
            <div className="draftChromeTitleBlock">
              <input
                className="draftChromeTitleInput"
                value={draftingChrome.documentTitle}
                onChange={(event) => draftingChrome.onDocumentTitleChange(event.target.value)}
                aria-label="Document title"
              />
              <span className="draftChromeSaved">Saved to Associate Drive</span>
            </div>
          </div>

          <div className="topBarRight draftingTopRight">
            <span className="draftRoleChip">{roleLabel}</span>
            {draftingChrome.currentRole === "viewer" && (
              <button
                type="button"
                className="draftRequestEditBtn"
                onClick={draftingChrome.onRequestEdit}
                disabled={draftingChrome.requestEditPending}
              >
                {draftingChrome.requestEditPending ? "Request sent" : "Request edit access"}
              </button>
            )}
            <button className="iconBtn" type="button" aria-label="Find">
              <Search size={18} />
            </button>
            <button
              className="iconBtn"
              type="button"
              aria-label="Open comment composer"
              onClick={draftingChrome.onOpenCommentComposer}
            >
              <MessageSquare size={18} />
            </button>
            <button className="draftingShareBtn navShare" type="button">
              <Share2 size={16} />
              Share
            </button>
          </div>
        </div>

        <div className="draftChromeMenuRow">
          {["File", "Edit", "View", "Insert", "Format", "Tools", "Extensions", "Help"].map(
            (item) => (
              <button key={item} type="button" className="draftingMenuBtn">
                {item}
              </button>
            ),
          )}
        </div>

        <div className="draftChromeToolbar">
          <div className="draftingToolbarGroup">
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onUndo}>
              <Undo2 size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onRedo}>
              <Redo2 size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onPrint}>
              <Printer size={16} />
            </button>
          </div>

          <div className="draftingToolbarGroup">
            <div className="toolbarSelectWrap small">
              <select
                value={draftingChrome.zoomLevel}
                onChange={(event) => draftingChrome.onZoomChange(event.target.value as ZoomLevel)}
              >
                <option value="80%">80%</option>
                <option value="100%">100%</option>
                <option value="125%">125%</option>
              </select>
              <ChevronDown size={14} />
            </div>

            <div className="toolbarSelectWrap">
              <select
                value={draftingChrome.paragraphStyle}
                onChange={(event) =>
                  draftingChrome.onParagraphStyleChange(event.target.value as ParagraphStyle)
                }
                disabled={draftingChrome.currentRole !== "editor"}
              >
                <option value="normal">Normal text</option>
                <option value="heading-1">Heading 1</option>
                <option value="heading-2">Heading 2</option>
                <option value="quote">Quote</option>
              </select>
              <ChevronDown size={14} />
            </div>

            <div className="toolbarSelectWrap">
              <select
                value={draftingChrome.fontFamily}
                onChange={(event) => draftingChrome.onFontFamilyChange(event.target.value)}
                disabled={draftingChrome.currentRole !== "editor"}
              >
                {draftingChrome.fontFamilies.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>

            <div className="toolbarSizeControl">
              <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onDecreaseFontSize}>
                <Minus size={14} />
              </button>
              <span>{draftingChrome.fontSize}</span>
              <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onIncreaseFontSize}>
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="draftingToolbarGroup">
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onBold}>
              <strong>B</strong>
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onItalic}>
              <Italic size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onUnderline}>
              <Underline size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onHighlight}>
              <Highlighter size={16} />
            </button>
            <div className="toolbarColorSwatches">
              {draftingChrome.colorChoices.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="toolbarColorBtn"
                  style={{ backgroundColor: color }}
                  onClick={() => draftingChrome.onSetTextColor(color)}
                  aria-label={`Set text color ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="draftingToolbarGroup">
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onInsertLink}>
              <LinkIcon size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onInsertImage}>
              <ImageIcon size={16} />
            </button>
            <button
              type="button"
              className="toolbarIconBtn"
              onClick={draftingChrome.onOpenCommentComposer}
            >
              <MessageSquare size={16} />
            </button>
          </div>

          <div className="draftingToolbarGroup">
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onAlignLeft}>
              <AlignLeft size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onAlignCenter}>
              <AlignCenter size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onAlignRight}>
              <AlignRight size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onAlignJustify}>
              <AlignJustify size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onBulletList}>
              <List size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onNumberList}>
              <ListOrdered size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onOutdent}>
              <IndentDecrease size={16} />
            </button>
            <button type="button" className="toolbarIconBtn" onClick={draftingChrome.onIndent}>
              <IndentIncrease size={16} />
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="homeDashTopBar">
      <div className="topBarLeft">
        <button
          className="iconBtn sidebarToggleBtn"
          type="button"
          aria-label={isSideBarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleSidebar}
        >
          {isSideBarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <button
          type="button"
          className="iconBtn topBarHomeBtn"
          aria-label="Go to dashboard home"
          onClick={() => navigate("/dashboard")}
        >
          <Home size={18} />
        </button>
        {showTopSearch && (
          <div className="searchWrap">
            <Search size={16} />
            <input type="text" placeholder="Search..." aria-label="Search" />
          </div>
        )}
      </div>

      <div className="topBarRight">
        <button className="iconBtn" type="button" aria-label="Lightning">
          <Bolt size={18} />
        </button>
        <button className="iconBtn" type="button" aria-label="Settings">
          <Settings size={18} />
        </button>
        <button className="iconBtn iconBtnWithDot" type="button" aria-label="Notifications">
          <Bell size={18} />
          <span className="notifyDot" />
        </button>
        <button className="avatarBtn" type="button" aria-label="Profile">
          <User size={16} />
        </button>
      </div>
    </header>
  );
};

export default ProductNavbar;
