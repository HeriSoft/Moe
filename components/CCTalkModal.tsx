import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserIcon, PlusIcon, SendIcon, MicrophoneIcon } from './icons';
import type { UserProfile } from '../types';

interface CCTalkModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

// NEW: Define a Room interface
interface Room {
  id: string;
  name: string;
  currentMembers: number;
  maxMembers: number;
}

const mockUser: UserProfile = {
  id: 'current_user_123',
  name: 'Bạn',
  email: 'gamer@example.com',
  imageUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
};

// NEW: Initial list of rooms with mock data
const initialRooms: Room[] = Array.from({ length: 20 }, (_, i) => ({
    id: `room${i + 1}`,
    name: `Phòng ${String(i + 1).padStart(2, '0')}`,
    currentMembers: Math.floor(Math.random() * 6), // 0 to 5 members
    maxMembers: 5,
}));


export const CCTalkModal: React.FC<CCTalkModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'welcome' | 'selection' | 'game_room'>('welcome');
  // NEW: State for rooms and hover effect
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);

  const [currentRoom, setCurrentRoom] = useState<{ id: string; members: UserProfile[] } | null>(null);
  const [talkingMemberId, setTalkingMemberId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  const currentUser = userProfile || mockUser;

  // Effect for simulating talking members in a room
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

  // Effect for handling clicks outside the context menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
            setContextMenu(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // NEW: Handle joining a room
  const handleJoinRoom = (room: Room) => {
    if (room.currentMembers >= room.maxMembers) {
      alert("Phòng đã đầy!");
      return;
    }
    const teamMembers = [
      currentUser,
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `teammate${i}`,
        name: `Đồng đội ${i + 1}`,
        email: `teammate${i}@example.com`,
        imageUrl: `https://i.pravatar.cc/150?u=teammate${i}`
      }))
    ];
    setCurrentRoom({ id: room.id, members: teamMembers });
  };
  
  const handleExitRoom = () => {
    setCurrentRoom(null);
    setContextMenu(null);
  };

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
  
  // NEW: Reworked game room lobby to show a list of rooms
  const renderGameRoom = () => (
    <div className="flex flex-col h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
      <header className="flex-shrink-0 text-center mb-4">
        <h2 className="text-xl font-bold">Danh sách phòng</h2>
      </header>
      <main className="flex-grow overflow-y-auto pr-2 -mr-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {rooms.map((room) => {
            const isFull = room.currentMembers >= room.maxMembers;
            return (
              <div
                key={room.id}
                onMouseEnter={() => setHoveredRoomId(room.id)}
                onMouseLeave={() => setHoveredRoomId(null)}
                className="relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center p-2 text-center group"
              >
                <p className="font-bold text-lg">{room.name}</p>
                <p className={`font-mono text-sm ${isFull ? 'text-red-500' : 'text-green-500'}`}>
                  ({room.currentMembers}/{room.maxMembers})
                </p>
                {hoveredRoomId === room.id && (
                  <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                    <button
                      onClick={() => handleJoinRoom(room)}
                      className={`px-4 py-2 rounded-md font-semibold text-white transition-colors ${
                        isFull
                          ? 'bg-red-600 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isFull ? 'Phòng đầy' : 'Tham gia'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
