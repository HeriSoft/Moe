import React, { useEffect } from 'react';
import { CloseIcon } from './icons';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  htmlContent: string;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ isOpen, onClose, htmlContent }) => {

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    // Cleanup function
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center" 
      onClick={onClose} 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="preview-title"
    >
      <div 
        className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-[90vw] h-[90vh] max-w-7xl flex flex-col p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="preview-title" className="text-2xl font-bold">Live Preview</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close preview">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>
        <div className="flex-grow bg-white border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <iframe
                srcDoc={htmlContent}
                title="Live Code Preview"
                sandbox="allow-scripts allow-modals allow-forms"
                className="w-full h-full border-0"
            />
        </div>
      </div>
    </div>
  );
};
