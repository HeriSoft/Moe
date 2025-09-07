import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserIcon, PlusIcon, SendIcon, MicrophoneIcon } from './icons';
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

export const CCTalkModal: React.FC<CCTalkModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'welcome' | 'selection' | 'game_room'>('welcome');
  const [queue, setQueue] = useState<UserProfile[]>(initialOtherUsers);
  const [teamSlots, setTeamSlots] = useState<(UserProfile | null)[]>(Array(5).fill(null));
  const [currentRoom, setCurrentRoom] = useState<{ id: string; members: UserProfile[] } | null>(null);
  const [talkingMemberId, setTalkingMemberId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [currentUserSlotIndex, setCurrentUserSlotIndex] = useState(0);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  // FIX: Changed NodeJS.Timeout to `number` which is the correct return type for setInterval in a browser environment.
  const countdownRef = useRef<number | null>(null);
  
  const currentUser = userProfile || mockUser;

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
  
  useEffect(() => {
    const newTeamSlots = Array(5).fill(null);
    const userAtHead = queue[0];
    if (userAtHead?.id === currentUser.id) {
        newTeamSlots[currentUserSlotIndex] = userAtHead;
    } else if (userAtHead) {
        newTeamSlots[0] = userAtHead; 
    }
    setTeamSlots(newTeamSlots);
  }, [queue, currentUser.id, currentUserSlotIndex]);

  useEffect(() => {
    const isUserAtHead = queue[0]?.id === currentUser.id;
    
    if (isUserAtHead) {
        setCountdown(60);
        countdownRef.current = window.setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    handleLeaveQueue();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    } else {
        if (countdownRef.current) clearInterval(countdownRef.current);
    }

    return () => {
        if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [queue, currentUser.id, handleLeaveQueue]);

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
    setCurrentRoom({ id: randomRoomId, members: teamMembers });
    setQueue(prev => prev.filter(u => u.id !== currentUser.id)); 
  };
  
  const handleExitRoom = () => {
    setCurrentRoom(null);
    setContextMenu(null);
    setQueue(prev => [currentUser, ...prev.filter(u => u.id !== currentUser.id)]);
  };

  const handleRightClick = (event: React.MouseEvent, user: UserProfile) => {
    if (user.id === currentUser.id) {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
    }
  };

  const handleSlotClick = (newIndex: number) => {
    if (queue[0]?.id === currentUser.id && teamSlots[newIndex] === null) {
        setCurrentUserSlotIndex(newIndex);
    }
  };

  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white">ccTalk - Kết nối giao lưu</h1>
        <button onClick={() => setView('selection')} className="mt-8 w-full max-w-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 text-lg">
            Tham gia ngay
        </button>
    </div>
  );

  const renderSelection = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white mb-8">ccTalk - Kết nối giao lưu</h1>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <button onClick={() => setView('game_room')} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-bold py-6 px-4 rounded-lg transition-colors text-xl">Phòng Game</button>
            <button onClick={() => alert('Chức năng này đang được phát triển!')} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-6 px-4 rounded-lg transition-colors text-xl">Phòng Trò chuyện / Ca hát</button>
        </div>
    </div>
  );
  
  const renderGameRoom = () => (
    <div className="flex flex-col h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
      <header className="flex-shrink-0 flex h-48">
        <div className="w-1/3 pr-2 flex flex-col border-r border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Hàng đợi</h2>
            {queue[0] && (
                <div className={`flex items-center p-1.5 rounded-md mb-2 ${queue[0].id === currentUser.id ? 'bg-indigo-500/20 ring-1 ring-indigo-400' : 'bg-slate-100 dark:bg-slate-800/50'}`}>
                    <span className="font-mono text-sm mr-2">1.</span>
                    <img src={queue[0].imageUrl} alt={queue[0].name} className="w-6 h-6 rounded-full mr-2" />
                    <span className="text-sm truncate flex-grow">{queue[0].name}</span>
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
                    <div key={user.id} className="flex items-center bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-md">
                        <span className="font-mono text-sm mr-2">{index + 2}.</span>
                        <img src={user.imageUrl} alt={user.name} className="w-6 h-6 rounded-full mr-2" />
                        <span className="text-sm truncate flex-grow">{user.name}</span>
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
                    {user && <span className="text-xs text-center font-semibold truncate w-full">{user.name}</span>}
                </div>
              ))}
            </div>
        </div>
      </header>
      <main className="flex-grow flex mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 min-h-0">
        <div className="w-1/3 pr-2 border-r border-slate-200 dark:border-slate-700 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Danh sách phòng</h2>
            <div className="flex-grow overflow-y-auto pr-2 space-y-1">
                {Array.from({ length: 100 }).map((_, i) => (
                    <button key={i} className="w-full text-left p-2 rounded-md hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 transition-colors font-medium">
                        Phòng {String(i + 1).padStart(2, '0')}
                    </button>
                ))}
            </div>
        </div>
        <div className="w-2/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Chat</h2>
            <div className="flex-grow bg-slate-100 dark:bg-slate-800/50 rounded-t-md p-2 overflow-y-auto text-sm space-y-2">
                <p><strong className="text-blue-400">Admin:</strong> Chào mừng đến với sảnh chờ!</p>
            </div>
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
    const mockMessages = [
        { user: 'Admin', text: `Chào mừng ${currentUser.name} và mọi người đến với phòng ${currentRoom.id}!` },
        { user: 'Đồng đội 1', text: 'Vào game thôi nào!' },
        { user: 'Đồng đội 3', text: 'Let\'s goooo!' },
        { user: 'Bạn', text: 'Ok, mời mình nhé.' },
    ];
    return (
        <div className="flex flex-col h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
            <header className="flex-shrink-0 flex justify-center flex-wrap gap-4 sm:gap-6 mb-4 pb-4 border-b border-slate-700">
                {currentRoom.members.map(member => (
                    <div key={member.id} className="flex flex-col items-center gap-2" onContextMenu={(e) => handleRightClick(e, member)}>
                         <div className="relative w-16 h-16 sm:w-20 sm:h-20">
                            <img src={member.imageUrl} alt={member.name} className="w-full h-full rounded-full object-cover border-4 border-slate-400 dark:border-slate-600"/>
                            <div className={`absolute -bottom-1 -right-1 p-1 bg-slate-200 dark:bg-slate-900 rounded-full transition-colors ${talkingMemberId === member.id ? 'animate-pulse' : ''}`}>
                                <MicrophoneIcon className={`w-5 h-5 transition-colors ${talkingMemberId === member.id ? 'text-green-400' : 'text-slate-500'}`} />
                            </div>
                        </div>
                        <span className="text-sm font-semibold truncate max-w-full text-center">{member.name}</span>
                    </div>
                ))}
            </header>
            
            <main className="flex-grow flex flex-col bg-slate-100 dark:bg-slate-800/50 rounded-md min-h-0">
                <div className="flex-grow p-4 overflow-y-auto space-y-4">
                    {mockMessages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.user === currentUser.name ? 'flex-row-reverse' : ''}`}>
                            <div className={`rounded-lg p-3 max-w-[75%] ${msg.user === currentUser.name ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700'}`}>
                                <p className="font-bold text-sm mb-1">{msg.user}</p>
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
            
            {contextMenu && (
                <div ref={contextMenuRef} style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed bg-white dark:bg-slate-800 rounded-md shadow-lg py-1 z-50">
                    <button onClick={handleExitRoom} className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">Thoát</button>
                </div>
            )}
        </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] max-h-[800px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {view === 'welcome' && renderWelcome()}
        {view === 'selection' && renderSelection()}
        {view === 'game_room' && (currentRoom ? renderInRoom() : renderGameRoom())}
      </div>
    </div>
  );
};
