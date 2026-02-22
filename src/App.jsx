import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";
import { 
  Lock, Unlock, Send, Key, MessageSquare, ShieldAlert, 
  ShieldCheck, LogOut, User, Image as ImageIcon, Loader2, 
  RefreshCw, Share2, Check, Users, Palette 
} from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyCpmpzHUaQgSa7pKdL19LQdVmmSkrGvsZ4",
  authDomain: "chat-b755a.firebaseapp.com",
  projectId: "chat-b755a",
  storageBucket: "chat-b755a.firebasestorage.app",
  messagingSenderId: "358836707315",
  appId: "1:358836707315:web:1d7cb59d6092b56956bc86",
  measurementId: "G-ESLX8Y6Z98"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// --- Web Crypto API ---
const deriveKey = async (password, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};
const encryptText = async (text, password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt); const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(text));
  const combined = new Uint8Array(16 + 12 + ciphertext.byteLength);
  combined.set(salt, 0); combined.set(iv, 16); combined.set(new Uint8Array(ciphertext), 28);
  return btoa(String.fromCharCode.apply(null, combined));
};
const decryptText = async (base64, password) => {
  try {
    const binary_string = atob(base64); const combined = new Uint8Array(binary_string.length);
    for (let i = 0; i < binary_string.length; i++) combined[i] = binary_string.charCodeAt(i);
    const salt = combined.slice(0, 16); const iv = combined.slice(16, 28); const ciphertext = combined.slice(28);
    const key = await deriveKey(password, salt);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext));
  } catch (e) { return null; }
};
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > 600) { h *= 600 / w; w = 600; } } else { if (h > 600) { w *= 600 / h; h = 600; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

// --- Themes Configuration ---
const themeStyles = {
  cyberpunk: {
    name: 'Cyberpunk',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    ring: 'focus:ring-cyan-400',
    bgLight: 'bg-cyan-500/10',
    btnGrad: 'from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500',
    sendBtn: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500',
    msgMine: 'from-cyan-600/30 to-blue-600/20 border-cyan-500/30 text-cyan-50',
    glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]',
    title: 'text-[#00ff41] drop-shadow-[0_0_10px_rgba(0,255,65,0.4)]'
  },
  matrix: {
    name: 'Matrix',
    text: 'text-green-400',
    border: 'border-green-500/30',
    ring: 'focus:ring-green-400',
    bgLight: 'bg-green-500/10',
    btnGrad: 'from-green-700 to-green-500 hover:from-green-600 hover:to-green-400',
    sendBtn: 'from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500',
    msgMine: 'from-green-600/30 to-emerald-600/20 border-green-500/30 text-green-50',
    glow: 'shadow-[0_0_15px_rgba(34,197,94,0.2)]',
    title: 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]'
  },
  crimson: {
    name: 'Crimson',
    text: 'text-red-500',
    border: 'border-red-500/30',
    ring: 'focus:ring-red-500',
    bgLight: 'bg-red-500/10',
    btnGrad: 'from-red-800 to-red-600 hover:from-red-700 hover:to-red-500',
    sendBtn: 'from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500',
    msgMine: 'from-red-600/30 to-orange-600/20 border-red-500/30 text-red-50',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.2)]',
    title: 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]'
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [themeMode, setThemeMode] = useState('cyberpunk');
  const t = themeStyles[themeMode]; // Active theme object
  
  const [displayName, setDisplayName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [activeUsers, setActiveUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Cycle through themes
  const toggleTheme = () => {
    const modes = Object.keys(themeStyles);
    const nextIndex = (modes.indexOf(themeMode) + 1) % modes.length;
    setThemeMode(modes[nextIndex]);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) setRoomId(params.get('room'));
  }, []);

  const generateRandomRoom = () => {
    const adj = ['silent', 'dark', 'hidden', 'crypto', 'neon', 'shadow'];
    const nouns = ['vault', 'nexus', 'ghost', 'signal', 'pulse', 'void'];
    setRoomId(`${adj[Math.floor(Math.random() * adj.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(`Join my secure CommsLink room!\n\nRoom: ${roomId}\nLink: ${window.location.origin}${window.location.pathname}?room=${roomId}\n\n(You need the secret key)`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const initAuth = async () => { try { await signInAnonymously(auth); } catch (err) { console.error(err); } };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- FAST 5-SECOND PRESENCE SYSTEM ---
  useEffect(() => {
    if (!user || !isJoined || !roomId) return;
    const presenceRef = collection(db, 'secure_rooms', roomId, 'presence');
    const userDoc = doc(presenceRef, user.uid);

    const setOnline = async () => await setDoc(userDoc, { uid: user.uid, displayName: displayName || 'Anonymous', lastSeen: Date.now() });
    setOnline();

    // Pulses every 5 seconds
    const interval = setInterval(() => setDoc(userDoc, { lastSeen: Date.now() }, { merge: true }), 5000);

    const unsubscribePresence = onSnapshot(presenceRef, (snapshot) => {
      const now = Date.now();
      const usersOnline = [];
      snapshot.forEach(doc => {
        // If they pulsed in the last 10 seconds, they are online
        if (now - doc.data().lastSeen < 10000) usersOnline.push(doc.data());
      });
      setActiveUsers(usersOnline);
    });

    return () => { clearInterval(interval); unsubscribePresence(); deleteDoc(userDoc).catch(()=>{}); };
  }, [user, isJoined, roomId, displayName]);

  // --- MESSAGES FETCH ---
  useEffect(() => {
    if (!user || !isJoined || !roomId || !encryptionKey) return;
    const unsubscribe = onSnapshot(collection(db, 'secure_rooms', roomId, 'messages'), async (snapshot) => {
      const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const processed = await Promise.all(raw.map(async (msg) => {
        const decrypted = await decryptText(msg.text, encryptionKey);
        return { ...msg, decryptedText: decrypted, isDecrypted: decrypted !== null, type: msg.type || 'text' };
      }));
      setMessages(processed);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [user, isJoined, roomId, encryptionKey]);

  const handleSendText = async (e) => {
    e.preventDefault(); if (!inputText.trim() || !user || !isJoined) return;
    const txt = inputText; setInputText('');
    try {
      const enc = await encryptText(txt, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: displayName || 'Anonymous', text: enc, type: 'text', timestamp: Date.now() });
    } catch (err) { console.error(err); }
  };

  const processAndSendImage = async (file) => {
    if (!file || !user || !isJoined) return;
    setIsUploading(true);
    try {
      const b64 = await compressImage(file); const enc = await encryptText(b64, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: displayName || 'Anonymous', text: enc, type: 'image', timestamp: Date.now() });
    } catch (err) { console.error(err); } finally { setIsUploading(false); }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim() && encryptionKey.trim()) { setIsJoined(true); window.history.replaceState({}, '', window.location.pathname); }
  };

  const handleLeave = async () => {
    setIsJoined(false); setMessages([]);
    if (user && roomId) await deleteDoc(doc(db, 'secure_rooms', roomId, 'presence', user.uid)).catch(()=>{});
  };

  const globalStyles = `@keyframes popIn { 0% { opacity: 0; transform: translateY(15px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } } .animate-pop-in { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }`;

  if (!user) return <div className="min-h-screen bg-[#050508] flex items-center justify-center"><div className="animate-pulse"><ShieldAlert className={`w-12 h-12 ${t.text}`} /></div></div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#050508] text-slate-200 flex items-center justify-center p-4 font-sans relative overflow-hidden animate-fade-in">
        <style>{globalStyles}</style>
        <div className="w-full max-w-md bg-[#0f0f14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 relative z-10 transition-all duration-500">
          
          <button onClick={toggleTheme} className={`absolute top-4 right-4 p-2 rounded-lg ${t.bgLight} ${t.text} hover:opacity-80 transition-all`} title="Change Theme">
            <Palette className="w-4 h-4" />
          </button>

          <div className="text-center mb-8">
            <h1 className={`text-4xl font-mono tracking-widest uppercase mb-2 transition-all ${t.title}`}>CommsLink</h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2"><ShieldCheck className={`w-4 h-4 ${t.text}`} /> {t.name} Protocol</p>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 group">
              <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><User className={`w-4 h-4 ${t.text}`} /> Display Name</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Agent Name" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-white/30 ${t.ring} focus:ring-1 outline-none transition-all`} />
            </div>
            <div className="flex flex-col gap-2 group">
              <label className="text-xs font-semibold text-slate-400 uppercase flex justify-between items-center">
                <span className="flex items-center gap-2"><MessageSquare className={`w-4 h-4 ${t.text}`} /> Channel ID</span>
                <button type="button" onClick={generateRandomRoom} className={`text-[10px] ${t.bgLight} ${t.text} px-2 py-1 rounded border ${t.border} flex items-center gap-1`}><RefreshCw className="w-3 h-3" /> Random</button>
              </label>
              <input type="text" required value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="e.g. shadow-vault-4092" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-white/30 ${t.ring} focus:ring-1 outline-none transition-all`} />
            </div>
            <div className="flex flex-col gap-2 group">
              <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><Key className={`w-4 h-4 ${t.text}`} /> Decryption Key</label>
              <input type="password" required value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Shared Secret" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-white/30 ${t.ring} focus:ring-1 outline-none transition-all`} />
            </div>
            <button type="submit" className={`mt-4 bg-gradient-to-r ${t.btnGrad} text-white font-bold py-3 rounded-lg ${t.glow} transform hover:-translate-y-0.5 transition-all flex justify-center items-center gap-2`}><Lock className="w-4 h-4" /> Connect</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050508] text-slate-200 flex flex-col font-sans animate-fade-in relative">
      <style>{globalStyles}</style>
      
      <header className="bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow}`}>
            <ShieldCheck className={`w-5 h-5 ${t.text}`} />
          </div>
          <div>
            <h2 className="font-mono text-lg font-bold text-slate-100">#{roomId}</h2>
            <p className="text-xs text-green-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Encrypted</p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          <button onClick={toggleTheme} className="text-slate-400 hover:text-white p-2 rounded-lg transition-all hidden sm:block" title="Theme"><Palette className="w-4 h-4" /></button>
          
          <button onClick={() => setShowUsers(!showUsers)} className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${showUsers ? `${t.bgLight} ${t.text} border ${t.border}` : 'bg-white/5 text-slate-300 border border-white/10'}`}>
            <Users className="w-4 h-4" /> {activeUsers.length} <span className="hidden sm:inline">Online</span>
          </button>

          {showUsers && (
            <div className="absolute top-12 right-0 w-48 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl p-2 animate-fade-in z-50">
              <h3 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-2 py-1 mb-1 border-b border-white/5">Active Agents</h3>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {activeUsers.map(u => (
                  <div key={u.uid} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 text-sm">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                    <span className="truncate">{u.displayName} {u.uid === user.uid ? '(You)' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={copyRoomLink} className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all hidden sm:flex ${copied ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-slate-300'}`}>
            {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          </button>
          <button onClick={handleLeave} className="text-slate-400 hover:text-red-400 p-2 rounded-lg hover:bg-white/5 transition-all"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="flex-1 relative flex flex-col overflow-hidden" onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }} onDrop={async (e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file?.type.startsWith('image/')) await processAndSendImage(file); }}>
        {isDragging && <div className={`absolute inset-0 z-40 bg-[#050508]/80 backdrop-blur-sm border-2 border-dashed ${t.border} flex flex-col items-center justify-center`}><ImageIcon className={`w-16 h-16 ${t.text} mb-4`} /><h3 className={`text-2xl font-mono ${t.text} tracking-wider`}>DROP IMAGE</h3></div>}
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          {messages.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50"><MessageSquare className="w-16 h-16 mb-4 animate-bounce" style={{animationDuration:'3s'}} /><p className="text-sm tracking-wide">Secure channel initialized...</p></div> : messages.map((msg) => {
            const isMine = msg.senderId === user.uid;
            return (
              <div key={msg.id} className={`animate-pop-in flex flex-col max-w-[85%] md:max-w-[70%] ${isMine ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className="text-[10px] text-slate-500 mb-1.5 ml-1">{msg.senderName} <span className="opacity-40">({msg.senderId.substring(0, 4)})</span></span>
                <div className={`p-1.5 rounded-2xl shadow-lg ${msg.isDecrypted ? isMine ? `bg-gradient-to-br ${t.msgMine} rounded-tr-sm border` : 'bg-[#1a1a24] border border-white/10 text-slate-200 rounded-tl-sm' : 'bg-red-900/20 border border-red-500/30 text-red-300 rounded-tl-sm font-mono'}`}>
                  {msg.isDecrypted ? (msg.type === 'image' ? <div className="relative group"><img src={msg.decryptedText} alt="Attached" className="max-w-full rounded-xl" style={{maxHeight:'350px'}} /></div> : <div className="px-4 py-2.5 text-[15px] whitespace-pre-wrap">{msg.decryptedText}</div>) : <div className="px-4 py-3 flex flex-col gap-2 text-xs"><div className="flex items-center gap-2 font-bold mb-1 border-b border-red-500/20 pb-2"><Lock className="w-3.5 h-3.5" /> ENCRYPTED</div><span className="opacity-50">{msg.text.substring(0, 80)}...</span></div>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      <div className="p-4 bg-[#0f0f14]/90 backdrop-blur-md border-t border-white/10 shrink-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <form onSubmit={handleSendText} className="max-w-4xl mx-auto flex gap-3 relative items-center">
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { const file = e.target.files[0]; if(file){ e.target.value=''; processAndSendImage(file); } }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={`p-3.5 text-slate-400 hover:${t.text} hover:bg-white/5 rounded-xl transition-all`}>
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          </button>
          <div className="relative flex-1">
            <div className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500`}><Unlock className="w-4 h-4" /></div>
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Secure message..." disabled={isUploading} className={`w-full bg-black/50 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm focus:border-white/30 ${t.ring} focus:ring-1 outline-none transition-all placeholder:text-slate-600`} />
          </div>
          <button type="submit" disabled={!inputText.trim() && !isUploading} className={`bg-gradient-to-r ${t.sendBtn} text-white rounded-xl px-6 py-3.5 flex items-center justify-center transition-all ${t.glow} transform hover:-translate-y-0.5 disabled:opacity-50`}><Send className="w-5 h-5" /></button>
        </form>
      </div>
    </div>
  );
}