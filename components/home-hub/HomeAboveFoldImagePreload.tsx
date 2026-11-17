import { preload } from "react-dom";

/**
 * 앱 진입 실기 F3-b — 첫 화면 그림을 서버 HTML `<head>` 의 `<link rel="preload" as="image">` 로 미리 받는다
 * (React 19 리소스 API · 같은 주소는 React 가 한 번만 낸다). 화면에는 아무것도 그리지 않는다.
 * 배너는 `<img>`(next/image 아님)라 `src` 와 같은 주소 문자열을 그대로 쓴다.
 */
export function HomeAboveFoldImagePreload({ urls }: { urls: readonly string[] }) {
  for (const href of urls) {
    preload(href, { as: "image", fetchPriority: "high" });
  }
  return null;
}
