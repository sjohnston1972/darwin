import { z } from 'zod';

export const PersonaSchema = z.enum([
  'project_manager',
  'developer',
  'executive',
  'administrator',
]);

export const TelemetryEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  persona: PersonaSchema,
  type: z.enum([
    'page_view',
    'click',
    'search',
    'workflow_started',
    'workflow_completed',
    'workflow_abandoned',
    'validation_error',
    'backtrack',
  ]),
  route: z.string().min(1),
  target: z.string().optional(),
  timestamp: z.string().datetime(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const FitnessBreakdownSchema = z.object({
  score: z.number().min(0).max(100),
  completionRate: z.number().min(0).max(100),
  navigationEfficiency: z.number().min(0).max(100),
  inverseErrorRate: z.number().min(0).max(100),
  featureDiscovery: z.number().min(0).max(100),
  inverseTaskDuration: z.number().min(0).max(100),
});

export const SimulationRunSchema = z.object({
  id: z.string().min(1),
  seed: z.number().int(),
  variant: z.enum(['baseline', 'evolved']),
  eventCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const FrictionFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  impact: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).min(1),
});

export const MutationProposalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  observation: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  hypothesis: z.string().min(1),
  implementationSummary: z.string().min(1),
  predictedFitnessGain: z.number(),
  confidence: z.number().min(0).max(1),
  risk: z.enum(['low', 'medium', 'high']),
  affectedFiles: z.array(z.string().min(1)).min(1),
  status: z.enum(['proposed', 'approved', 'rejected', 'validated', 'released']),
});

export const ValidationResultSchema = z.object({
  id: z.string().min(1),
  mutationId: z.string().min(1),
  status: z.enum(['passed', 'failed']),
  checks: z.array(
    z.object({
      name: z.string().min(1),
      status: z.enum(['passed', 'failed']),
      durationMs: z.number().int().nonnegative(),
      output: z.string(),
    }),
  ),
  fitness: FitnessBreakdownSchema,
  recordedAt: z.string().datetime(),
});

export const EvolutionRecordSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  mutationId: z.string().min(1).optional(),
  outcome: z.enum(['baseline', 'survived', 'failed_selection']),
  fitness: FitnessBreakdownSchema,
  recordedAt: z.string().datetime(),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('darwin-api'),
  version: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type Persona = z.infer<typeof PersonaSchema>;
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type SimulationRun = z.infer<typeof SimulationRunSchema>;
export type FrictionFinding = z.infer<typeof FrictionFindingSchema>;
export type MutationProposal = z.infer<typeof MutationProposalSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type FitnessBreakdown = z.infer<typeof FitnessBreakdownSchema>;
export type EvolutionRecord = z.infer<typeof EvolutionRecordSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
