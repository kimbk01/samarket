"use client";

/**
 * DIBAY Intro — the ONLY motion vocabulary (expansion P2). Admin picks presets; nobody writes CSS/JS
 * animation. Rendered once by LaunchIntroPlayer (Admin preview and device share it).
 * prefers-reduced-motion: no enter / float motion; scene changes become a short fade.
 */
export const LAUNCH_INTRO_TRANSITION_MS = 420;

const CSS = `
@keyframes lim-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes lim-slide-up { from { opacity: 0; transform: translateY(6cqh) } to { opacity: 1; transform: none } }
@keyframes lim-scale { from { opacity: 0; transform: scale(0.88) } to { opacity: 1; transform: none } }
@keyframes lim-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-1.6cqh) } }
@keyframes lim-tr-slide { from { transform: translateX(100%) } to { transform: none } }
.lim-enter-fade { animation: lim-fade 520ms ease-out both }
.lim-enter-slide-up { animation: lim-slide-up 560ms cubic-bezier(.2,.8,.2,1) both }
.lim-enter-scale { animation: lim-scale 520ms cubic-bezier(.2,.8,.2,1) both }
.lim-float { animation: lim-float 3.2s ease-in-out infinite }
.lim-tr-fade { animation: lim-fade ${LAUNCH_INTRO_TRANSITION_MS}ms ease-out both }
.lim-tr-slide { animation: lim-tr-slide ${LAUNCH_INTRO_TRANSITION_MS}ms cubic-bezier(.2,.8,.2,1) both }
@media (prefers-reduced-motion: reduce) {
  .lim-enter-fade, .lim-enter-slide-up, .lim-enter-scale, .lim-float { animation: none !important }
  .lim-tr-slide { animation: lim-fade 200ms ease-out both }
}
`;

export function LaunchIntroMotionStyles() {
  return <style>{CSS}</style>;
}
