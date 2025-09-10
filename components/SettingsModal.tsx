

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon, SpeakerWaveIcon, StopCircleIcon, TicketIcon, ClockIcon } from './icons';
import type { UserProfile } from '../types';

// --- TYPE DEFINITIONS ---
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  model: string;
  setModel: (model: string) => void;
  chatBgColor: string;
  setChatBgColor: (color: string) => void;
  userProfile?: UserProfile;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

// --- HELPER & CHILD COMPONENTS ---

const ColorSwatch: React.FC<{ color: string; selectedColor: string; setColor: (color: string) => void; }> = ({ color, selectedColor, setColor }) => (
  <button
    onClick={() => setColor(color)}
    style={{ backgroundColor: color }}
    className={`w-8 h-8 rounded-full border-2 transition-all ${selectedColor === color ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-transparent'}`}
    aria-label={`Select ${color} background`}
  />
);

// --- MAIN SETTINGS MODAL COMPONENT ---

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, setIsDarkMode, model, setModel, chatBgColor, setChatBgColor, userProfile, setNotifications }) => {
  // --- States for microphone settings ---
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // --- Refs for audio components and animations ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);

  // --- Function to stop all microphone activity and clean up ---
  const stopMic = useCallback(() => {
    if (liveAudioRef.current) { liveAudioRef.current.pause(); liveAudioRef.current.srcObject = null; }
    setIsListening(false);
    if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); }
    setIsRecording(false);
    if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
    setAudioLevel(0);
    // FIX: Check for existence of audioContextRef.current before trying to access its properties.
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
      audioContextRef.current = null;
    }
    setMicStream(currentStream => { if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); } return null; });
  }, []);
  
  // --- Function to set up a new stream and the visualizer ---
  const setupStreamAndVisualizer = useCallback((stream: MediaStream) => {
    setMicStream(stream);
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        const visualize = () => {
          if (analyserRef.current) {
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            setAudioLevel(Math.min(100, (dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length / 128) * 100));
          }
          animationFrameIdRef.current = requestAnimationFrame(visualize);
        };
        visualize();
    } catch(e) { console.error("Error setting up audio visualizer:", e); setMicError("Could not start audio visualizer."); }
  }, []);

  // --- Main effect to handle modal open/close ---
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      liveAudioRef.current = new Audio();
      const initializeMic = async () => {
        if (!navigator.mediaDevices?.getUserMedia) { setMicError("Microphone access is not supported."); return; }
        try {
          setMicError(null);
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioDevices = devices.filter(device => device.kind === 'audioinput');
          setMicDevices(audioDevices);
          if (audioDevices.length > 0) {
            const defaultDevice = audioDevices.find(d => d.deviceId === 'default') || audioDevices[0];
            setSelectedMicId(defaultDevice.deviceId);
            const currentStreamDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
            if (currentStreamDeviceId && currentStreamDeviceId !== defaultDevice.deviceId && defaultDevice.deviceId !== 'default') {
                stream.getTracks().forEach(track => track.stop());
                const specificStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: defaultDevice.deviceId } } });
                setupStreamAndVisualizer(specificStream);
            } else { setupStreamAndVisualizer(stream); }
          } else { setMicError("No microphone found."); stream.getTracks().forEach(track => track.stop()); }
        } catch (err) { console.error("Error accessing microphone:", err); setMicError("Microphone permission denied."); }
      };
      initializeMic();
    } else { document.body.style.overflow = 'auto'; stopMic(); }
    return () => { stopMic(); };
  }, [isOpen, setupStreamAndVisualizer, stopMic]);
  
  // --- Handlers for mic actions ---
  const handleMicChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newDeviceId = event.target.value;
    setSelectedMicId(newDeviceId);
    stopMic();
    setMicError(null);
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: newDeviceId } } });
        setupStreamAndVisualizer(newStream);
    } catch (err) { console.error("Error switching microphone:", err); setMicError("Could not switch microphone."); }
  };
  const handleListenToggle = () => {
    if (!micStream || !liveAudioRef.current) return;
    if (isListening) { liveAudioRef.current.pause(); liveAudioRef.current.srcObject = null; } 
    else { liveAudioRef.current.srcObject = micStream; liveAudioRef.current.play().catch(e => console.error("Live audio playback error:", e)); }
    setIsListening(!isListening);
  };
  const handleRecordToggle = () => {
    if (!micStream) return;
    if (isRecording) { mediaRecorderRef.current?.stop(); } 
    else {
      setRecordedAudioUrl(null); recordedChunksRef.current = [];
      try {
        const recorder = new MediaRecorder(micStream);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => { if (event.data.size > 0) recordedChunksRef.current.push(event.data); };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedAudioUrl(url);
          setIsRecording(false);
        };
        recorder.start();
        setIsRecording(true);
      } catch (e) { console.error("MediaRecorder error:", e); setMicError("Could not start recording."); }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 id="settings-title" className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close settings"><CloseIcon className="w-7 h-7" /></button>
        </div>
        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 -mr-2">
          {/* Appearance */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Appearance</h3>
            <div className="flex items-center justify-between bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg">
              <span>Dark/Light Mode</span>
              <label htmlFor="theme-toggle" className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="theme-toggle" className="sr-only peer" checked={isDarkMode} onChange={() => setIsDarkMode(!isDarkMode)} />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
          {/* Chat Background */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Chat Background (Dark Mode)</h3>
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg flex space-x-3">
                {['#212133', '#2d3748', '#1a202c', '#000000'].map(color => (
                    <ColorSwatch key={color} color={color} selectedColor={chatBgColor} setColor={setChatBgColor} />
                ))}
            </div>
          </div>
          {/* Model Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Model Settings</h3>
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
              <div>
                <label htmlFor="default-model" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Default Model</label>
                <select id="default-model" value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <optgroup label="Free Models"><option value="gemini-2.5-flash">gemini-2.5-flash</option><option value="o3-mini">o3-mini</option><option value="gpt-5-mini">gpt-5-mini</option><option value="deepseek-v3.1">DeepSeek v3.1</option></optgroup>
                  <optgroup label="Pro Models"><option value="gpt-4.1">gpt-4.1 (Pro)</option><option value="gpt-5">gpt-5 (Pro)</option><option value="o3">o3 (Pro)</option></optgroup>
                </select>
              </div>
            </div>
          </div>
          {/* Microphone Settings */}
          <div>
              <h3 className="text-lg font-semibold mb-3">Microphone Settings</h3>
              <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
                {micError ? (<p className="text-red-500 text-sm">{micError}</p>) : (
                  <>
                    <div>
                      <label htmlFor="mic-select" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Select Microphone</label>
                      <select id="mic-select" value={selectedMicId} onChange={handleMicChange} className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2" disabled={micDevices.length === 0}>
                        {micDevices.map((d, i) => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${i + 1}`}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Input Level</label>
                      <div className="w-full h-8 bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden">
                        <div className="h-full bg-green-500 transition-[width] duration-75" style={{ width: `${audioLevel}%` }}></div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <button onClick={handleListenToggle} disabled={!micStream} className={`flex items-center justify-center gap-2 p-2 rounded-md font-semibold transition-colors disabled:opacity-50 ${isListening ? 'bg-red-500 text-white' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300'}`}>
                           <SpeakerWaveIcon className="w-5 h-5" />{isListening ? 'Stop' : 'Listen'}
                       </button>
                       <button onClick={handleRecordToggle} disabled={!micStream} className={`flex items-center justify-center gap-2 p-2 rounded-md font-semibold transition-colors disabled:opacity-50 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300'}`}>
                           <StopCircleIcon className="w-5 h-5" />{isRecording ? 'Stop' : 'Record'}
                       </button>
                    </div>
                    {recordedAudioUrl && <audio src={recordedAudioUrl} controls className="w-full" />}
                  </>
                )}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};
