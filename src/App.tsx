/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  BrainCircuit, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Loader2,
  Calendar,
  Tag,
  FileText,
  Trash2,
  Download
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from './lib/utils';

// Types
type TransactionType = 'income' | 'expense';

interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string;
}

const CATEGORIES = {
  income: ['Syahriah', 'Donasi', 'Infaq Jumat', 'Lainnya'],
  expense: ['Gaji Guru', 'Operasional', 'Pemeliharaan', 'Sarana', 'Lainnya']
};

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'input' | 'history' | 'ai'>('dashboard');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    type: 'income' as TransactionType,
    amount: '',
    category: 'Syahriah',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  // Stats
  const stats = useMemo(() => {
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;

    return { totalIncome, totalExpense, balance };
  }, [transactions]);

  const chartData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const date = subMonths(new Date(), 5 - i);
      const monthStr = format(date, 'MMM');
      const start = startOfMonth(date);
      const end = endOfMonth(date);

      const monthTransactions = transactions.filter(t => 
        isWithinInterval(new Date(t.date), { start, end })
      );

      return {
        name: monthStr,
        income: monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        expense: monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
      };
    });
    return last6Months;
  }, [transactions]);

  const pieData = useMemo(() => {
    const categories = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  // AI Logic
  const handleAiInput = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setAiResponse(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Ekstrak data transaksi keuangan TPQ dari teks berikut: "${aiInput}". 
        Berikan respons dalam format JSON murni dengan struktur: 
        { "type": "income" | "expense", "amount": number, "category": string, "description": string }.
        Gunakan kategori yang relevan dari daftar ini: 
        Income: ${CATEGORIES.income.join(', ')}
        Expense: ${CATEGORIES.expense.join(', ')}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['income', 'expense'] },
              amount: { type: Type.NUMBER },
              category: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ['type', 'amount', 'category', 'description']
          }
        }
      });

      const result = JSON.parse(response.text);
      setFormData({
        ...formData,
        type: result.type,
        amount: result.amount.toString(),
        category: result.category,
        description: result.description
      });
      setAiResponse(`Berhasil mengekstrak: ${result.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} sebesar Rp ${result.amount.toLocaleString()} untuk ${result.description}. Silakan periksa form input.`);
      setActiveTab('input');
    } catch (error) {
      console.error(error);
      setAiResponse("Maaf, saya gagal memahami input tersebut. Coba gunakan bahasa yang lebih jelas.");
    } finally {
      setIsAiLoading(false);
      setAiInput('');
    }
  };

  const addTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: formData.type,
      amount: parseFloat(formData.amount),
      category: formData.category,
      description: formData.description,
      date: formData.date
    };
    setTransactions([newTransaction, ...transactions]);
    setFormData({
      type: 'income',
      amount: '',
      category: 'Syahriah',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd')
    });
    setActiveTab('dashboard');
  };

  const deleteTransaction = (id: string) => {
    setTransactions(transactions.filter(t => t.id !== id));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-20 md:h-screen md:border-t-0 md:border-r">
        <div className="hidden md:flex mb-8">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold">T</div>
        </div>
        <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={24} />} label="Dashboard" />
        <NavItem active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<BrainCircuit size={24} />} label="AI Input" />
        <NavItem active={activeTab === 'input'} onClick={() => setActiveTab('input')} icon={<PlusCircle size={24} />} label="Manual" />
        <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={24} />} label="Riwayat" />
      </nav>

      {/* Main Content */}
      <main className="pb-24 pt-6 px-4 md:pl-28 md:pt-10 max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TPQ Finance Manager</h1>
            <p className="text-gray-500 text-sm">Manajemen keuangan cerdas untuk pengurus TPQ</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-sm font-medium">{format(new Date(), 'dd MMMM yyyy')}</span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard 
                  title="Total Saldo" 
                  value={formatCurrency(stats.balance)} 
                  icon={<Wallet className="text-emerald-600" />}
                  bgColor="bg-emerald-50"
                  trend={stats.balance >= 0 ? 'up' : 'down'}
                />
                <StatCard 
                  title="Pemasukan" 
                  value={formatCurrency(stats.totalIncome)} 
                  icon={<ArrowUpRight className="text-blue-600" />}
                  bgColor="bg-blue-50"
                />
                <StatCard 
                  title="Pengeluaran" 
                  value={formatCurrency(stats.totalExpense)} 
                  icon={<ArrowDownRight className="text-rose-600" />}
                  bgColor="bg-rose-50"
                />
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <TrendingUp size={20} className="text-emerald-600" />
                    Tren 6 Bulan Terakhir
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                          cursor={{ fill: '#f9fafb' }}
                        />
                        <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="expense" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <Tag size={20} className="text-emerald-600" />
                    Alokasi Pengeluaran
                  </h3>
                  <div className="h-64 flex items-center justify-center">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#f43f5e', '#8b5cf6'][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-gray-400 text-sm italic">Belum ada data pengeluaran</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Transactions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Transaksi Terakhir</h3>
                  <button onClick={() => setActiveTab('history')} className="text-emerald-600 text-sm font-medium hover:underline">Lihat Semua</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {transactions.slice(0, 5).map(t => (
                    <TransactionItem key={t.id} transaction={t} onDelete={deleteTransaction} />
                  ))}
                  {transactions.length === 0 && (
                    <div className="p-10 text-center text-gray-400">Belum ada transaksi</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'ai' && (
            <motion.div 
              key="ai"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="bg-emerald-600 text-white p-8 rounded-3xl shadow-xl shadow-emerald-100 relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold mb-2">Input Cerdas AI</h2>
                  <p className="text-emerald-100 mb-6">Ketik transaksi Anda dalam bahasa sehari-hari, AI akan mengaturnya untuk Anda.</p>
                  
                  <div className="relative">
                    <textarea 
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder='Contoh: "Beli spidol 2 pack total 25 ribu" atau "Terima iuran Jafar 50rb"'
                      className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-white placeholder:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-white/50 min-h-[120px]"
                    />
                    <button 
                      onClick={handleAiInput}
                      disabled={isAiLoading || !aiInput.trim()}
                      className="absolute bottom-4 right-4 bg-white text-emerald-600 p-3 rounded-xl shadow-lg hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                    </button>
                  </div>
                </div>
                {/* Decorative circles */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-emerald-700/50 rounded-full blur-3xl"></div>
              </div>

              {aiResponse && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-4 rounded-2xl border border-emerald-100 flex gap-3 items-start"
                >
                  <div className="bg-emerald-100 p-2 rounded-lg">
                    <BrainCircuit size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{aiResponse}</p>
                </motion.div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SuggestionCard text="Terima donasi pembangunan 1 juta" onClick={() => setAiInput("Terima donasi pembangunan 1 juta")} />
                <SuggestionCard text="Beli snack rapat guru 75 ribu" onClick={() => setAiInput("Beli snack rapat guru 75 ribu")} />
              </div>
            </motion.div>
          )}

          {activeTab === 'input' && (
            <motion.div 
              key="input"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-xl mx-auto"
            >
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <h2 className="text-xl font-bold mb-6">Tambah Transaksi Manual</h2>
                <form onSubmit={addTransaction} className="space-y-4">
                  <div className="flex p-1 bg-gray-100 rounded-xl">
                    <button 
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, type: 'income', category: CATEGORIES.income[0] });
                      }}
                      className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                        formData.type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-500"
                      )}
                    >
                      Pemasukan
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, type: 'expense', category: CATEGORIES.expense[0] });
                      }}
                      className={cn(
                        "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                        formData.type === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-gray-500"
                      )}
                    >
                      Pengeluaran
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Nominal (Rp)</label>
                    <input 
                      type="number" 
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 text-lg font-bold"
                      placeholder="0"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Kategori</label>
                      <select 
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500"
                      >
                        {CATEGORIES[formData.type].map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tanggal</label>
                      <input 
                        type="date" 
                        required
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Keterangan</label>
                    <input 
                      type="text" 
                      required
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500"
                      placeholder="Misal: Iuran Syahriah Jafar"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors mt-4"
                  >
                    Simpan Transaksi
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Riwayat Transaksi</h2>
                <button className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:bg-gray-50">
                  <Download size={16} />
                  Export PDF
                </button>
              </div>

              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {transactions.map(t => (
                    <TransactionItem key={t.id} transaction={t} onDelete={deleteTransaction} />
                  ))}
                  {transactions.length === 0 && (
                    <div className="p-20 text-center">
                      <History size={48} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-gray-400">Belum ada riwayat transaksi</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// Sub-components
function NavItem({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-xl transition-all md:w-full md:py-4",
        active ? "text-emerald-600 bg-emerald-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider md:hidden">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, bgColor, trend }: { title: string, value: string, icon: React.ReactNode, bgColor: string, trend?: 'up' | 'down' }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", bgColor)}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
        <h4 className="text-xl font-bold text-gray-900">{value}</h4>
      </div>
    </div>
  );
}

function TransactionItem({ transaction, onDelete }: { transaction: Transaction, onDelete: (id: string) => void, key?: string }) {
  return (
    <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          transaction.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {transaction.type === 'income' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{transaction.description}</p>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{transaction.category}</span>
            <span>•</span>
            <span>{format(new Date(transaction.date), 'dd MMM yyyy')}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <p className={cn(
          "font-bold",
          transaction.type === 'income' ? "text-emerald-600" : "text-rose-600"
        )}>
          {transaction.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(transaction.amount)}
        </p>
        <button 
          onClick={() => onDelete(transaction.id)}
          className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-rose-600 transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({ text, onClick }: { text: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="bg-white p-4 rounded-2xl border border-gray-100 text-left text-sm text-gray-600 hover:border-emerald-200 hover:bg-emerald-50 transition-all shadow-sm"
    >
      "{text}"
    </button>
  );
}
