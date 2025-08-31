import React, { useEffect } from 'react';
import { CloseIcon, CheckCircleIcon, SparklesIcon } from './icons';

interface MembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FeatureListItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start">
    <CheckCircleIcon className="w-6 h-6 text-green-400 mr-3 flex-shrink-0 mt-1" />
    <span className="text-slate-600 dark:text-slate-300">{children}</span>
  </li>
);

export const MembershipModal: React.FC<MembershipModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRegisterClick = () => {
    alert('Payment integration is coming soon. Thank you for your interest!');
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="membership-title"
    >
      <div
        className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-lg p-6 sm:p-8 m-4 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="membership-title" className="text-2xl font-bold flex items-center gap-2">
            <SparklesIcon className="w-7 h-7 text-indigo-500" />
            Upgrade to Pro
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            aria-label="Close membership modal"
          >
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>

        <p className="text-slate-600 dark:text-slate-400 mb-6 text-center">
          Unlock all premium features and get the best experience Moe Chat has to offer.
        </p>

        <div className="bg-slate-100 dark:bg-[#2d2d40] p-6 rounded-lg">
          <div className="text-center mb-6">
            <p className="text-4xl font-bold text-slate-900 dark:text-white">$20</p>
            <p className="text-slate-500 dark:text-slate-400">per month</p>
          </div>

          <ul className="space-y-4">
            <FeatureListItem>
              **Unlimited** Image Generation with advanced models (Imagen 4 & DALL-E 3).
            </FeatureListItem>
            <FeatureListItem>
              Access to the powerful **Image Editing** tool.
            </FeatureListItem>
            <FeatureListItem>
              Unlock the **Face Swap** feature for creative fun.
            </FeatureListItem>
             <FeatureListItem>
              High-quality **Text-to-Speech** audio generation.
            </FeatureListItem>
            <FeatureListItem>
              Priority access to **new features** and models.
            </FeatureListItem>
          </ul>
        </div>
        
        <div className="mt-8">
            <button
                onClick={handleRegisterClick}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg"
            >
                Register
            </button>
        </div>
         <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 text-center">
            You can cancel your subscription at any time.
         </p>
      </div>
    </div>
  );
};
