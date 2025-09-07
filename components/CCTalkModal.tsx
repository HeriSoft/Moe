import React, { useState, useMemo } from 'react';
import { UserIcon, PlusIcon, SendIcon } from './icons';
import type { UserProfile } from '../types';

interface CCTalkModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

const mockUser: UserProfile = {
  id: '12345',
  name: 'Gamer123',
  email: 'gamer@example.com',
  imageUrl: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
};

export const CCTalkModal: React.FC<CCTalkModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'welcome' | 'selection' | 'game_room'>('welcome');
  const [team, setTeam] = useState<(UserProfile | null)[]>([null, null, null, null]);
  const [queue, setQueue] = useState<UserProfile[]>([]);

  const currentUser = userProfile || mockUser;

  const handleJoinTeam = (index: number) => {
    // Prevent joining if already in the team
    if (team.some(member => member?.id === currentUser.id)) return;
    
    setTeam(prevTeam => {
        const newTeam = [...prevTeam];
        if (newTeam[index] === null) {
            newTeam[index] = currentUser;
        }
        return newTeam;
    });
  };

  const handleJoinQueue = () => {
    // Prevent joining if already in the queue or queue is full
    if (queue.length >= 10 || queue.some(member => member.id === currentUser.id)) return;
    setQueue(prev => [...prev, currentUser]);
  };
  
  const handleLeaveQueue = () => {
    setQueue(prev => prev.filter(member => member.id !== currentUser.id));
  };


  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white">ccTalk - Kết nối giao lưu</h1>
        <button
            onClick={() => setView('selection')}
            className="mt-8 w-full max-w-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 text-lg"
        >
            Tham gia ngay
        </button>
    </div>
  );

  const renderSelection = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white mb-8">ccTalk - Kết nối giao lưu</h1>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <button
                onClick={() => setView('game_room')}
                className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-bold py-6 px-4 rounded-lg transition-colors text-xl"
            >
                Phòng Game
            </button>
            <button
                onClick={() => alert('Chức năng này đang được phát triển!')}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-6 px-4 rounded-lg transition-colors text-xl"
            >
                Phòng Trò chuyện / Ca hát
            </button>
        </div>
    </div>
  );

  const renderGameRoom = () => (
    <div className="flex flex-col h-full w-full p-2 sm:p-4 text-slate-800 dark:text-slate-200">
      {/* Header */}
      <header className="flex-shrink-0 flex" style={{ flexBasis: '33.33%' }}>
        {/* Left: Queue */}
        <div className="w-1/3 pr-2 flex flex-col border-r border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-center">Hàng đợi</h2>
            <div className="flex-grow space-y-1 overflow-y-auto pr-2">
                {queue.map((user, index) => (
                    <div key={user.id} className="flex items-center bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-md">
                        <span className="font-mono text-sm mr-2">{index + 1}.</span>
                        <img src={user.imageUrl} alt={user.name} className="w-6 h-6 rounded-full mr-2" />
                        <span className="text-sm truncate">{user.name}</span>
                    </div>
                ))}
                {Array.from({ length: 10 - queue.length }).map((_, i) => (
                     <div key={`placeholder-${i}`} className="flex items-center p-1.5 opacity-50">
                        <span className="font-mono text-sm mr-2">{queue.length + i + 1}.</span>
                        <div className="w-6 h-6 rounded-full mr-2 bg-slate-200 dark:bg-slate-700"></div>
                     </div>
                ))}
            </div>
            <div className="flex gap-2 mt-2">
                <button onClick={handleJoinQueue} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1 rounded">Tham gia</button>
                <button onClick={handleLeaveQueue} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-1 rounded">Xuống</button>
            </div>
        </div>

        {/* Right: Team Recruit */}
        <div className="w-2/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center">Tuyển team</h2>
            <div className="flex-grow grid grid-cols-4 gap-4 items-center">
              {team.map((member, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                    <button onClick={() => handleJoinTeam(index)} className="w-16 h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500 border-2 border-transparent transition-colors">
                        {member ? (
                            <img src={member.imageUrl} alt={member.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <PlusIcon className="w-8 h-8 text-slate-500" />
                        )}
                    </button>
                    {member && <span className="text-xs font-semibold truncate">{member.name}</span>}
                </div>
              ))}
            </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex-shrink-0 flex mt-4 border-t border-slate-200 dark:border-slate-700 pt-4" style={{ flexBasis: '33.33%' }}>
        {/* Left: Room List */}
        <div className="w-2/3 pr-2 border-r border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-center">Danh sách phòng</h2>
            <div className="h-full overflow-y-auto pr-2 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {Array.from({ length: 100 }).map((_, i) => (
                    <button key={i} className="aspect-square bg-slate-100 dark:bg-slate-800/50 rounded-md flex items-center justify-center font-bold hover:bg-indigo-500/20">
                        {i + 1}
                    </button>
                ))}
            </div>
        </div>

        {/* Right: Chat */}
        <div className="w-1/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center">Chat</h2>
            <div className="flex-grow bg-slate-100 dark:bg-slate-800/50 rounded-t-md p-2 overflow-y-auto text-sm space-y-2">
                <p><strong className="text-blue-400">Admin:</strong> Chào mừng đến với phòng!</p>
                <p><strong className="text-green-400">User123:</strong> Cần 1 team 5 người rank KC</p>
            </div>
            <form className="flex-shrink-0 flex">
                <input type="text" placeholder="Nhập chat..." className="flex-grow bg-white dark:bg-slate-700 p-2 rounded-bl-md focus:outline-none text-sm"/>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-br-md">
                    <SendIcon className="w-5 h-5"/>
                </button>
            </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 mt-auto pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-center">
        <button
            onClick={() => setView('selection')}
            className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
        >
            Back Home
        </button>
      </footer>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] max-h-[800px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {view === 'welcome' && renderWelcome()}
        {view === 'selection' && renderSelection()}
        {view === 'game_room' && renderGameRoom()}
      </div>
    </div>
  );
};