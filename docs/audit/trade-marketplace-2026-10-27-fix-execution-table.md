# DIBAY 거래 — 기존 계약 결함 수정 실행표 (2026-10-27)

- **기준**: `docs/audit/trade-marketplace-2026-10-27-full-audit-and-design.md` (52건)
- **코드 기준**: `origin/main` `ae0d0e9e6`
- **운영 DB 확인**: `ckdosyydvgzqwpbwuhon` 에 읽기 전용 SELECT 만 실행
- **이번 단계 변경**: 코드·DB·배포 모두 0건 (실행표 확정까지)
- **원칙**
  - 새 설계·새 기능 없음
  - 계약은 문서에서 가장 최근 Owner 확정 문구를 따름
  - 실제로 측정하지 않은 항목은 NOT_PROVEN

---

## 0. 결론 요약

| 항목 | 값 |
|---|---|
| 재분류 | A 18 · B 5 · C 9 · D 15 · E 1 · F 4 = 52 |
| 이번 수정 범위 | A + B + C = **32건**, 9개 묶음 (각 묶음 = main 1회 반영) |
| 범위 제외 | D 15 · E 1 · F 4 = **20건** — 보고만 |
| 웹 / DB / 네이티브 | 웹 9묶음 · DB 1묶음(G3, Owner 승인 필요) · 네이티브 0 |
| 정정 | **TM-10(거리 5·10km)은 결함이 아님**. 승인 계약이 「LGU 중심점 매칭」이며 구현이 계약과 일치 → 감사 보고서의 「시 단위 옵션 교체」 권장을 철회 |

---

## 1. 감사 판정 재정리

### 1.1 PASS 73건 — 코드 경로 확인과 실제 동작 검증의 구분

| 검증 수준 | 건수 | 내용 |
|---|---|---|
| 코드 호출 경로까지 확인 | 71 | 정적 추적만 함. **실제 동작은 NOT_PROVEN** |
| 운영 DB 실측으로 확인 | 2 | CH-5: 유니크 `product_chats_post_id_seller_id_buyer_id_key` 존재, 중복 쌍 0 · LS-13: `posts_search_text_trgm_idx` 존재 |
| 화면·API 실동작 (Production·실기기) | **0** | 측정하지 않음 |

→ 73건 모두 「코드 PASS」일 뿐입니다. 「실동작 PASS」로 올릴 근거는 없습니다.

### 1.2 승인 계약 재확인 결과 (이번에 원문 대조)

| 대상 | 최신 승인 계약 (출처) | 현재 구현 | 판정 |
|---|---|---|---|
| 거리 `radius=N` | 「anchor + N km = Within N km only — hard EXCLUDE outside」(`.cursor/rules/dibay-marketplace-browse-single-contract.mdc:28`) · 「Same centroid matcher as explicit `radius=`」(`docs/dibay-marketplace-list-ssot-target.md:33`, OWNER 2026-10-16) · 테스트 행렬에 「Pasay + 5km」 | LGU 중심점 간 haversine ≤ N km 인 LGU 의 글만 포함 (`lgu-centroids.ts:88`). 서버 SQL 하드 필터 | **계약 충족 (코드)** · 실측 NOT_PROVEN |
| 검색 무관 매물 | Owner 결정 #1 **T5-B**: 같은 ROOT 까지 확장 후 STOP (`list-ssot-target.md:15`) · §9 「no cross-ROOT unrelated」(2026-10-16 `4ebf22c7d` 에서 재확인) · §10 「DO NOT Restore global T5 unrelated tail」 | 차단 게이트 `shouldAllowSearchExpansionTail` 는 08-20 생성 이후 **호출 0회**. 카테고리를 고르지 않으면 전국 무관 글이 tail 로 붙음 | **계약 위반 (A)** |
| 같은 문서 :38 「unrelated … still shown」 | 짧은 검색어(strongRelated) 수정을 설명하는 구현 메모. 결정 #1·§9·§10 을 개정하지 않음 | — | 문서 표현 정정 대상 |
| 거래 전용 검색면 | LIST SSOT 의 검색 모드 행렬(Text search · Search+ROOT · Filter combined)은 `/market?q=` 에서 구현됨. 09-17 `3c8f094bb` 은 「Trade still use[s] existing search authorities」 | 돋보기는 `/search` 로 감. 전역 거래 섹션은 제목 10건만 보여주고 `/market?q=` 로 가는 경로가 없음 | **계약 검색면에 UI로 도달 불가 (A)** |
| 카테고리 내부 검색 | 계약 문서 없음 | UI 없음 | NOT_APPLICABLE |
| ↺ 초기화 | BR-2 「↺ = 필터 『전체 초기화』 같은 href, q 보존」(규칙 최종 갱신 2026-10-16) | 두 버튼의 href 가 다름 (`0c5924baf`, 08-20) | **계약 위반 (A)** |

### 1.3 이번에 새로 확인한 운영 근거

| 근거 | 값 | 쓰이는 곳 |
|---|---|---|
| anon·authenticated 역할의 `posts`·`post_reports`·`posts_masked` 쿼리 (pg_stat_statements, 2026-10-22 14:31 UTC 리셋 이후) | **0회** (`posts` 는 service_role 5,335회) | G3 영향 분석 |
| `posts` 의 `supabase_realtime` publication 포함 여부 | **미포함** | G3 영향 분석 (Realtime 영향 없음) · 범위 밖 관찰 O-1 |
| 사진 0장인데 썸네일이 남은 글 | **1건** | TM-06 운영 실재 |
| 외부 호스트 이미지 | 0건 | TM-22 운영 피해 없음 (취약점은 존재) |
| 카테고리 이상 글·음수 가격 | 0 · 0 | TM-23·TM-50 → D 로 재분류 |

---

## 2. 52건 재분류

| 분류 | 건수 | ID |
|---|---|---|
| **A** 기존 계약 위반 기능 결함 | 18 | TM-04, 05, 06, 07, 08, 11, 17, 19, 20, 21, 24, 26, 27, 28, 31, 35, 37, 39 |
| **B** 개인정보·권한·무결성 | 5 | TM-01, 02, 03, 22, 29 |
| **C** UI·UX·CTA·SSOT 불일치 | 9 | TM-09, 30, 34, 40, 43, 52, 53, 54, 55 |
| **D** 운영 영향 미확인 잠재 결함 | 15 | TM-23, 25, 33, 36, 38, 41, 42, 44, 45, 46, 47, 48, 49, 50, 56 |
| **E** 문서와 승인 계약 불일치 | 1 | TM-10 (부속 TM-10b 는 A, G8 에서 처리) |
| **F** 미사용 레거시 | 4 | TM-18, 32, 51, 57 |

### 우선순위 조정
- **TM-10:** P1 에서 E 로 내림. 계약을 충족하므로 수정하지 않음.
- **TM-10b:** 비숫자 `radius` 값을 조용히 64km 로 바꿈 → BR-8 「silent 64km fallback 금지」 위반. P3 / A.
- **TM-25 (수정 후 상세 stale):** 실측 없음 → D. G4 검증에서 재현될 때만 같은 묶음에서 수정.
- **TM-56 (과다 GRANT):** 실제 접근 경로 없음 → D.
  - TRUNCATE 는 PostgREST 가 실행하지 않음.
  - `posts_masked` 는 security_invoker 라 원본 `posts` 쓰기 권한이 없으면 막힘.
  - `post_reports` 의 UPDATE/DELETE 는 RLS 정책이 없어 거부됨.

---

## 3. 수정 실행표 (P0 → P1 → P2 → P3, 같은 원인끼리 묶음)

각 묶음 = 단독 커밋 → main 1회 반영. 다른 도메인과 섞지 않습니다. 통화·메신저 일반 채팅·그룹·배달 주문 채팅은 변경하지 않습니다.

### G1 · P0 · 판매자 화면의 구매자 식별 (웹)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 확인된 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-01 | B | 상품 × 구매자당 방 1개, 판매자는 구매자별로 구분 (CH-5, `trade-chat-room-identity.md`) | 판매내역에서 X 의 대화에 Y 가 표시되고, 신고·차단이 Y 에게 감 | `pickItemTradeRoomForProductChat`(`lib/mypage/sales-history-scope.ts:55-56`)가 정확히 맞는 방이 없으면 판매자가 들어간 **아무 방**이나 반환. **운영 영향 8행** | 정확 일치 또는 판매자·구매자가 뒤집힌 쌍만 허용. 없으면 `product_chats.buyer_id` 사용 |
| TM-19 | A | 같은 계약 | 글별 구매자 목록에서 product_chats 에만 있는 구매자가 빠짐. 상태가 방별로 구분되지 않음 | `app/api/my/post-buyer-chats/route.ts:100` 이 chat_rooms 가 1건이라도 있으면 product_chats 를 보지 않음 | 두 원장을 buyer_id 로 합치고, 상태는 `product_chats.trade_flow_status` 우선 |
| TM-20 | A | 거래 방 생성은 예약·제한 검사를 거친 단일 진입 (CH-1, `item-trade-chat-start-core`) | `POST /api/chat/create-room` 이 검사를 우회하고 chat_rooms 없는 product_chats 생성 (TM-01 데이터의 원천 후보) | `legacy-product-chat-create-or-get.ts:41-107` | 410 응답 (클라이언트 호출 0건 확인됨) |

- **정상 기능 영향**: 정확히 일치하는 방이 있는 대다수 행(434방)은 결과가 같음. 바뀌는 것은 운영 8행의 표시 대상뿐.
- **검증**
  1. `pickItemTradeRoomForProductChat` vitest (정확 / 뒤집힘 / 불일치 / 없음)
  2. 운영 8행의 post_id·buyer_id 를 읽기 전용으로 뽑아, `/api/my/sales` 응답 buyerId 가 `product_chats.buyer_id` 와 같은지 판매자 계정으로 대조. 판매자 계정 테스트가 불가하면 NOT_PROVEN
  3. 410 이후 거래 채팅 시작 정상 (상세 → 문의)
- **데이터**: 운영 8행은 삭제하거나 변경하지 않음 (표시 로직만 수정).

### G2 · P0 · 공개 목록 응답의 식별정보 (웹)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 확인된 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-02 (웹) | B | 예약 구매자 ID 는 마스킹 (`posts_mask_reserved_buyer_id`, anon 컬럼 GRANT 에서 `reserved_buyer_id` 제외) | 목록 API 가 `reserved_buyer_id`·`sold_buyer_id` 를 내려줌. 비로그인 응답은 `public, max-age=30` | 목록 select(`lib/posts/trade-posts-range-query.ts:43`, `home-posts-query-server.ts:84-90` 의 `*` 폴백)를 service-role 로 읽어 마스킹을 우회 | 목록용 select·폴백에서 두 컬럼과 `*` 제거. `HomeProductList.tsx:121` 의 같음 비교는 `seller_listing_state` 로 대체 |
| TM-29 | B | 상세 전용 거래 장소 (`trade_meet_spot`) | 목록 응답 meta 에 lat/lng/place_id 포함 (운영 132건) | `mapPostRowForHome` 이 meta 를 그대로 전달 (`home-posts-query-server.ts:125-135`) | 목록 매핑에서 좌표·place_id 제거 (상세는 유지) |

- **정상 기능 영향**: 목록 카드는 두 컬럼을 표시하지 않음. 구현 시 목록 행에서 `reserved_buyer_id`·`sold_buyer_id` 를 읽는 곳을 grep 해 대체 필드로 바꿈. 채팅·마이페이지는 각자 서버 API 에서 받으므로 영향 없음.
- **검증**: 배포 후 Production 에서 쿠키 없이 `GET /api/philife/posts?location=all` 을 호출해 응답 JSON 에 두 키와 `trade_meet_spot.lat` 이 없는지 확인 (Production SHA 기록) · 홈 / 카테고리 / 검색 / 상세 회귀 확인.

### G3 · P0/P1 · DB 권한 (DB · **Owner 승인 후 운영 적용**)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 확인된 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-02 (DB) | B | 위와 같음 | anon·authenticated 가 REST 로 `sold_buyer_id` 직접 조회 가능 (운영 64건) | 컬럼 GRANT 에 `sold_buyer_id` 포함 (`reserved_buyer_id` 는 제외돼 있음) | `REVOKE SELECT (sold_buyer_id) ON public.posts FROM anon, authenticated` |
| TM-03 | B | 관리자 숨김·작성자 삭제 글은 비공개 (`posts_visibility_gate`, `moderation_state`/`owner_state`) | 숨김 20건의 제목·본문·사진을 anon REST 로 조회 가능 | `posts_public_select`·`posts_select` 가 `USING (true)` | 두 정책을 `moderation_state='visible' AND owner_state='none'` 하나로 교체 (작성자·관리자는 기존대로 service-role API) |

- **실제 접근 경로 근거**
  - 10-22 이후 anon·authenticated 의 `posts` 쿼리 0회, 앱 읽기는 전부 service_role → 정책을 바꿔도 앱 화면 영향 없음.
  - `posts` 가 Realtime publication 에 없으므로 구독 영향 없음.
- **롤백**
  - `GRANT SELECT (sold_buyer_id) ON public.posts TO anon, authenticated`
  - 기존 두 정책을 `USING (true)` 로 재생성
  - 같은 마이그레이션 파일에 롤백 SQL 을 주석으로 둠
- **검증**
  1. 적용 후 `pg_policies` · `column_privileges` 재조회
  2. `SET ROLE anon` 트랜잭션에서 숨김 글 count = 0, `sold_buyer_id` 선택 시 permission denied (읽기 전용 확인)
  3. 앱 목록·상세·거래 채팅·판매내역 정상
- **순서**: G2(웹) 배포 이후 적용. 웹이 먼저 컬럼을 쓰지 않게 해야 함.

### G4 · P1 · 글쓰기·수정 데이터 일치 (웹 · SSOT `TradeCategoryWriteForm` 경로)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 확인된 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-04 | A | 글쓰기 사진 등록 (U3-1) | 약 4.5MB 넘는 원본은 업로드 실패, 원인 미표시 | `lib/posts/uploadPostImages.ts:17-34` 가 축소하지 않고 원본 전송. 413 을 null 로 삼킴 | 기존 `prepareImageFileForFunctionUpload` 적용 + 실패 사유 반환 |
| TM-05 | A | 수정 = 화면 값 그대로 저장 (I-1, composition SSOT) | 지운 속성·체크 해제·거래장소 삭제·`direct_deal` 이 그대로 남음 | 서버 `{...before.meta, ...body.meta}` (`lib/trade/trade-lifecycle-policy.ts:448-451`) + 클라이언트가 빈 키를 생략 (`TradeWriteForm.tsx:93-138,1786`) | composition 소유 키를 null 포함해서 전송하고, 서버는 null 이면 키 삭제 |
| TM-06 | A | 같은 계약 | 사진을 전부 지워도 썸네일이 남음 (**운영 1건**) | `trade-lifecycle-policy.ts:457-463` | `imageUrls` 가 명시적으로 빈 배열이면 `thumbnail_url=null` |
| TM-26 | A | 대표 사진 = 첫 장 (U3) | 대표 사진을 편집하거나 사진을 섞으면 순서가 바뀜 | `[...existing, ...uploaded]` 병합 (`TradeWriteForm.tsx:1624,1708`) | 배열 순서를 유지한 채 파일 항목만 치환 (`uploadPendingTradeWriteImages` 방식) |
| TM-37 | A | 같은 계약 | 구인·환전 수정에서 사진을 전부 지울 수 없음 | `TradeWriteForm.tsx:1625` 가 빈 배열 대신 `undefined` 전송 | edit 일 때 `[]` 전송 |
| TM-22 | B | 이미지는 자사 Storage | 외부 https URL 도 저장됨 (운영 0건, 취약점은 존재) | `persistable-storage-media-ref.ts:25-43` | create·update 라우트에서만 자사 `post-images/{userId}/` 접두사 검사 추가. 공용 함수는 변경하지 않음 |

- **정상 기능 영향**
  - 6개 ROOT 의 등록·수정 전체가 영향 범위.
  - 기존 글 데이터는 변경하지 않음. 운영 1건의 잔존 썸네일은 작성자가 다시 수정할 때 바로잡힘.
- **조건부**: TM-25(D) 는 아래 검증 4에서 재현될 때만 `router.refresh()` 추가.
- **검증**
  1. 6 profile × (등록 → 목록 → 상세 → 수정: 속성 지우기·사진 전부 삭제·대표 사진 편집 → 목록 → 상세 → 관리자 상세) 일치 확인
  2. vitest: meta 병합, 썸네일, 사진 순서
  3. 실기기: iPhone HEIC·Android 12MP 원본 업로드
  4. 수정 직후 상세 즉시 반영 여부 측정 (TM-25)

### G5 · P1 · 신고 (웹)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 확인된 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-07 | A | 목록·상세 신고 모달 (G-3) — 「작성자 신고하기」 포함 | 상세로 이동만 하고 끝 | `ReportReasonModal.tsx:41` 의 `?reportAuthor=1` 을 읽는 코드 없음 | 모달에서 기존 `ReportActionSheet targetType=user` 열기 |
| TM-08 | A | 선택한 사유 코드 저장 | 3개 사유가 `other` 로 저장될 수 있음 (운영 reports 2건은 정상 코드, 피해 미발생) | `ReportReasonModal.tsx:44` 가 문구를 보내고 정규식으로 추론 | `reasonCode` 직접 전달 |
| TM-53 | C | 단일 사유 체계 | 사유 목록이 둘, i18n 없음 | `report-utils.ts:5,26` | 기존 `REPORT_REASONS` 하나로 통일 |

- **영향**: 신고 저장 형식만 바뀜. 관리자 신고 화면은 기존 코드 라벨을 사용.
- **검증**: 사유별 신고 → `reports.reason_code` 확인 → 관리자 화면 라벨 표시 · 작성자 신고 시트 열림 (Android·iPhone).

### G6 · P1/P2/P3 · 카드·뱃지·CTA 통일 (웹 · C)

| ID | 기존 승인 계약 | 현재 상태 | 원인 | 최소 수정 |
|---|---|---|---|---|
| TM-09 (P1) | 카드 가격 = `buildPostListPreviewModel` (U4) | 검색·내 상품에서 나눔이 「₱0」, 통화는 PHP 고정 | `ProductCard.tsx:77`·`MyProductCard.tsx:108` 의 `formatPrice(price)`, 매핑 누락 (`post-with-meta-to-product.ts`) | 두 카드가 `feedPrice` 사용, 매핑에 is_free_share·meta 추가 |
| TM-34 (P2) | 카드 지역 = 공개 도시명 | 검색 카드에 원시 region·city·barangay 표시 | `post-with-meta-to-product.ts:8` | `resolveTradeListingPublicCityLabel` 사용 |
| TM-30 (P2) | 상태 문구 하나 | 「거래완료」와 「판매완료」 혼재 | `ui-phase-finish.ts:117` vs `trade.ts:330` | `ProductStatusBadge` 의 sold 키를 `trade_listing_step_completed` 로 통일 |
| TM-55 (P3) | 토큰·i18n | 숨김·삭제 뱃지가 한국어·gray 하드코딩 | `public-listing-status.ts:70-76` | `postModerationStatusLabel` + `sam-*` |
| TM-54 (P3) | 카드 radius 4px·`border-sam-border` | 관련 글 카드가 rounded-md·`#ccd0d5` | `PostDetailRelatedSections.tsx:119` | 클래스 교체 |
| TM-40 (P3) | 빈 화면 + 판매 CTA, 글쓰기 CTA 표기 일관 | 빈 화면 2종, CTA 없음. 글쓰기 CTA 아이콘 2종(FileText/Plus)·문구 3종 | `PostListByCategory.tsx:960`, `HomeProductList.tsx:1248`, `RegionBarMainHubTier1.tsx:116`, `HomeTradeHubFloatingBar.tsx:119` | 빈 화면은 `CategoryEmptyState` + i18n + 기존 판매 진입 링크. **위치·진입 경로는 그대로 두고** 아이콘·문구만 하나로 맞춤 |
| TM-43 (P3) | 하단 여백 토큰 | 토스트가 `bottom-24` 하드코딩 | `HomeProductList.tsx:1221`, `PostListByCategory.tsx:1019` | `MAIN_BOTTOM_NAV_BODY_CLEARANCE` 사용 |
| TM-52 (P3) | 거래 채팅 빈 목록 → 거래 | 빈 목록 CTA 가 커뮤니티 홈 `/philife` 로 감 | `trade-chat-surface.ts:47` | `/market` |

- **글쓰기 CTA 문구·아이콘**: 「판매하기」·Plus 로 통일할 것을 권장합니다. 다른 값을 원하시면 승인 시 지정해 주세요.
- **대규모 통합 없음**: 카드 9종 등 중복 파일은 실제 충돌(가격·지역·문구)이 있는 곳만 고침.
- **검증**: 홈·카테고리·검색·내 상품·판매·구매·상세 관련 글을 나눔·부동산·렌터카·판매완료·숨김 샘플 글로 대조. Android·iPhone·태블릿 폭 캡처.

### G7 · P2 · 판매 상태 전이·채팅 진입 (웹)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-17 | A | 완료는 구매자를 지정하는 seller-complete 로만 (`trade-chat-buyer-seller-process.md`) | `seller-listing-state` API 로 reserved→completed 직접 전이 가능 (구매자 없는 sold, 운영 0건) | `seller-listing-chat-transitions.ts:25`, `route.ts:253` | 이 API 에서 completed 거부 |
| TM-21 | A | 판매완료면 새 문의 불가 (CH-2, `allowChatAfterSold` 예외) | 서버가 막지 않음 (운영: sold 이후 생성된 방 2건 — 예외 해당 여부는 구현 전 확인) | `item-trade-chat-start-core.ts:271` 이 hidden·deleted 만 검사 | 기존 방 없음 + sold + `!allowChatAfterSold` → 403 |
| TM-39 | A | 예약 중이어도 기존 방 이어가기 (`trade-chat-room-identity.md`) | 비예약 구매자는 기존 방이 있어도 403 | `item-trade-chat-start-core.ts:275` 가 재사용 확인보다 먼저 차단 | 기존 방 조회를 먼저 하도록 순서만 변경 |

- **영향**: 신규 방 차단 조건만 바뀜. 기존 방의 메시지 송수신에는 영향 없음.
- **검증**: 판매중 → 예약(구매자 A) → B 의 기존 방 재진입 OK / B 신규 문의 차단 → 완료(A) → A 확인 → 후기 → 신규 문의 차단. Android↔iPhone 양방향.

### G8 · P1/P2/P3 · 검색·필터 (웹)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-24 (P2, **TM-11 보다 먼저**) | A | T5-B · §9 「no cross-ROOT unrelated」 · §10 | 카테고리를 고르지 않으면 `/market?q=` 에 전국 무관 글이 붙고 「결과 없음」이 나오지 않음 | 게이트 미호출. band5 tail 라운드를 그대로 출력 (`home-posts-query-server.ts:620-765`) | 이미 있는 `shouldAllowSearchExpansionTail` 을 tail 라운드와 band5 출력에 연결 (ROOT 선택 시 ROOT 안 tail 은 유지) |
| TM-11 (P1) | A | LIST SSOT 검색 모드 (검색 + 지역·거리·가격·상태·카테고리, 더보기) | 거래 홈 돋보기가 전역 검색으로 가서 제목 10건만 표시. `/market?q=` 로 가는 경로 없음 | 09-17 전역 검색 전환 때 거래 검색면 진입이 빠짐 | 전역 결과의 거래 섹션에 기존 CTA 헬퍼로 「거래에서 더 보기」 → `/market?q=…&location=현재 값` 연결. 새 검색 정책 없음 |
| TM-28 (P2) | A | 실패는 오류로, 빈 결과 200 금지 (LS-11) | 전역 거래 검색이 DB 실패를 「결과 없음」으로 표시 | `trade-match-only-server.ts:92,117` | `ok:false` 반환 (어댑터는 이미 처리함) |
| TM-27 (P2) | A | 필터 시트를 취소하면 적용 조건 유지 (BR) | 다시 열면 버린 입력이 남아 있음 | `MarketFilterSheet.tsx:354-358` | 열릴 때 URL 기준으로 재동기화 |
| TM-35 (P3) | A | BR-2: ↺ 와 「전체 초기화」 같은 href, q 보존 | 두 href 가 다름 | `TradePrimaryTabs.tsx:157` vs `MarketFilterSheet.tsx:593` | ↺ 를 `buildMarketFilterOnlyResetHref` 로 통일 |
| TM-10b (P3) | A | BR-8: 조용한 64km fallback 금지 | `radius=abc` 이면 64km 로 처리 | `trade-browse-radius.ts:31-39` | 비숫자는 null(거리 전체) |

- **영향**
  - `/market?q=` 에서 카테고리를 고르지 않으면 결과가 줄어듦 — 계약상 의도된 결과.
  - 카테고리를 고르면 ROOT 안 tail 이 그대로 유지됨.
  - 홈 목록 browse(검색어 없음)는 바뀌지 않음.
- **검증**
  1. 기존 `scripts/qa/marketplace-list-ssot-runtime-matrix.mjs` CASE A–H
  2. BR 행렬 1–20 (Pasay+5km 경계 밖 0건 포함)
  3. 검색어 × (카테고리·지역·5/10km·가격·상태·정렬) 조합에서 더보기 2페이지, 중복 0
  4. `q=zzqq` 이면 「결과 없음」
  5. 전역 → 거래에서 더 보기 → 뒤로가기 복원
  6. Production SHA 기록

### G9 · P2 · 관리자 판정 일치 (웹)

| ID | 분류 | 기존 승인 계약 | 현재 상태 | 원인 | 최소 수정 |
|---|---|---|---|---|---|
| TM-31 | A | 관리자 결과 = 앱 화면 (지시 §9-G) | 「판매중」 탭에 reserved 가 빠지고, 「판매완료」 탭은 completed 만 셈 | `lib/admin/trade-admin/trade-posts-query.ts:154-161` | 앱의 `resolveMarketplacePublicListingStatus` 와 같은 조건 사용 |

- **검증**: 운영 상태 분포(판매중 113 · 예약 4 · 완료 63 · 숨김 20, 읽기 전용 집계)와 관리자 탭 카운트를 대조.

---

## 4. 범위 제외 (보고만)

| 분류 | ID | 제외 사유 |
|---|---|---|
| D | TM-23, 25(G4 재현 시만), 33, 36, 38, 41, 42, 44, 45, 46, 47, 48, 49, 50, 56 | 운영 영향이 측정되지 않음. 데이터 200건 규모에서 도달하지 않는 상한 포함 |
| E | TM-10 | 계약 충족. 「5km 를 고르면 시 하나만 남는」 현상은 중심점 계약의 결과 |
| F | TM-18, 32, 51, 57 | 클라이언트 호출 0건 또는 앱 소비처 없음 |
| 문서 | K-1~K-15 (특히 `list-ssot-target.md:38` 의 「still shown」 문구), CUT 1–4 lock 부재 | 기능 결함이 아님. 문서 정리는 별도 지시가 있을 때만 |

### 범위 밖 관찰 (보고만)
- **O-1:** 클라이언트가 `posts` UPDATE 를 `postgres_changes` 로 구독함 (`lib/chats/use-post-seller-listing-realtime.ts:54`, `lib/community-messenger/home/use-community-messenger-trade-post-listing-realtime.ts:54`). 그런데 `posts` 는 Realtime publication 에 없어 이 구독은 운영에서 발화하지 않음. 별도의 broadcast 인가 함수(`trade_can_access_post_listing_broadcast`)가 있어 의도된 전환의 잔재일 가능성이 있음. 실제 상태 동기화 경로는 NOT_PROVEN.

### 샘플 상품 — 이번 실행표에 포함하지 않음 (후보 유지)
- 감사 보고서 §6 의 정적 카탈로그안은 **후보로만 유지**합니다. 36개·12건 미만·별도 섹션 같은 수치는 확정하지 않았습니다.
- 이번 확인 결과, 기존 UI 를 해치지 않고 넣을 수 있는 자리는 G6 에서 통일하는 **빈 화면(`CategoryEmptyState`)** 하나입니다. 실제 목록에 섞지 않습니다.
- 착수 전에 확보해야 할 것
  1. 이미지 사용 권한 출처
  2. 「예시 · 거래 불가」 표기 문구
  3. 실제 판매자 UI 와의 구분 방식 (판매자명·찜·채팅 없음)
- 위 세 가지가 승인되기 전에는 착수하지 않습니다.

---

## 5. 순서·회귀 위험·검증 공통

| 순서 | 묶음 | 구분 | 회귀 위험 |
|---|---|---|---|
| 1 | G1 | 웹 | 낮음 — 판매내역 표시 대상만 |
| 2 | G2 | 웹 | 낮음 — 목록 응답 필드 축소 (소비처 grep 필수) |
| 3 | G3 | **DB (승인 필요)** | 낮음 — anon·authenticated 사용 0회. 롤백 SQL 동봉 |
| 4 | G4 | 웹 | **중간** — 6개 ROOT 등록·수정 전체 |
| 5 | G5 | 웹 | 낮음 |
| 6 | G7 | 웹 | 중간 — 예약·완료 전이 |
| 7 | G8 | 웹 | 중간 — 검색 결과 집합 변화 (계약상 의도) |
| 8 | G6 | 웹 | 낮음 — 표시만 |
| 9 | G9 | 웹 | 낮음 — 관리자 집계만 |

**공통 검증 (각 묶음마다)**
- 로컬: `typecheck:build` + 관련 vitest + 변경 파일 eslint 를 1회 실행.
- 배포: main 반영 후 Production SHA 확인. 테스트마다 SHA 를 기록하고, 다른 SHA 의 결과를 섞지 않음.
- 웹 변경은 앱 재시작으로 확인. 네이티브 빌드 없음.
- 실기기: Android·iPhone·태블릿 핵심 동작. 측정하지 못한 것은 NOT_PROVEN.
- 운영 데이터 삭제·수정 0. G3 만 Owner 승인 후 DB 정책을 적용.

## 6. Owner 승인 요청 사항
1. G1–G9 실행 승인. 부분 승인일 경우 범위를 지정해 주세요.
2. **G3 운영 DB 적용 승인** — `sold_buyer_id` 컬럼 GRANT 회수, posts 공개 SELECT 정책 교체.
3. G6 글쓰기 CTA 통일 값: 권장은 「판매하기」 + Plus 아이콘.

---

## 7. 최종 구현 상태 (2026-10-27 · Production 기준)

### 7.1 구현·반영

| 묶음 | 결함 ID | 구현 | main SHA | Production | 실동작 판정 |
|---|---|---|---|---|---|
| G1 판매자 화면 구매자 식별 | TM-01·19·20 | ✅ | `75282fd2e` | READY | 운영 영향 8행 데이터 대조 PASS (8행 모두 실제 구매자 표시) · 화면 NOT_PROVEN |
| G2 공개 응답 식별정보 | TM-02(웹)·29 | ✅ | `a68460311` | READY | **PASS** — 비로그인 목록 100건 구매자 id 0 · 좌표 0 |
| G3 DB 권한 | TM-02(DB)·03 | ✅ 운영 적용 | `f48e6b3f1` | 적용 | **PASS** — anon REST 숨김 글 0 · `sold_buyer_id` 권한 거부 · 작성자 본인 숨김 글 조회 유지 |
| G4 글쓰기·수정 | TM-04·05·06·22·26·37 | ✅ | `708d8e8de` | READY | 코드·테스트 PASS · 실동작 NOT_PROVEN |
| G5 신고 | TM-07·08·53 | ✅ | `716643305` | READY | 코드·테스트 PASS · 실동작 NOT_PROVEN |
| G7 판매 상태·채팅 진입 | TM-17·21·39 | ✅ | `395ae13ee` | READY | 코드·테스트 PASS · 실동작 NOT_PROVEN |
| G8 검색·필터 | TM-11·27·28·10b | ✅ | `c974d793c` · `8d0d8b27a`(테스트 타입) | READY | **PASS** — 거래 검색면 진입 · 시트 취소 유지 · `radius=abc`=거리 전체 |
| G6 UI·CTA | TM-09·30·34·40·43·52·54·55 | ✅ | `d14e14831` | READY | **PASS**(표시·진입·스타일 규칙) — 「판매하기」+Plus · 빈 화면 CTA → `/market/sell` · 검색 카드 도시명 |
| TM-24 검색 T5-B | TM-24 | ✅ | `6cf3cdeab` | READY | **PASS** — 카테고리 없음 `q=Toyota` 2건만 · `q=zzqqxx` 「검색 결과가 없습니다」 · ROOT 선택 시 같은 ROOT 확장 유지 |
| TM-35 초기화 구분 | TM-35 | ✅ | `6cf3cdeab` · `d15d1985f` | READY | **PASS** — 시트 「전체 초기화」 = 시트 초깃값만(URL 불변) · 취소 시 유지 · ↺ = 화면 초기화 + `q` 유지 |
| `/market/[slug]?q=` 화면 깨짐 | React #310 | ✅ | (이 문서와 같은 묶음 이후 커밋) | — | 레거시 슬러그 → `/market?category=` 를 HTTP 307(next.config)로 — §7.3 |
| G9 관리자 판정 | TM-31 | 수정 없음 | — | — | 결함 아님 → D (관리자 「예약」 탭 별도 · DB 트리거가 status·판매 단계 동기화 · 운영 불일치 0) |

### 7.2 Owner 최종 계약 판정 (2026-10-27)
- **TM-24**: T5-B 적용. 다른 ROOT 무관 매물 추가 금지, 같은 ROOT 안 확장·정렬·페이지 유지, 결과 없음 표시. `dibay-marketplace-list-ssot-target.md` §1.1 의 「still shown」 문구를 이 계약으로 정정.
- **TM-35**: ↺ = 거래 화면 필터 초기화(q 유지) · 필터 시트 「전체 초기화」 = 시트 내부 초깃값 복원 · 시트 취소 = 적용된 URL 조건 불변.
- **TM-10**: 결함 아님(LGU 중심점 거리 계약 충족) — 옵션 교체 권장 철회.

### 7.3 실제 잔여 결함·확인 결과
| 항목 | 판정 |
|---|---|
| `/market/{slug}?q=…` 첫 진입 React #310 | **재현됨 → 수정** — `/market/[slug]` 는 레거시 지원 경로(TF-3). RSC `redirect()` 가 `market/loading.tsx` 스트리밍 뒤 클라이언트 전환으로 처리돼 깨짐(제 변경 이전 배포에서도 동일). `next.config.js` HTTP 307 로 이동(sell·location·trade-meet-spot 제외, 원래 쿼리 유지) |
| CI | 거래 변경 관련 실패 없음. `8d0d8b27a` 실행의 유일한 실패는 `owner-ui-token-ratchet`(매장 오너 알림 `text-white`, 다른 세션 변경 — 해당 세션이 `5e21f74b4` 로 수정 중) |
| 로컬 vitest 7개 파일 실패 | CI 에서는 통과(2483 파일 중 실패 1 = 위 owner 건) → 로컬 Node 26 localStorage 환경 차이. 전체 테스트 PASS 로 보고하지 않음 |
| TM-25 수정 후 상세 반영 | NOT_PROVEN (재현에 작성자 로그인 필요 — S-08) |
| Realtime | NOT_PROVEN — 판매 단계 변경: 서버 private broadcast `samarket:trade-post-listing:{id}` → 채팅 화면 구독. 판매완료(seller-complete): 구매자 알림 + 홈 동기화 무효화(broadcast 없음). `posts` postgres_changes 는 publication 미포함으로 운영에서 미발화. S-14 로 판정 |
| 범위 제외 | D 16(TM-23·25·31·33·36·38·41·42·44·45·46·47·48·49·50·56) · E 1(TM-10) · F 4(TM-18·32·51·57) · 샘플 상품 — 이번 범위 제외 |

---

## 8. 실기기 검증 시나리오 — **Owner 승인 요청 초안 (승인 전 실행 금지)**

### 8.1 공통 조건
- **실행 주체**: Owner 승인 후 클라우드 Cursor 가 직접 실행. 기기 접근 불가 시 NOT_PROVEN 보고(임의 PASS 금지).
- **기기**: Android 폰 1 · iPhone 1 · 태블릿 1 (Owner 지정 기기). 설치 버전은 `public.user_devices.app_version` 으로 먼저 확인 — 웹 변경이므로 앱 재시작만, 재빌드 없음.
- **iPhone 실행 방법**: Mac 의 「iPhone 미러링」(macOS) 창으로 화면 조작 → 각 단계 스크린샷을 미러링 창에서 캡처. 미러링이 불가하면 해당 iPhone 단계는 NOT_PROVEN.
- **Android 실행 방법**: USB 연결 화면 미러링(scrcpy 등 기존 사용 경로) + 스크린샷.
- **계정**: Owner 가 지정한 계정만 사용 — **A(판매자)**, **B(구매자1)**, **C(구매자2)**, **관리자 1**. 임의 테스트 계정 생성·실사용자 계정 로그인 금지.
- **테스트 데이터**: 실제 매물·실제 사용자 데이터는 건드리지 않는다. 판매자 A 가 제목 접두 `[QA-거래검증-YYYYMMDD]` 로 새 글을 만들어 그 글만 사용. 종료 시 **복구**: A 의 「삭제」(owner_state 숨김 처리, 하드 삭제 아님), 신고는 관리자 화면에서 「처리 완료/기각」, 차단은 해제.
- **매 테스트 기록**: Production SHA · 시각(PHT) · 기기 · 계정 · 결과 스크린샷. 다른 SHA 결과를 섞지 않는다.
- **G1 운영 영향 8행**: 실사용자 판매자 계정이 필요하므로 **실기기 대상에서 제외** — 데이터 대조 PASS 로 갈음(Owner 계정이 해당 판매자인 경우에만 S-01 실행).

### 8.2 시나리오

| ID | 기기 | 계정 | 사전 데이터 | 실행 순서 | 기대 결과 | 운영 데이터 변경 · 복구 |
|---|---|---|---|---|---|---|
| S-01 | Android | A (해당 8행 판매자일 때만) | 없음 | 내정보 → 판매내역 → 각 대화의 구매자명 확인 → ⋮ 신고 시트 대상명 확인(제출 안 함) | 대화마다 실제 구매자, 신고 대상 = 그 구매자 | 없음 |
| S-02 | Android(A) · iPhone(B) · 태블릿(C) | A·B·C | QA 글 1 (A) | B·C 가 각각 상세 → 채팅하기 → A 가 글 관리 → 「구매자 선택」 목록 | B·C 모두 표시, 상태 각자 | 채팅방 2 생성 · 종료 시 QA 글 삭제 |
| S-03 | iPhone · Android | A | 없음 | 「판매하기」 → 카메라 원본 사진(iPhone HEIC · Android 12MP) 3장 → 등록 | 업로드 성공, 실패 시 「사진이 너무 커서…」 | QA 글 생성 · 종료 시 삭제 |
| S-04 | Android | A | QA 부동산 글(관리비 입력) | 수정 → 관리비 지움·프리미엄 해제 → 저장 → 상세 | 관리비·프리미엄 사라짐 | QA 글 수정 · 삭제 |
| S-05 | iPhone | A | QA 글(사진 2장) | 수정 → 사진 전부 삭제 → 저장 → 거래 홈 목록 | 썸네일 없음 | QA 글 수정 · 삭제 |
| S-06 | Android | A | QA 글(사진 A·B) | 수정 → A 를 편집기로 자르기 → 저장 | A(편집본)가 대표 | QA 글 수정 · 삭제 |
| S-07 | 태블릿 | A | QA 구인·환전 글(사진·거래장소) | 수정 → 사진 전부·거래장소 삭제 → 저장 | 삭제 반영 | QA 글 수정 · 삭제 |
| S-08 | iPhone | A | QA 글 | 제목·가격 수정 → 저장 직후 상세·뒤로 목록 | 즉시 최신 값 (지연 시 TM-25 결함 확정) | QA 글 수정 · 삭제 |
| S-09 | Android(B) · 관리자 웹 | B·관리자 | QA 글(A) | B: ⋮ 신고 → 「거래 금지 물품이에요」 → 관리자 신고 화면 사유 확인 | 사유 코드 `prohibited_item`·라벨 「거래 금지 물품」 | 신고 1건 · 관리자 「기각」 처리 |
| S-10 | iPhone(B) | B | QA 글(A) | ⋮ 신고 → 「작성자 신고하기」 → 사유 선택·제출 | 사용자 신고 시트 열림·접수 | 신고 1건 · 관리자 「기각」 |
| S-11 | Android(A) · iPhone(B) · 태블릿(C) | A·B·C | S-02 의 방 2개 | A: B 로 예약 → C: 상세 「채팅」(기존 방) → 새 계정 없음이므로 「새 문의 차단」은 C 기존 방 삭제 불가 → C 기존 방 진입만 확인 | C 기존 방 진입 가능 (TM-39) | 예약 상태 · 종료 시 QA 글 삭제 |
| S-12 | Android | A·C | QA 글 2(판매완료용) | A: 판매완료(seller-complete, 구매자 B) → C(이 글 방 없음): 상세 「채팅」 | 새 문의 차단(「판매 후 채팅 허용」 OFF 일 때) | 판매완료는 되돌릴 수 없음 → QA 글 2 삭제로 복구 |
| S-13 | Android(A) · iPhone(B) | A·B | QA 글 2 | A 판매완료 → B 구매 확정 → B 후기 작성 | 전 과정 정상 | 후기 1건(QA) · QA 글 삭제(후기는 기록 유지 — Owner 확인 필요) |
| S-14 | Android(A) · iPhone(B) 동시 | A·B | QA 글 · B 방 | B 채팅방 열어 둔 채 A 가 상태 변경(문의중→예약중) → 판매완료 | B 화면 상태 뱃지 갱신 시간 기록 (예약: 실시간 기대 · 완료: 알림/재진입 후 반영 여부) | QA 글 · 삭제 |
| S-15 | iPhone | C | 거래 채팅 없음 | 채팅 → 거래 → 빈 목록 「거래 둘러보기」 | `/market` 이동 | 없음 |
| S-16 | Android · iPhone · 태블릿 | 비로그인 | 없음 | 거래 홈 검색 `Toyota` · `zzqqxx` · 필터 시트 가격 입력 후 취소 · 「전체 초기화」 · ↺ · `/market/vehicle?q=Wigo` 직접 열기 | 웹 실측과 동일(§7.1 · §7.3) | 없음 |
| S-17 | Android · iPhone · 태블릿 | A | 없음 | 헤더 ＋ · 판매 허브 「＋ 판매하기」 · 내 상품 · 다이얼 버튼 누름 | 「판매하기」+Plus · 누름 시 진한 녹색 · 진입 정상 | 없음(글 작성 안 함) |

> S-11: 「다른 구매자 새 문의 차단」은 방이 없는 4번째 계정이 필요 — Owner 가 계정 D 를 지정하면 추가, 아니면 그 단계 NOT_PROVEN.
> S-13: 후기는 삭제 수단이 없어 운영에 남음 — 승인 시 허용 여부 결정 필요.

---

## 9. 실기기 검증 결과 (2026-10-27 16:02–16:32 PHT · Owner 승인 실행)

- **Production**: 시작 시 READY `3e597af8f` (거래 수정 전부 포함). 웹 변경이라 세 기기 앱 재시작 후 실행.
- **기기·계정**: Samsung SM-M156S = A `q테스트1` (1.2.4(13), adb + WebView 디버거) · Xiaomi 태블릿 24076RP19G = C `zxzx11` (1.2.4(13), adb) · iPhone = B `w테스트1` (iOS 1.2(15), Mac 「iPhone 미러링」).
- **데이터**: `[QA-거래검증-1027]` 글 6개(A) — 4개는 A 앱 세션의 같은 등록 API로 생성, ⑤는 Samsung 글쓰기 UI로 등록. 증거: `docs/audit/evidence/trade-device-2026-10-27/`.

| ID | 판정 | 근거 |
|---|---|---|
| S-01 | 제외 | 실사용자 판매자 계정 필요 — 운영 데이터 대조 PASS 로 갈음 |
| S-02 | **PASS** | B(iPhone)·C(태블릿) ① 문의 → A `post-buyer-chats` 2명 각각 `chatting` |
| S-03 | Samsung **PASS** / iPhone NOT_PROVEN | Samsung UI: 카메라 원본 2.36MB + 9MB(4000×3000) → 사진 2장 저장(webp 119/360KB), 썸네일=첫 장. 실제 Samsung 카메라 원본은 3.5MB 미만. iPhone 은 미러링 백그라운드 입력으로 제목 입력 불가 |
| S-04 | **PASS** | ③ 관리비 삭제·권리금 해제 저장 → `meta` 에서 `management_fee`·`has_premium` 삭제 |
| S-05 | **PASS** | ⑤ 사진 전부 삭제 → `images`·`thumbnail_url` null, 목록 카드 이미지 없음 |
| S-06 | **PASS** | ⑤ 사진1 편집(회전) → `images[0]`=새 편집본(대표·썸네일), `images[1]` 유지 |
| S-07 | 사진 삭제 **PASS** / 거래장소 삭제 NOT_PROVEN | ④ 환전 사진 삭제 → null. 환전 수정 화면에 만남 장소 입력란 없음(기존 값은 유지·손실 없음). 판매자 글이라 태블릿(C) 대신 Samsung(A)에서 실행 |
| S-08 / TM-25 | **FAIL (재현·원인 확정)** | 저장 DB 08:26:08 반영. 직후 상세·목록·상세 재진입 모두 이전 제목·가격·사진. `router.refresh()` 호출 시 즉시 최신 → 클라이언트 라우터 캐시. 수정안 = 저장 성공 시 `router.refresh()` |
| S-09 | **PASS** | B 목록 ⋮→신고→「거래 금지 물품이에요」 → `reason_code=prohibited_item` |
| S-10 | **PASS** | 「작성자 신고하기」 → 사용자 신고 시트(미선택 시 신고하기 비활성) → `target_type=user`·대상 A·`spam` |
| S-11 | **PASS** | ①·⑥ B 예약. C: 방 없는 ⑥ 「보내기」 비활성·무반응 / 기존 방 있는 ① 진입 OK + 예약 안내 |
| S-12 | **PASS** | ② seller-complete(B) 후 C 상세: 「판매완료」 뱃지 + 보내기 비활성. 판매완료는 검색 제외·「판매완료」 필터에서만 노출 |
| S-13 | **FAIL** | 메신저 거래 방에 거래 진행 영역 미마운트(NF-6) → B 「거래완료 확인」 진입 UI 없음. 후기 미확인 |
| S-14 | 예약 **PASS** / 판매완료 **FAIL** | 예약: B 열린 방에 3초 안에 「예약중으로 변경」 표시. 판매완료: B 알림(`trade_status`)은 생성됐으나 열린 방·재진입 방 모두 완료 반영 없음, 방 메뉴 상품 상태 「판매중」(NF-5) |
| S-15 | NOT_PROVEN | C 에 거래 채팅이 있어 빈 목록 상태를 만들 수 없음 |
| S-16 | **PASS** | Samsung: Toyota 2건만 · zzqqxx 「검색 결과가 없습니다」 · `/market/vehicle?q=Wigo` 정상 리다이렉트 · ↺ q 유지 · 시트 「전체 초기화」 URL 불변. 태블릿: 「거래에서 더 보기」·필터 시트 취소 유지·판매완료 필터 |
| S-17 | 부분 **PASS** | 헤더 ＋·판매 허브 「＋ 판매하기」·빈 화면 CTA PASS / 내 매물 하단 고정 「판매하기」 Plus 없음(NF-10) / 플로팅 다이얼 도달 경로 없음 NOT_PROVEN. TM-17 Production 확인: `completed` 직접 변경 400 |

### 9.1 새로 확인된 결함 후보 (이번 회차 수정 안 함 · 향후 수정 목록)

| ID | 우선 | 내용 | 증거 |
|---|---|---|---|
| NF-6 | P1 | 메신저 거래 방에 거래 진행 영역(`data-cm-trade-dock`) 미마운트 — 판매자·구매자 모두. 앱 UI 로 예약·판매완료·거래완료 확인 불가 | `sam2.jpg`, DOM 검사 0개 |
| TM-25 | P2 | 수정 직후 상세·거래 홈 목록 stale (원인 확정: 라우터 캐시) | `sam19-S08-detail.jpg` |
| NF-2 | P2 | 상세 「안녕하세요, 아직 판매 중인가요?」+「보내기」가 방만 열고 메시지 미전송 (B·C 두 방 메시지 0건) | DB |
| NF-5 | P2 | 판매완료 후 방 요약(`itemStateLabel` 「예약중」)·방 메뉴 상품 상태 「판매중」 — 완료가 방에 반영 안 됨 (S-14 완료 FAIL 과 같은 원인 후보) | `NF5-iphone-room-sheet.jpg` |
| NF-1 | P2 | [Owner 지적] iPhone 상세 「판매자에게 메시지 보내기」 카드가 화면 하단(홈 표시줄 영역)까지 내려가 판매자 행이 잘림 | `NF1-iphone-detail.jpg` |
| NF-9 | P2 | iPhone 신고 사유 전체 시트 최종 화면에서 제목 바가 상태 표시줄 아래로 밀려 ×가 배터리 옆과 겹침 | `NF9-steady.jpg` |
| NF-4 | P2 | 태블릿 가로 필터 시트 하단이 하단 탭에 가려지고 「결과 보기」가 정렬 항목 위에 겹침 | `tab20.jpg` |
| NF-7 | P3 | 판매자 본인 거래 방 안내가 「판매자 프로필 보기」 | `sam2.jpg` |
| NF-8 | P3 | 환전 수정 화면에 만남 장소 입력란 없음(안내 문구에는 언급) | — |
| NF-10 | P3 | 내 매물 하단 고정 「판매하기」에 Plus 아이콘 없음 | `sam20-dial.jpg` |
| NF-3 | 확인 필요 | B 의 ⑥ 방이 08:05:02 생성 — 해당 시각 iPhone 에서 ⑥ 을 열지 않음(조작 오입력 가능성 배제 못 함) | DB |
| 관찰 | — | 거래 홈 목록은 화면 이동만으로 갱신 안 됨(iPhone 08:07 상태 유지). 신고 제출 후 완료 안내 없음. 내 매물 목록은 즉시 최신 | — |

### 9.2 정리 (복구) 결과 — DB 대조
- QA 글 6개: 공개 노출 0 — ③④⑤ 작성자 삭제(`owner_deleted`), ①②⑥ 예약·판매완료라 삭제 불가(계약) → 작성자 숨김(`owner_hidden`).
- 테스트 신고 2건: `status=rejected` (admin_note 기재). 미처리 0.
- Samsung 기기에 추가한 테스트 사진 2장(9MB 생성 이미지·카메라 촬영 1장) 삭제 — 기존 사진 2장만 남음.
- 남는 기록: 거래 채팅방·시스템 안내·`q테스트1` 판매완료 1건(②)·B 알림 1건 (테스트 계정).
