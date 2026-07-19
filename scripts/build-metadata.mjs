import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const sha = (
  process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
).trim();

if (!/^[a-f0-9]{40}$/.test(sha)) {
  throw new Error('Build commit must be a full 40-character Git SHA.');
}

const requestedTag = process.env.RELEASE_TAG?.trim();
if (process.argv.includes('--require-tag') && !requestedTag) {
  throw new Error('RELEASE_TAG is required for a production build.');
}

if (requestedTag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedTag)) {
    throw new Error('RELEASE_TAG must be a semantic version tag such as v0.25.0.');
  }
  const taggedSha = execFileSync(
    'git',
    ['rev-list', '-n', '1', `refs/tags/${requestedTag}`],
    { encoding: 'utf8' },
  ).trim();
  if (taggedSha !== sha) {
    throw new Error(`${requestedTag} does not identify build commit ${sha}.`);
  }
}

const release = requestedTag ? requestedTag.slice(1) : `${packageVersion}-dev`;
const values = {
  DARWIN_RELEASE_VERSION: release,
  DARWIN_BUILD_SHA: sha,
  VITE_DARWIN_RELEASE_VERSION: release,
  VITE_DARWIN_BUILD_SHA: sha,
};

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  appendFileSync(
    githubEnv,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n')}\n`,
  );
}

console.log(JSON.stringify({ release, commit: sha, identifier: `${release}+${sha.slice(0, 7)}` }));
