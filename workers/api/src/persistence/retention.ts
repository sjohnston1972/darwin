import {
  RetentionPolicySchema,
  type RetentionDeletedCounts,
  type RetentionPolicy,
} from '@darwin/shared';

export interface RetentionEnvironment {
  DARWIN_MAX_EVENTS_PER_STUDY?: string;
  DARWIN_MAX_EVENTS_PER_TARGET?: string;
}

const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const retentionPolicy = (
  environment?: RetentionEnvironment,
): RetentionPolicy =>
  RetentionPolicySchema.parse({
    version: '1.0.0',
    rawTelemetryDays: 30,
    workspaceDays: 30,
    derivedEvidenceDays: 90,
    executionArtifactDays: 30,
    fossilRecordDays: 365,
    operationalAuditDays: 90,
    maxEventsPerStudy: positiveInteger(
      environment?.DARWIN_MAX_EVENTS_PER_STUDY,
      50_000,
    ),
    maxEventsPerTarget: positiveInteger(
      environment?.DARWIN_MAX_EVENTS_PER_TARGET,
      250_000,
    ),
  });

export const expiresAt = (timestamp: string, days: number) =>
  new Date(new Date(timestamp).getTime() + days * 86_400_000).toISOString();

export const emptyDeletedCounts = (): RetentionDeletedCounts => ({
  telemetryEvents: 0,
  workspaces: 0,
  evidencePacks: 0,
  analyses: 0,
  manifests: 0,
  executions: 0,
  callbackArtifacts: 0,
  validations: 0,
});

export const addDeletedCounts = (
  target: RetentionDeletedCounts,
  addition: Partial<RetentionDeletedCounts>,
) => {
  for (const key of Object.keys(target) as Array<
    keyof RetentionDeletedCounts
  >) {
    target[key] += addition[key] ?? 0;
  }
  return target;
};
