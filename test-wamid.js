const { pool, tenantStorage } = require('./src/config/database');
tenantStorage.run('derma-indonesia', async () => {
  try {
    const [rows] = await pool.query("SELECT message_id, body FROM chat_messages WHERE direction = 'outgoing' ORDER BY timestamp DESC LIMIT 10");
    console.log(rows);
  } finally {
    pool.end();
  }
});
