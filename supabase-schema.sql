-- Archive Sur Mer marketplace schema
-- Run in Supabase SQL editor before using API endpoints.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  stripe_account_id text unique,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  phone text not null,
  full_name text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.customer_profiles
  add column if not exists phone text;

alter table if exists public.customer_profiles
  add column if not exists full_name text;

alter table if exists public.customer_profiles
  add column if not exists marketing_opt_in boolean not null default false;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  title text not null,
  brand text not null,
  description text not null default '',
  size text,
  condition text not null default 'Pre-owned',
  is_new boolean not null default false,
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'eur',
  image_url text,
  media_urls jsonb not null default '[]'::jsonb,
  approved_media_urls jsonb not null default '[]'::jsonb,
  video_url text,
  moderation_status text not null default 'pending',
  moderation_reason text,
  moderated_at timestamptz,
  status text not null default 'active' check (status in ('active', 'reserved', 'sold', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz,
  checkout_session_id text
);

alter table if exists public.listings
  add column if not exists media_urls jsonb not null default '[]'::jsonb;

alter table if exists public.listings
  add column if not exists approved_media_urls jsonb not null default '[]'::jsonb;

alter table if exists public.listings
  add column if not exists video_url text;

alter table if exists public.listings
  add column if not exists moderation_status text not null default 'pending';

alter table if exists public.listings
  add column if not exists moderation_reason text;

alter table if exists public.listings
  add column if not exists moderated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_moderation_status_check'
  ) then
    alter table public.listings
      add constraint listings_moderation_status_check
      check (moderation_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

update public.listings
set media_urls = jsonb_build_array(image_url)
where image_url is not null
  and image_url <> ''
  and coalesce(jsonb_array_length(media_urls), 0) = 0;

update public.listings
set approved_media_urls = media_urls
where moderation_status = 'approved'
  and coalesce(jsonb_array_length(approved_media_urls), 0) = 0;

create index if not exists idx_listings_status_created_at
  on public.listings (status, created_at desc);

create index if not exists idx_listings_brand
  on public.listings (brand);

create index if not exists idx_listings_seller
  on public.listings (seller_id);

create index if not exists idx_listings_moderation_status
  on public.listings (moderation_status, created_at desc);

create index if not exists idx_customer_profiles_email
  on public.customer_profiles (email);

create index if not exists idx_customer_profiles_phone
  on public.customer_profiles (phone);

drop trigger if exists trg_seller_profiles_updated_at on public.seller_profiles;
create trigger trg_seller_profiles_updated_at
before update on public.seller_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_profiles_updated_at on public.customer_profiles;
create trigger trg_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row execute function public.set_updated_at();
