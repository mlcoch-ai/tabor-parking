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
export const SUPABASE_ANON_KEY = ""; // <-- sem vlož "anon public" klíč (začíná "eyJ...")
