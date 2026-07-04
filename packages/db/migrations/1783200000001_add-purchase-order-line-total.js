exports.up = (pgm) => {
  pgm.sql(`
    alter table purchase_order_lines
    add column if not exists line_total numeric(14,2)
  `);

  pgm.sql(`
    update purchase_order_lines
    set line_total = round((ordered_quantity * unit_cost)::numeric, 2)
    where line_total is null
  `);

  pgm.sql(`
    alter table purchase_order_lines
    alter column line_total set not null
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    alter table purchase_order_lines
    drop column if exists line_total
  `);
};
