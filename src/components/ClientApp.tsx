import { useState, useEffect } from 'react';
import { 
  Wifi, 
  CreditCard, 
  MessageSquare, 
  ChevronRight, 
  Download, 
  HelpCircle,
  Menu,
  X,
  Plus,
  Zap,
  Globe,
  Bell,
  Clock,
  Send,
  CheckCircle2,
  Lock,
  LogOut,
  Smartphone,
  ShieldCheck,
  Zap as ZapIcon,
  Signal,
  BarChart3,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
  Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useNetwork } from '../lib/useNetwork';
import { getFriendlyErrorMessage } from '../lib/errorMapping';
import { db, auth, handleFirestoreError, OperationType, getDocResilient } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  setDoc, 
  doc, 
  getDoc,
  addDoc,
  serverTimestamp,
  orderBy,
  limit,
  enableNetwork
} from 'firebase/firestore';

export function ClientApp({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [clientData, setClientData] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  // Ticket creation states
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('Problema de Conexão');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Lentidão');
  const [ticketPriority, setTicketPriority] = useState('Média');

  // Chat/Ticket details states
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessageText, setNewMessageText] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };
  const [loading, setLoading] = useState(true);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initStage, setInitStage] = useState('Starting...');
  const [wifiVisible, setWifiVisible] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [childFilter, setChildFilter] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const { isOnline, reconnect } = useNetwork();

  // Initialize Client data
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const initClient = async () => {
      if (isInitialized && isOnline) return; 
      
      setLoading(true);
      setErrorDetails(null);
      setInitStage('Conectando ao App...');
      
      const MAX_RETRIES = 3;
      let currentRetry = 0;

      const timeoutId = setTimeout(() => {
        if (!isInitialized && !errorDetails) {
          setErrorDetails("O aplicativo do assinante não conseguiu sincronizar com o Cloud. Isso pode acontecer se você estiver offline, sob redes corporativas restritas ou se o Firebase estiver temporariamente inacessível. Verifique seu sinal.");
          setLoading(false);
        }
      }, 20000);

      const attemptFetch = async (retry: number): Promise<boolean> => {
        try {
          if (retry > 0) {
            setInitStage(`Tentativa ${retry + 1} de ${MAX_RETRIES + 1}...`);
            await reconnect();
            await new Promise(r => setTimeout(r, retry * 1500));
          }
          
          const clientRef = doc(db, 'clients', user.uid);
          const clientSnap = await getDocResilient(clientRef);
          
          setInitStage('Validando Assinatura...');
          
          if (!clientSnap.exists()) {
            const dummyClient = {
              name: user.displayName || 'Correntista Connect',
              email: user.email,
              status: 'active',
              planId: 'Demonstração SaaS',
              providerId: 'connect-pro-internal',
              address: 'Painel Experimental',
              cpfCnpj: '000.000.000-00',
              uid: user.uid
            };
            try {
              await setDoc(clientRef, dummyClient);
              setClientData(dummyClient);
            } catch (createErr) {
              console.warn("Guest mode:", createErr);
              setClientData(dummyClient);
            }
          } else {
            setClientData(clientSnap.data());
          }
          setIsInitialized(true);
          clearTimeout(timeoutId);
          return true;
        } catch (e: any) {
          const isOfflineError = e.message?.toLowerCase().includes('offline') || 
                                e.code === 'unavailable' || 
                                e.message?.toLowerCase().includes('failed to get document');
          
          if (isOfflineError && currentRetry < MAX_RETRIES) {
            currentRetry++;
            return attemptFetch(currentRetry);
          }
          throw e;
        }
      };

      try {
        await attemptFetch(0);
      } catch (e: any) {
        console.error("Client init error after retries:", e);
        setErrorDetails(getFriendlyErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };

    initClient();
  }, [retryCount, isOnline]);

  // Real-time subscriptions
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !isInitialized) return;

    // Bills
    const billsQ = query(
      collection(db, 'billing'), 
      where('clientId', '==', user.uid)
    );
    const unsubBills = onSnapshot(billsQ, (snap) => {
      setBills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'billing'));

    // Tickets
    const ticketsQ = query(
      collection(db, 'tickets'), 
      where('clientId', '==', user.uid)
    );
    const unsubTickets = onSnapshot(ticketsQ, (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'tickets'));

    return () => {
      unsubBills();
      unsubTickets();
    };
  }, [isInitialized]);

  // Listen to chat messages for the selected support ticket
  useEffect(() => {
    if (!selectedTicket) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('ticketId', '==', selectedTicket.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side by createdAt since serverTimestamp may be pending
      msgs.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
        return timeA - timeB;
      });
      setChatMessages(msgs);
    }, (error) => {
      console.error("Error fetching messages:", error);
    });

    return () => unsubscribe();
  }, [selectedTicket]);

  const openTicket = async () => {
    const user = auth.currentUser;
    if (!user || !clientData) return;

    if (!ticketDescription.trim()) {
      showToast('Por favor, informe a descrição do seu problema.', 'error');
      return;
    }

    try {
      const newTicketRef = await addDoc(collection(db, 'tickets'), {
        clientId: user.uid,
        clientName: clientData.name || 'Assinante',
        providerId: clientData.providerId,
        subject: `[${ticketCategory}] ${ticketSubject}`,
        description: ticketDescription,
        status: 'open',
        priority: ticketPriority,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp()
      });

      // Add the initial message written by the client as the first chat message
      await addDoc(collection(db, 'messages'), {
        ticketId: newTicketRef.id,
        senderId: user.uid,
        senderName: clientData.name || 'Assinante',
        text: ticketDescription,
        createdAt: serverTimestamp()
      });

      showToast('Suporte aberto! Em breve responderemos.', 'success');
      setIsTicketModalOpen(false);
      setTicketDescription('');
      setTicketSubject('Problema de Conexão');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'tickets');
    }
  };

  const sendMessage = async () => {
    const user = auth.currentUser;
    if (!user || !selectedTicket || !newMessageText.trim()) return;

    try {
      await addDoc(collection(db, 'messages'), {
        ticketId: selectedTicket.id,
        senderId: user.uid,
        senderName: clientData?.name || 'Assinante',
        text: newMessageText,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'tickets', selectedTicket.id), {
        lastMessageAt: serverTimestamp()
      }, { merge: true });

      setNewMessageText('');
    } catch (e) {
      console.error("Error sending message:", e);
      showToast("Erro ao enviar mensagem", "error");
    }
  };

  const createDummyBill = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await addDoc(collection(db, 'billing'), {
        clientId: user.uid,
        amount: 99.90,
        status: 'pending',
        dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        pixCode: '00020126580014br.gov.bcb.pix0136demo-pix-code-connectpro-isp'
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'billing');
    }
  };

  const simulateRestart = () => {
    setRestarting(true);
    setTimeout(() => setRestarting(false), 3000);
  };

  const runScan = () => {
    setScanning(true);
    setScanResult(null);
    setTimeout(() => {
      setScanning(false);
      setScanResult("complete");
      showToast("Varredura concluída! Nenhum dispositivo invasor detectado.", "success");
    }, 2500);
  };

  if (loading && !clientData && !errorDetails) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white p-10 text-center">
       <div className="relative mb-10">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }} 
            className="w-20 h-20 border-4 border-blue-50 border-t-blue-600 rounded-full shadow-xl shadow-blue-600/5" 
          />
          <div className="absolute inset-0 flex items-center justify-center">
             <Smartphone size={24} className="text-blue-500 animate-pulse" />
          </div>
       </div>
       <h2 className="text-slate-900 font-black tracking-tighter uppercase italic text-2xl mb-2">{initStage}</h2>
       <p className="text-slate-400 font-mono text-[9px] uppercase tracking-widest animate-pulse">Establishing Secure Uplink</p>
       
       <button 
          onClick={() => {
            if (!clientData) {
              setClientData({
                name: auth.currentUser?.displayName || 'Correntista Connect',
                email: auth.currentUser?.email || 'admin@connect.pro',
                status: 'active',
                planId: 'Demonstração SaaS',
                providerId: 'connect-pro-internal',
                address: 'Painel Experimental',
                cpfCnpj: '000.000.000-00',
                uid: auth.currentUser?.uid || 'guest-uid'
              });
            }
            setIsInitialized(true);
          }}
          className="mt-12 text-slate-400/30 hover:text-slate-400/60 text-[9px] uppercase tracking-widest font-black transition-all"
        >
          Pular Sincronização (Acesso de Emergência)
        </button>
    </div>
  );

  if (errorDetails) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-10 text-center">
      <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-8">
        <AlertCircle size={40} className="text-red-500" />
      </div>
      <h2 className="text-slate-900 font-black italic serif tracking-tighter text-3xl uppercase mb-4 leading-none">Ops! Sem Conexão</h2>
      <p className="text-slate-500 font-medium text-sm mb-6 max-w-xs">{errorDetails}</p>
      {!isOnline && (
        <p className="text-red-600 font-black text-[10px] uppercase tracking-widest mb-10">Você está offline</p>
      )}
      <div className="flex flex-col gap-4 w-full max-w-[200px]">
        <button 
          onClick={async () => {
            setErrorDetails(null);
            setLoading(true);
            try {
              await reconnect();
              await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
              console.warn("Manual reconnect failed:", err);
            }
            setRetryCount(prev => prev + 1);
          }}
          className="bg-blue-600 text-white font-black px-10 py-5 rounded-2xl shadow-xl shadow-blue-600/20 hover:scale-105 transition-all active:scale-95 uppercase tracking-widest text-[10px]"
        >
          Sincronizar Agora
        </button>
        <button 
          onClick={() => {
            if (!clientData) {
              setClientData({
                name: auth.currentUser?.displayName || 'Correntista Connect',
                email: auth.currentUser?.email || 'admin@connect.pro',
                status: 'active',
                planId: 'Demonstração SaaS',
                providerId: 'connect-pro-internal',
                address: 'Painel Experimental',
                cpfCnpj: '000.000.000-00',
                uid: auth.currentUser?.uid || 'guest-uid'
              });
            }
            setErrorDetails(null);
            setIsInitialized(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-10 py-5 rounded-2xl shadow-xl shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-[10px]"
        >
          Usar Modo Demo Offline
        </button>
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 transition-all font-black text-[9px] uppercase tracking-widest"
        >
          <RefreshCw size={12} className="animate-reverse-spin" /> Reiniciar App
        </button>
        <button 
          onClick={() => auth.signOut()}
          className="text-slate-300 font-bold uppercase tracking-widest text-[9px] hover:text-slate-500 transition-all"
        >
          Sair da Conta
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto shadow-2xl relative overflow-hidden text-slate-800 font-sans">
      {/* Header */}
      <header className="px-6 h-24 flex justify-between items-center bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-slate-100">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
               <Globe size={20} className="fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                 <div className={cn(
                   "w-1.5 h-1.5 rounded-full animate-pulse",
                   isOnline ? "bg-emerald-500" : "bg-red-500"
                 )} />
                 <span className={cn(
                   "text-[9px] font-black uppercase tracking-widest",
                   isOnline ? "text-emerald-500" : "text-red-500"
                 )}>
                   {isOnline ? 'Cloud Sync: Ativo' : 'Cloud Sync: Offline'}
                 </span>
              </div>
              <h2 className="font-black text-xl tracking-tighter italic serif text-slate-900 leading-none uppercase">Central App</h2>
            </div>
         </div>
         <button onClick={() => setIsMenuOpen(true)} className="p-3 text-slate-400 hover:text-slate-900 transition-colors">
            <Menu size={24} />
         </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 space-y-8 pb-32 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="home" className="space-y-8">
              
              {/* Plan Card */}
              <div className="bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl shadow-blue-900/10 relative overflow-hidden group">
                 <div className="absolute top-[-40px] right-[-40px] w-64 h-64 bg-blue-600/20 rounded-full blur-[80px] pointer-events-none transition-transform duration-1000 group-hover:scale-125" />
                 <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-10">
                       <div className={cn(
                         "p-3 rounded-2xl shadow-xl transition-colors",
                         clientData?.status === 'active' ? "bg-blue-600 shadow-blue-600/20" : "bg-red-600 shadow-red-600/20"
                       )}>
                          {clientData?.status === 'active' ? <Zap size={24} className="fill-current" /> : <AlertCircle size={24} />}
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plan: {clientData?.planId}</span>
                    </div>
                    
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Olá, {clientData?.name?.split(' ')[0]}</p>
                    <h3 className="text-3xl font-black italic serif tracking-tighter leading-tight mb-4">
                      {clientData?.status === 'active' ? 'Sua conexão está excelente!' : 'Regularize sua situação financeira.'}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mt-6">
                       <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/5 text-center">
                          <div className="text-[8px] font-black uppercase tracking-widest text-blue-400 mb-1">Download</div>
                          <div className="text-xl font-black italic tracking-tighter">500 <span className="text-[10px] opacity-40 font-normal ml-0.5">MB</span></div>
                       </div>
                       <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/5 text-center">
                          <div className="text-[8px] font-black uppercase tracking-widest text-emerald-400 mb-1">Upload</div>
                          <div className="text-xl font-black italic tracking-tighter">250 <span className="text-[10px] opacity-40 font-normal ml-0.5">MB</span></div>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Bills Preview */}
              <div className="space-y-5">
                 <div className="flex justify-between items-center px-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Próximos Vencimentos</h4>
                    <button onClick={createDummyBill} className="text-[10px] text-blue-600 font-bold hover:underline italic">Gerar Boleto Demo</button>
                 </div>
                 
                 <div className="space-y-4">
                    {bills.length === 0 ? (
                      <div className="text-center py-10 opacity-30 italic text-sm">Nenhuma fatura pendente.</div>
                    ) : bills.map(bill => (
                      <div key={bill.id} className="bg-white border border-slate-100 p-6 rounded-[32px] shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-4">
                           <div className={cn(
                             "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                             bill.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-300 group-hover:text-blue-600"
                           )}>
                              {bill.status === 'paid' ? <CheckCircle2 size={20} /> : <CreditCard size={20} />}
                           </div>
                           <div>
                              <div className="text-sm font-black text-slate-800 leading-none mb-1">R$ {bill.amount.toFixed(2)}</div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {bill.status === 'paid' ? 'Pago em: ' : 'Vencimento: '} 
                                {bill.status === 'paid' ? bill.paidAt?.split('T')[0] : bill.dueDate?.split('T')[0]}
                              </span>
                           </div>
                        </div>
                        {bill.status === 'pending' && <div className="text-[9px] font-black text-blue-600 border border-blue-100 px-3 py-1 rounded-full bg-blue-50"> PAGAR AGORA </div>}
                      </div>
                    ))}
                 </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                 <QuickActionCard icon={<Wifi size={24} />} title="Gestão WiFi" onClick={() => setActiveTab('wifi')} />
                 <QuickActionCard icon={<MessageSquare size={24} />} title="Suporte" onClick={() => setActiveTab('support')} />
                 <QuickActionCard icon={<RefreshCw size={24} />} title="Reiniciar ONU" onClick={simulateRestart} loading={restarting} />
                 <QuickActionCard icon={<ShieldCheck size={24} />} title="Segurança" onClick={() => setActiveTab('security')} />
              </div>
            </motion.div>
          )}

          {activeTab === 'wifi' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} key="wifi" className="space-y-8">
               <div className="flex items-center gap-4">
                  <button onClick={() => setActiveTab('home')} className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm"><ChevronLeft size={20} /></button>
                  <h3 className="text-2xl font-black italic serif tracking-tighter uppercase">Minha Rede</h3>
               </div>

               <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm space-y-10">
                  <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Nome da WiFi (2.4G/5G)</label>
                     <div className="p-7 bg-slate-50 rounded-[32px] border border-slate-100 flex justify-between items-center group font-black text-slate-800 text-lg tracking-tight">
                        MegaNet_Fibra_HighSpeed
                        <Copy size={18} className="text-slate-200 group-hover:text-blue-600 cursor-pointer" />
                     </div>
                  </div>

                  <div className="space-y-3">
                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Senha de Acesso</label>
                     <div className="p-7 bg-slate-50 rounded-[32px] border border-slate-100 flex justify-between items-center">
                        <span className="font-mono tracking-[0.3em] font-black text-xl text-slate-800">
                           {wifiVisible ? 'fiber8899' : '••••••••'}
                        </span>
                        <div className="flex gap-2">
                           <button onClick={() => setWifiVisible(!wifiVisible)} className="p-2 text-slate-300 hover:text-blue-600 transition-colors">
                              {wifiVisible ? <EyeOff size={22} /> : <Eye size={22} />}
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="pt-4 space-y-4">
                     <button className="w-full bg-slate-900 text-white font-black py-6 rounded-2xl active:scale-95 transition-all uppercase tracking-widest text-xs shadow-xl shadow-slate-900/10">
                       ALTERAR CONFIGURAÇÕES
                     </button>
                  </div>
               </div>

               <div className="bg-white border border-slate-200 rounded-[40px] p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8 px-2">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Dispositivos Na Rede</h4>
                    <span className="bg-emerald-50 text-emerald-600 text-[9px] px-3 py-1 rounded-full font-black border border-emerald-100">6 DISPOSITIVOS</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                     {["iPhone de João", "MacBook Air", "Smart TV Samsung", "PlayStation 5"].map((d, i) => (
                       <div key={i} className="py-6 flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:text-blue-600 transition-colors">
                                <Signal size={18} />
                             </div>
                             <span className="font-bold text-slate-700 tracking-tight">{d}</span>
                          </div>
                          <ArrowUpRight size={14} className="text-slate-200" />
                       </div>
                     ))}
                  </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
             <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} key="security" className="space-y-8 pb-10">
                <div className="flex items-center gap-4">
                   <button onClick={() => setActiveTab('home')} className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm"><ChevronLeft size={20} /></button>
                   <h3 className="text-2xl font-black italic serif tracking-tighter uppercase font-serif italic">Minha Segurança</h3>
                </div>

                {/* Main Security Status Badge Card */}
                <div className="bg-slate-900 text-white rounded-[40px] p-10 shadow-xl relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                   <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 justify-between">
                      <div className="flex items-center gap-5">
                         <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center text-emerald-400 relative">
                            <span className="absolute inset-0 rounded-3xl bg-emerald-400/20 animate-ping opacity-75"></span>
                            <ShieldCheck size={32} />
                         </div>
                         <div>
                            <div className="text-emerald-400 text-[10px] font-black uppercase tracking-widest font-mono mb-1">Status: Ativo & Protegido</div>
                            <h4 className="text-2xl font-black italic serif tracking-tighter leading-tight text-white uppercase italic">Conexão Blindada</h4>
                            <p className="text-[10px] font-medium text-slate-400 leading-relaxed max-w-sm mt-1">Criptografia WPA3, defesas contra DDoS e varreduras ARP de intrusos estão ativos na sua ONU ConnectPro.</p>
                         </div>
                      </div>
                   </div>
                </div>

                {/* DNS Filter / Interactive Toggle */}
                <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm space-y-6">
                   <div className="flex justify-between items-start gap-4">
                      <div>
                         <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Filtro Parental (Kid-Safe DNS)</h4>
                         <p className="text-xs text-slate-400 leading-relaxed mt-1 max-w-sm font-medium">Bloqueie preventivamente conexões com sites adultos, de apostas ou maliciosos em todos os aparelhos conectados.</p>
                      </div>
                      
                      <button 
                         onClick={() => {
                           const next = !childFilter;
                           setChildFilter(next);
                           showToast(next ? "Filtro Parental Ativado no Roteador (DNS Seguro)!" : "Filtro Parental Desativado.", next ? "success" : "info");
                         }}
                         className={cn(
                           "w-16 h-10 rounded-full transition-all duration-300 relative p-1 shrink-0 flex items-center",
                           childFilter ? "bg-blue-600 justify-end" : "bg-slate-250 justify-start"
                         )}
                      >
                         <motion.div 
                            layout 
                            className="w-8 h-8 rounded-full bg-white shadow-md cursor-pointer"
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                         />
                      </button>
                   </div>
                   
                   <div className="pt-4 border-t border-slate-100 flex items-center gap-3 font-medium">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        childFilter ? "bg-blue-600 animate-pulse" : "bg-slate-300"
                      )} />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">
                        {childFilter ? "Filtro Ativo: Bloqueando conteúdo impróprio" : "Filtro Desativado: Modo de navegação normal"}
                      </span>
                   </div>
                </div>

                {/* Intrusion Prevention / Active Scan */}
                <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm space-y-8">
                   <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight font-sans tracking-tight leading-relaxed">Análise de Invasores na WiFi</h4>
                      <p className="text-xs text-slate-400 leading-relaxed mt-1 font-medium">Inspecione se há vizinhos indesejados ou aparelhos suspeitos pegando carona na sua internet em tempo real.</p>
                   </div>

                   {scanning ? (
                      <div className="p-8 bg-slate-50 border border-slate-100 rounded-[32px] flex flex-col items-center justify-center text-center space-y-4">
                         <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                         <div>
                            <div className="text-xs font-black uppercase tracking-wider text-slate-800 font-mono animate-pulse">Inspecionando Rede...</div>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">Varrendo portas ARP e assinaturas de hardware...</p>
                         </div>
                      </div>
                   ) : scanResult === "complete" ? (
                      <div className="space-y-6">
                         <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[32px] flex items-center gap-4 text-emerald-800">
                            <ShieldCheck size={24} className="text-emerald-400 shrink-0" />
                            <div>
                               <div className="font-extrabold text-xs text-emerald-800 font-sans tracking-tight">Exame Concluído: Sem Invasores!</div>
                               <p className="text-[10px] opacity-90 leading-normal mt-0.5 font-medium text-emerald-650">Todos os 4 aparelhos ativos pertencem à lista de confiança.</p>
                            </div>
                         </div>

                         {/* Device lists in Security Screen */}
                         <div className="space-y-3">
                            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1 font-mono">Dispositivos Verificados e Seguros:</div>
                            {["iPhone de João (Dispositivo Principal)", "MacBook Air (Laptop)", "Smart TV Samsung", "PlayStation 5"].map((device, i) => (
                               <div key={i} className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-3">
                                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                     <span className="font-bold text-slate-700">{device}</span>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-lg">VERIFICADO</span>
                               </div>
                            ))}
                         </div>

                         <button 
                            onClick={runScan}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-slate-900/10"
                         >
                            RE-ESCANEAR WIFI
                         </button>
                      </div>
                   ) : (
                      <button 
                         onClick={runScan}
                         className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 cursor-pointer"
                      >
                         INICIAR VARREDURA AGORA
                      </button>
                   )}
                </div>
             </motion.div>
          )}

          {activeTab === 'support' && (
             <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key="support" className="space-y-8 pb-10">
                <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => setActiveTab('home')} className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm"><ChevronLeft size={20} /></button>
                  <h3 className="text-2xl font-black italic serif tracking-tighter uppercase">Central de Suporte</h3>
                </div>

                <div className="bg-blue-600 rounded-[40px] p-10 text-white shadow-2xl shadow-blue-600/20 relative overflow-hidden">
                   <div className="absolute top-[-20px] right-[-20px] w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                   <h4 className="text-2xl font-black italic serif tracking-tighter mb-4 italic">Assistente IA</h4>
                   <p className="text-sm font-medium mb-10 opacity-80 leading-relaxed italic">Precisa de ajuda imediata? Nosso agente virtual pode resolver 90% dos problemas de conexão agora.</p>
                   <button className="w-full bg-white text-blue-600 font-black py-5 rounded-2xl uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95 transition-all">
                      INICIAR ATENDIMENTO IA
                   </button>
                </div>

                <div className="space-y-5">
                   <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">Meus Tickets</h5>
                   {tickets.length === 0 ? (
                     <div className="text-center py-10 opacity-30 italic text-sm">Nenhum chamado aberto.</div>
                   ) : tickets.map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => setSelectedTicket(t)}
                        className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm flex items-center justify-between group hover:border-blue-600 cursor-pointer transition-all"
                      >
                         <div className="flex items-center gap-6">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                              t.status === 'open' ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600"
                            )}>
                               {t.status === 'open' ? <Clock size={20} /> : <CheckCircle2 size={20} />}
                            </div>
                            <div>
                               <div className="text-sm font-black text-slate-800 tracking-tight leading-none mb-2">{t.subject}</div>
                               <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase italic">
                                 {t.status === 'open' ? 'Aberto / pendente' : 'Resolvido'} • Ticket #{t.id.slice(0,6).toUpperCase()}
                               </span>
                            </div>
                         </div>
                         <ChevronRight size={18} className="text-slate-200 group-hover:text-blue-600 transition-colors" />
                      </div>
                   ))}
                   
                   <button 
                     onClick={() => setIsTicketModalOpen(true)} 
                     className="w-full py-7 border-2 border-dashed border-slate-200 rounded-[32px] text-slate-400 hover:text-blue-600 hover:border-blue-600 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] mt-10"
                   >
                      <Plus size={18} strokeWidth={3} /> NOVO CHAMADO TÉCNICO
                   </button>
                </div>
             </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Ticket Creation Modal */}
      <AnimatePresence>
         {isTicketModalOpen && (
           <>
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsTicketModalOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200]" />
             <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 max-h-[92vh] bg-white rounded-t-[40px] shadow-2xl z-[210] p-10 overflow-y-auto">
                <div className="flex justify-between items-start mb-8 pb-4 border-b border-slate-100">
                   <div>
                      <h4 className="text-2xl font-black italic serif tracking-tighter uppercase text-slate-900 leading-tight">Novo Chamado Técnico</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-widest mt-1">Descreva seu problema com precisão</p>
                   </div>
                   <button onClick={() => setIsTicketModalOpen(false)} className="p-2 text-slate-300 hover:text-slate-950 transition-colors">
                      <X size={28} />
                   </button>
                </div>

                <div className="space-y-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoria do Problema</label>
                      <select 
                        value={ticketCategory} 
                        onChange={e => setTicketCategory(e.target.value)} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:border-blue-600 outline-none appearance-none"
                      >
                         <option value="Lentidão">Lentidão ou Oscilação</option>
                         <option value="Sem Conexão">Sem Conexão (Fora do Ar)</option>
                         <option value="Wi-Fi">Problema com Roteador ou Wi-Fi</option>
                         <option value="Financeiro">Dúvida sobre Fatura ou SLA</option>
                         <option value="Outros">Outras solicitações</option>
                      </select>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Título Breve</label>
                      <input 
                        type="text" 
                        value={ticketSubject} 
                        onChange={e => setTicketSubject(e.target.value)} 
                        placeholder="Ex: Luz vermelha piscando no roteador"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:border-blue-600 outline-none"
                      />
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descrição Detalhada do Problema</label>
                      <textarea 
                        rows={4}
                        value={ticketDescription} 
                        onChange={e => setTicketDescription(e.target.value)} 
                        placeholder="Escreva aqui em suas próprias palavras o que está acontecendo... ex: 'Ontem à noite a internet parou de funcionar e a luz PON ficou apagada...'"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:border-blue-600 outline-none resize-none leading-relaxed"
                      />
                   </div>



                   <div className="pt-6">
                      <button 
                        onClick={openTicket} 
                        className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl text-xs uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-[0.98] shadow-xl shadow-blue-500/20"
                      >
                         ABRIR CHAMADO AGORA
                      </button>
                   </div>
                </div>
             </motion.div>
           </>
         )}
      </AnimatePresence>

      {/* Ticket Chat / Message Detail Component */}
      <AnimatePresence>
         {selectedTicket && (
           <>
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTicket(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200]" />
             <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed bottom-0 left-0 right-0 h-[88vh] bg-white rounded-t-[40px] shadow-2xl z-[210] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                   <div>
                      <div className="flex items-center gap-2 mb-1">
                         <span className={cn(
                           "text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full",
                           selectedTicket.status === 'open' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                         )}>
                            {selectedTicket.status === 'open' ? 'Em Atendimento' : 'Fechado/Resolvido'}
                         </span>
                         <span className="text-[10px] text-red-500 font-mono tracking-widest font-bold uppercase block">
                            #{selectedTicket.id.slice(0,6).toUpperCase()}
                         </span>
                      </div>
                      <h4 className="text-lg font-black tracking-tight text-slate-800 line-clamp-1">{selectedTicket.subject}</h4>
                   </div>
                   <button onClick={() => setSelectedTicket(null)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                      <X size={26} />
                   </button>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto p-8 space-y-4 bg-slate-50/50">
                   {/* Description Block */}
                   {selectedTicket.description && (
                     <div className="p-6 bg-white border border-slate-100 rounded-[24px] shadow-sm mb-6">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Relato do Cliente</div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed italic">"{selectedTicket.description}"</p>
                     </div>
                   )}

                   {/* Bubbles */}
                   {chatMessages.length === 0 ? (
                      <div className="text-center py-10 opacity-30 italic text-xs">Sem novas mensagens. Chame o suporte técnico.</div>
                   ) : chatMessages.map((m: any) => {
                      const isMe = m.senderId === auth.currentUser?.uid;
                      return (
                        <div key={m.id} className={cn("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                          <div className="text-[8px] font-bold text-slate-400 mb-1 px-1">
                             {m.senderName || (isMe ? 'Eu' : 'Suporte')}
                          </div>
                          <div className={cn(
                            "p-4 rounded-2xl text-xs font-semibold shadow-sm leading-relaxed",
                            isMe 
                              ? "bg-blue-600 text-white rounded-tr-none" 
                              : "bg-white border border-slate-150 text-slate-800 rounded-tl-none"
                          )}>
                             {m.text}
                          </div>
                          <span className="text-[8px] text-slate-300 font-mono mt-1 px-1">
                             {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Agora'}
                          </span>
                        </div>
                      );
                   })}
                </div>

                {/* Sender Panel */}
                <div className="p-6 border-t border-slate-100 bg-white flex items-center gap-3">
                   <input 
                     type="text" 
                     value={newMessageText} 
                     onChange={e => setNewMessageText(e.target.value)} 
                     onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                     placeholder={selectedTicket.status === 'closed' ? "Chamado encerrado" : "Digite sua mensagem..."}
                     disabled={selectedTicket.status === 'closed'}
                     className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-600 outline-none"
                   />
                   <button 
                     onClick={sendMessage}
                     disabled={selectedTicket.status === 'closed'}
                     className="p-4 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100"
                   >
                     <Send size={18} />
                   </button>
                </div>
             </motion.div>
           </>
         )}
      </AnimatePresence>

      {/* Tab Navigation */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-sm bg-slate-900 rounded-[32px] p-2 flex items-center justify-around shadow-2xl z-50 border border-white/10 backdrop-blur-md">
         <BottomTab icon={<Globe size={24} />} active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
         <BottomTab icon={<CreditCard size={24} />} active={activeTab === 'finance'} onClick={() => setActiveTab('home')} /> {/* Combined for now */}
         <BottomTab icon={<MessageSquare size={24} />} active={activeTab === 'support'} onClick={() => setActiveTab('support')} />
         <BottomTab icon={<LogOut size={24} />} active={false} onClick={onLogout} />
      </nav>

      {/* Menu Drawer */}
      <AnimatePresence>
         {isMenuOpen && (
           <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]" />
              <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 w-[85%] bg-white z-[110] p-12 flex flex-col shadow-[-40px_0_64px_rgba(0,0,0,0.1)]">
                 <div className="flex justify-between items-center mb-20">
                    <div className="font-black italic serif text-2xl uppercase tracking-tighter italic">Menu</div>
                    <button onClick={() => setIsMenuOpen(false)} className="p-2 text-slate-300 hover:text-slate-900 transition-colors">
                       <X size={32} />
                    </button>
                 </div>
                 
                 <div className="space-y-12 flex-1">
                    <MenuItem label="Dashboard" sub="Resumo Geral" onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} />
                    <MenuItem label="Financeiro" sub="Pagamentos e Notas" onClick={() => { setIsMenuOpen(false); }} />
                    <MenuItem label="Suporte" sub="Chamados em Aberto" onClick={() => { setActiveTab('support'); setIsMenuOpen(false); }} />
                    <MenuItem label="Minha WiFi" sub="Nome e Senha" onClick={() => { setActiveTab('wifi'); setIsMenuOpen(false); }} />
                    <MenuItem label="Meus Dados" sub="Perfil do Cliente" onClick={() => { setIsMenuOpen(false); }} />
                 </div>

                 <div className="mt-auto pt-10 border-t border-slate-100 flex flex-col items-center gap-6">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 italic">ConnectPro ISP SaaS v1.0</div>
                    <button onClick={onLogout} className="w-full bg-slate-50 text-slate-400 py-6 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all">
                       DESCONECTAR
                    </button>
                 </div>
              </motion.div>
           </>
         )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "fixed bottom-6 right-6 z-[999] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-xl max-w-sm",
              toast.type === 'success' ? "bg-emerald-950/95 text-emerald-350" :
              toast.type === 'error' ? "bg-rose-950/95 text-rose-350" :
              "bg-slate-900/95 text-slate-350"
            )}
          >
            {toast.type === 'success' && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />}
            {toast.type === 'error' && <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />}
            {toast.type === 'info' && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
            <p className="text-xs font-black uppercase tracking-wider leading-relaxed">{toast.message}</p>
            <button onClick={() => setToast(null)} className="ml-4 text-white/40 hover:text-white transition-colors text-sm font-bold font-mono">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickActionCard({ icon, title, onClick, loading }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={loading}
      className="bg-white border border-slate-100 p-8 rounded-[32px] text-left hover:border-blue-600 hover:bg-blue-50/10 transition-all shadow-sm active:scale-95 group relative overflow-hidden"
    >
       <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-blue-600 group-hover:scale-110 transition-all border border-slate-50 group-hover:border-blue-100">
          {loading ? <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : icon}
       </div>
       <div className="font-black text-slate-900 tracking-tighter text-xl leading-none mb-1 shadow-sm uppercase">{title}</div>
    </button>
  );
}

function BottomTab({ icon, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-4 rounded-2xl transition-all relative",
        active ? "text-blue-500 scale-110" : "text-slate-500 hover:text-slate-200"
      )}
    >
      {icon}
      {active && (
        <motion.div layoutId="clientActive" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full" />
      )}
    </button>
  );
}

function MenuItem({ label, sub, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full text-left group">
       <div className="text-3xl font-black italic serif tracking-tighter text-slate-900 group-hover:text-blue-600 group-hover:translate-x-3 transition-all duration-500 uppercase leading-none mb-2">{label}</div>
       <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sub}</div>
    </button>
  );
}
