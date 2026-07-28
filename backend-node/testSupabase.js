require('dotenv').config();
const supabase = require('./supabaseClient');

async function check() {
    const { data, error } = await supabase.from('email_logs').select('*').limit(1);
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Table exists! Data:", data);
    }
}
check();
