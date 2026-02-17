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
  status text not null default 'active' check (status in ('active', 'reserved', 'sold', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz,
  checkout_session_id text
);

create index if not exists idx_listings_status_created_at
  on public.listings (status, created_at desc);

create index if not exists idx_listings_brand
  on public.listings (brand);

create index if not exists idx_listings_seller
  on public.listings (seller_id);

drop trigger if exists trg_seller_profiles_updated_at on public.seller_profiles;
create trigger trg_seller_profiles_updated_at
before update on public.seller_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row execute function public.set_updated_at();
