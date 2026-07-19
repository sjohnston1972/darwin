import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function BrokenView(): never {
  throw new Error('render failed');
}

describe('control-room error boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('contains a view failure and offers diagnostics recovery', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Darwin contained a control-room error',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open System status/i }),
    ).toHaveAttribute('href', '/system-status');
    expect(screen.getByText(/ui-/)).toBeInTheDocument();
  });
});
