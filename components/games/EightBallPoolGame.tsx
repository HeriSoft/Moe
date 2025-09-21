
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useNotification } from '../../contexts/NotificationContext.tsx';

const LOGICAL_TABLE_WIDTH = 600;
const LOGICAL_TABLE_HEIGHT = 300;
const LOGICAL_BALL_RADIUS = 8;
const LOGICAL_POCKET_RADIUS = 12;
const LOGICAL_RAIL_WIDTH = LOGICAL_POCKET_RADIUS * 1.5;


const CUE_BALL_COLOR = 'white';
const EIGHT_BALL_COLOR = 'black';
const SOLID_BALL_COLOR = '#FBBF24'; // amber-400 for yellow
const STRIPED_BALL_COLOR = '#3B82F6'; // blue-500

const FRICTION = 0.985;
const MIN_VELOCITY_THRESHOLD = 0.05;
const COLLISION_DAMPING = 0.85;

interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isPocketed: boolean;
  type: 'cue' | 'eight' | 'solid' | 'stripe';
}

const initialBallsSetup = (): Ball[] => {
  const balls: Ball[] = [];
  const R = LOGICAL_BALL_RADIUS;
  const D = R * 2; // Diameter

  // Cue ball
  balls.push({
    id: 'cue', x: LOGICAL_TABLE_WIDTH / 4, y: LOGICAL_TABLE_HEIGHT / 2,
    vx: 0, vy: 0, radius: R, color: CUE_BALL_COLOR, isPocketed: false, type: 'cue',
  });

  // Rack setup
  const apexX = LOGICAL_TABLE_WIDTH * 0.75; // Foot spot for the apex ball
  const apexY = LOGICAL_TABLE_HEIGHT / 2;

  let currentId = 0;
  const createBall = (type: Ball['type'], color: string, tempId: string | number) => ({
    id: `${type}-${tempId}`, x: 0, y: 0, vx: 0, vy: 0, radius: R, color, isPocketed: false, type
  });

  const rackBalls: Ball[] = [];
  // 1 eight-ball
  rackBalls.push(createBall('eight', EIGHT_BALL_COLOR, 8));
  // 7 solids
  for (let i = 0; i < 7; i++) rackBalls.push(createBall('solid', SOLID_BALL_COLOR, `s${i}`));
  // 7 stripes
  for (let i = 0; i < 7; i++) rackBalls.push(createBall('stripe', STRIPED_BALL_COLOR, `st${i}`));

  // Shuffle the 14 object balls (excluding 8-ball for specific placement)
  const objectBalls = rackBalls.filter(b => b.type !== 'eight');
  for (let i = objectBalls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [objectBalls[i], objectBalls[j]] = [objectBalls[j], objectBalls[i]];
  }
  
  // Standard 15-ball rack positions
  // Row 1 (Apex)
  balls.push({ ...objectBalls.pop()!, x: apexX, y: apexY });

  // Row 2
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) / 2, y: apexY - R });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) / 2, y: apexY + R });

  // Row 3 (8-ball in middle)
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3), y: apexY - D });
  balls.push({ ...rackBalls.find(b => b.type === 'eight')!, x: apexX + D * Math.sqrt(3), y: apexY });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3), y: apexY + D });
  
  // Row 4
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 1.5, y: apexY - R * 3 });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 1.5, y: apexY - R });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 1.5, y: apexY + R });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 1.5, y: apexY + R * 3 });

  // Row 5 (ensure corners are one solid, one stripe if possible from remaining)
  const remainingSolids = objectBalls.filter(b => b.type === 'solid');
  const remainingStripes = objectBalls.filter(b => b.type === 'stripe');
  
  const corner1 = remainingSolids.length > 0 ? remainingSolids.pop()! : objectBalls.pop()!;
  const corner2 = remainingStripes.length > 0 ? remainingStripes.pop()! : objectBalls.pop()!;

  balls.push({ ...corner1, x: apexX + D * Math.sqrt(3) * 2, y: apexY - D * 2 }); // Top corner
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 2, y: apexY - D });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 2, y: apexY });
  balls.push({ ...objectBalls.pop()!, x: apexX + D * Math.sqrt(3) * 2, y: apexY + D });
  balls.push({ ...corner2, x: apexX + D * Math.sqrt(3) * 2, y: apexY + D * 2 }); // Bottom corner
  
  return balls;
};


const logicalPockets = [
  { x: LOGICAL_POCKET_RADIUS / 2 + 5, y: LOGICAL_POCKET_RADIUS / 2 + 5 }, 
  { x: LOGICAL_TABLE_WIDTH / 2, y: LOGICAL_POCKET_RADIUS / 2 - 2 },     
  { x: LOGICAL_TABLE_WIDTH - LOGICAL_POCKET_RADIUS / 2 - 5, y: LOGICAL_POCKET_RADIUS / 2 + 5 },
  { x: LOGICAL_POCKET_RADIUS / 2 + 5, y: LOGICAL_TABLE_HEIGHT - LOGICAL_POCKET_RADIUS / 2 - 5 },
  { x: LOGICAL_TABLE_WIDTH / 2, y: LOGICAL_TABLE_HEIGHT - LOGICAL_POCKET_RADIUS / 2 + 2 },
  { x: LOGICAL_TABLE_WIDTH - LOGICAL_POCKET_RADIUS / 2 - 5, y: LOGICAL_TABLE_HEIGHT - LOGICAL_POCKET_RADIUS / 2 - 5 },
];


const EightBallPoolGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [ballsState, setBallsState] = useState<Ball[]>(initialBallsSetup());
  const ballsRef = useRef<Ball[]>(ballsState);

  const [isAimingState, setIsAimingState] = useState(false);
  const isAimingRef = useRef(isAimingState);

  const [aimStartState, setAimStartState] = useState<{ x: number; y: number } | null>(null);
  const aimStartRef = useRef(aimStartState);
  
  const [aimEndState, setAimEndState] = useState<{ x: number; y: number } | null>(null);
  const aimEndRef = useRef(aimEndState);

  const { addNotification } = useNotification();
  const animationFrameIdRef = useRef<number | null>(null);
  
  const [scaleFactorState, setScaleFactorState] = useState(1);
  const scaleFactorRef = useRef(scaleFactorState);

  const [gameOverState, setGameOverState] = useState<string | null>(null);
  const gameOverRef = useRef(gameOverState);

  useEffect(() => { ballsRef.current = ballsState; }, [ballsState]);
  useEffect(() => { isAimingRef.current = isAimingState; }, [isAimingState]);
  useEffect(() => { aimStartRef.current = aimStartState; }, [aimStartState]);
  useEffect(() => { aimEndRef.current = aimEndState; }, [aimEndState]);
  useEffect(() => { scaleFactorRef.current = scaleFactorState; }, [scaleFactorState]);
  useEffect(() => { gameOverRef.current = gameOverState; }, [gameOverState]);


  const drawBall = useCallback((ctx: CanvasRenderingContext2D, ball: Ball) => {
    if (ball.isPocketed) return;
    const currentScale = scaleFactorRef.current;
    const x = ball.x * currentScale;
    const y = ball.y * currentScale;
    const r = ball.radius * currentScale;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    
    if (ball.type === 'stripe') {
        ctx.save();
        ctx.clip(); // Clip to the ball's path
        ctx.fillStyle = 'white';
        ctx.fillRect(x - r, y - r * 0.3, r * 2, r * 0.6); // Draw a horizontal stripe
        ctx.restore();
    } else if (ball.type === 'solid' && ball.color !== EIGHT_BALL_COLOR) { // Small number circle for solids (not 8-ball)
        // This is just a visual cue, not actual numbers
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = ball.color === CUE_BALL_COLOR ? 'grey' : (ball.color === EIGHT_BALL_COLOR ? '#333' : 'black');
    ctx.lineWidth = 1 * currentScale;
    ctx.stroke();
    ctx.closePath();
  }, []);

  const drawTable = useCallback((ctx: CanvasRenderingContext2D) => {
    const currentScale = scaleFactorRef.current;
    ctx.fillStyle = '#006400'; 
    ctx.fillRect(0, 0, LOGICAL_TABLE_WIDTH * currentScale, LOGICAL_TABLE_HEIGHT * currentScale);

    ctx.strokeStyle = '#8B4513'; 
    const scaledRailWidth = LOGICAL_RAIL_WIDTH * currentScale;
    ctx.lineWidth = scaledRailWidth;
    ctx.strokeRect(
        scaledRailWidth / 2, 
        scaledRailWidth / 2, 
        LOGICAL_TABLE_WIDTH * currentScale - scaledRailWidth, 
        LOGICAL_TABLE_HEIGHT * currentScale - scaledRailWidth
    );

    logicalPockets.forEach(pocket => {
      ctx.beginPath();
      ctx.arc(pocket.x * currentScale, pocket.y * currentScale, LOGICAL_POCKET_RADIUS * currentScale, 0, Math.PI * 2);
      ctx.fillStyle = 'black';
      ctx.fill();
      ctx.closePath();
    });
  }, []);

  const drawAimingLine = useCallback((ctx: CanvasRenderingContext2D) => {
    const currentBalls = ballsRef.current;
    const currentScale = scaleFactorRef.current;
    const cueBall = currentBalls.find(b => b.id === 'cue');
    const anyBallMoving = currentBalls.some(b => (b.vx !== 0 || b.vy !== 0) && !b.isPocketed);

    if (isAimingRef.current && aimStartRef.current && aimEndRef.current && cueBall && !cueBall.isPocketed && !anyBallMoving) {
      ctx.beginPath();
      ctx.moveTo(cueBall.x * currentScale, cueBall.y * currentScale);
      
      const dx = cueBall.x - aimEndRef.current.x;
      const dy = cueBall.y - aimEndRef.current.y;
      const length = Math.sqrt(dx*dx + dy*dy);
      const MAX_AIM_VISUAL_LOGICAL_LENGTH = 100; 
      
      ctx.lineTo(
        (cueBall.x + (dx / length) * MAX_AIM_VISUAL_LOGICAL_LENGTH) * currentScale, 
        (cueBall.y + (dy / length) * MAX_AIM_VISUAL_LOGICAL_LENGTH) * currentScale
      );
      
      const powerRatio = Math.min(1, length / 150);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + powerRatio * 0.5})`;
      ctx.lineWidth = (2 + powerRatio * 2) * currentScale;
      ctx.stroke();
      ctx.closePath();
    } else if (cueBall && !cueBall.isPocketed && !anyBallMoving && !isAimingRef.current && !gameOverRef.current) {
        ctx.beginPath();
        ctx.arc(cueBall.x * currentScale, cueBall.y * currentScale, cueBall.radius * 0.3 * currentScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)'; // Yellow dot for aiming cue
        ctx.fill();
        ctx.closePath();
    }
  }, []);
  
  const gameLoop = useCallback(() => {
    const currentBalls = ballsRef.current;
    const currentScale = scaleFactorRef.current;
    const isGameOver = gameOverRef.current;
    const isCurrentlyAiming = isAimingRef.current;
    const cueBallResetting = currentBalls.some(b => b.id === 'cue' && b.isPocketed && (b.vx !==0 || b.vy !==0));

    if (isGameOver && !cueBallResetting) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        drawTable(ctx);
        currentBalls.forEach(ball => drawBall(ctx, ball));

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, LOGICAL_TABLE_WIDTH * currentScale, LOGICAL_TABLE_HEIGHT * currentScale);
        ctx.font = `${30 * currentScale}px Arial`;
        ctx.fillStyle = isGameOver === 'win' ? "gold" : "red";
        ctx.textAlign = "center";
        ctx.fillText(isGameOver === 'win' ? "You Win!" : "Game Over!", LOGICAL_TABLE_WIDTH * currentScale / 2, LOGICAL_TABLE_HEIGHT * currentScale / 2);
        
        const cueBallData = currentBalls.find(b => b.id === 'cue');
        let subMessage = "";
        if (isGameOver === 'lose') {
            if (cueBallData?.isPocketed) {
                subMessage = "Cue ball scratched!";
            } else {
                subMessage = "8-ball pocketed too early or illegally.";
            }
        }
        if (subMessage) {
            ctx.font = `${16 * currentScale}px Arial`;
            ctx.fillStyle = "white";
            ctx.fillText(subMessage, LOGICAL_TABLE_WIDTH * currentScale / 2, LOGICAL_TABLE_HEIGHT * currentScale / 2 + 30 * currentScale);
        }
        return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, LOGICAL_TABLE_WIDTH * currentScale, LOGICAL_TABLE_HEIGHT * currentScale);
    drawTable(ctx);
    
    let ballsStillMoving = false;
    const processedBalls = currentBalls.map(ball => {
        if (ball.isPocketed) return ball;

        if (Math.abs(ball.vx) < MIN_VELOCITY_THRESHOLD && Math.abs(ball.vy) < MIN_VELOCITY_THRESHOLD && !(isCurrentlyAiming && ball.id ==='cue')) {
            return { ...ball, vx: 0, vy: 0 };
        }
        ballsStillMoving = true;

        let newVx = ball.vx * FRICTION;
        let newVy = ball.vy * FRICTION;
        let newX = ball.x + newVx;
        let newY = ball.y + newVy;

        if (newX - ball.radius < 0) { newX = ball.radius; newVx = -newVx * COLLISION_DAMPING; }
        if (newX + ball.radius > LOGICAL_TABLE_WIDTH) { newX = LOGICAL_TABLE_WIDTH - ball.radius; newVx = -newVx * COLLISION_DAMPING; }
        if (newY - ball.radius < 0) { newY = ball.radius; newVy = -newVy * COLLISION_DAMPING; }
        if (newY + ball.radius > LOGICAL_TABLE_HEIGHT) { newY = LOGICAL_TABLE_HEIGHT - ball.radius; newVy = -newVy * COLLISION_DAMPING; }
            
        return { ...ball, x: newX, y: newY, vx: newVx, vy: newVy };
    });

    for (let i = 0; i < processedBalls.length; i++) {
        for (let j = i + 1; j < processedBalls.length; j++) {
            const b1 = processedBalls[i];
            const b2 = processedBalls[j];
            if (b1.isPocketed || b2.isPocketed) continue;

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < b1.radius + b2.radius) {
                const angle = Math.atan2(dy, dx);
                const sin = Math.sin(angle);
                const cos = Math.cos(angle);

                const vx1 = b1.vx * cos + b1.vy * sin;
                const vy1 = b1.vy * cos - b1.vx * sin;
                const vx2 = b2.vx * cos + b2.vy * sin;
                const vy2 = b2.vy * cos - b2.vx * sin;

                const vx1Final = ((b1.radius - b2.radius) * vx1 + 2 * b2.radius * vx2) / (b1.radius + b2.radius);
                const vx2Final = ((b2.radius - b1.radius) * vx2 + 2 * b1.radius * vx1) / (b1.radius + b2.radius);
                    
                b1.vx = (vx1Final * cos - vy1 * sin) * COLLISION_DAMPING;
                b1.vy = (vy1 * cos + vx1Final * sin) * COLLISION_DAMPING;
                b2.vx = (vx2Final * cos - vy2 * sin) * COLLISION_DAMPING;
                b2.vy = (vy2 * cos + vx2Final * sin) * COLLISION_DAMPING;
                    
                const overlap = b1.radius + b2.radius - distance + 0.1;
                const moveX = (overlap / 2) * (dx / distance);
                const moveY = (overlap / 2) * (dy / distance);
                b1.x -= moveX; b1.y -= moveY;
                b2.x += moveX; b2.y += moveY;
            }
        }
    }

    const currentGameOver = gameOverRef.current;
    const ballsAfterPocketing = processedBalls.map(ball => {
        if (ball.isPocketed) return ball;
        for (const pocket of logicalPockets) {
            const dx = pocket.x - ball.x;
            const dy = pocket.y - ball.y;
            const distToPocketCenter = Math.sqrt(dx * dx + dy * dy);
            if (distToPocketCenter < LOGICAL_POCKET_RADIUS - ball.radius / 2) { // Ball center needs to be well within pocket radius
                if (ball.type === 'cue') {
                    addNotification("Cue ball scratched!", "error");
                    setTimeout(() => {
                        setBallsState(bs => bs.map(b => b.id === 'cue' ? {...initialBallsSetup().find(ib => ib.id === 'cue')!, isPocketed: false} : b));
                    }, 1000);
                    if (!currentGameOver) setGameOverState('lose'); 
                    return { ...ball, isPocketed: true, vx: 0, vy: 0 };
                } else if (ball.type === 'eight') {
                    const remainingObjectBalls = processedBalls.filter(b => (b.type === 'solid' || b.type === 'stripe') && !b.isPocketed).length;
                    if (remainingObjectBalls > 0) {
                        addNotification("8-ball pocketed too early! You lose.", "error");
                        if (!currentGameOver) setGameOverState('lose');
                    } else {
                        addNotification("8-ball pocketed! You win!", "success");
                        if (!currentGameOver) setGameOverState('win');
                    }
                    return { ...ball, isPocketed: true, vx: 0, vy: 0 };
                } else { // Solid or Stripe ball
                    addNotification(`${ball.type === 'solid' ? 'Solid' : 'Stripe'} ball pocketed!`, "info");
                     return { ...ball, isPocketed: true, vx: 0, vy: 0 };
                }
            }
        }
        return ball;
    });
    setBallsState(ballsAfterPocketing);

    ballsAfterPocketing.forEach(ball => drawBall(ctx, ball));
    drawAimingLine(ctx);
    
    if (ballsStillMoving || isCurrentlyAiming || cueBallResetting) {
       animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    } else {
       animationFrameIdRef.current = null;
    }
  }, [addNotification, drawTable, drawBall, drawAimingLine]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const parentWidth = parent.clientWidth;
        const newScale = parentWidth / LOGICAL_TABLE_WIDTH;
        setScaleFactorState(newScale); 
        scaleFactorRef.current = newScale; // Direct update for immediate use
        canvas.width = LOGICAL_TABLE_WIDTH * newScale;
        canvas.height = LOGICAL_TABLE_HEIGHT * newScale;
        
        if (!animationFrameIdRef.current && canvas.getContext('2d')) { 
             const ctx = canvas.getContext('2d')!;
             drawTable(ctx);
             ballsRef.current.forEach(ball => drawBall(ctx, ball));
             drawAimingLine(ctx);
             // Re-render game over screen if applicable
             const currentGameOver = gameOverRef.current;
             if (currentGameOver) {
                ctx.fillStyle = "rgba(0,0,0,0.6)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.font = `${30 * newScale}px Arial`;
                ctx.fillStyle = currentGameOver === 'win' ? "gold" : "red";
                ctx.textAlign = "center";
                ctx.fillText(currentGameOver === 'win' ? "You Win!" : "Game Over!", canvas.width / 2, canvas.height / 2);
                 const cueBallData = ballsRef.current.find(b => b.id === 'cue');
                let subMessage = "";
                if (currentGameOver === 'lose') {
                    if (cueBallData?.isPocketed) subMessage = "Cue ball scratched!";
                    else subMessage = "8-ball pocketed too early or illegally.";
                }
                if (subMessage) {
                    ctx.font = `${16 * newScale}px Arial`;
                    ctx.fillStyle = "white";
                    ctx.fillText(subMessage, canvas.width / 2, canvas.height / 2 + 30 * newScale);
                }
             }
        }
      }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    resizeCanvas(); // Initial call

    animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (canvas.parentElement) resizeObserver.unobserve(canvas.parentElement);
      resizeObserver.disconnect();
    };
  }, [gameLoop, drawTable, drawBall, drawAimingLine]);

  const getLogicalPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const physicalX = clientX - rect.left;
    const physicalY = clientY - rect.top;

    return {
      x: physicalX / scaleFactorRef.current,
      y: physicalY / scaleFactorRef.current,
    };
  }, []);

  const handleInteractionStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (gameOverRef.current) return;

    const currentBalls = ballsRef.current;
    const cueBall = currentBalls.find(b => b.id === 'cue');
    const anyBallMoving = currentBalls.some(b => (b.vx !== 0 || b.vy !== 0) && !b.isPocketed);
    
    if (!cueBall || cueBall.isPocketed || anyBallMoving) {
        if (anyBallMoving) addNotification("Wait for balls to stop before aiming.", "info");
        else if (cueBall?.isPocketed) addNotification("Cue ball is pocketed. Wait for reset.", "info");
        return;
    }
    
    const pos = getLogicalPos(e);
    setIsAimingState(true);
    setAimStartState(pos); 
    setAimEndState(pos);   
    if (!animationFrameIdRef.current) { 
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    }
  }, [getLogicalPos, addNotification, gameLoop]);

  const handleInteractionMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isAimingRef.current || gameOverRef.current) return;
    setAimEndState(getLogicalPos(e));
  }, [getLogicalPos]);

  const handleInteractionEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isAimingRef.current || !aimStartRef.current || !aimEndRef.current || gameOverRef.current) return;
    
    const currentBalls = ballsRef.current;
    const cueBall = currentBalls.find(b => b.id === 'cue');
    if (!cueBall || cueBall.isPocketed) {
      setIsAimingState(false);
      return;
    }

    const dx = cueBall.x - aimEndRef.current.x; 
    const dy = cueBall.y - aimEndRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) { 
      setIsAimingState(false);
      setAimStartState(null);
      setAimEndState(null);
      return;
    }

    const MAX_POWER = 15;
    const powerRatio = Math.min(1, dist / 150); 
    const power = powerRatio * MAX_POWER;

    const newVx = (dx / dist) * power;
    const newVy = (dy / dist) * power;

    setBallsState(prevBalls =>
      prevBalls.map(b => (b.id === 'cue' ? { ...b, vx: newVx, vy: newVy } : b))
    );

    setIsAimingState(false);
    setAimStartState(null);
    setAimEndState(null);
    if (!animationFrameIdRef.current) { 
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    }
  }, [gameLoop]);
  
  const handleResetBalls = useCallback(() => {
    setBallsState(initialBallsSetup());
    setGameOverState(null);
    setIsAimingState(false);
    setAimStartState(null);
    setAimEndState(null);
    addNotification("Game Reset!", "info");
    if (!animationFrameIdRef.current) { 
        animationFrameIdRef.current = requestAnimationFrame(gameLoop);
    }
  }, [addNotification, gameLoop]);

  return (
    <div className="flex flex-col items-center select-none w-full">
      <canvas
        ref={canvasRef}
        onMouseDown={handleInteractionStart}
        onMouseMove={handleInteractionMove}
        onMouseUp={handleInteractionEnd}
        onMouseLeave={isAimingState ? handleInteractionEnd : undefined}
        onTouchStart={handleInteractionStart}
        onTouchMove={handleInteractionMove}
        onTouchEnd={handleInteractionEnd}
        className="border-2 border-yellow-700 dark:border-yellow-400 rounded-sm shadow-lg cursor-crosshair"
        style={{ maxWidth: '100%', height: 'auto' }}
        aria-label="8-Ball Pool game table"
      ></canvas>
      <button
        onClick={handleResetBalls}
        className="mt-3 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-sm font-medium transition-colors"
      >
        {gameOverState ? "Play Again" : "Reset Balls"}
      </button>
    </div>
  );
};

export default EightBallPoolGame;
