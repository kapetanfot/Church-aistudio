export interface CompositionOptions {
  horizontalScalePct: number; // 90 to 112 (100 = 1:1 natural aspect ratio -> 1112px wide)
  verticalOffsetPx: number;   // -18 to +18
  centerOpenPct: number;      // 0 to 100 (100 = flush against columns, open space in middle)
  matchSkyBlue: boolean;      // blend saints.webp upper blue into image 2 royal blue
  keepColumns: boolean;       // retain left & right kiones in foreground
  groundMode: 'olive' | 'blue';
}

export const DEFAULT_COMPOSITION: CompositionOptions = {
  horizontalScalePct: 100,
  verticalOffsetPx: 0,
  centerOpenPct: 100,
  matchSkyBlue: true,
  keepColumns: true,
  groundMode: 'olive',
};

export function isDefaultComposition(opts: CompositionOptions): boolean {
  return (
    opts.horizontalScalePct === DEFAULT_COMPOSITION.horizontalScalePct &&
    opts.verticalOffsetPx === DEFAULT_COMPOSITION.verticalOffsetPx &&
    opts.centerOpenPct === DEFAULT_COMPOSITION.centerOpenPct &&
    opts.matchSkyBlue === DEFAULT_COMPOSITION.matchSkyBlue &&
    opts.keepColumns === DEFAULT_COMPOSITION.keepColumns &&
    opts.groundMode === DEFAULT_COMPOSITION.groundMode
  );
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function isSkyBlue(r: number, g: number, b: number): boolean {
  return r < 32 && g < 82 && b > 88 && b - g > 32 && b - r > 62;
}

function isOliveFloor(r: number, g: number, b: number): boolean {
  return Math.abs(r - 91) < 28 && Math.abs(g - 86) < 26 && Math.abs(b - 42) < 24 && r > b + 20 && g > b + 20;
}

export function renderCompositeToCanvas(
  targetCanvas: HTMLCanvasElement,
  swappedBaseImg: HTMLImageElement,
  diptychImg: HTMLImageElement,
  opts: CompositionOptions
): void {
  const W = diptychImg.naturalWidth || 1296;
  const H = diptychImg.naturalHeight || 800;
  if (targetCanvas.width !== W) targetCanvas.width = W;
  if (targetCanvas.height !== H) targetCanvas.height = H;

  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  // Base diptych (retains upper 3 scenes, ornate borders, outer frame)
  ctx.drawImage(diptychImg, 0, 0, W, H);
  const outImgData = ctx.getImageData(0, 0, W, H);
  const out = outImgData.data;
  const origDiptych = new Uint8ClampedArray(out);

  // Extract lower interior panel (y=336..784 -> 449px tall) from swappedBaseImg
  const panelH = 449;
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = W;
  panelCanvas.height = panelH;
  const pCtx = panelCanvas.getContext('2d', { willReadFrequently: true });
  if (!pCtx) return;
  pCtx.drawImage(swappedBaseImg, 0, 336, W, panelH, 0, 0, W, panelH);

  // Extract left group (x=25..616 -> 591px) and right group (x=678..1275 -> 597px)
  const srcLeftX = 25;
  const srcLeftW = 591;
  const srcRightX = 678;
  const srcRightW = 597;

  const scaledLeftW = Math.round((srcLeftW * opts.horizontalScalePct) / 100);
  const scaledRightW = Math.round((srcRightW * opts.horizontalScalePct) / 100);

  const leftCanvas = document.createElement('canvas');
  leftCanvas.width = scaledLeftW;
  leftCanvas.height = panelH;
  const lCtx = leftCanvas.getContext('2d', { willReadFrequently: true });
  if (!lCtx) return;
  lCtx.imageSmoothingEnabled = true;
  lCtx.imageSmoothingQuality = 'high';
  lCtx.drawImage(panelCanvas, srcLeftX, 0, srcLeftW, panelH, 0, 0, scaledLeftW, panelH);

  const rightCanvas = document.createElement('canvas');
  rightCanvas.width = scaledRightW;
  rightCanvas.height = panelH;
  const rCtx = rightCanvas.getContext('2d', { willReadFrequently: true });
  if (!rCtx) return;
  rCtx.imageSmoothingEnabled = true;
  rCtx.imageSmoothingQuality = 'high';
  rCtx.drawImage(panelCanvas, srcRightX, 0, srcRightW, panelH, 0, 0, scaledRightW, panelH);

  const lData = lCtx.getImageData(0, 0, scaledLeftW, panelH).data;
  const rData = rCtx.getImageData(0, 0, scaledRightW, panelH).data;
  const midProfile = pCtx.getImageData(645, 0, 1, panelH).data;

  // Sample olive ground
  const oliveR = midProfile[(panelH - 8) * 4] || 91;
  const oliveG = midProfile[(panelH - 8) * 4 + 1] || 86;
  const oliveB = midProfile[(panelH - 8) * 4 + 2] || 42;

  // Optional groundMode === 'blue' flood fill on both groups
  const convertFloorIfBlue = (data: Uint8ClampedArray, gw: number) => {
    if (opts.groundMode !== 'blue') return;
    const mask = new Uint8Array(gw * panelH);
    const queue = new Int32Array(gw * panelH);
    let head = 0;
    let tail = 0;
    const seeds = [
      (panelH - 6) * gw + 2,
      (panelH - 6) * gw + (gw - 3),
      (panelH - 40) * gw + 2,
      (panelH - 40) * gw + (gw - 3),
    ];
    for (const s of seeds) {
      if (s >= 0 && s < gw * panelH && !mask[s]) {
        const si = s * 4;
        if (isOliveFloor(data[si], data[si + 1], data[si + 2])) {
          mask[s] = 1;
          queue[tail++] = s;
        }
      }
    }
    while (head < tail) {
      const pos = queue[head++];
      const cx = pos % gw;
      const cy = (pos - cx) / gw;
      const neighbors = [
        cx > 0 ? pos - 1 : -1,
        cx + 1 < gw ? pos + 1 : -1,
        cy > 0 ? pos - gw : -1,
        cy + 1 < panelH ? pos + gw : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && !mask[n]) {
          const ni = n * 4;
          if (isOliveFloor(data[ni], data[ni + 1], data[ni + 2])) {
            mask[n] = 1;
            queue[tail++] = n;
          }
        }
      }
    }
    for (let i = 0; i < gw * panelH; i++) {
      if (mask[i]) {
        const p = i * 4;
        data[p] = 0;
        data[p + 1] = 55;
        data[p + 2] = 112;
      }
    }
  };

  convertFloorIfBlue(lData, scaledLeftW);
  convertFloorIfBlue(rData, scaledRightW);

  const flushLeftX = 25;
  const flushRightX = 1275 - scaledRightW;
  const minGap = 12;
  const closedLeftX = Math.round((W - (scaledLeftW + scaledRightW + minGap)) / 2);
  const closedRightX = closedLeftX + scaledLeftW + minGap;

  const tOpen = Math.max(0, Math.min(1, opts.centerOpenPct / 100));
  const leftDestX = Math.round(closedLeftX * (1 - tOpen) + flushLeftX * tOpen);
  const rightDestX = Math.round(closedRightX * (1 - tOpen) + flushRightX * tOpen);
  const yOff = 336 + opts.verticalOffsetPx;

  for (let y = 336; y <= 784; y++) {
    const syRaw = y - yOff;
    const sy = Math.max(0, Math.min(panelH - 1, syRaw));
    const mr = midProfile[sy * 4];
    const mg = midProfile[sy * 4 + 1];
    const mb = midProfile[sy * 4 + 2];

    for (let x = 8; x <= 1288; x++) {
      const oi = (y * W + x) * 4;
      if (x >= leftDestX && x < leftDestX + scaledLeftW && !(x >= rightDestX && x < rightDestX + scaledRightW)) {
        if (syRaw < 0) {
          out[oi] = 0;
          out[oi + 1] = 55;
          out[oi + 2] = 112;
        } else if (syRaw >= panelH) {
          out[oi] = opts.groundMode === 'blue' ? 0 : oliveR;
          out[oi + 1] = opts.groundMode === 'blue' ? 55 : oliveG;
          out[oi + 2] = opts.groundMode === 'blue' ? 112 : oliveB;
        } else {
          const si = (sy * scaledLeftW + (x - leftDestX)) * 4;
          out[oi] = lData[si];
          out[oi + 1] = lData[si + 1];
          out[oi + 2] = lData[si + 2];
        }
      } else if (x >= rightDestX && x < rightDestX + scaledRightW) {
        if (syRaw < 0) {
          out[oi] = 0;
          out[oi + 1] = 55;
          out[oi + 2] = 112;
        } else if (syRaw >= panelH) {
          out[oi] = opts.groundMode === 'blue' ? 0 : oliveR;
          out[oi + 1] = opts.groundMode === 'blue' ? 55 : oliveG;
          out[oi + 2] = opts.groundMode === 'blue' ? 112 : oliveB;
        } else {
          const si = (sy * scaledRightW + (x - rightDestX)) * 4;
          out[oi] = rData[si];
          out[oi + 1] = rData[si + 1];
          out[oi + 2] = rData[si + 2];
        }
      } else {
        if (opts.groundMode === 'blue' || syRaw < 345) {
          out[oi] = 0;
          out[oi + 1] = 55;
          out[oi + 2] = 112;
        } else if (syRaw >= panelH) {
          out[oi] = oliveR;
          out[oi + 1] = oliveG;
          out[oi + 2] = oliveB;
        } else {
          out[oi] = mr;
          out[oi + 1] = mg;
          out[oi + 2] = mb;
        }
      }
      out[oi + 3] = 255;
    }
  }

  if (opts.keepColumns) {
    for (let y = 440; y <= 727; y++) {
      let lxStart = 8;
      let lxEnd = 24;
      let rxStart = 1277;
      let rxEnd = 1289;
      if (y <= 465) {
        lxEnd = 27;
        rxStart = 1271;
      } else if (y >= 704) {
        lxEnd = 28;
        rxStart = 1271;
      }

      for (let x = lxStart; x <= lxEnd; x++) {
        const ii = (y * W + x) * 4;
        const r = origDiptych[ii];
        const g = origDiptych[ii + 1];
        const b = origDiptych[ii + 2];
        const dist = Math.hypot(r - 0, g - 55, b - 112);
        if (dist > 26) {
          const alpha = Math.min(1, (dist - 26) / 24);
          out[ii] = Math.round(out[ii] * (1 - alpha) + r * alpha);
          out[ii + 1] = Math.round(out[ii + 1] * (1 - alpha) + g * alpha);
          out[ii + 2] = Math.round(out[ii + 2] * (1 - alpha) + b * alpha);
        }
      }

      for (let x = rxStart; x <= rxEnd; x++) {
        const ii = (y * W + x) * 4;
        const r = origDiptych[ii];
        const g = origDiptych[ii + 1];
        const b = origDiptych[ii + 2];
        const dist = Math.hypot(r - 0, g - 55, b - 112);
        if (dist > 26) {
          const alpha = Math.min(1, (dist - 26) / 24);
          out[ii] = Math.round(out[ii] * (1 - alpha) + r * alpha);
          out[ii + 1] = Math.round(out[ii + 1] * (1 - alpha) + g * alpha);
          out[ii + 2] = Math.round(out[ii + 2] * (1 - alpha) + b * alpha);
        }
      }
    }
  }

  ctx.putImageData(outImgData, 0, 0);
}

export async function downloadComposite(
  source: HTMLCanvasElement | string,
  format: 'png' | 'jpeg' | 'webp',
  filenameBase = 'diptych-saints-swapped'
): Promise<void> {
  const mime =
    format === 'png'
      ? 'image/png'
      : format === 'jpeg'
        ? 'image/jpeg'
        : 'image/webp';

  let url: string;
  if (typeof source === 'string' && format === 'png') {
    url = source;
  } else {
    const canvas = document.createElement('canvas');
    if (typeof source === 'string') {
      const img = await loadImage(source);
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
    } else {
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(source, 0, 0);
    }
    url = canvas.toDataURL(mime, format === 'png' ? undefined : 0.95);
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenameBase}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
