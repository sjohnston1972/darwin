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
          <option value="darwin_lab">Darwin Lab</option>
          <option value="automated_study">Automated study</option>
          <option value="scale_replay">Scale replay</option>
          <option value="legacy">Unknown / legacy</option>
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-mist">
            <tr>
              <th className="px-6 py-3 font-medium">Genome</th>
              <th className="px-6 py-3 font-medium">Mutation</th>
              <th className="px-6 py-3 font-medium">Selection</th>
              <th className="px-6 py-3 font-medium">Fitness</th>
              <th className="px-6 py-3 text-right font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-6 py-5 font-mono">v0.1</td>
              <td className="px-6 py-5 text-mist">Foundation established</td>
              <td className="px-6 py-5 text-mist">Baseline</td>
              <td className="px-6 py-5 font-mono text-mist">--</td>
              <td className="px-6 py-5 text-right">
                <span className="status-badge">RETAINED</span>
              </td>
            </tr>
            {!executionCount && (
              <tr className="border-t border-line">
                <td className="px-6 py-5 font-mono">
                  {baselineSha?.slice(0, 12) ?? 'baseline'}
                </td>
                <td className="px-6 py-5 text-mist">
                  ProjectFlow repository snapshot connected
                </td>
                <td className="px-6 py-5 text-mist">Baseline</td>
                <td className="px-6 py-5 font-mono text-mist">--</td>
                <td className="px-6 py-5 text-right">
                  <span className="status-badge">CURRENT</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {children}
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
