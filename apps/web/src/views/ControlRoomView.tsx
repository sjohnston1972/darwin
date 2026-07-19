import { Activity, ArrowDown, Radar } from 'lucide-react';

import { InfoTip } from '../components/InfoTip';

export interface ControlRoomMetric {
  label: string;
  help: string;
  value: string;
  meta: string;
  tone: 'signal' | 'amber' | 'neutral';
}

export function ControlRoomView({
  analysisReady,
  measuredEventCount,
  metrics,
  statusText,
  targetApplicationUrl,
  targetConnected,
}: {
  analysisReady: boolean;
  measuredEventCount: number;
  metrics: readonly ControlRoomMetric[];
  statusText: string;
  targetApplicationUrl: string;
  targetConnected: boolean;
}) {
  return (
    <>
      <section className="hero-band" aria-labelledby="page-title">
        <div className="hero-selection-visual" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-signal">
            <Activity size={15} /> Darwin · Control room
            <InfoTip text="Darwin's operator view: observe behavior, ask the configured analyzer for one mutation, approve it, validate it, and retain or reject it." />
          </div>
          <h1
            id="page-title"
            className="mt-5 text-4xl font-semibold sm:text-5xl lg:text-[56px] lg:leading-[1.05]"
          >
            Software that evolves.
          </h1>
          <p className="mt-3 text-xl text-white sm:text-2xl">
            Darwin observes real behavior, identifies selection pressure, and
            proposes a controlled mutation.
          </p>
          <div className="hero-evidence-classes" aria-label="Evidence classes">
            <span>Human study · measured</span>
            <span>Darwin Lab · automated</span>
            <span>Scale replay · simulated</span>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-mist sm:text-base">
            {targetConnected
              ? 'ProjectFlow is connected. Its genome is ready for observation, measurement, and controlled selection.'
              : 'Connect ProjectFlow to verify its repository genome, measured runtime, and controlled mutation boundary.'}
          </p>
        </div>
        <div className="hero-actions relative z-10 mt-8 flex flex-wrap items-center gap-4 lg:mt-0 lg:self-end">
          <div className="start-action-wrap">
            {!measuredEventCount && (
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
          {!analysisReady && (
            <span className="demo-status status-idle">
              <Activity size={15} />
              {statusText}
            </span>
          )}
        </div>
      </section>

      <section className="metric-grid" aria-label="Target application metrics">
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
  );
}
