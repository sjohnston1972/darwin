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

const StudyIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/);
const StudyRouteSchema = z.string().min(1).max(256).startsWith('/');
const SemanticTargetSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const StudyTelemetrySourceSchema = z.enum([
  'real_user',
  'automated',
  'synthetic',
]);

export const ViewportClassSchema = z.enum(['mobile', 'tablet', 'desktop']);

const StudyEventBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.string().uuid(),
    sessionId: StudyIdentifierSchema,
    participantId: StudyIdentifierSchema,
    studyId: StudyIdentifierSchema,
    appVersion: z.string().min(1).max(32),
    source: StudyTelemetrySourceSchema,
    occurredAt: z.string().datetime(),
    sequence: z.number().int().nonnegative(),
    route: StudyRouteSchema,
    viewport: ViewportClassSchema,
  })
  .strict();

export const SessionStartedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('session_started'),
});

export const SessionEndedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('session_ended'),
  durationMs: z.number().int().nonnegative(),
});

export const PageViewEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('page_view'),
});

export const ElementClickedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('element_clicked'),
  targetId: SemanticTargetSchema,
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
});

export const RouteChangedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('route_changed'),
  properties: z
    .object({
      fromRoute: StudyRouteSchema,
    })
    .strict(),
});

export const ValidationErrorEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('validation_error'),
  targetId: SemanticTargetSchema,
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      fieldId: SemanticTargetSchema,
      errorCode: SemanticTargetSchema,
    })
    .strict(),
});

export const SearchPerformedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('search_performed'),
  targetId: SemanticTargetSchema,
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      queryLength: z.number().int().min(0).max(512),
      resultCount: z.number().int().nonnegative().max(10_000),
    })
    .strict(),
});

export const TaskStartedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('task_started'),
  taskAttemptId: StudyIdentifierSchema,
  taskId: StudyIdentifierSchema,
});

export const TaskCompletedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('task_completed'),
  taskAttemptId: StudyIdentifierSchema,
  taskId: StudyIdentifierSchema,
  durationMs: z.number().int().nonnegative(),
  outcome: z.literal('success'),
});

export const TaskFailedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('task_failed'),
  taskAttemptId: StudyIdentifierSchema,
  taskId: StudyIdentifierSchema,
  durationMs: z.number().int().nonnegative(),
  outcome: z.enum(['failed', 'abandoned']),
});

export const FeedbackSubmittedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('feedback_submitted'),
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      length: z.number().int().min(0).max(500),
    })
    .strict(),
});

export const StudyTelemetryEventSchema = z.discriminatedUnion('eventType', [
  SessionStartedEventSchema,
  SessionEndedEventSchema,
  PageViewEventSchema,
  ElementClickedEventSchema,
  RouteChangedEventSchema,
  ValidationErrorEventSchema,
  SearchPerformedEventSchema,
  TaskStartedEventSchema,
  TaskCompletedEventSchema,
  TaskFailedEventSchema,
  FeedbackSubmittedEventSchema,
]);

export const TelemetryBatchSchema = z
  .object({
    events: z.array(StudyTelemetryEventSchema).min(1).max(50),
  })
  .strict();

export const TelemetryReceiptSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative().default(0),
});

const storedAt = { receivedAt: z.string().datetime() };
export const StoredTelemetryEventSchema = z.discriminatedUnion('eventType', [
  SessionStartedEventSchema.extend(storedAt),
  SessionEndedEventSchema.extend(storedAt),
  PageViewEventSchema.extend(storedAt),
  ElementClickedEventSchema.extend(storedAt),
  RouteChangedEventSchema.extend(storedAt),
  ValidationErrorEventSchema.extend(storedAt),
  SearchPerformedEventSchema.extend(storedAt),
  TaskStartedEventSchema.extend(storedAt),
  TaskCompletedEventSchema.extend(storedAt),
  TaskFailedEventSchema.extend(storedAt),
  FeedbackSubmittedEventSchema.extend(storedAt),
]);

export const StudyEventsResponseSchema = z.object({
  studyId: StudyIdentifierSchema,
  events: z.array(StoredTelemetryEventSchema),
  count: z.number().int().nonnegative(),
});

export const StudySessionResponseSchema = z.object({
  studyId: StudyIdentifierSchema,
  sessionId: StudyIdentifierSchema,
  events: z.array(StoredTelemetryEventSchema),
});

export const ProjectFlowProjectSchema = z.object({
  id: StudyIdentifierSchema,
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(8),
  owner: z.string().min(1).max(80),
  status: z.enum(['On track', 'At risk', 'Overdue']),
  dueDate: z.string().min(1).max(32),
});

export const ProjectFlowTaskSchema = z.object({
  id: StudyIdentifierSchema,
  projectId: StudyIdentifierSchema,
  title: z.string().min(1).max(160),
  assignee: z.string().min(1).max(80),
  status: z.enum(['To do', 'In progress', 'Done']),
  dueDate: z.string().min(1).max(32),
});

export const ProjectFlowWorkspaceSchema = z.object({
  projects: z.array(ProjectFlowProjectSchema).max(100),
  tasks: z.array(ProjectFlowTaskSchema).max(500),
  updatedAt: z.string().datetime(),
});

export const ParticipantWorkspaceResponseSchema = z.object({
  studyId: StudyIdentifierSchema,
  participantId: StudyIdentifierSchema,
  workspace: ProjectFlowWorkspaceSchema.nullable(),
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

export const AnalysisModeSchema = z.enum(['mock', 'live', 'fallback']);

export const AnalysisFallbackReasonSchema = z.enum([
  'missing_api_key',
  'timeout',
  'api_error',
  'invalid_response',
]);

export const EvolutionAnalysisResponseSchema = z.object({
  mode: AnalysisModeSchema,
  model: z.string().min(1),
  fallbackReason: AnalysisFallbackReasonSchema.optional(),
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
  source: z.literal('recorded_repository_run'),
  commit: z.string().min(1),
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

export const MutationDiffSchema = z.object({
  mutationId: z.string().min(1),
  source: z.literal('repository_source_comparison'),
  baseRef: z.string().min(1),
  targetRef: z.string().min(1),
  patch: z.string().min(1),
  generatedAt: z.string().datetime(),
});

export const MutationValidationResponseSchema = z.object({
  proposal: MutationProposalSchema,
  validation: ValidationResultSchema,
});

export const MutationReleaseResponseSchema = z.object({
  proposal: MutationProposalSchema,
  organism: OrganismStateSchema,
  record: EvolutionRecordSchema,
});

export const EvolutionTimelineResponseSchema = z.object({
  records: z.array(EvolutionRecordSchema),
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
export type StudyTelemetrySource = z.infer<typeof StudyTelemetrySourceSchema>;
export type ViewportClass = z.infer<typeof ViewportClassSchema>;
export type StudyTelemetryEvent = z.infer<typeof StudyTelemetryEventSchema>;
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>;
export type TelemetryReceipt = z.infer<typeof TelemetryReceiptSchema>;
export type StoredTelemetryEvent = z.infer<typeof StoredTelemetryEventSchema>;
export type StudyEventsResponse = z.infer<typeof StudyEventsResponseSchema>;
export type StudySessionResponse = z.infer<typeof StudySessionResponseSchema>;
export type ProjectFlowProject = z.infer<typeof ProjectFlowProjectSchema>;
export type ProjectFlowTask = z.infer<typeof ProjectFlowTaskSchema>;
export type ProjectFlowWorkspace = z.infer<typeof ProjectFlowWorkspaceSchema>;
export type ParticipantWorkspaceResponse = z.infer<
  typeof ParticipantWorkspaceResponseSchema
>;
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
export type AnalysisMode = z.infer<typeof AnalysisModeSchema>;
export type AnalysisFallbackReason = z.infer<
  typeof AnalysisFallbackReasonSchema
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
export type MutationDiff = z.infer<typeof MutationDiffSchema>;
export type MutationValidationResponse = z.infer<
  typeof MutationValidationResponseSchema
>;
export type MutationReleaseResponse = z.infer<
  typeof MutationReleaseResponseSchema
>;
export type FitnessBreakdown = z.infer<typeof FitnessBreakdownSchema>;
export type EvolutionRecord = z.infer<typeof EvolutionRecordSchema>;
export type EvolutionTimelineResponse = z.infer<
  typeof EvolutionTimelineResponseSchema
>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
