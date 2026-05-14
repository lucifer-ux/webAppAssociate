import "../componentStyling/MatterSection.css";
import Button from "./Button";
import {
  useEffect,
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
  FileText,
  FolderOpen,
  Plus,
  Scale,
  ShieldCheck,
  SplitSquareHorizontal,
  X,
} from "lucide-react";
import {
  useMatterStore,
  type AcceptedRedline,
  type ClauseSection,
  type ClauseItem,
  type MatterProcessedResult,
  type ObligationMapResult,
  type SectionRiskMapResult,
} from "../context/MatterStoreContext";

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
            ? "This field is unfilled — contract cannot be executed."
            : undefined
        }
      >
        {segment}
      </mark>,
    );
  }

  return parts;
};

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

type MatterSectionProps = {
  isObligationPanelOpen?: boolean;
  isPlaybookPanelOpen?: boolean;
  onCloseObligationPanel?: () => void;
  onClosePlaybookPanel?: () => void;
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
}: MatterSectionProps) => {
  const navigate = useNavigate();
  const {
    activeMatter,
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
    addAcceptedRedline,
    updateAcceptedRedline,
    deleteMatter,
  } = useMatterStore();
  const [isPeopleDialogOpen, setIsPeopleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingMatter, setIsDeletingMatter] = useState(false);
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [activeClauseSelection, setActiveClauseSelection] = useState<{
    matterId: string;
    clauseId: string;
  } | null>(null);
  const [isClauseJumpPanelCollapsed, setIsClauseJumpPanelCollapsed] =
    useState(false);
  const [isClauseJumpPanelVisible, setIsClauseJumpPanelVisible] = useState(false);
  const [isPageAwareOpen, setIsPageAwareOpen] = useState(true);
  const [openClauseSections, setOpenClauseSections] = useState<
    Record<string, boolean>
  >({});
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const apiBaseUrl =
    (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:4000";

  const people = activeMatter?.people || [];
  const pages = activeMatter?.pageAwareStructure.pages || [];
  const clauseSections = activeMatter?.pageAwareStructure.sections || [];

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
      const sectionRisk = getSectionRiskMap(activeMatter.id, section.section_id);
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

  const toWordTokens = (value: string) =>
    value.match(/(\s+|[^\s]+)/g) || [];

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
  const activeRedlineLoading =
    !!(activeClauseKey && redlineLoadingByKey[activeClauseKey]);
  const activeAcceptedCount =
    activeMatter && activeClauseId
      ? acceptedRedlines.filter((item) => item.clauseId === activeClauseId).length
      : 0;
  const activeDiff = useMemo(() => {
    if (!activeClause || !activeSuggestion?.rewrittenText) return [];
    return buildClauseDiff(activeClause.display_text, activeSuggestion.rewrittenText);
  }, [activeClause?.clause_id, activeSuggestion?.rewrittenText]);

  useEffect(() => {
    if (
      !activeMatter?.job_id ||
      activeMatter.extractedFieldsStatus !== "processing"
    ) {
      return;
    }

    let cancelled = false;

    const pollForFields = async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/matters/jobs/${encodeURIComponent(activeMatter.job_id)}`,
        );
        const payload = (await response.json()) as {
          success?: boolean;
          result?: MatterProcessedResult | null;
        };

        if (!cancelled && payload.success && payload.result) {
          updateMatter(payload.result);
        }

        if (
          !cancelled &&
          payload.success &&
          payload.result?.extracted_fields_status === "processing"
        ) {
          window.setTimeout(() => {
            void pollForFields();
          }, 2000);
        }
      } catch {
        if (!cancelled) {
          window.setTimeout(() => {
            void pollForFields();
          }, 3000);
        }
      }
    };

    void pollForFields();

    return () => {
      cancelled = true;
    };
  }, [
    activeMatter?.extractedFieldsStatus,
    activeMatter?.job_id,
    apiBaseUrl,
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
      const response = await fetch(`${apiBaseUrl}/api/matters/obligations/map`, {
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
      });

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
    if (section.extraction_status !== "ready" || !section.clauses.length) return;

    const cached = getSectionRiskMap(activeMatter.id, section.section_id);
    if (cached && cached.version_fingerprint === activeMatter.versionFingerprint) {
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
      const response = await fetch(`${apiBaseUrl}/api/matters/sections/risk-map`, {
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
      });

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
      (section) => section.extraction_status === "ready" && section.clauses.length,
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
    if (!activeMatter || deleteConfirmText !== "DELETE" || isDeletingMatter) return;
    setIsDeletingMatter(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/matters/${encodeURIComponent(activeMatter.id)}`,
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
      const response = await fetch(`${apiBaseUrl}/api/matters/clauses/redline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_clause_text: clause.display_text,
          clause_type: section.section_type,
          represented_party: representedParty,
          position,
          playbook_examples: playbookExamples,
        }),
      });

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
    if (!activeMatter || !activeClause || !activeClauseSection || !activeSuggestion) {
      return;
    }
    const resolvedTitle =
      (activeClauseKey && redlineTitleDraftByKey[activeClauseKey]?.trim()) ||
      `${activeClause.heading} (${activeRedlinePosition})`;
    const resolvedText =
      (activeClauseKey && redlineTextDraftByKey[activeClauseKey]?.trim()) ||
      activeSuggestion.rewrittenText;
    addAcceptedRedline({
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
    });
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
    const fallbackPage = pages.find((page) => page.page_number === source.source_page);
    const fallbackBlockId = fallbackPage?.blocks[0]?.block_id;
    if (!fallbackBlockId) return;
    const blockTarget = blockRefs.current[fallbackBlockId];
    blockTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const obligationColumns = useMemo(() => {
    if (!obligationMapResult) {
      return { ippb: [] as ObligationMapResult["obligations"], serviceProvider: [] as ObligationMapResult["obligations"] };
    }

    const ippb = obligationMapResult.obligations.filter(
      (item) => item.party === "ippb" || item.party === "mutual",
    );
    const serviceProvider = obligationMapResult.obligations.filter(
      (item) => item.party === "service_provider" || item.party === "mutual",
    );

    return { ippb, serviceProvider };
  }, [obligationMapResult]);
  const activeDraftTitle =
    (activeClauseKey && redlineTitleDraftByKey[activeClauseKey]) ||
    (activeClause
      ? `${activeClause.heading} (${activeRedlinePosition})`
      : "Clause redline");
  const activeDraftText =
    (activeClauseKey && redlineTextDraftByKey[activeClauseKey]) ||
    activeSuggestion?.rewrittenText ||
    "";

  return (
    <section className="matterOverviewWrap">
      <header className="matterOverviewHead">
        <p className="matterEyebrow">Matter Overview</p>
        <div className="matterOverviewTitleRow">
          <h1>{activeMatter?.title || "No matter uploaded yet"}</h1>
          <div className="matterOverviewActionRow">
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
                navigate(`/drafting?matter=${encodeURIComponent(activeMatter.id)}`)
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
      </header>

      <section className="matterPeopleSection">
        <div className="matterPeopleHead">
          <h2>People</h2>
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
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <FileText size={16} />
          </span>
          <div>
            <h3>Document type</h3>
            <p>{activeMatter?.mimeType || "Unknown"}</p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <Scale size={16} />
          </span>
          <div>
            <h3>Status</h3>
            <p>
              {activeMatter
                ? activeMatter.status === "processed"
                  ? "Document ingested (server processed)"
                  : activeMatter.status
                : "Waiting for upload"}
            </p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <FileText size={16} />
          </span>
          <div>
            <h3>Version hash</h3>
            <p>
              {activeMatter?.sha256
                ? `${activeMatter.sha256.slice(0, 12)}...`
                : "Not available"}
            </p>
          </div>
        </article>
        <article className="matterMetaCard">
          <span className="matterMetaIcon">
            <SplitSquareHorizontal size={16} />
          </span>
          <div>
            <h3>Pages / Words</h3>
            <p>
              {activeMatter
                ? `${activeMatter.page_count} pages / ${activeMatter.word_count.toLocaleString()} words`
                : "Not available"}
            </p>
          </div>
        </article>
      </div>

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
            <div className="matterBlankBannerBody" id="matter-blank-fields-list">
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

      <article className="matterQualityPanel">
        <div className="matterTextPanelHead">
          <h2>Page index</h2>
          <span>{activeMatter?.pageIndex.length || 0} sections</span>
        </div>
        <div className="matterPageIndexList">
          {activeMatter?.pageIndex.length ? (
            activeMatter.pageIndex.map((item) => (
              <div
                className={`matterPageIndexItem matterPageIndexItem-${item.status}`}
                key={`${item.type}-${item.start}-${item.end}`}
              >
                <span>{item.label}</span>
                <strong>
                  Page {item.start}
                  {item.end !== item.start ? `-${item.end}` : ""}
                </strong>
              </div>
            ))
          ) : (
            <p>No page index available yet.</p>
          )}
        </div>
      </article>

      <article className="matterQualityPanel">
        <div className="matterTextPanelHead">
          <h2>Page-aware structure</h2>
          <div className="matterPanelHeadActions">
            <div className="matterRiskRibbon">
              <span className="isHigh">{pageAwareRiskSummary.high} HIGH RISK</span>
              <span className="isReview">
                {pageAwareRiskSummary.review} REVIEW
              </span>
              <span className="isClean">{pageAwareRiskSummary.clean} CLEAN</span>
            </div>
            <Button
              type="button"
              className="matterQuickAnalysisBtn"
              disabled={quickAnalysisStatus === "running"}
              onClick={() => void runQuickRiskAnalysis()}
            >
              {quickAnalysisStatus === "running"
                ? `Analyzing ${quickAnalysisProgress.done}/${quickAnalysisProgress.total}`
                : "Quick analysis"}
            </Button>
            <span>{clauseSections.length} sections</span>
            <Button
              type="button"
              className="matterCollapseButton"
              onClick={() => setIsPageAwareOpen((prev) => !prev)}
              aria-expanded={isPageAwareOpen}
              aria-controls="matter-page-aware-body"
            >
              {isPageAwareOpen ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </Button>
          </div>
        </div>
        {isPageAwareOpen && (
          <div className="matterClauseSections" id="matter-page-aware-body">
            {clauseSections.length ? (
              clauseSections.map((section) => {
                const sectionStateKey = `${activeMatter?.id || "matter"}:${section.section_id}`;
                const isSectionOpen =
                  openClauseSections[sectionStateKey] ?? true;
                const sectionRisk = sectionRiskMaps.get(section.section_id);
                const sectionFlag = sectionRisk?.section_flag || defaultSectionRiskFlag(section);
                const sectionRiskItems = new Map(
                  (sectionRisk?.items || []).map((item) => [item.clause_id, item]),
                );
                const sectionRiskStatus = sectionRiskStatusById[section.section_id] || "idle";

                return (
                  <section
                    className="matterClauseSectionCard"
                    key={section.section_id}
                    ref={(node) => {
                      sectionRefs.current[section.section_id] = node;
                    }}
                  >
                    <Button
                      type="button"
                      className="matterClauseSectionToggle"
                      onClick={() => {
                        const nextIsOpen = !(openClauseSections[sectionStateKey] ?? true);
                        setOpenClauseSections((prev) => ({
                          ...prev,
                          [sectionStateKey]: nextIsOpen,
                        }));
                      }}
                      aria-expanded={isSectionOpen}
                      showImage
                      image={
                        isSectionOpen ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )
                      }
                      imagePosition="right"
                    >
                      <div className="matterClauseSectionHead">
                        <div>
                          <strong>{section.section_label}</strong>
                          <span>
                            Page {section.page_start}
                            {section.page_end !== section.page_start
                              ? `-${section.page_end}`
                              : ""}
                          </span>
                        </div>
                        <div className="matterClauseSectionHeadMeta">
                          {section.extraction_status === "failed" ? (
                            <span className="matterClauseStatusBadge isFailed">
                              Clause extraction failed
                            </span>
                          ) : section.extraction_status === "skipped" ? (
                            <span className="matterClauseStatusBadge isSkipped">
                              Skipped
                            </span>
                          ) : section.extraction_status === "ready" ? (
                            <span className="matterClauseStatusBadge isReady">
                              {section.clauses.length} clauses
                            </span>
                          ) : null}
                          <span
                            className={`matterClauseFlagPill ${sectionRiskClassName(sectionFlag)}`}
                          >
                            {sectionFlag}
                          </span>
                          <small>
                            {section.section_type.replace(/_/g, " ")}
                          </small>
                        </div>
                      </div>
                    </Button>

                    {isSectionOpen &&
                      (section.extraction_status === "ready" &&
                      section.clauses.length ? (
                        <div className="matterClauseList">
                          {sectionRiskStatus === "loading" ? (
                            <p className="matterClauseEmpty">
                              Classifying risk for this section...
                            </p>
                          ) : null}
                          {sectionRiskStatus === "error" ? (
                            <p className="matterClauseEmpty">
                              {sectionRiskErrorById[section.section_id] ||
                                "Risk classification failed."}
                            </p>
                          ) : null}
                          {section.clauses.map((clause) => {
                            const riskItem = sectionRiskItems.get(clause.clause_id);
                            const riskClass =
                              riskItem?.risk === "high"
                                ? "isHighRisk"
                                : riskItem?.risk === "clean"
                                  ? "isCleanRisk"
                                  : "isReviewRisk";
                            return (
                              <div
                                key={clause.clause_id}
                                className={`matterClauseItem ${
                                  activeClauseId === clause.clause_id
                                    ? "active"
                                    : ""
                                } ${riskClass}`}
                              >
                                <Button
                                  type="button"
                                  className="matterClauseItemMain"
                                  onClick={() => handleClauseSelect(clause)}
                                >
                                  <strong>{clause.heading}</strong>
                                  <p>{clause.display_text}</p>
                                  <span>
                                    {clause.grounding_status === "approximate"
                                      ? "Approximate match"
                                      : "Exact match"}
                                  </span>
                                </Button>
                                {activeClauseId === clause.clause_id ? (
                                  <div className="matterClauseRedlineArea">
                                    <div className="matterClauseRedlineHead">
                                      <strong>Positions</strong>
                                      <div className="matterClausePartyGroup">
                                        <Button
                                          type="button"
                                          className={
                                            representedParty === "service_provider"
                                              ? "isActive"
                                              : ""
                                          }
                                          onClick={() =>
                                            setRepresentedParty("service_provider")
                                          }
                                        >
                                          Service Provider
                                        </Button>
                                        <Button
                                          type="button"
                                          className={
                                            representedParty === "ippb"
                                              ? "isActive"
                                              : ""
                                          }
                                          onClick={() => setRepresentedParty("ippb")}
                                        >
                                          IPPB
                                        </Button>
                                        <Button
                                          type="button"
                                          className="matterClauseJumpBtn"
                                          onClick={() =>
                                            handleJumpToClausePage(
                                              clause.clause_id,
                                              true,
                                            )
                                          }
                                        >
                                          Jump to extracted text
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="matterClausePositionToggle">
                                      {(["aggressive", "market", "fallback"] as const).map(
                                        (position) => (
                                          <Button
                                            type="button"
                                            key={position}
                                            className={
                                              activeRedlinePosition === position
                                                ? "isActive"
                                                : ""
                                            }
                                            onClick={() =>
                                              handleRedlinePositionSelect(
                                                clause.clause_id,
                                                position,
                                              )
                                            }
                                          >
                                            {position}
                                          </Button>
                                        ),
                                      )}
                                    </div>
                                    {activeRedlineLoading ? (
                                      <div className="matterClauseRedlineState">
                                        <p>Generating suggested redline...</p>
                                        <Button
                                          type="button"
                                          className="matterAcceptRedlineBtn"
                                          disabled
                                        >
                                          Accept redline
                                        </Button>
                                      </div>
                                    ) : activeRedlineError ? (
                                      <div className="matterClauseRedlineState">
                                        <p>{activeRedlineError}</p>
                                        <Button
                                          type="button"
                                          onClick={() => void handleUseAiRedlining()}
                                        >
                                          Retry
                                        </Button>
                                        <Button
                                          type="button"
                                          className="matterAcceptRedlineBtn"
                                          disabled
                                        >
                                          Accept redline
                                        </Button>
                                      </div>
                                    ) : activeSuggestion ? (
                                      <>
                                        <div className="matterClauseDiffView">
                                          {activeDiff.map((part, partIndex) => (
                                            <span
                                              key={`${part.type}_${partIndex}`}
                                              className={`matterClauseDiff-${part.type}`}
                                            >
                                              {part.text}
                                            </span>
                                          ))}
                                        </div>
                                        <label className="matterClauseEditLabel">
                                          Redline title
                                          <input
                                            value={activeDraftTitle}
                                            onChange={(event) =>
                                              activeClauseKey &&
                                              setRedlineTitleDraftByKey((prev) => ({
                                                ...prev,
                                                [activeClauseKey]: event.target.value,
                                              }))
                                            }
                                          />
                                        </label>
                                        <label className="matterClauseEditLabel">
                                          Editable redline text
                                          <textarea
                                            value={activeDraftText}
                                            rows={4}
                                            onChange={(event) =>
                                              activeClauseKey &&
                                              setRedlineTextDraftByKey((prev) => ({
                                                ...prev,
                                                [activeClauseKey]: event.target.value,
                                              }))
                                            }
                                          />
                                        </label>
                                        <div className="matterClauseRedlineActions">
                                          <Button
                                            type="button"
                                            className="matterUseAiRedlineBtn"
                                            onClick={() => void handleUseAiRedlining()}
                                          >
                                            Use AI redlining
                                          </Button>
                                          <Button
                                            type="button"
                                            className="matterAcceptRedlineBtn"
                                            onClick={handleAcceptRedline}
                                          >
                                            Accept redline
                                          </Button>
                                          {activeAcceptedCount ? (
                                            <span>
                                              {activeAcceptedCount} accepted for this
                                              clause
                                            </span>
                                          ) : null}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="matterClauseRedlineState">
                                        <p>
                                          Pick a position and click Use AI redlining
                                          to generate a suggested rewrite.
                                        </p>
                                        <Button
                                          type="button"
                                          className="matterUseAiRedlineBtn"
                                          onClick={() => void handleUseAiRedlining()}
                                        >
                                          Use AI redlining
                                        </Button>
                                        <Button
                                          type="button"
                                          className="matterAcceptRedlineBtn"
                                          disabled
                                        >
                                          Accept redline
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : section.extraction_status === "failed" ? (
                        <p className="matterClauseEmpty">
                          Clause extraction failed for {section.section_label}.{" "}
                          {section.error}
                        </p>
                      ) : section.extraction_status === "skipped" ? (
                        <p className="matterClauseEmpty">
                          Clause extraction is skipped for this section type.
                        </p>
                      ) : (
                        <p className="matterClauseEmpty">
                          No clauses extracted yet.
                        </p>
                      ))}
                  </section>
                );
              })
            ) : (
              <p className="matterQualityEmpty">
                No page-aware structure available yet.
              </p>
            )}
          </div>
        )}
      </article>

      <article className="matterTextPanel">
        <div className="matterTextPanelHead">
          <h2>Extracted document</h2>
          <span>
            {pages.length} pages · {totalBlockCount} blocks
          </span>
        </div>
        <div className="matterDocumentViewer">
          {pages.length ? (
            pages.map((page) => (
              <section className="matterDocumentPage" key={page.page_number}>
                <div className="matterDocumentPageHead">
                  <strong>Page {page.page_number}</strong>
                  <span>{page.label || "other"}</span>
                </div>
                <div className="matterDocumentBlockList">
                  {page.blocks.map((block) => {
                    const blockRanges = highlightMap.get(block.block_id) || [];
                    const blankRanges = blankFieldMap.get(block.block_id) || [];
                    const warningLevel = blockWarningLevel.get(block.block_id);
                    return (
                      <div
                        key={block.block_id}
                        ref={(node) => {
                          blockRefs.current[block.block_id] = node;
                        }}
                        className={`matterDocumentBlock matterDocumentBlock-${block.type} ${
                          blockRanges.length ? "isHighlighted" : ""
                        } ${
                          warningLevel === "high"
                            ? "hasHighWarning"
                            : warningLevel === "review"
                              ? "hasReviewWarning"
                              : ""
                        }`}
                      >
                        {warningLevel === "high" ? (
                          <span
                            className="matterBlockWarning matterBlockWarningHigh"
                            title="This clause appears one-sided."
                          >
                            One-sided clause warning
                          </span>
                        ) : warningLevel === "review" ? (
                          <span
                            className="matterBlockWarning matterBlockWarningReview"
                            title="This clause may require legal review."
                          >
                            Review this clause
                          </span>
                        ) : null}
                        <p>
                          {renderHighlightedText(
                            block.text,
                            blockRanges,
                            blankRanges,
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="matterQualityEmpty">
              No extracted document available yet.
            </p>
          )}
        </div>
      </article>

      <article className="matterQualityPanel">
        <div className="matterTextPanelHead">
          <h2>Text quality</h2>
          <span>{activeMatter?.nextStep || "Waiting for upload"}</span>
        </div>
        <div className="matterQualityBody">
          <div className="matterQualityScore">
            <span className="matterMetaIcon">
              <ShieldCheck size={16} />
            </span>
            <div>
              <h3>{activeMatter?.textQuality.level || "UNKNOWN"}</h3>
              <p>
                {activeMatter
                  ? `${Math.round(activeMatter.textQuality.score * 100)}% quality score`
                  : "No quality check available"}
              </p>
            </div>
          </div>

          <div className="matterQualityMetrics">
            <span>
              Characters:{" "}
              {activeMatter?.textQuality.metrics.character_count || 0}
            </span>
            <span>
              Words: {activeMatter?.textQuality.metrics.word_count || 0}
            </span>
            <span>
              Empty pages: {activeMatter?.textQuality.metrics.empty_pages || 0}
            </span>
            <span>
              Script:{" "}
              {activeMatter?.textQuality.metrics.language_script || "Unknown"}
            </span>
            <span>
              Tables:{" "}
              {activeMatter?.textQuality.metrics.table_like_block_count || 0}
            </span>
            <span>Blocks: {totalBlockCount || 0}</span>
          </div>

          {activeMatter?.textQuality.issues.length ? (
            <ul className="matterQualityIssues">
              {activeMatter.textQuality.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="matterQualityEmpty">
              No blocking quality issues detected.
            </p>
          )}
        </div>
      </article>

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
            <p className="matterObligationState">
              Mapping obligations from clause summaries...
            </p>
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
                        const source = obligationClauseById.get(item.clause_id);
                        if (!source) return null;
                        return (
                          <li key={`ippb-${item.clause_id}`}>
                            <Button
                              type="button"
                              className="matterObligationLink"
                              onClick={() => handleJumpToClauseById(item.clause_id)}
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
                                onClick={() => handleJumpToClausePage(item.clause_id, true)}
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
                        const source = obligationClauseById.get(item.clause_id);
                        if (!source) return null;
                        return (
                          <li key={`sp-${item.clause_id}`}>
                            <Button
                              type="button"
                              className="matterObligationLink"
                              onClick={() => handleJumpToClauseById(item.clause_id)}
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
                                onClick={() => handleJumpToClausePage(item.clause_id, true)}
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
                    <input
                      className="matterPlaybookTitleInput"
                      value={item.title || item.clauseHeading}
                      onChange={(event) =>
                        activeMatter &&
                        updateAcceptedRedline(activeMatter.id, item.id, {
                          title: event.target.value,
                        })
                      }
                    />
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
    </section>
  );
};

export default MatterSection;
