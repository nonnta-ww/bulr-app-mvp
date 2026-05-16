'use client';

import { useEffect, useRef } from 'react';

const BAR_COUNT = 20;
const FFT_SIZE = 64; // 32 frequency bins

interface AudioVisualizerProps {
  stream: MediaStream | null;
}

export function AudioVisualizer({ stream }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) return;

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const step = Math.floor(data.length / BAR_COUNT);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barWidth = width / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        const value = (data[i * step] ?? 0) / 255;
        const barH = Math.max(3, value * height);
        const alpha = 0.3 + value * 0.7;

        ctx.fillStyle = `rgba(37, 99, 235, ${alpha})`;
        ctx.fillRect(i * barWidth + 1.5, height - barH, barWidth - 3, barH);
      }
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      source.disconnect();
      void audioCtx.close();
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={28}
      className="w-full rounded"
      aria-hidden="true"
    />
  );
}
