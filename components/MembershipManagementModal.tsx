import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CloseIcon } from './icons';
import type { UserProfile, PaymentHistoryItem } from '../types';
import { getDriveFilePublicUrl } from '../services/googleDriveService';

// --- TYPE DEFINITIONS ---
interface MembershipManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

interface RenewalPlan {
  days: number;
  price: number;
  name: string;
  credits: number;
}

interface PaymentSettings {
  bankQrId?: string;
  momoQrId?: string;
  memoFormat?: string;
  price30?: number;
  price90?: number;
  price360?: number;
}


// --- HELPER COMPONENT ---

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


// --- MAIN MODAL COMPONENT ---

export const MembershipManagementModal: React.FC<MembershipManagementModalProps> = ({ isOpen, onClose, userProfile, setNotifications }) => {
  const [view, setView] = useState<'membership' | 'renew_payment'>('membership');
  const [membershipData, setMembershipData] = useState<{ history: PaymentHistoryItem[], status: string, expiresAt: string | null } | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [isMembershipLoading, setIsMembershipLoading] = useState(false);
  const [renewalPlan, setRenewalPlan] = useState<RenewalPlan | null>(null);
  // FIX: Moved state hook to the top level of the component to prevent invalid hook call error.
  const [activeTab, setActiveTab] = useState<'membership' | 'history'>('membership');

  const fetchMembershipData = useCallback(async () => {
    if (!userProfile) return;
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

  useEffect(() => {
    if (isOpen) {
        document.body.style.overflow = 'hidden';
        setView('membership');
        // FIX: Reset the active tab to the default whenever the modal is opened.
        setActiveTab('membership');
        fetchMembershipData();
    } else {
        document.body.style.overflow = 'auto';
    }
  }, [isOpen, fetchMembershipData]);
  
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
            fetchMembershipData(); // Refresh data
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
    { days: 30, price: paymentSettings?.price30 || 260000, name: '1 Month', credits: 500 },
    { days: 90, price: paymentSettings?.price90 || 750000, name: '3 Months', credits: 1500 },
    { days: 360, price: paymentSettings?.price360 || 3000000, name: '1 Year', credits: 6000 },
  ];

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="membership-management-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-md p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        {view === 'membership' ? (
             <>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">Membership Management</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Back to settings"><CloseIcon className="w-7 h-7" /></button>
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
                                            <p className="text-xs text-slate-400">+{plan.credits} Credits</p>
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
        ) : renderRenewPayment()}
      </div>
    </div>
  );
};

