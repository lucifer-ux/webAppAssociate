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
  startMatterDraftGeneration,
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
const DRAFT_GENERATION_LOADER_MIN_DELAY_MS = 4000;
const DRAFT_GENERATION_LOADER_MAX_DELAY_MS = 9000;
const DRAFT_GENERATION_LOADER_LIBRARY = [
  "Reviewing the draft request against the matter objective",
  "Reconfirming document-backed facts before stronger assertions are written",
  "Matching the draft posture to the current proof record",
  "Checking which source excerpts can be stated directly",
  "Separating verified terms from client allegations",
  "Normalizing dates, parties, and agreement references",
  "Carrying open proof items into guarded drafting language",
  "Reducing unsupported conclusions before section writing begins",
  "Checking whether the current record supports stronger notice language",
  "Confirming which provisions belong in the memo and which remain background only",
  "Preparing a compact working set for section-by-section drafting",
  "Verifying that unsupported factual claims stay attributed and qualified",
  "Balancing memo structure, source coverage, and drafting posture",
  "Cross-checking proof gaps against the requested draft objective",
  "Translating retrieved support into section-specific drafting inputs",
  "Screening the record for refund, cure, and notice dependencies",
  "Compressing research context into usable drafting evidence",
  "Rechecking whether any open proof gap can be handled as a review note",
  "Ordering section generation by drafting risk and evidence coverage",
  "Checking for contradictions between the uploaded record and draft posture",
  "Preserving unresolved issues for lawyer review instead of overclaiming",
  "Preparing the next validated section for insertion into the draft",
  "Reviewing generated language for unsupported factual drift",
  "Assembling the memo so each section reflects its source posture clearly",
];

const shuffleList = <T,>(values: T[]) => {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const getRandomLoaderDelay = () =>
  DRAFT_GENERATION_LOADER_MIN_DELAY_MS +
  Math.floor(
    Math.random() *
      (DRAFT_GENERATION_LOADER_MAX_DELAY_MS -
        DRAFT_GENERATION_LOADER_MIN_DELAY_MS +
        1),
  );

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
  const [draftGenerationLoaderSteps, setDraftGenerationLoaderSteps] = useState<string[]>([]);
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
  const draftGenerationLoaderRef = useRef<{
    threadId: string;
    orderedSteps: string[];
    timerId: number | null;
  }>({
    threadId: "",
    orderedSteps: [],
    timerId: null,
  });
  const draftGenerationMessageRef = useRef("");
  const loaderCurrentStep =
    draftGenerationLoaderSteps[draftGenerationLoaderSteps.length - 1] || "";
  const loaderProgress = draftGenerationLoaderRef.current.orderedSteps.length
    ? Math.min(
        95,
        Math.max(
        10,
        Math.round(
          (draftGenerationLoaderSteps.length /
            draftGenerationLoaderRef.current.orderedSteps.length) *
            100,
        ),
        ),
      )
    : 12;
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
  const draftGenerationLoaderMessage = useMemo(() => {
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
      return `${loaderCurrentStep}\n\nAssociate is validating sources, preserving open proof items, and preparing lawyer-review drafting language section by section.`;
    }
    if (runningSection) {
      return `Associate is drafting ${runningSection.title}.`;
    }
    if (draftGenerationThread?.status === "running") {
      return "Associate is assembling the draft section by section.";
    }
    return "";
  }, [draftGenerationCheckpoint, draftGenerationThread?.status, draftGenerationThread?.uiSummary?.sectionStatuses, loaderCurrentStep]);
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
    draftGenerationThread ||
      draftGenerationCheckpoint ||
      (startDraftFromQuery && !activeDraft) ||
      formatProposal ||
      formatGenerationError,
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
    if (draftIdFromQuery || sourceDocumentFromQuery || !matterIdFromQuery || !startDraftFromQuery) {
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

    void startMatterDraftGeneration({
      matterId: matterIdFromQuery,
      draftType: startDraftFromQuery,
      draftKey: draftKeyFromQuery || undefined,
      draftTitle: draftLabelFromQuery || undefined,
      source: "atlas_next_steps",
      requestedFrom:
        requestedFromQuery === "drafts" ? "drafts" : "overview",
    })
      .then((payload) => {
        setDraftGenerationCheckpoint(normalizeDraftGenerationCheckpoint(payload.checkpoint || null));
        setDraftGenerationAnswers({});
        navigate(
          `/drafting?draft=${encodeURIComponent(payload.draft.id)}&matter=${encodeURIComponent(
            matterIdFromQuery,
          )}&mode=edit`,
          { replace: true },
        );
      })
      .catch((error) => {
        setSaveStatus("error");
        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to start draft generation.",
        );
      });
  }, [
    draftIdFromQuery,
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
    const loaderState = draftGenerationLoaderRef.current;
    if (
      draftGenerationThread?.status !== "running" ||
      draftGenerationCheckpoint
    ) {
      if (loaderState.timerId) {
        window.clearTimeout(loaderState.timerId);
      }
      draftGenerationLoaderRef.current = {
        threadId: "",
        orderedSteps: [],
        timerId: null,
      };
      setDraftGenerationLoaderSteps([]);
      return;
    }
    const threadId = String(draftGenerationThread?.id || "").trim();
    if (!threadId) return;
    if (loaderState.threadId === threadId && loaderState.orderedSteps.length) {
      return;
    }
    if (loaderState.timerId) {
      window.clearTimeout(loaderState.timerId);
    }
    const orderedSteps = shuffleList(DRAFT_GENERATION_LOADER_LIBRARY).slice(0, 12);
    draftGenerationLoaderRef.current = {
      threadId,
      orderedSteps,
      timerId: null,
    };
    setDraftGenerationLoaderSteps(orderedSteps.length ? [orderedSteps[0]] : []);
    const scheduleNextStep = (nextIndex: number) => {
      if (nextIndex >= orderedSteps.length) return;
      const timerId = window.setTimeout(() => {
        setDraftGenerationLoaderSteps((current) =>
          current.length >= nextIndex + 1
            ? current
            : [...current, orderedSteps[nextIndex]],
        );
        scheduleNextStep(nextIndex + 1);
      }, getRandomLoaderDelay());
      draftGenerationLoaderRef.current = {
        threadId,
        orderedSteps,
        timerId,
      };
    };
    scheduleNextStep(1);
    return () => {
      if (draftGenerationLoaderRef.current.timerId) {
        window.clearTimeout(draftGenerationLoaderRef.current.timerId);
      }
    };
  }, [draftGenerationCheckpoint, draftGenerationThread?.id, draftGenerationThread?.status]);

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
    setComments((prev) =>
      prev.map((comment) => (comment.id === id ? { ...comment, status } : comment)),
    );
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

  const canRenderEditor = Boolean(activeDraft);
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
        !draftGenerationCheckpoint ? (
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
                  {draftGenerationThread?.uiSummary?.sectionStatuses?.length ? (
                    <div className="draftFormatSources">
                      {draftGenerationThread.uiSummary.sectionStatuses
                        .slice(0, 8)
                        .map((item) => (
                          <span key={item.sectionId}>
                            {item.title}: {item.status.replace(/_/g, " ")}
                            {item.sourceRefCount ? ` · ${item.sourceRefCount} sources` : ""}
                            {item.warningCount ? ` · ${item.warningCount} warnings` : ""}
                          </span>
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
        {activeDraft ? (
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
          />
        ) : (
          <section className="draftBlankLoading">
            <p className="draftTemplateEyebrow">Drafting Suite</p>
            <h1>{saveStatus === "error" ? "Unable to open draft" : "Opening document"}</h1>
            <p>
              {loadError ||
                (startDraftFromQuery
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
