// FIX: Manually define the type for import.meta.env to satisfy TypeScript
// in environments where "vite/client" types might not be automatically resolved.
// This removes the <reference> directive that was causing a "file not found"
// error and fixes subsequent errors about the 'env' property.
interface ImportMeta {
  readonly env: {
    readonly VITE_GOOGLE_CLIENT_ID: string;
    readonly VITE_GOOGLE_API_KEY: string;
  };
}

import type { ChatSession, UserProfile } from '../types';

// Use Vite's import.meta.env to access environment variables on the client-side
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;


const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
// Using appDataFolder scope for privacy, the app can only access its own folder.
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const APP_FOLDER_NAME = 'Moe Chat Data';

let gapi: any = null;
let google: any = null;
let tokenClient: any = null;
let appFolderId: string | null = null;

/**
 * Initializes the Google API client.
 * This function now assumes gapi and google scripts are loaded from index.html
 * @param onAuthChange Callback function to update authentication status in the app.
 */
export async function initClient(onAuthChange: (isLoggedIn: boolean, userProfile?: UserProfile) => void) {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
        console.error("VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_API_KEY is not set in your .env.local file.");
        alert("Configuration Error: Google Client ID or API Key is missing. The application cannot start. Please check your .env.local file and the console for more details.");
        return;
    }
    
    // Wait for the global gapi object to be available from the script tag
    const gapiLoadPromise = new Promise<void>(resolve => {
        const interval = setInterval(() => {
            if ((window as any).gapi) {
                clearInterval(interval);
                gapi = (window as any).gapi;
                resolve();
            }
        }, 100);
    });

    const gisLoadPromise = new Promise<void>(resolve => {
        const interval = setInterval(() => {
            if ((window as any).google) {
                clearInterval(interval);
                google = (window as any).google;
                resolve();
            }
        }, 100);
    });
    
    await Promise.all([gapiLoadPromise, gisLoadPromise]);

    await new Promise<void>((resolve, reject) => {
        // gapi.load('client') is the modern way to do this
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: GOOGLE_API_KEY,
                    discoveryDocs: DISCOVERY_DOCS,
                });
                
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: SCOPES,
                    callback: async (tokenResponse: any) => {
                        if (tokenResponse.error) {
                            console.error('Token client error:', tokenResponse.error);
                            return;
                        }
                        gapi.client.setToken(tokenResponse);
                        
                        // After getting a token, get user profile
                        const profileResponse = await gapi.client.oauth2.userinfo.get();
                        const profile = profileResponse.result;
                        const userProfile: UserProfile = {
                            id: profile.id,
                            name: profile.name,
                            email: profile.email,
                            imageUrl: profile.picture,
                        };
                        onAuthChange(true, userProfile);
                    },
                });

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    });
}


/**
 * Triggers the Google Sign-In flow.
 */
export function signIn() {
    if (!tokenClient) {
        console.error("Google Auth client is not initialized.");
        return;
    }
    // Prompt the user to select a Google Account and ask for consent to share their data
    // when establishing a new session.
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

/**
 * Signs the user out.
 */
export function signOut(onAuthChange: (isLoggedIn: boolean) => void) {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            appFolderId = null; // Clear cached folder ID
            onAuthChange(false);
        });
    }
}


/**
 * Finds or creates the dedicated app folder in the user's Google Drive appDataFolder.
 * Caches the folder ID for the session to avoid repeated lookups.
 * @returns {Promise<string>} The ID of the app folder.
 */
async function getAppFolderId(): Promise<string> {
    if (appFolderId) {
        return appFolderId;
    }

    const response = await gapi.client.drive.files.list({
        q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'`,
        spaces: 'appDataFolder',
        fields: 'files(id, name)',
    });

    if (response.result.files && response.result.files.length > 0) {
        appFolderId = response.result.files[0].id;
        return appFolderId as string;
    } else {
        const fileMetadata = {
            'name': APP_FOLDER_NAME,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': ['appDataFolder']
        };
        const file = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        appFolderId = file.result.id;
        return appFolderId as string;
    }
}

/**
 * Lists all chat session files from the app folder in Google Drive.
 * @returns {Promise<ChatSession[]>} A list of chat sessions.
 */
export async function listSessions(): Promise<ChatSession[]> {
    const folderId = await getAppFolderId();
    const response = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1000 // Max 1000 files
    });
    
    const files = response.result.files || [];
    const sessionPromises = files.map(async (file: any) => {
        try {
            const contentResponse = await gapi.client.drive.files.get({
                fileId: file.id,
                alt: 'media'
            });
            const sessionData = contentResponse.result as ChatSession;
            // Attach the driveFileId for future updates/deletes
            sessionData.driveFileId = file.id;
            return sessionData;
        } catch (error) {
            console.error(`Failed to fetch content for file ${file.name} (${file.id}):`, error);
            return null; // Return null for failed fetches
        }
    });

    const sessions = (await Promise.all(sessionPromises)).filter(Boolean) as ChatSession[];
    return sessions;
}


/**
 * Saves a chat session (creates or updates) to Google Drive.
 * @param session The chat session object to save.
 * @returns The session object with the `driveFileId` updated.
 */
export async function saveSession(session: ChatSession): Promise<ChatSession> {
    const folderId = await getAppFolderId();
    const fileName = `${session.id}.json`;

    // Create a copy to avoid mutating the original object before saving
    const sessionToSave = { ...session };
    const fileId = sessionToSave.driveFileId;
    delete sessionToSave.driveFileId; // Don't save the drive ID inside the file content

    const fileMetadata = {
        name: fileName,
        mimeType: 'application/json',
        ...(fileId ? {} : { parents: [folderId] }) // Only specify parent on creation
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
      
    const request = gapi.client.request({
        path: `/upload/drive/v3/files${fileId ? `/${fileId}` : ''}`,
        method: fileId ? 'PATCH' : 'POST',
        params: { uploadType: 'multipart' },
        headers: {
            'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody
    });
    
    const response = await request;
    session.driveFileId = response.result.id; // Update the original session object
    return session;
}


/**
 * Deletes a chat session file from Google Drive.
 * @param driveFileId The unique Google Drive file ID.
 */
export async function deleteSession(driveFileId: string): Promise<void> {
    if (!driveFileId) {
        throw new Error("driveFileId is required to delete a session.");
    }
    await gapi.client.drive.files.delete({
        fileId: driveFileId
    });
}
