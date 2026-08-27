/**
 * One-off migration: ringgit floats -> integer cents.
 *
 *   node scripts/migrate-money-to-cents.mjs            # dry run, writes a backup, changes nothing
 *   node scripts/migrate-money-to-cents.mjs --apply    # writes the new fields
 *
 * Safe to re-run: a document that already has the `*Cents` field is skipped, so
 * a value can never be multiplied by 100 twice.
 *
 * The old ringgit fields are LEFT IN PLACE. Nothing reads them any more (the app
 * prefers `*Cents` and only falls back when it is absent), and keeping them means
 * this migration is reversible by simply deleting the new fields. Drop them in a
 * separate cleanup pass once you're satisfied.
 *
 * Fields converted:
 *   bookings.studentPrices          -> studentPriceCents
 *   lessonLogs.price                -> priceCents
 *   classExceptions.newStudentPrices-> newStudentPriceCents
 *   wallets.balance                 -> balanceCents
 *   wallets.usualTopUp              -> usualTopUpCents
 *   wallets/*/transactions.amount   -> amountCents
 *   wallets/*/transactions.balanceAfter -> balanceAfterCents
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

// .env.local, parsed without pulling in a dependency.
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

const toCents = (rm) => Math.round(rm * 100);
const mapToCents = (m) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, toCents(v)]));

const backup = [];
let converted = 0;
let skipped = 0;

/**
 * @param ref     document reference
 * @param data    document data
 * @param fields  [[oldName, newName, kind]] where kind is 'number' | 'map'
 */
function convert(ref, data, fields) {
  const patch = {};
  const before = {};
  for (const [oldName, newName, kind] of fields) {
    if (data[newName] !== undefined) continue;       // already migrated
    const old = data[oldName];
    if (old === undefined || old === null) continue; // nothing to convert
    before[oldName] = old;
    patch[newName] = kind === 'map' ? mapToCents(old) : toCents(old);
  }
  if (Object.keys(patch).length === 0) {
    skipped += 1;
    return null;
  }
  backup.push({ path: ref.path, before, after: patch });
  converted += 1;
  return patch;
}

async function run() {
  const coaches = await db.collection('coaches').get();
  console.log(`coaches: ${coaches.size}`);

  const writes = [];

  for (const coach of coaches.docs) {
    const base = `coaches/${coach.id}`;

    const bookings = await db.collection(`${base}/bookings`).get();
    for (const d of bookings.docs) {
      const p = convert(d.ref, d.data(), [['studentPrices', 'studentPriceCents', 'map']]);
      if (p) writes.push([d.ref, p]);
    }

    const logs = await db.collection(`${base}/lessonLogs`).get();
    for (const d of logs.docs) {
      const p = convert(d.ref, d.data(), [['price', 'priceCents', 'number']]);
      if (p) writes.push([d.ref, p]);
    }

    const exceptions = await db.collection(`${base}/classExceptions`).get();
    for (const d of exceptions.docs) {
      const p = convert(d.ref, d.data(), [
        ['newStudentPrices', 'newStudentPriceCents', 'map'],
      ]);
      if (p) writes.push([d.ref, p]);
    }

    const wallets = await db.collection(`${base}/wallets`).get();
    for (const w of wallets.docs) {
      const p = convert(w.ref, w.data(), [
        ['balance', 'balanceCents', 'number'],
        ['usualTopUp', 'usualTopUpCents', 'number'],
      ]);
      if (p) writes.push([w.ref, p]);

      const txns = await db.collection(`${base}/wallets/${w.id}/transactions`).get();
      for (const t of txns.docs) {
        const tp = convert(t.ref, t.data(), [
          ['amount', 'amountCents', 'number'],
          ['balanceAfter', 'balanceAfterCents', 'number'],
        ]);
        if (tp) writes.push([t.ref, tp]);
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `money-migration-backup-${stamp}.json`;
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  console.log(`documents to convert: ${converted}`);
  console.log(`documents already migrated / no money: ${skipped}`);
  console.log(`backup written: ${backupPath}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.');
    console.log('Sample of the first 5 changes:');
    for (const b of backup.slice(0, 5)) {
      console.log(` ${b.path}\n   ${JSON.stringify(b.before)} -> ${JSON.stringify(b.after)}`);
    }
    return;
  }

  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, patch] of writes.slice(i, i + 400)) batch.update(ref, patch);
    await batch.commit();
    console.log(`committed ${Math.min(i + 400, writes.length)}/${writes.length}`);
  }
  console.log('done');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
