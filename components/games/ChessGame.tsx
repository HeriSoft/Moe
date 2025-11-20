
import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- CHESS LOGIC & AI ---

const BOARD_SIZE = 8;
const PIECES: { [key: string]: string } = {
    r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟', // Black
    R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙'  // White
};

const INITIAL_SETUP = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

const PIECE_VALUES: { [key: string]: number } = {
    p: 10, r: 50, n: 30, b: 30, q: 90, k: 900,
    P: -10, R: -50, N: -30, B: -30, Q: -90, K: -900
};

// Helper types
type Board = (string | null)[][];
type Move = { r: number; c: number; isCapture: boolean; score?: number };
type Position = { r: number; c: number };

const getPieceColor = (piece: string | null) => {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'white' : 'black';
};

const onBoard = (r: number, c: number) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

const getValidMoves = (board: Board, r: number, c: number): Move[] => {
    const piece = board[r][c];
    if (!piece) return [];

    const color = getPieceColor(piece);
    const type = piece.toLowerCase();
    const moves: Move[] = [];

    const tryAddMove = (tr: number, tc: number) => {
        if (!onBoard(tr, tc)) return false;
        const target = board[tr][tc];
        const targetColor = getPieceColor(target);

        if (!target) {
            moves.push({ r: tr, c: tc, isCapture: false });
            return true;
        } else if (targetColor !== color) {
            moves.push({ r: tr, c: tc, isCapture: true });
            return false;
        }
        return false;
    };

    if (type === 'p') {
        const direction = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;

        if (onBoard(r + direction, c) && !board[r + direction][c]) {
            moves.push({ r: r + direction, c: c, isCapture: false });
            if (r === startRow && !board[r + direction * 2][c]) {
                moves.push({ r: r + direction * 2, c: c, isCapture: false });
            }
        }
        [[direction, -1], [direction, 1]].forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (onBoard(tr, tc)) {
                const target = board[tr][tc];
                if (target && getPieceColor(target) !== color) {
                    moves.push({ r: tr, c: tc, isCapture: true });
                }
            }
        });
    } else if (type === 'n') {
        [[ -2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => tryAddMove(r + dr, c + dc));
    } else if (type === 'k') {
        [[ -1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => tryAddMove(r + dr, c + dc));
    } else { // r, b, q (sliding pieces)
        const directions = type === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]] :
                           type === 'b' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] :
                           [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        directions.forEach(([dr, dc]) => {
            let i = 1;
            while (true) {
                if (!tryAddMove(r + dr * i, c + dc * i)) break;
                i++;
            }
        });
    }
    return moves;
};

// Minimax with Alpha-Beta Pruning
const evaluateBoard = (board: Board): number => {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) score += PIECE_VALUES[p] || 0;
        }
    }
    return score;
};

const minimax = (board: Board, depth: number, alpha: number, beta: number, isMaximizing: boolean): number => {
    if (depth === 0) return evaluateBoard(board);

    // Simple King capture check for end game
    let kingFound = false;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(board[r][c] === (isMaximizing ? 'K' : 'k')) kingFound = true;
    if (!kingFound) return isMaximizing ? -10000 : 10000; // Opponent king gone is good

    if (isMaximizing) { // AI is Black (positive value in piece map is black... wait, logic inversion in PIECE_VALUES. Let's fix)
        // In PIECE_VALUES: Black is Positive (p=10), White is Negative (P=-10).
        // So AI (Black) wants to MAXIMIZE score.
        let maxEval = -Infinity;
        const moves = getAllMoves(board, 'black');
        if (moves.length === 0) return evaluateBoard(board);

        for (const move of moves) {
            const newBoard = makeMove(board, move.from, move.to);
            const evalScore = minimax(newBoard, depth - 1, alpha, beta, false);
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else { // Human is White (Negative scores)
        let minEval = Infinity;
        const moves = getAllMoves(board, 'white');
        if (moves.length === 0) return evaluateBoard(board);

        for (const move of moves) {
            const newBoard = makeMove(board, move.from, move.to);
            const evalScore = minimax(newBoard, depth - 1, alpha, beta, true);
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

const getAllMoves = (board: Board, color: 'white' | 'black'): { from: Position, to: Move }[] => {
    const allMoves: { from: Position, to: Move }[] = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (getPieceColor(board[r][c]) === color) {
                const moves = getValidMoves(board, r, c);
                moves.forEach(m => allMoves.push({ from: { r, c }, to: m }));
            }
        }
    }
    // Sort moves for better pruning (captures first)
    return allMoves.sort((a, b) => (b.to.isCapture ? 1 : 0) - (a.to.isCapture ? 1 : 0));
};

const makeMove = (board: Board, from: Position, to: Position): Board => {
    const newBoard = board.map(row => [...row]);
    newBoard[to.r][to.c] = newBoard[from.r][from.c];
    newBoard[from.r][from.c] = null;
    return newBoard;
};


// --- COMPONENT ---

interface ChessGameProps {
    handlePointsGain: (amount: number) => void;
    setNotifications: React.Dispatch<React.SetStateAction<string[]>>;
}

const ChessGame: React.FC<ChessGameProps> = ({ handlePointsGain, setNotifications }) => {
    const [board, setBoard] = useState<Board>(JSON.parse(JSON.stringify(INITIAL_SETUP)));
    const [turn, setTurn] = useState<'white' | 'black'>('white'); // User is white
    const [selected, setSelected] = useState<Position | null>(null);
    const [possibleMoves, setPossibleMoves] = useState<Move[]>([]);
    const [log, setLog] = useState<string[]>(['Game started. You are White.']);
    const [winner, setWinner] = useState<'white' | 'black' | null>(null);
    const [isAiThinking, setIsAiThinking] = useState(false);

    // AI Turn Effect
    useEffect(() => {
        if (turn === 'black' && !winner) {
            setIsAiThinking(true);
            // Small timeout to let UI render "Thinking" state
            setTimeout(() => {
                makeAiMove();
            }, 500);
        }
    }, [turn, winner]);

    const makeAiMove = () => {
        const depth = 3; // Depth 3 is decent for browser JS
        let bestMove: { from: Position, to: Move } | null = null;
        let maxEval = -Infinity;
        const moves = getAllMoves(board, 'black');

        if (moves.length === 0) {
            // Stalemate or checkmate logic could go here, but simplistic end is fine
            setLog(prev => ["AI has no moves.", ...prev]);
            return;
        }

        // Root Maximizer
        for (const move of moves) {
            const newBoard = makeMove(board, move.from, move.to);
            // If this move captures the King, take it immediately (win)
            if (board[move.to.r][move.to.c] === 'K') {
                bestMove = move;
                break;
            }
            
            const evalScore = minimax(newBoard, depth - 1, -Infinity, Infinity, false);
            if (evalScore > maxEval) {
                maxEval = evalScore;
                bestMove = move;
            }
        }

        if (bestMove) {
            executeMove(bestMove.from, bestMove.to);
        } else {
            // Fallback (shouldn't happen if moves > 0)
            const randomMove = moves[Math.floor(Math.random() * moves.length)];
            executeMove(randomMove.from, randomMove.to);
        }
        setIsAiThinking(false);
    };

    const handleCellClick = (r: number, c: number) => {
        if (winner || isAiThinking || turn !== 'white') return;

        const clickedPiece = board[r][c];
        const clickedColor = getPieceColor(clickedPiece);

        // Select piece
        if (!selected) {
            if (!clickedPiece || clickedColor !== 'white') return;
            setSelected({ r, c });
            setPossibleMoves(getValidMoves(board, r, c));
            return;
        }

        // Unselect or Switch piece
        if (selected.r === r && selected.c === c) {
            setSelected(null);
            setPossibleMoves([]);
            return;
        }
        if (clickedColor === 'white') {
            setSelected({ r, c });
            setPossibleMoves(getValidMoves(board, r, c));
            return;
        }

        // Move
        const move = possibleMoves.find(m => m.r === r && m.c === c);
        if (move) {
            executeMove(selected, { r, c });
        } else {
            setSelected(null);
            setPossibleMoves([]);
        }
    };

    const executeMove = (from: Position, to: { r: number; c: number }) => {
        const piece = board[from.r][from.c];
        const target = board[to.r][to.c];
        
        const newBoard = makeMove(board, from, to);
        setBoard(newBoard);
        
        // Pawn Promotion (Auto Queen for simplicity)
        if (piece === 'P' && to.r === 0) newBoard[to.r][to.c] = 'Q';
        if (piece === 'p' && to.r === 7) newBoard[to.r][to.c] = 'q';

        const pName = PIECES[piece || ''] || '?';
        const moveStr = `${turn === 'white' ? 'You' : 'AI'}: ${pName} to ${String.fromCharCode(97 + to.c)}${8 - to.r}`;
        setLog(prev => [moveStr, ...prev]);

        // Check Win
        if (target && target.toLowerCase() === 'k') {
            setWinner(turn);
            const winMsg = turn === 'white' ? "You captured the King! You Win!" : "AI captured your King! You Lose.";
            setLog(prev => [winMsg, ...prev]);
            if (turn === 'white') handlePointsGain(50);
            return;
        }

        setTurn(turn === 'white' ? 'black' : 'white');
        setSelected(null);
        setPossibleMoves([]);
    };

    const resetGame = () => {
        setBoard(JSON.parse(JSON.stringify(INITIAL_SETUP)));
        setTurn('white');
        setSelected(null);
        setPossibleMoves([]);
        setWinner(null);
        setLog(['Game reset.']);
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full">
            <div className="flex gap-4 items-start w-full justify-center">
                {/* Board */}
                <div className="grid grid-cols-8 gap-0 border-4 border-amber-900 rounded select-none">
                    {board.map((row, r) => (
                        row.map((piece, c) => {
                            const isWhiteSq = (r + c) % 2 === 0;
                            const isSelected = selected?.r === r && selected?.c === c;
                            const isHint = possibleMoves.some(m => m.r === r && m.c === c);
                            const isLastMove = false; // Could track last move for highlighting

                            return (
                                <div
                                    key={`${r}-${c}`}
                                    onClick={() => handleCellClick(r, c)}
                                    className={`
                                        w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center text-2xl sm:text-3xl cursor-pointer relative
                                        ${isWhiteSq ? 'bg-[#ebecd0]' : 'bg-[#739552]'}
                                        ${isSelected ? '!bg-yellow-200' : ''}
                                        ${isLastMove ? 'bg-yellow-100' : ''}
                                    `}
                                >
                                    {piece && (
                                        <span className={`z-10 ${getPieceColor(piece) === 'white' ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]' : 'text-black'}`}>
                                            {PIECES[piece]}
                                        </span>
                                    )}
                                    {isHint && (
                                        <div className={`absolute w-3 h-3 rounded-full ${board[r][c] ? 'border-4 border-black/20 w-full h-full !rounded-none' : 'bg-black/20'}`}></div>
                                    )}
                                </div>
                            );
                        })
                    ))}
                </div>

                {/* Sidebar */}
                <div className="hidden sm:flex flex-col gap-2 w-48 h-[400px]">
                    <div className="bg-slate-800 text-white p-3 rounded-lg shadow text-center">
                        <div className="font-bold mb-1">{winner ? (winner === 'white' ? 'YOU WON!' : 'AI WON!') : (turn === 'white' ? 'Your Turn' : 'AI Thinking...')}</div>
                        {isAiThinking && <div className="text-xs animate-pulse text-yellow-400">Calculating best move...</div>}
                    </div>
                    <div className="flex-grow bg-slate-100 dark:bg-slate-800 rounded-lg p-2 overflow-y-auto text-xs font-mono border border-slate-300 dark:border-slate-700">
                        {log.map((l, i) => <div key={i} className="mb-1 border-b border-slate-200 dark:border-slate-700 pb-1">{l}</div>)}
                    </div>
                    <button onClick={resetGame} className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold text-sm">Restart Game</button>
                </div>
            </div>

            {/* Mobile Controls */}
            <div className="sm:hidden flex flex-col gap-2 w-full">
                 <div className="flex justify-between items-center bg-slate-800 text-white p-2 rounded">
                    <span>{turn === 'white' ? 'Your Turn' : 'AI...'}</span>
                    <button onClick={resetGame} className="px-2 py-1 bg-indigo-500 rounded text-xs">Reset</button>
                 </div>
                 <div className="bg-slate-100 dark:bg-slate-800 h-20 overflow-y-auto text-xs p-2 rounded">
                    {log[0]}
                 </div>
            </div>
        </div>
    );
};

export default ChessGame;
