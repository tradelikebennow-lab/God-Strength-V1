// src/data/supabaseClient.js
// Single shared Supabase client.
//
// The URL and publishable key are PUBLIC by design (they ship in the
// browser bundle either way on a static site). Data is protected by
// Row Level Security + login, not by hiding these values.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cqpjcpeftfrdwszsvhgj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vKU2n1G_9w2060FTYOsu1Q_C3dPFArm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
