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
  Download,
  Eye,
  EyeOff,
  LogOut,
  X,
  Check
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
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, isToday, isSameWeek, isSameMonth, isSameYear, parseISO, startOfDay, endOfDay } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from './lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  getDocFromServer,
  getDocs
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Error handler for Firestore
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Types
type TransactionType = 'income' | 'expense';
type FilterType = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

interface Transaction {
  id: string;
  bookId: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string;
  time: string;
}

interface Book {
  id: string;
  name: string;
  userId: string;
  createdAt: any;
}

const CATEGORIES = {
  income: ['Syahriah', 'Donasi', 'Infaq Jumat', 'Lainnya'],
  expense: ['Gaji Guru', 'Operasional', 'Pemeliharaan', 'Sarana', 'Lainnya']
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [isBookSubmitLoading, setIsBookSubmitLoading] = useState(false);
  
  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthSubmitLoading, setIsAuthSubmitLoading] = useState(false);
  const [showResendVerif, setShowResendVerif] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Export State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportRange, setExportRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Validate Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Sync Books
  useEffect(() => {
    if (!user) {
      setBooks([]);
      setSelectedBookId(null);
      return;
    }

    const q = query(
      collection(db, 'books'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Book[];
      
      setBooks(booksData);

      if (booksData.length === 0) {
        // Create default book if none exists
        try {
          const defaultBook = {
            name: 'Buku Utama',
            userId: user.uid,
            createdAt: serverTimestamp()
          };
          const docRef = await addDoc(collection(db, 'books'), defaultBook);
          setSelectedBookId(docRef.id);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'books');
        }
      } else if (!selectedBookId) {
        setSelectedBookId(booksData[0].id);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Sync with Firestore
  useEffect(() => {
    if (!user || !selectedBookId) {
      setTransactions([]);
      return;
    }

    setTransactionsLoading(true);

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      where('bookId', '==', selectedBookId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const transData = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as Transaction[];
        setTransactions(transData);
        setTransactionsLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'transactions');
        setTransactionsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, selectedBookId]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'input' | 'history' | 'ai'>('dashboard');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);

  // Filter State
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [customRange, setCustomRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  // Form State
  const [formData, setFormData] = useState({
    type: 'income' as TransactionType,
    amount: '',
    category: 'Syahriah',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm')
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
      // Use the standard Gemini API key provided by the platform
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("API Key tidak ditemukan. Pastikan Anda menjalankan aplikasi di lingkungan AI Studio.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const currentTime = format(new Date(), 'HH:mm');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: `Ekstrak data transaksi keuangan TPQ dari teks berikut: "${aiInput}". 
        Berikan respons dalam format JSON murni dengan struktur: 
        { "type": "income" | "expense", "amount": number, "category": string, "description": string, "time": "HH:mm" }.
        Jika waktu tidak disebutkan, gunakan "${currentTime}".
        Gunakan kategori yang relevan dari daftar ini: 
        Income: ${CATEGORIES.income.join(', ')}
        Expense: ${CATEGORIES.expense.join(', ')}` }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['income', 'expense'] },
              amount: { type: Type.NUMBER },
              category: { type: Type.STRING },
              description: { type: Type.STRING },
              time: { type: Type.STRING }
            },
            required: ['type', 'amount', 'category', 'description', 'time']
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("AI tidak memberikan respons.");
      
      const result = JSON.parse(text);
      
      setFormData({
        ...formData,
        type: result.type,
        amount: formatNumberInput(result.amount.toString()),
        category: result.category,
        description: result.description,
        time: result.time || currentTime
      });
      
      setAiResponse(`Berhasil mengekstrak: ${result.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} sebesar Rp ${result.amount.toLocaleString()} untuk "${result.description}". Data telah dimasukkan ke form.`);
      
      // Small delay before switching tab to let user read the message
      setTimeout(() => {
        setActiveTab('input');
      }, 1500);

    } catch (error: any) {
      console.error("AI Input Error:", error);
      setAiResponse(`Kesalahan: ${error.message || "Gagal memproses input."}`);
    } finally {
      setIsAiLoading(false);
      setAiInput('');
    }
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedBookId) return;

    // Parse numeric value from formatted string
    const numericAmount = parseFloat(formData.amount.replace(/\./g, ''));

    const transData = {
      bookId: selectedBookId,
      type: formData.type,
      amount: numericAmount,
      category: formData.category,
      description: formData.description,
      date: formData.date,
      time: formData.time,
      userId: user.uid,
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'transactions'), transData);
      setFormData({
        type: 'income',
        amount: '',
        category: 'Syahriah',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm')
      });
      setActiveTab('history');
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
    }
  };

  const createBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newBookName.trim()) return;

    setIsBookSubmitLoading(true);
    try {
      const bookData = {
        name: newBookName,
        userId: user.uid,
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'books'), bookData);
      setSelectedBookId(docRef.id);
      setNewBookName('');
      setIsBookModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'books');
    } finally {
      setIsBookSubmitLoading(false);
    }
  };

  const deleteBook = async (bookId: string) => {
    if (!user) return;
    
    setIsBookSubmitLoading(true);
    try {
      // 1. Delete all transactions associated with this book
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', user.uid),
        where('bookId', '==', bookId)
      );
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // 2. Delete the book document
      await deleteDoc(doc(db, 'books', bookId));

      // 3. Reset selected book if the current one was deleted
      if (selectedBookId === bookId) {
        const remainingBooks = books.filter(b => b.id !== bookId);
        setSelectedBookId(remainingBooks.length > 0 ? remainingBooks[0].id : null);
      }
      
      setBookToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `books/${bookId}`);
    } finally {
      setIsBookSubmitLoading(false);
    }
  };

  const selectedBook = useMemo(() => {
    return books.find(b => b.id === selectedBookId);
  }, [books, selectedBookId]);

  const login = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed", error);
      let message = "Gagal masuk dengan Google. Silakan coba lagi.";
      
      if (error.code === 'auth/unauthorized-domain') {
        message = "Domain ini tidak diizinkan untuk login. Tambahkan domain Vercel Anda di Firebase Console (Authentication > Settings > Authorized domains).";
      } else if (error.code === 'auth/popup-closed-by-user') {
        message = "Jendela login ditutup sebelum selesai.";
      } else if (error.message) {
        message = `Gagal masuk: ${error.message}`;
      }
      
      setAuthError(message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (isRegistering && authPassword !== authConfirmPassword) {
      setAuthError("Konfirmasi password tidak cocok.");
      return;
    }

    setIsAuthSubmitLoading(true);

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await sendEmailVerification(userCredential.user);
        await signOut(auth);
        setAuthSuccess("Terima kasih telah mendaftar! Link verifikasi telah dikirim ke email Anda. Silakan verifikasi sebelum login.");
        setIsRegistering(false);
        setAuthPassword('');
        setAuthConfirmPassword('');
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        if (!userCredential.user.emailVerified) {
          await signOut(auth);
          setAuthError("Email Anda belum diverifikasi. Silakan cek inbox (atau spam) email Anda.");
          setShowResendVerif(true);
        }
      }
    } catch (error: any) {
      console.error("Auth error", error);
      let message = "Terjadi kesalahan saat login.";
      
      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          message = "Email atau password salah. Silakan periksa kembali.";
          break;
        case 'auth/email-already-in-use':
          message = "Email ini sudah terdaftar sebagai akun. Silakan klik 'Login' di bawah untuk masuk.";
          break;
        case 'auth/weak-password':
          message = "Password terlalu lemah. Minimal gunakan 6 karakter.";
          break;
        case 'auth/invalid-email':
          message = "Format email tidak valid (contoh: nama@tpq.com).";
          break;
        case 'auth/operation-not-allowed':
          message = "Metode Login Email/Password belum diaktifkan di Firebase Console. Hubungi admin.";
          break;
        case 'auth/too-many-requests':
          message = "Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat atau reset password.";
          break;
        default:
          message = error.message || "Gagal memproses autentikasi.";
      }
      setAuthError(message);
    } finally {
      setIsAuthSubmitLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!authEmail || !authPassword) {
      setAuthError("Silakan masukkan kembali email dan password Anda untuk mengirim ulang link verifikasi.");
      return;
    }
    
    setIsAuthSubmitLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
      await sendEmailVerification(userCredential.user);
      await signOut(auth);
      setAuthSuccess("Link verifikasi baru telah dikirim! Silakan cek email Anda.");
      setAuthError(null);
      setShowResendVerif(false);
    } catch (error: any) {
      setAuthError("Gagal mengirim ulang link: " + (error.message || "Pastikan email dan password benar."));
    } finally {
      setIsAuthSubmitLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!authEmail) {
      setAuthError("Silakan masukkan email Anda terlebih dahulu.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, authEmail);
      setAiResponse("Email pemulihan password telah dikirim ke " + authEmail);
      setAuthError(null);
    } catch (error) {
      setAuthError("Gagal mengirim email pemulihan.");
    }
  };

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      const tDate = parseISO(t.date);
      switch (filterType) {
        case 'daily':
          return isToday(tDate);
        case 'weekly':
          return isSameWeek(tDate, now);
        case 'monthly':
          return isSameMonth(tDate, now);
        case 'yearly':
          return isSameYear(tDate, now);
        case 'custom':
          const start = startOfDay(parseISO(customRange.start));
          const end = endOfDay(parseISO(customRange.end));
          return isWithinInterval(tDate, { start, end });
        default:
          return true;
      }
    });
  }, [transactions, filterType, customRange]);

  const filterTransactionsByRange = (range: { start: string; end: string }) => {
    const start = startOfDay(parseISO(range.start));
    const end = endOfDay(parseISO(range.end));
    return transactions
      .filter(t => isWithinInterval(parseISO(t.date), { start, end }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const exportToExcel = (range: { start: string; end: string }) => {
    const dataToExport = filterTransactionsByRange(range);
    const data = dataToExport.map(t => ({
      Tanggal: t.date,
      Jam: t.time,
      Tipe: t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      Kategori: t.category,
      Keterangan: t.description,
      Nominal: t.amount
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    
    // Auto-size columns
    const maxWidths = [15, 10, 12, 15, 30, 15];
    worksheet['!cols'] = maxWidths.map(w => ({ wch: w }));

    XLSX.writeFile(workbook, `Laporan_TPQ_${range.start}_ke_${range.end}.xlsx`);
    setIsExportModalOpen(false);
  };

  const exportToPDF = (range: { start: string; end: string }) => {
    const dataToExport = filterTransactionsByRange(range);
    const doc = new jsPDF();
    
    // Add Title
    doc.setFontSize(18);
    doc.text(`Laporan Keuangan: ${selectedBook?.name || "TPQ"}`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Periode: ${format(parseISO(range.start), 'dd MMM yyyy')} - ${format(parseISO(range.end), 'dd MMM yyyy')}`, 14, 30);
    
    // Summary
    const totalIncome = dataToExport.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = dataToExport.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;

    doc.text(`Total Pemasukan: ${formatCurrency(totalIncome)}`, 14, 40);
    doc.text(`Total Pengeluaran: ${formatCurrency(totalExpense)}`, 14, 48);
    doc.text(`Saldo Akhir: ${formatCurrency(balance)}`, 14, 56);

    // Table
    const tableData = dataToExport.map(t => [
      t.date,
      t.type === 'income' ? 'Masuk' : 'Keluar',
      t.category,
      t.description,
      formatCurrency(t.amount)
    ]);

    autoTable(doc, {
      head: [['Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Nominal']],
      body: tableData,
      startY: 65,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }, // Emerald 600
      styles: { fontSize: 9 }
    });

    doc.save(`Laporan_TPQ_${range.start}_ke_${range.end}.pdf`);
    setIsExportModalOpen(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  const formatNumberInput = (val: string) => {
    // Remove everything except numbers
    const clean = val.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('id-ID').format(parseInt(clean));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 sm:p-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 sm:p-12 rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full"
        >
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-6">T</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">TPQ Finance Manager</h1>
          <p className="text-gray-500 mb-8 text-center text-sm">Kelola keuangan TPQ Anda dengan aman dan cerdas.</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Email</label>
              <input 
                type="email" 
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                placeholder="nama@email.com"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4 pr-12 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isRegistering && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Konfirmasi Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required={isRegistering}
                    value={authConfirmPassword}
                    onChange={(e) => setAuthConfirmPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4 pr-12 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {authError && (
              <div className="space-y-2">
                <p className="text-xs text-rose-500 bg-rose-50 p-3 rounded-lg border border-rose-100">{authError}</p>
                {showResendVerif && (
                  <button 
                    type="button"
                    onClick={resendVerification}
                    className="w-full text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 py-2 rounded-lg transition-colors"
                  >
                    Kirim Ulang Link Verifikasi
                  </button>
                )}
              </div>
            )}

            {authSuccess && (
              <p className="text-xs text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">{authSuccess}</p>
            )}

            <button 
              type="submit"
              disabled={isAuthSubmitLoading}
              className="w-full bg-emerald-600 text-white py-3 sm:py-4 rounded-xl font-bold shadow-lg shadow-emerald-50 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
            >
              {isAuthSubmitLoading ? <Loader2 size={20} className="animate-spin" /> : isRegistering ? "Daftar Akun" : "Masuk"}
            </button>

            <div className="flex justify-between items-center px-1">
              <button 
                type="button" 
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-xs font-semibold text-emerald-600 hover:underline"
              >
                {isRegistering ? "Sudah punya akun? Login" : "Belum punya akun? Daftar"}
              </button>
              {!isRegistering && (
                <button 
                  type="button" 
                  onClick={forgotPassword}
                  className="text-xs font-semibold text-gray-400 hover:text-emerald-600"
                >
                  Lupa password?
                </button>
              )}
            </div>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold text-gray-300"><span className="bg-white px-4">Atau</span></div>
          </div>

          <button 
            onClick={login}
            type="button"
            className="w-full bg-white border border-gray-200 text-gray-700 py-3 sm:py-4 rounded-xl font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#212529] font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-20 md:h-screen md:border-t-0 md:border-r">
        <div className="hidden md:flex mb-8">
          <button onClick={() => setActiveTab('dashboard')} className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold">T</button>
        </div>
        <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={24} />} label="Dashboard" />
        <NavItem active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<BrainCircuit size={24} />} label="AI Input" />
        <NavItem active={activeTab === 'input'} onClick={() => setActiveTab('input')} icon={<PlusCircle size={24} />} label="Manual" />
        <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={24} />} label="Riwayat" />
        <button 
          onClick={logout}
          className="hidden md:flex mt-auto p-2 text-gray-400 hover:text-rose-600 transition-colors"
          title="Logout"
        >
          <LogOut size={24} />
        </button>
      </nav>

      {/* Main Content */}
      <main className="pb-24 pt-6 px-4 md:pl-28 md:pt-10 max-w-6xl mx-auto">
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TPQ Finance Manager</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-500 text-sm">Buku Aktif:</span>
              <div className="flex items-center gap-1 group relative">
                <button 
                  onClick={() => setIsBookModalOpen(true)}
                  className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-md hover:bg-emerald-100 transition-colors flex items-center gap-1"
                >
                  {selectedBook?.name || "Memuat..."}
                  <PlusCircle size={12} />
                </button>
                {books.length > 1 && (
                  <div className="flex gap-1 ml-1 overflow-x-auto max-w-[200px] no-scrollbar">
                    {books.filter(b => b.id !== selectedBookId).map(book => (
                      <button 
                        key={book.id}
                        onClick={() => setSelectedBookId(book.id)}
                        className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap"
                      >
                        {book.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={() => setIsBookModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white p-2 sm:px-4 rounded-xl text-xs font-semibold hover:bg-emerald-700 transition-all shadow-sm"
            >
              <PlusCircle size={16} />
              <span>Buku Baru</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
              <Calendar size={16} className="text-gray-400" />
              <span className="text-sm font-medium">{format(new Date(), 'dd MMMM yyyy')}</span>
            </div>
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
                  value={transactionsLoading ? 'loading' : formatCurrency(stats.balance)} 
                  icon={<Wallet className="text-emerald-600" />}
                  bgColor="bg-emerald-50"
                  trend={stats.balance >= 0 ? 'up' : 'down'}
                />
                <StatCard 
                  title="Pemasukan" 
                  value={transactionsLoading ? 'loading' : formatCurrency(stats.totalIncome)} 
                  icon={<ArrowUpRight className="text-blue-600" />}
                  bgColor="bg-blue-50"
                />
                <StatCard 
                  title="Pengeluaran" 
                  value={transactionsLoading ? 'loading' : formatCurrency(stats.totalExpense)} 
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
                      type="text" 
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: formatNumberInput(e.target.value) })}
                      className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 text-lg font-bold"
                      placeholder="0"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tanggal</label>
                        <input 
                          type="date" 
                          required
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Jam</label>
                        <input 
                          type="time" 
                          required
                          value={formData.time}
                          onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                          className="w-full bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 text-sm"
                        />
                      </div>
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
              className="space-y-4 sm:space-y-6"
            >
              <div className="flex flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-bold">Riwayat</h2>
                <button 
                  onClick={() => setIsExportModalOpen(true)}
                  className="flex items-center gap-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 px-3 py-2 sm:px-4 sm:py-2 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap"
                >
                  <Download size={16} />
                  <span>Ekspor Data</span>
                </button>
              </div>

              {/* Filter Controls */}
              <div className="bg-white p-3 sm:p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3 sm:space-y-4">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <FilterButton active={filterType === 'all'} onClick={() => setFilterType('all')}>Semua</FilterButton>
                  <FilterButton active={filterType === 'daily'} onClick={() => setFilterType('daily')}>Harian</FilterButton>
                  <FilterButton active={filterType === 'weekly'} onClick={() => setFilterType('weekly')}>Minggu</FilterButton>
                  <FilterButton active={filterType === 'monthly'} onClick={() => setFilterType('monthly')}>Bulan</FilterButton>
                  <FilterButton active={filterType === 'yearly'} onClick={() => setFilterType('yearly')}>Tahun</FilterButton>
                  <FilterButton active={filterType === 'custom'} onClick={() => setFilterType('custom')}>Custom</FilterButton>
                </div>

                {filterType === 'custom' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50"
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Mulai</label>
                      <input 
                        type="date" 
                        value={customRange.start}
                        onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                        className="bg-gray-50 border-none rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-500 w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-gray-400 uppercase">Selesai</label>
                      <input 
                        type="date" 
                        value={customRange.end}
                        onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                        className="bg-gray-50 border-none rounded-lg p-2 text-xs focus:ring-1 focus:ring-emerald-500 w-full"
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {transactionsLoading ? (
                    <div className="p-16 sm:p-20 text-center">
                      <Loader2 size={40} className="mx-auto text-emerald-200 mb-4 animate-spin" />
                      <p className="text-gray-400 text-sm italic">Memuat data transaksi...</p>
                    </div>
                  ) : filteredTransactions.length === 0 ? (
                    <div className="p-16 sm:p-20 text-center">
                      <History size={40} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-gray-400 text-sm italic">Data tidak ditemukan</p>
                    </div>
                  ) : (
                    filteredTransactions.map(t => (
                      <TransactionItem key={t.id} transaction={t} onDelete={deleteTransaction} />
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Book Modal */}
        <AnimatePresence>
          {isBookModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsBookModalOpen(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-100"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Kelola Buku Kelompok</h2>
                  <button onClick={() => setIsBookModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">List Buku Anda</label>
                    {books.map(book => (
                      <div 
                        key={book.id}
                        onClick={() => {
                          setSelectedBookId(book.id);
                          setIsBookModalOpen(false);
                        }}
                        className={cn(
                          "w-full text-left p-3 rounded-xl text-sm font-medium transition-all flex items-center justify-between group cursor-pointer",
                          selectedBookId === book.id ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-gray-50 text-gray-600 border border-transparent hover:bg-gray-100"
                        )}
                      >
                        <span className="truncate">{book.name}</span>
                        <div className="flex items-center gap-3">
                          {selectedBookId === book.id && (
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBookToDelete(book);
                            }}
                            className="p-1 text-gray-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold text-gray-300"><span className="bg-white px-3">Tambah Buku Baru</span></div>
                  </div>

                  <form onSubmit={createBook} className="space-y-4">
                    <div className="space-y-1">
                      <input 
                        type="text" 
                        required
                        value={newBookName}
                        onChange={(e) => setNewBookName(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                        placeholder="Contoh: Tabungan Kurban"
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={isBookSubmitLoading}
                      className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      {isBookSubmitLoading ? <Loader2 size={16} className="animate-spin" /> : "Buat Buku Sekarang"}
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Delete Book Confirmation */}
        <AnimatePresence>
          {bookToDelete && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-gray-100 text-center"
              >
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Hapus Buku?</h3>
                <p className="text-sm text-gray-500 mb-6">
                  Apakah Anda yakin ingin menghapus buku <span className="font-bold text-gray-900">"{bookToDelete.name}"</span>?
                  Semua data transaksi di dalamnya akan ikut terhapus secara permanen.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setBookToDelete(null)}
                    className="flex-1 py-3 px-4 bg-gray-50 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={() => deleteBook(bookToDelete.id)}
                    disabled={isBookSubmitLoading}
                    className="flex-1 py-3 px-4 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {isBookSubmitLoading ? <Loader2 size={18} className="animate-spin" /> : "Ya, Hapus"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Export Modal */}
        <AnimatePresence>
          {isExportModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsExportModalOpen(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Ekspor Laporan</h2>
                  <button onClick={() => setIsExportModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Dari Tanggal</label>
                      <input 
                        type="date"
                        value={exportRange.start}
                        onChange={(e) => setExportRange({ ...exportRange, start: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Sampai Tanggal</label>
                      <input 
                        type="date"
                        value={exportRange.end}
                        onChange={(e) => setExportRange({ ...exportRange, end: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-400 font-medium">Format Excel cocok untuk pengolahan data lebih lanjut, manakala PDF adalah format terbaik untuk dicetak atau dibagikan sebagai laporan resmi.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => exportToExcel(exportRange)}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 transition-all group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileText size={24} className="text-emerald-600" />
                    </div>
                    <span className="font-bold text-xs">Simpan Excel</span>
                  </button>
                  <button 
                    onClick={() => exportToPDF(exportRange)}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 hover:bg-blue-100 transition-all group"
                  >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                      <FileText size={24} className="text-blue-600" />
                    </div>
                    <span className="font-bold text-xs">Simpan PDF</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Success Toast */}
        <AnimatePresence>
          {showSuccessToast && (
            <motion.div 
              initial={{ opacity: 0, y: 50, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, x: '-50%' }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 w-80 z-[200] bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500"
            >
              <div className="bg-white/20 p-2 rounded-xl">
                <Check size={20} />
              </div>
              <div>
                <p className="font-bold text-sm">Berhasil!</p>
                <p className="text-xs text-emerald-100">Transaksi telah disimpan ke riwayat.</p>
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

function StatCard({ title, value, icon, bgColor }: { title: string, value: string, icon: React.ReactNode, bgColor: string, trend?: 'up' | 'down' }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", bgColor)}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
        {value === 'loading' ? (
          <div className="h-6 w-24 bg-gray-100 animate-pulse rounded mt-1" />
        ) : (
          <h4 className="text-xl font-bold text-gray-900">{value}</h4>
        )}
      </div>
    </div>
  );
}

function TransactionItem({ transaction, onDelete }: { transaction: Transaction, onDelete: (id: string) => void, key?: string }) {
  return (
    <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn(
          "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center",
          transaction.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {transaction.type === 'income' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate text-sm sm:text-base">{transaction.description}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-xs text-gray-400">
            <span className="font-medium text-emerald-600/70">{transaction.category}</span>
            <span className="hidden sm:inline">•</span>
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {format(new Date(transaction.date), 'dd MMM yyyy')}
            </span>
            <span className="flex items-center gap-1 pl-1 border-l border-gray-200 sm:border-none sm:pl-0">
              {transaction.time}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <p className={cn(
          "font-bold text-sm sm:text-base whitespace-nowrap",
          transaction.type === 'income' ? "text-emerald-600" : "text-rose-600"
        )}>
          {transaction.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(transaction.amount)}
        </p>
        <button 
          onClick={() => onDelete(transaction.id)}
          className="p-2 text-gray-300 hover:text-rose-600 transition-all sm:opacity-0 sm:group-hover:opacity-100"
          title="Hapus"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function FilterButton({ active, children, onClick }: { active: boolean, children: React.ReactNode, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all",
        active 
          ? "bg-emerald-600 text-white shadow-sm" 
          : "bg-gray-50 text-gray-400 hover:bg-gray-100"
      )}
    >
      {children}
    </button>
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
