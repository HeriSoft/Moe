
import React from 'react';
import { TienLenCard, CardSuit } from '../../../types.ts';

interface CardDisplayProps {
  card: TienLenCard | null; // Can be null if it's a placeholder or hidden card
  onClick?: () => void;
  className?: string;
  isFaceDown?: boolean; // For AI cards or deck
  isSelected?: boolean; // For player's hand interaction
  isPlayable?: boolean; // If card can be played (visual cue)
  isDimmed?: boolean; // For cards that cannot be selected or played
}

const CardDisplay: React.FC<CardDisplayProps> = ({
  card,
  onClick,
  className = '',
  isFaceDown = false,
  isSelected = false,
  isPlayable = true, // Default to true, game logic will set this
  isDimmed = false,
}) => {
  const getSuitColor = (suit: CardSuit | undefined) => {
    if (!suit) return 'text-neutral-800 dark:text-neutral-200'; // Default for no card
    return (suit === CardSuit.HEARTS || suit === CardSuit.DIAMONDS)
      ? 'text-red-600 dark:text-red-400'
      : 'text-neutral-800 dark:text-neutral-200';
  };

  const baseClasses = `
    w-[38px] h-[53px] sm:w-[44px] sm:h-[61px] md:w-[50px] md:h-[70px] lg:w-[56px] lg:h-[78px] xl:w-[64px] xl:h-[89px]
    border rounded-md shadow-md flex flex-col items-center justify-center 
    p-0.5 transition-all duration-150 ease-in-out
    ${className}
  `;
  // Reduced padding: p-0.5
  // Adjusted border to border (1px) from border-2. Rounded to rounded-md.

  const interactiveClasses = onClick && !isFaceDown && isPlayable && !isDimmed
    ? 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5 sm:hover:-translate-y-1'
    : 'cursor-default';
  
  const selectionClasses = isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-1 sm:ring-offset-2 ring-offset-green-600 dark:ring-offset-green-700 -translate-y-0.5 sm:-translate-y-1 md:-translate-y-1.5' : '';
  // Reduced translate-y values for selection
  const dimmedClasses = isDimmed ? 'opacity-50 filter grayscale' : '';
  const playabilityClasses = !isPlayable && !isFaceDown ? 'opacity-60' : ''; 

  if (isFaceDown) {
    return (
      <div
        className={`${baseClasses} bg-blue-500 border-blue-700 dark:bg-blue-700 dark:border-blue-900 relative`}
        aria-label="Facedown card"
      >
        <div className="absolute inset-0.5 border border-blue-300 dark:border-blue-500 rounded opacity-50"></div>
        {/* You can add a more detailed card back design here */}
        <span className="text-white text-opacity-80 text-[6px] sm:text-[7px] md:text-[8px]">CARD</span>
      </div>
    );
  }

  if (!card) {
    return <div className={`${baseClasses} bg-neutral-200 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 ${dimmedClasses}`} aria-label="Empty card slot"></div>;
  }

  const suitColor = getSuitColor(card.suit);

  return (
    <div
      className={`${baseClasses} bg-white dark:bg-neutral-100 border-neutral-300 dark:border-neutral-400 
                  ${interactiveClasses} ${selectionClasses} ${dimmedClasses} ${playabilityClasses}`}
      onClick={onClick}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Card ${card.rank} of ${card.suit}${isSelected ? ', selected' : ''}`}
      tabIndex={onClick && isPlayable && !isDimmed ? 0 : -1}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.();}}
    >
      <div className={`text-[0.6rem] xs:text-xs sm:text-xs md:text-sm font-bold ${suitColor} self-start`}>{card.rank}</div>
      <div className={`text-xs xs:text-sm sm:text-base md:text-lg ${suitColor}`}>{card.suit}</div>
      <div className={`text-[0.6rem] xs:text-xs sm:text-xs md:text-sm font-bold ${suitColor} self-end transform rotate-180`}>{card.rank}</div>
    </div>
  );
};
// Added xs: prefix for Tailwind for finer control if available, otherwise sm: will be the first step up from base.
// If xs: is not configured in tailwind.config.js, it will be ignored.
// Assuming standard Tailwind, non-prefixed classes are the smallest, then sm:, md:, etc.

export default CardDisplay;
