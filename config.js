// Konfigurace připojení k Supabase.
//
// Sem vlož údaje ze svého Supabase projektu:
//   Supabase → Project Settings → Data API (nebo API)
//     - URL          => SUPABASE_URL
//     - anon public  => SUPABASE_ANON_KEY   (tenhle klíč je VEŘEJNÝ, smí být v kódu)
//
// !!! NIKDY sem nedávej "service_role" klíč — ten je tajný. Stačí "anon public". !!!
//
// Dokud jsou hodnoty prázdné, appka běží v DEMO režimu (data jen v tomto prohlížeči).

export const SUPABASE_URL = "https://zilvgglxokwdewdmlzik.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbHZnZ2x4b2t3ZGV3ZG1semlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTg5NDQsImV4cCI6MjA5ODU5NDk0NH0.H0ylRwOW-SAkIbPnQJLoNJttsi82ytVqhXNlKTDNRDM";

// Volitelný PIN pro EDITOR parkovišť (editor.html).
// Prázdné = bez zámku. Když vyplníš, editor se před otevřením zeptá na PIN.
// Je to jen lehká překážka (kód je ve frontendu), ne skutečné zabezpečení.
export const EDITOR_PIN = "";
