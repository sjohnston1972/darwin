import {
  HealthResponseSchema,
  type CodexImplementationManifest,
  type EvidenceAnalysis,
  type EvidenceMutationCandidate,
  type RepositoryMutationExecution,
  type StoredTelemetryEvent,
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
  FileCheck2,
  ExternalLink,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Menu,
  Moon,
  MousePointer2,
  Network,
  Radar,
  Rocket,
  RotateCcw,
  Server,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

import {
  useLiveTelemetry,
  type LiveTelemetryState,
} from './telemetry/useLiveTelemetry';

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
    help: 'Review measured journeys, evidence quality, and recurring selection pressure.',
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

function App() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const [health, setHealth] = useState<ApiHealthState>({
    status: 'checking',
    version: null,
    analysis: null,
  });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const targetOnly =
    new URLSearchParams(window.location.search).get('view') === 'target';
  const liveTelemetry = useLiveTelemetry();
  const repository =
    liveTelemetry.execution?.repository ?? liveTelemetry.analysis?.repository;
  const targetApplicationUrl =
    (liveTelemetry.execution?.previewUrl &&
    ['preview_ready', 'releasing', 'released'].includes(
      liveTelemetry.execution.status,
    )
      ? liveTelemetry.execution.previewUrl
      : repository?.studyUrl) ?? `${projectFlowBaseUrl}/?study=true`;
  const activeCommit =
    liveTelemetry.execution?.status === 'released'
      ? liveTelemetry.execution.headSha
      : repository?.baseSha;
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

  if (targetOnly) {
    return (
      <div className="organism-preview-page">
        <GlobalExplainTooltip />
        <header>
          <a href="/" className="flex items-center gap-3">
            <DarwinMark />
            <strong>DARWIN</strong>
          </a>
          <span>ProjectFlow target application</span>
          <div className="target-header-actions">
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </header>
        <iframe
          className="organism-standalone-frame"
          src={targetApplicationUrl}
          title="ProjectFlow target application"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-carbon text-white">
      <GlobalExplainTooltip />
      <aside className={navigationOpen ? 'sidebar sidebar-open' : 'sidebar'}>
        <div className="flex h-20 items-center justify-between border-b border-line px-5">
          <a
            className="flex items-center gap-3"
            href="#top"
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
                    label === 'Target application'
                      ? targetApplicationUrl
                      : active
                        ? '#top'
                        : `#${label.toLowerCase().replace(' ', '-')}`
                  }
                  target={label === 'Target application' ? '_blank' : undefined}
                  rel={
                    label === 'Target application' ? 'noreferrer' : undefined
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

          <LiveTelemetryPanel
            telemetry={liveTelemetry}
            analysisConfig={health.analysis}
          />

          {liveTelemetry.execution && (
            <RepositoryExecutionWorkspace
              execution={liveTelemetry.execution}
              manifest={liveTelemetry.manifest}
              releasing={liveTelemetry.releasingExecution}
              retrying={liveTelemetry.implementing}
              onRelease={() => void liveTelemetry.releaseExecution()}
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
                  value={
                    activeCommit
                      ? `${activeCommit.slice(0, 12)} · ${liveTelemetry.execution?.status ?? 'measured baseline'}`
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
                    {liveTelemetry.execution?.status ?? 'baseline'}
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
                  {!liveTelemetry.execution ? (
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
                  ) : (
                    <RepositoryFossilRow execution={liveTelemetry.execution} />
                  )}
                </tbody>
              </table>
            </div>
          </section>

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
}: {
  telemetry: LiveTelemetryState;
  analysisConfig: ApiHealthState['analysis'];
}) {
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
                No detector threshold was crossed by the current real sample.
              </p>
            )}
          </div>
          <div className="evidence-quality-band">
            <div>
              <span>Evidence quality</span>
              <strong>{telemetry.evidence.quality.strength}</strong>
              <code>{telemetry.evidence.quality.score}/100</code>
            </div>
            {telemetry.evidence.quality.limitations.length ? (
              <ul>
                {telemetry.evidence.quality.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            ) : (
              <p>No material coverage limitation detected.</p>
            )}
          </div>
          <div className="reasoning-workspace">
            <div className="reasoning-heading">
              <div>
                <span className="section-label">OpenAI reasoning boundary</span>
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
                      {telemetry.analysis.promptCache.cachedTokens === undefined
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
                      {telemetry.analysis.evidenceAssessment.quality.score}/100
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
    <span className="evidence-chip" data-explain={explanation} tabIndex={0}>
      {id}
    </span>
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

function RepositoryExecutionWorkspace({
  execution,
  manifest,
  releasing,
  retrying,
  onRelease,
  onRetry,
}: {
  execution: RepositoryMutationExecution;
  manifest: CodexImplementationManifest | null;
  releasing: boolean;
  retrying: boolean;
  onRelease: () => void;
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
      className="mt-8 surface-panel execution-panel"
      id="validation"
      aria-labelledby="repository-execution-title"
    >
      <div className="panel-heading execution-heading">
        <div>
          <p className="section-label">Live repository mutation</p>
          <div className="heading-with-help">
            <h2
              id="repository-execution-title"
              className="mt-2 text-xl font-semibold"
            >
              Codex execution
            </h2>
            <InfoTip text="A real GitHub Actions run applies the selected manifest to the exact ProjectFlow commit, enforces repository policy, runs validation, opens a pull request, and deploys a review preview." />
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

function RepositoryFossilRow({
  execution,
}: {
  execution: RepositoryMutationExecution;
}) {
  const failed = execution.status === 'failed';
  const retained = execution.status === 'released';
  return (
    <tr className="border-t border-line">
      <td className="px-6 py-5 font-mono">
        {execution.headSha?.slice(0, 12) ?? execution.branch}
      </td>
      <td className="px-6 py-5 text-mist">
        {execution.manifestId} · {execution.changedFiles.length} changed files
      </td>
      <td className="px-6 py-5 text-mist">
        {retained
          ? 'Survived selection'
          : failed
            ? 'Execution failed'
            : executionStatusLabel[execution.status]}
      </td>
      <td className="px-6 py-5 font-mono text-mist">
        {retained ? 'Post-release measurement pending' : '--'}
      </td>
      <td className="px-6 py-5 text-right">
        <span className={failed ? 'status-badge is-failed' : 'status-badge'}>
          {failed ? 'EXECUTION FAILED' : retained ? 'CURRENT' : 'CANDIDATE'}
        </span>
      </td>
    </tr>
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
