# Google Maps/Routes 비용 가드 체크리스트

개발 중 기본 목표: `GOOGLE_ROUTES_API_DISABLED` 를 명시적으로 `0`으로 두지 않으면 Routes API 유료 호출이 발생하지 않아야 한다.

## API Key 제한

- 서버 키는 서버 환경 변수에만 둔다: `GOOGLE_MAPS_SERVER_API_KEY` 또는 `GOOGLE_MAPS_ROUTES_API_KEY`.
- 서버 키는 `NEXT_PUBLIC_*` 이름으로 노출하지 않는다.
- 서버 키의 API 제한은 가능하면 Routes API만 허용한다.
- 브라우저 키는 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`만 사용한다.
- 브라우저 키의 API 제한은 Maps JavaScript API, Places API, Geocoding API만 허용한다.
- 브라우저 키에서 Routes API는 허용하지 않는다.

## Application 제한

- 브라우저 키는 HTTP referrer 제한을 켠다.
- 허용 referrer는 개발용 `localhost`, Vercel 도메인, 실제 서비스 도메인만 둔다.
- 과도한 와일드카드 referrer는 제거한다.
- 서버 키는 가능하면 서버 IP 제한 또는 서버 전용 키 관리 정책을 적용한다.
- 서버 키가 클라이언트 번들에 들어가지 않는지 배포 전 환경 변수를 확인한다.

## Quota 제한

- 개발 중 Routes API daily quota는 100~300 수준으로 낮춘다.
- Routes API per-minute quota도 개발 트래픽 수준으로 낮춘다.
- Compute Route Matrix quota는 사용 전까지 최소치로 둔다.
- Places Autocomplete quota를 개발 중 낮게 제한한다.
- Geocoding quota를 개발 중 낮게 제한한다.
- Maps JavaScript API map loads도 예산에 맞춰 daily quota를 둔다.

## Billing 알림

- 예산 알림을 최소 3단계로 둔다: 5,000원, 10,000원, 20,000원.
- 예산 알림 수신자를 실제 확인 가능한 계정으로 둔다.
- 비용 급증 시 Routes API, Maps JavaScript API, Places API, Geocoding API SKU별로 분리해 확인한다.

## 로컬 검증

- `/stores` 목록 진입: `[GOOGLE_BILLABLE_CALL]` 없어야 한다.
- `/stores/[slug]` 최초 렌더: `[GOOGLE_BILLABLE_CALL]` 없어야 한다.
- `GOOGLE_ROUTES_API_DISABLED=1` 또는 미설정 개발 모드에서 예상 도착 확인: `[GOOGLE_CALL_SKIPPED]`만 떠야 한다.
- 실제 Google 호출 테스트는 `GOOGLE_ROUTES_API_DISABLED=0`, `GOOGLE_ROUTES_TRAVEL_MODE=DRIVE`, `GOOGLE_ROUTES_TRAFFIC_AWARE=0`, `GOOGLE_ROUTES_ALLOW_TWO_WHEELER=0` 상태에서만 한다.
- DRIVE 테스트 시 `[GOOGLE_BILLABLE_CALL]`의 `skuCandidate`는 `essentials`, `travelMode`는 `DRIVE`, `routingPreference`는 `null`이어야 한다.
- 같은 ETA를 5회 연속 요청해도 `[GOOGLE_BILLABLE_CALL]`은 최대 1회여야 하며 나머지는 `cache_hit` 또는 `inflight_hit`이어야 한다.
