import { HealthResponseSchema } from '@darwin/shared';
import {
  Activity,
  Box,
  ChevronRight,
  CircleDashed,
  Database,
  FlaskConical,
  GitBranch,
  GitCompareArrows,
  LayoutDashboard,
  Maximize2,
  Menu,
  Network,
  Radar,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ProjectFlow } from './projectflow/ProjectFlow';
import type { ProjectFlowVariant } from './projectflow/data';

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
  const [organismVariant, setOrganismVariant] = useState<ProjectFlowVariant>(
    () =>
      new URLSearchParams(window.location.search).get('variant') === 'evolved'
        ? 'evolved'
        : 'baseline',
  );
  const organismOnly =
    new URLSearchParams(window.location.search).get('view') === 'organism';

  const metrics = [
    {
      label: 'Interactions observed',
      value: '0',
      meta: 'Awaiting observation',
      tone: 'neutral',
    },
    {
      label: 'Evolution cycles',
      value: '0',
      meta: 'No mutations recorded',
      tone: 'neutral',
    },
    {
      label: 'Current fitness',
      value: '--',
      meta: 'Baseline not measured',
      tone: 'amber',
    },
    {
      label: 'Genome version',
      value: organismVariant === 'baseline' ? 'v1.0' : 'v1.1',
      meta: organismVariant === 'baseline' ? 'Baseline' : 'Candidate preview',
      tone: 'signal',
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
                disabled
                title="The observation engine is introduced in Phase 3"
              >
                <Radar size={17} /> Observe 10,000 interactions
              </button>
              <span className="flex items-center gap-2 text-xs text-mist">
                <CircleDashed size={15} /> Observation engine pending
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
                <StatusRow icon={Radar} label="Telemetry" value="Phase 3" />
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
                </tbody>
              </table>
            </div>
          </section>

          <footer className="mt-8 flex flex-col gap-2 border-t border-line pt-5 text-xs text-mist sm:flex-row sm:items-center sm:justify-between">
            <p>ProjectFlow / controlled evolution environment</p>
            <p className="font-mono">DARWIN CORE 0.2.0</p>
          </footer>
        </div>
      </main>
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
