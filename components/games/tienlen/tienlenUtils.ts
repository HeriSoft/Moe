
import { TienLenCard, CardSuit, CardRank, PlayerHand, ValidatedHand, TienLenHandType } from '../../../types.ts';
import { TIEN_LEN_SUITS, TIEN_LEN_RANKS, TIEN_LEN_RANK_VALUES, TIEN_LEN_SUIT_VALUES } from '../../../constants.ts';

export const createDeck = (): TienLenCard[] => {
  const deck: TienLenCard[] = [];
  TIEN_LEN_SUITS.forEach(suit => {
    TIEN_LEN_RANKS.forEach(rank => {
      deck.push({
        id: `${suit}${rank}`,
        rank,
        suit,
        value: TIEN_LEN_RANK_VALUES[rank],
        isSelected: false,
      });
    });
  });
  return deck;
};

export const shuffleDeck = (deck: TienLenCard[]): TienLenCard[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const dealCards = (deck: TienLenCard[], numberOfPlayers: number, cardsPerPlayer: number): PlayerHand[] => {
  const hands: PlayerHand[] = Array(numberOfPlayers).fill(null).map(() => []);
  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let j = 0; j < numberOfPlayers; j++) {
      if (deck.length > 0) {
        hands[j].push(deck.pop()!);
      }
    }
  }
  hands.forEach(hand => sortHand(hand));
  return hands;
};

export const sortHand = (hand: PlayerHand): void => {
  hand.sort((a, b) => {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return TIEN_LEN_SUIT_VALUES[a.suit] - TIEN_LEN_SUIT_VALUES[b.suit];
  });
};

export const identifyHandCombination = (cards: TienLenCard[]): ValidatedHand => {
  if (!cards || cards.length === 0) return { type: TienLenHandType.INVALID, cards: [], rankValue: -1 };

  const n = cards.length;
  sortHand(cards); // Ensure cards are sorted for easier identification

  // Single
  if (n === 1) {
    return { type: TienLenHandType.SINGLE, cards, rankValue: cards[0].value, suitValue: TIEN_LEN_SUIT_VALUES[cards[0].suit] };
  }

  // Pair
  if (n === 2 && cards[0].value === cards[1].value) {
    return { type: TienLenHandType.PAIR, cards, rankValue: cards[0].value };
  }

  // Triple
  if (n === 3 && cards[0].value === cards[1].value && cards[1].value === cards[2].value) {
    return { type: TienLenHandType.TRIPLE, cards, rankValue: cards[0].value };
  }
  
  // Four of a Kind (Tứ Quý)
  if (n === 4 && cards[0].value === cards[1].value && cards[1].value === cards[2].value && cards[2].value === cards[3].value) {
    return { type: TienLenHandType.FOUR_OF_A_KIND, cards, rankValue: cards[0].value };
  }

  // Three Pair Straight (Ba Đôi Thông)
  if (n === 6) {
    let isThreePairStraight = true;
    for (let i = 0; i < 3; i++) {
      if (cards[i*2].value !== cards[i*2+1].value) { // Check if they form pairs
        isThreePairStraight = false;
        break;
      }
      if (i > 0 && cards[i*2].value !== cards[(i-1)*2].value + 1) { // Check if pairs are consecutive
        isThreePairStraight = false;
        break;
      }
       // Check if any card in a Three Pair Straight is a '2' (not allowed typically for this combo to chop, though rules vary)
      // For simplicity, we'll assume '2's cannot be part of the pairs in Ba Đôi Thông for chopping.
      // If a '2' is allowed as the highest pair, it might not be able to chop another '2'.
      // Standard rule: Ba Đôi Thông doesn't use '2's.
      if (cards[i*2].rank === CardRank.TWO) {
        isThreePairStraight = false;
        break;
      }
    }
    if (isThreePairStraight) {
      return { type: TienLenHandType.THREE_PAIR_STRAIGHT, cards, rankValue: cards[4].value }; // Rank of the highest pair
    }
  }

  // Straight (Sảnh) - Min 3 cards, no '2's
  if (n >= 3) {
    let isStraight = true;
    for (let i = 0; i < n - 1; i++) {
      if (cards[i+1].value !== cards[i].value + 1 || cards[i].rank === CardRank.TWO || cards[i+1].rank === CardRank.TWO) {
        isStraight = false;
        break;
      }
    }
    if (isStraight) {
      return { type: TienLenHandType.STRAIGHT, cards, rankValue: cards[n-1].value, length: n };
    }
  }
  
  return { type: TienLenHandType.INVALID, cards: [], rankValue: -1 };
};


export const canPlayOver = (
  handToPlayValid: ValidatedHand,
  lastPlayedHandValid: ValidatedHand | null
): boolean => {
  if (handToPlayValid.type === TienLenHandType.INVALID) return false;

  // If table is empty, any valid hand can be played
  if (!lastPlayedHandValid || lastPlayedHandValid.cards.length === 0) {
    return true;
  }

  // Chopping a '2' (Heo)
  if (lastPlayedHandValid.type === TienLenHandType.SINGLE && lastPlayedHandValid.cards[0].rank === CardRank.TWO) {
    if (handToPlayValid.type === TienLenHandType.THREE_PAIR_STRAIGHT) return true;
    if (handToPlayValid.type === TienLenHandType.FOUR_OF_A_KIND) return true;
    // Add logic for four pair straight (Tứ Đôi Thông) if implemented later
  }

  // If hand types are different, generally cannot play over (unless it's a chopping scenario handled above)
  if (handToPlayValid.type !== lastPlayedHandValid.type) {
    return false;
  }

  // Comparing same hand types
  switch (handToPlayValid.type) {
    case TienLenHandType.SINGLE:
      if (handToPlayValid.rankValue > lastPlayedHandValid.rankValue) return true;
      if (handToPlayValid.rankValue === lastPlayedHandValid.rankValue &&
          handToPlayValid.suitValue! > lastPlayedHandValid.suitValue!) return true;
      return false;

    case TienLenHandType.PAIR:
    case TienLenHandType.TRIPLE:
    case TienLenHandType.FOUR_OF_A_KIND: // Four of a kind vs four of a kind (if not chopping)
      return handToPlayValid.rankValue > lastPlayedHandValid.rankValue;

    case TienLenHandType.STRAIGHT:
      // Straights must be of the same length to beat each other
      if (handToPlayValid.length !== lastPlayedHandValid.length) return false;
      return handToPlayValid.rankValue > lastPlayedHandValid.rankValue;
    
    case TienLenHandType.THREE_PAIR_STRAIGHT: // Three pair straight vs three pair straight
       return handToPlayValid.rankValue > lastPlayedHandValid.rankValue;

    default:
      return false;
  }
};

export const getLowestCardPlayer = (player1Hand: PlayerHand, player2Hand: PlayerHand): 'player' | 'ai' | null => {
    const threeOfSpadesId = `${CardSuit.SPADES}${CardRank.THREE}`;
    if (player1Hand.some(card => card.id === threeOfSpadesId)) return 'player';
    if (player2Hand.some(card => card.id === threeOfSpadesId)) return 'ai';
    return null; // Should not happen in a standard game
};

// Generates all possible valid combinations from a hand (singles, pairs, etc.)
// This is a complex combinatorial problem.
export const getAllPossibleSubsets = (hand: PlayerHand): PlayerHand[] => {
    const subsets: PlayerHand[] = [];
    const n = hand.length;
    // Iterate over all possible subset sizes (1 to n)
    // For now, limiting to common hand sizes to keep it manageable
    // Max hand size to consider for a combination (e.g., 6 for ba doi thong, or longer for sảnh rồng)
    const MAX_COMBO_SIZE = Math.min(n, 13); // Theoretical max straight is 12 (3 to A)

    for (let i = 0; i < (1 << n); i++) {
        const subset: TienLenCard[] = [];
        for (let j = 0; j < n; j++) {
            if ((i >> j) & 1) {
                subset.push(hand[j]);
            }
        }
        if (subset.length > 0 && subset.length <= MAX_COMBO_SIZE) {
            subsets.push(subset);
        }
    }
    return subsets;
};


export const getPlayableHands = (
    currentFullHand: PlayerHand,
    lastPlayedHandOnTable: ValidatedHand | null,
    isStartingNewRound: boolean, // If true, player must play (cannot pass), unless they have no valid move.
    mustPlayThreeOfSpades: boolean // True if it's the first turn of game and player has 3S
): ValidatedHand[] => {
    const allSubsets = getAllPossibleSubsets(currentFullHand);
    const playableHands: ValidatedHand[] = [];

    for (const subset of allSubsets) {
        const validatedSubset = identifyHandCombination(subset);
        if (validatedSubset.type !== TienLenHandType.INVALID) {
            if (mustPlayThreeOfSpades) {
                const hasThreeSpades = validatedSubset.cards.some(c => c.rank === CardRank.THREE && c.suit === CardSuit.SPADES);
                if (!hasThreeSpades) continue; // Skip if doesn't contain 3S when required
            }

            if (isStartingNewRound) { // Player must play to start a new round
                if (lastPlayedHandOnTable === null) { // Table is truly empty, any valid hand is fine
                    playableHands.push(validatedSubset);
                } else { // Opponent passed, player must beat what opponent *couldn't* beat or start fresh if table should be cleared
                     // This case means the table *should* be considered empty for the current player.
                     // Or if the previous hand was cleared due to a chop that ended the trick.
                    if (canPlayOver(validatedSubset, null)) { // Effectively playing on an empty table
                        playableHands.push(validatedSubset);
                    }
                }
            } else { // Responding to opponent's play
                if (canPlayOver(validatedSubset, lastPlayedHandOnTable)) {
                    playableHands.push(validatedSubset);
                }
            }
        }
    }

    // Sort playable hands, e.g., by type strength, then rank, then length for straights.
    // This helps AI make "cheapest" move.
    playableHands.sort((a, b) => {
        // Prioritize singles if possible, then pairs, etc.
        const typeOrder = [
            TienLenHandType.SINGLE, TienLenHandType.PAIR, TienLenHandType.TRIPLE,
            TienLenHandType.STRAIGHT, TienLenHandType.THREE_PAIR_STRAIGHT, TienLenHandType.FOUR_OF_A_KIND
        ];
        const typeAIndex = typeOrder.indexOf(a.type);
        const typeBIndex = typeOrder.indexOf(b.type);

        if (typeAIndex !== typeBIndex) return typeAIndex - typeBIndex;
        
        // If same type, sort by rankValue (lowest first)
        if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;

        // For straights of same rankValue (highest card), sort by length (shorter first if that's desired, or doesn't matter much here)
        if (a.type === TienLenHandType.STRAIGHT && b.type === TienLenHandType.STRAIGHT) {
            return (a.length || 0) - (b.length || 0);
        }
        
        // For singles of same rank, sort by suit (lowest first)
        if (a.type === TienLenHandType.SINGLE && b.type === TienLenHandType.SINGLE) {
            return (a.suitValue || 0) - (b.suitValue || 0);
        }
        
        return 0;
    });

    return playableHands;
};
