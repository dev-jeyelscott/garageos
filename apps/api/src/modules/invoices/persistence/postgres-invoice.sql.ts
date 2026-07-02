export const INVOICE_COLUMNS = `
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
  vat_rate::text,
  subtotal_amount::text,
  discount_amount::text,
  tax_amount::text,
  total_amount::text,
  amount_paid::text,
  amount_refunded::text,
  remaining_collectible_balance::text,
  discount_reason,
  issued_at,
  cancelled_at,
  voided_at,
  refunded_at,
  created_by_user_id,
  created_at,
  updated_at,
  lock_version
`;

export const INVOICE_LINE_COLUMNS = `
  id,
  tenant_id,
  invoice_id,
  originating_job_order_line_id,
  line_type,
  product_id,
  service_id,
  description,
  quantity::text,
  unit_price::text,
  line_discount_amount::text,
  allocated_invoice_discount_amount::text,
  taxable_base_amount::text,
  tax_amount::text,
  line_total::text,
  line_order
`;

export const INVOICE_JOB_ORDER_COLUMNS = `
  id,
  tenant_id,
  invoice_id,
  job_order_id,
  created_at
`;

export const INVOICE_BILLING_ALLOCATION_COLUMNS = `
  id,
  tenant_id,
  invoice_id,
  invoice_line_id,
  job_order_line_id,
  allocated_quantity::text,
  allocated_amount::text,
  status,
  created_at,
  updated_at
`;

export const INVOICE_STATUS_EVENT_COLUMNS = `
  id,
  tenant_id,
  invoice_id,
  from_status,
  to_status,
  reason,
  created_by_user_id,
  created_at
`;
