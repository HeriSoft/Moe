import React, { useState, useEffect } from 'react';

const BOARD_SIZE = 8;

// --- FIX: cả trắng & đen dùng glyph solid → cùng kích thước ---
const PIECES: { [key: string]: string } = {
    r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟',
    R: '♜', N: '♞', B: '♝', Q: '♛', K: '♚', P: '♟'
};

const INITIAL_SETUP = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
];

const PIECE_VALUES: any = {
    p: 10, r: 50, n: 30, b: 30, q: 90, k: 900,
    P: -10, R: -50, N: -30, B: -30, Q: -90, K: -900
};

type Board = (string | null)[][];
type Move = { r: number; c: number; isCapture: boolean };
type Position = { r: number; c: number };

const getPieceColor = (p: string | null) =>
    !p ? null : p === p.toUpperCase() ? 'white' : 'black';

const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

// ---------------- MOVES ----------------
const getValidMoves = (board: Board, r: number, c: number): Move[] => {
    const piece = board[r][c];
    if (!piece) return [];

    const color = getPieceColor(piece);
    const type = piece.toLowerCase();
    const moves: Move[] = [];

    const tryAdd = (tr: number, tc: number) => {
        if (!onBoard(tr, tc)) return false;
        const target = board[tr][tc];
        const tColor = getPieceColor(target);

        if (!target) {
            moves.push({ r: tr, c: tc, isCapture: false });
            return true;
        } else if (tColor !== color) {
            moves.push({ r: tr, c: tc, isCapture: true });
            return false;
        }
        return false;
    };

    if (type === 'p') {
        const dir = color === 'white' ? -1 : 1;
        const start = color === 'white' ? 6 : 1;

        if (onBoard(r + dir, c) && !board[r + dir][c]) {
            moves.push({ r: r + dir, c, isCapture: false });
            if (r === start && !board[r + dir * 2][c]) {
                moves.push({ r: r + dir * 2, c, isCapture: false });
            }
        }
        [[dir, -1], [dir, 1]].forEach(([dr, dc]) => {
            const tr = r + dr, tc = c + dc;
            if (onBoard(tr, tc)) {
                const t = board[tr][tc];
                if (t && getPieceColor(t) !== color) {
                    moves.push({ r: tr, c: tc, isCapture: true });
                }
            }
        });
    }

    else if (type === 'n') {
        [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(
            ([dr, dc]) => tryAdd(r + dr, c + dc)
        );
    }

    else if (type === 'k') {
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(
            ([dr, dc]) => tryAdd(r + dr, c + dc)
        );
    }

    else {
        const dirs = type === 'r'
            ? [[-1,0],[1,0],[0,-1],[0,1]]
            : type === 'b'
            ? [[-1,-1],[-1,1],[1,-1],[1,1]]
            : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];

        dirs.forEach(([dr, dc]) => {
            let i = 1;
            while (true) {
                if (!tryAdd(r + dr * i, c + dc * i)) break;
                i++;
            }
        });
    }

    return moves;
};

// -------------- AI + MINIMAX (rút gọn) --------------
const evaluate = (board: Board) => {
    let score = 0;
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c]) score += PIECE_VALUES[board[r][c]];
    return score;
};

const makeMove = (board: Board, from: Position, to: Position): Board => {
    const b = board.map(row => [...row]);
    b[to.r][to.c] = b[from.r][from.c];
    b[from.r][from.c] = null;
    return b;
};

const getAllMoves = (board: Board, color: 'white'|'black') => {
    const all: { from: Position; to: Move }[] = [];
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (getPieceColor(board[r][c]) === color)
                getValidMoves(board, r, c).forEach(m =>
                    all.push({ from: { r, c }, to: m })
                );

    return all.sort((a,b)=> (b.to.isCapture?1:0)-(a.to.isCapture?1:0));
};

// ----------------- COMPONENT ------------------
const ChessGame = () => {
    const [board, setBoard] = useState<Board>(JSON.parse(JSON.stringify(INITIAL_SETUP)));
    const [turn, setTurn] = useState<'white'|'black'>('white');
    const [selected, setSelected] = useState<Position|null>(null);
    const [moves, setMoves] = useState<Move[]>([]);

    const clickCell = (r: number, c: number) => {
        if (turn !== 'white') return;

        const p = board[r][c];
        const color = getPieceColor(p);

        if (!selected) {
            if (color !== 'white') return;
            setSelected({ r, c });
            setMoves(getValidMoves(board, r, c));
            return;
        }

        if (selected.r === r && selected.c === c) {
            setSelected(null);
            setMoves([]);
            return;
        }

        if (color === 'white') {
            setSelected({ r, c });
            setMoves(getValidMoves(board, r, c));
            return;
        }

        const mv = moves.find(m => m.r === r && m.c === c);
        if (!mv) {
            setSelected(null);
            setMoves([]);
            return;
        }

        const newBoard = makeMove(board, selected, mv);
        setBoard(newBoard);
        setSelected(null);
        setMoves([]);
        setTurn('black');
    };

    return (
        <div className="flex justify-center mt-4">
            <div className="grid grid-cols-8 border-4 border-amber-900 rounded">
                {board.map((row, r) =>
                    row.map((p, c) => (
                        <div
                            key={r + '-' + c}
                            onClick={() => clickCell(r, c)}
                            className={`
                                w-12 h-12 flex items-center justify-center text-3xl cursor-pointer
                                ${(r+c)%2===0 ? 'bg-[#ebecd0]' : 'bg-[#739552]'}
                                ${selected?.r===r && selected?.c===c ? '!bg-yellow-200' : ''}
                            `}
                        >
                            {p && (
                                <span className={`${
                                    getPieceColor(p)==='white'
                                        ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]'
                                        : 'text-black'
                                }`}>
                                    {PIECES[p]}
                                </span>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ChessGame;
