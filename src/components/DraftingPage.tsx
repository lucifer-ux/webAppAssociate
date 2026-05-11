import "../componentStyling/HomeDashboardStyling.css";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProductNavbar from "./ProductNavbar";
import SideBar from "./SideBar";
import DraftingDocument, {
  type AccessRole,
  type DraftComment,
  type DraftDocumentTab,
  type DraftingEditorHandle,
  type PendingAnnotation,
  type ParagraphStyle,
  type ZoomLevel,
} from "./DraftingDocument";

const FONT_FAMILIES = ["Newsreader", "Georgia", "Times New Roman", "Work Sans"];
const COLOR_CHOICES = ["#1b1c19", "#4c0003", "#6f5d55", "#0f5b78"];

const INITIAL_DOCUMENTS: DraftDocumentTab[] = [
  {
    id: "draft-petition",
    title: "Draft Petition",
    html: `
      <h1>Draft Petition for Recovery of Advance Consideration</h1>
      <p>This draft is prepared for internal review and factual completion. The current framing assumes a civil dispute arising from delay and non-performance in the transfer of immovable property.</p>
      <h2>Background</h2>
      <p>The claimant states that an advance amount was paid under an agreement for sale. Despite repeated follow-up, possession and transfer have not been completed within the promised timeline.</p>
      <h2>Immediate Issues</h2>
      <ul>
        <li>Whether the purchaser is entitled to refund with interest.</li>
        <li>Whether specific performance remains commercially viable on the present facts.</li>
        <li>What documentary proof is still required before finalizing a filing strategy.</li>
      </ul>
    `,
  },
];

const styleMap: Record<ParagraphStyle, string> = {
  normal: "P",
  "heading-1": "H1",
  "heading-2": "H2",
  quote: "BLOCKQUOTE",
};

const DraftingPage = () => {
  const [searchParams] = useSearchParams();
  const editorRef = useRef<DraftingEditorHandle | null>(null);
  const [isSideBarCollapsed, setIsSideBarCollapsed] = useState(false);
  const [documents, setDocuments] = useState<DraftDocumentTab[]>(INITIAL_DOCUMENTS);
  const [activeDocumentId, setActiveDocumentId] = useState(INITIAL_DOCUMENTS[0].id);
  const [documentTitle, setDocumentTitle] = useState("Untitled legal draft");
  const [currentRole] = useState<AccessRole>("editor");
  const [requestEditPending, setRequestEditPending] = useState(false);
  const [comments, setComments] = useState<DraftComment[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [paragraphStyle, setParagraphStyle] = useState<ParagraphStyle>("normal");
  const [fontFamily, setFontFamily] = useState("Newsreader");
  const [fontSize, setFontSize] = useState(12);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("100%");

  useEffect(() => {
    try {
      localStorage.setItem(
        "drafting_document_tabs",
        JSON.stringify(documents.map((document) => ({ id: document.id, title: document.title }))),
      );
    } catch {
      // Ignore persistence failures in restricted environments.
    }
  }, [documents]);

  useEffect(() => {
    const tabId = String(searchParams.get("tab") || "").trim();
    if (!tabId) {
      return;
    }
    if (!documents.some((document) => document.id === tabId)) {
      return;
    }
    setActiveDocumentId(tabId);
  }, [searchParams, documents]);

  const activeDocument =
    documents.find((document) => document.id === activeDocumentId) || documents[0];

  const updateActiveDocument = (html: string) => {
    setDocuments((prev) =>
      prev.map((document) =>
        document.id === activeDocumentId ? { ...document, html } : document,
      ),
    );
  };

  const applyCommand = (command: string, value?: string) => {
    editorRef.current?.applyCommand(command, value);
  };

  const changeFontFamily = (nextFamily: string) => {
    setFontFamily(nextFamily);
    applyCommand("fontName", nextFamily);
  };

  const changeParagraphStyle = (nextStyle: ParagraphStyle) => {
    setParagraphStyle(nextStyle);
    applyCommand("formatBlock", styleMap[nextStyle]);
  };

  const changeFontSize = (delta: number) => {
    const nextSize = Math.min(24, Math.max(10, fontSize + delta));
    setFontSize(nextSize);
    applyCommand("fontSize", "4");

    const fontElements = document.querySelectorAll(".draftPaperEditor font[size='4']");
    fontElements.forEach((element) => {
      element.removeAttribute("size");
      (element as HTMLElement).style.fontSize = `${nextSize}px`;
    });
  };

  const addPendingComment = () => {
    if (!pendingAnnotation || pendingAnnotation.type !== "comment" || !commentDraft.trim()) {
      return;
    }

    setComments((prev) => [
      {
        id: crypto.randomUUID(),
        author: "You",
        excerpt: pendingAnnotation.excerpt,
        note: commentDraft.trim(),
        type: "comment",
        anchorId: pendingAnnotation.anchorId,
        status: "pending",
      },
      ...prev,
    ]);
    setCommentDraft("");
    setActiveAnnotationId(pendingAnnotation.anchorId);
    setPendingAnnotation(null);
  };

  const addReaction = (emoji: string) => {
    if (!pendingAnnotation || pendingAnnotation.type !== "reaction") {
      return;
    }

    setComments((prev) => [
      {
        id: crypto.randomUUID(),
        author: "You",
        excerpt: pendingAnnotation.excerpt,
        note: emoji,
        type: "reaction",
        anchorId: pendingAnnotation.anchorId,
        status: "pending",
      },
      ...prev,
    ]);
    setActiveAnnotationId(pendingAnnotation.anchorId);
    setPendingAnnotation(null);
  };

  const updateCommentStatus = (id: string, status: DraftComment["status"]) => {
    setComments((prev) =>
      prev.map((comment) => (comment.id === id ? { ...comment, status } : comment)),
    );
  };

  return (
    <div className="homeDashPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
        draftingChrome={{
          documentTitle,
          onDocumentTitleChange: setDocumentTitle,
          currentRole,
          requestEditPending,
          onRequestEdit: () => setRequestEditPending(true),
          zoomLevel,
          onZoomChange: setZoomLevel,
          paragraphStyle,
          onParagraphStyleChange: changeParagraphStyle,
          fontFamily,
          fontFamilies: FONT_FAMILIES,
          onFontFamilyChange: changeFontFamily,
          fontSize,
          onDecreaseFontSize: () => changeFontSize(-1),
          onIncreaseFontSize: () => changeFontSize(1),
          colorChoices: COLOR_CHOICES,
          onUndo: () => applyCommand("undo"),
          onRedo: () => applyCommand("redo"),
          onPrint: () => window.print(),
          onBold: () => applyCommand("bold"),
          onItalic: () => applyCommand("italic"),
          onUnderline: () => applyCommand("underline"),
          onHighlight: () => applyCommand("hiliteColor", "#fff0b8"),
          onSetTextColor: (color: string) => applyCommand("foreColor", color),
          onInsertLink: () => editorRef.current?.insertLink(),
          onInsertImage: () => editorRef.current?.insertImage(),
          onOpenCommentComposer: () => {},
          onAlignLeft: () => applyCommand("justifyLeft"),
          onAlignCenter: () => applyCommand("justifyCenter"),
          onAlignRight: () => applyCommand("justifyRight"),
          onAlignJustify: () => applyCommand("justifyFull"),
          onBulletList: () => applyCommand("insertUnorderedList"),
          onNumberList: () => applyCommand("insertOrderedList"),
          onOutdent: () => applyCommand("outdent"),
          onIndent: () => applyCommand("indent"),
        }}
      />

      <SideBar
        isCollapsed={isSideBarCollapsed}
        activeSection="drafting"
      />

      <main
        className={`homeDashMain draftingMain ${isSideBarCollapsed ? "sidebarCollapsed" : ""}`}
      >
        <DraftingDocument
          ref={editorRef}
          activeDocument={activeDocument}
          currentRole={currentRole}
          zoomLevel={zoomLevel}
          activeAnnotationId={activeAnnotationId}
          pendingAnnotation={pendingAnnotation}
          commentDraft={commentDraft}
          comments={comments}
          onDocumentChange={updateActiveDocument}
          onCommentDraftChange={setCommentDraft}
          onStartAnnotation={(annotation) => {
            setPendingAnnotation(annotation);
            setCommentDraft("");
            setActiveAnnotationId(annotation.anchorId);
          }}
          onClearPendingAnnotation={() => {
            if (pendingAnnotation) {
              editorRef.current?.removeAnchor(pendingAnnotation.anchorId);
            }
            setPendingAnnotation(null);
            setCommentDraft("");
            setActiveAnnotationId(null);
          }}
          onAddPendingComment={addPendingComment}
          onAddReaction={addReaction}
          onSelectAnnotation={setActiveAnnotationId}
          onAcceptComment={(id) => updateCommentStatus(id, "accepted")}
          onRejectComment={(id) => updateCommentStatus(id, "rejected")}
        />
      </main>
    </div>
  );
};

export default DraftingPage;
