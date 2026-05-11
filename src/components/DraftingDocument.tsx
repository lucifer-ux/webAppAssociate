import "../componentStyling/DraftingDocument.css";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { MessageSquarePlus, SmilePlus } from "lucide-react";

export type AccessRole = "viewer" | "editor";
export type ParagraphStyle = "normal" | "heading-1" | "heading-2" | "quote";
export type ZoomLevel = "80%" | "100%" | "125%";
export type AnnotationType = "comment" | "reaction";

export type DraftDocumentTab = {
  id: string;
  title: string;
  html: string;
};

export type DraftComment = {
  id: string;
  author: string;
  excerpt: string;
  note: string;
  type: AnnotationType;
  anchorId: string;
  status: "pending" | "accepted" | "rejected";
};

export type PendingAnnotation = {
  anchorId: string;
  excerpt: string;
  type: AnnotationType;
};

export type DraftingEditorHandle = {
  applyCommand: (command: string, value?: string) => void;
  insertLink: () => void;
  insertImage: () => void;
  focus: () => void;
  getSelectionExcerpt: () => string;
  removeAnchor: (anchorId: string) => void;
};

type DraftingDocumentProps = {
  activeDocument: DraftDocumentTab;
  currentRole: AccessRole;
  zoomLevel: ZoomLevel;
  comments: DraftComment[];
  activeAnnotationId: string | null;
  pendingAnnotation: PendingAnnotation | null;
  commentDraft: string;
  onDocumentChange: (html: string) => void;
  onCommentDraftChange: (value: string) => void;
  onStartAnnotation: (annotation: PendingAnnotation) => void;
  onClearPendingAnnotation: () => void;
  onAddPendingComment: () => void;
  onAddReaction: (emoji: string) => void;
  onSelectAnnotation: (id: string) => void;
  onAcceptComment: (id: string) => void;
  onRejectComment: (id: string) => void;
};

const roleCanEdit = (role: AccessRole) => role === "editor";

const DraftingDocument = forwardRef<DraftingEditorHandle, DraftingDocumentProps>(
  (
    {
      activeDocument,
      currentRole,
      zoomLevel,
      comments,
      activeAnnotationId,
      pendingAnnotation,
      commentDraft,
      onDocumentChange,
      onCommentDraftChange,
      onStartAnnotation,
      onClearPendingAnnotation,
      onAddPendingComment,
      onAddReaction,
      onSelectAnnotation,
      onAcceptComment,
      onRejectComment,
    },
    ref,
  ) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const selectionRangeRef = useRef<Range | null>(null);
    const [selectionMenu, setSelectionMenu] = useState<{ top: number; visible: boolean }>({
      top: 0,
      visible: false,
    });

    useEffect(() => {
      if (!editorRef.current) {
        return;
      }

      if (editorRef.current.innerHTML !== activeDocument.html) {
        editorRef.current.innerHTML = activeDocument.html;
      }
    }, [activeDocument]);

    useEffect(() => {
      document.execCommand("styleWithCSS", false, "true");
    }, []);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      editor.querySelectorAll(".draftAnnotationAnchor.is-active").forEach((node) => {
        node.classList.remove("is-active");
      });

      if (!activeAnnotationId) {
        return;
      }

      const activeAnchor = editor.querySelector(
        `[data-anchor-id="${activeAnnotationId}"]`,
      ) as HTMLElement | null;

      if (activeAnchor) {
        activeAnchor.classList.add("is-active");
        activeAnchor.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, [activeAnnotationId, comments]);

    const focus = () => {
      editorRef.current?.focus();
    };

    const updateDocumentHtml = () => {
      onDocumentChange(editorRef.current?.innerHTML || "");
    };

    const clearSelectionUi = () => {
      selectionRangeRef.current = null;
      setSelectionMenu({ top: 0, visible: false });
    };

    const getSelectionExcerpt = () => {
      const selection = window.getSelection();
      return String(selection?.toString() || "").trim();
    };

    const applyCommand = (command: string, value?: string) => {
      if (!roleCanEdit(currentRole)) {
        return;
      }

      focus();
      document.execCommand(command, false, value);
      updateDocumentHtml();
    };

    const insertLink = () => {
      if (!roleCanEdit(currentRole)) {
        return;
      }

      const url = window.prompt("Enter link URL");
      if (!url) {
        return;
      }

      applyCommand("createLink", url);
    };

    const insertImage = () => {
      if (!roleCanEdit(currentRole)) {
        return;
      }

      const url = window.prompt("Paste image URL");
      if (!url) {
        return;
      }

      applyCommand("insertImage", url);
    };

    const refreshSelectionMenu = () => {
      if (!roleCanEdit(currentRole)) {
        clearSelectionUi();
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        clearSelectionUi();
        return;
      }

      const range = selection.getRangeAt(0);
      const excerpt = String(range.toString() || "").trim();
      if (!excerpt || !editorRef.current?.contains(range.commonAncestorContainer)) {
        clearSelectionUi();
        return;
      }

      const rect = range.getBoundingClientRect();
      const sheetRect = sheetRef.current?.getBoundingClientRect();
      if (!sheetRect) {
        clearSelectionUi();
        return;
      }

      selectionRangeRef.current = range.cloneRange();
      setSelectionMenu({
        top: rect.top - sheetRect.top + rect.height / 2 - 26,
        visible: true,
      });
    };

    const wrapSelectionWithAnchor = (type: AnnotationType) => {
      const range = selectionRangeRef.current;
      const editor = editorRef.current;
      if (!range || !editor) {
        return null;
      }

      const excerpt = String(range.toString() || "").trim();
      if (!excerpt) {
        return null;
      }

      const anchorId = crypto.randomUUID();
      const span = document.createElement("span");
      span.className = `draftAnnotationAnchor type-${type}`;
      span.dataset.anchorId = anchorId;

      try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      } catch {
        return null;
      }

      updateDocumentHtml();
      clearSelectionUi();
      return { anchorId, excerpt };
    };

    const removeAnchor = (anchorId: string) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const anchor = editor.querySelector(`[data-anchor-id="${anchorId}"]`) as HTMLElement | null;
      if (!anchor || !anchor.parentNode) {
        return;
      }

      const parent = anchor.parentNode;
      while (anchor.firstChild) {
        parent.insertBefore(anchor.firstChild, anchor);
      }
      parent.removeChild(anchor);
      parent.normalize();
      updateDocumentHtml();
    };

    const startAnnotation = (type: AnnotationType) => {
      const annotation = wrapSelectionWithAnchor(type);
      if (!annotation) {
        return;
      }

      onStartAnnotation({
        anchorId: annotation.anchorId,
        excerpt: annotation.excerpt,
        type,
      });
    };

    useImperativeHandle(ref, () => ({
      applyCommand,
      insertLink,
      insertImage,
      focus,
      getSelectionExcerpt,
      removeAnchor,
    }));

    return (
      <section className="draftingCanvasShell">
        <main className="draftingCanvasArea soloCanvas">
          <div ref={sheetRef} className={`draftPaperSheet compact zoom-${zoomLevel.replace("%", "")}`}>
            <div
              ref={editorRef}
              className={`draftPaperEditor ${roleCanEdit(currentRole) ? "" : "readOnly"}`}
              contentEditable={roleCanEdit(currentRole)}
              suppressContentEditableWarning
              onInput={updateDocumentHtml}
              onMouseUp={refreshSelectionMenu}
              onKeyUp={refreshSelectionMenu}
              onBlur={() => {
                window.setTimeout(() => {
                  const active = document.activeElement as HTMLElement | null;
                  if (active?.closest(".draftSelectionBubble")) {
                    return;
                  }
                  if (!pendingAnnotation) {
                    clearSelectionUi();
                  }
                }, 120);
              }}
              spellCheck
            />

            {selectionMenu.visible && (
              <div className="draftSelectionBubble" style={{ top: `${selectionMenu.top}px` }}>
                <button type="button" onClick={() => startAnnotation("comment")} aria-label="Add comment">
                  <MessageSquarePlus size={18} />
                </button>
                <button type="button" onClick={() => startAnnotation("reaction")} aria-label="Add reaction">
                  <SmilePlus size={18} />
                </button>
              </div>
            )}
          </div>

          <aside className="draftCommentRail">
            {pendingAnnotation && (
              <div className="draftCommentComposerInline">
                <div className="composerExcerptLine">{pendingAnnotation.excerpt}</div>
                {pendingAnnotation.type === "comment" ? (
                  <>
                    <textarea
                      value={commentDraft}
                      onChange={(event) => onCommentDraftChange(event.target.value)}
                      placeholder="Add a margin comment..."
                      disabled={!roleCanEdit(currentRole)}
                    />
                    <div className="pendingAnnotationActions">
                      <button type="button" className="commentInlineSecondaryBtn" onClick={onClearPendingAnnotation}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="commentInlineActionBtn"
                        onClick={onAddPendingComment}
                        disabled={!roleCanEdit(currentRole) || !commentDraft.trim()}
                      >
                        Add comment
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="reactionPickerRow">
                    {["👍", "✅", "⚠️", "💡"].map((emoji) => (
                      <button key={emoji} type="button" onClick={() => onAddReaction(emoji)}>
                        {emoji}
                      </button>
                    ))}
                    <button type="button" className="commentInlineSecondaryBtn" onClick={onClearPendingAnnotation}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="commentInlineList">
              {comments.map((comment) => (
                <article
                  key={comment.id}
                  className={`inlineCommentCard ${comment.status} ${comment.type}`}
                  onClick={() => onSelectAnnotation(comment.anchorId)}
                >
                  <strong>{comment.author}</strong>
                  <blockquote>{comment.excerpt}</blockquote>
                  <p>{comment.note}</p>
                  <div className="inlineCommentActions">
                    <button type="button" onClick={() => onAcceptComment(comment.id)}>
                      Accept
                    </button>
                    <button type="button" onClick={() => onRejectComment(comment.id)}>
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </main>
      </section>
    );
  },
);

DraftingDocument.displayName = "DraftingDocument";

export default DraftingDocument;
