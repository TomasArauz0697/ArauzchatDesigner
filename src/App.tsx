import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  Send,
  LogOut,
  MessageSquare,
  Lock,
  Mail,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';

interface Message {
  id: string;
  text: string;
  email: string;
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[];
      setMessages(msgs);
      setTimeout(
        () => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }),
        100
      );
    });
    return () => unsubscribe();
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      let message = 'Ocurrió un error inesperado.';
      if (err.code === 'auth/invalid-credential')
        message = 'Correo o contraseña incorrectos.';
      if (err.code === 'auth/email-already-in-use')
        message = 'Este correo ya está registrado.';
      if (err.code === 'auth/weak-password')
        message = 'La contraseña debe tener al menos 6 caracteres.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError('No se pudo iniciar sesión con Google.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error al cerrar sesión', err);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    const messageToSend = newMessage;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'messages'), {
        text: messageToSend,
        email: user.email,
        createdAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error('Error al enviar mensaje:', err);
      setNewMessage(messageToSend);
      setError('No se pudo enviar el mensaje. Intenta de nuevo.');
    }
  };

  if (isLoading && !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <LoaderCircle className="h-10 w-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 selection:bg-indigo-500/30 selection:text-indigo-200">
        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-slate-950/50 transition-all duration-500 hover:border-slate-700">
          <div className="h-2.5 bg-gradient-to-r from-indigo-600 via-violet-500 to-fuchsia-500" />

          <div className="p-6 sm:p-10">
            <div className="mb-8 sm:mb-10 flex flex-col items-center text-center">
              <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 ring-4 ring-slate-950/30">
                <MessageSquare className="h-10 w-10 text-indigo-400 drop-shadow-lg" />
                <div className="absolute -bottom-1 -right-1 rounded-full bg-indigo-600 p-2 border-4 border-slate-900">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tighter text-white">
                {isRegistering
                  ? 'Únete a la Conversación'
                  : 'Bienvenido de Nuevo'}
              </h1>
              <p className="mt-3 max-w-sm text-base sm:text-lg text-slate-400">
                {isRegistering
                  ? 'Crea tu cuenta gratis y comienza a chatear en tiempo real.'
                  : 'Nos alegra verte de nuevo. Accede a tu cuenta para continuar.'}
              </p>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-900/50 bg-red-950/50 p-4 text-sm text-red-300 shadow-inner">
                <Lock className="h-5 w-5 text-red-500 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-slate-300 ml-1"
                >
                  Correo Electrónico
                </label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 py-4 pl-12 pr-6 text-white placeholder-slate-600 shadow-inner transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="tucorreo@ejemplo.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-300 ml-1"
                  >
                    Contraseña
                  </label>
                </div>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-400" />
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 py-4 pl-12 pr-6 text-white placeholder-slate-600 shadow-inner transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full overflow-hidden rounded-2xl bg-indigo-600 py-4 px-6 text-center text-lg font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-70"
              >
                <span
                  className={`relative flex items-center justify-center gap-2 transition-opacity duration-300 ${
                    isLoading ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {isRegistering ? 'Crear Cuenta Ahora' : 'Iniciar Sesión'}
                  {!isRegistering && (
                    <Send className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  )}
                </span>

                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <LoaderCircle className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
              </button>
            </form>

            <div className="relative my-6">
              <div
                className="absolute inset-0 flex items-center"
                aria-hidden="true"
              >
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-slate-900 px-3 text-sm text-slate-600">
                  o
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 py-4 px-6 text-base font-semibold text-white shadow-lg transition-all hover:bg-slate-800 active:scale-[0.98] disabled:opacity-70"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.4l3.7 2.9C6.5 7.1 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.9 6.4C.7 8.8 0 10.3 0 12s.7 3.2 1.9 5.6l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.1-6.4-5.1L1.9 16C3.7 19.8 7.5 23 12 23z"
                />
              </svg>
              Continuar con Google
            </button>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }}
                disabled={isLoading}
                className="text-base text-indigo-400 hover:text-indigo-300 hover:underline focus:outline-none disabled:opacity-50"
              >
                {isRegistering
                  ? '¿Ya tienes una cuenta? Inicia sesión aquí'
                  : '¿Aún no tienes cuenta? Regístrate gratis'}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950/50 px-8 py-4 text-center text-xs text-slate-600">
            TAChatOnline | Firebase + Tailwind CSS
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <header className="z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 sm:px-6 py-4 shadow-lg backdrop-blur-sm sticky top-0">
        <div className="flex items-center space-x-3 sm:space-x-4 overflow-hidden">
          <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white font-black text-lg sm:text-xl shadow-inner ring-2 ring-indigo-500/30">
            {user.email?.charAt(0).toUpperCase()}
            <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
          </div>
          <div className="truncate">
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
              Sala Global
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-mono truncate">
              {user.email}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center space-x-2 rounded-xl bg-slate-800 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-slate-300 transition hover:bg-red-950 hover:text-red-300 flex-shrink-0"
        >
          <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">Cerrar Sesión</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-950/50 scroll-smooth">
        {messages.map((msg, index) => {
          const isMe = msg.email === user.email;
          const showEmail =
            index === 0 || messages[index - 1].email !== msg.email;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              {showEmail && !isMe && (
                <span className="text-xs font-semibold text-slate-500 mb-1.5 ml-1.5 tracking-wide">
                  {msg.email}
                </span>
              )}
              <div
                className={`group relative max-w-[85%] sm:max-w-[65%] rounded-3xl px-5 sm:px-6 py-3.5 sm:py-4 text-sm sm:text-[15px] shadow-lg leading-relaxed transition-all duration-300 ease-out break-words ${
                  isMe
                    ? 'bg-indigo-600 text-white rounded-br-lg'
                    : 'bg-slate-800 text-slate-200 rounded-bl-lg border border-slate-700/50'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="border-t border-slate-800 bg-slate-900/80 p-3 sm:p-4 backdrop-blur-sm"
      >
        <div className="flex items-center space-x-2 sm:space-x-3 max-w-4xl mx-auto">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 rounded-2xl bg-slate-950 border border-slate-700 px-4 sm:px-5 py-3.5 sm:py-4 text-sm sm:text-base text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center justify-center rounded-2xl bg-indigo-600 px-5 sm:px-6 py-3.5 sm:py-4 text-white font-medium transition hover:bg-indigo-500 active:scale-95 shadow-lg shadow-indigo-600/20 flex-shrink-0"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
