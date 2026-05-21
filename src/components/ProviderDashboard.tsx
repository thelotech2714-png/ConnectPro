import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  MessageSquare, 
  Rocket, 
  LogOut, 
  Plus, 
  Search, 
  Wifi, 
  Globe, 
  Signal,
  CheckCircle2,
  AlertCircle,
  Send,
  Zap,
  ZapOff,
  Sparkles,
  Activity,
  Rocket as RocketIcon,
  Settings,
  ArrowRight,
  Cloud,
  RefreshCw
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
  updateDoc,
  addDoc,
  serverTimestamp,
  enableNetwork
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

const formatFirestoreDate = (timestamp: any) => {
  if (!timestamp) return 'Agora';
  let date: Date;

  if (typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp.seconds !== undefined) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return 'Agora';
  }

  if (isNaN(date.getTime())) {
    return 'Agora';
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export function ProviderDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clients, setClients] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [infraAction, setInfraAction] = useState<string | null>(null);
  const [activeConfigModal, setActiveConfigModal] = useState<string | null>(null);
  const [infraConfigs, setInfraConfigs] = useState<any>({
    onu: { ip: '', user: '', password: '', port: '22', brand: 'Huawei' },
    mikrotik: { host: '', user: '', password: '', port: '8728' },
    oltStatus: { ip: '', user: '', password: '', method: 'SNMP' },
    radius: { host: '', secret: '', port: '1812' }
  });
  const [providerData, setProviderData] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([
    { id: '300_mega', name: '300 Mega Basic', price: 99.90, download: '300M', upload: '150M' },
    { id: '500_mega', name: '500 Mega Fiber', price: 129.90, download: '500M', upload: '250M' },
    { id: '700_mega', name: '700 Mega Gaming', price: 149.90, download: '700M', upload: '350M' },
    { id: '1_giga', name: '1 Giga Ultra', price: 199.90, download: '1000M', upload: '500M' }
  ]);
  const [tempPlans, setTempPlans] = useState<any[]>([]);

  useEffect(() => {
    if (activeConfigModal === 'plans') {
      setTempPlans(plans.map(p => ({ ...p })));
    }
  }, [activeConfigModal, plans]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);

  const [clientStatusResults, setClientStatusResults] = useState<Record<string, any>>({});
  const { isOnline, reconnect } = useNetwork();
  
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [registerTab, setRegisterTab] = useState('basic');
  const [newClient, setNewClient] = useState({
    name: '',
    cpfCnpj: '',
    address: '',
    neighborhood: '',
    city: '',
    whatsapp: '',
    planId: '500 Mega Fiber',
    planProfile: '500M_FIBER',
    dueDate: '10',
    // Router/ONU info
    routerBrand: '',
    routerModel: '',
    routerMac: '',
    routerIp: '',
    onuSerial: '',
    onuModel: '',
    onuPonPort: '0',
    oltLinked: '',
    // Connection info
    pppoeUser: '',
    pppoePass: '',
    download: '500M',
    upload: '250M'
  });

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initStage, setInitStage] = useState('Starting...');

  // Auth check and Provider initialization
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const initProvider = async () => {
      if (isInitialized && isOnline) return; 
      
      setLoading(true);
      setErrorDetails(null);
      setInitStage('Conectando ao Cloud...');
      
      const MAX_RETRIES = 3;
      let currentRetry = 0;

      // Force a hard timeout for the entire process (increased from 8s to 20s to accommodate slow lines/cold boots)
      const timeoutId = setTimeout(() => {
        if (!isInitialized && !errorDetails) {
          setErrorDetails("A conexão com o Cloud parou de responder. Isso pode ocorrer se o Firebase (Google Firestore) estiver bloqueado em sua rede local corporativa/firewall, se a conexão estiver instável, ou se houver lentidão na tradução de DNS. Você pode aguardar, tentar reconectar, ou ignorar este bloqueio abaixo para entrar no Modo Demo Offline.");
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
          
          const providerRef = doc(db, 'providers', user.uid);
          const providerSnap = await getDocResilient(providerRef);
          
          setInitStage('Sincronizando Perfil...');
          
          if (!providerSnap.exists()) {
            const newProvider = {
              name: user.displayName || 'Meus Resultados ISP',
              planType: 'premium',
              status: 'active',
              ownerId: user.uid,
              infrastructure: {
                mikrotik: { host: '', user: '', password: '', port: '8728' }
              },
              settings: {
                logoUrl: user.photoURL,
                primaryColor: '#2563eb'
              },
              plans: [
                { id: '300_mega', name: '300 Mega Basic', price: 99.90, download: '300M', upload: '150M' },
                { id: '500_mega', name: '500 Mega Fiber', price: 129.90, download: '500M', upload: '250M' },
                { id: '700_mega', name: '700 Mega Gaming', price: 149.90, download: '700M', upload: '350M' },
                { id: '1_giga', name: '1 Giga Ultra', price: 199.90, download: '1000M', upload: '500M' }
              ]
            };
            await setDoc(providerRef, newProvider);
            setProviderData(newProvider);
            setPlans(newProvider.plans);
          } else {
            const data = providerSnap.data();
            setProviderData(data);
            if (data.plans && Array.isArray(data.plans)) {
              setPlans(data.plans);
            }
            if (data.infrastructure) {
               setInfraConfigs((prev: any) => ({
                 ...prev,
                 ...data.infrastructure
               }));
            }
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
        console.error("Initialization error after retries:", e);
        setErrorDetails(getFriendlyErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };

    initProvider();
  }, [retryCount, isOnline]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !isInitialized) return;

    const q = query(collection(db, 'clients'), where('providerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClients(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    return () => unsubscribe();
  }, [isInitialized]);

  // Fetch Tickets
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !isInitialized) return;

    const q = query(collection(db, 'tickets'), where('providerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tickets');
    });

    return () => unsubscribe();
  }, [isInitialized]);

  // Fetch chat messages for selected ticket
  useEffect(() => {
    if (!selectedTicketId) {
      setChatMessages([]);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('ticketId', '==', selectedTicketId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  }, [selectedTicketId]);

  const sendReply = async () => {
    const user = auth.currentUser;
    if (!user || !selectedTicketId || !replyText.trim()) return;

    try {
      await addDoc(collection(db, 'messages'), {
        ticketId: selectedTicketId,
        senderId: user.uid,
        senderName: providerData?.name || 'Suporte Técnico',
        text: replyText,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'tickets', selectedTicketId), {
        lastMessageAt: serverTimestamp()
      });

      setReplyText('');
    } catch (e: any) {
      console.error("Error sending message reply:", e);
      showToast("Erro ao enviar mensagem", "error");
    }
  };

  const toggleTicketStatus = async (ticketId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'open' ? 'closed' : 'open';
      await updateDoc(doc(db, 'tickets', ticketId), {
        status: newStatus
      });
      showToast(`Chamado ${newStatus === 'closed' ? 'concluído' : 'reaberto'} com sucesso!`, 'success');
    } catch (e: any) {
      console.error("Error updating ticket status:", e);
      showToast("Erro ao atualizar chamado", "error");
    }
  };

  const updateTicketPriority = async (ticketId: string, priority: string) => {
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        priority: priority
      });
      showToast(`Prioridade do chamado alterada para: ${priority}`, 'success');
    } catch (e: any) {
      console.error("Error updating ticket priority:", e);
      showToast("Erro ao alterar prioridade do chamado", "error");
    }
  };

  // Fetch bills
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !isInitialized) return;

    const q = query(collection(db, 'billing'), where('providerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBills(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'billing');
    });

    return () => unsubscribe();
  }, [isInitialized]);

  const addTestClient = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await addDoc(collection(db, 'clients'), {
        providerId: user.uid,
        name: 'Cliente ' + Math.floor(Math.random() * 1000),
        cpfCnpj: '000.000.000-00',
        status: 'active',
        planId: '500 Mega Fiber',
        address: 'Rua Exemplo, 123',
        uid: ''
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'clients');
    }
  };

  const saveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    
    setIsProcessing(true);
    try {
      // Auto-generate credentials if empty
      const finalClient = {
        ...newClient,
        pppoeUser: newClient.pppoeUser || newClient.cpfCnpj.replace(/\D/g, ''),
        pppoePass: newClient.pppoePass || newClient.cpfCnpj.replace(/\D/g, ''),
        providerId: user.uid,
        status: 'active',
        createdAt: serverTimestamp(),
        uid: '' 
      };

      const docRef = await addDoc(collection(db, 'clients'), finalClient);
      
      // 2. Integration with MikroTik
      if (infraConfigs.mikrotik?.host) {
        try {
          await fetch('/api/mikrotik/provision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              config: infraConfigs.mikrotik, 
              client: finalClient, 
              action: 'create' 
            })
          });
        } catch (err) {
          console.error("MikroTik Auto-Sync Error:", err);
          showToast("Assinante salvo, mas falha de sincronia MikroTik", "error");
        }
      }

      setIsRegisterModalOpen(false);
      setNewClient({
        name: '',
        cpfCnpj: '',
        address: '',
        neighborhood: '',
        city: '',
        whatsapp: '',
        planId: plans[0]?.name || '500 Mega Fiber',
        planProfile: (plans[0]?.name || '500 Mega Fiber').toUpperCase().replace(/\s/g, '_'),
        dueDate: '10',
        routerBrand: '',
        routerModel: '',
        routerMac: '',
        routerIp: '',
        onuSerial: '',
        onuModel: '',
        onuPonPort: '0',
        oltLinked: '',
        pppoeUser: '',
        pppoePass: '',
        download: plans[0]?.download || '500M',
        upload: plans[0]?.upload || '250M'
      });
      showToast('Assinante registrado e provisionado!', 'success');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'clients');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleClientStatus = async (client: any) => {
    setIsProcessing(true);
    const newStatus = client.status === 'active' ? 'blocked' : 'active';
    const action = newStatus === 'blocked' ? 'block' : 'unblock';
    
    try {
      // 1. Database
      await updateDoc(doc(db, 'clients', client.id), { status: newStatus });

      // 2. MikroTik
      if (infraConfigs.mikrotik?.host) {
        await fetch('/api/mikrotik/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            config: infraConfigs.mikrotik, 
            client, 
            action 
          })
        });
      }
      showToast(`Assinante ${newStatus === 'active' ? 'liberado' : 'bloqueado'} com sucesso!`, 'success');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'clients');
    } finally {
      setIsProcessing(false);
    }
  };

  const generateAI = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, providerName: providerData?.name || 'MegaNet Fibra' })
      });
      const data = await res.json();
      setAiResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const batchGenerateInvoices = async () => {
    setIsProcessing(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      let count = 0;
      if (clients.length === 0) {
        showToast("Nenhum assinante cadastrado para faturar", "error");
        setIsProcessing(false);
        return;
      }

      for (const client of clients) {
        if (client.status === 'active' || client.status === 'overdue') {
          const matchedPlan = plans.find(p => p.name === client.planId || p.id === client.planId);
          const finalAmount = matchedPlan ? Number(matchedPlan.price) : 99.90;

          await addDoc(collection(db, 'billing'), {
            clientId: client.id,
            clientName: client.name,
            providerId: user.uid,
            amount: finalAmount,
            status: 'pending',
            dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
            createdAt: serverTimestamp(),
            pixCode: '00020126580014br.gov.bcb.pix0136demo-pix-code-connectpro-isp'
          });
          count++;
        }
      }
      if (count > 0) {
        showToast(`${count} faturas geradas com sucesso!`, 'success');
      } else {
        showToast("Nenhum assinante qualificado para nova fatura", "info");
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'billing');
    } finally {
      setIsProcessing(false);
    }
  };

  const batchAutoSuspend = async () => {
    setIsProcessing(true);
    try {
      const pendingBills = bills.filter(b => b.status === 'pending');
      let suspendedCount = 0;
      
      for (const bill of pendingBills) {
        // 1. Find client
        const client = clients.find(c => c.id === bill.clientId);
        if (!client) continue;

        // 2. Database
        await updateDoc(doc(db, 'clients', client.id), { status: 'blocked' });

        // 3. MikroTik Action
        if (infraConfigs.mikrotik?.host) {
          try {
            await fetch('/api/mikrotik/provision', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                config: infraConfigs.mikrotik, 
                client, 
                action: 'block' 
              })
            });
          } catch (err) {
            console.error("Auto-suspend network error:", err);
          }
        }

        suspendedCount++;
      }
      if (suspendedCount > 0) {
        showToast(`${suspendedCount} inadimplentes suspensos no MikroTik!`, 'success');
      } else {
        showToast("Nenhum cliente inadimplente para suspender", "info");
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'clients');
    } finally {
      setIsProcessing(false);
    }
  };

  const sendWhatsAppReminder = async (billId: string) => {
    try {
      const bill = bills.find(b => b.id === billId);
      const client = clients.find(c => c.id === bill?.clientId);
      const phone = client?.whatsapp?.replace(/\D/g, '') || '5511999999999';
      
      // 1. Log in Firestore
      await setDoc(doc(db, 'billing', billId), { 
        reminderSentAt: serverTimestamp() 
      }, { merge: true });

      // 2. Call backend WhatsApp API
      const res = await fetch('/api/billing/whatsapp-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          billId, 
          phone: phone, 
          amount: bill?.amount 
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Lembrete WhatsApp enviado com sucesso!', 'success');
      } else {
        showToast('Aviso: ' + data.error, 'error');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'billing');
    }
  };

  const checkClientStatus = async (client: any) => {
    // Optimistic loading
    setClientStatusResults(prev => ({ 
      ...prev, 
      [client.id]: { loading: true } 
    }));

    try {
      const res = await fetch('/api/mikrotik/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          config: infraConfigs.mikrotik, 
          client 
        })
      });

      const data = await res.json();
      setClientStatusResults(prev => ({ 
        ...prev, 
        [client.id]: { ...data, loading: false } 
      }));
    } catch (e) {
      console.error("Check status error:", e);
      setClientStatusResults(prev => ({ 
        ...prev, 
        [client.id]: { success: false, error: 'Falha na comunicação', loading: false } 
      }));
    }
  };

  const handleInfraAction = (label: string) => {
    // Determine which modal to open based on label
    if (label === 'Provisionar ONU') setActiveConfigModal('onu');
    else if (label === 'Manager MikroTik') setActiveConfigModal('mikrotik');
    else if (label === 'Status Fiber OLT') setActiveConfigModal('oltStatus');
    else if (label === 'Configurar Radius') setActiveConfigModal('radius');
    else if (label === 'Planos de Internet') setActiveConfigModal('plans');
  };

  const savePlansToFirestore = async (updatedPlans: any[]) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setIsProcessing(true);
      const providerRef = doc(db, 'providers', user.uid);
      await updateDoc(providerRef, {
        plans: updatedPlans
      });
      setPlans(updatedPlans);
      setProviderData((prev: any) => ({
        ...prev,
        plans: updatedPlans
      }));
      showToast("Planos de internet salvos com sucesso!", "success");
      setActiveConfigModal(null);
    } catch (e: any) {
      console.error("Error saving plans:", e);
      showToast("Modo Offline: Planos salvos localmente.", "info");
      setPlans(updatedPlans);
      setActiveConfigModal(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeInfraSync = async (label: string) => {
    setActiveConfigModal(null);
    setInfraAction(label);
    setIsProcessing(true);
    
    const user = auth.currentUser;
    if (user && providerData?.id) {
      try {
        // Save config to provider settings/infra sub-collection
        const providerRef = doc(db, 'providers', providerData.id);
        await updateDoc(providerRef, {
          [`infrastructure.${label.replace(/\s/g, '').toLowerCase()}`]: infraConfigs[label === 'Provisionar ONU' ? 'onu' : label === 'Manager MikroTik' ? 'mikrotik' : label === 'Status Fiber OLT' ? 'oltStatus' : 'radius'],
          lastInfraAction: label,
          lastInfraSync: serverTimestamp()
        });
      } catch (err) {
        console.error("Error saving infra config:", err);
      }
    }

    // Simulated background task animation
    setTimeout(() => {
      setIsProcessing(false);
    }, 4000);
  };

  if (loading && !providerData && !errorDetails) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-10 overflow-hidden">
        <div className="relative mb-12">
           <motion.div 
             animate={{ rotate: 360 }} 
             transition={{ repeat: Infinity, duration: 2, ease: "linear" }} 
             className="w-24 h-24 border-[6px] border-blue-600/20 border-t-blue-600 rounded-full shadow-2xl shadow-blue-600/30" 
           />
           <div className="absolute inset-0 flex items-center justify-center">
              <Cloud size={32} className="text-blue-500 animate-pulse" />
           </div>
        </div>
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h2 className="text-white font-black italic serif tracking-tighter text-3xl uppercase mb-2">{initStage}</h2>
          <p className="text-blue-400 font-mono text-[10px] uppercase tracking-[0.3em] animate-pulse">Establishing Secure Uplink</p>
          
          <button 
            onClick={() => {
              if (!providerData) {
                setProviderData({
                  name: auth.currentUser?.displayName || 'MegaNet Conectividade',
                  planType: 'premium',
                  status: 'active',
                  id: auth.currentUser?.uid || 'offline-provider',
                  infrastructure: {
                    mikrotik: { host: '192.168.88.1', user: 'admin', password: '', port: '8728' }
                  },
                  settings: {
                    primaryColor: '#2563eb'
                  }
                });
              }
              setIsInitialized(true);
            }}
            className="mt-12 text-white/20 hover:text-white/40 text-[9px] uppercase tracking-widest font-black transition-all"
          >
            Pular Inicialização (Emergência)
          </button>
        </motion.div>
      </div>
    );
  }

  if (errorDetails) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-24 h-24 bg-red-600/20 rounded-[32px] flex items-center justify-center mb-10 border border-red-600/30">
          <AlertCircle size={48} className="text-red-500" />
        </div>
        <h2 className="text-white font-black italic serif tracking-tighter text-4xl uppercase mb-6 leading-none">Canal de Dados Instável</h2>
        <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] max-w-lg mb-10 overflow-hidden">
           <p className="text-slate-400 font-mono text-sm uppercase tracking-widest leading-relaxed">
             {errorDetails}
           </p>
           {errorDetails?.includes('SINCRONISMO') && (
             <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-3">
               <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                 <span className="text-[9px] font-black text-slate-500">ERROR_CODE:</span>
                 <span className="text-[9px] font-mono text-blue-400 uppercase">Unavailable_Handshake_Stall</span>
               </div>
               {!isOnline && (
                 <div className="flex justify-between items-center bg-red-400/10 p-3 rounded-xl border border-red-500/20">
                   <span className="text-[9px] font-black text-red-500 uppercase">Status:</span>
                   <span className="text-[9px] font-black text-red-550 uppercase font-mono tracking-tighter">DISCONNECTED_BY_NAVIGATOR</span>
                 </div>
               )}
             </div>
           )}
        </div>
        <div className="flex flex-col gap-6 items-center">
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
            className="bg-blue-600 text-white font-black px-12 py-6 rounded-2xl shadow-2xl shadow-blue-600/30 hover:scale-105 transition-all active:scale-95 uppercase tracking-[0.2em] text-xs w-full max-w-sm"
          >
            Sincronizar Cloud Agora
          </button>

          <button 
            onClick={() => {
              if (!providerData) {
                setProviderData({
                  name: auth.currentUser?.displayName || 'MegaNet Conectividade',
                  planType: 'premium',
                  status: 'active',
                  id: auth.currentUser?.uid || 'offline-provider',
                  infrastructure: {
                    mikrotik: { host: '192.168.88.1', user: 'admin', password: '', port: '8728' }
                  },
                  settings: {
                    primaryColor: '#2563eb'
                  }
                });
              }
              setErrorDetails(null);
              setIsInitialized(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-12 py-6 rounded-2xl shadow-2xl shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 uppercase tracking-[0.1em] text-xs w-full max-w-sm"
          >
            Ignorar Bloqueio (Usar Modo Demo Offline)
          </button>

          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 text-white/40 hover:text-white/80 transition-all font-black text-[10px] uppercase tracking-widest"
          >
            <RefreshCw size={14} className="animate-reverse-spin" /> Reiniciar Uplink (Hard Reset)
          </button>

          <button 
            onClick={() => auth.signOut()}
            className="text-white/20 font-bold uppercase tracking-widest text-[9px] hover:text-white/40 transition-all font-mono"
          >
            /sair-do-painel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col shrink-0 overflow-hidden">
        <div className="p-8 flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-blue-600/20">
            {providerData?.name?.[0] || 'CP'}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-white font-black leading-none tracking-tighter uppercase text-sm italic serif truncate">
              {providerData?.name || 'Loading...'}
            </span>
            <span className="text-blue-400 text-[10px] uppercase font-black tracking-widest mt-1 opacity-80">ISP Admin</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 mt-4 space-y-1">
          <NavItem icon={<LayoutDashboard size={18} />} label="Resultados" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem icon={<Users size={18} />} label="Assinantes" active={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
          <NavItem icon={<CreditCard size={18} />} label="Financeiro" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />
          <NavItem icon={<MessageSquare size={18} />} label="Chat Suporte" active={activeTab === 'support'} onClick={() => setActiveTab('support')} />
          <NavItem icon={<Sparkles size={18} />} label="Marketing IA" active={activeTab === 'marketing'} onClick={() => setActiveTab('marketing')} />
          <NavItem icon={<Settings size={18} />} label="Configurações" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="p-6 m-4 rounded-2xl bg-slate-800 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Network Health</span>
            <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
          </div>
          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-tight">MikroTik: Connected</p>
          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-tight mt-1">OLT Fiber: Online</p>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button onClick={onLogout} className="flex items-center gap-2 w-full p-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all font-bold text-xs uppercase">
            <LogOut size={16} /> Logout Provedor
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col relative">
        <header className="h-24 bg-white border-b border-slate-200 flex items-center justify-between px-10 sticky top-0 z-10 box-border">
           <div className="flex items-center gap-4">
              <h2 className="text-2xl font-black italic serif tracking-tighter uppercase text-slate-800">ConnectPro ISP</h2>
              <span className="bg-blue-100/50 text-blue-700 text-[10px] px-3 py-1.5 rounded-full border border-blue-200 font-black uppercase tracking-widest shadow-sm">
                {providerData?.planType || 'Standard'} Tenant
              </span>
           </div>
           <div className="flex items-center gap-6">
              <div className={cn(
                "hidden md:flex items-center gap-3 px-5 py-2.5 rounded-full border transition-all",
                isOnline ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                )}></div>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-widest",
                  isOnline ? "text-emerald-700" : "text-red-700"
                )}>
                  {isOnline ? "Cloud Sync: Ativo" : "Cloud Sync: Offline"}
                </span>
              </div>
              <div className="h-12 w-12 bg-slate-200 rounded-2xl border border-slate-300 flex items-center justify-center text-slate-600 font-black italic serif text-xl shadow-inner">
                {providerData?.name?.[0] || 'P'}
              </div>
           </div>
        </header>

        <div className="p-10 space-y-10">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="dash" className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatusCard label="Total Clientes" value={loading ? "..." : clients.length.toString()} trend="+12% growth" icon={<Users className="text-blue-600" />} />
                  <StatusCard label="Tickets Abertos" value={tickets.filter(t => t.status === 'open').length.toString()} trend="Volume de chamados" color="orange" icon={<MessageSquare className="text-orange-600" />} />
                  <StatusCard label="Faturas Pendentes" value={bills.filter(b => b.status === 'pending').length.toString()} trend="Aguardando atenção" color="red" icon={<AlertCircle className="text-red-600" />} />
                  <StatusCard label="Receita (Pagas)" value={`R$ ${bills.filter(b => b.status === 'paid').reduce((acc, b) => acc + (b.amount || 0), 0).toFixed(2)}`} trend={`Total: R$ ${bills.reduce((acc, b) => acc + (b.amount || 0), 0).toFixed(2)}`} color="emerald" icon={<CreditCard className="text-emerald-600" />} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-2 space-y-10">
                    <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm">
                      <div className="flex justify-between items-center mb-10">
                        <h3 className="text-xl font-black italic serif uppercase text-slate-800 tracking-tighter">Fluxo de Conexões</h3>
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                           <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mbps Peak (Real-time)</span>
                        </div>
                      </div>
                      <div className="h-64 flex items-end gap-1.5 px-2 group">
                        {[40, 55, 42, 60, 48, 70, 65, 80, 75, 95, 85, 100, 90, 80, 70, 60, 50, 40, 30, 45, 50, 60, 70, 80, 90, 100, 85, 75, 65, 55, 45, 35, 25, 35, 45, 55, 65, 75, 85, 95].map((h, i) => (
                          <div 
                            key={i} 
                            className="flex-1 bg-slate-100 hover:bg-blue-600 transition-all rounded-t-[4px]" 
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between mt-8 text-[10px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-100 pt-6">
                         <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-10">
                     <div className="bg-slate-900 rounded-[40px] p-10 text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-[-20px] right-[-20px] w-48 h-48 bg-blue-600/20 rounded-full blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                        <div className="relative z-10">
                           <div className="flex justify-between items-start mb-12">
                              <div className="p-4 bg-blue-600 rounded-2xl shadow-xl shadow-blue-600/30">
                                 <Zap size={28} className="fill-current" />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-800 px-3 py-1 rounded-full">Live Status</span>
                           </div>
                           <h4 className="text-3xl font-black italic serif tracking-tighter leading-tight mb-4 italic">Monitor de Tickets</h4>
                           <p className="text-sm text-slate-400 font-medium leading-relaxed mb-10 opacity-80">Nenhum chamado crítico pendente no momento.</p>
                           <button className="w-full bg-white text-slate-900 font-black py-5 rounded-2xl hover:scale-[1.02] transition-all active:scale-95 shadow-xl shadow-white/5 uppercase tracking-widest text-xs">
                             ABRIR CENTRAL DE CHAT
                           </button>
                        </div>
                     </div>

                     <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 font-mono">Infraestrutura</h3>
                        <div className="space-y-4">
                           <QuickBtn icon={<Wifi size={20} />} label="Provisionar ONU" onClick={() => handleInfraAction('Provisionar ONU')} />
                           <QuickBtn icon={<Globe size={20} />} label="Manager MikroTik" onClick={() => handleInfraAction('Manager MikroTik')} />
                           <QuickBtn icon={<Signal size={20} />} label="Status Fiber OLT" onClick={() => handleInfraAction('Status Fiber OLT')} />
                           <QuickBtn icon={<Settings size={20} />} label="Configurar Radius" onClick={() => handleInfraAction('Configurar Radius')} />
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm">
                         <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 font-mono">Comercial & Planos</h3>
                         <div className="space-y-4">
                            <QuickBtn icon={<CreditCard size={20} />} label="Planos de Internet" onClick={() => handleInfraAction('Planos de Internet')} />
                         </div>
                      </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'clients' && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} key="clients" className="space-y-10">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                   <div>
                    <h2 className="text-5xl font-black italic serif tracking-tighter uppercase text-slate-800 leading-none mb-2">Assinantes</h2>
                    <p className="text-slate-500 font-mono text-sm tracking-[0.3em] uppercase">Gestão da base instalada de fibra</p>
                  </div>
                  <button 
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="bg-blue-600 text-white font-black px-10 py-5 rounded-2xl shadow-2xl shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest text-xs"
                  >
                    <Plus size={20} strokeWidth={3} /> REGISTRAR NOVO ASSINANTE
                  </button>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                  <input 
                    type="text" 
                    placeholder="Buscar por nome, CPF ou MAC do roteador..." 
                    className="w-full bg-white border border-slate-200 rounded-[32px] py-7 pl-20 pr-10 text-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-8 focus:ring-blue-600/5 transition-all placeholder:text-slate-300 shadow-sm"
                  />
                </div>

                <div className="bg-white border border-slate-200 rounded-[40px] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                          <th className="px-10 py-8">Assinante</th>
                          <th className="px-10 py-8">Plano Fiber</th>
                          <th className="px-10 py-8">Status Conexão</th>
                          <th className="px-10 py-8">Infra</th>
                          <th className="px-10 py-8 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clients.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-10 py-10">
                              <div className="font-black text-slate-900 text-xl leading-none tracking-tighter mb-1.5">{c.name}</div>
                              <div className="text-[10px] text-slate-400 font-black tracking-widest uppercase italic">CPF/CNPJ: {c.cpfCnpj}</div>
                            </td>
                            <td className="px-10 py-10">
                               <div className="font-black text-slate-700 tracking-tighter text-lg">{c.planId}</div>
                               <div className="text-[10px] text-blue-600 font-black uppercase tracking-widest mt-1">SVA Incluso</div>
                            </td>
                            <td className="px-10 py-10">
                              <StatusBadge status={c.status} />
                            </td>
                            <td className="px-10 py-10">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                     <Signal size={16} />
                                  </div>
                                  <span className="font-mono text-[10px] font-bold text-slate-400 tracking-tight">VLAN: 100 • PON: 0/1</span>
                                </div>
                                {clientStatusResults[c.id] && !clientStatusResults[c.id].loading && (
                                  <motion.div 
                                    initial={{ opacity: 0, x: -5 }} 
                                    animate={{ opacity: 1, x: 0 }}
                                    className="bg-slate-50 border border-slate-100 p-2 rounded-xl flex flex-col gap-1"
                                  >
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[8px] font-black uppercase text-slate-400">Sinal:</span>
                                      <span className={cn(
                                        "text-[9px] font-bold uppercase",
                                        clientStatusResults[c.id].signalStatus === 'good' ? "text-emerald-600" : 
                                        clientStatusResults[c.id].signalStatus === 'warning' ? "text-orange-600" : "text-red-600"
                                      )}>
                                        {clientStatusResults[c.id].signal}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[8px] font-black uppercase text-slate-400">PPP:</span>
                                      <span className={cn(
                                        "text-[9px] font-bold uppercase",
                                        clientStatusResults[c.id].status === 'online' ? "text-emerald-600" : "text-slate-400"
                                      )}>
                                        {clientStatusResults[c.id].status}
                                      </span>
                                    </div>
                                    {clientStatusResults[c.id].status === 'online' && (
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="text-[8px] font-black uppercase text-slate-400">Uptime:</span>
                                        <span className="text-[9px] font-bold text-slate-600 uppercase">
                                          {clientStatusResults[c.id].uptime}
                                        </span>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </div>
                            </td>
                            <td className="px-10 py-10 text-right">
                                <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button 
                                      onClick={() => checkClientStatus(c)}
                                      disabled={clientStatusResults[c.id]?.loading}
                                      title="Verificar Sinal e Autenticação"
                                      className={cn(
                                        "p-4 rounded-2xl border transition-all active:scale-90",
                                        clientStatusResults[c.id]?.loading ? "bg-slate-50 text-slate-400 animate-pulse" : "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white"
                                      )}
                                   >
                                      <Activity size={20} className={clientStatusResults[c.id]?.loading ? "animate-spin" : ""} />
                                   </button>
                                   <button 
                                      onClick={() => toggleClientStatus(c)}
                                      title={c.status === 'active' ? 'Bloquear Cliente' : 'Ativar Cliente'}
                                      className={cn(
                                         "p-4 rounded-2xl border transition-all active:scale-90",
                                         c.status === 'active' ? "bg-red-50 text-red-600 border-red-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                                      )}
                                   >
                                      {c.status === 'active' ? <ZapOff size={20} /> : <Zap size={20} />}
                                   </button>
                                   <button 
                                      onClick={() => {
                                        setNewClient(c);
                                        setIsRegisterModalOpen(true);
                                      }}
                                      className="text-slate-400 hover:text-blue-600 p-4 rounded-2xl bg-white border border-slate-100 hover:border-blue-200 shadow-sm transition-all active:scale-90"
                                   >
                                      <Settings size={20} />
                                   </button>
                                </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'finance' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key="finance" className="space-y-12">
                 <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                   <div>
                    <h2 className="text-5xl font-black italic serif tracking-tighter uppercase text-slate-800 leading-none mb-2">Financeiro</h2>
                    <p className="text-slate-500 font-mono text-sm tracking-[0.3em] uppercase underline decoration-blue-600 decoration-4">Controle de faturamento e suspensão em tempo-real</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-sm hidden md:flex flex-col justify-center">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total em Aberto</span>
                       <span className="text-xl font-black text-red-600 italic tracking-tighter leading-none">R$ {bills.filter(b => b.status === 'pending').reduce((acc, b) => acc + (b.amount || 0), 0).toFixed(2)}</span>
                    </div>
                    <button 
                      onClick={batchAutoSuspend}
                      disabled={isProcessing || bills.filter(b => b.status === 'pending').length === 0}
                      className="bg-red-50 text-red-600 font-black px-8 py-5 rounded-2xl border border-red-100 hover:bg-red-600 hover:text-white transition-all flex items-center gap-3 uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:grayscale"
                    >
                      <AlertCircle size={18} /> BLOQUEAR INADIMPLENTES
                    </button>
                    <button 
                      onClick={batchGenerateInvoices}
                      disabled={isProcessing || clients.length === 0}
                      className="bg-blue-600 text-white font-black px-10 py-5 rounded-2xl shadow-2xl shadow-blue-600/20 active:scale-95 transition-all flex items-center gap-3 uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:grayscale"
                    >
                      <Plus size={20} strokeWidth={3} /> GERAR BOLETOS DO MÊS
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-8 rounded-[40px] flex items-center gap-6">
                   <div className="h-14 w-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shrink-0">
                      <Zap size={28} />
                   </div>
                   <div>
                      <h4 className="font-black text-blue-900 uppercase italic tracking-tighter text-lg leading-none mb-1">Dica de Gestão</h4>
                      <p className="text-blue-700 text-sm font-medium opacity-80 leading-relaxed italic">Clientes com faturas vencidas há mais de 5 dias podem ser suspensos automaticamente no MikroTik clicando no botão de bloqueio.</p>
                   </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-[40px] overflow-hidden shadow-sm">
                   <div className="overflow-x-auto">
                      <table className="w-full text-left">
                         <thead className="bg-slate-50 border-b border-slate-100">
                           <tr className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
                              <th className="px-10 py-8">Assinante</th>
                              <th className="px-10 py-8">Valor</th>
                              <th className="px-10 py-8">Vencimento</th>
                              <th className="px-10 py-8">Status</th>
                              <th className="px-10 py-8 text-right">Ações</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {bills.length === 0 ? (
                              <tr><td colSpan={5} className="px-10 py-20 text-center text-slate-400 italic">Nenhuma fatura encontrada.</td></tr>
                            ) : bills.map(bill => (
                              <tr key={bill.id} className="hover:bg-slate-50/50 transition-colors group">
                                 <td className="px-10 py-10">
                                    <div className="font-black text-slate-900 text-xl tracking-tighter leading-none mb-1.5">{bill.clientName || 'Cliente'}</div>
                                    <div className="text-[10px] text-slate-400 font-black tracking-widest uppercase italic">ID: {bill.clientId?.slice(0,8)}</div>
                                 </td>
                                 <td className="px-10 py-10 font-black text-slate-700 text-lg">
                                    R$ {bill.amount?.toFixed(2)}
                                 </td>
                                 <td className="px-10 py-10 font-bold text-slate-400 font-mono text-sm">
                                    {bill.dueDate?.split('T')[0]}
                                 </td>
                                 <td className="px-10 py-10">
                                    <div className={cn(
                                       "text-[9px] font-black tracking-[0.2em] px-3 py-1 rounded-full uppercase border inline-block",
                                       bill.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-orange-50 text-orange-600 border-orange-200"
                                    )}>
                                       {bill.status === 'paid' ? 'PAGO' : 'PENDENTE'}
                                    </div>
                                    {bill.reminderSentAt && (
                                       <div className="text-[8px] text-emerald-600 font-black uppercase tracking-widest mt-1 flex items-center gap-1">
                                         <CheckCircle2 size={10} /> WhatsApp Enviado
                                       </div>
                                    )}
                                 </td>
                                 <td className="px-10 py-10 text-right">
                                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <button 
                                          onClick={() => sendWhatsAppReminder(bill.id)}
                                          className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                       >
                                          <Send size={14} /> WhatsApp
                                       </button>
                                       {bill.status === 'pending' && (
                                          <button 
                                             onClick={async () => {
                                                await setDoc(doc(db, 'billing', bill.id), { status: 'paid' }, { merge: true });
                                             }}
                                             className="bg-slate-900 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all"
                                          >
                                             Baixa Manual
                                          </button>
                                       )}
                                    </div>
                                 </td>
                              </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'support' && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} key="support" className="space-y-10">
                <div className="flex justify-between items-end">
                   <div>
                     <h2 className="text-5xl font-black italic serif tracking-tighter uppercase text-slate-800 leading-none mb-2">Central de Suporte</h2>
                     <p className="text-slate-500 font-mono text-sm tracking-[0.3em] uppercase">Controle de chamados e atendimento técnico</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 bg-white border border-slate-200 rounded-[40px] p-6 shadow-sm overflow-hidden min-h-[600px] h-[calc(100vh-280px)]">
                   {/* Left side: Tickets selection list */}
                   <div className="lg:col-span-1 border-r border-slate-150 pr-6 flex flex-col h-full overflow-hidden">
                      <div className="mb-6">
                         <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 font-mono mb-4">Fila de Chamados</h3>
                         <div className="text-xs font-semibold text-slate-500 bg-slate-50 p-4 rounded-xl flex justify-between">
                            <span>Em Aberto: {tickets.filter(t => t.status === 'open').length}</span>
                            <span>Resolvidos: {tickets.filter(t => t.status === 'closed').length}</span>
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                         {tickets.length === 0 ? (
                            <div className="text-center py-20 opacity-30 italic text-sm">Nenhum chamado aberto.</div>
                         ) : tickets.map((t) => {
                            const isSelected = selectedTicketId === t.id;
                            return (
                               <div 
                                 key={t.id}
                                 onClick={() => {
                                   setSelectedTicketId(t.id);
                                   setReplyText('');
                                 }}
                                 className={cn(
                                   "p-5 rounded-[24px] border cursor-pointer transition-all hover:translate-x-1 duration-200",
                                   isSelected 
                                     ? "bg-slate-900 border-slate-900 text-white shadow-lg" 
                                     : "bg-slate-50 border-slate-100 text-slate-800 hover:bg-slate-100"
                                 )}
                               >
                                  <div className="flex justify-between items-start mb-2">
                                     <span className={cn(
                                       "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                                       t.priority === 'Alta' ? "bg-red-500 text-white" : t.priority === 'Média' ? "bg-orange-500 text-white" : "bg-slate-500 text-white"
                                     )}>
                                        {t.priority || 'Normal'}
                                     </span>
                                     <span className={cn(
                                       "text-[8px] font-bold uppercase",
                                       isSelected ? "text-slate-400" : "text-slate-500"
                                     )}>
                                        {t.status === 'open' ? 'Aberto' : 'Resolvido'}
                                     </span>
                                  </div>
                                  <h4 className="font-black text-sm tracking-tight leading-snug line-clamp-1 mb-1">{t.subject}</h4>
                                  <div className="flex justify-between items-center text-[10px] opacity-70">
                                     <span className="font-bold">{t.clientName || 'Assinante'}</span>
                                     <span className="font-mono">{t.id.slice(0,6).toUpperCase()}</span>
                                  </div>
                               </div>
                            );
                         })}
                      </div>
                   </div>

                   {/* Right side: Selected Chat */}
                   <div className="lg:col-span-2 flex flex-col h-full overflow-hidden justify-between pl-2 font-sans">
                      <AnimatePresence mode="wait">
                         {selectedTicketId ? (() => {
                            const activeTicket = tickets.find(t => t.id === selectedTicketId);
                            if (!activeTicket) return null;

                            return (
                               <motion.div 
                                 initial={{ opacity: 0 }} 
                                 animate={{ opacity: 1 }} 
                                 exit={{ opacity: 0 }}
                                 key={selectedTicketId}
                                 className="flex flex-col h-full justify-between"
                               >
                                  {/* Chat Header */}
                                  <div className="pb-6 border-b border-slate-150">
                                     <div className="flex justify-between items-center mb-4">
                                        <div>
                                           <div className="flex items-center gap-3 mb-1">
                                              <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[9px] px-3 py-1 rounded-full font-mono font-bold tracking-wider uppercase">
                                                 Ticket #{activeTicket.id.slice(0,6).toUpperCase()}
                                              </span>
                                              <span className="text-slate-400 text-xs font-bold">{activeTicket.clientName || 'Assinante'}</span>
                                           </div>
                                           <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">{activeTicket.subject}</h3>
                                            <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500 font-semibold">
                                               <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-150 px-3 py-1.5 rounded-xl">
                                                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Abertura:</span>
                                                  <span className="font-bold text-slate-700 font-mono">
                                                     {formatFirestoreDate(activeTicket.createdAt)}
                                                  </span>
                                               </div>
                                               <div className="flex items-center gap-1.5 bg-blue-50/50 border border-blue-100/50 px-3 py-1.5 rounded-xl">
                                                  <span className="text-[9px] font-black uppercase tracking-wider text-blue-600">Último Contato:</span>
                                                  <span className="font-bold text-blue-700 font-mono">
                                                     {formatFirestoreDate(activeTicket.lastMessageAt)}
                                                  </span>
                                               </div>
                                            </div>
                                        </div>

                                        <button
                                          onClick={() => toggleTicketStatus(activeTicket.id, activeTicket.status)}
                                          className={cn(
                                             "px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
                                             activeTicket.status === 'open' 
                                               ? "bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 border-emerald-100" 
                                               : "bg-orange-50 hover:bg-orange-600 hover:text-white text-orange-600 border-orange-100"
                                          )}
                                        >
                                           {activeTicket.status === 'open' ? 'CONCLUIR CHAMADO' : 'REABRIR CHAMADO'}
                                        </button>
                                     </div>

                                     {/* Urgency Classification Control Panel (Exclusive to Support Provider) */}
                                     <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <div>
                                           <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-mono block">Classificação de Prioridade</span>
                                           <span className="text-[10px] text-slate-500 font-semibold mt-0.5 block">Defina o nível de urgência técnica deste chamado:</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                           {['Baixa', 'Média', 'Alta'].map(p => (
                                              <button
                                                key={p}
                                                type="button"
                                                onClick={() => updateTicketPriority(activeTicket.id, p)}
                                                className={cn(
                                                   "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
                                                   activeTicket.priority === p
                                                     ? p === 'Alta' 
                                                       ? "bg-red-600 border-red-600 text-white shadow-red-500/10" 
                                                       : p === 'Média' 
                                                         ? "bg-orange-500 border-orange-500 text-white shadow-orange-500/10" 
                                                         : "bg-slate-700 border-slate-700 text-white"
                                                     : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
                                                )}
                                              >
                                                 {p}
                                              </button>
                                           ))}
                                        </div>
                                     </div>
                                  </div>

                                  {/* Chat Content Panel */}
                                  <div className="flex-1 overflow-y-auto py-6 space-y-4 pr-2">
                                     {/* Lead description info written by customer */}
                                     {activeTicket.description && (
                                        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl space-y-2 mb-4">
                                           <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 font-mono">Relato original do Cliente</div>
                                           <p className="text-sm text-slate-700 leading-relaxed font-semibold italic">"{activeTicket.description}"</p>
                                        </div>
                                     )}

                                     {/* Log list of response messages */}
                                     {chatMessages.length === 0 ? (
                                        <div className="text-slate-300 text-xs text-center italic py-10">Use a caixa abaixo para responder ao assinante.</div>
                                     ) : chatMessages.map((m: any) => {
                                        const isCustomer = m.senderId !== auth.currentUser?.uid;
                                        return (
                                           <div key={m.id} className={cn("flex flex-col max-w-[70%]", isCustomer ? "mr-auto items-start" : "ml-auto items-end")}>
                                              <span className="text-[8px] font-bold text-slate-400 mb-1 px-1">
                                                 {m.senderName}
                                              </span>
                                              <div className={cn(
                                                "p-4 rounded-[20px] text-xs font-semibold leading-relaxed shadow-sm",
                                                isCustomer 
                                                  ? "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-150" 
                                                  : "bg-blue-600 text-white rounded-tr-none"
                                              )}>
                                                 {m.text}
                                              </div>
                                              <span className="text-[8px] text-slate-400 font-mono mt-1 px-1">
                                                 {formatFirestoreDate(m.createdAt)}
                                              </span>
                                           </div>
                                        );
                                     })}
                                  </div>

                                  {/* Reply Message Input Composer */}
                                  <div className="pt-4 border-t border-slate-150 flex gap-3 items-center">
                                     <input 
                                       type="text" 
                                       value={replyText}
                                       onChange={e => setReplyText(e.target.value)}
                                       onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                                       disabled={activeTicket.status === 'closed'}
                                       placeholder={activeTicket.status === 'closed' ? "Abra o chamado para responder" : "Escreva sua resposta de suporte técnico..."}
                                       className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xs font-semibold focus:outline-none focus:border-blue-600"
                                     />
                                     <button 
                                       onClick={sendReply}
                                       disabled={activeTicket.status === 'closed' || !replyText.trim()}
                                       className="p-4 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:bg-blue-700 transition-all disabled:opacity-30 active:scale-95 shrink-0"
                                     >
                                        <Send size={18} />
                                     </button>
                                  </div>
                               </motion.div>
                            );
                         })() : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12">
                               <div className="p-6 bg-slate-50 rounded-full border border-slate-100 text-slate-300 mb-4 animate-bounce">
                                  <MessageSquare size={36} />
                               </div>
                               <h3 className="font-black italic serif text-slate-400 text-lg uppercase tracking-tight">Atendimento Ativo</h3>
                               <p className="text-xs text-slate-400 max-w-xs mt-2 leading-relaxed font-medium">Selecione um chamado na lista à esquerda para carregar o histórico de conversa e interagir com o cliente.</p>
                            </div>
                         )}
                      </AnimatePresence>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'marketing' && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} key="marketing" className="space-y-10">
                <div className="flex justify-between items-end">
                   <div>
                    <h2 className="text-5xl font-black italic serif tracking-tighter uppercase text-slate-800 leading-none mb-2">Creative IA</h2>
                    <p className="text-slate-500 font-mono text-sm tracking-[0.3em] uppercase">Engenharia de campanhas para ISP</p>
                  </div>
                   <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full border border-slate-200 shadow-sm">
                      <Sparkles size={20} className="text-blue-600 animate-pulse" />
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">ConnectPro AI engine</span>
                   </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-12">
                   <div className="space-y-10">
                      <div className="bg-white border border-slate-200 rounded-[48px] p-12 shadow-sm">
                         <div className="space-y-8">
                            <div className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] font-mono">Briefing da Campanha</div>
                            <textarea 
                              value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              placeholder="Ex: Criar oferta de upgrade para clientes com plano abaixo de 300MB no bairro Centro com foco em streaming..."
                              className="w-full bg-slate-50 border border-slate-100 rounded-[32px] p-10 min-h-[220px] text-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-8 focus:ring-blue-600/5 transition-all placeholder:text-slate-300 italic leading-relaxed"
                            />
                            <button 
                              disabled={isGenerating || !aiPrompt}
                              onClick={generateAI}
                              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-black py-7 rounded-2xl flex items-center justify-center gap-5 transition-all active:scale-95 shadow-2xl shadow-blue-600/30 uppercase tracking-[0.2em] text-xs"
                            >
                              {isGenerating ? (
                                <div className="w-7 h-7 border-[4px] border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <RocketIcon size={28} />
                                  GERAR CONTEÚDO GENERATIVO
                                </>
                              )}
                            </button>
                         </div>
                      </div>
                   </div>

                   <div className="relative">
                      <AnimatePresence mode="wait">
                        {aiResult ? (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white border border-blue-600/10 rounded-[48px] p-14 h-full flex flex-col shadow-2xl relative overflow-hidden"
                          >
                             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-[100px]" />
                             <div className="flex-1 space-y-10 overflow-y-auto pr-4 relative z-10 custom-scrollbar">
                                <div>
                                  <h4 className="text-4xl font-black italic tracking-tighter text-blue-600 leading-tight mb-4">{aiResult.title}</h4>
                                  <span className="text-[10px] bg-blue-600 text-white font-black px-4 py-1.5 rounded-full tracking-[0.2em] uppercase border border-blue-600 shadow-lg shadow-blue-600/20">Creative Ready</span>
                                </div>
                                
                                <div className="space-y-4">
                                   <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] font-mono">Texto da Campanha</label>
                                   <div className="bg-slate-50 p-10 rounded-[32px] text-slate-800 text-xl italic leading-relaxed border border-slate-100 font-medium">
                                      "{aiResult.message}"
                                   </div>
                                </div>

                                <div className="space-y-4">
                                   <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] font-mono">Estratégia IA</label>
                                   <p className="text-base text-slate-500 font-medium leading-relaxed bg-slate-50 p-8 rounded-[32px] border border-slate-100 italic">{aiResult.strategy}</p>
                                </div>
                             </div>

                             <div className="mt-12 pt-12 border-t border-slate-100 flex flex-col gap-5 relative z-10">
                                <button className="bg-slate-900 text-white font-black py-6 rounded-2xl flex items-center justify-center gap-4 hover:bg-black transition-all active:scale-95 shadow-2xl shadow-slate-900/10 uppercase tracking-widest text-xs">
                                   <Send size={22} className="text-blue-500" /> DISPARAR CAMPANHA (API)
                                </button>
                                <button className="text-slate-300 text-[10px] font-black hover:text-red-500 transition-colors py-2 uppercase tracking-[0.3em]" onClick={() => setAiResult(null)}>
                                   Descartar e Refazer
                                </button>
                             </div>
                          </motion.div>
                        ) : (
                          <div className="h-full border-[3px] border-slate-200 border-dashed rounded-[48px] flex flex-col items-center justify-center p-16 text-center opacity-30 bg-white/30 backdrop-blur-sm group hover:opacity-50 transition-opacity">
                             <div className="w-32 h-32 rounded-[40px] bg-slate-100 flex items-center justify-center mb-10 border border-slate-200 group-hover:scale-110 transition-transform">
                                <RocketIcon size={56} className="text-slate-300" />
                             </div>
                             <h4 className="text-3xl font-black italic serif tracking-tighter text-slate-400 uppercase mb-4">Aguardando Prompt</h4>
                             <p className="text-lg font-medium text-slate-400 max-w-[320px] leading-relaxed italic ">A inteligência artificial transformará sua ideia em uma campanha de conversão aqui.</p>
                          </div>
                        )}
                      </AnimatePresence>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key="settings" className="space-y-12">
                <div className="flex justify-between items-end">
                   <div>
                    <h2 className="text-5xl font-black italic serif tracking-tighter uppercase text-slate-800 leading-none mb-2">Configurações</h2>
                    <p className="text-slate-500 font-mono text-sm tracking-[0.3em] uppercase">Parâmetros do SaaS e Automação</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-12">
                   <div className="bg-white border border-slate-200 rounded-[48px] p-12 shadow-sm space-y-10">
                      <h3 className="text-xl font-black italic serif tracking-tighter uppercase text-slate-800 italic">Régua de Cobrança</h3>
                      
                      <div className="space-y-8">
                         <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Valor Padrão da Mensalidade (R$)</label>
                            <input 
                              type="number" 
                              defaultValue={99.90}
                              className="w-full bg-slate-50 border border-slate-100 rounded-[24px] p-6 text-xl font-black text-slate-800 focus:outline-none focus:border-blue-600 transition-all"
                            />
                         </div>

                         <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Status de Automação</label>
                            <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                               <div className="flex-1">
                                  <div className="font-black text-slate-800 text-sm italic">Geração Automática (Bot)</div>
                                  <div className="text-[10px] text-slate-400 font-bold">Faturas geradas todo dia 01</div>
                               </div>
                               <button className="w-14 h-8 bg-blue-600 rounded-full relative">
                                  <div className="absolute right-1 top-1 w-6 h-6 bg-white rounded-full shadow-sm" />
                                </button>
                            </div>
                         </div>

                         <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Bloqueio Automático</label>
                            <div className="flex items-center gap-6 bg-slate-50 p-6 rounded-[24px] border border-slate-100">
                               <div className="flex-1">
                                  <div className="font-black text-slate-800 text-sm italic">Suspensão de Inadimplentes</div>
                                  <div className="text-[10px] text-slate-400 font-bold">Bloqueio após 15 dias de atraso</div>
                               </div>
                               <button className="w-14 h-8 bg-slate-200 rounded-full relative">
                                  <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full shadow-sm" />
                                </button>
                            </div>
                         </div>
                      </div>

                      <button className="w-full bg-slate-900 text-white font-black py-6 rounded-2xl shadow-xl hover:bg-black transition-all active:scale-95 uppercase tracking-widest text-xs">
                        SALVAR PARÂMETROS
                      </button>
                   </div>

                   <div className="space-y-10">
                    <div className="bg-slate-900 rounded-[48px] p-12 text-white shadow-2xl relative overflow-hidden flex flex-col justify-between">
                        <div className="absolute top-[-40px] right-[-40px] w-64 h-64 bg-blue-600/10 rounded-full blur-[80px]" />
                        
                        <div className="relative z-10">
                          <div className="p-4 bg-blue-600 w-fit rounded-2xl mb-8 shadow-xl shadow-blue-600/30">
                              <Globe size={28} />
                          </div>
                          <h3 className="text-3xl font-black italic serif tracking-tighter leading-tight mb-4 italic">Integração de Rede</h3>
                          <p className="text-slate-400 font-medium leading-relaxed mb-10 opacity-80 text-sm italic">
                              Configure seu servidor MikroTik ou OLT para permitir que a ConnectPro gerencie o sinal dos clientes em tempo real.
                          </p>

                          <div className="space-y-6">
                              <div className="p-6 bg-white/5 border border-white/10 rounded-[28px] hover:bg-white/10 transition-colors cursor-pointer group">
                                <div className="flex justify-between items-center">
                                    <div className="font-black text-sm italic uppercase tracking-widest">MikroTik API</div>
                                    <StatusBadge status="active" />
                                </div>
                              </div>
                              <div className="p-6 bg-white/5 border border-white/10 rounded-[28px] hover:bg-white/10 transition-colors cursor-pointer group opacity-40">
                                <div className="flex justify-between items-center">
                                    <div className="font-black text-sm italic uppercase tracking-widest">Huawei OLT (SSH)</div>
                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest border border-white/10 px-3 py-1 rounded-full">Offline</div>
                                </div>
                              </div>
                          </div>
                        </div>

                        <div className="pt-10 border-t border-white/10 mt-10">
                          <button className="flex items-center gap-3 text-[10px] font-black text-blue-400 hover:text-white transition-colors uppercase tracking-[0.3em]">
                              Ver Documentação API <ArrowRight size={14} />
                          </button>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-[40px] p-10 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 font-mono">Status da Nuvem</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Database (Firestore)</span>
                          <span className="text-[10px] font-black text-emerald-500 uppercase">ONLINE</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">AI Service (Gemini)</span>
                          <span className="text-[10px] font-black text-emerald-500 uppercase">ONLINE</span>
                        </div>
                        <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                          <p className="text-[10px] text-blue-600 font-bold uppercase leading-relaxed text-center">
                            Aviso: Verifique as Variáveis de Ambiente no menu Settings para ativar Mikrotik e WhatsApp de forma real.
                          </p>
                        </div>
                      </div>
                    </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {activeConfigModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-2xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={cn(
                "bg-white rounded-[40px] p-10 w-full shadow-2xl relative overflow-hidden text-slate-900",
                activeConfigModal === 'plans' ? "max-w-2xl" : "max-w-lg"
              )}
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-black italic serif tracking-tighter uppercase leading-none mb-2">
                    {activeConfigModal === 'onu' ? 'Provisionar ONU' : 
                     activeConfigModal === 'mikrotik' ? 'Manager MikroTik' : 
                     activeConfigModal === 'oltStatus' ? 'Status Fiber OLT' : 
                     activeConfigModal === 'radius' ? 'Configurar Radius' : 'Planos de Internet'}
                  </h3>
                  <p className="text-slate-400 font-mono text-[9px] uppercase tracking-widest">
                    {activeConfigModal === 'plans' ? 'Gere e configure a grade comercial do provedor' : 'Configuração de Terminal ConnectPro'}
                  </p>
                </div>
                <button onClick={() => setActiveConfigModal(null)} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <Plus size={28} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                {activeConfigModal === 'onu' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">IP da OLT</label>
                        <input type="text" placeholder="192.168.1.1" value={infraConfigs.onu.ip} onChange={e => setInfraConfigs({...infraConfigs, onu: {...infraConfigs.onu, ip: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Porta</label>
                        <input type="text" placeholder="22" value={infraConfigs.onu.port} onChange={e => setInfraConfigs({...infraConfigs, onu: {...infraConfigs.onu, port: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Usuário</label>
                        <input type="text" placeholder="admin" value={infraConfigs.onu.user} onChange={e => setInfraConfigs({...infraConfigs, onu: {...infraConfigs.onu, user: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Senha</label>
                        <input type="password" placeholder="123456" value={infraConfigs.onu.password} onChange={e => setInfraConfigs({...infraConfigs, onu: {...infraConfigs.onu, password: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Marca da OLT</label>
                      <select value={infraConfigs.onu.brand} onChange={e => setInfraConfigs({...infraConfigs, onu: {...infraConfigs.onu, brand: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none">
                        <option>Huawei</option>
                        <option>ZTE</option>
                        <option>Fiberhome</option>
                        <option>Nokia</option>
                        <option>Outra</option>
                      </select>
                    </div>
                  </>
                )}

                {activeConfigModal === 'mikrotik' && (
                  <>
                    <div className="bg-slate-900 text-white p-6 rounded-2xl mb-6 border border-slate-700 shadow-xl">
                      <h4 className="text-sm font-black uppercase tracking-widest text-blue-400 mb-4 flex items-center gap-2">
                        <Globe size={16} /> Guia Rápido de Configuração
                      </h4>
                      <div className="space-y-4 text-[11px] font-medium leading-relaxed opacity-90">
                        <p>1. Localize o <strong>IP do MikroTik</strong>: Geralmente <code className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300">192.168.88.1</code> ou <code className="bg-white/10 px-1.5 py-0.5 rounded text-blue-300">192.168.0.1</code>.</p>
                        <p>2. No terminal do Winbox ou SSH, habilite a API:</p>
                        <code className="block bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-emerald-400">/ip service enable api</code>
                        <p>3. Use o <strong>Usuário</strong> e <strong>Senha</strong> de acesso ao seu roteador.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">IP / Host do Roteador</label>
                        <input type="text" placeholder="192.168.0.1" value={infraConfigs.mikrotik.host} onChange={e => setInfraConfigs({...infraConfigs, mikrotik: {...infraConfigs.mikrotik, host: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Porta API (Winbox)</label>
                        <input type="text" placeholder="8728" value={infraConfigs.mikrotik.port} onChange={e => setInfraConfigs({...infraConfigs, mikrotik: {...infraConfigs.mikrotik, port: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Usuário Manager</label>
                        <input type="text" placeholder="admin" value={infraConfigs.mikrotik.user} onChange={e => setInfraConfigs({...infraConfigs, mikrotik: {...infraConfigs.mikrotik, user: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Senha Secreta</label>
                        <input type="password" placeholder="******" value={infraConfigs.mikrotik.password} onChange={e => setInfraConfigs({...infraConfigs, mikrotik: {...infraConfigs.mikrotik, password: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={async () => {
                        setIsProcessing(true);
                        try {
                          const res = await fetch('/api/mikrotik/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(infraConfigs.mikrotik)
                          });
                          const data = await res.json();
                          if (data.success) {
                            showToast(data.message, 'success');
                          } else {
                            showToast("Erro: " + data.error, 'error');
                          }
                        } catch (e) {
                          showToast("Falha na requisição ao servidor.", 'error');
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      className="w-full py-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all mt-4"
                    >
                      Testar Conexão com MikroTik
                    </button>
                  </>
                )}

                {activeConfigModal === 'oltStatus' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">IP OLT</label>
                      <input type="text" placeholder="192.168.1.1" value={infraConfigs.oltStatus.ip} onChange={e => setInfraConfigs({...infraConfigs, oltStatus: {...infraConfigs.oltStatus, ip: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Usuário</label>
                        <input type="text" placeholder="admin" value={infraConfigs.oltStatus.user} onChange={e => setInfraConfigs({...infraConfigs, oltStatus: {...infraConfigs.oltStatus, user: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Senha</label>
                        <input type="password" placeholder="******" value={infraConfigs.oltStatus.password} onChange={e => setInfraConfigs({...infraConfigs, oltStatus: {...infraConfigs.oltStatus, password: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Método de Monitoramento</label>
                      <select value={infraConfigs.oltStatus.method} onChange={e => setInfraConfigs({...infraConfigs, oltStatus: {...infraConfigs.oltStatus, method: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none">
                        <option>SNMP v2c</option>
                        <option>SNMP v3</option>
                        <option>API (ZTE/Huawei)</option>
                        <option>SSH Scraper</option>
                      </select>
                    </div>
                  </>
                )}

                {activeConfigModal === 'radius' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">IP Servidor Radius</label>
                      <input type="text" placeholder="192.168.0.10" value={infraConfigs.radius.host} onChange={e => setInfraConfigs({...infraConfigs, radius: {...infraConfigs.radius, host: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Secret Key</label>
                        <input type="password" placeholder="radius123" value={infraConfigs.radius.secret} onChange={e => setInfraConfigs({...infraConfigs, radius: {...infraConfigs.radius, secret: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-2">Porta Radius</label>
                        <input type="text" placeholder="1812" value={infraConfigs.radius.port} onChange={e => setInfraConfigs({...infraConfigs, radius: {...infraConfigs.radius, port: e.target.value}})} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm font-bold focus:border-blue-600 outline-none" />
                      </div>
                    </div>
                  </>
                )}

                {activeConfigModal === 'plans' && (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">Modifique os valores, nomes e velocidades dos planos de internet ofertados:</p>
                    <div className="space-y-4">
                      {tempPlans.map((p, index) => (
                        <div key={p.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 relative">
                          <button 
                            type="button" 
                            onClick={() => {
                              const updated = tempPlans.filter((_, idx) => idx !== index);
                              setTempPlans(updated);
                            }}
                            className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors p-1"
                            title="Remover plano"
                          >
                            <Plus size={18} className="rotate-45" />
                          </button>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nome do Plano</label>
                              <input 
                                type="text" 
                                value={p.name} 
                                onChange={e => {
                                  const updated = [...tempPlans];
                                  updated[index].name = e.target.value;
                                  setTempPlans(updated);
                                }} 
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:border-blue-600 outline-none" 
                                placeholder="Ex: 500 Mega Ultra" 
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Mensalidade (R$)</label>
                              <input 
                                type="number" 
                                step="0.01" 
                                value={p.price} 
                                onChange={e => {
                                  const updated = [...tempPlans];
                                  updated[index].price = parseFloat(e.target.value) || 0;
                                  setTempPlans(updated);
                                }} 
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:border-blue-600 outline-none" 
                                placeholder="99.90" 
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Download</label>
                              <input 
                                type="text" 
                                value={p.download} 
                                onChange={e => {
                                  const updated = [...tempPlans];
                                  updated[index].download = e.target.value;
                                  setTempPlans(updated);
                                }} 
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:border-blue-600 outline-none" 
                                placeholder="500M" 
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Upload</label>
                              <input 
                                type="text" 
                                value={p.upload} 
                                onChange={e => {
                                  const updated = [...tempPlans];
                                  updated[index].upload = e.target.value;
                                  setTempPlans(updated);
                                }} 
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:border-blue-600 outline-none" 
                                placeholder="250M" 
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      type="button"
                      onClick={() => {
                        const newPlanId = 'plan_' + Date.now();
                        setTempPlans([
                          ...tempPlans,
                          { id: newPlanId, name: 'Novo Plano ' + (tempPlans.length + 1), price: 99.90, download: '300M', upload: '150M' }
                        ]);
                      }}
                      className="w-full py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-100 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-2"
                    >
                      <Plus size={14} strokeWidth={3} /> ADICIONAR NOVO PLANO
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-8 flex gap-4">
                <button 
                  onClick={() => setActiveConfigModal(null)}
                  className="flex-1 bg-slate-100 text-slate-500 font-black py-4 rounded-xl hover:bg-slate-200 transition-all uppercase tracking-widest text-[10px]"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (activeConfigModal === 'plans') {
                      savePlansToFirestore(tempPlans);
                    } else {
                      const label = activeConfigModal === 'onu' ? 'Provisionar ONU' : 
                                    activeConfigModal === 'mikrotik' ? 'Manager Mikrotik' : 
                                    activeConfigModal === 'oltStatus' ? 'Status Fiber OLT' : 'Configurar Radius';
                      executeInfraSync(label);
                    }
                  }}
                  className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-xl shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  {activeConfigModal === 'plans' ? 'SALVAR PLANOS' : 'CONECTAR INFRA'} {activeConfigModal === 'plans' ? <CheckCircle2 size={14} /> : <Rocket size={14} />}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRegisterModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] p-0 max-w-4xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center p-8 border-b border-slate-100 bg-slate-50/50">
                <div>
                  <h3 className="text-3xl font-black italic serif tracking-tighter text-slate-800 uppercase leading-none mb-1">Novo Assinante</h3>
                  <p className="text-slate-400 font-mono text-[9px] uppercase tracking-[0.2em]">Registro Multilaywer • SaaS Fiber Connect</p>
                </div>
                <button onClick={() => setIsRegisterModalOpen(false)} className="text-slate-300 hover:text-slate-500 transition-colors p-2 bg-white rounded-full border border-slate-100 shadow-sm">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              {/* Tabs Header */}
              <div className="flex bg-white px-8 pt-6 gap-8 border-b border-slate-100 sticky top-0 z-20">
                <button type="button" onClick={() => setRegisterTab('basic')} className={cn("pb-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all", registerTab === 'basic' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}>Dados Básicos</button>
                <button type="button" onClick={() => setRegisterTab('address')} className={cn("pb-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all", registerTab === 'address' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}>Endereço & Plano</button>
                <button type="button" onClick={() => setRegisterTab('equipment')} className={cn("pb-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all", registerTab === 'equipment' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}>Equipamento & ONU</button>
                <button type="button" onClick={() => setRegisterTab('connection')} className={cn("pb-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all", registerTab === 'connection' ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600")}>Conexão & MikroTik</button>
              </div>

              <form onSubmit={saveClient} className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                <AnimatePresence mode="wait">
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    key={registerTab}
                    className="space-y-8"
                  >
                    {registerTab === 'basic' && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Nome Completo</label>
                            <input required type="text" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="Ex: João Silva" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">CPF / CNPJ</label>
                            <input required type="text" value={newClient.cpfCnpj} onChange={e => setNewClient({...newClient, cpfCnpj: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="000.000.000-00" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">WhatsApp (Obrigatório)</label>
                            <input required type="tel" value={newClient.whatsapp} onChange={e => setNewClient({...newClient, whatsapp: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="11999999999" />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Dia de Vencimento</label>
                             <select value={newClient.dueDate} onChange={e => setNewClient({...newClient, dueDate: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none appearance-none">
                                <option value="05">Dia 05</option>
                                <option value="10">Dia 10</option>
                                <option value="15">Dia 15</option>
                                <option value="20">Dia 20</option>
                                <option value="25">Dia 25</option>
                             </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {registerTab === 'address' && (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Endereço Completo</label>
                          <input required type="text" value={newClient.address} onChange={e => setNewClient({...newClient, address: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="Rua, Número..." />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Bairro</label>
                            <input required type="text" value={newClient.neighborhood} onChange={e => setNewClient({...newClient, neighborhood: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="Ex: Centro" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Cidade</label>
                            <input required type="text" value={newClient.city} onChange={e => setNewClient({...newClient, city: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="Ex: São Paulo" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Plano de Acesso</label>
                          <select value={newClient.planId} onChange={e => {
                             const profile = e.target.value.toUpperCase().replace(/\s/g, '_');
                             const matched = plans.find(p => p.name === e.target.value);
                             setNewClient({
                               ...newClient, 
                               planId: e.target.value, 
                               planProfile: profile,
                               download: matched?.download || newClient.download,
                               upload: matched?.upload || newClient.upload
                             });
                          }} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none appearance-none">
                            {plans.map((p: any) => (
                              <option key={p.id} value={p.name}>{p.name} - R$ {Number(p.price).toFixed(2)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {registerTab === 'equipment' && (
                      <div className="space-y-6">
                        <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-center gap-4 mb-4">
                           <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg"><Wifi size={20} /></div>
                           <p className="text-[11px] font-bold text-blue-700 uppercase tracking-tight">Vincular Ativos de Rede à Conexão do Cliente</p>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Marca/Modelo Roteador</label>
                            <input type="text" value={newClient.routerBrand} onChange={e => setNewClient({...newClient, routerBrand: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="Ex: TP-Link Archer" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">MAC Address Roteador</label>
                            <input type="text" value={newClient.routerMac} onChange={e => setNewClient({...newClient, routerMac: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="00:00:00:00:00:00" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6 border-t border-slate-100 pt-8 mt-8">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Serial Number ONU</label>
                            <input type="text" value={newClient.onuSerial} onChange={e => setNewClient({...newClient, onuSerial: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="EX: HUAWEI123456" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Porta PON (OLT)</label>
                            <input type="text" value={newClient.onuPonPort} onChange={e => setNewClient({...newClient, onuPonPort: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="0/1/2" />
                          </div>
                        </div>
                      </div>
                    )}

                    {registerTab === 'connection' && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Usuário PPPoE (Cloud Auto)</label>
                            <input type="text" value={newClient.pppoeUser} onChange={e => setNewClient({...newClient, pppoeUser: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="Deixe vazio para auto-gerar" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Senha PPPoE</label>
                            <input type="text" value={newClient.pppoePass} onChange={e => setNewClient({...newClient, pppoePass: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="******" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6 border-t border-slate-100 pt-8 mt-8">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Download (Limit)</label>
                            <input type="text" value={newClient.download} onChange={e => setNewClient({...newClient, download: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="500M" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Upload (Limit)</label>
                            <input type="text" value={newClient.upload} onChange={e => setNewClient({...newClient, upload: e.target.value})} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-base font-bold focus:border-blue-600 outline-none" placeholder="250M" />
                          </div>
                        </div>
                        {!infraConfigs.mikrotik?.host && (
                          <div className="bg-orange-50 border border-orange-100 p-6 rounded-3xl flex items-center gap-4 mt-6">
                             <AlertCircle className="text-orange-500" />
                             <p className="text-[10px] font-bold text-orange-700 uppercase tracking-tight leading-relaxed">MikroTik não configurado. O cliente será salvo apenas no Cloud DB sem provisionamento real.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </form>

              <div className="p-8 border-t border-slate-100 flex gap-4 bg-slate-50/50 sticky bottom-0 z-20">
                <button 
                  type="button" 
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="flex-1 bg-white text-slate-400 font-black py-5 rounded-2xl hover:bg-slate-100 transition-all uppercase tracking-widest text-xs border border-slate-200"
                >
                  Cancelar
                </button>
                {registerTab !== 'connection' ? (
                  <button 
                    type="button"
                    onClick={() => {
                       if (registerTab === 'basic') setRegisterTab('address');
                       else if (registerTab === 'address') setRegisterTab('equipment');
                       else if (registerTab === 'equipment') setRegisterTab('connection');
                    }}
                    className="flex-[2] bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-black transition-all active:scale-95 uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                  >
                    Próximo Passo <ArrowRight size={18} />
                  </button>
                ) : (
                  <button 
                    type="button"
                    onClick={(e) => saveClient(e as any)}
                    disabled={isProcessing}
                    className="flex-[2] bg-blue-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 uppercase tracking-widest text-xs flex items-center justify-center gap-3"
                  >
                    {isProcessing ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Rocket size={18} /> FINALIZAR & PROVISIONAR</>}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {infraAction && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[48px] p-12 max-w-lg w-full shadow-2xl relative overflow-hidden"
            >
              {isProcessing ? (
                <div className="flex flex-col items-center text-center py-6">
                  <div className="relative w-24 h-24 mb-8">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full"
                    />
                    <div className="absolute inset-3 bg-blue-50 rounded-full flex items-center justify-center">
                      <Zap size={24} className="text-blue-600 animate-pulse" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-black italic serif tracking-tighter text-slate-800 uppercase mb-4 leading-none">{infraAction}</h3>
                  <div className="w-full bg-slate-900 rounded-2xl p-6 text-left font-mono text-[9px] text-emerald-400/80 mb-6 border border-white/10 shadow-inner overflow-hidden max-h-[120px]">
                     <motion.div 
                       initial={{ y: 0 }}
                       animate={{ y: -120 }}
                       transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                       className="space-y-1"
                     >
                        <p>{'>'} SSH established with {infraConfigs[infraAction === 'Provisionar ONU' ? 'onu' : infraAction === 'Manager Mikrotik' ? 'mikrotik' : infraAction === 'Status Fiber OLT' ? 'oltStatus' : 'radius'].host || infraConfigs[infraAction === 'Provisionar ONU' ? 'onu' : infraAction === 'Manager Mikrotik' ? 'mikrotik' : infraAction === 'Status Fiber OLT' ? 'oltStatus' : 'radius'].ip || 'remote-core'}...</p>
                        <p>{'>'} Authentication success (RSA Key OK)</p>
                        <p>{'>'} Syncing infrastructure data...</p>
                        <p>{'>'} Protocol: {infraAction === 'Configurar Radius' ? 'RAD/AUTH' : 'API/CLI'}</p>
                        <p>{'>'} Port: {infraConfigs[infraAction === 'Provisionar ONU' ? 'onu' : infraAction === 'Manager Mikrotik' ? 'mikrotik' : infraAction === 'Status Fiber OLT' ? 'oltStatus' : 'radius'].port}</p>
                        <p>{'>'} Handshaking...</p>
                        <p>{'>'} Establishing tunnel via Gemini ISP Cloud...</p>
                        <p>{'>'} Database Update: SUCCESS</p>
                        <p>{'>'} Service Provisioned.</p>
                     </motion.div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center py-10">
                  <div className="w-32 h-32 bg-emerald-100 rounded-[40px] flex items-center justify-center mb-10 border border-emerald-200">
                    <CheckCircle2 size={56} className="text-emerald-500" />
                  </div>
                  <h3 className="text-3xl font-black italic serif tracking-tighter text-slate-800 uppercase mb-4 leading-none">Ação Concluída</h3>
                  <p className="text-lg font-medium text-slate-500 italic mb-10">O comando <strong>{infraAction}</strong> foi executado com sucesso na infraestrutura do provedor.</p>
                  <button 
                    onClick={() => setInfraAction(null)}
                    className="bg-slate-900 text-white font-black px-12 py-5 rounded-2xl shadow-xl active:scale-95 transition-all uppercase tracking-widest text-xs"
                  >
                    Fechar Terminal
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
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

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-5 py-4 rounded-xl transition-all font-black text-sm tracking-tight border-l-[6px]",
        active 
          ? "bg-blue-600/10 text-blue-500 border-blue-600 shadow-sm" 
          : "text-slate-500 border-transparent hover:text-slate-100 hover:bg-slate-800"
      )}
    >
      <div className={cn("transition-colors", active ? "text-blue-500" : "text-slate-500 group-hover:text-white")}>
        {icon}
      </div>
      <span>{label}</span>
      {active && <motion.div layoutId="activeNav" className="ml-auto w-1.5 h-1.5 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50" />}
    </button>
  );
}

function StatusCard({ label, value, trend, color = 'blue', icon }: any) {
  return (
    <div className="bg-white border border-slate-200 p-10 rounded-[40px] relative overflow-hidden group shadow-sm hover:shadow-2xl hover:scale-[1.02] transition-all duration-500">
      <div className="absolute right-[-20px] top-[-20px] opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-[2] group-hover:rotate-12 transition-all duration-1000">
         {icon && <div className="scale-[5]">{icon}</div>}
      </div>
      <div className="text-[11px] text-slate-400 uppercase font-black tracking-[0.2em] mb-4 font-mono">{label}</div>
      <div className="text-5xl font-black tracking-tighter mb-6 text-slate-900 leading-none">{value}</div>
      <div className={cn(
        "text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg border inline-block",
        color === 'red' ? "bg-red-50 text-red-600 border-red-100" : 
        color === 'emerald' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
        color === 'orange' ? "bg-orange-50 text-orange-600 border-orange-100" :
        "bg-blue-50 text-blue-600 border-blue-100"
      )}>{trend}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: any = {
    active: "bg-emerald-50 text-emerald-600 border-emerald-100",
    blocked: "bg-red-50 text-red-600 border-red-100",
    overdue: "bg-orange-50 text-orange-600 border-orange-100",
  };
  const labels: any = {
    active: "Conectado Fiber",
    blocked: "Suspenso",
    overdue: "Atraso Financeiro",
  };

  return (
    <div className="flex items-center gap-3">
       <div className={cn("w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor]", status === 'active' ? 'text-emerald-500 bg-current animate-pulse' : status === 'blocked' ? 'text-red-500 bg-current' : 'text-orange-500 bg-current')} />
       <span className={cn("text-[10px] font-black tracking-[0.1em] px-3 py-1.5 rounded-full border uppercase italic", styles[status])}>
         {labels[status]}
       </span>
    </div>
  );
}

function QuickBtn({ icon, label, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-7 bg-slate-50 border border-slate-100 rounded-[24px] hover:border-blue-600 hover:bg-white hover:shadow-2xl hover:shadow-blue-600/10 transition-all group active:scale-[0.98]">
      <div className="flex items-center gap-5">
         <div className="text-slate-300 group-hover:text-blue-600 transition-colors group-hover:scale-110 transform">{icon}</div>
         <span className="text-base font-black text-slate-800 tracking-tight">{label}</span>
      </div>
      <Plus size={20} className="text-slate-200 group-hover:text-blue-600 transition-colors" />
    </button>
  );
}
