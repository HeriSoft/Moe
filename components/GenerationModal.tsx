import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CloseIcon, ImageIcon, EditIcon, FaceSwapIcon, VideoIcon, SparklesIcon, PhotoIcon, DownloadIcon, ArrowPathIcon, TrashIcon, PlusIcon, GoogleDriveIcon, ArrowUpTrayIcon, CropIcon, PaintBrushIcon, AdjustmentsVerticalIcon, CheckIcon, EraserIcon } from './icons';
import { generateImage, editImage, swapFace } from '../services/geminiService';
import type { Attachment, UserProfile } from '../types';
import * as googleDriveService from '../services/googleDriveService';

// Interfaces for settings
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

// --- Helper & Sub-components ---

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; disabled?: boolean; }> = ({ label, value, min, max, step, onChange, disabled }) => (
  <div>
    <label className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
      <span>{label}</span>
      <span>{value > 0 ? '+' : ''}{value}</span>
    </label>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50" disabled={disabled} />
  </div>
);

const ImageUploader: React.FC<{ image: Attachment | null; onImageSet: (file: File) => void; title: string; }> = ({ image, onImageSet, title }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) onImageSet(e.target.files[0]);
  };
  return (
    <div className="flex flex-col items-center">
        <h4 className="font-semibold mb-2 text-slate-600 dark:text-slate-300 text-center text-sm">{title}</h4>
        <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp"/>
        <button onClick={() => inputRef.current?.click()} className="w-full aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors p-2 text-center">
            {image ? <img src={`data:${image.mimeType};base64,${image.data}`} alt="preview" className="w-full h-full object-cover rounded-md" /> : <PhotoIcon className="w-10 h-10" />}
        </button>
    </div>
  );
};

// --- Type Definitions ---
type CreativeMode = 'image' | 'edit' | 'faceSwap' | 'video' | 'pixshop';
type PixshopTool = 'crop' | 'edit_area' | 'magic_area' | 'erase' | 'draw' | null;
type CropRect = { x: number; y: number; width: number; height: number; } | null;

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  onProFeatureBlock: () => void;
  handleExpGain: (amount: number) => void;
}

// --- Main Component ---
export const GenerationModal: React.FC<GenerationModalProps> = ({ isOpen, onClose, userProfile, setNotifications, onProFeatureBlock, handleExpGain }) => {
    // --- General State ---
    const [activeMode, setActiveMode] = useState<CreativeMode>('pixshop');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [output, setOutput] = useState<Attachment[]>([]);

    // --- Tool-specific State ---
    const [prompt, setPrompt] = useState('');
    const [inputImage1, setInputImage1] = useState<Attachment | null>(null);
    const [inputImage2, setInputImage2] = useState<Attachment | null>(null);
    const [genSettings, setGenSettings] = useState<ImageGenerationSettings>({ model: 'imagen-4.0-generate-001', aspectRatio: '1:1', numImages: 1, quality: 'standard', style: 'vivid' });
    const [editSettings] = useState<ImageEditingSettings>({ model: 'gemini-2.5-flash-image-preview' });

    // --- Studio Pixshop State ---
    const [pixshopImage, setPixshopImage] = useState<Attachment | null>(null);
    const [pixshopOutput, setPixshopOutput] = useState<Attachment | null>(null);
    const [pixshopTool, setPixshopTool] = useState<PixshopTool>(null);
    const [pixshopAdjustments, setPixshopAdjustments] = useState({ vibrance: 0, warmth: 0, contrast: 0, isBW: false });
    const [cropStartPoint, setCropStartPoint] = useState<{x: number, y: number} | null>(null);
    const [cropRect, setCropRect] = useState<CropRect>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushColor, setBrushColor] = useState('#ff0000');
    const [creativePrompt, setCreativePrompt] = useState('');
    const [magicPromptSubject, setMagicPromptSubject] = useState('');

    // --- Refs ---
    const pixshopCanvasRef = useRef<HTMLDivElement>(null);
    const pixshopImageRef = useRef<HTMLImageElement>(null);
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const lastPointRef = useRef<{x: number, y: number} | null>(null);

    // --- Close & Reset Logic ---
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Reset all states
            setActiveMode('pixshop'); setIsLoading(false); setError(null); setOutput([]);
            setPrompt(''); setInputImage1(null); setInputImage2(null);
            setPixshopImage(null); setPixshopOutput(null); setPixshopTool(null);
            setPixshopAdjustments({ vibrance: 0, warmth: 0, contrast: 0, isBW: false });
            setCropStartPoint(null); setCropRect(null); setIsDrawing(false);
            setCreativePrompt(''); setMagicPromptSubject('');
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);

    useEffect(() => {
        // Reset tool-specific states when mode changes
        setInputImage1(null); setInputImage2(null); setOutput([]); setError(null);
        setPixshopImage(null); setPixshopOutput(null); setPixshopTool(null);
    }, [activeMode]);
    
    // FIX: Add missing handleDownload function
    const handleDownload = (attachment: Attachment | null) => {
        if (!attachment) return;
        const link = document.createElement('a');
        link.href = `data:${attachment.mimeType};base64,${attachment.data}`;
        link.download = attachment.fileName || `generated-image.${attachment.mimeType.split('/')[1] || 'png'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Image Upload Handler ---
    const handleSetImage = (setter: React.Dispatch<React.SetStateAction<Attachment | null>>) => (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            setter({ data: base64String, mimeType: file.type, fileName: file.name });
        };
        reader.readAsDataURL(file);
    };

    // --- Generic API Call Wrapper ---
    const handleGenericApiCall = async (apiCall: () => Promise<Attachment[] | { text: string, attachments: Attachment[] }>) => {
        setIsLoading(true); setError(null); setOutput([]); setPixshopOutput(null);
        try {
            const result = await apiCall();
            handleExpGain(50);
            const attachments = Array.isArray(result) ? result : result.attachments;
            if (activeMode === 'pixshop') setPixshopOutput(attachments[0] || null);
            else setOutput(attachments);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage.includes('This is a Pro feature')) { onProFeatureBlock(); onClose(); } 
            else { setError(errorMessage); }
        } finally {
            setIsLoading(false);
            // Reset creative tool state after use
            if (pixshopTool) {
                setPixshopTool(null);
                setCreativePrompt('');
                setMagicPromptSubject('');
                const canvas = drawingCanvasRef.current;
                if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };
    
    // --- Tool-specific API Triggers ---
    const handleGenerate = () => handleGenericApiCall(() => generateImage(prompt, genSettings, userProfile));
    const handleEdit = () => handleGenericApiCall(() => editImage(prompt, [inputImage1!], editSettings, userProfile));
    const handleSwap = () => handleGenericApiCall(async () => [await swapFace(inputImage1!, inputImage2!, userProfile)]);
    
    // --- Pixshop API Triggers ---
    const createCompositeImage = useCallback(async (): Promise<Attachment | null> => {
        const originalImg = pixshopImageRef.current;
        const drawingCvs = drawingCanvasRef.current;
        if (!originalImg || !drawingCvs) return null;

        const compositeCvs = document.createElement('canvas');
        const ctx = compositeCvs.getContext('2d');
        if (!ctx) return null;

        compositeCvs.width = originalImg.naturalWidth;
        compositeCvs.height = originalImg.naturalHeight;
        
        ctx.drawImage(originalImg, 0, 0);
        // Draw the overlay canvas scaled to the original image dimensions
        ctx.drawImage(drawingCvs, 0, 0, originalImg.naturalWidth, originalImg.naturalHeight);

        const dataUrl = compositeCvs.toDataURL(pixshopImage!.mimeType);
        const base64 = dataUrl.split(',')[1];
        return { ...pixshopImage!, data: base64 };
    }, [pixshopImage]);

    const handleCreativeEdit = async () => {
        let finalPrompt = '';
        let imageToSend: Attachment | null = pixshopImage;

        switch (pixshopTool) {
            case 'magic_area':
                if (!magicPromptSubject || !creativePrompt) return;
                finalPrompt = `For the object described as "${magicPromptSubject}", apply this edit: "${creativePrompt}".`;
                break;
            case 'edit_area':
            case 'erase':
            case 'draw':
                if (!creativePrompt && pixshopTool !== 'erase') return;
                const composite = await createCompositeImage();
                if (!composite) return;
                imageToSend = composite;
                
                if (pixshopTool === 'edit_area') finalPrompt = `Apply this edit only to the area I painted in ${brushColor}: "${creativePrompt}".`;
                else if (pixshopTool === 'erase') finalPrompt = `Remove the area I painted over in ${brushColor} and fill the space with a realistic background (inpainting).`;
                else if (pixshopTool === 'draw') finalPrompt = `Turn my drawing (in ${brushColor}) into a realistic part of the image, following this instruction: "${creativePrompt}".`;
                break;
            default: return;
        }

        if (imageToSend) {
            handleGenericApiCall(() => editImage(finalPrompt, [imageToSend!], editSettings, userProfile));
        }
    };

    const handlePixshopQuickEdit = (editPrompt: string) => handleGenericApiCall(() => editImage(editPrompt, [pixshopImage!], editSettings, userProfile));
    
    const handlePixshopAdjustments = () => {
        const { vibrance, warmth, contrast, isBW } = pixshopAdjustments;
        const parts = [];
        if (isBW) parts.push("convert to black and white");
        if (vibrance !== 0) parts.push(`${vibrance > 0 ? 'increase' : 'decrease'} vibrance`);
        if (warmth !== 0) parts.push(`make the image ${warmth > 0 ? 'warmer' : 'cooler'}`);
        if (contrast !== 0) parts.push(`${contrast > 0 ? 'increase' : 'decrease'} contrast`);
        if (parts.length > 0) handlePixshopQuickEdit("Apply these adjustments: " + parts.join(', '));
    };

    // --- Crop Logic ---
    const handleCropPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (pixshopTool !== 'crop' || !pixshopCanvasRef.current) return;
        const rect = pixshopCanvasRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        setCropStartPoint({ x, y });
        setCropRect({ x, y, width: 0, height: 0 });

        const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
            moveEvent.preventDefault();
            const moveRect = pixshopCanvasRef.current!.getBoundingClientRect();
            const moveClientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const moveClientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
            const currentX = Math.max(0, Math.min(1, (moveClientX - moveRect.left) / moveRect.width));
            const currentY = Math.max(0, Math.min(1, (moveClientY - moveRect.top) / moveRect.height));
            setCropRect({
                x: Math.min(x, currentX),
                y: Math.min(y, currentY),
                width: Math.abs(currentX - x),
                height: Math.abs(currentY - y),
            });
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
            setCropStartPoint(null);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('touchend', handleUp);
    };

    const handleApplyCrop = () => {
        if (!cropRect || !pixshopImage || !pixshopImageRef.current) return;
        const image = new Image();
        image.src = `data:${pixshopImage.mimeType};base64,${pixshopImage.data}`;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const sx = cropRect.x * image.naturalWidth;
            const sy = cropRect.y * image.naturalHeight;
            const sWidth = cropRect.width * image.naturalWidth;
            const sHeight = cropRect.height * image.naturalHeight;
            canvas.width = sWidth; canvas.height = sHeight;
            ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
            const dataUrl = canvas.toDataURL(pixshopImage.mimeType);
            const newAttachment = { ...pixshopImage, data: dataUrl.split(',')[1] };
            setPixshopImage(newAttachment); setPixshopOutput(newAttachment);
            setPixshopTool(null); setCropRect(null);
        };
    };
    
    // --- Drawing Canvas Logic ---
    const handleDrawingPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (!drawingCanvasRef.current || !['erase', 'edit_area', 'draw'].includes(pixshopTool!)) return;
        const canvas = drawingCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        setIsDrawing(true);
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        lastPointRef.current = { x: clientX - rect.left, y: clientY - rect.top };
    };

    const handleDrawingPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || !drawingCanvasRef.current || !lastPointRef.current) return;
        const canvas = drawingCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const currentPoint = { x: clientX - rect.left, y: clientY - rect.top };
        
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = pixshopTool === 'erase' ? 20 : 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (pixshopTool === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }
        
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        
        lastPointRef.current = currentPoint;
    };
    
    const handleDrawingPointerUp = () => {
        setIsDrawing(false);
        lastPointRef.current = null;
    };

    // --- Dynamic UI Data & Checks ---
    const isDalle = genSettings.model === 'dall-e-3';
    const availableRatios = isDalle ? ["1:1", "16:9", "9:16"] : ["1:1", "16:9", "9:16", "4:3", "3:4"];
    const canGenerate = (activeMode === 'image' && !!prompt) || (activeMode === 'faceSwap' && !!inputImage1 && !!inputImage2) || (activeMode === 'edit' && !!inputImage1 && !!prompt);
    
    const pixshopColorFilters = [
        { name: 'Vintage', prompt: 'apply a warm, vintage color filter' }, { name: 'B&W', prompt: 'convert to a high-contrast black and white image' },
        { name: 'Cinematic', prompt: 'apply a cool, cinematic blue color grade' }, { name: 'Vibrant', prompt: 'enhance the colors to be more vibrant' },
    ];
    const pixshopArtStyles = [
        { name: 'Anime', prompt: 'transform into an anime style illustration' },
        { name: 'Van Gogh', prompt: 'repaint in the style of Vincent van Gogh' },
        { name: 'Sketch', prompt: 'convert into a detailed pencil sketch' },
        { name: '3D Cartoon', prompt: 'recreate this image in a cute, stylized 3D cartoon style, like a Pixar or Disney animation character' },
    ];
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col sm:flex-row p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={e => e.stopPropagation()}>
                {/* --- Left Column: Settings --- */}
                <div className="w-full sm:w-[40%] md:w-1/3 sm:pr-6 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 pb-4 sm:pb-0 mb-4 sm:mb-0 flex-shrink-0 flex flex-col">
                    <div className="flex justify-between items-center mb-4 flex-shrink-0">
                        <h2 className="text-2xl font-bold flex items-center gap-2"><SparklesIcon className="w-7 h-7"/> Creative Tools</h2>
                        <button onClick={onClose} className="sm:hidden text-slate-500"><CloseIcon className="w-7 h-7" /></button>
                    </div>
                    <div className="overflow-y-auto pr-2 -mr-2 space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
                            {[
                                { id: 'pixshop', label: 'Studio Pixshop', icon: CropIcon },
                                { id: 'image', label: 'Image Generation', icon: ImageIcon },
                                { id: 'faceSwap', label: 'Face Swap', icon: FaceSwapIcon },
                                { id: 'video', label: 'Video Generation', icon: VideoIcon, disabled: true },
                            ].map(tool => (
                                <button key={tool.id} onClick={() => !tool.disabled && setActiveMode(tool.id as CreativeMode)} disabled={tool.disabled}
                                    className={`p-3 rounded-lg flex flex-col items-center justify-center gap-2 transition-colors ${activeMode === tool.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-[#2d2d40] hover:bg-slate-200 dark:hover:bg-slate-800'} ${tool.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <tool.icon className="w-6 h-6"/> <span>{tool.label}</span>
                                </button>
                            ))}
                        </div>
                        {activeMode === 'image' && <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                            <h3 className="font-semibold text-lg">Model Settings</h3>
                            <div><label className="label-style mb-1">Model</label><select value={genSettings.model} onChange={(e) => setGenSettings(s => ({ ...s, model: e.target.value as any }))} className="w-full input-style"><option value="imagen-4.0-generate-001">Imagen 4</option><option value="dall-e-3">DALL·E 3</option></select></div>
                            <Slider label="Number of Images" value={genSettings.numImages} min={1} max={4} step={1} onChange={v => setGenSettings(s => ({ ...s, numImages: v }))} />
                            <div><label className="label-style mb-1">Aspect Ratio</label><select value={genSettings.aspectRatio} onChange={e => setGenSettings(s => ({ ...s, aspectRatio: e.target.value }))} className="w-full input-style">{availableRatios.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                            {isDalle && <>
                                <div><label className="label-style mb-1">Quality</label><select value={genSettings.quality} onChange={e => setGenSettings(s => ({ ...s, quality: e.target.value as any }))} className="w-full input-style"><option value="standard">Standard</option><option value="hd">HD</option></select></div>
                                <div><label className="label-style mb-1">Style</label><select value={genSettings.style} onChange={e => setGenSettings(s => ({ ...s, style: e.target.value as any }))} className="w-full input-style"><option value="vivid">Vivid</option><option value="natural">Natural</option></select></div>
                            </>}
                        </div>}
                        {(activeMode === 'pixshop') && <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                            <h3 className="font-semibold text-lg">Model Settings</h3>
                            <div><label className="label-style mb-1">Model</label><select className="w-full input-style"><option>Gemini 2.5 Flash</option></select></div>
                        </div>}
                    </div>
                </div>

                {/* --- Right Column: Main Content --- */}
                <div className="w-full sm:w-[60%] md:w-2/3 sm:pl-6 flex flex-col flex-grow min-h-0 overflow-hidden">
                    {activeMode !== 'pixshop' ? <>
                        <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 min-h-0 overflow-y-auto">
                            <div className="flex flex-col gap-4">
                                <h3 className="text-lg font-semibold">Input</h3>
                                {activeMode === 'image' && <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your prompt..." className="w-full h-24 p-3 input-style resize-none"/>}
                                {activeMode === 'edit' && <>
                                    <ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="" />
                                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter edit instruction..." className="w-full h-24 p-3 input-style resize-none"/>
                                </>}
                                {activeMode === 'faceSwap' && <div className="grid grid-cols-2 gap-4"><ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="Target Image" /><ImageUploader image={inputImage2} onImageSet={handleSetImage(setInputImage2)} title="Source Face" /></div>}
                            </div>
                            <div className="flex flex-col gap-4">
                                <h3 className="text-lg font-semibold">Output</h3>
                                <div className="w-full aspect-square bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center p-2">
                                    {isLoading && <ArrowPathIcon className="w-10 h-10 text-slate-400 animate-spin" />}
                                    {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                                    {!isLoading && !error && output.length > 0 && <div className={`grid gap-2 w-full ${output.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>{output.map((item, i) => <div key={i} className={`relative group w-full aspect-[${genSettings.aspectRatio.replace(':', '/')}]`}><img src={`data:${item.mimeType};base64,${item.data}`} alt="Generated" className="rounded-lg object-cover w-full h-full"/><button onClick={() => handleDownload(item)} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><DownloadIcon className="w-5 h-5"/></button></div>)}</div>}
                                </div>
                            </div>
                        </div>
                        <div className="flex-shrink-0 pt-4 mt-auto border-t border-slate-200 dark:border-slate-700">
                            <button onClick={activeMode === 'image' ? handleGenerate : activeMode === 'edit' ? handleEdit : handleSwap} disabled={!canGenerate || isLoading} className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed">{isLoading ? 'Generating...' : 'Generate'}</button>
                        </div>
                    </> : <div className="flex flex-col h-full overflow-hidden">
                        {/* Pixshop: Top Row */}
                        <div className="grid grid-cols-2 gap-4 flex-grow min-h-0">
                            <div className="flex flex-col gap-2"><h3 className="text-lg font-semibold text-center">Canvas</h3>
                                <div ref={pixshopCanvasRef} onMouseDown={handleCropPointerDown} className="relative w-full aspect-square bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center cursor-crosshair">
                                    {!pixshopImage ? <button onClick={() => document.getElementById('pixshop-uploader')?.click()} className="flex flex-col items-center gap-2 text-slate-500"><ArrowUpTrayIcon className="w-10 h-10"/><span>Upload Image</span></button> : <img ref={pixshopImageRef} src={`data:${pixshopImage.mimeType};base64,${pixshopImage.data}`} className="max-w-full max-h-full object-contain rounded-md" />}
                                    <input type="file" id="pixshop-uploader" onChange={e => e.target.files && handleSetImage(setPixshopImage)(e.target.files[0])} className="hidden" accept="image/*"/>
                                    {pixshopImage && <button onClick={() => { setPixshopImage(null); setPixshopOutput(null); }} className="absolute top-2 right-2 p-1 bg-black/40 text-white rounded-full hover:bg-red-500"><TrashIcon className="w-4 h-4"/></button>}
                                    {(pixshopTool === 'edit_area' || pixshopTool === 'erase' || pixshopTool === 'draw') && <canvas ref={drawingCanvasRef} width={pixshopImageRef.current?.clientWidth} height={pixshopImageRef.current?.clientHeight} className="absolute top-0 left-0 w-full h-full" onMouseDown={handleDrawingPointerDown} onMouseMove={handleDrawingPointerMove} onMouseUp={handleDrawingPointerUp} onMouseLeave={handleDrawingPointerUp}></canvas>}
                                    {pixshopTool === 'crop' && cropRect && <div className="absolute border-2 border-dashed border-white bg-black/30 pointer-events-none" style={{ left: `${cropRect.x*100}%`, top: `${cropRect.y*100}%`, width: `${cropRect.width*100}%`, height: `${cropRect.height*100}%` }}></div>}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2"><h3 className="text-lg font-semibold text-center">Result</h3>
                                <div className="w-full aspect-square bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center p-2">
                                    {isLoading && <ArrowPathIcon className="w-10 h-10 text-slate-400 animate-spin" />}
                                    {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                                    {!isLoading && !error && pixshopOutput && <div className="relative group w-full h-full"><img src={`data:${pixshopOutput.mimeType};base64,${pixshopOutput.data}`} alt="Result" className="rounded-lg object-contain w-full h-full"/><div className="absolute top-2 right-2 flex flex-col gap-2"><button onClick={() => handleDownload(pixshopOutput)} className="p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><DownloadIcon className="w-5 h-5"/></button><button onClick={() => { setPixshopImage(pixshopOutput); setPixshopOutput(null); }} className="p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100" title="Use as new input"><ArrowPathIcon className="w-5 h-5"/></button></div></div>}
                                </div>
                            </div>
                        </div>
                        {/* Pixshop: Bottom Row */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                            <div className="space-y-2"><h4 className="font-semibold text-sm">Quick Edits</h4><div className="grid grid-cols-2 gap-2 text-sm">
                                <button onClick={() => setPixshopTool(t => t === 'crop' ? null : 'crop')} disabled={!pixshopImage || isLoading} className={`tool-btn ${pixshopTool === 'crop' ? '!bg-indigo-500 text-white' : ''}`}><CropIcon className="w-4 h-4"/> Crop</button>
                                <button onClick={() => handlePixshopQuickEdit("blur background")} disabled={!pixshopImage || isLoading} className="tool-btn">Blur BG</button>
                            </div>{pixshopTool === 'crop' && <div className="grid grid-cols-2 gap-2 text-sm"><button onClick={handleApplyCrop} disabled={!cropRect} className="tool-btn bg-green-500 text-white">Apply</button><button onClick={() => { setPixshopTool(null); setCropRect(null); }} className="tool-btn bg-red-500 text-white">Cancel</button></div>}<div className="grid grid-cols-4 gap-2">{pixshopColorFilters.map(f => <button key={f.name} onClick={() => handlePixshopQuickEdit(f.prompt)} disabled={!pixshopImage || isLoading} className="tool-btn text-xs">{f.name}</button>)}</div></div>
                            <div className="space-y-2"><h4 className="font-semibold text-sm">Creative Edits</h4><div className="grid grid-cols-2 gap-2 text-sm">
                                <button onClick={() => setPixshopTool(t => t === 'edit_area' ? null : 'edit_area')} disabled={!pixshopImage || isLoading} className={`tool-btn ${pixshopTool === 'edit_area' ? '!bg-indigo-500 text-white' : ''}`}><EditIcon className="w-4 h-4"/> Edit Area</button>
                                <button onClick={() => setPixshopTool(t => t === 'magic_area' ? null : 'magic_area')} disabled={!pixshopImage || isLoading} className={`tool-btn ${pixshopTool === 'magic_area' ? '!bg-indigo-500 text-white' : ''}`}><SparklesIcon className="w-4 h-4"/> Magic Area</button>
                                <button onClick={() => setPixshopTool(t => t === 'erase' ? null : 'erase')} disabled={!pixshopImage || isLoading} className={`tool-btn ${pixshopTool === 'erase' ? '!bg-indigo-500 text-white' : ''}`}><EraserIcon className="w-4 h-4"/> Erase</button>
                                <button onClick={() => setPixshopTool(t => t === 'draw' ? null : 'draw')} disabled={!pixshopImage || isLoading} className={`tool-btn ${pixshopTool === 'draw' ? '!bg-indigo-500 text-white' : ''}`}><PaintBrushIcon className="w-4 h-4"/> Draw</button>
                            </div>
                            {pixshopTool === 'magic_area' && <div className="space-y-1"><input value={magicPromptSubject} onChange={e => setMagicPromptSubject(e.target.value)} placeholder="Object to select..." className="input-style text-xs"/><input value={creativePrompt} onChange={e => setCreativePrompt(e.target.value)} placeholder="Action to perform..." className="input-style text-xs"/><button onClick={handleCreativeEdit} className="w-full tool-btn bg-indigo-500 text-white text-xs">Apply Magic</button></div>}
                            {(pixshopTool === 'edit_area' || pixshopTool === 'draw') && <div className="space-y-1"><input value={creativePrompt} onChange={e => setCreativePrompt(e.target.value)} placeholder="Describe your edit..." className="input-style text-xs"/><div className="flex gap-2"><input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="h-8 w-8 p-0 border-none rounded-md"/><button onClick={handleCreativeEdit} className="w-full tool-btn bg-indigo-500 text-white text-xs">Apply</button></div></div>}
                            {pixshopTool === 'erase' && <button onClick={handleCreativeEdit} className="w-full tool-btn bg-indigo-500 text-white text-xs">Apply Erase</button>}
                            </div>
                            <div className="space-y-2"><h4 className="font-semibold text-sm">Advanced Tools</h4><div className="grid grid-cols-2 gap-2 text-sm">
                                <button onClick={() => handlePixshopQuickEdit("restore this old photo")} disabled={!pixshopImage || isLoading} className="tool-btn">Restore Photo</button>
                                <button onClick={() => handlePixshopQuickEdit("remove the background")} disabled={!pixshopImage || isLoading} className="tool-btn">Remove BG</button>
                            </div><select onChange={(e) => handlePixshopQuickEdit(e.target.value)} disabled={!pixshopImage || isLoading} className="tool-btn w-full"><option>Artistic Style...</option>{pixshopArtStyles.map(s => <option key={s.name} value={s.prompt}>{s.name}</option>)}</select></div>
                            <div className="space-y-2"><h4 className="font-semibold text-sm">Adjustments</h4><div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg space-y-2">
                                <Slider label="Vibrance" value={pixshopAdjustments.vibrance} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, vibrance: v }))} disabled={!pixshopImage || isLoading} />
                                <Slider label="Warmth" value={pixshopAdjustments.warmth} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, warmth: v }))} disabled={!pixshopImage || isLoading} />
                                <Slider label="Contrast" value={pixshopAdjustments.contrast} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, contrast: v }))} disabled={!pixshopImage || isLoading} />
                                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={pixshopAdjustments.isBW} onChange={e => setPixshopAdjustments(s => ({...s, isBW: e.target.checked}))} disabled={!pixshopImage || isLoading}/> B&W</label>
                                <button onClick={handlePixshopAdjustments} disabled={!pixshopImage || isLoading} className="w-full p-2 text-xs bg-indigo-500 text-white rounded-md font-semibold hover:bg-indigo-600 disabled:opacity-50">Apply Adjustments</button>
                            </div></div>
                        </div>
                    </div>}
                </div>
            </div>
            <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; } .label-style { display: block; font-size: 0.875rem; font-weight: 500; } .tool-btn { padding: 0.5rem; background-color: #f1f5f9; color: #334155; border-radius: 0.375rem; font-weight: 600; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; } .tool-btn:hover:not(:disabled) { background-color: #e2e8f0; } .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; } .dark .tool-btn { background-color: #334155; color: #e2e8f0; } .dark .tool-btn:hover:not(:disabled) { background-color: #475569; }`}</style>
        </div>
    );
};
