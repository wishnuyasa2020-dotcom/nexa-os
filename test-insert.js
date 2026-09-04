const { pool } = require('./src/config/database');
pool.query(`
  INSERT INTO chat_messages 
  (conv_id, timestamp, datetime, direction, from_phone, from_name, type, body, status) 
  VALUES ('CONV-TEST', 12345, NOW(), 'outgoing', 'system', 'Admin', 'text', 'test', 'sent')
`).then(() => console.log('Insert OK')).catch(e => console.error('Insert Error:', e.message)).finally(() => process.exit(0));
