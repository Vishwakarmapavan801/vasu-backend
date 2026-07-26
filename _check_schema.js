const pool = require('./src/config/database');
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position")
  .then(r => {
    r.rows.forEach(c => console.log(c.column_name, c.data_type));
    process.exit(0);
  })
  .catch(e => { console.log(e.message); process.exit(1); });
