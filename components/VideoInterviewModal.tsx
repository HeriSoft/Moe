import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CloseIcon, CameraIcon, DownloadIcon, StopCircleIcon, PlayIcon, SparklesIcon } from './icons';
import type { UserProfile } from '../types';
import { generateInterviewQuestion } from '../services/geminiService';

interface VideoInterviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

type AspectRatio = '9/16' | '16/9' | '3/4' | '1/1';

export const VideoInterviewModal: React.FC<VideoInterviewModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9/16');
  const [aiPrompt, setAiPrompt] = useState("Hãy bắt đầu bằng việc giới thiệu về bản thân bạn...");
  const [transcript, setTranscript] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastAiUpdateRef = useRef<number>(0);

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
      if (!videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
      }
      
      const { width, height } = getCanvasDimensions();
      canvas.width = width;
      canvas.height = height;

      const render = () => {
          if (!video || video.paused || video.ended || !ctx) {
              animationRef.current = requestAnimationFrame(render);
              return;
          }
          
          const vRatio = video.videoWidth / video.videoHeight;
          const cRatio = canvas.width / canvas.height;
          let sx, sy, sWidth, sHeight;

          if (vRatio > cRatio) {
              sHeight = video.videoHeight;
              sWidth = sHeight * cRatio;
              sx = (video.videoWidth - sWidth) / 2;
              sy = 0;
          } else {
              sWidth = video.videoWidth;
              sHeight = sWidth / cRatio;
              sx = 0;
              sy = (video.videoHeight - sHeight) / 2;
          }
          
          ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
          
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
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.");
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

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
             finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript.trim()) {
            setTranscript(prev => (prev + " " + finalTranscript).trim());
        }
      };

      recognition.onend = () => {
          // Restart recognition if it stops unexpectedly while the modal is open
          if (isOpen && recognitionRef.current) {
              try { recognition.start(); } catch (e) { /* ignore */ }
          }
      };

      recognition.start();
      recognitionRef.current = recognition;
    }
  }, [isOpen, stopSpeechRecognition]);

  // Main lifecycle effect
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset all state when opening
      setIsRecording(false);
      setRecordedBlob(null);
      setAiPrompt("Hãy bắt đầu bằng việc giới thiệu về bản thân bạn...");
      setTranscript("");
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
        const context = transcript.slice(-200); 
        generateInterviewQuestion(context, userProfile).then(question => {
            if (question) setAiPrompt(question);
        });
    }
  }, [transcript, userProfile, isOpen]);

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
    <div className="fixed inset-0 bg-stone-900/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#fff5f0] dark:bg-[#2a2522] rounded-3xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-orange-100/50 relative" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 sm:p-6 bg-white/50 dark:bg-black/20 backdrop-blur-md absolute top-0 left-0 right-0 z-20 rounded-t-3xl">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-orange-50">
                <CameraIcon className="w-8 h-8 text-yellow-500" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-500 to-pink-500">Video Interview AI</span>
            </h2>
            <button onClick={onClose} className="p-2 rounded-full bg-white/80 hover:bg-white text-slate-600 transition-colors shadow-sm"><CloseIcon className="w-6 h-6" /></button>
        </div>

        {/* Main Content */}
        <div className="flex-grow flex flex-col md:flex-row h-full pt-20 pb-6 px-6 gap-6">
            
            {/* Video Area */}
            <div className="flex-grow relative flex items-center justify-center bg-black rounded-2xl overflow-hidden shadow-inner shadow-black/50">
                <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted autoPlay />
                <canvas 
                    ref={canvasRef} 
                    className="max-w-full max-h-full object-contain"
                    style={{ aspectRatio: aspectRatio.replace('/', '/') }}
                />
                
                {/* AI Prompt Overlay */}
                <div className="absolute bottom-10 left-0 right-0 px-8 text-center">
                    <div className="inline-block bg-black/60 backdrop-blur-md text-white px-6 py-4 rounded-2xl border border-white/10 shadow-xl max-w-2xl animate-fade-in-up">
                        <div className="flex items-center justify-center gap-2 mb-1 text-yellow-400 text-xs font-bold uppercase tracking-wider">
                            <SparklesIcon className="w-4 h-4" /> AI Interviewer
                        </div>
                        <p className="text-lg md:text-xl font-medium leading-relaxed">"{aiPrompt}"</p>
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

                {/* Tips */}
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 p-6 rounded-2xl border border-yellow-100 dark:border-white/5">
                    <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5" /> Tips
                    </h3>
                    <p className="text-sm text-yellow-700/80 dark:text-yellow-200/70 leading-relaxed">
                        Hãy nói chuyện tự nhiên. AI sẽ lắng nghe và gợi ý câu hỏi tiếp theo để câu chuyện của bạn luôn liền mạch.
                    </p>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};
