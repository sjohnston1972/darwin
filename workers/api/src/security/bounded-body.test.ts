import { describe, expect, it } from 'vitest';

import {
  InvalidBodyEncodingError,
  PayloadTooLargeError,
  readBoundedBody,
} from './bounded-body';

describe('readBoundedBody', () => {
  it('rejects a chunked body before materialising bytes beyond the limit', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://darwin.test/api', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);

    await expect(readBoundedBody(request, 10)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
    expect(cancelled).toBe(true);
  });

  it('rejects invalid UTF-8', async () => {
    const request = new Request('https://darwin.test/api', {
      method: 'POST',
      body: new Uint8Array([0xc3, 0x28]),
    });
    await expect(readBoundedBody(request, 10)).rejects.toBeInstanceOf(
      InvalidBodyEncodingError,
    );
  });
});
