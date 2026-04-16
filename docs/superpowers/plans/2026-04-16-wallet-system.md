# Wallet System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered payment counters on student docs with a wallet + transaction ledger system that supports family sharing.

**Architecture:** Wallets are a new Firestore subcollection under coaches. Each wallet has a balance and a transactions subcollection. Students link to wallets. Bookings reference which wallet to charge. Mark-as-done creates wallet transactions instead of updating student counters.

**Tech Stack:** Next.js 16, TypeScript 5, Tailwind CSS 4, Firebase Firestore, React hooks

**Spec:** `docs/superpowers/specs/2026-04-16-wallet-system-design.md`

---

### Task 1: Add Wallet and WalletTransaction types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add Wallet type**

Add after the `Payment` interface (line 145):

```typescript
export interface Wallet {
  id: string;
  name: string;
  balance: number;
  studentIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type WalletTransactionType = 'top-up' | 'charge' | 'refund' | 'adjustment';

export interface WalletTransaction {
  id: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  studentId?: string;
  lessonLogId?: string;
  date: string; // YYYY-MM-DD
  createdAt: Date;
}
```

- [ ] **Step 2: Add walletId fields to Booking type**

Add to the `Booking` interface (after `studentPrices` on line 59):

```typescript
  walletId?: string; // which wallet pays for this booking
  studentWallets?: Record<string, string>; // per-student wallet override for group lessons
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Wallet and WalletTransaction types, add walletId to Booking"
```

---

### Task 2: Add Firestore security rules for wallets

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add wallet rules**

Add inside the `match /coaches/{coachId}` block (after the payments rule, before the closing `}`):

```
      // Wallets - owner only
      match /wallets/{walletId} {
        allow read, write: if isOwner(coachId);

        // Wallet transactions - owner only
        match /transactions/{txnId} {
          allow read, write: if isOwner(coachId);
        }
      }
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for wallets and transactions"
```

---

### Task 3: Add useWallets and useWalletTransactions hooks

**Files:**
- Modify: `src/hooks/useCoachData.ts`
- Modify: `src/types/index.ts` (import only)

- [ ] **Step 1: Add import for new types**

In `src/hooks/useCoachData.ts` line 6, add `Wallet` and `WalletTransaction` to the type imports:

```typescript
import { Booking, Location, WorkingHours, DayOfWeek, Student, LessonLog, ClassException, Payment, Wallet, WalletTransaction } from '@/types';
```

- [ ] **Step 2: Add useWallets hook**

Add after the `usePayments` function (after line 312):

```typescript
export function useWallets(coachId: string | undefined) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !db) {
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const q = query(
      collection(firestore, 'coaches', coachId, 'wallets'),
      orderBy('name', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Wallet[] = snapshot.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        balance: d.data().balance ?? 0,
        studentIds: d.data().studentIds ?? [],
        createdAt: d.data().createdAt?.toDate() || new Date(),
        updatedAt: d.data().updatedAt?.toDate() || new Date(),
      }));
      setWallets(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId]);

  return { wallets, loading };
}
```

- [ ] **Step 3: Add useWalletTransactions hook**

Add after `useWallets`:

```typescript
export function useWalletTransactions(coachId: string | undefined, walletId: string | undefined, limitCount?: number) {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coachId || !walletId || !db) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const firestore = db as Firestore;
    const col = collection(firestore, 'coaches', coachId, 'wallets', walletId, 'transactions');
    const q = limitCount
      ? query(col, orderBy('createdAt', 'desc'), limit(limitCount))
      : query(col, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: WalletTransaction[] = snapshot.docs.map((d) => ({
        id: d.id,
        type: d.data().type,
        amount: d.data().amount ?? 0,
        balanceAfter: d.data().balanceAfter ?? 0,
        description: d.data().description ?? '',
        studentId: d.data().studentId ?? undefined,
        lessonLogId: d.data().lessonLogId ?? undefined,
        date: d.data().date,
        createdAt: d.data().createdAt?.toDate() || new Date(),
      }));
      setTransactions(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coachId, walletId, limitCount]);

  return { transactions, loading };
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCoachData.ts
git commit -m "feat: add useWallets and useWalletTransactions hooks"
```

---

### Task 4: Rename Income to Payments in nav and create page shell

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/payments/page.tsx`
- Keep: `src/app/dashboard/income/page.tsx` (will be removed in Task 12)

- [ ] **Step 1: Update nav item**

In `src/app/dashboard/layout.tsx` line 12, change the income nav item:

```typescript
  { href: '/dashboard/payments', label: 'Payments', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
```

- [ ] **Step 2: Create payments page shell with tabs**

Create `src/app/dashboard/payments/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const TABS = ['Overview', 'Wallets', 'History'] as const;
type Tab = typeof TABS[number];

export default function PaymentsPage() {
  const { coach } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Wallets');

  if (!coach) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-6">Payments</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-[#333333]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <p className="text-gray-500 dark:text-zinc-400">Overview coming soon — will replace current Income page.</p>
      )}
      {activeTab === 'Wallets' && (
        <p className="text-gray-500 dark:text-zinc-400">Wallets tab — next task.</p>
      )}
      {activeTab === 'History' && (
        <p className="text-gray-500 dark:text-zinc-400">Transaction history — coming later.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes and page loads**

Run: `npm run build`
Expected: Clean build. Navigate to `/dashboard/payments` — should show tab bar with placeholder content. Old `/dashboard/income` still works (we keep it until Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/dashboard/payments/page.tsx
git commit -m "feat: rename Income to Payments nav, create page shell with tabs"
```

---

### Task 5: Wallets tab — create, list, detail

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx`

This task builds the Wallets tab with:
- List of wallet cards (name, balance, linked students)
- "Create Wallet" modal (name field, select students)
- Wallet detail panel (click card → see transactions, linked students, top-up/adjust buttons)

- [ ] **Step 1: Add imports and hooks**

Add to the top of `payments/page.tsx`:

```tsx
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useWallets, useWalletTransactions, useStudents } from '@/hooks/useCoachData';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { Wallet } from '@/types';
import { Firestore } from 'firebase/firestore';
```

- [ ] **Step 2: Add state and hooks to PaymentsPage**

Inside the `PaymentsPage` component, after the `activeTab` state:

```tsx
  const { wallets } = useWallets(coach?.id);
  const { students } = useStudents(coach?.id);
  const { showToast } = useToast();

  // Create wallet modal
  const [showCreateWallet, setShowCreateWallet] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletStudentIds, setNewWalletStudentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Wallet detail
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  // Top-up modal
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpDate, setTopUpDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [topUpSaving, setTopUpSaving] = useState(false);

  // Adjustment modal
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjType, setAdjType] = useState<'add' | 'deduct'>('add');
  const [adjSaving, setAdjSaving] = useState(false);

  // Students not yet assigned to any wallet
  const unassignedStudents = students.filter(
    (s) => !wallets.some((w) => w.studentIds.includes(s.id))
  );
```

- [ ] **Step 3: Add create wallet handler**

```tsx
  const handleCreateWallet = async () => {
    if (!coach || !db || !newWalletName.trim()) return;
    setCreating(true);
    try {
      const firestore = db as Firestore;
      await addDoc(collection(firestore, 'coaches', coach.id, 'wallets'), {
        name: newWalletName.trim(),
        balance: 0,
        studentIds: newWalletStudentIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast('Wallet created!', 'success');
      setShowCreateWallet(false);
      setNewWalletName('');
      setNewWalletStudentIds([]);
    } catch {
      showToast('Failed to create wallet', 'error');
    } finally {
      setCreating(false);
    }
  };
```

- [ ] **Step 4: Add top-up handler**

```tsx
  const handleTopUp = async () => {
    if (!coach || !db || !selectedWallet) return;
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) return;
    setTopUpSaving(true);
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id);
      const newBalance = selectedWallet.balance + amount;

      await addDoc(collection(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id, 'transactions'), {
        type: 'top-up',
        amount,
        balanceAfter: newBalance,
        description: 'Top-up',
        date: topUpDate,
        createdAt: serverTimestamp(),
      });
      await updateDoc(walletRef, {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });

      showToast(`RM ${amount} added to ${selectedWallet.name}`, 'success');
      setShowTopUp(false);
      setTopUpAmount('');
      // Update selectedWallet with new balance for UI
      setSelectedWallet({ ...selectedWallet, balance: newBalance });
    } catch {
      showToast('Failed to record top-up', 'error');
    } finally {
      setTopUpSaving(false);
    }
  };
```

- [ ] **Step 5: Add adjustment handler**

```tsx
  const handleAdjustment = async () => {
    if (!coach || !db || !selectedWallet || !adjDescription.trim()) return;
    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) return;
    setAdjSaving(true);
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id);
      const delta = adjType === 'add' ? amount : -amount;
      const newBalance = selectedWallet.balance + delta;

      await addDoc(collection(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id, 'transactions'), {
        type: 'adjustment',
        amount,
        balanceAfter: newBalance,
        description: `${adjType === 'add' ? '+' : '-'} ${adjDescription.trim()}`,
        date: topUpDate,
        createdAt: serverTimestamp(),
      });
      await updateDoc(walletRef, {
        balance: increment(delta),
        updatedAt: serverTimestamp(),
      });

      showToast(`Adjustment recorded for ${selectedWallet.name}`, 'success');
      setShowAdjustment(false);
      setAdjAmount('');
      setAdjDescription('');
      setSelectedWallet({ ...selectedWallet, balance: newBalance });
    } catch {
      showToast('Failed to record adjustment', 'error');
    } finally {
      setAdjSaving(false);
    }
  };
```

- [ ] **Step 6: Build the Wallets tab UI — wallet cards grid**

Replace the `{activeTab === 'Wallets' && ...}` placeholder with:

```tsx
{activeTab === 'Wallets' && (
  <div>
    {/* Header with create button */}
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm text-gray-500 dark:text-zinc-400">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</p>
      <Button onClick={() => setShowCreateWallet(true)}>+ New Wallet</Button>
    </div>

    {/* Wallet cards */}
    {wallets.length === 0 ? (
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl p-12 text-center border border-gray-100 dark:border-[#333333]">
        <p className="text-gray-500 dark:text-zinc-400 mb-4">No wallets yet. Create one to start tracking payments.</p>
        <Button onClick={() => setShowCreateWallet(true)}>Create First Wallet</Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets.map((wallet) => {
          const linkedStudents = students.filter((s) => wallet.studentIds.includes(s.id));
          const avgRate = linkedStudents.length > 0
            ? linkedStudents.reduce((sum, s) => sum + (s.lessonRate ?? 0), 0) / linkedStudents.length
            : 0;
          const lessonsLeft = avgRate > 0 ? Math.floor(wallet.balance / avgRate) : null;

          return (
            <button
              key={wallet.id}
              onClick={() => setSelectedWallet(wallet)}
              className="bg-white dark:bg-[#1f1f1f] rounded-xl p-5 border border-gray-100 dark:border-[#333333] text-left hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-zinc-100">{wallet.name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                    {linkedStudents.map((s) => s.clientName).join(', ') || 'No students linked'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${wallet.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {wallet.balance < 0 ? '-' : ''}RM {Math.abs(wallet.balance).toFixed(0)}
                  </p>
                  {lessonsLeft !== null && wallet.balance > 0 && (
                    <p className="text-xs text-gray-400 dark:text-zinc-500">~{lessonsLeft} lesson{lessonsLeft !== 1 ? 's' : ''} left</p>
                  )}
                  {wallet.balance < 0 && (
                    <p className="text-xs text-red-500">Owes you</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 text-xs text-gray-400 dark:text-zinc-500">
                <span className="bg-gray-100 dark:bg-[#2a2a2a] px-2 py-0.5 rounded-full">
                  {wallet.studentIds.length} student{wallet.studentIds.length !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 7: Build the wallet detail panel (modal)**

Add a `WalletDetailModal` section. This uses `useWalletTransactions` for the selected wallet. Add this as a separate component rendered below the tab content (before the closing `</div>` of the page):

```tsx
{/* Wallet Detail Modal */}
<Modal
  isOpen={!!selectedWallet}
  onClose={() => setSelectedWallet(null)}
  title={selectedWallet?.name ?? 'Wallet'}
>
  {selectedWallet && (
    <WalletDetail
      coachId={coach.id}
      wallet={selectedWallet}
      students={students}
      wallets={wallets}
      onTopUp={() => setShowTopUp(true)}
      onAdjust={() => setShowAdjustment(true)}
      onClose={() => setSelectedWallet(null)}
      showToast={showToast}
    />
  )}
</Modal>
```

Create the `WalletDetail` component above `PaymentsPage` in the same file:

```tsx
function WalletDetail({
  coachId,
  wallet,
  students,
  wallets,
  onTopUp,
  onAdjust,
  onClose,
  showToast,
}: {
  coachId: string;
  wallet: Wallet;
  students: { id: string; clientName: string }[];
  wallets: Wallet[];
  onTopUp: () => void;
  onAdjust: () => void;
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const { transactions } = useWalletTransactions(coachId, wallet.id, 50);
  const linkedStudents = students.filter((s) => wallet.studentIds.includes(s.id));
  const unlinkedStudents = students.filter(
    (s) => !wallets.some((w) => w.studentIds.includes(s.id))
  );
  const [addingStudent, setAddingStudent] = useState(false);

  const handleAddStudent = async (studentId: string) => {
    if (!db) return;
    setAddingStudent(true);
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coachId, 'wallets', wallet.id);
      await updateDoc(walletRef, {
        studentIds: [...wallet.studentIds, studentId],
        updatedAt: serverTimestamp(),
      });
      showToast('Student added to wallet', 'success');
    } catch {
      showToast('Failed to add student', 'error');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!db) return;
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coachId, 'wallets', wallet.id);
      await updateDoc(walletRef, {
        studentIds: wallet.studentIds.filter((id) => id !== studentId),
        updatedAt: serverTimestamp(),
      });
      showToast('Student removed from wallet', 'success');
    } catch {
      showToast('Failed to remove student', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance */}
      <div className="text-center py-4">
        <p className="text-sm text-gray-500 dark:text-zinc-400">Balance</p>
        <p className={`text-3xl font-bold ${wallet.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {wallet.balance < 0 ? '-' : ''}RM {Math.abs(wallet.balance).toFixed(0)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button onClick={onTopUp} className="flex-1">+ Top Up</Button>
        <Button variant="ghost" onClick={onAdjust} className="flex-1">Adjustment</Button>
      </div>

      {/* Linked students */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Linked Students</p>
        {linkedStudents.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No students linked yet.</p>
        ) : (
          <div className="space-y-2">
            {linkedStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-gray-50 dark:bg-[#2a2a2a] px-3 py-2 rounded-lg">
                <span className="text-sm text-gray-800 dark:text-zinc-200">{s.clientName}</span>
                <button
                  onClick={() => handleRemoveStudent(s.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {/* Add student dropdown */}
        {unlinkedStudents.length > 0 && (
          <select
            className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-zinc-500 rounded-lg text-sm bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-zinc-100"
            value=""
            onChange={(e) => { if (e.target.value) handleAddStudent(e.target.value); }}
            disabled={addingStudent}
          >
            <option value="">+ Add student to wallet...</option>
            {unlinkedStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.clientName}</option>
            ))}
          </select>
        )}
      </div>

      {/* Recent transactions */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Recent Transactions</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No transactions yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {transactions.map((txn) => (
              <div key={txn.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a]">
                <div>
                  <p className="text-sm text-gray-800 dark:text-zinc-200">{txn.description}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{txn.date}</p>
                </div>
                <p className={`text-sm font-medium ${
                  txn.type === 'charge' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                }`}>
                  {txn.type === 'charge' ? '-' : '+'}RM {txn.amount.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Add create wallet modal**

Add after the wallet detail modal:

```tsx
{/* Create Wallet Modal */}
<Modal isOpen={showCreateWallet} onClose={() => setShowCreateWallet(false)} title="Create Wallet">
  <div className="space-y-4">
    <Input
      id="wallet-name"
      label="Wallet Name"
      value={newWalletName}
      onChange={(e) => setNewWalletName(e.target.value)}
      placeholder="e.g. Mrs. Wong"
    />
    {unassignedStudents.length > 0 && (
      <div>
        <p className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Link Students (optional)</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {unassignedStudents.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={newWalletStudentIds.includes(s.id)}
                onChange={(e) => {
                  setNewWalletStudentIds(
                    e.target.checked
                      ? [...newWalletStudentIds, s.id]
                      : newWalletStudentIds.filter((id) => id !== s.id)
                  );
                }}
                className="rounded"
              />
              {s.clientName}
            </label>
          ))}
        </div>
      </div>
    )}
    <div className="flex justify-end gap-3 pt-2">
      <Button variant="ghost" onClick={() => setShowCreateWallet(false)}>Cancel</Button>
      <Button onClick={handleCreateWallet} disabled={creating || !newWalletName.trim()}>
        {creating ? 'Creating...' : 'Create Wallet'}
      </Button>
    </div>
  </div>
</Modal>
```

- [ ] **Step 9: Add top-up and adjustment modals**

```tsx
{/* Top-up Modal */}
<Modal isOpen={showTopUp} onClose={() => setShowTopUp(false)} title={`Top Up — ${selectedWallet?.name}`}>
  <div className="space-y-4">
    <Input
      id="topup-amount"
      label="Amount (RM)"
      type="number"
      value={topUpAmount}
      onChange={(e) => setTopUpAmount(e.target.value)}
      placeholder="e.g. 500"
    />
    <Input
      id="topup-date"
      label="Date"
      type="date"
      value={topUpDate}
      onChange={(e) => setTopUpDate(e.target.value)}
    />
    <div className="flex justify-end gap-3 pt-2">
      <Button variant="ghost" onClick={() => setShowTopUp(false)}>Cancel</Button>
      <Button onClick={handleTopUp} disabled={topUpSaving || !topUpAmount}>
        {topUpSaving ? 'Saving...' : 'Record Top-up'}
      </Button>
    </div>
  </div>
</Modal>

{/* Adjustment Modal */}
<Modal isOpen={showAdjustment} onClose={() => setShowAdjustment(false)} title={`Adjustment — ${selectedWallet?.name}`}>
  <div className="space-y-4">
    <div className="flex gap-2">
      <button
        onClick={() => setAdjType('add')}
        className={`flex-1 py-2 rounded-lg text-sm font-medium ${adjType === 'add' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-[#2a2a2a] dark:text-zinc-400'}`}
      >
        + Add
      </button>
      <button
        onClick={() => setAdjType('deduct')}
        className={`flex-1 py-2 rounded-lg text-sm font-medium ${adjType === 'deduct' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 text-gray-600 dark:bg-[#2a2a2a] dark:text-zinc-400'}`}
      >
        - Deduct
      </button>
    </div>
    <Input
      id="adj-amount"
      label="Amount (RM)"
      type="number"
      value={adjAmount}
      onChange={(e) => setAdjAmount(e.target.value)}
      placeholder="e.g. 50"
    />
    <Input
      id="adj-desc"
      label="Description"
      value={adjDescription}
      onChange={(e) => setAdjDescription(e.target.value)}
      placeholder="e.g. Overcharged last week"
    />
    <div className="flex justify-end gap-3 pt-2">
      <Button variant="ghost" onClick={() => setShowAdjustment(false)}>Cancel</Button>
      <Button onClick={handleAdjustment} disabled={adjSaving || !adjAmount || !adjDescription.trim()}>
        {adjSaving ? 'Saving...' : 'Record Adjustment'}
      </Button>
    </div>
  </div>
</Modal>
```

- [ ] **Step 10: Verify build passes and test wallet CRUD**

Run: `npm run build`
Then: `npm run dev`
Test: Navigate to `/dashboard/payments` → Wallets tab → Create a wallet → Top up → View transactions.

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "feat: build Wallets tab with create, list, detail, top-up, and adjustment"
```

---

### Task 6: Student-wallet linking on student creation

**Files:**
- Modify: `src/app/dashboard/bookings/page.tsx`
- Modify: `src/lib/students.ts`

When a student is created via booking, if a wallet exists for them (by name match) or a wallet is selected, link them. This task adds the `walletId` field to the booking form and auto-links students to wallets.

- [ ] **Step 1: Read current bookings page and students.ts**

Read `src/app/dashboard/bookings/page.tsx` and `src/lib/students.ts` to understand the current booking creation and student creation flows.

- [ ] **Step 2: Add walletId to booking creation form state**

In `src/app/dashboard/bookings/page.tsx`, add `walletId` to the form state and a wallet selector dropdown. Import `useWallets` hook. When a student is selected/created, auto-select their linked wallet if one exists.

- [ ] **Step 3: Save walletId on booking document**

In the `handleSubmit` function, include `walletId` (and `studentWallets` for group lessons) in the booking document payload.

- [ ] **Step 4: Add wallet badge to student cards on Students page**

In `src/app/dashboard/students/page.tsx`, import `useWallets` and show a small badge on each student card indicating which wallet they belong to (or "No wallet" in gray).

- [ ] **Step 5: Verify build and test**

Run: `npm run build`
Test: Create a booking with a student that has a wallet. Verify `walletId` is saved on the booking doc. Check student cards show wallet badges.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/bookings/page.tsx src/app/dashboard/students/page.tsx
git commit -m "feat: add wallet selection to booking form, wallet badges on student cards"
```

---

### Task 7: Mark-as-done wallet integration

**Files:**
- Modify: `src/app/dashboard/page.tsx`

This is the core change. When marking a lesson done, instead of updating student counters (`prepaidUsed`, `credit`, `pendingPayment`), create a wallet transaction and update the wallet balance.

- [ ] **Step 1: Import useWallets hook**

Add to imports in `src/app/dashboard/page.tsx`:

```tsx
import { useWallets } from '@/hooks/useCoachData';
```

Add inside the component:

```tsx
const { wallets } = useWallets(coach?.id);
```

- [ ] **Step 2: Replace handleConfirmMarkDone student update logic**

The current logic (lines 262-358) updates student doc fields. Replace it with wallet transaction logic.

For each attendee in `resolvedAttendees`:

1. Create the lessonLog (keep as-is, lines 241-260)
2. Instead of updating student `prepaidUsed`/`credit`/`pendingPayment`:
   - Find the wallet for this student: check `booking.studentWallets?.[attendee.studentId]` first, then `booking.walletId`, then find a wallet where `wallet.studentIds.includes(attendee.studentId)`
   - If wallet found: create a charge transaction on that wallet and decrement the wallet balance
   - If no wallet (payPerLesson or unlinked): skip wallet logic, just log the lesson

The new logic per attendee:

```tsx
// Find wallet for this attendee
const walletId = booking.studentWallets?.[attendee.studentId]
  || booking.walletId
  || wallets.find((w) => w.studentIds.includes(attendee.studentId))?.id;

if (walletId && attendee.price > 0) {
  const wallet = wallets.find((w) => w.id === walletId);
  if (wallet) {
    const newBalance = wallet.balance - attendee.price;
    const txnRef = doc(collection(firestore, 'coaches', coach.id, 'wallets', walletId, 'transactions'));
    batch.set(txnRef, {
      type: 'charge',
      amount: attendee.price,
      balanceAfter: newBalance,
      description: `Lesson — ${attendee.studentName} (${booking.startTime})`,
      studentId: attendee.studentId,
      lessonLogId: logRef.id,
      date: selectedDateStr,
      createdAt: serverTimestamp(),
    });
    const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', walletId);
    batch.update(walletRef, {
      balance: increment(-attendee.price),
      updatedAt: serverTimestamp(),
    });
  }
}

// Still update student updatedAt timestamp
batch.update(studentRef, { updatedAt: serverTimestamp() });
```

- [ ] **Step 3: Update the mark-done modal UI to show wallet info**

Below the price field in the mark-done modal, add a line showing which wallet will be charged:

```tsx
{/* Wallet info */}
{(() => {
  const walletId = markDoneBooking?.studentWallets?.[attendee.studentId]
    || markDoneBooking?.walletId
    || wallets.find((w) => w.studentIds.includes(attendee.studentId))?.id;
  const wallet = walletId ? wallets.find((w) => w.id === walletId) : null;
  if (wallet) {
    return (
      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
        {wallet.name}: RM {wallet.balance} → RM {wallet.balance - attendee.price}
      </p>
    );
  }
  return <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">No wallet (pay-per-lesson)</p>;
})()}
```

- [ ] **Step 4: Remove old student counter update logic**

Remove the entire block that updates `prepaidUsed`, `credit`, `pendingPayment`, `monetaryBalance`, `nextPrepaidTotal` on the student doc (lines 262-358 in original). Keep only the `updatedAt` timestamp update on the student doc.

Also remove the post-commit notification logic for package warnings/auto-renewals (lines 364-424) — wallet balance is the new source of truth, and the wallet detail panel shows the balance.

Replace with a simpler notification:

```tsx
// Post-commit: show wallet balance notification
for (const attendee of resolvedAttendees) {
  const walletId = booking.studentWallets?.[attendee.studentId]
    || booking.walletId
    || wallets.find((w) => w.studentIds.includes(attendee.studentId))?.id;
  if (walletId) {
    const wallet = wallets.find((w) => w.id === walletId);
    if (wallet && wallet.balance - attendee.price < 0) {
      showToast(`${wallet.name} balance is now negative`, 'info');
      break;
    }
  }
}
```

- [ ] **Step 5: Verify build and test mark-as-done**

Run: `npm run build`
Then: `npm run dev`
Test:
1. Create a wallet, add a student, top up RM500
2. Create a booking for that student with a wallet assigned
3. Go to Overview, mark the class done
4. Check: wallet balance decreased, transaction appears in wallet detail

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: mark-as-done creates wallet transactions instead of updating student counters"
```

---

### Task 8: Lesson log deletion — wallet reversal

**Files:**
- Modify: `src/app/dashboard/page.tsx`

When a lesson log is deleted, if it had a wallet charge, create a refund transaction and credit the wallet back.

- [ ] **Step 1: Read the current lesson deletion logic**

Find the `handleDeleteAdHocGroup` function and any other lesson deletion handlers. Understand what they currently reverse (prepaidUsed, credit, pendingPayment).

- [ ] **Step 2: Add wallet reversal on lesson deletion**

When deleting a lesson log:
1. Query the wallet transactions collection for a transaction with `lessonLogId` matching the deleted log
2. If found, create a refund transaction and increment the wallet balance
3. Remove the old student counter reversal logic

```tsx
// Find and reverse wallet transaction for this lesson
for (const walletDoc of wallets) {
  const firestore = db as Firestore;
  const txnQuery = query(
    collection(firestore, 'coaches', coach.id, 'wallets', walletDoc.id, 'transactions'),
    where('lessonLogId', '==', lessonLogId)
  );
  const txnSnap = await getDocs(txnQuery);
  if (!txnSnap.empty) {
    const originalTxn = txnSnap.docs[0].data();
    const newBalance = walletDoc.balance + originalTxn.amount;
    await addDoc(collection(firestore, 'coaches', coach.id, 'wallets', walletDoc.id, 'transactions'), {
      type: 'refund',
      amount: originalTxn.amount,
      balanceAfter: newBalance,
      description: `Reversed: ${originalTxn.description}`,
      studentId: originalTxn.studentId,
      date: selectedDateStr,
      createdAt: serverTimestamp(),
    });
    await updateDoc(doc(firestore, 'coaches', coach.id, 'wallets', walletDoc.id), {
      balance: increment(originalTxn.amount),
      updatedAt: serverTimestamp(),
    });
    break;
  }
}
```

- [ ] **Step 3: Remove old student counter reversal logic**

Remove the code that decrements `prepaidUsed`, reverses `credit`, and adjusts `pendingPayment` on lesson deletion.

- [ ] **Step 4: Add getDocs import**

Add `getDocs` to the Firestore imports if not already present.

- [ ] **Step 5: Verify build and test**

Run: `npm run build`
Test: Mark a lesson done (wallet charged) → delete it → verify wallet balance is restored and refund transaction appears.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: lesson deletion creates wallet refund transaction"
```

---

### Task 9: Transaction history tab

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx`

- [ ] **Step 1: Add a hook to load all transactions across wallets**

Since Firestore doesn't support cross-subcollection queries, load transactions per wallet and merge them client-side. Use the existing `useWalletTransactions` for each wallet, or create a combined approach.

Simplest approach: iterate `wallets` and load transactions for each, merge and sort.

```tsx
// Inside the component, after wallets hook:
const [allTransactions, setAllTransactions] = useState<(WalletTransaction & { walletName: string })[]>([]);

useEffect(() => {
  if (!coach?.id || !db || wallets.length === 0) return;
  const firestore = db as Firestore;
  const unsubs: (() => void)[] = [];

  const txnsByWallet = new Map<string, (WalletTransaction & { walletName: string })[]>();

  for (const wallet of wallets) {
    const q = query(
      collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        type: d.data().type as WalletTransaction['type'],
        amount: d.data().amount ?? 0,
        balanceAfter: d.data().balanceAfter ?? 0,
        description: d.data().description ?? '',
        studentId: d.data().studentId ?? undefined,
        lessonLogId: d.data().lessonLogId ?? undefined,
        date: d.data().date,
        createdAt: d.data().createdAt?.toDate() || new Date(),
        walletName: wallet.name,
      }));
      txnsByWallet.set(wallet.id, items);
      // Merge all
      const merged = Array.from(txnsByWallet.values()).flat();
      merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setAllTransactions(merged);
    });
    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}, [coach?.id, wallets]);
```

- [ ] **Step 2: Build history tab UI**

Replace the History tab placeholder:

```tsx
{activeTab === 'History' && (
  <div>
    {allTransactions.length === 0 ? (
      <p className="text-gray-500 dark:text-zinc-400 text-center py-12">No transactions yet.</p>
    ) : (
      <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-[#333333]">
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Wallet</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Description</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Type</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Amount</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Balance</th>
            </tr>
          </thead>
          <tbody>
            {allTransactions.map((txn) => (
              <tr key={txn.id} className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0">
                <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{txn.date}</td>
                <td className="px-4 py-3 text-gray-800 dark:text-zinc-200">{txn.walletName}</td>
                <td className="px-4 py-3 text-gray-800 dark:text-zinc-200">{txn.description}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    txn.type === 'charge' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : txn.type === 'top-up' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : txn.type === 'refund' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {txn.type}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-medium ${txn.type === 'charge' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {txn.type === 'charge' ? '-' : '+'}RM {txn.amount.toFixed(0)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 dark:text-zinc-400">RM {txn.balanceAfter.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Add required imports**

Add `onSnapshot, query, orderBy, limit, collection` from firebase/firestore and `WalletTransaction` from types to the imports at the top (if not already present).

- [ ] **Step 4: Verify build and test**

Run: `npm run build`
Test: Navigate to Payments → History tab. Should show all transactions across all wallets sorted by date.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git commit -m "feat: add transaction history tab showing all wallet transactions"
```

---

### Task 10: Overview tab — migrate income stats

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx`
- Delete: `src/app/dashboard/income/page.tsx` (after migration)

- [ ] **Step 1: Read the current income page**

Read `src/app/dashboard/income/page.tsx` fully to understand all the calculations and UI.

- [ ] **Step 2: Copy income calculation logic into Payments page**

Move the income overview calculations (projected income from recurring bookings, actual income from lessonLogs, payment collections) into the Overview tab of the Payments page. Import `useBookings`, `useLessonLogs`, `usePayments` hooks.

Adapt the projected collections calculation to use wallet balances instead of student `pendingPayment` fields. The total unpaid amount is now: sum of negative wallet balances (wallets where `balance < 0`).

- [ ] **Step 3: Build the Overview tab UI**

Reproduce the income page layout inside the Overview tab: stat cards (weekly/monthly/annual projected), actual vs projected comparison, recent lessons table, recent payments table.

Replace the old "unpaid balance" calculation with:
```tsx
const totalUnpaid = wallets
  .filter((w) => w.balance < 0)
  .reduce((sum, w) => sum + Math.abs(w.balance), 0);
```

- [ ] **Step 4: Delete old income page**

```bash
rm src/app/dashboard/income/page.tsx
```

- [ ] **Step 5: Verify build and test**

Run: `npm run build`
Expected: No route for `/dashboard/income`. Navigate to `/dashboard/payments` → Overview tab shows income stats.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/payments/page.tsx
git rm src/app/dashboard/income/page.tsx
git commit -m "feat: migrate income overview to Payments page Overview tab, delete old income page"
```

---

### Task 11: Update student payment recording to use wallets

**Files:**
- Modify: `src/app/dashboard/students/page.tsx`

The students page currently has a "Record Payment" flow that creates a `payments` doc and decrements `pendingPayment` on the student. Replace this with a wallet top-up.

- [ ] **Step 1: Read current payment recording code**

Read the payment recording UI and handler in `src/app/dashboard/students/page.tsx`.

- [ ] **Step 2: Replace payment recording with wallet top-up**

Instead of creating a `payments` doc and updating `pendingPayment`:
1. Find the student's wallet
2. Create a `top-up` transaction on that wallet
3. Increment the wallet balance

If the student has no wallet, show a message directing the coach to create one from the Payments page.

- [ ] **Step 3: Remove old prepaid package management UI**

Remove the "+5 Lessons", "+10 Lessons" buttons and all prepaid package management UI from the students page. The wallet top-up (in the Payments page) replaces this.

Remove: `prepaidTotal`, `prepaidUsed`, `credit`, `pendingPayment`, `nextPrepaidTotal`, `packageSize`, `monetaryBalance`, `useMonetaryBalance` from the student detail panel display.

Keep: `lessonRate` (still used for pricing reference), `payPerLesson` toggle.

- [ ] **Step 4: Show wallet balance on student detail panel**

Import `useWallets` and show the linked wallet's balance where prepaid info used to be:

```tsx
const wallet = wallets.find((w) => w.studentIds.includes(student.id));
// Show: "Wallet: Mrs. Wong — RM 340" or "No wallet"
```

- [ ] **Step 5: Verify build and test**

Run: `npm run build`
Test: Open a student → see wallet info instead of prepaid counters. Record payment → wallet balance increases.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/students/page.tsx
git commit -m "feat: replace student payment recording with wallet top-ups, remove prepaid UI"
```

---

### Task 12: Data migration script

**Files:**
- Create: `src/app/api/migrate-wallets/route.ts`

A one-time API endpoint the coach can trigger to migrate existing student data to wallets.

- [ ] **Step 1: Create migration endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  const { coachId } = await req.json();
  if (!coachId) return NextResponse.json({ error: 'coachId required' }, { status: 400 });

  const studentsSnap = await adminDb.collection(`coaches/${coachId}/students`).get();
  const walletsCreated: string[] = [];
  let studentsProcessed = 0;

  for (const studentDoc of studentsSnap.docs) {
    const student = studentDoc.data();
    const studentId = studentDoc.id;

    // Skip if student already has a wallet
    const existingWallets = await adminDb.collection(`coaches/${coachId}/wallets`)
      .where('studentIds', 'array-contains', studentId).get();
    if (!existingWallets.empty) continue;

    // Check if this is a linked student → merge into primary's wallet
    if (student.linkedToStudentId) {
      const primaryWallets = await adminDb.collection(`coaches/${coachId}/wallets`)
        .where('studentIds', 'array-contains', student.linkedToStudentId).get();
      if (!primaryWallets.empty) {
        const primaryWallet = primaryWallets.docs[0];
        const currentStudentIds = primaryWallet.data().studentIds || [];
        if (!currentStudentIds.includes(studentId)) {
          await primaryWallet.ref.update({
            studentIds: [...currentStudentIds, studentId],
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        studentsProcessed++;
        continue;
      }
    }

    // Calculate wallet balance from current student state
    let balance = 0;
    if (student.useMonetaryBalance) {
      balance = student.monetaryBalance ?? 0;
    } else if ((student.prepaidTotal ?? 0) > 0) {
      const rate = student.lessonRate ?? 0;
      const remaining = (student.prepaidTotal ?? 0) - (student.prepaidUsed ?? 0);
      balance = remaining * rate - (student.pendingPayment ?? 0) + (student.credit ?? 0);
    } else if (student.payPerLesson) {
      balance = -(student.pendingPayment ?? 0);
    }

    // Create wallet
    const walletRef = await adminDb.collection(`coaches/${coachId}/wallets`).add({
      name: student.clientName,
      balance,
      studentIds: [studentId],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Create migration transaction
    if (balance !== 0) {
      await adminDb.collection(`coaches/${coachId}/wallets/${walletRef.id}/transactions`).add({
        type: balance >= 0 ? 'top-up' : 'adjustment',
        amount: Math.abs(balance),
        balanceAfter: balance,
        description: 'Migrated from previous system',
        studentId,
        date: new Date().toISOString().split('T')[0],
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    walletsCreated.push(walletRef.id);
    studentsProcessed++;
  }

  return NextResponse.json({
    walletsCreated: walletsCreated.length,
    studentsProcessed,
  });
}
```

- [ ] **Step 2: Add a "Migrate" button to the Payments page**

Add a temporary button (only shown when there are students without wallets) that triggers the migration:

```tsx
{unassignedStudents.length > 0 && (
  <Button
    variant="ghost"
    onClick={async () => {
      const res = await fetch('/api/migrate-wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: coach.id }),
      });
      const data = await res.json();
      showToast(`Migrated: ${data.walletsCreated} wallets, ${data.studentsProcessed} students`, 'success');
    }}
  >
    Migrate existing students to wallets
  </Button>
)}
```

- [ ] **Step 3: Test migration**

Run: `npm run dev`
Go to Payments → click Migrate. Verify:
- Wallets created for each student
- Linked students merged into primary's wallet
- Balances computed correctly
- Migration transactions created

- [ ] **Step 4: Commit**

```bash
git add src/app/api/migrate-wallets/route.ts src/app/dashboard/payments/page.tsx
git commit -m "feat: add migration endpoint to convert existing student data to wallets"
```

---

### Task 13: Clean up old payment fields from student page

**Files:**
- Modify: `src/app/dashboard/students/page.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Remove old payment-related state variables from students page**

Remove all `useState` for: `recordPaymentAmount`, `recordPaymentDate`, `renewAmount`, and any other prepaid/monetary-balance related state that has been replaced by the wallet system.

- [ ] **Step 2: Remove old payment recording handlers**

Remove the handlers that create `payments` docs and update `pendingPayment` / `monetaryBalance` on student docs. These are replaced by wallet operations.

- [ ] **Step 3: Remove old package management handlers**

Remove `addPrepaid`, renewal modal logic, early renewal buttons, and any code that sets `prepaidTotal`, `prepaidUsed`, `nextPrepaidTotal`, `packageSize` on student docs.

- [ ] **Step 4: Clean up ad-hoc class creation in dashboard**

In `src/app/dashboard/page.tsx`, the `handleAddClass` function currently sets prepaid fields when creating students. Remove the prepaid/package setup logic — just create the student and booking. The wallet assignment happens separately.

- [ ] **Step 5: Remove paySeparately logic from mark-as-done**

The `paySeparately` flag on lesson logs was a workaround for the old system. With wallets, a lesson either charges a wallet or doesn't (payPerLesson). Remove `paySeparately` state, checkbox, and all related branching from the mark-done modal and handler.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Clean build. All old payment counter logic removed.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/students/page.tsx src/app/dashboard/page.tsx
git commit -m "refactor: remove old payment counters and prepaid package logic"
```

---

### Task 14: Final verification and cleanup

**Files:**
- Modify: `src/types/index.ts` (optional: remove deprecated fields from Student type)
- Delete: `src/app/api/migrate-wallets/route.ts` (after migration is done)

- [ ] **Step 1: Run full build**

```bash
npm run build
```

- [ ] **Step 2: Manual E2E test checklist**

Test these flows end-to-end:
1. Create a wallet → top up → verify balance
2. Create student → link to wallet → verify badge on student card
3. Create booking → wallet auto-assigned → verify on booking
4. Mark lesson done → wallet charged → transaction appears
5. Delete lesson log → wallet refunded → refund transaction appears
6. Family scenario: create wallet with 2 students → each student's lessons charge same wallet
7. Group lesson: 2 students same wallet → mark done → 2 charges on wallet
8. Group lesson: 2 students different wallets → mark done → 1 charge each wallet
9. Negative balance: top up 0, mark done → balance goes negative
10. Adjustment: add/deduct from wallet → verify transaction and balance
11. Payments → Overview tab → income stats display correctly
12. Payments → History tab → all transactions visible

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments from E2E testing"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin redesign
```
