# S7 — 어드민 등록 이름 영어 · DB 함수 문장 (2026-11-08)

> 언어 SSOT S7. 코드 부분(영어 이름 필수)은 main 반영. **운영 DB 데이터·함수 변경은 Owner 승인 후(S7-DB)** — 이 문서는 제안·설계다. 운영 DB 는 읽기 전용으로만 조회했다(`ckdosyydvgzqwpbwuhon`, 2026-11-08 PHT).

## 1. 코드 반영 (이번 단계)

| 항목 | 내용 |
|---|---|
| 규칙 단일 정의 | `lib/i18n/admin-name-en-contract.ts` — 새로 만들 때 영어 이름 필수 · 있던 영어 이름 비우기 거부 · 영어 이름 없이 한국어 이름 바꾸기 거부 · 노출/순서만 바꾸는 저장(행 전체 재전송 포함)은 통과 |
| 적용 API | 커뮤니티 주제 만들기·수정, 거래 카테고리 만들기·수정, 매장 업종/주제/세부 만들기·수정 — 오류 코드 `name_en_required` |
| 오류 문구 | 공용 어드민 오류 문구(`adminOperatorErrorMessage`)·거래 카테고리 오류 표에 `admin_name_en_required` |
| 거래 카테고리 어드민 폼 | **영어 이름 입력이 아예 없었음**(만들기 시 `name_en: null` 고정) — 상위·하위 만들기·수정에 영어 이름 입력 추가 |
| 매장 업종 기본 시드 | 시드 데이터에 영어 이름이 있는데 저장 시 `name_en` 을 빼고 있었음 → 운영 업종 8개 영어 이름 빈 값의 원인. 시드가 영어 이름도 저장하도록 수정(시드는 어드민이 실행할 때만 동작 — 운영 데이터 변화 없음) |

## 2. 영어 이름이 빈 운영 행 19개 — 제안 (Owner 결정 ③)

「지금 영어 화면」 = 이번 조회 시점에 영어 화면에 실제로 나오는 값(코드로 확인).

| 표 | slug | 한국어 | 지금 영어 화면 | 제안 영어 이름 |
|---|---|---|---|---|
| categories | trade | 중고거래 | General | **Used goods** |
| categories | vehicle | 중고차 | Used cars | Used cars |
| categories | property | 부동산 | Real estate | Real estate |
| categories | current (비활성) | 환전거래 | Currency exchange | Currency exchange |
| categories | hiring | 일자리 | Jobs | Jobs |
| community_topics | recommended | 추천 | Topic | **Recommended** |
| community_topics | phlifee | 필리핀생할 (오타 — 생활) | Topic | **Life in the Philippines** |
| community_topics | travel | 여행정보 | Topic | **Travel tips** |
| community_topics | dailylife | 일상생활 | Topic | **Daily life** |
| community_topics | question | 질문있어요 | Questions | Questions |
| community_topics | news | 필리핀 뉴스 | Topic | **Philippines news** |
| store_categories | restaurant | 식당 | Restaurant | Restaurant (시드 값 — 화면 변화 없음) |
| store_categories | mart | 마트 | Mart | Mart |
| store_categories | hardware | 공구류 | Hardware | Hardware |
| store_categories | pet | 펫샵 | Pet shop | Pet shop |
| store_categories | cafe | 카페 | Cafe | Cafe |
| store_categories | beauty | 미용 | Beauty | Beauty |
| store_categories | academy | 학원 | Academy | Academy |
| store_categories | life | 서비스 | Services | Services |

적용 SQL (승인 후 — 빈 값인 행만 바꿈, 실행 전 백업·후 대조):

```sql
-- 백업
create table if not exists _i18n_s7_name_en_backup as
  select 'categories' t, id, slug, name_en from categories where coalesce(trim(name_en),'')=''
  union all select 'community_topics', id, slug, name_en from community_topics where coalesce(trim(name_en),'')=''
  union all select 'store_categories', id, slug, name_en from store_categories where coalesce(trim(name_en),'')='';
-- 적용
update categories c set name_en = v.en from (values
  ('trade','Used goods'),('vehicle','Used cars'),('property','Real estate'),('current','Currency exchange'),('hiring','Jobs')
) v(slug,en) where c.slug=v.slug and coalesce(trim(c.name_en),'')='';
update community_topics c set name_en = v.en from (values
  ('recommended','Recommended'),('phlifee','Life in the Philippines'),('travel','Travel tips'),('dailylife','Daily life'),('question','Questions'),('news','Philippines news')
) v(slug,en) where c.slug=v.slug and coalesce(trim(c.name_en),'')='';
update store_categories c set name_en = v.en from (values
  ('restaurant','Restaurant'),('mart','Mart'),('hardware','Hardware'),('pet','Pet shop'),('cafe','Cafe'),('beauty','Beauty'),('academy','Academy'),('life','Services')
) v(slug,en) where c.slug=v.slug and coalesce(trim(c.name_en),'')='';
```

보고만: 커뮤니티 주제 이름 「필리핀생할」 오타(생활), slug `phlifee` 오타.

## 3. DB 함수 안 한국어 문장 — 37개 분류

| 분류 | 함수 | 화면 노출 (근거) | 처리안 (S7-DB) |
|---|---|---|---|
| 메신저 목록 토큰 | `dibay_append_room_message_atomic`(사진·파일), `community_messenger_send_text_message`(사용자·시스템·삭제된 메시지) | 화면은 메시지 종류로 다시 번역해 그림 — `room-list-semantic-preview.ts` 가 「사진」「파일」을 **언어 무관 토큰**으로 정의, `cm-home-list-copy.ts` 가 종류별 키로 표시 | 토큰 유지(문구 아님). 영어 화면 실기 확인 필요 → NOT_PROVEN |
| 메신저 답장 인용 | `cm_scrub_reply_previews_on_delete_for_everyone`(「삭제된 메시지입니다」를 답장 인용 미리보기에 저장) | 타임라인은 삭제 여부(`deletedForEveryoneAt`)로 그리지만 **답장 인용 미리보기 문자열의 영어 화면 표시는 확인 못 함** → NOT_PROVEN | 인용 미리보기에 문장 대신 「삭제됨」 표시값(코드) 저장 + 클라이언트 키 표시. 메신저 계약 변경이라 별도 승인 |
| 포인트 원장 설명 | `apple_iap_credit`, `apple_iap_admin_decide_refund`, `approve_user_point_charge_request`, `apply_community_point_reward/reclaim`, `purchase_member_community_promotion`, `purchase_member_content_promotion`, `member_feed_ad_renew`, `refund_post_ad_points`, `request_trade_promotion_review`, `trade_promotion_sync_listing`, `admin_*_end`·`admin_trade_promotion_*`·`admin_reject_feed_ad_request`, `admin_run_point_expire` | 고객 포인트 내역은 **종류 키**(`point_fin_cat_*`)로 그리고 원장 설명 문장은 쓰지 않음(`PointFinancialHistoryList`) — 어드민 원장 화면 표시 여부 NOT_PROVEN | 설명은 기록용으로 유지, 화면은 종류 키만(현행). 어드민 화면이 설명을 그대로 쓰면 S9 |
| 구매자 표시 이름 | `owner_orders_list_buyer_public_label`(「사마켓 회원」 — **구 브랜드명**) | 매장 후기·사장님 주문 채팅 API 가 `buyer_public_label` 로 내려보냄 → 영어 화면에도 한국어·구 브랜드명 | 함수가 빈 값/코드를 돌려주고 화면이 키(`DIBAY 회원`/`DIBAY member`)로 표시 — **승인 필요** |
| 글 제목 기본값 | `ensure_community_post_for_post_ads`(「(제목 없음)」 저장) | 저장된 글 제목이라 모든 언어에 그대로 보임 | 빈 제목 저장 + 화면에서 키로 대체(코드에도 같은 문자열 2곳 — `community-paid-exposure-feed.ts`, `post-ad-application-adapter.ts`) |
| 어드민 전용 | `admin_ads_history_page`, `admin_ads_map_raw_ops`, `admin_decide_trade_report`, `admin_delivery_*`, `admin_notification_replay_support_replies`, `admin_trade_region_stats`, `store_commission_*`(어드민 알림 문장) | 어드민 화면 | S9(어드민 영어)와 함께 |

## 4. 남은 위험

- 2·3 은 운영 DB 변경 — **Owner 승인 전 적용하지 않음**.
- 메신저·포인트 화면이 DB 문장을 쓰지 않는다는 판단은 코드 확인까지만(실기 영어 화면 NOT_PROVEN).

## 5. 적용 기록 — 빈 영어 이름 19개 (Owner 「제안대로 적용」, 2026-11-08 16:0x PHT)

| 단계 | 결과 |
|---|---|
| 적용 전 재확인 | 빈 값 categories 5 · community_topics 6 · store_categories 8 = 19 (제안과 같음). 트리거는 `updated_at` 자동 갱신뿐 |
| 백업 | `public._i18n_s7_name_en_backup` — 19행 전체 열(jsonb), RLS 켬 |
| 시험 조회 | 19개 slug 각각 정확히 1행, 모두 백업에 있음 |
| 적용 | 한 트랜잭션, 백업에 있는 행 중 아직 빈 값만, 5·6·8 이 아니면 전체 취소하도록 — 5·6·8 적용, 빈 값 0·0·0 |
| 전후 대조(열 단위) | 바뀐 열 = `name_en` 19행 + `updated_at` 14행(주제·업종 트리거) — **그 외 열 변경 0**. 값 19개 제안과 동일 |
| 운영 화면 | **FAIL — 커뮤니티 주제**: 운영 `/api/philife/neighborhood-topic-options` 가 여전히 `name_en: null`(엣지 캐시 MISS 에서도). 원인 = 피드 주제 RPC `philife_list_default_section_topics_for_feed` 가 `name_en` 열을 고르지 않음(원래 영어 이름이 있던 맛집·골프·유머도 같음). 수정 마이그레이션 `20271108160000_philife_topics_for_feed_name_en.sql`(열 1개 추가) — **운영 적용 Owner 승인 필요** |
| 운영 화면 — 거래 카테고리·매장 업종 | 거래 카테고리 조회는 `name_en` 포함(코드 확인), 매장 업종은 지금 영어 화면 값과 같은 이름이라 화면 변화 없음. 실제 영어 화면 확인은 NOT_PROVEN(이 브라우저는 로그인 계정 언어가 한국어 — 계정 설정은 바꾸지 않음) |
| 되돌리기 | `update <표> set name_en = (b.row_before->>'name_en') from _i18n_s7_name_en_backup b where b.t='<표>' and <표>.id::text=b.id;` |
