/**
 * Minimal ISO BMFF box walk for MP4 width/height (tkhd).
 * Used when ffprobe is not available on the host.
 */

function readBoxSize(bytes: Buffer, off: number): { size: number; header: number } | null {
  if (off + 8 > bytes.length) return null;
  let size = bytes.readUInt32BE(off);
  const header = 8;
  if (size === 1) {
    if (off + 16 > bytes.length) return null;
    const hi = bytes.readUInt32BE(off + 8);
    const lo = bytes.readUInt32BE(off + 12);
    size = hi * 2 ** 32 + lo;
    return { size, header: 16 };
  }
  if (size === 0) {
    size = bytes.length - off;
  }
  if (size < header) return null;
  return { size, header };
}

function forEachChildBox(
  bytes: Buffer,
  containerStart: number,
  containerEnd: number,
  visit: (type: string, contentStart: number, contentEnd: number) => boolean | void,
): void {
  let off = containerStart;
  while (off + 8 <= containerEnd && off + 8 <= bytes.length) {
    const parsed = readBoxSize(bytes, off);
    if (!parsed) break;
    const { size, header } = parsed;
    const type = bytes.toString("ascii", off + 4, off + 8);
    const boxEnd = Math.min(off + size, containerEnd, bytes.length);
    const contentStart = off + header;
    const contentEnd = boxEnd;
    if (contentStart > contentEnd) break;
    const stop = visit(type, contentStart, contentEnd);
    if (stop === true) return;
    if (size < header) break;
    off += size;
  }
}

function parseTkhdDimensions(bytes: Buffer, contentStart: number, contentEnd: number): {
  width: number;
  height: number;
} | null {
  if (contentEnd - contentStart < 84) return null;
  const version = bytes[contentStart];
  let wOff: number;
  let hOff: number;
  if (version === 0) {
    wOff = contentStart + 76;
    hOff = contentStart + 80;
  } else if (version === 1) {
    if (contentEnd - contentStart < 96) return null;
    wOff = contentStart + 88;
    hOff = contentStart + 92;
  } else {
    return null;
  }
  if (hOff + 4 > contentEnd) return null;
  const width = bytes.readUInt32BE(wOff) / 65536;
  const height = bytes.readUInt32BE(hOff) / 65536;
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

function trakIsVideo(bytes: Buffer, trakStart: number, trakEnd: number): boolean {
  let video = false;
  forEachChildBox(bytes, trakStart, trakEnd, (inner, innerStart, innerEnd) => {
    if (inner !== "mdia") return;
    forEachChildBox(bytes, innerStart, innerEnd, (mdiaInner, mdiaStart, mdiaEnd) => {
      if (mdiaInner === "hdlr" && mdiaEnd - mdiaStart >= 12) {
        const handler = bytes.toString("ascii", mdiaStart + 8, mdiaStart + 12);
        if (handler === "vide") video = true;
      }
    });
  });
  return video;
}

function tkhdInTrak(bytes: Buffer, trakStart: number, trakEnd: number): {
  width: number;
  height: number;
} | null {
  let dims: { width: number; height: number } | null = null;
  forEachChildBox(bytes, trakStart, trakEnd, (inner, innerStart, innerEnd) => {
    if (inner === "tkhd") {
      dims = parseTkhdDimensions(bytes, innerStart, innerEnd);
    }
  });
  return dims;
}

function findVideoTrackDimensions(bytes: Buffer): { width: number; height: number } | null {
  let fallback: { width: number; height: number } | null = null;

  forEachChildBox(bytes, 0, bytes.length, (type, contentStart, contentEnd) => {
    if (type !== "moov") return;
    forEachChildBox(bytes, contentStart, contentEnd, (trakType, trakStart, trakEnd) => {
      if (trakType !== "trak") return;
      const dims = tkhdInTrak(bytes, trakStart, trakEnd);
      if (!dims) return;
      if (trakIsVideo(bytes, trakStart, trakEnd)) {
        fallback = dims;
        return true;
      }
      if (!fallback) fallback = dims;
    });
    if (fallback) return true;
  });

  return fallback;
}

/** True when bytes look like ISO BMFF (ftyp at first box). */
export function sniffIsoBmffMp4(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  const parsed = readBoxSize(bytes, 0);
  if (!parsed) return false;
  const type = bytes.toString("ascii", 4, 8);
  if (type !== "ftyp") return false;
  const majorBrand = bytes.toString("ascii", 8, 12);
  const known =
    majorBrand === "isom" ||
    majorBrand === "iso2" ||
    majorBrand === "mp41" ||
    majorBrand === "mp42" ||
    majorBrand === "avc1" ||
    majorBrand === "M4V " ||
    majorBrand === "dash" ||
    majorBrand === "qt  ";
  return known || /^[\x20-\x7e]{4}$/.test(majorBrand);
}

export function parseMp4VideoDimensions(bytes: Buffer): {
  width: number;
  height: number;
} | null {
  if (!sniffIsoBmffMp4(bytes)) return null;
  return findVideoTrackDimensions(bytes);
}

/** Require moov (metadata) present — minimal decodability proof without ffprobe. */
export function mp4HasMoovBox(bytes: Buffer): boolean {
  let hasMoov = false;
  forEachChildBox(bytes, 0, bytes.length, (type) => {
    if (type === "moov") {
      hasMoov = true;
      return true;
    }
  });
  return hasMoov;
}
