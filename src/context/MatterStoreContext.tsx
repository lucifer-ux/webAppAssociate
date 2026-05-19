import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { buildApiUrl } from "../lib/apiBase";

const MATTER_JOB_TTL_MS = 60 * 60 * 1000;

export type MatterValidationSummary = {
  accepted: boolean;
  size_bytes: number;
  declared_extension: string;
  declared_kind: "pdf" | "md" | "txt" | "mixed" | string;
  detected_extension: string | null;
  detected_mime: string;
  sha256: string;
  parse: {
    kind: "pdf" | "md" | "txt" | "mixed" | string;
    page_count: number | null;
    estimated_pages: number | null;
    is_encrypted: boolean;
    is_corrupt: boolean;
  };
};

export type MatterUploadPayload = {
  id: string;
  job_id: string;
  title: string;
  fileName: string;
  mimeType: string;
  document_type: string;
  status: "processed" | "failed" | "processing";
  uploaded_at: string;
  uploadedAt: string;
  page_count: number;
  word_count: number;
  sha256: string;
  kind: "pdf" | "md" | "txt" | "mixed" | "document" | string;
  versionFingerprint: string;
  document_count?: number;
  intelligence_statuses?: {
    extraction?: string;
    field_extraction?: string;
    brief_generation?: string;
    brief_verification?: string;
    next_step_planner?: string;
    draft_review?: string;
  };
  documents?: Array<{
    index: number;
    file_name: string;
    size_bytes: number;
  }>;
  storage?: {
    provider: string;
    bucketId: string;
    bucketName: string;
    fileId: string;
    fileName: string;
    url: string;
    uploadedAt: string;
  };
  extraction_artifact?: {
    path: string;
    storage: {
      provider: string;
      bucketId: string;
      bucketName: string;
      fileId: string;
      fileName: string;
      url: string;
      uploadedAt: string;
    };
  };
};

export type MatterPreviewSource = "server" | "none";

export type TextQualityLevel = "GOOD" | "MEDIUM" | "LOW";

export type TextQualityReport = {
  level: TextQualityLevel;
  score: number;
  usable_for_ai: boolean;
  issues: string[];
  metrics: {
    character_count: number;
    word_count: number;
    empty_pages: number;
    garbled_ratio: number;
    weird_symbol_ratio: number;
    repeated_header_footer_count: number;
    table_like_block_count: number;
    language_script: string;
    ocr_confidence: number | null;
  };
};

export type PageAwareBlock = {
  block_id: string;
  type: "heading" | "paragraph" | "table";
  text: string;
  page: number;
  page_block_index: number;
  doc_char_start: number;
  doc_char_end: number;
};

export type ClauseSourceRef = {
  block_id: string;
  page: number;
  quote_text: string;
  start_char_in_block: number;
  end_char_in_block: number;
};

export type ClauseItem = {
  clause_id: string;
  heading: string;
  display_text: string;
  source_refs: ClauseSourceRef[];
  grounding_status: "exact" | "approximate";
};

export type ClauseSection = {
  section_id: string;
  section_type: string;
  section_label: string;
  page_start: number;
  page_end: number;
  extraction_status: "ready" | "failed" | "skipped";
  error: string | null;
  clauses: ClauseItem[];
};

export type PageAwareStructure = {
  document_id: string;
  full_text: string;
  sections: ClauseSection[];
  pages: Array<{
    page_number: number;
    label?: string;
    blocks: PageAwareBlock[];
  }>;
};

export type MatterPageIndexItem = {
  type: string;
  label: string;
  start: number;
  end: number;
  status: "clean" | "flagged";
};

export type MatterExtractedFields = {
  parties: Array<{ name: string; role: string; confidence: string }>;
  effective_date: { value: string | null; confidence: string };
  governing_law: { value: string | null; confidence: string };
  contract_term: { value: string | null; confidence: string };
  notice_period: { value: string | null; confidence: string };
};

export type MatterExtractedFieldsStatus = "processing" | "ready" | "failed";

export type MatterPerson = {
  id: string;
  initials: string;
  name: string;
  role: string;
  description: string;
  source: "extracted" | "manual";
  confidence?: string;
};

export type ObligationParty = "ippb" | "service_provider" | "mutual";

export type ObligationItem = {
  clause_id: string;
  party: ObligationParty;
  confidence: "high" | "medium" | "low";
  rationale_short: string;
};

export type ObligationMapResult = {
  matter_id: string;
  version_fingerprint: string;
  counts: {
    ippb: number;
    service_provider: number;
    mutual: number;
  };
  imbalance: {
    level: "red" | "amber" | "green";
    ratio: number | null;
  };
  obligations: ObligationItem[];
  generated_at: string;
};

export type ClauseRiskOrientation =
  | "favors_ippb"
  | "favors_service_provider"
  | "mutual";

export type ClauseRiskBucket = "high" | "review" | "clean";

export type SectionClauseRiskItem = {
  clause_id: string;
  orientation: ClauseRiskOrientation;
  risk: ClauseRiskBucket;
  confidence: "high" | "medium" | "low";
};

export type SectionRiskMapResult = {
  matter_id: string;
  version_fingerprint: string;
  section_id: string;
  section_label: string;
  section_flag:
    | "FAVORS IPPB"
    | "FAVORS SERVICE PROVIDER"
    | "MUTUAL"
    | "REVIEW";
  counts: {
    high: number;
    review: number;
    clean: number;
  };
  items: SectionClauseRiskItem[];
  generated_at: string;
};

export type MatterHealth = {
  missing_clauses: string[];
  flagged_clauses: string[];
  completeness_score: number;
};

export type MatterNextStep =
  | "BUILD_PAGE_AWARE_STRUCTURE"
  | "RUN_OCR_OR_ASK_USER_FOR_BETTER_COPY";

export type AcceptedRedline = {
  id: string;
  matterId: string;
  clauseId: string;
  title: string;
  clauseHeading: string;
  clauseType: string;
  sectionLabel: string;
  representedParty: "ippb" | "service_provider";
  position: "aggressive" | "market" | "fallback";
  originalText: string;
  rewrittenText: string;
  acceptedAt: string;
};

export type MatterRecord = MatterUploadPayload & {
  version: number;
  validation: MatterValidationSummary;
  previewText: string;
  previewTextSource: MatterPreviewSource;
  textQuality: TextQualityReport;
  nextStep: MatterNextStep;
  pageAwareStructure: PageAwareStructure;
  pageIndex: MatterPageIndexItem[];
  extractedFields: MatterExtractedFields;
  extractedFieldsStatus: MatterExtractedFieldsStatus;
  extractedFieldsError: string | null;
  health: MatterHealth;
  people: MatterPerson[];
  documentResults?: MatterProcessedResult["documents"];
  documentStatuses?: MatterProcessedResult["document_statuses"];
  matterBrief?: MatterProcessedResult["matter_brief"];
  verifiedBrief?: MatterProcessedResult["verified_brief"];
  briefVerification?: MatterProcessedResult["brief_verification"];
  nextStepPlan?: MatterProcessedResult["next_step_plan"];
  draftingContext?: MatterProcessedResult["drafting_context"];
  latestDraftReview?: MatterProcessedResult["latest_draft_review"];
};

export type MatterProcessedResult = {
  matter: MatterUploadPayload;
  documents?: Array<{
    document: MatterUploadPayload;
    validation: MatterValidationSummary;
    preview_text: string;
    preview_text_source: MatterPreviewSource;
    text_quality: TextQualityReport;
    next_step: MatterNextStep;
    page_aware_structure: PageAwareStructure;
    page_index: MatterPageIndexItem[];
    extracted_fields: MatterExtractedFields;
    extracted_fields_status: MatterExtractedFieldsStatus;
    extracted_fields_error: string | null;
    health: MatterHealth;
    pipeline_statuses?: Record<string, string>;
  }>;
  document_statuses?: Record<
    string,
    {
      file_name: string;
      extraction_status: string;
      field_extraction_status: string;
      error: string | null;
    }
  >;
  validation: MatterValidationSummary;
  preview_text: string;
  preview_text_source: MatterPreviewSource;
  text_quality: TextQualityReport;
  next_step: MatterNextStep;
  page_aware_structure: PageAwareStructure;
  page_index: MatterPageIndexItem[];
  extracted_fields: MatterExtractedFields;
  extracted_fields_status: MatterExtractedFieldsStatus;
  extracted_fields_error: string | null;
  health: MatterHealth;
  matter_brief?: Record<string, unknown> | null;
  verified_brief?: Record<string, unknown> | null;
  brief_verification?: Record<string, unknown> | null;
  next_step_plan?: Record<string, unknown> | null;
  drafting_context?: Record<string, unknown> | null;
  latest_draft_review?: Record<string, unknown> | null;
};

type MatterStoreContextValue = {
  matters: MatterRecord[];
  activeMatterId: string | null;
  activeMatter: MatterRecord | null;
  isSavedMattersLoading: boolean;
  addMatter: (result: MatterProcessedResult) => MatterRecord;
  updateMatter: (result: MatterProcessedResult) => void;
  markMatterJobExpired: (matterId: string) => void;
  setMattersFromServer: (results: MatterProcessedResult[]) => void;
  setIsSavedMattersLoading: (value: boolean) => void;
  deleteMatter: (matterId: string) => void;
  addPersonToMatter: (
    matterId: string,
    person: Omit<MatterPerson, "id" | "initials" | "source">,
  ) => void;
  removePersonFromMatter: (matterId: string, personId: string) => void;
  getObligationMap: (matterId: string) => ObligationMapResult | null;
  setObligationMap: (matterId: string, map: ObligationMapResult) => void;
  clearObligationMap: (matterId: string) => void;
  getSectionRiskMap: (
    matterId: string,
    sectionId: string,
  ) => SectionRiskMapResult | null;
  setSectionRiskMap: (
    matterId: string,
    sectionId: string,
    map: SectionRiskMapResult,
  ) => void;
  clearSectionRiskMaps: (matterId: string) => void;
  getHighRiskClauseCount: (matterId: string) => number;
  getAcceptedRedlines: (matterId: string) => AcceptedRedline[];
  setAcceptedRedlines: (matterId: string, redlines: AcceptedRedline[]) => void;
  addAcceptedRedline: (redline: AcceptedRedline) => void;
  removeAcceptedRedline: (matterId: string, redlineId: string) => void;
  updateAcceptedRedline: (
    matterId: string,
    redlineId: string,
    patch: Partial<Pick<AcceptedRedline, "title" | "rewrittenText">>,
  ) => void;
  getPendingRedlineCount: (matterId: string) => number;
  setActiveMatterId: (id: string | null) => void;
};

const MatterStoreContext = createContext<MatterStoreContextValue | null>(null);

const createInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
};

const createPersonId = () =>
  `person_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const peopleFromExtractedParties = (
  parties: MatterExtractedFields["parties"],
): MatterPerson[] =>
  parties.map((party, index) => ({
    id: `extracted_person_${index}_${party.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    initials: createInitials(party.name),
    name: party.name,
    role: party.role || "Party",
    description: `${party.confidence || "unknown"} confidence`,
    source: "extracted",
    confidence: party.confidence,
  }));

const mergePeople = (
  existingPeople: MatterPerson[],
  extractedParties: MatterExtractedFields["parties"],
) => {
  const manualPeople = existingPeople.filter((person) => person.source === "manual");
  return [...peopleFromExtractedParties(extractedParties), ...manualPeople];
};

const normalizeSavedJobState = (
  matter: MatterUploadPayload,
  extractedFieldsStatus: MatterExtractedFieldsStatus,
  extractedFieldsError: string | null,
) => {
  const uploadedAtMs = new Date(matter.uploadedAt || matter.uploaded_at || "").getTime();
  const isExpiredJob =
    Boolean(matter.job_id) &&
    Number.isFinite(uploadedAtMs) &&
    Date.now() - uploadedAtMs > MATTER_JOB_TTL_MS;

  if (!isExpiredJob) {
    return {
      ...matter,
      extractedFieldsStatus,
      extractedFieldsError,
    };
  }

  return {
    ...matter,
    job_id: "",
    extractedFieldsStatus:
      extractedFieldsStatus === "processing" ? "failed" : extractedFieldsStatus,
    extractedFieldsError:
      extractedFieldsStatus === "processing"
        ? "Saved job state expired. Refresh or re-upload if more processing is needed."
        : extractedFieldsError,
    intelligence_statuses: {
      ...matter.intelligence_statuses,
      brief_generation:
        matter.intelligence_statuses?.brief_generation === "processing"
          ? "failed"
          : matter.intelligence_statuses?.brief_generation,
      brief_verification:
        matter.intelligence_statuses?.brief_verification === "processing"
          ? "failed"
          : matter.intelligence_statuses?.brief_verification,
      next_step_planner:
        matter.intelligence_statuses?.next_step_planner === "processing"
          ? "failed"
          : matter.intelligence_statuses?.next_step_planner,
    },
  };
};

const buildMatterRecord = (
  result: MatterProcessedResult,
  version: number,
  existingPeople: MatterPerson[] = [],
): MatterRecord => {
  const normalizedMatter = normalizeSavedJobState(
    result.matter,
    result.extracted_fields_status,
    result.extracted_fields_error,
  );

  return {
    ...normalizedMatter,
    version,
    validation: result.validation,
    previewText: result.preview_text,
    previewTextSource: result.preview_text_source || "server",
    textQuality: result.text_quality,
    nextStep: result.next_step,
    pageAwareStructure: result.page_aware_structure,
    pageIndex: result.page_index,
    extractedFields: result.extracted_fields,
    extractedFieldsStatus: normalizedMatter.extractedFieldsStatus,
    extractedFieldsError: normalizedMatter.extractedFieldsError,
    health: result.health,
    people: mergePeople(existingPeople, result.extracted_fields.parties || []),
    documentResults: result.documents,
    documentStatuses: result.document_statuses,
    matterBrief: result.matter_brief || undefined,
    verifiedBrief: result.verified_brief || undefined,
    briefVerification: result.brief_verification || undefined,
    nextStepPlan: result.next_step_plan || undefined,
    draftingContext: result.drafting_context || undefined,
    latestDraftReview: result.latest_draft_review || undefined,
  };
};

export const MatterStoreProvider = ({ children }: PropsWithChildren) => {
  const [matters, setMatters] = useState<MatterRecord[]>([]);
  const [activeMatterId, setActiveMatterId] = useState<string | null>(null);
  const [isSavedMattersLoading, setIsSavedMattersLoading] = useState(true);
  const [obligationMapByMatter, setObligationMapByMatter] = useState<
    Record<string, ObligationMapResult>
  >({});
  const [sectionRiskMapByMatter, setSectionRiskMapByMatter] = useState<
    Record<string, Record<string, SectionRiskMapResult>>
  >({});
  const [acceptedRedlinesByMatter, setAcceptedRedlinesByMatter] = useState<
    Record<string, AcceptedRedline[]>
  >({});

  useEffect(() => {
    let cancelled = false;

    const loadStoredMatters = async () => {
      setIsSavedMattersLoading(true);
      try {
        const response = await fetch(buildApiUrl("/api/matters"));
        const payload = (await response.json()) as {
          success?: boolean;
          matters?: MatterProcessedResult[];
        };
        if (cancelled || !response.ok || !payload?.success) {
          return;
        }
        setMattersFromServer(
          Array.isArray(payload.matters) ? payload.matters : [],
        );
      } catch {
        // Ignore hydration failures; uploads still work.
      } finally {
        if (!cancelled) {
          setIsSavedMattersLoading(false);
        }
      }
    };

    void loadStoredMatters();
    return () => {
      cancelled = true;
    };
  }, []);

  const addMatter = (result: MatterProcessedResult) => {
    let createdRecord: MatterRecord | null = null;

    setMatters((prev) => {
      const duplicate = prev.find((item) => item.sha256 === result.matter.sha256);
      if (duplicate) {
        createdRecord = buildMatterRecord(
          result,
          duplicate.version,
          duplicate.people,
        );
        return prev.map((item) =>
          item.id === duplicate.id ? (createdRecord as MatterRecord) : item,
        );
      }

      const matchingNameVersions = prev.filter(
        (item) => item.fileName === result.matter.fileName,
      );
      const nextVersion =
        matchingNameVersions.reduce(
          (max, item) => Math.max(max, item.version),
          0,
        ) + 1;

      createdRecord = buildMatterRecord(result, nextVersion);

      return [createdRecord, ...prev];
    });

    const finalRecord =
      createdRecord ||
      (buildMatterRecord(result, 1) satisfies MatterRecord);

    setActiveMatterId(finalRecord.id);
    return finalRecord;
  };

  const updateMatter = (result: MatterProcessedResult) => {
    setMatters((prev) =>
      prev.map((matter) => {
        if (matter.id !== result.matter.id && matter.sha256 !== result.matter.sha256) {
          return matter;
        }

        return buildMatterRecord(result, matter.version, matter.people);
      }),
    );
  };

  const markMatterJobExpired = (matterId: string) => {
    setMatters((prev) =>
      prev.map((matter) => {
        if (matter.id !== matterId) return matter;
        return {
          ...matter,
          job_id: "",
          extractedFieldsStatus:
            matter.extractedFieldsStatus === "processing"
              ? "failed"
              : matter.extractedFieldsStatus,
          extractedFieldsError:
            matter.extractedFieldsStatus === "processing"
              ? "Saved job state expired. Refresh or re-upload if more processing is needed."
              : matter.extractedFieldsError,
          intelligence_statuses: {
            ...matter.intelligence_statuses,
            brief_generation:
              matter.intelligence_statuses?.brief_generation === "processing"
                ? "failed"
                : matter.intelligence_statuses?.brief_generation,
            brief_verification:
              matter.intelligence_statuses?.brief_verification === "processing"
                ? "failed"
                : matter.intelligence_statuses?.brief_verification,
            next_step_planner:
              matter.intelligence_statuses?.next_step_planner === "processing"
                ? "failed"
                : matter.intelligence_statuses?.next_step_planner,
          },
        };
      }),
    );
  };

  const setMattersFromServer = (results: MatterProcessedResult[]) => {
    if (!Array.isArray(results)) return;

    let defaultActiveMatterId: string | null = null;

    setMatters((prev) => {
      const next = [...prev];
      results.forEach((result) => {
        const existing = next.find(
          (item) => item.id === result.matter.id || item.sha256 === result.matter.sha256,
        );
        if (existing) {
          const patched = buildMatterRecord(result, existing.version, existing.people);
          const index = next.findIndex((item) => item.id === existing.id);
          next[index] = patched;
          return;
        }
        next.push(buildMatterRecord(result, 1));
      });

      next.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
      defaultActiveMatterId = next[0]?.id || null;
      return next;
    });

    if (defaultActiveMatterId) {
      setActiveMatterId((current) => current || defaultActiveMatterId);
    }
  };

  const deleteMatter = (matterId: string) => {
    setMatters((prev) => prev.filter((matter) => matter.id !== matterId));
    setObligationMapByMatter((prev) => {
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setSectionRiskMapByMatter((prev) => {
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setAcceptedRedlinesByMatter((prev) => {
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
    setActiveMatterId((current) => (current === matterId ? null : current));
  };

  const addPersonToMatter = (
    matterId: string,
    person: Omit<MatterPerson, "id" | "initials" | "source">,
  ) => {
    setMatters((prev) =>
      prev.map((matter) => {
        if (matter.id !== matterId) return matter;
        const created: MatterPerson = {
          ...person,
          id: createPersonId(),
          initials: createInitials(person.name),
          source: "manual",
        };
        return {
          ...matter,
          people: [...matter.people, created],
        };
      }),
    );
  };

  const removePersonFromMatter = (matterId: string, personId: string) => {
    setMatters((prev) =>
      prev.map((matter) => {
        if (matter.id !== matterId) return matter;
        return {
          ...matter,
          people: matter.people.filter((person) => person.id !== personId),
        };
      }),
    );
  };

  const activeMatter =
    matters.find((matter) => matter.id === activeMatterId) || null;

  const getObligationMap = (matterId: string) =>
    obligationMapByMatter[matterId] || null;

  const setObligationMap = (matterId: string, map: ObligationMapResult) => {
    setObligationMapByMatter((prev) => ({ ...prev, [matterId]: map }));
  };

  const clearObligationMap = (matterId: string) => {
    setObligationMapByMatter((prev) => {
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
  };

  const getSectionRiskMap = (matterId: string, sectionId: string) =>
    sectionRiskMapByMatter[matterId]?.[sectionId] || null;

  const setSectionRiskMap = (
    matterId: string,
    sectionId: string,
    map: SectionRiskMapResult,
  ) => {
    setSectionRiskMapByMatter((prev) => ({
      ...prev,
      [matterId]: {
        ...(prev[matterId] || {}),
        [sectionId]: map,
      },
    }));
  };

  const clearSectionRiskMaps = (matterId: string) => {
    setSectionRiskMapByMatter((prev) => {
      const next = { ...prev };
      delete next[matterId];
      return next;
    });
  };

  const getHighRiskClauseCount = (matterId: string) =>
    Object.values(sectionRiskMapByMatter[matterId] || {}).reduce(
      (total, section) => total + (section.counts.high || 0),
      0,
    );

  const getAcceptedRedlines = (matterId: string) =>
    acceptedRedlinesByMatter[matterId] || [];

  const setAcceptedRedlines = (matterId: string, redlines: AcceptedRedline[]) => {
    setAcceptedRedlinesByMatter((prev) => ({
      ...prev,
      [matterId]: Array.isArray(redlines) ? redlines : [],
    }));
  };

  const addAcceptedRedline = (redline: AcceptedRedline) => {
    setAcceptedRedlinesByMatter((prev) => {
      const current = prev[redline.matterId] || [];
      const duplicate = current.find(
        (item) =>
          item.clauseId === redline.clauseId &&
          item.position === redline.position &&
          item.rewrittenText === redline.rewrittenText,
      );
      if (duplicate) return prev;
      return {
        ...prev,
        [redline.matterId]: [redline, ...current],
      };
    });
  };

  const removeAcceptedRedline = (matterId: string, redlineId: string) => {
    setAcceptedRedlinesByMatter((prev) => {
      const current = prev[matterId] || [];
      if (!current.length) return prev;
      const next = current.filter((item) => item.id !== redlineId);
      return { ...prev, [matterId]: next };
    });
  };

  const updateAcceptedRedline = (
    matterId: string,
    redlineId: string,
    patch: Partial<Pick<AcceptedRedline, "title" | "rewrittenText">>,
  ) => {
    setAcceptedRedlinesByMatter((prev) => {
      const current = prev[matterId] || [];
      if (!current.length) return prev;
      const next = current.map((item) =>
        item.id === redlineId
          ? {
              ...item,
              ...(typeof patch.title === "string" ? { title: patch.title } : {}),
              ...(typeof patch.rewrittenText === "string"
                ? { rewrittenText: patch.rewrittenText }
                : {}),
            }
          : item,
      );
      return { ...prev, [matterId]: next };
    });
  };

  const getPendingRedlineCount = (matterId: string) =>
    (acceptedRedlinesByMatter[matterId] || []).length;

  return (
    <MatterStoreContext.Provider
      value={{
        matters,
        activeMatterId,
        activeMatter,
        isSavedMattersLoading,
        addMatter,
        updateMatter,
        markMatterJobExpired,
        setMattersFromServer,
        setIsSavedMattersLoading,
        deleteMatter,
        addPersonToMatter,
        removePersonFromMatter,
        getObligationMap,
        setObligationMap,
        clearObligationMap,
        getSectionRiskMap,
        setSectionRiskMap,
        clearSectionRiskMaps,
        getHighRiskClauseCount,
        getAcceptedRedlines,
        setAcceptedRedlines,
        addAcceptedRedline,
        removeAcceptedRedline,
        updateAcceptedRedline,
        getPendingRedlineCount,
        setActiveMatterId,
      }}
    >
      {children}
    </MatterStoreContext.Provider>
  );
};

export const useMatterStore = () => {
  const context = useContext(MatterStoreContext);
  if (!context) {
    throw new Error("useMatterStore must be used within MatterStoreProvider");
  }
  return context;
};
