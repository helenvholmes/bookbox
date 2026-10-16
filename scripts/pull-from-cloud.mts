/**
 * Copies your hosted library (database and covers) down to this computer.
 *
 *   npm run pull:cloud
 *
 * Uses the keys in .env.cloud. The local database is backed up to data/backups first. See
 * src/lib/pull-cloud.ts for what is and isn't copied.
 */

const { pullFromCloud } = await import("../src/lib/pull-cloud");
const result = await pullFromCloud((line) => console.log(line));
console.log(`Done: ${result.tables.books ?? 0} books, ${result.coversDownloaded} new covers.`);
