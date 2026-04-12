import { ImageResponse } from "next/og";

/** PWA·홈 화면 아이콘용 — 정적 PNG 없이 브랜드 단색 + 문자 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7360f2",
          color: "#ffffff",
          fontSize: 280,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}
