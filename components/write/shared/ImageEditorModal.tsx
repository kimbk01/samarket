"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Crop, Pencil, RotateCw, Sparkles, X } from "lucide-react";
import {
  blobToFile,
  canvasToBlob,
  createWorkingCanvasFromImage,
  cropCanvasNormalized,
  floodFillTransparent,
  loadImage,
  rotateCanvas90CW,
} from "./image-editor-canvas";

type EditTool = "none" | "crop" | "draw" | "bg";

interface ImageEditorModalProps {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  /** 편집 결과를 새 파일로 반환 */
  onComplete: (file: File) => void;
}

export function ImageEditorModal({
  open,
  imageUrl,
  onClose,
  onComplete,
}: ImageEditorModalProps) {
  const { t } = useI18n();
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<HTMLCanvasElement | null>(null);
  const [workVersion, setWorkVersion] = useState(0);
  const [tool, setTool] = useState<EditTool>("none");
  const [bgTolerance, setBgTolerance] = useState(48);
  const [usedAlpha, setUsedAlpha] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cropDrag, setCropDrag] = useState<{
    ax: number;
    ay: number;
    bx: number;
    by: number;
  } | null>(null);
  /** 포인터 업 시 state보다 최신 좌표 보장 */
  const cropLiveRef = useRef<{
    ax: number;
    ay: number;
    bx: number;
    by: number;
  } | null>(null);

  const drawStrokeRef = useRef<{ drawing: boolean; lastX: number; lastY: number }>({
    drawing: false,
    lastX: 0,
    lastY: 0,
  });

  const redrawView = useCallback(() => {
    const work = workRef.current;
    const view = viewRef.current;
    if (!work || !view) return;
    const maxW = typeof window !== "undefined" ? Math.min(window.innerWidth - 24, work.width) : work.width;
    const maxH =
      typeof window !== "undefined" ? Math.min(window.innerHeight * 0.62, work.height) : work.height;
    const scale = Math.min(maxW / work.width, maxH / work.height, 1);
    const vw = Math.max(1, Math.floor(work.width * scale));
    const vh = Math.max(1, Math.floor(work.height * scale));
    view.width = vw;
    view.height = vh;
    const ctx = view.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(work, 0, 0, vw, vh);

    if (cropDrag && tool === "crop") {
      const x0 = Math.min(cropDrag.ax, cropDrag.bx);
      const y0 = Math.min(cropDrag.ay, cropDrag.by);
      const x1 = Math.max(cropDrag.ax, cropDrag.bx);
      const y1 = Math.max(cropDrag.ay, cropDrag.by);
      const sx = (x0 / work.width) * vw;
      const sy = (y0 / work.height) * vh;
      const sw = ((x1 - x0) / work.width) * vw;
      const sh = ((y1 - y0) / work.height) * vh;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, vw, sy);
      ctx.fillRect(0, sy + sh, vw, vh - sy - sh);
      ctx.fillRect(0, sy, sx, sh);
      ctx.fillRect(sx + sw, sy, vw - sx - sw, sh);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.restore();
    }
  }, [cropDrag, tool]);

  useEffect(() => {
    if (!open) {
      setTool("none");
      setCropDrag(null);
      cropLiveRef.current = null;
      setLoading(true);
      setError(null);
      setUsedAlpha(false);
      workRef.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const img = await loadImage(imageUrl);
        if (cancelled) return;
        const canvas = createWorkingCanvasFromImage(img);
        workRef.current = canvas;
        setWorkVersion((v) => v + 1);
      } catch (e) {
        if (!cancelled) setError(t("trade_write_image_editor_load_err"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, imageUrl]);

  useEffect(() => {
    if (!open) return;
    redrawView();
  }, [open, workVersion, redrawView]);

  useEffect(() => {
    if (!open) return;
    const ro = () => redrawView();
    window.addEventListener("resize", ro);
    return () => window.removeEventListener("resize", ro);
  }, [open, redrawView]);

  const viewToWork = useCallback((vx: number, vy: number): [number, number] => {
    const work = workRef.current;
    const view = viewRef.current;
    if (!work || !view) return [0, 0];
    const wx = (vx / view.width) * work.width;
    const wy = (vy / view.height) * work.height;
    return [Math.max(0, Math.min(work.width - 1, wx)), Math.max(0, Math.min(work.height - 1, wy))];
  }, []);

  const handleRotate = () => {
    const work = workRef.current;
    if (!work) return;
    workRef.current = rotateCanvas90CW(work);
    setCropDrag(null);
    setWorkVersion((v) => v + 1);
  };

  const applyCrop = useCallback((d: { ax: number; ay: number; bx: number; by: number } | null) => {
    const work = workRef.current;
    if (!work || !d) return;
    const x0 = Math.min(d.ax, d.bx);
    const y0 = Math.min(d.ay, d.by);
    const x1 = Math.max(d.ax, d.bx);
    const y1 = Math.max(d.ay, d.by);
    if (x1 - x0 < 8 || y1 - y0 < 8) {
      setCropDrag(null);
      return;
    }
    const nx = x0 / work.width;
    const ny = y0 / work.height;
    const nw = (x1 - x0) / work.width;
    const nh = (y1 - y0) / work.height;
    workRef.current = cropCanvasNormalized(work, nx, ny, nw, nh);
    setCropDrag(null);
    setTool("none");
    setWorkVersion((v) => v + 1);
  }, []);

  const handlePointerDownCrop = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "crop") return;
    e.preventDefault();
    const view = viewRef.current;
    if (!view) return;
    const r = view.getBoundingClientRect();
    const vx = e.clientX - r.left;
    const vy = e.clientY - r.top;
    const [wx, wy] = viewToWork(vx, vy);
    const init = { ax: wx, ay: wy, bx: wx, by: wy };
    cropLiveRef.current = init;
    setCropDrag(init);
    view.setPointerCapture(e.pointerId);
  };

  const handlePointerMoveCrop = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "crop" || !cropLiveRef.current) return;
    const view = viewRef.current;
    if (!view) return;
    const r = view.getBoundingClientRect();
    const vx = e.clientX - r.left;
    const vy = e.clientY - r.top;
    const [wx, wy] = viewToWork(vx, vy);
    const next = { ...cropLiveRef.current, bx: wx, by: wy };
    cropLiveRef.current = next;
    setCropDrag(next);
  };

  const handlePointerUpCrop = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "crop") return;
    const view = viewRef.current;
    try {
      view?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    applyCrop(cropLiveRef.current);
  };

  const handlePointerDownDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "draw") return;
    e.preventDefault();
    const work = workRef.current;
    const view = viewRef.current;
    if (!work || !view) return;
    const r = view.getBoundingClientRect();
    const vx = e.clientX - r.left;
    const vy = e.clientY - r.top;
    const [wx, wy] = viewToWork(vx, vy);
    drawStrokeRef.current = { drawing: true, lastX: wx, lastY: wy };
    const ctx = work.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "rgba(239,68,68,0.95)";
    ctx.lineWidth = Math.max(3, Math.min(work.width, work.height) * 0.004);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    view.setPointerCapture(e.pointerId);
  };

  const handlePointerMoveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "draw" || !drawStrokeRef.current.drawing) return;
    const work = workRef.current;
    const view = viewRef.current;
    if (!work || !view) return;
    const r = view.getBoundingClientRect();
    const vx = e.clientX - r.left;
    const vy = e.clientY - r.top;
    const [wx, wy] = viewToWork(vx, vy);
    const ctx = work.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(wx, wy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    drawStrokeRef.current.lastX = wx;
    drawStrokeRef.current.lastY = wy;
    setWorkVersion((v) => v + 1);
  };

  const handlePointerUpDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "draw") return;
    drawStrokeRef.current.drawing = false;
    const view = viewRef.current;
    try {
      view?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleClickBg = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "bg") return;
    e.preventDefault();
    const work = workRef.current;
    const view = viewRef.current;
    if (!work || !view) return;
    const r = view.getBoundingClientRect();
    const vx = e.clientX - r.left;
    const vy = e.clientY - r.top;
    const [wx, wy] = viewToWork(vx, vy);
    floodFillTransparent(work, wx, wy, bgTolerance);
    setUsedAlpha(true);
    setWorkVersion((v) => v + 1);
  };

  const handleDone = async () => {
    const work = workRef.current;
    if (!work) return;
    try {
      const type = usedAlpha ? "image/png" : "image/jpeg";
      const quality = type === "image/jpeg" ? 0.92 : undefined;
      const blob = await canvasToBlob(work, type, quality);
      onComplete(blobToFile(blob, usedAlpha ? "edited.png" : "edited.jpg"));
      onClose();
    } catch {
      setError(t("trade_write_image_editor_save_err"));
    }
  };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "crop") handlePointerDownCrop(e);
    else if (tool === "draw") handlePointerDownDraw(e);
    else if (tool === "bg") handleClickBg(e);
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "crop") handlePointerMoveCrop(e);
    else if (tool === "draw") handlePointerMoveDraw(e);
  };

  const onCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "crop") handlePointerUpCrop(e);
    else if (tool === "draw") handlePointerUpDraw(e);
  };

  if (!open) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  const toolBtn = (t: EditTool, icon: ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setCropDrag(null);
        setTool((prev) => (prev === t ? "none" : t));
      }}
      className={`flex min-w-[64px] flex-col items-center gap-1 rounded-ui-rect px-2 py-2 sam-text-xxs ${
        tool === t ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10"
      }`}
    >
      <span className="[&_svg]:h-6 [&_svg]:w-6">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
    >
      <header className="flex shrink-0 items-center justify-between px-3 py-3 text-white">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label={t("common_close")}
        >
          <X className="h-6 w-6" />
        </button>
        <span id="image-editor-title" className="sr-only">
          {t("trade_write_image_editor_title")}
        </span>
        <button
          type="button"
          onClick={handleDone}
          disabled={loading || !!error}
          className="sam-text-body font-semibold text-white hover:underline disabled:opacity-40"
        >
          {t("trade_write_image_editor_done")}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-2">
        {loading ? (
          <p className="text-white/70">{t("common_loading")}</p>
        ) : error ? (
          <p className="text-red-300">{error}</p>
        ) : (
          <canvas
            ref={viewRef}
            className={`max-h-[62vh] max-w-full touch-none ${
              tool === "bg" ? "cursor-crosshair" : tool === "draw" ? "cursor-crosshair" : tool === "crop" ? "cursor-crosshair" : ""
            }`}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
          />
        )}
      </div>

      {tool === "bg" ? (
        <div className="shrink-0 border-t border-white/10 px-4 py-2 text-white/90">
          <label className="flex items-center gap-3 sam-text-body-secondary">
            {t("trade_write_image_editor_bg_tolerance")}
            <input
              type="range"
              min={12}
              max={96}
              value={bgTolerance}
              onChange={(e) => setBgTolerance(Number(e.target.value))}
              className="min-w-0 flex-1 accent-white"
            />
            <span className="w-8 tabular-nums">{bgTolerance}</span>
          </label>
          <p className="mt-1 sam-text-xxs text-white/50">
            {t("trade_write_image_editor_bg_hint")}
          </p>
        </div>
      ) : null}

      <footer className="shrink-0 border-t border-white/10 bg-neutral-950 pb-[max(0.75rem,var(--safe-bottom))]">
        <div className="flex justify-around gap-1 px-2 pt-2">
          {toolBtn("crop", <Crop className="stroke-[1.5]" />, t("trade_write_image_editor_crop"))}
          <button
            type="button"
            onClick={handleRotate}
            className="flex min-w-[64px] flex-col items-center gap-1 rounded-ui-rect px-2 py-2 sam-text-xxs text-white/80 hover:bg-white/10"
          >
            <RotateCw className="h-6 w-6 stroke-[1.5]" />
            <span>{t("ui_write_image_rotate")}</span>
          </button>
          {toolBtn("draw", <Pencil className="stroke-[1.5]" />, t("trade_write_image_editor_draw"))}
          {toolBtn("bg", <Sparkles className="stroke-[1.5]" />, t("trade_write_image_editor_bg_remove"))}
        </div>
      </footer>
    </div>,
    portalTarget
  );
}
