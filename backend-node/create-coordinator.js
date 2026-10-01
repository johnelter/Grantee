const readline = require('readline');
const supabase = require('./supabaseClient');

// Parse CLI arguments if passed (e.g. node create-coordinator.js --email ... --password ...)
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].substring(2);
            const nextVal = args[i + 1];
            if (nextVal && !nextVal.startsWith('--')) {
                params[key] = nextVal;
                i++;
            } else {
                params[key] = true;
            }
        }
    }
    return params;
}

function prompt(rl, question) {
    return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

async function main() {
    console.log('\n======================================================');
    console.log('       GRANTEE - CREATE COORDINATOR / ADMIN ACCOUNT     ');
    console.log('======================================================\n');

    const cliArgs = parseArgs();

    // 1. Fetch available schools from Supabase
    const { data: schools, error: schoolErr } = await supabase
        .from('schools')
        .select('id, name')
        .order('name', { ascending: true });

    if (schoolErr || !schools || schools.length === 0) {
        console.error('❌ Failed to fetch schools list from Supabase:', schoolErr);
        process.exit(1);
    }

    let email = cliArgs.email;
    let password = cliArgs.password;
    let firstName = cliArgs.firstName || cliArgs.firstname;
    let lastName = cliArgs.lastName || cliArgs.lastname;
    let middleName = cliArgs.middleName || cliArgs.middlename || '';
    let selectedSchoolId = cliArgs.schoolId || cliArgs.school_id;
    let selectedSchoolName = '';

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        if (!email) {
            email = await prompt(rl, '📧 Enter Coordinator Email: ');
            while (!email || !email.includes('@')) {
                console.log('⚠️  Please enter a valid email address.');
                email = await prompt(rl, '📧 Enter Coordinator Email: ');
            }
        }

        if (!password) {
            password = await prompt(rl, '🔑 Enter Password (min 6 characters): ');
            while (!password || password.length < 6) {
                console.log('⚠️  Password must be at least 6 characters.');
                password = await prompt(rl, '🔑 Enter Password (min 6 characters): ');
            }
        }

        if (!firstName) {
            firstName = await prompt(rl, '👤 Enter First Name: ');
            while (!firstName) {
                console.log('⚠️  First name is required.');
                firstName = await prompt(rl, '👤 Enter First Name: ');
            }
        }

        if (!lastName) {
            lastName = await prompt(rl, '👤 Enter Last Name: ');
            while (!lastName) {
                console.log('⚠️  Last name is required.');
                lastName = await prompt(rl, '👤 Enter Last Name: ');
            }
        }

        if (!middleName && !cliArgs.firstName) {
            middleName = await prompt(rl, '👤 Enter Middle Name (Optional, press Enter to skip): ');
        }

        // 2. Resolve School ID
        if (selectedSchoolId) {
            const found = schools.find(s => s.id === selectedSchoolId || s.name.toLowerCase().includes(selectedSchoolId.toLowerCase()));
            if (found) {
                selectedSchoolId = found.id;
                selectedSchoolName = found.name.trim();
            } else {
                console.warn(`⚠️ School "${selectedSchoolId}" not found. Please choose from the list:`);
                selectedSchoolId = null;
            }
        }

        if (!selectedSchoolId) {
            console.log('\n🏫 Select Assigned School:');
            schools.forEach((s, idx) => {
                console.log(`   [${idx + 1}] ${s.name.trim()}`);
            });

            const choiceStr = await prompt(rl, `\nSelect School (1-${schools.length}): `);
            const choiceNum = parseInt(choiceStr, 10);
            if (choiceNum >= 1 && choiceNum <= schools.length) {
                selectedSchoolId = schools[choiceNum - 1].id;
                selectedSchoolName = schools[choiceNum - 1].name.trim();
            } else {
                console.error('❌ Invalid school selection.');
                rl.close();
                process.exit(1);
            }
        } else if (!selectedSchoolName) {
            const s = schools.find(item => item.id === selectedSchoolId);
            selectedSchoolName = s ? s.name.trim() : 'Assigned School';
        }

        rl.close();

        console.log('\n⏳ Creating Coordinator account in Supabase...');

        // 3. Create or update user in Supabase Auth via Service Role
        let userId = null;

        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                first_name: firstName,
                last_name: lastName,
                middle_name: middleName,
                role: 'admin',
                school_id: selectedSchoolId
            }
        });

        if (authErr) {
            // Check if user already exists
            if (authErr.message && authErr.message.toLowerCase().includes('already registered')) {
                console.log('ℹ️  User already exists in Supabase Auth. Fetching user ID and upgrading role to Coordinator...');
                const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers();
                if (!listErr && usersList && usersList.users) {
                    const existingUser = usersList.users.find(u => u.email.toLowerCase() === email.toLowerCase());
                    if (existingUser) {
                        userId = existingUser.id;
                        // Update password & confirm
                        await supabase.auth.admin.updateUserById(userId, {
                            password: password,
                            email_confirm: true,
                            user_metadata: {
                                first_name: firstName,
                                last_name: lastName,
                                middle_name: middleName,
                                role: 'admin',
                                school_id: selectedSchoolId
                            }
                        });
                    }
                }
            } else {
                console.error('❌ Auth Error:', authErr.message);
                process.exit(1);
            }
        } else if (authData && authData.user) {
            userId = authData.user.id;
        }

        if (!userId) {
            console.error('❌ Could not retrieve user ID.');
            process.exit(1);
        }

        // 4. Create / Upsert Profile entry
        const profilePayload = {
            id: userId,
            email: email,
            first_name: firstName,
            last_name: lastName,
            middle_name: middleName || null,
            role: 'admin',
            school_id: selectedSchoolId,
            is_approved: true,
            updated_at: new Date().toISOString()
        };

        const { error: profileErr } = await supabase
            .from('profiles')
            .upsert(profilePayload, { onConflict: 'id' });

        if (profileErr) {
            console.error('❌ Profile Error:', profileErr.message);
            process.exit(1);
        }

        console.log('\n======================================================');
        console.log('  🎉 COORDINATOR ACCOUNT CREATED SUCCESSFULLY!        ');
        console.log('======================================================');
        console.log(`👤 Name:     ${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`);
        console.log(`📧 Email:    ${email}`);
        console.log(`🔑 Password: ${password}`);
        console.log(`🏫 School:   ${selectedSchoolName}`);
        console.log(`🛡️  Role:     Coordinator (admin)`);
        console.log(`🆔 User ID:  ${userId}`);
        console.log('======================================================');
        console.log('\n👉 The coordinator can now log in at: index.html (or admin-dashboard.html)\n');

    } catch (err) {
        console.error('❌ Unexpected Error:', err);
        if (rl) rl.close();
        process.exit(1);
    }
}

main();
