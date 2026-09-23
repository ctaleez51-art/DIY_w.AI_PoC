-- 사업장 — 반드시 채워야 하는 칸 정하기
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번에 실행한다.
--
-- 정한 것 (2026-09-13) — 사용자: "여기 있는 정보는 다 필수야"
--   과세유형 · 등록번호 · 상호 · 성명 · 개업 연월일 · 사업장 소재지 · 공동사업자  → 반드시
--   업태 · 종목                → 최소 한 줄 (줄 추가해놓고 비운 줄은 화면에서 버린다)
--   사업자 단위 과세           → 예 / 아니오 중 하나를 반드시 고른다


-- ------------------------------------------------------------
-- 1. 먼저 걸림돌 치우기
-- ------------------------------------------------------------
-- 이미 저장된 줄 중에 아래를 어기는 것이 있으면 "비면 안 됨"을 걸 수 없다.
-- ⚠️ 지우는 것은 조건을 어기는 줄뿐이다.

delete from public.businesses
where tax_type   is null
   or owner_name is null
   or opened_on  is null
   or address    is null
   or co_owners  is null
   or unit_tax   is null
   or jsonb_array_length(industries) = 0;


-- ------------------------------------------------------------
-- 2. 비면 안 되는 칸
-- ------------------------------------------------------------
-- (등록번호 biz_no, 상호 name 은 01_tables.sql 에서 이미 not null 이다)

alter table public.businesses alter column tax_type   set not null;
alter table public.businesses alter column owner_name set not null;
alter table public.businesses alter column opened_on  set not null;
alter table public.businesses alter column address    set not null;
alter table public.businesses alter column co_owners  set not null;
alter table public.businesses alter column unit_tax   set not null;


-- ------------------------------------------------------------
-- 3. 업태·종목은 최소 한 줄
-- ------------------------------------------------------------
-- industries 는 [] 도 값이라 not null 로는 못 막는다. 줄 수를 따로 본다.

alter table public.businesses drop constraint if exists industries_at_least_one;

alter table public.businesses
  add constraint industries_at_least_one
  check (jsonb_array_length(industries) >= 1);
