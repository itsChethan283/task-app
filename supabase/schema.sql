create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'daily' check (category = 'daily'),
  importance integer not null default 0,
  is_complete boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists category text not null default 'daily';

alter table public.tasks
  add column if not exists importance integer not null default 0;

update public.tasks
set category = 'daily'
where category is distinct from 'daily';

alter table public.tasks
  alter column category set default 'daily';

alter table public.tasks
  drop constraint if exists tasks_category_check;

alter table public.tasks
  add constraint tasks_category_check check (category = 'daily');

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

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_idx on public.task_comments(task_id);
create index if not exists task_comments_user_id_idx on public.task_comments(user_id);

alter table public.task_comments enable row level security;

drop policy if exists "Users can read own task comments" on public.task_comments;
drop policy if exists "Users can insert own task comments" on public.task_comments;
drop policy if exists "Users can update own task comments" on public.task_comments;
drop policy if exists "Users can delete own task comments" on public.task_comments;

create policy "Users can read own task comments"
on public.task_comments
for select
using (auth.uid() = user_id);

create policy "Users can insert own task comments"
on public.task_comments
for insert
with check (auth.uid() = user_id);

create policy "Users can update own task comments"
on public.task_comments
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own task comments"
on public.task_comments
for delete
using (auth.uid() = user_id);
