import React, { useEffect } from 'react';
import { CloseIcon } from './icons';

interface MediaItem {
    data: string;
    mimeType: string;
    fileName: string;
    chatId: string;
    timestamp: number;
}

interface MediaGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    mediaItems: MediaItem[];
    setActiveChat: (chatId: string) => void;
}

export const MediaGalleryModal: React.FC<MediaGalleryModalProps> = ({ isOpen, onClose, mediaItems, setActiveChat }) => {

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleImageClick = (chatId: string) => {
        setActiveChat(chatId);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-gallery-title"
        >
            <div
                className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-[90vw] h-[90vh] max-w-7xl flex flex-col p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 id="media-gallery-title" className="text-2xl font-bold">Media Gallery</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close media gallery">
                        <CloseIcon className="w-7 h-7" />
                    </button>
                </div>
                <div className="flex-grow bg-slate-100 dark:bg-[#2d2d40] border border-slate-200 dark:border-slate-700 rounded-lg overflow-y-auto p-4">
                    {mediaItems.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {mediaItems.map((item, index) => (
                                <div key={`${item.chatId}-${item.timestamp}-${index}`} className="group relative aspect-square">
                                    <button
                                        onClick={() => handleImageClick(item.chatId)}
                                        className="w-full h-full rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-[#2d2d40]"
                                    >
                                        <img
                                            src={`data:${item.mimeType};base64,${item.data}`}
                                            alt={item.fileName}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="text-white text-sm font-semibold p-2 text-center">Go to Chat</span>
                                        </div>
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-slate-500 dark:text-slate-400">No images found in your chats.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};