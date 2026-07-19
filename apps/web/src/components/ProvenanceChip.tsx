import type { DarwinProvenance } from '@darwin/shared';

export function ProvenanceChip({
  provenance,
}: {
  provenance: DarwinProvenance;
}) {
  const label =
    provenance.evidenceClass === 'darwin_lab'
      ? 'Darwin Lab'
      : provenance.evidenceClass === 'human_study'
        ? 'Human study'
        : provenance.evidenceClass === 'scale_replay'
          ? 'Scale replay'
          : provenance.evidenceClass === 'automated_study'
            ? 'Automated study'
            : 'Unknown / legacy';
  return (
    <span
      className={`provenance-chip provenance-${provenance.evidenceClass}`}
      title={
        provenance.evidenceClass === 'darwin_lab'
          ? `Darwin Lab · ${provenance.labExperimentId}`
          : label
      }
    >
      {label}
    </span>
  );
}
