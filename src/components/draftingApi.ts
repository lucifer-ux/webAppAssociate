import type { JSONContent } from "@tiptap/core";
import type { MatterRecord } from "../context/MatterStoreContext";

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

export type DraftContext = {
  matterId: string | null;
  partyA: string | null;
  partyB: string | null;
  governingLaw: string | null;
  jurisdiction: string | null;
  definedTerms: DefinedTerm[];
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
};

export type PendingAnnotation = {
  from: number;
  to: number;
  excerpt: string;
  type: AnnotationType;
};

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000";

const buildDraftHeaders = (includeJson = true) => {
  const headers: Record<string, string> = {
    "X-User-Id": getDraftUserId(),
  };
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
};

const readJson = async <T>(response: Response) => {
  const payload = (await response.json()) as T & {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || "Draft request failed."));
  }
  return payload;
};

export const getDraftUserId = () => {
  try {
    return localStorage.getItem("auth_token") || "local-user";
  } catch {
    return "local-user";
  }
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
  const response = await fetch(`${apiBaseUrl}/api/drafts`, {
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
  const response = await fetch(`${apiBaseUrl}/api/drafts`, {
    method: "POST",
    headers: buildDraftHeaders(),
    body: JSON.stringify(input),
  });
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
};

export const getDraft = async (draftId: string) => {
  const response = await fetch(`${apiBaseUrl}/api/drafts/${encodeURIComponent(draftId)}`, {
    headers: buildDraftHeaders(false),
  });
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
};

export const patchDraft = async (
  draftId: string,
  input: { title?: string; context?: DraftContext },
) => {
  const response = await fetch(`${apiBaseUrl}/api/drafts/${encodeURIComponent(draftId)}`, {
    method: "PATCH",
    headers: buildDraftHeaders(),
    body: JSON.stringify(input),
  });
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
    `${apiBaseUrl}/api/drafts/${encodeURIComponent(draftId)}/save`,
    {
      method: "POST",
      headers: buildDraftHeaders(),
      body: JSON.stringify(body),
    },
  );
  const payload = await readJson<{ draft: DraftDetail; success: true }>(response);
  return payload.draft;
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
  const definitions =
    matter?.pageAwareStructure?.sections
      ?.filter((section) => section.section_type === "definitions")
      .flatMap((section) => section.clauses || [])
      .map((clause) => extractDefinedTerm(clause.display_text || clause.heading || ""))
      .filter((item): item is DefinedTerm => Boolean(item)) || [];

  return {
    matterId: matter?.id || null,
    partyA: parties[0]?.name || matter?.people?.[0]?.name || null,
    partyB: parties[1]?.name || matter?.people?.[1]?.name || null,
    governingLaw: matter?.extractedFields.governing_law.value || null,
    jurisdiction: deriveJurisdiction(matter),
    definedTerms: definitions,
  };
};
