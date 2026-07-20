import {
  CodexImplementationManifestSchema,
  LabExperimentsResponseSchema,
  RepositoryMutationExecutionSchema,
  type CodexImplementationManifest,
  type LabExperiment,
  type LabMutationCandidate,
  type RepositoryMutationExecution,
} from '@darwin/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '../api';

export interface LabMutationHandoff {
  experiment: LabExperiment;
  mutation: LabMutationCandidate;
  manifest: CodexImplementationManifest | null;
  execution: RepositoryMutationExecution | null;
}

export interface LabMutationHandoffState {
  dispatching: boolean;
  error: string | null;
  handoff: LabMutationHandoff | null;
  loading: boolean;
  releasing: boolean;
  releasingRollback: boolean;
  refresh: () => Promise<void>;
  release: () => Promise<void>;
  releaseRollback: () => Promise<void>;
  rollingBack: boolean;
  startImplementation: () => Promise<void>;
  startRollback: () => Promise<void>;
}

const latestSelectedExperiment = (experiments: LabExperiment[]) =>
  experiments
    .filter(
      (experiment) =>
        experiment.analysis &&
        experiment.selection &&
        experiment.analysis.mutations.some(
          (mutation) =>
            mutation.mutationId === experiment.selection?.mutationId,
        ),
    )
    .sort((left, right) =>
      right.selection!.selectedAt.localeCompare(left.selection!.selectedAt),
    )[0] ?? null;

const loadOptionalJson = async (url: string) => {
  const response = await apiFetch(url);
  if (response.status === 204 || response.status === 404) return null;
  const payload = (await response.json()) as { message?: string };
  if (!response.ok) {
    throw new Error(
      payload.message ?? 'Lab mutation handoff could not be loaded.',
    );
  }
  return payload;
};

export function useLabMutationHandoff(
  apiBaseUrl: string,
  enabled: boolean,
): LabMutationHandoffState {
  const [handoff, setHandoff] = useState<LabMutationHandoff | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [dispatching, setDispatching] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [releasingRollback, setReleasingRollback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const currentGeneration = ++generation.current;
    const experimentsResponse = await apiFetch(
      `${apiBaseUrl}/api/lab/experiments`,
    );
    const experimentsPayload = (await experimentsResponse.json()) as {
      message?: string;
    };
    if (!experimentsResponse.ok) {
      throw new Error(
        experimentsPayload.message ??
          'Darwin Lab selections could not be loaded.',
      );
    }
    const experiments =
      LabExperimentsResponseSchema.parse(experimentsPayload).experiments;
    const experiment = latestSelectedExperiment(experiments);
    if (!experiment) {
      if (currentGeneration === generation.current) setHandoff(null);
      return;
    }
    const mutation = experiment.analysis!.mutations.find(
      (candidate) => candidate.mutationId === experiment.selection!.mutationId,
    )!;
    const analysisId = experiment.analysis!.analysisId;
    const [manifestPayload, executionPayload] = await Promise.all([
      loadOptionalJson(
        `${apiBaseUrl}/api/evidence-analyses/${encodeURIComponent(analysisId)}/codex-manifest`,
      ),
      loadOptionalJson(
        `${apiBaseUrl}/api/evidence-analyses/${encodeURIComponent(analysisId)}/codex-manifest/execution`,
      ),
    ]);
    if (currentGeneration !== generation.current) return;
    setHandoff({
      experiment,
      mutation,
      manifest: manifestPayload
        ? CodexImplementationManifestSchema.parse(manifestPayload)
        : null,
      execution: executionPayload
        ? RepositoryMutationExecutionSchema.parse(executionPayload)
        : null,
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const poll = async () => {
      try {
        await refresh();
        if (active) setError(null);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Lab mutation handoff could not be loaded.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 3_000);
    return () => {
      active = false;
      generation.current += 1;
      window.clearInterval(interval);
    };
  }, [enabled, refresh]);

  const startImplementation = useCallback(async () => {
    if (!handoff) return;
    setDispatching(true);
    setError(null);
    try {
      const experimentId = encodeURIComponent(handoff.experiment.experimentId);
      const manifestResponse = await apiFetch(
        `${apiBaseUrl}/api/lab/experiments/${experimentId}/codex-manifest`,
        { method: 'POST' },
      );
      const manifestPayload = (await manifestResponse.json()) as {
        message?: string;
      };
      if (!manifestResponse.ok) {
        throw new Error(
          manifestPayload.message ?? 'Lab implementation manifest failed.',
        );
      }
      const manifest = CodexImplementationManifestSchema.parse(manifestPayload);
      const executionResponse = await apiFetch(
        `${apiBaseUrl}/api/evidence-analyses/${encodeURIComponent(manifest.analysisId)}/codex-manifest/execution`,
        { method: 'POST' },
      );
      const executionPayload = (await executionResponse.json()) as {
        message?: string;
      };
      if (!executionResponse.ok) {
        throw new Error(
          executionPayload.message ?? 'Lab repository execution failed.',
        );
      }
      setHandoff((current) =>
        current
          ? {
              ...current,
              manifest,
              execution:
                RepositoryMutationExecutionSchema.parse(executionPayload),
            }
          : current,
      );
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Lab controlled implementation failed.',
      );
    } finally {
      setDispatching(false);
    }
  }, [apiBaseUrl, handoff, refresh]);

  const updateExecution = useCallback(
    async (
      action: 'release' | 'rollback' | 'rollback/release',
      fallbackMessage: string,
      setWorking: (working: boolean) => void,
    ) => {
      const executionId = handoff?.execution?.executionId;
      if (!executionId) return;
      setWorking(true);
      setError(null);
      try {
        const response = await apiFetch(
          `${apiBaseUrl}/api/repository-executions/${encodeURIComponent(executionId)}/${action}`,
          { method: 'POST' },
        );
        const payload = (await response.json()) as { message?: string };
        const parsed = RepositoryMutationExecutionSchema.safeParse(payload);
        if (parsed.success) {
          setHandoff((current) =>
            current ? { ...current, execution: parsed.data } : current,
          );
        }
        if (!response.ok) {
          throw new Error(
            parsed.success
              ? (parsed.data.error ??
                  parsed.data.rollback?.error ??
                  fallbackMessage)
              : (payload.message ?? fallbackMessage),
          );
        }
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : fallbackMessage);
      } finally {
        setWorking(false);
      }
    },
    [apiBaseUrl, handoff?.execution?.executionId, refresh],
  );

  const release = useCallback(
    () => updateExecution('release', 'Mutation release failed.', setReleasing),
    [updateExecution],
  );
  const startRollback = useCallback(
    () =>
      updateExecution(
        'rollback',
        'Rollback preparation failed.',
        setRollingBack,
      ),
    [updateExecution],
  );
  const releaseRollback = useCallback(
    () =>
      updateExecution(
        'rollback/release',
        'Rollback release failed.',
        setReleasingRollback,
      ),
    [updateExecution],
  );

  return {
    dispatching,
    error,
    handoff,
    loading,
    releasing,
    releasingRollback,
    refresh,
    release,
    releaseRollback,
    rollingBack,
    startImplementation,
    startRollback,
  };
}
