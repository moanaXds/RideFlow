/**
 * RideFlow DB Audit Script
 * Connects to live MySQL, introspects information_schema,
 * and reports exactly what from migration_v2.sql is missing or broken.
 *
 * Usage:  node audit_db.js
 */

'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB = {
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'rideflow',
  multipleStatements: true
};

// ─────────────────────────────────────────────────────────────
// EXPECTED state from migration_v2.sql
// ─────────────────────────────────────────────────────────────

const EXPECTED_TABLES = [
  'users', 'drivers', 'vehicles', 'rides',
  'payments', 'promo_codes', 'ratings',
  // v2 new tables
  'role_permissions', 'wallets', 'driver_wallets',
  'wallet_transactions', 'cities', 'surge_pricing'
];

const EXPECTED_COLUMNS = {
  users:    ['id','name','email','password','phone','role','account_status','profile_pic','created_at'],
  drivers:  ['id','user_id','license_number','is_online','is_verified','avg_rating','total_earnings','flagged','created_at','city_id'],
  rides:    ['id','rider_id','driver_id','pickup_location','dropoff_location','city_id','status',
             'distance_km','duration_minutes','fare','surge_multiplier','scheduled_time','schedule_status','created_at','updated_at'],
  payments: ['id','ride_id','amount','payment_method','status','promo_code','discount_amount',
             'commission_rate','commission_amount','driver_payout','payout_status','paid_at','created_at'],
  ratings:  ['id','ride_id','rider_id','driver_id','rating','comment','rated_by','rated_user','created_at'],
  role_permissions:  ['id','role','permission','granted','created_at'],
  wallets:           ['id','user_id','balance','currency','updated_at','created_at'],
  driver_wallets:    ['id','driver_id','balance','pending_payout','total_withdrawn','currency','updated_at','created_at'],
  wallet_transactions: ['id','wallet_type','wallet_id','type','amount','balance_after',
                        'reference_type','reference_id','note','created_at'],
  cities:        ['id','name','country_code','timezone','is_active','base_fare','per_km_rate','per_min_rate','created_at'],
  surge_pricing: ['id','city_id','multiplier','starts_at','ends_at','days_of_week','is_active','reason','created_at']
};

const EXPECTED_INDEXES = [
  // [table, index_name]
  ['rides',               'idx_rides_scheduled'],
  ['rides',               'idx_rides_city'],
  ['rides',               'idx_rides_status_rider'],
  ['rides',               'idx_rides_status_driver'],
  ['drivers',             'idx_drivers_city'],
  ['payments',            'idx_payments_payout'],
  ['payments',            'idx_payments_status'],
  ['ratings',             'idx_ratings_rated_user'],
  ['ratings',             'idx_ratings_driver_by'],
  ['users',               'idx_users_status'],
  ['wallet_transactions', 'idx_wt_wallet'],
  ['wallet_transactions', 'idx_wt_ref'],
  ['surge_pricing',       'idx_surge_city']
];

const EXPECTED_TRIGGERS = [
  'trg_payment_completed',
  'trg_ride_completed',
  'trg_rating_before_insert',
  'trg_rating_after_insert'
];

const EXPECTED_PROCEDURES = [
  'sp_ensure_wallets',
  'sp_wallet_pay',
  'sp_wallet_recharge',
  'sp_driver_withdraw'
];

const EXPECTED_VIEWS = ['vw_active_surge'];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const red   = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yel   = s => `\x1b[33m${s}\x1b[0m`;
const bold  = s => `\x1b[1m${s}\x1b[0m`;

function section(title) { console.log(`\n${bold(title)}`); }
function ok(msg)        { console.log(`  ${green('✅')} ${msg}`); }
function miss(msg)      { console.log(`  ${red('❌')} ${msg}`); }
function warn(msg)      { console.log(`  ${yel('⚠️ ')} ${msg}`); }

// ─────────────────────────────────────────────────────────────
// MAIN AUDIT
// ─────────────────────────────────────────────────────────────

async function audit() {
  const db   = process.env.DB_NAME || 'rideflow';
  const conn = await mysql.createConnection(DB);

  console.log(bold(`\n🔍 RideFlow DB Audit — ${db} @ ${DB.host}\n`) + '─'.repeat(55));

  // ── 1. TABLES ────────────────────────────────────────────
  section('### Tables');
  const [tableRows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
    [db]
  );
  const existingTables = new Set(tableRows.map(r => r.TABLE_NAME));
  const missingTables  = [];

  for (const t of EXPECTED_TABLES) {
    if (existingTables.has(t)) ok(t);
    else { miss(t); missingTables.push(t); }
  }

  // ── 2. VIEWS ─────────────────────────────────────────────
  section('### Views');
  const [viewRows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?`, [db]
  );
  const existingViews = new Set(viewRows.map(r => r.TABLE_NAME));
  const missingViews  = [];
  for (const v of EXPECTED_VIEWS) {
    if (existingViews.has(v)) ok(v);
    else { miss(v); missingViews.push(v); }
  }

  // ── 3. COLUMNS ───────────────────────────────────────────
  section('### Columns');
  const [colRows] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?`, [db]
  );
  const colMap = {}; // table → Set<column>
  for (const { TABLE_NAME, COLUMN_NAME } of colRows) {
    if (!colMap[TABLE_NAME]) colMap[TABLE_NAME] = new Set();
    colMap[TABLE_NAME].add(COLUMN_NAME);
  }

  const missingCols = {}; // table → [col, ...]
  for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
    const existing = colMap[table] || new Set();
    for (const col of cols) {
      if (!existing.has(col)) {
        if (!missingCols[table]) missingCols[table] = [];
        missingCols[table].push(col);
        miss(`${table}.${col}`);
      }
    }
    if (!missingCols[table]) ok(`${table} — all expected columns present`);
  }

  // ── 4. INDEXES ───────────────────────────────────────────
  section('### Indexes');
  const [idxRows] = await conn.query(
    `SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ?
     GROUP BY TABLE_NAME, INDEX_NAME`, [db]
  );
  const idxSet = new Set(idxRows.map(r => `${r.TABLE_NAME}::${r.INDEX_NAME}`));
  const missingIdxs = [];

  for (const [table, idx] of EXPECTED_INDEXES) {
    const key = `${table}::${idx}`;
    if (idxSet.has(key)) ok(`${table} → ${idx}`);
    else { miss(`${table} → ${idx}`); missingIdxs.push([table, idx]); }
  }

  // ── 5. TRIGGERS ──────────────────────────────────────────
  section('### Triggers');
  const [trgRows] = await conn.query(
    `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
     WHERE TRIGGER_SCHEMA = ?`, [db]
  );
  const existingTrgs  = new Set(trgRows.map(r => r.TRIGGER_NAME));
  const missingTrigs  = [];
  for (const t of EXPECTED_TRIGGERS) {
    if (existingTrgs.has(t)) ok(t);
    else { miss(t); missingTrigs.push(t); }
  }

  // ── 6. PROCEDURES ────────────────────────────────────────
  section('### Stored Procedures');
  const [procRows] = await conn.query(
    `SELECT ROUTINE_NAME FROM information_schema.ROUTINES
     WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`, [db]
  );
  const existingProcs = new Set(procRows.map(r => r.ROUTINE_NAME));
  const missingProcs  = [];
  for (const p of EXPECTED_PROCEDURES) {
    if (existingProcs.has(p)) ok(p);
    else { miss(p); missingProcs.push(p); }
  }

  // ── 7. UNIQUE CONSTRAINT CHECK (ratings) ─────────────────
  section('### Unique Constraints');
  const [uqRows] = await conn.query(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ratings' AND NON_UNIQUE = 0
     GROUP BY INDEX_NAME`, [db]
  );
  const hasDirection = uqRows.some(r => r.INDEX_NAME === 'uq_rating_direction');
  const hasBadOld    = uqRows.some(r => r.INDEX_NAME === 'ride_id' && r.cols === 'ride_id');
  if (hasDirection) ok('ratings.uq_rating_direction (ride_id, rated_by)');
  else              miss('ratings.uq_rating_direction — old single-column ride_id unique key still in place');
  if (hasBadOld)    warn('ratings still has old single-column UNIQUE(ride_id) — blocks mutual ratings');

  // ── 8. PAYMENT ENUM CHECK ─────────────────────────────────
  section('### ENUM Values');
  const [enumRows] = await conn.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'status'`, [db]
  );
  if (enumRows.length) {
    const enumDef = enumRows[0].COLUMN_TYPE;
    if (enumDef.includes('failed')) ok(`payments.status includes 'failed': ${enumDef}`);
    else warn(`payments.status is missing 'failed' value — current: ${enumDef}`);
  }

  // ─────────────────────────────────────────────────────────
  // FINAL DELTA REPORT
  // ─────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(55));
  console.log(bold('📋 DELTA SUMMARY'));
  console.log('─'.repeat(55));

  if (!missingTables.length && !Object.keys(missingCols).length &&
      !missingIdxs.length && !missingTrigs.length &&
      !missingProcs.length && !missingViews.length) {
    console.log(green('\n🎉 All expected schema objects are present. Migration v2 is fully applied.\n'));
    await conn.end();
    return;
  }

  if (missingTables.length)  console.log(red(`\n❌ Missing Tables (${missingTables.length}):\n`) + missingTables.map(t => `   • ${t}`).join('\n'));
  if (missingViews.length)   console.log(red(`\n❌ Missing Views (${missingViews.length}):\n`)  + missingViews.map(v => `   • ${v}`).join('\n'));
  if (Object.keys(missingCols).length) {
    console.log(red(`\n❌ Missing Columns:`));
    for (const [t, cols] of Object.entries(missingCols)) {
      console.log(`   ${t}:`);
      cols.forEach(c => console.log(`     • ${c}`));
    }
  }
  if (missingIdxs.length) {
    console.log(red(`\n❌ Missing Indexes:`));
    missingIdxs.forEach(([t,i]) => console.log(`   • ${t} → ${i}`));
  }
  if (missingTrigs.length)  console.log(red(`\n❌ Missing Triggers:\n`) + missingTrigs.map(t => `   • ${t}`).join('\n'));
  if (missingProcs.length)  console.log(red(`\n❌ Missing Procedures:\n`) + missingProcs.map(p => `   • ${p}`).join('\n'));

  // ─────────────────────────────────────────────────────────
  // GENERATE FIX SCRIPT
  // ─────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(55));
  console.log(bold('🔧 AUTO-GENERATED FIX SCRIPT'));
  console.log('─'.repeat(55));
  console.log('-- Run this against your MySQL database to apply missing objects.\n');

  // We always point to the migration file for the full CREATE statements;
  // for missing columns we emit the exact minimal ALTER.
  if (missingTables.length || missingViews.length || missingTrigs.length || missingProcs.length) {
    console.log('-- ⚠️  Missing tables/views/triggers/procedures detected.');
    console.log('-- The safest fix is to run the full migration file:');
    console.log('--');
    console.log('--   SOURCE /path/to/database/migration_v2.sql;');
    console.log('--');
    console.log('-- (migration_v2.sql uses IF NOT EXISTS throughout — safe to re-run)\n');
  }

  // Emit column-specific ALTERs for tables that DO exist
  for (const [table, cols] of Object.entries(missingCols)) {
    if (missingTables.includes(table)) continue; // whole table missing — covered above
    console.log(`-- Missing columns in \`${table}\`:`);
    for (const col of cols) {
      const stmt = columnAlterStatement(table, col);
      if (stmt) console.log(stmt);
      else console.log(`-- (check migration_v2.sql for column definition: ${table}.${col})`);
    }
    console.log('');
  }

  await conn.end();
}

// ─────────────────────────────────────────────────────────────
// COLUMN ALTER LOOKUP — exact definitions matching migration_v2
// ─────────────────────────────────────────────────────────────
function columnAlterStatement(table, col) {
  const map = {
    'users.account_status': `ALTER TABLE users ADD COLUMN account_status ENUM('active','suspended','banned','pending_verification') NOT NULL DEFAULT 'active' AFTER role;`,
    'drivers.city_id':      `ALTER TABLE drivers ADD COLUMN city_id INT NULL DEFAULT NULL;`,
    'rides.city_id':        `ALTER TABLE rides ADD COLUMN city_id INT NULL DEFAULT NULL AFTER dropoff_location;`,
    'rides.scheduled_time': `ALTER TABLE rides ADD COLUMN scheduled_time DATETIME NULL DEFAULT NULL;`,
    'rides.schedule_status':`ALTER TABLE rides ADD COLUMN schedule_status ENUM('pending','confirmed','cancelled','completed') NULL DEFAULT NULL;`,
    'payments.commission_rate':   `ALTER TABLE payments ADD COLUMN commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.1500;`,
    'payments.commission_amount': `ALTER TABLE payments ADD COLUMN commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00;`,
    'payments.driver_payout':     `ALTER TABLE payments ADD COLUMN driver_payout DECIMAL(10,2) NOT NULL DEFAULT 0.00;`,
    'payments.payout_status':     `ALTER TABLE payments ADD COLUMN payout_status ENUM('pending','paid','withheld') NOT NULL DEFAULT 'pending';`,
    'payments.paid_at':           `ALTER TABLE payments ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL;`,
    'ratings.rated_by':   `ALTER TABLE ratings ADD COLUMN rated_by ENUM('rider','driver') NOT NULL DEFAULT 'rider';`,
    'ratings.rated_user': `ALTER TABLE ratings ADD COLUMN rated_user INT NULL DEFAULT NULL;`
  };
  return map[`${table}.${col}`] || null;
}

audit().catch(err => {
  console.error(red('\n[AUDIT ERROR]'), err.message);
  process.exit(1);
});
