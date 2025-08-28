import React from 'react';
import { CloseIcon } from './icons';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleSignIn: () => void;
}

const GoogleButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button 
      type="button" 
      onClick={onClick} 
      className="w-full flex items-center justify-center p-4 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-lg font-semibold"
    >
        <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.57-2.77c-1.08.73-2.45 1.16-4.36 1.16-3.34 0-6.17-2.25-7.18-5.26H1.19v2.86C3.12 21.65 7.27 24 12 24z" />
            <path fill="currentColor" d="M4.82 14.26C4.55 13.53 4.4 12.78 4.4 12s.15-1.53.42-2.26V6.86H1.19C.47 8.24 0 10.06 0 12s.47 3.76 1.19 5.14l3.63-2.88z" />
            <path fill="currentColor" d="M12 4.5c1.77 0 3.35.61 4.6 1.8l3.17-3.17C17.95 1.19 15.24 0 12 0 7.27 0 3.12 2.35 1.19 6.86l3.63 2.88C5.83 6.75 8.66 4.5 12 4.5z" />
        </svg>
        Sign in with Google
    </button>
);


export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onGoogleSignIn }) => {
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-sm p-6 sm:p-8 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 id="login-title" className="text-2xl font-bold">Cloud Storage</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close login modal">
                        <CloseIcon className="w-7 h-7" />
                    </button>
                </div>

                <p className="text-slate-600 dark:text-slate-400 mb-6 text-center">
                    Sign in with your Google account to securely save and sync your chat history across all your devices using Google Drive.
                </p>

                <div className="mt-4">
                    <GoogleButton onClick={onGoogleSignIn} />
                </div>
                 <p className="text-xs text-slate-400 dark:text-slate-500 mt-6 text-center">
                    By signing in, you allow Moe Chat to create a private folder in your Google Drive to store chat data. The app will not have access to any other files.
                </p>
            </div>
        </div>
    );
};
