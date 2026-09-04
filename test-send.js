const { sendMessage } = require('./src/modules/crm/chat/chat.service');
const { pool, tenantStorage } = require('./src/config/database');

async function test() {
  const user = { id: 1, nama: 'admindemo', role: 'Admin', tenantId: 'derma-indonesia' };
  const payload = { text: 'Test from local script' };
  const convId = 'CONV-1784623261310-293';
  
  tenantStorage.run(user.tenantId, async () => {
    try {
      console.log('Sending message to conv:', convId);
      const result = await sendMessage(convId, payload, user);
      console.log('Result:', result);
    } catch(e) {
      console.error('Error in sendMessage:', e.message);
      console.error(e.stack);
    } finally {
      pool.end();
    }
  });
}
test();
