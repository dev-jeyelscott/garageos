const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '../migrations');

if (!fs.existsSync(migrationsDir)) {
  console.error(`Migrations directory does not exist: ${migrationsDir}`);
  process.exit(1);
}

const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.js'))
  .sort();

const errors = [];

let previousTimestamp = 0;
let previousFile = null;

for (const file of migrationFiles) {
  const match = /^(\d+)_([a-z0-9][a-z0-9-]*)\.js$/.exec(file);

  if (!match) {
    errors.push(
      `Invalid migration filename "${file}". Expected format: <timestamp>_<kebab-name>.js`,
    );
    continue;
  }

  const timestamp = Number(match[1]);

  if (!Number.isSafeInteger(timestamp)) {
    errors.push(`Invalid migration timestamp in "${file}".`);
    continue;
  }

  if (timestamp <= previousTimestamp) {
    errors.push(
      `Migration timestamp order violation: "${file}" must be greater than "${previousFile}".`,
    );
  }

  previousTimestamp = timestamp;
  previousFile = file;
}

if (errors.length > 0) {
  console.error('Migration order validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`✓ migration filename order: ${migrationFiles.length} files`);
