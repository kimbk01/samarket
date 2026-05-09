# Known Harmless Console Warnings

브라우저 DevTools 콘솔에 자주 보이지만 **기능·성능·보안에 영향이 없는** 경고를 기록한다.
실제 blocking error / Supabase Security Advisor / API 4xx·5xx / Realtime 문제와 헷갈리지 않도록 정리한다.

각 항목은 **재현 조건 → 원인 → 영향 → 결정 / 재검토 트리거** 순서로 적는다.

## 1. `downloadable font: name records are not sorted` (Pretendard Variable subset)

- **재현**: 첫 페인트 시 `_next/static/media/PretendardVariable.subset.*.woff2` 가 다운로드되는 시점. Edge·Firefox 에서 다수 출력, Chrome 은 비교적 조용.
- **원인**: `app/globals.css` 가 `node_modules/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css` 를 import 하고, 해당 패키지(`pretendard@1.3.9`)의 subset woff2 들이 OpenType `name` 테이블을 알파벳순으로 정렬하지 않은 채 빌드돼 있어 발생. **글꼴 자체는 정상 렌더링.**
- **영향**:
  - 기능: 없음 — 한글·영문 폰트 정상 표시
  - 성능: 없음 — subset CDN 캐시·로딩 그대로 동작
  - 보안: 없음
  - 콘솔 노이즈: 첫 페인트당 ≈10–20 줄, 새 subset 다운로드 때 추가 1줄
- **결정 (2026-05-09)**: **수정하지 않음.** 대안 비교
  - 단일 `pretendardvariable.css` 로 교체 → 초기 다운로드 ~1.4MB 증가 → 모바일 LCP 손해
  - `next/font/local` 로 woff2 재생성 → 작업량 큼, 후속 업데이트 시 재실행 부담
  - 패키지 업스트림 수정 → 의존
- **재검토 트리거**:
  - `pretendard` 패키지가 `name` 테이블 정렬을 포함한 마이너 릴리스를 내면 업데이트 시도
  - 모바일 LCP 작업 라운드에 폰트 전략 자체를 바꿀 때 함께 처리
- **관련 코드**:
  - `app/globals.css` 4 행 `@import ".../pretendardvariable-dynamic-subset.css"` (유지)
  - `app/globals.css` 81–84 행 `--font-sans` (유지)

## 2. `Download the React DevTools for a better development experience` (React 안내)

- **재현**: 모든 페이지 첫 진입 (개발자 도구 미설치 브라우저)
- **원인**: React 19 가 DevTools 미설치 시 콘솔에 권유 메시지 1회 출력
- **영향**: 없음. 사용자 안내 1줄.
- **결정**: 수정 불가·불필요. 무시.

---

## 의도적으로 남기는 진단 로그 (이건 노이즈가 아니다)

다음은 의도적으로 디자인된 진단 출력으로, 정상 상태에서도 가끔 보일 수 있다. **반복·폭주 시에만** 조사 대상.

- `[cm-receive-latency] helpers_attached` — 메신저 진단 보조 부착 (페이지당 1회)
- `[HMR] connected` — Next.js dev HMR 핸드셰이크 완료
- `[community-feed:perf-diag] fetchPage_enter` / `fetchPage_done` — 커뮤니티 피드 페이징 진단
- `[home-sync-*]` (서버) — `/api/community-messenger/home-sync` 분해 측정 (헌장 트랙 산출물)

## 진짜 잡아야 하는 신호 (이 문서가 가리는 것은 아님)

다음은 절대 무시 금지. 같은 형태로 보이더라도 별도 라운드에서 처리한다.

- 콘솔의 **빨간 ✕ Error** 라인 (`Uncaught`, `Unhandled`, `TypeError`, `403/404/500` 응답)
- `[messenger:perf:alert]` (임계 초과)
- `[cm-rt-loop]` 의 `status_failed` / `schedule_retry` / `resubscribe` 또는 `active >= 2` (중복 인스턴스)
- `[cm-rt-loop-summary]` 가 다시 보이는 경우 (필터가 `create>=2 || stop>=2` 이므로 보였다면 진짜 루프)
- `silent_channel` (lastSignalAt 가 채워진 scope 의 무음) — 실제 Realtime payload 끊김
- Supabase Security Advisor 의 RLS / function search_path / extension schema 경고
- API 라우트 **4xx·5xx** (`/api/...` 의 비정상 응답률)
