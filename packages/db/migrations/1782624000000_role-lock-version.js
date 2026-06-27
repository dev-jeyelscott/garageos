exports.up = async (pgm) => {
  pgm.sql(`
    alter table roles
      add column if not exists lock_version integer not null default 0;

    create index if not exists idx_roles_tenant_status
      on roles(tenant_id, status, normalized_name);
  `);
};
