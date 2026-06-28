exports.up = (pgm) => {
  pgm.sql(`
    alter table estimates
      add column if not exists updated_by_user_id uuid references users(id);

    alter table estimates
      add column if not exists lock_version integer not null default 0;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_estimates_status'
      ) then
        alter table estimates
          add constraint chk_estimates_status
          check (status in ('draft','presented','approved','converted','cancelled','expired'));
      end if;
    end
    $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_estimates_approval_method'
      ) then
        alter table estimates
          add constraint chk_estimates_approval_method
          check (
            approval_method is null
            or approval_method in ('verbal','sms','email','signed_document','other')
          );
      end if;
    end
    $$;

    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'chk_estimate_lines_type'
      ) then
        alter table estimate_lines
          add constraint chk_estimate_lines_type
          check (line_type in ('service','labor','part'));
      end if;
    end
    $$;

    create index if not exists idx_estimates_customer
      on estimates(tenant_id, customer_id, created_at desc);

    create index if not exists idx_estimates_motorcycle
      on estimates(tenant_id, motorcycle_id, created_at desc)
      where motorcycle_id is not null;

    create index if not exists idx_estimate_lines_estimate_order
      on estimate_lines(tenant_id, estimate_id, line_order);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    drop index if exists idx_estimate_lines_estimate_order;
    drop index if exists idx_estimates_motorcycle;
    drop index if exists idx_estimates_customer;

    alter table estimate_lines
      drop constraint if exists chk_estimate_lines_type;

    alter table estimates
      drop constraint if exists chk_estimates_approval_method;

    alter table estimates
      drop constraint if exists chk_estimates_status;

    alter table estimates
      drop column if exists lock_version;

    alter table estimates
      drop column if exists updated_by_user_id;
  `);
};
