import { Dna } from 'lucide-react';
import type { ReactNode } from 'react';

import { InfoTip } from '../components/InfoTip';

export type ProvenanceFilter =
  | 'all'
  | 'human_study'
  | 'darwin_lab'
  | 'automated_study'
  | 'scale_replay'
  | 'legacy';

export function GenomeHistoryView({
  baselineSha,
  children,
  executionCount,
  hasMore,
  onFilterChange,
  onLoadMore,
  provenanceFilter,
}: {
  baselineSha: string | null;
  children: ReactNode;
  executionCount: number;
  hasMore: boolean;
  onFilterChange: (filter: ProvenanceFilter) => void;
  onLoadMore: () => void;
  provenanceFilter: ProvenanceFilter;
}) {
  return (
    <section
      className="mt-8 surface-panel"
      id="genome-record"
      aria-labelledby="genome-title"
    >
      <div className="panel-heading">
        <div>
          <p className="section-label">Evolution history</p>
          <div className="heading-with-help">
            <h2 id="genome-title" className="mt-2 text-xl font-semibold">
              Genome
            </h2>
            <InfoTip text="The retained genome history, including the measured evidence, code mutation, validation, release state, and any controlled rollback." />
          </div>
        </div>
        <Dna size={19} className="text-mist" />
      </div>
      <p className="mt-3 text-sm text-mist">
        Only mutations released after human review enter the retained genome.
        Active candidates remain in Mutations until release.
      </p>
      <label className="artifact-filter">
        <span>Evidence class</span>
        <select
          value={provenanceFilter}
          onChange={(event) =>
            onFilterChange(event.target.value as ProvenanceFilter)
          }
        >
          <option value="all">All evidence classes</option>
          <option value="human_study">Human study</option>
          <option value="darwin_lab">Darwin Labs</option>
          <option value="automated_study">Automated study</option>
          <option value="scale_replay">Scale replay</option>
          <option value="legacy">Unknown / legacy</option>
        </select>
      </label>
      <div className="genome-list">
        <div className="genome-head-row">
          <span className="genome-head-cell">Genome</span>
          <span className="genome-head-cell">Mutation</span>
          <span className="genome-head-cell">Selection</span>
          <span className="genome-head-cell">Fitness</span>
          <span className="genome-head-cell genome-head-state">State</span>
          <span className="genome-chevron-spacer" aria-hidden="true" />
        </div>
        <GenomeBaselineRow
          genome="v0.1"
          mutation="Foundation established"
          selection="Baseline"
          fitness="--"
          state="RETAINED"
        />
        {!executionCount && (
          <GenomeBaselineRow
            genome={baselineSha?.slice(0, 12) ?? 'baseline'}
            mutation="ProjectFlow repository snapshot connected"
            selection="Baseline"
            fitness="--"
            state="CURRENT"
          />
        )}
        {children}
      </div>
      {hasMore && (
        <button
          className="secondary-action artifact-load-more"
          type="button"
          onClick={onLoadMore}
        >
          Load older Genome records
        </button>
      )}
    </section>
  );
}

// A non-expandable baseline entry laid out on the same grid as the expandable
// fossil rows so every Genome row's columns and state chip line up.
function GenomeBaselineRow({
  genome,
  mutation,
  selection,
  fitness,
  state,
}: {
  genome: string;
  mutation: string;
  selection: string;
  fitness: string;
  state: string;
}) {
  return (
    <div className="genome-static-row">
      <div className="fossil-artifact-summary">
        <div>
          <span>Genome</span>
          <strong>{genome}</strong>
        </div>
        <div>
          <span>Mutation</span>
          <strong title={mutation}>{mutation}</strong>
        </div>
        <div>
          <span>Selection</span>
          <strong>{selection}</strong>
        </div>
        <div>
          <span>Fitness</span>
          <strong>{fitness}</strong>
        </div>
        <span className="status-badge">{state}</span>
      </div>
      <span className="genome-chevron-spacer" aria-hidden="true" />
    </div>
  );
}
