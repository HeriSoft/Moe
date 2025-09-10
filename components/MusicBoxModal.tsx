import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CloseIcon, MagnifyingGlassIcon, RefreshIcon, PlayIcon, PauseIcon, ForwardIcon, BackwardIcon, StopIcon, MusicalNoteIcon, MinusIcon, StarIcon } from './icons';
import type { UserProfile, Song } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';

const GENRES = ['Pop', 'Hip-Hop', 'Rap', 'Indie', 'Acoustic'];

interface MusicBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  userProfile: UserProfile | undefined;
  songs: Song[];
  currentSong: Song | null;
  isPlaying: boolean;
  isLoading: boolean;
  onSetCurrentSong: (song: Song | null, shouldPlay: boolean) => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleFavorite: (songId: string) => void;
}

export const MusicBoxModal: React.FC<MusicBoxModalProps> = ({ isOpen, onClose, onMinimize, userProfile, songs, currentSong, isPlaying, isLoading, onSetCurrentSong, onTogglePlay, onNext, onPrev, onToggleFavorite }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeGenre, setActiveGenre] = useState('all');
    const [error, setError] = useState<string | null>(null); // Kept for local errors if any

    const filteredSongs = useMemo(() => {
        return songs.filter(song => {
            const matchesSearch = song.title.toLowerCase().includes(searchTerm.toLowerCase()) || song.artist.toLowerCase().includes(searchTerm.toLowerCase());
            
            let matchesFilter = false;
            if (activeGenre === 'all') {
                matchesFilter = true;
            } else if (activeGenre === 'favorites') {
                matchesFilter = song.is_favorite === true;
            } else {
                matchesFilter = song.genre === activeGenre;
            }

            return matchesSearch && matchesFilter;
        });
    }, [songs, searchTerm, activeGenre]);

    const handlePlayPause = (index?: number) => {
        // If a specific (and different) song is clicked
        if (index !== undefined && filteredSongs[index].id !== currentSong?.id) {
            onSetCurrentSong(filteredSongs[index], true);
        } else if (currentSong) { // If the main play/pause button or the same song is clicked
            onTogglePlay();
        } else if (filteredSongs.length > 0) { // If no song is selected, play the first one
            onSetCurrentSong(filteredSongs[0], true);
        }
    };
    
    const handleStop = () => {
        onSetCurrentSong(null, false);
    };

    if (!isOpen) return null;

    const backgroundImageUrl = currentSong?.background_drive_id ? getDriveFilePublicUrl(currentSong.background_drive_id) : '';

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col p-4 sm:p-6 m-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white"><MusicalNoteIcon className="w-7 h-7"/> Music Box</h2>
                    <div className="flex items-center gap-2">
                         <button onClick={onMinimize} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Minimize player">
                            <MinusIcon className="w-7 h-7" />
                        </button>
                        <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close player">
                            <CloseIcon className="w-7 h-7" />
                        </button>
                    </div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 flex-grow min-h-0">
                    {/* Left: Song List */}
                    <div className="w-full md:w-1/2 flex flex-col min-h-0">
                        <div className="relative mb-2">
                             <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search song or artist..." className="w-full bg-slate-100 dark:bg-[#2d2d40] border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                             <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-2">
                             <button 
                                onClick={() => setActiveGenre('favorites')} 
                                className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full transition-colors ${activeGenre === 'favorites' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                             >
                                <StarIcon solid={activeGenre === 'favorites'} className="w-4 h-4" /> 
                                Yêu thích
                            </button>
                             <button onClick={() => setActiveGenre('all')} className={`px-3 py-1 text-xs rounded-full ${activeGenre === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>All</button>
                             {GENRES.map(g => <button key={g} onClick={() => setActiveGenre(g)} className={`px-3 py-1 text-xs rounded-full ${activeGenre === g ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{g}</button>)}
                        </div>
                         <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-2">
                            {isLoading && <div className="flex justify-center items-center h-full"><RefreshIcon className="w-8 h-8 animate-spin"/></div>}
                            {error && <p className="text-red-500">{error}</p>}
                            {filteredSongs.map((song, index) => (
                                <button key={song.id} onClick={() => handlePlayPause(index)} className={`w-full text-left p-3 rounded-lg flex items-center gap-4 transition-colors ${currentSong?.id === song.id ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                    <div className="text-indigo-500 font-bold">{String(index + 1).padStart(2, '0')}</div>
                                    <div>
                                        <p className={`font-semibold ${currentSong?.id === song.id ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{song.title}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{song.artist}</p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent the whole row from being clicked
                                                onToggleFavorite(song.id);
                                            }}
                                            className="p-1 text-slate-400 hover:text-yellow-400 transition-colors"
                                            aria-label={song.is_favorite ? 'Unfavorite song' : 'Favorite song'}
                                        >
                                            <StarIcon className={`w-5 h-5 ${song.is_favorite ? 'text-yellow-400' : ''}`} solid={song.is_favorite} />
                                        </button>
                                        {currentSong?.id === song.id && isPlaying && <MusicalNoteIcon className="w-5 h-5 text-indigo-500 animate-pulse"/>}
                                    </div>
                                </button>
                            ))}
                         </div>
                    </div>
                    {/* Right: Player */}
                    <div 
                        className="w-full md:w-1/2 bg-slate-100 dark:bg-[#2d2d40] rounded-lg p-6 flex flex-col justify-between items-center text-center relative overflow-hidden bg-cover bg-center"
                        style={{ backgroundImage: `url(${backgroundImageUrl})` }}
                    >
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
                        <div className="z-10 w-40 h-40 sm:w-48 sm:h-48 my-2 sm:my-0 bg-slate-800/50 rounded-full flex items-center justify-center shadow-lg border-4 border-white/10">
                            <div className={`relative w-full h-full p-2 ${isPlaying ? 'animate-spin-slow' : ''}`}>
                                {currentSong?.avatar_drive_id ? (
                                    <img src={getDriveFilePublicUrl(currentSong.avatar_drive_id)} alt="avatar" className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <MusicalNoteIcon className="w-20 h-20 text-slate-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
                                )}
                            </div>
                        </div>
                        <div className="z-10 w-full mt-2 sm:mt-4">
                            <div className="relative w-full overflow-hidden h-8">
                                <div className={`absolute whitespace-nowrap ${isPlaying ? 'marquee' : 'justify-center'}`}>
                                    <h3 className="text-2xl font-bold text-white inline-block pr-12" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.5)'}}>{currentSong?.title || 'Select a song'}</h3>
                                    {isPlaying && <h3 className="text-2xl font-bold text-white inline-block pr-12" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.5)'}}>{currentSong?.title}</h3>}
                                </div>
                            </div>
                            <p className="text-slate-300 mt-1" style={{textShadow: '1px 1px 2px rgba(0,0,0,0.5)'}}>{currentSong?.artist || '...'}</p>
                        </div>
                        <div className="z-10 mt-4 sm:mt-6 flex items-center justify-center gap-6">
                            <button onClick={onPrev} className="p-2 text-slate-300 hover:text-white"><BackwardIcon className="w-7 h-7"/></button>
                            <button onClick={() => handlePlayPause()} className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700">
                                {isPlaying ? <PauseIcon className="w-8 h-8 ml-0.5"/> : <PlayIcon className="w-8 h-8 ml-1"/>}
                            </button>
                            <button onClick={onNext} className="p-2 text-slate-300 hover:text-white"><ForwardIcon className="w-7 h-7"/></button>
                        </div>
                        <button onClick={handleStop} className="z-10 mt-2 sm:mt-4 flex items-center gap-2 text-sm text-slate-400 hover:text-red-400">
                            <StopIcon className="w-4 h-4"/> Stop
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0%); }
                    100% { transform: translateX(-50%); }
                }
                .marquee {
                    animation: marquee 10s linear infinite;
                }
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 10s linear infinite;
                }
            `}</style>
        </div>
    );
};
