/**
 * admin-subscription.js
 * Coordinator Institutional Subscription & Licensing Controller
 */

(function () {
    'use strict';

    let currentCoordinatorProfile = null;
    let currentAdminSchoolId = null;
    let currentAdminSchoolName = 'Your Institution';
    let currentSubscription = null;
    let cachedPaymentConfig = null;
    let selectedPlanCode = 'yearly';
    let selectedPaymentMethod = 'GCash';

    const PLAN_DETAILS = {
        trial: {
            id: 'plan_trial',
            name: '14-Day Free Tier License',
            cycle: 'Free Tier (14 Days)',
            amount: 0,
            displayAmount: 'FREE (14 Days)'
        },
        monthly: {
            id: 'plan_monthly',
            name: 'Monthly Institutional License',
            cycle: 'Monthly (30 Days)',
            amount: 2499,
            displayAmount: '₱2,499.00'
        },
        yearly: {
            id: 'plan_yearly',
            name: 'Yearly Institutional License',
            cycle: 'Annual (365 Days)',
            amount: 24990,
            displayAmount: '₱24,990.00'
        }
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (window.lucide && lucide.createIcons) {
            lucide.createIcons();
        }

        await initCoordinatorData();
        setupEventListeners();
    });

    /**
     * 1. Initialize coordinator and load subscription details
     */
    async function initCoordinatorData() {
        try {
            // Check Supabase session
            if (!window.supabaseClient) {
                console.warn('Supabase client missing.');
                return;
            }

            const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
            if (sessionError || !session) {
                window.location.replace('login.html');
                return;
            }

            const userId = session.user.id;

            // Fetch profile with resilient fallbacks
            let profile = null;
            try {
                const { data, error: profileErr } = await window.supabaseClient
                    .from('profiles')
                    .select('*, schools(name)')
                    .eq('id', userId)
                    .single();
                if (!profileErr && data) {
                    profile = data;
                } else {
                    console.warn('[AdminSubscription] Direct relation query warning:', profileErr);
                    const { data: directData } = await window.supabaseClient
                        .from('profiles')
                        .select('*')
                        .eq('id', userId)
                        .single();
                    if (directData) profile = directData;
                }
            } catch (pErr) {
                console.warn('[AdminSubscription] Error fetching coordinator profile:', pErr);
            }

            // Fallback from sessionStorage if Supabase profiles query had issues
            if (!profile) {
                try {
                    const cached = JSON.parse(sessionStorage.getItem('grantee_admin_profile') || '{}');
                    if (cached && (cached.id || cached.school_id)) {
                        profile = cached;
                    }
                } catch (e) {}
            }

            currentCoordinatorProfile = profile;
            currentAdminSchoolId = profile?.school_id ||
                                   sessionStorage.getItem('grantee_school_id') ||
                                   localStorage.getItem('grantee_pending_paymongo_school_id') ||
                                   localStorage.getItem('granteeSelectedSchoolId') ||
                                   new URLSearchParams(window.location.search).get('school_id') ||
                                   '5be5d841-5b39-4016-860b-6d04c384d11b';

            currentAdminSchoolName = (profile?.schools && profile.schools.name)
                ? profile.schools.name.trim()
                : (profile?.school_name || 'Cebu Roosevelt Memorial Colleges, Inc.');

            // Load Payment Configuration (Receiving Accounts & PayMongo status)
            try {
                cachedPaymentConfig = await window.SubscriptionClient.getPaymentConfig();
            } catch (err) {
                console.warn('Could not load payment config:', err);
            }

            // Update Header Name
            const nameEl = document.getElementById('header-name');
            const schoolDisplayEl = document.getElementById('admin-school-display');
            if (nameEl) {
                nameEl.innerText = `${profile.first_name || 'Coordinator'} ${profile.last_name || ''}`.trim();
            }
            if (schoolDisplayEl) {
                schoolDisplayEl.innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>${currentAdminSchoolName}</span>`;
            }

            // Check if returning from PayMongo online payment redirect
            const urlParams = new URLSearchParams(window.location.search);
            const paymentParam = urlParams.get('payment');
            const sessionIdParam = urlParams.get('session_id');

            if (paymentParam === 'success') {
                let effectiveSessionId = sessionIdParam;
                if (!effectiveSessionId || effectiveSessionId === '{CHECKOUT_SESSION_ID}' || effectiveSessionId.includes('{')) {
                    try {
                        effectiveSessionId = localStorage.getItem('grantee_pending_paymongo_session_id');
                    } catch (e) {}
                }
                const effectiveSchoolId = urlParams.get('school_id') || currentAdminSchoolId || localStorage.getItem('grantee_pending_paymongo_school_id');

                let verificationResult = null;
                let verificationError = null;

                // Pre-check: If PayMongo Webhook already settled this transaction in the background, skip verify call to prevent duplicate entry
                let alreadySettledInvoice = null;
                try {
                    const freshDetails = await window.SubscriptionClient.getDetails(effectiveSchoolId, true);
                    if (freshDetails && Array.isArray(freshDetails.invoices)) {
                        const nowMs = Date.now();
                        alreadySettledInvoice = freshDetails.invoices.find(inv => {
                            const invTime = new Date(inv.date).getTime();
                            const isRecent = (nowMs - invTime) < 5 * 60 * 1000;
                            const isPaymongo = (inv.payment_method && inv.payment_method.includes('PayMongo')) ||
                                               (inv.notes && inv.notes.includes('PayMongo'));
                            const matchesSession = Boolean(effectiveSessionId && (
                                (inv.reference_number && inv.reference_number.toLowerCase() === effectiveSessionId.toLowerCase()) ||
                                (inv.notes && inv.notes.includes(effectiveSessionId))
                            ));
                            return (isRecent && isPaymongo) || matchesSession;
                        });
                    }
                } catch (e) {
                    console.warn('[AdminSubscription] Pre-check for webhook settlement failed:', e);
                }

                if (alreadySettledInvoice) {
                    console.log('[AdminSubscription] Transaction was already settled via PayMongo Webhook. Skipping redirect verification call to prevent duplicate entry:', alreadySettledInvoice.invoice_number);
                    verificationResult = {
                        paid: true,
                        already_recorded: true,
                        invoice: alreadySettledInvoice
                    };
                } else if (effectiveSessionId || effectiveSchoolId) {
                    try {
                        verificationResult = await window.SubscriptionClient.verifyCheckoutSession(
                            effectiveSessionId || 'pending',
                            effectiveSchoolId
                        );
                    } catch (e) {
                        console.error('PayMongo session verification error:', e);
                        verificationError = e;
                    }
                }

                if (verificationResult && verificationResult.paid) {
                    try {
                        localStorage.removeItem('grantee_pending_paymongo_session_id');
                        localStorage.removeItem('grantee_pending_paymongo_school_id');
                    } catch (e) {}
                }

                // Clean URL query parameters to avoid re-triggering check on page refresh
                try {
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (e) {}

                await refreshSubscriptionData(true);

                if (verificationResult && verificationResult.paid) {
                    if (window.Swal) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Payment Confirmed & Recorded!',
                            html: `
                                <p style="font-size: 14px; color: #475569; text-align: left; line-height: 1.5;">
                                    Your online payment via PayMongo was successfully verified and recorded! Full system access for <strong>${currentAdminSchoolName}</strong> and all enrolled student accounts is now completely unlocked.
                                </p>
                            `,
                            confirmButtonText: 'View Official Receipt',
                            showCancelButton: true,
                            cancelButtonText: 'Go to Dashboard',
                            confirmButtonColor: '#1F3D2E'
                        }).then(res => {
                            if (res.isConfirmed && currentSubscription?.invoices?.length > 0) {
                                openReceiptModal(currentSubscription.invoices[0]);
                            } else if (!res.isConfirmed) {
                                window.location.href = 'admin-dashboard.html';
                            }
                        });
                    }
                } else {
                    if (window.Swal) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Payment Verification Incomplete',
                            html: `
                                <p style="font-size: 14px; color: #475569; text-align: left; line-height: 1.5;">
                                    ${verificationError ? `We encountered an issue verifying the payment: <code>${verificationError.message}</code>.` : 'The transaction was not recognized as paid by the payment gateway.'}
                                </p>
                                <p style="font-size: 12.5px; color: #64748b; margin-top: 8px;">
                                    If funds were deducted, please contact support with your PayMongo transaction reference number.
                                </p>
                            `,
                            confirmButtonColor: '#1F3D2E'
                        });
                    }
                }
                return;
            } else if (paymentParam === 'cancelled') {
                try {
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (e) {}

                if (window.Swal) {
                    Swal.fire({
                        icon: 'info',
                        title: 'Payment Cancelled',
                        text: 'The online payment session was cancelled. You can choose a payment method whenever ready.',
                        confirmButtonColor: '#1F3D2E'
                    });
                }
            }

            // Load Subscription Data
            await refreshSubscriptionData();

            // Check if redirected with ?expired=true parameter
            if (urlParams.get('expired') === 'true' && currentSubscription && !currentSubscription.is_active) {
                if (window.Swal) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Institutional License Inactive',
                        html: `
                            <p style="font-size: 14px; color: #475569; text-align: left; line-height: 1.5;">
                                Access to administrative functions and student accounts for <strong>${currentAdminSchoolName}</strong> is currently paused because the institutional subscription is expired or unpaid.
                                <br><br>
                                Please choose a licensing plan below and complete payment to restore full institutional operations.
                            </p>
                        `,
                        confirmButtonText: 'Select Plan & Pay',
                        confirmButtonColor: '#1F3D2E'
                    });
                }
            }

        } catch (err) {
            console.error('[AdminSubscription] Init error:', err);
        }
    }

    /**
     * 2. Refresh subscription details from backend / Supabase
     */
    async function refreshSubscriptionData(forceFresh = true) {
        if (!currentAdminSchoolId) return;

        try {
            const sub = await window.SubscriptionClient.getDetails(currentAdminSchoolId, forceFresh);
            currentSubscription = sub;

            renderSubscriptionHero(sub);
            renderInvoicesTable(sub ? sub.invoices : []);

            if (window.lucide && lucide.createIcons) {
                lucide.createIcons();
            }
        } catch (err) {
            console.error('[AdminSubscription] Refresh error:', err);
        }
    }

    /**
     * 3. Render Status Hero Card
     */
    function renderSubscriptionHero(sub) {
        if (!sub) return;

        const schoolTitleEl = document.getElementById('hero-school-title');
        const statusPillEl = document.getElementById('hero-status-pill');
        const planTextEl = document.getElementById('hero-plan-text');
        const coordinatorTextEl = document.getElementById('hero-coordinator-text');
        const alertBannerEl = document.getElementById('hero-alert-banner');

        const metricStatusEl = document.getElementById('metric-status-val');
        const metricDaysEl = document.getElementById('metric-days-val');
        const metricExpiryEl = document.getElementById('metric-expiry-val');
        const metricRefEl = document.getElementById('metric-ref-val');
        const renewHeroBtn = document.getElementById('btn-renew-hero');
        const renewHeroBtnLabel = document.getElementById('btn-renew-hero-label');

        if (schoolTitleEl) schoolTitleEl.innerText = sub.school_name || currentAdminSchoolName;
        if (planTextEl) planTextEl.innerHTML = `<i data-lucide="tag" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> ${sub.plan_name || 'Standard License'}`;
        if (coordinatorTextEl) {
            const payer = sub.last_paid_by_coordinator_name || (currentCoordinatorProfile ? `${currentCoordinatorProfile.first_name} ${currentCoordinatorProfile.last_name}` : 'Coordinator');
            coordinatorTextEl.innerHTML = `<i data-lucide="user-check" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i> Payer: ${payer}`;
        }

        const isExpired = sub.is_expired || sub.status === 'expired';
        const isUnpaid = sub.status === 'unpaid';
        const isActive = sub.status === 'active' && !isExpired && !isUnpaid;

        // Metric values
        if (metricDaysEl) metricDaysEl.innerText = `${sub.days_remaining} ${sub.days_remaining === 1 ? 'day' : 'days'}`;
        if (metricRefEl) metricRefEl.innerText = sub.last_payment_reference || 'None (Unpaid)';
        
        if (metricExpiryEl && sub.current_period_end) {
            const expDate = new Date(sub.current_period_end);
            metricExpiryEl.innerText = expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }

        if (isActive) {
            const isTrial = sub.plan_code === 'trial' || sub.plan_id === 'plan_trial' || Number(sub.price_php) === 0;
            if (statusPillEl) {
                statusPillEl.className = 'status-badge-pill status-badge-active';
                statusPillEl.innerHTML = isTrial
                    ? `<i data-lucide="sparkles" style="width: 15px; height: 15px;"></i> 2-Week Free Tier Active`
                    : `<i data-lucide="check-circle-2" style="width: 15px; height: 15px;"></i> Active License`;
            }
            if (metricStatusEl) {
                metricStatusEl.innerText = isTrial ? 'Active (Free Tier)' : 'Active (Paid)';
                metricStatusEl.style.color = '#10b981';
            }
            if (alertBannerEl) {
                if (isTrial && sub.days_remaining <= 5) {
                    alertBannerEl.style.display = 'flex';
                    alertBannerEl.className = 'sub-alert-box sub-alert-warning';
                    alertBannerEl.innerHTML = `
                        <div class="sub-alert-icon">✨</div>
                        <div>
                            <strong>Free Tier Evaluation: ${sub.days_remaining} Day${sub.days_remaining === 1 ? '' : 's'} Remaining</strong><br>
                            Your institution has full access under the complimentary 14-day free tier. Choose a monthly or yearly plan below anytime to ensure uninterrupted access.
                        </div>
                    `;
                } else {
                    alertBannerEl.style.display = 'none';
                }
            }
            if (renewHeroBtn) renewHeroBtn.className = 'btn-select-plan btn-select-monthly';
            if (renewHeroBtnLabel) renewHeroBtnLabel.innerText = isTrial ? 'Upgrade to Paid License' : 'Renew / Extend License';

        } else if (isExpired) {
            if (statusPillEl) {
                statusPillEl.className = 'status-badge-pill status-badge-expired';
                statusPillEl.innerHTML = `<i data-lucide="alert-octagon" style="width: 15px; height: 15px;"></i> License Expired`;
            }
            if (metricStatusEl) {
                metricStatusEl.innerText = 'Expired (Locked)';
                metricStatusEl.style.color = '#ef4444';
            }
            if (alertBannerEl) {
                alertBannerEl.style.display = 'flex';
                alertBannerEl.className = 'sub-alert-box sub-alert-expired';
                alertBannerEl.innerHTML = `
                    <div class="sub-alert-icon">⚠️</div>
                    <div>
                        <strong>Access Restricted: Institutional License Expired</strong><br>
                        Your school's subscription has expired. Students and coordinators cannot access the regular dashboard until this fee is processed. Select a plan below to immediately restore access.
                    </div>
                `;
            }
            if (renewHeroBtn) renewHeroBtn.className = 'btn-select-plan btn-select-yearly';
            if (renewHeroBtnLabel) renewHeroBtnLabel.innerText = '⚠️ Renew License Now';

        } else {
            // Unpaid
            if (statusPillEl) {
                statusPillEl.className = 'status-badge-pill status-badge-unpaid';
                statusPillEl.innerHTML = `<i data-lucide="alert-triangle" style="width: 15px; height: 15px;"></i> Payment Overdue`;
            }
            if (metricStatusEl) {
                metricStatusEl.innerText = 'Unpaid';
                metricStatusEl.style.color = '#d97706';
            }
            if (alertBannerEl) {
                alertBannerEl.style.display = 'flex';
                alertBannerEl.className = 'sub-alert-box sub-alert-warning';
                alertBannerEl.innerHTML = `
                    <div class="sub-alert-icon">⏳</div>
                    <div>
                        <strong>Action Required: Institutional Fee Unpaid</strong><br>
                        No active payment record found. To keep Grantee running, please pay the monthly or annual fee for ${sub.school_name}.
                    </div>
                `;
            }
            if (renewHeroBtn) renewHeroBtn.className = 'btn-select-plan btn-select-yearly';
            if (renewHeroBtnLabel) renewHeroBtnLabel.innerText = 'Pay Subscription Fee';
        }
    }

    let displayedInvoices = [];

    function deduplicateInvoicesForDisplay(invoices) {
        if (!Array.isArray(invoices) || invoices.length === 0) return [];
        const unique = [];

        for (const inv of invoices) {
            const isDuplicate = unique.some(kept => {
                const timeDiff = Math.abs(new Date(inv.date).getTime() - new Date(kept.date).getTime());
                const sameAmount = Number(inv.amount_php) === Number(kept.amount_php);
                const bothPaymongo = (
                    (inv.payment_method?.includes('PayMongo') && kept.payment_method?.includes('PayMongo')) ||
                    (inv.notes?.includes('PayMongo') && kept.notes?.includes('PayMongo'))
                );
                const sameRef = inv.reference_number && kept.reference_number &&
                                inv.reference_number.toLowerCase() === kept.reference_number.toLowerCase();
                const crossRef = Boolean(
                    (inv.notes && kept.reference_number && inv.notes.includes(kept.reference_number)) ||
                    (kept.notes && inv.reference_number && kept.notes.includes(inv.reference_number))
                );

                return (bothPaymongo && sameAmount && timeDiff < 60000) || sameRef || crossRef;
            });

            if (!isDuplicate) {
                const displayInv = { ...inv };
                if (displayInv.payment_method && displayInv.payment_method.includes('PayMongo Webhook')) {
                    displayInv.payment_method = displayInv.payment_method.replace('PayMongo Webhook', 'PayMongo');
                }
                unique.push(displayInv);
            }
        }
        return unique;
    }

    /**
     * 4. Render Billing & Invoice History Table
     */
    function renderInvoicesTable(invoices) {
        displayedInvoices = deduplicateInvoicesForDisplay(invoices);
        const tbody = document.getElementById('invoices-tbody');
        if (!tbody) return;

        if (!displayedInvoices || displayedInvoices.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 28px;">
                        No previous payment invoices found for this institution.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        displayedInvoices.forEach((inv, index) => {
            const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
            const isComplimentary = Number(inv.amount_php || 0) === 0 || inv.status === 'Complimentary';
            const amountStr = isComplimentary ? 'FREE' : `₱${Number(inv.amount_php || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            const pillHtml = isComplimentary
                ? `<span class="invoice-pill-paid" style="background: rgba(16, 185, 129, 0.15); color: #047857; border-color: rgba(16, 185, 129, 0.3);">✓ Free Tier</span>`
                : `<span class="invoice-pill-paid">✓ Paid</span>`;

            html += `
                <tr>
                    <td style="font-weight: 700; font-family: monospace; color: var(--text-main);">${inv.invoice_number || 'INV-0000'}</td>
                    <td>${dateStr}</td>
                    <td>
                        <span style="font-weight: 600;">${inv.plan_name || 'Standard License'}</span>
                        <div style="font-size: 11px; color: var(--text-muted);">${inv.period_covered || ''}</div>
                    </td>
                    <td>
                        <span style="display: inline-flex; align-items: center; gap: 4px;">
                            <span style="font-weight: 600;">${inv.payment_method || 'GCash'}</span>
                        </span>
                        <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">Ref: ${inv.reference_number || 'N/A'}</div>
                    </td>
                    <td style="font-weight: 800; color: #1F3D2E;">${amountStr}</td>
                    <td>${pillHtml}</td>
                    <td>${inv.paid_by_name || 'Coordinator'}</td>
                    <td>
                        <button type="button" class="btn-receipt-view" onclick="openReceiptFromHistory(${index})">
                            <i data-lucide="eye" style="width: 14px; height: 14px;"></i> View Receipt
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    /**
     * 5. Open Checkout Modal (PayMongo Gateway)
     */
    window.openCheckoutModal = function (planCode = 'yearly') {
        selectedPlanCode = planCode;
        const plan = PLAN_DETAILS[planCode] || PLAN_DETAILS.yearly;

        const modal = document.getElementById('checkout-modal');
        const modalSchool = document.getElementById('modal-summary-school');
        const modalPlan = document.getElementById('modal-summary-plan');
        const modalCycle = document.getElementById('modal-summary-cycle');
        const modalTotal = document.getElementById('modal-summary-total');
        const btnPaymongoLabel = document.getElementById('btn-paymongo-label');

        if (modalSchool) modalSchool.innerText = currentAdminSchoolName || 'Your Institution';
        if (modalPlan) modalPlan.innerText = plan.name;
        if (modalCycle) modalCycle.innerText = plan.cycle;
        if (modalTotal) modalTotal.innerText = plan.displayAmount;
        if (btnPaymongoLabel) btnPaymongoLabel.innerText = `Pay with PayMongo (${plan.displayAmount})`;

        if (modal) modal.classList.add('show');
        if (window.lucide && lucide.createIcons) lucide.createIcons();
    };

    window.closeCheckoutModal = function () {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.remove('show');
    };

    /**
     * Compatibility stubs for legacy payment channels
     */
    window.selectPaymentMethod = function () {};
    window.onBankSelectChange = function () {};
    window.copyReceivingAccountNumber = function () {};

    /**
     * 6.5 Initiate PayMongo Online Checkout (Automated E-Wallet / Card Gateway)
     */
    window.initiatePaymongoOnlineCheckout = async function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();

        if (window._isInitiatingPaymongoCheckout) {
            console.log('[AdminSubscription] Checkout initiation already in progress, skipping duplicate.');
            return;
        }
        window._isInitiatingPaymongoCheckout = true;

        const btn = document.getElementById('btn-paymongo-checkout');
        const originalText = btn ? btn.innerHTML : 'Proceed to Secure Checkout with PayMongo';

        // Robust resolution of school ID with multiple reliable fallbacks
        let effectiveSchoolId = currentAdminSchoolId || currentCoordinatorProfile?.school_id;

        if (!effectiveSchoolId) {
            try {
                const storedProfile = JSON.parse(sessionStorage.getItem('grantee_admin_profile') || '{}');
                if (storedProfile.school_id) effectiveSchoolId = storedProfile.school_id;
            } catch (e) {}
        }

        if (!effectiveSchoolId) {
            effectiveSchoolId = localStorage.getItem('grantee_pending_paymongo_school_id') ||
                                localStorage.getItem('granteeSelectedSchoolId') ||
                                new URLSearchParams(window.location.search).get('school_id') ||
                                '5be5d841-5b39-4016-860b-6d04c384d11b';
        }

        currentAdminSchoolId = effectiveSchoolId;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing PayMongo Checkout...`;
        }

        // Show SweetAlert loading state so the coordinator gets clear feedback
        if (window.Swal) {
            Swal.fire({
                title: 'Preparing Secure Checkout',
                html: `
                    <div style="font-size: 13.5px; color: #475569; text-align: center; padding: 6px 0; line-height: 1.6;">
                        <p style="margin-bottom: 6px; font-weight: 600; color: #0f172a;">Connecting to PayMongo payment gateway...</p>
                        <span style="font-size: 12px; color: #64748b;">Generating encrypted checkout session for GCash, Maya, and Cards.</span>
                    </div>
                `,
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        }

        try {
            const coordinatorName = currentCoordinatorProfile
                ? `${currentCoordinatorProfile.first_name || 'Coordinator'} ${currentCoordinatorProfile.last_name || ''}`.trim()
                : 'School Coordinator';
            const coordinatorEmail = currentCoordinatorProfile?.email || 'coordinator@school.edu.ph';

            const returnUrl = window.location.href.split('?')[0];
            const session = await window.SubscriptionClient.createCheckoutSession({
                schoolId: effectiveSchoolId,
                planCode: selectedPlanCode,
                coordinatorId: currentCoordinatorProfile?.id,
                coordinatorName: coordinatorName,
                coordinatorEmail: coordinatorEmail,
                successUrl: `${returnUrl}?payment=success&school_id=${effectiveSchoolId}`,
                cancelUrl: `${returnUrl}?payment=cancelled&school_id=${effectiveSchoolId}`
            });

            if (session && session.checkout_url) {
                const checkoutUrl = session.checkout_url;

                // Persist pending session ID in both localStorage and sessionStorage for reliable verification upon return
                if (session.session_id) {
                    try {
                        localStorage.setItem('grantee_pending_paymongo_session_id', session.session_id);
                        localStorage.setItem('grantee_pending_paymongo_school_id', effectiveSchoolId);
                        sessionStorage.setItem('grantee_pending_paymongo_session_id', session.session_id);
                        sessionStorage.setItem('grantee_pending_paymongo_school_id', effectiveSchoolId);
                    } catch (e) {}
                }

                // 1. Close the checkout modal if open
                if (window.closeCheckoutModal) {
                    window.closeCheckoutModal();
                }

                // 2. Show brief redirecting indicator while browser transfers
                if (window.Swal) {
                    Swal.fire({
                        title: 'Redirecting to PayMongo...',
                        html: '<p style="font-size: 13.5px; color: #475569;">Transferring you directly to the secure PayMongo checkout page...</p>',
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });
                }

                // 3. Immediately proceed to PayMongo checkout portal
                try {
                    if (window.top && window.top !== window) {
                        window.top.location.href = checkoutUrl;
                    } else {
                        window.location.href = checkoutUrl;
                    }
                } catch (navErr) {
                    console.warn('[AdminSubscription] Direct navigation warning:', navErr);
                    window.location.href = checkoutUrl;
                }

            } else if (session && !session.configured) {
                // Key not configured yet on deployed Render backend or local .env
                if (window.Swal) {
                    Swal.fire({
                        icon: 'info',
                        title: 'PayMongo Secret Key Required',
                        html: `
                            <div style="font-size: 13.5px; text-align: left; line-height: 1.6; color: #475569;">
                                <p style="margin-bottom: 12px; font-weight: 600; color: #1e293b;">
                                    The deployed backend cannot redirect to <code>checkout.paymongo.com</code> because <code>PAYMONGO_SECRET_KEY</code> is not configured.
                                </p>
                                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                                    <strong style="color: #0f172a; display: block; margin-bottom: 6px;">How to enable PayMongo on Deployed Server (Render):</strong>
                                    1. Open your <a href="https://dashboard.render.com" target="_blank" style="color: #2563eb; text-decoration: underline; font-weight: 600;">Render Dashboard</a>.<br>
                                    2. Select your backend service (<code>grantee-backend-n5f4</code>).<br>
                                    3. Go to the <strong>Environment</strong> tab.<br>
                                    4. Add <strong><code>PAYMONGO_SECRET_KEY</code></strong> = <code>sk_test_...</code> (or <code>sk_live_...</code>).<br>
                                    5. Click <strong>Save Changes</strong>. Render will redeploy automatically!
                                </div>
                                <p style="font-size: 12.5px; color: #64748b;">
                                    For local development, add <code>PAYMONGO_SECRET_KEY</code> to <code>backend-node/.env</code>.
                                </p>
                            </div>
                        `,
                        showCancelButton: false,
                        confirmButtonText: 'Got It',
                        confirmButtonColor: '#1F3D2E'
                    });
                } else {
                    alert(session.message);
                }
            } else {
                throw new Error('Could not obtain checkout session URL.');
            }

        } catch (err) {
            console.error('PayMongo Checkout Error:', err);
            if (window.Swal) {
                Swal.fire({
                    icon: 'error',
                    title: 'Checkout Gateway Error',
                    html: `
                        <div style="font-size: 13.5px; text-align: left; line-height: 1.6; color: #475569;">
                            <p style="margin-bottom: 8px; color: #b91c1c; font-weight: 600;">
                                ${err.message || 'Unable to establish checkout session with PayMongo.'}
                            </p>
                            <p style="font-size: 12.5px; color: #64748b;">
                                Please ensure the backend server is reachable, or check your internet connection and try again.
                            </p>
                        </div>
                    `,
                    confirmButtonText: 'Try Again',
                    confirmButtonColor: '#1F3D2E'
                });
            } else {
                alert('PayMongo Checkout initiation error: ' + err.message);
            }
        } finally {
            window._isInitiatingPaymongoCheckout = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };

    /**
     * Stubs for removed bank setup guide modal
     */
    window.openBankSetupGuideModal = function () {};
    window.closeBankSetupGuideModal = function () {};

    /**
     * Payment Actions - Delegates directly to PayMongo Online Gateway
     */
    window.proceedToPaymentPortal = function () {
        window.initiatePaymongoOnlineCheckout();
    };

    window.submitSubscriptionPayment = function () {
        window.initiatePaymongoOnlineCheckout();
    };

    /**
     * 8. Receipt Modal Display
     */
    function openReceiptModal(invoice) {
        if (!invoice) return;

        const modal = document.getElementById('receipt-modal');
        const invNumEl = document.getElementById('receipt-invoice-num');
        const dateEl = document.getElementById('receipt-date');
        const schoolEl = document.getElementById('receipt-school');
        const coordEl = document.getElementById('receipt-coordinator');
        const methodEl = document.getElementById('receipt-method');
        const planEl = document.getElementById('receipt-plan-name');
        const amountEl = document.getElementById('receipt-amount');
        const periodEl = document.getElementById('receipt-period');

        if (invNumEl) invNumEl.innerText = invoice.invoice_number || 'INV-0000';
        if (dateEl) dateEl.innerText = invoice.date ? new Date(invoice.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
        if (schoolEl) schoolEl.innerText = currentAdminSchoolName;
        if (coordEl) coordEl.innerText = invoice.paid_by_name || 'Coordinator';
        if (methodEl) methodEl.innerText = `${invoice.payment_method} (Ref: ${invoice.reference_number || 'N/A'})`;
        if (planEl) planEl.innerText = invoice.plan_name;
        if (amountEl) amountEl.innerText = `₱${Number(invoice.amount_php || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        if (periodEl) periodEl.innerText = `Coverage Period: ${invoice.period_covered || '1 Year'}`;

        if (modal) modal.classList.add('show');
    }

    window.closeReceiptModal = function () {
        const modal = document.getElementById('receipt-modal');
        if (modal) modal.classList.remove('show');
    };

    window.openReceiptFromHistory = function (index) {
        const targetList = (displayedInvoices && displayedInvoices.length > 0) ? displayedInvoices : currentSubscription?.invoices;
        if (!targetList || !targetList[index]) return;
        openReceiptModal(targetList[index]);
    };

    window.printReceipt = function () {
        window.print();
    };

    window.goToAdminDashboard = function () {
        window.location.href = 'admin-dashboard.html';
    };

    /**
     * 9. Simulator Controls for Instant Demo / Grading / Testing
     */
    function setupEventListeners() {
        const btnHeroRenew = document.getElementById('btn-renew-hero');
        if (btnHeroRenew) {
            btnHeroRenew.addEventListener('click', () => {
                openCheckoutModal(selectedPlanCode);
            });
        }

        // Checkout Button explicit click listener
        const btnPaymongo = document.getElementById('btn-paymongo-checkout');
        if (btnPaymongo) {
            btnPaymongo.addEventListener('click', (e) => {
                window.initiatePaymongoOnlineCheckout(e);
            });
        }

        // Global ESC key listener to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeReceiptModal();
                closeCheckoutModal();
            }
        });

        // Simulator: Expired
        const btnSimExpired = document.getElementById('btn-sim-expired');
        if (btnSimExpired) {
            btnSimExpired.addEventListener('click', async () => {
                if (!currentAdminSchoolId) return;
                try {
                    btnSimExpired.disabled = true;
                    await window.SubscriptionClient.simulateStatus(currentAdminSchoolId, 'expired');
                    await refreshSubscriptionData(true);
                    
                    Swal.fire({
                        icon: 'warning',
                        title: 'Simulated: License Expired (Locked)',
                        html: `
                            <p style="font-size: 14px; text-align: left; line-height: 1.5; color: #475569;">
                                The license for <strong>${currentAdminSchoolName}</strong> is now set to <strong>EXPIRED</strong>.
                                <br><br>
                                <strong>Verification Testing:</strong><br>
                                1. If you attempt to open <strong>Dashboard</strong> or any other admin page, you will be blocked and redirected back here to pay.<br>
                                2. If a student belonging to this school logs in, their access is <strong>strictly blocked</strong> with an institutional notice!
                            </p>
                        `,
                        confirmButtonText: 'Got It',
                        confirmButtonColor: '#1F3D2E'
                    });
                } catch (e) {
                    alert('Simulation error: ' + e.message);
                } finally {
                    btnSimExpired.disabled = false;
                }
            });
        }

        // Simulator: Unpaid
        const btnSimUnpaid = document.getElementById('btn-sim-unpaid');
        if (btnSimUnpaid) {
            btnSimUnpaid.addEventListener('click', async () => {
                if (!currentAdminSchoolId) return;
                try {
                    btnSimUnpaid.disabled = true;
                    await window.SubscriptionClient.simulateStatus(currentAdminSchoolId, 'unpaid');
                    await refreshSubscriptionData(true);
                    if (window.showToast) window.showToast('info', 'Status: Unpaid', 'License status changed to Unpaid.');
                } catch (e) {
                    alert('Simulation error: ' + e.message);
                } finally {
                    btnSimUnpaid.disabled = false;
                }
            });
        }

        // Simulator: Active
        const btnSimActive = document.getElementById('btn-sim-active');
        if (btnSimActive) {
            btnSimActive.addEventListener('click', async () => {
                if (!currentAdminSchoolId) return;
                try {
                    btnSimActive.disabled = true;
                    await window.SubscriptionClient.simulateStatus(currentAdminSchoolId, 'active');
                    await refreshSubscriptionData(true);

                    Swal.fire({
                        icon: 'success',
                        title: 'Simulated: License Active (Unlocked)',
                        html: `
                            <p style="font-size: 14px; text-align: left; line-height: 1.5; color: #475569;">
                                The license for <strong>${currentAdminSchoolName}</strong> is now <strong>ACTIVE</strong> (30 days remaining).
                                <br><br>
                                Coordinators and enrolled students can now freely access the system!
                            </p>
                        `,
                        confirmButtonText: 'Go to Dashboard',
                        showCancelButton: true,
                        cancelButtonText: 'Stay on Billing Page',
                        confirmButtonColor: '#1F3D2E'
                    }).then(res => {
                        if (res.isConfirmed) {
                            window.location.href = 'admin-dashboard.html';
                        }
                    });
                } catch (e) {
                    alert('Simulation error: ' + e.message);
                } finally {
                    btnSimActive.disabled = false;
                }
            });
        }
    }

})();
