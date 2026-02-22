import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";
import { 
  Lock, Unlock, Send, Key, MessageSquare, ShieldAlert, 
  ShieldCheck, LogOut, User, Image as ImageIcon, Loader2, 
  RefreshCw, Share2, Check, Users, Palette, Reply, X, Smile,
  Mic, Square 
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

// --- Media Converters ---
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

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
  });
};

// --- Expanded Themes Configuration ---
const themeStyles = {
  cyberpunk: { name: 'Cyberpunk', text: 'text-cyan-400', border: 'border-cyan-500/30', ring: 'focus:ring-cyan-400', bgLight: 'bg-cyan-500/10', btnGrad: 'from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500', sendBtn: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500', msgMine: 'from-cyan-600/30 to-blue-600/20 border-cyan-500/30 text-cyan-50', glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]', title: 'text-[#00ff41] drop-shadow-[0_0_10px_rgba(0,255,65,0.4)]' },
  matrix: { name: 'Matrix', text: 'text-green-400', border: 'border-green-500/30', ring: 'focus:ring-green-400', bgLight: 'bg-green-500/10', btnGrad: 'from-green-700 to-green-500 hover:from-green-600 hover:to-green-400', sendBtn: 'from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500', msgMine: 'from-green-600/30 to-emerald-600/20 border-green-500/30 text-green-50', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.2)]', title: 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]' },
  crimson: { name: 'Crimson', text: 'text-red-500', border: 'border-red-500/30', ring: 'focus:ring-red-500', bgLight: 'bg-red-500/10', btnGrad: 'from-red-800 to-red-600 hover:from-red-700 hover:to-red-500', sendBtn: 'from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500', msgMine: 'from-red-600/30 to-orange-600/20 border-red-500/30 text-red-50', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.2)]', title: 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]' },
  synthwave: { name: 'Synthwave', text: 'text-pink-400', border: 'border-pink-500/30', ring: 'focus:ring-pink-400', bgLight: 'bg-pink-500/10', btnGrad: 'from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400', sendBtn: 'from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500', msgMine: 'from-pink-600/30 to-purple-600/20 border-pink-500/30 text-pink-50', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]', title: 'text-pink-400 drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]' },
  terminal: { name: 'Terminal', text: 'text-amber-500', border: 'border-amber-500/30', ring: 'focus:ring-amber-500', bgLight: 'bg-amber-500/10', btnGrad: 'from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500', sendBtn: 'from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500', msgMine: 'from-amber-600/20 to-orange-600/10 border-amber-500/30 text-amber-100', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]', title: 'text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]' },
  stealth: { name: 'Stealth', text: 'text-slate-300', border: 'border-slate-500/30', ring: 'focus:ring-slate-400', bgLight: 'bg-slate-500/20', btnGrad: 'from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500', sendBtn: 'from-slate-600 to-gray-600 hover:from-slate-500 hover:to-gray-500', msgMine: 'from-slate-700/50 to-gray-700/30 border-slate-500/30 text-slate-100', glow: 'shadow-[0_0_15px_rgba(148,163,184,0.1)]', title: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]' },
  oceanic: { name: 'Oceanic', text: 'text-teal-400', border: 'border-teal-500/30', ring: 'focus:ring-teal-400', bgLight: 'bg-teal-500/10', btnGrad: 'from-blue-700 to-teal-500 hover:from-blue-600 hover:to-teal-400', sendBtn: 'from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500', msgMine: 'from-teal-600/30 to-blue-600/20 border-teal-500/30 text-teal-50', glow: 'shadow-[0_0_15px_rgba(45,212,191,0.2)]', title: 'text-teal-400 drop-shadow-[0_0_10px_rgba(45,212,191,0.4)]' }
};

// Expanded to 48 Emojis (8 rows of 6)
const REACTION_EMOJIS = [
  '👍', '❤️', '😂', '🔥', '🥺', '🎉', 
  '💯', '🤔', '👀', '🙌', '👏', '🙏', 
  '🖕', '💀', '😭', '🤯', '😡', '🤢', 
  '🤡', '👻', '👽', '🤖', '💩', '😎', 
  '🤓', '🥳', '😴', '🙄', '🤐', '🤫', 
  '🤬', '😈', '✌️', '🤘', '👌', '🤌', 
  '💪', '🙂', '⚛️', '🔬', '🦠', '💊', 
  '🧬', '🩺', '💡', '🧪', '🔭', '📉'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [themeMode, setThemeMode] = useState('cyberpunk');
  const t = themeStyles[themeMode];
  
  const [displayName, setDisplayName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [reactionPicker, setReactionPicker] = useState(null);
  
  const [activeUsers, setActiveUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  
  // Voice Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeTouch = useRef({ startX: 0, timer: null, isLongPress: false });

  const toggleTheme = () => {
    const modes = Object.keys(themeStyles);
    setThemeMode(modes[(modes.indexOf(themeMode) + 1) % modes.length]);
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

  useEffect(() => {
    if (!user || !isJoined || !roomId) return;
    const presenceRef = collection(db, 'secure_rooms', roomId, 'presence');
    const userDoc = doc(presenceRef, user.uid);
    const setOnline = async () => await setDoc(userDoc, { uid: user.uid, displayName: displayName || 'Anonymous', lastSeen: Date.now() });
    setOnline();
    const interval = setInterval(() => setDoc(userDoc, { lastSeen: Date.now() }, { merge: true }), 15000);
    const unsubscribePresence = onSnapshot(presenceRef, (snapshot) => {
      const now = Date.now();
      const usersOnline = [];
      snapshot.forEach(doc => { if (now - doc.data().lastSeen < 25000) usersOnline.push(doc.data()); });
      setActiveUsers(usersOnline);
    });
    return () => { clearInterval(interval); unsubscribePresence(); deleteDoc(userDoc).catch(()=>{}); };
  }, [user, isJoined, roomId, displayName]);

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

  // --- SENDING FUNCTIONS ---
  const handleSendText = async (e) => {
    e.preventDefault(); if (!inputText.trim() || !user || !isJoined) return;
    const txt = inputText; setInputText('');
    const replyId = replyingTo ? replyingTo.id : null;
    setReplyingTo(null);
    try {
      const enc = await encryptText(txt, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: displayName || 'Anonymous', text: enc, type: 'text', timestamp: Date.now(), replyToId: replyId, reactions: {} });
    } catch (err) { console.error(err); }
  };

  const processAndSendImage = async (file) => {
    if (!file || !user || !isJoined) return;
    setIsUploading(true);
    const replyId = replyingTo ? replyingTo.id : null;
    setReplyingTo(null);
    try {
      const b64 = await compressImage(file); const enc = await encryptText(b64, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: displayName || 'Anonymous', text: enc, type: 'image', timestamp: Date.now(), replyToId: replyId, reactions: {} });
    } catch (err) { console.error(err); } finally { setIsUploading(false); }
  };

  // --- VOICE RECORDING BASE64 LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      mediaChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) mediaChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsUploading(true);
        clearInterval(recordingTimerRef.current);
        setRecordingTime(0);
        
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        mediaStreamRef.current.getTracks().forEach(track => track.stop()); // Turn off mic
        
        try {
          const base64Audio = await blobToBase64(blob);
          const encAudio = await encryptText(base64Audio, encryptionKey);
          const replyId = replyingTo ? replyingTo.id : null;
          
          await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { 
            senderId: user.uid, senderName: displayName || 'Anonymous', 
            text: encAudio, type: 'audio', timestamp: Date.now(), replyToId: replyId, reactions: {} 
          });
          setReplyingTo(null);
        } catch (error) { 
          console.error("Audio encryption failed. File might be too large.", error); 
          alert("Failed to send: Audio clip too large. Keep it under 60 seconds.");
        }
        setIsUploading(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Timer for visual feedback and auto-cutoff
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 59) {
            stopRecording(); // Auto cutoff at 60s
            return 0;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      console.error("Mic access denied", error);
      alert("Please allow Microphone permissions to send voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  // --- REACTIONS & GESTURES ---
  const toggleReaction = async (msgId, currentReactions = {}, emoji) => {
    if (!user || !isJoined) return;
    setReactionPicker(null);
    const emojiUsers = currentReactions[emoji] || [];
    const hasReacted = emojiUsers.includes(user.uid);
    let newEmojiUsers = hasReacted ? emojiUsers.filter(id => id !== user.uid) : [...emojiUsers, user.uid];
    const updatedReactions = { ...currentReactions, [emoji]: newEmojiUsers };
    if (newEmojiUsers.length === 0) delete updatedReactions[emoji];
    try { await updateDoc(doc(db, 'secure_rooms', roomId, 'messages', msgId), { reactions: updatedReactions }); } 
    catch (err) { console.error("Error updating reaction:", err); }
  };

  const handleTouchStart = (e, msg) => {
    activeTouch.current.startX = e.targetTouches[0].clientX;
    activeTouch.current.isLongPress = false;
    activeTouch.current.timer = setTimeout(() => {
      activeTouch.current.isLongPress = true;
      if (navigator.vibrate) navigator.vibrate(40);
      setReactionPicker(msg.id);
    }, 450);
  };

  const handleTouchMove = () => { if (activeTouch.current.timer) clearTimeout(activeTouch.current.timer); };

  const handleTouchEnd = (e, msg) => {
    if (activeTouch.current.timer) clearTimeout(activeTouch.current.timer);
    if (!activeTouch.current.isLongPress) {
      if (e.changedTouches[0].clientX - activeTouch.current.startX > 60) {
        if (navigator.vibrate) navigator.vibrate(20);
        setReplyingTo(msg);
      }
    }
  };

  const handleJoin = (e) => { e.preventDefault(); if (roomId.trim() && encryptionKey.trim()) { setIsJoined(true); window.history.replaceState({}, '', window.location.pathname); } };
  const handleLeave = async () => { setIsJoined(false); setMessages([]); if (user && roomId) await deleteDoc(doc(db, 'secure_rooms', roomId, 'presence', user.uid)).catch(()=>{}); };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Improved Scrollbar logic added here
  const globalStyles = `
    @keyframes popIn { 0% { opacity: 0; transform: translateY(10px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } } 
    .animate-pop-in { animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } 
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
    .glass-picker { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
    audio::-webkit-media-controls-panel { background-color: rgba(255, 255, 255, 0.1); border-radius: 12px; }
    audio::-webkit-media-controls-current-time-display, audio::-webkit-media-controls-time-remaining-display { color: #fff; text-shadow: none; }
    
    /* Sleek scrollbar for the emoji picker */
    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
  `;

  if (!user) return <div className="min-h-screen bg-[#050508] flex items-center justify-center"><div className="animate-pulse"><ShieldAlert className={`w-12 h-12 ${t.text}`} /></div></div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#050508] text-slate-200 flex items-center justify-center p-4 font-sans relative overflow-hidden animate-fade-in">
        <style>{globalStyles}</style>
        <div className="w-full max-w-md bg-[#0f0f14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 relative z-10 transition-all duration-500">
          <button onClick={toggleTheme} className={`absolute top-4 right-4 p-2 rounded-lg ${t.bgLight} ${t.text} hover:opacity-80 transition-all`} title="Change Theme"><Palette className="w-4 h-4" /></button>
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
    <div className="h-screen bg-[#050508] text-slate-200 flex flex-col font-sans animate-fade-in relative" onClick={() => setReactionPicker(null)}>
      <style>{globalStyles}</style>
      
      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-pointer animate-fade-in transition-all duration-300" onClick={() => setZoomedImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-400 p-2 bg-black/50 rounded-full transition-colors" onClick={() => setZoomedImage(null)}><X className="w-6 h-6" /></button>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl scale-100 transition-transform duration-300" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <header className="bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 z-30 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow}`}><ShieldCheck className={`w-5 h-5 ${t.text}`} /></div>
          <div><h2 className="font-mono text-lg font-bold text-slate-100">#{roomId}</h2><p className="text-xs text-green-400 flex items-center gap-1"><Lock className="w-3 h-3" /> {t.name} Protocol</p></div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button onClick={toggleTheme} className="text-slate-400 hover:text-white p-2 rounded-lg transition-all hidden sm:block" title="Theme"><Palette className="w-4 h-4" /></button>
          <button onClick={() => setShowUsers(!showUsers)} className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${showUsers ? `${t.bgLight} ${t.text} border ${t.border}` : 'bg-white/5 text-slate-300 border border-white/10'}`}>
            <Users className="w-4 h-4" /> {activeUsers.length} <span className="hidden sm:inline">Online</span>
          </button>
          {showUsers && (
            <div className="absolute top-12 right-0 w-48 bg-[#1a1a24]/95 glass-picker border border-white/10 rounded-xl shadow-2xl p-2 animate-pop-in z-50">
              <h3 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-2 py-1 mb-1 border-b border-white/5">Active Agents</h3>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {activeUsers.map(u => (
                  <div key={u.uid} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 text-sm mb-1"><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div><span className="truncate">{u.displayName} {u.uid === user.uid ? '(You)' : ''}</span></div>
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
        {isDragging && <div className={`absolute inset-0 z-40 bg-[#050508]/80 backdrop-blur-sm border-2 border-dashed ${t.border} flex flex-col items-center justify-center animate-fade-in`}><ImageIcon className={`w-16 h-16 ${t.text} mb-4 animate-bounce`} /><h3 className={`text-2xl font-mono ${t.text} tracking-wider`}>DROP IMAGE</h3></div>}
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6 scroll-smooth custom-scrollbar">
          {messages.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50"><MessageSquare className="w-16 h-16 mb-4 animate-bounce" style={{animationDuration:'3s'}} /><p className="text-sm tracking-wide">Secure channel initialized...</p></div> : messages.map((msg) => {
            const isMine = msg.senderId === user.uid;
            const repliedMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
            const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;

            return (
              <div key={msg.id} className={`animate-pop-in flex flex-col max-w-[85%] md:max-w-[70%] relative group ${isMine ? 'self-end items-end' : 'self-start items-start'}`} onTouchStart={e => handleTouchStart(e, msg)} onTouchMove={handleTouchMove} onTouchEnd={e => handleTouchEnd(e, msg)}>
                
                {/* Desktop Hover Actions */}
                <div className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${isMine ? 'right-full pr-3' : 'left-full pl-3'} items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto z-10`}>
                  <button onClick={(e) => { e.stopPropagation(); setReactionPicker(msg.id === reactionPicker ? null : msg.id); }} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} hover:bg-white/10 rounded-full shadow-lg transition-transform hover:scale-110 pointer-events-auto`} title="React"><Smile className="w-4 h-4" /></button>
                  <button onClick={() => setReplyingTo(msg)} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} hover:bg-white/10 rounded-full shadow-lg transition-transform hover:scale-110 pointer-events-auto`} title="Reply"><Reply className="w-4 h-4" /></button>
                </div>

                {/* Expanded Grid Reaction Picker Popup */}
                {reactionPicker === msg.id && (
                  <div className={`absolute ${isMine ? 'right-0' : 'left-0'} bottom-full mb-2 bg-[#1a1a24]/95 glass-picker border border-white/10 rounded-2xl shadow-2xl p-3 z-50 animate-pop-in w-64 max-h-48 overflow-y-auto custom-scrollbar`} onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-6 gap-2">
                      {REACTION_EMOJIS.map(emoji => (
                        <button key={emoji} onClick={() => toggleReaction(msg.id, msg.reactions, emoji)} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg hover:scale-110 transition-all text-xl">
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <span className="text-[10px] text-slate-500 mb-1.5 ml-1 select-none">{msg.senderName} <span className="opacity-40">({msg.senderId.substring(0, 4)})</span></span>
                <div className={`p-1.5 rounded-2xl shadow-lg relative transition-all active:scale-[0.98] ${msg.isDecrypted ? isMine ? `bg-gradient-to-br ${t.msgMine} rounded-tr-sm border` : 'bg-[#1a1a24] border border-white/10 text-slate-200 rounded-tl-sm' : 'bg-red-900/20 border border-red-500/30 text-red-300 rounded-tl-sm font-mono'}`}>
                  
                  {repliedMsg && repliedMsg.isDecrypted && (
                    <div className="mb-2 p-2 bg-black/30 rounded border-l-2 border-cyan-500/50 text-xs opacity-80 cursor-default select-none">
                      <span className={`font-bold ${t.text}`}>{repliedMsg.senderName}</span>
                      <span className="truncate block max-w-[200px] mt-0.5 text-slate-300">{repliedMsg.type === 'image' ? '📷 Encrypted Image' : repliedMsg.type === 'audio' ? '🎤 Encrypted Audio' : repliedMsg.decryptedText}</span>
                    </div>
                  )}

                  {msg.isDecrypted ? (
                    msg.type === 'image' ? (
                      <div className="relative group cursor-zoom-in" onClick={() => setZoomedImage(msg.decryptedText)}>
                        <img src={msg.decryptedText} alt="Attached" className="max-w-full rounded-xl group-hover:opacity-90 transition-opacity duration-300" style={{maxHeight:'350px'}} />
                      </div>
                    ) : msg.type === 'audio' ? (
                      <div className="px-2 py-1">
                        <audio controls src={msg.decryptedText} className="max-w-[200px] sm:max-w-xs outline-none" />
                      </div>
                    ) : (
                      <div className="px-4 py-2.5 text-[15px] whitespace-pre-wrap leading-relaxed">{msg.decryptedText}</div>
                    )
                  ) : (
                    <div className="px-4 py-3 flex flex-col gap-2 text-xs"><div className="flex items-center gap-2 font-bold mb-1 border-b border-red-500/20 pb-2"><Lock className="w-3.5 h-3.5" /> ENCRYPTED</div><span className="opacity-50">{msg.text.substring(0, 80)}...</span></div>
                  )}
                
                  {hasReactions && (
                    <div className={`absolute -bottom-3 ${isMine ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10 animate-pop-in`}>
                      {Object.entries(msg.reactions).map(([emoji, users]) => {
                        const userReacted = users.includes(user.uid);
                        return (<button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, msg.reactions, emoji); }} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border shadow-md transition-all hover:scale-105 active:scale-95 ${userReacted ? `${t.bgLight} ${t.border} ${t.text}` : 'bg-[#1a1a24]/90 glass-picker border-white/10 text-slate-300 hover:bg-white/10'}`}><span>{emoji}</span>{users.length > 1 && <span className="font-medium pr-0.5">{users.length}</span>}</button>);
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      <div className="bg-[#0f0f14]/90 backdrop-blur-md border-t border-white/10 shrink-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] flex flex-col">
        {replyingTo && (
          <div className="px-6 py-3 bg-[#1a1a24]/90 border-b border-white/5 flex items-center justify-between text-sm animate-slide-up glass-picker">
            <div className="flex flex-col flex-1 truncate border-l-2 border-cyan-500 pl-3">
              <span className={`text-xs font-bold ${t.text}`}>Replying to {replyingTo.senderName}</span>
              <span className="text-slate-400 text-xs truncate">{replyingTo.type === 'image' ? '📷 Image' : replyingTo.type === 'audio' ? '🎤 Audio' : (replyingTo.decryptedText || 'Encrypted Message')}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-2 text-slate-400 hover:text-red-400 rounded-full hover:bg-white/10 transition-all"><X className="w-4 h-4" /></button>
          </div>
        )}
        
        {/* Input Bar */}
        <div className="p-4 max-w-4xl mx-auto w-full flex gap-3 relative items-center">
          
          {/* Action Buttons Container */}
          {!isRecording && (
            <div className="flex items-center gap-1">
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { const file = e.target.files[0]; if(file){ e.target.value=''; processAndSendImage(file); } }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={`p-2.5 text-slate-400 hover:${t.text} hover:bg-white/10 rounded-xl transition-all active:scale-95`} title="Send Image">
                <ImageIcon className="w-5 h-5" />
              </button>
              <button onClick={startRecording} disabled={isUploading} className={`p-2.5 text-slate-400 hover:${t.text} hover:bg-white/10 rounded-xl transition-all active:scale-95`} title="Record Voice Note">
                <Mic className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Text Input OR Recording UI */}
          {isRecording ? (
            <div className={`flex-1 flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 animate-pulse`}>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full" style={{ animation: 'pulse-red 1.5s infinite' }}></div>
                <span className="text-red-400 font-mono text-sm tracking-widest font-bold">RECORDING SECURE AUDIO...</span>
              </div>
              <span className="text-red-400 font-mono text-sm font-bold">{formatTime(recordingTime)} / 1:00</span>
            </div>
          ) : (
            <form onSubmit={handleSendText} className="relative flex-1 group">
              <div className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 transition-colors group-focus-within:${t.text}`}><Unlock className="w-4 h-4" /></div>
              <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Secure message..." disabled={isUploading} className={`w-full bg-black/50 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm focus:border-white/30 ${t.ring} focus:ring-1 outline-none transition-all placeholder:text-slate-600`} />
            </form>
          )}

          {/* Send or Stop Button */}
          {isRecording ? (
            <button onClick={stopRecording} className="bg-red-600 hover:bg-red-500 text-white rounded-xl px-6 py-3.5 flex items-center justify-center transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)] active:scale-95">
              <Square className="w-5 h-5 fill-current" />
            </button>
          ) : (
            <button onClick={handleSendText} disabled={!inputText.trim() && !isUploading} className={`bg-gradient-to-r ${t.sendBtn} text-white rounded-xl px-6 py-3.5 flex items-center justify-center transition-all ${t.glow} hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0`}>
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}