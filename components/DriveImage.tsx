import React, { useState, useEffect } from 'react';
import { getDriveImageAsDataUrl } from '../services/googleDriveService';
import { RefreshIcon, PhotoIcon } from './icons';

interface DriveImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fileId: string | null | undefined;
}

export const DriveImage: React.FC<DriveImageProps> = ({ fileId, ...props }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setImageUrl(null);
    setError(false);
    setIsLoading(true);

    if (!fileId) {
      setIsLoading(false);
      setError(true);
      return;
    }

    const fetchImage = async () => {
      try {
        const dataUrl = await getDriveImageAsDataUrl(fileId);
        if (isMounted) {
          setImageUrl(dataUrl);
        }
      } catch (err) {
        console.error(`Failed to load Drive image ${fileId}:`, err);
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
            setIsLoading(false);
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [fileId]);
  
  const { className, ...restProps } = props;

  if (isLoading) {
    return (
        <div className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 ${className}`}>
            <RefreshIcon className="w-1/3 h-1/3 text-slate-400 animate-spin" />
        </div>
    );
  }

  if (error || !imageUrl) {
    return (
        <div className={`flex items-center justify-center bg-red-100 dark:bg-red-900/50 ${className}`}>
            <PhotoIcon className="w-1/3 h-1/3 text-red-400" />
        </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imageUrl} {...restProps} className={className} alt={props.alt || 'Google Drive Image'} />;
};
