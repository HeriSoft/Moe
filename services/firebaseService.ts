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

let app: FirebaseApp;
let database: Database;

try {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// --- PRESENCE SYSTEM ---
export const setupPresence = (user: UserProfile) => {
  if (!database || !user) return;
  const myConnectionsRef = ref(database, `users/${user.id}/connections`);
  const lastOnlineRef = ref(database, `users/${user.id}/lastOnline`);
  const connectedRef = ref(database, '.info/connected');

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
    const usersRef = ref(database, 'users');
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
    if (!database || !text.trim() || !user) return;
    const messagesRef = ref(database, 'chat-messages');
    push(messagesRef, {
        text: text.trim(),
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
        }
    });
};

export const onNewMessage = (callback: (messages: ChatRoomMessage[]) => void): Unsubscribe => {
    const messagesRef = ref(database, 'chat-messages');
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
export const fetchAllUsers = async (): Promise<OnlineUser[]> => {
    if (!database) return [];
    try {
        const response = await fetch('/api/admin?action=get_all_chat_users', {
             headers: { 'X-User-Email': 'dummy@email.com' } // Placeholder, as this needs to be a logged-in action
        });
        if (!response.ok) throw new Error("Failed to fetch user list from server");
        const data = await response.json();
        return data.users || [];
    } catch (error) {
        console.error("Error fetching all users:", error);
        return [];
    }
};

export const updateAboutMe = async (userEmail: string, aboutMe: string): Promise<string> => {
    const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-User-Email': userEmail, // Authenticates the request
        },
        body: JSON.stringify({ action: 'update_profile', aboutMe })
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.details || "Failed to update profile.");
    }

    // Also update Firebase
    if (database) {
        const userRef = ref(database, `users/${result.userId}/aboutMe`); // Assuming API returns userId
        await set(userRef, aboutMe);
    }
    
    return result.aboutMe;
};
