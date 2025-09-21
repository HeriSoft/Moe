import React, { useState, useEffect } from 'react';

const prizes = [
  { label: '5 EXP', prizeId: 'exp_5', color: { inner: '#c5e1a5', outer: '#4caf50' } },
  { label: '10 EXP', prizeId: 'exp_10', color: { inner: '#90caf9', outer: '#2196f3' } },
  { label: '15 EXP', prizeId: 'exp_15', color: { inner: '#ffcc80', outer: '#ff9800' } },
  { label: '50 EXP', prizeId: 'exp_50', color: { inner: '#ce93d8', outer: '#9c27b0' } },
  { label: '100 EXP', prizeId: 'exp_100', color: { inner: '#80deea', outer: '#00bcd4' } },
  { label: '500 EXP', prizeId: 'exp_500', color: { inner: '#ef9a9a', outer: '#f44336' } },
  { label: '1 Month Pro', prizeId: 'premium_1m', color: { inner: '#dcedc8', outer: '#8bc34a' } },
  { label: 'Name Color', prizeId: 'name_color', color: { inner: '#9fa8da', outer: '#3f51b5' } },
  { label: '2 Months Pro', prizeId: 'premium_2m', color: { inner: '#fff59d', outer: '#ffeb3b' } },
  { label: 'Sakura Banner', prizeId: 'sakura_banner', color: { inner: '#f06292', outer: '#e91e63' } },
  { label: '1 Year Pro', prizeId: 'premium_1y', color: { inner: '#ffd700', outer: '#ff4d4d' } },
  { label: 'Try Again', prizeId: 'lose', color: { inner: '#e0e0e0', outer: '#757575' } },
].map((prize, index) => ({ ...prize, segmentIndex: index }));


interface LuckyWheelProps {
    points: number;
    onSpinStart: () => void;
    onPrizeWon: (prize: { prizeId: string; label: string }) => Promise<void>;
}

const LuckyWheel: React.FC<LuckyWheelProps> = ({ points, onSpinStart, onPrizeWon }) => {
    const [isSpinning, setIsSpinning] = useState(false);
    const [currentRotation, setCurrentRotation] = useState(0);
    const [resultText, setResultText] = useState<string | null>(null);
    const [showResult, setShowResult] = useState(false);
    const wheelRef = React.useRef<HTMLDivElement>(null);

    const tickets = Math.floor(points / 1000);

    const handleSpin = () => {
        if (isSpinning || tickets < 1) return;

        onSpinStart();
        setIsSpinning(true);
        setShowResult(false);
        setResultText('');

        const segmentAngle = 360 / prizes.length;
        const randomSegmentIndex = Math.floor(Math.random() * prizes.length);
        const centerOfSegmentAngle = randomSegmentIndex * segmentAngle + (segmentAngle / 2);
        
        // Add a small random offset inside the segment to make it look more natural
        const maxOffset = segmentAngle * 0.4;
        const randomOffset = (Math.random() * 2 * maxOffset) - maxOffset;
        const targetAngle = centerOfSegmentAngle + randomOffset;
        
        const rotations = 5;
        const angleToReachTarget = (360 - targetAngle + 360) % 360; 
        const newTotalRotation = currentRotation + (360 * rotations) + angleToReachTarget;
        
        setCurrentRotation(newTotalRotation);
        
        setTimeout(() => {
            const finalRotation = newTotalRotation % 360;
            const pointerAngle = (360 - finalRotation) % 360;
            const shiftedAngle = (pointerAngle + segmentAngle / 2) % 360;
            const winningIndex = Math.floor(shiftedAngle / segmentAngle);
            const winningPrize = prizes[winningIndex];

            setResultText(`Chúc mừng! Bạn đã trúng: ${winningPrize.label}!`);
            setShowResult(true);
            setIsSpinning(false);
            
            onPrizeWon(winningPrize);
        }, 5000); // Corresponds to the CSS transition duration
    };
    
    // This effect handles the text orientation after the wheel stops spinning.
    useEffect(() => {
        if (!isSpinning && wheelRef.current) {
            const finalWheelRotation = (currentRotation % 360 + 360) % 360;
            const segments = wheelRef.current.querySelectorAll('.wheel-segment');
            segments.forEach((segment, index) => {
                const span = segment.querySelector('span');
                if (span) {
                    const segmentInitialAngle = index * 30;
                    const effectiveSegmentAngleOnScreen = (segmentInitialAngle + finalWheelRotation + 360) % 360;
                    const centralAxisAngleOnScreen = (effectiveSegmentAngleOnScreen + 15) % 360;
                    let finalTextRotation = 0;
                    if (centralAxisAngleOnScreen > 90 && centralAxisAngleOnScreen < 270) {
                        finalTextRotation = 180;
                    }
                    span.style.transform = `translateX(-50%) rotate(${finalTextRotation}deg)`;
                }
            });
        }
    }, [isSpinning, currentRotation]);

    return (
        <div className="lucky-wheel-container text-center relative flex flex-col items-center">
            <div className="wheel-outer-container relative w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] mx-auto">
                <div className="arrow absolute top-[-20px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-slate-700 dark:border-t-slate-300 z-10"></div>
                <button 
                    className="spin-button absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60px] h-[60px] sm:w-[80px] sm:h-[80px] text-sm sm:text-base font-bold text-white bg-gradient-to-br from-amber-400 to-orange-600 border-none rounded-full cursor-pointer transition-all duration-200 shadow-lg z-20 flex items-center justify-center text-center p-0 hover:scale-110 hover:shadow-xl disabled:bg-slate-400 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
                    onClick={handleSpin}
                    disabled={isSpinning || tickets < 1}
                >
                    Quay
                </button>
                <div 
                    ref={wheelRef}
                    className="wheel w-full h-full rounded-full relative shadow-lg overflow-hidden z-[1]"
                    style={{
                        transform: `rotate(${currentRotation}deg)`,
                        transition: isSpinning ? 'transform 5s cubic-bezier(0.25, 0.1, 0.25, 1)' : 'none',
                    }}
                >
                    <div className="wheel-center-knob absolute top-1/2 left-1/2 w-[75px] h-[75px] sm:w-[100px] sm:h-[100px] bg-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-inner z-[5]"></div>
                    {prizes.map((prize) => {
                         const segmentInitialAngle = prize.segmentIndex * 30;
                         const textRotation = (segmentInitialAngle + 15 > 90 && segmentInitialAngle + 15 < 270) ? 180 : 0;
                         return (
                            <div
                                key={prize.segmentIndex}
                                className="wheel-segment absolute w-full h-full text-center text-xs sm:text-base font-bold text-white [text-shadow:1px_1px_2px_rgba(0,0,0,0.5)] origin-center"
                                style={{
                                    clipPath: 'polygon(50% 50%, 37.06% 1.71%, 62.94% 1.71%)',
                                    transform: `rotate(${segmentInitialAngle}deg)`,
                                    background: `radial-gradient(circle at center, ${prize.color.inner} 0%, ${prize.color.outer} 100%)`,
                                }}
                            >
                                <span className="absolute top-[18px] sm:top-[25px] left-1/2 whitespace-nowrap"
                                      style={{ transform: `translateX(-50%) rotate(${textRotation}deg)` }}>
                                    {prize.label}
                                </span>
                            </div>
                         );
                    })}
                </div>
            </div>
            <div className={`result mt-5 text-lg sm:text-xl font-bold text-slate-800 dark:text-white transition-all duration-500 ${showResult ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
                {resultText}
            </div>
            <style>{`
            .shadow-inner { box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.2); }
            `}</style>
        </div>
    );
};

export default LuckyWheel;
