const WIDTH = 900;
const HEIGHT = 460;
const SCALE = 3;
const MIN_CODE_SIZE = 4;

const C = {
  bg: 0,
  panel: 1,
  header: 2,
  border: 3,
  text: 4,
  muted: 5,
  green: 6,
  yellow: 7,
  red: 8,
  blue: 9,
  purple: 10,
  dark: 11,
  line: 12,
  black: 13,
  white: 14,
  orange: 15,
} as const;

const PALETTE = [
  [17, 24, 39],
  [15, 23, 42],
  [2, 6, 23],
  [51, 65, 85],
  [226, 232, 240],
  [148, 163, 184],
  [34, 197, 94],
  [234, 179, 8],
  [239, 68, 68],
  [56, 189, 248],
  [168, 85, 247],
  [8, 13, 24],
  [30, 41, 59],
  [0, 0, 0],
  [248, 250, 252],
  [249, 115, 22],
];

const FONT: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["11111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  ">": ["10000", "01000", "00100", "00010", "00100", "01000", "10000"],
  "<": ["00001", "00010", "00100", "01000", "00100", "00010", "00001"],
  "=": ["00000", "11111", "00000", "11111", "00000", "00000", "00000"],
  "'": ["01100", "01100", "01000", "00000", "00000", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
};

type FrameState = {
  running: string;
  root: number;
  docs: number;
  tool?: string;
  alert?: string;
  command?: string;
  queued?: string;
  done?: boolean;
};

const STATES: FrameState[] = [
  { running: "0 RUNNING", root: 0, docs: 0 },
  { running: "2 RUNNING", root: 0.18, docs: 0.32, tool: "BASH RG TODO ." },
  { running: "2 RUNNING", root: 0.24, docs: 0.72, tool: "BASH RG TODO ." },
  {
    running: "2 RUNNING",
    root: 0.31,
    docs: 0.81,
    tool: "BASH RG TODO .",
    alert: "LOOP DETECTED BASH SAME ARGS 5X",
  },
  {
    running: "2 RUNNING",
    root: 0.34,
    docs: 0.82,
    tool: "WAITING",
    alert: "LOOP DETECTED BASH SAME ARGS 5X",
    command: "AGENTCTL INJECT DOCS STOP SCANNING",
  },
  {
    running: "2 RUNNING",
    root: 0.35,
    docs: 0.83,
    tool: "READING OPERATOR SIGNAL",
    queued: "STEERING SIGNAL QUEUED",
  },
  {
    running: "2 RUNNING",
    root: 0.37,
    docs: 0.84,
    tool: "ADJUSTING COURSE",
    queued: "NO RESTART NO CONTEXT LOSS",
  },
  { running: "1 RUNNING", root: 0.39, docs: 0.86, done: true },
];

function frameBuffer(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  pixels.fill(C.bg);
  return pixels;
}

function fillRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(WIDTH, x + w);
  const y1 = Math.min(HEIGHT, y + h);
  for (let yy = y0; yy < y1; yy += 1) {
    pixels.fill(color, yy * WIDTH + x0, yy * WIDTH + x1);
  }
}

function strokeRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  fillRect(pixels, x, y, w, 1, color);
  fillRect(pixels, x, y + h - 1, w, 1, color);
  fillRect(pixels, x, y, 1, h, color);
  fillRect(pixels, x + w - 1, y, 1, h, color);
}

function fillCircle(
  pixels: Uint8Array,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r * r) {
        const px = cx + x;
        const py = cy + y;
        if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
          pixels[py * WIDTH + px] = color;
        }
      }
    }
  }
}

function drawText(
  pixels: Uint8Array,
  x: number,
  y: number,
  text: string,
  color: number,
  scale = SCALE,
): void {
  let cursor = x;
  for (const raw of text.toUpperCase()) {
    const glyph = FONT[raw] ?? FONT["?"];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] === "1") {
          fillRect(pixels, cursor + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += 6 * scale;
  }
}

function drawTokenBar(
  pixels: Uint8Array,
  x: number,
  y: number,
  pct: number,
): void {
  const width = 190;
  const height = 12;
  const color = pct > 0.8 ? C.red : pct > 0.7 ? C.yellow : C.green;
  fillRect(pixels, x, y, width, height, C.dark);
  fillRect(pixels, x, y, Math.round(width * Math.min(pct, 1)), height, color);
  strokeRect(pixels, x, y, width, height, C.border);
}

function drawAgentRow(
  pixels: Uint8Array,
  x: number,
  y: number,
  label: string,
  pct: number,
  status: "running" | "done",
  tool?: string,
): void {
  const statusColor = status === "done" ? C.muted : C.green;
  fillCircle(pixels, x + 8, y + 11, 6, statusColor);
  drawText(pixels, x + 26, y, label, status === "done" ? C.muted : C.text, 3);
  drawTokenBar(pixels, x + 300, y + 5, pct);
  const tokens = `${Math.round(pct * 50000)} / 50000`;
  drawText(pixels, x + 505, y, tokens, C.muted, 2);
  if (tool) drawText(pixels, x + 52, y + 30, `> ${tool}`, C.blue, 2);
}

function drawFrame(state: FrameState): Uint8Array {
  const pixels = frameBuffer();

  fillRect(pixels, 30, 28, 840, 404, C.panel);
  strokeRect(pixels, 30, 28, 840, 404, C.border);
  fillRect(pixels, 31, 29, 838, 46, C.header);
  fillCircle(pixels, 54, 52, 7, C.red);
  fillCircle(pixels, 78, 52, 7, C.yellow);
  fillCircle(pixels, 102, 52, 7, C.green);
  drawText(pixels, 132, 43, "AGENTCTL WATCH", C.text, 3);
  drawText(pixels, 668, 45, state.running, C.muted, 2);

  fillRect(pixels, 55, 100, 790, 210, C.dark);
  strokeRect(pixels, 55, 100, 790, 210, C.border);
  drawText(pixels, 76, 123, "SESSION TREE", C.muted, 2);

  if (state.running === "0 RUNNING") {
    drawText(pixels, 280, 185, "NO ACTIVE AGENTS", C.muted, 3);
    drawText(pixels, 212, 226, "START A CLAUDE CODE SESSION", C.blue, 2);
  } else {
    drawAgentRow(pixels, 84, 158, "ROOT SESSION", state.root, "running");
    drawAgentRow(
      pixels,
      120,
      225,
      "DOCS AGENT",
      state.docs,
      state.done ? "done" : "running",
      state.done ? "DONE" : state.tool,
    );
  }

  fillRect(pixels, 55, 332, 790, 76, C.dark);
  strokeRect(pixels, 55, 332, 790, 76, C.border);
  if (state.alert) {
    drawText(pixels, 76, 353, state.alert, C.yellow, 2);
    drawText(pixels, 76, 382, "TRY A DIFFERENT APPROACH", C.muted, 2);
  } else if (state.command) {
    drawText(pixels, 76, 353, state.command, C.green, 2);
    drawText(pixels, 76, 382, "DELIVERED AT NEXT TOOL CALL", C.muted, 2);
  } else if (state.queued) {
    drawText(pixels, 76, 353, state.queued, C.purple, 2);
    drawText(pixels, 76, 382, "OTHER AGENTS KEEP RUNNING", C.muted, 2);
  } else {
    drawText(pixels, 76, 353, "Q TO QUIT", C.muted, 2);
    drawText(pixels, 76, 382, "AGENTCTL INJECT ID MESSAGE", C.muted, 2);
  }

  return pixels;
}

function le16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

class BitWriter {
  bytes: number[] = [];
  value = 0;
  bits = 0;

  write(code: number, size: number): void {
    this.value |= code << this.bits;
    this.bits += size;
    while (this.bits >= 8) {
      this.bytes.push(this.value & 0xff);
      this.value >>= 8;
      this.bits -= 8;
    }
  }

  finish(): number[] {
    if (this.bits > 0) this.bytes.push(this.value & 0xff);
    return this.bytes;
  }
}

function lzwEncode(indices: Uint8Array): number[] {
  const clearCode = 1 << MIN_CODE_SIZE;
  const endCode = clearCode + 1;
  let codeSize = MIN_CODE_SIZE + 1;
  const writer = new BitWriter();
  let codesSinceClear = 0;

  // Literal LZW stream: keep clearing before GIF decoders need to widen the
  // code size. The generated demo is still small enough and avoids a runtime
  // dependency solely for asset generation.
  writer.write(clearCode, codeSize);
  for (const index of indices) {
    if (codesSinceClear >= 12) {
      writer.write(clearCode, codeSize);
      codeSize = MIN_CODE_SIZE + 1;
      codesSinceClear = 0;
    }
    writer.write(index, codeSize);
    codesSinceClear += 1;
  }

  writer.write(endCode, codeSize);
  return writer.finish();
}

function pushSubBlocks(output: number[], bytes: number[]): void {
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255);
    output.push(block.length, ...block);
  }
  output.push(0);
}

function gif(frames: Uint8Array[]): Uint8Array {
  const output: number[] = [];
  output.push(...Array.from(Buffer.from("GIF89a")));
  output.push(...le16(WIDTH), ...le16(HEIGHT));
  output.push(0b10000011, C.bg, 0);
  for (const [r, g, b] of PALETTE) output.push(r, g, b);
  output.push(0x21, 0xff, 0x0b, ...Array.from(Buffer.from("NETSCAPE2.0")));
  output.push(0x03, 0x01, 0x00, 0x00, 0x00);

  for (const frame of frames) {
    output.push(0x21, 0xf9, 0x04, 0x00, ...le16(80), 0x00, 0x00);
    output.push(0x2c, 0x00, 0x00, 0x00, 0x00, ...le16(WIDTH), ...le16(HEIGHT), 0x00);
    output.push(MIN_CODE_SIZE);
    pushSubBlocks(output, lzwEncode(frame));
  }

  output.push(0x3b);
  return Uint8Array.from(output);
}

const frames = STATES.map(drawFrame);
await Bun.write("docs/demo.gif", gif(frames));
console.log(`wrote docs/demo.gif (${frames.length} frames)`);
