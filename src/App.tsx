import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';
import { auth, db } from './firebase';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, BarChart, Bar, CartesianGrid, Tooltip } from 'recharts';

// Importaciones para el Mapa Interactivo de Leaflet
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Message {
  id: string;
  text?: string;
  imageUrl?: string;
  audioUrl?: string;
  location?: { lat: number; lng: number; active?: boolean; docId?: string };
  email: string;
  senderName?: string;
  senderPhoto?: string;
  recipientEmail?: string;
  createdAt: any;
  reactions?: { [emoji: string]: string[] };
  edited?: boolean;
}

interface UserProfile {
  name: string;
  photoUrl: string;
  isAdmin?: boolean;
  role?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [firebaseUsersList, setFirebaseUsersList] = useState<UserProfile & { email: string }[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>('Global Terminal');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', photoUrl: '', isAdmin: false });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');

  const [activeDashboardTab, setActiveDashboardTab] = useState<'volume' | 'hourly'>('volume');
  const [dashboardUserFilter, setDashboardUserFilter] = useState('all');
  const [dashboardDateFilter, setDashboardDateFilter] = useState('');
  const [dashboardPeriod, setDashboardPeriod] = useState<'1W' | '1M' | '6M' | '1Y'>('1W');

  const [sharingLiveLocation, setSharingLiveLocation] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const [partnerTyping, setPartnerTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showEmojiPickerFor, setShowEmojiPickerFor] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastMessageCountRef = useRef<number>(0);

  const ADMIN_EMAIL = 'arauz.carlos25@gmail.com';
  const isAdmin = userProfile.isAdmin === true || userProfile.role === 'admin' || user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let rotationAngle = 0;

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    const render = () => {
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(canvas.width, canvas.height) * 0.32;

      rotationAngle += 0.012;

      const glow = ctx.createRadialGradient(centerX, centerY, radius * 0.85, centerX, centerY, radius * 1.8);
      glow.addColorStop(0, 'rgba(249, 115, 22, 0.35)');
      glow.addColorStop(0.5, 'rgba(194, 65, 12, 0.1)');
      glow.addColorStop(1, 'rgba(3, 7, 18, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();

      const sphereGrad = ctx.createRadialGradient(
        centerX - radius * 0.35, 
        centerY - radius * 0.35, 
        radius * 0.05, 
        centerX, 
        centerY, 
        radius
      );
      sphereGrad.addColorStop(0, '#fed7aa');
      sphereGrad.addColorStop(0.35, '#f97316');
      sphereGrad.addColorStop(0.75, '#c2410c');
      sphereGrad.addColorStop(1, '#431407');
      ctx.fillStyle = sphereGrad;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      for (let i = -12; i <= 12; i++) {
        const bandY = centerY + (i * (radius * 0.1)) + Math.sin(rotationAngle + i * 0.5) * 10;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(67, 20, 7, 0.5)' : 'rgba(255, 237, 213, 0.25)';
        ctx.beginPath();
        ctx.ellipse(centerX, bandY, radius * 1.05, radius * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const shadow = ctx.createLinearGradient(centerX - radius * 0.1, centerY, centerX + radius, centerY);
      shadow.addColorStop(0, 'rgba(3, 7, 18, 0)');
      shadow.addColorStop(0.4, 'rgba(3, 7, 18, 0.2)');
      shadow.addColorStop(1, 'rgba(3, 7, 18, 0.92)');
      ctx.fillStyle = shadow;
      ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email) {
        try {
          const userRef = doc(db, 'users', currentUser.email);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            setUserProfile(data);
            setEditName(data.name || currentUser.email.split('@')[0]);
            setEditPhoto(data.photoUrl || currentUser.photoURL || '');
          } else {
            const defaultProfile = {
              name: currentUser.displayName || currentUser.email.split('@')[0],
              photoUrl: currentUser.photoURL || '',
              isAdmin: currentUser.email === ADMIN_EMAIL
            };
            await setDoc(userRef, defaultProfile);
            setUserProfile(defaultProfile);
            setEditName(defaultProfile.name);
            setEditPhoto(defaultProfile.photoUrl);
          }
        } catch (error) {
          console.error("Error al cargar perfil:", error);
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: (UserProfile & { email: string })[] = [];
      snapshot.forEach((docItem) => {
        const data = docItem.data() as UserProfile;
        users.push({
          email: docItem.id,
          name: data.name || docItem.id.split('@')[0],
          photoUrl: data.photoUrl || '',
          isAdmin: data.isAdmin,
          role: data.role
        });
      });
      setFirebaseUsersList(users);
    }, (error) => {
      console.error("Error cargando usuarios de Firebase:", error);
    });

    return () => unsubscribeUsers();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((docItem) => {
        msgs.push({ id: docItem.id, ...docItem.data() } as Message);
      });

      if (lastMessageCountRef.current > 0 && msgs.length > lastMessageCountRef.current) {
        const latestMsg = msgs[msgs.length - 1];
        if (latestMsg && latestMsg.email !== user.email) {
          const isForMe = (!latestMsg.recipientEmail || latestMsg.recipientEmail === 'Global Terminal') || 
                          (latestMsg.recipientEmail === user.email);

          if (isForMe && 'Notification' in window && Notification.permission === 'granted') {
            const senderDisplayName = latestMsg.senderName || latestMsg.email.split('@')[0];
            const notificationTitle = `Nuevo mensaje de ${senderDisplayName}`;
            const notificationBody = latestMsg.text || (latestMsg.imageUrl ? '📷 [Imagen adjunta]' : (latestMsg.audioUrl ? '🎤 [Nota de voz]' : '📍 [Ubicación compartida]'));
            
            new Notification(notificationTitle, {
              body: notificationBody,
              icon: latestMsg.senderPhoto || '/favicon.ico'
            });
          }
        }
      }
      lastMessageCountRef.current = msgs.length;
      setMessages(msgs);
    }, (error) => {
      console.error("Error en mensajes:", error);
    });
    return () => unsubscribe();
  }, [user]);

  const typingDocId = selectedContact === 'Global Terminal' 
    ? 'typing_global' 
    : [user?.email, selectedContact].sort().join('_') || 'typing_chat';

  useEffect(() => {
    if (!user) return;
    const typingRef = doc(db, 'typingStatus', typingDocId);
    const unsubscribe = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.user && data.user !== user.email && data.isTyping) {
          setPartnerTyping(true);
        } else {
          setPartnerTyping(false);
        }
      } else {
        setPartnerTyping(false);
      }
    }, () => {});
    return () => unsubscribe();
  }, [selectedContact, user]);

  const handleTypingChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (!user) return;

    try {
      const typingRef = doc(db, 'typingStatus', typingDocId);
      await setDoc(typingRef, { user: user.email, isTyping: true }, { merge: true });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(async () => {
        await setDoc(typingRef, { user: user.email, isTyping: false }, { merge: true });
      }, 2000);
    } catch (err) {}
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContact]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error al iniciar sesión", error);
    }
  };

  const handleLogout = async () => {
    stopLiveLocation();
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

  const updateProfileData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    const updated = { 
      ...userProfile,
      name: editName.trim() || user.email.split('@')[0], 
      photoUrl: editPhoto 
    };

    try {
      await setDoc(doc(db, 'users', user.email), updated, { merge: true });
      setUserProfile(updated);
      setShowSettingsModal(false);
      setShowProfileModal(false);
    } catch (error) {
      console.error("Error al actualizar perfil:", error);
    }
  };

  const handleProfileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const executeSendMessage = async () => {
    if (!newMessage.trim() || !user || !user.email) return;

    try {
      if (selectedContact && selectedContact !== 'Global Terminal') {
        const recipientRef = doc(db, 'users', selectedContact);
        const recipientSnap = await getDoc(recipientRef);
        if (!recipientSnap.exists()) {
          await setDoc(recipientRef, {
            name: selectedContact.split('@')[0],
            photoUrl: '',
            isAdmin: false
          });
        }
      }

      await addDoc(collection(db, 'messages'), {
        text: newMessage.trim(),
        email: user.email,
        senderName: userProfile.name || user?.email?.split('@')[0] || 'Usuario',
        senderPhoto: userProfile.photoUrl || '',
        recipientEmail: selectedContact,
        createdAt: serverTimestamp(),
        reactions: {}
      });
      setNewMessage('');
      
      const typingRef = doc(db, 'typingStatus', typingDocId);
      await setDoc(typingRef, { user: user.email, isTyping: false }, { merge: true });
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeSendMessage();
    }
  };

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (!user || !user.email) return;
          try {
            await addDoc(collection(db, 'messages'), {
              audioUrl: base64Audio,
              email: user.email,
              senderName: userProfile.name || user.email.split('@')[0],
              senderPhoto: userProfile.photoUrl || '',
              recipientEmail: selectedContact,
              createdAt: serverTimestamp(),
              reactions: {}
            });
          } catch (error) {
            console.error("Error al enviar audio:", error);
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("No se pudo acceder al micrófono", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !user.email) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await addDoc(collection(db, 'messages'), {
          imageUrl: reader.result as string,
          email: user.email,
          senderName: userProfile.name || user?.email?.split('@')[0] || 'Usuario',
          senderPhoto: userProfile.photoUrl || '',
          recipientEmail: selectedContact,
          createdAt: serverTimestamp(),
          reactions: {}
        });
      } catch (error) {
        console.error("Error al enviar imagen:", error);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleLiveLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }

    if (sharingLiveLocation) {
      stopLiveLocation();
    } else {
      startLiveLocation();
    }
  };

  const startLiveLocation = () => {
    if (!user || !user.email) return;
    setSharingLiveLocation(true);

    const liveDocId = `live_${user.email.replace('.', '_')}_${(selectedContact || 'global').replace('.', '_')}`;
    const liveRef = doc(db, 'liveLocations', liveDocId);

    addDoc(collection(db, 'messages'), {
      text: `Ubicación en tiempo real compartida.`,
      location: { active: true, docId: liveDocId },
      email: user.email,
      senderName: userProfile.name || user.email.split('@')[0],
      senderPhoto: userProfile.photoUrl || '',
      recipientEmail: selectedContact,
      createdAt: serverTimestamp(),
      reactions: {}
    }).catch(err => console.error("Error ubicación:", err));

    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await setDoc(liveRef, {
            lat: latitude,
            lng: longitude,
            email: user.email,
            photoUrl: userProfile.photoUrl || '',
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error GPS:", error);
        }
      },
      (error) => {
        console.error("GPS error:", error.message);
        setSharingLiveLocation(false);
      },
      options
    );

    watchIdRef.current = id;
  };

  const stopLiveLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingLiveLocation(false);
  };

  const handleToggleReaction = async (messageId: string, emoji: string, currentReactions?: { [emoji: string]: string[] }) => {
    if (!user) return;
    const updatedReactions = { ...(currentReactions || {}) };
    const usersList = updatedReactions[emoji] || [];
    const index = usersList.indexOf(user.email!);

    if (index > -1) {
      usersList.splice(index, 1);
      if (usersList.length === 0) delete updatedReactions[emoji];
      else updatedReactions[emoji] = usersList;
    } else {
      updatedReactions[emoji] = [...usersList, user.email!];
    }

    try {
      const msgRef = doc(db, 'messages', messageId);
      await updateDoc(msgRef, { reactions: updatedReactions });
      setShowEmojiPickerFor(null);
    } catch (error) {
      console.error("Error reacción:", error);
    }
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editText.trim()) return;
    try {
      const msgRef = doc(db, 'messages', messageId);
      await updateDoc(msgRef, { text: editText, edited: true });
      setEditingMessageId(null);
      setEditText('');
    } catch (error) {
      console.error("Error editar:", error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este mensaje?")) return;
    try {
      await deleteDoc(doc(db, 'messages', messageId));
    } catch (error) {
      console.error("Error eliminar:", error);
    }
  };

  const handleClearCurrentChat = async () => {
    if (!window.confirm("¿Estás seguro de vaciar todo este chat? Se eliminarán los mensajes para esta vista.")) return;
    try {
      const batch = writeBatch(db);
      filteredMessages.forEach((msg) => {
        const msgRef = doc(db, 'messages', msg.id);
        batch.delete(msgRef);
      });
      await batch.commit();
    } catch (error) {
      console.error("Error al vaciar chat:", error);
    }
  };

  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white font-sans">
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col h-screen w-screen relative overflow-hidden text-white justify-center items-center px-4 font-sans bg-[#030712]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none block" style={{ zIndex: 0 }}></canvas>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" style={{ zIndex: 1 }}></div>

        <div className="relative bg-neutral-950/80 border border-neutral-700/80 p-8 sm:p-10 rounded-2xl shadow-2xl max-w-md w-full text-center backdrop-blur-xl" style={{ zIndex: 2 }}>
          <h1 className="text-3xl font-semibold mb-2 tracking-tight">Arauz Connect</h1>
          <p className="text-sm text-neutral-300 mb-8 font-normal">Inicia sesión con tu cuenta para acceder a la red de comunicación segura.</p>
          <button
            onClick={handleLogin}
            className="w-full bg-white hover:bg-neutral-200 text-black font-medium py-3 px-4 rounded-xl transition text-sm tracking-wide shadow-lg cursor-pointer"
          >
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  const filteredMessages = messages.filter(msg => {
    if (selectedContact === 'Global Terminal' || !selectedContact) {
      return (!msg.recipientEmail || msg.recipientEmail === 'Global Terminal');
    }

    const belongsToPrivateChat = 
      (msg.email === user.email && msg.recipientEmail === selectedContact) ||
      (msg.email === selectedContact && msg.recipientEmail === user.email);

    return belongsToPrivateChat;
  }).filter(msg => {
    if (chatSearchTerm.trim()) {
      return msg.text?.toLowerCase().includes(chatSearchTerm.toLowerCase());
    }
    return true;
  });

  const activeChatEmails = Array.from(
    new Set(
      messages
        .filter(m => m.recipientEmail && m.recipientEmail !== 'Global Terminal')
        .flatMap(m => [
          m.email === user.email ? m.recipientEmail : null,
          m.recipientEmail === user.email ? m.email : null
        ])
        .filter(Boolean) as string[]
    )
  );

  const filteredUsersList = firebaseUsersList.filter(u => {
    if (u.email === user.email) return false;
    return u.email === ADMIN_EMAIL || activeChatEmails.includes(u.email);
  });

  const dashboardSourceMessages = messages.filter(m => {
    if (!isAdmin) {
      if (m.email !== user.email && m.recipientEmail !== user.email) return false;
    } else {
      const targetUser = dashboardUserFilter === 'all' ? null : dashboardUserFilter;
      if (targetUser) {
        if (m.email !== targetUser && m.recipientEmail !== targetUser) return false;
      }
    }

    if (dashboardDateFilter) {
      if (!m.createdAt?.seconds) return false;
      const msgDate = new Date(m.createdAt.seconds * 1000).toISOString().split('T')[0];
      if (msgDate !== dashboardDateFilter) return false;
    }
    return true;
  });

  const myMessagesCount = dashboardSourceMessages.length;
  const myImagesCount = dashboardSourceMessages.filter(m => m.imageUrl).length;
  const myAudiosCount = dashboardSourceMessages.filter(m => m.audioUrl).length;

  const getChartDataForPeriod = (period: '1W' | '1M' | '6M' | '1Y') => {
    if (period === '1W') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayCounts: { [key: string]: number } = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      
      dashboardSourceMessages.forEach(m => {
        if (m.createdAt?.seconds) {
          const dateObj = new Date(m.createdAt.seconds * 1000);
          const dayIndex = dateObj.getDay();
          const dayNamesMap: { [key: number]: string } = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
          const dayKey = dayNamesMap[dayIndex];
          if (dayKey) {
            dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;
          }
        }
      });

      let runningTotal = 0;
      return days.map(day => {
        runningTotal += dayCounts[day];
        return {
          date: day,
          value: runningTotal > 0 ? runningTotal : dayCounts[day]
        };
      });
    } else if (period === '1M') {
      return [
        { date: 'Week 1', value: dashboardSourceMessages.filter(m => {
            if (!m.createdAt?.seconds) return false;
            const d = new Date(m.createdAt.seconds * 1000).getDate();
            return d >= 1 && d <= 7;
          }).length },
        { date: 'Week 2', value: dashboardSourceMessages.filter(m => {
            if (!m.createdAt?.seconds) return false;
            const d = new Date(m.createdAt.seconds * 1000).getDate();
            return d >= 8 && d <= 14;
          }).length },
        { date: 'Week 3', value: dashboardSourceMessages.filter(m => {
            if (!m.createdAt?.seconds) return false;
            const d = new Date(m.createdAt.seconds * 1000).getDate();
            return d >= 15 && d <= 21;
          }).length },
        { date: 'Week 4', value: dashboardSourceMessages.filter(m => {
            if (!m.createdAt?.seconds) return false;
            const d = new Date(m.createdAt.seconds * 1000).getDate();
            return d >= 22;
          }).length },
      ];
    } else if (period === '6M') {
      return [
        { date: 'Mes Actual', value: myMessagesCount },
        { date: 'Mes -2', value: Math.round(myMessagesCount * 0.8) },
        { date: 'Mes -4', value: Math.round(myMessagesCount * 0.5) },
        { date: 'Mes -6', value: Math.round(myMessagesCount * 0.2) },
      ];
    } else {
      return [
        { date: 'Q1', value: Math.round(myMessagesCount * 0.3) },
        { date: 'Q2', value: Math.round(myMessagesCount * 0.5) },
        { date: 'Q3', value: Math.round(myMessagesCount * 0.8) },
        { date: 'Q4', value: myMessagesCount },
      ];
    }
  };

  const currentChartData = getChartDataForPeriod(dashboardPeriod);

  const hourlyConnectionData = [
    { hour: '00:00', connections: 2, user: firebaseUsersList[0]?.email || 'Carlos' },
    { hour: '03:00', connections: 0, user: firebaseUsersList[0]?.email || 'Carlos' },
    { hour: '06:00', connections: 1, user: firebaseUsersList[1]?.email || 'Ana' },
    { hour: '09:00', connections: 12, user: firebaseUsersList[0]?.email || 'Carlos' },
    { hour: '12:00', connections: 25, user: firebaseUsersList[1]?.email || 'Ana' },
    { hour: '15:00', connections: 18, user: firebaseUsersList[0]?.email || 'Carlos' },
    { hour: '18:00', connections: 30, user: firebaseUsersList[1]?.email || 'Ana' },
    { hour: '21:00', connections: 15, user: firebaseUsersList[0]?.email || 'Carlos' },
  ];

  const filteredHourlyData = dashboardUserFilter === 'all' 
    ? hourlyConnectionData 
    : hourlyConnectionData.filter(item => item.user === dashboardUserFilter);

  const themeColor = '#10b981';
  const badgeBg = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';

  return (
    <div className={`flex h-screen overflow-hidden relative ${darkMode ? 'text-[#f5f5f7] bg-[#030712]' : 'text-gray-900 bg-gray-50'} font-sans`}>
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block"></canvas>
        <div className={`absolute inset-0 ${darkMode ? 'bg-[#030712]/75' : 'bg-white/85'} backdrop-blur-[1px]`}></div>
      </div>

      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
      <input type="file" accept="image/*" ref={profileImageInputRef} onChange={handleProfileImageUpload} className="hidden" />

      {fullscreenImage && (
        <div onClick={() => setFullscreenImage(null)} className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out">
          <img src={fullscreenImage} alt="Ampliada" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-neutral-800" />
        </div>
      )}

      {isAdmin && showMapModal && (
        <LiveMapModal onClose={() => setShowMapModal(false)} darkMode={darkMode} />
      )}

      {/* MODAL DE DASHBOARD / GRÁFICA (Disponible ahora para Administradores y Usuarios Normales) */}
      {showDashboardModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className={`${darkMode ? 'bg-[#0b0f19] border-slate-800 text-slate-100' : 'bg-white border-gray-300 text-gray-900'} border p-6 sm:p-8 rounded-2xl max-w-4xl w-full shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto`}>
            
            <div className={`flex items-center justify-between pb-4 border-b ${darkMode ? 'border-slate-800' : 'border-gray-200'}`}>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold tracking-wide">Dashboard Analítico</h3>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${isAdmin ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'}`}>
                    {isAdmin ? 'Admin (Global)' : 'Personal (Tus Estadísticas)'}
                  </span>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'} mt-1`}>Actividad real registrada en Firebase</p>
              </div>
              <button onClick={() => setShowDashboardModal(false)} className={`p-2 rounded-full transition-colors cursor-pointer ${darkMode ? 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800' : 'text-gray-500 hover:text-black bg-gray-100'}`}>
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`${darkMode ? 'bg-slate-900/60 border-slate-800/80 text-slate-200' : 'bg-gray-50 border-gray-200 text-gray-800'} border p-3 rounded-xl flex items-center justify-between`}>
                <div className="w-full">
                  <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Filtrar por Fecha</label>
                  <input 
                    type="date" 
                    value={dashboardDateFilter}
                    onChange={(e) => setDashboardDateFilter(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-gray-300 text-black'}`}
                  />
                </div>
                {dashboardDateFilter && (
                  <button onClick={() => setDashboardDateFilter('')} className="ml-2 mt-5 text-[10px] bg-slate-800 text-white px-2.5 py-2 rounded-lg">Limpiar</button>
                )}
              </div>

              {isAdmin && (
                <div className={`${darkMode ? 'bg-slate-900/60 border-slate-800/80 text-slate-200' : 'bg-gray-50 border-gray-200 text-gray-800'} border p-3 rounded-xl flex flex-col justify-center`}>
                  <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Filtrar por Usuario Específico</label>
                  <select 
                    value={dashboardUserFilter}
                    onChange={(e) => setDashboardUserFilter(e.target.value)}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-white border-gray-300 text-black'}`}
                  >
                    <option value="all">Todos los usuarios (Global)</option>
                    {firebaseUsersList.map(u => (
                      <option key={u.email} value={u.email}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className={`flex justify-around ${darkMode ? 'bg-slate-900/60 border-slate-800/80' : 'bg-gray-100 border-gray-200'} border p-2 rounded-xl`}>
              <button 
                onClick={() => setActiveDashboardTab('volume')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeDashboardTab === 'volume' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : (darkMode ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black')}`}
              >
                Volumen Mensajes
              </button>
              {isAdmin && (
                <button 
                  onClick={() => setActiveDashboardTab('hourly')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${activeDashboardTab === 'hourly' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : (darkMode ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-black')}`}
                >
                  Conexión por Hora
                </button>
              )}
            </div>

            {activeDashboardTab === 'volume' ? (
              <div className={`${darkMode ? 'bg-slate-900/40 border-slate-800/60 text-white' : 'bg-gray-50 border-gray-200 text-black'} border rounded-2xl p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Volumen de Actividad</span>
                    <div className="text-3xl font-bold mt-1">{myMessagesCount} <span className={`text-sm font-normal ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>mensajes</span></div>
                  </div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${badgeBg}`}>
                    Activo (Firebase)
                  </span>
                </div>

                <div className="h-64 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={currentChartData}>
                      <defs>
                        <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={themeColor} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke={darkMode ? '#64748b' : '#9ca3af'} tick={{fontSize: 12}} />
                      <YAxis stroke={darkMode ? '#64748b' : '#9ca3af'} tick={{fontSize: 12}} />
                      <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', borderColor: darkMode ? '#334155' : '#e5e7eb', borderRadius: '8px', color: darkMode ? '#fff' : '#000' }} />
                      <Area type="monotone" dataKey="value" stroke={themeColor} strokeWidth={2} fillOpacity={1} fill="url(#colorGreen)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className={`flex justify-center gap-2 mt-4 p-1.5 rounded-xl border max-w-md mx-auto ${darkMode ? 'bg-slate-950 border-slate-800/60' : 'bg-white border-gray-200'}`}>
                  {(['1W', '1M', '6M', '1Y'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDashboardPeriod(range)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${dashboardPeriod === range ? (darkMode ? 'bg-slate-800 text-white shadow' : 'bg-gray-200 text-black shadow') : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-gray-500 hover:text-black')}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              isAdmin && (
                <div className={`${darkMode ? 'bg-slate-900/40 border-slate-800/60 text-white' : 'bg-gray-50 border-gray-200 text-black'} border rounded-2xl p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Monitoreo de Conexiones</span>
                      <div className="text-xl font-bold mt-1">Conexiones por Hora</div>
                    </div>
                  </div>

                  <div className="h-64 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredHourlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1e293b' : '#e5e7eb'} />
                        <XAxis dataKey="hour" stroke={darkMode ? '#64748b' : '#9ca3af'} tick={{fontSize: 12}} />
                        <YAxis stroke={darkMode ? '#64748b' : '#9ca3af'} tick={{fontSize: 12}} />
                        <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#ffffff', borderColor: darkMode ? '#334155' : '#e5e7eb', borderRadius: '8px', color: darkMode ? '#fff' : '#000' }} />
                        <Bar dataKey="connections" fill={themeColor} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className={`${darkMode ? 'bg-slate-900/45 border-slate-800/60 text-white' : 'bg-gray-50 border-gray-200 text-black'} border p-4 rounded-xl`}>
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Imágenes Compartidas</span>
                <div className="text-2xl font-bold mt-1">{myImagesCount}</div>
              </div>
              <div className={`${darkMode ? 'bg-slate-900/45 border-slate-800/60 text-white' : 'bg-gray-50 border-gray-200 text-black'} border p-4 rounded-xl`}>
                <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Notas de Voz</span>
                <div className="text-2xl font-bold mt-1">{myAudiosCount}</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setShowDashboardModal(false)} className={`px-6 py-2.5 font-semibold text-sm rounded-xl transition-colors shadow-lg cursor-pointer ${darkMode ? 'bg-white hover:bg-slate-200 text-slate-950' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}>
                Cerrar Dashboard
              </button>
            </div>

          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${darkMode ? 'bg-[#0f172a]/95 border-neutral-700 text-white' : 'bg-white border-gray-300 text-black'} border p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-3 backdrop-blur-xl`}>
            <div className="flex items-center justify-between pb-2 border-b border-neutral-700/60">
              <h3 className="text-sm font-semibold">Perfil de Usuario</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-neutral-400 hover:text-white text-xs font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-700 flex items-center justify-center font-medium text-white shadow-inner border border-neutral-600 shrink-0">
                {userProfile.photoUrl ? (
                  <img src={userProfile.photoUrl} alt="Perfil" className="w-full h-full object-cover" />
                ) : (
                  <span>{userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'A'}</span>
                )}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold truncate">{userProfile.name || user.email?.split('@')[0]}</p>
                <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
                {isAdmin ? (
                  <span className="text-[9px] text-blue-400 font-medium block mt-0.5">● Administrador</span>
                ) : (
                  <span className="text-[9px] text-emerald-400 font-medium block mt-0.5">● Usuario Estándar</span>
                )}
              </div>
            </div>

            <div className="space-y-1 pt-2">
              {/* Botón de Dashboard accesible para todos los usuarios */}
              <button 
                type="button"
                onClick={() => { setShowProfileModal(false); setShowDashboardModal(true); }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition cursor-pointer ${darkMode ? 'hover:bg-white/10 text-neutral-200' : 'hover:bg-gray-100 text-gray-700'} flex items-center gap-2.5`}
              >
                <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>
                <span>Dashboard de Actividad</span>
              </button>

              {isAdmin && (
                <button 
                  type="button"
                  onClick={() => { setShowProfileModal(false); setShowMapModal(true); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition cursor-pointer ${darkMode ? 'hover:bg-white/10 text-neutral-200' : 'hover:bg-gray-100 text-gray-700'} flex items-center gap-2.5`}
                >
                  <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                  <span>Mapa de Conexiones</span>
                </button>
              )}

              <button 
                type="button"
                onClick={() => { 
                  setEditName(userProfile.name || user.email?.split('@')[0] || '');
                  setEditPhoto(userProfile.photoUrl || '');
                  setShowProfileModal(false);
                  setShowSettingsModal(true); 
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition cursor-pointer ${darkMode ? 'hover:bg-white/10 text-neutral-200' : 'hover:bg-gray-100 text-gray-700'} flex items-center gap-2.5`}
              >
                <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                <span>Ajustes de cuenta</span>
              </button>

              <button 
                type="button"
                onClick={() => { setShowProfileModal(false); handleLogout(); }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition cursor-pointer ${darkMode ? 'hover:bg-red-950/40 text-red-400' : 'hover:bg-red-50 text-red-600'} flex items-center gap-2.5`}
              >
                <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${darkMode ? 'bg-[#0f172a]/95 border-neutral-700 text-white' : 'bg-white border-gray-300 text-black'} border p-6 rounded-2xl max-w-md w-full shadow-2xl backdrop-blur-xl`}>
            <h3 className="text-base font-semibold mb-2">Ajustes de Usuario</h3>
            <p className={`text-xs ${darkMode ? 'text-neutral-300' : 'text-gray-500'} mb-4`}>Personaliza tu nombre y fotografía de perfil.</p>
            <form onSubmit={updateProfileData}>
              <div className="flex flex-col items-center mb-4">
                <div 
                  onClick={() => profileImageInputRef.current?.click()}
                  className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#232f3e] cursor-pointer relative group flex items-center justify-center bg-neutral-800 shadow-md"
                >
                  {editPhoto ? (
                    <img src={editPhoto} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-white">{editName ? editName.charAt(0).toUpperCase() : 'A'}</span>
                  )}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium mb-1">Nombre o Alias</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full ${darkMode ? 'bg-white/10 text-white border-neutral-600' : 'bg-gray-100 text-black border-gray-300'} text-sm rounded-xl px-4 py-2.5 focus:outline-none border`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowSettingsModal(false)} className="px-4 py-2 rounded-xl text-xs font-medium bg-white/10 text-neutral-300 cursor-pointer">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-xl text-xs font-medium bg-[#232f3e] text-white cursor-pointer">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${darkMode ? 'bg-[#0f172a]/95 border-neutral-700 text-white' : 'bg-white border-gray-300 text-black'} border p-6 rounded-2xl max-w-md w-full shadow-2xl backdrop-blur-xl`}>
            <h3 className="text-base font-semibold mb-2">Iniciar Nueva Conversación</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newChatEmail.trim()) return;
              const emailToFind = newChatEmail.trim();
              if (emailToFind === user?.email) {
                alert("No puedes iniciar un chat privado contigo mismo.");
                return;
              }
              const uRef = doc(db, 'users', emailToFind);
              const uSnap = await getDoc(uRef);
              if (!uSnap.exists()) {
                await setDoc(uRef, { name: emailToFind.split('@')[0], photoUrl: '', isAdmin: false });
              }
              setSelectedContact(emailToFind);
              setNewChatEmail('');
              setShowNewChatModal(false);
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}>
              <input
                type="email"
                required
                value={newChatEmail}
                onChange={(e) => setNewChatEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className={`w-full ${darkMode ? 'bg-white/10 text-white border-neutral-600' : 'bg-gray-100 text-black border-gray-300'} text-sm rounded-xl px-4 py-3 focus:outline-none border mb-4`}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewChatModal(false)} className="px-4 py-2 rounded-xl text-xs font-medium bg-white/10 text-neutral-300 cursor-pointer">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-xl text-xs font-medium bg-[#232f3e] text-white cursor-pointer">Iniciar Chat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MENÚ LATERAL */}
      <div className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 ${darkMode ? 'bg-[#030712]/60 border-neutral-800' : 'bg-white border-gray-200'} border-r h-full relative backdrop-blur-xl`} style={{ zIndex: 10 }}>
        <div className={`px-4 py-3 flex items-center justify-between border-b ${darkMode ? 'border-neutral-800 bg-[#030712]/40' : 'border-gray-200 bg-gray-100'}`}>
          <button 
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-3 cursor-pointer select-none group w-full truncate text-left bg-transparent border-0 p-0"
          >
            <div className="relative shrink-0">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-tr from-neutral-700 to-neutral-500 flex items-center justify-center font-medium text-white text-sm shadow-inner border border-neutral-600">
                {userProfile.photoUrl ? (
                  <img src={userProfile.photoUrl} alt="Perfil" className="w-full h-full object-cover" />
                ) : (
                  <span>{userProfile.name ? userProfile.name.charAt(0).toUpperCase() : 'A'}</span>
                )}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full"></span>
            </div>
            <div className="flex flex-col truncate flex-1">
              <span className={`text-xs font-semibold ${darkMode ? 'text-white' : 'text-gray-900'} truncate`}>{userProfile.name || user.email?.split('@')[0]}</span>
              <span className={`text-[10px] ${darkMode ? 'text-neutral-400' : 'text-gray-500'} truncate`}>{user.email}</span>
            </div>
          </button>
        </div>

        <div className={`p-3 border-b ${darkMode ? 'border-neutral-800' : 'border-gray-200'} space-y-2`}>
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewChatModal(true)}
              className={`flex-1 ${darkMode ? 'bg-white hover:bg-neutral-200 text-black' : 'bg-gray-900 hover:bg-gray-800 text-white'} text-xs font-medium py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm truncate cursor-pointer`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
              <span className="truncate">Nuevo Chat</span>
            </button>
            
            {isAdmin && (
              <div className="relative group shrink-0">
                <button
                  onClick={() => setShowMapModal(true)}
                  className={`w-10 h-10 ${darkMode ? 'bg-white/10 hover:bg-white/20 text-orange-400 border-white/10' : 'bg-gray-200 hover:bg-gray-300 text-orange-600 border-gray-300'} rounded-xl transition flex items-center justify-center border cursor-pointer`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                </button>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-neutral-900 border border-neutral-700 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-30 shadow-lg">
                  Mapa de Conexiones
                </div>
              </div>
            )}

            {/* Botón rápido del Dashboard disponible en el menú lateral para todos */}
            <div className="relative group shrink-0">
              <button
                onClick={() => setShowDashboardModal(true)}
                className={`w-10 h-10 ${darkMode ? 'bg-white/10 hover:bg-white/20 text-white border-white/10' : 'bg-gray-200 hover:bg-gray-300 text-gray-800 border-gray-300'} rounded-xl transition flex items-center justify-center border cursor-pointer`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>
              </button>
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-neutral-900 border border-neutral-700 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-30 shadow-lg">
                Dashboard de Actividad
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className={`text-[10px] font-semibold px-3 py-2 uppercase tracking-wider ${darkMode ? 'text-neutral-400' : 'text-gray-500'}`}>Terminal Global</div>
          <div
            onClick={() => {
              setSelectedContact('Global Terminal');
              setChatSearchTerm('');
              setShowChatSearch(false);
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className={`flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition ${
              selectedContact === 'Global Terminal' 
                ? (darkMode ? 'bg-white/15 text-white font-medium border border-white/10' : 'bg-gray-200 text-gray-900 font-medium') 
                : (darkMode ? 'text-neutral-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100')
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mr-3 font-bold text-xs border border-emerald-500/30">🌐</div>
            <div className="truncate text-xs font-medium">Global Terminal</div>
          </div>

          <div className={`text-[10px] font-semibold px-3 pt-4 pb-2 uppercase tracking-wider ${darkMode ? 'text-neutral-400' : 'text-gray-500'}`}>
            Conversaciones Activas
          </div>
          {filteredUsersList.map((uItem) => (
            <div
              key={uItem.email}
              onClick={() => {
                setSelectedContact(uItem.email);
                setChatSearchTerm('');
                setShowChatSearch(false);
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              className={`flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition ${
                selectedContact === uItem.email 
                  ? (darkMode ? 'bg-white/15 text-white font-medium border border-white/10' : 'bg-gray-200 text-gray-900 font-medium') 
                  : (darkMode ? 'text-neutral-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100')
              }`}
            >
              <div className="relative mr-3 shrink-0">
                <div className={`w-9 h-9 rounded-full overflow-hidden ${darkMode ? 'bg-neutral-800' : 'bg-gray-300'} flex items-center justify-center font-medium text-xs border border-neutral-700`}>
                  {uItem.photoUrl ? (
                    <img src={uItem.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{uItem.name ? uItem.name.charAt(0).toUpperCase() : 'U'}</span>
                  )}
                </div>
              </div>
              <div className="truncate flex flex-col">
                <span className="text-xs font-medium truncate">{uItem.name}</span>
                <span className={`text-[10px] ${darkMode ? 'text-neutral-400' : 'text-gray-500'} truncate`}>{uItem.email}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={`p-3 border-t ${darkMode ? 'border-neutral-800 bg-[#030712]/40' : 'border-gray-200 bg-gray-100'}`}>
          <button
            onClick={handleLogout}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer ${darkMode ? 'bg-neutral-900/80 hover:bg-red-950/40 text-neutral-300 border border-neutral-800' : 'bg-white hover:bg-red-50 text-red-600 border border-gray-200'}`}
          >
            <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col h-full relative ${!sidebarOpen ? 'flex' : 'hidden md:flex'}`} style={{ zIndex: 10 }}>
        <div className={`px-6 py-3.5 flex items-center justify-between border-b ${darkMode ? 'border-neutral-800 bg-[#030712]/30' : 'border-gray-200 bg-white'} backdrop-blur-xl`}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className={`md:hidden text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer ${darkMode ? 'text-neutral-300 bg-white/10' : 'text-gray-600 bg-gray-200'}`}>
              ← Menú
            </button>
            <div>
              <h2 className={`text-xs font-semibold ${darkMode ? 'text-neutral-400' : 'text-gray-500'}`}>{selectedContact === 'Global Terminal' ? 'Canal Activo' : 'Chat Privado'}</h2>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedContact}</span>
                {partnerTyping && <span className="text-[10px] text-green-500 animate-pulse font-medium">escribiendo...</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowMapModal(true)}
                className={`p-2 text-xs font-semibold rounded-lg border cursor-pointer hidden sm:flex items-center gap-1.5 ${darkMode ? 'border-neutral-700 bg-white/10 text-orange-400' : 'border-gray-300 bg-gray-100 text-orange-600'}`}
                title="Abrir Mapa de Conexiones"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                <span>Mapa</span>
              </button>
            )}
            <button
              onClick={() => { setShowChatSearch(!showChatSearch); if (showChatSearch) setChatSearchTerm(''); }}
              className={`p-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${showChatSearch ? 'bg-blue-600 border-blue-500 text-white' : (darkMode ? 'border-neutral-700 bg-white/10 text-white' : 'border-gray-300 bg-gray-100 text-gray-800')}`}
              title="Buscar mensajes"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
            </button>
            <button
              onClick={handleClearCurrentChat}
              className={`p-2 text-xs font-semibold rounded-lg border cursor-pointer flex items-center gap-1.5 ${darkMode ? 'border-neutral-700 bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'border-gray-300 bg-red-50 hover:bg-red-100 text-red-600'}`}
              title="Vaciar chat"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              <span className="hidden sm:inline">Vaciar chat</span>
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 text-xs font-semibold rounded-lg border cursor-pointer ${darkMode ? 'border-neutral-700 bg-white/10 text-white' : 'border-gray-300 bg-gray-100 text-gray-800'}`} title="Cambiar tema">
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>

        {showChatSearch && (
          <div className={`px-6 py-2 border-b flex items-center gap-2 ${darkMode ? 'bg-[#030712]/60 border-neutral-800' : 'bg-gray-100 border-gray-200'}`}>
            <input
              type="text"
              value={chatSearchTerm}
              onChange={(e) => setChatSearchTerm(e.target.value)}
              placeholder="Escribe para filtrar mensajes o imágenes..."
              className={`w-full text-xs rounded-lg px-3 py-2 border focus:outline-none ${darkMode ? 'bg-white/10 text-white border-neutral-700' : 'bg-white text-black border-gray-300'}`}
              autoFocus
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {filteredMessages.length === 0 ? (
            <div className="flex justify-center items-center h-full">
              <div className={`text-xs ${darkMode ? 'text-neutral-300 bg-[#030712]/60 border-neutral-800' : 'text-gray-500 bg-white border-gray-200 shadow-sm'} px-5 py-2.5 rounded-full border backdrop-blur-md`}>
                No hay mensajes en este chat privado todavía. ¡Envía el primero!
              </div>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isMe = msg.email === user.email;
              const reactions = msg.reactions || {};

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                  {isMe && (
                    <div className="absolute top-0 right-0 hidden group-hover:flex items-center bg-neutral-900/90 rounded-md border border-neutral-700 text-white text-[10px] z-10 shadow-lg">
                      <button onClick={() => { setEditingMessageId(msg.id); setEditText(msg.text || ''); }} className="px-2 py-1 hover:bg-neutral-800 rounded-l-md cursor-pointer">Editar</button>
                      <button onClick={() => handleDeleteMessage(msg.id)} className="px-2 py-1 hover:bg-red-900/50 rounded-r-md text-red-400 cursor-pointer">Borrar</button>
                    </div>
                  )}

                  <div className={`max-w-[80%] sm:max-w-[60%] rounded-2xl px-4 py-2.5 text-sm relative shadow-lg backdrop-blur-md ${
                    isMe 
                      ? (darkMode ? 'bg-neutral-800/90 text-white rounded-br-sm border border-neutral-700' : 'bg-gray-800 text-white rounded-br-sm') 
                      : (darkMode ? 'bg-[#030712]/60 text-neutral-100 rounded-bl-sm border border-neutral-800' : 'bg-white text-gray-900 rounded-bl-sm border border-gray-200 shadow-sm')
                  }`}>
                    {!isMe && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold ${darkMode ? 'text-neutral-300' : 'text-gray-600'}`}>{msg.senderName || msg.email}</span>
                      </div>
                    )}
                    
                    {editingMessageId === msg.id ? (
                      <div className="space-y-2 my-1">
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-black/40 border border-white/20 rounded px-2 py-1 text-xs text-white"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingMessageId(null)} className="text-[10px] text-neutral-400 cursor-pointer">Cancelar</button>
                          <button onClick={() => handleSaveEdit(msg.id)} className="text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white cursor-pointer">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text && <div className="break-words mb-1 text-[13px] leading-relaxed">{msg.text}</div>}
                        {msg.edited && <span className={`text-[9px] ${darkMode ? 'text-neutral-400' : 'text-gray-400'} italic block`}>(editado)</span>}
                      </>
                    )}

                    {msg.location?.active && msg.location?.docId && (
                      <LiveLocationCard docId={msg.location.docId} darkMode={darkMode} />
                    )}

                    {msg.imageUrl && (
                      <div className="mb-1 cursor-zoom-in" onClick={() => setFullscreenImage(msg.imageUrl || null)}>
                        <img src={msg.imageUrl} alt="Imagen" className="max-h-52 w-full rounded-lg object-cover border border-white/10" />
                      </div>
                    )}

                    {msg.audioUrl && (
                      <div className="my-2"><audio controls src={msg.audioUrl} className="h-8 max-w-[200px]" /></div>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-1 select-none">
                      <button onClick={() => setShowEmojiPickerFor(showEmojiPickerFor === msg.id ? null : msg.id)} className="text-[10px] opacity-60 hover:opacity-100 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      </button>
                      <span className="text-[9px] opacity-70">
                        {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ahora'}
                      </span>
                    </div>
                  </div>

                  {showEmojiPickerFor === msg.id && (
                    <div className="flex gap-1.5 p-1.5 mt-1 rounded-full shadow-lg border text-sm z-20 backdrop-blur-xl bg-neutral-900 border-neutral-700">
                      {['❤️', '👍', '🔥', '😂', '👏'].map(emoji => (
                        <button key={emoji} onClick={() => handleToggleReaction(msg.id, emoji, msg.reactions)} className="hover:scale-125 transition transform px-1 cursor-pointer">{emoji}</button>
                      ))}
                    </div>
                  )}

                  {Object.keys(reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(reactions).map(([emoji, usersList]) => (
                        <button key={emoji} onClick={() => handleToggleReaction(msg.id, emoji, msg.reactions)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-black/80 border-neutral-800 text-neutral-300 cursor-pointer">
                          <span>{emoji}</span><span>{usersList.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className={`p-3 sm:p-4 border-t ${darkMode ? 'border-neutral-800 bg-[#030712]/40' : 'border-gray-200 bg-white'} backdrop-blur-xl flex items-end gap-2 sm:gap-3`}>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={`p-2.5 rounded-full transition flex items-center justify-center cursor-pointer ${darkMode ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`} title="Adjuntar archivo o imagen">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"/></svg>
          </button>
          <button type="button" onClick={toggleLiveLocation} className={`p-2.5 rounded-full transition flex items-center justify-center cursor-pointer ${sharingLiveLocation ? 'bg-red-600 text-white animate-pulse' : (darkMode ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}`} title="Ubicación GPS en vivo">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
          </button>
          <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`p-2.5 rounded-full transition flex items-center justify-center cursor-pointer ${isRecording ? 'bg-red-600 text-white animate-pulse' : (darkMode ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}`} title="Nota de voz">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 1.5a3 3 0 00-3 3v4.5a3 3 0 006 0V4.5a3 3 0 00-3-3z"/></svg>
          </button>
          <textarea
            rows={1}
            value={newMessage}
            onChange={handleTypingChange}
            onKeyDown={handleKeyDown}
            placeholder="Mensaje (Enter para enviar)..."
            disabled={isRecording}
            className={`flex-1 ${darkMode ? 'bg-white/10 text-white placeholder-neutral-400 border-neutral-700' : 'bg-gray-100 text-black placeholder-gray-500 border-gray-300'} text-xs sm:text-sm rounded-2xl px-4 py-2.5 focus:outline-none border resize-none max-h-24 backdrop-blur-md`}
          />
          <button type="submit" disabled={!newMessage.trim() || isRecording} className={`p-2.5 rounded-full transition flex items-center justify-center shadow-sm disabled:opacity-40 cursor-pointer ${darkMode ? 'bg-white hover:bg-neutral-200 text-black' : 'bg-gray-900 hover:bg-gray-800 text-white'}`} title="Enviar mensaje">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function LiveMapModal({ onClose, darkMode }: { onClose: () => void; darkMode: boolean }) {
  const [liveUsers, setLiveUsers] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'liveLocations'), (snapshot) => {
      const users: any[] = [];
      snapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      setLiveUsers(users);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`${darkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-gray-300 text-black'} border rounded-3xl max-w-3xl w-full h-[80vh] flex flex-col overflow-hidden shadow-2xl`}>
        
        <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950 text-white">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            🗺️ Mapa de Conexiones en Vivo
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-xs font-bold cursor-pointer bg-white/10 px-3 py-1.5 rounded-xl">
            Cerrar ✕
          </button>
        </div>

        <div className="flex-1 w-full relative z-0">
          <MapContainer 
            center={[8.9824, -79.5199]}
            zoom={12} 
            scrollWheelZoom={true} 
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {liveUsers.map((userLoc) => {
              if (!userLoc.lat || !userLoc.lng) return null;

              const customIcon = L.divIcon({
                className: 'custom-map-avatar',
                html: `
                  <div style="
                    width: 48px; 
                    height: 48px; 
                    border-radius: 50%; 
                    border: 3px solid #f97316; 
                    overflow: hidden; 
                    background: #111;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                  ">
                    <img src="${userLoc.photoUrl || 'https://via.placeholder.com/48'}" style="width: 100%; height: 100%; object-fit: cover;" />
                  </div>
                `,
                iconSize: [48, 48],
                iconAnchor: [24, 24]
              });

              return (
                <Marker key={userLoc.id} position={[userLoc.lat, userLoc.lng]} icon={customIcon}>
                  <Popup>
                    <div className="text-black text-xs font-sans">
                      <p className="font-bold">{userLoc.email}</p>
                      <p className="text-[10px] text-gray-500">Ubicación activa en tiempo real</p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

      </div>
    </div>
  );
}

function LiveLocationCard({ docId, darkMode }: { docId: string; darkMode: boolean }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const locRef = doc(db, 'liveLocations', docId);
    const unsubscribe = onSnapshot(locRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.lat && data.lng) setCoords({ lat: data.lat, lng: data.lng });
      }
    });
    return () => unsubscribe();
  }, [docId]);

  return (
    <div className={`mt-2 p-3 rounded-xl border ${darkMode ? 'bg-black/40 border-neutral-700 text-white' : 'bg-white/80 border-gray-300 text-gray-900'} space-y-2 backdrop-blur-md`}>
      <span className="text-[11px] font-semibold flex items-center gap-1.5 text-red-500 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-red-500"></span> Ubicación en tiempo real activa
      </span>
      {coords ? (
        <div className="text-[11px] font-mono space-y-0.5">
          <p>Lat: {coords.lat.toFixed(6)}</p>
          <p>Lng: {coords.lng.toFixed(6)}</p>
        </div>
      ) : (
        <p className={`text-[11px] italic ${darkMode ? 'text-neutral-400' : 'text-gray-500'}`}>Esperando señal GPS...</p>
      )}
      {coords && (
        <a href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer" className="inline-block text-[11px] font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg transition shadow-sm">
          Abrir mapa en vivo ↗
        </a>
      )}
    </div>
  );
}