# Routes API 비용 검증 (PowerShell)

## 정적 검색 (저장소 루트)

```powershell
cd c:\samarket
rg "computeRouteMatrix|computeRoutes|fetchRouteLegMetricsByStoreId" --glob "*.ts" --glob "*.tsx"
```

## TypeScript

```powershell
cd c:\samarket
npx tsc --noEmit
```

`.next/dev/types` 파손으로 전체 `tsc`가 실패하면, 이번 Routes 변경과 무관한 기존 이슈로 분리해 본다.

## 수동 시나리오 (dev 서버)

환경: `.env.local` 에 `GOOGLE_ROUTES_API_DISABLED=1` 권장.

| ID | 동작 | 기대 |
|----|------|------|
| A | `/stores` 진입 | `[routes-api] call` 없음. `disabled_by_env` 또는 `skipped`만 가능 |
| B | `/stores/search` 또는 검색 | 동일 |
| C | 매장 상세 | 자동 `delivery-eta` 없음 → `call` 없음(히어로) |
| D | 장바구니 → 배달지 준비 후 **「예상 도착(참고) 확인」** 클릭 | Routes 활성 시 최대 1회 `call` 또는 `cache_hit` |
| E | 주문 제출(POST store-orders) | 정상 좌표일 때 체크아웃 스냅샷용 `call` 최대 1~2회(TWO_WHEELER→DRIVE). 동일 구간은 클라이언트 15분 캐시 |

주소 동기화(`sync-store-orders-checkout-geo`)는 `skipGoogleRoutes: true`로 **Google 호출 없음**; 직선 거리만 갱신.
