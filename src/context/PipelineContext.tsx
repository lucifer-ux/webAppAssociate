import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../lib/apiBase";
import { fetchCreditBalance, updateCreditCacheFromPayload } from "../lib/creditCache";
import {
  type SingleDraftStreamRequest,
} from "../components/draftingApi";
import {
  useMatterStore,
  type MatterProcessedResult,
} from "./MatterStoreContext";

type PipelineStatus = "queued" | "running" | "succeeded" | "failed";
type PipelineType = "matter" | "research" | "draft";

export type PipelineJob = {
  id: string;
  type: PipelineType;
  title: string;
  status: PipelineStatus;
  stage: string;
  progress: number;
  targetPath: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  unread?: boolean;
  source?: "matter-job" | "research-deep" | "draft-job";
  jobId?: string;
  resultId?: string;
  requestKey?: string;
  matterId?: string;
  draftId?: string;
  stageKey?: string;
  statusMessage?: string;
  thinkingText?: string;
  thinkingHistory?: string[];
};

type PipelineContextValue = {
  jobs: PipelineJob[];
  activeJobs: PipelineJob[];
  unreadCount: number;
  trackMatterJob: (input: {
    jobId: string;
    title: string;
    targetPath?: string;
    type?: PipelineType;
  }) => void;
  startDeepResearchJob: (query: string) => Promise<void>;
  startSingleDraftJob: (input: SingleDraftJobInput) => string | null;
  markRead: (jobId: string) => void;
  markAllRead: () => void;
  dismissJob: (jobId: string) => void;
  navigateToJob: (job: PipelineJob) => void;
};

const STORAGE_KEY = "associate.pipelineJobs";
const MAX_JOBS = 25;
const MATTER_POLL_MS = 2500;
const DRAFT_POLL_MS = 5000;

const PipelineContext = createContext<PipelineContextValue | null>(null);

const nowIso = () => new Date().toISOString();

const clampProgress = (value: unknown) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, Math.min(100, numberValue));
};

const isActiveStatus = (status: PipelineStatus) =>
  status === "queued" || status === "running";

const readStoredJobs = (): PipelineJob[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_JOBS) : [];
  } catch {
    return [];
  }
};

const buildMatterPipelineId = (jobId: string) => `matter:${jobId}`;
const buildDraftRequestKey = (input: SingleDraftJobInput) =>
  [
    input.matterId,
    input.draftType,
    input.draftKey || "",
    input.draftTitle || "",
    input.requestedFrom || "overview",
  ].join(":");

type SingleDraftJobInput = SingleDraftStreamRequest & {
  targetBasePath?: string;
};

export const PipelineProvider = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const { addMatter, updateMatter } = useMatterStore();
  const [jobs, setJobs] = useState<PipelineJob[]>(() => readStoredJobs());
  const pollingRef = useRef(false);
  const runningDraftRequestsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_JOBS)));
  }, [jobs]);

  const upsertJob = useCallback((nextJob: PipelineJob) => {
    setJobs((current) => {
      const existing = current.find((item) => item.id === nextJob.id);
      const merged = existing ? { ...existing, ...nextJob } : nextJob;
      const without = current.filter((item) => item.id !== nextJob.id);
      return [merged, ...without].slice(0, MAX_JOBS);
    });
  }, []);

  const patchJob = useCallback((jobId: string, patch: Partial<PipelineJob>) => {
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId
          ? { ...job, ...patch, updatedAt: patch.updatedAt || nowIso() }
          : job,
      ),
    );
  }, []);

  const trackMatterJob = useCallback(
    ({
      jobId,
      title,
      targetPath = "/matter",
      type = "matter",
    }: {
      jobId: string;
      title: string;
      targetPath?: string;
      type?: PipelineType;
    }) => {
      const normalizedJobId = String(jobId || "").trim();
      if (!normalizedJobId) return;
      const timestamp = nowIso();
      upsertJob({
        id: buildMatterPipelineId(normalizedJobId),
        type,
        source: "matter-job",
        jobId: normalizedJobId,
        title: title || "Matter pipeline",
        status: "running",
        stage: "Queued",
        progress: 5,
        targetPath,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
    [upsertJob],
  );

  const completeMatterJob = useCallback(
    (pipelineJob: PipelineJob, result: MatterProcessedResult) => {
      const matterId = result?.matter?.id || "";
      if (matterId) {
        const targetPath = `/matter?matter=${encodeURIComponent(matterId)}`;
        patchJob(pipelineJob.id, {
          status: "succeeded",
          stage: "Completed",
          progress: 100,
          completedAt: nowIso(),
          targetPath,
          resultId: matterId,
          unread: true,
        });
      } else {
        patchJob(pipelineJob.id, {
          status: "succeeded",
          stage: "Completed",
          progress: 100,
          completedAt: nowIso(),
          unread: true,
        });
      }
      addMatter(result);
      void fetchCreditBalance();
    },
    [addMatter, patchJob],
  );

  const pollMatterJob = useCallback(
    async (job: PipelineJob) => {
      if (!job.jobId || job.status !== "running") return;
      try {
        const response = await fetch(
          buildApiUrl(`/api/matters/jobs/${encodeURIComponent(job.jobId)}`),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          status?: string;
          stage?: string;
          progress?: number;
          result?: MatterProcessedResult | null;
          error?: string | null;
        };
        updateCreditCacheFromPayload(payload);
        if (response.status === 404) {
          patchJob(job.id, {
            status: "failed",
            stage: "Job expired",
            progress: 100,
            error: payload.error || "Background job was not found.",
            completedAt: nowIso(),
            unread: true,
          });
          return;
        }
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Matter job status failed.");
        }
        if (payload.status === "failed") {
          patchJob(job.id, {
            status: "failed",
            stage: payload.stage || "Failed",
            progress: clampProgress(payload.progress),
            error: payload.error || "Matter pipeline failed.",
            completedAt: nowIso(),
            unread: true,
          });
          void fetchCreditBalance();
          return;
        }
        if (payload.status === "processed" && payload.result) {
          completeMatterJob(job, payload.result);
          return;
        }
        if (payload.result?.matter?.id) {
          updateMatter(payload.result);
        }
        patchJob(job.id, {
          status: "running",
          stage: payload.stage || job.stage,
          progress: clampProgress(payload.progress ?? job.progress),
        });
      } catch (error) {
        patchJob(job.id, {
          stage: "Waiting to reconnect",
          error: error instanceof Error ? error.message : "Unable to poll job.",
        });
      }
    },
    [completeMatterJob, patchJob, updateMatter],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (pollingRef.current) return;
      const activeMatterJobs = jobs.filter(
        (job) => job.source === "matter-job" && job.status === "running",
      );
      if (!activeMatterJobs.length) return;
      pollingRef.current = true;
      Promise.all(activeMatterJobs.map((job) => pollMatterJob(job))).finally(() => {
        pollingRef.current = false;
      });
    }, MATTER_POLL_MS);
    return () => window.clearInterval(interval);
  }, [jobs, pollMatterJob]);

  const pollDraftJob = useCallback(
    async (job: PipelineJob) => {
      if (!job.jobId || job.status !== "running") return;
      try {
        const response = await fetch(
          buildApiUrl(`/api/drafts/jobs/${encodeURIComponent(job.jobId)}`),
        );
        const payload = (await response.json()) as {
          success?: boolean;
          job?: {
            job_id?: string;
            status?: string;
            stage?: string;
            stage_key?: string;
            progress?: number;
            title?: string;
            matter_id?: string;
            draft_id?: string | null;
            error?: string | null;
            status_message?: string;
            thinking_text?: string;
            thinking_history?: string[];
            completed_at?: string | null;
          };
          error?: string | null;
        };
        updateCreditCacheFromPayload(payload);
        if (response.status === 404) {
          patchJob(job.id, {
            status: "failed",
            stage: "Draft job expired",
            statusMessage: "Draft job expired.",
            progress: 100,
            error: payload.error || "Draft job was not found.",
            completedAt: nowIso(),
            unread: true,
          });
          return;
        }
        if (!response.ok || !payload.success || !payload.job) {
          throw new Error(payload.error || "Draft job status failed.");
        }
        const serverJob = payload.job;
        const draftId = String(serverJob.draft_id || job.draftId || "").trim();
        const matterId = String(serverJob.matter_id || job.matterId || "").trim();
        const targetBase = job.targetPath.split("?")[0] || "/drafting";
        if (serverJob.status === "failed") {
          patchJob(job.id, {
            status: "failed",
            stage: serverJob.stage || "Draft failed",
            stageKey: serverJob.stage_key || "failed",
            statusMessage: serverJob.status_message || serverJob.error || "Draft failed.",
            progress: 100,
            error: serverJob.error || "Draft generation failed.",
            completedAt: serverJob.completed_at || nowIso(),
            unread: true,
            draftId: draftId || undefined,
            resultId: draftId || undefined,
          });
          void fetchCreditBalance();
          return;
        }
        if (serverJob.status === "processed") {
          patchJob(job.id, {
            status: "succeeded",
            stage: "Draft completed",
            stageKey: serverJob.stage_key || "saving",
            statusMessage: "Draft completed.",
            progress: 100,
            completedAt: serverJob.completed_at || nowIso(),
            unread: true,
            title: serverJob.title || job.title,
            matterId: matterId || job.matterId,
            draftId: draftId || undefined,
            resultId: draftId || undefined,
            targetPath: draftId
              ? `${targetBase}?draft=${encodeURIComponent(draftId)}${
                  matterId ? `&matter=${encodeURIComponent(matterId)}` : ""
                }&mode=edit`
              : job.targetPath,
            thinkingText: "",
          });
          void fetchCreditBalance();
          return;
        }
        patchJob(job.id, {
          status: "running",
          title: serverJob.title || job.title,
          stage: serverJob.stage || job.stage,
          stageKey: serverJob.stage_key || job.stageKey,
          statusMessage: serverJob.status_message || serverJob.stage || job.statusMessage,
          progress: clampProgress(serverJob.progress ?? job.progress),
          matterId: matterId || job.matterId,
          draftId: draftId || job.draftId,
          resultId: draftId || job.resultId,
          thinkingText: serverJob.thinking_text || job.thinkingText,
          thinkingHistory: Array.isArray(serverJob.thinking_history)
            ? serverJob.thinking_history
            : job.thinkingHistory,
        });
      } catch (error) {
        patchJob(job.id, {
          stage: "Waiting to reconnect",
          statusMessage: "Waiting to reconnect to draft job.",
          error: error instanceof Error ? error.message : "Unable to poll draft job.",
        });
      }
    },
    [patchJob],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const activeDraftJobs = jobs.filter(
        (job) => job.source === "draft-job" && job.status === "running",
      );
      if (!activeDraftJobs.length) return;
      void Promise.all(activeDraftJobs.map((job) => pollDraftJob(job)));
    }, DRAFT_POLL_MS);
    return () => window.clearInterval(interval);
  }, [jobs, pollDraftJob]);

  const startDeepResearchJob = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      const jobId = `research:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
      const timestamp = nowIso();
      upsertJob({
        id: jobId,
        type: "research",
        source: "research-deep",
        title: trimmed,
        status: "running",
        stage: "Running research intake",
        progress: 10,
        targetPath: "/research",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      try {
        const intakeResponse = await fetch(buildApiUrl("/api/agent/research-intent-intake"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            jurisdiction: "India",
            clarification_answer: null,
          }),
        });
        const intakePayload = await intakeResponse.json();
        updateCreditCacheFromPayload(intakePayload);
        if (!intakeResponse.ok || !intakePayload?.success) {
          throw new Error(
            intakePayload?.error || intakePayload?.details || "Research intake failed.",
          );
        }
        const selectedLaneId =
          intakePayload.selected_lane_id ||
          intakePayload.agent_2_output?.recommendation?.suggested_lane ||
          intakePayload.agent_2_output?.lanes?.[0]?.lane_id ||
          "";
        patchJob(jobId, {
          stage: selectedLaneId
            ? "Running deep research"
            : "Research intake completed",
          progress: selectedLaneId ? 48 : 100,
        });
        let finalPayload = null;
        if (selectedLaneId) {
          const continueResponse = await fetch(
            buildApiUrl("/api/agent/research-intent-continue"),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: trimmed,
                jurisdiction: "India",
                agent_1_output: intakePayload.agent_1_output,
                agent_1_output_for_agent_2:
                  intakePayload.agent_1_output_for_agent_2,
                agent_2_output: intakePayload.agent_2_output,
                selected_lane_id: selectedLaneId,
              }),
            },
          );
          finalPayload = await continueResponse.json();
          updateCreditCacheFromPayload(finalPayload);
          if (!continueResponse.ok || !finalPayload?.success) {
            throw new Error(
              finalPayload?.error || finalPayload?.details || "Deep research failed.",
            );
          }
        }
        const createdAt = nowIso();
        const saveResponse = await fetch(buildApiUrl("/api/researches/save"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgName: window.localStorage.getItem("orgName") || null,
            query: trimmed,
            createdAt,
            intakePayload,
            finalPayload,
            selectedLaneId: selectedLaneId || null,
            clarificationAnswer: null,
          }),
        });
        const savePayload = await saveResponse.json();
        updateCreditCacheFromPayload(savePayload);
        const resultId =
          String(
            savePayload?.neon_record?.id ||
              savePayload?.research?.id ||
              savePayload?.id ||
              "",
          ).trim() || undefined;
        patchJob(jobId, {
          status: "succeeded",
          stage: "Research completed",
          progress: 100,
          completedAt: nowIso(),
          unread: true,
          resultId,
          targetPath: resultId
            ? `/research?research=${encodeURIComponent(resultId)}`
            : "/research",
        });
        void fetchCreditBalance();
      } catch (error) {
        patchJob(jobId, {
          status: "failed",
          stage: "Research failed",
          progress: 100,
          error:
            error instanceof Error ? error.message : "Deep research failed.",
          completedAt: nowIso(),
          unread: true,
        });
        void fetchCreditBalance();
      }
    },
    [patchJob, upsertJob],
  );

  const startSingleDraftJob = useCallback(
    (input: SingleDraftJobInput) => {
      const matterId = String(input.matterId || "").trim();
      const draftType = String(input.draftType || "").trim();
      if (!matterId || !draftType) return null;

      const requestKey = buildDraftRequestKey({
        ...input,
        matterId,
        draftType,
      });
      const existing = jobs.find(
        (job) =>
          job.source === "draft-job" &&
          job.requestKey === requestKey &&
          (job.status === "queued" || job.status === "running"),
      );
      if (existing) return existing.id;

      if (runningDraftRequestsRef.current.has(requestKey)) {
        return (
          jobs.find((job) => job.source === "draft-job" && job.requestKey === requestKey)
            ?.id || null
        );
      }

      const timestamp = nowIso();
      const pipelineId = `draft:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
      const title = String(input.draftTitle || input.draftType || "Draft generation").trim();
      const targetBasePath = input.targetBasePath || "/drafting";
      const initialTarget = `${targetBasePath}?matter=${encodeURIComponent(matterId)}&startDraft=${encodeURIComponent(draftType)}${
        input.draftTitle ? `&draftLabel=${encodeURIComponent(input.draftTitle)}` : ""
      }${
        input.draftKey ? `&draftKey=${encodeURIComponent(input.draftKey)}` : ""
      }&requestedFrom=${encodeURIComponent(input.requestedFrom || "overview")}&draftJob=${encodeURIComponent(pipelineId)}`;

      upsertJob({
        id: pipelineId,
        type: "draft",
        source: "draft-job",
        requestKey,
        matterId,
        title,
        status: "running",
        stage: "Opening the drafting workspace",
        stageKey: "loading_context",
        statusMessage: "Opening the drafting workspace.",
        progress: 5,
        targetPath: initialTarget,
        createdAt: timestamp,
        updatedAt: timestamp,
        thinkingHistory: [],
        thinkingText: "",
      });

      runningDraftRequestsRef.current.add(requestKey);

      void (async () => {
        try {
          const response = await fetch(
            buildApiUrl(`/api/matters/${encodeURIComponent(matterId)}/single-draft/jobs`),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                draftType,
                draftKey: input.draftKey || "",
                draftTitle: input.draftTitle || "",
                source: input.source || "atlas_next_steps",
                requestedFrom: input.requestedFrom || "overview",
              }),
            },
          );
          const raw = await response.text();
          const payload = JSON.parse(raw || "{}") as {
            success?: boolean;
            job_id?: string;
            job?: {
              status?: string;
              stage?: string;
              stage_key?: string;
              progress?: number;
              title?: string;
              matter_id?: string;
              draft_id?: string | null;
              status_message?: string;
              thinking_text?: string;
              thinking_history?: string[];
            };
            error?: string;
          };
          updateCreditCacheFromPayload(payload);
          if (!response.ok || !payload.success || !payload.job_id) {
            let message = payload.error || "Failed to start draft generation.";
            if (raw.trim() && !payload.error) message = raw.trim();
            throw new Error(message);
          }
          const serverJob = payload.job || {};
          patchJob(pipelineId, {
            jobId: payload.job_id,
            title: serverJob.title || title,
            stage: serverJob.stage || "Draft generation is queued.",
            stageKey: serverJob.stage_key || "queued",
            statusMessage: serverJob.status_message || serverJob.stage || "Draft generation is queued.",
            progress: clampProgress(serverJob.progress ?? 4),
            matterId: serverJob.matter_id || matterId,
            draftId: serverJob.draft_id || undefined,
            resultId: serverJob.draft_id || undefined,
            thinkingText: serverJob.thinking_text || "",
            thinkingHistory: Array.isArray(serverJob.thinking_history)
              ? serverJob.thinking_history
              : [],
          });
        } catch (error) {
          patchJob(pipelineId, {
            status: "failed",
            stage: "Draft failed to start",
            stageKey: "failed",
            statusMessage:
              error instanceof Error ? error.message : "Single draft generation failed.",
            progress: 100,
            error:
              error instanceof Error ? error.message : "Single draft generation failed.",
            completedAt: nowIso(),
            unread: true,
          });
          void fetchCreditBalance();
        } finally {
          runningDraftRequestsRef.current.delete(requestKey);
        }
      })();

      return pipelineId;
    },
    [jobs, patchJob, upsertJob],
  );

  const markRead = useCallback((jobId: string) => {
    patchJob(jobId, { unread: false });
  }, [patchJob]);

  const markAllRead = useCallback(() => {
    setJobs((current) => current.map((job) => ({ ...job, unread: false })));
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setJobs((current) => current.filter((job) => job.id !== jobId));
  }, []);

  const navigateToJob = useCallback(
    (job: PipelineJob) => {
      markRead(job.id);
      navigate(job.targetPath || "/dashboard");
    },
    [markRead, navigate],
  );

  const value = useMemo<PipelineContextValue>(() => {
    const activeJobs = jobs.filter((job) => isActiveStatus(job.status));
    return {
      jobs,
      activeJobs,
      unreadCount: jobs.filter((job) => job.unread).length,
      trackMatterJob,
      startDeepResearchJob,
      startSingleDraftJob,
      markRead,
      markAllRead,
      dismissJob,
      navigateToJob,
    };
  }, [
    dismissJob,
    jobs,
    markAllRead,
    markRead,
    navigateToJob,
    startDeepResearchJob,
    startSingleDraftJob,
    trackMatterJob,
  ]);

  return (
    <PipelineContext.Provider value={value}>
      {children}
      <PipelineToasts />
    </PipelineContext.Provider>
  );
};

export const usePipelines = () => {
  const context = useContext(PipelineContext);
  if (!context) {
    throw new Error("usePipelines must be used within PipelineProvider");
  }
  return context;
};

const PipelineToasts = () => {
  const { jobs, navigateToJob, dismissJob } = usePipelines();
  const visible = jobs
    .filter((job) => job.unread && (job.status === "succeeded" || job.status === "failed"))
    .slice(0, 3);

  if (!visible.length) return null;

  return (
    <div className="pipelineToastStack" aria-live="polite">
      {visible.map((job) => (
        <article className={`pipelineToast is-${job.status}`} key={job.id}>
          <button type="button" onClick={() => navigateToJob(job)}>
            <strong>
              {job.status === "succeeded" ? "Pipeline complete" : "Pipeline failed"}
            </strong>
            <span>{job.title}</span>
            <small>{job.stage}</small>
          </button>
          <button
            type="button"
            className="pipelineToastDismiss"
            aria-label="Dismiss notification"
            onClick={() => dismissJob(job.id)}
          >
            ×
          </button>
        </article>
      ))}
    </div>
  );
};
