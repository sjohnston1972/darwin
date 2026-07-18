import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  GenomeExecutionDetailResponseSchema,
  GenomeHistoryResponseSchema,
  ObservationArchiveDetailResponseSchema,
  ObservationArchivesResponseSchema,
  RepositoryMutationExecutionSchema,
  StudyEventsResponseSchema,
  StudyTelemetrySummarySchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
  type ObservationArchive,
  type ObservationArchiveSummary,
  type RepositoryMutationExecution,
  type RepositoryExecutionSummary,
  type StoredTelemetryEvent,
} from '@darwin/shared';
import { apiFetch } from '../api';
import { useEffect, useRef, useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';
const studyId = 'projectflow-baseline-study';
const eventWindowLimit = 200;

interface HydratedWorkflow {
  evidence: EvidencePack | null;
  analysis: EvidenceAnalysis | null;
  manifest: CodexImplementationManifest | null;
  execution: RepositoryMutationExecution | null;
}

const emptyWorkflow = (): HydratedWorkflow => ({
  evidence: null,
  analysis: null,
  manifest: null,
  execution: null,
});

const failureDetail = (error: unknown) =>
  error instanceof Error ? error.message : 'request failed';

const artifactDeepLink = (kind: 'fossil' | 'observation') => {
  if (typeof window === 'undefined') return null;
  const prefix = `#${kind}-`;
  if (!window.location.hash.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(window.location.hash.slice(prefix.length));
  } catch {
    return null;
  }
};

export interface LiveTelemetryState {
  behaviorSignalCount: number;
  canInspectEvidence: boolean;
  count: number;
  clearError: () => void;
  analysis: EvidenceAnalysis | null;
  analyseEvidence: () => Promise<void>;
  analysing: boolean;
  evidence: EvidencePack | null;
  error: string | null;
  events: StoredTelemetryEvent[];
  genomeEvolutionCount: number;
  genomeExecutions: RepositoryExecutionSummary[];
  genomeNextCursor: string | null;
  loadGenomeExecution: (
    executionId: string,
  ) => Promise<RepositoryMutationExecution>;
  loadMoreGenome: () => Promise<void>;
  generateEvidence: () => Promise<void>;
  generating: boolean;
  manifest: CodexImplementationManifest | null;
  observationArchives: ObservationArchiveSummary[];
  observationArchivesNextCursor: string | null;
  loadObservationArchive: (archiveId: string) => Promise<ObservationArchive>;
  loadMoreObservationArchives: () => Promise<void>;
  execution: RepositoryMutationExecution | null;
  implementing: boolean;
  preparingManifest: boolean;
  releasingExecution: boolean;
  releasingRollback: boolean;
  rollingBack: boolean;
  participantCount: number;
  sessionCount: number;
  resetState: () => void;
  resetEvolution: () => Promise<boolean>;
  sessionCounts: Record<string, number>;
  startControlledEvolution: (
    mutationIds: string[],
  ) => Promise<RepositoryMutationExecution | null>;
  status: 'loading' | 'live' | 'offline';
  releaseExecution: (executionId?: string) => Promise<void>;
  releaseRollback: (executionId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshing: boolean;
  startRollback: (executionId?: string) => Promise<void>;
}

export function useLiveTelemetry(
  canInspectEvidence: boolean,
): LiveTelemetryState {
  const [events, setEvents] = useState<StoredTelemetryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>(
    {},
  );
  const [sessionCount, setSessionCount] = useState(0);
  const [participantCount, setParticipantCount] = useState(0);
  const [behaviorSignalCount, setBehaviorSignalCount] = useState(0);
  const [analysing, setAnalysing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [workflow, setWorkflow] = useState<HydratedWorkflow>(emptyWorkflow);
  const { analysis, evidence, execution, manifest } = workflow;
  const [preparingManifest, setPreparingManifest] = useState(false);
  const [genomeEvolutionCount, setGenomeEvolutionCount] = useState(0);
  const [genomeExecutions, setGenomeExecutions] = useState<
    RepositoryExecutionSummary[]
  >([]);
  const [observationArchives, setObservationArchives] = useState<
    ObservationArchiveSummary[]
  >([]);
  const [genomeNextCursor, setGenomeNextCursor] = useState<string | null>(null);
  const [observationArchivesNextCursor, setObservationArchivesNextCursor] =
    useState<string | null>(null);
  const genomeDetailCache = useRef(
    new Map<string, RepositoryMutationExecution>(),
  );
  const genomeDetailSummaryCache = useRef(
    new Map<string, RepositoryExecutionSummary>(),
  );
  const observationArchiveDetailCache = useRef(
    new Map<string, ObservationArchive>(),
  );
  const observationArchiveDetailSummaryCache = useRef(
    new Map<string, ObservationArchiveSummary>(),
  );
  const pendingGenomeDetails = useRef(
    new Map<string, Promise<RepositoryMutationExecution>>(),
  );
  const pendingObservationArchiveDetails = useRef(
    new Map<string, Promise<ObservationArchive>>(),
  );
  const [implementing, setImplementing] = useState(false);
  const [releasingExecution, setReleasingExecution] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [releasingRollback, setReleasingRollback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<LiveTelemetryState['status']>('loading');
  const resetGeneration = useRef(0);
  const hydrationGeneration = useRef(0);

  const loadGenome = async () => {
    const response = await apiFetch(`${apiBaseUrl}/api/genome?limit=10`);
    if (!response.ok) throw new Error(`request returned ${response.status}`);
    return GenomeHistoryResponseSchema.parse(await response.json());
  };

  const refreshGenome = async () => {
    const history = await loadGenome();
    setGenomeEvolutionCount(history.evolutionCycle.genomeEvolutionCount);
    setGenomeExecutions(history.executions);
    setGenomeNextCursor(history.page.nextCursor);
    const deepLinkedId = artifactDeepLink('fossil');
    if (
      deepLinkedId &&
      !history.executions.some(
        (execution) => execution.executionId === deepLinkedId,
      )
    ) {
      await loadGenomeExecution(deepLinkedId);
    }
  };

  const loadObservationArchives = async () => {
    const response = await apiFetch(
      `${apiBaseUrl}/api/observations/archives?limit=10`,
    );
    if (!response.ok) throw new Error(`request returned ${response.status}`);
    return ObservationArchivesResponseSchema.parse(await response.json());
  };

  const refreshObservationArchives = async () => {
    const result = await loadObservationArchives();
    setObservationArchives(result.archives);
    setObservationArchivesNextCursor(result.page.nextCursor);
    const deepLinkedId = artifactDeepLink('observation');
    if (
      deepLinkedId &&
      !result.archives.some((archive) => archive.archiveId === deepLinkedId)
    ) {
      await loadObservationArchive(deepLinkedId);
    }
  };

  const loadMoreGenome = async () => {
    if (!genomeNextCursor) return;
    const response = await apiFetch(
      `${apiBaseUrl}/api/genome?limit=10&cursor=${encodeURIComponent(genomeNextCursor)}`,
    );
    if (!response.ok) throw new Error('Genome page request failed.');
    const history = GenomeHistoryResponseSchema.parse(await response.json());
    setGenomeExecutions((current) => {
      const known = new Set(current.map((item) => item.executionId));
      return [
        ...current,
        ...history.executions.filter((item) => !known.has(item.executionId)),
      ];
    });
    setGenomeNextCursor(history.page.nextCursor);
  };

  const loadMoreObservationArchives = async () => {
    if (!observationArchivesNextCursor) return;
    const response = await apiFetch(
      `${apiBaseUrl}/api/observations/archives?limit=10&cursor=${encodeURIComponent(observationArchivesNextCursor)}`,
    );
    if (!response.ok)
      throw new Error('Observation archive page request failed.');
    const result = ObservationArchivesResponseSchema.parse(
      await response.json(),
    );
    setObservationArchives((current) => {
      const known = new Set(current.map((item) => item.archiveId));
      return [
        ...current,
        ...result.archives.filter((item) => !known.has(item.archiveId)),
      ];
    });
    setObservationArchivesNextCursor(result.page.nextCursor);
  };

  const loadGenomeExecution = async (executionId: string) => {
    const cached = genomeDetailCache.current.get(executionId);
    const cachedSummary = genomeDetailSummaryCache.current.get(executionId);
    if (cached && cachedSummary) {
      setGenomeExecutions((current) =>
        current.some((item) => item.executionId === executionId)
          ? current
          : [cachedSummary, ...current],
      );
      return cached;
    }
    const pending = pendingGenomeDetails.current.get(executionId);
    if (pending) return pending;
    const request = (async () => {
      const response = await apiFetch(
        `${apiBaseUrl}/api/genome/${encodeURIComponent(executionId)}`,
      );
      if (!response.ok) throw new Error('Genome artifact request failed.');
      const result = GenomeExecutionDetailResponseSchema.parse(
        await response.json(),
      );
      genomeDetailCache.current.set(executionId, result.execution);
      genomeDetailSummaryCache.current.set(executionId, result.summary);
      setGenomeExecutions((current) =>
        current.some((item) => item.executionId === executionId)
          ? current
          : [result.summary, ...current],
      );
      return result.execution;
    })().finally(() => pendingGenomeDetails.current.delete(executionId));
    pendingGenomeDetails.current.set(executionId, request);
    return request;
  };

  const loadObservationArchive = async (archiveId: string) => {
    const cached = observationArchiveDetailCache.current.get(archiveId);
    const cachedSummary =
      observationArchiveDetailSummaryCache.current.get(archiveId);
    if (cached && cachedSummary) {
      setObservationArchives((current) =>
        current.some((item) => item.archiveId === archiveId)
          ? current
          : [cachedSummary, ...current],
      );
      return cached;
    }
    const pending = pendingObservationArchiveDetails.current.get(archiveId);
    if (pending) return pending;
    const request = (async () => {
      const response = await apiFetch(
        `${apiBaseUrl}/api/observations/archives/${encodeURIComponent(archiveId)}`,
      );
      if (!response.ok) throw new Error('Observation archive request failed.');
      const result = ObservationArchiveDetailResponseSchema.parse(
        await response.json(),
      );
      observationArchiveDetailCache.current.set(archiveId, result.archive);
      observationArchiveDetailSummaryCache.current.set(
        archiveId,
        result.summary,
      );
      setObservationArchives((current) =>
        current.some((item) => item.archiveId === archiveId)
          ? current
          : [result.summary, ...current],
      );
      return result.archive;
    })().finally(() =>
      pendingObservationArchiveDetails.current.delete(archiveId),
    );
    pendingObservationArchiveDetails.current.set(archiveId, request);
    return request;
  };

  const loadEventWindow = async () => {
    const summaryResponse = await apiFetch(
      `${apiBaseUrl}/api/studies/${studyId}/events`,
    );
    if (!summaryResponse.ok) {
      throw new Error(`request returned ${summaryResponse.status}`);
    }
    const summary = StudyTelemetrySummarySchema.parse(
      await summaryResponse.json(),
    );
    if (!canInspectEvidence) {
      return {
        ...summary,
        events: [] as StoredTelemetryEvent[],
        sessionCounts: {} as Record<string, number>,
      };
    }
    const traceResponse = await apiFetch(
      `${apiBaseUrl}/api/studies/${studyId}/events/raw?limit=${eventWindowLimit}`,
    );
    if (!traceResponse.ok) {
      throw new Error(`request returned ${traceResponse.status}`);
    }
    const trace = StudyEventsResponseSchema.parse(await traceResponse.json());
    return {
      ...summary,
      events: trace.events,
      sessionCounts: trace.sessionCounts,
    };
  };

  const loadWorkflow = async (): Promise<{
    workflow: HydratedWorkflow;
    failures: string[];
  }> => {
    const workflow = emptyWorkflow();
    const failures: string[] = [];
    let evidenceResponse: Response;
    try {
      evidenceResponse = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence/latest?optional=true`,
      );
      if (evidenceResponse.status === 204) return { workflow, failures };
      if (!evidenceResponse.ok) {
        throw new Error(`request returned ${evidenceResponse.status}`);
      }
      workflow.evidence = EvidencePackSchema.parse(
        await evidenceResponse.json(),
      );
    } catch (error) {
      failures.push(`Evidence: ${failureDetail(error)}`);
      return { workflow, failures };
    }

    let analysisResponse: Response;
    try {
      analysisResponse = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence-analysis/latest?optional=true`,
      );
      if (analysisResponse.status === 204) return { workflow, failures };
      if (!analysisResponse.ok) {
        throw new Error(`request returned ${analysisResponse.status}`);
      }
      const latestAnalysis = EvidenceAnalysisSchema.parse(
        await analysisResponse.json(),
      );
      if (
        latestAnalysis.evidenceId !== workflow.evidence.evidenceId ||
        latestAnalysis.evidenceHash !== workflow.evidence.evidenceHash
      ) {
        failures.push('Analysis: latest result does not match latest evidence');
        return { workflow, failures };
      }
      workflow.analysis = latestAnalysis;
    } catch (error) {
      failures.push(`Analysis: ${failureDetail(error)}`);
      return { workflow, failures };
    }

    try {
      const manifestResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${workflow.analysis.analysisId}/codex-manifest`,
      );
      if (manifestResponse.status === 404) return { workflow, failures };
      if (!manifestResponse.ok) {
        throw new Error(`request returned ${manifestResponse.status}`);
      }
      const latestManifest = CodexImplementationManifestSchema.parse(
        await manifestResponse.json(),
      );
      if (
        latestManifest.analysisId !== workflow.analysis.analysisId ||
        latestManifest.evidenceHash !== workflow.evidence.evidenceHash
      ) {
        failures.push('Manifest: result does not match the active analysis');
        return { workflow, failures };
      }
      workflow.manifest = latestManifest;
    } catch (error) {
      failures.push(`Manifest: ${failureDetail(error)}`);
      return { workflow, failures };
    }

    try {
      const executionResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${workflow.analysis.analysisId}/codex-manifest/execution`,
      );
      if (executionResponse.status === 204) return { workflow, failures };
      if (!executionResponse.ok) {
        throw new Error(`request returned ${executionResponse.status}`);
      }
      const latestExecution = RepositoryMutationExecutionSchema.parse(
        await executionResponse.json(),
      );
      if (
        latestExecution.analysisId !== workflow.analysis.analysisId ||
        latestExecution.manifestId !== workflow.manifest.manifestId
      ) {
        failures.push('Execution: result does not match the active manifest');
        return { workflow, failures };
      }
      workflow.execution = latestExecution;
    } catch (error) {
      failures.push(`Execution: ${failureDetail(error)}`);
    }
    return { workflow, failures };
  };

  const resetCurrentCycleMeasurements = () => {
    setEvents([]);
    setCount(0);
    setSessionCounts({});
    setSessionCount(0);
    setParticipantCount(0);
    setBehaviorSignalCount(0);
    setWorkflow(emptyWorkflow());
  };

  const hydrate = async (manual = false) => {
    const hydration = ++hydrationGeneration.current;
    const reset = resetGeneration.current;
    if (manual) setRefreshing(true);
    setError(null);
    const workflowRequest = canInspectEvidence
      ? loadWorkflow()
      : Promise.resolve({ workflow: emptyWorkflow(), failures: [] });
    const genomeRequest = canInspectEvidence
      ? loadGenome()
      : Promise.resolve(null);
    const archiveRequest = canInspectEvidence
      ? loadObservationArchives()
      : Promise.resolve(null);
    const [eventResult, workflowResult, genomeResult, archiveResult] =
      await Promise.allSettled([
        loadEventWindow(),
        workflowRequest,
        genomeRequest,
        archiveRequest,
      ] as const);
    if (
      hydration !== hydrationGeneration.current ||
      reset !== resetGeneration.current
    ) {
      return;
    }

    const failures: string[] = [];
    if (eventResult.status === 'fulfilled') {
      setEvents(eventResult.value.events);
      setCount(eventResult.value.count);
      setSessionCounts(eventResult.value.sessionCounts);
      setSessionCount(eventResult.value.sessionCount);
      setParticipantCount(eventResult.value.participantCount);
      setBehaviorSignalCount(eventResult.value.behaviorSignalCount);
      setStatus('live');
    } else {
      failures.push(`Events: ${failureDetail(eventResult.reason)}`);
      setStatus('offline');
    }

    if (workflowResult.status === 'fulfilled') {
      const next = workflowResult.value.workflow;
      setWorkflow(next);
      failures.push(...workflowResult.value.failures);
    } else {
      setWorkflow(emptyWorkflow());
      failures.push(`Evidence: ${failureDetail(workflowResult.reason)}`);
    }

    if (genomeResult.status === 'fulfilled' && genomeResult.value) {
      setGenomeEvolutionCount(
        genomeResult.value.evolutionCycle.genomeEvolutionCount,
      );
      setGenomeExecutions(genomeResult.value.executions);
    } else if (genomeResult.status === 'rejected') {
      failures.push(`Genome: ${failureDetail(genomeResult.reason)}`);
    }

    if (archiveResult.status === 'fulfilled' && archiveResult.value) {
      setObservationArchives(archiveResult.value.archives);
    } else if (archiveResult.status === 'rejected') {
      failures.push(`Archives: ${failureDetail(archiveResult.reason)}`);
    }

    setError(
      failures.length
        ? `Live refresh incomplete · ${failures.join(' · ')}`
        : null,
    );
    if (manual) setRefreshing(false);
  };

  const refresh = () => hydrate(true);

  useEffect(() => {
    void hydrate();
    const pollEvents = async () => {
      const generation = resetGeneration.current;
      try {
        const result = await loadEventWindow();
        if (generation === resetGeneration.current) {
          setEvents(result.events);
          setCount(result.count);
          setSessionCounts(result.sessionCounts);
          setSessionCount(result.sessionCount);
          setParticipantCount(result.participantCount);
          setBehaviorSignalCount(result.behaviorSignalCount);
          setStatus('live');
        }
      } catch (error) {
        if (generation === resetGeneration.current) {
          setStatus('offline');
          setError(`Events: ${failureDetail(error)}`);
        }
      }
    };
    const interval = window.setInterval(() => void pollEvents(), 2_000);
    return () => {
      hydrationGeneration.current += 1;
      window.clearInterval(interval);
    };
  }, [canInspectEvidence]);

  useEffect(() => {
    const rollbackComplete =
      !execution?.rollback ||
      ['failed', 'released'].includes(execution.rollback.status);
    if (
      !execution ||
      (['failed', 'released'].includes(execution.status) && rollbackComplete)
    ) {
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const response = await apiFetch(
          `${apiBaseUrl}/api/repository-executions/${execution.executionId}`,
        );
        if (!response.ok) return;
        const latest = RepositoryMutationExecutionSchema.parse(
          await response.json(),
        );
        if (active) {
          setWorkflow((current) => ({ ...current, execution: latest }));
        }
      } catch {
        // The telemetry poll will surface broad API availability separately.
      }
    };
    const interval = window.setInterval(() => void poll(), 3_000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [execution?.executionId, execution?.status, execution?.rollback?.status]);

  const generateEvidence = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Evidence generation failed.');
      }
      setWorkflow({
        evidence: EvidencePackSchema.parse(payload),
        analysis: null,
        manifest: null,
        execution: null,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Evidence generation failed. Check the API and retry.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const analyseEvidence = async () => {
    setAnalysing(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/analyse-evidence`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Live evidence analysis failed.');
      }
      setWorkflow((current) => ({
        ...current,
        analysis: EvidenceAnalysisSchema.parse(payload),
        manifest: null,
        execution: null,
      }));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Live reasoning failed. No recommendation was generated.',
      );
    } finally {
      setAnalysing(false);
    }
  };

  const startControlledEvolution = async (mutationIds: string[]) => {
    if (!analysis) return null;
    setPreparingManifest(true);
    setError(null);
    try {
      const manifestResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${analysis.analysisId}/codex-manifest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutationIds }),
        },
      );
      const manifestPayload = (await manifestResponse.json()) as {
        message?: string;
      };
      if (!manifestResponse.ok) {
        throw new Error(
          manifestPayload.message ?? 'Codex manifest generation failed.',
        );
      }
      setWorkflow((current) => ({
        ...current,
        manifest: CodexImplementationManifestSchema.parse(manifestPayload),
      }));
      setPreparingManifest(false);
      setImplementing(true);

      const executionResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${analysis.analysisId}/codex-manifest/execution`,
        { method: 'POST' },
      );
      const executionPayload = (await executionResponse.json()) as {
        message?: string;
      };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(executionPayload);
      if (parsedExecution.success) {
        setWorkflow((current) => ({
          ...current,
          execution: parsedExecution.data,
        }));
      }
      if (!executionResponse.ok) {
        throw new Error(
          parsedExecution.success
            ? (parsedExecution.data.error ?? 'Repository execution failed.')
            : (executionPayload.message ?? 'Controlled implementation failed.'),
        );
      }
      if (!parsedExecution.success) {
        throw new Error('Repository execution returned an invalid payload.');
      }
      return parsedExecution.data;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Controlled evolution failed. Retry the handoff.',
      );
      return null;
    } finally {
      setPreparingManifest(false);
      setImplementing(false);
    }
  };

  const releaseExecution = async (executionId?: string) => {
    const targetExecutionId = executionId ?? execution?.executionId;
    if (!targetExecutionId) return;
    setReleasingExecution(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/repository-executions/${targetExecutionId}/release`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(payload);
      if (parsedExecution.success) {
        setWorkflow((current) => ({
          ...current,
          execution: parsedExecution.data,
        }));
        genomeDetailCache.current.set(
          parsedExecution.data.executionId,
          parsedExecution.data,
        );
        if (parsedExecution.data.status === 'released') {
          resetCurrentCycleMeasurements();
          await refreshGenome();
          await refreshObservationArchives();
        }
      }
      if (!response.ok) {
        throw new Error(
          parsedExecution.success
            ? (parsedExecution.data.error ?? 'Mutation release failed.')
            : (payload.message ?? 'Mutation release failed.'),
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Mutation release failed.',
      );
    } finally {
      setReleasingExecution(false);
    }
  };

  const startRollback = async (executionId?: string) => {
    const targetExecutionId = executionId ?? execution?.executionId;
    if (!targetExecutionId) return;
    setRollingBack(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/repository-executions/${targetExecutionId}/rollback`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(payload);
      if (parsedExecution.success) {
        setWorkflow((current) => ({
          ...current,
          execution: parsedExecution.data,
        }));
        genomeDetailCache.current.set(
          parsedExecution.data.executionId,
          parsedExecution.data,
        );
        await refreshGenome();
      }
      if (!response.ok) {
        throw new Error(
          parsedExecution.success
            ? (parsedExecution.data.rollback?.error ??
                'Rollback preparation failed.')
            : (payload.message ?? 'Rollback preparation failed.'),
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Rollback preparation failed.',
      );
    } finally {
      setRollingBack(false);
    }
  };

  const releaseRollback = async (executionId?: string) => {
    const targetExecutionId = executionId ?? execution?.executionId;
    if (!targetExecutionId) return;
    setReleasingRollback(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/repository-executions/${targetExecutionId}/rollback/release`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(payload);
      if (parsedExecution.success) {
        setWorkflow((current) => ({
          ...current,
          execution: parsedExecution.data,
        }));
        genomeDetailCache.current.set(
          parsedExecution.data.executionId,
          parsedExecution.data,
        );
        await refreshGenome();
      }
      if (!response.ok) {
        throw new Error(
          parsedExecution.success
            ? (parsedExecution.data.rollback?.error ??
                'Rollback release failed.')
            : (payload.message ?? 'Rollback release failed.'),
        );
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Rollback release failed.',
      );
    } finally {
      setReleasingRollback(false);
    }
  };

  const resetState = () => {
    resetGeneration.current += 1;
    setEvents([]);
    setCount(0);
    setSessionCounts({});
    setSessionCount(0);
    setParticipantCount(0);
    setBehaviorSignalCount(0);
    setWorkflow(emptyWorkflow());
    setGenomeEvolutionCount(0);
    setGenomeExecutions([]);
    setObservationArchives([]);
    setGenomeNextCursor(null);
    setObservationArchivesNextCursor(null);
    genomeDetailCache.current.clear();
    genomeDetailSummaryCache.current.clear();
    observationArchiveDetailCache.current.clear();
    observationArchiveDetailSummaryCache.current.clear();
    pendingGenomeDetails.current.clear();
    pendingObservationArchiveDetails.current.clear();
    setError(null);
    setGenerating(false);
    setAnalysing(false);
    setPreparingManifest(false);
    setImplementing(false);
    setReleasingExecution(false);
    setRollingBack(false);
    setReleasingRollback(false);
    setStatus('live');
  };

  const resetEvolution = async () => {
    setError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/demo/reset`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Evolution reset failed.');
      }
      resetState();
      return true;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Evolution reset failed.',
      );
      return false;
    }
  };

  return {
    analysis,
    analyseEvidence,
    analysing,
    behaviorSignalCount,
    canInspectEvidence,
    clearError: () => setError(null),
    count,
    evidence,
    error,
    events,
    execution,
    generateEvidence,
    generating,
    genomeEvolutionCount,
    genomeExecutions,
    genomeNextCursor,
    implementing,
    manifest,
    loadGenomeExecution,
    loadMoreGenome,
    loadMoreObservationArchives,
    loadObservationArchive,
    observationArchives,
    observationArchivesNextCursor,
    participantCount,
    preparingManifest,
    releaseExecution,
    releasingExecution,
    releaseRollback,
    releasingRollback,
    refresh,
    refreshing,
    resetEvolution,
    resetState,
    sessionCount,
    sessionCounts,
    startControlledEvolution,
    startRollback,
    status,
    rollingBack,
  };
}
