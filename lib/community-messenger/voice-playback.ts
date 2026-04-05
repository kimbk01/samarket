import { Buffer } from "node:buffer";

export function resolveVoicePlaybackContentType(storedMime: string, storagePath: string): string {
  const raw = storedMime.split(";")[0]!.trim().toLowerCase();
  if (raw.startsWith("audio/") && raw !== "audio/octet-stream") return raw;
  const ext = (storagePath.split(".").pop() ?? "").toLowerCase();
  if (ext === "webm") return "audio/webm";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "m4a" || ext === "aac" || ext === "mp4") return "audio/mp4";
  return "audio/webm";
}

type RangeOk =
  | { ok: true; status: 200; body: Buffer; contentLength: number; contentRange: null }
  | { ok: true; status: 206; body: Buffer; contentLength: number; contentRange: string };

type RangeResult = RangeOk | { ok: false; status: 416; contentRangeStar: string };

/** HTML5 audio 가 보내는 `Range: bytes=…` 에 맞춰 본문을 자릅니다. */
export function sliceAudioBufferForRangeRequest(body: Buffer, rangeHeader: string | null): RangeResult {
  const size = body.length;
  if (!rangeHeader || !rangeHeader.trim().toLowerCase().startsWith("bytes=")) {
    return { ok: true, status: 200, body, contentLength: size, contentRange: null };
  }
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) {
    return { ok: true, status: 200, body, contentLength: size, contentRange: null };
  }
  let start = m[1] === "" ? 0 : Number(m[1]);
  let end = m[2] === "" ? size - 1 : Number(m[2]);
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = size - 1;
  if (start < 0 || start >= size || start > end) {
    return { ok: false, status: 416, contentRangeStar: `bytes */${size}` };
  }
  if (end >= size) end = size - 1;
  const chunk = body.subarray(start, end + 1);
  return {
    ok: true,
    status: 206,
    body: chunk,
    contentLength: chunk.length,
    contentRange: `bytes ${start}-${end}/${size}`,
  };
}
