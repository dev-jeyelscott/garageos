exports.up = async (pgm) => {
  pgm.sql(`
    alter table services
      add constraint ux_services_tenant_id
      unique (tenant_id, id);

    create table invoices (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      customer_id uuid not null references customers(id),
      invoice_number text not null,
      invoice_date date not null,
      due_date date,
      status text not null default 'draft',
      tax_profile text,
      tax_mode text,
      vat_rate numeric(5,4),
      subtotal_amount numeric(14,2) not null default 0,
      discount_amount numeric(14,2) not null default 0,
      tax_amount numeric(14,2) not null default 0,
      total_amount numeric(14,2) not null default 0,
      amount_paid numeric(14,2) not null default 0,
      amount_refunded numeric(14,2) not null default 0,
      remaining_collectible_balance numeric(14,2) not null default 0,
      discount_reason text,
      issued_at timestamptz,
      cancelled_at timestamptz,
      voided_at timestamptz,
      refunded_at timestamptz,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      lock_version integer not null default 0,

      unique(tenant_id, id),
      unique(tenant_id, invoice_number),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_invoice_status check (
        status in (
          'draft',
          'pending',
          'partially_paid',
          'paid',
          'overdue',
          'cancelled',
          'voided',
          'refunded'
        )
      ),

      constraint chk_invoice_tax_profile check (
        tax_profile is null
        or tax_profile in ('vat_registered', 'non_vat', 'no_tax')
      ),

      constraint chk_invoice_tax_mode check (
        tax_mode is null
        or tax_mode in ('tax_inclusive', 'tax_exclusive', 'no_tax')
      ),

      constraint chk_invoice_tax_combo check (
        tax_profile is null
        or tax_mode is null
        or (
          tax_profile = 'vat_registered'
          and tax_mode in ('tax_inclusive', 'tax_exclusive')
        )
        or (
          tax_profile in ('non_vat', 'no_tax')
          and tax_mode = 'no_tax'
        )
      ),

      constraint chk_invoice_vat_rate check (
        vat_rate is null
        or vat_rate >= 0
      ),

      constraint chk_invoice_due_date check (
        due_date is null
        or due_date >= invoice_date
      ),

      constraint chk_invoice_amounts check (
        subtotal_amount >= 0
        and discount_amount >= 0
        and tax_amount >= 0
        and total_amount >= 0
        and amount_paid >= 0
        and amount_refunded >= 0
        and remaining_collectible_balance >= 0
      ),

      constraint chk_invoice_cancelled_at check (
        status <> 'cancelled'
        or cancelled_at is not null
      ),

      constraint chk_invoice_voided_at check (
        status <> 'voided'
        or voided_at is not null
      ),

      constraint chk_invoice_refunded_at check (
        status <> 'refunded'
        or refunded_at is not null
      )
    );

    create index idx_invoices_list
      on invoices(
        tenant_id,
        branch_id,
        status,
        invoice_date desc
      );

    create index idx_invoices_customer
      on invoices(
        tenant_id,
        customer_id,
        invoice_date desc
      );

    create index idx_invoices_ar_due
      on invoices(
        tenant_id,
        branch_id,
        due_date,
        status
      )
      where remaining_collectible_balance > 0;

    create table invoice_job_orders (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      job_order_id uuid not null,
      created_at timestamptz not null default now(),

      unique(tenant_id, invoice_id, job_order_id),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      foreign key (tenant_id, job_order_id)
        references job_orders(tenant_id, id)
    );

    create index idx_invoice_job_orders_invoice
      on invoice_job_orders(tenant_id, invoice_id);

    create index idx_invoice_job_orders_job_order
      on invoice_job_orders(tenant_id, job_order_id);

    create table invoice_lines (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      originating_job_order_line_id uuid,
      line_type text not null,
      product_id uuid,
      service_id uuid,
      description text not null,
      quantity numeric(14,3) not null default 1,
      unit_price numeric(14,2) not null default 0,
      line_discount_amount numeric(14,2) not null default 0,
      allocated_invoice_discount_amount numeric(14,2) not null default 0,
      taxable_base_amount numeric(14,2) not null default 0,
      tax_amount numeric(14,2) not null default 0,
      line_total numeric(14,2) not null default 0,
      line_order integer not null default 0,

      unique(tenant_id, id),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      foreign key (tenant_id, originating_job_order_line_id)
        references job_order_lines(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      foreign key (tenant_id, service_id)
        references services(tenant_id, id),

      constraint chk_invoice_line_type check (
        line_type in ('service', 'labor', 'part', 'custom')
      ),

      constraint chk_invoice_line_description check (
        char_length(trim(description)) > 0
      ),

      constraint chk_invoice_line_part_product check (
        line_type <> 'part'
        or product_id is not null
      ),

      constraint chk_invoice_line_non_negative check (
        quantity > 0
        and unit_price >= 0
        and line_discount_amount >= 0
        and allocated_invoice_discount_amount >= 0
        and taxable_base_amount >= 0
        and tax_amount >= 0
        and line_total >= 0
      )
    );

    create index idx_invoice_lines_invoice_order
      on invoice_lines(tenant_id, invoice_id, line_order);

    create index idx_invoice_lines_report
      on invoice_lines(
        tenant_id,
        invoice_id,
        line_type,
        product_id,
        service_id
      );

    create index idx_invoice_lines_job_order_line
      on invoice_lines(tenant_id, originating_job_order_line_id)
      where originating_job_order_line_id is not null;

    create table invoice_billing_allocations (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      invoice_line_id uuid not null,
      job_order_line_id uuid not null,
      allocated_quantity numeric(14,3),
      allocated_amount numeric(14,2),
      status text not null default 'reserved',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      foreign key (tenant_id, invoice_line_id)
        references invoice_lines(tenant_id, id),

      foreign key (tenant_id, job_order_line_id)
        references job_order_lines(tenant_id, id),

      constraint chk_billing_allocation_status check (
        status in ('reserved', 'final', 'released', 'closed')
      ),

      constraint chk_billing_allocation_value check (
        allocated_quantity is not null
        or allocated_amount is not null
      ),

      constraint chk_billing_allocation_non_negative check (
        (allocated_quantity is null or allocated_quantity > 0)
        and
        (allocated_amount is null or allocated_amount > 0)
      )
    );

    create index idx_billing_allocations_line_status
      on invoice_billing_allocations(
        tenant_id,
        job_order_line_id,
        status
      );

    create index idx_billing_allocations_invoice
      on invoice_billing_allocations(tenant_id, invoice_id);

    create table invoice_status_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      from_status text,
      to_status text not null,
      reason text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      constraint chk_invoice_status_events_from_status check (
        from_status is null
        or from_status in (
          'draft',
          'pending',
          'partially_paid',
          'paid',
          'overdue',
          'cancelled',
          'voided',
          'refunded'
        )
      ),

      constraint chk_invoice_status_events_to_status check (
        to_status in (
          'draft',
          'pending',
          'partially_paid',
          'paid',
          'overdue',
          'cancelled',
          'voided',
          'refunded'
        )
      )
    );

    create index idx_invoice_status_events_invoice_time
      on invoice_status_events(
        tenant_id,
        invoice_id,
        created_at desc
      );

    create table payments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      amount numeric(14,2) not null,
      refundable_amount numeric(14,2) not null,
      payment_date date not null,
      payment_method text not null,
      reference_number text,
      notes text,
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      constraint chk_payment_amount_positive check (
        amount > 0
        and refundable_amount >= 0
        and refundable_amount <= amount
      ),

      constraint chk_payment_method check (
        payment_method in (
          'cash',
          'gcash',
          'maya',
          'bank_transfer',
          'credit_card',
          'check',
          'other'
        )
      )
    );

    create index idx_payments_invoice
      on payments(tenant_id, invoice_id, created_at desc);

    create index idx_payments_report_date
      on payments(tenant_id, payment_date, payment_method);

    create table receipts (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      payment_id uuid not null unique,
      receipt_number text not null,
      amount numeric(14,2) not null,
      payment_method text not null,
      issued_at timestamptz not null default now(),
      created_by_user_id uuid references users(id),

      unique(tenant_id, id),
      unique(tenant_id, receipt_number),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      foreign key (tenant_id, payment_id)
        references payments(tenant_id, id),

      constraint chk_receipt_amount check (
        amount > 0
      ),

      constraint chk_receipt_payment_method check (
        payment_method in (
          'cash',
          'gcash',
          'maya',
          'bank_transfer',
          'credit_card',
          'check',
          'other'
        )
      )
    );

    create index idx_receipts_invoice
      on receipts(tenant_id, invoice_id, issued_at desc);

    create table refunds (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      invoice_id uuid not null,
      payment_id uuid not null,
      amount numeric(14,2) not null,
      reason text not null,
      collection_should_continue boolean not null default true,
      close_invoice_after_refund boolean not null default false,
      inventory_reversal_selected boolean not null default false,
      status text not null default 'posted',
      created_by_user_id uuid references users(id),
      created_at timestamptz not null default now(),

      unique(tenant_id, id),

      foreign key (tenant_id, invoice_id)
        references invoices(tenant_id, id),

      foreign key (tenant_id, payment_id)
        references payments(tenant_id, id),

      constraint chk_refund_amount_positive check (
        amount > 0
      ),

      constraint chk_refund_reason check (
        char_length(trim(reason)) > 0
      ),

      constraint chk_refund_status check (
        status in ('posted', 'voided')
      ),

      constraint chk_refund_close_requires_no_collection check (
        close_invoice_after_refund = false
        or collection_should_continue = false
      )
    );

    create index idx_refunds_payment
      on refunds(tenant_id, payment_id, created_at desc);

    create index idx_refunds_invoice
      on refunds(tenant_id, invoice_id, created_at desc);

    create index idx_refunds_report_date
      on refunds(tenant_id, created_at);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_refunds_report_date;
    drop index if exists idx_refunds_invoice;
    drop index if exists idx_refunds_payment;
    drop table if exists refunds;

    drop index if exists idx_receipts_invoice;
    drop table if exists receipts;

    drop index if exists idx_payments_report_date;
    drop index if exists idx_payments_invoice;
    drop table if exists payments;

    drop index if exists idx_invoice_status_events_invoice_time;
    drop table if exists invoice_status_events;

    drop index if exists idx_billing_allocations_invoice;
    drop index if exists idx_billing_allocations_line_status;
    drop table if exists invoice_billing_allocations;

    drop index if exists idx_invoice_lines_job_order_line;
    drop index if exists idx_invoice_lines_report;
    drop index if exists idx_invoice_lines_invoice_order;
    drop table if exists invoice_lines;

    drop index if exists idx_invoice_job_orders_job_order;
    drop index if exists idx_invoice_job_orders_invoice;
    drop table if exists invoice_job_orders;

    drop index if exists idx_invoices_ar_due;
    drop index if exists idx_invoices_customer;
    drop index if exists idx_invoices_list;
    drop table if exists invoices;

    alter table services
      drop constraint if exists ux_services_tenant_id;
  `);
};
