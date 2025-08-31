import React, { useState, useRef, useEffect } from 'react';
import type { Message, Attachment, GroundingChunk } from '../types';
import { UserIcon, ModelIcon, CopyIcon, CheckIcon, DocumentPlusIcon, EditIcon, RefreshIcon, SpeakerWaveIcon, SpeakerXMarkIcon, DownloadIcon, SaveToDriveIcon, WebSearchIcon } from './icons';
import { CodeBlock } from './CodeBlock';
import { MarkdownTable } from './MarkdownTable';
import { renderFormattedText } from './utils';


interface MessageProps {
  message: Message;
  onEdit: (newText: string) => void;
  onRefresh: () => void;
  isSpeaking: boolean;
  isTTsLoading: boolean;
  audioUrl: string | null;
  onToggleTTS: () => void;
  onSaveToDrive: () => Promise<void>;
}

const GroundingSources: React.FC<{ sources: GroundingChunk[] }> = ({ sources }) => (
    <div className="mt-3 pt-3 border-t border-white/20">
        <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-2">
            <WebSearchIcon className="w-4 h-4" />
            Sources
        </h4>
        <div className="flex flex-wrap gap-2">
            {sources.map((source, index) => (
                <a 
                    key={index} 
                    href={source.web.uri} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs bg-indigo-500/50 hover:bg-indigo-500/80 text-indigo-200 rounded-full px-2.5 py-1 transition-colors truncate max-w-[200px] sm:max-w-xs"
                    title={source.web.title}
                >
                    {source.web.title || new URL(source.web.uri).hostname}
                </a>
            ))}
        </div>
    </div>
);


const parseMessageContent = (text: string): React.ReactNode[] => {
    // This regex captures ```code blocks``` OR | markdown tables |
    // It's stateful (g flag), so we create a new one each time.
    const contentRegex = /(```(?:[a-zA-Z]+\n)?[\s\S]*?```)|((?:^\|.*\|(?:\r?\n|\r))+)/gm;
    
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = contentRegex.exec(text)) !== null) {
        // 1. Add the plain text part that comes before this match
        if (match.index > lastIndex) {
            const precedingText = text.substring(lastIndex, match.index);
            if (precedingText.trim()) {
                 nodes.push(<p key={`text-${lastIndex}`} className="whitespace-pre-wrap break-words">{renderFormattedText(precedingText)}</p>);
            }
        }

        const codeBlockMatch = match[1]; // Captured code block
        const tableMatch = match[2];     // Captured table block

        // 2. Add the matched special block (code or table)
        if (codeBlockMatch) {
            const trimmedPart = codeBlockMatch.trim();
            const codeContent = trimmedPart.slice(3, -3);
            const firstLineEnd = codeContent.indexOf('\n');
            let language = '';
            let code = codeContent;

            // Check if a language is specified on the first line
            if (firstLineEnd !== -1) {
                const firstLine = codeContent.substring(0, firstLineEnd).trim();
                // A simple check: if the first line has no spaces, it's likely a language identifier
                if (firstLine && !firstLine.includes(' ')) {
                    language = firstLine;
                    code = codeContent.substring(firstLineEnd + 1);
                }
            }
            nodes.push(<CodeBlock key={`code-${match.index}`} language={language} code={code.trim()} />);

        } else if (tableMatch) {
            nodes.push(<MarkdownTable key={`table-${match.index}`} markdownContent={tableMatch.trim()} />);
        }
        
        lastIndex = contentRegex.lastIndex;
    }

    // 3. Add any remaining plain text after the last match
    if (lastIndex < text.length) {
        const remainingText = text.substring(lastIndex);
        if (remainingText.trim()) {
            nodes.push(<p key={`text-${lastIndex}`} className="whitespace-pre-wrap break-words">{renderFormattedText(remainingText)}</p>);
        }
    }
    
    // If the original text was not empty but resulted in no nodes, render it as a single block
    if (nodes.length === 0 && text) {
        nodes.push(<p key="single-text" className="whitespace-pre-wrap break-words">{renderFormattedText(text)}</p>);
    }
    
    return nodes;
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


export const MessageComponent: React.FC<MessageProps> = ({ message, onEdit, onRefresh, isSpeaking, isTTsLoading, audioUrl, onToggleTTS, onSaveToDrive }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
  
  const handleSaveToDriveClick = async () => {
    if (!message.sourceDriveFileId || isSaving) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await onSaveToDrive();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      // Error is handled by the App component's notification system
    } finally {
      setIsSaving(false);
    }
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
                {message.groundingMetadata && message.groundingMetadata.length > 0 && (
                   <GroundingSources sources={message.groundingMetadata} />
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
                     <button onClick={() => setIsEditing(true)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover-text-slate-300 transition-colors" aria-label="Edit message">
                          <EditIcon className="w-4 h-4" />
                      </button>
                  ) : (
                      <>
                        {message.sourceDriveFileId && (
                           <button
                              onClick={handleSaveToDriveClick}
                              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
                              aria-label={`Save changes to "${message.sourceDriveFileName}"`}
                              title={`Save changes to "${message.sourceDriveFileName}"`}
                              disabled={isSaving}
                           >
                               {isSaving ? (
                                   <RefreshIcon className="w-4 h-4 animate-spin" />
                               ) : saveSuccess ? (
                                   <CheckIcon className="w-4 h-4 text-green-500" />
                               ) : (
                                   <SaveToDriveIcon className="w-4 h-4" />
                               )}
                           </button>
                        )}
                        <button onClick={onRefresh} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" aria-label="Refresh response">
                            <RefreshIcon className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={onToggleTTS} 
                            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50" 
                            aria-label={isSpeaking ? "Stop speaking" : "Read message aloud"}
                            disabled={isTTsLoading}
                        >
                            {isTTsLoading ? (
                                <SpeakerWaveIcon className="w-4 h-4 animate-pulse" />
                            ) : (
                                isSpeaking ? <SpeakerXMarkIcon className="w-4 h-4 text-indigo-400" /> : <SpeakerWaveIcon className="w-4 h-4" />
                            )}
                        </button>
                        {isSpeaking && audioUrl && (
                            <a 
                                href={audioUrl} 
                                download={`MoeChat_TTS_${message.timestamp}.mp3`}
                                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" 
                                aria-label="Download audio"
                            >
                                <DownloadIcon className="w-4 h-4" />
                            </a>
                        )}
                      </>
                  )}
              </div>
            )}
        </div>
    </div>
  );
};