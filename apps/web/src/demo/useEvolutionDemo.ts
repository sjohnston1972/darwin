import {
  DemoResetResponseSchema,
  EvolutionAnalysisResponseSchema,
  EvolutionTimelineResponseSchema,
  MutationDiffSchema,
  MutationDecisionResponseSchema,
  MutationReleaseResponseSchema,
  MutationValidationResponseSchema,
  OrganismStateSchema,
  SimulationCreateResponseSchema,
  type EvolutionAnalysisResponse,
  type EvolutionRecord,
  type MutationDiff,
  type OrganismState,
  type SimulationSummary,
  type ValidationResult,
} from '@darwin/shared';
import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

const baselineOrganism: OrganismState = {
  variant: 'baseline',
  genomeVersion: 'v1.0',
  evolutionCycles: 0,
  activeMutationId: null,
  updatedAt: new Date(0).toISOString(),
};

const request = async <Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema,
  init?: RequestInit,
): Promise<z.infer<Schema>> => {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = (await response.json()) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? 'Darwin API request failed.');
  }

  return schema.parse(payload);
};

export type DemoStage =
  | 'idle'
  | 'observing'
  | 'proposal'
  | 'deciding'
  | 'approved'
  | 'validating'
  | 'validated'
  | 'releasing'
  | 'released'
  | 'rejected'
  | 'resetting'
  | 'error';

const animateEventCount = (
  total: number,
  generation: number,
  currentGeneration: () => number,
  onProgress: (count: number) => void,
) => {
  const duration = import.meta.env.MODE === 'test' ? 0 : 1_600;
  if (duration === 0) {
    onProgress(total);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const startedAt = performance.now();
    const tick = () => {
      if (currentGeneration() !== generation) {
        resolve();
        return;
      }

      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / duration);
      onProgress(Math.round(total * (1 - (1 - progress) ** 3)));

      if (progress === 1) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
};

export function useEvolutionDemo() {
  const [stage, setStage] = useState<DemoStage>('idle');
  const [eventCount, setEventCount] = useState(0);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const [analysis, setAnalysis] = useState<EvolutionAnalysisResponse | null>(
    null,
  );
  const [mutationDiff, setMutationDiff] = useState<MutationDiff | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [timeline, setTimeline] = useState<EvolutionRecord[]>([]);
  const [organism, setOrganism] = useState<OrganismState>(baselineOrganism);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      request('/api/organism/state', OrganismStateSchema, {
        signal: controller.signal,
      }),
      request('/api/evolution/timeline', EvolutionTimelineResponseSchema, {
        signal: controller.signal,
      }),
    ])
      .then(([state, history]) => {
        setOrganism(state);
        setTimeline(history.records);
        if (state.variant === 'evolved') setStage('released');
      })
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        )
          return;
      });

    return () => controller.abort();
  }, []);

  const observe = async () => {
    const runGeneration = generation.current + 1;
    generation.current = runGeneration;
    setStage('observing');
    setEventCount(0);
    setSummary(null);
    setAnalysis(null);
    setMutationDiff(null);
    setValidation(null);
    setError(null);
    setOrganism(baselineOrganism);

    try {
      const simulation = await request(
        '/api/simulations',
        SimulationCreateResponseSchema,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed: 1859, variant: 'baseline' }),
        },
      );
      if (generation.current !== runGeneration) return;
      setSummary(simulation.summary);

      const analysisRequest = request(
        '/api/evolution/analyse',
        EvolutionAnalysisResponseSchema,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simulationId: simulation.run.id }),
        },
      );
      const [, result] = await Promise.all([
        animateEventCount(
          simulation.run.eventCount,
          runGeneration,
          () => generation.current,
          setEventCount,
        ),
        analysisRequest,
      ]);

      if (generation.current !== runGeneration) return;
      setAnalysis(result);
      const history = await request(
        '/api/evolution/timeline',
        EvolutionTimelineResponseSchema,
      );
      setTimeline(history.records);
      setStage('proposal');
    } catch (requestError) {
      if (generation.current !== runGeneration) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Observation failed unexpectedly.',
      );
      setStage('error');
    }
  };

  const decide = async (decision: 'approve' | 'reject') => {
    if (!analysis || stage !== 'proposal') return;
    setStage('deciding');
    setError(null);

    try {
      const result = await request(
        `/api/mutations/${encodeURIComponent(analysis.proposal.id)}/${decision}`,
        MutationDecisionResponseSchema,
        { method: 'POST' },
      );
      setAnalysis({ ...analysis, proposal: result.proposal });
      setOrganism(result.organism);
      if (decision === 'approve') {
        const diff = await request(
          `/api/mutations/${encodeURIComponent(analysis.proposal.id)}/diff`,
          MutationDiffSchema,
        );
        setMutationDiff(diff);
        setStage('approved');
      } else {
        const history = await request(
          '/api/evolution/timeline',
          EvolutionTimelineResponseSchema,
        );
        setTimeline(history.records);
        setStage('rejected');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Mutation decision failed unexpectedly.',
      );
      setStage('error');
    }
  };

  const validate = async () => {
    if (!analysis || stage !== 'approved') return;
    setStage('validating');
    setError(null);

    try {
      const result = await request(
        `/api/mutations/${encodeURIComponent(analysis.proposal.id)}/validate`,
        MutationValidationResponseSchema,
        { method: 'POST' },
      );
      setAnalysis({ ...analysis, proposal: result.proposal });
      setValidation(result.validation);
      setStage(result.validation.status === 'passed' ? 'validated' : 'error');
      if (result.validation.status === 'failed') {
        setError('The mutation failed recorded repository validation.');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Mutation validation failed unexpectedly.',
      );
      setStage('error');
    }
  };

  const release = async () => {
    if (!analysis || stage !== 'validated') return;
    setStage('releasing');
    setError(null);

    try {
      const result = await request(
        `/api/mutations/${encodeURIComponent(analysis.proposal.id)}/release`,
        MutationReleaseResponseSchema,
        { method: 'POST' },
      );
      setAnalysis({ ...analysis, proposal: result.proposal });
      setOrganism(result.organism);
      setTimeline((current) => [...current, result.record]);
      setStage('released');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Mutation release failed unexpectedly.',
      );
      setStage('error');
    }
  };

  const reset = async () => {
    generation.current += 1;
    setStage('resetting');
    setError(null);

    try {
      const result = await request('/api/demo/reset', DemoResetResponseSchema, {
        method: 'POST',
      });
      setEventCount(0);
      setSummary(null);
      setAnalysis(null);
      setMutationDiff(null);
      setValidation(null);
      setTimeline([]);
      setOrganism(result.organism);
      setStage('idle');
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Demo reset failed unexpectedly.',
      );
      setStage('error');
      return false;
    }
  };

  return {
    analysis,
    decide,
    error,
    eventCount,
    mutationDiff,
    observe,
    organism,
    release,
    reset,
    stage,
    summary,
    timeline,
    validate,
    validation,
  };
}
