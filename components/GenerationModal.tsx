import React, { useState, useEffect, useRef, useMemo } from 'react';
// FIX: Add missing ArrowUpTrayIcon import
import { CloseIcon, ImageIcon, EditIcon, FaceSwapIcon, VideoIcon, SparklesIcon, PhotoIcon, DownloadIcon, ArrowPathIcon, TrashIcon, PlusIcon, FaceSmileIcon, FaceFrownIcon, FaceSadTearIcon, FaceLaughIcon, FacePoutingIcon, FaceAngryIcon, FaceGrinStarsIcon, GoogleDriveIcon, ArrowUpTrayIcon } from './icons';
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


export const GenerationModal: React.FC<GenerationModalProps> = ({ isOpen, onClose, userProfile, setNotifications, onProFeatureBlock, handleExpGain }) => {
    const [activeMode, setActiveMode] = useState<CreativeMode>('image');
    const [prompt, setPrompt] = useState('');
    const [inputImage1, setInputImage1] = useState<Attachment | null>(null);
    const [inputImage2, setInputImage2] = useState<Attachment | null>(null);
    const [output, setOutput] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [genSettings, setGenSettings] = useState<ImageGenerationSettings>({ model: 'imagen-4.0-generate-001', aspectRatio: '1:1', numImages: 1, quality: 'standard', style: 'vivid' });
    const [editSettings, setEditSettings] = useState<ImageEditingSettings>({ model: 'gemini-2.5-flash-image-preview' });

    // Advanced Editing State
    const [isAdvancedStyle, setIsAdvancedStyle] = useState(false);
    const [userOutfits, setUserOutfits] = useState<Attachment[]>([]);
    const [selectedOutfits, setSelectedOutfits] = useState<string[]>([]); // Store by fileName
    const [isMixOutfit, setIsMixOutfit] = useState(false);
    const [customPosePrompt, setCustomPosePrompt] = useState('');
    const [isCustomPose, setIsCustomPose] = useState(false);
    const [backgroundPrompt, setBackgroundPrompt] = useState('');
    const [selectedPose, setSelectedPose] = useState<string | null>(null);
    const [selectedExpression, setSelectedExpression] = useState<string | null>(null);
    
    // Load outfits from localStorage
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
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);
    
    useEffect(() => { // Reset inputs when mode changes
      setInputImage1(null); setInputImage2(null); setOutput([]); setError(null);
      setIsAdvancedStyle(false);
    }, [activeMode]);
    
    const isAnyStyleSelected = useMemo(() => !!(selectedPose || (isCustomPose && customPosePrompt) || selectedExpression || selectedOutfits.length > 0 || backgroundPrompt), [selectedPose, isCustomPose, customPosePrompt, selectedExpression, selectedOutfits, backgroundPrompt]);

    const handleSetImage = (setter: React.Dispatch<React.SetStateAction<Attachment | null>>) => (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            setter({ data: base64String, mimeType: file.type, fileName: file.name });
        };
        reader.readAsDataURL(file);
    };

    const handleGenerate = async () => {
        setIsLoading(true); setError(null); setOutput([]);
        try {
            let result: Attachment[] = [];
            if (activeMode === 'image') {
                if (!prompt) throw new Error("A prompt is required.");
                result = await generateImage(prompt, genSettings, userProfile);
            } else if (activeMode === 'faceSwap') {
                if (!inputImage1 || !inputImage2) throw new Error("Target image and source face are required.");
                result = [await swapFace(inputImage1, inputImage2, userProfile)];
            } else if (activeMode === 'edit') {
                 if (!prompt) throw new Error("A prompt is required.");
                if (!inputImage1) throw new Error("An image is required.");
                const { attachments } = await editImage(prompt, [inputImage1], editSettings, userProfile);
                result = attachments;
            }
            handleExpGain(100);
            setOutput(result);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage.includes('This is a Pro feature')) {
                onProFeatureBlock();
                onClose();
            } else { setError(errorMessage); }
        } finally { setIsLoading(false); }
    };

    const handleApplyAdvancedStyles = async () => {
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
        const constructedPrompt = promptParts.join(' ');
        
        setIsLoading(true); setError(null); setOutput([]);
        
        try {
            const { attachments } = await editImage(constructedPrompt, [inputImage1, ...additionalImages], editSettings, userProfile);
            setOutput(attachments);
            handleExpGain(50);
            setSelectedPose(null); setSelectedExpression(null); setSelectedOutfits([]);
            setBackgroundPrompt(''); setCustomPosePrompt(''); setIsCustomPose(false);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (errorMessage.includes('This is a Pro feature')) { onProFeatureBlock(); onClose(); } 
            else { setError(errorMessage); }
        } finally { setIsLoading(false); }
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
            setSelectedOutfits(prev => prev.includes(outfit.fileName) ? prev.filter(name => name !== outfit.fileName) : (prev.length < 2 ? [...prev, outfit.fileName] : prev));
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
    const getAspectRatioClass = () => activeMode !== 'image' ? 'aspect-square' : `aspect-[${genSettings.aspectRatio.replace(':', '/')}]`;
    
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
                        <label htmlFor="creative-mode-select" className="label-style mb-1">Tool</label>
                        <select id="creative-mode-select" value={activeMode} onChange={(e) => setActiveMode(e.target.value as CreativeMode)} className="w-full input-style">
                            <option value="image">Image Generation</option>
                            <option value="edit">Image Editing</option>
                            <option value="faceSwap">Face Swap</option>
                            <option value="video" disabled>Video Generation</option>
                        </select>
                    </div>
                    
                    {activeMode === 'image' && (
                        <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                            <h3 className="font-semibold text-lg">Model Settings</h3>
                            <div>
                                <label className="label-style mb-1">Model</label>
                                <select value={genSettings.model} onChange={(e) => setGenSettings(s => ({ ...s, model: e.target.value as ImageGenerationSettings['model'] }))} className="w-full input-style">
                                    <option value="imagen-4.0-generate-001">Imagen 4 (Google)</option>
                                    <option value="dall-e-3">DALL·E 3 (OpenAI)</option>
                                </select>
                            </div>
                            <Slider label="Number of Images" value={genSettings.numImages} min={1} max={4} step={1} onChange={v => setGenSettings(s => ({ ...s, numImages: v }))} />
                            <div>
                                <label className="label-style mb-1">Aspect Ratio</label>
                                <select value={genSettings.aspectRatio} onChange={e => setGenSettings(s => ({ ...s, aspectRatio: e.target.value }))} className="w-full input-style">
                                    {availableRatios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
                                </select>
                            </div>
                            {isDalle && (
                                <>
                                    <div>
                                        <label className="label-style mb-1">Quality</label>
                                        <select value={genSettings.quality} onChange={e => setGenSettings(s => ({ ...s, quality: e.target.value as 'standard' | 'hd' }))} className="w-full input-style">
                                            <option value="standard">Standard</option>
                                            <option value="hd">HD</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label-style mb-1">Style</label>
                                        <select value={genSettings.style} onChange={e => setGenSettings(s => ({ ...s, style: e.target.value as 'vivid' | 'natural' }))} className="w-full input-style">
                                            <option value="vivid">Vivid</option>
                                            <option value="natural">Natural</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {activeMode === 'edit' && (
                        <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                            <h3 className="font-semibold text-lg">Model Settings</h3>
                            <div>
                                <label className="label-style mb-1">Model</label>
                                <select value={editSettings.model} onChange={(e) => setEditSettings(s => ({ ...s, model: e.target.value as ImageEditingSettings['model'] }))} className="w-full input-style">
                                    <option value="gemini-2.5-flash-image-preview">Gemini 2.5 Flash</option>
                                </select>
                            </div>
                        </div>
                    )}
                    {activeMode === 'faceSwap' && (
                        <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg">
                            <h3 className="font-semibold text-lg">Face Swap Info</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Upload a target image and an image with the source face. The model will swap the face from the source onto the target.</p>
                        </div>
                    )}
                </div>

                {/* Right Column: Main Content */}
                <div className="w-full sm:w-[60%] md:w-2/3 sm:pl-6 flex flex-col flex-grow min-h-0 overflow-hidden">
                    <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 min-h-0 overflow-y-auto">
                        
                        {/* Input Column */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-semibold">{activeMode === 'edit' ? 'Image to Edit' : 'Input'}</h3>
                            {activeMode === 'image' && <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your prompt here..." className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style"/>}
                            {activeMode === 'edit' && <ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="" textSize="text-sm" />}
                            {activeMode === 'faceSwap' && <div className="grid grid-cols-2 gap-4"><ImageUploader image={inputImage1} onImageSet={handleSetImage(setInputImage1)} title="Target Image" /><ImageUploader image={inputImage2} onImageSet={handleSetImage(setInputImage2)} title="Source Face" /></div>}
                            
                            {activeMode === 'edit' && (
                                <>
                                <div className="flex items-center justify-between"><label htmlFor="adv-toggle" className="font-semibold text-slate-600 dark:text-slate-300">Advanced Style</label><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" id="adv-toggle" checked={isAdvancedStyle} onChange={e => setIsAdvancedStyle(e.target.checked)} className="sr-only peer"/><div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div></label></div>
                                
                                {!isAdvancedStyle && <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter your editing prompt (e.g., 'add a hat')..." className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent resize-none input-style"/>}

                                {isAdvancedStyle && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">Pose</h4>
                                                <div className="flex items-center gap-2 mb-2"><input type="checkbox" id="custom-pose" checked={isCustomPose} onChange={e => setIsCustomPose(e.target.checked)}/><label htmlFor="custom-pose">Custom Pose</label></div>
                                                {isCustomPose ? <input type="text" value={customPosePrompt} onChange={e => setCustomPosePrompt(e.target.value)} placeholder="e.g., dancing in the rain" className="input-style flex-grow"/> : <div className="grid grid-cols-4 gap-2">{POSES.map(p => <button key={p.label} onClick={() => handlePoseClick(p.prompt)} className={`p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 ${selectedPose === p.prompt ? 'ring-2 ring-indigo-500' : ''}`}>{p.label}</button>)}</div>}
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                     <h4 className="text-sm font-semibold">Outfit</h4>
                                                    <div className="flex items-center gap-2"><input type="checkbox" id="mix-outfit" checked={isMixOutfit} onChange={e => setIsMixOutfit(e.target.checked)}/><label htmlFor="mix-outfit">Mix (Max 2)</label></div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => userOutfits[i] ? <button key={userOutfits[i].fileName} onClick={() => handleOutfitClick(userOutfits[i])} className={`relative rounded-md overflow-hidden aspect-square ${selectedOutfits.includes(userOutfits[i].fileName) ? 'ring-2 ring-indigo-500' : ''}`}><img src={`data:${userOutfits[i].mimeType};base64,${userOutfits[i].data}`} className="w-full h-full object-cover"/><button onClick={(e) => { e.stopPropagation(); saveOutfits(userOutfits.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 p-0.5 bg-black/50 text-white rounded-full"><TrashIcon className="w-3 h-3"/></button></button> : <div key={i} className="flex flex-col gap-1 items-center justify-center p-1 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-600 aspect-square"><button onClick={handleAddOutfitFromDrive} className="p-1 rounded-full bg-slate-200 dark:bg-slate-700"><GoogleDriveIcon className="w-3 h-3"/></button><input type="file" id={`outfit-upload-${i}`} onChange={e => e.target.files && handleAddOutfit(e.target.files[0])} className="hidden"/><label htmlFor={`outfit-upload-${i}`} className="p-1 rounded-full bg-slate-200 dark:bg-slate-700 cursor-pointer"><ArrowUpTrayIcon className="w-3 h-3"/></label></div>)}</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                </>
                            )}
                        </div>
                        
                        {/* Output Column */}
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold">{activeMode === 'edit' ? 'Edit Result' : 'Output'}</h3>
                                {activeMode === 'edit' && isAdvancedStyle && <p className="text-sm text-slate-500">Photo result edited</p>}
                            </div>
                            <div className="w-full aspect-square bg-slate-100 dark:bg-[#2d2d40] rounded-lg flex items-center justify-center p-2">
                                {isLoading && <ArrowPathIcon className="w-10 h-10 text-slate-400 animate-spin" />}
                                {!isLoading && error && <p className="text-center text-red-500 p-4">{error}</p>}
                                {!isLoading && !error && output.length > 0 && <div className={`grid gap-2 w-full ${output.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>{output.map((item, index) => <div key={index} className={`relative group w-full ${getAspectRatioClass()}`}><img src={`data:${item.mimeType};base64,${item.data}`} alt="Generated media" className="rounded-lg object-cover w-full h-full"/><button onClick={() => handleDownload(item)} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"><DownloadIcon className="w-5 h-5"/></button></div>)}</div>}
                                {!isLoading && !error && output.length === 0 && <p className="text-slate-500 dark:text-slate-400">Your results will appear here</p>}
                            </div>

                            {activeMode === 'edit' && isAdvancedStyle && (
                                <div className="space-y-4 text-sm">
                                    <div>
                                        <h4 className="text-sm font-semibold mb-2">Expression</h4>
                                        <div className="grid grid-cols-4 gap-2">{EXPRESSIONS.map(e => <button key={e.label} onClick={() => handleExpressionClick(e.prompt)} title={e.label} className={`p-2 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex justify-center items-center ${selectedExpression === e.prompt ? 'ring-2 ring-indigo-500' : ''}`}><e.Icon className="w-5 h-5"/></button>)}</div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold mb-2">Background</h4>
                                        <input type="text" value={backgroundPrompt} onChange={e => setBackgroundPrompt(e.target.value)} placeholder="e.g., a futuristic city" className="input-style flex-grow"/>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                    <div className="flex-shrink-0 pt-4 mt-auto border-t border-slate-200 dark:border-slate-700">
                        {activeMode === 'edit' && isAdvancedStyle ? (
                             <button onClick={handleApplyAdvancedStyles} disabled={!isAnyStyleSelected || isLoading || !inputImage1} className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors">
                                {isLoading ? 'Applying...' : 'Apply Advanced Styles'}
                            </button>
                        ) : (
                            <button onClick={handleGenerate} disabled={!canGenerate || isLoading} className="w-full flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors">
                                {isLoading ? 'Generating...' : 'Generate'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <style>{`.input-style { color: inherit; background-color: transparent; border: 1px solid #4a5568; border-radius: 0.375rem; padding: 0.5rem 0.75rem; width: 100%; } .input-style:focus { outline: none; border-color: #6366f1; } .label-style { display: block; font-size: 0.875rem; font-weight: 500; }`}</style>
        </div>
    );
};