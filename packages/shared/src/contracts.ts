import { z } from 'zod';

import { DarwinProvenanceSchema, LegacyProvenance } from './provenance';

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
const StudyRouteSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(
    /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[A-Fa-f0-9]{2})*(?:\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[A-Fa-f0-9]{2})+)*\/?$/,
    'Route must be a safe application pathname without query, fragment, whitespace, or control characters.',
  );
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
    provenance: DarwinProvenanceSchema.optional(),
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
  cursor: z.string().datetime().nullable().default(null),
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
  evidenceId: z.string().regex(/^EV-(?:\d{3}|[a-f0-9]{12})$/),
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
  provenance: DarwinProvenanceSchema.default(LegacyProvenance),
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

export const EvidenceCitationIdSchema = z
  .string()
  .regex(/^(?:EV-(?:[0-9]{3}|[a-f0-9]{12})|L-EV-[0-9]{3})$/);

export const EvidenceMutationCandidateSchema = z.object({
  provenance: DarwinProvenanceSchema.default(LegacyProvenance),
  id: StudyIdentifierSchema,
  title: z.string().min(1),
  problem: z.string().min(1),
  evidenceIds: z.array(EvidenceCitationIdSchema).min(1),
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
  evidenceIds: z.array(EvidenceCitationIdSchema).min(1),
  affectedTargets: z.array(SemanticTargetSchema),
  userConsequence: z.string().min(1),
  competingExplanations: z.array(z.string().min(1)).min(1),
  mutationOpportunity: z.string().min(1),
});

export const RepositoryContextSchema = z.object({
  owner: StudyIdentifierSchema,
  name: StudyIdentifierSchema,
  fullName: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
  url: z.string().url(),
  branch: StudyIdentifierSchema,
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string().datetime(),
  mutablePaths: z.array(z.string().min(1).max(256)).min(1).max(40),
  protectedPaths: z.array(z.string().min(1).max(256)).min(1).max(40),
  contextPaths: z.array(z.string().min(1).max(256)).min(1).max(20),
  validationCommands: z.array(z.string().min(1).max(256)).min(1).max(12),
  maximumChangedFiles: z.number().int().positive(),
  maximumChangedLines: z.number().int().positive(),
  productionUrl: z.string().url(),
  studyUrl: z.string().url(),
});

export const TargetConnectionRequestSchema = z
  .object({
    fullName: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
    branch: StudyIdentifierSchema,
    productionUrl: z.string().url(),
    studyUrl: z.string().url(),
  })
  .strict();

export const TargetConnectionCheckSchema = z.object({
  id: z.enum(['repository', 'contract', 'runtime', 'telemetry']),
  label: z.string().min(1),
  status: z.literal('passed'),
  detail: z.string().min(1),
});

export const TargetApplicationConnectionSchema = z.object({
  connectionId: StudyIdentifierSchema,
  status: z.literal('connected'),
  connectedAt: z.string().datetime(),
  verifiedAt: z.string().datetime(),
  target: z.object({
    targetId: SemanticTargetSchema,
    name: z.string().min(1),
    purpose: z.string().min(1),
    defaultBranch: StudyIdentifierSchema,
  }),
  repository: RepositoryContextSchema,
  checks: z.array(TargetConnectionCheckSchema).length(4),
});

export const EvidenceAnalysisSchema = z.object({
  provenance: DarwinProvenanceSchema.default(LegacyProvenance),
  analysisId: StudyIdentifierSchema,
  evidenceId: StudyIdentifierSchema,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.enum(['1.0.0', '1.1.0', '2.0.0', '2.1.0', '3.0.0']),
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
  repository: RepositoryContextSchema.optional(),
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
  provenance: DarwinProvenanceSchema.default(LegacyProvenance),
  manifestId: StudyIdentifierSchema,
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  analysisId: StudyIdentifierSchema,
  mutationId: StudyIdentifierSchema,
  mutationIds: z.array(StudyIdentifierSchema).min(1).max(6).optional(),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.enum(['1.0.0', '1.1.0', '2.0.0', '2.1.0', '3.0.0']),
  repositoryCommit: z.string().min(1),
  repository: RepositoryContextSchema.optional(),
  createdAt: z.string().datetime(),
  brief: z.string().min(1),
  evidenceCitations: z.array(EvidenceCitationIdSchema).min(1),
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

export const DemoResetRequestSchema = z
  .object({
    confirmation: z.literal('RESET DARWIN DEMO'),
    exportAcknowledged: z.literal(true),
  })
  .strict();

export const DemoResetResponseSchema = z.object({
  status: z.literal('reset'),
  repositoryResetDispatched: z.boolean(),
  recovery: z.object({
    projectFlow: z.literal('baseline-workflow-dispatched'),
    darwinData: z.literal('not-recoverable-after-reset'),
  }),
});

export const RepositoryExecutionStatusSchema = z.enum([
  'prepared',
  'queued',
  'codex_running',
  'validating',
  'failed',
  'pull_request_open',
  'preview_ready',
  'releasing',
  'released',
]);

export const RepositoryExecutionCheckSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(['pending', 'running', 'passed', 'failed']),
  durationMs: z.number().int().nonnegative().nullable(),
  output: z.string().max(20_000),
});

export const RepositoryRollbackStatusSchema = z.enum([
  'prepared',
  'queued',
  'validating',
  'failed',
  'pull_request_open',
  'preview_ready',
  'releasing',
  'released',
]);

export const RepositoryRollbackSchema = z.object({
  rollbackId: StudyIdentifierSchema,
  status: RepositoryRollbackStatusSchema,
  branch: z.string().min(1),
  revertedSha: z.string().regex(/^[a-f0-9]{40}$/),
  headSha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .nullable(),
  workflowRunId: z.number().int().positive().nullable(),
  workflowUrl: z.string().url().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  previewUrl: z.string().url().nullable(),
  patch: z.string().max(500_000).nullable(),
  changedFiles: z.array(z.string().min(1).max(500)).max(100),
  checks: z.array(RepositoryExecutionCheckSchema).max(50),
  error: z.string().max(4_000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const RepositoryMutationExecutionSchema = z.object({
  provenance: DarwinProvenanceSchema.default(LegacyProvenance),
  executionId: StudyIdentifierSchema,
  manifestId: StudyIdentifierSchema,
  manifestHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .default(null),
  analysisId: StudyIdentifierSchema,
  repository: RepositoryContextSchema,
  status: RepositoryExecutionStatusSchema,
  branch: z.string().min(1),
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  headSha: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .nullable(),
  workflowRunId: z.number().int().positive().nullable(),
  workflowUrl: z.string().url().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  previewUrl: z.string().url().nullable(),
  patch: z.string().max(500_000).nullable(),
  changedFiles: z.array(z.string().min(1).max(500)).max(100),
  checks: z.array(RepositoryExecutionCheckSchema).max(50),
  codex: z.object({
    threadId: z.string().min(1).nullable(),
    finalMessage: z.string().max(100_000).nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    cachedInputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
  }),
  rollback: RepositoryRollbackSchema.nullable().default(null),
  error: z.string().max(4_000).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  version: z.number().int().nonnegative().default(0),
});

export const StudyEvidenceClassSchema = z.enum([
  'human_study',
  'automated_study',
  'darwin_lab',
]);

export const StudySessionIssueRequestSchema = z
  .object({
    studyId: StudyIdentifierSchema,
    appVersion: z.string().min(1).max(32),
    evidenceClass: StudyEvidenceClassSchema,
    labExperimentId: StudyIdentifierSchema.nullable().default(null),
    runId: StudyIdentifierSchema.nullable().default(null),
  })
  .strict()
  .superRefine((request, context) => {
    const labIdentity = Boolean(request.labExperimentId && request.runId);
    if ((request.evidenceClass === 'darwin_lab') !== labIdentity) {
      context.addIssue({
        code: 'custom',
        message: 'Darwin Lab sessions require an experiment and run identity.',
      });
    }
  });

export const StudySessionClaimsSchema = z
  .object({
    version: z.literal(1),
    studyId: StudyIdentifierSchema,
    participantId: StudyIdentifierSchema,
    sessionId: StudyIdentifierSchema,
    appVersion: z.string().min(1).max(32),
    evidenceClass: StudyEvidenceClassSchema,
    source: z.enum(['real_user', 'automated']),
    targetId: z.literal('projectflow'),
    deploymentOrigin: z.string().url(),
    labExperimentId: StudyIdentifierSchema.nullable(),
    runId: StudyIdentifierSchema.nullable(),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export const StudySessionIssueResponseSchema = z
  .object({
    token: z.string().min(32).max(4_096),
    claims: StudySessionClaimsSchema,
    expiresAt: z.string().datetime(),
  })
  .strict();

export const EvolutionCycleSchema = z.object({
  studyId: StudyIdentifierSchema,
  startedAt: z.string().datetime().nullable(),
  genomeEvolutionCount: z.number().int().nonnegative(),
});

export const RepositoryRollbackSummarySchema = RepositoryRollbackSchema.omit({
  patch: true,
  changedFiles: true,
  checks: true,
});

export const RepositoryExecutionSummarySchema =
  RepositoryMutationExecutionSchema.omit({
    patch: true,
    changedFiles: true,
    checks: true,
    codex: true,
  }).extend({
    rollback: RepositoryRollbackSummarySchema.nullable().default(null),
  });

export const GenomeHistoryResponseSchema = z.object({
  evolutionCycle: EvolutionCycleSchema,
  executions: z.array(RepositoryExecutionSummarySchema),
  nextCursor: z.string().min(1).max(512).nullable().default(null),
});

export const ObservationArchiveSchema = z.object({
  archiveId: StudyIdentifierSchema,
  evidence: EvidencePackSchema,
  analysis: EvidenceAnalysisSchema,
  execution: RepositoryMutationExecutionSchema.pick({
    executionId: true,
    manifestId: true,
    status: true,
    createdAt: true,
    completedAt: true,
  }),
});

export const ObservationArchivesResponseSchema = z.object({
  archives: z.array(
    z.object({
      archiveId: StudyIdentifierSchema,
      evidenceId: StudyIdentifierSchema,
      evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
      provenance: DarwinProvenanceSchema,
      sourceEventCount: z.number().int().nonnegative(),
      sessions: z.number().int().nonnegative(),
      participants: z.number().int().nonnegative(),
      attempts: z.number().int().nonnegative(),
      completionRate: z.number().min(0).max(1).nullable(),
      medianInteractionCount: z.number().nonnegative().nullable(),
      qualityStrength: z.enum(['insufficient', 'directional', 'substantial']),
      qualityScore: z.number().min(0).max(100),
      frictionSignalCount: z.number().int().nonnegative(),
      mutationTitle: z.string().min(1),
      model: z.string().min(1),
      execution: RepositoryMutationExecutionSchema.pick({
        executionId: true,
        manifestId: true,
        status: true,
        createdAt: true,
        completedAt: true,
      }),
    }),
  ),
  nextCursor: z.string().min(1).max(512).nullable().default(null),
});

export const ObservationArchiveDetailResponseSchema = ObservationArchiveSchema;

export const RepositoryExecutionCallbackSchema =
  RepositoryMutationExecutionSchema.pick({
    status: true,
    headSha: true,
    workflowRunId: true,
    workflowUrl: true,
    pullRequestNumber: true,
    pullRequestUrl: true,
    previewUrl: true,
    patch: true,
    changedFiles: true,
    checks: true,
    codex: true,
    error: true,
    completedAt: true,
  })
    .partial()
    .extend({ status: RepositoryExecutionStatusSchema });

export const RepositoryRollbackCallbackSchema = RepositoryRollbackSchema.pick({
  status: true,
  headSha: true,
  workflowRunId: true,
  workflowUrl: true,
  pullRequestNumber: true,
  pullRequestUrl: true,
  previewUrl: true,
  patch: true,
  changedFiles: true,
  checks: true,
  error: true,
  completedAt: true,
})
  .partial()
  .extend({ status: RepositoryRollbackStatusSchema });

export const StorageHealthSchema = z.object({
  telemetryEvents: z.number().int().nonnegative(),
  participantWorkspaces: z.number().int().nonnegative(),
  evidencePacks: z.number().int().nonnegative(),
  repositoryExecutions: z.number().int().nonnegative(),
  labExperiments: z.number().int().nonnegative(),
  eventQuotaPerStudy: z.number().int().positive(),
  eventQuotaPerTarget: z.number().int().positive().default(1_000_000),
  rawTelemetryRetentionDays: z.number().int().positive(),
  automatedTelemetryRetentionDays: z.number().int().positive(),
  lastRetentionRunAt: z.string().datetime().nullable(),
  policyVersion: z.string().min(1),
});

export const RetentionDeleteRequestSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('participant'),
      studyId: StudyIdentifierSchema,
      participantId: StudyIdentifierSchema,
      confirmation: z.literal('DELETE'),
    })
    .strict(),
  z
    .object({
      scope: z.literal('study'),
      studyId: StudyIdentifierSchema,
      confirmation: z.literal('DELETE'),
    })
    .strict(),
  z
    .object({
      scope: z.literal('execution'),
      executionId: StudyIdentifierSchema,
      confirmation: z.literal('DELETE'),
    })
    .strict(),
]);

export const OperationalAuditEventSchema = z.object({
  auditEventId: StudyIdentifierSchema,
  requestId: z.string().min(1).max(128),
  occurredAt: z.string().datetime(),
  actor: z.string().min(1).max(128),
  target: z.string().min(1).max(256),
  action: z.string().min(1).max(128),
  outcome: z.enum(['succeeded', 'rejected', 'failed']),
  beforeState: z.string().max(128).nullable(),
  afterState: z.string().max(128).nullable(),
  durationMs: z.number().int().nonnegative(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const DiagnosticsResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  auditEvents: z.array(OperationalAuditEventSchema).max(100),
  storage: StorageHealthSchema,
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('darwin-api'),
  version: z.string().min(1),
  build: z.object({
    release: z.string().min(1).max(64),
    commit: z.string().regex(/^(?:[a-f0-9]{7,40}|development)$/),
    identifier: z.string().min(1).max(128),
  }),
  analysis: z.object({
    mode: z.literal('live'),
    model: z.string().min(1),
    liveModelAvailable: z.boolean(),
  }),
  storage: StorageHealthSchema.nullable().default(null),
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
export type StudyEvidenceClass = z.infer<typeof StudyEvidenceClassSchema>;
export type StudySessionIssueRequest = z.infer<
  typeof StudySessionIssueRequestSchema
>;
export type StudySessionClaims = z.infer<typeof StudySessionClaimsSchema>;
export type StudySessionIssueResponse = z.infer<
  typeof StudySessionIssueResponseSchema
>;
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
export type RepositoryContext = z.infer<typeof RepositoryContextSchema>;
export type TargetConnectionRequest = z.infer<
  typeof TargetConnectionRequestSchema
>;
export type TargetApplicationConnection = z.infer<
  typeof TargetApplicationConnectionSchema
>;
export type CodexImplementationManifest = z.infer<
  typeof CodexImplementationManifestSchema
>;
export type CodexManifestRequest = z.infer<typeof CodexManifestRequestSchema>;
export type EvolutionCycle = z.infer<typeof EvolutionCycleSchema>;
export type GenomeHistoryResponse = z.infer<typeof GenomeHistoryResponseSchema>;
export type RepositoryExecutionSummary = z.infer<
  typeof RepositoryExecutionSummarySchema
>;
export type ObservationArchive = z.infer<typeof ObservationArchiveSchema>;
export type ObservationArchiveSummary = z.infer<
  typeof ObservationArchivesResponseSchema
>['archives'][number];
export type ObservationArchivesResponse = z.infer<
  typeof ObservationArchivesResponseSchema
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
export type DemoResetResponse = z.infer<typeof DemoResetResponseSchema>;
export type DemoResetRequest = z.infer<typeof DemoResetRequestSchema>;
export type RepositoryExecutionStatus = z.infer<
  typeof RepositoryExecutionStatusSchema
>;
export type RepositoryExecutionCheck = z.infer<
  typeof RepositoryExecutionCheckSchema
>;
export type RepositoryMutationExecution = z.infer<
  typeof RepositoryMutationExecutionSchema
>;
export type RepositoryExecutionCallback = z.infer<
  typeof RepositoryExecutionCallbackSchema
>;
export type RepositoryRollbackStatus = z.infer<
  typeof RepositoryRollbackStatusSchema
>;
export type RepositoryRollback = z.infer<typeof RepositoryRollbackSchema>;
export type RepositoryRollbackCallback = z.infer<
  typeof RepositoryRollbackCallbackSchema
>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type StorageHealth = z.infer<typeof StorageHealthSchema>;
export type RetentionDeleteRequest = z.infer<
  typeof RetentionDeleteRequestSchema
>;
export type OperationalAuditEvent = z.infer<typeof OperationalAuditEventSchema>;
