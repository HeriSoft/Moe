
import React, { useState, useEffect } from 'react';
import { CloseIcon, PuzzlePieceIcon, TicketIcon, CardsIcon, BirdIcon, Pool8BallIcon, ArrowUturnLeftIcon, ChessIcon } from './icons';
import type { UserProfile } from '../types';
import TienLenGame from './games/TienLenGame';
import FlappyBirdGame from './games/FlappyBirdGame';
import EightBallPoolGame from './games/EightBallPoolGame';
import ChessGame from './games/ChessGame';
import LuckyWheel from './games/LuckyWheel';

interface GamePortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  handlePointsGain: (amount: number) => void;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | undefined>>; // To update profile after winning prize
}

type ActiveGame = 'lobby' | 'tienlen' | 'flappy' | 'pool' | 'chess';

const GameCard: React.FC<{ title: string; description: string; Icon: React.FC<any>; onPlay: () => void; bgColorClass: string; }> = 
({ title, description, Icon, onPlay, bgColorClass }) => (
    <div className={`p-6 rounded-lg shadow-lg flex flex-col items-center text-center text-white ${bgColorClass}`}>
        <Icon className="w-20 h-20 mb-4" />
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <p className="text-sm opacity-90 mb-6 flex-grow">{description}</p>
        <button onClick={onPlay} className="w-full bg-white/20 hover:bg-white/30 font-bold py-3 px-4 rounded-lg transition-colors transform hover:scale-105">
            Chơi ngay
        </button>
    </div>
);

export const GamePortalModal: React.FC<GamePortalModalProps> = ({ isOpen, onClose, userProfile, handlePointsGain, setNotifications, setUserProfile }) => {
  const [activeGame, setActiveGame] = useState<ActiveGame>('lobby');
  const points = userProfile?.points ?? 0;
  const tickets = Math.floor(points / 1000);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setActiveGame('lobby'); // Reset to lobby every time it opens
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  const handlePrizeWon = async (prize: { prizeId: string, label: string }) => {
      if (!userProfile) return;

      try {
          const response = await fetch('/api/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action: 'awardPrize',
                  payload: { user: userProfile, prizeId: prize.prizeId }
              })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to award prize.');

          setUserProfile(result.user); // Update user profile with new stats/cosmetics
          setNotifications(prev => [`Congratulations! You won: ${prize.label}`, ...prev.slice(0, 19)]);
          
      } catch (error) {
           const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
           setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
      }
  };


  if (!isOpen) return null;
  
  const renderGame = () => {
    switch(activeGame) {
        case 'tienlen':
            return <TienLenGame handlePointsGain={handlePointsGain} setNotifications={setNotifications} />;
        case 'flappy':
            return <FlappyBirdGame handlePointsGain={handlePointsGain} />;
        case 'pool':
            return <EightBallPoolGame handlePointsGain={handlePointsGain} setNotifications={setNotifications} />;
        case 'chess':
            return <ChessGame handlePointsGain={handlePointsGain} setNotifications={setNotifications} />;
        default:
            return null;
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
      <div 
        className="bg-slate-100 dark:bg-[#1e293b] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {activeGame === 'lobby' ? <PuzzlePieceIcon className="w-7 h-7 text-indigo-500" /> : <button onClick={() => setActiveGame('lobby')} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"><ArrowUturnLeftIcon className="w-6 h-6 text-indigo-500"/></button>}
            Cổng Game
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close Game Portal">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>

        {activeGame === 'lobby' ? (
            <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                <div className="text-center p-6 mb-6 bg-white dark:bg-slate-800 rounded-lg shadow-md">
                    <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Tổng điểm của bạn</p>
                    <p className="text-5xl font-bold text-indigo-600 dark:text-indigo-400 my-2">{points.toLocaleString()}</p>
                    <div className="flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
                        <TicketIcon className="w-5 h-5"/>
                        <span>Bạn có <strong>{tickets}</strong> vé quay thưởng (1000 điểm/vé)</span>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <GameCard 
                        title="Tiến Lên Miền Nam"
                        description="Đánh bài với Bot logic. Thắng +20 điểm, thua -10 điểm."
                        Icon={CardsIcon}
                        onPlay={() => setActiveGame('tienlen')}
                        bgColorClass="bg-gradient-to-br from-green-500 to-green-700"
                    />
                     <GameCard 
                        title="Flappy Bird"
                        description="Bay và né chướng ngại vật. Điểm số cộng vào tổng điểm."
                        Icon={BirdIcon}
                        onPlay={() => setActiveGame('flappy')}
                        bgColorClass="bg-gradient-to-br from-sky-400 to-sky-600"
                    />
                     <GameCard 
                        title="8 Ball Pool"
                        description="Bida 8 bóng. +5 điểm cho mỗi bi mục tiêu lọt lỗ."
                        Icon={Pool8BallIcon}
                        onPlay={() => setActiveGame('pool')}
                        bgColorClass="bg-gradient-to-br from-purple-500 to-purple-700"
                    />
                     <GameCard 
                        title="Cờ Vua AI"
                        description="Đấu trí với AI Minimax. Thắng +50 điểm."
                        Icon={ChessIcon}
                        onPlay={() => setActiveGame('chess')}
                        bgColorClass="bg-gradient-to-br from-slate-600 to-slate-800"
                    />
                </div>
                <div className="mt-8 border-t-2 border-dashed border-slate-300 dark:border-slate-600 pt-8">
                    <LuckyWheel 
                        points={points} 
                        onPrizeWon={handlePrizeWon}
                    />
                </div>
            </div>
        ) : (
            <div className="flex-grow flex items-center justify-center bg-slate-200 dark:bg-slate-900/50 rounded-lg p-2 overflow-hidden">
                {renderGame()}
            </div>
        )}
      </div>
    </div>
  );
};
