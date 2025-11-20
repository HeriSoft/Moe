
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon, CameraIcon, DownloadIcon, StopCircleIcon, PlayIcon, SparklesIcon, LanguageIcon } from './icons';
import type { UserProfile } from '../types';
import { generateInterviewQuestion } from '../services/geminiService';

interface VideoInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

type AspectRatio = '9/16' | '16/9' | '3/4' | '1/1';

const LANGUAGES = [
    { code: 'vi-VN', label: 'Tiếng Việt' },
    { code: 'en-US', label: 'Tiếng Anh' },
    { code: 'ja-JP', label: 'Tiếng Nhật' },
    { code: 'zh-CN', label: 'Tiếng Trung' },
    { code: 'ko-KR', label: 'Tiếng Hàn' },
    { code: 'ru-RU', label: 'Tiếng Nga' },
    { code: 'th-TH', label: 'Tiếng Thái' },
];

export const VideoInterviewModal: React.FC<VideoInterviewModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9/16');
  const [aiPrompt, setAiPrompt] = useState("Hãy bắt đầu bằng việc giới thiệu về bản thân bạn...");
  const [aiSubtitle, setAiSubtitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  
  // Settings State
  const [spokenLanguage, setSpokenLanguage] = useState('vi-VN');
  const [targetLanguage, setTargetLanguage] = useState('Tiếng Việt');
  const [subtitleLanguage, setSubtitleLanguage] = useState('Tiếng Việt');
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastAiUpdateRef = useRef<number>(0);

  useEffect(() => {
      const checkOrientation = () => {
          const isMobile = window.matchMedia("(pointer: coarse)").matches || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const isPortrait = window.innerHeight > window.innerWidth;
          setIsMobilePortrait(isMobile && isPortrait);
      };
      checkOrientation();
      window.addEventListener('resize', checkOrientation);
      return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  const getCanvasDimensions = useCallback(() => {
      // Base height 1080p roughly
      const height = 1080;
      let width = 1920;
      
      switch(aspectRatio) {
          case '9/16': width = height * (9/16); break;
          case '16/9': width = height * (16/9); break;
          case '3/4': width = height * (3/4); break;
          case '1/1': width = height; break;
      }
      return { width, height };
  }, [aspectRatio]);

  const drawToCanvas = useCallback(() => {
      if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
      }
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (!video || !canvas || !ctx) return;
      
      const { width, height } = getCanvasDimensions();
      canvas.width = width;
      canvas.height = height;

      const render = () => {
          if (!video || video.paused || video.ended || video.videoWidth === 0) {
              animationRef.current = requestAnimationFrame(render);
              return;
          }
          
          const videoRatio = video.videoWidth / video.videoHeight;
          const canvasRatio = canvas.width / canvas.height;
          
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = video.videoWidth;
          let sourceHeight = video.videoHeight;

          // Cover logic: crop the video to fill the canvas without distortion.
          if (videoRatio > canvasRatio) {
              // Video is wider than canvas, crop sides
              sourceWidth = video.videoHeight * canvasRatio;
              sourceX = (video.videoWidth - sourceWidth) / 2;
          } else {
              // Video is taller than canvas, crop top/bottom
              sourceHeight = video.videoWidth / canvasRatio;
              sourceY = (video.videoHeight - sourceHeight) / 2;
          }
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          
          animationRef.current = requestAnimationFrame(render);
      };
      render();
  }, [getCanvasDimensions]);


  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.onplaying = null;
    }
    if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Trình duyệt của bạn không hỗ trợ truy cập Camera/Microphone.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" }, 
        audio: true 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onplaying = drawToCanvas;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Error accessing camera/mic:", err);
      let errorMessage = "Không thể truy cập camera hoặc micro.";
      
      if (err.name === 'NotFoundError' || err.message?.includes('device not found')) {
          errorMessage = "Không tìm thấy driver microphone hoặc camera. Vui lòng kiểm tra kết nối thiết bị.";
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessage = "Quyền truy cập bị từ chối. Vui lòng cấp quyền camera/mic cho trang web trong cài đặt trình duyệt.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMessage = "Thiết bị đang được sử dụng bởi ứng dụng khác hoặc bị lỗi phần cứng.";
      }
      
      alert(errorMessage);
      onClose(); // Close modal if camera fails
    }
  }, [drawToCanvas, onClose]);

  const stopSpeechRecognition = useCallback(() => {
      if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
      }
  }, []);

  const setupSpeechRecognition = useCallback(() => {
    stopSpeechRecognition(); // Ensure any previous instance is stopped
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = spokenLanguage; // Use state

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
             finalTranscript += event.results[i][0].transcript + ' ';
          } else {
             interim += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript.trim()) {
            setTranscript(prev => (prev + " " + finalTranscript).trim());
        }
        setInterimTranscript(interim);
      };

      recognition.onend = () => {
          // Restart recognition if it stops unexpectedly while the modal is open
          if (isOpen && recognitionRef.current) {
              try { recognition.start(); } catch (e) { /* ignore */ }
          }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.error("Speech recognition start failed", e);
      }
    }
  }, [isOpen, stopSpeechRecognition, spokenLanguage]);

  // Main lifecycle effect
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset all state when opening to ensure a fresh session
      setIsRecording(false);
      setRecordedBlob(null);
      setAiPrompt("Hãy bắt đầu bằng việc giới thiệu về bản thân bạn...");
      setAiSubtitle("");
      setTranscript("");
      setInterimTranscript("");
      lastAiUpdateRef.current = 0;

      startCamera();
      setupSpeechRecognition();
    } else {
      document.body.style.overflow = 'auto';
      stopCamera();
      stopSpeechRecognition();
    }
    return () => {
        stopCamera();
        stopSpeechRecognition();
    };
  }, [isOpen, startCamera, stopCamera, setupSpeechRecognition, stopSpeechRecognition]);
  
  // Effect to handle aspect ratio changes dynamically
  useEffect(() => {
      if (isOpen && videoRef.current?.HAVE_METADATA) {
          drawToCanvas();
      }
  }, [aspectRatio, isOpen, drawToCanvas]);

  // AI Question Logic
  useEffect(() => {
    if (!transcript || !isOpen) return;
    
    const now = Date.now();
    if (now - lastAiUpdateRef.current > 8000) { // Check every 8 seconds
        lastAiUpdateRef.current = now;
        const context = transcript.slice(-300); 
        // Pass targetLanguage and subtitleLanguage (if shown)
        generateInterviewQuestion(context, userProfile, targetLanguage, showSubtitle ? subtitleLanguage : targetLanguage)
            .then(result => {
                if (result.question) {
                    setAiPrompt(result.question);
                    if (showSubtitle && result.subtitle) {
                        setAiSubtitle(result.subtitle);
                    } else {
                        setAiSubtitle("");
                    }
                }
            });
    }
  }, [transcript, userProfile, isOpen, targetLanguage, subtitleLanguage, showSubtitle]);

  const startRecording = () => {
      if (!canvasRef.current || !streamRef.current) return;
      
      const canvasStream = canvasRef.current.captureStream(30);
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
          canvasStream.addTrack(audioTracks[0]);
      }

      const mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp9' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
          setRecordedBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordedBlob(null);
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  const handleDownload = () => {
      if (recordedBlob) {
          const url = URL.createObjectURL(recordedBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `interview_${Date.now()}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-hidden" onClick={onClose}>
      <div 
        className={`transition-all duration-300 shadow-2xl flex flex-col overflow-hidden border border-orange-100/50 bg-[#fff5f0] dark:bg-[#2a2522]
           ${isMobilePortrait 
             ? 'fixed w-[100vh] h-[100vw] origin-center rotate-90 rounded-none' 
             : 'w-full max-w-6xl h-[90vh] rounded-3xl relative'}`
        }
        style={isMobilePortrait ? { left: '50%', top: '50%', translate: '-50% -50%' } : {}}
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex-shrink-0 flex justify-between items-center p-4 sm:p-6 border-b border-orange-100/50 dark:border-white/10">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-orange-50">
                <CameraIcon className="w-8 h-8 text-yellow-500" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-500 to-pink-500">Video Interview AI</span>
            </h2>
            <button onClick={onClose} className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-600 transition-colors shadow-sm"><CloseIcon className="w-6 h-6" /></button>
        </div>

        {/* Main Content */}
        <div className="flex-grow flex flex-col md:flex-row min-h-0 p-6 gap-6">
            
            {/* Video Area */}
            <div className="flex-grow relative flex items-center justify-center bg-black rounded-2xl overflow-hidden shadow-inner shadow-black/50 min-h-0 group">
                <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted autoPlay />
                <canvas 
                    ref={canvasRef} 
                    className="max-w-full max-h-full object-contain"
                    style={{ aspectRatio: aspectRatio.replace('/', '/') }}
                />
                
                {/* Subtitles Overlay (User Speech) */}
                {(interimTranscript || transcript) && (
                    <div className="absolute top-8 left-0 right-0 text-center px-8 pointer-events-none">
                        <span className="inline-block bg-black/50 backdrop-blur-sm text-white/90 px-3 py-1 rounded-lg text-sm font-medium shadow-sm">
                            {interimTranscript || transcript.split(' ').slice(-10).join(' ')}
                        </span>
                    </div>
                )}

                {/* AI Prompt & Subtitle Overlay */}
                <div className="absolute bottom-10 left-0 right-0 px-8 text-center">
                    <div className="inline-block bg-black/60 backdrop-blur-md text-white px-6 py-4 rounded-2xl border border-white/10 shadow-xl max-w-2xl animate-fade-in-up">
                        <div className="flex items-center justify-center gap-2 mb-1 text-yellow-400 text-xs font-bold uppercase tracking-wider">
                            <SparklesIcon className="w-4 h-4" /> AI Interviewer
                        </div>
                        <p className="text-lg md:text-xl font-medium leading-relaxed">"{aiPrompt}"</p>
                        {showSubtitle && aiSubtitle && (
                            <p className="text-sm md:text-base text-yellow-300 mt-2 font-medium italic border-t border-white/20 pt-2">
                                {aiSubtitle}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Controls Sidebar */}
            <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto">
                
                {/* Recording Controls */}
                <div className="bg-white dark:bg-white/5 p-6 rounded-2xl shadow-sm border border-orange-100 dark:border-white/5 flex flex-col items-center gap-4">
                    <div className="text-center">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-4">{isRecording ? "Đang ghi hình..." : "Sẵn sàng"}</p>
                        <button 
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${isRecording ? 'bg-red-500 hover:bg-red-600 scale-110 ring-4 ring-red-200' : 'bg-yellow-400 hover:bg-yellow-500 text-white'}`}
                        >
                            {isRecording ? <div className="w-8 h-8 bg-white rounded-md" /> : <div className="w-8 h-8 bg-white rounded-full" />}
                        </button>
                    </div>
                    
                    {recordedBlob && !isRecording && (
                        <button onClick={handleDownload} className="w-full py-3 px-4 bg-slate-800 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors">
                            <DownloadIcon className="w-5 h-5" /> Tải Video
                        </button>
                    )}
                </div>

                {/* Language Settings */}
                <div className="bg-white dark:bg-white/5 p-4 rounded-2xl shadow-sm border border-orange-100 dark:border-white/5">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className="w-full flex justify-between items-center text-slate-700 dark:text-slate-200 font-semibold mb-2"
                    >
                        <span className="flex items-center gap-2"><LanguageIcon className="w-5 h-5 text-indigo-500"/> Language Settings</span>
                        <span className="text-xs text-slate-400">{showSettings ? 'Hide' : 'Show'}</span>
                    </button>
                    
                    {showSettings && (
                        <div className="space-y-3 mt-3 animate-fade-in text-sm">
                            <div>
                                <label className="block text-slate-500 dark:text-slate-400 text-xs mb-1">My Language (Mic)</label>
                                <select 
                                    value={spokenLanguage} 
                                    onChange={(e) => { setSpokenLanguage(e.target.value); setupSpeechRecognition(); }}
                                    className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
                                >
                                    {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-slate-500 dark:text-slate-400 text-xs mb-1">AI Answer Language</label>
                                <select 
                                    value={targetLanguage} 
                                    onChange={(e) => setTargetLanguage(e.target.value)}
                                    className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
                                >
                                    {LANGUAGES.map(l => <option key={l.code} value={l.label}>{l.label}</option>)}
                                </select>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                <label className="text-slate-700 dark:text-slate-300 text-xs font-medium">Translate subtitles</label>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={showSubtitle} onChange={e => setShowSubtitle(e.target.checked)} className="sr-only peer" />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                                </label>
                            </div>
                            {showSubtitle && (
                                <div>
                                    <label className="block text-slate-500 dark:text-slate-400 text-xs mb-1">Subtitle Language</label>
                                    <select 
                                        value={subtitleLanguage} 
                                        onChange={(e) => setSubtitleLanguage(e.target.value)}
                                        className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
                                    >
                                        {LANGUAGES.map(l => <option key={l.code} value={l.label}>{l.label}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Aspect Ratio Selector */}
                <div className="bg-white dark:bg-white/5 p-6 rounded-2xl shadow-sm border border-orange-100 dark:border-white/5">
                    <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">Kích thước khung hình</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {(['9/16', '16/9', '3/4', '1/1'] as AspectRatio[]).map((ratio) => (
                            <button
                                key={ratio}
                                onClick={() => setAspectRatio(ratio)}
                                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${aspectRatio === ratio ? 'bg-yellow-100 border-yellow-400 text-yellow-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                                {ratio.replace('/', ':')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
