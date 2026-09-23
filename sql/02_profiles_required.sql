-- 개인정보 — 반드시 채워야 하는 칸 정하기
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번에 실행한다.
-- 01_tables.sql 을 이미 실행한 뒤에 돌리는 것이다.
--
-- 정한 것 (2026-09-13)
--   성명 · 주민등록번호 · 주소          → 반드시
--   기장의무 · 신고유형 · 신고구분      → 반드시
--   일반전화 · 휴대전화                 → 둘 중 하나만 있으면 됨
--   관할세무서 · 관할지자체             → 비워도 됨 (나중에 주소를 보고 자동으로 채울 것이다)


-- ------------------------------------------------------------
-- 1. 먼저 걸림돌 치우기
-- ------------------------------------------------------------
-- 이미 저장된 줄 중에 아래 조건을 어기는 것이 있으면 "비면 안 됨"을 걸 수 없다.
-- 서버가 "지금 있는 줄부터 어기고 있다"며 거절한다. 그래서 그 줄을 먼저 지운다.
--
-- ⚠️ 지우는 것은 조건을 어기는 줄뿐이다. 다 채워진 줄은 그대로 남는다.

delete from public.profiles
where name        is null
   or rrn         is null
   or address     is null
   or book_duty   is null
   or report_type is null
   or report_kind is null
   or (phone_home is null and phone_mobile is null);


-- ------------------------------------------------------------
-- 2. 비면 안 되는 칸
-- ------------------------------------------------------------

alter table public.profiles alter column name        set not null;
alter table public.profiles alter column rrn         set not null;
alter table public.profiles alter column address     set not null;
alter table public.profiles alter column book_duty   set not null;
alter table public.profiles alter column report_type set not null;
alter table public.profiles alter column report_kind set not null;


-- ------------------------------------------------------------
-- 3. 전화는 둘 중 하나
-- ------------------------------------------------------------
-- 칸 하나만 보는 not null 로는 "둘 중 하나"를 말할 수 없다.
-- 두 칸을 같이 보는 조건(check)을 따로 붙인다.

alter table public.profiles drop constraint if exists 전화_둘중_하나;

alter table public.profiles
  add constraint 전화_둘중_하나
  check (phone_home is not null or phone_mobile is not null);
