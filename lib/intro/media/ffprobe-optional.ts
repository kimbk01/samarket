import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FfprobeStreamInfo = {
  width: number;
  height: number;
};

function ffprobeAvailable(): boolean {
  const r = spawnSync("ffprobe", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

let cachedAvailable: boolean | null = null;

export function isFfprobeOnPath(): boolean {
  if (cachedAvailable === null) {
    cachedAvailable = ffprobeAvailable();
  }
  return cachedAvailable;
}

/**
 * Probe video stream dimensions via ffprobe when installed on PATH.
 */
export function ffprobeVideoDimensions(bytes: Buffer): FfprobeStreamInfo | null {
  if (!isFfprobeOnPath()) return null;
  const dir = mkdtempSync(join(tmpdir(), "intro-mp4-"));
  const inputPath = join(dir, "in.mp4");
  try {
    writeFileSync(inputPath, bytes);
    const r = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        inputPath,
      ],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    );
    if (r.status !== 0 || !r.stdout) return null;
    const parsed = JSON.parse(r.stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
    };
    const stream = parsed.streams?.[0];
    const width = stream?.width ?? 0;
    const height = stream?.height ?? 0;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(inputPath);
    } catch {
      /* ignore */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Extract first video frame as JPEG when ffmpeg is on PATH (optional thumbnail).
 */
export function ffmpegFirstFrameJpeg(bytes: Buffer): Buffer | null {
  const rVersion = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (rVersion.status !== 0) return null;

  const dir = mkdtempSync(join(tmpdir(), "intro-mp4-thumb-"));
  const inputPath = join(dir, "in.mp4");
  const outputPath = join(dir, "frame.jpg");
  try {
    writeFileSync(inputPath, bytes);
    const r = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        inputPath,
        "-vframes",
        "1",
        "-q:v",
        "2",
        "-f",
        "image2",
        outputPath,
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );
    if (r.status !== 0) return null;
    const out = readFileSync(outputPath);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(inputPath);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(outputPath);
    } catch {
      /* ignore */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
