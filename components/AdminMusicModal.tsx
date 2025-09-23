import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon, TrashIcon, PlusIcon, MusicalNoteIcon, EditIcon, PhotoIcon } from './icons';
import type { UserProfile, Song } from '../types';
import * as googleDriveService from '../services/googleDriveService';
import { DriveImage } from './DriveImage';

const MUSIC_API_ENDPOINT = '/api/music';
const GENRES = ['Pop', 'Hip-Hop', 'Rap', 'Indie', 'Acoustic', 'EDM', 'Rock', 'Ballad'];

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

interface AdminMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  onDataChange: () => void;
}

export const AdminMusicModal: React.FC<AdminMusicModalProps> = ({ isOpen, onClose, userProfile, setNotifications, onDataChange }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for List
  const [songs, setSongs] = useState<Song[]>([]);
  const [editingSong, setEditingSong] = useState<Song | null>(null);

  // State for Add/Edit Form
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [url, setUrl] = useState('');
  const [avatar, setAvatar] = useState<{ id: string; name: string } | null>(null);
  const [background, setBackground] = useState<{ id: string; name: string } | null>(null);


  const fetchSongs = useCallback(async () => {
    if (!userProfile) return;
    setIsLoading(true);
    setError(null);
    try {
        const response = await fetch(`${MUSIC_API_ENDPOINT}?action=get_admin_songs`, {
            headers: { 'X-User-Email': userProfile.email }
        });
        if (!response.ok) throw new Error('Failed to fetch songs');
        const data = await response.json();
        setSongs(data.songs);
    } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
        setIsLoading(false);
    }
  }, [userProfile]);
  
  const resetForm = useCallback(() => {
    setTitle('');
    setArtist('');
    setGenre(GENRES[0]);
    setUrl('');
    setAvatar(null);
    setBackground(null);
  }, []);
  
  const handleTabChange = (tab: 'list' | 'add') => {
      if (activeTab === 'add' && editingSong) {
          setEditingSong(null);
          resetForm();
      }
      setActiveTab(tab);
  };
  
  const handleEditClick = (song: Song) => {
      setEditingSong(song);
      setActiveTab('add');
  };

  useEffect(() => {
    if (isOpen && activeTab === 'list') {
      fetchSongs();
      setEditingSong(null);
      resetForm();
    }
  }, [isOpen, activeTab, fetchSongs, resetForm]);

  useEffect(() => {
      if (editingSong && activeTab === 'add') {
          setTitle(editingSong.title);
          setArtist(editingSong.artist);
          setGenre(editingSong.genre);
          setUrl(editingSong.url);
          setAvatar(editingSong.avatar_drive_id ? { id: editingSong.avatar_drive_id, name: 'Avatar' } : null);
          setBackground(editingSong.background_drive_id ? { id: editingSong.background_drive_id, name: 'Background' } : null);
      } else {
          resetForm();
      }
  }, [editingSong, activeTab, resetForm]);

  const handleSelectImage = (setter: React.Dispatch<React.SetStateAction<{ id: string; name: string } | null>>) => {
    googleDriveService.showPicker((files) => {
        if (files && files.length > 0) {
            setter({ id: files[0].id, name: files[0].name });
        }
    }, { mimeTypes: 'image/png,image/jpeg,image/webp' });
  };
  
  const handleSubmitSong = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userProfile) return;
      setIsLoading(true);
      setError(null);
      
      const action = editingSong ? 'update_song' : 'add_song';
      const songData = {
          songId: editingSong?.id,
          title, artist, genre, url,
          avatar_drive_id: avatar?.id,
          background_drive_id: background?.id,
      };

      try {
          const response = await fetch(MUSIC_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
              body: JSON.stringify({ action, ...songData }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to submit song');
          setNotifications(prev => [`Successfully ${editingSong ? 'updated' : 'added'} song: ${title}`, ...prev]);
          onDataChange(); // Notify parent component to refetch songs for MusicBox
          setActiveTab('list');
          setEditingSong(null);
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
          setIsLoading(false);
      }
  };
  
  const handleDeleteSong = async (songId: string, songTitle: string) => {
      if (!userProfile || !window.confirm(`Are you sure you want to delete "${songTitle}"?`)) return;
      setIsLoading(true);
      setError(null);
      try {
           const response = await fetch(MUSIC_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
              body: JSON.stringify({ action: 'delete_song', songId }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to delete song');
          setNotifications(prev => [`Successfully deleted song: ${songTitle}`, ...prev]);
          fetchSongs(); // Refresh list for this admin modal
          onDataChange(); // Notify parent component to refetch songs for MusicBox
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center" onClick={onClose}>
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col p-4 sm:p-6 m-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white"><MusicalNoteIcon className="w-7 h-7"/>Music Management</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7" /></button>
        </div>
        
        {error && <div className="p-3 mb-4 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

        <div className="border-b border-slate-200 dark:border-slate-700 flex flex-shrink-0">
            <TabButton active={activeTab === 'list'} onClick={() => handleTabChange('list')}>Song List</TabButton>
            <TabButton active={activeTab === 'add'} onClick={() => handleTabChange('add')}>{editingSong ? 'Edit Song' : 'Add New Song'}</TabButton>
        </div>

        <div className="flex-grow overflow-y-auto mt-4 pr-2 -mr-4">
          {activeTab === 'list' && (
            <div className="space-y-2">
                {isLoading && <p>Loading...</p>}
                {songs.map((song) => (
                    <div key={song.id} className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-md">
                        <div className="min-w-0 flex items-center gap-3">
                           {song.avatar_drive_id ? (
                             <DriveImage fileId={song.avatar_drive_id} alt="avatar" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                           ) : (
                             <div className="w-10 h-10 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                               <MusicalNoteIcon className="w-5 h-5" />
                             </div>
                           )}
                           <div className="min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-white truncate">{song.title}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{song.artist} - {song.genre}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => handleEditClick(song)} className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-full"><EditIcon className="w-5 h-5"/></button>
                            <button onClick={() => handleDeleteSong(song.id, song.title)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                ))}
            </div>
          )}
          {activeTab === 'add' && (
            <form onSubmit={handleSubmitSong} className="space-y-4 max-w-xl mx-auto">
              <div>
                <label htmlFor="title" className="label-style">Song Title</label>
                <input type="text" id="title" value={title} onChange={e => setTitle(e.target.value)} required className="input-style mt-1" />
              </div>
              <div>
                <label htmlFor="artist" className="label-style">Artist</label>
                <input type="text" id="artist" value={artist} onChange={e => setArtist(e.target.value)} className="input-style mt-1" />
              </div>
              <div>
                <label htmlFor="genre" className="label-style">Genre</label>
                <select id="genre" value={genre} onChange={e => setGenre(e.target.value)} className="input-style mt-1">
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
               <div>
                <label htmlFor="url" className="label-style">YouTube / Embed URL</label>
                <input type="url" id="url" value={url} onChange={e => setUrl(e.target.value)} required className="input-style mt-1" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="label-style mb-1">Avatar (for Disc)</label>
                      <div className="aspect-square w-full bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center">
                          {avatar ? <DriveImage fileId={avatar.id} alt="Avatar Preview" className="w-full h-full object-cover rounded-full"/> : <PhotoIcon className="w-10 h-10 text-slate-400"/>}
                      </div>
                      <button type="button" onClick={() => handleSelectImage(setAvatar)} className="mt-2 w-full text-sm p-2 bg-slate-200 dark:bg-slate-600 rounded-md">Select from Drive</button>
                  </div>
                   <div>
                      <label className="label-style mb-1">Background Image</label>
                      <div className="aspect-square w-full bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                          {background ? <DriveImage fileId={background.id} alt="Background Preview" className="w-full h-full object-cover rounded-lg"/> : <PhotoIcon className="w-10 h-10 text-slate-400"/>}
                      </div>
                      <button type="button" onClick={() => handleSelectImage(setBackground)} className="mt-2 w-full text-sm p-2 bg-slate-200 dark:bg-slate-600 rounded-md">Select from Drive</button>
                  </div>
              </div>

              <div className="flex justify-end pt-4">
                  <button type="submit" disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    {isLoading ? (editingSong ? 'Updating...' : 'Adding...') : (editingSong ? 'Update Song' : 'Add Song')}
                  </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; } .label-style { display: block; font-size: 0.875rem; font-weight: 500; }`}</style>
    </div>
  );
};