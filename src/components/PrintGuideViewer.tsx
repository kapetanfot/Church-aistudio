import React from 'react';
import { PrintPrepConfig, WALL_HEIGHT_MM, WALL_WIDTH_MM, getPrintDimensions } from '../utils/printExport';

interface PrintGuideViewerProps {
  src: string;
  config: PrintPrepConfig;
}

export const PrintGuideViewer: React.FC<PrintGuideViewerProps> = ({ src, config }) => {
  const {
    effectiveBleed,
    totalWidthMm,
    totalHeightMm,
    totalWidthPx,
    totalHeightPx,
    panelCols,
    panelRows,
    panelBaseWidthMm,
    panelBaseHeightMm,
  } = getPrintDimensions(config);

  const bleedPctX = effectiveBleed > 0 ? (effectiveBleed / totalWidthMm) * 100 : 0;
  const bleedPctY = effectiveBleed > 0 ? (effectiveBleed / totalHeightMm) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Live Print Sheet Diagram */}
      <div
        className="relative w-full overflow-hidden bg-[#4B0D03] shadow-inner"
        style={{ aspectRatio: `${totalWidthMm} / ${totalHeightMm}` }}
      >
        {/* Mirror bleed visual simulation */}
        {config.bleedStyle === 'mirror' && effectiveBleed > 0 && (
          <img
            src={src}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover scale-105 blur-[1px] opacity-85"
          />
        )}

        {/* Front Face (exact 4050 x 2500 mm region) */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: `${bleedPctX}%`,
            right: `${bleedPctX}%`,
            top: `${bleedPctY}%`,
            bottom: `${bleedPctY}%`,
          }}
        >
          <img
            src={src}
            alt={`Print preview scaled to ${WALL_WIDTH_MM} × ${WALL_HEIGHT_MM} mm`}
            referrerPolicy="no-referrer"
            className="h-full w-full object-fill"
          />

          {/* Vertical panel split cut lines */}
          {panelCols > 1 &&
            Array.from({ length: panelCols - 1 }, (_, i) => {
              const leftPct = ((i + 1) / panelCols) * 100;
              return (
                <div
                  key={`v-${i}`}
                  className="pointer-events-none absolute top-0 bottom-0 w-px border-l border-dashed border-[#FBF9F5] shadow-[0_0_4px_rgba(0,0,0,0.85)]"
                  style={{ left: `${leftPct}%` }}
                >
                  <span className="absolute top-2 left-2 bg-[#1C1917]/85 px-1.5 py-0.5 font-mono text-[10px] text-[#FBF9F5] whitespace-nowrap">
                    Col {i + 1} | {i + 2}
                  </span>
                </div>
              );
            })}

          {/* Horizontal panel split cut line (for 4x2 grid) */}
          {panelRows > 1 &&
            Array.from({ length: panelRows - 1 }, (_, r) => {
              const topPct = ((r + 1) / panelRows) * 100;
              return (
                <div
                  key={`h-${r}`}
                  className="pointer-events-none absolute left-0 right-0 h-px border-t border-dashed border-[#FBF9F5] shadow-[0_0_4px_rgba(0,0,0,0.85)]"
                  style={{ top: `${topPct}%` }}
                >
                  <span className="absolute top-2 left-2 bg-[#1C1917]/85 px-1.5 py-0.5 font-mono text-[10px] text-[#FBF9F5] whitespace-nowrap">
                    Row {r + 1} / {r + 2}
                  </span>
                </div>
              );
            })}
        </div>

        {/* Fold / Wrap Perimeter Line */}
        {effectiveBleed > 0 && (
          <div
            className="pointer-events-none absolute border border-dashed border-[#FBF9F5]/85 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
            style={{
              left: `${bleedPctX}%`,
              right: `${bleedPctX}%`,
              top: `${bleedPctY}%`,
              bottom: `${bleedPctY}%`,
            }}
          />
        )}
      </div>

      {/* Physical Measurement Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-[#D6CEBE] pt-3 text-xs">
        <div>
          <span className="block text-[#78716C]">Wall Face Size</span>
          <span className="font-mono tabular-nums font-medium text-[#1C1917]">
            {WALL_WIDTH_MM} × {WALL_HEIGHT_MM} mm
          </span>
        </div>
        <div>
          <span className="block text-[#78716C]">Print Sheet Size</span>
          <span className="font-mono tabular-nums font-medium text-[#1C1917]">
            {totalWidthMm} × {totalHeightMm} mm
          </span>
        </div>
        <div>
          <span className="block text-[#78716C]">Output Resolution</span>
          <span className="font-mono tabular-nums font-medium text-[#1C1917]">
            {totalWidthPx.toLocaleString()} × {totalHeightPx.toLocaleString()} px
          </span>
        </div>
        <div>
          <span className="block text-[#78716C]">Panel Layout</span>
          <span className="font-mono tabular-nums font-medium text-[#1C1917]">
            {config.panelCount === 1
              ? '1 Seamless Sheet'
              : panelRows > 1
                ? `${panelCols}×${panelRows} · ${Math.round(panelBaseWidthMm)}×${Math.round(panelBaseHeightMm)} mm`
                : `${panelCols} × ${Math.round(panelBaseWidthMm)} mm`}
          </span>
        </div>
      </div>
    </div>
  );
};
