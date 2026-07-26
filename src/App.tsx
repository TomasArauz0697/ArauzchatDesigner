import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';
import { auth, db } from './firebase';

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
}

interface Contact {
  email: string;
  name?: string;
  photoUrl?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>('Global Terminal');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatEmail, setNewChatEmail] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Perfil y Modales
  const [userProfile, setUserProfile] = useState<UserProfile>({ name: '', photoUrl: '' });
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');

  // Estados para Ubicación en Tiempo Real (WhatsApp Style)
  const [sharingLiveLocation, setSharingLiveLocation] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);
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

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
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
              photoUrl: currentUser.photoURL || ''
            };
            await setDoc(userRef, defaultProfile);
            setUserProfile(defaultProfile);
            setEditName(defaultProfile.name);
            setEditPhoto(defaultProfile.photoUrl);
          }
        } catch (error) {
          console.error("Error al cargar perfil de usuario:", error);
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Cargar contactos
  useEffect(() => {
    if (!user) return;
    const fetchContacts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'messages'));
        const emailsSet = new Set<string>();
        
        querySnapshot.forEach((docItem) => {
          const data = docItem.data();
          if (data.email === user.email && data.recipientEmail && data.recipientEmail !== 'Global Terminal') {
            emailsSet.add(data.recipientEmail);
          }
          if (data.recipientEmail === user.email && data.email) {
            emailsSet.add(data.email);
          }
        });

        const contactList: Contact[] = [{ email: 'Global Terminal' }];
        for (const email of Array.from(emailsSet)) {
          try {
            const uDoc = await getDoc(doc(db, 'users', email));
            if (uDoc.exists()) {
              const uData = uDoc.data();
              contactList.push({ email, name: uData.name, photoUrl: uData.photoUrl });
            } else {
              contactList.push({ email });
            }
          } catch (e) {
            contactList.push({ email });
          }
        }
        setContacts(contactList);
      } catch (error) {
        console.error("Error cargando contactos", error);
      }
    };
    fetchContacts();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((docItem) => {
        msgs.push({ id: docItem.id, ...docItem.data() } as Message);
      });

      if (msgs.length > messages.length && messages.length > 0) {
        const latest = msgs[msgs.length - 1];
        const isForMe = latest.recipientEmail === user.email || (!latest.recipientEmail && latest.recipientEmail === 'Global Terminal');
        if (isForMe && latest.email !== user.email && document.hidden) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Nuevo mensaje de ${latest.senderName || latest.email}`, {
              body: latest.text || 'Te ha enviado un archivo multimedia o ubicación en vivo.',
            });
          }
        }
      }

      setMessages(msgs);
    }, (error) => {
      console.error("Error en snapshot de mensajes:", error);
    });
    return () => unsubscribe();
  }, [user, messages.length]);

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
      name: editName.trim() || user.email.split('@')[0], 
      photoUrl: editPhoto 
    };

    try {
      await setDoc(doc(db, 'users', user.email), updated, { merge: true });
      setUserProfile(updated);
      setShowSettingsModal(false);
      setShowProfileModal(false);
    } catch (error) {
      console.error("Error al actualizar perfil en Firestore:", error);
      alert("No se pudo actualizar el perfil.");
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
      console.error("Error al enviar mensaje: ", error);
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
          senderName: userProfile.name || user.email.split('@')[0],
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

  // --- LÓGICA DE UBICACIÓN REAL EN TIEMPO REAL (GPS NATIVO) ---
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

    // 1. Enviar tarjeta interactiva inicial al chat
    addDoc(collection(db, 'messages'), {
      text: `📍 Ha iniciado una transmisión de ubicación en tiempo real.`,
      location: { active: true, docId: liveDocId },
      email: user.email,
      senderName: userProfile.name || user.email.split('@')[0],
      senderPhoto: userProfile.photoUrl || '',
      recipientEmail: selectedContact,
      createdAt: serverTimestamp(),
      reactions: {}
    }).catch(err => console.error("Error enviando aviso de ubicación:", err));

    // 2. Monitoreo constante con alta precisión (pide permiso nativo al navegador)
    const options = {
      enableHighAccuracy: true, // Forzar uso de GPS real
      timeout: 15000,
      maximumAge: 0
    };

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          await setDoc(liveRef, {
            lat: latitude,
            lng: longitude,
            email: user.email,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          console.error("Error actualizando ubicación real en vivo:", error);
        }
      },
      (error) => {
        console.error("Error de GPS:", error.message);
        alert("No se pudo obtener tu ubicación real. Asegúrate de permitir el acceso al GPS en tu navegador.");
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
  // -------------------------------------------------------------

  const handleToggleReaction = async (messageId: string, emoji: string, currentReactions?: { [emoji: string]: string[] }) => {
    if (!user) return;
    const updatedReactions = { ...(currentReactions || {}) };
    
    const usersList = updatedReactions[emoji] || [];
    const index = usersList.indexOf(user.email!);

    if (index > -1) {
      usersList.splice(index, 1);
      if (usersList.length === 0) {
        delete updatedReactions[emoji];
      } else {
        updatedReactions[emoji] = usersList;
      }
    } else {
      updatedReactions[emoji] = [...usersList, user.email!];
    }

    try {
      const msgRef = doc(db, 'messages', messageId);
      await updateDoc(msgRef, { reactions: updatedReactions });
      setShowEmojiPickerFor(null);
    } catch (error) {
      console.error("Error al actualizar reacción", error);
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
      console.error("Error al editar mensaje", error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este mensaje?")) return;
    try {
      await deleteDoc(doc(db, 'messages', messageId));
    } catch (error) {
      console.error("Error al eliminar mensaje", error);
    }
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatEmail.trim()) return;

    const emailToFind = newChatEmail.trim();
    if (emailToFind === user?.email) {
      alert("No puedes iniciar un chat privado contigo mismo.");
      return;
    }

    if (!contacts.some(c => c.email === emailToFind)) {
      try {
        const uDoc = await getDoc(doc(db, 'users', emailToFind));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          setContacts(prev => [...prev, { email: emailToFind, name: uData.name, photoUrl: uData.photoUrl }]);
        } else {
          setContacts(prev => [...prev, { email: emailToFind }]);
        }
      } catch (e) {
        setContacts(prev => [...prev, { email: emailToFind }]);
      }
    }

    setSelectedContact(emailToFind);
    setNewChatEmail('');
    setShowNewChatModal(false);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  if (loadingAuth) {
    return (
      <div className={`flex items-center justify-center h-screen ${darkMode ? 'bg-black text-white' : 'bg-white text-black'} font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display','SF_Pro_Text',Helvetica,Arial,sans-serif]`}>
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`flex flex-col h-screen ${darkMode ? 'bg-black text-white' : 'bg-gray-100 text-black'} justify-center items-center px-4 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display','SF_Pro_Text',Helvetica,Arial,sans-serif]`}>
        <div className={`${darkMode ? 'bg-[#161617] border-neutral-800 text-white' : 'bg-white border-gray-300 text-black'} p-10 rounded-2xl shadow-2xl max-w-md w-full text-center border backdrop-blur-xl`}>
          <h1 className="text-3xl font-semibold mb-2 tracking-tight">Arauz Connect</h1>
          <p className={`text-sm ${darkMode ? 'text-neutral-400' : 'text-gray-600'} mb-8 font-normal`}>Inicia sesión con tu cuenta para acceder a la red de comunicación segura.</p>
          <button
            onClick={handleLogin}
            className={`w-full ${darkMode ? 'bg-[#232f3e] hover:bg-[#1b2430] text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'} font-medium py-3 px-4 rounded-xl transition text-sm tracking-wide shadow-md`}
          >
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  const filteredMessages = messages.filter(msg => {
    const belongsToChat = (selectedContact === 'Global Terminal' || !selectedContact)
      ? (!msg.recipientEmail || msg.recipientEmail === 'Global Terminal')
      : ((msg.email === user.email && msg.recipientEmail === selectedContact) ||
         (msg.email === selectedContact && msg.recipientEmail === user.email));

    if (!belongsToChat) return false;

    if (chatSearchTerm.trim()) {
      return msg.text?.toLowerCase().includes(chatSearchTerm.toLowerCase());
    }

    return true;
  });

  const filteredContacts = contacts.filter(contact => 
    contact.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (contact.name && contact.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? 'bg-black text-[#f5f5f7]' : 'bg-white text-gray-900'} font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display','SF_Pro_Text',Helvetica,Arial,sans-serif]`}>
      
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        className="hidden" 
      />

      <input 
        type="file" 
        accept="image/*" 
        ref={profileImageInputRef} 
        onChange={handleProfileImageUpload} 
        className="hidden" 
      />

      {fullscreenImage && (
        <div 
          onClick={() => setFullscreenImage(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={fullscreenImage} alt="Vista ampliada" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl border border-neutral-800" />
        </div>
      )}

      {/* Modal de Perfil */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${darkMode ? 'bg-[#1c1c1e] border-neutral-800 text-white' : 'bg-white border-gray-300 text-black'} border p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-3`}>
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="text-sm font-semibold">Perfil de Usuario</h3>
              <button 
                onClick={() => setShowProfileModal(false)}
                className="text-neutral-400 hover:text-white text-xs font-bold"
              >
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
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <button 
                type="button"
                onClick={() => { 
                  setEditName(userProfile.name || user.email?.split('@')[0] || '');
                  setEditPhoto(userProfile.photoUrl || '');
                  setShowProfileModal(false);
                  setShowSettingsModal(true); 
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition ${darkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-gray-100 text-gray-700'} flex items-center gap-2`}
              >
                <span>⚙️ User settings</span>
              </button>

              <button 
                type="button"
                onClick={() => { alert("Arauz Connect v1.0 - Red Segura de Comunicaciones"); setShowProfileModal(false); }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition ${darkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-gray-100 text-gray-700'} flex items-center gap-2`}
              >
                <span>⚡ Arauz Labs</span>
              </button>

              <button 
                type="button"
                onClick={() => { setShowProfileModal(false); handleLogout(); }}
                className={`w-full text-left px-4 py-2.5 text-xs font-medium rounded-xl transition ${darkMode ? 'hover:bg-red-950/40 text-red-400' : 'hover:bg-red-50 text-red-600'} flex items-center gap-2`}
              >
                <span>🚪 Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Perfil */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${darkMode ? 'bg-[#1c1c1e] border-neutral-800 text-white' : 'bg-white border-gray-300 text-black'} border p-6 rounded-2xl max-w-md w-full shadow-2xl`}>
            <h3 className="text-base font-semibold mb-2">User Settings</h3>
            <p className={`text-xs ${darkMode ? 'text-neutral-400' : 'text-gray-500'} mb-4`}>Personaliza tu nombre y fotografía de perfil para los demás usuarios.</p>
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
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition">
                    Cambiar
                  </div>
                </div>
                <span className="text-[10px] text-neutral-400 mt-1">Haz clic para cambiar imagen</span>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium mb-1">Nombre o Alias</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full ${darkMode ? 'bg-[#2c2c2e] text-white border-neutral-700' : 'bg-gray-100 text-black border-gray-300'} text-sm rounded-xl px-4 py-2.5 focus:outline-none border`}
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium ${darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} transition`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-[#232f3e] text-white hover:bg-[#1b2430] transition shadow-md"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${darkMode ? 'bg-[#1c1c1e] border-neutral-800 text-white' : 'bg-white border-gray-300 text-black'} border p-6 rounded-2xl max-w-md w-full shadow-2xl`}>
            <h3 className="text-base font-semibold mb-2">Iniciar Nueva Conversación</h3>
            <p className={`text-xs ${darkMode ? 'text-neutral-400' : 'text-gray-500'} mb-4`}>Ingresa el correo electrónico del usuario con el que deseas chatear de forma privada.</p>
            <form onSubmit={handleStartNewChat}>
              <input
                type="email"
                required
                value={newChatEmail}
                onChange={(e) => setNewChatEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className={`w-full ${darkMode ? 'bg-[#2c2c2e] text-white border-neutral-700' : 'bg-gray-100 text-black border-gray-300'} text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#232f3e] border mb-4`}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium ${darkMode ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} transition`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-[#232f3e] text-white hover:bg-[#1b2430] transition shadow-md"
                >
                  Iniciar Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menú Lateral */}
      <div className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 ${darkMode ? 'bg-[#000000] border-neutral-800/80' : 'bg-gray-50 border-gray-200'} border-r h-full z-20 relative`}>
        
        <div className={`px-4 py-3 flex items-center justify-between border-b ${darkMode ? 'border-neutral-800/80 bg-[#1d1d1f]/40' : 'border-gray-200 bg-white'}`}>
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
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full" title="En línea"></span>
            </div>
            <div className="flex flex-col truncate flex-1">
              <span className={`text-xs font-semibold ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tight truncate`}>{userProfile.name || user.email?.split('@')[0]}</span>
              <span className="text-[10px] text-neutral-400 truncate max-w-[150px]">{user.email}</span>
            </div>
            <span className="ml-auto text-[10px] text-neutral-400 group-hover:text-white">⚙️</span>
          </button>
        </div>

        <div className={`p-3 border-b ${darkMode ? 'border-neutral-800/80' : 'border-gray-200'}`}>
          <button
            onClick={() => setShowNewChatModal(true)}
            className="w-full bg-[#232f3e] hover:bg-[#1b2430] text-white text-xs font-medium py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
          >
            <span>+ Nuevo Chat Privado</span>
          </button>
          
          <div className="mt-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar chat..."
              className={`w-full ${darkMode ? 'bg-[#1c1c1e] text-white border-neutral-800 placeholder-neutral-500' : 'bg-white text-black border-gray-300 placeholder-gray-400'} text-xs rounded-lg px-3 py-2 focus:outline-none border`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[10px] font-semibold text-neutral-500 px-3 py-2 uppercase tracking-wider">Tus Conversaciones</div>
          {filteredContacts.map((contact, index) => (
            <div
              key={index}
              onClick={() => {
                setSelectedContact(contact.email);
                setChatSearchTerm('');
                setShowChatSearch(false);
                if (window.innerWidth < 768) setSidebarOpen(false);
              }}
              className={`flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition ${
                selectedContact === contact.email 
                  ? (darkMode ? 'bg-[#3a3a3c] text-white font-medium' : 'bg-gray-200 text-gray-900 font-medium') 
                  : (darkMode ? 'text-neutral-300 hover:bg-[#1c1c1e]' : 'text-gray-700 hover:bg-gray-100')
              }`}
            >
              <div className="relative mr-3 shrink-0">
                <div className={`w-8 h-8 rounded-full overflow-hidden ${darkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-300 border-gray-400'} flex items-center justify-center font-medium text-xs border`}>
                  {contact.photoUrl ? (
                    <img src={contact.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{contact.email.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-black rounded-full"></span>
              </div>
              <div className="truncate text-xs font-normal">{contact.name || contact.email}</div>
            </div>
          ))}
        </div>

        <div className={`p-3 border-t ${darkMode ? 'border-neutral-800/80 bg-[#1d1d1f]/40' : 'border-gray-200 bg-white'}`}>
          <button
            onClick={handleLogout}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium transition flex items-center justify-center gap-2 ${
              darkMode 
                ? 'bg-neutral-900 hover:bg-red-950/40 text-neutral-300 hover:text-red-400 border border-neutral-800' 
                : 'bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 border border-gray-200'
            }`}
          >
            <span>🚪 Cerrar sesión</span>
          </button>
        </div>

      </div>

      {/* Panel Principal */}
      <div className={`flex-1 flex-col h-full ${darkMode ? 'bg-[#000000]' : 'bg-white'} ${!sidebarOpen ? 'flex' : 'hidden md:flex'}`}>
        
        <div className={`px-6 py-3.5 flex items-center justify-between border-b ${darkMode ? 'border-neutral-800/80 bg-[#1d1d1f]/30' : 'border-gray-200 bg-gray-50'} backdrop-blur-md z-10`}>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className={`md:hidden text-xs font-medium px-2.5 py-1.5 rounded-lg ${darkMode ? 'text-neutral-400 bg-neutral-800/50' : 'text-gray-600 bg-gray-200'}`}
            >
              ← Menú
            </button>
            <div>
              <h2 className="text-xs font-semibold text-neutral-400">Canal Activo</h2>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'} tracking-tight`}>{selectedContact}</span>
                {partnerTyping && (
                  <span className="text-[10px] text-green-400 animate-pulse font-medium">escribiendo...</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowChatSearch(!showChatSearch); if (showChatSearch) setChatSearchTerm(''); }}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition ${
                showChatSearch 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : (darkMode ? 'border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100')
              }`}
              title="Buscar en este chat"
            >
              🔍 Buscar
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition ${
                darkMode 
                  ? 'border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800' 
                  : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-100'
              }`}
            >
              {darkMode ? '☀️ Claro' : '🌙 Oscuro'}
            </button>
          </div>
        </div>

        {showChatSearch && (
          <div className={`px-6 py-2 border-b flex items-center gap-2 ${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-gray-100 border-gray-200'}`}>
            <input
              type="text"
              value={chatSearchTerm}
              onChange={(e) => setChatSearchTerm(e.target.value)}
              placeholder="Escribe para filtrar mensajes en este chat..."
              className={`w-full text-xs rounded-lg px-3 py-2 border focus:outline-none ${darkMode ? 'bg-black text-white border-neutral-700 placeholder-neutral-500' : 'bg-white text-black border-gray-300 placeholder-gray-400'}`}
              autoFocus
            />
            {chatSearchTerm && (
              <button 
                onClick={() => setChatSearchTerm('')} 
                className="text-xs px-2.5 py-1.5 rounded-lg bg-neutral-700 text-white hover:bg-neutral-600"
              >
                Limpiar
              </button>
            )}
          </div>
        )}

        {/* Zona de Mensajes */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 ${darkMode ? 'bg-[#000000]' : 'bg-white'}`}>
          {filteredMessages.length === 0 ? (
            <div className="flex justify-center items-center h-full">
              <div className={`text-xs ${darkMode ? 'text-neutral-500 bg-[#161617] border-neutral-800' : 'text-gray-500 bg-gray-100 border-gray-200'} px-5 py-2.5 rounded-full border`}>
                {chatSearchTerm ? 'No se encontraron mensajes con esa coincidencia.' : 'Sin transmisiones recientes en este canal.'}
              </div>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const isMe = msg.email === user.email;
              const reactions = msg.reactions || {};

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                  
                  {isMe && (
                    <div className="absolute top-0 right-0 hidden group-hover:flex items-center bg-neutral-800/80 rounded-md border border-neutral-700 text-white text-[10px] z-10">
                      <button 
                        onClick={() => { setEditingMessageId(msg.id); setEditText(msg.text || ''); }}
                        className="px-2 py-1 hover:bg-neutral-700 rounded-l-md"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="px-2 py-1 hover:bg-red-900/50 rounded-r-md text-red-400"
                      >
                        Borrar
                      </button>
                    </div>
                  )}

                  <div className={`max-w-[80%] sm:max-w-[60%] rounded-2xl px-4 py-2.5 text-sm relative shadow-sm ${
                    isMe 
                      ? (darkMode ? 'bg-[#232f3e] text-white rounded-br-sm' : 'bg-gray-800 text-white rounded-br-sm') 
                      : (darkMode ? 'bg-[#1c1c1e] text-neutral-100 rounded-bl-sm border border-neutral-800' : 'bg-gray-100 text-gray-900 rounded-bl-sm border border-gray-200')
                  }`}>
                    {!isMe && (
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full overflow-hidden bg-neutral-700 flex items-center justify-center text-[10px] text-white shrink-0">
                          {msg.senderPhoto ? (
                            <img src={msg.senderPhoto} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span>{(msg.senderName || msg.email).charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-neutral-400">{msg.senderName || msg.email}</span>
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
                          <button onClick={() => setEditingMessageId(null)} className="text-[10px] text-neutral-400">Cancelar</button>
                          <button onClick={() => handleSaveEdit(msg.id)} className="text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white">Guardar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.text && <div className="break-words mb-1 text-[13px] leading-relaxed">{msg.text}</div>}
                        {msg.edited && <span className="text-[9px] text-neutral-400 italic block">(editado)</span>}
                      </>
                    )}

                    {/* Tarjeta interactiva de ubicación en vivo */}
                    {msg.location?.active && msg.location?.docId && (
                      <LiveLocationCard docId={msg.location.docId} darkMode={darkMode} />
                    )}

                    {msg.imageUrl && (
                      <div className="mb-1 cursor-zoom-in" onClick={() => setFullscreenImage(msg.imageUrl || null)}>
                        <img 
                          src={msg.imageUrl} 
                          alt="Imagen enviada" 
                          className="max-h-52 w-full rounded-lg object-cover border border-white/10 hover:opacity-95 transition" 
                        />
                      </div>
                    )}

                    {msg.audioUrl && (
                      <div className="my-2">
                        <audio controls src={msg.audioUrl} className="h-8 max-w-[200px]" />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-1 select-none">
                      <button 
                        onClick={() => setShowEmojiPickerFor(showEmojiPickerFor === msg.id ? null : msg.id)}
                        className={`text-[10px] ${darkMode ? 'text-neutral-400 hover:text-white' : 'text-gray-500 hover:text-black'} opacity-60 hover:opacity-100`}
                        title="Reaccionar"
                      >
                        ➕
                      </button>
                      <div className="flex items-center gap-1">
                        <span className={`text-[9px] ${darkMode ? 'text-white/70' : 'text-gray-500'}`}>
                          {msg.createdAt?.seconds 
                            ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'ahora'}
                        </span>
                        {isMe && <span className={`text-[10px] ${darkMode ? 'text-white/70' : 'text-gray-400'} font-bold`}>✓</span>}
                      </div>
                    </div>
                  </div>

                  {showEmojiPickerFor === msg.id && (
                    <div className={`flex gap-1.5 p-1.5 mt-1 rounded-full shadow-lg border text-sm z-20 ${darkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-300'}`}>
                      {['❤️', '👍', '🔥', '😂', '👏'].map(emoji => (
                        <button 
                          key={emoji} 
                          onClick={() => handleToggleReaction(msg.id, emoji, msg.reactions)}
                          className="hover:scale-125 transition transform px-1"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {Object.keys(reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(reactions).map(([emoji, usersList]) => {
                        const hasReacted = usersList.includes(user.email!);
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleToggleReaction(msg.id, emoji, msg.reactions)}
                            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition ${
                              hasReacted 
                                ? (darkMode ? 'bg-[#232f3e] border-blue-500 text-white' : 'bg-blue-100 border-blue-400 text-blue-900')
                                : (darkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-400' : 'bg-gray-100 border-gray-200 text-gray-700')
                            }`}
                          >
                            <span>{emoji}</span>
                            <span>{usersList.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Barra Inferior */}
        <form onSubmit={sendMessage} className={`p-3 sm:p-4 border-t ${darkMode ? 'border-neutral-800/80 bg-[#1d1d1f]/40' : 'border-gray-200 bg-gray-50'} backdrop-blur-md flex items-end gap-2 sm:gap-3`}>
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`p-2.5 rounded-full ${darkMode ? 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'} transition flex items-center justify-center`}
            title="Enviar foto o imagen"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            )}
          </button>

          {/* Botón de Ubicación en Tiempo Real con permisos de navegador */}
          <button
            type="button"
            onClick={toggleLiveLocation}
            className={`p-2.5 rounded-full transition flex items-center justify-center ${
              sharingLiveLocation 
                ? 'bg-red-600 text-white animate-pulse' 
                : (darkMode ? 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800')
            }`}
            title={sharingLiveLocation ? "Detener ubicación en tiempo real" : "Compartir ubicación en tiempo real"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`p-2.5 rounded-full transition flex items-center justify-center ${
              isRecording 
                ? 'bg-red-600 text-white animate-pulse' 
                : (darkMode ? 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800')
            }`}
            title={isRecording ? "Detener y enviar audio" : "Grabar nota de voz"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          </button>

          <textarea
            rows={1}
            value={newMessage}
            onChange={handleTypingChange}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Grabando audio..." : sharingLiveLocation ? "Transmitiendo ubicación en vivo..." : "Mensaje (Enter para enviar)..."}
            disabled={isRecording}
            className={`flex-1 ${darkMode ? 'bg-[#1c1c1e] text-white placeholder-neutral-500 border-neutral-800 focus:ring-neutral-500' : 'bg-white text-black placeholder-gray-400 border-gray-300 focus:ring-gray-400'} text-xs sm:text-sm rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-1 border resize-none max-h-24`}
          />
          
          <button
            type="submit"
            disabled={!newMessage.trim() || isRecording}
            className={`p-2.5 rounded-full transition flex items-center justify-center ${
              newMessage.trim() && !isRecording 
                ? 'bg-[#232f3e] hover:bg-[#1b2430] text-white cursor-pointer shadow-sm' 
                : (darkMode ? 'bg-[#2c2c2e] text-neutral-500' : 'bg-gray-200 text-gray-400') + ' cursor-not-allowed'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </form>

      </div>
    </div>
  );
}

// Subcomponente dinámico que escucha las coordenadas en tiempo real de Firestore
function LiveLocationCard({ docId, darkMode }: { docId: string; darkMode: boolean }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const locRef = doc(db, 'liveLocations', docId);
    const unsubscribe = onSnapshot(locRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.lat && data.lng) {
          setCoords({ lat: data.lat, lng: data.lng });
        }
      }
    });
    return () => unsubscribe();
  }, [docId]);

  return (
    <div className={`mt-2 p-3 rounded-xl border ${darkMode ? 'bg-black/40 border-neutral-700 text-white' : 'bg-white/80 border-gray-300 text-gray-900'} space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold flex items-center gap-1.5 text-red-500 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> Ubicación en tiempo real activa
        </span>
      </div>

      {coords ? (
        <div className="text-[11px] font-mono space-y-0.5">
          <p>Lat: {coords.lat.toFixed(6)}</p>
          <p>Lng: {coords.lng.toFixed(6)}</p>
        </div>
      ) : (
        <p className="text-[11px] italic text-neutral-400">Esperando señal GPS...</p>
      )}

      {coords && (
        <a 
          href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-block text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition shadow-sm"
        >
          Abrir mapa en vivo ↗
        </a>
      )}
    </div>
  );
}