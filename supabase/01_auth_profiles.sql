-- ShinkaNotes, stage 1: profiles for Supabase Auth.   (v2: safe to run more than once)
-- Run in Supabase Dashboard > SQL Editor. It only creates/keeps ONE table, one trigger function,
-- one trigger and two RLS policies. Nothing here is public. It deletes nothing:
-- existing rows and existing policies are left exactly as they are.

-- 1) One profile row per signed-up user (id = the auth user's id).
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text        not null default '',
  avatar     smallint    not null default 1 check (avatar between 1 and 3),
  created_at timestamptz not null default now()
);

-- 2) Lock the table down: RLS on, and signed-out visitors (anon) get nothing.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

-- 3) A signed-in user may read and update ONLY their own row.
--    Each policy is created only if it does not exist yet, so re-running never errors
--    and never drops or weakens a policy. No INSERT/DELETE policy on purpose: rows are
--    created by the trigger below and removed automatically with the auth user.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles: read own') then
    create policy "profiles: read own" on public.profiles for select to authenticated
      using ((select auth.uid()) = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles: update own') then
    create policy "profiles: update own" on public.profiles for update to authenticated
      using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
  end if;
end $$;

-- 4) Create the profile automatically when someone signs up (copies the name from sign-up).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;   -- replaces only OUR trigger, same definition
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
