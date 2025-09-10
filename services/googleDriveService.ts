// FIX: Augment the global ImportMeta type to include Vite's environment variables.
// This resolves TypeScript errors about `import.meta.env` when the standard
// `vite/client` types are not being picked up automatically.
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_GOOGLE_CLIENT_ID: string;
      readonly VITE_GOOGLE_API_KEY: string;
    };
  }
}

import type { ChatSession, UserProfile } from '../types';
import { fetchUserProfileAndLogLogin } from './geminiService';

// Use Vite's import.meta.env to access environment variables on the client-side
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;


const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
// FIX: Request full drive scope. The 'drive.file' scope is insufficient for PATCHing
// arbitrary files selected by the user via the picker, leading to 403 errors.
// The 'drive' scope allows the app to modify any file the user has granted access to.
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive';
const APP_FOLDER_NAME = 'Moe Chat Data';

let gapi: any = null;
let google: any = null;
let tokenClient: any = null;
let appFolderId: string | null = null;

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
 * Initializes the Google API client.
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
                    console.log("Initializing gapi client...");
                    await gapi.client.init({
                        apiKey: GOOGLE_API_KEY,
                        discoveryDocs: DISCOVERY_DOCS,
                    });
                    console.log("Gapi client initialized successfully.");

                    const updateUserStatus = async () => {
                        const token = gapi.client.getToken();
                        if (token === null || !token.access_token) {
                            console.log("User is not signed in or token is missing.");
                            onAuthChange(false);
                            return;
                        }

                        console.log("User has a token. Fetching profile via direct fetch...");
                        try {
                            const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                headers: { 'Authorization': `Bearer ${token.access_token}` }
                            });

                            if (!profileResponse.ok) {
                                throw new Error(`User info fetch failed with status: ${profileResponse.status}`);
                            }

                            const googleProfile = await profileResponse.json();

                            if (!googleProfile || !googleProfile.sub) {
                                console.warn("Token exists but userinfo is empty. Signing out.");
                                signOut(() => onAuthChange(false));
                                return;
                            }
                            
                            const basicUserProfile: UserProfile = {
                                id: googleProfile.sub,
                                name: googleProfile.name,
                                email: googleProfile.email,
                                imageUrl: googleProfile.picture,
                            };
                            
                            // Fetch full profile from our DB to get membership status etc.
                            const fullProfile = await fetchUserProfileAndLogLogin(basicUserProfile);

                            console.log("Full profile fetched successfully:", fullProfile.name);
                            onAuthChange(true, fullProfile);
                        } catch (error) {
                            console.error("Error fetching user info for existing session, signing out:", error);
                            signOut(() => onAuthChange(false));
                        }
                    };
                    
                    console.log("Initializing token client...");
                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: GOOGLE_CLIENT_ID,
                        scope: SCOPES,
                        callback: (tokenResponse: any) => {
                            if (tokenResponse.error) {
                                console.error('Token client error:', tokenResponse);
                                onAuthChange(false);
                                return;
                            }
                            console.log("Access token received from sign-in flow.");
                            gapi.client.setToken(tokenResponse);
                            updateUserStatus();
                        },
                    });
                    console.log("Token client initialized successfully.");
                    
                    await updateUserStatus();
                    
                    resolve();
                } catch (error: any) {
                    if (error && typeof error === 'object' && 'result' in error) {
                        const errorResult = (error as any).result?.error;
                        if (errorResult && errorResult.message && errorResult.message.includes('API not found')) {
                             reject(new Error("API discovery response missing required fields. Ensure 'Google Drive API' and 'Google People API' are enabled in your Google Cloud project."));
                             return;
                        }
                    }
                    reject(error);
                }
            });
        });

        console.log("Google Drive service initialization complete.");

    } catch (error) {
        console.error("Fatal error during Google service initialization:", error);
        onAuthChange(false);
    }
}


export function signIn() {
    console.log("signIn function called.");
    if (!tokenClient) {
        console.error("Cannot sign in: Google Auth client (tokenClient) is not initialized.");
        alert("Sign-in service is not ready. Please check the console for errors.");
        return;
    }
    
    console.log("Requesting access token...");
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

export function signOut(onSignOutComplete: () => void) {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            appFolderId = null;
            onSignOutComplete();
            console.log("User signed out and token revoked.");
        });
    } else {
        onSignOutComplete();
        console.log("No user was signed in.");
    }
}

function refreshToken(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            return reject(new Error("Token client not initialized."));
        }
        console.log("Attempting to silently refresh access token...");

        const originalCallback = tokenClient.callback;
        
        tokenClient.callback = (tokenResponse: any) => {
            tokenClient.callback = originalCallback;
            if (tokenResponse.error) {
                console.error("Token refresh failed:", tokenResponse);
                reject(new Error("Session expired. Please sign in again."));
                return;
            }
            console.log("Token refreshed successfully via temporary callback.");
            gapi.client.setToken(tokenResponse);
            resolve();
        };
        
        tokenClient.requestAccessToken({ prompt: 'none' });
    });
}

async function gapiWithAuthRefresh<T>(apiCall: () => Promise<T>): Promise<T> {
    try {
        return await apiCall();
    } catch (error: any) {
        if (error?.result?.error?.code === 401 || error?.status === 401) {
            console.warn("API request failed with 401. Refreshing token and retrying.");
            try {
                await refreshToken();
                return await apiCall();
            } catch (refreshError) {
                console.error("Failed to refresh token or retry the request:", refreshError);
                throw new Error("Your session has expired and could not be renewed. Please sign in again.");
            }
        }
        throw error;
    }
}

async function getAppFolderId(): Promise<string> {
    if (appFolderId) {
        return appFolderId;
    }

    try {
        const response: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.list({ // <-- SỬA 1
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
            const file: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.create({ // <-- SỬA 2
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
        const response: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.list({ // <-- SỬA 3
            q: `'${folderId}' in parents and trashed=false`,
            spaces: 'appDataFolder',
            fields: 'files(id, name)',
            pageSize: 1000
        }));
        
        const files = response.result.files || [];
        const sessionPromises = files.map(async (file: any) => {
            try {
                const contentResponse: any = await gapiWithAuthRefresh(() => gapi.client.drive.files.get({ // <-- SỬA 4
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
          
        const response: any = await gapiWithAuthRefresh(() => gapi.client.request({ // <-- SỬA 5
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
    // FIX: Use the /uc endpoint for more reliable public image embedding.
    // NOTE: The underlying file in Google Drive MUST be shared publicly
    // ("Anyone with the link can view") for this URL to work for all users.
    return `https://drive.google.com/uc?id=${fileId}`;
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
        let token = gapi.client.getToken();
        if (!token || !token.access_token) {
            throw new Error("Cannot download file: User is not authenticated.");
        }

        try {
            const response = await performFetch(token.access_token);
            const buffer = await response.arrayBuffer();
            return arrayBufferToBase64(buffer);
        } catch (error: any) {
            if (error.status === 401) {
                console.warn("Download fetch failed with 401. Refreshing token and retrying.");
                await refreshToken();
                const newToken = gapi.client.getToken();
                if (!newToken || !newToken.access_token) {
                    throw new Error("Failed to get new token for download.");
                }
                const retryResponse = await performFetch(newToken.access_token);
                const buffer = await retryResponse.arrayBuffer();
                return arrayBufferToBase64(buffer);
            }
            throw error;
        }
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
        const token = gapi.client.getToken();
        if (!token) {
            console.error("Cannot show picker: user is not signed in.");
            signIn();
            return;
        }

        const view = new google.picker.View(google.picker.ViewId.DOCS);
        const mimeTypes = viewOptions?.mimeTypes || "image/png,image/jpeg,image/jpg,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        view.setMimeTypes(mimeTypes);

        const picker = new google.picker.PickerBuilder()
            .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
            .setAppId(GOOGLE_CLIENT_ID.split('-')[0])
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
