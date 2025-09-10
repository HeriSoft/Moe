import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CloseIcon, MagnifyingGlassIcon, RefreshIcon, PlayIcon, PauseIcon, ForwardIcon, BackwardIcon, StopIcon, MusicalNoteIcon } from './icons';
import type { UserProfile, Song } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';


const MUSIC_API_ENDPOINT = '/api/music';
const GENRES = ['Pop', 'Hip-Hop', 'Rap', 'Indie', 'Acoustic'];

interface MusicBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
}

const getYouTubeEmbedUrl = (url: string | undefined): string => {
    if (!url) return '';
    let videoId = '';
    const patterns = [
        /(?:https?:\/\/(?:www\.)?)?youtube\.com\/(?:watch\?v=|embed\/|v\/)([\w-]{11})/,
        /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            videoId = match[1];
            break;
        }
    }
    if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${videoId}&enablejsapi=1`;
    }
    return url;
};


export const MusicBoxModal: React.FC<MusicBoxModalProps> = ({ isOpen, onClose, userProfile }) => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [currentSongIndex, setCurrentSongIndex] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeGenre, setActiveGenre] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [videoSrc, setVideoSrc] = useState('');

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
            setIsPlaying(false);
            setVideoSrc('');
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
        if (isPlaying && currentSong) {
            const embedUrl = getYouTubeEmbedUrl(currentSong.url);
            if (embedUrl !== videoSrc) {
               setVideoSrc(embedUrl);
            }
        } else {
            setVideoSrc('');
        }
    }, [isPlaying, currentSong, videoSrc]);


    const handlePlayPause = (index?: number) => {
        if (index !== undefined && index !== currentSongIndex) {
            setCurrentSongIndex(index);
            if (!isPlaying) setIsPlaying(true);
        } else if (currentSongIndex !== null) {
            setIsPlaying(!isPlaying);
        } else if (filteredSongs.length > 0) {
            setCurrentSongIndex(0);
            setIsPlaying(true);
        }
    };

    const handleNext = useCallback(() => {
        if (currentSongIndex === null && filteredSongs.length > 0) {
            setCurrentSongIndex(0);
            setIsPlaying(true);
            return;
        }
        if (currentSongIndex !== null) {
            const nextIndex = (currentSongIndex + 1) % filteredSongs.length;
            setCurrentSongIndex(nextIndex);
            if (!isPlaying) setIsPlaying(true);
        }
    }, [currentSongIndex, filteredSongs.length, isPlaying]);

    const handlePrev = () => {
        if (currentSongIndex === null && filteredSongs.length > 0) {
            setCurrentSongIndex(filteredSongs.length - 1);
            setIsPlaying(true);
            return;
        }
        if (currentSongIndex !== null) {
            const prevIndex = (currentSongIndex - 1 + filteredSongs.length) % filteredSongs.length;
            setCurrentSongIndex(prevIndex);
            if (!isPlaying) setIsPlaying(true);
        }
    };
    
    const handleStop = () => {
        setIsPlaying(false);
    };

    if (!isOpen) return null;

    const backgroundImageUrl = currentSong?.background_drive_id ? getDriveFilePublicUrl(currentSong.background_drive_id) : '';

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
                    <div 
                        className="w-full md:w-1/2 bg-slate-100 dark:bg-[#2d2d40] rounded-lg p-6 flex flex-col justify-between items-center text-center relative overflow-hidden bg-cover bg-center"
                        style={{ backgroundImage: `url(${backgroundImageUrl})` }}
                    >
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
                        <div className="z-10 w-48 h-48 sm:w-56 sm:h-56 bg-slate-800/50 rounded-full flex items-center justify-center shadow-lg border-4 border-white/10">
                            <div className={`relative w-full h-full p-2 ${isPlaying ? 'animate-spin-slow' : ''}`}>
                                {currentSong?.avatar_drive_id ? (
                                    <img src={getDriveFilePublicUrl(currentSong.avatar_drive_id)} alt="avatar" className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <MusicalNoteIcon className="w-24 h-24 text-slate-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
                                )}
                            </div>
                        </div>
                        <div className="z-10 w-full mt-6">
                            <div className="relative w-full overflow-hidden h-8">
                                <div className={`absolute whitespace-nowrap ${isPlaying ? 'marquee' : 'justify-center'}`}>
                                    <h3 className="text-2xl font-bold text-white inline-block pr-12" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.5)'}}>{currentSong?.title || 'Select a song'}</h3>
                                    {isPlaying && <h3 className="text-2xl font-bold text-white inline-block pr-12" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.5)'}}>{currentSong?.title}</h3>}
                                </div>
                            </div>
                            <p className="text-slate-300 mt-1" style={{textShadow: '1px 1px 2px rgba(0,0,0,0.5)'}}>{currentSong?.artist || '...'}</p>
                        </div>
                        <div className="z-10 mt-8 flex items-center justify-center gap-6">
                            <button onClick={handlePrev} className="p-2 text-slate-300 hover:text-white"><BackwardIcon className="w-7 h-7"/></button>
                            <button onClick={() => handlePlayPause()} className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700">
                                {isPlaying ? <PauseIcon className="w-8 h-8 ml-0.5"/> : <PlayIcon className="w-8 h-8 ml-1"/>}
                            </button>
                            <button onClick={handleNext} className="p-2 text-slate-300 hover:text-white"><ForwardIcon className="w-7 h-7"/></button>
                        </div>
                        <button onClick={handleStop} className="z-10 mt-6 flex items-center gap-2 text-sm text-slate-400 hover:text-red-400">
                            <StopIcon className="w-4 h-4"/> Stop
                        </button>
                    </div>
                </div>
                <iframe 
                    src={videoSrc}
                    title="Music Player Backend"
                    style={{ display: 'none' }}
                    allow="autoplay; encrypted-media"
                    sandbox="allow-scripts allow-same-origin"
                ></iframe>
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
