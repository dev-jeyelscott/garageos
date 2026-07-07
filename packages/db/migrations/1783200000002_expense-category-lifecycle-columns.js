exports.up = async (pgm) => {
  pgm.sql(`
    alter table expense_categories
      add column if not exists created_by_user_id uuid references users(id),
      add column if not exists updated_by_user_id uuid references users(id),
      add column if not exists deactivated_at timestamptz,
      add column if not exists reactivated_at timestamptz,
      add column if not exists lock_version integer not null default 0;
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    alter table expense_categories
      drop column if exists lock_version,
      drop column if exists reactivated_at,
      drop column if exists deactivated_at,
      drop column if exists updated_by_user_id,
      drop column if exists created_by_user_id;
  `);
};
