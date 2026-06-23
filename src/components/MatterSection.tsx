import "../componentStyling/MatterSection.css";
import Button from "./Button";
import { UiButton, UiInput } from "./ui/Primitives";
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
  AlertTriangle,
  ArrowUp,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  Plus,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  type AtlasBaseRecognitionResult,
  type AtlasCaseResearchResult,
  type AtlasDeciderResearchResult,
  type AtlasGapCheckpoint,
  type AtlasMatterBrief,
  type AtlasNextStepsAnalysis,
  type AtlasWorkflowConfirmation,
  useMatterStore,
  type AcceptedRedline,
  type ClauseSection,
  type ClarificationCheckpoint,
  type ClauseItem,
  type ContextCoreMatterState,
  type EvidenceReference,
  type FrontendBriefArtifact,
  type MatterDraftRecommendation,
  type MatterDraftRecommendations,
  type MatterProcessedResult,
  type MatterRecord,
  type MatterSignalSourceRef,
  type ObligationMapResult,
  type PageAwareBlock,
  type SectionRiskMapResult,
} from "../context/MatterStoreContext";
import Loader from "./Loader";
import UploadPopUp, { type UploadPopupValidationItem } from "./UploadPopUp";
import { type SearchBarMode } from "./SearchBar";
import ChatBoxMatterSection, {
  type ChatSource,
  type MatterChatMessage,
} from "./ChatBoxMatterSection";
import {
  cancelMatterDraftGeneration,
  continueMatterDraftGeneration,
  getDraftRecommendations,
  refreshDraftRecommendations,
  type DraftGenerationCheckpoint,
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

type AnalysisProgressMessage = {
  id: string;
  tone: "done" | "current" | "waiting";
  text: string;
  rotationMessages: string[];
};

type UploadPopupMode = "create" | "append";
type MatterReaderFont = "newsreader" | "roboto" | "comic" | "georgia";

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
const MATTER_APPEND_UPLOAD_SESSION_KEY = "open_matter_append_uploader";
const MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY =
  "matter_uploader_prefill_context";
const MATTER_READER_FONT_SESSION_KEY = "matter_reader_font";
const MATTER_BRIEF_ANIMATION_KEY = "matter_brief_animation_signature";
const MATTER_UPLOAD_MAX_FILES = 5;
const MATTER_UPLOAD_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MATTER_UPLOAD_MAX_PAGES = 20;
const GROUND_ANALYSIS_INITIAL_FACT_COUNT = 3;
const MATTER_JOB_POLL_INTERVAL_MS = 5000;
const GROUND_ANALYSIS_POLL_INTERVAL_MS = 5000;
const ATLAS_STATE_POLL_INTERVAL_MS = 10000;
const CLASSIFICATION_CONTINUATION_POLL_ATTEMPTS = 36;

const clipText = (value: string, limit = 180) => {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
};

const getDraftCheckpointEyebrow = (
  checkpoint: DraftGenerationCheckpoint | null,
) => {
  const status = String(checkpoint?.status || checkpoint?.readinessStatus || "").trim();
  if (status === "review_ready_with_optional_inputs" || status === "review_ready") {
    return "Review draft available";
  }
  if (status === "blocked") {
    return "Draft blocked";
  }
  return "Input required";
};

const normalizeInline = (value: string) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const formatUnknownLabel = (value: unknown) => {
  if (typeof value === "string") return normalizeInline(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return normalizeInline(String(value));
  }
  if (value && typeof value === "object") {
    const candidate = value as {
      label?: unknown;
      title?: unknown;
      name?: unknown;
      description?: unknown;
      reason?: unknown;
      value?: unknown;
      marker?: unknown;
      text?: unknown;
      section?: unknown;
      warning_type?: unknown;
    };
    const parts = [
      typeof candidate.label === "string" ? candidate.label : "",
      typeof candidate.title === "string" ? candidate.title : "",
      typeof candidate.name === "string" ? candidate.name : "",
      typeof candidate.description === "string" ? candidate.description : "",
      typeof candidate.reason === "string" ? candidate.reason : "",
      typeof candidate.value === "string" ? candidate.value : "",
      typeof candidate.marker === "string" ? candidate.marker : "",
      typeof candidate.text === "string" ? candidate.text : "",
      typeof candidate.section === "string" ? candidate.section : "",
      typeof candidate.warning_type === "string" ? candidate.warning_type : "",
    ]
      .map((item) => normalizeInline(item))
      .filter(Boolean);
    if (parts.length) return parts.join(" — ");
    try {
      return normalizeInline(JSON.stringify(value));
    } catch {
      return "";
    }
  }
  return "";
};

const formatSummaryTypeLabel = (value: string) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "full") return "Full Summary";
  if (normalized === "limited") return "Limited Summary";
  if (normalized === "blocked") return "Blocked";
  if (normalized === "needs_review") return "Needs Review";
  if (normalized === "processing") return "Processing";
  return "Processing";
};

const dedupeEvidenceItems = (
  items: EvidenceReference["evidenceItems"],
): EvidenceReference["evidenceItems"] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      String(item.documentName || "").trim().toLowerCase(),
      item.pageNumber == null ? "" : String(item.pageNumber),
      String(item.section || "").trim().toLowerCase(),
      normalizeInline(item.excerpt).toLowerCase(),
      String(item.slot || "").trim().toLowerCase(),
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildEvidenceReferenceFromSourceRefs = (
  refs: Array<{
    documentName: string;
    pageNumber: number | null;
    section: string | null;
    excerpt: string;
    slot: string;
    confidence: "high" | "medium" | "low";
    evidenceAnswerId?: string;
    sourceUrl?: string | null;
  }>,
): EvidenceReference | null => {
  const evidenceItems = dedupeEvidenceItems(
    refs
      .map((ref, index) => ({
        id: `derived_evidence_${index}`,
        evidenceAnswerId:
          String(ref.evidenceAnswerId || "").trim() || `derived_evidence_${index}`,
        documentName: String(ref.documentName || "").trim(),
        pageNumber:
          typeof ref.pageNumber === "number" && Number.isFinite(ref.pageNumber)
            ? ref.pageNumber
            : null,
        section: String(ref.section || "").trim() || null,
        excerpt: normalizeInline(ref.excerpt),
        slot: String(ref.slot || "record excerpt").trim() || "record excerpt",
        confidence: ref.confidence,
        sourceUrl: String(ref.sourceUrl || "").trim() || null,
      }))
      .filter((item) => item.documentName && item.excerpt),
  );
  if (!evidenceItems.length) return null;
  const grouped = new Map<string, string[]>();
  for (const item of evidenceItems) {
    const title = item.documentName;
    const existing = grouped.get(title) || [];
    existing.push(item.id);
    grouped.set(title, existing);
  }
  return {
    evidenceItems,
    citationGroups: Array.from(grouped.entries()).map(([title, evidenceIds]) => ({
      id: `citation_group_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      title,
      evidenceIds,
    })),
  };
};

const formatAtlasLabel = (value: string) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const buildHighlightedSummary = (
  text: string,
  extraTerms: string[] = [],
): ReactNode => {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const candidateTerms = [
    ...extraTerms,
    "Master Services Agreement",
    "termination for cause",
    "written notice",
    "cure period",
    "material default",
    "delivery delay",
    "refund obligations",
    "arbitration",
    "governing law",
    "similar cases",
    "critical gap",
  ]
    .map((term) => String(term || "").trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (!candidateTerms.length) return normalized;
  const escapedTerms = candidateTerms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (!escapedTerms) return normalized;
  const matcher = new RegExp(`(${escapedTerms})`, "gi");
  const termSet = new Set(candidateTerms.map((term) => term.toLowerCase()));
  const parts = normalized.split(matcher);
  return parts.map((part, index) =>
    termSet.has(String(part || "").toLowerCase()) ? (
      <strong key={`summary-part-${index}`}>{part}</strong>
    ) : (
      <Fragment key={`summary-part-${index}`}>{part}</Fragment>
    ),
  );
};

const splitReadableParagraphs = (value: string) =>
  String(value || "")
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map((item) => normalizeInline(item))
    .filter(Boolean);

const useTypewriterText = (
  text: string,
  options?: {
    enabled?: boolean;
    speed?: number;
    startDelayMs?: number;
    chunkSize?: number;
  },
) => {
  const enabled = options?.enabled !== false;
  const speed = options?.speed ?? 12;
  const startDelayMs = options?.startDelayMs ?? 0;
  const chunkSize = Math.max(1, Math.floor(options?.chunkSize ?? 3));
  const [visibleLength, setVisibleLength] = useState(
    enabled ? 0 : String(text || "").length,
  );
  const normalizedText = String(text || "");

  useEffect(() => {
    if (!enabled) {
      setVisibleLength(normalizedText.length);
      return;
    }
    setVisibleLength(0);
    let cancelled = false;
    let timeoutId = 0;
    let intervalId = 0;
    const start = () => {
      intervalId = window.setInterval(() => {
        setVisibleLength((current) => {
          if (cancelled) return current;
          if (current >= normalizedText.length) {
            window.clearInterval(intervalId);
            return current;
          }
          const next = Math.min(normalizedText.length, current + chunkSize);
          if (next >= normalizedText.length) {
            window.clearInterval(intervalId);
          }
          return next;
        });
      }, speed);
    };
    if (startDelayMs > 0) {
      timeoutId = window.setTimeout(start, startDelayMs);
    } else {
      start();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [chunkSize, enabled, normalizedText, speed, startDelayMs]);

  return normalizedText.slice(0, visibleLength);
};

const useTypewriterList = (
  items: string[],
  options?: {
    enabled?: boolean;
    speed?: number;
    startDelayMs?: number;
    chunkSize?: number;
  },
) => {
  const enabled = options?.enabled !== false;
  const speed = options?.speed ?? 10;
  const startDelayMs = options?.startDelayMs ?? 0;
  const chunkSize = Math.max(1, Math.floor(options?.chunkSize ?? 3));
  const normalizedItems = useMemo(
    () => items.map((item) => String(item || "")),
    [items],
  );
  const totalLength = useMemo(
    () =>
      normalizedItems.reduce(
        (sum, item, index) => sum + item.length + (index > 0 ? 1 : 0),
        0,
      ),
    [normalizedItems],
  );
  const [visibleChars, setVisibleChars] = useState(enabled ? 0 : totalLength);

  useEffect(() => {
    if (!enabled) {
      setVisibleChars(totalLength);
      return;
    }
    setVisibleChars(0);
    let cancelled = false;
    let timeoutId = 0;
    let intervalId = 0;
    const start = () => {
      intervalId = window.setInterval(() => {
        setVisibleChars((current) => {
          if (cancelled) return current;
          if (current >= totalLength) {
            window.clearInterval(intervalId);
            return current;
          }
          const next = Math.min(totalLength, current + chunkSize);
          if (next >= totalLength) {
            window.clearInterval(intervalId);
          }
          return next;
        });
      }, speed);
    };
    if (startDelayMs > 0) {
      timeoutId = window.setTimeout(start, startDelayMs);
    } else {
      start();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [chunkSize, enabled, speed, startDelayMs, totalLength]);

  return useMemo(() => {
    if (!enabled) return normalizedItems;
    let remaining = visibleChars;
    return normalizedItems.map((item, index) => {
      const separatorCost = index > 0 ? 1 : 0;
      if (remaining <= 0) return "";
      if (remaining <= separatorCost) {
        remaining = 0;
        return "";
      }
      remaining -= separatorCost;
      const visible = item.slice(0, Math.max(0, remaining));
      remaining = Math.max(0, remaining - item.length);
      return visible;
    });
  }, [enabled, normalizedItems, visibleChars]);
};

const formatSupportLevelLabel = (value: string) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "supported") return "Supported";
  if (normalized === "conditional") return "Conditional";
  if (normalized === "unsupported") return "Unsupported";
  return "Unclear";
};

const getMatterIntelligenceStatuses = (
  result: MatterProcessedResult | null | undefined,
) => result?.matter?.intelligence_statuses || {};

const isClassificationContinuationProcessing = (
  result: MatterProcessedResult | null | undefined,
) => {
  const statuses = getMatterIntelligenceStatuses(result);
  return [
    statuses.law_generation,
    statuses.law_verification,
    statuses.inference_generation,
    statuses.inference_verification,
    statuses.next_step_planner,
    statuses.debrief_generation,
    statuses.debrief_verification,
  ].some((status) => status === "processing");
};

type SourceViewerState = {
  fileName: string;
  documentId: string;
  blocks: PageAwareBlock[];
  highlightBlockId: string | null;
  highlightText: string;
  matterId: string;
};

type CaseViewerState = {
  title: string;
  officialViewerUrl: string;
  officialDocumentUrl: string;
  officialSourceType: "pdf" | "html";
  sourceCourt: string;
  pageNumber: number | null;
  relevantExcerpt: string;
  relevantExcerptTitle: string;
  officialCitation: string;
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

type MatterWorkspaceTab =
  | "overview"
  | "facts"
  | "evidence"
  | "drafts"
  | "timeline"
  | "people";

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

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderEmphasizedInlineText = (text: string, terms: string[]) => {
  const normalizedText = normalizeInline(text);
  const normalizedTerms = Array.from(
    new Set(
      (Array.isArray(terms) ? terms : [])
        .map((item) => normalizeInline(item))
        .filter((item) => item.length >= 4),
    ),
  ).sort((left, right) => right.length - left.length);

  if (!normalizedText || !normalizedTerms.length) {
    return normalizedText;
  }

  const pattern = new RegExp(
    `(${normalizedTerms.map((item) => escapeRegExp(item)).join("|")})`,
    "gi",
  );
  const parts = normalizedText.split(pattern);

  if (parts.length <= 1) return normalizedText;

  return parts.map((part, index) =>
    normalizedTerms.some(
      (term) => term.toLowerCase() === part.toLowerCase(),
    ) ? (
      <mark key={`emphasis-${index}`} className="matterInlineEmphasis">
        {part}
      </mark>
    ) : (
      <span key={`plain-${index}`}>{part}</span>
    ),
  );
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
  const names = fromRefs.length
    ? fromRefs
    : splitSourceNames(point.sourceDocument);
  return names.filter((name, index, list) => list.indexOf(name) === index);
};

const sourceRefMatchesFile = (
  sourceRef: MatterSignalSourceRef | undefined,
  sourceName: string,
) => {
  const refFileName = String(
    sourceRef?.file_name || sourceRef?.document_id || "",
  )
    .trim()
    .toLowerCase();
  const normalizedSource = String(sourceName || "")
    .trim()
    .toLowerCase();
  return (
    Boolean(refFileName && normalizedSource) &&
    refFileName.includes(normalizedSource)
  );
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
    mergeMatterAtlasLatest,
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
  const [isEditingMatterTitle, setIsEditingMatterTitle] = useState(false);
  const [matterTitleDraft, setMatterTitleDraft] = useState("");
  const [isSavingMatterTitle, setIsSavingMatterTitle] = useState(false);
  const [matterTitleError, setMatterTitleError] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingMatter, setIsDeletingMatter] = useState(false);
  const [selectedReaderFont, setSelectedReaderFont] =
    useState<MatterReaderFont>(() => {
      const saved =
        typeof window !== "undefined"
          ? window.localStorage.getItem(MATTER_READER_FONT_SESSION_KEY)
          : "";
      if (
        saved === "newsreader" ||
        saved === "roboto" ||
        saved === "comic" ||
        saved === "georgia"
      ) {
        return saved;
      }
      return "newsreader";
    });
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
  const [
    isConfirmingSecondaryClassification,
    setIsConfirmingSecondaryClassification,
  ] = useState(false);
  const [classificationTagInput, setClassificationTagInput] = useState("");
  const [isSavingClassificationTag, setIsSavingClassificationTag] =
    useState(false);
  const [briefAcceptError, setBriefAcceptError] = useState("");
  const [isGroundAnalysisExpanded, setIsGroundAnalysisExpanded] =
    useState(false);
  const [activeMatterTab, setActiveMatterTab] =
    useState<MatterWorkspaceTab>("overview");
  const [expandedFactIds, setExpandedFactIds] = useState<
    Record<string, boolean>
  >({});
  const [showLowRelevanceDrafts, setShowLowRelevanceDrafts] = useState(false);
  const [isMatterChatOpen, setIsMatterChatOpen] = useState(false);
  const [matterChatMode, setMatterChatMode] = useState<SearchBarMode>("normal");
  const [matterChatMessages, setMatterChatMessages] = useState<
    MatterChatMessage[]
  >([]);
  const [isMatterChatSubmitting, setIsMatterChatSubmitting] = useState(false);
  const [matterChatError, setMatterChatError] = useState("");
  const [orientationSnapshotsByMatterId] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [
    summaryGenerationStateByMatterId,
    setSummaryGenerationStateByMatterId,
  ] = useState<Record<string, { running: boolean; error: string }>>({});
  const [workflowSelectionIdByMatterId, setWorkflowSelectionIdByMatterId] =
    useState<Record<string, string>>({});
  const [workflowOverrideNoteByMatterId, setWorkflowOverrideNoteByMatterId] =
    useState<Record<string, string>>({});
  const [
    workflowConfirmationStateByMatterId,
    setWorkflowConfirmationStateByMatterId,
  ] = useState<Record<string, { submitting: boolean; error: string }>>({});
  const [atlasTransitionStateByMatterId, setAtlasTransitionStateByMatterId] =
    useState<Record<string, "post-confirm" | "post-clarification">>({});
  const [activeProgressVariantIndex, setActiveProgressVariantIndex] =
    useState(0);

  useEffect(() => {
    if (conversationOpenRequest > 0) {
      setIsMatterChatOpen(true);
    }
  }, [conversationOpenRequest]);
  useEffect(() => {
    setExpandedFactIds({});
    setShowLowRelevanceDrafts(false);
  }, [activeMatter?.id]);
  const [matterSearchResults, setMatterSearchResults] = useState<
    ContextCoreSearchResult[]
  >([]);
  const [matterSearchError, setMatterSearchError] = useState("");
  const [matterSearchInfo, setMatterSearchInfo] = useState("");
  const autoStartedAtlasMatterIdsRef = useRef<Set<string>>(new Set());
  const atlasRunRequestsRef = useRef<Partial<Record<string, Promise<void>>>>(
    {},
  );
  const atlasFullRefreshRequestsRef = useRef<
    Partial<Record<string, Promise<void>>>
  >({});
  const atlasAvailabilityChecksRef = useRef<
    Partial<Record<string, Promise<boolean>>>
  >({});
  const [sourceViewer, setSourceViewer] = useState<SourceViewerState | null>(
    null,
  );
  const [caseViewer, setCaseViewer] = useState<CaseViewerState | null>(null);
  const [draftRecommendations, setDraftRecommendations] =
    useState<MatterDraftRecommendations | null>(null);
  const [isLoadingDraftRecommendations, setIsLoadingDraftRecommendations] =
    useState(false);
  const [draftRecommendationError, setDraftRecommendationError] = useState("");
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
  const [expandedSummaryIssueIds, setExpandedSummaryIssueIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedNextStepIds, setExpandedNextStepIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedCaseIds, setExpandedCaseIds] = useState<
    Record<string, boolean>
  >({});
  const [isBriefDetailModalOpen, setIsBriefDetailModalOpen] = useState(false);
  const [briefRevealStage, setBriefRevealStage] = useState(3);
  const [shouldAnimateBriefSections, setShouldAnimateBriefSections] =
    useState(false);
  const [clarificationDraftAnswers, setClarificationDraftAnswers] = useState<
    Record<string, string>
  >({});
  const [
    activeClarificationQuestionIndex,
    setActiveClarificationQuestionIndex,
  ] = useState(0);
  const [isClarificationAdvancing, setIsClarificationAdvancing] =
    useState(false);
  const [clarificationAdvanceMessage, setClarificationAdvanceMessage] =
    useState("Saving your answer and moving to the next question.");
  const [isSubmittingClarification, setIsSubmittingClarification] =
    useState(false);
  const [clarificationSubmitError, setClarificationSubmitError] = useState("");
  const [draftGenerationCheckpoint, setDraftGenerationCheckpoint] =
    useState<(DraftGenerationCheckpoint & { threadId: string }) | null>(null);
  const [draftGenerationAnswers, setDraftGenerationAnswers] = useState<
    Record<string, string>
  >({});
  const [isSubmittingDraftGeneration, setIsSubmittingDraftGeneration] =
    useState(false);
  const [draftGenerationError, setDraftGenerationError] = useState("");
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const lastMatterJobPollAtRef = useRef<Record<string, number>>({});
  const lastGroundAnalysisPollAtRef = useRef<Record<string, number>>({});
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
  const activeLegalBriefArtifact =
    activeMatter?.executiveSummary ||
    activeMatter?.latestExecutiveSummary?.summary ||
    null;
  const activeAtlasRecognition =
    ((activeMatter?.atlasBaseRecognition ||
      null) as AtlasBaseRecognitionResult | null) || null;
  const activeAtlasConfirmation =
    ((activeMatter?.atlasWorkflowConfirmation ||
      null) as AtlasWorkflowConfirmation | null) || null;
  const activeAtlasCheckpoint =
    ((activeMatter?.atlasGapCheckpoint || null) as AtlasGapCheckpoint | null) ||
    null;
  const activeAtlasDeciderResearch =
    ((activeMatter?.atlasDeciderResearch ||
      null) as AtlasDeciderResearchResult | null) || null;
  const activeAtlasCaseResearch =
    ((activeMatter?.atlasCaseResearch ||
      null) as AtlasCaseResearchResult | null) || null;
  const activeAtlasNextSteps =
    ((activeMatter?.atlasNextSteps || null) as AtlasNextStepsAnalysis | null) ||
    null;
  const activeAtlasMatterBrief =
    ((activeMatter?.atlasMatterBrief || null) as AtlasMatterBrief | null) ||
    null;
  const activeFrontendBrief =
    ((activeMatter?.frontendBrief ||
      activeMatter?.latestFrontendBrief?.summary ||
      null) as FrontendBriefArtifact | null) || null;
  const activeBriefArtifact = activeLegalBriefArtifact;
  const activeOverview = activeLegalBriefArtifact?.overview || null;
  const activeDetailedBrief = activeLegalBriefArtifact?.detailedBrief || null;
  const activeClarificationCheckpoint =
    ((activeMatter?.clarificationCheckpoint ||
      activeMatter?.analysis_state?.pendingClarification ||
      null) as ClarificationCheckpoint | null) || null;
  const activeAnalysisState = activeMatter?.analysis_state || null;
  const isAtlasMatterFlow = Boolean(
    activeAtlasRecognition ||
    activeAtlasConfirmation ||
    activeAtlasCheckpoint ||
    activeAtlasDeciderResearch ||
    activeAtlasCaseResearch ||
    activeAtlasNextSteps ||
    activeAtlasMatterBrief,
  );
  const activeOrientationSnapshot = activeMatter
    ? orientationSnapshotsByMatterId[activeMatter.id] || null
    : null;
  const activeSummaryRunState = activeMatter
    ? summaryGenerationStateByMatterId[activeMatter.id] || {
        running: false,
        error: "",
      }
    : { running: false, error: "" };
  const activeWorkflowConfirmationState = activeMatter
    ? workflowConfirmationStateByMatterId[activeMatter.id] || {
        submitting: false,
        error: "",
      }
    : { submitting: false, error: "" };
  const popupFileLimit =
    uploadPopupMode === "append"
      ? appendRemainingSlots
      : MATTER_UPLOAD_MAX_FILES;
  const activeWorkflowSelectionId = activeMatter?.id
    ? workflowSelectionIdByMatterId[activeMatter.id] ||
      activeAtlasRecognition?.primaryWorkflowId ||
      activeAtlasRecognition?.candidateWorkflows?.[0]?.workflowId ||
      ""
    : "";
  const activeWorkflowOverrideNote = activeMatter?.id
    ? workflowOverrideNoteByMatterId[activeMatter.id] || ""
    : "";
  const activeAtlasTransitionState = activeMatter?.id
    ? atlasTransitionStateByMatterId[activeMatter.id] || null
    : null;
  const isAddFilesDisabled =
    !activeMatter ||
    isAppendingMatterFiles ||
    isUploadingMatter ||
    appendRemainingSlots <= 0 ||
    isActiveMockMatter;
  const matterHeading = useMemo(() => {
    const extractedPartyNames = Array.isArray(
      activeMatter?.extractedFields?.parties,
    )
      ? activeMatter.extractedFields.parties
          .map((party) => String(party?.name || "").trim())
          .filter(Boolean)
      : [];
    const uniquePartyNames = extractedPartyNames.filter(
      (name, index, list) => list.indexOf(name) === index,
    );
    if (uniquePartyNames.length >= 2) {
      return `${uniquePartyNames[0]} v. ${uniquePartyNames[1]}`;
    }
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
  useEffect(() => {
    setMatterTitleDraft(matterHeading);
    setMatterTitleError("");
    setIsEditingMatterTitle(false);
  }, [activeMatter?.id, matterHeading]);
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
  const briefMetaSource = String(
    activeMatter?.accumulatedBriefMeta &&
      typeof activeMatter.accumulatedBriefMeta === "object" &&
      "source" in activeMatter.accumulatedBriefMeta
      ? (activeMatter.accumulatedBriefMeta as Record<string, unknown>).source ||
          ""
      : "",
  ).trim();
  const briefEvidenceCount =
    activeMatter?.accumulatedBriefMeta &&
    typeof activeMatter.accumulatedBriefMeta === "object" &&
    "evidence_count" in activeMatter.accumulatedBriefMeta
      ? Number(
          (activeMatter.accumulatedBriefMeta as Record<string, unknown>)
            .evidence_count || 0,
        )
      : 0;
  const isBriefIndexReadinessPending =
    briefDisplayPayload?.brief_type === "pending_index_readiness" ||
    briefNextAction === "wait_for_index_readiness" ||
    (activeMatter?.accumulatedBriefReadiness?.ready === false &&
      Array.isArray(activeMatter?.accumulatedBriefReadiness?.missing) &&
      activeMatter.accumulatedBriefReadiness.missing.includes(
        "index_readiness",
      ));
  const isContextCoreEvidenceGap =
    !isBriefIndexReadinessPending &&
    briefMetaSource === "contextcore" &&
    briefDisplayPayload?.decision === "query_for_user" &&
    (briefEvidenceCount === 0 ||
      briefQuestions.some((question) =>
        String(question).startsWith("No evidence found for:"),
      ));
  const isBriefQueryRequired =
    !isBriefIndexReadinessPending &&
    !isContextCoreEvidenceGap &&
    briefMetaSource !== "contextcore" &&
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
                sourceDocument: String(
                  pointRecord?.source_document || "",
                ).trim(),
                reason: String(pointRecord?.reason || "").trim(),
                pointType: String(pointRecord?.point_type || "").trim(),
                sourcePosture: String(pointRecord?.source_posture || "").trim(),
                certainty: String(
                  pointRecord?.certainty || pointRecord?.confidence || "",
                )
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
            (profile as { document_type?: unknown }).document_type || "unknown",
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
        .map((item) => formatUnknownLabel(item))
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
  const groundAnalysisCards = useMemo(() => {
    const rawGroundCards = Array.isArray(groundAnalysis?.cards)
      ? (groundAnalysis.cards as GroundAnalysisRawCard[])
      : [];
    const fallbackFactCards =
      rawGroundCards.length ||
      !Array.isArray(secondaryAnalysis?.extracted_facts)
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
              Math.min(1, Number(factRecord.verification?.similarity || 0.9)),
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
          card?.law_text == null ? null : String(card.law_text || "").trim(),
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
            ? card.next_steps.recommended_next_steps.map(
                (step: GroundAnalysisRawStep) => ({
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
                }),
              )
            : [],
          primaryDraftingAction:
            card?.next_steps?.primary_drafting_action == null
              ? null
              : {
                  label: String(
                    card.next_steps.primary_drafting_action?.label || "",
                  ).trim(),
                  draftType:
                    card.next_steps.primary_drafting_action?.draft_type == null
                      ? null
                      : String(
                          card.next_steps.primary_drafting_action?.draft_type ||
                            "",
                        ).trim() || null,
                  templateKey:
                    card.next_steps.primary_drafting_action?.template_key ==
                    null
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
              lawBindingId: String(card.law_card.law_binding_id || "").trim(),
              title: String(card.law_card.title || "").trim(),
              sourceUrl: String(card.law_card.source_url || "").trim(),
              sourceDomain: String(card.law_card.source_domain || "").trim(),
              authorityType: String(card.law_card.authority_type || "").trim(),
              bindingStrength: String(
                card.law_card.binding_strength || "",
              ).trim(),
              bindingExplanation: String(
                card.law_card.binding_explanation || "",
              ).trim(),
              application: String(card.law_card.application || "").trim(),
              verificationStatus: String(
                card.law_card.verification_status || "",
              ).trim(),
            };
          }
          return null;
        })(),
        legalRules: Array.isArray(card?.legal_rules) ? card.legal_rules : [],
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
        sourceRefs: Array.isArray(card?.source_refs) ? card.source_refs : [],
      }))
      .filter((card) => card.id && card.title && card.factText);
  }, [groundAnalysis?.cards, secondaryAnalysis?.extracted_facts]);
  const activeEvidenceReference = useMemo<EvidenceReference | null>(() => {
    if (activeLegalBriefArtifact?.evidenceReference?.evidenceItems?.length) {
      return activeLegalBriefArtifact.evidenceReference;
    }

    const derivedRefs: Array<{
      documentName: string;
      pageNumber: number | null;
      section: string | null;
      excerpt: string;
      slot: string;
      confidence: "high" | "medium" | "low";
      evidenceAnswerId?: string;
      sourceUrl?: string | null;
    }> = [];

    for (const point of briefPoints) {
      for (const sourceRef of point.sourceRefs) {
        derivedRefs.push({
          documentName: String(
            sourceRef.fileName || point.sourceDocument || "Matter record",
          ).trim(),
          pageNumber: sourceRef.pageStart,
          section: null,
          excerpt:
            String(sourceRef.verbatimBasis || "").trim() ||
            String(point.detail || "").trim(),
          slot: String(point.heading || "Brief point").trim() || "Brief point",
          confidence:
            point.certainty === "high" || point.certainty === "low"
              ? point.certainty
              : "medium",
          evidenceAnswerId: point.id,
        });
      }
    }

    if (Array.isArray(secondaryAnalysis?.extracted_facts)) {
      secondaryAnalysis.extracted_facts.forEach((fact, index) => {
        const factRecord = fact as {
          fact_id?: string;
          assertion?: string;
          source_refs?: MatterSignalSourceRef[];
        };
        const sourceRefs = Array.isArray(factRecord.source_refs)
          ? factRecord.source_refs
          : [];
        sourceRefs.forEach((sourceRef) => {
          derivedRefs.push({
            documentName: String(sourceRef.file_name || "Matter record").trim(),
            pageNumber:
              typeof sourceRef.page === "number" && Number.isFinite(sourceRef.page)
                ? sourceRef.page
                : null,
            section:
              String(sourceRef.section_id || sourceRef.clause_id || "").trim() ||
              null,
            excerpt:
              String(sourceRef.quote || sourceRef.fact || "").trim() ||
              String(factRecord.assertion || "").trim(),
            slot: "Extracted fact",
            confidence: "medium",
            evidenceAnswerId:
              String(factRecord.fact_id || "").trim() || `secondary_fact_${index}`,
          });
        });
      });
    }

    for (const card of groundAnalysisCards) {
      for (const sourceRef of card.sourceRefs) {
        derivedRefs.push({
          documentName: String(sourceRef.file_name || "Matter record").trim(),
          pageNumber:
            typeof sourceRef.page === "number" && Number.isFinite(sourceRef.page)
              ? sourceRef.page
              : null,
          section:
            String(sourceRef.section_id || sourceRef.clause_id || "").trim() ||
            null,
          excerpt:
            String(sourceRef.quote || sourceRef.fact || "").trim() ||
            String(card.factText || "").trim(),
          slot: String(card.title || "Ground analysis").trim() || "Ground analysis",
          confidence: "medium",
          evidenceAnswerId: card.id,
        });
      }
    }

    const signalPayloads = Array.isArray(activeMatter?.documentSignalPayloads)
      ? activeMatter.documentSignalPayloads
      : [];
    signalPayloads.forEach((payload, payloadIndex) => {
      const groups = [
        ...(Array.isArray(payload.possible_grounds)
          ? payload.possible_grounds.map((item) => ({
              label:
                String(item.title || "Possible ground").trim() ||
                "Possible ground",
              refs: Array.isArray(item.supporting_fact_refs)
                ? item.supporting_fact_refs
                : [],
            }))
          : []),
        ...(Array.isArray(payload.open_issues)
          ? payload.open_issues.map((item) => ({
              label: String(item.title || "Open issue").trim() || "Open issue",
              refs: Array.isArray(item.source_refs) ? item.source_refs : [],
            }))
          : []),
        ...(Array.isArray(payload.drafting_implications)
          ? payload.drafting_implications.map((item) => ({
              label:
                String(
                  item.title ||
                    item.suggested_action_label ||
                    "Drafting implication",
                ).trim() || "Drafting implication",
              refs: Array.isArray(item.source_refs) ? item.source_refs : [],
            }))
          : []),
      ];

      groups.forEach((group, groupIndex) => {
        group.refs.forEach((sourceRef) => {
          derivedRefs.push({
            documentName: String(
              sourceRef.file_name || payload.file_name || "Matter record",
            ).trim(),
            pageNumber:
              typeof sourceRef.page === "number" && Number.isFinite(sourceRef.page)
                ? sourceRef.page
                : null,
            section:
              String(sourceRef.section_id || sourceRef.clause_id || "").trim() ||
              null,
            excerpt:
              String(sourceRef.quote || sourceRef.fact || "").trim() || group.label,
            slot: group.label,
            confidence: "medium",
            evidenceAnswerId: `signal_${payloadIndex}_${groupIndex}`,
          });
        });
      });
    });

    if (Array.isArray(activeAtlasCaseResearch?.similarCases)) {
      activeAtlasCaseResearch.similarCases.forEach((item, index) => {
        const title = String(item?.title || "").trim();
        const citation = String(item?.officialCitation || "").trim();
        const sourceCourt = String(item?.sourceCourt || "").trim();
        const excerpt = normalizeInline(
          String(
            item?.relevantExcerpt ||
              item?.holding ||
              item?.legalQuestion ||
              item?.facts ||
              item?.note ||
              "",
          ),
        );
        if (!title || !excerpt) return;
        derivedRefs.push({
          documentName: title,
          pageNumber:
            typeof item?.pageNumber === "number" && Number.isFinite(item.pageNumber)
              ? item.pageNumber
              : null,
          section: citation || sourceCourt || null,
          excerpt,
          slot: "Similar case authority",
          confidence: "high",
          evidenceAnswerId: `atlas_case_${index}`,
          sourceUrl:
            String(
              item?.officialViewerUrl ||
                item?.officialDocumentUrl ||
                item?.referenceUrl ||
                "",
            ).trim() || null,
        });
      });
    }

    return buildEvidenceReferenceFromSourceRefs(derivedRefs);
  }, [
    activeAtlasCaseResearch?.similarCases,
    activeLegalBriefArtifact?.evidenceReference,
    activeMatter?.documentSignalPayloads,
    briefPoints,
    groundAnalysisCards,
    secondaryAnalysis?.extracted_facts,
  ]);
  const hasHiddenGroundAnalysisCards =
    groundAnalysisCards.length > GROUND_ANALYSIS_INITIAL_FACT_COUNT;
  const visibleGroundAnalysisCards = isGroundAnalysisExpanded
    ? groundAnalysisCards
    : groundAnalysisCards.slice(0, GROUND_ANALYSIS_INITIAL_FACT_COUNT);
  const hiddenGroundAnalysisCardCount = Math.max(
    0,
    groundAnalysisCards.length - visibleGroundAnalysisCards.length,
  );
  const isMatterStepBusy =
    isContinuingContextCore || isConfirmingSecondaryClassification;
  const detectedDocumentIdentity = normalizeInline(
    String(
      (
        activeOrientationSnapshot as {
          initialOrientation?: { documentIdentity?: string };
        } | null
      )?.initialOrientation?.documentIdentity || "",
    ),
  );
  const summaryIssues = Array.isArray(activeDetailedBrief?.issueAnalysis)
    ? activeDetailedBrief.issueAnalysis
    : [];
  const analysisReferenceCount =
    summaryIssues.length +
    (Array.isArray(activeDetailedBrief?.contractualFramework)
      ? activeDetailedBrief.contractualFramework.length
      : 0) +
    (Array.isArray(activeDetailedBrief?.recommendedActions)
      ? activeDetailedBrief.recommendedActions.length
      : 0) +
    briefPoints.length +
    groundAnalysisCards.length +
    secondaryVerifiedFactCount +
    (normalizeInline(String(activeFrontendBrief?.summary || "")).length ? 1 : 0) +
    (normalizeInline(String(activeAtlasMatterBrief?.brief || "")).length ? 1 : 0);
  const missingProofItems = useMemo(() => {
    if (activeAtlasMatterBrief?.remainingGaps?.length) {
      return activeAtlasMatterBrief.remainingGaps
        .map((item) => formatUnknownLabel(item))
        .filter(Boolean);
    }
    if (activeAtlasCheckpoint?.gapClassification?.factualProofMissing?.length) {
      return activeAtlasCheckpoint.gapClassification.factualProofMissing
        .map((item) => formatUnknownLabel(item))
        .filter(Boolean);
    }
    if (activeAtlasCheckpoint?.missingWorkflowRequirements?.length) {
      return activeAtlasCheckpoint.missingWorkflowRequirements
        .map((item) => formatUnknownLabel(item))
        .filter(Boolean);
    }
    return (activeOverview?.gapsToClose || []).map((item) =>
      normalizeInline(`${item.label}${item.reason ? ` — ${item.reason}` : ""}`),
    );
  }, [
    activeAtlasCheckpoint?.gapClassification?.factualProofMissing,
    activeAtlasCheckpoint?.missingWorkflowRequirements,
    activeAtlasMatterBrief?.remainingGaps,
    activeOverview?.gapsToClose,
  ]);
  const activeFrontendSummary = useMemo(
    () => String(activeFrontendBrief?.summary || "").trim(),
    [activeFrontendBrief?.summary],
  );
  const activeAtlasSummary = useMemo(
    () =>
      String(
        activeAtlasMatterBrief?.summaryBrief || activeAtlasMatterBrief?.brief || "",
      ).trim(),
    [activeAtlasMatterBrief?.brief, activeAtlasMatterBrief?.summaryBrief],
  );
  const atlasDraftQueue = useMemo(
    () =>
      Array.isArray(activeAtlasNextSteps?.draftQueue)
        ? activeAtlasNextSteps.draftQueue
        : [],
    [activeAtlasNextSteps?.draftQueue],
  );
  const activePrimarySummary = activeAtlasSummary || activeFrontendSummary;
  const activeBriefAnimationSignature = useMemo(() => {
    if (!activeMatter?.id || !activePrimarySummary) return "";
    const latestAtlasMeta =
      activeMatter?.latestAtlasMatterBrief &&
      typeof activeMatter.latestAtlasMatterBrief === "object"
        ? (activeMatter.latestAtlasMatterBrief as {
            version?: number;
            created_at?: string;
          })
        : null;
    const latestFrontendMeta =
      activeMatter?.latestFrontendBrief &&
      typeof activeMatter.latestFrontendBrief === "object"
        ? activeMatter.latestFrontendBrief
        : null;
    if (activeAtlasMatterBrief) {
      return [
        activeMatter.id,
        "atlas",
        String(latestAtlasMeta?.version || ""),
        String(latestAtlasMeta?.created_at || ""),
        String(activeAtlasMatterBrief.workflowId || ""),
        String(
          activeAtlasMatterBrief.summaryBrief || activeAtlasMatterBrief.brief || "",
        ),
      ].join("::");
    }
    if (activeFrontendBrief) {
      return [
        activeMatter.id,
        "frontend",
        String(
          activeFrontendBrief.version || latestFrontendMeta?.version || "",
        ),
        String(
          activeFrontendBrief.createdAt || latestFrontendMeta?.created_at || "",
        ),
        String(activeFrontendBrief.title || ""),
        String(activeFrontendBrief.summary || ""),
      ].join("::");
    }
    return [activeMatter.id, "fallback", activePrimarySummary].join("::");
  }, [
    activeAtlasMatterBrief,
    activeFrontendBrief,
    activeMatter?.id,
    activeMatter?.latestAtlasMatterBrief,
    activeMatter?.latestFrontendBrief,
    activePrimarySummary,
  ]);
  const activeSummaryTitle =
    activeAtlasMatterBrief?.usedWorkflow?.name ||
    activeFrontendBrief?.title ||
    activeOverview?.headline ||
    "Matter brief";
  const activeWorkflowDisplayName =
    activeAtlasRecognition?.primaryWorkflowName ||
    activeAtlasRecognition?.candidateWorkflows?.find(
      (candidate) => candidate.workflowId === activeWorkflowSelectionId,
    )?.workflowName ||
    formatAtlasLabel(activeWorkflowSelectionId);
  const activePracticeAreaDisplayName =
    activeAtlasRecognition?.primaryAreaName ||
    activeAtlasRecognition?.candidateWorkflows?.find(
      (candidate) => candidate.workflowId === activeWorkflowSelectionId,
    )?.areaName ||
    "";
  const summaryHighlightTerms = useMemo(
    () =>
      [
        activeAtlasMatterBrief?.usedWorkflow?.name || "",
        activePracticeAreaDisplayName,
        "termination for cause",
        "written notice",
        "cure period",
        "material default",
        "delivery delay",
        "refund obligations",
        "arbitration",
      ].filter(Boolean),
    [activeAtlasMatterBrief?.usedWorkflow?.name, activePracticeAreaDisplayName],
  );
  const atlasSimilarCases = Array.isArray(activeAtlasCaseResearch?.similarCases)
    ? activeAtlasCaseResearch.similarCases
    : [];
  const visibleDraftDependencies = (items: string[]) =>
    (Array.isArray(items) ? items : []).filter((item) => {
      const normalized = normalizeInline(item);
      if (!normalized) return false;
      return !/^(action|draft|system)_[0-9a-z_:-]+$/i.test(normalized);
    });
  useEffect(() => {
    if (!activeMatter?.id || !activeBriefAnimationSignature) {
      setShouldAnimateBriefSections(false);
      setBriefRevealStage(3);
      return;
    }
    const storageKey = `${MATTER_BRIEF_ANIMATION_KEY}:${activeMatter.id}`;
    const savedSignature =
      typeof window !== "undefined"
        ? window.localStorage.getItem(storageKey)
        : "";
    if (savedSignature === activeBriefAnimationSignature) {
      setShouldAnimateBriefSections(false);
      setBriefRevealStage(3);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, activeBriefAnimationSignature);
    }
    setShouldAnimateBriefSections(true);
    setBriefRevealStage(1);
  }, [activeBriefAnimationSignature, activeMatter?.id]);
  const typedPrimarySummary = useTypewriterText(activePrimarySummary, {
    enabled: Boolean(activePrimarySummary) && shouldAnimateBriefSections,
    speed: 4,
    startDelayMs: 40,
    chunkSize: 5,
  });
  const typedMissingProofItems = useTypewriterList(missingProofItems, {
    enabled:
      shouldAnimateBriefSections &&
      briefRevealStage >= 2 &&
      missingProofItems.length > 0,
    speed: 4,
    startDelayMs: 100,
    chunkSize: 4,
  });
  const typedAtlasCaseTitles = useTypewriterList(
    atlasSimilarCases.map((item) => String(item.title || "")),
    {
      enabled:
        shouldAnimateBriefSections &&
        briefRevealStage >= 3 &&
        atlasSimilarCases.length > 0,
      speed: 4,
      startDelayMs: 160,
      chunkSize: 4,
    },
  );
  useEffect(() => {
    if (!shouldAnimateBriefSections) return;
    if (briefRevealStage !== 1) return;
    if (typedPrimarySummary.length < activePrimarySummary.length) return;
    const timeoutId = window.setTimeout(() => {
      if (missingProofItems.length) {
        setBriefRevealStage(2);
      } else if (atlasSimilarCases.length) {
        setBriefRevealStage(3);
      } else {
        setBriefRevealStage(3);
        setShouldAnimateBriefSections(false);
      }
    }, 260);
    return () => window.clearTimeout(timeoutId);
  }, [
    activePrimarySummary.length,
    atlasSimilarCases.length,
    briefRevealStage,
    missingProofItems.length,
    shouldAnimateBriefSections,
    typedPrimarySummary.length,
  ]);
  useEffect(() => {
    if (!shouldAnimateBriefSections) return;
    if (briefRevealStage !== 2) return;
    const typedMissingComplete =
      typedMissingProofItems.filter(Boolean).length ===
        missingProofItems.length &&
      typedMissingProofItems.every(
        (item, index) => item.length >= (missingProofItems[index] || "").length,
      );
    if (!typedMissingComplete) return;
    const timeoutId = window.setTimeout(() => {
      if (atlasSimilarCases.length) {
        setBriefRevealStage(3);
      } else {
        setShouldAnimateBriefSections(false);
      }
    }, 240);
    return () => window.clearTimeout(timeoutId);
  }, [
    atlasSimilarCases.length,
    briefRevealStage,
    missingProofItems,
    shouldAnimateBriefSections,
    typedMissingProofItems,
  ]);
  useEffect(() => {
    if (!shouldAnimateBriefSections) return;
    if (briefRevealStage !== 3) return;
    if (!atlasSimilarCases.length) {
      setShouldAnimateBriefSections(false);
      return;
    }
    const typedCasesComplete =
      typedAtlasCaseTitles.filter(Boolean).length ===
        atlasSimilarCases.length &&
      typedAtlasCaseTitles.every(
        (item, index) =>
          item.length >= String(atlasSimilarCases[index]?.title || "").length,
      );
    if (!typedCasesComplete) return;
    const timeoutId = window.setTimeout(() => {
      setShouldAnimateBriefSections(false);
    }, 220);
    return () => window.clearTimeout(timeoutId);
  }, [
    atlasSimilarCases,
    briefRevealStage,
    shouldAnimateBriefSections,
    typedAtlasCaseTitles,
  ]);
  useEffect(() => {
    window.localStorage.setItem(
      MATTER_READER_FONT_SESSION_KEY,
      selectedReaderFont,
    );
  }, [selectedReaderFont]);
  const readerFontOptions: Array<{
    value: MatterReaderFont;
    label: string;
  }> = [
    { value: "newsreader", label: "Newsreader" },
    { value: "roboto", label: "Roboto" },
    { value: "comic", label: "Comic Sans" },
    { value: "georgia", label: "Georgia" },
  ];
  const readerFontClass =
    activeMatterTab === "drafts"
      ? ""
      : `matterReaderFont-${selectedReaderFont}`;
  const renderAtlasSimilarCases = (
    cases: typeof atlasSimilarCases,
    emptyMessage = "Comparable case references will appear here once research is ready.",
  ) => {
    if (!cases.length) {
      return <p className="matterDebriefEmpty">{emptyMessage}</p>;
    }
    return (
      <div className="matterCaseList">
        {cases.map((item, index) => {
          const caseIdBase =
            item.officialViewerUrl ||
            item.officialDocumentUrl ||
            item.referenceUrl ||
            item.title ||
            `atlas-case-${index}`;
          const caseId = `${caseIdBase}-${index}`;
          const isExpanded = Boolean(expandedCaseIds[caseId]);
          const summaryText = normalizeInline(
            String(item.relevantExcerpt || item.note || ""),
          );
          const typedTitle = shouldAnimateBriefSections
            ? typedAtlasCaseTitles[index] || ""
            : String(item.title || "");
          return (
            <article className="matterCaseRow" key={caseId}>
              <div className="matterCaseRowMain">
                <button
                  type="button"
                  className="matterCaseTitleLink"
                  onClick={() => {
                    const targetUrl =
                      item.officialViewerUrl || item.officialDocumentUrl;
                    if (targetUrl) {
                      window.open(targetUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  {typedTitle || item.title}
                </button>
                {summaryText ? (
                  <button
                    type="button"
                    className="matterCaseSummaryToggle"
                    onClick={() =>
                      setExpandedCaseIds((current) => ({
                        ...current,
                        [caseId]: !current[caseId],
                      }))
                    }
                    aria-expanded={isExpanded}
                  >
                    <span>Summary</span>
                    {isExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </button>
                ) : null}
              </div>
              {isExpanded && summaryText ? (
                <div className="matterCaseSummary">
                  {item.facts ? (
                    <p>
                      <strong>Facts:</strong> {item.facts}
                    </p>
                  ) : null}
                  {item.legalQuestion ? (
                    <p>
                      <strong>Legal question:</strong> {item.legalQuestion}
                    </p>
                  ) : null}
                  {item.holding ? (
                    <p>
                      <strong>Holding:</strong> {item.holding}
                    </p>
                  ) : null}
                  {item.relevanceToMatter ? (
                    <p>
                      <strong>Why it matters:</strong> {item.relevanceToMatter}
                    </p>
                  ) : null}
                  <p>{summaryText}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  };
  const renderAtlasNextSteps = () => {
    if (!activeAtlasNextSteps) {
      return (
        <p className="matterDebriefEmpty">
          Next procedural steps and draft suggestions will appear once the
          research pass is complete.
        </p>
      );
    }

    const draftQueue = Array.isArray(activeAtlasNextSteps.draftQueue)
      ? activeAtlasNextSteps.draftQueue
      : [];
    const whyTheseNext = Array.isArray(activeAtlasNextSteps.whyTheseNext)
      ? activeAtlasNextSteps.whyTheseNext
      : [];
    const blockingItems = Array.isArray(activeAtlasNextSteps.blockingItems)
      ? activeAtlasNextSteps.blockingItems
      : [];
    const ambiguities = Array.isArray(activeAtlasNextSteps.ambiguities)
      ? activeAtlasNextSteps.ambiguities
      : [];
    const askAiEligibleQuestions = Array.isArray(
      activeAtlasNextSteps.askAiEligibleQuestions,
    )
      ? activeAtlasNextSteps.askAiEligibleQuestions
      : [];
    const nextStepHighlightTerms = [
      "blocked",
      "ready",
      "generated",
      "cure period",
      "termination",
      "notice",
      "refund",
      "written notice",
      "material default",
      "delivery deadlines",
      "clause",
      "proof",
      "upload",
      "SOW",
      activeAtlasMatterBrief?.usedWorkflow?.name || "",
    ].filter(Boolean);
    return (
      <div className="matterNextStepsStack">
        {!draftQueue.length ? (
          <article className="matterNextStepsPanel">
            <div className="matterNextStepCardHead">
              <strong>
                Workflow-grounded follow-up is still being assembled
              </strong>
            </div>
            {blockingItems.length ? (
              <>
                <p>
                  The current matter still has blocking prerequisites before a
                  stronger drafting queue can be suggested.
                </p>
                <ul className="matterBulletList">
                  {blockingItems.map((item) => (
                    <li key={`blocking-${item}`}>{item}</li>
                  ))}
                </ul>
              </>
            ) : whyTheseNext.length ? (
              <ul className="matterBulletList">
                {whyTheseNext.map((item) => (
                  <li key={`why-${item}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>
                The workflow and similar-case pass completed, but the next-step
                plan did not return a usable sequence yet.
              </p>
            )}
            {activeAtlasNextSteps.researchTrace?.error ? (
              <small className="matterNextStepDraftType">
                {activeAtlasNextSteps.researchTrace.error}
              </small>
            ) : null}
          </article>
        ) : null}
        {blockingItems.length || ambiguities.length ? (
          <article className="matterNextStepsPanel">
            <div className="matterNextStepCardHead">
              <strong>What still needs support</strong>
            </div>
            {blockingItems.length ? (
              <ul className="matterBulletList">
                {blockingItems.map((item) => (
                  <li key={`next-step-blocker-${item}`}>
                    {renderEmphasizedInlineText(item, nextStepHighlightTerms)}
                  </li>
                ))}
              </ul>
            ) : null}
            {ambiguities.length ? (
              <>
                <p className="matterNextStepsPreview">
                  Ambiguities still present in the prompt or uploaded record:
                </p>
                <ul className="matterBulletList">
                  {ambiguities.map((item) => (
                    <li key={`next-step-ambiguity-${item}`}>
                      {renderEmphasizedInlineText(item, nextStepHighlightTerms)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {askAiEligibleQuestions.length ? (
              <div className="matterNextStepsAccordionBody">
                <ul className="matterBulletList">
                  {askAiEligibleQuestions.map((item) => (
                    <li key={item.id}>
                      <strong>{item.question}</strong>
                      {item.whyItMatters ? ` ${item.whyItMatters}` : ""}
                      <span className="matterChecklistActionButtonWrap">
                        <button
                          type="button"
                          className="matterChecklistAskAiButton"
                          onClick={() => openMissingProofInMatterChat(item.question)}
                          aria-label="Ask AI for help"
                        >
                          Ask AI
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ) : null}
        {draftQueue.length ? (
          <article className="matterNextStepsPanel">
            <div className="matterNextStepsStack">
              {draftQueue.map((item) => (
                (() => {
                  const dependencies = visibleDraftDependencies(item.unblocksWhen);
                  return (
                <article
                  className="matterNextStepsPanel matterNextStepsStaticCard isDraft"
                  key={item.id}
                >
                  <div className="matterNextStepCardHead">
                    <strong>{item.title}</strong>
                    <Button
                      type="button"
                      className="matterStartDraftingBtn"
                      onClick={() =>
                        void startAtlasDraftGeneration(
                          {
                            id: item.id,
                            draftType: item.draftType,
                            title: item.title,
                          },
                          "overview",
                        )
                      }
                    >
                      Start drafting
                    </Button>
                  </div>
                  <p className="matterNextStepsPreview">
                    {renderEmphasizedInlineText(
                      item.description,
                      nextStepHighlightTerms,
                    )}
                  </p>
                  {dependencies.length ? (
                    <div className="matterNextStepsAccordionBody">
                      <ul className="matterBulletList">
                        {dependencies.map((dependency: string) => (
                          <li key={`${item.id}-${dependency}`}>
                            {renderEmphasizedInlineText(
                              dependency,
                              nextStepHighlightTerms,
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </article>
                  );
                })()
              ))}
            </div>
          </article>
        ) : null}
        {whyTheseNext.length ? (
          <article className="matterNextStepsPanel">
            <article className="matterNextStepsPanel matterNextStepsAccordion">
              <button
                type="button"
                className="matterNextStepsAccordionToggle"
                onClick={() =>
                  setExpandedNextStepIds((current) => ({
                    ...current,
                    ["why-these-steps-matter"]: !current["why-these-steps-matter"],
                  }))
                }
                aria-expanded={Boolean(
                  expandedNextStepIds["why-these-steps-matter"],
                )}
              >
                <div className="matterNextStepCardHead">
                  <strong>Why these steps matter</strong>
                  <div className="matterNextStepsAccordionMeta">
                    {Boolean(expandedNextStepIds["why-these-steps-matter"]) ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                  </div>
                </div>
                <p className="matterNextStepsPreview">
                  <span className="matterNextStepsPreviewHint">
                    Expand to see the reasoning behind the draft order.
                  </span>
                </p>
              </button>
              {Boolean(expandedNextStepIds["why-these-steps-matter"]) ? (
                <div className="matterNextStepsAccordionBody">
                  <ul className="matterBulletList">
                    {whyTheseNext.map((item) => (
                      <li key={`why-next-${item}`}>
                        {renderEmphasizedInlineText(item, nextStepHighlightTerms)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          </article>
        ) : null}
      </div>
    );
  };
  const atlasRunningStatuses = new Set([
    "orientation_running",
    "evidence_matrix_running",
    "base_recognition_running",
    "workflow_gap_check_running",
    "decider_research_running",
    "case_research_running",
    "next_steps_running",
    "atlas_brief_running",
    "atlas_cancelling",
  ]);
  const atlasPauseStatuses = new Set([
    "workflow_confirmation_needed",
    "workflow_gap_checkpoint",
  ]);
  const atlasStatusFeedConfig: Record<
    string,
    {
      label: string;
      message: string;
      rotationMessages?: string[];
    }
  > = {
    orientation_running: {
      label: "Reading matter record",
      message: "Reading the uploaded record, matter goal, and document structure.",
      rotationMessages: [
        "Reading the uploaded record and matter goal.",
        "Identifying document type, parties, clauses, and section headings.",
        "Building the initial matter orientation from the uploaded files.",
      ],
    },
    base_recognition_running: {
      label: "Matching workflow",
      message: "Comparing the uploaded matter against the atlas workflows.",
      rotationMessages: [
        "Comparing the matter against atlas workflows.",
        "Scoring the closest procedural match.",
        "Ranking the most likely workflow candidates from the atlas.",
      ],
    },
    workflow_confirmation_needed: {
      label: "Classification verification",
      message:
        "Verifying the Atlas classification before the research branches begin.",
      rotationMessages: [
        "Checking whether the selected Atlas workflow fits the uploaded record.",
        "Verifying the classification before deeper research begins.",
      ],
    },
    decider_research_running: {
      label: "Parallel research branches",
      message:
        "Building the draft path and the case-search path in parallel from the uploaded matter and selected Atlas workflow.",
      rotationMessages: [
        "Reading the uploaded matter packet and selected Atlas workflow.",
        "Determining likely draft actions and checking for material ambiguities.",
        "Generating issue-focused case queries from the matter and prompt.",
      ],
    },
    case_research_running: {
      label: "Case verification",
      message:
        "Filtering search results down to verified official cases relevant to this matter.",
      rotationMessages: [
        "Searching only the approved case-source domains.",
        "Verifying which official cases are truly analogous.",
        "Discarding weak or generic references before drafting the brief.",
      ],
    },
    next_steps_running: {
      label: "Next steps analysis",
      message:
        "Grounding the likely next procedural steps and draft actions in similar official cases.",
      rotationMessages: [
        "Sequencing the likely next procedural steps.",
        "Checking what can be drafted now and what remains blocked.",
        "Comparing the current matter against similar case patterns.",
      ],
    },
    atlas_brief_running: {
      label: "Brief synthesis",
      message:
        "Preparing the summary brief and detailed agent brief from the matter, cases, and draft queue.",
      rotationMessages: [
        "Combining document grounding, case verification, and draft sequencing.",
        "Writing the user-facing summary and detailed agent brief.",
        "Finalizing the cases and drafts panels for review.",
      ],
    },
    atlas_brief_ready: {
      label: "Matter brief ready",
      message: "The atlas-backed matter brief is ready.",
      rotationMessages: ["The atlas-backed matter brief is ready."],
    },
    atlas_cancelling: {
      label: "Cancelling research",
      message: "Stopping atlas research after the current stage finishes.",
      rotationMessages: [
        "Stopping the current research run.",
        "Wrapping up the active stage safely before cancellation.",
      ],
    },
    atlas_cancelled: {
      label: "Research cancelled",
      message: "Atlas research was cancelled before the brief was completed.",
      rotationMessages: ["Atlas research was cancelled."],
    },
    atlas_failed: {
      label: "Research failed",
      message: "Atlas research hit an error before the brief was completed.",
      rotationMessages: ["Atlas research hit an error before completion."],
    },
    atlas_needs_review: {
      label: "Needs review",
      message: "Atlas research completed with issues that need review.",
      rotationMessages: ["Atlas research completed with issues that need review."],
    },
  };
  const buildAtlasStatusOnlyFeed = (
    status: string,
  ): NonNullable<NonNullable<MatterRecord["analysis_state"]>["feed"]> => {
    const orderedIds = [
      "orientation_running",
      "base_recognition_running",
      "workflow_confirmation_needed",
      "decider_research_running",
      "case_research_running",
      "atlas_brief_running",
      "atlas_brief_ready",
      "atlas_cancelling",
      "atlas_cancelled",
      "atlas_failed",
      "atlas_needs_review",
    ];
    return orderedIds.map((id) => {
      const config = atlasStatusFeedConfig[id];
      const state =
        status === id
          ? "current"
          : orderedIds.indexOf(id) < orderedIds.indexOf(status)
            ? "done"
            : "waiting";
      return {
        id,
        label: config.label,
        state:
          id === "atlas_failed"
            ? status === id
              ? "attention"
              : state
            : state,
        message: config.message,
        rotationMessages: config.rotationMessages || [],
      };
    });
  };
  const isExtractionRunning =
    activeMatter?.status === "processing" ||
    activeMatter?.extractedFieldsStatus === "processing";
  const isIndexingRunning = activeMatterContextCore?.status === "processing";
  const hasOrientationSignals = Boolean(
    detectedDocumentIdentity ||
    activeAnalysisState?.whatWeFound?.length ||
    activeOrientationSnapshot,
  );
  const analysisProgressMessages = useMemo<AnalysisProgressMessage[]>(() => {
    const atlasStatus = String(activeAnalysisState?.status || "").trim();
    const atlasFeed =
      Array.isArray(activeAnalysisState?.feed) && activeAnalysisState.feed.length
        ? activeAnalysisState.feed
        : atlasStatusFeedConfig[atlasStatus]
          ? buildAtlasStatusOnlyFeed(atlasStatus)
          : null;
    if (Array.isArray(atlasFeed) && atlasFeed.length) {
      return atlasFeed.map((rawItem) => {
        const item = rawItem as {
          id: string;
          state: "done" | "current" | "waiting" | "attention";
          message: string;
          rotationMessages?: unknown[];
        };
        return {
          id: item.id,
          tone:
            item.state === "done"
              ? "done"
              : item.state === "attention"
                ? "current"
                : item.state === "current"
                  ? "current"
                  : "waiting",
          text: item.message,
          rotationMessages: Array.isArray(item.rotationMessages)
            ? item.rotationMessages
                .map((entry: unknown) => normalizeInline(String(entry || "")))
                .filter(Boolean)
            : [],
        };
      });
    }
    const messages: AnalysisProgressMessage[] = [];
    messages.push({
      id: "upload",
      tone: activeMatter ? "done" : "waiting",
      text: activeMatter
        ? "Documents received safely. We’ve saved the matter and started the review."
        : "Upload a document to begin the matter review.",
      rotationMessages: [],
    });
    messages.push({
      id: "read",
      tone:
        isExtractionRunning || isIndexingRunning
          ? "current"
          : activeMatter
            ? "done"
            : "waiting",
      text: isExtractionRunning
        ? "Reading document text, headings, dates, parties, and clause structure."
        : isIndexingRunning
          ? "Preparing the searchable record so evidence can be checked against the uploaded text."
          : "Searchable text is ready for matter analysis.",
      rotationMessages: isExtractionRunning
        ? [
            "Reading document text, headings, dates, parties, and clause structure.",
            "Converting the uploaded record into searchable text.",
          ]
        : isIndexingRunning
          ? [
              "Preparing the searchable record so evidence can be checked against the uploaded text.",
              "Indexing the uploaded material for evidence-backed retrieval.",
            ]
          : [],
    });
    messages.push({
      id: "understand",
      tone: hasOrientationSignals
        ? "done"
        : activeSummaryRunState.running
          ? "current"
          : activeMatter && !activePrimarySummary
            ? "current"
            : "waiting",
      text: detectedDocumentIdentity
        ? `Matter orientation complete. This appears to be ${detectedDocumentIdentity}.`
        : "Understanding the matter type and likely legal focus.",
      rotationMessages: [
        "Understanding the matter type and likely legal focus.",
        "Checking the document’s legal role and subject matter.",
      ],
    });
    messages.push({
      id: "verify",
      tone:
        activePrimarySummary || activeSummaryRunState.running
          ? missingProofItems.length
            ? "done"
            : "current"
          : hasOrientationSignals && !activePrimarySummary
            ? "current"
            : "waiting",
      text:
        missingProofItems.length > 0
          ? "Evidence review found contractual support, but some factual proof is still missing."
          : "Checking what the uploaded record actually supports and what remains unproven.",
      rotationMessages: [
        "Checking what the uploaded record actually supports and what remains unproven.",
        "Separating record-backed support from unresolved factual gaps.",
      ],
    });
    messages.push({
      id: "summary",
      tone: activeBriefArtifact
        ? "done"
        : activeSummaryRunState.running
          ? "current"
          : "waiting",
      text: activeBriefArtifact
        ? "The brief is ready. You can review the summary and open the detailed analysis."
        : "Preparing the executive brief. You can do something else and return when it is ready.",
      rotationMessages: activeBriefArtifact
        ? []
        : [
            "Preparing the executive brief. You can do something else and return when it is ready.",
            "Combining the workflow, evidence, and case research into a concise brief.",
          ],
    });
    return messages;
  }, [
    activeAnalysisState?.status,
    activeAnalysisState?.feed,
    activeBriefArtifact,
    activeMatter,
    activeMatter?.extractedFieldsStatus,
    activeMatter?.status,
    activeMatterContextCore?.status,
    activeSummaryRunState.running,
    detectedDocumentIdentity,
    hasOrientationSignals,
    isExtractionRunning,
    isIndexingRunning,
    missingProofItems.length,
  ]);
  const activeProgressMessage =
    analysisProgressMessages.find((message) => message.tone === "current") ||
    analysisProgressMessages.find((message) => message.tone === "waiting") ||
    null;
  const activeProgressDisplayText = activeProgressMessage
    ? (() => {
        const variants = Array.isArray(activeProgressMessage.rotationMessages)
          ? activeProgressMessage.rotationMessages
          : [];
        if (!variants.length) return activeProgressMessage.text;
        return (
          variants[activeProgressVariantIndex % variants.length] ||
          activeProgressMessage.text
        );
      })()
    : "";
  const shouldShowProgressThread =
    activeSummaryRunState.running ||
    (!activePrimarySummary && Boolean(activeMatter));
  const shouldShowWorkflowConfirmationState =
    Boolean(activeAtlasRecognition) &&
    !activeAtlasConfirmation?.selectedWorkflowId &&
    activeAnalysisState?.status === "workflow_confirmation_needed" &&
    activeAtlasTransitionState !== "post-confirm" &&
    !activePrimarySummary;
  const isAtlasCheckpointActionable =
    Boolean(activeAtlasCheckpoint) &&
    activeAnalysisState?.status === "workflow_gap_checkpoint";
  const shouldShowClarificationState =
    Boolean(
      isAtlasCheckpointActionable ||
      (!isAtlasMatterFlow &&
        activeClarificationCheckpoint &&
        activeClarificationCheckpoint?.status !== "ready_to_summarize"),
    ) &&
    activeAtlasTransitionState !== "post-clarification" &&
    !shouldShowWorkflowConfirmationState &&
    !activePrimarySummary;
  const activeQuestionSet =
    (isAtlasCheckpointActionable
      ? activeAtlasCheckpoint?.criticalQuestions
      : null) ||
    (!isAtlasMatterFlow ? activeClarificationCheckpoint?.questions : null) ||
    [];
  const isMatterResearchRunning =
    isClarificationAdvancing ||
    activeSummaryRunState.running ||
    isExtractionRunning ||
    isIndexingRunning ||
    Boolean(
      activeAnalysisState?.status &&
      atlasRunningStatuses.has(String(activeAnalysisState.status)),
    ) ||
    (!activePrimarySummary &&
      Boolean(activeMatter) &&
      !shouldShowClarificationState &&
      !shouldShowWorkflowConfirmationState &&
      !(
        activeAnalysisState?.status &&
        atlasPauseStatuses.has(String(activeAnalysisState.status))
      ));
  const isMatterStatePolling =
    Boolean(activeMatter?.id) &&
    (isExtractionRunning ||
      isIndexingRunning ||
      activeSummaryRunState.running ||
      Boolean(
        activeAnalysisState?.status &&
        atlasRunningStatuses.has(String(activeAnalysisState.status)),
      ));
  const clarificationQuestions = activeQuestionSet;
  const activeClarificationQuestion =
    clarificationQuestions[activeClarificationQuestionIndex] || null;
  const activeClarificationAnswerValue = activeClarificationQuestion
    ? clarificationDraftAnswers[activeClarificationQuestion.id] || ""
    : "";
  const canAdvanceClarificationQuestion = activeClarificationQuestion
    ? Boolean(String(activeClarificationAnswerValue || "").trim())
    : false;
  const researchWorkspaceTitle = activePrimarySummary
    ? "Matter brief ready"
    : shouldShowWorkflowConfirmationState
      ? "Associate has matched this matter to an atlas workflow"
      : shouldShowClarificationState
        ? "Associate needs a few targeted inputs"
        : "Associate is actively researching this matter";
  const researchWorkspaceSummary = activePrimarySummary
    ? "The short brief is ready below. Open it to review the full research, workflow grounding, and case analogs."
    : shouldShowWorkflowConfirmationState
      ? activeAtlasRecognition?.checkpoint?.messageToUser ||
        "Confirm the workflow match before deeper research starts."
      : shouldShowClarificationState
        ? (isAtlasCheckpointActionable
            ? activeAtlasCheckpoint?.messageToUser
            : null) ||
          activeClarificationCheckpoint?.messageToUser ||
          "The contract framework is visible, but a stronger conclusion needs a few answers or supporting records."
        : "The system is reading the record, mapping the matter type, checking what the documents actually support, and preparing the legal brief.";
  const researchWorkspaceStatusLabel = activePrimarySummary
    ? "brief ready"
    : shouldShowWorkflowConfirmationState
      ? "workflow confirmation"
      : shouldShowClarificationState
        ? "clarification checkpoint"
        : isMatterResearchRunning
          ? "live execution"
          : "research queued";
  const activeAnalysisStatus = String(activeAnalysisState?.status || "").trim();
  const canStartResearchFromUi =
    Boolean(activeMatter?.id) &&
    !isMockMatterId(activeMatter?.id || "") &&
    !activePrimarySummary &&
    !shouldShowWorkflowConfirmationState &&
    !shouldShowClarificationState &&
    !isMatterResearchRunning;
  const isResearchStartBlockedByPreparation =
    isExtractionRunning || isIndexingRunning;
  const researchStartButtonLabel =
    activeAnalysisStatus === "atlas_failed" ||
    activeAnalysisStatus === "atlas_cancelled"
      ? "Restart research"
      : "Start research";

  useEffect(() => {
    setActiveProgressVariantIndex(0);
    if (!activeProgressMessage?.rotationMessages?.length) return;
    const interval = window.setInterval(() => {
      setActiveProgressVariantIndex((current) => current + 1);
    }, 2200);
    return () => window.clearInterval(interval);
  }, [activeProgressMessage?.id, activeProgressMessage?.rotationMessages]);

  useEffect(() => {
    if (!activeMatter?.id || !isMatterStatePolling) return;
    const interval = window.setInterval(() => {
      const isAtlasPolling =
        Boolean(
          activeAnalysisState?.status &&
          atlasRunningStatuses.has(String(activeAnalysisState.status)),
        ) || Boolean(activeSummaryRunState.running);
      if (isAtlasPolling) {
        void refreshActiveAtlasMatterState(activeMatter.id);
        return;
      }
      void refreshMattersFromServer();
    }, ATLAS_STATE_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    activeAnalysisState?.status,
    activeMatter?.id,
    activeSummaryRunState.running,
    isMatterStatePolling,
    mergeMatterAtlasLatest,
  ]);

  useEffect(() => {
    if (!activeMatter?.id) return;
    const status = String(activeAnalysisState?.status || "").trim();
    if (
      !status ||
      status === "workflow_confirmation_needed" ||
      status === "workflow_gap_checkpoint"
    ) {
      return;
    }
    setAtlasTransitionStateByMatterId((current) => {
      if (!current[activeMatter.id]) return current;
      const next = { ...current };
      delete next[activeMatter.id];
      return next;
    });
  }, [activeAnalysisState?.status, activeMatter?.id]);

  useEffect(() => {
    if (!activeMatter?.id) return;
    const status = String(activeAnalysisState?.status || "").trim();
    const shouldStopLocalRun =
      Boolean(activePrimarySummary) ||
      status === "workflow_confirmation_needed" ||
      status === "workflow_gap_checkpoint" ||
      status === "atlas_brief_ready" ||
      status === "atlas_cancelled" ||
      status === "atlas_failed" ||
      status === "atlas_needs_review";
    if (!shouldStopLocalRun) return;
    setSummaryGenerationStateByMatterId((current) => {
      const entry = current[activeMatter.id];
      if (!entry?.running) return current;
      return {
        ...current,
        [activeMatter.id]: {
          ...entry,
          running: false,
          error:
            status === "atlas_failed"
              ? normalizeInline(
                  activeAnalysisState?.error ||
                    entry.error ||
                    "Matter atlas research failed.",
                )
              : entry.error,
        },
      };
    });
  }, [
    activeAnalysisState?.error,
    activeAnalysisState?.status,
    activeMatter?.id,
    activePrimarySummary,
  ]);

  useEffect(() => {
    if (!activeMatter?.id || isMockMatterId(activeMatter.id)) return;
    if (activePrimarySummary) return;
    if (activeSummaryRunState.running || isExtractionRunning || isIndexingRunning) {
      return;
    }
    if (activeAnalysisStatus) return;
    if (autoStartedAtlasMatterIdsRef.current.has(activeMatter.id)) return;
    autoStartedAtlasMatterIdsRef.current.add(activeMatter.id);
    void runMatterAtlasResearch(activeMatter.id);
  }, [
    activeAnalysisStatus,
    activeMatter?.id,
    activePrimarySummary,
    activeSummaryRunState.running,
    isExtractionRunning,
    isIndexingRunning,
  ]);

  useEffect(() => {
    const hasOpenPopup =
      isBriefDetailModalOpen ||
      Boolean(sourceViewer) ||
      Boolean(caseViewer) ||
      shouldShowWorkflowConfirmationState ||
      shouldShowClarificationState;
    if (!hasOpenPopup) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (caseViewer) {
        setCaseViewer(null);
        return;
      }
      if (sourceViewer) {
        setSourceViewer(null);
        return;
      }
      if (isBriefDetailModalOpen) {
        setIsBriefDetailModalOpen(false);
        return;
      }
      navigate("/");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    caseViewer,
    isBriefDetailModalOpen,
    navigate,
    shouldShowClarificationState,
    shouldShowWorkflowConfirmationState,
    sourceViewer,
  ]);

  useEffect(() => {
    setActiveClarificationQuestionIndex(0);
    setClarificationDraftAnswers({});
    setClarificationSubmitError("");
    setIsClarificationAdvancing(false);
    setClarificationAdvanceMessage(
      "Saving your answer and moving to the next question.",
    );
  }, [activeMatter?.id, activeClarificationCheckpoint?.matterId]);

  useEffect(() => {
    if (!activeMatter?.id) return;
    const fallbackWorkflowId =
      activeAtlasRecognition?.primaryWorkflowId ||
      activeAtlasRecognition?.candidateWorkflows?.[0]?.workflowId ||
      "";
    if (!fallbackWorkflowId) return;
    setWorkflowSelectionIdByMatterId((current) =>
      current[activeMatter.id]
        ? current
        : { ...current, [activeMatter.id]: fallbackWorkflowId },
    );
  }, [
    activeMatter?.id,
    activeAtlasRecognition?.primaryWorkflowId,
    activeAtlasRecognition?.candidateWorkflows,
  ]);

  useEffect(() => {
    if (activeMatterTab !== "facts") return;
    if (!groundAnalysisCards.length) return;
    const firstCardId = groundAnalysisCards[0]?.id;
    if (!firstCardId) return;
    setExpandedFactIds((prev) =>
      prev[firstCardId] ? prev : { ...prev, [firstCardId]: true },
    );
  }, [activeMatterTab, groundAnalysisCards]);

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
        buildApiUrl(
          `/api/matters/${encodeURIComponent(matterId)}/people/extract`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
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
      setActiveMatterTab("facts");

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
  const lowRelevanceDraftRecommendations = useMemo(
    () =>
      lockedDraftRecommendations.filter((recommendation) => {
        const score = Number(recommendation.readiness_score || 0);
        const matchedCount =
          (Array.isArray(recommendation.matched_documents)
            ? recommendation.matched_documents.length
            : 0) +
          (Array.isArray(recommendation.matched_facts)
            ? recommendation.matched_facts.length
            : 0);
        return score < 0.45 || matchedCount === 0;
      }),
    [lockedDraftRecommendations],
  );
  const primaryLockedDraftRecommendations = useMemo(
    () =>
      lockedDraftRecommendations.filter(
        (recommendation) =>
          !lowRelevanceDraftRecommendations.some(
            (candidate) => candidate.draft_key === recommendation.draft_key,
          ),
      ),
    [lockedDraftRecommendations, lowRelevanceDraftRecommendations],
  );
  const draftPanelItems = isAtlasMatterFlow
    ? atlasDraftQueue
    : draftRecommendationItems;
  const draftPanelCount = draftPanelItems.length;
  const factCoverageCount = analysisReferenceCount || 0;
  const workspaceTabs: Array<{
    id: MatterWorkspaceTab;
    label: string;
    count?: number;
  }> = [
    { id: "overview", label: "Overview" },
    {
      id: "facts",
      label: "Analysis",
      count: factCoverageCount,
    },
    {
      id: "evidence",
      label: "Evidence",
      count:
        activeEvidenceReference?.evidenceItems?.length ||
        activeAtlasCaseResearch?.similarCases?.length ||
        briefEvidenceCount ||
        0,
    },
    { id: "drafts", label: "Drafts", count: draftPanelCount },
    {
      id: "timeline",
      label: "Timeline",
      count:
        (isAtlasMatterFlow ? atlasDraftQueue.length : 0) ||
        briefPoints.length ||
        groundAnalysisCards.length,
    },
    { id: "people", label: "People", count: people.length },
  ];

  const timelineItems = useMemo(() => {
    if (isAtlasMatterFlow && atlasDraftQueue.length) {
      return atlasDraftQueue.slice(0, 8).map((item, index) => {
        const dependencyText = Array.isArray(item.unblocksWhen)
          ? item.unblocksWhen.join(" ")
          : "";
        const dependsText = Array.isArray(item.dependsOn)
          ? item.dependsOn.join(" ")
          : "";
        const when =
          index === 0
            ? "Start first"
            : /cure|notice|proof|upload|extract|support/i.test(
                  `${dependencyText} ${dependsText}`,
                )
              ? "After supporting material is in place"
              : /termination|expiry|uncured|non-cure/i.test(
                    `${item.title} ${item.description} ${dependencyText}`,
                  )
                ? "After prerequisite notice and cure steps"
                : "Next in sequence";
        return {
          id: `${item.id}-timeline`,
          title: item.title,
          detail: item.description,
          source: when,
          step: index + 1,
        };
      });
    }
    const fromBrief = briefPoints.slice(0, 6).map((point, index) => ({
      id: `${point.id}-timeline`,
      title: point.heading,
      detail: point.detail,
      source: getBriefPointSourceNames(point)[0] || point.sourceDocument || "",
      step: index + 1,
    }));
    if (fromBrief.length) return fromBrief;
    return groundAnalysisCards.slice(0, 6).map((card, index) => ({
      id: `${card.id}-timeline`,
      title: card.title,
      detail: card.factText,
        source: card.sourceFiles[0] || "",
        step: index + 1,
      }));
  }, [atlasDraftQueue, briefPoints, groundAnalysisCards, isAtlasMatterFlow]);
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
      activeMatter?.intelligence_statuses?.law_verification === "processing" ||
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
    let timeoutId: number | null = null;
    const matterKey = String(activeMatter.id || "");

    const pollForFields = async () => {
      try {
        lastMatterJobPollAtRef.current[matterKey] = Date.now();
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
          timeoutId = window.setTimeout(() => {
            void pollForFields();
          }, MATTER_JOB_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) markMatterJobExpired(activeMatter.id);
      }
    };

    const elapsedSinceLastPoll =
      Date.now() - (lastMatterJobPollAtRef.current[matterKey] || 0);
    const initialDelay = Math.max(
      0,
      MATTER_JOB_POLL_INTERVAL_MS - elapsedSinceLastPoll,
    );
    timeoutId = window.setTimeout(() => {
      void pollForFields();
    }, initialDelay);

    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
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
    const matterKey = String(activeMatter.id || "");

    const pollGroundAnalysis = async () => {
      if (cancelled || isRequestInFlight) return;
      isRequestInFlight = true;
      try {
        lastGroundAnalysisPollAtRef.current[matterKey] = Date.now();
        const response = await fetch(
          buildApiUrl(
            `/api/matters/${encodeURIComponent(activeMatter.id)}/ground-analysis?view=status`,
          ),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          statuses?: {
            generation?: string;
            verification?: string;
            law_generation?: string;
            law_verification?: string;
            inference_generation?: string;
            inference_verification?: string;
            next_step_planner?: string;
          };
          payload_ready?: boolean;
        };

        if (!response.ok || !payload.success) {
          return;
        }

        const shouldContinue =
          payload.statuses?.generation === "processing" ||
          payload.statuses?.verification === "processing" ||
          payload.statuses?.law_generation === "processing" ||
          payload.statuses?.law_verification === "processing" ||
          payload.statuses?.inference_generation === "processing" ||
          payload.statuses?.inference_verification === "processing" ||
          payload.statuses?.next_step_planner === "processing";

        if (!cancelled && !shouldContinue && payload.payload_ready) {
          const fullResponse = await fetch(
            buildApiUrl(
              `/api/matters/${encodeURIComponent(activeMatter.id)}/ground-analysis?view=full`,
            ),
          );
          const fullPayload = (await fullResponse.json()) as {
            success?: boolean;
            result?: MatterProcessedResult | null;
          };
          if (
            !cancelled &&
            fullResponse.ok &&
            fullPayload.success &&
            fullPayload.result
          ) {
            updateMatter(fullPayload.result);
          }
        }

        if (!cancelled && shouldContinue) {
          timeoutId = window.setTimeout(() => {
            void pollGroundAnalysis();
          }, GROUND_ANALYSIS_POLL_INTERVAL_MS);
        }
      } catch {
        // Ignore transient polling failures here; the main matter record remains usable.
      } finally {
        isRequestInFlight = false;
      }
    };

    const elapsedSinceLastPoll =
      Date.now() - (lastGroundAnalysisPollAtRef.current[matterKey] || 0);
    const initialDelay = Math.max(
      0,
      GROUND_ANALYSIS_POLL_INTERVAL_MS - elapsedSinceLastPoll,
    );
    timeoutId = window.setTimeout(() => {
      void pollGroundAnalysis();
    }, initialDelay);

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
      return payload.matters;
    }
    return null;
  };

  const pollMatterAfterClassificationConfirm = async (matterId: string) => {
    for (
      let attempt = 0;
      attempt < CLASSIFICATION_CONTINUATION_POLL_ATTEMPTS;
      attempt += 1
    ) {
      await sleep(MATTER_JOB_POLL_INTERVAL_MS);
      const matters = await refreshStoredMatters();
      const refreshedMatter = Array.isArray(matters)
        ? matters.find((item) => item?.matter?.id === matterId) || null
        : null;
      if (!refreshedMatter) continue;

      updateMatter(refreshedMatter);
      setActiveMatterTab("facts");

      if (!isClassificationContinuationProcessing(refreshedMatter)) {
        return refreshedMatter;
      }
    }

    return null;
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
    const shouldOpenAppendUploader = sessionStorage.getItem(
      MATTER_APPEND_UPLOAD_SESSION_KEY,
    );
    if (shouldOpenAppendUploader !== "1" || !activeMatter) return;
    const prefill = sessionStorage.getItem(
      MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY,
    );
    sessionStorage.removeItem(MATTER_APPEND_UPLOAD_SESSION_KEY);
    sessionStorage.removeItem(MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY);
    resetUploadPopupState();
    setUploadPopupMode("append");
    setUploadQuery(prefill || "");
    setIsUploadPopupOpen(true);
  }, [activeMatter]);

  useEffect(() => {
    const handleOpenUploader = () => {
      sessionStorage.removeItem(MATTER_UPLOAD_SESSION_KEY);
      openUploadPopup("create");
    };
    const handleOpenAppendUploader = () => {
      if (!activeMatter) return;
      const prefill = sessionStorage.getItem(
        MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY,
      );
      sessionStorage.removeItem(MATTER_APPEND_UPLOAD_SESSION_KEY);
      sessionStorage.removeItem(MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY);
      resetUploadPopupState();
      setUploadPopupMode("append");
      setUploadQuery(prefill || "");
      setIsUploadPopupOpen(true);
    };

    window.addEventListener("matter-uploader:open", handleOpenUploader);
    window.addEventListener(
      "matter-uploader:append-open",
      handleOpenAppendUploader,
    );
    return () => {
      window.removeEventListener("matter-uploader:open", handleOpenUploader);
      window.removeEventListener(
        "matter-uploader:append-open",
        handleOpenAppendUploader,
      );
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
      await sleep(MATTER_JOB_POLL_INTERVAL_MS);
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

  const shouldFetchFullAtlasPayload = (status: string) => {
    const normalized = String(status || "").trim();
    return (
      normalized === "workflow_confirmation_needed" ||
      normalized === "workflow_gap_checkpoint" ||
      normalized === "atlas_brief_ready" ||
      normalized === "atlas_cancelled" ||
      normalized === "atlas_failed" ||
      normalized === "atlas_needs_review"
    );
  };

  const refreshMattersFromServer = async () => {
    const response = await fetch(buildApiUrl("/api/matters"));
    const payload = (await response.json()) as {
      success?: boolean;
      matters?: MatterProcessedResult[];
    };
    if (!response.ok || !payload?.success) {
      throw new Error("Failed to refresh saved matters.");
    }
    setMattersFromServer(Array.isArray(payload.matters) ? payload.matters : []);
  };

  const refreshActiveAtlasMatterState = async (
    matterId: string,
    options?: { full?: boolean },
  ) => {
    const includeFull = options?.full === true;
    if (includeFull && atlasFullRefreshRequestsRef.current[matterId]) {
      return atlasFullRefreshRequestsRef.current[matterId];
    }
    const task = (async () => {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(matterId)}/atlas-research/latest?view=${includeFull ? "full" : "status"}`,
        ),
      );
      const payload = (await response.json()) as {
        success?: boolean;
        matter?: {
          status?: MatterRecord["status"];
          job_id?: string | null;
          versionFingerprint?: string | null;
          contextcore?: MatterRecord["contextcore"];
          intelligence_statuses?: MatterRecord["intelligence_statuses"];
          analysis_state?: MatterRecord["analysis_state"];
          classification?: MatterRecord["classification"];
          classification_meta?: MatterRecord["classification_meta"];
          extracted_fields_status?: MatterRecord["extractedFieldsStatus"];
          extracted_fields_error?: string | null;
        } | null;
        analysis_state?: MatterRecord["analysis_state"];
        status?: string;
        payload_ready?: boolean;
        baseRecognition?: AtlasBaseRecognitionResult | null;
        workflowConfirmation?: AtlasWorkflowConfirmation | null;
        gapCheckpoint?: AtlasGapCheckpoint | null;
        deciderResearch?: AtlasDeciderResearchResult | null;
        caseResearch?: AtlasCaseResearchResult | null;
        nextStepsAnalysis?: AtlasNextStepsAnalysis | null;
        brief?: AtlasMatterBrief | null;
        atlasUserInputs?: MatterProcessedResult["atlas_user_inputs"];
      };
      if (!response.ok || !payload?.success || !payload.matter) {
        throw new Error("Failed to refresh atlas matter state.");
      }

      const matterPatch: {
        status?: MatterRecord["status"];
        job_id?: string;
        versionFingerprint?: string | undefined;
        contextcore?: MatterRecord["contextcore"];
        intelligence_statuses?: MatterRecord["intelligence_statuses"];
        analysis_state?: MatterRecord["analysis_state"];
        classification?: MatterRecord["classification"];
        classification_meta?: MatterRecord["classification_meta"];
      } = {
        status: payload.matter.status,
        job_id: payload.matter.job_id || "",
        analysis_state: payload.analysis_state || payload.matter.analysis_state,
      };
      if (payload.matter.contextcore !== undefined) {
        matterPatch.contextcore = payload.matter.contextcore;
      }
      if (payload.matter.intelligence_statuses !== undefined) {
        matterPatch.intelligence_statuses = payload.matter.intelligence_statuses;
      }
      if (payload.matter.versionFingerprint !== undefined) {
        matterPatch.versionFingerprint =
          payload.matter.versionFingerprint || undefined;
      }
      if (payload.matter.classification !== undefined) {
        matterPatch.classification = payload.matter.classification;
      }
      if (payload.matter.classification_meta !== undefined) {
        matterPatch.classification_meta = payload.matter.classification_meta;
      }

      mergeMatterAtlasLatest(matterId, {
        matter: matterPatch,
        extractedFieldsStatus:
          payload.matter.extracted_fields_status || undefined,
        extractedFieldsError: payload.matter.extracted_fields_error,
        atlasBaseRecognition: includeFull ? payload.baseRecognition : undefined,
        atlasWorkflowConfirmation: includeFull
          ? payload.workflowConfirmation
          : undefined,
        atlasGapCheckpoint: includeFull ? payload.gapCheckpoint : undefined,
        atlasDeciderResearch: includeFull ? payload.deciderResearch : undefined,
        atlasCaseResearch: includeFull ? payload.caseResearch : undefined,
        atlasNextSteps: includeFull ? payload.nextStepsAnalysis : undefined,
        atlasMatterBrief: includeFull ? payload.brief : undefined,
        atlasUserInputs: includeFull ? payload.atlasUserInputs : undefined,
      });

      const latestStatus = String(
        payload.status ||
          payload.analysis_state?.status ||
          payload.matter.analysis_state?.status ||
          "",
      ).trim();
      if (
        !includeFull &&
        (payload.payload_ready || shouldFetchFullAtlasPayload(latestStatus))
      ) {
        await refreshActiveAtlasMatterState(matterId, { full: true });
      }
    })();
    if (!includeFull) {
      return task;
    }
    atlasFullRefreshRequestsRef.current[matterId] = task.finally(() => {
      delete atlasFullRefreshRequestsRef.current[matterId];
    });
    return atlasFullRefreshRequestsRef.current[matterId];
  };

  const waitForMatterAvailability = async (matterId: string) => {
    if (atlasAvailabilityChecksRef.current[matterId]) {
      return atlasAvailabilityChecksRef.current[matterId];
    }
    const task = (async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
          await refreshActiveAtlasMatterState(matterId, { full: true });
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Matter not ready yet.";
          if (!/not found/i.test(message)) {
            throw error;
          }
        }
        await sleep(500);
      }
      return false;
    })();
    atlasAvailabilityChecksRef.current[matterId] = task.finally(() => {
      delete atlasAvailabilityChecksRef.current[matterId];
    });
    return atlasAvailabilityChecksRef.current[matterId];
  };

  const runMatterAtlasResearch = async (
    matterId: string,
    options?: { continueWithLimitedResearch?: boolean },
  ) => {
    if (atlasRunRequestsRef.current[matterId]) {
      return atlasRunRequestsRef.current[matterId];
    }
    const task = (async () => {
      try {
        const isAvailable = await waitForMatterAvailability(matterId);
        if (!isAvailable) {
          throw new Error(
            "Matter was uploaded, but the research workspace is not ready yet. Please retry in a moment.",
          );
        }
        setSummaryGenerationStateByMatterId((current) => ({
          ...current,
          [matterId]: { running: true, error: "" },
        }));
        const response = await fetch(
          buildApiUrl(
            `/api/matters/${encodeURIComponent(matterId)}/atlas-research/run`,
          ),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              continueWithLimitedResearch: Boolean(
                options?.continueWithLimitedResearch,
              ),
            }),
          },
        );
        const payload = (await response.json()) as {
          success?: boolean;
          status?: string;
          recognition?: AtlasBaseRecognitionResult;
          checkpoint?: AtlasGapCheckpoint;
          brief?: AtlasMatterBrief;
          deciderResearch?: AtlasDeciderResearchResult;
          caseResearch?: AtlasCaseResearchResult;
          error?: string;
          meta?: Record<string, unknown>;
        };

        if (!response.ok || !payload?.success) {
          throw new Error(
            payload?.error || "Matter legal brief request failed.",
          );
        }

        await refreshMattersFromServer();
        if (payload.status === "needs_confirmation") {
          console.log("[atlas][base-recognition]", payload.recognition);
          return;
        }
        if (payload.status === "running") {
          return;
        }
        if (
          payload.status === "needs_user_input" ||
          payload.status === "needs_more_documents"
        ) {
          console.log("[atlas][gap-checkpoint]", payload.checkpoint);
          return;
        }
      } catch (error) {
        setSummaryGenerationStateByMatterId((current) => ({
          ...current,
          [matterId]: {
            running: false,
            error:
              error instanceof Error
                ? error.message
                : "Matter atlas research request failed.",
          },
        }));
        console.error("[atlas-research][failed]", error);
      }
    })();
    atlasRunRequestsRef.current[matterId] = task.finally(() => {
      delete atlasRunRequestsRef.current[matterId];
    });
    return atlasRunRequestsRef.current[matterId];
  };

  const cancelMatterAtlasResearch = async (matterId: string) => {
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(matterId)}/atlas-research/cancel`,
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
        error?: string;
        result?: MatterProcessedResult;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to cancel atlas research.");
      }
      await refreshActiveAtlasMatterState(matterId, { full: true });
      setSummaryGenerationStateByMatterId((current) => ({
        ...current,
        [matterId]: { running: false, error: "" },
      }));
      navigate("/");
    } catch (error) {
      setSummaryGenerationStateByMatterId((current) => ({
        ...current,
        [matterId]: {
          running: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to cancel atlas research.",
        },
      }));
    }
  };

  const startAtlasDraftGeneration = async (
    draftItem: {
      id?: string;
      draftType?: string;
      title: string;
    },
    requestedFrom: "overview" | "drafts",
  ) => {
    if (!activeMatter?.id) return;
    setDraftGenerationError("");
    navigate(
      `/drafting?matter=${encodeURIComponent(activeMatter.id)}&startDraft=${encodeURIComponent(
        draftItem.draftType || draftItem.title,
      )}&draftLabel=${encodeURIComponent(draftItem.title)}&requestedFrom=${encodeURIComponent(
        requestedFrom,
      )}&draftKey=${encodeURIComponent(draftItem.id || "")}`,
    );
  };

  const closeDraftGenerationCheckpoint = async () => {
    if (!activeMatter?.id || !draftGenerationCheckpoint?.threadId) {
      setDraftGenerationCheckpoint(null);
      setDraftGenerationAnswers({});
      return;
    }
    try {
      await cancelMatterDraftGeneration({
        matterId: activeMatter.id,
        threadId: draftGenerationCheckpoint.threadId,
      });
    } catch {
      // Best-effort cancel; local close should still succeed.
    }
    setDraftGenerationCheckpoint(null);
    setDraftGenerationAnswers({});
    setDraftGenerationError("");
  };

  const continueAtlasDraftGeneration = async (chosenAction: string) => {
    if (!activeMatter?.id || !draftGenerationCheckpoint?.threadId) return;
    try {
      setIsSubmittingDraftGeneration(true);
      setDraftGenerationError("");
      const answers = draftGenerationCheckpoint.questions
        .map((question) => {
          const raw = String(draftGenerationAnswers[question.id] || "").trim();
          if (!raw) return null;
          const answer =
            question.answerType === "yes_no"
              ? raw === "yes"
                ? true
                : raw === "no"
                  ? false
                  : raw
              : raw;
          return {
            questionId: question.id,
            answer,
            answerType: question.answerType,
          };
        })
        .filter(Boolean) as Array<{
        questionId: string;
        answer: string | boolean;
        answerType?: string;
      }>;
      const payload = await continueMatterDraftGeneration({
        matterId: activeMatter.id,
        threadId: draftGenerationCheckpoint.threadId,
        chosenAction,
        answers,
      });
      setDraftGenerationCheckpoint(null);
      setDraftGenerationAnswers({});
      navigate(
        `/drafting?draft=${encodeURIComponent(payload.draft.id)}&matter=${encodeURIComponent(activeMatter.id)}&mode=edit`,
      );
    } catch (error) {
      setDraftGenerationError(
        error instanceof Error
          ? error.message
          : "Failed to continue draft generation.",
      );
    } finally {
      setIsSubmittingDraftGeneration(false);
    }
  };

  const retryMatterAtlasRecognition = async (
    matterId: string,
    overrideNote = "",
  ) => {
    try {
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: { submitting: true, error: "" },
      }));
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(matterId)}/base-recognition`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            overrideNote: normalizeInline(overrideNote),
          }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        recognition?: AtlasBaseRecognitionResult;
        error?: string;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to retry categorization.");
      }
      await refreshMattersFromServer();
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: { submitting: false, error: "" },
      }));
      console.log("[atlas][base-recognition][retry]", payload.recognition);
      return payload.recognition || null;
    } catch (error) {
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: {
          submitting: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to retry categorization.",
        },
      }));
      return null;
    }
  };

  const confirmMatterAtlasWorkflow = async ({
    matterId,
    selectedWorkflowId,
    overrideNote,
  }: {
    matterId: string;
    selectedWorkflowId: string;
    overrideNote?: string;
  }) => {
    try {
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: { submitting: true, error: "" },
      }));
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(matterId)}/base-recognition/confirm`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedWorkflowId,
            overrideNote: normalizeInline(overrideNote || ""),
          }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to confirm the workflow.");
      }
      setAtlasTransitionStateByMatterId((current) => ({
        ...current,
        [matterId]: "post-confirm",
      }));
      setSummaryGenerationStateByMatterId((current) => ({
        ...current,
        [matterId]: { running: true, error: "" },
      }));
      await refreshMattersFromServer();
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: { submitting: false, error: "" },
      }));
      await runMatterAtlasResearch(matterId);
    } catch (error) {
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: {
          submitting: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to confirm the workflow.",
        },
      }));
    }
  };

  const submitMatterAtlasWorkflowClassification = async (matterId: string) => {
    const overrideNote = normalizeInline(
      workflowOverrideNoteByMatterId[matterId] || "",
    );
    let selectedWorkflowId = normalizeInline(
      activeAtlasRecognition?.primaryWorkflowId ||
        activeWorkflowSelectionId ||
        activeAtlasRecognition?.candidateWorkflows?.[0]?.workflowId ||
        "",
    );

    if (overrideNote) {
      const rerankedRecognition = await retryMatterAtlasRecognition(
        matterId,
        overrideNote,
      );
      selectedWorkflowId = normalizeInline(
        rerankedRecognition?.primaryWorkflowId ||
          rerankedRecognition?.candidateWorkflows?.[0]?.workflowId ||
          "",
      );
      if (!selectedWorkflowId) {
        setWorkflowConfirmationStateByMatterId((current) => ({
          ...current,
          [matterId]: {
            submitting: false,
            error:
              "Atlas could not find a close enough category and subcategory from that note.",
          },
        }));
        return;
      }
    }

    if (!selectedWorkflowId) {
      setWorkflowConfirmationStateByMatterId((current) => ({
        ...current,
        [matterId]: {
          submitting: false,
          error: "No atlas subcategory is available to confirm for this matter.",
        },
      }));
      return;
    }

    await confirmMatterAtlasWorkflow({
      matterId,
      selectedWorkflowId,
      overrideNote,
    });
  };

  const logMatterUnderstandingAgents = async (matterId: string) => {
    await runMatterAtlasResearch(matterId);
  };

  const submitClarificationAnswers = async (
    matterId: string,
    options?: { preserveLoader?: boolean },
  ) => {
    if (!activeClarificationCheckpoint?.questions?.length) return;
    try {
      setIsSubmittingClarification(true);
      setClarificationSubmitError("");
      if (!options?.preserveLoader) {
        setClarificationAdvanceMessage(
          "Using your answers to resume the research and prepare the next stage.",
        );
        setIsClarificationAdvancing(true);
      }
      const answers = activeClarificationCheckpoint.questions
        .map((question) => {
          const raw = String(
            clarificationDraftAnswers[question.id] || "",
          ).trim();
          if (!raw) return null;
          const normalizedAnswer =
            question.answerType === "yes_no"
              ? raw === "yes"
                ? true
                : raw === "no"
                  ? false
                  : raw
              : raw;
          return {
            questionId: question.id,
            answer: normalizedAnswer,
            answerType: question.answerType,
          };
        })
        .filter(Boolean);

      if (!answers.length) {
        throw new Error("Add at least one answer before submitting.");
      }

      const targetPath = `/api/matters/${encodeURIComponent(matterId)}/atlas-research/continue`;
      const response = await fetch(buildApiUrl(targetPath), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error || "Failed to save clarification answers.",
        );
      }
      setAtlasTransitionStateByMatterId((current) => ({
        ...current,
        [matterId]: "post-clarification",
      }));
      setSummaryGenerationStateByMatterId((current) => ({
        ...current,
        [matterId]: { running: true, error: "" },
      }));
      await refreshMattersFromServer();
      setClarificationDraftAnswers({});
      setActiveClarificationQuestionIndex(0);
      return;
    } catch (error) {
      setIsClarificationAdvancing(false);
      setClarificationSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to save clarification answers.",
      );
    } finally {
      setIsSubmittingClarification(false);
    }
  };

  const advanceClarificationQuestion = async (
    nextMessage = "Saving your answer and moving to the next question.",
  ) => {
    setClarificationAdvanceMessage(nextMessage);
    setIsClarificationAdvancing(true);
    await sleep(520);
    setActiveClarificationQuestionIndex((current) =>
      Math.min(current + 1, clarificationQuestions.length),
    );
    setIsClarificationAdvancing(false);
  };

  const continueWithLimitedSummary = async (matterId: string) => {
    try {
      setClarificationAdvanceMessage(
        "Continuing with a limited brief and resuming the research flow.",
      );
      setIsClarificationAdvancing(true);
      setAtlasTransitionStateByMatterId((current) => ({
        ...current,
        [matterId]: "post-clarification",
      }));
      const response = await fetch(
        buildApiUrl(
          `/api/matters/${encodeURIComponent(matterId)}/atlas-research/continue`,
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            answers: [],
            continueWithLimitedResearch: true,
          }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(
          payload?.error || "Failed to continue with a limited summary.",
        );
      }
      setSummaryGenerationStateByMatterId((current) => ({
        ...current,
        [matterId]: { running: true, error: "" },
      }));
      await refreshMattersFromServer();
    } catch {
      setIsClarificationAdvancing(false);
    }
  };

  const dismissAtlasOverlay = (
    matterId: string,
    transition: "post-confirm" | "post-clarification",
  ) => {
    setAtlasTransitionStateByMatterId((current) => ({
      ...current,
      [matterId]: transition,
    }));
    setIsClarificationAdvancing(false);
    setClarificationSubmitError("");
  };

  const handleClarificationAnswerAdvance = async (
    draftOverride?: Record<string, string>,
  ) => {
    if (!activeClarificationQuestion || !activeMatter?.id) return;
    const nextDraftAnswers = draftOverride || clarificationDraftAnswers;
    const nextIndex = Math.min(
      activeClarificationQuestionIndex + 1,
      clarificationQuestions.length,
    );
    const isLastQuestion = nextIndex >= clarificationQuestions.length;
    const answeredCount = clarificationQuestions.reduce((count, question) => {
      const value = String(nextDraftAnswers[question.id] || "").trim();
      return value ? count + 1 : count;
    }, 0);

    if (isLastQuestion && answeredCount > 0) {
      setClarificationAdvanceMessage(
        "All answers received. Associate is resuming the research now.",
      );
      setIsClarificationAdvancing(true);
      await sleep(520);
      setActiveClarificationQuestionIndex(nextIndex);
      await submitClarificationAnswers(activeMatter.id, {
        preserveLoader: true,
      });
      return;
    }

    await advanceClarificationQuestion();
  };

  const handleClarificationSkip = async () => {
    if (!activeClarificationQuestion) return;
    setClarificationDraftAnswers((current) => {
      const next = { ...current };
      delete next[activeClarificationQuestion.id];
      return next;
    });
    await advanceClarificationQuestion(
      "Skipping this question and moving to the next checkpoint.",
    );
  };

  const handleClarificationSkipAll = () => {
    setClarificationAdvanceMessage(
      "Skipping the remaining questions and preparing the next checkpoint.",
    );
    setIsClarificationAdvancing(true);
    window.setTimeout(() => {
      setActiveClarificationQuestionIndex(clarificationQuestions.length);
      setIsClarificationAdvancing(false);
    }, 520);
  };

  const handleMatterChatSubmit = async (query: string, mode: SearchBarMode) => {
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

  const openMissingProofInMatterChat = (missingItem: string) => {
    if (!activeMatter?.id) return;
    if (isMatterChatSubmitting) return;
    const workflowName =
      activeAtlasMatterBrief?.usedWorkflow?.name ||
      activeWorkflowDisplayName ||
      "this workflow";
    const prompt = [
      `Help me obtain or prove this missing item for ${workflowName}: ${missingItem}.`,
      "Explain what document, communication, record, or confirmation I should get next.",
      "If the ideal document is unavailable, explain what alternate proof may still work.",
      "Answer in practical lawyer-facing steps.",
    ].join(" ");
    setIsMatterChatOpen(true);
    void handleMatterChatSubmit(prompt, "deep");
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

  const handleSaveMatterTitle = async () => {
    if (!activeMatter || isSavingMatterTitle) return;
    const nextTitle = matterTitleDraft.trim();
    if (!nextTitle) {
      setMatterTitleError("Title cannot be empty.");
      return;
    }
    if (nextTitle === String(activeMatter.title || "").trim()) {
      setIsEditingMatterTitle(false);
      setMatterTitleError("");
      return;
    }

    setIsSavingMatterTitle(true);
    setMatterTitleError("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/matters/${encodeURIComponent(activeMatter.id)}/title`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle }),
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        result?: MatterProcessedResult;
      };
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(payload?.error || "Failed to rename matter.");
      }
      updateMatter(payload.result);
      setIsEditingMatterTitle(false);
    } catch (error) {
      setMatterTitleError(
        error instanceof Error ? error.message : "Failed to rename matter.",
      );
    } finally {
      setIsSavingMatterTitle(false);
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
      formData.append("pass_through_contextcore", "true");

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
      void logMatterUnderstandingAgents(result.matter.id);
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
      formData.append("pass_through_contextcore", "true");

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
      void logMatterUnderstandingAgents(result.matter.id);
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
      setActiveMatterTab("facts");
      if (isClassificationContinuationProcessing(payload.result)) {
        void pollMatterAfterClassificationConfirm(activeMatter.id);
      } else {
        void refreshStoredMatters();
      }
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
    if (!activeMatter || isActiveMockMatter || isSavingClassificationTag)
      return;
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
    if (
      !activeMatter?.id ||
      isActiveMockMatter ||
      isLoadingDraftRecommendations
    ) {
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
      navigate(
        `/drafting?matter=${encodeURIComponent(activeMatter.id)}&startDraft=${encodeURIComponent(
          recommendation.draft_key,
        )}&draftLabel=${encodeURIComponent(
          recommendation.title,
        )}&requestedFrom=drafts&draftKey=${encodeURIComponent(
          recommendation.draft_key,
        )}`,
      );
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
    <section className={`matterOverviewWrap ${readerFontClass}`.trim()}>
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
          <div className="matterEditableTitleWrap">
            {isEditingMatterTitle ? (
              <>
                <input
                  className="matterTitleEditorInput"
                  value={matterTitleDraft}
                  onChange={(event) => {
                    setMatterTitleDraft(event.target.value);
                    if (matterTitleError) {
                      setMatterTitleError("");
                    }
                  }}
                  onBlur={() => {
                    void handleSaveMatterTitle();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveMatterTitle();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMatterTitleDraft(matterHeading);
                      setMatterTitleError("");
                      setIsEditingMatterTitle(false);
                    }
                  }}
                  placeholder="Rename this matter"
                  autoFocus
                  disabled={isSavingMatterTitle}
                />
                {matterTitleError ? (
                  <p className="matterTitleEditorError">{matterTitleError}</p>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="matterTitleEditTrigger"
                onClick={() => {
                  if (!activeMatter) return;
                  setMatterTitleDraft(matterHeading);
                  setMatterTitleError("");
                  setIsEditingMatterTitle(true);
                }}
                disabled={!activeMatter}
                title="Click to rename this matter"
              >
                <h1>{matterHeading}</h1>
              </button>
            )}
          </div>
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
        <div className="matterReaderFontBar">
          <label className="matterReaderFontLabel" htmlFor="matter-reader-font">
            Reader font
          </label>
          <select
            id="matter-reader-font"
            className="matterReaderFontSelect"
            value={selectedReaderFont}
            onChange={(event) =>
              setSelectedReaderFont(event.target.value as MatterReaderFont)
            }
          >
            {readerFontOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {activeMatter ? (
          <>
            <div
              className="matterWorkspaceTabs"
              role="tablist"
              aria-label="Matter workspace"
            >
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeMatterTab === tab.id}
                  className={`matterWorkspaceTab ${activeMatterTab === tab.id ? "isActive" : ""}`}
                  onClick={() => setActiveMatterTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" ? (
                    <small>{tab.count}</small>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {activeMatterTab === "people" ? (
          <section className="matterPeopleSection">
            <div className="matterPeopleHead">
              <div>
                <h2>Parties involved</h2>
                <p className="matterPeopleInfo">
                  The matter record, extracted fields, and manual additions all
                  contribute to this party view.
                </p>
              </div>
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
                  text={
                    isExtractingPeople
                      ? "Fetching..."
                      : "Fetch from ContextCore"
                  }
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
              <p className="matterPeopleInfo">
                Identifying parties and counsel...
              </p>
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
                    <span className="matterPersonAvatar">
                      {person.initials}
                    </span>
                    <div>
                      <h3>{person.name}</h3>
                      <strong>{person.role}</strong>
                      <p>{person.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div>
                <p className="matterPeopleInfo">
                  No parties have been confirmed in the matter view yet.
                </p>
                <Button
                  type="button"
                  className="matterPeopleEmptyAdd"
                  disabled={!activeMatter}
                  onClick={() => setIsPeopleDialogOpen(true)}
                  text="Add relevant people manually"
                  showImage
                  image={<Plus size={22} />}
                />
              </div>
            )}
          </section>
        ) : null}

        {activeMatter && activeMatterTab === "overview" ? (
          !activePrimarySummary &&
          (shouldShowWorkflowConfirmationState ||
            shouldShowClarificationState ||
            shouldShowProgressThread) ? (
            <section className="matterAnalysisWorkspace matterAnalysisWorkspaceBlocking">
              {activeSummaryRunState.error ? (
                <article className="matterAnalysisPanel matterAnalysisWarningPanel">
                  <div className="matterAnalysisPanelHead">
                    <div>
                      <p className="matterEyebrow">Summary Status</p>
                      <h3>Summary generation needs attention</h3>
                    </div>
                  </div>
                  <p>{activeSummaryRunState.error}</p>
                </article>
              ) : null}

              {!shouldShowClarificationState ? (
                <article className="matterResearchModePanel matterResearchModePanelBlocking">
                  <div className="matterResearchModeHero">
                    <div>
                      <p className="matterEyebrow">Active Research</p>
                      <h3>{researchWorkspaceTitle}</h3>
                      <p className="matterResearchModeSummary">
                        {researchWorkspaceSummary}
                      </p>
                    </div>
                    <div className="matterResearchModeMeta">
                      <span className="matterResearchModeStatus">
                        {researchWorkspaceStatusLabel}
                      </span>
                      {canStartResearchFromUi && activeMatter ? (
                        <button
                          type="button"
                          className="matterResearchStartBtn"
                          disabled={isResearchStartBlockedByPreparation}
                          onClick={() =>
                            void runMatterAtlasResearch(activeMatter.id)
                          }
                        >
                          {researchStartButtonLabel}
                        </button>
                      ) : null}
                      {isMatterResearchRunning && activeMatter ? (
                        <button
                          type="button"
                          className="matterResearchCancelBtn"
                          onClick={() =>
                            void cancelMatterAtlasResearch(activeMatter.id)
                          }
                        >
                          Cancel research
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {activeProgressMessage ? (
                    <article className="matterResearchCurrentStage">
                      <div className="matterResearchCurrentStageTop">
                        <div>
                          <span className="matterResearchCurrentStageLabel">
                            Research in progress
                          </span>
                          <h4>Associate is researching in the background</h4>
                        </div>
                        <div className="matterResearchPulse" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                      <p>{activeProgressDisplayText}</p>
                      {isMatterStatePolling ? (
                        <div className="matterResearchPollingRow">
                          <div
                            className="matterResearchPulse"
                            aria-hidden="true"
                          >
                            <span />
                            <span />
                            <span />
                          </div>
                          <span>Refreshing live research state</span>
                        </div>
                      ) : null}
                    </article>
                  ) : null}
                  <div className="matterResearchFootnote">
                    You can do something else. Associate will notify you once
                    the brief is ready.
                  </div>
                </article>
              ) : null}
            </section>
          ) : (
            <section className="matterAnalysisWorkspace">
              <div className="matterAnalysisGrid">
                <div className="matterAnalysisMainColumn">
                  {activeSummaryRunState.error ? (
                    <article className="matterAnalysisPanel matterAnalysisWarningPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Summary Status</p>
                          <h3>Summary generation needs attention</h3>
                        </div>
                      </div>
                      <p>{activeSummaryRunState.error}</p>
                    </article>
                  ) : null}

                  {activePrimarySummary ? (
                    <>
                      <article className="matterAnalysisPanel matterSummaryPanel">
                        <div className="matterAnalysisPanelHead">
                          <div>
                            <p className="matterEyebrow">Executive Summary</p>
                            <h3>{activeSummaryTitle}</h3>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="matterSummaryPreviewCard"
                          onClick={() => setIsBriefDetailModalOpen(true)}
                        >
                          <p className="matterSummaryLead">
                            {buildHighlightedSummary(
                              shouldAnimateBriefSections
                                ? typedPrimarySummary || activePrimarySummary
                                : activePrimarySummary,
                              summaryHighlightTerms,
                            )}
                            {shouldAnimateBriefSections &&
                            typedPrimarySummary.length <
                              activePrimarySummary.length ? (
                              <span
                                className="matterTypewriterCursor"
                                aria-hidden="true"
                              />
                            ) : null}
                          </p>
                          <span className="matterSummaryPreviewHint">
                            Click to open the research detail
                          </span>
                        </button>
                        {isMatterStatePolling ? (
                          <div className="matterResearchPollingRow">
                            <div
                              className="matterResearchPulse"
                              aria-hidden="true"
                            >
                              <span />
                              <span />
                              <span />
                            </div>
                            <span>Refreshing live research state</span>
                          </div>
                        ) : null}
                      </article>

                      {missingProofItems.length ||
                      activeAtlasNextSteps?.draftQueue?.length ? (
                        <div className="matterAnalysisSecondaryGrid">
                          {missingProofItems.length &&
                          (!shouldAnimateBriefSections ||
                            briefRevealStage >= 2) ? (
                            <article className="matterAnalysisPanel">
                              <div className="matterAnalysisPanelHead">
                                <div>
                                  <p className="matterEyebrow">Missing Proof</p>
                                  <h3>What still needs support</h3>
                                </div>
                              </div>
                              <ul className="matterChecklist">
                                {(shouldAnimateBriefSections
                                  ? typedMissingProofItems
                                  : missingProofItems
                                )
                                  .filter((item) => item.trim().length > 0)
                                  .map((item, index, array) => (
                                    <li
                                      key={`missing-proof-${index}-${item.slice(0, 48)}`}
                                      className="is-warning matterChecklistActionItem"
                                    >
                                      <ShieldAlert size={15} />
                                      <span className="matterChecklistActionText">
                                        {item}
                                        {shouldAnimateBriefSections &&
                                        index === array.length - 1 &&
                                        item.length <
                                          (missingProofItems[index] || "")
                                            .length ? (
                                          <span
                                            className="matterTypewriterCursor"
                                            aria-hidden="true"
                                          />
                                        ) : null}
                                      </span>
                                      <span className="matterChecklistActionButtonWrap">
                                        <button
                                          type="button"
                                          className="matterChecklistAskAiButton"
                                          onClick={() =>
                                            openMissingProofInMatterChat(
                                              missingProofItems[index] || item,
                                            )
                                          }
                                          aria-label="Ask AI for help"
                                        >
                                          Ask AI
                                        </button>
                                        <span
                                          className="matterChecklistTooltip"
                                          role="tooltip"
                                        >
                                          Ask AI for help
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                              </ul>
                            </article>
                          ) : null}

                          <article className="matterAnalysisPanel">
                            <div className="matterAnalysisPanelHead">
                              <div>
                                <p className="matterEyebrow">
                                  Next Steps and Drafts
                                </p>
                                <h3>What likely comes next</h3>
                              </div>
                            </div>
                            {renderAtlasNextSteps()}
                          </article>
                        </div>
                      ) : null}

                      {activeAtlasCaseResearch?.similarCases?.length &&
                      (!shouldAnimateBriefSections || briefRevealStage >= 3) ? (
                        <article className="matterAnalysisPanel">
                          <div className="matterAnalysisPanelHead">
                            <div>
                              <p className="matterEyebrow">
                                Referred and Similar Cases
                              </p>
                              <h3>Comparable sources and references</h3>
                            </div>
                          </div>
                          {renderAtlasSimilarCases(
                            activeAtlasCaseResearch.similarCases,
                          )}
                        </article>
                      ) : null}

                      {summaryIssues.length ? (
                        <article className="matterAnalysisPanel">
                          <div className="matterAnalysisPanelHead">
                            <div>
                              <p className="matterEyebrow">Issue Analysis</p>
                              <h3>Issues, conditions, and proof gaps</h3>
                            </div>
                          </div>
                          <div className="matterIssueAccordion">
                            {summaryIssues.map((issue) => {
                              const isExpanded = Boolean(
                                expandedSummaryIssueIds[issue.id],
                              );
                              return (
                                <article
                                  className="matterIssueCard"
                                  key={issue.id}
                                >
                                  <button
                                    type="button"
                                    className="matterIssueCardToggle"
                                    onClick={() =>
                                      setExpandedSummaryIssueIds((current) => ({
                                        ...current,
                                        [issue.id]: !current[issue.id],
                                      }))
                                    }
                                  >
                                    <div className="matterIssueCardHead">
                                      <div>
                                        <h4>{issue.title}</h4>
                                        <span className="matterIssueKey">
                                          {issue.id.replace(/_/g, " ")}
                                        </span>
                                      </div>
                                      <div className="matterIssueCardToggleMeta">
                                        <span
                                          className={`matterIssueSupportBadge is-${issue.supportLevel}`}
                                        >
                                          {formatSupportLevelLabel(
                                            issue.supportLevel,
                                          )}
                                        </span>
                                        {isExpanded ? (
                                          <ChevronDown size={18} />
                                        ) : (
                                          <ChevronRight size={18} />
                                        )}
                                      </div>
                                    </div>
                                    <p className="matterIssueCardPreview">
                                      {issue.shortAnswer}
                                    </p>
                                  </button>
                                  {isExpanded ? (
                                    <div className="matterIssueCardBody">
                                      <p>{issue.detailedAnalysis}</p>
                                      {issue.requiredPredicates.length ? (
                                        <ul className="matterBulletList">
                                          {issue.requiredPredicates.map(
                                            (predicate) => (
                                              <li
                                                key={`${issue.id}-${predicate}`}
                                              >
                                                {predicate}
                                              </li>
                                            ),
                                          )}
                                        </ul>
                                      ) : null}
                                      {issue.linkedEvidenceIds.length ? (
                                        <div className="matterIssueCitationList">
                                          {activeEvidenceReference?.evidenceItems
                                            .filter((citation) =>
                                              issue.linkedEvidenceIds.includes(
                                                citation.evidenceAnswerId,
                                              ),
                                            )
                                            .slice(0, 2)
                                            .map((citation) => (
                                              <article
                                                className="matterIssueCitation"
                                                key={`${issue.id}-${citation.id}`}
                                              >
                                                <strong>
                                                  {citation.documentName}
                                                  {citation.pageNumber
                                                    ? ` · p.${citation.pageNumber}`
                                                    : ""}
                                                  {citation.section
                                                    ? ` · ${citation.section}`
                                                    : ""}
                                                </strong>
                                                <p>{citation.excerpt}</p>
                                              </article>
                                            ))}
                                        </div>
                                      ) : (
                                        <p className="matterIssueCitationEmpty">
                                          No direct citation is exposed for this
                                          issue yet.
                                        </p>
                                      )}
                                    </div>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        </article>
                      ) : null}
                    </>
                  ) : null}

                  {!activePrimarySummary ? (
                    <article className="matterResearchModePanel">
                      <div className="matterResearchModeHero">
                        <div>
                          <p className="matterEyebrow">Active Research</p>
                          <h3>{researchWorkspaceTitle}</h3>
                          <p className="matterResearchModeSummary">
                            {researchWorkspaceSummary}
                          </p>
                        </div>
                        <div className="matterResearchModeMeta">
                          <span className="matterResearchModeStatus">
                            {researchWorkspaceStatusLabel}
                          </span>
                          {canStartResearchFromUi && activeMatter ? (
                            <button
                              type="button"
                              className="matterResearchStartBtn"
                              disabled={isResearchStartBlockedByPreparation}
                              onClick={() =>
                                void runMatterAtlasResearch(activeMatter.id)
                              }
                            >
                              {researchStartButtonLabel}
                            </button>
                          ) : null}
                          {isMatterResearchRunning && activeMatter ? (
                            <button
                              type="button"
                              className="matterResearchCancelBtn"
                              onClick={() =>
                                void cancelMatterAtlasResearch(activeMatter.id)
                              }
                            >
                              Cancel research
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {shouldShowProgressThread && activeProgressMessage ? (
                        <article className="matterResearchCurrentStage">
                          <div className="matterResearchCurrentStageTop">
                            <div>
                              <span className="matterResearchCurrentStageLabel">
                                Research in progress
                              </span>
                              <h4>
                                Associate is researching in the background
                              </h4>
                            </div>
                            <div
                              className="matterResearchPulse"
                              aria-hidden="true"
                            >
                              <span />
                              <span />
                              <span />
                            </div>
                          </div>
                          <p>{activeProgressDisplayText}</p>
                          {isMatterStatePolling ? (
                            <div className="matterResearchPollingRow">
                              <div
                                className="matterResearchPulse"
                                aria-hidden="true"
                              >
                                <span />
                                <span />
                                <span />
                              </div>
                              <span>Refreshing live research state</span>
                            </div>
                          ) : null}
                        </article>
                      ) : null}

                      <div className="matterResearchFootnote">
                        You can do something else. Associate will notify you
                        once the brief is ready.
                      </div>
                    </article>
                  ) : null}

                  {!activePrimarySummary &&
                  activeAnalysisState?.whatWeFound?.length ? (
                    <article className="matterResearchFindingsPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">What We Found</p>
                          <h3>Current understanding of the record</h3>
                        </div>
                      </div>
                      <div className="matterResearchFindingsGrid">
                        {activeAnalysisState.whatWeFound.map((item) => (
                          <article
                            className={`matterResearchFindingCard ${
                              item.state === "attention"
                                ? "is-warning"
                                : "is-ready"
                            }`}
                            key={`${item.id || item.label}-${item.value}`}
                          >
                            <div className="matterResearchFindingIcon">
                              {item.state === "attention" ? (
                                <AlertTriangle size={16} />
                              ) : (
                                <CheckCircle2 size={16} />
                              )}
                            </div>
                            <div>
                              <strong>{item.label}</strong>
                              <p>{item.value}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </article>
                  ) : null}
                </div>

                <aside className="matterAnalysisSidebar" />
              </div>
            </section>
          )
        ) : null}

        {activeMatter ? (
          <>
            {activeMatterTab === "overview" && false ? (
              <article className="matterBriefLoopPanel">
                <div className="matterBriefLoopHead">
                  <p className="matterEyebrow">
                    Agent Brief ·{" "}
                    {activeMatter?.intelligence_statuses?.brief_generation ===
                    "ready"
                      ? "Generated"
                      : activeMatter?.intelligence_statuses
                            ?.brief_generation === "query_required"
                        ? "Needs Input"
                        : "Pending"}{" "}
                    · {uploadedDocumentCount} file
                    {uploadedDocumentCount === 1 ? "" : "s"}
                  </p>
                  <span
                    className={`matterBriefStatus is-${activeMatter?.intelligence_statuses?.brief_generation || "not_started"}`}
                  >
                    {activeMatter?.intelligence_statuses?.brief_generation ||
                      "not started"}
                  </span>
                </div>

                {activeMatter?.intelligence_statuses?.brief_generation ===
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
                    {isContinuingContextCore ? (
                      <div className="matterInlineLoaderWrap">
                        <Loader
                          mode="inline"
                          variant="spinner"
                          eyebrow="ContextCore"
                          title="Generating grounded brief"
                          message="Searching the indexed matter, grounding evidence, and extracting participants."
                        />
                      </div>
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
                        {briefDisplayPayload?.warning}
                      </p>
                    ) : null}
                    {briefAnswerError ? (
                      <p className="matterBriefError">{briefAnswerError}</p>
                    ) : null}
                    {isContinuingContextCore ? (
                      <div className="matterInlineLoaderWrap">
                        <Loader
                          mode="inline"
                          variant="spinner"
                          eyebrow="ContextCore"
                          title="Retrying brief generation"
                          message="Waiting for retrieval and grounded brief assembly to complete."
                        />
                      </div>
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
                ) : isContextCoreEvidenceGap ? (
                  <div className="matterBriefQuestionBox">
                    <p>
                      ContextCore search completed, but the current retrieval
                      did not produce grounded evidence for this brief. This is
                      not a manual clarification loop.
                    </p>
                    {briefQuestions.length ? (
                      <ul>
                        {briefQuestions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    ) : null}
                    {briefDisplayPayload?.warning ? (
                      <p className="matterBriefError">
                        {briefDisplayPayload?.warning}
                      </p>
                    ) : null}
                    {briefAnswerError ? (
                      <p className="matterBriefError">{briefAnswerError}</p>
                    ) : null}
                    {isContinuingContextCore ? (
                      <div className="matterInlineLoaderWrap">
                        <Loader
                          mode="inline"
                          variant="spinner"
                          eyebrow="ContextCore"
                          title="Regenerating grounded brief"
                          message="Refreshing retrieval sweeps and rebuilding the matter brief."
                        />
                      </div>
                    ) : null}
                    <div className="matterBriefActions">
                      <Button
                        type="button"
                        disabled={isContinuingContextCore}
                        onClick={() => void handleContinueContextCore()}
                      >
                        {isContinuingContextCore
                          ? "Retrying..."
                          : "Retry grounded brief generation"}
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
                                          const sourceRef =
                                            point.sourceRefs.find(
                                              (ref) =>
                                                ref.fileName === sourceName,
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
                                      {formatBriefTaxonomyLabel(
                                        point.pointType,
                                      )}
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
                                      {formatBriefTaxonomyLabel(
                                        point.certainty,
                                      )}
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
                        {briefDisplayPayload?.warning}
                      </p>
                    ) : null}
                    <div className="matterBriefSourceRow">
                      <span>
                        {activeMatter?.classification?.classification_name ||
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
                        {formatUploadedAt(
                          activeMatter?.acceptedBrief?.accepted_at || "",
                        )}
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
                              secondaryClassification?.primary_domain ||
                                "unknown",
                            ),
                          )}{" "}
                          /{" "}
                          {formatBriefTaxonomyLabel(
                            String(
                              secondaryClassification?.primary_subdomain ||
                                "unknown",
                            ),
                          )}{" "}
                          before{" "}
                          {formatBriefTaxonomyLabel(
                            String(
                              (
                                secondaryClassification?.forum as {
                                  court?: string;
                                }
                              )?.court || "unknown",
                            ),
                          )}
                          . Stage:{" "}
                          {formatBriefTaxonomyLabel(
                            String(
                              secondaryClassification?.procedural_stage ||
                                "unknown",
                            ),
                          )}
                          . Client posture:{" "}
                          {formatBriefTaxonomyLabel(
                            String(
                              secondaryClassification?.client_posture ||
                                "unknown",
                            ),
                          )}
                          .
                        </p>
                        {secondaryClassificationMarkers.length ? (
                          <div className="matterSecondaryTagSection">
                            <div className="matterSecondaryTagList">
                              {secondaryClassificationMarkers.map((marker, index) => (
                                <span
                                  key={`secondary-marker-${index}-${marker.slice(0, 48)}`}
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
                              {isSavingClassificationTag
                                ? "Saving..."
                                : "Add tag"}
                            </Button>
                          </form>
                        ) : null}
                        {String(
                          secondaryClassification?.document_set_summary || "",
                        ).trim() ? (
                          <p className="matterBriefPointReason">
                            {String(
                              secondaryClassification?.document_set_summary ||
                                "",
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
                        {isConfirmingSecondaryClassification ? (
                          <div className="matterInlineLoaderWrap">
                            <Loader
                              mode="inline"
                              variant="spinner"
                              eyebrow="Ground Analysis"
                              title="Confirming classification"
                              message="Generating fact cards, law bindings, inferences, and draft recommendations."
                            />
                          </div>
                        ) : null}
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
            ) : null}

            {activeMatterTab === "evidence" ? (
              <article className="matterWorkspacePanel matterWorkspaceFactsPanel">
                <div className="matterWorkspacePanelHead">
                  <div>
                    <p className="matterEyebrow">Evidence</p>
                    <h2>Evidence reference</h2>
                  </div>
                  <span className="matterBriefStatus is-ready">
                    {activeEvidenceReference?.evidenceItems?.length ||
                      briefEvidenceCount ||
                      0}{" "}
                    items
                  </span>
                </div>
                {activeEvidenceReference?.citationGroups?.length ? (
                  <div className="matterFrameworkCardGrid">
                    {activeEvidenceReference.citationGroups.map((group) => (
                      <article className="matterFrameworkCard" key={group.id}>
                        <strong>{group.title}</strong>
                        <p>
                          {group.evidenceIds.length} citation
                          {group.evidenceIds.length === 1 ? "" : "s"} linked
                        </p>
                      </article>
                    ))}
                  </div>
                ) : null}
                {activeEvidenceReference?.evidenceItems?.length ? (
                  <div className="matterIssueCardGrid">
                    {activeEvidenceReference.evidenceItems.map((item) => (
                      <article className="matterIssueCard" key={item.id}>
                        <div className="matterIssueCardHead">
                          <div>
                            <h4>{item.documentName}</h4>
                            <span className="matterIssueKey">
                              {item.section || item.slot}
                              {item.pageNumber ? ` · p.${item.pageNumber}` : ""}
                            </span>
                          </div>
                          <span
                            className={`matterIssueSupportBadge is-${item.confidence}`}
                          >
                            {item.confidence}
                          </span>
                        </div>
                        <p>{item.excerpt}</p>
                        {item.sourceUrl ? (
                          <div className="matterIssueCardBody isOpen">
                            <UiButton
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                window.open(
                                  item.sourceUrl || "",
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                            >
                              See evidence
                            </UiButton>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : activeAtlasCaseResearch?.similarCases?.length ? (
                  renderAtlasSimilarCases(activeAtlasCaseResearch.similarCases)
                ) : (
                  <p className="matterDebriefEmpty">
                    Evidence excerpts will appear here once a summary is
                    generated.
                  </p>
                )}
              </article>
            ) : null}

            {activeMatterTab === "facts" ? (
              activeBriefArtifact ? (
                <article className="matterWorkspacePanel matterWorkspaceFactsPanel">
                  <div className="matterWorkspacePanelHead">
                    <div>
                      <p className="matterEyebrow">Analysis</p>
                      <h2>Detailed legal brief</h2>
                    </div>
                    <span
                      className={`matterBriefStatus is-${activeBriefArtifact.summaryType}`}
                    >
                      {formatSummaryTypeLabel(activeBriefArtifact.summaryType)}
                    </span>
                  </div>
                  {activeDetailedBrief?.contractualFramework?.length ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Framework</p>
                          <h3>Contractual framework</h3>
                        </div>
                      </div>
                      <div className="matterFrameworkCardGrid">
                        {activeDetailedBrief.contractualFramework.map(
                          (item) => (
                            <article
                              className="matterFrameworkCard"
                              key={item.id}
                            >
                              <strong>{item.topic}</strong>
                              <p>{item.summary}</p>
                              <small>{item.legalEffect}</small>
                            </article>
                          ),
                        )}
                      </div>
                    </section>
                  ) : null}
                  {activeDetailedBrief?.issueAnalysis?.length ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Issue Analysis</p>
                          <h3>Structured legal issues</h3>
                        </div>
                      </div>
                      <div className="matterIssueCardGrid">
                        {activeDetailedBrief.issueAnalysis.map((issue) => (
                          <article className="matterIssueCard" key={issue.id}>
                            <div className="matterIssueCardHead">
                              <div>
                                <h4>{issue.title}</h4>
                                <span className="matterIssueKey">
                                  {issue.id.replace(/_/g, " ")}
                                </span>
                              </div>
                              <span
                                className={`matterIssueSupportBadge is-${issue.supportLevel}`}
                              >
                                {formatSupportLevelLabel(issue.supportLevel)}
                              </span>
                            </div>
                            <p>{issue.shortAnswer}</p>
                            <p>{issue.detailedAnalysis}</p>
                            {issue.missingProof.length ? (
                              <ul className="matterBulletList">
                                {issue.missingProof.map((item) => (
                                  <li key={`${issue.id}-${item}`}>{item}</li>
                                ))}
                              </ul>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {activeDetailedBrief?.recommendedActions?.length ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Recommended Actions</p>
                          <h3>Next legal steps</h3>
                        </div>
                      </div>
                      <div className="matterNextStepCardGrid">
                        {activeDetailedBrief.recommendedActions.map((item) => (
                          <article className="matterNextStepCard" key={item.id}>
                            <div className="matterNextStepCardHead">
                              <strong>{item.action}</strong>
                              <span
                                className={`matterPriorityBadge is-${item.priority}`}
                              >
                                {item.priority}
                              </span>
                            </div>
                            <p>{item.whyItMatters}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {activeDetailedBrief?.limitations?.length ? (
                    <section className="matterAnalysisPanel matterAnalysisWarningPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Limitations</p>
                          <h3>Visible proof boundaries</h3>
                        </div>
                      </div>
                      <ul className="matterBulletList">
                        {activeDetailedBrief.limitations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </article>
              ) : activeAtlasMatterBrief ? (
                <article className="matterWorkspacePanel matterWorkspaceFactsPanel">
                  <div className="matterWorkspacePanelHead">
                    <div>
                      <p className="matterEyebrow">Analysis</p>
                      <h2>Atlas research detail</h2>
                    </div>
                    <span className="matterBriefStatus is-ready">
                      {activeAtlasMatterBrief.confidence}
                    </span>
                  </div>
                  {activeAtlasMatterBrief.detailedBrief ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Brief</p>
                          <h3>Detailed agent brief</h3>
                        </div>
                      </div>
                      <div className="matterReadableTextBlock">
                        {splitReadableParagraphs(
                          activeAtlasMatterBrief.detailedBrief,
                        ).map((paragraph, index) => (
                          <p key={`facts-atlas-detailed-${index}`}>{paragraph}</p>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {activeAtlasDeciderResearch ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Grounding</p>
                          <h3>Workflow and document grounding</h3>
                        </div>
                      </div>
                      <div className="matterReadableTextBlock">
                        {splitReadableParagraphs(
                          activeAtlasDeciderResearch.agentBrief,
                        ).map((paragraph, index) => (
                          <p key={`facts-atlas-agent-${index}`}>{paragraph}</p>
                        ))}
                      </div>
                      {activeAtlasDeciderResearch.workflowGrounding.length ? (
                        <ul className="matterBulletList">
                          {activeAtlasDeciderResearch.workflowGrounding.map(
                            (item) => (
                              <li key={`facts-workflow-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : null}
                      {activeAtlasDeciderResearch.documentGrounding.length ? (
                        <ul className="matterBulletList">
                          {activeAtlasDeciderResearch.documentGrounding.map(
                            (item) => (
                              <li key={`facts-document-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}
                  {activeAtlasMatterBrief.recordSupports?.length ||
                  activeAtlasMatterBrief.recordDoesNotSupportYet?.length ||
                  activeAtlasMatterBrief.recordContradicts?.length ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Grounding</p>
                          <h3>Supported, unresolved, and contradicted points</h3>
                        </div>
                      </div>
                      {activeAtlasMatterBrief.recordSupports?.length ? (
                        <>
                          <strong>Supported by the uploaded record</strong>
                          <ul className="matterBulletList">
                            {activeAtlasMatterBrief.recordSupports.map((item) => (
                              <li key={`facts-support-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {activeAtlasMatterBrief.recordDoesNotSupportYet?.length ? (
                        <>
                          <strong>Not yet supported</strong>
                          <ul className="matterBulletList">
                            {activeAtlasMatterBrief.recordDoesNotSupportYet.map(
                              (item) => (
                                <li key={`facts-unsupported-${item}`}>{item}</li>
                              ),
                            )}
                          </ul>
                        </>
                      ) : null}
                      {activeAtlasMatterBrief.recordContradicts?.length ? (
                        <>
                          <strong>Contradicted by the current record</strong>
                          <ul className="matterBulletList">
                            {activeAtlasMatterBrief.recordContradicts.map((item) => (
                              <li key={`facts-contradiction-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </section>
                  ) : null}
                  {activeAtlasCaseResearch ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Procedure</p>
                          <h3>Procedural patterns</h3>
                        </div>
                      </div>
                      {activeAtlasCaseResearch.procedurePatterns.length ? (
                        <ul className="matterBulletList">
                          {activeAtlasCaseResearch.procedurePatterns.map(
                            (item) => (
                              <li key={`facts-pattern-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}
                  {activeAtlasMatterBrief.citations?.length ? (
                    <section className="matterAnalysisPanel">
                      <div className="matterAnalysisPanelHead">
                        <div>
                          <p className="matterEyebrow">Cases</p>
                          <h3>Verified citations used in the brief</h3>
                        </div>
                      </div>
                      <ul className="matterBulletList">
                        {activeAtlasMatterBrief.citations.map((item) => (
                          <li key={`${item.title}-${item.citation}`}>
                            <strong>{item.title}</strong>
                            {item.citation ? ` (${item.citation})` : ""}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </article>
              ) : (
                <article className="matterWorkspacePanel matterWorkspaceFactsPanel">
                  <div className="matterWorkspacePanelHead">
                    <div>
                      <p className="matterEyebrow">Facts</p>
                      <h2>Grounded fact map</h2>
                    </div>
                    <span
                      className={`matterBriefStatus is-${groundAnalysisStatus}`}
                    >
                      {groundAnalysisStatus || "not started"}
                    </span>
                  </div>
                  {briefDisplayPayload?.warning ? (
                    <p className="matterWorkspaceWarning">
                      {briefDisplayPayload.warning}
                    </p>
                  ) : null}
                  {isMatterStepBusy || isGroundAnalysisProcessing ? (
                    <div className="matterInlineLoaderWrap">
                      <Loader
                        mode="inline"
                        variant="spinner"
                        eyebrow="Ground Analysis"
                        title={
                          isConfirmingSecondaryClassification
                            ? "Building fact cards"
                            : activeMatter.intelligence_statuses
                                  ?.inference_generation === "processing" ||
                                activeMatter.intelligence_statuses
                                  ?.inference_verification === "processing"
                              ? "Generating inferences"
                              : activeMatter.intelligence_statuses
                                    ?.law_generation === "processing" ||
                                  activeMatter.intelligence_statuses
                                    ?.law_verification === "processing"
                                ? "Attaching law support"
                                : "Updating grounded analysis"
                        }
                        message="This matter is still being enriched in the background. Completed cards appear below as soon as they are ready."
                      />
                    </div>
                  ) : null}
                  {groundAnalysisCards.length ? (
                    <div className="matterCompactFactList">
                      {groundAnalysisCards.map((card) => {
                        const isExpanded = Boolean(expandedFactIds[card.id]);
                        const factDotStatus = card.factText
                          ? "ready"
                          : "queued";
                        const lawDotStatus =
                          card.lawText || card.lawCard
                            ? "ready"
                            : activeMatter.intelligence_statuses
                                  ?.law_generation === "processing" ||
                                activeMatter.intelligence_statuses
                                  ?.law_verification === "processing"
                              ? "processing"
                              : "queued";
                        const inferenceDotStatus = card.inferenceText
                          ? "ready"
                          : activeMatter.intelligence_statuses
                                ?.inference_generation === "processing" ||
                              activeMatter.intelligence_statuses
                                ?.inference_verification === "processing"
                            ? "processing"
                            : "queued";
                        return (
                          <article
                            className={`matterCompactFactCard ${isExpanded ? "isExpanded" : ""}`}
                            key={card.id}
                          >
                            <button
                              type="button"
                              className="matterCompactFactToggle"
                              onClick={() =>
                                setExpandedFactIds((prev) => ({
                                  ...prev,
                                  [card.id]: !prev[card.id],
                                }))
                              }
                            >
                              <div className="matterCompactFactLead">
                                <div className="matterCompactFactTitleRow">
                                  <strong>{card.title}</strong>
                                  <span className="matterCompactFactScore">
                                    {typeof card.supportScore === "number"
                                      ? Math.round(card.supportScore * 100)
                                      : card.confidencePercent}
                                    %
                                  </span>
                                </div>
                                <p>{clipText(card.factText, 165)}</p>
                              </div>
                              <div className="matterCompactFactSignals">
                                <span
                                  className={`matterSignalDot fact is-${factDotStatus}`}
                                >
                                  F
                                </span>
                                <span
                                  className={`matterSignalDot law is-${lawDotStatus}`}
                                >
                                  L
                                </span>
                                <span
                                  className={`matterSignalDot inference is-${inferenceDotStatus}`}
                                >
                                  I
                                </span>
                              </div>
                            </button>
                            {isExpanded ? (
                              <div className="matterCompactFactBody">
                                <div className="matterCompactFactDetailGrid">
                                  <div className="matterCompactFactPanel fact">
                                    <span>Fact</span>
                                    <p>{card.factText}</p>
                                  </div>
                                  <div className="matterCompactFactPanel law">
                                    <span>Law</span>
                                    <p>
                                      {card.lawText ||
                                        card.lawCard?.bindingExplanation ||
                                        "No supported legal rule extracted yet."}
                                    </p>
                                  </div>
                                  <div className="matterCompactFactPanel inference">
                                    <span>Inference</span>
                                    <p>
                                      {card.inferenceText ||
                                        "Inference is pending or intentionally withheld until stronger support is available."}
                                    </p>
                                  </div>
                                </div>
                                <div className="matterCompactFactMeta">
                                  {card.sourceFiles.length ? (
                                    <div className="matterCompactFactMetaGroup">
                                      <strong>Source files:</strong>
                                      <div className="matterSourceFileChipRow">
                                        {card.sourceFiles.map((sourceFile) => {
                                          const sourceRef =
                                            card.sourceRefs.find((ref) =>
                                              sourceRefMatchesFile(
                                                ref,
                                                sourceFile,
                                              ),
                                            ) ||
                                            card.sourceRefs[0] ||
                                            null;
                                          return (
                                            <button
                                              type="button"
                                              key={`${card.id}-${sourceFile}`}
                                              className="matterSourceFileChip"
                                              onClick={() =>
                                                openSourceViewer({
                                                  sourceName: sourceFile,
                                                  sourceRef,
                                                  fallbackText: card.factText,
                                                })
                                              }
                                            >
                                              {sourceFile}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                  {card.researchGaps.length ? (
                                    <p>
                                      <strong>Gaps:</strong>{" "}
                                      {card.researchGaps.join(" ")}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="matterDebriefEmpty">
                      Grounded fact extraction has not populated yet for this
                      matter.
                    </p>
                  )}
                </article>
              )
            ) : null}
            {activeMatterTab === "drafts" ? (
              <article className="matterWorkspacePanel matterWorkspaceDraftsPanel">
                <div className="matterWorkspacePanelHead">
                  <div>
                    <p className="matterEyebrow">Drafts</p>
                    <h2>
                      {isAtlasMatterFlow
                        ? "Drafts to prepare"
                        : "Drafting catalogue"}
                    </h2>
                  </div>
                  <div className="matterDraftRecommendationsActions">
                    {isAtlasMatterFlow ? (
                      <span className="matterBriefStatus is-ready">
                        {atlasDraftQueue.length} drafts
                      </span>
                    ) : activeDraftRecommendations?.counts ? (
                      <span className="matterBriefStatus is-ready">
                        {activeDraftRecommendations.counts.ready || 0} ready
                      </span>
                    ) : null}
                    {!isAtlasMatterFlow && !isActiveMockMatter ? (
                      <Button
                        type="button"
                        className="matterDraftRefreshBtn"
                        onClick={() => void handleRefreshDraftRecommendations()}
                        disabled={isLoadingDraftRecommendations}
                      >
                        {isLoadingDraftRecommendations
                          ? "Refreshing..."
                          : "Refresh"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {isAtlasMatterFlow ? (
                  atlasDraftQueue.length ? (
                    <div className="matterNextStepsStack">
                      {atlasDraftQueue.map((item) => (
                        (() => {
                          const dependencies = visibleDraftDependencies(
                            item.unblocksWhen,
                          );
                          return (
                        <article
                          className="matterNextStepsPanel matterNextStepsStaticCard isDraft"
                          key={item.id}
                        >
                          <div className="matterNextStepCardHead">
                            <strong>{item.title}</strong>
                            <Button
                              type="button"
                              className="matterStartDraftingBtn"
                              disabled={item.isStartable === false}
                              onClick={() =>
                                item.isStartable === false
                                  ? undefined
                                  : void startAtlasDraftGeneration(
                                      {
                                        id: item.id,
                                        draftType: item.draftType,
                                        title: item.title,
                                      },
                                      "drafts",
                                    )
                              }
                            >
                              {item.isStartable === false
                                ? "Not yet supported"
                                : "Start drafting"}
                            </Button>
                          </div>
                          <p className="matterNextStepsPreview">
                            {renderEmphasizedInlineText(item.description, [
                              "termination",
                              "notice",
                              "refund",
                              "cure period",
                              "material default",
                              "proof",
                              "upload",
                              activeAtlasMatterBrief?.usedWorkflow?.name || "",
                            ])}
                          </p>
                          {item.availabilityNote ? (
                            <p className="matterNextStepsMeta">
                              {item.availabilityNote}
                            </p>
                          ) : null}
                          {dependencies.length ? (
                            <div className="matterNextStepsAccordionBody">
                              <ul className="matterBulletList">
                                {dependencies.map((dependency: string) => (
                                  <li key={`${item.id}-${dependency}`}>
                                    {dependency}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </article>
                          );
                        })()
                      ))}
                    </div>
                  ) : (
                    <p className="matterDebriefEmpty">
                      Drafts that need to be prepared will appear here once the
                      workflow research pass is complete.
                    </p>
                  )
                ) : readyDraftRecommendations.length ? (
                  <>
                    {startingDraftKey ? (
                      <div className="matterInlineLoaderWrap">
                        <Loader
                          mode="inline"
                          variant="spinner"
                          eyebrow="Drafting"
                          title="Creating draft workspace"
                          message="Generating the draft, saving it, and preparing the editor."
                        />
                      </div>
                    ) : null}
                    <div className="matterDraftRecommendationGrid">
                      {readyDraftRecommendations.map((recommendation) => (
                        <article
                          className="matterDraftRecommendationCard isReady"
                          key={recommendation.draft_key}
                        >
                          <div className="matterDraftRecommendationTop">
                            <h3>{recommendation.title}</h3>
                            <span>
                              {Math.round(
                                Number(recommendation.readiness_score || 0) *
                                  100,
                              )}
                              %
                            </span>
                          </div>
                          <p>
                            {recommendation.purpose || recommendation.reason}
                          </p>
                          <small>
                            {recommendation.reason ||
                              "Ready because the current matter already contains the required source material."}
                          </small>
                          <div className="matterDraftRecommendationFooter">
                            <span>
                              {recommendation.priority || "medium"} ·{" "}
                              {recommendation.risk_level || "medium"} risk
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
                                startingDraftKey === recommendation.draft_key
                              }
                            >
                              {startingDraftKey === recommendation.draft_key
                                ? "Starting..."
                                : "Start draft"}
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : draftRecommendationsPending ? (
                  <p className="matterDebriefEmpty">
                    Draft recommendations are still being prepared.
                  </p>
                ) : null}
                {primaryLockedDraftRecommendations.length ? (
                  <section className="matterDraftRecommendationGroup">
                    <div className="matterDraftRecommendationGroupHead">
                      <span>Unlock with more support</span>
                      <small>
                        These templates match the matter, but key inputs are
                        missing.
                      </small>
                    </div>
                    <div className="matterDraftRecommendationGrid">
                      {primaryLockedDraftRecommendations.map(
                        (recommendation) => (
                          <article
                            className="matterDraftRecommendationCard isLocked"
                            key={recommendation.draft_key}
                          >
                            <div className="matterDraftRecommendationTop">
                              <h3>{recommendation.title}</h3>
                              <span>
                                {Math.round(
                                  Number(recommendation.readiness_score || 0) *
                                    100,
                                )}
                                %
                              </span>
                            </div>
                            <p>
                              {recommendation.purpose || recommendation.reason}
                            </p>
                            {recommendation.missing_inputs?.length ? (
                              <div className="matterDraftMissingList">
                                {recommendation.missing_inputs
                                  .slice(0, 4)
                                  .map((input) => (
                                    <span
                                      key={`${recommendation.draft_key}-${input.input_key}`}
                                    >
                                      {input.label ||
                                        input.input_label ||
                                        input.input_key.replace(/_/g, " ")}
                                    </span>
                                  ))}
                              </div>
                            ) : null}
                          </article>
                        ),
                      )}
                    </div>
                  </section>
                ) : null}
                {lowRelevanceDraftRecommendations.length ? (
                  <section className="matterDraftRecommendationGroup matterLowRelevanceGroup">
                    <button
                      type="button"
                      className="matterLowRelevanceToggle"
                      onClick={() =>
                        setShowLowRelevanceDrafts((current) => !current)
                      }
                    >
                      <span>Low-confidence matches</span>
                      <small>
                        {lowRelevanceDraftRecommendations.length} hidden until
                        expanded
                      </small>
                    </button>
                    {showLowRelevanceDrafts ? (
                      <div className="matterDraftRecommendationGrid">
                        {lowRelevanceDraftRecommendations.map(
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
                                      recommendation.readiness_score || 0,
                                    ) * 100,
                                  )}
                                  %
                                </span>
                              </div>
                              <p>
                                {recommendation.purpose ||
                                  recommendation.reason}
                              </p>
                              <small>
                                This match is currently weak and should be
                                reviewed before use.
                              </small>
                            </article>
                          ),
                        )}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </article>
            ) : null}

            {activeMatterTab === "timeline" ? (
              <article className="matterWorkspacePanel matterWorkspaceTimelinePanel">
                <div className="matterWorkspacePanelHead">
                  <div>
                    <p className="matterEyebrow">Timeline</p>
                    <h2>
                      {isAtlasMatterFlow
                        ? "What action needs to happen when"
                        : "Matter sequence"}
                    </h2>
                  </div>
                </div>
                {timelineItems.length ? (
                  <div className="matterTimeline">
                    {timelineItems.map((item) => (
                      <article className="matterTimelineItem" key={item.id}>
                        <span className="matterTimelineStep">
                          {String(item.step).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                          {item.source ? <small>{item.source}</small> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="matterDebriefEmpty">
                    {isAtlasMatterFlow
                      ? "Action timing will appear here once the workflow sequence is fully assembled."
                      : "A chronology will appear here once fact extraction has enough material."}
                  </p>
                )}
              </article>
            ) : null}

            {Boolean(false) && shouldShowGroundAnalysis ? (
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
                                <p>
                                  Verified law citation will appear below when
                                  available.
                                </p>
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
                              <h3>
                                {card.lawCard.title || "Verified law citation"}
                              </h3>
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
                                {activeDraftRecommendations.counts.ready || 0}{" "}
                                ready ·{" "}
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
                  <strong>
                    {blankFieldHits.length} unfilled fields detected
                  </strong>
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
                      <p>
                        {obligationMapError || "Obligation mapping failed."}
                      </p>
                      <Button
                        type="button"
                        onClick={() => void fetchObligationMap()}
                      >
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
                          {obligationMapResult.counts.service_provider}{" "}
                          obligations
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
                                          handleJumpToClausePage(
                                            item.clause_id,
                                            true,
                                          )
                                        }
                                      >
                                        Page{" "}
                                        {source.source_page ||
                                          source.page_start}
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
                                          handleJumpToClausePage(
                                            item.clause_id,
                                            true,
                                          )
                                        }
                                      >
                                        Page{" "}
                                        {source.source_page ||
                                          source.page_start}
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
                      Open the mapper to classify obligations from clause
                      summaries.
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
                                  updateAcceptedRedline(
                                    activeMatter.id,
                                    item.id,
                                    {
                                      title: event.target.value,
                                    },
                                  )
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
                                updateAcceptedRedline(
                                  activeMatter.id,
                                  item.id,
                                  {
                                    rewrittenText: event.target.value,
                                  },
                                )
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
                      No accepted redlines yet. Open a clause and click Accept
                      redline to add it here.
                    </p>
                  )}
                </aside>
              </>
            ) : null}
          </>
        ) : null}
      </header>
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

      {activeMatterTab === "overview" && false ? (
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
                <article
                  className="matterContextCoreCard"
                  key={result.chunk_id}
                >
                  <div className="matterContextCoreCardHead">
                    <strong>{result.metadata?.file_name || "Source"}</strong>
                    <span>
                      {[
                        result.metadata?.document_role,
                        result.metadata?.assertion_mode,
                      ]
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
      ) : null}

      {!isMatterChatOpen && activeMatter ? (
        <button
          type="button"
          className="matterChatDockButton"
          onClick={() => setIsMatterChatOpen(true)}
        >
          <span className="matterChatDockButtonEyebrow">Matter chat</span>
          <strong>Ask about this record</strong>
        </button>
      ) : null}

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

      {shouldShowWorkflowConfirmationState &&
      activeMatter &&
      activeAtlasRecognition ? (
        <div
          className="matterDialogBackdrop matterClarificationOverlay"
          role="presentation"
        >
          <section
            className="matterClarificationModal"
            role="dialog"
            aria-modal="true"
          >
            <header className="matterClarificationModalHead">
              <div>
                <p className="matterEyebrow">Workflow Confirmation</p>
                <h2>Associate has matched this matter to the atlas</h2>
              </div>
              <span className="matterResearchModeStatus">
                workflow confirmation
              </span>
              <button
                type="button"
                className="matterClarificationCloseButton"
                aria-label="Close workflow confirmation"
                onClick={() =>
                  activeMatter
                    ? dismissAtlasOverlay(activeMatter.id, "post-confirm")
                    : navigate("/")
                }
              >
                <X size={18} />
              </button>
            </header>
            <div className="matterClarificationModalBody">
              <article className="matterClarificationActiveCard uiCard">
                <div className="matterClarificationQuestionHero">
                  <span className="matterIssueKey">Atlas classification</span>
                  <h3>
                    {activeWorkflowDisplayName || "A subcategory match is ready"}
                  </h3>
                  <p className="matterClarificationMeta">
                    Associate is confident in the detected atlas category and
                    subcategory. Add a short correction only if you want atlas
                    to search for a closer fit.
                  </p>
                </div>

                <div className="matterSecondaryClassificationBox">
                  <p className="matterClarificationMeta">
                    <strong>Category:</strong>{" "}
                    {activePracticeAreaDisplayName || "Unspecified"}
                  </p>
                  <p className="matterClarificationMeta">
                    <strong>Subcategory:</strong>{" "}
                    {activeWorkflowDisplayName || "Unspecified"}
                  </p>
                  {activeAtlasRecognition?.primaryReason ? (
                    <p className="matterClarificationMeta">
                      <strong>Why this fit:</strong>{" "}
                      {activeAtlasRecognition.primaryReason}
                    </p>
                  ) : null}
                  {Array.isArray(activeAtlasRecognition?.conflictingSignals) &&
                  activeAtlasRecognition.conflictingSignals.length ? (
                    <div className="matterClarificationConflictNote">
                      {activeAtlasRecognition.conflictingSignals.map((item) => (
                        <p
                          key={`${item.type}:${item.values.join("|")}`}
                          className="matterClarificationMeta"
                        >
                          Signal conflict in {item.type.replace(/_/g, " ")}:{" "}
                          {item.values.join(", ")}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {activeAtlasRecognition?.forumMismatch ? (
                    <p className="matterClarificationMeta">
                      Extracted forum signals do not cleanly match the detected
                      subcategory forum.
                    </p>
                  ) : null}
                </div>

                <div className="matterClarificationChoiceFlow">
                  <UiInput
                    type="text"
                    value={activeWorkflowOverrideNote}
                    onChange={(event) =>
                      setWorkflowOverrideNoteByMatterId((current) => ({
                        ...current,
                        [activeMatter.id]: event.target.value,
                      }))
                    }
                    placeholder="Optional: add a note if the category or subcategory should be different"
                  />
                  <div className="matterClarificationFooter">
                    <UiButton
                      variant="primary"
                      className="matterClarificationIconButton"
                      disabled={activeWorkflowConfirmationState.submitting}
                      onClick={() =>
                        void submitMatterAtlasWorkflowClassification(
                          activeMatter.id,
                        )
                      }
                    >
                      <ArrowRight size={18} />
                    </UiButton>
                  </div>
                  {activeWorkflowConfirmationState.error ? (
                    <p className="matterBriefError">
                      {activeWorkflowConfirmationState.error}
                    </p>
                  ) : null}
                </div>
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {shouldShowClarificationState &&
      draftGenerationCheckpoint ? (
        <div
          className="matterDialogBackdrop matterClarificationOverlay"
          role="presentation"
        >
          <section
            className="matterClarificationModal"
            role="dialog"
            aria-modal="true"
          >
            <header className="matterClarificationModalHead">
              <div>
                <p className="matterEyebrow">
                  {getDraftCheckpointEyebrow(draftGenerationCheckpoint)}
                </p>
                <h2>{draftGenerationCheckpoint.title}</h2>
              </div>
              <span className="matterResearchModeStatus">
                {draftGenerationCheckpoint.status ===
                "review_ready_with_optional_inputs"
                  ? "guarded draft available"
                  : draftGenerationCheckpoint.questions.length ||
                      draftGenerationCheckpoint.requestedDocuments.length
                    ? "review before drafting"
                    : "ready to draft"}
              </span>
              <button
                type="button"
                className="matterClarificationCloseButton"
                aria-label="Close draft readiness checkpoint"
                onClick={() => void closeDraftGenerationCheckpoint()}
              >
                <X size={18} />
              </button>
            </header>
            <div className="matterClarificationModalBody">
              <article className="matterClarificationActiveCard uiCard">
                <div className="matterClarificationQuestionHero">
                  <h3>{draftGenerationCheckpoint.messageToUser}</h3>
                  <p>{draftGenerationCheckpoint.consequenceIfSkipped}</p>
                </div>

                {draftGenerationCheckpoint.blockingItems.length ? (
                  <div className="matterClarificationUploadGrid">
                    {draftGenerationCheckpoint.blockingItems.map((item) => (
                      <article
                        className="matterClarificationUploadCard uiCard"
                        key={`draft-blocker-${item}`}
                      >
                        <strong>{item}</strong>
                      </article>
                    ))}
                  </div>
                ) : null}

                {draftGenerationCheckpoint.questions.length ? (
                  <div className="matterClarificationChoiceFlow">
                    {draftGenerationCheckpoint.questions.map((question) => (
                      <div
                        className="matterClarificationUploadCard uiCard"
                        key={question.id}
                      >
                        <strong>{question.question}</strong>
                        <p>{question.whyItMatters}</p>
                        {question.answerType === "yes_no" ? (
                          <div className="matterClarificationOptionList">
                            {["yes", "no", "not_sure"].map((option) => (
                              <button
                                type="button"
                                key={`${question.id}-${option}`}
                                className={`matterClarificationOptionRow ${
                                  draftGenerationAnswers[question.id] === option
                                    ? "isSelected"
                                    : ""
                                }`}
                                onClick={() =>
                                  setDraftGenerationAnswers((current) => ({
                                    ...current,
                                    [question.id]: option,
                                  }))
                                }
                              >
                                <span className="matterClarificationOptionCheck" />
                                <span className="matterClarificationOptionContent">
                                  <strong>{option.replace(/_/g, " ")}</strong>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : question.answerType === "choice" &&
                          question.options?.length ? (
                          <div className="matterClarificationOptionList">
                            {question.options.map((option) => (
                              <button
                                type="button"
                                key={`${question.id}-${option}`}
                                className={`matterClarificationOptionRow ${
                                  draftGenerationAnswers[question.id] === option
                                    ? "isSelected"
                                    : ""
                                }`}
                                onClick={() =>
                                  setDraftGenerationAnswers((current) => ({
                                    ...current,
                                    [question.id]: option,
                                  }))
                                }
                              >
                                <span className="matterClarificationOptionCheck" />
                                <span className="matterClarificationOptionContent">
                                  <strong>{option}</strong>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            {question.suggestedAnswer ? (
                              <div className="matterClarificationOptionList">
                                <button
                                  type="button"
                                  className={`matterClarificationOptionRow ${
                                    draftGenerationAnswers[question.id] ===
                                    question.suggestedAnswer
                                      ? "isSelected"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    setDraftGenerationAnswers((current) => ({
                                      ...current,
                                      [question.id]:
                                        question.suggestedAnswer || "",
                                    }))
                                  }
                                >
                                  <span className="matterClarificationOptionCheck" />
                                  <span className="matterClarificationOptionContent">
                                    <strong>Use suggested answer</strong>
                                    <small>{question.suggestedAnswer}</small>
                                  </span>
                                </button>
                              </div>
                            ) : null}
                            <UiInput
                              type={
                                question.answerType === "date"
                                  ? "date"
                                  : question.answerType === "amount"
                                    ? "number"
                                    : "text"
                              }
                              value={draftGenerationAnswers[question.id] || ""}
                              onChange={(event) =>
                                setDraftGenerationAnswers((current) => ({
                                  ...current,
                                  [question.id]: event.target.value,
                                }))
                              }
                              placeholder="Type your answer"
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {draftGenerationCheckpoint.requestedDocuments.length ? (
                  <div className="matterClarificationUploadGrid">
                    {draftGenerationCheckpoint.requestedDocuments.map((item) => (
                      <article
                        className="matterClarificationUploadCard uiCard"
                        key={item.id}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.whyNeeded}</p>
                        <small>{item.unlocks}</small>
                        <div className="matterClarificationActions">
                          <UiButton
                            variant="secondary"
                            onClick={() => {
                              const prefill = [
                                `Add supporting files for: ${item.label}.`,
                                item.whyNeeded
                                  ? `Why needed: ${item.whyNeeded}.`
                                  : "",
                                `Target draft: ${draftGenerationCheckpoint.title}.`,
                                "Upload the strongest supporting records you have and note any missing dates or disputed facts.",
                              ]
                                .filter(Boolean)
                                .join(" ");
                              sessionStorage.setItem(
                                MATTER_APPEND_UPLOAD_SESSION_KEY,
                                "1",
                              );
                              sessionStorage.setItem(
                                MATTER_UPLOAD_PREFILL_QUERY_SESSION_KEY,
                                prefill,
                              );
                              window.dispatchEvent(
                                new Event("matter-uploader:append-open"),
                              );
                            }}
                          >
                            {item.interactionType === "either"
                              ? "Answer or upload support"
                              : "Upload supporting files"}
                          </UiButton>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="matterClarificationActions">
                  <UiButton
                    variant="primary"
                    onClick={() =>
                      void continueAtlasDraftGeneration(
                        "review_draft_with_placeholders",
                      )
                    }
                    disabled={isSubmittingDraftGeneration}
                  >
                    {isSubmittingDraftGeneration
                      ? "Starting..."
                      : draftGenerationCheckpoint.status ===
                          "review_ready_with_optional_inputs"
                        ? "Generate guarded review draft"
                        : "Generate review draft"}
                  </UiButton>
                  {draftGenerationCheckpoint.recommendedAlternativeDraftType ? (
                    <UiButton
                      variant="secondary"
                      onClick={() =>
                        void continueAtlasDraftGeneration(
                          "generate_safer_first_draft",
                        )
                      }
                      disabled={isSubmittingDraftGeneration}
                    >
                      {draftGenerationCheckpoint.recommendedAlternativeTitle
                        ? `Generate ${draftGenerationCheckpoint.recommendedAlternativeTitle}`
                        : "Generate safer first draft"}
                    </UiButton>
                  ) : null}
                  <UiButton
                    variant="outline"
                    onClick={() =>
                      void continueAtlasDraftGeneration("lawyer_review_draft")
                    }
                    disabled={isSubmittingDraftGeneration}
                  >
                    Continue as lawyer-review draft
                  </UiButton>
                  <UiButton
                    variant="secondary"
                    onClick={() => {
                      setUploadPopupMode("append");
                      setIsUploadPopupOpen(true);
                    }}
                  >
                    Upload missing proof
                  </UiButton>
                </div>
                {draftGenerationError ? (
                  <p className="matterBriefError">{draftGenerationError}</p>
                ) : null}
              </article>
            </div>
          </section>
        </div>
      ) : shouldShowClarificationState &&
        (activeAtlasCheckpoint || activeClarificationCheckpoint) ? (
        <div
          className="matterDialogBackdrop matterClarificationOverlay"
          role="presentation"
        >
          <section
            className="matterClarificationModal"
            role="dialog"
            aria-modal="true"
          >
            <header className="matterClarificationModalHead">
              <div>
                <p className="matterEyebrow">Focused Clarification</p>
                <h2>
                  {isClarificationAdvancing
                    ? "Associate is continuing the research"
                    : activeClarificationQuestion
                      ? "Associate needs one answer before continuing"
                      : "Associate is ready for the next step"}
                </h2>
              </div>
              <span className="matterResearchModeStatus">
                {isClarificationAdvancing
                  ? "live execution"
                  : activeClarificationQuestion
                    ? `question ${Math.min(
                        activeClarificationQuestionIndex + 1,
                        clarificationQuestions.length,
                      )} of ${clarificationQuestions.length}`
                    : "checkpoint ready"}
              </span>
              <button
                type="button"
                className="matterClarificationCloseButton"
                aria-label="Close clarification"
                onClick={() =>
                  activeMatter && isAtlasMatterFlow
                    ? dismissAtlasOverlay(activeMatter.id, "post-clarification")
                    : navigate("/")
                }
              >
                <X size={18} />
              </button>
            </header>

            {isClarificationAdvancing ? (
              <div className="matterClarificationModalBody">
                <div className="matterClarificationStack">
                  <div className="matterClarificationGhostCard is-back-two" />
                  <div className="matterClarificationGhostCard is-back-one" />
                  <article className="matterClarificationActiveCard uiCard">
                    <div className="matterClarificationQuestionHero">
                      <span className="matterIssueKey">
                        Research is moving forward
                      </span>
                      <h3>{clarificationAdvanceMessage}</h3>
                      <p>
                        Associate is updating the matter state and preparing the
                        next clarification or analysis step.
                      </p>
                    </div>
                    <div className="matterClarificationAdvanceLoader">
                      <div
                        className="matterResearchPulse matterResearchPulseLarge"
                        aria-hidden="true"
                      >
                        <span />
                        <span />
                        <span />
                      </div>
                      <div className="matterClarificationAdvanceLoaderText">
                        <strong>
                          {isMatterStatePolling
                            ? "Checking live matter state"
                            : "Finishing the current research step"}
                        </strong>
                        <span>
                          {isMatterStatePolling
                            ? "We are checking the saved matter state for the next available step."
                            : "Associate is completing the current atlas step and will update this workspace as soon as it returns."}
                        </span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            ) : activeClarificationQuestion ? (
              <div className="matterClarificationModalBody">
                <div className="matterClarificationStack">
                  <div className="matterClarificationGhostCard is-back-two" />
                  <div className="matterClarificationGhostCard is-back-one" />
                  <article
                    className="matterClarificationActiveCard uiCard"
                    key={activeClarificationQuestion.id}
                  >
                    <div className="matterClarificationQuestionHero">
                      <span className="matterIssueKey">
                        {activeClarificationQuestion.linkedIssue.replace(
                          /_/g,
                          " ",
                        )}
                      </span>
                      <h3>{activeClarificationQuestion.question}</h3>
                      <p>{activeClarificationQuestion.whyItMatters}</p>
                    </div>

                    {activeClarificationQuestion.answerType === "yes_no" ? (
                      <div className="matterClarificationOptionList">
                        {["yes", "no", "not_sure"].map((option) => (
                          <button
                            type="button"
                            key={`${activeClarificationQuestion.id}-${option}`}
                            className={`matterClarificationOptionRow ${
                              clarificationDraftAnswers[
                                activeClarificationQuestion.id
                              ] === option
                                ? "isSelected"
                                : ""
                            }`}
                            onClick={() => {
                              setClarificationDraftAnswers((current) => ({
                                ...current,
                                [activeClarificationQuestion.id]: option,
                              }));
                            }}
                          >
                            <span className="matterClarificationOptionCheck" />
                            <span className="matterClarificationOptionContent">
                              <strong>{option.replace(/_/g, " ")}</strong>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : activeClarificationQuestion.answerType === "choice" &&
                      activeClarificationQuestion.options?.length ? (
                      <div className="matterClarificationChoiceFlow">
                        <div className="matterClarificationOptionList">
                          {activeClarificationQuestion.options.map((option) => (
                            <button
                              type="button"
                              key={`${activeClarificationQuestion.id}-${option}`}
                              className={`matterClarificationOptionRow ${
                                clarificationDraftAnswers[
                                  activeClarificationQuestion.id
                                ] === option
                                  ? "isSelected"
                                  : ""
                              }`}
                              onClick={() =>
                                setClarificationDraftAnswers((current) => ({
                                  ...current,
                                  [activeClarificationQuestion.id]: option,
                                }))
                              }
                            >
                              <span className="matterClarificationOptionCheck" />
                              <span className="matterClarificationOptionContent">
                                <strong>{option}</strong>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="matterClarificationChoiceFlow">
                        <UiInput
                          type={
                            activeClarificationQuestion.answerType === "date"
                              ? "date"
                              : activeClarificationQuestion.answerType ===
                                  "amount"
                                ? "number"
                                : "text"
                          }
                          value={
                            clarificationDraftAnswers[
                              activeClarificationQuestion.id
                            ] || ""
                          }
                          onChange={(event) =>
                            setClarificationDraftAnswers((current) => ({
                              ...current,
                              [activeClarificationQuestion.id]:
                                event.target.value,
                            }))
                          }
                          placeholder="Type your answer"
                        />
                      </div>
                    )}

                    <div className="matterClarificationFooter">
                      <div className="matterClarificationFooterActions">
                        <UiButton
                          variant="ghost"
                          className="matterClarificationTextButton"
                          onClick={handleClarificationSkip}
                        >
                          Skip
                        </UiButton>
                        <UiButton
                          variant="ghost"
                          className="matterClarificationTextButton"
                          onClick={handleClarificationSkipAll}
                        >
                          Skip all
                        </UiButton>
                      </div>
                      <UiButton
                        variant="primary"
                        className="matterClarificationIconButton"
                        disabled={!canAdvanceClarificationQuestion}
                        onClick={() => void handleClarificationAnswerAdvance()}
                      >
                        <ArrowRight size={18} />
                      </UiButton>
                    </div>
                  </article>
                </div>
              </div>
            ) : (
              <div className="matterClarificationModalBody">
                <article className="matterClarificationActiveCard uiCard">
                  <div className="matterClarificationQuestionHero">
                    <h3>
                      {activeAtlasCheckpoint?.messageToUser ||
                        activeClarificationCheckpoint?.messageToUser}
                    </h3>
                    <p>
                      {activeAtlasCheckpoint?.consequenceIfSkipped ||
                        activeClarificationCheckpoint?.consequenceIfSkipped}
                    </p>
                  </div>

                  {(
                    activeAtlasCheckpoint?.requestedDocuments ||
                    activeClarificationCheckpoint?.requestedDocuments ||
                    []
                  ).length ? (
                    <div className="matterClarificationUploadGrid">
                      {(
                        activeAtlasCheckpoint?.requestedDocuments ||
                        activeClarificationCheckpoint?.requestedDocuments ||
                        []
                      ).map((item) => (
                        <article
                          className="matterClarificationUploadCard uiCard"
                          key={item.id}
                        >
                          <strong>{item.label}</strong>
                          <p>{item.whyNeeded}</p>
                          <small>{item.unlocks}</small>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <div className="matterClarificationActions">
                    {clarificationQuestions.length ? (
                      <UiButton
                        variant="primary"
                        onClick={() =>
                          activeMatter &&
                          void submitClarificationAnswers(activeMatter.id)
                        }
                        disabled={isSubmittingClarification}
                      >
                        {isSubmittingClarification
                          ? "Submitting..."
                          : "Use these answers"}
                      </UiButton>
                    ) : null}
                    <UiButton
                      variant="secondary"
                      onClick={() => {
                        setUploadPopupMode("append");
                        setIsUploadPopupOpen(true);
                      }}
                    >
                      Upload more documents
                    </UiButton>
                    {activeAtlasCheckpoint?.canContinueWithLimitedResearch ||
                    activeClarificationCheckpoint?.canContinueWithoutAnswers ? (
                      <UiButton
                        variant="outline"
                        onClick={() =>
                          activeMatter &&
                          void continueWithLimitedSummary(activeMatter.id)
                        }
                      >
                        Continue with limited summary
                      </UiButton>
                    ) : null}
                  </div>
                </article>
                {clarificationSubmitError ? (
                  <p className="matterBriefError">{clarificationSubmitError}</p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {isBriefDetailModalOpen &&
      (activeBriefArtifact || activeAtlasMatterBrief) ? (
        <div className="matterDialogBackdrop" role="presentation">
          <section
            className="matterBriefDetailDialog"
            role="dialog"
            aria-modal="true"
          >
            <header className="matterBriefDetailHead">
              <div>
                <p className="matterEyebrow">Detailed Brief</p>
                <h2>
                  {activeSummaryTitle ||
                    activeOverview?.headline ||
                    "Detailed analysis"}
                </h2>
              </div>
              <Button
                type="button"
                aria-label="Close detailed brief"
                onClick={() => setIsBriefDetailModalOpen(false)}
                showImage
                image={<X size={18} />}
              />
            </header>
            <div className="matterBriefDetailBody">
              {activeAtlasMatterBrief ? (
                <>
                  {activeAtlasMatterBrief.detailedBrief ? (
                    <section className="matterBriefDetailSection">
                      <h3>Detailed brief</h3>
                      <div className="matterReadableTextBlock">
                        {splitReadableParagraphs(
                          activeAtlasMatterBrief.detailedBrief,
                        ).map((paragraph, index) => (
                          <p key={`atlas-detailed-brief-${index}`}>{paragraph}</p>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {activeAtlasDeciderResearch ? (
                    <section className="matterBriefDetailSection">
                      <h3>Workflow grounding</h3>
                      <div className="matterReadableTextBlock">
                        {splitReadableParagraphs(
                          activeAtlasDeciderResearch.agentBrief,
                        ).map((paragraph, index) => (
                          <p key={`atlas-agent-brief-${index}`}>{paragraph}</p>
                        ))}
                      </div>
                      {activeAtlasDeciderResearch.workflowGrounding.length ? (
                        <ul className="matterBulletList">
                          {activeAtlasDeciderResearch.workflowGrounding.map(
                            (item) => (
                              <li key={`atlas-workflow-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : null}
                      {activeAtlasDeciderResearch.documentGrounding.length ? (
                        <>
                          <h3>Document grounding</h3>
                          <ul className="matterBulletList">
                            {activeAtlasDeciderResearch.documentGrounding.map(
                              (item) => (
                                <li key={`atlas-document-${item}`}>{item}</li>
                              ),
                            )}
                          </ul>
                        </>
                      ) : null}
                    </section>
                  ) : null}
                  {activeAtlasMatterBrief.recordSupports?.length ||
                  activeAtlasMatterBrief.recordDoesNotSupportYet?.length ||
                  activeAtlasMatterBrief.recordContradicts?.length ? (
                    <section className="matterBriefDetailSection">
                      <h3>Grounding summary</h3>
                      {activeAtlasMatterBrief.recordSupports?.length ? (
                        <>
                          <h4>Supported by the record</h4>
                          <ul className="matterBulletList">
                            {activeAtlasMatterBrief.recordSupports.map((item) => (
                              <li key={`atlas-support-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {activeAtlasMatterBrief.recordDoesNotSupportYet?.length ? (
                        <>
                          <h4>Not yet supported</h4>
                          <ul className="matterBulletList">
                            {activeAtlasMatterBrief.recordDoesNotSupportYet.map(
                              (item) => (
                                <li key={`atlas-unsupported-${item}`}>{item}</li>
                              ),
                            )}
                          </ul>
                        </>
                      ) : null}
                      {activeAtlasMatterBrief.recordContradicts?.length ? (
                        <>
                          <h4>Contradicted by the current record</h4>
                          <ul className="matterBulletList">
                            {activeAtlasMatterBrief.recordContradicts.map((item) => (
                              <li key={`atlas-contradiction-${item}`}>{item}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </section>
                  ) : null}

                  {activeAtlasCaseResearch ? (
                    <section className="matterBriefDetailSection">
                      <h3>Procedural patterns</h3>
                      {activeAtlasCaseResearch.procedurePatterns.length ? (
                        <ul className="matterBulletList">
                          {activeAtlasCaseResearch.procedurePatterns.map(
                            (item) => (
                              <li key={`atlas-pattern-${item}`}>{item}</li>
                            ),
                          )}
                        </ul>
                      ) : null}
                    </section>
                  ) : null}
                  {activeAtlasMatterBrief.citations?.length ? (
                    <section className="matterBriefDetailSection">
                      <h3>Verified citations</h3>
                      <ul className="matterBulletList">
                        {activeAtlasMatterBrief.citations.map((item) => (
                          <li key={`${item.title}-${item.citation}`}>
                            <strong>{item.title}</strong>
                            {item.citation ? ` (${item.citation})` : ""}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              ) : activeDetailedBrief?.contractualFramework?.length ? (
                <section className="matterBriefDetailSection">
                  <h3>Contractual Framework</h3>
                  <div className="matterFrameworkCardGrid">
                    {activeDetailedBrief.contractualFramework.map((item) => (
                      <article className="matterFrameworkCard" key={item.id}>
                        <strong>{item.topic}</strong>
                        <p>{item.summary}</p>
                        <small>{item.legalEffect}</small>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              {activeDetailedBrief?.issueAnalysis?.length ? (
                <section className="matterBriefDetailSection">
                  <h3>Issue Analysis</h3>
                  <div className="matterIssueAccordion">
                    {activeDetailedBrief.issueAnalysis.map((issue) => (
                      <article
                        className="matterIssueCard"
                        key={`modal-${issue.id}`}
                      >
                        <div className="matterIssueCardHead">
                          <div>
                            <h4>{issue.title}</h4>
                            <span className="matterIssueKey">
                              {issue.id.replace(/_/g, " ")}
                            </span>
                          </div>
                          <span
                            className={`matterIssueSupportBadge is-${issue.supportLevel}`}
                          >
                            {formatSupportLevelLabel(issue.supportLevel)}
                          </span>
                        </div>
                        <div className="matterIssueCardBody isOpen">
                          <p>{issue.shortAnswer}</p>
                          <p>{issue.detailedAnalysis}</p>
                          {issue.missingProof.length ? (
                            <ul className="matterBulletList">
                              {issue.missingProof.map((item) => (
                                <li key={`${issue.id}-${item}`}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

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

      {caseViewer ? (
        <div className="matterDialogBackdrop" role="presentation">
          <section
            className="matterSourceDialog matterCaseViewerDialog"
            role="dialog"
            aria-modal="true"
          >
            <header className="matterSourceDialogHead">
              <div>
                <p className="matterEyebrow">Official Case Source</p>
                <h2>{caseViewer.title}</h2>
              </div>
              <div className="matterSourceDialogActions">
                <Button
                  type="button"
                  className="matterStartDraftingBtn"
                  onClick={() =>
                    window.open(
                      caseViewer.officialViewerUrl,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  Open in new tab
                </Button>
                <Button
                  type="button"
                  aria-label="Close case source"
                  onClick={() => setCaseViewer(null)}
                  showImage
                  image={<X size={18} />}
                />
              </div>
            </header>
            <div className="matterSourceWorkspace matterCaseViewerWorkspace">
              <div className="matterCaseViewerFrameWrap">
                <iframe
                  title={caseViewer.title}
                  src={caseViewer.officialViewerUrl}
                  className="matterCaseViewerFrame"
                />
              </div>
              <aside className="matterSourceContextRail matterCaseViewerRail">
                <span>Relevant excerpt</span>
                <p>{caseViewer.relevantExcerpt}</p>
                <small>
                  {caseViewer.relevantExcerptTitle}
                  {caseViewer.pageNumber
                    ? ` · Page ${caseViewer.pageNumber}`
                    : ""}
                </small>
                <small>{caseViewer.officialCitation}</small>
                <small>{caseViewer.sourceCourt}</small>
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};

export default MatterSection;
