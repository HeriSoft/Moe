
// [TienLenGame.tsx] Module Start
console.log("[TienLenGame.tsx] Initializing Tien Len game logic module.");

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TienLenCard, PlayerHand, TienLenGameState, CardSuit, CardRank, ValidatedHand, TienLenHandType } from '../../../types.ts';
import { createDeck, shuffleDeck, dealCards, sortHand, identifyHandCombination, canPlayOver, getPlayableHands, getLowestCardPlayer } from './tienlenUtils.ts';
import CardDisplay from './TienLenCard.tsx';
import { useNotification } from '../../../contexts/NotificationContext.tsx';
import { UserIcon, RobotIcon, ArrowPathIcon, PauseIcon, PlayIcon, ClockIcon, ArrowsUpDownIcon } from '../../Icons.tsx';
import { CARDS_PER_PLAYER, TIEN_LEN_TURN_COUNTDOWN_SECONDS, TIEN_LEN_AI_THINKING_MILLISECONDS, TIEN_LEN_SUIT_VALUES } from '../../../constants.ts';


const INITIAL_GAME_STATE: TienLenGameState = {
  playerHand: [],
  aiHand: [],
  table: [], // Visual display of cards on table from lastPlayedHand
  lastPlayedHand: null, // Structured info of the hand to beat
  currentPlayer: 'player',
  turnHistory: [],
  winner: null,
  isDealing: true,
  statusMessage: 'Dealing cards...',
  playerScore: 0,
  aiScore: 0,
  turnTimer: TIEN_LEN_TURN_COUNTDOWN_SECONDS,
  isPaused: false,
  firstPlayerOfTheGame: null,
  isFirstTurnOfGame: true,
};

const TienLenGame: React.FC = () => {
  const [gameState, setGameState] = useState<TienLenGameState>(INITIAL_GAME_STATE);
  const [selectedPlayerCards, setSelectedPlayerCards] = useState<TienLenCard[]>([]);
  const { addNotification } = useNotification();
  const turnIntervalRef = useRef<number | null>(null);

  const handlePassTurnCallbackRef = useRef<((isAutoPass?: boolean) => void) | null>(null);
  const aiTurnLogicCallbackRef = useRef<(() => void) | null>(null);


  const startTurnTimer = useCallback(() => {
    if (turnIntervalRef.current) {
        clearInterval(turnIntervalRef.current);
        turnIntervalRef.current = null;
    }

    setGameState(prev => ({ ...prev, turnTimer: TIEN_LEN_TURN_COUNTDOWN_SECONDS }));

    turnIntervalRef.current = window.setInterval(() => {
      setGameState(prevTimerState => {
        if (prevTimerState.isPaused || prevTimerState.winner || prevTimerState.isDealing || prevTimerState.currentPlayer !== 'player') {
          if (turnIntervalRef.current) {
            clearInterval(turnIntervalRef.current);
            turnIntervalRef.current = null;
          }
          return prevTimerState;
        }
        if (prevTimerState.turnTimer > 0) {
          return { ...prevTimerState, turnTimer: prevTimerState.turnTimer - 1 };
        } else {
          // Timer is now 0
          if (turnIntervalRef.current) {
            clearInterval(turnIntervalRef.current);
            turnIntervalRef.current = null;
          }
          // Ensure state reflects timer is 0 before passing turn
          const stateBeforePass = { ...prevTimerState, turnTimer: 0 };
          if (handlePassTurnCallbackRef.current) {
              addNotification("Time's up! Your turn has been passed automatically.", "info");
              handlePassTurnCallbackRef.current(true); 
          }
          return stateBeforePass; 
        }
      });
    }, 1000);
  }, [addNotification]); 


  const aiTurnLogic = useCallback(() => {
    try {
        setGameState(prevGameState => {
            if (prevGameState.winner || prevGameState.isPaused || prevGameState.currentPlayer !== 'ai' || prevGameState.isDealing) {
                return prevGameState;
            }

            try {
                const lastPlayerTurn = prevGameState.turnHistory.filter(t => t.player === 'player').pop();
                const isAIStartingNewRound = (lastPlayerTurn?.passed) || (!prevGameState.lastPlayedHand);
                
                const mustPlay3S = prevGameState.isFirstTurnOfGame && prevGameState.firstPlayerOfTheGame === 'ai';
                const playableHands = getPlayableHands(prevGameState.aiHand, isAIStartingNewRound ? null : prevGameState.lastPlayedHand, isAIStartingNewRound, mustPlay3S);

                let aiPlayedHand: ValidatedHand | null = null;

                if (playableHands.length > 0) {
                    const canChopTwo = playableHands.find(h => 
                        (h.type === TienLenHandType.THREE_PAIR_STRAIGHT || h.type === TienLenHandType.FOUR_OF_A_KIND) &&
                        prevGameState.lastPlayedHand?.type === TienLenHandType.SINGLE &&
                        prevGameState.lastPlayedHand?.cards[0].rank === CardRank.TWO
                    );
                    if (canChopTwo) {
                        aiPlayedHand = canChopTwo;
                    } else {
                        // Prefer to play the smallest possible valid hand
                        // getPlayableHands already sorts them (smallest first for a given type)
                        aiPlayedHand = playableHands[0]; 
                    }
                }

                if (aiPlayedHand) {
                    const newAiHand = prevGameState.aiHand.filter(
                      card => !aiPlayedHand!.cards.find(sc => sc.id === card.id)
                    );
                    const newStatusMessage = `AI played ${aiPlayedHand.type.toLowerCase()} (${aiPlayedHand.cards.map(c => c.rank + c.suit).join(', ')}). Your turn.`;

                    if (newAiHand.length === 0) {
                        addNotification("AI won the game.", "error");
                        return { 
                            ...prevGameState, 
                            aiHand: newAiHand, 
                            table: aiPlayedHand.cards, 
                            lastPlayedHand: aiPlayedHand, 
                            currentPlayer: 'player', // Player's "turn" to see AI won, but game is over
                            statusMessage: '🤖 AI wins! 🤖', 
                            winner: 'ai', 
                            aiScore: prevGameState.aiScore + 1, 
                            turnHistory: [...prevGameState.turnHistory, {player: 'ai', playedCards: aiPlayedHand, passed: false}],
                            isFirstTurnOfGame: false,
                         };
                    }
                    return { 
                        ...prevGameState, 
                        aiHand: newAiHand, 
                        table: aiPlayedHand.cards, 
                        lastPlayedHand: aiPlayedHand, 
                        currentPlayer: 'player', 
                        statusMessage: newStatusMessage, 
                        turnHistory: [...prevGameState.turnHistory, {player: 'ai', playedCards: aiPlayedHand, passed: false}],
                        isFirstTurnOfGame: false,
                    };
                } else { 
                    // AI passes
                    return { 
                        ...prevGameState, 
                        currentPlayer: 'player', 
                        statusMessage: 'AI passed. Your turn.', 
                        turnHistory: [...prevGameState.turnHistory, {player: 'ai', playedCards: null, passed: true}],
                        isFirstTurnOfGame: false,
                    };
                }
            } catch (e: any) {
                console.error("Error during AI turn game logic (inside setGameState updater):", e);
                addNotification("An error occurred during AI's turn. Passing turn to player.", "error", e.message);
                return {
                    ...prevGameState,
                    currentPlayer: 'player',
                    statusMessage: 'Error in AI turn. Your turn.',
                    turnHistory: [...prevGameState.turnHistory, {player: 'ai', playedCards: null, passed: true, error: true } as any], 
                    isFirstTurnOfGame: false,
                };
            }
        });
    } catch (e: any) {
        console.error("Outer error in aiTurnLogic (e.g. scheduling setGameState or unhandled exception):", e);
        setGameState(prev => ({
            ...prev,
            currentPlayer: 'player',
            statusMessage: 'Critical AI error. Your turn. Game paused.',
            isPaused: true, 
        }));
        addNotification("A critical error occurred in the AI. Game paused.", "error", e.message);
    }
  }, [addNotification]); 
  
  aiTurnLogicCallbackRef.current = aiTurnLogic;

  const handlePassTurn = useCallback((isAutoPass = false) => {
    if (gameState.currentPlayer !== 'player' || gameState.winner || gameState.isPaused || gameState.isDealing) return;
    
    const lastHistoryEntry = gameState.turnHistory.length > 0 ? gameState.turnHistory[gameState.turnHistory.length - 1] : null;
    const aiPassedLast = lastHistoryEntry && lastHistoryEntry.player === 'ai' && lastHistoryEntry.passed;
    const tableIsEmptyOrOpponentPassed = !gameState.lastPlayedHand || gameState.lastPlayedHand.cards.length === 0 || aiPassedLast;

    if (!isAutoPass && tableIsEmptyOrOpponentPassed) {
      // Check if player actually has any valid starting move
      const mustPlay3S = gameState.isFirstTurnOfGame && gameState.firstPlayerOfTheGame === 'player';
      const playableStartingHands = getPlayableHands(gameState.playerHand, null, true, mustPlay3S);
      if (playableStartingHands.length > 0) {
        addNotification("You must play a card to start a new round.", "info");
        return; 
      }
      // If no playable starting hands, allow pass (rare, usually means hand is empty or game logic error)
    }

    if (turnIntervalRef.current) {
        clearInterval(turnIntervalRef.current);
        turnIntervalRef.current = null;
    }
    setGameState(prev => ({
      ...prev,
      currentPlayer: 'ai',
      statusMessage: 'AI is thinking...',
      turnHistory: [...prev.turnHistory, {player: 'player', playedCards: null, passed: true}],
      isFirstTurnOfGame: false, 
      turnTimer: 0, // Ensure timer is 0 when passing
    }));
    setSelectedPlayerCards([]); 
  }, [gameState.currentPlayer, gameState.winner, gameState.isPaused, gameState.isDealing, gameState.turnHistory, gameState.lastPlayedHand, gameState.playerHand, gameState.isFirstTurnOfGame, gameState.firstPlayerOfTheGame, addNotification]);

  handlePassTurnCallbackRef.current = handlePassTurn;

  // Effect to manage Player's Turn Timer
  useEffect(() => {
    if (!gameState.isDealing && !gameState.winner && !gameState.isPaused && gameState.currentPlayer === 'player') {
        startTurnTimer();
    } else {
        if (turnIntervalRef.current) {
            clearInterval(turnIntervalRef.current);
            turnIntervalRef.current = null;
        }
    }
  }, [gameState.currentPlayer, gameState.isDealing, gameState.winner, gameState.isPaused, startTurnTimer]);

  // Effect to manage AI's Turn Initiation
  useEffect(() => {
    if (gameState.currentPlayer === 'ai' && !gameState.winner && !gameState.isPaused && !gameState.isDealing) {
      if (aiTurnLogicCallbackRef.current) {
        const aiTurnDelay = TIEN_LEN_AI_THINKING_MILLISECONDS;
        setTimeout(aiTurnLogicCallbackRef.current, aiTurnDelay);
      }
    }
  }, [gameState.currentPlayer, gameState.winner, gameState.isPaused, gameState.isDealing]);


  const resetGame = useCallback((keepScores = false) => {
    if (turnIntervalRef.current) {
        clearInterval(turnIntervalRef.current);
        turnIntervalRef.current = null;
    }
    setGameState(prev => ({
        ...INITIAL_GAME_STATE,
        playerScore: keepScores ? prev.playerScore : 0,
        aiScore: keepScores ? prev.aiScore : 0,
        isDealing: true,
        statusMessage: 'Dealing cards...'
    }));
    setSelectedPlayerCards([]);
    
    setTimeout(() => {
        const deck = shuffleDeck(createDeck());
        const [playerHand, aiHand] = dealCards(deck, 2, CARDS_PER_PLAYER);

        const playerHasFourTwos = playerHand.filter(c => c.rank === CardRank.TWO).length === 4;
        const aiHasFourTwos = aiHand.filter(c => c.rank === CardRank.TWO).length === 4;

        if (playerHasFourTwos) {
            setGameState(prev => ({ ...prev, playerHand, aiHand, winner: 'player', playerScore: prev.playerScore + 1, statusMessage: '🎉 Tứ Quý Heo! You win instantly! 🎉', isDealing: false, turnTimer: TIEN_LEN_TURN_COUNTDOWN_SECONDS, isPaused: false }));
            addNotification("Tứ Quý Heo! You win instantly!", "success");
            return;
        }
        if (aiHasFourTwos) {
            setGameState(prev => ({ ...prev, playerHand, aiHand, winner: 'ai', aiScore: prev.aiScore + 1, statusMessage: '🤖 Tứ Quý Heo! AI wins instantly! 🤖', isDealing: false, turnTimer: TIEN_LEN_TURN_COUNTDOWN_SECONDS, isPaused: false }));
            addNotification("Tứ Quý Heo! AI wins instantly!", "error");
            return;
        }
        
        const firstPlayer = getLowestCardPlayer(playerHand, aiHand) || 'player'; 

        setGameState(prev => ({
            ...prev,
            playerHand,
            aiHand,
            isDealing: false,
            currentPlayer: firstPlayer,
            firstPlayerOfTheGame: firstPlayer,
            isFirstTurnOfGame: true,
            statusMessage: `${firstPlayer === 'player' ? 'Your turn (must play 3♠)' : 'AI to play 3♠'}. Select cards to play.`,
            turnTimer: TIEN_LEN_TURN_COUNTDOWN_SECONDS,
            isPaused: false,
        }));

        if (!keepScores) addNotification("New game started! Good luck!", "info");
        else addNotification("New round started!", "info");

    }, 500);
  }, [addNotification]); 

  useEffect(() => {
    resetGame(); 
    return () => {
        if (turnIntervalRef.current) {
            clearInterval(turnIntervalRef.current);
            turnIntervalRef.current = null;
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  const handleCardSelect = (card: TienLenCard) => {
    if (gameState.currentPlayer !== 'player' || gameState.winner || gameState.isPaused || gameState.isDealing) return;
    
    if (gameState.turnTimer <= 0) { // Double check timer even if UI is slow to update "currentPlayer"
        addNotification("Time's up! Your turn was automatically passed.", "info");
        if (handlePassTurnCallbackRef.current && gameState.currentPlayer === 'player') { // Check currentPlayer again
            handlePassTurnCallbackRef.current(true);
        }
        return;
    }

    setSelectedPlayerCards(prevSelected => {
      const isAlreadySelected = prevSelected.find(c => c.id === card.id);
      if (isAlreadySelected) {
        return prevSelected.filter(c => c.id !== card.id);
      } else {
        const newSelection = [...prevSelected, card];
        sortHand(newSelection); 
        return newSelection;
      }
    });
  };
  
  const handleSortPlayerHand = () => {
    if (gameState.isPaused || gameState.winner || gameState.isDealing) return;
    setGameState(prev => {
        const newPlayerHand = [...prev.playerHand];
        sortHand(newPlayerHand);
        return {...prev, playerHand: newPlayerHand};
    });
    addNotification("Hand sorted!", "info");
  };

  const playHand = (player: 'player' | 'ai', handToPlay: ValidatedHand) => {
    if (turnIntervalRef.current && player === 'player') { // Clear player timer if they played
        clearInterval(turnIntervalRef.current);
        turnIntervalRef.current = null;
    }

    setGameState(prev => {
        const newHand = player === 'player' 
            ? prev.playerHand.filter(card => !handToPlay.cards.find(sc => sc.id === card.id))
            : prev.aiHand.filter(card => !handToPlay.cards.find(sc => sc.id === card.id));
        
        const newStatusMessage = `${player === 'player' ? 'You' : 'AI'} played ${handToPlay.type.toLowerCase()} (${handToPlay.cards.map(c => c.rank + c.suit).join(', ')}). ${player === 'player' ? 'AI thinking...' : 'Your turn.'}`;

        const nextPlayer = player === 'player' ? 'ai' : 'player';

        const newStateUpdate: Partial<TienLenGameState> = {
            playerHand: player === 'player' ? newHand : prev.playerHand,
            aiHand: player === 'ai' ? newHand : prev.aiHand,
            table: [...handToPlay.cards],
            lastPlayedHand: handToPlay,
            currentPlayer: nextPlayer,
            statusMessage: newStatusMessage,
            turnHistory: [...prev.turnHistory, { player, playedCards: handToPlay, passed: false }],
            isFirstTurnOfGame: false, 
        };

        if (newHand.length === 0) {
            addNotification(player === 'player' ? "Congratulations! You won the game!" : "AI won the game.", player === 'player' ? "success" : "error");
            return {
                ...prev,
                ...newStateUpdate,
                winner: player,
                playerScore: player === 'player' ? prev.playerScore + 1 : prev.playerScore,
                aiScore: player === 'ai' ? prev.aiScore + 1 : prev.aiScore,
                statusMessage: player === 'player' ? '🎉 You win! 🎉' : '🤖 AI wins! 🤖',
            };
        }
        
        return { ...prev, ...newStateUpdate };
    });
    if (player === 'player') setSelectedPlayerCards([]);
  };

  const handlePlaySelectedCards = () => {
    if (gameState.currentPlayer !== 'player' || gameState.winner || gameState.isPaused || gameState.isDealing) {
        if(selectedPlayerCards.length === 0 && !gameState.winner && !gameState.isDealing && !gameState.isPaused) addNotification("Please select cards to play.", "info");
        return;
    }

    if (gameState.turnTimer <= 0) {
        addNotification("Time's up! Your turn was automatically passed.", "error");
        if (handlePassTurnCallbackRef.current && gameState.currentPlayer === 'player') { // Re-ensure pass if needed
            handlePassTurnCallbackRef.current(true);
        }
        return;
    }
    
    if (selectedPlayerCards.length === 0) {
        addNotification("Please select cards to play.", "info");
        return;
    }


    const validatedHand = identifyHandCombination(selectedPlayerCards);
    if (validatedHand.type === TienLenHandType.INVALID) {
      addNotification("Invalid card combination selected.", "error");
      return;
    }
    
    const lastAiTurn = gameState.turnHistory.filter(t => t.player === 'ai').pop();
    const aiPassedLast = lastAiTurn?.passed || false;
    const isPlayerStartingNewRound = aiPassedLast || !gameState.lastPlayedHand;


    if (gameState.isFirstTurnOfGame && gameState.firstPlayerOfTheGame === 'player') {
        const hasThreeSpades = validatedHand.cards.some(c => c.rank === CardRank.THREE && c.suit === CardSuit.SPADES);
        if (!hasThreeSpades) {
            addNotification("Your first hand must include the 3 of Spades (3♠).", "error");
            return;
        }
    }

    if (!canPlayOver(validatedHand, isPlayerStartingNewRound ? null : gameState.lastPlayedHand)) {
      addNotification("Your hand cannot beat the last played hand or is not a valid chop.", "error");
      return;
    }
    playHand('player', validatedHand);
  };
  
  const handleTogglePause = () => {
    setGameState(prev => {
        const newPausedState = !prev.isPaused;
        if (newPausedState) { 
            if (turnIntervalRef.current) {
                clearInterval(turnIntervalRef.current);
                turnIntervalRef.current = null; 
            }
        }
        return { ...prev, isPaused: newPausedState, statusMessage: newPausedState ? "Game Paused" : (prev.currentPlayer === 'player' ? "Your turn." : "AI's turn.") };
    });
  };

  const PlayerInfo: React.FC<{ playerType: 'player' | 'ai', cardCount: number, isCurrent: boolean }> = ({ playerType, cardCount, isCurrent }) => {
    const Icon = playerType === 'player' ? UserIcon : RobotIcon;
    const name = playerType === 'player' ? 'You' : 'AI';
    return (
      <div className={`flex flex-col items-center p-0.5 xs:p-1 sm:p-1.5 rounded-lg transition-all duration-300 ease-in-out w-12 xs:w-14 sm:w-16 md:w-20
                       ${isCurrent ? 'bg-yellow-400 dark:bg-yellow-600 shadow-lg scale-105' : 'bg-green-500 dark:bg-green-800 opacity-80'}`}>
        <Icon className="w-3 h-3 xs:w-4 xs:h-4 sm:w-5 md:w-6 text-white mb-0.5" />
        <p className="text-[0.6rem] xs:text-xs font-semibold text-white">{name}</p>
        <p className="text-[0.6rem] xs:text-xs text-white/90">Cards: {cardCount}</p>
      </div>
    );
  };

  const renderHandLayout = (hand: PlayerHand, isPlayer: boolean) => {
    const displayHand = [...hand]; 
    sortHand(displayHand); 
    
    return (
        <div className={`flex flex-col items-center gap-px sm:gap-0.5 p-0.5 rounded-md w-full max-w-full mx-auto 
                        min-h-[100px] xs:min-h-[120px] sm:min-h-[140px] md:min-h-[160px] justify-center overflow-x-auto
                        ${isPlayer ? 'bg-green-500/30 dark:bg-green-900/30' : 'bg-gray-500/30 dark:bg-gray-800/30'}`}>
            <div className="flex flex-wrap justify-center items-end gap-px sm:gap-0.5"> {/* Changed to flex-wrap */}
                {displayHand.map(card => (
                     <CardDisplay
                        key={card.id}
                        card={card}
                        isFaceDown={!isPlayer && !gameState.winner} 
                        onClick={isPlayer ? () => handleCardSelect(card) : undefined}
                        isSelected={isPlayer && selectedPlayerCards.some(sc => sc.id === card.id)}
                        isPlayable={gameState.currentPlayer === 'player' && !gameState.isPaused && !gameState.isDealing && !gameState.winner && gameState.turnTimer > 0}
                        isDimmed={(gameState.currentPlayer !== 'player' || gameState.isPaused || gameState.isDealing || !!gameState.winner || gameState.turnTimer <= 0) && isPlayer}
                        className="transform hover:scale-105"
                    />
                ))}
            </div>
            {hand.length === 0 && !gameState.winner && <p className="text-white/70 text-xs sm:text-sm italic">No cards</p>}
        </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full text-white select-none">
        <div className="w-full flex justify-between items-center px-1 py-0.5 bg-black/20 rounded-t-md mb-1 flex-shrink-0">
            <div className="text-[0.65rem] xs:text-xs sm:text-sm font-semibold">
                Score: You {gameState.playerScore} - AI {gameState.aiScore}
            </div>
            <button 
                onClick={handleTogglePause} 
                className="p-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full shadow-md" 
                title={gameState.isPaused ? "Resume Game" : "Pause Game"}
            >
                {gameState.isPaused ? <PlayIcon className="w-3 h-3 sm:w-4" /> : <PauseIcon className="w-3 h-3 sm:w-4" />}
            </button>
        </div>

        <div className="flex flex-grow overflow-hidden w-full">
            <div className="flex-grow flex flex-col items-center justify-between p-0.5 space-y-1">
                <div className="w-full flex flex-col items-center">
                    <PlayerInfo playerType="ai" cardCount={gameState.aiHand.length} isCurrent={gameState.currentPlayer === 'ai' && !gameState.winner && !gameState.isPaused && !gameState.isDealing} />
                    <div className="mt-0.5 w-full">
                        {renderHandLayout(gameState.aiHand, false)}
                    </div>
                </div>

                <div className="w-full flex-grow flex flex-col items-center justify-center my-0.5">
                    <div className="text-center mb-0.5 flex items-center">
                        <p className={`text-[0.65rem] xs:text-xs sm:text-sm font-semibold p-1 rounded-md transition-colors
                            ${gameState.winner === 'player' ? 'bg-blue-500' : gameState.winner === 'ai' ? 'bg-red-700' : 
                            (gameState.currentPlayer === 'player' && !gameState.isPaused && !gameState.isDealing ? 'bg-yellow-500 animate-pulse' : 'bg-neutral-600')} `}>
                            {gameState.isDealing ? "Dealing..." : (gameState.isPaused ? "Game Paused" : gameState.statusMessage)}
                        </p>
                        {gameState.currentPlayer === 'player' && !gameState.winner && !gameState.isPaused && !gameState.isDealing && (
                            <div className="ml-1 text-[0.55rem] xs:text-[0.6rem] sm:text-xs flex items-center bg-black/30 p-0.5 rounded">
                                <ClockIcon className="w-2 h-2 xs:w-3 xs:h-3 mr-0.5"/> {gameState.turnTimer}s
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-0.5 p-0.5 rounded-md bg-black/20 min-h-[75px] xs:min-h-[85px] sm:min-h-[100px] w-full max-w-[200px] xs:max-w-xs sm:max-w-sm border border-white/20 shadow-inner">
                    {gameState.table.length > 0 ? gameState.table.map(card => (
                        <CardDisplay key={card.id} card={card} className="shadow-xl transform scale-75 xs:scale-80 sm:scale-90"/>
                    )) : <p className="text-xs text-white/60 italic">Table is empty</p>}
                    </div>
                </div>
                
                <div className="w-full flex flex-col items-center">
                    <div className="mb-0.5 w-full">
                        {renderHandLayout(gameState.playerHand, true)}
                    </div>
                    <PlayerInfo playerType="player" cardCount={gameState.playerHand.length} isCurrent={gameState.currentPlayer === 'player' && !gameState.winner && !gameState.isPaused && !gameState.isDealing}/>
                </div>
            </div>

            <div className="w-20 xs:w-24 sm:w-auto flex-shrink-0 p-0.5 flex flex-col items-center justify-center space-y-1 sm:space-y-1.5 border-l-2 border-white/10 bg-black/10 rounded-r-md">
                <button
                    onClick={handlePlaySelectedCards}
                    disabled={gameState.currentPlayer !== 'player' || selectedPlayerCards.length === 0 || !!gameState.winner || gameState.isDealing || gameState.isPaused || gameState.turnTimer <= 0}
                    className="w-full px-1 py-1 text-[0.65rem] xs:text-xs sm:text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Play
                </button>
                <button
                    onClick={() => handlePassTurn(false)}
                    disabled={gameState.currentPlayer !== 'player' || !!gameState.winner || gameState.isDealing || gameState.isPaused || gameState.turnTimer <= 0}
                    className="w-full px-1 py-1 text-[0.65rem] xs:text-xs sm:text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-md shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Pass
                </button>
                <button
                    onClick={handleSortPlayerHand}
                    disabled={!!gameState.winner || gameState.isDealing || gameState.isPaused || gameState.playerHand.length === 0}
                    className="w-full p-1 text-[0.65rem] xs:text-xs sm:text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-md shadow-md transition-colors disabled:opacity-50 flex items-center justify-center"
                    title="Sort Hand"
                >
                    <ArrowsUpDownIcon className="w-3 h-3 sm:w-4 mr-0.5 xs:mr-1" /> Sort
                </button>
                <button
                    onClick={() => resetGame(gameState.winner !== null)} 
                    className="w-full p-1 text-[0.65rem] xs:text-xs sm:text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md shadow-md transition-colors flex items-center justify-center"
                    title={gameState.winner ? "Next Round" : "Restart Game"}
                >
                    <ArrowPathIcon className="w-3 h-3 sm:w-4 mr-0.5 xs:mr-1" /> {gameState.winner ? "Next" : "Restart"}
                </button>
            </div>
        </div>
    </div>
  );
};

export default TienLenGame;
