import {
  CodexImplementationManifestSchema,
  EvidenceAnalysisSchema,
  EvidencePackSchema,
  StudyEventsResponseSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidencePack,
  type StoredTelemetryEvent,
} from '@darwin/shared';
import { useEffect, useRef, useState } from 'react';

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
  prepareCodexManifest: (mutationId?: string) => Promise<void>;
  preparingManifest: boolean;
  resetState: () => void;
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
  const [preparingManifest, setPreparingManifest] = useState(false);
  const [status, setStatus] = useState<LiveTelemetryState['status']>('loading');
  const resetGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const generation = resetGeneration.current;
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/studies/${studyId}/events?limit=50`,
        );
        if (!response.ok) throw new Error('Live telemetry request failed.');
        const result = StudyEventsResponseSchema.parse(await response.json());
        if (active && generation === resetGeneration.current) {
          setEvents(result.events);
          setCount(result.count);
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
      const evidenceResponse = await fetch(
        `${apiBaseUrl}/api/studies/${studyId}/evidence/latest?optional=true`,
      );
      if (evidenceResponse.status === 204 || !evidenceResponse.ok) return;
      const latestEvidence = EvidencePackSchema.parse(
        await evidenceResponse.json(),
      );
      if (!active || initialGeneration !== resetGeneration.current) return;
      setEvidence(latestEvidence);

      const analysisResponse = await fetch(
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

      const manifestResponse = await fetch(
        `${apiBaseUrl}/api/evidence-analyses/${latestAnalysis.analysisId}/codex-manifest`,
      );
      if (!manifestResponse.ok) return;
      if (active && initialGeneration === resetGeneration.current) {
        setManifest(
          CodexImplementationManifestSchema.parse(
            await manifestResponse.json(),
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

  const generateEvidence = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
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
      const response = await fetch(
        `${apiBaseUrl}/api/studies/${studyId}/analyse-evidence`,
        { method: 'POST' },
      );
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Live evidence analysis failed.');
      }
      setAnalysis(EvidenceAnalysisSchema.parse(payload));
      setManifest(null);
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

  const prepareCodexManifest = async (mutationId?: string) => {
    if (!analysis) return;
    setPreparingManifest(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/evidence-analyses/${analysis.analysisId}/codex-manifest`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutationId }),
        },
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

  const resetState = () => {
    resetGeneration.current += 1;
    setEvents([]);
    setCount(0);
    setEvidence(null);
    setAnalysis(null);
    setManifest(null);
    setError(null);
    setGenerating(false);
    setAnalysing(false);
    setPreparingManifest(false);
    setStatus('live');
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
    prepareCodexManifest,
    preparingManifest,
    resetState,
    status,
  };
}
