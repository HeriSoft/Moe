import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CloseIcon, ImageIcon, EditIcon, FaceSwapIcon, VideoIcon, SparklesIcon, PhotoIcon, DownloadIcon, ArrowPathIcon, TrashIcon, PlusIcon, FaceSmileIcon, FaceFrownIcon, FaceSadTearIcon, FaceLaughIcon, FacePoutingIcon, FaceAngryIcon, FaceGrinStarsIcon, GoogleDriveIcon, ArrowUpTrayIcon, CropIcon, PaintBrushIcon, AdjustmentsVerticalIcon, CheckIcon, EraserIcon, TypeIcon } from './icons';
import { generateImage, editImage, swapFace } from '../services/geminiService';
import type { Attachment, UserProfile } from '../types';
import * as googleDriveService from '../services/googleDriveService';

// Interfaces from the old ImageSettingsModal
export interface ImageGenerationSettings {
    model: 'imagen-4.0-generate-001' | 'dall-e-3';
    aspectRatio: string;
    numImages: number;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
}

export interface ImageEditingSettings {
    model: 'gemini-2.5-flash-image';
    aspectRatio?: 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    outputSize?: { width: number; height: number };
}

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; disabled?: boolean; }> = ({ label, value, min, max, step, onChange, disabled }) => (
  <div>
    <label className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
      <span>{label}</span>
      <span>{value > 0 ? '+' : ''}{value}</span>
    </label>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50" disabled={disabled} />
  </div>
);


const ImageUploader: React.FC<{ 
  image: Attachment | null; 
  onImageSet: (file: File) => void; 
  title: string; 
  textSize?: string; 
  objectFit?: 'cover' | 'contain' 
}> = ({ image, onImageSet, title, textSize = 'text-sm', objectFit = 'contain' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSet(e.target.files[0]);
    }
  };
  return (
    <div className="flex flex-col items-center w-full h-full">
        <h4 className={`font-semibold mb-2 text-slate-600 dark:text-slate-300 text-center ${textSize}`}>{title}</h4>
        <input type="file" ref={inputRef} onChange={handleFileChange} className="hidden" accept="image/png, image/jpeg, image/webp"/>
        <button 
            onClick={() => inputRef.current?.click()} 
            className="w-full flex-grow aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-indigo-500 hover:text-indigo-500 transition-colors p-2 overflow-hidden"
        >
            {image 
              ? <img 
                  src={`data:${image.mimeType};base64,${image.data}`} 
                  alt="preview" 
                  className={`w-full h-full object-${objectFit} rounded-md`} 
                /> 
              : <PhotoIcon className="w-10 h-10" />}
        </button>
    </div>
  );
};

type CreativeMode = 'image' | 'edit' | 'faceSwap' | 'video' | 'pixshop';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  onProFeatureBlock: () => void;
  handleExpGain: (amount: number) => void;
}

const POSES = [
    { label: "Frontal", prompt: "full frontal view, hands on hips" },
    { label: "Side", prompt: "side profile view" },
    { label: "Walking", prompt: "walking towards camera" },
    { label: "3/4 View", prompt: "slightly turned, 3/4 view" },
    { label: "Jumping", prompt: "jumping in the air, mid-action shot" },
    { label: "Leaning", prompt: "leaning against a wall" },
    { label: "Random", prompt: "a random dynamic pose" },
];

const EXPRESSIONS = [
    { label: 'Smile', prompt: 'a gentle, happy smile', Icon: FaceSmileIcon },
    { label: 'Sad', prompt: 'a sad, melancholic expression', Icon: FaceFrownIcon },
    { label: 'Cry', prompt: 'crying, with tears', Icon: FaceSadTearIcon },
    { label: 'Cute', prompt: 'a cute expression, looking slightly to the side with a gentle smile', Icon: FaceGrinStarsIcon },
    { label: 'Laugh', prompt: 'laughing out loud, a big smile', Icon: FaceLaughIcon },
    { label: 'Pout', prompt: 'pouting lips, looking cute', Icon: FacePoutingIcon },
    { label: 'Angry', prompt: 'an angry, furious expression', Icon: FaceAngryIcon },
];

type CropRect = { x: number; y: number; width: number; height: number; } | null;

interface ToolPromptState {
    show: boolean;
    toolName: string;
    title: string;
    onConfirm: (prompt: string) => void;
}

const effectOptions = [
    { id: 'handle_sketch', label: 'Handle sketch drawing', promptPrefix: 'add a hand-drawn sketch of the following element to the background of the image, blending it naturally with the existing scenery:' },
    { id: 'color_drawing', label: 'Color drawing', promptPrefix: 'add a colorful drawing of the following element to the background of the image, matching the overall art style:' },
    { id: 'gravity_drawing', label: 'Gravity drawing', promptPrefix: 'add the following element to the background of the image, making it appear as if it is affected by the scene\'s surreal gravity:' },
    { id: 'style_fonts', label: 'Style Fonts Effect', promptPrefix: 'add stylized text to the image. The user wants this text and effect:' }
];


export const GenerationModal: React.FC<GenerationModalProps> = ({ isOpen, onClose, userProfile, setNotifications, onProFeatureBlock, handleExpGain }) => {
    const [activeMode, setActiveMode] = useState<CreativeMode>('image');
    const [prompt, setPrompt] = useState('');
    const [inputImage1, setInputImage1] = useState<Attachment | null>(null);
    const [inputImage2, setInputImage2] = useState<Attachment | null>(null);
    const [output, setOutput] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [genSettings, setGenSettings] = useState<ImageGenerationSettings>({ model: 'imagen-4.0-generate-001', aspectRatio: '1:1', numImages: 1, quality: 'standard', style: 'vivid' });
    const [editSettings, setEditSettings] = useState<ImageEditingSettings>({ model: 'gemini-2.5-flash-image', aspectRatio: 'auto' });
    const [inputImageDimensions, setInputImageDimensions] = useState<{ width: number; height: number } | null>(null);

    // Advanced Editing State
    const [isAdvancedStyle, setIsAdvancedStyle] = useState(false);
    const [userOutfits, setUserOutfits] = useState<Attachment[]>([]);
    const [selectedOutfits, setSelectedOutfits] = useState<string[]>([]);
    const [isMixOutfit, setIsMixOutfit] = useState(false);
    const [customPosePrompt, setCustomPosePrompt] = useState('');
    const [isCustomPose, setIsCustomPose] = useState(false);
    const [backgroundPrompt, setBackgroundPrompt] = useState('');
    const [selectedPose, setSelectedPose] = useState<string | null>(null);
    const [selectedExpression, setSelectedExpression] = useState<string | null>(null);
    
    // --- Studio Pixshop State ---
    const [pixshopImage, setPixshopImage] = useState<Attachment | null>(null);
    const [pixshopOutput, setPixshopOutput] = useState<Attachment | null>(null);
    const [pixshopAdjustments, setPixshopAdjustments] = useState({ vibrance: 0, warmth: 0, contrast: 0, isBW: false });
    const [pixshopMode, setPixshopMode] = useState<'idle' | 'crop' | 'draw' | 'mask' | 'text'>('idle');
    const [cropStartPoint, setCropStartPoint] = useState<{x: number, y: number} | null>(null);
    const [cropRect, setCropRect] = useState<CropRect>(null);
    const pixshopContainerRef = useRef<HTMLDivElement>(null);
    const pixshopImageRef = useRef<HTMLImageElement>(null);
    const [toolPrompt, setToolPrompt] = useState<ToolPromptState | null>(null);
    const [selectedEffect, setSelectedEffect] = useState<string>('handle_sketch');

    // Canvas tools state
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushColor, setBrushColor] = useState('#FFFFFF');
    const [brushSize, setBrushSize] = useState(5);
    // FIX: Add missing state for the masking tool's brush size.
    const [maskBrushSize, setMaskBrushSize] = useState(20);
    const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const lastPointRef = useRef<{x: number, y: number} | null>(null);

    // Text tool state
    const [textToolState, setTextToolState] = useState({
        text: 'Your Text Here',
        stylePrompt: '',
        x: 50, // percentage
        y: 50, // percentage
    });
    const textRef = useRef<HTMLDivElement>(null);
    const [isDraggingText, setIsDraggingText] = useState(false);
    const textDragStartOffset = useRef({ x: 0, y: 0 });


    const handleSetImage = (
        setter: React.Dispatch<React.SetStateAction<Attachment | null>>,
        options?: { captureDimensionsForEdit?: boolean }
    ) => (file: File) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) {
                setNotifications(p => ["File could not be read.", ...p.slice(0, 19)]);
                return;
            }
            
            const dataUrl = event.target.result as string;
    
            if (options?.captureDimensionsForEdit) {
                const img = new Image();
                img.onload = () => {
                    setInputImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                    const base64String = dataUrl.split(',')[1];
                    setter({ data: base64String, mimeType: file.type, fileName: file.name });
                };
                img.onerror = () => {
                    setNotifications(p => ["Could not read image dimensions.", ...p.slice(0, 19)]);
                };
                img.src = dataUrl;
            } else {
                // For other modes like faceSwap, just set the image
                const base64String = dataUrl.split(',')[1];
                setter({ data: base64String, mimeType: file.type, fileName: file.name });
            }
        };
        reader.onerror = () => {
            setNotifications(p => ["Failed to process image.", ...p.slice(0, 19)]);
        };
        reader.readAsDataURL(file);
    };

    const getOriginalOutputSettings = useCallback((): ImageEditingSettings => {
        if (inputImageDimensions) {
            let { width, height } = inputImageDimensions;
            // Cap the max dimension at 1024 while preserving aspect ratio
            if (width > 1024 || height > 1024) {
                const scale = 1024 / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            return { ...editSettings, outputSize: { width, height } };
        }
        // If dimensions aren't available for some reason, don't specify outputSize
        return { ...editSettings };
    }, [inputImageDimensions, editSettings]);

    useEffect(() => {
        if (!userProfile) return;
        try {
            const savedOutfits = localStorage.getItem(`moe-chat-outfits-${userProfile.email}`);
            if (savedOutfits) {
                setUserOutfits(JSON.parse(savedOutfits));
            }
        } catch (e) { console.error("Failed to load outfits from localStorage", e); }
    }, [userProfile]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setPrompt(''); setInputImage1(null); setInputImage2(null); setOutput([]);
            setIsLoading(false); setError(null); setActiveMode('image');
            setIsAdvancedStyle(false); setSelectedOutfits([]); setIsMixOutfit(false);
            setSelectedPose(null); setSelectedExpression(null); setBackgroundPrompt(''); setCustomPosePrompt(''); setIsCustomPose(false);
            setPixshopImage(null); setPixshopOutput(null); setPixshopAdjustments({ vibrance: 0, warmth: 0, contrast: 0, isBW: false });
            setPixshopMode('idle'); setCropRect(null); setCropStartPoint(null);
            setToolPrompt(null);
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);
    
    useEffect(() => {
      setInputImage1(null); setInputImage2(null); setOutput([]); setError(null);
      setIsAdvancedStyle(false); setPixshopImage(null); setPixshopOutput(null);
      setPixshopMode('idle'); setCropRect(null); setCropStartPoint(null);
      setToolPrompt(null);
    }, [activeMode]);
    
    const isAnyStyleSelected = useMemo(() => !!(selectedPose || (isCustomPose && customPosePrompt) || selectedExpression || selectedOutfits.length > 0 || backgroundPrompt), [selectedPose, isCustomPose, customPosePrompt, selectedExpression, selectedOutfits, backgroundPrompt]);

    const handleGenericApiCall = async (apiCall: () => Promise<Attachment[]>) => {
        setIsLoading(true);
        setError(null);
        setOutput([]);
        setPixshopOutput(null);
        try {
            const result = await apiCall();
            handleExpGain(50);
            if (activeMode === 'pixshop') {
                setPixshopOutput(result[0] || null);
            } else {
                setOutput(result);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage.includes('This is a Pro feature')) {
                onProFeatureBlock();
                onClose();
            } else { setError(errorMessage); }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerate = () => {
        if (!prompt) { setError("A prompt is required."); return; }
        handleGenericApiCall(() => generateImage(prompt, genSettings, userProfile));
    };

    const handleEdit = () => {
        if (!prompt) { setError("A prompt is required."); return; }
        if (!inputImage1) { setError("An image is required."); return; }
        handleGenericApiCall(async () => {
            const finalEditSettings = getOriginalOutputSettings();
            const { attachments } = await editImage(prompt, [inputImage1], finalEditSettings, userProfile);
            return attachments;
        });
    };

    const handleSwap = () => {
        if (!inputImage1 || !inputImage2) { setError("Target image and source face are required."); return; }
        handleGenericApiCall(async () => [await swapFace(inputImage1, inputImage2, userProfile)]);
    };

    const handleApplyAdvancedStyles = () => {
        if (!inputImage1) { setError("Please upload an image to edit first."); return; }
        const promptParts: string[] = [];
        const additionalImages: Attachment[] = [];
        if (selectedPose) promptParts.push(`Change the person's pose to: ${selectedPose}.`);
        else if (isCustomPose && customPosePrompt) promptParts.push(`Change the person's pose to: ${customPosePrompt}.`);
        if (selectedExpression) promptParts.push(`Change the person's facial expression to: ${selectedExpression}.`);
        const outfitsToApply = userOutfits.filter(o => selectedOutfits.includes(o.fileName));
        if (outfitsToApply.length > 0) {
            if (isMixOutfit && outfitsToApply.length > 1) promptParts.push("Change the person's outfit by mixing the styles from these images.");
            else promptParts.push("Change the person's outfit to match this image.");
            additionalImages.push(...outfitsToApply);
        }
        if (backgroundPrompt) promptParts.push(`Change the background to: ${backgroundPrompt}.`);
        if (promptParts.length === 0) { setError("Please select at least one style to apply."); return; }
        
        let constructedPrompt = promptParts.join(' ');
        // Add the negative prompt as requested by the user to prevent cropping.
        constructedPrompt += " Important: Do not crop the image, do not cut off feet, do not cut the image, keep full body visible. (Quan trọng: Không được crop ảnh, mất chân, cắt ảnh).";
        
        handleGenericApiCall(async () => {
             const finalEditSettings = getOriginalOutputSettings();
             const { attachments } = await editImage(constructedPrompt, [inputImage1, ...additionalImages], finalEditSettings, userProfile);
             setSelectedPose(null); setSelectedExpression(null); setSelectedOutfits([]);
             setBackgroundPrompt(''); setCustomPosePrompt(''); setIsCustomPose(false);
             return attachments;
        });
    };
    
    const handlePixshopEdit = (editPrompt: string, additionalImages: Attachment[] = []) => {
        if (!pixshopImage) { setError("Please upload an image to edit first."); return; }
        const imagesToSend = [pixshopImage, ...additionalImages];
        handleGenericApiCall(async () => {
            const { attachments } = await editImage(editPrompt, imagesToSend, editSettings, userProfile);
            return attachments;
        });
    };
    
    const handlePixshopAdjustments = () => {
        const { vibrance, warmth, contrast, isBW } = pixshopAdjustments;
        const parts: string[] = [];
        if (isBW) parts.push("convert the image to black and white");
        if (vibrance !== 0) parts.push(`${vibrance > 0 ? 'increase' : 'decrease'} vibrance by ${Math.abs(vibrance)} steps`);
        if (warmth !== 0) parts.push(`make the image ${warmth > 0 ? 'warmer' : 'cooler'} by ${Math.abs(warmth)} steps`);
        if (contrast !== 0) parts.push(`${contrast > 0 ? 'increase' : 'decrease'} contrast by ${Math.abs(contrast)} steps`);
        
        if (parts.length > 0) {
            handlePixshopEdit("Apply the following adjustments: " + parts.join(', '));
        }
    };

    const handleApplyCrop = () => {
        if (!cropRect || !pixshopImage || !pixshopImageRef.current) return;
        const image = new Image();
        image.src = `data:${pixshopImage.mimeType};base64,${pixshopImage.data}`;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const nativeWidth = image.naturalWidth;
            const nativeHeight = image.naturalHeight;
            const sx = cropRect.x * nativeWidth;
            const sy = cropRect.y * nativeHeight;
            const sWidth = cropRect.width * nativeWidth;
            const sHeight = cropRect.height * nativeHeight;
            canvas.width = sWidth;
            canvas.height = sHeight;
            ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
            const dataUrl = canvas.toDataURL(pixshopImage.mimeType);
            const base64 = dataUrl.split(',')[1];
            const newAttachment = { ...pixshopImage, data: base64 };
            setPixshopImage(newAttachment);
            setPixshopOutput(newAttachment);
            setPixshopMode('idle');
            setCropRect(null);
        };
    };

    const handleCropPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
        if (pixshopMode !== 'crop' || !pixshopContainerRef.current) return;
        const rect = pixshopContainerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        setCropStartPoint({ x, y });
        setCropRect({ x, y, width: 0, height: 0 });
    };

    const handleCropPointerMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (pixshopMode !== 'crop' || !cropStartPoint || !pixshopContainerRef.current) return;
        e.preventDefault();
        const rect = pixshopContainerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
        const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
        const currentX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const currentY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        setCropRect({
            x: Math.min(cropStartPoint.x, currentX),
            y: Math.min(cropStartPoint.y, currentY),
            width: Math.abs(currentX - cropStartPoint.x),
            height: Math.abs(currentY - cropStartPoint.y),
        });
    }, [pixshopMode, cropStartPoint]);

    const handleCropPointerUp = useCallback(() => { setCropStartPoint(null); }, []);

    useEffect(() => {
        if (pixshopMode === 'crop' && cropStartPoint) {
            window.addEventListener('mousemove', handleCropPointerMove);
            window.addEventListener('touchmove', handleCropPointerMove);
            window.addEventListener('mouseup', handleCropPointerUp);
            window.addEventListener('touchend', handleCropPointerUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleCropPointerMove);
            window.removeEventListener('touchmove', handleCropPointerMove);
            window.removeEventListener('mouseup', handleCropPointerUp);
            window.removeEventListener('touchend', handleCropPointerUp);
        };
    }, [pixshopMode, cropStartPoint, handleCropPointerMove, handleCropPointerUp]);
    
    // --- Canvas Drawing Logic (reused for Draw & Mask) ---
    const clearCanvas = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas) {
            const context = canvas.getContext('2d');
            context?.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent, canvasRef: React.RefObject<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const handleCanvasDrawStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (pixshopMode !== 'draw' && pixshopMode !== 'mask') return;
        const currentCanvasRef = pixshopMode === 'draw' ? drawingCanvasRef : maskCanvasRef;
        const pos = getCanvasCoordinates(e, currentCanvasRef);
        if (pos) { setIsDrawing(true); lastPointRef.current = pos; }
    };

    const handleCanvasDrawMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || (pixshopMode !== 'draw' && pixshopMode !== 'mask')) return;
        e.preventDefault();
        const currentCanvasRef = pixshopMode === 'draw' ? drawingCanvasRef : maskCanvasRef;
        const pos = getCanvasCoordinates(e, currentCanvasRef);
        const canvas = currentCanvasRef.current;
        if (pos && canvas && lastPointRef.current) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (pixshopMode === 'draw') {
                    ctx.strokeStyle = brushColor; ctx.lineWidth = brushSize;
                } else { // Masking
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.lineWidth = maskBrushSize;
                }
                ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
                ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
                ctx.lineTo(pos.x, pos.y); ctx.stroke();
                if (pixshopMode === 'mask') { // Fill for better visibility
                    ctx.beginPath();
                    ctx.arc(lastPointRef.current.x, lastPointRef.current.y, maskBrushSize / 2, 0, 2 * Math.PI);
                    ctx.arc(pos.x, pos.y, maskBrushSize / 2, 0, 2 * Math.PI);
                    ctx.fill();
                }
                lastPointRef.current = pos;
            }
        }
    };
    
    const handleCanvasDrawEnd = () => { if(isDrawing) setIsDrawing(false); };

    useEffect(() => {
        const currentCanvasRef = pixshopMode === 'draw' ? drawingCanvasRef : maskCanvasRef;
        const canvas = currentCanvasRef.current; const image = pixshopImageRef.current;
        const container = pixshopContainerRef.current;
        if ((pixshopMode === 'draw' || pixshopMode === 'mask') && canvas && image && container) {
            const setCanvasSize = () => {
                if (image.naturalWidth === 0 || !image.complete) return;
                const { naturalWidth, naturalHeight } = image;
                const { clientWidth: containerWidth, clientHeight: containerHeight } = container;
                const imageRatio = naturalWidth / naturalHeight;
                const containerRatio = containerWidth / containerHeight;
                let renderedWidth, renderedHeight, offsetX, offsetY;
                if (imageRatio > containerRatio) {
                    renderedWidth = containerWidth; renderedHeight = containerWidth / imageRatio;
                    offsetX = 0; offsetY = (containerHeight - renderedHeight) / 2;
                } else {
                    renderedHeight = containerHeight; renderedWidth = containerHeight * imageRatio;
                    offsetY = 0; offsetX = (containerWidth - renderedWidth) / 2;
                }
                canvas.style.position = 'absolute'; canvas.style.left = `${offsetX}px`;
                canvas.style.top = `${offsetY}px`; canvas.style.width = `${renderedWidth}px`;
                canvas.style.height = `${renderedHeight}px`; canvas.width = renderedWidth;
                canvas.height = renderedHeight;
            };
            const resizeObserver = new ResizeObserver(setCanvasSize);
            resizeObserver.observe(container);
            if (image.complete) setCanvasSize(); else image.onload = setCanvasSize;
            return () => { resizeObserver.disconnect(); if (image) image.onload = null; };
        }
    }, [pixshopMode, pixshopImage]);


    const handleApplyHandDrawing = (promptText: string) => {
        const drawingCanvas = drawingCanvasRef.current;
        const originalImageEl = pixshopImageRef.current;
        if (!drawingCanvas || !pixshopImage || !originalImageEl) { setError("Cannot find required image elements."); return; }
        const emptyCanvas = document.createElement('canvas');
        emptyCanvas.width = drawingCanvas.width; emptyCanvas.height = drawingCanvas.height;
        if (drawingCanvas.toDataURL() === emptyCanvas.toDataURL()) {
            setNotifications(p => ["Please draw something on the image first.", ...p]);
            return;
        }
        const compositeCanvas = document.createElement('canvas');
        const compositeCtx = compositeCanvas.getContext('2d');
        if (!compositeCtx) { setError("Could not create composite canvas context."); return; }
        compositeCanvas.width = originalImageEl.naturalWidth;
        compositeCanvas.height = originalImageEl.naturalHeight;
        compositeCtx.drawImage(originalImageEl, 0, 0, originalImageEl.naturalWidth, originalImageEl.naturalHeight);
        compositeCtx.drawImage(drawingCanvas, 0, 0, originalImageEl.naturalWidth, originalImageEl.naturalHeight);
        const compositeDataUrl = compositeCanvas.toDataURL('image/png');
        const compositeBase64 = compositeDataUrl.split(',')[1];
        const compositeAttachment: Attachment = {
            ...pixshopImage, data: compositeBase64,
            fileName: 'composite_edit_input.png',
        };
        const transformationPrompt = `In the provided image, there is a prominent, non-photorealistic drawing (a sketch). Your primary task is to intelligently replace ONLY this drawn element with a photorealistic version of: "${promptText}". The new object must appear in the exact same location, have the same scale, and follow the general shape of the drawing. It is crucial to seamlessly blend the new object into the original photograph, matching lighting, shadows, and perspective. Do NOT alter any other part of the image. The drawing is your definitive guide for placement and form.`;
        handlePixshopEdit(transformationPrompt, [compositeAttachment]);
        clearCanvas(drawingCanvasRef);
        setPixshopMode('idle');
    };
    
    const handleApplyMask = (promptText: string) => {
        const maskCanvas = maskCanvasRef.current;
        if (!maskCanvas || !pixshopImage) { setError("Mask or image missing."); return; }

        // Create a true black and white mask from the drawn mask
        const bwMaskCanvas = document.createElement('canvas');
        bwMaskCanvas.width = maskCanvas.width;
        bwMaskCanvas.height = maskCanvas.height;
        const bwCtx = bwMaskCanvas.getContext('2d');
        if (!bwCtx) { setError("Could not create mask context."); return; }
        
        bwCtx.fillStyle = 'black';
        bwCtx.fillRect(0, 0, bwMaskCanvas.width, bwMaskCanvas.height);
        bwCtx.drawImage(maskCanvas, 0, 0); // Draws the red semi-transparent mask
        const imageData = bwCtx.getImageData(0, 0, bwMaskCanvas.width, bwMaskCanvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // If the pixel has any red (from our brush), make it pure white
            if (data[i] > 0) {
                data[i] = 255; // R
                data[i + 1] = 255; // G
                data[i + 2] = 255; // B
            }
        }
        bwCtx.putImageData(imageData, 0, 0);

        const maskDataUrl = bwMaskCanvas.toDataURL('image/png');
        const maskBase64 = maskDataUrl.split(',')[1];
        const maskAttachment: Attachment = {
            data: maskBase64,
            mimeType: 'image/png',
            fileName: 'mask.png'
        };

        const finalPrompt = `Use the provided black and white mask image to perform the following edit: "${promptText}". The edit should ONLY apply to the white areas of the mask. Do not alter the black areas.`;
        handlePixshopEdit(finalPrompt, [maskAttachment]);
        clearCanvas(maskCanvasRef);
        setPixshopMode('idle');
    };

    const handleApplyText = () => {
        if (!pixshopImage || !textToolState.text || !textToolState.stylePrompt) {
            setError("Image, text content, and style prompt are required."); return;
        }
        const finalPrompt = `Add the text "${textToolState.text}" to the image. The text style should be: "${textToolState.stylePrompt}". Position the text at approximately ${textToolState.x.toFixed(0)}% from the left and ${textToolState.y.toFixed(0)}% from the top.`;
        handlePixshopEdit(finalPrompt);
        setPixshopMode('idle');
    };

    // --- Drag handlers for text tool ---
    const handleTextDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (!textRef.current || !pixshopContainerRef.current) return;
        setIsDraggingText(true);
        const textRect = textRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        // Calculate click offset from the center of the text element
        const textCenterX = textRect.left + textRect.width / 2;
        const textCenterY = textRect.top + textRect.height / 2;

        textDragStartOffset.current = {
            x: clientX - textCenterX,
            y: clientY - textCenterY,
        };
    };

    const handleTextDragMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!isDraggingText || !pixshopContainerRef.current) return;
        e.preventDefault();
        const containerRect = pixshopContainerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        // Calculate the new center position in pixels, relative to the container
        const newCenterX_relative_px = clientX - containerRect.left - textDragStartOffset.current.x;
        const newCenterY_relative_px = clientY - containerRect.top - textDragStartOffset.current.y;
        
        // Convert to percentage
        const xPercent = Math.max(0, Math.min(100, (newCenterX_relative_px / containerRect.width) * 100));
        const yPercent = Math.max(0, Math.min(100, (newCenterY_relative_px / containerRect.height) * 100));

        setTextToolState(s => ({ ...s, x: xPercent, y: yPercent }));

    }, [isDraggingText]);
    
    const handleTextDragEnd = useCallback(() => setIsDraggingText(false), []);

    useEffect(() => {
        if (isDraggingText) {
            window.addEventListener('mousemove', handleTextDragMove);
            window.addEventListener('touchmove', handleTextDragMove, { passive: false });
            window.addEventListener('mouseup', handleTextDragEnd);
            window.addEventListener('touchend', handleTextDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleTextDragMove);
            window.removeEventListener('touchmove', handleTextDragMove);
            window.removeEventListener('mouseup', handleTextDragEnd);
            window.removeEventListener('touchend', handleTextDragEnd);
        };
    }, [isDraggingText, handleTextDragMove, handleTextDragEnd]);


    const handleBeautifulEffectClick = () => {
        setToolPrompt({
            show: true, toolName: 'Beautiful Effect', title: 'Add Creative Elements to Background',
            onConfirm: (promptText) => {
                const selectedEffectData = effectOptions.find(e => e.id === selectedEffect);
                if (selectedEffectData) {
                    const finalPrompt = selectedEffectData.promptPrefix + " " + promptText;
                    handlePixshopEdit(finalPrompt);
                }
            }
        });
    };

    const saveOutfits = (newOutfits: Attachment[]) => {
        if (!userProfile) return;
        setUserOutfits(newOutfits);
        localStorage.setItem(`moe-chat-outfits-${userProfile.email}`, JSON.stringify(newOutfits));
    };

    const handleAddOutfit = (file: File) => {
        if (userOutfits.length >= 6) { setNotifications(p => ["Maximum of 6 outfits saved.", ...p]); return; }
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            const newOutfit = { data: base64String, mimeType: file.type, fileName: `${Date.now()}_${file.name}` };
            saveOutfits([...userOutfits, newOutfit]);
        };
        reader.readAsDataURL(file);
    };

    const handleAddOutfitFromDrive = () => {
        if (userOutfits.length >= 6) { setNotifications(p => ["Maximum of 6 outfits saved.", ...p]); return; }
        googleDriveService.showPicker(async (files) => {
            if (files && files.length > 0) {
                try {
                    const base64Data = await googleDriveService.downloadDriveFile(files[0].id);
                    const newOutfit = { data: base64Data, mimeType: files[0].mimeType, fileName: `${Date.now()}_${files[0].name}` };
                    saveOutfits([...userOutfits, newOutfit]);
                } catch (e) { setNotifications(p => ["Failed to download from Drive.", ...p]); }
            }
        });
    };
    
    const handleOutfitClick = (outfit: Attachment) => {
        if (isMixOutfit) {
            setSelectedOutfits(prev => prev.includes(outfit.fileName) ? prev.filter(name => name !== outfit.fileName) : (prev.length < 3 ? [...prev, outfit.fileName] : prev));
        } else {
            setSelectedOutfits(prev => (prev.includes(outfit.fileName) ? [] : [outfit.fileName]));
        }
    };

    const handlePoseClick = (posePrompt: string) => setSelectedPose(prev => (prev === posePrompt ? null : posePrompt));
    const handleExpressionClick = (expressionPrompt: string) => setSelectedExpression(prev => (prev === expressionPrompt ? null : expressionPrompt));
    
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
    const canGenerate = (activeMode === 'image' && !!prompt) || (activeMode === 'faceSwap' && !!inputImage1 && !!inputImage2) || (activeMode === 'edit' && !!inputImage1 && !isAdvancedStyle && !!prompt);
    
    const pixshopColorFilters = [
        { name: 'Vintage', prompt: 'apply a warm, vintage color filter with slightly faded colors' }, { name: 'B&W', prompt: 'convert to a high-contrast black and white image' },
        { name: 'Cinematic', prompt: 'apply a cool, cinematic blue and teal color grade' }, { name: 'Vibrant', prompt: 'enhance the colors to be more vibrant and saturated' },
    ];
    
    const pixshopArtStyles = [
        { name: 'Anime', prompt: 'transform this photo into a detailed anime style illustration' }, { name: 'Van Gogh', prompt: 'repaint this photo in the expressive, impasto style of Vincent van Gogh' },
        { name: 'Sketch', prompt: 'convert this photo into a detailed pencil sketch' }, { name: '3D Render', prompt: 'recreate this image in a cute, vibrant 3D cartoon style, like a Pixar movie render' },
    ];


    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center" onClick={onClose} role="dialog">
            <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col sm:flex-row p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={e => e.stopPropagation()}>
                {/* Left Column: Settings */}
                <div className="w-full sm:w-[40%] md:w-1/3 sm:pr-6 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 pb-4 sm:pb-0 mb-4 sm:mb-0 flex-shrink-0 sm:overflow-y-auto pr-2 -mr-2">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold flex items-center gap-2"><SparklesIcon className="w-7 h-7"/> Creative Tools</h2>
                        <button onClick={onClose} className="sm:hidden text-slate-500"><CloseIcon className="w-7 h-7" /></button>
                    </div>
                    <div className="mb-4">
                        <label className="label-style mb-1">Tool</label>
                        <div className="grid grid-cols-1 gap-2 text-sm font-semibold">
                            {[
                                { id: 'image', label: 'Image Generation', icon: ImageIcon }, { id: 'edit', label: 'Advanced Editing', icon: EditIcon },
                                { id: 'faceSwap', label: 'Face Swap', icon: FaceSwapIcon }, { id: 'pixshop', label: 'Studio Pixshop', icon: CropIcon },
                            ].map(tool => (
                                <button key={tool.id} onClick={() => setActiveMode(tool.id as CreativeMode)}
                                    className={`p-3 rounded-lg flex items-center justify-start gap-4 transition-colors text-base
                                        ${activeMode === tool.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-[#2d2d40] hover:bg-slate-200 dark:hover:bg-slate-800'}
                                        ${activeMode !== tool.id ? 'text-slate-800 dark:text-slate-200' : ''}
                                    `}>
                                    <tool.icon className="w-6 h-6"/> <span>{tool.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="hidden sm:block bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                        <h3 className="font-semibold text-lg">Model Settings</h3>
                        {activeMode === 'image' && (<>
                            <div>
                                <label className="label-style mb-1">Model</label>
                                <select value={genSettings.model} onChange={(e) => setGenSettings(s => ({ ...s, model: e.target.value as ImageGenerationSettings['model'] }))} className="w-full input-style text-slate-900 dark:text-slate-100">
                                    <option value="imagen-4.0-generate-001">Imagen 4 (Google)</option>
                                    <option value="dall-e-3">DALL·E 3 (OpenAI)</option>
                                </select>
                            </div>
                            <Slider label="Number of Images" value={genSettings.numImages} min={1} max={4} step={1} onChange={v => setGenSettings(s => ({ ...s, numImages: v }))} />
                            <div>
                                <label className="label-style mb-1">Aspect Ratio</label>
                                <select value={genSettings.aspectRatio} onChange={e => setGenSettings(s => ({ ...s, aspectRatio: e.target.value }))} className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 dark:text-slate-100">
                                    {availableRatios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
                                </select>
                            </div>
                            {isDalle && ( <>
                                <div>
                                    <label className="label-style mb-1">Quality</label>
                                    <select value={genSettings.quality} onChange={e => setGenSettings(s => ({ ...s, quality: e.target.value as 'standard' | 'hd' }))} className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 dark:text-slate-100">
                                        <option value="standard">Standard</option>
                                        <option value="hd">HD</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label-style mb-1">Style</label>
                                    <select value={genSettings.style} onChange={e => setGenSettings(s => ({ ...s, style: e.target.value as 'vivid' | 'natural' }))} className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 dark:text-slate-100">
                                        <option value="vivid">Vivid</option>
                                        <option value="natural">Natural</option>
                                    </select>
                                </div>
                            </>)}
                        </>)}
                        {(activeMode === 'edit' || activeMode === 'pixshop') && (<>
                            <div>
                                <label className="label-style mb-1">Model</label>
                                <select value={editSettings.model} onChange={(e) => setEditSettings(s => ({ ...s, model: e.target.value as ImageEditingSettings['model'] }))} className="w-full input-style text-slate-900 dark:text-slate-100">
                                    <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                                </select>
                            </div>
                            <div>
                                <label className="label-style mb-1">Aspect Ratio</label>
                                <select 
                                    value={editSettings.aspectRatio || 'auto'} 
                                    onChange={e => setEditSettings(s => ({ ...s, aspectRatio: e.target.value as ImageEditingSettings['aspectRatio'] }))} 
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                                >
                                    <option value="auto">Auto (Original)</option>
                                    <option value="1:1">1:1 (Square)</option>
                                    <option value="16:9">16:9 (Widescreen)</option>
                                    <option value="9:16">9:16 (Portrait)</option>
                                    <option value="4:3">4:3 (Standard)</option>
                                    <option value="3:4">3:4 (Vertical)</option>
                                </select>
                            </div>
                        </>)}
                        {activeMode === 'faceSwap' && (
                            <div>
                                <h3 className="font-semibold text-lg">Face Swap Info</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Upload a target image and an image with the source face. The model will swap the face from the source onto the target.</p>
                            </div>
                        )}
                    </div>
                </div>


                {/* Right Column: Main Content */}
                <div className="w-full sm:w-[60%] md:w-2/3 sm:pl-6 flex flex-col flex-grow min-h-0 overflow-hidden">
                    {activeMode !== 'pixshop' ? (
                        <div className="flex flex-col h-full">
                            <div className="flex-grow overflow-y-auto pr-2 -mr-2 min-h-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 items-start">
                                    {/* Input Column */}
                                    <div className="flex flex-col gap-4 min-h-0">
                                        <h3 className="text-lg font-semibold flex-shrink-0">{activeMode === 'edit' ? 'Image to Edit' : 'Input'}</h3>
                                        {activeMode === 'image' && <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your prompt here..." className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style text-slate-900 dark:text-slate-100"/>}
                                        {activeMode === 'edit' && (
                                            <div className="aspect-square w-full">
                                                <ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1, { captureDimensionsForEdit: true })} title="" textSize="text-sm" objectFit="contain" />
                                            </div>
                                        )}
                                        {activeMode === 'faceSwap' && (
                                            <div className="w-full grid grid-cols-2 gap-4">
                                                <div className="aspect-square">
                                                    <ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="Target Image" objectFit="cover"/>
                                                </div>
                                                <div className="aspect-square">
                                                    <ImageUploader image={inputImage2} onImageSet={handleSetImage(setInputImage2)} title="Source Face" objectFit="cover"/>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Output Column */}
                                    <div className="flex flex-col gap-4 min-h-0">
                                        <h3 className="text-lg font-semibold flex-shrink-0">Output</h3>
                                        <div className="w-full aspect-square bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center p-2">
                                            {isLoading && <ArrowPathIcon className="w-10 h-10 text-slate-400 animate-spin" />}
                                            {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                                            {!isLoading && !error && output.length > 0 && (
                                                <div className={`grid gap-2 w-full h-full ${output.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                    {output.map((item, index) => (
                                                        <div key={index} className="relative group w-full h-full">
                                                            <img src={`data:${item.mimeType};base64,${item.data}`} alt="Generated media" className="rounded-lg w-full h-full object-contain"/>
                                                            <button onClick={() => handleDownload(item)} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><DownloadIcon className="w-5 h-5"/></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {!isLoading && !error && output.length === 0 && <p className="text-slate-500 dark:text-slate-400">Your results will appear here</p>}
                                        </div>
                                    </div>
                                </div>
                                {activeMode === 'edit' && (
                                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-4"><label htmlFor="adv-toggle" className="font-semibold text-slate-600 dark:text-slate-300">Advanced Style</label><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="adv-toggle" checked={isAdvancedStyle} onChange={e => setIsAdvancedStyle(e.target.checked)} className="sr-only peer"/><div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div></label></div>
                                        {!isAdvancedStyle && <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your editing prompt (e.g., 'add a hat')..." className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style text-slate-900 dark:text-slate-100"/>}
                                        {isAdvancedStyle && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                                                <div className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <h4 className="text-sm font-semibold mb-2">Pose</h4>
                                                            {isCustomPose ? <input type="text" value={customPosePrompt} onChange={e => setCustomPosePrompt(e.target.value)} placeholder="e.g., dancing in the rain" className="input-style w-full"/> : <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 text-xs">{POSES.map(p => <button key={p.label} onClick={() => handlePoseClick(p.prompt)} className={`p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 ${selectedPose === p.prompt ? 'ring-2 ring-indigo-500' : ''}`}>{p.label}</button>)}</div>}
                                                            <div className="flex items-center gap-2 mt-2 text-xs"><input type="checkbox" id="custom-pose" checked={isCustomPose} onChange={e => setIsCustomPose(e.target.checked)}/><label htmlFor="custom-pose">Custom Pose</label></div>
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-semibold">Outfit</h4><div className="flex items-center gap-2 text-xs"><input type="checkbox" id="mix-outfit" checked={isMixOutfit} onChange={e => setIsMixOutfit(e.target.checked)}/><label htmlFor="mix-outfit">Mix (Max 3)</label></div></div>
                                                            <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => userOutfits[i] ? <button key={userOutfits[i].fileName} onClick={() => handleOutfitClick(userOutfits[i])} className={`relative rounded-md overflow-hidden aspect-square ${selectedOutfits.includes(userOutfits[i].fileName) ? 'ring-2 ring-indigo-500' : ''}`}><img src={`data:${userOutfits[i].mimeType};base64,${userOutfits[i].data}`} className="w-full h-full object-cover"/><button onClick={(e) => { e.stopPropagation(); saveOutfits(userOutfits.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 p-0.5 bg-black/50 text-white rounded-full"><TrashIcon className="w-3 h-3"/></button></button> : <div key={i} className="flex flex-col gap-1 items-center justify-center p-1 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-600 aspect-square"><button onClick={handleAddOutfitFromDrive} className="p-1 rounded-full bg-slate-200 dark:bg-slate-700"><GoogleDriveIcon className="w-3 h-3"/></button><input type="file" id={`outfit-upload-${i}`} onChange={e => e.target.files && handleAddOutfit(e.target.files[0])} className="hidden"/><label htmlFor={`outfit-upload-${i}`} className="p-1 rounded-full bg-slate-200 dark:bg-slate-700 cursor-pointer"><ArrowUpTrayIcon className="w-3 h-3"/></label></div>)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    <div><h4 className="text-sm font-semibold mb-2">Expression</h4><div className="grid grid-cols-4 xl:grid-cols-7 gap-2">{EXPRESSIONS.map(e => <button key={e.label} onClick={() => handleExpressionClick(e.prompt)} title={e.label} className={`p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex justify-center items-center ${selectedExpression === e.prompt ? 'ring-2 ring-indigo-500' : ''}`}><e.Icon className="w-5 h-5"/></button>)}</div></div>
                                                    <div><h4 className="text-sm font-semibold mb-2">Background</h4><input type="text" value={backgroundPrompt} onChange={e => setBackgroundPrompt(e.target.value)} placeholder="e.g., a futuristic city" className="input-style flex-grow text-slate-900 dark:text-slate-100"/></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex-shrink-0 pt-4 mt-auto border-t border-slate-200 dark:border-slate-700">
                                {activeMode === 'edit' && isAdvancedStyle ? (
                                    <button onClick={handleApplyAdvancedStyles} disabled={!isAnyStyleSelected || isLoading || !inputImage1} className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors">{isLoading ? 'Applying...' : 'Apply Advanced Styles'}</button>
                                ) : (
                                    <button onClick={activeMode === 'image' ? handleGenerate : activeMode === 'edit' ? handleEdit : handleSwap} disabled={!canGenerate || isLoading} className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors">{isLoading ? 'Generating...' : 'Generate'}</button>
                                )}
                            </div>
                        </div>
                    ) : (
                       <div className="flex flex-col h-full overflow-hidden">
                           {/* Pixshop: Top Row for Images */}
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-grow min-h-0">
                               <div className="flex flex-col gap-2 min-h-0">
                                   <h3 className="text-lg font-semibold text-center flex-shrink-0">Canvas</h3>
                                   <div ref={pixshopContainerRef} onMouseDown={handleCropPointerDown} onTouchStart={handleCropPointerDown} className={`relative w-full flex-grow min-h-0 bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center ${pixshopMode === 'crop' ? 'cursor-crosshair' : ''}`}>
                                        <div className="relative w-full h-full flex items-center justify-center">
                                            {!pixshopImage ? <button onClick={() => document.getElementById('pixshop-uploader')?.click()} className="flex flex-col items-center gap-2 text-slate-500"><ArrowUpTrayIcon className="w-10 h-10"/></button> : <img ref={pixshopImageRef} src={`data:${pixshopImage.mimeType};base64,${pixshopImage.data}`} className="max-w-full max-h-full object-contain" />}
                                            {(pixshopMode === 'draw' || pixshopMode === 'mask') && pixshopImage && <canvas ref={pixshopMode === 'draw' ? drawingCanvasRef : maskCanvasRef} className="absolute cursor-crosshair" onMouseDown={handleCanvasDrawStart} onMouseMove={handleCanvasDrawMove} onMouseUp={handleCanvasDrawEnd} onMouseLeave={handleCanvasDrawEnd} onTouchStart={handleCanvasDrawStart} onTouchMove={handleCanvasDrawMove} onTouchEnd={handleCanvasDrawEnd} />}
                                            {pixshopMode === 'text' && pixshopImage && <div ref={textRef} onMouseDown={handleTextDragStart} onTouchStart={handleTextDragStart} className="absolute p-2 bg-black/50 text-white font-bold cursor-move select-none whitespace-nowrap" style={{ left: `${textToolState.x}%`, top: `${textToolState.y}%`, transform: 'translate(-50%, -50%)', textShadow: '1px 1px 2px black' }}>{textToolState.text}</div>}
                                        </div>
                                       <input type="file" id="pixshop-uploader" onChange={e => e.target.files && handleSetImage(setPixshopImage)(e.target.files[0])} className="hidden" accept="image/*"/>
                                       {pixshopImage && <button onClick={() => { setPixshopImage(null); setPixshopOutput(null); setPixshopMode('idle'); setCropRect(null); }} className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-red-500"><TrashIcon className="w-4 h-4"/></button>}
                                       {pixshopMode === 'crop' && cropRect && <div className="absolute border-2 border-dashed border-white bg-black/30 pointer-events-none" style={{ left: `${cropRect.x*100}%`, top: `${cropRect.y*100}%`, width: `${cropRect.width*100}%`, height: `${cropRect.height*100}%` }}></div>}
                                   </div>
                               </div>
                               <div className="flex flex-col gap-2 min-h-0">
                                   <h3 className="text-lg font-semibold text-center flex-shrink-0">Result</h3>
                                   <div className="w-full flex-grow min-h-0 bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center p-2">
                                        {isLoading && <ArrowPathIcon className="w-10 h-10 text-slate-400 animate-spin" />}
                                        {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                                        {!isLoading && !error && pixshopOutput && (
                                            <div className="relative group w-full h-full">
                                                <img src={`data:${pixshopOutput.mimeType};base64,${pixshopOutput.data}`} alt="Result" className="rounded-lg object-contain w-full h-full"/>
                                                <div className="absolute top-2 right-2 flex flex-col gap-2">
                                                    <button onClick={() => handleDownload(pixshopOutput)} className="p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><DownloadIcon className="w-5 h-5"/></button>
                                                    <button onClick={() => { setPixshopImage(pixshopOutput); setPixshopOutput(null); }} className="p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100" title="Use as new input"><ArrowPathIcon className="w-5 h-5"/></button>
                                                </div>
                                            </div>
                                        )}
                                        {!isLoading && !error && !pixshopOutput && <p className="text-slate-500 dark:text-slate-400">Result will appear here</p>}
                                   </div>
                               </div>
                           </div>
                           <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                               {pixshopMode === 'idle' && (
                                   <>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <h4 className="font-semibold text-sm">Creative Tools</h4>
                                                <div className="grid grid-cols-2 gap-2 text-sm">
                                                    <button onClick={() => setPixshopMode('crop')} disabled={!pixshopImage || isLoading} className="tool-btn"><CropIcon className="w-4 h-4"/> Crop</button>
                                                    <button onClick={() => handlePixshopEdit("blur the background, keeping the subject sharp")} disabled={!pixshopImage || isLoading} className="tool-btn">Blur BG</button>
                                                    <button onClick={() => handlePixshopEdit("restore this damaged/faded old photo")} disabled={!pixshopImage || isLoading} className="tool-btn">Restore Photo</button>
                                                    <button onClick={() => handlePixshopEdit("remove the background")} disabled={!pixshopImage || isLoading} className="tool-btn">Remove BG</button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <h4 className="font-semibold text-sm">AI Tools</h4>
                                                <div className="grid grid-cols-2 gap-2 text-sm">
                                                    <button onClick={() => setPixshopMode('mask')} disabled={!pixshopImage || isLoading} className="tool-btn"><EditIcon className="w-4 h-4"/> Magic Edit</button>
                                                    <button onClick={() => setPixshopMode('text')} disabled={!pixshopImage || isLoading} className="tool-btn"><TypeIcon className="w-4 h-4"/> Font Text</button>
                                                    <button onClick={() => setPixshopMode('draw')} disabled={!pixshopImage || isLoading} className="tool-btn"><PaintBrushIcon className="w-4 h-4"/> Hand Drawing</button>
                                                    <select onChange={(e) => { e.target.value && handlePixshopEdit(e.target.value); e.target.value = ''; }} disabled={!pixshopImage || isLoading} className="tool-btn w-full text-sm text-slate-900 dark:text-slate-100">
                                                        <option value="">Apply Artistic Style...</option>
                                                        {pixshopArtStyles.map(s => <option key={s.name} value={s.prompt}>{s.name}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <h4 className="font-semibold text-sm">Color Filters</h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{pixshopColorFilters.map(f => <button key={f.name} onClick={() => { handlePixshopEdit(f.prompt); }} disabled={!pixshopImage || isLoading} className="tool-btn text-xs">{f.name}</button>)}</div>
                                            </div>
                                            <div className="space-y-2">
                                                <h4 className="font-semibold text-sm">Manual Adjustments</h4>
                                                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg space-y-2">
                                                    <Slider label="Vibrance" value={pixshopAdjustments.vibrance} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, vibrance: v }))} disabled={!pixshopImage || isLoading} />
                                                    <Slider label="Warmth" value={pixshopAdjustments.warmth} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, warmth: v }))} disabled={!pixshopImage || isLoading} />
                                                    <Slider label="Contrast" value={pixshopAdjustments.contrast} min={-10} max={10} step={1} onChange={v => setPixshopAdjustments(s => ({ ...s, contrast: v }))} disabled={!pixshopImage || isLoading} />
                                                    <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={pixshopAdjustments.isBW} onChange={e => setPixshopAdjustments(s => ({...s, isBW: e.target.checked}))} disabled={!pixshopImage || isLoading}/> Black & White</label>
                                                    <button onClick={handlePixshopAdjustments} disabled={!pixshopImage || isLoading || (pixshopAdjustments.vibrance === 0 && pixshopAdjustments.warmth === 0 && pixshopAdjustments.contrast === 0 && !pixshopAdjustments.isBW)} className="w-full p-2 text-xs bg-indigo-500 text-white rounded-md font-semibold hover:bg-indigo-600 disabled:opacity-50">Apply Adjustments</button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                               )}
                               {pixshopMode === 'crop' && <div className="col-span-2 flex justify-center gap-4"><button onClick={handleApplyCrop} disabled={!cropRect || !cropRect.width || !cropRect.height} className="tool-btn flex-1 bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">Apply Crop</button><button onClick={() => { setPixshopMode('idle'); setCropRect(null); }} className="tool-btn flex-1 bg-red-500 text-white hover:bg-red-600">Cancel</button></div>}
                               {pixshopMode === 'draw' && (<div className="col-span-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-2"><div className="flex items-center gap-2"><label className="text-xs">Color:</label><input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="w-8 h-8 p-0 border-none rounded cursor-pointer bg-transparent"/></div><Slider label="Brush Size" value={brushSize} min={1} max={50} step={1} onChange={setBrushSize} /><div className="grid grid-cols-3 gap-2"><button onClick={() => setToolPrompt({ show: true, toolName: 'Apply Drawing', title: 'Describe what the drawing should become:', onConfirm: handleApplyHandDrawing })} className="tool-btn bg-green-500 text-white text-xs">Apply</button><button onClick={() => clearCanvas(drawingCanvasRef)} className="tool-btn bg-yellow-500 text-white text-xs">Clear</button><button onClick={() => setPixshopMode('idle')} className="tool-btn bg-red-500 text-white text-xs">Cancel</button></div></div>)}
                               {pixshopMode === 'mask' && (<div className="col-span-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-2"><Slider label="Brush Size" value={maskBrushSize} min={10} max={100} step={5} onChange={setMaskBrushSize} /><div className="grid grid-cols-3 gap-2"><button onClick={() => setToolPrompt({ show: true, toolName: 'Apply Masked Edit', title: 'Describe your edit for the selected area:', onConfirm: handleApplyMask })} className="tool-btn bg-green-500 text-white text-xs">Apply</button><button onClick={() => clearCanvas(maskCanvasRef)} className="tool-btn bg-yellow-500 text-white text-xs">Clear</button><button onClick={() => setPixshopMode('idle')} className="tool-btn bg-red-500 text-white text-xs">Cancel</button></div></div>)}
                               {pixshopMode === 'text' && (<div className="col-span-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-2"><input type="text" value={textToolState.text} onChange={e => setTextToolState(s => ({...s, text: e.target.value}))} placeholder="Your text..." className="input-style"/><input type="text" value={textToolState.stylePrompt} onChange={e => setTextToolState(s => ({...s, stylePrompt: e.target.value}))} placeholder="Font style prompt (e.g., disney font)" className="input-style"/><div className="grid grid-cols-2 gap-2"><button onClick={handleApplyText} className="tool-btn bg-green-500 text-white text-xs">Apply</button><button onClick={() => setPixshopMode('idle')} className="tool-btn bg-red-500 text-white text-xs">Cancel</button></div></div>)}
                           </div>
                       </div>
                    )}
                </div>
            </div>
            {toolPrompt?.show && (
                <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center" onClick={() => setToolPrompt(null)}>
                    <div className="bg-white dark:bg-[#2d2d40] rounded-lg shadow-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">{toolPrompt.title}</h3>
                         {toolPrompt.toolName === 'Beautiful Effect' && (
                            <div className="mb-4 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                                {effectOptions.map(opt => (
                                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                        <input type="radio" name="beautiful-effect" value={opt.id} checked={selectedEffect === opt.id} onChange={e => setSelectedEffect(e.target.value)} />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                        )}
                        <form onSubmit={e => {
                            e.preventDefault();
                            const input = (e.target as HTMLFormElement).elements.namedItem('promptInput') as HTMLInputElement;
                            toolPrompt.onConfirm(input.value);
                            setToolPrompt(null);
                        }}>
                            <input name="promptInput" type="text" className="input-style w-full text-slate-900 dark:text-slate-100" autoFocus />
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setToolPrompt(null)} className="px-4 py-2 rounded-md text-sm font-semibold bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500">Cancel</button>
                                <button type="submit" className="px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">Confirm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; } .label-style { display: block; font-size: 0.875rem; font-weight: 500; } .tool-btn { padding: 0.5rem; background-color: #f1f5f9; color: #334155; border-radius: 0.375rem; font-weight: 600; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; } .tool-btn:hover:not(:disabled) { background-color: #e2e8f0; } .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; } .dark .tool-btn { background-color: #334155; color: #e2e8f0; } .dark .tool-btn:hover:not(:disabled) { background-color: #475569; }`}</style>
        </div>
    );
};
