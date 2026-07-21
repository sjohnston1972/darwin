import {
  LabExperimentSchema,
  LabExperimentsResponseSchema,
  PROJECTFLOW_LAB_TASKS,
  RepositoryMutationExecutionSchema,
  type BehaviouralEval,
  type LabAgentRun,
  type LabExperiment,
  type LabPersona,
  type RepositoryMutationExecution,
} from '@darwin/shared';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleHelp,
  FlaskConical,
  Play,
  ShieldCheck,
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
import { ProvenanceChip } from './components/ProvenanceChip';

interface DarwinLabViewProps {
  apiBaseUrl: string;
  defaultTargetUrl: string;
  liveReasoningAvailable: boolean;
}

const terminalExperimentStatuses = new Set([
  'completed',
  'analysed',
  'failed',
  'cancelled',
  'archived',
]);
const terminalExecutionStatuses = new Set(['released', 'rejected', 'failed']);

const statusLabel: Record<LabExperiment['status'], string> = {
  draft: 'Draft',
  awaiting_runner: 'Awaiting runner',
  running: 'Population live',
  completed: 'Evidence ready',
  analysing: 'GPT analysing',
  analysed: 'Mutations ready',
  cancelled: 'Cancelled',
  archived: 'Archived',
  failed: 'Stopped',
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

const formatDuration = (durationMs: number | null) =>
  durationMs === null ? '--' : `${(durationMs / 1_000).toFixed(1)}s`;

const personaLabel = (persona: string) =>
  persona
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const labPersonas = [
  'novice',
  'experienced_pm',
  'executive',
  'keyboard_first',
  'mobile',
  'cautious',
  'impatient',
  'search_first',
] as const satisfies readonly LabPersona[];

const personaHelp: Record<LabPersona, string> = {
  novice:
    'Agents with little product familiarity; useful for exposing unclear labels and hidden navigation.',
  experienced_pm:
    'Project-management experts who expect efficient planning and coordination workflows.',
  executive:
    'Outcome-focused agents who scan for concise status, risk, and reporting information.',
  keyboard_first:
    'Agents that prefer keyboard-accessible controls and predictable focus movement.',
  mobile: 'Agents running in an isolated 390 × 844 touch-oriented viewport.',
  cautious:
    'Agents that inspect context before acting and expose ambiguous or risky controls.',
  impatient:
    'Agents that seek the shortest obvious route and surface unnecessary interaction cost.',
  search_first:
    'Agents that try search-led discovery before browsing the information architecture.',
};

function ParameterCaption({ children }: { children: React.ReactNode }) {
  return (
    <span className="lab-parameter-caption">
      {children}
      <CircleHelp size={13} aria-hidden="true" />
    </span>
  );
}

const balancedPersonas = (populationSize: number): Record<LabPersona, number> =>
  Object.fromEntries(
    labPersonas.map((persona, index) => [
      persona,
      Math.floor(populationSize / labPersonas.length) +
        (index < populationSize % labPersonas.length ? 1 : 0),
    ]),
  ) as Record<LabPersona, number>;

const boundedInteger = (
  value: string,
  current: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
) => {
  if (!value.trim()) return current;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : current;
};

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
  const [execution, setExecution] =
    useState<RepositoryMutationExecution | null>(null);
  const [name, setName] = useState('Assigned work discovery');
  const [targetUrl, setTargetUrl] = useState(defaultTargetUrl);
  const [targetAppVersion, setTargetAppVersion] = useState('1.0.0');
  const [taskPresetId, setTaskPresetId] = useState<string>(
    PROJECTFLOW_LAB_TASKS[0].taskId,
  );
  const [populationSize, setPopulationSize] = useState(8);
  const [personaAllocation, setPersonaAllocation] = useState(() =>
    balancedPersonas(8),
  );
  const [maxActions, setMaxActions] = useState(12);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(180);
  const [seed, setSeed] = useState(1859);
  const experimentLoadGeneration = useRef(0);

  const loadExperiments = useCallback(async () => {
    const generation = ++experimentLoadGeneration.current;
    const response = await apiFetch(`${apiBaseUrl}/api/lab/experiments`);
    const payload = (await response.json()) as { message?: string };
    if (!response.ok) {
      throw new Error(payload.message ?? 'Darwin Labs could not be loaded.');
    }
    const parsed = LabExperimentsResponseSchema.parse(payload).experiments;
    if (generation !== experimentLoadGeneration.current) return;
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
            : 'Darwin Labs could not be loaded.',
        ),
      )
      .finally(() => setLoading(false));
    return () => {
      experimentLoadGeneration.current += 1;
    };
  }, [loadExperiments]);

  const selected =
    experiments.find((experiment) => experiment.experimentId === selectedId) ??
    null;
  const taskPreset =
    PROJECTFLOW_LAB_TASKS.find((task) => task.taskId === taskPresetId) ??
    PROJECTFLOW_LAB_TASKS[0];
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

  const selectedExecutionId = selected?.selection?.executionId ?? null;
  useEffect(() => {
    if (!selectedExecutionId) {
      setExecution(null);
      return;
    }
    let active = true;
    setExecution((current) =>
      current?.executionId === selectedExecutionId ? current : null,
    );
    const loadExecution = async (reportError: boolean) => {
      try {
        const response = await apiFetch(
          `${apiBaseUrl}/api/repository-executions/${encodeURIComponent(selectedExecutionId)}`,
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(
            (payload as { message?: string }).message ??
              'Darwin Labs execution could not be loaded.',
          );
        }
        if (active) {
          setExecution(RepositoryMutationExecutionSchema.parse(payload));
        }
      } catch (reason) {
        if (active && reportError) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Darwin Labs execution could not be loaded.',
          );
        }
      }
    };
    void loadExecution(true);
    const terminal =
      execution?.executionId === selectedExecutionId &&
      terminalExecutionStatuses.has(execution.status);
    const interval = terminal
      ? null
      : window.setInterval(() => void loadExecution(false), 3_000);
    return () => {
      active = false;
      if (interval !== null) window.clearInterval(interval);
    };
  }, [
    apiBaseUrl,
    execution?.executionId,
    execution?.status,
    selectedExecutionId,
  ]);

  const mutateExperiment = async (
    action: string,
    path: string,
    body?: unknown,
    method: 'POST' | 'PUT' = 'POST',
  ) => {
    setWorking(action);
    setError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}${path}`, {
        method,
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
  };

  const createExperiment = async (event: FormEvent) => {
    event.preventDefault();
    await mutateExperiment('create', '/api/lab/experiments', {
      name,
      targetUrl,
      targetAppVersion,
      task: taskPreset,
      populationSize,
      personaAllocation: labPersonas
        .map((persona) => ({ persona, count: personaAllocation[persona] }))
        .filter((allocation) => allocation.count > 0),
      maxActions,
      maxDurationMs: maxDurationSeconds * 1_000,
      seed,
    });
  };

  const runProgress = selected
    ? selected.runs.filter((run) => run.status !== 'running').length /
      selected.populationSize
    : 0;

  return (
    <div className="lab-workspace">
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
              <h2>Define a real task</h2>
            </div>
            <Bot size={20} className="text-mist" />
          </div>
          <form
            className="lab-form"
            onSubmit={(event) => void createExperiment(event)}
          >
            <label data-explain="An operator-facing label for this immutable task definition and its resulting population evidence.">
              <ParameterCaption>Experiment name</ParameterCaption>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label data-explain="The real ProjectFlow deployment the browser population will operate. Its exact origin must be explicitly allowlisted.">
              <ParameterCaption>Test or preview target</ParameterCaption>
              <input
                type="url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
              />
            </label>
            <label data-explain="The version attached to every run and telemetry event in this experiment. Mixed versions are rejected from one evidence pack.">
              <ParameterCaption>Exact application version</ParameterCaption>
              <input
                value={targetAppVersion}
                onChange={(event) => setTargetAppVersion(event.target.value)}
              />
            </label>
            <label data-explain="Darwin supports exactly three ProjectFlow tasks whose rendered workflow and hidden success marker are verified against the configured baseline.">
              <ParameterCaption>Verified ProjectFlow task</ParameterCaption>
              <select
                value={taskPresetId}
                onChange={(event) => setTaskPresetId(event.target.value)}
              >
                {PROJECTFLOW_LAB_TASKS.map((task) => (
                  <option key={task.taskId} value={task.taskId}>
                    {task.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="lab-task-card">
              <span>Participant-facing instruction</span>
              <strong>{taskPreset.instruction}</strong>
              <small>
                Starts at {taskPreset.startRoute}; completion requires the{' '}
                {taskPreset.successCriterion.workflowId} workflow marker.
              </small>
            </div>
            <label data-explain="The number of independent isolated browser agents. Larger populations improve coverage but increase model calls and runtime.">
              <ParameterCaption>
                Population <strong>{populationSize} agents</strong>
              </ParameterCaption>
              <input
                type="range"
                min="8"
                max="20"
                value={populationSize}
                onChange={(event) => {
                  const size = boundedInteger(
                    event.target.value,
                    populationSize,
                    8,
                    20,
                  );
                  setPopulationSize(size);
                  setPersonaAllocation(balancedPersonas(size));
                }}
              />
            </label>
            <details className="lab-task-card">
              <summary data-explain="How the population is distributed across behavioural strategies. Allocated agents must total the selected population size.">
                <span className="lab-parameter-caption">
                  Persona allocation ·{' '}
                  {Object.values(personaAllocation).reduce(
                    (total, count) => total + count,
                    0,
                  )}
                  /{populationSize}
                  <CircleHelp size={13} aria-hidden="true" />
                </span>
              </summary>
              <div className="lab-form-grid">
                {labPersonas.map((persona) => (
                  <label key={persona} data-explain={personaHelp[persona]}>
                    <ParameterCaption>{personaLabel(persona)}</ParameterCaption>
                    <input
                      type="number"
                      min="0"
                      max={populationSize}
                      value={personaAllocation[persona]}
                      onChange={(event) =>
                        setPersonaAllocation((current) => ({
                          ...current,
                          [persona]: boundedInteger(
                            event.target.value,
                            current[persona],
                            0,
                            populationSize,
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </details>
            <div className="lab-form-grid">
              <label data-explain="Maximum browser actions per agent. Reaching this bound without satisfying the oracle stops the run safely.">
                <ParameterCaption>Action budget</ParameterCaption>
                <input
                  type="number"
                  min="4"
                  max="30"
                  value={maxActions}
                  onChange={(event) =>
                    setMaxActions(
                      boundedInteger(event.target.value, maxActions, 4, 30),
                    )
                  }
                />
              </label>
              <label data-explain="Maximum wall-clock time per agent. The runner stops work at this bound even when actions remain.">
                <ParameterCaption>Duration budget (seconds)</ParameterCaption>
                <input
                  type="number"
                  min="30"
                  max="600"
                  value={maxDurationSeconds}
                  onChange={(event) =>
                    setMaxDurationSeconds(
                      boundedInteger(
                        event.target.value,
                        maxDurationSeconds,
                        30,
                        600,
                      ),
                    )
                  }
                />
              </label>
              <label data-explain="The deterministic population seed retained with evidence so an equivalent experiment can be reproduced and compared.">
                <ParameterCaption>Seed</ParameterCaption>
                <input
                  type="number"
                  min="1"
                  value={seed}
                  onChange={(event) =>
                    setSeed(boundedInteger(event.target.value, seed, 1))
                  }
                />
              </label>
            </div>
            <div className="lab-task-card">
              <span>Declarative success oracle</span>
              <strong>{taskPreset.successCriterion.workflowId}:success</strong>
              <small>
                No operator JavaScript, shell command, or private field value.
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
              Create Lab task
            </button>
          </form>
        </aside>

        <section className="surface-panel lab-experiment-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Automated population</p>
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
                    <strong>Ready to assign the population</strong>
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
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={working !== null}
                    onClick={() =>
                      void mutateExperiment(
                        'edit',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}`,
                        {
                          name,
                          targetUrl,
                          targetAppVersion,
                          populationSize,
                          personaAllocation: labPersonas
                            .map((persona) => ({
                              persona,
                              count: personaAllocation[persona],
                            }))
                            .filter((allocation) => allocation.count > 0),
                          maxActions,
                          maxDurationMs: maxDurationSeconds * 1_000,
                          seed,
                          task: taskPreset,
                        },
                        'PUT',
                      )
                    }
                  >
                    Save draft
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
                        Rosalind will claim the oldest queued experiment.
                      </small>
                    </span>
                  </div>
                  <code>npm run lab:runner</code>
                </div>
              )}

              <div className="lab-population-workspace">
                <AgentPopulation
                  experiment={selected}
                  onSelectRun={setSelectedRunId}
                  selectedRunId={selectedRun?.runId ?? null}
                />
              </div>
              <div className="lab-release-boundary">
                <button
                  className="secondary-action"
                  type="button"
                  disabled={working !== null}
                  onClick={() =>
                    void mutateExperiment(
                      'duplicate',
                      `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/duplicate`,
                    )
                  }
                >
                  Duplicate task
                </button>
                {['awaiting_runner', 'running'].includes(selected.status) && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      void mutateExperiment(
                        'cancel',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/cancel`,
                      )
                    }
                  >
                    Cancel population
                  </button>
                )}
                {selected.status === 'running' && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      void mutateExperiment(
                        'force-fail',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/force-fail`,
                        {},
                      )
                    }
                  >
                    Force-fail stranded run
                  </button>
                )}
                {['failed', 'cancelled'].includes(selected.status) && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      void mutateExperiment(
                        'retry',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/retry`,
                      )
                    }
                  >
                    Retry as new run
                  </button>
                )}
                {['completed', 'analysed', 'failed', 'cancelled'].includes(
                  selected.status,
                ) && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      void mutateExperiment(
                        'archive',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/archive`,
                        {},
                      )
                    }
                  >
                    <Archive size={15} /> Archive task
                  </button>
                )}
              </div>
              {selectedRun && <RunReplay embedded run={selectedRun} />}
              {selected.evidenceError && (
                <div className="lab-error" role="status">
                  <AlertTriangle size={16} /> Runs are durable, but evidence
                  generation failed: {selected.evidenceError}
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={working !== null}
                    onClick={() =>
                      void mutateExperiment(
                        'rebuild-evidence',
                        `/api/lab/experiments/${encodeURIComponent(selected.experimentId)}/rebuild-evidence`,
                        {},
                      )
                    }
                  >
                    Retry evidence build
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {selected?.evidence && (
        <section className="surface-panel lab-evidence-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Deterministic evidence</p>
              <h2>Selection pressure from real browser traces</h2>
            </div>
            <code>{selected.evidence.evidenceHash.slice(0, 16)}</code>
            <ProvenanceChip provenance={selected.provenance} />
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
                  ? 'Analyse Darwin Labs pressure'
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
        <details className="surface-panel lab-mutation-panel lab-mutation-disclosure">
          <summary>
            <span>
              <strong>Darwin Labs mutation portfolio</strong>
              <small>
                {selected.analysis.mutations.length} evidence-citing candidates
                {selected.selection ? ' · 1 approved' : ' · awaiting approval'}
              </small>
            </span>
            <ChevronRight size={16} />
          </summary>
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
                    <ProvenanceChip provenance={mutation.provenance} />
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
          {selected.selection && !execution && (
            <div className="lab-dispatch-action">
              <a className="primary-action" href="/?view=mutations">
                <ShieldCheck size={16} /> Continue in Mutations
              </a>
              {error && (
                <span className="lab-dispatch-error" role="alert">
                  <AlertTriangle size={15} /> {error}
                </span>
              )}
            </div>
          )}
        </details>
      )}

      {execution && (
        <section className="surface-panel lab-mutation-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Controlled implementation</p>
              <h2>Real ProjectFlow repository execution</h2>
            </div>
            <ProvenanceChip provenance={execution.provenance} />
          </div>
          <div className="lab-evidence-summary">
            <span>{execution.status.replaceAll('_', ' ')}</span>
            <span>{execution.branch}</span>
            <span>manifest {execution.manifestId.slice(0, 20)}</span>
          </div>
          {execution.pullRequestUrl && (
            <a
              className="primary-action"
              href={execution.pullRequestUrl}
              target="_blank"
              rel="noreferrer"
            >
              Review ProjectFlow pull request
            </a>
          )}
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

function RunReplay({
  run,
  embedded = false,
}: {
  run: LabAgentRun;
  embedded?: boolean;
}) {
  return (
    <section
      className={`${embedded ? 'lab-replay-embedded' : 'surface-panel'} lab-replay-panel`}
    >
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
