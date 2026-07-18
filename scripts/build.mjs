import { spawnSync } from 'node:child_process';

import { resolveBuildMetadata } from './build-metadata.mjs';

const metadata = resolveBuildMetadata();
const environment = {
  ...process.env,
  DARWIN_RELEASE: metadata.release,
  DARWIN_COMMIT_SHA: metadata.commitSha,
  DARWIN_BUILD_ID: metadata.buildId,
  VITE_DARWIN_RELEASE: metadata.release,
  VITE_DARWIN_COMMIT_SHA: metadata.commitSha,
};
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to run the build.');

const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`Building Darwin ${metadata.buildId}.`);
run(['run', 'context:generate']);
run(['run', 'build', '-w', '@darwin/shared']);
run(['run', 'build', '-w', '@darwin/telemetry-client']);
run([
  'run',
  'build',
  '-w',
  '@darwin/api',
  '--',
  '--var',
  `DARWIN_RELEASE:${metadata.release}`,
  `DARWIN_COMMIT_SHA:${metadata.commitSha}`,
]);
run(['run', 'build', '-w', '@darwin/web']);
