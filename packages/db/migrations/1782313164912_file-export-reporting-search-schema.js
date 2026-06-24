exports.up = async (pgm) => {
  pgm.sql(`
    create table files (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      storage_provider text not null,
      bucket text not null,
      object_key text not null,
      original_filename text not null,
      content_type text not null,
      size_bytes bigint not null,
      checksum_sha256 text,
      status text not null default 'active',
      malware_scan_status text,
      uploaded_by_user_id uuid references users(id),
      uploaded_at timestamptz not null default now(),
      deleted_at timestamptz,
      permanent_delete_after timestamptz,

      unique(tenant_id, id),
      unique(storage_provider, bucket, object_key),

      constraint chk_file_storage_provider check (
        char_length(trim(storage_provider)) > 0
      ),

      constraint chk_file_bucket check (
        char_length(trim(bucket)) > 0
      ),

      constraint chk_file_object_key check (
        char_length(trim(object_key)) > 0
      ),

      constraint chk_file_original_filename check (
        char_length(trim(original_filename)) > 0
      ),

      constraint chk_file_content_type check (
        char_length(trim(content_type)) > 0
      ),

      constraint chk_file_size check (
        size_bytes > 0
      ),

      constraint chk_file_status check (
        status in (
          'active',
          'soft_deleted',
          'retained',
          'quarantined',
          'deleted'
        )
      ),

      constraint chk_file_malware_scan_status check (
        malware_scan_status is null
        or malware_scan_status in (
          'pending',
          'clean',
          'infected',
          'skipped',
          'failed'
        )
      ),

      constraint chk_file_deleted_at check (
        status not in ('soft_deleted', 'deleted')
        or deleted_at is not null
      )
    );

    create index idx_files_tenant_status
      on files(tenant_id, status, uploaded_at desc);

    create index idx_files_uploaded_by
      on files(tenant_id, uploaded_by_user_id, uploaded_at desc)
      where uploaded_by_user_id is not null;

    alter table shop_profiles
      add constraint fk_shop_profiles_logo_file
      foreign key (tenant_id, logo_file_id)
      references files(tenant_id, id);

    create table file_links (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      file_id uuid not null,
      entity_type text not null,
      entity_id uuid not null,
      purpose text,
      linked_at timestamptz not null default now(),

      foreign key (tenant_id, file_id)
        references files(tenant_id, id),

      constraint chk_file_link_entity_type check (
        char_length(trim(entity_type)) > 0
      )
    );

    create index idx_file_links_entity
      on file_links(tenant_id, entity_type, entity_id);

    create index idx_file_links_file
      on file_links(tenant_id, file_id);

    create table tenant_export_jobs (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      requested_by_user_id uuid not null references users(id),
      status text not null default 'queued',
      include_attachments boolean not null default true,
      include_soft_deleted boolean not null default false,
      metadata_only boolean not null default false,
      requested_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz,
      expires_at timestamptz,
      failure_reason text,
      background_job_id uuid references background_jobs(id),

      unique(tenant_id, id),

      constraint chk_tenant_export_status check (
        status in (
          'queued',
          'running',
          'succeeded',
          'failed',
          'cancelled'
        )
      ),

      constraint chk_tenant_export_completed_at check (
        status <> 'succeeded'
        or completed_at is not null
      ),

      constraint chk_tenant_export_failed_reason check (
        status <> 'failed'
        or failure_reason is not null
      ),

      constraint chk_tenant_export_metadata_only check (
        metadata_only = false
        or include_attachments = false
      )
    );

    create index idx_tenant_export_jobs_tenant_status
      on tenant_export_jobs(tenant_id, status, requested_at desc);

    create index idx_tenant_export_jobs_background_job
      on tenant_export_jobs(background_job_id)
      where background_job_id is not null;

    create table tenant_export_files (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      export_job_id uuid not null,
      file_id uuid,
      manifest_json jsonb not null,
      row_counts_json jsonb,
      checksum_sha256 text,
      created_at timestamptz not null default now(),

      foreign key (tenant_id, export_job_id)
        references tenant_export_jobs(tenant_id, id),

      foreign key (tenant_id, file_id)
        references files(tenant_id, id),

      constraint chk_tenant_export_file_manifest check (
        jsonb_typeof(manifest_json) = 'object'
      )
    );

    create index idx_tenant_export_files_job
      on tenant_export_files(tenant_id, export_job_id);

    create table tenant_export_included_attachments (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      export_job_id uuid not null,
      source_file_id uuid not null,
      export_path text not null,
      included boolean not null,
      failure_reason text,

      foreign key (tenant_id, export_job_id)
        references tenant_export_jobs(tenant_id, id),

      foreign key (tenant_id, source_file_id)
        references files(tenant_id, id),

      constraint chk_export_attachment_path check (
        char_length(trim(export_path)) > 0
      ),

      constraint chk_export_attachment_failure_reason check (
        included = true
        or (
          failure_reason is not null
          and char_length(trim(failure_reason)) > 0
        )
      )
    );

    create index idx_export_included_attachments_job
      on tenant_export_included_attachments(tenant_id, export_job_id);

    create index idx_export_included_attachments_file
      on tenant_export_included_attachments(tenant_id, source_file_id);

    create table offline_cache_manifests (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      user_id uuid not null references users(id),
      scope_hash text not null,
      generated_at timestamptz not null default now(),
      expires_at timestamptz not null,
      etag text not null,
      record_counts_json jsonb not null,

      constraint chk_offline_cache_scope_hash check (
        char_length(trim(scope_hash)) > 0
      ),

      constraint chk_offline_cache_etag check (
        char_length(trim(etag)) > 0
      ),

      constraint chk_offline_cache_expiry check (
        expires_at > generated_at
      ),

      constraint chk_offline_cache_record_counts check (
        jsonb_typeof(record_counts_json) = 'object'
      )
    );

    create unique index ux_offline_cache_manifest_scope
      on offline_cache_manifests(tenant_id, user_id, scope_hash);

    create index idx_offline_cache_manifests_user
      on offline_cache_manifests(tenant_id, user_id, generated_at desc);

    create table sync_versions (
      tenant_id uuid not null references tenants(id),
      entity_type text not null,
      branch_id uuid,
      version_number bigint not null default 1,
      updated_at timestamptz not null default now(),

      primary key(tenant_id, entity_type, branch_id),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_sync_versions_entity_type check (
        char_length(trim(entity_type)) > 0
      ),

      constraint chk_sync_versions_number check (
        version_number > 0
      )
    );

    create table report_daily_sales (
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      report_date date not null,
      gross_revenue numeric(14,2) not null default 0,
      discounts numeric(14,2) not null default 0,
      tax_amount numeric(14,2) not null default 0,
      net_revenue numeric(14,2) not null default 0,
      refund_amount numeric(14,2) not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      primary key(tenant_id, branch_id, report_date),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_report_daily_sales_amounts check (
        gross_revenue >= 0
        and discounts >= 0
        and tax_amount >= 0
        and net_revenue >= 0
        and refund_amount >= 0
      )
    );

    create index idx_report_daily_sales_date
      on report_daily_sales(tenant_id, report_date desc, branch_id);

    create table report_daily_payments (
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      report_date date not null,
      payment_method text not null,
      collected_amount numeric(14,2) not null default 0,
      refunded_amount numeric(14,2) not null default 0,
      net_collected_amount numeric(14,2) not null default 0,

      primary key(tenant_id, branch_id, report_date, payment_method),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_report_daily_payment_method check (
        payment_method in (
          'cash',
          'gcash',
          'maya',
          'bank_transfer',
          'credit_card',
          'check',
          'other'
        )
      ),

      constraint chk_report_daily_payment_amounts check (
        collected_amount >= 0
        and refunded_amount >= 0
        and net_collected_amount >= 0
      )
    );

    create index idx_report_daily_payments_date
      on report_daily_payments(tenant_id, report_date desc, branch_id);

    create table report_stock_valuation_snapshots (
      tenant_id uuid not null references tenants(id),
      branch_id uuid not null,
      product_id uuid not null,
      snapshot_date date not null,
      quantity_on_hand numeric(14,3) not null,
      stock_value numeric(14,2) not null,

      primary key(tenant_id, branch_id, product_id, snapshot_date),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      foreign key (tenant_id, product_id)
        references products(tenant_id, id),

      constraint chk_report_stock_valuation_values check (
        quantity_on_hand >= 0
        and stock_value >= 0
      )
    );

    create index idx_report_stock_valuation_date
      on report_stock_valuation_snapshots(
        tenant_id,
        snapshot_date desc,
        branch_id
      );

    create table dashboard_snapshots (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid,
      snapshot_type text not null,
      snapshot_date date not null,
      metrics_json jsonb not null,
      generated_at timestamptz not null default now(),

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_dashboard_snapshot_type check (
        char_length(trim(snapshot_type)) > 0
      ),

      constraint chk_dashboard_snapshot_metrics check (
        jsonb_typeof(metrics_json) = 'object'
      )
    );

    create unique index ux_dashboard_snapshots_scope
      on dashboard_snapshots(
        tenant_id,
        coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        snapshot_type,
        snapshot_date
      );

    create index idx_dashboard_snapshots_tenant_date
      on dashboard_snapshots(tenant_id, snapshot_date desc, snapshot_type);

    create table search_documents (
      id uuid primary key default gen_random_uuid(),
      tenant_id uuid not null references tenants(id),
      branch_id uuid,
      entity_type text not null,
      entity_id uuid not null,
      title text not null,
      search_text text not null,
      metadata_json jsonb not null default '{}'::jsonb,
      source_updated_at timestamptz,
      indexed_at timestamptz not null default now(),
      search_vector tsvector generated always as (
        to_tsvector('simple', coalesce(search_text, ''))
      ) stored,

      foreign key (tenant_id, branch_id)
        references branches(tenant_id, id),

      constraint chk_search_document_entity_type check (
        char_length(trim(entity_type)) > 0
      ),

      constraint chk_search_document_title check (
        char_length(trim(title)) > 0
      ),

      constraint chk_search_document_text check (
        char_length(trim(search_text)) > 0
      ),

      constraint chk_search_document_metadata check (
        jsonb_typeof(metadata_json) = 'object'
      )
    );

    create unique index ux_search_documents_entity
      on search_documents(
        tenant_id,
        entity_type,
        entity_id,
        coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      );

    create index idx_search_documents_vector
      on search_documents using gin(search_vector);

    create index idx_search_documents_text_trgm
      on search_documents using gin(search_text gin_trgm_ops);

    create index idx_search_documents_scope
      on search_documents(tenant_id, entity_type, branch_id, indexed_at desc);
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop index if exists idx_search_documents_scope;
    drop index if exists idx_search_documents_text_trgm;
    drop index if exists idx_search_documents_vector;
    drop index if exists ux_search_documents_entity;
    drop table if exists search_documents;

    drop index if exists idx_dashboard_snapshots_tenant_date;
    drop index if exists ux_dashboard_snapshots_scope;
    drop table if exists dashboard_snapshots;

    drop index if exists idx_report_stock_valuation_date;
    drop table if exists report_stock_valuation_snapshots;

    drop index if exists idx_report_daily_payments_date;
    drop table if exists report_daily_payments;

    drop index if exists idx_report_daily_sales_date;
    drop table if exists report_daily_sales;

    drop table if exists sync_versions;

    drop index if exists idx_offline_cache_manifests_user;
    drop index if exists ux_offline_cache_manifest_scope;
    drop table if exists offline_cache_manifests;

    drop index if exists idx_export_included_attachments_file;
    drop index if exists idx_export_included_attachments_job;
    drop table if exists tenant_export_included_attachments;

    drop index if exists idx_tenant_export_files_job;
    drop table if exists tenant_export_files;

    drop index if exists idx_tenant_export_jobs_background_job;
    drop index if exists idx_tenant_export_jobs_tenant_status;
    drop table if exists tenant_export_jobs;

    drop index if exists idx_file_links_file;
    drop index if exists idx_file_links_entity;
    drop table if exists file_links;

    alter table shop_profiles
      drop constraint if exists fk_shop_profiles_logo_file;

    drop index if exists idx_files_uploaded_by;
    drop index if exists idx_files_tenant_status;
    drop table if exists files;
  `);
};
