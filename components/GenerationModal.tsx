import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CloseIcon, ImageIcon, EditIcon, FaceSwapIcon, VideoIcon, SparklesIcon, PhotoIcon, DownloadIcon, ArrowPathIcon, TrashIcon, PlusIcon, FaceSmileIcon, FaceFrownIcon, FaceSadTearIcon, FaceLaughIcon, FacePoutingIcon, FaceAngryIcon, FaceGrinStarsIcon, GoogleDriveIcon, ArrowUpTrayIcon, CropIcon, PaintBrushIcon, AdjustmentsVerticalIcon, CheckIcon, ArrowUturnLeftIcon } from './icons';
import { EraserIcon } from './icons'; // Assuming EraserIcon is available
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

// Helper Components
const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; disabled?: boolean; }> = ({ label, value, min, max, step, onChange, disabled }) => (
  <div>
    <label className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
      <span>{label}</span>
      <span>{value > 0 ? '+' : ''}{value}</span>
    </label>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50" disabled={disabled} />
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

// Main Component Types
type CreativeMode = 'image' | 'edit' | 'faceSwap' | 'pixshop';
type PixshopTool = 'crop' | 'adjust' | 'erase' | 'magic_edit' | 'filter' | null;
type CropRect = { x: number; y: number; width: number; height: number; } | null;

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  onProFeatureBlock: () => void;
  handleExpGain: (amount: number) => void;
}

// Main Component
export const GenerationModal: React.FC<GenerationModalProps> = ({ isOpen, onClose, userProfile, setNotifications, onProFeatureBlock, handleExpGain }) => {
    const [activeMode, setActiveMode] = useState<CreativeMode>('pixshop');
    const [prompt, setPrompt] = useState('');
    const [inputImage1, setInputImage1] = useState<Attachment | null>(null);
    const [inputImage2, setInputImage2] = useState<Attachment | null>(null);
    const [output, setOutput] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Settings
    const [genSettings, setGenSettings] = useState<ImageGenerationSettings>({ model: 'imagen-4.0-generate-001', aspectRatio: '1:1', numImages: 1, quality: 'standard', style: 'vivid' });
    const [editSettings] = useState<ImageEditingSettings>({ model: 'gemini-2.5-flash-image-preview' });

    // Pixshop States
    const [pixshopHistory, setPixshopHistory] = useState<Attachment[]>([]);
    const [pixshopHistoryIndex, setPixshopHistoryIndex] = useState(-1);
    const [activePixshopTool, setActivePixshopTool] = useState<PixshopTool>(null);
    const [pixshopAdjustments, setPixshopAdjustments] = useState({ vibrance: 0, warmth: 0, contrast: 0 });
    
    // Crop States
    const [cropRect, setCropRect] = useState<CropRect>(null);
    const [cropStartPoint, setCropStartPoint] = useState<{x: number, y: number} | null>(null);

    // Drawing States (for Eraser & Magic Edit)
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(30);
    const [editAreaPrompt, setEditAreaPrompt] = useState('');

    // Refs
    const pixshopCanvasRef = useRef<HTMLDivElement>(null);
    const pixshopImageRef = useRef<HTMLImageElement>(null);
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

    const currentPixshopImage = useMemo(() => {
        return pixshopHistory[pixshopHistoryIndex] || null;
    }, [pixshopHistory, pixshopHistoryIndex]);

    const setPixshopImage = (image: Attachment | null) => {
        if (!image) {
            setPixshopHistory([]);
            setPixshopHistoryIndex(-1);
            return;
        }
        const newHistory = pixshopHistory.slice(0, pixshopHistoryIndex + 1);
        newHistory.push(image);
        setPixshopHistory(newHistory);
        setPixshopHistoryIndex(newHistory.length - 1);
    };

    const undoPixshop = () => {
        if (pixshopHistoryIndex > 0) setPixshopHistoryIndex(prev => prev - 1);
    };
    const redoPixshop = () => {
        if (pixshopHistoryIndex < pixshopHistory.length - 1) setPixshopHistoryIndex(prev => prev - 1);
    };

    // Main Modal Effects
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setActiveMode('pixshop');
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);
    
    useEffect(() => { // Reset inputs when mode changes
      setPrompt(''); setInputImage1(null); setInputImage2(null); setOutput([]); setError(null);
      setPixshopImage(null);
      setActivePixshopTool(null);
      setCropRect(null);
    }, [activeMode]);
    
    const handleSetImageFromFile = (setter: (img: Attachment | null) => void) => (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            setter({ data: base64String, mimeType: file.type, fileName: file.name });
        };
        reader.readAsDataURL(file);
    };
    
    const handleGenericApiCall = async (apiCall: () => Promise<Attachment[] | {attachments: Attachment[], text: string}>) => {
        setIsLoading(true);
        setError(null);
        setOutput([]);
        
        try {
            const result = await apiCall();
            handleExpGain(50);
            const attachments = 'attachments' in result ? result.attachments : result;
            if (activeMode === 'pixshop') {
                if (attachments[0]) setPixshopImage(attachments[0]);
                setActivePixshopTool(null);
            } else {
                setOutput(attachments);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage.includes('This is a Pro feature')) { onProFeatureBlock(); onClose(); } 
            else { setError(errorMessage); }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerate = () => {
        if (!prompt) { setError("A prompt is required."); return; }
        handleGenericApiCall(() => generateImage(prompt, genSettings, userProfile));
    };

    const handleEdit = () => {
        if (!prompt || !inputImage1) { setError("An image and prompt are required."); return; }
        handleGenericApiCall(() => editImage(prompt, [inputImage1], editSettings, userProfile));
    };

    const handleSwap = () => {
        if (!inputImage1 || !inputImage2) { setError("Target and source images are required."); return; }
        handleGenericApiCall(async () => [await swapFace(inputImage1, inputImage2, userProfile)]);
    };

    const handlePixshopEdit = (editPrompt: string, mask?: Attachment) => {
        if (!currentPixshopImage) { setError("Please upload an image."); return; }
        const images = mask ? [currentPixshopImage, mask] : [currentPixshopImage];
        handleGenericApiCall(() => editImage(editPrompt, images, editSettings, userProfile));
    };
    
    const getMaskAttachment = (): Attachment | null => {
        const canvas = drawingCanvasRef.current;
        if (!canvas) return null;
        const maskDataUrl = canvas.toDataURL('image/png');
        const base64 = maskDataUrl.split(',')[1];
        return { data: base64, mimeType: 'image/png', fileName: 'mask.png' };
    };
    
    const handleApplyErase = () => {
        const mask = getMaskAttachment();
        if (mask) handlePixshopEdit("Remove the object(s) indicated in the white areas of the mask image, and realistically fill in the background.", mask);
    };

    const handleApplyMagicEdit = () => {
        if (!editAreaPrompt) { setError("Please provide a prompt for the edit."); return; }
        const mask = getMaskAttachment();
        if (mask) handlePixshopEdit(`In the area indicated by the white mask, change it to: "${editAreaPrompt}"`, mask);
    };

    const handleApplyCrop = () => {
        if (!cropRect || !currentPixshopImage || !pixshopImageRef.current) return;
        const img = new Image();
        img.src = `data:${currentPixshopImage.mimeType};base64,${currentPixshopImage.data}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const sx = cropRect.x * img.naturalWidth;
            const sy = cropRect.y * img.naturalHeight;
            const sWidth = cropRect.width * img.naturalWidth;
            const sHeight = cropRect.height * img.naturalHeight;
            
            if (sWidth < 1 || sHeight < 1) return;

            canvas.width = sWidth;
            canvas.height = sHeight;
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

            const dataUrl = canvas.toDataURL(currentPixshopImage.mimeType);
            const base64 = dataUrl.split(',')[1];
            
            setPixshopImage({ ...currentPixshopImage, data: base64 });
            setActivePixshopTool(null);
            setCropRect(null);
        };
    };

    const handleCropPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (activePixshopTool !== 'crop' || !pixshopCanvasRef.current) return;
        const rect = pixshopCanvasRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        setCropStartPoint({ x, y });
        setCropRect({ x, y, width: 0, height: 0 }); // Start a new rect
    };
    const handleCropPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!cropStartPoint || !pixshopCanvasRef.current) return;
        e.preventDefault();
        const rect = pixshopCanvasRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const currentX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const currentY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

        setCropRect({
            x: Math.min(cropStartPoint.x, currentX),
            y: Math.min(cropStartPoint.y, currentY),
            width: Math.abs(currentX - cropStartPoint.x),
            height: Math.abs(currentY - cropStartPoint.y),
        });
    };
    const handleCropPointerUp = () => {
        setCropStartPoint(null); // This finalizes the rectangle
    };

    const drawOnCanvas = (x: number, y: number, isStart: boolean = false) => {
        const canvas = drawingCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) return;
        ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (isStart) {
            ctx.beginPath();
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath(); // Create a circle at the point for smoother lines
            ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath(); // Move to the current point for the next line segment
            ctx.moveTo(x, y);
        }
    };
    const handleDrawStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (activePixshopTool !== 'erase' && activePixshopTool !== 'magic_edit') return;
        setIsDrawing(true);
        const { offsetX, offsetY } = getCanvasOffsets(e);
        drawOnCanvas(offsetX, offsetY, true);
    };
    const handleDrawMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = getCanvasOffsets(e);
        drawOnCanvas(offsetX, offsetY);
    };
    const handleDrawEnd = () => setIsDrawing(false);
    
    const getCanvasOffsets = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = drawingCanvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return { offsetX: clientX - rect.left, offsetY: clientY - rect.top };
    };

    useEffect(() => {
        const canvas = drawingCanvasRef.current;
        if (canvas && (activePixshopTool === 'erase' || activePixshopTool === 'magic_edit')) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [activePixshopTool]);
    
    const handleDownload = (attachment: Attachment) => {
        const link = document.createElement('a');
        link.href = `data:${attachment.mimeType};base64,${attachment.data}`;
        link.download = attachment.fileName || 'generated-media';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const isDalle = genSettings.model === 'dall-e-3';
    const imagenRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    const dalleRatios = ["1:1", "16:9", "9:16"];
    const availableRatios = isDalle ? dalleRatios : imagenRatios;
    const canGenerate = (activeMode === 'image' && !!prompt) || (activeMode === 'faceSwap' && !!inputImage1 && !!inputImage2) || (activeMode === 'edit' && !!inputImage1 && !!prompt);
    
    const pixshopArtStyles = [
        { name: 'Anime', prompt: 'transform this photo into a detailed anime style illustration' },
        { name: 'Van Gogh', prompt: 'repaint this photo in the expressive, impasto style of Vincent van Gogh' },
        { name: 'Sketch', prompt: 'convert this photo into a detailed pencil sketch' },
        { name: '3D Cartoon', prompt: 'recreate this image in the style of a cute, stylized 3D cartoon, like a Pixar movie character' },
    ];
    
    const renderToolPanel = () => (
      <div className="w-full sm:w-1/3 sm:pr-6 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 pb-4 sm:pb-0 mb-4 sm:mb-0 flex-shrink-0 flex flex-col">
          <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold flex items-center gap-2"><SparklesIcon className="w-7 h-7"/> Creative Tools</h2>
              <button onClick={onClose} className="sm:hidden text-slate-500"><CloseIcon className="w-7 h-7" /></button>
          </div>
          
          <div className="mb-4">
              <label className="label-style mb-1">Tool</label>
              <div className="flex flex-col gap-2">
                  {[
                      { id: 'pixshop', label: 'Studio Pixshop', icon: PaintBrushIcon },
                      { id: 'image', label: 'Image Generation', icon: ImageIcon },
                      { id: 'edit', label: 'Advanced Editing', icon: EditIcon },
                      { id: 'faceSwap', label: 'Face Swap', icon: FaceSwapIcon },
                  ].map(tool => (
                      <button key={tool.id} onClick={() => setActiveMode(tool.id as CreativeMode)}
                          className={`p-3 rounded-lg flex flex-row items-center justify-start gap-4 text-sm font-semibold transition-colors ${activeMode === tool.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-[#2d2d40] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'}`}>
                          <tool.icon className="w-6 h-6"/><span>{tool.label}</span>
                      </button>
                  ))}
              </div>
          </div>
          
          <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
            {activeMode === 'image' && <>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your prompt here..." className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style"/>
              <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                <h3 className="font-semibold text-lg">Model Settings</h3>
                <select value={genSettings.model} onChange={e => setGenSettings(s => ({ ...s, model: e.target.value as any }))} className="w-full input-style">
                    <option value="imagen-4.0-generate-001">Imagen 4 (Google)</option><option value="dall-e-3">DALL·E 3 (OpenAI)</option>
                </select>
                <Slider label="Images" value={genSettings.numImages} min={1} max={4} step={1} onChange={v => setGenSettings(s => ({ ...s, numImages: v }))} />
                <select value={genSettings.aspectRatio} onChange={e => setGenSettings(s => ({ ...s, aspectRatio: e.target.value }))} className="w-full input-style">
                    {availableRatios.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {isDalle && <>
                    <select value={genSettings.quality} onChange={e => setGenSettings(s => ({ ...s, quality: e.target.value as any }))} className="w-full input-style"><option value="standard">Standard</option><option value="hd">HD</option></select>
                    <select value={genSettings.style} onChange={e => setGenSettings(s => ({ ...s, style: e.target.value as any }))} className="w-full input-style"><option value="vivid">Vivid</option><option value="natural">Natural</option></select>
                </>}
              </div>
            </>}
            {activeMode === 'edit' && <>
              <ImageUploader image={inputImage1} onImageSet={handleSetImageFromFile(setInputImage1)} title="Image to Edit" textSize="text-base" />
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter editing prompt (e.g., 'add a hat')..." className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style"/>
            </>}
            {activeMode === 'faceSwap' && <div className="grid grid-cols-2 gap-4">
              <ImageUploader image={inputImage1} onImageSet={handleSetImageFromFile(setInputImage1)} title="Target Image" />
              <ImageUploader image={inputImage2} onImageSet={handleSetImageFromFile(setInputImage2)} title="Source Face" />
            </div>}
            {activeMode === 'pixshop' && <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                    {[{id:'crop', l:'Crop', i:CropIcon}, {id:'adjust', l:'Adjust', i:AdjustmentsVerticalIcon}, {id:'erase', l:'Eraser', i:EraserIcon}, {id:'magic_edit', l:'Magic Edit', i:PaintBrushIcon}, {id:'filter', l:'Filters', i:SparklesIcon}].map(t => 
                        <button key={t.id} onClick={() => setActivePixshopTool(t.id as PixshopTool)} disabled={!currentPixshopImage || isLoading}
                            className={`p-2 rounded-lg flex flex-col items-center gap-1 tool-btn ${activePixshopTool === t.id ? '!bg-indigo-500 text-white' : ''}`}>
                            <t.i className="w-5 h-5"/><span>{t.l}</span></button>
                    )}
                </div>
                {activePixshopTool === 'crop' && <div className="bg-slate-100 dark:bg-[#2d2d40] p-3 rounded-lg grid grid-cols-2 gap-2">
                    <button onClick={handleApplyCrop} disabled={!cropRect} className="tool-btn bg-green-500 text-white hover:bg-green-600">Apply</button>
                    <button onClick={() => { setActivePixshopTool(null); setCropRect(null); }} className="tool-btn bg-red-500 text-white hover:bg-red-600">Cancel</button>
                </div>}
                {activePixshopTool === 'adjust' && <div className="bg-slate-100 dark:bg-[#2d2d40] p-3 rounded-lg space-y-3">
                    <Slider label="Vibrance" value={pixshopAdjustments.vibrance} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, vibrance: v }))} disabled={isLoading} />
                    <Slider label="Warmth" value={pixshopAdjustments.warmth} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, warmth: v }))} disabled={isLoading} />
                    <Slider label="Contrast" value={pixshopAdjustments.contrast} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, contrast: v }))} disabled={isLoading} />
                    {/* FIX: Correctly destructure properties from pixshopAdjustments and build a valid prompt string. */}
                    <button
                        onClick={() => {
                            const { vibrance, warmth, contrast } = pixshopAdjustments;
                            const adjustments = [
                                vibrance !== 0 ? `${vibrance > 0 ? 'increase' : 'decrease'} vibrance by ${Math.abs(vibrance)}` : null,
                                warmth !== 0 ? `make it ${warmth > 0 ? 'warmer' : 'cooler'} by ${Math.abs(warmth)}` : null,
                                contrast !== 0 ? `${contrast > 0 ? 'increase' : 'decrease'} contrast by ${Math.abs(contrast)}` : null,
                            ].filter(Boolean).join(', ');
                            
                            if (adjustments) {
                                handlePixshopEdit(`Apply adjustments: ${adjustments}`);
                            }
                        }}
                        className="w-full p-2 text-xs bg-indigo-500 text-white rounded-md font-semibold hover:bg-indigo-600 disabled:opacity-50"
                        disabled={isLoading || (pixshopAdjustments.vibrance === 0 && pixshopAdjustments.warmth === 0 && pixshopAdjustments.contrast === 0)}
                    >
                        Apply
                    </button>
                </div>}
                {(activePixshopTool === 'erase' || activePixshopTool === 'magic_edit') && <div className="bg-slate-100 dark:bg-[#2d2d40] p-3 rounded-lg space-y-3">
                    <Slider label="Brush Size" value={brushSize} min={5} max={100} step={1} onChange={setBrushSize} disabled={isLoading} />
                    {activePixshopTool === 'magic_edit' && <textarea value={editAreaPrompt} onChange={e => setEditAreaPrompt(e.target.value)} placeholder="Change selected area to..." className="w-full h-16 p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style"/>}
                    <button onClick={activePixshopTool === 'erase' ? handleApplyErase : handleApplyMagicEdit} className="w-full tool-btn bg-indigo-500 text-white hover:bg-indigo-600">Apply</button>
                </div>}
                {activePixshopTool === 'filter' && <div className="bg-slate-100 dark:bg-[#2d2d40] p-3 rounded-lg grid grid-cols-2 gap-2 text-sm">
                    {pixshopArtStyles.map(s => <button key={s.name} onClick={() => handlePixshopEdit(s.prompt)} className="tool-btn">{s.name}</button>)}
                </div>}
            </>}
          </div>
          
          <div className="flex-shrink-0 pt-4 mt-auto border-t border-slate-200 dark:border-slate-700">
             {activeMode !== 'pixshop' && 
                 <button onClick={activeMode === 'image' ? handleGenerate : activeMode === 'edit' ? handleEdit : handleSwap} disabled={!canGenerate || isLoading} 
                     className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400">
                     {isLoading ? 'Generating...' : 'Generate'}
                 </button>
             }
          </div>
      </div>
    );

    const renderCanvasAndOutput = () => (
      <div className="w-full sm:w-2/3 sm:pl-6 flex flex-col flex-grow min-h-0">
          {activeMode !== 'pixshop' ? (
              <div className="flex-grow flex items-center justify-center p-4 bg-slate-100 dark:bg-[#2d2d40] rounded-lg">
                  {isLoading && <ArrowPathIcon className="w-12 h-12 text-slate-400 animate-spin" />}
                  {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                  {!isLoading && !error && output.length > 0 && 
                      <div className={`grid gap-2 w-full h-full ${output.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {output.map((item, index) => <div key={index} className="relative group"><img src={`data:${item.mimeType};base64,${item.data}`} alt="Generated media" className="rounded-lg object-contain w-full h-full"/><button onClick={() => handleDownload(item)} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><DownloadIcon className="w-5 h-5"/></button></div>)}
                      </div>
                  }
                  {!isLoading && !error && output.length === 0 && <p className="text-slate-500 dark:text-slate-400">Your results will appear here</p>}
              </div>
          ) : (
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xl font-semibold">Studio Pixshop</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={undoPixshop} disabled={pixshopHistoryIndex <= 0} className="tool-btn p-2" title="Undo"><ArrowUturnLeftIcon className="w-5 h-5"/></button>
                        <button onClick={() => {setPixshopImage(null); setOutput([])}} disabled={!currentPixshopImage} className="tool-btn p-2" title="Clear Image"><TrashIcon className="w-5 h-5"/></button>
                        <button onClick={() => currentPixshopImage && handleDownload(currentPixshopImage)} disabled={!currentPixshopImage} className="tool-btn p-2" title="Download"><DownloadIcon className="w-5 h-5"/></button>
                    </div>
                </div>
                <div ref={pixshopCanvasRef} onMouseDown={handleCropPointerDown} onMouseMove={handleCropPointerMove} onMouseUp={handleCropPointerUp} onMouseLeave={handleCropPointerUp}
                     onTouchStart={handleCropPointerDown} onTouchMove={handleCropPointerMove} onTouchEnd={handleCropPointerUp}
                     className="relative w-full flex-grow bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center overflow-hidden"
                     style={{ cursor: activePixshopTool === 'crop' ? 'crosshair' : 'default' }}>
                    
                    {!currentPixshopImage ? <button onClick={() => document.getElementById('pixshop-uploader')?.click()} className="flex flex-col items-center gap-2 text-slate-500"><ArrowUpTrayIcon className="w-10 h-10"/><span>Upload Image</span></button> 
                    : <img ref={pixshopImageRef} src={`data:${currentPixshopImage.mimeType};base64,${currentPixshopImage.data}`} className="max-w-full max-h-full object-contain pointer-events-none" />}
                    <input type="file" id="pixshop-uploader" onChange={e => e.target.files && handleSetImageFromFile(setPixshopImage)(e.target.files[0])} className="hidden" accept="image/*"/>
                    
                    {(activePixshopTool === 'erase' || activePixshopTool === 'magic_edit') && pixshopImageRef.current &&
                      <canvas ref={drawingCanvasRef} width={pixshopImageRef.current.clientWidth} height={pixshopImageRef.current.clientHeight} 
                              onMouseDown={handleDrawStart} onMouseMove={handleDrawMove} onMouseUp={handleDrawEnd} onMouseLeave={handleDrawEnd}
                              onTouchStart={handleDrawStart} onTouchMove={handleDrawMove} onTouchEnd={handleDrawEnd}
                              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{cursor: 'crosshair'}}/>
                    }

                    {activePixshopTool === 'crop' && cropRect && <div className="absolute border-2 border-dashed border-white bg-black/30 pointer-events-none" 
                        style={{ left: `${cropRect.x*100}%`, top: `${cropRect.y*100}%`, width: `${cropRect.width*100}%`, height: `${cropRect.height*100}%` }}></div>}
                    
                    {isLoading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><ArrowPathIcon className="w-12 h-12 text-white animate-spin"/></div>}
                </div>
            </div>
          )}
      </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col sm:flex-row p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={e => e.stopPropagation()}>
                {renderToolPanel()}
                {renderCanvasAndOutput()}
            </div>
            <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; } .label-style { display: block; font-size: 0.875rem; font-weight: 500; } .tool-btn { padding: 0.5rem; background-color: #f1f5f9; color: #334155; border-radius: 0.375rem; font-weight: 600; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; } .tool-btn:hover:not(:disabled) { background-color: #e2e8f0; } .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; } .dark .tool-btn { background-color: #334155; color: #e2e8f0; } .dark .tool-btn:hover:not(:disabled) { background-color: #475569; }`}</style>
        </div>
    );
};
