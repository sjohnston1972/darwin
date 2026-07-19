import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ControlRoomView } from './ControlRoomView';
import { GenomeHistoryView } from './GenomeHistoryView';

describe('extracted dashboard views', () => {
  it('renders the primary evolution message and measured-study action', () => {
    render(
      <ControlRoomView
        analysisReady={false}
        measuredEventCount={0}
        metrics={[
          {
            label: 'Measured events',
            help: 'Real semantic records.',
            value: '0',
            meta: 'Awaiting a real session',
            tone: 'neutral',
          },
        ]}
        statusText="Awaiting measured behavior"
        studyBlocked={false}
        targetApplicationUrl="https://projectflow.example/?study=true"
        targetConnected={false}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Software that evolves.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open measured study' }),
    ).toHaveAttribute('href', 'https://projectflow.example/?study=true');
  });

  it('keeps the Genome evidence-class filter controlled by its parent', () => {
    const onFilterChange = vi.fn();
    render(
      <GenomeHistoryView
        baselineSha={null}
        executionCount={0}
        hasMore={false}
        onFilterChange={onFilterChange}
        onLoadMore={vi.fn()}
        provenanceFilter="all"
      >
        <div>Fossil records</div>
      </GenomeHistoryView>,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Evidence class' }), {
      target: { value: 'darwin_lab' },
    });
    expect(onFilterChange).toHaveBeenCalledWith('darwin_lab');
    expect(screen.getByText('Fossil records')).toBeInTheDocument();
  });
});
