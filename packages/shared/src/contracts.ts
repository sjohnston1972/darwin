import { z } from 'zod';

export const PersonaSchema = z.enum([
  'project_manager',
  'developer',
  'executive',
  'administrator',
]);

export const OrganismVariantSchema = z.enum(['baseline', 'evolved']);

export const WorkflowGoalSchema = z.enum([
  'find_assigned_tasks',
  'create_task',
  'update_task',
  'review_project_health',
  'review_reports',
  'manage_members',
  'configure_workspace',
]);

export const TelemetryEventTypeSchema = z.enum([
  'page_view',
  'click',
  'search',
  'workflow_started',
  'workflow_completed',
  'workflow_abandoned',
  'validation_error',
  'backtrack',
]);

export const TelemetryEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  sessionId: z.string().min(1),
  persona: PersonaSchema,
  variant: OrganismVariantSchema,
  goal: WorkflowGoalSchema,
  type: TelemetryEventTypeSchema,
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
  variant: OrganismVariantSchema,
  eventCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const SimulationRequestSchema = z.object({
  seed: z.number().int().default(1859),
  variant: OrganismVariantSchema.default('baseline'),
});

export const SimulationMetricsSchema = z.object({
  sessions: z.number().int().positive(),
  workflowCompletionRate: z.number().min(0).max(1),
  workflowAbandonmentRate: z.number().min(0).max(1),
  averagePageViewsPerWorkflow: z.number().nonnegative(),
  averageBacktracksPerWorkflow: z.number().nonnegative(),
  searchUsageRate: z.number().min(0).max(1),
  validationErrorRate: z.number().min(0).max(1),
  medianWorkflowDurationMs: z.number().nonnegative(),
});

export const FrictionSignalSchema = z.object({
  key: z.enum([
    'workflow_abandonment',
    'navigation_overhead',
    'backtracking',
    'search_dependency',
    'validation_errors',
  ]),
  value: z.number().nonnegative(),
  unit: z.enum(['rate', 'events_per_workflow', 'page_views', 'count']),
});

export const SimulationSummarySchema = z.object({
  run: SimulationRunSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{8}$/),
  personaCounts: z.record(z.number().int().nonnegative()),
  eventTypeCounts: z.record(z.number().int().nonnegative()),
  goalCounts: z.record(z.number().int().nonnegative()),
  routeCounts: z.record(z.number().int().nonnegative()),
  metrics: SimulationMetricsSchema,
  frictionSignals: z.array(FrictionSignalSchema),
});

export const SimulationResultSchema = z.object({
  run: SimulationRunSchema,
  events: z.array(TelemetryEventSchema),
  summary: SimulationSummarySchema,
});

export const SimulationCreateResponseSchema = z.object({
  run: SimulationRunSchema,
  summary: SimulationSummarySchema,
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

export const FitnessComparisonSchema = z.object({
  baseline: FitnessBreakdownSchema,
  evolved: FitnessBreakdownSchema,
  delta: z.number(),
});

export const EvolutionAnalysisRequestSchema = z.object({
  simulationId: z.string().min(1),
});

export const EvolutionAnalysisResponseSchema = z.object({
  mode: z.literal('mock'),
  fitness: FitnessComparisonSchema,
  findings: z.array(FrictionFindingSchema).min(1),
  proposal: MutationProposalSchema,
});

export const OrganismStateSchema = z.object({
  variant: OrganismVariantSchema,
  genomeVersion: z.string().min(1),
  evolutionCycles: z.number().int().nonnegative(),
  activeMutationId: z.string().min(1).nullable(),
  updatedAt: z.string().datetime(),
});

export const MutationDecisionResponseSchema = z.object({
  proposal: MutationProposalSchema,
  organism: OrganismStateSchema,
});

export const DemoResetResponseSchema = z.object({
  status: z.literal('reset'),
  organism: OrganismStateSchema,
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
export type OrganismVariant = z.infer<typeof OrganismVariantSchema>;
export type WorkflowGoal = z.infer<typeof WorkflowGoalSchema>;
export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type SimulationRun = z.infer<typeof SimulationRunSchema>;
export type SimulationRequest = z.infer<typeof SimulationRequestSchema>;
export type SimulationMetrics = z.infer<typeof SimulationMetricsSchema>;
export type FrictionSignal = z.infer<typeof FrictionSignalSchema>;
export type SimulationSummary = z.infer<typeof SimulationSummarySchema>;
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
export type SimulationCreateResponse = z.infer<
  typeof SimulationCreateResponseSchema
>;
export type FrictionFinding = z.infer<typeof FrictionFindingSchema>;
export type MutationProposal = z.infer<typeof MutationProposalSchema>;
export type FitnessComparison = z.infer<typeof FitnessComparisonSchema>;
export type EvolutionAnalysisRequest = z.infer<
  typeof EvolutionAnalysisRequestSchema
>;
export type EvolutionAnalysisResponse = z.infer<
  typeof EvolutionAnalysisResponseSchema
>;
export type OrganismState = z.infer<typeof OrganismStateSchema>;
export type MutationDecisionResponse = z.infer<
  typeof MutationDecisionResponseSchema
>;
export type DemoResetResponse = z.infer<typeof DemoResetResponseSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type FitnessBreakdown = z.infer<typeof FitnessBreakdownSchema>;
export type EvolutionRecord = z.infer<typeof EvolutionRecordSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
