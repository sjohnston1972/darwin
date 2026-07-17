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
export const PointerTypeSchema = z.enum(['mouse', 'touch', 'pen', 'unknown']);

export const InteractionSignalTypeSchema = z.enum([
  'rage_click',
  'false_affordance',
  'unexpected_double_click',
  'element_indecision',
  'cursor_thrashing',
]);

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
  properties: z
    .object({
      pointerType: PointerTypeSchema,
      interactive: z.boolean(),
      clickCount: z.number().int().min(1).max(3),
      xRatio: z.number().min(0).max(1),
      yRatio: z.number().min(0).max(1),
      hoverToClickMs: z.number().int().nonnegative().max(600_000).nullable(),
    })
    .strict()
    .optional(),
});

export const HoverStartedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('hover_started'),
  targetId: SemanticTargetSchema,
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z.object({ pointerType: PointerTypeSchema }).strict(),
});

export const HoverEndedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('hover_ended'),
  targetId: SemanticTargetSchema,
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      pointerType: PointerTypeSchema,
      durationMs: z.number().int().nonnegative().max(600_000),
      clicked: z.boolean(),
      immediateExit: z.boolean(),
      hoverToClickMs: z.number().int().nonnegative().max(600_000).nullable(),
    })
    .strict(),
});

export const PointerTransitionEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('pointer_transition'),
  targetId: SemanticTargetSchema,
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      pointerType: PointerTypeSchema,
      fromTargetId: SemanticTargetSchema.optional(),
      elapsedMs: z.number().int().nonnegative().max(600_000),
    })
    .strict(),
});

export const InteractionSignalEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('interaction_signal'),
  targetId: SemanticTargetSchema.optional(),
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      signal: InteractionSignalTypeSchema,
      pointerType: PointerTypeSchema,
      count: z.number().int().positive().max(100),
      windowMs: z.number().int().nonnegative().max(600_000),
      relatedTargetIds: z.array(SemanticTargetSchema).max(4).optional(),
    })
    .strict(),
});

export const DragAttemptedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('drag_attempted'),
  targetId: SemanticTargetSchema.optional(),
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      pointerType: PointerTypeSchema,
      draggable: z.boolean(),
      distancePx: z.number().int().nonnegative().max(10_000),
    })
    .strict(),
});

export const TouchCancelledEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('touch_cancelled'),
  targetId: SemanticTargetSchema.optional(),
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      pointerType: z.literal('touch'),
      durationMs: z.number().int().nonnegative().max(600_000),
    })
    .strict(),
});

export const RouteChangedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('route_changed'),
  properties: z
    .object({
      fromRoute: StudyRouteSchema,
    })
    .strict(),
});

export const BrowserNavigationEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('browser_navigation'),
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      direction: z.enum(['back', 'forward']),
      fromRoute: StudyRouteSchema,
      toRoute: StudyRouteSchema,
    })
    .strict(),
});

export const ViewportZoomChangedEventSchema = StudyEventBaseSchema.extend({
  eventType: z.literal('viewport_zoom_changed'),
  taskAttemptId: StudyIdentifierSchema.optional(),
  taskId: StudyIdentifierSchema.optional(),
  properties: z
    .object({
      fromScale: z.number().min(0.25).max(5),
      toScale: z.number().min(0.25).max(5),
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
  HoverStartedEventSchema,
  HoverEndedEventSchema,
  PointerTransitionEventSchema,
  InteractionSignalEventSchema,
  DragAttemptedEventSchema,
  TouchCancelledEventSchema,
  RouteChangedEventSchema,
  BrowserNavigationEventSchema,
  ViewportZoomChangedEventSchema,
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
  HoverStartedEventSchema.extend(storedAt),
  HoverEndedEventSchema.extend(storedAt),
  PointerTransitionEventSchema.extend(storedAt),
  InteractionSignalEventSchema.extend(storedAt),
  DragAttemptedEventSchema.extend(storedAt),
  TouchCancelledEventSchema.extend(storedAt),
  RouteChangedEventSchema.extend(storedAt),
  BrowserNavigationEventSchema.extend(storedAt),
  ViewportZoomChangedEventSchema.extend(storedAt),
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
  sessionCounts: z.record(z.string(), z.number().int().nonnegative()),
  participantCount: z.number().int().nonnegative(),
  behaviorSignalCount: z.number().int().nonnegative(),
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

export const EvidenceClassSchema = z.enum([
  'measured',
  'automated',
  'predicted',
  'synthetic',
]);

export const TaskAttemptSchema = z.object({
  attemptId: StudyIdentifierSchema,
  taskId: StudyIdentifierSchema,
  participantId: StudyIdentifierSchema,
  sessionId: StudyIdentifierSchema,
  appVersion: z.string().min(1),
  source: StudyTelemetrySourceSchema,
  outcome: z.enum(['success', 'failed', 'abandoned', 'open']),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  interactionCount: z.number().int().nonnegative(),
  routePath: z.array(StudyRouteSchema),
  eventIds: z.array(z.string().uuid()).min(1),
});

export const FrictionRuleSchema = z.enum([
  'navigation_loop',
  'repeated_target',
  'task_abandonment',
  'excess_path_length',
  'validation_friction',
  'search_dependency',
  'rage_click',
  'false_affordance',
  'hover_hesitation',
  'cursor_indecision',
  'drag_expectation',
  'touch_conflict',
  'browser_back_dependency',
  'zoom_readability',
]);

export const EvidenceTraceEventSchema = z.object({
  eventId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  eventType: z.string().min(1),
  route: StudyRouteSchema,
  targetId: SemanticTargetSchema.optional(),
});

const EvidenceAttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const EvidenceJourneyEventSchema = z.object({
  eventRef: z.string().regex(/^E-\d{3}$/),
  sequence: z.number().int().nonnegative(),
  offsetMs: z.number().int().nonnegative(),
  eventType: z.string().min(1),
  route: StudyRouteSchema,
  targetId: SemanticTargetSchema.optional(),
  attributes: z.record(z.string(), EvidenceAttributeValueSchema),
});

export const EvidenceJourneySchema = z.object({
  journeyId: z.string().regex(/^J-\d{3}$/),
  appVersion: z.string().min(1),
  source: z.enum(['real_user', 'automated']),
  viewport: ViewportClassSchema,
  eventCount: z.number().int().positive(),
  events: z.array(EvidenceJourneyEventSchema).min(1).max(500),
});

export const EvidenceQualitySchema = z.object({
  strength: z.enum(['insufficient', 'directional', 'substantial']),
  score: z.number().int().min(0).max(100),
  eventCount: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  completedAttemptCount: z.number().int().nonnegative(),
  limitations: z.array(z.string().min(1)),
});

export const EvidenceSignalSchema = z.object({
  evidenceId: z.string().regex(/^EV-\d{3}$/),
  ruleId: FrictionRuleSchema,
  ruleVersion: z.enum(['1.0.0', '1.1.0', '1.2.0']),
  severity: z.enum(['low', 'medium', 'high']),
  taskId: StudyIdentifierSchema.optional(),
  summary: z.string().min(1),
  affectedAttemptIds: z.array(StudyIdentifierSchema),
  supportingEventIds: z.array(z.string().uuid()).min(1),
  trace: z.array(EvidenceTraceEventSchema).min(1).max(12),
  support: z.object({
    events: z.number().int().positive(),
    attempts: z.number().int().nonnegative(),
    sessions: z.number().int().positive(),
    participants: z.number().int().positive(),
  }),
});

export const EvidenceTaskSummarySchema = z.object({
  taskId: StudyIdentifierSchema,
  attempts: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  medianDurationMs: z.number().int().nonnegative().nullable(),
  medianInteractions: z.number().nonnegative().nullable(),
  optimalInteractions: z.number().int().positive(),
  topPaths: z.array(
    z.object({
      path: z.array(StudyRouteSchema),
      count: z.number().int().positive(),
    }),
  ),
});

export const EvidencePackSchema = z.object({
  evidenceId: StudyIdentifierSchema,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
  parserVersion: z.enum(['1.0.0', '1.1.0', '1.2.0']),
  evidenceClass: EvidenceClassSchema,
  study: z.object({
    studyId: StudyIdentifierSchema,
    appVersion: z.string().min(1),
    sourceEventCount: z.number().int().nonnegative(),
    participants: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
  }),
  taskAttempts: z.array(TaskAttemptSchema),
  tasks: z.array(EvidenceTaskSummarySchema),
  quality: EvidenceQualitySchema,
  journeys: z.array(EvidenceJourneySchema).min(1).max(50),
  frictionSignals: z.array(EvidenceSignalSchema),
  applicationMap: z.object({
    product: z.object({
      name: z.literal('ProjectFlow'),
      purpose: z.string().min(1),
      primaryUser: z.string().min(1),
      domainEntities: z.array(z.string().min(1)).min(1),
      primaryGoals: z.array(z.string().min(1)).min(1),
    }),
    activeVariant: z.object({
      name: OrganismVariantSchema,
      version: z.string().min(1),
      navigation: z.array(z.string().min(1)).min(1),
      capabilities: z.array(z.string().min(1)).min(1),
    }),
    interfaceInventory: z
      .array(
        z.object({
          area: z.string().min(1),
          purpose: z.string().min(1),
          primaryActions: z.array(z.string().min(1)).min(1),
        }),
      )
      .min(1),
    routes: z.array(StudyRouteSchema),
    mutableAreas: z.array(z.string().min(1)),
    protectedAreas: z.array(z.string().min(1)),
  }),
});

export const EvidenceMutationCandidateSchema = z.object({
  id: StudyIdentifierSchema,
  title: z.string().min(1),
  problem: z.string().min(1),
  evidenceIds: z.array(z.string().regex(/^EV-\d{3}$/)).min(1),
  pressureClusterIds: z.array(StudyIdentifierSchema).min(1),
  hypothesis: z.string().min(1),
  change: z.string().min(1),
  predictedImpact: z.object({
    metric: z.string().min(1),
    direction: z.enum(['increase', 'decrease']),
    rationale: z.string().min(1),
  }),
  confidence: z.number().min(0).max(1),
  scorecard: z.object({
    evidenceStrength: z.number().int().min(0).max(100),
    userImpact: z.number().int().min(0).max(100),
    feasibility: z.number().int().min(0).max(100),
    validationClarity: z.number().int().min(0).max(100),
    total: z.number().int().min(0).max(100),
  }),
  scope: z.array(z.string().min(1)).min(1),
  tradeoffs: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  validationPlan: z.object({
    primaryMetric: z.string().min(1),
    baseline: z.string().min(1),
    successThreshold: z.string().min(1),
    guardrails: z.array(z.string().min(1)).min(1),
  }),
  codexBrief: z.string().min(1),
});

export const EvidencePressureClusterSchema = z.object({
  id: StudyIdentifierSchema,
  title: z.string().min(1),
  interpretation: z.string().min(1),
  evidenceIds: z.array(z.string().regex(/^EV-\d{3}$/)).min(1),
  affectedTargets: z.array(SemanticTargetSchema),
  userConsequence: z.string().min(1),
  competingExplanations: z.array(z.string().min(1)).min(1),
  mutationOpportunity: z.string().min(1),
});

export const EvidenceAnalysisSchema = z.object({
  analysisId: StudyIdentifierSchema,
  evidenceId: StudyIdentifierSchema,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.enum(['1.0.0', '1.1.0', '2.0.0', '2.1.0']),
  mode: z.literal('live'),
  model: z.string().min(1),
  promptCache: z
    .object({
      key: z.string().min(1).max(64),
      contextVersion: z.string().min(1),
      retention: z.literal('24h'),
      cachedTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  evidenceAssessment: z.object({
    summary: z.string().min(1),
    quality: EvidenceQualitySchema,
    pressureClusters: z.array(EvidencePressureClusterSchema).min(1).max(8),
    selectionRationale: z.string().min(1),
  }),
  selectedMutation: EvidenceMutationCandidateSchema,
  alternatives: z.array(EvidenceMutationCandidateSchema).min(2).max(5),
  unsupportedIdeasRejected: z.array(
    z.object({
      idea: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

export const CodexImplementationManifestSchema = z.object({
  manifestId: StudyIdentifierSchema,
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  analysisId: StudyIdentifierSchema,
  mutationId: StudyIdentifierSchema,
  mutationIds: z.array(StudyIdentifierSchema).min(1).max(6).optional(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.enum(['1.0.0', '1.1.0', '2.0.0', '2.1.0']),
  repositoryCommit: z.string().min(1),
  createdAt: z.string().datetime(),
  brief: z.string().min(1),
  evidenceCitations: z.array(z.string().regex(/^EV-\d{3}$/)).min(1),
  allowedPaths: z.array(z.string().min(1)).min(1),
  protectedPaths: z.array(z.string().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  validationCommands: z.array(z.string().min(1)).min(1),
});

export const CodexManifestRequestSchema = z
  .object({
    mutationId: StudyIdentifierSchema.optional(),
    mutationIds: z
      .array(StudyIdentifierSchema)
      .min(1)
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Mutation IDs must be unique.',
      })
      .optional(),
  })
  .refine((request) => !(request.mutationId && request.mutationIds), {
    message: 'Use mutationId or mutationIds, not both.',
  });

export const OutcomeCohortSchema = z.object({
  cohortId: StudyIdentifierSchema,
  studyId: StudyIdentifierSchema,
  variant: OrganismVariantSchema,
  appVersion: z.string().min(1),
  source: z.literal('automated'),
  evidenceId: StudyIdentifierSchema,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  taskId: StudyIdentifierSchema,
  attempts: z.number().int().positive(),
  successes: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(1),
  medianInteractions: z.number().nonnegative(),
  medianDurationMs: z.number().int().nonnegative(),
});

export const OutcomeValidationSchema = z.object({
  validationId: StudyIdentifierSchema,
  evidenceClass: z.literal('automated'),
  provenance: z.enum(['live_automated_run', 'recorded_automated_run']),
  generatedAt: z.string().datetime(),
  taskId: StudyIdentifierSchema,
  baseline: OutcomeCohortSchema,
  evolved: OutcomeCohortSchema,
  delta: z.object({
    interactions: z.number(),
    durationMs: z.number().int(),
    completionRate: z.number(),
  }),
  conclusion: z.string().min(1),
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

export const AnalysisModeSchema = z.literal('live');

export const AnalysisFailureReasonSchema = z.enum([
  'missing_api_key',
  'timeout',
  'api_error',
  'invalid_response',
]);

export const EvolutionAnalysisResponseSchema = z.object({
  mode: AnalysisModeSchema,
  model: z.string().min(1),
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

export const ManifestExecutionResponseSchema = z.object({
  manifestId: StudyIdentifierSchema,
  stage: z.enum(['approved', 'validated', 'released']),
  analysis: EvolutionAnalysisResponseSchema,
  diff: MutationDiffSchema,
  validation: ValidationResultSchema.nullable(),
  organism: OrganismStateSchema,
  record: EvolutionRecordSchema.nullable(),
});

export const EvolutionTimelineResponseSchema = z.object({
  records: z.array(EvolutionRecordSchema),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('darwin-api'),
  version: z.string().min(1),
  analysis: z.object({
    mode: z.literal('live'),
    model: z.string().min(1),
    liveModelAvailable: z.boolean(),
  }),
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
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;
export type TaskAttempt = z.infer<typeof TaskAttemptSchema>;
export type FrictionRule = z.infer<typeof FrictionRuleSchema>;
export type EvidenceTraceEvent = z.infer<typeof EvidenceTraceEventSchema>;
export type EvidenceSignal = z.infer<typeof EvidenceSignalSchema>;
export type EvidenceTaskSummary = z.infer<typeof EvidenceTaskSummarySchema>;
export type EvidencePack = z.infer<typeof EvidencePackSchema>;
export type EvidenceMutationCandidate = z.infer<
  typeof EvidenceMutationCandidateSchema
>;
export type EvidenceAnalysis = z.infer<typeof EvidenceAnalysisSchema>;
export type CodexImplementationManifest = z.infer<
  typeof CodexImplementationManifestSchema
>;
export type CodexManifestRequest = z.infer<typeof CodexManifestRequestSchema>;
export type OutcomeCohort = z.infer<typeof OutcomeCohortSchema>;
export type OutcomeValidation = z.infer<typeof OutcomeValidationSchema>;
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
export type AnalysisFailureReason = z.infer<typeof AnalysisFailureReasonSchema>;
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
export type ManifestExecutionResponse = z.infer<
  typeof ManifestExecutionResponseSchema
>;
export type FitnessBreakdown = z.infer<typeof FitnessBreakdownSchema>;
export type EvolutionRecord = z.infer<typeof EvolutionRecordSchema>;
export type EvolutionTimelineResponse = z.infer<
  typeof EvolutionTimelineResponseSchema
>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
