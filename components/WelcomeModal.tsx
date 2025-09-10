import React from 'react';
import { CloseIcon, SparklesIcon } from './icons';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, onSignIn }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-lg p-6 sm:p-8 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id="welcome-title" className="text-2xl font-bold flex items-center gap-2">
            <SparklesIcon className="w-7 h-7 text-indigo-500" />
            Welcome to Moe Chat!
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close welcome modal">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          This is a sleek, modern chat application powered by the Gemini API. You can engage in conversations, manage chat history, and customize your experience.
        </p>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Sign in with your Google account to save your chats securely to your Google Drive and sync them across devices.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button onClick={onSignIn} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">
            Sign In with Google
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold py-3 px-4 rounded-lg transition-colors">
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
};
