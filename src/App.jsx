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
  ArrowDown, Sticker, Edit2, Phone, PhoneCall, PhoneOff, MicOff, Volume2, Video, VideoOff, AlertCircle,
  FileText, Download, Shield, Zap
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
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};
const encryptText = async (text, password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt); const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
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
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
  } catch (e) { return null; }
};

const parseMarkdown = (text) => {
  if (!text) return { __html: "" };
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline hover:text-indigo-300 break-all" onclick="event.stopPropagation()">$1</a>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/~(.*?)~/g, '<del>$1</del>')
    .replace(/`(.*?)`/g, '<code class="bg-black/40 px-1.5 py-0.5 rounded-md text-cyan-400 font-mono text-[12px] border border-white/10 break-words">$1</code>');
  return { __html: html };
};

// --- WebRTC Media Pipeline ---
const setupMaskedMedia = async (rawStream, videoMode, useAudioMask) => {
  const tracks = [];
  const audioCtx = useAudioMask ? new (window.AudioContext || window.webkitAudioContext)() : null;
  let canvasInterval = null;
  if (rawStream.getAudioTracks().length > 0) {
    if (useAudioMask) {
      const source = audioCtx.createMediaStreamSource(rawStream);
      const destination = audioCtx.createMediaStreamDestination();
      const bassBoost = audioCtx.createBiquadFilter(); bassBoost.type = 'peaking'; bassBoost.frequency.value = 100; bassBoost.Q.value = 1.0; bassBoost.gain.value = 15;
      const highCut = audioCtx.createBiquadFilter(); highCut.type = 'highshelf'; highCut.frequency.value = 4000; highCut.gain.value = -5;
      source.connect(bassBoost); bassBoost.connect(highCut); highCut.connect(destination);
      tracks.push(destination.stream.getAudioTracks()[0]);
    } else { tracks.push(rawStream.getAudioTracks()[0]); }
  }
  if (rawStream.getVideoTracks().length > 0) {
    if (videoMode === 'raw') { tracks.push(rawStream.getVideoTracks()[0]); }
    else {
      const videoEl = document.createElement('video'); videoEl.srcObject = new MediaStream([rawStream.getVideoTracks()[0]]); videoEl.muted = true; videoEl.playsInline = true; videoEl.play().catch(e => console.warn("Background video blocked:", e));
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const ctx = canvas.getContext('2d', { willReadFrequently: true });
      canvasInterval = setInterval(() => {
        if (videoMode === 'blur') { ctx.filter = 'blur(15px) contrast(120%)'; ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height); }
        else if (videoMode === 'jam') { ctx.filter = 'grayscale(100%) contrast(180%) brightness(80%)'; ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < canvas.height; i += 4) ctx.fillRect(0, i, canvas.width, 1); if (Math.random() > 0.8) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 150, 20); } }
      }, 1000 / 30);
      const canvasStream = canvas.captureStream(30); tracks.push(canvasStream.getVideoTracks()[0]);
    }
  }
  return { processedStream: new MediaStream(tracks), audioCtx, canvasInterval };
};

// --- Media Utils ---
const createStickerFromImage = (b64) => new Promise((res, rej) => { const i = new Image(); i.src = b64; i.onload = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d'); const s = Math.min(i.width, i.height); ctx.drawImage(i, (i.width - s) / 2, (i.height - s) / 2, s, s, 0, 0, 256, 256); res(c.toDataURL('image/webp', 0.8)); }; i.onerror = rej; });
const compressImage = (f) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const i = new Image(); i.src = e.target.result; i.onload = () => { const c = document.createElement('canvas'); let w = i.width, h = i.height; if (w > h) { if (w > 600) { h *= 600 / w; w = 600; } } else { if (h > 600) { w *= 600 / h; h = 600; } } c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h); res(c.toDataURL('image/jpeg', 0.6)); }; i.onerror = rej; }; r.onerror = rej; });
const compressAvatar = (f) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(f); r.onload = (e) => { const i = new Image(); i.src = e.target.result; i.onload = () => { const c = document.createElement('canvas'); let w = i.width, h = i.height; if (w > h) { h *= 150 / w; w = 150; } else { w *= 150 / h; h = 150; } c.width = w; c.height = h; c.getContext('2d').drawImage(i, 0, 0, w, h); res(c.toDataURL('image/jpeg', 0.6)); }; i.onerror = rej; }; r.onerror = rej; });
const blobToBase64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(b); r.onloadend = () => res(r.result); r.onerror = rej; });
const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDay = (ts) => { const d = new Date(ts), t = new Date(), y = new Date(t); y.setDate(y.getDate() - 1); if (d.toDateString() === t.toDateString()) return 'Today'; if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const isSameDay = (ts1, ts2) => new Date(ts1).toDateString() === new Date(ts2).toDateString();

// --- Custom Audio Player ---
const CustomAudioPlayer = ({ src, isMine, t }) => {
  const audioRef = useRef(null); const [isPlaying, setIsPlaying] = useState(false); const [progress, setProgress] = useState(0);
  const togglePlay = (e) => { e.stopPropagation(); if (isPlaying) audioRef.current.pause(); else audioRef.current.play(); setIsPlaying(!isPlaying); };
  const handleTimeUpdate = () => { const c = audioRef.current.currentTime; const tot = audioRef.current.duration; setProgress(tot ? (c / tot) * 100 : 0); };
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl w-[200px] sm:w-[240px] ${isMine ? 'bg-white/15' : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8'}`}>
      <button onClick={togglePlay} className={`w-8 h-8 flex items-center justify-center rounded-full ${isMine ? 'bg-white/20 text-white hover:bg-white/30' : `${t.bgLight} ${t.text}`} transition-all shrink-0 active:scale-90`}>
        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
      </button>
      <div className="flex-1 h-1 bg-black/20 dark:bg-black/40 rounded-full overflow-hidden relative">
        <div className={`absolute left-0 top-0 bottom-0 ${isMine ? 'bg-white/70' : `bg-gradient-to-r ${t.sendBtn}`} transition-all duration-75 rounded-full`} style={{ width: `${progress}%` }} />
      </div>
      <audio ref={audioRef} src={src} onTimeUpdate={handleTimeUpdate} onEnded={() => { setIsPlaying(false); setProgress(0); }} />
    </div>
  );
};

// --- Theme Styles ---
const themeStyles = {
  professional: { name: 'Professional', text: 'text-indigo-500 dark:text-indigo-400', border: 'border-indigo-400/30', ring: 'focus:ring-indigo-500/40', bgLight: 'bg-indigo-50 dark:bg-indigo-500/10', btnGrad: 'from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500', sendBtn: 'from-indigo-600 to-violet-600', msgMine: 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white', glow: 'shadow-lg shadow-indigo-500/15', title: 'text-slate-900 dark:text-white', activeTab: 'bg-white dark:bg-white/10 shadow text-indigo-600 dark:text-indigo-400 font-semibold', chatBg: 'bg-[#07080d]', accentColor: '#6366f1' },
  corporate: { name: 'Corporate', text: 'text-blue-500 dark:text-blue-400', border: 'border-blue-400/30', ring: 'focus:ring-blue-500/40', bgLight: 'bg-blue-50 dark:bg-blue-500/10', btnGrad: 'from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500', sendBtn: 'from-blue-600 to-sky-600', msgMine: 'bg-gradient-to-br from-blue-600 to-sky-700 text-white', glow: 'shadow-lg shadow-blue-500/15', title: 'text-slate-900 dark:text-white', activeTab: 'bg-white dark:bg-white/10 shadow text-blue-600 dark:text-blue-400 font-semibold', chatBg: 'bg-[#07080d]', accentColor: '#3b82f6' },
  minimal: { name: 'Minimal', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-500/30', ring: 'focus:ring-slate-400/40', bgLight: 'bg-slate-100 dark:bg-slate-700/30', btnGrad: 'from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600', sendBtn: 'from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600', msgMine: 'bg-gradient-to-br from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600 text-white', glow: 'shadow-md shadow-black/10', title: 'text-slate-900 dark:text-white', activeTab: 'bg-white dark:bg-white/10 shadow text-slate-800 dark:text-slate-200 font-semibold', chatBg: 'bg-[#07080d]', accentColor: '#64748b' },
  emerald: { name: 'Emerald', text: 'text-emerald-500 dark:text-emerald-400', border: 'border-emerald-400/30', ring: 'focus:ring-emerald-500/40', bgLight: 'bg-emerald-50 dark:bg-emerald-500/10', btnGrad: 'from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500', sendBtn: 'from-emerald-600 to-teal-600', msgMine: 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white', glow: 'shadow-lg shadow-emerald-500/15', title: 'text-slate-900 dark:text-white', activeTab: 'bg-white dark:bg-white/10 shadow text-emerald-600 dark:text-emerald-400 font-semibold', chatBg: 'bg-[#07080d]', accentColor: '#10b981' },
  ruby: { name: 'Ruby', text: 'text-rose-500 dark:text-rose-400', border: 'border-rose-400/30', ring: 'focus:ring-rose-500/40', bgLight: 'bg-rose-50 dark:bg-rose-500/10', btnGrad: 'from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500', sendBtn: 'from-rose-600 to-pink-600', msgMine: 'bg-gradient-to-br from-rose-600 to-pink-700 text-white', glow: 'shadow-lg shadow-rose-500/15', title: 'text-slate-900 dark:text-white', activeTab: 'bg-white dark:bg-white/10 shadow text-rose-600 dark:text-rose-400 font-semibold', chatBg: 'bg-[#07080d]', accentColor: '#f43f5e' },
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '🥺', '🎉', '💯', '🤔', '👀', '🙌', '👏', '🙏', '✨', '💀', '😭', '🤯', '😡', '🤢', '🤡', '👻', '👽', '🤖', '💩', '😎', '🤓', '🥳', '😴', '🙄', '🤐', '🤫', '🤬', '😈', '✌️', '🤘', '👌', '🤌', '💪', '🧠', '🖕', '🙂', '🫦', '🥵', '🥶', '🥴', '🧊', '🩸', '🧪', '📉'];

// --- AUTH SCREEN ---
const AuthScreen = ({ t }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [agentId, setAgentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    const safeId = agentId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (safeId.length < 3) return alert("Username must be at least 3 letters or numbers.");
    const phantomEmail = `${safeId}@commslink.network`;
    setLoading(true);
    try {
      if (isLogin) { await signInWithEmailAndPassword(auth, phantomEmail, password); }
      else {
        const userCred = await createUserWithEmailAndPassword(auth, phantomEmail, password);
        const finalName = displayName.trim() || agentId.trim();
        await updateProfile(userCred.user, { displayName: finalName });
        await setDoc(doc(db, 'users', userCred.user.uid), { uid: userCred.user.uid, agentId: safeId, displayName: finalName, avatarData: null, lastSeen: Date.now() });
      }
    } catch (error) { alert(error.message); }
    setLoading(false);
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-[#07080d] text-slate-200 font-sans overflow-hidden animate-fade-in">
      {/* Left Panel — Brand */}
      <div className="hidden md:flex flex-col flex-1 relative overflow-hidden p-12 justify-between">
        {/* Animated Orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="orb-1 absolute top-[10%] left-[15%] w-80 h-80 rounded-full bg-indigo-600/20 blur-[80px]" />
          <div className="orb-2 absolute bottom-[15%] right-[10%] w-72 h-72 rounded-full bg-violet-600/20 blur-[80px]" />
          <div className="orb-3 absolute top-[55%] left-[40%] w-48 h-48 rounded-full bg-cyan-500/10 blur-[60px]" />
        </div>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        {/* Content */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">CommsLink</span>
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-6">
            <Zap className="w-3 h-3" /> End-to-End Encrypted
          </div>
          <h2 className="text-5xl font-extrabold leading-tight mb-5 text-white">
            Communicate<br />
            <span className="gradient-text">without limits.</span>
          </h2>
          <p className="text-base text-slate-400 leading-relaxed max-w-md">
            Military-grade AES-256 encryption. Zero knowledge. Your messages remain private — forever.
          </p>
          <div className="flex gap-6 mt-10">
            {['Encrypted', 'Private', 'Fast'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                  <Check className="w-3 h-3 text-indigo-400" />
                </div>
                <span className="text-sm text-slate-400 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex -space-x-2">
            {['bg-indigo-500', 'bg-violet-500', 'bg-cyan-500'].map((c, i) => (
              <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-[#07080d]`} />
            ))}
          </div>
          <span className="text-sm text-slate-500">Trusted by secure teams worldwide</span>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 relative bg-[#0d0e15] md:border-l border-white/5">
        {/* Mobile logo */}
        <div className="flex flex-col items-center mb-8 md:hidden">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CommsLink</h1>
          <p className="text-xs text-slate-500 mt-1">End-to-End Encrypted Messaging</p>
        </div>

        <div className="w-full max-w-sm animate-slide-in-right">
          <h2 className="text-2xl font-bold text-white mb-1">{isLogin ? 'Welcome back' : 'Create account'}</h2>
          <p className="text-sm text-slate-500 mb-8">{isLogin ? 'Sign in to your secure workspace.' : 'Get started with end-to-end encryption.'}</p>

          <form onSubmit={handleAuth} className="flex flex-col gap-4">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" required value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="e.g. john_doe"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus-ring hover:border-white/20" />
              </div>
            </div>
            {/* Display Name (signup only) */}
            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Display Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. John Doe"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus-ring hover:border-white/20" />
                </div>
              </div>
            )}
            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition-all focus-ring hover:border-white/20" />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className={`mt-2 bg-gradient-to-r ${t.btnGrad} text-white font-semibold py-3.5 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60`}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? <><Shield className="w-4 h-4" /> Sign In Securely</> : <><Zap className="w-4 h-4" /> Create Account</>)}
            </button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-8">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

// --- MESSAGE ITEM ---
const MessageItem = ({ msg, index, isMine, isGroup, isConsecutive, repliedMsg, hasReactions, isRead, user, t, themeMode, toggleReaction, activeMenu, setActiveMenu, setReplyingTo, setZoomedImage, saveSticker, showDayDivider, dayString, startEditing, deleteMessage }) => {
  const activeTouch = useRef({ startX: 0, timer: null, isLongPress: false });
  const [isExpiring, setIsExpiring] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  useEffect(() => {
    if (msg.expiresAt) {
      const checkExpiry = () => { const timeLeft = msg.expiresAt - Date.now(); if (timeLeft <= 5000 && timeLeft > 0) setIsExpiring(true); if (timeLeft <= 0) setIsHidden(true); };
      checkExpiry(); const timer = setInterval(checkExpiry, 1000); return () => clearInterval(timer);
    }
  }, [msg.expiresAt]);
  if (isHidden) return null;

  const bubbleSpacing = isConsecutive ? 'mt-0.5' : 'mt-3';
  const borderRadius = isMine
    ? (isConsecutive ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tr-sm')
    : (isConsecutive ? 'rounded-2xl rounded-tl-md' : 'rounded-2xl rounded-tl-sm');
  const zIndexClass = activeMenu === msg.id ? 'z-[100]' : 'z-10';
  const msgTime = formatTime(msg.timestamp);
  const isSticker = msg.type === 'sticker';
  let ytIds = [];
  if (msg.isDecrypted && msg.type === 'text') {
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/gi;
    let match; while ((match = ytRegex.exec(msg.decryptedText)) !== null) { ytIds.push(match[1]); } ytIds = [...new Set(ytIds)];
  }

  return (
    <>
      {showDayDivider && (
        <div className="flex justify-center w-full my-5 z-0">
          <span className="px-4 py-1.5 text-[10px] font-semibold tracking-widest uppercase rounded-full bg-white/5 border border-white/8 text-slate-500 shadow-sm backdrop-blur-sm">
            {dayString}
          </span>
        </div>
      )}
      <div
        className={`flex flex-col max-w-[82%] md:max-w-[65%] relative group ${isMine ? 'self-end items-end' : 'self-start items-start'} ${bubbleSpacing} ${isExpiring ? 'vanishing' : ''} ${zIndexClass} animate-pop-in`}
        onTouchStart={e => { activeTouch.current.startX = e.targetTouches[0].clientX; activeTouch.current.isLongPress = false; activeTouch.current.timer = setTimeout(() => { activeTouch.current.isLongPress = true; if (navigator.vibrate) navigator.vibrate(40); setActiveMenu(msg.id); }, 450); }}
        onTouchMove={() => clearTimeout(activeTouch.current.timer)}
        onTouchEnd={e => { clearTimeout(activeTouch.current.timer); if (!activeTouch.current.isLongPress && e.changedTouches[0].clientX - activeTouch.current.startX > 60) setReplyingTo(msg); }}
      >
        {/* Desktop hover actions */}
        <div className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${isMine ? 'right-full pr-2' : 'left-full pl-2'} items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-10`}>
          <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); setActiveMenu(null); }} title="Reply"
            className="p-2 bg-[#1a1b28] border border-white/10 text-slate-400 hover:text-slate-200 rounded-full hover:bg-white/10 shadow-lg transition-all hover:scale-110 active:scale-95">
            <Reply className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setActiveMenu(msg.id === activeMenu ? null : msg.id); }} title="React"
            className={`p-2 bg-[#1a1b28] border border-white/10 ${t.text} rounded-full hover:bg-white/10 shadow-lg transition-all hover:scale-110 active:scale-95`}>
            <Smile className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Context menu */}
        {activeMenu === msg.id && (
          <div className={`absolute ${isMine ? 'right-0' : 'left-0'} ${index < 3 ? 'top-full mt-2' : 'bottom-full mb-2'} bg-[#1a1b28]/95 border border-white/10 rounded-2xl p-3 z-[300] w-[275px] shadow-2xl glass-picker animate-pop-in`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-around mb-3 border-b border-white/8 pb-2.5">
              <button onClick={() => { setReplyingTo(msg); setActiveMenu(null); }} className="p-2.5 hover:bg-white/8 rounded-xl text-slate-400 hover:text-slate-200 transition-colors" title="Reply"><Reply className="w-4 h-4" /></button>
              {msg.isDecrypted && msg.type === 'image' && <button onClick={() => { saveSticker(msg.decryptedText); setActiveMenu(null); }} className="p-2.5 hover:bg-white/8 rounded-xl text-orange-400 hover:text-orange-300 transition-colors" title="Save Sticker"><Sticker className="w-4 h-4" /></button>}
              {isMine && msg.type === 'text' && <button onClick={() => { startEditing(msg); setActiveMenu(null); }} className="p-2.5 hover:bg-white/8 rounded-xl text-blue-400 hover:text-blue-300 transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>}
              {isMine && <button onClick={() => { deleteMessage(msg.id); setActiveMenu(null); }} className="p-2.5 hover:bg-red-500/20 rounded-xl text-red-400 hover:text-red-300 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>}
            </div>
            <div className="grid grid-cols-6 gap-0.5 max-h-36 overflow-y-auto custom-scrollbar">
              {REACTION_EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => toggleReaction(msg.id, msg.reactions || {}, emoji)}
                  className="w-9 h-9 hover:bg-white/8 rounded-xl text-xl hover:scale-125 transition-all active:scale-95 flex items-center justify-center">{emoji}</button>
              ))}
            </div>
          </div>
        )}

        {/* Sender name (group, non-consecutive) */}
        {!isConsecutive && !isSticker && !isMine && isGroup && (
          <span className={`text-[11px] font-semibold ml-1 mb-1 ${t.text}`}>{msg.senderName}</span>
        )}
        {!isConsecutive && !isSticker && (
          <div className="flex items-center gap-2 mb-1">
            {!isMine && !isGroup && <span />}
            {msg.expiresAt && <span className="text-[10px] text-orange-400 font-semibold flex items-center gap-0.5 ml-1"><Flame className="w-3 h-3" /> Burns soon</span>}
          </div>
        )}

        {/* Sticker */}
        {isSticker && msg.isDecrypted ? (
          <div className="relative group cursor-pointer" onClick={() => setZoomedImage(msg.decryptedText)}>
            <img src={msg.decryptedText} className="w-28 h-28 md:w-36 md:h-36 object-contain drop-shadow-xl transition-transform hover:scale-105" alt="Sticker" />
            <div className="absolute -bottom-2 -right-2 bg-black/60 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm border border-white/10 shadow-sm">
              <span className="text-slate-300 font-medium">{msgTime}</span>
              {isMine && !isGroup && (isRead ? <CheckCheck className={`w-3 h-3 ${t.text}`} /> : <Check className="w-3 h-3 text-slate-500" />)}
            </div>
          </div>
        ) : (
          /* Message Bubble */
          <div className={`px-4 py-2.5 relative max-w-full w-full ${borderRadius} transition-all
            ${msg.isDecrypted
              ? isMine
                ? `${msg.expiresAt ? 'bg-gradient-to-br from-orange-500 to-red-600' : t.msgMine} shadow-sm`
                : 'bg-[#1a1b28] border border-white/8 text-slate-200 shadow-sm'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
            {/* Reply preview */}
            {repliedMsg && repliedMsg.isDecrypted && (
              <div className={`mb-2 px-3 py-2 rounded-xl border-l-4 ${isMine ? 'border-white/40 bg-white/10' : 'border-indigo-500/60 bg-white/5'} text-xs overflow-hidden`}>
                <span className={`font-semibold block mb-0.5 ${isMine ? 'text-white/80' : t.text}`}>{repliedMsg.senderName}</span>
                <span className="truncate block max-w-[200px] text-inherit opacity-70">{repliedMsg.type === 'text' ? repliedMsg.decryptedText : '📷 Media'}</span>
              </div>
            )}
            {/* Content */}
            {msg.isDecrypted ? (
              msg.type === 'image' ? (
                <img src={msg.decryptedText} onClick={() => setZoomedImage(msg.decryptedText)} className="max-w-full mt-1 mb-1 rounded-xl cursor-zoom-in border border-white/5 object-contain" style={{ maxHeight: '320px' }} />
              ) : msg.type === 'video' ? (
                <video controls src={msg.decryptedText} className="max-w-full mt-1 mb-1 rounded-xl shadow-md border border-white/10 object-contain" style={{ maxHeight: '320px' }} />
              ) : msg.type === 'video_loading' ? (
                <div className="px-1 py-1 flex flex-col gap-2 min-w-[200px]">
                  <div className={`flex items-center gap-2 font-bold mb-1 border-b ${isMine ? 'border-white/20' : 'border-white/10'} pb-2 text-xs opacity-90`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> DOWNLOADING...</div>
                  <div className={`w-full ${isMine ? 'bg-white/20' : 'bg-white/10'} h-1.5 rounded-full overflow-hidden`}><div className={`h-full bg-gradient-to-r ${t.sendBtn} transition-all`} style={{ width: `${(msg.progress / msg.total) * 100}%` }} /></div>
                  <span className="opacity-70 text-[10px] text-right font-medium">Packets: {msg.progress} / {msg.total}</span>
                </div>
              ) : msg.type === 'audio' ? (
                <div className="mt-1 mb-1"><CustomAudioPlayer src={msg.decryptedText} isMine={isMine} t={t} /></div>
              ) : msg.type === 'document' ? (
                <div className="flex items-center gap-3 min-w-[200px] max-w-[270px] my-1">
                  <div className={`shrink-0 w-10 h-10 rounded-xl ${isMine ? 'bg-white/20 text-white' : `${t.bgLight} ${t.text}`} flex items-center justify-center`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold truncate leading-tight">{msg.fileName || 'Document'}</p>
                    <p className={`text-[11px] mt-0.5 opacity-75 font-medium`}>{msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : 'Encrypted'} · Secure</p>
                  </div>
                  <a href={msg.decryptedText} download={msg.fileName || 'document'} onClick={e => e.stopPropagation()}
                    className={`shrink-0 p-2 rounded-xl ${isMine ? 'hover:bg-white/20' : 'hover:bg-white/10'} transition-all active:scale-90`} title="Download">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ) : (
                <div className="text-[14.5px] whitespace-pre-wrap break-words leading-relaxed">
                  <div dangerouslySetInnerHTML={parseMarkdown(msg.decryptedText)} />
                  {ytIds.length > 0 && ytIds.map(id => (
                    <div key={id} className="mt-3 w-full rounded-xl overflow-hidden border border-white/10 bg-black/50 aspect-video shadow-md">
                      <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${id}`} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-xs opacity-70 font-medium mb-1 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> BLOCKED / INVALID KEY</div>
            )}
            {/* Timestamp + read */}
            <div className="flex items-center justify-end gap-1 mt-1.5 opacity-60">
              <span className="text-[10px] tracking-wide font-medium">{msgTime}{msg.isEdited && <span className="italic opacity-80 ml-1">(edited)</span>}</span>
              {isMine && !isGroup && (isRead ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
            </div>
            {/* Reactions */}
            {hasReactions && (
              <div className={`absolute -bottom-3.5 ${isMine ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-[60] animate-pop-in`}>
                {Object.entries(msg.reactions || {}).map(([emoji, users]) => (
                  <button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, msg.reactions || {}, emoji); }}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border shadow-md transition-all active:scale-95 hover:scale-110 ${users.includes(user.uid) ? `${t.bgLight} ${t.border} ${t.text}` : 'bg-[#1a1b28] border-white/10 text-slate-300'}`}>
                    <span>{emoji}</span>{users.length > 1 && <span className="font-bold">{users.length}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// --- 3. THE CHAT INTERFACE & WEBRTC LOGIC (ENHANCED) ---
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
  const [callState, setCallState] = useState('idle');
  const callStateRef = useRef('idle');
  const [callDuration, setCallDuration] = useState(0);
  const callDurationRef = useRef(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isLocalVideoOff, setIsLocalVideoOff] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [callMode, setCallMode] = useState('audio_raw');

  // Hardware-Safe DOM Hooks
  const remoteMediaRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnection = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const canvasIntervalRef = useRef(null);
  const callDurationTimer = useRef(null);
  const callTimeoutRef = useRef(null);
  const pendingCandidates = useRef([]);

  const updateCallState = (newState) => { setCallState(newState); callStateRef.current = newState; };

  const isGroup = chatData?.isGroup;
  let chatName = "Unknown Channel"; let chatAvatar = null; let memberCount = chatData?.participants?.length || 0;
  const otherUserId = isGroup ? null : chatData?.participants?.find(id => id !== user.uid);
  let someoneIsTyping = false; let typingName = '';
  if (chatData?.typing) { const typists = Object.keys(chatData.typing).filter(id => id !== user.uid && chatData.typing[id]); if (typists.length > 0) { someoneIsTyping = true; const typistObj = usersList.find(u => u.uid === typists[0]); typingName = typistObj ? typistObj.displayName : 'Agent'; } }
  if (isGroup) { chatName = chatData?.name || "Group Server"; } else { const otherUserAgent = usersList.find(u => u.uid === otherUserId); chatName = chatData?.customName || otherUserAgent?.displayName || chatData?.participantNames?.[otherUserId] || 'Unknown Agent'; chatAvatar = otherUserAgent?.avatarData || null; }

  const iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun2.l.google.com:19302' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }], iceTransportPolicy: 'all' };

  useEffect(() => { setMsgLimit(30); setEditingMsg(null); setReplyingTo(null); setInputText(''); setConnectionError(null); }, [threadId]);
  useEffect(() => { decryptionCache.current = {}; }, [encryptionKeys]);

  useEffect(() => {
    if (callState === 'connected') {
      if (remoteMediaRef.current && remoteStreamRef.current && remoteMediaRef.current.srcObject !== remoteStreamRef.current) remoteMediaRef.current.srcObject = remoteStreamRef.current;
      if (remoteAudioRef.current && remoteStreamRef.current && remoteAudioRef.current.srcObject !== remoteStreamRef.current) remoteAudioRef.current.srcObject = remoteStreamRef.current;
      if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState, isVideoEnabled]);

  useEffect(() => {
    if (isGroup) return;
    const callDocRef = doc(db, 'chat_threads', threadId, 'call_signal', 'data');
    const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
      const data = snapshot.data(); if (!data) return;
      const currentState = callStateRef.current;
      if (data.status === 'ringing' && data.callerId !== user.uid && currentState === 'idle') { setIsVideoEnabled(data.isVideo || false); setCallMode(data.callMode || 'audio_raw'); updateCallState('ringing'); }
      else if (data.status === 'answered' && data.callerId === user.uid && peerConnection.current) {
        if (peerConnection.current.signalingState === "have-local-offer") {
          try {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            for (const c of pendingCandidates.current) try { await peerConnection.current.addIceCandidate(c); } catch (e) { }
            pendingCandidates.current = []; if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current); setConnectionError(null);
          } catch (err) { }
        }
      } else if (data.status === 'ended' && currentState !== 'idle') { endCallLocally(); }
    });
    return () => unsubscribe();
  }, [threadId, user.uid, isGroup]);

  useEffect(() => {
    if (isGroup || callState === 'idle') return;
    const q = query(collection(db, 'chat_threads', threadId, 'call_candidates'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.senderId !== user.uid) {
            const candidate = new RTCIceCandidate(data.candidate);
            if (peerConnection.current && peerConnection.current.remoteDescription) peerConnection.current.addIceCandidate(candidate).catch(() => { });
            else pendingCandidates.current.push(candidate);
          }
        }
      });
    });
    return () => unsubscribe();
  }, [threadId, user.uid, callState, isGroup]);

  const startCall = async (mode) => {
    const isVideo = mode.startsWith('video_'); const useAudioMask = mode === 'audio_masked'; const videoMode = isVideo ? mode.replace('video_', '') : 'raw';
    setIsVideoEnabled(isVideo); setCallMode(mode); updateCallState('calling'); setConnectionError(null); pendingCandidates.current = [];
    peerConnection.current = new RTCPeerConnection(iceServers);
    peerConnection.current.oniceconnectionstatechange = () => {
      const iceState = peerConnection.current?.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') { if (callStateRef.current !== 'connected') { updateCallState('connected'); startCallTimer(); if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current); setConnectionError(null); } }
      else if (iceState === 'failed') { setConnectionError('Connection failed. Retrying...'); peerConnection.current?.restartIce?.(); }
      else if (iceState === 'disconnected') setConnectionError('Connection lost. Reconnecting...');
    };
    peerConnection.current.onicecandidate = (event) => { if (event.candidate) addDoc(collection(db, 'chat_threads', threadId, 'call_candidates'), { senderId: user.uid, candidate: event.candidate.toJSON() }).catch(() => { }); };
    peerConnection.current.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteMediaRef.current) remoteMediaRef.current.srcObject = event.streams[0];
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0];
    };
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => { if (callStateRef.current !== 'connected') { setConnectionError('Call timed out.'); endCall(); } }, 30000);
    try {
      const oldCandidates = await getDocs(collection(db, 'chat_threads', threadId, 'call_candidates')); await Promise.all(oldCandidates.docs.map(c => deleteDoc(c.ref).catch(() => { })));
      const constraints = isVideo ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { facingMode: 'user', width: 640, height: 480 } } : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
      const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      const { processedStream, audioCtx, canvasInterval } = await setupMaskedMedia(rawStream, videoMode, useAudioMask);
      audioContextRef.current = audioCtx; canvasIntervalRef.current = canvasInterval; localStreamRef.current = processedStream;
      processedStream.getTracks().forEach(track => peerConnection.current.addTrack(track, processedStream));
      const offer = await peerConnection.current.createOffer(); await peerConnection.current.setLocalDescription(offer);
      await setDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'), { status: 'ringing', callerId: user.uid, offer: { type: offer.type, sdp: offer.sdp }, isVideo, videoMode, callMode: mode, timestamp: Date.now() });
    } catch (err) { alert('Call failed: ' + err.message); endCallLocally(); }
  };

  const answerCall = async () => {
    peerConnection.current = new RTCPeerConnection(iceServers);
    peerConnection.current.oniceconnectionstatechange = () => {
      const iceState = peerConnection.current?.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') { if (callStateRef.current !== 'connected') { updateCallState('connected'); startCallTimer(); if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current); setConnectionError(null); } }
      else if (iceState === 'failed') { setConnectionError('Connection failed. Retrying...'); peerConnection.current?.restartIce?.(); }
      else if (iceState === 'disconnected') setConnectionError('Connection lost. Reconnecting...');
    };
    peerConnection.current.onicecandidate = (event) => { if (event.candidate) addDoc(collection(db, 'chat_threads', threadId, 'call_candidates'), { senderId: user.uid, candidate: event.candidate.toJSON() }).catch(() => { }); };
    peerConnection.current.ontrack = (event) => { remoteStreamRef.current = event.streams[0]; if (remoteMediaRef.current) remoteMediaRef.current.srcObject = event.streams[0]; if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0]; };
    try {
      const callDoc = await getDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data')); const callData = callDoc.data();
      const constraints = callData.isVideo ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { facingMode: 'user', width: 640, height: 480 } } : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
      const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      const { processedStream, audioCtx, canvasInterval } = await setupMaskedMedia(rawStream, callData.videoMode || 'raw', false);
      audioContextRef.current = audioCtx; canvasIntervalRef.current = canvasInterval; localStreamRef.current = processedStream;
      processedStream.getTracks().forEach(track => peerConnection.current.addTrack(track, processedStream));
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(callData.offer));
      for (const c of pendingCandidates.current) try { await peerConnection.current.addIceCandidate(c); } catch (e) { }
      pendingCandidates.current = [];
      const answer = await peerConnection.current.createAnswer(); await peerConnection.current.setLocalDescription(answer);
      await updateDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'), { status: 'answered', answer: { type: answer.type, sdp: answer.sdp } });
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current); setConnectionError(null);
    } catch (err) { alert('Answer failed: ' + err.message); endCallLocally(); }
  };

  const endCall = async () => {
    const dur = callDurationRef.current; await setDoc(doc(db, 'chat_threads', threadId, 'call_signal', 'data'), { status: 'ended' });
    try {
      const activeKey = encryptionKeys[encryptionKeys.length - 1]; const callType = isVideoEnabled ? 'Video Call' : 'Audio Call';
      const msgText = dur > 0 ? `📞 \${callType} - \${formatCallTime(dur)}` : `📞 Missed \${callType}`;
      const enc = await encryptText(msgText, activeKey);
      await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: null, reactions: {}, expiresAt: null, isEdited: false });
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
    } catch (e) { } endCallLocally();
  };

  const endCallLocally = () => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current); if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(track => track.stop()); localStreamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (canvasIntervalRef.current) { clearInterval(canvasIntervalRef.current); canvasIntervalRef.current = null; }
    clearInterval(callDurationTimer.current); pendingCandidates.current = []; remoteStreamRef.current = null;
    if (remoteMediaRef.current) remoteMediaRef.current.srcObject = null; if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null; if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setCallDuration(0); callDurationRef.current = 0; setIsMuted(false); setIsVideoEnabled(false); setIsLocalVideoOff(false); setCallMode('audio_raw'); updateCallState('idle'); setConnectionError(null);
  };

  const initiateCallPrompt = () => updateCallState('prompting');
  const startCallTimer = () => { setCallDuration(0); callDurationRef.current = 0; callDurationTimer.current = setInterval(() => setCallDuration(prev => { const next = prev + 1; callDurationRef.current = next; return next; }), 1000); };
  const formatCallTime = (seconds) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `\${m}:\${s < 10 ? '0' : ''}\${s}`; };
  const toggleMute = () => { if (localStreamRef.current) { const t = localStreamRef.current.getAudioTracks()[0]; if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); } } };
  const toggleVideo = () => { if (localStreamRef.current) { const t = localStreamRef.current.getVideoTracks()[0]; if (t) { t.enabled = !t.enabled; setIsLocalVideoOff(!t.enabled); } } };

  useEffect(() => { if (threadId && user && messages.length > 0 && !showScrollButton) updateDoc(doc(db, 'chat_threads', threadId), { [`lastRead.${user.uid}`]: Date.now() }).catch(() => { }); }, [threadId, user, messages.length, showScrollButton]);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      if (showScrollButton && prevMsgCount.current > 0) setUnreadCount(prev => prev + (messages.length - prevMsgCount.current));
      else setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, showScrollButton]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target; const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100;
    setShowScrollButton(isScrolledUp);
    if (!isScrolledUp) { setUnreadCount(0); if (messages.length > 0) updateDoc(doc(db, 'chat_threads', threadId), { [`lastRead.${user.uid}`]: Date.now() }).catch(() => { }); }
    if (scrollTop === 0) setMsgLimit(prev => prev + 30);
  };
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollButton(false); setUnreadCount(0); };

  useEffect(() => {
    const q = query(collection(db, 'chat_threads', threadId, 'messages'), orderBy('timestamp', 'desc'), limit(msgLimit));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); const now = Date.now(); const validRaw = [];
      raw.forEach(msg => { if (msg.expiresAt && msg.expiresAt <= now) deleteDoc(doc(db, 'chat_threads', threadId, 'messages', msg.id)).catch(() => { }); else validRaw.push(msg); });
      validRaw.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const videoGroups = {}; const docGroups = {}; const normalMessages = [];
      validRaw.forEach(msg => {
        if (msg.type === 'video_chunk') { if (!videoGroups[msg.videoGroupId]) videoGroups[msg.videoGroupId] = []; videoGroups[msg.videoGroupId].push(msg); }
        else if (msg.type === 'doc_chunk') { if (!docGroups[msg.docGroupId]) docGroups[msg.docGroupId] = []; docGroups[msg.docGroupId].push(msg); }
        else normalMessages.push(msg);
      });
      const assembledVideos = [];
      for (const [groupId, chunks] of Object.entries(videoGroups)) {
        const total = chunks[0].totalChunks;
        if (chunks.length === total) { chunks.sort((a, b) => a.chunkIndex - b.chunkIndex); const fullEncText = chunks.map(c => c.text).join(''); assembledVideos.push({ id: groupId, senderId: chunks[0].senderId, senderName: chunks[0].senderName, type: 'video', text: fullEncText, timestamp: chunks[0].timestamp, replyToId: chunks[0].replyToId, reactions: chunks[0].reactions || {}, expiresAt: chunks[0].expiresAt }); }
        else { assembledVideos.push({ id: groupId, senderId: chunks[0].senderId, senderName: chunks[0].senderName, type: 'video_loading', progress: chunks.length, total: total, timestamp: chunks[0].timestamp }); }
      }
      const assembledDocs = [];
      for (const [groupId, chunks] of Object.entries(docGroups)) {
        const total = chunks[0].totalChunks;
        if (chunks.length === total) { chunks.sort((a, b) => a.chunkIndex - b.chunkIndex); const fullEncText = chunks.map(c => c.text).join(''); assembledDocs.push({ id: groupId, senderId: chunks[0].senderId, senderName: chunks[0].senderName, type: 'document', text: fullEncText, fileName: chunks[0].fileName, fileSize: chunks[0].fileSize, timestamp: chunks[0].timestamp, replyToId: chunks[0].replyToId, reactions: chunks[0].reactions || {}, expiresAt: chunks[0].expiresAt }); }
        else { assembledDocs.push({ id: groupId, senderId: chunks[0].senderId, senderName: chunks[0].senderName, type: 'video_loading', progress: chunks.length, total: total, timestamp: chunks[0].timestamp, fileName: chunks[0].fileName }); }
      }
      const combinedRaw = [...normalMessages, ...assembledVideos, ...assembledDocs].sort((a, b) => a.timestamp - b.timestamp);
      const processed = await Promise.all(combinedRaw.map(async (msg) => {
        if (msg.type === 'video_loading') return { ...msg, isDecrypted: true };
        if (decryptionCache.current[msg.id] && msg.isEdited && decryptionCache.current[`${msg.id}_edited`] !== msg.text) delete decryptionCache.current[msg.id];
        if (decryptionCache.current[msg.id]) return { ...msg, decryptedText: decryptionCache.current[msg.id], isDecrypted: true };
        let decrypted = null; for (const k of encryptionKeys) { decrypted = await decryptText(msg.text, k); if (decrypted !== null) break; }
        if (decrypted !== null) { decryptionCache.current[msg.id] = decrypted; if (msg.isEdited) decryptionCache.current[`${msg.id}_edited`] = msg.text; }
        return { ...msg, decryptedText: decrypted, isDecrypted: decrypted !== null };
      }));
      setMessages(processed);
    });
    return () => unsubscribe();
  }, [threadId, encryptionKeys, msgLimit]);

  const handleTypingChange = (e) => {
    setInputText(e.target.value);
    if (!isTypingLocal.current && e.target.value.trim() !== '') { isTypingLocal.current = true; updateDoc(doc(db, 'chat_threads', threadId), { [`typing.${user.uid}`]: true }).catch(() => { }); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { isTypingLocal.current = false; updateDoc(doc(db, 'chat_threads', threadId), { [`typing.${user.uid}`]: false }).catch(() => { }); }, 2000);
  };
  const handleRenameChat = async (e) => { e.preventDefault(); if (!newChatName.trim()) { setIsEditingName(false); return; } try { await updateDoc(doc(db, 'chat_threads', threadId), { [isGroup ? 'name' : 'customName']: newChatName.trim() }); setIsEditingName(false); } catch (err) { } };
  const handleSendText = async (e) => {
    if (e) e.preventDefault(); if (!inputText.trim() || !user) return;
    const txt = inputText; setInputText(''); const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    const activeKey = encryptionKeys[encryptionKeys.length - 1]; clearTimeout(typingTimeoutRef.current);
    if (isTypingLocal.current) { isTypingLocal.current = false; updateDoc(doc(db, 'chat_threads', threadId), { [`typing.${user.uid}`]: false }).catch(() => { }); }
    try {
      const enc = await encryptText(txt, activeKey);
      if (editingMsg) { await updateDoc(doc(db, 'chat_threads', threadId, 'messages', editingMsg.id), { text: enc, isEdited: true }); setEditingMsg(null); }
      else { await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: replyId, reactions: {}, expiresAt: null, isEdited: false }); }
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
      if (!editingMsg) scrollToBottom();
    } catch (err) { }
  };

  const startEditing = (msg) => { setEditingMsg(msg); setReplyingTo(null); setInputText(msg.decryptedText); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const deleteMessage = async (msgId) => { try { await deleteDoc(doc(db, 'chat_threads', threadId, 'messages', msgId)); } catch (err) { } };
  const handleSendSticker = async (webpBase64) => {
    setShowStickerPicker(false); const activeKey = encryptionKeys[encryptionKeys.length - 1];
    try {
      const enc = await encryptText(webpBase64, activeKey);
      await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'sticker', timestamp: Date.now(), replyToId: replyingTo ? replyingTo.id : null, reactions: {}, expiresAt: null });
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
      setReplyingTo(null); scrollToBottom();
    } catch (err) { }
  };

  const processAndSendMedia = async (file, burnOverride = null) => {
    if (!file || !user) return; setIsUploading(true); const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    const activeKey = encryptionKeys[encryptionKeys.length - 1]; const expiryTimestamp = burnOverride ? Date.now() + Number(burnOverride) : null;
    try {
      if (file.type.startsWith('video/')) {
        if (file.size > 15 * 1024 * 1024) { alert("Max size is 15MB."); setIsUploading(false); return; }
        setUploadText("Encrypting video..."); const base64Vid = await blobToBase64(file); const encVid = await encryptText(base64Vid, activeKey);
        const CHUNK_SIZE = 700000; const totalChunks = Math.ceil(encVid.length / CHUNK_SIZE); const videoGroupId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        for (let i = 0; i < totalChunks; i++) { setUploadText(`Packet ${i + 1}/${totalChunks}...`); const chunkText = encVid.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, type: 'video_chunk', videoGroupId, chunkIndex: i, totalChunks, text: chunkText, timestamp: Date.now() + i, replyToId: replyId, reactions: {}, expiresAt: expiryTimestamp }); }
      } else if (file.type.startsWith('image/')) {
        setUploadText("Encrypting image..."); const b64 = await compressImage(file); const enc = await encryptText(b64, activeKey);
        await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'image', timestamp: Date.now(), replyToId: replyId, reactions: {}, expiresAt: expiryTimestamp });
      } else {
        if (file.size > 20 * 1024 * 1024) { alert("Max size is 20MB."); setIsUploading(false); return; }
        setUploadText("Encrypting doc..."); const base64Doc = await blobToBase64(file); const encDoc = await encryptText(base64Doc, activeKey);
        const CHUNK_SIZE = 700000;
        if (encDoc.length > CHUNK_SIZE) {
          const totalChunks = Math.ceil(encDoc.length / CHUNK_SIZE); const docGroupId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
          for (let i = 0; i < totalChunks; i++) { setUploadText(`Packet ${i + 1}/${totalChunks}`); const chunkText = encDoc.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, type: 'doc_chunk', docGroupId, chunkIndex: i, totalChunks, text: chunkText, fileName: file.name, fileSize: file.size, timestamp: Date.now() + i, replyToId: replyId, reactions: {}, expiresAt: expiryTimestamp }); }
        } else {
          await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: encDoc, type: 'document', fileName: file.name, fileSize: file.size, timestamp: Date.now(), replyToId: replyId, reactions: {}, expiresAt: expiryTimestamp });
        }
      }
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() });
    } catch (err) { } finally { setIsUploading(false); setUploadText(''); scrollToBottom(); }
  };

  const handleSendBurnMessage = async (e) => {
    e.preventDefault(); if (!user || (!burnText.trim() && !burnFile)) return; setShowBurnModal(false);
    const activeKey = encryptionKeys[encryptionKeys.length - 1]; const expiryTimestamp = Date.now() + Number(burnDuration);
    if (burnText.trim()) { try { const enc = await encryptText(burnText, activeKey); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: null, reactions: {}, expiresAt: expiryTimestamp }); await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }); } catch (e) { } }
    if (burnFile) await processAndSendMedia(burnFile, burnDuration); setBurnText(''); setBurnFile(null); scrollToBottom();
  };

  const saveStickerToVault = async (base64Str) => { try { const webpStr = await createStickerFromImage(base64Str); let newVault = [webpStr, ...savedStickers].slice(0, 20); setSavedStickers(newVault); localStorage.setItem('commslink_stickers', JSON.stringify(newVault)); } catch (err) { } };
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0; if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { processAndSendMedia(e.dataTransfer.files[0]); } };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } }); mediaStreamRef.current = stream;
      let options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 12000 }; if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm', audioBitsPerSecond: 12000 };
      const mediaRecorder = new MediaRecorder(stream, options); mediaRecorderRef.current = mediaRecorder; mediaChunksRef.current = []; const activeKey = encryptionKeys[encryptionKeys.length - 1];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) mediaChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        setIsUploading(true); setUploadText("Encrypting Audio..."); clearInterval(recordingTimerRef.current); setRecordingTime(0);
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' }); mediaStreamRef.current.getTracks().forEach(track => track.stop());
        try { const base64Audio = await blobToBase64(blob); const encAudio = await encryptText(base64Audio, activeKey); await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: encAudio, type: 'audio', timestamp: Date.now(), replyToId: replyingTo ? replyingTo.id : null, reactions: {}, expiresAt: null }); await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() }); await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }); setReplyingTo(null); scrollToBottom(); } catch (error) { }
        setIsUploading(false); setUploadText('');
      };
      mediaRecorder.start(); setIsRecording(true); recordingTimerRef.current = setInterval(() => { setRecordingTime((prev) => { if (prev >= 60) { stopRecording(); return 0; } return prev + 1; }); }, 1000);
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
  const burnTimeOptions = [{ label: '1 Minute', val: 60000 }, { label: '5 Minutes', val: 300000 }, { label: '1 Hour', val: 3600000 }, { label: '24 Hours', val: 86400000 }];

  return (
    <div className={`flex-1 flex flex-col relative ${t.chatBg} min-h-0 overflow-x-hidden`} onClick={() => { setActiveMenu(null); setIsTimeDropdownOpen(false); setShowStickerPicker(false); }} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <video ref={remoteMediaRef} autoPlay playsInline muted className={`absolute top-0 left-0 object-cover transition-opacity duration-300 ${callState === 'connected' && isVideoEnabled ? 'w-full h-full opacity-100 z-[490]' : 'w-1 h-1 opacity-0 pointer-events-none -z-10'}`} />
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* WEBRTC OVERLAYS */}
      {callState === 'prompting' && (
        <div className="absolute inset-0 z-[500] glass-dark flex flex-col items-center justify-center p-6 animate-fade-in overflow-y-auto">
          <ShieldAlert className={`w-14 h-14 ${t.text} mb-6 animate-pulse-ring`} />
          <h2 className="text-3xl font-bold font-mono text-white mb-8 tracking-wider">SECURE UPLINK</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg mb-8">
            <button onClick={() => startCall('audio_raw')} className="py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all flex items-center justify-center gap-3 border border-white/5"><Phone className="w-5 h-5" /> Standard Audio</button>
            <button onClick={() => startCall('audio_masked')} className={`py-4 rounded-xl bg-gradient-to-r ${t.btnGrad} text-white font-bold shadow-lg flex items-center justify-center gap-3`}><MicOff className="w-5 h-5" /> Masked Audio</button>
            <button onClick={() => startCall('video_raw')} className="py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all flex items-center justify-center gap-3 border border-white/5"><Video className="w-5 h-5" /> Raw Video Feed</button>
            <button onClick={() => startCall('video_blur')} className="py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all flex items-center justify-center gap-3 border border-blue-500/30"><VideoOff className="w-5 h-5" /> Privacy Blur</button>
            <button onClick={() => startCall('video_jam')} className="py-4 md:col-span-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold transition-all flex items-center justify-center gap-3 border border-red-500/30"><ShieldCheck className="w-5 h-5" /> Signal Jam Video</button>
          </div>
          <button onClick={() => updateCallState('idle')} className="py-3 px-8 rounded-full text-slate-400 hover:text-white font-semibold hover:bg-white/5 transition-all outline-none">Cancel</button>
        </div>
      )}
      {callState === 'calling' && (
        <div className="absolute inset-0 z-[500] bg-[#07080d] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full border border-indigo-500/30 call-ring" />
            <div className={`w-28 h-28 rounded-full bg-[#0d0e15] border border-white/10 flex items-center justify-center z-10 relative`}>
              {isVideoEnabled ? <Video className={`w-12 h-12 ${t.text}`} /> : callMode === 'audio_masked' ? <Fingerprint className={`w-12 h-12 ${t.text}`} /> : <PhoneCall className={`w-12 h-12 ${t.text}`} />}
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Establishing Uplink</h2>
          <p className="text-sm text-slate-500 mb-14">{isVideoEnabled ? 'Encrypted Video' : 'Encrypted Audio'}</p>
          {connectionError && <div className="text-red-400 mb-4 flex items-center gap-2 font-medium"><AlertCircle className="w-4 h-4" /> {connectionError}</div>}
          <button onClick={endCall} className="w-[72px] h-[72px] bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all hover:scale-110"><PhoneOff className="w-8 h-8 text-white" /></button>
        </div>
      )}
      {callState === 'ringing' && (
        <div className="absolute inset-0 z-[500] bg-[#07080d] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full border border-green-500/40 call-ring" />
            <div className="absolute inset-0 rounded-full border border-green-500/20 call-ring-delay" />
            <div className={`w-28 h-28 rounded-full bg-[#0d0e15] border border-white/10 flex items-center justify-center z-10 relative animate-pulse-ring`}>
              {isVideoEnabled ? <Video className={`w-12 h-12 ${t.text}`} /> : callMode === 'audio_masked' ? <Fingerprint className={`w-12 h-12 ${t.text}`} /> : <Phone className={`w-12 h-12 ${t.text}`} />}
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Incoming {isVideoEnabled ? 'Video' : 'Call'}</h2>
          <p className="text-sm text-slate-400 mb-14 tracking-wide uppercase font-semibold text-green-400/80">End-to-End Encrypted</p>
          <div className="flex gap-10">
            <button onClick={endCall} className="w-[72px] h-[72px] bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all hover:scale-110"><PhoneOff className="w-8 h-8 text-white" /></button>
            <button onClick={answerCall} className="w-[72px] h-[72px] bg-green-500 hover:bg-green-400 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all hover:scale-110 animate-bounce"><Phone className="w-8 h-8 text-white" /></button>
          </div>
        </div>
      )}
      {callState === 'connected' && (
        <div className={`absolute inset-0 z-[500] flex flex-col items-center justify-center animate-fade-in overflow-hidden ${isVideoEnabled ? 'bg-transparent' : 'bg-[#07080d]'}`}>
          {isVideoEnabled ? (
            <div className="absolute top-6 right-6 w-32 h-48 md:w-44 md:h-60 bg-black border border-white/20 rounded-2xl overflow-hidden shadow-2xl z-10 animate-pop-in">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
            </div>
          ) : (
            <div className="animate-pop-in flex flex-col items-center">
              <div className={`w-32 h-32 rounded-full bg-[#0d0e15] border-2 ${isMuted ? 'border-amber-500/50' : 'border-green-500/50'} flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(34,197,94,0.15)]`}>
                <User className={`w-14 h-14 ${isMuted ? 'text-amber-500' : 'text-green-400'}`} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Link Established</h2>
              <span className={`text-sm font-mono px-4 py-1.5 rounded-full mb-8 border ${callMode === 'audio_masked' ? `${t.bgLight} ${t.border} ${t.text}` : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                {callMode === 'audio_masked' ? '🔐 Masked Audio' : '📞 Standard Audio'}
              </span>
            </div>
          )}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-5 px-8 py-5 bg-[#0d0e15]/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl animate-slide-up">
            <span className="font-mono text-green-400 font-bold text-lg mr-2">{formatCallTime(callDuration)}</span>
            <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${isMuted ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-white/10 text-white hover:bg-white/20 border border-transparent'}`}>{isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}</button>
            {isVideoEnabled && (<button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${isLocalVideoOff ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'bg-white/10 text-white hover:bg-white/20 border border-transparent'}`}>{isLocalVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}</button>)}
            <button onClick={endCall} className="w-14 h-14 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-transparent"><PhoneOff className="w-6 h-6 text-white" /></button>
          </div>
        </div>
      )}

      {/* Main Header */}
      <header className="bg-[#0b0c10]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between z-30 shrink-0 shadow-sm relative support-glass">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={goBack} className="md:hidden p-2 -ml-3 text-slate-400 hover:text-white rounded-full hover:bg-white/5 transition-all outline-none"><ChevronLeft className="w-5 h-5" /></button>
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${t.bgLight} border border-white/5 flex items-center justify-center shrink-0 shadow-md ${t.glow} overflow-hidden cursor-pointer active:scale-95 transition-transform`} onClick={() => { setNewChatName(chatName); setIsEditingName(true); }}>
            {isGroup ? <Users className={`w-5 h-5 ${t.text}`} /> : (chatAvatar ? <img src={chatAvatar} className="w-full h-full object-cover" /> : <User className={`w-5 h-5 ${t.text}`} />)}
          </div>
          <div className="flex flex-col truncate group cursor-pointer py-1" onClick={() => { setNewChatName(chatName); setIsEditingName(true); }}>
            <h2 className="text-[17px] font-bold text-slate-200 flex items-center gap-2 truncate hover:text-white transition-colors">
              {chatName} <PenLine className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              {someoneIsTyping ? (
                <div className="flex items-center gap-1.5"><div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-indigo-400 typing-dot-1" /><div className="w-1 h-1 rounded-full bg-indigo-400 typing-dot-2" /><div className="w-1 h-1 rounded-full bg-indigo-400 typing-dot-3" /></div><span className={`text-[12px] font-semibold ${t.text}`}>{typingName} is typing...</span></div>
              ) : (
                <p className="text-[12px] font-medium text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3" /> {isGroup ? `${memberCount} Members` : 'E2E Encrypted'}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          {!isGroup && (<button onClick={initiateCallPrompt} className="p-2.5 rounded-full text-slate-400 hover:text-green-400 hover:bg-green-500/10 transition-all outline-none" title="Start Call"><Video className="w-[18px] h-[18px]" /></button>)}
          <button onClick={changeKey} className="p-2.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all outline-none" title="Encryption Keys"><Key className="w-[18px] h-[18px]" /></button>
          <button onClick={() => setShowBurnModal(true)} className="p-2.5 rounded-full text-slate-400 hover:text-orange-400 hover:bg-orange-500/10 transition-all outline-none" title="Burn Message"><Flame className="w-[18px] h-[18px]" /></button>
          <button onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); }} className={`p-2.5 rounded-full transition-all outline-none ${showSearch ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title="Search"><Search className="w-[18px] h-[18px]" /></button>
        </div>
      </header>
      {showSearch && (
        <div className="bg-[#1a1b28] border-b border-white/5 px-6 py-3 flex items-center gap-3 animate-slide-up origin-top shadow-inner">
          <Search className="w-4 h-4 text-slate-400" />
          <input type="text" autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search encrypted history..." className="w-full bg-transparent outline-none text-[14px] font-medium text-white placeholder:text-slate-500" />
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 flex flex-col custom-scrollbar min-h-0 relative bg-[#07080d]" onScroll={handleScroll} ref={messagesContainerRef}>
        {filteredMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-60">
            <ShieldCheck className="w-16 h-16 mb-4 drop-shadow-lg" />
            <p className="text-sm font-medium tracking-wide">{searchQuery ? 'No matches found.' : 'Secure channel connected.'}</p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isMine = msg.senderId === user.uid; const repliedMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
            const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0; const isRead = !isGroup && chatData?.lastRead && chatData.lastRead[otherUserId] >= msg.timestamp;
            const prevMsg = index > 0 ? filteredMessages[index - 1] : null; const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId && (msg.timestamp - prevMsg.timestamp < 300000);
            let showDayDivider = false; let dayString = ''; if (index === 0) { showDayDivider = true; dayString = formatDay(msg.timestamp); } else if (!isSameDay(prevMsg.timestamp, msg.timestamp)) { showDayDivider = true; dayString = formatDay(msg.timestamp); }
            return (
              <MessageItem key={msg.id} index={index} msg={msg} isMine={isMine} isGroup={isGroup} isConsecutive={isConsecutive} repliedMsg={repliedMsg} hasReactions={hasReactions} isRead={isRead} user={user} t={t} themeMode={themeMode} toggleReaction={toggleReaction} activeMenu={activeMenu} setActiveMenu={setActiveMenu} setReplyingTo={setReplyingTo} setZoomedImage={setZoomedImage} saveSticker={saveStickerToVault} showDayDivider={showDayDivider} dayString={dayString} startEditing={startEditing} deleteMessage={deleteMessage} />
            );
          })
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {showScrollButton && (
        <button onClick={scrollToBottom} className="absolute bottom-24 right-6 p-3 rounded-full bg-white/10 text-white shadow-xl border border-white/20 transition-all hover:scale-110 active:scale-95 z-40 animate-pop-in group backdrop-blur-md">
          <ArrowDown className="w-5 h-5 group-hover:animate-bounce" />
          {unreadCount > 0 && <span className={`absolute -top-1 -right-1 ${t.msgMine} text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-[#050508]`}>{unreadCount}</span>}
        </button>
      )}

      {/* Input Form */}
      <div className="bg-[#0b0c10]/95 backdrop-blur-2xl border-t border-white/5 z-20 shrink-0 pb-safe pt-2">
        {replyingTo && (
          <div className="mx-4 md:mx-6 mb-2 px-4 py-2.5 bg-[#1a1b28]/80 border border-white/5 rounded-2xl flex items-center justify-between animate-bouncy-slide-up origin-bottom">
            <div className={`flex flex-col border-l-4 ${t.border} pl-3`}>
              <span className={`text-[12px] font-bold ${t.text}`}>Replying to {replyingTo.senderName}</span>
              <span className="text-slate-400 text-[12px] truncate max-w-[200px] mt-0.5">{replyingTo.type === 'text' ? replyingTo.decryptedText : 'Media Attachments'}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1.5 text-slate-500 hover:text-white bg-white/5 rounded-full transition-all"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {editingMsg && (
          <div className="mx-4 md:mx-6 mb-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-between animate-bouncy-slide-up origin-bottom">
            <div className="flex flex-col border-l-4 border-blue-500 pl-3">
              <span className={`text-[12px] font-bold text-blue-400`}>Editing Message</span>
              <span className="text-blue-200/50 text-[12px] truncate max-w-[200px] mt-0.5">{editingMsg.decryptedText}</span>
            </div>
            <button onClick={() => { setEditingMsg(null); setInputText(''); }} className="p-1.5 text-blue-400 hover:text-white bg-white/5 rounded-full transition-all"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {showStickerPicker && (
          <div className="mx-4 md:mx-6 mb-2 p-5 bg-[#1a1b28] border border-white/5 rounded-2xl h-48 overflow-y-auto custom-scrollbar animate-slide-up">
            <h4 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-4 px-1">Sticker Vault</h4>
            {savedStickers.length === 0 ? (
              <p className="text-[12px] text-slate-500 italic px-1">Vault empty. Save a received image to add it here.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                {savedStickers.map((stk, i) => (
                  <img key={i} src={stk} onClick={() => handleSendSticker(stk)} className="w-full aspect-square object-contain cursor-pointer hover:scale-110 transition-transform drop-shadow-lg bg-black/40 rounded-xl p-1.5 border border-white/5 hover:border-white/20" alt="sticker" />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-4 md:px-6 flex gap-2.5 items-end pb-3">
          {!isRecording && (
            <div className="flex items-center gap-1.5 shrink-0 pb-1.5">
              <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { if (e.target.files[0]) { processAndSendMedia(e.target.files[0]); e.target.value = ''; } }} />
              <button onClick={() => fileInputRef.current?.click()} className="p-3 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-all outline-none" title="Attach"><Paperclip className="w-5 h-5" /></button>
              <button onClick={() => setShowStickerPicker(!showStickerPicker)} className={`p-3 rounded-full transition-all outline-none ${showStickerPicker ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`} title="Stickers"><Sticker className="w-5 h-5" /></button>
              <button onClick={startRecording} className="p-3 text-slate-400 hover:text-red-400 rounded-full hover:bg-red-500/10 transition-all outline-none" title="Voice Note"><Mic className="w-5 h-5" /></button>
            </div>
          )}

          <div className="flex-1 bg-[#1a1b28] border border-white/10 rounded-2xl transition-all focus-within:border-white/30 focus-within:shadow-lg shadow-sm min-h-[52px] flex items-center">
            {isUploading && uploadText ? (
              <div className="w-full flex justify-between px-5 animate-pulse">
                <span className={`font-semibold text-[13px] flex items-center gap-2 ${t.text} truncate`}><Loader2 className="w-4 h-4 animate-spin shrink-0" /> {uploadText}</span>
              </div>
            ) : isRecording ? (
              <div className="w-full flex justify-between items-center px-5 py-2">
                <span className="text-red-400 font-bold text-[13px] flex items-center gap-2 truncate">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Recording
                </span>
                <span className="text-red-400 font-mono font-bold tracking-wider">{Math.floor(recordingTime / 60)}:{recordingTime % 60 < 10 ? '0' : ''}{recordingTime % 60}</span>
              </div>
            ) : (
              <form onSubmit={handleSendText} className="flex-1 w-full h-full flex">
                <input type="text" value={inputText} onFocus={() => setShowStickerPicker(false)} onChange={handleTypingChange} placeholder="Enter message..."
                  className="w-full h-full bg-transparent px-5 text-[15px] outline-none text-slate-200 placeholder:text-slate-500 rounded-2xl" />
              </form>
            )}
          </div>

          <div className="shrink-0">
            {isRecording ? (
              <button onClick={stopRecording} className="bg-red-500 hover:bg-red-400 h-[52px] w-[52px] rounded-2xl text-white transition-all active:scale-95 shadow-lg flex items-center justify-center">
                <Square className="w-5 h-5 fill-current" />
              </button>
            ) : (
              <button onClick={handleSendText} disabled={(!inputText.trim() && !isUploading) || isUploading}
                className={`h-[52px] w-[52px] rounded-2xl text-white disabled:opacity-50 transition-all active:scale-95 shadow-lg flex items-center justify-center ${inputText.trim() ? `bg-gradient-to-br ${t.sendBtn}` : 'bg-white/10 text-slate-400'}`}>
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modals... */}
      {zoomedImage && (<div className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-zoom-out animate-fade-in" onClick={() => setZoomedImage(null)}><img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain animate-pop-in" onClick={e => e.stopPropagation()} /></div>)}

      {showBurnModal && (
        <div className="fixed inset-0 z-[1000] bg-[#07080d]/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-orange-400 flex items-center gap-2"><Flame className="w-5 h-5" /> Burn Protocol</h3>
              <button onClick={() => { setShowBurnModal(false); setBurnFile(null); }} className="text-slate-500 hover:text-white p-1 rounded-full hover:bg-white/5 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[12px] text-slate-400 mb-6 leading-relaxed">Content is encrypted and completely erased from the network the moment the timer expires.</p>
            <form onSubmit={handleSendBurnMessage}>
              {burnFile ? (
                <div className="relative mb-5 w-full h-36 bg-[#07080d] rounded-2xl border border-orange-500/30 flex items-center justify-center overflow-hidden group">
                  {burnFile.type.startsWith('image/') ? <img src={URL.createObjectURL(burnFile)} className="w-full h-full object-cover opacity-60" /> : <div className="flex flex-col items-center text-orange-400 opacity-60"><Play className="w-8 h-8 mb-2" /><span>{burnFile.name}</span></div>}
                  <button type="button" onClick={() => setBurnFile(null)} className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-sm rounded-full text-white hover:bg-red-500 transition-all"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <textarea autoFocus value={burnText} onChange={(e) => setBurnText(e.target.value)} placeholder="Type confidential payload..." rows="4" className="w-full bg-[#07080d] border border-orange-500/30 rounded-2xl px-4 py-3 mb-5 outline-none focus:border-orange-500 focus:shadow-[0_0_15px_rgba(249,115,22,0.2)] resize-none text-[14px] text-white custom-scrollbar transition-all" />
              )}
              <div className="flex items-center gap-3 mb-8">
                {!burnFile && !burnText && (<><input type="file" accept="image/*,video/*" className="hidden" ref={burnFileInputRef} onChange={e => { if (e.target.files[0]) setBurnFile(e.target.files[0]); }} /><button type="button" onClick={() => burnFileInputRef.current?.click()} className="p-3 bg-white/5 border border-white/5 rounded-2xl text-slate-400 hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all"><ImageIcon className="w-5 h-5" /></button></>)}
                <div className="relative flex-1">
                  <div onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)} className="flex items-center justify-between bg-white/5 px-4 py-3 rounded-2xl border border-white/5 cursor-pointer hover:border-white/20 transition-all">
                    <div className="flex items-center gap-2 text-slate-200 text-sm font-medium"><Clock className="w-4 h-4 text-slate-400" /> {burnTimeOptions.find(o => o.val === Number(burnDuration))?.label}</div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isTimeDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  {isTimeDropdownOpen && (
                    <ul className="absolute bottom-[110%] left-0 w-full mb-2 bg-[#1a1b28] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[210] animate-fade-in p-1">
                      {burnTimeOptions.map((opt) => (
                        <li key={opt.val} onClick={() => { setBurnDuration(opt.val); setIsTimeDropdownOpen(false); }} className={`px-4 py-2.5 my-0.5 rounded-xl text-sm font-medium cursor-pointer transition-all ${burnDuration === opt.val ? 'text-orange-400 bg-orange-500/10' : 'text-slate-300 hover:bg-white/5'}`}>{opt.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <button type="submit" disabled={!burnText.trim() && !burnFile} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold text-sm shadow-[0_0_20px_rgba(249,115,22,0.3)] disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2">
                <Flame className="w-4 h-4" /> Deploy Burn Mode
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditingName && (
        <div className="fixed inset-0 z-[1000] bg-[#07080d]/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <h3 className={`text-xl font-bold mb-1 text-white`}>Rename Channel</h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">Assign a local alias to this secure connection.</p>
            <form onSubmit={handleRenameChat}>
              <input type="text" autoFocus required value={newChatName} onChange={(e) => setNewChatName(e.target.value)} className={`w-full bg-[#07080d] border border-white/10 rounded-2xl px-4 py-3 mb-6 outline-none focus:border-white/30 text-white ${t.ring} focus:ring-1 transition-all text-sm`} placeholder="Enter channel name..." />
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsEditingName(false)} className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 font-bold text-sm text-white transition-all">Cancel</button>
                <button type="submit" className={`flex-1 py-3 rounded-2xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg transition-all hover:opacity-90 active:scale-95`}>Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 4. MAIN APP ROUTER & OVERALL LAYOUT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [chatThreads, setChatThreads] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [searchAgentText, setSearchAgentText] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('commslink_theme') || 'professional');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const t = themeStyles[themeMode] || themeStyles['professional'];

  useEffect(() => { const uc = onAuthStateChanged(auth, u => setUser(u)); return () => uc(); }, []);

  useEffect(() => {
    if (user) {
      updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }).catch(() => { });
      const i = setInterval(() => updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() }).catch(() => { }), 60000);
      const uq = query(collection(db, 'users'));
      const us = onSnapshot(uq, (snap) => setUsersList(snap.docs.map(doc => doc.data())));
      const q = query(collection(db, 'chat_threads'), where('participants', 'array-contains', user.uid), orderBy('lastActivity', 'desc'));
      const qs = onSnapshot(q, snap => setChatThreads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
      return () => { clearInterval(i); us(); qs(); };
    }
  }, [user]);

  const handleLogout = async () => { if (user) await updateDoc(doc(db, 'users', user.uid), { lastSeen: Date.now() - 300000 }); await signOut(auth); };

  const startPrivateChat = async (otherAgentId) => {
    const existing = chatThreads.find(t => !t.isGroup && t.participants.includes(otherAgentId));
    if (existing) { setActiveChat(existing); setIsSidebarOpen(false); return; }
    try {
      const activeKey = 'default_secure_key_123';
      const ref = await addDoc(collection(db, 'chat_threads'), { isGroup: false, participants: [user.uid, otherAgentId], lastActivity: Date.now(), participantNames: { [user.uid]: user.displayName, [otherAgentId]: 'Agent' }, encryptionKeys: [activeKey] });
      setActiveChat({ id: ref.id, isGroup: false, participants: [user.uid, otherAgentId], encryptionKeys: [activeKey] }); setIsSidebarOpen(false); setSearchAgentText('');
    } catch (e) { }
  };
  const startGroupChat = async () => {
    const name = prompt("Group Name:"); if (!name) return;
    try {
      const activeKey = 'default_group_key_' + Math.random().toString(36).substr(2, 5);
      const ref = await addDoc(collection(db, 'chat_threads'), { isGroup: true, name, participants: [user.uid], lastActivity: Date.now(), encryptionKeys: [activeKey] });
      setActiveChat({ id: ref.id, isGroup: true, name, participants: [user.uid], encryptionKeys: [activeKey] }); setIsSidebarOpen(false);
    } catch (e) { }
  };
  const deleteChat = async () => { if (activeChat) { try { await deleteDoc(doc(db, 'chat_threads', activeChat.id)); setActiveChat(null); setIsSidebarOpen(true); } catch (e) { } } };

  // Generate missing avatars
  const getAvatar = (agentId) => {
    let hash = 0; for (let i = 0; i < agentId.length; i++) hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${hash % 360}, 70%, 60%)`;
  };

  if (user === null) return <AuthScreen t={t} />;

  return (
    <div className={`flex h-[100dvh] w-full bg-[#07080d] text-slate-200 overflow-hidden font-sans relative`}>
      {/* Sidebar background effect */}
      <div className="absolute top-0 left-0 w-80 h-full bg-[#0b0c10] border-r border-white/5 z-0 hidden md:block" />

      {/* Sidebar View */}
      <div className={`${!activeChat || isSidebarOpen ? 'flex' : 'hidden'} md:flex w-full md:w-80 flex-col relative z-20 shrink-0 bg-[#0b0c10]/95 backdrop-blur-xl md:bg-transparent shadow-xl md:shadow-none transition-all`}>
        {/* App Header */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-[17px] font-bold tracking-tight text-white leading-tight">CommsLink</h1>
                <p className="text-[11px] font-semibold text-green-400 tracking-wider">SECURE UPLINK</p>
              </div>
            </div>
            <button onClick={() => setShowProfile(true)} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all border border-white/5">
              <Settings className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Search agents..." value={searchAgentText} onChange={e => setSearchAgentText(e.target.value)}
              className="w-full bg-[#12131a] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-indigo-500/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.1)] transition-all" />
          </div>
        </div>

        {/* Channels List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar pb-safe">
          <div className="flex items-center justify-between px-2 pt-2 mb-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Channels & Agents</h3>
            <button onClick={startGroupChat} className={`text-slate-400 hover:text-white transition-colors`} title="Create Channel"><Plus className="w-4 h-4" /></button>
          </div>

          {searchAgentText.trim() ? (
            <div className="space-y-1 mt-2">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-3 mb-2">Directory Search</p>
              {usersList.filter(u => u.uid !== user.uid && (u.displayName?.toLowerCase().includes(searchAgentText.toLowerCase()) || u.agentId?.toLowerCase().includes(searchAgentText.toLowerCase()))).map(u => (
                <div key={u.uid} onClick={() => startPrivateChat(u.uid)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/5 transition-all text-slate-300 hover:text-white`}>
                  <div className={`w-10 h-10 rounded-full font-bold text-white flex justify-center items-center text-sm shadow-md overflow-hidden shrink-0 border border-white/5`} style={!u.avatarData ? { backgroundColor: getAvatar(u.agentId) } : {}}>
                    {u.avatarData ? <img src={u.avatarData} className="w-full h-full object-cover" /> : u.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-[14px] font-bold truncate leading-tight">{u.displayName}</p>
                    <p className="text-[12px] opacity-60 font-mono truncate mt-0.5">@{u.agentId}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            chatThreads.map(thread => {
              const isActive = activeChat?.id === thread.id;
              const isGroup = thread.isGroup;
              let title = isGroup ? thread.name : 'Unknown';
              let otherUser = null; let avatar = null;
              if (!isGroup) {
                const oid = thread.participants.find(id => id !== user.uid);
                otherUser = usersList.find(u => u.uid === oid);
                title = thread.customName || otherUser?.displayName || thread.participantNames?.[oid] || 'Unknown Agent';
                avatar = otherUser?.avatarData;
              }
              const isOnline = otherUser && (Date.now() - (otherUser.lastSeen || 0) < 60000);
              const unread = thread.lastRead && thread.lastActivity > (thread.lastRead[user.uid] || 0);

              return (
                <div key={thread.id} onClick={() => { setActiveChat(thread); setIsSidebarOpen(false); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all active:scale-95 group ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}>
                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-full flex justify-center items-center text-sm shadow-md overflow-hidden font-bold text-white border border-white/5 transition-transform group-hover:scale-105`} style={(!isGroup && !avatar) ? { backgroundColor: 'transparent' } : {}}>
                      {isGroup ? <div className={`w-full h-full bg-gradient-to-br ${t.bgLight} flex items-center justify-center`}><Users className={`w-5 h-5 ${t.text}`} /></div> : (avatar ? <img src={avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-slate-800">{title.charAt(0).toUpperCase()}</div>)}
                    </div>
                    {!isGroup && <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${isOnline ? 'bg-green-500 border-[#0d0e15]' : 'bg-slate-600 border-[#0d0e15]'} border-[2.5px] rounded-full z-10`} />}
                  </div>
                  <div className="flex-1 overflow-hidden min-w-0 pr-2">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <p className={`font-bold text-[14px] truncate leading-tight ${isActive ? 'text-white' : 'text-slate-300'}`}>{title}</p>
                      <span className="text-[10px] text-slate-500 font-medium ml-2 shrink-0">{formatDay(thread.lastActivity)}</span>
                    </div>
                    {thread.typing && Object.keys(thread.typing).some(k => k !== user.uid && thread.typing[k]) ? (
                      <p className={`text-[12px] font-semibold truncate ${t.text} flex items-center gap-1`}><PenLine className="w-3 h-3" /> typing...</p>
                    ) : (
                      <div className="flex items-center gap-1 text-[12px] opacity-60">
                        {unread && !isActive ? <span className={`w-2 h-2 rounded-full ${t.bgLight} ${t.glow}`} /> : null}
                        <span className={`truncate font-medium ${unread && !isActive ? 'text-white' : 'text-slate-400'}`}>Encrypted Message</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`${activeChat && !isSidebarOpen ? 'flex' : 'hidden'} md:flex flex-1 flex-col relative z-10 bg-[#07080d] min-w-0 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]`}>
        {activeChat ? (
          <ChatInterface user={user} usersList={usersList} threadId={activeChat.id} chatData={activeChat} encryptionKeys={activeChat.encryptionKeys} goBack={() => setIsSidebarOpen(true)} changeKey={() => setShowKeyModal(true)} deleteChat={deleteChat} t={t} themeMode={themeMode} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4 bg-[#07080d] text-center">
            <div className="w-24 h-24 rounded-full bg-white/5 border border-white/5 flex items-center justify-center mb-6 shadow-2xl relative">
              <Shield className={`w-10 h-10 ${t.text}`} />
              <div className="absolute inset-0 rounded-full border border-white/5 animate-pulse-ring" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">No Active Context</h2>
            <p className="max-w-xs text-sm text-slate-500 font-medium leading-relaxed">Select a channel or agent from the directory to establish a secure uplink.</p>
          </div>
        )}
      </div>

      {/* PROFILES AND SETTINGS MODALS */}
      {showProfile && (
        <div className="fixed inset-0 bg-[#07080d]/90 backdrop-blur-md flex justify-center items-center z-[1000] p-4 animate-fade-in" onClick={() => setShowProfile(false)}>
          <div className="bg-[#12131a] rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-white/10 animate-pop-in relative" onClick={e => e.stopPropagation()}>
            <div className="h-28 bg-gradient-to-br from-indigo-900 via-indigo-950 to-black relative">
              <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
            </div>
            <button onClick={() => setShowProfile(false)} className="absolute top-4 right-4 p-1.5 bg-black/40 backdrop-blur-md text-white/70 hover:text-white rounded-full z-10"><X className="w-5 h-5" /></button>
            <div className="px-6 pb-6 pt-0 relative flex flex-col items-center -mt-14">
              <div className="relative group mb-3">
                <div className="w-24 h-24 rounded-2xl bg-[#0d0e15] border-4 border-[#12131a] overflow-hidden flex items-center justify-center shadow-lg relative z-10">
                  {user.avatarData ? <img src={user.avatarData} className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-slate-500" />}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer rounded-2xl border-4 border-[#12131a]" onClick={() => document.getElementById('avatar-upload').click()}>
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={async (e) => { if (e.target.files[0]) { try { const b64 = await compressAvatar(e.target.files[0]); await updateDoc(doc(db, 'users', user.uid), { avatarData: b64 }); const usr = await getDoc(doc(db, 'users', user.uid)); setUser({ ...user, avatarData: usr.data().avatarData }); } catch (err) { } } }} />
              </div>
              <h2 className="text-xl font-bold text-white leading-tight">{user.displayName}</h2>
              <p className="text-sm font-mono text-slate-500 mt-1 mb-6">@{usersList.find(u => u.uid === user.uid)?.agentId || 'agent'}</p>

              <div className="w-full space-y-3 mb-6">
                <div className="p-3 bg-[#07080d] border border-white/5 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-slate-500 mb-2 px-1">Interface Theme</p>
                  <div className="flex gap-2">
                    {Object.entries(themeStyles).map(([key, val]) => (
                      <button key={key} onClick={() => { setThemeMode(key); localStorage.setItem('commslink_theme', key); }} className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 ${themeMode === key ? 'border-white shadow-lg' : 'border-transparent'}`} style={{ backgroundColor: val.accentColor }} title={val.name} />
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={handleLogout} className="w-full py-3.5 rounded-xl bg-red-500/10 text-red-400 font-bold text-[14px] border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" /> Terminate Session
              </button>
            </div>
          </div>
        </div>
      )}

      {showKeyModal && activeChat && (
        <div className="fixed inset-0 bg-[#07080d]/90 backdrop-blur-md flex justify-center items-center z-[1000] p-4 animate-fade-in" onClick={() => setShowKeyModal(false)}>
          <div className="bg-[#12131a] rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-white/10 animate-pop-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-xl font-bold flex items-center gap-2 text-white`}><Key className="w-5 h-5 text-yellow-500" /> Security Keys</h2>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl">
              <h3 className="text-sm font-bold text-yellow-500 mb-2">Current Active Key:</h3>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-black/40 px-3 py-2 rounded-lg text-yellow-400 flex-1 border border-yellow-500/20 shadow-inner overflow-hidden text-ellipsis">{activeChat.encryptionKeys[activeChat.encryptionKeys.length - 1]}</code>
                <button className="p-2 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-yellow-400 transition-colors" title="Copy to clipboard" onClick={() => navigator.clipboard.writeText(activeChat.encryptionKeys[activeChat.encryptionKeys.length - 1])}><Copy className="w-4 h-4" /></button>
              </div>
            </div>
            <button onClick={async () => {
              const mk = prompt("Enter new symmetric key for this channel (all members must share this key out-of-band):");
              if (mk && mk.trim()) { try { await updateDoc(doc(db, 'chat_threads', activeChat.id), { encryptionKeys: arrayUnion(mk.trim()) }); setShowKeyModal(false); } catch (err) { } }
            }} className="w-full py-3.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-bold text-sm text-white transition-all flex items-center justify-center gap-2 shadow-sm">
              <RefreshCw className="w-4 h-4" /> Rotate Key
            </button>
            <button onClick={() => { if (window.confirm("Disconnect from this channel?")) { deleteChat(); setShowKeyModal(false); } }} className="mt-3 w-full py-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-bold text-sm hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" /> Leave Channel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}