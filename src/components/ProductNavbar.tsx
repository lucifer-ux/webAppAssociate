import "../componentStyling/productNavbar.css";
import Button from "./Button";
import PricingModal from "./PricingModal";
import { useState, type MouseEvent } from "react";
import UserProfile from "./UserProfile";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
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
  Save,
  Search,
  Share2,
  Scale,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { AccessRole, ParagraphStyle, ZoomLevel } from "./draftingApi";

type DraftingChromeProps = {
  documentTitle: string;
  saveStatusLabel: string;
  onDocumentTitleChange: (value: string) => void;
  currentRole: AccessRole;
  requestEditPending: boolean;
  onRequestEdit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isBoldActive: boolean;
  isItalicActive: boolean;
  isUnderlineActive: boolean;
  isStrikeActive: boolean;
  isHighlightActive: boolean;
  isAlignLeftActive: boolean;
  isAlignCenterActive: boolean;
  isAlignRightActive: boolean;
  isAlignJustifyActive: boolean;
  isBulletListActive: boolean;
  isOrderedListActive: boolean;
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
  onFontSizeChange: (value: number) => void;
  colorChoices: string[];
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onStrike: () => void;
  onHighlight: () => void;
  onSetTextColor: (color: string) => void;
  onInsertLink: () => void;
  onInsertImage: () => void;
  onInsertTable: () => void;
  onOpenCommentComposer: () => void;
  onOpenFindReplace: () => void;
  onRunReview: () => void;
  onAlignLeft: () => void;
  onAlignCenter: () => void;
  onAlignRight: () => void;
  onAlignJustify: () => void;
  onBulletList: () => void;
  onNumberList: () => void;
  onOutdent: () => void;
  onIndent: () => void;
  onManualSave: () => void;
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
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sectionLinks = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Matters", path: "/matter" },
    { label: "Research", path: "/dashboard/active-research" },
    { label: "Drafting", path: "/dashboard/drafting" },
  ];

  const isDraftingRoute =
    (pathname === "/dashboard/drafting" || pathname === "/drafting" || pathname === "/draft") &&
    draftingChrome;
  const preserveSelectionOnToolbarMouseDown = (
    event: MouseEvent<HTMLElement>,
  ) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) {
      event.preventDefault();
    }
  };

  if (isDraftingRoute) {
    const roleLabel =
      draftingChrome.currentRole === "editor" ? "Editor access" : "View access";

    return (
      <>
        <header className="homeDashTopBar draftingChromeBar">
        <div className="draftChromePrimaryRow">
          <div className="topBarLeft">
            <Button
              className="iconBtn sidebarToggleBtn"
              type="button"
              aria-label={
                isSideBarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              onClick={onToggleSidebar}
              showImage
              image={
                isSideBarCollapsed ? (
                  <PanelLeftOpen size={18} />
                ) : (
                  <PanelLeftClose size={18} />
                )
              }
            />
            <Button
              type="button"
              className="iconBtn topBarHomeBtn"
              aria-label="Go to dashboard home"
              onClick={() => navigate("/dashboard")}
              showImage
              image={<Home size={18} />}
            />
            <div className="draftChromeTitleBlock">
              <input
                className="draftChromeTitleInput"
                value={draftingChrome.documentTitle}
                onChange={(event) =>
                  draftingChrome.onDocumentTitleChange(event.target.value)
                }
                aria-label="Document title"
              />
              <span className="draftChromeSaved">
                {draftingChrome.saveStatusLabel}
              </span>
            </div>
          </div>

          <div
            className="topBarRight draftingTopRight"
            onMouseDownCapture={preserveSelectionOnToolbarMouseDown}
          >
            <div className="sectionRouteNav">
              {sectionLinks.map((item) => (
                <Button
                  key={item.path}
                  type="button"
                  className={`sectionRouteBtn ${pathname === item.path ? "active" : ""}`}
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </Button>
              ))}
              <Button
                type="button"
                className="sectionRouteBtn"
                onClick={() => setIsPricingOpen(true)}
              >
                Pricing
              </Button>
            </div>
            <span className="draftRoleChip">{roleLabel}</span>
            {draftingChrome.currentRole === "viewer" && (
              <Button
                type="button"
                className="draftRequestEditBtn"
                onClick={draftingChrome.onRequestEdit}
                disabled={draftingChrome.requestEditPending}
              >
                {draftingChrome.requestEditPending
                  ? "Request sent"
                  : "Request edit access"}
              </Button>
            )}
            <Button
              className="iconBtn"
              type="button"
              aria-label="Find"
              onClick={draftingChrome.onOpenFindReplace}
              showImage
              image={<Search size={18} />}
            />
            <Button
              className="iconBtn"
              type="button"
              aria-label="Save draft"
              onClick={draftingChrome.onManualSave}
              showImage
              image={<Save size={18} />}
            />
            <Button
              className="iconBtn"
              type="button"
              aria-label="Run draft review"
              onClick={draftingChrome.onRunReview}
              showImage
              image={<Scale size={18} />}
            />
            <Button
              className="iconBtn"
              type="button"
              aria-label="Open comment composer"
              onClick={draftingChrome.onOpenCommentComposer}
              showImage
              image={<MessageSquare size={18} />}
            />
            <Button className="draftingShareBtn navShare" type="button">
              <Share2 size={16} />
              Share
            </Button>
          </div>
        </div>

        <div
          className="draftChromeMenuRow"
          onMouseDownCapture={preserveSelectionOnToolbarMouseDown}
        >
          {[
            "File",
            "Edit",
            "View",
            "Insert",
            "Format",
            "Tools",
            "Extensions",
            "Help",
          ].map((item) => (
            <Button
              key={item}
              type="button"
              className="draftingMenuBtn"
              onClick={
                item === "Tools"
                  ? draftingChrome.onOpenFindReplace
                  : item === "Insert"
                    ? draftingChrome.onInsertTable
                    : undefined
              }
            >
              {item}
            </Button>
          ))}
        </div>

        <div
          className="draftChromeToolbar"
          onMouseDownCapture={preserveSelectionOnToolbarMouseDown}
        >
          <div className="draftingToolbarGroup">
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Undo the last change"
              aria-label="Undo the last change"
              onClick={draftingChrome.onUndo}
              disabled={!draftingChrome.canUndo}
              showImage
              image={<Undo2 size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Redo the last undone change"
              aria-label="Redo the last undone change"
              onClick={draftingChrome.onRedo}
              disabled={!draftingChrome.canRedo}
              showImage
              image={<Redo2 size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Print this draft"
              aria-label="Print this draft"
              onClick={draftingChrome.onPrint}
              showImage
              image={<Printer size={16} />}
            />
          </div>

          <div className="draftingToolbarGroup">
            <div className="toolbarSelectWrap small">
              <select
                title="Change document zoom"
                aria-label="Change document zoom"
                value={draftingChrome.zoomLevel}
                onChange={(event) =>
                  draftingChrome.onZoomChange(event.target.value as ZoomLevel)
                }
              >
                <option value="80%">80%</option>
                <option value="100%">100%</option>
                <option value="125%">125%</option>
              </select>
              <ChevronDown size={14} />
            </div>

            <div className="toolbarSelectWrap">
              <select
                title="Change paragraph style"
                aria-label="Change paragraph style"
                value={draftingChrome.paragraphStyle}
                onChange={(event) =>
                  draftingChrome.onParagraphStyleChange(
                    event.target.value as ParagraphStyle,
                  )
                }
                disabled={draftingChrome.currentRole !== "editor"}
              >
                <option value="normal">Normal text</option>
                <option value="title">Title</option>
                <option value="heading-1">Heading 1</option>
                <option value="heading-2">Heading 2</option>
                <option value="heading-3">Heading 3</option>
                <option value="heading-4">Heading 4</option>
                <option value="heading-5">Heading 5</option>
                <option value="heading-6">Heading 6</option>
                <option value="quote">Quote</option>
              </select>
              <ChevronDown size={14} />
            </div>

            <div className="toolbarSelectWrap">
              <select
                title="Change font family"
                aria-label="Change font family"
                value={draftingChrome.fontFamily}
                onChange={(event) =>
                  draftingChrome.onFontFamilyChange(event.target.value)
                }
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
              <Button
                type="button"
                className="toolbarIconBtn"
                title="Decrease font size"
                aria-label="Decrease font size"
                onClick={draftingChrome.onDecreaseFontSize}
                showImage
                image={<Minus size={14} />}
              />
              <input
                type="number"
                min={8}
                max={120}
                value={draftingChrome.fontSize}
                title="Set font size"
                onChange={(event) =>
                  draftingChrome.onFontSizeChange(
                    Number(event.target.value || 0),
                  )
                }
                aria-label="Font size"
              />
              <Button
                type="button"
                className="toolbarIconBtn"
                title="Increase font size"
                aria-label="Increase font size"
                onClick={draftingChrome.onIncreaseFontSize}
                showImage
                image={<Plus size={14} />}
              />
            </div>
          </div>

          <div className="draftingToolbarGroup">
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Make selected text bold"
              aria-label="Make selected text bold"
              onClick={draftingChrome.onBold}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isBoldActive}
            >
              <strong>B</strong>
            </Button>
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Italicize selected text"
              aria-label="Italicize selected text"
              onClick={draftingChrome.onItalic}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isItalicActive}
              showImage
              image={<Italic size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Underline selected text"
              aria-label="Underline selected text"
              onClick={draftingChrome.onUnderline}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isUnderlineActive}
              showImage
              image={<Underline size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Strikethrough selected text"
              aria-label="Strikethrough selected text"
              onClick={draftingChrome.onStrike}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isStrikeActive}
              showImage
              image={<Strikethrough size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Highlight selected text"
              aria-label="Highlight selected text"
              onClick={draftingChrome.onHighlight}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isHighlightActive}
              showImage
              image={<Highlighter size={16} />}
            />
            <div className="toolbarColorSwatches">
              {draftingChrome.colorChoices.map((color) => (
                <Button
                  key={color}
                  type="button"
                  className="toolbarColorBtn"
                  style={{ backgroundColor: color }}
                  onClick={() => draftingChrome.onSetTextColor(color)}
                  title={`Set text color to ${color}`}
                  aria-label={`Set text color ${color}`}
                  disabled={draftingChrome.currentRole !== "editor"}
                />
              ))}
            </div>
          </div>

          <div className="draftingToolbarGroup">
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Insert or edit a link"
              aria-label="Insert or edit a link"
              onClick={draftingChrome.onInsertLink}
              disabled={draftingChrome.currentRole !== "editor"}
              showImage
              image={<LinkIcon size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Insert an image placeholder"
              aria-label="Insert an image placeholder"
              onClick={draftingChrome.onInsertImage}
              disabled={draftingChrome.currentRole !== "editor"}
              showImage
              image={<ImageIcon size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Insert a table"
              aria-label="Insert a table"
              onClick={draftingChrome.onInsertTable}
              disabled={draftingChrome.currentRole !== "editor"}
              showImage
              image={<Table2 size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Open the comment composer"
              aria-label="Open the comment composer"
              onClick={draftingChrome.onOpenCommentComposer}
              disabled={draftingChrome.currentRole !== "editor"}
              showImage
              image={<MessageSquare size={16} />}
            />
          </div>

          <div className="draftingToolbarGroup">
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Align text left"
              aria-label="Align text left"
              onClick={draftingChrome.onAlignLeft}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isAlignLeftActive}
              showImage
              image={<AlignLeft size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Align text center"
              aria-label="Align text center"
              onClick={draftingChrome.onAlignCenter}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isAlignCenterActive}
              showImage
              image={<AlignCenter size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Align text right"
              aria-label="Align text right"
              onClick={draftingChrome.onAlignRight}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isAlignRightActive}
              showImage
              image={<AlignRight size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Justify text"
              aria-label="Justify text"
              onClick={draftingChrome.onAlignJustify}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isAlignJustifyActive}
              showImage
              image={<AlignJustify size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Create a bulleted list"
              aria-label="Create a bulleted list"
              onClick={draftingChrome.onBulletList}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isBulletListActive}
              showImage
              image={<List size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Create a numbered list"
              aria-label="Create a numbered list"
              onClick={draftingChrome.onNumberList}
              disabled={draftingChrome.currentRole !== "editor"}
              data-active={draftingChrome.isOrderedListActive}
              showImage
              image={<ListOrdered size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Decrease indentation"
              aria-label="Decrease indentation"
              onClick={draftingChrome.onOutdent}
              disabled={draftingChrome.currentRole !== "editor"}
              showImage
              image={<IndentDecrease size={16} />}
            />
            <Button
              type="button"
              className="toolbarIconBtn"
              title="Increase indentation"
              aria-label="Increase indentation"
              onClick={draftingChrome.onIndent}
              disabled={draftingChrome.currentRole !== "editor"}
              showImage
              image={<IndentIncrease size={16} />}
            />
          </div>
        </div>
        </header>
        <PricingModal
          isOpen={isPricingOpen}
          onClose={() => setIsPricingOpen(false)}
          isAuthenticated
        />
      </>
    );
  }

  return (
    <>
      <header className="homeDashTopBar">
        <div className="topBarLeft">
          <Button
            className="iconBtn sidebarToggleBtn"
            type="button"
            aria-label={
              isSideBarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            onClick={onToggleSidebar}
            showImage
            image={
              isSideBarCollapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )
            }
          />
          <Button
            type="button"
            className="iconBtn topBarHomeBtn"
            aria-label="Go to dashboard home"
            onClick={() => navigate("/dashboard")}
            showImage
            image={<Home size={18} />}
          />
        </div>

        <div className="topBarRight">
          <div className="sectionRouteNav">
            {sectionLinks.map((item) => (
              <Button
                key={item.path}
                type="button"
                className={`sectionRouteBtn ${pathname === item.path ? "active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </Button>
            ))}
            <Button
              type="button"
              className="sectionRouteBtn"
              onClick={() => setIsPricingOpen(true)}
            >
              Pricing
            </Button>
          </div>
          <Button
            className="avatarBtn"
            type="button"
            aria-label="Profile"
            onClick={() => setIsProfileMenuOpen(true)}
            showImage
            image={<User size={16} />}
          />
        </div>
        <UserProfile
          isOpen={isProfileMenuOpen}
          onClose={() => setIsProfileMenuOpen(false)}
        />
      </header>
      <PricingModal
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        isAuthenticated
      />
    </>
  );
};

export default ProductNavbar;
