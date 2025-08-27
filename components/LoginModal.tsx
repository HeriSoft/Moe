

import React, { useState } from 'react';
import { CloseIcon } from './icons';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

const SocialButton: React.FC<{ icon: React.ReactNode, label: string, onClick: () => void }> = ({ icon, label, onClick }) => (
    <button type="button" onClick={onClick} className="flex-1 flex items-center justify-center p-3 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
        {icon}
        <span className="ml-2">{label}</span>
    </button>
);

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');


    if (!isOpen) return null;
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Special admin login
        if (username.toLowerCase() === 'admin' && password === 'admin') {
            onLoginSuccess();
            onClose();
            return;
        }

        // In a real app, you would validate other credentials here
        // For this demo, any other login attempt will show an error, but social login will succeed
        setError('Invalid credentials. Please try again or use social login.');
    };
    
    const handleSocialLogin = () => {
        // In a real app, this would trigger a social login flow
        onLoginSuccess();
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-6 sm:p-8 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 id="login-title" className="text-3xl font-bold">{isLoginView ? 'Welcome Back' : 'Create Account'}</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close login modal">
                        <CloseIcon className="w-7 h-7" />
                    </button>
                </div>

                <div className="mb-6">
                    <div className="flex border-b border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => { setIsLoginView(true); setError(''); }}
                            className={`px-4 py-2 text-lg font-semibold transition-colors ${isLoginView ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
                        >
                            Login
                        </button>
                        <button
                            onClick={() => { setIsLoginView(false); setError(''); }}
                            className={`px-4 py-2 text-lg font-semibold transition-colors ${!isLoginView ? 'text-indigo-500 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-indigo-400'}`}
                        >
                            Register
                        </button>
                    </div>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1" htmlFor="username">Username / Email</label>
                        <input 
                            type="text" 
                            id="username" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-100 dark:bg-[#2d2d40] border-transparent rounded-md p-3 focus:ring-2 focus:ring-indigo-500" 
                            placeholder="admin or you@example.com" 
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1" htmlFor="password">Password</label>
                        <input 
                            type="password" 
                            id="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-100 dark:bg-[#2d2d40] border-transparent rounded-md p-3 focus:ring-2 focus:ring-indigo-500" 
                            placeholder="••••••••" 
                            required
                        />
                    </div>
                    {!isLoginView && (
                        <div>
                             <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1" htmlFor="confirm-password">Confirm Password</label>
                             <input type="password" id="confirm-password" className="w-full bg-slate-100 dark:bg-[#2d2d40] border-transparent rounded-md p-3 focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
                        </div>
                    )}

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <button type="submit" className="w-full bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg">
                        {isLoginView ? 'Login' : 'Create Account'}
                    </button>
                </form>

                <div className="my-6 flex items-center">
                    <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
                    <span className="mx-4 text-sm text-slate-500">OR</span>
                    <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                    <SocialButton onClick={handleSocialLogin} icon={<svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /></svg>} label="Google" />
                    <SocialButton onClick={handleSocialLogin} icon={<svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.203 11.387.6.112.82-.262.82-.587 0-.29-.012-1.05-.012-2.062-3.337.725-4.042-1.612-4.042-1.612-.547-1.387-1.337-1.75-1.337-1.75-1.094-.75.082-.737.082-.737 1.206.087 1.837 1.237 1.837 1.237 1.075 1.837 2.813 1.312 3.5.987.112-.763.425-1.313.763-1.613-2.663-.3-5.45-1.337-5.45-5.925 0-1.313.463-2.388 1.238-3.225-.125-.3-.538-1.525.112-3.175 0 0 1.006-.325 3.3 1.225 1-.275 2.063-.412 3.125-.412s2.125.137 3.125.412c2.288-1.55 3.288-1.225 3.288-1.225.65 1.65.237 2.875.125 3.175.775.837 1.238 1.912 1.238 3.225 0 4.6-2.8 5.625-5.463 5.925.437.375.825 1.125.825 2.275 0 1.637-.012 2.95-.012 3.35 0 .325.212.7.825.587C20.562 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z" /></svg>} label="GitHub" />
                </div>
            </div>
        </div>
    );
};
