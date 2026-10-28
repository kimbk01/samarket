/**
 * 샘플 상품 글 모양 (Owner 2026-10-28 「샘플도 실제 거래 게시물 형태」) — sort_order → posts 와 같은 형식의 지역·meta.
 * 운영 `trade_showcase_items` 의 sort_order 200~295 행(주제 6 × 10건)과 짝이다. 화면은 이 값으로 실제 카드(PostCard)를 그린다.
 * 어드민이 새로 만든 샘플(번호 없음)은 `trade-showcase-post.ts` 의 기본값을 쓴다.
 */
export type TradeShowcaseListing = {
  trade_lgu_id: string;
  region: string;
  city: string;
  meta: Record<string, unknown>;
};

export const TRADE_SHOWCASE_LISTINGS: Readonly<Record<number, TradeShowcaseListing>> = {
  200: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m39", "meta": {}},
  210: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q1", "meta": {}},
  220: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m21", "meta": {}},
  230: {"trade_lgu_id": "1381500000", "region": "manila", "city": "m18", "meta": {}},
  240: {"trade_lgu_id": "1380500000", "region": "manila", "city": "m23", "meta": {}},
  250: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q9", "meta": {}},
  260: {"trade_lgu_id": "1380600000", "region": "manila", "city": "m1", "meta": {}},
  270: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m20", "meta": {}},
  280: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q4", "meta": {}},
  290: {"trade_lgu_id": "1381000000", "region": "manila", "city": "m25", "meta": {}},
  201: {"trade_lgu_id": "1380600000", "region": "manila", "city": "m3", "meta": {"car_trade": "sell", "car_model": "Toyota Vios 1.3 E AT", "car_year": "2019", "mileage": "52000", "has_accident": false}},
  211: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m40", "meta": {"car_trade": "sell", "car_model": "Honda City RS", "car_year": "2021", "mileage": "31000", "has_accident": false}},
  221: {"trade_lgu_id": "0730600000", "region": "cebu", "city": "c1", "meta": {"car_trade": "sell", "car_model": "Mitsubishi Mirage G4", "car_year": "2018", "mileage": "68000", "has_accident": false}},
  231: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m20", "meta": {"car_trade": "sell", "car_model": "Ford Ranger XLT 4x2", "car_year": "2020", "mileage": "64000", "has_accident": false}},
  241: {"trade_lgu_id": "1381000000", "region": "manila", "city": "m25", "meta": {"car_trade": "sell", "car_model": "Toyota Rush G AT", "car_year": "2022", "mileage": "22000", "has_accident": false}},
  251: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q1", "meta": {"car_trade": "sell", "car_model": "Toyota Fortuner G", "car_year": "2019", "mileage": "71000", "has_accident": false}},
  261: {"trade_lgu_id": "1381500000", "region": "manila", "city": "m18", "meta": {"car_trade": "sell", "car_model": "Mitsubishi Montero Sport", "car_year": "2018", "mileage": "85000", "has_accident": false}},
  271: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m39", "meta": {"car_trade": "sell", "car_model": "Honda Civic RS Turbo", "car_year": "2020", "mileage": "40000", "has_accident": false}},
  281: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q3", "meta": {"car_trade": "sell", "car_model": "Hyundai Accent 1.4", "car_year": "2017", "mileage": "90000", "has_accident": false}},
  291: {"trade_lgu_id": "0730600000", "region": "cebu", "city": "c3", "meta": {"car_trade": "sell", "car_model": "Nissan Navara VE", "car_year": "2019", "mileage": "76000", "has_accident": false}},
  202: {"trade_lgu_id": "1381500000", "region": "manila", "city": "m18", "meta": {"deal_type": "임대", "estate_type": "콘도", "size_sq": "52", "room_count": "1", "bathroom_count": "1", "building_name": "One Serendra 1BR", "move_in_date": "즉시입주", "direct_deal": true, "deposit": "90,000", "monthly": "45,000"}},
  212: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m40", "meta": {"deal_type": "판매", "estate_type": "콘도", "size_sq": "24", "room_count": "0", "bathroom_count": "1", "building_name": "Avida Towers 스튜디오", "move_in_date": "즉시입주", "direct_deal": true}},
  222: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q4", "meta": {"deal_type": "임대", "estate_type": "주택", "size_sq": "120", "room_count": "3", "bathroom_count": "2", "building_name": "Katipunan 2층 주택", "move_in_date": "즉시입주", "direct_deal": true, "deposit": "76,000", "monthly": "38,000"}},
  232: {"trade_lgu_id": "0730600000", "region": "cebu", "city": "c3", "meta": {"deal_type": "임대", "estate_type": "콘도", "size_sq": "22", "room_count": "1", "bathroom_count": "1", "building_name": "IT Park 원룸", "move_in_date": "즉시입주", "direct_deal": true, "deposit": "36,000", "monthly": "18,000"}},
  242: {"trade_lgu_id": "1381000000", "region": "manila", "city": "m25", "meta": {"deal_type": "판매", "estate_type": "주택", "size_sq": "110", "room_count": "3", "bathroom_count": "2", "building_name": "BF Homes 타운하우스", "move_in_date": "즉시입주", "direct_deal": true}},
  252: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m39", "meta": {"deal_type": "판매", "estate_type": "콘도", "size_sq": "78", "room_count": "2", "bathroom_count": "2", "building_name": "Rockwell 2BR 콘도", "move_in_date": "즉시입주", "direct_deal": true}},
  262: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m20", "meta": {"deal_type": "임대", "estate_type": "상가", "size_sq": "80", "room_count": "0", "bathroom_count": "1", "building_name": "Ortigas 사무실", "move_in_date": "즉시입주", "direct_deal": true, "deposit": "120,000", "monthly": "60,000"}},
  272: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m21", "meta": {"deal_type": "임대", "estate_type": "콘도", "size_sq": "40", "room_count": "1", "bathroom_count": "1", "building_name": "Kapitolyo 1BR 콘도", "move_in_date": "즉시입주", "direct_deal": true, "deposit": "50,000", "monthly": "25,000"}},
  282: {"trade_lgu_id": "1380500000", "region": "manila", "city": "m23", "meta": {"deal_type": "판매", "estate_type": "콘도", "size_sq": "36", "room_count": "1", "bathroom_count": "1", "building_name": "Shaw 고층 콘도", "move_in_date": "즉시입주", "direct_deal": true}},
  292: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q9", "meta": {"deal_type": "임대", "estate_type": "콘도", "size_sq": "60", "room_count": "2", "bathroom_count": "1", "building_name": "Eastwood 2BR 콘도", "move_in_date": "즉시입주", "direct_deal": true, "deposit": "70,000", "monthly": "35,000"}},
  203: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m39", "meta": {"exchange_direction": "sell", "from_currency": "PHP", "to_currency": "KRW", "amount": 20000, "exchange_rate": 23.6, "exchange_rate_base": 23.6, "exchange_rate_plus": 0, "converted_amount": 472000}},
  213: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q1", "meta": {"exchange_direction": "buy", "from_currency": "PHP", "to_currency": "KRW", "amount": 50000, "exchange_rate": 23.4, "exchange_rate_base": 23.4, "exchange_rate_plus": 0, "converted_amount": 1170000}},
  223: {"trade_lgu_id": "1381500000", "region": "manila", "city": "m18", "meta": {"exchange_direction": "sell", "from_currency": "PHP", "to_currency": "KRW", "amount": 100000, "exchange_rate": 23.7, "exchange_rate_base": 23.7, "exchange_rate_plus": 0, "converted_amount": 2370000}},
  233: {"trade_lgu_id": "0730600000", "region": "cebu", "city": "c1", "meta": {"exchange_direction": "buy", "from_currency": "PHP", "to_currency": "KRW", "amount": 30000, "exchange_rate": 23.5, "exchange_rate_base": 23.5, "exchange_rate_plus": 0, "converted_amount": 705000}},
  243: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m20", "meta": {"exchange_direction": "sell", "from_currency": "PHP", "to_currency": "KRW", "amount": 15000, "exchange_rate": 23.6, "exchange_rate_base": 23.6, "exchange_rate_plus": 0, "converted_amount": 354000}},
  253: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m40", "meta": {"exchange_direction": "buy", "from_currency": "PHP", "to_currency": "KRW", "amount": 80000, "exchange_rate": 23.3, "exchange_rate_base": 23.3, "exchange_rate_plus": 0, "converted_amount": 1864000}},
  263: {"trade_lgu_id": "1381000000", "region": "manila", "city": "m25", "meta": {"exchange_direction": "sell", "from_currency": "PHP", "to_currency": "KRW", "amount": 40000, "exchange_rate": 23.65, "exchange_rate_base": 23.65, "exchange_rate_plus": 0, "converted_amount": 946000}},
  273: {"trade_lgu_id": "1380600000", "region": "manila", "city": "m1", "meta": {"exchange_direction": "buy", "from_currency": "PHP", "to_currency": "KRW", "amount": 10000, "exchange_rate": 23.4, "exchange_rate_base": 23.4, "exchange_rate_plus": 0, "converted_amount": 234000}},
  283: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q9", "meta": {"exchange_direction": "sell", "from_currency": "PHP", "to_currency": "KRW", "amount": 60000, "exchange_rate": 23.7, "exchange_rate_base": 23.7, "exchange_rate_plus": 0, "converted_amount": 1422000}},
  293: {"trade_lgu_id": "1380500000", "region": "manila", "city": "m23", "meta": {"exchange_direction": "buy", "from_currency": "PHP", "to_currency": "KRW", "amount": 25000, "exchange_rate": 23.5, "exchange_rate_base": 23.5, "exchange_rate_plus": 0, "converted_amount": 587500}},
  204: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m39", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "monthly", "pay_amount": 18000, "work_category": "매장관리/판매", "work_term": "long", "same_day_pay": false}},
  214: {"trade_lgu_id": "1381500000", "region": "manila", "city": "m18", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "monthly", "pay_amount": 30000, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  224: {"trade_lgu_id": "0730600000", "region": "cebu", "city": "c1", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "hourly", "pay_amount": 500, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  234: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m20", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "daily", "pay_amount": 700, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  244: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q4", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "monthly", "pay_amount": 16000, "work_category": "매장관리/판매", "work_term": "long", "same_day_pay": false}},
  254: {"trade_lgu_id": "1380600000", "region": "manila", "city": "m3", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "daily", "pay_amount": 610, "work_category": "매장관리/판매", "work_term": "long", "same_day_pay": false}},
  264: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m40", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "monthly", "pay_amount": 17000, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  274: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q9", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "monthly", "pay_amount": 35000, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  284: {"trade_lgu_id": "1381000000", "region": "manila", "city": "m25", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "daily", "pay_amount": 800, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  294: {"trade_lgu_id": "1381600000", "region": "manila", "city": "m32", "meta": {"listing_kind": "hire", "job_type": "hire", "pay_type": "daily", "pay_amount": 650, "work_category": "기타", "work_term": "long", "same_day_pay": false}},
  205: {"trade_lgu_id": "1380600000", "region": "manila", "city": "m3", "meta": {"car_model": "Toyota Innova", "car_year": "2022", "daily_price": "2,500", "with_driver": true, "direct_deal": true}},
  215: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m39", "meta": {"car_model": "Toyota Vios", "car_year": "2021", "daily_price": "1,500", "with_driver": false, "direct_deal": true}},
  225: {"trade_lgu_id": "0730600000", "region": "cebu", "city": "c3", "meta": {"car_model": "Hyundai Staria", "car_year": "2023", "daily_price": "5,500", "with_driver": true, "direct_deal": true}},
  235: {"trade_lgu_id": "1380300000", "region": "manila", "city": "m40", "meta": {"car_model": "Honda Click 125", "car_year": "2022", "daily_price": "400", "with_driver": false, "direct_deal": true}},
  245: {"trade_lgu_id": "1381200000", "region": "manila", "city": "m20", "meta": {"car_model": "Ford Ranger", "car_year": "2021", "daily_price": "3,000", "with_driver": false, "direct_deal": true}},
  255: {"trade_lgu_id": "1381500000", "region": "manila", "city": "m18", "meta": {"car_model": "Toyota Fortuner", "car_year": "2022", "daily_price": "3,800", "with_driver": false, "direct_deal": true}},
  265: {"trade_lgu_id": "1381100000", "region": "manila", "city": "m36", "meta": {"car_model": "Toyota Hiace GL Grandia", "car_year": "2021", "daily_price": "4,500", "with_driver": true, "direct_deal": true}},
  275: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q1", "meta": {"car_model": "Mitsubishi Xpander", "car_year": "2022", "daily_price": "2,200", "with_driver": false, "direct_deal": true}},
  285: {"trade_lgu_id": "1381000000", "region": "manila", "city": "m25", "meta": {"car_model": "Honda Rebel 500", "car_year": "2022", "daily_price": "900", "with_driver": false, "direct_deal": true}},
  295: {"trade_lgu_id": "1381300000", "region": "quezon", "city": "q3", "meta": {"car_model": "Toyota Wigo", "car_year": "2022", "daily_price": "1,200", "with_driver": false, "direct_deal": true}},
};
