import {
  StudySessionClaimsSchema,
  StudySessionIssueResponseSchema,
  type StudyEvidenceClass,
  type StudySessionClaims,
} from '@darwin/shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionTtlMs = 10 * 60 * 1_000;

const toHex = (value: ArrayBuffer) =>
  [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const hmac = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
};

const base64UrlEncode = (value: string) => {
  const bytes = encoder.encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
};

const base64UrlDecode = (value: string) => {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return decoder.decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
};

const secureEqual = async (left: string, right: string) => {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
};

export const anonymousStudyParticipantId = async (
  clientKey: string,
  studyId: string,
  appVersion: string,
  evidenceClass: StudyEvidenceClass,
) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${clientKey}\n${studyId}\n${appVersion}\n${evidenceClass}`),
  );
  return `participant-${toHex(digest).slice(0, 20)}`;
};

export const issueStudySession = async (
  secret: string,
  input: {
    studyId: string;
    participantId: string;
    sessionId?: string;
    appVersion: string;
    evidenceClass: StudyEvidenceClass;
    deploymentOrigin: string;
    labExperimentId: string | null;
    runId: string | null;
  },
  issuedAt = Date.now(),
) => {
  const claims = StudySessionClaimsSchema.parse({
    version: 1,
    ...input,
    sessionId: input.sessionId ?? `session-${crypto.randomUUID()}`,
    source: input.evidenceClass === 'human_study' ? 'real_user' : 'automated',
    targetId: 'projectflow',
    issuedAt,
    expiresAt: issuedAt + sessionTtlMs,
  });
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signature = await hmac(secret, encodedClaims);
  return StudySessionIssueResponseSchema.parse({
    token: `${encodedClaims}.${signature}`,
    claims,
    expiresAt: new Date(claims.expiresAt).toISOString(),
  });
};

export type StudySessionVerification =
  | { ok: true; claims: StudySessionClaims }
  | {
      ok: false;
      error:
        | 'study_session_required'
        | 'study_session_invalid'
        | 'study_session_expired';
      message: string;
    };

export const verifyStudySessionToken = async (
  token: string | null,
  secret: string | undefined,
  now = Date.now(),
): Promise<StudySessionVerification> => {
  if (!token) {
    return {
      ok: false,
      error: 'study_session_required',
      message: 'A study session is required.',
    };
  }
  if (!secret) {
    return {
      ok: false,
      error: 'study_session_invalid',
      message: 'Study-session verification is unavailable.',
    };
  }
  try {
    const [encodedClaims, signature, extra] = token.split('.');
    if (!encodedClaims || !signature || extra) throw new Error('bad token');
    const expected = await hmac(secret, encodedClaims);
    if (!(await secureEqual(signature.toLowerCase(), expected))) {
      throw new Error('bad signature');
    }
    const claims = StudySessionClaimsSchema.parse(
      JSON.parse(base64UrlDecode(encodedClaims)),
    );
    if (claims.expiresAt <= now || claims.issuedAt > now + 30_000) {
      return {
        ok: false,
        error: 'study_session_expired',
        message: 'The study session has expired.',
      };
    }
    return { ok: true, claims };
  } catch {
    return {
      ok: false,
      error: 'study_session_invalid',
      message: 'The study session is invalid.',
    };
  }
};
