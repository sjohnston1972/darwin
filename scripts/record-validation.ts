import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareFitness } from '../workers/api/src/evolution/fitness';
import { simulate } from '../workers/api/src/simulation';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(
  root,
  'workers/api/src/fixtures/phase7-artifacts.json',
);
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    'Run the validation recorder through npm run validate:record.',
  );
}
const ansiPattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);

const cleanOutput = (value: string) =>
  value
    .replace(ansiPattern, '')
    .replaceAll(root, '<repository>')
    .replaceAll(root.replaceAll('\\', '/'), '<repository>')
    .trim();

const outputTail = (value: string, length = 2_400) => {
  const cleaned = cleanOutput(value);
  return cleaned.length <= length ? cleaned : `...\n${cleaned.slice(-length)}`;
};

const run = (name: string, script: string) => {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true,
  });
  const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}${
    result.error ? `\nProcess error: ${result.error.message}` : ''
  }`;

  return {
    name,
    status: result.status === 0 ? ('passed' as const) : ('failed' as const),
    durationMs: Date.now() - startedAt,
    output: outputTail(combinedOutput),
  };
};

const git = (...args: string[]) =>
  spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });

const checks = [
  run('TypeScript workspace check', 'typecheck'),
  run('Unit and UX component tests', 'test'),
  run('Production build', 'build'),
];

const baselinePath = 'apps/web/src/projectflow/genomes/baseline.ts';
const evolvedPath = 'apps/web/src/projectflow/genomes/evolved.ts';
const diffResult = git(
  'diff',
  '--no-index',
  '--no-ext-diff',
  '--',
  baselinePath,
  evolvedPath,
);
if (diffResult.status !== 1 || !diffResult.stdout) {
  throw new Error('Expected baseline and evolved genome sources to differ.');
}

const commit = cleanOutput(git('rev-parse', '--short', 'HEAD').stdout);
const recordedAt = new Date().toISOString();
const fitness = compareFitness(
  simulate({ seed: 1859, variant: 'baseline' }),
  simulate({ seed: 1859, variant: 'evolved' }),
);
const status = checks.every((check) => check.status === 'passed')
  ? 'passed'
  : 'failed';

const artifact = {
  validation: {
    id: 'validation-global-task-discovery-v1',
    mutationId: 'mutation-global-task-discovery-v1',
    status,
    source: 'recorded_repository_run',
    commit,
    checks,
    fitness: fitness.evolved,
    recordedAt,
  },
  diff: {
    mutationId: 'mutation-global-task-discovery-v1',
    source: 'repository_source_comparison',
    baseRef: baselinePath,
    targetRef: evolvedPath,
    patch: cleanOutput(diffResult.stdout),
    generatedAt: recordedAt,
  },
};

mkdirSync(dirname(fixturePath), { recursive: true });
writeFileSync(fixturePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(
  `Recorded ${status} validation at ${fixturePath} (${checks.length} checks, fitness ${fitness.evolved.score}).`,
);

if (status === 'failed') process.exitCode = 1;
