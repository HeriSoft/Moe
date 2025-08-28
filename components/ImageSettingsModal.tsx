
import React, { useState, useEffect } from 'react';
import { CloseIcon, RefreshIcon } from './icons';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onChange, disabled }) => (
  <div>
    <label className="flex justify-between text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
      <span>{label}</span>
      <span>{value}</span>
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
      disabled={disabled}
    />
  </div>
);

export interface ImageEditingSettings {
    model: 'gemini-2.5-flash-image-preview' | 'flux-kontext';
    safetyTolerance: number;
    guidanceScale: number;
    inferenceSteps: number;
    numImages: number;
    seed: string;
    aspectRatio: string;
}

export interface ImageGenerationSettings {
    model: 'imagen-4.0-generate-001' | 'flux-1-dev' | 'dall-e-3';
    aspectRatio: string;
    numImages: number;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
}

interface ImageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: ImageGenerationSettings | ImageEditingSettings, mode: 'generation' | 'editing') => void;
  mode: 'generation' | 'editing';
}

export const ImageSettingsModal: React.FC<ImageSettingsModalProps> = ({ isOpen, onClose, onApply, mode }) => {
  const [generationSettings, setGenerationSettings] = useState<ImageGenerationSettings>({
    model: 'imagen-4.0-generate-001',
    aspectRatio: '1:1',
    numImages: 1,
    quality: 'standard',
    style: 'vivid',
  });

  const [editingSettings, setEditingSettings] = useState<ImageEditingSettings>({
    model: 'gemini-2.5-flash-image-preview',
    safetyTolerance: 5,
    guidanceScale: 7.5,
    inferenceSteps: 30,
    numImages: 1,
    seed: '',
    aspectRatio: 'Default',
  });

  useEffect(() => {
    // When switching generation model, reset aspect ratio if it's not supported by the new model
    const currentModel = generationSettings.model;
    const currentRatio = generationSettings.aspectRatio;

    if (currentModel === 'dall-e-3') {
        const supportedRatios = ['1:1', '16:9', '9:16'];
        if (!supportedRatios.includes(currentRatio)) {
            setGenerationSettings(s => ({ ...s, aspectRatio: '1:1' }));
        }
    }
  }, [generationSettings.model]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (mode === 'generation') {
      onApply(generationSettings, mode);
    } else {
      onApply(editingSettings, mode);
    }
    onClose();
  };

  const isFluxKontext = editingSettings.model === 'flux-kontext';

  const renderGenerationSettings = () => {
    const isImagen = generationSettings.model === 'imagen-4.0-generate-001';
    const isDalle = generationSettings.model === 'dall-e-3';

    const imagenRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    const dalleRatios = ["1:1", "16:9", "9:16"];
    
    const availableRatios = isImagen ? imagenRatios : (isDalle ? dalleRatios : []);

    return (
        <>
            <div>
                <label htmlFor="gen-model" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Model</label>
                <select 
                    id="gen-model" 
                    value={generationSettings.model} 
                    onChange={(e) => setGenerationSettings(s => ({ ...s, model: e.target.value as ImageGenerationSettings['model'] }))}
                    className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value="imagen-4.0-generate-001">Imagen 4 (by Google)</option>
                    <option value="dall-e-3">DALL·E 3 (by OpenAI)</option>
                    <option value="flux-1-dev" disabled>Flux.1 dev (Coming soon)</option>
                </select>
            </div>
            {(isImagen || isDalle) && (
                <fieldset className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
                    <legend className="text-md font-semibold mb-2 text-slate-500 dark:text-slate-400">Settings</legend>
                     <Slider 
                        label="Number of Images" 
                        value={generationSettings.numImages} 
                        min={1} max={4} step={1} 
                        onChange={v => setGenerationSettings(s => ({ ...s, numImages: v }))} 
                    />
                     <div>
                        <label htmlFor="gen-aspect-ratio" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Aspect Ratio</label>
                        <select 
                            id="gen-aspect-ratio" 
                            value={generationSettings.aspectRatio} 
                            onChange={e => setGenerationSettings(s => ({ ...s, aspectRatio: e.target.value }))} 
                            className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {availableRatios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
                        </select>
                    </div>
                    {isDalle && (
                     <>
                        <div>
                            <label htmlFor="gen-quality" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Quality</label>
                            <select 
                                id="gen-quality" 
                                value={generationSettings.quality} 
                                onChange={e => setGenerationSettings(s => ({ ...s, quality: e.target.value as 'standard' | 'hd' }))} 
                                className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="standard">Standard</option>
                                <option value="hd">HD</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="gen-style" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Style</label>
                            <select 
                                id="gen-style" 
                                value={generationSettings.style} 
                                onChange={e => setGenerationSettings(s => ({ ...s, style: e.target.value as 'vivid' | 'natural' }))} 
                                className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="vivid">Vivid</option>
                                <option value="natural">Natural</option>
                            </select>
                        </div>
                     </>
                    )}
                </fieldset>
            )}
        </>
    );
  };
  
  const renderEditingSettings = () => (
    <>
        <div>
            <label htmlFor="edit-model" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Model</label>
            <select 
                id="edit-model" 
                value={editingSettings.model}
                onChange={(e) => setEditingSettings(s => ({ ...s, model: e.target.value as ImageEditingSettings['model'] }))}
                className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
                <option value="gemini-2.5-flash-image-preview">Gemini 2.5 Flash Image Preview</option>
                <option value="flux-kontext" disabled>Flux Kontext (Coming soon)</option>
            </select>
        </div>

        <fieldset disabled={!isFluxKontext} className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
            <legend className="text-md font-semibold mb-2 text-slate-500 dark:text-slate-400">Flux Kontext Settings</legend>
            <Slider label="Safety Tolerance" value={editingSettings.safetyTolerance} min={1} max={5} step={1} onChange={v => setEditingSettings(s => ({ ...s, safetyTolerance: v }))} disabled={!isFluxKontext} />
            <Slider label="Guidance Scale" value={editingSettings.guidanceScale} min={0.0} max={20.0} step={0.1} onChange={v => setEditingSettings(s => ({ ...s, guidanceScale: v }))} disabled={!isFluxKontext} />
            <Slider label="Number of Inference Steps" value={editingSettings.inferenceSteps} min={10} max={100} step={1} onChange={v => setEditingSettings(s => ({ ...s, inferenceSteps: v }))} disabled={!isFluxKontext} />
            <Slider label="Number of Images (output)" value={editingSettings.numImages} min={1} max={4} step={1} onChange={v => setEditingSettings(s => ({ ...s, numImages: v }))} disabled={!isFluxKontext} />
            <div>
                 <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1" htmlFor="seed">Seed (empty for random)</label>
                 <div className="relative">
                    <input 
                        id="seed"
                        type="number"
                        placeholder="e.g. 12345"
                        value={editingSettings.seed}
                        onChange={e => setEditingSettings(s => ({...s, seed: e.target.value}))}
                        className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 pr-10 focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={!isFluxKontext}
                    />
                    <button 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500" 
                        onClick={() => setEditingSettings(s => ({...s, seed: Math.floor(Math.random() * 100000000).toString()}))}
                        disabled={!isFluxKontext}
                    >
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                 </div>
            </div>
            <div>
                <label htmlFor="aspect-ratio" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Aspect Ratio</label>
                <select id="aspect-ratio" value={editingSettings.aspectRatio} onChange={e => setEditingSettings(s => ({ ...s, aspectRatio: e.target.value }))} className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" disabled={!isFluxKontext}>
                    <option>Default</option>
                </select>
            </div>
        </fieldset>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="image-settings-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 id="image-settings-title" className="text-2xl font-bold">{mode === 'generation' ? 'Image Generation' : 'Image Editing'} Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close settings">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="space-y-6">
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
               {mode === 'generation' ? renderGenerationSettings() : renderEditingSettings()}
            </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">Cancel</button>
            <button onClick={handleApply} className="px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Apply changes</button>
        </div>
      </div>
    </div>
  );
};
