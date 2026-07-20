import type { DarwinProvenance } from '@darwin/shared';

export function ProvenanceChip({
  provenance,
}: {
  provenance?: DarwinProvenance;
}) {
  const resolved =
    provenance ??
    ({
      evidenceClass: 'legacy',
      label: 'Unknown / legacy',
      labExperimentId: null,
      taskDefinitionId: null,
      taskDefinitionHash: null,
      evidencePackId: null,
      evidenceHash: null,
      runIds: [],
    } satisfies DarwinProvenance);
  const label =
    resolved.evidenceClass === 'darwin_lab'
      ? 'Darwin Labs'
      : resolved.evidenceClass === 'human_study'
        ? 'Human study'
        : resolved.evidenceClass === 'scale_replay'
          ? 'Scale replay'
          : resolved.evidenceClass === 'automated_study'
            ? 'Automated study'
            : 'Unknown / legacy';
  return (
    <span
      className={`provenance-chip provenance-${resolved.evidenceClass}`}
      title={
        resolved.evidenceClass === 'darwin_lab'
          ? `Darwin Labs · ${resolved.labExperimentId}`
          : label
      }
    >
      {label}
    </span>
  );
}
