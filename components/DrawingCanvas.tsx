import React, { useRef, useEffect, useImperativeHandle, useState, useCallback } from 'react';

interface DrawingCanvasProps {
  brushColor: string;
  brushSize: number;
}

export interface DrawingCanvasRef {
  clear: () => void;
  toDataURL: () => string;
}

const DrawingCanvas = React.forwardRef<DrawingCanvasRef, DrawingCanvasProps>(
  ({ brushColor, brushSize }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const lastPointRef = useRef<{ x: number, y: number } | null>(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (context && canvas) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
      toDataURL: () => {
        const canvas = canvasRef.current;
        return canvas ? canvas.toDataURL('image/png') : '';
      }
    }));
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        const resizeObserver = new ResizeObserver(() => {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        });
        resizeObserver.observe(parent);

        // Initial resize
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        return () => resizeObserver.disconnect();
    }, []);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number, y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const coords = getCoordinates(e);
        if (coords) {
            setIsDrawing(true);
            lastPointRef.current = coords;
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        
        const coords = getCoordinates(e);
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');

        if (context && coords && lastPointRef.current) {
            context.beginPath();
            context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            context.lineTo(coords.x, coords.y);
            context.strokeStyle = brushColor;
            context.lineWidth = brushSize;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.stroke();
            
            lastPointRef.current = coords;
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        lastPointRef.current = null;
    };

    return (
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 cursor-crosshair w-full h-full"
      />
    );
  }
);

export default DrawingCanvas;
