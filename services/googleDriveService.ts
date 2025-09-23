import type { ChatSession, UserProfile } from '../types';
import { fetchUserProfileAndLogLogin } from './geminiService';
// NEW: Import Firebase services and types for unified authentication
import { auth, signInWithGoogle, signOut as firebaseSignOut } from './firebaseService';
import { onAuthStateChanged, User } from 'firebase/auth';


const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const APP_FOLDER_NAME = 'Moe Chat Data';

let gapi: any = null;
let appFolderId: string | null = null;
const imageDataCache = new Map<string, string>();
let onAuthChangeCallback: ((isLoggedIn: boolean, userProfile?: UserProfile) => void) | null = null;
let gapiInitialized = false; 

/**
 * Inspects a GAPI error object and throws a more user-friendly error.
 */
const handleGapiError = (error: any, context: string): never => {
    console.error(`GAPI Error during ${context}:`, error);
    const errorDetails = error?.result?.error || error?.data?.error;
    if (errorDetails) {
        if ((errorDetails.status === 'PERMISSION_DENIED' || errorDetails.code === 403) && errorDetails.message?.toLowerCase().includes('drive api has not been used')) {
            throw new Error("Google Drive API is not enabled. Please visit your Google Cloud Console and enable the 'Google Drive API' for this project.");
        }
        throw new Error(`Google Drive Error: ${errorDetails.message} (Code: ${errorDetails.code})`);
    }
    throw new Error(error.message || `An unknown error occurred during ${context}.`);
};

/**
 * Ensures a valid GAPI access token is available, re-authenticating if necessary.
 * This function is the core of the new token management strategy.
 */
async function ensureGapiToken(): Promise<void> {
    if (!gapi) throw new Error("GAPI not loaded.");

    const token = gapi.client.getToken();
    // A simple check for existence is enough; GAPI handles expiry under the hood, but re-auth will fix it if it fails.
    if (token && token.access_token) {
        return;
    }

    console.log("GAPI token missing or invalid, re-authenticating with Firebase...");
    try {
        const { accessToken } = await signInWithGoogle();
        gapi.client.setToken({ access_token: accessToken });
        console.log("GAPI token refreshed successfully via Firebase popup.");
    } catch (error) {
        console.error("Failed to re-authenticate for GAPI token:", error);
        await signOutFromApp(); // Sign out to clear the bad state
        throw new Error("Your session has expired. Please sign in again.");
    }
}

/**
 * A wrapper for all GAPI calls that ensures authentication is valid before execution.
 */
async function gapiWithAuthRefresh<T>(apiCall: () => Promise<T>): Promise<T> {
    try {
        await ensureGapiToken();
        return await apiCall();
    } catch (error) {
        // Rethrow the error to be handled by the caller, after logging it via handleGapiError
        handleGapiError(error, 'GAPI call');
    }
}

/**
 * Initializes the GAPI client and listens for Firebase authentication state changes.
 */
export async function initClient(
    onAuthChange: (isLoggedIn: boolean, userProfile?: UserProfile) => void
) {
    onAuthChangeCallback = onAuthChange;

    const gapiLoadPromise = new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(() => {
            if ((window as any).gapi) {
                clearInterval(interval);
                gapi = (window as any).gapi;
                resolve();
            } else if (++attempts > 50) {
                clearInterval(interval);
                reject(new Error("Failed to load Google API (gapi) library."));
            }
        }, 100);
    });
    
    await gapiLoadPromise;

    if (!gapiInitialized) {
        await new Promise<void>((resolve) => {
            gapi.load('client', async () => {
                await gapi.client.init({
                    discoveryDocs: DISCOVERY_DOCS,
                });
                gapiInitialized = true;
                resolve();
            });
        });
    }

    onAuthStateChanged(auth, async (user: User | null) => {
        if (user) {
            console.log("Firebase user detected:", user.displayName);
            const basicUserProfile: UserProfile = {
                id: user.uid,
                name: user.displayName || 'User',
                email: user.email || '',
                imageUrl: user.photoURL || '',
            };
            const fullProfile = await fetchUserProfileAndLogLogin(basicUserProfile);
            onAuthChangeCallback?.(true, fullProfile);
        } else {
            console.log("No Firebase user detected.");
            if (gapi?.client) gapi.client.setToken('');
            appFolderId = null;
            imageDataCache.clear();
            onAuthChangeCallback?.(false);
        }
    });
}

/**
 * Starts the sign-in process using the Firebase popup.
 */
export async function signIn() {
    try {
        const { accessToken } = await signInWithGoogle();
        gapi.client.setToken({ access_token: accessToken });
        // The onAuthStateChanged listener will handle UI updates.
    } catch (error) {
        console.error("Sign-in process failed:", error);
        onAuthChangeCallback?.(false); // Ensure UI reflects failed login
    }
}

/**
 * Signs the user out of Firebase.
 */
export async function signOutFromApp(onSignOutComplete?: () => void) {
    try {
        await firebaseSignOut();
        console.log("Firebase sign out successful.");
    } catch (error) {
        console.error("Firebase sign out error:", error);
    } finally {
        if (onSignOutComplete) onSignOutComplete();
    }
}

async function getAppFolderId(): Promise<string> {
    if (appFolderId) return appFolderId;

    const response: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.list({
        q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'`,
        spaces: 'appDataFolder',
        fields: 'files(id, name)',
    }));

    if (response.result.files && response.result.files.length > 0) {
        appFolderId = response.result.files[0].id;
        return appFolderId as string;
    } else {
        const fileMetadata = { name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: ['appDataFolder'] };
        const file: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' }));
        appFolderId = file.result.id;
        return appFolderId as string;
    }
}

export async function listSessions(): Promise<ChatSession[]> {
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
            const contentResponse: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.get({ fileId: file.id, alt: 'media' }));
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
}

export async function saveSession(session: ChatSession): Promise<ChatSession> {
    const folderId = await getAppFolderId();
    const fileName = `${session.id}.json`;
    const sessionToSave = { ...session };
    const fileId = sessionToSave.driveFileId;
    delete sessionToSave.driveFileId;

    const fileMetadata = { name: fileName, mimeType: 'application/json', ...(fileId ? {} : { parents: [folderId] }) };

    const boundary = '-------314159265358979323846';
    const multipartRequestBody = `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(fileMetadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(sessionToSave)}\r\n--${boundary}--`;
      
    const response: any = await gapiWithAuthRefresh(() => gapi.client.request({
        path: `/upload/drive/v3/files${fileId ? `/${fileId}` : ''}`,
        method: fileId ? 'PATCH' : 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body: multipartRequestBody
    }));
    
    session.driveFileId = response.result.id;
    return session;
}

export async function deleteSession(driveFileId: string): Promise<void> {
    if (!driveFileId) throw new Error("driveFileId is required to delete a session.");
    await gapiWithAuthRefresh(() => gapi.client.drive.files.delete({ fileId: driveFileId }));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export async function getDriveImageAsDataUrl(fileId: string): Promise<string> {
    if (imageDataCache.has(fileId)) {
        return imageDataCache.get(fileId)!;
    }
    const metaResponse: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.get({ fileId: fileId, fields: 'mimeType' }));
    const mimeType = metaResponse.result.mimeType;
    if (!mimeType || !mimeType.startsWith('image/')) throw new Error('File is not a valid image type.');
    const base64Content = await downloadDriveFile(fileId);
    const dataUrl = `data:${mimeType};base64,${base64Content}`;
    imageDataCache.set(fileId, dataUrl);
    return dataUrl;
}

export async function downloadDriveFile(fileId: string): Promise<string> {
    const response = await gapiWithAuthRefresh(() => gapi.client.drive.files.get({ fileId: fileId, alt: 'media' }));
    // GAPI client with fetch doesn't return a buffer directly in the same way.
    // Assuming response.body is a string for JSON or needs conversion for binary.
    // For media downloads, the result is typically the raw content.
    const rawResult = (response as any).body; // The raw response body string
    // This is tricky because GAPI's response might not be a clean ArrayBuffer.
    // Let's switch to a direct fetch call within the authorized wrapper for binary data.
    const token = gapi.client.getToken();
    if (!token) throw new Error("Not authenticated.");
    
    const fetchResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token.access_token}` }
    });
    if (!fetchResponse.ok) throw new Error(`Failed to download file: ${fetchResponse.statusText}`);
    const buffer = await fetchResponse.arrayBuffer();
    return arrayBufferToBase64(buffer);
}

export async function updateDriveFileContent(fileId: string, newContent: string, mimeType: string): Promise<void> {
    await gapiWithAuthRefresh(() => gapi.client.request({
        path: `/upload/drive/v3/files/${fileId}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        headers: { 'Content-Type': mimeType },
        body: newContent
    }));
}

// FIX: Refactored showPicker to be async and throw errors, which allows callers to handle them gracefully.
// This resolves the "Cannot find name 'setNotifications'" error by decoupling the service from UI state.
export async function showPicker(onFilesSelected: (files: any[]) => void, viewOptions?: { mimeTypes?: string }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("gapi.load timed out")), 5000);
        gapi.load('picker', () => {
            clearTimeout(timeout);
            resolve();
        });
    });

    const google = (window as any).google;
    if (!google || !google.picker) {
        throw new Error("Google Picker API is not available.");
    }

    const token = gapi.client.getToken();
    if (!token?.access_token) {
        // Trigger sign-in if token is missing. The user will need to click the button again.
        signIn();
        throw new Error("Your session has expired. Please sign in again and retry.");
    }

    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes(viewOptions?.mimeTypes || "image/png,image/jpeg,application/pdf,text/plain");

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(token.access_token)
        .addView(view)
        .addView(new google.picker.DocsUploadView())
        .setCallback((data: any) => {
            if (data.action === google.picker.Action.PICKED) {
                onFilesSelected(data.docs);
            }
        })
        .build();
    picker.setVisible(true);
}
