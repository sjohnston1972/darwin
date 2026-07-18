import {
  HealthResponseSchema,
  TargetApplicationConnectionSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidenceMutationCandidate,
  type EvidencePack,
  type ObservationArchive,
  type RepositoryMutationExecution,
  type RepositoryRollback,
  type StoredTelemetryEvent,
  type TargetApplicationConnection,
  type TargetConnectionRequest,
} from '@darwin/shared';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  Box,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CircleDashed,
  ClipboardCheck,
  Code2,
  Database,
  Dna,
  FileCheck2,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Github,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Moon,
  MousePointer2,
  Network,
  Link2,
  Radar,
  Rocket,
  RotateCcw,
  Server,
  ShieldCheck,
  Sun,
  Users,
  Unplug,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';

import {
  useLiveTelemetry,
  type LiveTelemetryState,
} from './telemetry/useLiveTelemetry';
import { apiFetch, getOperatorToken, setOperatorToken } from './api';

type HealthState = 'checking' | 'online' | 'offline';
type Theme = 'dark' | 'light';

interface ApiHealthState {
  status: HealthState;
  version: string | null;
  analysis: {
    mode: 'live';
    model: string;
    liveModelAvailable: boolean;
  } | null;
}

const navItems = [
  {
    label: 'Control room',
    icon: LayoutDashboard,
  },
  {
    label: 'Target application',
    icon: Box,
  },
  {
    label: 'Observations',
    icon: Radar,
  },
  {
    label: 'Mutations',
    icon: FlaskConical,
  },
  {
    label: 'Genome',
    icon: Dna,
  },
] as const;

type DashboardView = (typeof navItems)[number]['label'] | 'System status';

const dashboardRoutes: Record<DashboardView, string> = {
  'Control room': '/',
  'Target application': '/?view=target',
  Observations: '/?view=observations',
  Mutations: '/?view=mutations',
  'System status': '/?view=status',
  Genome: '/?view=genome',
};

function getDashboardView(): DashboardView {
  switch (new URLSearchParams(window.location.search).get('view')) {
    case 'target':
      return 'Target application';
    case 'observations':
      return 'Observations';
    case 'mutations':
      return 'Mutations';
    case 'status':
      return 'System status';
    case 'genome':
    case 'fossil':
      return 'Genome';
    default:
      return 'Control room';
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';
const projectFlowBaseUrl =
  import.meta.env.VITE_PROJECTFLOW_BASE_URL ?? 'http://localhost:5174';
const configuredTarget: TargetConnectionRequest = {
  fullName: 'sjohnston1972/projectflow',
  branch: 'main',
  productionUrl: `${projectFlowBaseUrl}/`,
  studyUrl: `${projectFlowBaseUrl}/?study=true`,
};

interface FitnessDelta {
  completionPoints: number;
  interactionDelta: number | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[midpoint]!
    : (ordered[midpoint - 1]! + ordered[midpoint]!) / 2;
}

function compareFitness(
  baseline: EvidencePack | null,
  current: EvidencePack | null,
): FitnessDelta | null {
  if (!baseline || !current || baseline.evidenceId === current.evidenceId) {
    return null;
  }

  const terminalOutcomes = new Set(['success', 'failed', 'abandoned']);
  const baselineTerminal = baseline.taskAttempts.filter((attempt) =>
    terminalOutcomes.has(attempt.outcome),
  );
  const currentTerminal = current.taskAttempts.filter((attempt) =>
    terminalOutcomes.has(attempt.outcome),
  );
  if (!baselineTerminal.length || !currentTerminal.length) return null;

  const completionRate = (attempts: typeof baselineTerminal) =>
    attempts.filter((attempt) => attempt.outcome === 'success').length /
    attempts.length;
  const baselineInteractions = median(
    baselineTerminal.map((attempt) => attempt.interactionCount),
  );
  const currentInteractions = median(
    currentTerminal.map((attempt) => attempt.interactionCount),
  );

  return {
    completionPoints: Math.round(
      (completionRate(currentTerminal) - completionRate(baselineTerminal)) *
        100,
    ),
    interactionDelta:
      baselineInteractions === null || currentInteractions === null
        ? null
        : Math.round((currentInteractions - baselineInteractions) * 10) / 10,
  };
}

function signedNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

function DarwinDashboard() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const [health, setHealth] = useState<ApiHealthState>({
    status: 'checking',
    version: null,
    analysis: null,
  });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const activeView = getDashboardView();
  const targetConnection = useTargetConnection();
  const liveTelemetry = useLiveTelemetry();
  const repository =
    targetConnection.connection?.repository ??
    liveTelemetry.execution?.repository ??
    liveTelemetry.analysis?.repository ??
    undefined;
  const rollback = liveTelemetry.execution?.rollback;
  const rollbackPreviewUrl =
    rollback && ['preview_ready', 'releasing'].includes(rollback.status)
      ? rollback.previewUrl
      : null;
  const targetApplicationUrl =
    rollbackPreviewUrl ??
    (liveTelemetry.execution?.previewUrl &&
    ['preview_ready', 'releasing'].includes(liveTelemetry.execution.status)
      ? liveTelemetry.execution.previewUrl
      : (targetConnection.connection?.repository.studyUrl ??
        repository?.studyUrl)) ??
    `${projectFlowBaseUrl}/?study=true`;
  const executionCommit =
    liveTelemetry.execution &&
    ['preview_ready', 'releasing', 'released'].includes(
      liveTelemetry.execution.status,
    )
      ? liveTelemetry.execution.headSha
      : null;
  const rollbackCommit =
    rollback?.status === 'released' ? rollback.headSha : null;
  const activeCommit =
    rollbackCommit ??
    executionCommit ??
    targetConnection.connection?.repository.baseSha ??
    repository?.baseSha;
  const activeGenomeStage =
    rollback?.status === 'released'
      ? 'rollback released'
      : rollback
        ? `rollback ${rollback.status}`
        : (liveTelemetry.execution?.status ?? 'measured baseline');
  const mutationArchived =
    liveTelemetry.execution?.status === 'released' &&
    (!rollback || ['failed', 'released'].includes(rollback.status));
  const activeGenomeLoci = repository
    ? [
        { locus: 'Repository', value: repository.fullName },
        { locus: 'Tracked branch', value: repository.branch },
        {
          locus: 'Active commit',
          value: activeCommit?.slice(0, 12) ?? 'awaiting release',
        },
        { locus: 'Source snapshot', value: repository.sourceHash.slice(0, 16) },
        {
          locus: 'Mutable surface',
          value: `${repository.mutablePaths.length} bounded source paths`,
        },
      ]
    : [];
  const resetDemo = () => liveTelemetry.resetEvolution();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('darwin-theme', theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f4f7fb' : '#101211');
  }, [theme]);
  const recentSessions = new Set(
    liveTelemetry.events.map((event) => event.sessionId),
  ).size;
  const recentParticipants = new Set(
    liveTelemetry.events.map((event) => event.participantId),
  ).size;
  const latestReleasedExecution = liveTelemetry.genomeExecutions.find(
    (execution) => execution.status === 'released',
  );
  const latestArchivedEvidence = latestReleasedExecution
    ? (liveTelemetry.observationArchives.find(
        (archive) =>
          archive.execution.executionId === latestReleasedExecution.executionId,
      )?.evidence ?? null)
    : null;
  const fitnessDelta = compareFitness(
    latestArchivedEvidence,
    liveTelemetry.evidence,
  );
  const pressureClusters =
    liveTelemetry.analysis?.evidenceAssessment.pressureClusters ?? [];
  const highSeveritySignals =
    liveTelemetry.evidence?.frictionSignals.filter(
      (signal) => signal.severity === 'high',
    ).length ?? 0;
  const releaseForConfidence =
    liveTelemetry.execution ?? latestReleasedExecution ?? null;
  const passedChecks = releaseForConfidence?.checks.filter(
    (check) => check.status === 'passed',
  ).length;
  const totalChecks = releaseForConfidence?.checks.length ?? 0;
  const releaseRolledBack =
    releaseForConfidence?.rollback?.status === 'released';
  const releaseConfidence = !releaseForConfidence
    ? {
        value: '--',
        meta: 'No repository mutation to validate',
        tone: 'neutral',
      }
    : releaseRolledBack
      ? {
          value: 'REVERTED',
          meta: 'The retained release was rolled back',
          tone: 'amber',
        }
      : releaseForConfidence.status === 'failed'
        ? {
            value: 'HOLD',
            meta: 'Repository execution requires attention',
            tone: 'amber',
          }
        : totalChecks
          ? {
              value:
                releaseForConfidence.status === 'released' &&
                passedChecks === totalChecks
                  ? '100%'
                  : `${passedChecks}/${totalChecks}`,
              meta:
                releaseForConfidence.status === 'released'
                  ? `${passedChecks}/${totalChecks} repository checks passed`
                  : `${passedChecks}/${totalChecks} checks passed before release`,
              tone:
                passedChecks === totalChecks ? 'signal' : ('amber' as const),
            }
          : {
              value: 'PENDING',
              meta: 'Repository checks have not reported yet',
              tone: 'neutral',
            };

  const metrics = [
    {
      label: 'Measured events',
      help: 'Semantic events emitted by real ProjectFlow browser sessions and persisted in D1.',
      value: liveTelemetry.count.toLocaleString('en-US'),
      meta: liveTelemetry.count
        ? 'Measured ProjectFlow behavior'
        : 'Awaiting a real session',
      tone: liveTelemetry.count ? 'signal' : 'neutral',
    },
    {
      label: 'Measured sessions',
      help: 'Independent browser journeys represented by the current live event window.',
      value: String(recentSessions),
      meta: `${recentParticipants} anonymous participants`,
      tone: recentSessions ? 'signal' : 'neutral',
    },
    {
      label: 'Evidence strength',
      help: 'Server-derived coverage score based on event volume, independent sessions, participants, and completed attempts.',
      value: liveTelemetry.evidence
        ? `${liveTelemetry.evidence.quality.score}`
        : '--',
      meta: liveTelemetry.evidence
        ? `${liveTelemetry.evidence.quality.strength} evidence`
        : 'Generate an evidence pack',
      tone:
        liveTelemetry.evidence?.quality.strength === 'substantial'
          ? 'signal'
          : 'amber',
    },
    {
      label: 'Selection pressure',
      help: 'Friction that survives evidence parsing. Once GPT reasoning is run, related signals are grouped into pressure clusters that drive mutation choices.',
      value: liveTelemetry.analysis
        ? String(pressureClusters.length)
        : liveTelemetry.evidence
          ? String(liveTelemetry.evidence.frictionSignals.length)
          : '--',
      meta: liveTelemetry.analysis
        ? `${highSeveritySignals} high-severity signals across GPT clusters`
        : liveTelemetry.evidence
          ? `${highSeveritySignals} high-severity signals · GPT grouping pending`
          : liveTelemetry.behaviorSignalCount
            ? `${liveTelemetry.behaviorSignalCount} behavioral signals awaiting evidence`
            : 'Awaiting observed behavior',
      tone: liveTelemetry.analysis
        ? 'signal'
        : liveTelemetry.evidence
          ? 'amber'
          : 'neutral',
    },
    {
      label: 'Live reasoning',
      help: 'The current measured evidence portfolio produced by the configured OpenAI model. Darwin never substitutes an invented recommendation.',
      value: liveTelemetry.analysis ? 'READY' : '--',
      meta: liveTelemetry.analysis
        ? `${liveTelemetry.analysis.alternatives.length + 1} mutations scored`
        : health.analysis?.liveModelAvailable
          ? `${health.analysis.model} available`
          : 'Live model unavailable',
      tone: liveTelemetry.analysis ? 'signal' : 'neutral',
    },
    {
      label: 'Fitness delta',
      help: 'A measured post-release comparison between the archived evidence that informed the retained mutation and the current evidence cycle. Darwin reports completion-rate change only when both samples contain completed task attempts.',
      value: fitnessDelta
        ? `${signedNumber(fitnessDelta.completionPoints)} pp`
        : latestArchivedEvidence
          ? 'PENDING'
          : '--',
      meta: fitnessDelta
        ? fitnessDelta.interactionDelta === null
          ? 'Task completion versus archived baseline'
          : `Median path ${signedNumber(fitnessDelta.interactionDelta)} actions versus baseline`
        : latestArchivedEvidence
          ? 'Awaiting completed task attempts in the new cycle'
          : 'Retain a mutation to establish a baseline',
      tone: fitnessDelta
        ? fitnessDelta.completionPoints > 0
          ? 'signal'
          : fitnessDelta.completionPoints < 0
            ? 'amber'
            : 'neutral'
        : 'neutral',
    },
    {
      label: 'Release confidence',
      help: 'A live state derived only from the recorded GitHub repository execution and its validation checks. It does not predict a release outcome.',
      value: releaseConfidence.value,
      meta: releaseConfidence.meta,
      tone: releaseConfidence.tone,
    },
    {
      label: 'Genome evolutions',
      help: 'Accepted mutation bundles retained in the Genome. This increases only after a reviewed repository mutation is released; a rollback does not create another evolution.',
      value: String(liveTelemetry.genomeEvolutionCount),
      meta: liveTelemetry.genomeEvolutionCount
        ? `${liveTelemetry.genomeEvolutionCount} accepted ${liveTelemetry.genomeEvolutionCount === 1 ? 'release' : 'releases'}`
        : 'No accepted releases',
      tone: liveTelemetry.genomeEvolutionCount ? 'signal' : 'neutral',
    },
  ] as const;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Health request failed');
        const parsed = HealthResponseSchema.safeParse(await response.json());
        setHealth(
          parsed.success
            ? {
                status: 'online',
                version: parsed.data.version,
                analysis: parsed.data.analysis,
              }
            : { status: 'offline', version: null, analysis: null },
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setHealth({ status: 'offline', version: null, analysis: null });
      });

    return () => controller.abort();
  }, []);

  if (activeView === 'Target application') {
    return (
      <div className="min-h-screen bg-carbon text-white">
        <GlobalExplainTooltip />
        <DashboardSidebar
          activeView="Target application"
          health={health}
          navigationOpen={navigationOpen}
          onClose={() => setNavigationOpen(false)}
        />
        {navigationOpen && (
          <button
            className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
            type="button"
          />
        )}
        <main className="lg:pl-[248px]">
          <header className="topbar">
            <button
              className="icon-button lg:hidden"
              type="button"
              onClick={() => setNavigationOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div className="flex items-center gap-2 text-xs text-mist">
              <span className="hidden sm:inline">Workspace</span>
              <ChevronRight className="hidden sm:block" size={14} />
              <span className="font-mono text-white">Target application</span>
            </div>
            <div className="ml-auto flex items-center gap-2 border-l border-line pl-4 text-xs text-mist">
              <span
                className="controlled-mode-status"
                data-explain="Controlled mode verifies a bounded repository contract before Darwin can reason over source or execute a mutation."
                tabIndex={0}
              >
                <ShieldCheck size={15} className="text-signal" />
                <span>Controlled mode</span>
              </span>
              <ThemeToggle theme={theme} onChange={setTheme} />
            </div>
          </header>
          <TargetConnectionView
            connection={targetConnection.connection}
            error={targetConnection.error}
            loading={targetConnection.loading}
            saving={targetConnection.saving}
            onConnect={targetConnection.connect}
            onDisconnect={targetConnection.disconnect}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-carbon text-white">
      <GlobalExplainTooltip />
      <DashboardSidebar
        activeView={activeView}
        health={health}
        navigationOpen={navigationOpen}
        onClose={() => setNavigationOpen(false)}
      />

      {navigationOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
          type="button"
        />
      )}

      <main className="lg:pl-[248px]" id="top">
        <header className="topbar">
          <button
            className="icon-button lg:hidden"
            type="button"
            onClick={() => setNavigationOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={19} />
          </button>
          <div className="flex items-center gap-2 text-xs text-mist">
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight className="hidden sm:block" size={14} />
            <span className="font-mono text-white">{activeView}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 border-l border-line pl-4 text-xs text-mist">
            <span
              className="controlled-mode-status"
              data-explain="Controlled mode requires human approval and uses a bounded target, diff, validation workflow, and explicit release step."
              tabIndex={0}
            >
              <ShieldCheck size={15} className="text-signal" />
              <span>Controlled mode</span>
            </span>
            <ThemeToggle theme={theme} onChange={setTheme} />
            <button
              className="icon-button"
              type="button"
              onClick={() => void resetDemo()}
              disabled={false}
              aria-label="Reset evolution demo"
              data-explain="Delete Darwin telemetry, evidence, reasoning, manifests and execution state, then dispatch the ProjectFlow baseline restore workflow."
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1640px] px-5 pb-12 pt-8 sm:px-8 lg:px-10 lg:pt-11">
          {activeView === 'Control room' && (
            <>
              <section className="hero-band" aria-labelledby="page-title">
                <img
                  className="hero-dna-visual"
                  src="/assets/darwin-dna-wireframe.webp"
                  alt=""
                  aria-hidden="true"
                />
                <div className="relative z-10 max-w-3xl">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-signal">
                    <Activity size={15} /> Control room
                    <InfoTip text="Darwin's operator view: observe behavior, ask the configured analyzer for one mutation, approve it, validate it, and retain or reject it." />
                  </div>
                  <h1
                    id="page-title"
                    className="mt-5 text-4xl font-semibold sm:text-5xl lg:text-[56px] lg:leading-[1.05]"
                  >
                    Darwin
                  </h1>
                  <p className="mt-3 text-xl text-white sm:text-2xl">
                    Helping your software evolve.
                  </p>
                  <p className="mt-5 max-w-2xl text-sm leading-6 text-mist sm:text-base">
                    {targetConnection.connection
                      ? 'ProjectFlow is connected. Its genome is ready for observation, measurement, and controlled selection.'
                      : 'Connect ProjectFlow to verify its repository genome, measured runtime, and controlled mutation boundary.'}
                  </p>
                </div>
                <div className="hero-actions relative z-10 mt-8 flex flex-wrap items-center gap-4 lg:mt-0 lg:self-end">
                  <div className="start-action-wrap">
                    {!liveTelemetry.count && (
                      <span className="start-here-cue" aria-hidden="true">
                        Start here <ArrowDown size={15} />
                      </span>
                    )}
                    <a
                      className="primary-action"
                      href={targetApplicationUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-explain="Open the real ProjectFlow study. Every recommendation in the standard Darwin flow begins with measured interaction evidence from this application."
                    >
                      <Radar size={17} /> Open measured study
                    </a>
                  </div>
                  {!liveTelemetry.analysis && (
                    <span className="demo-status status-idle">
                      <Activity size={15} />
                      {liveTelemetry.evidence
                        ? `${liveTelemetry.evidence.frictionSignals.length} pressures ready for GPT`
                        : liveTelemetry.count
                          ? `${liveTelemetry.count} measured events`
                          : 'Awaiting measured behavior'}
                    </span>
                  )}
                </div>
              </section>

              <section
                className="metric-grid"
                aria-label="Target application metrics"
              >
                {metrics.map((metric) => (
                  <article className="metric-card" key={metric.label}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="metric-label">
                        <p className="text-sm text-mist">{metric.label}</p>
                        <InfoTip text={metric.help} />
                      </div>
                      <span
                        className={`metric-indicator indicator-${metric.tone}`}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-5 font-mono text-3xl font-medium sm:text-[34px]">
                      {metric.value}
                    </p>
                    <p className="mt-2 text-xs text-mist">{metric.meta}</p>
                  </article>
                ))}
              </section>
            </>
          )}

          {activeView !== 'Control room' && (
            <WorkspaceHeading activeView={activeView} />
          )}

          {activeView === 'Observations' && (
            <>
              <LiveTelemetryPanel
                telemetry={liveTelemetry}
                analysisConfig={health.analysis}
                mode="observations"
              />
              {liveTelemetry.observationArchives.length > 0 && (
                <ObservationArchivePanel
                  archives={liveTelemetry.observationArchives}
                />
              )}
            </>
          )}

          {activeView === 'Mutations' &&
            (mutationArchived && liveTelemetry.execution ? (
              <MutationWorkspaceReset execution={liveTelemetry.execution} />
            ) : (
              <>
                <LiveTelemetryPanel
                  telemetry={liveTelemetry}
                  analysisConfig={health.analysis}
                  mode="mutations"
                />
                {liveTelemetry.execution && (
                  <RepositoryExecutionWorkspace
                    execution={liveTelemetry.execution}
                    manifest={liveTelemetry.manifest}
                    releasing={liveTelemetry.releasingExecution}
                    retrying={liveTelemetry.implementing}
                    rollingBack={liveTelemetry.rollingBack}
                    releasingRollback={liveTelemetry.releasingRollback}
                    onRelease={() => void liveTelemetry.releaseExecution()}
                    onRollback={() => void liveTelemetry.startRollback()}
                    onReleaseRollback={() =>
                      void liveTelemetry.releaseRollback()
                    }
                    onRetry={() =>
                      void liveTelemetry.startControlledEvolution(
                        liveTelemetry.manifest?.mutationIds ??
                          (liveTelemetry.manifest
                            ? [liveTelemetry.manifest.mutationId]
                            : []),
                      )
                    }
                  />
                )}
              </>
            ))}

          {activeView === 'System status' && (
            <section className="mt-8 grid gap-8 lg:grid-cols-2">
              <aside
                className="surface-panel"
                aria-labelledby="system-status-title"
              >
                <div className="panel-heading">
                  <div>
                    <p className="section-label">System status</p>
                    <div className="heading-with-help">
                      <h2
                        id="system-status-title"
                        className="mt-2 text-xl font-semibold"
                      >
                        {health.status === 'online'
                          ? 'Runtime connected'
                          : health.status === 'offline'
                            ? 'Runtime unavailable'
                            : 'Checking runtime'}
                      </h2>
                      <InfoTip text="Live status returned by the Cloudflare Worker and D1-backed telemetry pipeline, plus the active target application state." />
                    </div>
                  </div>
                  <Network size={19} className="text-mist" />
                </div>
                <div className="divide-y divide-line px-5 sm:px-6">
                  <StatusRow
                    icon={Server}
                    label="Worker API"
                    value={
                      health.version
                        ? `v${health.version} online`
                        : health.status
                    }
                    ready={health.status === 'online'}
                    help="The deployed Darwin Cloudflare Worker. Its version comes from the live /api/health response."
                  />
                  <StatusRow
                    icon={Database}
                    label="D1 telemetry"
                    value={
                      liveTelemetry.status === 'live'
                        ? `${liveTelemetry.count} events`
                        : liveTelemetry.status
                    }
                    ready={liveTelemetry.status === 'live'}
                    help="Semantic events currently persisted and returned by the telemetry repository. Production uses Cloudflare D1."
                  />
                  <StatusRow
                    icon={FileCheck2}
                    label="Evidence engine"
                    value={
                      liveTelemetry.evidence
                        ? `parser ${liveTelemetry.evidence.parserVersion} · ${liveTelemetry.evidence.frictionSignals.length} signals`
                        : 'awaiting evidence'
                    }
                    ready={liveTelemetry.evidence !== null}
                    help="The deterministic TypeScript parser that reconstructs attempts and converts raw events into bounded, citeable friction signals."
                  />
                  <StatusRow
                    icon={GitBranch}
                    label="Active genome"
                    value={
                      activeCommit
                        ? `${activeCommit.slice(0, 12)} · ${activeGenomeStage}`
                        : 'awaiting repository snapshot'
                    }
                    ready={repository !== undefined}
                    help="The exact ProjectFlow Git commit currently retained on the tracked branch. Candidate commits remain review-only until their pull request is released."
                  />
                </div>
              </aside>

              <aside
                className="surface-panel"
                aria-labelledby="variant-summary-title"
              >
                <div className="panel-heading">
                  <div>
                    <p className="section-label">Genome state</p>
                    <div className="heading-with-help">
                      <h2
                        id="variant-summary-title"
                        className="mt-2 text-xl font-semibold"
                      >
                        Repository genome · {activeCommit?.slice(0, 12) ?? '--'}
                      </h2>
                      <InfoTip text="The immutable repository snapshot used by GPT and Codex. The active commit changes only after a reviewed pull request is merged." />
                    </div>
                  </div>
                  <Code2 size={19} className="text-mist" />
                </div>
                <div
                  className="genome-comparison"
                  role="table"
                  aria-label="Active genome configuration"
                >
                  <div className="genome-comparison-header" role="row">
                    <span role="columnheader">Locus</span>
                    <strong className="is-active" role="columnheader">
                      {activeGenomeStage}
                    </strong>
                  </div>
                  {activeGenomeLoci.map((row) => (
                    <div
                      className="genome-comparison-row"
                      key={row.locus}
                      role="row"
                    >
                      <span role="cell">{row.locus}</span>
                      <code className="is-active" role="cell">
                        {row.value}
                      </code>
                    </div>
                  ))}
                  <div className="genome-comparison-source">
                    <Code2 size={13} /> Live GitHub repository state
                  </div>
                </div>
              </aside>
            </section>
          )}

          {activeView === 'Genome' && (
            <section
              className="mt-8 surface-panel"
              id="genome-record"
              aria-labelledby="genome-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="section-label">Evolution history</p>
                  <div className="heading-with-help">
                    <h2
                      id="genome-title"
                      className="mt-2 text-xl font-semibold"
                    >
                      Genome
                    </h2>
                    <InfoTip text="The retained genome history, including the measured evidence, code mutation, validation, release state, and any controlled rollback." />
                  </div>
                </div>
                <Dna size={19} className="text-mist" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-line text-xs uppercase text-mist">
                    <tr>
                      <th className="px-6 py-3 font-medium">Genome</th>
                      <th className="px-6 py-3 font-medium">Mutation</th>
                      <th className="px-6 py-3 font-medium">Selection</th>
                      <th className="px-6 py-3 font-medium">Fitness</th>
                      <th className="px-6 py-3 text-right font-medium">
                        State
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-6 py-5 font-mono">v0.1</td>
                      <td className="px-6 py-5 text-mist">
                        Foundation established
                      </td>
                      <td className="px-6 py-5 text-mist">Baseline</td>
                      <td className="px-6 py-5 font-mono text-mist">--</td>
                      <td className="px-6 py-5 text-right">
                        <span className="status-badge">RETAINED</span>
                      </td>
                    </tr>
                    {!liveTelemetry.genomeExecutions.length && (
                      <tr className="border-t border-line">
                        <td className="px-6 py-5 font-mono">
                          {repository?.baseSha.slice(0, 12) ?? 'baseline'}
                        </td>
                        <td className="px-6 py-5 text-mist">
                          ProjectFlow repository snapshot connected
                        </td>
                        <td className="px-6 py-5 text-mist">Baseline</td>
                        <td className="px-6 py-5 font-mono text-mist">--</td>
                        <td className="px-6 py-5 text-right">
                          <span className="status-badge">CURRENT</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {liveTelemetry.genomeExecutions.map((genomeExecution) => (
                <FossilExecutionArtifact
                  key={genomeExecution.executionId}
                  execution={genomeExecution}
                  mutationTitle={
                    liveTelemetry.observationArchives.find(
                      (archive) =>
                        archive.execution.executionId ===
                        genomeExecution.executionId,
                    )?.analysis.selectedMutation.title ?? null
                  }
                  manifest={
                    liveTelemetry.execution?.executionId ===
                    genomeExecution.executionId
                      ? liveTelemetry.manifest
                      : null
                  }
                  releasing={liveTelemetry.releasingExecution}
                  retrying={liveTelemetry.implementing}
                  rollingBack={liveTelemetry.rollingBack}
                  releasingRollback={liveTelemetry.releasingRollback}
                  onRelease={() =>
                    void liveTelemetry.releaseExecution(
                      genomeExecution.executionId,
                    )
                  }
                  onRollback={() =>
                    void liveTelemetry.startRollback(
                      genomeExecution.executionId,
                    )
                  }
                  onReleaseRollback={() =>
                    void liveTelemetry.releaseRollback(
                      genomeExecution.executionId,
                    )
                  }
                  onRetry={() =>
                    void liveTelemetry.startControlledEvolution(
                      liveTelemetry.manifest?.mutationIds ??
                        (liveTelemetry.manifest
                          ? [liveTelemetry.manifest.mutationId]
                          : []),
                    )
                  }
                />
              ))}
            </section>
          )}

          <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
            <p>ProjectFlow / controlled evolution environment</p>
            <p className="font-mono">
              DARWIN CORE {health.version ?? 'OFFLINE'}
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

function useTargetConnection() {
  const [connection, setConnection] =
    useState<TargetApplicationConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`${apiBaseUrl}/api/target-connection`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 204) return null;
        if (!response.ok) throw new Error('Target connection lookup failed.');
        return TargetApplicationConnectionSchema.parse(await response.json());
      })
      .then((result) => setConnection(result))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError')
          return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'Target connection lookup failed.',
        );
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const connect = async (request: TargetConnectionRequest) => {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/target-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Target verification failed.');
      }
      setConnection(TargetApplicationConnectionSchema.parse(payload));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Target verification failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch(
        `${apiBaseUrl}/api/target-connection/disconnect`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Target disconnect failed.');
      setConnection(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Target disconnect failed.',
      );
    } finally {
      setSaving(false);
    }
  };

  return { connection, loading, saving, error, connect, disconnect };
}

function WorkspaceHeading({ activeView }: { activeView: DashboardView }) {
  const content: Record<
    Exclude<DashboardView, 'Control room' | 'Target application'>,
    { eyebrow: string; title: string; description: string }
  > = {
    Observations: {
      eyebrow: 'Measured behavior',
      title: 'Observations',
      description:
        'Review the real ProjectFlow sessions, interaction signals, and evidence Darwin can cite.',
    },
    Mutations: {
      eyebrow: 'Controlled selection',
      title: 'Mutations',
      description:
        'Reason over verified evidence, compare candidates, and supervise the bounded Codex implementation.',
    },
    'System status': {
      eyebrow: 'Runtime and genome',
      title: 'System status',
      description:
        'Inspect the live Darwin services and the immutable ProjectFlow source snapshot used for selection.',
    },
    Genome: {
      eyebrow: 'Genome history',
      title: 'Genome',
      description:
        'Review retained code mutations, their validation evidence, and controlled rollback history.',
    },
  };
  const view = content[activeView as keyof typeof content];

  if (!view) return null;
  return (
    <section className="border-b border-line pb-8">
      <p className="section-label">{view.eyebrow}</p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{view.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-mist sm:text-base">
        {view.description}
      </p>
    </section>
  );
}

function DashboardSidebar({
  activeView,
  health,
  navigationOpen,
  onClose,
}: {
  activeView: DashboardView;
  health: ApiHealthState;
  navigationOpen: boolean;
  onClose: () => void;
}) {
  return (
    <aside className={navigationOpen ? 'sidebar sidebar-open' : 'sidebar'}>
      <div className="flex h-20 items-center justify-between border-b border-line px-5">
        <a
          className="flex items-center gap-3"
          href="/"
          aria-label="Darwin control room"
        >
          <DarwinMark />
          <span className="text-[17px] font-semibold tracking-[0.16em]">
            DARWIN
          </span>
        </a>
        <button
          className="icon-button lg:hidden"
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-6" aria-label="Primary navigation">
        <p className="section-label px-3">Workspace</p>
        <ul className="mt-3 space-y-1">
          {navItems.map(({ label, icon: Icon }) => {
            const active = label === activeView;
            const href = dashboardRoutes[label];

            return (
              <li key={label}>
                <a
                  className={active ? 'nav-item nav-item-active' : 'nav-item'}
                  href={href}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                  {active && (
                    <span
                      className="ml-auto h-1.5 w-1.5 bg-signal"
                      aria-hidden="true"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3 px-2 py-2">
          <span
            className={`status-dot status-${health.status}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Darwin API</p>
            <p className="mt-0.5 text-xs capitalize text-mist">
              {health.version
                ? `v${health.version} ${health.status}`
                : health.status}
            </p>
          </div>
          <a
            className="icon-button ml-auto"
            href={dashboardRoutes['System status']}
            onClick={onClose}
            aria-label="Open system status"
            aria-current={activeView === 'System status' ? 'page' : undefined}
            title="Open system status"
          >
            <Server size={16} />
          </a>
        </div>
      </div>
    </aside>
  );
}

function TargetConnectionView({
  connection,
  error,
  loading,
  saving,
  onConnect,
  onDisconnect,
}: {
  connection: TargetApplicationConnection | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  onConnect: (request: TargetConnectionRequest) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [request, setRequest] = useState<TargetConnectionRequest>(() => ({
    ...configuredTarget,
  }));
  const update = (field: keyof TargetConnectionRequest, value: string) =>
    setRequest((current) => ({ ...current, [field]: value }));
  const githubUrl = `https://github.com/${request.fullName.trim()}`;

  return (
    <div className="target-connect-main">
      <section className="target-connect-intro">
        <p className="section-label">Repository onboarding</p>
        <div className="target-connect-title-row">
          <div>
            <h1>Connect a target application</h1>
            <p>
              Give Darwin a GitHub repository and measured deployment. Darwin
              verifies the target contract before it observes telemetry, reasons
              over source, or prepares a mutation.
            </p>
          </div>
        </div>
      </section>

      <ol className="connection-steps" aria-label="Connection verification">
        {[
          ['01', 'Repository', 'Read the exact GitHub commit'],
          ['02', 'Contract', 'Validate darwin.target.json'],
          ['03', 'Runtime', 'Reach the Cloudflare deployment'],
          ['04', 'Ready', 'Bind telemetry and mutations'],
        ].map(([number, label, detail]) => (
          <li className={connection ? 'is-complete' : ''} key={number}>
            <span>{connection ? <Check size={14} /> : number}</span>
            <div>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          </li>
        ))}
      </ol>

      <section className="connection-workspace">
        <form
          className="connection-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onConnect(request);
          }}
        >
          <div className="connection-section-heading">
            <div>
              <p className="section-label">Target definition</p>
              <h2>ProjectFlow repository</h2>
            </div>
            <Github size={21} />
          </div>
          <label>
            <span>GitHub repository</span>
            <div className="connection-input-with-link">
              <input
                aria-label="GitHub repository"
                value={request.fullName}
                onChange={(event) => update('fullName', event.target.value)}
                autoComplete="off"
              />
              <a
                aria-label="Open GitHub repository"
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                title="Open GitHub repository"
              >
                <ExternalLink size={16} />
              </a>
            </div>
            <small>Owner and repository name</small>
          </label>
          <div className="connection-field-grid">
            <label>
              <span>Tracked branch</span>
              <input
                aria-label="Tracked branch"
                value={request.branch}
                onChange={(event) => update('branch', event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              <span>Production deployment</span>
              <div className="connection-input-with-link">
                <input
                  aria-label="Production deployment"
                  type="url"
                  value={request.productionUrl}
                  onChange={(event) =>
                    update('productionUrl', event.target.value)
                  }
                  autoComplete="off"
                />
                <a
                  aria-label="Open production deployment"
                  href={request.productionUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open production deployment"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            </label>
          </div>
          <label>
            <span>Measured study URL</span>
            <div className="connection-input-with-link">
              <input
                aria-label="Measured study URL"
                type="url"
                value={request.studyUrl}
                onChange={(event) => update('studyUrl', event.target.value)}
                autoComplete="off"
              />
              <a
                aria-label="Open measured study"
                href={request.studyUrl}
                target="_blank"
                rel="noreferrer"
                title="Open measured study"
              >
                <ExternalLink size={16} />
              </a>
            </div>
            <small>Darwin telemetry is enabled on this application view</small>
          </label>

          {error && (
            <p className="connection-error" role="alert">
              <AlertTriangle size={15} /> {error}
            </p>
          )}

          <div className="connection-actions">
            <div className="start-action-wrap">
              {!connection && !loading && (
                <span className="start-here-cue" aria-hidden="true">
                  Start here <ArrowDown size={15} />
                </span>
              )}
              <button
                className="primary-action"
                type="submit"
                disabled={saving || loading}
                data-explain="Verify the live GitHub commit, Darwin target contract, bounded source paths, validation commands, and Cloudflare runtime before saving this connection."
              >
                {saving ? (
                  <CircleDashed className="animate-spin" size={17} />
                ) : connection ? (
                  <ShieldCheck size={17} />
                ) : (
                  <Link2 size={17} />
                )}
                {saving
                  ? 'Verifying target'
                  : connection
                    ? 'Re-verify connection'
                    : 'Connect ProjectFlow'}
              </button>
            </div>
            {connection && (
              <>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={saving}
                  onClick={() => void onDisconnect()}
                  data-explain="Remove the active binding so the repository connection can be demonstrated again. Telemetry and genome history are left unchanged."
                >
                  <Unplug size={16} /> Disconnect
                </button>
                <span className="connection-state connection-state-live">
                  <span className="status-dot" aria-hidden="true" />
                  {loading || saving ? 'Checking connection' : 'Connected'}
                </span>
              </>
            )}
          </div>
        </form>

        <div className="connection-verification" aria-live="polite">
          <div className="connection-section-heading">
            <div>
              <p className="section-label">Live verification</p>
              <h2>{connection ? connection.target.name : 'Awaiting target'}</h2>
            </div>
            <ShieldCheck size={21} />
          </div>
          {connection ? (
            <>
              <p className="connection-purpose">{connection.target.purpose}</p>
              <div className="connection-identity">
                <span>Active commit</span>
                <code>{connection.repository.baseSha.slice(0, 12)}</code>
                <span>Source fingerprint</span>
                <code>{connection.repository.sourceHash.slice(0, 16)}</code>
              </div>
              <ul className="connection-check-list">
                {connection.checks.map((check) => (
                  <li key={check.id}>
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>{check.label}</strong>
                      <span>{check.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="connection-empty-state">
              <Github size={28} />
              <strong>No repository is connected</strong>
              <p>
                Darwin will show each verification result here before the target
                becomes available to GPT and Codex.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DarwinMark() {
  return (
    <img
      className="brand-mark"
      src="/assets/darwin-growth-mark.png"
      alt=""
      aria-hidden="true"
    />
  );
}

function ThemeToggle({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="icon-button theme-toggle"
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      data-explain={`Switch to ${nextTheme} theme`}
      onClick={() => onChange(nextTheme)}
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="info-tip"
      tabIndex={0}
      aria-label={text}
      data-explain={text}
    >
      <CircleHelp size={14} aria-hidden="true" />
    </span>
  );
}

interface ExplainTooltipState {
  target: HTMLElement;
  text: string;
}

interface ExplainTooltipPosition {
  left: number;
  top: number;
}

function GlobalExplainTooltip() {
  const [tooltip, setTooltip] = useState<ExplainTooltipState | null>(null);
  const [position, setPosition] = useState<ExplainTooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let activeTarget: HTMLElement | null = null;
    const explainTarget = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element
        ? eventTarget.closest<HTMLElement>('[data-explain]')
        : null;
    const show = (event: Event) => {
      const target = explainTarget(event.target);
      const text = target?.dataset.explain?.trim();
      if (!target || !text || target === activeTarget) return;
      activeTarget = target;
      setPosition(null);
      setTooltip({ target, text });
    };
    const hide = (event: Event) => {
      if (!activeTarget) return;
      const relatedTarget =
        'relatedTarget' in event
          ? (event as FocusEvent | PointerEvent).relatedTarget
          : null;
      if (
        relatedTarget instanceof Node &&
        activeTarget.contains(relatedTarget)
      ) {
        return;
      }
      activeTarget = null;
      setTooltip(null);
      setPosition(null);
    };
    const dismiss = () => {
      activeTarget = null;
      setTooltip(null);
      setPosition(null);
    };

    document.addEventListener('pointerover', show, true);
    document.addEventListener('pointerout', hide, true);
    document.addEventListener('focusin', show, true);
    document.addEventListener('focusout', hide, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerover', show, true);
      document.removeEventListener('pointerout', hide, true);
      document.removeEventListener('focusin', show, true);
      document.removeEventListener('focusout', hide, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current || window.innerWidth < 640) return;
    const targetRect = tooltip.target.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const gutter = 12;
    const gap = 9;
    const halfWidth = tooltipRect.width / 2;
    const left = Math.min(
      window.innerWidth - gutter - halfWidth,
      Math.max(gutter + halfWidth, targetRect.left + targetRect.width / 2),
    );
    const preferredTop = targetRect.top - tooltipRect.height - gap;
    const top =
      preferredTop >= gutter
        ? preferredTop
        : Math.min(
            window.innerHeight - gutter - tooltipRect.height,
            targetRect.bottom + gap,
          );
    setPosition({ left, top: Math.max(gutter, top) });
  }, [tooltip]);

  if (!tooltip) return null;
  return createPortal(
    <div
      className="global-explain-tooltip"
      ref={tooltipRef}
      role="tooltip"
      style={
        window.innerWidth < 640
          ? undefined
          : {
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }
      }
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}

function LiveTelemetryPanel({
  telemetry,
  analysisConfig,
  mode,
}: {
  telemetry: LiveTelemetryState;
  analysisConfig: ApiHealthState['analysis'];
  mode: 'observations' | 'mutations';
}) {
  const isObservations = mode === 'observations';
  const sessions = [
    ...new Set(telemetry.events.map((event) => event.sessionId)),
  ];
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [implementationMutationIds, setImplementationMutationIds] = useState<
    string[]
  >([]);
  const [expandedMutationIds, setExpandedMutationIds] = useState<string[]>([]);
  const visibleEvents = selectedSession
    ? telemetry.events.filter((event) => event.sessionId === selectedSession)
    : telemetry.events;
  const configuredModel = analysisConfig?.model ?? 'gpt-5.6';
  const liveModelAvailable = analysisConfig?.liveModelAvailable ?? false;
  const implementationCandidates = telemetry.analysis
    ? [telemetry.analysis.selectedMutation, ...telemetry.analysis.alternatives]
    : [];
  const rankedImplementationCandidates = [...implementationCandidates].sort(
    (left, right) => right.scorecard.total - left.scorecard.total,
  );
  const implementationCandidatesSelected = implementationCandidates.filter(
    (candidate) => implementationMutationIds.includes(candidate.id),
  );
  const manifestMutationIds = telemetry.manifest
    ? (telemetry.manifest.mutationIds ?? [telemetry.manifest.mutationId])
    : [];
  const manifestMatchesSelection =
    telemetry.manifest !== null &&
    manifestMutationIds.length === implementationCandidatesSelected.length &&
    implementationCandidatesSelected.every(
      (candidate, index) => candidate.id === manifestMutationIds[index],
    );
  const toggleImplementationMutation = (mutationId: string) => {
    setImplementationMutationIds((current) =>
      current.includes(mutationId)
        ? current.filter((id) => id !== mutationId)
        : [...current, mutationId],
    );
  };

  useEffect(() => {
    setImplementationMutationIds(
      telemetry.manifest
        ? (telemetry.manifest.mutationIds ?? [telemetry.manifest.mutationId])
        : telemetry.analysis
          ? [telemetry.analysis.selectedMutation.id]
          : [],
    );
    setExpandedMutationIds(
      telemetry.analysis ? [telemetry.analysis.selectedMutation.id] : [],
    );
  }, [telemetry.analysis?.analysisId, telemetry.manifest]);

  useEffect(() => {
    if (!isObservations || !telemetry.evidence) return;
    const signalId = decodeURIComponent(window.location.hash).replace(
      '#signal-',
      '',
    );
    if (!signalId || signalId === window.location.hash) return;
    const signal = document.getElementById(`signal-${signalId}`);
    if (!(signal instanceof HTMLDetailsElement)) return;
    signal.open = true;
    window.requestAnimationFrame(() =>
      signal.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }, [isObservations, telemetry.evidence?.evidenceId]);

  return (
    <section className="mt-8 surface-panel live-evidence" id="real-evidence">
      <div className="panel-heading live-evidence-heading">
        <div>
          <p className="section-label">
            {isObservations
              ? 'Measured source · real users'
              : 'Evidence-led selection'}
          </p>
          <div className="heading-with-help">
            <h2 className="mt-2 text-xl font-semibold">
              {isObservations ? 'Live study evidence' : 'Mutation workspace'}
            </h2>
            <InfoTip
              text={
                isObservations
                  ? 'Real semantic events ingested from the standalone ProjectFlow application. The view shows ordered behavior, sessions, participants, and detector-ready signals without recording typed values.'
                  : 'GPT reasons only over the verified evidence pack and connected ProjectFlow source snapshot. Candidate changes stay reviewable until an approved manifest is executed.'
              }
            />
          </div>
          <p className="mt-2 text-sm text-mist">
            {isObservations
              ? 'Ordered semantic events from standalone ProjectFlow.'
              : 'Compare real pressure clusters, choose a bounded mutation bundle, and supervise the implementation.'}
          </p>
        </div>
        <div className="live-evidence-actions">
          <button
            aria-label="Refresh live telemetry"
            className={`source-status source-${telemetry.status}`}
            data-explain="Refresh the latest live event window, study counts, genome state, and observation archive from Darwin's API."
            disabled={telemetry.refreshing}
            onClick={() => void telemetry.refresh()}
            type="button"
          >
            <span /> {telemetry.refreshing ? 'refreshing' : telemetry.status}
            <RotateCcw
              className={telemetry.refreshing ? 'is-spinning' : ''}
              size={12}
            />
          </button>
          {isObservations && (
            <button
              className="primary-action evidence-action"
              type="button"
              disabled={!telemetry.count || telemetry.generating}
              onClick={() => void telemetry.generateEvidence()}
              data-explain="Parse the current measured D1 events into ordered journeys, coverage quality, task attempts, and citeable friction signals."
            >
              {telemetry.generating ? (
                <CircleDashed className="is-spinning" size={15} />
              ) : (
                <FileCheck2 size={15} />
              )}
              {telemetry.generating ? 'Parsing evidence' : 'Generate evidence'}
            </button>
          )}
        </div>
      </div>

      {telemetry.error && (
        <div className="error-band telemetry-error" role="alert">
          <AlertTriangle size={16} />
          <span>{telemetry.error}</span>
          <button
            type="button"
            aria-label="Dismiss telemetry error"
            onClick={telemetry.clearError}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {isObservations && (
        <>
          <div className="evidence-stats" aria-label="Real study counts">
            <div data-explain="Every persisted semantic event in this study, counted across the full database rather than only the recent trace window.">
              <Database size={16} />
              <span>Raw events</span>
              <strong>{telemetry.count}</strong>
            </div>
            <div data-explain="Distinct ordered browser sessions across the full persisted study.">
              <Network size={16} />
              <span>Sessions</span>
              <strong>{Object.keys(telemetry.sessionCounts).length}</strong>
            </div>
            <div data-explain="Anonymous participant identifiers represented across the full persisted study.">
              <Users size={16} />
              <span>Participants</span>
              <strong>{telemetry.participantCount}</strong>
            </div>
            <div data-explain="Hover hesitation, rage click, false affordance, indecision, drag expectation, browser Back, zoom-readability, and touch-conflict observations.">
              <MousePointer2 size={16} />
              <span>Behavior signals</span>
              <strong>{telemetry.behaviorSignalCount}</strong>
            </div>
          </div>

          {telemetry.events.length ? (
            <div className="trace-layout">
              <div className="session-index">
                <button
                  className={selectedSession === null ? 'is-active' : ''}
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  data-explain="All persisted events in this study. The detailed trace remains responsive by polling and displaying only the latest 200 records."
                >
                  All captured events <span>{telemetry.count}</span>
                </button>
                {sessions.map((session) => {
                  const count = telemetry.sessionCounts[session] ?? 0;
                  return (
                    <button
                      className={selectedSession === session ? 'is-active' : ''}
                      key={session}
                      type="button"
                      onClick={() => setSelectedSession(session)}
                      data-explain="All persisted events in this session. Selecting it filters the detailed trace to its latest loaded records."
                    >
                      {shortId(session)} <span>{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="event-trace" aria-label="Ordered event trace">
                {visibleEvents.slice(-12).map((event) => (
                  <EventTraceRow event={event} key={event.eventId} />
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-evidence">
              <Activity size={18} />
              <div>
                <strong>Waiting for a real ProjectFlow interaction</strong>
                <span>
                  Open ProjectFlow and interact to create the first trace.
                </span>
              </div>
            </div>
          )}
        </>
      )}
      {telemetry.evidence && (
        <div className="evidence-pack">
          <div className="evidence-pack-header">
            <div>
              <span className="evidence-class">
                {telemetry.evidence.evidenceClass}
              </span>
              <strong>Evidence pack {telemetry.evidence.evidenceId}</strong>
              <code>{telemetry.evidence.evidenceHash}</code>
            </div>
            <dl>
              <div>
                <dt>Parser</dt>
                <dd>{telemetry.evidence.parserVersion}</dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{telemetry.evidence.quality.score}/100</dd>
              </div>
              <div>
                <dt>Journeys</dt>
                <dd>{telemetry.evidence.journeys.length}</dd>
              </div>
              <div>
                <dt>Attempts</dt>
                <dd>{telemetry.evidence.study.attempts}</dd>
              </div>
              <div>
                <dt>Signals</dt>
                <dd>{telemetry.evidence.frictionSignals.length}</dd>
              </div>
            </dl>
          </div>
          {isObservations && (
            <>
              <div className="evidence-signals">
                {telemetry.evidence.frictionSignals.length ? (
                  telemetry.evidence.frictionSignals.map((signal) => (
                    <details
                      id={`signal-${signal.evidenceId}`}
                      key={signal.evidenceId}
                    >
                      <summary>
                        <span>{signal.evidenceId}</span>
                        <strong>{signal.ruleId.replaceAll('_', ' ')}</strong>
                        <small>{signal.severity}</small>
                        <ChevronRight size={15} />
                      </summary>
                      <p>{signal.summary}</p>
                      <div className="signal-provenance">
                        <span>Rule {signal.ruleVersion}</span>
                        <span>{signal.support.events} events</span>
                        <span>{signal.support.sessions} sessions</span>
                        <span>{signal.support.participants} participants</span>
                      </div>
                      <div className="signal-trace">
                        {signal.trace.map((event) => (
                          <code key={event.eventId}>
                            {event.sequence.toString().padStart(2, '0')} ·{' '}
                            {event.eventType} · {event.targetId ?? event.route}
                          </code>
                        ))}
                      </div>
                    </details>
                  ))
                ) : (
                  <p className="no-signals">
                    No detector threshold was crossed by the current real
                    sample.
                  </p>
                )}
              </div>
              <div className="evidence-quality-band">
                <div>
                  <span>Evidence quality</span>
                  <strong>{telemetry.evidence.quality.strength}</strong>
                  <code>{telemetry.evidence.quality.score}/100</code>
                </div>
                <dl className="evidence-dimensions">
                  <div>
                    <dt>Volume</dt>
                    <dd>
                      {telemetry.evidence.quality.dimensions.volume.score}/100
                    </dd>
                    <small>
                      {
                        telemetry.evidence.quality.dimensions.volume
                          .observedEvents
                      }
                      /
                      {
                        telemetry.evidence.quality.dimensions.volume
                          .minimumEvents
                      }{' '}
                      events
                    </small>
                  </div>
                  <div>
                    <dt>Diversity</dt>
                    <dd>
                      {telemetry.evidence.quality.dimensions.diversity.score}
                      /100
                    </dd>
                    <small>
                      {
                        telemetry.evidence.quality.dimensions.diversity
                          .observedParticipants
                      }{' '}
                      participants ·{' '}
                      {
                        telemetry.evidence.quality.dimensions.diversity
                          .observedSessions
                      }{' '}
                      sessions
                    </small>
                  </div>
                  <div>
                    <dt>Completion</dt>
                    <dd>
                      {telemetry.evidence.quality.dimensions.completion.score}
                      /100
                    </dd>
                    <small>
                      {
                        telemetry.evidence.quality.dimensions.completion
                          .terminalAttempts
                      }
                      /
                      {
                        telemetry.evidence.quality.dimensions.completion
                          .minimumTerminalAttempts
                      }{' '}
                      terminal attempts
                    </small>
                  </div>
                  <div>
                    <dt>Recency</dt>
                    <dd>
                      {telemetry.evidence.quality.dimensions.recency.score}/100
                    </dd>
                    <small>
                      ≤
                      {
                        telemetry.evidence.quality.dimensions.recency
                          .maximumAgeDays
                      }
                      d gate
                    </small>
                  </div>
                </dl>
                {telemetry.evidence.quality.limitations.length ? (
                  <ul>
                    {telemetry.evidence.quality.limitations.map(
                      (limitation) => (
                        <li key={limitation}>{limitation}</li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p>No material coverage limitation detected.</p>
                )}
              </div>
            </>
          )}
          {!isObservations && (
            <div className="reasoning-workspace">
              <div className="reasoning-heading">
                <div>
                  <span className="section-label">
                    OpenAI reasoning boundary
                  </span>
                  <div className="reasoning-title">
                    <strong>{configuredModel} evidence reasoning</strong>
                    <span
                      className={`model-runtime ${liveModelAvailable ? 'is-live' : 'is-unavailable'}`}
                    >
                      {liveModelAvailable ? 'LIVE API' : 'UNAVAILABLE'}
                    </span>
                    <InfoTip text="This is the model invocation point. One request is made per evidence hash and cached; invalid citations or protected scope are rejected before a proposal can continue." />
                  </div>
                  <p>
                    Ordered journeys are reconstructed first. GPT must explain
                    competing causes and return a scored mutation portfolio.
                  </p>
                  <div
                    className="model-context"
                    aria-label="Context supplied to GPT"
                  >
                    <span>Context supplied</span>
                    <code>product goals</code>
                    <code>route inventory</code>
                    <code>active variant</code>
                    <code>capabilities</code>
                    <code>friction signals</code>
                    <code>complete ordered journeys</code>
                    <code>coverage limitations</code>
                    <code>50 mutation examples</code>
                    <code>ProjectFlow source</code>
                  </div>
                </div>
                <button
                  className="primary-action evidence-action"
                  type="button"
                  disabled={
                    !telemetry.evidence.frictionSignals.length ||
                    telemetry.analysing ||
                    !liveModelAvailable
                  }
                  onClick={() => void telemetry.analyseEvidence()}
                  data-explain={`Invoke ${configuredModel} once for this evidence hash. The request contains aggregate evidence and the structured ProjectFlow application map, never raw participant records.`}
                >
                  {telemetry.analysing ? (
                    <CircleDashed className="is-spinning" size={15} />
                  ) : (
                    <BrainCircuit size={15} />
                  )}
                  {telemetry.analysing
                    ? 'Reasoning over evidence'
                    : telemetry.analysis
                      ? 'Open cached reasoning'
                      : liveModelAvailable
                        ? `Ask ${configuredModel}`
                        : 'Live model unavailable'}
                </button>
              </div>
              {telemetry.analysis && (
                <div className="analysis-result">
                  <div className="analysis-audit-line">
                    <span>{telemetry.analysis.mode}</span>
                    <code>{telemetry.analysis.model}</code>
                    <code>prompt {telemetry.analysis.promptVersion}</code>
                    <code>{telemetry.analysis.cacheKey.slice(0, 16)}...</code>
                    {telemetry.analysis.promptCache && (
                      <code>
                        prompt cache ·{' '}
                        {telemetry.analysis.promptCache.cachedTokens ===
                        undefined
                          ? telemetry.analysis.promptCache.contextVersion
                          : `${telemetry.analysis.promptCache.cachedTokens} tokens`}
                      </code>
                    )}
                  </div>
                  <div className="reasoning-assessment">
                    <div>
                      <span>Evidence assessment</span>
                      <strong>
                        {telemetry.analysis.evidenceAssessment.quality.strength}
                      </strong>
                      <code>
                        {telemetry.analysis.evidenceAssessment.quality.score}
                        /100
                      </code>
                    </div>
                    <p>{telemetry.analysis.evidenceAssessment.summary}</p>
                  </div>
                  <div className="mutation-portfolio">
                    <div className="mutation-portfolio-heading">
                      <div>
                        <span>Ranked pressure portfolio</span>
                        <strong>
                          Every suggestion includes its full pressure analysis
                        </strong>
                      </div>
                      <code>
                        {rankedImplementationCandidates.length} suggestions
                      </code>
                    </div>
                    {rankedImplementationCandidates.map((candidate, index) => (
                      <MutationPortfolioRow
                        analysis={telemetry.analysis!}
                        candidate={candidate}
                        evidence={telemetry.evidence}
                        expanded={expandedMutationIds.includes(candidate.id)}
                        key={candidate.id}
                        onExpansionChange={() =>
                          setExpandedMutationIds((current) =>
                            current.includes(candidate.id)
                              ? current.filter((id) => id !== candidate.id)
                              : [...current, candidate.id],
                          )
                        }
                        onSelectionChange={() =>
                          toggleImplementationMutation(candidate.id)
                        }
                        rank={index + 1}
                        selected={implementationMutationIds.includes(
                          candidate.id,
                        )}
                      />
                    ))}
                  </div>
                  <div className="codex-handoff">
                    <div>
                      <ClipboardCheck size={17} />
                      <div>
                        <strong>Controlled Codex handoff</strong>
                        <span>
                          {implementationCandidatesSelected.length
                            ? `Implementation bundle · ${implementationCandidatesSelected.map((candidate) => candidate.title).join(' + ')}.`
                            : 'No mutations selected.'}{' '}
                          Brief, allow-list, evidence citations and validation
                          commands only.
                        </span>
                      </div>
                    </div>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={
                        telemetry.preparingManifest ||
                        telemetry.implementing ||
                        implementationCandidatesSelected.length === 0
                      }
                      onClick={() => {
                        if (
                          telemetry.execution &&
                          telemetry.execution.status !== 'failed' &&
                          manifestMatchesSelection
                        ) {
                          document
                            .getElementById('validation')
                            ?.scrollIntoView?.({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          return;
                        }
                        void telemetry
                          .startControlledEvolution(
                            implementationCandidatesSelected.map(
                              (candidate) => candidate.id,
                            ),
                          )
                          .then(() =>
                            window.setTimeout(
                              () =>
                                document
                                  .getElementById('validation')
                                  ?.scrollIntoView?.({
                                    behavior: 'smooth',
                                    block: 'start',
                                  }),
                              0,
                            ),
                          );
                      }}
                    >
                      {telemetry.preparingManifest || telemetry.implementing ? (
                        <CircleDashed className="is-spinning" size={14} />
                      ) : (
                        <Rocket size={14} />
                      )}
                      {telemetry.preparingManifest
                        ? 'Preparing manifest'
                        : telemetry.implementing
                          ? 'Applying mutation'
                          : telemetry.execution?.status === 'failed' &&
                              manifestMatchesSelection
                            ? 'Retry controlled evolution'
                            : telemetry.execution && manifestMatchesSelection
                              ? 'View implementation'
                              : 'Start controlled evolution'}
                    </button>
                  </div>
                  {telemetry.manifest && manifestMatchesSelection && (
                    <div className="manifest-audit">
                      <span>MANIFEST {telemetry.manifest.manifestId}</span>
                      <code>{telemetry.manifest.manifestHash}</code>
                      <span>
                        {telemetry.manifest.allowedPaths.length} allowed ·{' '}
                        {telemetry.manifest.protectedPaths.length} protected ·{' '}
                        {telemetry.manifest.validationCommands.length} checks ·{' '}
                        {manifestMutationIds.length} mutation
                        {manifestMutationIds.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!isObservations && !telemetry.evidence && (
        <div className="empty-evidence">
          <FileCheck2 size={18} />
          <div>
            <strong>
              Evidence is required before a mutation can be selected
            </strong>
            <span>
              Generate an evidence pack from the Observations workspace, then
              return here to invoke GPT.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function MutationPortfolioRow({
  analysis,
  candidate,
  evidence,
  expanded,
  onExpansionChange,
  onSelectionChange,
  rank,
  selected,
}: {
  analysis: EvidenceAnalysis;
  candidate: EvidenceMutationCandidate;
  evidence: LiveTelemetryState['evidence'];
  expanded: boolean;
  onExpansionChange: () => void;
  onSelectionChange: () => void;
  rank: number;
  selected: boolean;
}) {
  const clusters = candidate.pressureClusterIds
    .map((clusterId) =>
      analysis.evidenceAssessment.pressureClusters.find(
        (cluster) => cluster.id === clusterId,
      ),
    )
    .filter(
      (
        cluster,
      ): cluster is EvidenceAnalysis['evidenceAssessment']['pressureClusters'][number] =>
        cluster !== undefined,
    );
  const score = candidate.scorecard.total;
  const heatHue = Math.max(5, Math.round(180 - score * 2));
  const heatStyle = {
    '--preference-fill': `${score}%`,
    '--preference-heat': String(heatHue),
  } as CSSProperties;
  const panelId = `mutation-portfolio-${candidate.id}`;

  return (
    <article
      className={`mutation-portfolio-row ${selected ? 'is-selected' : ''}`}
      style={heatStyle}
    >
      <div className="mutation-portfolio-summary">
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className="mutation-portfolio-expand"
          onClick={onExpansionChange}
          type="button"
        >
          <span className="portfolio-rank">#{rank}</span>
          <div className="portfolio-title">
            <div>
              {clusters.map((cluster) => (
                <code
                  data-explain={`${cluster.id} is a grouped selection pressure supported by ${cluster.evidenceIds.length} cited evidence signals.`}
                  key={cluster.id}
                  tabIndex={0}
                >
                  {cluster.id}
                </code>
              ))}
              {rank === 1 && <span>GPT preferred</span>}
            </div>
            <strong>
              {clusters.map((cluster) => cluster.title).join(' + ') ||
                candidate.problem}
            </strong>
            <span>{candidate.title}</span>
          </div>
          <div
            className="portfolio-preference"
            data-explain="Darwin preference is the composite portfolio score: 35% evidence strength, 25% user impact, 20% feasibility, and 20% validation clarity. It is a ranking, not a probability of success."
            tabIndex={0}
          >
            <strong>{score}%</strong>
            <span>preference</span>
            <div aria-hidden="true">
              <span />
            </div>
          </div>
          <ChevronRight className={expanded ? 'is-expanded' : ''} size={17} />
        </button>
        <label className="portfolio-select">
          <input
            aria-label={`Implement ${candidate.title}`}
            checked={selected}
            onChange={onSelectionChange}
            type="checkbox"
            value={candidate.id}
          />
          <span>Implement</span>
        </label>
      </div>

      {expanded && (
        <div className="mutation-portfolio-detail" id={panelId}>
          <div className="portfolio-hypothesis">
            <span>Hypothesis</span>
            <p>{candidate.hypothesis}</p>
          </div>
          <div className="mutation-causal-change">
            <span>Evidence-led change</span>
            <p>{candidate.change}</p>
          </div>
          <div className="mutation-citations">
            {candidate.evidenceIds.map((id) => (
              <EvidenceChip evidence={evidence} id={id} key={id} />
            ))}
            <span>
              {candidate.predictedImpact.metric}{' '}
              {candidate.predictedImpact.direction}
            </span>
          </div>

          {clusters.map((cluster) => (
            <section className="portfolio-pressure-analysis" key={cluster.id}>
              <div>
                <code>{cluster.id}</code>
                <strong>{cluster.title}</strong>
              </div>
              <p>{cluster.interpretation}</p>
              <div className="portfolio-pressure-evidence">
                {cluster.evidenceIds.map((id) => (
                  <EvidenceChip evidence={evidence} id={id} key={id} />
                ))}
              </div>
              <dl>
                <div>
                  <dt>User consequence</dt>
                  <dd>{cluster.userConsequence}</dd>
                </div>
                <div>
                  <dt>Competing explanations</dt>
                  <dd>{cluster.competingExplanations.join(' · ')}</dd>
                </div>
                <div>
                  <dt>Evolution opportunity</dt>
                  <dd>{cluster.mutationOpportunity}</dd>
                </div>
              </dl>
              {cluster.affectedTargets.length > 0 && (
                <div className="portfolio-targets">
                  <span>Affected targets</span>
                  {cluster.affectedTargets.map((target) => (
                    <code key={target}>{target}</code>
                  ))}
                </div>
              )}
            </section>
          ))}

          <div className="mutation-scorecard">
            {Object.entries(candidate.scorecard).map(([label, value]) => (
              <div key={label}>
                <span>{label.replace(/([A-Z])/g, ' $1')}</span>
                <strong>{value}%</strong>
              </div>
            ))}
          </div>
          <div className="validation-plan">
            <span>Measured validation plan</span>
            <strong>{candidate.validationPlan.primaryMetric}</strong>
            <p>
              {candidate.validationPlan.baseline} →{' '}
              {candidate.validationPlan.successThreshold}
            </p>
            <small>
              Guardrails · {candidate.validationPlan.guardrails.join(' · ')}
            </small>
          </div>
          <div className="portfolio-implementation-context">
            <div>
              <span>Scope</span>
              <p>{candidate.scope.join(' · ')}</p>
            </div>
            <div>
              <span>Tradeoffs</span>
              <p>{candidate.tradeoffs.join(' · ')}</p>
            </div>
            <div>
              <span>Predicted impact rationale</span>
              <p>{candidate.predictedImpact.rationale}</p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function EvidenceChip({
  evidence,
  id,
}: {
  evidence: LiveTelemetryState['evidence'];
  id: string;
}) {
  const signal = evidence?.frictionSignals.find(
    (candidate) => candidate.evidenceId === id,
  );
  const explanation = signal
    ? `${signal.summary} Severity: ${signal.severity}. Support: ${signal.support.events} events, ${signal.support.attempts} attempts, ${signal.support.sessions} sessions, ${signal.support.participants} participants.`
    : `${id} is a citation from the current measured evidence pack.`;

  return (
    <a
      aria-label={`Open ${id} in Observations`}
      className="evidence-chip"
      data-explain={`${explanation} Open the cited detector record in Observations.`}
      href={`${dashboardRoutes.Observations}#signal-${id}`}
    >
      {id}
    </a>
  );
}

function EventTraceRow({ event }: { event: StoredTelemetryEvent }) {
  const target =
    'targetId' in event && event.targetId ? event.targetId : event.route;
  return (
    <div className="event-trace-row">
      <span className="event-sequence">
        {event.sequence.toString().padStart(2, '0')}
      </span>
      <span className={`event-kind kind-${event.eventType}`}>
        {event.eventType.replaceAll('_', ' ')}
      </span>
      <code>{target}</code>
      <span className="event-detail">{describeTelemetryEvent(event)}</span>
      <span>{shortId(event.participantId)}</span>
      <time dateTime={event.receivedAt}>
        {new Date(event.receivedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </time>
    </div>
  );
}

function describeTelemetryEvent(event: StoredTelemetryEvent) {
  switch (event.eventType) {
    case 'element_clicked':
      return event.properties
        ? `${event.properties.pointerType} · ${Math.round(event.properties.xRatio * 100)}% x / ${Math.round(event.properties.yRatio * 100)}% y${event.properties.interactive ? '' : ' · non-interactive'}`
        : 'semantic click';
    case 'hover_started':
      return `${event.properties.pointerType} entered target`;
    case 'hover_ended':
      return `${formatTelemetryDuration(event.properties.durationMs)} · ${event.properties.clicked ? `clicked after ${formatTelemetryDuration(event.properties.hoverToClickMs ?? 0)}` : event.properties.immediateExit ? 'immediate exit' : 'no click'}`;
    case 'pointer_transition':
      return `${event.properties.fromTargetId ?? 'entry'} → target · ${formatTelemetryDuration(event.properties.elapsedMs)}`;
    case 'interaction_signal':
      return `${event.properties.signal.replaceAll('_', ' ')} · ${event.properties.count} / ${formatTelemetryDuration(event.properties.windowMs)}`;
    case 'drag_attempted':
      return `${event.properties.distancePx}px · ${event.properties.draggable ? 'supported' : 'unsupported drag'}`;
    case 'touch_cancelled':
      return `touch cancelled after ${formatTelemetryDuration(event.properties.durationMs)}`;
    case 'browser_navigation':
      return `${event.properties.direction} · ${event.properties.fromRoute} → ${event.properties.toRoute}`;
    case 'viewport_zoom_changed':
      return `${Math.round(event.properties.fromScale * 100)}% → ${Math.round(event.properties.toScale * 100)}%`;
    default:
      return 'ordered study event';
  }
}

const formatTelemetryDuration = (milliseconds: number) =>
  milliseconds >= 1_000
    ? `${(milliseconds / 1_000).toFixed(1)}s`
    : `${milliseconds}ms`;

const shortId = (value: string) => {
  const suffix = value.split('-').at(-1) ?? value;
  return suffix.length > 10 ? suffix.slice(0, 10) : suffix;
};

const executionStatusLabel: Record<
  RepositoryMutationExecution['status'],
  string
> = {
  prepared: 'Preparing dispatch',
  queued: 'Queued in GitHub Actions',
  codex_running: 'Codex is editing ProjectFlow',
  validating: 'Repository checks are running',
  failed: 'Execution failed',
  pull_request_open: 'Pull request open',
  preview_ready: 'Preview ready for review',
  releasing: 'Merging reviewed pull request',
  released: 'Mutation released',
};

const rollbackStatusLabel: Record<RepositoryRollback['status'], string> = {
  prepared: 'Preparing rollback dispatch',
  queued: 'Queued in GitHub Actions',
  validating: 'Rollback checks are running',
  failed: 'Rollback failed',
  pull_request_open: 'Rollback pull request open',
  preview_ready: 'Rollback preview ready',
  releasing: 'Merging reviewed rollback',
  released: 'Rollback released',
};

function MutationWorkspaceReset({
  execution,
}: {
  execution: RepositoryMutationExecution;
}) {
  const rollbackReleased = execution.rollback?.status === 'released';
  return (
    <section className="mt-8 surface-panel mutation-reset-panel">
      <div>
        <p className="section-label">Selection archived</p>
        <h2 className="mt-2 text-xl font-semibold">Ready for fresh evidence</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-mist">
          {rollbackReleased
            ? 'The retained mutation and its reviewed rollback are recorded in Genome. New evidence can now begin the next controlled evolution cycle.'
            : 'The retained mutation is recorded in Genome. New evidence can now begin the next controlled evolution cycle.'}
        </p>
      </div>
      <a className="secondary-action" href={dashboardRoutes.Genome}>
        <Dna size={16} /> Open Genome
      </a>
    </section>
  );
}

function ObservationArchivePanel({
  archives,
}: {
  archives: ObservationArchive[];
}) {
  return (
    <section
      className="mt-8 surface-panel observation-archive"
      aria-labelledby="observation-archive-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Retained evidence</p>
          <div className="heading-with-help">
            <h2
              id="observation-archive-title"
              className="mt-2 text-xl font-semibold"
            >
              Observation archive
            </h2>
            <InfoTip text="Evidence is archived here once it has driven a completed controlled mutation. The active study above contains only the next measurement cycle." />
          </div>
        </div>
        <Database size={19} className="text-mist" />
      </div>
      {archives.map((archive) => (
        <ObservationArchiveArtifact key={archive.archiveId} archive={archive} />
      ))}
    </section>
  );
}

function ObservationArchiveArtifact({
  archive,
}: {
  archive: ObservationArchive;
}) {
  const { analysis, evidence, execution } = archive;
  const failed = execution.status === 'failed';
  const signalCount = evidence.frictionSignals.length;
  return (
    <details
      className="fossil-artifact observation-artifact"
      id={`observation-${archive.archiveId}`}
    >
      <summary>
        <div className="fossil-artifact-summary">
          <div>
            <span>Evidence</span>
            <strong>{evidence.evidenceId}</strong>
          </div>
          <div>
            <span>Measured scope</span>
            <strong>
              {evidence.study.sourceEventCount.toLocaleString('en-US')} events
              {' · '}
              {evidence.study.sessions} sessions
            </strong>
          </div>
          <div>
            <span>Evidence quality</span>
            <strong>
              {evidence.quality.strength} {evidence.quality.score}/100
            </strong>
          </div>
          <div>
            <span>Informed mutation</span>
            <strong>{analysis.selectedMutation.title}</strong>
          </div>
          <span className={failed ? 'status-badge is-failed' : 'status-badge'}>
            {failed ? 'FAILED' : 'ARCHIVED'}
          </span>
        </div>
        <ChevronRight className="fossil-artifact-chevron" size={18} />
      </summary>
      <div className="fossil-artifact-detail observation-archive-detail">
        <div className="observation-archive-stats">
          <div>
            <span>Participants</span>
            <strong>{evidence.study.participants}</strong>
          </div>
          <div>
            <span>Task attempts</span>
            <strong>{evidence.study.attempts}</strong>
          </div>
          <div>
            <span>Selection pressures</span>
            <strong>{signalCount}</strong>
          </div>
          <div>
            <span>Reasoned with</span>
            <strong>{analysis.model}</strong>
          </div>
        </div>
        <div className="observation-archive-copy">
          <div>
            <span className="section-label">Evidence assessment</span>
            <p>{analysis.evidenceAssessment.summary}</p>
          </div>
          <div>
            <span className="section-label">
              Mutation informed by this evidence
            </span>
            <strong>{analysis.selectedMutation.title}</strong>
            <p>{analysis.selectedMutation.hypothesis}</p>
          </div>
        </div>
        <div className="observation-archive-signals">
          <span className="section-label">Retained signals</span>
          {evidence.frictionSignals.map((signal) => (
            <div key={signal.evidenceId}>
              <strong>
                {signal.severity} · {signal.summary}
              </strong>
              <span>
                {signal.support.events} events across {signal.support.sessions}{' '}
                sessions
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function FossilExecutionArtifact({
  execution,
  mutationTitle,
  manifest,
  releasing,
  retrying,
  rollingBack,
  releasingRollback,
  onRelease,
  onRollback,
  onReleaseRollback,
  onRetry,
}: {
  execution: RepositoryMutationExecution;
  mutationTitle: string | null;
  manifest: CodexImplementationManifest | null;
  releasing: boolean;
  retrying: boolean;
  rollingBack: boolean;
  releasingRollback: boolean;
  onRelease: () => void;
  onRollback: () => void;
  onReleaseRollback: () => void;
  onRetry: () => void;
}) {
  const retained = execution.status === 'released';
  const failed = execution.status === 'failed';
  const rollback = execution.rollback;
  const artifactState =
    rollback?.status === 'released'
      ? 'REVERTED'
      : failed
        ? 'EXECUTION FAILED'
        : retained
          ? 'RETAINED'
          : 'CANDIDATE';

  return (
    <details className="fossil-artifact" id={`fossil-${execution.executionId}`}>
      <summary>
        <div className="fossil-artifact-summary">
          <div>
            <span>Genome</span>
            <strong>
              {execution.headSha?.slice(0, 12) ?? execution.branch}
            </strong>
          </div>
          <div>
            <span>Mutation</span>
            <strong title={mutationTitle ?? execution.manifestId}>
              {mutationTitle ?? execution.manifestId}
            </strong>
          </div>
          <div>
            <span>Selection</span>
            <strong>
              {rollback?.status === 'released'
                ? 'Returned to baseline'
                : retained
                  ? 'Survived selection'
                  : failed
                    ? 'Execution failed'
                    : executionStatusLabel[execution.status]}
            </strong>
          </div>
          <div>
            <span>Fitness</span>
            <strong>{retained ? 'Measurement pending' : '--'}</strong>
          </div>
          <span className={failed ? 'status-badge is-failed' : 'status-badge'}>
            {artifactState}
          </span>
        </div>
        <ChevronRight className="fossil-artifact-chevron" size={18} />
      </summary>
      <div className="fossil-artifact-detail">
        <RepositoryExecutionWorkspace
          embedded
          archived
          execution={execution}
          manifest={manifest}
          releasing={releasing}
          retrying={retrying}
          rollingBack={rollingBack}
          releasingRollback={releasingRollback}
          onRelease={onRelease}
          onRollback={onRollback}
          onReleaseRollback={onReleaseRollback}
          onRetry={onRetry}
        />
      </div>
    </details>
  );
}

function RepositoryExecutionWorkspace({
  execution,
  manifest,
  releasing,
  retrying,
  rollingBack,
  releasingRollback,
  archived = false,
  embedded = false,
  onRelease,
  onRollback,
  onReleaseRollback,
  onRetry,
}: {
  execution: RepositoryMutationExecution;
  manifest: CodexImplementationManifest | null;
  releasing: boolean;
  retrying: boolean;
  rollingBack: boolean;
  releasingRollback: boolean;
  archived?: boolean;
  embedded?: boolean;
  onRelease: () => void;
  onRollback: () => void;
  onReleaseRollback: () => void;
  onRetry: () => void;
}) {
  const lines = execution.patch?.split('\n') ?? [];
  const status = execution.status;
  const codexComplete = [
    'validating',
    'pull_request_open',
    'preview_ready',
    'releasing',
    'released',
  ].includes(status);
  const validationComplete = [
    'pull_request_open',
    'preview_ready',
    'releasing',
    'released',
  ].includes(status);
  const reviewComplete = ['preview_ready', 'releasing', 'released'].includes(
    status,
  );

  return (
    <section
      className={`${embedded ? 'execution-panel execution-panel-embedded' : 'mt-8 surface-panel execution-panel'}`}
      id="validation"
      aria-labelledby="repository-execution-title"
    >
      <div className="panel-heading execution-heading">
        <div>
          <p className="section-label">
            {archived
              ? 'Archived repository mutation'
              : 'Live repository mutation'}
          </p>
          <div className="heading-with-help">
            <h2
              id="repository-execution-title"
              className="mt-2 text-xl font-semibold"
            >
              {archived ? 'Codex execution record' : 'Codex execution'}
            </h2>
            <InfoTip text="A real GitHub Actions run applies the selected manifest to the exact ProjectFlow commit, enforces repository policy, runs validation, opens a pull request, and deploys a review preview. Retained mutations can be rolled back through a separately reviewed inverse pull request." />
          </div>
        </div>
        <span className={`artifact-badge execution-status-${status}`}>
          {[
            'prepared',
            'queued',
            'codex_running',
            'validating',
            'releasing',
          ].includes(status) && (
            <CircleDashed className="is-spinning" size={14} />
          )}
          {![
            'prepared',
            'queued',
            'codex_running',
            'validating',
            'releasing',
          ].includes(status) && <GitBranch size={14} />}
          {executionStatusLabel[status]}
        </span>
      </div>

      <div
        className="execution-steps"
        aria-label="Repository execution progress"
      >
        <ExecutionStep index="01" label="Manifest" state="complete" />
        <ExecutionStep
          index="02"
          label="Codex"
          state={
            codexComplete
              ? 'complete'
              : status === 'failed'
                ? 'pending'
                : 'active'
          }
        />
        <ExecutionStep
          index="03"
          label="Checks"
          state={
            validationComplete
              ? 'complete'
              : status === 'validating'
                ? 'active'
                : 'pending'
          }
        />
        <ExecutionStep
          index="04"
          label="Review"
          state={
            reviewComplete
              ? 'complete'
              : status === 'pull_request_open'
                ? 'active'
                : 'pending'
          }
        />
        <ExecutionStep
          index="05"
          label="Release"
          state={
            status === 'released'
              ? 'complete'
              : status === 'releasing'
                ? 'active'
                : 'pending'
          }
        />
      </div>

      <div className="repository-run-summary">
        <div>
          <span>Repository</span>
          <a href={execution.repository.url} target="_blank" rel="noreferrer">
            {execution.repository.fullName} <ExternalLink size={12} />
          </a>
        </div>
        <div>
          <span>Immutable base</span>
          <code>{execution.baseSha.slice(0, 12)}</code>
        </div>
        <div>
          <span>Candidate commit</span>
          <code>{execution.headSha?.slice(0, 12) ?? 'pending'}</code>
        </div>
        <div>
          <span>Branch</span>
          <code>{execution.branch}</code>
        </div>
      </div>

      <div className="repository-links" aria-label="Repository artifacts">
        {execution.workflowUrl && (
          <a href={execution.workflowUrl} target="_blank" rel="noreferrer">
            <Activity size={14} /> Workflow run <ExternalLink size={12} />
          </a>
        )}
        {execution.pullRequestUrl && (
          <a href={execution.pullRequestUrl} target="_blank" rel="noreferrer">
            <GitBranch size={14} /> Pull request #{execution.pullRequestNumber}{' '}
            <ExternalLink size={12} />
          </a>
        )}
        {execution.previewUrl && (
          <a href={execution.previewUrl} target="_blank" rel="noreferrer">
            <Rocket size={14} /> Open mutation preview{' '}
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {execution.error && (
        <div className="execution-error" role="alert">
          <AlertTriangle size={17} />
          <div>
            <strong>Repository execution stopped</strong>
            <span>{execution.error}</span>
          </div>
        </div>
      )}

      <div className="execution-layout">
        <div className="diff-column">
          <div className="artifact-heading">
            <div>
              <span>Real Git patch</span>
              <strong>
                {execution.baseSha.slice(0, 8)} →{' '}
                {execution.headSha?.slice(0, 8) ?? 'Codex working'}
              </strong>
            </div>
            <span>{lines.length ? `${lines.length} lines` : 'pending'}</span>
          </div>
          {lines.length ? (
            <pre
              className="diff-viewer"
              aria-label="ProjectFlow repository diff"
            >
              <code>
                {lines.map((line, index) => (
                  <span
                    className={
                      line.startsWith('+') && !line.startsWith('+++')
                        ? 'diff-addition'
                        : line.startsWith('-') && !line.startsWith('---')
                          ? 'diff-removal'
                          : line.startsWith('@@')
                            ? 'diff-hunk'
                            : ''
                    }
                    key={`${index}-${line}`}
                  >
                    <i>{String(index + 1).padStart(2, '0')}</i>
                    {line || ' '}
                  </span>
                ))}
              </code>
            </pre>
          ) : (
            <div className="validation-ready repository-waiting">
              <CircleDashed
                className={status === 'failed' ? '' : 'is-spinning'}
                size={22}
              />
              <strong>{executionStatusLabel[status]}</strong>
              <span>
                The diff appears here only after Codex has produced a real
                patch.
              </span>
            </div>
          )}
        </div>

        <div className="validation-column">
          <div className="artifact-heading">
            <div>
              <span>Repository validation</span>
              <strong>{execution.checks.length} live checks</strong>
            </div>
            <span>{execution.changedFiles.length} files</span>
          </div>

          <div className="validation-checks">
            {execution.checks.map((check) => (
              <details key={check.name} open={check.status === 'failed'}>
                <summary>
                  {check.status === 'passed' ? (
                    <CheckCircle2 size={15} />
                  ) : check.status === 'failed' ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <CircleDashed
                      className={
                        check.status === 'running' ? 'is-spinning' : ''
                      }
                      size={15}
                    />
                  )}
                  <span>{check.name}</span>
                  <strong>
                    {check.durationMs === null
                      ? check.status
                      : `${(check.durationMs / 1_000).toFixed(1)}s`}
                  </strong>
                </summary>
                <pre>{check.output}</pre>
              </details>
            ))}
          </div>

          {execution.changedFiles.length > 0 && (
            <div className="changed-file-list">
              <span>Changed within manifest</span>
              {execution.changedFiles.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          )}

          {execution.codex.finalMessage && (
            <details className="codex-run-message">
              <summary>
                <BrainCircuit size={15} /> Codex implementation report
              </summary>
              <pre>{execution.codex.finalMessage}</pre>
            </details>
          )}

          {manifest && (
            <div className="manifest-execution-brief">
              <span>Approved implementation brief</span>
              <p>{manifest.brief}</p>
              <code>{manifest.evidenceCitations.join(' · ')}</code>
            </div>
          )}

          <div className="validation-actions">
            {status === 'failed' && (
              <button
                className="approve-action"
                type="button"
                onClick={onRetry}
                disabled={retrying}
                data-explain="Start a fresh authenticated GitHub Actions run from the same immutable manifest after an infrastructure or validation failure."
              >
                {retrying ? (
                  <CircleDashed className="is-spinning" size={16} />
                ) : (
                  <RotateCcw size={16} />
                )}
                {retrying ? 'Retrying repository run' : 'Retry repository run'}
              </button>
            )}
            {status === 'preview_ready' && (
              <button
                className="approve-action"
                type="button"
                onClick={onRelease}
                data-explain="Squash-merge the exact reviewed ProjectFlow pull request. GitHub then deploys the retained commit from main."
              >
                <Rocket size={16} /> Release reviewed mutation
              </button>
            )}
            {(status === 'releasing' || releasing) && (
              <button className="approve-action" type="button" disabled>
                <CircleDashed className="is-spinning" size={16} /> Merging pull
                request
              </button>
            )}
            {status === 'released' && (
              <div className="release-confirmation">
                <CheckCircle2 size={17} /> Mutation survived selection at{' '}
                <code>{execution.headSha?.slice(0, 12)}</code>
              </div>
            )}
          </div>
        </div>
      </div>

      {status === 'released' && (
        <RollbackWorkspace
          execution={execution}
          rollingBack={rollingBack}
          releasingRollback={releasingRollback}
          onRollback={onRollback}
          onReleaseRollback={onReleaseRollback}
        />
      )}
    </section>
  );
}

function ExecutionStep({
  index,
  label,
  state,
}: {
  index: string;
  label: string;
  state: 'pending' | 'active' | 'complete';
}) {
  return (
    <div className={`execution-step step-${state}`}>
      <span>{state === 'complete' ? <Check size={12} /> : index}</span>
      <strong>{label}</strong>
    </div>
  );
}

function RollbackWorkspace({
  execution,
  rollingBack,
  releasingRollback,
  onRollback,
  onReleaseRollback,
}: {
  execution: RepositoryMutationExecution;
  rollingBack: boolean;
  releasingRollback: boolean;
  onRollback: () => void;
  onReleaseRollback: () => void;
}) {
  const rollback = execution.rollback;
  const status = rollback?.status;
  const rollbackInProgress =
    status && !['failed', 'released', 'preview_ready'].includes(status);

  return (
    <section className="rollback-workspace" aria-labelledby="rollback-title">
      <div className="rollback-heading">
        <div>
          <p className="section-label">Controlled rollback</p>
          <h3 id="rollback-title" className="mt-2 text-lg font-semibold">
            {rollback?.status === 'released'
              ? 'Mutation reverted through review'
              : 'Prepare a reviewable inverse change'}
          </h3>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-mist">
            Darwin never rewrites the active application directly. A rollback
            generates an exact Git revert of the retained commit, validates it,
            deploys a preview, and requires a separate release decision.
          </p>
        </div>
        {rollback && (
          <span
            className={`artifact-badge execution-status-${rollback.status}`}
          >
            {rollbackInProgress ? (
              <CircleDashed className="is-spinning" size={14} />
            ) : rollback.status === 'failed' ? (
              <AlertTriangle size={14} />
            ) : (
              <GitBranch size={14} />
            )}
            {rollbackStatusLabel[rollback.status]}
          </span>
        )}
      </div>

      {!rollback ? (
        <div className="rollback-empty">
          <span>
            The retained commit <code>{execution.headSha?.slice(0, 12)}</code>{' '}
            is eligible for a controlled rollback.
          </span>
          <button
            className="secondary-action"
            type="button"
            onClick={onRollback}
            disabled={rollingBack}
            data-explain="Create a protected ProjectFlow branch with git revert, run real repository validation, open a rollback pull request, and deploy a separate preview before any rollback can be released."
          >
            {rollingBack ? (
              <CircleDashed className="is-spinning" size={16} />
            ) : (
              <RotateCcw size={16} />
            )}
            {rollingBack ? 'Preparing rollback' : 'Prepare controlled rollback'}
          </button>
        </div>
      ) : (
        <>
          <div className="repository-run-summary rollback-summary">
            <div>
              <span>Reverted commit</span>
              <code>{rollback.revertedSha.slice(0, 12)}</code>
            </div>
            <div>
              <span>Rollback commit</span>
              <code>{rollback.headSha?.slice(0, 12) ?? 'pending'}</code>
            </div>
            <div>
              <span>Branch</span>
              <code>{rollback.branch}</code>
            </div>
            <div>
              <span>Inverse patch</span>
              <code>{rollback.changedFiles.length} changed files</code>
            </div>
          </div>

          <div className="repository-links" aria-label="Rollback artifacts">
            {rollback.workflowUrl && (
              <a href={rollback.workflowUrl} target="_blank" rel="noreferrer">
                <Activity size={14} /> Rollback workflow{' '}
                <ExternalLink size={12} />
              </a>
            )}
            {rollback.pullRequestUrl && (
              <a
                href={rollback.pullRequestUrl}
                target="_blank"
                rel="noreferrer"
              >
                <GitBranch size={14} /> Rollback pull request #
                {rollback.pullRequestNumber} <ExternalLink size={12} />
              </a>
            )}
            {rollback.previewUrl && (
              <a href={rollback.previewUrl} target="_blank" rel="noreferrer">
                <Rocket size={14} /> Open rollback preview{' '}
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          {rollback.error && (
            <div className="execution-error" role="alert">
              <AlertTriangle size={17} />
              <div>
                <strong>Repository rollback stopped</strong>
                <span>{rollback.error}</span>
              </div>
            </div>
          )}

          {rollback.patch && (
            <details className="codex-run-message rollback-patch">
              <summary>
                <Code2 size={15} /> Review inverse Git patch
              </summary>
              <pre>{rollback.patch}</pre>
            </details>
          )}

          <div className="validation-checks rollback-checks">
            {rollback.checks.map((check) => (
              <details key={check.name} open={check.status === 'failed'}>
                <summary>
                  {check.status === 'passed' ? (
                    <CheckCircle2 size={15} />
                  ) : check.status === 'failed' ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <CircleDashed
                      className={
                        check.status === 'running' ? 'is-spinning' : ''
                      }
                      size={15}
                    />
                  )}
                  <span>{check.name}</span>
                  <strong>
                    {check.durationMs === null
                      ? check.status
                      : `${(check.durationMs / 1_000).toFixed(1)}s`}
                  </strong>
                </summary>
                <pre>{check.output}</pre>
              </details>
            ))}
          </div>

          <div className="validation-actions">
            {status === 'failed' && (
              <button
                className="secondary-action"
                type="button"
                onClick={onRollback}
                disabled={rollingBack}
              >
                {rollingBack ? (
                  <CircleDashed className="is-spinning" size={16} />
                ) : (
                  <RotateCcw size={16} />
                )}
                {rollingBack
                  ? 'Retrying rollback'
                  : 'Retry controlled rollback'}
              </button>
            )}
            {status === 'preview_ready' && (
              <button
                className="secondary-action"
                type="button"
                onClick={onReleaseRollback}
                disabled={releasingRollback}
                data-explain="Squash-merge the exact reviewed rollback pull request. This returns ProjectFlow to the code state before the retained mutation."
              >
                {releasingRollback ? (
                  <CircleDashed className="is-spinning" size={16} />
                ) : (
                  <RotateCcw size={16} />
                )}
                {releasingRollback
                  ? 'Merging rollback'
                  : 'Release reviewed rollback'}
              </button>
            )}
            {rollbackInProgress && (
              <button className="secondary-action" type="button" disabled>
                <CircleDashed className="is-spinning" size={16} /> Preparing
                controlled rollback
              </button>
            )}
            {status === 'released' && (
              <div className="release-confirmation rollback-confirmation">
                <CheckCircle2 size={17} /> ProjectFlow returned to{' '}
                <code>{rollback.headSha?.slice(0, 12)}</code>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  ready = false,
  help,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  ready?: boolean;
  help: string;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <Icon size={17} className="text-mist" />
      <span className="text-sm text-mist">{label}</span>
      <InfoTip text={help} />
      <span
        className={`ml-auto font-mono text-xs capitalize ${ready ? 'text-signal' : 'text-white'}`}
      >
        {value}
      </span>
    </div>
  );
}

function OperatorBoundary() {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked'>(
    'checking',
  );
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const verify = async (candidate?: string) => {
    if (candidate !== undefined) setOperatorToken(candidate);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/session`);
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Operator authorization failed.');
      }
      setError(null);
      setState('unlocked');
    } catch (reason) {
      setOperatorToken(null);
      setError(
        reason instanceof Error
          ? reason.message
          : 'Operator authorization failed.',
      );
      setState('locked');
    }
  };

  useEffect(() => {
    void verify(getOperatorToken() ?? undefined);
    const lock = () => {
      setOperatorToken(null);
      setState('locked');
      setError('Your operator session is no longer authorized.');
    };
    window.addEventListener('darwin:operator-unauthorized', lock);
    return () =>
      window.removeEventListener('darwin:operator-unauthorized', lock);
  }, []);

  if (state === 'unlocked') return <DarwinDashboard />;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = token.trim();
    if (!candidate) {
      setError('Enter the operator access token.');
      return;
    }
    setState('checking');
    void verify(candidate);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-carbon px-5 text-white">
      <section
        className="surface-panel w-full max-w-[480px]"
        aria-live="polite"
      >
        <div className="panel-heading">
          <div className="flex items-center gap-4">
            <DarwinMark />
            <div>
              <p className="section-label">Controlled environment</p>
              <h1 className="mt-2 text-2xl font-semibold">
                Darwin operator access
              </h1>
            </div>
          </div>
          <LockKeyhole className="text-mist" size={20} />
        </div>
        <form className="space-y-5 p-6" onSubmit={submit}>
          <p className="text-sm leading-6 text-mist">
            Unlock the control plane before viewing behavioral evidence or
            approving repository mutations.
          </p>
          <label className="block text-sm font-medium" htmlFor="operator-token">
            Operator access token
          </label>
          <input
            id="operator-token"
            className="connection-input w-full"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={state === 'checking'}
          />
          {error && <p className="text-sm text-amber">{error}</p>}
          <button
            className="primary-action w-full justify-center"
            type="submit"
            disabled={state === 'checking'}
          >
            {state === 'checking' ? (
              <CircleDashed className="is-spinning" size={17} />
            ) : (
              <ShieldCheck size={17} />
            )}
            {state === 'checking' ? 'Verifying access' : 'Unlock Darwin'}
          </button>
        </form>
      </section>
    </main>
  );
}

function App() {
  return import.meta.env.MODE === 'test' ? (
    <DarwinDashboard />
  ) : (
    <OperatorBoundary />
  );
}

export default App;
