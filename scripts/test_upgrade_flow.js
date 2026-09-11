'use strict';

const subscriptionService = require('../src/modules/crm/subscription/subscription.service');
const { mainPool } = require('../src/config/database');

async function testUpgradeFlow() {
  const testInvoiceId = `TEST-INV-${Date.now()}`;
  const testTenant = 'crm-demo';

  try {
    console.log('--- 1. Inserting test pending invoice ---');
    await mainPool.query(
      `INSERT INTO billing_history 
        (invoice_id, tenant_id, plan_tier, billing_cycle, amount, status, 
         billing_period_start, billing_period_end, due_date)
       VALUES (?, ?, 'PRO', 'MONTHLY', 500000.00, 'UNPAID', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), CURDATE())`,
      [testInvoiceId, testTenant]
    );

    console.log('--- 2. Executing processPaymentSuccess ---');
    const success = await subscriptionService.processPaymentSuccess({
      invoiceId: testInvoiceId,
      paymentType: 'qris',
      midtransData: { test: true },
    });

    console.log('Payment processed result:', success);

    // 3. Verify database updates
    const [invRows] = await mainPool.query('SELECT * FROM billing_history WHERE invoice_id = ?', [testInvoiceId]);
    console.log('Updated Invoice:', {
      invoice_id: invRows[0].invoice_id,
      status: invRows[0].status,
      payment_type: invRows[0].payment_type,
      payment_date: invRows[0].payment_date,
    });

    const [tenantRows] = await mainPool.query(
      'SELECT tier, billing_cycle, status, limit_siswa, used_siswa, limit_sekolah, used_sekolah, current_period_start, current_period_end, next_quota_reset FROM tenants WHERE tenant_id = ?',
      [testTenant]
    );
    console.log('Updated Tenant in DB:', tenantRows[0]);

    if (tenantRows[0].tier !== 'PRO' || tenantRows[0].limit_siswa !== 1000) {
      throw new Error('Tenant tier or limit not updated properly!');
    }
    console.log('✅ Auto-upgrade test passed with flying colors!');

    // Cleanup: revert crm-demo back to FREE and delete test invoice
    console.log('\n--- 4. Cleaning up test data & restoring crm-demo ---');
    await mainPool.query(
      `UPDATE tenants 
       SET tier = 'FREE', billing_cycle = 'MONTHLY', 
           limit_siswa = 300, limit_sekolah = 10,
           max_admin = 1, max_manager = 1, max_chief_cro = 1, max_cro = 1,
           current_period_start = NULL, current_period_end = NULL, next_quota_reset = NULL
       WHERE tenant_id = ?`,
      [testTenant]
    );
    await mainPool.query('DELETE FROM billing_history WHERE invoice_id = ?', [testInvoiceId]);
    console.log('Test invoice cleaned and crm-demo restored.');
  } catch (err) {
    console.error('Upgrade test failed:', err);
  } finally {
    await mainPool.end();
    process.exit(0);
  }
}

testUpgradeFlow();
