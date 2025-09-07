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

const initialQueue: UserProfile[] = Array.from({ length: 5 }, (_, i) => ({
  id: `queue_user_${i}`,
  name: `Game thủ ${i + 1}`,
  email: `gamer${i+1}@example.com`,
  imageUrl: `https://i.pravatar.cc/150?u=queue${i}`,
}));

const initialTeam: (UserProfile | null)[] = [
  { id: 'team_user_1', name: 'Đội trưởng', imageUrl: 'https://i.pravatar.cc/150?u=team1', email: 'c@c.com' },
  null,
  { id: 'team_user_3', name: 'Tay to', imageUrl: 'https://i.pravatar.cc/150?u=team3', email: 'c@c.com' },
  null,
  null,
];

export const CCTalkModal: React.FC<CCTalkModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'welcome' | 'selection' | 'game_room'>('welcome');
  const [isInQueue, setIsInQueue] = useState(false);
  const [queue, setQueue] = useState<UserProfile[]>(initialQueue);
  const [team, setTeam] = useState<(UserProfile | null)[]>(initialTeam);
  const [countdown, setCountdown] = useState(60);
  const countdownIntervalRef = useRef<number | null>(null);

  const [currentRoom, setCurrentRoom] = useState<{ id: string; members: UserProfile[] } | null>(null);
  const [talkingMemberId, setTalkingMemberId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const currentUser = userProfile || mockUser;
  const isUserFirstInQueue = isInQueue && queue[0]?.id === currentUser.id;

  useEffect(() => {
    if (isUserFirstInQueue) {
      setCountdown(60);
      countdownIntervalRef.current = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current!);
            setIsInQueue(false);
            setQueue(initialQueue); 
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [isUserFirstInQueue]);

  const handleJoinQueue = () => {
    if (!isInQueue) {
      setQueue([currentUser, ...initialQueue.slice(0, 4)]);
      setIsInQueue(true);
    }
  };

  const handleMoveToTeam = (index: number) => {
    if (isUserFirstInQueue && team[index] === null) {
      const newTeam = [...team];
      newTeam[index] = currentUser;
      setTeam(newTeam);
      setIsInQueue(false);
      setQueue(q => q.filter(u => u.id !== currentUser.id));
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }
  };

  const handleEnterRoom = () => {
    if (team.some(member => member?.id === currentUser.id)) {
        const finalTeamMembers = team.map(member => member || { id: `empty_${Math.random()}`, name: 'Trống', imageUrl: '', email:'' });
        setCurrentRoom({ id: 'Phòng 1', members: finalTeamMembers as UserProfile[] });
    }
  };
  
  const handleExitRoom = () => {
    setCurrentRoom(null);
    setTeam(initialTeam);
    setIsInQueue(false);
    setQueue(initialQueue);
    setContextMenu(null);
  };

  useEffect(() => {
    if (currentRoom) {
      const interval = setInterval(() => {
        const members = currentRoom.members.filter(m => m.name !== 'Trống');
        if (members.length === 0) return;
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

  const handleRightClick = (event: React.MouseEvent, user: UserProfile) => {
    if (user.id === currentUser.id) {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY });
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
    <div className="flex flex-col md:flex-row h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
        <div className="w-full md:w-1/3 border-b-2 md:border-b-0 md:border-r-2 border-slate-200 dark:border-slate-700 p-2 md:p-4 flex flex-col">
            <h3 className="text-lg font-bold text-center mb-4">Hàng đợi</h3>
            <div className="flex-grow space-y-3 overflow-y-auto">
                {queue.map((user, index) => (
                    <div key={user.id} className={`flex items-center gap-3 p-2 rounded-md ${isUserFirstInQueue && user.id === currentUser.id ? 'bg-indigo-500/20 ring-2 ring-indigo-500' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        <span className="font-mono text-sm w-6 text-center">{index + 1}</span>
                        <img src={user.imageUrl} alt={user.name} className="w-8 h-8 rounded-full" />
                        <span className="font-semibold text-sm truncate flex-grow">{user.name}</span>
                        {isUserFirstInQueue && user.id === currentUser.id && (
                             <div className="flex items-center gap-2 text-sm text-indigo-400">
                                <MicrophoneIcon className="w-4 h-4 animate-pulse" />
                                <span>{countdown}s</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
             {!isInQueue && (
                <button onClick={handleJoinQueue} className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Xếp hàng</button>
             )}
        </div>

        <div className="w-full md:w-2/3 p-2 md:p-4 flex flex-col justify-between">
            <div>
                <h3 className="text-lg font-bold text-center mb-6">Tuyển team</h3>
                <div className="grid grid-cols-5 gap-4">
                    {team.map((member, index) => (
                        <div key={index} className="flex flex-col items-center gap-2">
                            {member ? (
                                <div className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                                    <img src={member.imageUrl} alt={member.name} className="w-full h-full rounded-full object-cover border-2 border-slate-400"/>
                                </div>
                            ) : (
                                <button onClick={() => handleMoveToTeam(index)} disabled={!isUserFirstInQueue} className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
                                    <PlusIcon className="w-8 h-8 text-slate-500" />
                                </button>
                            )}
                            <span className="text-sm font-semibold truncate max-w-full text-center">{member ? member.name : 'Trống'}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="mt-8 flex justify-center gap-4">
                <button onClick={() => setView('selection')} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors">Quay lại</button>
                 <button onClick={handleEnterRoom} disabled={!team.some(m => m?.id === currentUser.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed">Vào phòng</button>
            </div>
        </div>
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
                    member.name !== 'Trống' && (
                        <div key={member.id} className="flex flex-col items-center gap-2" onContextMenu={(e) => handleRightClick(e, member)}>
                            <div className="relative w-16 h-16 sm:w-20 sm:h-20">
                                <img src={member.imageUrl} alt={member.name} className="w-full h-full rounded-full object-cover border-4 border-slate-400 dark:border-slate-600"/>
                                <div className={`absolute -bottom-1 -right-1 p-1 bg-slate-200 dark:bg-slate-900 rounded-full transition-colors ${talkingMemberId === member.id ? 'animate-pulse' : ''}`}>
                                    <MicrophoneIcon className={`w-5 h-5 transition-colors ${talkingMemberId === member.id ? 'text-green-400' : 'text-slate-500'}`} />
                                </div>
                            </div>
                            <span className="text-sm font-semibold truncate max-w-full text-center">{member.name}</span>
                        </div>
                    )
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
