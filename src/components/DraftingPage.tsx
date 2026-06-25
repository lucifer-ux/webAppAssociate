import "../componentStyling/HomeDashboardStyling.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { ChevronLeft, X } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import Button from "./Button";
import DraftingDocument, {
  type DraftingEditorHandle,
  type DraftingToolbarState,
} from "./DraftingDocument";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";
import {
  createDraft,
  deriveDraftContextFromMatter,
  getDraftReview,
  getDraft,
  generateDraftFormat,
  hashDraftContent,
  patchDraft,
  saveDraft,
  openSingleDraftStream,
  openDraftCritiqueStream,
  askDraftAi,
  formatDraft,
  triggerDraftReview,
  type AccessRole,
  type DraftComment,
  type DraftDetail,
  type DraftFormatProposal,
  type PendingAnnotation,
  type ParagraphStyle,
  type ZoomLevel,
} from "./draftingApi";
import { buildDraftingExtensions } from "./draftingExtensions";
import {
  isMockMatterId,
} from "../utils/mockMatterIngestion";

const FONT_FAMILIES = ["Newsreader", "Georgia", "Times New Roman", "Work Sans"];
const COLOR_CHOICES = ["#1b1c19", "#4c0003", "#6f5d55", "#0f5b78"];
const DRAFT_REVIEW_POLL_INTERVAL_MS = 5000;
const formatTimingSeconds = (elapsedMs: number) => Number((elapsedMs / 1000).toFixed(2));
const logDraftTiming = (
  label: string,
  payload: Record<string, unknown>,
) => {
  console.info("[draft-timing]", {
    label,
    ...payload,
  });
};
const styleMap: Record<ParagraphStyle, string> = {
  normal: "P",
  title: "TITLE",
  "heading-1": "H1",
  "heading-2": "H2",
  "heading-3": "H3",
  "heading-4": "H4",
  "heading-5": "H5",
  "heading-6": "H6",
  quote: "BLOCKQUOTE",
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sourceTextToHtml = (title: string, text: string) => {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 220);

  return [
    `<h1>${escapeHtml(title || "Source document")}</h1>`,
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`),
  ].join("");
};

const blankDraftHtml = () =>
  [
    "<h1>Untitled legal draft</h1>",
    "<p></p>",
  ].join("");

const sanitizeDraftContentJson = (node: JSONContent | null | undefined): JSONContent => {
  if (!node || typeof node !== "object") {
    return { type: "doc", content: [] };
  }

  const sanitizeNode = (contentNode: JSONContent): JSONContent | null => {
    if (!contentNode || typeof contentNode !== "object") return null;

    const textValue =
      typeof contentNode.text === "string" ? contentNode.text.trim() : contentNode.text;
    if (textValue === "[object Object]") {
      return null;
    }

    const nextContent = Array.isArray(contentNode.content)
      ? contentNode.content
          .map((child) => sanitizeNode(child))
          .filter((child): child is JSONContent => Boolean(child))
      : undefined;

    if (
      Array.isArray(nextContent) &&
      nextContent.length === 0 &&
      (contentNode.type === "paragraph" ||
        contentNode.type === "listItem" ||
        contentNode.type === "bulletList" ||
        contentNode.type === "orderedList")
    ) {
      return null;
    }

    return {
      ...contentNode,
      ...(nextContent ? { content: nextContent } : {}),
    };
  };

  const sanitizedRoot = sanitizeNode(node);
  if (!sanitizedRoot || sanitizedRoot.type !== "doc") {
    return { type: "doc", content: [] };
  }
  return sanitizedRoot;
};

const sanitizeDraftDetailContent = (draft: DraftDetail): DraftDetail => ({
  ...draft,
  contentJson: sanitizeDraftContentJson(draft.contentJson || {}),
});

const initialToolbarState: DraftingToolbarState = {
  paragraphStyle: "normal",
  fontFamily: "Newsreader",
  fontSize: 12,
  textColor: "#1b1c19",
  blankFieldCount: 0,
  wordCount: 0,
  characterCount: 0,
  canUndo: false,
  canRedo: false,
  isBoldActive: false,
  isItalicActive: false,
  isUnderlineActive: false,
  isStrikeActive: false,
  isHighlightActive: false,
  isLinkActive: false,
  isAlignLeftActive: true,
  isAlignCenterActive: false,
  isAlignRightActive: false,
  isAlignJustifyActive: false,
  isBulletListActive: false,
  isOrderedListActive: false,
  headings: [],
};

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "loading";

type SingleDraftStreamState = {
  draftId: string;
  title: string;
  stage: string;
  statusMessage: string;
  thinkingText: string;
  thinkingHistory: string[];
};

type StreamedCritiqueState = {
  status: "idle" | "running" | "ready" | "error";
  message: string;
  commentCount: number;
};

type DraftFormattingState = {
  status: "idle" | "running" | "ready" | "error";
  message: string;
};

type AskAiState = {
  isOpen: boolean;
  message: string;
  status: "idle" | "running" | "ready" | "error";
  answer: string;
  error: string;
};

const SINGLE_DRAFT_STAGE_ORDER = [
  "loading_context",
  "matter_grounding",
  "targeted_grounding",
  "drafting",
  "case_citation_review",
  "formatting",
  "saving",
] as const;

const appendLimitedEntries = (current: string[], next: string, maxEntries = 80) => {
  const normalized = String(next || "").trim();
  if (!normalized) return current;
  const deduped =
    current.length && current[current.length - 1] === normalized
      ? current
      : [...current, normalized];
  return deduped.slice(-maxEntries);
};

const chunkWords = (text: string, size = 150) => {
  const words = String(text || "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size).join(" "));
  }
  return chunks;
};

const makeTextNodesWithBreaks = (text: string): JSONContent[] => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());
  const content: JSONContent[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      content.push({ type: "hardBreak" });
    }
    if (line) {
      content.push({ type: "text", text: line });
    }
  });
  return content;
};

const makeMarkedTextNodesWithBreaks = (
  text: string,
  marks: JSONContent["marks"] = [],
): JSONContent[] => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");
  const content: JSONContent[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      content.push({ type: "hardBreak" });
    }
    if (line) {
      content.push({
        type: "text",
        text: line,
        ...(marks && marks.length ? { marks } : {}),
      });
    }
  });
  return content;
};

const normalizeWithIndexMap = (text: string) => {
  const normalizedChars: string[] = [];
  const map: number[] = [];
  let previousWasSpace = true;
  Array.from(String(text || "")).forEach((char, index) => {
    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        normalizedChars.push(" ");
        map.push(index);
      }
      previousWasSpace = true;
      return;
    }
    normalizedChars.push(char);
    map.push(index);
    previousWasSpace = false;
  });
  while (normalizedChars.length && normalizedChars[normalizedChars.length - 1] === " ") {
    normalizedChars.pop();
    map.pop();
  }
  return {
    normalized: normalizedChars.join(""),
    map,
  };
};

const findTextRange = (text: string, excerpt: string) => {
  const original = String(text || "");
  const exactExcerpt = String(excerpt || "");
  const exactIndex = exactExcerpt ? original.indexOf(exactExcerpt) : -1;
  if (exactIndex >= 0) {
    return { start: exactIndex, end: exactIndex + exactExcerpt.length };
  }
  const normalizedText = normalizeWithIndexMap(original);
  const normalizedExcerpt = normalizeWithIndexMap(exactExcerpt).normalized;
  const normalizedIndex = normalizedExcerpt
    ? normalizedText.normalized.indexOf(normalizedExcerpt)
    : -1;
  if (normalizedIndex < 0) return null;
  const start = normalizedText.map[normalizedIndex];
  const endMapped = normalizedText.map[normalizedIndex + normalizedExcerpt.length - 1];
  if (!Number.isInteger(start) || !Number.isInteger(endMapped)) return null;
  return { start, end: endMapped + 1 };
};

const buildInlineRedlineContent = ({
  fullText,
  excerpt,
  suggestedText,
}: {
  fullText: string;
  excerpt: string;
  suggestedText: string;
}) => {
  const range = findTextRange(fullText, excerpt);
  if (!range) return null;
  const before = fullText.slice(0, range.start);
  const after = fullText.slice(range.end);
  return [
    ...makeTextNodesWithBreaks(before),
    ...makeMarkedTextNodesWithBreaks(suggestedText, [
      { type: "highlight", attrs: { color: "#fef3c7" } },
      { type: "textStyle", attrs: { color: "#713f12" } },
    ]),
    ...makeTextNodesWithBreaks(after),
  ];
};

const replaceBlockTextById = (
  node: JSONContent,
  blockId: string,
  nextText: string,
): JSONContent => {
  if (!node || typeof node !== "object") return node;
  const attrs = node.attrs && typeof node.attrs === "object" ? node.attrs : undefined;
  const content = Array.isArray(node.content) ? node.content : undefined;
  const normalizedBlockId = String(blockId || "").trim();
  const isTarget = String(attrs?.blockId || "").trim() === normalizedBlockId;

  if (isTarget && (node.type === "paragraph" || node.type === "heading")) {
    return {
      ...node,
      content: makeTextNodesWithBreaks(nextText),
    };
  }

  if (!content) return node;
  return {
    ...node,
    content: content.map((child) => replaceBlockTextById(child, blockId, nextText)),
  };
};

const replaceExcerptWithInlineRedline = (
  node: JSONContent,
  options: {
    blockId?: string;
    excerpt: string;
    suggestedText: string;
  },
): { node: JSONContent; replaced: boolean; originalText: string } => {
  if (!node || typeof node !== "object") {
    return { node, replaced: false, originalText: "" };
  }
  const content = Array.isArray(node.content) ? node.content : undefined;
  const attrs = node.attrs && typeof node.attrs === "object" ? node.attrs : undefined;
  const targetBlockId = String(options.blockId || "").trim();
  const isCandidate =
    (node.type === "paragraph" || node.type === "heading") &&
    (!targetBlockId || String(attrs?.blockId || "").trim() === targetBlockId);
  if (isCandidate) {
    const fullText = extractInlineText(node);
    const redlineContent = buildInlineRedlineContent({
      fullText,
      excerpt: options.excerpt,
      suggestedText: options.suggestedText,
    });
    if (redlineContent) {
      const range = findTextRange(fullText, options.excerpt);
      return {
        replaced: true,
        originalText: range ? fullText.slice(range.start, range.end) : options.excerpt,
        node: {
          ...node,
          content: redlineContent,
        },
      };
    }
  }
  if (!content) return { node, replaced: false, originalText: "" };
  let replaced = false;
  let originalText = "";
  const nextContent = content.map((child) => {
    if (replaced) return child;
    const result = replaceExcerptWithInlineRedline(child, options);
    if (result.replaced) {
      replaced = true;
      originalText = result.originalText;
    }
    return result.node;
  });
  return {
    replaced,
    originalText,
    node: replaced ? { ...node, content: nextContent } : node,
  };
};

const replaceInlineRedlineWithText = (
  node: JSONContent,
  options: {
    blockId?: string;
    originalText: string;
    appliedText: string;
    keep: "original" | "applied";
  },
): { node: JSONContent; replaced: boolean } => {
  const replacement = options.keep === "applied" ? options.appliedText : options.originalText;
  const combined = `${options.originalText}${options.appliedText}`;
  const result = replaceFirstMatchingExcerpt(
    node,
    combined,
    replacement,
    options.blockId,
  );
  if (result.replaced) return result;
  return replaceFirstMatchingExcerpt(
    node,
    options.appliedText,
    replacement,
    options.blockId,
  );
};

const extractInlineText = (node: JSONContent | null | undefined): string => {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return String(node.text || "");
  if (node.type === "hardBreak") return "\n";
  const content = Array.isArray(node.content) ? node.content : [];
  return content.map((child) => extractInlineText(child)).join("");
};

const findBlockTextById = (
  node: JSONContent,
  blockId: string,
): string => {
  if (!node || typeof node !== "object") return "";
  const attrs = node.attrs && typeof node.attrs === "object" ? node.attrs : undefined;
  const normalizedBlockId = String(blockId || "").trim();
  if (String(attrs?.blockId || "").trim() === normalizedBlockId) {
    return extractInlineText(node).trim();
  }
  const content = Array.isArray(node.content) ? node.content : [];
  for (const child of content) {
    const result = findBlockTextById(child, blockId);
    if (result) return result;
  }
  return "";
};

const replaceFirstMatchingExcerpt = (
  node: JSONContent,
  excerpt: string,
  nextText: string,
  blockId?: string,
): { node: JSONContent; replaced: boolean } => {
  if (!node || typeof node !== "object") return { node, replaced: false };
  const content = Array.isArray(node.content) ? node.content : undefined;
  const attrs = node.attrs && typeof node.attrs === "object" ? node.attrs : undefined;
  const targetBlockId = String(blockId || "").trim();
  const normalizedExcerpt = String(excerpt || "").replace(/\s+/g, " ").trim();
  const fullText = extractInlineText(node);
  const nodeText = fullText.replace(/\s+/g, " ").trim();
  if (
    normalizedExcerpt &&
    nodeText &&
    (node.type === "paragraph" || node.type === "heading") &&
    (!targetBlockId || String(attrs?.blockId || "").trim() === targetBlockId) &&
    nodeText.includes(normalizedExcerpt)
  ) {
    const range = findTextRange(fullText, excerpt);
    return {
      replaced: true,
      node: {
        ...node,
        content: range
          ? makeTextNodesWithBreaks(
              `${fullText.slice(0, range.start)}${nextText}${fullText.slice(range.end)}`,
            )
          : makeTextNodesWithBreaks(nextText),
      },
    };
  }
  if (!content) return { node, replaced: false };
  let replaced = false;
  const nextContent = content.map((child) => {
    if (replaced) return child;
    const result = replaceFirstMatchingExcerpt(child, excerpt, nextText, blockId);
    if (result.replaced) replaced = true;
    return result.node;
  });
  return {
    replaced,
    node: replaced ? { ...node, content: nextContent } : node,
  };
};

const DraftingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editorRef = useRef<DraftingEditorHandle | null>(null);
  const activeDraftRef = useRef<DraftDetail | null>(null);
  const savedHashRef = useRef("");
  const currentHashRef = useRef("");
  const contextDirtyRef = useRef(false);
  const { isSideBarCollapsed, setIsSideBarCollapsed } =
    usePersistedSidebarState();
  const { matters, activeMatter, setActiveMatterId } = useMatterStore();
  const matterIdFromQuery = String(searchParams.get("matter") || "").trim();
  const draftIdFromQuery = String(searchParams.get("draft") || "").trim();
  const startDraftFromQuery = String(searchParams.get("startDraft") || "").trim();
  const draftLabelFromQuery = String(searchParams.get("draftLabel") || "").trim();
  const draftKeyFromQuery = String(searchParams.get("draftKey") || "").trim();
  const requestedFromQuery = String(searchParams.get("requestedFrom") || "overview").trim();
  const sourceDocumentFromQuery = String(searchParams.get("sourceDocument") || "").trim();
  const sourceDraftRequestRef = useRef("");
  const blankDraftRequestRef = useRef("");
  const draftGenerationStartRequestRef = useRef("");
  const lastDraftReviewPollAtRef = useRef<Record<string, number>>({});
  const selectedMatter = useMemo(
    () =>
      matters.find((matter) => matter.id === matterIdFromQuery) ||
      activeMatter ||
      null,
    [activeMatter, matterIdFromQuery, matters],
  );
  const selectedMatterDraftId =
    selectedMatter && isMockMatterId(selectedMatter.id)
      ? null
      : selectedMatter?.id || null;

  const [activeDraft, setActiveDraft] = useState<DraftDetail | null>(null);
  const [documentTitle, setDocumentTitle] = useState("Untitled legal draft");
  const [currentRole] = useState<AccessRole>("editor");
  const [requestEditPending, setRequestEditPending] = useState(false);
  const [comments, setComments] = useState<DraftComment[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<PendingAnnotation | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [toolbarState, setToolbarState] = useState<DraftingToolbarState>(initialToolbarState);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("100%");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [currentContentJson, setCurrentContentJson] = useState(activeDraft?.contentJson || {});
  const [loadError, setLoadError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [formatProposal, setFormatProposal] = useState<DraftFormatProposal | null>(null);
  const [isGeneratingFormat, setIsGeneratingFormat] = useState(false);
  const [formatGenerationError, setFormatGenerationError] = useState("");
  const [streamedCritiqueState, setStreamedCritiqueState] = useState<StreamedCritiqueState>({
    status: "idle",
    message: "",
    commentCount: 0,
  });
  const [draftFormattingState, setDraftFormattingState] = useState<DraftFormattingState>({
    status: "idle",
    message: "",
  });
  const [askAiState, setAskAiState] = useState<AskAiState>({
    isOpen: false,
    message: "",
    status: "idle",
    answer: "",
    error: "",
  });
  const [singleDraftStreamState, setSingleDraftStreamState] =
    useState<SingleDraftStreamState | null>(null);
  const [singleDraftTypedThinking, setSingleDraftTypedThinking] = useState("");
  const [singleDraftAnimatingPageIndex, setSingleDraftAnimatingPageIndex] = useState(-1);
  const [singleDraftCommittedPageCount, setSingleDraftCommittedPageCount] = useState(0);
  const singleDraftAnimationRef = useRef({ running: false, seenCount: 0 });
  const singleDraftCritiqueRequestRef = useRef("");
  const singleDraftFormattingRequestRef = useRef("");
  const singleDraftFormattingRetryRef = useRef("");
  const singleDraftTimingRef = useRef<{
    startedAt: number;
    currentStage: string;
    currentStageStartedAt: number;
    currentDocumentFileName: string;
    currentDocumentStartedAt: number;
    completedDocuments: number;
    totalDocuments: number;
    draftId: string;
    formattingStartedAt: number;
  }>({
    startedAt: 0,
    currentStage: "",
    currentStageStartedAt: 0,
    currentDocumentFileName: "",
    currentDocumentStartedAt: 0,
    completedDocuments: 0,
    totalDocuments: 0,
    draftId: "",
    formattingStartedAt: 0,
  });
  const markSingleDraftStageComplete = useCallback(
    (completedAt: number, reason?: string) => {
      const tracker = singleDraftTimingRef.current;
      if (!tracker.currentStage || tracker.currentStageStartedAt <= 0) return;
      const elapsedMs = Math.max(0, completedAt - tracker.currentStageStartedAt);
      logDraftTiming("stage_complete", {
        matterId: matterIdFromQuery,
        draftId: tracker.draftId,
        stage: tracker.currentStage,
        elapsedMs,
        elapsedSeconds: formatTimingSeconds(elapsedMs),
        totalElapsedMs: Math.max(0, completedAt - tracker.startedAt),
        totalElapsedSeconds: formatTimingSeconds(
          Math.max(0, completedAt - tracker.startedAt),
        ),
        ...(reason ? { reason } : {}),
      });
      tracker.currentStage = "";
      tracker.currentStageStartedAt = 0;
    },
    [matterIdFromQuery],
  );
  const beginSingleDraftStage = useCallback(
    (stage: string, startedAt: number, reason?: string) => {
      if (!stage) return;
      const tracker = singleDraftTimingRef.current;
      tracker.currentStage = stage;
      tracker.currentStageStartedAt = startedAt;
      logDraftTiming("stage_started", {
        matterId: matterIdFromQuery,
        draftId: tracker.draftId,
        stage,
        totalElapsedMs: Math.max(0, startedAt - tracker.startedAt),
        totalElapsedSeconds: formatTimingSeconds(
          Math.max(0, startedAt - tracker.startedAt),
        ),
        ...(reason ? { reason } : {}),
      });
    },
    [matterIdFromQuery],
  );
  useEffect(() => {
    activeDraftRef.current = activeDraft;
  }, [activeDraft]);
  const isSingleDraftStreaming = Boolean(singleDraftStreamState);
  const isSingleDraftFormattingStage =
    singleDraftStreamState?.stage === "formatting" ||
    singleDraftStreamState?.stage === "saving";
  const singleDraftThinkingTranscript = useMemo(() => {
    if (!singleDraftStreamState) return [];
    const entries = [...singleDraftStreamState.thinkingHistory];
    const liveEntry = String(singleDraftStreamState.thinkingText || "").trim();
    if (liveEntry && (!entries.length || entries[entries.length - 1] !== liveEntry)) {
      entries.push(liveEntry);
    }
    return entries.slice(-80);
  }, [
    singleDraftStreamState,
  ]);
  const singleDraftThinkingPages = useMemo(
    () => chunkWords(singleDraftThinkingTranscript.join(" "), 150),
    [singleDraftThinkingTranscript],
  );
  const singleDraftCompletedPages = useMemo(
    () => singleDraftThinkingPages.slice(0, singleDraftCommittedPageCount),
    [singleDraftCommittedPageCount, singleDraftThinkingPages],
  );
  const singleDraftCurrentPage =
    singleDraftAnimatingPageIndex >= 0
      ? singleDraftThinkingPages[singleDraftAnimatingPageIndex] || ""
      : "";
  const singleDraftExecutionSteps = useMemo(() => {
    const currentStage = String(singleDraftStreamState?.stage || "");
    const currentIndex = SINGLE_DRAFT_STAGE_ORDER.indexOf(
      currentStage as (typeof SINGLE_DRAFT_STAGE_ORDER)[number],
    );
    return [
      { id: "loading_context", label: "Load matter context" },
      { id: "matter_grounding", label: "Use matter grounding" },
      { id: "targeted_grounding", label: "Fetch missing document facts" },
      { id: "drafting", label: "Generate draft text" },
      { id: "case_citation_review", label: "Check case citations" },
      { id: "formatting", label: "Format the structure" },
      { id: "saving", label: "Save to draft workspace" },
    ].map((item, index) => ({
      ...item,
      status:
        currentIndex < 0
          ? "pending"
          : index < currentIndex
            ? "done"
            : index === currentIndex
              ? "current"
              : "pending",
    }));
  }, [singleDraftStreamState?.stage]);
  const draftSidePanelKey = useMemo(() => {
    if (formatProposal || formatGenerationError) {
      return `format:${formatProposal?.title || "error"}:${formatGenerationError || "ok"}`;
    }
    return "";
  }, [
    formatGenerationError,
    formatProposal,
  ]);
  const [dismissedDraftSidePanelKey, setDismissedDraftSidePanelKey] = useState("");
  const isDraftSidePanelVisible =
    Boolean(draftSidePanelKey) && draftSidePanelKey !== dismissedDraftSidePanelKey;
  const hasDraftSidePanelContent = Boolean(
    !isSingleDraftStreaming && (formatProposal || formatGenerationError),
  );

  useEffect(() => {
    if (!matterIdFromQuery) return;
    if (!matters.some((matter) => matter.id === matterIdFromQuery)) return;
    setActiveMatterId(matterIdFromQuery);
  }, [matterIdFromQuery, matters, setActiveMatterId]);

  useEffect(() => {
    if (!draftIdFromQuery) {
      setActiveDraft(null);
      setDocumentTitle("Untitled legal draft");
      setCurrentContentJson({});
      savedHashRef.current = "";
      currentHashRef.current = "";
      contextDirtyRef.current = false;
      setSaveStatus("idle");
      setLoadError("");
      return;
    }

    let cancelled = false;
    setSaveStatus("loading");
    setLoadError("");

    void (async () => {
      try {
        const draft = sanitizeDraftDetailContent(await getDraft(draftIdFromQuery));
        if (cancelled) return;
        setActiveDraft(draft);
        setDocumentTitle(draft.title);
        setCurrentContentJson(draft.contentJson || {});
        const hash = hashDraftContent(draft.contentJson || {});
        savedHashRef.current = hash;
        currentHashRef.current = hash;
        contextDirtyRef.current = false;
        setSaveStatus("saved");
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load draft.");
        setSaveStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftIdFromQuery]);

  const createEditableDraft = useCallback(
    async ({
      title,
      html,
      matterId,
      templateId,
      buildReplaceUrl,
    }: {
      title: string;
      html: string;
      matterId: string | null;
      templateId: string | null;
      buildReplaceUrl: (draft: DraftDetail) => string;
    }) => {
      const context = deriveDraftContextFromMatter(selectedMatter);
      const contentJson = generateJSON(
        html,
        buildDraftingExtensions({
          definedTerms: context.definedTerms,
        }),
      );

      setSaveStatus("saving");
      setLoadError("");
      const createdDraft = sanitizeDraftDetailContent(await createDraft({
        title,
        matterId,
        templateId,
        contentJson,
        context,
      }));
      const hash = hashDraftContent(createdDraft.contentJson || {});
      savedHashRef.current = hash;
      currentHashRef.current = hash;
      contextDirtyRef.current = false;
      setActiveDraft(createdDraft);
      setDocumentTitle(createdDraft.title);
      setCurrentContentJson(createdDraft.contentJson || {});
      setComments([]);
      setPendingAnnotation(null);
      setActiveAnnotationId(null);
      setCommentDraft("");
      setSaveStatus("saved");
      navigate(buildReplaceUrl(createdDraft), { replace: true });
    },
    [navigate, selectedMatter],
  );

  useEffect(() => {
    if (!sourceDocumentFromQuery || draftIdFromQuery || !selectedMatter) return;

    const requestKey = `${selectedMatter.id}:${sourceDocumentFromQuery}`;
    if (sourceDraftRequestRef.current === requestKey) return;
    sourceDraftRequestRef.current = requestKey;

    const sourceDocument = selectedMatter.documentResults?.find(
      (entry) => entry.document.fileName === sourceDocumentFromQuery,
    );
    const sourceText =
      sourceDocument?.page_aware_structure?.full_text ||
      sourceDocument?.preview_text ||
      "";

    if (!sourceDocument || !sourceText.trim()) {
      setLoadError("Source document text is not available for drafting.");
      return;
    }

    const createSourceDraft = async () => {
      try {
        await createEditableDraft({
          title: `Editable source - ${sourceDocument.document.fileName}`,
          matterId: selectedMatterDraftId,
          templateId: "source-document",
          html: sourceTextToHtml(sourceDocument.document.fileName, sourceText),
          buildReplaceUrl: (draft) =>
            `/drafting?draft=${encodeURIComponent(draft.id)}&matter=${encodeURIComponent(selectedMatter.id)}`,
        });
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to open source draft.");
      }
    };

    void createSourceDraft();
  }, [createEditableDraft, draftIdFromQuery, selectedMatter, selectedMatterDraftId, sourceDocumentFromQuery]);

  useEffect(() => {
    if (sourceDocumentFromQuery || !matterIdFromQuery || !startDraftFromQuery) {
      return;
    }

    const requestKey = [
      matterIdFromQuery,
      startDraftFromQuery,
      draftKeyFromQuery,
      draftLabelFromQuery,
      requestedFromQuery,
    ].join(":");
    if (draftGenerationStartRequestRef.current === requestKey) return;
    draftGenerationStartRequestRef.current = requestKey;

    setSaveStatus("loading");
    setLoadError("");
    singleDraftAnimationRef.current = { running: false, seenCount: 0 };
    singleDraftTimingRef.current = {
      startedAt: performance.now(),
      currentStage: "loading_context",
      currentStageStartedAt: performance.now(),
      currentDocumentFileName: "",
      currentDocumentStartedAt: 0,
      completedDocuments: 0,
      totalDocuments: 0,
      draftId: "",
      formattingStartedAt: 0,
    };
    logDraftTiming("draft_run_started", {
      matterId: matterIdFromQuery,
      requestedDraftType: startDraftFromQuery,
      requestedDraftLabel: draftLabelFromQuery || startDraftFromQuery,
    });
    logDraftTiming("stage_started", {
      matterId: matterIdFromQuery,
      draftId: "",
      stage: "loading_context",
      totalElapsedMs: 0,
      totalElapsedSeconds: 0,
    });
    setSingleDraftAnimatingPageIndex(-1);
    setSingleDraftCommittedPageCount(0);
    setSingleDraftStreamState({
      draftId: "",
      title: draftLabelFromQuery || startDraftFromQuery,
      stage: "loading_context",
      statusMessage: "Opening the drafting workspace.",
      thinkingText: "",
      thinkingHistory: [],
    });

    const controller = new AbortController();
    let cancelled = false;
    let completed = false;
    let streamedDraftId = draftIdFromQuery;
    let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const syncActiveDraft = async (draftId: string) => {
      if (!draftId) return;
      const nextDraft = sanitizeDraftDetailContent(await getDraft(draftId));
      if (cancelled) return;
      setActiveDraft(nextDraft);
      setDocumentTitle(nextDraft.title);
      setCurrentContentJson(nextDraft.contentJson || {});
      const nextHash = hashDraftContent(nextDraft.contentJson || {});
      savedHashRef.current = nextHash;
      currentHashRef.current = nextHash;
      setSaveStatus("saved");
    };

    const handleStreamEvent = async (eventName: string, payload: Record<string, unknown>) => {
      if (cancelled) return;
      const pushThinkingEntry = (nextText: string) => {
        const normalized = String(nextText || "").trim();
        if (!normalized) return;
        setSingleDraftStreamState((current) => {
          if (!current) return current;
          const nextHistory = current.thinkingText
            ? appendLimitedEntries(current.thinkingHistory, current.thinkingText)
            : current.thinkingHistory;
          return {
            ...current,
            thinkingHistory: nextHistory,
            thinkingText: normalized,
          };
        });
      };
      switch (eventName) {
        case "draft_created": {
          streamedDraftId = String(payload.draftId || "").trim();
          singleDraftTimingRef.current.draftId = streamedDraftId;
          const nextTitle = String(payload.title || draftLabelFromQuery || startDraftFromQuery).trim();
          setSingleDraftStreamState((current) =>
            current
              ? {
                  ...current,
                  draftId: streamedDraftId,
                  title: nextTitle || current.title,
                }
              : current,
          );
          navigate(
            `/drafting?draft=${encodeURIComponent(streamedDraftId)}&matter=${encodeURIComponent(
              matterIdFromQuery,
            )}&startDraft=${encodeURIComponent(startDraftFromQuery)}&draftLabel=${encodeURIComponent(
              draftLabelFromQuery || nextTitle,
            )}&requestedFrom=${encodeURIComponent(
              requestedFromQuery,
            )}&draftKey=${encodeURIComponent(draftKeyFromQuery || "")}`,
            { replace: true },
          );
          await syncActiveDraft(streamedDraftId);
          break;
        }
        case "status": {
          const tracker = singleDraftTimingRef.current;
          const now = performance.now();
          const nextStage = String(payload.stage || tracker.currentStage || "drafting");
          if (nextStage && nextStage !== tracker.currentStage) {
            markSingleDraftStageComplete(now, "status_transition");
            beginSingleDraftStage(nextStage, now, String(payload.message || "").trim());
          }
          setSingleDraftStreamState((current) =>
            current
              ? {
                  ...current,
                  stage: String(payload.stage || current.stage || "drafting"),
                  statusMessage: String(payload.message || current.statusMessage || ""),
                }
              : current,
          );
          break;
        }
        case "draft_chunk": {
          break;
        }
        case "document_start": {
          const tracker = singleDraftTimingRef.current;
          tracker.currentDocumentFileName = String(payload.fileName || "Document").trim();
          tracker.currentDocumentStartedAt = performance.now();
          tracker.totalDocuments = Number(payload.total || tracker.totalDocuments || 0);
          logDraftTiming("document_started", {
            matterId: matterIdFromQuery,
            draftId: tracker.draftId,
            fileName: tracker.currentDocumentFileName,
            index: Number(payload.index || tracker.completedDocuments + 1),
            total: tracker.totalDocuments,
            totalElapsedMs: Math.max(0, tracker.currentDocumentStartedAt - tracker.startedAt),
            totalElapsedSeconds: formatTimingSeconds(
              Math.max(0, tracker.currentDocumentStartedAt - tracker.startedAt),
            ),
          });
          break;
        }
        case "document_summary": {
          const note = String(payload.summary || "").trim();
          if (!note) break;
          const fileName = String(payload.fileName || "Document").trim();
          const tracker = singleDraftTimingRef.current;
          const completedAt = performance.now();
          const source = String(payload.source || "").trim();
          if (source === "matter_cache") {
            logDraftTiming("document_grounded_from_matter", {
              matterId: matterIdFromQuery,
              draftId: tracker.draftId,
              fileName,
              index: Number(payload.index || 0),
              total: Number(payload.total || 0),
              totalElapsedMs: Math.max(0, completedAt - tracker.startedAt),
              totalElapsedSeconds: formatTimingSeconds(
                Math.max(0, completedAt - tracker.startedAt),
              ),
            });
          } else {
            const documentElapsedMs =
              tracker.currentDocumentStartedAt > 0
                ? Math.max(0, completedAt - tracker.currentDocumentStartedAt)
                : 0;
            tracker.completedDocuments += 1;
            logDraftTiming("document_complete", {
              matterId: matterIdFromQuery,
              draftId: tracker.draftId,
              fileName,
              completedDocuments: tracker.completedDocuments,
              totalDocuments: tracker.totalDocuments,
              elapsedMs: documentElapsedMs,
              elapsedSeconds: formatTimingSeconds(documentElapsedMs),
              totalElapsedMs: Math.max(0, completedAt - tracker.startedAt),
              totalElapsedSeconds: formatTimingSeconds(
                Math.max(0, completedAt - tracker.startedAt),
              ),
              ...(source ? { source } : {}),
            });
          }
          pushThinkingEntry(`${fileName}: ${note}`);
          break;
        }
        case "provider_switch": {
          const reason = String(payload.reason || "").trim();
          pushThinkingEntry(
            reason
              ? `Switching model provider. ${reason}`
              : "Switching model provider.",
          );
          break;
        }
        case "thinking": {
          const text = String(payload.text || "").trim();
          if (!text) break;
          pushThinkingEntry(text);
          break;
        }
        case "final": {
          streamedDraftId = String(payload.draftId || streamedDraftId || "").trim();
          if (streamedDraftId) {
            singleDraftTimingRef.current.draftId = streamedDraftId;
          }
          setSingleDraftTypedThinking("");
          setSingleDraftAnimatingPageIndex(-1);
          setSingleDraftStreamState((current) =>
            current
              ? {
                  ...current,
                  draftId: streamedDraftId || current.draftId,
                  stage: "saving",
                  statusMessage: "Loading the generated draft.",
                  thinkingText: "",
                  thinkingHistory: [],
                }
              : current,
          );
          break;
        }
        case "done": {
          const completedAt = performance.now();
          markSingleDraftStageComplete(completedAt, "stream_done");
          const finalDraftId = String(payload.draftId || streamedDraftId || "").trim();
          if (finalDraftId) {
            await syncActiveDraft(finalDraftId);
            if (cancelled) return;
            navigate(
              `/drafting?draft=${encodeURIComponent(finalDraftId)}&matter=${encodeURIComponent(
                matterIdFromQuery,
              )}&mode=edit`,
              { replace: true },
            );
          }
          completed = true;
          logDraftTiming("draft_run_complete", {
            matterId: matterIdFromQuery,
            draftId: finalDraftId || singleDraftTimingRef.current.draftId,
            totalElapsedMs: Math.max(0, completedAt - singleDraftTimingRef.current.startedAt),
            totalElapsedSeconds: formatTimingSeconds(
              Math.max(0, completedAt - singleDraftTimingRef.current.startedAt),
            ),
          });
          setSingleDraftTypedThinking("");
          setSingleDraftAnimatingPageIndex(-1);
          setSingleDraftCommittedPageCount(0);
          singleDraftAnimationRef.current = { running: false, seenCount: 0 };
          setSingleDraftStreamState(null);
          break;
        }
        case "error": {
          throw new Error(
            String(payload.message || "Single draft generation failed."),
          );
        }
        default:
          break;
      }
    };

    const runSingleDraftStream = async () => {
      try {
        const response = await openSingleDraftStream(
          {
            matterId: matterIdFromQuery,
            draftType: startDraftFromQuery,
            draftKey: draftKeyFromQuery || undefined,
            draftTitle: draftLabelFromQuery || undefined,
            source: "atlas_next_steps",
            requestedFrom:
              requestedFromQuery === "drafts" ? "drafts" : "overview",
          },
          controller.signal,
        );

        if (!response.ok || !response.body) {
          const raw = await response.text();
          let message = "Failed to start draft generation.";
          try {
            const parsed = JSON.parse(raw || "{}") as { error?: string };
            if (parsed?.error) message = parsed.error;
          } catch {
            if (raw.trim()) message = raw.trim();
          }
          throw new Error(message);
        }

        const reader = response.body.getReader();
        streamReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let delimiterIndex = buffer.indexOf("\n\n");
          while (delimiterIndex >= 0) {
            const block = buffer.slice(0, delimiterIndex).trim();
            buffer = buffer.slice(delimiterIndex + 2);
            if (block) {
              const lines = block.split("\n");
              let eventName = "message";
              const dataLines: string[] = [];
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventName = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  dataLines.push(line.slice(5).trim());
                }
              }
              if (dataLines.length) {
                const parsedPayload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
                await handleStreamEvent(eventName, parsedPayload);
                if (completed) {
                  return;
                }
              }
            }
            delimiterIndex = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted || completed) return;
        draftGenerationStartRequestRef.current = "";
        setSingleDraftTypedThinking("");
        setSingleDraftAnimatingPageIndex(-1);
        setSingleDraftCommittedPageCount(0);
        singleDraftAnimationRef.current = { running: false, seenCount: 0 };
        setSingleDraftStreamState(null);
        setActiveDraft(null);
        setSaveStatus("error");
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to start draft generation.",
        );
      }
    };

    void runSingleDraftStream();

    return () => {
      cancelled = true;
      void streamReader?.cancel().catch(() => {});
      if (!completed) {
        controller.abort();
      }
    };
  }, [
    draftGenerationStartRequestRef,
    draftKeyFromQuery,
    draftLabelFromQuery,
    matterIdFromQuery,
    navigate,
    requestedFromQuery,
    sourceDocumentFromQuery,
    startDraftFromQuery,
  ]);

  useEffect(() => {
    if (draftIdFromQuery || sourceDocumentFromQuery || startDraftFromQuery) return;

    const requestKey = selectedMatter?.id || "blank";
    if (blankDraftRequestRef.current === requestKey) return;
    blankDraftRequestRef.current = requestKey;

    const createBlankDraft = async () => {
      try {
        await createEditableDraft({
          title: selectedMatter ? `Draft - ${selectedMatter.title}` : "Untitled legal draft",
          matterId: selectedMatterDraftId,
          templateId: "blank-document",
          html: blankDraftHtml(),
          buildReplaceUrl: (draft) =>
            `/drafting?draft=${encodeURIComponent(draft.id)}${
              selectedMatter?.id ? `&matter=${encodeURIComponent(selectedMatter.id)}` : ""
            }`,
        });
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to open blank draft.");
      }
    };

    void createBlankDraft();
  }, [createEditableDraft, draftIdFromQuery, selectedMatter, selectedMatterDraftId, sourceDocumentFromQuery, startDraftFromQuery]);

  useEffect(() => {
    if (!activeDraft) return;
    setDocumentTitle(activeDraft.title);
  }, [activeDraft?.id, activeDraft?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeDraft) return;
    const trimmedTitle = documentTitle.trim() || "Untitled legal draft";
    if (trimmedTitle === activeDraft.title) return;

    const timeoutId = window.setTimeout(() => {
      void patchDraft(activeDraft.id, { title: trimmedTitle })
        .then((patchedDraft) => {
          setActiveDraft((current) =>
            current && current.id === patchedDraft.id ? { ...current, title: patchedDraft.title } : current,
          );
        })
        .catch(() => {
          // Save flow will retry title persistence even if the debounce patch fails.
        });
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeDraft, documentTitle]);

  const updateCurrentDocument = (contentJson: JSONContent) => {
    setCurrentContentJson(contentJson);
    currentHashRef.current = hashDraftContent(contentJson);
    if (saveStatus !== "saving" && saveStatus !== "loading") {
      setSaveStatus(
        currentHashRef.current === savedHashRef.current && documentTitle.trim() === activeDraft?.title
          ? "saved"
          : "dirty",
      );
    }
  };

  const updateDraftContext = (context: DraftDetail["context"]) => {
    contextDirtyRef.current = true;
    setActiveDraft((current) => (current ? { ...current, context } : current));
    if (saveStatus !== "saving" && saveStatus !== "loading") {
      setSaveStatus("dirty");
    }
  };

  const saveCurrentDraft = useCallback(
    async (saveReason: "autosave" | "manual") => {
      if (!activeDraft) return;

      const nextTitle = documentTitle.trim() || "Untitled legal draft";
      setSaveStatus("saving");
      try {
        const savedDraft = sanitizeDraftDetailContent(await saveDraft({
          draftId: activeDraft.id,
          title: nextTitle,
          contentJson: currentContentJson,
          context: activeDraft.context,
          saveReason,
        }));
        setActiveDraft(savedDraft);
        setDocumentTitle(savedDraft.title);
        savedHashRef.current = hashDraftContent(savedDraft.contentJson || {});
        currentHashRef.current = savedHashRef.current;
        contextDirtyRef.current = false;
        setSaveStatus("saved");
      } catch (error) {
        setSaveStatus("error");
        setLoadError(error instanceof Error ? error.message : "Failed to save draft.");
      }
    },
    [activeDraft, currentContentJson, documentTitle],
  );

  useEffect(() => {
    if (!activeDraft) return;

    const intervalId = window.setInterval(() => {
      const titleDirty = (documentTitle.trim() || "Untitled legal draft") !== activeDraft.title;
      const contentDirty = currentHashRef.current !== savedHashRef.current;
      if (!titleDirty && !contentDirty && !contextDirtyRef.current) return;
      void saveCurrentDraft("autosave");
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeDraft, documentTitle, saveCurrentDraft]);

  useEffect(() => {
    if (!activeDraft?.id || reviewStatus !== "running") return;

    let cancelled = false;
    let timeoutId: number | null = null;
    const draftKey = String(activeDraft.id || "");
    const poll = async () => {
      try {
        lastDraftReviewPollAtRef.current[draftKey] = Date.now();
        const reviewJob = await getDraftReview(activeDraft.id);
        if (cancelled) return;
        if (reviewJob.status === "completed") {
          setComments(
            Array.isArray(reviewJob.result?.annotations)
              ? reviewJob.result.annotations
              : [],
          );
          setReviewStatus("ready");
          return;
        }
        if (reviewJob.status === "failed") {
          setReviewStatus("error");
          setLoadError(reviewJob.error || "Draft review failed.");
          return;
        }
        timeoutId = window.setTimeout(() => {
          void poll();
        }, DRAFT_REVIEW_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        setReviewStatus("error");
        setLoadError(error instanceof Error ? error.message : "Draft review failed.");
      }
    };

    const elapsedSinceLastPoll =
      Date.now() - (lastDraftReviewPollAtRef.current[draftKey] || 0);
    const initialDelay = Math.max(
      0,
      DRAFT_REVIEW_POLL_INTERVAL_MS - elapsedSinceLastPoll,
    );
    timeoutId = window.setTimeout(() => {
      void poll();
    }, initialDelay);
    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeDraft?.id, reviewStatus]);

  useEffect(() => {
    const draftId = String(activeDraft?.id || "").trim();
    const singleDraftStreamContext =
      activeDraft?.context?.singleDraftStream &&
      typeof activeDraft.context.singleDraftStream === "object"
        ? (activeDraft.context.singleDraftStream as Record<string, unknown>)
        : null;
    const latestCritiqueContext =
      activeDraft?.context?.latestCritiqueReview &&
      typeof activeDraft.context.latestCritiqueReview === "object"
        ? (activeDraft.context.latestCritiqueReview as Record<string, unknown>)
        : null;
    const singleDraftStatus = String(singleDraftStreamContext?.status || "").trim();
    const latestCritiqueStatus = String(latestCritiqueContext?.status || "").trim();
    if (!draftId || singleDraftStatus !== "completed") {
      setStreamedCritiqueState((current) =>
        current.status === "running"
          ? { status: "idle", message: "", commentCount: 0 }
          : current,
      );
      return;
    }
    if (latestCritiqueStatus === "completed") {
      return;
    }
    if (singleDraftCritiqueRequestRef.current === draftId) {
      return;
    }
    singleDraftCritiqueRequestRef.current = draftId;
    setStreamedCritiqueState({
      status: "running",
      message: "Critique is reviewing the generated draft.",
      commentCount: 0,
    });

    const controller = new AbortController();
    let cancelled = false;
    let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const runCritiqueStream = async () => {
      try {
        const response = await openDraftCritiqueStream(draftId, controller.signal);
        if (!response.ok || !response.body) {
          const raw = await response.text();
          throw new Error(raw.trim() || "Failed to start critique review.");
        }

        streamReader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await streamReader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let delimiterIndex = buffer.indexOf("\n\n");
          while (delimiterIndex >= 0) {
            const block = buffer.slice(0, delimiterIndex).trim();
            buffer = buffer.slice(delimiterIndex + 2);
            if (block) {
              const lines = block.split("\n");
              let eventName = "message";
              const dataLines: string[] = [];
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventName = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  dataLines.push(line.slice(5).trim());
                }
              }
              if (dataLines.length) {
                const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
                if (eventName === "critique_status") {
                  setStreamedCritiqueState((current) => ({
                    status: "running",
                    commentCount: current.commentCount,
                    message: String(payload.message || "Critique is reviewing the draft."),
                  }));
                } else if (eventName === "critique_comment") {
                  const annotation = payload.annotation as DraftComment | undefined;
                  if (annotation?.id) {
                    setComments((prev) => {
                      const existing = prev.find((item) => item.id === annotation.id);
                      if (existing) return prev;
                      return [...prev, annotation];
                    });
                    setStreamedCritiqueState((current) => ({
                      status: "running",
                      commentCount: current.commentCount + 1,
                      message:
                        String(payload.annotation && "AI generated comment added.") ||
                        current.message,
                    }));
                  }
                } else if (eventName === "critique_done") {
                  setStreamedCritiqueState((current) => ({
                    status: "ready",
                    commentCount:
                      Number(payload.commentCount || current.commentCount || 0) ||
                      current.commentCount,
                    message: "Critique review is complete.",
                  }));
                } else if (eventName === "error") {
                  throw new Error(String(payload.message || "Critique review failed."));
                }
              }
            }
            delimiterIndex = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setStreamedCritiqueState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Critique review failed.",
          commentCount: 0,
        });
        singleDraftCritiqueRequestRef.current = "";
      }
    };

    void runCritiqueStream();

    return () => {
      cancelled = true;
      void streamReader?.cancel().catch(() => {});
      controller.abort();
    };
  }, [activeDraft?.context, activeDraft?.id]);

  useEffect(() => {
    const draftId = String(activeDraft?.id || "").trim();
    const singleDraftStreamContext =
      activeDraft?.context?.singleDraftStream &&
      typeof activeDraft.context.singleDraftStream === "object"
        ? (activeDraft.context.singleDraftStream as Record<string, unknown>)
        : null;
    const latestFormattingContext =
      activeDraft?.context?.latestFormatting &&
      typeof activeDraft.context.latestFormatting === "object"
        ? (activeDraft.context.latestFormatting as Record<string, unknown>)
        : null;
    const singleDraftStatus = String(singleDraftStreamContext?.status || "").trim();
    const latestFormattingStatus = String(latestFormattingContext?.status || "").trim();
    const hasFormattedText = Boolean(
      String(activeDraft?.context?.singleDraftFormattedText || "").trim(),
    );

    if (!draftId || singleDraftStatus !== "completed") {
      setDraftFormattingState((current) =>
        current.status === "running" ? { status: "idle", message: "" } : current,
      );
      return;
    }

    if (latestFormattingStatus === "completed") {
      setDraftFormattingState({
        status: "ready",
        message: "Formatting complete.",
      });
      return;
    }

    if (latestFormattingStatus === "error") {
      if (!hasFormattedText && singleDraftFormattingRetryRef.current !== draftId) {
        singleDraftFormattingRetryRef.current = draftId;
      } else {
        setDraftFormattingState({
          status: "error",
          message: String(latestFormattingContext?.message || "Draft formatting failed."),
        });
        return;
      }
    }

    if (singleDraftFormattingRequestRef.current === draftId) {
      return;
    }

    singleDraftFormattingRequestRef.current = draftId;
    singleDraftTimingRef.current.formattingStartedAt = performance.now();
    logDraftTiming("formatting_started", {
      matterId: selectedMatterDraftId,
      draftId,
      totalElapsedMs: Math.max(
        0,
        singleDraftTimingRef.current.formattingStartedAt - singleDraftTimingRef.current.startedAt,
      ),
      totalElapsedSeconds: formatTimingSeconds(
        Math.max(
          0,
          singleDraftTimingRef.current.formattingStartedAt - singleDraftTimingRef.current.startedAt,
        ),
      ),
    });
    setDraftFormattingState({
      status: "running",
      message: "Formatting the draft for readability.",
    });

    void formatDraft(draftId)
      .then((payload) => {
        const nextDraft = sanitizeDraftDetailContent(payload.draft);
        setActiveDraft((current) =>
          current && current.id === nextDraft.id ? nextDraft : current,
        );
        setCurrentContentJson(nextDraft.contentJson || {});
        setDocumentTitle(nextDraft.title);
        const nextHash = hashDraftContent(nextDraft.contentJson || {});
        savedHashRef.current = nextHash;
        currentHashRef.current = nextHash;
        contextDirtyRef.current = false;
        const completedAt = performance.now();
        const formattingElapsedMs =
          singleDraftTimingRef.current.formattingStartedAt > 0
            ? Math.max(
                0,
                completedAt - singleDraftTimingRef.current.formattingStartedAt,
              )
            : 0;
        logDraftTiming("formatting_complete", {
          matterId: selectedMatterDraftId,
          draftId,
          elapsedMs: formattingElapsedMs,
          elapsedSeconds: formatTimingSeconds(formattingElapsedMs),
          totalElapsedMs: Math.max(0, completedAt - singleDraftTimingRef.current.startedAt),
          totalElapsedSeconds: formatTimingSeconds(
            Math.max(0, completedAt - singleDraftTimingRef.current.startedAt),
          ),
          formatterStatus: payload.formatting?.status || "completed",
          formatterModel: payload.formatting?.model || "",
          sourceCount: payload.formatting?.sourceCount || 0,
        });
        setDraftFormattingState({
          status: "ready",
          message: "Formatting complete.",
        });
      })
      .catch((error) => {
        singleDraftFormattingRequestRef.current = "";
        const completedAt = performance.now();
        const formattingElapsedMs =
          singleDraftTimingRef.current.formattingStartedAt > 0
            ? Math.max(
                0,
                completedAt - singleDraftTimingRef.current.formattingStartedAt,
              )
            : 0;
        logDraftTiming("formatting_error", {
          matterId: selectedMatterDraftId,
          draftId,
          elapsedMs: formattingElapsedMs,
          elapsedSeconds: formatTimingSeconds(formattingElapsedMs),
          totalElapsedMs: Math.max(0, completedAt - singleDraftTimingRef.current.startedAt),
          totalElapsedSeconds: formatTimingSeconds(
            Math.max(0, completedAt - singleDraftTimingRef.current.startedAt),
          ),
          error: error instanceof Error ? error.message : "Draft formatting failed.",
        });
        setDraftFormattingState({
          status: "error",
          message: error instanceof Error ? error.message : "Draft formatting failed.",
        });
      });
  }, [activeDraft?.context, activeDraft?.id]);

  useEffect(() => {
    if (!isSingleDraftStreaming || isSingleDraftFormattingStage) {
      setSingleDraftTypedThinking("");
      setSingleDraftAnimatingPageIndex(-1);
      singleDraftAnimationRef.current.running = false;
      return;
    }
    if (!singleDraftThinkingPages.length) {
      setSingleDraftTypedThinking("");
      setSingleDraftAnimatingPageIndex(-1);
      return;
    }
    let cancelled = false;
    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    const runQueue = () => {
      if (cancelled || singleDraftAnimationRef.current.running) return;
      if (singleDraftAnimationRef.current.seenCount >= singleDraftThinkingPages.length) return;

      const targetIndex = singleDraftAnimationRef.current.seenCount;
      const words =
        singleDraftThinkingPages[targetIndex]?.split(/\s+/).filter(Boolean) || [];
      singleDraftAnimationRef.current.running = true;
      setSingleDraftAnimatingPageIndex(targetIndex);
      setSingleDraftTypedThinking("");
      let wordIndex = 0;

      intervalId = window.setInterval(() => {
        if (cancelled) {
          if (intervalId) window.clearInterval(intervalId);
          return;
        }
        wordIndex += 3;
        setSingleDraftTypedThinking(words.slice(0, wordIndex).join(" "));
        if (wordIndex >= words.length) {
          if (intervalId) window.clearInterval(intervalId);
          singleDraftAnimationRef.current.seenCount = targetIndex + 1;
          setSingleDraftCommittedPageCount(targetIndex + 1);
          timeoutId = window.setTimeout(() => {
            if (cancelled) return;
            singleDraftAnimationRef.current.running = false;
            runQueue();
          }, 220);
        }
      }, 28);
    };

    runQueue();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [
    isSingleDraftFormattingStage,
    isSingleDraftStreaming,
    singleDraftThinkingPages,
  ]);

  const applyCommand = (command: string, value?: string) => {
    editorRef.current?.applyCommand(command, value);
  };

  const runDraftReview = async () => {
    if (!activeDraft) return;
    setReviewStatus("running");
    setLoadError("");
    try {
      await saveCurrentDraft("manual");
      await triggerDraftReview(activeDraft.id);
    } catch (error) {
      setReviewStatus("error");
      setLoadError(error instanceof Error ? error.message : "Failed to run draft review.");
    }
  };

  const changeFontSize = (delta: number) => {
    const nextSize = Math.min(120, Math.max(8, toolbarState.fontSize + delta));
    applyCommand("fontSize", `${nextSize}px`);
  };

  const setFontSizeDirectly = (rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const nextSize = Math.min(120, Math.max(8, rawValue));
    applyCommand("fontSize", `${nextSize}px`);
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
        from: pendingAnnotation.from,
        to: pendingAnnotation.to,
        status: "pending",
        replies: [],
      },
      ...prev,
    ]);
    setCommentDraft("");
    setPendingAnnotation(null);
  };

  const addReaction = (emoji: string) => {
    if (!pendingAnnotation || pendingAnnotation.type !== "reaction") {
      return;
    }

    const commentId = crypto.randomUUID();
    setComments((prev) => [
      {
        id: commentId,
        author: "You",
        excerpt: pendingAnnotation.excerpt,
        note: emoji,
        type: "reaction",
        from: pendingAnnotation.from,
        to: pendingAnnotation.to,
        status: "pending",
        replies: [],
      },
      ...prev,
    ]);
    setActiveAnnotationId(commentId);
    setPendingAnnotation(null);
  };

  const runAskAi = async () => {
    if (!activeDraft || askAiState.status === "running" || !askAiState.message.trim()) return;
    setAskAiState((current) => ({
      ...current,
      status: "running",
      answer: "",
      error: "",
    }));
    try {
      await saveCurrentDraft("manual");
      const payload = await askDraftAi({
        draftId: activeDraft.id,
        message: askAiState.message.trim(),
      });
      const nextAnnotations = (payload.annotations || []).map((annotation) => ({
        ...annotation,
        isAskAiSuggestion: true,
        originalText:
          annotation.blockId
            ? findBlockTextById(currentContentJson, annotation.blockId)
            : annotation.excerpt,
      }));
      setComments((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        return [
          ...prev,
          ...nextAnnotations.filter((item) => !existingIds.has(item.id)),
        ];
      });
      if (nextAnnotations[0]?.id) {
        setActiveAnnotationId(nextAnnotations[0].id);
      }
      setAskAiState((current) => ({
        ...current,
        status: "ready",
        isOpen: nextAnnotations.length ? false : current.isOpen,
        message: nextAnnotations.length ? "" : current.message,
        answer:
          payload.answer ||
          (nextAnnotations.length
            ? `${nextAnnotations.length} suggested change${nextAnnotations.length === 1 ? "" : "s"} added.`
            : "No draft changes were suggested."),
        error: "",
      }));
    } catch (error) {
      setAskAiState((current) => ({
        ...current,
        status: "error",
        error: error instanceof Error ? error.message : "Ask AI failed.",
      }));
    }
  };

  const updateCommentStatus = (id: string, status: DraftComment["status"]) => {
    const acceptedComment =
      status === "accepted" ? comments.find((comment) => comment.id === id) || null : null;
    if (status !== "accepted") {
      setComments((prev) =>
        prev.map((comment) => {
          if (comment.id !== id) return comment;
          return { ...comment, status };
        }),
      );
      return;
    }
    if (
      status === "accepted" &&
      acceptedComment?.suggestedText &&
      activeDraft
    ) {
      const redlineResult = replaceExcerptWithInlineRedline(currentContentJson, {
        blockId: acceptedComment.blockId,
        excerpt: acceptedComment.excerpt,
        suggestedText: acceptedComment.suggestedText,
      });
      if (!redlineResult.replaced) {
        return;
      }
      const nextContent = redlineResult.node;
      const originalText = redlineResult.originalText || acceptedComment.excerpt;
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === id
            ? {
                ...comment,
                status,
                originalText: comment.originalText || originalText,
                appliedText: acceptedComment.suggestedText,
              }
            : comment,
        ),
      );
      setCurrentContentJson(nextContent);
      setActiveDraft((current) =>
        current
          ? {
              ...current,
              contentJson: nextContent,
            }
          : current,
      );
      currentHashRef.current = hashDraftContent(nextContent);
      contextDirtyRef.current = true;
      setSaveStatus("dirty");
      setActiveAnnotationId(null);
      window.requestAnimationFrame(() => {
        setActiveAnnotationId(id);
      });
      return;
    }
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.id !== id) return comment;
        return { ...comment, status };
      }),
    );
  };

  const revertAcceptedAskAiChange = (id: string) => {
    const comment = comments.find((item) => item.id === id);
    if (!comment?.originalText || !comment.appliedText || !activeDraft) return;
    const result = replaceInlineRedlineWithText(currentContentJson, {
      blockId: comment.blockId,
      originalText: comment.originalText,
      appliedText: comment.appliedText,
      keep: "original",
    });
    if (!result.replaced) return;
    const nextContent = result.node;
    setCurrentContentJson(nextContent);
    setActiveDraft((current) =>
      current
        ? {
            ...current,
            contentJson: nextContent,
          }
        : current,
    );
    setComments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "pending",
              appliedText: "",
            }
          : item,
      ),
    );
    currentHashRef.current = hashDraftContent(nextContent);
    contextDirtyRef.current = true;
    setSaveStatus("dirty");
  };

  const finalizeAcceptedAskAiChanges = () => {
    let nextContent = currentContentJson;
    comments
      .filter(
        (comment) =>
          comment.isAskAiSuggestion &&
          comment.status === "accepted" &&
          comment.originalText &&
          comment.appliedText,
      )
      .forEach((comment) => {
        const result = replaceInlineRedlineWithText(nextContent, {
          blockId: comment.blockId,
          originalText: comment.originalText || "",
          appliedText: comment.appliedText || "",
          keep: "applied",
        });
        if (result.replaced) {
          nextContent = result.node;
        }
      });
    if (JSON.stringify(nextContent) !== JSON.stringify(currentContentJson)) {
      setCurrentContentJson(nextContent);
      setActiveDraft((current) =>
        current
          ? {
              ...current,
              contentJson: nextContent,
            }
          : current,
      );
      currentHashRef.current = hashDraftContent(nextContent);
      contextDirtyRef.current = true;
      setSaveStatus("dirty");
    }
    setComments((prev) =>
      prev.filter((comment) => !(comment.isAskAiSuggestion && comment.status === "accepted")),
    );
    setActiveAnnotationId(null);
  };

  const updateCommentNote = (id: string, note: string) => {
    setComments((prev) =>
      prev.map((comment) => (comment.id === id ? { ...comment, note } : comment)),
    );
  };

  const deleteComment = (id: string) => {
    setComments((prev) => prev.filter((comment) => comment.id !== id));
    setActiveAnnotationId((current) => (current === id ? null : current));
  };

  const addCommentReply = (id: string, note: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === id
          ? {
              ...comment,
              replies: [
                ...comment.replies,
                {
                  id: crypto.randomUUID(),
                  author: "You",
                  note,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : comment,
      ),
    );
  };

  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "dirty"
        ? "Unsaved changes"
        : saveStatus === "error"
          ? "Save failed"
          : "Saved to Associate Drive";

  const canRenderEditor = Boolean(activeDraft) && !isSingleDraftStreaming;
  const recommendation = activeDraft?.context?.recommendation;
  const acceptedAskAiChangeCount = comments.filter(
    (comment) => comment.isAskAiSuggestion && comment.status === "accepted",
  ).length;
  const pendingAskAiChangeCount = comments.filter(
    (comment) => comment.isAskAiSuggestion && comment.status === "pending",
  ).length;
  const canGenerateFormat = Boolean(
    activeDraft?.matterId && recommendation?.draft_key,
  );

  const handleGenerateFormat = async () => {
    if (!activeDraft?.matterId || !recommendation?.draft_key || isGeneratingFormat) return;
    setIsGeneratingFormat(true);
    setFormatGenerationError("");
    setFormatProposal(null);
    try {
      setFormatProposal(
        await generateDraftFormat({
          matterId: activeDraft.matterId,
          draftKey: recommendation.draft_key,
        }),
      );
    } catch (error) {
      setFormatGenerationError(
        error instanceof Error ? error.message : "Failed to generate draft format.",
      );
    } finally {
      setIsGeneratingFormat(false);
    }
  };

  const acceptFormatProposal = () => {
    if (!activeDraft || !formatProposal) return;
    const nextContext = {
      ...activeDraft.context,
      ...formatProposal.contextPatch,
      boilerplateMeta: formatProposal.meta || null,
    };
    setActiveDraft({
      ...activeDraft,
      title: formatProposal.title || activeDraft.title,
      contentJson: formatProposal.contentJson,
      context: nextContext,
    });
    setDocumentTitle(formatProposal.title || activeDraft.title);
    setCurrentContentJson(formatProposal.contentJson);
    currentHashRef.current = hashDraftContent(formatProposal.contentJson);
    contextDirtyRef.current = true;
    setSaveStatus("dirty");
    setFormatProposal(null);
  };

  return (
    <div className="homeDashPage">
      <ProductNavbar
        isSideBarCollapsed={isSideBarCollapsed}
        onToggleSidebar={() => setIsSideBarCollapsed((prev) => !prev)}
        draftingChrome={
          canRenderEditor
            ? {
                documentTitle,
                saveStatusLabel,
                currentRole,
                requestEditPending,
                canUndo: toolbarState.canUndo,
                canRedo: toolbarState.canRedo,
                isBoldActive: toolbarState.isBoldActive,
                isItalicActive: toolbarState.isItalicActive,
                isUnderlineActive: toolbarState.isUnderlineActive,
                isStrikeActive: toolbarState.isStrikeActive,
                isHighlightActive: toolbarState.isHighlightActive,
                isAlignLeftActive: toolbarState.isAlignLeftActive,
                isAlignCenterActive: toolbarState.isAlignCenterActive,
                isAlignRightActive: toolbarState.isAlignRightActive,
                isAlignJustifyActive: toolbarState.isAlignJustifyActive,
                isBulletListActive: toolbarState.isBulletListActive,
                isOrderedListActive: toolbarState.isOrderedListActive,
                onDocumentTitleChange: (value: string) => {
                  setDocumentTitle(value);
                  setSaveStatus("dirty");
                },
                onRequestEdit: () => setRequestEditPending(true),
                zoomLevel,
                onZoomChange: setZoomLevel,
                paragraphStyle: toolbarState.paragraphStyle,
                onParagraphStyleChange: (nextStyle: ParagraphStyle) =>
                  applyCommand("formatBlock", styleMap[nextStyle]),
                fontFamily: toolbarState.fontFamily,
                fontFamilies: FONT_FAMILIES,
                onFontFamilyChange: (value: string) => applyCommand("fontName", value),
                fontSize: toolbarState.fontSize,
                onDecreaseFontSize: () => changeFontSize(-2),
                onIncreaseFontSize: () => changeFontSize(2),
                onFontSizeChange: setFontSizeDirectly,
                colorChoices: COLOR_CHOICES,
                onUndo: () => applyCommand("undo"),
                onRedo: () => applyCommand("redo"),
                onPrint: () => window.print(),
                onBold: () => applyCommand("bold"),
                onItalic: () => applyCommand("italic"),
                onUnderline: () => applyCommand("underline"),
                onStrike: () => applyCommand("strike"),
                onHighlight: () => applyCommand("hiliteColor", "#fff0b8"),
                onSetTextColor: (color: string) => applyCommand("foreColor", color),
                onInsertLink: () => editorRef.current?.insertLink(),
                onInsertImage: () => editorRef.current?.insertImage(),
                onInsertTable: () => editorRef.current?.insertTable(),
                onOpenCommentComposer: () => editorRef.current?.startCommentSelection(),
                onOpenFindReplace: () => editorRef.current?.openFindReplace(),
                onRunReview: () => void runDraftReview(),
                onAlignLeft: () => applyCommand("justifyLeft"),
                onAlignCenter: () => applyCommand("justifyCenter"),
                onAlignRight: () => applyCommand("justifyRight"),
                onAlignJustify: () => applyCommand("justifyFull"),
                onBulletList: () => applyCommand("insertUnorderedList"),
                onNumberList: () => applyCommand("insertOrderedList"),
                onOutdent: () => applyCommand("outdent"),
                onIndent: () => applyCommand("indent"),
                onManualSave: () => void saveCurrentDraft("manual"),
                onGenerateFormat: canGenerateFormat
                  ? () => void handleGenerateFormat()
                  : undefined,
                isGeneratingFormat,
              }
            : undefined
        }
      />

      <main
        className={`homeDashMain ${
          canRenderEditor ? "draftingMain" : "draftingTemplateMain"
        } draftingNoAppSidebar`}
      >
        {!isDraftSidePanelVisible && hasDraftSidePanelContent ? (
          <button
            type="button"
            className="draftFormatProposalReveal"
            aria-label="Open draft generation panel"
            onClick={() => setDismissedDraftSidePanelKey("")}
          >
            <ChevronLeft size={16} />
          </button>
        ) : null}
        {isDraftSidePanelVisible && (formatProposal || formatGenerationError) ? (
          <aside className="draftFormatProposal">
            <button
              type="button"
              className="draftFormatProposalClose"
              aria-label="Close draft generation panel"
              onClick={() => setDismissedDraftSidePanelKey(draftSidePanelKey)}
            >
              <X size={16} />
            </button>
            <div>
              <p className="draftTemplateEyebrow">AI Format Proposal</p>
              <h2>{formatProposal?.title || "Format generation failed"}</h2>
              <p>
                {formatGenerationError ||
                  "Exa references were reviewed and an editable document format is ready. Accepting replaces the current blank draft."}
              </p>
              {formatProposal?.sources?.length ? (
                <div className="draftFormatSources">
                  {formatProposal.sources.slice(0, 4).map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="draftFormatProposalActions">
              <Button type="button" onClick={() => {
                setFormatProposal(null);
                setFormatGenerationError("");
              }}>
                Reject
              </Button>
              {formatProposal ? (
                <Button type="button" className="isPrimary" onClick={acceptFormatProposal}>
                  Accept format
                </Button>
              ) : null}
            </div>
          </aside>
        ) : null}
        {canRenderEditor && activeDraft ? (
          <>
            {acceptedAskAiChangeCount > 0 ? (
              <div className="draftAcceptedChangesBar">
                <span>
                  {acceptedAskAiChangeCount} accepted AI change
                  {acceptedAskAiChangeCount === 1 ? "" : "s"} pending finalization
                </span>
                <Button type="button" onClick={finalizeAcceptedAskAiChanges}>
                  Accept changes
                </Button>
              </div>
            ) : null}
            <DraftingDocument
              ref={editorRef}
              draft={activeDraft}
              currentRole={currentRole}
              zoomLevel={zoomLevel}
              activeAnnotationId={activeAnnotationId}
              pendingAnnotation={pendingAnnotation}
              commentDraft={commentDraft}
              comments={comments}
              onDocumentChange={updateCurrentDocument}
              onDraftContextChange={updateDraftContext}
              onToolbarStateChange={setToolbarState}
              onCommentDraftChange={setCommentDraft}
              onStartAnnotation={(annotation) => {
                setPendingAnnotation(annotation);
                setCommentDraft("");
                setActiveAnnotationId(null);
              }}
              onClearPendingAnnotation={() => {
                setPendingAnnotation(null);
                setCommentDraft("");
              }}
              onAddPendingComment={addPendingComment}
              onAddReaction={addReaction}
              onSelectAnnotation={setActiveAnnotationId}
              onAcceptComment={(id) => updateCommentStatus(id, "accepted")}
              onRejectComment={(id) => updateCommentStatus(id, "rejected")}
              onRevertComment={revertAcceptedAskAiChange}
              onUpdateComment={updateCommentNote}
              onDeleteComment={deleteComment}
              onAddReply={addCommentReply}
              onMapComments={setComments}
              onRequestSave={() => void saveCurrentDraft("manual")}
              critiqueState={streamedCritiqueState}
            />
            {draftFormattingState.status === "running" ? (
              <div className="singleDraftFormattingPopup draftPostFormattingPopup" role="status" aria-live="polite">
                <span className="singleDraftFormattingSpinner" aria-hidden="true" />
                <div className="singleDraftFormattingCopy">
                  <p className="draftTemplateEyebrow">Draft Formatting</p>
                  <h2>Formatting</h2>
                  <p>{draftFormattingState.message || "Formatting the draft cleanly. Please wait."}</p>
                </div>
              </div>
            ) : null}
            <div className={`draftAskAiDock ${askAiState.isOpen ? "open" : ""}`}>
              {askAiState.isOpen ? (
                <div className="draftAskAiPanel">
                  <div className="draftAskAiHeader">
                    <div>
                      <p className="draftTemplateEyebrow">Ask AI</p>
                      <h2>Suggest draft changes</h2>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setAskAiState((current) => ({ ...current, isOpen: false }))}
                    >
                      Close
                    </Button>
                  </div>
                  <textarea
                    value={askAiState.message}
                    onChange={(event) =>
                      setAskAiState((current) => ({
                        ...current,
                        message: event.target.value,
                      }))
                    }
                    placeholder="Ask for wording changes, formatting changes, legal-source checks, or a question about this draft."
                  />
                  {askAiState.answer ? (
                    <p className="draftAskAiAnswer">{askAiState.answer}</p>
                  ) : null}
                  {askAiState.error ? (
                    <p className="draftAskAiError">{askAiState.error}</p>
                  ) : null}
                  <div className="draftAskAiFooter">
                    <span>
                      {pendingAskAiChangeCount} pending AI suggestion
                      {pendingAskAiChangeCount === 1 ? "" : "s"}
                    </span>
                    <Button
                      type="button"
                      className="isPrimary"
                      onClick={() => void runAskAi()}
                      disabled={askAiState.status === "running" || !askAiState.message.trim()}
                    >
                      {askAiState.status === "running" ? "Thinking" : "Ask AI"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="draftAskAiButton"
                  onClick={() => setAskAiState((current) => ({ ...current, isOpen: true }))}
                >
                  Ask AI
                </Button>
              )}
            </div>
          </>
        ) : isSingleDraftStreaming ? (
          <section className="singleDraftGenerationCanvas">
            <div className="singleDraftThinkingColumn">
              <p className="draftTemplateEyebrow">Live Execution</p>
              <h1 className="singleDraftThinkingTitle">
                {singleDraftStreamState?.title || "Generating draft"}
              </h1>
              <p className="singleDraftThinkingStage">
                {isSingleDraftFormattingStage
                  ? "Draft generated. Formatting it properly now."
                  : singleDraftStreamState?.statusMessage ||
                    "Associate is drafting from the matter record."}
              </p>
              <div className="singleDraftThinkingHero">
                <div className="singleDraftThinkingViewport">
                  <p className="singleDraftThinkingTyped">
                    {singleDraftTypedThinking ||
                      (isSingleDraftFormattingStage
                        ? "Draft generated. Formatting it properly."
                        : singleDraftCurrentPage ||
                          "Associate is thinking through the matter.")}
                    <span className="singleDraftThinkingCursor" aria-hidden="true" />
                  </p>
                </div>
                <div className="singleDraftThinkingMeta">
                  <span>
                    {singleDraftCommittedPageCount +
                      (singleDraftAnimatingPageIndex >= 0 ? 1 : 0)}{" "}
                    chunks streamed
                  </span>
                  <span>{singleDraftThinkingTranscript.length} stream events</span>
                </div>
              </div>
            </div>
            <aside className="singleDraftExecutionRail">
              <section className="singleDraftExecutionPanel">
                <p className="draftTemplateEyebrow">Execution Steps</p>
                <div className="singleDraftExecutionStepList">
                  {singleDraftExecutionSteps.map((step) => (
                    <div
                      key={step.id}
                      className={`singleDraftExecutionStep singleDraftExecutionStep${step.status[0].toUpperCase()}${step.status.slice(1)}`}
                    >
                      <span className="singleDraftExecutionStepMarker" aria-hidden="true" />
                      <div>
                        <strong>{step.label}</strong>
                        {step.status === "current" ? (
                          <p>
                            {isSingleDraftFormattingStage && step.id === "formatting"
                              ? "Draft is generated. Formatting it properly."
                              : singleDraftStreamState?.statusMessage || "In progress."}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="singleDraftExecutionPanel">
                <p className="draftTemplateEyebrow">Thinking Stream</p>
                <div className="singleDraftChunkStack">
                  {singleDraftCompletedPages.map((chunk, index) => (
                    <article className="singleDraftChunkCard" key={`chunk-${index}`}>
                      <p>{chunk}</p>
                    </article>
                  ))}
                  {singleDraftTypedThinking ? (
                    <article className="singleDraftChunkCard isActive">
                      <p>
                        {singleDraftTypedThinking}
                        <span className="singleDraftThinkingCursor" aria-hidden="true" />
                      </p>
                    </article>
                  ) : null}
                </div>
              </section>
              {isSingleDraftFormattingStage ? (
                <div className="singleDraftFormattingPopup" role="status" aria-live="polite">
                  <span className="singleDraftFormattingSpinner" aria-hidden="true" />
                  <div className="singleDraftFormattingCopy">
                    <p className="draftTemplateEyebrow">Draft Formatting</p>
                    <h2>Formatting the structure</h2>
                    <p>
                      Draft is generated. Formatting it properly. Please wait.
                    </p>
                  </div>
                </div>
              ) : null}
            </aside>
          </section>
        ) : (
          <section className="draftBlankLoading">
            <p className="draftTemplateEyebrow">
              {isSingleDraftStreaming ? "Draft Generation" : "Drafting Suite"}
            </p>
            <h1>
              {saveStatus === "error"
                ? "Unable to open draft"
                : isSingleDraftStreaming
                  ? "Generating draft"
                  : "Opening document"}
            </h1>
            <p>
              {loadError ||
                (isSingleDraftStreaming
                  ? "Associate is thinking through the matter and drafting the document."
                  : startDraftFromQuery
                  ? "Opening the drafting workspace and preparing the first validated sections."
                  : "Preparing an editable document workspace.")}
            </p>
          </section>
        )}
      </main>
    </div>
  );
};

export default DraftingPage;
