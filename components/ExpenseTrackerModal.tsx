import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CloseIcon, CurrencyDollarIcon } from './icons';
import type { UserProfile, Transaction } from '../types';

interface ExpenseTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

const ITEMS_PER_PAGE = 5;

const StatDisplay: React.FC<{ title: string; data: { diff: number; percent: number }; type: 'income' | 'expense' }> = ({ title, data, type }) => {
    const isIncrease = data.diff > 0;
    const isDecrease = data.diff < 0;
    const noChange = data.diff === 0;

    let colorClass = 'text-slate-500 dark:text-slate-400';
    if (!noChange) {
        if (type === 'income') {
            // For income: increase is good (green), decrease is bad (red)
            colorClass = isIncrease ? 'text-green-500' : 'text-red-500';
        } else { // expense
            // For expense: increase is bad (red), decrease is good (green)
            colorClass = isIncrease ? 'text-red-500' : 'text-green-500';
        }
    }
    
    const arrow = isIncrease ? '▲' : isDecrease ? '▼' : '';

    return (
        <div className="text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
            <p className={`font-semibold ${colorClass}`}>{arrow} {Math.abs(data.diff).toLocaleString('vi-VN')} VNĐ</p>
            <p className={`text-xs ${colorClass}`}>({data.percent.toFixed(1)}%)</p>
        </div>
    );
};


export const ExpenseTrackerModal: React.FC<ExpenseTrackerModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [formState, setFormState] = useState({ type: 'expense' as 'income' | 'expense', amount: '', description: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [calculatorDisplay, setCalculatorDisplay] = useState('0');
  const [calculatorState, setCalculatorState] = useState({ value: null as number | null, waitingForOperand: false, operator: null as string | null });
  const importInputRef = useRef<HTMLInputElement>(null);

  const storageKey = useMemo(() => userProfile ? `expense-tracker-${userProfile.email}` : null, [userProfile]);

  useEffect(() => {
    if (isOpen && storageKey) {
      try {
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
          setTransactions(JSON.parse(savedData));
        } else {
          setTransactions([]);
        }
      } catch (e) {
        console.error("Failed to load expense data from localStorage", e);
        setTransactions([]);
      }
    }
  }, [isOpen, storageKey]);

  useEffect(() => {
    if (storageKey && isOpen) { // Only save when modal is open to avoid background writes
      localStorage.setItem(storageKey, JSON.stringify(transactions));
    }
  }, [transactions, storageKey, isOpen]);

  const balance = useMemo(() => {
    return transactions.reduce((acc, t) => {
      return t.type === 'income' ? acc + t.amount : acc - t.amount;
    }, 0);
  }, [transactions]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const { income: currentIncome, expense: currentExpense } = transactions.reduce(
        (acc, t) => {
            const tDate = new Date(t.date);
            if (tDate.getFullYear() === currentYear && tDate.getMonth() === currentMonth) {
                if (t.type === 'income') acc.income += t.amount;
                else acc.expense += t.amount;
            }
            return acc;
        }, { income: 0, expense: 0 }
    );

    const prevMonthDate = new Date(currentYear, currentMonth, 1);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const { income: prevIncome, expense: prevExpense } = transactions.reduce(
        (acc, t) => {
            const tDate = new Date(t.date);
            if (tDate.getFullYear() === prevMonthYear && tDate.getMonth() === prevMonth) {
                if (t.type === 'income') acc.income += t.amount;
                else acc.expense += t.amount;
            }
            return acc;
        }, { income: 0, expense: 0 }
    );
    
    const calculateDiff = (current: number, prev: number) => {
        const diff = current - prev;
        const percent = prev === 0 ? (current > 0 ? 100 : 0) : (diff / prev) * 100;
        return { diff, percent };
    };

    return {
        income: calculateDiff(currentIncome, prevIncome),
        expense: calculateDiff(currentExpense, prevExpense),
    };
}, [transactions]);
  
  const paginatedTransactions = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [transactions, currentPage]);
  
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);

  const handleCalculatorInput = (input: string) => {
    if (input === '.' && calculatorDisplay.includes('.')) return;
    if (calculatorDisplay === '0' || calculatorState.waitingForOperand) {
      setCalculatorDisplay(input);
      setCalculatorState(s => ({ ...s, waitingForOperand: false }));
    } else {
      setCalculatorDisplay(prev => prev + input);
    }
  };
  
  const performCalculation = {
    '/': (first: number, second: number) => first / second,
    '*': (first: number, second: number) => first * second,
    '+': (first: number, second: number) => first + second,
    '-': (first: number, second: number) => first - second,
    '=': (_: number, second: number) => second
  };

  const handleOperator = (nextOperator: string) => {
    const inputValue = parseFloat(calculatorDisplay);
    if (calculatorState.value == null) {
      setCalculatorState({ value: inputValue, waitingForOperand: true, operator: nextOperator });
    } else if (calculatorState.operator) {
      const result = performCalculation[calculatorState.operator as keyof typeof performCalculation](calculatorState.value, inputValue);
      setCalculatorDisplay(String(result));
      setCalculatorState({ value: result, waitingForOperand: true, operator: nextOperator });
    }
  };

  const handleClearCalculator = () => {
    setCalculatorDisplay('0');
    setCalculatorState({ value: null, waitingForOperand: false, operator: null });
  };
  
  const handleSelectTransaction = (transaction: Transaction) => {
    const transactionDate = new Date(transaction.date);
    const year = transactionDate.getFullYear();
    const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
    const day = String(transactionDate.getDate()).padStart(2, '0');

    setEditingId(transaction.id);
    setDate(`${year}-${month}-${day}`);
    setFormState({
      type: transaction.type,
      amount: String(transaction.amount),
      description: transaction.description,
    });
    setCalculatorDisplay(String(transaction.amount));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormState({ type: 'expense', amount: '', description: '' });
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handleDeleteTransaction = () => {
    if (!editingId) return;
    if (window.confirm("Are you sure you want to delete this transaction? This action cannot be undone.")) {
        setTransactions(prev => prev.filter(t => t.id !== editingId));
        handleCancelEdit();
    }
  };

  const handleSubmitTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formState.amount);
    if (!amount || amount <= 0 || !formState.description) {
      alert("Please enter a valid amount and description.");
      return;
    }

    // By appending T00:00:00, we tell the Date constructor to parse it in the local timezone,
    // not UTC. This prevents the timezone shift issue.
    const localDate = new Date(`${date}T00:00:00`);

    if (editingId) {
        const updatedTransaction: Transaction = {
            id: editingId,
            date: localDate.toISOString(),
            type: formState.type,
            amount,
            description: formState.description
        };
        setTransactions(prev => prev.map(t => t.id === editingId ? updatedTransaction : t));
    } else {
        const newTransaction: Transaction = {
          id: Date.now().toString(),
          date: localDate.toISOString(),
          type: formState.type,
          amount,
          description: formState.description
        };
        setTransactions(prev => [newTransaction, ...prev]);
    }
    handleCancelEdit();
  };

  const handleExport = (format: 'json' | 'txt') => {
    if (transactions.length === 0) {
        alert("No history to export.");
        return;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    let content = '';
    let mimeType = '';
    let fileName = '';

    if (format === 'json') {
        content = JSON.stringify(transactions, null, 2);
        mimeType = 'application/json';
        fileName = `expense_history_${dateStr}.json`;
    } else {
        content = `Expense History - ${new Date().toLocaleString('vi-VN')}\n\n`;
        content += transactions
            .map(t => {
                const type = t.type === 'income' ? '[Thu]' : '[Chi]';
                const amount = `${t.type === 'income' ? '+' : '-'}${t.amount.toLocaleString('vi-VN')} VNĐ`;
                const date = new Date(t.date).toLocaleString('vi-VN');
                return `${date} | ${type} | ${amount} | ${t.description}`;
            })
            .join('\n');
        mimeType = 'text/plain';
        fileName = `expense_history_${dateStr}.txt`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const result = event.target?.result as string;
            const importedData = JSON.parse(result);

            // Basic validation
            const isValid = Array.isArray(importedData) && importedData.every(item => 
                'id' in item && 'type' in item && 'amount' in item && 'description' in item && 'date' in item
            );

            if (!isValid) {
                throw new Error("Invalid data structure.");
            }
            
            if (window.confirm("This will overwrite your current transaction history. Are you sure?")) {
                setTransactions(importedData);
            }
        } catch (error) {
            alert("Sai dữ liệu json. Vui lòng tải lại!");
        } finally {
            // Reset input to allow re-importing the same file
            if (importInputRef.current) {
                importInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose} role="dialog">
      <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col p-6 text-slate-800 dark:text-slate-200" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold flex items-center gap-2"><CurrencyDollarIcon className="w-7 h-7 text-green-500"/> Sổ Tay Chi Tiêu Cá Nhân</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"><CloseIcon className="w-6 h-6"/></button>
        </div>

        {!userProfile ? (
            <div className="flex-grow flex items-center justify-center text-center"><p>Please sign in to use the expense tracker.</p></div>
        ) : (
            <div className="flex flex-col flex-grow min-h-0">
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg mb-4 flex flex-col sm:flex-row justify-between items-center flex-shrink-0 gap-4">
                    <div className="flex items-center gap-4">
                        <div>
                            <label htmlFor="transaction-date" className="text-sm font-medium text-slate-500 dark:text-slate-400">Selected Date</label>
                            <input type="date" id="transaction-date" value={date} onChange={e => setDate(e.target.value)} className="bg-transparent font-semibold text-lg dark:text-white focus:outline-none"/>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Tổng số dư</p>
                            <p className={`text-3xl font-bold ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{balance.toLocaleString('vi-VN')} VNĐ</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 text-xs p-2 rounded-md bg-white dark:bg-slate-700/50">
                        <StatDisplay title="Thu tháng này" data={monthlyStats.income} type="income" />
                        <StatDisplay title="Chi tháng này" data={monthlyStats.expense} type="expense" />
                    </div>
                </div>

                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0 overflow-y-auto">
                    {/* Left Column: Calculator */}
                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg flex flex-col">
                        <div className="bg-white dark:bg-slate-900 rounded p-2 text-right text-3xl font-mono mb-4">{calculatorDisplay}</div>
                        <div className="grid grid-cols-4 gap-2">
                            {['AC', '+/-', '%', '/'].map(op => <button key={op} onClick={() => { if (op === 'AC') handleClearCalculator(); else handleOperator(op); }} className="calc-btn bg-slate-300 dark:bg-slate-600">{op}</button>)}
                            {['7', '8', '9', '*'].map(op => <button key={op} onClick={() => (Number.isInteger(parseInt(op)) ? handleCalculatorInput(op) : handleOperator(op))} className={`calc-btn ${Number.isInteger(parseInt(op)) ? 'bg-slate-200 dark:bg-slate-700' : 'bg-indigo-500 text-white'}`}>{op}</button>)}
                            {['4', '5', '6', '-'].map(op => <button key={op} onClick={() => (Number.isInteger(parseInt(op)) ? handleCalculatorInput(op) : handleOperator(op))} className={`calc-btn ${Number.isInteger(parseInt(op)) ? 'bg-slate-200 dark:bg-slate-700' : 'bg-indigo-500 text-white'}`}>{op}</button>)}
                            {['1', '2', '3', '+'].map(op => <button key={op} onClick={() => (Number.isInteger(parseInt(op)) ? handleCalculatorInput(op) : handleOperator(op))} className={`calc-btn ${Number.isInteger(parseInt(op)) ? 'bg-slate-200 dark:bg-slate-700' : 'bg-indigo-500 text-white'}`}>{op}</button>)}
                            <button onClick={() => handleCalculatorInput('0')} className="calc-btn bg-slate-200 dark:bg-slate-700 col-span-2">0</button>
                            <button onClick={() => handleCalculatorInput('.')} className="calc-btn bg-slate-200 dark:bg-slate-700">.</button>
                            <button onClick={() => handleOperator('=')} className="calc-btn bg-indigo-500 text-white">=</button>
                        </div>
                        <button onClick={() => setFormState(s => ({...s, amount: calculatorDisplay}))} className="w-full mt-4 p-2 bg-slate-300 dark:bg-slate-600 rounded-md text-sm font-semibold hover:bg-slate-400 dark:hover:bg-slate-500">Use this amount</button>
                    </div>

                    {/* Right Column: Form & History */}
                    <div className="flex flex-col min-h-0 gap-4">
                         {/* Form */}
                        <form onSubmit={handleSubmitTransaction} className="space-y-4 flex-shrink-0">
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setFormState(s => ({...s, type: 'income'}))} className={`p-3 rounded-lg font-semibold ${formState.type === 'income' ? 'bg-green-500 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>Thu</button>
                                <button type="button" onClick={() => setFormState(s => ({...s, type: 'expense'}))} className={`p-3 rounded-lg font-semibold ${formState.type === 'expense' ? 'bg-red-500 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>Chi</button>
                            </div>
                            <div>
                                <label htmlFor="amount" className="label-style">Số tiền</label>
                                <input id="amount" type="number" value={formState.amount} onChange={e => setFormState(s => ({...s, amount: e.target.value}))} required className="input-style mt-1" placeholder="0"/>
                            </div>
                            <div>
                                <label htmlFor="description" className="label-style">Nội dung</label>
                                <input id="description" type="text" value={formState.description} onChange={e => setFormState(s => ({...s, description: e.target.value}))} required className="input-style mt-1" placeholder="e.g., Coffee with friends"/>
                            </div>
                            {editingId ? (
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="grid grid-cols-3 gap-2">
                                        <button type="submit" className="w-full p-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 col-span-2">Save</button>
                                        <button type="button" onClick={handleDeleteTransaction} className="w-full p-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Delete</button>
                                    </div>
                                    <button type="button" onClick={handleCancelEdit} className="w-full p-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600">Cancel</button>
                                </div>
                            ) : (
                                <button type="submit" className="w-full p-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Save Transaction</button>
                            )}
                        </form>
                        
                        {/* History */}
                        <div className="flex flex-col min-h-0 flex-grow">
                            <div className="flex justify-between items-center mb-2 flex-shrink-0">
                                <h3 className="text-lg font-semibold">History</h3>
                                 <div className="flex gap-2">
                                    <input type="file" ref={importInputRef} onChange={handleFileImport} className="hidden" accept=".json"/>
                                    <button onClick={() => importInputRef.current?.click()} className="text-xs font-semibold p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">Import</button>
                                    <button onClick={() => handleExport('json')} className="text-xs font-semibold p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">Export JSON</button>
                                    <button onClick={() => handleExport('txt')} className="text-xs font-semibold p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">Export TXT</button>
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-2 space-y-2">
                               {paginatedTransactions.length > 0 ? paginatedTransactions.map(t => (
                                   <button key={t.id} onClick={() => handleSelectTransaction(t)} className={`w-full text-left flex justify-between items-center p-3 bg-white dark:bg-slate-700 rounded-md transition-all ${editingId === t.id ? 'ring-2 ring-indigo-500' : 'hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                       <div>
                                           <p className="font-semibold">{t.description}</p>
                                           <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(t.date).toLocaleString('vi-VN')}</p>
                                       </div>
                                       <p className={`font-bold ${t.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>{t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString('vi-VN')} VNĐ</p>
                                   </button>
                               )) : <p className="text-center text-slate-500 p-4">No transactions yet.</p>}
                            </div>
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-2 mt-2 flex-shrink-0">
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="p-2 disabled:opacity-50">‹</button>
                                    <span className="text-sm">Page {currentPage} of {totalPages}</span>
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} className="p-2 disabled:opacity-50">›</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
      <style>{`
        .calc-btn { padding: 1rem; border-radius: 0.5rem; font-size: 1.25rem; font-weight: 600; transition: background-color 0.2s; }
        .calc-btn:hover { filter: brightness(0.9); }
        .input-style { background-color: white; color: black; border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 0.75rem; width: 100%; }
        .dark .input-style { background-color: #1e293b; color: white; border-color: #475569; }
        .label-style { display: block; font-size: 0.875rem; font-weight: 500; color: #475569; }
        .dark .label-style { color: #94a3b8; }
      `}</style>
    </div>
  );
};
