export interface Attachment {
  data: string; // base64 encoded data
  mimeType: string;
  fileName: string; 
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  isFavorite?: boolean;
  persona?: string; // Key for the selected persona
}