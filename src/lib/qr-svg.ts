// src/lib/qr-svg.ts
// Zero-dependency ISO/IEC 18004 Byte-mode QR Code matrix & SVG generator (Versions 1-6, ECC-L)

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGenerator(ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeRsEc(data: number[], ecCount: number): number[] {
  const gen = buildRsGenerator(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = msg[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return msg.slice(data.length);
}

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecPerBlock: number;
  blocks: number;
  alignmentCenters: number[];
}

// ISO/IEC 18004 ECC Level L specs for Versions 1..6 (1 or 2 uniform blocks)
const VERSION_SPECS: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, ecPerBlock: 7, blocks: 1, alignmentCenters: [] },
  { version: 2, size: 25, dataCodewords: 34, ecPerBlock: 10, blocks: 1, alignmentCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, ecPerBlock: 15, blocks: 1, alignmentCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, ecPerBlock: 20, blocks: 1, alignmentCenters: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, ecPerBlock: 26, blocks: 1, alignmentCenters: [6, 30] },
  { version: 6, size: 41, dataCodewords: 136, ecPerBlock: 18, blocks: 2, alignmentCenters: [6, 34] },
];

// Format string for ECC-L (01) + Mask 0 (000) -> BCH + XOR 101010000010010 = 0x77C4
const FORMAT_BITS_L_MASK0 = 0x77c4;

export function encodeQrMatrix(text: string): boolean[][] {
  const utf8Bytes = Array.from(new TextEncoder().encode(text));
  const spec =
    VERSION_SPECS.find((v) => v.dataCodewords >= utf8Bytes.length + 2) ||
    VERSION_SPECS[VERSION_SPECS.length - 1];

  const maxPayload = spec.dataCodewords - 2;
  const payload = utf8Bytes.slice(0, maxPayload);

  // Build bitstream: Mode 0100 (Byte), 8-bit length (for V1-V6), payload, terminator
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const byte of payload) {
    pushBits(byte, 8);
  }
  const totalDataBits = spec.dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < totalDataBits; i++) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataWords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let w = 0;
    for (let b = 0; b < 8; b++) {
      w = (w << 1) | bits[i + b];
    }
    dataWords.push(w);
  }
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataWords.length < spec.dataCodewords) {
    dataWords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Split into RS blocks and interleave
  const blockSize = Math.floor(spec.dataCodewords / spec.blocks);
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < spec.blocks; b++) {
    const slice = dataWords.slice(b * blockSize, (b + 1) * blockSize);
    dataBlocks.push(slice);
    ecBlocks.push(computeRsEc(slice, spec.ecPerBlock));
  }

  const codewords: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < spec.blocks; b++) codewords.push(dataBlocks[b][i]);
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) codewords.push(ecBlocks[b][i]);
  }

  const n = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: n }, () =>
    Array<boolean | null>(n).fill(null)
  );
  const reserved: boolean[][] = Array.from({ length: n }, () =>
    Array<boolean>(n).fill(false)
  );

  const setModule = (r: number, c: number, dark: boolean, lock = true) => {
    if (r < 0 || r >= n || c < 0 || c >= n) return;
    matrix[r][c] = dark;
    if (lock) reserved[r][c] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          setModule(rr, cc, false);
        } else {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setModule(rr, cc, isBorder || isCenter);
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Alignment patterns
  for (const rCenter of spec.alignmentCenters) {
    for (const cCenter of spec.alignmentCenters) {
      if (reserved[rCenter][cCenter]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.max(Math.abs(dr), Math.abs(dc)) === 2 ||
            (dr === 0 && dc === 0);
          setModule(rCenter + dr, cCenter + dc, dark);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < n - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Dark module & reserve format info strips
  setModule(4 * spec.version + 9, 8, true);
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMAT_BITS_L_MASK0 >> i) & 1) === 1;
    // Strip 1
    if (i < 6) setModule(8, i, bit);
    else if (i < 8) setModule(8, i + 1, bit);
    else setModule(n - 15 + i, 8, bit);
    // Strip 2
    if (i < 8) setModule(i < 6 ? i : i + 1, 8, ((FORMAT_BITS_L_MASK0 >> (14 - i)) & 1) === 1);
    else setModule(8, n - 15 + i, ((FORMAT_BITS_L_MASK0 >> (14 - i)) & 1) === 1);
  }
  // Ensure explicit format info coordinates match spec accurately
  const formatCoords1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const formatCoords2: [number, number][] = [
    [n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8],
    [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1],
  ];
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMAT_BITS_L_MASK0 >> (14 - i)) & 1) === 1;
    const [r1, c1] = formatCoords1[i];
    const [r2, c2] = formatCoords2[i];
    setModule(r1, c1, bit);
    setModule(r2, c2, bit);
  }

  // Place data + ECC bits in standard zig-zag with Mask 0: (r + c) % 2 === 0
  const allBits: number[] = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((cw >> b) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip vertical timing column
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (reserved[r][c]) continue;
        const rawBit = bitIdx < allBits.length ? allBits[bitIdx] === 1 : false;
        bitIdx++;
        const masked = (r + c) % 2 === 0 ? !rawBit : rawBit;
        matrix[r][c] = masked;
      }
    }
    upward = !upward;
  }

  return matrix.map((row) => row.map((cell) => Boolean(cell)));
}

export function renderQrSvgString(text: string, margin = 2): string {
  const matrix = encodeQrMatrix(text);
  const dim = matrix.length + margin * 2;
  const rects: string[] = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix.length; c++) {
      if (matrix[r][c]) {
        rects.push(`M${c + margin},${r + margin}h1v1h-1z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#FFFFFF"/><path d="${rects.join("")}" fill="#18181B"/></svg>`;
}

export function renderQrSvgDataUrl(text: string, margin = 2): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(renderQrSvgString(text, margin))}`;
}
