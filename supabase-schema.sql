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

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  listing_id uuid not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_customer_listing_unique'
  ) then
    alter table public.wishlist_items
      add constraint wishlist_items_customer_listing_unique unique (customer_id, listing_id);
  end if;
end;
$$;

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  search_query text,
  brand text,
  size text,
  condition text,
  min_price_cents integer,
  max_price_cents integer,
  sort_key text not null default 'newest',
  notify_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.saved_searches
  add column if not exists search_query text;

alter table if exists public.saved_searches
  add column if not exists brand text;

alter table if exists public.saved_searches
  add column if not exists size text;

alter table if exists public.saved_searches
  add column if not exists condition text;

alter table if exists public.saved_searches
  add column if not exists min_price_cents integer;

alter table if exists public.saved_searches
  add column if not exists max_price_cents integer;

alter table if exists public.saved_searches
  add column if not exists sort_key text not null default 'newest';

alter table if exists public.saved_searches
  add column if not exists notify_email boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_searches_sort_key_check'
  ) then
    alter table public.saved_searches
      add constraint saved_searches_sort_key_check
      check (sort_key in ('newest', 'price_asc', 'price_desc'));
  end if;
end;
$$;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  seller_id uuid not null references public.seller_profiles(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  currency text not null default 'eur',
  amount_cents integer not null check (amount_cents > 0),
  counter_amount_cents integer,
  final_amount_cents integer,
  status text not null default 'pending',
  buyer_message text,
  seller_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table if exists public.offers
  add column if not exists counter_amount_cents integer;

alter table if exists public.offers
  add column if not exists final_amount_cents integer;

alter table if exists public.offers
  add column if not exists buyer_message text;

alter table if exists public.offers
  add column if not exists seller_message text;

alter table if exists public.offers
  add column if not exists resolved_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offers_status_check'
  ) then
    alter table public.offers
      add constraint offers_status_check
      check (status in ('pending', 'countered', 'accepted', 'rejected', 'cancelled', 'expired'));
  end if;
end;
$$;

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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wishlist_items_listing_id_fkey'
  ) then
    alter table public.wishlist_items
      add constraint wishlist_items_listing_id_fkey
      foreign key (listing_id) references public.listings(id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offers_listing_id_fkey'
  ) then
    alter table public.offers
      add constraint offers_listing_id_fkey
      foreign key (listing_id) references public.listings(id) on delete cascade;
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

create index if not exists idx_wishlist_items_customer
  on public.wishlist_items (customer_id, created_at desc);

create index if not exists idx_wishlist_items_listing
  on public.wishlist_items (listing_id);

create index if not exists idx_saved_searches_customer
  on public.saved_searches (customer_id, created_at desc);

create index if not exists idx_offers_listing
  on public.offers (listing_id, created_at desc);

create index if not exists idx_offers_customer
  on public.offers (customer_id, created_at desc);

create index if not exists idx_offers_seller
  on public.offers (seller_id, created_at desc);

drop trigger if exists trg_seller_profiles_updated_at on public.seller_profiles;
create trigger trg_seller_profiles_updated_at
before update on public.seller_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_profiles_updated_at on public.customer_profiles;
create trigger trg_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_saved_searches_updated_at on public.saved_searches;
create trigger trg_saved_searches_updated_at
before update on public.saved_searches
for each row execute function public.set_updated_at();

drop trigger if exists trg_offers_updated_at on public.offers;
create trigger trg_offers_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
before update on public.listings
for each row execute function public.set_updated_at();
