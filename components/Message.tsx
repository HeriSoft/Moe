import React, { useState, useRef, useEffect } from 'react';
import type { Message, Attachment } from '../types';
import { UserIcon, ModelIcon, CopyIcon, CheckIcon, DocumentPlusIcon, EditIcon, RefreshIcon, CloseIcon } from './icons';
import { CodeBlock } from './CodeBlock';

interface MessageProps {
  message: Message;
  onEdit: (newText: string) => void;
  onRefresh: () => void;
}

// Helper to parse text for code blocks and markdown
const renderFormattedText = (text: string) => {
  const markdownRegex = /(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/g;
  const parts = text.split(markdownRegex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

const parseMessageContent = (text: string): React.ReactNode[] => {
    const codeBlockRegex = /(```(?:[a-zA-Z]+\n)?[\s\S]*?```)/g;
    const parts = text.split(codeBlockRegex);

    return parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            const codeContent = part.slice(3, -3);
            const firstLine = codeContent.indexOf('\n');
            const language = codeContent.substring(0, firstLine).trim();
            const code = codeContent.substring(firstLine + 1).trim();
            return <CodeBlock key={index} language={language} code={code} />;
        }
        return <p key={index} className="whitespace-pre-wrap">{renderFormattedText(part)}</p>;
    });
};


const AttachmentGrid: React.FC<{ attachments: Attachment[] }> = ({ attachments }) => (
  <div className={`grid gap-2 ${attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} mb-2`}>
    {attachments.map((att, index) => (
      <div key={index} className="rounded-lg overflow-hidden">
        {att.mimeType.startsWith('image/') ? (
          <img
            src={`data:${att.mimeType};base64,${att.data}`}
            alt={att.fileName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-slate-500/50 p-2">
            <DocumentPlusIcon className="w-10 h-10 text-slate-300" />
            <p className="text-xs text-center truncate w-full text-slate-200 mt-1" title={att.fileName}>
              {att.fileName}
            </p>
          </div>
        )}
      </div>
    ))}
  </div>
);


export const MessageComponent: React.FC<MessageProps> = ({ message, onEdit, onRefresh }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const isUser = message.role === 'user';
  const parsedContent = isEditing ? null : parseMessageContent(message.text);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== message.text) {
        onEdit(editText.trim());
    }
    setIsEditing(false);
  };
  
  useEffect(() => {
    if (isEditing) {
      editTextAreaRef.current?.focus();
      editTextAreaRef.current?.select();
    }
  }, [isEditing]);

  const hasContent = message.attachments || message.text;

  return (
    <div className={`group relative flex items-start gap-3 md:gap-4 p-4 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white ${isUser ? 'bg-slate-500 dark:bg-slate-600' : 'bg-indigo-600'}`}>
            {isUser ? <UserIcon className="w-5 h-5" /> : <ModelIcon className="w-5 h-5 p-0.5" />}
        </div>
        <div className={`min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] sm:max-w-lg md:max-w-xl rounded-2xl text-white ${isUser ? 'bg-indigo-600 rounded-br-none' : 'bg-[#2d2d40] dark:bg-[#2d2d40] rounded-bl-none'} ${hasContent ? 'p-3 md:p-4' : ''}`}>
                {message.attachments && !isEditing && message.attachments.length > 0 && (
                  <AttachmentGrid attachments={message.attachments} />
                )}
                {isEditing ? (
                    <div className="w-full">
                        <textarea
                            ref={editTextAreaRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full bg-indigo-700/80 rounded-md p-2 resize-y focus:outline-none focus:ring-2 focus:ring-white/50"
                            rows={Math.min(10, editText.split('\n').length + 1)}
                        />
                        <div className="flex justify-end gap-2 mt-2">
                           <button onClick={() => setIsEditing(false)} className="px-3 py-1 rounded-md text-sm font-semibold bg-slate-500/50 hover:bg-slate-500/80">Cancel</button>
                           <button onClick={handleSaveEdit} className="px-3 py-1 rounded-md text-sm font-semibold bg-white text-indigo-600 hover:bg-slate-200">Save & Submit</button>
                        </div>
                    </div>
                ) : (
                    message.text && <div>{parsedContent}</div>
                )}
            </div>
            {!isEditing && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1.5 flex items-center gap-3">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                   <button onClick={handleCopy} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" aria-label="Copy message text">
                      {isCopied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
                  </button>
                  {isUser ? (
                     <button onClick={() => setIsEditing(true)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" aria-label="Edit message">
                          <EditIcon className="w-4 h-4" />
                      </button>
                  ) : (
                      <button onClick={onRefresh} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" aria-label="Refresh response">
                          <RefreshIcon className="w-4 h-4" />
                      </button>
                  )}
              </div>
            )}
        </div>
    </div>
  );
};