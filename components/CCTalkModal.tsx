import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { UserIcon, PlusIcon, SendIcon, MicrophoneIcon, StarIcon, CloseIcon } from './icons';
import type { UserProfile } from '../types';

interface CCTalkModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

const mockUser: UserProfile = {
  id: 'current_user_123',
  name: 'Bạn',
  email: 'gamer@example.com',
  imageUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
};

const initialOtherUsers = Array.from({ length: 5 }, (_, i) => ({
    id: `mockuser${i}`,
    name: `User${i + 1}`,
    email: `user${i+1}@example.com`,
    imageUrl: `https://i.pravatar.cc/150?u=user${i + 1}`
}));

const ADMIN_EMAIL = 'heripixiv@gmail.com';

const VipTag: React.FC = () => <span className="vip-tag-shine">VIP</span>;


export const CCTalkModal: React.FC<CCTalkModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'welcome' | 'selection' | 'game_room'>('welcome');
  const [queue, setQueue] = useState<UserProfile[]>(initialOtherUsers);
  const [currentRoom, setCurrentRoom] = useState<{ id: string; members: UserProfile[]; occupancy: { current: number; max: number } } | null>(null);
  const [talkingMemberId, setTalkingMemberId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetUser: UserProfile } | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [currentUserSlotIndex, setCurrentUserSlotIndex] = useState(0);
  
  // --- New State ---
  const [hoveredRoomId, setHoveredRoomId] = useState<number | null>(null);
  const [roomOccupancy, setRoomOccupancy] = useState<Record<number, { current: number, max: number }>>({});
  const [pinnedMessage, setPinnedMessage] = useState<string | null>(null);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [isCountdownFrozen, setIsCountdownFrozen] = useState(false);
  const [moderators, setModerators] = useState<Set<string>>(new Set());
  const [premiumUsers, setPremiumUsers] = useState<Set<string>>(new Set(['mockuser1'])); // Mock a premium user
  const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());
  const [mockMessages, setMockMessages] = useState([
        { userId: 'admin', user: 'Admin', text: `Chào mừng và mọi người đến với sảnh chờ!` },
        { userId: 'teammate1', user: 'Đồng đội 1', text: 'Vào game thôi nào!' },
        { userId: 'teammate3', user: 'Let\'s goooo!' },
        { userId: 'current_user_123', user: 'Bạn', text: 'Ok, mời mình nhé.' },
    ]);
  
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<number | null>(null);
  
  const currentUser = userProfile || mockUser;
  const isAdmin = currentUser.email === ADMIN_EMAIL;
  
  const isMod = (user: UserProfile) => moderators.has(user.id);
  const isPremium = (user: UserProfile) => premiumUsers.has(user.id);
  const canModerate = isAdmin || isMod(currentUser);

  // --- MOCK DATA ---
  useEffect(() => {
    const newOccupancy: Record<number, { current: number, max: number }> = {};
    for (let i = 1; i <= 100; i++) {
        newOccupancy[i] = { current: Math.floor(Math.random() * 6), max: 5 };
    }
    setRoomOccupancy(newOccupancy);
  }, [isOpen]);
  
  const handleLeaveQueue = useCallback(() => {
    setQueue(prev => prev.filter(u => u.id !== currentUser.id));
  }, [currentUser.id]);

  useEffect(() => {
    if (isOpen && !currentRoom) {
      const userInQueue = queue.some(u => u.id === currentUser.id);
      if (!userInQueue) {
         setQueue(prevQueue => [currentUser, ...prevQueue.filter(u => u.id !== currentUser.id)]);
      }
    }
  }, [isOpen, currentUser, currentRoom]);
  

  const teamSlots = useMemo(() => {
    const newTeamSlots = Array(5).fill(null);
    const userAtHead = queue[0];
    if (userAtHead?.id === currentUser.id) {
        newTeamSlots[currentUserSlotIndex] = userAtHead;
    } else if (userAtHead) {
        newTeamSlots[0] = userAtHead;
    }
    return newTeamSlots;
  }, [queue, currentUser.id, currentUserSlotIndex]);


  useEffect(() => {
    const isUserAtHead = queue[0]?.id === currentUser.id;
    
    if (isUserAtHead) {
        if (!countdownRef.current) {
            setCountdown(60);
            countdownRef.current = window.setInterval(() => {
                if (!isCountdownFrozen) {
                    setCountdown(prev => {
                        if (prev <= 1) {
                            clearInterval(countdownRef.current!);
                            countdownRef.current = null;
                            handleLeaveQueue();
                            return 0;
                        }
                        return prev - 1;
                    });
                }
            }, 1000);
        }
    } else {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    }

    return () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [queue, currentUser.id, handleLeaveQueue, isCountdownFrozen]);

  useEffect(() => {
    if (currentRoom) {
      const interval = setInterval(() => {
        const members = currentRoom.members;
        const talkingCandidate = members[Math.floor(Math.random() * members.length)];
        setTalkingMemberId(talkingCandidate.id);
        setTimeout(() => setTalkingMemberId(null), 1000);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [currentRoom]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
            setContextMenu(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEnterRoom = () => {
    const randomRoomId = String(Math.floor(Math.random() * 100) + 1).padStart(2, '0');
    const teamMembers = [
      currentUser,
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `teammate${i}`,
        name: `Đồng đội ${i + 1}`,
        email: `teammate${i}@example.com`,
        imageUrl: `https://i.pravatar.cc/150?u=teammate${i}`
      }))
    ];
    setCurrentRoom({ id: randomRoomId, members: teamMembers, occupancy: { current: 5, max: 5 } });
    setQueue(prev => prev.filter(u => u.id !== currentUser.id)); 
  };
  
  const handleExitRoom = () => {
    setCurrentRoom(null);
    setContextMenu(null);
    setQueue(prev => [currentUser, ...prev.filter(u => u.id !== currentUser.id)]);
  };

  const handleOpenAdminMenu = (event: React.MouseEvent, targetUser: UserProfile) => {
    if (!canModerate) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, targetUser });
  };
  
  const handleSlotClick = (newIndex: number) => {
    if (queue[0]?.id === currentUser.id && teamSlots[newIndex] === null) {
        setCurrentUserSlotIndex(newIndex);
    }
  };

  // --- Admin/Mod Handlers ---
  const handleKick = (userId: string) => setQueue(prev => prev.filter(u => u.id !== userId));
  const handlePromote = (userId: string) => {
      setQueue(prev => {
          const userToPromote = prev.find(u => u.id === userId);
          if (!userToPromote) return prev;
          const rest = prev.filter(u => u.id !== userId);
          return [userToPromote, ...rest];
      });
  };
  const handleToggleFreeze = () => setIsCountdownFrozen(prev => !prev);
  const handleToggleMod = (userId: string) => {
      setModerators(prev => {
          const newMods = new Set(prev);
          if (newMods.has(userId)) newMods.delete(userId);
          else newMods.add(userId);
          return newMods;
      });
  };
  const handleTogglePremium = (userId: string) => { // For demo
      setPremiumUsers(prev => {
          const newSet = new Set(prev);
          if (newSet.has(userId)) newSet.delete(userId);
          else newSet.add(userId);
          return newSet;
      });
  };
  const handleSetPin = () => {
      if (adminPinInput.trim()) setPinnedMessage(adminPinInput.trim());
      setAdminPinInput('');
  };
  const handleClearPin = () => setPinnedMessage(null);
  const handleToggleBan = (userId: string) => {
      setBannedUsers(prev => {
          const newSet = new Set(prev);
          if (newSet.has(userId)) newSet.delete(userId);
          else newSet.add(userId);
          return newSet;
      });
  };
  const handleClearUserChat = (userId: string) => {
      setMockMessages(prev => prev.filter(msg => msg.userId !== userId));
  };


  const renderUserName = (user: UserProfile, options: { showIcons?: boolean } = {}) => {
    const { showIcons = true } = options;
    const userIsAdmin = user.email === ADMIN_EMAIL;
    const userIsMod = isMod(user);
    const userIsPremium = isPremium(user);
    
    let nameClass = '';
    if (userIsAdmin) nameClass = 'font-bold text-red-500';
    else if (userIsMod) nameClass = 'font-bold text-purple-400';

    return (
        <span className="flex items-center gap-1.5 text-sm truncate">
            <span className={nameClass}>{user.name}</span>
            {showIcons && (userIsAdmin || userIsMod) && <VipTag />}
            {showIcons && userIsPremium && <StarIcon className="w-4 h-4 text-yellow-400" solid />}
        </span>
    );
  };
  
  const renderWelcome = () => (
    <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white">ccTalk - Kết nối giao lưu</h1>
        <button onClick={() => setView('selection')} className="mt-8 w-full max-w-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 text-lg">
            Tham gia ngay
        </button>
        <footer className="absolute bottom-4">
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold py-2 px-6 rounded-lg transition-colors text-sm">Thoát ccTalk</button>
        </footer>
    </div>
  );

  const renderSelection = () => (
    <div className="relative flex flex-col items-center justify-center h-full text-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white mb-8">ccTalk - Kết nối giao lưu</h1>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <button onClick={() => setView('game_room')} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-bold py-6 px-4 rounded-lg transition-colors text-xl">Phòng Game</button>
            <button onClick={() => alert('Chức năng này đang được phát triển!')} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-6 px-4 rounded-lg transition-colors text-xl">Phòng Trò chuyện / Ca hát</button>
        </div>
        <footer className="absolute bottom-4">
            <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold py-2 px-6 rounded-lg transition-colors text-sm">Thoát ccTalk</button>
        </footer>
    </div>
  );
  
  const renderGameRoom = () => (
    <div className="flex flex-col h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
      <header className="flex-shrink-0 flex h-48">
        <div className="w-1/3 pr-2 flex flex-col border-r border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Hàng đợi</h2>
            {queue[0] && (
                <div onClick={(e) => handleOpenAdminMenu(e, queue[0])} className={`flex items-center p-1.5 rounded-md mb-2 ${queue[0].id === currentUser.id ? 'bg-indigo-500/20 ring-1 ring-indigo-400' : 'bg-slate-100 dark:bg-slate-800/50'} ${canModerate ? 'cursor-pointer' : ''}`}>
                    <span className="font-mono text-sm mr-2">1.</span>
                    <img src={queue[0].imageUrl} alt={queue[0].name} className="w-6 h-6 rounded-full mr-2" />
                    <div className="truncate flex-grow">{renderUserName(queue[0])}</div>
                    {queue[0].id === currentUser.id ? (
                        <>
                            <MicrophoneIcon className="w-4 h-4 text-green-400 animate-pulse mr-2" />
                            <span className="font-mono text-xs text-amber-400">{countdown}s</span>
                        </>
                    ) : <MicrophoneIcon className="w-4 h-4 text-slate-500" />}
                </div>
            )}
            <div className="flex-grow space-y-1 overflow-y-auto pr-2 min-h-0">
                {queue.slice(1, 5).map((user, index) => (
                    <div key={user.id} onClick={(e) => handleOpenAdminMenu(e, user)} className={`flex items-center bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-md ${canModerate ? 'cursor-pointer' : ''}`}>
                        <span className="font-mono text-sm mr-2">{index + 2}.</span>
                        <img src={user.imageUrl} alt={user.name} className="w-6 h-6 rounded-full mr-2" />
                        <div className="truncate flex-grow">{renderUserName(user)}</div>
                    </div>
                ))}
            </div>
            <div className="mt-2 flex-shrink-0">
                 {queue[0]?.id === currentUser.id ? (
                    <div className="flex gap-2">
                        <button onClick={handleEnterRoom} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1.5 rounded">Vào phòng</button>
                        <button onClick={handleLeaveQueue} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-1.5 rounded">Xuống</button>
                    </div>
                 ) : (
                    <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1.5 rounded" onClick={() => setQueue(prev => [currentUser, ...prev.filter(u => u.id !== currentUser.id)])}>Tham gia</button>
                 )}
            </div>
        </div>
        <div className="w-2/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center">Tuyển team</h2>
            <div className="flex-grow grid grid-cols-5 gap-2 sm:gap-4 items-center">
              {teamSlots.map((user, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                    <button 
                        onClick={() => handleSlotClick(index)}
                        disabled={!!user || queue[0]?.id !== currentUser.id}
                        className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center border-2 border-transparent disabled:cursor-not-allowed hover:enabled:border-indigo-400 transition-colors"
                    >
                        {user ? (
                           <img src={user.imageUrl} alt={user.name} className="w-full h-full object-cover rounded-full" />
                        ) : (
                           <PlusIcon className="w-8 h-8 text-slate-500" />
                        )}
                    </button>
                    {user && <div className="text-xs text-center font-semibold truncate w-full">{renderUserName(user, { showIcons: false })}</div>}
                </div>
              ))}
            </div>
        </div>
      </header>
      <main className="flex-grow flex mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 min-h-0">
        <div className="w-1/3 pr-2 border-r border-slate-200 dark:border-slate-700 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Danh sách phòng</h2>
            <div className="flex-grow overflow-y-auto pr-2 space-y-1">
                {Object.entries(roomOccupancy).map(([id, occ]) => (
                    <div key={id} onMouseEnter={() => setHoveredRoomId(Number(id))} onMouseLeave={() => setHoveredRoomId(null)} className="flex items-center justify-between w-full text-left p-2 rounded-md hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 transition-colors font-medium">
                        <span>Phòng {String(id).padStart(2, '0')} ({occ.current}/{occ.max})</span>
                        {hoveredRoomId === Number(id) && (
                            <button onClick={() => occ.current >= occ.max ? alert('Phòng đã đầy.') : alert(`Tham gia phòng ${id}`)} className="bg-indigo-600 text-white text-xs px-2 py-1 rounded">Tham gia</button>
                        )}
                    </div>
                ))}
            </div>
        </div>
        <div className="w-2/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Chat</h2>
            <div className="flex-grow bg-slate-100 dark:bg-slate-800/50 rounded-t-md p-2 overflow-y-auto text-sm space-y-2">
                 {pinnedMessage && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-400 p-2 rounded-md flex justify-between items-start">
                        <p className="font-bold break-words">{pinnedMessage}</p>
                        {canModerate && <button onClick={handleClearPin}><CloseIcon className="w-4 h-4"/></button>}
                    </div>
                )}
                {mockMessages.map((msg, index) => <p key={index}><strong className="text-blue-400 cursor-pointer">{msg.user}:</strong> {msg.text}</p>)}
            </div>
            {canModerate && 
                <form onSubmit={(e) => { e.preventDefault(); handleSetPin(); }} className="flex-shrink-0 flex">
                    <input type="text" value={adminPinInput} onChange={e => setAdminPinInput(e.target.value)} placeholder="Ghim thông báo..." className="flex-grow bg-white dark:bg-slate-700 p-2 focus:outline-none text-sm"/>
                    <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2">Pin</button>
                </form>
            }
            <form className="flex-shrink-0 flex"><input type="text" placeholder="Nhập chat..." className="flex-grow bg-white dark:bg-slate-700 p-2 rounded-bl-md focus:outline-none text-sm"/><button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-br-md"><SendIcon className="w-5 h-5"/></button></form>
        </div>
      </main>
      <footer className="flex-shrink-0 mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 flex justify-center">
        <button onClick={() => setView('selection')} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors">Quay lại</button>
      </footer>
    </div>
  );
  
  const renderInRoom = () => {
    if (!currentRoom) return null;

    return (
        <div className="flex flex-col h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
            <header className="flex-shrink-0 flex justify-center flex-wrap gap-4 sm:gap-6 mb-4 pb-4 border-b border-slate-700">
                {currentRoom.members.map(member => (
                    <div key={member.id} className="flex flex-col items-center gap-2" onClick={(e) => handleOpenAdminMenu(e, member)}>
                         <div className={`relative w-16 h-16 sm:w-20 sm:h-20 ${canModerate ? 'cursor-pointer' : ''}`}>
                            <img src={member.imageUrl} alt={member.name} className="w-full h-full rounded-full object-cover border-4 border-slate-400 dark:border-slate-600"/>
                            <div className={`absolute -bottom-1 -right-1 p-1 bg-slate-200 dark:bg-slate-900 rounded-full transition-colors ${talkingMemberId === member.id ? 'animate-pulse' : ''}`}>
                                <MicrophoneIcon className={`w-5 h-5 transition-colors ${talkingMemberId === member.id ? 'text-green-400' : 'text-slate-500'}`} />
                            </div>
                        </div>
                        <div className="text-sm font-semibold truncate max-w-full text-center">{renderUserName(member)}</div>
                    </div>
                ))}
            </header>
            
            <main className="flex-grow flex flex-col bg-slate-100 dark:bg-slate-800/50 rounded-md min-h-0">
                <div className="flex-grow p-4 overflow-y-auto space-y-4">
                    {mockMessages.map((msg, index) => !bannedUsers.has(msg.userId) && (
                        <div key={index} className={`flex items-start gap-3 ${msg.userId === currentUser.id ? 'flex-row-reverse' : ''}`}>
                            <div className={`rounded-lg p-3 max-w-[75%] ${msg.userId === currentUser.id ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700'}`}>
                                <p onClick={(e) => handleOpenAdminMenu(e, {id: msg.userId, name: msg.user, email: '', imageUrl: ''})} className={`font-bold text-sm mb-1 ${canModerate ? 'cursor-pointer' : ''}`}>{msg.user}</p>
                                <p className="text-sm">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <form className="flex-shrink-0 flex m-2">
                    <input type="text" placeholder="Nhập chat..." className="flex-grow bg-white dark:bg-slate-700 p-2 rounded-l-md focus:outline-none text-sm"/>
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-r-md"><SendIcon className="w-5 h-5"/></button>
                </form>
            </main>

            <footer className="flex-shrink-0 mt-4 flex justify-center">
                 <button onClick={handleExitRoom} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-8 rounded-lg transition-colors">
                    Thoát phòng
                </button>
            </footer>
        </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] max-h-[800px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {(view === 'welcome') && renderWelcome()}
        {(view === 'selection') && renderSelection()}
        {(view === 'game_room') && (currentRoom ? renderInRoom() : renderGameRoom())}

        {contextMenu && (
            <div ref={contextMenuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed bg-white dark:bg-slate-800 rounded-md shadow-lg py-1 z-50 text-sm">
                {queue.some(u => u.id === contextMenu.targetUser.id) && (
                    <>
                    <button onClick={() => { handleKick(contextMenu.targetUser.id); setContextMenu(null); }} className="admin-menu-item">Xoá khỏi hàng đợi</button>
                    <button onClick={() => { handlePromote(contextMenu.targetUser.id); setContextMenu(null); }} className="admin-menu-item">Đưa lên Top 1</button>
                    </>
                )}
                {queue[0]?.id === contextMenu.targetUser.id && <button onClick={() => { handleToggleFreeze(); setContextMenu(null); }} className="admin-menu-item">{isCountdownFrozen ? 'Bỏ đóng băng' : 'Đóng băng'} giờ</button>}
                {isAdmin && <button onClick={() => { handleToggleMod(contextMenu.targetUser.id); setContextMenu(null); }} className="admin-menu-item">{isMod(contextMenu.targetUser) ? 'Xoá MOD' : 'Set MOD'}</button>}
                {isAdmin && <button onClick={() => { handleTogglePremium(contextMenu.targetUser.id); setContextMenu(null); }} className="admin-menu-item">{isPremium(contextMenu.targetUser) ? 'Xoá Premium' : 'Set Premium'}</button>}
                 {mockMessages.some(m => m.userId === contextMenu.targetUser.id) && (
                    <>
                    <button onClick={() => { handleToggleBan(contextMenu.targetUser.id); setContextMenu(null); }} className="admin-menu-item">{bannedUsers.has(contextMenu.targetUser.id) ? 'Bỏ cấm chat' : 'Cấm chat'}</button>
                    <button onClick={() => { handleClearUserChat(contextMenu.targetUser.id); setContextMenu(null); }} className="admin-menu-item">Xoá chat</button>
                    </>
                 )}
            </div>
        )}
      </div>
      <style>{`
        .admin-menu-item { display: block; width: 100%; text-align: left; padding: 8px 12px; white-space: nowrap; }
        .admin-menu-item:hover { background-color: #f3f4f6; }
        .dark .admin-menu-item:hover { background-color: #374151; }
        @keyframes shine-vip { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .vip-tag-shine { position: relative; display: inline-block; padding: 1px 6px; font-size: 0.7rem; font-weight: 700; color: #1e293b; background: linear-gradient(110deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%); border-radius: 0.25rem; overflow: hidden; -webkit-mask-image: -webkit-radial-gradient(white, black); }
        .vip-tag-shine::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(110deg, transparent 25%, rgba(255, 255, 255, 0.6) 50%, transparent 75%); animation: shine-vip 3s ease-in-out infinite; animation-delay: 1s; }
      `}</style>
    </div>
  );
};
