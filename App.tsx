import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { LoginModal } from './components/LoginModal';
import { GenerationModal } from './components/GenerationModal';
import { MediaGalleryModal } from './components/MediaGalleryModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { AdminMovieModal } from './components/AdminMovieModal'; // New
import { VideoCinemaModal } from './components/VideoCinemaModal'; // New
import { MembershipModal } from './components/MembershipModal'; // Import the new modal
import {
  streamModelResponse,
  logUserLogin,
} from './services/geminiService';
import * as googleDriveService from './services/googleDriveService';
import { AcademicCapIcon, UserCircleIcon, CodeBracketIcon, SparklesIcon, InformationCircleIcon } from './components/icons';
import type { ChatSession, Message, Attachment, UserProfile } from './types';

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


const App: React.FC = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
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
  const [authError, setAuthError] = useState<string | null>(null); // State for auth errors
  const sessionsRef = useRef(chatSessions);

  // --- New Admin & Membership State ---
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isAdminMovieModalOpen, setIsAdminMovieModalOpen] = useState(false); // New
  const [isVideoCinemaModalOpen, setIsVideoCinemaModalOpen] = useState(false); // New
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  
  // --- New Unified Generation Modal State ---
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);


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
          logUserLogin(profile); // Log the login event
      } else {
          setUserProfile(undefined);
          setChatSessions([]); // Clear sessions on logout
          setActiveChatId(null);
      }
      setIsAuthReady(true);
      setAuthError(null); // Clear previous errors on successful auth change
  }, [loadChatsFromDrive]);


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

    // Initialize Google Drive Service
    googleDriveService.initClient(handleAuthChange, (errorMsg) => {
        setAuthError(errorMsg);
        setIsAuthReady(true);
    });
  }, [handleAuthChange]);
  
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
            setIsMembershipModalOpen(true);
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
        isAdmin={isAdmin}
        onSignIn={() => googleDriveService.signIn()}
        onSignOut={() => googleDriveService.signOut(handleAuthChange)}
        isLoggedIn={isLoggedIn}
        userProfile={userProfile}
      />
      <main className="flex-1 min-w-0">
        {authError && (
          <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white p-3 text-center shadow-lg flex items-center justify-center">
            <InformationCircleIcon className="w-6 h-6 mr-3" />
            <span className="font-semibold">{authError}</span>
          </div>
        )}
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
          userProfile={userProfile}
          onProFeatureBlock={handleProFeatureBlock}
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
      />
      <LoginModal 
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onGoogleSignIn={() => {
            googleDriveService.signIn();
            setIsLoginModalOpen(false);
        }}
      />
      <GenerationModal
        isOpen={isGenerationModalOpen}
        onClose={() => setIsGenerationModalOpen(false)}
        userProfile={userProfile}
        setNotifications={setNotifications}
        onProFeatureBlock={handleProFeatureBlock}
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
      />
      <MembershipModal
        isOpen={isMembershipModalOpen}
        onClose={() => setIsMembershipModalOpen(false)}
      />
    </div>
  );
};

export default App;
