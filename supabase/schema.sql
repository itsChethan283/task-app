create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'daily' check (category in ('daily', 'open')),
  importance integer not null default 0,
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists category text not null default 'daily';

alter table public.tasks
  add column if not exists importance integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_category_check'
  ) then
    alter table public.tasks
      add constraint tasks_category_check check (category in ('daily', 'open'));
  end if;
end $$;

alter table public.tasks enable row level security;

drop policy if exists "Users can read own tasks" on public.tasks;
drop policy if exists "Users can insert own tasks" on public.tasks;
drop policy if exists "Users can update own tasks" on public.tasks;
drop policy if exists "Users can delete own tasks" on public.tasks;

create policy "Users can read own tasks"
on public.tasks
for select
using (auth.uid() = user_id);

create policy "Users can insert own tasks"
on public.tasks
for insert
with check (auth.uid() = user_id);

create policy "Users can update own tasks"
on public.tasks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own tasks"
on public.tasks
for delete
using (auth.uid() = user_id);
