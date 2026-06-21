"use client";

import { useEffect, useRef } from "react";

type RippleEntry = {
  id: number;
  x: number;
  y: number;
  size: number;
};

export function CallRipple() {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    const host = hostRef.current;
    const parent = host?.parentElement;
    if (!host || !parent) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = parent.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.8;
      const ripple: RippleEntry = {
        id: nextIdRef.current++,
        x: event.clientX - rect.left - size / 2,
        y: event.clientY - rect.top - size / 2,
        size,
      };
      const node = document.createElement("span");
      node.className = "call-ripple__ink";
      node.style.left = `${ripple.x}px`;
      node.style.top = `${ripple.y}px`;
      node.style.width = `${ripple.size}px`;
      node.style.height = `${ripple.size}px`;
      node.dataset.rippleId = String(ripple.id);
      host.appendChild(node);
      window.setTimeout(() => {
        node.remove();
      }, 320);
    };

    parent.addEventListener("pointerdown", onPointerDown);
    return () => parent.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return <span ref={hostRef} className="call-ripple" aria-hidden />;
}
