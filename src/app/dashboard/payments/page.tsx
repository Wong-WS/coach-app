'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  setDoc,
  increment,
  deleteField,
  Firestore,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import {
  useWallets,
  useWalletTransactions,
  useStudents,
  useBookings,
  useLessonLogs,
  useClassExceptions,
} from '@/hooks/useCoachData';
import { useToast } from '@/components/ui/Toast';
import { getScheduledRevenueForDateRange } from '@/lib/class-schedule';
import {
  isLowBalance,
  getWalletStatus,
  getWalletHealth,
} from '@/lib/wallet-alerts';
import { useSearchParams } from 'next/navigation';
import {
  Btn,
  Chip,
  Avatar,
  PaperModal,
  IconPlus,
  IconSearch,
  IconArrowUp,
  IconArrowDown,
} from '@/components/paper';
import type { Wallet, WalletTransaction, DayOfWeek } from '@/types';

const PORTAL_BASE_URL = 'https://coach-simplify.com';

// ─── Shared styles ───────────────────────────────────────────────────────────

const paperInputClass =
  'w-full px-3 py-2.5 rounded-[10px] border text-[13.5px] outline-none focus:border-[color:var(--accent)]';
const paperInputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  borderColor: 'var(--line-2)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
  appearance: 'none',
  minWidth: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

function getLastMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

function formatRM(amount: number): string {
  return `RM ${Math.round(amount).toLocaleString('en-MY')}`;
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'bad' | 'warn' | 'good';
}) {
  const color =
    tone === 'bad'
      ? 'var(--bad)'
      : tone === 'warn'
        ? 'var(--warn)'
        : tone === 'good'
          ? 'var(--good)'
          : 'var(--ink)';
  return (
    <div
      className="rounded-[12px] border p-3.5"
      style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase"
        style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
      >
        {label}
      </div>
      <div
        className="mono tnum mt-1 text-[20px] sm:text-[22px] font-semibold"
        style={{ color, letterSpacing: '-0.5px' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Wallet card ─────────────────────────────────────────────────────────────

function WalletCard({
  wallet,
  bookings,
  exceptions,
  completedLogs,
  todayStr,
  linkedStudents,
  selected,
  onClick,
}: {
  wallet: Wallet;
  bookings: import('@/types').Booking[];
  exceptions: import('@/types').ClassException[];
  completedLogs: import('@/types').LessonLog[];
  todayStr: string;
  linkedStudents: { id: string; clientName: string }[];
  selected: boolean;
  onClick: () => void;
}) {
  const { health, rate, lessonsLeft } = getWalletHealth(
    wallet,
    bookings,
    exceptions,
    completedLogs,
    todayStr,
  );

  const balanceColor =
    health === 'owing'
      ? 'var(--bad)'
      : health === 'empty' || health === 'low'
        ? 'var(--warn)'
        : 'var(--ink)';

  const subtitle =
    linkedStudents.length === 0
      ? 'No students linked'
      : linkedStudents.length === 1
        ? linkedStudents[0].clientName
        : `${linkedStudents.length} students`;

  const footer =
    health === 'owing'
      ? 'Owes you'
      : health === 'tab'
        ? 'Tab mode'
        : health === 'inactive'
          ? rate <= 0 ? 'No lessons scheduled' : ''
          : health === 'empty'
            ? "Can't cover next lesson"
            : health === 'low'
              ? '1 lesson left'
              : `${lessonsLeft} lessons left`;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-[12px] border p-3.5 transition-colors"
      style={{
        background: 'var(--panel)',
        borderColor: selected ? 'var(--ink)' : 'var(--line)',
        boxShadow: selected ? 'var(--shadow-sm)' : 'none',
      }}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar name={wallet.name} size={30} />
        <div className="flex-1 min-w-0">
          <div
            className="text-[13.5px] font-semibold truncate"
            style={{ color: 'var(--ink)' }}
          >
            {wallet.name}
          </div>
          <div className="text-[11.5px] truncate" style={{ color: 'var(--ink-3)' }}>
            {subtitle}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {wallet.archived && <Chip tone="soft">Archived</Chip>}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2.5">
        <div className="min-w-0">
          <div
            className="mono tnum text-[22px] font-semibold"
            style={{ color: balanceColor, letterSpacing: '-0.6px' }}
          >
            {wallet.balance < 0 ? '−' : ''}RM {Math.abs(wallet.balance).toFixed(0)}
          </div>
          {footer && (
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
              {footer}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {health === 'owing' && <Chip tone="bad">Owing</Chip>}
          {health === 'empty' && <Chip tone="bad">Empty</Chip>}
          {health === 'low' && <Chip tone="warn">Low</Chip>}
        </div>
      </div>
    </button>
  );
}

// ─── Wallet detail panel ─────────────────────────────────────────────────────

function WalletDetailBody({
  coachId,
  wallet,
  students,
  wallets,
  onTopUp,
  onAdjust,
  onToggleTabMode,
  onArchive,
  onDelete,
  showToast,
}: {
  coachId: string;
  wallet: Wallet;
  students: { id: string; clientName: string }[];
  wallets: Wallet[];
  onTopUp: () => void;
  onAdjust: () => void;
  onToggleTabMode: () => void;
  onArchive: () => void;
  onDelete: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [txnLimit, setTxnLimit] = useState(12);
  const { transactions } = useWalletTransactions(coachId, wallet.id, txnLimit);
  const linkedStudents = students.filter((s) => wallet.studentIds.includes(s.id));
  const unlinkedStudents = students.filter(
    (s) => !wallets.some((w) => w.studentIds.includes(s.id)),
  );
  const [addingStudent, setAddingStudent] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(wallet.name);
  const [savingName, setSavingName] = useState(false);

  const [editingTopUp, setEditingTopUp] = useState(false);
  const [topUpValue, setTopUpValue] = useState(
    wallet.usualTopUp != null ? String(wallet.usualTopUp) : '',
  );
  const [savingTopUp, setSavingTopUp] = useState(false);

  const handleSaveTopUp = async () => {
    if (!db) return;
    setSavingTopUp(true);
    try {
      const firestore = db as Firestore;
      const trimmed = topUpValue.trim();
      const parsed = trimmed === '' ? null : parseInt(trimmed, 10);
      if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
        showToast('Enter a whole number (0 or more)', 'error');
        return;
      }
      await updateDoc(doc(firestore, 'coaches', coachId, 'wallets', wallet.id), {
        usualTopUp: parsed === null ? deleteField() : parsed,
        updatedAt: serverTimestamp(),
      });
      showToast('Usual top-up saved', 'success');
      setEditingTopUp(false);
    } catch {
      showToast('Failed to save usual top-up', 'error');
    } finally {
      setSavingTopUp(false);
    }
  };

  const handleSaveName = async () => {
    if (!db) return;
    const name = renameValue.trim();
    if (!name || name === wallet.name) {
      setRenaming(false);
      setRenameValue(wallet.name);
      return;
    }
    setSavingName(true);
    try {
      const firestore = db as Firestore;
      await updateDoc(doc(firestore, 'coaches', coachId, 'wallets', wallet.id), {
        name,
        updatedAt: serverTimestamp(),
      });
      showToast('Wallet renamed', 'success');
      setRenaming(false);
    } catch {
      showToast('Failed to rename wallet', 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleAddStudent = async (studentId: string) => {
    if (!db) return;
    setAddingStudent(true);
    try {
      const firestore = db as Firestore;
      await updateDoc(doc(firestore, 'coaches', coachId, 'wallets', wallet.id), {
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
      await updateDoc(doc(firestore, 'coaches', coachId, 'wallets', wallet.id), {
        studentIds: wallet.studentIds.filter((id) => id !== studentId),
        updatedAt: serverTimestamp(),
      });
      showToast('Student removed from wallet', 'success');
    } catch {
      showToast('Failed to remove student', 'error');
    }
  };

  const [sharingPortal, setSharingPortal] = useState(false);

  const handleSharePortalLink = async () => {
    if (!db) return;
    if (wallet.archived) return;
    setSharingPortal(true);
    try {
      const needsWrite = !wallet.portalToken;
      const token = wallet.portalToken ?? nanoid(10);
      const url = `${PORTAL_BASE_URL}/portal/${token}`;
      // Kick off clipboard write synchronously so the user-activation gesture
      // isn't consumed by Firestore awaits on first-time share.
      const clipboardPromise = navigator.clipboard?.writeText(url);
      if (needsWrite) {
        const firestore = db as Firestore;
        await setDoc(doc(firestore, 'walletPortalTokens', token), {
          coachId,
          walletId: wallet.id,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(firestore, 'coaches', coachId, 'wallets', wallet.id), {
          portalToken: token,
          updatedAt: serverTimestamp(),
        });
      }
      await clipboardPromise;
      showToast('Portal link copied', 'success');
    } catch {
      showToast('Failed to generate portal link', 'error');
    } finally {
      setSharingPortal(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Big balance block */}
      <div
        className="rounded-[12px] border p-4"
        style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
      >
        <div
          className="text-[10.5px] font-semibold uppercase mb-1"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Current balance
        </div>
        <div
          className="mono tnum text-[30px] font-semibold"
          style={{
            color: wallet.balance < 0 ? 'var(--bad)' : 'var(--ink)',
            letterSpacing: '-0.8px',
          }}
        >
          {wallet.balance < 0 ? '−' : ''}RM {Math.abs(wallet.balance).toFixed(0)}
        </div>
        {wallet.tabMode && (
          <div
            className="text-[11px] mt-1.5"
            style={{ color: 'var(--ink-3)' }}
          >
            Tab mode — pays after each lesson
          </div>
        )}
      </div>

      {/* Usual top-up */}
      {editingTopUp ? (
        <div className="space-y-2">
          <div className="text-[10.5px] font-semibold uppercase" style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
            Usual top-up (RM)
          </div>
          <input
            type="number"
            min={0}
            step={1}
            value={topUpValue}
            onChange={(e) => setTopUpValue(e.target.value)}
            placeholder="e.g. 500"
            autoFocus
            className={paperInputClass}
            style={paperInputStyle}
          />
          <div className="grid grid-cols-2 gap-2">
            <Btn
              variant="primary"
              onClick={handleSaveTopUp}
              disabled={savingTopUp}
            >
              {savingTopUp ? 'Saving…' : 'Save'}
            </Btn>
            <Btn
              variant="outline"
              onClick={() => {
                setEditingTopUp(false);
                setTopUpValue(wallet.usualTopUp != null ? String(wallet.usualTopUp) : '');
              }}
              disabled={savingTopUp}
            >
              Cancel
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {wallet.usualTopUp != null ? (
            <span className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              Usual top-up: RM {wallet.usualTopUp}
            </span>
          ) : (
            <span className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
              No usual top-up set
            </span>
          )}
          <button
            onClick={() => {
              setTopUpValue(wallet.usualTopUp != null ? String(wallet.usualTopUp) : '');
              setEditingTopUp(true);
            }}
            className="text-[12px] font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {wallet.usualTopUp != null ? 'Edit' : 'Set'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Btn variant="primary" onClick={onTopUp}>
          <IconArrowUp size={13} /> Top up
        </Btn>
        <Btn variant="outline" onClick={onAdjust}>
          Adjust
        </Btn>
      </div>

      {!wallet.archived && (
        <Btn
          variant="outline"
          full
          onClick={handleSharePortalLink}
          disabled={sharingPortal}
        >
          {sharingPortal ? 'Copying…' : 'Share portal link'}
        </Btn>
      )}

      {/* Linked students */}
      <div>
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Linked students
        </div>
        {linkedStudents.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            No students linked yet.
          </p>
        ) : (
          <div className="space-y-1">
            {linkedStudents.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-3 py-2 rounded-[8px]"
                style={{ background: 'var(--bg)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={s.clientName} size={22} />
                  <span className="text-[13px] truncate" style={{ color: 'var(--ink)' }}>
                    {s.clientName}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveStudent(s.id)}
                  className="text-[11.5px] font-medium"
                  style={{ color: 'var(--bad)' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {unlinkedStudents.length > 0 && (
          <select
            className={`${paperInputClass} mt-2 text-[13px]`}
            style={paperInputStyle}
            value=""
            onChange={(e) => {
              if (e.target.value) handleAddStudent(e.target.value);
            }}
            disabled={addingStudent}
          >
            <option value="">+ Add student to wallet…</option>
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
        <div
          className="text-[10.5px] font-semibold uppercase mb-2"
          style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
        >
          Recent transactions
        </div>
        {transactions.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
            No transactions yet.
          </p>
        ) : (
          <div className="flex flex-col">
            {transactions.map((txn) => (
              <TxnRow key={txn.id} txn={txn} />
            ))}
            {transactions.length >= txnLimit && (
              <button
                onClick={() => setTxnLimit(txnLimit + 12)}
                className="w-full text-center py-2 text-[12.5px] font-medium"
                style={{ color: 'var(--accent)' }}
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rename + Delete */}
      <div
        className="pt-3 border-t flex flex-col gap-2"
        style={{ borderColor: 'var(--line)' }}
      >
        {renaming ? (
          <div className="space-y-2">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Wallet name"
              autoFocus
              className={paperInputClass}
              style={paperInputStyle}
            />
            <div className="grid grid-cols-2 gap-2">
              <Btn
                variant="primary"
                onClick={handleSaveName}
                disabled={!renameValue.trim() || savingName}
              >
                {savingName ? 'Saving…' : 'Save'}
              </Btn>
              <Btn
                variant="outline"
                onClick={() => {
                  setRenaming(false);
                  setRenameValue(wallet.name);
                }}
                disabled={savingName}
              >
                Cancel
              </Btn>
            </div>
          </div>
        ) : (
          <Btn
            variant="ghost"
            onClick={() => {
              setRenameValue(wallet.name);
              setRenaming(true);
            }}
          >
            Rename wallet
          </Btn>
        )}
        <Btn variant="ghost" onClick={onToggleTabMode}>
          {wallet.tabMode ? 'Turn off tab mode' : 'Turn on tab mode'}
        </Btn>
        <Btn variant="ghost" onClick={onArchive}>
          {wallet.archived ? 'Unarchive wallet' : 'Archive wallet'}
        </Btn>
        <button
          onClick={onDelete}
          className="text-[13.5px] font-medium py-2 rounded-[8px]"
          style={{ color: 'var(--bad)' }}
        >
          Delete wallet
        </button>
      </div>
    </div>
  );
}

// ─── Transaction row (shared by detail panel and history tab) ────────────────

function TxnRow({
  txn,
  subtitle,
}: {
  txn: WalletTransaction & { walletName?: string };
  subtitle?: string;
}) {
  const positive = txn.amount > 0;
  const sub = subtitle ?? txn.date;
  return (
    <div
      className="flex items-center gap-2.5 py-2.5 border-b last:border-0"
      style={{ borderColor: 'var(--line)' }}
    >
      <div
        className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0"
        style={{
          background: positive ? 'var(--good-soft)' : 'var(--line)',
          color: positive ? 'var(--good)' : 'var(--ink-2)',
        }}
      >
        {positive ? <IconArrowUp size={13} /> : <IconArrowDown size={13} />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] font-medium truncate"
          style={{ color: 'var(--ink)' }}
        >
          {txn.description || txn.type}
        </div>
        <div className="text-[11px] mono" style={{ color: 'var(--ink-3)' }}>
          {sub}
        </div>
      </div>
      <div
        className="mono tnum text-[13px] font-medium shrink-0"
        style={{ color: positive ? 'var(--good)' : 'var(--ink)' }}
      >
        {positive ? '+' : ''}RM {Math.abs(txn.amount).toFixed(0)}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const { coach } = useAuth();
  const { showToast } = useToast();

  const { wallets } = useWallets(coach?.id);
  const { students } = useStudents(coach?.id);
  const { bookings } = useBookings(coach?.id, 'confirmed');
  const { classExceptions } = useClassExceptions(coach?.id);
  const { lessonLogs } = useLessonLogs(coach?.id, undefined, undefined, 2);

  const walletIds = wallets.map((w) => w.id).join(',');

  // Uncapped listener for this-month top-ups (stat bar).
  const [monthTopUps, setMonthTopUps] = useState(0);
  const monthRange = useMemo(() => getMonthRange(), []);

  useEffect(() => {
    if (!coach?.id || !db || !walletIds) {
      setMonthTopUps(0);
      return;
    }
    const firestore = db as Firestore;
    const unsubs: (() => void)[] = [];
    const byWallet = new Map<string, number>();

    for (const wallet of wallets) {
      const q = query(
        collection(firestore, 'coaches', coach.id, 'wallets', wallet.id, 'transactions'),
        orderBy('createdAt', 'desc'),
        limit(120),
      );
      const unsub = onSnapshot(q, (snap) => {
        let sum = 0;
        for (const d of snap.docs) {
          const data = d.data();
          if (data.type !== 'top-up') continue;
          if (!data.date || data.date < monthRange.start || data.date > monthRange.end) continue;
          sum += data.amount ?? 0;
        }
        byWallet.set(wallet.id, sum);
        let total = 0;
        for (const v of byWallet.values()) total += v;
        setMonthTopUps(total);
      });
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach?.id, walletIds, monthRange.start, monthRange.end]);

  // Wallet detail panel.
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    if (!selectedWallet) return;
    const updated = wallets.find((w) => w.id === selectedWallet.id);
    if (updated && updated !== selectedWallet) setSelectedWallet(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets]);

  // Modals.
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletStudentIds, setNewWalletStudentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpDate, setTopUpDate] = useState(() => todayYMD());
  const [toppingUp, setToppingUp] = useState(false);

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjType, setAdjType] = useState<'add' | 'deduct'>('add');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingWallet, setDeletingWallet] = useState(false);

  const [showTabModeModal, setShowTabModeModal] = useState(false);
  const [togglingTabMode, setTogglingTabMode] = useState(false);

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivingWallet, setArchivingWallet] = useState(false);

  // Filters.
  const [walletSearch, setWalletSearch] = useState('');
  const [walletDayFilter, setWalletDayFilter] = useState<
    DayOfWeek | 'all' | 'adhoc' | 'negative' | 'low'
  >('all');
  const [showArchived, setShowArchived] = useState(false);

  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('filter') === 'low') {
      setWalletDayFilter('low');
    }
  }, [searchParams]);

  // Day map for filter pills.
  const recurringBookings = useMemo(
    () => bookings.filter((b) => !b.endDate),
    [bookings],
  );

  const { walletDayMap, activeDays, activeWalletIds } = useMemo(() => {
    const dayMap = new Map<DayOfWeek, Set<string>>();
    const active = new Set<string>();
    for (const booking of recurringBookings) {
      for (const walletId of Object.values(booking.studentWallets)) {
        if (!walletId) continue;
        active.add(walletId);
        if (!dayMap.has(booking.dayOfWeek)) dayMap.set(booking.dayOfWeek, new Set());
        dayMap.get(booking.dayOfWeek)!.add(walletId);
      }
    }
    const allDays: DayOfWeek[] = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];
    return {
      walletDayMap: dayMap,
      activeDays: allDays.filter((d) => dayMap.has(d)),
      activeWalletIds: active,
    };
  }, [recurringBookings]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) map.set(s.id, s.clientName.toLowerCase());
    return map;
  }, [students]);

  const todayStr = useMemo(() => todayYMD(), []);

  const lowCount = useMemo(
    () =>
      wallets.filter(
        (w) =>
          !(w.archived ?? false) &&
          isLowBalance(w, bookings, classExceptions, lessonLogs, todayStr),
      ).length,
    [wallets, bookings, classExceptions, lessonLogs, todayStr],
  );

  const filteredWallets = useMemo(() => {
    let result = wallets;
    if (!showArchived) result = result.filter((w) => !(w.archived ?? false));
    if (walletDayFilter === 'adhoc') {
      result = result.filter((w) => !activeWalletIds.has(w.id));
    } else if (walletDayFilter === 'negative') {
      result = result.filter((w) => w.balance < 0);
    } else if (walletDayFilter === 'low') {
      result = result.filter((w) =>
        isLowBalance(w, bookings, classExceptions, lessonLogs, todayStr),
      );
    } else if (walletDayFilter !== 'all') {
      const dayWallets = walletDayMap.get(walletDayFilter);
      result = dayWallets ? result.filter((w) => dayWallets.has(w.id)) : [];
    }
    const q = walletSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.studentIds.some((id) => studentNameById.get(id)?.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [
    wallets,
    walletDayFilter,
    walletDayMap,
    activeWalletIds,
    walletSearch,
    studentNameById,
    showArchived,
    bookings,
    classExceptions,
    lessonLogs,
    todayStr,
  ]);

  useEffect(() => {
    if (
      walletDayFilter !== 'all' &&
      walletDayFilter !== 'adhoc' &&
      walletDayFilter !== 'negative' &&
      walletDayFilter !== 'low' &&
      !activeDays.includes(walletDayFilter)
    ) {
      setWalletDayFilter('all');
    }
  }, [activeDays, walletDayFilter]);

  // Stats.
  const lastMonthRange = useMemo(() => getLastMonthRange(), []);
  const needsAttention = useMemo(() => {
    let owing = 0;
    let empty = 0;
    let low = 0;
    for (const w of wallets) {
      if (w.archived) continue;
      const { health } = getWalletHealth(
        w,
        bookings,
        classExceptions,
        lessonLogs,
        todayStr,
      );
      if (health === 'owing') owing += 1;
      else if (health === 'empty') empty += 1;
      else if (health === 'low') low += 1;
    }
    return { owing, empty, low };
  }, [wallets, bookings, classExceptions, lessonLogs, todayStr]);
  const monthActual = useMemo(
    () =>
      lessonLogs
        .filter((l) => l.date >= monthRange.start && l.date <= monthRange.end)
        .reduce((sum, l) => sum + l.price, 0),
    [lessonLogs, monthRange],
  );
  const lastMonthActual = useMemo(
    () =>
      lessonLogs
        .filter((l) => l.date >= lastMonthRange.start && l.date <= lastMonthRange.end)
        .reduce((sum, l) => sum + l.price, 0),
    [lessonLogs, lastMonthRange],
  );
  const monthProjected = useMemo(
    () =>
      getScheduledRevenueForDateRange(
        monthRange.start,
        monthRange.end,
        bookings,
        classExceptions,
      ),
    [monthRange, bookings, classExceptions],
  );

  // Top-up presets (require a rate > 0).
  const topUpPresets = useMemo(() => {
    if (!selectedWallet) return null;
    const { rate } = getWalletStatus(
      selectedWallet,
      bookings,
      classExceptions,
      lessonLogs,
      todayStr,
    );
    if (rate <= 0) return null;
    return [rate, rate * 5, rate * 10];
  }, [selectedWallet, bookings, classExceptions, lessonLogs, todayStr]);

  const unassignedStudents = students.filter(
    (s) => !wallets.some((w) => w.studentIds.includes(s.id)),
  );

  if (!coach) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: 'var(--accent)' }}
        />
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
      const txnCol = collection(
        firestore,
        'coaches',
        coach.id,
        'wallets',
        selectedWallet.id,
        'transactions',
      );
      const newBalance = selectedWallet.balance + amount;
      await addDoc(txnCol, {
        type: 'top-up',
        amount,
        balanceAfter: newBalance,
        description: 'Top up',
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
      const txnCol = collection(
        firestore,
        'coaches',
        coach.id,
        'wallets',
        selectedWallet.id,
        'transactions',
      );
      const newBalance = selectedWallet.balance + delta;
      await addDoc(txnCol, {
        type: 'adjustment',
        amount: delta,
        balanceAfter: newBalance,
        description,
        date: todayYMD(),
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

  const handleToggleTabMode = async () => {
    if (!db || !selectedWallet) return;
    setTogglingTabMode(true);
    try {
      const firestore = db as Firestore;
      const next = !(selectedWallet.tabMode ?? false);
      await updateDoc(
        doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id),
        { tabMode: next, updatedAt: serverTimestamp() },
      );
      showToast(next ? 'Tab mode on' : 'Tab mode off', 'success');
      setShowTabModeModal(false);
    } catch {
      showToast('Failed to update tab mode', 'error');
    } finally {
      setTogglingTabMode(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!db || !selectedWallet) return;
    setArchivingWallet(true);
    try {
      const firestore = db as Firestore;
      const next = !(selectedWallet.archived ?? false);
      await updateDoc(
        doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id),
        { archived: next, updatedAt: serverTimestamp() },
      );
      showToast(next ? 'Wallet archived' : 'Wallet unarchived', 'success');
      setShowArchiveModal(false);
      if (next) setSelectedWallet(null);
    } catch {
      showToast('Failed to update', 'error');
    } finally {
      setArchivingWallet(false);
    }
  };

  const handleDeleteWallet = async () => {
    if (!db || !selectedWallet) return;
    setDeletingWallet(true);
    try {
      const firestore = db as Firestore;
      const txnCol = collection(
        firestore,
        'coaches',
        coach.id,
        'wallets',
        selectedWallet.id,
        'transactions',
      );
      const txnSnap = await getDocs(txnCol);
      const chunks: typeof txnSnap.docs[] = [];
      for (let i = 0; i < txnSnap.docs.length; i += 450) {
        chunks.push(txnSnap.docs.slice(i, i + 450));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(firestore);
        for (const d of chunk) batch.delete(d.ref);
        await batch.commit();
      }
      await deleteDoc(doc(firestore, 'coaches', coach.id, 'wallets', selectedWallet.id));
      showToast(`Wallet "${selectedWallet.name}" deleted`, 'success');
      setShowDeleteModal(false);
      setSelectedWallet(null);
    } catch {
      showToast('Failed to delete wallet', 'error');
    } finally {
      setDeletingWallet(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedLinked = selectedWallet
    ? students.filter((s) => selectedWallet.studentIds.includes(s.id))
    : [];

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-7" style={{ color: 'var(--ink)' }}>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <div
            className="text-[11px] font-semibold uppercase"
            style={{ color: 'var(--ink-3)', letterSpacing: '0.06em' }}
          >
            Payments
          </div>
          <div
            className="text-[22px] sm:text-[26px] font-semibold leading-tight"
            style={{ letterSpacing: '-0.6px' }}
          >
            Wallets &amp; ledger
          </div>
        </div>
        <Btn variant="primary" onClick={() => setShowCreateModal(true)}>
          <IconPlus size={14} /> New wallet
        </Btn>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
        <Stat
          label="Needs attention"
          value={needsAttention.owing + needsAttention.empty + needsAttention.low}
          sub={(() => {
            const parts: string[] = [];
            if (needsAttention.owing > 0) parts.push(`${needsAttention.owing} owing`);
            if (needsAttention.empty > 0) parts.push(`${needsAttention.empty} empty`);
            if (needsAttention.low > 0) parts.push(`${needsAttention.low} low`);
            return parts.length ? parts.join(' · ') : 'all healthy';
          })()}
          tone={
            needsAttention.owing > 0 || needsAttention.empty > 0
              ? 'bad'
              : needsAttention.low > 0
                ? 'warn'
                : undefined
          }
        />
        <Stat label="Last month" value={formatRM(lastMonthActual)} sub="earned" />
        <Stat
          label="This month"
          value={formatRM(monthActual)}
          sub={`of ${formatRM(monthProjected)} projected`}
        />
        <Stat label="Top-ups" value={formatRM(monthTopUps)} sub="this month" />
      </div>

      {/* Wallets */}
      <div>
        {wallets.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--ink-3)' }}
                >
                  <IconSearch size={14} />
                </div>
                <input
                  placeholder="Search wallet or student…"
                  value={walletSearch}
                  onChange={(e) => setWalletSearch(e.target.value)}
                  className={`${paperInputClass} pl-9`}
                  style={paperInputStyle}
                />
              </div>
            </div>
          )}

          {/* Filter pills */}
          {activeDays.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <FilterPill
                active={walletDayFilter === 'all'}
                onClick={() => setWalletDayFilter('all')}
              >
                All
              </FilterPill>
              {activeDays.map((day) => (
                <FilterPill
                  key={day}
                  active={walletDayFilter === day}
                  onClick={() => setWalletDayFilter(day)}
                >
                  {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                </FilterPill>
              ))}
              <FilterPill
                active={walletDayFilter === 'adhoc'}
                onClick={() => setWalletDayFilter('adhoc')}
              >
                Ad-hoc
              </FilterPill>
              <FilterPill
                active={walletDayFilter === 'negative'}
                onClick={() => setWalletDayFilter('negative')}
                tone="bad"
              >
                Negative
              </FilterPill>
              <FilterPill
                active={walletDayFilter === 'low'}
                onClick={() => setWalletDayFilter('low')}
                tone="warn"
              >
                Low{lowCount > 0 ? ` (${lowCount})` : ''}
              </FilterPill>
              <label
                className="flex items-center gap-2 text-[12px] ml-auto"
                style={{ color: 'var(--ink-3)' }}
              >
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded"
                />
                Show archived
              </label>
            </div>
          )}

          {wallets.length === 0 ? (
            <div
              className="rounded-[12px] border py-16 text-center"
              style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
            >
              <p
                className="text-[15px] font-semibold mb-1"
                style={{ color: 'var(--ink)' }}
              >
                No wallets yet
              </p>
              <p className="text-[13px]" style={{ color: 'var(--ink-3)' }}>
                Create a wallet to track prepaid balances for students.
              </p>
            </div>
          ) : filteredWallets.length === 0 ? (
            <div
              className="rounded-[12px] border py-12 text-center text-[13px]"
              style={{
                background: 'var(--panel)',
                borderColor: 'var(--line)',
                color: 'var(--ink-3)',
              }}
            >
              {walletDayFilter === 'adhoc'
                ? 'All wallets have recurring bookings.'
                : walletDayFilter === 'negative'
                  ? 'No wallets in the negative.'
                  : walletDayFilter === 'low'
                    ? 'No wallets need topping up.'
                    : walletDayFilter !== 'all'
                      ? `No wallets on ${walletDayFilter.charAt(0).toUpperCase() + walletDayFilter.slice(1)}.`
                      : 'No wallets match your search.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredWallets.map((wallet) => {
                const linked = students.filter((s) => wallet.studentIds.includes(s.id));
                return (
                  <WalletCard
                    key={wallet.id}
                    wallet={wallet}
                    bookings={bookings}
                    exceptions={classExceptions}
                    completedLogs={lessonLogs}
                    todayStr={todayStr}
                    linkedStudents={linked}
                    selected={selectedWallet?.id === wallet.id}
                    onClick={() => setSelectedWallet(wallet)}
                  />
                );
              })}
            </div>
        )}
      </div>

      {/* ── Wallet detail modal ── */}
      <PaperModal
        open={!!selectedWallet}
        onClose={() => setSelectedWallet(null)}
        title={selectedWallet?.name ?? ''}
        width={460}
      >
        {selectedWallet && (
          <WalletDetailBody
            coachId={coach.id}
            wallet={selectedWallet}
            students={students}
            wallets={wallets}
            onTopUp={() => setShowTopUpModal(true)}
            onAdjust={() => setShowAdjustModal(true)}
            onToggleTabMode={() => setShowTabModeModal(true)}
            onArchive={() => setShowArchiveModal(true)}
            onDelete={() => setShowDeleteModal(true)}
            showToast={showToast}
          />
        )}
      </PaperModal>

      {/* ── Create wallet modal ── */}
      <PaperModal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewWalletName('');
          setNewWalletStudentIds([]);
        }}
        title="New wallet"
      >
        <div className="space-y-4">
          <div>
            <label
              className="block text-[12px] font-medium mb-1"
              style={{ color: 'var(--ink-2)' }}
            >
              Wallet name
            </label>
            <input
              value={newWalletName}
              onChange={(e) => setNewWalletName(e.target.value)}
              placeholder="e.g. Ahmad Family"
              autoFocus
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          {unassignedStudents.length > 0 && (
            <div>
              <label
                className="block text-[12px] font-medium mb-2"
                style={{ color: 'var(--ink-2)' }}
              >
                Link students (optional)
              </label>
              <div
                className="rounded-[10px] border max-h-48 overflow-y-auto"
                style={{ borderColor: 'var(--line)' }}
              >
                {unassignedStudents.map((s) => {
                  const checked = newWalletStudentIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b last:border-0"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setNewWalletStudentIds((prev) =>
                            e.target.checked
                              ? [...prev, s.id]
                              : prev.filter((id) => id !== s.id),
                          );
                        }}
                        className="rounded"
                      />
                      <span className="text-[13px]" style={{ color: 'var(--ink)' }}>
                        {s.clientName}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Btn
              variant="primary"
              onClick={handleCreateWallet}
              disabled={!newWalletName.trim() || creating}
            >
              {creating ? 'Creating…' : 'Create wallet'}
            </Btn>
            <Btn
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setNewWalletName('');
                setNewWalletStudentIds([]);
              }}
            >
              Cancel
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* ── Top-up modal ── */}
      <PaperModal
        open={showTopUpModal}
        onClose={() => {
          setShowTopUpModal(false);
          setTopUpAmount('');
        }}
        title={`Top up — ${selectedWallet?.name ?? ''}`}
      >
        <div className="space-y-4">
          {selectedWallet && topUpPresets && (
            <div>
              <label
                className="block text-[12px] font-medium mb-2"
                style={{ color: 'var(--ink-2)' }}
              >
                Quick amounts
              </label>
              <div className="grid grid-cols-3 gap-2">
                {topUpPresets.map((amount, i) => {
                  const label = i === 0 ? '1 lesson' : `${i === 1 ? 5 : 10} lessons`;
                  const active = topUpAmount === String(amount);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTopUpAmount(String(amount))}
                      className="rounded-[10px] border py-2 px-2 text-left transition-colors"
                      style={{
                        background: active ? 'var(--ink)' : 'var(--panel)',
                        color: active ? 'var(--bg)' : 'var(--ink)',
                        borderColor: active ? 'var(--ink)' : 'var(--line-2)',
                      }}
                    >
                      <div
                        className="text-[11px] font-medium"
                        style={{ color: active ? 'var(--bg)' : 'var(--ink-3)' }}
                      >
                        {label}
                      </div>
                      <div className="mono tnum text-[15px] font-semibold">
                        RM {amount.toFixed(0)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label
              className="block text-[12px] font-medium mb-1"
              style={{ color: 'var(--ink-2)' }}
            >
              Amount (RM)
            </label>
            <input
              type="number"
              min="1"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div>
            <label
              className="block text-[12px] font-medium mb-1"
              style={{ color: 'var(--ink-2)' }}
            >
              Date
            </label>
            <input
              type="date"
              value={topUpDate}
              onChange={(e) => setTopUpDate(e.target.value)}
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          {selectedWallet &&
            topUpAmount &&
            !isNaN(parseFloat(topUpAmount)) &&
            parseFloat(topUpAmount) > 0 && (
              <div
                className="rounded-[10px] border p-3 text-[12.5px] flex items-center justify-between"
                style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}
              >
                <span style={{ color: 'var(--ink-3)' }}>New balance</span>
                <span
                  className="mono tnum font-semibold"
                  style={{ color: 'var(--ink)' }}
                >
                  RM {(selectedWallet.balance + parseFloat(topUpAmount)).toFixed(0)}
                </span>
              </div>
            )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Btn
              variant="primary"
              onClick={handleTopUp}
              disabled={!topUpAmount || toppingUp}
            >
              {toppingUp ? 'Adding…' : 'Add funds'}
            </Btn>
            <Btn
              variant="outline"
              onClick={() => {
                setShowTopUpModal(false);
                setTopUpAmount('');
              }}
            >
              Cancel
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* ── Adjustment modal ── */}
      <PaperModal
        open={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false);
          setAdjAmount('');
          setAdjDescription('');
          setAdjType('add');
        }}
        title={`Adjustment — ${selectedWallet?.name ?? ''}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAdjType('add')}
              className="rounded-[10px] border py-2 text-[13px] font-medium transition-colors"
              style={{
                background:
                  adjType === 'add' ? 'var(--good-soft)' : 'var(--panel)',
                color: adjType === 'add' ? 'var(--good)' : 'var(--ink-2)',
                borderColor:
                  adjType === 'add' ? 'var(--good)' : 'var(--line-2)',
              }}
            >
              Add
            </button>
            <button
              onClick={() => setAdjType('deduct')}
              className="rounded-[10px] border py-2 text-[13px] font-medium transition-colors"
              style={{
                background:
                  adjType === 'deduct' ? 'var(--bad-soft)' : 'var(--panel)',
                color: adjType === 'deduct' ? 'var(--bad)' : 'var(--ink-2)',
                borderColor:
                  adjType === 'deduct' ? 'var(--bad)' : 'var(--line-2)',
              }}
            >
              Deduct
            </button>
          </div>

          <div>
            <label
              className="block text-[12px] font-medium mb-1"
              style={{ color: 'var(--ink-2)' }}
            >
              Amount (RM)
            </label>
            <input
              type="number"
              min="1"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div>
            <label
              className="block text-[12px] font-medium mb-1"
              style={{ color: 'var(--ink-2)' }}
            >
              Description (optional)
            </label>
            <input
              value={adjDescription}
              onChange={(e) => setAdjDescription(e.target.value)}
              placeholder="e.g. Correction, missed charge…"
              className={paperInputClass}
              style={paperInputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Btn
              variant="primary"
              onClick={handleAdjustment}
              disabled={!adjAmount || adjusting}
            >
              {adjusting ? 'Applying…' : 'Apply'}
            </Btn>
            <Btn
              variant="outline"
              onClick={() => {
                setShowAdjustModal(false);
                setAdjAmount('');
                setAdjDescription('');
                setAdjType('add');
              }}
            >
              Cancel
            </Btn>
          </div>
        </div>
      </PaperModal>

      {/* ── Delete wallet modal ── */}
      <PaperModal
        open={showDeleteModal}
        onClose={() => !deletingWallet && setShowDeleteModal(false)}
        title="Delete wallet?"
      >
        {selectedWallet && (
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              This will permanently delete{' '}
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {selectedWallet.name}
              </span>{' '}
              and all its transaction history.
            </p>
            {selectedLinked.length > 0 && (
              <div
                className="rounded-[10px] border p-3 text-[12.5px]"
                style={{
                  background: 'var(--warn-soft)',
                  borderColor: 'var(--warn)',
                  color: 'var(--warn)',
                }}
              >
                <span className="font-semibold">
                  {selectedLinked.length}{' '}
                  {selectedLinked.length === 1 ? 'student' : 'students'}
                </span>{' '}
                will be unlinked: {selectedLinked.map((s) => s.clientName).join(', ')}.
              </div>
            )}
            {selectedWallet.balance !== 0 && (
              <div
                className="rounded-[10px] border p-3 text-[12.5px]"
                style={{
                  background: 'var(--warn-soft)',
                  borderColor: 'var(--warn)',
                  color: 'var(--warn)',
                }}
              >
                This wallet has a balance of{' '}
                <span className="font-semibold">
                  {selectedWallet.balance < 0 ? '−' : ''}RM{' '}
                  {Math.abs(selectedWallet.balance).toFixed(0)}
                </span>
                {selectedWallet.balance < 0 ? ' owed' : ' remaining'} — this will be
                lost.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleDeleteWallet}
                disabled={deletingWallet}
                className="rounded-[8px] py-2 text-[13.5px] font-medium transition-colors disabled:opacity-55"
                style={{ background: 'var(--bad)', color: '#fff' }}
              >
                {deletingWallet ? 'Deleting…' : 'Delete'}
              </button>
              <Btn
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingWallet}
              >
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </PaperModal>

      {/* ── Tab mode confirmation ── */}
      <PaperModal
        open={showTabModeModal}
        onClose={() => !togglingTabMode && setShowTabModeModal(false)}
        title={selectedWallet?.tabMode ? 'Turn off tab mode?' : 'Turn on tab mode?'}
      >
        {selectedWallet && (
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {selectedWallet.tabMode ? (
                <>
                  This wallet will go back to prepaid mode. Low-balance alerts
                  will fire when the balance drops below two lessons worth.
                </>
              ) : (
                <>
                  Tab mode is for students who pay after each lesson instead of
                  prepaying. The wallet will be excluded from low-balance alerts
                  so it doesn&rsquo;t nag you when it sits near zero.
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Btn
                variant="primary"
                onClick={handleToggleTabMode}
                disabled={togglingTabMode}
              >
                {togglingTabMode
                  ? 'Saving…'
                  : selectedWallet.tabMode
                    ? 'Turn off'
                    : 'Turn on'}
              </Btn>
              <Btn
                variant="outline"
                onClick={() => setShowTabModeModal(false)}
                disabled={togglingTabMode}
              >
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </PaperModal>

      {/* ── Archive confirmation ── */}
      <PaperModal
        open={showArchiveModal}
        onClose={() => !archivingWallet && setShowArchiveModal(false)}
        title={selectedWallet?.archived ? 'Unarchive wallet?' : 'Archive wallet?'}
      >
        {selectedWallet && (
          <div className="space-y-3">
            <p className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
              {selectedWallet.archived ? (
                <>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                    {selectedWallet.name}
                  </span>{' '}
                  will be restored to the active wallet list.
                </>
              ) : (
                <>
                  <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                    {selectedWallet.name}
                  </span>{' '}
                  will be hidden from the default view. Transactions are kept and
                  you can unarchive anytime from the &ldquo;Show archived&rdquo;
                  filter.
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Btn
                variant="primary"
                onClick={handleToggleArchive}
                disabled={archivingWallet}
              >
                {archivingWallet
                  ? 'Saving…'
                  : selectedWallet.archived
                    ? 'Unarchive'
                    : 'Archive'}
              </Btn>
              <Btn
                variant="outline"
                onClick={() => setShowArchiveModal(false)}
                disabled={archivingWallet}
              >
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </PaperModal>
    </div>
  );
}

// ─── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
  tone = 'neutral',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'bad';
}) {
  // Soft tonal active states (matches Chip tones) — less harsh than solid
  // saturated fills, in line with the Paper & Ink palette.
  const activeStyle: React.CSSProperties =
    tone === 'bad'
      ? { background: 'var(--bad-soft)', color: 'var(--bad)', borderColor: 'var(--bad-soft)' }
      : tone === 'warn'
        ? { background: 'var(--warn-soft)', color: 'var(--warn)', borderColor: 'var(--warn-soft)' }
        : { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' };
  const inactiveStyle: React.CSSProperties = {
    background: 'var(--panel)',
    color: 'var(--ink-3)',
    borderColor: 'var(--line-2)',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[12px] font-medium border transition-colors"
      style={active ? activeStyle : inactiveStyle}
    >
      {children}
    </button>
  );
}
