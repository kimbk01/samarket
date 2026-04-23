"use client";

import { useMemo } from "react";
import { parseInterleavedMarkdownToSegments } from "@/lib/philife/interleaved-body-markdown";
import { PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/** 이미지 앞뒤에 붙은 `join("\n\n")`·HTML 문단 끈 공백이 이중으로 벌어지지 않게 정리 */
function trimInterleavedTextForDisplay(
  segs: { kind: "text" | "img"; value: string }[],
  i: number,
  raw: string
): string {
  let v = raw;
  if (i > 0 && segs[i - 1]!.kind === "img") {
    v = v.replace(/^\n+/, "");
  }
  if (i < segs.length - 1 && segs[i + 1]!.kind === "img") {
    v = v.replace(/\n+$/, "");
  }
  return v;
}

function safeImgSrcForRender(raw: string): string | null {
  const t = (raw ?? "").trim();
  if (t.startsWith("data:image/") && t.length < 2_200_000) {
    return t;
  }
  if (t.startsWith("//") || t.startsWith("https://") || t.startsWith("http://")) {
    if (t.startsWith("//")) return "https:" + t;
    return t;
  }
  return null;
}

export function NeighborhoodInterleavedContent({ content }: { content: string }) {
  const segs = useMemo(() => {
    if (!content) return [];
    return parseInterleavedMarkdownToSegments(content);
  }, [content]);

  return (
    <div className="mt-4 min-w-0">
      {segs
        .map((s, i) => {
          if (s.kind === "text" && s.value) {
            const t = trimInterleavedTextForDisplay(segs, i, s.value);
            if (!t) return null;
            return (
              <div key={i} className={PHILIFE_DETAIL_INTERLEAVED_TEXT_CLASS}>
                {t}
              </div>
            );
          }
          if (s.kind === "img" && s.value) {
            const u = safeImgSrcForRender(s.value);
            if (!u) return null;
            return (
              <a
                key={i}
                href={u}
                target="_blank"
                rel="noreferrer"
                className="my-0.5 block overflow-hidden rounded-ui-rect bg-sam-surface-muted"
              >
                <img
                  src={u}
                  alt=""
                  className="h-auto w-full max-h-[min(40vh,320px)] object-contain bg-black/[0.02]"
                  loading="lazy"
                  decoding="async"
                />
              </a>
            );
          }
          return null;
        })
        .filter(Boolean)}
    </div>
  );
}
