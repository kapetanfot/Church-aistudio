import React, { useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ZoomablePlateProps {
  src: string;
  alt: string;
  zoom: number;
}

export const ZoomablePlate: React.FC<ZoomablePlateProps> = ({ src, alt, zoom }) => {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Reset pan when returning to 100% zoom
  React.useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || zoom <= 1) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan((prev) => ({
      x: Math.max(-420, Math.min(420, prev.x + dx)),
      y: Math.max(-280, Math.min(280, prev.y + dy)),
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);
    }
  };

  if (failed) {
    return (
      <div className="flex aspect-[1296/800] w-full flex-col items-center justify-center gap-3 bg-[#E7E2D8] text-[#57534E]">
        <ImageOff className="h-7 w-7 text-[#78716C]" aria-hidden="true" />
        <p className="text-sm font-medium">Composite plate preview unavailable</p>
      </div>
    );
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative aspect-[1296/800] w-full overflow-hidden bg-[#1C1917] select-none ${
        zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailed(true)}
        className="h-full w-full object-contain transition-transform duration-150 ease-out"
        style={{
          transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          transitionDuration: dragging ? '0ms' : '150ms',
        }}
      />
    </div>
  );
};
