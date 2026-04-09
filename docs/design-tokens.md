# SAMarket 디자인 토큰

UI/UX 의도는 **`app/design-tokens.css`** 의 `--ui-*` 변수에만 정의합니다.  
라이트/다크는 같은 파일의 `@media (prefers-color-scheme: dark)` 에서 함께 조정합니다.

## 수정할 때

1. **`app/design-tokens.css`** — 색·반경·그림자·최소 터치 영역 등
2. 필요 시 **`app/globals.css`** — `@theme inline` 에 Tailwind 색 이름 추가(새 토큰을 클래스로 쓰려면)
3. **컴포넌트** — 새 hex 직접 쓰지 말고 `ui-*` 클래스 또는 `var(--ui-*)`

## CSS 변수 (시맨틱)

| 변수 | 용도 |
|------|------|
| `--ui-page-bg` | 앱 전체 페이지 배경 |
| `--ui-surface` | 카드·시트·탭바 등 올라오는 면 |
| `--ui-text-primary` | 본문·제목 |
| `--ui-text-secondary` | 보조 설명·비활성 탭 |
| `--ui-primary` | 링크·활성 탭·주요 버튼 |
| `--ui-border` | 구분선·입력 테두리 |
| `--ui-hover-surface` | 리스트/버튼 호버 배경 |
| `--ui-danger` | 경고·삭제 |
| `--ui-success` | 성공 |

## Tailwind (권장 클래스)

`globals.css`의 `@theme`에 연결되어 있습니다.

- 배경: `bg-ui-page`, `bg-ui-surface`, `bg-ui-primary`, `bg-ui-hover`
- 글자: `text-ui-fg`, `text-ui-muted`, `text-ui-primary`, `text-ui-danger`, `text-ui-success`
- 테두리: `border-ui-border`, `divide-ui-border`
- 모서리: `rounded-[length:var(--ui-radius-lg)]` 등 (`@theme`의 `--radius-ui-*`는 확장 시 참고용; 클래스명은 `rounded-[length:var(--ui-radius-md)]` 패턴 권장)

## 레거시 브리지

기존 코드 호환용으로 다음이 `--ui-*` 를 가리킵니다.

- `--background`, `--foreground`, `--signature`, `--sub-bg`, `--text-muted`, `--ig-border`, `--ig-highlight`

## 정적 문서·약관 HTML

루트에 `ui-doc-root` / `ui-doc-muted` / `ui-doc-surface` 클래스를 쓰면 토큰과 동기화된 타이포·링크 색이 적용됩니다. (`globals.css` 참고)

## TypeScript

인라인 스타일이 필요할 때만 `lib/ui/css-vars.ts` 의 `UI_CSS` 사용.
