import "../componentStyling/HomeDashboardStyling.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generateJSON } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { ChevronLeft, X } from "lucide-react";
import ProductNavbar from "./ProductNavbar";
import Button from "./Button";
import Loader from "./Loader";
import DraftingDocument, {
  type DraftingEditorHandle,
  type DraftingToolbarState,
} from "./DraftingDocument";
import usePersistedSidebarState from "../hooks/usePersistedSidebarState";
import { useMatterStore } from "../context/MatterStoreContext";
import {
  continueMatterDraftGeneration,
  cancelMatterDraftGeneration,
  createDraft,
  getMatterDraftGenerationThread,
  deriveDraftContextFromMatter,
  getDraftReview,
  getDraft,
  generateDraftFormat,
  hashDraftContent,
  patchDraft,
  saveDraft,
  openSingleDraftStream,
  openDraftCritiqueStream,
  formatDraft,
  triggerDraftReview,
  type AccessRole,
  type DraftComment,
  type DraftDetail,
  type DraftGenerationCheckpoint,
  type DraftGenerationThread,
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
const DRAFT_GENERATION_POLL_INTERVAL_MS = 10000;
const MATTER_APPEND_UPLOAD_SESSION_KEY = "open_matter_append_uploader";
const MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY =
  "matter_uploader_prefill_context";
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

const SINGLE_DRAFT_STAGE_ORDER = [
  "loading_context",
  "processing_document",
  "drafting",
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

const extractInlineText = (node: JSONContent | null | undefined): string => {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return String(node.text || "");
  if (node.type === "hardBreak") return "\n";
  const content = Array.isArray(node.content) ? node.content : [];
  return content.map((child) => extractInlineText(child)).join("");
};

const replaceFirstMatchingExcerpt = (
  node: JSONContent,
  excerpt: string,
  nextText: string,
): { node: JSONContent; replaced: boolean } => {
  if (!node || typeof node !== "object") return { node, replaced: false };
  const content = Array.isArray(node.content) ? node.content : undefined;
  const normalizedExcerpt = String(excerpt || "").replace(/\s+/g, " ").trim();
  const nodeText = extractInlineText(node).replace(/\s+/g, " ").trim();
  if (
    normalizedExcerpt &&
    nodeText &&
    (node.type === "paragraph" || node.type === "heading") &&
    nodeText.includes(normalizedExcerpt)
  ) {
    return {
      replaced: true,
      node: {
        ...node,
        content: makeTextNodesWithBreaks(nextText),
      },
    };
  }
  if (!content) return { node, replaced: false };
  let replaced = false;
  const nextContent = content.map((child) => {
    if (replaced) return child;
    const result = replaceFirstMatchingExcerpt(child, excerpt, nextText);
    if (result.replaced) replaced = true;
    return result.node;
  });
  return {
    replaced,
    node: replaced ? { ...node, content: nextContent } : node,
  };
};

const normalizeCheckpointText = (value: unknown) =>
  String(value || "").replaceAll("\n", " ").replaceAll("\t", " ").trim().toLowerCase();

const renderWarningText = (warning: unknown) => {
  if (typeof warning === "string") {
    return warning.trim();
  }
  if (warning && typeof warning === "object") {
    const candidate = warning as {
      description?: unknown;
      section?: unknown;
      warning_type?: unknown;
      message?: unknown;
      note?: unknown;
    };
    const description =
      typeof candidate.description === "string" ? candidate.description.trim() : "";
    const message = typeof candidate.message === "string" ? candidate.message.trim() : "";
    const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
    const section = typeof candidate.section === "string" ? candidate.section.trim() : "";
    const warningType =
      typeof candidate.warning_type === "string" ? candidate.warning_type.trim() : "";
    const mainText = description || message || note;
    if (section && mainText) return `${section}: ${mainText}`;
    if (mainText) return mainText;
    if (section && warningType) return `${section}: ${warningType}`;
    if (section) return section;
    if (warningType) return warningType;
    try {
      return JSON.stringify(warning);
    } catch {
      return "";
    }
  }
  return String(warning || "").trim();
};

type DraftGenerationChecklistItem = {
  id: string;
  label: string;
  status: "pending" | "current" | "done";
  detail?: string;
};

const DRAFT_GENERATION_STEP_ORDER: Record<string, number> = {
  format_search: 0,
  boilerplate_ready: 1,
  extracting_facts: 2,
  researching_law: 3,
  writing_sections: 4,
  checking_consistency: 5,
  final_quality_review: 6,
  saving_draft: 7,
  complete: 8,
};

const buildDraftGenerationChecklist = (
  thread: DraftGenerationThread | null,
): DraftGenerationChecklistItem[] => {
  const generationProgress = thread?.uiSummary?.generationProgress || null;
  const sectionStatuses = Array.isArray(thread?.uiSummary?.sectionStatuses)
    ? thread.uiSummary.sectionStatuses
    : [];
  const totalSections = Math.max(
    Number(generationProgress?.totalSections || 0),
    sectionStatuses.length,
  );
  const completedSections = Math.min(
    totalSections,
    Math.max(
      0,
      Number(
        generationProgress?.completedSections ||
          sectionStatuses.filter((item) => item.status === "generated").length,
      ),
    ),
  );
  const currentStep =
    thread?.status === "completed" || thread?.status === "needs_review"
      ? "complete"
      : String(generationProgress?.currentStep || "writing_sections");
  const currentStepRank =
    DRAFT_GENERATION_STEP_ORDER[currentStep] ??
    DRAFT_GENERATION_STEP_ORDER.writing_sections;
  const currentSectionNumber =
    totalSections > 0
      ? Math.min(totalSections, Math.max(completedSections + 1, 1))
      : 0;
  const currentSectionTitle =
    typeof generationProgress?.currentSectionTitle === "string" &&
    generationProgress.currentSectionTitle.trim()
      ? generationProgress.currentSectionTitle.trim()
      : "";

  const items: DraftGenerationChecklistItem[] = [];
  [
    { id: "format_search", label: "Finding official format" },
    { id: "boilerplate_ready", label: "Preparing boilerplate" },
    { id: "extracting_facts", label: "Grounding facts" },
    { id: "researching_law", label: "Researching Indian law" },
  ].forEach((step) => {
    const rank = DRAFT_GENERATION_STEP_ORDER[step.id] ?? 0;
    const status: DraftGenerationChecklistItem["status"] =
      currentStepRank > rank
        ? "done"
        : currentStepRank === rank
          ? "current"
          : "pending";
    items.push({
      ...step,
      status,
    });
  });

  for (let index = 0; index < totalSections; index += 1) {
    const sectionNumber = index + 1;
    const status: DraftGenerationChecklistItem["status"] =
      sectionNumber <= completedSections
        ? "done"
        : currentStep === "writing_sections" && sectionNumber === currentSectionNumber
          ? "current"
          : "pending";
    items.push({
      id: `section-${sectionNumber}`,
      label: `Writing Section ${sectionNumber} of ${totalSections}`,
      status,
      detail:
        status === "current" && currentSectionTitle
          ? currentSectionTitle
          : undefined,
    });
  }

  [
    { id: "checking_consistency", label: "Checking consistency" },
    { id: "final_quality_review", label: "Final quality review" },
    { id: "saving_draft", label: "Saving draft" },
  ].forEach((step) => {
    const rank = DRAFT_GENERATION_STEP_ORDER[step.id] ?? 0;
    const status: DraftGenerationChecklistItem["status"] =
      currentStepRank > rank
        ? "done"
        : currentStepRank === rank
          ? "current"
          : "pending";
    items.push({
      ...step,
      status,
    });
  });

  return items;
};

const buildDraftGenerationProgressMetrics = (
  thread: DraftGenerationThread | null,
  checklist: DraftGenerationChecklistItem[],
) => {
  const generationProgress = thread?.uiSummary?.generationProgress || null;
  const totalSections = Math.max(
    0,
    Number(generationProgress?.totalSections || 0),
  );
  const totalCheckpoints = Math.max(1, checklist.length || totalSections + 7);
  const completedCheckpoints = checklist.filter((item) => item.status === "done").length;
  const progress = Math.max(
    0,
    Math.min(100, Math.round((completedCheckpoints / totalCheckpoints) * 100)),
  );
  const visibleSteps = checklist
    .filter((item) => item.status !== "pending")
    .slice(-4)
    .map((item) => item.detail ? `${item.label} · ${item.detail}` : item.label);
  const currentStep =
    checklist.find((item) => item.status === "current") ||
    checklist[checklist.length - 1] ||
    null;
  return {
    progress,
    steps: visibleSteps,
    stage: currentStep
      ? currentStep.detail
        ? `${currentStep.label} · ${currentStep.detail}`
        : currentStep.label
      : "Preparing guarded draft working set",
  };
};

const shouldShowCheckpointQuestion = (
  question: DraftGenerationCheckpoint["questions"][number],
  checkpoint: DraftGenerationCheckpoint,
) => {
  const sourceText = normalizeCheckpointText(
    (question as Record<string, unknown>).sourceItem || question.question,
  );
  if (!sourceText) return false;
  const systemResolvable = Array.isArray(
    (checkpoint as unknown as { gapClassification?: { systemResolvable?: unknown[] } })
      .gapClassification?.systemResolvable,
  )
    ? ((checkpoint as unknown as { gapClassification?: { systemResolvable?: unknown[] } })
        .gapClassification?.systemResolvable || [])
    : [];
  if (
    systemResolvable.some((item) => normalizeCheckpointText(item) === sourceText)
  ) {
    return false;
  }
  return true;
};

const normalizeLawyerFacingQuestion = (
  question: DraftGenerationCheckpoint["questions"][number],
) => {
  const wordCount = String(question.question || "")
    .trim()
    .split(" ")
    .filter(Boolean).length;
  const shouldRewriteStrategyPrompt =
    question.linkedIssue === "workflow_requirements" &&
    wordCount > 0 &&
    wordCount <= 8 &&
    !String(question.question || "").trim().endsWith("?");
  return {
    ...question,
    question: shouldRewriteStrategyPrompt
      ? "What outcome is your client seeking for this draft?"
      : question.question,
    whyItMatters: shouldRewriteStrategyPrompt
      ? "This determines whether the draft should emphasise formal enforcement, negotiated resolution, preservation of the relationship, or another commercial priority."
      : question.whyItMatters,
  };
};

const normalizeDraftGenerationCheckpoint = (
  checkpoint: DraftGenerationCheckpoint | null | undefined,
): DraftGenerationCheckpoint | null => {
  if (!checkpoint) return null;
  const rawQuestions = Array.isArray(checkpoint.questions) ? checkpoint.questions : [];
  const normalized = {
    ...checkpoint,
    questions: rawQuestions
      .filter((question) => shouldShowCheckpointQuestion(question, checkpoint))
      .map(normalizeLawyerFacingQuestion),
    requestedDocuments: Array.isArray(checkpoint.requestedDocuments)
      ? checkpoint.requestedDocuments
      : [],
    blockingItems: Array.isArray(checkpoint.blockingItems) ? checkpoint.blockingItems : [],
    unsafeClaims: Array.isArray(checkpoint.unsafeClaims) ? checkpoint.unsafeClaims : [],
    recommendedActions: Array.isArray(checkpoint.recommendedActions)
      ? checkpoint.recommendedActions
      : [],
  };
  return normalized.questions.length || normalized.requestedDocuments.length
    ? normalized
    : null;
};

const shouldRefreshDraftFromThread = (
  thread: DraftGenerationThread,
  draft: DraftDetail | null,
) => {
  const meta = thread?.draftMeta || null;
  if (!meta) return false;
  if (!draft) return true;
  if (meta.id && meta.id !== draft.id) return true;
  if (
    typeof meta.saveVersion === "number" &&
    Number(meta.saveVersion) !== Number(draft.saveVersion || 0)
  ) {
    return true;
  }
  if (meta.contentHash && meta.contentHash !== draft.contentHash) {
    return true;
  }
  const isTerminalThreadStatus = ["completed", "failed", "cancelled", "needs_review"].includes(
    String(thread?.status || "").trim().toLowerCase(),
  );
  const currentGenerationStatus = String(
    draft?.context?.generationStatus || "",
  ).trim().toLowerCase();
  const nextGenerationStatus = String(
    meta.generationStatus || thread?.status || "",
  ).trim().toLowerCase();
  if (isTerminalThreadStatus && currentGenerationStatus !== nextGenerationStatus) {
    return true;
  }
  return false;
};

const getDraftCheckpointEyebrow = (
  checkpoint: DraftGenerationCheckpoint | null,
) => {
  const status = String(checkpoint?.status || checkpoint?.readinessStatus || "").trim();
  if (status === "review_ready_with_optional_inputs" || status === "review_ready") {
    return "Review Draft Available";
  }
  if (status === "blocked") {
    return "Draft Blocked";
  }
  return "Input Required";
};

const DraftingPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editorRef = useRef<DraftingEditorHandle | null>(null);
  const activeDraftRef = useRef<DraftDetail | null>(null);
  const savedHashRef = useRef("");
  const currentHashRef = useRef("");
  const contextDirtyRef = useRef(false);
  const pendingCheckpointDismissThreadRef = useRef<string | null>(null);
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
  const manualDraftGenerationOverrideRef = useRef<string | null>(null);
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
  const [draftGenerationThread, setDraftGenerationThread] =
    useState<DraftGenerationThread | null>(null);
  const [draftGenerationCheckpoint, setDraftGenerationCheckpoint] =
    useState<DraftGenerationCheckpoint | null>(null);
  const [draftGenerationAnswers, setDraftGenerationAnswers] = useState<Record<string, string>>({});
  const [draftGenerationError, setDraftGenerationError] = useState("");
  const [isSubmittingDraftGeneration, setIsSubmittingDraftGeneration] =
    useState(false);
  const [draftGenerationTypedStatus, setDraftGenerationTypedStatus] = useState("");
  const [streamedCritiqueState, setStreamedCritiqueState] = useState<StreamedCritiqueState>({
    status: "idle",
    message: "",
    commentCount: 0,
  });
  const [draftFormattingState, setDraftFormattingState] = useState<DraftFormattingState>({
    status: "idle",
    message: "",
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
  const checkpointQuestions = useMemo(
    () => (Array.isArray(draftGenerationCheckpoint?.questions) ? draftGenerationCheckpoint.questions : []),
    [draftGenerationCheckpoint],
  );
  useEffect(() => {
    activeDraftRef.current = activeDraft;
  }, [activeDraft]);
  const checkpointRequestedDocuments = useMemo(
    () =>
      Array.isArray(draftGenerationCheckpoint?.requestedDocuments)
        ? draftGenerationCheckpoint.requestedDocuments
        : [],
    [draftGenerationCheckpoint],
  );
  const draftGenerationMessageRef = useRef("");
  const loaderHighlights = useMemo(() => {
    const readiness = draftGenerationThread?.uiSummary?.readiness || null;
    return [
      readiness?.safeGenerationMode
        ? `Mode: ${String(readiness.safeGenerationMode).replace(/_/g, " ")}`
        : "Mode: guarded source-grounded drafting",
      draftGenerationThread?.uiSummary?.sourceCoverage
        ? `Verified support: ${
            draftGenerationThread.uiSummary.sourceCoverage.verifiedCount || 0
          }/${draftGenerationThread.uiSummary.sourceCoverage.requirementCount || 0}`
        : "Verified support is being checked section by section",
      draftGenerationThread?.uiSummary?.blockers?.length
        ? `${draftGenerationThread.uiSummary.blockers.length} open proof item(s) are being carried into review language`
        : "Open proof items are being preserved as review notes where needed",
    ];
  }, [draftGenerationThread]);
  const draftGenerationChecklist = useMemo(
    () => buildDraftGenerationChecklist(draftGenerationThread),
    [draftGenerationThread],
  );
  const draftGenerationProgressMetrics = useMemo(
    () =>
      buildDraftGenerationProgressMetrics(
        draftGenerationThread,
        draftGenerationChecklist,
      ),
    [draftGenerationChecklist, draftGenerationThread],
  );
  const loaderCurrentStep = draftGenerationProgressMetrics.stage;
  const loaderProgress = draftGenerationProgressMetrics.progress;
  const draftGenerationLoaderSteps = draftGenerationProgressMetrics.steps;
  const draftGenerationLoaderMessage = useMemo(() => {
    const progress = draftGenerationThread?.uiSummary?.generationProgress || null;
    const statuses = Array.isArray(draftGenerationThread?.uiSummary?.sectionStatuses)
      ? draftGenerationThread.uiSummary.sectionStatuses
      : [];
    const runningSection =
      statuses.find((item) => item.status === "running") ||
      statuses.find((item) => item.status === "needs_evidence") ||
      statuses.find((item) => item.status === "ready") ||
      null;
    if (draftGenerationCheckpoint) {
      return "Associate is checking what must be confirmed before drafting.";
    }
    if (draftGenerationThread?.status === "completed") {
      return "Draft generation is complete.";
    }
    if (draftGenerationThread?.status === "needs_review") {
      return "Draft generation is complete and ready for lawyer review.";
    }
    if (draftGenerationThread?.status === "failed") {
      return "Draft generation stopped because the backend reported a failure.";
    }
    if (draftGenerationThread?.status === "cancelled") {
      return "Draft generation was cancelled.";
    }
    if (draftGenerationThread?.status === "running" && loaderCurrentStep) {
      if (progress?.currentStep === "writing_sections" && progress?.totalSections) {
        const currentSection = Math.min(
          Number(progress.totalSections),
          Math.max(Number(progress.completedSections || 0) + 1, 1),
        );
        return `Associate is drafting section ${currentSection} of ${progress.totalSections}.\n\n${loaderCurrentStep}`;
      }
      if (progress?.currentStep === "checking_consistency") {
        return "Associate is checking consistency across the generated sections.";
      }
      if (progress?.currentStep === "final_quality_review") {
        return "Associate is running the final quality review on the assembled draft.";
      }
      if (progress?.currentStep === "saving_draft") {
        return "Associate is saving the assembled draft.";
      }
      return `${loaderCurrentStep}\n\nAssociate is validating sources, preserving open proof items, and preparing lawyer-review drafting language section by section.`;
    }
    if (runningSection) {
      return `Associate is drafting ${runningSection.title}.`;
    }
    if (draftGenerationThread?.status === "running") {
      return "Associate is assembling the draft section by section.";
    }
    return "";
  }, [
    draftGenerationCheckpoint,
    draftGenerationThread?.status,
    draftGenerationThread?.uiSummary?.generationProgress,
    draftGenerationThread?.uiSummary?.sectionStatuses,
    loaderCurrentStep,
  ]);
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
      { id: "processing_document", label: "Read uploaded files" },
      { id: "drafting", label: "Generate draft text" },
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
    if (draftGenerationCheckpoint) {
      return `checkpoint:${draftGenerationThread?.id || "none"}:${draftGenerationCheckpoint.status || "unknown"}:${draftGenerationCheckpoint.title || "draft"}`;
    }
    if (draftGenerationThread) {
      return `generation:${draftGenerationThread.id}:${draftGenerationThread.status || "unknown"}`;
    }
    if (formatProposal || formatGenerationError) {
      return `format:${formatProposal?.title || "error"}:${formatGenerationError || "ok"}`;
    }
    if (startDraftFromQuery && !activeDraft) {
      return `starting:${startDraftFromQuery}:${draftLabelFromQuery}`;
    }
    return "";
  }, [
    activeDraft,
    draftGenerationCheckpoint,
    draftGenerationThread,
    draftLabelFromQuery,
    formatGenerationError,
    formatProposal,
    startDraftFromQuery,
  ]);
  const [dismissedDraftSidePanelKey, setDismissedDraftSidePanelKey] = useState("");
  const isDraftSidePanelVisible =
    Boolean(draftSidePanelKey) && draftSidePanelKey !== dismissedDraftSidePanelKey;
  const hasDraftSidePanelContent = Boolean(
    (!isSingleDraftStreaming &&
      (draftGenerationThread ||
      draftGenerationCheckpoint ||
      (startDraftFromQuery && !activeDraft) ||
      formatProposal ||
      formatGenerationError)),
  );
  const openMatterSupportUploader = useCallback(
    (documentLabel: string, reason: string) => {
      if (activeMatter?.id) {
        setActiveMatterId(activeMatter.id);
      }
      const draftTitle = String(
        draftGenerationCheckpoint?.title || "this draft",
      ).trim();
      const prefill = [
        `Add supporting files for: ${documentLabel}.`,
        reason ? `Why needed: ${reason}.` : "",
        `Target draft: ${draftTitle}.`,
        "Upload the most direct supporting records available and note any missing dates or disputed facts.",
      ]
        .filter(Boolean)
        .join(" ");
      sessionStorage.setItem(MATTER_APPEND_UPLOAD_SESSION_KEY, "1");
      sessionStorage.setItem(MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY, prefill);
      navigate("/matter");
    },
    [activeMatter?.id, draftGenerationCheckpoint?.title, navigate, setActiveMatterId],
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
    setDraftGenerationError("");
    setDraftGenerationCheckpoint(null);
    setDraftGenerationAnswers({});
    singleDraftAnimationRef.current = { running: false, seenCount: 0 };
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
        case "document_summary": {
          const note = String(payload.summary || "").trim();
          if (!note) break;
          const fileName = String(payload.fileName || "Document").trim();
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
          setSingleDraftTypedThinking("");
          setSingleDraftAnimatingPageIndex(-1);
          setSingleDraftCommittedPageCount(0);
          singleDraftAnimationRef.current = { running: false, seenCount: 0 };
          setSingleDraftStreamState(null);
          if (streamReader) {
            await streamReader.cancel().catch(() => {});
          }
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

  const updateCurrentDocument = (
    contentJson: JSONContent,
    meta?: { userInitiated?: boolean },
  ) => {
    setCurrentContentJson(contentJson);
    currentHashRef.current = hashDraftContent(contentJson);
    const draftGenerationThreadId = String(
      activeDraft?.context?.draftGenerationThreadId || "",
    ).trim();
    const draftGenerationContext = (activeDraft?.context?.draftGeneration ||
      {}) as Record<string, unknown>;
    const allowAutoApply = draftGenerationContext.allowAutoApply !== false;
    if (
      activeDraft?.id &&
      draftGenerationThreadId &&
      allowAutoApply &&
      meta?.userInitiated === true &&
      currentHashRef.current !== savedHashRef.current &&
      manualDraftGenerationOverrideRef.current !== activeDraft.id
    ) {
      manualDraftGenerationOverrideRef.current = activeDraft.id;
      void patchDraft(activeDraft.id, {
        context: {
          ...(activeDraft.context || {}),
          generationStatus: "manual_override",
          draftGeneration: {
            ...((activeDraft.context?.draftGeneration as Record<string, unknown>) ||
              {}),
            allowAutoApply: false,
            manuallyEditedAt: new Date().toISOString(),
          },
        },
      })
        .then((patchedDraft) => {
          setActiveDraft(sanitizeDraftDetailContent(patchedDraft));
        })
        .catch(() => {
          manualDraftGenerationOverrideRef.current = null;
        });
    }
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
        setDraftFormattingState({
          status: "ready",
          message: "Formatting complete.",
        });
      })
      .catch((error) => {
        singleDraftFormattingRequestRef.current = "";
        setDraftFormattingState({
          status: "error",
          message: error instanceof Error ? error.message : "Draft formatting failed.",
        });
      });
  }, [activeDraft?.context, activeDraft?.id]);

  useEffect(() => {
    const draftId = String(activeDraft?.id || "").trim();
    const matterId = String(
      activeDraft?.matterId || activeDraft?.context?.matterId || matterIdFromQuery || "",
    ).trim();
    const threadId = String(activeDraft?.context?.draftGenerationThreadId || "").trim();
    const generationStatus = String(activeDraft?.context?.generationStatus || "").trim().toLowerCase();
    if (!draftId || !matterId || !threadId) {
      return;
    }
    if (
      generationStatus &&
      ["completed", "failed", "cancelled", "manual_override", "needs_review"].includes(generationStatus)
    ) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const poll = async () => {
      try {
        const thread = await getMatterDraftGenerationThread({
          matterId,
          threadId,
        });
        if (cancelled) return;
        setDraftGenerationThread(thread);
        const normalizedCheckpoint = normalizeDraftGenerationCheckpoint(
          thread.checkpointPayload || null,
        );
        if (
          pendingCheckpointDismissThreadRef.current &&
          pendingCheckpointDismissThreadRef.current === thread.id
        ) {
          if (!normalizedCheckpoint) {
            pendingCheckpointDismissThreadRef.current = null;
            setDraftGenerationCheckpoint(null);
          }
        } else {
          setDraftGenerationCheckpoint(normalizedCheckpoint);
        }
        const currentDraftSnapshot = activeDraftRef.current;
        if (shouldRefreshDraftFromThread(thread, currentDraftSnapshot)) {
          const latestDraft = sanitizeDraftDetailContent(await getDraft(draftId));
          if (cancelled) return;
          setActiveDraft((current) => {
            if (!current || current.id !== latestDraft.id) {
              return latestDraft;
            }
            const currentGenerationStatus = String(
              current.context?.generationStatus || "",
            ).trim();
            const nextGenerationStatus = String(
              latestDraft.context?.generationStatus || "",
            ).trim();
            const currentSectionStatuses = JSON.stringify(
              (current.context?.sectionStatuses as unknown) || null,
            );
            const nextSectionStatuses = JSON.stringify(
              (latestDraft.context?.sectionStatuses as unknown) || null,
            );
            const currentContentHash = hashDraftContent(current.contentJson || {});
            const nextContentHash = hashDraftContent(latestDraft.contentJson || {});
            if (
              current.title === latestDraft.title &&
              currentGenerationStatus === nextGenerationStatus &&
              currentSectionStatuses === nextSectionStatuses &&
              currentContentHash === nextContentHash
            ) {
              return current;
            }
            return latestDraft;
          });

          const latestDraftGenerationContext = (latestDraft?.context
            ?.draftGeneration || {}) as Record<string, unknown>;
          const allowAutoApply =
            latestDraftGenerationContext.allowAutoApply !== false;
          if (allowAutoApply) {
            const nextHash = hashDraftContent(latestDraft.contentJson || {});
            if (nextHash !== savedHashRef.current) {
              setCurrentContentJson(latestDraft.contentJson || {});
              savedHashRef.current = nextHash;
              currentHashRef.current = nextHash;
              setDocumentTitle(latestDraft.title);
            }
          }
        }

        if (
          thread.status === "completed" ||
          thread.status === "failed" ||
          thread.status === "cancelled" ||
          thread.status === "needs_review"
        ) {
          if (intervalId != null) {
            window.clearInterval(intervalId);
          }
        }
      } catch {
        if (cancelled) return;
      }
    };

    void poll();
    intervalId = window.setInterval(() => {
      void poll();
    }, DRAFT_GENERATION_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
    };
  }, [
    activeDraft?.id,
    activeDraft?.matterId,
    activeDraft?.context?.draftGenerationThreadId,
    activeDraft?.context?.generationStatus,
    matterIdFromQuery,
  ]);

  useEffect(() => {
    if (!draftGenerationLoaderMessage) {
      draftGenerationMessageRef.current = "";
      setDraftGenerationTypedStatus("");
      return;
    }
    if (draftGenerationMessageRef.current === draftGenerationLoaderMessage) {
      return;
    }
    draftGenerationMessageRef.current = draftGenerationLoaderMessage;
    if (draftGenerationThread?.status !== "running" || draftGenerationCheckpoint) {
      setDraftGenerationTypedStatus(draftGenerationLoaderMessage);
      return;
    }
    let cancelled = false;
    let index = 0;
    setDraftGenerationTypedStatus("");
    const intervalId = window.setInterval(() => {
      if (cancelled) return;
      index += 1;
      setDraftGenerationTypedStatus(draftGenerationLoaderMessage.slice(0, index));
      if (index >= draftGenerationLoaderMessage.length) {
        window.clearInterval(intervalId);
      }
    }, 18);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [draftGenerationCheckpoint, draftGenerationLoaderMessage, draftGenerationThread?.status]);

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

  const continueActiveDraftGeneration = async (chosenAction: string) => {
    const threadId = String(
      draftGenerationThread?.id || activeDraft?.context?.draftGenerationThreadId || "",
    ).trim();
    const matterId = String(
      activeDraft?.matterId || activeDraft?.context?.matterId || matterIdFromQuery || "",
    ).trim();
    if (!threadId || !matterId || !draftGenerationCheckpoint) {
      setDraftGenerationError("Draft generation thread is not ready yet. Please retry.");
      return;
    }
    const previousThread = draftGenerationThread;
    const previousCheckpoint = draftGenerationCheckpoint;
    try {
      setIsSubmittingDraftGeneration(true);
      setDraftGenerationError("");
      const answers = checkpointQuestions
        .map((question) => {
          const raw = String(draftGenerationAnswers[question.id] || "").trim();
          if (!raw) return null;
          return {
            questionId: question.id,
            answer:
              question.answerType === "yes_no"
                ? raw === "yes"
                  ? true
                  : raw === "no"
                    ? false
                    : raw
                : raw,
            answerType: question.answerType,
          };
        })
        .filter(Boolean) as Array<{
        questionId: string;
        answer: string | boolean;
        answerType?: string;
      }>;
      console.log("[draft-generation][continue][client]", {
        matterId,
        threadId,
        chosenAction,
        answers,
      });
      pendingCheckpointDismissThreadRef.current = threadId;
      setDraftGenerationThread((current) =>
        current
          ? {
              ...current,
              status: "running",
              checkpointPayload: null,
            }
          : current,
      );
      setDraftGenerationCheckpoint(null);
      const payload = await continueMatterDraftGeneration({
        matterId,
        threadId,
        chosenAction,
        answers,
      });
      setDraftGenerationThread((current) =>
        current
          ? {
              ...current,
              status: "running",
              checkpointPayload: null,
            }
          : current,
      );
      setActiveDraft(payload.draft);
      setDraftGenerationCheckpoint(null);
      setDraftGenerationAnswers({});
    } catch (error) {
      setDraftGenerationThread(previousThread);
      setDraftGenerationCheckpoint(previousCheckpoint);
      setDraftGenerationError(
        error instanceof Error
          ? error.message
          : "Failed to continue draft generation.",
      );
    } finally {
      setIsSubmittingDraftGeneration(false);
    }
  };

  const cancelActiveDraftGeneration = async () => {
    if (!activeDraft || !draftGenerationThread) return;
    try {
      await cancelMatterDraftGeneration({
        matterId:
          String(activeDraft.matterId || activeDraft.context?.matterId || matterIdFromQuery),
        threadId: draftGenerationThread.id,
      });
      setDraftGenerationCheckpoint(null);
    } catch (error) {
      setDraftGenerationError(
        error instanceof Error
          ? error.message
          : "Failed to cancel draft generation.",
      );
    }
  };

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

  const updateCommentStatus = (id: string, status: DraftComment["status"]) => {
    const acceptedComment =
      status === "accepted" ? comments.find((comment) => comment.id === id) || null : null;
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.id !== id) return comment;
        return { ...comment, status };
      }),
    );
    if (
      status === "accepted" &&
      acceptedComment?.suggestedText &&
      activeDraft
    ) {
      const nextContentByBlockId = acceptedComment.blockId
        ? replaceBlockTextById(
            currentContentJson,
            acceptedComment.blockId,
            acceptedComment.suggestedText,
          )
        : currentContentJson;
      const blockIdChanged =
        JSON.stringify(nextContentByBlockId) !== JSON.stringify(currentContentJson);
      const excerptFallback = !blockIdChanged && acceptedComment.excerpt
        ? replaceFirstMatchingExcerpt(
            currentContentJson,
            acceptedComment.excerpt,
            acceptedComment.suggestedText,
          )
        : { node: nextContentByBlockId, replaced: blockIdChanged };
      const nextContent = excerptFallback.node;
      if (!blockIdChanged && !excerptFallback.replaced) {
        return;
      }
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
        {isDraftSidePanelVisible &&
        (draftGenerationThread || (startDraftFromQuery && !activeDraft)) &&
        !draftGenerationCheckpoint &&
        !singleDraftStreamState ? (
          <aside className="draftFormatProposal">
            <button
              type="button"
              className="draftFormatProposalClose"
              aria-label="Close draft generation panel"
              onClick={() => setDismissedDraftSidePanelKey(draftSidePanelKey)}
            >
              <X size={16} />
            </button>
            {draftGenerationThread?.status === "running" &&
            !draftGenerationCheckpoint ? (
              <>
                <Loader
                  mode="inline"
                  variant="timeline"
                  eyebrow="Draft Generation"
                  title={
                    activeDraft?.title || draftLabelFromQuery || "Preparing draft"
                  }
                  message={
                    draftGenerationTypedStatus ||
                    "Associate is validating sources, structuring sections, and preparing review-safe drafting language."
                  }
                  stage={loaderCurrentStep || "Preparing guarded draft working set"}
                  progress={loaderProgress}
                  steps={draftGenerationLoaderSteps}
                  fileName={activeDraft?.title || draftLabelFromQuery || "Draft"}
                />
                <div className="draftFormatLoaderHighlights">
                  {loaderHighlights.map((item) => (
                    <div className="draftFormatLoaderHighlight" key={item}>
                      <strong>Working note</strong>
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
                <div className="draftFormatProposalActions">
                  <Button
                    type="button"
                    onClick={() => void cancelActiveDraftGeneration()}
                  >
                    Cancel drafting
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="draftTemplateEyebrow">Draft Generation</p>
                  <h2>
                    {activeDraft?.title || draftLabelFromQuery || "Preparing draft"}
                  </h2>
                  <p className="draftFormatLead">
                    {draftGenerationTypedStatus ||
                      "Associate is preparing the draft and will add sections as they are validated."}
                    {draftGenerationThread?.status === "running" ? " |" : ""}
                  </p>
                  {draftGenerationThread?.uiSummary?.format ? (
                    <div className="draftFormatSources">
                      <span>
                        Format: {draftGenerationThread.uiSummary.format.draftFamily || "discovered"}
                      </span>
                      <span>
                        Format confidence: {draftGenerationThread.uiSummary.format.confidence || "unknown"}
                      </span>
                      <span>
                        Format source: {draftGenerationThread.uiSummary.format.cacheStatus === "hit" ? "cached research" : "fresh research"}
                      </span>
                    </div>
                  ) : null}
                  {draftGenerationThread?.uiSummary?.sourceCoverage ? (
                    <div className="draftFormatSources">
                      <span>
                        Verified requirements: {draftGenerationThread.uiSummary.sourceCoverage.verifiedCount || 0}/
                        {draftGenerationThread.uiSummary.sourceCoverage.requirementCount || 0}
                      </span>
                      <span>
                        User-supplied assertions: {draftGenerationThread.uiSummary.sourceCoverage.userSuppliedCount || 0}
                      </span>
                    </div>
                  ) : null}
                  {draftGenerationChecklist.length ? (
                    <div className="draftGenerationChecklist">
                      {draftGenerationChecklist.map((item) => (
                        <div
                          key={item.id}
                          className={`draftGenerationChecklistItem ${
                            item.status === "done"
                              ? "isDone"
                              : item.status === "current"
                                ? "isCurrent"
                                : ""
                          }`}
                        >
                          <span
                            className="draftGenerationChecklistMarker"
                            aria-hidden="true"
                          />
                          <span className="draftGenerationChecklistText">
                            {item.label}
                            {item.detail ? (
                              <span className="draftGenerationChecklistDetail">
                                {item.detail}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {draftGenerationThread?.uiSummary?.criticReport?.warnings?.length ? (
                    <div className="draftFormatSources">
                      {draftGenerationThread.uiSummary.criticReport.warnings
                        .map((warning) => renderWarningText(warning))
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((warning, index) => (
                          <span key={`critic-warning-${index}-${warning.slice(0, 48)}`}>
                            Critic: {warning}
                          </span>
                        ))}
                    </div>
                  ) : null}
                  {draftGenerationError ? <p>{draftGenerationError}</p> : null}
                </div>
                <div className="draftFormatProposalActions">
                  {draftGenerationThread?.status === "running" ? (
                    <Button type="button" onClick={() => void cancelActiveDraftGeneration()}>
                      Cancel drafting
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </aside>
        ) : null}
        {isDraftSidePanelVisible && draftGenerationCheckpoint ? (
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
              <p className="draftTemplateEyebrow">
                {getDraftCheckpointEyebrow(draftGenerationCheckpoint)}
              </p>
              <h2>{draftGenerationCheckpoint.title}</h2>
              <p>{draftGenerationCheckpoint.messageToUser}</p>
              {checkpointQuestions.map((question) => (
                <div key={question.id} style={{ marginTop: 12 }}>
                  <strong>{question.question}</strong>
                  <p>{question.whyItMatters}</p>
                  {question.answerType === "yes_no" ? (
                    <div className="draftFormatProposalActions">
                      <Button
                        type="button"
                        onClick={() =>
                          setDraftGenerationAnswers((current) => ({
                            ...current,
                            [question.id]: "yes",
                          }))
                        }
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          setDraftGenerationAnswers((current) => ({
                            ...current,
                            [question.id]: "no",
                          }))
                        }
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <>
                      {question.suggestedAnswer ? (
                        <div className="draftFormatProposalActions">
                          <Button
                            type="button"
                            onClick={() =>
                              setDraftGenerationAnswers((current) => ({
                                ...current,
                                [question.id]: question.suggestedAnswer || "",
                              }))
                            }
                          >
                            Use suggested answer
                          </Button>
                        </div>
                      ) : null}
                      <input
                        className="draftFormatQuestionInput"
                        value={draftGenerationAnswers[question.id] || ""}
                        onChange={(event) =>
                          setDraftGenerationAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      />
                    </>
                  )}
                </div>
              ))}
              {checkpointRequestedDocuments.length ? (
                <div style={{ marginTop: 12 }}>
                  <strong>
                    {draftGenerationCheckpoint.status === "review_ready_with_optional_inputs"
                      ? "Supporting proof that strengthens this draft"
                      : "Supporting documents needed for drafting"}
                  </strong>
                  <p style={{ marginTop: 8 }}>
                    {draftGenerationCheckpoint.status === "review_ready_with_optional_inputs"
                      ? "You can still continue with a guarded review draft now. Uploading these records lets the draft state the facts more strongly and quantify relief more precisely."
                      : "These records will help the draft proceed with stronger factual support."}
                  </p>
                  <div
                    className="draftFormatProposalActions"
                    style={{
                      marginTop: 12,
                      flexDirection: "column",
                      alignItems: "stretch",
                    }}
                  >
                    {checkpointRequestedDocuments.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          border: "1px solid rgba(28, 26, 23, 0.14)",
                          padding: 14,
                          background: "rgba(255,255,255,0.62)",
                        }}
                      >
                        <strong>{item.label}</strong>
                        <p style={{ marginTop: 6 }}>{item.whyNeeded}</p>
                        <p style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
                          Accepted formats:{" "}
                          {item.acceptedTypes?.length
                            ? item.acceptedTypes.join(", ").toUpperCase()
                            : "PDF, DOCX, email, image, spreadsheet"}
                        </p>
                        <div
                          className="draftFormatProposalActions"
                          style={{ marginTop: 10 }}
                        >
                          <Button
                            type="button"
                            onClick={() =>
                              openMatterSupportUploader(
                                item.label,
                                item.whyNeeded,
                              )
                            }
                          >
                            {item.interactionType === "either"
                              ? "Answer or upload support"
                              : "Upload supporting files"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="draftFormatProposalActions">
              <Button
                type="button"
                onClick={() => void continueActiveDraftGeneration("review_draft_with_placeholders")}
                disabled={isSubmittingDraftGeneration}
              >
                {draftGenerationCheckpoint.status === "review_ready_with_optional_inputs"
                  ? "Generate guarded review draft"
                  : "Generate review draft"}
              </Button>
              {draftGenerationCheckpoint.recommendedAlternativeDraftType ? (
                <Button
                  type="button"
                  onClick={() => void continueActiveDraftGeneration("generate_safer_first_draft")}
                  disabled={isSubmittingDraftGeneration}
                >
                  Generate safer first draft
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => void continueActiveDraftGeneration("lawyer_review_draft")}
                disabled={isSubmittingDraftGeneration}
              >
                Continue as lawyer-review draft
              </Button>
            </div>
          </aside>
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
