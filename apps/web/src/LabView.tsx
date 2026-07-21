import {
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  type LabAgentRun,
  type LabExperiment,
} from '@darwin/shared';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CircleDashed,
  FlaskConical,
  Sparkles,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { apiFetch } from './api';

interface DarwinLabViewProps {
  apiBaseUrl: string;
  liveReasoningAvailable: boolean;
  // Accepted for compatibility with the dashboard; the server now chooses the
  // configured ProjectFlow target, so the UI no longer needs it.
  defaultTargetUrl?: string;
}

const terminalExperimentStatuses = new Set([
  'completed',
  'analysed',
  'failed',
  'cancelled',
  'archived',
]);

const statusLabel: Record<LabExperiment['status'], string> = {
  draft: 'Preparing',
  awaiting_runner: 'Dispatching agents',
  running: 'Agents working',
  completed: 'Reading what happened',
  analysing: 'Proposing changes',
  analysed: 'Changes ready',
  cancelled: 'Cancelled',
  archived: 'Archived',
  failed: 'Stopped',
};

const activeStatuses = new Set<LabExperiment['status']>([
  'draft',
  'awaiting_runner',
  'running',
  'completed',
  'analysing',
]);

const percent = (value: number) => `${Math.round(value * 100)}%`;

const formatDuration = (durationMs: number | null) =>
  durationMs === null ? '--' : `${(durationMs / 1_000).toFixed(1)}s`;

const personaLabel = (persona: string) =>
  persona
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const goalExamples = [
  'Find the task assigned to me and open it',
  'Create a project called Polaris Launch',
  'Assign a task to a teammate',
];

export function DarwinLabView({
  apiBaseUrl,
  liveReasoningAvailable,
}: DarwinLabViewProps) {
  const [experiments, setExperiments] = useState<LabExperiment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const loadGeneration = useRef(0);
  const analyseAttempted = useRef<Set<string>>(new Set());

  const loadExperiments = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const response = await apiFetch(`${apiBaseUrl}/api/lab/experiments`);
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? 'Darwin Labs could not be loaded.');
    }
    const parsed = LabExperimentsResponseSchema.parse(payload).experiments;
    if (generation !== loadGeneration.current) return;
    setExperiments(parsed);
    setSelectedId((current) =>
      current && parsed.some((item) => item.experimentId === current)
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
            : 'Darwin Labs could not be loaded.',
        ),
      )
      .finally(() => setLoading(false));
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadExperiments]);

  const selected =
    experiments.find((item) => item.experimentId === selectedId) ?? null;
  const selectedRun =
    selected?.runs.find((run) => run.runId === selectedRunId) ??
    selected?.runs.at(-1) ??
    null;
  const anyActive = experiments.some(
    (item) => !terminalExperimentStatuses.has(item.status),
  );

  // Poll while any experiment is mid-flight so the population fills in live.
  useEffect(() => {
    if (!anyActive) return;
    const interval = window.setInterval(() => {
      void loadExperiments().catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [anyActive, loadExperiments]);

  useEffect(() => {
    if (!selected?.runs.length) {
      setSelectedRunId(null);
      return;
    }
    if (!selected.runs.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(selected.runs.at(-1)!.runId);
    }
  }, [selected, selectedRunId]);

  const mutate = useCallback(
    async (action: string, path: string, body?: unknown) => {
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
          throw new Error(payload.message ?? 'Darwin Labs request failed.');
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
          reason instanceof Error
            ? reason.message
            : 'Darwin Labs request failed.',
        );
        return null;
      } finally {
        setWorking(null);
      }
    },
    [apiBaseUrl],
  );

  const sendAgents = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed) return;
    const created = await mutate('create', '/api/lab/experiments', {
      goal: trimmed,
    });
    if (!created) return;
    setGoal('');
    await mutate(
      'start',
      `/api/lab/experiments/${encodeURIComponent(created.experimentId)}/start`,
    );
  };

  // Once agents finish and evidence exists, propose changes automatically so the
  // operator never has to hunt for a "next step" button.
  useEffect(() => {
    if (!selected || !liveReasoningAvailable || working !== null) return;
    if (
      selected.status !== 'completed' ||
      !selected.evidence?.signals.length ||
      selected.analysis ||
      analyseAttempted.current.has(selected.experimentId)
    ) {
      return;
    }
    analyseAttempted.current.add(selected.experimentId);
    void mutate(
      'analyse',
      `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/analyse`,
    );
  }, [selected, liveReasoningAvailable, working, mutate]);

  const selectMutation = async (mutationId: string) => {
    if (!selected) return;
    const updated = await mutate(
      'select',
      `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/mutations/select`,
      { mutationId },
    );
    if (updated) window.location.href = '/?view=mutations';
  };

  const runProgress = selected
    ? selected.runs.filter((run) => run.status !== 'running').length /
      Math.max(selected.populationSize, 1)
    : 0;
  const busy = working !== null;
  const composerDisabled = busy || anyActive;

  return (
    <div className="lab-workspace">
      <header className="lab-page-heading">
        <p className="section-label">Autonomous usability</p>
        <h1>Darwin Labs</h1>
      </header>

      {error && (
        <div className="lab-error" role="alert">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <section className="surface-panel lab-composer">
        <div className="panel-heading">
          <div>
            <p className="section-label">New run</p>
            <h2>Point a team of agents at a goal</h2>
          </div>
          <Bot size={20} className="text-mist" />
        </div>
        <p className="lab-composer-lede">
          Describe what you want done in plain English. A population of browser
          agents attempts it on the real app, and the friction they hit becomes
          evidence-backed changes you can review in Mutations.
        </p>
        <form className="lab-composer-form" onSubmit={(event) => void sendAgents(event)}>
          <textarea
            className="lab-goal-input"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="e.g. Find the task assigned to me and open it"
            rows={2}
            maxLength={300}
            disabled={composerDisabled}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                void sendAgents(event);
              }
            }}
          />
          <button
            className="primary-action"
            type="submit"
            disabled={composerDisabled || !goal.trim()}
          >
            {working === 'create' || working === 'start' ? (
              <CircleDashed className="is-spinning" size={16} />
            ) : (
              <FlaskConical size={16} />
            )}
            Send agents
          </button>
        </form>
        {composerDisabled && anyActive ? (
          <p className="lab-composer-hint">
            Agents are busy on your current goal — one run at a time.
          </p>
        ) : (
          <div className="lab-goal-examples">
            {goalExamples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setGoal(example)}
                disabled={composerDisabled}
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading ? (
        <section className="surface-panel">
          <div className="lab-empty">
            <CircleDashed className="is-spinning" /> Loading Darwin Labs
          </div>
        </section>
      ) : selected ? (
        <section className="surface-panel lab-run-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Latest run</p>
              <h2>{selected.name}</h2>
            </div>
            <span className={`lab-status status-${selected.status}`}>
              {activeStatuses.has(selected.status) ? (
                <CircleDashed className="is-spinning" size={14} />
              ) : selected.status === 'failed' ? (
                <AlertTriangle size={14} />
              ) : (
                <Activity size={14} />
              )}
              {statusLabel[selected.status]}
            </span>
          </div>

          {experiments.length > 1 && (
            <div className="lab-experiment-tabs" aria-label="Recent goals">
              {experiments.slice(0, 5).map((item) => (
                <button
                  key={item.experimentId}
                  type="button"
                  className={
                    item.experimentId === selected.experimentId
                      ? 'is-active'
                      : ''
                  }
                  onClick={() => setSelectedId(item.experimentId)}
                >
                  <span>{item.name}</span>
                  <small>{statusLabel[item.status]}</small>
                </button>
              ))}
            </div>
          )}

          <div className="lab-metrics">
            <LabMetric
              label="Agents"
              value={`${selected.runs.length}/${selected.populationSize}`}
            />
            <LabMetric
              label="Reported done"
              value={
                selected.evidence
                  ? percent(selected.evidence.metrics.completionRate)
                  : '--'
              }
            />
            <LabMetric
              label="Friction signals"
              value={
                selected.evidence
                  ? String(selected.evidence.signals.length)
                  : '--'
              }
            />
            <LabMetric
              label="Proposed changes"
              value={
                selected.analysis
                  ? String(selected.analysis.mutations.length)
                  : '--'
              }
            />
          </div>

          <div className="lab-progress" aria-label="Agent progress">
            <span style={{ width: `${Math.max(2, runProgress * 100)}%` }} />
          </div>

          <div className="lab-population-workspace">
            <AgentPopulation
              experiment={selected}
              onSelectRun={setSelectedRunId}
              selectedRunId={selectedRun?.runId ?? null}
            />
          </div>

          {selected.status === 'failed' && (
            <div className="lab-next-action">
              <div>
                <strong>The agents couldn&rsquo;t get going</strong>
                <span>
                  {selected.error ??
                    'No browser actions were produced. Check that the live model and runner are configured.'}
                </span>
              </div>
            </div>
          )}

          {selected.evidenceError && (
            <div className="lab-error" role="status">
              <AlertTriangle size={16} /> Runs are saved, but reading them
              failed: {selected.evidenceError}
            </div>
          )}

          {selected.status === 'analysing' && (
            <div className="lab-next-action">
              <div>
                <Sparkles size={16} />
                <span>
                  <strong>Turning friction into proposed changes</strong>
                </span>
              </div>
            </div>
          )}

          {selected.evidence &&
            !selected.analysis &&
            selected.status !== 'analysing' &&
            !liveReasoningAvailable && (
              <div className="lab-next-action">
                <div>
                  <strong>Live model unavailable</strong>
                  <span>
                    Agents collected {selected.evidence.signals.length} friction
                    signals, but proposing changes needs the live model.
                  </span>
                </div>
              </div>
            )}

          {selected.analysis && (
            <div className="lab-mutations">
              <p className="lab-analysis-summary">{selected.analysis.summary}</p>
              <div className="lab-mutation-list">
                {selected.analysis.mutations.map((mutation) => {
                  const chosen =
                    selected.selection?.mutationId === mutation.mutationId;
                  return (
                    <article
                      key={mutation.mutationId}
                      className={chosen ? 'is-selected' : ''}
                    >
                      <div className="lab-mutation-head">
                        <h3>{mutation.title}</h3>
                        <span>{Math.round(mutation.confidence * 100)}%</span>
                      </div>
                      <p>{mutation.problem}</p>
                      <button
                        className={chosen ? 'primary-action' : 'secondary-action'}
                        type="button"
                        disabled={busy}
                        onClick={() => void selectMutation(mutation.mutationId)}
                      >
                        {chosen ? 'Continue in Mutations' : 'Use this change'}
                        <ArrowRight size={15} />
                      </button>
                    </article>
                  );
                })}
              </div>
              {selected.selection && (
                <a className="primary-action lab-continue" href="/?view=mutations">
                  Continue in Mutations <ArrowRight size={16} />
                </a>
              )}
            </div>
          )}

          {selectedRun && selectedRun.actions.length > 0 && (
            <RunReplay run={selectedRun} />
          )}
        </section>
      ) : (
        <section className="surface-panel">
          <div className="lab-empty">
            <Bot size={24} /> No runs yet — describe a goal above to send in the
            first agents.
          </div>
        </section>
      )}
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
  const queued = Math.max(0, experiment.populationSize - experiment.runs.length);
  return (
    <div className="lab-agent-grid" aria-label="Darwin Labs agent population">
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
    <section className="lab-replay-embedded lab-replay-panel">
      <div className="panel-heading">
        <div>
          <p className="section-label">What one agent did</p>
          <h2>
            {personaLabel(run.persona)} · {run.taskOutcome}
          </h2>
        </div>
        <div className="lab-run-meta">
          <span>{formatDuration(run.durationMs)}</span>
          <span>
            {run.viewport.width}×{run.viewport.height}
          </span>
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
                {action.durationMs}ms · {action.outcome}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
