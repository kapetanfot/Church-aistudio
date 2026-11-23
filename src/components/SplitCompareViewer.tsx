import React, { useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface SplitCompareViewerProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
}

export const SplitCompareViewer: React.FC<SplitCompareViewerProps> = ({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const raw = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(2, Math.min(98, raw)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragging(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSplitPct((prev) => Math.max(2, prev - 2));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSplitPct((prev) => Math.min(98, prev + 2));
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Before and after comparison divider"
        aria-valuemin={2}
        aria-valuemax={98}
        aria-valuenow={Math.round(splitPct)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="relative w-full aspect-[1296/800] select-none overflow-hidden bg-[#1C1917] cursor-ew-resize focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78350F]"
      >
        <img
          src={afterSrc}
          alt={afterLabel}
          referrerPolicy="no-referrer"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />

        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
        >
          <img
            src={beforeSrc}
            alt={beforeLabel}
            referrerPolicy="no-referrer"
            draggable={false}
            className="h-full w-full object-contain"
          />
        </div>

        {/* Vertical divider rule */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#FBF9F5] shadow-[0_0_8px_rgba(0,0,0,0.6)]"
          style={{ left: `${splitPct}%` }}
        >
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-[#D6CEBE] bg-[#FBF9F5] text-[#1C1917] shadow-md">
            <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[#57534E]">
        <span>Left: {beforeLabel}</span>
        <span className="font-mono tabular-nums text-[#78716C]">{Math.round(splitPct)}% / {Math.round(100 - splitPct)}%</span>
        <span>Right: {afterLabel}</span>
      </div>
    </div>
  );
};
