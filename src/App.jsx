import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, query, where, getDocs, arrayUnion, orderBy, limit } from 'firebase/firestore';
import { 
  Lock, Unlock, Send, Key, MessageSquare, ShieldAlert, 
  ShieldCheck, LogOut, User, Loader2, Check, Users, 
  Palette, Reply, X, Smile, Mic, Square, Play, Pause, 
  ChevronLeft, Fingerprint, Search, Plus, Trash2, Settings, 
  Camera, PenLine, RefreshCw, Copy, Paperclip, CheckCheck, Flame, Clock, ChevronDown, Image as ImageIcon,
  ArrowDown, Sticker, Edit2, Phone, PhoneCall, PhoneOff, MicOff, Volume2
} from 'lucide-react';

// --- Firebase Initialization ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Web Crypto & Helpers ---
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

const parseMarkdown = (text) => {
  if (!text) return { __html: "" };
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;") 
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/~(.*?)~/g, '<del>$1</del>')
    .replace(/`(.*?)`/g, '<code class="bg-black/40 px-1.5 py-0.5 rounded text-cyan-400 font-mono text-[13px] border border-white/5 break-words">$1</code>')
    .replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300 break-all" onclick="event.stopPropagation()">$1</a>');
  return { __html: html };
};

// --- Web Audio Scrambler (Agent Walkie-Talkie Filter) ---
const makeDistortionCurve = (amount) => {
  const k = typeof amount === 'number' ? amount : 50, n_samples = 44100, curve = new Float32Array(n_samples), deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) { let x = i * 2 / n_samples - 1; curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x)); }
  return curve;
};

const setupMaskedAudio = async (rawStream) => {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(rawStream);
  
  const waveShaper = audioCtx.createWaveShaper();
  waveShaper.curve = makeDistortionCurve(400); // Heavy distortion
  waveShaper.oversample = '4x';

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 1000; // Muffles the voice to hide identity

  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = 300; // Removes bass rumble

  const destination = audioCtx.createMediaStreamDestination();

  source.connect(highpass); highpass.connect(lowpass); lowpass.connect(waveShaper); waveShaper.connect(destination);
  return { processedStream: destination.stream, audioCtx };
};

// --- Media Utils ---
const createStickerFromImage = (b64) => new Promise((res, rej) => { const i = new Image(); i.src = b64; i.onload = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d'); const s = Math.min(i.width, i.height); ctx.drawImage(i, (i.width-s)/2, (i.height-s)/2, s, s, 0, 0, 256, 256); res(c.toDataURL('image/webp', 0.8)); }; i.onerror = rej; });
const compressImage = (f) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const i = new Image(); i.src = e.target.result; i.onload = () => { const c = document.createElement('canvas'); let w = i.width, h = i.height; if(w>h){if(w>600){h*=600/w;w=600;}}else{if(h>600){w*=600/h;h=600;}} c.width=w; c.height=h; c.getContext('2d').drawImage(i,0,0,w,h); res(c.toDataURL('image/jpeg', 0.6)); }; i.onerror=rej; }; r.onerror=rej; });
const compressAvatar = (f) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const i = new Image(); i.src = e.target.result; i.onload = () => { const c = document.createElement('canvas'); let w = i.width, h = i.height; if(w>h){h*=150/w;w=150;}else{w*=150/h;h=150;} c.width=w; c.height=h; c.getContext('2d').drawImage(i,0,0,w,h); res(c.toDataURL('image/jpeg', 0.6)); }; i.onerror=rej; }; r.onerror=rej; });
const blobToBase64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(b); r.onloadend = () => res(r.result); r.onerror = rej; });
const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDay = (ts) => { const d = new Date(ts), t = new Date(), y = new Date(t); y.setDate(y.getDate()-1); if(d.toDateString()===t.toDateString()) return 'Today'; if(d.toDateString()===y.toDateString()) return 'Yesterday'; return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const isSameDay = (ts1, ts2) => new Date(ts1).toDateString() === new Date(ts2).toDateString();

// --- Sub-Components ---
const CustomAudioPlayer = ({ src, t }) => {
  const audioRef = useRef(null); const [isPlaying, setIsPlaying] = useState(false); const [progress, setProgress] = useState(0);
  const togglePlay = (e) => { e.stopPropagation(); if (isPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsPlaying(!isPlaying); };
  const handleTimeUpdate = () => { const c = audioRef.current.currentTime; const tot = audioRef.current.duration; setProgress(tot ? (c / tot) * 100 : 0); };
  return (
    <div className={`flex items-center gap-3 px-3 py-2 bg-black/40 rounded-xl border border-white/5 w-[200px] sm:w-[250px]`}>
      <button onClick={togglePlay} className={`w-8 h-8 flex items-center justify-center rounded-full ${t.bgLight} ${t.text} hover:opacity-80 transition-all shrink-0`}>
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
      </button>
      <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden relative">
        <div className={`absolute left-0 top-0 bottom-0 bg-gradient-to-r ${t.sendBtn} transition-all duration-75`} style={{ width: `${progress}%` }}></div>
      </div>
      <audio ref={audioRef} src={src} onTimeUpdate={handleTimeUpdate} onEnded={() => { setIsPlaying(false); setProgress(0); }} />
    </div>
  );
};

const themeStyles = {
  cyberpunk: { name: 'Cyberpunk', text: 'text-cyan-400', border: 'border-cyan-500/30', ring: 'focus:ring-cyan-400', bgLight: 'bg-cyan-500/10', btnGrad: 'from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500', sendBtn: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500', msgMine: 'from-cyan-600/30 to-blue-600/20 border-cyan-500/30 text-cyan-50', glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]', title: 'text-[#00ff41] drop-shadow-[0_0_10px_rgba(0,255,65,0.4)]', activeTab: 'bg-cyan-500/20 border-cyan-500/50 text-white' },
  matrix: { name: 'Matrix', text: 'text-green-400', border: 'border-green-500/30', ring: 'focus:ring-green-400', bgLight: 'bg-green-500/10', btnGrad: 'from-green-700 to-green-500 hover:from-green-600 hover:to-green-400', sendBtn: 'from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500', msgMine: 'from-green-600/30 to-emerald-600/20 border-green-500/30 text-green-50', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.2)]', title: 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]', activeTab: 'bg-green-500/20 border-green-500/50 text-white' },
  synthwave: { name: 'Synthwave', text: 'text-pink-400', border: 'border-pink-500/30', ring: 'focus:ring-pink-400', bgLight: 'bg-pink-500/10', btnGrad: 'from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400', sendBtn: 'from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500', msgMine: 'from-pink-600/30 to-purple-600/20 border-pink-500/30 text-pink-50', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]', title: 'text-pink-400 drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]', activeTab: 'bg-pink-500/20 border-pink-500/50 text-white' },
  terminal: { name: 'Terminal', text: 'text-amber-500', border: 'border-amber-500/30', ring: 'focus:ring-amber-500', bgLight: 'bg-amber-500/10', btnGrad: 'from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500', sendBtn: 'from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500', msgMine: 'from-amber-600/20 to-orange-600/10 border-amber-500/30 text-amber-100', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]', title: 'text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]', activeTab: 'bg-amber-500/20 border-amber-500/50 text-white' },
  stealth: { name: 'Stealth', text: 'text-slate-300', border: 'border-slate-500/30', ring: 'focus:ring-slate-400', bgLight: 'bg-slate-500/20', btnGrad: 'from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500', sendBtn: 'from-slate-600 to-gray-600 hover:from-slate-500 hover:to-gray-500', msgMine: 'from-slate-700/50 to-gray-700/30 border-slate-500/30 text-slate-100', glow: 'shadow-[0_0_15px_rgba(148,163,184,0.1)]', title: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]', activeTab: 'bg-slate-500/30 border-slate-500/50 text-white' },
  oceanic: { name: 'Oceanic', text: 'text-teal-400', border: 'border-teal-500/30', ring: 'focus:ring-teal-400', bgLight: 'bg-teal-500/10', btnGrad: 'from-blue-700 to-teal-500 hover:from-blue-600 hover:to-teal-400', sendBtn: 'from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500', msgMine: 'from-teal-600/30 to-blue-600/20 border-teal-500/30 text-teal-50', glow: 'shadow-[0_0_15px_rgba(45,212,191,0.2)]', title: 'text-teal-400 drop-shadow-[0_0_10px_rgba(45,212,191,0.4)]', activeTab: 'bg-teal-500/20 border-teal-500/50 text-white' }
};

const REACTION_EMOJIS = ['👍','❤️','😂','🔥','🥺','🎉','💯','🤔','👀','🙌','👏','🙏','✨','💀','😭','🤯','😡','🤢','🤡','👻','👽','🤖','💩','😎','🤓','🥳','😴','🙄','🤐','🤫','🤬','😈','✌️','🤘','👌','🤌','💪','🧠','🖕','🙂','🫦','🥵','🥶','🥴','🧊','🩸','🧪','📉'];

const AuthScreen = ({ t }) => {
  const [isLogin, setIsLogin] = useState(true); const [agentId, setAgentId] = useState(''); const [displayName, setDisplayName] = useState(''); const [password, setPassword] = useState(''); const [loading, setLoading] = useState(false);
  const handleAuth = async (e) => {
    e.preventDefault(); const safeId = agentId.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); if (safeId.length < 3) return alert("Agent ID must be at least 3 letters or numbers.");
    const phantomEmail = `${safeId}@commslink.network`; setLoading(true);
    try {
      if (isLogin) { await signInWithEmailAndPassword(auth, phantomEmail, password); } 
      else {
        const userCred = await createUserWithEmailAndPassword(auth, phantomEmail, password);
        const finalName = displayName.trim() || agentId.trim(); await updateProfile(userCred.user, { displayName: finalName });
        await setDoc(doc(db, 'users', userCred.user.uid), { uid: userCred.user.uid, agentId: safeId, displayName: finalName, avatarData: null, lastSeen: Date.now() });
      }
    } catch (error) { alert(error.message); }
    setLoading(false);
  };
  return (
    <div className="flex h-[100dvh] bg-[#050508] text-slate-200 flex-col items-center justify-center p-4 relative animate-fade-in">
      <div className="w-full max-w-md bg-[#0f0f14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 z-10">
        <div className="text-center mb-8"><ShieldAlert className={`w-12 h-12 ${t.text} mx-auto mb-4`} /><h1 className={`text-4xl font-mono tracking-widest uppercase mb-2 ${t.title}`}>CommsLink</h1><p className="text-xs text-slate-400 uppercase tracking-widest">Anonymous Network</p></div>
        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2"><label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><Fingerprint className={`w-4 h-4 ${t.text}`} /> Unique Agent ID</label><input type="text" required value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="e.g. Ghost47" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm ${t.ring} focus:ring-1 outline-none`} /></div>
          {!isLogin && (<div className="flex flex-col gap-2"><label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><User className={`w-4 h-4 ${t.text}`} /> Display Name (Optional)</label><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="What others see..." className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm ${t.ring} focus:ring-1 outline-none`} /></div>)}
          <div className="flex flex-col gap-2"><label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><Key className={`w-4 h-4 ${t.text}`} /> Master Password</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm ${t.ring} focus:ring-1 outline-none`} /></div>
          <button type="submit" disabled={loading} className={`mt-4 bg-gradient-to-r ${t.btnGrad} text-white font-bold py-3 rounded-lg ${t.glow} flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-95`}>{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLogin ? "Initialize Link" : "Claim Agent ID"}</button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-6 cursor-pointer hover:text-white transition-colors" onClick={() => setIsLogin(!isLogin)}>{isLogin ? "Need a new identity? Register here." : "Already have an Agent ID? Login here."}</p>
      </div>
    </div>
  );
};

const MessageItem = ({ msg, index, isMine, isGroup, isConsecutive, repliedMsg, hasReactions, isRead, user, t, themeMode, toggleReaction, activeMenu, setActiveMenu, setReplyingTo, setZoomedImage, saveSticker, showDayDivider, dayString, startEditing, deleteMessage }) => {
  const activeTouch = useRef({ startX: 0, timer: null, isLongPress: false }); const [isExpiring, setIsExpiring] = useState(false); const [isHidden, setIsHidden] = useState(false);
  useEffect(() => { if (msg.expiresAt) { const checkExpiry = () => { const timeLeft = msg.expiresAt - Date.now(); if (timeLeft <= 5000 && timeLeft > 0) setIsExpiring(true); if (timeLeft <= 0) setIsHidden(true); }; checkExpiry(); const timer = setInterval(checkExpiry, 1000); return () => clearInterval(timer); } }, [msg.expiresAt]);
  if (isHidden) return null;

  const bubbleSpacing = isConsecutive ? 'mt-1' : 'mt-4';
  const borderRadius = isMine ? (isConsecutive ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tr-sm') : (isConsecutive ? 'rounded-2xl rounded-tl-md' : 'rounded-2xl rounded-tl-sm');
  const zIndexClass = activeMenu === msg.id ? 'z-[100]' : 'z-10'; const msgTime = formatTime(msg.timestamp); const isSticker = msg.type === 'sticker';

  let ytIds = [];
  if (msg.isDecrypted && msg.type === 'text') {
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/gi;
    let match; while ((match = ytRegex.exec(msg.decryptedText)) !== null) { ytIds.push(match[1]); } ytIds = [...new Set(ytIds)];
  }

  return (
    <>
      {showDayDivider && (<div className="flex justify-center w-full my-4 z-0"><span className={`px-3 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full bg-black/60 border ${t.border} ${t.text} shadow-md`}>{dayString}</span></div>)}
      <div className={`flex flex-col max-w-[85%] md:max-w-[70%] relative group ${isMine ? 'self-end items-end' : 'self-start items-start'} ${bubbleSpacing} animate-pop-in ${isExpiring ? 'vanishing' : ''} ${zIndexClass}`}
        onTouchStart={e => { activeTouch.current.startX = e.targetTouches[0].clientX; activeTouch.current.isLongPress = false; activeTouch.current.timer = setTimeout(() => { activeTouch.current.isLongPress = true; if(navigator.vibrate) navigator.vibrate(40); setActiveMenu(msg.id); }, 450); }}
        onTouchMove={() => clearTimeout(activeTouch.current.timer)}
        onTouchEnd={e => { clearTimeout(activeTouch.current.timer); if (!activeTouch.current.isLongPress && e.changedTouches[0].clientX - activeTouch.current.startX > 60) setReplyingTo(msg); }}
      >
        <div className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${isMine ? 'right-full pr-3' : 'left-full pl-3'} items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto z-10`}>
          <button onClick={(e) => { e.stopPropagation(); setActiveMenu(msg.id === activeMenu ? null : msg.id); }} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} rounded-full hover:bg-white/10 shadow-lg`}><Smile className="w-4 h-4" /></button>
        </div>

        {activeMenu === msg.id && (
          <div className={`absolute ${isMine ? 'right-0' : 'left-0'} ${index < 3 ? 'top-full mt-2' : 'bottom-full mb-2'} bg-[#1a1a24]/95 border border-white/10 rounded-2xl p-3 z-[300] w-[270px] shadow-2xl glass-picker animate-pop-in`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-around mb-3 border-b border-white/10 pb-2">
              <button onClick={() => { setReplyingTo(msg); setActiveMenu(null); }} className="p-2 hover:bg-white/10 rounded-lg text-slate-300"><Reply className="w-4 h-4"/></button>
              {msg.isDecrypted && msg.type === 'image' && (<button onClick={() => { saveSticker(msg.decryptedText); setActiveMenu(null); }} className="p-2 hover:bg-white/10 rounded-lg text-orange-400"><Sticker className="w-4 h-4"/></button>)}
              {isMine && msg.type === 'text' && (<button onClick={() => { startEditing(msg); setActiveMenu(null); }} className="p-2 hover:bg-white/10 rounded-lg text-blue-400"><Edit2 className="w-4 h-4"/></button>)}
              {isMine && (<button onClick={() => { deleteMessage(msg.id); setActiveMenu(null); }} className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"><Trash2 className="w-4 h-4"/></button>)}
            </div>
            <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto custom-scrollbar">
              {REACTION_EMOJIS.map(emoji => (<button key={emoji} onClick={() => toggleReaction(msg.id, msg.reactions, emoji)} className="w-9 h-9 hover:bg-white/10 rounded-lg text-xl hover:scale-110">{emoji}</button>))}
            </div>
          </div>
        )}

        {!isConsecutive && !isSticker && (
          <div className="flex items-center gap-2 mb-1">
            {!isMine && isGroup && <span className="text-[10px] text-slate-500 ml-1">{msg.senderName}</span>}
            {msg.expiresAt && <span className="text-[10px] text-orange-400 flex items-center gap-0.5"><Flame className="w-3 h-3"/> Burns soon</span>}
          </div>
        )}

        {isSticker && msg.isDecrypted ? (
           <div className="relative group cursor-pointer" onClick={() => setZoomedImage(msg.decryptedText)}>
              <img src={msg.decryptedText} className="w-32 h-32 md:w-40 md:h-40 object-contain drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] transition-transform hover:scale-105" alt="Sticker" />
              <div className={`absolute -bottom-2 -right-2 bg-black/60 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-white/10`}>
                <span className="text-slate-300">{msgTime}</span>
                {isMine && !isGroup && (isRead ? <CheckCheck className="w-3 h-3 text-cyan-400" /> : <Check className="w-3 h-3 text-slate-400" />)}
              </div>
           </div>
        ) : (
          <div className={`p-1.5 shadow-lg relative max-w-full w-full ${borderRadius} ${msg.isDecrypted ? isMine ? `bg-gradient-to-br ${msg.expiresAt ? 'from-orange-600/30 to-red-600/20 border-orange-500/30 text-orange-50' : t.msgMine} border` : 'bg-[#1a1a24] border border-white/10 text-slate-200' : 'bg-red-900/20 border border-red-500/30 text-red-300'}`}>
            {repliedMsg && repliedMsg.isDecrypted && (
              <div className="mb-2 p-2 bg-black/30 rounded border-l-2 border-cyan-500/50 text-xs opacity-80 select-none overflow-hidden text-ellipsis">
                <span className={`font-bold ${t.text}`}>{repliedMsg.senderName}</span>
                <span className="truncate block max-w-[200px] mt-0.5">{repliedMsg.type === 'text' ? repliedMsg.decryptedText : `📷 Media`}</span>
              </div>
            )}
            
            {msg.isDecrypted ? (
              msg.type === 'image' ? ( <img src={msg.decryptedText} onClick={() => setZoomedImage(msg.decryptedText)} className="max-w-full rounded-xl cursor-zoom-in border border-white/5 object-contain" style={{maxHeight:'350px'}} /> ) : 
              msg.type === 'video' ? ( <video controls src={msg.decryptedText} className="max-w-full rounded-xl shadow-md border border-white/10 object-contain" style={{maxHeight:'350px'}} /> ) : 
              msg.type === 'video_loading' ? ( <div className="px-4 py-3 flex flex-col gap-2 min-w-[200px]"><div className={`flex items-center gap-2 font-bold mb-1 border-b border-white/10 pb-2 text-xs ${t.text}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> ASSEMBLING...</div><div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden"><div className={`h-full bg-gradient-to-r ${t.sendBtn} transition-all`} style={{width: `${(msg.progress/msg.total)*100}%`}}></div></div><span className="opacity-50 text-[10px] text-right">Packets: {msg.progress} / {msg.total}</span></div> ) : 
              msg.type === 'audio' ? ( <CustomAudioPlayer src={msg.decryptedText} t={t} /> ) : 
              (
                <div className="px-3 py-2 text-[15px] whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed">
                   <div dangerouslySetInnerHTML={parseMarkdown(msg.decryptedText)}></div>
                   {ytIds.length > 0 && ytIds.map(id => (
                     <div key={id} className="mt-3 w-full rounded-xl overflow-hidden border border-white/10 bg-black/50 aspect-video">
                       <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${id}`} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                     </div>
                   ))}
                </div>
              )
            ) : ( <div className="px-4 py-3 text-xs opacity-50"><Lock className="w-3.5 h-3.5 inline mr-1"/> BLOCKED/INVALID KEY</div> )}
          
            <div className={`flex items-center justify-end gap-1 mt-1 px-1 opacity-70`}>
              <span className="text-[9px] font-mono tracking-wider text-slate-300">{msgTime} {msg.isEdited && <span className="italic opacity-60 ml-0.5">(edited)</span>}</span>
              {isMine && !isGroup && (isRead ? <CheckCheck className="w-3.5 h-3.5 text-cyan-400" /> : <Check className="w-3.5 h-3.5 text-slate-400" />)}
            </div>
            {hasReactions && (
              <div className={`absolute -bottom-3 ${isMine ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-[60] animate-pop-in`}>
                {Object.entries(msg.reactions).map(([emoji, users]) => (<button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, msg.reactions, emoji); }} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border shadow-md transition-all active:scale-95 hover:scale-105 ${users.includes(user.uid) ? `${t.bgLight} ${t.border} ${t.text}` : 'bg-[#1a1a24] border-white/10 text-slate-300'}`}><span>{emoji}</span>{users.length > 1 && <span>{users.length}</span>}</button>))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// --- 3. THE CHAT INTERFACE & WEBRTC LOGIC ---
const ChatInterface = ({ user, usersList, threadId, chatData, encryptionKeys, goBack, changeKey, deleteChat, t, themeMode }) => {
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState(''); const [showSearch, setShowSearch] = useState(false);
  const [inputText, setInputText] = useState(''); const [isUploading, setIsUploading] = useState(false); const [uploadText, setUploadText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); const [editingMsg, setEditingMsg] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null); const [activeMenu, setActiveMenu] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false); const [newChatName, setNewChatName] = useState('');
  const [isDragging, setIsDragging] = useState(false); const dragCounter = useRef(0);
  const [msgLimit, setMsgLimit] = useState(30);
  const isTypingLocal = useRef(false); const typingTimeoutRef = useRef(null); const decryptionCache = useRef({}); 
  const [showBurnModal, setShowBurnModal] = useState(false); const [burnText, setBurnText] = useState(''); const [burnFile, setBurnFile] = useState(null); const [burnDuration, setBurnDuration] = useState(300000); const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false); const burnFileInputRef = useRef(null);
  const [showStickerPicker, setShowStickerPicker] = useState(false); const [savedStickers, setSavedStickers] = useState(() => JSON.parse(localStorage.getItem('commslink_stickers') || '[]'));
  const [showScrollButton, setShowScrollButton] = useState(false); const [unreadCount, setUnreadCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false); const [recordingTime, setRecordingTime] = useState(0); const mediaRecorderRef = useRef(null); const mediaStreamRef = useRef(null); const mediaChunksRef = useRef([]); const recordingTimerRef = useRef(null);
  const messagesContainerRef = useRef(null); const messagesEndRef = useRef(null); const fileInputRef = useRef(null); const prevMsgCount = useRef(0);

  // --- WebRTC States ---
  const [callState, setCallState] = useState('idle'); // idle, prompting, calling, ringing, connected
  const [isMasked, setIsMasked] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const peerConnection = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const callDurationTimer = useRef(null);

  const isGroup = chatData.isGroup;
  let chatName = "Unknown Channel"; let chatAvatar = null; let memberCount = chatData.participants?.length || 0;
  const otherUserId = isGroup ? null : chatData.participants.find(id => id !== user.uid);
  let someoneIsTyping = false; let typingName = '';
  if (chatData.typing) { const typists = Object.keys(chatData.typing).filter(id => id !== user.uid && chatData.typing[id]); if (typists.length > 0) { someoneIsTyping = true; const typistObj = usersList.find(u => u.uid === typists[0]); typingName = typistObj ? typistObj.displayName : 'Agent'; } }
  if (isGroup) { chatName = chatData.name || "Group Server"; } else { const otherUserAgent = usersList.find(u => u.uid === otherUserId); chatName = chatData.customName || otherUserAgent?.displayName || 'Unknown Agent'; chatAvatar = otherUserAgent?.avatarData || null; }

  // PUBLIC TURN/STUN SERVERS (No Account Needed)
  const iceServers = {
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  };

  useEffect(() => { setMsgLimit(30); setEditingMsg(null); setReplyingTo(null); setInputText(''); }, [threadId]);
  useEffect(() => { decryptionCache.current = {}; }, [encryptionKeys]);

  // --- WebRTC Signaling Listener ---
  useEffect(() => {
    if (isGroup) return;
    const callDocRef = doc(db, 'chat_threads', threadId, 'call_signal', 'data');
    const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.status === 'ringing' && data.callerId !== user.uid && callState === 'idle') {
        setCallState('ringing');
      } else if (data.status === 'answered' && data.callerId === user.uid && peerConnection.current) {
        const remoteDesc = new RTCSessionDescription(data.answer);
        await peerConnection.current.setRemoteDescription(remoteDesc);
        setCallState('connected'); startCallTimer();
      } else if (data.status === 'ended' && callState !== 'idle') {
        endCallLocally();
      }
    });
    return () => unsubscribe();
  }, [threadId, user.uid, callState, isGroup]);

  // --- WebRTC ICE Candidate Listener ---
  useEffect(() => {
    if (!peerConnection.current || callState === 'idle') return;
    const q = query(collection(db, 'chat_threads', threadId, 'call_candidates'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.senderId !== user.uid) {
            const candidate = new RTCIceCandidate(data.candidate);
            peerConnection.current.addIceCandidate(candidate).catch(e => console.error(e));
          }
        }
      });
    });
    return () => unsubscribe();
  }, [threadId, user.uid, callState]);

  const startCall = async (useMask) => {
    setIsMasked(useMask); setCallState('calling');
    peerConnection.current = new RTCPeerConnection(iceServers);
    
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) addDoc(collection(db, 'chat_threads', threadId, 'call_candidates'), { senderId: user.uid, candidate: event.candidate.toJSON() });
    };

    peerConnection.current.ontrack = (event) => {
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = event.streams[0]; remoteAudioRef.current.play(); }
    };

    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (useMask) {
        const { processedStream, audioCtx } = await setupMaskedAudio(rawStream);
        audioContextRef.current = audioCtx; localStreamRef.current = rawStream; 
        processedStream.getTracks().forEach(track => peerConnection.current.addTrack(track, processedStream));
      } else {
        localStreamRef.current = rawStream;
        rawStream.getTracks().forEach(track => peerConnection.current.addTrack(track, rawStream));
      }

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      await setDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'), { status: 'ringing', callerId: user.uid, offer: { type: offer.type, sdp: offer.sdp }, isMasked: useMask, timestamp: Date.now() });
      const oldCandidates = await getDocs(collection(db, 'chat_threads', threadId, 'call_candidates'));
      oldCandidates.forEach(c => deleteDoc(c.ref));

    } catch (err) { alert("Mic access denied."); endCallLocally(); }
  };

  const answerCall = async () => {
    peerConnection.current = new RTCPeerConnection(iceServers);
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) addDoc(collection(db, 'chat_threads', threadId, 'call_candidates'), { senderId: user.uid, candidate: event.candidate.toJSON() });
    };
    peerConnection.current.ontrack = (event) => {
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = event.streams[0]; remoteAudioRef.current.play(); }
    };

    try {
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = rawStream;
      rawStream.getTracks().forEach(track => peerConnection.current.addTrack(track, rawStream));

      const callDoc = await getDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'));
      const callData = callDoc.data();

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      await updateDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'), { status: 'answered', answer: { type: answer.type, sdp: answer.sdp } });
      setCallState('connected'); startCallTimer();
    } catch (err) { alert("Failed to answer. Mic needed."); endCallLocally(); }
  };

  const endCall = async () => {
    await setDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'), { status: 'ended' });
    endCallLocally();
  };

  const endCallLocally = () => {
    if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(track => track.stop()); localStreamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    clearInterval(callDurationTimer.current); setCallDuration(0); setIsMuted(false); setCallState('idle');
  };

  const startCallTimer = () => { setCallDuration(0); callDurationTimer.current = setInterval(() => setCallDuration(prev => prev + 1), 1000); };
  const formatCallTime = (seconds) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMuted(!audioTrack.enabled); }
    }
  };

  // --- Message Fetching & Chat Logic ---
  useEffect(() => {
    if (threadId && user && messages.length > 0 && !showScrollButton) updateDoc(doc(db, 'chat_threads', threadId), { [`lastRead.${user.uid}`]: Date.now() }).catch(()=>{});
  }, [threadId, user, messages.length, showScrollButton]); 

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      if (showScrollButton && prevMsgCount.current > 0) setUnreadCount(prev => prev + (messages.length - prevMsgCount.current));
      else setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, showScrollButton]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollButton(isScrolledUp);
    if (!isScrolledUp) { setUnreadCount(0); if (messages.length > 0) updateDoc(doc(db, 'chat_threads', threadId), { [`lastRead.${user.uid}`]: Date.now() }).catch(()=>{}); }
    if (scrollTop === 0) setMsgLimit(prevLimit => prevLimit + 30);
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollButton(false); setUnreadCount(0); };

  useEffect(() => {
    const q = query(collection(db, 'chat_threads', threadId, 'messages'), orderBy('timestamp', 'desc'), limit(msgLimit));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const now = Date.now(); const validRaw = [];
      raw.forEach(msg => { if (msg.expiresAt && msg.expiresAt <= now) deleteDoc(doc(db, 'chat_threads', threadId, 'messages', msg.id)).catch(()=>{}); else validRaw.push(msg); });
      validRaw.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      
      const videoGroups = {}; const normalMessages = [];
      validRaw.forEach(msg => { if (msg.type === 'video_chunk') { if (!videoGroups[msg.videoGroupId]) videoGroups[msg.videoGroupId] = []; videoGroups[msg.videoGroupId].push(msg); } else normalMessages.push(msg); });

      const assembledVideos = [];
      for (const [groupId, chunks] of Object.entries(videoGroups)) {
        const total = chunks[0].totalChunks;
        if (chunks.length === total) {
          chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
          const fullEncText = chunks.map(c => c.text).join('');
          assembledVideos.push({ id: groupId, senderId: chunks[0].senderId, senderName: chunks[0].senderName, type: 'video', text: fullEncText, timestamp: chunks[0].timestamp, replyToId: chunks[0].replyToId, reactions: chunks[0].reactions || {}, expiresAt: chunks[0].expiresAt });
        } else { assembledVideos.push({ id: groupId, senderId: chunks[0].senderId, senderName: chunks[0].senderName, type: 'video_loading', progress: chunks.length, total: total, timestamp: chunks[0].timestamp }); }
      }

      const combinedRaw = [...normalMessages, ...assembledVideos].sort((a, b) => a.timestamp - b.timestamp);
      
      const processed = await Promise.all(combinedRaw.map(async (msg) => {
        if (msg.type === 'video_loading') return { ...msg, isDecrypted: true };
        if (decryptionCache.current[msg.id] && msg.isEdited && decryptionCache.current[`${msg.id}_edited`] !== msg.text) delete decryptionCache.current[msg.id];
        if (decryptionCache.current[msg.id]) return { ...msg, decryptedText: decryptionCache.current[msg.id], isDecrypted: true };

        let decrypted = null;
        for (const k of encryptionKeys) { decrypted = await decryptText(msg.text, k); if (decrypted !== null) break; }
        if (decrypted !== null) { decryptionCache.current[msg.id] = decrypted; if(msg.isEdited) decryptionCache.current[`${msg.id}_edited`] = msg.text; }
        return { ...msg, decryptedText: decrypted, isDecrypted: decrypted !== null };
      }));
      setMessages(processed);
    });
    return () => unsubscribe();
  }, [threadId, encryptionKeys, msgLimit]);

  const handleTypingChange = (e) => {
    setInputText(e.target.value);
    if (!isTypingLocal.current && e.target.value.trim() !== '') { isTypingLocal.current = true; updateDoc(doc(db, 'chat_threads', threadId), { [`typing.${user.uid}`]: true }).catch(()=>{}); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { isTypingLocal.current = false; updateDoc(doc(db, 'chat_threads', threadId), { [`typing.${user.uid}`]: false }).catch(()=>{}); }, 2000);
  };

  const handleRenameChat = async (e) => { e.preventDefault(); if (!newChatName.trim()) { setIsEditingName(false); return; } try { await updateDoc(doc(db, 'chat_threads', threadId), { [isGroup ? 'name' : 'customName']: newChatName.trim() }); setIsEditingName(false); } catch (err) { alert("Failed to rename channel."); } };

  const handleSendText = async (e) => {
    e.preventDefault(); if (!inputText.trim() || !user) return;
    const txt = inputText; setInputText(''); const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    const activeKey = encryptionKeys[encryptionKeys.length - 1];

    clearTimeout(typingTimeoutRef.current);
    if (isTypingLocal.current) { isTypingLocal.current = false; updateDoc(doc(db, 'chat_threads', threadId), { [`typing.${user.uid}`]: false }).catch(()=>{}); }

    try {
      const enc = await encryptText(txt, activeKey);
      if (editingMsg) { await updateDoc(doc(db, 'chat_threads', threadId, 'messages', editingMsg.id), { text: enc, isEdited: true }); setEditingMsg(null); } 
      else { await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: replyId, reactions: {}, expiresAt: null, isEdited: false }); }
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }); 
      if(!editingMsg) scrollToBottom();
    } catch (err) { console.error(err); }
  };

  const startEditing = (msg) => { setEditingMsg(msg); setReplyingTo(null); setInputText(msg.decryptedText); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const deleteMessage = async (msgId) => { try { await deleteDoc(doc(db, 'chat_threads', threadId, 'messages', msgId)); } catch(err) { alert("Failed to delete message."); } };

  const handleSendSticker = async (webpBase64) => {
    setShowStickerPicker(false); const activeKey = encryptionKeys[encryptionKeys.length - 1];
    try {
      const enc = await encryptText(webpBase64, activeKey);
      await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'sticker', timestamp: Date.now(), replyToId: replyingTo ? replyingTo.id : null, reactions: {}, expiresAt: null });
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
      setReplyingTo(null); scrollToBottom();
    } catch (err) { alert("Failed to deploy sticker."); }
  };

  const processAndSendMedia = async (file, burnOverride = null) => {
    if (!file || !user) return; setIsUploading(true); const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    const activeKey = encryptionKeys[encryptionKeys.length - 1]; const expiryTimestamp = burnOverride ? Date.now() + Number(burnOverride) : null;
    try {
      if (file.type.startsWith('video/')) {
        if (file.size > 15 * 1024 * 1024) { alert("Max size is 15MB."); setIsUploading(false); return; }
        setUploadText("Shredding..."); const base64Vid = await blobToBase64(file); setUploadText("Encrypting..."); const encVid = await encryptText(base64Vid, activeKey);
        const CHUNK_SIZE = 700000; const totalChunks = Math.ceil(encVid.length / CHUNK_SIZE); const videoGroupId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        for (let i = 0; i < totalChunks; i++) { setUploadText(`Packet ${i+1}/${totalChunks}...`); const chunkText = encVid.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, type: 'video_chunk', videoGroupId, chunkIndex: i, totalChunks, text: chunkText, timestamp: Date.now() + i, replyToId: replyId, reactions: {}, expiresAt: expiryTimestamp }); }
        await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
      } else if (file.type.startsWith('image/')) {
        setUploadText("Compressing..."); const b64 = await compressImage(file); const enc = await encryptText(b64, activeKey);
        await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'image', timestamp: Date.now(), replyToId: replyId, reactions: {}, expiresAt: expiryTimestamp });
        await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
      }
    } catch (err) { alert("Failed to send media."); } finally { setIsUploading(false); setUploadText(''); scrollToBottom(); }
  };

  const handleSendBurnMessage = async (e) => {
    e.preventDefault(); if (!user || (!burnText.trim() && !burnFile)) return; setShowBurnModal(false);
    const activeKey = encryptionKeys[encryptionKeys.length - 1]; const expiryTimestamp = Date.now() + Number(burnDuration);
    if (burnText.trim()) { try { const enc = await encryptText(burnText, activeKey); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: null, reactions: {}, expiresAt: expiryTimestamp }); await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }); } catch (err) { console.error(err); } }
    if (burnFile) await processAndSendMedia(burnFile, burnDuration); setBurnText(''); setBurnFile(null); scrollToBottom();
  };

  const saveStickerToVault = async (base64Str) => { try { const webpStr = await createStickerFromImage(base64Str); let newVault = [webpStr, ...savedStickers]; if (newVault.length > 20) newVault = newVault.slice(0, 20); setSavedStickers(newVault); localStorage.setItem('commslink_stickers', JSON.stringify(newVault)); alert("Added to Sticker Vault."); } catch(err) { alert("Failed to process sticker."); } };

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0; if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { const file = e.dataTransfer.files[0]; if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { alert("Only images and videos are allowed."); return; } processAndSendMedia(file); } };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } }); mediaStreamRef.current = stream;
      let options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 12000 }; if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm', audioBitsPerSecond: 12000 };
      const mediaRecorder = new MediaRecorder(stream, options); mediaRecorderRef.current = mediaRecorder; mediaChunksRef.current = []; const activeKey = encryptionKeys[encryptionKeys.length - 1];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) mediaChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        setIsUploading(true); setUploadText("Encrypting Audio..."); clearInterval(recordingTimerRef.current); setRecordingTime(0);
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' }); mediaStreamRef.current.getTracks().forEach(track => track.stop()); 
        try { const base64Audio = await blobToBase64(blob); const encAudio = await encryptText(base64Audio, activeKey); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: encAudio, type: 'audio', timestamp: Date.now(), replyToId: replyingTo ? replyingTo.id : null, reactions: {}, expiresAt: null }); await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }); setReplyingTo(null); scrollToBottom(); } catch (error) { alert("Failed to send audio."); }
        setIsUploading(false); setUploadText('');
      };
      mediaRecorder.start(); setIsRecording(true); recordingTimerRef.current = setInterval(() => { setRecordingTime((prev) => { if (prev >= 59) { stopRecording(); return 0; } return prev + 1; }); }, 1000);
    } catch (error) { alert("Mic access denied."); }
  };
  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); clearInterval(recordingTimerRef.current); } };

  const toggleReaction = async (msgId, currentReactions = {}, emoji) => {
    setActiveMenu(null); const emojiUsers = currentReactions[emoji] || []; const hasReacted = emojiUsers.includes(user.uid);
    let newEmojiUsers = hasReacted ? emojiUsers.filter(id => id !== user.uid) : [...emojiUsers, user.uid];
    const updatedReactions = { ...currentReactions, [emoji]: newEmojiUsers }; if (newEmojiUsers.length === 0) delete updatedReactions[emoji];
    await updateDoc(doc(db, 'chat_threads', threadId, 'messages', msgId), { reactions: updatedReactions });
  };

  const filteredMessages = searchQuery.trim() ? messages.filter(m => m.isDecrypted && m.type === 'text' && m.decryptedText?.toLowerCase().includes(searchQuery.toLowerCase())) : messages;
  const burnTimeOptions = [ { label: '1 Minute', val: 60000 }, { label: '5 Minutes', val: 300000 }, { label: '1 Hour', val: 3600000 }, { label: '24 Hours', val: 86400000 } ];

  return (
    <div className="flex-1 flex flex-col relative bg-[#050508] min-h-0 overflow-x-hidden" onClick={() => { setActiveMenu(null); setIsTimeDropdownOpen(false); setShowStickerPicker(false); }} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      <audio ref={remoteAudioRef} autoPlay />

      {/* --- WEBRTC CALLING OVERLAYS --- */}
      {callState === 'prompting' && (
        <div className="absolute inset-0 z-[500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
          <ShieldAlert className={`w-16 h-16 ${t.text} mb-6`} />
          <h2 className="text-2xl font-mono text-white mb-2 text-center">Secure Uplink</h2>
          <p className="text-sm text-slate-400 mb-8 text-center max-w-sm">Apply cryptographic voice masking to your audio stream? This severely distorts the audio to prevent voice-print identification.</p>
          <div className="flex flex-col w-full max-w-xs gap-3">
            <button onClick={() => startCall(true)} className={`py-4 rounded-xl bg-gradient-to-r ${t.btnGrad} text-white font-bold shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center gap-2`}><MicOff className="w-5 h-5"/> Initiate Masked Call</button>
            <button onClick={() => startCall(false)} className="py-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors flex items-center justify-center gap-2"><Volume2 className="w-5 h-5"/> Standard Encrypted Call</button>
            <button onClick={() => setCallState('idle')} className="mt-4 py-3 text-slate-500 hover:text-white font-bold">Cancel</button>
          </div>
        </div>
      )}

      {callState === 'calling' && (
        <div className="absolute inset-0 z-[500] bg-[#0a0a0f] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className={`w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 animate-pulse`}><PhoneCall className={`w-10 h-10 ${t.text}`} /></div>
          <h2 className="text-xl font-bold text-white mb-2">Calling Agent...</h2>
          <p className="text-xs text-slate-500 mb-12">Establishing P2P WebRTC Handshake</p>
          <button onClick={endCall} className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-transform hover:scale-110"><PhoneOff className="w-6 h-6 text-white" /></button>
        </div>
      )}

      {callState === 'ringing' && (
        <div className="absolute inset-0 z-[500] bg-[#0a0a0f] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className={`w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 animate-bounce`}><Phone className={`w-10 h-10 ${t.text}`} /></div>
          <h2 className="text-xl font-bold text-white mb-2">Incoming Secure Call</h2>
          <p className="text-xs text-slate-500 mb-12">End-to-End Encrypted Voice</p>
          <div className="flex gap-8">
            <button onClick={endCall} className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-transform hover:scale-110"><PhoneOff className="w-6 h-6 text-white" /></button>
            <button onClick={answerCall} className="w-16 h-16 bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.4)] transition-transform hover:scale-110 animate-pulse"><Phone className="w-6 h-6 text-white" /></button>
          </div>
        </div>
      )}

      {callState === 'connected' && (
        <div className="absolute inset-0 z-[500] bg-[#0a0a0f] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className={`w-24 h-24 rounded-full bg-black border ${isMuted ? 'border-amber-500/50' : 'border-green-500/50'} flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(34,197,94,0.2)]`}><User className={`w-10 h-10 ${isMuted ? 'text-amber-500' : 'text-green-400'}`} /></div>
          <h2 className="text-xl font-bold text-white mb-1">Link Established</h2>
          <p className="text-2xl font-mono text-green-400 mb-12">{formatCallTime(callDuration)}</p>
          <div className="flex gap-6">
             <button onClick={toggleMute} className={`w-16 h-16 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${isMuted ? 'bg-amber-500/20 text-amber-500 border border-amber-500/50' : 'bg-white/10 text-white'}`}>{isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}</button>
             <button onClick={endCall} className="w-16 h-16 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-transform hover:scale-110"><PhoneOff className="w-6 h-6 text-white" /></button>
          </div>
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-[200] bg-black/60 backdrop-blur-sm m-4 rounded-2xl border-2 border-dashed border-cyan-500 flex items-center justify-center pointer-events-none transition-all animate-fade-in">
          <div className="bg-[#1a1a24] p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-pop-in"><Paperclip className={`w-12 h-12 ${t.text} animate-bounce`} /><h2 className={`text-xl font-bold font-mono tracking-widest ${t.text}`}>DROP TO ENCRYPT & SEND</h2><p className="text-slate-400 text-sm">Supported formats: Images & Videos</p></div>
        </div>
      )}
      {zoomedImage && (<div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-pointer animate-fade-in" onClick={() => setZoomedImage(null)}><img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" onClick={e => e.stopPropagation()} /></div>)}

      {showBurnModal && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold text-orange-500 flex items-center gap-2"><Flame className="w-5 h-5" /> Send Burn Message</h3><button onClick={() => { setShowBurnModal(false); setBurnFile(null); }} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            <p className="text-xs text-slate-400 mb-4">Content securely self-destructs after the timer expires.</p>
            <form onSubmit={handleSendBurnMessage}>
              {burnFile ? (
                <div className="relative mb-4 w-full h-32 bg-black/40 rounded-xl border border-orange-500/30 flex items-center justify-center overflow-hidden group">
                  {burnFile.type.startsWith('image/') ? <img src={URL.createObjectURL(burnFile)} className="w-full h-full object-cover opacity-60" /> : <div className="flex flex-col items-center text-orange-400 opacity-60"><Play className="w-8 h-8 mb-2" /><span>{burnFile.name}</span></div>}
                  <button type="button" onClick={() => setBurnFile(null)} className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-red-500/80 transition-all"><X className="w-4 h-4"/></button>
                </div>
              ) : ( <textarea autoFocus value={burnText} onChange={(e) => setBurnText(e.target.value)} placeholder="Type confidential message..." rows="4" className="w-full bg-black/50 border border-orange-500/30 rounded-xl px-4 py-3 mb-4 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 resize-none text-sm text-white custom-scrollbar"></textarea> )}
              <div className="flex items-center gap-2 mb-6">
                {!burnFile && !burnText && ( <><input type="file" accept="image/*,video/*" className="hidden" ref={burnFileInputRef} onChange={e => { if(e.target.files[0]) setBurnFile(e.target.files[0]); }} /><button type="button" onClick={() => burnFileInputRef.current?.click()} className="p-3 bg-black/40 border border-white/5 rounded-xl text-slate-400 hover:text-orange-400 hover:border-orange-500/30 transition-all"><ImageIcon className="w-5 h-5" /></button></> )}
                <div className="relative flex-1">
                  <div onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)} className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5 cursor-pointer hover:border-white/20 transition-all"><div className="flex items-center gap-2 text-slate-200 text-sm"><Clock className="w-4 h-4 text-slate-400" /> {burnTimeOptions.find(o => o.val === Number(burnDuration))?.label}</div><ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} /></div>
                  {isTimeDropdownOpen && ( <ul className="absolute bottom-full left-0 w-full mb-2 bg-[#222230] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[210] animate-fade-in">{burnTimeOptions.map((opt) => (<li key={opt.val} onClick={() => { setBurnDuration(opt.val); setIsTimeDropdownOpen(false); }} className={`px-4 py-3 text-sm cursor-pointer hover:bg-orange-500/20 transition-colors ${burnDuration === opt.val ? 'text-orange-400 font-bold bg-orange-500/10' : 'text-slate-300'}`}>{opt.label}</li>))}</ul> )}
                </div>
              </div>
              <button type="submit" disabled={!burnText.trim() && !burnFile} className={`w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold text-sm shadow-lg shadow-red-500/20 disabled:opacity-50 transition-all`}>Deploy Secret</button>
            </form>
          </div>
        </div>
      )}

      {isEditingName && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <h3 className={`text-xl font-bold mb-1 ${t.text}`}>Rename Channel</h3><p className="text-xs text-slate-400 mb-4">Assign a new identity to this secure link.</p>
            <form onSubmit={handleRenameChat}>
              <input type="text" autoFocus required value={newChatName} onChange={(e) => setNewChatName(e.target.value)} className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-4 outline-none focus:border-white/30 ${t.ring} focus:ring-1`} />
              <div className="flex gap-2"><button type="button" onClick={() => setIsEditingName(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm">Cancel</button><button type="submit" className={`flex-1 py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg`}>Update</button></div>
            </form>
          </div>
        </div>
      )}

      <header className="bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between z-30 shrink-0 shadow-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <button onClick={goBack} className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10"><ChevronLeft className="w-6 h-6" /></button>
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow} overflow-hidden shrink-0`}>
            {isGroup ? <Users className={`w-5 h-5 ${t.text}`} /> : (chatAvatar ? <img src={chatAvatar} className="w-full h-full object-cover" /> : <User className={`w-5 h-5 ${t.text}`} />)}
          </div>
          <div className="flex flex-col truncate pr-2 group cursor-pointer" onClick={() => { setNewChatName(chatName); setIsEditingName(true); }}>
            <h2 className="font-mono text-md font-bold text-slate-100 flex items-center gap-2 truncate">{chatName} <PenLine className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" /></h2>
            <p className="text-[10px] text-green-400 flex items-center gap-1">{someoneIsTyping ? (<span className={`${t.text} animate-pulse font-bold`}>{typingName} is typing...</span>) : (<><Lock className="w-3 h-3" /> {isGroup ? `${memberCount} Agents` : 'E2E Encrypted'}</>)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isGroup && (<button onClick={initiateCallPrompt} className={`p-2 rounded-lg transition-all text-slate-500 hover:text-green-400 hover:bg-green-500/10 mr-1`} title="Secure Voice Call"><PhoneCall className="w-4 h-4" /></button>)}
          <button onClick={changeKey} className={`p-2 rounded-lg transition-all text-slate-500 hover:text-white hover:bg-white/5`} title="Update Encryption Key"><Key className="w-4 h-4" /></button>
          <button onClick={() => setShowBurnModal(true)} className={`p-2 rounded-lg transition-all text-slate-500 hover:text-orange-400 hover:bg-orange-500/10`} title="Send Burn Message"><Flame className="w-4 h-4" /></button>
          <button onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); }} className={`p-2 rounded-lg transition-all ${showSearch ? 'text-white bg-white/10' : 'text-slate-500 hover:text-white hover:bg-white/5'}`} title="Search Messages"><Search className="w-4 h-4" /></button>
          <button onClick={() => deleteChat(threadId, isGroup)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title={isGroup ? "Leave Group" : "Delete Chat"}><Trash2 className="w-4 h-4" /></button>
        </div>
      </header>

      {showSearch && (
        <div className="bg-[#1a1a24] border-b border-white/5 p-2 px-4 flex items-center gap-2 animate-slide-up origin-top">
          <Search className="w-4 h-4 text-slate-400" /><input type="text" autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search decrypted messages..." className="w-full bg-transparent outline-none text-sm text-white placeholder:text-slate-500" /><button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 flex flex-col custom-scrollbar min-h-0 relative" onScroll={handleScroll} ref={messagesContainerRef}>
        {filteredMessages.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50"><ShieldCheck className="w-16 h-16 mb-4" /><p className="text-sm">{searchQuery ? 'No matches found.' : 'Secure channel established.'}</p></div> : 
        filteredMessages.map((msg, index) => {
          const isMine = msg.senderId === user.uid; const repliedMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
          const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0; const isRead = !isGroup && chatData.lastRead && chatData.lastRead[otherUserId] >= msg.timestamp;
          const prevMsg = index > 0 ? filteredMessages[index - 1] : null; const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId && (msg.timestamp - prevMsg.timestamp < 300000);
          let showDayDivider = false; let dayString = ''; if (index === 0) { showDayDivider = true; dayString = formatDay(msg.timestamp); } else if (!isSameDay(prevMsg.timestamp, msg.timestamp)) { showDayDivider = true; dayString = formatDay(msg.timestamp); }
          return (
            <MessageItem key={msg.id} index={index} msg={msg} isMine={isMine} isGroup={isGroup} isConsecutive={isConsecutive} repliedMsg={repliedMsg} hasReactions={hasReactions} isRead={isRead} user={user} t={t} themeMode={themeMode} toggleReaction={toggleReaction} activeMenu={activeMenu} setActiveMenu={setActiveMenu} setReplyingTo={setReplyingTo} setZoomedImage={setZoomedImage} saveSticker={saveStickerToVault} showDayDivider={showDayDivider} dayString={dayString} startEditing={startEditing} deleteMessage={deleteMessage} />
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {showScrollButton && (
        <button onClick={scrollToBottom} className={`absolute bottom-20 right-4 p-3 rounded-full bg-gradient-to-r ${t.sendBtn} text-white shadow-[0_0_15px_rgba(0,0,0,0.8)] border border-white/20 transition-all hover:scale-110 z-40 animate-pop-in group`}>
          <ArrowDown className="w-5 h-5 group-hover:animate-bounce" />{unreadCount > 0 && ( <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] border border-[#050508] animate-pulse">{unreadCount}</span> )}
        </button>
      )}

      <div className="bg-[#0f0f14]/90 backdrop-blur-md border-t border-white/10 z-20 shrink-0 pb-safe">
        {replyingTo && (
          <div className="px-6 py-3 bg-[#1a1a24]/90 border-b border-cyan-500/30 flex items-center justify-between text-sm animate-bouncy-slide-up origin-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.3)]">
            <div className="flex flex-col border-l-2 border-cyan-500 pl-3"><span className={`text-xs font-bold ${t.text}`}>Replying to {replyingTo.senderName}</span><span className="text-slate-400 text-xs truncate max-w-[200px] mt-0.5">{replyingTo.type === 'text' ? replyingTo.decryptedText : 'Media'}</span></div><button onClick={() => setReplyingTo(null)} className="p-2 text-slate-400 hover:text-red-400 bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
          </div>
        )}

        {editingMsg && (
          <div className="px-6 py-3 bg-[#1a1a24]/90 border-b border-blue-500/30 flex items-center justify-between text-sm animate-bouncy-slide-up origin-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.3)]">
            <div className="flex flex-col border-l-2 border-blue-500 pl-3"><span className={`text-xs font-bold text-blue-400`}>Editing Message</span><span className="text-slate-400 text-xs truncate max-w-[200px] mt-0.5">{editingMsg.decryptedText}</span></div><button onClick={() => { setEditingMsg(null); setInputText(''); }} className="p-2 text-slate-400 hover:text-red-400 bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
          </div>
        )}

        {showStickerPicker && (
          <div className="p-4 bg-[#1a1a24] border-b border-white/5 h-48 overflow-y-auto custom-scrollbar animate-slide-up origin-bottom" onClick={e => e.stopPropagation()}>
            <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-3 px-1">Your Sticker Vault</h4>
            {savedStickers.length === 0 ? ( <p className="text-sm text-slate-500 italic px-1">Vault empty. Long press a photo and click the sticker icon to save.</p> ) : ( <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">{savedStickers.map((stk, i) => ( <img key={i} src={stk} onClick={() => handleSendSticker(stk)} className="w-full h-16 object-contain cursor-pointer hover:scale-110 transition-transform drop-shadow-md bg-black/20 rounded-lg p-1" alt="sticker" /> ))}</div> )}
          </div>
        )}

        <div className="p-3 sm:p-4 flex gap-2 relative items-center">
          {!isRecording && (
            <div className="flex items-center gap-1 shrink-0">
              <input type="file" accept="image/*,video/*" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) { if (!e.target.files[0].type.startsWith('image/') && !e.target.files[0].type.startsWith('video/')) { alert("Only images and videos are allowed."); return; } processAndSendMedia(e.target.files[0]); e.target.value=''; } }} />
              <button onClick={() => fileInputRef.current?.click()} className={`p-2 sm:p-2.5 text-slate-400 hover:${t.text} rounded-xl hover:bg-white/5 transition-colors`}><Paperclip className="w-5 h-5" /></button>
              <button onClick={(e) => { e.stopPropagation(); setShowStickerPicker(!showStickerPicker); }} className={`p-2 sm:p-2.5 ${showStickerPicker ? t.text : 'text-slate-400'} hover:${t.text} rounded-xl hover:bg-white/5 transition-colors`}><Sticker className="w-5 h-5" /></button>
              <button onClick={startRecording} className={`p-2 sm:p-2.5 text-slate-400 hover:${t.text} rounded-xl hover:bg-white/5 transition-colors`}><Mic className="w-5 h-5" /></button>
            </div>
          )}
          {isUploading && uploadText ? ( <div className={`flex-1 flex justify-between bg-black/50 border border-white/10 rounded-xl px-4 py-3 animate-pulse overflow-hidden`}><span className={`font-bold tracking-widest text-xs flex items-center gap-2 ${t.text} truncate`}><Loader2 className="w-4 h-4 animate-spin shrink-0"/> {uploadText}</span></div> ) : isRecording ? (
            <div className="flex-1 flex justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 animate-pulse overflow-hidden"><span className="text-red-400 font-bold tracking-widest text-sm flex items-center gap-2 truncate"><div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div> REC</span><span className="text-red-400 font-bold">{Math.floor(recordingTime/60)}:{recordingTime%60 < 10 ? '0':''}{recordingTime%60}</span></div>
          ) : (
            <form onSubmit={handleSendText} className="flex-1 relative"><input type="text" value={inputText} onFocus={() => setShowStickerPicker(false)} onChange={handleTypingChange} placeholder={"Secure message..."} className={`w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-sm ${t.ring} focus:ring-1 outline-none transition-all placeholder:text-slate-600`} /></form>
          )}
          {isRecording ? ( <button onClick={stopRecording} className="bg-red-600 hover:bg-red-500 p-3 rounded-xl text-white transition-colors shadow-lg shadow-red-500/20 shrink-0"><Square className="w-5 h-5 fill-current" /></button> ) : ( <button onClick={handleSendText} disabled={(!inputText.trim() && !isUploading) || isUploading} className={`bg-gradient-to-r ${t.sendBtn} p-3 rounded-xl text-white disabled:opacity-50 transition-all ${t.glow} hover:-translate-y-0.5 active:scale-95 shrink-0`}><Send className="w-5 h-5 ml-0.5" /></button> )}
        </div>
      </div>
    </div>
  );
};

// --- 4. MAIN APP ROUTER ---
export default function App() {
  const [user, setUser] = useState(null); const [currentUserData, setCurrentUserData] = useState(null); const [usersList, setUsersList] = useState([]);
  const [chatThreads, setChatThreads] = useState([]); const [activeChat, setActiveChat] = useState(null); const [encryptionKeys, setEncryptionKeys] = useState([]); 
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('commslink_theme') || 'cyberpunk'); const t = themeStyles[themeMode];
  const [showKeyModal, setShowKeyModal] = useState(false); const [showProfileModal, setShowProfileModal] = useState(false); const [targetThread, setTargetThread] = useState(null); const [tempKey, setTempKey] = useState('');
  const [connectMode, setConnectMode] = useState('agent'); const [searchAgentId, setSearchAgentId] = useState(''); const [groupNameInput, setGroupNameInput] = useState(''); const [isSearching, setIsSearching] = useState(false);
  const [editName, setEditName] = useState(''); const [isSavingProfile, setIsSavingProfile] = useState(false); const avatarInputRef = useRef(null); const [copiedId, setCopiedId] = useState(false);

  useEffect(() => { const unsub = onAuthStateChanged(auth, async (u) => { setUser(u); if (u) await updateDoc(doc(db, 'users', u.uid), { lastSeen: Date.now() }).catch(()=>{}); }); return () => unsub(); }, []);
  useEffect(() => { if (!user) return; const unsub = onSnapshot(collection(db, 'users'), (snapshot) => { const others = []; snapshot.forEach(doc => { if (doc.id === user.uid) { setCurrentUserData(doc.data()); if (!editName) setEditName(doc.data().displayName || ''); } else others.push(doc.data()); }); setUsersList(others); }); return () => unsub(); }, [user]);
  useEffect(() => { if (!user) return; const q = query(collection(db, 'chat_threads'), where('participants', 'array-contains', user.uid)); const unsub = onSnapshot(q, (snapshot) => { const threads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); threads.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0)); setChatThreads(threads); }); return () => unsub(); }, [user]);

  // Hook into History API for Mobile Back Button
  useEffect(() => {
    const handlePopState = () => { if (activeChat) setActiveChat(null); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeChat]);

  const toggleTheme = () => { const modes = Object.keys(themeStyles); const nextMode = modes[(modes.indexOf(themeMode) + 1) % modes.length]; setThemeMode(nextMode); localStorage.setItem('commslink_theme', nextMode); };
  const handleLogout = () => { signOut(auth); setActiveChat(null); };
  const handleUpdateProfile = async (e) => { e.preventDefault(); if (!editName.trim()) return; setIsSavingProfile(true); try { await updateDoc(doc(db, 'users', user.uid), { displayName: editName }); await updateProfile(user, { displayName: editName }); setShowProfileModal(false); } catch (err) { alert("Failed to update profile."); } setIsSavingProfile(false); };
  const handleAvatarChange = async (e) => { const file = e.target.files[0]; if (!file) return; try { const b64 = await compressAvatar(file); await updateDoc(doc(db, 'users', user.uid), { avatarData: b64 }); } catch (err) { alert("Failed to update avatar."); } };
  const copyAgentId = () => { if (currentUserData?.agentId) { navigator.clipboard.writeText(currentUserData.agentId); setCopiedId(true); setTimeout(() => setCopiedId(false), 2000); } };
  const generateRandomGroup = () => { const adj = ['silent', 'dark', 'hidden', 'crypto', 'neon', 'shadow']; const nouns = ['vault', 'nexus', 'ghost', 'signal', 'pulse', 'void']; setGroupNameInput(`${adj[Math.floor(Math.random() * adj.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${Math.floor(1000 + Math.random() * 9000)}`); };
  const handleGroupJoin = async (e) => { e.preventDefault(); if (!groupNameInput.trim()) return; setIsSearching(true); try { const safeGroupId = groupNameInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'); const groupRef = doc(db, 'chat_threads', safeGroupId); const groupSnap = await getDoc(groupRef); if (groupSnap.exists()) { if (!groupSnap.data().participants.includes(user.uid)) { await updateDoc(groupRef, { participants: arrayUnion(user.uid) }); } } else { await setDoc(groupRef, { isGroup: true, name: groupNameInput.trim(), participants: [user.uid], createdAt: Date.now(), lastActivity: Date.now() }); alert(`Successfully created new server: ${groupNameInput.trim()}`); } setGroupNameInput(''); triggerChatEntry({ id: safeGroupId, isGroup: true, name: groupNameInput.trim() }); } catch (err) { alert("Failed to connect to group."); } setIsSearching(false); };
  const handleSearchAndCreateChat = async (e) => { e.preventDefault(); if (!searchAgentId.trim()) return; setIsSearching(true); try { const q = query(collection(db, 'users'), where('agentId', '==', searchAgentId.trim().toLowerCase())); const snap = await getDocs(q); if (snap.empty) { alert("Agent ID not found in the network."); setIsSearching(false); return; } const targetAgent = snap.docs[0].data(); if (targetAgent.uid === user.uid) { alert("You cannot start a chat with yourself."); setIsSearching(false); return; } const newThreadRef = await addDoc(collection(db, 'chat_threads'), { isGroup: false, participants: [user.uid, targetAgent.uid], participantNames: { [user.uid]: user.displayName, [targetAgent.uid]: targetAgent.displayName }, createdAt: Date.now(), lastActivity: Date.now(), lastRead: { [user.uid]: Date.now(), [targetAgent.uid]: 0 } }); setSearchAgentId(''); triggerChatEntry({ id: newThreadRef.id, participants: [user.uid, targetAgent.uid] }); } catch (err) { console.error(err); } setIsSearching(false); };

  const triggerChatEntry = (thread) => {
    let keys = JSON.parse(localStorage.getItem('commslink_keys') || '{}')[thread.id];
    if (keys) { if (typeof keys === 'string') keys = [keys]; setEncryptionKeys(keys); setActiveChat(thread); window.history.pushState({ chat: thread.id }, ''); } 
    else { setTargetThread(thread); setTempKey(''); setShowKeyModal(true); }
  };
  const handleChangeKey = () => { setTargetThread(activeChat); setTempKey(''); setShowKeyModal(true); };
  const confirmChatEntry = (e) => { e.preventDefault(); if (!tempKey.trim()) return; const savedKeys = JSON.parse(localStorage.getItem('commslink_keys') || '{}'); let currentKeys = savedKeys[targetThread.id] || []; if (typeof currentKeys === 'string') currentKeys = [currentKeys]; if (!currentKeys.includes(tempKey.trim())) currentKeys.push(tempKey.trim()); savedKeys[targetThread.id] = currentKeys; localStorage.setItem('commslink_keys', JSON.stringify(savedKeys)); setEncryptionKeys(currentKeys); setActiveChat(targetThread); setShowKeyModal(false); window.history.pushState({ chat: targetThread.id }, ''); };

  const handleDeleteChat = async (threadId, isGroup) => { if(window.confirm(isGroup ? "Are you sure you want to leave this group?" : "Are you sure you want to delete this secure channel?")) { try { if (isGroup) { const groupRef = doc(db, 'chat_threads', threadId); const groupSnap = await getDoc(groupRef); const newParticipants = groupSnap.data().participants.filter(id => id !== user.uid); if (newParticipants.length === 0) await deleteDoc(groupRef); else await updateDoc(groupRef, { participants: newParticipants }); } else await deleteDoc(doc(db, 'chat_threads', threadId)); const savedKeys = JSON.parse(localStorage.getItem('commslink_keys') || '{}'); delete savedKeys[threadId]; localStorage.setItem('commslink_keys', JSON.stringify(savedKeys)); if (activeChat?.id === threadId) window.history.back(); } catch (err) { alert("Action failed."); } } };

  const globalStyles = `
    @keyframes popIn { 0% { opacity: 0; transform: translateY(10px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } } 
    .animate-pop-in { animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } 
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 
    .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
    @keyframes bouncySlideUp { 0% { transform: translateY(100%); opacity: 0; } 70% { transform: translateY(-5%); opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
    .animate-bouncy-slide-up { animation: bouncySlideUp 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
    @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .animate-slide-up { animation: slideUp 0.2s ease-out forwards; }
    @keyframes glitchIn { 0% { opacity: 0; transform: scale(0.9) translate3d(2px, 0, 0); filter: drop-shadow(-2px 0 red) drop-shadow(2px 0 cyan); } 20% { opacity: 0.8; transform: scale(1.02) translate3d(-2px, 0, 0); filter: drop-shadow(2px 0 red) drop-shadow(-2px 0 cyan); } 40% { opacity: 1; transform: scale(0.98) translate3d(2px, 0, 0); filter: drop-shadow(-1px 0 red) drop-shadow(1px 0 cyan); } 60% { opacity: 1; transform: scale(1) translate3d(0, 0, 0); filter: none; } 100% { opacity: 1; transform: scale(1); filter: none; } }
    .animate-glitch-in { animation: glitchIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
    .vanishing { animation: vanish 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards; pointer-events: none; }
    @keyframes vanish { 0% { opacity: 1; transform: scale(1) translateY(0); max-height: 500px; margin-bottom: 1rem; } 40% { opacity: 0; transform: scale(0.95) translateY(-10px); max-height: 500px; margin-bottom: 1rem; } 100% { opacity: 0; transform: scale(0.95) translateY(-10px); max-height: 0; margin-bottom: 0; padding: 0; border: none; overflow: hidden; } }
    .glass-picker { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
    .custom-scrollbar::-webkit-scrollbar { width: 5px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
    .pb-safe { padding-bottom: env(safe-area-inset-bottom, 16px); }
  `;

  if (user === null) return <><style>{globalStyles}</style><AuthScreen t={t} /></>;

  return (
    <div className="flex h-[100dvh] w-full bg-[#050508] text-slate-200 overflow-hidden font-sans">
      <style>{globalStyles}</style>

      {showProfileModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <div className="flex justify-between items-center mb-6"><h3 className={`text-xl font-bold ${t.text}`}>Agent Protocol</h3><button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button></div>
            <div className="flex flex-col items-center mb-6">
              <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarChange} />
              <div onClick={() => avatarInputRef.current?.click()} className={`relative w-24 h-24 rounded-full bg-gradient-to-br ${t.bgLight} border-2 ${t.border} flex items-center justify-center cursor-pointer group overflow-hidden shadow-lg`}>
                {currentUserData?.avatarData ? <img src={currentUserData.avatarData} className="w-full h-full object-cover group-hover:opacity-50 transition-all" /> : <User className={`w-10 h-10 ${t.text} group-hover:opacity-50 transition-all`} />}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Camera className="w-8 h-8 text-white drop-shadow-md" /></div>
              </div>
            </div>
            <div className="text-center mb-6">
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Your Agent ID</p>
              <div onClick={copyAgentId} className={`inline-flex items-center gap-2 cursor-pointer font-mono text-lg font-bold bg-black/50 py-2 px-4 rounded-xl border ${copiedId ? 'border-green-500 text-green-400' : 'border-white/10 text-white'} hover:bg-white/5 transition-all shadow-inner`}>{currentUserData?.agentId} {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 opacity-50" />}</div>
            </div>
            <form onSubmit={handleUpdateProfile}>
              <div className="flex flex-col gap-2 mb-6"><label className="text-xs font-semibold text-slate-400 uppercase">Display Name</label><input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-white/30 ${t.ring} focus:ring-1 text-center`} /></div>
              <button type="submit" disabled={isSavingProfile} className={`w-full py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg flex justify-center items-center`}>{isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile"}</button>
            </form>
          </div>
        </div>
      )}

      {showKeyModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <h3 className={`text-xl font-bold mb-1 ${t.text}`}>Update Key Ring</h3><p className="text-xs text-slate-400 mb-4">Add a new key or enter an existing one. Old keys are saved locally to decode chat history.</p>
            <form onSubmit={confirmChatEntry}>
              <input type="password" autoFocus required value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="Encryption Key" className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-4 outline-none focus:border-white/30 ${t.ring} focus:ring-1`} />
              <div className="flex gap-2"><button type="button" onClick={() => setShowKeyModal(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-sm">Cancel</button><button type="submit" className={`flex-1 py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg`}>Update Key</button></div>
            </form>
          </div>
        </div>
      )}

      <div className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-[350px] lg:w-[400px] flex-col border-r border-white/10 z-20 shrink-0 bg-[#0a0a0f]`}>
        <header className="px-4 py-4 border-b border-white/10 shrink-0 flex justify-between items-center bg-[#0f0f14]">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowProfileModal(true)} className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow} hover:scale-105 transition-all overflow-hidden shadow-lg cursor-pointer shrink-0`}>{currentUserData?.avatarData ? <img src={currentUserData.avatarData} className="w-full h-full object-cover" /> : <Settings className={`w-5 h-5 ${t.text}`} />}</button>
            <div className="flex flex-col"><h2 className={`font-mono text-lg font-bold ${t.title} truncate tracking-widest`}>CommsLink</h2></div>
          </div>
          <div className="flex gap-1 shrink-0"><button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"><Palette className="w-4 h-4" /></button><button onClick={handleLogout} className="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-white/5"><LogOut className="w-4 h-4" /></button></div>
        </header>

        <div className="p-4 border-b border-white/5 shrink-0 bg-[#0c0c12]">
          <div className="flex gap-1 mb-3 bg-black/40 p-1 rounded-lg border border-white/5"><button onClick={() => setConnectMode('agent')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${connectMode === 'agent' ? t.activeTab : 'text-slate-500 hover:text-slate-300'}`}>Agent Link</button><button onClick={() => setConnectMode('group')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${connectMode === 'group' ? t.activeTab : 'text-slate-500 hover:text-slate-300'}`}>Servers</button></div>
          {connectMode === 'agent' ? (
            <form onSubmit={handleSearchAndCreateChat} className="flex gap-2">
              <div className="relative flex-1 group"><div className={`absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:${t.text}`}><Search className="w-3.5 h-3.5" /></div><input type="text" value={searchAgentId} onChange={(e) => setSearchAgentId(e.target.value)} placeholder="Enter Agent ID..." className={`w-full bg-black/50 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-sm ${t.ring} focus:ring-1 outline-none transition-all`} /></div>
              <button type="submit" disabled={isSearching || !searchAgentId.trim()} className={`bg-gradient-to-r ${t.sendBtn} text-white px-3 rounded-lg disabled:opacity-50 shrink-0`}><Plus className="w-4 h-4" /></button>
            </form>
          ) : (
            <form onSubmit={handleGroupJoin} className="flex flex-col gap-2">
              <div className="relative group flex items-center"><input type="text" value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} placeholder="Server Name..." className={`w-full bg-black/50 border border-white/10 rounded-lg py-2 pl-3 pr-8 text-sm ${t.ring} focus:ring-1 outline-none transition-all`} /><button type="button" onClick={generateRandomGroup} className="absolute right-2 p-1 text-slate-500 hover:text-white" title="Random Server"><RefreshCw className="w-3 h-3" /></button></div>
              <button type="submit" disabled={isSearching || !groupNameInput.trim()} className={`w-full bg-gradient-to-r ${t.sendBtn} py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50 shrink-0`}>Create / Join Server</button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {chatThreads.length === 0 ? ( <div className="text-center p-8 mt-4 text-slate-500 opacity-50"><MessageSquare className="w-8 h-8 mx-auto mb-2" /><p className="text-xs">No active channels.</p></div> ) : (
            chatThreads.map((thread) => {
              const isGroup = thread.isGroup; let chatName = "Unknown"; let chatAvatar = null; let isOnline = false;
              if (isGroup) chatName = thread.name || "Group Server";
              else {
                const otherUserId = thread.participants.find(id => id !== user.uid); const otherUserAgent = usersList.find(u => u.uid === otherUserId);
                chatName = thread.customName || otherUserAgent?.displayName || thread.participantNames[otherUserId] || 'Unknown Agent'; chatAvatar = otherUserAgent?.avatarData || null;
                if (otherUserAgent && otherUserAgent.lastSeen && Date.now() - otherUserAgent.lastSeen < 300000) isOnline = true;
              }
              const hasLocalKey = !!JSON.parse(localStorage.getItem('commslink_keys') || '{}')[thread.id]; const isActive = activeChat?.id === thread.id;
              return (
                <button key={thread.id} onClick={() => triggerChatEntry(thread)} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group text-left ${isActive ? 'bg-white/10 border border-white/5' : 'bg-transparent hover:bg-white/5 border border-transparent'}`}>
                  <div className={`w-11 h-11 rounded-full relative bg-black/50 border ${isActive ? t.border : 'border-white/10'} flex items-center justify-center shrink-0 overflow-hidden`}>{isGroup ? <Users className={`w-4 h-4 ${isActive ? t.text : 'text-slate-400'}`} /> : (chatAvatar ? <img src={chatAvatar} className="w-full h-full object-cover" /> : <User className={`w-4 h-4 ${isActive ? t.text : 'text-slate-400'}`} />)}{isOnline && !isGroup && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#0a0a0f] rounded-full shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>}</div>
                  <div className="flex-1 overflow-hidden"><h4 className={`font-bold truncate text-sm ${isActive ? 'text-white' : 'text-slate-300'}`}>{chatName}</h4><p className={`text-[10px] truncate flex items-center gap-1 mt-0.5 ${hasLocalKey ? 'text-green-500/70' : 'text-amber-500/70'}`}>{hasLocalKey ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />} {hasLocalKey ? 'Cached' : 'Locked'}</p></div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={`${!activeChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col relative bg-[#050508] min-h-0`}>
        {activeChat ? ( <ChatInterface user={user} usersList={usersList} threadId={activeChat.id} chatData={chatThreads.find(th => th.id === activeChat.id) || activeChat} encryptionKeys={encryptionKeys} changeKey={handleChangeKey} goBack={() => window.history.back()} deleteChat={handleDeleteChat} t={t} themeMode={themeMode} /> ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500/40 relative">
             <div className="absolute inset-0 bg-center bg-no-repeat bg-contain opacity-5" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg width=\"100\" height=\"100\" viewBox=\"0 0 100 100\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M50 20L80 40V70L50 90L20 70V40L50 20Z\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>')" }}></div>
             <ShieldCheck className="w-24 h-24 mb-6 drop-shadow-2xl" /><h3 className="font-mono text-xl tracking-widest uppercase mb-2">CommsLink Standby</h3><p className="text-sm">Select a channel from the directory to establish uplink.</p>
          </div>
        )}
      </div>

    </div>
  );
}