
import React from 'react';
import { XMarkIcon, CardsIcon } from '../../Icons.tsx';
import { TienLenGameModalProps } from '../../../types.ts';
// Attempting to resolve Vercel build issue.
// The path "./TienLenGame.tsx" should be correct if both files are in the same directory
// and casing matches the actual filename in the repository.
import TienLenGame from './TienLenGame.tsx';

const TienLenGameModal: React.FC<TienLenGameModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-[80] p-1 sm:p-2 md:p-4 transition-opacity duration-300"
      onClick={onClose} // Clicking backdrop closes modal
      role="dialog"
      aria-modal="true"
      aria-labelledby="tienlen-game-modal-title"
    >
      <div
        className="bg-green-700 dark:bg-green-800 rounded-lg shadow-xl w-full max-w-[300px] xs:max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl max-h-[95vh] flex flex-col transform transition-all duration-300 scale-100 opacity-100 p-2 sm:p-3 md:p-4"
        onClick={(e) => e.stopPropagation()} // Prevent click inside modal from closing it
      >
        <div className="w-full flex justify-between items-center mb-1 sm:mb-2 md:mb-3 text-white">
          <h2 id="tienlen-game-modal-title" className="text-lg sm:text-xl md:text-2xl font-bold flex items-center">
            <CardsIcon className="w-6 sm:w-7 mr-2 text-red-400" />
            Tiến Lên Miền Nam
          </h2>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 md:p-2 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Close Tiến Lên game"
          >
            <XMarkIcon className="w-5 h-5 sm:w-6 md:w-7" />
          </button>
        </div>

        <div className="flex-grow overflow-hidden p-0.5 sm:p-1 md:p-2 bg-green-600 dark:bg-green-700 rounded-md flex items-center justify-center">
          {/* TienLenGame component will be responsible for its own layout and responsiveness */}
          <TienLenGame />
        </div>
        
        <div className="mt-1 sm:mt-2 md:mt-3 w-full flex justify-center">
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-1.5 sm:py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs sm:text-sm font-medium transition-colors"
          >
            Exit Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default TienLenGameModal;
