import React, { useState, useEffect } from 'react';
import { getDriveImageAsDataUrl } from '../services/googleDriveService';
import { RefreshIcon, PhotoIcon } from './icons';

interface DriveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fileId: string | null | undefined;
}

export const DriveImage: React.FC<DriveImageProps> = ({ fileId, ...props }) => {
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
        const url = await getDriveImageAsDataUrl(fileId);
        
        if (isMounted) {
          setImageUrl(url);
          setIsLoading(false);
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
  }, [fileId]);

  const { className, ...restProps } = props;

  if (isLoading) {
    return <div className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 ${className}`}><RefreshIcon className="w-1/3 h-1/3 text-slate-400 animate-spin" /></div>;
  }
  if (hasError || !imageUrl) {
    return <div className={`flex items-center justify-center bg-red-100 dark:bg-red-900/50 ${className}`}><PhotoIcon className="w-1/3 h-1/3 text-red-400" /></div>;
  }
  return <img src={imageUrl} {...restProps} className={className} alt={props.alt || 'Google Drive Image'} />;
};
