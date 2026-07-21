import { z } from 'zod';

import { DarwinProvenanceSchema } from './provenance';

const LabIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/);

const LabRouteSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(
    /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[A-Fa-f0-9]{2})*(?:\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[A-Fa-f0-9]{2})+)*\/?$/,
    'Route must be a safe application pathname.',
  );

export const LabPersonaSchema = z.enum([
  'novice',
  'experienced_pm',
  'executive',
  'keyboard_first',
  'mobile',
  'cautious',
  'impatient',
  'search_first',
]);

export const LabExperimentStatusSchema = z.enum([
  'draft',
  'awaiting_runner',
  'running',
  'completed',
  'analysing',
  'analysed',
  'cancelled',
  'archived',
  'failed',
]);

export const LabAgentRunStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'abandoned',
  'blocked',
]);

export const LabAgentActionTypeSchema = z.enum([
  'navigate',
  'click',
  'hover',
  'type',
  'clear',
  'key',
  'select',
  'scroll',
  'back',
  'forward',
  'submit',
  'abandon',
]);

export const LabFrictionLabelSchema = z.enum([
  'dead_click',
  'rage_click',
  'navigation_loop',
  'pogo_navigation',
  'excess_path_length',
  'search_failure',
  'false_affordance',
  'information_architecture_confusion',
  'accessibility_block',
  'abandonment',
]);

export const LabSuccessCriterionSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('route_reached'), route: LabRouteSchema })
    .strict(),
  z
    .object({
      type: z.literal('semantic_marker'),
      markerId: z
        .string()
        .min(1)
        .max(96)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('workflow_outcome'),
      workflowId: LabIdentifierSchema,
      outcome: z.literal('success'),
    })
    .strict(),
]);

export const LabTaskInputSchema = z
  .object({
    taskId: LabIdentifierSchema,
    name: z.string().trim().min(1).max(120),
    instruction: z.string().trim().min(1).max(300),
    startRoute: LabRouteSchema,
    successCriterion: LabSuccessCriterionSchema,
    successDescription: z.string().trim().min(1).max(300),
  })
  .strict();

export const ProjectFlowLabTaskIdSchema = z.enum([
  'find-assigned-task',
  'create-project',
  'create-assigned-task',
]);

export const PROJECTFLOW_LAB_TASKS = [
  {
    taskId: 'find-assigned-task',
    name: 'Find assigned task',
    instruction:
      'Find and open the task named Confirm launch checklist assigned to you.',
    startRoute: '/study/dashboard',
    successCriterion: {
      type: 'workflow_outcome',
      workflowId: 'find-assigned-task',
      outcome: 'success',
    },
    successDescription:
      'ProjectFlow reports successful completion of the find-assigned-task workflow.',
  },
  {
    taskId: 'create-project',
    name: 'Create project',
    instruction: 'Create a project named Polaris Launch.',
    startRoute: '/study/dashboard',
    successCriterion: {
      type: 'workflow_outcome',
      workflowId: 'create-project',
      outcome: 'success',
    },
    successDescription:
      'ProjectFlow reports successful completion of the create-project workflow.',
  },
  {
    taskId: 'create-assigned-task',
    name: 'Create assigned task',
    instruction:
      'In Project Apollo, create a task named Draft rollback plan assigned to Alex Morgan.',
    startRoute: '/study/dashboard',
    successCriterion: {
      type: 'workflow_outcome',
      workflowId: 'create-assigned-task',
      outcome: 'success',
    },
    successDescription:
      'ProjectFlow reports successful completion of the create-assigned-task workflow.',
  },
] as const satisfies ReadonlyArray<z.input<typeof LabTaskInputSchema>>;

export const isSupportedProjectFlowLabTask = (input: LabTaskInput) =>
  PROJECTFLOW_LAB_TASKS.some(
    (task) =>
      task.taskId === input.taskId &&
      task.name === input.name &&
      task.instruction === input.instruction &&
      task.startRoute === input.startRoute &&
      task.successDescription === input.successDescription &&
      JSON.stringify(task.successCriterion) ===
        JSON.stringify(input.successCriterion),
  );

export const LabTaskSchema = LabTaskInputSchema.extend({
  taskDefinitionId: LabIdentifierSchema,
  definitionVersion: z.literal(1),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const LabPersonaAllocationSchema = z
  .object({
    persona: LabPersonaSchema,
    count: z.number().int().positive().max(20),
  })
  .strict();

export const LabExperimentCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).default('Apollo discovery study'),
    targetUrl: z.string().url().max(512),
    targetAppVersion: z.string().min(1).max(32).default('baseline'),
    task: LabTaskInputSchema.default(PROJECTFLOW_LAB_TASKS[0]),
    populationSize: z.number().int().min(8).max(20).default(8),
    personaAllocation: z.array(LabPersonaAllocationSchema).max(8).default([]),
    maxActions: z.number().int().min(4).max(30).default(12),
    maxDurationMs: z.number().int().min(30_000).max(600_000).default(180_000),
    seed: z.number().int().min(1).max(2_147_483_647).default(1859),
  })
  .strict();

export const LabActionTargetSchema = z
  .object({
    semanticId: z.string().min(1).max(96).optional(),
    role: z.string().min(1).max(48).optional(),
    name: z.string().min(1).max(160).optional(),
  })
  .strict()
  .refine((target) => Boolean(target.semanticId || target.role), {
    message: 'A semantic ID or accessibility role is required.',
  });

const LabDecisionHistoryItemSchema = z
  .object({
    ordinal: z.number().int().positive(),
    action: LabAgentActionTypeSchema,
    targetId: z.string().max(96).nullable(),
    route: z.string().min(1).max(512),
    outcome: z.enum(['changed', 'unchanged', 'error']),
  })
  .strict();

export const LabAgentDecisionRequestSchema = z
  .object({
    experimentId: LabIdentifierSchema,
    runId: LabIdentifierSchema,
    persona: LabPersonaSchema,
    taskInstruction: z.string().min(1).max(300),
    currentUrl: z.string().url().max(512),
    pageTitle: z.string().max(160),
    accessibilitySnapshot: z.string().min(1).max(40_000),
    history: z.array(LabDecisionHistoryItemSchema).max(30),
    remainingActions: z.number().int().min(1).max(30),
    elapsedMs: z.number().int().nonnegative().max(600_000),
    viewport: z.enum(['desktop', 'mobile']),
  })
  .strict();

export const LabAgentDecisionSchema = z
  .object({
    action: LabAgentActionTypeSchema,
    target: LabActionTargetSchema.nullable(),
    value: z.string().max(256).nullable(),
    key: z.string().max(32).nullable(),
    destination: z.string().max(512).nullable(),
    expectation: z.string().min(1).max(240),
  })
  .strict();

export const LabAgentDecisionResponseSchema = z
  .object({
    model: z.string().min(1),
    decision: LabAgentDecisionSchema,
  })
  .strict();

export const LabAgentActionRecordSchema = z
  .object({
    actionId: LabIdentifierSchema,
    ordinal: z.number().int().positive(),
    occurredAt: z.string().datetime(),
    action: LabAgentActionTypeSchema,
    targetId: z.string().min(1).max(96).nullable(),
    targetRole: z.string().min(1).max(48).nullable(),
    inputLength: z.number().int().nonnegative().max(256).nullable(),
    key: z.string().min(1).max(32).nullable(),
    expectation: z.string().min(1).max(240),
    fromUrl: z.string().url().max(512),
    toUrl: z.string().url().max(512),
    durationMs: z.number().int().nonnegative().max(120_000),
    outcome: z.enum(['changed', 'unchanged', 'error']),
    accessibilityNodeCount: z.number().int().nonnegative().max(10_000),
    telemetryEventIds: z.array(z.string().uuid()).max(100),
    error: z.string().min(1).max(500).nullable(),
    provenance: DarwinProvenanceSchema,
  })
  .strict();

export const LabAgentRunStartRequestSchema = z
  .object({
    runId: LabIdentifierSchema,
    participantId: LabIdentifierSchema,
    sessionId: LabIdentifierSchema,
    persona: LabPersonaSchema,
    viewport: z
      .object({
        class: z.enum(['desktop', 'mobile']),
        width: z.number().int().min(320).max(3840),
        height: z.number().int().min(480).max(2160),
      })
      .strict(),
    agentModel: z.string().min(1).max(80),
    startedAt: z.string().datetime(),
    populationOrdinal: z.number().int().min(1).max(20),
    studyId: LabIdentifierSchema,
    taskDefinitionId: LabIdentifierSchema,
    taskDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    appVersion: z.string().min(1).max(32),
  })
  .strict();

export const LabAgentActionAppendRequestSchema = z
  .object({ action: LabAgentActionRecordSchema })
  .strict();

export const LabAgentRunFinishRequestSchema = z
  .object({
    status: z.enum(['succeeded', 'failed', 'abandoned', 'blocked']),
    finishedAt: z.string().datetime(),
    durationMs: z.number().int().nonnegative().max(600_000),
    taskOutcome: z.enum(['success', 'failed', 'abandoned']),
    frictionLabels: z.array(LabFrictionLabelSchema).max(10),
    telemetryEventIds: z.array(z.string().uuid()).max(1_000),
    error: z.string().min(1).max(1_000).nullable(),
  })
  .strict();

export const LabAgentRunSchema = z
  .object({
    runId: LabIdentifierSchema,
    experimentId: LabIdentifierSchema,
    participantId: LabIdentifierSchema,
    sessionId: LabIdentifierSchema,
    persona: LabPersonaSchema,
    viewport: z
      .object({
        class: z.enum(['desktop', 'mobile']),
        width: z.number().int(),
        height: z.number().int(),
      })
      .strict(),
    agentModel: z.string().min(1),
    status: LabAgentRunStatusSchema,
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    taskOutcome: z.enum(['success', 'failed', 'abandoned', 'open']),
    frictionLabels: z.array(LabFrictionLabelSchema),
    telemetryEventIds: z.array(z.string().uuid()),
    actions: z.array(LabAgentActionRecordSchema),
    error: z.string().nullable(),
    populationOrdinal: z.number().int().min(1).max(20),
    studyId: LabIdentifierSchema,
    taskDefinitionId: LabIdentifierSchema,
    taskDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    appVersion: z.string().min(1).max(32),
    provenance: DarwinProvenanceSchema,
  })
  .strict();

export const LabEvidenceSignalSchema = z
  .object({
    evidenceId: z.string().regex(/^L-EV-\d{3}$/),
    detector: LabFrictionLabelSchema,
    severity: z.enum(['low', 'medium', 'high']),
    summary: z.string().min(1),
    supportingRunIds: z.array(LabIdentifierSchema).min(1),
    supportingActionIds: z.array(LabIdentifierSchema),
    supportingTelemetryEventIds: z.array(z.string().uuid()),
    support: z
      .object({
        runs: z.number().int().positive(),
        actions: z.number().int().nonnegative(),
        telemetryEvents: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const LabEvidencePackSchema = z
  .object({
    evidencePackId: LabIdentifierSchema,
    experimentId: LabIdentifierSchema,
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.literal('1.0.0'),
    evidenceClass: z.literal('automated'),
    provenance: DarwinProvenanceSchema,
    taskDefinitionId: LabIdentifierSchema,
    taskDefinitionHash: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.string().datetime(),
    population: z
      .object({
        planned: z.number().int().min(8).max(20),
        completed: z.number().int().nonnegative(),
        successful: z.number().int().nonnegative(),
        abandoned: z.number().int().nonnegative(),
      })
      .strict(),
    metrics: z
      .object({
        completionRate: z.number().min(0).max(1),
        medianActions: z.number().nonnegative().nullable(),
        medianDurationMs: z.number().nonnegative().nullable(),
        repeatedRouteRate: z.number().min(0).max(1),
        searchFailureRate: z.number().min(0).max(1),
      })
      .strict(),
    signals: z.array(LabEvidenceSignalSchema),
    runIds: z.array(LabIdentifierSchema),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export const LabMutationCandidateSchema = z
  .object({
    provenance: DarwinProvenanceSchema,
    mutationId: LabIdentifierSchema,
    title: z.string().min(1).max(120),
    problem: z.string().min(1).max(600),
    evidenceIds: z.array(z.string().regex(/^L-EV-\d{3}$/)).min(1),
    hypothesis: z.string().min(1).max(600),
    implementationBrief: z.string().min(1).max(2_000),
    tradeoffs: z.array(z.string().min(1).max(300)).min(1).max(5),
    validationPlan: z.string().min(1).max(1_000),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const LabAnalysisSchema = z
  .object({
    provenance: DarwinProvenanceSchema,
    analysisId: LabIdentifierSchema,
    experimentId: LabIdentifierSchema,
    evidencePackId: LabIdentifierSchema,
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    model: z.string().min(1),
    promptVersion: z.literal('1.0.0'),
    createdAt: z.string().datetime(),
    summary: z.string().min(1).max(1_000),
    selectedMutationId: LabIdentifierSchema,
    mutations: z.array(LabMutationCandidateSchema).min(1).max(3),
  })
  .strict();

export const LabSelectionSchema = z
  .object({
    provenance: DarwinProvenanceSchema,
    selectionId: LabIdentifierSchema,
    experimentId: LabIdentifierSchema,
    mutationId: LabIdentifierSchema,
    selectedAt: z.string().datetime(),
    selectedBy: z.enum(['operator', 'local-development']),
    status: z.literal('approved_for_controlled_implementation'),
    manifestId: LabIdentifierSchema.nullable(),
    executionId: LabIdentifierSchema.nullable(),
  })
  .strict();

export const BehaviouralEvalStatusSchema = z.enum([
  'proposed',
  'active',
  'passed',
  'failed',
]);

export const BehaviouralEvalSchema = z
  .object({
    evalId: LabIdentifierSchema,
    goal: z.string().min(1).max(300),
    passCriteria: z.array(z.string().min(1).max(300)).min(1).max(8),
    forbiddenOutcomes: z.array(z.string().min(1).max(240)).max(8),
    maxActions: z.number().int().min(1).max(30),
    sourceExperimentId: LabIdentifierSchema,
    evidencePackId: LabIdentifierSchema,
    evidenceIds: z.array(z.string().regex(/^L-EV-\d{3}$/)).min(1),
    evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
    seed: z.number().int().positive(),
    targetUrl: z.string().url().max(512),
    baseline: z
      .object({
        completionRate: z.number().min(0).max(1),
        medianActions: z.number().nonnegative().nullable(),
        population: z.number().int().positive(),
      })
      .strict(),
    lastRun: z
      .object({
        completionRate: z.number().min(0).max(1),
        medianActions: z.number().nonnegative().nullable(),
        population: z.number().int().positive(),
        completedAt: z.string().datetime(),
      })
      .strict()
      .nullable()
      .default(null),
    status: BehaviouralEvalStatusSchema,
    codexBrief: z.string().min(1).max(2_000),
    createdAt: z.string().datetime(),
  })
  .strict();

export const LabExperimentSchema = z
  .object({
    experimentId: LabIdentifierSchema,
    studyId: LabIdentifierSchema,
    name: z.string().min(1).max(100),
    targetUrl: z.string().url().max(512),
    targetAppVersion: z.string().min(1).max(32),
    task: LabTaskSchema,
    populationSize: z.number().int().min(8).max(20),
    personaAllocation: z.array(LabPersonaAllocationSchema).max(8),
    maxActions: z.number().int().min(4).max(30),
    maxDurationMs: z.number().int().min(30_000).max(600_000),
    seed: z.number().int().positive(),
    status: LabExperimentStatusSchema,
    runnerId: LabIdentifierSchema.nullable(),
    createdAt: z.string().datetime(),
    startedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    runs: z.array(LabAgentRunSchema),
    evidence: LabEvidencePackSchema.nullable(),
    analysis: LabAnalysisSchema.nullable(),
    selection: LabSelectionSchema.nullable(),
    behaviouralEval: BehaviouralEvalSchema.nullable().default(null),
    error: z.string().nullable(),
    evidenceError: z.string().nullable(),
    archivedAt: z.string().datetime().nullable(),
    version: z.number().int().nonnegative(),
    provenance: DarwinProvenanceSchema,
  })
  .strict();

export const LabExperimentsResponseSchema = z
  .object({ experiments: z.array(LabExperimentSchema) })
  .strict();

export const LabRunnerClaimRequestSchema = z
  .object({ runnerId: LabIdentifierSchema })
  .strict();

export const LabMutationSelectionRequestSchema = z
  .object({ mutationId: LabIdentifierSchema })
  .strict();

export const LabExperimentUpdateRequestSchema =
  LabExperimentCreateRequestSchema.partial().strict();

export type LabPersona = z.infer<typeof LabPersonaSchema>;
export type LabTaskInput = z.infer<typeof LabTaskInputSchema>;
export type LabTask = z.infer<typeof LabTaskSchema>;
export type LabExperimentStatus = z.infer<typeof LabExperimentStatusSchema>;
export type LabAgentActionType = z.infer<typeof LabAgentActionTypeSchema>;
export type LabFrictionLabel = z.infer<typeof LabFrictionLabelSchema>;
export type LabExperimentCreateRequest = z.infer<
  typeof LabExperimentCreateRequestSchema
>;
export type LabAgentDecisionRequest = z.infer<
  typeof LabAgentDecisionRequestSchema
>;
export type LabAgentDecision = z.infer<typeof LabAgentDecisionSchema>;
export type LabAgentDecisionResponse = z.infer<
  typeof LabAgentDecisionResponseSchema
>;
export type LabAgentActionRecord = z.infer<typeof LabAgentActionRecordSchema>;
export type LabAgentRun = z.infer<typeof LabAgentRunSchema>;
export type LabEvidencePack = z.infer<typeof LabEvidencePackSchema>;
export type LabEvidenceSignal = z.infer<typeof LabEvidenceSignalSchema>;
export type LabMutationCandidate = z.infer<typeof LabMutationCandidateSchema>;
export type LabAnalysis = z.infer<typeof LabAnalysisSchema>;
export type LabSelection = z.infer<typeof LabSelectionSchema>;
export type BehaviouralEvalStatus = z.infer<typeof BehaviouralEvalStatusSchema>;
export type BehaviouralEval = z.infer<typeof BehaviouralEvalSchema>;
export type LabExperiment = z.infer<typeof LabExperimentSchema>;
