import {
  HealthResponseSchema,
  type EvolutionAnalysisResponse,
  type EvolutionRecord,
  type FitnessBreakdown,
  type MutationDiff,
  type SimulationSummary,
  type StoredTelemetryEvent,
  type ValidationResult,
} from '@darwin/shared';
import {
  Activity,
  AlertTriangle,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Code2,
  Database,
  FileCheck2,
  FlaskConical,
  Gauge,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  Maximize2,
  Menu,
  Network,
  Radar,
  Rocket,
  RotateCcw,
  Server,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useEvolutionDemo, type DemoStage } from './demo/useEvolutionDemo';
import { ProjectFlow } from './projectflow/ProjectFlow';
import type { ProjectFlowVariant } from './projectflow/data';
import {
  useLiveTelemetry,
  type LiveTelemetryState,
} from './telemetry/useLiveTelemetry';

type HealthState = 'checking' | 'online' | 'offline';

const navItems = [
  { label: 'Control room', icon: LayoutDashboard, active: true },
  { label: 'Organism', icon: Box, active: false },
  { label: 'Observations', icon: Radar, active: false },
  { label: 'Mutations', icon: FlaskConical, active: false },
  { label: 'Fossil record', icon: GitBranch, active: false },
] as const;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

function App() {
  const [health, setHealth] = useState<HealthState>('checking');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const organismOnly =
    new URLSearchParams(window.location.search).get('view') === 'organism';
  const [organismVariant, setOrganismVariant] = useState<ProjectFlowVariant>(
    () =>
      new URLSearchParams(window.location.search).get('variant') === 'evolved'
        ? 'evolved'
        : 'baseline',
  );
  const demo = useEvolutionDemo();
  const liveTelemetry = useLiveTelemetry();
  const observed = demo.eventCount.toLocaleString('en-US');
  const measuredFitness = demo.analysis
    ? demo.organism.variant === 'evolved'
      ? demo.analysis.fitness.evolved.score
      : demo.analysis.fitness.baseline.score
    : (demo.timeline.at(-1)?.fitness.score ?? null);

  const metrics = [
    {
      label: 'Interactions observed',
      value: observed,
      meta:
        demo.stage === 'observing'
          ? 'Seed 1859 in progress'
          : demo.eventCount === 10_000
            ? 'Deterministic sample complete'
            : 'Awaiting observation',
      tone: demo.eventCount === 10_000 ? 'signal' : 'neutral',
    },
    {
      label: 'Evolution cycles',
      value: String(demo.organism.evolutionCycles),
      meta:
        demo.organism.evolutionCycles > 0
          ? 'Mutation survived selection'
          : 'No mutations retained',
      tone: demo.organism.evolutionCycles > 0 ? 'signal' : 'neutral',
    },
    {
      label: 'Current fitness',
      value: measuredFitness === null ? '--' : measuredFitness.toFixed(1),
      meta:
        demo.organism.variant === 'evolved'
          ? demo.analysis
            ? `+${demo.analysis.fitness.delta.toFixed(1)} fitness`
            : 'Released fitness measured'
          : demo.analysis
            ? 'Baseline measured'
            : 'Baseline not measured',
      tone: demo.organism.variant === 'evolved' ? 'signal' : 'amber',
    },
    {
      label: 'Genome version',
      value: demo.organism.genomeVersion,
      meta:
        demo.organism.variant === 'evolved'
          ? 'Mutation released'
          : 'Baseline retained',
      tone: demo.organism.variant === 'evolved' ? 'signal' : 'neutral',
    },
  ] as const;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Health request failed');
        const parsed = HealthResponseSchema.safeParse(await response.json());
        setHealth(parsed.success ? 'online' : 'offline');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setHealth('offline');
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (organismOnly) return;
    setOrganismVariant(demo.organism.variant);
  }, [demo.organism.variant, organismOnly]);

  if (organismOnly) {
    return (
      <div className="organism-preview-page">
        <header>
          <a href="/" className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <strong>DARWIN</strong>
          </a>
          <span>ProjectFlow organism</span>
          <div
            className="variant-control"
            role="group"
            aria-label="ProjectFlow variant"
          >
            <button
              className={organismVariant === 'baseline' ? 'is-active' : ''}
              type="button"
              onClick={() => setOrganismVariant('baseline')}
            >
              Baseline <span>v1.0</span>
            </button>
            <button
              className={organismVariant === 'evolved' ? 'is-active' : ''}
              type="button"
              onClick={() => setOrganismVariant('evolved')}
            >
              Evolved <span>v1.1</span>
            </button>
          </div>
        </header>
        <ProjectFlow variant={organismVariant} />
      </div>
    );
  }

  useEffect(() => {
    if (window.location.hash !== '#organism') return;

    requestAnimationFrame(() => {
      document.getElementById('organism')?.scrollIntoView();
    });
  }, []);

  return (
    <div className="min-h-screen bg-carbon text-white">
      <aside className={navigationOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="flex h-20 items-center justify-between border-b border-line px-5">
          <a
            className="flex items-center gap-3"
            href="#top"
            aria-label="Darwin control room"
          >
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span className="text-[17px] font-semibold tracking-[0.16em]">
              DARWIN
            </span>
          </a>
          <button
            className="icon-button lg:hidden"
            type="button"
            onClick={() => setNavigationOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-6" aria-label="Primary navigation">
          <p className="section-label px-3">Workspace</p>
          <ul className="mt-3 space-y-1">
            {navItems.map(({ label, icon: Icon, active }) => (
              <li key={label}>
                <a
                  className={active ? 'nav-item nav-item-active' : 'nav-item'}
                  href={
                    active
                      ? '#top'
                      : `#${label.toLowerCase().replace(' ', '-')}`
                  }
                  onClick={() => setNavigationOpen(false)}
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
            ))}
          </ul>
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <span
              className={`status-dot status-${health}`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Darwin API</p>
              <p className="mt-0.5 text-xs capitalize text-mist">{health}</p>
            </div>
            <Server className="ml-auto text-mist" size={16} />
          </div>
        </div>
      </aside>

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
            <span className="hidden sm:inline">Organism</span>
            <ChevronRight className="hidden sm:block" size={14} />
            <span className="font-mono text-white">ProjectFlow</span>
          </div>
          <div className="ml-auto flex items-center gap-2 border-l border-line pl-4 text-xs text-mist">
            <ShieldCheck size={15} className="text-signal" />
            <span>Controlled mode</span>
            <button
              className="icon-button ml-2"
              type="button"
              onClick={() => void demo.reset()}
              disabled={demo.stage === 'resetting'}
              aria-label="Reset evolution demo"
              title="Reset evolution demo"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1640px] px-5 pb-12 pt-8 sm:px-8 lg:px-10 lg:pt-11">
          <section className="hero-band" aria-labelledby="page-title">
            <div className="relative z-10 max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-signal">
                <Activity size={15} /> Control room
              </div>
              <h1
                id="page-title"
                className="mt-5 text-4xl font-semibold sm:text-5xl lg:text-[56px] lg:leading-[1.05]"
              >
                Darwin
              </h1>
              <p className="mt-3 text-xl text-white sm:text-2xl">
                Software that evolves.
              </p>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-mist sm:text-base">
                ProjectFlow is connected. Its genome is ready for observation,
                measurement, and controlled selection.
              </p>
            </div>
            <div className="hero-actions relative z-10 mt-8 flex flex-wrap items-center gap-4 lg:mt-0 lg:self-end">
              <button
                className="primary-action"
                type="button"
                onClick={() => void demo.observe()}
                disabled={!['idle', 'error'].includes(demo.stage)}
              >
                {demo.stage === 'observing' ? (
                  <CircleDashed className="is-spinning" size={17} />
                ) : demo.stage === 'released' ? (
                  <Check size={17} />
                ) : (
                  <Radar size={17} />
                )}
                {demo.stage === 'observing'
                  ? `Observing ${observed}`
                  : demo.stage === 'released'
                    ? 'Evolution cycle complete'
                    : demo.analysis
                      ? 'Observation complete'
                      : 'Observe 10,000 interactions'}
              </button>
              <span className={`demo-status status-${demo.stage}`}>
                {demo.stage === 'idle' && <CircleDashed size={15} />}
                {demo.stage === 'observing' && <Activity size={15} />}
                {demo.stage === 'proposal' && <FlaskConical size={15} />}
                {demo.stage === 'deciding' && <CircleDashed size={15} />}
                {demo.stage === 'approved' && <CheckCircle2 size={15} />}
                {demo.stage === 'validating' && <CircleDashed size={15} />}
                {demo.stage === 'validated' && <FileCheck2 size={15} />}
                {demo.stage === 'releasing' && <CircleDashed size={15} />}
                {demo.stage === 'released' && <Rocket size={15} />}
                {demo.stage === 'rejected' && <ShieldCheck size={15} />}
                {demo.stage === 'resetting' && <RotateCcw size={15} />}
                {demo.stage === 'error' && <AlertTriangle size={15} />}
                {stageLabel(demo.stage)}
              </span>
            </div>
            <div className="genome-watermark" aria-hidden="true">
              {Array.from({ length: 36 }, (_, index) => (
                <span
                  key={index}
                  className={index % 7 === 0 ? 'cell-active' : ''}
                />
              ))}
            </div>
          </section>

          <section className="metric-grid" aria-label="Organism metrics">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-mist">{metric.label}</p>
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

          <LiveTelemetryPanel telemetry={liveTelemetry} />

          {(demo.stage !== 'idle' || demo.error) && (
            <ObservationPanel
              eventCount={demo.eventCount}
              summary={demo.summary}
              stage={demo.stage}
              error={demo.error}
            />
          )}

          {demo.analysis && (
            <MutationWorkspace
              analysis={demo.analysis}
              stage={demo.stage}
              onDecision={(decision) => void demo.decide(decision)}
            />
          )}

          {demo.analysis && demo.mutationDiff && (
            <ValidationWorkspace
              analysis={demo.analysis}
              diff={demo.mutationDiff}
              validation={demo.validation}
              stage={demo.stage}
              onValidate={() => void demo.validate()}
              onRelease={() => void demo.release()}
            />
          )}

          <section className="mt-8 surface-panel" id="organism">
            <div className="panel-heading organism-heading">
              <div>
                <p className="section-label">Connected organism</p>
                <h2 className="mt-2 text-xl font-semibold">
                  ProjectFlow genome
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="variant-control"
                  role="group"
                  aria-label="ProjectFlow variant"
                >
                  <button
                    className={
                      organismVariant === 'baseline' ? 'is-active' : ''
                    }
                    type="button"
                    onClick={() => setOrganismVariant('baseline')}
                    aria-pressed={organismVariant === 'baseline'}
                  >
                    Baseline <span>v1.0</span>
                  </button>
                  <button
                    className={organismVariant === 'evolved' ? 'is-active' : ''}
                    type="button"
                    onClick={() => setOrganismVariant('evolved')}
                    aria-pressed={organismVariant === 'evolved'}
                  >
                    Evolved <span>v1.1</span>
                  </button>
                </div>
                <a
                  className="icon-button"
                  href={`/?view=organism&variant=${organismVariant}`}
                  aria-label="Open organism preview"
                  title="Open organism preview"
                >
                  <Maximize2 size={17} />
                </a>
              </div>
            </div>
            <ProjectFlow variant={organismVariant} />
          </section>

          <section className="mt-8 grid gap-8 lg:grid-cols-2">
            <aside
              className="surface-panel"
              aria-labelledby="system-status-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="section-label">System status</p>
                  <h2
                    id="system-status-title"
                    className="mt-2 text-xl font-semibold"
                  >
                    Organism ready
                  </h2>
                </div>
                <Network size={19} className="text-mist" />
              </div>
              <div className="divide-y divide-line px-5 sm:px-6">
                <StatusRow
                  icon={Database}
                  label="Shared contracts"
                  value="Ready"
                  ready
                />
                <StatusRow
                  icon={Server}
                  label="Worker API"
                  value={health === 'online' ? 'Online' : health}
                  ready={health === 'online'}
                />
                <StatusRow
                  icon={LayoutDashboard}
                  label="ProjectFlow variants"
                  value="2 ready"
                  ready
                />
                <StatusRow
                  icon={Radar}
                  label="Telemetry"
                  value={
                    demo.eventCount === 10_000 ? '10,000 observed' : 'Ready'
                  }
                  ready={demo.eventCount === 10_000}
                />
              </div>
            </aside>

            <aside
              className="surface-panel"
              aria-labelledby="variant-summary-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="section-label">Genome comparison</p>
                  <h2
                    id="variant-summary-title"
                    className="mt-2 text-xl font-semibold"
                  >
                    {organismVariant === 'baseline'
                      ? 'Visible friction'
                      : 'Candidate mutation'}
                  </h2>
                </div>
                <GitCompareArrows size={19} className="text-mist" />
              </div>
              <div className="variant-summary">
                {organismVariant === 'baseline' ? (
                  <>
                    <p>
                      <span>01</span> Tasks sit behind Projects and a separate
                      Tasks route.
                    </p>
                    <p>
                      <span>02</span> Search appears only inside the task
                      directory.
                    </p>
                    <p>
                      <span>03</span> The dashboard competes for attention with
                      seven widgets.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      <span>01</span> My Work opens directly on assigned
                      priorities.
                    </p>
                    <p>
                      <span>02</span> Search and quick task creation remain
                      globally available.
                    </p>
                    <p>
                      <span>03</span> Reports become concise, actionable
                      Insights.
                    </p>
                  </>
                )}
              </div>
            </aside>
          </section>

          <section
            className="mt-8 surface-panel"
            id="fossil-record"
            aria-labelledby="fossil-title"
          >
            <div className="panel-heading">
              <div>
                <p className="section-label">Evolution history</p>
                <h2 id="fossil-title" className="mt-2 text-xl font-semibold">
                  Fossil record
                </h2>
              </div>
              <GitBranch size={19} className="text-mist" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-mist">
                  <tr>
                    <th className="px-6 py-3 font-medium">Genome</th>
                    <th className="px-6 py-3 font-medium">Event</th>
                    <th className="px-6 py-3 font-medium">Selection</th>
                    <th className="px-6 py-3 font-medium">Fitness</th>
                    <th className="px-6 py-3 text-right font-medium">State</th>
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
                  {demo.timeline.length === 0 ? (
                    <tr className="border-t border-line">
                      <td className="px-6 py-5 font-mono">v1.0</td>
                      <td className="px-6 py-5 text-mist">
                        ProjectFlow organism connected
                      </td>
                      <td className="px-6 py-5 text-mist">Baseline</td>
                      <td className="px-6 py-5 font-mono text-mist">--</td>
                      <td className="px-6 py-5 text-right">
                        <span className="status-badge">CURRENT</span>
                      </td>
                    </tr>
                  ) : (
                    demo.timeline.map((record, index) => (
                      <FossilRow
                        key={record.id}
                        record={record}
                        current={index === demo.timeline.length - 1}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
            <p>ProjectFlow / controlled evolution environment</p>
            <p className="font-mono">DARWIN CORE 0.9.0</p>
          </footer>
        </div>
      </main>
    </div>
  );
}

const stageLabel = (stage: DemoStage) => {
  const labels: Record<DemoStage, string> = {
    idle: 'Seed 1859 locked',
    observing: 'Telemetry stream active',
    proposal: 'Selection pressure detected',
    deciding: 'Recording decision',
    approved: 'Mutation approved · validation required',
    validating: 'Repository checks in progress',
    validated: 'Mutation passed validation',
    releasing: 'Applying selected genome',
    released: 'Mutation survived · evolved active',
    rejected: 'Failed selection · baseline retained',
    resetting: 'Restoring baseline',
    error: 'Evolution cycle interrupted',
  };
  return labels[stage];
};

const analysisModeLabel = (analysis: EvolutionAnalysisResponse) => {
  if (analysis.mode === 'live') return `${analysis.model} live`;
  if (analysis.mode === 'fallback') {
    return `Mock fallback · ${analysis.fallbackReason?.replaceAll('_', ' ') ?? 'unavailable'}`;
  }
  return 'Deterministic mock';
};

function LiveTelemetryPanel({ telemetry }: { telemetry: LiveTelemetryState }) {
  const sessions = [
    ...new Set(telemetry.events.map((event) => event.sessionId)),
  ];
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const visibleEvents = selectedSession
    ? telemetry.events.filter((event) => event.sessionId === selectedSession)
    : telemetry.events;
  const participants = new Set(
    telemetry.events.map((event) => event.participantId),
  ).size;

  return (
    <section className="mt-8 surface-panel live-evidence" id="real-evidence">
      <div className="panel-heading live-evidence-heading">
        <div>
          <p className="section-label">Measured source · real users</p>
          <h2 className="mt-2 text-xl font-semibold">Live study evidence</h2>
          <p className="mt-2 text-sm text-mist">
            Ordered semantic events from standalone ProjectFlow.
          </p>
        </div>
        <div className="live-evidence-actions">
          <span className={`source-status source-${telemetry.status}`}>
            <span /> {telemetry.status}
          </span>
          <a
            className="secondary-action"
            href="http://localhost:5174/study"
            target="_blank"
            rel="noreferrer"
          >
            Open study <ChevronRight size={15} />
          </a>
        </div>
      </div>

      <div className="evidence-stats" aria-label="Real study counts">
        <div>
          <Database size={16} />
          <span>Raw events</span>
          <strong>{telemetry.count}</strong>
        </div>
        <div>
          <Network size={16} />
          <span>Sessions</span>
          <strong>{sessions.length}</strong>
        </div>
        <div>
          <Users size={16} />
          <span>Participants</span>
          <strong>{participants}</strong>
        </div>
      </div>

      {telemetry.events.length ? (
        <div className="trace-layout">
          <div className="session-index">
            <button
              className={selectedSession === null ? 'is-active' : ''}
              type="button"
              onClick={() => setSelectedSession(null)}
            >
              All recent events <span>{telemetry.events.length}</span>
            </button>
            {sessions.map((session) => {
              const count = telemetry.events.filter(
                (event) => event.sessionId === session,
              ).length;
              return (
                <button
                  className={selectedSession === session ? 'is-active' : ''}
                  key={session}
                  type="button"
                  onClick={() => setSelectedSession(session)}
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
            <span>Start a study task to create the first ordered trace.</span>
          </div>
        </div>
      )}
    </section>
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

const shortId = (value: string) => {
  const suffix = value.split('-').at(-1) ?? value;
  return suffix.length > 10 ? suffix.slice(0, 10) : suffix;
};

function ObservationPanel({
  eventCount,
  summary,
  stage,
  error,
}: {
  eventCount: number;
  summary: SimulationSummary | null;
  stage: DemoStage;
  error: string | null;
}) {
  const progress = Math.min(100, (eventCount / 10_000) * 100);
  const eventTypes = summary
    ? Object.entries(summary.eventTypeCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
    : [];
  const personas = summary
    ? Object.entries(summary.personaCounts).sort(
        (left, right) => right[1] - left[1],
      )
    : [];

  return (
    <section
      className="mt-8 surface-panel observation-panel"
      id="observations"
      aria-labelledby="observation-title"
      aria-live="polite"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Observation cycle / seed 1859</p>
          <h2 id="observation-title" className="mt-2 text-xl font-semibold">
            {stage === 'observing'
              ? 'Reading selection pressure'
              : error
                ? 'Observation interrupted'
                : '10,000 interactions observed'}
          </h2>
        </div>
        <span className="observation-state">
          <span
            className={
              stage === 'observing' ? 'stream-dot' : 'stream-dot complete'
            }
          />
          {stage === 'observing' ? 'LIVE' : error ? 'HALTED' : 'COMPLETE'}
        </span>
      </div>

      {error ? (
        <div className="error-band">
          <AlertTriangle size={17} />
          <p>{error}</p>
        </div>
      ) : (
        <div className="observation-layout">
          <div className="observation-progress">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="section-label">Interactions ingested</p>
                <p className="observation-count">
                  {eventCount.toLocaleString('en-US')}
                  <span>/ 10,000</span>
                </p>
              </div>
              <p className="font-mono text-sm text-signal">
                {progress.toFixed(0)}%
              </p>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="Telemetry observation progress"
              aria-valuemin={0}
              aria-valuemax={10_000}
              aria-valuenow={eventCount}
            >
              <span style={{ width: `${progress}%` }} />
            </div>

            <div className="observation-stats">
              <ObservationStat
                icon={Users}
                label="Sessions"
                value={
                  summary?.metrics.sessions.toLocaleString('en-US') ?? '---'
                }
              />
              <ObservationStat
                icon={CheckCircle2}
                label="Completion"
                value={
                  summary
                    ? `${(summary.metrics.workflowCompletionRate * 100).toFixed(1)}%`
                    : '---'
                }
              />
              <ObservationStat
                icon={Gauge}
                label="Page views / flow"
                value={
                  summary?.metrics.averagePageViewsPerWorkflow.toFixed(2) ??
                  '---'
                }
              />
              <ObservationStat
                icon={TrendingUp}
                label="Backtracks / flow"
                value={
                  summary?.metrics.averageBacktracksPerWorkflow.toFixed(2) ??
                  '---'
                }
              />
            </div>
          </div>

          <div
            className="telemetry-stream"
            aria-label="Telemetry aggregate stream"
          >
            <div className="stream-heading">
              <span>Event aggregate</span>
              <span>Count</span>
            </div>
            {eventTypes.map(([eventType, count], index) => (
              <div className="stream-row" key={eventType}>
                <span className="stream-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{eventType.replaceAll('_', ' ')}</span>
                <strong>{count.toLocaleString('en-US')}</strong>
              </div>
            ))}
            {eventTypes.length === 0 && (
              <div className="stream-placeholder">
                <CircleDashed size={16} /> Awaiting first batch
              </div>
            )}
            {personas.length > 0 && (
              <div className="persona-strip">
                {personas.map(([persona, count]) => (
                  <span key={persona}>
                    {persona.replaceAll('_', ' ')}
                    <strong>{count.toLocaleString('en-US')}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ObservationStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MutationWorkspace({
  analysis,
  stage,
  onDecision,
}: {
  analysis: EvolutionAnalysisResponse;
  stage: DemoStage;
  onDecision: (decision: 'approve' | 'reject') => void;
}) {
  const proposal = analysis.proposal;
  const pending = proposal.status === 'proposed';

  return (
    <section
      className="mt-8 surface-panel"
      id="mutations"
      aria-labelledby="mutation-title"
    >
      <div className="panel-heading mutation-heading">
        <div>
          <p className="section-label">Selection pressure / ranked analysis</p>
          <h2 id="mutation-title" className="mt-2 text-xl font-semibold">
            One controlled mutation proposed
          </h2>
        </div>
        <div
          className={`analysis-mode mode-${analysis.mode}`}
          title={`Analysis model: ${analysis.model}`}
        >
          <FlaskConical size={14} />
          <span>{analysisModeLabel(analysis)}</span>
        </div>
      </div>

      <div className="mutation-layout">
        <div className="pressure-column">
          <div className="column-heading">
            <span>Selection pressure</span>
            <span>Impact</span>
          </div>
          {analysis.findings.slice(0, 4).map((finding, index) => (
            <article className="pressure-row" key={finding.id}>
              <span className="pressure-rank">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{finding.title}</h3>
                <p>{finding.evidence[0]}</p>
                <span>{Math.round(finding.confidence * 100)}% confidence</span>
              </div>
              <strong>{finding.impact}</strong>
            </article>
          ))}
        </div>

        <div className="proposal-column">
          <div className="proposal-kicker">
            <span>Mutation {proposal.id}</span>
            <span className={`proposal-status status-${proposal.status}`}>
              {proposal.status}
            </span>
          </div>
          <h3>{proposal.name}</h3>
          <p className="proposal-hypothesis">{proposal.hypothesis}</p>

          <div className="fitness-comparison" aria-label="Fitness comparison">
            <FitnessBar
              label="Baseline"
              score={analysis.fitness.baseline.score}
            />
            <FitnessBar
              label="Evolved"
              score={analysis.fitness.evolved.score}
            />
            <div className="fitness-delta">
              +{analysis.fitness.delta.toFixed(1)}
              <span>predicted fitness</span>
            </div>
          </div>

          <div className="implementation-brief">
            <p className="section-label">Implementation brief</p>
            <p>{proposal.implementationSummary}</p>
            <div>
              {proposal.affectedFiles.map((file) => (
                <code key={file}>{file}</code>
              ))}
            </div>
          </div>

          {pending ? (
            <div className="decision-bar">
              <p>
                <ShieldCheck size={15} /> Human approval required
              </p>
              <div>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => onDecision('reject')}
                  disabled={stage === 'deciding'}
                >
                  <X size={16} /> Reject
                </button>
                <button
                  className="approve-action"
                  type="button"
                  onClick={() => onDecision('approve')}
                  disabled={stage === 'deciding'}
                >
                  {stage === 'deciding' ? (
                    <CircleDashed className="is-spinning" size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  Approve mutation
                </button>
              </div>
            </div>
          ) : (
            <div className={`decision-outcome outcome-${proposal.status}`}>
              {proposal.status === 'rejected' ? (
                <ShieldCheck size={18} />
              ) : proposal.status === 'released' ? (
                <Rocket size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
              <div>
                <strong>{proposalOutcome(proposal.status).title}</strong>
                <span>{proposalOutcome(proposal.status).description}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const proposalOutcome = (
  status: EvolutionAnalysisResponse['proposal']['status'],
) => {
  const outcomes = {
    proposed: {
      title: 'Mutation proposed',
      description: 'Human approval is required.',
    },
    approved: {
      title: 'Mutation approved',
      description: 'The implementation artifact is ready for validation.',
    },
    rejected: {
      title: 'Mutation failed selection',
      description: 'ProjectFlow v1.0 remains active.',
    },
    validated: {
      title: 'Mutation validated',
      description: 'All recorded repository checks passed.',
    },
    released: {
      title: 'Mutation survived selection',
      description: 'ProjectFlow v1.1 is now the active organism.',
    },
  } as const;
  return outcomes[status];
};

function ValidationWorkspace({
  analysis,
  diff,
  validation,
  stage,
  onValidate,
  onRelease,
}: {
  analysis: EvolutionAnalysisResponse;
  diff: MutationDiff;
  validation: ValidationResult | null;
  stage: DemoStage;
  onValidate: () => void;
  onRelease: () => void;
}) {
  const lines = diff.patch.split('\n');
  const validationPassed = validation?.status === 'passed';

  return (
    <section
      className="mt-8 surface-panel execution-panel"
      id="validation"
      aria-labelledby="validation-title"
    >
      <div className="panel-heading execution-heading">
        <div>
          <p className="section-label">
            Codex implementation / controlled scope
          </p>
          <h2 id="validation-title" className="mt-2 text-xl font-semibold">
            Mutation execution
          </h2>
        </div>
        <span className="artifact-badge">
          <Code2 size={14} /> Repository artifact
        </span>
      </div>

      <div className="execution-steps" aria-label="Mutation execution progress">
        <ExecutionStep index="01" label="Brief" state="complete" />
        <ExecutionStep index="02" label="Diff" state="complete" />
        <ExecutionStep
          index="03"
          label="Validation"
          state={
            stage === 'validating'
              ? 'active'
              : validationPassed
                ? 'complete'
                : 'pending'
          }
        />
        <ExecutionStep
          index="04"
          label="Release"
          state={
            stage === 'released'
              ? 'complete'
              : stage === 'releasing'
                ? 'active'
                : 'pending'
          }
        />
      </div>

      <div className="execution-layout">
        <div className="diff-column">
          <div className="artifact-heading">
            <div>
              <span>Actual source comparison</span>
              <strong>
                {diff.baseRef.split('/').at(-1)} →{' '}
                {diff.targetRef.split('/').at(-1)}
              </strong>
            </div>
            <span>{lines.length} lines</span>
          </div>
          <pre className="diff-viewer" aria-label="ProjectFlow mutation diff">
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
        </div>

        <div className="validation-column">
          <div className="artifact-heading">
            <div>
              <span>Validation evidence</span>
              <strong>
                {validation
                  ? `Recorded repository run · ${validation.commit}`
                  : 'Awaiting controlled validation'}
              </strong>
            </div>
            {validation && (
              <span className={`check-summary summary-${validation.status}`}>
                {validation.status}
              </span>
            )}
          </div>

          {validation ? (
            <div className="validation-checks">
              {validation.checks.map((check) => (
                <details key={check.name}>
                  <summary>
                    <CheckCircle2 size={15} />
                    <span>{check.name}</span>
                    <strong>{(check.durationMs / 1_000).toFixed(1)}s</strong>
                  </summary>
                  <pre>{check.output}</pre>
                </details>
              ))}
            </div>
          ) : (
            <div className="validation-ready">
              <FileCheck2 size={22} />
              <strong>Recorded checks ready</strong>
              <span>TypeScript, unit and UX tests, production build</span>
            </div>
          )}

          <FitnessEvidence
            baseline={analysis.fitness.baseline}
            evolved={analysis.fitness.evolved}
          />

          <div className="validation-actions">
            {stage === 'approved' && (
              <button
                className="approve-action"
                type="button"
                onClick={onValidate}
              >
                <FileCheck2 size={16} /> Run recorded validation
              </button>
            )}
            {stage === 'validating' && (
              <button className="approve-action" type="button" disabled>
                <CircleDashed className="is-spinning" size={16} /> Validating
              </button>
            )}
            {stage === 'validated' && (
              <button
                className="approve-action"
                type="button"
                onClick={onRelease}
              >
                <Rocket size={16} /> Release evolved genome
              </button>
            )}
            {stage === 'releasing' && (
              <button className="approve-action" type="button" disabled>
                <CircleDashed className="is-spinning" size={16} /> Releasing
              </button>
            )}
            {stage === 'released' && (
              <div className="release-confirmation">
                <CheckCircle2 size={17} /> Mutation survived selection
              </div>
            )}
          </div>
        </div>
      </div>
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

const fitnessMetricLabels: Array<[keyof FitnessBreakdown, string]> = [
  ['completionRate', 'Completion'],
  ['navigationEfficiency', 'Navigation'],
  ['inverseErrorRate', 'Error resistance'],
  ['featureDiscovery', 'Discovery'],
  ['inverseTaskDuration', 'Task speed'],
];

function FitnessEvidence({
  baseline,
  evolved,
}: {
  baseline: FitnessBreakdown;
  evolved: FitnessBreakdown;
}) {
  return (
    <div className="fitness-evidence">
      <div className="artifact-heading">
        <div>
          <span>Fitness replay</span>
          <strong>Before / after metrics</strong>
        </div>
        <span className="fitness-gain">
          +{(evolved.score - baseline.score).toFixed(1)}
        </span>
      </div>
      <div className="fitness-evidence-grid">
        {fitnessMetricLabels.map(([key, label]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{baseline[key].toFixed(1)}</strong>
            <ChevronRight size={12} />
            <strong>{evolved[key].toFixed(1)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function FossilRow({
  record,
  current,
}: {
  record: EvolutionRecord;
  current: boolean;
}) {
  const failed = record.outcome === 'failed_selection';
  return (
    <tr className="border-t border-line">
      <td className="px-6 py-5 font-mono">{record.version}</td>
      <td className="px-6 py-5 text-mist">
        {record.outcome === 'baseline'
          ? 'ProjectFlow baseline measured'
          : 'Promote global task discovery'}
      </td>
      <td className="px-6 py-5 text-mist">
        {record.outcome === 'baseline'
          ? 'Baseline'
          : record.outcome === 'survived'
            ? 'Survived selection'
            : 'Failed selection'}
      </td>
      <td className="px-6 py-5 font-mono text-mist">
        {record.fitness.score.toFixed(1)}
      </td>
      <td className="px-6 py-5 text-right">
        <span className={failed ? 'status-badge is-failed' : 'status-badge'}>
          {failed ? 'REJECTED' : current ? 'CURRENT' : 'RETAINED'}
        </span>
      </td>
    </tr>
  );
}

function FitnessBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="fitness-row">
      <span>{label}</span>
      <div>
        <i style={{ width: `${score}%` }} />
      </div>
      <strong>{score.toFixed(1)}</strong>
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  ready = false,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  ready?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <Icon size={17} className="text-mist" />
      <span className="text-sm text-mist">{label}</span>
      <span
        className={`ml-auto font-mono text-xs capitalize ${ready ? 'text-signal' : 'text-white'}`}
      >
        {value}
      </span>
    </div>
  );
}

export default App;
