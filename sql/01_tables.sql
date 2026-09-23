-- 개인정보 · 사업장 테이블 + 접근제한(RLS)
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번에 실행한다.
-- 칸 이름은 종합소득세 신고서 인적사항과 사업자등록증에 적힌 것을 그대로 옮겼다.


-- ============================================================
-- 1. 개인정보 (신고하는 사람) — 한 사람당 한 줄
-- ============================================================
-- 이번 MVP 에서는 화면에 칸만 그려두고 값은 넣지 않는다.

create table if not exists public.profiles (
  user_id       uuid primary key default auth.uid()
                references auth.users(id) on delete cascade,

  name          text,   -- ① 성명
  rrn           text,   -- ② 주민등록번호
  address       text,   -- ③ 주소
  phone_home    text,   -- 일반전화
  phone_mobile  text,   -- ⑥ 휴대전화
  book_duty     text,   -- ⑧ 기장의무
  report_type   text,   -- ⑨ 신고유형
  report_kind   text,   -- ⑩ 신고구분
  tax_office    text,   -- 관할세무서
  local_gov     text,   -- 관할지자체

  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "본인 개인정보만 조회"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "본인 개인정보만 등록"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "본인 개인정보만 수정"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "본인 개인정보만 삭제"
  on public.profiles for delete
  using (auth.uid() = user_id);


-- ============================================================
-- 2. 사업장
-- ============================================================

create table if not exists public.businesses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,

  tax_type    text,                                  -- 과세유형
  biz_no      text not null,                         -- 등록번호
  name        text not null,                         -- 상호
  owner_name  text,                                  -- 성명
  opened_on   date,                                  -- 개업 연월일
  address     text,                                  -- 사업장 소재지
  industries  jsonb not null default '[]'::jsonb,    -- 업태/종목 (여러 줄)
  co_owners   text,                                  -- 공동사업자
  unit_tax    boolean,                               -- 사업자 단위 과세 적용사업자 여부

  created_at  timestamptz not null default now()
);

alter table public.businesses enable row level security;

create policy "본인 사업장만 조회"
  on public.businesses for select
  using (auth.uid() = user_id);

create policy "본인 사업장만 등록"
  on public.businesses for insert
  with check (auth.uid() = user_id);

create policy "본인 사업장만 수정"
  on public.businesses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "본인 사업장만 삭제"
  on public.businesses for delete
  using (auth.uid() = user_id);


-- PRD 7번 2항 "수동 입력, 수정, 삭제 기능"은 **간편장부 내용**을 사람이 손대는 것을 말한다.
-- 개인정보·사업장에는 해당되지 않는다. 그래서 둘 다 조회·등록·수정·삭제를 모두 연다.
