import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias. " +
      "Crie o arquivo .env.local na raiz do projeto.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
