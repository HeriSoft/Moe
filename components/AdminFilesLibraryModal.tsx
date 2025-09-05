import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon, TrashIcon, PlusIcon, DownloadIcon, PhotoIcon, EditIcon } from './icons';
import type { UserProfile, FileItem, FilePart } from '../types';
import * as googleDriveService from '../services/googleDriveService';

const FILES_API_ENDPOINT = '/api/files';

const TAGS = ['games', 'softwares', 'others'];

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

interface AdminFilesLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

export const AdminFilesLibraryModal: React.FC<AdminFilesLibraryModalProps> = ({ isOpen, onClose, userProfile, setNotifications }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for List
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);


  // State for Add/Edit
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [icon, setIcon] = useState<{ id: string; name: string } | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isVip, setIsVip] = useState(false);
  const [vipUnlockInfo, setVipUnlockInfo] = useState('');
  const [parts, setParts] = useState<Partial<FilePart>[]>([{ part_number: 1, download_url: '' }]);

  const fetchFiles = useCallback(async (page: number = 1) => {
    if (!userProfile) return;
    setIsLoading(true);
    setError(null);
    try {
        const params = new URLSearchParams({ action: 'get_public_files', filter: 'all', showVip: 'true', limit: '20', page: String(page) });
        const response = await fetch(`${FILES_API_ENDPOINT}?${params.toString()}`, { headers: { 'X-User-Email': userProfile.email } });
        if (!response.ok) throw new Error('Failed to fetch files');
        const data = await response.json();
        setFiles(data.files);
        setTotalPages(data.totalPages);
        setCurrentPage(data.currentPage);
    } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
        setIsLoading(false);
    }
  }, [userProfile]);
  
  const resetForm = useCallback(() => {
      setName(''); setVersion(''); setIcon(null); setSelectedTags([]);
      setIsVip(false); setVipUnlockInfo(''); setParts([{ part_number: 1, download_url: '' }]);
  }, []);

  const handleTabChange = (tab: 'list' | 'add') => {
      if (activeTab === 'add' && editingFile) {
          setEditingFile(null);
          resetForm();
      }
      setActiveTab(tab);
  };
  
  const handleEditClick = (file: FileItem) => {
      setEditingFile(file);
      setActiveTab('add');
  };

  useEffect(() => {
    if (isOpen && activeTab === 'list') {
      fetchFiles(currentPage);
      setEditingFile(null); // Ensure editing state is cleared
      resetForm();
    }
  }, [isOpen, activeTab, currentPage, fetchFiles, resetForm]);

  useEffect(() => {
    if (editingFile && activeTab === 'add') {
        setName(editingFile.name);
        setVersion(editingFile.version || '');
        setIcon(editingFile.icon_drive_id ? { id: editingFile.icon_drive_id, name: 'Existing Icon' } : null);
        setSelectedTags(editingFile.tags || []);
        setIsVip(editingFile.is_vip);
        setVipUnlockInfo(editingFile.vip_unlock_info || '');
        setParts(editingFile.parts.length > 0 ? editingFile.parts : [{ part_number: 1, download_url: '' }]);
    } else {
        resetForm();
    }
  }, [editingFile, activeTab, resetForm]);
  
  const handleSelectIcon = () => {
    googleDriveService.showPicker((files) => {
        if (files && files.length > 0) setIcon({ id: files[0].id, name: files[0].name });
    }, { mimeTypes: 'image/png,image/jpeg,image/webp,image/vnd.microsoft.icon' });
  };
  
  const handlePartChange = (index: number, field: 'part_name' | 'download_url', value: string) => {
      const newParts = [...parts];
      newParts[index] = { ...newParts[index], [field]: value, part_number: index + 1 };
      setParts(newParts);
  };
  
  const addPartField = () => setParts([...parts, { part_number: parts.length + 1, download_url: '' }]);
  const removePartField = (index: number) => setParts(parts.filter((_, i) => i !== index));
  
  const handleSubmitFile = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userProfile) return;
      setIsLoading(true); setError(null);
      
      const action = editingFile ? 'update_file' : 'add_file';
      const fileData = {
          fileId: editingFile?.id,
          name, version, icon_drive_id: icon?.id, tags: selectedTags,
          is_vip: isVip, vip_unlock_info: isVip ? vipUnlockInfo : undefined,
          parts: parts.filter(p => p.download_url)
      };

      try {
          const response = await fetch(FILES_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
              body: JSON.stringify({ action, ...fileData }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || `Failed to ${action.replace('_', ' ')} file`);
          setNotifications(prev => [`Successfully ${editingFile ? 'updated' : 'added'} file: ${name}`, ...prev]);
          setActiveTab('list');
          setEditingFile(null);
      } catch (e) {
          setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
      if (!userProfile || !window.confirm(`Delete "${fileName}"?`)) return;
      setIsLoading(true); setError(null);
      try {
           const response = await fetch(FILES_API_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
              body: JSON.stringify({ action: 'delete_file', fileId }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.details || 'Failed to delete file');
          setNotifications(prev => [`Successfully deleted: ${fileName}`, ...prev]);
          fetchFiles(currentPage); // Refresh list on current page
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
            <button onClick={() => fetchFiles(currentPage - 1)} disabled={currentPage <= 1 || isLoading} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded disabled:opacity-50 text-sm">Back</button>
            <span className="text-sm text-slate-600 dark:text-slate-400">Page {currentPage} of {totalPages}</span>
            <button onClick={() => fetchFiles(currentPage + 1)} disabled={currentPage >= totalPages || isLoading} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded disabled:opacity-50 text-sm">Next</button>
        </div>
    );
  };

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center" onClick={onClose}>
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col p-4 sm:p-6 m-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold flex items-center gap-2"><DownloadIcon className="w-7 h-7"/>Files Management</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7" /></button>
        </div>
        
        {error && <div className="p-3 mb-4 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

        <div className="border-b border-slate-200 dark:border-slate-700 flex flex-shrink-0">
            <TabButton active={activeTab === 'list'} onClick={() => handleTabChange('list')}>File List</TabButton>
            <TabButton active={activeTab === 'add'} onClick={() => handleTabChange('add')}>{editingFile ? 'Edit File' : 'Add New File'}</TabButton>
        </div>

        <div className="flex-grow overflow-y-auto mt-4 pr-2 -mr-4">
          {activeTab === 'list' && (
            <>
              <div className="space-y-2">
                {isLoading && files.length === 0 && <p>Loading...</p>}
                {files.map((file: FileItem) => (
                    <div key={file.id} className="flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-800 rounded-md">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 flex-shrink-0">{file.icon_drive_id ? <img src={googleDriveService.getDriveFilePublicUrl(file.icon_drive_id)} alt=""/> : <PhotoIcon/>}</div>
                            <span className="truncate">{file.name}</span>
                            {file.is_vip && <span className="text-xs font-bold text-yellow-500 flex-shrink-0">VIP</span>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => handleEditClick(file)} className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-full"><EditIcon className="w-5 h-5"/></button>
                          <button onClick={() => handleDeleteFile(file.id, file.name)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                ))}
              </div>
              {renderPagination()}
            </>
          )}
          {activeTab === 'add' && (
            <form onSubmit={handleSubmitFile} className="space-y-4 max-w-3xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label htmlFor="name" className="label-style">File Name</label><input type="text" id="name" value={name} onChange={e => setName(e.target.value)} required className="input-style" /></div>
                <div><label htmlFor="version" className="label-style">Version</label><input type="text" id="version" value={version} onChange={e => setVersion(e.target.value)} className="input-style" /></div>
              </div>
              
              <div><label className="label-style">Icon</label><button type="button" onClick={handleSelectIcon} className="mt-1 w-full p-2 border-2 border-dashed rounded-md hover:border-indigo-500">{icon ? `Selected: ${icon.name}` : 'Select Icon from Google Drive'}</button></div>
              
              <div><label className="label-style">Tags</label><div className="flex gap-4 mt-1">{TAGS.map(tag => (<label key={tag} className="flex items-center gap-2"><input type="checkbox" value={tag} checked={selectedTags.includes(tag)} onChange={e => setSelectedTags(p => e.target.checked ? [...p, tag] : p.filter(t => t !== tag))} /> {tag}</label>))}</div></div>

              <div><label className="flex items-center gap-2"><input type="checkbox" checked={isVip} onChange={e => setIsVip(e.target.checked)} /> Mark as VIP File</label></div>
              
              {isVip && <div><label htmlFor="vip-info" className="label-style">VIP Unlock Info (Password/URL)</label><input type="text" id="vip-info" value={vipUnlockInfo} onChange={e => setVipUnlockInfo(e.target.value)} className="input-style mt-1" /></div>}

              <div className="space-y-3 pt-4 border-t border-slate-700">
                  <h3 className="font-semibold">File Parts</h3>
                  {parts.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-slate-100 dark:bg-slate-800/50">
                          <span className="font-mono text-sm">#{i+1}</span>
                          <input type="text" placeholder="Part Name (e.g., file.part1.rar)" value={p.part_name || ''} onChange={e => handlePartChange(i, 'part_name', e.target.value)} className="input-style w-1/3" />
                          <input type="text" placeholder="Download URL" value={p.download_url} onChange={e => handlePartChange(i, 'download_url', e.target.value)} required className="flex-grow input-style" />
                          <button type="button" onClick={() => removePartField(i)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                      </div>
                  ))}
                  <button type="button" onClick={addPartField} className="flex items-center gap-1 text-sm text-indigo-400 hover:underline"><PlusIcon className="w-4 h-4"/> Add Part</button>
              </div>

              <div className="flex justify-end pt-4"><button type="submit" disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">{isLoading ? (editingFile ? 'Updating...' : 'Submitting...') : (editingFile ? 'Update File' : 'Add File')}</button></div>
            </form>
          )}
        </div>
      </div>
       <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; } .label-style { display: block; font-size: 0.875rem; font-weight: 500; }`}</style>
    </div>
  );
};
