import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CloseIcon } from './icons';

// --- Constants ---
const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const SOUNDFONT_OPTIONS = [
    { value: 'acoustic_grand_piano', label: 'Acoustic Grand Piano' },
    { value: 'bright_acoustic_piano', label: 'Bright Acoustic Piano' },
    { value: 'electric_grand_piano', label: 'Electric Grand Piano' },
    { value: 'honkytonk_piano', label: 'Honky-Tonk Piano' },
];

const NOTE_TO_FILENAME_MAP: { [note: string]: string } = {
    'C': 'C', 'Db': 'Cs', 'D': 'D', 'Eb': 'Ds', 'E': 'E',
    'F': 'F', 'Gb': 'Fs', 'G': 'G', 'Ab': 'Gs', 'A': 'A',
    'Bb': 'As', 'B': 'B'
};

const KEY_TO_NOTE_MAP: { [key: string]: string } = {
  // White Keys
  '1': 'C2', '2': 'D2', '3': 'E2', '4': 'F2', '5': 'G2', '6': 'A2', '7': 'B2',
  '8': 'C3', '9': 'D3', '0': 'E3', 'q': 'F3', 'w': 'G3', 'e': 'A3', 'r': 'B3',
  't': 'C4', 'y': 'D4', 'u': 'E4', 'i': 'F4', 'o': 'G4', 'p': 'A4', 'a': 'B4',
  's': 'C5', 'd': 'D5', 'f': 'E5', 'g': 'F5', 'h': 'G5', 'j': 'A5', 'k': 'B5',
  'l': 'C6', 'z': 'D6', 'x': 'E6', 'c': 'F6', 'v': 'G6', 'b': 'A6', 'n': 'B6',
  'm': 'C7',
  // Black Keys (Shift)
  '!': 'Db2', '@': 'Eb2', '$': 'Gb2', '%': 'Ab2', '^': 'Bb2',
  '*': 'Db3', '(': 'Eb3', 'Q': 'Gb3', 'W': 'Ab3', 'E': 'Bb3',
  'T': 'Db4', 'Y': 'Eb4', 'I': 'Gb4', 'O': 'Ab4', 'P': 'Bb4',
  'S': 'Db5', 'D': 'Eb5', 'G': 'Gb5', 'H': 'Ab5', 'J': 'Bb5',
  'L': 'Db6', 'Z': 'Eb6', 'C': 'Gb6', 'V': 'Ab6', 'B': 'Bb6',
};

const NOTE_TO_KEY_LABEL_MAP: { [note: string]: string } = Object.fromEntries(
  Object.entries(KEY_TO_NOTE_MAP).map(([key, note]) => [note, key.toUpperCase()])
);

const generateNoteFiles = (soundfont: string) => {
    const SOUND_BASE_URL = `https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/${soundfont}-mp3/`;
    const files: { [note: string]: string } = {};
    const OCTAVES_TO_LOAD = [2, 3, 4, 5, 6, 7]; // C2 to C7
    OCTAVES_TO_LOAD.forEach(octave => {
        NOTES.forEach(note => {
            const noteName = `${note}${octave}`;
            const fileNote = NOTE_TO_FILENAME_MAP[note];
            const fileName = `${fileNote}${octave}.mp3`;
            files[noteName] = `${SOUND_BASE_URL}${fileName}`;
        });
    });
    return files;
};

// --- Sound Engine Hook using Web Audio API ---
const usePianoSound = (soundfont: string) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
    const activeSourcesRef = useRef<Map<string, { source: AudioBufferSourceNode, gainNode: GainNode }>>(new Map());
    const [isLoaded, setIsLoaded] = useState(false);

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const mediaStreamDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        const initAudio = async () => {
            setIsLoaded(false);
            audioBuffersRef.current.clear();
            
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                masterGainRef.current = audioContextRef.current.createGain();
                masterGainRef.current.connect(audioContextRef.current.destination);
            }
            const audioContext = audioContextRef.current;
            const noteFiles = generateNoteFiles(soundfont);
            
            const loadPromises = Object.entries(noteFiles).map(async ([note, fileUrl]) => {
                try {
                    const response = await fetch(fileUrl);
                    if (!response.ok) return;
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await audioContext?.decodeAudioData(arrayBuffer);
                    if (audioBuffer) {
                        audioBuffersRef.current.set(note, audioBuffer);
                    }
                } catch (e) { /* Silently fail for missing notes */ }
            });
            await Promise.all(loadPromises);
            setIsLoaded(true);
        };
        initAudio();
    }, [soundfont]);

    useEffect(() => {
        return () => { audioContextRef.current?.close().catch(console.error); };
    }, []);

    const playNote = useCallback((note: string) => {
        const audioContext = audioContextRef.current;
        const masterGain = masterGainRef.current;
        const audioBuffer = audioBuffersRef.current.get(note);
        if (!audioContext || !masterGain || !audioBuffer) return;

        if (audioContext.state === 'suspended') { audioContext.resume(); }
        
        const existingSource = activeSourcesRef.current.get(note);
        if (existingSource) {
            try { existingSource.source.stop(); } catch(e) {/* ignore */}
        }

        const gainNode = audioContext.createGain();
        gainNode.connect(masterGain);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNode);
        source.start(0);
        
        source.onended = () => {
            activeSourcesRef.current.delete(note);
        };

        activeSourcesRef.current.set(note, { source, gainNode });
    }, []);
    
    const stopNote = useCallback((note: string, fadeOutDuration = 0.05) => {
        const activeSource = activeSourcesRef.current.get(note);
        const audioContext = audioContextRef.current;

        if (audioContext && activeSource) {
            try {
                activeSource.gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + fadeOutDuration);
                activeSource.source.stop(audioContext.currentTime + fadeOutDuration);
            } catch (e) { /* Can ignore errors */ }
            activeSourcesRef.current.delete(note);
        }
    }, []);

    const startRecording = useCallback(() => {
        if (isRecording || !audioContextRef.current || !masterGainRef.current) return;
        
        setRecordedAudioUrl(null);
        recordedChunksRef.current = [];

        mediaStreamDestinationRef.current = audioContextRef.current.createMediaStreamDestination();
        masterGainRef.current.connect(mediaStreamDestinationRef.current);

        mediaRecorderRef.current = new MediaRecorder(mediaStreamDestinationRef.current.stream);
        mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm;codecs=opus' });
            const url = URL.createObjectURL(blob);
            setRecordedAudioUrl(url);
            masterGainRef.current?.disconnect(mediaStreamDestinationRef.current!);
            mediaStreamDestinationRef.current = null;
        };
        
        mediaRecorderRef.current.start();
        setIsRecording(true);
    }, [isRecording]);

    const stopRecording = useCallback(() => {
        if (!isRecording || !mediaRecorderRef.current) return;
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }, [isRecording]);

    return { playNote, stopNote, isLoaded, isRecording, recordedAudioUrl, startRecording, stopRecording };
};

// --- Piano Component ---
const Piano: React.FC = () => {
  const [soundfont, setSoundfont] = useState('acoustic_grand_piano');
  const { playNote, stopNote, isLoaded, isRecording, recordedAudioUrl, startRecording, stopRecording } = usePianoSound(soundfont);
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [sustain, setSustain] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [sheetMusicImage, setSheetMusicImage] = useState<string | null>(null);
  const sheetMusicInputRef = useRef<HTMLInputElement>(null);

  const pianoKeys = useMemo(() => {
    const startOctave = 2;
    const octaves = [startOctave, startOctave + 1, startOctave + 2, startOctave + 3, startOctave + 4];
    return [
      ...octaves.flatMap(octave =>
        NOTES.map(note => ({
          note: `${note}${octave}`,
          type: note.includes('b') ? 'black' : 'white',
        }))
      ),
      { note: `C${startOctave + 5}`, type: 'white' }
    ];
  }, []);

  const whiteKeys = pianoKeys.filter(k => k.type === 'white');
  const whiteKeyCount = whiteKeys.length;

  const handleInteractionStart = useCallback((note: string) => {
    playNote(note);
    setActiveNotes(prev => new Set(prev).add(note));
  }, [playNote]);

  const handleInteractionEnd = useCallback((note: string) => {
    if (!sustain) {
        stopNote(note);
    }
    setActiveNotes(prev => {
      const newSet = new Set(prev);
      newSet.delete(note);
      return newSet;
    });
  }, [stopNote, sustain]);

  const handleKeyboardEvent = useCallback((event: KeyboardEvent, isDown: boolean) => {
    if (event.repeat) return;
    const keyForMap = event.shiftKey ? event.key : event.key.toLowerCase();
    const noteToPlay = KEY_TO_NOTE_MAP[keyForMap];

    if (noteToPlay) {
        event.preventDefault();
        if (isDown && !activeNotes.has(noteToPlay)) {
            handleInteractionStart(noteToPlay);
        } else if (!isDown) {
            handleInteractionEnd(noteToPlay);
        }
    }
  }, [activeNotes, handleInteractionStart, handleInteractionEnd]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handleKeyboardEvent(e, true);
    const onKeyUp = (e: KeyboardEvent) => handleKeyboardEvent(e, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleKeyboardEvent]);
    
  useEffect(() => {
    const handleMouseUp = () => {
        if (isMouseDown) {
            activeNotes.forEach(note => handleInteractionEnd(note));
            setIsMouseDown(false);
        }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMouseDown, activeNotes, handleInteractionEnd]);
    
  const handleSheetMusicUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            setSheetMusicImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-y-2 p-2 sm:p-4 bg-gray-900 rounded-t-lg text-white">
            <div className="flex items-center gap-2 sm:gap-4">
                <label htmlFor="soundfont-select" className="text-sm sm:text-base font-semibold hidden sm:inline">Instrument:</label>
                <select id="soundfont-select" value={soundfont} onChange={e => setSoundfont(e.target.value)} className="bg-gray-700 border border-gray-600 rounded-md p-1 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Select Piano Sound">
                    {SOUNDFONT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2"><span className="font-semibold text-sm sm:text-base">Labels</span><label className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={showLabels} onChange={() => setShowLabels(s => !s)} className="sr-only peer"/><div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div></label></div>
                <div className="flex items-center gap-2"><span className="font-semibold text-sm sm:text-base">Sustain</span><button onClick={() => setSustain(s => !s)} className={`sustain-toggle ${sustain ? 'active' : ''}`} aria-pressed={sustain}></button></div>
                <button onClick={isRecording ? stopRecording : startRecording} className={`control-btn !w-auto px-3 text-xs sm:text-sm ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`}>{isRecording ? 'Stop Rec' : 'Record'}</button>
            </div>
        </div>

        {sheetMusicImage && (
            <div className="relative p-2 bg-gray-800 text-center max-h-48">
                <img src={sheetMusicImage} alt="Sheet Music" className="max-h-44 w-auto inline-block"/>
                <button onClick={() => setSheetMusicImage(null)} className="absolute top-3 right-3 p-1 bg-black/50 rounded-full text-white"><CloseIcon className="w-5 h-5"/></button>
            </div>
        )}
        
        <div className="flex justify-center gap-4 p-2 bg-gray-800 border-y border-gray-700">
            <input type="file" accept="image/*" ref={sheetMusicInputRef} onChange={handleSheetMusicUpload} className="hidden" />
            <button onClick={() => sheetMusicInputRef.current?.click()} className="control-btn !w-auto px-3 text-xs sm:text-sm bg-gray-700">Attach Sheet Music</button>
            {recordedAudioUrl && <a href={recordedAudioUrl} download="piano-recording.webm" className="control-btn !w-auto px-3 text-xs sm:text-sm bg-green-600">Download Rec</a>}
        </div>

        <div className="relative w-full h-48 sm:h-64 select-none bg-gray-800 p-2 rounded-b-lg" onMouseDown={() => setIsMouseDown(true)}>
            <div className="relative w-full h-full flex">
                {whiteKeys.map(keyInfo => (
                    <div key={keyInfo.note} onMouseDown={() => handleInteractionStart(keyInfo.note)} onMouseUp={() => handleInteractionEnd(keyInfo.note)} onMouseEnter={() => isMouseDown && handleInteractionStart(keyInfo.note)} onMouseLeave={() => isMouseDown && activeNotes.has(keyInfo.note) && handleInteractionEnd(keyInfo.note)} onTouchStart={(e) => { e.preventDefault(); handleInteractionStart(keyInfo.note); }} onTouchEnd={(e) => { e.preventDefault(); handleInteractionEnd(keyInfo.note); }} className={`key white-key relative flex flex-col justify-end items-center pb-1 ${activeNotes.has(keyInfo.note) ? 'key-active' : ''}`}>
                        {showLabels && <span className="text-gray-500 text-[10px] sm:text-xs font-semibold pointer-events-none">{NOTE_TO_KEY_LABEL_MAP[keyInfo.note]}</span>}
                    </div>
                ))}
                {pianoKeys.map((keyInfo, index) => {
                    if (keyInfo.type === 'black') {
                        const precedingWhiteKeys = pianoKeys.slice(0, index).filter(k => k.type === 'white').length;
                        const whiteKeyWidthPercent = 100 / whiteKeyCount;
                        const blackKeyWidthPercent = whiteKeyWidthPercent * 0.58;
                        const leftPosition = `${precedingWhiteKeys * whiteKeyWidthPercent - blackKeyWidthPercent / 2}%`;
                        return (
                            <div key={keyInfo.note} onMouseDown={(e) => { e.stopPropagation(); handleInteractionStart(keyInfo.note); }} onMouseUp={(e) => { e.stopPropagation(); handleInteractionEnd(keyInfo.note); }} onMouseEnter={(e) => { e.stopPropagation(); isMouseDown && handleInteractionStart(keyInfo.note); }} onMouseLeave={(e) => { e.stopPropagation(); isMouseDown && activeNotes.has(keyInfo.note) && handleInteractionEnd(keyInfo.note); }} onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); handleInteractionStart(keyInfo.note); }} onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); handleInteractionEnd(keyInfo.note); }} className={`key black-key flex flex-col justify-end items-center pb-1 ${activeNotes.has(keyInfo.note) ? 'key-active' : ''}`} style={{ left: leftPosition, width: `${blackKeyWidthPercent}%` }}>
                                {showLabels && <span className="text-white text-[10px] sm:text-xs font-semibold pointer-events-none">{NOTE_TO_KEY_LABEL_MAP[keyInfo.note]}</span>}
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
            {!isLoaded && <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white rounded-lg"><p className="animate-pulse">Loading Sounds...</p></div>}
        </div>
        <style>{`
            .key { cursor: pointer; transition: all 0.07s ease; -webkit-tap-highlight-color: transparent; }
            .white-key { flex-grow: 1; background-color: #f8f8f8; border-left: 1px solid #ccc; border-bottom: 1px solid #ccc; border-right: 1px solid #ccc; border-radius: 0 0 5px 5px; box-shadow: inset 0 1px 0 white, inset 0 -1px 0 #bbb, 0 5px 3px -3px rgba(0,0,0,0.3); }
            .white-key:first-child { border-left: 1px solid #ccc; }
            .white-key.key-active { background-color: #e0e0e0; transform: translateY(1px); box-shadow: inset 0 1px 2px rgba(0,0,0,0.2); }
            .black-key { position: absolute; height: 60%; background-color: #333; background: linear-gradient(to right, #222, #444); z-index: 10; border-radius: 0 0 4px 4px; box-shadow: -1px 0 2px rgba(255,255,255,0.2) inset, 0 3px 5px rgba(0,0,0,0.5); border: 1px solid #000; }
            .black-key.key-active { background: #222; transform: translateY(1px); box-shadow: inset 0 2px 3px rgba(0,0,0,0.4); }
            .control-btn { background-color: #4a5568; border-radius: 6px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: 600; color: white; transition: background-color 0.2s; }
            .control-btn:hover:not(:disabled) { background-color: #718096; }
            .control-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .sustain-toggle { width: 20px; height: 20px; border: 2px solid #718096; background-color: #4a5568; cursor: pointer; transition: all 0.2s; }
            .sustain-toggle.active { background-color: #a0aec0; border-color: #fff; }
        `}</style>
    </div>
  );
};

export default Piano;
