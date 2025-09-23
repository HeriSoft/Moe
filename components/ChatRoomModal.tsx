import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CloseIcon, MinusIcon, SendIcon, StarIcon, ShieldCheckIcon, PencilSquareIcon, CheckIcon } from './icons';
import type { UserProfile, ChatRoomMessage, OnlineUser } from '../types';
import * as firebaseService from '../services/firebaseService';
import { getLevelInfo, VipTag } from './uiUtils';
import { renderFormattedText } from './utils';

// --- USER POPOVER SUB-COMPONENT ---
const UserInfoPopover: React.FC<{
  user: OnlineUser;
  onClose: () => void;
  isCurrentUser: boolean;
  onProfileUpdate: (newAboutMe: string) => void;
  anchorEl: HTMLElement | null;
}> = ({ user, onClose, isCurrentUser, onProfileUpdate, anchorEl }) => {
    const [isEditingAboutMe, setIsEditingAboutMe] = useState(false);
    const [aboutMeText, setAboutMeText] = useState(user.aboutMe || '');
    const popoverRef = useRef<HTMLDivElement>(null);

    const handleSaveAboutMe = async () => {
        if (aboutMeText !== user.aboutMe) {
            try {
                await firebaseService.updateAboutMe(user.email, aboutMeText);
                onProfileUpdate(aboutMeText);
            } catch (error) {
                console.error("Failed to update about me:", error);
            }
        }
        setIsEditingAboutMe(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);
    
    if (!anchorEl) return null;

    const rect = anchorEl.getBoundingClientRect();
    const popoverStyle: React.CSSProperties = {
        position: 'absolute',
        top: `${rect.bottom + window.scrollY + 5}px`,
        left: `${rect.left + window.scrollX}px`,
        transform: 'translateX(-50%)',
    };

    const levelInfo = getLevelInfo(user.level ?? 0);
    const hasCustomColor = user.hasPermanentNameColor;
    const nameClass = hasCustomColor ? 'bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent' : levelInfo.className;

    return (
        <div ref={popoverRef} style={popoverStyle} className="z-[100] w-64 bg-slate-100 dark:bg-slate-800 rounded-lg shadow-xl border border-slate-300 dark:border-slate-600 p-4">
            <div className={`relative flex flex-col items-center ${user.hasSakuraBanner ? 'sakura-banner' : ''}`}>
                <img src={user.imageUrl} alt={user.name} className="w-16 h-16 rounded-full mb-2 border-2 border-white dark:border-slate-500" />
                <h4 className={`font-bold text-lg flex items-center gap-2 ${nameClass}`}>
                    {user.name}
                    {user.isPro && <VipTag />}
                    {user.isModerator && <ShieldCheckIcon className="w-4 h-4 text-purple-400" />}
                </h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Level {user.level ?? 0} - {levelInfo.name}</p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
                <div className="flex justify-between items-center mb-1">
                    <h5 className="text-xs font-semibold uppercase text-slate-500">About Me</h5>
                    {isCurrentUser && !isEditingAboutMe && (
                        <button onClick={() => setIsEditingAboutMe(true)} className="text-slate-400 hover:text-indigo-400"><PencilSquareIcon className="w-4 h-4" /></button>
                    )}
                     {isCurrentUser && isEditingAboutMe && (
                        <button onClick={handleSaveAboutMe} className="text-slate-400 hover:text-green-400"><CheckIcon className="w-4 h-4" /></button>
                    )}
                </div>
                {isEditingAboutMe ? (
                    <textarea value={aboutMeText} onChange={(e) => setAboutMeText(e.target.value)} className="w-full text-sm bg-white dark:bg-slate-700 p-1 rounded border border-slate-400" rows={3}/>
                ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-300 italic break-words">{user.aboutMe || 'No information provided.'}</p>
                )}
            </div>
            {!isCurrentUser && (
                <div className="mt-4 flex">
                    <button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold py-1 rounded-md">PM</button>
                </div>
            )}
        </div>
    );
};

// --- MAIN MODAL COMPONENT ---
interface ChatRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  userProfile?: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | undefined>>;
}

export const ChatRoomModal: React.FC<ChatRoomModalProps> = ({ isOpen, onClose, onMinimize, userProfile, setUserProfile }) => {
    const [messages, setMessages] = useState<ChatRoomMessage[]>([]);
    const [users, setUsers] = useState<{[key: string]: OnlineUser}>({});
    const [input, setInput] = useState('');
    const [popover, setPopover] = useState<{ user: OnlineUser; anchorEl: HTMLElement } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen || !userProfile) return;

        firebaseService.setupPresence(userProfile);
        
        const unsubscribeMessages = firebaseService.onNewMessage(setMessages);
        const unsubscribeUsers = firebaseService.onUsersStatusChange(setUsers);

        return () => {
            unsubscribeMessages();
            unsubscribeUsers();
        };
    }, [isOpen, userProfile]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim() && userProfile) {
            firebaseService.sendMessage(input, userProfile);
            setInput('');
        }
    };
    
    const { onlineUsers, offlineUsers } = useMemo(() => {
        const online: OnlineUser[] = [];
        const offline: OnlineUser[] = [];
        Object.values(users).forEach(user => {
            if (user.isOnline) online.push(user);
            else offline.push(user);
        });
        return { onlineUsers: online, offlineUsers: offline };
    }, [users]);
    
    const handleUserClick = (user: OnlineUser, event: React.MouseEvent<HTMLElement>) => {
        setPopover({ user, anchorEl: event.currentTarget });
    };

    const handleProfileUpdate = (newAboutMe: string) => {
        if (userProfile) {
            setUserProfile(prev => prev ? { ...prev, aboutMe: newAboutMe } : undefined);
            setUsers(prev => ({ ...prev, [userProfile.id]: { ...prev[userProfile.id], aboutMe: newAboutMe } }));
        }
    };

    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-slate-100 dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col p-4 sm:p-6 m-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Chat Room</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onMinimize} className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><MinusIcon className="w-7 h-7"/></button>
                        <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7"/></button>
                    </div>
                </div>

                <div className="flex flex-grow min-h-0 gap-6">
                    {/* Left: Chat Area */}
                    <div className="flex flex-col flex-grow w-2/3 bg-white dark:bg-[#212133] rounded-lg">
                        <div ref={messagesEndRef} className="flex-grow p-4 overflow-y-auto space-y-4">
                           {messages.map(msg => {
                               const isCurrentUser = msg.user.id === userProfile?.id;
                               const levelInfo = getLevelInfo(msg.user.level ?? 0);
                               const nameClass = msg.user.hasPermanentNameColor ? 'bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent' : levelInfo.className;
                               
                               return (
                                <div key={msg.id} className={`flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                                    <img src={msg.user.imageUrl} alt={msg.user.name} className="w-8 h-8 rounded-full"/>
                                    <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                                        <button onClick={(e) => handleUserClick(users[msg.user.id], e)} className={`text-sm font-semibold flex items-center gap-1.5 ${nameClass}`}>
                                            {msg.user.name}
                                            {msg.user.isPro && <VipTag />}
                                            {msg.user.isModerator && <ShieldCheckIcon className="w-3 h-3 text-purple-400" />}
                                        </button>
                                        <div className={`mt-1 p-3 rounded-lg max-w-xs md:max-w-md break-words text-white ${isCurrentUser ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                                            {renderFormattedText(msg.text)}
                                        </div>
                                    </div>
                                </div>
                               );
                           })}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                           <form onSubmit={handleSubmit} className="relative">
                               <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." className="w-full bg-slate-100 dark:bg-slate-800 rounded-full py-3 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                               <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 rounded-full text-white flex items-center justify-center hover:bg-indigo-700 disabled:bg-indigo-400" disabled={!input.trim()}><SendIcon className="w-5 h-5"/></button>
                           </form>
                        </div>
                    </div>
                    {/* Right: User List */}
                    <div className="w-1/3 bg-white dark:bg-slate-800 rounded-lg p-4 flex flex-col">
                        <div className="flex-grow overflow-y-auto">
                           <h3 className="font-bold text-lg mb-2 text-slate-800 dark:text-white">Online ({onlineUsers.length})</h3>
                           <div className="space-y-3">
                            {onlineUsers.map(user => <UserListItem key={user.id} user={user} isOnline={true} onClick={(e) => handleUserClick(user, e)}/>)}
                           </div>
                           <h3 className="font-bold text-lg mt-6 mb-2 text-slate-800 dark:text-white">Offline ({offlineUsers.length})</h3>
                           <div className="space-y-3">
                            {offlineUsers.map(user => <UserListItem key={user.id} user={user} isOnline={false} onClick={(e) => handleUserClick(user, e)}/>)}
                           </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {popover && <UserInfoPopover user={popover.user} onClose={() => setPopover(null)} isCurrentUser={popover.user.id === userProfile?.id} onProfileUpdate={handleProfileUpdate} anchorEl={popover.anchorEl}/>}
        <style>{`.sakura-banner::before { content: ''; position: absolute; top: -10%; right: -10%; width: 60%; height: 60%; background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 0 C 40 20, 20 20, 20 40 C 20 60, 40 70, 50 100 C 60 70, 80 60, 80 40 C 80 20, 60 20, 50 0 Z" fill="%23FFC0CB" opacity="0.8"/><path d="M50 10 C 45 25, 30 25, 30 40 C 30 55, 45 65, 50 90 C 55 65, 70 55, 70 40 C 70 25, 55 25, 50 10 Z" fill="%23FFFFFF" opacity="0.9"/><circle cx="50" cy="45" r="5" fill="%23FFDF00"/></svg>'); background-repeat: no-repeat; background-position: top right; background-size: contain; opacity: 0.15; pointer-events: none; transform: rotate(15deg); }`}</style>
        </>
    );
};

const UserListItem: React.FC<{ user: OnlineUser, isOnline: boolean, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }> = ({ user, isOnline, onClick }) => {
    const levelInfo = getLevelInfo(user.level ?? 0);
    const hasCustomColor = user.hasPermanentNameColor;
    const nameClass = hasCustomColor ? 'bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent' : levelInfo.className;

    return (
        <button onClick={onClick} className={`w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 ${!isOnline ? 'opacity-50' : ''}`}>
            <div className="relative flex-shrink-0">
                <img src={user.imageUrl} alt={user.name} className="w-9 h-9 rounded-full"/>
                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 ${isOnline ? 'bg-green-500' : 'bg-slate-500'}`}></div>
            </div>
            <p className={`font-semibold text-sm truncate ${nameClass}`}>
                {user.name}
            </p>
        </button>
    );
};
