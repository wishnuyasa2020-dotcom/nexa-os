const { pool, tenantStorage } = require('./src/config/database');
tenantStorage.run('derma-indonesia', async () => {
  try {
    const [result] = await pool.query(
      "UPDATE chat_messages SET status = ? WHERE message_id = ? OR (direction = 'outgoing' AND from_phone = ? AND status != 'read') LIMIT 1",
      ['read', 'wamid.HBgNNjI4NTY1OTAyNDc3NRUCABEYEkU2QzlERkZBOUREMDlGMEU2RAA=', '6285659024775']
    );
    console.log('Affected rows:', result.affectedRows);
  } catch(e) {
    console.log('Error:', e.message);
  } finally {
    pool.end();
  }
});
