import {
  INTRO_ADMIN_UPLOAD_MAX_EDGE_PX,
  INTRO_ADMIN_UPLOAD_POST_MAX_BYTES,
  inspectIntroUploadFile,
  introUploadExtForMime,
  type IntroAdminUploadError,
} from "@/lib/startup/intro-v2/admin-upload";

export type PreparedIntroUpload = {
  file: File;
  mime: string;
  width: number | null;
  height: number | null;
  originalBytes: number;
};

function fitIntroUploadEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readIntroImage(file: File): Promise<{ width: number; height: number; image: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight, image });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("invalid_type"));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("upload_failed"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function compressIntroUpload(
  image: HTMLImageElement,
  sourceMime: string,
  originalName: string
): Promise<File> {
  let fitted = fitIntroUploadEdge(image.naturalWidth, image.naturalHeight, INTRO_ADMIN_UPLOAD_MAX_EDGE_PX);
  const outType = sourceMime === "image/png" || sourceMime === "image/webp" ? "image/webp" : "image/jpeg";
  let blob: Blob | null = null;
  for (let shrink = 0; shrink < 6; shrink += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("upload_failed");
    ctx.drawImage(image, 0, 0, fitted.width, fitted.height);
    let quality = 0.88;
    blob = await canvasToBlob(canvas, outType, quality);
    while (blob.size > INTRO_ADMIN_UPLOAD_POST_MAX_BYTES && quality > 0.52) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, outType, quality);
    }
    if (blob.size <= INTRO_ADMIN_UPLOAD_POST_MAX_BYTES) break;
    fitted = {
      width: Math.max(1, Math.round(fitted.width * 0.72)),
      height: Math.max(1, Math.round(fitted.height * 0.72)),
    };
  }
  if (!blob || blob.size > INTRO_ADMIN_UPLOAD_POST_MAX_BYTES) {
    throw new Error("file_too_large");
  }
  const ext = introUploadExtForMime(outType);
  const base = originalName.replace(/\.[^.]+$/, "") || "intro-image";
  return new File([blob], `${base}.${ext}`, { type: outType });
}

export async function prepareIntroAdminUploadFile(file: File): Promise<
  { ok: true; value: PreparedIntroUpload } | { ok: false; error: IntroAdminUploadError }
> {
  const inspected = inspectIntroUploadFile(file);
  if (!inspected.ok) return inspected;
  try {
    const decoded = await readIntroImage(file);
    if (inspected.needsCompress || Math.max(decoded.width, decoded.height) > INTRO_ADMIN_UPLOAD_MAX_EDGE_PX) {
      const compressed = await compressIntroUpload(decoded.image, inspected.mime, file.name);
      return {
        ok: true,
        value: {
          file: compressed,
          mime: compressed.type || inspected.mime,
          width: decoded.width,
          height: decoded.height,
          originalBytes: file.size,
        },
      };
    }
    return {
      ok: true,
      value: {
        file,
        mime: inspected.mime,
        width: decoded.width,
        height: decoded.height,
        originalBytes: file.size,
      },
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "file_too_large") return { ok: false, error: "file_too_large" };
    if (!inspected.needsCompress) {
      return {
        ok: true,
        value: {
          file,
          mime: inspected.mime,
          width: null,
          height: null,
          originalBytes: file.size,
        },
      };
    }
    return { ok: false, error: "invalid_type" };
  }
}
