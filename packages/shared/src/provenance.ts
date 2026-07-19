import { z } from 'zod';

export const DarwinEvidenceClassSchema = z.enum([
  'human_study',
  'automated_study',
  'darwin_lab',
  'scale_replay',
  'legacy',
]);

export const LegacyProvenance = {
  evidenceClass: 'legacy' as const,
  label: 'Unknown / legacy',
  labExperimentId: null,
  taskDefinitionId: null,
  taskDefinitionHash: null,
  evidencePackId: null,
  evidenceHash: null,
  runIds: [] as string[],
};

export const DarwinProvenanceSchema = z
  .object({
    evidenceClass: DarwinEvidenceClassSchema,
    label: z.string().min(1).max(48),
    labExperimentId: z.string().min(1).max(128).nullable(),
    taskDefinitionId: z.string().min(1).max(128).nullable(),
    taskDefinitionHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    evidencePackId: z.string().min(1).max(128).nullable(),
    evidenceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    runIds: z.array(z.string().min(1).max(128)).max(20),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (
      provenance.evidenceClass === 'darwin_lab' &&
      (!provenance.labExperimentId ||
        !provenance.taskDefinitionId ||
        !provenance.taskDefinitionHash)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Darwin Lab provenance requires the experiment and immutable task definition.',
      });
    }
  });

export type DarwinEvidenceClass = z.infer<typeof DarwinEvidenceClassSchema>;
export type DarwinProvenance = z.infer<typeof DarwinProvenanceSchema>;
