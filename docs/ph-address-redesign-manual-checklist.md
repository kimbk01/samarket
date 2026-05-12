# 필리핀형 주소 재설계 — 수동 검증 체크리스트 (계획 8절·17항)

환경: 스테이징 또는 로컬(실 Google 키·로그인 사용자). 에이전트는 브라우저 수동 클릭을 대신 수행하지 않음 — 아래는 **검증 절차**와 이번 구현과의 매핑이다.

| # | 항목 | 상태 | 비고 |
|---|------|------|------|
| 1 | SM North 등 대형 POI 검색·선택 | ☐ 수동 | `AddressEditorSheet` + `fetchPlacePredictionsPh` |
| 2 | Trees Residences 등 단지 검색 | ☐ 수동 | 동일 |
| 3 | subdivision 스타일 검색 | ☐ 수동 | 동일 |
| 4 | 저장 필드(barangay/city/province/detail/note) | ☐ 수동 | Place Details 파싱 + 편집 필드 |
| 5 | 기본 배달 주소 지정 | ☐ 수동 | 기존 API 유지 |
| 6 | 수정·삭제 | ☐ 수동 | 기존 플로우 |
| 7 | 체크아웃 자동 선택 | ☐ 수동 | `StoreCommerceCartPageClient` selection effect |
| 8 | ETA 주소 변경 시 갱신 | ☐ 수동 | 클라 320ms 디바운스 + `delivery-eta` |
| 9 | TWO_WHEELER / DRIVE fallback | ☐ 수동 | 서버 `fetchDeliveryRouteSingleLeg` |
| 10 | 구 주문 스냅샷 | ☐ 수동 | 변경 없음(주문 스키마 동일) |
| 11 | 장바구니 localStorage 배달 주소 제거 | ☑ 구현 | `clearDeliveryAddressBookStorage` + 안내 배너 |
| 12 | 모바일 overflow | ☐ 수동 | 에디터·카트 반응형 재확인 |
| 13 | `npx tsc --noEmit` | ☑ 통과 | CI/로컬 |
| 14 | 주소 API 오류 코드 | ☑ 문서화 | `USER_ADDRESS_PLACES_VALIDATION_CODES` (`address-api-validation.ts`) |
| 15 | `delivery-eta` 응답 필드 + alias | ☑ 구현 | `travel_mode_used`, `fallback_used` + 기존 camelCase |
| 16 | Autocomplete / Place details 캐시 | ☑ 구현 | 350ms 디바운스 + `fetchPlaceDetailsAsLegacyPlaceResultCached` |
| 17 | 서버 ETA TTL | ☑ 구현 | `delivery-eta` 12s 메모리 캐시 |

**요약:** 구조·API·UI·장바구니·ETA 계약은 반영되었고, 실제 기기·지도·결제까지는 스테이징에서 위 표의 ☐ 항목을 한 번씩 돌려 주면 된다.
