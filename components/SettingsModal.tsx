

import React, { useState, useEffect } from 'react';
import { CloseIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  model: string;
  setModel: (model: string) => void;
  chatBgColor: string;
  setChatBgColor: (color: string) => void;
}

const ColorSwatch: React.FC<{ color: string; selectedColor: string; setColor: (color: string) => void; }> = ({ color, selectedColor, setColor }) => (
  <button
    onClick={() => setColor(color)}
    style={{ backgroundColor: color }}
    className={`w-8 h-8 rounded-full border-2 transition-all ${selectedColor === color ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-transparent'}`}
    aria-label={`Select ${color} background`}
  />
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, setIsDarkMode, model, setModel, chatBgColor, setChatBgColor }) => {

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
  };
  
  const backgroundColors = ['#212133', '#2d3748', '#1a202c', '#000000'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 id="settings-title" className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close settings">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Appearance */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Appearance</h3>
            <div className="flex items-center justify-between bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg">
              <span>Dark/Light Mode</span>
              <label htmlFor="theme-toggle" className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="theme-toggle" className="sr-only peer" checked={isDarkMode} onChange={handleThemeToggle} />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {/* Chat Background */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Chat Background (Dark Mode)</h3>
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg flex space-x-3">
                {backgroundColors.map(color => (
                    <ColorSwatch key={color} color={color} selectedColor={chatBgColor} setColor={setChatBgColor} />
                ))}
            </div>
          </div>

          {/* Model Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Model Settings</h3>
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
              <div>
                <label htmlFor="default-model" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Default Model</label>
                <select id="default-model" value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="deepseek-v3.1">DeepSeek v3.1</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="gpt-5-mini">gpt-5-mini</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};