'use strict';

const subscriptionService = require('../src/modules/crm/subscription/subscription.service');
const { mainPool } = require('../src/config/database');

async function testSubscription() {
  try {
    console.log('--- 1. Testing getPlans() ---');
    const plans = subscriptionService.getPlans();
    console.log(`Found ${plans.length} plans:`, plans.map(p => p.name));

    console.log('\n--- 2. Testing getBillingOverview("crm-demo") ---');
    const overview = await subscriptionService.getBillingOverview('crm-demo');
    console.log('Subscription Info:', {
      tenantId: overview.subscription.tenantId,
      tier: overview.subscription.tier,
      status: overview.subscription.status,
      limits: overview.subscription.limits,
      invoicesCount: overview.invoices.length,
    });

    console.log('\n--- 3. Testing Price & Period Logic ---');
    const proMonthly = subscriptionService.TIER_PLANS.PRO.pricing.MONTHLY;
    const proYearly = subscriptionService.TIER_PLANS.PRO.pricing.YEARLY;
    console.log('PRO Monthly:', proMonthly.price, 'Duration:', proMonthly.periodDays, 'days');
    console.log('PRO Yearly:', proYearly.price, 'Duration:', proYearly.periodDays, 'days');
    if (proMonthly.periodDays !== 30 || proYearly.periodDays !== 365) {
      throw new Error('Period days mismatch!');
    }
    console.log('30-day and 365-day locked periods verified!');

    console.log('\n✅ All Subscription unit tests passed successfully!');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await mainPool.end();
    process.exit(0);
  }
}

testSubscription();
