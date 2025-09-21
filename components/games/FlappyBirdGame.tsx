
import React, { useState, useEffect, useRef, useCallback } from 'react';

const GAME_WIDTH = 320;
const GAME_HEIGHT = 480;
const BIRD_SIZE = 20; // Represents the ball size
const GRAVITY = 0.3;
const JUMP_STRENGTH = -6;
const PIPE_WIDTH = 50;
const PIPE_GAP = 120; // Vertical gap between pipes
const PIPE_SPEED = 2;
const PIPE_SPAWN_INTERVAL = 1800; // ms

interface Bird { // Renaming to 'Ball' internally might be more consistent but 'Bird' is fine for structure
  y: number;
  velocity: number;
}

interface Pipe {
  id: number;
  x: number;
  topHeight: number; // Height of the top pipe part
}

const FlappyBirdGame: React.FC = () => {
  const [ball, setBall] = useState<Bird>({ y: GAME_HEIGHT / 2 - BIRD_SIZE / 2, velocity: 0 });
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [score, setScore] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameStarted, setGameStarted] = useState<boolean>(false);

  const gameAreaRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastPipeSpawnTimeRef = useRef<number>(0);
  const pipeIdCounterRef = useRef<number>(0);
  const passedPipeIdsRef = useRef<Set<number>>(new Set());

  const resetGame = useCallback(() => {
    setBall({ y: GAME_HEIGHT / 2 - BIRD_SIZE / 2, velocity: 0 });
    setPipes([]);
    setScore(0);
    setGameOver(false);
    setGameStarted(false);
    lastPipeSpawnTimeRef.current = 0;
    pipeIdCounterRef.current = 0;
    passedPipeIdsRef.current.clear();
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

  useEffect(() => {
    const gameLoop = (timestamp: number) => {
      if (!gameStarted || gameOver) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Ball physics
      setBall(prevBall => {
        const newVelocity = prevBall.velocity + GRAVITY;
        let newY = prevBall.y + newVelocity;
        
        if (newY < 0) { // Prevent ball from going off top
            newY = 0;
            // Optionally, could also make velocity 0 if it hits the top
            // newVelocity = 0; 
        }

        return { y: newY, velocity: newVelocity };
      });

      // Pipe logic
      if (timestamp - lastPipeSpawnTimeRef.current > PIPE_SPAWN_INTERVAL) {
        spawnPipe();
        lastPipeSpawnTimeRef.current = timestamp;
      }

      setPipes(prevPipes =>
        prevPipes
          .map(pipe => ({ ...pipe, x: pipe.x - PIPE_SPEED }))
          .filter(pipe => pipe.x + PIPE_WIDTH > 0) 
      );

      // Collision detection & Score
      setBall(currentBall => { 
        // Ground collision
        if (currentBall.y + BIRD_SIZE > GAME_HEIGHT) {
          setGameOver(true);
          return { ...currentBall, y: GAME_HEIGHT - BIRD_SIZE, velocity: 0 }; 
        }

        const ballXPosition = GAME_WIDTH / 4 - BIRD_SIZE / 2; // Ball's fixed X position
        for (const pipe of pipes) {
          const ballLeft = ballXPosition; 
          const ballRight = ballLeft + BIRD_SIZE;
          const ballTop = currentBall.y;
          const ballBottom = currentBall.y + BIRD_SIZE;

          const pipeRight = pipe.x + PIPE_WIDTH;
          
          if (ballRight > pipe.x && ballLeft < pipeRight) { 
            const topPipeBottom = pipe.topHeight;
            const bottomPipeTop = pipe.topHeight + PIPE_GAP;
            if (ballTop < topPipeBottom || ballBottom > bottomPipeTop) { 
              setGameOver(true);
              return currentBall; 
            }
          }
          
          if (pipe.x + PIPE_WIDTH < ballLeft && !passedPipeIdsRef.current.has(pipe.id)) {
            setScore(s => s + 1);
            passedPipeIdsRef.current.add(pipe.id);
          }
        }
        return currentBall; 
      });
      
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameStarted, gameOver, pipes, spawnPipe]); 

  const handleGameInteraction = useCallback(() => {
    if (!gameStarted) {
      setGameStarted(true);
      lastPipeSpawnTimeRef.current = performance.now(); 
      setBall(prev => ({ ...prev, velocity: JUMP_STRENGTH })); 
    } else if (gameOver) {
      resetGame();
    } else {
      setBall(prevBall => ({ ...prevBall, velocity: JUMP_STRENGTH }));
    }
  }, [gameStarted, gameOver, resetGame]); // setGameStarted, setBall are stable from useState
  
  useEffect(() => {
    const area = gameAreaRef.current;
    if (area) {
        area.addEventListener('click', handleGameInteraction);
        return () => {
            area.removeEventListener('click', handleGameInteraction);
        };
    }
  }, [handleGameInteraction]); // Depends on memoized handleGameInteraction

  const ballXRenderPosition = GAME_WIDTH / 4 - BIRD_SIZE / 2;

  return (
    <div className="flex flex-col items-center select-none">
      <div 
        ref={gameAreaRef}
        className="relative bg-sky-400 dark:bg-sky-900 overflow-hidden border-2 border-neutral-500 dark:border-neutral-700 cursor-pointer shadow-lg"
        style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
        role="application"
        tabIndex={0} 
        aria-label="Flappy Ball Game Area. Click or Tap to make the ball jump or to start/restart game."
      >
        {/* Ball */}
        <div
          className="absolute bg-red-500 border-2 border-red-700 rounded-full" // Changed to red ball
          style={{
            width: BIRD_SIZE,
            height: BIRD_SIZE,
            left: ballXRenderPosition,
            top: ball.y,
            // transition: 'top 0.05s linear', // Removed for direct JS control
          }}
          role="img"
          aria-label="Ball"
        ></div>

        {/* Pipes */}
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
            <div className="text-center p-4 bg-neutral-light dark:bg-neutral-darker rounded-md shadow-xl">
                <h3 className="text-2xl font-bold text-primary dark:text-primary-light mb-2">
                {gameOver ? 'Game Over!' : 'Flappy Ball'}
                </h3>
                {gameOver && <p className="text-lg text-neutral-700 dark:text-neutral-300 mb-1">Your Score: {score}</p>}
                <p className="text-md text-neutral-600 dark:text-neutral-400">
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
