import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, query, where, getDocs, arrayUnion } from 'firebase/firestore';
import { 
  Lock, Unlock, Send, Key, MessageSquare, ShieldAlert, 
  ShieldCheck, LogOut, User, Loader2, Check, Users, 
  Palette, Reply, X, Smile, Mic, Square, Play, Pause, 
  ChevronLeft, Fingerprint, Search, Plus, Trash2, Settings, 
  Camera, PenLine, RefreshCw, Copy, Paperclip, Film
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

const compressAvatar = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { h *= 150 / w; w = 150; } else { w *= 150 / h; h = 150; }
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
  cyberpunk: { name: 'Cyberpunk', text: 'text-cyan-400', border: 'border-cyan-500/30', ring: 'focus:ring-cyan-400', bgLight: 'bg-cyan-500/10', btnGrad: 'from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500', sendBtn: 'from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500', msgMine: 'from-cyan-600/30 to-blue-600/20 border-cyan-500/30 text-cyan-50', glow: 'shadow-[0_0_15px_rgba(6,182,212,0.2)]', title: 'text-[#00ff41] drop-shadow-[0_0_10px_rgba(0,255,65,0.4)]', activeTab: 'bg-cyan-500/20 border-cyan-500/50 text-white' },
  matrix: { name: 'Matrix', text: 'text-green-400', border: 'border-green-500/30', ring: 'focus:ring-green-400', bgLight: 'bg-green-500/10', btnGrad: 'from-green-700 to-green-500 hover:from-green-600 hover:to-green-400', sendBtn: 'from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500', msgMine: 'from-green-600/30 to-emerald-600/20 border-green-500/30 text-green-50', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.2)]', title: 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]', activeTab: 'bg-green-500/20 border-green-500/50 text-white' },
  synthwave: { name: 'Synthwave', text: 'text-pink-400', border: 'border-pink-500/30', ring: 'focus:ring-pink-400', bgLight: 'bg-pink-500/10', btnGrad: 'from-pink-600 to-orange-500 hover:from-pink-500 hover:to-orange-400', sendBtn: 'from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500', msgMine: 'from-pink-600/30 to-purple-600/20 border-pink-500/30 text-pink-50', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.3)]', title: 'text-pink-400 drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]', activeTab: 'bg-pink-500/20 border-pink-500/50 text-white' },
  terminal: { name: 'Terminal', text: 'text-amber-500', border: 'border-amber-500/30', ring: 'focus:ring-amber-500', bgLight: 'bg-amber-500/10', btnGrad: 'from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500', sendBtn: 'from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500', msgMine: 'from-amber-600/20 to-orange-600/10 border-amber-500/30 text-amber-100', glow: 'shadow-[0_0_10px_rgba(245,158,11,0.2)]', title: 'text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]', activeTab: 'bg-amber-500/20 border-amber-500/50 text-white' },
  stealth: { name: 'Stealth', text: 'text-slate-300', border: 'border-slate-500/30', ring: 'focus:ring-slate-400', bgLight: 'bg-slate-500/20', btnGrad: 'from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500', sendBtn: 'from-slate-600 to-gray-600 hover:from-slate-500 hover:to-gray-500', msgMine: 'from-slate-700/50 to-gray-700/30 border-slate-500/30 text-slate-100', glow: 'shadow-[0_0_15px_rgba(148,163,184,0.1)]', title: 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]', activeTab: 'bg-slate-500/30 border-slate-500/50 text-white' },
  oceanic: { name: 'Oceanic', text: 'text-teal-400', border: 'border-teal-500/30', ring: 'focus:ring-teal-400', bgLight: 'bg-teal-500/10', btnGrad: 'from-blue-700 to-teal-500 hover:from-blue-600 hover:to-teal-400', sendBtn: 'from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500', msgMine: 'from-teal-600/30 to-blue-600/20 border-teal-500/30 text-teal-50', glow: 'shadow-[0_0_15px_rgba(45,212,191,0.2)]', title: 'text-teal-400 drop-shadow-[0_0_10px_rgba(45,212,191,0.4)]', activeTab: 'bg-teal-500/20 border-teal-500/50 text-white' }
};

const REACTION_EMOJIS = [
  '👍', '❤️', '😂', '🔥', '🥺', '🎉', '💯', '🤔', '👀', '🙌', '👏', '🙏', 
  '✨', '💀', '😭', '🤯', '😡', '🤢', '🤡', '👻', '👽', '🤖', '💩', '😎', 
  '🤓', '🥳', '😴', '🙄', '🤐', '🤫', '🤬', '😈', '✌️', '🤘', '👌', '🤌', 
  '💪', '🧠', '🖕', '🙂', '🫦', '🥵', '🥶', '🥴', '🧊', '🩸', '🧪', '📉'
];

// --- 1. THE AUTHENTICATION SCREEN ---
const AuthScreen = ({ t }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [agentId, setAgentId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    const safeId = agentId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (safeId.length < 3) return alert("Agent ID must be at least 3 letters or numbers.");
    const phantomEmail = `${safeId}@commslink.network`;

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, phantomEmail, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, phantomEmail, password);
        const finalName = displayName.trim() || agentId.trim();
        await updateProfile(userCredential.user, { displayName: finalName });
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          agentId: safeId,
          displayName: finalName,
          avatarData: null,
          lastSeen: Date.now()
        });
      }
    } catch (error) { 
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') alert("Access Denied: Invalid Agent ID or Password.");
      else if (error.code === 'auth/email-already-in-use') alert("This Agent ID is already claimed by someone else.");
      else alert(error.message); 
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
          
          <button type="submit" disabled={loading} className={`mt-4 bg-gradient-to-r ${t.btnGrad} text-white font-bold py-3 rounded-lg ${t.glow} flex justify-center items-center gap-2 transition-all hover:scale-[1.02] active:scale-95`}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLogin ? "Initialize Link" : "Claim Agent ID"}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-6 cursor-pointer hover:text-white transition-colors" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Need a new identity? Register here." : "Already have an Agent ID? Login here."}
        </p>
      </div>
    </div>
  );
};

// --- 2. THE CHAT INTERFACE (RIGHT PANE) ---
const ChatInterface = ({ user, usersList, threadId, chatData, encryptionKey, goBack, deleteChat, t }) => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [reactionPicker, setReactionPicker] = useState(null);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [newChatName, setNewChatName] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeTouch = useRef({ startX: 0, timer: null, isLongPress: false });

  const isGroup = chatData.isGroup;
  let chatName = "Unknown Channel";
  let chatAvatar = null;
  let memberCount = chatData.participants?.length || 0;

  if (isGroup) {
    chatName = chatData.name || "Group Server";
  } else {
    const otherUserId = chatData.participants.find(id => id !== user.uid);
    const otherUserAgent = usersList.find(u => u.uid === otherUserId);
    chatName = chatData.customName || otherUserAgent?.displayName || 'Unknown Agent';
    chatAvatar = otherUserAgent?.avatarData || null;
  }

  // Fetch and Assemble Messages
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'chat_threads', threadId, 'messages'), async (snapshot) => {
      const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      
      const videoGroups = {};
      const normalMessages = [];

      // Group fragments together
      raw.forEach(msg => {
        if (msg.type === 'video_chunk') {
          if (!videoGroups[msg.videoGroupId]) videoGroups[msg.videoGroupId] = [];
          videoGroups[msg.videoGroupId].push(msg);
        } else {
          normalMessages.push(msg);
        }
      });

      const assembledVideos = [];
      for (const [groupId, chunks] of Object.entries(videoGroups)) {
        const total = chunks[0].totalChunks;
        if (chunks.length === total) {
          chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
          const fullEncText = chunks.map(c => c.text).join('');
          assembledVideos.push({
            id: groupId,
            senderId: chunks[0].senderId,
            senderName: chunks[0].senderName,
            type: 'video',
            text: fullEncText,
            timestamp: chunks[0].timestamp,
            replyToId: chunks[0].replyToId,
            reactions: chunks[0].reactions || {}
          });
        } else {
          // Video is still uploading!
          assembledVideos.push({
            id: groupId,
            senderId: chunks[0].senderId,
            senderName: chunks[0].senderName,
            type: 'video_loading',
            progress: chunks.length,
            total: total,
            timestamp: chunks[0].timestamp
          });
        }
      }

      const combinedRaw = [...normalMessages, ...assembledVideos].sort((a, b) => a.timestamp - b.timestamp);

      const processed = await Promise.all(combinedRaw.map(async (msg) => {
        if (msg.type === 'video_loading') return { ...msg, isDecrypted: true };
        const decrypted = await decryptText(msg.text, encryptionKey);
        return { ...msg, decryptedText: decrypted, isDecrypted: decrypted !== null };
      }));

      setMessages(processed);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => unsubscribe();
  }, [threadId, encryptionKey]);

  const handleRenameChat = async (e) => {
    e.preventDefault();
    if (!newChatName.trim()) { setIsEditingName(false); return; }
    try {
      await updateDoc(doc(db, 'chat_threads', threadId), { 
        [isGroup ? 'name' : 'customName']: newChatName.trim() 
      });
      setIsEditingName(false);
    } catch (err) { alert("Failed to rename channel."); }
  };

  const handleSendText = async (e) => {
    e.preventDefault(); if (!inputText.trim() || !user) return;
    const txt = inputText; setInputText('');
    const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    try {
      const enc = await encryptText(txt, encryptionKey);
      await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'text', timestamp: Date.now(), replyToId: replyId, reactions: {} });
      await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() });
    } catch (err) { console.error(err); }
  };

  // The Data Shredder (Handles Images and Fragmented Videos)
  const processAndSendMedia = async (file) => {
    if (!file || !user) return;
    setIsUploading(true);
    const replyId = replyingTo ? replyingTo.id : null; setReplyingTo(null);
    
    try {
      if (file.type.startsWith('video/')) {
        // Prevent massive browser crashes
        if (file.size > 15 * 1024 * 1024) {
          alert("File too large for Shredding. Max size is 15MB.");
          setIsUploading(false); return;
        }

        setUploadText("Shredding Video File...");
        const base64Vid = await blobToBase64(file);
        
        setUploadText("Encrypting Data Packets...");
        const encVid = await encryptText(base64Vid, encryptionKey);

        const CHUNK_SIZE = 700000; // ~700KB chunks
        const totalChunks = Math.ceil(encVid.length / CHUNK_SIZE);
        const videoGroupId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

        for (let i = 0; i < totalChunks; i++) {
          setUploadText(`Sending Packet ${i+1}/${totalChunks}...`);
          const chunkText = encVid.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { 
            senderId: user.uid, senderName: user.displayName, 
            type: 'video_chunk', videoGroupId, chunkIndex: i, totalChunks, 
            text: chunkText, timestamp: Date.now() + i, replyToId: replyId, reactions: {} 
          });
        }
        await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() });

      } else if (file.type.startsWith('image/')) {
        setUploadText("Compressing Image...");
        const b64 = await compressImage(file); 
        const enc = await encryptText(b64, encryptionKey);
        await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: enc, type: 'image', timestamp: Date.now(), replyToId: replyId, reactions: {} });
        await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() });
      }
    } catch (err) { 
      console.error(err); alert("Failed to send media."); 
    } finally { 
      setIsUploading(false); setUploadText(''); 
    }
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
        setIsUploading(true); setUploadText("Encrypting Audio..."); 
        clearInterval(recordingTimerRef.current); setRecordingTime(0);
        const blob = new Blob(mediaChunksRef.current, { type: 'audio/webm' });
        mediaStreamRef.current.getTracks().forEach(track => track.stop()); 
        
        try {
          const base64Audio = await blobToBase64(blob);
          const encAudio = await encryptText(base64Audio, encryptionKey);
          await addDoc(collection(db, 'chat_threads', threadId, 'messages'), { senderId: user.uid, senderName: user.displayName, text: encAudio, type: 'audio', timestamp: Date.now(), replyToId: replyingTo ? replyingTo.id : null, reactions: {} });
          await updateDoc(doc(db, 'chat_threads', threadId), { lastActivity: Date.now() });
          setReplyingTo(null);
        } catch (error) { alert("Failed to send audio."); }
        setIsUploading(false); setUploadText('');
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
    await updateDoc(doc(db, 'chat_threads', threadId, 'messages', msgId), { reactions: updatedReactions });
  };

  return (
    <div className="flex-1 flex flex-col relative bg-[#050508]" onClick={() => setReactionPicker(null)}>
      {zoomedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md cursor-pointer animate-fade-in" onClick={() => setZoomedImage(null)}>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Renaming Modal */}
      {isEditingName && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <h3 className={`text-xl font-bold mb-1 ${t.text}`}>Rename Channel</h3>
            <p className="text-xs text-slate-400 mb-4">Assign a new identity to this secure link.</p>
            <form onSubmit={handleRenameChat}>
              <input type="text" autoFocus required value={newChatName} onChange={(e) => setNewChatName(e.target.value)} placeholder="New Name..." className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-4 outline-none focus:border-white/30 ${t.ring} focus:ring-1`} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsEditingName(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-sm">Cancel</button>
                <button type="submit" className={`flex-1 py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg`}>Update</button>
              </div>
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
            <h2 className="font-mono text-md font-bold text-slate-100 flex items-center gap-2 truncate">
              {chatName} <PenLine className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h2>
            <p className="text-[10px] text-green-400 flex items-center gap-1">
              <Lock className="w-3 h-3" /> {isGroup ? `${memberCount} Agents` : 'E2E Encrypted'}
            </p>
          </div>
        </div>
        <button onClick={() => deleteChat(threadId, isGroup)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all shrink-0" title={isGroup ? "Leave Group" : "Delete Chat"}>
          {isGroup ? <LogOut className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
        </button>
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
                <button onClick={(e) => { e.stopPropagation(); setReactionPicker(msg.id === reactionPicker ? null : msg.id); }} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} rounded-full hover:bg-white/10 shadow-lg transition-transform hover:scale-110`}><Smile className="w-4 h-4" /></button>
                <button onClick={() => setReplyingTo(msg)} className={`p-2 bg-[#1a1a24] border border-white/10 ${t.text} rounded-full hover:bg-white/10 shadow-lg transition-transform hover:scale-110`}><Reply className="w-4 h-4" /></button>
              </div>

              {reactionPicker === msg.id && (
                <div className={`absolute ${isMine ? 'right-0' : 'left-0'} ${index < 3 ? 'top-full mt-2' : 'bottom-full mb-2'} bg-[#1a1a24]/95 border border-white/10 rounded-2xl p-3 z-50 w-[270px] max-h-48 overflow-y-auto custom-scrollbar glass-picker animate-pop-in`} onClick={e => e.stopPropagation()}>
                  <div className="grid grid-cols-6 gap-1">{REACTION_EMOJIS.map(emoji => (<button key={emoji} onClick={() => toggleReaction(msg.id, msg.reactions, emoji)} className="w-9 h-9 hover:bg-white/10 rounded-lg text-xl transition-all hover:scale-110">{emoji}</button>))}</div>
                </div>
              )}

              {isGroup && !isMine && <span className="text-[10px] text-slate-500 mb-1 ml-1">{msg.senderName}</span>}

              <div className={`p-1.5 rounded-2xl shadow-lg relative ${msg.isDecrypted ? isMine ? `bg-gradient-to-br ${t.msgMine} rounded-tr-sm border` : 'bg-[#1a1a24] border border-white/10 text-slate-200 rounded-tl-sm' : 'bg-red-900/20 border border-red-500/30 text-red-300 rounded-tl-sm'}`}>
                {repliedMsg && repliedMsg.isDecrypted && (
                  <div className="mb-2 p-2 bg-black/30 rounded border-l-2 border-cyan-500/50 text-xs opacity-80 select-none">
                    <span className={`font-bold ${t.text}`}>{repliedMsg.senderName}</span>
                    <span className="truncate block max-w-[200px] mt-0.5">{repliedMsg.type === 'text' ? repliedMsg.decryptedText : `📷 Media`}</span>
                  </div>
                )}
                
                {msg.isDecrypted ? (
                  msg.type === 'image' ? (
                     <img src={msg.decryptedText} onClick={() => setZoomedImage(msg.decryptedText)} className="max-w-full rounded-xl cursor-zoom-in border border-white/5" style={{maxHeight:'350px'}} /> 
                  ) : msg.type === 'video' ? (
                     <video controls src={msg.decryptedText} className="max-w-full rounded-xl shadow-md border border-white/10" style={{maxHeight:'350px'}} />
                  ) : msg.type === 'video_loading' ? (
                     <div className="px-4 py-3 flex flex-col gap-2 min-w-[200px]">
                        <div className={`flex items-center gap-2 font-bold mb-1 border-b border-white/10 pb-2 text-xs ${t.text}`}>
                           <Loader2 className="w-3.5 h-3.5 animate-spin" /> ASSEMBLING DATA...
                        </div>
                        <div className="w-full bg-black/50 h-1.5 rounded-full overflow-hidden">
                           <div className={`h-full bg-gradient-to-r ${t.sendBtn} transition-all duration-300`} style={{width: `${(msg.progress/msg.total)*100}%`}}></div>
                        </div>
                        <span className="opacity-50 text-[10px] text-right">Packets: {msg.progress} / {msg.total}</span>
                     </div>
                  ) : msg.type === 'audio' ? (
                     <CustomAudioPlayer src={msg.decryptedText} t={t} /> 
                  ) : (
                     <div className="px-4 py-2.5 text-[15px] whitespace-pre-wrap">{msg.decryptedText}</div>
                  )
                ) : (
                  <div className="px-4 py-3 text-xs opacity-50"><Lock className="w-3.5 h-3.5 inline mr-1"/> BLOCKED/INVALID KEY</div>
                )}
              
                {hasReactions && (
                  <div className={`absolute -bottom-3 ${isMine ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10 animate-pop-in`}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => (<button key={emoji} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, msg.reactions, emoji); }} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border shadow-md transition-all active:scale-95 hover:scale-105 ${users.includes(user.uid) ? `${t.bgLight} ${t.border} ${t.text}` : 'bg-[#1a1a24] border-white/10 text-slate-300'}`}><span>{emoji}</span>{users.length > 1 && <span>{users.length}</span>}</button>))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="bg-[#0f0f14]/90 backdrop-blur-md border-t border-white/10 z-20 shrink-0 pb-safe">
        {replyingTo && (
          <div className="px-6 py-3 bg-[#1a1a24]/90 border-b border-cyan-500/30 flex items-center justify-between text-sm animate-bouncy-slide-up origin-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.3)]">
            <div className="flex flex-col border-l-2 border-cyan-500 pl-3">
              <span className={`text-xs font-bold ${t.text}`}>Replying to {replyingTo.senderName}</span>
              <span className="text-slate-400 text-xs truncate max-w-[200px] mt-0.5">{replyingTo.type === 'text' ? replyingTo.decryptedText : 'Media'}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-2 text-slate-400 hover:text-red-400 bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
          </div>
        )}
        <div className="p-3 sm:p-4 flex gap-2 relative items-center">
          {!isRecording && (
            <div className="flex items-center gap-1">
              {/* Note: File input now accepts video and images */}
              <input type="file" accept="image/*,video/*" className="hidden" ref={fileInputRef} onChange={(e) => { if(e.target.files[0]) { processAndSendMedia(e.target.files[0]); e.target.value=''; } }} />
              <button onClick={() => fileInputRef.current?.click()} className={`p-2 sm:p-2.5 text-slate-400 hover:${t.text} rounded-xl hover:bg-white/5 transition-colors`} title="Attach File"><Paperclip className="w-5 h-5" /></button>
              <button onClick={startRecording} className={`p-2 sm:p-2.5 text-slate-400 hover:${t.text} rounded-xl hover:bg-white/5 transition-colors`} title="Voice Note"><Mic className="w-5 h-5" /></button>
            </div>
          )}
          
          {isUploading && uploadText ? (
             <div className={`flex-1 flex justify-between bg-black/50 border border-white/10 rounded-xl px-4 py-3 animate-pulse`}>
                <span className={`font-bold tracking-widest text-xs flex items-center gap-2 ${t.text}`}><Loader2 className="w-4 h-4 animate-spin"/> {uploadText}</span>
             </div>
          ) : isRecording ? (
            <div className="flex-1 flex justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 animate-pulse">
              <span className="text-red-400 font-bold tracking-widest text-sm flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> RECORDING</span>
              <span className="text-red-400 font-bold">{Math.floor(recordingTime/60)}:{recordingTime%60 < 10 ? '0':''}{recordingTime%60}</span>
            </div>
          ) : (
            <form onSubmit={handleSendText} className="flex-1">
              <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="Secure message..." className={`w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-sm ${t.ring} focus:ring-1 outline-none transition-all placeholder:text-slate-600`} />
            </form>
          )}

          {isRecording ? (
             <button onClick={stopRecording} className="bg-red-600 hover:bg-red-500 p-3 rounded-xl text-white transition-colors shadow-lg shadow-red-500/20"><Square className="w-5 h-5 fill-current" /></button> 
          ) : (
             <button onClick={handleSendText} disabled={(!inputText.trim() && !isUploading) || isUploading} className={`bg-gradient-to-r ${t.sendBtn} p-3 rounded-xl text-white disabled:opacity-50 transition-all ${t.glow} hover:-translate-y-0.5 active:scale-95`}><Send className="w-5 h-5 ml-0.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
};


// --- 3. MAIN APP ROUTER (SPLIT PANE UI) ---
export default function App() {
  const [user, setUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [chatThreads, setChatThreads] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [encryptionKey, setEncryptionKey] = useState('');
  
  const [themeMode, setThemeMode] = useState('cyberpunk');
  const t = themeStyles[themeMode];
  
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [targetThread, setTargetThread] = useState(null);
  const [tempKey, setTempKey] = useState('');
  
  const [connectMode, setConnectMode] = useState('agent');
  const [searchAgentId, setSearchAgentId] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [editName, setEditName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const avatarInputRef = useRef(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const others = [];
      snapshot.forEach(doc => {
        if (doc.id === user.uid) {
          setCurrentUserData(doc.data());
          if (!editName) setEditName(doc.data().displayName || '');
        } else {
          others.push(doc.data());
        }
      });
      setUsersList(others);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'chat_threads'), where('participants', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const threads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      threads.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
      setChatThreads(threads);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleTheme = () => {
    const modes = Object.keys(themeStyles);
    setThemeMode(modes[(modes.indexOf(themeMode) + 1) % modes.length]);
  };

  const handleLogout = () => { signOut(auth); setActiveChat(null); };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { displayName: editName });
      await updateProfile(user, { displayName: editName });
      setShowProfileModal(false);
    } catch (err) { alert("Failed to update profile."); }
    setIsSavingProfile(false);
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressedAvatarBase64 = await compressAvatar(file);
      await updateDoc(doc(db, 'users', user.uid), { avatarData: compressedAvatarBase64 });
    } catch (err) { alert("Failed to update avatar."); }
  };

  const copyAgentId = () => {
    if (currentUserData?.agentId) {
      navigator.clipboard.writeText(currentUserData.agentId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const generateRandomGroup = () => {
    const adj = ['silent', 'dark', 'hidden', 'crypto', 'neon', 'shadow'];
    const nouns = ['vault', 'nexus', 'ghost', 'signal', 'pulse', 'void'];
    setGroupNameInput(`${adj[Math.floor(Math.random() * adj.length)]}-${nouns[Math.floor(Math.random() * nouns.length)]}-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  const handleGroupJoin = async (e) => {
    e.preventDefault();
    if (!groupNameInput.trim()) return;
    setIsSearching(true);
    try {
      const safeGroupId = groupNameInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const groupRef = doc(db, 'chat_threads', safeGroupId);
      const groupSnap = await getDoc(groupRef);

      if (groupSnap.exists()) {
        if (!groupSnap.data().participants.includes(user.uid)) {
          await updateDoc(groupRef, { participants: arrayUnion(user.uid) });
        }
      } else {
        await setDoc(groupRef, {
          isGroup: true,
          name: groupNameInput.trim(),
          participants: [user.uid],
          createdAt: Date.now(),
          lastActivity: Date.now()
        });
      }
      setGroupNameInput('');
      triggerChatEntry({ id: safeGroupId, isGroup: true, name: groupNameInput.trim() });
    } catch (err) { alert("Failed to connect to group."); }
    setIsSearching(false);
  };

  const handleSearchAndCreateChat = async (e) => {
    e.preventDefault();
    if (!searchAgentId.trim()) return;
    setIsSearching(true);
    try {
      const q = query(collection(db, 'users'), where('agentId', '==', searchAgentId.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { alert("Agent ID not found in the network."); setIsSearching(false); return; }
      
      const targetAgent = snap.docs[0].data();
      if (targetAgent.uid === user.uid) { alert("You cannot start a chat with yourself."); setIsSearching(false); return; }

      const newThreadRef = await addDoc(collection(db, 'chat_threads'), {
        isGroup: false,
        participants: [user.uid, targetAgent.uid],
        participantNames: { [user.uid]: user.displayName, [targetAgent.uid]: targetAgent.displayName },
        createdAt: Date.now(),
        lastActivity: Date.now()
      });

      setSearchAgentId('');
      triggerChatEntry({ id: newThreadRef.id, participants: [user.uid, targetAgent.uid] });
    } catch (err) { console.error("Search failed:", err); }
    setIsSearching(false);
  };

  const triggerChatEntry = (thread) => {
    const savedKeys = JSON.parse(localStorage.getItem('commslink_keys') || '{}');
    if (savedKeys[thread.id]) { setEncryptionKey(savedKeys[thread.id]); setActiveChat(thread); } 
    else { setTargetThread(thread); setTempKey(''); setShowKeyModal(true); }
  };

  const confirmChatEntry = (e) => {
    e.preventDefault();
    if (!tempKey.trim()) return;
    const savedKeys = JSON.parse(localStorage.getItem('commslink_keys') || '{}');
    savedKeys[targetThread.id] = tempKey;
    localStorage.setItem('commslink_keys', JSON.stringify(savedKeys));
    setEncryptionKey(tempKey); setActiveChat(targetThread); setShowKeyModal(false);
  };

  const handleDeleteChat = async (threadId, isGroup) => {
    if(window.confirm(isGroup ? "Are you sure you want to leave this group?" : "Are you sure you want to delete this secure channel?")) {
      try {
        if (isGroup) {
          const groupRef = doc(db, 'chat_threads', threadId);
          const groupSnap = await getDoc(groupRef);
          const newParticipants = groupSnap.data().participants.filter(id => id !== user.uid);
          if (newParticipants.length === 0) await deleteDoc(groupRef); 
          else await updateDoc(groupRef, { participants: newParticipants });
        } else {
          await deleteDoc(doc(db, 'chat_threads', threadId));
        }
        const savedKeys = JSON.parse(localStorage.getItem('commslink_keys') || '{}');
        delete savedKeys[threadId];
        localStorage.setItem('commslink_keys', JSON.stringify(savedKeys));
        if (activeChat?.id === threadId) setActiveChat(null);
      } catch (err) { alert("Action failed."); }
    }
  };

  const globalStyles = `
    @keyframes popIn { 0% { opacity: 0; transform: translateY(10px) scale(0.98); } 100% { opacity: 1; transform: translateY(0) scale(1); } } 
    .animate-pop-in { animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; } 
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    
    @keyframes bouncySlideUp { 0% { transform: translateY(100%); opacity: 0; } 70% { transform: translateY(-5%); opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
    .animate-bouncy-slide-up { animation: bouncySlideUp 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }

    .glass-picker { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
    
    .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
  `;

  if (user === null) return <><style>{globalStyles}</style><AuthScreen t={t} /></>;

  return (
    <div className="flex h-screen w-full bg-[#050508] text-slate-200 overflow-hidden font-sans">
      <style>{globalStyles}</style>

      {/* Profile Settings Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-bold ${t.text}`}>Agent Protocol</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex flex-col items-center mb-6">
              <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarChange} />
              <div onClick={() => avatarInputRef.current?.click()} className={`relative w-24 h-24 rounded-full bg-gradient-to-br ${t.bgLight} border-2 ${t.border} flex items-center justify-center cursor-pointer group overflow-hidden shadow-lg`}>
                {currentUserData?.avatarData ? <img src={currentUserData.avatarData} className="w-full h-full object-cover group-hover:opacity-50 transition-all" /> : <User className={`w-10 h-10 ${t.text} group-hover:opacity-50 transition-all`} />}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Camera className="w-8 h-8 text-white drop-shadow-md" /></div>
              </div>
            </div>

            {/* BIG AGENT ID DISPLAY */}
            <div className="text-center mb-6">
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Your Agent ID</p>
              <div onClick={copyAgentId} className={`inline-flex items-center gap-2 cursor-pointer font-mono text-lg font-bold bg-black/50 py-2 px-4 rounded-xl border ${copiedId ? 'border-green-500 text-green-400' : 'border-white/10 text-white'} hover:bg-white/5 transition-all shadow-inner`}>
                {currentUserData?.agentId}
                {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 opacity-50" />}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Share this with agents to establish a link.</p>
            </div>

            <form onSubmit={handleUpdateProfile}>
              <div className="flex flex-col gap-2 mb-6">
                <label className="text-xs font-semibold text-slate-400 uppercase">Display Name</label>
                <input type="text" required value={editName} onChange={(e) => setEditName(e.target.value)} className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-white/30 ${t.ring} focus:ring-1 text-center`} />
              </div>
              <button type="submit" disabled={isSavingProfile} className={`w-full py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg flex justify-center items-center`}>
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a24] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
            <h3 className={`text-xl font-bold mb-1 ${t.text}`}>Secure Uplink</h3>
            <p className="text-xs text-slate-400 mb-4">Set or enter the Decryption Key for this channel.</p>
            <form onSubmit={confirmChatEntry}>
              <input type="password" autoFocus required value={tempKey} onChange={(e) => setTempKey(e.target.value)} placeholder="Encryption Key" className={`w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 mb-4 outline-none focus:border-white/30 ${t.ring} focus:ring-1`} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowKeyModal(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all font-bold text-sm">Cancel</button>
                <button type="submit" className={`flex-1 py-3 rounded-xl bg-gradient-to-r ${t.sendBtn} text-white font-bold text-sm shadow-lg`}>Enter</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= LEFT SIDEBAR (INBOX) ================= */}
      <div className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-[350px] lg:w-[400px] flex-col border-r border-white/10 z-20 shrink-0 bg-[#0a0a0f]`}>
        <header className="px-4 py-4 border-b border-white/10 shrink-0 flex justify-between items-center bg-[#0f0f14]">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowProfileModal(true)} className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.bgLight} border ${t.border} flex items-center justify-center ${t.glow} hover:scale-105 transition-all overflow-hidden shadow-lg cursor-pointer shrink-0`}>
              {currentUserData?.avatarData ? <img src={currentUserData.avatarData} className="w-full h-full object-cover" /> : <Settings className={`w-5 h-5 ${t.text}`} />}
            </button>
            <div className="flex flex-col">
              <h2 className={`font-mono text-lg font-bold ${t.title} truncate tracking-widest`}>CommsLink</h2>
              <span className="text-[10px] text-slate-400 uppercase">Global Network</span>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"><Palette className="w-4 h-4" /></button>
            <button onClick={handleLogout} className="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-white/5"><LogOut className="w-4 h-4" /></button>
          </div>
        </header>

        <div className="p-4 border-b border-white/5 shrink-0 bg-[#0c0c12]">
          <div className="flex gap-1 mb-3 bg-black/40 p-1 rounded-lg border border-white/5">
            <button onClick={() => setConnectMode('agent')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${connectMode === 'agent' ? t.activeTab : 'text-slate-500 hover:text-slate-300'}`}>Agent Link</button>
            <button onClick={() => setConnectMode('group')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${connectMode === 'group' ? t.activeTab : 'text-slate-500 hover:text-slate-300'}`}>Server Join</button>
          </div>

          {connectMode === 'agent' ? (
            <form onSubmit={handleSearchAndCreateChat} className="flex gap-2">
              <div className="relative flex-1 group">
                <div className={`absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:${t.text}`}><Search className="w-3.5 h-3.5" /></div>
                <input type="text" value={searchAgentId} onChange={(e) => setSearchAgentId(e.target.value)} placeholder="Enter Agent ID..." className={`w-full bg-black/50 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-sm ${t.ring} focus:ring-1 outline-none transition-all`} />
              </div>
              <button type="submit" disabled={isSearching || !searchAgentId.trim()} className={`bg-gradient-to-r ${t.sendBtn} text-white px-3 rounded-lg disabled:opacity-50`}><Plus className="w-4 h-4" /></button>
            </form>
          ) : (
            <form onSubmit={handleGroupJoin} className="flex gap-2">
              <div className="relative flex-1 group flex items-center">
                <input type="text" value={groupNameInput} onChange={(e) => setGroupNameInput(e.target.value)} placeholder="Server Name..." className={`w-full bg-black/50 border border-white/10 rounded-lg py-2 pl-3 pr-8 text-sm ${t.ring} focus:ring-1 outline-none transition-all`} />
                <button type="button" onClick={generateRandomGroup} className="absolute right-2 p-1 text-slate-500 hover:text-white" title="Random Server"><RefreshCw className="w-3 h-3" /></button>
              </div>
              <button type="submit" disabled={isSearching || !groupNameInput.trim()} className={`bg-gradient-to-r ${t.sendBtn} text-white px-3 rounded-lg disabled:opacity-50`}><Users className="w-4 h-4" /></button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {chatThreads.length === 0 ? (
             <div className="text-center p-8 mt-4 text-slate-500 opacity-50">
               <MessageSquare className="w-8 h-8 mx-auto mb-2" />
               <p className="text-xs">No active channels.</p>
             </div>
          ) : (
            chatThreads.map((thread) => {
              const isGroup = thread.isGroup;
              let chatName = "Unknown";
              let chatAvatar = null;
              
              if (isGroup) {
                chatName = thread.name || "Group Server";
              } else {
                const otherUserId = thread.participants.find(id => id !== user.uid);
                const otherUserAgent = usersList.find(u => u.uid === otherUserId);
                chatName = thread.customName || otherUserAgent?.displayName || thread.participantNames[otherUserId] || 'Unknown Agent';
                chatAvatar = otherUserAgent?.avatarData || null;
              }

              const hasLocalKey = !!JSON.parse(localStorage.getItem('commslink_keys') || '{}')[thread.id];
              const isActive = activeChat?.id === thread.id;

              return (
                <button key={thread.id} onClick={() => triggerChatEntry(thread)} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group text-left ${isActive ? 'bg-white/10 border border-white/5' : 'bg-transparent hover:bg-white/5 border border-transparent'}`}>
                  <div className={`w-11 h-11 rounded-full bg-black/50 border ${isActive ? t.border : 'border-white/10'} flex items-center justify-center shrink-0 overflow-hidden`}>
                    {isGroup ? <Users className={`w-4 h-4 ${isActive ? t.text : 'text-slate-400'}`} /> : (chatAvatar ? <img src={chatAvatar} className="w-full h-full object-cover" /> : <User className={`w-4 h-4 ${isActive ? t.text : 'text-slate-400'}`} />)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className={`font-bold truncate text-sm ${isActive ? 'text-white' : 'text-slate-300'}`}>{chatName}</h4>
                    <p className={`text-[10px] truncate flex items-center gap-1 mt-0.5 ${hasLocalKey ? 'text-green-500/70' : 'text-amber-500/70'}`}>
                      {hasLocalKey ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      {hasLocalKey ? 'Cached' : 'Locked'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ================= RIGHT MAIN CHAT AREA ================= */}
      <div className={`${!activeChat ? 'hidden md:flex' : 'flex'} flex-1 flex-col relative bg-[#050508]`}>
        {activeChat ? (
          <ChatInterface user={user} usersList={usersList} threadId={activeChat.id} chatData={activeChat} encryptionKey={encryptionKey} goBack={() => setActiveChat(null)} deleteChat={handleDeleteChat} t={t} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500/40 relative">
             <div className="absolute inset-0 bg-center bg-no-repeat bg-contain opacity-5" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg width=\"100\" height=\"100\" viewBox=\"0 0 100 100\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M50 20L80 40V70L50 90L20 70V40L50 20Z\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>')" }}></div>
             <ShieldCheck className="w-24 h-24 mb-6 drop-shadow-2xl" />
             <h3 className="font-mono text-xl tracking-widest uppercase mb-2">CommsLink Standby</h3>
             <p className="text-sm">Select a channel from the directory to establish uplink.</p>
          </div>
        )}
      </div>

    </div>
  );
}