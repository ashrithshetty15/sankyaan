import { runMigrations } from './migrate.js';

console.log('📦 Running database migrations...\n');
runMigrations()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
