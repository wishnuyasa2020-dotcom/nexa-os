const { mainPool, _getTenantPool } = require('./src/config/database');

(async () => {
  try {
    const poolDemo = await _getTenantPool('crm-demo');
    const [rowsDemo] = await poolDemo.query("SELECT message_id, body FROM chat_messages WHERE message_id = 'wamid.HBgNNjI4NTY1OTAyNDc3NRUCABIYIEFDRkUzOTc0NkIwRDFFN0IxQjI1OEJGOEFCOUVFMkREAA=='");
    console.log('In Demo:', rowsDemo);

    const poolDerma = await _getTenantPool('derma-indonesia');
    const [rowsDerma] = await poolDerma.query("SELECT message_id, body FROM chat_messages WHERE message_id = 'wamid.HBgNNjI4NTY1OTAyNDc3NRUCABIYIEFDRkUzOTc0NkIwRDFFN0IxQjI1OEJGOEFCOUVFMkREAA=='");
    console.log('In Derma:', rowsDerma);
  } finally {
    process.exit(0);
  }
})();
