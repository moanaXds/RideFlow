/**
 * apply_fix.js — Executes a SQL migration file via mysql2.
 *
 * Bug-fixed version: strips leading comment-only lines from each
 * parsed statement before checking trimmed.startsWith('--').
 *
 * Usage:
 *   node apply_fix.js                           → applies fix_v2_remaining.sql (default)
 *   node apply_fix.js ../database/custom.sql    → applies a custom file
 */

'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const sqlFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'database', 'fix_v2_remaining.sql');

const DB = {
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'rideflow',
  multipleStatements: false   // execute one at a time for accurate error reporting
};

const green = s => `\x1b[32m${s}\x1b[0m`;
const red   = s => `\x1b[31m${s}\x1b[0m`;
const yel   = s => `\x1b[33m${s}\x1b[0m`;
const bold  = s => `\x1b[1m${s}\x1b[0m`;

// Errors we treat as "already applied" — not real failures
const IGNORABLE = new Set([
  'ER_DUP_KEYNAME',          // index already exists
  'ER_CANT_DROP_FIELD_OR_KEY', // index/key doesn't exist to drop
  'ER_DUP_ENTRY',            // duplicate unique key
  'ER_TABLE_EXISTS_ERROR',   // CREATE TABLE IF NOT EXISTS variant
  'ER_DUP_FIELDNAME'         // column already exists
]);

async function apply() {
  if (!fs.existsSync(sqlFile)) {
    console.error(red(`File not found: ${sqlFile}`));
    process.exit(1);
  }

  const sql  = fs.readFileSync(sqlFile, 'utf8');
  const conn = await mysql.createConnection(DB);

  console.log(bold(`\n🔌 Connected — applying: ${path.basename(sqlFile)}\n`) + '─'.repeat(60));

  const statements = splitSql(sql);
  let applied = 0, skipped = 0, errors = 0;

  for (const rawStmt of statements) {
    // ── Strip leading comment-only lines ────────────────────
    const lines         = rawStmt.split('\n');
    const firstSqlLine  = lines.findIndex(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('--');
    });

    if (firstSqlLine === -1) continue;            // pure comment block — skip

    const stmt    = lines.slice(firstSqlLine).join('\n').trim();
    const preview = stmt.replace(/\s+/g, ' ').substring(0, 72);

    try {
      await conn.query(stmt);
      console.log(`  ${green('✅')} ${preview}…`);
      applied++;
    } catch (err) {
      if (IGNORABLE.has(err.code)) {
        console.log(`  ${yel('⚠️ ')} Already exists (skipped): ${preview}`);
        skipped++;
      } else {
        console.error(`  ${red('❌')} FAILED: ${preview}`);
        console.error(`     ${red(err.message)}\n`);
        errors++;
      }
    }
  }

  await conn.end();

  console.log('\n' + '─'.repeat(60));
  console.log(bold(`📋 Result: ✅ Applied=${applied}  ⚠️  Skipped=${skipped}  ❌ Errors=${errors}`));

  if (errors === 0) {
    console.log(green('\n🎉 Migration applied cleanly. Run `node audit_db.js` to verify.\n'));
  } else {
    console.log(red('\n⚠️  Some statements failed — check errors above.\n'));
    process.exit(1);
  }
}

/**
 * Splits a SQL file into individual executable statements.
 * Handles DELIMITER $$ blocks for triggers and procedures.
 * Does NOT include the delimiter token in the emitted statement.
 */
function splitSql(sql) {
  const results = [];
  let current   = '';
  let delim     = ';';

  for (const line of sql.split('\n')) {
    const trimmedLine = line.trim();

    // Handle DELIMITER directive
    if (/^DELIMITER\s+/i.test(trimmedLine)) {
      // Flush any accumulated content before switching delimiter
      if (current.trim()) results.push(current.trim());
      current = '';
      delim   = trimmedLine.split(/\s+/)[1];
      continue;
    }

    current += line + '\n';

    // Check if the accumulated text ends with the current delimiter
    if (current.trimEnd().endsWith(delim)) {
      // Remove the trailing delimiter token
      const stmt = current.trimEnd().slice(0, -delim.length).trim();
      if (stmt) results.push(stmt);
      current = '';
    }
  }

  // Flush anything remaining
  if (current.trim()) results.push(current.trim());
  return results;
}

apply().catch(err => {
  console.error(red('\n[FATAL]'), err.message);
  process.exit(1);
});
