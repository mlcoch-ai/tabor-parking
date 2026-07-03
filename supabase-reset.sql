-- ============================================================
--  Parkování tábor — ČISTÝ RESET databáze
--  Použij, když už v Supabase existuje tabulka parking_spots
--  z dřívějšího pokusu a mohla by mít jinou strukturu.
--
--  POZOR: smaže tabulku parking_spots i s jejími daty.
--         Používej jen dokud tam nemáš skutečná data!
--  Spusť celé v: Supabase → SQL Editor → New query → Run
-- ============================================================

-- 0) Odeber tabulku z realtime publikace (pokud tam je), ať jde smazat čistě
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'parking_spots'
  ) then
    alter publication supabase_realtime drop table public.parking_spots;
  end if;
end $$;

-- 1) Smaž starou tabulku (cascade zruší i její práva/policies)
drop table if exists public.parking_spots cascade;

-- 2) Vytvoř tabulku načisto přesně podle aplikace
create table public.parking_spots (
  id           uuid primary key default gen_random_uuid(),
  name         text            not null default 'Parkoviště',
  x            double precision not null,
  y            double precision not null,
  w            double precision not null,
  h            double precision not null,
  current_cars integer         not null default 0,
  max_cars     integer         not null default 10,
  is_lower     boolean         not null default true,
  sort_order   integer         not null default 0,
  updated_at   timestamptz     not null default now(),
  updated_by   text,
  created_at   timestamptz     not null default now()
);

-- 3) Row Level Security — bez přihlašování, přístup přes znalost URL
alter table public.parking_spots enable row level security;

create policy "public_read"   on public.parking_spots for select using (true);
create policy "public_insert" on public.parking_spots for insert with check (true);
create policy "public_update" on public.parking_spots for update using (true) with check (true);
create policy "public_delete" on public.parking_spots for delete using (true);

-- 4) Realtime
alter publication supabase_realtime add table public.parking_spots;

-- Hotovo. Struktura teď přesně odpovídá aplikaci.
