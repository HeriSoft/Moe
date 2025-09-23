import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon, RefreshIcon, FilmIcon, TrashIcon, PlusIcon, EyeIcon, EditIcon } from './icons';
import type { UserProfile, Movie, MovieEpisode } from '../types';
import * as googleDriveService from '../services/googleDriveService';

const MOVIES_API_ENDPOINT = '/api/movies';

// FIX: Rename function to be more generic and simply return the provided URL.
const getVideoEmbedUrl = (embedUrl: string) => {
    if (!embedUrl || typeof embedUrl !== 'string') return '';
    return embedUrl;
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex-1 p-3 text-sm font-semibold border-b-2 transition-colors ${
      active ? 'border-indigo-500 text-indigo-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
    }`}
  >
    {children}
  </button>
);

interface AdminMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

export const AdminMovieModal: React.FC<AdminMovieModalProps> = ({ isOpen, onClose, userProfile, setNotifications }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for Movie List
  const [movies, setMovies] = useState<Movie[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);


  // State for Add/Edit Movie Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [actors, setActors] = useState('');
  const [thumbnail, setThumbnail] = useState<{ id: string; name: string } | null>(null);
  const [episodes, setEpisodes] = useState<Partial<MovieEpisode>[]>([{ episode_number: 1, video_drive_id: '' }]);

  const fetchMovies = useCallback(async (page: number = 1) => {
    if (!userProfile) return;
    setIsLoading(true);
    setError(null);
    try {
        const params = new URLSearchParams({ action: 'get_admin_movies', page: String(page) });
        const response = await fetch(`${MOVIES_API_ENDPOINT}?${params.toString()}`, {
            headers: { 'X-User-Email': userProfile.email }
        });
        if (!response.ok) throw new Error('Failed to fetch movies');
        const data = await response.json();
        setMovies(data.movies);
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
    } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
        setIsLoading(false);
    }
  }, [userProfile]);
  
  const resetAddForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setActors('');
    setThumbnail(null);
    setEpisodes([{ episode_number: 1, video_drive_id: '' }]);
  }, []);
  
  const handleTabChange = (tab: 'list' | 'add') => {
      if (activeTab === 'add' && editingMovie) {
          setEditingMovie(null);
          resetAddForm();
      }
      setActiveTab(tab);
  };

  const handleEditClick = (movie: Movie) => {
      setEditingMovie(movie);
      setActiveTab('add');
  };

  useEffect(() => {
    if (isOpen && activeTab === 'list') {
      fetchMovies(currentPage);
      setEditingMovie(null); // Clear editing state when switching to list
      resetAddForm();
    }
  }, [isOpen, activeTab, currentPage, fetchMovies, resetAddForm]);

  useEffect(() => {
      if (editingMovie && activeTab === 'add') {
          setTitle(editingMovie.title);
          setDescription(editingMovie.description);
          setActors(editingMovie.actors);
          setThumbnail({ id: editingMovie.thumbnail_drive_id, name: 'Existing Thumbnail' });
          setEpisodes(editingMovie.episodes && editingMovie.episodes.length > 0 ? editingMovie.episodes : [{ episode_number: 1, video_drive_id: '' }]);
      } else {
          resetAddForm();
      }
  }, [editingMovie, activeTab, resetAddForm]);

  const handleSelectThumbnail = () => {
    googleDriveService.showPicker((files) => {
        if (files && files.length > 0) {
            setThumbnail({ id: files[0].id, name: files[0].name });
        }
    }, { mimeTypes: 'image/png,image/jpeg,image/webp' });
  };
  
  const handleEpisodeChange = (index: number, field: 'episode_number' | 'title' | 'video_drive_id', value: string | number) => {
      const newEpisodes = [...episodes];
      const ep = { ...newEpisodes[index] };
      (ep as any)[field] = value;
      newEpisodes[index] = ep;
      setEpisodes(newEpisodes);
  };
  
  const addEpisodeField = () => {
      setEpisodes([...episodes, { episode_number: episodes.length + 1, video_drive_id: '' }]);
  };
  
  const removeEpisodeField = (index: number) => {
      setEpisodes(episodes.filter((_, i) => i !== index));
  };
  
  const handleSubmitMovie = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userProfile || !thumbnail) return;
      setIsLoading(true);
      setError(null);
      
      const action = editingMovie ? 'update_movie' : 'add_movie';
      const movieData = {
          movieId: editingMovie?.id,
          title, description, actors, 
          thumbnail_drive_id: thumbnail.id,
          episodes: episodes.filter(ep => ep.video_drive_id)
      };

      try {
          const response = await fetch(MOVIES_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
              body: JSON.stringify({ action, ...movieData }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to submit movie');
          setNotifications(prev => [`Successfully ${editingMovie ? 'updated' : 'added'} movie: ${title}`, ...prev]);
          setActiveTab('list');
          setEditingMovie(null);
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
          setIsLoading(false);
      }
  };
  
  const handleDeleteMovie = async (movieId: string, movieTitle: string) => {
      if (!userProfile || !window.confirm(`Are you sure you want to delete "${movieTitle}"?`)) return;
      setIsLoading(true);
      setError(null);
      try {
           const response = await fetch(MOVIES_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
              body: JSON.stringify({ action: 'delete_movie', movieId }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to delete movie');
          setNotifications(prev => [`Successfully deleted movie: ${movieTitle}`, ...prev]);
          fetchMovies(currentPage); // Refresh list
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
          setIsLoading(false);
      }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
        <div className="flex justify-center items-center gap-2 mt-4 flex-shrink-0">
            <button onClick={() => fetchMovies(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded disabled:opacity-50 text-sm">Back</button>
            <span className="text-sm text-slate-600 dark:text-slate-400">Page {currentPage} of {totalPages}</span>
            <button onClick={() => fetchMovies(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded disabled:opacity-50 text-sm">Next</button>
        </div>
    );
  };


  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose}>
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FilmIcon className="w-7 h-7"/>Movie Management
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7" /></button>
        </div>
        
        {error && <div className="p-3 mb-4 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

        <div className="border-b border-slate-200 dark:border-slate-700 flex flex-shrink-0">
            <TabButton active={activeTab === 'list'} onClick={() => handleTabChange('list')}>Movie List</TabButton>
            <TabButton active={activeTab === 'add'} onClick={() => handleTabChange('add')}>{editingMovie ? 'Edit Movie' : 'Add New Movie'}</TabButton>
        </div>

        <div className="flex-grow overflow-y-auto mt-4 pr-2 -mr-4">
          {activeTab === 'list' && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {isLoading && movies.length === 0 && <p>Loading...</p>}
                  {movies.map((movie: Movie) => (
                      <div key={movie.id} className="group relative">
                          <img src={googleDriveService.getDriveFilePublicUrl(movie.thumbnail_drive_id)} alt={movie.title} className="aspect-[2/3] w-full object-cover rounded-lg"/>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent p-2 flex flex-col justify-end">
                              <h4 className="text-white font-bold text-sm leading-tight line-clamp-2">{movie.title}</h4>
                          </div>
                          <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleEditClick(movie)} className="p-1.5 bg-black/50 rounded-full text-white hover:bg-indigo-500">
                              <EditIcon className="w-4 h-4"/>
                            </button>
                            <button onClick={() => handleDeleteMovie(movie.id, movie.title)} className="p-1.5 bg-black/50 rounded-full text-white hover:bg-red-500">
                              <TrashIcon className="w-4 h-4"/>
                            </button>
                          </div>
                      </div>
                  ))}
              </div>
              {renderPagination()}
            </div>
          )}
          {activeTab === 'add' && (
            <form onSubmit={handleSubmitMovie} className="space-y-4 max-w-3xl mx-auto">
              <div>
                <label htmlFor="title" className="block text-sm font-medium">Title</label>
                <input type="text" id="title" value={title} onChange={e => setTitle(e.target.value)} required className="mt-1 w-full input-style" />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium">Description</label>
                <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={4} className="mt-1 w-full input-style" />
              </div>
              <div>
                <label htmlFor="actors" className="block text-sm font-medium">Actors</label>
                <input type="text" id="actors" value={actors} onChange={e => setActors(e.target.value)} className="mt-1 w-full input-style" />
              </div>
              <div>
                <label className="block text-sm font-medium">Thumbnail</label>
                <button type="button" onClick={handleSelectThumbnail} className="mt-1 w-full p-2 border-2 border-dashed rounded-md hover:border-indigo-500">
                    {thumbnail ? `Selected: ${thumbnail.name}` : 'Select Thumbnail from Google Drive'}
                </button>
              </div>
              
              <div className="space-y-3 pt-4 border-t border-slate-700">
                  <h3 className="font-semibold">Episodes</h3>
                  {episodes.map((ep, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-slate-100 dark:bg-slate-800/50">
                          <input type="number" placeholder="Ep#" value={ep.episode_number || ''} onChange={e => handleEpisodeChange(index, 'episode_number', parseInt(e.target.value) || '')} className="w-20 input-style" />
                          <input type="text" placeholder="Episode Title (optional)" value={ep.title || ''} onChange={e => handleEpisodeChange(index, 'title', e.target.value)} className="input-style" />
                          <input type="text" placeholder="Video Embed URL (e.g., https://short.icu/...)" value={ep.video_drive_id || ''} onChange={e => handleEpisodeChange(index, 'video_drive_id', e.target.value)} required className="flex-grow input-style" />
                          {getVideoEmbedUrl(ep.video_drive_id || '') && <a href={getVideoEmbedUrl(ep.video_drive_id || '')} target="_blank" rel="noopener noreferrer"><EyeIcon className="w-5 h-5 text-sky-400"/></a>}
                          <button type="button" onClick={() => removeEpisodeField(index)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                      </div>
                  ))}
                  <button type="button" onClick={addEpisodeField} className="flex items-center gap-1 text-sm text-indigo-400 hover:underline">
                      <PlusIcon className="w-4 h-4"/> Add Episode
                  </button>
              </div>

              <div className="flex justify-end pt-4">
                  <button type="submit" disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    {isLoading ? (editingMovie ? 'Updating...' : 'Uploading...') : (editingMovie ? 'Update Movie' : 'Upload Movie')}
                  </button>
              </div>
            </form>
          )}
        </div>
      </div>
       <style>{`.input-style { background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 1px #6366f1; }`}</style>
    </div>
  );
};
