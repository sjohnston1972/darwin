import { spawnSync } from 'node:child_process';

const release = process.env.DARWIN_RELEASE_VERSION?.trim();
const commit = process.env.DARWIN_BUILD_SHA?.trim();
if (!release || !commit) {
  throw new Error(
    'DARWIN_RELEASE_VERSION and DARWIN_BUILD_SHA must be generated before deployment.',
  );
}

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  executable,
  [
    'wrangler',
    'deploy',
    '--config',
    'workers/api/wrangler.toml',
    '--var',
    `DARWIN_RELEASE_VERSION:${release}`,
    '--var',
    `DARWIN_BUILD_SHA:${commit}`,
  ],
  { stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
