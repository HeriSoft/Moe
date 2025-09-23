import React, { useState, useEffect } from 'react';
import { getDriveImageAsDataUrl, getDriveFilePublicUrl } from '../services/googleDriveService';
import { RefreshIcon, PhotoIcon } from './icons';

interface DriveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fileId: string | null | undefined;
  isPublic?: boolean;
}

export const DriveImage: React.FC<DriveImageProps> = ({ fileId, isPublic = false, ...props }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Reset state on change
    setIsLoading(true);
    setHasError(false);
    setImageUrl(null);

    if (!fileId) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    const load = async () => {
      try {
        const url = isPublic
          ? getDriveFilePublicUrl(fileId)
          : await getDriveImageAsDataUrl(fileId);
        
        if (isMounted) {
          setImageUrl(url);
          // For data URLs, loading is effectively done. For public URLs, the img tag will handle it.
          if (!isPublic) {
            setIsLoading(false);
          }
        }
      } catch (e) {
        console.error(`Failed to get image URL for fileId ${fileId}`, e);
        if (isMounted) {
          setIsLoading(false);
          setHasError(true);
        }
      }
    };

    load();

    return () => { isMounted = false; };
  }, [fileId, isPublic]);

  const { className, ...restProps } = props;

  // This component renders the img tag for public images
  // and lets its own state drive the loading/error display.
  if (!isPublic) {
    if (isLoading) {
      return <div className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 ${className}`}><RefreshIcon className="w-1/3 h-1/3 text-slate-400 animate-spin" /></div>;
    }
    if (hasError || !imageUrl) {
      return <div className={`flex items-center justify-center bg-red-100 dark:bg-red-900/50 ${className}`}><PhotoIcon className="w-1/3 h-1/3 text-red-400" /></div>;
    }
    return <img src={imageUrl} {...restProps} className={className} alt={props.alt || 'Google Drive Image'} />;
  }

  // Logic for public images, which handles loading via img events.
  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
          <RefreshIcon className="w-1/3 h-1/3 text-slate-400 animate-spin" />
        </div>
      )}
      {hasError && (
         <div className="absolute inset-0 flex items-center justify-center bg-red-100 dark:bg-red-900/50">
            <PhotoIcon className="w-1/3 h-1/3 text-red-400" />
        </div>
      )}
      {imageUrl && (
        <img
          src={imageUrl}
          {...restProps}
          className={`${className} transition-opacity ${isLoading || hasError ? 'opacity-0' : 'opacity-100'}`}
          alt={props.alt || 'Google Drive Image'}
          onLoad={() => setIsLoading(false)}
          onError={() => { setIsLoading(false); setHasError(true); }}
        />
      )}
    </div>
  );
};
