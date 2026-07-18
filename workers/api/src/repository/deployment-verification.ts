export interface ProjectFlowDeploymentIdentity {
  commitSha: string;
  appVersion: string;
}

export interface VerifiedProjectFlowDeployment extends ProjectFlowDeploymentIdentity {
  attempts: number;
  verifiedAt: string;
}

export class DeploymentVerificationPendingError extends Error {
  readonly attempts: number;
  readonly observed: ProjectFlowDeploymentIdentity | null;
  readonly errorCode: string;

  constructor({
    attempts,
    observed,
    errorCode,
  }: {
    attempts: number;
    observed: ProjectFlowDeploymentIdentity | null;
    errorCode: string;
  }) {
    super('ProjectFlow deployment has not reported the released genome yet.');
    this.name = 'DeploymentVerificationPendingError';
    this.attempts = attempts;
    this.observed = observed;
    this.errorCode = errorCode;
  }
}

const attributeValue = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
};

const metaContent = (html: string, name: string) => {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (attributeValue(tag, 'name') === name) {
      return attributeValue(tag, 'content');
    }
  }
  return null;
};

export const parseProjectFlowDeploymentIdentity = (
  html: string,
): ProjectFlowDeploymentIdentity | null => {
  const commitSha = metaContent(html, 'darwin-commit-sha');
  const appVersion = metaContent(html, 'darwin-app-version');
  if (
    !commitSha?.match(/^[a-f0-9]{40}$/) ||
    !appVersion?.match(/^(?:baseline|\d+\.\d+\.\d+|[a-f0-9]{7,40})$/)
  ) {
    return null;
  }
  return { commitSha, appVersion };
};

const delay = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

export async function verifyProjectFlowDeployment({
  studyUrl,
  expectedCommit,
  expectedAppVersion = expectedCommit.slice(0, 12),
  timeoutMs = 90_000,
  pollIntervalMs = 5_000,
  fetcher = fetch,
  wait = delay,
  now = () => new Date(),
  clock = () => Date.now(),
}: {
  studyUrl: string;
  expectedCommit: string;
  expectedAppVersion?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetcher?: typeof fetch;
  wait?: (durationMs: number) => Promise<void>;
  now?: () => Date;
  clock?: () => number;
}): Promise<VerifiedProjectFlowDeployment> {
  const boundedTimeout = Math.min(120_000, Math.max(500, timeoutMs));
  const boundedInterval = Math.min(10_000, Math.max(0, pollIntervalMs));
  const maximumAttempts = Math.max(
    1,
    Math.ceil(boundedTimeout / Math.max(250, boundedInterval)),
  );
  let observed: ProjectFlowDeploymentIdentity | null = null;
  let errorCode = 'deployment_identity_unavailable';
  let attempts = 0;
  const startedAt = clock();

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const remainingMs = boundedTimeout - (clock() - startedAt);
    if (remainingMs <= 0) break;
    attempts = attempt;
    const controller = new AbortController();
    const requestTimer = setTimeout(
      () => controller.abort(),
      Math.min(10_000, remainingMs),
    );
    try {
      const verificationUrl = new URL(studyUrl);
      verificationUrl.searchParams.set(
        'darwin_deployment_verify',
        `${expectedCommit.slice(0, 12)}-${attempt}`,
      );
      const response = await fetcher(verificationUrl, {
        headers: {
          Accept: 'text/html',
          'Cache-Control': 'no-cache',
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        errorCode = `target_http_${response.status}`;
      } else {
        observed = parseProjectFlowDeploymentIdentity(await response.text());
        errorCode = observed
          ? 'deployment_version_mismatch'
          : 'deployment_identity_unavailable';
        if (
          observed?.commitSha === expectedCommit &&
          observed.appVersion === expectedAppVersion
        ) {
          return {
            ...observed,
            attempts: attempt,
            verifiedAt: now().toISOString(),
          };
        }
      }
    } catch (error) {
      errorCode =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'target_timeout'
          : 'target_unavailable';
    } finally {
      clearTimeout(requestTimer);
    }
    const waitMs = Math.min(
      boundedInterval,
      Math.max(0, boundedTimeout - (clock() - startedAt)),
    );
    if (attempt < maximumAttempts && waitMs > 0) {
      await wait(waitMs);
    }
  }

  throw new DeploymentVerificationPendingError({
    attempts,
    observed,
    errorCode,
  });
}
