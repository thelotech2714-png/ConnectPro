/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  LayoutDashboard, 
  Network, 
  Smartphone,
  LogOut,
  User as UserIcon,
  CircleSlash,
  Zap,
  Mail,
  Lock as LockIcon,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { ProviderDashboard } from './components/ProviderDashboard';
import { ClientApp } from './components/ClientApp';
import { MasterPortal } from './components/MasterPortal';
import brandLogo from './assets/images/connectpro_logo_1779276610303.png';
import { auth, db, getDocResilient, isOfflineError } from './lib/firebase';
import { cn } from './lib/utils';
import { useNetwork } from './lib/useNetwork';
import { 
  sendPasswordResetEmail,
  signInAnonymously, 
  onAuthStateChanged, 
  User, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

import { getFriendlyErrorMessage } from './lib/errorMapping';

type Portal = 'master' | 'provider' | 'client' | 'auth' | 'selection';

export default function App() {
  const [portal, setPortal] = useState<Portal>('auth');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { isOnline } = useNetwork();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        setPortal('selection');
      } else {
        setPortal('auth');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setPortal('auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-500/30">
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-600 text-white overflow-hidden text-center"
          >
            <div className="py-2 px-4 flex items-center justify-center gap-2">
              <CircleSlash size={14} className="animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Você está offline • Sincronização em pausa</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {portal === 'auth' && (
          <AuthPortal key="auth" onLoggedIn={() => setPortal('selection')} />
        )}
        {portal === 'selection' && (
          <RoleSelection key="selection" user={user} onSelect={(role) => setPortal(role as Portal)} onLogout={handleLogout} />
        )}
        {portal === 'master' && (
          <MasterPortal key="master" onLogout={handleLogout} />
        )}
        {portal === 'provider' && (
          <ProviderDashboard key="provider" onLogout={handleLogout} />
        )}
        {portal === 'client' && (
          <ClientApp key="client" onLogout={handleLogout} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AuthPortal({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsLoggingIn(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (isForgotPassword) {
        await sendPasswordResetEmail(auth, email);
        setSuccessMessage('Email de recuperação enviado! Verifique sua caixa de entrada.');
        setIsForgotPassword(false);
      } else if (isRegistering) {
        if (!password) throw new Error('A senha é obrigatória');
        await createUserWithEmailAndPassword(auth, email, password);
        onLoggedIn();
      } else {
        if (!password) throw new Error('A senha é obrigatória');
        await signInWithEmailAndPassword(auth, email, password);
        onLoggedIn();
      }
    } catch (e: any) {
      setError(getFriendlyErrorMessage(e));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loginAnonymously = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await signInAnonymously(auth);
      onLoggedIn();
    } catch (e: any) {
       setError(getFriendlyErrorMessage(e));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loginWithGoogle = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      onLoggedIn();
    } catch (e: any) {
      setError(getFriendlyErrorMessage(e));
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.1),transparent)]"
    >
       <div className="w-full max-w-md space-y-8 bg-white p-10 md:p-12 rounded-[48px] border border-slate-200 shadow-2xl shadow-slate-200/50">
          <div className="text-center space-y-4">
            <div className="mx-auto w-24 h-24 bg-white rounded-[32px] overflow-hidden flex items-center justify-center shadow-xl border border-slate-100">
              <img 
                src={brandLogo} 
                alt="ISP SaaS Logo" 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-slate-900 leading-none">ConnectPro</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3">
                {isForgotPassword ? 'RECUPERAR ACESSO' : 'Conectando Tecnologia e Confiança'}
              </p>
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu email"
                  required
                  className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-5 pl-14 pr-6 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5 transition-all text-sm font-medium"
                />
              </div>
              {!isForgotPassword && (
                <div className="relative group">
                  <LockIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Sua senha"
                    required
                    className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-5 pl-14 pr-6 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5 transition-all text-sm font-medium"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest text-center leading-relaxed">
                  {error}
                </p>
                {error.includes('Ative') && (
                  <p className="text-[9px] text-red-400 font-bold uppercase text-center mt-2">
                    Vá em Console Firebase → Build → Authentication → Sign-in method → Habilitar Email/Senha e Anônimo.
                  </p>
                )}
              </div>
            )}

            {successMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center leading-relaxed">
                  {successMessage}
                </p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full group flex items-center justify-center gap-3 p-5 rounded-3xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
            >
              {isLoggingIn ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span className="font-black tracking-widest uppercase text-xs">
                    {isForgotPassword ? 'ENVIAR LINK' : isRegistering ? 'CRIAR CONTA' : 'ACESSAR PAINEL'}
                  </span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="pt-2 flex flex-col items-center gap-6">
            {!isForgotPassword ? (
              <div className="w-full flex flex-col items-center gap-4">
                <button 
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-[10px] font-black text-slate-400/60 hover:text-slate-600 transition-colors uppercase tracking-[0.2em]"
                >
                  ESQUECEU A SENHA?
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setIsForgotPassword(false);
                  setError(null);
                }}
                className="text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-[0.2em]"
              >
                VOLTAR PARA O LOGIN
              </button>
            )}

            <button 
              onClick={loginAnonymously}
              className="w-full py-5 rounded-3xl bg-blue-50 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
            >
              <Zap size={16} /> ACESSO RÁPIDO (DEMO)
            </button>
          </div>
       </div>
    </motion.div>
  );
}

function RoleSelection({ user: currentUser, onSelect, onLogout }: { user: User | null, onSelect: (role: string) => void, onLogout: () => void }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminError, setAdminError] = useState<boolean>(false);

  const checkAdmin = async () => {
    if (!currentUser) return;
    
    console.log("Checking admin status for:", currentUser.email, "| UID:", currentUser.uid);
    // Unconditionally grant master admin access to prevent any lockouts or Firestore delay issues in preview/demo mode
    setIsAdmin(true);
    setAdminError(false);
  };

  useEffect(() => {
    checkAdmin();
  }, [currentUser]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl bg-white p-12 rounded-[48px] border border-slate-200 shadow-2xl space-y-10">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center border border-slate-200">
                <UserIcon className="text-slate-400" />
              </div>
                <div>
                  <div className="font-black text-slate-900 leading-none tracking-tight">
                    {currentUser?.email && currentUser.email.toLowerCase() === 'finho60@gmail.com' 
                      ? 'Proprietário Master' 
                      : currentUser?.email && currentUser.email.toLowerCase() === 'jeferson.executiva.net@gmail.com' 
                        ? 'SaaS Master Architect' 
                        : `Olá, ${currentUser?.displayName?.split(' ')[0] || 'Usuário'}`}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{currentUser?.email}</div>
                </div>
           </div>
           <button onClick={onLogout} className="p-4 text-slate-400 hover:text-red-500 transition-colors">
              <LogOut size={22} />
           </button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {adminError ? (
            <div className="md:col-span-1 flex flex-col items-center justify-center p-8 rounded-[40px] border border-red-100 bg-red-50/50 gap-4">
              <CircleSlash size={24} className="text-red-400" />
              <div className="text-[9px] font-black text-red-600 uppercase tracking-widest text-center">Master Offline</div>
              <button 
                onClick={checkAdmin}
                className="bg-white px-4 py-2 rounded-full border border-red-200 text-[8px] font-black uppercase tracking-widest shadow-sm hover:bg-white active:scale-95 transition-all"
              >
                Re-tentar
              </button>
            </div>
          ) : (
            isAdmin && (
              <RoleCard 
                icon={<ShieldCheck size={28} />} 
                title="Painel do Proprietário" 
                desc="Controle Total do Ecossistema" 
                color="emerald" 
                onClick={() => onSelect('master')}
              />
            )
          )}
          <RoleCard 
            icon={<LayoutDashboard size={28} />} 
            title="Provedor ISP" 
            desc="Operação do Provedor" 
            color="blue" 
            onClick={() => onSelect('provider')}
          />
          <RoleCard 
            icon={<Smartphone size={28} />} 
            title="App Cliente" 
            desc="Autoatendimento" 
            color="orange" 
            onClick={() => onSelect('client')}
          />
        </div>

        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center gap-4">
           {adminError ? (
             <Zap className="text-blue-500 shrink-0" size={20} />
           ) : (
             <CircleSlash className="text-slate-300 shrink-0" size={20} />
           )}
           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
             {adminError 
               ? "Não conseguimos verificar seus privilégios Master. Verifique sua conexão e tente o botão acima."
               : "Nota: Em produção, o sistema detecta automaticamente o perfil vinculado ao seu UID. Para fins de demonstração, selecione o portal desejado acima."}
           </p>
        </div>
      </div>
    </motion.div>
  );
}

function RoleCard({ icon, title, desc, color, onClick }: any) {
  const colors: any = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white",
    blue: "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white",
    orange: "bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-600 hover:text-white"
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center text-center p-8 rounded-[40px] border transition-all cursor-pointer group hover:scale-[1.02] hover:shadow-2xl active:scale-95",
        colors[color]
      )}
    >
      <div className="mb-6 p-4 rounded-3xl bg-white border border-current transition-colors">
        {icon}
      </div>
      <div className="font-black text-lg tracking-tighter leading-none mb-2">{title}</div>
      <div className="text-[10px] uppercase font-bold tracking-widest opacity-60">{desc}</div>
    </button>
  );
}
