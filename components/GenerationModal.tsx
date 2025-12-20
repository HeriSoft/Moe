import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CloseIcon, PhotoIcon, SparklesIcon, ArrowPathIcon, WrenchScrewdriverIcon, FaceSwapIcon } from './icons';
import { ImageSettingsModal, ImageGenerationSettings, ImageEditingSettings } from './ImageSettingsModal';
import { generateImage, editImage, swapFace } from '../services/geminiService';
import type { UserProfile, Attachment } from '../types';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
  onProFeatureBlock: () => void;
  handleExpGain: (amount: number) => void;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile | undefined>>;
}

export const GenerationModal: React.FC<GenerationModalProps> = ({ 
    isOpen, onClose, userProfile, setNotifications, onProFeatureBlock, handleExpGain, setUserProfile 
}) => {
    // State
    const [activeMode, setActiveMode] = useState<'image' | 'edit' | 'faceSwap' | 'pixshop'>('image');
    const [prompt, setPrompt] = useState('');
    const [inputImage1, setInputImage1] = useState<Attachment | null>(null);
    const [inputImage2, setInputImage2] = useState<Attachment | null>(null);
    const [output, setOutput] = useState<Attachment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [genSettings, setGenSettings] = useState<ImageGenerationSettings>({
        model: 'imagen-4.0-generate-001', aspectRatio: '1:1', numImages: 1, quality: 'standard', style: 'vivid'
    });
    const [editSettings, setEditSettings] = useState<ImageEditingSettings>({
        model: 'gemini-2.5-flash-image-preview', safetyTolerance: 2, guidanceScale: 7, inferenceSteps: 30, numImages: 1, seed: '', aspectRatio: 'auto'
    });
    
    // Pixshop specific state placeholders
    const [pixshopImage, setPixshopImage] = useState<Attachment | null>(null);
    const [pixshopOutput, setPixshopOutput] = useState<Attachment | null>(null);
    const [pixshopAdjustments, setPixshopAdjustments] = useState({ vibrance: 0, warmth: 0, contrast: 0, isBW: false });
    const [pixshopMode, setPixshopMode] = useState<'idle' | 'crop' | 'adjust'>('idle');
    const [cropRect, setCropRect] = useState<any>(null);
    const [cropStartPoint, setCropStartPoint] = useState<any>(null);
    const [toolPrompt, setToolPrompt] = useState<string | null>(null);

    // Advanced Editing State
    const [isAdvancedStyle, setIsAdvancedStyle] = useState(false);
    const [userOutfits, setUserOutfits] = useState<any[]>([]);
    const [selectedOutfits, setSelectedOutfits] = useState<string[]>([]);
    const [isMixOutfit, setIsMixOutfit] = useState(false);
    const [selectedPose, setSelectedPose] = useState<string | null>(null);
    const [selectedExpression, setSelectedExpression] = useState<string | null>(null);
    const [backgroundPrompt, setBackgroundPrompt] = useState('');
    const [customPosePrompt, setCustomPosePrompt] = useState('');
    const [isCustomPose, setIsCustomPose] = useState(false);
    const [usePoseRefImage, setUsePoseRefImage] = useState(false);
    const [poseRefImage, setPoseRefImage] = useState<Attachment | null>(null);
    const [inputImageDimensions, setInputImageDimensions] = useState<{width: number, height: number} | null>(null);
    
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // File input refs
    const fileInputRef1 = useRef<HTMLInputElement>(null);
    const fileInputRef2 = useRef<HTMLInputElement>(null);

    const getOriginalOutputSettings = useCallback((): any => {
        if (editSettings.model === 'gemini-3-pro-image-preview') {
            return { ...editSettings };
        }
        if (inputImageDimensions) {
            let { width, height } = inputImageDimensions;
            if (width > 1024 || height > 1024) {
                const scale = 1024 / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            return { ...editSettings, outputSize: { width, height } };
        }
        return { ...editSettings };
    }, [inputImageDimensions, editSettings]);

    useEffect(() => {
        if (!userProfile) return;
        try {
            const savedOutfits = localStorage.getItem(`moe-chat-outfits-${userProfile.email}`);
            if (savedOutfits) setUserOutfits(JSON.parse(savedOutfits));
        } catch (e) { console.error("Failed to load outfits", e); }
    }, [userProfile]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setPrompt(''); setInputImage1(null); setInputImage2(null); setOutput([]);
            setIsLoading(false); setError(null);
        } else {
            document.body.style.overflow = 'auto';
        }
    }, [isOpen]);

    const handleFileChange = (setter: React.Dispatch<React.SetStateAction<Attachment | null>>, setDimensions?: React.Dispatch<React.SetStateAction<{width: number, height: number} | null>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = (ev.target?.result as string).split(',')[1];
                setter({ data: base64, mimeType: file.type, fileName: file.name });
                
                if (setDimensions) {
                    const img = new Image();
                    img.onload = () => setDimensions({ width: img.width, height: img.height });
                    img.src = ev.target?.result as string;
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGenericApiCall = async (apiCall: () => Promise<Attachment[] | { attachments: Attachment[] } | Attachment>) => {
        setIsLoading(true);
        setError(null);
        setOutput([]);
        setPixshopOutput(null);

        let cost = 0;
        if (activeMode === 'image') cost = 4;
        else if (activeMode === 'edit' || activeMode === 'pixshop') cost = 4;
        else if (activeMode === 'faceSwap') cost = 2;

        const isAdmin = userProfile?.email === 'heripixiv@gmail.com';

        if (!isAdmin && userProfile && (userProfile.credits ?? 0) < cost) {
            setError(`Not enough credits. This action requires ${cost} credits.`);
            setIsLoading(false);
            return;
        }

        if (!isAdmin && cost > 0) {
            setUserProfile(prev => prev ? { ...prev, credits: (prev.credits ?? 0) - cost } : undefined);
        }

        try {
            const result = await apiCall();
            handleExpGain(50);
            
            let finalAttachments: Attachment[] = [];
            if (Array.isArray(result)) {
                finalAttachments = result;
            } else if ('attachments' in result) {
                finalAttachments = result.attachments;
            } else {
                finalAttachments = [result as Attachment];
            }

            if (activeMode === 'pixshop') {
                setPixshopOutput(finalAttachments[0] || null);
            } else {
                setOutput(finalAttachments);
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "An unknown error occurred.";
            if (!isAdmin && cost > 0) {
                setUserProfile(prev => prev ? { ...prev, credits: (prev.credits ?? 0) + cost } : undefined);
            }
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
        if (!prompt && !isAdvancedStyle) { setError("A prompt is required."); return; }
        if (!inputImage1) { setError("An image is required."); return; }
        
        if (isAdvancedStyle) {
            handleApplyAdvancedStyles();
        } else {
            handleGenericApiCall(async () => {
                const finalEditSettings = getOriginalOutputSettings();
                return await editImage(prompt, [inputImage1], finalEditSettings, userProfile);
            });
        }
    };

    const handleSwap = () => {
        if (!inputImage1 || !inputImage2) { setError("Target image and source face are required."); return; }
        handleGenericApiCall(() => swapFace(inputImage1, inputImage2, userProfile));
    };

    const handleApplyAdvancedStyles = () => {
        if (!inputImage1) { setError("Please upload an image to edit first."); return; }
        
        const promptParts: string[] = [];
        const additionalImages: Attachment[] = [];
        
        let basePrompt = "Using the FIRST image as the main SUBJECT.";

        const outfitsToApply = userOutfits.filter(o => selectedOutfits.includes(o.fileName));
        if (outfitsToApply.length > 0) {
            additionalImages.push(...outfitsToApply);
            if (isMixOutfit && outfitsToApply.length > 1) {
                 basePrompt += " The SUBSEQUENT images are OUTFIT REFERENCES. Mix them creatively.";
            } else {
                 basePrompt += " The SECOND image is the OUTFIT REFERENCE. Change the outfit to match.";
            }
        }

        if (isCustomPose) {
            if (usePoseRefImage && poseRefImage) {
                promptParts.push("Match the pose in the reference image.");
                additionalImages.push(poseRefImage);
            } else if (customPosePrompt) {
                promptParts.push(`Change pose to: ${customPosePrompt}.`);
            }
        } else if (selectedPose) {
            promptParts.push(`Change pose to: ${selectedPose}.`);
        }

        if (selectedExpression) promptParts.push(`Expression: ${selectedExpression}.`);
        if (backgroundPrompt) promptParts.push(`Background: ${backgroundPrompt}.`);

        if (editSettings.aspectRatio && editSettings.aspectRatio !== 'auto') {
             promptParts.push(`Output aspect ratio: ${editSettings.aspectRatio}.`);
        }

        let constructedPrompt = `${basePrompt} ${promptParts.join(' ')} ${prompt}`;
        
        handleGenericApiCall(async () => {
             const finalEditSettings = getOriginalOutputSettings();
             return await editImage(constructedPrompt, [inputImage1, ...additionalImages], finalEditSettings, userProfile);
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-[#171725] w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                        <SparklesIcon className="w-6 h-6 text-indigo-500" /> Creative Tools
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><CloseIcon className="w-6 h-6 text-gray-500" /></button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-gray-50 dark:bg-[#1f1f2e] border-r border-gray-200 dark:border-gray-700 flex flex-col p-4 gap-2">
                        <button onClick={() => setActiveMode('image')} className={`p-3 rounded-lg flex items-center gap-3 font-semibold ${activeMode === 'image' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                            <PhotoIcon className="w-5 h-5" /> Generate Image
                        </button>
                        <button onClick={() => setActiveMode('edit')} className={`p-3 rounded-lg flex items-center gap-3 font-semibold ${activeMode === 'edit' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                            <WrenchScrewdriverIcon className="w-5 h-5" /> Edit Image
                        </button>
                        <button onClick={() => setActiveMode('faceSwap')} className={`p-3 rounded-lg flex items-center gap-3 font-semibold ${activeMode === 'faceSwap' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                            <FaceSwapIcon className="w-5 h-5" /> Face Swap
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-[#171725]">
                        {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">{error}</div>}
                        
                        <div className="flex gap-6 h-full">
                            {/* Controls Area */}
                            <div className="flex-1 space-y-6">
                                {activeMode === 'image' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Prompt</label>
                                            <textarea 
                                                value={prompt} 
                                                onChange={e => setPrompt(e.target.value)} 
                                                className="w-full h-32 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                                placeholder="Describe the image you want to generate..."
                                            />
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={handleGenerate} disabled={isLoading} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg disabled:opacity-50 flex justify-center items-center gap-2">
                                                {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />} Generate
                                            </button>
                                            <button onClick={() => setIsSettingsOpen(true)} className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-white">Settings</button>
                                        </div>
                                    </>
                                )}

                                {activeMode === 'edit' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Base Image</label>
                                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-500" onClick={() => fileInputRef1.current?.click()}>
                                                {inputImage1 ? (
                                                    <img src={`data:${inputImage1.mimeType};base64,${inputImage1.data}`} alt="Input" className="max-h-48 mx-auto rounded" />
                                                ) : (
                                                    <div className="py-8 text-gray-500 dark:text-gray-400">Click to upload image</div>
                                                )}
                                                <input type="file" ref={fileInputRef1} className="hidden" onChange={handleFileChange(setInputImage1, setInputImageDimensions)} accept="image/*" />
                                            </div>
                                        </div>
                                        
                                        {!isAdvancedStyle && (
                                            <div>
                                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Edit Prompt</label>
                                                <textarea 
                                                    value={prompt} 
                                                    onChange={e => setPrompt(e.target.value)} 
                                                    className="w-full h-24 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                                                    placeholder="Describe what to change..."
                                                />
                                            </div>
                                        )}

                                        <div className="flex gap-3">
                                            <button onClick={handleEdit} disabled={isLoading} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg disabled:opacity-50 flex justify-center items-center gap-2">
                                                {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <WrenchScrewdriverIcon className="w-5 h-5" />} Edit
                                            </button>
                                            <button onClick={() => setIsSettingsOpen(true)} className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-white">Settings</button>
                                        </div>
                                    </>
                                )}

                                {activeMode === 'faceSwap' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Target Image</label>
                                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-500" onClick={() => fileInputRef1.current?.click()}>
                                                    {inputImage1 ? <img src={`data:${inputImage1.mimeType};base64,${inputImage1.data}`} alt="Target" className="max-h-40 mx-auto rounded" /> : <div className="py-8 text-gray-500">Upload Target</div>}
                                                    <input type="file" ref={fileInputRef1} className="hidden" onChange={handleFileChange(setInputImage1)} accept="image/*" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Source Face</label>
                                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-500" onClick={() => fileInputRef2.current?.click()}>
                                                    {inputImage2 ? <img src={`data:${inputImage2.mimeType};base64,${inputImage2.data}`} alt="Source" className="max-h-40 mx-auto rounded" /> : <div className="py-8 text-gray-500">Upload Face</div>}
                                                    <input type="file" ref={fileInputRef2} className="hidden" onChange={handleFileChange(setInputImage2)} accept="image/*" />
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={handleSwap} disabled={isLoading} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg disabled:opacity-50 flex justify-center items-center gap-2">
                                            {isLoading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <FaceSwapIcon className="w-5 h-5" />} Swap Face
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Result Area */}
                            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-4 flex flex-col items-center justify-center min-h-[400px]">
                                {output.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-4 w-full">
                                        {output.map((img, idx) => (
                                            <div key={idx} className="relative group">
                                                <img src={`data:${img.mimeType};base64,${img.data}`} alt="Generated" className="w-full h-auto rounded-lg shadow-md" />
                                                <a href={`data:${img.mimeType};base64,${img.data}`} download={img.fileName} className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ArrowPathIcon className="w-5 h-5" />
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-gray-400">
                                        <PhotoIcon className="w-16 h-16 mx-auto mb-2 opacity-50" />
                                        <p>Output will appear here</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <ImageSettingsModal 
                isOpen={isSettingsOpen} 
                onClose={() => setIsSettingsOpen(false)} 
                mode={activeMode === 'image' ? 'generation' : 'editing'}
                onApply={(settings, mode) => {
                    if (mode === 'generation') setGenSettings(settings as ImageGenerationSettings);
                    else setEditSettings(settings as ImageEditingSettings);
                }}
            />
        </div>
    );
};
