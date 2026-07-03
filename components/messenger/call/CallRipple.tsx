"use client";

import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";

type RippleInk = { id: number; x: number; y: number; size: number };

export function useCallRipple(disabled?: boolean) {
  const [inks, setInks] = useState<RippleInk[]>([]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return;
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;
      const id = Date.now() + Math.random();
      setInks((prev) => [...prev, { id, x, y, size }]);
      window.setTimeout(() => {
        setInks((prev) => prev.filter((ink) => ink.id !== id));
      }, 320);
    },
    [disabled],
  );

  return { inks, onPointerDown };
}

export function CallRippleInks({ inks }: { inks: RippleInk[] }) {
  if (inks.length === 0) return null;
  return (
    <span className="call-ripple" aria-hidden>
      {inks.map((ink) => (
        <span
          key={ink.id}
          className="call-ripple__ink"
          style={{
            width: ink.size,
            height: ink.size,
            left: ink.x,
            top: ink.y,
          }}
        />
      ))}
    </span>
  );
}
