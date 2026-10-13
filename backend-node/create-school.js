const readline = require('readline');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

// Parse CLI arguments (e.g. node create-school.js --name "..." or node create-school.js "...")
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    const positional = [];

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
        } else {
            positional.push(args[i]);
        }
    }

    if (positional.length > 0 && !params.name) {
        params.name = positional.join(' ');
    }

    return params;
}

function prompt(rl, question) {
    return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

// Subscriptions storage helper
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'data', 'subscriptions.json');

function initializeSchoolSubscription(schoolId, schoolName, status = 'active', days = 14) {
    try {
        let store = {};
        if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
            const content = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
            store = JSON.parse(content || '{}');
        }

        const now = new Date();
        const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const isTrial = days <= 14 && status === 'active';
        const isYearly = days >= 365;

        let planId = 'plan_monthly';
        let planCode = 'monthly';
        let planName = 'Monthly Institutional License';
        let billingCycle = 'monthly';
        let pricePhp = 2499;
        let paymentMethod = 'Initial Administrative Provision';
        let invoiceStatus = 'Paid';

        if (isTrial) {
            planId = 'plan_trial';
            planCode = 'trial';
            planName = '14-Day Free Tier License';
            billingCycle = 'trial';
            pricePhp = 0;
            paymentMethod = 'Free Tier (14-Day Evaluation)';
            invoiceStatus = 'Complimentary';
        } else if (isYearly) {
            planId = 'plan_yearly';
            planCode = 'yearly';
            planName = 'Yearly Institutional License';
            billingCycle = 'yearly';
            pricePhp = 24990;
        }

        store[schoolId] = {
            school_id: schoolId,
            school_name: schoolName,
            status: status,
            plan_id: planId,
            plan_code: planCode,
            plan_name: planName,
            billing_cycle: billingCycle,
            price_php: pricePhp,
            currency: 'PHP',
            current_period_start: now.toISOString(),
            current_period_end: endDate.toISOString(),
            last_payment_date: now.toISOString(),
            last_payment_reference: isTrial
                ? `FREE-TIER-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`
                : `INIT-REG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
            last_payment_method: paymentMethod,
            last_paid_by_coordinator_name: 'Grantee System Provisioning',
            last_paid_by_coordinator_email: 'admin@grantee.com',
            invoices: [
                {
                    invoice_number: `INV-${now.getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
                    transaction_id: `TXN-${now.getTime()}-${Math.floor(100 + Math.random() * 900)}`,
                    date: now.toISOString(),
                    plan_name: planName,
                    plan_code: planCode,
                    billing_cycle: billingCycle,
                    amount_php: pricePhp,
                    status: invoiceStatus,
                    payment_method: paymentMethod,
                    reference_number: isTrial ? `FREE-TRIAL-${Math.floor(10000000 + Math.random() * 90000000)}` : `INIT-${Math.floor(10000000 + Math.random() * 90000000)}`,
                    paid_by_name: 'Grantee System Provisioning',
                    paid_by_email: 'admin@grantee.com',
                    period_covered: `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                    notes: isTrial ? `Complimentary 2-week free tier evaluation for ${schoolName}` : `Initial provisioning for ${schoolName}`
                }
            ],
            updated_at: now.toISOString()
        };

        const dataDir = path.dirname(SUBSCRIPTIONS_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.warn('⚠️  Could not seed subscriptions store:', e.message);
        return false;
    }
}

async function main() {
    console.log('\n======================================================');
    console.log('       GRANTEE - CREATE NEW INSTITUTION / SCHOOL     ');
    console.log('======================================================\n');

    const cliArgs = parseArgs();

    // 1. Fetch current schools
    const { data: existingSchools, error: listErr } = await supabase
        .from('schools')
        .select('id, name')
        .order('name', { ascending: true });

    if (listErr) {
        console.error('❌ Failed to connect to Supabase:', listErr.message);
        process.exitCode = 1;
        return;
    }

    // List mode
    if (cliArgs.list) {
        console.log(`📋 Currently Registered Institutions (${existingSchools.length} total):\n`);
        existingSchools.forEach((s, idx) => {
            console.log(`  ${idx + 1}. [${s.id}] ${s.name.trim()}`);
        });
        console.log('\n======================================================\n');
        return;
    }

    console.log(`📋 Currently Registered Institutions (${existingSchools.length} total):`);
    existingSchools.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.name.trim()}`);
    });
    console.log('------------------------------------------------------\n');

    let schoolName = cliArgs.name;
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        if (!schoolName) {
            schoolName = await prompt(rl, '🏫 Enter New School / Institution Name: ');
            while (!schoolName || schoolName.trim().length < 3) {
                console.log('⚠️  School name must be at least 3 characters.');
                schoolName = await prompt(rl, '🏫 Enter New School / Institution Name: ');
            }
        }

        schoolName = schoolName.trim();

        // Check if name already exists
        const duplicate = existingSchools.find(s => s.name.trim().toLowerCase() === schoolName.toLowerCase());
        if (duplicate) {
            console.log(`\n⚠️  A school with this name already exists:`);
            console.log(`   ID:   ${duplicate.id}`);
            console.log(`   Name: ${duplicate.name.trim()}`);
            const proceed = await prompt(rl, '\nDo you still want to insert a duplicate school record? (y/N): ');
            if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
                console.log('❌ Cancelled by user.');
                rl.close();
                return;
            }
        }

        // License status choice
        let status = cliArgs.status || 'active';
        let licenseDays = cliArgs.days !== undefined ? Number(cliArgs.days) : 14;

        if (!cliArgs.status && !cliArgs.name) {
            console.log('\n📜 Initial Institutional License Plan:');
            console.log('   1. Active (2 Weeks Free Tier License / 14 Days - Recommended)');
            console.log('   2. Active (1-Month Institutional License - 30 Days)');
            console.log('   3. Active (1-Year Annual Institutional License - 365 Days)');
            console.log('   4. Unpaid / Suspended (Requires coordinator payment)');
            const planChoice = await prompt(rl, '👉 Choose plan [Default: 1]: ');

            if (planChoice === '2') {
                status = 'active';
                licenseDays = 30;
            } else if (planChoice === '3') {
                status = 'active';
                licenseDays = 365;
            } else if (planChoice === '4') {
                status = 'unpaid';
                licenseDays = 0;
            } else {
                status = 'active';
                licenseDays = 14;
            }
        }

        console.log('\n⏳ Inserting school record into Supabase...');

        // 2. Insert into Supabase `schools` table
        const { data: insertedData, error: insertErr } = await supabase
            .from('schools')
            .insert({ name: schoolName })
            .select()
            .single();

        if (insertErr || !insertedData) {
            console.error('❌ Failed to create school in Supabase:', insertErr ? insertErr.message : 'Unknown error');
            rl.close();
            process.exitCode = 1;
            return;
        }

        const newSchoolId = insertedData.id;
        const newSchoolName = insertedData.name.trim();

        // 3. Initialize Subscription entry in subscriptions.json
        initializeSchoolSubscription(newSchoolId, newSchoolName, status, licenseDays);

        const coverageText = licenseDays === 14 
            ? '2 Weeks Free Tier License' 
            : `${licenseDays} days coverage`;

        console.log('\n======================================================');
        console.log('  🎉 NEW SCHOOL CREATED SUCCESSFULLY!                 ');
        console.log('======================================================');
        console.log(`🏫 School Name:    ${newSchoolName}`);
        console.log(`🆔 School ID:      ${newSchoolId}`);
        console.log(`📜 License Status: ${status.toUpperCase()} (${coverageText})`);
        console.log('======================================================\n');

        // 4. Prompt to create Coordinator account
        let wantCoordinator = cliArgs.coordinator;
        if (wantCoordinator === undefined) {
            const ans = await prompt(rl, '👤 Would you like to create an Admin/Coordinator account for this school now? (y/N): ');
            wantCoordinator = ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes';
        }

        if (wantCoordinator) {
            console.log('\n--- CREATE SCHOOL COORDINATOR ACCOUNT ---');
            let coordEmail = cliArgs.email;
            while (!coordEmail || !coordEmail.includes('@')) {
                coordEmail = await prompt(rl, '📧 Enter Coordinator Email: ');
            }

            let coordPass = cliArgs.password;
            while (!coordPass || coordPass.length < 6) {
                coordPass = await prompt(rl, '🔑 Enter Password (min 6 chars): ');
            }

            let firstName = cliArgs.firstName;
            while (!firstName) {
                firstName = await prompt(rl, '👤 Enter First Name: ');
            }

            let lastName = cliArgs.lastName;
            while (!lastName) {
                lastName = await prompt(rl, '👤 Enter Last Name: ');
            }

            const middleName = await prompt(rl, '👤 Enter Middle Name (Optional): ');

            rl.close();

            console.log('\n⏳ Provisioning Coordinator credentials in Supabase Auth...');

            // Create Supabase Auth user
            let coordUserId = null;
            const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
                email: coordEmail,
                password: coordPass,
                email_confirm: true,
                user_metadata: {
                    first_name: firstName,
                    last_name: lastName,
                    middle_name: middleName || '',
                    role: 'admin',
                    school_id: newSchoolId
                }
            });

            if (authErr) {
                if (authErr.message && authErr.message.toLowerCase().includes('already registered')) {
                    const { data: usersList } = await supabase.auth.admin.listUsers();
                    const existing = usersList?.users?.find(u => u.email.toLowerCase() === coordEmail.toLowerCase());
                    if (existing) {
                        coordUserId = existing.id;
                        await supabase.auth.admin.updateUserById(coordUserId, {
                            password: coordPass,
                            email_confirm: true,
                            user_metadata: {
                                first_name: firstName,
                                last_name: lastName,
                                role: 'admin',
                                school_id: newSchoolId
                            }
                        });
                    }
                } else {
                    console.error('❌ Coordinator Auth Error:', authErr.message);
                    process.exitCode = 1;
                    return;
                }
            } else if (authUser?.user) {
                coordUserId = authUser.user.id;
            }

            if (coordUserId) {
                // Upsert Profile
                await supabase.from('profiles').upsert({
                    id: coordUserId,
                    email: coordEmail,
                    first_name: firstName,
                    last_name: lastName,
                    middle_name: middleName || null,
                    role: 'admin',
                    school_id: newSchoolId,
                    is_approved: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id' });

                console.log('\n======================================================');
                console.log('  🎉 COORDINATOR ACCOUNT ASSIGNED & CREATED!          ');
                console.log('======================================================');
                console.log(`👤 Name:     ${firstName} ${lastName}`);
                console.log(`📧 Email:    ${coordEmail}`);
                console.log(`🔑 Password: ${coordPass}`);
                console.log(`🏫 School:   ${newSchoolName} (${newSchoolId})`);
                console.log('======================================================\n');
            }
        } else {
            rl.close();
            console.log('👉 To create a coordinator later, run:');
            console.log(`   node create-coordinator.js --schoolId "${newSchoolId}"\n`);
        }

    } catch (err) {
        console.error('❌ Error:', err);
        if (rl) rl.close();
        process.exitCode = 1;
    }
}

main();
