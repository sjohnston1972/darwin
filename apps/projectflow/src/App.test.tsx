import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';

describe('standalone ProjectFlow', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('creates and persists a functional project', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Projects/ }));
    fireEvent.click(screen.getByRole('button', { name: /New project/ }));
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Polaris Launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(
      screen.getByRole('heading', { name: 'Polaris Launch' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem('projectflow:workspace:v1')).toContain(
      'Polaris Launch',
    );
  });

  it('records a verified study attempt through the indirect task path', () => {
    window.history.replaceState({}, '', '/study');
    render(<App />);

    expect(
      screen.queryByRole('button', { name: /^Tasks/ }),
    ).not.toBeInTheDocument();

    const taskCard = screen
      .getByText('Find your assigned task')
      .closest('article');
    expect(taskCard).not.toBeNull();
    fireEvent.click(
      within(taskCard!).getByRole('button', { name: /Start task/ }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Projects/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apollo Release/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tasks/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm launch checklist/ }),
    );

    const done = within(taskCard!).getByRole('button', { name: 'Done' });
    expect(done).toBeEnabled();
    fireEvent.click(done);

    expect(taskCard).toHaveClass('is-complete');
    expect(screen.getByText(/events/)).toBeInTheDocument();
  });

  it('exposes the shorter evolved My Work path', () => {
    window.history.replaceState({}, '', '/study?variant=evolved');
    render(<App />);

    expect(screen.getByText('ProjectFlow evolved - v1.1.0')).toBeVisible();
    expect(screen.getByLabelText('Search all tasks')).toBeVisible();
    const taskCard = screen
      .getByText('Find your assigned task')
      .closest('article');
    fireEvent.click(
      within(taskCard!).getByRole('button', { name: /Start task/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: /My Work/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Confirm launch checklist/ }),
    );

    expect(
      within(taskCard!).getByRole('button', { name: 'Done' }),
    ).toBeEnabled();
  });
});
