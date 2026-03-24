# 마이페이지 테스트 체크리스트

## CASE 1: 일반 유저 로그인 → 관리자 버튼 안 보임

1. `lib/auth/get-current-user.ts`에서 `getCurrentUser()` 반환 객체의 `email`을 `"user@example.com"` 등으로 변경
2. `/mypage/settings` 접속
3. **확인**: 페이지 최하단에 "관리자 접속" 버튼이 **노출되지 않음**

---

## CASE 2: 관리자 이메일 로그인 → 설정 하단에 관리자 버튼 노출

1. `getCurrentUser()`의 `email`이 `"im2pact@gmail.com"`인지 확인
2. `/mypage/settings` 접속
3. **확인**: 페이지 최하단에 "관리자 접속" 버튼이 **노출됨**
4. **확인**: 클릭 시 `/admin`으로 이동

---

## CASE 3: 프로필 클릭 → 프로필 페이지 이동

1. `/mypage` 접속
2. 상단 프로필 카드(프로필 이미지·닉네임·매너온도) 클릭
3. **확인**: `/mypage/profile`로 이동

---

## CASE 4: 설정 클릭 → /mypage/settings 정상 이동

1. `/mypage` 접속
2. 우측 상단 설정(톱니) 아이콘 클릭
3. **확인**: `/mypage/settings`로 이동

---

## CASE 5: 각 메뉴 클릭 → 라우팅 정상 작동

| 메뉴 | 기대 경로 |
|------|-----------|
| 관심목록 | `/my/favorites` |
| 최근 본 글 | `/my/recent-viewed` |
| 혜택 | `/my/benefits` |
| 판매관리 | `/my/products` |
| 비즈프로필 관리 | `/my/business` |
| 광고 | `/my/ads` |
| 차단한 사용자 | `/my/blocked-users` |
| 내 동네생활 글 | `/mypage/community-posts` |
| 카마켓페이 카드 | `/mypage/kamarket-pay` |
| 서비스 그리드(중고거래 등) | 각 href 대로 |

---

## CASE 6: 모바일 화면 → 깨짐 없이 출력

1. 브라우저 개발자 도구에서 모바일 뷰포트(375px 등)로 전환
2. `/mypage`, `/mypage/settings`, `/mypage/profile` 확인
3. **확인**: 레이아웃 깨짐 없음, 카드·리스트 가독성 유지

---

## CASE 7: 데이터 없음 상태 → fallback UI 표시

1. `getCurrentUser()`가 `null`을 반환하도록 수정
2. `/mypage` 접속
3. **확인**: 프로필 영역에 "로그인해 주세요" 등 fallback 문구 표시
4. `/mypage/profile` 접속
5. **확인**: "로그인해 주세요" 및 마이페이지로 링크 표시
