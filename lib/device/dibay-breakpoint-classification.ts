/**
 * FD2 inventory of existing width numbers.
 *
 * Classification only. Existing product breakpoints are not deleted in FD2.
 * DEVICE_IDENTITY / LEGACY_SHADOW are later-FD removal candidates.
 */

export type DibayBreakpointKind =
  | "DEVICE_IDENTITY"
  | "WINDOW_GEOMETRY"
  | "DOMAIN_PANE_FLOOR"
  | "CAPABILITY"
  | "VISUAL_TUNING"
  | "LEGACY_SHADOW";

export type DibayBreakpointRecord = {
  px: number;
  kind: DibayBreakpointKind;
  owner: string;
  laterFdOwner: string;
  meaning: string;
};

export const DIBAY_EXISTING_BREAKPOINT_CLASSIFICATION: readonly DibayBreakpointRecord[] = [
  {
    px: 767,
    kind: "LEGACY_SHADOW",
    owner: "lib/ui/app-viewport-layout-breakpoints.ts APP_MOBILE_LAYOUT_MAX_PX",
    laterFdOwner: "FD4 APP SHELL / FD5–FD7 domain layouts",
    meaning: "Named mobile-max. FD4 removed useAppViewportSize identity. Remaining consumers: MyPage / Messenger / Community geometry.",
  },
  {
    px: 768,
    kind: "DOMAIN_PANE_FLOOR",
    owner: "lib/ui/app-viewport-layout-breakpoints.ts APP_MESSENGER_SPLIT_MIN_PX",
    laterFdOwner: "FD7 MESSENGER",
    meaning: "Messenger master-detail CSS integer for LIST_MIN+ROOM_MIN≈760. Not a tablet Device cutoff.",
  },
  {
    px: 768,
    kind: "LEGACY_SHADOW",
    owner: "app/design-tokens.css --sam-bp-sm-tablet-min + use-app-viewport-size 5-tier",
    laterFdOwner: "FD4 APP SHELL",
    meaning: "Named tablet-min token. FD4 removed use-app-viewport-size 5-tier identity. Token itself is VISUAL_TUNING / Owner.",
  },
  {
    px: 840,
    kind: "DOMAIN_PANE_FLOOR",
    owner: "lib/device/dibay-domain-geometry.ts DIBAY_COMMUNITY_GEOMETRY",
    laterFdOwner: "FD5 COMMUNITY",
    meaning: "Community 2-pane candidate. Not Device.",
  },
  {
    px: 720,
    kind: "DOMAIN_PANE_FLOOR",
    owner: "lib/device/dibay-domain-geometry.ts DIBAY_TRADE_GEOMETRY",
    laterFdOwner: "FD6 TRADE",
    meaning: "Trade 2-pane candidate from phone-proven list+detail. Not Device. No Trade 2-pane UI yet.",
  },
  {
    px: 760,
    kind: "WINDOW_GEOMETRY",
    owner: "lib/device/dibay-window-class.ts compactMaxExclusive + Messenger twoPaneFloorPx",
    laterFdOwner: "FD2 bands remain CANDIDATE_NOT_LOCKED until later FD lock",
    meaning: "COMPACT/MEDIUM candidate boundary and Messenger 2-pane floor.",
  },
  {
    px: 1023,
    kind: "LEGACY_SHADOW",
    owner: "app/design-tokens.css --sam-bp-sm-tablet-max",
    laterFdOwner: "FD4 APP SHELL",
    meaning: "Named tablet-max from width.",
  },
  {
    px: 1024,
    kind: "CAPABILITY",
    owner: "lib/business/owner-compact-shell-viewport.ts OWNER_COMPACT_SHELL_MAX_PX",
    laterFdOwner: "Owner shell (out of FD2–FD10 main 5-tab path)",
    meaning: "Owner compact shell upper bound. Not main BottomNav Device identity.",
  },
  {
    px: 1024,
    kind: "VISUAL_TUNING",
    owner: "lib/posts/trade-feed-layout-classes.ts lg:grid-cols-4",
    laterFdOwner: "FD6 TRADE",
    meaning: "Trade grid density only.",
  },
  {
    px: 1024,
    kind: "LEGACY_SHADOW",
    owner: "lib/ui/use-app-viewport-size.ts pickBreakpoint",
    laterFdOwner: "FD4 APP SHELL",
    meaning: "Historical use-app-viewport-size width>=1024 → tablet identity. Removed in FD4.",
  },
  {
    px: 1025,
    kind: "CAPABILITY",
    owner: "lib/business/owner-compact-shell-viewport.ts OWNER_DESKTOP_SHELL_MIN_PX",
    laterFdOwner: "Owner shell",
    meaning: "Owner desktop shell start. Separate from main 5-tab BottomNav.",
  },
  {
    px: 1200,
    kind: "LEGACY_SHADOW",
    owner: "lib/ui/mypage-responsive-breakpoints.ts MYPAGE_DESKTOP_MIN_PX",
    laterFdOwner: "FD4 APP SHELL / MyPage",
    meaning: "Named desktop band. Actual MyPage classes stay 1-column.",
  },
  {
    px: 1280,
    kind: "LEGACY_SHADOW",
    owner: "lib/ui/use-app-viewport-size.ts pickBreakpoint",
    laterFdOwner: "FD4 APP SHELL",
    meaning: "Historical use-app-viewport-size width+touch → desktop/tablet identity. Removed in FD4.",
  },
  {
    px: 1230,
    kind: "WINDOW_GEOMETRY",
    owner: "lib/device/dibay-window-class.ts medium/expanded candidate",
    laterFdOwner: "FD2 lock numbers after more fixtures",
    meaning: "EXPANDED candidate start. NOT HARD LOCK.",
  },
  {
    px: 1302,
    kind: "WINDOW_GEOMETRY",
    owner: "lib/device/dibay-window-class.ts large candidate",
    laterFdOwner: "FD2 lock numbers after more fixtures",
    meaning: "LARGE candidate start. NOT HARD LOCK.",
  },
  {
    px: 640,
    kind: "VISUAL_TUNING",
    owner: "lib/posts/trade-feed-layout-classes.ts sm:grid-cols-3",
    laterFdOwner: "FD6 TRADE",
    meaning: "Trade 3-col density. Not Device.",
  },
];

export const DIBAY_SHADOW_DEVICE_AUTHORITIES_REMAINING = [
  {
    id: "app-mobile-layout-767",
    path: "hooks/use-is-mobile-viewport.ts + lib/ui/use-match-max-width.ts",
    laterFdOwner: "FD7 MESSENGER / MyPage",
    meaning: "767 remains page/domain geometry outside Community. Community 767 Device shadow removed in FD5.",
  },
  {
    id: "design-tokens-tablet-named-bands",
    path: "app/design-tokens.css --sam-bp-sm-tablet-*",
    laterFdOwner: "Owner shell / VISUAL_TUNING",
    meaning: "CSS token names still say tablet. Not consumed by FD4 shell resolver.",
  },
  {
    id: "mypage-1200-desktop-name",
    path: "lib/ui/mypage-responsive-breakpoints.ts",
    laterFdOwner: "MyPage",
    meaning: "width bands named tablet/desktop while classes are 1-column.",
  },
] as const;
