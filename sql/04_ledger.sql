-- 간편장부 줄 + 접근제한(RLS)
--
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번에 실행한다.
-- 칸 이름은 국세청 간편장부 서식의 8개 항목을 그대로 옮겼다.

create table if not exists public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  business_id   uuid not null
                references public.businesses(id) on delete cascade,

  entry_date    date not null,                  -- ① 일자
  account       text,                           -- ② 계정과목 (이번 버전에서는 비운다)
  description   text,                           -- ③ 거래내용
  partner       text,                           -- ④ 거래처

  income_amount   numeric,                      -- ⑤ 수입 금액
  income_vat      numeric,                      -- ⑤ 수입 부가세
  expense_amount  numeric,                      -- ⑥ 비용 금액
  expense_vat     numeric,                      -- ⑥ 비용 부가세
  asset_amount    numeric,                      -- ⑦ 유형자산 증감 금액
  asset_vat       numeric,                      -- ⑦ 유형자산 증감 부가세

  note          text,                           -- ⑧ 비고 (증빙종류)

  created_at    timestamptz not null default now()
);

-- 사업장별로 날짜순 조회가 잦다
create index if not exists ledger_entries_business_date_idx
  on public.ledger_entries (business_id, entry_date);

alter table public.ledger_entries enable row level security;

create policy "본인 장부만 조회"
  on public.ledger_entries for select
  using (auth.uid() = user_id);

create policy "본인 장부만 등록"
  on public.ledger_entries for insert
  with check (auth.uid() = user_id);

create policy "본인 장부만 삭제"
  on public.ledger_entries for delete
  using (auth.uid() = user_id);

-- 수정(update) 정책은 일부러 만들지 않았다.
-- PRD 7번 2항 — 간편장부 내용의 수동 입력·수정·삭제는 이번 버전에서 만들지 않는다.
-- 삭제를 연 것은 다시 저장할 때 예전 줄을 걷어내기 위해서다.
