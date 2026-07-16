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
  ArrowDownRight,
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
  FileCheck2,
  FlaskConical,
  Gauge,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  Maximize2,
  Menu,
  MousePointer2,
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
import type { ProjectFlowVariant } from './projectflow/data';
import { projectFlowGenomes } from './projectflow/genomes';
import {
  useLiveTelemetry,
  type LiveTelemetryState,
} from './telemetry/useLiveTelemetry';

type HealthState = 'checking' | 'online' | 'offline';

interface ApiHealthState {
  status: HealthState;
  version: string | null;
  analysis: {
    mode: 'mock' | 'live';
    model: string;
    liveModelAvailable: boolean;
  } | null;
}

const navItems = [
  {
    label: 'Control room',
    icon: LayoutDashboard,
    active: true,
    help: 'Run and monitor one complete controlled evolution cycle.',
  },
  {
    label: 'Target application',
    icon: Box,
    active: false,
    help: 'Open the real standalone ProjectFlow application in a dedicated full-screen view.',
  },
  {
    label: 'Observations',
    icon: Radar,
    active: false,
    help: 'Review the deterministic telemetry sample and selection pressure.',
  },
  {
    label: 'Mutations',
    icon: FlaskConical,
    active: false,
    help: 'Review GPT-5.6 reasoning and approve or reject its proposal.',
  },
  {
    label: 'Fossil record',
    icon: GitBranch,
    active: false,
    help: 'See the retained genome history and measured fitness record.',
  },
] as const;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';
const projectFlowBaseUrl =
  import.meta.env.VITE_PROJECTFLOW_BASE_URL ?? 'http://localhost:5174';

const genomeComparison = [
  {
    locus: 'Initial route',
    baseline: projectFlowGenomes.baseline.initialRoute,
    evolved: projectFlowGenomes.evolved.initialRoute,
  },
  {
    locus: 'Task destination',
    baseline: projectFlowGenomes.baseline.taskDestination,
    evolved: projectFlowGenomes.evolved.taskDestination,
  },
  {
    locus: 'Global search',
    baseline: projectFlowGenomes.baseline.globalSearch ? 'enabled' : 'absent',
    evolved: projectFlowGenomes.evolved.globalSearch ? 'enabled' : 'absent',
  },
  {
    locus: 'Quick create',
    baseline: projectFlowGenomes.baseline.globalQuickCreate
      ? 'enabled'
      : 'absent',
    evolved: projectFlowGenomes.evolved.globalQuickCreate
      ? 'enabled'
      : 'absent',
  },
  {
    locus: 'Primary navigation',
    baseline: projectFlowGenomes.baseline.navigation
      .map((item) => item.label)
      .join(' / '),
    evolved: projectFlowGenomes.evolved.navigation
      .map((item) => item.label)
      .join(' / '),
  },
] as const;

function App() {
  const [health, setHealth] = useState<ApiHealthState>({
    status: 'checking',
    version: null,
    analysis: null,
  });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const targetOnly =
    new URLSearchParams(window.location.search).get('view') === 'target';
  const [organismVariant, setOrganismVariant] = useState<ProjectFlowVariant>(
    () =>
      new URLSearchParams(window.location.search).get('variant') === 'evolved'
        ? 'evolved'
        : 'baseline',
  );
  const demo = useEvolutionDemo();
  const liveTelemetry = useLiveTelemetry();
  const resetDemo = async () => {
    if (await demo.reset()) liveTelemetry.resetState();
  };
  const observed = demo.eventCount.toLocaleString('en-US');
  const measuredFitness = demo.analysis
    ? demo.organism.variant === 'evolved'
      ? demo.analysis.fitness.evolved.score
      : demo.analysis.fitness.baseline.score
    : (demo.timeline.at(-1)?.fitness.score ?? null);

  const metrics = [
    {
      label: 'Interactions observed',
      help: 'Synthetic interactions processed in the controlled 10,000-event demonstration. Live human evidence is shown separately below.',
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
      help: 'Mutations that completed approval, validation, release, and retention.',
      value: String(demo.organism.evolutionCycles),
      meta:
        demo.organism.evolutionCycles > 0
          ? 'Mutation survived selection'
          : 'No mutations retained',
      tone: demo.organism.evolutionCycles > 0 ? 'signal' : 'neutral',
    },
    {
      label: 'Current fitness',
      help: 'A 0-100 weighted score covering completion, navigation efficiency, errors, discovery, and task duration.',
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
      help: 'The active ProjectFlow configuration. v1.0 is baseline; v1.1 contains the retained navigation mutation.',
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

  useEffect(() => {
    if (targetOnly) return;
    setOrganismVariant(demo.organism.variant);
  }, [demo.organism.variant, targetOnly]);

  if (targetOnly) {
    return (
      <div className="organism-preview-page">
        <header>
          <a href="/" className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <strong>DARWIN</strong>
          </a>
          <span>ProjectFlow target application</span>
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
        <iframe
          className="organism-standalone-frame"
          src={`${projectFlowBaseUrl}/?variant=${organismVariant}`}
          title={`ProjectFlow ${organismVariant} application`}
        />
      </div>
    );
  }

  useEffect(() => {
    if (window.location.hash !== '#target-application') return;

    requestAnimationFrame(() => {
      document.getElementById('target-application')?.scrollIntoView();
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
            {navItems.map(({ label, icon: Icon, active, help }) => (
              <li key={label}>
                <a
                  className={active ? 'nav-item nav-item-active' : 'nav-item'}
                  href={
                    active
                      ? '#top'
                      : `#${label.toLowerCase().replace(' ', '-')}`
                  }
                  onClick={() => setNavigationOpen(false)}
                  data-explain={help}
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
            <span className="hidden sm:inline">Target application</span>
            <ChevronRight className="hidden sm:block" size={14} />
            <span className="font-mono text-white">ProjectFlow</span>
          </div>
          <div
            className="ml-auto flex items-center gap-2 border-l border-line pl-4 text-xs text-mist"
            data-explain="Controlled mode requires human approval and uses a bounded target, diff, validation workflow, and explicit release step."
          >
            <ShieldCheck size={15} className="text-signal" />
            <span>Controlled mode</span>
            <button
              className="icon-button ml-2"
              type="button"
              onClick={() => void resetDemo()}
              disabled={demo.stage === 'resetting'}
              aria-label="Reset evolution demo"
              data-explain="Delete telemetry, evidence, reasoning, validation, timeline state, and restore ProjectFlow v1.0."
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1640px] px-5 pb-12 pt-8 sm:px-8 lg:px-10 lg:pt-11">
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
                ProjectFlow is connected. Its genome is ready for observation,
                measurement, and controlled selection.
              </p>
            </div>
            <div className="hero-actions relative z-10 mt-8 flex flex-wrap items-center gap-4 lg:mt-0 lg:self-end">
              <div className="start-action-wrap">
                {['idle', 'error'].includes(demo.stage) && !demo.analysis && (
                  <span className="start-here-cue" aria-hidden="true">
                    Start here <ArrowDownRight size={17} />
                  </span>
                )}
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => void demo.observe()}
                  disabled={!['idle', 'error'].includes(demo.stage)}
                  data-explain="Creates exactly 10,000 deterministic ProjectFlow interactions, calculates selection pressure, then invokes the configured GPT-5.6 analyzer once for the resulting evidence."
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
              </div>
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
          </section>

          <EvolutionGuide
            stage={demo.stage}
            analysis={health.analysis}
            resultMode={demo.analysis?.mode ?? null}
          />

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

          <LiveTelemetryPanel
            telemetry={liveTelemetry}
            analysisConfig={health.analysis}
          />

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

          <section className="mt-8 surface-panel" id="target-application">
            <div className="panel-heading organism-heading">
              <div>
                <p className="section-label">Target application</p>
                <div className="heading-with-help">
                  <h2 className="mt-2 text-xl font-semibold">
                    Standalone ProjectFlow
                  </h2>
                  <InfoTip text="This opens the real standalone ProjectFlow application from apps/projectflow in a dedicated view. It is the same application that emits live telemetry." />
                </div>
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
                    data-explain="Open ProjectFlow v1.0 with the original dashboard-first navigation and project-scoped task discovery."
                  >
                    Baseline <span>v1.0</span>
                  </button>
                  <button
                    className={organismVariant === 'evolved' ? 'is-active' : ''}
                    type="button"
                    onClick={() => setOrganismVariant('evolved')}
                    aria-pressed={organismVariant === 'evolved'}
                    data-explain="Open ProjectFlow v1.1 with My Work, global search, quick-create, and consolidated Insights."
                  >
                    Evolved <span>v1.1</span>
                  </button>
                </div>
                <a
                  className="primary-action target-open-action"
                  href={`/?view=target&variant=${organismVariant}`}
                  aria-label={`Open ProjectFlow ${organismVariant} target application`}
                  data-explain="Open the selected real ProjectFlow variant in a full-width dedicated view."
                >
                  <Maximize2 size={17} /> Open application
                </a>
              </div>
            </div>
            <div className="target-app-summary">
              <div>
                <span>Selected genome</span>
                <strong>
                  {organismVariant === 'baseline'
                    ? 'Baseline v1.0'
                    : 'Evolved v1.1'}
                </strong>
              </div>
              <p>
                Open the target separately to inspect the full product without
                compressing the control-room workflow.
              </p>
              <code>{projectFlowBaseUrl}</code>
            </div>
          </section>

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
                    health.version ? `v${health.version} online` : health.status
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
                  value={`${demo.organism.genomeVersion} · ${demo.organism.variant}`}
                  ready={demo.organism.variant === 'evolved'}
                  help="The variant and genome version currently retained by the Darwin evolution state machine."
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
                  <div className="heading-with-help">
                    <h2
                      id="variant-summary-title"
                      className="mt-2 text-xl font-semibold"
                    >
                      Five configured loci
                    </h2>
                    <InfoTip text="A direct comparison of the checked-in baseline and evolved ProjectFlow configuration that drives the two target variants." />
                  </div>
                </div>
                <GitCompareArrows size={19} className="text-mist" />
              </div>
              <div
                className="genome-comparison"
                role="table"
                aria-label="Configured genome comparison"
              >
                <div className="genome-comparison-header" role="row">
                  <span role="columnheader">Locus</span>
                  <strong
                    className={
                      organismVariant === 'baseline' ? 'is-active' : ''
                    }
                    role="columnheader"
                  >
                    Baseline · {projectFlowGenomes.baseline.version}
                  </strong>
                  <strong
                    className={organismVariant === 'evolved' ? 'is-active' : ''}
                    role="columnheader"
                  >
                    Evolved · {projectFlowGenomes.evolved.version}
                  </strong>
                </div>
                {genomeComparison.map((row) => (
                  <div
                    className="genome-comparison-row"
                    key={row.locus}
                    role="row"
                  >
                    <span role="cell">{row.locus}</span>
                    <code
                      className={
                        organismVariant === 'baseline' ? 'is-active' : ''
                      }
                      role="cell"
                    >
                      {row.baseline}
                    </code>
                    <code
                      className={
                        organismVariant === 'evolved' ? 'is-active' : ''
                      }
                      role="cell"
                    >
                      {row.evolved}
                    </code>
                  </div>
                ))}
                <div className="genome-comparison-source">
                  <Code2 size={13} /> Checked-in genome configuration
                </div>
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
                <div className="heading-with-help">
                  <h2 id="fossil-title" className="mt-2 text-xl font-semibold">
                    Fossil record
                  </h2>
                  <InfoTip text="The version history of retained and rejected evolution events, including the selected genome and fitness at each point." />
                </div>
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
                        ProjectFlow target application connected
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
            <p className="font-mono">DARWIN CORE 0.17.0</p>
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

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} aria-label={text}>
      <CircleHelp size={14} aria-hidden="true" />
      <span role="tooltip">{text}</span>
    </span>
  );
}

function EvolutionGuide({
  stage,
  analysis,
  resultMode,
}: {
  stage: DemoStage;
  analysis: ApiHealthState['analysis'];
  resultMode: EvolutionAnalysisResponse['mode'] | null;
}) {
  const rank: Record<DemoStage, number> = {
    idle: 1,
    observing: 2,
    proposal: 3,
    deciding: 3,
    approved: 4,
    validating: 4,
    validated: 5,
    releasing: 5,
    released: 6,
    rejected: 3,
    resetting: 1,
    error: 1,
  };
  const current = rank[stage];
  const modelMode = resultMode ?? analysis?.mode ?? 'mock';
  const model = analysis?.model ?? 'gpt-5.6';
  const modelLabel =
    modelMode === 'live'
      ? 'Live model call'
      : modelMode === 'fallback'
        ? 'Fallback result'
        : 'Deterministic mock';
  const steps = [
    {
      label: 'Observe',
      detail: '10,000 seeded interactions',
      help: 'The Worker generates an exact, deterministic sample across four ProjectFlow personas.',
    },
    {
      label: `${model} reasons`,
      detail: 'One structured call',
      help: 'After aggregation, the analyzer receives fitness, ranked friction, and ProjectFlow context. Live mode calls the OpenAI Responses API once; mock mode returns the same validated contract deterministically.',
    },
    {
      label: 'Human approval',
      detail: 'Accept or reject mutation',
      help: 'Darwin never releases the proposal automatically. A judge or operator must approve the bounded mutation.',
    },
    {
      label: 'Validate',
      detail: 'Diff and repository checks',
      help: 'The approved implementation artifact is checked with recorded TypeScript, unit, UX, and build validation.',
    },
    {
      label: 'Retain',
      detail: 'Release evolved genome',
      help: 'A passing mutation becomes ProjectFlow v1.1 and is written into the fossil record with its fitness.',
    },
  ];

  return (
    <section className="evolution-guide" aria-label="Guided evolution cycle">
      <div className="guide-heading">
        <div>
          <span className="section-label">Judge path</span>
          <strong>One controlled evolution cycle</strong>
        </div>
        <span
          className={`guide-model mode-${modelMode}`}
          data-explain={`${model} is invoked after telemetry has been aggregated. Current configuration: ${modelLabel}.`}
        >
          <BrainCircuit size={15} /> {model} · {modelLabel}
        </span>
      </div>
      <ol>
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const state =
            current > stepNumber
              ? 'complete'
              : current === stepNumber
                ? 'active'
                : 'pending';
          return (
            <li className={`guide-step is-${state}`} key={step.label}>
              <span className="guide-index">
                {state === 'complete' ? <Check size={13} /> : `0${stepNumber}`}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
              <InfoTip text={step.help} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LiveTelemetryPanel({
  telemetry,
  analysisConfig,
}: {
  telemetry: LiveTelemetryState;
  analysisConfig: ApiHealthState['analysis'];
}) {
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
  const behaviorSignals = telemetry.events.filter((event) =>
    [
      'hover_ended',
      'interaction_signal',
      'drag_attempted',
      'touch_cancelled',
    ].includes(event.eventType),
  ).length;
  const configuredModel = analysisConfig?.model ?? 'gpt-5.6';
  const liveModelAvailable = analysisConfig?.liveModelAvailable ?? false;

  return (
    <section className="mt-8 surface-panel live-evidence" id="real-evidence">
      <div className="panel-heading live-evidence-heading">
        <div>
          <p className="section-label">Measured source · real users</p>
          <div className="heading-with-help">
            <h2 className="mt-2 text-xl font-semibold">Live study evidence</h2>
            <InfoTip text="Real semantic events ingested from the standalone ProjectFlow application. The view shows ordered behavior, sessions, participants, and detector-ready signals without recording typed values." />
          </div>
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
            href={`${projectFlowBaseUrl}/study`}
            target="_blank"
            rel="noreferrer"
            data-explain="Open the standalone ProjectFlow telemetry view in a new tab and interact normally to create real semantic evidence."
          >
            Open study <ChevronRight size={15} />
          </a>
          <button
            className="primary-action evidence-action"
            type="button"
            disabled={!telemetry.count || telemetry.generating}
            onClick={() => void telemetry.generateEvidence()}
            data-explain="Run the deterministic evidence parser over the current D1 events to reconstruct attempts and emit citeable friction signals."
          >
            {telemetry.generating ? (
              <CircleDashed className="is-spinning" size={15} />
            ) : (
              <FileCheck2 size={15} />
            )}
            {telemetry.generating ? 'Parsing evidence' : 'Generate evidence'}
          </button>
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

      <div className="evidence-stats" aria-label="Real study counts">
        <div data-explain="Every persisted semantic event currently returned for this study.">
          <Database size={16} />
          <span>Raw events</span>
          <strong>{telemetry.count}</strong>
        </div>
        <div data-explain="Distinct ordered browser sessions in the current event sample.">
          <Network size={16} />
          <span>Sessions</span>
          <strong>{sessions.length}</strong>
        </div>
        <div data-explain="Anonymous participant identifiers represented in the current sample.">
          <Users size={16} />
          <span>Participants</span>
          <strong>{participants}</strong>
        </div>
        <div data-explain="Hover hesitation, rage click, false affordance, indecision, drag expectation, and touch-conflict observations.">
          <MousePointer2 size={16} />
          <span>Behavior signals</span>
          <strong>{behaviorSignals}</strong>
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
            <span>
              Open ProjectFlow and interact to create the first trace.
            </span>
          </div>
        </div>
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
                <dt>Attempts</dt>
                <dd>{telemetry.evidence.study.attempts}</dd>
              </div>
              <div>
                <dt>Signals</dt>
                <dd>{telemetry.evidence.frictionSignals.length}</dd>
              </div>
            </dl>
          </div>
          <div className="evidence-signals">
            {telemetry.evidence.frictionSignals.length ? (
              telemetry.evidence.frictionSignals.map((signal) => (
                <details key={signal.evidenceId}>
                  <summary>
                    <span>{signal.evidenceId}</span>
                    <strong>{signal.ruleId.replaceAll('_', ' ')}</strong>
                    <small>{signal.severity}</small>
                    <ChevronRight size={15} />
                  </summary>
                  <p>{signal.summary}</p>
                  <div className="signal-provenance">
                    <span>Rule {signal.ruleVersion}</span>
                    <span>
                      {signal.supportingEventIds.length} source events
                    </span>
                    <span>{signal.affectedAttemptIds.length} attempts</span>
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
                No detector threshold was crossed by the current real sample.
              </p>
            )}
          </div>
          <div className="reasoning-workspace">
            <div className="reasoning-heading">
              <div>
                <span className="section-label">OpenAI reasoning boundary</span>
                <div className="reasoning-title">
                  <strong>{configuredModel} evidence reasoning</strong>
                  <span
                    className={`model-runtime ${liveModelAvailable ? 'is-live' : 'is-mock'}`}
                  >
                    {liveModelAvailable ? 'LIVE API' : 'DETERMINISTIC MOCK'}
                  </span>
                  <InfoTip text="This is the model invocation point. One request is made per evidence hash and cached; invalid citations or protected scope are rejected before a proposal can continue." />
                </div>
                <p>
                  One structured call per evidence hash. Unknown citations and
                  protected scope are rejected.
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
                  <code>bounded traces</code>
                </div>
              </div>
              <button
                className="primary-action evidence-action"
                type="button"
                disabled={
                  !telemetry.evidence.frictionSignals.length ||
                  telemetry.analysing
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
                      : `Run ${configuredModel} mock`}
              </button>
            </div>
            {telemetry.analysis && (
              <div className="analysis-result">
                <div className="analysis-audit-line">
                  <span>{telemetry.analysis.mode}</span>
                  <code>{telemetry.analysis.model}</code>
                  <code>prompt {telemetry.analysis.promptVersion}</code>
                  <code>{telemetry.analysis.cacheKey.slice(0, 16)}...</code>
                </div>
                <div className="selected-mutation">
                  <div className="mutation-rank">SELECTED</div>
                  <div>
                    <h3>{telemetry.analysis.selectedMutation.title}</h3>
                    <p>{telemetry.analysis.selectedMutation.hypothesis}</p>
                    <div className="mutation-citations">
                      {telemetry.analysis.selectedMutation.evidenceIds.map(
                        (id) => (
                          <span key={id}>{id}</span>
                        ),
                      )}
                      <span>
                        {Math.round(
                          telemetry.analysis.selectedMutation.confidence * 100,
                        )}
                        % confidence
                      </span>
                      <span>
                        {
                          telemetry.analysis.selectedMutation.predictedImpact
                            .metric
                        }{' '}
                        {
                          telemetry.analysis.selectedMutation.predictedImpact
                            .direction
                        }
                      </span>
                    </div>
                  </div>
                </div>
                {telemetry.analysis.alternatives.length > 0 && (
                  <div className="mutation-alternatives">
                    <span>Alternatives considered</span>
                    {telemetry.analysis.alternatives.map((candidate) => (
                      <div key={candidate.id}>
                        <strong>{candidate.title}</strong>
                        <code>{candidate.evidenceIds.join(', ')}</code>
                        <span>{Math.round(candidate.confidence * 100)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="codex-handoff">
                  <div>
                    <ClipboardCheck size={17} />
                    <div>
                      <strong>Controlled Codex handoff</strong>
                      <span>
                        Selected brief, allow-list, evidence citations and
                        validation commands only.
                      </span>
                    </div>
                  </div>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={telemetry.preparingManifest}
                    onClick={() => void telemetry.prepareCodexManifest()}
                  >
                    {telemetry.preparingManifest ? (
                      <CircleDashed className="is-spinning" size={14} />
                    ) : (
                      <Code2 size={14} />
                    )}
                    {telemetry.manifest ? 'Manifest ready' : 'Prepare manifest'}
                  </button>
                </div>
                {telemetry.manifest && (
                  <div className="manifest-audit">
                    <span>MANIFEST {telemetry.manifest.manifestId}</span>
                    <code>{telemetry.manifest.manifestHash}</code>
                    <span>
                      {telemetry.manifest.allowedPaths.length} allowed ·{' '}
                      {telemetry.manifest.protectedPaths.length} protected ·{' '}
                      {telemetry.manifest.validationCommands.length} checks
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {telemetry.outcome && (
        <div className="outcome-validation">
          <div className="outcome-heading">
            <div>
              <span className="evidence-class">AUTOMATED</span>
              <strong>Versioned outcome validation</strong>
              <p>
                Same task, same browser script, separate v1.0 and v1.1 cohorts.
                This is not a measured human outcome.
              </p>
            </div>
            <span className="outcome-provenance">
              {telemetry.outcome.provenance.replaceAll('_', ' ')}
            </span>
          </div>
          <div className="outcome-comparison">
            <div>
              <span>Baseline · v{telemetry.outcome.baseline.appVersion}</span>
              <strong>{telemetry.outcome.baseline.medianInteractions}</strong>
              <small>median interactions</small>
              <code>
                {telemetry.outcome.baseline.evidenceHash.slice(0, 12)}
              </code>
            </div>
            <div className="outcome-delta">
              <TrendingUp size={18} />
              <strong>{telemetry.outcome.delta.interactions}</strong>
              <span>interactions</span>
            </div>
            <div>
              <span>Evolved · v{telemetry.outcome.evolved.appVersion}</span>
              <strong>{telemetry.outcome.evolved.medianInteractions}</strong>
              <small>median interactions</small>
              <code>{telemetry.outcome.evolved.evidenceHash.slice(0, 12)}</code>
            </div>
          </div>
          <div className="outcome-conclusion">
            <CheckCircle2 size={16} />
            <span>{telemetry.outcome.conclusion}</span>
            <code>
              {Math.round(telemetry.outcome.baseline.completionRate * 100)}% →{' '}
              {Math.round(telemetry.outcome.evolved.completionRate * 100)}%
              completion
            </code>
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
          <div className="heading-with-help">
            <h2 id="observation-title" className="mt-2 text-xl font-semibold">
              {stage === 'observing'
                ? 'Reading selection pressure'
                : error
                  ? 'Observation interrupted'
                  : '10,000 interactions observed'}
            </h2>
            <InfoTip text="This is the deterministic scale demonstration: exactly 10,000 synthetic interactions across four personas, aggregated into measurable friction and fitness inputs." />
          </div>
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
          <div className="heading-with-help">
            <h2 id="mutation-title" className="mt-2 text-xl font-semibold">
              One controlled mutation proposed
            </h2>
            <InfoTip text="The configured analyzer ranks selection pressure and returns exactly one schema-validated, human-approved mutation proposal." />
          </div>
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
                  data-explain="Reject this proposal, retain ProjectFlow v1.0, and record the failed selection in the fossil record."
                >
                  <X size={16} /> Reject
                </button>
                <button
                  className="approve-action"
                  type="button"
                  onClick={() => onDecision('approve')}
                  disabled={stage === 'deciding'}
                  data-explain="Human approval allows Darwin to reveal the bounded repository diff and proceed to validation. It does not deploy production code."
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
      description: 'ProjectFlow v1.1 is now the active target application.',
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
          <div className="heading-with-help">
            <h2 id="validation-title" className="mt-2 text-xl font-semibold">
              Mutation execution
            </h2>
            <InfoTip text="Shows the controlled implementation artifact, actual repository comparison, recorded checks, and measured fitness before release." />
          </div>
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
                data-explain="Load the recorded repository validation result produced by real TypeScript, unit, UX, and production-build commands."
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
                data-explain="Retain the passing v1.1 genome, switch the target variant, and append its outcome to the fossil record."
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

export default App;
