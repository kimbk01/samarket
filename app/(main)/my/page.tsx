import { MyContent } from "./MyContent";

/**
 * `/my` — same shell as `/mypage`.
 * DO NOT: `redirect("/mypage")` RSC — Cap WebView hits React #310 / Application error.
 */
export default function MyPage() {
  return <MyContent />;
}
