const { pool } = require('./src/config/database');
const crmService = require('./src/modules/crm/crm.service');

async function run() {
  const user = { nama: 'admindemo', role: 'Admin', selectedPeriod: '2024/2025' };
  const filter = { page: 1, pageSize: 20, search: '', filterStatus: '' };
  
  console.log("Testing getAllSekolah with user:", user, "filter:", filter);
  const result = await crmService.getAllSekolah(user, filter);
  console.log("Result:", JSON.stringify(result, null, 2));
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
