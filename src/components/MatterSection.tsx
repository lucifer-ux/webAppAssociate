import "../componentStyling/MatterSection.css";
import Button from "./Button";
import {
  useEffect,
  Fragment,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUp,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  FolderOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useMatterStore,
  type AcceptedRedline,
  type ClauseSection,
  type ClauseItem,
  type ContextCoreMatterState,
  type MatterDraftRecommendation,
  type MatterDraftRecommendations,
  type MatterProcessedResult,
  type MatterSignalSourceRef,
  type ObligationMapResult,
  type PageAwareBlock,
  type SectionRiskMapResult,
} from "../context/MatterStoreContext";
import Loader from "./Loader";
import UploadPopUp, { type UploadPopupValidationItem } from "./UploadPopUp";
import SearchBar, { type SearchBarMode } from "./SearchBar";
import ChatBoxMatterSection, {
  type ChatSource,
  type MatterChatMessage,
} from "./ChatBoxMatterSection";
import {
  getDraftRecommendations,
  refreshDraftRecommendations,
  startDraftRecommendation,
} from "./draftingApi";
import { buildApiUrl } from "../lib/apiBase";
import {
  createMockMatterScenario,
  deleteMockMatterResult,
  isMockMatterId,
  loadMockModeEnabled,
  saveMockModeEnabled,
  upsertMockMatterResult,
} from "../utils/mockMatterIngestion";

const formatUploadedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
};

type MatterLoaderState = {
  stage: string;
  progress: number;
  history: string[];
};

type UploadPopupMode = "create" | "append";

type MatterValidationApiResponse = {
  success?: boolean;
  error?: string;
  files?: Array<{
    file_name: string;
    accepted: boolean;
    error?: string;
    validation?: {
      size_bytes?: number;
      detected_mime?: string;
      executable_detection?: {
        has_executable_signals?: boolean;
      };
      parse?: {
        page_count?: number | null;
        estimated_pages?: number | null;
      };
    };
  }>;
};

const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const MATTER_AI_ENABLED = false;
const MATTER_UPLOAD_SESSION_KEY = "open_matter_uploader";
const MATTER_UPLOAD_MAX_FILES = 5;
const MATTER_UPLOAD_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MATTER_UPLOAD_MAX_PAGES = 20;
const GROUND_ANALYSIS_INITIAL_FACT_COUNT = 3;

type SourceViewerState = {
  fileName: string;
  documentId: string;
  blocks: PageAwareBlock[];
  highlightBlockId: string | null;
  highlightText: string;
  matterId: string;
};

type GroundNextStepsState = {
  status: string;
  recommendedSteps: Array<{
    stepId: string;
    title: string;
    description: string;
    actionType: string;
    priority: string;
    status: string;
    reason: string;
    requiredBeforeDrafting: boolean;
    draftType: string | null;
    templateKey: string | null;
    requiredInputs: string[];
  }>;
  primaryDraftingAction: {
    label: string;
    draftType: string | null;
    templateKey: string | null;
    cta: string;
  } | null;
  metaError: string | null;
};

type GroundAnalysisRawStep = Record<string, unknown> & {
  required_inputs?: unknown[];
};

type GroundAnalysisRawCard = Record<string, unknown> & {
  card_id?: unknown;
  title?: unknown;
  status?: unknown;
  confidence_percent?: unknown;
  support_score?: unknown;
  fact_text?: unknown;
  law_text?: unknown;
  inference_text?: unknown;
  inference_card?: { display_status?: unknown } | null;
  inference_meta?: { error?: unknown } | null;
  next_steps_status?: unknown;
  next_steps?: {
    recommended_next_steps?: GroundAnalysisRawStep[];
    primary_drafting_action?: {
      label?: unknown;
      draft_type?: unknown;
      template_key?: unknown;
      cta?: unknown;
    } | null;
  } | null;
  next_steps_meta?: { error?: unknown } | null;
  law_sources?: unknown[];
  verified_citations?: unknown[];
  law_bindings?: unknown[];
  law_card?: {
    law_binding_id?: unknown;
    title?: unknown;
    source_url?: unknown;
    source_domain?: unknown;
    authority_type?: unknown;
    binding_strength?: unknown;
    binding_explanation?: unknown;
    application?: unknown;
    verification_status?: unknown;
  } | null;
  legal_rules?: unknown[];
  contrary_or_limiting_points?: unknown[];
  research_gaps?: unknown[];
  law_verification_status?: unknown;
  source_files?: unknown[];
  source_refs?: MatterSignalSourceRef[];
};

type MatterDocumentEntry = NonNullable<
  MatterProcessedResult["documents"]
>[number];

type ContextCoreSearchResult = {
  chunk_id: string;
  score: number;
  text: string;
  metadata: {
    file_name?: string;
    document_role?: string;
    assertion_mode?: string;
    party_side?: string;
    page_start?: number | null;
    page_end?: number | null;
    clause_id?: string | null;
    section_id?: string | null;
  };
};

class MatterPollingTimeoutError extends Error {
  jobId: string;

  constructor(jobId: string) {
    super(
      "Matter ingestion is still running. Refresh shortly to see the new files.",
    );
    this.jobId = jobId;
  }
}

const renderHighlightedText = (
  text: string,
  clauseRanges: Array<{ start: number; end: number }>,
  blankRanges: Array<{ start: number; end: number }>,
) => {
  if (!clauseRanges.length && !blankRanges.length) return text;

  const boundaries = new Set<number>([0, text.length]);
  [...clauseRanges, ...blankRanges].forEach((range) => {
    boundaries.add(Math.max(0, Math.min(text.length, range.start)));
    boundaries.add(Math.max(0, Math.min(text.length, range.end)));
  });

  const points = [...boundaries].sort((a, b) => a - b);

  const parts: ReactNode[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === end) continue;

    const segment = text.slice(start, end);
    const inClause = clauseRanges.some(
      (range) => start < range.end && end > range.start,
    );
    const inBlank = blankRanges.some(
      (range) => start < range.end && end > range.start,
    );

    if (!inClause && !inBlank) {
      parts.push(<span key={`plain-${index}-${start}`}>{segment}</span>);
      continue;
    }

    parts.push(
      <mark
        key={`mark-${index}-${start}`}
        className={[
          inClause ? "matterClauseMark" : "",
          inBlank ? "matterBlankMark" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={
          inBlank
            ? "This field is unfilled contract cannot be executed."
            : undefined
        }
      >
        {segment}
      </mark>,
    );
  }

  return parts;
};

const normalizeSourceName = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase();

const splitSourceNames = (value: string) =>
  String(value || "")
    .split(/[,;]|\s+\+\s+|\s+and\s+/i)
    .map((item) => item.trim())
    .filter(Boolean);

const formatBriefTaxonomyLabel = (value: string) =>
  String(value || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getBriefPointSourceNames = (point: {
  sourceDocument: string;
  sourceRefs?: Array<{ fileName: string }>;
}) => {
  const fromRefs = Array.isArray(point.sourceRefs)
    ? point.sourceRefs.map((sourceRef) => sourceRef.fileName).filter(Boolean)
    : [];
  const names = fromRefs.length ? fromRefs : splitSourceNames(point.sourceDocument);
  return names.filter((name, index, list) => list.indexOf(name) === index);
};

const sourceNameKey = (value: string) =>
  normalizeSourceName(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const tokenizeForSourceMatch = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);

const scoreSourceBlock = (blockText: string, targetText: string) => {
  const tokens = new Set(tokenizeForSourceMatch(targetText));
  if (!tokens.size) return 0;
  const blockTokens = new Set(tokenizeForSourceMatch(blockText));
  let score = 0;
  tokens.forEach((token) => {
    if (blockTokens.has(token)) score += 1;
  });
  return score / tokens.size;
};

const textToSourceBlocks = (text: string): PageAwareBlock[] =>
  String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 260)
    .map((textValue, index) => ({
      block_id: `fallback_block_${index + 1}`,
      type: textValue.startsWith("#") ? "heading" : "paragraph",
      text: textValue,
      page: Math.floor(index / 8) + 1,
      page_block_index: index,
      doc_char_start: 0,
      doc_char_end: textValue.length,
    }));

type BlankFieldHit = {
  id: string;
  label: string;
  page: number;
  blockId: string;
  blockLabel: string;
  sectionLabel: string;
  start: number;
  end: number;
};

const BLANK_FIELD_REGEX = /_{3,}|\.{3,}|…{2,}/g;

const inferBlankLabel = (text: string, start: number) => {
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const lineEndCandidate = text.indexOf("\n", start);
  const lineEnd = lineEndCandidate === -1 ? text.length : lineEndCandidate;
  const line = text.slice(lineStart, lineEnd).trim();
  const beforeBlank = line
    .slice(0, Math.max(0, start - lineStart))
    .trim()
    .replace(/\s+/g, " ");

  const fieldName = beforeBlank
    .replace(/[:\-–—]+$/, "")
    .split(/[|]/)
    .pop()
    ?.trim();

  if (fieldName && fieldName.length >= 3) return fieldName;
  if (line.length >= 3) return line.slice(0, 72);
  return "Unfilled field";
};

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const defaultSectionRiskFlag = (section: ClauseSection) =>
  section.extraction_status === "ready" && section.clauses.length
    ? "REVIEW"
    : "MUTUAL";

const sectionRiskClassName = (flag: string) => {
  if (flag === "FAVORS IPPB") return "isHigh";
  if (flag === "MUTUAL") return "isClean";
  return "isReview";
};

void renderHighlightedText;
void defaultSectionRiskFlag;
void sectionRiskClassName;

type MatterSectionProps = {
  isObligationPanelOpen?: boolean;
  isPlaybookPanelOpen?: boolean;
  onCloseObligationPanel?: () => void;
  onClosePlaybookPanel?: () => void;
  conversationOpenRequest?: number;
};

type ClauseRedlinePosition = "aggressive" | "market" | "fallback";
type RepresentedParty = "ippb" | "service_provider";

type ClauseRedlineSuggestion = {
  rewrittenText: string;
  generatedAt: string;
};

type ClauseDiffPart = {
  type: "same" | "add" | "remove";
  text: string;
};

type ObligationClauseSource = {
  clause_id: string;
  heading: string;
  display_text: string;
  section_id: string;
  section_label: string;
  page_start: number;
  page_end: number;
  source_page: number | null;
  source_block_id: string | null;
};

const MatterSection = ({
  isObligationPanelOpen = false,
  isPlaybookPanelOpen = false,
  onCloseObligationPanel,
  onClosePlaybookPanel,
  conversationOpenRequest = 0,
}: MatterSectionProps) => {
  const navigate = useNavigate();
  const {
    matters,
    activeMatter,
    addMatter,
    addPersonToMatter,
    removePersonFromMatter,
    updateMatter,
    getObligationMap,
    setObligationMap,
    clearObligationMap,
    getSectionRiskMap,
    setSectionRiskMap,
    clearSectionRiskMaps,
    getAcceptedRedlines,
    setAcceptedRedlines,
    addAcceptedRedline,
    removeAcceptedRedline,
    updateAcceptedRedline,
    deleteMatter,
    markMatterJobExpired,
    setMattersFromServer,
    setActiveMatterId,
  } = useMatterStore();
  const [isPeopleDialogOpen, setIsPeopleDialogOpen] = useState(false);
  const [isExtractingPeople, setIsExtractingPeople] = useState(false);
  const [isContinuingContextCore, setIsContinuingContextCore] = useState(false);
  const [peopleExtractionMessage, setPeopleExtractionMessage] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingMatter, setIsDeletingMatter] = useState(false);
  const [isMockModeEnabled, setIsMockModeEnabled] = useState(() =>
    loadMockModeEnabled(),
  );
  const [isUploadPopupOpen, setIsUploadPopupOpen] = useState(false);
  const [uploadPopupMode, setUploadPopupMode] =
    useState<UploadPopupMode>("create");
  const [uploadQuery, setUploadQuery] = useState("");
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadValidations, setUploadValidations] = useState<
    UploadPopupValidationItem[]
  >([]);
  const [uploadPopupError, setUploadPopupError] = useState("");
  const [isValidatingUploadFiles, setIsValidatingUploadFiles] = useState(false);
  const [isUploadingMatter, setIsUploadingMatter] = useState(false);
  const [ingestingFileName, setIngestingFileName] = useState("");
  const [matterUploadLoaderState, setMatterUploadLoaderState] =
    useState<MatterLoaderState>({
      stage: "Queued matter ingestion",
      progress: 5,
      history: ["Queued matter ingestion"],
    });
  const [isAppendingMatterFiles, setIsAppendingMatterFiles] = useState(false);
  const [appendingFileName, setAppendingFileName] = useState("");
  const [matterAppendLoaderState, setMatterAppendLoaderState] =
    useState<MatterLoaderState>({
      stage: "Queued additional matter files",
      progress: 5,
      history: ["Queued additional matter files"],
    });
  const [briefAnswerText, setBriefAnswerText] = useState("");
  const [isSubmittingBriefAnswers, setIsSubmittingBriefAnswers] =
    useState(false);
  const [briefAnswerError, setBriefAnswerError] = useState("");
  const [isAcceptingBrief, setIsAcceptingBrief] = useState(false);
  const [isConfirmingSecondaryClassification, setIsConfirmingSecondaryClassification] =
    useState(false);
  const [classificationTagInput, setClassificationTagInput] = useState("");
  const [isSavingClassificationTag, setIsSavingClassificationTag] =
    useState(false);
  const [briefAcceptError, setBriefAcceptError] = useState("");
  const [isGroundAnalysisExpanded, setIsGroundAnalysisExpanded] =
    useState(false);
  const [isMatterChatOpen, setIsMatterChatOpen] = useState(false);
  const [matterChatMode, setMatterChatMode] = useState<SearchBarMode>("normal");
  const [matterChatMessages, setMatterChatMessages] = useState<
    MatterChatMessage[]
  >([]);
  const [isMatterChatSubmitting, setIsMatterChatSubmitting] = useState(false);
  const [matterChatError, setMatterChatError] = useState("");

  useEffect(() => {
    if (conversationOpenRequest > 0) {
      setIsMatterChatOpen(true);
    }
  }, [conversationOpenRequest]);
  const [matterSearchResults, setMatterSearchResults] = useState<
    ContextCoreSearchResult[]
  >([]);
  const [matterSearchError, setMatterSearchError] = useState("");
  const [matterSearchInfo, setMatterSearchInfo] = useState("");
  const [sourceViewer, setSourceViewer] = useState<SourceViewerState | null>(
    null,
  );
  const [draftRecommendations, setDraftRecommendations] =
    useState<MatterDraftRecommendations | null>(null);
  const [isLoadingDraftRecommendations, setIsLoadingDraftRecommendations] =
    useState(false);
  const [draftRecommendationError, setDraftRecommendationError] =
    useState("");
  const [startingDraftKey, setStartingDraftKey] = useState<string | null>(null);
  const sourceBlockRefs = useRef<Record<string, HTMLElement | null>>({});
  const mockPipelineTimeoutsRef = useRef<
    Array<{ matterId: string; timeoutId: number }>
  >([]);
  const lastRealMatterIdRef = useRef<string | null>(null);
  const peopleExtractionAttemptedRef = useRef<Record<string, true>>({});
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [activeClauseSelection, setActiveClauseSelection] = useState<{
    matterId: string;
    clauseId: string;
  } | null>(null);
  const [isClauseJumpPanelCollapsed, setIsClauseJumpPanelCollapsed] =
    useState(false);
  const [isClauseJumpPanelVisible, setIsClauseJumpPanelVisible] =
    useState(false);
  const [isPageAwareOpen, setIsPageAwareOpen] = useState(true);
  const [openClauseSections, setOpenClauseSections] = useState<
    Record<string, boolean>
  >({});
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const people = activeMatter?.people || [];
  const pages = activeMatter?.pageAwareStructure?.pages || [];
  const clauseSections = activeMatter?.pageAwareStructure?.sections || [];
  const uploadedDocumentCount = Math.max(
    Number(activeMatter?.document_count || 0),
    Number(activeMatter?.documents?.length || 0),
    Number(
      activeMatter?.documentResults?.filter(
        (entry) => entry?.document?.status !== "failed",
      )?.length || 0,
    ),
    activeMatter?.fileName ? 1 : 0,
  );
  const appendRemainingSlots = Math.max(
    0,
    MATTER_UPLOAD_MAX_FILES - uploadedDocumentCount,
  );
  const isActiveMockMatter = isMockMatterId(activeMatter?.id);
  const activeMatterContextCore = (activeMatter?.contextcore ||
    null) as ContextCoreMatterState | null;
  const popupFileLimit =
    uploadPopupMode === "append"
      ? appendRemainingSlots
      : MATTER_UPLOAD_MAX_FILES;
  const isAddFilesDisabled =
    !activeMatter ||
    isAppendingMatterFiles ||
    isUploadingMatter ||
    appendRemainingSlots <= 0 ||
    isActiveMockMatter;
  const matterHeading = useMemo(() => {
    const classificationName = String(
      activeMatter?.classification?.classification_name || "",
    ).trim();
    if (
      classificationName &&
      classificationName.toUpperCase() !== "UNCLASSIFIED"
    ) {
      return classificationName;
    }
    return activeMatter?.title || "No matter uploaded yet";
  }, [activeMatter?.classification?.classification_name, activeMatter?.title]);
  const accumulatedBrief = activeMatter?.accumulatedBrief || null;
  const briefDisplayPayload =
    activeMatter?.acceptedBrief?.brief || accumulatedBrief || null;
  const briefQuestions = Array.isArray(briefDisplayPayload?.questions)
    ? briefDisplayPayload.questions.filter(Boolean)
    : [];
  const briefNextAction =
    briefDisplayPayload &&
    typeof briefDisplayPayload === "object" &&
    "next_action" in briefDisplayPayload
      ? String(
          (briefDisplayPayload as Record<string, unknown>).next_action || "",
        )
      : "";
  const isBriefIndexReadinessPending =
    briefDisplayPayload?.brief_type === "pending_index_readiness" ||
    briefNextAction === "wait_for_index_readiness" ||
    (activeMatter?.accumulatedBriefReadiness?.ready === false &&
      Array.isArray(activeMatter?.accumulatedBriefReadiness?.missing) &&
      activeMatter.accumulatedBriefReadiness.missing.includes(
        "index_readiness",
      ));
  const isBriefQueryRequired =
    !isBriefIndexReadinessPending &&
    (activeMatter?.intelligence_statuses?.brief_generation ===
      "query_required" ||
      briefDisplayPayload?.decision === "query_for_user");
  const briefPoints = useMemo(
    () =>
      Array.isArray(briefDisplayPayload?.brief_points)
        ? briefDisplayPayload.brief_points
            .map((point) => {
              const pointRecord = point as Record<string, unknown> & {
                source_refs?: Array<Record<string, unknown>>;
              };
              return {
              id: String(pointRecord?.id || ""),
              heading: String(pointRecord?.heading || "").trim(),
              detail: String(pointRecord?.detail || "").trim(),
              tone: String(pointRecord?.tone || "neutral")
                .trim()
                .toLowerCase(),
              sourceDocument: String(pointRecord?.source_document || "").trim(),
              reason: String(pointRecord?.reason || "").trim(),
              pointType: String(pointRecord?.point_type || "").trim(),
              sourcePosture: String(pointRecord?.source_posture || "").trim(),
              certainty: String(pointRecord?.certainty || pointRecord?.confidence || "")
                .trim()
                .toLowerCase(),
              sourceRefs: Array.isArray(pointRecord?.source_refs)
                ? pointRecord.source_refs
                    .map((sourceRef) => ({
                      chunkId: String(sourceRef?.chunk_id || "").trim(),
                      fileName: String(sourceRef?.file_name || "").trim(),
                      pageStart:
                        sourceRef?.page_start == null
                          ? null
                          : Number(sourceRef.page_start),
                      pageEnd:
                        sourceRef?.page_end == null
                          ? null
                          : Number(sourceRef.page_end),
                      verbatimBasis: String(
                        sourceRef?.verbatim_basis || "",
                      ).trim(),
                    }))
                    .filter((sourceRef) => sourceRef.chunkId)
                : [],
              };
            })
            .filter((point) => point.id && point.heading && point.detail)
            .slice(0, 6)
        : [],
    [briefDisplayPayload?.brief_points],
  );
  const secondaryAnalysis = activeMatter?.secondaryAnalysis || null;
  const secondaryClassification =
    secondaryAnalysis?.classification &&
    typeof secondaryAnalysis.classification === "object"
      ? secondaryAnalysis.classification
      : null;
  const secondaryDocumentProfiles = Array.isArray(
    secondaryClassification?.document_profile,
  )
    ? secondaryClassification.document_profile
        .map((profile) => ({
          fileName: String(
            (profile as { file_name?: unknown }).file_name || "",
          ).trim(),
          documentType: String(
            (profile as { document_type?: unknown }).document_type ||
              "unknown",
          ).trim(),
          confidence:
            (profile as { confidence?: unknown }).confidence == null
              ? null
              : Number((profile as { confidence?: unknown }).confidence),
        }))
        .filter((profile) => profile.fileName || profile.documentType)
        .slice(0, 8)
    : [];
  const secondaryDocumentTypes = Array.isArray(
    secondaryClassification?.document_types,
  )
    ? secondaryClassification.document_types
        .map((documentType) => String(documentType || "").trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const secondaryStatus = String(secondaryAnalysis?.status || "").trim();
  const secondaryFactChecklistCount = Array.isArray(
    secondaryAnalysis?.fact_checklist,
  )
    ? secondaryAnalysis.fact_checklist.length
    : 0;
  const secondaryVerifiedFactCount = Array.isArray(
    secondaryAnalysis?.extracted_facts,
  )
    ? secondaryAnalysis.extracted_facts.length
    : 0;
  const secondaryGapCount = Array.isArray(secondaryAnalysis?.fact_gaps)
    ? secondaryAnalysis.fact_gaps.filter((gap) => {
        if (!gap || typeof gap !== "object") return false;
        return String((gap as { status?: string }).status || "") === "absent";
      }).length
    : 0;
  const secondaryClassificationMarkers = Array.isArray(
    secondaryClassification?.classification_markers,
  )
    ? secondaryClassification.classification_markers
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const secondaryUserDefinedTags = Array.isArray(
    (secondaryClassification as { user_defined_tags?: unknown[] } | null)
      ?.user_defined_tags,
  )
    ? (
        (secondaryClassification as { user_defined_tags?: unknown[] })
          .user_defined_tags || []
      )
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 12)
    : Array.isArray(activeMatter?.classification_meta?.user_defined_tags)
      ? activeMatter.classification_meta.user_defined_tags
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];
  const groundAnalysis = activeMatter?.groundAnalysis || null;
  const createMatterChatMessageId = () =>
    `matter_chat_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const groundAnalysisStatus = useMemo(() => {
    const statuses = [
      activeMatter?.intelligence_statuses?.next_step_planner,
      activeMatter?.intelligence_statuses?.inference_verification,
      activeMatter?.intelligence_statuses?.inference_generation,
      activeMatter?.intelligence_statuses?.law_verification,
      activeMatter?.intelligence_statuses?.law_generation,
      activeMatter?.intelligence_statuses?.debrief_verification,
      activeMatter?.intelligence_statuses?.debrief_generation,
    ].filter(Boolean) as string[];

    if (statuses.includes("processing")) return "processing";
    if (statuses.includes("failed")) return "failed";
    if (statuses.includes("ready")) return "ready";
    return statuses[0] || "not_started";
  }, [
    activeMatter?.intelligence_statuses?.inference_verification,
    activeMatter?.intelligence_statuses?.inference_generation,
    activeMatter?.intelligence_statuses?.next_step_planner,
    activeMatter?.intelligence_statuses?.law_verification,
    activeMatter?.intelligence_statuses?.law_generation,
    activeMatter?.intelligence_statuses?.debrief_verification,
    activeMatter?.intelligence_statuses?.debrief_generation,
  ]);
  const groundAnalysisCards = useMemo(
    () => {
      const rawGroundCards = Array.isArray(groundAnalysis?.cards)
        ? (groundAnalysis.cards as GroundAnalysisRawCard[])
        : [];
      const fallbackFactCards =
        rawGroundCards.length || !Array.isArray(secondaryAnalysis?.extracted_facts)
          ? []
          : secondaryAnalysis.extracted_facts.map((fact, index) => {
              const factRecord = fact as {
                fact_id?: string;
                assertion?: string;
                fact_type?: string;
                source_posture?: string;
                source_refs?: Array<Record<string, unknown>>;
                verification?: { similarity?: number };
              };
              const sourceRefs = Array.isArray(factRecord.source_refs)
                ? (factRecord.source_refs as MatterSignalSourceRef[])
                : [];
              const sourceFiles = Array.from(
                new Set(
                  sourceRefs
                    .map((ref) => String(ref?.file_name || "").trim())
                    .filter(Boolean),
                ),
              );
              const supportScore = Math.max(
                0,
                Math.min(
                  1,
                  Number(factRecord.verification?.similarity || 0.9),
                ),
              );
              const title = formatBriefTaxonomyLabel(
                String(factRecord.fact_type || "ContextCore fact"),
              );
              return {
                card_id: `secondary_fact_${factRecord.fact_id || index}`,
                title,
                status: "ready",
                confidence_percent: Math.round(supportScore * 100),
                support_score: supportScore,
                fact_text: String(factRecord.assertion || "").trim(),
                law_text: null,
                inference_text: null,
                inference_card: { display_status: "review" },
                law_verification_status: "not_started",
                source_files: sourceFiles,
                source_refs: sourceRefs,
                law_sources: [],
                legal_rules: [],
                contrary_or_limiting_points: [],
                research_gaps: [],
              };
            });
      const displayCards: GroundAnalysisRawCard[] = rawGroundCards.length
        ? rawGroundCards
        : fallbackFactCards;
      return displayCards
            .map((card: GroundAnalysisRawCard) => ({
              id: String(card?.card_id || ""),
              title: String(card?.title || "").trim(),
              status:
                String(card?.status || "")
                  .trim()
                  .toLowerCase() === "open"
                  ? "open"
                  : "ready",
              confidencePercent: Math.max(
                0,
                Math.min(100, Number(card?.confidence_percent || 0)),
              ),
              supportScore:
                typeof card?.support_score === "number"
                  ? Math.max(0, Math.min(1, Number(card.support_score)))
                  : null,
              factText: String(card?.fact_text || "").trim(),
              lawText:
                card?.law_text == null
                  ? null
                  : String(card.law_text || "").trim(),
              inferenceText:
                card?.inference_text == null
                  ? null
                  : String(card.inference_text || "").trim(),
              inferenceDisplayStatus: String(
                card?.inference_card?.display_status || "review",
              )
                .trim()
                .toLowerCase(),
              inferenceMetaError:
                card?.inference_meta == null
                  ? null
                  : String(card.inference_meta?.error || "").trim() || null,
              nextSteps: {
                status: String(card?.next_steps_status || "not_started")
                  .trim()
                  .toLowerCase(),
                recommendedSteps: Array.isArray(
                  card?.next_steps?.recommended_next_steps,
                )
                  ? card.next_steps.recommended_next_steps.map((step: GroundAnalysisRawStep) => ({
                      stepId: String(step?.step_id || ""),
                      title: String(step?.title || "").trim(),
                      description: String(step?.description || "").trim(),
                      actionType: String(step?.action_type || "")
                        .trim()
                        .toLowerCase(),
                      priority: String(step?.priority || "medium")
                        .trim()
                        .toLowerCase(),
                      status: String(step?.status || "ready")
                        .trim()
                        .toLowerCase(),
                      reason: String(step?.reason || "").trim(),
                      requiredBeforeDrafting: Boolean(
                        step?.required_before_drafting,
                      ),
                      draftType:
                        step?.draft_type == null
                          ? null
                          : String(step.draft_type || "").trim() || null,
                      templateKey:
                        step?.template_key == null
                          ? null
                          : String(step.template_key || "").trim() || null,
                      requiredInputs: Array.isArray(step?.required_inputs)
                        ? step.required_inputs
                            .map((item: unknown) => String(item || "").trim())
                            .filter(Boolean)
                        : [],
                    }))
                  : [],
                primaryDraftingAction:
                  card?.next_steps?.primary_drafting_action == null
                    ? null
                    : {
                        label: String(
                          card.next_steps.primary_drafting_action?.label || "",
                        ).trim(),
                        draftType:
                          card.next_steps.primary_drafting_action?.draft_type ==
                          null
                            ? null
                            : String(
                                card.next_steps.primary_drafting_action
                                  ?.draft_type || "",
                              ).trim() || null,
                        templateKey:
                          card.next_steps.primary_drafting_action
                            ?.template_key == null
                            ? null
                            : String(
                                card.next_steps.primary_drafting_action
                                  ?.template_key || "",
                              ).trim() || null,
                        cta: String(
                          card.next_steps.primary_drafting_action?.cta ||
                            "Open draft",
                        ).trim(),
                      },
                metaError:
                  card?.next_steps_meta == null
                    ? null
                    : String(card.next_steps_meta?.error || "").trim() || null,
              } satisfies GroundNextStepsState,
              lawSources: Array.isArray(card?.law_sources)
                ? (card.law_sources as Array<Record<string, unknown>>)
                : [],
              lawCard: (() => {
                if (card?.law_card && typeof card.law_card === "object") {
                  return {
                      lawBindingId: String(
                        card.law_card.law_binding_id || "",
                      ).trim(),
                      title: String(card.law_card.title || "").trim(),
                      sourceUrl: String(card.law_card.source_url || "").trim(),
                      sourceDomain: String(
                        card.law_card.source_domain || "",
                      ).trim(),
                      authorityType: String(
                        card.law_card.authority_type || "",
                      ).trim(),
                      bindingStrength: String(
                        card.law_card.binding_strength || "",
                      ).trim(),
                      bindingExplanation: String(
                        card.law_card.binding_explanation || "",
                      ).trim(),
                      application: String(
                        card.law_card.application || "",
                      ).trim(),
                      verificationStatus: String(
                        card.law_card.verification_status || "",
                      ).trim(),
                    };
                }
                return null;
              })(),
              legalRules: Array.isArray(card?.legal_rules)
                ? card.legal_rules
                : [],
              contraryPoints: Array.isArray(card?.contrary_or_limiting_points)
                ? card.contrary_or_limiting_points
                : [],
              researchGaps: Array.isArray(card?.research_gaps)
                ? card.research_gaps
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : [],
              lawVerificationStatus: String(
                card?.law_verification_status || "not_started",
              ).trim(),
              sourceFiles: Array.isArray(card?.source_files)
                ? card.source_files
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : [],
              sourceRefs: Array.isArray(card?.source_refs)
                ? card.source_refs
                : [],
            }))
            .filter((card) => card.id && card.title && card.factText)
    },
    [groundAnalysis?.cards, secondaryAnalysis?.extracted_facts],
  );
  const hasHiddenGroundAnalysisCards =
    groundAnalysisCards.length > GROUND_ANALYSIS_INITIAL_FACT_COUNT;
  const visibleGroundAnalysisCards = isGroundAnalysisExpanded
    ? groundAnalysisCards
    : groundAnalysisCards.slice(0, GROUND_ANALYSIS_INITIAL_FACT_COUNT);
  const hiddenGroundAnalysisCardCount = Math.max(
    0,
    groundAnalysisCards.length - visibleGroundAnalysisCards.length,
  );

  useEffect(() => {
    setIsGroundAnalysisExpanded(false);
  }, [activeMatter?.id]);

  useEffect(() => {
    setClassificationTagInput("");
  }, [activeMatter?.id]);

  useEffect(() => {
    setDraftRecommendations(activeMatter?.draftRecommendations || null);
    setDraftRecommendationError("");
    setStartingDraftKey(null);
  }, [
    activeMatter?.id,
    activeMatter?.draftRecommendations?.generated_at,
    activeMatter?.draftRecommendations?.counts?.total,
  ]);

  const runPeopleExtraction = async (
    matterId: string,
    options?: { markAttempted?: boolean },
  ) => {
    if (!matterId || isActiveMockMatter) return;

    if (options?.markAttempted) {
      peopleExtractionAttemptedRef.current[matterId] = true;
    }

    setIsExtractingPeople(true);
    setPeopleExtractionMessage("");

    try {
      const response = await fetch(
        buildApiUrl(`/api/matters/${encodeURIComponent(matterId)}/people/extract`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
          }),
        },
      );

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setPeopleExtractionMessage(
          payload?.error || "Could not extract people from the active matter.",
        );
        return;
      }

      if (payload?.result) {
        updateMatter(payload.result);
      }

      if (payload?.needs_categorization) {
        const unresolved = Array.isArray(payload?.unresolved_candidates)
          ? payload.unresolved_candidates
              .map((item: { name?: string }) => item?.name || "")
              .filter(Boolean)
          : [];
        setPeopleExtractionMessage(
          payload?.categorization_prompt ||
            (unresolved.length
              ? `Categorize these participants manually: ${unresolved.join(", ")}.`
              : "Categorize the unresolved participants manually."),
        );
        return;
      }

      if (payload?.extracted_count > 0) {
        setPeopleExtractionMessage(
          `Added ${payload.extracted_count} party and counsel entries from ContextCore.`,
        );
        return;
      }

      setPeopleExtractionMessage(
        "No people could be extracted from the indexed matter.",
      );
    } catch {
      setPeopleExtractionMessage(
        "Could not extract people from the active matter.",
      );
    } finally {
      setIsExtractingPeople(false);
    }
  };

  useEffect(() => {
    if (people.length > 0) {
      setPeopleExtractionMessage("");
    }
  }, [people.length]);

  const handleContinueContextCore = async () => {
    if (!activeMatter || isActiveMockMatter || isContinuingContextCore) {
      return;
    }

    setIsContinuingContextCore(true);
    setBriefAnswerError("");
    setPeopleExtractionMessage("");

    try {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/contextcore/continue`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        result?: MatterProcessedResult;
        error?: string;
        people?: {
          extracted_count?: number;
          needs_categorization?: boolean;
          unresolved_candidates?: Array<{ name?: string }>;
        };
      };

      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(
          payload?.error || "Failed to continue ContextCore processing.",
        );
      }

      updateMatter(payload.result);

      if (payload.people?.needs_categorization) {
        const unresolved = Array.isArray(payload.people.unresolved_candidates)
          ? payload.people.unresolved_candidates
              .map((item) => item?.name || "")
              .filter(Boolean)
          : [];
        setPeopleExtractionMessage(
          unresolved.length
            ? `Categorize these participants manually: ${unresolved.join(", ")}.`
            : "Categorize the unresolved participants manually.",
        );
      } else if ((payload.people?.extracted_count || 0) > 0) {
        setPeopleExtractionMessage(
          `Added ${payload.people?.extracted_count} party and counsel entries from ContextCore.`,
        );
      }
    } catch (error) {
      setBriefAnswerError(
        error instanceof Error
          ? error.message
          : "Failed to continue ContextCore processing.",
      );
    } finally {
      setIsContinuingContextCore(false);
    }
  };

  const shouldShowGroundAnalysis =
    Boolean(activeMatter?.acceptedBrief?.accepted_at) ||
    Boolean(groundAnalysis) ||
    activeMatter?.intelligence_statuses?.inference_generation ===
      "processing" ||
    activeMatter?.intelligence_statuses?.inference_verification ===
      "processing" ||
    activeMatter?.intelligence_statuses?.debrief_generation === "processing" ||
    activeMatter?.intelligence_statuses?.debrief_verification ===
      "processing" ||
    activeMatter?.intelligence_statuses?.law_generation === "processing" ||
    activeMatter?.intelligence_statuses?.law_verification === "processing" ||
    activeMatter?.intelligence_statuses?.next_step_planner === "processing" ||
    activeMatter?.intelligence_statuses?.inference_generation === "ready" ||
    activeMatter?.intelligence_statuses?.inference_verification === "ready" ||
    activeMatter?.intelligence_statuses?.debrief_generation === "ready" ||
    activeMatter?.intelligence_statuses?.debrief_verification === "ready" ||
    activeMatter?.intelligence_statuses?.law_generation === "ready" ||
    activeMatter?.intelligence_statuses?.law_verification === "ready" ||
    activeMatter?.intelligence_statuses?.next_step_planner === "ready" ||
    activeMatter?.intelligence_statuses?.inference_generation === "failed" ||
    activeMatter?.intelligence_statuses?.inference_verification === "failed" ||
    activeMatter?.intelligence_statuses?.debrief_generation === "failed" ||
    activeMatter?.intelligence_statuses?.debrief_verification === "failed" ||
    activeMatter?.intelligence_statuses?.law_generation === "failed" ||
    activeMatter?.intelligence_statuses?.law_verification === "failed" ||
    activeMatter?.intelligence_statuses?.next_step_planner === "failed";
  const isGroundAnalysisProcessing =
    activeMatter?.intelligence_statuses?.debrief_generation === "processing" ||
    activeMatter?.intelligence_statuses?.debrief_verification ===
      "processing" ||
    activeMatter?.intelligence_statuses?.law_generation === "processing" ||
    activeMatter?.intelligence_statuses?.law_verification === "processing" ||
    activeMatter?.intelligence_statuses?.inference_generation ===
      "processing" ||
    activeMatter?.intelligence_statuses?.inference_verification ===
      "processing" ||
    activeMatter?.intelligence_statuses?.next_step_planner === "processing";
  const groundAnalysisFailed =
    activeMatter?.intelligence_statuses?.debrief_generation === "failed" ||
    activeMatter?.intelligence_statuses?.debrief_verification === "failed" ||
    activeMatter?.intelligence_statuses?.law_generation === "failed" ||
    activeMatter?.intelligence_statuses?.law_verification === "failed" ||
    activeMatter?.intelligence_statuses?.inference_generation === "failed" ||
    activeMatter?.intelligence_statuses?.inference_verification === "failed" ||
    activeMatter?.intelligence_statuses?.next_step_planner === "failed";
  const groundAnalysisErrorMessage =
    String(groundAnalysis?.meta?.error || "").trim() ||
    "Ground analysis failed during background processing. Check the server logs for the first pipeline error after document-signals-collected.";
  const groundAnalysisShimmerCount = Math.max(
    3,
    groundAnalysisCards.length || 0,
  );
  const activeDraftRecommendations =
    draftRecommendations || activeMatter?.draftRecommendations || null;
  const draftRecommendationItems = useMemo(
    () =>
      Array.isArray(activeDraftRecommendations?.recommendations)
        ? activeDraftRecommendations.recommendations
        : [],
    [activeDraftRecommendations?.recommendations],
  );
  const readyDraftRecommendations = useMemo(
    () =>
      draftRecommendationItems
        .filter((item) => item.can_generate_now)
        .slice(0, 6),
    [draftRecommendationItems],
  );
  const lockedDraftRecommendations = useMemo(
    () =>
      draftRecommendationItems
        .filter((item) => !item.can_generate_now)
        .slice(0, 6),
    [draftRecommendationItems],
  );
  const hasDraftRecommendationFacts =
    groundAnalysisCards.length > 0 || secondaryVerifiedFactCount > 0;
  const canLoadDraftRecommendations =
    Boolean(activeMatter?.id) &&
    !isActiveMockMatter &&
    hasDraftRecommendationFacts &&
    !isGroundAnalysisProcessing;
  const shouldShowDraftRecommendations =
    Boolean(activeMatter?.id) &&
    (draftRecommendationItems.length > 0 ||
      isLoadingDraftRecommendations ||
      canLoadDraftRecommendations ||
      isGroundAnalysisProcessing);
  const draftRecommendationsPending =
    !draftRecommendationItems.length &&
    (isLoadingDraftRecommendations || isGroundAnalysisProcessing);
  const findDocumentBySource = (
    sourceName: string,
    sourceRef?: MatterSignalSourceRef | null,
  ) => {
    const documents = Array.isArray(activeMatter?.documentResults)
      ? activeMatter.documentResults
      : [];
    const normalizedName = normalizeSourceName(sourceName);
    const sourceKey = sourceNameKey(sourceName);
    const normalizedRefDocumentId = normalizeSourceName(
      sourceRef?.document_id || "",
    );

    return documents.find((entry) => {
      const fileName = normalizeSourceName(entry?.document?.fileName || "");
      const documentId = normalizeSourceName(entry?.document?.id || "");
      const fileKey = sourceNameKey(entry?.document?.fileName || "");
      return (
        (normalizedRefDocumentId && documentId === normalizedRefDocumentId) ||
        (normalizedName && fileName === normalizedName) ||
        (normalizedName && fileName.includes(normalizedName)) ||
        (normalizedName &&
          normalizeSourceName(sourceName).includes(fileName)) ||
        (sourceKey && fileKey === sourceKey) ||
        (sourceKey && fileKey.includes(sourceKey)) ||
        (sourceKey && sourceKey.includes(fileKey))
      );
    });
  };

  const buildSourceViewerBlocks = (
    documentEntry: MatterDocumentEntry | undefined,
  ) => {
    const pageBlocks =
      documentEntry?.page_aware_structure?.pages?.flatMap(
        (page: { blocks?: PageAwareBlock[] }) =>
          Array.isArray(page.blocks) ? page.blocks : [],
      ) || [];
    if (pageBlocks.length) return pageBlocks;

    return textToSourceBlocks(
      documentEntry?.page_aware_structure?.full_text ||
        documentEntry?.preview_text ||
        "",
    );
  };

  const resolveHighlightBlock = (
    blocks: PageAwareBlock[],
    sourceRef: MatterSignalSourceRef | null,
    fallbackText: string,
  ) => {
    if (sourceRef?.page) {
      const pageBlocks = blocks.filter(
        (block) => block.page === sourceRef.page,
      );
      const quote = String(sourceRef.quote || sourceRef.fact || "").trim();
      if (quote) {
        const quoteMatch = pageBlocks.find((block) =>
          block.text.toLowerCase().includes(quote.toLowerCase()),
        );
        if (quoteMatch) return quoteMatch.block_id;
      }
      if (pageBlocks[0]) return pageBlocks[0].block_id;
    }

    const scored = blocks
      .map((block) => ({
        block,
        score: scoreSourceBlock(block.text, fallbackText),
      }))
      .sort((a, b) => b.score - a.score);

    return scored[0]?.score > 0
      ? scored[0].block.block_id
      : blocks[0]?.block_id || null;
  };

  const openSourceViewer = ({
    sourceName,
    sourceRef = null,
    fallbackText,
  }: {
    sourceName: string;
    sourceRef?: MatterSignalSourceRef | null;
    fallbackText: string;
  }) => {
    if (!activeMatter) return;
    const documentEntry = findDocumentBySource(sourceName, sourceRef);
    const blocks = buildSourceViewerBlocks(documentEntry);

    if (!documentEntry || !blocks.length) return;

    const highlightText = String(
      sourceRef?.quote || sourceRef?.fact || fallbackText || "",
    ).trim();
    setSourceViewer({
      matterId: activeMatter.id,
      fileName: documentEntry.document.fileName,
      documentId: documentEntry.document.id,
      blocks,
      highlightBlockId: resolveHighlightBlock(blocks, sourceRef, highlightText),
      highlightText,
    });
  };

  const sourceViewerPages = useMemo(() => {
    if (!sourceViewer) return [];
    const grouped = new Map<number, PageAwareBlock[]>();
    sourceViewer.blocks.forEach((block) => {
      const pageNumber = Number(block.page || 1);
      const pageBlocks = grouped.get(pageNumber) || [];
      pageBlocks.push(block);
      grouped.set(pageNumber, pageBlocks);
    });
    return [...grouped.entries()]
      .sort(([left], [right]) => left - right)
      .map(([pageNumber, blocks]) => ({
        pageNumber,
        blocks,
        firstBlockId: blocks[0]?.block_id || "",
        label: `Page ${pageNumber}`,
      }));
  }, [sourceViewer]);

  const highlightedSourcePage = useMemo(() => {
    if (!sourceViewer?.highlightBlockId) return null;
    const matchedPage = sourceViewerPages.find((page) =>
      page.blocks.some(
        (block) => block.block_id === sourceViewer.highlightBlockId,
      ),
    );
    return matchedPage?.pageNumber || null;
  }, [sourceViewer?.highlightBlockId, sourceViewerPages]);

  const scrollToSourcePage = (firstBlockId: string) => {
    if (!firstBlockId) return;
    sourceBlockRefs.current[firstBlockId]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const totalBlockCount = useMemo(
    () => pages.reduce((count, page) => count + page.blocks.length, 0),
    [pages],
  );
  const activeClauseId =
    activeMatter && activeClauseSelection?.matterId === activeMatter.id
      ? activeClauseSelection.clauseId
      : null;

  const activeClause = useMemo(() => {
    for (const section of clauseSections) {
      const matchedClause = section.clauses.find(
        (clause) => clause.clause_id === activeClauseId,
      );
      if (matchedClause) return matchedClause;
    }
    return null;
  }, [activeClauseId, clauseSections]);
  const activeClauseSection = useMemo(() => {
    if (!activeClauseId) return null;
    return (
      clauseSections.find((section) =>
        section.clauses.some((clause) => clause.clause_id === activeClauseId),
      ) || null
    );
  }, [activeClauseId, clauseSections]);

  const highlightMap = useMemo(() => {
    const map = new Map<string, Array<{ start: number; end: number }>>();
    if (!activeClause) return map;

    activeClause.source_refs.forEach((sourceRef) => {
      const existing = map.get(sourceRef.block_id) || [];
      existing.push({
        start: sourceRef.start_char_in_block,
        end: sourceRef.end_char_in_block,
      });
      map.set(sourceRef.block_id, existing);
    });

    return map;
  }, [activeClause]);

  const blankFieldHits = useMemo<BlankFieldHit[]>(() => {
    const pageIndex = activeMatter?.pageIndex || [];

    const getSectionLabelForPage = (pageNumber: number) => {
      const matched = pageIndex.find(
        (item) => pageNumber >= item.start && pageNumber <= item.end,
      );
      return matched?.label || "Unmapped section";
    };

    const hits: BlankFieldHit[] = [];

    pages.forEach((page) => {
      page.blocks.forEach((block) => {
        const text = block.text || "";
        BLANK_FIELD_REGEX.lastIndex = 0;
        while (true) {
          const match = BLANK_FIELD_REGEX.exec(text);
          if (!match) break;
          const start = match.index;
          const end = match.index + match[0].length;
          const label = inferBlankLabel(text, start);
          hits.push({
            id: `${block.block_id}_${start}_${end}`,
            label,
            page: page.page_number,
            blockId: block.block_id,
            blockLabel: page.label || "other",
            sectionLabel: getSectionLabelForPage(page.page_number),
            start,
            end,
          });
        }
      });
    });

    return hits;
  }, [activeMatter?.pageIndex, pages]);

  const blankFieldMap = useMemo(() => {
    const map = new Map<string, Array<{ start: number; end: number }>>();
    blankFieldHits.forEach((hit) => {
      const list = map.get(hit.blockId) || [];
      list.push({ start: hit.start, end: hit.end });
      map.set(hit.blockId, list);
    });
    return map;
  }, [blankFieldHits]);

  const blankFieldsBySection = useMemo(() => {
    const grouped = new Map<string, BlankFieldHit[]>();
    blankFieldHits.forEach((hit) => {
      const list = grouped.get(hit.sectionLabel) || [];
      list.push(hit);
      grouped.set(hit.sectionLabel, list);
    });
    return [...grouped.entries()];
  }, [blankFieldHits]);
  const [isBlankFieldBannerOpen, setIsBlankFieldBannerOpen] = useState(false);
  const [obligationMapStatus, setObligationMapStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [obligationMapError, setObligationMapError] = useState("");
  const [obligationMapResult, setObligationMapResult] =
    useState<ObligationMapResult | null>(null);
  const [sectionRiskStatusById, setSectionRiskStatusById] = useState<
    Record<string, "idle" | "loading" | "ready" | "error">
  >({});
  const [sectionRiskErrorById, setSectionRiskErrorById] = useState<
    Record<string, string>
  >({});
  const [quickAnalysisStatus, setQuickAnalysisStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [quickAnalysisProgress, setQuickAnalysisProgress] = useState({
    done: 0,
    total: 0,
  });
  const [representedParty, setRepresentedParty] =
    useState<RepresentedParty>("service_provider");
  const [selectedRedlinePositionByClause, setSelectedRedlinePositionByClause] =
    useState<Record<string, ClauseRedlinePosition>>({});
  const [redlineSuggestionByKey, setRedlineSuggestionByKey] = useState<
    Record<string, ClauseRedlineSuggestion>
  >({});
  const [redlineLoadingByKey, setRedlineLoadingByKey] = useState<
    Record<string, boolean>
  >({});
  const [redlineErrorByKey, setRedlineErrorByKey] = useState<
    Record<string, string>
  >({});
  const [redlineTitleDraftByKey, setRedlineTitleDraftByKey] = useState<
    Record<string, string>
  >({});
  const [redlineTextDraftByKey, setRedlineTextDraftByKey] = useState<
    Record<string, string>
  >({});

  const obligationClauseSources = useMemo<ObligationClauseSource[]>(() => {
    const sources: ObligationClauseSource[] = [];
    clauseSections.forEach((section) => {
      if (section.extraction_status !== "ready") return;
      section.clauses.forEach((clause) => {
        const firstSource = clause.source_refs[0];
        sources.push({
          clause_id: clause.clause_id,
          heading: clause.heading,
          display_text: clause.display_text,
          section_id: section.section_id,
          section_label: section.section_label,
          page_start: section.page_start,
          page_end: section.page_end,
          source_page: firstSource?.page || null,
          source_block_id: firstSource?.block_id || null,
        });
      });
    });
    return sources;
  }, [clauseSections]);
  const visibleClauseSections = useMemo(
    () =>
      clauseSections.filter(
        (section) =>
          section.extraction_status === "ready" && section.clauses.length > 0,
      ),
    [clauseSections],
  );

  const obligationClauseById = useMemo(() => {
    const map = new Map<string, ObligationClauseSource>();
    obligationClauseSources.forEach((source) => {
      map.set(source.clause_id, source);
    });
    return map;
  }, [obligationClauseSources]);
  const sectionRiskMaps = useMemo(() => {
    const map = new Map<string, SectionRiskMapResult>();
    if (!activeMatter) return map;
    clauseSections.forEach((section) => {
      const sectionRisk = getSectionRiskMap(
        activeMatter.id,
        section.section_id,
      );
      if (sectionRisk) map.set(section.section_id, sectionRisk);
    });
    return map;
  }, [activeMatter?.id, clauseSections]);

  const pageAwareRiskSummary = useMemo(() => {
    let high = 0;
    let review = 0;
    let clean = 0;

    clauseSections.forEach((section) => {
      if (section.extraction_status !== "ready" || !section.clauses.length) {
        clean += 1;
        return;
      }
      const sectionRisk = sectionRiskMaps.get(section.section_id);
      if (!sectionRisk) {
        review += 1;
        return;
      }
      if (sectionRisk.counts.high > 0) {
        high += 1;
        return;
      }
      if (sectionRisk.counts.review > 0) {
        review += 1;
        return;
      }
      clean += 1;
    });

    return { high, review, clean };
  }, [clauseSections, sectionRiskMaps]);
  const clauseWarningLevelById = useMemo(() => {
    const map = new Map<string, "high" | "review" | "clean">();
    clauseSections.forEach((section) => {
      const sectionRisk = sectionRiskMaps.get(section.section_id);
      if (!sectionRisk) return;
      sectionRisk.items.forEach((item) => {
        map.set(item.clause_id, item.risk);
      });
    });
    return map;
  }, [clauseSections, sectionRiskMaps]);

  const blockWarningLevel = useMemo(() => {
    const rank = { clean: 0, review: 1, high: 2 } as const;
    const map = new Map<string, "high" | "review" | "clean">();
    clauseSections.forEach((section) => {
      section.clauses.forEach((clause) => {
        const risk = clauseWarningLevelById.get(clause.clause_id);
        if (!risk || risk === "clean") return;
        clause.source_refs.forEach((sourceRef) => {
          const existing = map.get(sourceRef.block_id);
          if (!existing || rank[risk] > rank[existing]) {
            map.set(sourceRef.block_id, risk);
          }
        });
      });
    });
    return map;
  }, [clauseSections, clauseWarningLevelById]);
  const acceptedRedlines = useMemo(
    () => (activeMatter ? getAcceptedRedlines(activeMatter.id) : []),
    [activeMatter?.id, getAcceptedRedlines],
  );

  useEffect(() => {
    if (!MATTER_AI_ENABLED || !activeMatter) return;
    let cancelled = false;
    const loadAcceptedRedlines = async () => {
      try {
        const response = await fetch(
          buildApiUrl(
            `/api/matters/${encodeURIComponent(activeMatter.id)}/redlines/accepted`,
          ),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          redlines?: AcceptedRedline[];
        };
        if (cancelled || !response.ok || !payload?.success) return;
        setAcceptedRedlines(
          activeMatter.id,
          Array.isArray(payload.redlines) ? payload.redlines : [],
        );
      } catch {
        // ignore loading failures
      }
    };
    void loadAcceptedRedlines();
    return () => {
      cancelled = true;
    };
  }, [activeMatter?.id]);

  const toWordTokens = (value: string) => value.match(/(\s+|[^\s]+)/g) || [];

  const buildClauseDiff = (originalText: string, rewrittenText: string) => {
    const a = toWordTokens(originalText);
    const b = toWordTokens(rewrittenText);
    const rows = a.length + 1;
    const cols = b.length + 1;
    const lcs = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        if (a[i - 1] === b[j - 1]) {
          lcs[i][j] = lcs[i - 1][j - 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
        }
      }
    }

    const result: ClauseDiffPart[] = [];
    let i = a.length;
    let j = b.length;
    const pushPart = (type: ClauseDiffPart["type"], text: string) => {
      const prev = result[result.length - 1];
      if (prev && prev.type === type) {
        prev.text = `${text}${prev.text}`;
        return;
      }
      result.push({ type, text });
    };

    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        pushPart("same", a[i - 1]);
        i -= 1;
        j -= 1;
      } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
        pushPart("remove", a[i - 1]);
        i -= 1;
      } else {
        pushPart("add", b[j - 1]);
        j -= 1;
      }
    }
    while (i > 0) {
      pushPart("remove", a[i - 1]);
      i -= 1;
    }
    while (j > 0) {
      pushPart("add", b[j - 1]);
      j -= 1;
    }

    return result.reverse();
  };

  const activeRedlinePosition = activeClauseId
    ? selectedRedlinePositionByClause[activeClauseId] || "market"
    : "market";
  const activeClauseKey = activeClauseId
    ? `${activeClauseId}:${representedParty}:${activeRedlinePosition}`
    : null;
  const activeSuggestion =
    activeClauseKey && redlineSuggestionByKey[activeClauseKey]
      ? redlineSuggestionByKey[activeClauseKey]
      : null;
  const activeRedlineError =
    activeClauseKey && redlineErrorByKey[activeClauseKey]
      ? redlineErrorByKey[activeClauseKey]
      : "";
  const activeRedlineLoading = !!(
    activeClauseKey && redlineLoadingByKey[activeClauseKey]
  );
  const activeAcceptedCount =
    activeMatter && activeClauseId
      ? acceptedRedlines.filter((item) => item.clauseId === activeClauseId)
          .length
      : 0;
  const activeDiff = useMemo(() => {
    if (!activeClause || !activeSuggestion?.rewrittenText) return [];
    return buildClauseDiff(
      activeClause.display_text,
      activeSuggestion.rewrittenText,
    );
  }, [activeClause?.clause_id, activeSuggestion?.rewrittenText]);

  useEffect(() => {
    if (!activeMatter || !visibleClauseSections.length) return;

    const firstSection = visibleClauseSections[0];
    const firstClause = firstSection.clauses[0];
    if (!firstClause) return;

    setIsPageAwareOpen(true);
    setOpenClauseSections(() => {
      const next: Record<string, boolean> = {};
      visibleClauseSections.forEach((section, index) => {
        next[`${activeMatter.id}:${section.section_id}`] = index === 0;
      });
      return next;
    });
    setActiveClauseSelection({
      matterId: activeMatter.id,
      clauseId: firstClause.clause_id,
    });
  }, [activeMatter?.id, visibleClauseSections]);

  useEffect(() => {
    setBriefAnswerText("");
    setBriefAnswerError("");
    setBriefAcceptError("");
  }, [activeMatter?.id, accumulatedBrief?.decision]);

  useEffect(() => {
    if (!sourceViewer?.highlightBlockId) return;
    window.setTimeout(() => {
      sourceBlockRefs.current[
        sourceViewer.highlightBlockId || ""
      ]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  }, [sourceViewer?.documentId, sourceViewer?.highlightBlockId]);

  useEffect(() => {
    if (activeMatter && isBriefQueryRequired) {
      setIsMatterChatOpen(true);
    }
  }, [activeMatter?.id, isBriefQueryRequired]);

  useEffect(() => {
    setMatterChatMessages([]);
    setMatterChatError("");
    setMatterChatMode("normal");
  }, [activeMatter?.id]);

  useEffect(() => {
    const shouldPollIntelligence =
      activeMatter?.intelligence_statuses?.brief_generation === "processing" ||
      activeMatter?.intelligence_statuses?.brief_verification ===
        "processing" ||
      activeMatter?.intelligence_statuses?.law_generation === "processing" ||
      activeMatter?.intelligence_statuses?.law_verification ===
        "processing" ||
      activeMatter?.intelligence_statuses?.inference_generation ===
        "processing" ||
      activeMatter?.intelligence_statuses?.inference_verification ===
        "processing" ||
      activeMatter?.intelligence_statuses?.next_step_planner === "processing";
    if (
      !activeMatter?.job_id ||
      isMockMatterId(activeMatter.id) ||
      (activeMatter.extractedFieldsStatus !== "processing" &&
        !shouldPollIntelligence)
    ) {
      return;
    }

    let cancelled = false;

    const pollForFields = async () => {
      try {
        const response = await fetch(
          buildApiUrl(
            `/api/matters/jobs/${encodeURIComponent(activeMatter.job_id)}`,
          ),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          result?: MatterProcessedResult | null;
          error?: string;
        };

        if (!response.ok || !payload.success) {
          if (!cancelled) {
            markMatterJobExpired(activeMatter.id);
          }
          return;
        }

        if (!cancelled && payload.result) {
          updateMatter(payload.result);
        }

        const nextResult = payload.result;
        const shouldContinue =
          nextResult?.extracted_fields_status === "processing" ||
          nextResult?.matter?.intelligence_statuses?.brief_generation ===
            "processing" ||
          nextResult?.matter?.intelligence_statuses?.brief_verification ===
            "processing" ||
          nextResult?.matter?.intelligence_statuses?.law_generation ===
            "processing" ||
          nextResult?.matter?.intelligence_statuses?.law_verification ===
            "processing" ||
          nextResult?.matter?.intelligence_statuses?.inference_generation ===
            "processing" ||
          nextResult?.matter?.intelligence_statuses?.inference_verification ===
            "processing" ||
          nextResult?.matter?.intelligence_statuses?.next_step_planner ===
            "processing";

        if (!cancelled && shouldContinue) {
          window.setTimeout(() => {
            void pollForFields();
          }, 5000);
        }
      } catch {
        if (!cancelled) markMatterJobExpired(activeMatter.id);
      }
    };

    void pollForFields();

    return () => {
      cancelled = true;
    };
  }, [
    activeMatter?.extractedFieldsStatus,
    activeMatter?.job_id,
    activeMatter?.intelligence_statuses?.brief_generation,
    activeMatter?.intelligence_statuses?.brief_verification,
    activeMatter?.intelligence_statuses?.law_generation,
    activeMatter?.intelligence_statuses?.law_verification,
    activeMatter?.intelligence_statuses?.inference_generation,
    activeMatter?.intelligence_statuses?.inference_verification,
    activeMatter?.intelligence_statuses?.next_step_planner,
    activeMatter?.id,
    markMatterJobExpired,
    updateMatter,
  ]);

  useEffect(() => {
    const shouldPollGroundAnalysis =
      Boolean(activeMatter?.id) &&
      !isMockMatterId(activeMatter?.id) &&
      (activeMatter?.intelligence_statuses?.debrief_generation ===
        "processing" ||
        activeMatter?.intelligence_statuses?.debrief_verification ===
          "processing" ||
        activeMatter?.intelligence_statuses?.law_generation === "processing" ||
        activeMatter?.intelligence_statuses?.law_verification ===
          "processing" ||
        activeMatter?.intelligence_statuses?.inference_generation ===
          "processing" ||
        activeMatter?.intelligence_statuses?.inference_verification ===
          "processing" ||
        activeMatter?.intelligence_statuses?.next_step_planner ===
          "processing");

    if (!shouldPollGroundAnalysis || !activeMatter?.id) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let isRequestInFlight = false;

    const pollGroundAnalysis = async () => {
      if (cancelled || isRequestInFlight) return;
      isRequestInFlight = true;
      try {
        const response = await fetch(
          buildApiUrl(
            `/api/matters/${encodeURIComponent(activeMatter.id)}/ground-analysis`,
          ),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          result?: MatterProcessedResult | null;
          statuses?: {
            generation?: string;
            verification?: string;
            law_generation?: string;
            law_verification?: string;
            inference_generation?: string;
            inference_verification?: string;
            next_step_planner?: string;
          };
        };

        if (!response.ok || !payload.success) {
          return;
        }

        if (!cancelled && payload.result) {
          updateMatter(payload.result);
        }

        const shouldContinue =
          payload.statuses?.generation === "processing" ||
          payload.statuses?.verification === "processing" ||
          payload.statuses?.law_generation === "processing" ||
          payload.statuses?.law_verification === "processing" ||
          payload.statuses?.inference_generation === "processing" ||
          payload.statuses?.inference_verification === "processing" ||
          payload.statuses?.next_step_planner === "processing";

        if (!cancelled && shouldContinue) {
          timeoutId = window.setTimeout(() => {
            void pollGroundAnalysis();
          }, 5000);
        }
      } catch {
        // Ignore transient polling failures here; the main matter record remains usable.
      } finally {
        isRequestInFlight = false;
      }
    };

    void pollGroundAnalysis();

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    activeMatter?.id,
    activeMatter?.intelligence_statuses?.debrief_generation,
    activeMatter?.intelligence_statuses?.debrief_verification,
    activeMatter?.intelligence_statuses?.law_generation,
    activeMatter?.intelligence_statuses?.law_verification,
    activeMatter?.intelligence_statuses?.inference_generation,
    activeMatter?.intelligence_statuses?.inference_verification,
    activeMatter?.intelligence_statuses?.next_step_planner,
    updateMatter,
  ]);

  useEffect(() => {
    if (!activeMatter?.id || !canLoadDraftRecommendations) return;
    if (draftRecommendationItems.length > 0) return;

    let cancelled = false;
    setIsLoadingDraftRecommendations(true);
    setDraftRecommendationError("");

    const loadRecommendations = async () => {
      try {
        const payload = await getDraftRecommendations(activeMatter.id);
        if (cancelled) return;
        setDraftRecommendations(payload.draftRecommendations || null);
        if (payload.result) {
          updateMatter(payload.result);
        }
      } catch (error) {
        if (!cancelled) {
          setDraftRecommendationError(
            error instanceof Error
              ? error.message
              : "Could not load draft recommendations.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDraftRecommendations(false);
        }
      }
    };

    void loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [
    activeMatter?.id,
    canLoadDraftRecommendations,
    draftRecommendationItems.length,
    updateMatter,
  ]);

  useEffect(() => {
    if (!activeMatter) {
      setObligationMapStatus("idle");
      setObligationMapError("");
      setObligationMapResult(null);
      setSectionRiskStatusById({});
      setSectionRiskErrorById({});
      setQuickAnalysisStatus("idle");
      setQuickAnalysisProgress({ done: 0, total: 0 });
      return;
    }

    const cached = getObligationMap(activeMatter.id);
    if (
      cached &&
      cached.version_fingerprint === activeMatter.versionFingerprint
    ) {
      setObligationMapResult(cached);
      setObligationMapStatus("ready");
      setObligationMapError("");
      return;
    }

    if (cached) {
      clearObligationMap(activeMatter.id);
    }
    setObligationMapResult(null);
    setObligationMapStatus("idle");
    setObligationMapError("");
    setSectionRiskStatusById({});
    setSectionRiskErrorById({});
    setQuickAnalysisStatus("idle");
    setQuickAnalysisProgress({ done: 0, total: 0 });
    clearSectionRiskMaps(activeMatter.id);
  }, [activeMatter?.id, activeMatter?.versionFingerprint]);

  useEffect(() => {
    setRepresentedParty("service_provider");
    setSelectedRedlinePositionByClause({});
    setRedlineSuggestionByKey({});
    setRedlineLoadingByKey({});
    setRedlineErrorByKey({});
    setRedlineTitleDraftByKey({});
    setRedlineTextDraftByKey({});
    setIsClauseJumpPanelVisible(false);
  }, [activeMatter?.id]);

  const fetchObligationMap = async () => {
    if (!activeMatter) return;
    if (!obligationClauseSources.length) {
      setObligationMapStatus("error");
      setObligationMapError("No clause summaries are available for mapping.");
      return;
    }

    setObligationMapStatus("loading");
    setObligationMapError("");

    try {
      const response = await fetch(
        buildApiUrl("/api/matters/obligations/map"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matter_id: activeMatter.id,
            version_fingerprint: activeMatter.versionFingerprint,
            clauses: obligationClauseSources.map((source) => ({
              clause_id: source.clause_id,
              heading: source.heading,
              display_text: source.display_text,
              section_id: source.section_id,
              section_label: source.section_label,
              page_start: source.page_start,
              page_end: source.page_end,
              source_page: source.source_page,
              source_block_id: source.source_block_id,
            })),
          }),
        },
      );

      const payload = (await response.json()) as
        | ({ success: true } & ObligationMapResult)
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        const error =
          "error" in payload
            ? payload.error
            : "Obligation mapping request failed.";
        throw new Error(error || "Obligation mapping request failed.");
      }

      const mapped: ObligationMapResult = {
        matter_id: payload.matter_id,
        version_fingerprint: payload.version_fingerprint,
        counts: payload.counts,
        imbalance: payload.imbalance,
        obligations: payload.obligations,
        generated_at: payload.generated_at,
      };

      setObligationMap(activeMatter.id, mapped);
      setObligationMapResult(mapped);
      setObligationMapStatus("ready");
    } catch (error) {
      setObligationMapStatus("error");
      setObligationMapError(
        error instanceof Error
          ? error.message
          : "Obligation mapping failed. Please retry.",
      );
    }
  };

  useEffect(() => {
    if (!isObligationPanelOpen) return;
    if (obligationMapStatus !== "idle") {
      return;
    }
    void fetchObligationMap();
  }, [isObligationPanelOpen, obligationMapStatus, activeMatter?.id]);

  const fetchSectionRiskMap = async (section: ClauseSection) => {
    if (!activeMatter) return;
    if (section.extraction_status !== "ready" || !section.clauses.length)
      return;

    const cached = getSectionRiskMap(activeMatter.id, section.section_id);
    if (
      cached &&
      cached.version_fingerprint === activeMatter.versionFingerprint
    ) {
      setSectionRiskStatusById((prev) => ({
        ...prev,
        [section.section_id]: "ready",
      }));
      return;
    }

    setSectionRiskStatusById((prev) => ({
      ...prev,
      [section.section_id]: "loading",
    }));
    setSectionRiskErrorById((prev) => ({
      ...prev,
      [section.section_id]: "",
    }));

    try {
      const response = await fetch(
        buildApiUrl("/api/matters/sections/risk-map"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matter_id: activeMatter.id,
            version_fingerprint: activeMatter.versionFingerprint,
            section_id: section.section_id,
            section_label: section.section_label,
            clauses: section.clauses.map((clause) => ({
              clause_id: clause.clause_id,
              heading: clause.heading,
              display_text: clause.display_text,
            })),
          }),
        },
      );

      const payload = (await response.json()) as
        | ({ success: true } & SectionRiskMapResult)
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        const error =
          "error" in payload
            ? payload.error
            : "Clause risk classification failed.";
        throw new Error(error || "Clause risk classification failed.");
      }

      const mapped: SectionRiskMapResult = {
        matter_id: payload.matter_id,
        version_fingerprint: payload.version_fingerprint,
        section_id: payload.section_id,
        section_label: payload.section_label,
        section_flag: payload.section_flag,
        counts: payload.counts,
        items: payload.items,
        generated_at: payload.generated_at,
      };

      setSectionRiskMap(activeMatter.id, section.section_id, mapped);
      setSectionRiskStatusById((prev) => ({
        ...prev,
        [section.section_id]: "ready",
      }));
      return true;
    } catch (error) {
      setSectionRiskStatusById((prev) => ({
        ...prev,
        [section.section_id]: "error",
      }));
      setSectionRiskErrorById((prev) => ({
        ...prev,
        [section.section_id]:
          error instanceof Error
            ? error.message
            : "Clause risk classification failed.",
      }));
      return false;
    }
  };

  const runQuickRiskAnalysis = async () => {
    if (!activeMatter) return;
    const sections = clauseSections.filter(
      (section) =>
        section.extraction_status === "ready" && section.clauses.length,
    );
    if (!sections.length) return;

    setQuickAnalysisStatus("running");
    setQuickAnalysisProgress({ done: 0, total: sections.length });

    let failures = 0;
    for (let index = 0; index < sections.length; index += 1) {
      const ok = await fetchSectionRiskMap(sections[index]);
      if (!ok) failures += 1;
      setQuickAnalysisProgress({ done: index + 1, total: sections.length });
    }

    setQuickAnalysisStatus(failures ? "error" : "done");
  };

  const resetPersonForm = () => {
    setPersonName("");
    setPersonRole("");
    setPersonDescription("");
  };

  const resetUploadPopupState = () => {
    setUploadQuery("");
    setPendingUploadFiles([]);
    setUploadValidations([]);
    setUploadPopupError("");
  };

  useEffect(() => {
    saveMockModeEnabled(isMockModeEnabled);
  }, [isMockModeEnabled]);

  useEffect(() => {
    setMatterSearchResults([]);
    setMatterSearchError("");
    setMatterSearchInfo("");
  }, [activeMatter?.id]);

  useEffect(() => {
    if (activeMatter?.id && !isMockMatterId(activeMatter.id)) {
      lastRealMatterIdRef.current = activeMatter.id;
    }
  }, [activeMatter?.id]);

  useEffect(() => {
    if (isMockModeEnabled) {
      const existingMockMatter = matters.find((matter) =>
        isMockMatterId(matter.id),
      );
      if (existingMockMatter) {
        if (activeMatter?.id !== existingMockMatter.id) {
          setActiveMatterId(existingMockMatter.id);
        }
        return;
      }

      const scenario = createMockMatterScenario({
        query:
          activeMatter?.user_message ||
          "Benchmark the Mehra Exports v. CloudServ matter and surface the model's ideal output.",
        fileNames: Array.isArray(activeMatter?.documents)
          ? activeMatter.documents.map((entry) => entry.file_name)
          : undefined,
      });
      addMatter(scenario.initialResult);
      persistMockMatter(scenario.initialResult);
      return;
    }

    if (activeMatter?.id && isMockMatterId(activeMatter.id)) {
      const fallbackRealMatterId =
        (lastRealMatterIdRef.current &&
        matters.some((matter) => matter.id === lastRealMatterIdRef.current)
          ? lastRealMatterIdRef.current
          : null) ||
        matters.find((matter) => !isMockMatterId(matter.id))?.id ||
        null;

      setActiveMatterId(fallbackRealMatterId);
    }
  }, [
    activeMatter?.documents,
    activeMatter?.id,
    activeMatter?.user_message,
    addMatter,
    isMockModeEnabled,
    matters,
    setActiveMatterId,
  ]);

  const clearMockPipelineTimeouts = (matterId?: string) => {
    mockPipelineTimeoutsRef.current = mockPipelineTimeoutsRef.current.filter(
      (entry) => {
        const shouldClear = !matterId || entry.matterId === matterId;
        if (shouldClear) {
          window.clearTimeout(entry.timeoutId);
        }
        return !shouldClear;
      },
    );
  };

  useEffect(
    () => () => {
      clearMockPipelineTimeouts();
    },
    [],
  );

  const persistMockMatter = (result: MatterProcessedResult) => {
    if (!isMockMatterId(result?.matter?.id)) return;
    upsertMockMatterResult(result);
  };

  const applyMockMatterResult = (result: MatterProcessedResult) => {
    updateMatter(result);
    persistMockMatter(result);
  };

  const scheduleMockMatterPipeline = (
    scenario: ReturnType<typeof createMockMatterScenario>,
  ) => {
    clearMockPipelineTimeouts(scenario.acceptedResult.matter.id);
    scenario.stageResults.forEach((stage) => {
      const timeoutId = window.setTimeout(() => {
        applyMockMatterResult(stage.result);
      }, stage.delayMs);
      mockPipelineTimeoutsRef.current.push({
        matterId: scenario.acceptedResult.matter.id,
        timeoutId,
      });
    });
  };

  const openUploadPopup = (mode: UploadPopupMode) => {
    if (mode === "append" && !activeMatter) return;
    setUploadPopupMode(mode);
    resetUploadPopupState();
    setIsUploadPopupOpen(true);
  };

  const closeUploadPopup = (force = false) => {
    if (
      !force &&
      (isUploadingMatter || isAppendingMatterFiles || isValidatingUploadFiles)
    ) {
      return;
    }
    setIsUploadPopupOpen(false);
    setUploadPopupMode("create");
    resetUploadPopupState();
  };

  const updateMatterUploadLoaderStage = (stage?: string, progress?: number) => {
    if (!stage && typeof progress !== "number") return;

    setMatterUploadLoaderState((current) => {
      const nextStage = stage || current.stage;
      const nextHistory =
        nextStage && current.history[current.history.length - 1] !== nextStage
          ? [...current.history, nextStage]
          : current.history;

      return {
        stage: nextStage,
        progress: typeof progress === "number" ? progress : current.progress,
        history: nextHistory,
      };
    });
  };

  const updateAppendLoaderStage = (stage?: string, progress?: number) => {
    if (!stage && typeof progress !== "number") return;

    setMatterAppendLoaderState((current) => {
      const nextStage = stage || current.stage;
      const nextHistory =
        nextStage && current.history[current.history.length - 1] !== nextStage
          ? [...current.history, nextStage]
          : current.history;

      return {
        stage: nextStage,
        progress: typeof progress === "number" ? progress : current.progress,
        history: nextHistory,
      };
    });
  };

  const refreshStoredMatters = async () => {
    const response = await fetch(buildApiUrl("/api/matters"));
    const payload = (await response.json()) as {
      success?: boolean;
      matters?: MatterProcessedResult[];
    };
    if (response.ok && payload?.success && Array.isArray(payload.matters)) {
      setMattersFromServer(payload.matters);
    }
  };

  useEffect(() => {
    const shouldOpenUploader = sessionStorage.getItem(
      MATTER_UPLOAD_SESSION_KEY,
    );
    if (shouldOpenUploader !== "1") return;
    sessionStorage.removeItem(MATTER_UPLOAD_SESSION_KEY);
    openUploadPopup("create");
  }, []);

  useEffect(() => {
    const handleOpenUploader = () => {
      sessionStorage.removeItem(MATTER_UPLOAD_SESSION_KEY);
      openUploadPopup("create");
    };

    window.addEventListener("matter-uploader:open", handleOpenUploader);
    return () => {
      window.removeEventListener("matter-uploader:open", handleOpenUploader);
    };
  }, [
    activeMatter?.id,
    isUploadingMatter,
    isAppendingMatterFiles,
    isValidatingUploadFiles,
  ]);

  const mergePendingFiles = (current: File[], next: File[]) => {
    const merged = [...current];
    next.forEach((file) => {
      const alreadyExists = merged.some(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified,
      );
      if (!alreadyExists) merged.push(file);
    });
    return merged;
  };

  const validateSelectedFiles = async (files: File[], leadingError = "") => {
    if (!files.length) {
      setUploadValidations([]);
      setUploadPopupError(leadingError);
      return;
    }

    setIsValidatingUploadFiles(true);
    setUploadPopupError(leadingError);
    setIngestingFileName(
      files.length === 1 ? files[0].name : `${files.length} files selected`,
    );
    updateMatterUploadLoaderStage("Running file detection checks", 12);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("matter", file);
      });

      const response = await fetch(buildApiUrl("/api/matters/validate"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as MatterValidationApiResponse;
      if (!response.ok || !payload?.success || !Array.isArray(payload.files)) {
        throw new Error(payload?.error || "File validation failed.");
      }

      const validations: UploadPopupValidationItem[] = payload.files.map(
        (item) => ({
          fileName: item.file_name,
          accepted: Boolean(item.accepted),
          error: item.error,
          sizeBytes: item.validation?.size_bytes,
          estimatedPages: item.validation?.parse?.estimated_pages ?? null,
          pageCount: item.validation?.parse?.page_count ?? null,
          detectedMime: item.validation?.detected_mime,
          hasExecutableSignals: Boolean(
            item.validation?.executable_detection?.has_executable_signals,
          ),
        }),
      );

      setUploadValidations(validations);
      const rejected = validations.filter((item) => !item.accepted);
      if (rejected.length) {
        setUploadPopupError(
          [
            leadingError,
            rejected
              .map(
                (item) =>
                  `${item.fileName}: ${item.error || "Validation failed."}`,
              )
              .join(" "),
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    } catch (error) {
      setUploadValidations([]);
      setUploadPopupError(
        [
          leadingError,
          error instanceof Error ? error.message : "File validation failed.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } finally {
      setIsValidatingUploadFiles(false);
      setIngestingFileName("");
    }
  };

  const handlePopupFilesSelected = (files: File[]) => {
    const localErrors: string[] = [];
    const oversizedFiles = files.filter(
      (file) => file.size > MATTER_UPLOAD_MAX_FILE_BYTES,
    );
    if (oversizedFiles.length) {
      localErrors.push(
        oversizedFiles
          .map(
            (file) =>
              `${file.name} exceeds the 10MB per-file limit for this upload.`,
          )
          .join(" "),
      );
    }

    const candidateFiles = files.filter(
      (file) => file.size <= MATTER_UPLOAD_MAX_FILE_BYTES,
    );
    const merged = mergePendingFiles(pendingUploadFiles, candidateFiles);
    const limited = merged.slice(0, popupFileLimit);

    if (merged.length > popupFileLimit) {
      localErrors.push(
        uploadPopupMode === "append"
          ? `You can add ${popupFileLimit} more file${popupFileLimit === 1 ? "" : "s"} to this matter.`
          : `You can upload up to ${MATTER_UPLOAD_MAX_FILES} files at a time.`,
      );
    }

    setPendingUploadFiles(limited);
    const localErrorMessage = localErrors.join(" ").trim();
    setUploadPopupError(localErrorMessage);
    void validateSelectedFiles(limited, localErrorMessage);
  };

  const handleRemovePendingUploadFile = (fileName: string) => {
    const nextFiles = pendingUploadFiles.filter(
      (file) => file.name !== fileName,
    );
    setPendingUploadFiles(nextFiles);
    setUploadPopupError("");
    void validateSelectedFiles(nextFiles);
  };

  const pollMatterJob = async (
    jobId: string,
    onProgress: (stage?: string, progress?: number) => void,
  ) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(1500);
      const response = await fetch(
        buildApiUrl(`/api/matters/jobs/${encodeURIComponent(jobId)}`),
      );
      const payload = (await response.json()) as {
        success?: boolean;
        status?: "processing" | "processed" | "failed";
        stage?: string;
        progress?: number;
        result?: MatterProcessedResult | null;
        error?: string | null;
      };

      onProgress(payload.stage, payload.progress);

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error || "Matter ingestion status check failed.",
        );
      }

      if (payload.status === "failed") {
        throw new Error(payload.error || "Matter ingestion failed.");
      }

      if (payload.status === "processed" && payload.result) {
        return payload.result;
      }
    }

    throw new MatterPollingTimeoutError(jobId);
  };

  const handleMatterChatSubmit = async (
    query: string,
    mode: SearchBarMode,
  ) => {
    if (!activeMatter?.id || isActiveMockMatter) {
      setMatterChatError(
        "Matter chat is only available for real uploaded matters.",
      );
      setIsMatterChatOpen(true);
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const nextUserMessage: MatterChatMessage = {
      id: createMatterChatMessageId(),
      role: "user",
      text: trimmedQuery,
    };
    const priorMessages = [...matterChatMessages];

    setMatterChatMode(mode);
    setMatterChatError("");
    setIsMatterChatOpen(true);
    setIsMatterChatSubmitting(true);
    setMatterChatMessages((prev) => [...prev, nextUserMessage]);

    try {
      const response = await fetch(
        buildApiUrl(`/api/matters/${encodeURIComponent(activeMatter.id)}/chat`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: trimmedQuery,
            depth: mode,
            history: priorMessages.map((message) => ({
              role: message.role,
              content: message.text,
            })),
          }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        answer?: string;
        sources?: ChatSource[];
        error?: string;
      };

      if (!response.ok || !payload?.success || !payload.answer) {
        throw new Error(payload?.error || "Matter chat failed.");
      }

      setMatterChatMessages((prev) => [
        ...prev,
        {
          id: createMatterChatMessageId(),
          role: "assistant",
          text: payload.answer || "",
          sources: Array.isArray(payload.sources) ? payload.sources : [],
        },
      ]);
    } catch (error) {
      setMatterChatError(
        error instanceof Error ? error.message : "Matter chat failed.",
      );
    } finally {
      setIsMatterChatSubmitting(false);
    }
  };

  const handleAddPerson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMatter || !personName.trim()) return;

    addPersonToMatter(activeMatter.id, {
      name: personName.trim(),
      role: personRole.trim() || "Party",
      description: personDescription.trim() || "Added manually",
    });
    resetPersonForm();
    setIsPeopleDialogOpen(false);
  };

  const handleDeleteMatter = async () => {
    if (!activeMatter || deleteConfirmText !== "DELETE" || isDeletingMatter)
      return;
    setIsDeletingMatter(true);
    try {
      if (isMockMatterId(activeMatter.id)) {
        clearMockPipelineTimeouts(activeMatter.id);
        deleteMockMatterResult(activeMatter.id);
        deleteMatter(activeMatter.id);
        setIsDeleteDialogOpen(false);
        setDeleteConfirmText("");
        navigate("/dashboard");
        return;
      }
      const response = await fetch(
        buildApiUrl(`/api/matters/${encodeURIComponent(activeMatter.id)}`),
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to delete matter.");
      }
      deleteMatter(activeMatter.id);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmText("");
      navigate("/dashboard");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Failed to delete matter.",
      );
    } finally {
      setIsDeletingMatter(false);
    }
  };

  const submitNewMatterUpload = async () => {
    if (
      (!pendingUploadFiles.length && !isMockModeEnabled) ||
      isUploadingMatter ||
      isValidatingUploadFiles
    ) {
      return;
    }
    if (!uploadQuery.trim()) {
      setUploadPopupError(
        "Please add your question/comment/message before uploading the matter.",
      );
      return;
    }
    const filesToUpload = [...pendingUploadFiles];
    const queryToUpload = uploadQuery.trim();
    setIsUploadPopupOpen(false);

    setIsUploadingMatter(true);
    setIngestingFileName(
      filesToUpload.length === 1
        ? filesToUpload[0].name
        : filesToUpload.length
          ? `${filesToUpload.length} files selected`
          : "Mock matter benchmark",
    );
    updateMatterUploadLoaderStage("Uploading files to backend", 10);

    try {
      if (isMockModeEnabled) {
        updateMatterUploadLoaderStage("Loading mock answer key", 18);
        await sleep(550);
        updateMatterUploadLoaderStage("Synthesizing matter classification", 44);
        await sleep(700);
        updateMatterUploadLoaderStage("Generating structured agent brief", 76);
        await sleep(900);
        const scenario = createMockMatterScenario({
          query: queryToUpload,
          fileNames: filesToUpload.map((file) => file.name),
        });
        updateMatterUploadLoaderStage("Publishing mock matter workspace", 100);
        addMatter(scenario.initialResult);
        persistMockMatter(scenario.initialResult);
        closeUploadPopup(true);
        navigate("/matter");
        return;
      }

      const formData = new FormData();
      filesToUpload.forEach((file) => {
        formData.append("matter", file);
      });
      formData.append("matter_query", queryToUpload);
      formData.append(
        "pass_through_contextcore",
        "true",
      );

      const response = await fetch(buildApiUrl("/api/matters/upload"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | {
            success?: boolean;
            existing?: true;
            result?: MatterProcessedResult;
            error?: string;
          }
        | {
            success?: boolean;
            job_id?: string;
            stage?: string;
            progress?: number;
            error?: string;
          };

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Matter upload did not start.");
      }

      let result: MatterProcessedResult;
      if ("existing" in payload && payload.existing && payload.result) {
        updateMatterUploadLoaderStage(
          "Loaded existing matter from storage",
          100,
        );
        result = payload.result;
      } else if ("job_id" in payload && payload.job_id) {
        updateMatterUploadLoaderStage(payload.stage, payload.progress);
        result = await pollMatterJob(
          payload.job_id,
          updateMatterUploadLoaderStage,
        );
      } else {
        throw new Error("Matter upload response was invalid.");
      }

      addMatter(result);
      persistMockMatter(result);
      closeUploadPopup(true);
      navigate("/matter");
    } catch (error) {
      setIsUploadPopupOpen(true);
      if (error instanceof MatterPollingTimeoutError) {
        setUploadPopupError(error.message);
      } else {
        setUploadPopupError(
          error instanceof Error
            ? error.message
            : "Matter upload failed. Please try again.",
        );
      }
    } finally {
      setIsUploadingMatter(false);
      setIngestingFileName("");
    }
  };

  const handleAppendMatterFiles = async () => {
    if (
      !activeMatter ||
      !pendingUploadFiles.length ||
      isAppendingMatterFiles ||
      isValidatingUploadFiles
    ) {
      return;
    }
    if (!uploadQuery.trim()) {
      setUploadPopupError(
        "Please add your question/comment/message before uploading files.",
      );
      return;
    }
    const filesToUpload = [...pendingUploadFiles];
    const queryToUpload = uploadQuery.trim();
    setIsUploadPopupOpen(false);

    setIsAppendingMatterFiles(true);
    setAppendingFileName(
      filesToUpload.length === 1
        ? filesToUpload[0].name
        : `${filesToUpload.length} files selected`,
    );
    setMatterAppendLoaderState({
      stage: "Uploading additional files",
      progress: 8,
      history: ["Uploading additional files"],
    });

    try {
      const formData = new FormData();
      filesToUpload.forEach((file) => {
        formData.append("matter", file);
      });
      formData.append("matter_query", queryToUpload);
      formData.append(
        "pass_through_contextcore",
        "true",
      );

      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/files`,
        ),
        {
          method: "POST",
          body: formData,
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        job_id?: string;
        stage?: string;
        progress?: number;
        error?: string;
      };

      if (!response.ok || !payload?.success || !payload.job_id) {
        throw new Error(
          payload?.error || "Additional file upload did not start.",
        );
      }

      updateAppendLoaderStage(payload.stage, payload.progress);
      await refreshStoredMatters();
      const result = await pollMatterJob(
        payload.job_id,
        updateAppendLoaderStage,
      );
      updateMatter(result);
      closeUploadPopup(true);
    } catch (error) {
      setIsUploadPopupOpen(true);
      if (error instanceof MatterPollingTimeoutError) {
        await refreshStoredMatters().catch(() => {});
        setUploadPopupError(error.message);
      } else {
        setUploadPopupError(
          error instanceof Error
            ? error.message
            : "Failed to add files to this matter.",
        );
      }
    } finally {
      setIsAppendingMatterFiles(false);
      setAppendingFileName("");
    }
  };

  const handleSubmitBriefAnswers = async (answerOverride?: string) => {
    if (!activeMatter || isSubmittingBriefAnswers) return;
    if (isBriefIndexReadinessPending) {
      setBriefAnswerError(
        "Search is still warming up for this matter. Retry brief generation once ContextCore becomes searchable.",
      );
      return;
    }
    const answer = (answerOverride ?? briefAnswerText).trim();
    if (!answer) {
      setBriefAnswerError("Add the missing information before continuing.");
      return;
    }

    setIsSubmittingBriefAnswers(true);
    setBriefAnswerError("");
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/brief/answers`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            answers: [
              {
                question: briefQuestions.join("\n") || "Additional information",
                answer,
              },
            ],
          }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        result?: MatterProcessedResult;
        error?: string;
        accumulated_brief?: MatterProcessedResult["accumulated_brief"];
        accumulated_brief_readiness?: MatterProcessedResult["accumulated_brief_readiness"];
        accumulated_brief_meta?: MatterProcessedResult["accumulated_brief_meta"];
      };
      if (response.status === 410) {
        setBriefAnswerError(
          payload?.error ||
            "This clarification loop is no longer available. Use ContextCore continue/retry instead.",
        );
        return;
      }
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(payload?.error || "Brief continuation failed.");
      }
      updateMatter(payload.result);
      setBriefAnswerText("");
    } catch (error) {
      setBriefAnswerError(
        error instanceof Error
          ? error.message
          : "Failed to continue brief generation.",
      );
    } finally {
      setIsSubmittingBriefAnswers(false);
    }
  };

  const handleAcceptBrief = async () => {
    if (!activeMatter || isAcceptingBrief) return;
    setIsAcceptingBrief(true);
    setBriefAcceptError("");
    try {
      if (isMockMatterId(activeMatter.id)) {
        const scenario = createMockMatterScenario({
          query:
            uploadQuery.trim() ||
            activeMatter.user_message ||
            "Mock matter analysis",
          fileNames: Array.isArray(activeMatter.documents)
            ? activeMatter.documents.map((entry) => entry.file_name)
            : undefined,
        });
        const acceptedResult = {
          ...scenario.acceptedResult,
          matter: {
            ...scenario.acceptedResult.matter,
            id: activeMatter.id,
            job_id: activeMatter.job_id,
            uploaded_at: activeMatter.uploaded_at,
            uploadedAt: activeMatter.uploadedAt,
            user_message: activeMatter.user_message,
          },
        };
        applyMockMatterResult(acceptedResult);
        scheduleMockMatterPipeline({
          ...scenario,
          acceptedResult,
          stageResults: scenario.stageResults.map((stage) => ({
            ...stage,
            result: {
              ...stage.result,
              matter: {
                ...stage.result.matter,
                id: activeMatter.id,
                job_id: activeMatter.job_id,
                uploaded_at: activeMatter.uploaded_at,
                uploadedAt: activeMatter.uploadedAt,
                user_message: activeMatter.user_message,
              },
            },
          })),
        });
        return;
      }
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/brief/accept`,
        ),
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        result?: MatterProcessedResult;
        error?: string;
      };
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(payload?.error || "Failed to accept brief.");
      }
      updateMatter(payload.result);
    } catch (error) {
      setBriefAcceptError(
        error instanceof Error ? error.message : "Failed to accept brief.",
      );
    } finally {
      setIsAcceptingBrief(false);
    }
  };

  const handleConfirmSecondaryClassification = async () => {
    if (!activeMatter || isConfirmingSecondaryClassification) return;
    setIsConfirmingSecondaryClassification(true);
    setBriefAcceptError("");
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(
            activeMatter.id,
          )}/secondary/classification/confirm`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirmed_by: "user" }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        result?: MatterProcessedResult;
        error?: string;
      };
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(
          payload?.error || "Failed to confirm matter classification.",
        );
      }
      updateMatter(payload.result);
    } catch (error) {
      setBriefAcceptError(
        error instanceof Error
          ? error.message
          : "Failed to confirm matter classification.",
      );
    } finally {
      setIsConfirmingSecondaryClassification(false);
    }
  };

  const handleAddClassificationTag = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!activeMatter || isActiveMockMatter || isSavingClassificationTag) return;
    const tag = classificationTagInput.trim();
    if (!tag) return;

    setIsSavingClassificationTag(true);
    setBriefAcceptError("");
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/classification/tags`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tag }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        result?: MatterProcessedResult;
        error?: string;
      };
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(
          payload?.error || "Failed to save the classification tag.",
        );
      }
      updateMatter(payload.result);
      setClassificationTagInput("");
    } catch (error) {
      setBriefAcceptError(
        error instanceof Error
          ? error.message
          : "Failed to save the classification tag.",
      );
    } finally {
      setIsSavingClassificationTag(false);
    }
  };

  const handleRefreshDraftRecommendations = async () => {
    if (!activeMatter?.id || isActiveMockMatter || isLoadingDraftRecommendations) {
      return;
    }
    setIsLoadingDraftRecommendations(true);
    setDraftRecommendationError("");
    try {
      const payload = await refreshDraftRecommendations(activeMatter.id);
      setDraftRecommendations(payload.draftRecommendations || null);
      if (payload.result) {
        updateMatter(payload.result);
      }
    } catch (error) {
      setDraftRecommendationError(
        error instanceof Error
          ? error.message
          : "Could not refresh draft recommendations.",
      );
    } finally {
      setIsLoadingDraftRecommendations(false);
    }
  };

  const handleStartDraftRecommendation = async (
    recommendation: MatterDraftRecommendation,
  ) => {
    if (!activeMatter?.id || isActiveMockMatter || startingDraftKey) return;
    if (!recommendation.can_generate_now) return;

    setStartingDraftKey(recommendation.draft_key);
    setDraftRecommendationError("");
    try {
      const payload = await startDraftRecommendation({
        matterId: activeMatter.id,
        recommendation,
      });
      if (payload.draft_recommendations) {
        setDraftRecommendations(payload.draft_recommendations);
      }
      if (payload.result) {
        updateMatter(payload.result);
      }
      if (payload.draft?.id) {
        navigate(
          `/drafting?draft=${encodeURIComponent(payload.draft.id)}&matter=${encodeURIComponent(activeMatter.id)}&mode=edit`,
        );
      }
    } catch (error) {
      setDraftRecommendationError(
        error instanceof Error
          ? error.message
          : "Could not start the selected draft.",
      );
    } finally {
      setStartingDraftKey(null);
    }
  };

  const handleClauseSelect = (clause: ClauseItem) => {
    if (!activeMatter) return;
    setIsClauseJumpPanelVisible(false);
    setActiveClauseSelection({
      matterId: activeMatter.id,
      clauseId: clause.clause_id,
    });
  };

  const buildRedlineRequestKey = (
    clauseId: string,
    party: RepresentedParty,
    position: ClauseRedlinePosition,
  ) => `${clauseId}:${party}:${position}`;

  const requestClauseRedline = async (
    clause: ClauseItem,
    section: ClauseSection,
    position: ClauseRedlinePosition,
  ) => {
    if (!activeMatter) return;
    const requestKey = buildRedlineRequestKey(
      clause.clause_id,
      representedParty,
      position,
    );
    if (redlineLoadingByKey[requestKey]) return;
    if (redlineSuggestionByKey[requestKey]) return;

    const playbookExamples = acceptedRedlines
      .filter(
        (item) =>
          item.clauseType === section.section_type &&
          item.representedParty === representedParty,
      )
      .slice(0, 2)
      .map((item) => ({
        position: item.position,
        original_text: item.originalText,
        rewritten_text: item.rewrittenText,
      }));

    setRedlineLoadingByKey((prev) => ({ ...prev, [requestKey]: true }));
    setRedlineErrorByKey((prev) => ({ ...prev, [requestKey]: "" }));

    try {
      const response = await fetch(
        buildApiUrl("/api/matters/clauses/redline"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_clause_text: clause.display_text,
            clause_type: section.section_type,
            represented_party: representedParty,
            position,
            playbook_examples: playbookExamples,
          }),
        },
      );

      const payload = (await response.json()) as
        | { success: true; rewritten_text: string }
        | { success: false; error?: string };

      if (!response.ok || !payload.success) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : "Redline generation failed.";
        throw new Error(message);
      }

      setRedlineSuggestionByKey((prev) => ({
        ...prev,
        [requestKey]: {
          rewrittenText: payload.rewritten_text,
          generatedAt: new Date().toISOString(),
        },
      }));
    } catch (error) {
      setRedlineErrorByKey((prev) => ({
        ...prev,
        [requestKey]:
          error instanceof Error
            ? error.message
            : "Redline generation failed. Please retry.",
      }));
    } finally {
      setRedlineLoadingByKey((prev) => ({ ...prev, [requestKey]: false }));
    }
  };

  const handleRedlinePositionSelect = (
    clauseId: string,
    position: ClauseRedlinePosition,
  ) => {
    setSelectedRedlinePositionByClause((prev) => ({
      ...prev,
      [clauseId]: position,
    }));
  };

  const handleUseAiRedlining = async () => {
    if (!activeClause || !activeClauseSection) return;
    await requestClauseRedline(
      activeClause,
      activeClauseSection,
      activeRedlinePosition,
    );
  };

  const handleAcceptRedline = () => {
    if (
      !activeMatter ||
      !activeClause ||
      !activeClauseSection ||
      !activeSuggestion
    ) {
      return;
    }
    const resolvedTitle =
      (activeClauseKey && redlineTitleDraftByKey[activeClauseKey]?.trim()) ||
      `${activeClause.heading} (${activeRedlinePosition})`;
    const resolvedText =
      (activeClauseKey && redlineTextDraftByKey[activeClauseKey]?.trim()) ||
      activeSuggestion.rewrittenText;
    const payload: AcceptedRedline = {
      id: `redline_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      matterId: activeMatter.id,
      clauseId: activeClause.clause_id,
      title: resolvedTitle,
      clauseHeading: activeClause.heading,
      clauseType: activeClauseSection.section_type,
      sectionLabel: activeClauseSection.section_label,
      representedParty,
      position: activeRedlinePosition,
      originalText: activeClause.display_text,
      rewrittenText: resolvedText,
      acceptedAt: new Date().toISOString(),
    };

    void (async () => {
      try {
        const response = await fetch(
          buildApiUrl(
            `/api/matters/${encodeURIComponent(activeMatter.id)}/redlines/accepted`,
          ),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = (await response.json()) as {
          success?: boolean;
          redline?: AcceptedRedline;
          duplicate?: boolean;
        };
        if (!response.ok || !result?.success || !result.redline) {
          addAcceptedRedline(payload);
          return;
        }
        addAcceptedRedline(result.redline);
        if (result.duplicate) {
          window.alert("This redline is already added to the playbook.");
        }
      } catch {
        addAcceptedRedline(payload);
      }
    })();
  };

  const patchAcceptedRedlineRemote = async (
    redlineId: string,
    patch: Partial<Pick<AcceptedRedline, "title" | "rewrittenText">>,
  ) => {
    if (!activeMatter) return;
    try {
      await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/redlines/accepted/${encodeURIComponent(redlineId)}`,
        ),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
    } catch {
      // no-op: local state already updated
    }
  };

  const deleteAcceptedRedlineRemote = async (redlineId: string) => {
    if (!activeMatter) return;
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(activeMatter.id)}/redlines/accepted/${encodeURIComponent(redlineId)}`,
        ),
        {
          method: "DELETE",
        },
      );
      if (!response.ok) return;
      removeAcceptedRedline(activeMatter.id, redlineId);
    } catch {
      // no-op
    }
  };

  const handleJumpToClauseSection = () => {
    if (!activeClauseSection) return;
    const target = sectionRefs.current[activeClauseSection.section_id];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    setIsClauseJumpPanelVisible(false);
  };

  const handleJumpToBlankField = (hit: BlankFieldHit) => {
    const target = blockRefs.current[hit.blockId];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleJumpToClauseById = (clauseId: string) => {
    if (!activeMatter) return;
    const source = obligationClauseById.get(clauseId);
    if (!source) return;
    setIsPageAwareOpen(true);
    const sectionStateKey = `${activeMatter.id}:${source.section_id}`;
    setOpenClauseSections((prev) => ({ ...prev, [sectionStateKey]: true }));
    setActiveClauseSelection({
      matterId: activeMatter.id,
      clauseId,
    });
    const target = sectionRefs.current[source.section_id];
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleJumpToClausePage = (clauseId: string, openJumpPanel = false) => {
    const source = obligationClauseById.get(clauseId);
    if (!source) return;
    if (openJumpPanel) {
      setIsClauseJumpPanelVisible(true);
      setIsClauseJumpPanelCollapsed(false);
    }
    if (source.source_block_id) {
      const blockTarget = blockRefs.current[source.source_block_id];
      blockTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!source.source_page) return;
    const fallbackPage = pages.find(
      (page) => page.page_number === source.source_page,
    );
    const fallbackBlockId = fallbackPage?.blocks[0]?.block_id;
    if (!fallbackBlockId) return;
    const blockTarget = blockRefs.current[fallbackBlockId];
    blockTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const obligationColumns = useMemo(() => {
    if (!obligationMapResult) {
      return {
        ippb: [] as ObligationMapResult["obligations"],
        serviceProvider: [] as ObligationMapResult["obligations"],
      };
    }

    const ippb = obligationMapResult.obligations.filter(
      (item) => item.party === "ippb" || item.party === "mutual",
    );
    const serviceProvider = obligationMapResult.obligations.filter(
      (item) => item.party === "service_provider" || item.party === "mutual",
    );

    return { ippb, serviceProvider };
  }, [obligationMapResult]);
  const obligationLoaderSteps = useMemo(() => {
    if (!obligationClauseSources.length)
      return ["Preparing obligations mapper"];
    return [
      `Reading ${obligationClauseSources.length} clause summaries`,
      "Classifying obligation ownership",
      "Balancing IPPB and Service Provider obligations",
      "Publishing mapper results",
    ];
  }, [obligationClauseSources.length]);
  const activeDraftTitle =
    (activeClauseKey && redlineTitleDraftByKey[activeClauseKey]) ||
    (activeClause
      ? `${activeClause.heading} (${activeRedlinePosition})`
      : "Clause redline");
  const activeDraftText =
    (activeClauseKey && redlineTextDraftByKey[activeClauseKey]) ||
    activeSuggestion?.rewrittenText ||
    "";

  void isPageAwareOpen;
  void openClauseSections;
  void totalBlockCount;
  void highlightMap;
  void blankFieldMap;
  void sectionRiskStatusById;
  void sectionRiskErrorById;
  void quickAnalysisStatus;
  void quickAnalysisProgress;
  void pageAwareRiskSummary;
  void blockWarningLevel;
  void activeRedlineError;
  void activeRedlineLoading;
  void activeAcceptedCount;
  void activeDiff;
  void runQuickRiskAnalysis;
  void handleClauseSelect;
  void handleRedlinePositionSelect;
  void handleUseAiRedlining;
  void handleAcceptRedline;
  void activeDraftTitle;
  void activeDraftText;

  return (
    <section className="matterOverviewWrap">
      <UploadPopUp
        open={isUploadPopupOpen}
        title={
          uploadPopupMode === "append"
            ? "Add files to this matter"
            : "Upload matter files"
        }
        description={
          uploadPopupMode === "append"
            ? "Add more source files to this matter. We will verify them first, then ingest them into the same matter context."
            : "Upload up to five source files and add any context you want to carry with the matter."
        }
        queryValue={uploadQuery}
        onQueryChange={setUploadQuery}
        selectedFiles={pendingUploadFiles}
        validations={uploadValidations}
        maxFiles={popupFileLimit}
        sizeLimitLabel="10 MB"
        maxPages={MATTER_UPLOAD_MAX_PAGES}
        isValidating={isValidatingUploadFiles}
        isSubmitting={isUploadingMatter || isAppendingMatterFiles}
        errorMessage={uploadPopupError}
        submitLabel={
          uploadPopupMode === "append" ? "Upload files" : "Upload matter"
        }
        allowEmptyFiles={isMockModeEnabled && uploadPopupMode === "create"}
        showContextCoreOption={false}
        onFilesSelected={handlePopupFilesSelected}
        onRemoveFile={handleRemovePendingUploadFile}
        onCancel={() => closeUploadPopup()}
        onSubmit={() => {
          if (uploadPopupMode === "append") {
            void handleAppendMatterFiles();
            return;
          }
          void submitNewMatterUpload();
        }}
      />

      {isDeletingMatter && (
        <Loader
          variant="spinner"
          eyebrow="Deleting Matter"
          title="Removing Matter"
          message="Deleting matter records, linked drafts, and stored files."
          mode="overlay"
        />
      )}

      {isUploadingMatter && (
        <Loader
          fileName={ingestingFileName}
          eyebrow="Matter Upload"
          title="Creating Matter Workspace"
          message="Preparing your matter workspace with live ingestion status."
          stage={matterUploadLoaderState.stage}
          progress={matterUploadLoaderState.progress}
          steps={matterUploadLoaderState.history}
          mode="overlay"
        />
      )}

      {isAppendingMatterFiles && (
        <Loader
          fileName={appendingFileName}
          eyebrow="Matter Update"
          title="Adding Files To Matter"
          message="Ingesting the additional files and updating matter transcription."
          stage={matterAppendLoaderState.stage}
          progress={matterAppendLoaderState.progress}
          steps={matterAppendLoaderState.history}
          mode="overlay"
        />
      )}

      {isValidatingUploadFiles && (
        <Loader
          fileName={ingestingFileName || appendingFileName}
          eyebrow="File Verification"
          title="Checking Uploaded Files"
          message="Running file-type detection, size checks, and page limits before upload."
          stage="Running file detection checks"
          progress={18}
          steps={[
            "Inspecting uploaded files",
            "Checking size and page limits",
            "Detecting executable signals",
          ]}
          mode="overlay"
        />
      )}

      <header className="matterOverviewHead">
        <p className="matterEyebrow">Matter Overview</p>
        <div className="matterOverviewTitleRow">
          <h1>{matterHeading}</h1>
          <div className="matterOverviewActionRow">
            <Button
              type="button"
              className={`matterMockModeBtn ${isMockModeEnabled ? "isActive" : ""}`}
              onClick={() => setIsMockModeEnabled((current) => !current)}
            >
              Mock mode {isMockModeEnabled ? "on" : "off"}
            </Button>
            <Button
              type="button"
              className="matterAddFilesBtn"
              disabled={isAddFilesDisabled}
              onClick={() =>
                openUploadPopup(activeMatter ? "append" : "create")
              }
              text={activeMatter ? "Add files" : "Upload matter"}
              showImage
              image={<Plus size={17} />}
            />
            <Button
              type="button"
              className="matterDeleteBtn"
              disabled={!activeMatter}
              onClick={() => {
                setDeleteConfirmText("");
                setIsDeleteDialogOpen(true);
              }}
            >
              Delete matter
            </Button>
            <Button
              type="button"
              className="matterStartDraftingBtn"
              disabled={!activeMatter}
              onClick={() =>
                activeMatter &&
                navigate(
                  `/drafting?matter=${encodeURIComponent(activeMatter.id)}`,
                )
              }
              text="Start drafting"
              showImage
              image={<FilePenLine size={17} />}
            />
          </div>
        </div>
        <p className="matterSubhead">
          Focused view for quick orientation, working notes, and clause-aware
          document review.
        </p>

        <section className="matterPeopleSection">
          <div className="matterPeopleHead">
            <h2>People</h2>
            <div className="matterPeopleActions">
              <Button
                type="button"
                className="matterPeopleFetchBtn"
                disabled={
                  !activeMatter ||
                  isActiveMockMatter ||
                  isExtractingPeople ||
                  activeMatterContextCore?.status !== "ready"
                }
                onClick={() =>
                  activeMatter &&
                  void runPeopleExtraction(activeMatter.id, {
                    markAttempted: true,
                  })
                }
                text={isExtractingPeople ? "Fetching..." : "Fetch from ContextCore"}
                showImage
                image={<Search size={16} />}
              />
              <Button
                type="button"
                className="matterPeopleAddBtn"
                disabled={!activeMatter}
                onClick={() => setIsPeopleDialogOpen(true)}
                aria-label="Add a person to this matter"
                showImage
                image={<Plus size={18} />}
              />
            </div>
          </div>

          {isExtractingPeople ? (
            <p className="matterPeopleInfo">Identifying parties and counsel...</p>
          ) : peopleExtractionMessage ? (
            <p className="matterPeopleInfo">{peopleExtractionMessage}</p>
          ) : null}

          {people.length ? (
            <div className="matterPeopleGrid">
              {people.map((person) => (
                <article className="matterPersonCard" key={person.id}>
                  <Button
                    type="button"
                    className="matterPersonRemoveBtn"
                    aria-label={`Remove ${person.name}`}
                    onClick={() =>
                      activeMatter &&
                      removePersonFromMatter(activeMatter.id, person.id)
                    }
                    showImage
                    image={<X size={14} />}
                  />
                  <span className="matterPersonAvatar">{person.initials}</span>
                  <div>
                    <h3>{person.name}</h3>
                    <strong>{person.role}</strong>
                    <p>{person.description}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Button
              type="button"
              className="matterPeopleEmptyAdd"
              disabled={!activeMatter}
              onClick={() => setIsPeopleDialogOpen(true)}
              text="Add relevant people manually"
              showImage
              image={<Plus size={22} />}
            />
          )}
        </section>

        <div className="matterMetaGrid">
          <article className="matterMetaCard">
            <span className="matterMetaIcon">
              <FolderOpen size={16} />
            </span>
            <div>
              <h3>File name</h3>
              <p>{activeMatter?.fileName || "Upload a file to start."}</p>
            </div>
          </article>
          <article className="matterMetaCard">
            <span className="matterMetaIcon">
              <CalendarClock size={16} />
            </span>
            <div>
              <h3>Uploaded</h3>
              <p>
                {activeMatter?.uploadedAt
                  ? formatUploadedAt(activeMatter.uploadedAt)
                  : "Not available"}
              </p>
            </div>
          </article>
        </div>

        {activeMatter ? (
          <>
            <article className="matterBriefLoopPanel">
              <div className="matterBriefLoopHead">
                <p className="matterEyebrow">
                  Agent Brief ·{" "}
                  {activeMatter.intelligence_statuses?.brief_generation ===
                  "ready"
                    ? "Generated"
                    : activeMatter.intelligence_statuses?.brief_generation ===
                        "query_required"
                      ? "Needs Input"
                      : "Pending"}{" "}
                  · {uploadedDocumentCount} file
                  {uploadedDocumentCount === 1 ? "" : "s"}
                </p>
                <span
                  className={`matterBriefStatus is-${activeMatter.intelligence_statuses?.brief_generation || "not_started"}`}
                >
                  {activeMatter.intelligence_statuses?.brief_generation ||
                    "not started"}
                </span>
              </div>

              {activeMatter.intelligence_statuses?.brief_generation ===
                "not_started" &&
              activeMatterContextCore?.status === "ready" ? (
                <div className="matterBriefQuestionBox">
                  <p>
                    Context extraction is complete. Continue to generate the
                    grounded matter brief and extract people from the indexed
                    documents.
                  </p>
                  {briefAnswerError ? (
                    <p className="matterBriefError">{briefAnswerError}</p>
                  ) : null}
                  <div className="matterBriefActions">
                    <Button
                      type="button"
                      disabled={isContinuingContextCore}
                      onClick={() => void handleContinueContextCore()}
                    >
                      {isContinuingContextCore ? "Continuing..." : "Continue"}
                    </Button>
                  </div>
                </div>
              ) : isBriefIndexReadinessPending ? (
                <div className="matterBriefQuestionBox">
                  <p>
                    ContextCore finished indexing the matter files, but search
                    is not returning results yet. Brief generation cannot
                    proceed until retrieval is ready.
                  </p>
                  {briefDisplayPayload?.warning ? (
                    <p className="matterBriefError">
                      {briefDisplayPayload.warning}
                    </p>
                  ) : null}
                  {briefAnswerError ? (
                    <p className="matterBriefError">{briefAnswerError}</p>
                  ) : null}
                  <div className="matterBriefActions">
                    <Button
                      type="button"
                      disabled={isContinuingContextCore}
                      onClick={() => void handleContinueContextCore()}
                    >
                      {isContinuingContextCore
                        ? "Retrying..."
                        : "Retry brief generation"}
                    </Button>
                  </div>
                </div>
              ) : isBriefQueryRequired ? (
                <div className="matterBriefQuestionBox">
                  <p>
                    The agent does not yet have enough grounded information to
                    generate the matter brief. Answer the questions below to
                    continue the loop.
                  </p>
                  {briefQuestions.length ? (
                    <ul>
                      {briefQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  ) : null}
                  {briefAnswerError ? (
                    <p className="matterBriefError">{briefAnswerError}</p>
                  ) : null}
                  <div className="matterBriefActions">
                    <Button
                      type="button"
                      disabled={isSubmittingBriefAnswers}
                      onClick={() => setIsMatterChatOpen(true)}
                    >
                      Answer in matter chat
                    </Button>
                  </div>
                </div>
              ) : briefDisplayPayload?.decision === "generate_brief" ? (
                <>
                  {briefPoints.length ? (
                    <div className="matterBriefPoints">
                      {briefPoints.map((point) => (
                        <article className="matterBriefPoint" key={point.id}>
                          <div
                            className={`matterBriefPointHeading tone-${point.tone || "neutral"}`}
                          >
                            <span className="matterBriefPointHeadingText">
                              {point.heading}
                            </span>
                            <span className="matterBriefPointHeadingMeta">
                              <span className="matterBriefPointHeadingMetaItem">
                                <span className="matterBriefPointHeadingMetaLabel">
                                  Source file:
                                </span>
                                {getBriefPointSourceNames(point).length ? (
                                  <span className="matterSourceFileList">
                                    {getBriefPointSourceNames(point).map(
                                      (sourceName) => {
                                        const sourceRef = point.sourceRefs.find(
                                          (ref) => ref.fileName === sourceName,
                                        );
                                        const pageLabel =
                                          sourceRef?.pageStart &&
                                          Number.isFinite(sourceRef.pageStart)
                                            ? ` p.${sourceRef.pageStart}${
                                                sourceRef.pageEnd &&
                                                sourceRef.pageEnd !==
                                                  sourceRef.pageStart
                                                  ? `-${sourceRef.pageEnd}`
                                                  : ""
                                              }`
                                            : "";
                                        return (
                                          <Button
                                            type="button"
                                            className="matterSourceFileButton"
                                            key={`${point.id}-${sourceName}`}
                                            onClick={() =>
                                              openSourceViewer({
                                                sourceName,
                                                fallbackText: `${point.heading} ${point.detail}`,
                                              })
                                            }
                                        >
                                            {sourceName}
                                            {pageLabel}
                                          </Button>
                                        );
                                      },
                                    )}
                                  </span>
                                ) : (
                                  <span className="matterBriefPointHeadingMetaValue">
                                    Uploaded document set
                                  </span>
                                )}
                              </span>
                              {point.pointType ? (
                                <span className="matterBriefPointHeadingMetaItem">
                                  <span className="matterBriefPointHeadingMetaLabel">
                                    Type:
                                  </span>
                                  <span className="matterBriefPointHeadingMetaValue">
                                    {formatBriefTaxonomyLabel(point.pointType)}
                                  </span>
                                </span>
                              ) : null}
                              {point.sourcePosture ? (
                                <span className="matterBriefPointHeadingMetaItem">
                                  <span className="matterBriefPointHeadingMetaLabel">
                                    Posture:
                                  </span>
                                  <span className="matterBriefPointHeadingMetaValue">
                                    {formatBriefTaxonomyLabel(
                                      point.sourcePosture,
                                    )}
                                  </span>
                                </span>
                              ) : null}
                              {point.certainty ? (
                                <span className="matterBriefPointHeadingMetaItem">
                                  <span className="matterBriefPointHeadingMetaLabel">
                                    Certainty:
                                  </span>
                                  <span className="matterBriefPointHeadingMetaValue">
                                    {formatBriefTaxonomyLabel(point.certainty)}
                                  </span>
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <p className="matterBriefPointDetail">
                            {point.detail}
                          </p>
                          {point.reason ? (
                            <p className="matterBriefPointReason">
                              {point.reason}
                            </p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="matterBriefText">
                      {briefDisplayPayload?.accumulated_brief ||
                        "Brief generated."}
                    </p>
                  )}
                  {briefDisplayPayload?.warning ? (
                    <p className="matterBriefError">
                      {briefDisplayPayload.warning}
                    </p>
                  ) : null}
                  <div className="matterBriefSourceRow">
                    <span>
                      {activeMatter.classification?.classification_name ||
                        "Matter classification"}
                    </span>
                    <span>
                      {uploadedDocumentCount} linked document
                      {uploadedDocumentCount === 1 ? "" : "s"}
                    </span>
                    <span>Facts only</span>
                  </div>
                  {!activeMatter?.acceptedBrief?.accepted_at ? (
                    <div className="matterBriefActions">
                      <Button
                        type="button"
                        disabled={isAcceptingBrief}
                        onClick={() => void handleAcceptBrief()}
                      >
                        {isAcceptingBrief ? "Accepting..." : "Accept Brief"}
                      </Button>
                    </div>
                  ) : null}
                  {activeMatter?.acceptedBrief?.accepted_at ? (
                    <p className="matterBriefAcceptedMeta">
                      Accepted on{" "}
                      {formatUploadedAt(activeMatter.acceptedBrief.accepted_at)}
                    </p>
                  ) : null}
                  {activeMatter?.acceptedBrief?.accepted_at &&
                  secondaryClassification ? (
                    <div className="matterSecondaryClassificationBox">
                      <p className="matterBriefPointHeadingText">
                        {secondaryStatus ===
                        "classification_pending_confirmation"
                          ? "Confirm matter classification"
                          : "Matter classification confirmed"}
                      </p>
                      <p className="matterBriefPointDetail">
                        {formatBriefTaxonomyLabel(
                          String(
                            secondaryClassification.primary_domain || "unknown",
                          ),
                        )}{" "}
                        /{" "}
                        {formatBriefTaxonomyLabel(
                          String(
                            secondaryClassification.primary_subdomain ||
                              "unknown",
                          ),
                        )}{" "}
                        before{" "}
                        {formatBriefTaxonomyLabel(
                          String(
                            (secondaryClassification.forum as {
                              court?: string;
                            })?.court || "unknown",
                          ),
                        )}
                        . Stage:{" "}
                        {formatBriefTaxonomyLabel(
                          String(
                            secondaryClassification.procedural_stage ||
                              "unknown",
                          ),
                        )}
                        . Client posture:{" "}
                        {formatBriefTaxonomyLabel(
                          String(
                            secondaryClassification.client_posture ||
                              "unknown",
                          ),
                        )}
                        .
                      </p>
                      {secondaryClassificationMarkers.length ? (
                        <div className="matterSecondaryTagSection">
                          <div className="matterSecondaryTagList">
                            {secondaryClassificationMarkers.map((marker) => (
                              <span
                                key={marker}
                                className={`matterSecondaryTag ${
                                  secondaryUserDefinedTags.some(
                                    (tag) =>
                                      tag.toLowerCase() ===
                                      marker.toLowerCase(),
                                  )
                                    ? "isUserTag"
                                    : ""
                                }`}
                              >
                                {marker}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {!isActiveMockMatter && secondaryClassification ? (
                        <form
                          className="matterSecondaryTagForm"
                          onSubmit={(event) =>
                            void handleAddClassificationTag(event)
                          }
                        >
                          <input
                            type="text"
                            value={classificationTagInput}
                            onChange={(event) =>
                              setClassificationTagInput(event.target.value)
                            }
                            placeholder="Add classification tag"
                            maxLength={80}
                          />
                          <Button
                            type="submit"
                            disabled={
                              isSavingClassificationTag ||
                              !classificationTagInput.trim()
                            }
                          >
                            {isSavingClassificationTag ? "Saving..." : "Add tag"}
                          </Button>
                        </form>
                      ) : null}
                      {String(
                        secondaryClassification.document_set_summary || "",
                      ).trim() ? (
                        <p className="matterBriefPointReason">
                          {String(
                            secondaryClassification.document_set_summary || "",
                          ).trim()}
                        </p>
                      ) : secondaryDocumentTypes.length ? (
                        <p className="matterBriefPointReason">
                          Documents:{" "}
                          {secondaryDocumentTypes
                            .map((documentType) =>
                              formatBriefTaxonomyLabel(documentType),
                            )
                            .join(", ")}
                        </p>
                      ) : null}
                      {secondaryDocumentProfiles.length ? (
                        <div className="matterSecondaryDocumentProfileGrid">
                          {secondaryDocumentProfiles.map((profile, index) => (
                            <div
                              className="matterSecondaryDocumentProfile"
                              key={`${profile.fileName}-${index}`}
                            >
                              <span>
                                {formatBriefTaxonomyLabel(
                                  profile.documentType || "unknown",
                                )}
                              </span>
                              <strong>
                                {profile.fileName || `Document ${index + 1}`}
                              </strong>
                              {profile.confidence != null ? (
                                <small>
                                  {Math.round(profile.confidence * 100)}%
                                </small>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {secondaryStatus ===
                      "classification_pending_confirmation" ? (
                        <div className="matterBriefActions">
                          <Button
                            type="button"
                            disabled={isConfirmingSecondaryClassification}
                            onClick={() =>
                              void handleConfirmSecondaryClassification()
                            }
                          >
                            {isConfirmingSecondaryClassification
                              ? "Confirming..."
                              : "Confirm classification"}
                          </Button>
                        </div>
                      ) : (
                        <p className="matterBriefPointReason">
                          {secondaryFactChecklistCount} fact slots,{" "}
                          {secondaryVerifiedFactCount} verified facts,{" "}
                          {secondaryGapCount} gaps.
                        </p>
                      )}
                    </div>
                  ) : null}
                  {briefAcceptError ? (
                    <p className="matterBriefError">{briefAcceptError}</p>
                  ) : null}
                </>
              ) : (
                <p className="matterBriefText">
                  Upload and extraction are complete. The matter brief agent
                  will either generate a facts-only brief or ask for missing
                  information.
                </p>
              )}
            </article>

            {shouldShowGroundAnalysis ? (
              <article className="matterDebriefPanel">
                <div className="matterDebriefHead">
                  <p className="matterEyebrow">
                    Ground Analysis{" "}
                    {groundAnalysis?.meta?.error
                      ? "· Degraded"
                      : "· Facts / Law / Inference separated"}
                  </p>
                  <div className="matterDebriefHeadActions">
                    <span
                      className={`matterBriefStatus is-${groundAnalysisStatus}`}
                    >
                      {groundAnalysisStatus || "not started"}
                    </span>
                  </div>
                </div>

                {isGroundAnalysisProcessing && !groundAnalysisCards.length ? (
                  <div className="matterDebriefLoadingStack">
                    <div className="matterDebriefLoading">
                      <Loader
                        mode="inline"
                        variant="spinner"
                        eyebrow="Ground Analysis"
                        title={
                          activeMatter.intelligence_statuses
                            ?.inference_generation === "processing" ||
                          activeMatter.intelligence_statuses
                            ?.inference_verification === "processing"
                            ? "Generating Inference"
                            : activeMatter.intelligence_statuses
                                  ?.next_step_planner === "processing"
                              ? "Planning Next Steps"
                              : activeMatter.intelligence_statuses
                                    ?.law_generation === "processing" ||
                                  activeMatter.intelligence_statuses
                                    ?.law_verification === "processing"
                                ? "Researching Law"
                                : "Generating Signals"
                        }
                        message={
                          activeMatter.intelligence_statuses
                            ?.inference_generation === "processing" ||
                          activeMatter.intelligence_statuses
                            ?.inference_verification === "processing"
                            ? "Combining fact-grounded findings with verified law support to produce cautious inference cards."
                            : activeMatter.intelligence_statuses
                                  ?.next_step_planner === "processing"
                              ? "Turning completed fact, law, and inference cards into drafting and evidence actions."
                              : activeMatter.intelligence_statuses
                                    ?.law_generation === "processing" ||
                                  activeMatter.intelligence_statuses
                                    ?.law_verification === "processing"
                                ? "Finding ranked Indian authorities and attaching cautious law support to each fact-grounded ground."
                                : "Building fact-grounded matter signals from the accepted brief and uploaded documents."
                        }
                      />
                    </div>
                    <div className="matterDebriefCards matterDebriefCardsShimmer">
                      {Array.from({ length: groundAnalysisShimmerCount }).map(
                        (_, index) => (
                          <article
                            className="matterDebriefCard matterDebriefCardShimmer"
                            key={`ga-shimmer-${index}`}
                          >
                            <div className="matterDebriefCardTop">
                              <div className="matterShimmerLine matterShimmerLineTitle" />
                              <div className="matterShimmerChip" />
                            </div>
                            <div
                              className="matterDebriefBarTrack"
                              aria-hidden="true"
                            >
                              <span className="matterDebriefBarFill matterDebriefBarFillShimmer" />
                            </div>
                            <div className="matterDebriefFactGrid">
                              <div className="matterDebriefFactBlock matterDebriefFactBlockShimmer">
                                <span>Fact</span>
                                <div className="matterShimmerParagraph">
                                  <div className="matterShimmerLine" />
                                  <div className="matterShimmerLine" />
                                  <div className="matterShimmerLine matterShimmerLineShort" />
                                </div>
                              </div>
                              <div className="matterDebriefFactBlock matterDebriefFactBlockShimmer">
                                <span>Law</span>
                                <div className="matterShimmerParagraph">
                                  <div className="matterShimmerLine" />
                                  <div className="matterShimmerLine matterShimmerLineShort" />
                                </div>
                              </div>
                              <div className="matterDebriefFactBlock matterDebriefFactBlockShimmer">
                                <span>Inference</span>
                                <div className="matterShimmerParagraph">
                                  <div className="matterShimmerLine" />
                                  <div className="matterShimmerLine matterShimmerLineShort" />
                                </div>
                              </div>
                              <div className="matterDebriefFactBlock matterDebriefFactBlockShimmer">
                                <span>Next Steps</span>
                                <div className="matterShimmerParagraph">
                                  <div className="matterShimmerLine" />
                                  <div className="matterShimmerLine matterShimmerLineShort" />
                                </div>
                              </div>
                            </div>
                          </article>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}

                {isGroundAnalysisProcessing && groundAnalysisCards.length ? (
                  <div className="matterDebriefLoading matterDebriefLoadingInline">
                    <Loader
                      mode="inline"
                      variant="spinner"
                      eyebrow="Ground Analysis"
                      title={
                        activeMatter.intelligence_statuses
                          ?.inference_generation === "processing" ||
                        activeMatter.intelligence_statuses
                          ?.inference_verification === "processing"
                          ? "Updating Inference"
                          : activeMatter.intelligence_statuses
                                ?.next_step_planner === "processing"
                            ? "Planning Next Steps"
                            : activeMatter.intelligence_statuses
                                  ?.law_generation === "processing" ||
                                activeMatter.intelligence_statuses
                                  ?.law_verification === "processing"
                              ? "Updating Law"
                              : "Updating Signals"
                      }
                      message="Completed cards are shown below while the remaining analysis finishes."
                    />
                  </div>
                ) : null}
                {groundAnalysisFailed &&
                !groundAnalysisCards.length &&
                !isGroundAnalysisProcessing ? (
                  <p className="matterDebriefEmpty">
                    {groundAnalysisErrorMessage}
                  </p>
                ) : groundAnalysis?.no_signals_found &&
                  !groundAnalysisCards.length &&
                  !isGroundAnalysisProcessing ? (
                  <p className="matterDebriefEmpty">
                    No fact-grounded debrief signals were found in the current
                    uploaded set.
                  </p>
                ) : groundAnalysisCards.length ? (
                  <div className="matterDebriefCards">
                    {visibleGroundAnalysisCards.map((card) => (
                      <Fragment key={card.id}>
                      <article className="matterDebriefCard">
                        <div className="matterDebriefCardTop">
                          <h3>{card.title}</h3>
                          <div className="matterDebriefScore">
                            <span>Source match</span>
                            <strong>
                              {typeof card.supportScore === "number"
                                ? Math.round(card.supportScore * 100)
                                : card.confidencePercent}
                              %
                            </strong>
                          </div>
                        </div>
                        <div
                          className="matterDebriefBarTrack"
                          aria-hidden="true"
                        >
                          <span
                            className={`matterDebriefBarFill is-${card.status}`}
                            style={{
                              width: `${
                                typeof card.supportScore === "number"
                                  ? Math.round(card.supportScore * 100)
                                  : card.confidencePercent
                              }%`,
                            }}
                          />
                        </div>
                        <div className="matterDebriefFactGrid">
                          <div className="matterDebriefFactBlock">
                            <span>Fact</span>
                            <p>{card.factText}</p>
                          </div>
                          <div className="matterDebriefFactBlock matterDebriefLawBlock">
                            <span>Law Status</span>
                            {card.lawText ? (
                              <p>{card.lawText}</p>
                            ) : card.lawVerificationStatus === "failed" ||
                              activeMatter?.intelligence_statuses
                                ?.law_generation === "failed" ||
                              activeMatter?.intelligence_statuses
                                ?.law_verification === "failed" ? (
                              <p>No supported legal rule extracted yet.</p>
                            ) : groundAnalysisCards.length > 0 ? (
                              <div className="matterShimmerParagraph matterDebriefInlineShimmer">
                                <div className="matterShimmerLine" />
                                <div className="matterShimmerLine matterShimmerLineShort" />
                              </div>
                            ) : (
                              <p>Verified law citation will appear below when available.</p>
                            )}
                          </div>
                          <div className="matterDebriefFactBlock matterDebriefInferenceBlock">
                            <span>Inference</span>
                            {card.inferenceText ? (
                              <p>{card.inferenceText}</p>
                            ) : card.inferenceMetaError ||
                              activeMatter?.intelligence_statuses
                                ?.inference_generation === "failed" ||
                              activeMatter?.intelligence_statuses
                                ?.inference_verification === "failed" ? (
                              <p>Inference generated with review required.</p>
                            ) : groundAnalysisCards.length > 0 ? (
                              <div className="matterShimmerParagraph matterDebriefInlineShimmer">
                                <div className="matterShimmerLine" />
                                <div className="matterShimmerLine matterShimmerLineShort" />
                              </div>
                            ) : (
                              <p>Inference pipeline pending.</p>
                            )}
                          </div>
                        </div>
                        <div className="matterDebriefMeta">
                          {card.lawSources.length ? (
                            <div className="matterDebriefLawSourcesBlock">
                              <strong>Sources referred:</strong>
                              <div className="matterDebriefLawSources">
                                {card.lawSources.map((source) => (
                                  <a
                                    key={`${card.id}-${source.source_id}`}
                                    href={String(source?.url || "#")}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="matterDebriefLawSourceLink"
                                  >
                                    {String(source?.title || "Authority")}
                                  </a>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <p>
                            <strong>Source files:</strong>{" "}
                            {card.sourceFiles.length ? (
                              <span className="matterSourceFileList">
                                {card.sourceFiles.map((sourceName) => {
                                  const matchingRef =
                                    card.sourceRefs.find(
                                      (ref) =>
                                        normalizeSourceName(
                                          ref.file_name || "",
                                        ) === normalizeSourceName(sourceName),
                                    ) ||
                                    card.sourceRefs[0] ||
                                    null;
                                  return (
                                    <Button
                                      type="button"
                                      className="matterSourceFileButton"
                                      key={`${card.id}-${sourceName}`}
                                      onClick={() =>
                                        openSourceViewer({
                                          sourceName,
                                          sourceRef: matchingRef,
                                          fallbackText: `${card.title} ${card.factText}`,
                                        })
                                      }
                                    >
                                      {sourceName}
                                    </Button>
                                  );
                                })}
                              </span>
                            ) : (
                              "Uploaded document set"
                            )}
                          </p>
                          {card.researchGaps.length ? (
                            <p>
                              <strong>Research gaps:</strong>{" "}
                              {card.researchGaps.join(" ")}
                            </p>
                          ) : null}
                        </div>
                      </article>
                      {card.lawCard ? (
                        <article className="matterDebriefCard matterDebriefVerifiedLawCard">
                          <div className="matterDebriefCardTop">
                            <h3>{card.lawCard.title || "Verified law citation"}</h3>
                            <div className="matterDebriefScore">
                              <span>Binding</span>
                              <strong>
                                {card.lawCard.bindingStrength || "verified"}
                              </strong>
                            </div>
                          </div>
                          <div className="matterDebriefFactGrid">
                            <div className="matterDebriefFactBlock matterDebriefLawBlock">
                              <span>Verified Law</span>
                              <p>{card.lawCard.bindingExplanation}</p>
                            </div>
                            {card.lawCard.application ? (
                              <div className="matterDebriefFactBlock matterDebriefInferenceBlock">
                                <span>Application</span>
                                <p>{card.lawCard.application}</p>
                              </div>
                            ) : null}
                          </div>
                          <div className="matterDebriefMeta">
                            <p>
                              <strong>Source:</strong>{" "}
                              {card.lawCard.sourceUrl ? (
                                <a
                                  href={card.lawCard.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="matterDebriefLawSourceLink"
                                >
                                  {card.lawCard.sourceDomain ||
                                    card.lawCard.sourceUrl}
                                </a>
                              ) : (
                                card.lawCard.sourceDomain || "Verified source"
                              )}
                            </p>
                            <p>
                              <strong>Verification:</strong>{" "}
                              {card.lawCard.verificationStatus || "verified"}
                            </p>
                          </div>
                        </article>
                      ) : null}
                      </Fragment>
                    ))}
                    {hasHiddenGroundAnalysisCards ? (
                      <Button
                        type="button"
                        className="matterDebriefShowMore"
                        onClick={() =>
                          setIsGroundAnalysisExpanded((current) => !current)
                        }
                        aria-expanded={isGroundAnalysisExpanded}
                      >
                        {isGroundAnalysisExpanded
                          ? "Show fewer facts"
                          : `Show ${hiddenGroundAnalysisCardCount} more fact${
                              hiddenGroundAnalysisCardCount === 1 ? "" : "s"
                            }`}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {groundAnalysisCards.length ? (
                  <section className="matterDebriefFactBlock matterDebriefNextStepsBlock matterDebriefGlobalNextSteps">
                    <span>Next Steps</span>
                    {shouldShowDraftRecommendations ? (
                      <div className="matterNextStepDraftGroup">
                        <div className="matterDraftRecommendationsHead">
                          <div>
                            <p className="matterEyebrow">Next Steps · Drafts</p>
                            <h2>Recommended Drafts</h2>
                          </div>
                          <div className="matterDraftRecommendationsActions">
                            {activeDraftRecommendations?.counts ? (
                              <span className="matterBriefStatus is-ready">
                                {activeDraftRecommendations.counts.ready || 0} ready ·{" "}
                                {activeDraftRecommendations.counts
                                  .needs_more_inputs || 0}{" "}
                                need inputs
                              </span>
                            ) : null}
                            {!isActiveMockMatter ? (
                              <Button
                                type="button"
                                className="matterDraftRefreshBtn"
                                onClick={() =>
                                  void handleRefreshDraftRecommendations()
                                }
                                disabled={isLoadingDraftRecommendations}
                              >
                                {isLoadingDraftRecommendations
                                  ? "Refreshing..."
                                  : "Refresh"}
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {draftRecommendationError ? (
                          <p className="matterBriefError">
                            {draftRecommendationError}
                          </p>
                        ) : draftRecommendationsPending ? (
                          <div className="matterDraftRecommendationGrid">
                            {Array.from({ length: 3 }).map((_, index) => (
                              <article
                                className="matterDraftRecommendationCard isShimmer"
                                key={`draft-rec-next-shimmer-${index}`}
                              >
                                <div className="matterShimmerLine matterShimmerLineTitle" />
                                <div className="matterShimmerParagraph">
                                  <div className="matterShimmerLine" />
                                  <div className="matterShimmerLine matterShimmerLineShort" />
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : draftRecommendationItems.length ? (
                          <>
                            {readyDraftRecommendations.length ? (
                              <section className="matterDraftRecommendationGroup">
                                <div className="matterDraftRecommendationGroupHead">
                                  <span>Ready to draft</span>
                                  <small>
                                    Catalogue rules matched the required inputs.
                                  </small>
                                </div>
                                <div className="matterDraftRecommendationGrid">
                                  {readyDraftRecommendations.map(
                                    (recommendation) => (
                                      <article
                                        className="matterDraftRecommendationCard isReady"
                                        key={recommendation.draft_key}
                                      >
                                        <div className="matterDraftRecommendationTop">
                                          <h3>{recommendation.title}</h3>
                                          <span>
                                            {Math.round(
                                              Number(
                                                recommendation.readiness_score ||
                                                  0,
                                              ) * 100,
                                            )}
                                            %
                                          </span>
                                        </div>
                                        <p>
                                          {recommendation.reason ||
                                            recommendation.purpose}
                                        </p>
                                        {recommendation.matched_documents
                                          ?.length ? (
                                          <small>
                                            Sources:{" "}
                                            {recommendation.matched_documents
                                              .slice(0, 3)
                                              .join(", ")}
                                          </small>
                                        ) : recommendation.matched_facts
                                            ?.length ? (
                                          <small>
                                            Facts:{" "}
                                            {recommendation.matched_facts
                                              .slice(0, 3)
                                              .join(", ")}
                                          </small>
                                        ) : null}
                                        <div className="matterDraftRecommendationFooter">
                                          <span>
                                            {recommendation.priority ||
                                              "medium"}{" "}
                                            ·{" "}
                                            {recommendation.risk_level ||
                                              "medium"}{" "}
                                            risk
                                          </span>
                                          <Button
                                            type="button"
                                            className="matterStartDraftingBtn"
                                            onClick={() =>
                                              void handleStartDraftRecommendation(
                                                recommendation,
                                              )
                                            }
                                            disabled={
                                              startingDraftKey ===
                                              recommendation.draft_key
                                            }
                                          >
                                            {startingDraftKey ===
                                            recommendation.draft_key
                                              ? "Starting..."
                                              : recommendation.existing_draft_count
                                                ? "Open new copy"
                                                : "Start Draft"}
                                          </Button>
                                        </div>
                                      </article>
                                    ),
                                  )}
                                </div>
                              </section>
                            ) : null}

                            {lockedDraftRecommendations.length ? (
                              <section className="matterDraftRecommendationGroup">
                                <div className="matterDraftRecommendationGroupHead">
                                  <span>
                                    Upload these to unlock more drafts
                                  </span>
                                  <small>
                                    Required inputs are missing from the current
                                    matter set.
                                  </small>
                                </div>
                                <div className="matterDraftRecommendationGrid">
                                  {lockedDraftRecommendations.map(
                                    (recommendation) => (
                                      <article
                                        className="matterDraftRecommendationCard isLocked"
                                        key={recommendation.draft_key}
                                      >
                                        <div className="matterDraftRecommendationTop">
                                          <h3>{recommendation.title}</h3>
                                          <span>
                                            {Math.round(
                                              Number(
                                                recommendation.readiness_score ||
                                                  0,
                                              ) * 100,
                                            )}
                                            %
                                          </span>
                                        </div>
                                        <p>
                                          {recommendation.reason ||
                                            recommendation.purpose}
                                        </p>
                                        {recommendation.missing_inputs
                                          ?.length ? (
                                          <div className="matterDraftMissingList">
                                            {recommendation.missing_inputs
                                              .slice(0, 4)
                                              .map((input) => (
                                                <span
                                                  key={`${recommendation.draft_key}-${input.input_key}`}
                                                >
                                                  {input.label ||
                                                    input.input_label ||
                                                    input.input_key.replace(
                                                      /_/g,
                                                      " ",
                                                    )}
                                                </span>
                                              ))}
                                          </div>
                                        ) : null}
                                        {recommendation.recommended_uploads
                                          ?.length ? (
                                          <small>
                                            Upload:{" "}
                                            {recommendation.recommended_uploads
                                              .slice(0, 3)
                                              .join(", ")}
                                          </small>
                                        ) : null}
                                      </article>
                                    ),
                                  )}
                                </div>
                              </section>
                            ) : null}
                          </>
                        ) : canLoadDraftRecommendations ? (
                          <p className="matterDebriefEmpty">
                            No catalogue-backed draft option matched this matter
                            yet.
                          </p>
                        ) : (
                          <p className="matterDebriefEmpty">
                            Recommended drafts will appear after fact extraction
                            and legal inference finish.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <p className="matterDebriefEmpty">
                    Ground analysis has not been generated yet for this accepted
                    brief.
                  </p>
                )}
              </article>
            ) : null}
          </>
        ) : null}
      </header>

      {blankFieldHits.length > 0 ? (
        <article className="matterBlankBanner">
          <Button
            type="button"
            className="matterBlankBannerToggle"
            onClick={() => setIsBlankFieldBannerOpen((prev) => !prev)}
            aria-expanded={isBlankFieldBannerOpen}
            aria-controls="matter-blank-fields-list"
            showImage
            image={
              isBlankFieldBannerOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )
            }
            imagePosition="right"
          >
            <strong>{blankFieldHits.length} unfilled fields detected</strong>
          </Button>

          {isBlankFieldBannerOpen ? (
            <div
              className="matterBlankBannerBody"
              id="matter-blank-fields-list"
            >
              {blankFieldsBySection.map(([sectionLabel, hits]) => (
                <section key={sectionLabel} className="matterBlankGroup">
                  <h3>{sectionLabel}</h3>
                  <ul>
                    {hits.map((hit) => (
                      <li key={hit.id}>
                        <Button
                          type="button"
                          onClick={() => handleJumpToBlankField(hit)}
                        >
                          {titleCase(hit.label)} (Page {hit.page})
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : null}
        </article>
      ) : null}

      {MATTER_AI_ENABLED ? (
        <>
          <aside
            className={`matterObligationPanel ${
              isObligationPanelOpen ? "isOpen" : "isClosed"
            }`}
            role="complementary"
            aria-hidden={!isObligationPanelOpen}
          >
            <div className="matterObligationPanelHead">
              <div>
                <p className="matterEyebrow">Obligation Mapper</p>
                <h3>Obligation balance</h3>
              </div>
              <Button
                type="button"
                className="matterObligationClose"
                onClick={() => onCloseObligationPanel?.()}
                aria-label="Close obligation mapper panel"
                showImage
                image={<X size={16} />}
              />
            </div>

            {obligationMapStatus === "loading" ? (
              <Loader
                mode="inline"
                eyebrow="Obligation Mapper"
                title="Mapping Obligations"
                fileName={activeMatter?.fileName || "Current matter"}
                message="Classifying clause summaries and building obligation balance."
                stage="Analyzing obligation allocation"
                progress={62}
                steps={obligationLoaderSteps}
              />
            ) : obligationMapStatus === "error" ? (
              <div className="matterObligationState">
                <p>{obligationMapError || "Obligation mapping failed."}</p>
                <Button type="button" onClick={() => void fetchObligationMap()}>
                  Retry
                </Button>
              </div>
            ) : obligationMapStatus === "ready" && obligationMapResult ? (
              <>
                <div
                  className={`matterObligationScore matterObligationScore-${obligationMapResult.imbalance.level}`}
                >
                  <strong>
                    IPPB: {obligationMapResult.counts.ippb} obligations
                  </strong>
                  <span>
                    Service Provider:{" "}
                    {obligationMapResult.counts.service_provider} obligations
                  </span>
                </div>

                <div className="matterObligationColumns">
                  <section>
                    <h4>IPPB obligations</h4>
                    {obligationColumns.ippb.length ? (
                      <ul>
                        {obligationColumns.ippb.map((item) => {
                          const source = obligationClauseById.get(
                            item.clause_id,
                          );
                          if (!source) return null;
                          return (
                            <li key={`ippb-${item.clause_id}`}>
                              <Button
                                type="button"
                                className="matterObligationLink"
                                onClick={() =>
                                  handleJumpToClauseById(item.clause_id)
                                }
                              >
                                {source.display_text}
                              </Button>
                              <div className="matterObligationMeta">
                                <span>{source.heading}</span>
                                {item.party === "mutual" ? (
                                  <span className="matterObligationMutual">
                                    Mutual
                                  </span>
                                ) : null}
                                <Button
                                  type="button"
                                  onClick={() =>
                                    handleJumpToClausePage(item.clause_id, true)
                                  }
                                >
                                  Page {source.source_page || source.page_start}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="matterObligationEmpty">
                        No obligations detected.
                      </p>
                    )}
                  </section>

                  <section>
                    <h4>Service Provider obligations</h4>
                    {obligationColumns.serviceProvider.length ? (
                      <ul>
                        {obligationColumns.serviceProvider.map((item) => {
                          const source = obligationClauseById.get(
                            item.clause_id,
                          );
                          if (!source) return null;
                          return (
                            <li key={`sp-${item.clause_id}`}>
                              <Button
                                type="button"
                                className="matterObligationLink"
                                onClick={() =>
                                  handleJumpToClauseById(item.clause_id)
                                }
                              >
                                {source.display_text}
                              </Button>
                              <div className="matterObligationMeta">
                                <span>{source.heading}</span>
                                {item.party === "mutual" ? (
                                  <span className="matterObligationMutual">
                                    Mutual
                                  </span>
                                ) : null}
                                <Button
                                  type="button"
                                  onClick={() =>
                                    handleJumpToClausePage(item.clause_id, true)
                                  }
                                >
                                  Page {source.source_page || source.page_start}
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="matterObligationEmpty">
                        No obligations detected.
                      </p>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <p className="matterObligationState">
                Open the mapper to classify obligations from clause summaries.
              </p>
            )}
          </aside>

          <aside
            className={`matterObligationPanel matterPlaybookPanel ${
              isPlaybookPanelOpen ? "isOpen" : "isClosed"
            }`}
            role="complementary"
            aria-hidden={!isPlaybookPanelOpen}
          >
            <div className="matterObligationPanelHead">
              <div>
                <p className="matterEyebrow">Playbook</p>
                <h3>Accepted redlines</h3>
              </div>
              <Button
                type="button"
                className="matterObligationClose"
                onClick={() => onClosePlaybookPanel?.()}
                aria-label="Close playbook panel"
                showImage
                image={<X size={16} />}
              />
            </div>
            {acceptedRedlines.length ? (
              <div className="matterPlaybookList">
                {acceptedRedlines.map((item: AcceptedRedline) => (
                  <article className="matterPlaybookItem" key={item.id}>
                    <header>
                      <div className="matterPlaybookHeaderRow">
                        <input
                          className="matterPlaybookTitleInput"
                          value={item.title || item.clauseHeading}
                          onChange={(event) =>
                            activeMatter &&
                            updateAcceptedRedline(activeMatter.id, item.id, {
                              title: event.target.value,
                            })
                          }
                          onBlur={() => {
                            void patchAcceptedRedlineRemote(item.id, {
                              title: item.title || item.clauseHeading,
                            });
                          }}
                        />
                        <Button
                          type="button"
                          className="matterPlaybookDeleteButton"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this accepted redline from playbook?",
                              )
                            ) {
                              void deleteAcceptedRedlineRemote(item.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                      <span>
                        {item.position} ·{" "}
                        {item.representedParty === "ippb"
                          ? "Representing IPPB"
                          : "Representing Service Provider"}
                      </span>
                    </header>
                    <p className="matterPlaybookMeta">
                      {item.sectionLabel} · Accepted{" "}
                      {new Date(item.acceptedAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                        timeZone: "Asia/Kolkata",
                      })}
                    </p>
                    <div className="matterPlaybookText">
                      <label>Original</label>
                      <p>{item.originalText}</p>
                      <label>Suggested</label>
                      <textarea
                        className="matterPlaybookTextArea"
                        value={item.rewrittenText}
                        rows={5}
                        onChange={(event) =>
                          activeMatter &&
                          updateAcceptedRedline(activeMatter.id, item.id, {
                            rewrittenText: event.target.value,
                          })
                        }
                        onBlur={() => {
                          void patchAcceptedRedlineRemote(item.id, {
                            rewrittenText: item.rewrittenText,
                          });
                        }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="matterObligationState">
                No accepted redlines yet. Open a clause and click Accept redline
                to add it here.
              </p>
            )}
          </aside>
        </>
      ) : null}

      {activeClause && activeClauseSection && isClauseJumpPanelVisible ? (
        <aside
          className={`matterClauseJumpPanel ${
            isClauseJumpPanelCollapsed ? "isCollapsed" : ""
          }`}
          aria-live="polite"
        >
          <Button
            type="button"
            className="matterClauseJumpBack"
            onClick={handleJumpToClauseSection}
            aria-label={`Return to ${activeClauseSection.section_label}`}
            title={`Return to ${activeClauseSection.section_label}`}
            showImage
            image={<ArrowUp size={16} />}
          />
          {!isClauseJumpPanelCollapsed ? (
            <div className="matterClauseJumpPanelBody">
              <p className="matterClauseJumpEyebrow">
                {activeClauseSection.section_label}
              </p>
              <strong>{activeClause.heading}</strong>
              <p>{activeClause.display_text}</p>
              <div className="matterClauseJumpActions">
                <span>
                  {activeClause.grounding_status === "approximate"
                    ? "Approximate match"
                    : "Exact match"}
                </span>
                <Button
                  type="button"
                  className="matterClauseJumpClose"
                  onClick={() => setIsClauseJumpPanelCollapsed(true)}
                  showImage
                  image={<X size={16} />}
                />
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      <SearchBar
        activeSection="matterLibrary"
        allowTextOnly
        enableSubmit
        isSubmitting={isMatterChatSubmitting}
        onSubmitQuery={handleMatterChatSubmit}
        mode={matterChatMode}
        onModeChange={setMatterChatMode}
        placeholderOverride="Ask about this matter or switch to Deep Research..."
      />

      <div className="matterContextCorePanel">
        {isActiveMockMatter ? (
          <p className="matterContextCoreMessage">
            ContextCore retrieval is disabled for mock matters.
          </p>
        ) : activeMatter && activeMatterContextCore?.status !== "ready" ? (
          <p className="matterContextCoreMessage">
            {activeMatterContextCore?.status === "not_requested"
              ? "This matter was not passed through ContextCore."
              : activeMatterContextCore?.status === "stale"
                ? "This matter has additional files that were uploaded without ContextCore re-indexing."
                : activeMatterContextCore?.status === "processing"
                  ? "ContextCore is still indexing this matter."
                  : activeMatterContextCore?.error ||
                    "ContextCore retrieval is unavailable for this matter."}
          </p>
        ) : null}

        {matterSearchInfo ? (
          <p className="matterContextCoreMessage">{matterSearchInfo}</p>
        ) : null}

        {matterSearchError ? (
          <p className="matterContextCoreError">{matterSearchError}</p>
        ) : null}

        {matterSearchResults.length ? (
          <div className="matterContextCoreResults">
            {matterSearchResults.map((result) => (
              <article className="matterContextCoreCard" key={result.chunk_id}>
                <div className="matterContextCoreCardHead">
                  <strong>{result.metadata?.file_name || "Source"}</strong>
                  <span>
                    {[result.metadata?.document_role, result.metadata?.assertion_mode]
                      .filter(Boolean)
                      .join(" • ")}
                  </span>
                </div>
                <p className="matterContextCoreMeta">
                  {result.metadata?.page_start
                    ? `Page ${result.metadata.page_start}`
                    : "Paragraph match"}
                  {result.metadata?.party_side
                    ? ` • ${String(result.metadata.party_side).replace(/_/g, " ")}`
                    : ""}
                </p>
                <p className="matterContextCoreText">{result.text}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <ChatBoxMatterSection
        open={isMatterChatOpen}
        matterTitle={matterHeading}
        clarificationQuestions={isBriefQueryRequired ? briefQuestions : []}
        isSubmittingClarification={isSubmittingBriefAnswers}
        clarificationError={briefAnswerError}
        messages={matterChatMessages}
        chatMode={matterChatMode}
        isSubmittingChat={isMatterChatSubmitting}
        chatError={matterChatError}
        onClose={() => setIsMatterChatOpen(false)}
        onSubmitClarification={(answer) => handleSubmitBriefAnswers(answer)}
        onSkipClarification={() => handleSubmitBriefAnswers("__skip__")}
        onSubmitChat={handleMatterChatSubmit}
        onModeChange={setMatterChatMode}
      />

      {isPeopleDialogOpen && (
        <div className="matterDialogBackdrop" role="presentation">
          <form className="matterPeopleDialog" onSubmit={handleAddPerson}>
            <div className="matterPeopleDialogHead">
              <div>
                <p className="matterEyebrow">People</p>
                <h2>Add person</h2>
              </div>
              <Button
                type="button"
                aria-label="Close add person dialog"
                onClick={() => {
                  resetPersonForm();
                  setIsPeopleDialogOpen(false);
                }}
                showImage
                image={<X size={18} />}
              />
            </div>

            <label>
              Name
              <input
                value={personName}
                onChange={(event) => setPersonName(event.target.value)}
                placeholder="Anand Krishnamurthy"
                autoFocus
                required
              />
            </label>
            <label>
              Role
              <input
                value={personRole}
                onChange={(event) => setPersonRole(event.target.value)}
                placeholder="Petitioner, Counsel, Witness"
              />
            </label>
            <label>
              Notes
              <textarea
                value={personDescription}
                onChange={(event) => setPersonDescription(event.target.value)}
                placeholder="Your client · DOB · Contact · next date"
                rows={3}
              />
            </label>

            <div className="matterPeopleDialogActions">
              <Button
                type="button"
                onClick={() => {
                  resetPersonForm();
                  setIsPeopleDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Add person</Button>
            </div>
          </form>
        </div>
      )}

      {isDeleteDialogOpen && (
        <div className="matterDialogBackdrop" role="presentation">
          <div className="matterPeopleDialog matterDeleteDialog">
            <div className="matterPeopleDialogHead">
              <div>
                <p className="matterEyebrow">Confirm deletion</p>
                <h2>Delete matter</h2>
              </div>
              <Button
                type="button"
                aria-label="Close delete matter dialog"
                onClick={() => {
                  if (isDeletingMatter) return;
                  setIsDeleteDialogOpen(false);
                  setDeleteConfirmText("");
                }}
                showImage
                image={<X size={18} />}
              />
            </div>
            <p className="matterDeletePrompt">
              This will permanently delete matter files from Backblaze. Type{" "}
              <strong>DELETE</strong> to confirm.
            </p>
            <label>
              Confirmation
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="DELETE"
                autoFocus
              />
            </label>
            <div className="matterPeopleDialogActions">
              <Button
                type="button"
                onClick={() => {
                  if (isDeletingMatter) return;
                  setIsDeleteDialogOpen(false);
                  setDeleteConfirmText("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="matterDeleteConfirmBtn"
                onClick={() => void handleDeleteMatter()}
                disabled={deleteConfirmText !== "DELETE" || isDeletingMatter}
              >
                {isDeletingMatter ? "Deleting..." : "Delete matter"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {sourceViewer ? (
        <div className="matterDialogBackdrop" role="presentation">
          <section
            className="matterSourceDialog"
            role="dialog"
            aria-modal="true"
          >
            <header className="matterSourceDialogHead">
              <div>
                <p className="matterEyebrow">Source File</p>
                <h2>{sourceViewer.fileName}</h2>
              </div>
              <div className="matterSourceDialogActions">
                <Button
                  type="button"
                  className="matterStartDraftingBtn"
                  onClick={() => {
                    navigate(
                      `/draft?matter=${encodeURIComponent(sourceViewer.matterId)}&sourceDocument=${encodeURIComponent(sourceViewer.fileName)}&mode=edit`,
                    );
                  }}
                >
                  Open draft
                </Button>
                <Button
                  type="button"
                  aria-label="Close source file"
                  onClick={() => setSourceViewer(null)}
                  showImage
                  image={<X size={18} />}
                />
              </div>
            </header>
            <div className="matterSourceWorkspace">
              <aside className="matterSourcePageRail">
                <span>Pages</span>
                {sourceViewerPages.map((page) => (
                  <Button
                    type="button"
                    className={`matterSourcePageLink ${
                      highlightedSourcePage === page.pageNumber
                        ? "isActive"
                        : ""
                    }`}
                    key={`source-page-${page.pageNumber}`}
                    onClick={() => scrollToSourcePage(page.firstBlockId)}
                  >
                    <strong>{page.pageNumber}</strong>
                    <small>
                      {page.blocks.length} block
                      {page.blocks.length === 1 ? "" : "s"}
                    </small>
                  </Button>
                ))}
              </aside>
              <div className="matterSourceFrame">
                {sourceViewerPages.map((page) => (
                  <section
                    className="matterSourcePageSheet"
                    key={`source-sheet-${page.pageNumber}`}
                  >
                    <div className="matterSourcePageHeader">
                      <span>Page {page.pageNumber}</span>
                      <small>{page.label}</small>
                    </div>
                    {page.blocks.map((block) => {
                      const isHighlighted =
                        block.block_id === sourceViewer.highlightBlockId;
                      return (
                        <article
                          className={`matterSourceBlock ${isHighlighted ? "isHighlighted" : ""}`}
                          key={block.block_id}
                          ref={(node) => {
                            sourceBlockRefs.current[block.block_id] = node;
                          }}
                        >
                          <span>Block {block.page_block_index + 1}</span>
                          <p>{block.text}</p>
                        </article>
                      );
                    })}
                  </section>
                ))}
              </div>
              <aside className="matterSourceContextRail">
                <span>Selected signal</span>
                <p>
                  {sourceViewer.highlightText ||
                    "Open a source from a fact card to see the matched text here."}
                </p>
                <small>
                  {sourceViewer.blocks.length} extracted block
                  {sourceViewer.blocks.length === 1 ? "" : "s"} in this source.
                </small>
              </aside>
            </div>
          </section>
        </div>
      ) : null}

    </section>
  );
};

export default MatterSection;
