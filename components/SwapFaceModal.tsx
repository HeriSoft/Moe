import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, PhotoIcon, ArrowPathIcon, DownloadIcon } from './icons';
import { swapFace } from '../services/geminiService';
import type { Attachment } from '../types';


const ImageUploader: React.FC<{
  title: string;
  subtitle: string;
  image: Attachment | null;
  setImage: (file: File) => void;
}> = ({ title, subtitle, image, setImage }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  return (
    <div className="flex-1">
      <h3 className="text-lg font-semibold text-center mb-2 text-slate-800 dark:text-slate-200">{title}</h3>
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/png, image/jpeg, image/webp"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full h-48 sm:h-64 bg-slate-100 dark:bg-[#2d2d40] rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors"
      >
        {image ? (
          <img src={`data:${image.mimeType};base64,${image.data}`} alt="preview" className="w-full h-full object-cover rounded-lg" />
        ) : (
          <>
            <PhotoIcon className="w-12 h-12" />
            <span className="mt-2 text-sm font-semibold">{subtitle}</span>
          </>
        )}
      </button>
    </div>
  );
};

interface SwapFaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

export const SwapFaceModal: React.FC<SwapFaceModalProps> = ({ isOpen, onClose, setNotifications }) => {
  const [targetImage, setTargetImage] = useState<Attachment | null>(null);
  const [sourceImage, setSourceImage] = useState<Attachment | null>(null);
  const [resultImage, setResultImage] = useState<Attachment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset state when modal opens
      setTargetImage(null);
      setSourceImage(null);
      setResultImage(null);
      setIsLoading(false);
      setError(null);
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  const handleSetImage = (setter: React.Dispatch<React.SetStateAction<Attachment | null>>) => (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setter({
        data: base64String,
        mimeType: file.type,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSwap = async () => {
    if (!targetImage || !sourceImage) return;

    setIsLoading(true);
    setError(null);
    setResultImage(null);
    try {
      const result = await swapFace(targetImage, sourceImage);
      setResultImage(result);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "An unknown error occurred during face swap.";
      setError(errorMessage);
      setNotifications(prev => [errorMessage, ...prev.slice(0, 19)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = `data:${resultImage.mimeType};base64,${resultImage.data}`;
    link.download = `swapped_${resultImage.fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="swapface-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-4xl p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 id="swapface-title" className="text-2xl font-bold">Swap Face</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <ImageUploader title="Target Image" subtitle="Upload original image" image={targetImage} setImage={handleSetImage(setTargetImage)} />
            <ImageUploader title="Source Face" subtitle="Upload face to use" image={sourceImage} setImage={handleSetImage(setSourceImage)} />
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleSwap}
              disabled={!targetImage || !sourceImage || isLoading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  <span>Swapping...</span>
                </>
              ) : (
                <>
                  <ArrowPathIcon className="w-5 h-5" />
                  <span>Swap Face</span>
                </>
              )}
            </button>
          </div>
          
          {error && <p className="text-center text-red-500 bg-red-500/10 p-3 rounded-lg">{error}</p>}

          {(isLoading || resultImage) && (
             <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                 <h3 className="text-lg font-semibold text-center mb-4 text-slate-800 dark:text-slate-200">Result</h3>
                 <div className="w-full max-w-md mx-auto aspect-square bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center">
                     {isLoading && <ArrowPathIcon className="w-12 h-12 text-slate-400 animate-spin" />}
                     {resultImage && (
                        <div className="relative group w-full h-full">
                            <img src={`data:${resultImage.mimeType};base64,${resultImage.data}`} alt="Result" className="w-full h-full object-contain rounded-lg" />
                             <button onClick={handleDownloadResult} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <DownloadIcon className="w-6 h-6" />
                             </button>
                        </div>
                     )}
                 </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};