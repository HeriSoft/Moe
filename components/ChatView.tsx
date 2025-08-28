import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatSession, Attachment } from '../types';
import { MessageComponent } from './Message';
// FIX: Add ModelIcon to imports
import { SendIcon, AttachmentIcon, WebSearchIcon, ImageIcon, VideoIcon, CloseIcon, MenuIcon, BellIcon, DeepThinkIcon, DocumentPlusIcon, ArrowDownIcon, MicrophoneIcon, StopCircleIcon, TranslateIcon, ModelIcon } from './icons';
import { getTranslation } from '../services/geminiService';

// Add SpeechRecognition types to window for TypeScript
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface ChatViewProps {
  activeChat: ChatSession | null;
  sendMessage: (message: string, attachments?: Attachment[], history?: any[]) => Promise<void>;
  handleEditMessage: (messageIndex: number, newText: string) => Promise<void>;
  handleRefreshResponse: (messageIndex: number) => Promise<void>;
  isLoading: boolean;
  thinkingStatus: string | null;
  attachments: Attachment[];
  setAttachments: (files: FileList | null) => void;
  removeAttachment: (index: number) => void;
  isWebSearchEnabled: boolean;
  toggleWebSearch: () => void;
  isDeepThinkEnabled: boolean;
  toggleDeepThink: () => void;
  onMenuClick: () => void;
  isDarkMode: boolean;
  chatBgColor: string;
  defaultModel: string;
  notifications: string[];
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  clearNotifications: () => void;
}

const WelcomeScreen: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 dark:text-slate-400">
        <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-2">Moe Chat</h1>
        <p className="text-lg">Start a new conversation to begin.</p>
    </div>
);

const LoadingIndicator: React.FC<{ thinkingStatus: string | null }> = ({ thinkingStatus }) => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setSeconds(prev => prev + 1);
        }, 1000);

        return () => {
            clearInterval(timer);
        };
    }, []);


    return (
        <div className="flex items-start gap-4 p-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                <ModelIcon className="w-5 h-5 p-0.5" />
            </div>
            <div className="max-w-xl rounded-2xl p-4 bg-[#2d2d40] dark:bg-[#2d2d40] rounded-bl-none">
                {thinkingStatus ? (
                     <div className="text-white font-medium text-sm">
                        {thinkingStatus} [{seconds} giây]
                     </div>
                ) : (
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const ChatView: React.FC<ChatViewProps> = ({ activeChat, sendMessage, handleEditMessage, handleRefreshResponse, isLoading, thinkingStatus, attachments, setAttachments, removeAttachment, isWebSearchEnabled, toggleWebSearch, isDeepThinkEnabled, toggleDeepThink, onMenuClick, isDarkMode, chatBgColor, defaultModel, notifications, setNotifications, clearNotifications }) => {
  const [input, setInput] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isTranslateMenuOpen, setIsTranslateMenuOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
           setInput(prev => prev.trim() ? `${prev.trim()} ${finalTranscript.trim()}` : finalTranscript.trim());
        }
      };
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setNotifications(prev => [`Speech recognition error: ${event.error}`, ...prev.slice(0, 19)]);
        setIsRecording(false);
      };
      recognition.onend = () => {
        if(isRecording) { // If it stops unexpectedly, try to restart it
           recognition.start();
        }
      };
      recognitionRef.current = recognition;
    }
  }, [isRecording, setNotifications]);
  
  const toggleRecording = () => {
    if (!recognitionRef.current) {
        setNotifications(prev => ['Speech recognition is not supported in this browser.', ...prev.slice(0, 19)]);
        return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
            setIsNotificationsOpen(false);
        }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleScroll = () => {
    const mainEl = mainScrollRef.current;
    if (mainEl) {
        const { scrollTop, scrollHeight, clientHeight } = mainEl;
        const threshold = 300; 
        setShowScrollToBottom(scrollHeight - scrollTop > clientHeight + threshold);
    }
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeChat?.messages, isLoading, scrollToBottom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachments.length > 0) && !isLoading) {
      sendMessage(input.trim(), attachments);
      setInput('');
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(e.target.files);
    }
  };
  
  const handleTranslate = async (lang: string) => {
    setIsTranslateMenuOpen(false);
    if (!input.trim() || isTranslating) return;

    setIsTranslating(true);
    try {
        const translatedText = await getTranslation(input, lang);
        setInput(translatedText);
    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : "Translation failed.";
        setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    } finally {
        setIsTranslating(false);
    }
  };

  const currentModelName = activeChat?.model ?? defaultModel;
  const isDeepSeekModel = currentModelName === 'deepseek-v3.1';
  
  const languages = [
    { code: 'Vietnamese', name: 'Tiếng Việt' }, { code: 'English', name: 'English' },
    { code: 'Chinese', name: '中文' }, { code: 'Korean', name: '한국어' },
    { code: 'Japanese', name: '日本語' }, { code: 'Thai', name: 'ภาษาไทย' },
    { code: 'Russian', name: 'Русский' }, { code: 'Italian', name: 'Italiano' },
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#171725] transition-colors duration-300">
      <header className="flex-shrink-0 p-2 sm:p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex items-center">
            <button onClick={onMenuClick} className="md:hidden p-2 mr-2 text-slate-600 dark:text-slate-300">
                <MenuIcon className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white truncate pr-4">
                {activeChat ? activeChat.title : 'Moe Chat'}
            </h2>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 hidden sm:flex">
                <span>Model: {currentModelName}</span>
            </div>
            <div className="relative" ref={notificationsRef}>
                <button 
                    onClick={() => setIsNotificationsOpen(prev => !prev)} 
                    className="relative text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    aria-label="Toggle notifications"
                >
                    <BellIcon className="w-6 h-6" />
                    {notifications.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                            {notifications.length}
                        </span>
                    )}
                </button>
                {isNotificationsOpen && (
                    <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-[#2d2d40] rounded-lg shadow-xl z-50 border border-slate-200 dark:border-slate-700">
                        <div className="p-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
                            <h4 className="font-semibold text-slate-800 dark:text-white">Notifications</h4>
                            {notifications.length > 0 && (
                                <button onClick={clearNotifications} className="text-sm text-indigo-500 hover:underline">Clear all</button>
                            )}
                        </div>
                        {notifications.length > 0 ? (
                            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                                {notifications.map((note, index) => (
                                    <li key={index} className="p-3 text-sm text-slate-600 dark:text-slate-300 break-words">
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">No new notifications.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <main 
          ref={mainScrollRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto pb-6"
          style={isDarkMode ? { backgroundColor: chatBgColor } : {}}
        >
          {activeChat ? (
            <div>
              {activeChat.messages.map((msg, index) => (
                <MessageComponent 
                    key={`${activeChat.id}-${index}`} 
                    message={msg}
                    onEdit={(newText) => handleEditMessage(index, newText)}
                    onRefresh={() => handleRefreshResponse(index)}
                />
              ))}
              {isLoading && <LoadingIndicator thinkingStatus={thinkingStatus} />}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <WelcomeScreen />
          )}
        </main>

        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          className={`absolute bottom-4 right-4 sm:right-6 z-20 p-2 rounded-full bg-indigo-600 text-white shadow-lg transition-opacity duration-300 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-[#171725] ${showScrollToBottom ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <ArrowDownIcon className="w-6 h-6" />
        </button>
      </div>

      <footer className="flex-shrink-0 p-2 sm:p-4 sm:pt-0">
        <div className="relative w-full bg-slate-100 dark:bg-[#2d2d40] text-slate-800 dark:text-slate-200 rounded-xl p-2 shadow-sm">
            {isTranslateMenuOpen && (
                 <div className="absolute bottom-full left-0 right-0 p-2">
                    <div className="bg-white dark:bg-[#171725] rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 p-2 grid grid-cols-4 gap-2">
                        {languages.map(lang => (
                             <button key={lang.code} onClick={() => handleTranslate(lang.code)} className="p-2 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                {lang.name}
                             </button>
                        ))}
                    </div>
                 </div>
            )}
            {attachments.length > 0 && (
                <div className="p-2 flex flex-wrap gap-2">
                    {attachments.map((att, index) => (
                        <div key={index} className="relative w-fit group">
                            {att.mimeType.startsWith('image/') ? (
                                <img src={`data:${att.mimeType};base64,${att.data}`} alt={att.fileName} className="h-20 w-20 object-cover rounded-md" />
                            ) : (
                                <div className="h-20 w-20 flex flex-col items-center justify-center bg-slate-200 dark:bg-slate-600 rounded-md p-1">
                                    <DocumentPlusIcon className="w-8 h-8 text-slate-500 dark:text-slate-400"/>
                                    <p className="text-xs text-center truncate w-full text-slate-600 dark:text-slate-300 mt-1" title={att.fileName}>{att.fileName}</p>
                                </div>
                            )}
                            <button onClick={() => removeAttachment(index)} className="absolute -top-1 -right-1 bg-slate-600 text-white rounded-full p-0.5 hover:bg-slate-800 opacity-75 group-hover:opacity-100" aria-label="Remove attachment">
                               <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <form onSubmit={handleSubmit} className="relative">
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    handleSubmit(e);
                }
                }}
                placeholder="Type your message..."
                rows={1}
                className="w-full bg-transparent p-4 pr-16 resize-none focus:outline-none"
                disabled={isLoading || isTranslating}
                aria-label="Chat message input"
            />
            <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                aria-label="Send message"
            >
                <SendIcon className="w-5 h-5" />
            </button>
            </form>
            <div className="flex items-center justify-start space-x-1 mt-1 px-2 border-t border-slate-200 dark:border-slate-600/50 pt-1 overflow-x-auto">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="*/*" multiple />
                <button title={"Attach file"} aria-label="Attach file" onClick={() => fileInputRef.current?.click()} className="p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500/50 text-slate-500 dark:text-slate-400">
                    <AttachmentIcon className="w-5 h-5" />
                </button>
                <button title={"Web Search"} aria-label="Web Search" onClick={toggleWebSearch} className={`p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500/50 text-slate-500 dark:text-slate-400 transition-colors ${isWebSearchEnabled ? 'bg-indigo-100 dark:bg-indigo-900/50 !text-indigo-500' : ''}`}>
                    <WebSearchIcon className="w-5 h-5" />
                </button>
                <button title={isRecording ? "Stop recording" : "Start recording"} aria-label={isRecording ? "Stop recording" : "Start recording"} onClick={toggleRecording} className={`p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500/50 text-slate-500 dark:text-slate-400 transition-colors ${isRecording ? 'bg-red-100 dark:bg-red-900/50 !text-red-500' : ''}`}>
                    {isRecording ? <StopCircleIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
                </button>
                <button title={"Translate"} aria-label="Translate" onClick={() => setIsTranslateMenuOpen(prev => !prev)} className={`p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500/50 text-slate-500 dark:text-slate-400 transition-colors ${isTranslateMenuOpen ? 'bg-indigo-100 dark:bg-indigo-900/50 !text-indigo-500' : ''}`} disabled={!input.trim()}>
                    <TranslateIcon className="w-5 h-5" />
                </button>
                 <button title={"Tạo hình ảnh (Sắp ra mắt)"} aria-label="Generate Image" onClick={() => alert('Tính năng tạo hình ảnh sẽ sớm ra mắt!')} className="p-2 rounded-md text-slate-400/60 dark:text-slate-500/60 cursor-not-allowed">
                    <ImageIcon className="w-5 h-5" />
                </button>
                 <button title={"Tạo video (Sắp ra mắt)"} aria-label="Generate Video" onClick={() => alert('Tính năng tạo video sẽ sớm ra mắt!')} className="p-2 rounded-md text-slate-400/60 dark:text-slate-500/60 cursor-not-allowed">
                    <VideoIcon className="w-5 h-5" />
                </button>
                {isDeepSeekModel && (
                  <button title={"Deep Think"} aria-label="Toggle Deep Think mode" onClick={toggleDeepThink} className={`p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500/50 text-slate-500 dark:text-slate-400 transition-colors ${isDeepThinkEnabled ? 'bg-indigo-100 dark:bg-indigo-900/50 !text-indigo-500' : ''}`}>
                      <DeepThinkIcon className="w-5 h-5" />
                  </button>
                )}
            </div>
        </div>
         <p className="text-xs text-center text-slate-400 dark:text-slate-500 mt-2">
            Moe Chat may produce inaccurate information about people, places, or facts.
         </p>
      </footer>

    </div>
  );
};
