declare global {
  interface ImportMeta {
    readonly env: {
      [key: string]: any;
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
    subscriptionExpiresAt?: string | null; // NEW: For membership duration
    isModerator?: boolean; // NEW: For moderator status
    level?: number; // For user level
    exp?: number; // For user experience points
    points?: number; // For game portal points
    hasPermanentNameColor?: boolean; // For lucky wheel reward
    hasSakuraBanner?: boolean; // For lucky wheel reward
    aboutMe?: string; // For Chat Room user popover
}

// --- NEW TYPES FOR CHAT ROOM ---

export interface ChatRoomMessage {
  id: string;
  text: string;
  timestamp: number;
  user: {
    id: string;
    name: string;
    imageUrl: string;
    level?: number;
    isPro?: boolean;
    isModerator?: boolean;
    hasPermanentNameColor?: boolean;
    hasSakuraBanner?: boolean;
  };
}

export interface OnlineUser extends UserProfile {
  isOnline: boolean;
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

// --- NEW TYPES for MEMBERSHIP ---

export interface PaymentHistoryItem {
  date: string;
  amount: number;
  memo: string;
  status: 'Completed' | 'Pending' | 'Failed';
}

// --- NEW TYPES for MUSIC BOX ---
export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: string;
  url: string; // YouTube URL or other embeddable URL
  created_at?: string;
  avatar_drive_id?: string; // Drive ID for the spinning disc avatar
  background_drive_id?: string; // Drive ID for the player background
  is_favorite?: boolean; // True if the current user has favorited this song
}

// --- TYPES FOR TIEN LEN GAME ---

export enum CardSuit {
  SPADES = '♠',
  CLUBS = '♣',
  DIAMONDS = '♦',
  HEARTS = '♥',
}

export enum CardRank {
  THREE = '3', FOUR = '4', FIVE = '5', SIX = '6',
  SEVEN = '7', EIGHT = '8', NINE = '9', TEN = '10',
  JACK = 'J', QUEEN = 'Q', KING = 'K', ACE = 'A', TWO = '2',
}

export interface TienLenCard {
  id: string;
  rank: CardRank;
  suit: CardSuit;
  value: number;
  isSelected: boolean;
}

export type PlayerHand = TienLenCard[];

export enum TienLenHandType {
  INVALID = 'INVALID',
  SINGLE = 'SINGLE',
  PAIR = 'PAIR',
  TRIPLE = 'TRIPLE',
  STRAIGHT = 'STRAIGHT', // Sảnh
  FOUR_OF_A_KIND = 'FOUR_OF_A_KIND', // Tứ Quý
  THREE_PAIR_STRAIGHT = 'THREE_PAIR_STRAIGHT', // Ba Đôi Thông
}

export interface ValidatedHand {
  type: TienLenHandType;
  cards: TienLenCard[];
  rankValue: number; // Highest card value for comparison
  suitValue?: number; // For single card comparison
  length?: number; // For straights
}

export interface Turn {
  player: 'player' | 'ai';
  playedCards: ValidatedHand | null;
  passed: boolean;
}

export interface TienLenGameState {
  playerHand: PlayerHand;
  aiHand: PlayerHand;
  table: TienLenCard[];
  lastPlayedHand: ValidatedHand | null;
  currentPlayer: 'player' | 'ai';
  turnHistory: Turn[];
  winner: 'player' | 'ai' | null;
  isDealing: boolean;
  statusMessage: string;
  playerScore: number;
  aiScore: number;
  turnTimer: number;
  isPaused: boolean;
  firstPlayerOfTheGame: 'player' | 'ai' | null;
  isFirstTurnOfGame: boolean;
}

export interface TienLenGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  handlePointsGain: (amount: number) => void;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}
