

import React from 'react';
import type { ChatSession } from '../types';
import { PlusIcon, ChatBubbleIcon, UserIcon, GearIcon, TrashIcon } from './icons';

interface SidebarProps {
  chatSessions: ChatSession[];
  activeChatId: string | null;
  startNewChat: () => void;
  setActiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  onSettingsClick: () => void;
  onUserClick: () => void;
  isOpen: boolean;
  isGuestUser: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ chatSessions, activeChatId, startNewChat, setActiveChat, deleteChat, onSettingsClick, onUserClick, isOpen, isGuestUser }) => {
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#171725] text-white flex flex-col p-4 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Moe Chat</h1>
      </div>
      
      <button 
        onClick={startNewChat}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center transition-colors mb-6"
      >
        <PlusIcon className="w-5 h-5 mr-2" />
        New Chat
      </button>

      <div className="flex-1 overflow-y-auto">
        <h2 className="text-sm font-semibold text-slate-400 mb-2 px-2">Recent Chats</h2>
        <nav className="space-y-1">
          {chatSessions.map((session) => (
            <div key={session.id} className="group relative flex items-center pr-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveChat(session.id);
                }}
                className={`flex items-center p-2 rounded-md transition-colors text-slate-200 w-full ${
                  activeChatId === session.id ? 'bg-[#2d2d40]' : 'hover:bg-[#2d2d40]'
                }`}
              >
                <ChatBubbleIcon className="w-5 h-5 mr-3 text-slate-400 flex-shrink-0" />
                <span className="truncate flex-1">{session.title}</span>
              </a>
              <button 
                onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(session.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:bg-red-500/50 hover:text-white opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                aria-label={`Delete chat: ${session.title}`}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </nav>
      </div>
      
      <div className="mt-auto border-t border-slate-700 pt-4">
        <div className="flex items-center justify-between">
            <button onClick={onUserClick} className="flex items-center p-2 rounded-md hover:bg-[#2d2d40] transition-colors flex-grow text-left" disabled={!isGuestUser}>
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center mr-3 flex-shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="flex-grow">
                  <p className="font-semibold">{isGuestUser ? 'Guest User' : 'Moe User'}</p>
                  <p className="text-xs text-slate-400">{isGuestUser ? 'Login / Register' : 'Logged In'}</p>
                </div>
            </button>
            <button onClick={onSettingsClick} className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-[#2d2d40] transition-colors flex-shrink-0 ml-2" aria-label="Open settings">
                <GearIcon className="w-5 h-5" />
            </button>
        </div>
      </div>
    </aside>
  );
};