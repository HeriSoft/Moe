import React from 'react';
import type { ChatSession, UserProfile } from '../types';
import { PlusIcon, UserIcon, TrashIcon, StarIcon, MagnifyingGlassIcon, ShieldCheckIcon, TicketIcon, DownloadIcon, MusicalNoteIcon } from './icons';
import * as googleDriveService from '../services/googleDriveService';

// --- NEW EXP SYSTEM HELPERS ---

const getExpForLevel = (level: number): number => {
    if (level >= 100) return Infinity;
    // New scaling formula: starts at 100, gets progressively harder.
    // e.g., L0->1: 100, L10->11: 1100, L50->51: 15100
    return 100 + (level * 50) + (level * level * 5);
};

const getLevelInfo = (level: number): { name: string; className: string; isMarquee?: boolean } => {
    if (level <= 5) return { name: 'Newbie', className: 'text-white' };
    if (level <= 10) return { name: 'Member', className: 'text-cyan-400' };
    if (level <= 15) return { name: 'Active Member', className: 'text-purple-400' }; // Light Purple
    if (level <= 20) return { name: 'Enthusiast', className: 'text-purple-500' };
    if (level <= 25) return { name: 'Contributor', className: 'bg-gradient-to-r from-purple-400 to-white bg-clip-text text-transparent' };
    if (level <= 30) return { name: 'Pro', className: 'bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' };
    if (level <= 35) return { name: 'Veteran', className: 'bg-gradient-to-r from-pink-400 to-red-400 bg-clip-text text-transparent' };
    if (level <= 40) return { name: 'Expert', className: 'bg-gradient-to-r from-lime-400 to-white bg-clip-text text-transparent' }; // Green/White
    if (level <= 45) return { name: 'Master', className: 'bg-gradient-to-r from-lime-400 to-yellow-400 bg-clip-text text-transparent' };
    if (level <= 50) return { name: 'Grandmaster', className: 'bg-gradient-to-r from-purple-400 to-lime-400 bg-clip-text text-transparent' };
    if (level <= 55) return { name: 'Guardian', className: 'bg-gradient-to-r from-teal-400 to-white bg-clip-text text-transparent' };
    if (level <= 60) return { name: 'Titan', className: 'bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent' };
    if (level <= 65) return { name: 'Immortal', className: 'bg-gradient-to-r from-red-500 to-yellow-400 bg-clip-text text-transparent animate-pulse' }; // Red/Yellow Pulse
    if (level <= 70) return { name: 'Mythic', className: 'bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent animate-pulse' }; // Red/Blue Pulse
    if (level <= 75) return { name: 'Ascendant', className: 'level-ascendant bg-gradient-to-r from-teal-400 to-yellow-400 bg-clip-text text-transparent animate-pulse', isMarquee: true }; // Teal/Yellow Pulse + Marquee
    return { name: 'Legend', className: 'bg-gradient-to-r from-amber-400 via-red-500 to-purple-500 animate-pulse bg-clip-text text-transparent' };
};


// VIP Tag component
const VipTag: React.FC = () => <span className="vip-tag-shine">VIP</span>;

interface SidebarProps {
  chatSessions: ChatSession[];
  activeChatId: string | null;
  startNewChat: () => void;
  setActiveChat: (id: string) => void;
  deleteChat: (id: string) => void;
  toggleFavorite: (id: string) => void;
  onSettingsClick: () => void;
  onAdminPanelClick: () => void;
  onAdminMovieModalClick: () => void;
  onAdminFilesLibraryClick: () => void;
  onAdminMusicClick: () => void; // For Music Management
  onMembershipClick: () => void;
  isAdmin: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  isOpen: boolean;
  isLoggedIn: boolean;
  userProfile?: UserProfile;
  siteSettings: { logoDriveId?: string | null };
}

const UserProfileSection: React.FC<{ 
  isLoggedIn: boolean; 
  userProfile?: UserProfile;
  onSignIn: () => void;
  onSignOut: () => void;
  onProfileClick: () => void;
  onAdminPanelClick: () => void;
  onAdminMovieModalClick: () => void;
  onAdminFilesLibraryClick: () => void;
  onAdminMusicClick: () => void; // For Music Management
  onMembershipClick: () => void;
  isAdmin: boolean;
}> = ({ isLoggedIn, userProfile, onSignIn, onSignOut, onProfileClick, onAdminPanelClick, onAdminMovieModalClick, onAdminFilesLibraryClick, onAdminMusicClick, onMembershipClick, isAdmin }) => {
  if (isLoggedIn && userProfile) {
    const level = userProfile.level ?? 0;
    const exp = userProfile.exp ?? 0;
    const expNeeded = getExpForLevel(level);
    const progress = level >= 100 ? 100 : Math.round((exp / expNeeded) * 100);
    const levelInfo = getLevelInfo(level);
    
    const hasCustomColor = userProfile.hasPermanentNameColor;
    const customColorClass = 'bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent';
    const nameClass = hasCustomColor ? customColorClass : levelInfo.className;

    const UserNameContent = (
      <>
        <span>{userProfile.name}</span>
        {userProfile.isPro && <VipTag />}
      </>
    );

    const UserNameDisplay = (
        <p className={`font-semibold flex items-center gap-2 ${nameClass} ${!levelInfo.isMarquee && 'truncate'}`}>
            {UserNameContent}
        </p>
    );

    const MarqueeUserNameDisplay = (
       <div className="w-full overflow-hidden whitespace-nowrap">
            <p className={`font-semibold inline-flex items-center gap-2 ${nameClass}`}>
                {UserNameContent}
            </p>
       </div>
    );

    return (
        <div className="flex flex-col items-center w-full">
            <button 
                onClick={onProfileClick} 
                className={`relative p-2 rounded-md hover:bg-[#2d2d40] transition-colors text-left w-full ${userProfile.hasSakuraBanner ? 'sakura-banner' : ''}`}
            >
                <div className="flex items-center">
                    <img src={userProfile.imageUrl} alt={userProfile.name} className="w-8 h-8 rounded-full mr-3 flex-shrink-0" />
                    <div className="flex-grow min-w-0">
                        {levelInfo.isMarquee ? MarqueeUserNameDisplay : UserNameDisplay}
                        <p className="text-xs text-slate-400 truncate">{userProfile.email}</p>
                    </div>
                </div>
            </button>

            {/* EXP BAR */}
            <div className="w-full mt-2 px-2">
                <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-bold text-slate-300">Lv. {level}</span>
                    <span className="text-slate-400">{exp} / {expNeeded === Infinity ? 'MAX' : expNeeded} EXP</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div 
                        className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-2.5 rounded-full" 
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
                 <div className="text-right text-xs mt-1 text-slate-400">{progress}%</div>
            </div>

            <div className="w-full mt-2 space-y-2">
              <button
                onClick={onMembershipClick}
                className="w-full px-3 py-1.5 text-sm font-semibold bg-amber-600 hover:bg-amber-700 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <TicketIcon className="w-5 h-5" />
                {userProfile.isPro ? 'Membership Management' : 'Upgrade to Pro'}
              </button>
            </div>
            {isAdmin && (
              <div className="w-full mt-2 space-y-2">
                <button
                  onClick={onAdminPanelClick}
                  className="w-full px-3 py-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <ShieldCheckIcon className="w-5 h-5" />
                  Admin Panel
                </button>
                <button
                  onClick={onAdminMovieModalClick}
                  className="w-full px-3 py-1.5 text-sm font-semibold bg-sky-600 hover:bg-sky-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <TicketIcon className="w-5 h-5" />
                  Movie Management
                </button>
                 <button
                  onClick={onAdminFilesLibraryClick}
                  className="w-full px-3 py-1.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <DownloadIcon className="w-5 h-5" />
                  Files Management
                </button>
                <button
                  onClick={onAdminMusicClick}
                  className="w-full px-3 py-1.5 text-sm font-semibold bg-pink-600 hover:bg-pink-700 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <MusicalNoteIcon className="w-5 h-5" />
                  Music Management
                </button>
              </div>
            )}
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


export const Sidebar: React.FC<SidebarProps> = ({ chatSessions, activeChatId, startNewChat, setActiveChat, deleteChat, toggleFavorite, onSettingsClick, onAdminPanelClick, onAdminMovieModalClick, onAdminFilesLibraryClick, onAdminMusicClick, onMembershipClick, isAdmin, onSignIn, onSignOut, isOpen, isLoggedIn, userProfile, siteSettings }) => {
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
    <>
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#171725] text-white flex flex-col p-4 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-6 h-10 flex items-center">
            {siteSettings?.logoDriveId ? (
                <img 
                    src={googleDriveService.getDriveFilePublicUrl(siteSettings.logoDriveId)}
                    alt="Moe Chat Logo"
                    className="max-h-full w-auto"
                />
            ) : (
                <h1 className="text-2xl font-bold">Moe Chat</h1>
            )}
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
                onAdminPanelClick={onAdminPanelClick}
                onAdminMovieModalClick={onAdminMovieModalClick}
                onAdminFilesLibraryClick={onAdminFilesLibraryClick}
                onAdminMusicClick={onAdminMusicClick}
                onMembershipClick={onMembershipClick}
                isAdmin={isAdmin}
            />
        </div>
      </aside>
      <style>{`
        @keyframes shine-vip {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .vip-tag-shine {
            position: relative;
            display: inline-block;
            padding: 2px 8px;
            font-size: 0.75rem; /* 12px */
            font-weight: 700;
            line-height: 1.2;
            color: #1e293b; /* slate-800 */
            background: linear-gradient(110deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%);
            border-radius: 0.375rem; /* rounded-md */
            overflow: hidden;
            -webkit-mask-image: -webkit-radial-gradient(white, black);
        }
        .vip-tag-shine::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(110deg, transparent 25%, rgba(255, 255, 255, 0.6) 50%, transparent 75%);
            animation: shine-vip 3s ease-in-out infinite;
            animation-delay: 1s;
        }
        @keyframes marquee-ascendant {
            0% { transform: translateX(50%); }
            100% { transform: translateX(-100%); }
        }
        .level-ascendant {
            animation: marquee-ascendant 10s linear infinite;
        }
        .sakura-banner::before {
            content: '';
            position: absolute;
            top: -10%;
            right: -10%;
            width: 60%;
            height: 60%;
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 0 C 40 20, 20 20, 20 40 C 20 60, 40 70, 50 100 C 60 70, 80 60, 80 40 C 80 20, 60 20, 50 0 Z" fill="%23FFC0CB" opacity="0.8"/><path d="M50 10 C 45 25, 30 25, 30 40 C 30 55, 45 65, 50 90 C 55 65, 70 55, 70 40 C 70 25, 55 25, 50 10 Z" fill="%23FFFFFF" opacity="0.9"/><circle cx="50" cy="45" r="5" fill="%23FFDF00"/></svg>');
            background-repeat: no-repeat;
            background-position: top right;
            background-size: contain;
            opacity: 0.15;
            pointer-events: none;
            transform: rotate(15deg);
        }
      `}</style>
    </>
  );
};
