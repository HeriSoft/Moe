import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { LoginModal } from './components/LoginModal';
import {
  streamModelResponse,
  generateImage,
} from './services/geminiService';
import type { ChatSession, Message, Attachment } from './types';

const MAX_FILES = 4;
const MAX_IMAGE_FILES = 1;

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
  const [isGuestUser, setIsGuestUser] = useState(true);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);


  // Load state from localStorage on initial render, including migration logic
  useEffect(() => {
    try {
        // --- Migration for old DeepSeek model names ---
        const modelMigrationMap: { [key: string]: string } = {
            'deepseek-v3': 'deepseek-v3.1',
            'deepseek-r1': 'deepseek-v3.1',
            'deepseek-v2': 'deepseek-v3.1',
            'deepseek-chat': 'deepseek-v3.1',
            'deepseek-reasoner': 'deepseek-v3.1',
        };

        // 1. Migrate defaultModel from localStorage
        let savedModel = localStorage.getItem('defaultModel');
        if (savedModel && modelMigrationMap[savedModel]) {
            savedModel = modelMigrationMap[savedModel];
            localStorage.setItem('defaultModel', savedModel); // Update localStorage
        }
        // Set the potentially migrated model to state
        if (savedModel) {
            setModel(savedModel);
        }

        // 2. Migrate chatSessions from localStorage
        const savedSessionsJSON = localStorage.getItem('chatSessions');
        let sessionsToLoad: ChatSession[] = [];
        if (savedSessionsJSON) {
            let parsedSessions: ChatSession[] = JSON.parse(savedSessionsJSON);
            let sessionsUpdated = false;
            parsedSessions = parsedSessions.map(session => {
                if (session.model && modelMigrationMap[session.model]) {
                    sessionsUpdated = true;
                    return { ...session, model: modelMigrationMap[session.model] };
                }
                return session;
            });

            if (sessionsUpdated) {
                localStorage.setItem('chatSessions', JSON.stringify(parsedSessions)); // Update localStorage if changed
            }
            sessionsToLoad = parsedSessions;
        }

        if (sessionsToLoad.length > 0) {
            setChatSessions(sessionsToLoad);
            setActiveChatId(sessionsToLoad[0].id);
        }

        // --- Load other settings ---
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            setIsDarkMode(savedTheme === 'dark');
        } else {
            setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
        }
        
        const savedChatBg = localStorage.getItem('chatBgColor');
        if (savedChatBg) {
            setChatBgColor(savedChatBg);
        }
    } catch (error) {
        console.error("Failed to load and migrate state from localStorage", error);
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
        localStorage.setItem('chatSessions', JSON.stringify(chatSessions));
    } catch (error) {
        console.error("Failed to save sessions to localStorage", error);
    }
  }, [chatSessions]);

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

  // When the default model changes via settings, update the active chat to use it.
  useEffect(() => {
    // Don't do anything if no chat is active
    if (!activeChatId) {
      return;
    }

    setChatSessions(prevSessions => {
      const currentActiveChat = prevSessions.find(s => s.id === activeChatId);

      // Only update if a chat is active and the model has actually changed
      if (currentActiveChat && currentActiveChat.model !== model) {
        const modelChangeMessage: Message = {
          role: 'model',
          text: `Model switched to **${model}**.`,
          timestamp: Date.now(),
        };

        return prevSessions.map(session =>
          session.id === activeChatId
            ? {
                ...session,
                model: model, // Update the model for the session
                messages: [...session.messages, modelChangeMessage], // Add a notification message to the chat
              }
            : session
        );
      }
      
      // If no change is needed, return the previous state to avoid unnecessary re-renders
      return prevSessions;
    });
  }, [model, activeChatId]); // Only run this effect when the model selection changes.

  const startNewChat = useCallback(() => {
    const newChat: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [{ role: 'model', text: 'Hello! How can I help you today?', timestamp: Date.now() }],
      model: model, // Use the current default model
    };
    setChatSessions(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setIsSidebarOpen(false); // Close sidebar on mobile after starting a new chat
  }, [model]);

  const setActiveChat = useCallback((id: string) => {
    setActiveChatId(id);
    setIsSidebarOpen(false); // Close sidebar on mobile after selecting a chat
  }, []);
  
  const deleteChat = useCallback((idToDelete: string) => {
    setChatSessions(prev => {
        const newSessions = prev.filter(s => s.id !== idToDelete);
        if (activeChatId === idToDelete) {
            if (newSessions.length > 0) {
                setActiveChatId(newSessions[0].id);
            } else {
                setActiveChatId(null);
            }
        }
        return newSessions;
    });
  }, [activeChatId]);

  const handleSetAttachments = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    
    // Validation checks
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

    // Read and add new files
    const filePromises = newFiles.map(file => {
      return new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve({
            data: base64String,
            mimeType: file.type,
            fileName: file.name,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises).then(newAttachments => {
      setAttachments(prev => [...prev, ...newAttachments]);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };


  const toggleWebSearch = () => {
    const currentChat = chatSessions.find(c => c.id === activeChatId);
    const currentModel = currentChat?.model || model;
    
    if (!isWebSearchEnabled && !currentModel.startsWith('gemini')) {
      setNotifications(prev => [`Web Search is only available for Gemini models.`, ...prev.slice(0, 19)]);
      return; // Prevent enabling for unsupported models
    }
    setIsWebSearchEnabled(prev => !prev);
  };
  
  const toggleDeepThink = () => setIsDeepThinkEnabled(prev => !prev);


  const sendMessage = async (messageText: string) => {
    if (!activeChatId) return;

    const currentChat = chatSessions.find(c => c.id === activeChatId);
    if (!currentChat) return;

    const userMessage: Message = {
      role: 'user',
      text: messageText,
      timestamp: Date.now(),
      ...(attachments.length > 0 && { attachments }),
    };

    const historyForAPI = [...currentChat.messages];
    setChatSessions(prev =>
      prev.map(s =>
        s.id === activeChatId
          ? {
              ...s,
              title: s.messages.length === 1 ? messageText.substring(0, 30) + (messageText.length > 30 ? '...' : '') : s.title,
              messages: [...s.messages, userMessage],
            }
          : s
      )
    );
    
    setIsLoading(true);
    const currentAttachments = attachments;
    const webSearch = isWebSearchEnabled;
    const deepThink = isDeepThinkEnabled;
    setAttachments([]);
    setIsWebSearchEnabled(false);
    setIsDeepThinkEnabled(false);

    try {
      if (messageText.startsWith('/imagine ')) {
        const prompt = messageText.replace('/imagine ', '').trim();
        const image = await generateImage(prompt);
        const imageMessage: Message = { role: 'model', text: `Here is the generated image for: "${prompt}"`, attachments: [image], timestamp: Date.now() };
        setChatSessions(prev =>
          prev.map(s => s.id === activeChatId ? { ...s, messages: [...s.messages, imageMessage] } : s)
        );
      } else {
        let finalModel = currentChat.model;
        if (currentChat.model === 'deepseek-v3.1') {
            finalModel = deepThink ? 'deepseek-reasoner' : 'deepseek-chat';
        }

        const stream = await streamModelResponse(finalModel, historyForAPI, messageText, currentAttachments, webSearch, deepThink);
        let isFirstChunk = true;
        let modelResponse = '';

        for await (const chunk of stream) {
            if (chunk.status) {
                setThinkingStatus(chunk.status);
            }
            if (chunk.text) { 
                if (isFirstChunk) {
                    setThinkingStatus(null); // Clear status when response starts
                }
                modelResponse += chunk.text;
                if (isFirstChunk) {
                    isFirstChunk = false;
                    const modelMessage: Message = { role: 'model', text: modelResponse, timestamp: Date.now() };
                    setChatSessions(prev =>
                        prev.map(s =>
                            s.id === activeChatId
                                ? { ...s, messages: [...s.messages, modelMessage] }
                                : s
                        )
                    );

                } else {
                    setChatSessions(prev =>
                        prev.map(s => {
                            if (s.id === activeChatId) {
                                const newMessages = [...s.messages];
                                if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'model') {
                                   newMessages[newMessages.length - 1].text = modelResponse;
                                }
                                return { ...s, messages: newMessages };
                            }
                            return s;
                        })
                    );
                }
            }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const detailedError = error instanceof Error ? error.message : String(error);
      setNotifications(prev => [`[${new Date().toLocaleTimeString()}] ${detailedError}`, ...prev.slice(0, 19)]);
      const errorMessage: Message = { role: 'model', text: "There was an unexpected error. Please try again.", timestamp: Date.now() };
      setChatSessions(prev =>
          prev.map(s => s.id === activeChatId ? { ...s, messages: [...s.messages, errorMessage] } : s)
      );
    } finally {
      setIsLoading(false);
      setThinkingStatus(null);
    }
  };

  const activeChat = chatSessions.find(c => c.id === activeChatId);

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
        onSettingsClick={() => setIsSettingsOpen(true)}
        onUserClick={() => setIsLoginModalOpen(true)}
        isGuestUser={isGuestUser}
      />
      <main className="flex-1 min-w-0">
        <ChatView
          activeChat={activeChat || null}
          sendMessage={sendMessage}
          isLoading={isLoading}
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
          clearNotifications={() => setNotifications([])}
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
        onLoginSuccess={() => setIsGuestUser(false)}
      />
    </div>
  );
};

export default App;
