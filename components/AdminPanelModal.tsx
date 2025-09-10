import React, { useState, useEffect, useCallback } from 'react';
import { CloseIcon, ShieldCheckIcon, ShieldExclamationIcon, UserGroupIcon, ClipboardDocumentListIcon, RefreshIcon, SparklesIcon, CurrencyDollarIcon, PhotoIcon } from './icons';
import type { UserProfile } from '../types';
import * as googleDriveService from '../services/googleDriveService';

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

const PlaceholderComponent: React.FC<{ title: string; }> = ({ title }) => (
    <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 dark:text-slate-400">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="mt-2">This feature is under development and will be available soon.</p>
    </div>
);

const PaymentSettings: React.FC<{ userProfile: UserProfile | undefined }> = ({ userProfile }) => {
    const [bankQrId, setBankQrId] = useState<string | null>(null);
    const [momoQrId, setMomoQrId] = useState<string | null>(null);
    const [memoFormat, setMemoFormat] = useState('moechat {userName}');
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
                body: JSON.stringify({ action: 'save_payment_settings', bankQrId, momoQrId, memoFormat }),
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
            <div>
                <label htmlFor="memo-format" className="font-semibold block mb-2">Transfer Memo Format</label>
                <input
                    id="memo-format"
                    type="text"
                    value={memoFormat}
                    onChange={e => setMemoFormat(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2 font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">Use <code className="bg-slate-200 dark:bg-slate-700 p-0.5 rounded">{`{userName}`}</code> as a placeholder for the user's first name.</p>
            </div>
            <div className="flex justify-end">
                <button onClick={handleSave} disabled={isLoading} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    {isLoading ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
};


export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose, userProfile }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('logs');
  const [logs, setLogs] = useState<string[]>([]);
  const [userData, setUserData] = useState<UserIpData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isOpen || !userProfile) return;
    setIsLoading(true);
    setError(null);
    try {
        const headers = { 'Content-Type': 'application/json', 'X-User-Email': userProfile.email };
        const [logsResponse, ipsResponse] = await Promise.all([
            fetch(`${ADMIN_API_ENDPOINT}?action=get_logs`, { headers }),
            fetch(`${ADMIN_API_ENDPOINT}?action=get_user_ip_data`, { headers })
        ]);

        if (!logsResponse.ok) throw new Error(`Failed to fetch logs: ${logsResponse.statusText}`);
        if (!ipsResponse.ok) throw new Error(`Failed to fetch IP data: ${ipsResponse.statusText}`);

        const logsData = await logsResponse.json();
        const ipsData = await ipsResponse.json();

        setLogs(logsData.logs || []);
        setUserData(ipsData.userData || []);

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(errorMessage);
    } finally {
        setIsLoading(false);
    }
  }, [isOpen, userProfile]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
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
        // Refresh data after action
        fetchData();
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
            <button onClick={fetchData} disabled={isLoading} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50" aria-label="Refresh data">
              <RefreshIcon className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" aria-label="Close admin panel">
              <CloseIcon className="w-7 h-7" />
            </button>
          </div>
        </div>

        {error && <div className="p-3 mb-4 bg-red-500/10 text-red-500 rounded-lg text-sm">{error}</div>}

        <div className="border-b border-slate-200 dark:border-slate-700 flex flex-shrink-0 flex-wrap">
          <TabButton tabId="logs" title="User Logs" icon={ClipboardDocumentListIcon} />
          <TabButton tabId="ips" title="IP Management" icon={ShieldCheckIcon} />
          <TabButton tabId="users" title="Users" icon={UserGroupIcon} />
          <TabButton tabId="memberships" title="Memberships" icon={SparklesIcon} />
          <TabButton tabId="payments" title="Payments" icon={CurrencyDollarIcon} />
        </div>

        <div className="flex-grow overflow-y-auto mt-4 pr-2 -mr-4">
          {activeTab === 'logs' && (
            <div className="bg-slate-100 dark:bg-[#2d2d40] p-4 rounded-lg font-mono text-xs text-slate-600 dark:text-slate-300">
                {isLoading ? <p>Loading logs...</p> : logs.length > 0 ? logs.map((log, index) => <p key={index}>{log}</p>) : <p>No logs found.</p>}
            </div>
          )}
          {activeTab === 'ips' && (
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
                      {isLoading ? (
                        <tr><td colSpan={4} className="text-center p-4 text-slate-500">Loading user data...</td></tr>
                      ) : userData.length > 0 ? (
                        userData.map(({ email, ip, isBlocked }) => (
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
          {activeTab === 'users' && <PlaceholderComponent title="User Management" />}
          {activeTab === 'memberships' && <PlaceholderComponent title="Membership Plans" />}
          {activeTab === 'payments' && <PaymentSettings userProfile={userProfile} />}
        </div>
      </div>
    </div>
  );
};
