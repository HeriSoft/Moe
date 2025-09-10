import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CloseIcon, ShieldCheckIcon, ShieldExclamationIcon, UserCircleIcon, ClipboardDocumentListIcon, RefreshIcon, SparklesIcon, CurrencyDollarIcon, PhotoIcon, StarIcon } from './icons';
import type { UserProfile } from '../types';
import * as googleDriveService from '../services/googleDriveService';

// Extend UserProfile for admin-specific data
type AdminUser = UserProfile & {
    subscriptionExpiresAt?: string | null;
    isModerator?: boolean;
    isPro?: boolean;
};


interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | undefined;
}

interface UserIpData {
    email: string;
    ip: string;
    isBlocked: boolean;
}

const ADMIN_API_ENDPOINT = '/api/admin';

type AdminTab = 'logs' | 'ips' | 'users' | 'memberships' | 'payments';

// --- STYLING CONSTANTS for MODERATORS ---
const MOD_ICON = (props: any) => <StarIcon {...props} solid={true} />;
const MOD_TEXT_COLOR = "text-purple-400"; // e.g., "text-purple-400"
const VipTag: React.FC = () => <span className="vip-tag-shine">VIP</span>;


const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-full">
        <RefreshIcon className="w-8 h-8 animate-spin text-slate-500" />
    </div>
);


const PaymentSettings: React.FC<{ userProfile: UserProfile | undefined }> = ({ userProfile }) => {
    const [bankQrId, setBankQrId] = useState<string | null>(null);
    const [momoQrId, setMomoQrId] = useState<string | null>(null);
    const [memoFormat, setMemoFormat] = useState('moechat {userName}');
    const [price30, setPrice30] = useState(250000);
    const [price90, setPrice90] = useState(700000);
    const [price360, setPrice360] = useState(2500000);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        const fetchSettings = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`${ADMIN_API_ENDPOINT}?action=get_payment_settings`);
                if (!response.ok) throw new Error('Could not fetch settings');
                const data = await response.json();
                if (data.bankQrId) setBankQrId(data.bankQrId);
                if (data.momoQrId) setMomoQrId(data.momoQrId);
                if (data.memoFormat) setMemoFormat(data.memoFormat);
                if (data.price30) setPrice30(data.price30);
                if (data.price90) setPrice90(data.price90);
                if (data.price360) setPrice360(data.price360);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSelectImage = (setter: React.Dispatch<React.SetStateAction<string | null>>) => {
        googleDriveService.showPicker((files) => {
            if (files && files.length > 0) {
                setter(files[0].id);
            }
        }, { mimeTypes: 'image/png,image/jpeg,image/webp' });
    };

    const handleSave = async () => {
        if (!userProfile) return;
        setIsLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const response = await fetch(ADMIN_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
                body: JSON.stringify({ action: 'save_payment_settings', bankQrId, momoQrId, memoFormat, price30, price90, price360 }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Failed to save settings.');
            setSuccess('Settings saved successfully!');
            setTimeout(() => setSuccess(null), 3000);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="space-y-6 max-w-2xl mx-auto p-4 bg-slate-100 dark:bg-[#2d2d40] rounded-lg">
            <h3 className="text-xl font-semibold text-center">Payment Configuration</h3>
            {error && <p className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded-md">{error}</p>}
            {success && <p className="text-green-500 text-sm text-center bg-green-500/10 p-2 rounded-md">{success}</p>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="font-semibold">Bank QR Code</label>
                    <div className="aspect-square w-full bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        {bankQrId ? <img src={googleDriveService.getDriveFilePublicUrl(bankQrId)} alt="Bank QR Preview" className="w-full h-full object-contain rounded-lg"/> : <PhotoIcon className="w-16 h-16 text-slate-400"/>}
                    </div>
                    <button onClick={() => handleSelectImage(setBankQrId)} className="w-full py-2 bg-slate-300 dark:bg-slate-600 rounded-md hover:bg-slate-400 dark:hover:bg-slate-500 text-sm font-semibold">Select Image from Drive</button>
                </div>
                 <div className="space-y-2">
                    <label className="font-semibold">Momo QR Code</label>
                    <div className="aspect-square w-full bg-slate-200 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                        {momoQrId ? <img src={googleDriveService.getDriveFilePublicUrl(momoQrId)} alt="Momo QR Preview" className="w-full h-full object-contain rounded-lg"/> : <PhotoIcon className="w-16 h-16 text-slate-400"/>}
                    </div>
                    <button onClick={() => handleSelectImage(setMomoQrId)} className="w-full py-2 bg-slate-300 dark:bg-slate-600 rounded-md hover:bg-slate-400 dark:hover:bg-slate-500 text-sm font-semibold">Select Image from Drive</button>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label htmlFor="memo-format" className="font-semibold block mb-2">Transfer Memo Format</label>
                    <input id="memo-format" type="text" value={memoFormat} onChange={e => setMemoFormat(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono" />
                    <p className="text-xs text-slate-500 mt-1">Use <code className="bg-slate-200 dark:bg-slate-700 p-0.5 rounded">{`{userName}`}</code> as a placeholder for the user's first name.</p>
                </div>
                <div>
                    <label className="font-semibold block mb-2">Renewal Prices (VNĐ)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="price30" className="text-sm">30 Days</label>
                            <input id="price30" type="number" value={price30} onChange={e => setPrice30(Number(e.target.value))} className="w-full mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2" />
                        </div>
                        <div>
                            <label htmlFor="price90" className="text-sm">90 Days</label>
                            <input id="price90" type="number" value={price90} onChange={e => setPrice90(Number(e.target.value))} className="w-full mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2" />
                        </div>
                        <div>
                            <label htmlFor="price360" className="text-sm">360 Days</label>
                            <input id="price360" type="number" value={price360} onChange={e => setPrice360(Number(e.target.value))} className="w-full mt-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end">
                <button onClick={handleSave} disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    {isLoading ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
};

const MembershipManagement: React.FC<{ users: AdminUser[], userProfile: UserProfile, onUpdate: () => void }> = ({ users, userProfile, onUpdate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [days, setDays] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

    const filteredUsers = useMemo(() => {
        if (!searchTerm) return [];
        return users.filter(u => 
            u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            u.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const handleAction = async (action: 'set_subscription' | 'extend_subscription' | 'remove_subscription', email: string, numDays?: number) => {
        setIsSubmitting(email);
        try {
            const response = await fetch(ADMIN_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
                body: JSON.stringify({ action, email, days: numDays }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Action failed');
            onUpdate(); // Refresh user data from parent
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(null);
            setDays(prev => ({ ...prev, [email]: '' })); // Clear input
        }
    };

    return (
        <div className="space-y-4">
            <input type="text" placeholder="Search by name or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 bg-slate-100 dark:bg-[#2d2d40] rounded-md" />
            <div className="space-y-2">
                {filteredUsers.map(user => (
                    <div key={user.email} className="bg-slate-100 dark:bg-[#2d2d40] p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-semibold">{user.name}</p>
                                <p className="text-sm text-slate-500">{user.email}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    Expires: {user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).toLocaleString() : 'N/A'}
                                </p>
                            </div>
                            <button onClick={() => handleAction('remove_subscription', user.email)} disabled={isSubmitting === user.email} className="px-2 py-1 bg-red-500 text-white rounded-md text-xs font-semibold hover:bg-red-600 disabled:opacity-50">Remove</button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <input type="number" placeholder="Days" value={days[user.email] || ''} onChange={e => setDays(d => ({...d, [user.email]: e.target.value}))} className="w-20 p-1 bg-white dark:bg-slate-800 rounded-md text-sm" />
                            <button onClick={() => handleAction('set_subscription', user.email, parseInt(days[user.email]))} disabled={isSubmitting === user.email || !days[user.email]} className="px-2 py-1 bg-blue-500 text-white rounded-md text-xs font-semibold hover:bg-blue-600 disabled:opacity-50">Set</button>
                            <button onClick={() => handleAction('extend_subscription', user.email, parseInt(days[user.email]))} disabled={isSubmitting === user.email || !days[user.email]} className="px-2 py-1 bg-green-500 text-white rounded-md text-xs font-semibold hover:bg-green-600 disabled:opacity-50">Extend</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const UserManagement: React.FC<{ users: AdminUser[], userProfile: UserProfile, onUpdate: () => void }> = ({ users, userProfile, onUpdate }) => {
     const [isSubmitting, setIsSubmitting] = useState<string | null>(null);

    const handleToggleMod = async (email: string, currentStatus: boolean) => {
        setIsSubmitting(email);
        try {
            const response = await fetch(ADMIN_API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
                body: JSON.stringify({ action: 'set_moderator', email, isModerator: !currentStatus }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.details || 'Action failed');
            onUpdate();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(null);
        }
    };

    return (
        <div className="space-y-2">
            {users.map(user => (
                <div key={user.email} className="bg-slate-100 dark:bg-[#2d2d40] p-3 rounded-lg flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <img src={user.imageUrl} alt={user.name} className="w-8 h-8 rounded-full" />
                        <div>
                            <p className={`font-semibold flex items-center gap-1.5 ${user.isModerator ? MOD_TEXT_COLOR : ''}`}>
                                {user.isModerator && <MOD_ICON className="w-4 h-4" />}
                                {user.name}
                                {user.isPro && <VipTag />}
                            </p>
                            <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">MOD</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={!!user.isModerator} onChange={() => handleToggleMod(user.email, !!user.isModerator)} disabled={isSubmitting === user.email} className="sr-only peer" />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>
                </div>
            ))}
        </div>
    );
};


export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [logs, setLogs] = useState<string[]>([]);
  const [ipData, setIpData] = useState<UserIpData[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (tab: AdminTab) => {
    if (!isOpen || !userProfile) return;
    setIsLoading(true);
    setError(null);
    try {
        const headers = { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email };
        let response;
        if (tab === 'logs') {
            response = await fetch(`${ADMIN_API_ENDPOINT}?action=get_logs`, { headers });
            if (!response.ok) throw new Error(`Failed to fetch logs: ${response.statusText}`);
            const data = await response.json();
            setLogs(data.logs || []);
        } else if (tab === 'ips') {
            response = await fetch(`${ADMIN_API_ENDPOINT}?action=get_user_ip_data`, { headers });
            if (!response.ok) throw new Error(`Failed to fetch IP data: ${response.statusText}`);
            const data = await response.json();
            setIpData(data.userData || []);
        } else if (tab === 'users' || tab === 'memberships') {
            response = await fetch(`${ADMIN_API_ENDPOINT}?action=get_all_users`, { headers });
            if (!response.ok) throw new Error(`Failed to fetch users: ${response.statusText}`);
            const data = await response.json();
            // Map API response (snake_case) to frontend component props (camelCase)
            const mappedUsers = (data.users || []).map((user: any) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                imageUrl: user.image_url, // Fix: map image_url to imageUrl
                isPro: user.isPro,
                subscriptionExpiresAt: user.subscriptionExpiresAt,
                isModerator: user.isModerator,
            }));
            setAllUsers(mappedUsers);
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(errorMessage);
    } finally {
        setIsLoading(false);
    }
  }, [isOpen, userProfile]);

  useEffect(() => {
    if (isOpen) {
        fetchData(activeTab);
    }
  }, [isOpen, activeTab, fetchData]);
  
  const handleIpAction = async (ip: string, email: string, action: 'block_ip' | 'unblock_ip') => {
    if (!userProfile) return;
    try {
        const response = await fetch(ADMIN_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email },
            body: JSON.stringify({ action, ip, email }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || `Failed to ${action}.`);
        }
        fetchData('ips');
    } catch (e) {
         const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
         setError(errorMessage);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const TabButton: React.FC<{ tabId: AdminTab; title: string; icon: React.FC<any>; }> = ({ tabId, title, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`flex-1 flex items-center justify-center gap-2 p-3 text-sm font-semibold border-b-2 transition-colors ${
        activeTab === tabId
          ? 'border-indigo-500 text-indigo-500'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      <Icon className="w-5 h-5" />
      {title}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="admin-panel-title">
      <div className="bg-white dark:bg-[#171725] rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col p-4 sm:p-6 m-4 text-slate-800 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="admin-panel-title" className="text-2xl font-bold">Admin Panel</h2>
          <div className="flex items-center gap-4">
            <button onClick={() => fetchData(activeTab)} disabled={isLoading} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50" aria-label="Refresh data">
              <RefreshIcon className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close admin panel">
              <CloseIcon className="w-7 h-7" />
            </button>
          </div>
        </div>

        {error && <div className="p-3 mb-4 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

        <div className="border-b border-slate-200 dark:border-slate-700 flex flex-shrink-0 flex-wrap">
          <TabButton tabId="users" title="Users" icon={UserCircleIcon} />
          <TabButton tabId="memberships" title="Memberships" icon={SparklesIcon} />
          <TabButton tabId="ips" title="IP Management" icon={ShieldCheckIcon} />
          <TabButton tabId="payments" title="Payments" icon={CurrencyDollarIcon} />
          <TabButton tabId="logs" title="User Logs" icon={ClipboardDocumentListIcon} />
        </div>

        <div className="flex-grow overflow-y-auto mt-4 pr-2 -mr-4">
          {isLoading && <LoadingSpinner />}
          {!isLoading && activeTab === 'users' && userProfile && <UserManagement users={allUsers} userProfile={userProfile} onUpdate={() => fetchData('users')} />}
          {!isLoading && activeTab === 'memberships' && userProfile && <MembershipManagement users={allUsers} userProfile={userProfile} onUpdate={() => fetchData('memberships')} />}
          {!isLoading && activeTab === 'payments' && <PaymentSettings userProfile={userProfile} />}
          {!isLoading && activeTab === 'logs' && (
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg font-mono text-xs text-slate-600 dark:text-slate-300">
                {logs.length > 0 ? logs.map((log, index) => <p key={index}>{log}</p>) : <p>No logs found.</p>}
            </div>
          )}
          {!isLoading && activeTab === 'ips' && (
            <div className="flow-root">
              <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead>
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 dark:text-white sm:pl-0">User Email</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-white">Last Seen IP</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-white">Status</th>
                        <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0"><span className="sr-only">Action</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {ipData.length > 0 ? (
                        ipData.map(({ email, ip, isBlocked }) => (
                          <tr key={email}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 dark:text-white sm:pl-0">{email}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">{ip}</td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              {isBlocked ? (
                                <span className="inline-flex items-center rounded-md bg-red-50 dark:bg-red-500/10 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/20">Blocked</span>
                              ) : (
                                <span className="inline-flex items-center rounded-md bg-green-50 dark:bg-green-500/10 px-2 py-1 text-xs font-medium text-green-700 dark:text-green-400 ring-1 ring-inset ring-green-600/20">Active</span>
                              )}
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                                {isBlocked ? (
                                    <button onClick={() => handleIpAction(ip, email, 'unblock_ip')} className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 flex items-center gap-1">
                                        <ShieldCheckIcon className="w-4 h-4"/>Unlock
                                    </button>
                                ) : (
                                    <button onClick={() => handleIpAction(ip, email, 'block_ip')} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1">
                                        <ShieldExclamationIcon className="w-4 h-4"/>Block
                                    </button>
                                )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={4} className="text-center p-4 text-slate-500">No user IP data found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
       <style>{`
        @keyframes shine-vip {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        .vip-tag-shine {
            position: relative;
            display: inline-block;
            padding: 2px 8px;
            font-size: 0.75rem; /* 12px */
            font-weight: 700;
            line-height: 1.2;
            color: #1e293b; /* slate-800 */
            background: linear-gradient(110deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%);
            border-radius: 0.375rem; /* rounded-md */
            overflow: hidden;
            -webkit-mask-image: -webkit-radial-gradient(white, black);
        }
        .vip-tag-shine::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(110deg, transparent 25%, rgba(255, 255, 255, 0.6) 50%, transparent 75%);
            animation: shine-vip 3s ease-in-out infinite;
            animation-delay: 1s;
        }
      `}</style>
    </div>
  );
};
