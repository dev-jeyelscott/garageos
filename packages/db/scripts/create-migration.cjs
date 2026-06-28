const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '../migrations');
const rawName = process.argv.slice(2).join('-').trim();

if (!rawName) {
  console.error('Migration name is required.');
  console.error('Usage: pnpm db:migration:new estimates-baseline-alignment');
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

const safeName = rawName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

if (!safeName) {
  console.error('Migration name must contain at least one letter or number.');
  process.exit(1);
}

const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.js'));

const migrationTimestamps = migrationFiles
  .map((file) => Number(file.split('_')[0]))
  .filter((timestamp) => Number.isSafeInteger(timestamp));

const highestExistingTimestamp =
  migrationTimestamps.length === 0 ? 0 : Math.max(...migrationTimestamps);

const nextTimestamp = Math.max(Date.now(), highestExistingTimestamp + 1);

const filename = `${nextTimestamp}_${safeName}.js`;
const filepath = path.join(migrationsDir, filename);

const content = `exports.up = (pgm) => {
  pgm.sql(\`
    -- Add migration SQL here.
  \`);
};

exports.down = (pgm) => {
  pgm.sql(\`
    -- Add rollback SQL here.
  \`);
};
`;

fs.writeFileSync(filepath, content, { encoding: 'utf8', flag: 'wx' });

console.log(`Created migration: packages/db/migrations/${filename}`);
