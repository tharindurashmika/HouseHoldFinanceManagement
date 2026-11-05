import React, { useState, useEffect } from 'react';
import {
  Landmark,
  CalendarClock,
  Wallet,
  Plus,
  CheckCircle2,
  Scale,
  ArrowRightLeft,
  Edit3,
  CreditCard,
} from 'lucide-react';
import { api } from '../api';
import { formatDateSL, formatLKR, pctOf, subMoney } from '../../shared/decimal';
import { calculateLoanInstallmentSplit } from '../../shared/calculations';
import type {
  Account,
  Category,
  Loan,
  RecurringSchedule,
  TransactionType,
  User,
} from '../../shared/types';

interface LoansCommitmentsViewProps {
  categories: Category[];
  accounts: Account[];
  members: User[];
  activeUserId: string;
  refreshTrigger: number;
  onRefresh: () => void;
  onOpenNewTx: (type: TransactionType) => void;
}

export const LoansCommitmentsView: React.FC<LoansCommitmentsViewProps> = ({
  categories,
  accounts,
  members,
  activeUserId,
  refreshTrigger,
  onRefresh,
  onOpenNewTx,
}) => {
  const [subTab, setSubTab] = useState<'LOANS' | 'RECURRING' | 'ACCOUNTS'>('LOANS');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);

  // Loan modals
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);
  const [paidDate, setPaidDate] = useState('2026-11-05');
  const [paidAccountId, setPaidAccountId] = useState('');
  const [paidByUserId, setPaidByUserId] = useState(activeUserId);
  const [totalPaidLkr, setTotalPaidLkr] = useState('');
  const [principalLkr, setPrincipalLkr] = useState('');
  const [interestLkr, setInterestLkr] = useState('');
  const [feesLkr, setFeesLkr] = useState('0.00');

  // Add Loan form
  const [newLoanName, setNewLoanName] = useState('');
  const [newLoanType, setNewLoanType] = useState<'PERSONAL_LOAN' | 'VEHICLE_FINANCE'>('PERSONAL_LOAN');
  const [newLenderName, setNewLenderName] = useState('');
  const [newCalcMethod, setNewCalcMethod] = useState<'REDUCING_BALANCE' | 'FLAT_RATE' | 'CUSTOM_MANUAL'>('REDUCING_BALANCE');
  const [newOrigPrincipal, setNewOrigPrincipal] = useState('500000.00');
  const [newCurrBalance, setNewCurrBalance] = useState('500000.00');
  const [newInterestRate, setNewInterestRate] = useState('14.5');
  const [newMonthlyInstallment, setNewMonthlyInstallment] = useState('15000.00');
  const [newDueDay, setNewDueDay] = useState(5);
  const [newStartDate, setNewStartDate] = useState('2026-01-05');
  const [newEndDate, setNewEndDate] = useState('2029-01-05');
  const [newTotalInst, setNewTotalInst] = useState(36);
  const [newRemInst, setNewRemInst] = useState(36);

  // Pay Recurring modal
  const [payingSchedule, setPayingSchedule] = useState<RecurringSchedule | null>(null);
  const [recPaidDate, setRecPaidDate] = useState('2026-11-03');
  const [recActualAmt, setRecActualAmt] = useState('');
  const [recAccountId, setRecAccountId] = useState('');
  const [recBillStart, setRecBillStart] = useState('');
  const [recBillEnd, setRecBillEnd] = useState('');

  // Reconcile Account modal
  const [reconcilingAccount, setReconcilingAccount] = useState<Account | null>(null);
  const [actualStatementBalance, setActualStatementBalance] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');

  // Edit Card / Account modal (to add card ending digits later)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccName, setEditAccName] = useState('');
  const [editCardLastFour, setEditCardLastFour] = useState('');
  const [editCreditLimit, setEditCreditLimit] = useState('');

  // Edit Loan modal (to update BOC 10L 3yr/5yr tenure or completion date)
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editLoanName, setEditLoanName] = useState('');
  const [editLoanRef, setEditLoanRef] = useState('');
  const [editLoanBalance, setEditLoanBalance] = useState('');
  const [editLoanInstallment, setEditLoanInstallment] = useState('');
  const [editLoanEndDate, setEditLoanEndDate] = useState('');
  const [editLoanRemInst, setEditLoanRemInst] = useState(36);

  useEffect(() => {
    Promise.all([api.getLoans(), api.getRecurring()]).then(([lRes, rRes]) => {
      setLoans(lRes.loans);
      setSchedules(rRes.schedules);
    });
  }, [refreshTrigger]);

  const openPayLoanModal = (loan: Loan) => {
    setPayingLoan(loan);
    setPaidDate('2026-11-05');
    setPaidAccountId(loan.defaultPaymentAccountId || accounts[0]?.id || '');
    setPaidByUserId(loan.ownerUserId || activeUserId);

    const split = calculateLoanInstallmentSplit({
      method: loan.interestCalculationMethod,
      originalPrincipal: loan.originalPrincipal,
      currentOutstandingBalance: loan.currentOutstandingBalance,
      annualInterestRate: loan.annualInterestRate,
      monthlyInstallment: loan.monthlyInstallment,
      totalInstallments: loan.totalInstallments,
    });

    setTotalPaidLkr(loan.monthlyInstallment);
    setPrincipalLkr(split.principalComponentLkr);
    setInterestLkr(split.interestComponentLkr);
    setFeesLkr('0.00');
  };

  const handleConfirmLoanPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan) return;
    await api.payLoanInstallment(payingLoan.id, {
      paidDate,
      sourceAccountId: paidAccountId,
      paidByUserId,
      totalPaidLkr,
      principalComponentLkr: principalLkr,
      interestComponentLkr: interestLkr,
      feesComponentLkr: feesLkr,
      paymentMethod: 'BANK_TRANSFER',
    });
    setPayingLoan(null);
    onRefresh();
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createLoan({
      ownershipType: 'HUSBAND',
      ownerUserId: activeUserId,
      loanName: newLoanName,
      loanType: newLoanType,
      lenderName: newLenderName,
      interestCalculationMethod: newCalcMethod,
      originalPrincipal: newOrigPrincipal,
      currentOutstandingBalance: newCurrBalance,
      annualInterestRate: newInterestRate,
      monthlyInstallment: newMonthlyInstallment,
      paymentDueDay: newDueDay,
      startDate: newStartDate,
      expectedCompletionDate: newEndDate,
      totalInstallments: newTotalInst,
      remainingInstallments: newRemInst,
      defaultPaymentAccountId: accounts[0]?.id || null,
    });
    setShowAddLoan(false);
    setNewLoanName('');
    onRefresh();
  };

  const handleConfirmRecurringPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSchedule) return;
    await api.payRecurring(payingSchedule.id, {
      paidDate: recPaidDate,
      actualLkrAmount: recActualAmt,
      sourceAccountId: recAccountId,
      paidByUserId: payingSchedule.assignedUserId || activeUserId,
      utilityBillingPeriodStart: recBillStart || null,
      utilityBillingPeriodEnd: recBillEnd || null,
    });
    setPayingSchedule(null);
    onRefresh();
  };

  const handleConfirmReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcilingAccount) return;
    await api.reconcileAccount(reconcilingAccount.id, {
      reconciliationDate: '2026-11-03',
      actualStatementBalance,
      createAdjustmentTransaction: false,
      reconciledByUserId: activeUserId,
      notes: reconcileNotes || 'Bank statement balance reconciliation',
    });
    setReconcilingAccount(null);
    onRefresh();
  };

  const handleSaveAccountEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    await api.updateAccount(editingAccount.id, {
      name: editAccName,
      cardLastFour: editCardLastFour || null,
      creditLimit: editCreditLimit || null,
    });
    setEditingAccount(null);
    onRefresh();
  };

  const handleSaveLoanEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoan) return;
    await api.updateLoan(editingLoan.id, {
      loanName: editLoanName,
      loanReferenceNo: editLoanRef || null,
      currentOutstandingBalance: editLoanBalance,
      monthlyInstallment: editLoanInstallment,
      expectedCompletionDate: editLoanEndDate,
      remainingInstallments: editLoanRemInst,
    });
    setEditingLoan(null);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Loans, Recurring Commitments & Bank Accounts
          </h2>
          <p className="text-xs text-slate-500">
            Manage Personal Bank Loans, Bike Finance, Scheduled Utility Bills, and Bank/Card Reconciliation
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setSubTab('LOANS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === 'LOANS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" /> Loans & Bike Finance ({loans.length})
          </button>
          <button
            onClick={() => setSubTab('RECURRING')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === 'RECURRING'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" /> Recurring & Bills ({schedules.length})
          </button>
          <button
            onClick={() => setSubTab('ACCOUNTS')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === 'ACCOUNTS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" /> Bank Accounts & Cards ({accounts.length})
          </button>
        </div>
      </div>

      {/* TAB 1: LOANS & BIKE FINANCE */}
      {subTab === 'LOANS' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddLoan(!showAddLoan)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add Loan or Vehicle Finance
            </button>
          </div>

          {showAddLoan && (
            <form
              onSubmit={handleCreateLoan}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm space-y-4"
            >
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Add New or Mid-Term Existing Loan / Finance
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Loan Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Personal Bank Loan 3"
                    value={newLoanName}
                    onChange={(e) => setNewLoanName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Lender / Bank *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Commercial Bank PLC"
                    value={newLenderName}
                    onChange={(e) => setNewLenderName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Loan Type</label>
                  <select
                    value={newLoanType}
                    onChange={(e) => setNewLoanType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="PERSONAL_LOAN">Personal Bank Loan</option>
                    <option value="VEHICLE_FINANCE">Motorcycle / Vehicle Finance</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Interest Method</label>
                  <select
                    value={newCalcMethod}
                    onChange={(e) => setNewCalcMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="REDUCING_BALANCE">Reducing Balance</option>
                    <option value="FLAT_RATE">Flat Rate (Lease)</option>
                    <option value="CUSTOM_MANUAL">Custom / Manual Split</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Original Loan (LKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newOrigPrincipal}
                    onChange={(e) => setNewOrigPrincipal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Current Outstanding (LKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newCurrBalance}
                    onChange={(e) => setNewCurrBalance(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Annual Interest (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newInterestRate}
                    onChange={(e) => setNewInterestRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Monthly Installment (LKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newMonthlyInstallment}
                    onChange={(e) => setNewMonthlyInstallment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Expected Completion</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Remaining Installments</label>
                  <input
                    type="number"
                    value={newRemInst}
                    onChange={(e) => setNewRemInst(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold"
                  >
                    Save Loan
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-4">
            {loans.map((loan) => {
              const paidPrincipal = subMoney(loan.originalPrincipal, loan.currentOutstandingBalance);
              const progressPct = pctOf(paidPrincipal, loan.originalPrincipal);

              return (
                <div
                  key={loan.id}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {loan.loanName}
                        </h3>
                        {loan.loanReferenceNo && (
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Ref / A/C: #{loan.loanReferenceNo}
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {loan.interestCalculationMethod.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {loan.ownerName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {loan.lenderName} • Interest Rate: {loan.annualInterestRate}% p.a. • Due on Day {loan.paymentDueDay} of every month • Start: {formatDateSL(loan.startDate)} → Expected End: {formatDateSL(loan.expectedCompletionDate)}
                      </p>
                      {loan.notes && (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
                          {loan.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingLoan(loan);
                          setEditLoanName(loan.loanName);
                          setEditLoanRef(loan.loanReferenceNo || '');
                          setEditLoanBalance(loan.currentOutstandingBalance);
                          setEditLoanInstallment(loan.monthlyInstallment);
                          setEditLoanEndDate(loan.expectedCompletionDate);
                          setEditLoanRemInst(loan.remainingInstallments);
                        }}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Loan / Tenure
                      </button>
                      <button
                        onClick={() => openPayLoanModal(loan)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Record Monthly Installment
                      </button>
                    </div>
                  </div>

                  {/* Loan KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs">
                    <div>
                      <div className="text-slate-400">Original Loan Amount</div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                        {formatLKR(loan.originalPrincipal)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Current Outstanding Balance</div>
                      <div className="font-mono font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                        {formatLKR(loan.currentOutstandingBalance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Monthly Installment</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                        {formatLKR(loan.monthlyInstallment)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Remaining Installments</div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                        {loan.remainingInstallments} of {loan.totalInstallments} months ({progressPct}% repaid)
                      </div>
                    </div>
                  </div>

                  {/* Installment Payment History */}
                  {loan.installments && loan.installments.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Recorded Installment History (Principal vs. Interest Breakdown)
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400">
                              <th className="py-1.5 pr-3">Inst #</th>
                              <th className="py-1.5 px-3">Paid Date</th>
                              <th className="py-1.5 px-3 text-right">Total Cash Outflow</th>
                              <th className="py-1.5 px-3 text-right">Principal Component</th>
                              <th className="py-1.5 px-3 text-right">Interest Component</th>
                              <th className="py-1.5 pl-3 text-right">Balance After</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                            {loan.installments.slice(0, 5).map((inst) => (
                              <tr key={inst.id}>
                                <td className="py-1.5 pr-3">#{inst.installmentNumber}</td>
                                <td className="py-1.5 px-3">{formatDateSL(inst.paidDate)}</td>
                                <td className="py-1.5 px-3 text-right font-semibold">
                                  {formatLKR(inst.totalPaidLkr)}
                                </td>
                                <td className="py-1.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                                  {formatLKR(inst.principalComponentLkr)}
                                </td>
                                <td className="py-1.5 px-3 text-right text-amber-600 dark:text-amber-400">
                                  {formatLKR(inst.interestComponentLkr)}
                                </td>
                                <td className="py-1.5 pl-3 text-right">
                                  {formatLKR(inst.balanceAfterPayment)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: RECURRING SCHEDULES & VARIABLE UTILITY BILLS */}
      {subTab === 'RECURRING' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedules.map((rec) => (
            <div
              key={rec.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {rec.title}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {rec.frequency}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {rec.categoryName} {rec.subcategoryName ? `› ${rec.subcategoryName}` : ''} • Assigned to: {rec.assignedUserName || rec.assignedMemberRole}
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-slate-400">Expected Amount: </span>
                    <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                      {formatLKR(rec.expectedAmountLkr)}
                    </span>
                    {rec.isVariableAmount && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                        Variable Bill
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Next Due: <strong>{formatDateSL(rec.nextDueDate)}</strong>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">Account: {rec.defaultAccountName}</span>
                <button
                  onClick={() => {
                    setPayingSchedule(rec);
                    setRecPaidDate('2026-11-03');
                    setRecActualAmt(rec.expectedAmountLkr);
                    setRecAccountId(rec.defaultAccountId);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: BANK ACCOUNTS, CARDS & RECONCILIATION */}
      {subTab === 'ACCOUNTS' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onOpenNewTx('TRANSFER')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
            >
              <ArrowRightLeft className="w-4 h-4" /> Transfer / Settle Credit Card Bill
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {acc.accountType.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {acc.cardLastFour && (
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                            acc.cardLastFour === 'ADD_LATER'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}
                        >
                          <CreditCard className="w-3 h-3" />
                          {acc.cardLastFour === 'ADD_LATER'
                            ? 'End No: Add Later'
                            : `Ends •••• ${acc.cardLastFour}`}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{acc.ownershipType}</span>
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2 mt-1">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {acc.name}
                    </h3>
                    <button
                      onClick={() => {
                        setEditingAccount(acc);
                        setEditAccName(acc.name);
                        setEditCardLastFour(
                          acc.cardLastFour === 'ADD_LATER' ? '' : acc.cardLastFour || ''
                        );
                        setEditCreditLimit(acc.creditLimit || '');
                      }}
                      title="Edit Card End Digits / Account Name"
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                  {acc.linkedParentAccountName && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      Linked directly to: {acc.linkedParentAccountName}
                    </div>
                  )}

                  <div className="mt-3">
                    <div className="text-[11px] text-slate-400">
                      {acc.accountType === 'CREDIT_CARD'
                        ? 'Current Statement Liability Owed'
                        : acc.linkedParentAccountId
                          ? 'Deducts from Linked Parent Bank A/C'
                          : 'Current Recorded Balance'}
                    </div>
                    <div
                      className={`text-xl font-bold font-mono ${
                        acc.accountType === 'CREDIT_CARD'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatLKR(acc.currentBalance)}
                    </div>
                    {acc.creditLimit && (
                      <div className="text-[11px] text-slate-400">
                        Credit Limit: {formatLKR(acc.creditLimit)}
                      </div>
                    )}
                  </div>
                </div>

                {!acc.linkedParentAccountId && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Opening: {formatLKR(acc.openingBalance, { showDecimals: false })}
                    </span>
                    <button
                      onClick={() => {
                        setReconcilingAccount(acc);
                        setActualStatementBalance(acc.currentBalance);
                        setReconcileNotes('');
                      }}
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                    >
                      <Scale className="w-3.5 h-3.5" /> Reconcile Balance
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pay Loan Installment Modal */}
      {payingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmLoanPayment}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Pay Installment: {payingLoan.loanName}
            </h3>
            <p className="text-xs text-slate-500">
              <strong>Rule 4 (No Double Counting):</strong> Total installment is recorded once as a cash expense, while only the Principal component reduces your remaining loan balance.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Total Installment (LKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={totalPaidLkr}
                  onChange={(e) => setTotalPaidLkr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-semibold text-emerald-600 mb-1">Principal Component *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={principalLkr}
                  onChange={(e) => setPrincipalLkr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-amber-600 mb-1">Interest Component *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={interestLkr}
                  onChange={(e) => setInterestLkr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Paid From Account *
              </label>
              <select
                value={paidAccountId}
                onChange={(e) => setPaidAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingLoan(null)}
                className="px-4 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                Confirm Installment Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mark Recurring Bill Paid Modal */}
      {payingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmRecurringPaid}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Confirm Payment: {payingSchedule.title}
            </h3>
            <p className="text-xs text-slate-500">
              Confirming this payment creates a verified transaction and advances the next due date.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Paid Date *</label>
              <input
                type="date"
                required
                value={recPaidDate}
                onChange={(e) => setRecPaidDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Actual Bill Amount Paid (LKR) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={recActualAmt}
                onChange={(e) => setRecActualAmt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono font-bold"
              />
            </div>

            {payingSchedule.isVariableAmount && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Billing Period Start</label>
                  <input
                    type="date"
                    value={recBillStart}
                    onChange={(e) => setRecBillStart(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Billing Period End</label>
                  <input
                    type="date"
                    value={recBillEnd}
                    onChange={(e) => setRecBillEnd(e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingSchedule(null)}
                className="px-4 py-2 rounded-lg text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                Confirm & Record Transaction
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reconcile Account Balance Modal */}
      {reconcilingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmReconcile}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Reconcile Account: {reconcilingAccount.name}
            </h3>
            <p className="text-xs text-slate-500">
              Recorded System Balance: <strong>{formatLKR(reconcilingAccount.currentBalance)}</strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Actual Bank Statement / Physical Balance (LKR) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={actualStatementBalance}
                onChange={(e) => setActualStatementBalance(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Reconciliation Notes
              </label>
              <input
                type="text"
                value={reconcileNotes}
                onChange={(e) => setReconcileNotes(e.target.value)}
                placeholder="e.g., Verified against Commercial Bank ePassbook"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReconcilingAccount(null)}
                className="px-4 py-2 rounded-lg text-xs text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                Save Reconciled Balance
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Card Ending Number / Account Details Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveAccountEdit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Edit Account / Card Ending Digits
            </h3>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Account / Card Name *</label>
              <input
                type="text"
                required
                value={editAccName}
                onChange={(e) => setEditAccName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">
                Card Ending 4 Digits (e.g., 1143, 0484, 9005)
              </label>
              <input
                type="text"
                placeholder="Enter last 4 digits of card..."
                value={editCardLastFour}
                onChange={(e) => setEditCardLastFour(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
            {editingAccount.accountType === 'CREDIT_CARD' && (
              <div>
                <label className="block font-semibold text-slate-500 mb-1">
                  Credit Card Limit (LKR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editCreditLimit}
                  onChange={(e) => setEditCreditLimit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="px-4 py-2 rounded-lg text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold"
              >
                Save Card / Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Loan / Tenure Modal */}
      {editingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveLoanEdit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl text-xs"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Edit Loan Details & Tenure
            </h3>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Loan Name *</label>
              <input
                type="text"
                required
                value={editLoanName}
                onChange={(e) => setEditLoanName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Loan Ref / A/C No</label>
                <input
                  type="text"
                  value={editLoanRef}
                  onChange={(e) => setEditLoanRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Monthly Installment (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editLoanInstallment}
                  onChange={(e) => setEditLoanInstallment(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Outstanding Balance (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editLoanBalance}
                  onChange={(e) => setEditLoanBalance(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Remaining Months</label>
                <input
                  type="number"
                  required
                  value={editLoanRemInst}
                  onChange={(e) => setEditLoanRemInst(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-500 mb-1">Expected Completion Date</label>
              <input
                type="date"
                required
                value={editLoanEndDate}
                onChange={(e) => setEditLoanEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingLoan(null)}
                className="px-4 py-2 rounded-lg text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold"
              >
                Save Loan Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

