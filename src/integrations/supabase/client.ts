
// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://pxscemubsifbkoxnarxx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2NlbXVic2lmYmtveG5hcnh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM1OTk3MTEsImV4cCI6MjA1OTE3NTcxMX0.unVaYjL6UEBxmU8Nxoa1-TCt1aLUUrziBhhdMgM8eZc";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
