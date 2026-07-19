import { StudyTelemetryEventSchema } from '@darwin/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryTelemetryRepository } from './telemetry-repository';

const provenance = {
  evidenceClass: 'human_study' as const,
  label: 'Human study',
  labExperimentId: null,
  taskDefinitionId: null,
  taskDefinitionHash: null,
  evidencePackId: null,
  evidenceHash: null,
  runIds: [],
};
const event = (
  eventId: string,
  participantId = 'participant-retention',
  studyId = 'study-retention',
) =>
  StudyTelemetryEventSchema.parse({
    schemaVersion: 1,
    eventId,
    sessionId: 'session-retention',
    participantId,
    studyId,
    appVersion: '1.0.0',
    source: 'real_user',
    provenance,
    occurredAt: '2026-06-01T00:00:00.000Z',
    sequence: 0,
    route: '/study/dashboard',
    viewport: 'desktop',
    eventType: 'page_view',
  });

describe('retention, quotas, and targeted deletion', () => {
  const repository = new InMemoryTelemetryRepository();

  beforeEach(async () => repository.reset());

  it('enforces a per-study event quota while accepting idempotent retries', async () => {
    const first = event('10000000-0000-4000-8000-000000000001');
    const second = event('10000000-0000-4000-8000-000000000002');

    expect(
      await repository.insertEvents(
        [first, second],
        '2026-07-19T08:00:00.000Z',
        1,
      ),
    ).toEqual({ accepted: 1, duplicates: 0, quotaRejected: 1 });
    expect(
      await repository.insertEvents([first], '2026-07-19T08:01:00.000Z', 1),
    ).toEqual({ accepted: 0, duplicates: 1, quotaRejected: 0 });
  });

  it('enforces the target-wide quota across studies while accepting duplicates', async () => {
    const first = event(
      '10000000-0000-4000-8000-000000000011',
      'participant-one',
      'study-one',
    );
    const second = event(
      '10000000-0000-4000-8000-000000000012',
      'participant-two',
      'study-two',
    );

    expect(
      await repository.insertEvents(
        [first, second],
        '2026-07-19T08:00:00.000Z',
        100,
        1,
      ),
    ).toEqual({ accepted: 1, duplicates: 0, quotaRejected: 1 });
    expect(
      await repository.insertEvents(
        [first],
        '2026-07-19T08:01:00.000Z',
        100,
        1,
      ),
    ).toEqual({ accepted: 0, duplicates: 1, quotaRejected: 0 });
  });

  it('expires old raw telemetry and reports retention health', async () => {
    await repository.insertEvents(
      [event('10000000-0000-4000-8000-000000000003')],
      '2026-06-01T00:00:00.000Z',
    );

    const result = await repository.compactRetention(
      '2026-07-19T08:00:00.000Z',
    );
    const health = await repository.getStorageHealth(100_000);

    expect(result.deletedRecords).toBe(1);
    expect(health.telemetryEvents).toBe(0);
    expect(health.lastRetentionRunAt).toBe('2026-07-19T08:00:00.000Z');
  });

  it('deletes only the requested participant records', async () => {
    await repository.insertEvents(
      [
        event('10000000-0000-4000-8000-000000000004', 'participant-one'),
        event('10000000-0000-4000-8000-000000000005', 'participant-two'),
      ],
      '2026-07-19T08:00:00.000Z',
    );

    expect(
      await repository.deleteParticipant('study-retention', 'participant-one'),
    ).toBe(1);
    expect(await repository.summarizeEvents('study-retention')).toMatchObject({
      count: 1,
      participantCount: 1,
    });
  });
});
