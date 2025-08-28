export interface Attachment {
  data: string; // base64 encoded data
  mimeType: string;
  fileName: string; 
  driveFileId?: string; // Google Drive's unique file ID
}

// NEW: Define the structure for a single web search source
export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}


export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  attachments?: Attachment[];
  sourceDriveFileId?: string; // The Drive file ID that was the source for this message
  sourceDriveFileName?: string; // The name of the source Drive file
  sourceDriveFileMimeType?: string; // The MIME type of the source Drive file
  groundingMetadata?: GroundingChunk[]; // To store web search sources
}

export interface ChatSession {
  id: string; // Internal app ID, also used as filename
  driveFileId?: string; // Google Drive's unique file ID
  title: string;
  messages: Message[];
  model: string;
  isFavorite?: boolean;
  persona?: string; // Key for the selected persona
}

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    imageUrl: string;
}