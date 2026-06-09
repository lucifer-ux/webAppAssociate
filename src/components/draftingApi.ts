import type { JSONContent } from "@tiptap/core";
import type {
  MatterDraftRecommendation,
  MatterDraftRecommendations,
  MatterRecord,
  MatterProcessedResult,
} from "../context/MatterStoreContext";
import { buildApiUrl } from "../lib/apiBase";

export type AccessRole = "viewer" | "editor";
export type ParagraphStyle =
  | "normal"
  | "title"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "heading-4"
  | "heading-5"
  | "heading-6"
  | "quote";
export type ZoomLevel = "80%" | "100%" | "125%";
export type AnnotationType = "comment" | "reaction";

export type DefinedTerm = {
  term: string;
  definitionText: string;
};

export type DraftHeaderFooterSlots = {
  left?: string;
  center?: string;
  right?: string;
};

export type DraftHeaderFooter = {
  header?: DraftHeaderFooterSlots;
  footer?: DraftHeaderFooterSlots;
  differentFirstPage?: boolean;
};

export type DraftTemplateProvenance = {
  type?: string;
  label?: string;
  source?: string;
  role?: string;
  confidence?: string;
  verification_status?: string;
  acceptable_sources?: string[];
};

export type DraftContext = {
  matterId: string | null;
  partyA: string | null;
  partyB: string | null;
  governingLaw: string | null;
  jurisdiction: string | null;
  definedTerms: DefinedTerm[];
  headerFooter?: DraftHeaderFooter;
  templateProvenance?: DraftTemplateProvenance[];
  templateAuthenticity?: Record<string, unknown>;
  boilerplateMeta?: Record<string, unknown> | null;
  source?: string;
  recommendation?: MatterDraftRecommendation;
  [key: string]: unknown;
};

export type DraftSummary = {
  id: string;
  title: string;
  matterId: string | null;
  templateId: string | null;
  updatedAt: string;
  lastSavedAt: string | null;
  saveVersion: number;
  status: string;
};

export type DraftDetail = DraftSummary & {
  ownerUserId: string;
  contentJson: JSONContent;
  contentHash: string;
  context: DraftContext;
  createdAt: string;
};

export type DraftComment = {
  id: string;
  author: string;
  excerpt: string;
  note: string;
  type: AnnotationType;
  from: number;
  to: number;
  status: "pending" | "accepted" | "rejected";
  replies: Array<{
    id: string;
    author: string;
    note: string;
    createdAt: string;
  }>;
  classification?: string;
  severity?: string;
  sourcePointers?: Array<Record<string, unknown>>;
};

export type DraftReviewJob = {
  id: string;
  draftId: string;
  ownerUserId: string;
  matterId: string | null;
  contentHash: string;
  status: string;
  result: {
    comments?: Array<Record<string, unknown>>;
    annotations?: DraftComment[];
    reviewedAt?: string;
    meta?: Record<string, unknown>;
  };
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftRecommendationsResponse = {
  matterId: string;
  draftRecommendations: MatterDraftRecommendations;
  result?: MatterProcessedResult;
};

export type PendingAnnotation = {
  from: number;
  to: number;
  excerpt: string;
  type: AnnotationType;
};

const buildDraftHeaders = (includeJson = true) => {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const readJson = async <T>(response: Response) => {
  const raw = await response.text();
  let payload: T & {
    success?: boolean;
    error?: string;
  };
  try {
    payload = JSON.parse(raw || "{}") as T & {
      success?: boolean;
      error?: string;
    };
  } catch {
    const contentType = response.headers.get("content-type") || "unknown";
    throw new Error(
      `Backend returned ${contentType} instead of JSON for ${response.url}. Restart the backend or verify the API route is mounted.`,
    );
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || "Draft request failed."));
  }
  return payload;
};

export const getDraftUserId = () => {
  return "session-user";
};

export const hashDraftContent = (content: JSONContent) => {
  const value = JSON.stringify(content || {});
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return String(hash);
};

export const listDrafts = async () => {
  const response = await fetch(buildApiUrl("/api/drafts"), {
    headers: buildDraftHeaders(false),
  });
  const payload = await readJson<{ drafts: DraftSummary[]; success: true }>(response);
  return Array.isArray(payload.drafts) ? payload.drafts : [];
};

export const createDraft = async (input: {
  title: string;
  matterId: string | null;
  templateId: string | null;
  contentJson: JSONContent;
  context: DraftContext;
}) => {
  const response = await fetch(buildApiUrl("/api/drafts"), {
    method: "POST",
    headers: buildDraftHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
};

export const getDraft = async (draftId: string) => {
  const response = await fetch(
    buildApiUrl(`/api/drafts/${encodeURIComponent(draftId)}`),
    {
    headers: buildDraftHeaders(false),
    },
  );
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
};

export const patchDraft = async (
  draftId: string,
  input: { title?: string; context?: DraftContext },
) => {
  const response = await fetch(
    buildApiUrl(`/api/drafts/${encodeURIComponent(draftId)}`),
    {
    method: "PATCH",
    headers: buildDraftHeaders(),
    body: JSON.stringify(input),
    },
  );
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
};

export const saveDraft = async (input: {
  draftId: string;
  title: string;
  contentJson: JSONContent;
  context: DraftContext;
  saveReason: "autosave" | "manual";
}) => {
  const { draftId, ...body } = input;
  const response = await fetch(
    buildApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/save`),
    {
      method: "POST",
      headers: buildDraftHeaders(),
      body: JSON.stringify(body),
    },
  );
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
};

export const triggerDraftReview = async (draftId: string) => {
  const response = await fetch(
    buildApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/review`),
    {
      method: "POST",
      headers: buildDraftHeaders(),
      body: JSON.stringify({}),
    },
  );
  const payload = await readJson<{
    review_job_id: string;
    status: string;
    success: true;
  }>(response);
  return payload;
};

export const getDraftReview = async (draftId: string) => {
  const response = await fetch(
    buildApiUrl(`/api/drafts/${encodeURIComponent(draftId)}/review`),
    {
      headers: buildDraftHeaders(false),
    },
  );
  const payload = await readJson<{ review_job: DraftReviewJob; success: true }>(
    response,
  );
  return payload.review_job;
};

export const getDraftRecommendations = async (matterId: string) => {
  const response = await fetch(
    buildApiUrl(`/api/matters/${encodeURIComponent(matterId)}/draft-recommendations`),
    {
      headers: buildDraftHeaders(false),
    },
  );
  const payload = await readJson<{
    success: true;
    matter_id: string;
    draft_recommendations: MatterDraftRecommendations;
    result?: MatterProcessedResult;
  }>(response);
  return {
    matterId: payload.matter_id,
    draftRecommendations: payload.draft_recommendations,
    result: payload.result,
  };
};

export const refreshDraftRecommendations = async (matterId: string) => {
  const response = await fetch(
    buildApiUrl(`/api/matters/${encodeURIComponent(matterId)}/draft-recommendations/refresh`),
    {
      method: "POST",
      headers: buildDraftHeaders(),
      body: JSON.stringify({}),
    },
  );
  const payload = await readJson<{
    success: true;
    matter_id: string;
    draft_recommendations: MatterDraftRecommendations;
    result?: MatterProcessedResult;
  }>(response);
  return {
    matterId: payload.matter_id,
    draftRecommendations: payload.draft_recommendations,
    result: payload.result,
  };
};

export const startDraftRecommendation = async (input: {
  matterId: string;
  recommendation: MatterDraftRecommendation;
  allowIncomplete?: boolean;
}) => {
  const response = await fetch(
    buildApiUrl(
      `/api/matters/${encodeURIComponent(input.matterId)}/draft-recommendations/${encodeURIComponent(input.recommendation.draft_key)}/start`,
    ),
    {
      method: "POST",
      headers: buildDraftHeaders(),
      body: JSON.stringify({
        allow_incomplete: Boolean(input.allowIncomplete),
      }),
    },
  );
  const payload = await readJson<{
    success: true;
    draft: DraftDetail;
    draft_recommendations?: MatterDraftRecommendations;
    result?: MatterProcessedResult;
  }>(response);
  return payload;
};

export type DraftFormatProposal = {
  title: string;
  contentJson: JSONContent;
  contextPatch: Partial<DraftContext>;
  sources: Array<{ title: string; url: string; highlights?: string[] }>;
  meta?: Record<string, unknown>;
};

export const generateDraftFormat = async (input: {
  matterId: string;
  draftKey: string;
}) => {
  const response = await fetch(
    buildApiUrl(
      `/api/matters/${encodeURIComponent(input.matterId)}/draft-recommendations/${encodeURIComponent(input.draftKey)}/generate-format`,
    ),
    {
      method: "POST",
      headers: buildDraftHeaders(),
    },
  );
  const payload = await readJson<{
    success: true;
    proposal: DraftFormatProposal;
  }>(response);
  return payload.proposal;
};

export const getNextStepTemplate = async (input: {
  matterId: string;
  groundId: string;
  stepId: string;
  templateKey: string;
}) => {
  const response = await fetch(
    buildApiUrl(`/api/matters/${encodeURIComponent(input.matterId)}/next-steps/template`),
    {
      method: "POST",
      headers: buildDraftHeaders(),
      body: JSON.stringify({
        ground_id: input.groundId,
        step_id: input.stepId,
        template_key: input.templateKey,
      }),
    },
  );
  const payload = await readJson<{
    success: true;
    template: {
      template_key?: string;
      title?: string;
      source_url?: string;
      content_html?: string;
      content_text?: string;
      fetched_at?: string;
      draft_type?: string | null;
      search_query?: string | null;
    };
  }>(response);
  return payload.template;
};

const extractDefinedTerm = (value: string): DefinedTerm | null => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const quotedMatch = normalized.match(/[“"]([^"”]+)[”"]\s+means?\s+(.+)/i);
  if (quotedMatch) {
    return {
      term: quotedMatch[1].trim(),
      definitionText: normalized,
    };
  }

  const fallbackMatch = normalized.match(/^([A-Z][A-Za-z0-9\s&/-]{2,50})\s+means?\s+(.+)/);
  if (fallbackMatch) {
    return {
      term: fallbackMatch[1].trim(),
      definitionText: normalized,
    };
  }

  return null;
};

const deriveJurisdiction = (matter: MatterRecord | null) => {
  const fullText = String(matter?.pageAwareStructure?.full_text || "");
  const directMatch =
    fullText.match(/courts?\s+at\s+([A-Za-z ,.-]+)/i) ||
    fullText.match(/exclusive\s+jurisdiction[^.]*courts?\s+at\s+([A-Za-z ,.-]+)/i);
  if (directMatch?.[1]) {
    return directMatch[1].replace(/\s+/g, " ").trim();
  }
  return null;
};

export const deriveDraftContextFromMatter = (matter: MatterRecord | null): DraftContext => {
  const parties = matter?.extractedFields.parties || [];
  const verifiedBrief = (matter?.verifiedBrief || {}) as {
    governing_law?: { value?: string | null };
    parties?: Array<{ name?: string }>;
    defined_terms?: Array<{ term?: string; summary?: string }>;
  };
  const definitions =
    verifiedBrief?.defined_terms?.length
      ? verifiedBrief.defined_terms
          .map((item) =>
            item?.term
              ? {
                  term: String(item.term),
                  definitionText: String(item.summary || item.term),
                }
              : null,
          )
          .filter((item): item is DefinedTerm => Boolean(item))
      : matter?.pageAwareStructure?.sections
      ?.filter((section) => section.section_type === "definitions")
      .flatMap((section) => section.clauses || [])
      .map((clause) => extractDefinedTerm(clause.display_text || clause.heading || ""))
      .filter((item): item is DefinedTerm => Boolean(item)) || [];

  return {
    matterId: matter?.id || null,
    partyA:
      verifiedBrief?.parties?.[0]?.name || parties[0]?.name || matter?.people?.[0]?.name || null,
    partyB:
      verifiedBrief?.parties?.[1]?.name || parties[1]?.name || matter?.people?.[1]?.name || null,
    governingLaw:
      verifiedBrief?.governing_law?.value || matter?.extractedFields.governing_law.value || null,
    jurisdiction: deriveJurisdiction(matter),
    definedTerms: definitions,
    headerFooter: {
      header: {
        left: "",
        center: matter?.title || "Legal Draft",
        right: "",
      },
      footer: {
        left: "",
        center: "Page {page}",
        right: "",
      },
      differentFirstPage: false,
    },
  };
};
