import {
  Code2,
  Database,
  FileCheck2,
  GitBranch,
  Network,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DiagnosticsResponseSchema,
  type EvidencePack,
  type OperationalAuditEvent,
  type StorageHealth,
} from '@darwin/shared';

import { apiFetch } from '../api';
import { InfoTip } from '../components/InfoTip';

export interface RuntimeHealth {
  status: 'checking' | 'online' | 'offline';
  build: { release: string; commit: string; identifier: string } | null;
  storage: StorageHealth | null;
}

interface SystemStatusViewProps {
  apiBaseUrl: string;
  health: RuntimeHealth;
  webBuild: { release: string; commit: string };
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
  const [events, setEvents] = useState<OperationalAuditEvent[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch(`${apiBaseUrl}/api/diagnostics?limit=30`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Diagnostics request failed.');
        const result = DiagnosticsResponseSchema.parse(await response.json());
        if (active) {
          setEvents(result.auditEvents);
          setGeneratedAt(result.generatedAt);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setDiagnosticsError(
            error instanceof Error ? error.message : 'Diagnostics unavailable.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  const exportDiagnostics = () => {
    const blob = new Blob(
      [JSON.stringify({ generatedAt, auditEvents: events }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `darwin-diagnostics-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside
      className="surface-panel lg:col-span-2"
      aria-labelledby="diagnostics-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Operational diagnostics</p>
          <h2 id="diagnostics-title" className="mt-2 text-xl font-semibold">
            Recent privileged transitions
          </h2>
        </div>
        <button
          className="secondary-action"
          disabled={!events.length}
          onClick={exportDiagnostics}
          type="button"
        >
          Export diagnostics
        </button>
      </div>
      {diagnosticsError ? (
        <div className="error-band" role="alert">
          {diagnosticsError}
        </div>
      ) : (
        <div className="diagnostics-list" role="list">
          {!events.length && <p>No privileged transitions recorded yet.</p>}
          {events.map((event) => (
            <div key={event.auditEventId} role="listitem">
              <code>{event.requestId.slice(0, 20)}</code>
              <strong>{event.action}</strong>
              <span>
                {event.actor} · {event.outcome} · {event.durationMs}ms
              </span>
              <small>
                {event.beforeState ?? '—'} → {event.afterState ?? '—'}
              </small>
            </div>
          ))}
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
              health.build
                ? `v${health.build.release} · ${health.build.commit.slice(0, 7)}`
                : health.status
            }
            ready={health.status === 'online'}
            help="The deployed Darwin Worker release and exact commit from /api/health."
          />
          <StatusRow
            icon={Code2}
            label="Control room build"
            value={`v${webBuild.release} · ${webBuild.commit.slice(0, 7)}`}
            ready={webBuild.commit !== 'development'}
            help="Release metadata injected into this control-room build by deployment."
          />
          <StatusRow
            icon={Database}
            label="D1 telemetry"
            value={
              health.storage
                ? `${health.storage.telemetryEvents.toLocaleString('en-US')} / ${health.storage.eventQuotaPerTarget.toLocaleString('en-US')} target · ${health.storage.eventQuotaPerStudy.toLocaleString('en-US')} study`
                : telemetry.status === 'live'
                  ? `${telemetry.count} events`
                  : telemetry.status
            }
            ready={telemetry.status === 'live'}
            help="Semantic events persisted in D1, with the configured per-study quota."
          />
          <StatusRow
            icon={ShieldCheck}
            label="Retention policy"
            value={
              health.storage
                ? `${health.storage.rawTelemetryRetentionDays}d human · ${health.storage.automatedTelemetryRetentionDays}d automated${
                    health.storage.lastRetentionRunAt
                      ? ` · ran ${new Date(health.storage.lastRetentionRunAt).toLocaleDateString()}`
                      : ' · awaiting scheduled run'
                  }`
                : 'storage health unavailable'
            }
            ready={Boolean(health.storage)}
            help="Human and automated raw observations expire on separate schedules."
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
