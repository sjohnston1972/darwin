import {
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  type LabAgentRun,
  type BehaviouralEval,
  type LabExperiment,
} from '@darwin/shared';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FlaskConical,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiFetch } from './api';

interface DarwinLabViewProps {
  apiBaseUrl: string;
  defaultTargetUrl: string;
  liveReasoningAvailable: boolean;
}

const terminalExperimentStatuses = new Set(['completed', 'analysed', 'failed']);

const statusLabel: Record<LabExperiment['status'], string> = {
  draft: 'Draft',
  awaiting_runner: 'Awaiting runner',
  running: 'Population live',
  completed: 'Evidence ready',
  analysing: 'GPT analysing',
  analysed: 'Mutations ready',
  failed: 'Stopped',
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

const formatDuration = (durationMs: number | null) =>
  durationMs === null ? '--' : `${(durationMs / 1_000).toFixed(1)}s`;

const personaLabel = (persona: string) =>
  persona
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function DarwinLabView({
  apiBaseUrl,
  defaultTargetUrl,
  liveReasoningAvailable,
}: DarwinLabViewProps) {
  const [experiments, setExperiments] = useState<LabExperiment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('Apollo discovery study');
  const [targetUrl, setTargetUrl] = useState(defaultTargetUrl);
  const [populationSize, setPopulationSize] = useState(8);
  const [maxActions, setMaxActions] = useState(12);
  const [seed, setSeed] = useState(1859);

  const loadExperiments = useCallback(async () => {
    const response = await apiFetch(`${apiBaseUrl}/api/lab/experiments`);
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? 'Darwin Lab could not be loaded.');
    }
    const parsed = LabExperimentsResponseSchema.parse(payload).experiments;
    setExperiments(parsed);
    setSelectedId((current) =>
      current &&
      parsed.some((experiment) => experiment.experimentId === current)
        ? current
        : (parsed[0]?.experimentId ?? null),
    );
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadExperiments()
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : 'Darwin Lab could not be loaded.',
        ),
      )
      .finally(() => setLoading(false));
  }, [loadExperiments]);

  const selected =
    experiments.find((experiment) => experiment.experimentId === selectedId) ??
    null;
  const selectedRun =
    selected?.runs.find((run) => run.runId === selectedRunId) ??
    selected?.runs.at(-1) ??
    null;
  const activeExperiment = experiments.some(
    (experiment) => !terminalExperimentStatuses.has(experiment.status),
  );

  useEffect(() => {
    if (!activeExperiment) return;
    const interval = window.setInterval(() => {
      void loadExperiments().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [activeExperiment, loadExperiments]);

  useEffect(() => {
    if (!selected?.runs.length) {
      setSelectedRunId(null);
      return;
    }
    if (!selected.runs.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(selected.runs.at(-1)!.runId);
    }
  }, [selected, selectedRunId]);

  const mutateExperiment = async (
    action: string,
    path: string,
    body?: unknown,
  ) => {
    setWorking(action);
    setError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Darwin Lab request failed.');
      }
      const experiment = LabExperimentSchema.parse(payload);
      setExperiments((current) => [
        experiment,
        ...current.filter(
          (candidate) => candidate.experimentId !== experiment.experimentId,
        ),
      ]);
      setSelectedId(experiment.experimentId);
      return experiment;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Darwin Lab request failed.',
      );
      return null;
    } finally {
      setWorking(null);
    }
  };

  const createExperiment = async (event: FormEvent) => {
    event.preventDefault();
    await mutateExperiment('create', '/api/lab/experiments', {
      name,
      targetUrl,
      populationSize,
      maxActions,
      maxDurationMs: 180_000,
      seed,
    });
  };

  const runProgress = selected
    ? selected.runs.filter((run) => run.status !== 'running').length /
      selected.populationSize
    : 0;

  return (
    <div className="lab-workspace">
      <section className="lab-hero" aria-labelledby="lab-title">
        <div>
          <p className="section-label">
            <FlaskConical size={14} /> Synthetic telemetry laboratory
          </p>
          <h1 id="lab-title">Darwin Lab</h1>
          <p className="lab-tagline">
            Evolve software before real users arrive.
          </p>
          <p className="lab-copy">
            A bounded population of inexpensive AI agents operates the real
            ProjectFlow interface in isolated browsers. Their traces stay
            synthetic, reproducible, and separate from measured human evidence.
          </p>
        </div>
        <div className="lab-boundary-card">
          <span>
            <ShieldCheck size={15} /> Evidence boundary
          </span>
          <strong>SYNTHETIC ONLY</strong>
          <small>Never included in human cohorts or measured fitness.</small>
        </div>
      </section>

      {error && (
        <div className="lab-error" role="alert">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <div className="lab-layout">
        <aside className="surface-panel lab-control-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Experiment design</p>
              <h2>Project Apollo discovery</h2>
            </div>
            <Bot size={20} className="text-mist" />
          </div>
          <form
            className="lab-form"
            onSubmit={(event) => void createExperiment(event)}
          >
            <label>
              Experiment name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              Test or preview target
              <input
                type="url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
              />
            </label>
            <label>
              Population <strong>{populationSize} agents</strong>
              <input
                type="range"
                min="8"
                max="20"
                value={populationSize}
                onChange={(event) =>
                  setPopulationSize(Number(event.target.value))
                }
              />
            </label>
            <div className="lab-form-grid">
              <label>
                Action budget
                <input
                  type="number"
                  min="4"
                  max="30"
                  value={maxActions}
                  onChange={(event) =>
                    setMaxActions(Number(event.target.value))
                  }
                />
              </label>
              <label>
                Seed
                <input
                  type="number"
                  min="1"
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="lab-task-card">
              <span>Fixed task</span>
              <strong>Find everyone assigned to Project Apollo.</strong>
              <small>
                The answer oracle is withheld from every agent prompt.
              </small>
            </div>
            <button
              className="primary-action"
              type="submit"
              disabled={working !== null}
            >
              {working === 'create' ? (
                <CircleDashed className="is-spinning" size={16} />
              ) : (
                <FlaskConical size={16} />
              )}
              Create bounded experiment
            </button>
          </form>
        </aside>

        <section className="surface-panel lab-experiment-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Synthetic population</p>
              <h2>{selected?.name ?? 'No experiment yet'}</h2>
            </div>
            {selected && (
              <span className={`lab-status status-${selected.status}`}>
                {selected.status === 'running' ||
                selected.status === 'analysing' ? (
                  <CircleDashed className="is-spinning" size={14} />
                ) : selected.status === 'failed' ? (
                  <AlertTriangle size={14} />
                ) : (
                  <Activity size={14} />
                )}
                {statusLabel[selected.status]}
              </span>
            )}
          </div>

          {loading ? (
            <div className="lab-empty">
              <CircleDashed className="is-spinning" /> Loading Lab
            </div>
          ) : !selected ? (
            <div className="lab-empty">
              <Bot size={24} /> Create an experiment to seed the first
              population.
            </div>
          ) : (
            <>
              <div className="lab-experiment-tabs" aria-label="Lab experiments">
                {experiments.slice(0, 6).map((experiment) => (
                  <button
                    key={experiment.experimentId}
                    type="button"
                    className={
                      experiment.experimentId === selected.experimentId
                        ? 'is-active'
                        : ''
                    }
                    onClick={() => setSelectedId(experiment.experimentId)}
                  >
                    <span>{experiment.name}</span>
                    <small>{statusLabel[experiment.status]}</small>
                  </button>
                ))}
              </div>

              <div className="lab-metrics">
                <LabMetric
                  label="Population"
                  value={`${selected.runs.length}/${selected.populationSize}`}
                />
                <LabMetric
                  label="Completion"
                  value={
                    selected.evidence
                      ? percent(selected.evidence.metrics.completionRate)
                      : '--'
                  }
                />
                <LabMetric
                  label="Median path"
                  value={
                    selected.evidence?.metrics.medianActions?.toString() ?? '--'
                  }
                />
                <LabMetric
                  label="Evidence"
                  value={
                    selected.evidence
                      ? selected.evidence.evidenceHash.slice(0, 8)
                      : '--'
                  }
                />
              </div>

              <div className="lab-progress" aria-label="Population progress">
                <span style={{ width: `${Math.max(2, runProgress * 100)}%` }} />
              </div>

              {selected.status === 'draft' && (
                <div className="lab-next-action">
                  <div>
                    <strong>Ready to recruit synthetic agents</strong>
                    <span>
                      Queue the experiment, then start the authenticated browser
                      runner.
                    </span>
                  </div>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={working !== null}
                    onClick={() =>
                      void mutateExperiment(
                        'start',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/start`,
                      )
                    }
                  >
                    <Play size={16} /> Queue population
                  </button>
                </div>
              )}

              {selected.status === 'awaiting_runner' && (
                <div className="lab-runner-command">
                  <div>
                    <CircleDashed className="is-spinning" size={17} />
                    <span>
                      <strong>Browser runner requested</strong>
                      <small>
                        Run from the Darwin repository; it claims the oldest
                        queued experiment.
                      </small>
                    </span>
                  </div>
                  <code>npm run lab:runner</code>
                </div>
              )}

              <AgentPopulation
                experiment={selected}
                onSelectRun={setSelectedRunId}
                selectedRunId={selectedRun?.runId ?? null}
              />
            </>
          )}
        </section>
      </div>

      {selectedRun && <RunReplay run={selectedRun} />}

      {selected?.evidence && (
        <section className="surface-panel lab-evidence-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Deterministic evidence</p>
              <h2>Selection pressure from real browser traces</h2>
            </div>
            <code>{selected.evidence.evidenceHash.slice(0, 16)}</code>
          </div>
          <div className="lab-evidence-summary">
            <span>{selected.evidence.population.completed} terminal runs</span>
            <span>{selected.evidence.signals.length} friction signals</span>
            <span>
              {percent(selected.evidence.metrics.repeatedRouteRate)} repeated
              routes
            </span>
            <span>
              {percent(selected.evidence.metrics.searchFailureRate)} search
              failure
            </span>
          </div>
          <div className="lab-signal-grid">
            {selected.evidence.signals.map((signal) => (
              <article key={signal.evidenceId}>
                <span className={`lab-severity severity-${signal.severity}`}>
                  {signal.severity}
                </span>
                <code>{signal.evidenceId}</code>
                <h3>{personaLabel(signal.detector)}</h3>
                <p>{signal.summary}</p>
                <small>
                  {signal.support.runs} runs · {signal.support.actions} actions
                  · {signal.support.telemetryEvents} telemetry events
                </small>
              </article>
            ))}
          </div>
          {!selected.analysis && (
            <div className="lab-analysis-action">
              <div>
                <strong>One population-level reasoning call</strong>
                <span>
                  GPT-5.6 must cite only the hashed L-EV records above.
                </span>
              </div>
              <button
                className="primary-action"
                type="button"
                disabled={
                  working !== null ||
                  !liveReasoningAvailable ||
                  !selected.evidence.signals.length
                }
                onClick={() =>
                  void mutateExperiment(
                    'analyse',
                    `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/analyse`,
                  )
                }
              >
                {working === 'analyse' ? (
                  <CircleDashed className="is-spinning" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {liveReasoningAvailable
                  ? 'Analyse synthetic pressure'
                  : 'Live model unavailable'}
              </button>
            </div>
          )}
        </section>
      )}

      {selected?.evidence && (
        <section
          className="surface-panel lab-evidence-panel"
          aria-labelledby="behavioural-eval-title"
        >
          <div className="panel-heading">
            <div>
              <p className="section-label">Behavioural CI</p>
              <h2 id="behavioural-eval-title">
                {selected.behaviouralEval
                  ? `${selected.behaviouralEval.evalId} · retained acceptance test`
                  : 'Turn this failure into a permanent eval'}
              </h2>
            </div>
            {selected.behaviouralEval && (
              <span className="lab-status status-analysed">
                <CheckCircle2 size={14} /> {selected.behaviouralEval.status}
              </span>
            )}
          </div>
          {selected.behaviouralEval ? (
            <div>
              <BehaviouralEvalSummary evaluation={selected.behaviouralEval} />
              <button
                className="secondary-action mt-4"
                type="button"
                disabled={
                  working !== null ||
                  selected.status === 'awaiting_runner' ||
                  selected.status === 'running'
                }
                onClick={() =>
                  void mutateExperiment(
                    'rerun-eval',
                    `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/rerun-eval`,
                  )
                }
              >
                {working === 'rerun-eval'
                  ? 'Rerunning…'
                  : 'Rerun behavioural eval'}
              </button>
            </div>
          ) : (
            <div className="lab-next-action">
              <div>
                <strong>Observed failure → executable contract</strong>
                <span>
                  Preserve the goal, oracle, seed, and thresholds. Codex must
                  make this eval pass without being given a click path.
                </span>
              </div>
              <button
                className="primary-action"
                type="button"
                disabled={
                  working !== null || selected.evidence.signals.length === 0
                }
                onClick={() =>
                  void mutateExperiment(
                    'promote-eval',
                    `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/promote-eval`,
                  )
                }
              >
                {working === 'promote-eval' ? (
                  <CircleDashed className="is-spinning" size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                Promote to behavioural eval
              </button>
            </div>
          )}
        </section>
      )}

      {selected?.analysis && (
        <section className="surface-panel lab-mutation-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Mutation portfolio</p>
              <h2>Evidence-citing evolution candidates</h2>
            </div>
            <span className="lab-model-badge">
              <Sparkles size={14} /> {selected.analysis.model}
            </span>
          </div>
          <p className="lab-analysis-summary">{selected.analysis.summary}</p>
          <div className="lab-mutation-grid">
            {selected.analysis.mutations.map((mutation) => {
              const retained =
                selected.selection?.mutationId === mutation.mutationId;
              return (
                <article
                  className={retained ? 'is-selected' : ''}
                  key={mutation.mutationId}
                >
                  <div>
                    <code>{mutation.evidenceIds.join(' · ')}</code>
                    <span>
                      {Math.round(mutation.confidence * 100)}% confidence
                    </span>
                  </div>
                  <h3>{mutation.title}</h3>
                  <p>{mutation.problem}</p>
                  <details>
                    <summary>
                      Controlled implementation brief <ChevronRight size={14} />
                    </summary>
                    <p>{mutation.implementationBrief}</p>
                    <strong>Retest</strong>
                    <p>{mutation.validationPlan}</p>
                  </details>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={working !== null || Boolean(selected.selection)}
                    onClick={() =>
                      void mutateExperiment(
                        'select',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/mutations/select`,
                        { mutationId: mutation.mutationId },
                      )
                    }
                  >
                    {retained ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    {retained
                      ? 'Approved for controlled implementation'
                      : 'Approve implementation brief'}
                  </button>
                </article>
              );
            })}
          </div>
          <p className="lab-release-boundary">
            Approval records the selection only. Codex, repository checks,
            pull-request review, and release remain separate human-controlled
            stages.
          </p>
        </section>
      )}
    </div>
  );
}

function BehaviouralEvalSummary({
  evaluation,
}: {
  evaluation: BehaviouralEval;
}) {
  return (
    <div className="lab-evidence-summary">
      <span>{evaluation.goal}</span>
      <span>≤ {evaluation.maxActions} actions</span>
      <span>
        {percent(evaluation.baseline.completionRate)} baseline completion
      </span>
      <span>{evaluation.evidenceIds.join(' · ')}</span>
      {evaluation.lastRun && (
        <span>
          Last run: {percent(evaluation.lastRun.completionRate)} ·{' '}
          {evaluation.lastRun.medianActions ?? '—'} median actions
        </span>
      )}
      <details className="w-full">
        <summary>Codex acceptance brief</summary>
        <p className="mt-3 whitespace-pre-line text-sm text-mist">
          {evaluation.codexBrief}
        </p>
      </details>
    </div>
  );
}

function LabMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AgentPopulation({
  experiment,
  selectedRunId,
  onSelectRun,
}: {
  experiment: LabExperiment;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  const queued = Math.max(
    0,
    experiment.populationSize - experiment.runs.length,
  );
  return (
    <div className="lab-agent-grid" aria-label="Synthetic agent population">
      {experiment.runs.map((run) => (
        <button
          type="button"
          key={run.runId}
          className={run.runId === selectedRunId ? 'is-active' : ''}
          onClick={() => onSelectRun(run.runId)}
        >
          <span className={`lab-agent-state state-${run.status}`}>
            <Bot size={15} />
          </span>
          <strong>{personaLabel(run.persona)}</strong>
          <small>
            {run.status} · {run.actions.length} actions
          </small>
        </button>
      ))}
      {Array.from({ length: Math.min(queued, 20) }, (_, index) => (
        <div className="is-queued" key={`queued-${index}`}>
          <span className="lab-agent-state">
            <Bot size={15} />
          </span>
          <strong>Agent {experiment.runs.length + index + 1}</strong>
          <small>queued</small>
        </div>
      ))}
    </div>
  );
}

function RunReplay({ run }: { run: LabAgentRun }) {
  return (
    <section className="surface-panel lab-replay-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">Run replay</p>
          <h2>
            {personaLabel(run.persona)} · {run.taskOutcome}
          </h2>
        </div>
        <div className="lab-run-meta">
          <span>{formatDuration(run.durationMs)}</span>
          <span>
            {run.viewport.width}×{run.viewport.height}
          </span>
          <span>{run.agentModel}</span>
        </div>
      </div>
      <div className="lab-action-timeline">
        {run.actions.map((action) => (
          <article key={action.actionId}>
            <code>{String(action.ordinal).padStart(2, '0')}</code>
            <span className={`lab-action-outcome outcome-${action.outcome}`} />
            <div>
              <strong>
                {action.action} {action.targetId ? `· ${action.targetId}` : ''}
              </strong>
              <p>{action.expectation}</p>
              <small>
                {action.durationMs}ms · {action.outcome} ·{' '}
                {action.telemetryEventIds.length} linked events
              </small>
            </div>
          </article>
        ))}
        {!run.actions.length && (
          <div className="lab-empty">Waiting for the first bounded action.</div>
        )}
      </div>
    </section>
  );
}
