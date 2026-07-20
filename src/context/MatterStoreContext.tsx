import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { buildApiUrl } from "../lib/apiBase";
import { useAuth } from "./AuthContext";

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

export type ContextCoreMatterState = {
  enabled: boolean;
  status:
    | "not_requested"
    | "processing"
    | "ready"
    | "failed"
    | "stale"
    | string;
  chunk_count?: number | null;
  indexed_at?: string | null;
  overlay_dir?: string | null;
  error?: string | null;
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
  user_message?: string;
  classification?: {
    classification_id: string | null;
    classification_name: string;
    track: string | null;
    forums: string[];
    reason: string;
    confidence: string;
  };
  classification_meta?: {
    degraded?: boolean;
    model?: string | null;
    error?: string | null;
    raw_response_excerpt?: string;
    user_defined_tags?: string[];
  };
  contextcore?: ContextCoreMatterState;
  document_count?: number;
  intelligence_statuses?: {
    extraction?: string;
    field_extraction?: string;
    brief_generation?: string;
    brief_verification?: string;
    executive_summary?: string;
    next_step_planner?: string;
    draft_review?: string;
    debrief_generation?: string;
    debrief_verification?: string;
    law_generation?: string;
    law_verification?: string;
    inference_generation?: string;
    inference_verification?: string;
  };
  analysis_state?: {
    status?: string;
    currentStage?: string;
    feed?: Array<{
      id: string;
      label: string;
      state: "done" | "current" | "waiting" | "attention";
      message: string;
      rotationMessages?: string[];
    }>;
    whatWeFound?: Array<{
      id?: string;
      label: string;
      value: string;
      state?: string;
    }>;
    pendingClarification?: unknown;
    canContinueWithLimitedSummary?: boolean;
    latestArtifactIds?: Record<string, string | null>;
    stageTimings?: Record<
      string,
      {
        startedAt?: string;
        completedAt?: string;
        elapsedMs?: number;
        reused?: boolean;
        model?: string | null;
        provider?: string | null;
        error?: string | null;
      }
    >;
    totalElapsedMs?: number | null;
    updatedAt?: string;
    error?: string | null;
  } | null;
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
  accumulatedBrief?: MatterProcessedResult["accumulated_brief"];
  accumulatedBriefReadiness?: MatterProcessedResult["accumulated_brief_readiness"];
  accumulatedBriefMeta?: MatterProcessedResult["accumulated_brief_meta"];
  acceptedBrief?: MatterProcessedResult["accepted_brief"];
  secondaryAnalysis?: MatterProcessedResult["secondary_analysis"];
  briefUserAnswers?: MatterProcessedResult["brief_user_answers"];
  verifiedBrief?: MatterProcessedResult["verified_brief"];
  briefVerification?: MatterProcessedResult["brief_verification"];
  nextStepPlan?: MatterProcessedResult["next_step_plan"];
  draftRecommendations?: MatterProcessedResult["draft_recommendations"];
  draftingContext?: MatterProcessedResult["drafting_context"];
  latestDraftReview?: MatterProcessedResult["latest_draft_review"];
  executiveSummary?: MatterProcessedResult["executive_summary"];
  latestExecutiveSummary?: MatterProcessedResult["latest_executive_summary"];
  frontendBrief?: MatterProcessedResult["frontend_brief"];
  latestFrontendBrief?: MatterProcessedResult["latest_frontend_brief"];
  matterOrientation?: MatterProcessedResult["matter_orientation"];
  latestMatterOrientation?: MatterProcessedResult["latest_matter_orientation"];
  evidenceMatrix?: MatterProcessedResult["evidence_matrix"];
  latestEvidenceMatrix?: MatterProcessedResult["latest_evidence_matrix"];
  clarificationCheckpoint?: MatterProcessedResult["clarification_checkpoint"];
  latestClarificationCheckpoint?: MatterProcessedResult["latest_clarification_checkpoint"];
  userClarificationAnswers?: MatterProcessedResult["user_clarification_answers"];
  briefValidation?: MatterProcessedResult["brief_validation"];
  latestBriefValidation?: MatterProcessedResult["latest_brief_validation"];
  atlasBaseRecognition?: MatterProcessedResult["atlas_base_recognition"];
  latestAtlasBaseRecognition?: MatterProcessedResult["latest_atlas_base_recognition"];
  atlasWorkflowConfirmation?: MatterProcessedResult["atlas_workflow_confirmation"];
  latestAtlasWorkflowConfirmation?: MatterProcessedResult["latest_atlas_workflow_confirmation"];
  atlasGapCheckpoint?: MatterProcessedResult["atlas_gap_checkpoint"];
  latestAtlasGapCheckpoint?: MatterProcessedResult["latest_atlas_gap_checkpoint"];
  atlasDeciderResearch?: MatterProcessedResult["atlas_decider_research"];
  latestAtlasDeciderResearch?: MatterProcessedResult["latest_atlas_decider_research"];
  atlasCaseResearch?: MatterProcessedResult["atlas_case_research"];
  latestAtlasCaseResearch?: MatterProcessedResult["latest_atlas_case_research"];
  atlasNextSteps?: MatterProcessedResult["atlas_next_steps"];
  latestAtlasNextSteps?: MatterProcessedResult["latest_atlas_next_steps"];
  atlasMatterBrief?: MatterProcessedResult["atlas_matter_brief"];
  latestAtlasMatterBrief?: MatterProcessedResult["latest_atlas_matter_brief"];
  matterUnderstandingV2?: MatterProcessedResult["matter_understanding_v2"];
  latestMatterUnderstandingV2?: MatterProcessedResult["latest_matter_understanding_v2"];
  atlasUserInputs?: MatterProcessedResult["atlas_user_inputs"];
  groundAnalysis?: MatterProcessedResult["ground_analysis"];
  documentSignalPayloads?: MatterProcessedResult["document_signal_payloads"];
  documentSignalMeta?: MatterProcessedResult["document_signal_meta"];
  lawResearchPayloads?: MatterProcessedResult["law_research_payloads"];
  lawResearchMeta?: MatterProcessedResult["law_research_meta"];
  inferencePayloads?: MatterProcessedResult["inference_payloads"];
  inferenceMeta?: MatterProcessedResult["inference_meta"];
  acceptedBriefVersionFingerprint?: string | null;
};

export type MatterSignalSourceRef = {
  document_id: string;
  file_name?: string;
  page: number;
  section_id?: string | null;
  clause_id?: string | null;
  quote?: string | null;
  fact?: string | null;
};

export type MatterDraftRecommendationInput = {
  input_key: string;
  label?: string;
  input_label?: string;
  required?: boolean;
  source_type?: string;
  source_id?: string;
  source_label?: string;
};

export type MatterDraftRecommendation = {
  recommendation_id?: string;
  draft_key: string;
  title: string;
  purpose?: string;
  status?: string;
  can_generate_now: boolean;
  readiness_score: number;
  priority?: string;
  risk_level?: string;
  missing_inputs?: MatterDraftRecommendationInput[];
  satisfied_inputs?: MatterDraftRecommendationInput[];
  recommended_uploads?: string[];
  matched_documents?: string[];
  matched_facts?: string[];
  source_fact_ids?: string[];
  template_key?: string;
  template_source?: string;
  reason?: string;
  existing_draft_count?: number;
};

export type MatterDraftRecommendations = {
  version?: number;
  matter_id?: string;
  generated_at?: string;
  status?: string;
  meta?: {
    catalogue_version?: string;
    deterministic?: boolean;
    template_count?: number;
  };
  profile?: {
    matter_types?: string[];
    forum?: string;
    stage?: string;
    client_posture?: string;
  };
  counts?: {
    ready?: number;
    needs_more_inputs?: number;
    total?: number;
  };
  groups?: {
    ready_to_draft?: string[];
    needs_more_inputs?: string[];
    more_options?: string[];
  };
  recommendations?: MatterDraftRecommendation[];
};

export type ExecutiveSummarySupportLevel =
  | "supported"
  | "conditional"
  | "unsupported"
  | "unclear";

export type ExecutiveSummaryCitation = {
  evidenceAnswerId: string;
  documentName: string;
  pageNumber?: number | null;
  section?: string | null;
  excerpt: string;
};

export type ExecutiveSummaryIssue = {
  issueKey: string;
  heading: string;
  analysis: string;
  supportLevel: ExecutiveSummarySupportLevel;
  evidenceAnswerIds: string[];
  citations: ExecutiveSummaryCitation[];
};

export type MatterOverviewView = {
  headline: string;
  oneLineAnswer: string;
  shortSummary: string;
  fiveLineSummary: string[];
  statusBadge: {
    label: "Full Summary" | "Limited Summary" | "Blocked";
    reason: string;
  };
  chips: string[];
  riskSnapshot: Array<{
    id: string;
    label: string;
    status:
      | "strong"
      | "supported"
      | "conditional"
      | "incomplete"
      | "missing"
      | "risky";
    shortReason: string;
    linkedIssueIds: string[];
    linkedEvidenceIds: string[];
  }>;
  gapsToClose: Array<{
    id: string;
    label: string;
    reason: string;
    priority: "critical" | "important" | "helpful";
    uploadPrompt: string;
    unlocks: string;
    linkedIssueIds: string[];
  }>;
  nextSteps: Array<{
    id: string;
    action: string;
    rationale: string;
    priority: "high" | "medium" | "low";
    linkedGapIds: string[];
  }>;
  keyFacts: Array<{
    label: string;
    value: string;
    linkedEvidenceIds: string[];
  }>;
};

export type DetailedExecutiveBrief = {
  documentsReviewed: Array<{
    id: string;
    name: string;
    type: string;
    role: string;
    linkedEvidenceIds: string[];
  }>;
  parties: Array<{
    id: string;
    name: string;
    role: string;
    obligationsOrPosition: string;
    linkedEvidenceIds: string[];
  }>;
  contractualFramework: Array<{
    id: string;
    topic: string;
    summary: string;
    legalEffect: string;
    linkedEvidenceIds: string[];
  }>;
  issueAnalysis: Array<{
    id: string;
    title: string;
    supportLevel:
      | "supported"
      | "conditional"
      | "unsupported"
      | "unclear"
      | "record_gap";
    shortAnswer: string;
    detailedAnalysis: string;
    requiredPredicates: string[];
    missingProof: string[];
    linkedEvidenceIds: string[];
    linkedGapIds: string[];
  }>;
  limitations: string[];
  recommendedActions: Array<{
    id: string;
    action: string;
    whyItMatters: string;
    priority: "high" | "medium" | "low";
    linkedIssueIds: string[];
    linkedGapIds: string[];
  }>;
};

export type EvidenceReference = {
  evidenceItems: Array<{
    id: string;
    evidenceAnswerId: string;
    documentName: string;
    pageNumber: number | null;
    section: string | null;
    excerpt: string;
    slot: string;
    confidence: "high" | "medium" | "low";
    sourceUrl?: string | null;
  }>;
  citationGroups: Array<{
    id: string;
    title: string;
    evidenceIds: string[];
  }>;
};

export type AgentReference = {
  sourceAgent0?: {
    orientationSnapshotId?: string;
    proofPlan?: unknown;
    retrievalBlueprint?: unknown;
  };
  sourceAgent1?: {
    evidenceMatrixId?: string;
    compactMatrixHash?: string;
    readiness: unknown;
    safeClaims: unknown[];
    unsafeClaims: unknown[];
  };
  generationMeta: {
    model: string;
    provider: string;
    createdAt: string;
    version: number;
  };
};

export type UserClarificationAnswer = {
  id: string;
  matterId: string;
  questionId: string;
  answer: string | boolean | number | null;
  answerType: string;
  source: "user_input";
  verificationStatus: "unverified_by_record";
  createdAt: string;
};

export type ClarificationCheckpoint = {
  matterId: string;
  status:
    | "ready_to_summarize"
    | "needs_user_input"
    | "needs_more_documents"
    | "blocked";
  messageToUser: string;
  whatWeUnderstood: Array<{
    label: string;
    value: string;
    confidence: "high" | "medium" | "low";
    evidenceAnswerIds?: string[];
  }>;
  questions: Array<{
    id: string;
    question: string;
    whyItMatters: string;
    answerType:
      | "yes_no"
      | "short_text"
      | "date"
      | "amount"
      | "choice"
      | "document_upload";
    options?: string[];
    priority: "critical" | "important" | "optional";
    linkedIssue: string;
    linkedMissingInputIds: string[];
  }>;
  requestedDocuments: Array<{
    id: string;
    label: string;
    whyNeeded: string;
    unlocks: string;
    priority: "critical" | "important" | "optional";
    linkedIssue: string;
    acceptedTypes?: string[];
  }>;
  canContinueWithoutAnswers: boolean;
  consequenceIfSkipped: string;
  recommendedAction:
    | "ask_user_now"
    | "request_uploads"
    | "continue_with_limited_summary"
    | "block_until_better_documents";
};

export type LegalBriefArtifact = {
  matterId: string;
  summaryType: "full" | "limited" | "blocked";
  confidence: "high" | "medium" | "low";
  overview: MatterOverviewView;
  detailedBrief: DetailedExecutiveBrief;
  evidenceReference: EvidenceReference;
  agentReference?: AgentReference;
};

export type FrontendBriefArtifact = {
  matterId: string;
  summaryType: "full" | "limited" | "blocked";
  confidence: "high" | "medium" | "low";
  title: string;
  summary: string;
  wordCount: number;
  linkedIssueIds: string[];
  linkedGapIds: string[];
  linkedEvidenceIds: string[];
  createdAt: string;
  version: number;
};

export type AtlasBaseRecognitionCandidate = {
  workflowId: string;
  workflowName?: string;
  areaId: string;
  areaName?: string;
  score: number;
  confidence: "high" | "medium" | "low";
  confidenceScore?: number;
  whyItMatches: string;
  matchedSignals: string[];
  missingSignals: string[];
  trigger?: string | null;
  objective?: string | null;
  forum?: string | null;
};

export type AtlasRequirementsPreview = {
  inputs: string[];
  collected: string[];
  stages: string[];
  applications: string[];
};

export type AtlasBaseRecognitionResult = {
  matterId: string;
  status: "needs_confirmation" | "confirmed" | "needs_input" | "blocked";
  primaryWorkflowId: string | null;
  primaryWorkflowName?: string | null;
  primaryAreaId?: string | null;
  primaryAreaName?: string | null;
  primaryReason: string | null;
  candidateAreas?: Array<{
    areaKey: string;
    areaId: string;
    areaName: string;
    confidence: number;
    reason: string;
  }>;
  candidateWorkflows: AtlasBaseRecognitionCandidate[];
  matchedSignals?: string[];
  conflictingSignals?: Array<{
    type: string;
    values: string[];
  }>;
  forumMismatch?: boolean;
  triggerMatchPenaltyApplied?: boolean;
  requiresConfirmation?: boolean;
  verification?: {
    agrees: boolean;
    recommendedWorkflowId: string | null;
    verifiedConfidence: number;
    reason: string;
    requiresConfirmation: boolean;
  } | null;
  atlasRequirementsPreview: AtlasRequirementsPreview | null;
  checkpoint: {
    type: "workflow_confirmation";
    messageToUser: string;
    primaryWorkflowId: string | null;
    candidates: AtlasBaseRecognitionCandidate[];
    canAcceptPrimary: boolean;
    areaName?: string;
    conflictingSignals?: Array<{
      type: string;
      values: string[];
    }>;
  } | null;
};

export type AtlasWorkflowConfirmation = {
  matterId: string;
  status: "accepted" | "rejected" | "overridden";
  selectedWorkflowId: string;
  overrideNote?: string | null;
  source?: "agent_primary" | "agent_alternate" | "user_override" | string;
  rerankedCandidates?: AtlasBaseRecognitionCandidate[];
};

export type AtlasGapCheckpoint = {
  matterId: string;
  status:
    | "ready_for_research"
    | "needs_user_input"
    | "needs_more_documents"
    | "blocked";
  messageToUser: string;
  criticalQuestions: Array<{
    id: string;
    question: string;
    whyItMatters: string;
    answerType:
      | "yes_no"
      | "short_text"
      | "date"
      | "amount"
      | "choice"
      | "document_upload";
    options?: string[];
    priority: "critical" | "important" | "optional";
    linkedIssue: string;
    linkedMissingInputIds: string[];
  }>;
  requestedDocuments: Array<{
    id: string;
    label: string;
    whyNeeded: string;
    unlocks: string;
    priority: "critical" | "important" | "optional";
    linkedIssue: string;
    acceptedTypes?: string[];
  }>;
  missingWorkflowRequirements: string[];
  supportedWorkflowRequirements?: string[];
  gapClassification?: {
    supported: string[];
    frameworkOnly: string[];
    factualProofMissing: string[];
    irrelevantToCurrentMatter: string[];
  };
  canContinueWithLimitedResearch: boolean;
  consequenceIfSkipped: string;
};

export type AtlasDeciderResearchResult = {
  workflowId: string;
  agentBrief: string;
  workflowGrounding: string[];
  documentGrounding: string[];
  webGrounding: Array<{
    title: string;
    url: string;
    highlights: string[];
  }>;
  openQuestions: string[];
};

export type AtlasCaseResearchResult = {
  workflowId: string;
  progress?: {
    step: string;
    message: string;
    query?: string;
    totalCandidates?: number;
    retainedCount?: number;
    updatedAt?: string;
  };
  similarCases: Array<{
    title: string;
    officialDocumentUrl: string;
    officialViewerUrl: string;
    officialSourceType: "pdf" | "html";
    sourceCourt: string;
    pageNumber?: number | null;
    relevantExcerpt: string;
    relevantExcerptTitle: string;
    officialCitation: string;
    note: string;
    facts: string;
    legalQuestion: string;
    holding: string;
    relevanceToMatter: string;
    referenceUrl?: string;
  }>;
  procedurePatterns: string[];
  sourceLinks: string[];
  openQuestions: string[];
  rankedCandidates?: Array<{
    title: string;
    officialUrl: string;
    referenceUrl?: string;
    supportedProposition?: string;
    propositionSupportStatus?: string | null;
    baseScore?: number;
    fetchedScore?: number;
    finalScore?: number;
    fetchStatus?: string;
    note?: string;
  }>;
  debugQueries?: string[];
  debugSummary?: {
    iterations?: number;
    candidateCount: number;
    retainedCount: number;
    discardedCount: number;
  };
  debugIterations?: Array<{
    iteration: number;
    queries: string[];
    issueFocus?: string[];
    retryFocus?: string[];
    candidateCount: number;
    retainedCount: number;
    discardedCount: number;
    retainedCases?: Array<{
      title: string;
      officialUrl: string;
      supportedProposition?: string;
      propositionSupportStatus?: string | null;
    }>;
    discardedCases?: Array<{
      title: string;
      officialUrl: string;
      referenceUrl: string;
      pageHint: number | null;
      note: string;
      supportedProposition?: string;
      resolvedProposition?: string;
      propositionMatchType?: string | null;
    }>;
  }>;
  debugReferences?: Array<{
    title: string;
    officialUrl: string;
    referenceUrl: string;
    pageHint: number | null;
    note: string;
    supportedProposition?: string;
    resolvedProposition?: string;
    propositionMatchType?: string | null;
  }>;
};

export type AtlasNextStepsAnalysis = {
  matterId: string;
  workflowId: string;
  doNow: Array<{
    id: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    unblocks: string[];
    groundedInCases: string[];
    groundedInWorkflow: string[];
  }>;
  draftQueue: Array<{
    id: string;
    title: string;
    description: string;
    draftType: string;
    status: "ready" | "partially_ready" | "blocked" | "generated";
    priority: "high" | "medium" | "low";
    unblocksWhen: string[];
    dependsOn: string[];
    isStartable?: boolean;
    availabilityNote?: string;
  }>;
  systemWorkingOn: Array<{
    id: string;
    title: string;
    description: string;
    status: "queued" | "running" | "completed";
    groundedInWorkflow: string[];
  }>;
  whyTheseNext: string[];
  blockingItems: string[];
  ambiguities?: string[];
  askAiEligibleQuestions?: Array<{
    id: string;
    question: string;
    whyItMatters: string;
  }>;
  confidence: "high" | "medium" | "low";
  shouldContinueResearch: boolean;
  followUpQueries: string[];
  fallbackCases: string[];
  researchTrace?: {
    model?: string;
    provider?: string;
    loopsUsed?: number;
    error?: string | null;
  } | null;
};

export type MatterUnderstandingV2 = {
  version: number;
  run_id: string;
  generated_at: string;
  status: "completed" | "partial" | "failed";
  model_trace?: {
    provider?: string;
    orchestrator_model?: string | null;
    signal_model?: string | null;
    classifier_model?: string | null;
    researcher_model?: string | null;
    verifier_model?: string | null;
    sdk_used?: boolean;
    fallback_used?: boolean;
    errors?: string[];
  };
  classification: {
    primary_category: string;
    secondary_categories: string[];
    governing_statutes: string[];
    typical_forum: string;
    jurisdiction: string;
    procedural_stage: string;
    client_posture: "claimant" | "respondent" | "unknown";
    dispute_value_band: string;
    trigger_event: string;
    confidence: number;
    ambiguities: string[];
    reasoning_summary?: string;
  };
  matter_brief: {
    summary: string;
    current_posture: string;
    key_facts: string[];
    record_supports: string[];
  };
  legal_analysis: {
    direct_answer: {
      short_answer: string;
      answer_type: "yes" | "no" | "likely_yes" | "likely_no" | "depends" | "insufficient_information";
      confidence: number;
      conditions: string[];
    };
    issue_analyses: Array<{
      issue_id: string;
      issue: string;
      conclusion: string;
      supporting_facts: string[];
      supporting_clauses: Array<{
        clause: string;
        document: string;
        text_summary: string;
        application: string;
      }>;
      risks: string[];
      missing_facts: string[];
    }>;
  };
  standard_practice: {
    what_is_usually_done: string[];
    typical_timeline: string;
    common_pitfalls: string[];
    relevant_precedents: Array<{
      case_name: string;
      relevance: string;
      citation: string;
      source_url: string;
    }>;
  };
  issues_and_ambiguities: Array<{
    issue: string;
    why_it_matters: string;
    severity: "critical" | "high" | "medium" | "low";
    needs_user_input: boolean;
  }>;
  missing_information: Array<{
    missing_item: string;
    why_needed: string;
    how_to_collect: "upload_document" | "user_answer" | "web_search" | "system_retrieval";
    question?: string;
    options?: string[];
  }>;
  next_steps: Array<{
    step: string;
    urgency: "immediate" | "within_7_days" | "within_30_days" | "advisory";
    owner: "lawyer" | "client" | "system";
    rationale: string;
    depends_on: string[];
  }>;
  timeline: Array<{
    date: string;
    event: string;
    source_document: string;
    legal_effect: string;
    confidence: "high" | "medium" | "low";
  }>;
  draft_sequence: Array<{
    draft_type: string;
    title: string;
    urgency: "immediate" | "standard" | "advisory";
    gates: string[];
    rationale: string;
    is_primary_legal_draft: boolean;
  }>;
  research_sources: Array<{
    title: string;
    url: string;
    source_name: string;
    legal_proposition: string;
  }>;
  clarifications_obtained: Array<{
    question: string;
    answer: string;
    answered_at: string;
  }>;
};

export type AtlasMatterBrief = {
  matterId: string;
  workflowId: string;
  brief: string;
  summaryBrief?: string;
  detailedBrief?: string;
  wordCount: number;
  confidence: "high" | "medium" | "low";
  usedWorkflow: {
    id: string;
    name: string;
    area?: string;
  };
  usedCaseResearch: {
    sourceCount: number;
    patternCount: number;
  };
  remainingGaps: string[];
  recordSupports?: string[];
  recordDoesNotSupportYet?: string[];
  recordContradicts?: string[];
  citations?: Array<{
    title: string;
    citation: string;
    url: string;
  }>;
};

export type LatestExecutiveSummaryRecord = {
  version?: number;
  artifact_id?: string | null;
  artifact_type?: string;
  created_at?: string;
  summary_type?: "full" | "limited" | "blocked";
  summary?: LegalBriefArtifact | null;
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
  accumulated_brief?: {
    decision?: "generate_brief" | "query_for_user";
    brief_type?: string;
    warning?: string;
    matter_orientation?: {
      short_title?: string;
      document_set_summary?: string;
      likely_matter_nature?: string;
    };
    accumulated_brief?: string;
    brief_points?: Array<{
      id: string;
      heading: string;
      detail: string;
      tone?: "neutral" | "warning" | "positive" | string;
      source_document?: string;
      reason?: string;
      point_type?: string;
      source_posture?: string;
      certainty?: "high" | "medium" | "low" | string;
      source_refs?: Array<{
        chunk_id?: string;
        file_name?: string | null;
        document_role?: string | null;
        assertion_mode?: string | null;
        party_side?: string | null;
        page_start?: number | null;
        page_end?: number | null;
        verbatim_basis?: string;
      }>;
      why_it_matters?: string;
    }>;
    open_questions?: unknown[];
    coverage?: Record<string, "covered" | "partial" | "missing" | string>;
    questions?: string[];
    covered_information?: Record<string, boolean>;
    missing_information?: unknown[];
  } | null;
  accumulated_brief_readiness?: Record<string, unknown> | null;
  accumulated_brief_meta?: Record<string, unknown> | null;
  accepted_brief?: {
    accepted_at?: string;
    accepted_by?: string;
    brief?: MatterProcessedResult["accumulated_brief"];
  } | null;
  accepted_brief_version_fingerprint?: string | null;
  secondary_analysis?: {
    version?: number;
    status?: string;
    classification?: Record<string, unknown> | null;
    fact_checklist?: unknown[];
    extracted_facts?: unknown[];
    fact_gaps?: unknown[];
    quarantine?: unknown[];
    meta?: Record<string, unknown>;
  } | null;
  brief_user_answers?: Array<{ question: string; answer: string }>;
  verified_brief?: Record<string, unknown> | null;
  brief_verification?: Record<string, unknown> | null;
  next_step_plan?: {
    version?: number;
    items?: Array<{
      ground_id?: string;
      title?: string;
      status?: string;
      recommended_next_steps?: Array<{
        step_id?: string;
        title?: string;
        description?: string;
        action_type?: string;
        priority?: string;
        status?: string;
        reason?: string;
        required_before_drafting?: boolean;
        draft_type?: string | null;
        template_key?: string | null;
        required_inputs?: string[];
      }>;
      primary_drafting_action?: {
        label?: string;
        draft_type?: string | null;
        template_key?: string | null;
        cta?: string;
      } | null;
      meta?: {
        model?: string | null;
        provider?: string | null;
        degraded?: boolean;
        error?: string | null;
      } | null;
    }>;
    template_cache?: Record<
      string,
      {
        template_key?: string;
        title?: string;
        source_url?: string;
        content_html?: string;
        content_text?: string;
        fetched_at?: string;
        draft_type?: string | null;
        search_query?: string | null;
      }
    >;
    meta?: {
      degraded?: boolean;
      provider?: string | null;
      model?: string | null;
      error?: string | null;
    } | null;
  } | null;
  draft_recommendations?: MatterDraftRecommendations | null;
  drafting_context?: Record<string, unknown> | null;
  latest_draft_review?: Record<string, unknown> | null;
  executive_summary?: LegalBriefArtifact | null;
  latest_executive_summary?: LatestExecutiveSummaryRecord | null;
  frontend_brief?: FrontendBriefArtifact | null;
  latest_frontend_brief?: {
    version?: number;
    artifact_id?: string | null;
    artifact_type?: string;
    created_at?: string;
    summary_type?: "full" | "limited" | "blocked";
    summary?: FrontendBriefArtifact | null;
  } | null;
  matter_orientation?: Record<string, unknown> | null;
  latest_matter_orientation?: Record<string, unknown> | null;
  evidence_matrix?: Record<string, unknown> | null;
  latest_evidence_matrix?: Record<string, unknown> | null;
  clarification_checkpoint?: ClarificationCheckpoint | null;
  latest_clarification_checkpoint?: Record<string, unknown> | null;
  user_clarification_answers?: UserClarificationAnswer[] | null;
  brief_validation?: Record<string, unknown> | null;
  latest_brief_validation?: Record<string, unknown> | null;
  atlas_base_recognition?: AtlasBaseRecognitionResult | null;
  latest_atlas_base_recognition?: Record<string, unknown> | null;
  atlas_workflow_confirmation?: AtlasWorkflowConfirmation | null;
  latest_atlas_workflow_confirmation?: Record<string, unknown> | null;
  atlas_gap_checkpoint?: AtlasGapCheckpoint | null;
  latest_atlas_gap_checkpoint?: Record<string, unknown> | null;
  atlas_decider_research?: AtlasDeciderResearchResult | null;
  latest_atlas_decider_research?: Record<string, unknown> | null;
  atlas_case_research?: AtlasCaseResearchResult | null;
  latest_atlas_case_research?: Record<string, unknown> | null;
  atlas_next_steps?: AtlasNextStepsAnalysis | null;
  latest_atlas_next_steps?: Record<string, unknown> | null;
  atlas_matter_brief?: AtlasMatterBrief | null;
  latest_atlas_matter_brief?: Record<string, unknown> | null;
  matter_understanding_v2?: MatterUnderstandingV2 | null;
  latest_matter_understanding_v2?: Record<string, unknown> | null;
  atlas_user_inputs?: Array<{
    id: string;
    questionId: string;
    question?: string | null;
    linkedIssue?: string | null;
    priority?: string | null;
    answer: string | boolean | number | null;
    answerType: string;
    source: "user_input";
    verificationStatus: "unverified_by_record";
    createdAt: string;
    value?: string | boolean | number | null;
    materialForResearch?: boolean;
  }> | null;
  document_signal_payloads?: Array<{
    document_id: string;
    file_name: string;
    signal_version: number;
    possible_grounds: Array<{
      local_ground_id: string;
      title: string;
      ground_type: string;
      category: string;
      why_relevant: string;
      supporting_fact_refs: MatterSignalSourceRef[];
      missing_fact_questions: string[];
      needs_legal_research: boolean;
      suggested_research_queries: string[];
      confidence: string;
    }>;
    open_issues: Array<{
      issue_id: string;
      title: string;
      issue_type: string;
      why_open: string;
      source_refs: MatterSignalSourceRef[];
      priority: string;
      required_user_action: string;
    }>;
    drafting_implications: Array<{
      implication_id: string;
      title: string;
      action_type: string;
      priority: string;
      represented_side: string;
      reason: string;
      source_refs: MatterSignalSourceRef[];
      suggested_action_label: string;
    }>;
    meta?: {
      degraded?: boolean;
      model?: string | null;
      provider?: string | null;
      error?: string | null;
    };
  }> | null;
  document_signal_meta?: Array<{
    degraded?: boolean;
    model?: string | null;
    provider?: string | null;
    error?: string | null;
    raw_response_excerpt?: string;
  }> | null;
  law_research_payloads?: Array<Record<string, unknown>> | null;
  law_research_meta?: Array<Record<string, unknown>> | null;
  inference_payloads?: Array<Record<string, unknown>> | null;
  inference_meta?: Array<Record<string, unknown>> | null;
  ground_analysis?: {
    version?: number;
    no_signals_found?: boolean;
    cards?: Array<{
      card_id: string;
      title: string;
      status: "ready" | "open" | string;
      confidence_percent: number;
      fact_text: string;
      law_text?: string | null;
      inference_text?: string | null;
      support_score?: number | null;
      legal_rules?: Array<{
        rule: string;
        source_id: string;
        authority_type: string;
        court: string;
        relevance: string;
      }>;
      contrary_or_limiting_points?: Array<{
        rule: string;
        source_id: string;
        relevance: string;
      }>;
      research_gaps?: string[];
      law_sources?: Array<{
        source_id: string;
        title: string;
        url: string;
        court: string;
        source_type: string;
        date: string;
      }>;
      verified_citations?: Array<Record<string, unknown>>;
      law_bindings?: Array<Record<string, unknown>>;
      law_card?: {
        law_binding_id?: string;
        title?: string;
        source_url?: string;
        source_domain?: string;
        authority_type?: string;
        binding_strength?: string;
        binding_explanation?: string;
        application?: string;
        verification_status?: string;
      } | null;
      law_verification_status?: string;
      law_verification_issues?: Array<{
        type: string;
        severity: string;
        message: string;
      }>;
      law_meta?: {
        query_model?: string | null;
        extractor_model?: string | null;
        verifier_model?: string | null;
        degraded?: boolean;
        error?: string | null;
        retrieval_errors?: string[];
      } | null;
      inference_card?: {
        ground_id?: string;
        card_type?: string;
        inference_type?: string;
        text?: string;
        basis?: {
          fact_used?: string[];
          law_used?: string[];
        };
        limits?: string[];
        recommended_actions?: Array<{
          action_type?: string;
          title?: string;
        }>;
        confidence?: string;
        display_status?: string;
      } | null;
      inference_verification?: {
        passed?: boolean;
        issues?: Array<{
          type?: string;
          message?: string;
        }>;
        downgrade_required?: boolean;
        recommended_status?: string;
        confidence_adjustment?: number;
      } | null;
      inference_guardrails?: {
        passed?: boolean;
        issues?: Array<{
          type?: string;
          message?: string;
        }>;
        downgrade_required?: boolean;
        recommended_status?: string;
      } | null;
      inference_meta?: {
        generator_model?: string | null;
        verifier_model?: string | null;
        degraded?: boolean;
        error?: string | null;
      } | null;
      next_steps_status?: string;
      next_steps?: {
        recommended_next_steps?: Array<{
          step_id?: string;
          title?: string;
          description?: string;
          action_type?: string;
          priority?: string;
          status?: string;
          reason?: string;
          required_before_drafting?: boolean;
          draft_type?: string | null;
          template_key?: string | null;
          required_inputs?: string[];
        }>;
        primary_drafting_action?: {
          label?: string;
          draft_type?: string | null;
          template_key?: string | null;
          cta?: string;
        } | null;
      } | null;
      next_steps_meta?: {
        model?: string | null;
        provider?: string | null;
        degraded?: boolean;
        error?: string | null;
      } | null;
      source_files: string[];
      why_this_point: string;
      backing_signal_ids: string[];
      source_refs: MatterSignalSourceRef[];
    }>;
    meta?: {
      degraded?: boolean;
      provider?: string | null;
      orchestrator_model?: string | null;
      verifier_model?: string | null;
      law_generation_model?: string | null;
      law_verifier_model?: string | null;
      inference_generation_model?: string | null;
      inference_verifier_model?: string | null;
      next_step_generation_model?: string | null;
      error?: string | null;
    };
  } | null;
};

type MatterStoreContextValue = {
  matters: MatterRecord[];
  activeMatterId: string | null;
  activeMatter: MatterRecord | null;
  isSavedMattersLoading: boolean;
  addMatter: (result: MatterProcessedResult) => MatterRecord;
  updateMatter: (result: MatterProcessedResult) => void;
  mergeMatterAtlasLatest: (
    matterId: string,
    patch: {
      matter?: Partial<
        Pick<
          MatterUploadPayload,
          | "status"
          | "job_id"
          | "versionFingerprint"
          | "contextcore"
          | "intelligence_statuses"
          | "analysis_state"
          | "classification"
          | "classification_meta"
        >
      > | null;
      extractedFieldsStatus?: MatterExtractedFieldsStatus;
      extractedFieldsError?: string | null;
      atlasBaseRecognition?: MatterProcessedResult["atlas_base_recognition"];
      atlasWorkflowConfirmation?: MatterProcessedResult["atlas_workflow_confirmation"];
      atlasGapCheckpoint?: MatterProcessedResult["atlas_gap_checkpoint"];
      atlasDeciderResearch?: MatterProcessedResult["atlas_decider_research"];
      atlasCaseResearch?: MatterProcessedResult["atlas_case_research"];
      atlasNextSteps?: MatterProcessedResult["atlas_next_steps"];
      atlasMatterBrief?: MatterProcessedResult["atlas_matter_brief"];
      atlasUserInputs?: MatterProcessedResult["atlas_user_inputs"];
    },
  ) => void;
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

const extractedRoleRank = (role: string) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "represented party") return 5;
  if (normalized === "opposing party") return 4;
  if (normalized === "counsel for represented party") return 3;
  if (normalized === "counsel for opposing party") return 2;
  if (normalized === "party") return 1;
  return 0;
};

const extractedConfidenceRank = (confidence: string) => {
  const normalized = String(confidence || "").trim().toLowerCase();
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return 0;
};

const canonicalPersonToken = (value: string) => {
  const lettersOnly = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!lettersOnly) return "";
  if (lettersOnly.length <= 3) return lettersOnly;
  return `${lettersOnly[0]}${lettersOnly.slice(1).replace(/[aeiou]/g, "")}`;
};

const canonicalPersonNameKey = (value: string) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map(canonicalPersonToken)
    .filter(Boolean)
    .join(" ");

const dedupeExtractedParties = (
  parties: MatterExtractedFields["parties"],
): MatterExtractedFields["parties"] => {
  const byName = new Map<
    string,
    { name: string; role: string; confidence: string }
  >();

  parties.forEach((party) => {
    const name = String(party?.name || "").trim();
    if (!name) return;

    const candidate = {
      name,
      role: String(party?.role || "Party").trim() || "Party",
      confidence: String(party?.confidence || "low").trim() || "low",
    };
    const key = canonicalPersonNameKey(name) || name.toLowerCase();
    const current = byName.get(key);

    if (!current) {
      byName.set(key, candidate);
      return;
    }

    const currentRoleRank = extractedRoleRank(current.role);
    const candidateRoleRank = extractedRoleRank(candidate.role);
    if (candidateRoleRank > currentRoleRank) {
      byName.set(key, candidate);
      return;
    }

    if (
      candidateRoleRank === currentRoleRank &&
      extractedConfidenceRank(candidate.confidence) >
        extractedConfidenceRank(current.confidence)
    ) {
      byName.set(key, candidate);
    }
  });

  return [...byName.values()];
};

const peopleFromExtractedParties = (
  parties: MatterExtractedFields["parties"],
): MatterPerson[] =>
  dedupeExtractedParties(parties).map((party, index) => ({
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
      debrief_generation:
        matter.intelligence_statuses?.debrief_generation === "processing"
          ? "failed"
          : matter.intelligence_statuses?.debrief_generation,
      debrief_verification:
        matter.intelligence_statuses?.debrief_verification === "processing"
          ? "failed"
          : matter.intelligence_statuses?.debrief_verification,
      law_generation:
        matter.intelligence_statuses?.law_generation === "processing"
          ? "failed"
          : matter.intelligence_statuses?.law_generation,
      law_verification:
        matter.intelligence_statuses?.law_verification === "processing"
          ? "failed"
          : matter.intelligence_statuses?.law_verification,
      inference_generation:
        matter.intelligence_statuses?.inference_generation === "processing"
          ? "failed"
          : matter.intelligence_statuses?.inference_generation,
      inference_verification:
        matter.intelligence_statuses?.inference_verification === "processing"
          ? "failed"
          : matter.intelligence_statuses?.inference_verification,
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
    accumulatedBrief: result.accumulated_brief || undefined,
    accumulatedBriefReadiness: result.accumulated_brief_readiness || undefined,
    accumulatedBriefMeta: result.accumulated_brief_meta || undefined,
    acceptedBrief: result.accepted_brief || undefined,
    acceptedBriefVersionFingerprint:
      result.accepted_brief_version_fingerprint ?? undefined,
    secondaryAnalysis: result.secondary_analysis || undefined,
    briefUserAnswers: result.brief_user_answers || undefined,
    verifiedBrief: result.verified_brief || undefined,
    briefVerification: result.brief_verification || undefined,
    nextStepPlan: result.next_step_plan || undefined,
    draftRecommendations: result.draft_recommendations || undefined,
    draftingContext: result.drafting_context || undefined,
    latestDraftReview: result.latest_draft_review || undefined,
    executiveSummary: result.executive_summary || undefined,
    latestExecutiveSummary: result.latest_executive_summary || undefined,
    frontendBrief: result.frontend_brief || undefined,
    latestFrontendBrief: result.latest_frontend_brief || undefined,
    matterOrientation: result.matter_orientation || undefined,
    latestMatterOrientation: result.latest_matter_orientation || undefined,
    evidenceMatrix: result.evidence_matrix || undefined,
    latestEvidenceMatrix: result.latest_evidence_matrix || undefined,
    clarificationCheckpoint: result.clarification_checkpoint || undefined,
    latestClarificationCheckpoint:
      result.latest_clarification_checkpoint || undefined,
    userClarificationAnswers: result.user_clarification_answers || undefined,
    briefValidation: result.brief_validation || undefined,
    latestBriefValidation: result.latest_brief_validation || undefined,
    atlasBaseRecognition: result.atlas_base_recognition || undefined,
    latestAtlasBaseRecognition:
      result.latest_atlas_base_recognition || undefined,
    atlasWorkflowConfirmation:
      result.atlas_workflow_confirmation || undefined,
    latestAtlasWorkflowConfirmation:
      result.latest_atlas_workflow_confirmation || undefined,
    atlasGapCheckpoint: result.atlas_gap_checkpoint || undefined,
    latestAtlasGapCheckpoint:
      result.latest_atlas_gap_checkpoint || undefined,
    atlasDeciderResearch: result.atlas_decider_research || undefined,
    latestAtlasDeciderResearch:
      result.latest_atlas_decider_research || undefined,
    atlasCaseResearch: result.atlas_case_research || undefined,
    latestAtlasCaseResearch:
      result.latest_atlas_case_research || undefined,
    atlasNextSteps: result.atlas_next_steps || undefined,
    latestAtlasNextSteps:
      result.latest_atlas_next_steps || undefined,
    atlasMatterBrief: result.atlas_matter_brief || undefined,
    latestAtlasMatterBrief:
      result.latest_atlas_matter_brief || undefined,
    matterUnderstandingV2: result.matter_understanding_v2 || undefined,
    latestMatterUnderstandingV2:
      result.latest_matter_understanding_v2 || undefined,
    atlasUserInputs: result.atlas_user_inputs || undefined,
    groundAnalysis: result.ground_analysis || undefined,
    documentSignalPayloads: result.document_signal_payloads || undefined,
    documentSignalMeta: result.document_signal_meta || undefined,
    lawResearchPayloads: result.law_research_payloads || undefined,
    lawResearchMeta: result.law_research_meta || undefined,
    inferencePayloads: result.inference_payloads || undefined,
    inferenceMeta: result.inference_meta || undefined,
  };
};

export const MatterStoreProvider = ({ children }: PropsWithChildren) => {
  const { status: authStatus, isAuthenticated } = useAuth();
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
    if (authStatus === "loading") return;
    if (!isAuthenticated) {
      setMatters([]);
      setActiveMatterId(null);
      setIsSavedMattersLoading(false);
      return;
    }

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
        if (!cancelled) {
          setMattersFromServer([]);
        }
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
  }, [authStatus, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMatter = useCallback((result: MatterProcessedResult) => {
    let createdRecord: MatterRecord | null = null;

    setMatters((prev) => {
      const duplicate = prev.find((item) => item.id === result.matter.id);
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
  }, []);

  const updateMatter = useCallback((result: MatterProcessedResult) => {
    setMatters((prev) =>
      prev.map((matter) => {
        if (matter.id !== result.matter.id) {
          return matter;
        }

        return buildMatterRecord(result, matter.version, matter.people);
      }),
    );
  }, []);

  const mergeMatterAtlasLatest = useCallback(
    (
      matterId: string,
      patch: {
        matter?: Partial<
          Pick<
            MatterUploadPayload,
            | "status"
            | "job_id"
            | "versionFingerprint"
            | "contextcore"
            | "intelligence_statuses"
            | "analysis_state"
            | "classification"
            | "classification_meta"
          >
        > | null;
        extractedFieldsStatus?: MatterExtractedFieldsStatus;
        extractedFieldsError?: string | null;
        atlasBaseRecognition?: MatterProcessedResult["atlas_base_recognition"];
        atlasWorkflowConfirmation?: MatterProcessedResult["atlas_workflow_confirmation"];
        atlasGapCheckpoint?: MatterProcessedResult["atlas_gap_checkpoint"];
        atlasDeciderResearch?: MatterProcessedResult["atlas_decider_research"];
        atlasCaseResearch?: MatterProcessedResult["atlas_case_research"];
        atlasNextSteps?: MatterProcessedResult["atlas_next_steps"];
        atlasMatterBrief?: MatterProcessedResult["atlas_matter_brief"];
        atlasUserInputs?: MatterProcessedResult["atlas_user_inputs"];
      },
    ) => {
      setMatters((prev) =>
        prev.map((matter) => {
          if (matter.id !== matterId) return matter;
          return {
            ...matter,
            ...(patch.matter || {}),
            extractedFieldsStatus:
              patch.extractedFieldsStatus ?? matter.extractedFieldsStatus,
            extractedFieldsError:
              patch.extractedFieldsError !== undefined
                ? patch.extractedFieldsError
                : matter.extractedFieldsError,
            atlasBaseRecognition:
              patch.atlasBaseRecognition !== undefined
                ? patch.atlasBaseRecognition || undefined
                : matter.atlasBaseRecognition,
            atlasWorkflowConfirmation:
              patch.atlasWorkflowConfirmation !== undefined
                ? patch.atlasWorkflowConfirmation || undefined
                : matter.atlasWorkflowConfirmation,
            atlasGapCheckpoint:
              patch.atlasGapCheckpoint !== undefined
                ? patch.atlasGapCheckpoint || undefined
                : matter.atlasGapCheckpoint,
            atlasDeciderResearch:
              patch.atlasDeciderResearch !== undefined
                ? patch.atlasDeciderResearch || undefined
                : matter.atlasDeciderResearch,
            atlasCaseResearch:
              patch.atlasCaseResearch !== undefined
                ? patch.atlasCaseResearch || undefined
                : matter.atlasCaseResearch,
            atlasNextSteps:
              patch.atlasNextSteps !== undefined
                ? patch.atlasNextSteps || undefined
                : matter.atlasNextSteps,
            atlasMatterBrief:
              patch.atlasMatterBrief !== undefined
                ? patch.atlasMatterBrief || undefined
                : matter.atlasMatterBrief,
            atlasUserInputs:
              patch.atlasUserInputs !== undefined
                ? patch.atlasUserInputs || undefined
                : matter.atlasUserInputs,
          };
        }),
      );
    },
    [],
  );

  const markMatterJobExpired = useCallback((matterId: string) => {
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
            debrief_generation:
              matter.intelligence_statuses?.debrief_generation === "processing"
                ? "failed"
                : matter.intelligence_statuses?.debrief_generation,
            debrief_verification:
              matter.intelligence_statuses?.debrief_verification === "processing"
                ? "failed"
                : matter.intelligence_statuses?.debrief_verification,
            law_generation:
              matter.intelligence_statuses?.law_generation === "processing"
                ? "failed"
                : matter.intelligence_statuses?.law_generation,
            law_verification:
              matter.intelligence_statuses?.law_verification === "processing"
                ? "failed"
                : matter.intelligence_statuses?.law_verification,
            inference_generation:
              matter.intelligence_statuses?.inference_generation === "processing"
                ? "failed"
                : matter.intelligence_statuses?.inference_generation,
            inference_verification:
              matter.intelligence_statuses?.inference_verification === "processing"
                ? "failed"
                : matter.intelligence_statuses?.inference_verification,
          },
        };
      }),
    );
  }, []);

  const setMattersFromServer = useCallback((results: MatterProcessedResult[]) => {
    if (!Array.isArray(results)) return;

    let nextDefaultActiveMatterId: string | null = null;
    let containsCurrentActiveMatter = false;

    setMatters((prev) => {
      const next = results.map((result) => {
        const existing = prev.find((item) => item.id === result.matter.id);
        if (existing) {
          return buildMatterRecord(result, existing.version, existing.people);
        }
        return buildMatterRecord(result, 1);
      });

      next.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
      nextDefaultActiveMatterId = next[0]?.id || null;
      containsCurrentActiveMatter = next.some(
        (matter) => matter.id === activeMatterId,
      );
      return next;
    });

    setActiveMatterId((current) => {
      if (current && containsCurrentActiveMatter) return current;
      return nextDefaultActiveMatterId;
    });
  }, [activeMatterId]);

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
        mergeMatterAtlasLatest,
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
