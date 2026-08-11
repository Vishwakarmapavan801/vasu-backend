import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ host: 'localhost', port: 5432, database: 'vasu', user: 'postgres', password: 'admin' });
try {
  const { rows } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'user_id'");
  console.log(rows.length ? 'user_id EXISTS' : 'user_id MISSING');
} catch (e) {
  console.error(e.message);
}
await pool.end();
