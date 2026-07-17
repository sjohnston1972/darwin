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
  type ObservationArchive,
  type RepositoryMutationExecution,
  type StoredTelemetryEvent,
} from '@darwin/shared';
import { apiFetch } from '../api';
import { useEffect, useRef, useState } from 'react';

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
  events: StoredTelemetryEvent[];
  genomeEvolutionCount: number;
  genomeExecutions: RepositoryMutationExecution[];
  generateEvidence: () => Promise<void>;
  generating: boolean;
  manifest: CodexImplementationManifest | null;
  observationArchives: ObservationArchive[];
  execution: RepositoryMutationExecution | null;
  implementing: boolean;
  preparingManifest: boolean;
  releasingExecution: boolean;
  releasingRollback: boolean;
  rollingBack: boolean;
  participantCount: number;
  resetState: () => void;
  resetEvolution: () => Promise<boolean>;
  sessionCounts: Record<string, number>;
  startControlledEvolution: (mutationIds: string[]) => Promise<void>;
  status: 'loading' | 'live' | 'offline';
  releaseExecution: (executionId?: string) => Promise<void>;
  releaseRollback: (executionId?: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshing: boolean;
  startRollback: (executionId?: string) => Promise<void>;
}

export function useLiveTelemetry(): LiveTelemetryState {
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
    RepositoryMutationExecution[]
  >([]);
  const [observationArchives, setObservationArchives] = useState<
    ObservationArchive[]
  >([]);
  const [implementing, setImplementing] = useState(false);
  const [releasingExecution, setReleasingExecution] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [releasingRollback, setReleasingRollback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<LiveTelemetryState['status']>('loading');
  const resetGeneration = useRef(0);

  const refreshGenome = async () => {
    const response = await apiFetch(`${apiBaseUrl}/api/genome`);
    if (!response.ok) return;
    const history = GenomeHistoryResponseSchema.parse(await response.json());
    setGenomeEvolutionCount(history.evolutionCycle.genomeEvolutionCount);
    setGenomeExecutions(history.executions);
  };

  const refreshObservationArchives = async () => {
    const response = await apiFetch(`${apiBaseUrl}/api/observations/archives`);
    if (!response.ok) return;
    const result = ObservationArchivesResponseSchema.parse(
      await response.json(),
    );
    setObservationArchives(result.archives);
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

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/events?limit=${eventWindowLimit}`,
      );
      if (!response.ok) throw new Error('Live telemetry request failed.');
      const result = StudyEventsResponseSchema.parse(await response.json());
      setEvents(result.events);
      setCount(result.count);
      setSessionCounts(result.sessionCounts);
      setParticipantCount(result.participantCount);
      setBehaviorSignalCount(result.behaviorSignalCount);
      setStatus('live');
      await Promise.all([refreshGenome(), refreshObservationArchives()]);
    } catch (error) {
      setStatus('offline');
      setError(
        error instanceof Error
          ? error.message
          : 'Live telemetry refresh failed. Check the API and retry.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    void refreshGenome().catch(() => undefined);
    void refreshObservationArchives().catch(() => undefined);
    const load = async () => {
      const generation = resetGeneration.current;
      try {
        const response = await apiFetch(
          `${apiBaseUrl}/api/studies/${studyId}/events?limit=${eventWindowLimit}`,
        );
        if (!response.ok) throw new Error('Live telemetry request failed.');
        const result = StudyEventsResponseSchema.parse(await response.json());
        if (active && generation === resetGeneration.current) {
          setEvents(result.events);
          setCount(result.count);
          setSessionCounts(result.sessionCounts);
          setParticipantCount(result.participantCount);
          setBehaviorSignalCount(result.behaviorSignalCount);
          setStatus('live');
        }
      } catch {
        if (active && generation === resetGeneration.current)
          setStatus('offline');
      }
    };
    void load();
    const initialGeneration = resetGeneration.current;
    const loadDerivedState = async () => {
      setEvidence(null);
      setAnalysis(null);
      setManifest(null);
      setExecution(null);
      const evidenceResponse = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence/latest?optional=true`,
      );
      if (evidenceResponse.status === 204 || !evidenceResponse.ok) return;
      const latestEvidence = EvidencePackSchema.parse(
        await evidenceResponse.json(),
      );
      if (!active || initialGeneration !== resetGeneration.current) return;
      setEvidence(latestEvidence);

      const analysisResponse = await apiFetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence-analysis/latest?optional=true`,
      );
      if (analysisResponse.status === 204 || !analysisResponse.ok) return;
      const latestAnalysis = EvidenceAnalysisSchema.parse(
        await analysisResponse.json(),
      );
      if (
        latestAnalysis.evidenceId !== latestEvidence.evidenceId ||
        latestAnalysis.evidenceHash !== latestEvidence.evidenceHash ||
        !active ||
        initialGeneration !== resetGeneration.current
      ) {
        return;
      }
      setAnalysis(latestAnalysis);

      const manifestResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${latestAnalysis.analysisId}/codex-manifest`,
      );
      if (!manifestResponse.ok) return;
      const latestManifest = CodexImplementationManifestSchema.parse(
        await manifestResponse.json(),
      );
      if (!active || initialGeneration !== resetGeneration.current) return;
      setManifest(latestManifest);

      const executionResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${latestAnalysis.analysisId}/codex-manifest/execution`,
      );
      if (executionResponse.status === 204 || !executionResponse.ok) return;
      if (active && initialGeneration === resetGeneration.current) {
        setExecution(
          RepositoryMutationExecutionSchema.parse(
            await executionResponse.json(),
          ),
        );
      }
    };
    void loadDerivedState().catch(() => undefined);
    const interval = window.setInterval(() => void load(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

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
        if (active) setExecution(latest);
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
          await refreshGenome();
          await refreshObservationArchives();
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
    implementing,
    manifest,
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
    rollingBack,
  };
}
