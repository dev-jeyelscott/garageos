import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type MechanicWorkSessionStatus = 'active' | 'paused' | 'finished';

export type MechanicSessionJobOrderStatus =
  | 'pending'
  | 'in_progress'
  | 'waiting_for_parts'
  | 'completed'
  | 'released'
  | 'cancelled';

export interface MechanicWorkSessionPauseRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly workSessionId: string;
  readonly pausedAt: Date;
  readonly resumedAt: Date | null;
  readonly resumedByUserId: string | null;
}

export interface MechanicWorkSessionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly jobOrderId: string;
  readonly mechanicUserId: string;
  readonly status: MechanicWorkSessionStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly totalActiveSeconds: number;
  readonly notes: string | null;
  readonly pauses: readonly MechanicWorkSessionPauseRecord[];
}

export interface MechanicSessionJobOrderRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly status: MechanicSessionJobOrderStatus;
}

export interface ListMechanicWorkSessionsInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly jobOrderId: string | undefined;
  readonly mechanicUserId: string | undefined;
  readonly status: MechanicWorkSessionStatus | undefined;
  readonly limit: number;
}

export interface CreateMechanicWorkSessionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly jobOrderId: string;
  readonly mechanicUserId: string;
  readonly notes: string | null;
  readonly startedAt: Date;
}

export interface PauseMechanicWorkSessionInput {
  readonly tenantId: string;
  readonly workSessionId: string;
  readonly pausedAt: Date;
}

export interface ResumeMechanicWorkSessionInput {
  readonly tenantId: string;
  readonly workSessionId: string;
  readonly resumedByUserId: string;
  readonly resumedAt: Date;
}

export interface FinishMechanicWorkSessionInput {
  readonly tenantId: string;
  readonly workSessionId: string;
  readonly finishedAt: Date;
  readonly totalActiveSeconds: number;
  readonly notes: string | null;
  readonly closeOpenPause: boolean;
  readonly resumedByUserId: string;
}

export abstract class MechanicSessionStore {
  abstract listMechanicWorkSessions(
    input: ListMechanicWorkSessionsInput,
  ): Promise<readonly MechanicWorkSessionRecord[]>;

  abstract findMechanicWorkSessionById(
    tenantId: string,
    workSessionId: string,
    client?: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null>;

  abstract findMechanicWorkSessionByIdForUpdate(
    tenantId: string,
    workSessionId: string,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null>;

  abstract findJobOrderForWorkSessionStart(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<MechanicSessionJobOrderRecord | null>;

  abstract isMechanicAssignedToJobOrder(
    input: {
      readonly tenantId: string;
      readonly jobOrderId: string;
      readonly mechanicUserId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract lockMechanicWorkSessionStart(
    input: {
      readonly tenantId: string;
      readonly mechanicUserId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract findUnfinishedWorkSessionForMechanic(
    input: {
      readonly tenantId: string;
      readonly mechanicUserId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null>;

  abstract createMechanicWorkSession(
    input: CreateMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord>;

  abstract pauseMechanicWorkSession(
    input: PauseMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null>;

  abstract resumeMechanicWorkSession(
    input: ResumeMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null>;

  abstract finishMechanicWorkSession(
    input: FinishMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null>;

  abstract isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean>;
}
