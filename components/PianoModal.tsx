import React, { useEffect } from 'react';
import { CloseIcon, PianoIcon } from './icons';
import Piano from './Piano';

interface PianoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PianoModal: React.FC<PianoModalProps> = ({ isOpen, onClose }) => {
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

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="piano-modal-title"
    >
      <div
        className={`bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-screen-xl text-slate-800 dark:text-slate-200 transform transition-all duration-300 ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 id="piano-modal-title" className="text-xl font-bold flex items-center gap-2">
            <PianoIcon className="w-6 h-6" />
            Virtual Piano
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close piano">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>
        <div className="p-4">
            <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-4">
                Click or use your keyboard to play.
            </p>
            <Piano />
        </div>
      </div>
    </div>
  );
};
