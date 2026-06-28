import type { DatabaseQueryClient } from '../../../shared/database/database-client';

export type JobOrderStatus =
  | 'pending'
  | 'in_progress'
  | 'waiting_for_parts'
  | 'completed'
  | 'released'
  | 'cancelled';

export type JobOrderLineType = 'service' | 'labor' | 'part';

export type JobOrderLineStatus = 'active' | 'completed' | 'cancelled';

export type JobOrderMechanicAssignmentType = 'primary' | 'additional';

export interface JobOrderMechanicAssignmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly userId: string;
  readonly assignmentType: JobOrderMechanicAssignmentType;
  readonly assignedAt: Date;
  readonly removedAt: Date | null;
}

export interface JobOrderStatusEventRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly fromStatus: JobOrderStatus | null;
  readonly toStatus: JobOrderStatus;
  readonly reason: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
}

export type JobOrderAuditActorType = 'tenant_user' | 'platform_admin' | 'system';

export interface JobOrderAuditEventRecord {
  readonly id: string;
  readonly tenantId: string | null;
  readonly actorUserId: string | null;
  readonly actorType: JobOrderAuditActorType;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly branchId: string | null;
  readonly beforeJson: unknown | null;
  readonly afterJson: unknown | null;
  readonly metadataJson: unknown | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

export interface AssignableMechanicRecord {
  readonly userId: string;
  readonly employeeId: string;
  readonly tenantWideBranchAccess: boolean;
  readonly branchAccessAllowed: boolean;
}

export interface JobOrderLineRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly lineType: JobOrderLineType;
  readonly serviceId: string | null;
  readonly productId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly authorizedAmount: string;
  readonly status: JobOrderLineStatus;
  readonly inventoryReservationId: string | null;
  readonly completedAt: Date | null;
  readonly lineOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface JobOrderRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string;
  readonly jobOrderNumber: string;
  readonly status: JobOrderStatus;
  readonly serviceAdvisorUserId: string;
  readonly primaryMechanicUserId: string | null;
  readonly mileageAtIntake: number;
  readonly customerConcern: string;
  readonly internalNotes: string | null;
  readonly completedAt: Date | null;
  readonly releasedAt: Date | null;
  readonly noChargeReason: string | null;
  readonly releaseWithBalanceReason: string | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lockVersion: number;
  readonly lines: readonly JobOrderLineRecord[];
  readonly mechanics: readonly JobOrderMechanicAssignmentRecord[];
}

export interface ServiceSnapshotRecord {
  readonly name: string;
  readonly startingPrice: string;
  readonly priceDisclaimer: string | null;
}

export interface ProductSnapshotRecord {
  readonly id: string;
  readonly name: string;
  readonly sellingPrice: string;
}

export interface JobOrderLineSnapshotInput {
  readonly sourceName: string;
  readonly sourcePrice: string;
  readonly sourceDisclaimer: string | null;
}

export interface JobOrderNumberSequenceInput {
  readonly tenantId: string;
  readonly datePart: string;
}

export interface ListJobOrdersInput {
  readonly tenantId: string;
  readonly branchId: string;
  readonly status: JobOrderStatus | undefined;
  readonly customerId: string | undefined;
  readonly motorcycleId: string | undefined;
  readonly normalizedSearch: string | null;
  readonly limit: number;
}

export interface CreateJobOrderInput {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly motorcycleId: string;
  readonly jobOrderNumber: string;
  readonly serviceAdvisorUserId: string;
  readonly mileageAtIntake: number;
  readonly customerConcern: string;
  readonly internalNotes: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface UpdatePendingJobOrderInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly mileageAtIntake: number;
  readonly customerConcern: string;
  readonly internalNotes: string | null;
  readonly expectedLockVersion: number;
  readonly updatedAt: Date;
}

export interface CreateJobOrderLineInput extends JobOrderLineSnapshotInput {
  readonly id: string;
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly lineType: Exclude<JobOrderLineType, 'part'>;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly authorizedAmount: string;
  readonly lineOrder: number | null;
  readonly createdAt: Date;
}

export interface CreateJobOrderPartLineInput extends JobOrderLineSnapshotInput {
  readonly id: string;
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly productId: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly authorizedAmount: string;
  readonly inventoryReservationId: string;
  readonly lineOrder: number | null;
  readonly createdAt: Date;
}

export interface UpdateJobOrderLineInput extends JobOrderLineSnapshotInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly lineId: string;
  readonly lineType: Exclude<JobOrderLineType, 'part'>;
  readonly serviceId: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly authorizedAmount: string;
  readonly lineOrder: number | null;
  readonly updatedAt: Date;
}

export interface CancelJobOrderLineInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly lineId: string;
  readonly updatedAt: Date;
}

export interface AppendJobOrderInternalNoteInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly note: string;
  readonly updatedAt: Date;
}

export interface CompleteJobOrderLineInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly lineId: string;
  readonly completedAt: Date;
}

export interface ReplaceJobOrderMechanicsInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly primaryMechanicUserId: string;
  readonly additionalMechanicUserIds: readonly string[];
  readonly assignedAt: Date;
}

export interface TransitionJobOrderStatusInput {
  readonly tenantId: string;
  readonly jobOrderId: string;
  readonly fromStatus: JobOrderStatus;
  readonly toStatus: JobOrderStatus;
  readonly reason: string | null;
  readonly expectedLockVersion: number;
  readonly transitionedByUserId: string;
  readonly transitionedAt: Date;
}

export interface TransitionJobOrderStatusResult {
  readonly jobOrder: JobOrderRecord;
  readonly statusEvent: JobOrderStatusEventRecord;
}

export abstract class JobOrderStore {
  abstract getTenantTimezone(
    tenantId: string,
    client?: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract lockJobOrderNumberSequence(
    input: JobOrderNumberSequenceInput,
    client: DatabaseQueryClient,
  ): Promise<void>;

  abstract findLatestJobOrderNumberForDate(
    input: JobOrderNumberSequenceInput,
    client: DatabaseQueryClient,
  ): Promise<string | null>;

  abstract listJobOrders(input: ListJobOrdersInput): Promise<readonly JobOrderRecord[]>;

  abstract findJobOrderById(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null>;

  abstract findJobOrderByIdForUpdate(
    tenantId: string,
    jobOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null>;

  abstract findJobOrderLineByIdForUpdate(
    tenantId: string,
    jobOrderId: string,
    lineId: string,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null>;

  abstract createJobOrder(
    input: CreateJobOrderInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord>;

  abstract updatePendingJobOrder(
    input: UpdatePendingJobOrderInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null>;

  abstract createJobOrderLine(
    input: CreateJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord>;

  abstract createJobOrderPartLine(
    input: CreateJobOrderPartLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord>;

  abstract updateJobOrderLine(
    input: UpdateJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null>;

  abstract cancelJobOrderLine(
    input: CancelJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null>;

  abstract appendJobOrderInternalNote(
    input: AppendJobOrderInternalNoteInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null>;

  abstract completeJobOrderLine(
    input: CompleteJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null>;

  abstract findAssignableMechanics(
    input: {
      readonly tenantId: string;
      readonly branchId: string;
      readonly userIds: readonly string[];
    },
    client?: DatabaseQueryClient,
  ): Promise<readonly AssignableMechanicRecord[]>;

  abstract replaceJobOrderMechanics(
    input: ReplaceJobOrderMechanicsInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord>;

  abstract transitionJobOrderStatus(
    input: TransitionJobOrderStatusInput,
    client: DatabaseQueryClient,
  ): Promise<TransitionJobOrderStatusResult | null>;

  abstract listJobOrderStatusEvents(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly JobOrderStatusEventRecord[]>;

  abstract listJobOrderAuditEvents(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly JobOrderAuditEventRecord[]>;

  abstract isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean>;

  abstract isMechanicAssignedToJobOrder(
    input: {
      readonly tenantId: string;
      readonly jobOrderId: string;
      readonly mechanicUserId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract activeBranchExists(
    tenantId: string,
    branchId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract activeCustomerExists(
    tenantId: string,
    customerId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract activeMotorcycleBelongsToCustomer(
    input: {
      readonly tenantId: string;
      readonly motorcycleId: string;
      readonly customerId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<boolean>;

  abstract findActiveServiceSnapshot(
    tenantId: string,
    serviceId: string,
    client?: DatabaseQueryClient,
  ): Promise<ServiceSnapshotRecord | null>;

  abstract findActiveProductSnapshot(
    tenantId: string,
    productId: string,
    client?: DatabaseQueryClient,
  ): Promise<ProductSnapshotRecord | null>;
}
