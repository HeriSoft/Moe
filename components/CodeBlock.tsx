import React, { useState } from 'react';
import { CopyIcon, CheckIcon, EyeIcon } from './icons';
import { PreviewModal } from './PreviewModal';

interface CodeBlockProps {
  language: string;
  code: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    });
  };

  const isHtml = language.toLowerCase() === 'html';

  return (
    <>
      <div className="bg-black/70 dark:bg-black/50 rounded-lg my-2 text-sm">
        <div className="flex justify-between items-center px-4 py-1.5 border-b border-white/10">
          <span className="text-slate-300 font-mono text-xs">{language || 'code'}</span>
          <div className="flex items-center gap-4">
            {isHtml && (
              <button
                onClick={() => setIsPreviewOpen(true)}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors text-xs"
                aria-label="Preview code"
              >
                <EyeIcon className="w-4 h-4" />
                Preview
              </button>
            )}
            <button 
                onClick={handleCopy} 
                className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors text-xs"
                aria-label="Copy code to clipboard"
            >
              {isCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
              {isCopied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        </div>
        <pre className="p-4 overflow-x-auto">
          <code className={`language-${language} text-white/90`}>{code}</code>
        </pre>
      </div>
      {isHtml && (
        <PreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            htmlContent={code}
        />
      )}
    </>
  );
};