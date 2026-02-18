
import pg from './node_modules/pg/lib/index.js';
import { readFileSync } from 'fs';
const { Client } = pg;

const encoded = readFileSync('.pgpass_tmp', 'utf8').trim();
const decoded = Buffer.from(encoded, 'base64').toString('utf8');

const client = new Client({
  host: 'localhost',
  user: 'tms_app',
  database: 'tms',
  password: decoded
});

async function main() {
  await client.connect();
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  console.log('=== LOCAL TABLES ===');
  tables.rows.forEach(r => console.log(r.table_name));

  console.log('');
  console.log('=== TABLE COLUMNS ===');
  for (const row of tables.rows) {
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [row.table_name]
    );
    console.log('');
    console.log('--- ' + row.table_name + ' ---');
    cols.rows.forEach(c => console.log('  ' + c.column_name + ' (' + c.data_type + ')'));
  }
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
