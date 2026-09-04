const { pool, tenantStorage } = require('./src/config/database');
tenantStorage.run('derma-indonesia', async () => {
  try {
    const [rows] = await pool.query("SELECT message_id, body, status, datetime FROM chat_messages WHERE direction = 'incoming' ORDER BY timestamp DESC LIMIT 5");
    console.log(rows);
  } finally {
    pool.end();
  }
});
