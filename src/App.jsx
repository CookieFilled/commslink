import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  Lock, Unlock, Send, Key, MessageSquare, ShieldAlert, 
  ShieldCheck, LogOut, User, Image as ImageIcon, Loader2, 
  Check, Users, Palette, Reply, X, Smile, Mic, Square, Play, Pause, ChevronLeft, Fingerprint
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

// --- Media Converters & Players ---
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

const CustomAudioPlayer = ({ src, t }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const current = audioRef.current.currentTime;
    const total = audioRef.current.duration;
    setProgress(total ? (current / total) * 100 : 0);
  };

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

// --- Themes & Emojis ---
const themeStyles = {
  cyberpunk: { name: 'Cyberpunk', text: 'text-cyan-400', border: 'border-cyan-500/30', ring: 'focus:ring-cyan-400', bgLight: 'bg-cyan-500/10', btnGrad: 'from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500', sendBtn: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500', msgMine: 'from-cyan-600/30 to-blue-600/20 border-cyan-500/30 text-cyan-50', glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]', title: 'text-[#00ff41] drop-shadow-[0_0_10px_rgba(0,255,65,0.4)]' },
  matrix: { name: 'Matrix', text: 'text-green-400', border: 'border-green-500/30', ring: 'focus:ring-green-400', bgLight: 'bg-green-500/10', btnGrad: 'from-green-700 to-green-500 hover:from-green-600 hover:to-green-400', sendBtn: 'from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500', msgMine: 'from-green-600/30 to-emerald-600/20 border-green-500/30 text-green-50', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.2)]', title: 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]' },
  synthwave: { name: 'Synthwave', text: 'text-pink-400', border: 'border-pink-500/30', ring: 'focus:ring-pink-400', bgLight: 'bg-pink-500/10', btnGrad: 'from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400', sendBtn: 'from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500', msgMine: 'from-pink-600/30 to-purple-600/20 border-pink-500/30 text-pink-50', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]', title: 'text-pink-400 drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]' },
  terminal: { name: 'Terminal', text: 'text-amber-500', border: 'border-amber-500/30', ring: 'focus:ring-amber-500', bgLight: 'bg-amber-500/10', btnGrad: 'from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500', sendBtn: 'from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500', msgMine: 'from-amber-600/20 to-orange-600/10 border-amber-500/30 text-amber-100', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]', title: 'text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]' },
  stealth: { name: 'Stealth', text: 'text-slate-300', border: 'border-slate-500/30', ring: 'focus:ring-slate-400', bgLight: 'bg-slate-500/20', btnGrad: 'from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500', sendBtn: 'from-slate-600 to-gray-600 hover:from-slate-500 hover:to-gray-500', msgMine: 'from-slate-700/50 to-gray-700/30 border-slate-500/30 text-slate-100', glow: 'shadow-[0_0_15px_rgba(148,163,184,0.1)]', title: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]' },
  oceanic: { name: 'Oceanic', text: 'text-teal-400', border: 'border-teal-500/30', ring: 'focus:ring-teal-400', bgLight: 'bg-teal-500/10', btnGrad: 'from-blue-700 to-teal-500 hover:from-blue-600 hover:to-teal-400', sendBtn: 'from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500', msgMine: 'from-teal-600/30 to-blue-600/20 border-teal-500/30 text-teal-50', glow: 'shadow-[0_0_15px_rgba(45,212,191,0.2)]', title: 'text-teal-400 drop-shadow-[0_0_10px_rgba(45,212,191,0.4)]' }
};

const REACTION_EMOJIS = [
  '👍', '❤️', '😂', '🔥', '🥺', '🎉', '💯', '🤔', '👀', '🙌', '👏', '🙏', 
  '✨', '💀', '😭', '🤯', '😡', '🤢', '🤡', '👻', '👽', '🤖', '💩', '😎', 
  '🤓', '🥳', '😴', '🙄', '🤐', '🤫', '🤬', '😈', '✌️', '🤘', '👌', '🤌', 
  '💪', '🧠', '🖕', '🙂', '🫦', '🥵', '🥶', '🥴', '🧊', '🩸', '🧪', '📉'
];

// --- 1. THE AUTHENTICATION SCREEN (Anonymous ID Logic) ---
const AuthScreen = ({ t }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [agentId, setAgentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    
    // Create a safe, hidden fake email so Firebase Auth works without the user knowing
    const safeId = agentId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (safeId.length < 3) {
      alert("Agent ID must be at least 3 letters or numbers.");
      return;
    }
    const phantomEmail = `${safeId}@commslink.network`;

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, phantomEmail, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, phantomEmail, password);
        const finalName = displayName.trim() || agentId.trim();
        await updateProfile(userCredential.user, { displayName: finalName });
        
        // Add to public users directory for the dashboard
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          agentId: agentId.trim(),
          displayName: finalName,
          lastSeen: Date.now()
        });
      }
    } catch (error) { 
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        alert("Access Denied: Invalid Agent ID or Password.");
      } else if (error.code === 'auth/email-already-in-use') {
        alert("This Agent ID is already claimed by someone else.");
      } else {
        alert(error.message); 
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#050508] text-slate-200 flex flex-col items-center justify-center p-4 relative animate-fade-in">
      <div className="w-full max-w-md bg-[#0f0f14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-8 z-10">
        <div className="text-center mb-8">
          <ShieldAlert className={`w-12 h-12 ${t.text} mx-auto mb-4`} />
          <h1 className={`text-4xl font-mono tracking-widest uppercase mb-2 ${t.title}`}>CommsLink</h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2">Anonymous Network</p>
        </div>

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><Fingerprint className={`w-4 h-4 ${t.text}`} /> Unique Agent ID</label>
            <input type="text" required value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="e.g. Ghost47" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm ${t.ring} focus:ring-1 outline-none`} />
          </div>
          
          {!isLogin && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><User className={`w-4 h-4 ${t.text}`} /> Display Name (Optional)</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="What others see..." className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm ${t.ring} focus:ring-1 outline-none`} />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-2"><Key className={`w-4 h-4 ${t.text}`} /> Master Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={`bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm ${t.ring} focus:ring-1 outline-none`} />
          </div>
          
          <button type="submit" disabled={loading} className={`mt-4 bg-gradient-to-r ${t.btnGrad} text-white font-bold py-3 rounded-lg ${t.glow} flex justify-center items-center gap-2`}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLogin ? "Initialize Link" : "Claim Agent ID"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6 cursor-pointer hover:text-white" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Need a new identity? Register here." : "Already have an Agent ID? Login here."}
        </p>
      </div>
    </div>
  );
};

// --- 2. THE CHAT INTERFACE (The Room) ---
const ChatInterface = ({ user, roomId, otherUser, encryptionKey, goBack, t }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [reactionPicker, setReactionPicker] = useState(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeTouch = useRef({ startX: 0, timer: null, isLongPress: false });

  useEffect(() => {
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
  }, [roomId, encryptionKey]);

  const handleSendText = async (e) => {
    e.preventDefault(); if (!inputText.trim() || !user) return;
    const txt = inputText; setInputText('');
    const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    try {
      const enc = await encryptText(txt, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: replyId, reactions: {} });
    } catch (err) { console.error(err); }
  };

  const processAndSendImage = async (file) => {
    if (!file || !user) return;
    setIsUploading(true);
    const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    try {
      const b64 = await compressImage(file); const enc = await encryptText(b64, encryptionKey);
      await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'image', timestamp: Date.now(), replyToId: replyId, reactions: {} });
    } catch (err) { console.error(err); } finally { setIsUploading(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      mediaStreamRef.current = stream;
      let options = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 12000 };
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) options = { mimeType: 'audio/webm', audioBitsPerSecond: 12000 };
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      mediaChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) mediaChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        setIsUploading(true); clearInterval(recordingTimerRef.current); setRecordingTime(0);
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        mediaStreamRef.current.getTracks().forEach(track => track.stop()); 
        
        try {
          const base64Audio = await blobToBase64(blob);
          const encAudio = await encryptText(base64Audio, encryptionKey);
          await addDoc(collection(db, 'secure_rooms', roomId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: encAudio, type: 'audio', timestamp: Date.now(), replyToId: replyingTo ? replyingTo.id : null, reactions: {} });
          setReplyingTo(null);
        } catch (error) { alert("Failed to send: Audio clip too large."); }
        setIsUploading(false);
      };

      mediaRecorder.start(); setIsRecording(true);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => { if (prev >= 59) { stopRecording(); return 0; } return prev + 1; });
      }, 1000);
    } catch (error) { alert("Mic access denied."); }
  };

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); clearInterval(recordingTimerRef.current); } };

  const toggleReaction = async (msgId, currentReactions = {}, emoji) => {
    setReactionPicker(null);
    const emojiUsers = currentReactions[emoji] || [];
    const hasReacted = emojiUsers.includes(user.uid);
    let newEmojiUsers = hasReacted ? emojiUsers.filter(id => id !== user.uid) : [...emojiUsers, user.uid];
    const updatedReactions = { ...currentReactions, [emoji]: newEmojiUsers };
    if (newEmojiUsers.length === 0) delete updatedReactions[emoji];
    await updateDoc(doc(db, 'secure_rooms', roomId, 'messages', msgId), { reactions: updatedReactions });
  };

  return (
    <div className="h-screen bg-[#050508] text-slate-200 flex flex-col font-sans animate-fade-in relative" onClick={() => setReactionPicker(null)}>
      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-pointer animate-fade-in" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <header className="bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10"><ChevronLeft className="w-6 h-6" /></button>
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow}`}><User className={`w-5 h-5 ${t.text}`} /></div>
          <div><h2 className="font-mono text-md font-bold text-slate-100">{otherUser.displayName}</h2><p className="text-[10px] text-green-400 flex items-center gap-1"><Lock className="w-3 h-3" /> E2E Encrypted</p></div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar">
        {messages.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center text-slate-500 opacity-50"><ShieldCheck className="w-16 h-16 mb-4" /><p className="text-sm">Secure channel established.</p></div> : messages.map((msg, index) => {
          const isMine = msg.senderId === user.uid;
          const repliedMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : null;
          const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0;

          return (
            <div key={msg.id} className={`flex flex-col max-w-[85%] md:max-w-[70%] relative group ${isMine ? 'self-end items-end' : 'self-start items-start'}`}
              onTouchStart={e => { activeTouch.current.startX = e.targetTouches[0].clientX; activeTouch.current.isLongPress = false; activeTouch.current.timer = setTimeout(() => { activeTouch.current.isLongPress = true; if(navigator.vibrate) navigator.vibrate(40); setReactionPicker(msg.id); }, 450); }}
              onTouchMove={() => clearTimeout(activeTouch.current.timer)}
              onTouchEnd={e => { clearTimeout(activeTouch.current.timer); if (!activeTouch.current.isLongPress && e.changedTouches[0].clientX - activeTouch.current.startX > 60) setReplyingTo(msg); }}
            >
              <div className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${isMine ? 'right-full pr-3' : 'left-full pl-3'} items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none group-hover:pointer-events-auto z-10`}>
                <button onClick={(e) => { e.stopPropagation(); setReactionPicker(msg.id === reactionPicker ? null : msg.id); }} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} rounded-full hover:bg-white/10`}><Smile className="w-4 h-4" /></button>
                <button onClick={() => setReplyingTo(msg)} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} rounded-full hover:bg-white/10`}><Reply className="w-4 h-4" /></button>
              </div>

              {reactionPicker === msg.id && (
                <div className={`absolute ${isMine ? 'right-0' : 'left-0'} ${index < 3 ? 'top-full mt-2' : 'bottom-full mb-2'} bg-[#1a1a24]/95 border border-white/10 rounded-2xl p-3 z-50 w-[270px] max-h-48 overflow-y-auto custom-scrollbar glass-picker`} onClick={e => e.stopPropagation()}>
                  <div className="grid grid-cols-6 gap-1">{REACTION_EMOJIS.map(emoji => (<button key={emoji} onClick={() => toggleReaction(msg.id, msg.reactions, emoji)} className="w-9 h-9 hover:bg-white/10 rounded-lg text-xl">{emoji}</button>))}</div>
                </div>
              )}

              <div className={`p-1.5 rounded-2xl shadow-lg relative ${msg.isDecrypted ? isMine ? `bg-gradient-to-br ${t.msgMine} rounded-tr-sm border` : 'bg-[#1a1a24] border border-white/10 text-slate-200 rounded-tl-sm' : 'bg-red-900/20 border border-red-500/30 text-red-300 rounded-tl-sm'}`}>
                {repliedMsg && repliedMsg.isDecrypted && (
                  <div className="mb-2 p-2 bg-black/30 rounded border-l-2 border-cyan-500/50 text-xs opacity-80 select-none">
                    <span className={`font-bold ${t.text}`}>{repliedMsg.senderName}</span>
                    <span className="truncate block max-w-[200px] mt-0.5">{repliedMsg.type === 'text' ? repliedMsg.decryptedText : `📷 Media`}</span>
                  </div>
                )}
                {msg.isDecrypted ? (
                  msg.type === 'image' ? <img src={msg.decryptedText} onClick={() => setZoomedImage(msg.decryptedText)} className="max-w-full rounded-xl cursor-zoom-in" style={{maxHeight:'350px'}} /> : 
                  msg.type === 'audio' ? <CustomAudioPlayer src={msg.decryptedText} t={t} /> : 
                  <div className="px-4 py-2.5 text-[15px] whitespace-pre-wrap">{msg.decryptedText}</div>
                ) : <div className="px-4 py-3 text-xs opacity-50"><Lock className="w-3.5 h-3.5 inline mr-1"/> BLOCKED/INVALID KEY</div>}
              
                {hasReactions && (
                  <div className={`absolute -bottom-3 ${isMine ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10`}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => (<button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, msg.reactions, emoji); }} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border bg-[#1a1a24] ${users.includes(user.uid) ? t.text : 'text-slate-300'}`}><span>{emoji}</span>{users.length > 1 && <span>{users.length}</span>}</button>))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="bg-[#0f0f14]/90 backdrop-blur-md border-t border-white/10 z-20">
        {replyingTo && (
          <div className="px-6 py-3 bg-[#1a1a24]/90 border-b border-white/5 flex items-center justify-between text-sm">
            <div className="flex flex-col border-l-2 border-cyan-500 pl-3"><span className={`text-xs font-bold ${t.text}`}>Replying to {replyingTo.senderName}</span></div>
            <button onClick={() => setReplyingTo(null)} className="p-2 text-slate-400 hover:text-red-400"><X className="w-4 h-4" /></button>
          </div>
        )}
        <div className="p-4 flex gap-2 relative items-center">
          {!isRecording && (
            <div className="flex items-center gap-1">
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) { processAndSendImage(e.target.files[0]); e.target.value=''; } }} />
              <button onClick={() => fileInputRef.current?.click()} className={`p-2.5 text-slate-400 hover:${t.text}`}><ImageIcon className="w-5 h-5" /></button>
              <button onClick={startRecording} className={`p-2.5 text-slate-400 hover:${t.text}`}><Mic className="w-5 h-5" /></button>
            </div>
          )}
          {isRecording ? (
            <div className="flex-1 flex justify-between bg-red-500/10 rounded-xl px-4 py-3"><span className="text-red-400 font-bold tracking-widest text-sm">RECORDING...</span><span className="text-red-400 font-bold">{Math.floor(recordingTime/60)}:{recordingTime%60 < 10 ? '0':''}{recordingTime%60}</span></div>
          ) : (
            <form onSubmit={handleSendText} className="flex-1"><input type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Secure message..." className={`w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-sm ${t.ring} focus:ring-1 outline-none`} /></form>
          )}
          {isRecording ? <button onClick={stopRecording} className="bg-red-600 p-3 rounded-xl text-white"><Square className="w-5 h-5 fill-current" /></button> : <button onClick={handleSendText} disabled={!inputText.trim() && !isUploading} className={`bg-gradient-to-r ${t.sendBtn} p-3 rounded-xl text-white disabled:opacity-50`}><Send className="w-5 h-5" /></button>}
        </div>
      </div>
    </div>
  );
};


// --- 3. MAIN APP ROUTER ---
export default function App() {
  const [user, setUser] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [activeChat, setActiveChat] = useState(null); // { id: 'room_id', otherUser: {} }
  const [encryptionKey, setEncryptionKey] = useState('');
  
  const [themeMode, setThemeMode] = useState('cyberpunk');
  const t = themeStyles[themeMode];
  
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [tempKey, setTempKey] = useState('');

  // Handle Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fetch all users for Dashboard
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = [];
      snapshot.forEach(doc => {
        if (doc.id !== user.uid) users.push(doc.data());
      });
      setUsersList(users);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleTheme = () => {
    const modes = Object.keys(themeStyles);
    setThemeMode(modes[(modes.indexOf(themeMode) + 1) % modes.length]);
  };

  const handleLogout = () => { signOut(auth); setActiveChat(null); };

  const startChatSequence = (agent) => {
    setSelectedAgent(agent);
    setTempKey('');
    setShowKeyModal(true);
  };

  const confirmChatEntry = (e) => {
    e.preventDefault();
    if (!tempKey.trim()) return;
    
    // Create consistent Room ID alphabetically based on UIDs
    const roomId = user.uid < selectedAgent.uid 
      ? `${user.uid}_${selectedAgent.uid}` 
      : `${selectedAgent.uid}_${user.uid}`;
      
    setEncryptionKey(tempKey);
    setActiveChat({ id: roomId, otherUser: selectedAgent });
    setShowKeyModal(false);
  };

  // --- GLOBAL STYLES ---
  const globalStyles = `
    @keyframes popIn { 0% { opacity: 0; transform: translateY(10px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } } 
    .animate-pop-in { animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } 
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    .glass-picker { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
  `;

  if (user === null) return <><style>{globalStyles}</style><AuthScreen t={t} /></>;
  
  if (activeChat) return <><style>{globalStyles}</style><ChatInterface user={user} roomId={activeChat.id} otherUser={activeChat.otherUser} encryptionKey={encryptionKey} goBack={() => setActiveChat(null)} t={t} /></>;

  // --- DASHBOARD (INBOX) SCREEN ---
  return (
    <div className="min-h-screen bg-[#050508] text-slate-200 flex flex-col font-sans relative animate-fade-in">
      <style>{globalStyles}</style>

      {/* Password Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <h3 className={`text-xl font-bold mb-1 ${t.text}`}>Secure Uplink</h3>
            <p className="text-xs text-slate-400 mb-4">Enter the Shared Secret Key to decrypt communications with <span className="text-white font-bold">{selectedAgent?.displayName}</span>.</p>
            <form onSubmit={confirmChatEntry}>
              <input type="password" autoFocus required value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="Encryption Key" className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-4 outline-none focus:border-white/30 ${t.ring} focus:ring-1`} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowKeyModal(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-sm">Cancel</button>
                <button type="submit" className={`flex-1 py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg`}>Decrypt</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <header className="bg-[#0f0f14]/90 backdrop-blur-md border-b border-white/10 px-6 py-5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow}`}><ShieldCheck className={`w-6 h-6 ${t.text}`} /></div>
          <div>
            <h2 className="font-mono text-xl font-bold text-slate-100">Global Network</h2>
            <p className="text-xs text-green-400 flex items-center gap-1">Welcome, {user.displayName || 'Agent'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-white rounded-lg bg-white/5" title="Change Theme"><Palette className="w-5 h-5" /></button>
          <button onClick={handleLogout} className="p-2 text-red-400 hover:text-white rounded-lg bg-white/5" title="Log Out"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      {/* Dashboard Body */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 pl-2">Available Agents</h3>
        
        {usersList.length === 0 ? (
          <div className="text-center p-12 border border-dashed border-white/10 rounded-2xl bg-white/5">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 text-sm">You are the only agent on the network right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {usersList.map((agent) => (
              <button key={agent.uid} onClick={() => startChatSequence(agent)} className="flex items-center gap-4 p-4 rounded-2xl bg-[#1a1a24] border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all group text-left">
                <div className={`w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <User className={`w-5 h-5 text-slate-400 group-hover:${t.text} transition-colors`} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="font-bold text-slate-200 truncate">{agent.displayName || 'Unknown Agent'}</h4>
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1"><Lock className="w-3 h-3" /> Encrypted Channel</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}