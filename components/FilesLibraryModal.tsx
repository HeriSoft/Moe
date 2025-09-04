import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CloseIcon, MagnifyingGlassIcon, RefreshIcon, DownloadIcon, PuzzlePieceIcon, WrenchScrewdriverIcon, CubeIcon, DocumentIcon, ClockIcon } from './icons';
import type { UserProfile, FileItem, FilePart } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';

const FILES_API_ENDPOINT = '/api/files';

type FileFilter = 'recent' | 'most_downloaded' | 'games' | 'softwares' | 'others';

const FilterButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            active 
            ? 'bg-indigo-600 text-white' 
            : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
        }`}
    >
        {children}
    </button>
);

interface FilesLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

export const FilesLibraryModal: React.FC<FilesLibraryModalProps> = ({ isOpen, onClose, userProfile, setNotifications }) => {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<FileFilter>('recent');
    const [showVip, setShowVip] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFiles = useCallback(async (page: number, search: string, currentFilter: FileFilter, vip: boolean) => {
        if (!userProfile) return;
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                action: 'get_public_files',
                page: String(page),
                limit: '12',
                searchTerm: search,
                filter: currentFilter,
                showVip: String(vip),
            });
            const response = await fetch(`${FILES_API_ENDPOINT}?${params.toString()}`, {
                headers: { 'X-User-Email': userProfile.email }
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.details || 'Failed to fetch files');
            }
            const data = await response.json();
            setFiles(page === 1 ? data.files : prev => [...prev, ...data.files]);
            setTotalPages(data.totalPages || 1);
            setCurrentPage(data.currentPage || 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    }, [userProfile]);

    useEffect(() => {
        if (isOpen) {
            fetchFiles(1, searchTerm, filter, showVip);
        }
    }, [isOpen, searchTerm, filter, showVip, fetchFiles]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
        fetchFiles(1, searchTerm, filter, showVip);
    };

    const handleFilterChange = (newFilter: FileFilter) => {
        setFilter(newFilter);
        setCurrentPage(1);
        setSearchTerm('');
    };
    
    const handleDownload = async (file: FileItem) => {
        if (file.is_vip && !userProfile?.isPro) {
            setNotifications(prev => ["Password/URL unlock only for VIP.", ...prev]);
            return;
        }

        if (file.parts.length > 1) {
            setExpandedFileId(expandedFileId === file.id ? null : file.id);
            return;
        }

        if (file.parts.length === 1) {
            window.open(file.parts[0].download_url, '_blank');
        }
    };
    
    const getFileIcon = (tags: string[]) => {
        if (tags.includes('games')) return <PuzzlePieceIcon className="w-full h-full text-slate-500" />;
        if (tags.includes('softwares')) return <WrenchScrewdriverIcon className="w-full h-full text-slate-500" />;
        if (tags.includes('others')) return <CubeIcon className="w-full h-full text-slate-500" />;
        return <DocumentIcon className="w-full h-full text-slate-500" />;
    };

    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'auto';
    }, [isOpen]);

    if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-[95vw] h-[95vh] max-w-6xl flex flex-col p-4 sm:p-6 m-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold">Files Library</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7" /></button>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-4 flex-shrink-0">
             <form onSubmit={handleSearch} className="relative flex-grow">
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search files by name..." className="w-full bg-slate-100 dark:bg-[#2d2d40] border border-slate-300 dark:border-slate-600 rounded-lg py-2 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-500">
                    <MagnifyingGlassIcon className="w-5 h-5"/>
                </button>
            </form>
            <div className="flex items-center gap-2">
                <input type="checkbox" id="vip-toggle" checked={showVip} onChange={e => setShowVip(e.target.checked)} className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500" />
                <label htmlFor="vip-toggle" className="text-sm font-medium">Show VIP Files</label>
            </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
            <FilterButton active={filter==='recent'} onClick={()=>handleFilterChange('recent')}>Recent Updates</FilterButton>
            <FilterButton active={filter==='most_downloaded'} onClick={()=>handleFilterChange('most_downloaded')}>Most Downloads</FilterButton>
            <FilterButton active={filter==='games'} onClick={()=>handleFilterChange('games')}>Games</FilterButton>
            <FilterButton active={filter==='softwares'} onClick={()=>handleFilterChange('softwares')}>Softwares</FilterButton>
            <FilterButton active={filter==='others'} onClick={()=>handleFilterChange('others')}>Others</FilterButton>
        </div>

        <div className="flex-grow overflow-y-auto -mr-2 pr-2">
            {isLoading && files.length === 0 && <div className="flex justify-center items-center h-full"><RefreshIcon className="w-8 h-8 animate-spin" /></div>}
            {error && <div className="text-center text-red-500">{error}</div>}
            {!isLoading && files.length === 0 && <div className="text-center text-slate-500">No files found.</div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files.map(file => (
                    <div key={file.id} className="bg-slate-100 dark:bg-[#2d2d40] rounded-lg p-4 flex flex-col">
                        <div className="flex gap-4">
                            <div className="w-16 h-16 flex-shrink-0 bg-white dark:bg-slate-700 rounded-md p-2">
                                {file.icon_drive_id ? <img src={getDriveFilePublicUrl(file.icon_drive_id)} alt={file.name} className="w-full h-full object-contain" /> : getFileIcon(file.tags)}
                            </div>
                            <div className="flex-grow min-w-0">
                                <h3 className="font-bold truncate text-slate-800 dark:text-white">{file.name}</h3>
                                {file.version && <p className="text-xs text-slate-500">Version: {file.version}</p>}
                                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1"><ClockIcon className="w-3 h-3"/> {new Date(file.created_at!).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-between items-center">
                            {file.is_vip && <span className="text-xs font-bold text-yellow-500">VIP</span>}
                            <button onClick={() => handleDownload(file)} className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-semibold hover:bg-indigo-700">Download</button>
                        </div>
                        {expandedFileId === file.id && (
                            <div className="mt-3 pt-3 border-t border-slate-300 dark:border-slate-600 space-y-2">
                                {file.parts.map(part => (
                                    <a href={part.download_url} target="_blank" rel="noopener noreferrer" key={part.id} className="flex justify-between items-center p-2 bg-slate-200 dark:bg-slate-800 rounded-md hover:bg-slate-300 dark:hover:bg-slate-700">
                                        <span>{part.part_name || `Part ${part.part_number}`}</span>
                                        <DownloadIcon className="w-5 h-5"/>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
};
