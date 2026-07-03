-- ============================================================
--  Parkování tábor — nastavení databáze v Supabase
--  Spusť celé v: Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1) Tabulka parkovišť
create table if not exists public.parking_spots (
  id           uuid primary key default gen_random_uuid(),
  name         text            not null default 'Parkoviště',
  -- geometrie obdélníku jako podíl (0..1) rozměrů obrázku mapy
  x            double precision not null,
  y            double precision not null,
  w            double precision not null,
  h            double precision not null,
  current_cars integer         not null default 0,
  max_cars     integer         not null default 10,
  is_lower     boolean         not null default true,  -- leží u spodní cesty?
  sort_order   integer         not null default 0,
  updated_at   timestamptz     not null default now(),
  updated_by   text,
  created_at   timestamptz     not null default now()
);

-- 2) Row Level Security — bez přihlašování, přístup přes znalost URL.
--    Povolíme anonymnímu klíči čtení i zápis.
alter table public.parking_spots enable row level security;

drop policy if exists "public_read"   on public.parking_spots;
drop policy if exists "public_insert" on public.parking_spots;
drop policy if exists "public_update" on public.parking_spots;
drop policy if exists "public_delete" on public.parking_spots;

create policy "public_read"   on public.parking_spots for select using (true);
create policy "public_insert" on public.parking_spots for insert with check (true);
create policy "public_update" on public.parking_spots for update using (true) with check (true);
create policy "public_delete" on public.parking_spots for delete using (true);

-- 3) Realtime — aby se změny objevily u všech okamžitě
alter publication supabase_realtime add table public.parking_spots;

-- Hotovo. Parkoviště se přidávají přímo v appce (tlačítko ✏️ Upravit).
