import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";
import { 
  Lock, Unlock, Send, Key, MessageSquare, ShieldAlert, 
  ShieldCheck, LogOut, User, Image as ImageIcon, Loader2, 
  RefreshCw, Share2, Check, Users 
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

// --- Web Crypto API Functions ---
const deriveKey = async (password, salt) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
};

const encryptText = async (text, password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(text));
  const combined = new Uint8Array(16 + 12 + ciphertext.byteLength);
  combined.set(salt, 0); combined.set(iv, 16); combined.set(new Uint8Array(ciphertext), 28);
  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
};

const decryptText = async (base64, password) => {
  try {
    const binary_string = atob(base64);
    const combined = new Uint8Array(binary_string.length);
    for (let i = 0; i < binary_string.length; i++) combined[i] = binary_string.charCodeAt(i);
    const salt = combined.slice(0, 16); const iv = combined.slice(16, 28); const ciphertext = combined.slice(28);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (e) { return null; }
};

const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600; const MAX_HEIGHT = 600;
        let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
        else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  
  const [displayName, setDisplayName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [copied, setCopied] = useState(false);
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // NEW: Presence State
  const [activeUsers, setActiveUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) setRoomId(roomFromUrl);
  }, []);

  const generateRandomRoom = () => {
    const adjectives = ['silent', 'dark', 'hidden', 'crypto', 'neon', 'shadow'];
    const nouns = ['vault', 'nexus', 'ghost', 'signal', 'pulse', 'void'];
    setRoomId(`${adjectives[Math.floor(Math.random() * adjectives.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  const copyRoomLink = () => {
    navigator.clipboard.writeText(`Join my secure CommsLink room!\n\nRoom: ${roomId}\nLink: ${window.location.origin}${window.location.pathname}?room=${roomId}\n\n(You will still need the secret decryption key)`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const initAuth = async () => { try { await signInAnonymously(auth); } catch (err) { console.error(err); } };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // PRESENCE SYSTEM (HEARTBEAT)
  useEffect(() => {
    if (!user || !isJoined || !roomId) return;

    const presenceRef = collection(db, 'secure_rooms', roomId, 'presence');
    const userPresenceDoc = doc(presenceRef, user.uid);

    // 1. Mark as online immediately
    const setOnline = async () => {
      await setDoc(userPresenceDoc, {
        uid: user.uid,
        displayName: displayName || 'Anonymous',
        lastSeen: Date.now()
      });
    };
    setOnline();

    // 2. Pulse every 15 seconds to stay online
    const interval = setInterval(() => {
      setDoc(userPresenceDoc, { lastSeen: Date.now() }, { merge: true });
    }, 15000);

    // 3. Listen for everyone else in the room
    const unsubscribePresence = onSnapshot(presenceRef, (snapshot) => {
      const now = Date.now();
      const usersOnline = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // If they pulsed in the last 30 seconds, they are online!
        if (now - data.lastSeen < 30000) {
          usersOnline.push(data);
        }
      });
      setActiveUsers(usersOnline);
    });

    // 4. Clean up when leaving
    return () => {
      clearInterval(interval);
      unsubscribePresence();
      deleteDoc(userPresenceDoc).catch(() => {}); // Remove self on unmount
    };
  }, [user, isJoined, roomId, displayName]);

  // MESSAGE FETCHING
  useEffect(() => {
    if (!user || !isJoined || !roomId || !encryptionKey) return;
    const roomRef = collection(db, 'secure_rooms', roomId, 'messages');
    const unsubscribe = onSnapshot(roomRef, async (snapshot) => {
      const rawMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      rawMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const processedMessages = await Promise.all(rawMessages.map(async (msg) => {
        const decrypted = await decryptText(msg.text, encryptionKey);
        return { ...msg, decryptedText: decrypted, isDecrypted: decrypted !== null, type: msg.type || 'text' };
      }));
      setMessages(processedMessages);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [user, isJoined, roomId, encryptionKey]);

  const handleSendText = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !isJoined) return;
    const currentText = inputText; setInputText('');
    try {
      const encryptedPayload = await encryptText(currentText, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), {
        senderId: user.uid, senderName: displayName || 'Anonymous', text: encryptedPayload, type: 'text', timestamp: Date.now()
      });
    } catch (err) { console.error(err); }
  };

  const processAndSendImage = async (file) => {
    if (!file || !user || !isJoined) return;
    setIsUploading(true);
    try {
      const compressedBase64 = await compressImage(file);
      const encryptedPayload = await encryptText(compressedBase64, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), {
        senderId: user.uid, senderName: displayName || 'Anonymous', text: encryptedPayload, type: 'image', timestamp: Date.now()
      });
    } catch (err) { console.error(err); } finally { setIsUploading(false); }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim() && encryptionKey.trim()) {
      setIsJoined(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleLeave = async () => {
    setIsJoined(false);
    setMessages([]);
    // Immediately remove from presence on manual leave
    if (user && roomId) {
      await deleteDoc(doc(db, 'secure_rooms', roomId, 'presence', user.uid)).catch(() => {});
    }
  };

  const globalStyles = `
    @keyframes popIn { 0% { opacity: 0; transform: translateY(15px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
    .animate-pop-in { animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
  `;

  if (!user) return <div className="min-h-screen bg-[#050508] text-cyan-500 flex items-center justify-center font-sans"><div className="animate-pulse flex flex-col items-center gap-4"><ShieldAlert className="w-12 h-12" /><p className="tracking-widest uppercase text-sm">Establishing Secure Uplink...</p></div></div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#050508] text-slate-200 flex items-center justify-center p-4 font-sans relative overflow-hidden animate-fade-in">
        <style>{globalStyles}</style>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.15),transparent_70%)] pointer-events-none"></div>
        <div className="w-full max-w-md bg-[#0f0f14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 relative z-10 transform transition-all hover:border-white/20 duration-500">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-mono text-[#00ff41] tracking-widest uppercase mb-2 drop-shadow-[0_0_10px_rgba(0,255,65,0.4)] transition-all hover:scale-105 duration-300">CommsLink</h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4 text-cyan-400" /> End-to-End Encrypted</p>
          </div>
          <form onSubmit={handleJoin} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 group"><label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2 transition-colors group-focus-within:text-purple-400"><User className="w-4 h-4 text-purple-400" /> Display Name</label><input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Agent Name (Optional)" className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none transition-all placeholder:text-slate-600" /></div>
            <div className="flex flex-col gap-2 group">
              <label className="text-xs font-semibold text-slate-400 uppercase flex items-center justify-between transition-colors group-focus-within:text-cyan-400">
                <span className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-cyan-400" /> Channel ID</span>
                <button type="button" onClick={generateRandomRoom} className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded border border-cyan-500/20 transition-all flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Randomize</button>
              </label>
              <input type="text" required value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="e.g. shadow-vault-4092" className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-slate-600" />
            </div>
            <div className="flex flex-col gap-2 group"><label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2 transition-colors group-focus-within:text-pink-400"><Key className="w-4 h-4 text-pink-400" /> Decryption Key</label><input type="password" required value={encryptionKey} onChange={(e) => setEncryptionKey(e.target.value)} placeholder="Shared Secret Password" className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-pink-400 focus:ring-1 focus:ring-pink-400 outline-none transition-all placeholder:text-slate-600" /><p className="text-[10px] text-slate-500 mt-1">Both parties must use the exact same key.</p></div>
            <button type="submit" className="mt-4 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-semibold py-3 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transform hover:-translate-y-0.5 transition-all duration-300 flex justify-center items-center gap-2"><Lock className="w-4 h-4" /> Initialize Connection</button>
          </form>
          <div className="mt-6 text-center text-[10px] text-slate-600">System UID: {user.uid.substring(0, 8)}...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050508] text-slate-200 flex flex-col font-sans animate-fade-in relative">
      <style>{globalStyles}</style>
      
      <header className="bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-mono text-lg font-bold text-slate-100 flex items-center gap-2">#{roomId}</h2>
            <p className="text-xs text-green-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Connection Encrypted</p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Active Users Button */}
          <button 
            onClick={() => setShowUsers(!showUsers)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              showUsers ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            <Users className="w-4 h-4" /> 
            {activeUsers.length} <span className="hidden sm:inline">Online</span>
          </button>

          {/* Users Dropdown Modal */}
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

          <button onClick={copyRoomLink} className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all hidden sm:flex ${copied ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'}`}>
            {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Share2 className="w-4 h-4" /> Invite</>}
          </button>
          <button onClick={handleLeave} className="text-slate-400 hover:text-pink-400 p-2 rounded-lg hover:bg-white/5 transition-all duration-300 flex items-center gap-2 text-sm font-semibold group">
            <LogOut className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" /> <span className="hidden sm:inline">Disconnect</span>
          </button>
        </div>
      </header>

      <div className="flex-1 relative flex flex-col overflow-hidden" onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }} onDrop={async (e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file && file.type.startsWith('image/')) await processAndSendImage(file); }}>
        {isDragging && <div className="absolute inset-0 z-40 bg-[#050508]/80 backdrop-blur-sm border-2 border-dashed border-cyan-500 flex flex-col items-center justify-center animate-fade-in"><div className="bg-cyan-900/40 p-6 rounded-full mb-4 shadow-[0_0_30px_rgba(6,182,212,0.5)]"><ImageIcon className="w-16 h-16 text-cyan-400" /></div><h3 className="text-2xl font-mono text-cyan-400 tracking-wider">DROP IMAGE HERE</h3><p className="text-slate-400 mt-2">Payload will be encrypted securely before transmission.</p></div>}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          {messages.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50"><MessageSquare className="w-16 h-16 mb-4 animate-bounce" style={{ animationDuration: '3s' }} /><p className="text-sm tracking-wide">Secure channel initialized. Awaiting transmissions...</p></div> : messages.map((msg) => {
            const isMine = msg.senderId === user.uid;
            return (
              <div key={msg.id} className={`animate-pop-in flex flex-col max-w-[85%] md:max-w-[70%] ${isMine ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className="text-[10px] text-slate-500 mb-1.5 ml-1 flex items-center gap-1 font-medium tracking-wide">{msg.senderName} <span className="opacity-40">({msg.senderId.substring(0, 4)})</span></span>
                <div className={`p-1.5 rounded-2xl shadow-lg transition-transform hover:scale-[1.01] ${msg.isDecrypted ? isMine ? 'bg-gradient-to-br from-cyan-600/30 to-blue-600/20 border border-cyan-500/30 text-cyan-50 rounded-tr-sm' : 'bg-[#1a1a24] border border-white/10 text-slate-200 rounded-tl-sm' : 'bg-pink-900/20 border border-pink-500/30 text-pink-300 rounded-tl-sm font-mono'}`}>
                  {msg.isDecrypted ? (msg.type === 'image' ? <div className="relative group"><img src={msg.decryptedText} alt="Encrypted attachment" className="max-w-full rounded-xl object-contain shadow-inner" style={{ maxHeight: '350px' }} /><div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-xl pointer-events-none"></div></div> : <div className="px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.decryptedText}</div>) : <div className="px-4 py-3 flex flex-col gap-2 text-xs"><div className="flex items-center gap-2 font-bold mb-1 border-b border-pink-500/20 pb-2"><Lock className="w-3.5 h-3.5" /> ENCRYPTED {msg.type === 'image' ? 'IMAGE' : 'PAYLOAD'}</div><span className="opacity-50 break-all line-clamp-2">{msg.text.substring(0, 80)}...</span><span className="text-[11px] text-pink-400/80 italic mt-1 font-sans">(Decryption failed. Invalid shared key.)</span></div>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      <div className="p-4 bg-[#0f0f14]/90 backdrop-blur-md border-t border-white/10 shrink-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <form onSubmit={handleSendText} className="max-w-4xl mx-auto flex gap-3 relative items-center">
          <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { const file = e.target.files[0]; if (file) { e.target.value = ''; processAndSendImage(file); } }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-3.5 text-slate-400 hover:text-cyan-400 hover:bg-white/5 rounded-xl transition-all duration-300 shrink-0 hover:shadow-[0_0_15px_rgba(6,182,212,0.15)]" title="Attach Encrypted Image">
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          </button>
          <div className="relative flex-1 group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 transition-colors group-focus-within:text-cyan-400"><Unlock className="w-4 h-4" /></div>
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type your secure message... (or drag & drop an image anywhere)" disabled={isUploading} className="w-full bg-black/50 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-sm text-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all duration-300 placeholder:text-slate-600 disabled:opacity-50 shadow-inner" />
          </div>
          <button type="submit" disabled={(!inputText.trim() && !isUploading) || isUploading} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3.5 flex items-center justify-center transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.2)] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transform hover:-translate-y-0.5 shrink-0">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}