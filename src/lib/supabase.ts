import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zcqncbdfurhlnspzziyd.supabase.co";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ymLV5njVvbll5eL9J_HP8g_7AfElGhz";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
