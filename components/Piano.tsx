import React, { useState, useEffect, useRef, useCallback } from 'react';

// Using publicly available sound files to avoid needing local assets.
const SOUND_BASE_URL = 'https://cdn.jsdelivr.net/gh/ryo-ma/github-profile-trophy@master/src/sound/piano/';

const KEYS = [
  { key: 'a', note: 'C4', type: 'white', soundFile: `${SOUND_BASE_URL}C4.mp3` },
  { key: 'w', note: 'Db4', type: 'black', soundFile: `${SOUND_BASE_URL}Db4.mp3` },
  { key: 's', note: 'D4', type: 'white', soundFile: `${SOUND_BASE_URL}D4.mp3` },
  { key: 'e', note: 'Eb4', type: 'black', soundFile: `${SOUND_BASE_URL}Eb4.mp3` },
  { key: 'd', note: 'E4', type: 'white', soundFile: `${SOUND_BASE_URL}E4.mp3` },
  { key: 'f', note: 'F4', type: 'white', soundFile: `${SOUND_BASE_URL}F4.mp3` },
  { key: 't', note: 'Gb4', type: 'black', soundFile: `${SOUND_BASE_URL}Gb4.mp3` },
  { key: 'g', note: 'G4', type: 'white', soundFile: `${SOUND_BASE_URL}G4.mp3` },
  { key: 'y', note: 'Ab4', type: 'black', soundFile: `${SOUND_BASE_URL}Ab4.mp3` },
  { key: 'h', note: 'A4', type: 'white', soundFile: `${SOUND_BASE_URL}A4.mp3` },
  { key: 'u', note: 'Bb4', type: 'black', soundFile: `${SOUND_BASE_URL}Bb4.mp3` },
  { key: 'j', note: 'B4', type: 'white', soundFile: `${SOUND_BASE_URL}B4.mp3` },
  { key: 'k', note: 'C5', type: 'white', soundFile: `${SOUND_BASE_URL}C5.mp3` },
];

const Piano: React.FC = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const audioObjects = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Preload audio files
  useEffect(() => {
    KEYS.forEach(keyInfo => {
      const audio = new Audio(keyInfo.soundFile);
      audio.preload = 'auto';
      audioObjects.current.set(keyInfo.note, audio);
    });
  }, []);

  const playNote = useCallback((note: string) => {
    const audio = audioObjects.current.get(note);
    if (audio) {
      audio.currentTime = 0; // Rewind to the start
      audio.play().catch(e => console.error("Audio playback error:", e));
    }
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.repeat) return;
    const keyInfo = KEYS.find(k => k.key === event.key.toLowerCase());
    if (keyInfo) {
      playNote(keyInfo.note);
      setActiveKeys(prev => new Set(prev).add(keyInfo.note));
    }
  }, [playNote]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const keyInfo = KEYS.find(k => k.key === event.key.toLowerCase());
    if (keyInfo) {
      setActiveKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(keyInfo.note);
        return newSet;
      });
    }
  }, []);
  
  const handleMouseDown = useCallback((note: string) => {
    playNote(note);
    setActiveKeys(prev => new Set(prev).add(note));
  }, [playNote]);

  const handleMouseUpOrLeave = useCallback((note: string) => {
    setActiveKeys(prev => {
      const newSet = new Set(prev);
      newSet.delete(note);
      return newSet;
    });
  }, []);


  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const whiteKeys = KEYS.filter(k => k.type === 'white');
  const blackKeys = KEYS.filter(k => k.type === 'black');

  return (
    <div className="relative w-full h-48 sm:h-64 select-none bg-gray-800 p-2 rounded-b-lg">
      <div className="relative w-full h-full flex">
        {whiteKeys.map(keyInfo => (
          <div
            key={keyInfo.note}
            onMouseDown={() => handleMouseDown(keyInfo.note)}
            onMouseUp={() => handleMouseUpOrLeave(keyInfo.note)}
            onMouseLeave={() => handleMouseUpOrLeave(keyInfo.note)}
            onTouchStart={() => handleMouseDown(keyInfo.note)}
            onTouchEnd={() => handleMouseUpOrLeave(keyInfo.note)}
            className={`key white-key ${activeKeys.has(keyInfo.note) ? 'key-active' : ''}`}
          >
            <span className="key-label">{keyInfo.key.toUpperCase()}</span>
          </div>
        ))}
        {blackKeys.map(keyInfo => {
          const whiteKeyIndex = whiteKeys.findIndex(wk => wk.note.startsWith(keyInfo.note.charAt(0)));
          return (
            <div
              key={keyInfo.note}
              onMouseDown={() => handleMouseDown(keyInfo.note)}
              onMouseUp={() => handleMouseUpOrLeave(keyInfo.note)}
              onMouseLeave={() => handleMouseUpOrLeave(keyInfo.note)}
              onTouchStart={() => handleMouseDown(keyInfo.note)}
              onTouchEnd={() => handleMouseUpOrLeave(keyInfo.note)}
              className={`key black-key ${activeKeys.has(keyInfo.note) ? 'key-active' : ''}`}
              style={{ left: `${(whiteKeyIndex + 0.68) * (100 / whiteKeys.length)}%` }}
            >
              <span className="key-label text-white">{keyInfo.key.toUpperCase()}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        .key {
          border: 1px solid black;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
          padding-bottom: 8px;
          user-select: none;
          cursor: pointer;
        }
        .white-key {
          flex-grow: 1;
          background-color: white;
          color: #333;
        }
        .black-key {
          position: absolute;
          width: 58%;
          height: 60%;
          background-color: #222;
          z-index: 10;
          transform: translateX(-50%);
          border-radius: 0 0 5px 5px;
        }
        .key-label {
          font-weight: bold;
          font-size: 0.8rem;
          color: #aaa;
        }
        .key.key-active {
          background-color: #ccc;
        }
        .black-key.key-active {
          background-color: #444;
        }
      `}</style>
    </div>
  );
};

export default Piano;
