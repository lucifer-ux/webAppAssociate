import { useEffect, useMemo, useRef, useState } from "react";
import Button from "./Button";
import { ArrowUpRight, Trash2 } from "lucide-react";
import "../componentStyling/ActiveResearch.css";
import SearchBar, { type SearchBarMode } from "./SearchBar";
import { useLocation, useNavigate } from "react-router-dom";
import type { RecentResearchItem } from "./ActiveResearchPage";
import { buildApiUrl } from "../lib/apiBase";
import { usePipelines } from "../context/PipelineContext";

type Agent1Output = {
  query_meta: {
    raw_query: string;
    domain: string;
    sub_domain: string | null;
    excluded_domains: string[];
    jurisdiction: string;
    state: string | null;
    operative_facts: {
      parties: string[];
      incident_type: string;
      transaction_or_instrument_type: string | null;
      amount_or_value: number | null;
      timeline: {
        incident_date: string | null;
        reporting_delay: string | null;
        limitation_concern: boolean;
      };
      key_dispute: string;
      remedy_sought: string | null;
    };
  };
  search_results: {
    regulatory: Array<{
      source_url: string;
      source_domain: string;
      title: string;
      summary: string;
      key_extract: string | null;
      date: string | null;
      reliability: "primary" | "secondary" | "unverified";
    }>;
    case_law: Array<{
      source_url: string;
      source_domain: string;
      title: string;
      summary: string;
      forum: string;
      date: string | null;
      reliability: "primary" | "secondary" | "unverified";
    }>;
  };
  gaps: {
    domain_determining: Array<{ field: string; reason: string }>;
    nice_to_have: Array<{ field: string; reason: string }>;
  };
};

type Agent1ForAgent2 = {
  operative_facts: {
    parties: string[];
    incident_type: string;
    transaction_or_instrument_type: string | null;
    amount_or_value: number | null;
    timeline: {
      reporting_delay: string | null;
      limitation_concern: boolean;
    };
    key_dispute: string;
    remedy_sought: string | null;
  };
  excluded_domains: string[];
  jurisdiction: string;
  state: string | null;
  regulatory_anchors: Array<{
    source_url: string;
    title: string;
    summary: string;
    reliability: "primary" | "secondary" | "unverified";
  }>;
  case_law_signals: Array<{
    source_url: string;
    title: string;
    summary: string;
    date: string | null;
    reliability: "primary" | "secondary" | "unverified";
  }>;
  blocking_gaps: Array<{ field: string; reason: string }>;
  non_blocking_gaps: Array<{ field: string; reason: string }>;
};

type Agent2Lane = {
  lane_id: string;
  title: string;
  one_line: string;
  forum: string;
  primary_law: string[];
  what_this_route_argues: string;
  likely_outcome: string;
  timeline: string;
  cost: string;
  strength: "high" | "medium" | "low" | "speculative";
  weakness: string;
  evidence_found: string[];
  missing_before_deep_research: string[];
};

type Agent2Output = {
  clarification_required: {
    needed_before_lane_selection: boolean;
    question: string | null;
    reason: string | null;
    options: string[];
  };
  lanes: Agent2Lane[];
  recommendation: {
    suggested_lane: string | null;
    reason: string;
  };
  what_happens_next: string;
};

type IntakeResponse = {
  success: boolean;
  status: "clarification_required" | "lane_selection_required" | "auto_proceed";
  sequence?: string[];
  memory_bank_domain?: string;
  agent_1_output?: Agent1Output;
  agent_1_output_for_agent_2?: Agent1ForAgent2;
  agent_2_output?: Agent2Output;
  selected_lane_id?: string | null;
};

type FinalResponse = {
  title: string;
  authority_selection_summary: string;
  short_answer: string;
  governing_rule: string;
  key_authorities: Array<{
    name: string;
    court: string | null;
    citation: string | null;
    principle: string;
    why_cited: string;
    relevance: "direct" | "related";
  }>;
  analysis: string;
  uncertainty_or_limits: string;
  confidence: "high" | "medium" | "low";
  sources: Array<{
    name: string;
    url: string;
    why_cited?: string;
    sourceClass: "official" | "secondary" | "statute";
  }>;
};

type DeepResearchResponse = {
  success: boolean;
  selected_lane?: Agent2Lane | null;
  final_response?: FinalResponse;
  synthesis_state?: {
    direct_authorities?: Array<{
      title: string;
      why_it_matters?: string;
    }>;
  };
};

type ResearchRecord = RecentResearchItem & {
  intakePayload: IntakeResponse | null;
  finalPayload: DeepResearchResponse | null;
  selectedLaneId: string | null;
  clarificationAnswer: string | null;
};

export type SavedResearchApiItem = {
  id: string;
  query: string;
  createdAt: string;
  intakePayload: IntakeResponse | null;
  finalPayload: DeepResearchResponse | null;
  selectedLaneId: string | null;
  clarificationAnswer: string | null;
};

type ActiveResearchProps = {
  activeSection: "matterLibrary" | "activeResearch";
  recentResearches: RecentResearchItem[];
  activeResearchId: string | null;
  onRecentResearchesChange: (items: RecentResearchItem[]) => void;
  onActiveResearchChange: (id: string | null) => void;
  initialResearches?: SavedResearchApiItem[];
  isStartingFreshResearch?: boolean;
};

const THINKING_MESSAGES = {
  intake: [
    "Mapping your query to legal memory-bank domains.",
    "Running parallel Exa discovery for regulatory and case-law sources.",
    "Structuring discovery output and generating route lanes.",
  ],
  deep: [
    "Locking the selected lane into the research graph.",
    "Running targeted retrieval, deduplication, and authority extraction.",
    "Synthesizing the answer and formatting authority reasons for display.",
  ],
} as const;

const formatStrength = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());

const formatSourceClass = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());

const getResearchWorkspaceTitle = (query: string) => {
  const normalized = String(query || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Related matter";

  const firstClause =
    normalized.split(/[?.!,:;-]/).find((part) => part.trim()) || normalized;
  const words = firstClause
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const shortTitle = words.slice(0, 6).join(" ");
  if (!shortTitle) return "Related matter";
  return shortTitle.length > 56 ? `${shortTitle.slice(0, 53)}...` : shortTitle;
};

const isIndianKanoonUrl = (url: string) => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host === "indiankanoon.org" || host === "api.indiankanoon.org";
  } catch {
    return false;
  }
};

const ActiveResearch = ({
  activeSection,
  recentResearches,
  activeResearchId,
  onRecentResearchesChange,
  onActiveResearchChange,
  initialResearches = [],
  isStartingFreshResearch = false,
}: ActiveResearchProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { startDeepResearchJob } = usePipelines();
  const [researchRuns, setResearchRuns] = useState<ResearchRecord[]>(() =>
    (initialResearches || []).map((item) => ({
      id: String(item.id),
      query: String(item.query || ""),
      createdAt: String(item.createdAt || new Date().toISOString()),
      intakePayload: item.intakePayload || null,
      finalPayload: item.finalPayload || null,
      selectedLaneId: item.selectedLaneId || null,
      clarificationAnswer: item.clarificationAnswer || null,
    })),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"intake" | "deep" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [isSavingResearch, setIsSavingResearch] = useState(false);
  const [isDeletingResearch, setIsDeletingResearch] = useState(false);
  const [runningStepIndex, setRunningStepIndex] = useState(0);
  const hasLocalResearchMutation = useRef(false);

  const thinkingMessages =
    loadingPhase === "deep" ? THINKING_MESSAGES.deep : THINKING_MESSAGES.intake;

  useEffect(() => {
    if (!isLoading) return;
    let timer = 0;
    const rotate = () => {
      setRunningStepIndex((prev) => (prev + 1) % thinkingMessages.length);
      timer = window.setTimeout(rotate, 2000 + Math.random() * 2000);
    };
    timer = window.setTimeout(rotate, 2000 + Math.random() * 2000);
    return () => window.clearTimeout(timer);
  }, [isLoading, thinkingMessages.length]);

  useEffect(() => {
    const navState = location.state as { autoResearchQuery?: string } | null;
    const autoResearchQuery = navState?.autoResearchQuery?.trim();
    if (!autoResearchQuery || isLoading) return;

    void startDeepResearchJob(autoResearchQuery);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, isLoading, navigate, startDeepResearchJob]);

  useEffect(() => {
    if (initialResearches.length) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          buildApiUrl("/api/researches?limit=50"),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          researches?: SavedResearchApiItem[];
        };
        if (!response.ok || !payload?.success || !Array.isArray(payload.researches)) {
          return;
        }
        if (cancelled || hasLocalResearchMutation.current) return;
        const nextRuns: ResearchRecord[] = payload.researches.map((item) => ({
          id: String(item.id),
          query: String(item.query || ""),
          createdAt: String(item.createdAt || new Date().toISOString()),
          intakePayload: item.intakePayload || null,
          finalPayload: item.finalPayload || null,
          selectedLaneId: item.selectedLaneId || null,
          clarificationAnswer: item.clarificationAnswer || null,
        }));
        setResearchRuns(nextRuns);
        const nextRecent = nextRuns.map((item) => ({
          id: item.id,
          query: item.query,
          createdAt: item.createdAt,
        }));
        onRecentResearchesChange(nextRecent);
        if (!activeResearchId && nextRuns.length > 0 && !isStartingFreshResearch) {
          onActiveResearchChange(nextRuns[0].id);
        }
      } catch {
        // no-op: page can still work without persisted hydrate
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    initialResearches,
    onActiveResearchChange,
    onRecentResearchesChange,
  ]);

  const activeResearch = useMemo(
    () => researchRuns.find((item) => item.id === activeResearchId) || null,
    [researchRuns, activeResearchId],
  );

  const updateResearchRecord = (
    id: string,
    updater: (record: ResearchRecord) => ResearchRecord,
  ) => {
    setResearchRuns((prev) =>
      prev.map((item) => (item.id === id ? updater(item) : item)),
    );
  };

  const removeResearchRecord = (id: string) => {
    setResearchRuns((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const nextRecent = next.map((item) => ({
        id: item.id,
        query: item.query,
        createdAt: item.createdAt,
      }));
      onRecentResearchesChange(nextRecent);
      onActiveResearchChange(activeResearchId === id ? next[0]?.id || null : activeResearchId);
      return next;
    });
  };

  const runDeepResearch = async (
    record: ResearchRecord,
    intakePayload: IntakeResponse,
    selectedLaneId: string,
  ) => {
    setLoadingPhase("deep");
    setRunningStepIndex(0);
    setIsLoading(true);

    try {
      const response = await fetch(
        buildApiUrl("/api/agent/research-intent-continue"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: record.query,
            jurisdiction: "India",
            agent_1_output: intakePayload.agent_1_output,
            agent_1_output_for_agent_2:
              intakePayload.agent_1_output_for_agent_2,
            agent_2_output: intakePayload.agent_2_output,
            selected_lane_id: selectedLaneId,
          }),
        },
      );

      const payload = (await response.json()) as DeepResearchResponse & {
        error?: string;
        details?: string;
      };

      if (!response.ok || !payload?.success) {
        setError(
          payload.error || payload.details || "Deep research run failed.",
        );
        return;
      }

      updateResearchRecord(record.id, (item) => ({
        ...item,
        selectedLaneId,
        finalPayload: payload,
      }));
    } catch {
      setError("Failed to continue research after lane selection.");
    } finally {
      setIsLoading(false);
      setLoadingPhase(null);
    }
  };

  async function runIntake(
    query: string,
    recordId?: string,
    clarificationAnswer?: string,
  ) {
    hasLocalResearchMutation.current = true;
    setError("");
    setLoadingPhase("intake");
    setRunningStepIndex(0);
    setIsLoading(true);
    try {
      const response = await fetch(
        buildApiUrl("/api/agent/research-intent-intake"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            jurisdiction: "India",
            clarification_answer: clarificationAnswer || null,
          }),
        },
      );

      const payload = (await response.json()) as IntakeResponse & {
        error?: string;
        details?: string;
      };

      if (!response.ok || !payload?.success) {
        setError(
          payload.error || payload.details || "Agent intake request failed.",
        );
        return;
      }

      const nextSelectedLaneId =
        payload.selected_lane_id ||
        payload.agent_2_output?.recommendation?.suggested_lane ||
        payload.agent_2_output?.lanes?.[0]?.lane_id ||
        null;

      if (recordId) {
        updateResearchRecord(recordId, (item) => ({
          ...item,
          intakePayload: payload,
          finalPayload: null,
          selectedLaneId: nextSelectedLaneId,
          clarificationAnswer: clarificationAnswer || null,
        }));
      } else {
        const item: ResearchRecord = {
          id: crypto.randomUUID(),
          query,
          createdAt: new Date().toISOString(),
          intakePayload: payload,
          finalPayload: null,
          selectedLaneId: nextSelectedLaneId,
          clarificationAnswer: clarificationAnswer || null,
        };

        setResearchRuns((prev) => [item, ...prev]);
        onRecentResearchesChange([
          { id: item.id, query: item.query, createdAt: item.createdAt },
          ...recentResearches,
        ]);
        onActiveResearchChange(item.id);
        recordId = item.id;
      }
    } catch {
      setError("Failed to connect to discovery endpoint.");
    } finally {
      setIsLoading(false);
      setLoadingPhase(null);
    }
  }

  const handleSubmitQuery = async (query: string, _mode: SearchBarMode) => {
    await startDeepResearchJob(query);
  };

  const handleSelectLane = (laneId: string) => {
    if (!activeResearch) return;
    updateResearchRecord(activeResearch.id, (item) => ({
      ...item,
      selectedLaneId: laneId,
    }));
  };

  const handleClarificationOption = async (option: string) => {
    if (!activeResearch) return;
    await runIntake(activeResearch.query, activeResearch.id, option);
  };

  const handleContinueResearch = async () => {
    if (!activeResearch?.intakePayload || !activeResearch.selectedLaneId)
      return;
    await runDeepResearch(
      activeResearch,
      activeResearch.intakePayload,
      activeResearch.selectedLaneId,
    );
  };

  const handleSaveResearch = async () => {
    if (!activeResearch) return;
    setSaveError("");
    setSaveSuccess("");
    setIsSavingResearch(true);
    try {
      const orgName = window.localStorage.getItem("orgName") || null;
      const response = await fetch(buildApiUrl("/api/researches/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName,
          query: activeResearch.query,
          createdAt: activeResearch.createdAt,
          intakePayload: activeResearch.intakePayload,
          finalPayload: activeResearch.finalPayload,
          selectedLaneId: activeResearch.selectedLaneId,
          clarificationAnswer: activeResearch.clarificationAnswer,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
      };
      if (!response.ok || !payload.success) {
        setSaveError(
          payload.error || payload.details || "Failed to save research.",
        );
        return;
      }
      setSaveSuccess("Research saved.");
    } catch {
      setSaveError("Failed to save research.");
    } finally {
      setIsSavingResearch(false);
    }
  };

  const handleDeleteResearch = async () => {
    if (!activeResearch || isDeletingResearch) return;
    const confirmed = window.confirm(
      `Delete saved research "${activeResearch.query}"?`,
    );
    if (!confirmed) return;

    setSaveError("");
    setSaveSuccess("");
    setIsDeletingResearch(true);
    try {
      const response = await fetch(
        buildApiUrl(`/api/researches/${encodeURIComponent(activeResearch.id)}`),
        {
          method: "DELETE",
        },
      );
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.details || "Failed to delete research.");
      }
      removeResearchRecord(activeResearch.id);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to delete research.",
      );
    } finally {
      setIsDeletingResearch(false);
    }
  };

  const intake = activeResearch?.intakePayload || null;
  const agent1 = intake?.agent_1_output;
  const agent2 = intake?.agent_2_output;
  const finalResponse = activeResearch?.finalPayload?.final_response || null;
  const visibleDiscoveryCases = (agent1?.search_results.case_law || []).filter(
    (item) => !isIndianKanoonUrl(item.source_url),
  );
  const visibleFinalSources = (finalResponse?.sources || []).filter(
    (item) => !isIndianKanoonUrl(item.url),
  );
  const selectedLane =
    (agent2?.lanes || []).find(
      (lane) => lane.lane_id === activeResearch?.selectedLaneId,
    ) || null;
  const canShowContinueResearchButton = Boolean(activeResearch && !isLoading);
  const workspaceTitle = getResearchWorkspaceTitle(activeResearch?.query || "");

  return (
    <>
      <section className="researchWorkspace enhancedResearchWorkspace searchOnlyWorkspace">
        <div className="researchHead">
          <div className="researchTitleBlock">
            <p>Discovery, Pathway Selection, and Targeted Research</p>
            <h1 title={activeResearch?.query || workspaceTitle}>{workspaceTitle}</h1>
          </div>
          <div className="researchSaveRow">
            <Button
              type="button"
              className="continueResearchButton"
              onClick={() => {
                void handleSaveResearch();
              }}
              disabled={!activeResearch || isSavingResearch}
            >
              {isSavingResearch ? "Saving..." : "Save research"}
            </Button>
            <Button
              type="button"
              className="deleteResearchButton"
              onClick={() => {
                void handleDeleteResearch();
              }}
              disabled={!activeResearch || isDeletingResearch}
            >
              <Trash2 size={16} />
              <span>{isDeletingResearch ? "Deleting..." : "Delete research"}</span>
            </Button>
            {saveSuccess ? (
              <small className="researchSaveSuccess">{saveSuccess}</small>
            ) : null}
            {saveError ? (
              <small className="researchSaveError">{saveError}</small>
            ) : null}
          </div>
        </div>

        <div className="researchOutputPanel chatOnlyPanel">
          {isLoading && (
            <div className="thinkingCard" aria-live="polite">
              <h3>
                {loadingPhase === "deep"
                  ? "Deep research in progress"
                  : "Agent sequence in progress"}
              </h3>
              <p>{thinkingMessages[runningStepIndex]}</p>
            </div>
          )}

          {!isLoading && !error && !activeResearch && (
            <div className="emptyWorkspaceCard chatOnlyEmpty">
              <p>
                Ask a legal question to run deep research, choose a lane, and
                continue into full research.
              </p>
            </div>
          )}

          {!isLoading && error && <p className="researchErrorState">{error}</p>}

          {!isLoading && !error && activeResearch && (
            <article className="researchResultCard">
              <section className="chatMessage userMessage">
                <h4>User</h4>
                <p>{activeResearch.query}</p>
              </section>

              {(agent1 || agent2) && (
                <section className="chatMessage llmMessage">
                  <h4>LLM Response (Research Intake)</h4>
                  <p className="responseQuery">
                    Domain: {intake?.memory_bank_domain || "general"}
                  </p>
                  {agent1 && (
                    <>
                      <p>{agent1.query_meta.operative_facts.key_dispute}</p>
                      <div className="tokenGroup">
                        {agent1.query_meta.excluded_domains.map((domain) => (
                          <span key={domain} className="infoToken">
                            Exclude: {domain}
                          </span>
                        ))}
                      </div>
                      <ul className="authorityList">
                        {agent1.search_results.regulatory
                          .slice(0, 2)
                          .map((item) => (
                            <li key={item.source_url}>
                              <strong>{item.title}</strong>
                              <span>
                                {item.source_domain} · {item.reliability}
                              </span>
                              <p>{item.summary}</p>
                            </li>
                          ))}
                        {visibleDiscoveryCases.slice(0, 2).map((item) => (
                          <li key={item.source_url}>
                            <strong>{item.title}</strong>
                            <span>
                              {item.source_domain} · {item.reliability}
                            </span>
                            <p>{item.summary}</p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {agent2 && (
                    <>
                      {agent2.clarification_required
                        .needed_before_lane_selection ? (
                        <div className="clarificationBlock">
                          <p>
                            {agent2.clarification_required.question ||
                              "Clarification required."}
                          </p>
                          {agent2.clarification_required.reason && (
                            <small>
                              {agent2.clarification_required.reason}
                            </small>
                          )}
                          {agent2.clarification_required.options.length > 0 && (
                            <div className="clarificationOptionsGrid">
                              {agent2.clarification_required.options.map(
                                (option) => (
                                  <Button
                                    key={option}
                                    type="button"
                                    className="clarificationOptionCard"
                                    onClick={() => {
                                      void handleClarificationOption(option);
                                    }}
                                  >
                                    {option}
                                  </Button>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="clarificationBlock">
                          <p>
                            No blocking clarification required before lane
                            selection.
                          </p>
                        </div>
                      )}

                      <h4>Implementation Plans</h4>
                      <div className="lanesGrid">
                        {agent2.lanes.map((lane) => (
                          <Button
                            key={lane.lane_id}
                            type="button"
                            className={`laneCard ${
                              lane.lane_id === activeResearch.selectedLaneId
                                ? "selected"
                                : ""
                            }`}
                            onClick={() => handleSelectLane(lane.lane_id)}
                          >
                            <strong>{lane.title}</strong>
                            <span>
                              {formatStrength(lane.strength)} · {lane.forum}
                            </span>
                            <p>{lane.one_line}</p>
                            <small>{lane.what_this_route_argues}</small>
                          </Button>
                        ))}
                      </div>
                      <p>{agent2.recommendation.reason}</p>
                      <p>{agent2.what_happens_next}</p>
                    </>
                  )}
                </section>
              )}

              {canShowContinueResearchButton && (
                <div className="continueResearchRow">
                  <Button
                    type="button"
                    className="continueResearchButton"
                    onClick={() => {
                      void handleContinueResearch();
                    }}
                    disabled={!activeResearch?.selectedLaneId || isLoading}
                  >
                    Continue research
                  </Button>
                </div>
              )}

              {selectedLane && (
                <section className="chatMessage acceptedPlanMessage">
                  <h4>Accepted Implementation Plan</h4>
                  <p>
                    <strong>{selectedLane.title}</strong>
                  </p>
                  <p>{selectedLane.what_this_route_argues}</p>
                  <p>
                    {formatStrength(selectedLane.strength)} ·{" "}
                    {selectedLane.forum}
                  </p>
                </section>
              )}

              {finalResponse && (
                <section className="chatMessage llmMessage">
                  <h4>LLM Response (Deep Research)</h4>
                  <section>
                    <h4>Summary</h4>
                    <p>{finalResponse.authority_selection_summary}</p>
                  </section>

                  <section>
                    <h4>Initial Understanding</h4>
                    <p>{finalResponse.short_answer}</p>
                    <p>{finalResponse.governing_rule}</p>
                    <p>{finalResponse.analysis}</p>
                  </section>

                  <section>
                    <h4>Statutes and Precedents</h4>
                    <ul className="authorityList finalAuthorityList">
                      {finalResponse.key_authorities.map((authority) => (
                        <li
                          key={`${authority.name}-${authority.citation || authority.court || ""}`}
                        >
                          <strong>{authority.name}</strong>
                          <span>
                            {[
                              authority.citation,
                              authority.court,
                              authority.relevance,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <p>{authority.principle}</p>
                          <p className="citationReasonText">
                            {authority.why_cited}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="allSourcesSection">
                    <h4>Sources</h4>
                    <ul className="perplexityStyleSources">
                      {visibleFinalSources.map((source) => (
                        <li key={source.url}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            <ArrowUpRight size={16} />
                            <span>{source.name}</span>
                            <small>
                              {formatSourceClass(source.sourceClass)}
                            </small>
                            {source.why_cited ? (
                              <small className="sourceReasonText">
                                {source.why_cited}
                              </small>
                            ) : null}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                </section>
              )}
            </article>
          )}
        </div>
      </section>

      <SearchBar
        activeSection={activeSection}
        onSubmitQuery={handleSubmitQuery}
        isSubmitting={isLoading}
        mode="deep"
        showModeSelector={false}
        placeholderOverride="Start deep legal research..."
      />
    </>
  );
};

export default ActiveResearch;
