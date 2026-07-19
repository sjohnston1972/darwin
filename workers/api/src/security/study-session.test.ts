import { describe, expect, it } from 'vitest';

import {
  anonymousStudyParticipantId,
  issueStudySession,
  verifyStudySessionToken,
} from './study-session';

const secret = 'study-session-test-secret';

describe('study session credentials', () => {
  it('issues stable anonymous subjects and short-lived verifiable sessions', async () => {
    const firstParticipant = await anonymousStudyParticipantId(
      'edge-client',
      'projectflow-baseline-study',
      '1.0.0',
      'human_study',
    );
    const secondParticipant = await anonymousStudyParticipantId(
      'edge-client',
      'projectflow-baseline-study',
      '1.0.0',
      'human_study',
    );
    const issuedAt = Date.now();
    const session = await issueStudySession(
      secret,
      {
        studyId: 'projectflow-baseline-study',
        participantId: firstParticipant,
        appVersion: '1.0.0',
        evidenceClass: 'human_study',
        deploymentOrigin: 'https://darwin-projectflow.pages.dev',
        labExperimentId: null,
        runId: null,
      },
      issuedAt,
    );

    expect(secondParticipant).toBe(firstParticipant);
    await expect(
      verifyStudySessionToken(session.token, secret, issuedAt + 1),
    ).resolves.toMatchObject({
      ok: true,
      claims: {
        participantId: firstParticipant,
        studyId: 'projectflow-baseline-study',
        appVersion: '1.0.0',
        evidenceClass: 'human_study',
      },
    });
    await expect(
      verifyStudySessionToken(session.token, secret, issuedAt + 11 * 60_000),
    ).resolves.toMatchObject({ ok: false, error: 'study_session_expired' });
  });

  it('rejects token tampering and wrong secrets', async () => {
    const session = await issueStudySession(secret, {
      studyId: 'projectflow-baseline-automated-study',
      participantId: 'participant-automated',
      sessionId: 'session-automated',
      appVersion: '1.0.0',
      evidenceClass: 'automated_study',
      deploymentOrigin: 'https://darwin-projectflow.pages.dev',
      labExperimentId: null,
      runId: null,
    });
    const tampered = `${session.token.slice(0, -1)}${session.token.endsWith('0') ? '1' : '0'}`;

    await expect(
      verifyStudySessionToken(tampered, secret),
    ).resolves.toMatchObject({
      ok: false,
      error: 'study_session_invalid',
    });
    await expect(
      verifyStudySessionToken(session.token, 'wrong-secret'),
    ).resolves.toMatchObject({ ok: false, error: 'study_session_invalid' });
  });
});
