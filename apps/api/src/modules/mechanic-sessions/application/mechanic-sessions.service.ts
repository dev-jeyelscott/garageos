import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { GarageOsApiException } from '../../../shared/api/api-exception';
import { evaluateBranchAccess } from '../../../shared/authorization/branch-access';
import {
  assertTenantLifecycleAccess,
  TENANT_ACCESS_ACTIONS,
} from '../../../shared/authorization/tenant-lifecycle-access.policy';
import { AUDIT_ACTOR_TYPES, AuditService } from '../../../shared/audit/audit.service';
import {
  API_TRANSACTION_RUNNER,
  type DatabaseTransactionRunner,
} from '../../../shared/database/database-transaction';
import {
  resolveTenantContextFromAuthenticatedSession,
  type ResolvedTenantContext,
  type TenantContextAuthenticatedSession,
} from '../../../shared/tenant-context/tenant-context';
import type {
  CreateMechanicSessionRequest,
  FinishMechanicSessionRequest,
  ListMechanicSessionsQuery,
} from '../api/mechanic-session.schemas';
import {
  MechanicSessionStore,
  type MechanicSessionJobOrderRecord,
  type MechanicWorkSessionPauseRecord,
  type MechanicWorkSessionRecord,
  type MechanicWorkSessionStatus,
} from './mechanic-session.store';

const IDEMPOTENCY_RETENTION_HOURS = 24;
const MANAGER_OVERRIDE_PERMISSION = 'job_orders.update';

export interface MechanicWorkSessionPauseResponse {
  readonly id: string;
  readonly paused_at: string;
  readonly resumed_at: string | null;
  readonly resumed_by_user_id: string | null;
}

export interface MechanicWorkSessionResponse {
  readonly id: string;
  readonly branch_id: string;
  readonly job_order_id: string;
  readonly mechanic_user_id: string;
  readonly status: MechanicWorkSessionStatus;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly total_active_seconds: number;
  readonly notes: string | null;
  readonly pauses: readonly MechanicWorkSessionPauseResponse[];
}

export interface MechanicWorkSessionListResponse {
  readonly work_sessions: readonly MechanicWorkSessionResponse[];
}

export interface MechanicWorkSessionMutationResponse {
  readonly work_session: MechanicWorkSessionResponse;
}

type MechanicWorkSessionPauseTiming = Pick<
  MechanicWorkSessionPauseRecord,
  'pausedAt' | 'resumedAt'
>;

@Injectable()
export class MechanicSessionsService {
  constructor(
    @Inject(MechanicSessionStore)
    private readonly mechanicSessionStore: MechanicSessionStore,
    @Inject(API_TRANSACTION_RUNNER)
    private readonly transactionRunner: DatabaseTransactionRunner,
    @Inject(AuditService)
    private readonly auditService: AuditService,
  ) {}

  getIdempotencyExpiresAt(now: Date): Date {
    return new Date(now.getTime() + IDEMPOTENCY_RETENTION_HOURS * 60 * 60 * 1000);
  }

  async listMechanicSessions(
    query: ListMechanicSessionsQuery,
    session: TenantContextAuthenticatedSession,
  ): Promise<MechanicWorkSessionListResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.mechanicSessionStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_READ,
    });
    assertMechanicSessionPermission(context, isShopOwner, 'mechanic_sessions.read');
    assertMechanicSessionBranchAccess(context, query.branch_id);

    const workSessions = await this.mechanicSessionStore.listMechanicWorkSessions({
      tenantId: context.tenantId,
      branchId: query.branch_id,
      jobOrderId: query.job_order_id,
      mechanicUserId: query.mechanic_user_id,
      status: query.status,
      limit: query.limit,
    });

    return {
      work_sessions: workSessions.map(toMechanicWorkSessionResponse),
    };
  }

  async startWorkSession(
    request: CreateMechanicSessionRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<MechanicWorkSessionMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.mechanicSessionStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertMechanicSessionPermission(context, isShopOwner, 'mechanic_sessions.create');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const jobOrder = await this.mechanicSessionStore.findJobOrderForWorkSessionStart(
        context.tenantId,
        request.job_order_id.trim(),
        transaction,
      );

      if (jobOrder === null) {
        throw GarageOsApiException.resourceNotFound('Job order was not found.');
      }

      assertMechanicSessionBranchAccess(context, jobOrder.branchId);
      assertCanStartMechanicWorkSessionForJobOrder(jobOrder);

      const isAssigned = await this.mechanicSessionStore.isMechanicAssignedToJobOrder(
        {
          tenantId: context.tenantId,
          jobOrderId: jobOrder.id,
          mechanicUserId: context.actorUserId,
        },
        transaction,
      );

      if (!isAssigned && !hasManagerOverride(context, isShopOwner)) {
        throw GarageOsApiException.validationFailed([
          {
            field: 'job_order_id',
            code: 'mechanic_not_assigned_to_job_order',
            message: 'A mechanic must be assigned to the job order before starting a work session.',
          },
        ]);
      }

      const startedAt = new Date();

      await this.mechanicSessionStore.lockMechanicWorkSessionStart(
        {
          tenantId: context.tenantId,
          mechanicUserId: context.actorUserId,
        },
        transaction,
      );

      const unfinishedSession =
        await this.mechanicSessionStore.findUnfinishedWorkSessionForMechanic(
          {
            tenantId: context.tenantId,
            mechanicUserId: context.actorUserId,
          },
          transaction,
        );

      if (unfinishedSession !== null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Mechanic already has an unfinished work session.',
          [
            {
              field: 'mechanic_user_id',
              code: 'mechanic_has_unfinished_session',
              message: 'Finish the current work session before starting another one.',
            },
          ],
        );
      }

      const created = await this.mechanicSessionStore.createMechanicWorkSession(
        {
          id: randomUUID(),
          tenantId: context.tenantId,
          branchId: jobOrder.branchId,
          jobOrderId: jobOrder.id,
          mechanicUserId: context.actorUserId,
          notes: normalizeNullableText(request.notes),
          startedAt,
        },
        transaction,
      );

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'mechanic_sessions.started',
        entityType: 'mechanic_work_session',
        entityId: created.id,
        branchId: created.branchId,
        afterJson: toMechanicWorkSessionResponse(created),
        reason: 'mechanic_session_started',
        client: transaction,
      });

      return {
        work_session: toMechanicWorkSessionResponse(created),
      };
    });
  }

  async pauseWorkSession(
    workSessionId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<MechanicWorkSessionMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.mechanicSessionStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertMechanicSessionPermission(context, isShopOwner, 'mechanic_sessions.pause');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.mechanicSessionStore.findMechanicWorkSessionByIdForUpdate(
        context.tenantId,
        workSessionId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Mechanic work session was not found.');
      }

      assertMechanicSessionBranchAccess(context, existing.branchId);
      assertCanMutateMechanicWorkSession(context, isShopOwner, existing);
      assertCanPauseMechanicWorkSession(existing);

      const updated = await this.mechanicSessionStore.pauseMechanicWorkSession(
        {
          tenantId: context.tenantId,
          workSessionId: existing.id,
          pausedAt: new Date(),
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only active mechanic work sessions can be paused.',
        );
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'mechanic_sessions.paused',
        entityType: 'mechanic_work_session',
        entityId: updated.id,
        branchId: updated.branchId,
        beforeJson: toMechanicWorkSessionResponse(existing),
        afterJson: toMechanicWorkSessionResponse(updated),
        reason: 'mechanic_session_paused',
        client: transaction,
      });

      return {
        work_session: toMechanicWorkSessionResponse(updated),
      };
    });
  }

  async resumeWorkSession(
    workSessionId: string,
    session: TenantContextAuthenticatedSession,
  ): Promise<MechanicWorkSessionMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.mechanicSessionStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertMechanicSessionPermission(context, isShopOwner, 'mechanic_sessions.resume');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.mechanicSessionStore.findMechanicWorkSessionByIdForUpdate(
        context.tenantId,
        workSessionId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Mechanic work session was not found.');
      }

      assertMechanicSessionBranchAccess(context, existing.branchId);
      assertCanMutateMechanicWorkSession(context, isShopOwner, existing);
      assertCanResumeMechanicWorkSession(existing);

      const updated = await this.mechanicSessionStore.resumeMechanicWorkSession(
        {
          tenantId: context.tenantId,
          workSessionId: existing.id,
          resumedByUserId: context.actorUserId,
          resumedAt: new Date(),
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only paused mechanic work sessions can be resumed.',
        );
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'mechanic_sessions.resumed',
        entityType: 'mechanic_work_session',
        entityId: updated.id,
        branchId: updated.branchId,
        beforeJson: toMechanicWorkSessionResponse(existing),
        afterJson: toMechanicWorkSessionResponse(updated),
        reason: 'mechanic_session_resumed',
        client: transaction,
      });

      return {
        work_session: toMechanicWorkSessionResponse(updated),
      };
    });
  }

  async finishWorkSession(
    workSessionId: string,
    request: FinishMechanicSessionRequest,
    session: TenantContextAuthenticatedSession,
  ): Promise<MechanicWorkSessionMutationResponse> {
    const context = resolveTenantContextFromAuthenticatedSession(session);
    const isShopOwner = await this.mechanicSessionStore.isActiveShopOwner({
      tenantId: context.tenantId,
      userId: context.actorUserId,
    });

    assertTenantLifecycleAccess({
      context,
      isShopOwner,
      action: TENANT_ACCESS_ACTIONS.OPERATIONAL_WRITE,
    });
    assertMechanicSessionPermission(context, isShopOwner, 'mechanic_sessions.finish');

    return this.transactionRunner.runInTransaction(async (transaction) => {
      const existing = await this.mechanicSessionStore.findMechanicWorkSessionByIdForUpdate(
        context.tenantId,
        workSessionId.trim(),
        transaction,
      );

      if (existing === null) {
        throw GarageOsApiException.resourceNotFound('Mechanic work session was not found.');
      }

      assertMechanicSessionBranchAccess(context, existing.branchId);
      assertCanMutateMechanicWorkSession(context, isShopOwner, existing);
      assertCanFinishMechanicWorkSession(existing);

      const finishedAt = new Date();
      const totalActiveSeconds = calculateMechanicSessionActiveSeconds({
        startedAt: existing.startedAt,
        finishedAt,
        pauses: existing.pauses,
      });

      const updated = await this.mechanicSessionStore.finishMechanicWorkSession(
        {
          tenantId: context.tenantId,
          workSessionId: existing.id,
          finishedAt,
          totalActiveSeconds,
          notes: mergeMechanicSessionNotes(existing.notes, normalizeNullableText(request.notes)),
          closeOpenPause: existing.status === 'paused',
          resumedByUserId: context.actorUserId,
        },
        transaction,
      );

      if (updated === null) {
        throw GarageOsApiException.workflowTransitionBlocked(
          'Only active or paused mechanic work sessions can be finished.',
        );
      }

      await this.auditService.record({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        actorType: AUDIT_ACTOR_TYPES.TENANT_USER,
        action: 'mechanic_sessions.finished',
        entityType: 'mechanic_work_session',
        entityId: updated.id,
        branchId: updated.branchId,
        beforeJson: toMechanicWorkSessionResponse(existing),
        afterJson: toMechanicWorkSessionResponse(updated),
        reason: 'mechanic_session_finished',
        client: transaction,
      });

      return {
        work_session: toMechanicWorkSessionResponse(updated),
      };
    });
  }
}

export function assertCanStartMechanicWorkSessionForJobOrder(
  jobOrder: Pick<MechanicSessionJobOrderRecord, 'status'>,
): void {
  if (jobOrder.status === 'in_progress' || jobOrder.status === 'waiting_for_parts') {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Mechanic work sessions can only start on active job orders.',
    [
      {
        field: 'job_order_id',
        code: 'job_order_not_workable',
        message:
          'A mechanic work session can only start when the job order is in progress or waiting for parts.',
      },
    ],
  );
}

export function assertCanPauseMechanicWorkSession(
  workSession: Pick<MechanicWorkSessionRecord, 'status'> & {
    readonly pauses: readonly MechanicWorkSessionPauseTiming[];
  },
): void {
  if (workSession.status !== 'active') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Only active mechanic work sessions can be paused.',
      [
        {
          field: 'status',
          code: 'mechanic_session_not_active',
          message: 'Only active mechanic work sessions can be paused.',
        },
      ],
    );
  }

  const hasOpenPause = workSession.pauses.some((pause) => pause.resumedAt === null);

  if (hasOpenPause) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Mechanic work session already has an open pause.',
      [
        {
          field: 'status',
          code: 'mechanic_session_pause_already_open',
          message: 'Resume the open pause before pausing again.',
        },
      ],
    );
  }
}

export function assertCanResumeMechanicWorkSession(
  workSession: Pick<MechanicWorkSessionRecord, 'status'> & {
    readonly pauses: readonly MechanicWorkSessionPauseTiming[];
  },
): void {
  if (workSession.status !== 'paused') {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Only paused mechanic work sessions can be resumed.',
      [
        {
          field: 'status',
          code: 'mechanic_session_not_paused',
          message: 'Only paused mechanic work sessions can be resumed.',
        },
      ],
    );
  }

  const hasOpenPause = workSession.pauses.some((pause) => pause.resumedAt === null);

  if (!hasOpenPause) {
    throw GarageOsApiException.workflowTransitionBlocked(
      'Paused mechanic work session does not have an open pause.',
      [
        {
          field: 'status',
          code: 'mechanic_session_open_pause_missing',
          message: 'Paused mechanic work session does not have an open pause to resume.',
        },
      ],
    );
  }
}

export function assertCanFinishMechanicWorkSession(
  workSession: Pick<MechanicWorkSessionRecord, 'status'>,
): void {
  if (workSession.status === 'active' || workSession.status === 'paused') {
    return;
  }

  throw GarageOsApiException.workflowTransitionBlocked(
    'Only active or paused mechanic work sessions can be finished.',
    [
      {
        field: 'status',
        code: 'mechanic_session_already_finished',
        message: 'Finished mechanic work sessions cannot be finished again.',
      },
    ],
  );
}

export function calculateMechanicSessionActiveSeconds(input: {
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly pauses: readonly Pick<MechanicWorkSessionPauseRecord, 'pausedAt' | 'resumedAt'>[];
}): number {
  const startedAtMs = input.startedAt.getTime();
  const finishedAtMs = input.finishedAt.getTime();

  if (finishedAtMs <= startedAtMs) {
    return 0;
  }

  const pausedMs = input.pauses.reduce((totalPausedMs, pause) => {
    const pauseStartedAtMs = Math.max(pause.pausedAt.getTime(), startedAtMs);
    const pauseEndedAtMs = Math.min((pause.resumedAt ?? input.finishedAt).getTime(), finishedAtMs);

    if (pauseEndedAtMs <= pauseStartedAtMs) {
      return totalPausedMs;
    }

    return totalPausedMs + pauseEndedAtMs - pauseStartedAtMs;
  }, 0);

  return Math.max(0, Math.floor((finishedAtMs - startedAtMs - pausedMs) / 1000));
}

function assertMechanicSessionPermission(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  permission: string,
): void {
  if (!isShopOwner && !context.effectivePermissions.includes(permission)) {
    throw GarageOsApiException.forbidden(permission);
  }
}

function assertMechanicSessionBranchAccess(context: ResolvedTenantContext, branchId: string): void {
  const decision = evaluateBranchAccess({
    context,
    branchId,
  });

  if (!decision.allowed) {
    throw GarageOsApiException.branchAccessDenied();
  }
}

function assertCanMutateMechanicWorkSession(
  context: ResolvedTenantContext,
  isShopOwner: boolean,
  workSession: Pick<MechanicWorkSessionRecord, 'mechanicUserId'>,
): void {
  if (
    workSession.mechanicUserId === context.actorUserId ||
    hasManagerOverride(context, isShopOwner)
  ) {
    return;
  }

  throw GarageOsApiException.forbidden(
    MANAGER_OVERRIDE_PERMISSION,
    'Only the assigned mechanic or an authorized manager can change this work session.',
  );
}

function hasManagerOverride(context: ResolvedTenantContext, isShopOwner: boolean): boolean {
  return isShopOwner || context.effectivePermissions.includes(MANAGER_OVERRIDE_PERMISSION);
}

function toMechanicWorkSessionResponse(
  workSession: MechanicWorkSessionRecord,
): MechanicWorkSessionResponse {
  return {
    id: workSession.id,
    branch_id: workSession.branchId,
    job_order_id: workSession.jobOrderId,
    mechanic_user_id: workSession.mechanicUserId,
    status: workSession.status,
    started_at: workSession.startedAt.toISOString(),
    finished_at: workSession.finishedAt?.toISOString() ?? null,
    total_active_seconds: workSession.totalActiveSeconds,
    notes: workSession.notes,
    pauses: workSession.pauses.map(toMechanicWorkSessionPauseResponse),
  };
}

function toMechanicWorkSessionPauseResponse(
  pause: MechanicWorkSessionPauseRecord,
): MechanicWorkSessionPauseResponse {
  return {
    id: pause.id,
    paused_at: pause.pausedAt.toISOString(),
    resumed_at: pause.resumedAt?.toISOString() ?? null,
    resumed_by_user_id: pause.resumedByUserId,
  };
}

function mergeMechanicSessionNotes(existing: string | null, next: string | null): string | null {
  if (next === null) {
    return existing;
  }

  if (existing === null || existing.trim().length === 0) {
    return next;
  }

  return `${existing.trim()}\n${next}`;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, ' ');

  return normalizedValue.length > 0 ? normalizedValue : null;
}
