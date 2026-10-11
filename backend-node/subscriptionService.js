const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

const DATA_DIR = path.join(__dirname, 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

// Available Subscription / Licensing Plans for Educational Institutions
const PLANS = [
    {
        id: 'plan_monthly',
        code: 'monthly',
        name: 'Monthly Institutional License',
        billing_cycle: 'monthly',
        price_php: 2499,
        period_days: 30,
        description: 'Flexible monthly billing per institution to keep system active.',
        features: [
            'Full Coordinator Administrative Dashboard',
            'Unlimited Student Applications & Scholar Records',
            'AI Document OCR & Fraud Detection Engine',
            'Automated Assistance Policy & Matrix Rules',
            'Real-Time Student Notifications & Approaching Deadlines',
            'Enrolled Masterlist Import & Student Verification',
            'Standard Email & In-App Support'
        ]
    },
    {
        id: 'plan_yearly',
        code: 'yearly',
        name: 'Yearly Institutional License',
        billing_cycle: 'yearly',
        price_php: 24990,
        period_days: 365,
        discount_badge: 'Save 17% (2 Months Free)',
        recommended: true,
        description: 'Best value annual license for long-term institutional stability.',
        features: [
            'All features included in Monthly License',
            '2 Months Free (Save ₱4,998 per year)',
            'Priority 24/7 Technical Support & Onboarding',
            'Automated Hourly Backups & Disaster Recovery Guarantee',
            'Official Institutional Certificate of Grantee Licensing',
            'Customizable Assistance Policy Matrices',
            'Guaranteed Price Lock for 3 Years'
        ]
    }
];

// Ensure data folder and subscriptions file exist
function ensureDataStore() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
        // Initialize with default state
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({}, null, 2), 'utf8');
    }
}

// Read subscriptions store from disk
function readSubscriptionsStore() {
    ensureDataStore();
    try {
        const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
        return JSON.parse(raw || '{}');
    } catch (e) {
        console.error('[SubscriptionService] Error reading subscriptions store:', e);
        return {};
    }
}

// Write subscriptions store to disk
function writeSubscriptionsStore(data) {
    ensureDataStore();
    try {
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[SubscriptionService] Error writing subscriptions store:', e);
    }
}

// Helper to seed initial active subscriptions for known schools if not yet set
async function seedDefaultSubscriptionsIfEmpty() {
    try {
        const store = readSubscriptionsStore();
        const { data: schools } = await supabase.from('schools').select('id, name');
        if (!schools || schools.length === 0) return;

        let hasUpdates = false;
        const now = new Date();

        schools.forEach((school, index) => {
            if (!store[school.id]) {
                // Default: Give active yearly or monthly license so existing schools start with active status,
                // but leave one or allow easy simulation so testing expired state is simple!
                const isMonthly = index % 2 === 0;
                const plan = isMonthly ? PLANS[0] : PLANS[1];
                const startDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
                const endDate = new Date(startDate.getTime() + plan.period_days * 24 * 60 * 60 * 1000);

                store[school.id] = {
                    school_id: school.id,
                    school_name: (school.name || 'Institution').trim(),
                    status: 'active',
                    plan_id: plan.id,
                    plan_code: plan.code,
                    plan_name: plan.name,
                    billing_cycle: plan.billing_cycle,
                    price_php: plan.price_php,
                    currency: 'PHP',
                    current_period_start: startDate.toISOString(),
                    current_period_end: endDate.toISOString(),
                    last_payment_date: startDate.toISOString(),
                    last_payment_reference: `GRN-REF-${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
                    last_payment_method: isMonthly ? 'GCash' : 'Institutional Bank Transfer',
                    last_paid_by_coordinator_name: 'School Scholarship Coordinator',
                    last_paid_by_coordinator_email: 'coordinator@school.edu.ph',
                    invoices: [
                        {
                            invoice_number: `INV-${startDate.getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`,
                            transaction_id: `TXN-${startDate.getTime()}-${Math.floor(100 + Math.random() * 900)}`,
                            date: startDate.toISOString(),
                            plan_name: plan.name,
                            billing_cycle: plan.billing_cycle,
                            amount_php: plan.price_php,
                            status: 'Paid',
                            payment_method: isMonthly ? 'GCash' : 'Institutional Bank Transfer',
                            reference_number: `REF-${Math.floor(10000000 + Math.random() * 90000000)}`,
                            paid_by_name: 'School Scholarship Coordinator',
                            paid_by_email: 'coordinator@school.edu.ph',
                            period_covered: `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        }
                    ],
                    updated_at: now.toISOString()
                };
                hasUpdates = true;
            }
        });

        if (hasUpdates) {
            writeSubscriptionsStore(store);
            console.log('[SubscriptionService] Seeded default subscriptions for institutions.');
        }
    } catch (e) {
        console.warn('[SubscriptionService] Seeding default subscriptions skipped:', e.message);
    }
}

// Initial seed trigger
seedDefaultSubscriptionsIfEmpty();

/**
 * Get subscription details for a specific school
 */
async function getSubscriptionStatus(schoolId) {
    if (!schoolId) return null;

    const store = readSubscriptionsStore();
    let record = store[schoolId];

    // If not in store, attempt to fetch school name and create default
    if (!record) {
        let schoolName = 'Assigned Institution';
        try {
            const { data: s } = await supabase.from('schools').select('id, name').eq('id', schoolId).single();
            if (s && s.name) schoolName = s.name.trim();
        } catch (e) {}

        const now = new Date();
        const plan = PLANS[0];
        const startDate = now;
        const endDate = new Date(startDate.getTime() + plan.period_days * 24 * 60 * 60 * 1000);

        record = {
            school_id: schoolId,
            school_name: schoolName,
            status: 'active',
            plan_id: plan.id,
            plan_code: plan.code,
            plan_name: plan.name,
            billing_cycle: plan.billing_cycle,
            price_php: plan.price_php,
            currency: 'PHP',
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
            last_payment_date: startDate.toISOString(),
            last_payment_reference: `GRN-REF-${startDate.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
            last_payment_method: 'GCash',
            last_paid_by_coordinator_name: 'School Scholarship Coordinator',
            last_paid_by_coordinator_email: 'coordinator@school.edu.ph',
            invoices: [],
            updated_at: now.toISOString()
        };

        store[schoolId] = record;
        writeSubscriptionsStore(store);
    }

    // Dynamic expiry evaluation
    const now = new Date();
    const expiryDate = new Date(record.current_period_end);
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

    // If past expiration date and not simulated active, mark expired
    let computedStatus = record.status;
    if (record.status === 'active' && msRemaining <= 0) {
        computedStatus = 'expired';
        record.status = 'expired';
        writeSubscriptionsStore(store);
    }

    return {
        ...record,
        status: computedStatus,
        is_active: computedStatus === 'active',
        days_remaining: Math.max(0, daysRemaining),
        is_expired: computedStatus === 'expired' || msRemaining <= 0,
        is_unpaid: computedStatus === 'unpaid'
    };
}

/**
 * Check school access (used by auth guards for students and coordinators)
 */
async function checkSchoolAccess(schoolId) {
    if (!schoolId) {
        return {
            allowed: false,
            status: 'no_school',
            reason: 'No institution association provided.',
            schoolName: 'Unassigned School'
        };
    }

    const sub = await getSubscriptionStatus(schoolId);
    if (!sub) {
        return {
            allowed: false,
            status: 'not_found',
            reason: 'Institution subscription record not found.',
            schoolName: 'Unknown Institution'
        };
    }

    if (sub.status === 'active' && sub.days_remaining > 0) {
        return {
            allowed: true,
            status: 'active',
            days_remaining: sub.days_remaining,
            plan_name: sub.plan_name,
            school_name: sub.school_name,
            expires_at: sub.current_period_end
        };
    }

    return {
        allowed: false,
        status: sub.status || 'expired',
        days_remaining: 0,
        plan_name: sub.plan_name,
        school_name: sub.school_name,
        expires_at: sub.current_period_end,
        reason: sub.status === 'unpaid' 
            ? 'The institutional subscription has not been paid.' 
            : 'The institutional subscription has expired and requires renewal by the coordinator.'
    };
}

/**
 * Process a subscription payment from a coordinator
 */
async function processPayment({
    schoolId,
    coordinatorId,
    coordinatorName,
    coordinatorEmail,
    planCode = 'monthly',
    paymentMethod = 'GCash',
    referenceNumber,
    amountPaid,
    notes = ''
}) {
    if (!schoolId) throw new Error('schoolId is required');

    const plan = PLANS.find(p => p.code === planCode || p.id === planCode) || PLANS[0];

    // STRICT EXACT AMOUNT ENFORCEMENT: Reject any underpayment
    if (amountPaid !== undefined && amountPaid !== null && amountPaid !== '') {
        const numAmount = Number(amountPaid);
        if (isNaN(numAmount) || numAmount < plan.price_php) {
            throw new Error(`Insufficient payment: The ${plan.name} requires the exact amount of ₱${plan.price_php.toLocaleString()}. Received ₱${(numAmount || 0).toLocaleString()}. Underpayments cannot activate system access.`);
        }
    }

    const store = readSubscriptionsStore();
    const currentSub = store[schoolId] || await getSubscriptionStatus(schoolId);

    const now = new Date();
    // If current subscription is still active and not expired, add to current expiry; otherwise start from now
    let periodStart = now;
    let periodEnd = new Date(now.getTime() + plan.period_days * 24 * 60 * 60 * 1000);

    if (currentSub && currentSub.status === 'active' && new Date(currentSub.current_period_end) > now) {
        periodStart = new Date(currentSub.current_period_start);
        const currentEnd = new Date(currentSub.current_period_end);
        periodEnd = new Date(currentEnd.getTime() + plan.period_days * 24 * 60 * 60 * 1000);
    }

    const txnId = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoiceNum = `INV-${now.getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
    const cleanRef = (referenceNumber || `REF-${Math.floor(10000000 + Math.random() * 90000000)}`).trim();

    // Anti-fraud validation: prevent duplicate reference number redemption
    if (cleanRef) {
        for (const sId of Object.keys(store)) {
            const sub = store[sId];
            if (sub && Array.isArray(sub.invoices)) {
                const existing = sub.invoices.find(inv =>
                    inv.reference_number &&
                    inv.reference_number.toLowerCase() === cleanRef.toLowerCase()
                );
                if (existing) {
                    throw new Error(`Payment reference "${cleanRef}" has already been recorded for invoice ${existing.invoice_number}. Duplicate submissions are not permitted.`);
                }
            }
        }
    }

    const newInvoice = {
        invoice_number: invoiceNum,
        transaction_id: txnId,
        date: now.toISOString(),
        plan_name: plan.name,
        plan_code: plan.code,
        billing_cycle: plan.billing_cycle,
        amount_php: plan.price_php,
        status: 'Paid',
        payment_method: paymentMethod,
        reference_number: cleanRef,
        paid_by_name: coordinatorName || 'School Coordinator',
        paid_by_email: coordinatorEmail || 'coordinator@school.edu.ph',
        paid_by_coordinator_id: coordinatorId || null,
        period_covered: `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        notes: notes || 'Processed via Coordinator Account Portal'
    };

    const invoices = Array.isArray(currentSub.invoices) ? [...currentSub.invoices] : [];
    invoices.unshift(newInvoice);

    const updatedRecord = {
        ...currentSub,
        school_id: schoolId,
        school_name: currentSub.school_name || 'Institution',
        status: 'active',
        plan_id: plan.id,
        plan_code: plan.code,
        plan_name: plan.name,
        billing_cycle: plan.billing_cycle,
        price_php: plan.price_php,
        currency: 'PHP',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        last_payment_date: now.toISOString(),
        last_payment_reference: cleanRef,
        last_payment_method: paymentMethod,
        last_paid_by_coordinator_id: coordinatorId || null,
        last_paid_by_coordinator_name: coordinatorName || 'School Coordinator',
        last_paid_by_coordinator_email: coordinatorEmail || 'coordinator@school.edu.ph',
        invoices: invoices,
        updated_at: now.toISOString()
    };

    store[schoolId] = updatedRecord;
    writeSubscriptionsStore(store);

    // Record in Supabase audit_logs for cloud persistence and compliance tracking
    try {
        await supabase.from('audit_logs').insert([{
            school_id: schoolId,
            admin_id: coordinatorId || null,
            module: 'Subscription',
            action: 'Subscription Payment Processed',
            details: JSON.stringify({
                event: 'SUBSCRIPTION_RENEWED',
                plan: plan.name,
                billing_cycle: plan.billing_cycle,
                amount_php: plan.price_php,
                payment_method: paymentMethod,
                reference_number: cleanRef,
                invoice_number: invoiceNum,
                expires_at: periodEnd.toISOString(),
                coordinator_name: coordinatorName,
                timestamp: now.toISOString()
            })
        }]);
    } catch (auditErr) {
        console.warn('[SubscriptionService] Cloud audit logging skipped:', auditErr.message);
    }

    return {
        success: true,
        message: `Subscription successfully renewed for ${plan.name}! System access is fully active.`,
        subscription: {
            ...updatedRecord,
            is_active: true,
            days_remaining: Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        },
        invoice: newInvoice
    };
}

/**
 * Simulate status (Active, Expired, Unpaid) for testing and demonstration
 */
async function simulateStatus(schoolId, newStatus) {
    if (!['active', 'expired', 'unpaid'].includes(newStatus)) {
        throw new Error("Invalid status. Allowed values: 'active', 'expired', 'unpaid'");
    }

    const store = readSubscriptionsStore();
    const currentSub = store[schoolId] || await getSubscriptionStatus(schoolId);
    const now = new Date();

    let newStart = new Date(currentSub.current_period_start || now);
    let newEnd = new Date(currentSub.current_period_end || now);

    if (newStatus === 'active') {
        newStart = now;
        newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days active
    } else if (newStatus === 'expired') {
        newStart = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
        newEnd = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // expired 5 days ago
    } else if (newStatus === 'unpaid') {
        newStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
        newEnd = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // unpaid
    }

    const updated = {
        ...currentSub,
        status: newStatus,
        current_period_start: newStart.toISOString(),
        current_period_end: newEnd.toISOString(),
        updated_at: now.toISOString()
    };

    store[schoolId] = updated;
    writeSubscriptionsStore(store);

    // Audit log
    try {
        await supabase.from('audit_logs').insert([{
            school_id: schoolId,
            module: 'Subscription',
            action: `Simulated Subscription Status: ${newStatus.toUpperCase()}`,
            details: JSON.stringify({
                status: newStatus,
                expires_at: newEnd.toISOString(),
                simulated_at: now.toISOString()
            })
        }]);
    } catch (e) {}

    const daysRemaining = Math.max(0, Math.ceil((newEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    return {
        success: true,
        school_id: schoolId,
        status: newStatus,
        days_remaining: daysRemaining,
        message: `Subscription status for ${currentSub.school_name} changed to "${newStatus.toUpperCase()}".`
    };
}


/**
 * 10. Get Online Payment & Real Receiving Bank Configuration
 */
function getPaymentConfig() {
    const paymongoKey = process.env.PAYMONGO_SECRET_KEY || '';
    const isLive = paymongoKey.startsWith('sk_live_');
    const isTest = paymongoKey.startsWith('sk_test_');

    return {
        success: true,
        currency: 'PHP',
        paymongo_configured: !!paymongoKey,
        paymongo_mode: isLive ? 'live' : (isTest ? 'test' : 'unconfigured'),
        paymongo_public_key: process.env.PAYMONGO_PUBLIC_KEY || '',
        receiving_accounts: {
            banks: [
                {
                    id: 'bank_landbank',
                    bank_name: process.env.RECEIVING_BANK_1_NAME || 'Landbank of the Philippines',
                    account_name: process.env.RECEIVING_BANK_1_ACCOUNT_NAME || 'Grantee Educational Technologies Inc.',
                    account_number: process.env.RECEIVING_BANK_1_ACCOUNT_NUMBER || '0912-3841-88',
                    branch: process.env.RECEIVING_BANK_1_BRANCH || 'Institutional Government Hub',
                    is_primary: true
                },
                {
                    id: 'bank_bdo',
                    bank_name: process.env.RECEIVING_BANK_2_NAME || 'BDO Unibank',
                    account_name: process.env.RECEIVING_BANK_2_ACCOUNT_NAME || 'Grantee Educational Technologies Inc.',
                    account_number: process.env.RECEIVING_BANK_2_ACCOUNT_NUMBER || '0048-2918-4921',
                    branch: process.env.RECEIVING_BANK_2_BRANCH || 'Corporate Banking Center'
                },
                {
                    id: 'bank_bpi',
                    bank_name: process.env.RECEIVING_BANK_3_NAME || 'Bank of the Philippine Islands (BPI)',
                    account_name: process.env.RECEIVING_BANK_3_ACCOUNT_NAME || 'Grantee Educational Technologies Inc.',
                    account_number: process.env.RECEIVING_BANK_3_ACCOUNT_NUMBER || '2841-9920-14',
                    branch: process.env.RECEIVING_BANK_3_BRANCH || 'Ayala Commercial Branch'
                }
            ],
            wallets: [
                {
                    id: 'wallet_gcash',
                    wallet_name: 'GCash Corporate Merchant',
                    account_name: process.env.RECEIVING_GCASH_NAME || 'Grantee Platform Merchant',
                    mobile_number: process.env.RECEIVING_GCASH_NUMBER || '0917-123-4567',
                    qr_image: process.env.RECEIVING_GCASH_QR_IMAGE || 'assets/gcash-qr.png'
                },
                {
                    id: 'wallet_maya',
                    wallet_name: 'Maya Business / QR Ph',
                    account_name: process.env.RECEIVING_MAYA_NAME || 'Grantee Platform Merchant',
                    mobile_number: process.env.RECEIVING_MAYA_NUMBER || '0918-987-6543'
                }
            ]
        }
    };
}

/**
 * 11. Create PayMongo Checkout Session (GCash, Maya, Cards, Direct Bank)
 */
async function createPaymongoCheckoutSession({
    schoolId,
    planCode = 'yearly',
    coordinatorId,
    coordinatorName,
    coordinatorEmail,
    successUrl,
    cancelUrl
}) {
    if (!schoolId) throw new Error('schoolId is required');

    const paymongoKey = process.env.PAYMONGO_SECRET_KEY;
    const plan = PLANS.find(p => p.code === planCode || p.id === planCode) || PLANS[1];
    const store = readSubscriptionsStore();
    const currentSub = store[schoolId] || await getSubscriptionStatus(schoolId);
    const schoolName = currentSub?.school_name || 'Educational Institution';

    if (!paymongoKey) {
        return {
            configured: false,
            message: 'PAYMONGO_SECRET_KEY is not configured in the server environment. Please set PAYMONGO_SECRET_KEY in your Render dashboard (Environment Variables) or backend-node/.env.',
            plan: plan,
            schoolName: schoolName
        };
    }

    const authHeader = 'Basic ' + Buffer.from(paymongoKey + ':').toString('base64');
    const amountInCentavos = plan.price_php * 100;

    const frontendBase = process.env.FRONTEND_URL || 'http://127.0.0.1:5500/frontend';
    const defSuccess = `${frontendBase}/admin-subscription.html?payment=success&school_id=${schoolId}&session_id={CHECKOUT_SESSION_ID}`;
    const defCancel = `${frontendBase}/admin-subscription.html?payment=cancelled&school_id=${schoolId}`;

    // Standard universally enabled payment methods on all PayMongo accounts (Cards, GCash, Maya)
    const customMethods = process.env.PAYMONGO_PAYMENT_METHODS
        ? process.env.PAYMONGO_PAYMENT_METHODS.split(',').map(m => m.trim().toLowerCase())
        : null;
    const initialPaymentMethods = customMethods || ['card', 'gcash', 'paymaya'];

    const payload = {
        data: {
            attributes: {
                billing: {
                    name: coordinatorName || 'School Coordinator',
                    email: coordinatorEmail || 'coordinator@school.edu.ph'
                },
                send_email_receipt: true,
                show_description: true,
                show_line_items: true,
                description: `Grantee Institutional Licensing (${plan.name}) for ${schoolName}`,
                line_items: [
                    {
                        amount: amountInCentavos,
                        currency: 'PHP',
                        description: `${plan.name} - 1 Institution (${plan.billing_cycle})`,
                        name: `Grantee License: ${schoolName}`,
                        quantity: 1
                    }
                ],
                payment_method_types: initialPaymentMethods,
                success_url: successUrl || defSuccess,
                cancel_url: cancelUrl || defCancel,
                metadata: {
                    school_id: schoolId,
                    school_name: schoolName,
                    plan_code: plan.code,
                    coordinator_id: coordinatorId || '',
                    coordinator_name: coordinatorName || '',
                    coordinator_email: coordinatorEmail || ''
                }
            }
        }
    };

    const res = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (!res.ok) {
        // Automatic fallback: If optional channels fail or are not activated, retry with core types (card, gcash)
        if (payload.data.attributes.payment_method_types.length > 2) {
            payload.data.attributes.payment_method_types = ['card', 'gcash'];
            const retryRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(payload)
            });
            const retryData = await retryRes.json();
            if (retryRes.ok) {
                const sessionObj = retryData.data;
                return {
                    configured: true,
                    success: true,
                    checkout_url: sessionObj.attributes.checkout_url,
                    session_id: sessionObj.id,
                    plan: plan
                };
            }
            data = retryData;
        }

        const errorMsg = data.errors ? data.errors.map(e => e.detail).join(', ') : 'PayMongo API request failed';
        console.error('PayMongo API Error Details:', errorMsg, JSON.stringify(data));
        throw new Error(errorMsg);
    }

    const sessionObj = data.data;
    return {
        configured: true,
        success: true,
        checkout_url: sessionObj.attributes.checkout_url,
        session_id: sessionObj.id,
        plan: plan
    };
}

/**
 * 12. Verify PayMongo Checkout Session upon Return
 */
async function verifyPaymongoSession(sessionId) {
    if (!sessionId) throw new Error('sessionId is required');
    const paymongoKey = process.env.PAYMONGO_SECRET_KEY;
    if (!paymongoKey) throw new Error('PAYMONGO_SECRET_KEY is not configured in backend-node/.env.');

    const authHeader = 'Basic ' + Buffer.from(paymongoKey + ':').toString('base64');
    const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Authorization': authHeader
        }
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.errors ? data.errors.map(e => e.detail).join(', ') : 'Failed to look up PayMongo session');
    }

    const sessionAttrs = data.data.attributes;
    const metadata = sessionAttrs.metadata || {};
    const payments = sessionAttrs.payments || [];
    const isPaid = sessionAttrs.status === 'paid' || (payments.length > 0 && payments[0].attributes?.status === 'paid');

    if (isPaid && metadata.school_id) {
        const paymentObj = payments[0]?.attributes || {};
        const paymentSource = paymentObj.source?.type ? paymentObj.source.type.toUpperCase() : 'ONLINE';
        const referenceNumber = paymentObj.id || sessionId;

        const result = await processPayment({
            schoolId: metadata.school_id,
            coordinatorId: metadata.coordinator_id,
            coordinatorName: metadata.coordinator_name || sessionAttrs.billing?.name,
            coordinatorEmail: metadata.coordinator_email || sessionAttrs.billing?.email,
            planCode: metadata.plan_code || 'yearly',
            paymentMethod: `PayMongo (${paymentSource})`,
            referenceNumber: referenceNumber,
            notes: `Verified PayMongo Checkout Session ${sessionId}`
        });

        return {
            paid: true,
            school_id: metadata.school_id,
            result: result
        };
    }

    return {
        paid: false,
        status: sessionAttrs.status,
        school_id: metadata.school_id
    };
}

/**
 * 13. PayMongo Webhook Event Handler
 */
async function handlePaymongoWebhook(eventBody) {
    const eventType = eventBody?.data?.attributes?.type;
    const eventData = eventBody?.data?.attributes?.data;

    if (eventType === 'checkout_session.payment.paid') {
        const sessionAttrs = eventData.attributes;
        const metadata = sessionAttrs.metadata || {};
        const payments = sessionAttrs.payments || [];
        const paymentObj = payments[0]?.attributes || {};

        if (metadata.school_id) {
            return await processPayment({
                schoolId: metadata.school_id,
                coordinatorId: metadata.coordinator_id,
                coordinatorName: metadata.coordinator_name || sessionAttrs.billing?.name,
                coordinatorEmail: metadata.coordinator_email || sessionAttrs.billing?.email,
                planCode: metadata.plan_code || 'yearly',
                paymentMethod: `PayMongo Webhook (${(paymentObj.source?.type || 'E-WALLET').toUpperCase()})`,
                referenceNumber: paymentObj.id || sessionAttrs.id,
                notes: 'Settled via PayMongo Webhook'
            });
        }
    }
    return { received: true };
}

module.exports = {
    PLANS,
    getSubscriptionStatus,
    checkSchoolAccess,
    processPayment,
    simulateStatus,
    readSubscriptionsStore,
    getPaymentConfig,
    createPaymongoCheckoutSession,
    verifyPaymongoSession,
    handlePaymongoWebhook
};

