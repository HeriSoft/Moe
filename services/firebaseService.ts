// FIX: Refactored to Firebase v8 (namespaced) API to resolve module import errors.
// This indicates the project is likely using Firebase v8, not v9+.
import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/database';

import type { UserProfile, ChatRoomMessage, OnlineUser } from '../types';

// v8 Type Definitions
type FirebaseApp = firebase.app.App;
type Database = firebase.database.Database;
type Auth = firebase.auth.Auth;
type Unsubscribe = () => void;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Database;
export let auth: Auth;

try {
  if (!firebase.apps.length) {
    app = firebase.initializeApp(firebaseConfig);
  } else {
    app = firebase.app();
  }
  db = firebase.database(app);
  auth = firebase.auth(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Function to sign in to Firebase using a Google ID token
export const signInToFirebase = async (idToken: string) => {
    if (!auth) throw new Error("Firebase Auth not initialized.");
    try {
        const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
        await auth.signInWithCredential(credential);
        console.log("Successfully signed in to Firebase.");
    } catch (error) {
        console.error("Firebase sign-in error:", error);
        // Don't throw, as the app might still function with Drive access
    }
};

// Export a unified sign-out function
export const signOut = () => {
    if (auth) {
        return auth.signOut();
    }
    return Promise.resolve();
};


// Store user status
export const setupPresence = (user: UserProfile): Unsubscribe => {
  if (!db || !user) return () => {};

  const userStatusDatabaseRef = db.ref(`/status/${user.id}`);
  const isOfflineForDatabase = {
    isOnline: false,
    lastOnline: firebase.database.ServerValue.TIMESTAMP,
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
    lastOnline: firebase.database.ServerValue.TIMESTAMP,
  };

  const connectedRef = db.ref('.info/connected');
  const listener = connectedRef.on('value', (snapshot) => {
    if (snapshot.val() === false) {
      return;
    }
    userStatusDatabaseRef.onDisconnect().update(isOfflineForDatabase).then(() => {
      userStatusDatabaseRef.update(userForPresence);
    });
  });

  firebase.database().goOnline();

  return () => {
    firebase.database().goOffline();
    userStatusDatabaseRef.update(isOfflineForDatabase);
    connectedRef.off('value', listener); // Unsubscribe from .info/connected
  };
};

export const onUsersStatusChange = (callback: (users: { [key: string]: OnlineUser }) => void): Unsubscribe => {
  if (!db) return () => {};
  const usersRef = db.ref('/status');
  const listener = usersRef.on('value', (snapshot) => {
    const usersData = snapshot.val() || {};
    callback(usersData);
  });
  return () => usersRef.off('value', listener);
};

export const onNewMessage = (callback: React.Dispatch<React.SetStateAction<ChatRoomMessage[]>>): Unsubscribe => {
    if (!db) return () => {};
    const messagesRef = db.ref('/chat_messages');
    const messagesQuery = messagesRef.limitToLast(100);

    const listener = messagesQuery.on('value', (snapshot) => {
        const messagesData = snapshot.val() || {};
        const messagesList: ChatRoomMessage[] = Object.keys(messagesData).map(key => ({
            id: key,
            ...messagesData[key]
        }));
        callback(messagesList);
    });
    return () => messagesQuery.off('value', listener);
};


export const sendMessage = (text: string, user: UserProfile) => {
  if (!db || !user) return;
  const messagesRef = db.ref('/chat_messages');
  const newMessage = {
    text,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
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
  messagesRef.push(newMessage);
};

export const updateAboutMe = async (user: UserProfile, aboutMe: string) => {
  if (!db || !user) return;
  const userStatusRef = db.ref(`/status/${user.id}`);
  await userStatusRef.update({ aboutMe });
};
