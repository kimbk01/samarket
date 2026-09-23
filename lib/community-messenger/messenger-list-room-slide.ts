/**
 * DIBAY Messenger PAGE NAVIGATION / RETURN MOTION — TOKEN SSOT
 *
 * CONTRACT (Owner):
 * - PAGE_HIERARCHY forward (mobile): RIGHT → LEFT
 * - PAGE_HIERARCHY back (mobile): LEFT → RIGHT (exact inverse)
 * - ONE ACTION → ONE NAVIGATION → ONE PAGE MOTION OWNER → ONE VISIBLE TRANSITION
 * - AppRouteTransition must not compete on messenger-internal hierarchy
 *   (`shouldSuppressMessengerPageMotionMainShellSlide`)
 * - OVERLAY / IN_SURFACE_DETAIL / NATIVE_SURFACE are NOT owned here
 * - WIDE/SPLIT: pane-local enter; do not copy full-page mobile axis blindly
 *
 * Consumers: pillar layouts, MessengerRoomSwipeBackShell, messenger-view-transitions.css
 * DO NOT add Framer / new navigation state machines / animation-before-router delays.
 */

/** List ↔ Room — mobile horizontal (was vertical; Owner SSOT RIGHT→LEFT / LEFT→RIGHT) */
export const MESSENGER_LIST_ROOM_ENTER_MS = 360;
export const MESSENGER_LIST_ROOM_EXIT_MS = 280;

export const MESSENGER_LIST_ROOM_ENTER_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";
export const MESSENGER_LIST_ROOM_EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";

/** Trade/Order hub list enter/exit — CSS `sam-messenger-pillar-list-*` (90% RTL / LTR) */
export const MESSENGER_PILLAR_LIST_ENTER_MS = 369;
export const MESSENGER_PILLAR_LIST_EXIT_MS = 300;
