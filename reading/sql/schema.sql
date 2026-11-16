-- 채윤 독서생활 · Supabase 테이블 생성
-- Supabase 대시보드 → SQL Editor → New query 에 통째로 붙여넣고 Run 하세요.

create table if not exists public.books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null,
  author       text not null default '',
  cover_url    text,
  isbn         text,
  category     text not null default '비문학',
  status       text not null default 'reading' check (status in ('reading','done','wish')),
  total_pages  int,
  started_at   date,
  finished_at  date,
  created_at   timestamptz not null default now()
);

create table if not exists public.reading_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id     uuid not null references public.books(id) on delete cascade,
  log_date    date not null default current_date,
  page_from   int,
  page_to     int,
  pages_read  int not null default 0,
  quote       text,      -- 필사
  thought     text,      -- 내 생각
  created_at  timestamptz not null default now()
);

create index if not exists reading_logs_date_idx on public.reading_logs (user_id, log_date);
create index if not exists reading_logs_book_idx on public.reading_logs (book_id);

-- 내 데이터는 나만 볼 수 있게 (깃허브에 공개해도 안전하도록)
alter table public.books         enable row level security;
alter table public.reading_logs  enable row level security;

drop policy if exists "own books"  on public.books;
drop policy if exists "own logs"   on public.reading_logs;

create policy "own books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own logs" on public.reading_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
