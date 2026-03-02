import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (isActive) {
        phase += 0.05;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 78, 0, 0.5)';
        ctx.lineWidth = 2;

        const centerY = canvas.height / 2;
        const width = canvas.width;

        for (let i = 0; i < width; i++) {
          const x = i;
          const amplitude = isActive ? 20 : 2;
          const y = centerY + Math.sin(i * 0.02 + phase) * amplitude * Math.sin(i * 0.01);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Second wave
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 200, 150, 0.3)';
        for (let i = 0; i < width; i++) {
          const x = i;
          const amplitude = isActive ? 15 : 1;
          const y = centerY + Math.cos(i * 0.015 + phase * 0.8) * amplitude * Math.sin(i * 0.02);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={400} 
      height={100} 
      className="w-full max-w-md h-24 opacity-80"
    />
  );
};
