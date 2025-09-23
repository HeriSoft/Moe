import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { LoginModal } from './components/LoginModal';
import { GamePortalModal } from './components/GamePortalModal'; 
import { WelcomeModal } from './components/WelcomeModal'; 
import { GenerationModal } from './components/GenerationModal';
import { MediaGalleryModal } from './components/MediaGalleryModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { AdminMovieModal } from './components/AdminMovieModal';
import { VideoCinemaModal } from './components/VideoCinemaModal';
import { MembershipModal } from './components/MembershipModal';
import { MembershipManagementModal } from './components/MembershipManagementModal'; 
import { FilesLibraryModal } from './components/FilesLibraryModal'; 
import { AdminFilesLibraryModal } from './components/AdminFilesLibraryModal'; 
import { MusicBoxModal } from './components/MusicBoxModal'; 
import { AdminMusicModal } from './components/AdminMusicModal'; 
import { ChatRoomModal } from './components/ChatRoomModal';
import * as firebaseService from './services/firebaseService';
import {
  streamModelResponse,
  addExp,
  addPoints
} from './services/geminiService';
import * as googleDriveService from './services/googleDriveService';
import { AcademicCapIcon, UserCircleIcon, CodeBracketIcon, SparklesIcon, InformationCircleIcon } from './components/icons';
import type { ChatSession, Message, Attachment, UserProfile, Song } from './types';

const MAX_FILES = 4;
const MAX_IMAGE_FILES = 1;
const ADMIN_EMAIL = 'heripixiv@gmail.com';
const PAYLOAD_SIZE_LIMIT = 4 * 1024 * 1024; // 4 MB safety buffer

const PERSONAS: { [key: string]: { name: string; icon: React.FC<any>; prompt: string; description: string; } } = {
  default: {
    name: 'Default Assistant',
    icon: UserCircleIcon,
    prompt: 'You are a helpful, friendly, and knowledgeable AI assistant.',
    description: 'A standard, helpful AI assistant.'
  },
  creative: {
    name: 'Creative Writer',
    icon: SparklesIcon,
    prompt: 'You are a creative writer and storyteller. Your responses should be imaginative, descriptive, and engaging. Weave compelling narratives and use vivid language.',
    description: 'For brainstorming, storytelling, and creative tasks.'
  },
  programmer: {
    name: 'Code Expert',
    icon: CodeBracketIcon,
    prompt: 'You are an expert programmer specializing in modern web development. Provide clean, efficient, and well-documented code. Explain complex concepts clearly and offer best practices.',
    description: 'Get help with coding, debugging, and software design.'
  },
  tutor: {
    name: 'Academic Tutor',
    icon: AcademicCapIcon,
    prompt: 'You are an experienced academic tutor. Your goal is to help users understand complex subjects by breaking them down into simple, easy-to-digest concepts. Use analogies, ask guiding questions, and be patient and encouraging.',
    description: 'Explains complex topics in a simple way.'
  }
};

const getYouTubeVideoId = (url: string | undefined): string | null => {
    if (!url) return null;
    let videoId: string | null = null;
    const patterns = [
        /(?:https?:\/\/(?:www\.)?)?youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)([\w-]{11})/,
        /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            videoId = match[1];
            break;
        }
    }
    return videoId;
};


const App: React.FC = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isGamePortalOpen, setIsGamePortalOpen] = useState(false); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [isDeepThinkEnabled, setIsDeepThinkEnabled] = useState(false);
  const [chatBgColor, setChatBgColor] = useState('#212133');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  
  // --- New Auth & Data State ---
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>();
  const sessionsRef = useRef(chatSessions);

  // --- New Admin & Membership State ---
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAdminMovieModalOpen, setIsAdminMovieModalOpen] = useState(false);
  const [isVideoCinemaModalOpen, setIsVideoCinemaModalOpen] = useState(false);
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  const [isMembershipManagementOpen, setIsMembershipManagementOpen] = useState(false); 
  const [isFilesLibraryOpen, setIsFilesLibraryOpen] = useState(false); 
  const [isAdminFilesLibraryOpen, setIsAdminFilesLibraryOpen] = useState(false); 
  const [isAdminMusicOpen, setIsAdminMusicOpen] = useState(false); 
  const [siteSettings, setSiteSettings] = useState<{ logoDriveId?: string | null }>({});


  // --- New Music Box State ---
  const [musicBoxState, setMusicBoxState] = useState<'closed' | 'open' | 'minimized'>('closed');
  const [songs, setSongs] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMusicLoading, setIsMusicLoading] = useState(false);
  const playerRef = useRef<any>(null); // For YouTube Player instance
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [musicSearchTerm, setMusicSearchTerm] = useState('');
  const [musicActiveGenre, setMusicActiveGenre] = useState('all');

  // --- NEW Chat Room State ---
  const [chatRoomState, setChatRoomState] = useState<'closed' | 'open' | 'minimized'>('closed');

  
  // --- New Unified Generation Modal State ---
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

  // --- New Welcome Modal State ---
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(() => {
    return !localStorage.getItem('hasVisitedMoeChat');
  });

  useEffect(() => {
    sessionsRef.current = chatSessions;
  }, [chatSessions]);


  // New state for new features
  const [promptForNewChat, setPromptForNewChat] = useState<string | null>(null);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);

  const loadChatsFromDrive = useCallback(async () => {
    setIsLoading(true);
    try {
        const sessions = await googleDriveService.listSessions();
        setChatSessions(sessions);
        if (sessions.length > 0) {
            const lastActiveId = localStorage.getItem('activeChatId');
            const sessionExists = lastActiveId && sessions.some(s => s.id === lastActiveId);
            setActiveChatId(sessionExists ? lastActiveId : sessions[0].id);
        } else {
            setActiveChatId(null);
        }
    } catch (error) {
        console.error("Failed to load chats from Drive:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while loading chats.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    } finally {
        setIsLoading(false);
    }
  }, []);

  // Define the authentication handler using useCallback to prevent stale closures
  const handleAuthChange = useCallback((loggedIn: boolean, profile?: UserProfile) => {
      setIsLoggedIn(loggedIn);
      if (loggedIn && profile) {
          setUserProfile(profile);
          loadChatsFromDrive();
      } else {
          setUserProfile(undefined);
          setChatSessions([]); // Clear sessions on logout
          setActiveChatId(null);
      }
      setIsAuthReady(true);
  }, [loadChatsFromDrive]);


  const fetchSiteSettings = useCallback(async () => {
    try {
        const response = await fetch('/api/admin?action=get_site_settings');
        if (response.ok) {
            const data = await response.json();
            setSiteSettings(data || {});
        }
    } catch (error) {
        console.error("Failed to fetch site settings:", error);
    }
  }, []);

  // --- Initialization Effect ---
  useEffect(() => {
    // Load local-only settings first
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setIsDarkMode(savedTheme === 'dark');
    } else {
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    const savedChatBg = localStorage.getItem('chatBgColor');
    if (savedChatBg) setChatBgColor(savedChatBg);
    const savedModel = localStorage.getItem('defaultModel');
    if (savedModel) setModel(savedModel);

    fetchSiteSettings();
    // Initialize Google Drive Service
    googleDriveService.initClient(handleAuthChange);
  }, [handleAuthChange, fetchSiteSettings]);
  
  // Save active chat ID to localStorage whenever it changes
  useEffect(() => {
    if (activeChatId) {
        localStorage.setItem('activeChatId', activeChatId);
    } else {
        localStorage.removeItem('activeChatId');
    }
  }, [activeChatId]);


  // Save model and background color to localStorage
  useEffect(() => {
    localStorage.setItem('defaultModel', model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem('chatBgColor', chatBgColor);
  }, [chatBgColor]);

  // Handle theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // When the default model changes via settings, update the active chat to use it silently.
  useEffect(() => {
    if (!activeChatId || !isLoggedIn) return;

    const currentActiveChat = sessionsRef.current.find(s => s.id === activeChatId);

    if (currentActiveChat && currentActiveChat.model !== model) {
      const updatedChat = {
        ...currentActiveChat,
        model: model,
      };

      googleDriveService.saveSession(updatedChat).then(savedChat => {
         setChatSessions(prev => prev.map(s => s.id === activeChatId ? savedChat : s));
      }).catch(err => {
         console.error("Failed to save session on model change:", err);
         setNotifications(prev => ["Failed to update model.", ...prev.slice(0, 19)]);
      });
    }
  }, [model, activeChatId, isLoggedIn]);
  
  const handleExpGain = useCallback(async (amount: number) => {
    if (!isLoggedIn || !userProfile) return;

    try {
        const { level, exp } = await addExp(amount, userProfile);
        setUserProfile(prev => prev ? { ...prev, level, exp } : undefined);
    } catch (error) {
        console.error("Failed to update EXP:", error);
        // Do not notify the user, this is a background process.
    }
  }, [isLoggedIn, userProfile]);

  const handlePointsGain = useCallback(async (amount: number) => {
    if (!isLoggedIn || !userProfile) return;

    // Optimistic update
    setUserProfile(prev => prev ? { ...prev, points: Math.max(0, (prev.points || 0) + amount) } : undefined);

    try {
        const { points } = await addPoints(amount, userProfile);
        // Sync with server state
        setUserProfile(prev => prev ? { ...prev, points } : undefined);
    } catch (error) {
        console.error("Failed to update points:", error);
        // Revert optimistic update on failure
        setUserProfile(prev => prev ? { ...prev, points: Math.max(0, (prev.points || 0) - amount) } : undefined);
        setNotifications(prev => ["Could not sync points with server.", ...prev.slice(0,19)]);
    }
  }, [isLoggedIn, userProfile, setNotifications]);

  const startNewChat = useCallback(async (): Promise<string | null> => {
    if (!isLoggedIn) {
        setIsLoginModalOpen(true);
        return null;
    }
    const newChat: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [{ role: 'model', text: 'Hello! How can I help you today?', timestamp: Date.now() }],
      model: model,
      isFavorite: false,
      persona: 'default',
    };
    
    try {
        const savedChat = await googleDriveService.saveSession(newChat);
        setChatSessions(prev => [savedChat, ...prev]);
        setActiveChatId(savedChat.id);
        setIsSidebarOpen(false);
        return savedChat.id;
    } catch (error) {
        console.error("Failed to start new chat:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not create new chat.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
        return null;
    }
  }, [model, isLoggedIn]);
  
  const startChatWithPrompt = useCallback(async (prompt: string) => {
      if (!isLoggedIn) {
          setIsLoginModalOpen(true);
          return;
      }
      const newChatId = await startNewChat();
      if (newChatId) {
          setPromptForNewChat(prompt);
      }
  }, [isLoggedIn, startNewChat]);

  const setActiveChat = useCallback((id: string) => {
    setActiveChatId(id);
    setIsSidebarOpen(false);
  }, []);
  
  const deleteChat = useCallback(async (idToDelete: string) => {
    const sessionToDelete = chatSessions.find(s => s.id === idToDelete);
    if (!sessionToDelete?.driveFileId) return;

    try {
        await googleDriveService.deleteSession(sessionToDelete.driveFileId);
        setChatSessions(prev => {
            const newSessions = prev.filter(s => s.id !== idToDelete);
            if (activeChatId === idToDelete) {
                setActiveChatId(newSessions.length > 0 ? newSessions[0].id : null);
            }
            return newSessions;
        });
    } catch (error) {
        console.error("Failed to delete chat:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not delete chat.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    }
  }, [chatSessions, activeChatId]);

  const toggleFavorite = useCallback(async (idToToggle: string) => {
    const session = chatSessions.find(s => s.id === idToToggle);
    if (!session) return;
    
    const updatedSession = { ...session, isFavorite: !session.isFavorite };
    try {
        await googleDriveService.saveSession(updatedSession);
        setChatSessions(prev => prev.map(s => s.id === idToToggle ? updatedSession : s));
    } catch (error) {
        console.error("Failed to toggle favorite:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not update favorite status.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    }
  }, [chatSessions]);

  const handleSetPersona = useCallback(async (personaKey: string) => {
    if (!activeChatId) return;
    const session = chatSessions.find(s => s.id === activeChatId);
    if (!session || session.persona === personaKey) return;
    
    const personaName = PERSONAS[personaKey]?.name || 'Default';
    const personaMessage: Message = {
      role: 'model',
      text: `AI persona is now **${personaName}**.`,
      timestamp: Date.now(),
    };
    const updatedSession = { ...session, persona: personaKey, messages: [...session.messages, personaMessage] };

    try {
        await googleDriveService.saveSession(updatedSession);
        setChatSessions(prev => prev.map(s => s.id === activeChatId ? updatedSession : s));
    } catch (error) {
        console.error("Failed to set persona:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not update persona.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    }
  }, [chatSessions, activeChatId]);


  const handleSetAttachments = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    if (attachments.length + newFiles.length > MAX_FILES) {
      setNotifications(prev => [`You can only attach up to ${MAX_FILES} files.`, ...prev.slice(0, 19)]);
      return;
    }
    const currentImageCount = attachments.filter(f => f.mimeType.startsWith('image/')).length;
    const newImageCount = newFiles.filter(f => f.type.startsWith('image/')).length;
    if (currentImageCount + newImageCount > MAX_IMAGE_FILES) {
      setNotifications(prev => [`You can only attach a maximum of ${MAX_IMAGE_FILES} image.`, ...prev.slice(0, 19)]);
      return;
    }
    const filePromises = newFiles.map(file => {
      return new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({ data: base64String, mimeType: file.type, fileName: file.name });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });
    Promise.all(filePromises).then(newAttachments => setAttachments(prev => [...prev, ...newAttachments]));
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };


  const toggleWebSearch = () => {
    const currentChat = chatSessions.find(c => c.id === activeChatId);
    const currentModel = currentChat?.model || model;
    
    if (!isWebSearchEnabled && !currentModel.startsWith('gemini')) {
      setNotifications(prev => [`Web Search is only available for Gemini models.`, ...prev.slice(0, 19)]);
      return;
    }
    setIsWebSearchEnabled(prev => !prev);
  };
  
  const toggleDeepThink = () => setIsDeepThinkEnabled(prev => !prev);

  const handleAttachFromDrive = useCallback(() => {
    if (!isLoggedIn) {
        setIsLoginModalOpen(true);
        return;
    }
    
    const onFilesSelected = async (driveFiles: any[]) => {
        if (attachments.length + driveFiles.length > MAX_FILES) {
            setNotifications(prev => [`You can only attach up to ${MAX_FILES} files.`, ...prev.slice(0, 19)]);
            return;
        }

        try {
            const newAttachmentsPromises = driveFiles.map(async (file) => {
                const base64Data = await googleDriveService.downloadDriveFile(file.id);
                return {
                    data: base64Data,
                    mimeType: file.mimeType,
                    fileName: file.name,
                    driveFileId: file.id, // Keep track of the file ID
                };
            });

            const newAttachments = await Promise.all(newAttachmentsPromises);
            setAttachments(prev => [...prev, ...newAttachments]);

        } catch (error) {
            console.error("Error attaching files from Drive:", error);
            const errorMessage = error instanceof Error ? error.message : "Could not attach files from Google Drive.";
            setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
        }
    };

    googleDriveService.showPicker(onFilesSelected);

  }, [isLoggedIn, attachments.length]);

  const handleSaveToDrive = useCallback(async (message: Message) => {
    if (!message.sourceDriveFileId || !message.sourceDriveFileMimeType) {
        const errorMsg = "Save failed: Missing file ID or MIME type.";
        setNotifications(prev => [errorMsg, ...prev.slice(0, 19)]);
        throw new Error(errorMsg);
    }
    setNotifications(prev => [`Saving to Google Drive...`, ...prev.slice(0, 19)]);
    try {
      await googleDriveService.updateDriveFileContent(
        message.sourceDriveFileId,
        message.text,
        message.sourceDriveFileMimeType
      );
      setNotifications(prev => [`File successfully updated in Google Drive.`, ...prev.slice(0, 19)]);
    } catch (error) {
      console.error("Failed to save to Drive:", error);
      const errorMessage = error instanceof Error ? error.message : "Could not save file to Google Drive.";
      setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
      // Re-throw to allow the component to handle UI state
      throw error;
    }
  }, []);

  const sendMessage = async (messageText: string, messageAttachments = attachments, customHistory?: Message[]) => {
    if (!activeChatId) return;
    if (!isLoggedIn) { setIsLoginModalOpen(true); return; }

    let currentChat = sessionsRef.current.find(c => c.id === activeChatId);
    if (!currentChat || currentChat.isLocked) return;

    // --- Payload Size Check ---
    const payloadString = JSON.stringify(currentChat.messages);
    const payloadSize = new Blob([payloadString]).size;

    if (payloadSize > PAYLOAD_SIZE_LIMIT) {
        console.warn(`Chat ${activeChatId} has exceeded the size limit of ${PAYLOAD_SIZE_LIMIT} bytes. Locking chat.`);
        const lockedChat: ChatSession = { ...currentChat, isLocked: true };
        
        try {
            await googleDriveService.saveSession(lockedChat);
            setChatSessions(prev => prev.map(s => s.id === activeChatId ? lockedChat : s));
            setNotifications(prev => ["This chat has too much media and has been locked. Please start a new chat.", ...prev.slice(0, 19)]);
        } catch (error) {
            console.error("Failed to save locked chat state:", error);
            const errorMessage = error instanceof Error ? error.message : "Could not lock the chat due to a save error.";
            setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
        }
        return; // Stop execution
    }
    // --- End Payload Size Check ---
    
    const userMessage: Message = {
      role: 'user',
      text: messageText,
      timestamp: Date.now(),
      ...(messageAttachments.length > 0 && { attachments: messageAttachments }),
    };

    if (!customHistory) {
      const isFirstMessage = currentChat.messages.length <= 1;
      const newTitle = isFirstMessage && messageText ? messageText.substring(0, 30) + (messageText.length > 30 ? '...' : '') : currentChat.title;
      currentChat = {
        ...currentChat,
        title: newTitle,
        messages: [...currentChat.messages, userMessage],
      };
      setChatSessions(prev => prev.map(s => s.id === activeChatId ? currentChat as ChatSession : s));
      handleExpGain(5); // +5 EXP for sending a message
      await googleDriveService.saveSession(currentChat).catch(e => console.error("Save after user message failed:", e));
    }
    
    setIsLoading(true);
    setAttachments([]);
    
    const sourceDriveAttachment = userMessage.attachments?.find(att => att.driveFileId);

    try {
        let finalChatState: ChatSession = currentChat;
        const historyForAPI = customHistory || [...currentChat.messages];
        const webSearch = isWebSearchEnabled;
        const deepThink = isDeepThinkEnabled;
        const activePersonaKey = currentChat.persona || 'default';
        const systemInstruction = PERSONAS[activePersonaKey]?.prompt;
        setIsWebSearchEnabled(false);
        setIsDeepThinkEnabled(false);
        let finalModel = currentChat.model;
        if (currentChat.model === 'deepseek-v3.1') {
            finalModel = deepThink ? 'deepseek-reasoner' : 'deepseek-chat';
        }

        const stream = await streamModelResponse(finalModel, historyForAPI, messageText, messageAttachments, webSearch, deepThink, systemInstruction, userProfile);
        let isFirstChunk = true;
        let modelResponse = '';

        for await (const chunk of stream) {
            if (chunk.status) setThinkingStatus(chunk.status);

            setChatSessions(prev =>
                prev.map(s => {
                    if (s.id !== activeChatId) return s;
                    let newMessages = [...s.messages];
                    let currentModelMessage = newMessages[newMessages.length - 1];

                    if (isFirstChunk && chunk.text) {
                         const newMsg: Message = { role: 'model', text: '', timestamp: Date.now() };
                         if (sourceDriveAttachment) {
                             newMsg.sourceDriveFileId = sourceDriveAttachment.driveFileId;
                             newMsg.sourceDriveFileName = sourceDriveAttachment.fileName;
                             newMsg.sourceDriveFileMimeType = sourceDriveAttachment.mimeType;
                         }
                         newMessages.push(newMsg);
                         currentModelMessage = newMsg;
                         isFirstChunk = false;
                         setThinkingStatus(null);
                    }

                    if (chunk.text && currentModelMessage?.role === 'model') {
                        modelResponse += chunk.text;
                        currentModelMessage.text = modelResponse;
                    }
                    
                    if (chunk.groundingMetadata && currentModelMessage?.role === 'model') {
                        currentModelMessage.groundingMetadata = chunk.groundingMetadata;
                    }

                    finalChatState = { ...s, messages: newMessages };
                    return finalChatState;
                })
            );
        }
        await googleDriveService.saveSession(finalChatState);
    } catch (error) {
      console.error("Error sending message:", error);
      const detailedError = error instanceof Error ? error.message : String(error);

      if (detailedError.includes('This is a Pro feature')) {
          if (userProfile?.email !== ADMIN_EMAIL) {
            handleProFeatureBlock();
          }
      } else {
          setNotifications(prev => [`[${new Date().toLocaleTimeString()}] ${detailedError}`, ...prev.slice(0, 19)]);
          const errorMessage: Message = { role: 'model', text: `There was an unexpected error: ${detailedError}`, timestamp: Date.now() };
          setChatSessions(prev =>
              prev.map(s => {
                if (s.id === activeChatId) {
                    const updatedChat = { ...s, messages: [...s.messages, errorMessage] };
                    googleDriveService.saveSession(updatedChat).catch(e => console.error("Failed to save error message", e));
                    return updatedChat;
                }
                return s;
              })
          );
      }
    } finally {
      setIsLoading(false);
      setThinkingStatus(null);
    }
  };
  
  useEffect(() => {
    if (promptForNewChat && activeChatId) {
        const currentChat = sessionsRef.current.find(c => c.id === activeChatId);
        if (currentChat && currentChat.messages.length === 1 && currentChat.messages[0].role === 'model') {
            sendMessage(promptForNewChat);
            setPromptForNewChat(null);
        }
    }
  }, [promptForNewChat, activeChatId]);


  const handleEditMessage = async (messageIndex: number, newText: string) => {
      if (!activeChatId || !isLoggedIn) return;
      
      const session = sessionsRef.current.find(s => s.id === activeChatId);
      if (!session) return;
      
      const truncatedMessages = session.messages.slice(0, messageIndex);
      const editedMessage: Message = { ...session.messages[messageIndex], text: newText, timestamp: Date.now() };
      const updatedSession = { ...session, messages: [...truncatedMessages, editedMessage] };
      setChatSessions(prev => prev.map(s => s.id === activeChatId ? updatedSession : s));

      const historyForApi = updatedSession.messages.slice(0, messageIndex); 
      await sendMessage(newText, updatedSession.messages[messageIndex].attachments, historyForApi);
  };

  const handleRefreshResponse = async (messageIndex: number) => {
    if (!activeChatId || messageIndex === 0 || !isLoggedIn) return;
    
    const session = sessionsRef.current.find(s => s.id === activeChatId);
    if (!session) return;

    const truncatedMessages = session.messages.slice(0, messageIndex);
    const userPrompt = truncatedMessages[truncatedMessages.length - 1];
    
    if (userPrompt?.role === 'user') {
        const updatedSession = { ...session, messages: truncatedMessages };
        setChatSessions(prev => prev.map(s => s.id === activeChatId ? updatedSession : s));
        const historyForApi = updatedSession.messages.slice(0, messageIndex - 1);
        await sendMessage(userPrompt.text, userPrompt.attachments, historyForApi);
    }
  };
  
  const handleDeleteSingleMessage = useCallback(async (messageIndex: number) => {
    if (!activeChatId || !isLoggedIn) return;

    const session = sessionsRef.current.find(s => s.id === activeChatId);
    if (!session || !session.messages[messageIndex]) return;

    // Specifically prevent deleting the very first greeting message.
    if (messageIndex === 0) {
        setNotifications(prev => ["Cannot delete the initial greeting message.", ...prev.slice(0, 19)]);
        return;
    }
    
    // Safeguard to ensure this handler is only for bot messages.
    if (session.messages[messageIndex].role === 'user') {
        console.warn("handleDeleteSingleMessage called on a user message. This shouldn't happen.");
        return;
    }

    const updatedMessages = session.messages.filter((_, index) => index !== messageIndex);
    const updatedSession = { ...session, messages: updatedMessages };

    try {
        await googleDriveService.saveSession(updatedSession);
        setChatSessions(prev => prev.map(s => s.id === activeChatId ? updatedSession : s));
    } catch (error) {
        console.error("Failed to delete message:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not delete message.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    }
  }, [activeChatId, isLoggedIn]);

  const recentMedia = useMemo(() => {
    return chatSessions
        .flatMap(session => 
            session.messages.map(message => ({ ...message, chatId: session.id }))
        )
        .filter(message => message.attachments && message.attachments.length > 0)
        .flatMap(message => 
            message.attachments!.map(att => ({ ...att, chatId: message.chatId, timestamp: message.timestamp }))
        )
        .filter(att => att.mimeType.startsWith('image/'))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50); // Limit to latest 50 for performance
  }, [chatSessions]);

  const activeChat = chatSessions.find(c => c.id === activeChatId);
  const isAdmin = userProfile?.email === ADMIN_EMAIL;
  
  const handleProFeatureBlock = () => {
      if (!isLoggedIn) {
          setIsLoginModalOpen(true);
          setNotifications(prev => ["Please sign in to use Pro features.", ...prev.slice(0, 19)]);
          return;
      }
      if (userProfile?.email !== ADMIN_EMAIL) {
          setIsMembershipModalOpen(true);
      }
  };

  const handleOpenGenerationModal = () => {
    if (isLoggedIn) {
        setIsGenerationModalOpen(true);
    } else {
        setIsLoginModalOpen(true);
        setNotifications(prev => ["Please sign in to use Creative Tools.", ...prev.slice(0, 19)]);
    }
  };

  const handleMembershipClick = () => {
    if (!isLoggedIn) {
      setIsLoginModalOpen(true);
      return;
    }
    if (userProfile?.isPro) {
      setIsMembershipManagementOpen(true);
    } else {
      setIsMembershipModalOpen(true);
    }
  };

  // --- Music Box Handlers ---
  const fetchSongs = useCallback(async () => {
    if (!userProfile) return;
    setIsMusicLoading(true);
    try {
        const params = new URLSearchParams({ action: 'get_public_songs' });
        const response = await fetch(`/api/music?${params.toString()}`, {
            headers: { 'X-User-Email': userProfile.email }
        });
        if (!response.ok) throw new Error('Failed to fetch songs');
        const data = await response.json();
        setSongs(data.songs || []);
    } catch (e) {
        setNotifications(prev => [e instanceof Error ? e.message : 'Failed to load music', ...prev.slice(0, 19)]);
    } finally {
        setIsMusicLoading(false);
    }
  }, [userProfile, setNotifications]);

  const filteredSongs = useMemo(() => {
    return songs.filter(song => {
        const matchesSearch = song.title.toLowerCase().includes(musicSearchTerm.toLowerCase()) || 
                              song.artist.toLowerCase().includes(musicSearchTerm.toLowerCase());
        
        let matchesFilter = false;
        if (musicActiveGenre === 'all') {
            matchesFilter = true;
        } else if (musicActiveGenre === 'favorites') {
            matchesFilter = song.is_favorite === true;
        } else {
            matchesFilter = song.genre === musicActiveGenre;
        }

        return matchesSearch && matchesFilter;
    });
  }, [songs, musicSearchTerm, musicActiveGenre]);

  const handleToggleSongFavorite = async (songId: string) => {
    if (!userProfile) {
        setIsLoginModalOpen(true);
        setNotifications(prev => ["Please sign in to favorite songs.", ...prev.slice(0, 19)]);
        return;
    }

    // Optimistic UI update
    const originalSongs = songs;
    setSongs(prevSongs =>
        prevSongs.map(song =>
            song.id === songId
                ? { ...song, is_favorite: !song.is_favorite }
                : song
        )
    );

    try {
        const response = await fetch('/api/music', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Email': userProfile.email,
            },
            body: JSON.stringify({
                action: 'toggle_favorite',
                songId: songId,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to update favorite status.');
        }
    } catch (error) {
        console.error("Error toggling favorite:", error);
        // Revert on error
        setSongs(originalSongs);
        setNotifications(prev => ["Could not update favorite status. Please try again.", ...prev.slice(0, 19)]);
    }
  };

  const handleOpenMusicBox = () => {
    if (musicBoxState === 'minimized') {
        setMusicBoxState('open');
        return;
    }
    if (songs.length === 0 && !isMusicLoading) {
        fetchSongs();
    }
    setMusicBoxState('open');
  };
  
  const handleOpenChatRoom = () => {
    if (!isLoggedIn) {
        setIsLoginModalOpen(true);
        setNotifications(prev => ["Please sign in to use the Chat Room.", ...prev.slice(0, 19)]);
        return;
    }
    setChatRoomState('open');
  };

  const handleCloseMusicBox = () => {
    setIsPlaying(false);
    setCurrentSong(null);
    setMusicBoxState('closed');
  };

  const handleMinimizeMusicBox = () => {
    setMusicBoxState('minimized');
  };
  
  const handleSetCurrentSong = useCallback((song: Song | null, shouldPlay: boolean) => {
    setCurrentSong(song);
    setIsPlaying(shouldPlay);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (currentSong) {
      setIsPlaying(prev => !prev);
    }
  }, [currentSong]);
  
  const handleNextSong = useCallback(() => {
    if (filteredSongs.length === 0) return;
    const currentIndex = currentSong ? filteredSongs.findIndex(s => s.id === currentSong.id) : -1;
    const nextIndex = (currentIndex + 1) % filteredSongs.length;
    handleSetCurrentSong(filteredSongs[nextIndex], true);
  }, [filteredSongs, currentSong, handleSetCurrentSong]);

  const handlePrevSong = useCallback(() => {
    if (filteredSongs.length === 0) return;
    const currentIndex = currentSong ? filteredSongs.findIndex(s => s.id === currentSong.id) : -1;
    const prevIndex = (currentIndex - 1 + filteredSongs.length) % filteredSongs.length;
    handleSetCurrentSong(filteredSongs[prevIndex], true);
  }, [filteredSongs, currentSong, handleSetCurrentSong]);

  // --- Refs for YouTube player callbacks to prevent re-initialization ---
  const handleNextSongRef = useRef(handleNextSong);
  useEffect(() => { handleNextSongRef.current = handleNextSong; }, [handleNextSong]);
  const handleExpGainRef = useRef(handleExpGain);
  useEffect(() => { handleExpGainRef.current = handleExpGain; }, [handleExpGain]);

  // --- YouTube Player API Integration ---
  useEffect(() => {
    const onPlayerStateChange = (event: any) => {
      const YT = (window as any).YT;
      if (!YT) return;
      
      if (event.data === YT.PlayerState.PLAYING) {
        setIsPlaying(true);
      } else if (event.data === YT.PlayerState.PAUSED) {
        setIsPlaying(false);
      } else if (event.data === YT.PlayerState.ENDED) {
        handleExpGainRef.current(10); // +10 EXP per song listened
        handleNextSongRef.current(); // Use the ref to call the latest callback
      }
    };

    const initializePlayer = () => {
      if (!playerRef.current) {
        playerRef.current = new (window as any).YT.Player('youtube-player-container', {
          height: '0',
          width: '0',
          playerVars: { 'controls': 0, 'rel': 0, 'showinfo': 0, 'modestbranding': 1, 'playsinline': 1 },
          events: {
            'onReady': () => setIsPlayerReady(true),
            'onStateChange': onPlayerStateChange,
          }
        });
      }
    };
    
    if (!(window as any).YT || !(window as any).YT.Player) {
      (window as any).onYouTubeIframeAPIReady = initializePlayer;
    } else {
      initializePlayer();
    }
  }, []); // <-- Empty dependency array is crucial.

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;
    const videoId = getYouTubeVideoId(currentSong?.url);
    if (videoId) {
      const currentVideoUrl = playerRef.current.getVideoUrl();
      if (!currentVideoUrl || !currentVideoUrl.includes(videoId)) {
        playerRef.current.loadVideoById(videoId);
      }
    } else {
      playerRef.current.stopVideo();
    }
  }, [currentSong, isPlayerReady]);

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current || !currentSong) return;
    if (isPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isPlaying, isPlayerReady, currentSong]);
  
  // --- Media Session API for Background Playback ---
  useEffect(() => {
    if ('mediaSession' in navigator) {
        if (currentSong) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentSong.title,
                artist: currentSong.artist,
                album: 'Moe Chat Music',
                artwork: currentSong.avatar_drive_id
                    ? [{ src: googleDriveService.getDriveFilePublicUrl(currentSong.avatar_drive_id), sizes: '512x512', type: 'image/png' }]
                    : []
            });

            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

            navigator.mediaSession.setActionHandler('play', () => handleTogglePlay());
            navigator.mediaSession.setActionHandler('pause', () => handleTogglePlay());
            navigator.mediaSession.setActionHandler('nexttrack', () => handleNextSong());
            navigator.mediaSession.setActionHandler('previoustrack', () => handlePrevSong());
        } else {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'none';
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('nexttrack', null);
            navigator.mediaSession.setActionHandler('previoustrack', null);
        }
    }
  }, [currentSong, isPlaying, handleTogglePlay, handleNextSong, handlePrevSong]);


  return (
    <div className="relative flex h-screen w-full font-sans overflow-hidden">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        ></div>
      )}
      <Sidebar
        isOpen={isSidebarOpen}
        chatSessions={chatSessions}
        activeChatId={activeChatId}
        startNewChat={startNewChat}
        setActiveChat={setActiveChat}
        deleteChat={deleteChat}
        toggleFavorite={toggleFavorite}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onAdminPanelClick={() => setIsAdminPanelOpen(true)}
        onAdminMovieModalClick={() => setIsAdminMovieModalOpen(true)}
        onAdminFilesLibraryClick={() => setIsAdminFilesLibraryOpen(true)}
        onAdminMusicClick={() => setIsAdminMusicOpen(true)} 
        onMembershipClick={handleMembershipClick}
        isAdmin={isAdmin}
        onSignIn={() => googleDriveService.signIn()}
        onSignOut={() => googleDriveService.signOutFromApp(() => handleAuthChange(false))}
        isLoggedIn={isLoggedIn}
        userProfile={userProfile}
        siteSettings={siteSettings}
      />
      <main className="flex-1 min-w-0">
        <ChatView
          activeChat={activeChat || null}
          sendMessage={sendMessage}
          handleEditMessage={handleEditMessage}
          handleRefreshResponse={handleRefreshResponse}
          handleDeleteSingleMessage={handleDeleteSingleMessage}
          isLoading={isLoading || !isAuthReady}
          thinkingStatus={thinkingStatus}
          attachments={attachments}
          setAttachments={handleSetAttachments}
          removeAttachment={removeAttachment}
          isWebSearchEnabled={isWebSearchEnabled}
          toggleWebSearch={toggleWebSearch}
          isDeepThinkEnabled={isDeepThinkEnabled}
          toggleDeepThink={toggleDeepThink}
          onMenuClick={() => setIsSidebarOpen(true)}
          isDarkMode={isDarkMode}
          chatBgColor={chatBgColor}
          defaultModel={model}
          notifications={notifications}
          setNotifications={setNotifications}
          clearNotifications={() => setNotifications([])}
          personas={PERSONAS}
          setPersona={handleSetPersona}
          onOpenGenerationModal={handleOpenGenerationModal}
          onAttachFromDrive={handleAttachFromDrive}
          onSaveToDrive={handleSaveToDrive}
          startChatWithPrompt={startChatWithPrompt}
          startNewChat={startNewChat}
          onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
          onOpenVideoCinema={() => setIsVideoCinemaModalOpen(true)}
          onOpenFilesLibrary={() => setIsFilesLibraryOpen(true)}
          onOpenGamePortal={() => setIsGamePortalOpen(true)}
          onOpenMusicBox={handleOpenMusicBox}
          onOpenChatRoom={handleOpenChatRoom}
          userProfile={userProfile}
          onProFeatureBlock={handleProFeatureBlock}
          musicBoxState={musicBoxState}
          chatRoomState={chatRoomState}
          currentSong={currentSong}
          isPlaying={isPlaying}
          handleExpGain={handleExpGain}
        />
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        model={model}
        setModel={setModel}
        chatBgColor={chatBgColor}
        setChatBgColor={setChatBgColor}
        userProfile={userProfile}
        setNotifications={setNotifications}
      />
      <LoginModal 
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleSignIn={() => {
            googleDriveService.signIn();
            setIsLoginModalOpen(false);
        }}
      />
      <WelcomeModal
        isOpen={isWelcomeModalOpen && !isLoggedIn && isAuthReady}
        onClose={() => {
          setIsWelcomeModalOpen(false);
          localStorage.setItem('hasVisitedMoeChat', 'true');
        }}
        onSignIn={() => {
          setIsWelcomeModalOpen(false);
          localStorage.setItem('hasVisitedMoeChat', 'true');
          googleDriveService.signIn();
        }}
       />
      <GamePortalModal
        isOpen={isGamePortalOpen}
        onClose={() => setIsGamePortalOpen(false)}
        userProfile={userProfile}
        handlePointsGain={handlePointsGain}
        setNotifications={setNotifications}
        setUserProfile={setUserProfile}
      />
      <GenerationModal
        isOpen={isGenerationModalOpen}
        onClose={() => setIsGenerationModalOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
        onProFeatureBlock={handleProFeatureBlock}
        handleExpGain={handleExpGain}
      />
      <MediaGalleryModal
          isOpen={isMediaGalleryOpen}
          onClose={() => setIsMediaGalleryOpen(false)}
          mediaItems={recentMedia}
          setActiveChat={setActiveChat}
      />
      <AdminPanelModal
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        userProfile={userProfile}
        onSettingsChanged={fetchSiteSettings}
        setUserProfile={setUserProfile}
      />
      <AdminMovieModal
        isOpen={isAdminMovieModalOpen}
        onClose={() => setIsAdminMovieModalOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
      />
       <VideoCinemaModal
        isOpen={isVideoCinemaModalOpen}
        onClose={() => setIsVideoCinemaModalOpen(false)}
        userProfile={userProfile}
        handleExpGain={handleExpGain}
      />
      <FilesLibraryModal
        isOpen={isFilesLibraryOpen}
        onClose={() => setIsFilesLibraryOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
        handleExpGain={handleExpGain}
      />
      <AdminFilesLibraryModal
        isOpen={isAdminFilesLibraryOpen}
        onClose={() => setIsAdminFilesLibraryOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
      />
      <MembershipModal
        isOpen={isMembershipModalOpen}
        onClose={() => setIsMembershipModalOpen(false)}
        userProfile={userProfile}
      />
      <MembershipManagementModal
        isOpen={isMembershipManagementOpen}
        onClose={() => setIsMembershipManagementOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
      />
      <MusicBoxModal
        isOpen={musicBoxState === 'open'}
        onClose={handleCloseMusicBox}
        onMinimize={handleMinimizeMusicBox}
        userProfile={userProfile}
        songs={filteredSongs}
        currentSong={currentSong}
        isPlaying={isPlaying}
        isLoading={isMusicLoading}
        onSetCurrentSong={handleSetCurrentSong}
        onTogglePlay={handleTogglePlay}
        onNext={handleNextSong}
        onPrev={handlePrevSong}
        onToggleFavorite={handleToggleSongFavorite}
        activeGenre={musicActiveGenre}
        setActiveGenre={setMusicActiveGenre}
        searchTerm={musicSearchTerm}
        setSearchTerm={setMusicSearchTerm}
      />
      <AdminMusicModal
        isOpen={isAdminMusicOpen}
        onClose={() => setIsAdminMusicOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
        onDataChange={fetchSongs}
      />
      <ChatRoomModal
        isOpen={chatRoomState === 'open'}
        onClose={() => setChatRoomState('closed')}
        onMinimize={() => setChatRoomState('minimized')}
        userProfile={userProfile}
        setUserProfile={setUserProfile}
      />
    </div>
  );
};

export default App;
