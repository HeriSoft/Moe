import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CloseIcon, MagnifyingGlassIcon, RefreshIcon, PlayIcon, PauseIcon, ForwardIcon, BackwardIcon, StopIcon, MusicalNoteIcon } from './icons';
import type { UserProfile, Song } from '../types';

const MUSIC_API_ENDPOINT = '/api/music';
const GENRES = ['Pop', 'Hip-Hop', 'Rap', 'Indie', 'Acoustic'];

interface MusicBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
}

export const MusicBoxModal: React.FC<MusicBoxModalProps> = ({ isOpen, onClose, userProfile }) => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeGenre, setActiveGenre] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const audioRef = useRef<HTMLAudioElement>(null);

    const fetchSongs = useCallback(async () => {
        if (!userProfile) return;
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ action: 'get_public_songs' });
            const response = await fetch(`${MUSIC_API_ENDPOINT}?${params.toString()}`, {
                headers: { 'X-User-Email': userProfile.email }
            });
            if (!response.ok) throw new Error('Failed to fetch songs');
            const data = await response.json();
            setSongs(data.songs || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, [userProfile]);

    useEffect(() => {
        if (isOpen) {
            fetchSongs();
        } else {
            // Stop music when modal is closed
            if (audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        }
    }, [isOpen, fetchSongs]);

    const filteredSongs = useMemo(() => {
        return songs.filter(song => {
            const matchesSearch = song.title.toLowerCase().includes(searchTerm.toLowerCase()) || song.artist.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesGenre = activeGenre === 'all' || song.genre === activeGenre;
            return matchesSearch && matchesGenre;
        });
    }, [songs, searchTerm, activeGenre]);
    
    const currentSong = currentSongIndex !== null ? filteredSongs[currentSongIndex] : null;
    
    useEffect(() => {
        if (audioRef.current && currentSong) {
            audioRef.current.src = currentSong.url;
            if (isPlaying) {
                audioRef.current.play().catch(e => console.error("Audio play failed:", e));
            }
        }
    }, [currentSong, isPlaying]);

    const handlePlayPause = (index?: number) => {
        if (index !== undefined && index !== currentSongIndex) {
            setCurrentSongIndex(index);
            setIsPlaying(true);
        } else if (currentSongIndex !== null) {
            if (isPlaying) {
                audioRef.current?.pause();
            } else {
                audioRef.current?.play().catch(e => console.error("Audio play failed:", e));
            }
            setIsPlaying(!isPlaying);
        } else if (filteredSongs.length > 0) {
            setCurrentSongIndex(0);
            setIsPlaying(true);
        }
    };

    const handleNext = useCallback(() => {
        if (currentSongIndex === null) return;
        const nextIndex = (currentSongIndex + 1) % filteredSongs.length;
        setCurrentSongIndex(nextIndex);
        setIsPlaying(true);
    }, [currentSongIndex, filteredSongs.length]);

    const handlePrev = () => {
        if (currentSongIndex === null) return;
        const prevIndex = (currentSongIndex - 1 + filteredSongs.length) % filteredSongs.length;
        setCurrentSongIndex(prevIndex);
        setIsPlaying(true);
    };
    
    const handleStop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col p-4 sm:p-6 m-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white"><MusicalNoteIcon className="w-7 h-7"/> Music Box</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7" /></button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 flex-grow min-h-0">
                    {/* Left: Song List */}
                    <div className="w-full md:w-1/2 flex flex-col min-h-0">
                        <div className="relative mb-2">
                             <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search song or artist..." className="w-full bg-slate-100 dark:bg-[#2d2d40] border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
                             <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"/>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-2">
                             <button onClick={() => setActiveGenre('all')} className={`px-3 py-1 text-xs rounded-full ${activeGenre === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>All</button>
                             {GENRES.map(g => <button key={g} onClick={() => setActiveGenre(g)} className={`px-3 py-1 text-xs rounded-full ${activeGenre === g ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{g}</button>)}
                        </div>
                         <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-2">
                            {isLoading && <div className="flex justify-center items-center h-full"><RefreshIcon className="w-8 h-8 animate-spin"/></div>}
                            {error && <p className="text-red-500">{error}</p>}
                            {filteredSongs.map((song, index) => (
                                <button key={song.id} onClick={() => handlePlayPause(index)} className={`w-full text-left p-3 rounded-lg flex items-center gap-4 transition-colors ${currentSongIndex === index ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                    <div className="text-indigo-500 font-bold">{String(index + 1).padStart(2, '0')}</div>
                                    <div>
                                        <p className={`font-semibold ${currentSongIndex === index ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-800 dark:text-white'}`}>{song.title}</p>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{song.artist}</p>
                                    </div>
                                    <div className="ml-auto">
                                        {currentSongIndex === index && isPlaying && <MusicalNoteIcon className="w-5 h-5 text-indigo-500 animate-pulse"/>}
                                    </div>
                                </button>
                            ))}
                         </div>
                    </div>
                    {/* Right: Player */}
                    <div className="w-full md:w-1/2 bg-slate-100 dark:bg-[#2d2d40] rounded-lg p-6 flex flex-col justify-between items-center text-center">
                        <div className="w-48 h-48 sm:w-56 sm:h-56 bg-slate-800 rounded-full flex items-center justify-center shadow-lg">
                            <MusicalNoteIcon className={`w-24 h-24 text-slate-500 transition-transform duration-300 ${isPlaying ? 'animate-spin-slow' : ''}`}/>
                        </div>
                        <div className="w-full mt-6">
                            <div className="relative w-full overflow-hidden h-8">
                                <div className={`absolute whitespace-nowrap ${isPlaying ? 'marquee' : ''}`}>
                                    <h3 className="text-2xl font-bold text-slate-800 dark:text-white inline-block pr-12">{currentSong?.title || 'Select a song'}</h3>
                                    {isPlaying && <h3 className="text-2xl font-bold text-slate-800 dark:text-white inline-block pr-12">{currentSong?.title}</h3>}
                                </div>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">{currentSong?.artist || '...'}</p>
                        </div>
                        <div className="mt-8 flex items-center justify-center gap-6">
                            <button onClick={handlePrev} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white"><BackwardIcon className="w-7 h-7"/></button>
                            <button onClick={() => handlePlayPause()} className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700">
                                {isPlaying ? <PauseIcon className="w-8 h-8"/> : <PlayIcon className="w-8 h-8"/>}
                            </button>
                            <button onClick={handleNext} className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white"><ForwardIcon className="w-7 h-7"/></button>
                        </div>
                        <button onClick={handleStop} className="mt-6 flex items-center gap-2 text-sm text-slate-500 hover:text-red-500">
                            <StopIcon className="w-4 h-4"/> Stop
                        </button>
                    </div>
                </div>
                <audio ref={audioRef} onEnded={handleNext} onError={(e) => console.error("Audio error:", e.currentTarget.error)}></audio>
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