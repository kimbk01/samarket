import { HomeSurface } from "@/components/home-hub/HomeSurface";

/**
 * `/home` — 앱 홈(`/`)과 같은 화면. CI `verify:routes` 가 요구하는 `app/(main)/home` 세그먼트.
 * Cold Boot: HTTP redirect 금지 — `/` 와 동일 Authority(`HomeSurface`).
 */
export default function HomeSegmentPage() {
  return <HomeSurface />;
}
