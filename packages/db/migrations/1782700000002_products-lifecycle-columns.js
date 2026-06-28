exports.up = (pgm) => {
  pgm.sql(`
    alter table products
      add column if not exists deactivated_at timestamptz,
      add column if not exists reactivated_at timestamptz;
  `);
};
