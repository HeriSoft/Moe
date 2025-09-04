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
  isLocked?: boolean; // True if the chat history is too large to send to the API
}

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    imageUrl: string;
    isPro?: boolean; // To track membership status
}

// --- NEW TYPES FOR VIDEO CINEMA ---

export interface MovieEpisode {
  id?: string;
  episode_number: number;
  title?: string;
  video_drive_id: string;
}

export interface Movie {
  id: string;
  title: string;
  description: string;
  actors: string;
  thumbnail_drive_id: string;
  episodes: MovieEpisode[];
  created_at?: string;
}

// --- NEW TYPES FOR FILES LIBRARY ---

export interface FilePart {
  id?: string;
  part_number: number;
  part_name?: string;
  download_url: string;
}

export interface FileItem {
  id: string;
  name: string;
  version?: string;
  icon_drive_id?: string;
  tags: string[];
  is_vip: boolean;
  download_count: number;
  vip_unlock_info?: string;
  created_at?: string;
  updated_at?: string;
  parts: FilePart[];
}
