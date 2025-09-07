import React, { useState, useMemo, useEffect } from 'react';
import { UserIcon, PlusIcon, SendIcon, MicrophoneIcon } from './icons';
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

// Generate more mock users for the queue to demonstrate features
const mockQueueUsers = Array.from({ length: 5 }, (_, i) => ({
    id: `mockuser${i}`,
    name: `User${i + 1}`,
    email: `user${i+1}@example.com`,
    imageUrl: `https://i.pravatar.cc/150?u=user${i + 1}`
}));


export const CCTalkModal: React.FC<CCTalkModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'welcome' | 'selection' | 'game_room'>('welcome');
  const [team, setTeam] = useState<(UserProfile | null)[]>([null, null, null, null, null]);
  const [queue, setQueue] = useState<UserProfile[]>(mockQueueUsers);
  
  // New states for interactivity
  const [countdown, setCountdown] = useState(60);
  const [isMicActive, setIsMicActive] = useState(false);

  const currentUser = userProfile || mockUser;

  const isTeamFull = useMemo(() => !team.some(s => s === null), [team]);

  // Effect 1: Auto-placement of user from queue to team
  useEffect(() => {
    const firstInQueue = queue[0];
    if (!firstInQueue) return;

    const emptyTeamSlots = team.reduce((acc, slot, index) => {
      if (slot === null) acc.push(index);
      return acc;
    }, [] as number[]);

    if (emptyTeamSlots.length > 0) {
      const randomIndex = emptyTeamSlots[Math.floor(Math.random() * emptyTeamSlots.length)];
      
      const timer = setTimeout(() => {
          setTeam(prevTeam => {
            const newTeam = [...prevTeam];
            newTeam[randomIndex] = firstInQueue;
            return newTeam;
          });
          setQueue(prevQueue => prevQueue.slice(1));
      }, 800); // Small delay for UX
      
      return () => clearTimeout(timer);
    }
  }, [queue, team]);

  // Effect 2: Countdown timer and mic flashing for the #1 user in queue
  useEffect(() => {
    const firstInQueue = queue[0];

    // This logic only runs if the team is full and there's someone waiting
    if (firstInQueue && isTeamFull) {
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // Kick user from queue when timer ends
            setQueue(currentQueue => currentQueue.slice(1)); 
            return 60; // Reset for the next person
          }
          return prev - 1;
        });
      }, 1000);

      const micInterval = setInterval(() => {
        setIsMicActive(prev => !prev);
      }, 600);

      // Cleanup function
      return () => {
        clearInterval(countdownInterval);
        clearInterval(micInterval);
        setCountdown(60);
        setIsMicActive(false);
      };
    } else {
      // If queue is empty or team is not full, ensure everything is reset
      setCountdown(60);
      setIsMicActive(false);
    }
    // Dependency array ensures this effect re-runs ONLY when the top user changes or when the team's fullness status changes.
  }, [queue[0]?.id, isTeamFull]); 


  const handleJoinTeam = (index: number) => {
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
      {/* Header: Height reduced */}
      <header className="flex-shrink-0 flex h-48">
        {/* Left: Queue */}
        <div className="w-1/3 pr-2 flex flex-col border-r border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Hàng đợi</h2>
            <div className="flex-grow space-y-1 overflow-y-auto pr-2 min-h-0">
                {queue.map((user, index) => (
                    <div key={user.id} className="flex items-center bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-md">
                        <span className="font-mono text-sm mr-2">{index + 1}.</span>
                        <img src={user.imageUrl} alt={user.name} className="w-6 h-6 rounded-full mr-2" />
                        <span className="text-sm truncate flex-grow">{user.name}</span>
                        {index === 0 && isTeamFull && (
                            <div className="flex items-center gap-2 text-xs font-semibold flex-shrink-0">
                                <span className="text-amber-400">{countdown}s</span>
                                <MicrophoneIcon className={`w-4 h-4 transition-colors ${isMicActive ? 'text-green-400' : 'text-slate-600'}`} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex gap-2 mt-2 flex-shrink-0">
                <button onClick={handleJoinQueue} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-1 rounded">Tham gia</button>
                <button onClick={handleLeaveQueue} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-1 rounded">Xuống</button>
            </div>
        </div>

        {/* Right: Team Recruit (5 members) */}
        <div className="w-2/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center">Tuyển team</h2>
            <div className="flex-grow grid grid-cols-5 gap-2 sm:gap-4 items-center">
              {team.map((member, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                    <button onClick={() => handleJoinTeam(index)} className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center hover:bg-indigo-500/20 hover:border-indigo-500 border-2 border-transparent transition-colors">
                        {member ? (
                            <img src={member.imageUrl} alt={member.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <PlusIcon className="w-8 h-8 text-slate-500" />
                        )}
                    </button>
                    {member && <span className="text-xs font-semibold truncate max-w-full">{member.name}</span>}
                </div>
              ))}
            </div>
        </div>
      </header>

      {/* Body: Takes up remaining space */}
      <main className="flex-grow flex mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 min-h-0">
        {/* Left: Room List (Shrunk) */}
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

        {/* Right: Chat (Expanded) */}
        <div className="w-2/3 pl-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2 text-center flex-shrink-0">Chat</h2>
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
      <footer className="flex-shrink-0 mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 flex justify-center">
        <button
            onClick={() => setView('selection')}
            className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
        >
            Quay lại
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
