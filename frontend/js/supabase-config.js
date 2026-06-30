// js/supabase-config.js

const supabaseUrl = 'https://hcclmoretabvymrgukdl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2xtb3JldGFidnltcmd1a2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTMxNTAsImV4cCI6MjA5NTA4OTE1MH0.jY_9BXEsmN7_-UMYHDOdp2MetismTVGbT2-33PVVEy8';

// This exact line is what makes it available to profile-settings.js!
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);