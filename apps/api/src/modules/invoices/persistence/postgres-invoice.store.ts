import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseQueryResult,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import { buildReceiptNumber } from '../../../shared/numbering/document-numbering';
import {
  type AllocateReceiptNumberInput,
  type BillingAllocationTotalRecord,
  type CreateDraftInvoiceInput,
  type CreateInvoiceBillingAllocationsInput,
  type CreateInvoiceJobOrderLinksInput,
  type CreateInvoiceLinesInput,
  type CreateInvoicePaymentInput,
  type CreateInvoiceReceiptInput,
  type CreateInvoiceRefundInput,
  type CreateRefundInventoryReversalsInput,
  type CreateVoidInventoryReversalsInput,
  type FindInvoiceWithDetailsInput,
  type FindInvoiceReceiptInput,
  type FindLatestInvoiceNumberForDateInput,
  type InvoiceDraftJobOrderLineRecord,
  type InvoicePaymentWithInvoiceRecord,
  type InvoiceDraftJobOrderRecord,
  type InvoiceReceiptWithBranchRecord,
  type InvoiceSettingsRecord,
  type InsertInvoiceStatusEventInput,
  type InventoryReversalTotalRecord,
  InvoiceStore,
  type ListInvoicesInput,
  type ListInvoiceReceiptsInput,
  type LockInvoicePaymentWithInvoiceInput,
  type LockInvoiceWithDetailsForUpdateInput,
  type ReplaceDraftInvoiceLinesInput,
  type UpdateBillingAllocationStatusesInput,
  type UpdateInvoicePaymentTotalsInput,
  type UpdateInvoicePaymentRefundableAmountInput,
  type UpdateInvoiceRefundTotalsInput,
  type UpdateInvoiceWorkflowStatusInput,
  type InvoiceInventoryConsumptionCostRecord,
} from '../application/invoice.store';
import type {
  InvoiceBillingAllocationRecord,
  InvoiceInventoryReversalRecord,
  InvoiceJobOrderRecord,
  InvoiceLineRecord,
  InvoicePaymentRecord,
  InvoiceReceiptRecord,
  InvoiceRefundRecord,
  InvoiceRecord,
  InvoiceStatusEventRecord,
  InvoiceWithDetailsRecord,
} from '../application/invoice.records';
import {
  type InvoiceBillingAllocationRow,
  type InvoiceInventoryReversalRow,
  type InvoiceJobOrderRow,
  type InvoiceLineRow,
  type InvoicePaymentRow,
  type InvoiceReceiptRow,
  type InvoiceRefundRow,
  type InvoiceRow,
  type InvoiceStatusEventRow,
  mapInvoiceBillingAllocationRow,
  mapInvoiceInventoryReversalRow,
  mapInvoiceJobOrderRow,
  mapInvoiceLineRow,
  mapInvoicePaymentRow,
  mapInvoiceReceiptRow,
  mapInvoiceRefundRow,
  mapInvoiceRow,
  mapInvoiceStatusEventRow,
} from '../application/invoice.mappers';
import {
  INVOICE_BILLING_ALLOCATION_COLUMNS,
  INVOICE_COLUMNS,
  INVOICE_JOB_ORDER_COLUMNS,
  INVOICE_LINE_COLUMNS,
  INVOICE_PAYMENT_COLUMNS,
  INVOICE_RECEIPT_COLUMNS,
  INVOICE_REFUND_COLUMNS,
  INVOICE_STATUS_EVENT_COLUMNS,
  REFUND_INVENTORY_REVERSAL_COLUMNS,
  VOID_INVENTORY_REVERSAL_COLUMNS,
} from './postgres-invoice.sql';

@Injectable()
export class PostgresInvoiceStore extends InvoiceStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(input: { tenantId: string; userId: string }): Promise<boolean> {
    const result = await this.database.query<{ value: number }>(
      `
        select 1 as value
        from user_roles ur
        join roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id
        where ur.tenant_id = $1::uuid
          and ur.user_id = $2::uuid
          and ur.removed_at is null
          and r.status = 'active'
          and r.role_type = 'shop_owner'
        limit 1
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0] !== undefined;
  }

  async lockInvoiceSettingsForUpdate(
    tenantId: string,
    client: DatabaseQueryClient,
  ): Promise<InvoiceSettingsRecord | null> {
    const result = await client.query<{
      invoice_prefix: string;
      tax_profile: InvoiceSettingsRecord['taxProfile'];
      tax_mode: InvoiceSettingsRecord['taxMode'];
      vat_rate: string;
      default_invoice_due_days: number;
      timezone: string;
    }>(
      `
        select
          sp.invoice_prefix,
          sp.tax_profile,
          sp.tax_mode,
          sp.vat_rate::text,
          sp.default_invoice_due_days,
          t.timezone
        from shop_profiles sp
        join tenants t on t.id = sp.tenant_id
        where sp.tenant_id = $1::uuid
        for update of sp
      `,
      [tenantId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      invoicePrefix: row.invoice_prefix,
      taxProfile: row.tax_profile,
      taxMode: row.tax_mode,
      vatRate: row.vat_rate,
      defaultInvoiceDueDays: row.default_invoice_due_days,
      timezone: row.timezone,
    };
  }

  async findDraftJobOrdersForUpdate(
    tenantId: string,
    jobOrderIds: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceDraftJobOrderRecord[]> {
    if (jobOrderIds.length === 0) {
      return [];
    }

    const result = await client.query<{
      id: string;
      tenant_id: string;
      branch_id: string;
      customer_id: string;
      status: InvoiceDraftJobOrderRecord['status'];
    }>(
      `
        select id, tenant_id, branch_id, customer_id, status
        from job_orders
        where tenant_id = $1::uuid
          and id = any($2::uuid[])
        for update
      `,
      [tenantId, jobOrderIds],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      customerId: row.customer_id,
      status: row.status,
    }));
  }

  async findDraftJobOrderLinesForUpdate(
    tenantId: string,
    jobOrderLineIds: readonly string[] | null,
    jobOrderIds: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceDraftJobOrderLineRecord[]> {
    if (jobOrderIds.length === 0) {
      return [];
    }

    const result = await client.query<{
      id: string;
      tenant_id: string;
      job_order_id: string;
      line_type: InvoiceDraftJobOrderLineRecord['lineType'];
      service_id: string | null;
      product_id: string | null;
      description: string;
      quantity: string;
      unit_price: string;
      authorized_amount: string;
      status: InvoiceDraftJobOrderLineRecord['status'];
      line_order: number;
    }>(
      `
        select
          id,
          tenant_id,
          job_order_id,
          line_type,
          service_id,
          product_id,
          description,
          quantity::text,
          unit_price::text,
          authorized_amount::text,
          status,
          line_order
        from job_order_lines
        where tenant_id = $1::uuid
          and job_order_id = any($2::uuid[])
          and ($3::uuid[] is null or id = any($3::uuid[]))
          and ($3::uuid[] is not null or status <> 'cancelled')
        order by job_order_id, line_order, id
        for update
      `,
      [tenantId, jobOrderIds, jobOrderLineIds],
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      jobOrderId: row.job_order_id,
      lineType: row.line_type,
      serviceId: row.service_id,
      productId: row.product_id,
      description: row.description,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      authorizedAmount: row.authorized_amount,
      status: row.status,
      lineOrder: row.line_order,
    }));
  }

  async listOpenBillingAllocationTotals(
    tenantId: string,
    jobOrderLineIds: readonly string[],
    client: DatabaseQueryClient,
  ): Promise<readonly BillingAllocationTotalRecord[]> {
    if (jobOrderLineIds.length === 0) {
      return [];
    }

    const result = await client.query<{
      job_order_line_id: string;
      allocated_quantity: string;
      allocated_amount: string;
    }>(
      `
        select
          job_order_line_id,
          coalesce(sum(allocated_quantity), 0)::text as allocated_quantity,
          coalesce(sum(allocated_amount), 0)::text as allocated_amount
        from invoice_billing_allocations
        where tenant_id = $1::uuid
          and job_order_line_id = any($2::uuid[])
          and status in ('reserved', 'final', 'closed')
        group by job_order_line_id
      `,
      [tenantId, jobOrderLineIds],
    );

    return result.rows.map((row) => ({
      jobOrderLineId: row.job_order_line_id,
      allocatedQuantity: row.allocated_quantity,
      allocatedAmount: row.allocated_amount,
    }));
  }

  async createDraftInvoice(
    input: CreateDraftInvoiceInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceRecord> {
    const result = await client.query<InvoiceRow>(
      `
        insert into invoices (
          id,
          tenant_id,
          branch_id,
          customer_id,
          invoice_number,
          invoice_date,
          due_date,
          status,
          tax_profile,
          tax_mode,
          vat_rate,
          subtotal_amount,
          discount_amount,
          tax_amount,
          total_amount,
          remaining_collectible_balance,
          discount_reason,
          created_by_user_id,
          created_at,
          updated_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::date,
          $7::date,
          'draft',
          $8,
          $9,
          $10::numeric(5,4),
          $11::numeric(14,2),
          $12::numeric(14,2),
          $13::numeric(14,2),
          $14::numeric(14,2),
          $15::numeric(14,2),
          $16,
          $17::uuid,
          $18::timestamptz,
          $18::timestamptz
        )
        returning ${INVOICE_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.customerId,
        input.invoiceNumber,
        input.invoiceDate,
        input.dueDate,
        input.taxProfile,
        input.taxMode,
        input.vatRate,
        input.subtotalAmount,
        input.discountAmount,
        input.taxAmount,
        input.totalAmount,
        input.remainingCollectibleBalance,
        input.discountReason,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInvoiceRow(getRequiredRow(result, 'create draft invoice'));
  }

  async createInvoiceJobOrderLinks(
    input: CreateInvoiceJobOrderLinksInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceJobOrderRecord[]> {
    if (input.jobOrders.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.jobOrders.map((jobOrder, index) => {
      const offset = index * 5;
      values.push(
        jobOrder.id,
        input.tenantId,
        input.invoiceId,
        jobOrder.jobOrderId,
        jobOrder.createdAt,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::timestamptz
      )`;
    });

    const result = await client.query<InvoiceJobOrderRow>(
      `
        insert into invoice_job_orders (
          id,
          tenant_id,
          invoice_id,
          job_order_id,
          created_at
        )
        values ${placeholders.join(', ')}
        returning ${INVOICE_JOB_ORDER_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInvoiceJobOrderRow);
  }

  async createInvoiceLines(
    input: CreateInvoiceLinesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceLineRecord[]> {
    if (input.lines.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.lines.map((line, index) => {
      const offset = index * 16;
      values.push(
        line.id,
        input.tenantId,
        input.invoiceId,
        line.originatingJobOrderLineId,
        line.lineType,
        line.productId,
        line.serviceId,
        line.description,
        line.quantity,
        line.unitPrice,
        line.lineDiscountAmount,
        line.allocatedInvoiceDiscountAmount,
        line.taxableBaseAmount,
        line.taxAmount,
        line.lineTotal,
        line.lineOrder,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5},
        $${offset + 6}::uuid,
        $${offset + 7}::uuid,
        $${offset + 8},
        $${offset + 9}::numeric(14,3),
        $${offset + 10}::numeric(14,2),
        $${offset + 11}::numeric(14,2),
        $${offset + 12}::numeric(14,2),
        $${offset + 13}::numeric(14,2),
        $${offset + 14}::numeric(14,2),
        $${offset + 15}::numeric(14,2),
        $${offset + 16}::integer
      )`;
    });

    const result = await client.query<InvoiceLineRow>(
      `
        insert into invoice_lines (
          id,
          tenant_id,
          invoice_id,
          originating_job_order_line_id,
          line_type,
          product_id,
          service_id,
          description,
          quantity,
          unit_price,
          line_discount_amount,
          allocated_invoice_discount_amount,
          taxable_base_amount,
          tax_amount,
          line_total,
          line_order
        )
        values ${placeholders.join(', ')}
        returning ${INVOICE_LINE_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInvoiceLineRow);
  }

  async createBillingAllocations(
    input: CreateInvoiceBillingAllocationsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceBillingAllocationRecord[]> {
    if (input.allocations.length === 0) {
      return [];
    }

    const allocationsFitRemaining = await this.validateBillingAllocationsFitRemaining(
      input,
      client,
    );

    if (!allocationsFitRemaining) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.allocations.map((allocation, index) => {
      const offset = index * 9;
      values.push(
        allocation.id,
        input.tenantId,
        input.invoiceId,
        allocation.invoiceLineId,
        allocation.jobOrderLineId,
        allocation.allocatedQuantity,
        allocation.allocatedAmount,
        allocation.status,
        allocation.createdAt,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::uuid,
        $${offset + 6}::numeric(14,3),
        $${offset + 7}::numeric(14,2),
        $${offset + 8},
        $${offset + 9}::timestamptz,
        $${offset + 9}::timestamptz
      )`;
    });

    const result = await client.query<InvoiceBillingAllocationRow>(
      `
        insert into invoice_billing_allocations (
          id,
          tenant_id,
          invoice_id,
          invoice_line_id,
          job_order_line_id,
          allocated_quantity,
          allocated_amount,
          status,
          created_at,
          updated_at
        )
        values ${placeholders.join(', ')}
        returning ${INVOICE_BILLING_ALLOCATION_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInvoiceBillingAllocationRow);
  }

  private async validateBillingAllocationsFitRemaining(
    input: CreateInvoiceBillingAllocationsInput,
    client: DatabaseQueryClient,
  ): Promise<boolean> {
    const jobOrderLineIds = [
      ...new Set(input.allocations.map((allocation) => allocation.jobOrderLineId)),
    ];

    const lockedLines = await client.query<{
      id: string;
      quantity: string;
      authorized_amount: string;
    }>(
      `
        select id, quantity::text, authorized_amount::text
        from job_order_lines
        where tenant_id = $1::uuid
          and id = any($2::uuid[])
        for update
      `,
      [input.tenantId, jobOrderLineIds],
    );

    if (lockedLines.rows.length !== jobOrderLineIds.length) {
      return false;
    }

    const totals = await this.listOpenBillingAllocationTotals(
      input.tenantId,
      jobOrderLineIds,
      client,
    );
    const totalsByLineId = new Map(totals.map((total) => [total.jobOrderLineId, total] as const));
    const linesById = new Map(lockedLines.rows.map((line) => [line.id, line] as const));
    const requestedByLineId = new Map<
      string,
      { allocatedQuantity: bigint; allocatedAmount: bigint }
    >();

    for (const allocation of input.allocations) {
      const current = requestedByLineId.get(allocation.jobOrderLineId) ?? {
        allocatedQuantity: 0n,
        allocatedAmount: 0n,
      };

      requestedByLineId.set(allocation.jobOrderLineId, {
        allocatedQuantity:
          current.allocatedQuantity +
          (allocation.allocatedQuantity === null
            ? 0n
            : parseQuantityThousandths(allocation.allocatedQuantity)),
        allocatedAmount:
          current.allocatedAmount +
          (allocation.allocatedAmount === null ? 0n : parseMoneyCents(allocation.allocatedAmount)),
      });
    }

    for (const [lineId, requested] of requestedByLineId) {
      const line = linesById.get(lineId);

      if (line === undefined) {
        return false;
      }

      const total = totalsByLineId.get(lineId);
      const remainingQuantity =
        parseQuantityThousandths(line.quantity) -
        parseQuantityThousandths(total?.allocatedQuantity ?? '0.000');
      const remainingAmount =
        parseMoneyCents(line.authorized_amount) - parseMoneyCents(total?.allocatedAmount ?? '0.00');

      if (
        requested.allocatedQuantity > remainingQuantity ||
        requested.allocatedAmount > remainingAmount
      ) {
        return false;
      }
    }

    return true;
  }

  async replaceDraftInvoiceLines(
    input: ReplaceDraftInvoiceLinesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceLineRecord[]> {
    const draftResult = await client.query(
      `
        select 1 as value
        from invoices
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = 'draft'
      `,
      [input.tenantId, input.invoiceId],
    );

    if (draftResult.rows[0] === undefined) {
      return [];
    }

    await client.query(
      `
        delete from invoice_billing_allocations
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
      `,
      [input.tenantId, input.invoiceId],
    );

    await client.query(
      `
        delete from invoice_lines
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
      `,
      [input.tenantId, input.invoiceId],
    );

    return this.createInvoiceLines(input, client);
  }

  async findInvoiceWithDetails(
    input: FindInvoiceWithDetailsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceWithDetailsRecord | null> {
    const invoice = await this.findInvoice(input, client, false);
    if (invoice === null) {
      return null;
    }

    return this.attachDetails(invoice, client);
  }

  async lockInvoiceWithDetailsForUpdate(
    input: LockInvoiceWithDetailsForUpdateInput,
    client: DatabaseQueryClient,
  ): Promise<InvoiceWithDetailsRecord | null> {
    const invoice = await this.findInvoice(input, client, true);
    if (invoice === null) {
      return null;
    }

    return this.attachDetails(invoice, client);
  }

  async updateInvoiceWorkflowStatus(
    input: UpdateInvoiceWorkflowStatusInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceRecord | null> {
    const result = await client.query<InvoiceRow>(
      `
        update invoices
        set
          status = $4,
          issued_at = coalesce($5::timestamptz, issued_at),
          cancelled_at = coalesce($6::timestamptz, cancelled_at),
          voided_at = coalesce($7::timestamptz, voided_at),
          updated_at = $8::timestamptz,
          lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
          and status = $3
        returning ${INVOICE_COLUMNS}
      `,
      [
        input.tenantId,
        input.invoiceId,
        input.fromStatus,
        input.toStatus,
        input.issuedAt ?? null,
        input.cancelledAt ?? null,
        input.voidedAt ?? null,
        input.changedAt,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapInvoiceRow(row);
  }

  async updateBillingAllocationStatuses(
    input: UpdateBillingAllocationStatusesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceBillingAllocationRecord[]> {
    if (input.fromStatuses.length === 0) {
      return [];
    }

    const result = await client.query<InvoiceBillingAllocationRow>(
      `
        update invoice_billing_allocations
        set
          status = $4,
          updated_at = $5::timestamptz
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
          and status = any($3::text[])
        returning ${INVOICE_BILLING_ALLOCATION_COLUMNS}
      `,
      [input.tenantId, input.invoiceId, input.fromStatuses, input.toStatus, input.changedAt],
    );

    return result.rows.map(mapInvoiceBillingAllocationRow);
  }

  async createPayment(
    input: CreateInvoicePaymentInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoicePaymentRecord> {
    const result = await client.query<InvoicePaymentRow>(
      `
        insert into payments (
          id,
          tenant_id,
          invoice_id,
          amount,
          refundable_amount,
          payment_date,
          payment_method,
          reference_number,
          notes,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::numeric(14,2),
          $4::numeric(14,2),
          $5::date,
          $6,
          $7,
          $8,
          $9::uuid,
          $10::timestamptz
        )
        returning ${INVOICE_PAYMENT_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.invoiceId,
        input.amount,
        input.paymentDate,
        input.paymentMethod,
        input.referenceNumber,
        input.notes,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInvoicePaymentRow(getRequiredRow(result, 'create invoice payment'));
  }

  async createReceipt(
    input: CreateInvoiceReceiptInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceReceiptRecord> {
    const result = await client.query<InvoiceReceiptRow>(
      `
        insert into receipts (
          id,
          tenant_id,
          invoice_id,
          payment_id,
          receipt_number,
          amount,
          payment_method,
          issued_at,
          created_by_user_id
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::numeric(14,2),
          $7,
          $8::timestamptz,
          $9::uuid
        )
        returning ${INVOICE_RECEIPT_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.invoiceId,
        input.paymentId,
        input.receiptNumber,
        input.amount,
        input.paymentMethod,
        input.issuedAt,
        input.createdByUserId,
      ],
    );

    return mapInvoiceReceiptRow(getRequiredRow(result, 'create invoice receipt'));
  }

  async updateInvoicePaymentTotals(
    input: UpdateInvoicePaymentTotalsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceRecord | null> {
    const result = await client.query<InvoiceRow>(
      `
        update invoices
        set
          amount_paid = $3::numeric(14,2),
          remaining_collectible_balance = $4::numeric(14,2),
          status = $5,
          updated_at = $6::timestamptz,
          lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
        returning ${INVOICE_COLUMNS}
      `,
      [
        input.tenantId,
        input.invoiceId,
        input.amountPaid,
        input.remainingCollectibleBalance,
        input.status,
        input.changedAt,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : mapInvoiceRow(row);
  }

  async allocateReceiptNumber(
    input: AllocateReceiptNumberInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    const result = await client.query<{ last_value: string | number }>(
      `
        insert into document_sequences (
          tenant_id,
          sequence_type,
          sequence_date,
          last_value,
          updated_at
        )
        values ($1::uuid, 'receipt', '0001-01-01'::date, 1, now())
        on conflict (tenant_id, sequence_type, sequence_date)
        do update set
          last_value = document_sequences.last_value + 1,
          updated_at = now()
        returning last_value
      `,
      [input.tenantId],
    );
    const sequence = result.rows[0]?.last_value;

    return sequence === undefined ? null : buildReceiptNumber(Number(sequence));
  }

  async listReceipts(
    input: ListInvoiceReceiptsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceReceiptRecord[]> {
    const result = await client.query<InvoiceReceiptRow>(
      `
        select ${prefixColumns(INVOICE_RECEIPT_COLUMNS, 'r')}
        from receipts r
        join invoices i on i.tenant_id = r.tenant_id and i.id = r.invoice_id
        where r.tenant_id = $1::uuid
          and ($2::uuid[] is null or i.branch_id = any($2::uuid[]))
        order by r.issued_at desc, r.id desc
        limit $3
      `,
      [input.tenantId, input.branchIds, input.limit],
    );

    return result.rows.map(mapInvoiceReceiptRow);
  }

  async findReceiptWithBranch(
    input: FindInvoiceReceiptInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceReceiptWithBranchRecord | null> {
    const result = await client.query<InvoiceReceiptRow & { branch_id: string }>(
      `
        select
          ${prefixColumns(INVOICE_RECEIPT_COLUMNS, 'r')},
          i.branch_id
        from receipts r
        join invoices i on i.tenant_id = r.tenant_id and i.id = r.invoice_id
        where r.tenant_id = $1::uuid
          and r.id = $2::uuid
        limit 1
      `,
      [input.tenantId, input.receiptId],
    );
    const row = result.rows[0];

    return row === undefined
      ? null
      : {
          receipt: mapInvoiceReceiptRow(row),
          branchId: row.branch_id,
        };
  }

  async lockPaymentWithInvoiceForUpdate(
    input: LockInvoicePaymentWithInvoiceInput,
    client: DatabaseQueryClient,
  ): Promise<InvoicePaymentWithInvoiceRecord | null> {
    const paymentResult = await client.query<InvoicePaymentRow>(
      `
        select ${INVOICE_PAYMENT_COLUMNS}
        from payments
        where tenant_id = $1::uuid
          and id = $2::uuid
        for update
      `,
      [input.tenantId, input.paymentId],
    );
    const paymentRow = paymentResult.rows[0];

    if (paymentRow === undefined) {
      return null;
    }

    const payment = mapInvoicePaymentRow(paymentRow);
    const invoiceResult = await client.query<InvoiceRow>(
      `
        select ${INVOICE_COLUMNS}
        from invoices
        where tenant_id = $1::uuid
          and id = $2::uuid
        for update
      `,
      [input.tenantId, payment.invoiceId],
    );
    const invoiceRow = invoiceResult.rows[0];

    if (invoiceRow === undefined) {
      return null;
    }

    return {
      payment,
      invoice: mapInvoiceRow(invoiceRow),
    };
  }

  async createRefund(
    input: CreateInvoiceRefundInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceRefundRecord> {
    const result = await client.query<InvoiceRefundRow>(
      `
        insert into refunds (
          id,
          tenant_id,
          invoice_id,
          payment_id,
          amount,
          reason,
          collection_should_continue,
          close_invoice_after_refund,
          inventory_reversal_selected,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::numeric(14,2),
          $6,
          $7,
          $8,
          $9,
          $10::uuid,
          $11::timestamptz
        )
        returning ${INVOICE_REFUND_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.invoiceId,
        input.paymentId,
        input.amount,
        input.reason,
        input.collectionShouldContinue,
        input.closeInvoiceAfterRefund,
        input.inventoryReversalSelected,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInvoiceRefundRow(getRequiredRow(result, 'create invoice refund'));
  }

  async updatePaymentRefundableAmount(
    input: UpdateInvoicePaymentRefundableAmountInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoicePaymentRecord | null> {
    const result = await client.query<InvoicePaymentRow>(
      `
        update payments
        set refundable_amount = $3::numeric(14,2)
        where tenant_id = $1::uuid
          and id = $2::uuid
        returning ${INVOICE_PAYMENT_COLUMNS}
      `,
      [input.tenantId, input.paymentId, input.refundableAmount],
    );
    const row = result.rows[0];

    return row === undefined ? null : mapInvoicePaymentRow(row);
  }

  async updateInvoiceRefundTotals(
    input: UpdateInvoiceRefundTotalsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceRecord | null> {
    const result = await client.query<InvoiceRow>(
      `
        update invoices
        set
          amount_refunded = $3::numeric(14,2),
          remaining_collectible_balance = $4::numeric(14,2),
          status = $5,
          refunded_at = $6::timestamptz,
          updated_at = $7::timestamptz,
          lock_version = lock_version + 1
        where tenant_id = $1::uuid
          and id = $2::uuid
        returning ${INVOICE_COLUMNS}
      `,
      [
        input.tenantId,
        input.invoiceId,
        input.amountRefunded,
        input.remainingCollectibleBalance,
        input.status,
        input.refundedAt,
        input.changedAt,
      ],
    );
    const row = result.rows[0];

    return row === undefined ? null : mapInvoiceRow(row);
  }

  async listRefundInventoryReversalTotals(
    tenantId: string,
    jobOrderLineIds: readonly string[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryReversalTotalRecord[]> {
    return this.listInventoryReversalTotals({
      tableName: 'refund_inventory_reversals',
      tenantId,
      jobOrderLineIds,
      client,
    });
  }

  async listVoidInventoryReversalTotals(
    tenantId: string,
    jobOrderLineIds: readonly string[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InventoryReversalTotalRecord[]> {
    return this.listInventoryReversalTotals({
      tableName: 'void_inventory_reversals',
      tenantId,
      jobOrderLineIds,
      client,
    });
  }

  async listJobOrderLineInventoryConsumptionCosts(
    tenantId: string,
    jobOrderLineIds: readonly string[],
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceInventoryConsumptionCostRecord[]> {
    if (jobOrderLineIds.length === 0) {
      return [];
    }

    const result = await client.query<{
      source_id: string;
      product_id: string;
      fifo_layer_id: string;
      quantity_consumed: string;
      unit_cost: string;
      consumed_at: Date;
    }>(
      `
        select
          source_id,
          product_id,
          fifo_layer_id,
          quantity_consumed::text,
          unit_cost::text,
          consumed_at
        from fifo_consumptions
        where tenant_id = $1::uuid
          and source_type = 'job_order_line'
          and source_id = any($2::uuid[])
        order by consumed_at asc, id asc
      `,
      [tenantId, jobOrderLineIds],
    );

    return result.rows.map((row) => ({
      jobOrderLineId: row.source_id,
      productId: row.product_id,
      fifoLayerId: row.fifo_layer_id,
      quantityConsumed: row.quantity_consumed,
      unitCost: row.unit_cost,
      consumedAt: row.consumed_at,
    }));
  }

  async createRefundInventoryReversals(
    input: CreateRefundInventoryReversalsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceInventoryReversalRecord[]> {
    if (input.reversals.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.reversals.map((reversal, index) => {
      const offset = index * 9;
      values.push(
        reversal.id,
        input.tenantId,
        input.refundId,
        reversal.jobOrderLineId,
        reversal.productId,
        reversal.quantityReturned,
        reversal.inventoryLedgerEntryId,
        reversal.fifoLayerId,
        reversal.createdAt,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::uuid,
        $${offset + 6}::numeric(14,3),
        $${offset + 7}::uuid,
        $${offset + 8}::uuid,
        $${offset + 9}::timestamptz
      )`;
    });

    const result = await client.query<InvoiceInventoryReversalRow>(
      `
        insert into refund_inventory_reversals (
          id,
          tenant_id,
          refund_id,
          job_order_line_id,
          product_id,
          quantity_returned,
          inventory_ledger_entry_id,
          fifo_layer_id,
          created_at
        )
        values ${placeholders.join(', ')}
        returning ${REFUND_INVENTORY_REVERSAL_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInvoiceInventoryReversalRow);
  }

  async createVoidInventoryReversals(
    input: CreateVoidInventoryReversalsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceInventoryReversalRecord[]> {
    if (input.reversals.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = input.reversals.map((reversal, index) => {
      const offset = index * 9;
      values.push(
        reversal.id,
        input.tenantId,
        input.invoiceId,
        reversal.jobOrderLineId,
        reversal.productId,
        reversal.quantityReturned,
        reversal.inventoryLedgerEntryId,
        reversal.fifoLayerId,
        reversal.createdAt,
      );

      return `(
        $${offset + 1}::uuid,
        $${offset + 2}::uuid,
        $${offset + 3}::uuid,
        $${offset + 4}::uuid,
        $${offset + 5}::uuid,
        $${offset + 6}::numeric(14,3),
        $${offset + 7}::uuid,
        $${offset + 8}::uuid,
        $${offset + 9}::timestamptz
      )`;
    });

    const result = await client.query<InvoiceInventoryReversalRow>(
      `
        insert into void_inventory_reversals (
          id,
          tenant_id,
          invoice_id,
          job_order_line_id,
          product_id,
          quantity_returned,
          inventory_ledger_entry_id,
          fifo_layer_id,
          created_at
        )
        values ${placeholders.join(', ')}
        returning ${VOID_INVENTORY_REVERSAL_COLUMNS}
      `,
      values,
    );

    return result.rows.map(mapInvoiceInventoryReversalRow);
  }

  async insertStatusEvent(
    input: InsertInvoiceStatusEventInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<InvoiceStatusEventRecord> {
    const result = await client.query<InvoiceStatusEventRow>(
      `
        insert into invoice_status_events (
          id,
          tenant_id,
          invoice_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6,
          $7::uuid,
          $8::timestamptz
        )
        returning ${INVOICE_STATUS_EVENT_COLUMNS}
      `,
      [
        input.id,
        input.tenantId,
        input.invoiceId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    return mapInvoiceStatusEventRow(getRequiredRow(result, 'insert invoice status event'));
  }

  async listStatusEvents(
    input: FindInvoiceWithDetailsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceStatusEventRecord[]> {
    const result = await client.query<InvoiceStatusEventRow>(
      `
        select ${INVOICE_STATUS_EVENT_COLUMNS}
        from invoice_status_events
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
        order by created_at desc, id desc
      `,
      [input.tenantId, input.invoiceId],
    );

    return result.rows.map(mapInvoiceStatusEventRow);
  }

  async listInvoices(
    input: ListInvoicesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly InvoiceRecord[]> {
    const result = await client.query<InvoiceRow>(
      `
        select ${INVOICE_COLUMNS}
        from invoices
        where tenant_id = $1::uuid
          and ($2::uuid[] is null or branch_id = any($2::uuid[]))
          and ($3::uuid is null or branch_id = $3::uuid)
          and ($4::text is null or status = $4::text)
          and ($5::uuid is null or customer_id = $5::uuid)
          and ($6::date is null or invoice_date >= $6::date)
          and ($7::date is null or invoice_date <= $7::date)
        order by invoice_date desc, created_at desc, id desc
        limit $8
      `,
      [
        input.tenantId,
        input.branchIds,
        input.branchId ?? null,
        input.status ?? null,
        input.customerId ?? null,
        input.fromDate ?? null,
        input.toDate ?? null,
        input.limit,
      ],
    );

    return result.rows.map(mapInvoiceRow);
  }

  async findLatestInvoiceNumberForDate(
    input: FindLatestInvoiceNumberForDateInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<string | null> {
    const result = await client.query<{ invoice_number: string }>(
      `
        select invoice_number
        from invoices
        where tenant_id = $1::uuid
          and invoice_number like $2
        order by invoice_number desc
        limit 1
      `,
      [input.tenantId, `${input.datePrefix}-%`],
    );

    return result.rows[0]?.invoice_number ?? null;
  }

  private async listInventoryReversalTotals(input: {
    readonly tableName: 'refund_inventory_reversals' | 'void_inventory_reversals';
    readonly tenantId: string;
    readonly jobOrderLineIds: readonly string[];
    readonly client: DatabaseQueryClient;
  }): Promise<readonly InventoryReversalTotalRecord[]> {
    if (input.jobOrderLineIds.length === 0) {
      return [];
    }

    const result = await input.client.query<{
      job_order_line_id: string;
      quantity_returned: string;
    }>(
      `
        select
          job_order_line_id,
          coalesce(sum(quantity_returned), 0)::text as quantity_returned
        from ${input.tableName}
        where tenant_id = $1::uuid
          and job_order_line_id = any($2::uuid[])
        group by job_order_line_id
      `,
      [input.tenantId, input.jobOrderLineIds],
    );

    return result.rows.map((row) => ({
      jobOrderLineId: row.job_order_line_id,
      quantityReturned: row.quantity_returned,
    }));
  }

  private async findInvoice(
    input: FindInvoiceWithDetailsInput,
    client: DatabaseQueryClient,
    lock: boolean,
  ): Promise<InvoiceRecord | null> {
    const result = await client.query<InvoiceRow>(
      `
        select ${INVOICE_COLUMNS}
        from invoices
        where tenant_id = $1::uuid
          and id = $2::uuid
        ${lock ? 'for update' : ''}
      `,
      [input.tenantId, input.invoiceId],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapInvoiceRow(row);
  }

  private async attachDetails(
    invoice: InvoiceRecord,
    client: DatabaseQueryClient,
  ): Promise<InvoiceWithDetailsRecord> {
    return {
      invoice,
      jobOrders: await this.listJobOrderLinks(invoice.tenantId, invoice.id, client),
      lines: await this.listLines(invoice.tenantId, invoice.id, client),
      billingAllocations: await this.listBillingAllocations(invoice.tenantId, invoice.id, client),
    };
  }

  private async listJobOrderLinks(
    tenantId: string,
    invoiceId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceJobOrderRecord[]> {
    const result = await client.query<InvoiceJobOrderRow>(
      `
        select ${INVOICE_JOB_ORDER_COLUMNS}
        from invoice_job_orders
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
        order by created_at asc, id asc
      `,
      [tenantId, invoiceId],
    );

    return result.rows.map(mapInvoiceJobOrderRow);
  }

  private async listLines(
    tenantId: string,
    invoiceId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceLineRecord[]> {
    const result = await client.query<InvoiceLineRow>(
      `
        select ${INVOICE_LINE_COLUMNS}
        from invoice_lines
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
        order by line_order asc, id asc
      `,
      [tenantId, invoiceId],
    );

    return result.rows.map(mapInvoiceLineRow);
  }

  private async listBillingAllocations(
    tenantId: string,
    invoiceId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly InvoiceBillingAllocationRecord[]> {
    const result = await client.query<InvoiceBillingAllocationRow>(
      `
        select ${INVOICE_BILLING_ALLOCATION_COLUMNS}
        from invoice_billing_allocations
        where tenant_id = $1::uuid
          and invoice_id = $2::uuid
        order by created_at asc, id asc
      `,
      [tenantId, invoiceId],
    );

    return result.rows.map(mapInvoiceBillingAllocationRow);
  }
}

function getRequiredRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  operation: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Invoice store failed to ${operation}.`);
  }

  return row;
}

function prefixColumns(columns: string, tableAlias: string): string {
  return columns
    .split(',')
    .map((column) => `${tableAlias}.${column.trim()}`)
    .join(',\n');
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(2, '0').slice(0, 2);

  return BigInt(wholePart) * 100n + BigInt(normalizedFractionalPart);
}

function parseQuantityThousandths(value: string): bigint {
  const [wholePart = '0', fractionalPart = ''] = value.split('.');
  const normalizedFractionalPart = fractionalPart.padEnd(3, '0').slice(0, 3);

  return BigInt(wholePart) * 1000n + BigInt(normalizedFractionalPart);
}
