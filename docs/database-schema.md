# GarageOS Database Schema — Token-Reduced Reference

**Document:** `database-schema.md`  
**Source Documents:** `requirements.md`, `database-design.md`  
**Generated:** 2026-06-24  
**Revised for token efficiency:** 2026-06-27  
**Status:** Compact schema map for planning, AI context, traceability, and migration review. Use full SQL/migrations for exact syntax.  
**Database Target:** PostgreSQL 16+

---

## 1. Core Rules

- Shared PostgreSQL database/schema with strict tenant isolation.
- Tenant-owned records include `tenant_id`; branch-operational records include `tenant_id` + `branch_id`.
- Inventory is ledger-first; FIFO layers, reservations, allocations, and consumptions are first-class.
- Issued financial records, receipts, refunds, ledgers, status events, and audit logs are append-only or correction-only.
- Critical writes use transactions, locks, idempotency keys, and optimistic locking where applicable.
- Tenant-scoped document numbers are generated from locked `document_sequences` rows and never reused.
- Prefer soft deletion/deactivation; hard deletion only through tenant deletion jobs.
- Database constraints protect invariants; service logic enforces workflow transitions.

## 2. PostgreSQL Standards

- Extensions: `pg_trgm`, `unaccent`, `pgcrypto`; optional `citext`.
- Types: `uuid` IDs, `numeric(14,2)` money, `numeric(14,3)` quantity, `timestamptz` UTC events, `date` tenant-local business dates, `jsonb` provider payloads.
- Mutable rows generally use audit columns + `lock_version`; append-only rows use `id`, optional `tenant_id`, `created_at`, `created_by_user_id`.

## 3. Enum Catalog

- `tenant_status=pending_setup|active|grace_period|read_only|suspended|pending_deletion|deleted`
- `subscription_status_source=system_computed|platform_override; support_access_mode=read_only|write_allowed; standard_plan_code=basic|mid|high`
- `user_type=tenant_user|platform_admin; user_status/employee_status/branch_status=active|inactive; role_type=shop_owner|manager|service_advisor|mechanic|cashier|inventory_clerk|custom`
- `customer_status=active|merged|soft_deleted; motorcycle_status=active|soft_deleted; service_status/product_status/category_status/supplier_status=active|inactive`
- `estimate_status=draft|presented|approved|converted|cancelled|expired; estimate_approval_method=verbal|sms|email|signed_document|other`
- `job_order_status=pending|in_progress|waiting_for_parts|completed|released|cancelled; job_order_line_type=service|labor|part; job_order_line_status=active|completed|cancelled; mechanic_work_session_status=active|paused|finished`
- `inventory_transaction_type=purchase_receive|job_order_reservation|reservation_release|job_order_consumption|inventory_adjustment_increase|inventory_adjustment_decrease|inventory_transfer_reservation|inventory_transfer_reservation_release|inventory_transfer_out|inventory_transfer_in|inventory_transfer_variance_loss|supplier_return|refund_inventory_reversal|void_inventory_reversal`
- `inventory_reservation_status/fifo_allocation_status=active|released|consumed|cancelled; inventory_adjustment_status=draft|pending_approval|approved|posted|rejected|cancelled; inventory_transfer_status=draft|pending|in_transit|received|cancelled`
- `purchase_order_status=draft|ordered|partially_received|received|closed|cancelled; purchase_payment_terms=cash|credit; supplier_return_status=draft|posted|cancelled`
- `invoice_status=draft|pending|partially_paid|paid|overdue|cancelled|voided|refunded; invoice_line_type=service|labor|part|custom; billing_allocation_status=reserved|final|released|closed`
- `payment_method=cash|gcash|maya|bank_transfer|credit_card|check|other; refund_status=posted|voided; tax_profile=vat_registered|non_vat|no_tax; tax_mode=tax_inclusive|tax_exclusive|no_tax`
- `expense_status=active|voided; reminder_status=scheduled|due|sent|failed|cancelled; notification_delivery_status=pending|sent|failed|read|dismissed`
- `file_status=active|soft_deleted|retained|quarantined|deleted; background_job_status=queued|running|succeeded|failed|cancelled|dead_lettered; idempotency_status=processing|succeeded|failed|expired; audit_actor_type=tenant_user|platform_admin|system`

## 4. Table Catalog

Format: `table(columns)` plus compact constraint/index names when useful.

### 5. Platform, Plans, Tenant Lifecycle

- `tenants`(`id, business_name, normalized_business_name, shop_email, normalized_shop_email, status, timezone, country, currency, onboarding_completed_at, deletion_scheduled_for, deleted_at, created_at, updated_at, lock_version`) — c=chk_tenants_status; i=ux_tenants_active_business_email
- `shop_profiles`(`tenant_id, shop_name, address, contact_number, email, logo_file_id, business_hours_json, tax_profile, tax_mode, vat_rate, invoice_prefix, receipt_footer_text, reminder_sender_name, default_invoice_due_days, created_at, updated_at`) — c=chk_shop_invoice_prefix,chk_shop_tax_combo,chk_shop_tax_mode,chk_shop_tax_profile
- `subscription_plans`(`id, code, name, status, is_default, default_duration_days, created_at`) — c=chk_plan_code; i=ux_one_default_subscription_plan
- `subscription_plan_limits`(`id, plan_id, capability_code, value_type, numeric_value, boolean_value, created_at`) — c=unique(plan_id,capability_code)
- `tenant_subscriptions`(`tenant_id, plan_id, start_date, expiration_date, status_source, last_renewal_at, updated_by_platform_admin_user_id, updated_at`) — c=chk_subscription_dates,chk_subscription_status_source
- `tenant_plan_overrides`(`id, tenant_id, capability_code, override_value_json, reason, effective_at, expires_at, created_by_platform_admin_user_id, created_at`) — i=idx_tenant_plan_overrides_active
- `subscription_overrides`(`id, tenant_id, override_type, previous_value_json, new_value_json, reason, effective_at, expires_at, created_by_platform_admin_user_id, created_at`)
- `tenant_lifecycle_events`(`id, tenant_id, from_status, to_status, source, reason, effective_at, created_at`) — i=idx_tenant_lifecycle_events_tenant_time
- `platform_support_access_sessions`(`id, tenant_id, platform_admin_user_id, access_mode, reason, started_at, expires_at, ended_at`) — c=chk_support_access_mode; i=idx_platform_support_access_active
- `tenant_deletion_jobs`(`id, tenant_id, scheduled_for, status, started_at, completed_at, failure_reason, attempt_count, created_at`) — i=ux_tenant_deletion_active_job

### 6. Authentication, Employees, Roles, Permissions

- `users`(`id, tenant_id, user_type, email, normalized_email, password_hash, email_verified_at, status, full_name, mobile_number, password_changed_at, created_at, updated_at, lock_version`) — c=chk_users_status,chk_users_tenant_rule,chk_users_type; i=ux_users_active_normalized_email,idx_users_tenant_status
- `employee_profiles`(`id, tenant_id, user_id, full_name, mobile_number, status, tenant_wide_branch_access, deactivated_at, reactivated_at, created_at, updated_at`) — c=chk_employee_status,unique(tenant_id,user_id)
- `permissions`(`id, code, category, description`)
- `roles`(`id, tenant_id, name, normalized_name, role_type, is_seeded_template, status, created_at, updated_at`) — c=chk_role_status; i=ux_roles_active_name
- `role_permissions`(`tenant_id, role_id, permission_id, created_at`) — c=pk(role_id,permission_id)
- `user_roles`(`id, tenant_id, user_id, role_id, assigned_at, assigned_by_user_id, removed_at`) — i=ux_user_roles_active
- `employee_invitations`(`id, tenant_id, email, normalized_email, token_hash, status, expires_at, accepted_at, revoked_at, assigned_role_config_json, assigned_branch_config_json, created_by_user_id, created_at`) — i=idx_employee_invitations_lookup
- `password_reset_tokens`(`id, user_id, token_hash, expires_at, used_at, created_at`)
- `email_verification_tokens`(`id, user_id, token_hash, email, expires_at, used_at, created_at`)
- `refresh_sessions`(`id, user_id, tenant_id, token_family_id, refresh_token_hash, remember_me, expires_at, revoked_at, replaced_by_session_id, created_at`)
- `login_attempts`(`id, normalized_email, ip_address, attempted_at, success, blocked_until, user_agent`) — i=idx_login_attempts_email_time,idx_login_attempts_ip_time

### 7. Shop Settings and Branch Access

- `branches`(`id, tenant_id, name, normalized_name, address, contact_number, business_hours_json, status, deactivated_at, reactivated_at, created_at, updated_at, lock_version`) — c=chk_branch_status,pk(tenant_id,id); i=ux_branches_active_name,idx_branches_tenant_status
- `user_branch_assignments`(`id, tenant_id, user_id, branch_id, assigned_at, assigned_by_user_id, removed_at`) — c=fk; i=ux_user_branch_assignments_active
- `branch_status_events`(`id, tenant_id, branch_id, from_status, to_status, reason, created_by_user_id, created_at`) — c=fk
- `tenant_settings`(`id, tenant_id, setting_key, setting_value_json, updated_by_user_id, updated_at`) — c=unique(tenant_id,setting_key)

### 8. Customers, Tags, Motorcycles

- `customers`(`id, tenant_id, name, normalized_name, mobile_number, normalized_mobile, email, normalized_email, address, birthday, notes, status, merged_into_customer_id, deleted_at, created_at, created_by_user_id, updated_at, updated_by_user_id, lock_version`) — c=chk_customer_contact,chk_customer_status; i=idx_customers_active_name,idx_customers_mobile,idx_customers_email,idx_customers_name_trgm
- `customer_tags`(`id, tenant_id, name, normalized_name, status, created_at`) — i=ux_customer_tags_active_name
- `customer_tag_assignments`(`tenant_id, customer_id, tag_id, created_at`) — c=pk(tenant_id,customer_id,tag_id)
- `customer_merge_events`(`id, tenant_id, source_customer_id, surviving_customer_id, reason, created_by_user_id, created_at`)
- `motorcycles`(`id, tenant_id, customer_id, brand, model, year, color, plate_number, normalized_plate_number, engine_number, normalized_engine_number, chassis_number, normalized_chassis_number, mileage, status, deleted_at, created_at, updated_at, lock_version`) — c=chk_motorcycle_mileage,chk_motorcycle_status; i=idx_motorcycles_customer,idx_motorcycles_plate,idx_motorcycles_model_trgm
- `motorcycle_mileage_events`(`id, tenant_id, motorcycle_id, source_type, source_id, previous_mileage, new_mileage, reason, created_by_user_id, created_at`) — c=chk_mileage_event_new; i=idx_motorcycle_mileage_events_lookup

### 9. Service Catalog, Estimates, Job Orders

- `services`(`id, tenant_id, name, normalized_name, starting_price, variable_price, price_disclaimer, description, status, created_at, updated_at`) — c=chk_service_disclaimer,chk_service_price; i=ux_services_active_name
- `estimates`(`id, tenant_id, branch_id, customer_id, motorcycle_id, estimate_number, status, valid_until_date, approval_method, approved_by_customer_name, approved_at, converted_job_order_id, created_by_user_id, created_at, updated_at`) — c=fk,unique(tenant_id,estimate_number); i=idx_estimates_branch_status
- `estimate_lines`(`id, tenant_id, estimate_id, line_type, service_id, product_id, description, quantity, unit_price, line_total, line_order`) — c=chk_estimate_line_amounts
- `estimate_status_events`(`id, tenant_id, estimate_id, from_status, to_status, reason, created_by_user_id, created_at`)
- `job_orders`(`id, tenant_id, branch_id, customer_id, motorcycle_id, job_order_number, status, service_advisor_user_id, primary_mechanic_user_id, mileage_at_intake, customer_concern, internal_notes, completed_at, released_at, no_charge_reason, release_with_balance_reason, created_by_user_id, created_at, updated_at, lock_version`) — c=chk_job_order_mileage,fk,unique(tenant_id,job_order_number); i=idx_job_orders_board,idx_job_orders_customer,idx_job_orders_motorcycle
- `job_order_status_events`(`id, tenant_id, job_order_id, from_status, to_status, reason, created_by_user_id, created_at`)
- `job_order_mechanics`(`id, tenant_id, job_order_id, user_id, assignment_type, assigned_at, removed_at`) — i=ux_job_order_mechanics_active
- `job_order_lines`(`id, tenant_id, job_order_id, line_type, service_id, product_id, description, quantity, unit_price, authorized_amount, status, inventory_reservation_id, completed_at, line_order, created_at, updated_at`) — c=chk_job_order_line_amounts; i=idx_job_order_lines_order
- `job_order_line_snapshots`(`id, tenant_id, job_order_line_id, source_name, source_price, source_disclaimer, captured_at`) — c=unique(tenant_id,job_order_line_id)
- `mechanic_work_sessions`(`id, tenant_id, branch_id, job_order_id, mechanic_user_id, status, started_at, finished_at, total_active_seconds, notes`) — c=chk_mechanic_session_duration,fk; i=ux_one_unfinished_session_per_mechanic
- `mechanic_work_session_pauses`(`id, tenant_id, work_session_id, paused_at, resumed_at, resumed_by_user_id`) — c=chk_pause_resume_order

### 10. Inventory, FIFO, Transfers, Adjustments

- `product_categories`(`id, tenant_id, name, normalized_name, status, created_at`) — i=ux_product_categories_active_name
- `products`(`id, tenant_id, category_id, name, normalized_name, sku, normalized_sku, barcode, normalized_barcode, supplier_code, brand, unit_of_measure, default_cost, selling_price, reorder_level, description, status, created_at, updated_at, lock_version`) — c=chk_product_amounts,unique(tenant_id,normalized_sku); i=ux_products_active_barcode,idx_products_active_category,idx_products_name_trgm
- `stock_balances`(`tenant_id, branch_id, product_id, on_hand_qty, reserved_qty, updated_at, lock_version`) — c=chk_stock_non_negative,fk,pk(tenant_id,branch_id,product_id); i=idx_stock_balances_branch_product
- `inventory_ledger_entries`(`id, tenant_id, branch_id, product_id, transaction_type, quantity_delta_on_hand, quantity_delta_reserved, unit_cost, total_cost, source_type, source_id, occurred_at, created_by_user_id`) — c=fk; i=idx_inventory_ledger_product_date
- `fifo_layers`(`id, tenant_id, branch_id, product_id, quantity_received, remaining_quantity, unit_cost, source_transaction_type, source_transaction_id, received_at, original_source_layer_id`) — c=chk_fifo_layer_cost,chk_fifo_layer_quantities,fk; i=idx_fifo_open_layers
- `inventory_reservations`(`id, tenant_id, branch_id, product_id, source_type, source_id, requested_quantity, reserved_quantity, status, reserved_at, released_at, consumed_at`) — c=chk_inventory_reservation_qty,fk; i=idx_active_reservations
- `fifo_reservation_allocations`(`id, tenant_id, reservation_id, fifo_layer_id, reserved_quantity, unit_cost_snapshot, status, allocated_at, released_at, consumed_at`) — c=chk_fifo_allocation_qty; i=idx_active_fifo_allocations
- `fifo_consumptions`(`id, tenant_id, branch_id, product_id, fifo_layer_id, quantity_consumed, unit_cost, total_cost, source_type, source_id, consumed_at`) — c=chk_fifo_consumption_qty,fk; i=idx_fifo_consumptions_source
- `inventory_adjustments`(`id, tenant_id, branch_id, adjustment_number, status, reason, value_impact, approval_required, requested_by_user_id, approved_by_user_id, posted_at, created_at`) — c=fk,unique(tenant_id,adjustment_number); i=idx_inventory_adjustments_pending
- `inventory_adjustment_lines`(`id, tenant_id, adjustment_id, product_id, adjustment_type, quantity_difference, final_counted_quantity, unit_cost, estimated_fifo_cost`) — c=chk_inventory_adjustment_line_value
- `inventory_adjustment_status_events`(`id, tenant_id, adjustment_id, from_status, to_status, reason, created_by_user_id, created_at`)
- `inventory_transfers`(`id, tenant_id, transfer_number, source_branch_id, destination_branch_id, status, created_by_user_id, sent_by_user_id, received_by_user_id, sent_at, received_at, remarks, created_at`) — c=chk_transfer_different_branches,fk,unique(tenant_id,transfer_number); i=idx_inventory_transfers_source_status,idx_inventory_transfers_destination_status
- `inventory_transfer_lines`(`id, tenant_id, transfer_id, product_id, requested_quantity, reserved_quantity, sent_quantity, received_quantity, variance_quantity, variance_reason, reservation_id`) — c=chk_transfer_line_non_negative,chk_transfer_line_requested
- `inventory_transfer_status_events`(`id, tenant_id, transfer_id, from_status, to_status, reason, created_by_user_id, created_at`)

### 11. Suppliers, Purchases, Supplier Returns, AP

- `suppliers`(`id, tenant_id, name, normalized_name, contact_person, mobile_number, email, address, notes, status, created_at, updated_at`) — i=ux_suppliers_active_name
- `purchase_orders`(`id, tenant_id, branch_id, supplier_id, purchase_order_number, status, payment_terms, order_date, expected_receive_date, created_by_user_id, created_at, updated_at`) — c=chk_purchase_payment_terms,fk,unique(tenant_id,purchase_order_number); i=idx_purchase_orders_branch_status
- `purchase_order_lines`(`id, tenant_id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_cost, line_total, notes`) — c=chk_po_line_cost,chk_po_line_qty
- `purchase_receivings`(`id, tenant_id, branch_id, purchase_order_id, supplier_id, received_at, received_by_user_id, payment_method, payment_reference, posted_at`) — c=fk
- `purchase_receiving_lines`(`id, tenant_id, receiving_id, purchase_order_line_id, product_id, received_quantity, received_unit_cost, fifo_layer_id`) — c=chk_receiving_line_qty
- `supplier_payables`(`id, tenant_id, supplier_id, branch_id, source_type, source_id, amount_delta, occurred_at`) — i=idx_supplier_payables_supplier
- `supplier_payments`(`id, tenant_id, supplier_id, amount, payment_date, payment_method, reference_number, notes, created_by_user_id, created_at`) — c=chk_supplier_payment_amount
- `supplier_credits`(`id, tenant_id, supplier_id, branch_id, amount, reason, source_type, source_id, created_by_user_id, created_at`) — c=chk_supplier_credit_amount
- `supplier_returns`(`id, tenant_id, branch_id, supplier_id, original_receiving_id, status, reason, financial_value, supplier_credit_id, posted_at, created_by_user_id, created_at`) — c=fk
- `supplier_return_lines`(`id, tenant_id, supplier_return_id, product_id, returned_quantity, unit_cost, total_cost`) — c=chk_supplier_return_line_amounts

### 12. Invoices, Billing Allocations, Payments, Receipts, Refunds, AR

- `invoices`(`id, tenant_id, branch_id, customer_id, invoice_number, invoice_date, due_date, status, tax_profile, tax_mode, vat_rate, subtotal_amount, discount_amount, tax_amount, total_amount, amount_paid, amount_refunded, remaining_collectible_balance, discount_reason, issued_at, cancelled_at, voided_at, refunded_at, created_by_user_id, created_at, updated_at, lock_version`) — c=chk_invoice_amounts,fk,unique(tenant_id,invoice_number); i=idx_invoices_list,idx_invoices_ar_due
- `invoice_job_orders`(`id, tenant_id, invoice_id, job_order_id, created_at`) — c=unique(tenant_id,invoice_id,job_order_id)
- `invoice_lines`(`id, tenant_id, invoice_id, originating_job_order_line_id, line_type, product_id, service_id, description, quantity, unit_price, line_discount_amount, allocated_invoice_discount_amount, taxable_base_amount, tax_amount, line_total, line_order`) — c=chk_invoice_line_non_negative; i=idx_invoice_lines_report
- `invoice_billing_allocations`(`id, tenant_id, invoice_id, invoice_line_id, job_order_line_id, allocated_quantity, allocated_amount, status, created_at, updated_at`) — c=chk_billing_allocation_value; i=idx_billing_allocations_line_status
- `invoice_status_events`(`id, tenant_id, invoice_id, from_status, to_status, reason, created_by_user_id, created_at`)
- `payments`(`id, tenant_id, invoice_id, amount, refundable_amount, payment_date, payment_method, reference_number, notes, created_by_user_id, created_at`) — c=chk_payment_amount_positive; i=idx_payments_invoice,idx_payments_report_date
- `receipts`(`id, tenant_id, invoice_id, payment_id, receipt_number, amount, payment_method, issued_at, created_by_user_id`) — c=chk_receipt_amount,unique(tenant_id,receipt_number)
- `refunds`(`id, tenant_id, invoice_id, payment_id, amount, reason, collection_should_continue, close_invoice_after_refund, inventory_reversal_selected, status, created_by_user_id, created_at`) — c=chk_refund_amount_positive; i=idx_refunds_payment,idx_refunds_report_date

### 13. Expenses

- `expense_categories`(`id, tenant_id, name, normalized_name, status, created_at`) — i=ux_expense_categories_active_name
- `expenses`(`id, tenant_id, branch_id, category_id, expense_date, amount, payment_method, reference_number, description, status, void_reason, created_by_user_id, created_at, updated_at`) — c=chk_expense_amount,fk; i=idx_expenses_report_date
- `expense_status_events`(`id, tenant_id, expense_id, from_status, to_status, reason, before_json, after_json, created_by_user_id, created_at`)

### 14. Reminders and Notifications

- `notification_templates`(`id, tenant_id, template_type, channel, subject, body, status, created_at`)
- `customer_reminders`(`id, tenant_id, customer_id, motorcycle_id, job_order_id, reminder_type, status, due_date, due_mileage, message_snapshot, created_by_user_id, scheduled_for, sent_at, cancelled_at, created_at`) — i=idx_customer_reminders_due
- `reminder_deliveries`(`id, tenant_id, reminder_id, channel, destination, status, attempt_count, sent_at, failure_reason, created_at`)
- `notification_outbox`(`id, tenant_id, recipient_type, recipient_id, channel, destination, subject, body, status, scheduled_for, attempt_count, next_attempt_at, created_at`) — i=idx_notification_outbox_due
- `notification_attempts`(`id, notification_outbox_id, attempt_number, provider, provider_message_id, status, response_json, attempted_at`) — c=unique(notification_outbox_id,attempt_number)
- `in_app_notifications`(`id, tenant_id, user_id, type, title, body, read_at, dismissed_at, created_at`) — i=idx_in_app_notifications_unread

### 15. Files, Exports, Offline Cache

- `files`(`id, tenant_id, storage_provider, bucket, object_key, original_filename, content_type, size_bytes, status, malware_scan_status, uploaded_by_user_id, uploaded_at, deleted_at, permanent_delete_after`) — c=check,chk_file_size,unique(storage_provider,bucket,object_key); i=idx_files_tenant_status
- `file_links`(`id, tenant_id, file_id, entity_type, entity_id, purpose, linked_at`) — i=idx_file_links_entity
- `tenant_export_jobs`(`id, tenant_id, requested_by_user_id, status, include_attachments, include_soft_deleted, requested_at, started_at, completed_at, expires_at, failure_reason`) — i=idx_tenant_export_jobs_tenant_status
- `tenant_export_files`(`id, tenant_id, export_job_id, file_id, manifest_json, row_counts_json, created_at`) — c=check
- `tenant_export_included_attachments`(`id, tenant_id, export_job_id, source_file_id, export_path, included, failure_reason`)
- `offline_cache_manifests`(`id, tenant_id, user_id, scope_hash, generated_at, expires_at, etag, record_counts_json`)
- `sync_versions`(`tenant_id, entity_type, branch_id, version_number, updated_at`) — c=pk(tenant_id,entity_type,branch_id)

### 16. Audit, Idempotency, Background Jobs, Operations

- `audit_logs`(`id, tenant_id, actor_user_id, actor_type, support_access_session_id, action, entity_type, entity_id, branch_id, before_json, after_json, metadata_json, reason, ip_address, user_agent, retention_class, created_at`) — i=idx_audit_logs_tenant_time,idx_audit_logs_entity
- `platform_audit_logs`(`id, platform_admin_user_id, tenant_id, action, entity_type, entity_id, metadata_json, ip_address, user_agent, created_at`)
- `audit_retention_policies`(`retention_class, retention_days, description`) — c=chk_audit_retention_minimum
- `idempotency_keys`(`id, tenant_id, user_id, endpoint, request_intent_hash, idempotency_key_hash, status, response_status_code, response_body_json, locked_until, created_at, expires_at`) — c=unique(tenant_id,user_id,endpoint,request_intent_hash,idempotency_key_hash)
- `document_sequences`(`tenant_id, sequence_type, sequence_date, last_value, updated_at`) — c=pk(tenant_id,sequence_type,sequence_date)
- `background_jobs`(`id, tenant_id, job_type, status, payload_json, run_after, attempt_count, max_attempts, locked_by, locked_until, created_at, started_at, completed_at, failed_at, last_error, correlation_id`) — i=idx_background_jobs_due
- `background_job_attempts`(`id, job_id, attempt_number, started_at, finished_at, status, error_message, metadata_json`) — c=unique(job_id,attempt_number)
- `outbox_events`(`id, tenant_id, event_type, aggregate_type, aggregate_id, payload_json, status, created_at, published_at`) — i=idx_outbox_events_pending
- `rate_limit_events`(`id, tenant_id, user_id, key, endpoint_category, ip_address, occurred_at, metadata_json`)
- `integration_events`(`id, tenant_id, provider, integration_type, operation, status, request_id, response_json, error_message, occurred_at`)

### 17. Reporting Read Models

- `report_daily_sales`(`tenant_id, branch_id, report_date, gross_revenue, discounts, tax_amount, net_revenue, refund_amount, created_at, updated_at`) — c=pk(tenant_id,branch_id,report_date)
- `report_daily_payments`(`tenant_id, branch_id, report_date, payment_method, collected_amount, refunded_amount, net_collected_amount`) — c=pk(tenant_id,branch_id,report_date,payment_method)
- `report_stock_valuation_snapshots`(`tenant_id, branch_id, product_id, snapshot_date, quantity_on_hand, stock_value`) — c=pk(tenant_id,branch_id,product_id,snapshot_date)
- `dashboard_snapshots`(`id, tenant_id, branch_id, snapshot_type, snapshot_date, metrics_json, generated_at`) — i=idx_dashboard_snapshots_lookup

### 18. Search Read Models

- `customer_search_documents`(`tenant_id, customer_id, search_vector, search_text, updated_at`) — c=pk(tenant_id,customer_id); i=idx_customer_search_vector,idx_customer_search_trgm
- `product_search_documents`(`tenant_id, product_id, search_vector, search_text, updated_at`) — c=pk(tenant_id,product_id); i=idx_product_search_vector,idx_product_search_trgm

## 5. Critical Transactions

- Document numbers: lock `document_sequences`.
- Invoice draft/update/issue: lock invoice, lines, billing allocations, source job-order lines.
- Payment + receipt: lock invoice, payment, receipt, sequence rows.
- Refund: lock payment, invoice, refund, optional stock/FIFO rows.
- Job completion and inventory reservation/release: lock job/reservation, stock, FIFO, allocation, and ledger rows.
- Adjustment posting, purchase receiving, supplier return, transfer receive/cancel: lock workflow rows plus stock/FIFO/AP/credit rows affected.
- Tenant deletion: lock deletion job and tenant-owned records/manifests.

## 6. Index / Performance Rules

- High-volume tenant tables need leading `tenant_id` indexes.
- Branch lists need `(tenant_id, branch_id, status, created_at desc)` or equivalent.
- Large ledgers use keyset pagination on `(tenant_id, branch_id, occurred_at, id)`.
- Reports use tenant/branch/status/date predicates.
- Trigram/FTS complements, not replaces, exact normalized lookup indexes.
- Partition-ready growth tables: `inventory_ledger_entries`, `fifo_consumptions`, `audit_logs`, `notification_attempts`, `background_job_attempts`.

## 7. Immutability / RLS

- Trigger-protect append-only candidates: `inventory_ledger_entries`, `fifo_consumptions`, `payments`, `receipts`, `refunds`, `audit_logs`, `platform_audit_logs`, `notification_attempts`, `*_status_events`, `supplier_payables`.
- RLS is recommended defense-in-depth; service/repository tenant scoping remains mandatory.
- Platform support access must use `platform_support_access_sessions` and audit logs.

## 8. Seed Data

- Platform: plans `basic`, `mid`, `high`; plan limits; PRD permission codes; audit retention minimum `1095` days.
- Tenant onboarding: role templates Shop Owner, Manager, Service Advisor, Mechanic, Cashier, Inventory Clerk; product categories Engine Oil, Tires, Accessories, Brake Parts, CVT Parts, Lubricants; notification templates when finalized.

## 9. QA Acceptance Checklist

- Prove tenant isolation, branch access, duplicate-number safety, no invoice overpayment/overbilling, no over-refunds, receipt immutability, no negative stock, on-hand not below reserved, FIFO allocation/consumption correctness, AP behavior for credit vs cash purchases, supplier return accounting, transfer FIFO preservation, tenant lifecycle write blocking, immutable audits, tenant export attachments, and deletion retention behavior.

## 10. Remaining Engineering Decisions

- ORM/migrations, UUIDv7 generation, enum implementation style, RLS timing, immutability trigger timing, report read model strategy, append-only partitioning threshold.

## 11. Recommended Migration Order

1. Extensions/enums/utilities → 2. platform/tenants/plans/subscriptions → 3. users/auth/RBAC → 4. shop/branches → 5. customers/motorcycles/files → 6. services/estimates/jobs/sessions → 7. products/stock/FIFO/reservations/ledger → 8. adjustments/transfers → 9. suppliers/purchases/returns/AP → 10. invoices/billing/payments/receipts/refunds → 11. expenses → 12. reminders/notifications/outbox → 13. audit/idempotency/jobs/ops → 14. export/offline/report/search → 15. RLS/immutability/index/partition prep.
