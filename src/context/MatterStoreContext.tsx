import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

export type MatterValidationSummary = {
  accepted: boolean;
  size_bytes: number;
  declared_extension: string;
  declared_kind: "pdf";
  detected_extension: string | null;
  detected_mime: string;
  sha256: string;
  parse: {
    kind: "pdf";
    page_count: number | null;
    estimated_pages: number | null;
    is_encrypted: boolean;
    is_corrupt: boolean;
  };
};

export type MatterUploadPayload = {
  id: string;
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
  kind: "pdf";
  versionFingerprint: string;
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

export type MatterPerson = {
  id: string;
  initials: string;
  name: string;
  role: string;
  description: string;
  source: "extracted" | "manual";
  confidence?: string;
};

export type MatterHealth = {
  missing_clauses: string[];
  flagged_clauses: string[];
  completeness_score: number;
};

export type MatterNextStep =
  | "BUILD_PAGE_AWARE_STRUCTURE"
  | "RUN_OCR_OR_ASK_USER_FOR_BETTER_COPY";

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
  health: MatterHealth;
  people: MatterPerson[];
};

export type MatterProcessedResult = {
  matter: MatterUploadPayload;
  validation: MatterValidationSummary;
  preview_text: string;
  preview_text_source: MatterPreviewSource;
  text_quality: TextQualityReport;
  next_step: MatterNextStep;
  page_aware_structure: PageAwareStructure;
  page_index: MatterPageIndexItem[];
  extracted_fields: MatterExtractedFields;
  health: MatterHealth;
};

type MatterStoreContextValue = {
  matters: MatterRecord[];
  activeMatterId: string | null;
  activeMatter: MatterRecord | null;
  addMatter: (result: MatterProcessedResult) => MatterRecord;
  addPersonToMatter: (
    matterId: string,
    person: Omit<MatterPerson, "id" | "initials" | "source">,
  ) => void;
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

export const MatterStoreProvider = ({ children }: PropsWithChildren) => {
  const [matters, setMatters] = useState<MatterRecord[]>([]);
  const [activeMatterId, setActiveMatterId] = useState<string | null>(null);

  const addMatter = (result: MatterProcessedResult) => {
    let createdRecord: MatterRecord | null = null;

    setMatters((prev) => {
      const duplicate = prev.find((item) => item.sha256 === result.matter.sha256);
      if (duplicate) {
        createdRecord = duplicate;
        return prev;
      }

      const matchingNameVersions = prev.filter(
        (item) => item.fileName === result.matter.fileName,
      );
      const nextVersion =
        matchingNameVersions.reduce(
          (max, item) => Math.max(max, item.version),
          0,
        ) + 1;

      createdRecord = {
        ...result.matter,
        version: nextVersion,
        validation: result.validation,
        previewText: result.preview_text,
        previewTextSource: result.preview_text_source || "server",
        textQuality: result.text_quality,
        nextStep: result.next_step,
        pageAwareStructure: result.page_aware_structure,
        pageIndex: result.page_index,
        extractedFields: result.extracted_fields,
        health: result.health,
        people: peopleFromExtractedParties(result.extracted_fields.parties || []),
      };

      return [createdRecord, ...prev];
    });

    const finalRecord =
      createdRecord ||
      ({
        ...result.matter,
        version: 1,
        validation: result.validation,
        previewText: result.preview_text,
        previewTextSource: result.preview_text_source || "server",
        textQuality: result.text_quality,
        nextStep: result.next_step,
        pageAwareStructure: result.page_aware_structure,
        pageIndex: result.page_index,
        extractedFields: result.extracted_fields,
        health: result.health,
        people: peopleFromExtractedParties(result.extracted_fields.parties || []),
      } satisfies MatterRecord);

    setActiveMatterId(finalRecord.id);
    return finalRecord;
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

  const activeMatter =
    matters.find((matter) => matter.id === activeMatterId) || null;

  return (
    <MatterStoreContext.Provider
      value={{
        matters,
        activeMatterId,
        activeMatter,
        addMatter,
        addPersonToMatter,
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
