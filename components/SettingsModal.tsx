

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CloseIcon, SpeakerWaveIcon, StopCircleIcon, TicketIcon, ClockIcon } from './icons';
import type { UserProfile, PaymentHistoryItem } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';

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

interface RenewalPlan {
  days: number;
  price: number;
  name: string;
}

interface PaymentSettings {
  bankQrId?: string;
  momoQrId?: string;
  memoFormat?: string;
  price30?: number;
  price90?: number;
  price360?: number;
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

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`flex-1 p-3 text-sm font-semibold border-b-2 transition-colors ${
        active
          ? 'border-indigo-500 text-indigo-500'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {children}
    </button>
);


// --- MAIN SETTINGS MODAL COMPONENT ---

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, setIsDarkMode, model, setModel, chatBgColor, setChatBgColor, userProfile, setNotifications }) => {
  const [view, setView] = useState<'main' | 'membership' | 'renew_payment'>('main');

  // --- States for microphone settings ---
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  
  // --- States for Membership Management ---
  const [membershipData, setMembershipData] = useState<{ history: PaymentHistoryItem[], status: string, expiresAt: string | null } | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [isMembershipLoading, setIsMembershipLoading] = useState(false);
  const [renewalPlan, setRenewalPlan] = useState<RenewalPlan | null>(null);

  // --- Refs for audio components and animations ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const isMember = userProfile?.isPro || (userProfile?.subscriptionExpiresAt && new Date(userProfile.subscriptionExpiresAt) > new Date());

  // --- Function to stop all microphone activity and clean up ---
  const stopMic = useCallback(() => {
    if (liveAudioRef.current) { liveAudioRef.current.pause(); liveAudioRef.current.srcObject = null; }
    setIsListening(false);
    if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); }
    setIsRecording(false);
    if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
    setAudioLevel(0);
    if (audioContextRef.current?.state !== 'closed') { audioContextRef.current.close().catch(console.error); audioContextRef.current = null; }
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
      setView('main'); // Always reset to main view on open
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
  
  const handleOpenMembershipView = useCallback(async () => {
    if (!userProfile) return;
    setView('membership');
    setIsMembershipLoading(true);
    try {
        const [detailsRes, settingsRes] = await Promise.all([
            fetch(`/api/admin?action=get_membership_details`, { headers: { 'X-User-Email': userProfile.email } }),
            fetch(`/api/admin?action=get_payment_settings`)
        ]);
        if (!detailsRes.ok || !settingsRes.ok) throw new Error('Failed to fetch membership data.');
        const details = await detailsRes.json();
        const settings = await settingsRes.json();
        setMembershipData(details);
        setPaymentSettings(settings);
    } catch (e) {
        setNotifications(prev => [e instanceof Error ? e.message : 'Unknown error', ...prev.slice(0, 19)]);
    } finally {
        setIsMembershipLoading(false);
    }
  }, [userProfile, setNotifications]);

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

  const renderMainSettings = () => (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 id="settings-title" className="text-2xl font-bold">Settings</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close settings"><CloseIcon className="w-7 h-7" /></button>
      </div>
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 -mr-2">
        {userProfile && isMember && (
             <button onClick={handleOpenMembershipView} className="w-full text-left p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors flex items-center justify-between">
                <span className="font-semibold text-indigo-800 dark:text-indigo-200">Membership Management</span>
                <TicketIcon className="w-6 h-6 text-indigo-500" />
            </button>
        )}
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
    </>
  );

  const renderMembershipManagement = () => {
    const [activeTab, setActiveTab] = useState<'membership' | 'history'>('membership');
    
    const handleCancel = async () => {
        if (!userProfile) return;
        const confirmation = window.confirm("Nếu bạn huỷ bỏ trong quá trình vẫn còn thời hạn và sẽ kết thúc cho đến hết ngày cuối cùng. Bạn có muốn huỷ bây giờ?");
        if (confirmation) {
            try {
                const response = await fetch('/api/admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
                    body: JSON.stringify({ action: 'cancel_subscription_user', email: userProfile.email }),
                });
                if (!response.ok) throw new Error('Failed to cancel membership.');
                setNotifications(prev => ["Your membership cancellation is being processed.", ...prev]);
                handleOpenMembershipView(); // Refresh data
            } catch (e) {
                setNotifications(prev => [e instanceof Error ? e.message : 'Unknown error', ...prev]);
            }
        }
    };
    
    const startRenewal = (plan: RenewalPlan) => {
        setRenewalPlan(plan);
        setView('renew_payment');
    };

    const plans: RenewalPlan[] = [
        { days: 30, price: paymentSettings?.price30 || 250000, name: '1 Month' },
        { days: 90, price: paymentSettings?.price90 || 700000, name: '3 Months' },
        { days: 360, price: paymentSettings?.price360 || 2500000, name: '1 Year' },
    ];
    
    return (
        <>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Membership Management</h2>
                <button onClick={() => setView('main')} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Back to settings"><CloseIcon className="w-7 h-7" /></button>
            </div>
            <div className="border-b border-slate-200 dark:border-slate-700 flex">
                <TabButton active={activeTab === 'membership'} onClick={() => setActiveTab('membership')}>Membership</TabButton>
                <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>Payment History</TabButton>
            </div>
            <div className="py-4 space-y-6 max-h-[70vh] overflow-y-auto pr-2 -mr-2">
                {isMembershipLoading ? <p>Loading...</p> : 
                 activeTab === 'membership' ? (
                    <div className="space-y-6">
                        <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg">
                            <p className="text-sm text-slate-500 dark:text-slate-400">Status</p>
                            <p className={`font-semibold text-lg ${membershipData?.status === 'active' ? 'text-green-500' : 'text-amber-500'}`}>{membershipData?.status || 'N/A'}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Expires on</p>
                            <p className="font-semibold">{membershipData?.expiresAt ? new Date(membershipData.expiresAt).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        {membershipData?.status === 'active' && <button onClick={handleCancel} className="w-full p-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 font-semibold rounded-lg hover:bg-red-200 dark:hover:bg-red-900">Cancel Membership</button>}
                        <div>
                           <h3 className="text-lg font-semibold mb-3">Renew Membership</h3>
                           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {plans.map(plan => (
                                    <button key={plan.days} onClick={() => startRenewal(plan)} className="p-4 bg-slate-100 dark:bg-[#2d2d40] rounded-lg text-center hover:ring-2 hover:ring-indigo-500">
                                        <p className="font-bold">{plan.name}</p>
                                        <p className="text-xl font-bold text-indigo-500">{plan.price.toLocaleString('vi-VN')} VNĐ</p>
                                    </button>
                                ))}
                           </div>
                        </div>
                    </div>
                 ) : (
                    <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="border-b border-slate-300 dark:border-slate-600"><tr><th className="py-2">Date</th><th className="py-2">Amount</th><th className="py-2">Memo</th><th className="py-2">Status</th></tr></thead>
                            <tbody>
                                {membershipData?.history.map((item, i) => (
                                    <tr key={i}><td className="py-2">{new Date(item.date).toLocaleDateString()}</td><td className="py-2">{item.amount.toLocaleString('vi-VN')} VNĐ</td><td className="py-2 font-mono">{item.memo}</td><td className="py-2">{item.status}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
            </div>
        </>
    );
  };

  const renderRenewPayment = () => {
    if (!renewalPlan) return null;
    const memo = (paymentSettings?.memoFormat || 'moechat {userName}').replace('{userName}', userProfile?.name.replace(/\s+/g, '') || '');
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Renew: {renewalPlan.name}</h2>
                <button onClick={() => setView('membership')} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Back to membership"><CloseIcon className="w-7 h-7" /></button>
            </div>
            <div className="text-center">
                <h3 className="text-xl font-semibold mb-4">Quét mã QR để thanh toán</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {paymentSettings?.bankQrId && <img src={getDriveFilePublicUrl(paymentSettings.bankQrId)} alt="Bank QR" className="w-full h-auto object-contain rounded-lg"/>}
                    {paymentSettings?.momoQrId && <img src={getDriveFilePublicUrl(paymentSettings.momoQrId)} alt="Momo QR" className="w-full h-auto object-contain rounded-lg"/>}
                </div>
                <div className="mt-4 space-y-2 text-sm">
                    <p>Số tiền: <strong className="text-lg">{renewalPlan.price.toLocaleString('vi-VN')} VNĐ</strong></p>
                    <p>Nội dung chuyển khoản: <strong className="font-mono text-base bg-slate-200 dark:bg-slate-900 p-1 rounded-md">{memo}</strong></p>
                </div>
                <button onClick={() => setView('membership')} className="mt-6 bg-slate-200 dark:bg-slate-600 font-semibold py-2 px-4 rounded-lg">Hoàn tất</button>
            </div>
        </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        {view === 'main' && renderMainSettings()}
        {view === 'membership' && renderMembershipManagement()}
        {view === 'renew_payment' && renderRenewPayment()}
      </div>
    </div>
  );
};
