-- I AM KIM (App Store MVP)
-- Run this ONCE in Supabase → SQL Editor.

-- 0) (Optional) helpful extension
create extension if not exists pgcrypto;

-- 1) Usage quota (3 free video analyses per user)
create table if not exists public.usage_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used_count int not null default 0,
  limit_count int not null default 3,
  updated_at timestamptz not null default now()
);

create index if not exists usage_quota_updated_at_idx
  on public.usage_quota(updated_at);

alter table public.usage_quota enable row level security;

-- Users can only see/update their own quota row
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='usage_quota' and policyname='quota_select_own'
  ) then
    create policy quota_select_own
      on public.usage_quota
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='usage_quota' and policyname='quota_insert_own'
  ) then
    create policy quota_insert_own
      on public.usage_quota
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='usage_quota' and policyname='quota_update_own'
  ) then
    create policy quota_update_own
      on public.usage_quota
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;

-- Helper: get current quota status (creates row on first use)
create or replace function public.get_quota_status(free_limit int default 3)
returns table(used int, limit int, remaining int)
language plpgsql
as $$
declare
  v_used int;
  v_limit int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.usage_quota(user_id, used_count, limit_count)
  values (auth.uid(), 0, free_limit)
  on conflict (user_id) do nothing;

  select used_count, limit_count
    into v_used, v_limit
  from public.usage_quota
  where user_id = auth.uid();

  used := coalesce(v_used, 0);
  limit := coalesce(v_limit, free_limit);
  remaining := greatest(0, limit - used);
  return next;
end;
$$;

-- Helper: consume 1 quota (creates row on first use)
create or replace function public.consume_quota(free_limit int default 3)
returns table(used int, limit int, remaining int)
language plpgsql
as $$
declare
  v_used int;
  v_limit int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.usage_quota(user_id, used_count, limit_count)
  values (auth.uid(), 0, free_limit)
  on conflict (user_id) do nothing;

  select used_count, limit_count
    into v_used, v_limit
  from public.usage_quota
  where user_id = auth.uid();

  v_used := coalesce(v_used, 0);
  v_limit := coalesce(v_limit, free_limit);

  if v_used >= v_limit then
    used := v_used;
    limit := v_limit;
    remaining := 0;
    return next;
    return;
  end if;

  update public.usage_quota
    set used_count = v_used + 1,
        updated_at = now()
    where user_id = auth.uid();

  used := v_used + 1;
  limit := v_limit;
  remaining := greatest(0, v_limit - (v_used + 1));
  return next;
end;
$$;

-- Allow authenticated users to call the functions
grant execute on function public.get_quota_status(int) to authenticated;
grant execute on function public.consume_quota(int) to authenticated;

-- 2) Community posts (1 photo max per post, app-style feed)
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  category text not null default 'Tips',
  title text not null,
  body text not null,
  image_url text,
  image_path text,
  created_at timestamptz not null default now()
);


-- If you ran an older version, ensure new columns exist
alter table public.posts add column if not exists image_path text;
alter table public.posts add column if not exists avatar_url text;
create index if not exists posts_created_at_idx
  on public.posts(created_at desc);

alter table public.posts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_read_all'
  ) then
    create policy posts_read_all
      on public.posts
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_insert_own'
  ) then
    create policy posts_insert_own
      on public.posts
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_update_own'
  ) then
    create policy posts_update_own
      on public.posts
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='posts_delete_own'
  ) then
    create policy posts_delete_own
      on public.posts
      for delete
      to authenticated
      using (user_id = auth.uid());
  end if;
end$$;

-- 3) Reports (basic UGC safety for app stores)
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx
  on public.reports(created_at desc);

alter table public.reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='reports_insert_own'
  ) then
    create policy reports_insert_own
      on public.reports
      for insert
      to authenticated
      with check (reporter_id = auth.uid());
  end if;

  -- No one can read reports from the client (admin-only via dashboard)
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='reports_no_select'
  ) then
    create policy reports_no_select
      on public.reports
      for select
      to anon, authenticated
      using (false);
  end if;
end$$;

-- 4) Storage bucket for community images (public read, auth upload to own folder)
-- Create bucket (safe to re-run)
insert into storage.buckets (id, name, public)
values ('community-images', 'community-images', true)
on conflict (id) do nothing;

-- Policies on storage.objects
do $$
begin
  -- Public can read images
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='community_images_read'
  ) then
    create policy community_images_read
      on storage.objects
      for select
      to public
      using (bucket_id = 'community-images');
  end if;

  -- Auth users can upload into their own folder: <user_id>/filename
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='community_images_insert_own'
  ) then
    create policy community_images_insert_own
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'community-images'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='community_images_update_own'
  ) then
    create policy community_images_update_own
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'community-images'
        and split_part(name, '/', 1) = auth.uid()::text
      )
      with check (
        bucket_id = 'community-images'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='community_images_delete_own'
  ) then
    create policy community_images_delete_own
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'community-images'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;
end$$;
