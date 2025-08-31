import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CloseIcon, MagnifyingGlassIcon, RefreshIcon, FilmIcon } from './icons';
import type { UserProfile, Movie, MovieEpisode } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';

const MOVIES_API_ENDPOINT = '/api/movies';

const getVideoEmbedUrl = (embedUrl: string) => {
    if (!embedUrl || typeof embedUrl !== 'string') return '';
    return embedUrl;
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
        const limit = window.innerWidth < 768 ? '4' : '8';
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
  
  // FIX: Corrected the logic for selecting the first episode.
  const handleSelectMovie = (movie: Movie) => {
    setSelectedMovie(movie);
    setVideoUrl(''); // Reset previous video
    setError(null);   // Clear previous errors

    // Safely sort the episodes, providing an empty array as a fallback.
    const sortedEpisodes = movie.episodes ? [...movie.episodes].sort((a, b) => a.episode_number - b.episode_number) : [];

    // Correctly check if the array has elements by using .length
    if (sortedEpisodes.length > 0) {
      // Access the first episode object at index [0]
      const firstEpisode = sortedEpisodes[0];
      
      // Set the episode number and trigger the video player loading
      setSelectedEpisode(firstEpisode.episode_number);
      setIsPlayerLoading(true);
    } else {
      // Handle the case where a movie has no episodes
      setError("This movie does not have any episodes.");
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
        className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-[95vw] h-[95vh] max-w-7xl flex flex-col p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="cinema-title" className="text-2xl font-bold">Video Cinema</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 flex-grow min-h-0">
            {/* Left/Top Panel: Details & Player */}
            <div className="flex flex-col w-full md:w-2/3 lg:w-3/4 min-h-0">
                 {selectedMovie ? (
                    <>
                        <div className="flex flex-col sm:flex-row gap-4 mb-4">
                            <img src={getDriveFilePublicUrl(selectedMovie.thumbnail_drive_id)} alt={selectedMovie.title} className="w-full sm:w-40 h-auto sm:h-56 object-cover rounded-lg flex-shrink-0"/>
                            <div className="flex-grow">
                                <h3 className="text-2xl font-bold dark:text-white">{selectedMovie.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1"><strong>Diễn viên:</strong> {selectedMovie.actors}</p>
                                <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm max-h-24 overflow-y-auto">{selectedMovie.description}</p>
                                <div className="mt-4">
                                    <h4 className="font-semibold mb-2">Tập phim:</h4>
                                    <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                                        {sortedEpisodes.map((ep: MovieEpisode) => (
                                            <button key={ep.id || ep.episode_number} onClick={() => handleSelectEpisode(ep.episode_number)}
                                                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${selectedEpisode === ep.episode_number ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'}`}>
                                                Tập {ep.episode_number}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="relative overflow-hidden flex-grow bg-black rounded-lg w-full h-64 md:h-auto flex items-center justify-center">
                           {videoUrl ? (
                                <iframe 
                                    src={videoUrl} 
                                    key={videoUrl} 
                                    title={selectedMovie.title + " - Episode " + selectedEpisode}
                                    className="border-0 rounded-lg w-full h-full"
                                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer"
                                    sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts allow-top-navigation"
                                ></iframe>
                           ) : isPlayerLoading ? (
                               <RefreshIcon className="w-10 h-10 text-slate-400 animate-spin"/>
                           ) : (
                                <div className="flex items-center justify-center h-full text-slate-400 text-center p-4">
                                  {error || "Could not load video. The video provider may not allow embedding."}
                                </div>
                           )}
                        </div>
                    </>
                 ) : (
                    <div className="flex items-center justify-center h-full flex-col text-slate-400 bg-slate-100 dark:bg-[#2d2d40] rounded-lg">
                        <FilmIcon className="w-24 h-24"/>
                        <p className="mt-4 text-lg font-semibold">Select a movie to watch</p>
                    </div>
                 )}
            </div>

            {/* Right/Bottom Panel: Movie List */}
            <div className="flex flex-col w-full md:w-1/3 lg:w-1/4 bg-slate-100 dark:bg-[#2d2d40] rounded-lg p-4 min-h-0">
                <form onSubmit={handleSearch} className="relative mb-4 flex-shrink-0">
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search movies..." className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-500">
                        <MagnifyingGlassIcon className="w-5 h-5"/>
                    </button>
                </form>

                {isLoading ? (
                     <div className="flex items-center justify-center h-full"><RefreshIcon className="w-8 h-8 animate-spin text-slate-400"/></div>
                ) : error && !movies.length ? (
                    <div className="flex items-center justify-center h-full text-red-500">{error}</div>
                ) : (
                    <div className="flex-grow overflow-y-auto -mr-2 pr-2">
                        <div className="grid grid-cols-2 gap-4">
                            {movies.map(movie => (
                                <button key={movie.id} onClick={() => handleSelectMovie(movie)} className="group aspect-[2/3] block rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-[#2d2d40]">
                                    <img src={getDriveFilePublicUrl(movie.thumbnail_drive_id)} alt={movie.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"/>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex flex-col justify-end">
                                        <h4 className="text-white font-bold text-sm leading-tight line-clamp-2">{movie.title}</h4>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                 {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-4 flex-shrink-0">
                        <button onClick={() => fetchMovies(currentPage - 1, searchTerm)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 bg-slate-300 dark:bg-slate-600 rounded disabled:opacity-50">Prev</button>
                        <span className="text-sm">Page {currentPage} of {totalPages}</span>
                        <button onClick={() => fetchMovies(currentPage + 1, searchTerm)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 bg-slate-300 dark:bg-slate-600 rounded disabled:opacity-50">Next</button>
                    </div>
                 )}
            </div>
        </div>
      </div>
    </div>
  );
};
