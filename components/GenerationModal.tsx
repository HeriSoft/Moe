import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, ImageIcon, EditIcon, FaceSwapIcon, VideoIcon, SparklesIcon, PhotoIcon, DownloadIcon, ArrowPathIcon } from './icons';
import { generateImage, editImage, swapFace } from '../services/geminiService';
import type { Attachment, UserProfile } from '../types';

// Interfaces from the old ImageSettingsModal
export interface ImageGenerationSettings {
    model: 'imagen-4.0-generate-001' | 'dall-e-3';
    aspectRatio: string;
    numImages: number;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
}

export interface ImageEditingSettings {
    model: 'gemini-2.5-flash-image-preview';
}

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; }> = ({ label, value, min, max, step, onChange }) => (
  <div>
    <label className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
      <span>{label}</span>
      <span>{value}</span>
    </label>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
  </div>
);

const ImageUploader: React.FC<{ image: Attachment | null; onImageSet: (file: File) => void; title: string; textSize?: string }> = ({ image, onImageSet, title, textSize = 'text-sm' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSet(e.target.files[0]);
    }
  };
  return (
    <div className="flex flex-col items-center">
        <h4 className={`font-semibold mb-2 text-slate-600 dark:text-slate-300 text-center ${textSize}`}>{title}</h4>
        <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp"/>
        <button onClick={() => inputRef.current?.click()} className="w-full aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors p-2 text-center">
            {image ? <img src={`data:${image.mimeType};base64,${image.data}`} alt="preview" className="w-full h-full object-cover rounded-md" /> : <PhotoIcon className="w-10 h-10" />}
        </button>
    </div>
  );
};

type CreativeMode = 'image' | 'edit' | 'faceSwap' | 'video';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  onProFeatureBlock: () => void;
}

export const GenerationModal: React.FC<GenerationModalProps> = ({ isOpen, onClose, userProfile, setNotifications, onProFeatureBlock }) => {
    const [activeMode, setActiveMode] = useState<CreativeMode>('image');
    const [prompt, setPrompt] = useState('');
    const [inputImage1, setInputImage1] = useState<Attachment | null>(null);
    const [inputImage2, setInputImage2] = useState<Attachment | null>(null);
    const [output, setOutput] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [genSettings, setGenSettings] = useState<ImageGenerationSettings>({ model: 'imagen-4.0-generate-001', aspectRatio: '1:1', numImages: 1, quality: 'standard', style: 'vivid' });
    const [editSettings, setEditSettings] = useState<ImageEditingSettings>({ model: 'gemini-2.5-flash-image-preview' });

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Reset state when opening
            setPrompt('');
            setInputImage1(null);
            setInputImage2(null);
            setOutput([]);
            setIsLoading(false);
            setError(null);
            setActiveMode('image');
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);
    
    useEffect(() => { // Reset inputs when mode changes
      setInputImage1(null);
      setInputImage2(null);
      setOutput([]);
      setError(null);
    }, [activeMode]);
    
    const handleSetImage = (setter: React.Dispatch<React.SetStateAction<Attachment | null>>) => (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            setter({ data: base64String, mimeType: file.type, fileName: file.name });
        };
        reader.readAsDataURL(file);
    };

    const handleGenerate = async () => {
        setIsLoading(true);
        setError(null);
        setOutput([]);

        try {
            let result: Attachment[] = [];
            let resultText = '';

            if (activeMode === 'image') {
                if (!prompt) throw new Error("A prompt is required for image generation.");
                result = await generateImage(prompt, genSettings, userProfile);
            } else if (activeMode === 'edit') {
                if (!prompt) throw new Error("A prompt is required for image editing.");
                if (!inputImage1) throw new Error("At least one image is required for editing.");
                const imagesToEdit = [inputImage1, inputImage2].filter(Boolean) as Attachment[];
                const { attachments, text } = await editImage(prompt, imagesToEdit, editSettings, userProfile);
                result = attachments;
                resultText = text;
            } else if (activeMode === 'faceSwap') {
                if (!inputImage1 || !inputImage2) throw new Error("A target image and a source face are required.");
                const swappedImage = await swapFace(inputImage1, inputImage2, userProfile);
                result = [swappedImage];
            } else if (activeMode === 'video') {
                throw new Error("This feature is not yet available.");
            }
            setOutput(result);
            if (resultText) setNotifications(prev => [resultText, ...prev.slice(0, 19)]);

        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage.includes('This is a Pro feature')) {
                onProFeatureBlock();
                onClose();
            } else {
                setError(errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = (attachment: Attachment) => {
        const link = document.createElement('a');
        link.href = `data:${attachment.mimeType};base64,${attachment.data}`;
        link.download = attachment.fileName || 'generated-media';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    const isDalle = genSettings.model === 'dall-e-3';
    const isImagen = genSettings.model === 'imagen-4.0-generate-001';
    const imagenRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    const dalleRatios = ["1:1", "16:9", "9:16"];
    const availableRatios = isImagen ? imagenRatios : (isDalle ? dalleRatios : []);
    const canGenerate = (activeMode === 'image' && !!prompt) || (activeMode === 'edit' && !!inputImage1) || (activeMode === 'faceSwap' && !!inputImage1 && !!inputImage2);
    
    const getAspectRatioClass = () => {
        if (activeMode !== 'image') {
            return ''; // Let the image determine its aspect ratio for edit/swap
        }
        const ratio = genSettings.aspectRatio; // e.g., "16:9"
        if (ratio === '1:1') return 'aspect-square';
        // Tailwind JIT needs the full class name, so string interpolation like this is fine.
        return `aspect-[${ratio.replace(':', '/')}]`;
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col sm:flex-row p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={e => e.stopPropagation()}>
                {/* Left Panel: Settings */}
                <div className="w-full sm:w-1/3 sm:pr-6 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 pb-4 sm:pb-0 mb-4 sm:mb-0 overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold flex items-center gap-2"><SparklesIcon className="w-7 h-7"/> Creative Tools</h2>
                        <button onClick={onClose} className="sm:hidden text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><CloseIcon className="w-7 h-7" /></button>
                    </div>
                     <div className="mb-4">
                        <label htmlFor="creative-mode-select" className="block text-sm font-medium mb-1 text-slate-600 dark:text-slate-400">Tool</label>
                        <select 
                            id="creative-mode-select"
                            value={activeMode} 
                            onChange={(e) => setActiveMode(e.target.value as CreativeMode)} 
                            className="w-full input-style"
                        >
                            <option value="image">Image Generation</option>
                            <option value="edit">Image Editing</option>
                            <option value="faceSwap">Face Swap</option>
                            <option value="video">Video Generation</option>
                        </select>
                    </div>
                    <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                        {activeMode === 'image' && <>
                            <h3 className="font-semibold text-lg">Model Settings</h3>
                            <div>
                                <label className="block text-sm font-medium mb-1">Model</label>
                                <select value={genSettings.model} onChange={(e) => setGenSettings(s => ({ ...s, model: e.target.value as ImageGenerationSettings['model'] }))} className="w-full input-style">
                                    <option value="imagen-4.0-generate-001">Imagen 4 (Google)</option>
                                    <option value="dall-e-3">DALL·E 3 (OpenAI)</option>
                                </select>
                            </div>
                             <Slider label="Number of Images" value={genSettings.numImages} min={1} max={4} step={1} onChange={v => setGenSettings(s => ({ ...s, numImages: v }))} />
                            <div>
                                <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
                                <select value={genSettings.aspectRatio} onChange={e => setGenSettings(s => ({ ...s, aspectRatio: e.target.value }))} className="w-full input-style">
                                    {availableRatios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
                                </select>
                            </div>
                            {isDalle && <>
                                <div><label className="block text-sm font-medium mb-1">Quality</label><select value={genSettings.quality} onChange={e => setGenSettings(s => ({ ...s, quality: e.target.value as 'standard' | 'hd' }))} className="w-full input-style"><option value="standard">Standard</option><option value="hd">HD</option></select></div>
                                <div><label className="block text-sm font-medium mb-1">Style</label><select value={genSettings.style} onChange={e => setGenSettings(s => ({ ...s, style: e.target.value as 'vivid' | 'natural' }))} className="w-full input-style"><option value="vivid">Vivid</option><option value="natural">Natural</option></select></div>
                            </>}
                        </>}
                         {activeMode === 'edit' && <>
                            <h3 className="font-semibold text-lg">Model Settings</h3>
                             <div>
                                <label className="block text-sm font-medium mb-1">Model</label>
                                <select value={editSettings.model} onChange={(e) => setEditSettings(s => ({ ...s, model: e.target.value as ImageEditingSettings['model'] }))} className="w-full input-style">
                                    <option value="gemini-2.5-flash-image-preview">Gemini 2.5 Flash</option>
                                </select>
                            </div>
                         </>}
                        {activeMode === 'faceSwap' && <><h3 className="font-semibold text-lg">Face Swap Info</h3><p className="text-sm text-slate-500 dark:text-slate-400">Upload a target image and an image with the source face. The model will swap the face from the source onto the target.</p></>}
                        {activeMode === 'video' && <><h3 className="font-semibold text-lg">Video Settings</h3><p className="text-sm text-slate-500 dark:text-slate-400">Video generation is coming soon!</p></>}
                    </div>
                </div>

                {/* Right Panel: Interaction */}
                <div className="w-full sm:w-2/3 sm:pl-6 flex flex-col h-full overflow-hidden">
                    {/* Main content area that splits on large screens */}
                    <div className="flex-grow flex flex-col lg:flex-row gap-6 py-4 min-h-0 overflow-y-auto">
                        {/* Input Section (Left side on LG) */}
                        <div className="w-full lg:w-1/2 flex flex-col gap-4">
                            <label htmlFor="generation-prompt" className="text-lg font-semibold">Input</label>
                            
                            {(activeMode === 'image' || activeMode === 'edit') && (
                                <textarea 
                                    id="generation-prompt"
                                    value={prompt} 
                                    onChange={e => setPrompt(e.target.value)} 
                                    placeholder="Enter your prompt here..."
                                    className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            )}
                            
                            {activeMode === 'edit' &&
                                <div className="grid grid-cols-2 gap-4">
                                    <ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="Image to Edit" textSize="text-sm" />
                                    <ImageUploader image={inputImage2} onImageSet={handleSetImage(setInputImage2)} title="Second Image (Optional)" textSize="text-xs" />
                                </div>
                            }
                            {activeMode === 'faceSwap' &&
                                <div className="grid grid-cols-2 gap-4">
                                    <ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="Target Image" />
                                    <ImageUploader image={inputImage2} onImageSet={handleSetImage(setInputImage2)} title="Source Face" />
                                </div>
                            }
                        </div>

                        {/* Output Section (Right side on LG) */}
                        <div className="w-full lg:w-1/2 flex flex-col gap-4">
                            <h3 className="text-lg font-semibold">Output</h3>
                            <div className="bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center p-2 min-h-[250px]">
                                {isLoading && <ArrowPathIcon className="w-10 h-10 text-slate-400 animate-spin" />}
                                {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                                {!isLoading && !error && output.length > 0 && 
                                    <div className={`grid gap-2 w-full ${output.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        {output.map((item, index) => {
                                            const aspectRatioClass = getAspectRatioClass();
                                            return (
                                                <div key={index} className={`relative group w-full ${aspectRatioClass}`}>
                                                    <img
                                                        src={`data:${item.mimeType};base64,${item.data}`}
                                                        alt="Generated media"
                                                        className={`rounded-lg object-contain w-full ${aspectRatioClass ? 'h-full' : 'h-auto'}`}
                                                    />
                                                    <button onClick={() => handleDownload(item)} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100" aria-label="Download image">
                                                        <DownloadIcon className="w-5 h-5"/>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                }
                                {!isLoading && !error && output.length === 0 && <p className="text-slate-500 dark:text-slate-400">Your results will appear here</p>}
                            </div>
                        </div>
                    </div>

                    {/* Generate Button at the bottom */}
                    <div className="flex-shrink-0 pt-4 mt-auto border-t border-slate-200 dark:border-slate-700">
                        {/* FIX: Remove redundant `activeMode === 'video'` check from disabled logic. The `!canGenerate` already covers this case. */}
                        <button onClick={handleGenerate} disabled={!canGenerate || isLoading} className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors">
                            {isLoading ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                </div>
            </div>
            <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; }`}</style>
        </div>
    );
};
