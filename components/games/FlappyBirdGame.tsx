import React, { useState, useEffect, useRef, useCallback } from 'react';

const GAME_WIDTH = 320;
const GAME_HEIGHT = 480;
const BIRD_SIZE = 20;
const GRAVITY = 0.3;
const JUMP_STRENGTH = -6;
const PIPE_WIDTH = 50;
const PIPE_GAP = 120;
const PIPE_SPEED = 2;
const PIPE_SPAWN_INTERVAL = 1800; // ms

interface Bird {
  y: number;
  velocity: number;
}

interface Pipe {
  id: number;
  x: number;
  topHeight: number;
}

interface FlappyBirdGameProps {
  handlePointsGain: (amount: number) => void;
}

const FlappyBirdGame: React.FC<FlappyBirdGameProps> = ({ handlePointsGain }) => {
  const [bird, setBird] = useState<Bird>({ y: GAME_HEIGHT / 2 - BIRD_SIZE / 2, velocity: 0 });
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastPipeSpawnTimeRef = useRef<number>(0);
  const pipeIdCounterRef = useRef<number>(0);
  const passedPipeIdsRef = useRef<Set<number>>(new Set());
  
  const [scale, setScale] = useState(1);
  const scoreReportedRef = useRef(false);

  useEffect(() => {
    if (gameOver && !scoreReportedRef.current) {
      handlePointsGain(score);
      scoreReportedRef.current = true;
    }
  }, [gameOver, score, handlePointsGain]);


  const resetGame = useCallback(() => {
    setBird({ y: GAME_HEIGHT / 2 - BIRD_SIZE / 2, velocity: 0 });
    setPipes([]);
    setScore(0);
    setGameOver(false);
    setGameStarted(false);
    lastPipeSpawnTimeRef.current = 0;
    pipeIdCounterRef.current = 0;
    passedPipeIdsRef.current.clear();
    scoreReportedRef.current = false;
  }, []);

  const spawnPipe = useCallback(() => {
    const minTopHeight = 50;
    const maxTopHeight = GAME_HEIGHT - PIPE_GAP - minTopHeight;
    const topHeight = Math.floor(Math.random() * (maxTopHeight - minTopHeight + 1)) + minTopHeight;
    
    setPipes(prevPipes => [
      ...prevPipes,
      { id: pipeIdCounterRef.current++, x: GAME_WIDTH, topHeight },
    ]);
  }, []);

  const gameLoop = useCallback(() => {
      if (!gameStarted || gameOver) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Bird physics
      setBird(prevBird => {
        const newVelocity = prevBird.velocity + GRAVITY;
        let newY = prevBird.y + newVelocity;
        
        if (newY < 0) {
            newY = 0;
            return { y: newY, velocity: 0 };
        }

        return { y: newY, velocity: newVelocity };
      });

      // Pipe logic
      setPipes(prevPipes =>
        prevPipes
          .map(pipe => ({ ...pipe, x: pipe.x - PIPE_SPEED }))
          .filter(pipe => pipe.x + PIPE_WIDTH > 0) 
      );

      // Collision detection & Score
      setBird(currentBird => { 
        if (gameOver) return currentBird;

        // Ground collision
        if (currentBird.y + BIRD_SIZE > GAME_HEIGHT) {
          setGameOver(true);
          return { ...currentBird, y: GAME_HEIGHT - BIRD_SIZE, velocity: 0 }; 
        }

        const birdXPosition = GAME_WIDTH / 4;
        for (const pipe of pipes) {
          const birdLeft = birdXPosition; 
          const birdRight = birdLeft + BIRD_SIZE;
          const birdTop = currentBird.y;
          const birdBottom = currentBird.y + BIRD_SIZE;
          
          if (birdRight > pipe.x && birdLeft < pipe.x + PIPE_WIDTH) { 
            const topPipeBottom = pipe.topHeight;
            const bottomPipeTop = pipe.topHeight + PIPE_GAP;
            if (birdTop < topPipeBottom || birdBottom > bottomPipeTop) { 
              setGameOver(true);
              return currentBird; 
            }
          }
          
          if (pipe.x + PIPE_WIDTH < birdLeft && !passedPipeIdsRef.current.has(pipe.id)) {
            setScore(s => s + 1);
            passedPipeIdsRef.current.add(pipe.id);
          }
        }
        return currentBird; 
      });
      
      gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameStarted, gameOver, pipes]); 

  useEffect(() => {
      if (gameStarted && !gameOver) {
          const now = performance.now();
          if (now - lastPipeSpawnTimeRef.current > PIPE_SPAWN_INTERVAL) {
            spawnPipe();
            lastPipeSpawnTimeRef.current = now;
          }
      }
  }, [gameStarted, gameOver, pipes, spawnPipe]);

  const handleGameInteraction = useCallback(() => {
    if (!gameStarted) {
      setGameStarted(true);
      lastPipeSpawnTimeRef.current = performance.now(); 
      setBird(prev => ({ ...prev, velocity: JUMP_STRENGTH })); 
    } else if (gameOver) {
      resetGame();
    } else {
      setBird(prevBird => ({ ...prevBird, velocity: JUMP_STRENGTH }));
    }
  }, [gameStarted, gameOver, resetGame]);
  
  useEffect(() => {
    const area = gameAreaRef.current;
    if (area) {
        area.addEventListener('click', handleGameInteraction);
        area.focus();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                handleGameInteraction();
            }
        }
        area.addEventListener('keydown', handleKeyDown);

        return () => {
            area.removeEventListener('click', handleGameInteraction);
            area.removeEventListener('keydown', handleKeyDown);
        };
    }
  }, [handleGameInteraction]);

  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameLoop]); 

  useEffect(() => {
    const handleResize = () => {
        if (containerRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            setScale(containerWidth / GAME_WIDTH);
        }
    };
    const resizeObserver = new ResizeObserver(handleResize);
    if(containerRef.current) {
        resizeObserver.observe(containerRef.current);
    }
    handleResize();
    return () => resizeObserver.disconnect();
  }, []);

  const birdXRenderPosition = GAME_WIDTH / 4;

  return (
    <div ref={containerRef} className="w-full max-w-[320px] aspect-[320/480] mx-auto select-none">
      <div 
        ref={gameAreaRef}
        className="relative bg-sky-400 dark:bg-sky-900 overflow-hidden border-2 border-neutral-500 dark:border-neutral-700 cursor-pointer shadow-lg"
        style={{
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
        }}
        role="application"
        tabIndex={0} 
        aria-label="Flappy Bird Game Area. Click, tap, or press space to make the bird jump or to start/restart game."
      >
        <div
          className="absolute bg-yellow-400 border-2 border-yellow-600 rounded-full"
          style={{
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            left: birdXRenderPosition,
            top: bird.y,
          }}
          role="img"
          aria-label="Bird"
        ></div>

        {pipes.map(pipe => (
          <React.Fragment key={pipe.id}>
            <div
              className="absolute bg-emerald-500 border-2 border-emerald-700 dark:border-emerald-300"
              style={{
                left: pipe.x,
                top: 0,
                width: PIPE_WIDTH,
                height: pipe.topHeight,
              }}
              role="presentation"
            ></div>
            <div
              className="absolute bg-emerald-500 border-2 border-emerald-700 dark:border-emerald-300"
              style={{
                left: pipe.x,
                top: pipe.topHeight + PIPE_GAP,
                width: PIPE_WIDTH,
                height: GAME_HEIGHT - (pipe.topHeight + PIPE_GAP),
              }}
              role="presentation"
            ></div>
          </React.Fragment>
        ))}
        
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white text-3xl font-bold" style={{ textShadow: '1px 1px 2px black' }}>
          {score}
        </div>

        {(!gameStarted || gameOver) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div className="text-center p-4 bg-white/80 dark:bg-slate-800/80 rounded-md shadow-xl text-slate-800 dark:text-slate-200">
                <h3 className="text-2xl font-bold mb-2">
                {gameOver ? 'Game Over!' : 'Flappy Bird'}
                </h3>
                {gameOver && <p className="text-lg mb-1">Your Score: {score}</p>}
                <p className="text-md">
                {gameOver ? 'Click to Play Again' : 'Click to Start'}
                </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlappyBirdGame;
