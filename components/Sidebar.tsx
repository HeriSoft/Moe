import React from 'react';
import type { ChatSession, UserProfile } from '../types';
import { PlusIcon, UserIcon, TrashIcon, StarIcon, MagnifyingGlassIcon } from './icons';

interface SidebarProps {
  chatSessions: ChatSession[];
  activeChatId: string | null;
  startNewChat: () => void;
  setActiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  toggleFavorite: (id: string) => void;
  onSettingsClick: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  isOpen: boolean;
  isLoggedIn: boolean;
  userProfile?: UserProfile;
}

const UserProfileSection: React.FC<{ 
  isLoggedIn: boolean; 
  userProfile?: UserProfile;
  onSignIn: () => void;
  onSignOut: () => void;
  onProfileClick: () => void;
}> = ({ isLoggedIn, userProfile, onSignIn, onSignOut, onProfileClick }) => {
  if (isLoggedIn && userProfile) {
    return (
        <div className="flex flex-col items-center w-full">
            <button onClick={onProfileClick} className="flex items-center p-2 rounded-md hover:bg-[#2d2d40] transition-colors text-left w-full">
                <img src={userProfile.imageUrl} alt={userProfile.name} className="w-8 h-8 rounded-full mr-3 flex-shrink-0" />
                <div className="flex-grow min-w-0">
                    <p className="font-semibold truncate">{userProfile.name}</p>
                    <p className="text-xs text-slate-400 truncate">{userProfile.email}</p>
                </div>
            </button>
            <button
                onClick={onSignOut}
                className="w-full mt-2 px-3 py-1.5 text-sm font-semibold bg-slate-600 hover:bg-red-500 rounded-md transition-colors"
            >
                Logout
            </button>
        </div>
    );
  }

  return (
    <button onClick={onSignIn} className="flex items-center p-2 rounded-md hover:bg-[#2d2d40] transition-colors flex-grow text-left w-full">
        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center mr-3 flex-shrink-0">
          <UserIcon className="w-5 h-5" />
        </div>
        <div className="flex-grow">
          <p className="font-semibold">Guest User</p>
          <p className="text-xs text-slate-400">Sign in to save chats</p>
        </div>
    </button>
  );
};


export const Sidebar: React.FC<SidebarProps> = ({ chatSessions, activeChatId, startNewChat, setActiveChat, deleteChat, toggleFavorite, onSettingsClick, onSignIn, onSignOut, isOpen, isLoggedIn, userProfile }) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const sortedSessions = React.useMemo(() => {
    const filtered = chatSessions.filter(session =>
        session.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
        const aFav = a.isFavorite ? 1 : 0;
        const bFav = b.isFavorite ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        const aLastTimestamp = a.messages[a.messages.length - 1]?.timestamp ?? 0;
        const bLastTimestamp = b.messages[b.messages.length - 1]?.timestamp ?? 0;
        return bLastTimestamp - aLastTimestamp;
    });
  }, [chatSessions, searchTerm]);

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#171725] text-white flex flex-col p-4 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Moe Chat</h1>
      </div>
      
      <button 
        onClick={startNewChat}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center transition-colors mb-4"
      >
        <PlusIcon className="w-5 h-5 mr-2" />
        New Chat
      </button>

       <div className="relative mb-4">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
              type="text"
              placeholder="Search chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#2d2d40] border border-slate-700/50 rounded-lg py-2 pl-10 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Search chat history"
          />
      </div>


      <div className="flex-1 overflow-y-auto -mr-2 pr-2">
        {isLoggedIn && chatSessions.length > 0 && (
            <h2 className="text-sm font-semibold text-slate-400 mb-2 px-2">Recent Chats</h2>
        )}
        <nav className="space-y-1">
          {sortedSessions.map((session) => (
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
                <img 
                    src={userProfile?.imageUrl || '/vite.svg'} // Use user image or a default
                    alt="" 
                    className="w-5 h-5 mr-3 rounded-full flex-shrink-0" 
                />
                <span className="truncate flex-1">{session.title}</span>
              </a>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-transparent group-hover:bg-[#2d2d40] rounded-md">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(session.id); }}
                  className="p-1.5 text-slate-400 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                  aria-label={`Favorite chat: ${session.title}`}
                >
                  <StarIcon className={`w-4 h-4 ${session.isFavorite ? 'text-yellow-400' : ''}`} solid={session.isFavorite} />
                </button>
                <button 
                  onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(session.id);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                  aria-label={`Delete chat: ${session.title}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </nav>
      </div>
      
      <div className="mt-auto border-t border-slate-700 pt-4">
          <UserProfileSection 
              isLoggedIn={isLoggedIn}
              userProfile={userProfile}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
              onProfileClick={onSettingsClick}
          />
      </div>
    </aside>
  );
};