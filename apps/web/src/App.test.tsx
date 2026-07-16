import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Darwin control room', () => {
  it('renders and switches the connected organism variants', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'ok',
            service: 'darwin-api',
            version: '0.1.0',
            timestamp: '2026-07-16T12:00:00.000Z',
          }),
          { status: 200 },
        ),
      ),
    );

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Darwin' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Software that evolves.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Observe 10,000 interactions' }),
    ).toBeDisabled();
    expect(screen.getByTestId('projectflow')).toHaveAttribute(
      'data-variant',
      'baseline',
    );
    expect(
      screen.getByRole('heading', { name: 'Good morning, Maya' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Evolved v1.1/ }));

    expect(
      await screen.findByPlaceholderText('Search tasks and projects'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('projectflow')).toHaveAttribute(
      'data-variant',
      'evolved',
    );
    expect(await screen.findByText('Online')).toBeInTheDocument();
  });
});
