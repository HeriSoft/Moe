import React, { useState } from 'react';
import { getDriveFilePublicUrl } from '../services/googleDriveService';
import { PhotoIcon } from './icons';

interface DriveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fileId: string;
  fallbackIcon?: React.ReactNode;
}

export const DriveImage: React.FC<DriveImageProps> = ({
  fileId,
  alt = '',
  className = 'w-full h-full object-contain',
  fallbackIcon,
  onLoad,
  onError,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const imageUrl = getDriveFilePublicUrl(fileId);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoading(false);
    if (onLoad) onLoad(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setHasError(true);
    setIsLoading(false);
    if (onError) onError(e);
  };

  if (hasError || !fileId) {
    return (
      <div className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded text-slate-400 dark:text-slate-500 ${className}`}>
        {fallbackIcon || <PhotoIcon className="w-6 h-6" />}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse rounded">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
};
