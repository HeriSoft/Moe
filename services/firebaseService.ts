// FIX: Use Firebase compat for app initialization to resolve module errors, while keeping v9 modular API for services.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';

import { 
    getAuth, 
    signInWithCredential, 
    GoogleAuthProvider, 
    signOut as firebaseSignOut, 
    Auth 
} from 'firebase/auth';
import { 
    getDatabase, 
    ref, 
    onValue, 
    onDisconnect, 
    update, 
    serverTimestamp, 
    goOnline, 
    goOffline, 
    push, 
    query, 
    limitToLast,
    Unsubscribe,
    Database
} from 'firebase/database';

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

// Use the type from the compat import
type FirebaseApp = firebase.app.App;

let app: FirebaseApp;
let db: Database;
export let auth: Auth;

try {
  // Use compat initialization
  app = firebase.apps.length === 0 ? firebase.initializeApp(firebaseConfig) : firebase.app();
  // Use modular services with the compat-initialized app
  db = getDatabase(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Function to sign in to Firebase using a Google ID token
export const signInToFirebase = async (idToken: string) => {
    if (!auth) throw new Error("Firebase Auth not initialized.");
    try {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        console.log("Successfully signed in to Firebase.");
    } catch (error) {
        console.error("Firebase sign-in error:", error);
        // Don't throw, as the app might still function with Drive access
    }
};

// Export a unified sign-out function
export const signOut = () => {
    if (auth) {
        return firebaseSignOut(auth);
    }
    return Promise.resolve();
};


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
  const listener = onValue(connectedRef, (snapshot) => {
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
    listener(); // Unsubscribe from .info/connected
  };
};

export const onUsersStatusChange = (callback: (users: { [key: string]: OnlineUser }) => void): Unsubscribe => {
  if (!db) return () => {};
  const usersRef = ref(db, '/status');
  const listener = onValue(usersRef, (snapshot) => {
    const usersData = snapshot.val() || {};
    callback(usersData);
  });
  return listener;
};

export const onNewMessage = (callback: React.Dispatch<React.SetStateAction<ChatRoomMessage[]>>): Unsubscribe => {
    if (!db) return () => {};
    const messagesRef = ref(db, '/chat_messages');
    const messagesQuery = query(messagesRef, limitToLast(100));

    const listener = onValue(messagesQuery, (snapshot) => {
        const messagesData = snapshot.val() || {};
        const messagesList: ChatRoomMessage[] = Object.keys(messagesData).map(key => ({
            id: key,
            ...messagesData[key]
        }));
        callback(messagesList);
    });
    return listener;
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
