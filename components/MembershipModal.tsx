

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CloseIcon, CheckCircleIcon, SparklesIcon } from './icons';
import type { UserProfile } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';
import { renderFormattedText } from './utils';

interface MembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
}

interface PaymentSettings {
  bankQrId?: string;
  momoQrId?: string;
  memoFormat?: string;
  price30?: number;
}

const FeatureListItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start">
    <CheckCircleIcon className="w-6 h-6 text-green-400 mr-3 flex-shrink-0 mt-1" />
    <span className="text-slate-600 dark:text-slate-300">
        {typeof children === 'string' ? renderFormattedText(children) : children}
    </span>
  </li>
);

export const MembershipModal: React.FC<MembershipModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [view, setView] = useState<'initial' | 'qr_bank' | 'qr_momo' | 'success'>('initial');
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Reset state and fetch settings when modal opens
      setView('initial');
      setCountdown(300);
      
      const fetchSettings = async () => {
          try {
              const response = await fetch('/api/admin?action=get_payment_settings');
              if (response.ok) {
                  const data = await response.json();
                  setSettings(data);
              }
          } catch (e) {
              console.error("Failed to fetch payment settings", e);
          }
      };
      fetchSettings();
      
    } else {
      document.body.style.overflow = 'auto';
      if (timerRef.current) clearInterval(timerRef.current);
    }
    
    return () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);
  
  useEffect(() => {
    if (view === 'qr_bank' || view === 'qr_momo') {
        timerRef.current = window.setInterval(() => {
            setCountdown(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
    } else {
        if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [view]);

  const transferMemo = useMemo(() => {
    const format = settings?.memoFormat || 'moechat {userName}';
    if (!userProfile?.name) {
        return format.replace('{userName}', '').trim() || 'moechat';
    }
    const userName = userProfile.name.replace(/\s+/g, '');
    return format.replace('{userName}', userName);
  }, [settings, userProfile]);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  const renderInitialView = () => (
    <>
      <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 sm:p-6 rounded-lg">
        <div className="text-center mb-6">
          <p className="text-4xl font-bold text-slate-900 dark:text-white">{(settings?.price30 || 250000).toLocaleString('vi-VN')} VNĐ</p>
          <p className="text-slate-500 dark:text-slate-400">/ tháng (~$10) + 500 Credits</p>
        </div>

        <ul className="space-y-4 text-sm sm:text-base">
          <FeatureListItem>
            Nhận ngay **500 Credits** để sử dụng cho các công cụ sáng tạo (Tạo ảnh, sửa ảnh, swap face).
          </FeatureListItem>
          <FeatureListItem>
            Tạo hình ảnh với các mô hình **tiên tiến** (Imagen 4, DALL-E 3. Flux.1).
          </FeatureListItem>
          <FeatureListItem>
            Truy cập vào công cụ **chỉnh sửa hình ảnh** mạnh mẽ của mô hình: Banana Gemini và Flux Kontext.
          </FeatureListItem>
          <FeatureListItem>
            Mở khóa tính năng **Face Swap** để thỏa sức sáng tạo.
          </FeatureListItem>
           <FeatureListItem>
            Tạo âm thanh **Chuyển văn bản thành giọng nói** chất lượng cao.
          </FeatureListItem>
           <FeatureListItem>
            Truy cập các mô hình **độc quyền** như GPT-5, Claude và GPT-o3.
          </FeatureListItem>
          <FeatureListItem>
            Tạo video bằng tính năng **Tạo video mô hình**: Veo, Kling sắp ra mắt.
          </FeatureListItem>
          <FeatureListItem>
            Quyền truy cập ưu tiên vào tất cả **Tính năng mới** khi chúng được phát hành.
          </FeatureListItem>
        </ul>
      </div>
      
      <div className="mt-6 space-y-3">
          <button
              onClick={() => setView('qr_bank')}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-4 rounded-lg transition-colors text-base"
          >
              Thanh toán qua Ngân hàng
          </button>
           <button
              onClick={() => setView('qr_momo')}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-4 rounded-lg transition-colors text-base"
          >
              Thanh toán qua Momo
          </button>
      </div>
       <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 text-center">
          Bạn có thể hủy đăng ký của mình bất cứ lúc nào.
       </p>
    </>
  );
  
  const renderQrView = (type: 'bank' | 'momo') => {
    const qrId = type === 'bank' ? settings?.bankQrId : settings?.momoQrId;
    const qrUrl = qrId ? getDriveFilePublicUrl(qrId) : '';

    return (
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-4">Quét mã QR để thanh toán</h3>
        <div className="w-48 h-48 mx-auto bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center">
            {qrUrl ? <img src={qrUrl} alt={`${type} QR Code`} className="w-full h-full object-contain rounded-lg"/> : <p className="text-xs p-4">Admin has not set a QR code yet.</p>}
        </div>
        <div className="mt-4 space-y-2 text-sm">
            <p>Số tiền: <strong className="text-lg">{(settings?.price30 || 250000).toLocaleString('vi-VN')} VNĐ</strong></p>
            <p>Nội dung chuyển khoản:</p>
            <p className="font-mono text-base bg-slate-200 dark:bg-slate-900 inline-block px-3 py-1 rounded-md">{transferMemo}</p>
        </div>
        <p className="text-xs text-amber-500 mt-4 p-2 bg-amber-500/10 rounded-md">
            <strong>Quan Trọng:</strong> Hãy chuyển khoản đúng số tiền và nội dung, nếu không đúng sẽ không được nâng cấp.
        </p>
         <div className="mt-6">
            <p className="text-sm mb-2">Giao dịch sẽ hết hạn sau:</p>
            <p className="text-2xl font-bold font-mono text-red-500">{`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}</p>
         </div>
         <div className="mt-6 flex flex-col sm:flex-row gap-3">
             <button onClick={() => setView('initial')} className="w-full sm:w-1/2 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 font-semibold py-2 px-4 rounded-lg transition-colors">
                Quay lại
            </button>
            <button
                onClick={() => setView('success')}
                className="w-full sm:w-1/2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
                Hoàn tất chuyển khoản
            </button>
         </div>
      </div>
    );
  };
  
  const renderSuccessView = () => (
      <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4"/>
          <h3 className="text-2xl font-bold">Thành công!</h3>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
             Vui lòng chờ. Nếu đã chuyển khoản, bạn vui lòng đăng nhập lại để kiểm tra nâng cấp nhé!
          </p>
          <button onClick={onClose} className="mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-8 rounded-lg transition-colors">
              Đóng
          </button>
      </div>
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="membership-title"
    >
      <div
        className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-6 m-4 text-slate-800 dark:text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="membership-title" className="text-2xl font-bold flex items-center gap-2">
            <SparklesIcon className="w-7 h-7 text-indigo-500" />
            Upgrade to Pro
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            aria-label="Close membership modal"
          >
            <CloseIcon className="w-7 h-7" />
          </button>
        </div>
        
        {view === 'initial' && renderInitialView()}
        {view === 'qr_bank' && renderQrView('bank')}
        {view === 'qr_momo' && renderQrView('momo')}
        {view === 'success' && renderSuccessView()}
        
      </div>
    </div>
  );
};
