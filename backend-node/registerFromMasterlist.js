require('dotenv').config();
const readline = require('readline');
const supabase = require('./supabaseClient');

// Password validation regex matching the frontend auth rules:
// Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;

async function registerStudent(idNumber, email, password) {
    idNumber = (idNumber || '').trim();
    email = (email || '').trim().toLowerCase();
    password = (password || '').trim();

    if (!idNumber) throw new Error('Student ID number is required.');
    if (!email || !email.includes('@')) throw new Error('A valid email address is required.');
    if (!password) throw new Error('Password is required.');

    if (!strongPasswordRegex.test(password)) {
        throw new Error('Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.');
    }

    console.log(`\n🔍 Searching for Student ID "${idNumber}" in enrolled_masterlist...`);

    // 1. Fetch record from enrolled_masterlist
    const { data: student, error: fetchErr } = await supabase
        .from('enrolled_masterlist')
        .select('*')
        .eq('id_number', idNumber)
        .maybeSingle();

    if (fetchErr) {
        throw new Error(`Database error querying masterlist: ${fetchErr.message}`);
    }

    if (!student) {
        throw new Error(`No student found in enrolled_masterlist with ID "${idNumber}".`);
    }

    console.log(`✓ Record found:`);
    console.log(`  - Name:        ${student.first_name || ''} ${student.middle_name || ''} ${student.last_name || ''}`.trim());
    console.log(`  - Program:     ${student.program || 'N/A'}`);
    console.log(`  - Year Level:  ${student.year_level || 'N/A'}`);
    console.log(`  - Gender:      ${student.gender || 'N/A'}`);
    console.log(`  - School ID:   ${student.school_id || 'N/A'}`);

    if (!student.school_id) {
        throw new Error('This student masterlist record has no assigned school_id. Please assign a school_id first.');
    }

    // 2. Check if this Student ID is already linked to a profile
    const { data: existingProfile, error: profileCheckErr } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('id_number', idNumber)
        .maybeSingle();

    if (profileCheckErr) {
        console.warn("Profile check warning:", profileCheckErr.message);
    }

    if (existingProfile) {
        throw new Error(`An account already exists for Student ID "${idNumber}" (Email: ${existingProfile.email}).`);
    }

    // 3. Create user in Supabase Auth (Pre-confirmed, no OTP needed)
    console.log(`\n⚙️ Creating user in Supabase Auth with pre-confirmed email...`);
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Bypasses email OTP verification
        user_metadata: {
            role: 'student',
            school_id: student.school_id
        }
    });

    if (authErr) {
        throw new Error(`Auth Error: ${authErr.message}`);
    }

    const userId = authData.user.id;
    console.log(`✓ Auth user created successfully (User UID: ${userId})`);

    // 4. Populate/Upsert the profiles table with masterlist information
    console.log(`⚙️ Syncing masterlist details into profiles table...`);
    const { error: profileUpsertErr } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            email: email,
            role: 'student',
            id_number: student.id_number,
            first_name: student.first_name,
            middle_name: student.middle_name && student.middle_name !== 'NULL' ? student.middle_name : '',
            last_name: student.last_name,
            program: student.program,
            year_level: student.year_level,
            gender: student.gender,
            school_id: student.school_id,
            is_approved: true // Pre-approved so student can log in immediately
        });

    if (profileUpsertErr) {
        throw new Error(`Failed to update profile: ${profileUpsertErr.message}`);
    }

    console.log(`\n=============================================================`);
    console.log(`🎉 STUDENT ACCOUNT CREATED SUCCESSFULLY (NO OTP REQUIRED)`);
    console.log(`=============================================================`);
    console.log(`Student Name: ${student.first_name} ${student.last_name}`);
    console.log(`Student ID:   ${student.id_number}`);
    console.log(`Login Email:  ${email}`);
    console.log(`Password:     ${password}`);
    console.log(`Status:       Approved (Active)`);
    console.log(`=============================================================`);
    console.log(`The student can now log in at login.html immediately.\n`);
}

// Interactive CLI prompt helper
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function main() {
    // Check command line arguments: node registerFromMasterlist.js <id_number> <email> [password]
    const args = process.argv.slice(2);

    let idNumber = args[0];
    let email = args[1];
    let password = args[2];

    try {
        if (!idNumber) {
            console.log('--- Grantee Masterlist Student Account Creator ---');
            idNumber = await promptUser('Enter Student ID Number (from enrolled_masterlist): ');
        }

        if (!email) {
            email = await promptUser('Enter Student Email (for login): ');
        }

        if (!password) {
            const inputPass = await promptUser('Enter Password (press Enter for default "StudentPass123!"): ');
            password = inputPass.trim() || 'StudentPass123!';
        }

        await registerStudent(idNumber, email, password);
    } catch (err) {
        console.error(`\n❌ Registration Failed:`, err.message);
    }
}

main();
