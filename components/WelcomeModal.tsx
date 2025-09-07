import React, { useState, useEffect } from 'react';
import { CloseIcon } from './icons';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const [isJoined, setIsJoined] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setIsJoined(false); // Reset state every time modal opens
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 sm:p-10 border-4 border-sky-400 flex flex-col items-center text-center relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            aria-label="Close"
        >
            <CloseIcon className="w-7 h-7" />
        </button>

        <img src="https://i.postimg.cc/dQp51hpM/images.png" alt="ccTalk Logo" className="w-28 h-28 sm:w-32 sm:h-32 object-contain mb-4" />

        <h1 id="welcome-title" className="text-3xl sm:text-4xl font-bold text-slate-800">
          ccTalk - Kết nối bạn bè
        </h1>

        <div className="text-slate-600 mt-6 text-left sm:text-center space-y-3 max-w-prose">
            <p>
                ccTalk giúp bạn thỏa sức thể hiện cảm xúc của mình bằng hệ thống chat voice sống động, đường truyền ổn định. Các tính năng mới:
            </p>
            <ol className="list-decimal list-inside space-y-2 pl-4 sm:pl-0 sm:mx-auto sm:inline-block">
                <li>ccTalk cho phép tạo phòng chat riêng tối đa 4 người. Lên đến 100 phòng chat.</li>
                <li>ccTalk cho phép tuyển team chơi game, giao lưu ca hát, nói chuyện qua voice.</li>
                <li>Chức năng xếp hàng đến lượt voice lên đến 10 users.</li>
            </ol>
            <p>
                Cùng nhiều chức năng khác trong tương lai. Mang đến cho mọi người trải nghiệm như ccTalk được quay trở lại. Nào hãy ấn Tham gia ngay!
            </p>
        </div>

        <div className="mt-8 w-full max-w-xs">
            {!isJoined ? (
                <button
                    onClick={() => setIsJoined(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 text-lg"
                >
                    Tham gia ngay!
                </button>
            ) : (
                <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded-md" role="alert">
                    <p className="font-bold">ccTalk Đang trong quá trình được phát triển.</p>
                    <p>Bạn vui lòng quay lại sau...</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
