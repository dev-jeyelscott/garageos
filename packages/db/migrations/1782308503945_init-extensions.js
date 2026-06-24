exports.up = async (pgm) => {
  pgm.sql(`
    create extension if not exists pg_trgm;
    create extension if not exists unaccent;
    create extension if not exists pgcrypto;
  `);
};

exports.down = async (pgm) => {
  pgm.sql(`
    drop extension if exists pgcrypto;
    drop extension if exists unaccent;
    drop extension if exists pg_trgm;
  `);
};
