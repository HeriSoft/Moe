


import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CloseIcon, SpeakerWaveIcon, StopCircleIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  model: string;
  setModel: (model: string) => void;
  chatBgColor: string;
  setChatBgColor: (color: string) => void;
}

const ColorSwatch: React.FC<{ color: string; selectedColor: string; setColor: (color: string) => void; }> = ({ color, selectedColor, setColor }) => (
  <button
    onClick={() => setColor(color)}
    style={{ backgroundColor: color }}
    className={`w-8 h-8 rounded-full border-2 transition-all ${selectedColor === color ? 'border-indigo-400 ring-2 ring-indigo-400' : 'border-transparent'}`}
    aria-label={`Select ${color} background`}
  />
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, setIsDarkMode, model, setModel, chatBgColor, setChatBgColor }) => {
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
    // Stop listening
    if (liveAudioRef.current) {
        liveAudioRef.current.pause();
        liveAudioRef.current.srcObject = null;
    }
    setIsListening(false);
    
    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    
    // Stop visualization
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    setAudioLevel(0);
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }

    // Stop media stream tracks
    micStream?.getTracks().forEach(track => track.stop());
    setMicStream(null);
  }, [micStream]);
  
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
            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
            setAudioLevel(Math.min(100, (average / 128) * 100));
          }
          animationFrameIdRef.current = requestAnimationFrame(visualize);
        };
        visualize();
    } catch(e) {
        console.error("Error setting up audio visualizer:", e);
        setMicError("Could not start audio visualizer.");
    }
  }, []);

  // --- Main effect to handle modal open/close ---
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      liveAudioRef.current = new Audio();
      const initializeMic = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setMicError("Microphone access is not supported by your browser.");
          return;
        }
        try {
          setMicError(null);
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioDevices = devices.filter(device => device.kind === 'audioinput');
          setMicDevices(audioDevices);
          if (audioDevices.length > 0) {
            const defaultDeviceId = audioDevices[0].deviceId;
            setSelectedMicId(defaultDeviceId);
            setupStreamAndVisualizer(stream);
          } else {
            setMicError("No microphone found.");
            stream.getTracks().forEach(track => track.stop());
          }
        } catch (err) {
          console.error("Error accessing microphone:", err);
          setMicError("Microphone permission denied. Please allow access in your browser settings.");
        }
      };
      initializeMic();
    } else {
      document.body.style.overflow = 'auto';
      stopMic(); // Cleanup on close
    }
    return () => { // Cleanup function for when component unmounts while open
        stopMic();
    };
  }, [isOpen, setupStreamAndVisualizer, stopMic]);

  // --- Handler for when user selects a different microphone ---
  const handleMicChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newDeviceId = event.target.value;
    setSelectedMicId(newDeviceId);
    stopMic(); // Clean up the old stream before starting a new one
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: newDeviceId } } });
        setupStreamAndVisualizer(newStream);
    } catch (err) {
        console.error("Error switching microphone:", err);
        setMicError("Could not switch to the selected microphone.");
    }
  };
  
  // --- Handlers for microphone actions ---
  const handleListenToggle = () => {
    if (!micStream || !liveAudioRef.current) return;
    if (isListening) {
      liveAudioRef.current.pause();
      liveAudioRef.current.srcObject = null;
    } else {
      liveAudioRef.current.srcObject = micStream;
      liveAudioRef.current.play().catch(e => console.error("Live audio playback error:", e));
    }
    setIsListening(!isListening);
  };
  
  const handleRecordToggle = () => {
    if (!micStream) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      setRecordedAudioUrl(null);
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(micStream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedAudioUrl(url);
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
    }
  };

  if (!isOpen) return null;

  const handleThemeToggle = () => {
    setIsDarkMode(!isDarkMode);
  };
  
  const backgroundColors = ['#212133', '#2d3748', '#1a202c', '#000000'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 id="settings-title" className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close settings">
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 -mr-2">
          {/* Appearance */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Appearance</h3>
            <div className="flex items-center justify-between bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg">
              <span>Dark/Light Mode</span>
              <label htmlFor="theme-toggle" className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="theme-toggle" className="sr-only peer" checked={isDarkMode} onChange={handleThemeToggle} />
                <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {/* Chat Background */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Chat Background (Dark Mode)</h3>
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg flex space-x-3">
                {backgroundColors.map(color => (
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
                  <optgroup label="Free Models">
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    <option value="o3-mini">o3-mini</option>
                    <option value="gpt-5-mini">gpt-5-mini</option>
                    <option value="deepseek-v3.1">DeepSeek v3.1</option>
                  </optgroup>
                  <optgroup label="Pro Models">
                    <option value="gpt-4.1">gpt-4.1 (Pro)</option>
                    <option value="gpt-5">gpt-5 (Pro)</option>
                    <option value="o3">o3 (Pro)</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
          
          {/* Microphone Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Microphone Settings</h3>
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg space-y-4">
              {micError ? (
                  <p className="text-red-500 text-sm">{micError}</p>
              ) : (
                <>
                  <div>
                    <label htmlFor="mic-select" className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Select Microphone</label>
                    <select id="mic-select" value={selectedMicId} onChange={handleMicChange} className="w-full bg-white dark:bg-[#171725] border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-indigo-500 focus:border-indigo-500" disabled={micDevices.length === 0}>
                      {micDevices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Input Level</label>
                    <div className="w-full h-8 bg-slate-200 dark:bg-slate-700 rounded-md overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-[width] duration-75 ease-linear" 
                        style={{ width: `${audioLevel}%` }}
                        role="progressbar"
                        aria-valuenow={Math.round(audioLevel)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Microphone input level"
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <button onClick={handleListenToggle} disabled={!micStream} className={`flex items-center justify-center gap-2 p-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isListening ? 'bg-red-500 text-white' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'}`}>
                         <SpeakerWaveIcon className="w-5 h-5" />
                         {isListening ? 'Stop Listening' : 'Listen Live'}
                     </button>
                     <button onClick={handleRecordToggle} disabled={!micStream} className={`flex items-center justify-center gap-2 p-2 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'}`}>
                         <StopCircleIcon className="w-5 h-5" />
                         {isRecording ? 'Stop Recording' : 'Record'}
                     </button>
                  </div>
                  {recordedAudioUrl && (
                    <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Playback Recording</label>
                      <audio src={recordedAudioUrl} controls className="w-full" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
