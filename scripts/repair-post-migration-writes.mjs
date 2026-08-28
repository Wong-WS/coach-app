/**
 * Repair documents written by the buggy build that shipped between the cents
 * migration and the fix.
 *
 *   node scripts/repair-post-migration-writes.mjs          # dry run
 *   node scripts/repair-post-migration-writes.mjs --apply
 *
 * Two bugs wrote money to the PRE-migration field names:
 *   - AddLessonModal wrote `studentPrices` (ES6 shorthand slipped the audit)
 *   - the top-up handler wrote `amount`
 * In both cases the VALUE is already in cents — only the field name is wrong.
 *
 * Detection rule: the migration gave every document that existed at the time
 * both the legacy and the cents field. So a legacy field present WITHOUT its
 * cents counterpart can only have been written afterwards, by the buggy build.
 * Those values are copied across verbatim — never multiplied.
 *
 * Documents holding BOTH fields are pre-migration and already correct; they are
 * left alone.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();

const found = [];

function inspect(ref, data, fields) {
  const patch = {};
  const before = {};
  for (const [legacy, cents] of fields) {
    if (data[legacy] === undefined) continue;   // nothing under the old name
    if (data[cents] !== undefined) continue;    // migrated already — leave alone
    before[legacy] = data[legacy];
    patch[cents] = data[legacy];                // value is ALREADY cents
    patch[legacy] = FieldValue.delete();
  }
  if (Object.keys(patch).length === 0) return null;
  found.push({ path: ref.path, before, after: patch });
  return patch;
}

async function run() {
  const writes = [];
  const coaches = await db.collection('coaches').get();

  for (const coach of coaches.docs) {
    const base = `coaches/${coach.id}`;

    for (const [coll, fields] of [
      ['bookings', [['studentPrices', 'studentPriceCents']]],
      ['lessonLogs', [['price', 'priceCents']]],
      ['classExceptions', [['newStudentPrices', 'newStudentPriceCents']]],
    ]) {
      const snap = await db.collection(`${base}/${coll}`).get();
      for (const d of snap.docs) {
        const p = inspect(d.ref, d.data(), fields);
        if (p) writes.push([d.ref, p]);
      }
    }

    const wallets = await db.collection(`${base}/wallets`).get();
    for (const w of wallets.docs) {
      const p = inspect(w.ref, w.data(), [
        ['balance', 'balanceCents'],
        ['usualTopUp', 'usualTopUpCents'],
      ]);
      if (p) writes.push([w.ref, p]);

      const txns = await db.collection(`${base}/wallets/${w.id}/transactions`).get();
      for (const t of txns.docs) {
        const tp = inspect(t.ref, t.data(), [
          ['amount', 'amountCents'],
          ['balanceAfter', 'balanceAfterCents'],
        ]);
        if (tp) writes.push([t.ref, tp]);
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(`money-repair-backup-${stamp}.json`, JSON.stringify(found, null, 2));

  console.log(`documents needing repair: ${found.length}`);
  for (const f of found) {
    // FieldValue.delete() sentinels serialise as {}; show them as a marker.
    const shown = Object.fromEntries(
      Object.entries(f.after).map(([k, v]) => [k, v instanceof Object && v.constructor?.name === 'DeleteTransform' ? '<delete>' : v]),
    );
    console.log(` ${f.path}\n   ${JSON.stringify(f.before)}\n   -> ${JSON.stringify(shown)}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    return;
  }

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, patch] of writes.slice(i, i + 400)) batch.update(ref, patch);
    await batch.commit();
  }
  console.log(`repaired ${writes.length} documents`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
