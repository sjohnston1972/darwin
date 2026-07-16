import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectFlow } from './ProjectFlow';

describe('ProjectFlow organism', () => {
  it('makes baseline task discovery indirect but keeps routes operational', () => {
    render(<ProjectFlow variant="baseline" />);
    const organism = screen.getByTestId('projectflow');

    expect(
      within(organism).queryByPlaceholderText('Search tasks and projects'),
    ).not.toBeInTheDocument();

    fireEvent.click(within(organism).getByRole('button', { name: 'Tasks 26' }));

    expect(
      within(organism).getByRole('heading', { name: 'Task directory' }),
    ).toBeInTheDocument();
    expect(
      within(organism).getByPlaceholderText('Search tasks'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(organism).getByRole('button', { name: 'Projects 4' }),
    );
    fireEvent.click(
      within(organism).getByRole('button', {
        name: /Atlas mobile launch/,
      }),
    );

    expect(
      within(organism).getByLabelText('Task creation navigation path'),
    ).toHaveTextContent('DashboardProjectsAtlas mobile launchAdd task');
  });

  it('promotes search and supports global quick task creation when evolved', async () => {
    render(<ProjectFlow variant="evolved" />);
    const organism = screen.getByTestId('projectflow');

    expect(
      within(organism).getByPlaceholderText('Search tasks and projects'),
    ).toBeInTheDocument();
    expect(
      within(organism).getByRole('heading', { name: 'Good morning, Maya' }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(organism).getByRole('button', { name: 'Quick task' }),
    );
    const dialog = within(organism).getByRole('dialog', {
      name: 'Create a task',
    });

    fireEvent.change(
      within(dialog).getByPlaceholderText('What needs to be done?'),
      {
        target: { value: 'Prepare launch readiness review' },
      },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create task' }),
    );

    await waitFor(() => {
      expect(
        within(organism).getByText('Prepare launch readiness review'),
      ).toBeInTheDocument();
    });
  });
});
