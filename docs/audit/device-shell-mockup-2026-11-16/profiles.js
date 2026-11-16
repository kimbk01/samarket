/**
 * DIBAY 기기 프로필 단일 정의 (SSOT 시안) — 2026-11-16 PHT
 *
 * 구현 때 이 표가 그대로 `lib/device/dibay-device-profile.ts` 가 된다.
 * 네이티브(Android·iOS)는 같은 값을 읽어 회전·창 최소 크기·웹뷰 배율을 정하고, 계약 시험이 값 일치를 검사한다.
 * 시안 화면(device.html)은 이 파일 값만 읽어 그린다 — 화면별로 따로 정한 값 없음.
 */
(function (root) {
  /** 형태 3가지. 기기 종류로만 정한다(창 폭으로 바꾸지 않음 — FD4 유지 조항). */
  var FAMILY = { PHONE: "PHONE", TABLET: "TABLET", DESKTOP: "DESKTOP" };

  /** 메뉴 위치 — 형태별 1개. 태블릿은 두 칸일 때만 목록 칸 아래로. */
  var NAV = {
    BOTTOM_FULL: "BOTTOM_FULL",           // 하단 탭, 창 전체 폭 (지금 휴대폰·태블릿)
    BOTTOM_UNDER_LIST: "BOTTOM_UNDER_LIST", // 하단 탭, 목록 칸 아래만 (지금 메신저 분할 클래스)
    SIDE_RAIL: "SIDE_RAIL",               // 왼쪽 세로 메뉴 72 (지금 Windows)
  };

  /** 화면 배치 공통 값 — 지금 계약 그대로 (새 값 없음) */
  var LAYOUT = {
    splitMinCss: 768,                              // APP_MESSENGER_SPLIT_MIN_PX
    listPaneWidthCss: "clamp(360px, 35vw, 470px)", // 메신저 목록 칸 계약
    sideRailWidthCss: 72,                          // MAIN_DESKTOP_SIDE_NAV_WIDTH_PX
    bottomNavHeightCss: 60,
    detailReadingMaxCss: 768,                      // 글 상세 max-w-3xl (지금 그대로)
  };

  /** 기기 종류 → 프로필 */
  var DEVICE_PROFILES = {
    PHONE_ANDROID: { family: "PHONE", label: "Android 폰 (APK)", identity: "Android 최소 폭 < 600dp", navNarrow: "BOTTOM_FULL", navWide: "BOTTOM_FULL", split: false, rotation: "PORTRAIT_ONLY", webZoom: 1, minWindowPt: null, launchIntro: "phone", adminLandscapeLock: false },
    PHONE_IOS:     { family: "PHONE", label: "iPhone", identity: "iOS idiom = phone", navNarrow: "BOTTOM_FULL", navWide: "BOTTOM_FULL", split: false, rotation: "PORTRAIT_ONLY", webZoom: 1, minWindowPt: null, launchIntro: "phone", adminLandscapeLock: false },
    TABLET_ANDROID:{ family: "TABLET", label: "Android 태블릿", identity: "Android 최소 폭 ≥ 600dp (공장 밀도 기준)", navNarrow: "BOTTOM_FULL", navWide: "BOTTOM_UNDER_LIST", split: true, rotation: "PORTRAIT_AND_LANDSCAPE", webZoom: 1, minWindowPt: null, launchIntro: "tablet", adminLandscapeLock: true },
    TABLET_IPAD:   { family: "TABLET", label: "iPad", identity: "iOS idiom = pad, Mac 아님", navNarrow: "BOTTOM_FULL", navWide: "BOTTOM_UNDER_LIST", split: true, rotation: "PORTRAIT_AND_LANDSCAPE", webZoom: 1, minWindowPt: null, launchIntro: "tablet", adminLandscapeLock: true },
    DESKTOP_WINDOWS:{ family: "DESKTOP", label: "Windows 앱", identity: "Windows (WebView2 셸·브라우저)", navNarrow: "SIDE_RAIL", navWide: "SIDE_RAIL", split: true, rotation: "WINDOW", webZoom: 1, minWindowPt: null, launchIntro: "desktop", adminLandscapeLock: false },
    DESKTOP_MAC:   { family: "DESKTOP", label: "Mac 앱", identity: "ProcessInfo.isiOSAppOnMac = true", navNarrow: "SIDE_RAIL", navWide: "SIDE_RAIL", split: true, rotation: "WINDOW", webZoom: 1 / 0.77, minWindowPt: [380, 550], launchIntro: "desktop", adminLandscapeLock: false },
    WEB_DESKTOP:   { family: "DESKTOP", label: "PC 브라우저", identity: "macOS·Linux·ChromeOS 브라우저", navNarrow: "SIDE_RAIL", navWide: "SIDE_RAIL", split: true, rotation: "WINDOW", webZoom: 1, minWindowPt: null, launchIntro: "desktop", adminLandscapeLock: false },
  };

  /** 탭별 넓은 창 배치. SINGLE = 한 화면(창 폭 격자는 지금 #354 그대로), LIST_DETAIL = 목록 칸 | 상세 칸 */
  var TAB_LAYOUT = {
    home:    { label: "HOME",    wide: "SINGLE" },
    lounge:  { label: "LOUNGE",  wide: "LIST_DETAIL" },
    dipick:  { label: "DIPICK",  wide: "SINGLE" },
    telring: { label: "telRING", wide: "LIST_DETAIL" },
    my:      { label: "MY",      wide: "LIST_DETAIL" },
  };

  /** 회전·창 크기 변경 규칙 (태블릿 가로·세로 포함) */
  var ROTATION_RULES = [
    "R1 회전·창 크기 변경은 창 폭만 바꾼다. 기기 종류·형태·메뉴 종류는 바뀌지 않는다.",
    "R2 한 화면/두 칸은 매번 같은 함수(창 CSS 폭 ≥ 768 이고 프로필 split=true)로 다시 계산한다.",
    "R3 열어 둔 글·방은 유지된다: 한 화면(상세 전체 화면) → 두 칸이면 목록 + 같은 상세(선택 표시), 두 칸 → 한 화면이면 상세 전체 화면(뒤로 = 목록).",
    "R4 상세는 다시 그리지 않는다(같은 슬롯·같은 key, 입력 초안·스크롤 유지 — 지금 메신저 SPL-01 방식).",
    "R5 하단 탭은 같은 요소 하나다. 두 칸이면 목록 칸 아래, 한 화면이면 창 전체 — 클래스만 바뀐다(지금 메신저 방식).",
    "R6 아무것도 열지 않은 두 칸의 상세 칸은 배경만(문구·버튼 없음 — 지금 메신저 빈 상세 규칙 2026-07-30b).",
    "R7 휴대폰은 세로 고정, 태블릿은 세로·가로 자유, 관리자 화면 가로 고정은 태블릿만(Mac 제외), Mac·Windows 는 창 크기 자유.",
  ];

  /** 시안 기기 목록 — CSS 폭·높이 (Mac 은 pt; 배율 적용 후 CSS = pt ÷ (0.77 × webZoom)) */
  var PRESETS = [
    { id: "samsung", device: "PHONE_ANDROID", name: "Samsung M15 (SM-M156S)", portrait: [384, 832], src: "실측 밀도 2.8125" },
    { id: "iphone-max", device: "PHONE_IOS", name: "iPhone 14 Pro Max", portrait: [430, 932], src: "Apple 사양" },
    { id: "iphone-mini", device: "PHONE_IOS", name: "iPhone 13 mini", portrait: [375, 812], src: "Apple 사양" },
    { id: "xiaomi", device: "TABLET_ANDROID", name: "Xiaomi 태블릿 (24076RP19G)", portrait: [601, 1006], landscape: [1006, 601], src: "11-16 실측 CSS" },
    { id: "ipad10", device: "TABLET_IPAD", name: "iPad 10세대", portrait: [820, 1180], landscape: [1180, 820], src: "Apple 사양" },
    { id: "ipad-mini", device: "TABLET_IPAD", name: "iPad mini", portrait: [744, 1133], landscape: [1133, 744], src: "Apple 사양" },
    { id: "ipad-split", device: "TABLET_IPAD", name: "iPad 10세대 가로 · 화면 반 나누기", portrait: [590, 820], landscape: [590, 820], src: "1180 의 1/2" },
    { id: "windows", device: "DESKTOP_WINDOWS", name: "Windows 창 1600×900", window: [1600, 900], src: "100% 배율" },
    { id: "windows-narrow", device: "DESKTOP_WINDOWS", name: "Windows 창 좁힘 700×800", window: [700, 800], src: "창 크기 조정" },
    { id: "mac", device: "DESKTOP_MAC", name: "Mac 창 1612×1111pt (Owner 지금 창)", windowPt: [1612, 1111], src: "11-16 Owner 화면" },
    { id: "mac-narrow", device: "DESKTOP_MAC", name: "Mac 창 좁힘 700×800pt", windowPt: [700, 800], src: "창 크기 조정" },
    { id: "mac-now", device: "TABLET_IPAD", now: true, name: "Mac 지금 (iPad 앱 그대로, 77%)", windowPt: [1612, 1111], src: "운영 1be808e73" },
  ];

  /** 프리셋 + 방향 → CSS 크기·배치 결과 (시안·계약 시험 공통 계산) */
  function resolve(presetId, orientation) {
    var p = PRESETS.filter(function (x) { return x.id === presetId; })[0];
    var prof = DEVICE_PROFILES[p.device];
    var o = prof.rotation === "PORTRAIT_ONLY" ? "portrait" : orientation;
    var css, pt = null, zoom = prof.webZoom;
    if (p.windowPt) {
      var scale = p.now ? 0.77 : 0.77 * zoom; // 지금 Mac 은 배율 보정 없음
      if (p.now) zoom = 1;
      css = [Math.round(p.windowPt[0] / scale), Math.round(p.windowPt[1] / scale)];
      pt = p.windowPt;
    } else if (p.window) {
      css = p.window.slice();
    } else {
      css = (o === "landscape" && p.landscape ? p.landscape : p.portrait).slice();
    }
    var wide = !p.now && prof.split && css[0] >= LAYOUT.splitMinCss;
    if (p.now) {
      // 지금 운영: Mac 은 TABLET_IPAD 로 판정되어 하단 탭 창 전체 + 한 화면(카드가 창 폭으로 늘어남)
      return { preset: p, profile: prof, orientation: null, css: css, pt: pt, zoom: 1, wide: false, nav: "BOTTOM_FULL", now: true };
    }
    return {
      preset: p, profile: prof, orientation: prof.rotation === "PORTRAIT_AND_LANDSCAPE" ? o : null,
      css: css, pt: pt, zoom: zoom, wide: wide,
      nav: wide ? prof.navWide : prof.navNarrow,
    };
  }

  root.DIBAY_DEVICE_SSOT = { FAMILY: FAMILY, NAV: NAV, LAYOUT: LAYOUT, DEVICE_PROFILES: DEVICE_PROFILES, TAB_LAYOUT: TAB_LAYOUT, ROTATION_RULES: ROTATION_RULES, PRESETS: PRESETS, resolve: resolve };
})(this);
