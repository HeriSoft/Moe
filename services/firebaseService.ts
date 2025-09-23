// FIX: Use modular imports for Firebase SDK v9+ to resolve type and function errors.
// FIX: Changed import path to use scoped package to resolve module export errors.
import { initializeApp, type FirebaseApp } from '@firebase/app';
// FIX: Changed import path to use scoped package to resolve module export errors.
import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp,
  goOnline,
  goOffline,
  push,
  query,
  limitToLast,
  Database,
  Unsubscribe,
  off,
  update
} from '@firebase/database';
import type { UserProfile, ChatRoomMessage, OnlineUser } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// FIX: Correctly type the Firebase app instance.
let app: FirebaseApp;
let db: Database;

try {
  // FIX: Use the imported initializeApp function directly.
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Store user status
export const setupPresence = (user: UserProfile): Unsubscribe => {
  if (!db || !user) return () => {};

  const userStatusDatabaseRef = ref(db, `/status/${user.id}`);
  const isOfflineForDatabase = {
    isOnline: false,
    lastOnline: serverTimestamp(),
  };

  const userForPresence = {
    id: user.id,
    name: user.name,
    email: user.email,
    imageUrl: user.imageUrl,
    isPro: user.isPro,
    isModerator: user.isModerator,
    level: user.level,
    hasPermanentNameColor: user.hasPermanentNameColor,
    hasSakuraBanner: user.hasSakuraBanner,
    aboutMe: user.aboutMe || '',
    isOnline: true,
    lastOnline: serverTimestamp(),
  };

  const connectedRef = ref(db, '.info/connected');
  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === false) {
      return;
    }
    onDisconnect(userStatusDatabaseRef).update(isOfflineForDatabase).then(() => {
      update(userStatusDatabaseRef, userForPresence);
    });
  });

  goOnline(db);

  return () => {
    goOffline(db);
    update(userStatusDatabaseRef, isOfflineForDatabase);
    unsubscribe(); // Unsubscribe from .info/connected
  };
};

export const onUsersStatusChange = (callback: (users: { [key: string]: OnlineUser }) => void): Unsubscribe => {
  if (!db) return () => {};
  const usersRef = ref(db, '/status');
  const unsubscribe = onValue(usersRef, (snapshot) => {
    const usersData = snapshot.val() || {};
    callback(usersData);
  });
  return unsubscribe;
};

export const onNewMessage = (callback: React.Dispatch<React.SetStateAction<ChatRoomMessage[]>>): Unsubscribe => {
    if (!db) return () => {};
    const messagesRef = ref(db, '/chat_messages');
    const messagesQuery = query(messagesRef, limitToLast(100));

    const unsubscribe = onValue(messagesQuery, (snapshot) => {
        const messagesData = snapshot.val() || {};
        const messagesList: ChatRoomMessage[] = Object.keys(messagesData).map(key => ({
            id: key,
            ...messagesData[key]
        }));
        callback(messagesList);
    });
    return unsubscribe;
};


export const sendMessage = (text: string, user: UserProfile) => {
  if (!db || !user) return;
  const messagesRef = ref(db, '/chat_messages');
  const newMessage = {
    text,
    timestamp: serverTimestamp(),
    user: {
      id: user.id,
      name: user.name,
      imageUrl: user.imageUrl,
      level: user.level,
      isPro: user.isPro,
      isModerator: user.isModerator,
      hasPermanentNameColor: user.hasPermanentNameColor,
      hasSakuraBanner: user.hasSakuraBanner,
    },
  };
  push(messagesRef, newMessage);
};

export const updateAboutMe = async (user: UserProfile, aboutMe: string) => {
  if (!db || !user) return;
  const userStatusRef = ref(db, `/status/${user.id}`);
  await update(userStatusRef, { aboutMe });
};
