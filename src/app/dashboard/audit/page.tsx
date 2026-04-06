'use client';

import { useAuth } from '@/lib/auth-context';
import { useStudents, useLessonLogs, usePayments, useBookings } from '@/hooks/useCoachData';
import { useState } from 'react';

interface Discrepancy {
  studentId: string;
  studentName: string;
  field: string;
  storedValue: number;
  recomputedValue: number;
  diff: number;
  detail: string;
  severity: 'high' | 'medium' | 'low';
}

interface StudentSummary {
  studentId: string;
  studentName: string;
  totalLessons: number;
  normalLessons: number;
  paySepLessons: number;
  totalPayments: number;
  stored: { prepaidUsed: number; credit: number; pendingPayment: number; prepaidTotal: number };
  recomputed: { prepaidUsed: number; credit: number; pendingPayment: number };
  hasIssues: boolean;
}

export default function AuditPage() {
  const { user } = useAuth();
  const coachId = user?.uid;
  const { students } = useStudents(coachId);
  const { lessonLogs } = useLessonLogs(coachId);
  const { payments } = usePayments(coachId);
  const { bookings } = useBookings(coachId);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [ran, setRan] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const runAudit = () => {
    const results: Discrepancy[] = [];
    const studentSummaries: StudentSummary[] = [];

    for (const student of students) {
      const studentLogs = lessonLogs.filter((l) => l.studentId === student.id);
      const studentPaymentRecords = payments.filter((p) => p.studentId === student.id);

      const normalLogs = studentLogs.filter((l) => !l.paySeparately);
      const paySepLogs = studentLogs.filter((l) => l.paySeparately);

      // Find bookings this student is part of (for resolving base prices)
      const studentBookings = bookings.filter(
        (b) => b.linkedStudentIds?.includes(student.id) ||
               students.find((s) => s.id === student.id && !s.linkedToStudentId && b.clientName === student.clientName)
      );

      // --- RECOMPUTE prepaidUsed ---
      // Only normal (non-paySeparately) lessons should increment prepaidUsed
      // If student has no package, prepaidUsed should be 0
      let expectedPrepaidUsed = 0;
      if (student.prepaidTotal > 0) {
        // Count normal lessons — this is cumulative including past packages
        // Since we can't reconstruct package rollover history perfectly,
        // we use the current package as reference
        expectedPrepaidUsed = normalLogs.length;
        // If there have been more lessons than the current package size,
        // the student likely had prior packages. We can only check against
        // the current cycle, so cap at prepaidTotal for comparison
        // Actually — prepaidUsed CAN exceed prepaidTotal (exhausted package).
        // What we're really checking: is it negative? Does it roughly match lesson count?
      }

      // --- RECOMPUTE credit ---
      // Credit = sum of (basePrice - chargedPrice) for each normal lesson where chargedPrice < basePrice
      let expectedCredit = 0;
      for (const log of normalLogs) {
        let basePrice = 0;
        if (student.lessonRate != null && student.lessonRate > 0) {
          basePrice = student.lessonRate;
        } else {
          // Try to find the booking to get the base price
          const matchedBooking = bookings.find((b) => b.id === log.bookingId);
          if (matchedBooking) {
            if (matchedBooking.studentPrices?.[student.id] != null) {
              basePrice = matchedBooking.studentPrices[student.id];
            } else {
              basePrice = matchedBooking.price ?? 0;
            }
          }
        }
        if (basePrice > 0 && log.price < basePrice) {
          expectedCredit += basePrice - log.price;
        }
      }

      // --- RECOMPUTE pendingPayment ---
      // Sources of pendingPayment:
      // 1. Pay-separately lessons: each adds log.price
      // 2. Pay-per-lesson students: each normal lesson adds log.price
      // 3. Package exhaustion: adds packagePrice (lessonRate * prepaidTotal)
      // Note: B7 means payments do NOT reduce pendingPayment, so we don't subtract them
      let expectedPending = 0;

      // Pay-separately charges
      for (const log of paySepLogs) {
        expectedPending += log.price ?? 0;
      }

      // Pay-per-lesson charges (only for normal lessons)
      if (student.payPerLesson) {
        for (const log of normalLogs) {
          expectedPending += log.price ?? 0;
        }
      }

      // Package exhaustion — if prepaidUsed >= prepaidTotal and no nextPrepaidTotal
      // This would have added (lessonRate * prepaidTotal) once
      // Hard to detect retroactively since we don't know exact moment of exhaustion
      // We'll flag the diff and let the user interpret

      const summary: StudentSummary = {
        studentId: student.id,
        studentName: student.clientName,
        totalLessons: studentLogs.length,
        normalLessons: normalLogs.length,
        paySepLessons: paySepLogs.length,
        totalPayments: studentPaymentRecords.reduce((sum, p) => sum + (p.amount ?? 0), 0),
        stored: {
          prepaidUsed: student.prepaidUsed,
          credit: student.credit,
          pendingPayment: student.pendingPayment,
          prepaidTotal: student.prepaidTotal,
        },
        recomputed: {
          prepaidUsed: expectedPrepaidUsed,
          credit: expectedCredit,
          pendingPayment: expectedPending,
        },
        hasIssues: false,
      };

      // --- CHECK prepaidUsed ---
      // Only flag clearly wrong states — can't reliably compare against lesson count
      // because package rollovers reset prepaidUsed while old lesson logs remain
      if (student.prepaidUsed < 0) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'prepaidUsed',
          storedValue: student.prepaidUsed,
          recomputedValue: 0,
          diff: student.prepaidUsed,
          detail: `prepaidUsed is NEGATIVE (${student.prepaidUsed}). Should never be below 0. Likely caused by deleting lessons that wrongly decremented the counter.`,
          severity: 'high',
        });
        summary.hasIssues = true;
      } else if (student.prepaidTotal > 0 && student.prepaidUsed > student.prepaidTotal) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'prepaidUsed',
          storedValue: student.prepaidUsed,
          recomputedValue: student.prepaidTotal,
          diff: student.prepaidUsed - student.prepaidTotal,
          detail: `prepaidUsed (${student.prepaidUsed}) exceeds prepaidTotal (${student.prepaidTotal}). Package should have triggered exhaustion/rollover.`,
          severity: 'high',
        });
        summary.hasIssues = true;
      } else if (student.prepaidTotal === 0 && student.prepaidUsed !== 0) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'prepaidUsed',
          storedValue: student.prepaidUsed,
          recomputedValue: 0,
          diff: student.prepaidUsed,
          detail: `Has no package (prepaidTotal=0) but prepaidUsed=${student.prepaidUsed}. Should be 0.`,
          severity: 'medium',
        });
        summary.hasIssues = true;
      }

      // --- CHECK credit ---
      if (student.credit < 0) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'credit',
          storedValue: student.credit,
          recomputedValue: expectedCredit,
          diff: student.credit - expectedCredit,
          detail: `credit is NEGATIVE (RM${student.credit}). Should never be below 0.`,
          severity: 'high',
        });
        summary.hasIssues = true;
      } else if (Math.abs(student.credit - expectedCredit) > 0.01) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'credit',
          storedValue: student.credit,
          recomputedValue: expectedCredit,
          diff: student.credit - expectedCredit,
          detail: `credit (RM${student.credit}) doesn't match recomputed value (RM${expectedCredit}) from lesson logs. ${student.credit > expectedCredit ? 'Stored is higher — ghost credit from deleted lessons or incorrect calculation.' : 'Stored is lower — credit may have been lost during deletes or package changes.'}`,
          severity: Math.abs(student.credit - expectedCredit) > 50 ? 'high' : 'medium',
        });
        summary.hasIssues = true;
      }

      // --- CHECK pendingPayment ---
      if (student.pendingPayment < 0) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'pendingPayment',
          storedValue: student.pendingPayment,
          recomputedValue: expectedPending,
          diff: student.pendingPayment - expectedPending,
          detail: `pendingPayment is NEGATIVE (RM${student.pendingPayment}). Should never be below 0.`,
          severity: 'high',
        });
        summary.hasIssues = true;
      } else if (student.pendingPayment > 0 && expectedPending === 0 && student.prepaidUsed < student.prepaidTotal) {
        // Has pending payment but no source for it and package not exhausted
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'pendingPayment',
          storedValue: student.pendingPayment,
          recomputedValue: 0,
          diff: student.pendingPayment,
          detail: `Has pendingPayment (RM${student.pendingPayment}) but no pay-separately lessons, not pay-per-lesson, and package not exhausted (${student.prepaidUsed}/${student.prepaidTotal}). This is likely a ghost charge.`,
          severity: 'high',
        });
        summary.hasIssues = true;
      } else if (Math.abs(student.pendingPayment - expectedPending) > 0.01 && expectedPending > 0) {
        results.push({
          studentId: student.id,
          studentName: student.clientName,
          field: 'pendingPayment',
          storedValue: student.pendingPayment,
          recomputedValue: expectedPending,
          diff: student.pendingPayment - expectedPending,
          detail: `pendingPayment (RM${student.pendingPayment}) doesn't match recomputed (RM${expectedPending}). Sources: pay-separately RM${paySepLogs.reduce((s, l) => s + (l.price ?? 0), 0)}, pay-per-lesson RM${student.payPerLesson ? normalLogs.reduce((s, l) => s + (l.price ?? 0), 0) : 0}. ${student.pendingPayment > expectedPending ? `RM${(student.pendingPayment - expectedPending).toFixed(0)} may be from package exhaustion or ghost charges.` : 'Stored is lower than expected — charges may have been lost.'}`,
          severity: Math.abs(student.pendingPayment - expectedPending) > 100 ? 'high' : 'medium',
        });
        summary.hasIssues = true;
      }

      studentSummaries.push(summary);
    }

    // Sort: issues first
    results.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return sev[a.severity] - sev[b.severity];
    });

    setDiscrepancies(results);
    setSummaries(studentSummaries);
    setRan(true);
  };

  const displaySummaries = showAll ? summaries : summaries.filter((s) => s.hasIssues);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Data Audit</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Recomputes prepaidUsed, credit, and pendingPayment from raw lesson logs and compares against stored values.
      </p>

      <button
        onClick={runAudit}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 mb-6"
      >
        Run Full Audit
      </button>

      {ran && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{students.length}</div>
              <div className="text-sm text-gray-500">Students</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{lessonLogs.length}</div>
              <div className="text-sm text-gray-500">Lesson Logs</div>
            </div>
            <div className={`rounded-lg p-4 text-center ${discrepancies.length > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
              <div className="text-2xl font-bold">{discrepancies.length}</div>
              <div className="text-sm text-gray-500">Issues Found</div>
            </div>
          </div>

          {/* Discrepancies */}
          {discrepancies.length > 0 && (
            <div className="space-y-3 mb-8">
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Issues</h2>
              {discrepancies.map((d, i) => (
                <div key={i} className={`border rounded-lg p-4 ${
                  d.severity === 'high'
                    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                    : 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      d.severity === 'high' ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200' : 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200'
                    }`}>{d.severity.toUpperCase()}</span>
                    <span className="font-medium">{d.studentName}</span>
                    <span className="text-gray-400">—</span>
                    <span className="font-mono text-sm">{d.field}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <div>
                      Stored: <span className="font-mono font-bold">{d.field === 'prepaidUsed' ? d.storedValue : `RM${d.storedValue}`}</span>
                      {' | '}
                      Recomputed: <span className="font-mono font-bold">{d.field === 'prepaidUsed' ? d.recomputedValue : `RM${d.recomputedValue}`}</span>
                      {' | '}
                      Diff: <span className={`font-mono font-bold ${d.diff > 0 ? 'text-red-600' : 'text-blue-600'}`}>{d.diff > 0 ? '+' : ''}{d.field === 'prepaidUsed' ? d.diff : `RM${d.diff}`}</span>
                    </div>
                    <div className="text-xs">{d.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {discrepancies.length === 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-8">
              <p className="text-green-700 dark:text-green-300 font-medium">No discrepancies found. All counters match lesson logs.</p>
            </div>
          )}

          {/* Student breakdown table */}
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Student Breakdown</h2>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="rounded" />
              Show all students
            </label>
          </div>

          {displaySummaries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b dark:border-gray-700 text-left">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 px-2 text-center">Lessons</th>
                    <th className="py-2 px-2 text-center">Normal</th>
                    <th className="py-2 px-2 text-center">PaySep</th>
                    <th className="py-2 px-2 text-center">Package</th>
                    <th className="py-2 px-2 text-right">prepaidUsed</th>
                    <th className="py-2 px-2 text-right">credit</th>
                    <th className="py-2 px-2 text-right">pendingPayment</th>
                    <th className="py-2 px-2 text-right">Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySummaries.map((s) => (
                    <tr key={s.studentId} className={`border-b dark:border-gray-800 ${s.hasIssues ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                      <td className="py-2 pr-3 font-medium">{s.studentName}</td>
                      <td className="py-2 px-2 text-center">{s.totalLessons}</td>
                      <td className="py-2 px-2 text-center">{s.normalLessons}</td>
                      <td className="py-2 px-2 text-center">{s.paySepLessons}</td>
                      <td className="py-2 px-2 text-center font-mono">{s.stored.prepaidTotal > 0 ? `${s.stored.prepaidTotal}` : '-'}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={`font-mono ${s.stored.prepaidUsed !== s.recomputed.prepaidUsed ? 'text-red-600 font-bold' : ''}`}>
                          {s.stored.prepaidUsed}
                        </span>
                        {s.stored.prepaidUsed !== s.recomputed.prepaidUsed && (
                          <span className="text-xs text-gray-400 ml-1">(expect {s.recomputed.prepaidUsed})</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`font-mono ${Math.abs(s.stored.credit - s.recomputed.credit) > 0.01 ? 'text-red-600 font-bold' : ''}`}>
                          {s.stored.credit}
                        </span>
                        {Math.abs(s.stored.credit - s.recomputed.credit) > 0.01 && (
                          <span className="text-xs text-gray-400 ml-1">(expect {s.recomputed.credit})</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`font-mono ${Math.abs(s.stored.pendingPayment - s.recomputed.pendingPayment) > 0.01 ? 'text-red-600 font-bold' : ''}`}>
                          {s.stored.pendingPayment}
                        </span>
                        {Math.abs(s.stored.pendingPayment - s.recomputed.pendingPayment) > 0.01 && (
                          <span className="text-xs text-gray-400 ml-1">(expect {s.recomputed.pendingPayment})</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{s.totalPayments > 0 ? `RM${s.totalPayments}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-6 text-xs text-gray-400 space-y-1">
            <p><strong>Limitations:</strong></p>
            <p>- Package rollover history cannot be reconstructed. prepaidUsed differences may be from past packages.</p>
            <p>- Deleted lesson logs are gone — if lessons were deleted before this fix, the ghost charges remain but the source is invisible.</p>
            <p>- Package exhaustion charges (lessonRate x prepaidTotal) are not included in recomputed pendingPayment since we can&apos;t detect the exact exhaustion moment.</p>
            <p>- Credit recomputation uses the student&apos;s current lessonRate which may have changed over time.</p>
          </div>
        </>
      )}
    </div>
  );
}
