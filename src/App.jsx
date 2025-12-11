import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion 
} from 'firebase/firestore';
import { 
  Users, Play, Crown, Eye, EyeOff, Loader2, RotateCcw
} from 'lucide-react';

// --- SCHRITT 4: DEINE FIREBASE DATEN ---
// Ersetze die '...' mit deinen echten Werten aus der Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyD88i7ntFdBC8EDTH9Thq_BaLipzlPptvw",
  authDomain: "imposter-online.firebaseapp.com",
  projectId: "imposter-online",
  storageBucket: "imposter-online.firebasestorage.app",
  messagingSenderId: "603803951294",
  appId: "1:603803951294:web:e6d90aa666c8b0c9d1beef"
};

// Initialisierung
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ein fixer Name für deine App-Datenbank-Pfade
const appId = "imposter-online-game"; 

// --- WÖRTER DATEN ---
const WORDS_BY_CATEGORY = {
  'Tiere': ['Löwe', 'Elefant', 'Giraffe', 'Pinguin', 'Adler', 'Hai', 'Känguru', 'Koala', 'Panda'],
  'Essen': ['Pizza', 'Sushi', 'Burger', 'Spaghetti', 'Eiscreme', 'Döner', 'Salat', 'Pfannkuchen'],
  'Orte': ['Schule', 'Krankenhaus', 'Flughafen', 'Bibliothek', 'Kino', 'Schwimmbad', 'Supermarkt'],
  'Technik': ['iPhone', 'Laptop', 'Fernseher', 'Kopfhörer', 'Drohne', 'Roboter', 'Smartwatch'],
  'Berufe': ['Arzt', 'Lehrer', 'Polizist', 'Feuerwehrmann', 'Astronaut', 'Koch', 'Pilot']
};

// --- HILFSFUNKTIONEN ---
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

export default function ImposterOnline() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRole, setShowRole] = useState(false);
  const [gameTime, setGameTime] = useState(0);

  // --- AUTH INITIALIZATION (Vereinfacht für Vercel) ---
  useEffect(() => {
    // Einfach anonym anmelden, keine Tokens nötig
    signInAnonymously(auth).catch((error) => {
      console.error("Auth Error:", error);
      setError("Fehler bei der Anmeldung. Bitte lade die Seite neu.");
    });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const storedName = localStorage.getItem('imposter_username');
        if (storedName) setUserName(storedName);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- RAUM SYNCHRONISIERUNG ---
  useEffect(() => {
    if (!roomCode || !user) return;

    // Wir nutzen hier direkt den Pfad ohne 'artifacts', da es deine eigene DB ist
    // Pfad: lobbies/CODE
    const roomRef = doc(db, 'lobbies', roomCode);
    
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);
        
        if (data.status === 'playing' && data.startTime) {
          const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
          setGameTime(elapsed);
        }
      } else {
        setRoomCode('');
        setRoomData(null);
        setError('Der Raum wurde geschlossen.');
      }
    }, (err) => {
      console.error("Room sync error:", err);
      setError("Verbindung zum Raum verloren.");
    });

    return () => unsubscribe();
  }, [roomCode, user]);

  // --- TIMER ---
  useEffect(() => {
    let interval;
    if (roomData?.status === 'playing') {
      interval = setInterval(() => {
        setGameTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [roomData?.status]);

  // --- ACTIONS ---

  const handleCreateRoom = async () => {
    if (!userName.trim()) return setError('Bitte gib einen Namen ein.');
    setLoading(true);
    localStorage.setItem('imposter_username', userName);

    const code = generateRoomCode();
    // Pfad: lobbies/CODE
    const roomRef = doc(db, 'lobbies', code);

    const newRoom = {
      code,
      hostId: user.uid,
      status: 'lobby',
      category: 'Tiere',
      secretWord: '',
      imposterId: '',
      startTime: null,
      players: [{ id: user.uid, name: userName, score: 0 }]
    };

    try {
      await setDoc(roomRef, newRoom);
      setRoomCode(code);
      setError('');
    } catch (e) {
      console.error(e);
      setError('Fehler beim Erstellen des Raums.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!userName.trim()) return setError('Bitte gib einen Namen ein.');
    if (!joinCode.trim() || joinCode.length !== 4) return setError('Ungültiger Code.');
    setLoading(true);
    localStorage.setItem('imposter_username', userName);

    const code = joinCode.toUpperCase();
    const roomRef = doc(db, 'lobbies', code);

    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) {
        setError('Raum nicht gefunden.');
      } else {
        const data = snap.data();
        if (data.status !== 'lobby') {
          setError('Spiel läuft bereits.');
        } else {
            const isAlreadyIn = data.players.some(p => p.id === user.uid);
            if (!isAlreadyIn) {
                 await updateDoc(roomRef, {
                    players: arrayUnion({ id: user.uid, name: userName, score: 0 })
                });
            }
            setRoomCode(code);
            setError('');
        }
      }
    } catch (e) {
      console.error(e);
      setError('Fehler beim Beitreten.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!roomData) return;
    const players = roomData.players;
    const words = WORDS_BY_CATEGORY[roomData.category];
    const secretWord = words[Math.floor(Math.random() * words.length)];
    const imposterIndex = Math.floor(Math.random() * players.length);
    const imposterId = players[imposterIndex].id;

    const roomRef = doc(db, 'lobbies', roomCode);
    await updateDoc(roomRef, {
      status: 'playing',
      secretWord,
      imposterId,
      startTime: Date.now()
    });
  };

  const handleReveal = async () => {
    const roomRef = doc(db, 'lobbies', roomCode);
    await updateDoc(roomRef, { status: 'revealed' });
  };

  const handleResetGame = async () => {
     const roomRef = doc(db, 'lobbies', roomCode);
     await updateDoc(roomRef, { 
         status: 'lobby',
         secretWord: '',
         imposterId: '',
         startTime: null
     });
  };

  const handleLeaveRoom = async () => {
      setRoomCode('');
      setRoomData(null);
  };
  
  const handleChangeCategory = async (cat) => {
      const roomRef = doc(db, 'lobbies', roomCode);
      await updateDoc(roomRef, { category: cat });
  };


  // --- UI COMPONENTS ---
  const Button = ({ onClick, children, variant = 'primary', className = '', disabled=false }) => {
    const baseStyle = "w-full py-4 rounded-2xl font-semibold text-lg transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";
    const styles = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30",
      secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
      danger: "bg-red-50 text-red-600 hover:bg-red-100",
      ghost: "bg-transparent text-blue-600 hover:bg-blue-50"
    };
    return (
      <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${styles[variant]} ${className}`}>
        {loading && variant === 'primary' ? <Loader2 className="animate-spin w-5 h-5"/> : children}
      </button>
    );
  };

  const Card = ({ children, className = '' }) => (
    <div className={`bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 ${className}`}>
      {children}
    </div>
  );

  const isHost = roomData?.hostId === user?.uid;
  const isImposter = user?.uid === roomData?.imposterId;
  const imposterName = roomData?.players.find(p => p.id === roomData.imposterId)?.name || 'Unbekannt';

  // --- VIEWS ---

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-[#F2F2F7]"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div>;

  // 1. LANDING SCREEN
  if (!roomCode) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] font-sans text-gray-900 p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
             <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-600/30 mb-6">
                 <EyeOff className="w-8 h-8 text-white" />
             </div>
             <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Imposter</h1>
             <p className="text-gray-500">Finde den Spion unter deinen Freunden</p>
          </div>

          <Card>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1 ml-1">Dein Name</label>
                <input 
                  type="text" 
                  value={userName} 
                  onChange={e => setUserName(e.target.value)}
                  placeholder="Wie sollen wir dich nennen?" 
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-4 text-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                />
              </div>

              <div className="pt-2 grid grid-cols-1 gap-3">
                <Button onClick={handleCreateRoom}>
                  Raum erstellen
                </Button>
                
                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-gray-200"></div>
                    <span className="flex-shrink-0 mx-4 text-gray-400 text-xs uppercase font-bold">Oder</span>
                    <div className="flex-grow border-t border-gray-200"></div>
                </div>

                <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={joinCode} 
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="CODE"
                      maxLength={4}
                      className="w-24 bg-white border border-gray-200 rounded-xl px-2 py-4 text-center text-lg font-mono font-bold tracking-widest focus:ring-2 focus:ring-blue-500 outline-none uppercase placeholder-gray-300"
                    />
                    <Button onClick={handleJoinRoom} variant="secondary" className="flex-1">
                       Beitreten
                    </Button>
                </div>
              </div>
            </div>
            {error && <p className="mt-4 text-center text-red-500 text-sm bg-red-50 py-2 rounded-lg">{error}</p>}
          </Card>
        </div>
      </div>
    );
  }

  // 2. LOBBY SCREEN
  if (roomData && roomData.status === 'lobby') {
    return (
      <div className="min-h-screen bg-[#F2F2F7] p-4 flex flex-col">
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col space-y-6">
           
           <div className="bg-blue-600 text-white p-6 rounded-3xl shadow-lg shadow-blue-600/20 text-center relative overflow-hidden">
               <div className="relative z-10">
                   <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">Raum Code</p>
                   <h1 className="text-5xl font-black tracking-widest font-mono cursor-pointer" onClick={() => {navigator.clipboard.writeText(roomCode)}}>{roomCode}</h1>
                   <p className="text-blue-200 text-xs mt-2">Teile diesen Code mit deinen Freunden</p>
               </div>
               <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Users className="w-32 h-32" />
               </div>
           </div>

           <Card className="flex-1 flex flex-col">
               <div className="flex justify-between items-center mb-4">
                   <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                       <Users className="w-5 h-5 text-gray-500"/> Spieler ({roomData.players.length})
                   </h2>
               </div>
               <div className="flex-1 space-y-2 overflow-y-auto pr-2 mb-4">
                   {roomData.players.map(p => (
                       <div key={p.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${p.isHost ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-200 text-gray-600'}`}>
                               {p.name.charAt(0).toUpperCase()}
                           </div>
                           <span className="font-medium text-gray-900">{p.name} {p.id === user.uid && "(Du)"}</span>
                           {p.id === roomData.hostId && <Crown className="w-4 h-4 text-yellow-500 ml-auto"/>}
                       </div>
                   ))}
               </div>

               {isHost ? (
                   <div className="space-y-4 pt-4 border-t border-gray-100">
                       <div>
                           <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Kategorie</label>
                           <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                               {Object.keys(WORDS_BY_CATEGORY).map(cat => (
                                   <button 
                                     key={cat}
                                     onClick={() => handleChangeCategory(cat)}
                                     className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${roomData.category === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
                                   >
                                       {cat}
                                   </button>
                               ))}
                           </div>
                       </div>
                       <Button onClick={handleStartGame} disabled={roomData.players.length < 3}>
                           Spiel starten <Play className="w-4 h-4 fill-current"/>
                       </Button>
                       {roomData.players.length < 3 && <p className="text-xs text-center text-gray-400">Mindestens 3 Spieler benötigt</p>}
                   </div>
               ) : (
                   <div className="text-center py-4">
                       <p className="text-gray-500 animate-pulse">Warte auf Host...</p>
                       <p className="text-xs text-gray-400 mt-1">Kategorie: {roomData.category}</p>
                   </div>
               )}
           </Card>

           <div className="text-center">
             <button onClick={handleLeaveRoom} className="text-gray-400 text-sm font-medium hover:text-red-500 transition-colors">
                 Raum verlassen
             </button>
           </div>
        </div>
      </div>
    );
  }

  // 3. PLAYING SCREEN
  if (roomData && roomData.status === 'playing') {
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
      <div className="min-h-screen bg-[#F2F2F7] p-4 flex flex-col items-center justify-center">
         <div className="w-full max-w-md space-y-6">
            
            <div className="flex justify-center">
                 <div className="px-6 py-2 bg-white rounded-full shadow-sm border border-gray-100 font-mono text-xl font-bold text-gray-600 flex items-center gap-2">
                     <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                     {formatTime(gameTime)}
                 </div>
            </div>

            <Card className="text-center py-12">
                <div className="mb-6 flex justify-center">
                    <div className="p-4 bg-gray-50 rounded-full">
                        {showRole ? (
                            isImposter ? <EyeOff className="w-8 h-8 text-red-500" /> : <Eye className="w-8 h-8 text-blue-500" />
                        ) : (
                            <HelpCircleIcon /> 
                        )}
                    </div>
                </div>
                
                <h2 className="text-gray-500 font-medium mb-4">Deine Rolle</h2>
                
                <div className="h-24 flex items-center justify-center mb-6">
                    {showRole ? (
                        <div className="animate-in zoom-in duration-200">
                             {isImposter ? (
                                 <div className="space-y-2">
                                     <h1 className="text-4xl font-black text-red-600 uppercase tracking-widest">Imposter</h1>
                                     <p className="text-xs text-red-400">Lass dich nicht erwischen!</p>
                                 </div>
                             ) : (
                                 <div className="space-y-2">
                                     <h1 className="text-4xl font-black text-blue-600">{roomData.secretWord}</h1>
                                     <p className="text-xs text-blue-400">Kategorie: {roomData.category}</p>
                                 </div>
                             )}
                        </div>
                    ) : (
                        <div className="text-gray-300 text-sm">
                            Tippe auf den Button unten<br/>um deine Rolle zu sehen
                        </div>
                    )}
                </div>

                <Button 
                    variant={showRole ? 'secondary' : 'primary'}
                    onClick={() => setShowRole(!showRole)}
                >
                    {showRole ? 'Verstecken' : 'Rolle anzeigen'}
                </Button>
            </Card>

            {isHost && (
                <Card className="bg-gray-900 border-none text-white">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="font-bold">Admin Bereich</h3>
                            <p className="text-xs text-gray-400">Beende die Runde zur Abstimmung</p>
                        </div>
                        <button 
                            onClick={handleReveal}
                            className="bg-white text-gray-900 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-100 active:scale-95 transition-all"
                        >
                            Auflösen
                        </button>
                    </div>
                </Card>
            )}
         </div>
      </div>
    );
  }

  // 4. RESULT SCREEN
  if (roomData && roomData.status === 'revealed') {
    return (
      <div className="min-h-screen bg-[#F2F2F7] p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-6">
            
            <div className="text-center py-6">
                <div className="inline-flex p-4 bg-red-100 rounded-full mb-4 text-red-600">
                    <Crown className="w-12 h-12" />
                </div>
                <h2 className="text-gray-500 font-medium uppercase tracking-widest text-sm">Der Imposter war</h2>
                <h1 className="text-4xl font-black text-gray-900 mt-2">{imposterName}</h1>
            </div>

            <Card className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-2xl">
                    <span className="text-gray-500 text-sm">Geheimes Wort</span>
                    <span className="font-bold text-xl text-blue-600">{roomData.secretWord}</span>
                </div>
            </Card>

            {isHost ? (
                <div className="space-y-3 pt-4">
                    <Button onClick={handleStartGame}>
                        Nächste Runde <RotateCcw className="w-4 h-4"/>
                    </Button>
                    <Button variant="secondary" onClick={handleResetGame}>
                        Zurück zur Lobby
                    </Button>
                </div>
            ) : (
                <div className="text-center p-4">
                    <p className="text-gray-500 animate-pulse">Warte auf Host für nächste Runde...</p>
                </div>
            )}
        </div>
      </div>
    );
  }

  return null;
}

// Icons
const HelpCircleIcon = () => (
    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);