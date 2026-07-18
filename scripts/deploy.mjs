import { spawnSync } from 'node:child_process';

import { resolveBuildMetadata } from './build-metadata.mjs';

const metadata = resolveBuildMetadata(process.env, {
  requireReleaseTag: process.env.REQUIRE_DARWIN_RELEASE_TAG === '1',
});
const environment = {
  ...process.env,
  DARWIN_RELEASE: metadata.release,
  DARWIN_COMMIT_SHA: metadata.commitSha,
  DARWIN_BUILD_ID: metadata.buildId,
  VITE_DARWIN_RELEASE: metadata.release,
  VITE_DARWIN_COMMIT_SHA: metadata.commitSha,
};
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to run deployment.');

const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`Deploying Darwin ${metadata.buildId}.`);
run(['run', 'build']);
run(['run', 'deploy:migrate']);
run([
  'run',
  'deploy:api',
  '--',
  '--var',
  `DARWIN_RELEASE:${metadata.release}`,
  `DARWIN_COMMIT_SHA:${metadata.commitSha}`,
]);
run(['run', 'deploy:web']);
