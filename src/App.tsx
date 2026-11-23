import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { SplitCompareViewer } from './components/SplitCompareViewer';
import { ZoomablePlate } from './components/ZoomablePlate';
import {
  CompositionOptions,
  DEFAULT_COMPOSITION,
  downloadComposite,
  isDefaultComposition,
  loadImage,
  renderCompositeToCanvas,
} from './utils/iconCompositor';

const SAINTS_SRC = '/assets/aistudio/saints_450d968e.webp';
const DIPTYCH_SRC = '/assets/aistudio/leave-only-two-kiones_47e2e67d.jpg';
const PREBUILT_COMPOSITE_SRC = '/assets/swapped-icon.png';

type ViewMode = 'composite' | 'split' | 'sources';
type ExportFormat = 'png' | 'jpeg' | 'webp';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('composite');
  const [zoom, setZoom] = useState<number>(1);
  const [options, setOptions] = useState<CompositionOptions>(DEFAULT_COMPOSITION);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [isExporting, setIsExporting] = useState(false);

  const [customDataUrl, setCustomDataUrl] = useState<string | null>(null);
  const [sourceImages, setSourceImages] = useState<{
    saints: HTMLImageElement;
    diptych: HTMLImageElement;
  } | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const usingDefault = useMemo(() => isDefaultComposition(options), [options]);

  // Preload updated swapped plate and original diptych on mount for live adjustments
  useEffect(() => {
    let active = true;
    Promise.all([loadImage(PREBUILT_COMPOSITE_SRC), loadImage(DIPTYCH_SRC)])
      .then(([saints, diptych]) => {
        if (active) {
          setSourceImages({ saints, diptych });
        }
      })
      .catch(() => {
        // Prebuilt PNG remains available even if offscreen preload fails
      });
    return () => {
      active = false;
    };
  }, []);

  // Re-render live composite on canvas whenever user modifies parameters away from curated default
  useEffect(() => {
    if (usingDefault) {
      setCustomDataUrl(null);
      return;
    }
    if (!sourceImages) return;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    renderCompositeToCanvas(
      offscreenCanvasRef.current,
      sourceImages.saints,
      sourceImages.diptych,
      options
    );
    setCustomDataUrl(offscreenCanvasRef.current.toDataURL('image/png'));
  }, [options, usingDefault, sourceImages]);

  const activeCompositeSrc = usingDefault
    ? PREBUILT_COMPOSITE_SRC
    : customDataUrl || PREBUILT_COMPOSITE_SRC;

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const source =
        !usingDefault && offscreenCanvasRef.current
          ? offscreenCanvasRef.current
          : PREBUILT_COMPOSITE_SRC;
      await downloadComposite(source, exportFormat, 'diptych-saints-swapped');
    } finally {
      setIsExporting(false);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))));
  const handleResetOptions = () => setOptions(DEFAULT_COMPOSITION);

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#1C1917]">
      {/* Top Bar Contract: 3 zones */}
      <header className="border-b border-[#E5DEC9] bg-[#FBF9F5]">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-4 lg:px-10">
          <a
            href="#top"
            className="font-editorial text-xl font-semibold tracking-tight text-[#1C1917] whitespace-nowrap shrink-0"
          >
            Icon Diptych Studio
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#57534E]"
          >
            <a
              href="#plate-viewer"
              onClick={() => setViewMode('composite')}
              className="hover:text-[#1C1917] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Composite
            </a>
            <a
              href="#details"
              className="hover:text-[#1C1917] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Retention Record
            </a>
            <a
              href="#sources"
              className="hover:text-[#1C1917] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Source Plates
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-md bg-[#78350F] px-4 py-2 text-xs font-semibold text-[#FBF9F5] transition-colors hover:bg-[#5C280B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78350F] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isExporting ? 'Exporting...' : `Download ${exportFormat.toUpperCase()}`}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1360px] px-6 py-8 lg:px-10 lg:py-10">
        {/* Editorial Title Header */}
        <section className="mb-8 border-b border-[#E5DEC9] pb-7">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#78716C] mb-3">
            <span>Plate Composition</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">1296 × 800 px</span>
            <span aria-hidden="true">·</span>
            <span>Upper Register &amp; Kiones Retained</span>
            <span aria-hidden="true">·</span>
            <span>Lower Register Swapped</span>
          </div>

          <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-[#1C1917] max-w-3xl text-balance">
            Liturgical Diptych with Nine Standing Hierarchs
          </h1>
        </section>

        {/* Primary Workspace */}
        <section
          id="plate-viewer"
          className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start"
        >
          {/* Left / Center Stage: Plate Viewer */}
          <div className="min-w-0">
            {/* Viewer Control Strip */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Plate view modes"
                className="inline-flex items-center gap-1 rounded-md border border-[#DFD8CA] bg-[#F3EFE6] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'composite'}
                  onClick={() => setViewMode('composite')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'composite'
                      ? 'bg-[#FBF9F5] text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Composite Plate
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'split'}
                  onClick={() => setViewMode('split')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'split'
                      ? 'bg-[#FBF9F5] text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Split Comparison
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'sources'}
                  onClick={() => setViewMode('sources')}
                  className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewMode === 'sources'
                      ? 'bg-[#FBF9F5] text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Source Plates
                </button>
              </div>

              {viewMode === 'composite' && (
                <div className="inline-flex items-center gap-1 rounded-md border border-[#DFD8CA] bg-[#F3EFE6] p-1">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoom <= 1}
                    aria-label="Zoom out"
                    className="flex h-7 w-7 items-center justify-center rounded text-[#44403C] hover:bg-[#FBF9F5] disabled:opacity-40 cursor-pointer"
                  >
                    <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span className="px-2 font-mono text-xs tabular-nums text-[#1C1917] whitespace-nowrap">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoom >= 3}
                    aria-label="Zoom in"
                    className="flex h-7 w-7 items-center justify-center rounded text-[#44403C] hover:bg-[#FBF9F5] disabled:opacity-40 cursor-pointer"
                  >
                    <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  {zoom > 1 && (
                    <button
                      type="button"
                      onClick={() => setZoom(1)}
                      className="ml-1 rounded px-2 py-1 text-xs font-medium text-[#78350F] hover:bg-[#FBF9F5] whitespace-nowrap cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Archival Gallery Mat Frame */}
            <figure className="border border-[#D6CEBE] bg-[#EFECE4] p-4 sm:p-6">
              {viewMode === 'composite' && (
                <ZoomablePlate
                  src={activeCompositeSrc}
                  alt="Swapped liturgical diptych retaining the upper three scenes, ornate borders, and two flanking columns with the nine standing saints in the lower register"
                  zoom={zoom}
                />
              )}

              {viewMode === 'split' && (
                <SplitCompareViewer
                  beforeSrc={DIPTYCH_SRC}
                  afterSrc={activeCompositeSrc}
                  beforeLabel="Original Plate II"
                  afterLabel="Swapped Composite"
                />
              )}

              {viewMode === 'sources' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#1C1917] p-4">
                  <div className="space-y-2">
                    <div className="aspect-[16/9] overflow-hidden bg-[#0D1117]">
                      <img
                        src={SAINTS_SRC}
                        alt="Original saints.webp featuring nine standing saints"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <p className="text-xs text-[#D6D3D1] font-mono tabular-nums">
                      saints.webp · 2048 × 1144 px
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="aspect-[16/10] overflow-hidden bg-[#0D1117]">
                      <img
                        src={DIPTYCH_SRC}
                        alt="Original second diptych plate with three upper scenes and two flanking columns"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <p className="text-xs text-[#D6D3D1] font-mono tabular-nums">
                      leave-only-two-kiones.jpg · 1296 × 800 px
                    </p>
                  </div>
                </div>
              )}

              <figcaption className="mt-3 text-xs font-serif italic text-[#57534E]">
                Fig. 1 — Combined icon diptych: Hospitality of Abraham, Presentation in the Temple,
                and Communion of the Apostles retained above; nine standing saints from{' '}
                <span className="not-italic font-mono text-[11px]">saints.webp</span> seated
                between the two flanking stone columns (<em>kiones</em>).
                {viewMode === 'composite' && zoom > 1 ? ' Drag plate to pan.' : ''}
              </figcaption>
            </figure>
          </div>

          {/* Right Rail: Adjustments & Export */}
          <aside className="border border-[#DFD8CA] bg-[#F7F4EE] p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#E5DEC9] pb-3">
              <h2 className="font-editorial text-2xl font-medium text-[#1C1917]">
                Plate Framing
              </h2>
              <button
                type="button"
                onClick={handleResetOptions}
                disabled={usingDefault}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#78350F] hover:text-[#5C280B] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>

            {/* Ground Treatment */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-[#44403C]">
                Lower Ground Treatment
              </span>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-[#DFD8CA] bg-[#EFECE4] p-1">
                <button
                  type="button"
                  onClick={() => setOptions((o) => ({ ...o, groundMode: 'olive' }))}
                  className={`rounded px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    options.groundMode === 'olive'
                      ? 'bg-[#FBF9F5] text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Olive Ground
                </button>
                <button
                  type="button"
                  onClick={() => setOptions((o) => ({ ...o, groundMode: 'blue' }))}
                  className={`rounded px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    options.groundMode === 'blue'
                      ? 'bg-[#FBF9F5] text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  Royal Blue
                </button>
              </div>
            </div>

            {/* Retention Toggles */}
            <div className="space-y-3 border-t border-[#E5DEC9] pt-4">
              <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                <span className="text-sm text-[#1C1917]">Retain Flanking Columns</span>
                <input
                  type="checkbox"
                  checked={options.keepColumns}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, keepColumns: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#78350F] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                <span className="text-sm text-[#1C1917]">Match Royal Blue Sky</span>
                <input
                  type="checkbox"
                  checked={options.matchSkyBlue}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, matchSkyBlue: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[#78350F] cursor-pointer"
                />
              </label>
            </div>

            {/* Geometric Fine-Tuning */}
            <div className="space-y-4 border-t border-[#E5DEC9] pt-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="center-open" className="font-medium text-[#44403C]">
                    Center Open Space
                  </label>
                  <span className="font-mono tabular-nums text-[#57534E]">
                    {options.centerOpenPct}%
                  </span>
                </div>
                <input
                  id="center-open"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={options.centerOpenPct}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      centerOpenPct: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-[#78350F] cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="h-scale" className="font-medium text-[#44403C]">
                    Horizontal Scale
                  </label>
                  <span className="font-mono tabular-nums text-[#57534E]">
                    {options.horizontalScalePct}%
                  </span>
                </div>
                <input
                  id="h-scale"
                  type="range"
                  min={90}
                  max={112}
                  step={1}
                  value={options.horizontalScalePct}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      horizontalScalePct: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-[#78350F] cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="v-offset" className="font-medium text-[#44403C]">
                    Vertical Offset
                  </label>
                  <span className="font-mono tabular-nums text-[#57534E]">
                    {options.verticalOffsetPx > 0
                      ? `+${options.verticalOffsetPx} px`
                      : `${options.verticalOffsetPx} px`}
                  </span>
                </div>
                <input
                  id="v-offset"
                  type="range"
                  min={-18}
                  max={18}
                  step={1}
                  value={options.verticalOffsetPx}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      verticalOffsetPx: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-[#78350F] cursor-pointer"
                />
              </div>
            </div>

            {/* Export Controls */}
            <div className="space-y-3 border-t border-[#E5DEC9] pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#44403C]">Export Format</span>
                <div className="inline-flex items-center gap-1 rounded border border-[#DFD8CA] bg-[#EFECE4] p-0.5">
                  {(['png', 'jpeg', 'webp'] as ExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      className={`rounded px-2 py-1 text-[11px] font-mono uppercase transition-colors cursor-pointer ${
                        exportFormat === fmt
                          ? 'bg-[#FBF9F5] text-[#1C1917] shadow-xs'
                          : 'text-[#57534E] hover:text-[#1C1917]'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#78350F] px-4 py-2.5 text-sm font-semibold text-[#FBF9F5] transition-colors hover:bg-[#5C280B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#78350F] disabled:opacity-60 cursor-pointer"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isExporting
                    ? 'Preparing File...'
                    : `Save Composite (${exportFormat.toUpperCase()})`}
                </span>
              </button>
            </div>
          </aside>
        </section>

        {/* Accession & Retention Metadata Grid */}
        <section id="details" className="mt-14 border-t border-[#E5DEC9] pt-10">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
            <div>
              <h2 className="font-editorial text-2xl font-medium text-[#1C1917]">
                Retention Record
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                Pixel-level preservation of the upper iconographic register, decorative dividers,
                and architectural columns from Plate II.
              </p>
            </div>

            <dl className="divide-y divide-[#E5DEC9] border-t border-b border-[#E5DEC9] text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 py-3.5">
                <dt className="font-medium text-[#57534E]">Output Dimensions</dt>
                <dd className="font-mono tabular-nums text-[#1C1917]">1296 × 800 px (sRGB)</dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 py-3.5">
                <dt className="font-medium text-[#57534E]">Retained Upper Register</dt>
                <dd className="text-[#1C1917]">
                  Hospitality of Abraham, Presentation of Christ in the Temple, and Communion of
                  the Apostles with original framing borders.
                </dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 py-3.5">
                <dt className="font-medium text-[#57534E]">Retained Architectural Frame</dt>
                <dd className="text-[#1C1917]">
                  Middle ornate mosaic band, outer vermilion-gold border, bottom patterned band,
                  and both flanking stone columns (<em>kiones</em>).
                </dd>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 py-3.5">
                <dt className="font-medium text-[#57534E]">Swapped Lower Register</dt>
                <dd className="text-[#1C1917]">
                  Nine standing hierarchs and saints from{' '}
                  <span className="font-mono text-xs">saints.webp</span> split around the central
                  opening, with the inverted Greek dedicatory scroll placed in St. Basil&apos;s
                  hands and the Gospel Bible placed in St. John Chrysostom&apos;s left hand.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Source Plates Reference Section */}
        <section id="sources" className="mt-14 border-t border-[#E5DEC9] pt-10 pb-6">
          <div className="mb-6">
            <h2 className="font-editorial text-2xl font-medium text-[#1C1917]">
              Source Plates
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <figure className="border border-[#DFD8CA] bg-[#F7F4EE] p-4">
              <div className="aspect-[16/9] overflow-hidden bg-[#1C1917]">
                <img
                  src={SAINTS_SRC}
                  alt="Source Plate I: Nine standing saints"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              </div>
              <figcaption className="mt-3 flex items-center justify-between gap-4 text-xs text-[#57534E]">
                <span className="font-serif italic">
                  Fig. 2 — Plate I: Nine Standing Saints (saints.webp)
                </span>
                <span className="font-mono tabular-nums shrink-0">2048 × 1144 px</span>
              </figcaption>
            </figure>

            <figure className="border border-[#DFD8CA] bg-[#F7F4EE] p-4">
              <div className="aspect-[16/10] overflow-hidden bg-[#1C1917]">
                <img
                  src={DIPTYCH_SRC}
                  alt="Source Plate II: Two-tier diptych with upper scenes and flanking columns"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              </div>
              <figcaption className="mt-3 flex items-center justify-between gap-4 text-xs text-[#57534E]">
                <span className="font-serif italic">
                  Fig. 3 — Plate II: Original Diptych with Two Kiones
                </span>
                <span className="font-mono tabular-nums shrink-0">1296 × 800 px</span>
              </figcaption>
            </figure>
          </div>
        </section>
      </main>
    </div>
  );
}
