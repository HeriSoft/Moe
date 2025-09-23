import { initializeApp, FirebaseApp } from "firebase/app";
import { getDatabase, ref, onValue, push, serverTimestamp, onDisconnect, set, get, child, Database, Unsubscribe, off, serverTimestamp as dbServerTimestamp } from "firebase/database";
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

// Initialize Firebase ONCE and export the app instance.
let app: FirebaseApp;
let database: Database | null;

try {
  // Check if all config keys are present before initializing
  let configComplete = true;
  for (const key in firebaseConfig) {
      if (!firebaseConfig[key as keyof typeof firebaseConfig]) {
          console.error(`Firebase config is missing key: ${key}. Initialization aborted.`);
          configComplete = false;
          break;
      }
  }
  if (configComplete) {
      app = initializeApp(firebaseConfig);
      database = getDatabase(app);
  } else {
      app = null as any; // Explicitly set to a falsy value
      database = null;
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
  app = null as any;
  database = null;
}

export const firebaseApp = app;

// Function to get the database instance.
const getDb = (): Database | null => {
    return database;
};


// --- PRESENCE SYSTEM ---
export const setupPresence = (user: UserProfile) => {
  const db = getDb();
  if (!db || !user || !user.id) return; // Added check for user.id

  // Use user.id which is now the Firebase UID
  const myConnectionsRef = ref(db, `users/${user.id}/connections`);
  const lastOnlineRef = ref(db, `users/${user.id}/lastOnline`);
  const connectedRef = ref(db, '.info/connected');
  
  // Set user profile data, but only non-sensitive parts for presence
  const userStatusRef = ref(db, `users/${user.id}`);
  const presenceData = {
    name: user.name,
    imageUrl: user.imageUrl,
    email: user.email, // Storing email can be useful for lookups
    aboutMe: user.aboutMe || '',
    // Connections and lastOnline will be handled by the presence logic
  };
  set(userStatusRef, presenceData); // Overwrites with fresh data on connect

  onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      const con = push(myConnectionsRef);
      onDisconnect(con).remove();
      set(con, true);
      onDisconnect(lastOnlineRef).set(serverTimestamp());
    }
  });
};

export const onUsersStatusChange = (callback: (users: { [key: string]: OnlineUser }) => void): Unsubscribe => {
    const db = getDb();
    if (!db) {
        console.error("Firebase not available for onUsersStatusChange.");
        return () => {}; // Return a no-op function
    }
    const usersRef = ref(db, 'users');
    const listener = onValue(usersRef, (snapshot) => {
        const usersData = snapshot.val() || {};
        const onlineUsers: { [key: string]: OnlineUser } = {};
        Object.keys(usersData).forEach(userId => {
            onlineUsers[userId] = {
                ...usersData[userId],
                id: userId,
                isOnline: !!usersData[userId].connections,
            };
        });
        callback(onlineUsers);
    });
    return () => off(usersRef, 'value', listener);
};

// --- CHAT MESSAGES ---
export const sendMessage = (text: string, user: UserProfile) => {
    const db = getDb();
    if (!db || !text.trim() || !user || !user.id) return; // Added check for user.id
    const messagesRef = ref(db, 'chat-messages');
    push(messagesRef, {
        text: text.trim(),
        timestamp: serverTimestamp(),
        user: {
            id: user.id, // This is the Firebase UID
            name: user.name,
            imageUrl: user.imageUrl,
            level: user.level,
            isPro: user.isPro,
            isModerator: user.isModerator,
            hasPermanentNameColor: user.hasPermanentNameColor,
            hasSakuraBanner: user.hasSakuraBanner,
        }
    });
};

export const onNewMessage = (callback: (messages: ChatRoomMessage[]) => void): Unsubscribe => {
    const db = getDb();
    if (!db) {
        console.error("Firebase not available for onNewMessage.");
        return () => {}; // Return a no-op function
    }
    const messagesRef = ref(db, 'chat-messages');
    const listener = onValue(messagesRef, (snapshot) => {
        const messagesData = snapshot.val() || {};
        const messagesList: ChatRoomMessage[] = Object.keys(messagesData).map(key => ({
            id: key,
            ...messagesData[key]
        })).sort((a, b) => a.timestamp - b.timestamp);
        callback(messagesList);
    });
    return () => off(messagesRef, 'value', listener);
};

// --- USER PROFILE ---
export const fetchAllUsers = async (currentUserEmail: string): Promise<OnlineUser[]> => {
    if (!getDb()) return [];
    try {
        const response = await fetch('/api/admin?action=get_all_chat_users', {
             headers: { 'X-User-Email': currentUserEmail } 
        });
        if (!response.ok) throw new Error("Failed to fetch user list from server");
        const data = await response.json();
        return data.users || [];
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
};

export const updateAboutMe = async (user: UserProfile, aboutMe: string): Promise<string> => {
    const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-User-Email': user.email, // Authenticates the request
        },
        body: JSON.stringify({ action: 'update_profile', aboutMe })
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.details || "Failed to update profile.");
    }

    // Also update Firebase in real-time
    const db = getDb();
    if (db && user.id) {
        const userRef = ref(db, `users/${user.id}/aboutMe`);
        await set(userRef, aboutMe);
    }
    
    return result.aboutMe;
};
