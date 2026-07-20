import {
  Code2,
  Database,
  Download,
  FileCheck2,
  GitBranch,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DiagnosticsResponseSchema,
  type DiagnosticsResponse,
  type EvidencePack,
  type RetentionHealth,
} from '@darwin/shared';

import { apiFetch } from '../api';
import { InfoTip } from '../components/InfoTip';

export interface RuntimeHealth {
  status: 'checking' | 'online' | 'offline';
  version: string | null;
  commitSha: string | null;
  retention: RetentionHealth | null;
}

interface SystemStatusViewProps {
  apiBaseUrl: string;
  health: RuntimeHealth;
  webBuild: { release: string; commitSha: string };
  telemetry: {
    status: string;
    count: number;
    evidence: EvidencePack | null;
  };
  activeCommit: string | null;
  activeGenomeStage: string;
  activeGenomeLoci: Array<{ locus: string; value: string }>;
  repositoryConnected: boolean;
}

function StatusRow({
  icon: Icon,
  label,
  value,
  ready = false,
  help,
}: {
  icon: LucideIcon;
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

function DiagnosticsPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(
    null,
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  const load = async () => {
    setStatus('loading');
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/diagnostics?limit=50`);
      if (!response.ok) throw new Error('Diagnostics request failed');
      const parsed = DiagnosticsResponseSchema.parse(await response.json());
      setDiagnostics(parsed);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    void load();
  }, [apiBaseUrl]);

  const exportDiagnostics = () => {
    if (!diagnostics) return;
    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `darwin-diagnostics-${diagnostics.generatedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <aside
      className="surface-panel lg:col-span-2"
      aria-labelledby="operational-diagnostics-title"
    >
      <div className="panel-heading gap-4">
        <div>
          <p className="section-label">Operations</p>
          <div className="heading-with-help">
            <h2
              id="operational-diagnostics-title"
              className="mt-2 text-xl font-semibold"
            >
              Operational diagnostics
            </h2>
            <InfoTip text="Redacted request transitions and aggregate provider latency retained for 30 days. Request bodies, prompts, telemetry payloads, tokens, and credentials are never included." />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <button
            className="secondary-action"
            type="button"
            onClick={() => void load()}
            disabled={status === 'loading'}
          >
            <RefreshCw
              className={status === 'loading' ? 'is-spinning' : undefined}
              size={15}
            />
            Refresh
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={exportDiagnostics}
            disabled={!diagnostics}
          >
            <Download size={15} /> Export JSON
          </button>
        </div>
      </div>

      {status === 'error' && (
        <p className="px-5 py-6 text-sm text-amber sm:px-6">
          Diagnostics are unavailable. Runtime status remains independent.
        </p>
      )}
      {status === 'loading' && !diagnostics && (
        <p className="px-5 py-6 text-sm text-mist sm:px-6">
          Loading redacted operational history…
        </p>
      )}
      {diagnostics && (
        <div className="grid gap-8 px-5 py-6 sm:px-6 xl:grid-cols-2">
          <section aria-labelledby="provider-metrics-title">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 id="provider-metrics-title" className="font-semibold">
                Provider latency
              </h3>
              <span className="font-mono text-[11px] uppercase tracking-wider text-mist">
                {diagnostics.retentionDays} day retention
              </span>
            </div>
            {diagnostics.metrics.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line font-mono uppercase tracking-wider text-mist">
                    <tr>
                      <th className="pb-3 font-normal">Provider / operation</th>
                      <th className="pb-3 text-right font-normal">Calls</th>
                      <th className="pb-3 text-right font-normal">Avg</th>
                      <th className="pb-3 text-right font-normal">Errors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {diagnostics.metrics.slice(0, 10).map((metric) => (
                      <tr key={`${metric.provider}:${metric.operation}`}>
                        <td className="py-3 pr-3">
                          <span className="text-signal">{metric.provider}</span>
                          <span className="text-mist">
                            {' '}
                            · {metric.operation}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono">
                          {metric.count}
                        </td>
                        <td className="py-3 text-right font-mono">
                          {metric.averageDurationMs} ms
                        </td>
                        <td
                          className={`py-3 text-right font-mono ${metric.failureCount ? 'text-amber' : 'text-mist'}`}
                        >
                          {metric.failureCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-mist">
                Provider timings will appear after D1, OpenAI, GitHub, or target
                verification activity.
              </p>
            )}
          </section>

          <section aria-labelledby="audit-events-title">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 id="audit-events-title" className="font-semibold">
                Privileged transitions
              </h3>
              <span className="font-mono text-[11px] text-mist">
                request {diagnostics.requestId.slice(0, 12)}
              </span>
            </div>
            {diagnostics.events.length ? (
              <ol className="divide-y divide-line">
                {diagnostics.events.slice(0, 10).map((event) => (
                  <li className="grid gap-1 py-3 text-xs" key={event.eventId}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${event.outcome === 'success' ? 'bg-signal' : 'bg-amber'}`}
                      />
                      <strong className="font-mono font-medium">
                        {event.action}
                      </strong>
                      <time className="ml-auto text-mist">
                        {new Date(event.occurredAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    </div>
                    <span className="pl-3.5 text-mist">
                      {event.actor} · {event.beforeState ?? '—'} →{' '}
                      {event.afterState ?? '—'} · {event.durationMs} ms
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-mist">
                No privileged transitions have been recorded in this retention
                window.
              </p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

export function SystemStatusView({
  apiBaseUrl,
  health,
  webBuild,
  telemetry,
  activeCommit,
  activeGenomeStage,
  activeGenomeLoci,
  repositoryConnected,
}: SystemStatusViewProps) {
  return (
    <section className="mt-8 grid gap-8 lg:grid-cols-2">
      <aside className="surface-panel" aria-labelledby="system-status-title">
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
                ? `v${health.version} · ${(health.commitSha ?? 'local').slice(0, 7)} · online`
                : health.status
            }
            ready={health.status === 'online'}
            help="The deployed Rosalind Worker release and exact commit from /api/health."
          />
          <StatusRow
            icon={Code2}
            label="Control room"
            value={`v${webBuild.release} · ${webBuild.commitSha === 'local' ? 'local' : webBuild.commitSha.slice(0, 7)}`}
            ready={webBuild.commitSha !== 'development'}
            help="Release metadata injected into this control-room build by deployment."
          />
          <StatusRow
            icon={Database}
            label="D1 telemetry"
            value={
              telemetry.status === 'live'
                ? `${telemetry.count} events`
                : telemetry.status
            }
            ready={telemetry.status === 'live'}
            help="Semantic events persisted in D1, with the configured per-study quota."
          />
          <StatusRow
            icon={ShieldCheck}
            label="Storage retention"
            value={
              health.retention
                ? `${health.retention.eventCount.toLocaleString()} / ${health.retention.policy.maxEventsPerTarget.toLocaleString()} events · ${health.retention.expiredRecordCount} expired · ${health.retention.lastSweepAt ? `swept ${health.retention.lastSweepAt.slice(0, 10)}` : 'awaiting first sweep'}`
                : health.status
            }
            ready={health.retention?.status === 'healthy'}
            help="The bounded storage policy, quotas, expired-record count, and most recent retention sweep."
          />
          <StatusRow
            icon={FileCheck2}
            label="Evidence engine"
            value={
              telemetry.evidence
                ? `parser ${telemetry.evidence.parserVersion} · ${telemetry.evidence.frictionSignals.length} signals`
                : 'awaiting evidence'
            }
            ready={telemetry.evidence !== null}
            help="The deterministic parser converts raw events into citeable friction signals."
          />
          <StatusRow
            icon={GitBranch}
            label="Active genome"
            value={
              activeCommit
                ? `${activeCommit.slice(0, 12)} · ${activeGenomeStage}`
                : 'awaiting repository snapshot'
            }
            ready={repositoryConnected}
            help="The exact ProjectFlow commit retained on the tracked branch."
          />
        </div>
      </aside>

      <aside className="surface-panel" aria-labelledby="variant-summary-title">
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
              <InfoTip text="The immutable repository snapshot used by GPT and Codex." />
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
            <div className="genome-comparison-row" key={row.locus} role="row">
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
      <DiagnosticsPanel apiBaseUrl={apiBaseUrl} />
    </section>
  );
}
