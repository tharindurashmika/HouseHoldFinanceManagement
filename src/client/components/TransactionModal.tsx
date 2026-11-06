import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Split, ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { api } from '../api';
import { addMoney, formatLKR, mulMoney, toMoneyString } from '../../shared/decimal';
import type {
  Account,
  Category,
  HouseholdMemberScope,
  PaymentMethod,
  Transaction,
  TransactionType,
  User,
} from '../../shared/types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
  accounts: Account[];
  members: User[];
  activeUserId: string;
  initialType?: TransactionType;
  editingTransaction?: Transaction | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  categories,
  accounts,
  members,
  activeUserId,
  initialType = 'EXPENSE',
  editingTransaction = null,
}) => {
  const [transactionType, setTransactionType] = useState<TransactionType>(initialType);
  const [transactionDate, setTransactionDate] = useState<string>('2026-11-03');
  const [description, setDescription] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [originalCurrency, setOriginalCurrency] = useState<string>('LKR');
  const [originalAmount, setOriginalAmount] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<string>('1');
  const [actualLkrAmount, setActualLkrAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('DEBIT_CARD');
  const [sourceAccountId, setSourceAccountId] = useState<string>('');
  const [destinationAccountId, setDestinationAccountId] = useState<string>('');
  const [paidOrReceivedByUserId, setPaidOrReceivedByUserId] = useState<string>(activeUserId);
  const [householdMemberScope, setHouseholdMemberScope] = useState<HouseholdMemberScope>('SHARED');
  const [fundingSource, setFundingSource] = useState<string>('REGULAR_INCOME');
  const [isEssential, setIsEssential] = useState<boolean>(true);
  const [isFixed, setIsFixed] = useState<boolean>(false);
  const [utilityStart, setUtilityStart] = useState<string>('');
  const [utilityEnd, setUtilityEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [transferFeeLkr, setTransferFeeLkr] = useState<string>('');
  const [transferFeeCategoryId, setTransferFeeCategoryId] = useState<string>('');
  const [items, setItems] = useState<
    Array<{ subcategoryId: string; itemName: string; quantity: string; amountLkr: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = categories.filter((c) =>
    transactionType === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE'
  );
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const subcategories = selectedCategory?.subcategories || [];

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (editingTransaction) {
      setTransactionType(editingTransaction.transactionType);
      setTransactionDate(editingTransaction.transactionDate);
      setDescription(editingTransaction.description);
      setCategoryId(editingTransaction.categoryId || '');
      setSubcategoryId(editingTransaction.subcategoryId || '');
      setOriginalCurrency(editingTransaction.originalCurrency || 'LKR');
      setOriginalAmount(editingTransaction.originalAmount);
      setExchangeRate(editingTransaction.exchangeRate || '1');
      setActualLkrAmount(editingTransaction.actualLkrAmount);
      setPaymentMethod(editingTransaction.paymentMethod);
      setSourceAccountId(editingTransaction.sourceAccountId);
      setDestinationAccountId(editingTransaction.destinationAccountId || '');
      setPaidOrReceivedByUserId(editingTransaction.paidOrReceivedByUserId);
      setHouseholdMemberScope(editingTransaction.householdMemberScope);
      setFundingSource(editingTransaction.fundingSource || 'REGULAR_INCOME');
      setIsEssential(editingTransaction.isEssential);
      setIsFixed(editingTransaction.isFixed);
      setUtilityStart(editingTransaction.utilityBillingPeriodStart || '');
      setUtilityEnd(editingTransaction.utilityBillingPeriodEnd || '');
      setNotes(editingTransaction.notes || '');
      setTransferFeeLkr(editingTransaction.transferFeeLkr || '');
      setTransferFeeCategoryId(editingTransaction.transferFeeCategoryId || '');
      setItems(
        (editingTransaction.items || []).map((i) => ({
          subcategoryId: i.subcategoryId || '',
          itemName: i.itemName,
          quantity: i.quantity || '1',
          amountLkr: i.amountLkr,
        }))
      );
    } else {
      setTransactionType(initialType);
      setTransactionDate('2026-11-03');
      setDescription('');
      const defCat = categories.find((c) =>
        initialType === 'INCOME' ? c.type === 'INCOME' : c.type === 'EXPENSE'
      );
      setCategoryId(defCat?.id || '');
      setSubcategoryId(defCat?.subcategories?.[0]?.id || '');
      setOriginalCurrency('LKR');
      setOriginalAmount('');
      setExchangeRate('1');
      setActualLkrAmount('');
      setPaymentMethod(initialType === 'INCOME' ? 'BANK_TRANSFER' : 'DEBIT_CARD');
      setSourceAccountId(accounts[0]?.id || '');
      setDestinationAccountId(accounts[1]?.id || '');
      setPaidOrReceivedByUserId(activeUserId || members[0]?.id || '');
      setHouseholdMemberScope(initialType === 'INCOME' ? 'HUSBAND' : 'SHARED');
      setFundingSource('REGULAR_INCOME');
      setIsEssential(defCat?.defaultEssentiality ?? true);
      setIsFixed(defCat?.isFixedDefault ?? false);
      setUtilityStart('');
      setUtilityEnd('');
      setNotes('');
      setTransferFeeLkr('');
      setTransferFeeCategoryId('');
      setItems([]);
    }
  }, [isOpen, editingTransaction, initialType, categories, accounts, activeUserId, members]);

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    const cat = categories.find((c) => c.id === newCatId);
    if (cat) {
      setSubcategoryId(cat.subcategories?.[0]?.id || '');
      setIsEssential(cat.defaultEssentiality);
      setIsFixed(cat.isFixedDefault);
    } else {
      setSubcategoryId('');
    }
  };

  const handleOriginalAmountChange = (val: string) => {
    setOriginalAmount(val);
    if (originalCurrency === 'LKR') {
      setActualLkrAmount(val);
    } else if (val && exchangeRate) {
      try {
        setActualLkrAmount(mulMoney(val, exchangeRate));
      } catch {
        // ignore partial typing
      }
    }
  };

  const handleAddSplitItem = () => {
    setItems((prev) => [
      ...prev,
      {
        subcategoryId: subcategories[0]?.id || '',
        itemName: '',
        quantity: '1',
        amountLkr: '',
      },
    ]);
  };

  const handleSplitItemsSumToTotal = () => {
    if (items.length === 0) return;
    const sum = addMoney(...items.map((i) => i.amountLkr || '0'));
    setOriginalCurrency('LKR');
    setOriginalAmount(sum);
    setActualLkrAmount(sum);
  };

  const handleTransferPreset = (preset: 'WITHDRAWAL' | 'DEPOSIT' | 'CASH_TRANSFER' | 'BANK_TRANSFER') => {
    const banks = accounts.filter(
      (a) => (a.accountType === 'BANK_SAVINGS' || a.accountType === 'BANK_CURRENT') && !a.linkedParentAccountId
    );
    const cashWallets = accounts.filter((a) => a.accountType === 'CASH');
    const husbandCash =
      cashWallets.find((c) => c.ownershipType === 'HUSBAND' || c.name.toLowerCase().includes('husband') || c.name.toLowerCase().includes('tharindu')) ||
      cashWallets[0];
    const wifeCash =
      cashWallets.find((c) => c.ownershipType === 'WIFE' || c.name.toLowerCase().includes('wife') || c.name.toLowerCase().includes('sudu')) ||
      cashWallets[1] ||
      cashWallets[0];

    if (preset === 'WITHDRAWAL') {
      if (banks[0]) setSourceAccountId(banks[0].id);
      if (husbandCash) setDestinationAccountId(husbandCash.id);
      setPaymentMethod('DEBIT_CARD');
      if (!description) setDescription('ATM Cash Withdrawal');
      if (!transferFeeLkr) setTransferFeeLkr('30.00');
    } else if (preset === 'DEPOSIT') {
      if (husbandCash) setSourceAccountId(husbandCash.id);
      if (banks[0]) setDestinationAccountId(banks[0].id);
      setPaymentMethod('CASH');
      if (!description) setDescription('Cash Deposit into Bank');
      setTransferFeeLkr('');
    } else if (preset === 'CASH_TRANSFER') {
      if (husbandCash) setSourceAccountId(husbandCash.id);
      if (wifeCash) setDestinationAccountId(wifeCash.id);
      setPaymentMethod('CASH');
      if (!description) setDescription('Cash Transfer between Wallets');
      setTransferFeeLkr('');
    } else if (preset === 'BANK_TRANSFER') {
      if (banks[0]) setSourceAccountId(banks[0].id);
      if (banks[1]) setDestinationAccountId(banks[1].id);
      setPaymentMethod('BANK_TRANSFER');
      if (!description) setDescription('Online Bank Transfer');
      if (!transferFeeLkr) setTransferFeeLkr('25.00');
    }
  };

  const handleSourceAccountChange = (newAccId: string) => {
    setSourceAccountId(newAccId);
    const acc = accounts.find((a) => a.id === newAccId);
    if (!acc) return;

    // 1. Auto-select Payment Method according to selected Account
    if (acc.accountType === 'CASH') {
      setPaymentMethod('CASH');
    } else if (acc.accountType === 'DEBIT_CARD') {
      setPaymentMethod('DEBIT_CARD');
    } else if (acc.accountType === 'CREDIT_CARD') {
      setPaymentMethod('CREDIT_CARD');
    } else if (acc.accountType === 'BANK_CURRENT' || acc.accountType === 'BANK_SAVINGS') {
      setPaymentMethod('BANK_TRANSFER');
    } else if (acc.accountType === 'DIGITAL_WALLET') {
      setPaymentMethod('DIGITAL_WALLET');
    }

    // 2. Auto-align Paid By Member if the account belongs specifically to Husband or Wife
    if (acc.ownerUserId && paidOrReceivedByUserId !== acc.ownerUserId) {
      setPaidOrReceivedByUserId(acc.ownerUserId);
      if (transactionType === 'INCOME') {
        setHouseholdMemberScope(acc.ownershipType === 'WIFE' ? 'WIFE' : 'HUSBAND');
      }
    }
  };

  const handlePaymentMethodChange = (pm: PaymentMethod) => {
    setPaymentMethod(pm);
    const selectedMember = members.find((m) => m.id === paidOrReceivedByUserId);
    const isWife = selectedMember?.memberRole === 'WIFE';
    const targetOwnership = isWife ? 'WIFE' : 'HUSBAND';

    if (pm === 'CASH') {
      // Auto-select physical cash wallet for current member
      const memberCash = accounts.find(
        (a) => a.accountType === 'CASH' && a.ownershipType === targetOwnership
      );
      const fallbackCash = accounts.find((a) => a.accountType === 'CASH');
      if (memberCash) setSourceAccountId(memberCash.id);
      else if (fallbackCash) setSourceAccountId(fallbackCash.id);
    } else if (pm === 'DEBIT_CARD') {
      // Auto-select debit card for current member
      const memberCard = accounts.find(
        (a) => a.accountType === 'DEBIT_CARD' && a.ownershipType === targetOwnership
      );
      const fallbackCard = accounts.find((a) => a.accountType === 'DEBIT_CARD');
      if (memberCard) setSourceAccountId(memberCard.id);
      else if (fallbackCard) setSourceAccountId(fallbackCard.id);
    } else if (pm === 'CREDIT_CARD') {
      const creditAcc = accounts.find((a) => a.accountType === 'CREDIT_CARD');
      if (creditAcc) setSourceAccountId(creditAcc.id);
    } else if (pm === 'BANK_TRANSFER' || pm === 'DIRECT_DEBIT') {
      // Auto-select bank account for current member
      const memberBank = accounts.find(
        (a) =>
          (a.accountType === 'BANK_CURRENT' || a.accountType === 'BANK_SAVINGS') &&
          !a.linkedParentAccountId &&
          a.ownershipType === targetOwnership
      );
      const fallbackBank = accounts.find(
        (a) =>
          (a.accountType === 'BANK_CURRENT' || a.accountType === 'BANK_SAVINGS') &&
          !a.linkedParentAccountId
      );
      if (memberBank) setSourceAccountId(memberBank.id);
      else if (fallbackBank) setSourceAccountId(fallbackBank.id);
    }
  };

  const handlePaidByMemberChange = (newUserId: string) => {
    setPaidOrReceivedByUserId(newUserId);
    const member = members.find((m) => m.id === newUserId);
    const isWife = member?.memberRole === 'WIFE';
    const targetOwnership = isWife ? 'WIFE' : 'HUSBAND';

    if (transactionType === 'INCOME') {
      setHouseholdMemberScope(targetOwnership);
    }

    // If currently selected account belongs to the opposite member, switch to this member's corresponding account
    const currentAcc = accounts.find((a) => a.id === sourceAccountId);
    if (currentAcc && currentAcc.ownershipType !== 'JOINT' && currentAcc.ownershipType !== targetOwnership) {
      const matchingSameType = accounts.find(
        (a) => a.accountType === currentAcc.accountType && a.ownershipType === targetOwnership
      );
      if (matchingSameType) {
        setSourceAccountId(matchingSameType.id);
      } else {
        const anyMemberAcc = accounts.find((a) => a.ownershipType === targetOwnership);
        if (anyMemberAcc) {
          handleSourceAccountChange(anyMemberAcc.id);
        }
      }
    }
  };

  const renderAccountOptions = (accs: Account[]) => {
    const cashWallets = accs.filter((a) => a.accountType === 'CASH');
    const debitCards = accs.filter((a) => a.accountType === 'DEBIT_CARD');
    const creditCards = accs.filter((a) => a.accountType === 'CREDIT_CARD');
    const bankAccounts = accs.filter(
      (a) => (a.accountType === 'BANK_CURRENT' || a.accountType === 'BANK_SAVINGS') && !a.linkedParentAccountId
    );
    const otherAccounts = accs.filter(
      (a) =>
        a.accountType === 'DIGITAL_WALLET' ||
        (!cashWallets.includes(a) &&
          !debitCards.includes(a) &&
          !creditCards.includes(a) &&
          !bankAccounts.includes(a))
    );

    return (
      <>
        {cashWallets.length > 0 && (
          <optgroup label="💵 Physical Cash Wallets (Husband & Wife)">
            {cashWallets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.ownershipType === 'HUSBAND' ? 'Tharindu' : a.ownershipType === 'WIFE' ? 'Sudu' : 'Joint'}) • Available: {formatLKR(a.currentBalance)}
              </option>
            ))}
          </optgroup>
        )}

        {debitCards.length > 0 && (
          <optgroup label="💳 Debit Cards (Linked to Bank Accounts)">
            {debitCards.map((a) => {
              const parent = accs.find((p) => p.id === a.linkedParentAccountId);
              return (
                <option key={a.id} value={a.id}>
                  {a.name} {a.cardLastFour ? `(•••• ${a.cardLastFour})` : ''} • {parent ? `Debits ${parent.name}` : `Bal: ${formatLKR(a.currentBalance)}`}
                </option>
              );
            })}
          </optgroup>
        )}

        {creditCards.length > 0 && (
          <optgroup label="💳 Credit Cards (Liabilities)">
            {creditCards.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.cardLastFour ? `(•••• ${a.cardLastFour})` : ''} • Owed: {formatLKR(a.currentBalance)}
              </option>
            ))}
          </optgroup>
        )}

        {bankAccounts.length > 0 && (
          <optgroup label="🏦 Bank Accounts (Online / Transfer / Counter)">
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.bankName || a.accountType}) • Balance: {formatLKR(a.currentBalance)}
              </option>
            ))}
          </optgroup>
        )}

        {otherAccounts.length > 0 && (
          <optgroup label="📱 Digital Wallets & Other">
            {otherAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.accountType}) • Balance: {formatLKR(a.currentBalance)}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  };

  if (!isOpen) return null;

  const isUtilityCategory =
    selectedCategory?.name.toLowerCase().includes('utility') || false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        transactionDate,
        transactionType,
        description,
        categoryId: transactionType === 'TRANSFER' ? null : categoryId || null,
        subcategoryId: transactionType === 'TRANSFER' ? null : subcategoryId || null,
        originalAmount: originalCurrency === 'LKR' ? actualLkrAmount || originalAmount : originalAmount,
        originalCurrency,
        exchangeRate: originalCurrency === 'LKR' ? '1' : exchangeRate || '1',
        actualLkrAmount: actualLkrAmount || originalAmount,
        paymentMethod,
        sourceAccountId,
        destinationAccountId: transactionType === 'TRANSFER' ? destinationAccountId : null,
        paidOrReceivedByUserId,
        recordedByUserId: activeUserId,
        householdMemberScope,
        fundingSource,
        isEssential,
        isFixed,
        utilityBillingPeriodStart: utilityStart || null,
        utilityBillingPeriodEnd: utilityEnd || null,
        transferFeeLkr: transactionType === 'TRANSFER' && transferFeeLkr ? toMoneyString(transferFeeLkr) : '0.00',
        transferFeeCategoryId: transactionType === 'TRANSFER' && transferFeeLkr ? transferFeeCategoryId || null : null,
        notes: notes || null,
        items: items
          .filter((i) => i.itemName.trim() && Number(i.amountLkr) > 0)
          .map((i) => ({
            subcategoryId: i.subcategoryId || null,
            itemName: i.itemName.trim(),
            quantity: i.quantity || '1',
            amountLkr: toMoneyString(i.amountLkr),
          })),
      };

      if (editingTransaction) {
        await api.updateTransaction(editingTransaction.id, payload);
      } else {
        await api.createTransaction(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {editingTransaction ? 'Edit Financial Transaction' : 'Record Financial Transaction'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All amounts are stored with decimal precision in Sri Lankan Rupees (LKR)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
              {error}
            </div>
          )}

          {/* Transaction Type Selector */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(
              [
                { type: 'EXPENSE', label: 'Expense', icon: TrendingDown, activeCls: 'bg-rose-600 text-white' },
                { type: 'INCOME', label: 'Income', icon: TrendingUp, activeCls: 'bg-emerald-600 text-white' },
                { type: 'TRANSFER', label: 'Internal Transfer', icon: ArrowRightLeft, activeCls: 'bg-blue-600 text-white' },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = transactionType === tab.type;
              return (
                <button
                  key={tab.type}
                  type="button"
                  onClick={() => {
                    setTransactionType(tab.type);
                    if (tab.type !== 'TRANSFER') {
                      const firstCat = categories.find((c) => c.type === tab.type);
                      if (firstCat) handleCategoryChange(firstCat.id);
                    }
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition ${
                    active
                      ? `${tab.activeCls} shadow-sm`
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {transactionType === 'TRANSFER' && (
            <>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
                <strong>Internal Transfer:</strong> Moving money between bank accounts or cash wallets is never counted as an expense or income.
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Quick Transfer Shortcuts
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTransferPreset('WITHDRAWAL')}
                    className="p-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition border border-slate-200 dark:border-slate-700 text-center flex flex-col items-center gap-1"
                  >
                    <span className="text-base">🏧</span>
                    <span>Cash Withdrawal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTransferPreset('DEPOSIT')}
                    className="p-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition border border-slate-200 dark:border-slate-700 text-center flex flex-col items-center gap-1"
                  >
                    <span className="text-base">🏦</span>
                    <span>Cash Deposit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTransferPreset('CASH_TRANSFER')}
                    className="p-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition border border-slate-200 dark:border-slate-700 text-center flex flex-col items-center gap-1"
                  >
                    <span className="text-base">🤝</span>
                    <span>Cash-to-Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTransferPreset('BANK_TRANSFER')}
                    className="p-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition border border-slate-200 dark:border-slate-700 text-center flex flex-col items-center gap-1"
                  >
                    <span className="text-base">🌐</span>
                    <span>Online Transfer</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Transaction Date *
              </label>
              <input
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                {transactionType === 'INCOME' ? 'Received By Member *' : 'Paid By Member *'}
              </label>
              <select
                required
                value={paidOrReceivedByUserId}
                onChange={(e) => handlePaidByMemberChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.memberRole})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
              Description *
            </label>
            <input
              type="text"
              required
              placeholder={
                transactionType === 'EXPENSE'
                  ? 'e.g., Keells Super Weekly Groceries, CEB Electricity Bill...'
                  : transactionType === 'INCOME'
                    ? 'e.g., Monthly Salary - November 2026...'
                    : 'e.g., Commercial Bank Credit Card Statement Settlement...'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          {/* Category & Subcategory (for Income / Expense) */}
          {transactionType !== 'TRANSFER' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Main Category *
                </label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Select Main Category...</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Subcategory
                </label>
                <select
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  disabled={subcategories.length === 0}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm disabled:opacity-50"
                >
                  <option value="">General / Unspecified</option>
                  {subcategories.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Currency & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                Currency
              </label>
              <select
                value={originalCurrency}
                onChange={(e) => {
                  const curr = e.target.value;
                  setOriginalCurrency(curr);
                  if (curr === 'LKR') {
                    setExchangeRate('1');
                    if (originalAmount) setActualLkrAmount(originalAmount);
                  } else if (curr === 'USD' && exchangeRate === '1') {
                    setExchangeRate('305');
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
              >
                <option value="LKR">LKR (Sri Lankan Rupee)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
                <option value="AUD">AUD (Australian Dollar)</option>
              </select>
            </div>

            {originalCurrency !== 'LKR' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Original ({originalCurrency}) Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={originalAmount}
                  onChange={(e) => handleOriginalAmountChange(e.target.value)}
                  placeholder="20.00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Amount (LKR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={actualLkrAmount}
                  onChange={(e) => {
                    setActualLkrAmount(e.target.value);
                    setOriginalAmount(e.target.value);
                  }}
                  placeholder="15000.00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold font-mono"
                />
              </div>
            )}

            {originalCurrency !== 'LKR' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Actual LKR Charged *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={actualLkrAmount}
                  onChange={(e) => setActualLkrAmount(e.target.value)}
                  placeholder="6100.00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold font-mono"
                />
              </div>
            )}
          </div>

          {/* Accounts & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                {transactionType === 'INCOME'
                  ? 'Deposit Into Account *'
                  : transactionType === 'TRANSFER'
                    ? 'From Source Account *'
                    : 'Paid From Account *'}
              </label>
              <select
                required
                value={sourceAccountId}
                onChange={(e) => handleSourceAccountChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
              >
                {renderAccountOptions(accounts)}
              </select>
              {(() => {
                const selAcc = accounts.find((a) => a.id === sourceAccountId);
                if (!selAcc) return null;
                if (selAcc.accountType === 'CASH') {
                  return (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                      <span>💵</span> Physical Cash Wallet ({selAcc.ownershipType === 'HUSBAND' ? "Tharindu's Cash" : selAcc.ownershipType === 'WIFE' ? "Sudu's Cash" : 'Shared Household Cash'})
                    </p>
                  );
                }
                if (selAcc.linkedParentAccountId) {
                  const parent = accounts.find((a) => a.id === selAcc.linkedParentAccountId);
                  return (
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 font-medium flex items-center gap-1">
                      <span>💳</span> Debit Card linked to {parent?.name || 'Bank Account'} (Balance deducts from bank)
                    </p>
                  );
                }
                if (selAcc.accountType === 'CREDIT_CARD') {
                  return (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-medium flex items-center gap-1">
                      <span>💳</span> Credit Card Liability (Expenses increase credit debt)
                    </p>
                  );
                }
                if (selAcc.accountType === 'BANK_CURRENT' || selAcc.accountType === 'BANK_SAVINGS') {
                  return (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 font-medium flex items-center gap-1">
                      <span>🏦</span> Bank Account ({selAcc.bankName || 'Direct Account'})
                    </p>
                  );
                }
                return null;
              })()}
            </div>

            {transactionType === 'TRANSFER' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  To Destination Account *
                </label>
                <select
                  required
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                >
                  {renderAccountOptions(accounts)}
                </select>
                {(() => {
                  const destAcc = accounts.find((a) => a.id === destinationAccountId);
                  if (destAcc?.accountType === 'CASH') {
                    return (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-semibold flex items-center gap-1">
                        <span>💵</span> Cash received into {destAcc.name}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => handlePaymentMethodChange(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                >
                  <option value="DEBIT_CARD">💳 Debit Card</option>
                  <option value="CREDIT_CARD">💳 Credit Card</option>
                  <option value="BANK_TRANSFER">🌐 Bank Transfer / Online Banking</option>
                  <option value="CASH">💵 Cash</option>
                  <option value="DIRECT_DEBIT">Standing Order / Direct Debit</option>
                  <option value="DIGITAL_WALLET">📱 Digital Wallet / QR</option>
                  <option value="OTHER">Other</option>
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Auto-selected based on account or change anytime
                </p>
              </div>
            )}
          </div>

          {/* Transfer Service Charge / Fee Section */}
          {transactionType === 'TRANSFER' && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Bank Service Charge / Fee (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 30.00 (ATM) or 25.00 (CEFT)"
                    value={transferFeeLkr}
                    onChange={(e) => setTransferFeeLkr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold font-mono"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Optional fee charged by bank (e.g. ATM withdrawal fee)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Fee Expense Category
                  </label>
                  <select
                    value={transferFeeCategoryId}
                    onChange={(e) => setTransferFeeCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  >
                    <option value="">Default (Bank Charges and Fees)</option>
                    {categories
                      .filter((c) => c.type === 'EXPENSE')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {Number(transferFeeLkr) > 0 && Number(actualLkrAmount) > 0 && (
                <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Total Deducted from Source: <strong>{formatLKR(addMoney(actualLkrAmount, transferFeeLkr))}</strong>
                  </span>
                  <span>
                    Destination Receives: <strong>{formatLKR(actualLkrAmount)}</strong>
                  </span>
                  <span>
                    Bank Charge Expense: <strong>{formatLKR(transferFeeLkr)}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Classification & Funding Source ("Api wiyadam karana salli kohenda enne") */}
          {transactionType !== 'TRANSFER' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                  Money Source (Salli Kohenda Awe / Wiyadam Kale?) *
                </label>
                <select
                  value={fundingSource}
                  onChange={(e) => setFundingSource(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-xs font-medium"
                >
                  <option value="REGULAR_INCOME">
                    1. Regular Monthly Salary (Tharindu 10-12th / Wife Basic)
                  </option>
                  <option value="OVERTIME_INCOME">
                    2. Wife Overtime (OT ~100k on 24-26th)
                  </option>
                  <option value="BORROWED_FRIENDS_PARENTS">
                    3. Borrowed from Friends / Parents (Yaluwangen / Parentlagen)
                  </option>
                  <option value="PREVIOUS_SAVINGS">
                    4. From Previously Saved Money (Ituru Karapu Salli Walin)
                  </option>
                  <option value="OTHER">Other Source</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  Household Scope & Classification
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={householdMemberScope}
                    onChange={(e) => setHouseholdMemberScope(e.target.value as HouseholdMemberScope)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="SHARED">Shared Household</option>
                    <option value="HUSBAND">Tharindu Personal</option>
                    <option value="WIFE">Wife (Sudu) Personal</option>
                  </select>

                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEssential}
                      onChange={(e) => setIsEssential(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Essential
                  </label>

                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isFixed}
                      onChange={(e) => setIsFixed(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    Fixed
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Optional Utility Billing Period */}
          {transactionType === 'EXPENSE' && isUtilityCategory && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
              <div>
                <label className="block text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Utility Billing Period Start
                </label>
                <input
                  type="date"
                  value={utilityStart}
                  onChange={(e) => setUtilityStart(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Utility Billing Period End
                </label>
                <input
                  type="date"
                  value={utilityEnd}
                  onChange={(e) => setUtilityEnd(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
            </div>
          )}

          {/* Multi-Item Split Grocery Receipt Support (Section 5E) */}
          {transactionType === 'EXPENSE' && subcategories.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Split className="w-4 h-4 text-blue-500" />
                  <span>Itemized Subcategory Breakdown (Optional — e.g., Supermarket Receipt)</span>
                </div>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSplitItemsSumToTotal}
                      className="text-xs px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                    >
                      Use Sum as Total
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddSplitItem}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 hover:bg-blue-100"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item Split
                  </button>
                </div>
              </div>

              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <select
                          value={item.subcategoryId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, subcategoryId: val } : it))
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        >
                          {subcategories.map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="Item description (e.g. Fresh Chicken)"
                          value={item.itemName}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, itemName: val } : it))
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="LKR Amount"
                          value={item.amountLkr}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, amountLkr: val } : it))
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Additional notes, receipt reference, or remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
            >
              {submitting
                ? 'Saving...'
                : editingTransaction
                  ? 'Save Changes'
                  : 'Record Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

