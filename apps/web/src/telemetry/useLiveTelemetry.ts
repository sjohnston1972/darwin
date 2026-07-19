import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  GenomeHistoryResponseSchema,
  ObservationArchivesResponseSchema,
  RepositoryMutationExecutionSchema,
  StudyEventsResponseSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
  type ObservationArchiveSummary,
  type RepositoryMutationExecution,
  type RepositoryExecutionSummary,
  type StoredTelemetryEvent,
} from '@darwin/shared';
import { apiFetch } from '../api';
import { useCallback, useEffect, useRef, useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';
const studyId = 'projectflow-baseline-study';
const eventWindowLimit = 200;

export interface LiveTelemetryState {
  behaviorSignalCount: number;
  count: number;
  clearError: () => void;
  analysis: EvidenceAnalysis | null;
  analyseEvidence: () => Promise<void>;
  analysing: boolean;
  evidence: EvidencePack | null;
  error: string | null;
  subsystemErrors: Record<string, string>;
  events: StoredTelemetryEvent[];
  genomeEvolutionCount: number;
  genomeExecutions: RepositoryExecutionSummary[];
  hasMoreGenome: boolean;
  hasMoreObservationArchives: boolean;
  loadMoreGenome: () => Promise<void>;
  loadMoreObservationArchives: () => Promise<void>;
  generateEvidence: () => Promise<void>;
  generating: boolean;
  manifest: CodexImplementationManifest | null;
  observationArchives: ObservationArchiveSummary[];
  execution: RepositoryMutationExecution | null;
  implementing: boolean;
  preparingManifest: boolean;
  releasingExecution: boolean;
  releasingRollback: boolean;
  rollingBack: boolean;
  participantCount: number;
  resetState: () => void;
  resetEvolution: (confirmation: string) => Promise<boolean>;
  sessionCounts: Record<string, number>;
  startControlledEvolution: (mutationIds: string[]) => Promise<void>;
  status: 'loading' | 'live' | 'offline';
  lastUpdatedAt: string | null;
  stale: boolean;
  releaseExecution: (executionId?: string) => Promise<void>;
  releaseRollback: (executionId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshing: boolean;
  startRollback: (executionId?: string) => Promise<void>;
}

export function useLiveTelemetry(
  liveWorkspaceVisible = true,
): LiveTelemetryState {
  const [events, setEvents] = useState<StoredTelemetryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>(
    {},
  );
  const [participantCount, setParticipantCount] = useState(0);
  const [behaviorSignalCount, setBehaviorSignalCount] = useState(0);
  const [analysis, setAnalysis] = useState<EvidenceAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [evidence, setEvidence] = useState<EvidencePack | null>(null);
  const [generating, setGenerating] = useState(false);
  const [manifest, setManifest] = useState<CodexImplementationManifest | null>(
    null,
  );
  const [preparingManifest, setPreparingManifest] = useState(false);
  const [execution, setExecution] =
    useState<RepositoryMutationExecution | null>(null);
  const [genomeEvolutionCount, setGenomeEvolutionCount] = useState(0);
  const [genomeExecutions, setGenomeExecutions] = useState<
    RepositoryExecutionSummary[]
  >([]);
  const [observationArchives, setObservationArchives] = useState<
    ObservationArchiveSummary[]
  >([]);
  const [genomeNextCursor, setGenomeNextCursor] = useState<string | null>(null);
  const [archiveNextCursor, setArchiveNextCursor] = useState<string | null>(
    null,
  );
  const [implementing, setImplementing] = useState(false);
  const [releasingExecution, setReleasingExecution] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [releasingRollback, setReleasingRollback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<LiveTelemetryState['status']>('loading');
  const [subsystemErrors, setSubsystemErrors] = useState<
    Record<string, string>
  >({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const resetGeneration = useRef(0);
  const eventCursor = useRef<string | null>(null);

  const refreshGenome = async () => {
    const response = await apiFetch(`${apiBaseUrl}/api/genome`);
    if (!response.ok) throw new Error('Genome refresh failed.');
    const history = GenomeHistoryResponseSchema.parse(await response.json());
    setGenomeEvolutionCount(history.evolutionCycle.genomeEvolutionCount);
    setGenomeExecutions(history.executions);
    setGenomeNextCursor(history.nextCursor);
  };

  const refreshObservationArchives = async () => {
    const response = await apiFetch(`${apiBaseUrl}/api/observations/archives`);
    if (!response.ok) throw new Error('Observation archive refresh failed.');
    const result = ObservationArchivesResponseSchema.parse(
      await response.json(),
    );
    setObservationArchives(result.archives);
    setArchiveNextCursor(result.nextCursor);
  };

  const resetCurrentCycleMeasurements = () => {
    setEvents([]);
    setCount(0);
    setSessionCounts({});
    setParticipantCount(0);
    setBehaviorSignalCount(0);
    setEvidence(null);
    setAnalysis(null);
    setManifest(null);
  };

  const hydrate = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const generation = resetGeneration.current;
    const loadEvents = async () => {
      const response = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/events?limit=${eventWindowLimit}`,
      );
      if (!response.ok) throw new Error('Live telemetry request failed.');
      return StudyEventsResponseSchema.parse(await response.json());
    };
    const loadDerivedState = async () => {
      const evidenceResponse = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence/latest?optional=true`,
      );
      if (evidenceResponse.status === 204) {
        return {
          evidence: null,
          analysis: null,
          manifest: null,
          execution: null,
        };
      }
      if (!evidenceResponse.ok) throw new Error('Evidence refresh failed.');
      const latestEvidence = EvidencePackSchema.parse(
        await evidenceResponse.json(),
      );

      const analysisResponse = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence-analysis/latest?optional=true`,
      );
      if (analysisResponse.status === 204) {
        return {
          evidence: latestEvidence,
          analysis: null,
          manifest: null,
          execution: null,
        };
      }
      if (!analysisResponse.ok) throw new Error('Analysis refresh failed.');
      const latestAnalysis = EvidenceAnalysisSchema.parse(
        await analysisResponse.json(),
      );
      if (
        latestAnalysis.evidenceId !== latestEvidence.evidenceId ||
        latestAnalysis.evidenceHash !== latestEvidence.evidenceHash
      ) {
        return {
          evidence: latestEvidence,
          analysis: null,
          manifest: null,
          execution: null,
        };
      }

      const manifestResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${latestAnalysis.analysisId}/codex-manifest`,
      );
      if (manifestResponse.status === 404) {
        return {
          evidence: latestEvidence,
          analysis: latestAnalysis,
          manifest: null,
          execution: null,
        };
      }
      if (!manifestResponse.ok) throw new Error('Manifest refresh failed.');
      const latestManifest = CodexImplementationManifestSchema.parse(
        await manifestResponse.json(),
      );

      const executionResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${latestAnalysis.analysisId}/codex-manifest/execution`,
      );
      if (executionResponse.status === 204) {
        return {
          evidence: latestEvidence,
          analysis: latestAnalysis,
          manifest: latestManifest,
          execution: null,
        };
      }
      if (!executionResponse.ok) throw new Error('Execution refresh failed.');
      return {
        evidence: latestEvidence,
        analysis: latestAnalysis,
        manifest: latestManifest,
        execution: RepositoryMutationExecutionSchema.parse(
          await executionResponse.json(),
        ),
      };
    };

    const [eventResult, derivedResult, genomeResult, archivesResult] =
      await Promise.allSettled([
        loadEvents(),
        loadDerivedState(),
        (async () => {
          const response = await apiFetch(`${apiBaseUrl}/api/genome`);
          if (!response.ok) throw new Error('Genome refresh failed.');
          return GenomeHistoryResponseSchema.parse(await response.json());
        })(),
        (async () => {
          const response = await apiFetch(
            `${apiBaseUrl}/api/observations/archives`,
          );
          if (!response.ok) throw new Error('Archive refresh failed.');
          return ObservationArchivesResponseSchema.parse(await response.json());
        })(),
      ]);

    if (generation !== resetGeneration.current) return;
    const failures: Record<string, string> = {};
    if (eventResult.status === 'fulfilled') {
      const result = eventResult.value;
      setEvents(result.events);
      setCount(result.count);
      setSessionCounts(result.sessionCounts);
      setParticipantCount(result.participantCount);
      setBehaviorSignalCount(result.behaviorSignalCount);
      eventCursor.current = result.cursor;
      setStatus('live');
      setStale(false);
    } else {
      failures.telemetry = 'Live telemetry could not be refreshed.';
      setStatus('offline');
      setStale(true);
    }
    if (derivedResult.status === 'fulfilled') {
      setEvidence(derivedResult.value.evidence);
      setAnalysis(derivedResult.value.analysis);
      setManifest(derivedResult.value.manifest);
      setExecution(derivedResult.value.execution);
    } else {
      failures.workflow = 'Evidence and mutation state could not be refreshed.';
    }
    if (genomeResult.status === 'fulfilled') {
      setGenomeEvolutionCount(
        genomeResult.value.evolutionCycle.genomeEvolutionCount,
      );
      setGenomeExecutions(genomeResult.value.executions);
      setGenomeNextCursor(genomeResult.value.nextCursor);
    } else {
      failures.genome = 'Genome history could not be refreshed.';
    }
    if (archivesResult.status === 'fulfilled') {
      setObservationArchives(archivesResult.value.archives);
      setArchiveNextCursor(archivesResult.value.nextCursor);
    } else {
      failures.archives = 'Observation archives could not be refreshed.';
    }
    setSubsystemErrors(failures);
    if (Object.keys(failures).length) {
      setError(`Refresh incomplete: ${Object.keys(failures).join(', ')}.`);
    }
    if (Object.keys(failures).length < 4) {
      setLastUpdatedAt(new Date().toISOString());
    }
    setRefreshing(false);
  }, []);

  const refresh = hydrate;

  const loadMoreGenome = async () => {
    if (!genomeNextCursor) return;
    const response = await apiFetch(
      `${apiBaseUrl}/api/genome?cursor=${encodeURIComponent(genomeNextCursor)}`,
    );
    if (!response.ok) throw new Error('Genome page request failed.');
    const page = GenomeHistoryResponseSchema.parse(await response.json());
    setGenomeExecutions((current) => [...current, ...page.executions]);
    setGenomeNextCursor(page.nextCursor);
  };

  const loadMoreObservationArchives = async () => {
    if (!archiveNextCursor) return;
    const response = await apiFetch(
      `${apiBaseUrl}/api/observations/archives?cursor=${encodeURIComponent(archiveNextCursor)}`,
    );
    if (!response.ok) throw new Error('Archive page request failed.');
    const page = ObservationArchivesResponseSchema.parse(await response.json());
    setObservationArchives((current) => [...current, ...page.archives]);
    setArchiveNextCursor(page.nextCursor);
  };

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!liveWorkspaceVisible) return;
    let active = true;
    let timer: number | undefined;
    let delayMs = 2_000;
    const schedule = (delay: number) => {
      if (!active) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      try {
        const cursor = eventCursor.current;
        const response = await apiFetch(
          `${apiBaseUrl}/api/studies/${studyId}/events?limit=${eventWindowLimit}${
            cursor ? `&after=${encodeURIComponent(cursor)}` : ''
          }`,
        );
        if (!response.ok) throw new Error('Live telemetry poll failed.');
        const result = StudyEventsResponseSchema.parse(await response.json());
        if (!active) return;
        if (result.events.length) {
          setEvents((current) => {
            const merged = new Map(
              [...current, ...result.events].map((event) => [
                event.eventId,
                event,
              ]),
            );
            return [...merged.values()].slice(-eventWindowLimit);
          });
          delayMs = 2_000;
        } else {
          delayMs = Math.min(30_000, Math.round(delayMs * 1.6));
        }
        setCount(result.count);
        setSessionCounts(result.sessionCounts);
        setParticipantCount(result.participantCount);
        setBehaviorSignalCount(result.behaviorSignalCount);
        eventCursor.current = result.cursor;
        setLastUpdatedAt(new Date().toISOString());
        setStatus('live');
        setStale(false);
        setSubsystemErrors((current) => {
          const next = { ...current };
          delete next.telemetry;
          return next;
        });
      } catch {
        setStale(true);
        setSubsystemErrors((current) => ({
          ...current,
          telemetry: 'Live telemetry polling is retrying.',
        }));
        delayMs = Math.min(
          30_000,
          Math.round(delayMs * 2 + Math.random() * 500),
        );
      }
      schedule(delayMs);
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') schedule(0);
      else if (timer !== undefined) window.clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    schedule(delayMs);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [liveWorkspaceVisible]);

  useEffect(() => {
    const rollbackComplete =
      !execution?.rollback ||
      ['failed', 'released'].includes(execution.rollback.status);
    if (
      !execution ||
      !liveWorkspaceVisible ||
      (['failed', 'released'].includes(execution.status) && rollbackComplete)
    ) {
      return;
    }
    let active = true;
    let timer: number | undefined;
    let delayMs = 3_000;
    const schedule = (delay: number) => {
      if (!active || document.visibilityState !== 'visible') return;
      timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const response = await apiFetch(
          `${apiBaseUrl}/api/repository-executions/${execution.executionId}`,
        );
        if (!response.ok) throw new Error('Execution poll failed.');
        const latest = RepositoryMutationExecutionSchema.parse(
          await response.json(),
        );
        if (active) {
          setExecution(latest);
          delayMs = 3_000;
        }
      } catch {
        delayMs = Math.min(30_000, delayMs * 2);
      }
      schedule(delayMs);
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') schedule(0);
      else if (timer !== undefined) window.clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    schedule(0);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [
    execution?.executionId,
    execution?.status,
    execution?.rollback?.status,
    liveWorkspaceVisible,
  ]);

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
      setEvidence(EvidencePackSchema.parse(payload));
      setAnalysis(null);
      setManifest(null);
      setExecution(null);
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
      setAnalysis(EvidenceAnalysisSchema.parse(payload));
      setManifest(null);
      setExecution(null);
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
    if (!analysis) return;
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
      setManifest(CodexImplementationManifestSchema.parse(manifestPayload));
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
      if (parsedExecution.success) setExecution(parsedExecution.data);
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
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Controlled evolution failed. Retry the handoff.',
      );
    } finally {
      setPreparingManifest(false);
      setImplementing(false);
    }
  };

  const releaseExecution = async (executionId?: string) => {
    const targetExecution =
      (executionId
        ? genomeExecutions.find((item) => item.executionId === executionId)
        : execution) ?? execution;
    if (!targetExecution) return;
    setReleasingExecution(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/repository-executions/${targetExecution.executionId}/release`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(payload);
      if (parsedExecution.success) {
        setExecution(parsedExecution.data);
        if (parsedExecution.data.status === 'released') {
          resetCurrentCycleMeasurements();
          const refreshResults = await Promise.allSettled([
            refreshGenome(),
            refreshObservationArchives(),
          ]);
          if (refreshResults.some((result) => result.status === 'rejected')) {
            setSubsystemErrors((current) => ({
              ...current,
              archives: 'Released successfully; history refresh needs a retry.',
            }));
          }
          setExecution(null);
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
    const targetExecution =
      (executionId
        ? genomeExecutions.find((item) => item.executionId === executionId)
        : execution) ?? execution;
    if (!targetExecution) return;
    setRollingBack(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/repository-executions/${targetExecution.executionId}/rollback`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(payload);
      if (parsedExecution.success) {
        setExecution(parsedExecution.data);
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
    const targetExecution =
      (executionId
        ? genomeExecutions.find((item) => item.executionId === executionId)
        : execution) ?? execution;
    if (!targetExecution?.rollback) return;
    setReleasingRollback(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/repository-executions/${targetExecution.executionId}/rollback/release`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      const parsedExecution =
        RepositoryMutationExecutionSchema.safeParse(payload);
      if (parsedExecution.success) {
        setExecution(parsedExecution.data);
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
    eventCursor.current = null;
    setEvents([]);
    setCount(0);
    setSessionCounts({});
    setParticipantCount(0);
    setBehaviorSignalCount(0);
    setEvidence(null);
    setAnalysis(null);
    setManifest(null);
    setExecution(null);
    setGenomeEvolutionCount(0);
    setGenomeExecutions([]);
    setObservationArchives([]);
    setGenomeNextCursor(null);
    setArchiveNextCursor(null);
    setError(null);
    setSubsystemErrors({});
    setLastUpdatedAt(null);
    setStale(false);
    setGenerating(false);
    setAnalysing(false);
    setPreparingManifest(false);
    setImplementing(false);
    setReleasingExecution(false);
    setRollingBack(false);
    setReleasingRollback(false);
    setStatus('live');
  };

  const resetEvolution = async (confirmation: string) => {
    setError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/demo/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation,
          exportAcknowledged: true,
        }),
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
    hasMoreGenome: genomeNextCursor !== null,
    hasMoreObservationArchives: archiveNextCursor !== null,
    implementing,
    manifest,
    loadMoreGenome,
    loadMoreObservationArchives,
    observationArchives,
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
    sessionCounts,
    startControlledEvolution,
    startRollback,
    status,
    stale,
    lastUpdatedAt,
    subsystemErrors,
    rollingBack,
  };
}
