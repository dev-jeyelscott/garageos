exports.up = async (pgm) => {
  pgm.sql(`
    alter table tenants
      add column duplicate_approved_at timestamptz,
      add column duplicate_approved_by_platform_admin_user_id uuid,
      add column duplicate_approval_reason text;

    alter table tenants
      add constraint chk_tenants_duplicate_approval_complete
      check (
        (
          duplicate_approved_at is null
          and duplicate_approved_by_platform_admin_user_id is null
          and duplicate_approval_reason is null
        )
        or
        (
          duplicate_approved_at is not null
          and duplicate_approved_by_platform_admin_user_id is not null
          and duplicate_approval_reason is not null
          and char_length(trim(duplicate_approval_reason)) > 0
        )
      );

    drop index if exists ux_tenants_active_business_email;

    create unique index ux_tenants_unapproved_business_email
      on tenants(normalized_business_name, normalized_shop_email)
      where status <> 'deleted'
        and duplicate_approved_at is null;

    create index idx_tenants_duplicate_approval
      on tenants(
        duplicate_approved_by_platform_admin_user_id,
        duplicate_approved_at
      )
      where duplicate_approved_at is not null;
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    do $$
    begin
      if exists (
        select 1
        from tenants
        where status <> 'deleted'
        group by normalized_business_name, normalized_shop_email
        having count(*) > 1
      ) then
        raise exception
          'Cannot roll back tenant duplicate approval schema while non-deleted duplicate tenants exist.';
      end if;
    end $$;

    drop index if exists idx_tenants_duplicate_approval;
    drop index if exists ux_tenants_unapproved_business_email;

    alter table tenants
      drop constraint if exists chk_tenants_duplicate_approval_complete;

    alter table tenants
      drop column if exists duplicate_approval_reason,
      drop column if exists duplicate_approved_by_platform_admin_user_id,
      drop column if exists duplicate_approved_at;

    create unique index ux_tenants_active_business_email
      on tenants(normalized_business_name, normalized_shop_email)
      where status <> 'deleted';
  `);
};
