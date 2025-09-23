// FIX: Augment the global ImportMeta type to include Vite's environment variables.
// This resolves TypeScript errors about `import.meta.env` when the standard
// `vite/client` types are not being picked up automatically.
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_GOOGLE_CLIENT_ID: string;
      readonly VITE_GOOGLE_API_KEY: string;
      readonly VITE_FIREBASE_API_KEY: string;
      readonly VITE_FIREBASE_AUTH_DOMAIN: string;
      readonly VITE_FIREBASE_DATABASE_URL: string;
      readonly VITE_FIREBASE_PROJECT_ID: string;
      readonly VITE_FIREBASE_STORAGE_BUCKET: string;
      readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
      readonly VITE_FIREBASE_APP_ID: string;
    };
  }
}

import type { ChatSession, UserProfile } from '../types';
import { fetchUserProfileAndLogLogin } from './geminiService';
import { firebaseApp } from './firebaseService'; // Import the initialized app
// FIX: Using named imports for Firebase Auth to resolve module resolution errors.
// This is the standard for Firebase v9+ and ensures functions are correctly imported.
import { getAuth, onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";


// Use Vite's import.meta.env to access environment variables on the client-side
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;


const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive';
const APP_FOLDER_NAME = 'Moe Chat Data';

let gapi: any = null;
let google: any = null;
let appFolderId: string | null = null;
let gapiAccessToken: string | null = null;

// Initialize Firebase Auth from the shared app instance
// FIX: Use named import `getAuth` directly.
const auth = getAuth(firebaseApp);


/**
 * Inspects a GAPI error object and throws a more user-friendly error.
 * Specifically checks for the "API not enabled" error.
 * @param error The raw error object from a GAPI client promise rejection.
 * @param context A string describing the action that failed (e.g., "saving session").
 */
const handleGapiError = (error: any, context: string): never => {
    console.error(`GAPI Error during ${context}:`, error);
    const errorDetails = error?.result?.error || error?.data?.error;

    if (errorDetails) {
        if (
            (errorDetails.status === 'PERMISSION_DENIED' || errorDetails.code === 403) &&
            errorDetails.message?.toLowerCase().includes('drive api has not been used')
        ) {
            throw new Error(
                "Google Drive API is not enabled. Please visit your Google Cloud Console and enable the 'Google Drive API' for this project to save and load chats."
            );
        }
        // Throw a more specific message if available
        throw new Error(`Google Drive Error: ${errorDetails.message} (Code: ${errorDetails.code})`);
    }

    // Fallback for unexpected error formats or custom errors from our refresh logic
    throw new Error(error.message || `An unknown error occurred during ${context}.`);
};


/**
 * Initializes the Google API client and Firebase Auth listener.
 * This function now assumes gapi and google scripts are loaded from index.html
 * @param onAuthChange Callback function to update authentication status in the app.
 */
export async function initClient(
    onAuthChange: (isLoggedIn: boolean, userProfile?: UserProfile) => void
) {
    console.log("Starting Google Drive service initialization...");
    try {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
            throw new Error("VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_API_KEY is not set. Please check your environment variables.");
        }
        
        const gapiLoadPromise = new Promise<void>((resolve, reject) => {
            let attempts = 0;
            const interval = setInterval(() => {
                if ((window as any).gapi) {
                    clearInterval(interval);
                    gapi = (window as any).gapi;
                    console.log("gapi library loaded.");
                    resolve();
                } else if (++attempts > 50) {
                    clearInterval(interval);
                    reject(new Error("Failed to load Google API (gapi) library. Check script tag in index.html."));
                }
            }, 100);
        });

        const gisLoadPromise = new Promise<void>((resolve, reject) => {
            let attempts = 0;
            const interval = setInterval(() => {
                if ((window as any).google) {
                    clearInterval(interval);
                    google = (window as any).google;
                    console.log("Google Identity Services (gis) library loaded.");
                    resolve();
                } else if (++attempts > 50) {
                    clearInterval(interval);
                    reject(new Error("Failed to load Google Identity Services (gis) library. Check script tag in index.html."));
                }
            }, 100);
        });
        
        await Promise.all([gapiLoadPromise, gisLoadPromise]);

        await new Promise<void>((resolve, reject) => {
            gapi.load('client', async () => {
                try {
                    // FIX: Removed the conflicting apiKey. The client will rely solely on the OAuth token.
                    await gapi.client.init({
                        discoveryDocs: DISCOVERY_DOCS,
                    });
                    resolve();
                } catch (error) { reject(error); }
            });
        });
        
        // FIX: Use named import `onAuthStateChanged` directly and `User` type.
        onAuthStateChanged(auth, async (user: User | null) => {
            if (user) {
                console.log("Firebase user detected. Fetching profile.");
                const basicUserProfile: UserProfile = {
                    id: user.uid, // CRITICAL: Use Firebase UID as the primary ID
                    name: user.displayName || 'Unnamed User',
                    email: user.email || 'no-email@example.com',
                    imageUrl: user.photoURL || '',
                };
                const fullProfile = await fetchUserProfileAndLogLogin(basicUserProfile);
                onAuthChange(true, fullProfile);
            } else {
                console.log("No Firebase user. Setting auth state to logged out.");
                gapiAccessToken = null;
                if (gapi?.client) gapi.client.setToken(null);
                appFolderId = null;
                onAuthChange(false);
            }
        });

        console.log("Google Drive service initialization complete.");

    } catch (error) {
        console.error("Fatal error during Google service initialization:", error);
        onAuthChange(false);
    }
}


export async function signIn() {
    console.log("signIn function called, initiating Firebase popup.");
    // FIX: Use named import `GoogleAuthProvider` directly.
    const provider = new GoogleAuthProvider();
    provider.addScope(SCOPES); // Request Drive scope along with standard scopes
    try {
        // FIX: Use named import `signInWithPopup` directly.
        const result = await signInWithPopup(auth, provider);
        // FIX: Use named import `GoogleAuthProvider` directly.
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
            console.log("Successfully signed in with Firebase and got access token for Drive.");
            gapiAccessToken = credential.accessToken;
            gapi.client.setToken({ access_token: gapiAccessToken });
            // onAuthStateChanged will now fire and handle updating the app state.
        } else {
            throw new Error("No access token found in Google credential after sign-in.");
        }
    } catch (error) {
        console.error("Firebase signInWithPopup failed:", error);
        // Let onAuthStateChanged handle the logged-out state.
    }
}

export function signOut(onSignOutComplete: () => void) {
    // FIX: Use named import `signOut` directly.
    signOut(auth).then(() => {
        console.log("Firebase user signed out.");
        onSignOutComplete();
        // onAuthStateChanged will handle the rest of the cleanup.
    }).catch((error) => {
        console.error("Sign out failed", error);
    });
}

async function gapiWithAuthRefresh<T>(apiCall: () => Promise<T>): Promise<T> {
    try {
        if (!gapiAccessToken || !gapi.client.getToken()) {
            console.log("No GAPI token found, attempting to sign in.");
            // This will show a popup if the user is not signed in or session expired
            await signIn();
        }
        return await apiCall();
    } catch (error: any) {
        if (error?.result?.error?.code === 401 || error?.status === 401) {
            console.warn("API request failed with 401. Re-authenticating and retrying.");
            // Force re-authentication which will show a popup and get a new token.
            await signIn();
            return await apiCall(); // Retry the call with the new token
        }
        // Re-throw other errors
        throw error;
    }
}

async function getAppFolderId(): Promise<string> {
    if (appFolderId) {
        return appFolderId;
    }

    try {
        const response: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.list({
            q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'`,
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
        }));

        if (response.result.files && response.result.files.length > 0) {
            appFolderId = response.result.files[0].id;
            return appFolderId as string;
        } else {
            const fileMetadata = {
                'name': APP_FOLDER_NAME,
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': ['appDataFolder']
            };
            const file: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.create({
                resource: fileMetadata,
                fields: 'id'
            }));
            appFolderId = file.result.id;
            return appFolderId as string;
        }
    } catch (error) {
        handleGapiError(error, 'finding or creating app folder');
    }
}

export async function listSessions(): Promise<ChatSession[]> {
    try {
        const folderId = await getAppFolderId();
        const response: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
            pageSize: 1000
        }));
        
        const files = response.result.files || [];
        const sessionPromises = files.map(async (file: any) => {
            try {
                const contentResponse: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.get({
                    fileId: file.id,
                    alt: 'media'
                }));
                const sessionData = contentResponse.result as ChatSession;
                sessionData.driveFileId = file.id;
                return sessionData;
            } catch (error) {
                console.error(`Failed to fetch content for file ${file.name} (${file.id}):`, error);
                return null;
            }
        });

        const sessions = (await Promise.all(sessionPromises)).filter(Boolean) as ChatSession[];
        return sessions;
    } catch (error) {
        handleGapiError(error, 'listing chat sessions');
    }
}

export async function saveSession(session: ChatSession): Promise<ChatSession> {
    try {
        const folderId = await getAppFolderId();
        const fileName = `${session.id}.json`;
        const sessionToSave = { ...session };
        const fileId = sessionToSave.driveFileId;
        delete sessionToSave.driveFileId;

        const fileMetadata = {
            name: fileName,
            mimeType: 'application/json',
            ...(fileId ? {} : { parents: [folderId] })
        };

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const multipartRequestBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(fileMetadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(sessionToSave) +
          close_delim;
          
        const response: any = await gapiWithAuthRefresh(() => gapi.client.request({
            path: `/upload/drive/v3/files${fileId ? `/${fileId}` : ''}`,
            method: fileId ? 'PATCH' : 'POST',
            params: { uploadType: 'multipart' },
            headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
            body: multipartRequestBody
        }));
        
        session.driveFileId = response.result.id;
        return session;
    } catch (error) {
        handleGapiError(error, 'saving chat session');
    }
}

export async function deleteSession(driveFileId: string): Promise<void> {
    try {
        if (!driveFileId) {
            throw new Error("driveFileId is required to delete a session.");
        }
        await gapiWithAuthRefresh(() => gapi.client.drive.files.delete({
            fileId: driveFileId
        }));
    } catch (error) {
        handleGapiError(error, 'deleting chat session');
    }
}

let isPickerApiLoaded = false;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function getDriveFilePublicUrl(fileId: string): string {
    return `https://drive.google.com/thumbnail?id=${fileId}&key=${GOOGLE_API_KEY}`;
}

export async function downloadDriveFile(fileId: string): Promise<string> {
    const performFetch = async (accessToken: string) => {
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            const error: any = new Error(`HTTP Status: ${response.status}`);
            error.status = response.status;
            try { error.data = await response.json(); } catch (e) { /* Ignore parsing error */ }
            throw error;
        }
        return response;
    };

    try {
        // gapiWithAuthRefresh will ensure gapiAccessToken is valid before calling this
        const response = await gapiWithAuthRefresh(async () => {
             if (!gapiAccessToken) throw new Error("Access token not available for download.");
             return performFetch(gapiAccessToken)
        });
        const buffer = await response.arrayBuffer();
        return arrayBufferToBase64(buffer);
    } catch (error) {
        handleGapiError(error, `downloading file ${fileId}`);
    }
}

export async function updateDriveFileContent(fileId: string, newContent: string, mimeType: string): Promise<void> {
    try {
        await gapiWithAuthRefresh(() => gapi.client.request({
            path: `/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            headers: { 'Content-Type': mimeType },
            body: newContent
        }));
    } catch (error) {
        handleGapiError(error, `updating file content for ${fileId}`);
    }
}

export function showPicker(onFilesSelected: (files: any[]) => void, viewOptions?: { mimeTypes?: string }): void {
    const show = () => {
        if (!gapiAccessToken) {
            console.error("Cannot show picker: user is not signed in or token is unavailable.");
            signIn();
            return;
        }

        const view = new google.picker.View(google.picker.ViewId.DOCS);
        const mimeTypes = viewOptions?.mimeTypes || "image/png,image/jpeg,image/jpg,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        view.setMimeTypes(mimeTypes);

        const picker = new google.picker.PickerBuilder()
            .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
            .setAppId(GOOGLE_CLIENT_ID.split('-')[0])
            .setOAuthToken(gapiAccessToken)
            .addView(view)
            .addView(new google.picker.DocsUploadView())
            .setCallback((data: any) => {
                if (data.action === google.picker.Action.PICKED) {
                    onFilesSelected(data.docs);
                }
            })
            .build();
        picker.setVisible(true);
    };

    if (isPickerApiLoaded) {
        show();
    } else {
        gapi.load('picker', () => {
            isPickerApiLoaded = true;
            show();
        });
    }
}
