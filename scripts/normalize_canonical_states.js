'use strict';

/**
 * scripts/normalize_canonical_states.js
 * Idempotent normalization script for tenant databases in NexaMOS.
 * 
 * Normalizes legacy state strings in `siswa_periode.commercial_state` and
 * syncs `student_current_state.pipeline_state` to canonical 8 uppercase states:
 * AUDIENCE, KNOWN_PROFILE, LEAD, PROSPECT, OPPORTUNITY, REGISTERED, CUSTOMER, POST_CUSTOMER.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const { CANONICAL_STATES } = require('../src/config/lifecycle.constants');

async function getTenantDatabases(mainConn) {
  const [rows] = await mainConn.query(`
    SELECT td.tenant_id, td.db_host, td.db_port, td.db_name, td.db_user, td.db_password
    FROM tenant_databases td
    JOIN tenants t ON t.tenant_id = td.tenant_id
    WHERE t.status = 'active'
  `);
  return rows;
}

async function normalizeTenant(tenant) {
  console.log(`\n=== Processing tenant: ${tenant.tenant_id} (DB: ${tenant.db_name}) ===`);
  let tenantConn;
  try {
    tenantConn = await mysql.createConnection({
      host: tenant.db_host,
      port: tenant.db_port || 3306,
      user: tenant.db_user,
      password: tenant.db_password,
      database: tenant.db_name
    });

    // Check if siswa_periode exists
    const [tables] = await tenantConn.query(`SHOW TABLES LIKE 'siswa_periode'`);
    if (tables.length === 0) {
      console.log(`[Skip] Table siswa_periode does not exist in ${tenant.db_name}.`);
      return;
    }

    // 1. Normalize 'Registered Opportunity' -> 'REGISTERED'
    const [resReg] = await tenantConn.query(`
      UPDATE siswa_periode 
      SET commercial_state = 'REGISTERED' 
      WHERE UPPER(TRIM(commercial_state)) IN ('REGISTERED OPPORTUNITY', 'REGISTERED')
    `);
    console.log(`  - Updated Registered rows: ${resReg.changedRows || 0}`);

    // 2. Normalize 'Known' -> 'KNOWN_PROFILE'
    const [resKnown] = await tenantConn.query(`
      UPDATE siswa_periode 
      SET commercial_state = 'KNOWN_PROFILE' 
      WHERE UPPER(TRIM(commercial_state)) IN ('KNOWN', 'KNOWN PROFILE')
    `);
    console.log(`  - Updated Known Profile rows: ${resKnown.changedRows || 0}`);

    // 3. Normalize other states to canonical uppercase
    const [resLead] = await tenantConn.query(`
      UPDATE siswa_periode 
      SET commercial_state = 'LEAD' 
      WHERE commercial_state = 'Lead'
    `);
    const [resProspect] = await tenantConn.query(`
      UPDATE siswa_periode 
      SET commercial_state = 'PROSPECT' 
      WHERE commercial_state = 'Prospect'
    `);
    const [resOpp] = await tenantConn.query(`
      UPDATE siswa_periode 
      SET commercial_state = 'OPPORTUNITY' 
      WHERE commercial_state = 'Opportunity'
    `);
    const [resCust] = await tenantConn.query(`
      UPDATE siswa_periode 
      SET commercial_state = 'CUSTOMER' 
      WHERE commercial_state = 'Customer'
    `);
    console.log(`  - Normalized state casing (LEAD: ${resLead.changedRows || 0}, PROSPECT: ${resProspect.changedRows || 0}, OPPORTUNITY: ${resOpp.changedRows || 0}, CUSTOMER: ${resCust.changedRows || 0})`);

    // 4. Update student_current_state table if present
    const [scsTables] = await tenantConn.query(`SHOW TABLES LIKE 'student_current_state'`);
    if (scsTables.length > 0) {
      const [resScs] = await tenantConn.query(`
        UPDATE student_current_state
        SET pipeline_state = CASE UPPER(TRIM(pipeline_state))
          WHEN 'KNOWN' THEN 'KNOWN_PROFILE'
          WHEN 'KNOWN PROFILE' THEN 'KNOWN_PROFILE'
          WHEN 'REGISTERED OPPORTUNITY' THEN 'REGISTERED'
          WHEN 'LEAD' THEN 'LEAD'
          WHEN 'PROSPECT' THEN 'PROSPECT'
          WHEN 'OPPORTUNITY' THEN 'OPPORTUNITY'
          WHEN 'REGISTERED' THEN 'REGISTERED'
          WHEN 'CUSTOMER' THEN 'CUSTOMER'
          WHEN 'POST_CUSTOMER' THEN 'POST_CUSTOMER'
          WHEN 'POST-CUSTOMER' THEN 'POST_CUSTOMER'
          ELSE pipeline_state
        END
        WHERE pipeline_state IS NOT NULL
      `);
      console.log(`  - Updated student_current_state projection rows: ${resScs.changedRows || 0}`);
    }

    console.log(`  ✓ Tenant ${tenant.tenant_id} normalized successfully.`);
  } catch (err) {
    console.error(`  ✗ Error normalizing tenant ${tenant.tenant_id}:`, err.message);
  } finally {
    if (tenantConn) await tenantConn.end();
  }
}

async function main() {
  console.log('--- NexaMOS Canonical State Normalization Script ---');
  let mainConn;
  try {
    mainConn = await mysql.createConnection({
      host: process.env.MAIN_DB_HOST,
      port: process.env.MAIN_DB_PORT ? parseInt(process.env.MAIN_DB_PORT, 10) : 3306,
      user: process.env.MAIN_DB_USER,
      password: process.env.MAIN_DB_PASSWORD,
      database: process.env.MAIN_DB_NAME || 'u294320793_nexamain'
    });

    const tenants = await getTenantDatabases(mainConn);
    console.log(`Found ${tenants.length} active tenant database(s).`);

    for (const t of tenants) {
      await normalizeTenant(t);
    }

    console.log('\n--- Normalization completed successfully. ---');
  } catch (err) {
    console.error('Fatal error connecting to main database:', err);
  } finally {
    if (mainConn) await mainConn.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
