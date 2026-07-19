import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const packageVersion = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
).version;

const releasePattern = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const commitPattern = /^[a-f0-9]{40}$/;

const repositoryCommit = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();

export const resolveBuildMetadata = (
  environment = process.env,
  { requireReleaseTag = false } = {},
) => {
  const releaseTag =
    environment.DARWIN_RELEASE_TAG?.trim() ||
    (environment.GITHUB_REF_TYPE === 'tag'
      ? environment.GITHUB_REF_NAME?.trim()
      : '');
  if (requireReleaseTag && !releaseTag) {
    throw new Error(
      'Production deployment must run from a semantic release tag such as v0.1.0.',
    );
  }
  const releaseInput =
    releaseTag || environment.DARWIN_RELEASE?.trim() || packageVersion;
  const releaseMatch = releasePattern.exec(releaseInput);
  if (!releaseMatch) {
    throw new Error(`Invalid Darwin release tag: ${releaseInput}.`);
  }
  const release = releaseMatch[1];
  const commitSha = (
    environment.DARWIN_COMMIT_SHA?.trim() ||
    environment.GITHUB_SHA?.trim() ||
    repositoryCommit()
  ).toLowerCase();
  if (!commitPattern.test(commitSha)) {
    throw new Error('Darwin build metadata requires a 40-character Git SHA.');
  }
  const shortCommit = commitSha.slice(0, 7);
  return {
    release,
    commitSha,
    shortCommit,
    buildId: `v${release}@${shortCommit}`,
  };
};

export const appendGitHubEnvironment = (metadata, outputPath) => {
  if (!outputPath) {
    throw new Error('GITHUB_ENV is required when using --github-env.');
  }
  appendFileSync(
    outputPath,
    [
      `DARWIN_RELEASE=${metadata.release}`,
      `DARWIN_COMMIT_SHA=${metadata.commitSha}`,
      `DARWIN_BUILD_ID=${metadata.buildId}`,
      `VITE_DARWIN_RELEASE=${metadata.release}`,
      `VITE_DARWIN_COMMIT_SHA=${metadata.commitSha}`,
      '',
    ].join('\n'),
  );
};

if (resolve(process.argv[1] || '') === scriptPath) {
  const requireReleaseTag = process.argv.includes('--require-release-tag');
  const metadata = resolveBuildMetadata(process.env, { requireReleaseTag });
  if (process.argv.includes('--github-env')) {
    appendGitHubEnvironment(metadata, process.env.GITHUB_ENV);
  }
  console.log(JSON.stringify(metadata));
}
