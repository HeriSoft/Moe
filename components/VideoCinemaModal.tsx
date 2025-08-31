import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CloseIcon, MagnifyingGlassIcon, RefreshIcon, FilmIcon } from './icons';
import type { UserProfile, Movie, MovieEpisode } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';

const MOVIES_API_ENDPOINT = '/api/movies';

const getVideoEmbedUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com') || (url.length < 50 && !url.startsWith('http'))) {
        let fileId = '';
        try {
            const urlObj = new URL(url);
            const match = urlObj.pathname.match(/d\/([a-zA-Z0-9_-]{25,})/);
            if (match && match[1]) fileId = match[1];
        } catch (e) {
            if (url.length > 20 && !url.includes('/')) fileId = url;
        }
        if (fileId) return `https://drive.google.com/embeddedplayer/${fileId}`;
    }
    return url;
};

interface VideoCinemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
}

export const VideoCinemaModal: React.FC<VideoCinemaModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isPlayerLoading, setIsPlayerLoading] = useState<boolean>(false);

  const fetchMovies = useCallback(async (page: number, search: string) => {
    setIsLoading(true);
    setError(null);
    try {
        // FIX: Use a smaller limit for mobile to reduce data usage and loading time
        const limit = window.innerWidth < 768 ? '6' : '8';
        const params = new URLSearchParams({
            action: 'get_public_movies',
            page: String(page),
            limit: limit,
            searchTerm: search,
        });
        const response = await fetch(`${MOVIES_API_ENDPOINT}?${params.toString()}`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.details || 'Failed to fetch movies');
        }
        const data = await response.json();
        setMovies(data.movies || []);
        setTotalPages(data.totalPages || 1);
        setCurrentPage(data.currentPage || 1);
    } catch (e) {
        setError(e instanceof Error ? e.message : 'An unknown error occurred');
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMovies(1, '');
      setSelectedMovie(null);
      setVideoUrl('');
      setIsPlayerLoading(false);
      setSearchTerm('');
      setError(null);
    }
  }, [isOpen, fetchMovies]);

  const sortedEpisodes = useMemo(() => {
      if (!selectedMovie?.episodes) return [];
      return [...selectedMovie.episodes].sort((a, b) => a.episode_number - b.episode_number);
  }, [selectedMovie]);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMovies(1, searchTerm);
  };
  
  const handleSelectMovie = (movie: Movie) => {
    setSelectedMovie(movie);
    setVideoUrl('');
    setError(null);
    const episodes = movie.episodes ? [...movie.episodes].sort((a, b) => a.episode_number - b.episode_number) : [];
    if (episodes.length > 0) {
        setSelectedEpisode(episodes[0].episode_number);
        setIsPlayerLoading(true);
    } else {
        setError("This movie has no episodes available to play.");
        setIsPlayerLoading(false);
    }
  };

  const handleSelectEpisode = (episodeNumber: number) => {
    setSelectedEpisode(episodeNumber);
    setVideoUrl('');
    setIsPlayerLoading(true);
  };

  useEffect(() => {
    if (selectedMovie && isPlayerLoading) {
      const episode = sortedEpisodes.find(ep => ep.episode_number === selectedEpisode);
      const url = episode ? getVideoEmbedUrl(episode.video_drive_id) : '';
      const timer = setTimeout(() => {
        setVideoUrl(url);
        setIsPlayerLoading(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedMovie, selectedEpisode, isPlayerLoading, sortedEpisodes]);

  return (
    <div
      className={`fixed inset-0 bg-black/70 z-50 flex justify-center items-center transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cinema-title"
    >
      <div
        // FIX: Reduce padding on mobile
        className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-[95vw] h-[95vh] max-w-7xl flex flex-col p-3 sm:p-6 m-4 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 sm:mb-4 flex-shrink-0">
          {/* FIX: Reduce title font size on mobile */}
          <h2 id="cinema-title" className="text-xl sm:text-2xl font-bold">Video Cinema</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6 flex-grow min-h-0">
            {/* Left/Top Panel: Details & Player */}
            {/* FIX: Allocate 60% of height on mobile, full height on desktop */}
            <div className="flex flex-col w-full md:w-2/3 lg:w-3/4 min-h-0 h-3/5 md:h-full">
                 {selectedMovie ? (
                    <>
                        {/* FIX: Make this section a row, with smaller, fixed-size thumbnail to save vertical space */}
                        <div className="flex flex-row gap-3 sm:gap-4 mb-3 sm:mb-4 flex-shrink-0">
                            <img src={getDriveFilePublicUrl(selectedMovie.thumbnail_drive_id)} alt={selectedMovie.title} 
                                // FIX: Use a smaller, fixed-width thumbnail that doesn't shrink
                                className="w-24 sm:w-32 h-auto object-cover rounded-md sm:rounded-lg flex-shrink-0"/>
                            <div className="flex-grow min-w-0">
                                {/* FIX: Reduce font size and line clamping for title and description on mobile */}
                                <h3 className="text-lg sm:text-xl font-bold dark:text-white line-clamp-2">{selectedMovie.title}</h3>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1"><strong>Diễn viên:</strong> {selectedMovie.actors}</p>
                                <div className="mt-2">
                                    <h4 className="font-semibold mb-1 sm:mb-2 text-sm">Tập phim:</h4>
                                    <div className="flex flex-wrap gap-1.5 sm:gap-2 max-h-16 sm:max-h-20 overflow-y-auto">
                                        {sortedEpisodes.map((ep: MovieEpisode) => (
                                            <button key={ep.id || ep.episode_number} onClick={() => handleSelectEpisode(ep.episode_number)}
                                                // FIX: Smaller padding and font on buttons for mobile
                                                className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${selectedEpisode === ep.episode_number ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'}`}>
                                                {ep.episode_number}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Player will now correctly fill the remaining space */}
                        <div className="relative overflow-hidden flex-grow bg-black rounded-lg w-full flex items-center justify-center">
                           {error && <div className="text-red-500 p-4">{error}</div>}
                           {!error && videoUrl ? (
                                <iframe 
                                    src={videoUrl} key={videoUrl} title={selectedMovie.title + " - Episode " + selectedEpisode}
                                    className="border-0 rounded-lg w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                                    allowFullScreen
                                ></iframe>
                           ) : !error && isPlayerLoading ? (
                               <RefreshIcon className="w-10 h-10 text-slate-400 animate-spin"/>
                           ) : !error && !videoUrl ? (
                                <div className="flex items-center justify-center h-full text-slate-400 p-4 text-center">Could not load video. Please check the source.</div>
                           ) : null}
                        </div>
                    </>
                 ) : (
                    <div className="flex items-center justify-center h-full flex-col text-slate-400 bg-slate-100 dark:bg-[#2d2d40] rounded-lg">
                        <FilmIcon className="w-16 h-16 sm:w-24 sm:h-24"/>
                        <p className="mt-4 text-base sm:text-lg font-semibold">Select a movie to watch</p>
                    </div>
                 )}
            </div>

            {/* Right/Bottom Panel: Movie List */}
            {/* FIX: Allocate 40% of height on mobile, full height on desktop */}
            <div className="flex flex-col w-full md:w-1/3 lg:w-1/4 bg-slate-100 dark:bg-[#2d2d40] rounded-lg p-3 sm:p-4 min-h-0 h-2/5 md:h-full">
                <form onSubmit={handleSearch} className="relative mb-3 sm:mb-4 flex-shrink-0">
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search movies..." className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-500">
                        <MagnifyingGlassIcon className="w-5 h-5"/>
                    </button>
                </form>

                {isLoading ? (
                     <div className="flex items-center justify-center h-full"><RefreshIcon className="w-8 h-8 animate-spin text-slate-400"/></div>
                ) : error && movies.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-red-500">{error}</div>
                ) : (
                    <div className="flex-grow overflow-y-auto -mr-2 pr-2">
                        {/* FIX: Use 3 columns on mobile for smaller thumbnails, then 2 for sidebar layout */}
                        <div className="grid grid-cols-3 sm:grid-cols-2 md:grid-cols-2 gap-3 sm:gap-4">
                            {movies.map(movie => (
                                <button key={movie.id} onClick={() => handleSelectMovie(movie)} className="group relative aspect-[2/3] block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-[#2d2d40]">
                                    <img src={getDriveFilePublicUrl(movie.thumbnail_drive_id)} alt={movie.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"/>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 sm:p-2 flex flex-col justify-end">
                                        <h4 className="text-white font-bold text-xs sm:text-sm leading-tight line-clamp-2">{movie.title}</h4>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                 {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-3 sm:mt-4 flex-shrink-0">
                        <button onClick={() => fetchMovies(currentPage - 1, searchTerm)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 bg-slate-300 dark:bg-slate-600 rounded disabled:opacity-50 text-sm">Prev</button>
                        <span className="text-sm">Page {currentPage} of {totalPages}</span>
                        <button onClick={() => fetchMovies(currentPage + 1, searchTerm)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 bg-slate-300 dark:bg-slate-600 rounded disabled:opacity-50 text-sm">Next</button>
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
};
