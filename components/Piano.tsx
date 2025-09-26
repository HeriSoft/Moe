import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Constants ---
const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const OCTAVE_RANGE = [3, 4, 5];
// FIX: Switched to a more reliable and complete soundfont from gleitz/midi-js-soundfonts
const SOUND_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/';

// FIX: Map for converting note names (e.g., Db) to filename-compatible names (e.g., Cs for C-sharp)
const NOTE_TO_FILENAME_MAP: { [note: string]: string } = {
    'C': 'C', 'Db': 'Cs', 'D': 'D', 'Eb': 'Ds', 'E': 'E',
    'F': 'F', 'Gb': 'Fs', 'G': 'G', 'Ab': 'Gs', 'A': 'A',
    'Bb': 'As', 'B': 'B'
};

const PIANO_KEYS = OCTAVE_RANGE.flatMap(octave =>
  NOTES.map(note => ({
    note: `${note}${octave}`,
    type: note.includes('b') ? 'black' : 'white',
  }))
);

const KEY_TO_NOTE_MAP: { [key: string]: { note: string; octaveOffset: number } } = {
  // Bottom row - Base Octave
  'z': { note: 'C', octaveOffset: 0 }, 's': { note: 'Db', octaveOffset: 0 },
  'x': { note: 'D', octaveOffset: 0 }, 'd': { note: 'Eb', octaveOffset: 0 },
  'c': { note: 'E', octaveOffset: 0 }, 'v': { note: 'F', octaveOffset: 0 },
  'g': { note: 'Gb', octaveOffset: 0 }, 'b': { note: 'G', octaveOffset: 0 },
  'h': { note: 'Ab', octaveOffset: 0 }, 'n': { note: 'A', octaveOffset: 0 },
  'j': { note: 'Bb', octaveOffset: 0 }, 'm': { note: 'B', octaveOffset: 0 },
  // Top row - Next Octave
  'q': { note: 'C', octaveOffset: 1 }, '2': { note: 'Db', octaveOffset: 1 },
  'w': { note: 'D', octaveOffset: 1 }, '3': { note: 'Eb', octaveOffset: 1 },
  'e': { note: 'E', octaveOffset: 1 }, 'r': { note: 'F', octaveOffset: 1 },
  '5': { note: 'Gb', octaveOffset: 1 }, 't': { note: 'G', octaveOffset: 1 },
  '6': { note: 'Ab', octaveOffset: 1 }, 'y': { note: 'A', octaveOffset: 1 },
  '7': { note: 'Bb', octaveOffset: 1 }, 'u': { note: 'B', octaveOffset: 1 },
};

const generateNoteFiles = () => {
    const files: { [note: string]: string } = {};
    [...OCTAVE_RANGE, 6].forEach(octave => { // Preload up to C6
        NOTES.forEach(note => {
            const noteName = `${note}${octave}`;
            const fileNote = NOTE_TO_FILENAME_MAP[note];
            const fileName = `${fileNote}${octave}.mp3`;
            files[noteName] = `${SOUND_BASE_URL}${fileName}`;
        });
    });
    return files;
};
const allNoteFiles = generateNoteFiles();

// --- Sound Engine Hook using Web Audio API ---
const usePianoSound = () => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
    const activeSourcesRef = useRef<Map<string, { source: AudioBufferSourceNode, gainNode: GainNode }>>(new Map());
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const initAudio = async () => {
            try {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                
                const loadPromises = Object.entries(allNoteFiles).map(async ([note, fileUrl]) => {
                    try {
                        const response = await fetch(fileUrl);
                        if (!response.ok) return;
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await audioContextRef.current?.decodeAudioData(arrayBuffer);
                        if (audioBuffer) {
                            audioBuffersRef.current.set(note, audioBuffer);
                        }
                    } catch (e) { /* Silently fail for missing notes */ }
                });
                await Promise.all(loadPromises);
                setIsLoaded(true);
            } catch (e) {
                console.error("Failed to initialize AudioContext", e);
            }
        };
        initAudio();
        return () => { audioContextRef.current?.close().catch(console.error); };
    }, []);

    const playNote = useCallback((note: string) => {
        const audioContext = audioContextRef.current;
        const audioBuffer = audioBuffersRef.current.get(note);
        if (!audioContext || !audioBuffer) return;

        if (audioContext.state === 'suspended') { audioContext.resume(); }

        const gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNode);
        source.start(0);

        activeSourcesRef.current.set(note, { source, gainNode });
    }, []);
    
    const stopNote = useCallback((note: string, fadeOutDuration = 0.05) => {
        const activeSource = activeSourcesRef.current.get(note);
        const audioContext = audioContextRef.current;

        if (audioContext && activeSource) {
            activeSource.gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + fadeOutDuration);
            activeSource.source.stop(audioContext.currentTime + fadeOutDuration);
            activeSourcesRef.current.delete(note);
        }
    }, []);

    return { playNote, stopNote, isLoaded };
};

// --- Piano Component ---
const Piano: React.FC = () => {
  const { playNote, stopNote, isLoaded } = usePianoSound();
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());
  const [octave, setOctave] = useState(3);
  const [sustain, setSustain] = useState(false);

  const whiteKeys = PIANO_KEYS.filter(k => k.type === 'white');
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
    const keyInfo = KEY_TO_NOTE_MAP[event.key.toLowerCase()];
    if (keyInfo) {
      const targetOctave = octave + keyInfo.octaveOffset;
      const noteToPlay = `${keyInfo.note}${targetOctave}`;
      if (allNoteFiles[noteToPlay]) {
        if (isDown) {
            handleInteractionStart(noteToPlay);
        } else {
            handleInteractionEnd(noteToPlay);
        }
      }
    }
  }, [octave, handleInteractionStart, handleInteractionEnd]);

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
  
  return (
    <div className="w-full">
      <div className="flex items-center justify-between p-2 sm:p-4 bg-gray-900 rounded-t-lg text-white">
        <div className="text-sm sm:text-base font-semibold">
          1 : Acoustic Grand Piano
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="font-semibold text-sm sm:text-base">Oct</span>
            <button onClick={() => setOctave(o => Math.max(2, o - 1))} className="control-btn">-</button>
            <span className="font-bold w-4 text-center text-sm sm:text-base">{octave}</span>
            <button onClick={() => setOctave(o => Math.min(4, o + 1))} className="control-btn">+</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm sm:text-base">Sustain</span>
            <button onClick={() => setSustain(s => !s)} className={`sustain-toggle ${sustain ? 'active' : ''}`}></button>
          </div>
        </div>
      </div>

      <div className="relative w-full h-48 sm:h-64 select-none bg-gray-800 p-2 rounded-b-lg">
        <div className="relative w-full h-full flex">
          {whiteKeys.map(keyInfo => (
            <div
              key={keyInfo.note}
              onMouseDown={() => handleInteractionStart(keyInfo.note)}
              onMouseUp={() => handleInteractionEnd(keyInfo.note)}
              onMouseLeave={() => activeNotes.has(keyInfo.note) && handleInteractionEnd(keyInfo.note)}
              onTouchStart={() => handleInteractionStart(keyInfo.note)}
              onTouchEnd={() => handleInteractionEnd(keyInfo.note)}
              className={`key white-key relative flex flex-col justify-end items-center ${activeNotes.has(keyInfo.note) ? 'key-active' : ''}`}
            >
                {/* FIX: Removed keyboard shortcut labels per user request */}
            </div>
          ))}
          {PIANO_KEYS.map((keyInfo, index) => {
            if (keyInfo.type === 'black') {
              const precedingWhiteKeys = PIANO_KEYS.slice(0, index).filter(k => k.type === 'white').length;
              const whiteKeyWidthPercent = 100 / whiteKeyCount;
              const blackKeyWidthPercent = whiteKeyWidthPercent * 0.58; // FIX: Adjusted width for better aesthetics
              const leftPosition = `${precedingWhiteKeys * whiteKeyWidthPercent - blackKeyWidthPercent / 2}%`;
              
              return (
                <div
                  key={keyInfo.note}
                  onMouseDown={(e) => { e.stopPropagation(); handleInteractionStart(keyInfo.note); }}
                  onMouseUp={(e) => { e.stopPropagation(); handleInteractionEnd(keyInfo.note); }}
                  onMouseLeave={(e) => { e.stopPropagation(); activeNotes.has(keyInfo.note) && handleInteractionEnd(keyInfo.note); }}
                  onTouchStart={(e) => { e.stopPropagation(); handleInteractionStart(keyInfo.note); }}
                  onTouchEnd={(e) => { e.stopPropagation(); handleInteractionEnd(keyInfo.note); }}
                  className={`key black-key ${activeNotes.has(keyInfo.note) ? 'key-active' : ''}`}
                  style={{ left: leftPosition, width: `${blackKeyWidthPercent}%` }}
                />
              );
            }
            return null;
          })}
        </div>
        {!isLoaded && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white rounded-lg">
                <p className="animate-pulse">Loading Sounds...</p>
            </div>
        )}
      </div>
      {/* FIX: Overhauled CSS for a more realistic and visually correct piano appearance */}
      <style>{`
        .key {
          cursor: pointer;
          transition: all 0.07s ease;
          -webkit-tap-highlight-color: transparent; /* Prevent flash on mobile taps */
        }
        .white-key {
          flex-grow: 1;
          background-color: #f8f8f8;
          border-left: 1px solid #ccc;
          border-bottom: 1px solid #ccc;
          border-right: 1px solid #ccc;
          border-radius: 0 0 5px 5px;
          box-shadow: inset 0 1px 0 white, inset 0 -1px 0 #bbb, 0 5px 3px -3px rgba(0,0,0,0.3);
        }
        .white-key:first-child {
            border-left: 1px solid #ccc;
        }
        .white-key.key-active {
          background-color: #e0e0e0;
          transform: translateY(1px);
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
        }
        .black-key {
          position: absolute;
          height: 60%;
          background-color: #333;
          background: linear-gradient(to right, #222, #444);
          z-index: 10;
          border-radius: 0 0 4px 4px;
          box-shadow: -1px 0 2px rgba(255,255,255,0.2) inset, 0 3px 5px rgba(0,0,0,0.5);
          border: 1px solid #000;
        }
        .black-key.key-active {
          background: #222;
          transform: translateY(1px);
          box-shadow: inset 0 2px 3px rgba(0,0,0,0.4);
        }
        .control-btn {
            background-color: #4a5568;
            border-radius: 4px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }
        .sustain-toggle {
            width: 20px;
            height: 20px;
            border: 2px solid #718096;
            background-color: #4a5568;
            cursor: pointer;
            transition: all 0.2s;
        }
        .sustain-toggle.active {
            background-color: #a0aec0;
            border-color: #fff;
        }
      `}</style>
    </div>
  );
};

export default Piano;
