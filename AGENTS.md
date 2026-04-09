<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## SAMarket 앱 라우트 (고정)

- 메인 사용자 UI 페이지는 **`app/(main)/`** 아래 둡니다. `(…)` 는 라우트 그룹이라 **URL 에 이름이 붙지 않습니다** (`/home` 등 유지).
- **`app/_anything`** 로 묶지 마세요. Next.js `normalizeAppPath` 는 `_` 접두를 URL 에서 빼지 않아 **`/_anything/...` 로 열리고 기존 경로는 404** 가 됩니다.
- 구조 확인: `npm run verify:routes`

## UI 토큰

- 색·서피스·테두리 등은 **`app/design-tokens.css`** (`--ui-*`) 단일 소스. 신규 화면은 hex 대신 `bg-ui-page` 등 시맨틱 클래스 또는 `var(--ui-*)` 사용. 요약: `docs/design-tokens.md`.
- 사각형 카드·섹션·시트 모서리는 **`rounded-ui-rect`** (4px, `--ui-radius-rect`). 원·pill만 **`rounded-full`** 유지. 한 줄에 `rounded-full` 과 다른 라운드가 섞인 템플릿 문자열은 수동으로 분기별 클래스 확인.
<!-- END:nextjs-agent-rules -->
