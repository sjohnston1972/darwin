import {
  SimulationResultSchema,
  SimulationSummarySchema,
} from '@darwin/shared';
import { describe, expect, it } from 'vitest';

import { personaDefinitions, simulate } from './index';

describe('deterministic telemetry simulation', () => {
  it('generates exactly 10,000 schema-valid events from four personas', () => {
    const result = simulate({ seed: 1859, variant: 'baseline' });

    expect(result.events).toHaveLength(10_000);
    expect(result.run.eventCount).toBe(10_000);
    expect(SimulationResultSchema.parse(result).events).toHaveLength(10_000);
    expect(Object.keys(result.summary.personaCounts).sort()).toEqual(
      personaDefinitions.map((persona) => persona.id).sort(),
    );
  });

  it('returns the same summary and event stream for the same seed', () => {
    const first = simulate({ seed: 1859, variant: 'baseline' });
    const second = simulate({ seed: 1859, variant: 'baseline' });

    expect(SimulationSummarySchema.parse(first.summary)).toEqual(
      second.summary,
    );
    expect(first.events).toEqual(second.events);
  });

  it('changes paths and fingerprint when the seed changes', () => {
    const first = simulate({ seed: 1859, variant: 'baseline' });
    const second = simulate({ seed: 2026, variant: 'baseline' });
    const firstPath = first.events.slice(0, 40).map((event) => event.route);
    const secondPath = second.events.slice(0, 40).map((event) => event.route);

    expect(first.summary.fingerprint).not.toBe(second.summary.fingerprint);
    expect(firstPath).not.toEqual(secondPath);
  });

  it('produces measurably lower friction for the evolved route graph', () => {
    const baseline = simulate({ seed: 1859, variant: 'baseline' }).summary
      .metrics;
    const evolved = simulate({ seed: 1859, variant: 'evolved' }).summary
      .metrics;

    expect(baseline.workflowCompletionRate).toBeLessThan(
      evolved.workflowCompletionRate,
    );
    expect(baseline.averagePageViewsPerWorkflow).toBeGreaterThan(
      evolved.averagePageViewsPerWorkflow,
    );
    expect(baseline.averageBacktracksPerWorkflow).toBeGreaterThan(
      evolved.averageBacktracksPerWorkflow,
    );
    expect(baseline.medianWorkflowDurationMs).toBeGreaterThan(
      evolved.medianWorkflowDurationMs,
    );
  });
});
