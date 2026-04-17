'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, doc, addDoc, updateDoc, serverTimestamp, increment, Firestore, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useWallets, useWalletTransactions, useStudents, useBookings, useLessonLogs } from '@/hooks/useCoachData';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { formatTimeDisplay } from '@/lib/availability-engine';
import { formatDateMedium } from '@/lib/date-format';
import type { Wallet, WalletTransaction } from '@/types';

const TABS = ['Overview', 'Wallets', 'History'] as const;
type Tab = typeof TABS[number];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  return { start: fmt(monday), end: fmt(sunday) };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  return { start: fmt(start), end: fmt(end) };
}

// ─── WalletDetail ────────────────────────────────────────────────────────────

function WalletDetail({
  coachId,
  wallet,
  students,
  wallets,
  onTopUp,
  onAdjust,
  showToast,
}: {
  coachId: string;
  wallet: Wallet;
  students: { id: string; clientName: string }[];
  wallets: Wallet[];
  onTopUp: () => void;
  onAdjust: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [txnLimit, setTxnLimit] = useState(20);
  const { transactions } = useWalletTransactions(coachId, wallet.id, txnLimit);
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
        <p
          className={`text-3xl font-bold ${
            wallet.balance >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {wallet.balance < 0 ? '-' : ''}RM {Math.abs(wallet.balance).toFixed(0)}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button onClick={onTopUp} className="flex-1">
          + Top Up
        </Button>
        <Button variant="ghost" onClick={onAdjust} className="flex-1">
          Adjustment
        </Button>
      </div>

      {/* Linked students */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Linked Students</p>
        {linkedStudents.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No students linked yet.</p>
        ) : (
          <div className="space-y-2">
            {linkedStudents.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-gray-50 dark:bg-[#2a2a2a] px-3 py-2 rounded-lg"
              >
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
            onChange={(e) => {
              if (e.target.value) handleAddStudent(e.target.value);
            }}
            disabled={addingStudent}
          >
            <option value="">+ Add student to wallet...</option>
            {unlinkedStudents.map((s) => (
              <option key={s.id} value={s.id}>
                {s.clientName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Recent transactions */}
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">Transactions</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No transactions yet.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
              >
                <div>
                  <p className="text-sm text-gray-800 dark:text-zinc-200">{txn.description}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{txn.date}</p>
                </div>
                <p
                  className={`text-sm font-medium ${
                    txn.amount < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {txn.amount < 0 ? '-' : '+'}RM {Math.abs(txn.amount).toFixed(0)}
                </p>
              </div>
            ))}
            {transactions.length >= txnLimit && (
            <button
              onClick={() => setTxnLimit(txnLimit + 20)}
              className="w-full text-center py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Load more
            </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PaymentsPage ─────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { coach } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('Wallets');

  // Wallets + students data
  const { wallets } = useWallets(coach?.id);
  const { students } = useStudents(coach?.id);

  // Overview data
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { lessonLogs } = useLessonLogs(coach?.id, undefined, undefined, 1);

  // All transactions across wallets (for History tab)
  const [historyLimit, setHistoryLimit] = useState(20);
  const [allTransactions, setAllTransactions] = useState<(WalletTransaction & { walletName: string })[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  // Stable wallet identity — only re-run listeners when wallet IDs change
  const walletIds = wallets.map(w => w.id).join(',');

  useEffect(() => {
    if (!coach?.id || !db || !walletIds) return;
    const firestore = db as Firestore;
    const unsubs: (() => void)[] = [];
    const txnsByWallet = new Map<string, (WalletTransaction & { walletName: string })[]>();
    const atLimitByWallet = new Map<string, boolean>();

    for (const wallet of wallets) {
      const q = query(
        collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(historyLimit)
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
        atLimitByWallet.set(wallet.id, snap.docs.length >= historyLimit);
        const merged = Array.from(txnsByWallet.values()).flat();
        merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setAllTransactions(merged);
        setHasMoreHistory(Array.from(atLimitByWallet.values()).some(v => v));
      });
      unsubs.push(unsub);
    }

    return () => unsubs.forEach((u) => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach?.id, walletIds, historyLimit]);

  // Wallet detail panel
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  // Keep selectedWallet in sync with live wallet data
  useEffect(() => {
    if (selectedWallet) {
      const updated = wallets.find((w) => w.id === selectedWallet.id);
      if (updated) {
        setSelectedWallet(updated);
      }
    }
  }, [wallets]);

  // Create wallet modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletStudentIds, setNewWalletStudentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Top-up modal
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpDate, setTopUpDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [toppingUp, setToppingUp] = useState(false);

  // Adjustment modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjType, setAdjType] = useState<'add' | 'deduct'>('add');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Students not yet assigned to any wallet
  const unassignedStudents = students.filter(
    (s) => !wallets.some((w) => w.studentIds.includes(s.id))
  );

  // ── Overview calculations ──────────────────────────────────────────────────

  const recurringBookings = useMemo(() => bookings.filter((b) => !b.endDate), [bookings]);
  const weeklyTotal = useMemo(() => recurringBookings.reduce((sum, b) => sum + (b.price ?? 0), 0), [recurringBookings]);
  const monthlyTotal = useMemo(() => weeklyTotal * (52 / 12), [weeklyTotal]);

  const weekRange = useMemo(() => getWeekRange(), []);
  const monthRange = useMemo(() => getMonthRange(), []);

  const weekActual = useMemo(() => {
    return lessonLogs
      .filter((l) => l.date >= weekRange.start && l.date <= weekRange.end)
      .reduce((sum, l) => sum + l.price, 0);
  }, [lessonLogs, weekRange]);

  const monthActual = useMemo(() => {
    return lessonLogs
      .filter((l) => l.date >= monthRange.start && l.date <= monthRange.end)
      .reduce((sum, l) => sum + l.price, 0);
  }, [lessonLogs, monthRange]);

  const totalBalance = useMemo(
    () => wallets.filter((w) => w.balance > 0).reduce((sum, w) => sum + w.balance, 0),
    [wallets]
  );

  const totalUnpaid = useMemo(
    () => wallets.filter((w) => w.balance < 0).reduce((sum, w) => sum + Math.abs(w.balance), 0),
    [wallets]
  );

  const recentLogs = useMemo(
    () => [...lessonLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
    [lessonLogs]
  );

  const formatRM = (amount: number) =>
    `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!coach) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreateWallet = async () => {
    if (!db || !newWalletName.trim()) return;
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
      showToast('Wallet created', 'success');
      setShowCreateModal(false);
      setNewWalletName('');
      setNewWalletStudentIds([]);
    } catch {
      showToast('Failed to create wallet', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleTopUp = async () => {
    if (!db || !selectedWallet) return;
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setToppingUp(true);
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id);
      const txnCol = collection(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id, 'transactions');
      const newBalance = selectedWallet.balance + amount;
      await addDoc(txnCol, {
        type: 'top-up',
        amount,
        balanceAfter: newBalance,
        description: `Top up`,
        date: topUpDate,
        createdAt: serverTimestamp(),
      });
      await updateDoc(walletRef, {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });
      showToast(`RM ${amount.toFixed(0)} added to ${selectedWallet.name}`, 'success');
      setShowTopUpModal(false);
      setTopUpAmount('');
    } catch {
      showToast('Failed to top up wallet', 'error');
    } finally {
      setToppingUp(false);
    }
  };

  const handleAdjustment = async () => {
    if (!db || !selectedWallet) return;
    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    const delta = adjType === 'add' ? amount : -amount;
    const description = `${adjType === 'add' ? '+' : '-'} ${adjDescription.trim() || 'Manual adjustment'}`;
    setAdjusting(true);
    try {
      const firestore = db as Firestore;
      const walletRef = doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id);
      const txnCol = collection(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id, 'transactions');
      const newBalance = selectedWallet.balance + delta;
      const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      await addDoc(txnCol, {
        type: 'adjustment',
        amount: delta,
        balanceAfter: newBalance,
        description,
        date: today,
        createdAt: serverTimestamp(),
      });
      await updateDoc(walletRef, {
        balance: increment(delta),
        updatedAt: serverTimestamp(),
      });
      showToast('Adjustment applied', 'success');
      setShowAdjustModal(false);
      setAdjAmount('');
      setAdjDescription('');
      setAdjType('add');
    } catch {
      showToast('Failed to apply adjustment', 'error');
    } finally {
      setAdjusting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* ── Overview tab ── */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333] p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Total Balance</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatRM(totalBalance)}</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">across {wallets.filter((w) => w.balance > 0).length} wallets</p>
            </div>
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333] p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Total Unpaid</p>
              <p className={`text-xl font-bold ${totalUnpaid > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-zinc-500'}`}>
                {formatRM(totalUnpaid)}
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{wallets.filter((w) => w.balance < 0).length} wallets owe you</p>
            </div>
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333] p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">This Month (Actual)</p>
              <p className="text-xl font-bold text-gray-900 dark:text-zinc-100">{formatRM(monthActual)}</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">vs {formatRM(monthlyTotal)} projected</p>
            </div>
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333] p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">This Week (Actual)</p>
              <p className="text-xl font-bold text-gray-900 dark:text-zinc-100">{formatRM(weekActual)}</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">vs {formatRM(weeklyTotal)} projected</p>
            </div>
          </div>

          {/* Recent lessons */}
          {recentLogs.length > 0 && (
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333]">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-[#333333]">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Recent Lessons</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-[#333333]">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Student</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400 hidden sm:table-cell">Time</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0">
                        <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{log.date}</td>
                        <td className="px-4 py-3 text-gray-800 dark:text-zinc-200">{log.studentName}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-zinc-500 hidden sm:table-cell">
                          {formatTimeDisplay(log.startTime)} &ndash; {formatTimeDisplay(log.endTime)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {log.price > 0 ? (
                            <span className="text-gray-900 dark:text-zinc-100 font-medium">RM {log.price}</span>
                          ) : (
                            <span className="text-gray-400 dark:text-zinc-500">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Projected income */}
          {recurringBookings.length > 0 && (
            <div className="bg-white dark:bg-[#1f1f1f] rounded-xl border border-gray-100 dark:border-[#333333]">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-[#333333]">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Projected from Recurring Bookings</h2>
              </div>
              <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-[#333333]">
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Weekly</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-zinc-100">{formatRM(weeklyTotal)}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Monthly</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-zinc-100">{formatRM(monthlyTotal)}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Annual</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-zinc-100">{formatRM(weeklyTotal * 52)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {lessonLogs.length === 0 && wallets.length === 0 && (
            <p className="text-gray-500 dark:text-zinc-400 text-center py-12">No data yet. Create wallets and record lessons to see your overview.</p>
          )}
        </div>
      )}

      {/* ── History tab ── */}
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
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400 hidden sm:table-cell">Wallet</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Description</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-zinc-400 hidden sm:table-cell">Type</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-zinc-400">Amount</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-zinc-400 hidden md:table-cell">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {allTransactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-gray-50 dark:border-[#2a2a2a] last:border-0">
                      <td className="px-4 py-3 text-gray-600 dark:text-zinc-400">{txn.date}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-zinc-200 hidden sm:table-cell">{txn.walletName}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-zinc-200">{txn.description}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          txn.type === 'charge' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : txn.type === 'top-up' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : txn.type === 'refund' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {txn.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${txn.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {txn.amount < 0 ? '-' : '+'}RM {Math.abs(txn.amount).toFixed(0)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-zinc-400 hidden md:table-cell">RM {txn.balanceAfter.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMoreHistory && (
              <button
                onClick={() => setHistoryLimit(historyLimit + 20)}
                className="w-full text-center py-3 text-sm text-blue-600 dark:text-blue-400 hover:underline border-t border-gray-100 dark:border-[#333333]"
              >
                Load more
              </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Wallets tab ── */}
      {activeTab === 'Wallets' && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}
            </p>
            <Button onClick={() => setShowCreateModal(true)}>+ New Wallet</Button>
          </div>

          {/* Wallet cards grid */}
          {wallets.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-zinc-500">
              <p className="text-lg font-medium mb-1">No wallets yet</p>
              <p className="text-sm">Create a wallet to track prepaid balances for students.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {wallets.map((wallet) => {
                const linkedStudents = students.filter((s) => wallet.studentIds.includes(s.id));

                return (
                  <button
                    key={wallet.id}
                    onClick={() => setSelectedWallet(wallet)}
                    className="text-left w-full bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#333333] rounded-xl p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  >
                    {/* Name + student count */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-gray-900 dark:text-zinc-100 truncate">
                        {wallet.name}
                      </span>
                      {linkedStudents.length > 0 && (
                        <span className="ml-2 flex-shrink-0 text-xs bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-zinc-400 px-2 py-0.5 rounded-full">
                          {linkedStudents.length} {linkedStudents.length === 1 ? 'student' : 'students'}
                        </span>
                      )}
                    </div>

                    {/* Balance */}
                    <p
                      className={`text-2xl font-bold mb-1 ${
                        wallet.balance >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {wallet.balance < 0 ? '-' : ''}RM {Math.abs(wallet.balance).toFixed(0)}
                    </p>

                    {/* Owes label */}
                    {wallet.balance < 0 ? (
                      <p className="text-xs text-red-500 dark:text-red-400">Owes you</p>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-zinc-500">&nbsp;</p>
                    )}

                    {/* Linked student names */}
                    {linkedStudents.length > 0 && (
                      <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 truncate">
                        {linkedStudents.map((s) => s.clientName).join(', ')}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Wallet Detail Modal ── */}
      <Modal
        isOpen={!!selectedWallet}
        onClose={() => setSelectedWallet(null)}
        title={selectedWallet?.name ?? ''}
      >
        {selectedWallet && (
          <WalletDetail
            coachId={coach.id}
            wallet={selectedWallet}
            students={students}
            wallets={wallets}
            onTopUp={() => setShowTopUpModal(true)}
            onAdjust={() => setShowAdjustModal(true)}
            showToast={showToast}
          />
        )}
      </Modal>

      {/* ── Create Wallet Modal ── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewWalletName('');
          setNewWalletStudentIds([]);
        }}
        title="New Wallet"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Wallet Name
            </label>
            <Input
              value={newWalletName}
              onChange={(e) => setNewWalletName(e.target.value)}
              placeholder="e.g. Ahmad Family"
              autoFocus
            />
          </div>

          {unassignedStudents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
                Link Students (optional)
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {unassignedStudents.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={newWalletStudentIds.includes(s.id)}
                      onChange={(e) => {
                        setNewWalletStudentIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                        );
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-800 dark:text-zinc-200">{s.clientName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleCreateWallet}
              loading={creating}
              disabled={!newWalletName.trim() || creating}
              className="flex-1"
            >
              Create Wallet
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowCreateModal(false);
                setNewWalletName('');
                setNewWalletStudentIds([]);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Top-up Modal ── */}
      <Modal
        isOpen={showTopUpModal}
        onClose={() => {
          setShowTopUpModal(false);
          setTopUpAmount('');
        }}
        title={`Top Up — ${selectedWallet?.name ?? ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Amount (RM)
            </label>
            <Input
              type="number"
              min="1"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Date
            </label>
            <Input
              type="date"
              value={topUpDate}
              onChange={(e) => setTopUpDate(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleTopUp}
              loading={toppingUp}
              disabled={!topUpAmount || toppingUp}
              className="flex-1"
            >
              Add Funds
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowTopUpModal(false);
                setTopUpAmount('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Adjustment Modal ── */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false);
          setAdjAmount('');
          setAdjDescription('');
          setAdjType('add');
        }}
        title={`Adjustment — ${selectedWallet?.name ?? ''}`}
      >
        <div className="space-y-4">
          {/* Add / Deduct toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setAdjType('add')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                adjType === 'add'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-400'
                  : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-zinc-400 border border-transparent'
              }`}
            >
              Add
            </button>
            <button
              onClick={() => setAdjType('deduct')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                adjType === 'deduct'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-400'
                  : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-zinc-400 border border-transparent'
              }`}
            >
              Deduct
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Amount (RM)
            </label>
            <Input
              type="number"
              min="1"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Description (optional)
            </label>
            <Input
              value={adjDescription}
              onChange={(e) => setAdjDescription(e.target.value)}
              placeholder="e.g. Correction, missed charge..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleAdjustment}
              loading={adjusting}
              disabled={!adjAmount || adjusting}
              className="flex-1"
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowAdjustModal(false);
                setAdjAmount('');
                setAdjDescription('');
                setAdjType('add');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
