import React from 'react';

export const getLevelInfo = (level: number): { name: string; className: string; isMarquee?: boolean } => {
    if (level <= 5) return { name: 'Newbie', className: 'text-white' };
    if (level <= 10) return { name: 'Member', className: 'text-cyan-400' };
    if (level <= 15) return { name: 'Active Member', className: 'text-purple-400' }; // Light Purple
    if (level <= 20) return { name: 'Enthusiast', className: 'text-purple-500' };
    if (level <= 25) return { name: 'Contributor', className: 'bg-gradient-to-r from-purple-400 to-white bg-clip-text text-transparent' };
    if (level <= 30) return { name: 'Pro', className: 'bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent' };
    if (level <= 35) return { name: 'Veteran', className: 'bg-gradient-to-r from-pink-400 to-red-400 bg-clip-text text-transparent' };
    if (level <= 40) return { name: 'Expert', className: 'bg-gradient-to-r from-lime-400 to-white bg-clip-text text-transparent' }; // Green/White
    if (level <= 45) return { name: 'Master', className: 'bg-gradient-to-r from-lime-400 to-yellow-400 bg-clip-text text-transparent' };
    if (level <= 50) return { name: 'Grandmaster', className: 'bg-gradient-to-r from-purple-400 to-lime-400 bg-clip-text text-transparent' };
    if (level <= 55) return { name: 'Guardian', className: 'bg-gradient-to-r from-teal-400 to-white bg-clip-text text-transparent' };
    if (level <= 60) return { name: 'Titan', className: 'bg-gradient-to-r from-cyan-400 to-fuchsia-400 bg-clip-text text-transparent' };
    if (level <= 65) return { name: 'Immortal', className: 'bg-gradient-to-r from-red-500 to-yellow-400 bg-clip-text text-transparent animate-pulse' }; // Red/Yellow Pulse
    if (level <= 70) return { name: 'Mythic', className: 'bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent animate-pulse' }; // Red/Blue Pulse
    if (level <= 75) return { name: 'Ascendant', className: 'level-ascendant bg-gradient-to-r from-teal-400 to-yellow-400 bg-clip-text text-transparent animate-pulse', isMarquee: true }; // Teal/Yellow Pulse + Marquee
    return { name: 'Legend', className: 'bg-gradient-to-r from-amber-400 via-red-500 to-purple-500 animate-pulse bg-clip-text text-transparent' };
};

// FIX: Replaced JSX with React.createElement to resolve parsing errors in a .ts file.
export const VipTag: React.FC = () => React.createElement('span', { className: 'vip-tag-shine' }, 'VIP');
