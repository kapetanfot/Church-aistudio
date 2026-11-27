import { encodeRgbaBandsToJpegBlob } from './streamingJpeg';

export const WALL_WIDTH_MM = 4050;
export const WALL_HEIGHT_MM = 2500;
const MM_PER_INCH = 25.4;

export type PrintDpi = 72 | 100 | 150 | 300;
export type BleedStyle = 'none' | 'mirror' | 'solid';
export type PanelCount = 1 | 3 | 4 | 8;

export interface PrintPrepConfig {
  dpi: PrintDpi;
  bleedMm: number;       // 0, 30, 40, or 50 mm per side
  bleedStyle: BleedStyle;
  panelCount: PanelCount;
  overlapMm: number;     // 0 or 15 mm for multi-panel tiling
  includeCornerMarks: boolean;
  format: 'jpeg' | 'png';
}

export const DEFAULT_PRINT_CONFIG: PrintPrepConfig = {
  dpi: 300,
  bleedMm: 40,
  bleedStyle: 'mirror',
  panelCount: 1,
  overlapMm: 0,
  includeCornerMarks: true,
  format: 'jpeg',
};

export function getPanelGrid(panelCount: PanelCount): { cols: number; rows: number } {
  if (panelCount === 8) return { cols: 4, rows: 2 };
  if (panelCount === 4) return { cols: 4, rows: 1 };
  if (panelCount === 3) return { cols: 3, rows: 1 };
  return { cols: 1, rows: 1 };
}

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function getPrintDimensions(config: PrintPrepConfig) {
  const effectiveBleed = config.bleedStyle === 'none' ? 0 : config.bleedMm;
  const totalWidthMm = WALL_WIDTH_MM + effectiveBleed * 2;
  const totalHeightMm = WALL_HEIGHT_MM + effectiveBleed * 2;
  const totalWidthPx = mmToPx(totalWidthMm, config.dpi);
  const totalHeightPx = mmToPx(totalHeightMm, config.dpi);

  const { cols, rows } = getPanelGrid(config.panelCount);
  const panelBaseWidthMm = WALL_WIDTH_MM / cols;
  const panelBaseHeightMm = WALL_HEIGHT_MM / rows;
  return {
    effectiveBleed,
    totalWidthMm,
    totalHeightMm,
    totalWidthPx,
    totalHeightPx,
    panelCols: cols,
    panelRows: rows,
    panelBaseWidthMm,
    panelBaseHeightMm,
  };
}

// CRC32 table for PNG pHYs chunk
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export async function injectPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // Verify PNG signature
  if (buf.length < 33 || buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) {
    return blob;
  }

  const ppm = Math.round(dpi * 39.37007874);
  const physData = new Uint8Array(13); // 4 type + 9 payload
  physData[0] = 112; // 'p'
  physData[1] = 72;  // 'H'
  physData[2] = 89;  // 'Y'
  physData[3] = 115; // 's'
  const view = new DataView(physData.buffer);
  view.setUint32(4, ppm, false);
  view.setUint32(8, ppm, false);
  physData[12] = 1; // meters

  const chunk = new Uint8Array(4 + 13 + 4);
  const chunkView = new DataView(chunk.buffer);
  chunkView.setUint32(0, 9, false);
  chunk.set(physData, 4);
  chunkView.setUint32(17, crc32(physData), false);

  // Strip any existing pHYs and insert before first IDAT
  const parts: Uint8Array[] = [buf.slice(0, 8)];
  let pos = 8;
  let inserted = false;
  while (pos + 12 <= buf.length) {
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 8);
    const len = dv.getUint32(0, false);
    const type = String.fromCharCode(buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]);
    const totalChunkLen = 12 + len;
    if (pos + totalChunkLen > buf.length) break;

    if (type === 'pHYs') {
      pos += totalChunkLen;
      continue;
    }
    if (type === 'IDAT' && !inserted) {
      parts.push(chunk);
      inserted = true;
    }
    parts.push(buf.slice(pos, pos + totalChunkLen));
    pos += totalChunkLen;
  }

  const totalSize = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(totalSize);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return new Blob([out], { type: 'image/png' });
}

export async function injectJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < 20 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return blob;
  }

  // Check if APP0 JFIF is right after SOI (offset 2)
  if (
    buf[2] === 0xff &&
    buf[3] === 0xe0 &&
    buf[6] === 0x4a && // 'J'
    buf[7] === 0x46 && // 'F'
    buf[8] === 0x49 && // 'I'
    buf[9] === 0x46 && // 'F'
    buf[10] === 0x00
  ) {
    const copy = new Uint8Array(buf);
    copy[13] = 1; // units = dots per inch
    const dv = new DataView(copy.buffer);
    dv.setUint16(14, dpi, false);
    dv.setUint16(16, dpi, false);
    return new Blob([copy], { type: 'image/jpeg' });
  }

  // Insert JFIF APP0 segment immediately after SOI
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x01,
    (dpi >> 8) & 0xff, dpi & 0xff,
    (dpi >> 8) & 0xff, dpi & 0xff,
    0x00, 0x00,
  ]);
  const out = new Uint8Array(buf.length + app0.length);
  out.set(buf.slice(0, 2), 0);
  out.set(app0, 2);
  out.set(buf.slice(2), 2 + app0.length);
  return new Blob([out], { type: 'image/jpeg' });
}

interface SheetGeometryParams {
  srcImg: HTMLImageElement;
  config: PrintPrepConfig;
  effectiveBleedMm: number;
  startMmX: number;
  startMmY: number;
  sheetWidthPx: number;
  sheetHeightPx: number;
  isLeftmost: boolean;
  isRightmost: boolean;
  isTopmost: boolean;
  isBottommost: boolean;
  leftBleedMm: number;
  rightBleedMm: number;
  topBleedMm: number;
  bottomBleedMm: number;
}

/**
 * Renders the artwork, mirror/solid wrap bleed, and corner fold ticks for any chunk `[offsetX, offsetY, chunkW, chunkH]`
 * inside the target sheet coordinate space. Calling this across adjacent chunks guarantees seamless continuity.
 */
function renderSheetRegion(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  chunkW: number,
  chunkH: number,
  geom: SheetGeometryParams
) {
  const {
    srcImg,
    config,
    effectiveBleedMm,
    startMmX,
    startMmY,
    sheetWidthPx,
    sheetHeightPx,
    isLeftmost,
    isRightmost,
    isTopmost,
    isBottommost,
    leftBleedMm,
    rightBleedMm,
    topBleedMm,
    bottomBleedMm,
  } = geom;

  const pxPerMm = config.dpi / MM_PER_INCH;
  const srcW = srcImg.naturalWidth;
  const srcH = srcImg.naturalHeight;

  // Fill background first (solid frame crimson-bronze)
  ctx.fillStyle = '#4B0D03';
  ctx.fillRect(0, 0, chunkW, chunkH);

  ctx.save();
  ctx.translate(-offsetX, -offsetY);

  // Global pixel box of the front artwork [0..WALL_WIDTH_MM, 0..WALL_HEIGHT_MM] mapped to sheet pixels
  const artX = -startMmX * pxPerMm;
  const artY = -startMmY * pxPerMm;
  const artW = WALL_WIDTH_MM * pxPerMm;
  const artH = WALL_HEIGHT_MM * pxPerMm;

  // Draw the front artwork
  ctx.drawImage(srcImg, 0, 0, srcW, srcH, artX, artY, artW, artH);

  // Draw mirror wrap bleed if selected
  if (config.bleedStyle === 'mirror' && effectiveBleedMm > 0) {
    const bleedPx = effectiveBleedMm * pxPerMm;
    const srcBleedW = (effectiveBleedMm / WALL_WIDTH_MM) * srcW;
    const srcBleedH = (effectiveBleedMm / WALL_HEIGHT_MM) * srcH;

    // Top mirror
    if (isTopmost) {
      ctx.save();
      ctx.translate(artX, artY);
      ctx.scale(1, -1);
      ctx.drawImage(srcImg, 0, 0, srcW, srcBleedH, 0, 0, artW, bleedPx);
      ctx.restore();
    }

    // Bottom mirror
    if (isBottommost) {
      ctx.save();
      ctx.translate(artX, artY + artH);
      ctx.scale(1, -1);
      ctx.drawImage(srcImg, 0, srcH - srcBleedH, srcW, srcBleedH, 0, -bleedPx, artW, bleedPx);
      ctx.restore();
    }

    // Left mirror
    if (isLeftmost) {
      ctx.save();
      ctx.translate(artX, artY);
      ctx.scale(-1, 1);
      ctx.drawImage(srcImg, 0, 0, srcBleedW, srcH, 0, 0, bleedPx, artH);
      ctx.restore();

      if (isTopmost) {
        ctx.save();
        ctx.translate(artX, artY);
        ctx.scale(-1, -1);
        ctx.drawImage(srcImg, 0, 0, srcBleedW, srcBleedH, 0, 0, bleedPx, bleedPx);
        ctx.restore();
      }

      if (isBottommost) {
        ctx.save();
        ctx.translate(artX, artY + artH);
        ctx.scale(-1, -1);
        ctx.drawImage(srcImg, 0, srcH - srcBleedH, srcBleedW, srcBleedH, 0, -bleedPx, bleedPx, bleedPx);
        ctx.restore();
      }
    }

    // Right mirror
    if (isRightmost) {
      ctx.save();
      ctx.translate(artX + artW, artY);
      ctx.scale(-1, 1);
      ctx.drawImage(srcImg, srcW - srcBleedW, 0, srcBleedW, srcH, -bleedPx, 0, bleedPx, artH);
      ctx.restore();

      if (isTopmost) {
        ctx.save();
        ctx.translate(artX + artW, artY);
        ctx.scale(-1, -1);
        ctx.drawImage(srcImg, srcW - srcBleedW, 0, srcBleedW, srcBleedH, -bleedPx, 0, bleedPx, bleedPx);
        ctx.restore();
      }

      if (isBottommost) {
        ctx.save();
        ctx.translate(artX + artW, artY + artH);
        ctx.scale(-1, -1);
        ctx.drawImage(srcImg, srcW - srcBleedW, srcH - srcBleedH, srcBleedW, srcBleedH, -bleedPx, -bleedPx, bleedPx, bleedPx);
        ctx.restore();
      }
    }
  }

  // Optional corner fold ticks right along outer bleed edges (never crossing front face)
  if (config.includeCornerMarks && effectiveBleedMm > 0) {
    const tickLen = Math.max(24, Math.round(effectiveBleedMm * pxPerMm * 0.55));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(2, Math.round(config.dpi / 36));
    const leftEdgeX = leftBleedMm * pxPerMm;
    const rightEdgeX = sheetWidthPx - rightBleedMm * pxPerMm;
    const topEdgeY = topBleedMm * pxPerMm;
    const botEdgeY = sheetHeightPx - bottomBleedMm * pxPerMm;

    ctx.beginPath();
    if (isLeftmost && isTopmost) {
      ctx.moveTo(leftEdgeX, 0);
      ctx.lineTo(leftEdgeX, tickLen);
      ctx.moveTo(0, topEdgeY);
      ctx.lineTo(tickLen, topEdgeY);
    }
    if (isLeftmost && isBottommost) {
      ctx.moveTo(leftEdgeX, sheetHeightPx);
      ctx.lineTo(leftEdgeX, sheetHeightPx - tickLen);
      ctx.moveTo(0, botEdgeY);
      ctx.lineTo(tickLen, botEdgeY);
    }
    if (isRightmost && isTopmost) {
      ctx.moveTo(rightEdgeX, 0);
      ctx.lineTo(rightEdgeX, tickLen);
      ctx.moveTo(sheetWidthPx, topEdgeY);
      ctx.lineTo(sheetWidthPx - tickLen, topEdgeY);
    }
    if (isRightmost && isBottommost) {
      ctx.moveTo(rightEdgeX, sheetHeightPx);
      ctx.lineTo(rightEdgeX, sheetHeightPx - tickLen);
      ctx.moveTo(sheetWidthPx, botEdgeY);
      ctx.lineTo(sheetWidthPx - tickLen, botEdgeY);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders a full or tiled print-ready sheet with exact millimeter-to-pixel geometry,
 * gallery wrap bleed (mirror or solid), optional corner fold marks, and embedded DPI headers.
 * Uses native <canvas> when <= 16,384 px per side, and band-streaming JPEG encoding when larger (e.g. 300 DPI single sheet).
 */
export async function exportPrintSheet(
  sourceImg: HTMLImageElement,
  config: PrintPrepConfig,
  panelIndex = 0, // 0-based row-major when panelCount > 1
  prebuiltFullMaster?: HTMLImageElement | null,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; widthPx: number; heightPx: number; widthMm: number; heightMm: number; filename: string }> {
  const effectiveBleedMm = config.bleedStyle === 'none' ? 0 : config.bleedMm;
  const { cols, rows } = getPanelGrid(config.panelCount);
  const colIndex = panelIndex % cols;
  const rowIndex = Math.floor(panelIndex / cols);

  const panelWidthMm = WALL_WIDTH_MM / cols;
  const panelHeightMm = WALL_HEIGHT_MM / rows;

  const isLeftmost = colIndex === 0;
  const isRightmost = colIndex === cols - 1;
  const isTopmost = rowIndex === 0;
  const isBottommost = rowIndex === rows - 1;

  const leftBleedMm = isLeftmost ? effectiveBleedMm : 0;
  const rightBleedMm = isRightmost ? effectiveBleedMm : 0;
  const topBleedMm = isTopmost ? effectiveBleedMm : 0;
  const bottomBleedMm = isBottommost ? effectiveBleedMm : 0;

  const leftOverlapMm = !isLeftmost && cols > 1 ? config.overlapMm / 2 : 0;
  const rightOverlapMm = !isRightmost && cols > 1 ? config.overlapMm / 2 : 0;
  const topOverlapMm = !isTopmost && rows > 1 ? config.overlapMm / 2 : 0;
  const bottomOverlapMm = !isBottommost && rows > 1 ? config.overlapMm / 2 : 0;

  const startMmX = colIndex * panelWidthMm - leftBleedMm - leftOverlapMm;
  const endMmX = (colIndex + 1) * panelWidthMm + rightBleedMm + rightOverlapMm;
  const startMmY = rowIndex * panelHeightMm - topBleedMm - topOverlapMm;
  const endMmY = (rowIndex + 1) * panelHeightMm + bottomBleedMm + bottomOverlapMm;

  const sheetWidthMm = endMmX - startMmX;
  const sheetHeightMm = endMmY - startMmY;

  const sheetWidthPx = mmToPx(sheetWidthMm, config.dpi);
  const sheetHeightPx = mmToPx(sheetHeightMm, config.dpi);

  const srcImg = prebuiltFullMaster || sourceImg;
  const geom: SheetGeometryParams = {
    srcImg,
    config,
    effectiveBleedMm,
    startMmX,
    startMmY,
    sheetWidthPx,
    sheetHeightPx,
    isLeftmost,
    isRightmost,
    isTopmost,
    isBottommost,
    leftBleedMm,
    rightBleedMm,
    topBleedMm,
    bottomBleedMm,
  };

  const panelTag = config.panelCount > 1 ? `-panel-${panelIndex + 1}of${config.panelCount}` : '';
  const bleedTag = effectiveBleedMm > 0 ? `-bleed${effectiveBleedMm}mm` : '';
  const filename = `diptych-${WALL_WIDTH_MM}x${WALL_HEIGHT_MM}mm-${config.dpi}dpi${bleedTag}${panelTag}.${config.format}`;

  // Fast native canvas path when dimensions fit within browser 16,384 px limit
  if (sheetWidthPx <= 16384 && sheetHeightPx <= 16384) {
    const canvas = document.createElement('canvas');
    canvas.width = sheetWidthPx;
    canvas.height = sheetHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to initialize print canvas');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    renderSheetRegion(ctx, 0, 0, sheetWidthPx, sheetHeightPx, geom);

    const mime = config.format === 'png' ? 'image/png' : 'image/jpeg';
    const rawBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas export returned empty blob'))),
        mime,
        config.format === 'jpeg' ? 0.96 : undefined
      );
    });

    const dpiBlob =
      config.format === 'png'
        ? await injectPngDpi(rawBlob, config.dpi)
        : await injectJpegDpi(rawBlob, config.dpi);

    onProgress?.(100);
    return {
      blob: dpiBlob,
      widthPx: sheetWidthPx,
      heightPx: sheetHeightPx,
      widthMm: Math.round(sheetWidthMm),
      heightMm: Math.round(sheetHeightMm),
      filename,
    };
  }

  // Band-streaming JPEG path for sheets exceeding 16,384 px (e.g. 300 DPI single sheet: 47,835 × 29,528+ px)
  if (config.format === 'png') {
    throw new Error(
      `Output ${sheetWidthPx.toLocaleString()} × ${sheetHeightPx.toLocaleString()} px exceeds browser PNG buffer limits. Select JPEG format or switch to 8 Panels (4×2) for PNG tiles.`
    );
  }

  const BAND_H = 256; // multiple of 16 for YCbCr 4:2:0 MCUs
  const CHUNK_W = 4096;
  const bandRgba = new Uint8Array(sheetWidthPx * BAND_H * 4);
  const chunkCanvas = document.createElement('canvas');
  const chunkCtx = chunkCanvas.getContext('2d', { willReadFrequently: true });
  if (!chunkCtx) throw new Error('Unable to initialize band streaming canvas');

  const blob = await encodeRgbaBandsToJpegBlob(
    sheetWidthPx,
    sheetHeightPx,
    config.dpi,
    94,
    BAND_H,
    async (yStart, bandHeight) => {
      const targetBuf =
        bandHeight === BAND_H ? bandRgba : new Uint8Array(sheetWidthPx * bandHeight * 4);

      if (chunkCanvas.height !== bandHeight) {
        chunkCanvas.height = bandHeight;
      }

      for (let chunkX = 0; chunkX < sheetWidthPx; chunkX += CHUNK_W) {
        const curChunkW = Math.min(CHUNK_W, sheetWidthPx - chunkX);
        if (chunkCanvas.width !== curChunkW) {
          chunkCanvas.width = curChunkW;
        }
        chunkCtx.imageSmoothingEnabled = true;
        chunkCtx.imageSmoothingQuality = 'high';

        renderSheetRegion(chunkCtx, chunkX, yStart, curChunkW, bandHeight, geom);
        const chunkData = chunkCtx.getImageData(0, 0, curChunkW, bandHeight).data;

        for (let row = 0; row < bandHeight; row++) {
          const srcOff = row * curChunkW * 4;
          const dstOff = (row * sheetWidthPx + chunkX) * 4;
          targetBuf.set(chunkData.subarray(srcOff, srcOff + curChunkW * 4), dstOff);
        }
      }

      return targetBuf;
    },
    onProgress
  );

  return {
    blob,
    widthPx: sheetWidthPx,
    heightPx: sheetHeightPx,
    widthMm: Math.round(sheetWidthMm),
    heightMm: Math.round(sheetHeightMm),
    filename,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
