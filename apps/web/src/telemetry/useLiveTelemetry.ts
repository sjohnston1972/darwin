import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  OutcomeValidationSchema,
  StudyEventsResponseSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
  type OutcomeValidation,
  type StoredTelemetryEvent,
} from '@darwin/shared';
import { useEffect, useState } from 'react';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';
const studyId = 'projectflow-baseline-study';

export interface LiveTelemetryState {
  count: number;
  clearError: () => void;
  analysis: EvidenceAnalysis | null;
  analyseEvidence: () => Promise<void>;
  analysing: boolean;
  evidence: EvidencePack | null;
  error: string | null;
  events: StoredTelemetryEvent[];
  generateEvidence: () => Promise<void>;
  generating: boolean;
  manifest: CodexImplementationManifest | null;
  outcome: OutcomeValidation | null;
  prepareCodexManifest: () => Promise<void>;
  preparingManifest: boolean;
  status: 'loading' | 'live' | 'offline';
}

export function useLiveTelemetry(): LiveTelemetryState {
  const [events, setEvents] = useState<StoredTelemetryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [analysis, setAnalysis] = useState<EvidenceAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [evidence, setEvidence] = useState<EvidencePack | null>(null);
  const [generating, setGenerating] = useState(false);
  const [manifest, setManifest] = useState<CodexImplementationManifest | null>(
    null,
  );
  const [outcome, setOutcome] = useState<OutcomeValidation | null>(null);
  const [preparingManifest, setPreparingManifest] = useState(false);
  const [status, setStatus] = useState<LiveTelemetryState['status']>('loading');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/studies/${studyId}/events?limit=50`,
        );
        if (!response.ok) throw new Error('Live telemetry request failed.');
        const result = StudyEventsResponseSchema.parse(await response.json());
        if (active) {
          setEvents(result.events);
          setCount(result.count);
          setStatus('live');
        }
      } catch {
        if (active) setStatus('offline');
      }
    };
    void load();
    void fetch(
      `${apiBaseUrl}/api/studies/${studyId}/evidence/latest?optional=true`,
    )
      .then(async (response) => {
        if (response.status === 204 || !response.ok) return;
        if (active)
          setEvidence(EvidencePackSchema.parse(await response.json()));
      })
      .catch(() => undefined);
    void fetch(`${apiBaseUrl}/api/outcomes/automated-comparison`)
      .then(async (response) => {
        if (!response.ok) return;
        if (active)
          setOutcome(OutcomeValidationSchema.parse(await response.json()));
      })
      .catch(() => undefined);
    void fetch(
      `${apiBaseUrl}/api/studies/${studyId}/evidence-analysis/latest?optional=true`,
    )
      .then(async (response) => {
        if (response.status === 204 || !response.ok) return;
        const result = EvidenceAnalysisSchema.parse(await response.json());
        if (!active) return;
        setAnalysis(result);
        return fetch(
          `${apiBaseUrl}/api/evidence-analyses/${result.analysisId}/codex-manifest`,
        );
      })
      .then(async (response) => {
        if (!response?.ok) return;
        if (active)
          setManifest(
            CodexImplementationManifestSchema.parse(await response.json()),
          );
      })
      .catch(() => undefined);
    const interval = window.setInterval(() => void load(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const generateEvidence = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Evidence generation failed.');
      setEvidence(EvidencePackSchema.parse(await response.json()));
      setAnalysis(null);
      setManifest(null);
    } catch {
      setError('Evidence generation failed. Check the API and retry.');
    } finally {
      setGenerating(false);
    }
  };

  const analyseEvidence = async () => {
    setAnalysing(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/studies/${studyId}/analyse-evidence`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Evidence analysis failed.');
      setAnalysis(EvidenceAnalysisSchema.parse(await response.json()));
      setManifest(null);
    } catch {
      setError('Mutation analysis failed. The evidence pack is unchanged.');
    } finally {
      setAnalysing(false);
    }
  };

  const prepareCodexManifest = async () => {
    if (!analysis) return;
    setPreparingManifest(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/evidence-analyses/${analysis.analysisId}/codex-manifest`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Codex manifest generation failed.');
      setManifest(
        CodexImplementationManifestSchema.parse(await response.json()),
      );
    } catch {
      setError('Codex manifest generation failed. Retry the handoff.');
    } finally {
      setPreparingManifest(false);
    }
  };

  return {
    analysis,
    analyseEvidence,
    analysing,
    clearError: () => setError(null),
    count,
    evidence,
    error,
    events,
    generateEvidence,
    generating,
    manifest,
    outcome,
    prepareCodexManifest,
    preparingManifest,
    status,
  };
}
