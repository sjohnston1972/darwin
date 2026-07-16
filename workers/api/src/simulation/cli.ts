import { SimulationSummarySchema, type OrganismVariant } from '@darwin/shared';

import { simulate } from './simulate';

const argumentValue = (name: string) => {
  const equalsArgument = process.argv.find((argument) =>
    argument.startsWith(`${name}=`),
  );
  if (equalsArgument) return equalsArgument.slice(name.length + 1);

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const seedValue = argumentValue('--seed');
const variantValue = argumentValue('--variant');
const seed = seedValue === undefined ? 1859 : Number(seedValue);
const variant: OrganismVariant =
  variantValue === 'evolved' ? 'evolved' : 'baseline';

if (!Number.isInteger(seed)) {
  console.error('Darwin simulation failed: --seed must be an integer.');
  process.exitCode = 1;
} else {
  const result = simulate({ seed, variant, eventCount: 10_000 });
  const summary = SimulationSummarySchema.parse(result.summary);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('DARWIN TELEMETRY SIMULATION');
    console.log(`Run:         ${summary.run.id}`);
    console.log(`Variant:     ${summary.run.variant}`);
    console.log(`Seed:        ${summary.run.seed}`);
    console.log(
      `Events:      ${summary.run.eventCount.toLocaleString('en-GB')}`,
    );
    console.log(
      `Sessions:    ${summary.metrics.sessions.toLocaleString('en-GB')}`,
    );
    console.log(`Fingerprint: ${summary.fingerprint}`);
    console.log('');
    console.log('AGGREGATED FRICTION');
    console.log(
      `Completion:   ${(summary.metrics.workflowCompletionRate * 100).toFixed(1)}%`,
    );
    console.log(
      `Abandonment:  ${(summary.metrics.workflowAbandonmentRate * 100).toFixed(1)}%`,
    );
    console.log(
      `Page views:   ${summary.metrics.averagePageViewsPerWorkflow.toFixed(2)} / workflow`,
    );
    console.log(
      `Backtracks:   ${summary.metrics.averageBacktracksPerWorkflow.toFixed(2)} / workflow`,
    );
    console.log(
      `Search use:   ${(summary.metrics.searchUsageRate * 100).toFixed(1)}%`,
    );
    console.log(
      `Median time:  ${(summary.metrics.medianWorkflowDurationMs / 1_000).toFixed(1)}s`,
    );
  }
}
