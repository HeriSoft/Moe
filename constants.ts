import { CardSuit, CardRank } from './types';

// Gameplay constants
export const CARDS_PER_PLAYER = 13;
export const TIEN_LEN_TURN_COUNTDOWN_SECONDS = 30;
export const TIEN_LEN_AI_THINKING_MILLISECONDS = 1500;

// Card definitions
export const TIEN_LEN_SUITS: CardSuit[] = Object.values(CardSuit);
export const TIEN_LEN_RANKS: CardRank[] = Object.values(CardRank);

export const TIEN_LEN_RANK_VALUES: { [key in CardRank]: number } = {
  [CardRank.THREE]: 3,
  [CardRank.FOUR]: 4,
  [CardRank.FIVE]: 5,
  [CardRank.SIX]: 6,
  [CardRank.SEVEN]: 7,
  [CardRank.EIGHT]: 8,
  [CardRank.NINE]: 9,
  [CardRank.TEN]: 10,
  [CardRank.JACK]: 11,
  [CardRank.QUEEN]: 12,
  [CardRank.KING]: 13,
  [CardRank.ACE]: 14,
  [CardRank.TWO]: 15,
};

export const TIEN_LEN_SUIT_VALUES: { [key in CardSuit]: number } = {
  [CardSuit.SPADES]: 1,
  [CardSuit.CLUBS]: 2,
  [CardSuit.DIAMONDS]: 3,
  [CardSuit.HEARTS]: 4,
};
