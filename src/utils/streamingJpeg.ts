/**
 * Band-streaming Baseline JPEG encoder (YCbCr 4:2:0, JFIF 1.01 with embedded DPI).
 * Allows encoding ultra-high-resolution sheets (e.g. 48,780 × 30,472 px at 300 DPI)
 * strictly within browser memory without exceeding the 16,384 px HTML5 <canvas> limit.
 */

// Zig-zag scan order from natural 8x8 row-major index -> zig-zag stream index
const ZIGZAG = new Uint8Array([
   0,  1,  5,  6, 14, 15, 27, 28,
   2,  4,  7, 13, 16, 26, 29, 42,
   3,  8, 12, 17, 25, 30, 41, 43,
   9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54,
  20, 22, 33, 38, 46, 51, 55, 60,
  21, 34, 37, 47, 50, 56, 59, 61,
  35, 36, 48, 49, 57, 58, 62, 63,
]);

// ITU-T T.81 Annex K standard quantization tables (row-major 8x8)
const STD_LUM_QT = new Uint8Array([
  16, 11, 10, 16,  24,  40,  51,  61,
  12, 12, 14, 19,  26,  58,  60,  55,
  14, 13, 16, 24,  40,  57,  69,  56,
  14, 17, 22, 29,  51,  87,  80,  62,
  18, 22, 37, 56,  68, 109, 103,  77,
  24, 35, 55, 64,  81, 104, 113,  92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103,  99,
]);

const STD_CHR_QT = new Uint8Array([
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
]);

// ITU-T T.81 Annex K standard Huffman specifications
const STD_DC_LUM_NRCODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const STD_DC_LUM_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const STD_AC_LUM_NRCODES = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const STD_AC_LUM_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
  0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
  0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
  0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
  0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
  0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

const STD_DC_CHR_NRCODES = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const STD_DC_CHR_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const STD_AC_CHR_NRCODES = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const STD_AC_CHR_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21,
  0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34,
  0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38,
  0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78,
  0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2,
  0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
  0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

const AAN_SCALE_FACTORS = [
  1.0, 1.387039845, 1.306562965, 1.175875602,
  1.0, 0.785694958, 0.541196100, 0.275899379,
];

interface HuffLUT {
  codes: Uint16Array;
  lengths: Uint8Array;
}

function buildHuffLUT(nrcodes: number[], values: number[]): HuffLUT {
  const codes = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    const count = nrcodes[len];
    for (let j = 0; j < count; j++) {
      const sym = values[k++];
      codes[sym] = code;
      lengths[sym] = len;
      code++;
    }
    code <<= 1;
  }
  return { codes, lengths };
}

const Y_DC_HT = buildHuffLUT(STD_DC_LUM_NRCODES, STD_DC_LUM_VALUES);
const Y_AC_HT = buildHuffLUT(STD_AC_LUM_NRCODES, STD_AC_LUM_VALUES);
const UV_DC_HT = buildHuffLUT(STD_DC_CHR_NRCODES, STD_DC_CHR_VALUES);
const UV_AC_HT = buildHuffLUT(STD_AC_CHR_NRCODES, STD_AC_CHR_VALUES);

// Precompute signed-value category and bit representations for [-2047..2047]
const CAT_OFFSET = 2048;
const BIT_CODES = new Uint16Array(4096);
const BIT_LENGTHS = new Uint8Array(4096);
(() => {
  let limit = 1;
  let bits = 1;
  for (let absVal = 1; absVal < 2048; absVal++) {
    if (absVal > limit) {
      bits++;
      limit = (limit << 1) | 1;
    }
    BIT_CODES[CAT_OFFSET + absVal] = absVal;
    BIT_LENGTHS[CAT_OFFSET + absVal] = bits;
    BIT_CODES[CAT_OFFSET - absVal] = limit - absVal;
    BIT_LENGTHS[CAT_OFFSET - absVal] = bits;
  }
})();

function buildQuantTables(quality: number) {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const sf = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;

  // Zig-zag ordered uint8 tables for DQT header
  const yHeaderQt = new Uint8Array(64);
  const uvHeaderQt = new Uint8Array(64);
  // Pre-scaled inverse AAN quantization multipliers indexed in row-major order
  const yFdtScale = new Float64Array(64);
  const uvFdtScale = new Float64Array(64);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 8 + col;
      const yQ = Math.max(1, Math.min(255, Math.floor((STD_LUM_QT[idx] * sf + 50) / 100)));
      const uvQ = Math.max(1, Math.min(255, Math.floor((STD_CHR_QT[idx] * sf + 50) / 100)));
      yHeaderQt[ZIGZAG[idx]] = yQ;
      uvHeaderQt[ZIGZAG[idx]] = uvQ;

      const aanDenom = AAN_SCALE_FACTORS[row] * AAN_SCALE_FACTORS[col] * 8.0;
      yFdtScale[idx] = 1.0 / (yQ * aanDenom);
      uvFdtScale[idx] = 1.0 / (uvQ * aanDenom);
    }
  }

  return { yHeaderQt, uvHeaderQt, yFdtScale, uvFdtScale };
}

class ChunkedByteWriter {
  private chunks: Uint8Array[] = [];
  private buf: Uint8Array;
  private pos = 0;
  private bitBuf = 0;
  private bitCount = 0;

  constructor(chunkSize = 1024 * 1024) {
    this.buf = new Uint8Array(chunkSize);
  }

  private ensureSpace(needed = 4) {
    if (this.pos + needed > this.buf.length) {
      this.chunks.push(this.buf.slice(0, this.pos));
      this.pos = 0;
    }
  }

  writeByte(b: number) {
    this.ensureSpace(1);
    this.buf[this.pos++] = b & 0xff;
  }

  writeBytes(arr: ArrayLike<number>) {
    for (let i = 0; i < arr.length; i++) {
      this.writeByte(arr[i]);
    }
  }

  writeUint16(v: number) {
    this.writeByte((v >> 8) & 0xff);
    this.writeByte(v & 0xff);
  }

  writeBits(code: number, len: number) {
    let bb = this.bitBuf;
    let bc = this.bitCount;
    bb = (bb << len) | (code & ((1 << len) - 1));
    bc += len;
    while (bc >= 8) {
      bc -= 8;
      const byteVal = (bb >>> bc) & 0xff;
      this.ensureSpace(2);
      this.buf[this.pos++] = byteVal;
      if (byteVal === 0xff) {
        this.buf[this.pos++] = 0x00;
      }
    }
    this.bitBuf = bb & ((1 << bc) - 1);
    this.bitCount = bc;
  }

  flushBits() {
    if (this.bitCount > 0) {
      const pad = 8 - this.bitCount;
      this.writeBits((1 << pad) - 1, pad);
    }
  }

  finish(): Blob {
    if (this.pos > 0) {
      this.chunks.push(this.buf.slice(0, this.pos));
      this.pos = 0;
    }
    return new Blob(this.chunks as BlobPart[], { type: 'image/jpeg' });
  }
}

function writeJpegHeaders(
  w: ChunkedByteWriter,
  width: number,
  height: number,
  dpi: number,
  yHeaderQt: Uint8Array,
  uvHeaderQt: Uint8Array
) {
  // SOI
  w.writeUint16(0xffd8);

  // APP0 JFIF 1.01 with DPI
  w.writeUint16(0xffe0);
  w.writeUint16(16);
  w.writeBytes([0x4a, 0x46, 0x49, 0x46, 0x00]); // "JFIF\0"
  w.writeByte(1);
  w.writeByte(1);
  w.writeByte(1); // units = dots per inch
  w.writeUint16(dpi);
  w.writeUint16(dpi);
  w.writeByte(0);
  w.writeByte(0);

  // DQT (Luminance 0 + Chrominance 1)
  w.writeUint16(0xffdb);
  w.writeUint16(132);
  w.writeByte(0x00);
  w.writeBytes(yHeaderQt);
  w.writeByte(0x01);
  w.writeBytes(uvHeaderQt);

  // SOF0 (Baseline DCT, YCbCr 4:2:0)
  w.writeUint16(0xffc0);
  w.writeUint16(17);
  w.writeByte(8);
  w.writeUint16(height);
  w.writeUint16(width);
  w.writeByte(3);
  w.writeBytes([1, 0x22, 0]); // Y: 2x2, QT 0
  w.writeBytes([2, 0x11, 1]); // Cb: 1x1, QT 1
  w.writeBytes([3, 0x11, 1]); // Cr: 1x1, QT 1

  // DHT (4 tables: DC Y, AC Y, DC UV, AC UV)
  const writeDht = (tcTh: number, nrcodes: number[], values: number[]) => {
    w.writeUint16(0xffc4);
    w.writeUint16(2 + 1 + 16 + values.length);
    w.writeByte(tcTh);
    for (let i = 1; i <= 16; i++) w.writeByte(nrcodes[i]);
    w.writeBytes(values);
  };
  writeDht(0x00, STD_DC_LUM_NRCODES, STD_DC_LUM_VALUES);
  writeDht(0x10, STD_AC_LUM_NRCODES, STD_AC_LUM_VALUES);
  writeDht(0x01, STD_DC_CHR_NRCODES, STD_DC_CHR_VALUES);
  writeDht(0x11, STD_AC_CHR_NRCODES, STD_AC_CHR_VALUES);

  // SOS (Start of Scan)
  w.writeUint16(0xffda);
  w.writeUint16(12);
  w.writeByte(3);
  w.writeBytes([1, 0x00]); // Y: DC 0, AC 0
  w.writeBytes([2, 0x11]); // Cb: DC 1, AC 1
  w.writeBytes([3, 0x11]); // Cr: DC 1, AC 1
  w.writeBytes([0, 63, 0]);
}

function encodeBlockDU(
  data: Float64Array,
  fdtScale: Float64Array,
  prevDc: number,
  dcHt: HuffLUT,
  acHt: HuffLUT,
  duOut: Int16Array,
  writer: ChunkedByteWriter
): number {
  // Pass 1: process rows (AAN 1D FDCT)
  for (let row = 0; row < 64; row += 8) {
    const tmp0 = data[row + 0] + data[row + 7];
    const tmp7 = data[row + 0] - data[row + 7];
    const tmp1 = data[row + 1] + data[row + 6];
    const tmp6 = data[row + 1] - data[row + 6];
    const tmp2 = data[row + 2] + data[row + 5];
    const tmp5 = data[row + 2] - data[row + 5];
    const tmp3 = data[row + 3] + data[row + 4];
    const tmp4 = data[row + 3] - data[row + 4];

    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;

    data[row + 0] = tmp10 + tmp11;
    data[row + 4] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[row + 2] = tmp13 + z1;
    data[row + 6] = tmp13 - z1;

    const tmp10b = tmp4 + tmp5;
    const tmp11b = tmp5 + tmp6;
    const tmp12b = tmp6 + tmp7;

    const z5 = (tmp10b - tmp12b) * 0.382683433;
    const z2 = 0.541196100 * tmp10b + z5;
    const z4 = 1.306562965 * tmp12b + z5;
    const z3 = tmp11b * 0.707106781;

    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;

    data[row + 5] = z13 + z2;
    data[row + 3] = z13 - z2;
    data[row + 1] = z11 + z4;
    data[row + 7] = z11 - z4;
  }

  // Pass 2: process columns
  for (let col = 0; col < 8; col++) {
    const tmp0 = data[col + 0] + data[col + 56];
    const tmp7 = data[col + 0] - data[col + 56];
    const tmp1 = data[col + 8] + data[col + 48];
    const tmp6 = data[col + 8] - data[col + 48];
    const tmp2 = data[col + 16] + data[col + 40];
    const tmp5 = data[col + 16] - data[col + 40];
    const tmp3 = data[col + 24] + data[col + 32];
    const tmp4 = data[col + 24] - data[col + 32];

    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;

    data[col + 0] = tmp10 + tmp11;
    data[col + 32] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781;
    data[col + 16] = tmp13 + z1;
    data[col + 48] = tmp13 - z1;

    const tmp10b = tmp4 + tmp5;
    const tmp11b = tmp5 + tmp6;
    const tmp12b = tmp6 + tmp7;

    const z5 = (tmp10b - tmp12b) * 0.382683433;
    const z2 = 0.541196100 * tmp10b + z5;
    const z4 = 1.306562965 * tmp12b + z5;
    const z3 = tmp11b * 0.707106781;

    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;

    data[col + 40] = z13 + z2;
    data[col + 24] = z13 - z2;
    data[col + 8] = z11 + z4;
    data[col + 56] = z11 - z4;
  }

  // Quantize & zig-zag reorder
  for (let i = 0; i < 64; i++) {
    const raw = data[i] * fdtScale[i];
    duOut[ZIGZAG[i]] = raw > 0 ? Math.floor(raw + 0.5) : Math.ceil(raw - 0.5);
  }

  // Encode DC difference
  const dc = duOut[0];
  const diff = dc - prevDc;
  if (diff === 0) {
    writer.writeBits(dcHt.codes[0], dcHt.lengths[0]);
  } else {
    const idx = CAT_OFFSET + diff;
    const len = BIT_LENGTHS[idx];
    writer.writeBits(dcHt.codes[len], dcHt.lengths[len]);
    writer.writeBits(BIT_CODES[idx], len);
  }

  // Encode AC coefficients
  let lastNonZero = 63;
  while (lastNonZero > 0 && duOut[lastNonZero] === 0) {
    lastNonZero--;
  }

  if (lastNonZero === 0) {
    // EOB (0x00)
    writer.writeBits(acHt.codes[0], acHt.lengths[0]);
    return dc;
  }

  let zeroRun = 0;
  for (let k = 1; k <= lastNonZero; k++) {
    const val = duOut[k];
    if (val === 0) {
      zeroRun++;
      if (zeroRun === 16) {
        writer.writeBits(acHt.codes[0xf0], acHt.lengths[0xf0]);
        zeroRun = 0;
      }
    } else {
      const idx = CAT_OFFSET + val;
      const len = BIT_LENGTHS[idx];
      const sym = (zeroRun << 4) | len;
      writer.writeBits(acHt.codes[sym], acHt.lengths[sym]);
      writer.writeBits(BIT_CODES[idx], len);
      zeroRun = 0;
    }
  }

  if (lastNonZero < 63) {
    writer.writeBits(acHt.codes[0], acHt.lengths[0]);
  }

  return dc;
}

export async function encodeRgbaBandsToJpegBlob(
  width: number,
  height: number,
  dpi: number,
  quality: number,
  bandHeightMultipleOf16: number,
  readBandRgba: (yStart: number, bandHeight: number) => Promise<Uint8Array>,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  if (width > 65535 || height > 65535) {
    throw new Error(`JPEG dimension ${width} × ${height} exceeds maximum baseline limit (65,535 px).`);
  }

  const { yHeaderQt, uvHeaderQt, yFdtScale, uvFdtScale } = buildQuantTables(quality);
  const writer = new ChunkedByteWriter(2 * 1024 * 1024);
  writeJpegHeaders(writer, width, height, dpi, yHeaderQt, uvHeaderQt);

  const yBlock = new Float64Array(64);
  const cbBlock = new Float64Array(64);
  const crBlock = new Float64Array(64);
  const duOut = new Int16Array(64);

  let dcY = 0;
  let dcCb = 0;
  let dcCr = 0;

  const bandStep = Math.max(16, Math.floor(bandHeightMultipleOf16 / 16) * 16);

  for (let bandY = 0; bandY < height; bandY += bandStep) {
    const curBandH = Math.min(bandStep, height - bandY);
    const rgba = await readBandRgba(bandY, curBandH);

    // Precompute Y, Cb, Cr rows for this band or compute per MCU directly
    for (let localMcuY = 0; localMcuY < curBandH; localMcuY += 16) {
      for (let mcuX = 0; mcuX < width; mcuX += 16) {
        // Compute 4 Y blocks (0: TL, 1: TR, 2: BL, 3: BR) + subsampled Cb/Cr
        cbBlock.fill(0);
        crBlock.fill(0);

        for (let subY = 0; subY < 2; subY++) {
          for (let subX = 0; subX < 2; subX++) {
            const bx0 = mcuX + subX * 8;
            const by0 = localMcuY + subY * 8;
            const uvBaseY = subY * 4;
            const uvBaseX = subX * 4;

            for (let py = 0; py < 8; py++) {
              const sy = Math.min(curBandH - 1, by0 + py);
              const rowOff = sy * width * 4;
              const uvY = uvBaseY + (py >> 1);
              for (let px = 0; px < 8; px++) {
                const sx = Math.min(width - 1, bx0 + px);
                const p = rowOff + sx * 4;
                const r = rgba[p];
                const g = rgba[p + 1];
                const b = rgba[p + 2];

                // ITU-R BT.601 YCbCr
                const yVal = 0.299 * r + 0.587 * g + 0.114 * b - 128.0;
                yBlock[py * 8 + px] = yVal;

                const uvIdx = uvY * 8 + uvBaseX + (px >> 1);
                cbBlock[uvIdx] += (-0.168736 * r - 0.331264 * g + 0.5 * b) * 0.25;
                crBlock[uvIdx] += (0.5 * r - 0.418688 * g - 0.081312 * b) * 0.25;
              }
            }

            dcY = encodeBlockDU(yBlock, yFdtScale, dcY, Y_DC_HT, Y_AC_HT, duOut, writer);
          }
        }

        dcCb = encodeBlockDU(cbBlock, uvFdtScale, dcCb, UV_DC_HT, UV_AC_HT, duOut, writer);
        dcCr = encodeBlockDU(crBlock, uvFdtScale, dcCr, UV_DC_HT, UV_AC_HT, duOut, writer);
      }
    }

    if (onProgress) {
      const done = Math.min(100, Math.round(((bandY + curBandH) / height) * 100));
      onProgress(done);
    }
    // Yield control so browser UI updates cleanly
    await new Promise((r) => setTimeout(r, 0));
  }

  writer.flushBits();
  writer.writeUint16(0xffd9); // EOI
  return writer.finish();
}
