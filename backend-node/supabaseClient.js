require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// These keys are found in your Supabase Project Settings > API
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// We use the Service Role Key here so the backend can bypass Row Level Security 
// to check the masterlist and insert profiles securely.
const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;