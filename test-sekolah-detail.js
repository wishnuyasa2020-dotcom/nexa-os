const { pool } = require('./src/config/database');
const crmService = require('./src/modules/crm/crm.service');

async function run() {
  const user = { nama: 'administrator', role: 'Admin', selectedPeriod: '2024/2025' };
  
  console.log("Testing getSekolahById with SKL-2...");
  try {
    const result = await crmService.getSekolahById('SKL-2', '2024/2025', user);
    console.log("Result keys:", Object.keys(result));
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch(err) {
    console.error("ERROR:", err.message);
  }
  process.exit(0);
}
run();
