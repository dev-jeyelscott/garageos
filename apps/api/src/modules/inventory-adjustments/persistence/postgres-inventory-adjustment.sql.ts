export const INVENTORY_ADJUSTMENT_COLUMNS = `
  id,
  tenant_id,
  branch_id,
  adjustment_number,
  status,
  reason,
  value_impact::text,
  approval_required,
  requested_by_user_id,
  approved_by_user_id,
  posted_at,
  created_at,
  updated_at,
  lock_version
`;

export const INVENTORY_ADJUSTMENT_LINE_COLUMNS = `
  id,
  tenant_id,
  adjustment_id,
  product_id,
  adjustment_type,
  quantity_difference::text,
  final_counted_quantity::text,
  unit_cost::text,
  estimated_fifo_cost::text
`;

export const INVENTORY_ADJUSTMENT_STATUS_EVENT_COLUMNS = `
  id,
  tenant_id,
  adjustment_id,
  from_status,
  to_status,
  reason,
  created_by_user_id,
  created_at
`;
