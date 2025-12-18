
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Code2, Globe, ScrollText, Activity, Terminal, Cpu, Signal, Menu, X, Twitter, Github, Disc, Languages, Wallet, LogOut, User } from 'lucide-react';
import { CanvasNetwork } from './CanvasNetwork';
import { api } from '../lib/api';
import { useLanguage } from '../lib/i18n';
import { usePrivy } from '@privy-io/react-auth';



// Auth button component using Privy
const AuthButton = () => {
  const { login, logout, authenticated, user } = usePrivy();

  if (authenticated && user) {
    const displayName = user.email?.address?.split('@')[0] ||
      user.google?.email?.split('@')[0] ||
      user.twitter?.username ||
      user.wallet?.address?.slice(0, 6) + '...' ||
      'User';

    return (
      <div className="hidden sm:flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-mono text-emerald-400">{displayName}</span>
        </div>
        <button
          onClick={logout}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-all"
    >
      <User size={14} />
      <span className="hidden sm:inline">Sign In</span>
    </button>
  );
};

const NavLink: React.FC<{ to: string; icon: any; children: React.ReactNode; onClick?: () => void }> = ({ to, icon: Icon, children, onClick }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`relative group flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300 ${
        isActive 
          ? 'text-primary' 
          : 'text-slate-400 hover:text-white'
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[1px] bg-primary transition-all duration-300 ${isActive ? 'h-full opacity-100' : 'h-0 opacity-0 group-hover:h-[50%] group-hover:opacity-50'}`}></div>
      <Icon size={16} className={`transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]' : ''}`} />
      <span className={isActive ? 'font-bold tracking-tight' : 'font-normal'}>{children}</span>
    </Link>
  );
};

const SystemLog = () => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'mock'>('connecting');
  const { t } = useLanguage();

  useEffect(() => {
    // Check connection on mount
    api.checkConnection().then(isConnected => {
      setStatus(isConnected ? 'connected' : 'mock');
    });
  }, []);

  return (
    <div className="flex items-center gap-8 text-[10px] font-mono text-slate-500 overflow-hidden whitespace-nowrap">
        <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === 'connected' ? 'bg-emerald-500 animate-pulse' : 
              status === 'mock' ? 'bg-yellow-500' : 'bg-slate-500'
            }`}></span>
            <span className="hidden sm:inline">NET_STATUS:</span> 
            <span className={
              status === 'connected' ? 'text-emerald-500 font-bold' : 
              status === 'mock' ? 'text-yellow-500 font-bold' : 'text-slate-500'
            }>
              {status === 'connected' ? t.nav.status_live : status === 'mock' ? t.nav.status_mock : t.nav.status_conn}
            </span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
            <Cpu size={10} />
            <span>GAS: 14 GWEI</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
            <Activity size={10} />
            <span>TPS: 842</span>
        </div>
        <div className="hidden md:flex items-center gap-2">
            <Signal size={10} />
            <span>ORACLE: 12ms</span>
        </div>
        <div className="text-slate-600 hidden lg:block">
            LAST_BLOCK: 0x9f...2a1 [CONFIRMED]
        </div>
    </div>
  );
}

const Footer = () => {
  const { t } = useLanguage();
  return (
  <footer className="border-t border-white/10 bg-black/40 backdrop-blur-lg pt-16 pb-24">
    <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-12">
      <div className="col-span-2 lg:col-span-2">
        <Link to="/" className="flex items-center mb-6">
          <img src="/logo.svg" alt="VRAIX" className="h-12 w-auto" />
        </Link>
        <p className="text-slate-400 text-sm max-w-sm mb-6 leading-relaxed">
          {t.hero.subtitle}
        </p>
        <div className="flex gap-4">
          <a href="#" className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"><Twitter size={14} /></a>
          <a href="#" className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"><Github size={14} /></a>
          <a href="#" className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"><Disc size={14} /></a>
        </div>
      </div>
      
      <div>
        <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider mb-6">Platform</h4>
        <ul className="space-y-4 text-sm text-slate-400">
          <li><Link to="/marketplace" className="hover:text-primary transition-colors">{t.nav.market}</Link></li>
          <li><Link to="/quote" className="hover:text-primary transition-colors">{t.nav.quote}</Link></li>
          <li><Link to="/connect" className="hover:text-primary transition-colors">{t.nav.uplink}</Link></li>
          <li><Link to="/community" className="hover:text-primary transition-colors">{t.community.title}</Link></li>
        </ul>
      </div>

      <div>
        <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider mb-6">Developers</h4>
        <ul className="space-y-4 text-sm text-slate-400">
          <li><Link to="/docs" className="hover:text-primary transition-colors">{t.nav.docs}</Link></li>
          <li><a href="https://github.com/vrwx" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Github SDK</a></li>
          <li><a href="https://basescan.org/address/0x40Ba424ee54607cFb7A4fEe5DB46533Cc8c52fd3" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Smart Contracts</a></li>
          <li><Link to="/receipts" className="hover:text-primary transition-colors">{t.nav.ledger}</Link></li>
        </ul>
      </div>

      <div>
        <h4 className="font-mono text-xs font-bold text-white uppercase tracking-wider mb-6">Resources</h4>
        <ul className="space-y-4 text-sm text-slate-400">
          <li><a href="https://basescan.org" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-1">Block Explorer <span className="text-[10px] text-slate-600">↗</span></a></li>
          <li><a href="https://l2beat.com/scaling/projects/base" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-1">Gas Tracker <span className="text-[10px] text-slate-600">↗</span></a></li>
          <li><a href={`${import.meta.env.VITE_API_URL || 'https://api.vrwx.io'}/health`} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors flex items-center gap-1">API Status <span className="text-[10px] text-slate-600">↗</span></a></li>
          <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
        </ul>
      </div>
    </div>
    <div className="max-w-[1400px] mx-auto px-6 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-600 font-mono">
       <div>© 2024 VRWX Systems Inc. All rights reserved.</div>
       <div>v2.0.4-beta // MAINNET</div>
    </div>
  </footer>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const { t, lang, setLang } = useLanguage();
  

  return (
    <div className="min-h-screen font-sans text-slate-100 flex flex-col relative z-10 selection:bg-primary/30 selection:text-white">
      <CanvasNetwork />
      
      <header className="border-b border-white/5 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link to="/" className="flex items-center group">
              <img
                src="/logo.svg"
                alt="VRAIX"
                className="h-10 w-auto group-hover:opacity-90 transition-opacity"
              />
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/marketplace" icon={Globe}>{t.nav.market}</NavLink>
              <NavLink to="/quote" icon={Terminal}>{t.nav.quote}</NavLink>
              <NavLink to="/receipts" icon={ScrollText}>{t.nav.ledger}</NavLink>
              <NavLink to="/connect" icon={Code2}>{t.nav.uplink}</NavLink>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Language Switcher */}
             <button
                onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold font-mono border border-white/10 hover:border-primary/50 hover:bg-primary/10 text-slate-400 hover:text-white transition-all uppercase"
             >
                <Languages size={12} />
                {lang === 'en' ? 'EN' : '中文'}
             </button>

             {/* Auth Button */}
             <AuthButton />
             
             {/* Mobile Menu Button */}
             <button 
                className="md:hidden p-2 text-slate-400 hover:text-white"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
             </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {isMobileMenuOpen && (
           <div className="md:hidden absolute top-16 left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-white/10 animate-in slide-in-from-top-4">
              <div className="flex flex-col p-4 space-y-2">
                 <NavLink to="/marketplace" icon={Globe} onClick={() => setIsMobileMenuOpen(false)}>{t.nav.market}</NavLink>
                 <NavLink to="/quote" icon={Terminal} onClick={() => setIsMobileMenuOpen(false)}>{t.nav.quote}</NavLink>
                 <NavLink to="/receipts" icon={ScrollText} onClick={() => setIsMobileMenuOpen(false)}>{t.nav.ledger}</NavLink>
                 <NavLink to="/connect" icon={Code2} onClick={() => setIsMobileMenuOpen(false)}>{t.nav.uplink}</NavLink>
                 <div className="h-px bg-white/10 my-2"></div>
                 <NavLink to="/docs" icon={ScrollText} onClick={() => setIsMobileMenuOpen(false)}>{t.nav.docs}</NavLink>
                 
                 <Link to="/connect" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 bg-primary/10 text-primary border border-primary/20 text-sm font-bold justify-center mt-2">
                     {t.nav.uplink}
                   </Link>
              </div>
           </div>
        )}
      </header>

      <main className="flex-grow relative w-full">
        {children}
      </main>

      <Footer />

      {/* System Status Footer (Sticky) */}
      <div className="fixed bottom-0 left-0 right-0 h-8 bg-black/90 border-t border-white/10 backdrop-blur z-50 flex items-center px-4 justify-between">
         <SystemLog />
         <div className="text-[9px] text-slate-600 font-mono hidden sm:block">
            VRWX SYSTEMS INC. // ENCRYPTED CONNECTION
         </div>
      </div>
    </div>
  );
};
