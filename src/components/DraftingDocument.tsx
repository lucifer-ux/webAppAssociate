import "../componentStyling/DraftingDocument.css";
import Button from "./Button";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { MessageSquarePlus, SmilePlus } from "lucide-react";
import { buildDraftingExtensions } from "./draftingExtensions";
import type {
  AccessRole,
  DraftAiReviewNote,
  DraftBlockMeta,
  DraftComment,
  DraftContext,
  DraftDetail,
  PendingAnnotation,
  ParagraphStyle,
  ZoomLevel,
} from "./draftingApi";

export type { AccessRole, DraftComment, PendingAnnotation, ParagraphStyle, ZoomLevel } from "./draftingApi";

export type DraftHeadingItem = {
  id: string;
  level: number;
  text: string;
  position: number;
  wordCount: number;
  characterCount: number;
};

export type DraftingToolbarState = {
  paragraphStyle: ParagraphStyle;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  blankFieldCount: number;
  wordCount: number;
  characterCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isBoldActive: boolean;
  isItalicActive: boolean;
  isUnderlineActive: boolean;
  isStrikeActive: boolean;
  isHighlightActive: boolean;
  isLinkActive: boolean;
  isAlignLeftActive: boolean;
  isAlignCenterActive: boolean;
  isAlignRightActive: boolean;
  isAlignJustifyActive: boolean;
  isBulletListActive: boolean;
  isOrderedListActive: boolean;
  headings: DraftHeadingItem[];
};

export type DraftingEditorHandle = {
  applyCommand: (command: string, value?: string) => void;
  insertLink: () => void;
  insertImage: () => void;
  insertTable: () => void;
  focus: () => void;
  getSelectionExcerpt: () => string;
  startCommentSelection: () => void;
  openFindReplace: () => void;
};

type DraftingDocumentProps = {
  draft: DraftDetail;
  currentRole: AccessRole;
  zoomLevel: ZoomLevel;
  comments: DraftComment[];
  activeAnnotationId: string | null;
  pendingAnnotation: PendingAnnotation | null;
  commentDraft: string;
  onDocumentChange: (
    contentJson: JSONContent,
    meta?: { userInitiated?: boolean },
  ) => void;
  onDraftContextChange: (context: DraftContext) => void;
  onToolbarStateChange: (state: DraftingToolbarState) => void;
  onCommentDraftChange: (value: string) => void;
  onStartAnnotation: (annotation: PendingAnnotation) => void;
  onClearPendingAnnotation: () => void;
  onAddPendingComment: () => void;
  onAddReaction: (emoji: string) => void;
  onSelectAnnotation: (id: string) => void;
  onAcceptComment: (id: string) => void;
  onRejectComment: (id: string) => void;
  onUpdateComment: (id: string, note: string) => void;
  onDeleteComment: (id: string) => void;
  onAddReply: (id: string, note: string) => void;
  onMapComments: (comments: DraftComment[]) => void;
  onRequestSave: () => void;
};

type FindReplaceMatch = {
  from: number;
  to: number;
  text: string;
};

const roleCanEdit = (role: AccessRole) => role === "editor";

const emptyHeaderFooter = {
  header: { left: "", center: "", right: "" },
  footer: { left: "", center: "Page 1", right: "" },
  differentFirstPage: false,
};

const renderPageNumberText = (value: string, pageNumber = 1) =>
  String(value || "").replace(/\{page\}/gi, String(pageNumber)).trim();

const findReplacePluginKey = new PluginKey("draftFindReplacePlugin");

const clampPosition = (value: number, max: number) =>
  Math.max(1, Math.min(Math.max(1, max - 1), value));

const isWholeWordBoundary = (text: string, start: number, end: number) => {
  const left = start > 0 ? text[start - 1] : "";
  const right = end < text.length ? text[end] : "";
  return !/[A-Za-z0-9_]/.test(left) && !/[A-Za-z0-9_]/.test(right);
};

const collectFindMatches = (
  editor: Editor | null,
  query: string,
  options: { matchCase: boolean; wholeWord: boolean },
) => {
  if (!editor || !query.trim()) return [];

  const needle = options.matchCase ? query : query.toLowerCase();
  const matches: FindReplaceMatch[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    const haystack = options.matchCase ? node.text : node.text.toLowerCase();
    let searchFrom = 0;

    while (searchFrom <= haystack.length) {
      const index = haystack.indexOf(needle, searchFrom);
      if (index < 0) break;
      const end = index + needle.length;
      if (!options.wholeWord || isWholeWordBoundary(node.text || "", index, end)) {
        matches.push({
          from: pos + index,
          to: pos + end,
          text: node.text.slice(index, end),
        });
      }
      searchFrom = end || index + 1;
    }
  });

  return matches;
};

const getSelectionExcerpt = (editor: Editor | null) => {
  if (!editor) return "";
  const { from, to, empty } = editor.state.selection;
  if (empty) return "";
  return editor.state.doc.textBetween(from, to, " ").trim();
};

const getSelectedBlockId = (editor: Editor | null) => {
  if (!editor) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const blockId = String($from.node(depth)?.attrs?.blockId || "").trim();
    if (blockId) return blockId;
  }
  return null;
};

const findBlockPosition = (editor: Editor | null, blockId: string) => {
  if (!editor || !blockId) return null;
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (String(node.attrs?.blockId || "").trim() === blockId) {
      found = pos + 1;
      return false;
    }
    return;
  });
  return found;
};

const formatConfidence = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "Unknown";
  return `${Math.round(value * 100)}%`;
};

const getToolbarParagraphStyle = (editor: Editor): ParagraphStyle => {
  if (editor.isActive("title")) return "title";
  if (editor.isActive("blockquote")) return "quote";
  for (let level = 1; level <= 6; level += 1) {
    if (editor.isActive("heading", { level })) {
      return `heading-${level}` as ParagraphStyle;
    }
  }
  return "normal";
};

const getHeadings = (editor: Editor): DraftHeadingItem[] => {
  const headings: DraftHeadingItem[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = Number(node.attrs.level || 1);
    if (level > 3) return;
    const text = String(node.textContent || "").trim();
    if (!text) return;
    headings.push({
      id: String(node.attrs.id || `heading-${pos}`),
      level,
      text,
      position: pos + 1,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      characterCount: text.length,
    });
  });

  return headings;
};

const createFindReplacePlugin = (
  getState: () => {
    isOpen: boolean;
    query: string;
    matchCase: boolean;
    wholeWord: boolean;
    activeIndex: number;
  },
) =>
  new Plugin({
    key: findReplacePluginKey,
    state: {
      init: () => 0,
      apply(tr, value) {
        return tr.getMeta(findReplacePluginKey) || value;
      },
    },
    props: {
      decorations(state) {
        const data = getState();
        if (!data.isOpen || !data.query.trim()) {
          return DecorationSet.empty;
        }

        const normalizedNeedle = data.matchCase
          ? data.query
          : data.query.toLowerCase();
        const decorations: Decoration[] = [];
        let matchIndex = 0;

        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;

          const haystack = data.matchCase ? node.text : node.text.toLowerCase();
          let searchFrom = 0;
          while (searchFrom <= haystack.length) {
            const index = haystack.indexOf(normalizedNeedle, searchFrom);
            if (index < 0) break;
            const end = index + normalizedNeedle.length;
            if (!data.wholeWord || isWholeWordBoundary(node.text || "", index, end)) {
              decorations.push(
                Decoration.inline(pos + index, pos + end, {
                  class:
                    matchIndex === data.activeIndex
                      ? "draftFindMatch is-active"
                      : "draftFindMatch",
                }),
              );
              matchIndex += 1;
            }
            searchFrom = end || index + 1;
          }
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });

const DraftingDocument = forwardRef<DraftingEditorHandle, DraftingDocumentProps>(
  (
    {
      draft,
      currentRole,
      zoomLevel,
      comments,
      activeAnnotationId,
      pendingAnnotation,
      commentDraft,
      onDocumentChange,
      onDraftContextChange,
      onToolbarStateChange,
      onCommentDraftChange,
      onStartAnnotation,
      onClearPendingAnnotation,
      onAddPendingComment,
      onAddReaction,
      onSelectAnnotation,
      onAcceptComment,
      onRejectComment,
      onUpdateComment,
      onDeleteComment,
      onAddReply,
      onMapComments,
      onRequestSave,
    },
    ref,
  ) => {
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const commentsRef = useRef(comments);
    const hydratedKeyRef = useRef("");
    const findReplaceStateRef = useRef({
      isOpen: false,
      query: "",
      matchCase: false,
      wholeWord: false,
      activeIndex: 0,
    });
    const [selectionMenuTop, setSelectionMenuTop] = useState<number | null>(null);
    const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingDraft, setEditingDraft] = useState("");
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [findQuery, setFindQuery] = useState("");
    const [replaceQuery, setReplaceQuery] = useState("");
    const [matchCase, setMatchCase] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [findPanelOpen, setFindPanelOpen] = useState(false);
    const [activeFindIndex, setActiveFindIndex] = useState(0);
    const [commentLayout, setCommentLayout] = useState<Record<string, number>>({});
    const [pendingTop, setPendingTop] = useState<number | null>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

    commentsRef.current = comments;
    findReplaceStateRef.current = {
      isOpen: findPanelOpen,
      query: findQuery,
      matchCase,
      wholeWord,
      activeIndex: activeFindIndex,
    };

    const headerFooter = useMemo(
      () => ({
        header: {
          ...emptyHeaderFooter.header,
          ...(draft.context.headerFooter?.header || {}),
        },
        footer: {
          ...emptyHeaderFooter.footer,
          ...(draft.context.headerFooter?.footer || {}),
        },
        differentFirstPage:
          draft.context.headerFooter?.differentFirstPage ??
          emptyHeaderFooter.differentFirstPage,
      }),
      [draft.context.headerFooter],
    );

    const templateProvenance = useMemo(
      () =>
        Array.isArray(draft.context.templateProvenance)
          ? draft.context.templateProvenance.slice(0, 5)
          : [],
      [draft.context.templateProvenance],
    );

    const generatedBlockMeta = useMemo(
      () => draft.context.generatedBlockMeta || {},
      [draft.context.generatedBlockMeta],
    );

    const aiGeneratedComments = useMemo(
      () =>
        Array.isArray(draft.context.aiGeneratedComments)
          ? draft.context.aiGeneratedComments
          : [],
      [draft.context.aiGeneratedComments],
    );

    const selectedBlockMeta = useMemo(() => {
      if (selectedBlockId && generatedBlockMeta[selectedBlockId]) {
        return generatedBlockMeta[selectedBlockId];
      }
      const firstKey = Object.keys(generatedBlockMeta)[0];
      return firstKey ? generatedBlockMeta[firstKey] : null;
    }, [generatedBlockMeta, selectedBlockId]);

    const updateHeaderFooterSlot = useCallback(
      (
        region: "header" | "footer",
        slot: "left" | "center" | "right",
        value: string,
      ) => {
        onDraftContextChange({
          ...draft.context,
          headerFooter: {
            header: { ...headerFooter.header },
            footer: { ...headerFooter.footer },
            differentFirstPage: headerFooter.differentFirstPage,
            [region]: {
              ...headerFooter[region],
              [slot]: value,
            },
          },
        });
      },
      [draft.context, headerFooter, onDraftContextChange],
    );

    const findReplacePlugin = useMemo(
      () => createFindReplacePlugin(() => findReplaceStateRef.current),
      [],
    );

    const syncToolbarState = useCallback(
      (editorInstance: Editor) => {
        const fontSizeValue = Number.parseInt(
          String(editorInstance.getAttributes("textStyle").fontSize || "12"),
          10,
        );
        onToolbarStateChange({
          paragraphStyle: getToolbarParagraphStyle(editorInstance),
          fontFamily:
            String(editorInstance.getAttributes("textStyle").fontFamily || "").trim() ||
            "Newsreader",
          fontSize: Number.isFinite(fontSizeValue) ? fontSizeValue : 12,
          textColor:
            String(editorInstance.getAttributes("textStyle").color || "").trim() || "#1b1c19",
          blankFieldCount: Number(editorInstance.storage.blankField?.count || 0),
          wordCount: Number(editorInstance.storage.characterCount?.words?.() || 0),
          characterCount: Number(editorInstance.storage.characterCount?.characters?.() || 0),
          canUndo: editorInstance.can().chain().focus().undo().run(),
          canRedo: editorInstance.can().chain().focus().redo().run(),
          isBoldActive: editorInstance.isActive("bold"),
          isItalicActive: editorInstance.isActive("italic"),
          isUnderlineActive: editorInstance.isActive("underline"),
          isStrikeActive: editorInstance.isActive("strike"),
          isHighlightActive: editorInstance.isActive("highlight"),
          isLinkActive: editorInstance.isActive("link"),
          isAlignLeftActive: editorInstance.isActive({ textAlign: "left" }),
          isAlignCenterActive: editorInstance.isActive({ textAlign: "center" }),
          isAlignRightActive: editorInstance.isActive({ textAlign: "right" }),
          isAlignJustifyActive: editorInstance.isActive({ textAlign: "justify" }),
          isBulletListActive: editorInstance.isActive("bulletList"),
          isOrderedListActive: editorInstance.isActive("orderedList"),
          headings: getHeadings(editorInstance),
        });
      },
      [onToolbarStateChange],
    );

    const refreshFindDecorations = useCallback(
      (editorInstance: Editor | null) => {
        if (!editorInstance) return;
        editorInstance.view.dispatch(
          editorInstance.state.tr.setMeta(findReplacePluginKey, Date.now()),
        );
      },
      [],
    );

    const refreshSelectionMenu = useCallback((editorInstance: Editor | null) => {
      setSelectedBlockId(getSelectedBlockId(editorInstance));
      if (!editorInstance || !roleCanEdit(currentRole)) {
        setSelectionMenuTop(null);
        return;
      }
      const { from, to, empty } = editorInstance.state.selection;
      if (empty || from === to || !sheetRef.current) {
        setSelectionMenuTop(null);
        return;
      }
      const startCoords = editorInstance.view.coordsAtPos(from);
      const endCoords = editorInstance.view.coordsAtPos(to);
      const sheetRect = sheetRef.current.getBoundingClientRect();
      setSelectionMenuTop(
        Math.max(0, (startCoords.top + endCoords.bottom) / 2 - sheetRect.top - 26),
      );
    }, [currentRole]);

    const measureCommentLayout = useCallback((editorInstance: Editor | null) => {
      if (!editorInstance || !sheetRef.current) {
        setCommentLayout({});
        setPendingTop(null);
        return;
      }

      const sheetRect = sheetRef.current.getBoundingClientRect();
      const maxPos = editorInstance.state.doc.content.size;
      const nextLayout: Record<string, number> = {};

      comments.forEach((comment) => {
        try {
          const coords = editorInstance.view.coordsAtPos(clampPosition(comment.from, maxPos));
          nextLayout[comment.id] = Math.max(0, coords.top - sheetRect.top);
        } catch {
          nextLayout[comment.id] = 0;
        }
      });

      if (pendingAnnotation) {
        try {
          const coords = editorInstance.view.coordsAtPos(
            clampPosition(pendingAnnotation.from, maxPos),
          );
          setPendingTop(Math.max(0, coords.top - sheetRect.top));
        } catch {
          setPendingTop(0);
        }
      } else {
        setPendingTop(null);
      }

      setCommentLayout(nextLayout);
    }, [comments, pendingAnnotation]);

    const startAnnotation = useCallback(
      (editorInstance: Editor | null, type: PendingAnnotation["type"]) => {
        if (!editorInstance) return;
        const { from, to, empty } = editorInstance.state.selection;
        if (empty || from === to) return;
        const excerpt = getSelectionExcerpt(editorInstance);
        if (!excerpt) return;
        onStartAnnotation({
          from,
          to,
          excerpt,
          type,
        });
        setSelectionMenuTop(null);
      },
      [onStartAnnotation],
    );

    const editor = useEditor({
      immediatelyRender: true,
      autofocus: true,
      editable: roleCanEdit(currentRole),
      extensions: buildDraftingExtensions({
        definedTerms: draft.context.definedTerms,
        onSaveShortcut: onRequestSave,
        onOpenFindShortcut: () => setFindPanelOpen(true),
      }),
      content: draft.contentJson,
      editorProps: {
        attributes: {
          class: `draftPaperEditor ${roleCanEdit(currentRole) ? "" : "readOnly"}`,
          spellcheck: "true",
        },
      },
      onCreate: ({ editor: editorInstance }) => {
        editorInstance.registerPlugin(findReplacePlugin);
        syncToolbarState(editorInstance);
        measureCommentLayout(editorInstance);
      },
      onSelectionUpdate: ({ editor: editorInstance }) => {
        syncToolbarState(editorInstance);
        refreshSelectionMenu(editorInstance);
      },
      onUpdate: ({ editor: editorInstance }) => {
        onDocumentChange(editorInstance.getJSON(), {
          userInitiated: editorInstance.isFocused,
        });
        syncToolbarState(editorInstance);
        measureCommentLayout(editorInstance);
      },
      onTransaction: ({ editor: editorInstance, transaction }) => {
        if (transaction.docChanged) {
          const maxPos = editorInstance.state.doc.content.size;
          const mappedComments = commentsRef.current.map((comment) => {
            const nextFrom = clampPosition(transaction.mapping.map(comment.from, -1), maxPos);
            const nextTo = clampPosition(transaction.mapping.map(comment.to, 1), maxPos);
            return {
              ...comment,
              from: Math.min(nextFrom, nextTo),
              to: Math.max(nextFrom, nextTo),
            };
          });

          const changed = mappedComments.some((comment, index) => {
            const current = commentsRef.current[index];
            return current && (current.from !== comment.from || current.to !== comment.to);
          });
          if (changed) {
            onMapComments(mappedComments);
          }
        }
        refreshSelectionMenu(editorInstance);
      },
    });

    useEffect(() => {
      if (!editor) return;
      const hydrationKey = `${draft.id}:${draft.contentHash}`;
      if (hydratedKeyRef.current === hydrationKey) return;
      hydratedKeyRef.current = hydrationKey;
      editor.commands.setContent(draft.contentJson);
      setSelectedBlockId(getSelectedBlockId(editor));
      syncToolbarState(editor);
      measureCommentLayout(editor);
    }, [draft.id, draft.contentHash, draft.contentJson, editor, measureCommentLayout, syncToolbarState]);

    useEffect(() => {
      if (!editor) return;
      refreshFindDecorations(editor);
    }, [activeFindIndex, editor, findPanelOpen, findQuery, matchCase, refreshFindDecorations, wholeWord]);

    useEffect(() => {
      if (!editor || !activeAnnotationId) return;
      const comment = comments.find((item) => item.id === activeAnnotationId);
      if (!comment) return;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: comment.from, to: comment.to })
        .scrollIntoView()
        .run();
    }, [activeAnnotationId, comments, editor]);

    useEffect(() => {
      if (!editor) return;
      measureCommentLayout(editor);
    }, [commentDraft, editor, measureCommentLayout, zoomLevel]);

    const applyCommand = useCallback(
      (command: string, value?: string) => {
        if (!editor || !roleCanEdit(currentRole)) {
          return;
        }

        switch (command) {
          case "undo":
            editor.chain().focus().undo().run();
            break;
          case "redo":
            editor.chain().focus().redo().run();
            break;
          case "bold":
            editor.chain().focus().toggleBold().run();
            break;
          case "italic":
            editor.chain().focus().toggleItalic().run();
            break;
          case "underline":
            editor.chain().focus().toggleUnderline().run();
            break;
          case "strike":
            editor.chain().focus().toggleStrike().run();
            break;
          case "justifyLeft":
            editor.chain().focus().setTextAlign("left").run();
            break;
          case "justifyCenter":
            editor.chain().focus().setTextAlign("center").run();
            break;
          case "justifyRight":
            editor.chain().focus().setTextAlign("right").run();
            break;
          case "justifyFull":
            editor.chain().focus().setTextAlign("justify").run();
            break;
          case "insertUnorderedList":
            editor.chain().focus().toggleBulletList().run();
            break;
          case "insertOrderedList":
            editor.chain().focus().toggleOrderedList().run();
            break;
          case "indent":
            editor.chain().focus().sinkListItem("listItem").run();
            break;
          case "outdent":
            editor.chain().focus().liftListItem("listItem").run();
            break;
          case "createLink":
            if (value) {
              editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
            }
            break;
          case "formatBlock":
            if (value === "TITLE") {
              editor.commands.setTitle();
            } else if (value === "BLOCKQUOTE") {
              editor.chain().focus().setBlockquote().run();
            } else if (value === "P") {
              editor.chain().focus().setParagraph().run();
            } else if (/^H[1-6]$/.test(String(value || ""))) {
              editor
                .chain()
                .focus()
                .setHeading({ level: Number(String(value).replace("H", "")) as 1 | 2 | 3 | 4 | 5 | 6 })
                .run();
            }
            break;
          case "fontName":
            if (value) {
              editor.chain().focus().setFontFamily(value).run();
            }
            break;
          case "foreColor":
            if (value) {
              editor.chain().focus().setColor(value).run();
            }
            break;
          case "hiliteColor":
            editor.chain().focus().toggleHighlight({ color: value || "#fff0b8" }).run();
            break;
          case "fontSize":
            if (value) {
              editor.commands.setFontSize(value);
            }
            break;
          case "insertTable":
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            break;
          default:
            break;
        }
        syncToolbarState(editor);
      },
      [currentRole, editor, syncToolbarState],
    );

    const insertLink = useCallback(() => {
      if (!editor || !roleCanEdit(currentRole)) return;
      const existingHref = String(editor.getAttributes("link").href || "");
      const url = window.prompt("Enter link URL", existingHref || "https://");
      if (url === null) return;
      if (!url.trim()) {
        editor.chain().focus().unsetLink().run();
        return;
      }
      applyCommand("createLink", url.trim());
    }, [applyCommand, currentRole, editor]);

    const insertImage = useCallback(() => {
      if (!editor || !roleCanEdit(currentRole)) return;
      const url = window.prompt("Paste image URL");
      if (!url?.trim()) return;
      editor.chain().focus().setImage({ src: url.trim() }).run();
    }, [currentRole, editor]);

    const insertTable = useCallback(() => {
      applyCommand("insertTable");
    }, [applyCommand]);

    const openFindReplace = useCallback(() => {
      setFindPanelOpen(true);
      setSelectionMenuTop(null);
    }, []);

    const focus = useCallback(() => {
      editor?.commands.focus();
    }, [editor]);

    const getSelectedExcerpt = useCallback(() => getSelectionExcerpt(editor), [editor]);

    const startCommentSelection = useCallback(() => {
      startAnnotation(editor, "comment");
    }, [editor, startAnnotation]);

    useImperativeHandle(
      ref,
      () => ({
        applyCommand,
        insertLink,
        insertImage,
        insertTable,
        focus,
        getSelectionExcerpt: getSelectedExcerpt,
        startCommentSelection,
        openFindReplace,
      }),
      [
        applyCommand,
        focus,
        getSelectedExcerpt,
        insertImage,
        insertLink,
        insertTable,
        openFindReplace,
        startCommentSelection,
      ],
    );

    const findMatches = collectFindMatches(editor, findQuery, { matchCase, wholeWord });

    const moveToMatch = (index: number) => {
      if (!editor || !findMatches.length) return;
      const nextIndex = (index + findMatches.length) % findMatches.length;
      setActiveFindIndex(nextIndex);
      const match = findMatches[nextIndex];
      editor
        .chain()
        .focus()
        .setTextSelection({ from: match.from, to: match.to })
        .scrollIntoView()
        .run();
    };

    const replaceCurrentMatch = () => {
      if (!editor || !findMatches.length) return;
      const match = findMatches[activeFindIndex] || findMatches[0];
      editor.commands.insertContentAt({ from: match.from, to: match.to }, replaceQuery);
      refreshFindDecorations(editor);
      window.requestAnimationFrame(() => {
        const nextMatches = collectFindMatches(editor, findQuery, { matchCase, wholeWord });
        if (nextMatches.length > 0) {
          setActiveFindIndex((current) => Math.min(current, nextMatches.length - 1));
        } else {
          setActiveFindIndex(0);
        }
      });
    };

    const replaceAllMatches = () => {
      if (!editor || !findMatches.length) return;
      const tr = editor.state.tr;
      [...findMatches]
        .reverse()
        .forEach((match) => {
          tr.insertText(replaceQuery, match.from, match.to);
        });
      editor.view.dispatch(tr);
      setActiveFindIndex(0);
      refreshFindDecorations(editor);
    };

    const headingItems = editor ? getHeadings(editor) : [];

    const sortedComments = [...comments].sort(
      (left, right) => (commentLayout[left.id] || 0) - (commentLayout[right.id] || 0),
    );

    const jumpToBlock = (blockId?: string) => {
      if (!editor || !blockId) return;
      const position = findBlockPosition(editor, blockId);
      if (!position) return;
      editor.chain().focus().setTextSelection(position).scrollIntoView().run();
      setSelectedBlockId(blockId);
    };

    const renderSourceRef = (
      sourceRef: NonNullable<DraftBlockMeta["sourceRefs"]>[number],
      index: number,
    ) => (
      <div key={`${sourceRef.chunk_id || sourceRef.file_name || "source"}-${index}`} className="draftSourceRefRow">
        <strong>{sourceRef.file_name || sourceRef.document_role || "Matter source"}</strong>
        <span>
          {[
            sourceRef.page_start != null ? `p. ${sourceRef.page_start}` : "",
            sourceRef.page_end != null &&
            sourceRef.page_end !== sourceRef.page_start
              ? `-${sourceRef.page_end}`
              : "",
            sourceRef.chunk_id ? `chunk ${sourceRef.chunk_id}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </span>
        {sourceRef.verbatim_basis && <p>{sourceRef.verbatim_basis}</p>}
      </div>
    );

    const renderLegalSourceRef = (
      sourceRef: NonNullable<DraftBlockMeta["legalSourceRefs"]>[number],
      index: number,
    ) => (
      <div key={`${sourceRef.source_id || sourceRef.title || "authority"}-${index}`} className="draftLegalSourceRow">
        <strong>{sourceRef.title || sourceRef.source_id || "Legal authority"}</strong>
        <span>{[sourceRef.court_or_body, sourceRef.citation].filter(Boolean).join(" · ")}</span>
        {sourceRef.principle && <p>{sourceRef.principle}</p>}
        {sourceRef.relevance && <small>{sourceRef.relevance}</small>}
      </div>
    );

    return (
      <section className="draftingCanvasShell">
        <main className="draftingCanvasArea soloCanvas">
          <aside className="draftNavigatorRail">
            <div className="draftNavigatorCard">
              <p className="draftTemplateEyebrow">Navigator</p>
              <div className="draftNavigatorList">
                {headingItems.length > 0 ? (
                  headingItems.map((heading) => (
                    <Button
                      key={heading.id}
                      type="button"
                      className={`draftNavigatorItem level-${heading.level}`}
                      title={heading.text}
                      onClick={() => {
                        if (!editor) return;
                        editor
                          .chain()
                          .focus()
                          .setTextSelection(heading.position)
                          .scrollIntoView()
                          .run();
                      }}
                    >
                      {heading.text}
                    </Button>
                  ))
                ) : (
                  <p className="draftNavigatorEmpty">Add headings to build section navigation.</p>
                )}
              </div>
            </div>
            {templateProvenance.length > 0 && (
              <div className="draftNavigatorCard templateBasisCard">
                <p className="draftTemplateEyebrow">Template Basis</p>
                <div className="templateBasisList">
                  {templateProvenance.map((item, index) => (
                    <div
                      key={`${item.type || "basis"}-${index}`}
                      className="templateBasisItem"
                    >
                      <strong>{item.label || item.type || "Source policy"}</strong>
                      <span>{item.source || item.role || "Declared source policy"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <div
            ref={sheetRef}
            className={`draftPaperSheet compact zoom-${zoomLevel.replace("%", "")}`}
          >
            <div className="draftHeaderZone" aria-label="Document header">
              {(["left", "center", "right"] as const).map((slot) => (
                <input
                  key={`header-${slot}`}
                  value={headerFooter.header[slot] || ""}
                  onChange={(event) =>
                    updateHeaderFooterSlot("header", slot, event.target.value)
                  }
                  placeholder={slot === "center" ? "Header" : ""}
                  aria-label={`Header ${slot}`}
                  disabled={!roleCanEdit(currentRole)}
                />
              ))}
            </div>
            <EditorContent editor={editor} />
            <div className="draftFooterZone" aria-label="Document footer">
              {(["left", "center", "right"] as const).map((slot) => (
                <input
                  key={`footer-${slot}`}
                  value={renderPageNumberText(headerFooter.footer[slot] || "", 1)}
                  onChange={(event) =>
                    updateHeaderFooterSlot("footer", slot, event.target.value)
                  }
                  placeholder={slot === "center" ? "Page 1" : ""}
                  aria-label={`Footer ${slot}`}
                  disabled={!roleCanEdit(currentRole)}
                />
              ))}
            </div>

            {selectionMenuTop !== null && (
              <div className="draftSelectionBubble" style={{ top: `${selectionMenuTop}px` }}>
                <Button
                  type="button"
                  onClick={() => startAnnotation(editor, "comment")}
                  aria-label="Add comment"
                >
                  <MessageSquarePlus size={22} />
                </Button>
                <Button
                  type="button"
                  onClick={() => startAnnotation(editor, "reaction")}
                  aria-label="Add reaction"
                >
                  <SmilePlus size={22} />
                </Button>
              </div>
            )}

            {findPanelOpen && (
              <div className="draftFindPanel">
                <div className="draftFindPanelHeader">
                  <strong>Find and Replace</strong>
                  <Button type="button" onClick={() => setFindPanelOpen(false)}>
                    Close
                  </Button>
                </div>
                <label>
                  <span>Find</span>
                  <input
                    value={findQuery}
                    onChange={(event) => {
                      setFindQuery(event.target.value);
                      setActiveFindIndex(0);
                    }}
                    placeholder="Find text"
                  />
                </label>
                <label>
                  <span>Replace</span>
                  <input
                    value={replaceQuery}
                    onChange={(event) => setReplaceQuery(event.target.value)}
                    placeholder="Replace with"
                  />
                </label>
                <div className="draftFindToggleRow">
                  <label>
                    <input
                      type="checkbox"
                      checked={matchCase}
                      onChange={(event) => setMatchCase(event.target.checked)}
                    />
                    Match case
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={wholeWord}
                      onChange={(event) => setWholeWord(event.target.checked)}
                    />
                    Whole word
                  </label>
                </div>
                <div className="draftFindActions">
                  <Button type="button" onClick={() => moveToMatch(activeFindIndex + 1)}>
                    Find next
                  </Button>
                  <Button type="button" onClick={replaceCurrentMatch} disabled={!findMatches.length}>
                    Replace
                  </Button>
                  <Button type="button" onClick={replaceAllMatches} disabled={!findMatches.length}>
                    Replace all
                  </Button>
                </div>
                <p className="draftFindMeta">
                  {findMatches.length
                    ? `${Math.min(activeFindIndex + 1, findMatches.length)} of ${findMatches.length} matches`
                    : "No matches"}
                </p>
              </div>
            )}
          </div>

          <aside className="draftCommentRail">
            <div className="draftInsightStack">
              <div className="draftInsightCard">
                <p className="draftTemplateEyebrow">Source Drawer</p>
                {selectedBlockMeta ? (
                  <div className="draftSourceDrawerBody">
                    <div className="draftSourceDrawerHeader">
                      <strong>{selectedBlockMeta.sectionTitle || "Selected block"}</strong>
                      <div className="draftSourceBadgeRow">
                        <span className={`draftMetaBadge evidence-${selectedBlockMeta.evidenceStatus || "unknown"}`}>
                          {selectedBlockMeta.evidenceStatus || "unknown"}
                        </span>
                        <span className="draftMetaBadge">{selectedBlockMeta.sourceType || "source-unspecified"}</span>
                        <span className="draftMetaBadge">Confidence {formatConfidence(selectedBlockMeta.confidence)}</span>
                      </div>
                    </div>
                    <p className="draftSourceDrawerExcerpt">
                      {selectedBlockMeta.text ||
                        (Array.isArray(selectedBlockMeta.items)
                          ? selectedBlockMeta.items.join(" ")
                          : "Select an AI-generated block to inspect its source support.")}
                    </p>
                    {Array.isArray(selectedBlockMeta.referencedProvisions) &&
                      selectedBlockMeta.referencedProvisions.length > 0 && (
                        <div className="draftInsightGroup">
                          <h4>Referenced Provisions</h4>
                          <div className="draftProvisionList">
                            {selectedBlockMeta.referencedProvisions.map((item, index) => (
                              <div
                                key={`${item.reference_id || item.label || "provision"}-${index}`}
                                className="draftProvisionItem"
                              >
                                <strong>{item.label || item.reference_id || "Provision"}</strong>
                                {item.described_as && <span>{item.described_as}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    <div className="draftInsightGroup">
                      <h4>Document Sources</h4>
                      {selectedBlockMeta.sourceRefs.length > 0 ? (
                        <div className="draftSourceRefList">
                          {selectedBlockMeta.sourceRefs.map(renderSourceRef)}
                        </div>
                      ) : (
                        <p className="draftInsightEmpty">
                          This block is guarded or analytical and does not yet carry verified document citations.
                        </p>
                      )}
                    </div>
                    <div className="draftInsightGroup">
                      <h4>Legal Authority</h4>
                      {selectedBlockMeta.legalSourceRefs.length > 0 ? (
                        <div className="draftSourceRefList">
                          {selectedBlockMeta.legalSourceRefs.map(renderLegalSourceRef)}
                        </div>
                      ) : (
                        <p className="draftInsightEmpty">
                          No structured legal authority is attached to this block.
                        </p>
                      )}
                    </div>
                    {(selectedBlockMeta.warnings?.length || selectedBlockMeta.placeholders?.length) ? (
                      <div className="draftInsightGroup">
                        <h4>Open Issues</h4>
                        <ul className="draftOpenIssueList">
                          {(selectedBlockMeta.warnings || []).map((warning, index) => (
                            <li key={`warning-${index}`}>{warning}</li>
                          ))}
                          {(selectedBlockMeta.placeholders || []).map((item, index) => (
                            <li key={`placeholder-${index}`}>Open item: {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="draftInsightEmpty">
                    Select an AI-generated paragraph or list to inspect supporting sources.
                  </p>
                )}
              </div>

              {aiGeneratedComments.length > 0 && (
                <div className="draftInsightCard">
                  <p className="draftTemplateEyebrow">AI Review Notes</p>
                  <div className="draftAiNotesList">
                    {aiGeneratedComments.map((note: DraftAiReviewNote) => (
                      <button
                        key={note.id}
                        type="button"
                        className={`draftAiNoteCard severity-${note.severity || "review"}`}
                        onClick={() => jumpToBlock(note.blockId)}
                      >
                        <strong>{note.sectionTitle || note.classification || "Review note"}</strong>
                        {note.excerpt ? <blockquote>{note.excerpt}</blockquote> : null}
                        <p>{note.note}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {pendingAnnotation && (
              <div
                className="draftCommentComposerInline"
                style={{ top: `${pendingTop || 0}px` }}
              >
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
                      <Button
                        type="button"
                        className="commentInlineSecondaryBtn"
                        onClick={onClearPendingAnnotation}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="commentInlineActionBtn"
                        onClick={onAddPendingComment}
                        disabled={!roleCanEdit(currentRole) || !commentDraft.trim()}
                      >
                        Add comment
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="reactionPickerRow">
                    {["👍", "✅", "⚠️", "💡"].map((emoji) => (
                      <Button key={emoji} type="button" onClick={() => onAddReaction(emoji)}>
                        {emoji}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      className="commentInlineSecondaryBtn"
                      onClick={onClearPendingAnnotation}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="commentInlineList">
              {sortedComments.map((comment) => (
                <article
                  key={comment.id}
                  className={`inlineCommentCard ${comment.status} ${comment.type} ${
                    comment.id === activeAnnotationId ? "active" : ""
                  }`}
                  style={{ top: `${commentLayout[comment.id] || 0}px` }}
                  onClick={() => onSelectAnnotation(comment.id)}
                >
                  <div className="inlineCommentHeader">
                    <strong>{comment.author}</strong>
                    <div className="commentOverflowWrap">
                      <Button
                        type="button"
                        className="commentOverflowBtn"
                        aria-label="Comment options"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenCommentMenuId((current) =>
                            current === comment.id ? null : comment.id,
                          );
                        }}
                      >
                        ...
                      </Button>
                      {openCommentMenuId === comment.id && (
                        <div className="commentOverflowMenu">
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingCommentId(comment.id);
                              setEditingDraft(comment.note);
                              setOpenCommentMenuId(null);
                            }}
                          >
                            Edit comment
                          </Button>
                          <Button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteComment(comment.id);
                              setOpenCommentMenuId(null);
                            }}
                          >
                            Delete comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <blockquote>{comment.excerpt}</blockquote>
                  {editingCommentId === comment.id ? (
                    <div className="inlineCommentEdit">
                      <textarea
                        value={editingDraft}
                        onChange={(event) => setEditingDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className="inlineCommentActions">
                        <Button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingCommentId(null);
                            setEditingDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!editingDraft.trim()) return;
                            onUpdateComment(comment.id, editingDraft.trim());
                            setEditingCommentId(null);
                            setEditingDraft("");
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p>{comment.note}</p>
                  )}
                  {comment.replies.length > 0 && (
                    <div className="commentReplyList">
                      {comment.replies.map((reply) => (
                        <p key={reply.id}>
                          <strong>{reply.author}</strong> {reply.note}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="commentReplyBox" onClick={(event) => event.stopPropagation()}>
                    <textarea
                      value={replyDrafts[comment.id] || ""}
                      onChange={(event) =>
                        setReplyDrafts((current) => ({
                          ...current,
                          [comment.id]: event.target.value,
                        }))
                      }
                      placeholder="Reply..."
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        const reply = (replyDrafts[comment.id] || "").trim();
                        if (!reply) return;
                        onAddReply(comment.id, reply);
                        setReplyDrafts((current) => ({ ...current, [comment.id]: "" }));
                      }}
                    >
                      Reply
                    </Button>
                  </div>
                  <div className="inlineCommentActions">
                    <Button type="button" onClick={() => onAcceptComment(comment.id)}>
                      Accept
                    </Button>
                    <Button type="button" onClick={() => onRejectComment(comment.id)}>
                      Reject
                    </Button>
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
