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

            // Fetch profile
            const { data: profile, error: profileErr } = await window.supabaseClient
                .from('profiles')
                .select('*, schools(name)')
                .eq('id', userId)
                .single();

            if (profileErr) throw profileErr;

            currentCoordinatorProfile = profile;
            currentAdminSchoolId = profile.school_id;
            currentAdminSchoolName = profile.schools ? profile.schools.name.trim() : (profile.school_name || 'Institution');

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
                if (sessionIdParam) {
                    try {
                        await window.SubscriptionClient.verifyCheckoutSession(sessionIdParam);
                    } catch (e) {
                        console.warn('Session verification fallback:', e);
                    }
                }
                await refreshSubscriptionData(true);

                if (window.Swal) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Payment Confirmed!',
                        html: `
                            <p style="font-size: 14px; color: #475569; text-align: left; line-height: 1.5;">
                                Your online payment was successfully processed. Full system access for <strong>${currentAdminSchoolName}</strong> and all enrolled student accounts is now completely unlocked!
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
                return;
            } else if (paymentParam === 'cancelled') {
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
            if (statusPillEl) {
                statusPillEl.className = 'status-badge-pill status-badge-active';
                statusPillEl.innerHTML = `<i data-lucide="check-circle-2" style="width: 15px; height: 15px;"></i> Active License`;
            }
            if (metricStatusEl) {
                metricStatusEl.innerText = 'Active (Paid)';
                metricStatusEl.style.color = '#10b981';
            }
            if (alertBannerEl) alertBannerEl.style.display = 'none';
            if (renewHeroBtn) renewHeroBtn.className = 'btn-select-plan btn-select-monthly';
            if (renewHeroBtnLabel) renewHeroBtnLabel.innerText = 'Renew / Extend License';

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

    /**
     * 4. Render Billing & Invoice History Table
     */
    function renderInvoicesTable(invoices) {
        const tbody = document.getElementById('invoices-tbody');
        if (!tbody) return;

        if (!invoices || invoices.length === 0) {
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
        invoices.forEach((inv, index) => {
            const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
            const amountStr = `₱${Number(inv.amount_php || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

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
                    <td><span class="invoice-pill-paid">✓ Paid</span></td>
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
     * 5. Open Checkout Modal
     */
    window.openCheckoutModal = function (planCode = 'yearly') {
        selectedPlanCode = planCode;
        const plan = PLAN_DETAILS[planCode] || PLAN_DETAILS.yearly;

        const modal = document.getElementById('checkout-modal');
        const modalSchool = document.getElementById('modal-summary-school');
        const modalPlan = document.getElementById('modal-summary-plan');
        const modalCycle = document.getElementById('modal-summary-cycle');
        const modalTotal = document.getElementById('modal-summary-total');
        const btnSubmitLabel = document.getElementById('btn-submit-payment-label');
        const btnPaymongoLabel = document.getElementById('btn-paymongo-label');

        if (modalSchool) modalSchool.innerText = currentAdminSchoolName;
        if (modalPlan) modalPlan.innerText = plan.name;
        if (modalCycle) modalCycle.innerText = plan.cycle;
        if (modalTotal) modalTotal.innerText = plan.displayAmount;
        if (btnSubmitLabel) btnSubmitLabel.innerText = `Complete the payment (${plan.displayAmount})`;
        if (btnPaymongoLabel) btnPaymongoLabel.innerText = `Pay with PayMongo (${plan.displayAmount})`;

        // Reset reference inputs to empty for user entry
        const refInput = document.getElementById('input-wallet-ref');
        if (refInput) {
            refInput.value = '';
        }
        const bankRefInput = document.getElementById('input-bank-ref');
        if (bankRefInput) {
            bankRefInput.value = '';
        }

        const cardNameInput = document.getElementById('input-card-name');
        if (cardNameInput && currentCoordinatorProfile) {
            cardNameInput.value = `${currentCoordinatorProfile.first_name || ''} ${currentCoordinatorProfile.last_name || ''}`.trim();
        }

        updateReceivingAccountCard(selectedPaymentMethod);

        if (modal) modal.classList.add('show');
        if (window.lucide && lucide.createIcons) lucide.createIcons();
    };

    window.closeCheckoutModal = function () {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.remove('show');
    };

    /**
     * Update Receiving Bank / Wallet Card Display
     */
    function updateReceivingAccountCard(method) {
        const cardTitle = document.getElementById('disp-receiving-bank-title');
        const accName = document.getElementById('disp-receiving-acc-name');
        const accNum = document.getElementById('disp-receiving-acc-num');
        const branchRow = document.getElementById('disp-receiving-branch-row');
        const branchVal = document.getElementById('disp-receiving-branch');

        const cfg = cachedPaymentConfig?.receiving_accounts;

        if (method === 'GCash') {
            const gcash = cfg?.wallets?.find(w => w.wallet_name.includes('GCash')) || {
                account_name: 'Grantee Platform Merchant',
                mobile_number: '0917-123-4567'
            };
            if (cardTitle) cardTitle.innerHTML = `<i data-lucide="smartphone" style="width: 16px; height: 16px; color: #007DFE;"></i> GCash Corporate Merchant`;
            if (accName) accName.innerText = gcash.account_name;
            if (accNum) accNum.innerText = gcash.mobile_number;
            if (branchRow) branchRow.style.display = 'none';

        } else if (method === 'Maya') {
            const maya = cfg?.wallets?.find(w => w.wallet_name.includes('Maya')) || {
                account_name: 'Grantee Platform Merchant',
                mobile_number: '0918-987-6543'
            };
            if (cardTitle) cardTitle.innerHTML = `<i data-lucide="qr-code" style="width: 16px; height: 16px; color: #00C853;"></i> Maya Business / QR Ph`;
            if (accName) accName.innerText = maya.account_name;
            if (accNum) accNum.innerText = maya.mobile_number;
            if (branchRow) branchRow.style.display = 'none';

        } else if (method === 'Bank Transfer') {
            const selectVal = document.getElementById('input-bank-select')?.value || 'Landbank';
            const bank = cfg?.banks?.find(b => b.bank_name.toLowerCase().includes(selectVal.toLowerCase())) || cfg?.banks?.[0] || {
                bank_name: 'Landbank of the Philippines',
                account_name: 'Grantee Educational Technologies Inc.',
                account_number: '0912-3841-88',
                branch: 'Institutional Government Hub'
            };

            if (cardTitle) cardTitle.innerHTML = `<i data-lucide="landmark" style="width: 16px; height: 16px; color: #10b981;"></i> ${bank.bank_name}`;
            if (accName) accName.innerText = bank.account_name;
            if (accNum) accNum.innerText = bank.account_number;
            if (branchRow) {
                branchRow.style.display = 'flex';
                if (branchVal) branchVal.innerText = bank.branch || 'Institutional Hub';
            }

        } else {
            // Card
            if (cardTitle) cardTitle.innerHTML = `<i data-lucide="credit-card" style="width: 16px; height: 16px; color: #64748b;"></i> Institutional Merchant Gateway`;
            if (accName) accName.innerText = 'Grantee Educational Technologies Inc.';
            if (accNum) accNum.innerText = 'VISA / MASTERCARD / JCB';
            if (branchRow) branchRow.style.display = 'none';
        }

        if (window.lucide && lucide.createIcons) lucide.createIcons();
    }

    window.onBankSelectChange = function () {
        updateReceivingAccountCard('Bank Transfer');
    };

    window.copyReceivingAccountNumber = function () {
        const accNum = document.getElementById('disp-receiving-acc-num')?.innerText;
        if (!accNum) return;

        navigator.clipboard.writeText(accNum).then(() => {
            const copyBtn = document.getElementById('btn-copy-acc-num');
            if (copyBtn) {
                const prev = copyBtn.innerHTML;
                copyBtn.innerHTML = `<i data-lucide="check" style="width: 13px; height: 13px; color: #10b981;"></i> Copied!`;
                if (window.lucide && lucide.createIcons) lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = prev;
                    if (window.lucide && lucide.createIcons) lucide.createIcons();
                }, 2000);
            }
        });
    };

    /**
     * 6. Select Payment Method Tiles
     */
    window.selectPaymentMethod = function (method) {
        selectedPaymentMethod = method;

        document.querySelectorAll('.payment-method-tile').forEach(tile => {
            if (tile.dataset.method === method) {
                tile.classList.add('selected');
            } else {
                tile.classList.remove('selected');
            }
        });

        const walletArea = document.getElementById('input-group-wallet');
        const cardArea = document.getElementById('input-group-card');
        const bankArea = document.getElementById('input-group-bank');
        const walletLabel = document.getElementById('wallet-number-label');

        if (method === 'GCash' || method === 'Maya') {
            if (walletArea) walletArea.style.display = 'block';
            if (cardArea) cardArea.style.display = 'none';
            if (bankArea) bankArea.style.display = 'none';
            if (walletLabel) walletLabel.innerText = `School / Coordinator ${method} Registered Number`;
        } else if (method === 'Card') {
            if (walletArea) walletArea.style.display = 'none';
            if (cardArea) cardArea.style.display = 'block';
            if (bankArea) bankArea.style.display = 'none';
        } else if (method === 'Bank Transfer') {
            if (walletArea) walletArea.style.display = 'none';
            if (cardArea) cardArea.style.display = 'none';
            if (bankArea) bankArea.style.display = 'block';
        }

        updateReceivingAccountCard(method);
    };

    /**
     * 6.5 Initiate PayMongo Online Checkout (Automated E-Wallet / Card Gateway)
     */
    window.initiatePaymongoOnlineCheckout = async function () {
        const btn = document.getElementById('btn-paymongo-checkout');
        const originalText = btn ? btn.innerHTML : 'Proceed to Online Checkout';

        if (!currentAdminSchoolId) {
            alert('School identifier missing. Please refresh.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing PayMongo Checkout...`;
        }

        try {
            const coordinatorName = currentCoordinatorProfile
                ? `${currentCoordinatorProfile.first_name || 'Coordinator'} ${currentCoordinatorProfile.last_name || ''}`.trim()
                : 'School Coordinator';
            const coordinatorEmail = currentCoordinatorProfile?.email || 'coordinator@school.edu.ph';

            const returnUrl = window.location.href.split('?')[0];
            const session = await window.SubscriptionClient.createCheckoutSession({
                schoolId: currentAdminSchoolId,
                planCode: selectedPlanCode,
                coordinatorId: currentCoordinatorProfile?.id,
                coordinatorName: coordinatorName,
                coordinatorEmail: coordinatorEmail,
                successUrl: `${returnUrl}?payment=success&school_id=${currentAdminSchoolId}&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${returnUrl}?payment=cancelled&school_id=${currentAdminSchoolId}`
            });

            if (session && session.checkout_url) {
                // Redirect user to PayMongo official checkout page
                window.location.href = session.checkout_url;
            } else if (session && !session.configured) {
                // Key not configured yet in .env - prompt user
                if (window.Swal) {
                    Swal.fire({
                        icon: 'info',
                        title: 'PayMongo Gateway Ready for Setup',
                        html: `
                            <p style="font-size: 14px; text-align: left; line-height: 1.5; color: #475569;">
                                The online payment architecture is fully integrated in Grantee!
                                <br><br>
                                To enable live redirection to GCash/Maya and deposit school funds directly into your online bank account:
                                <br><br>
                                <strong>1.</strong> Add your PayMongo API keys to <code>backend-node/.env</code> (<code>PAYMONGO_SECRET_KEY</code>).<br>
                                <strong>2.</strong> Link your Philippine bank account in PayMongo Dashboard.<br><br>
                                In the meantime, you can use the <strong>Direct Settlement</strong> channel below to record and activate licensing immediately!
                            </p>
                        `,
                        showCancelButton: true,
                        confirmButtonText: 'View Setup Guide',
                        cancelButtonText: 'Use Direct Settlement',
                        confirmButtonColor: '#1F3D2E'
                    }).then(res => {
                        if (res.isConfirmed) {
                            closeCheckoutModal();
                            openBankSetupGuideModal();
                        }
                    });
                } else {
                    alert(session.message);
                }
            } else {
                throw new Error('Could not obtain checkout session URL.');
            }

        } catch (err) {
            console.error('PayMongo Checkout Error:', err);
            alert('PayMongo Checkout initiation error: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };

    /**
     * Bank Setup Guide Modal Controls
     */
    window.openBankSetupGuideModal = function () {
        const modal = document.getElementById('bank-guide-modal');
        if (modal) modal.classList.add('show');
        if (window.lucide && lucide.createIcons) lucide.createIcons();
    };

    window.closeBankSetupGuideModal = function () {
        const modal = document.getElementById('bank-guide-modal');
        if (modal) modal.classList.remove('show');
    };

    let activePaymentRefNum = '';

    /**
     * 7. Proceed to Payment Portal (GCash / QR Ph Redirect View matching official UI)
     */
    window.proceedToPaymentPortal = function () {
        const schoolId = currentAdminSchoolId || currentCoordinatorProfile?.school_id;
        if (!schoolId) {
            alert('Cannot process payment: School ID not found for coordinator account. Please ensure your account is assigned to an institution.');
            return;
        }

        // Determine reference number entered by user
        let refNum = '';
        if (selectedPaymentMethod === 'GCash' || selectedPaymentMethod === 'Maya') {
            refNum = document.getElementById('input-wallet-ref')?.value?.trim() || '';
        } else if (selectedPaymentMethod === 'Bank Transfer') {
            refNum = document.getElementById('input-bank-ref')?.value?.trim() || '';
        }

        activePaymentRefNum = refNum;

        const plan = PLAN_DETAILS[selectedPlanCode] || PLAN_DETAILS.yearly;

        // Populate GCash modal fields
        const amountEl = document.getElementById('gcash-modal-amount');
        const schoolEl = document.getElementById('gcash-modal-school');
        const planEl = document.getElementById('gcash-modal-plan');
        const recipientEl = document.getElementById('gcash-modal-recipient');
        const mobileEl = document.getElementById('gcash-modal-mobile');
        const inputRef = document.getElementById('gcash-input-ref');
        const amountInput = document.getElementById('gcash-input-amount');

        const gcashCfg = cachedPaymentConfig?.receiving_accounts?.wallets?.find(w => w.id === 'wallet_gcash' || w.wallet_name.includes('GCash'));

        if (amountEl) amountEl.innerText = plan.displayAmount;
        if (schoolEl) schoolEl.innerText = currentAdminSchoolName || 'Your Institution';
        if (planEl) planEl.innerText = plan.name;
        if (recipientEl) recipientEl.innerText = gcashCfg?.account_name || 'John Elter Gelig';
        if (mobileEl) mobileEl.innerText = gcashCfg?.mobile_number || '09700551207';
        if (inputRef) inputRef.value = refNum || '';
        if (amountInput) amountInput.value = plan.amount;

        // Adapt UI based on payment method
        const headerEl = document.getElementById('gcash-portal-header');
        const btnOpen = document.getElementById('btn-open-gcash-app');
        const titleEl = document.getElementById('gcash-portal-title');
        const subTitleEl = document.getElementById('gcash-portal-subtitle');
        const logoSvg = document.getElementById('gcash-logo-svg');

        if (selectedPaymentMethod === 'Maya') {
            if (headerEl) headerEl.style.background = '#00D66F';
            if (btnOpen) {
                btnOpen.style.background = '#00D66F';
                btnOpen.innerText = 'Open in Maya';
            }
            if (titleEl) titleEl.innerText = 'Securely complete the payment with your Maya app';
            if (subTitleEl) subTitleEl.innerText = 'or Log in to Maya and scan this QR with the QR Scanner.';
            if (logoSvg) logoSvg.innerHTML = `<text x="50%" y="26" text-anchor="middle" fill="white" font-family="-apple-system, sans-serif" font-size="24" font-weight="900" letter-spacing="-0.5">maya</text>`;
        } else if (selectedPaymentMethod === 'Bank Transfer') {
            if (headerEl) headerEl.style.background = '#1F3D2E';
            if (btnOpen) {
                btnOpen.style.background = '#1F3D2E';
                btnOpen.innerText = 'Open Institutional Banking App';
            }
            if (titleEl) titleEl.innerText = 'Securely transfer via Institutional Bank / QR Ph';
            if (subTitleEl) subTitleEl.innerText = 'Scan this universal QR Ph with Landbank, BDO, BPI, or mobile banking.';
            if (logoSvg) logoSvg.innerHTML = `<text x="50%" y="26" text-anchor="middle" fill="white" font-family="-apple-system, sans-serif" font-size="20" font-weight="800">QR Ph Banking</text>`;
        } else {
            // Default GCash - exactly as user requested in screenshot
            if (headerEl) headerEl.style.background = '#0057E7';
            if (btnOpen) {
                btnOpen.style.background = '#0057E7';
                btnOpen.innerText = 'Open in GCash';
            }
            if (titleEl) titleEl.innerText = 'Securely complete the payment with your GCash app';
            if (subTitleEl) subTitleEl.innerText = 'or Log in to GCash and scan this QR with the QR Scanner.';
            if (logoSvg) {
                logoSvg.innerHTML = `
                    <g transform="translate(4, 2)">
                        <circle cx="16" cy="16" r="14.5" stroke="white" stroke-width="2.6" fill="none" />
                        <path d="M19 12.5C18 11 16.5 10 14.2 10C10.5 10 7.8 12.8 7.8 16.5C7.8 20.2 10.5 23 14.2 23C17.5 23 19.8 20.8 20.2 17.5H14.5" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M24.5 9.5C26.8 11.4 28.2 13.8 28.2 16.5C28.2 19.2 26.8 21.6 24.5 23.5" stroke="white" stroke-width="2.6" stroke-linecap="round" fill="none"/>
                        <path d="M28.5 6.5C31.8 9.2 33.8 12.6 33.8 16.5C33.8 20.4 31.8 23.8 28.5 26.5" stroke="white" stroke-width="2.6" stroke-linecap="round" fill="none"/>
                    </g>
                    <text x="48" y="25.5" fill="white" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="23" font-weight="800" letter-spacing="-0.5">GCash</text>
                `;
            }
        }

        // Render QR Code (real image or dynamic scannable payload)
        renderGcashQrCode(refNum);

        // Hide checkout modal and display GCash portal
        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal) checkoutModal.classList.remove('show');

        const gcashModal = document.getElementById('gcash-portal-modal');
        if (gcashModal) gcashModal.classList.add('show');

        if (window.lucide && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    /**
     * Close GCash Portal Modal and return to checkout
     */
    window.closeGcashPortalModal = function () {
        const gcashModal = document.getElementById('gcash-portal-modal');
        if (gcashModal) gcashModal.classList.remove('show');

        // Restore checkout modal
        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal) checkoutModal.classList.add('show');
    };

    /**
     * Handle "Open in GCash" Click
     */
    window.handleOpenGcashAppClick = function () {
        // Attempt deep link on mobile devices
        try {
            window.location.href = 'gcash://';
        } catch (e) {}

        if (window.Swal) {
            Swal.fire({
                icon: 'info',
                title: 'Open in GCash App',
                html: `
                    <p style="font-size: 14px; color: #475569; text-align: left; line-height: 1.5;">
                        If you are on mobile with GCash installed, the app will open directly.
                        <br><br>
                        On desktop, log in to your GCash app and <strong>scan the QR code</strong> on screen with the QR scanner!
                        <br><br>
                        Once confirmed, copy your <strong>GCash Reference No.</strong> from the SMS or receipt and click <strong>"I Have Completed the Payment"</strong> below to instantly activate your institutional license.
                    </p>
                `,
                confirmButtonText: 'Got It',
                confirmButtonColor: '#0057E7'
            });
        }
    };

    /**
     * Render QR Code: checks for real QR image file first, with dynamic scannable fallback
     */
    function renderGcashQrCode(refNum) {
        const container = document.getElementById('gcash-qr-container');
        if (!container) return;

        container.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 20px;">Loading QR code...</div>';
        const gcashCfg = cachedPaymentConfig?.receiving_accounts?.wallets?.find(w => w.id === 'wallet_gcash' || w.wallet_name.includes('GCash'));
        const qrImageSrc = gcashCfg?.qr_image || 'assets/gcash-qr.png';

        // Check if real QR image file exists in assets
        const testImg = new Image();
        testImg.onload = function () {
            container.innerHTML = `<img src="${testImg.src}" alt="GCash Real QR Code" style="width: 200px; height: 200px; display: block; margin: 0 auto; border-radius: 8px; object-fit: contain;">`;
        };
        testImg.onerror = function () {
            // Dynamic generation fallback
            generateDynamicQr(container, refNum);
        };
        testImg.src = qrImageSrc;
    }

    /**
     * Generate dynamic scannable QR Code via QRCode.js
     */
    function generateDynamicQr(container, refNum) {
        container.innerHTML = '';
        const plan = PLAN_DETAILS[selectedPlanCode] || PLAN_DETAILS.yearly;
        const gcashCfg = cachedPaymentConfig?.receiving_accounts?.wallets?.find(w => w.id === 'wallet_gcash');
        const mobileNum = gcashCfg?.mobile_number || '09700551207';
        const recipientName = gcashCfg?.account_name || 'John Elter Gelig';

        const qrPayload = `https://grantee.edu.ph/pay/gcash?to=${encodeURIComponent(mobileNum)}&name=${encodeURIComponent(recipientName)}&amount=${plan.amount}&ref=${encodeURIComponent(refNum)}`;

        try {
            if (typeof QRCode !== 'undefined') {
                new QRCode(container, {
                    text: qrPayload,
                    width: 200,
                    height: 200,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });

                const canvases = container.querySelectorAll('canvas');
                const imgs = container.querySelectorAll('img');
                if (canvases.length > 0 && imgs.length > 0) {
                    canvases.forEach(c => c.style.display = 'none');
                    imgs.forEach(i => {
                        i.style.display = 'block';
                        i.style.margin = '0 auto';
                        i.style.borderRadius = '8px';
                    });
                }
            } else {
                container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}" alt="GCash QR Code" style="width: 200px; height: 200px; display: block; margin: 0 auto; border-radius: 8px;">`;
            }
        } catch (e) {
            console.warn('QR Code rendering fallback:', e);
            container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}" alt="GCash QR Code" style="width: 200px; height: 200px; display: block; margin: 0 auto; border-radius: 8px;">`;
        }
    }

    /**
     * Confirm GCash Payment Complete (Executes backend validation & generates receipt)
     */
    window.confirmGcashPaymentComplete = async function () {
        const btn = document.getElementById('btn-gcash-complete-submit');
        const originalText = btn ? btn.innerHTML : 'I Have Completed the Payment';

        const schoolId = currentAdminSchoolId || currentCoordinatorProfile?.school_id;
        if (!schoolId) {
            alert('Cannot process payment: School ID not found for coordinator account.');
            return;
        }

        // Validate GCash Reference Number
        const inputRef = document.getElementById('gcash-input-ref');
        const enteredRef = inputRef ? inputRef.value.trim() : '';

        if (!enteredRef) {
            alert('Please enter your GCash Reference Number (from your GCash SMS or receipt) to proceed.');
            if (inputRef) inputRef.focus();
            return;
        }

        if (enteredRef.startsWith('REF-') && enteredRef.length <= 13) {
            alert('Please enter your actual 9 to 13-digit GCash Transaction Number from your SMS or receipt, not the sample placeholder.');
            if (inputRef) inputRef.focus();
            return;
        }

        if (enteredRef.length < 6) {
            alert('Please enter a valid GCash Reference Number (at least 6 digits/characters from your receipt).');
            if (inputRef) inputRef.focus();
            return;
        }

        // STRICT EXACT AMOUNT CHECK: Do not allow underpayments
        const plan = PLAN_DETAILS[selectedPlanCode] || PLAN_DETAILS.yearly;
        const amountInput = document.getElementById('gcash-input-amount');
        const amountPaid = amountInput ? parseFloat(amountInput.value) : plan.amount;

        if (isNaN(amountPaid) || amountPaid < plan.amount) {
            if (window.Swal) {
                Swal.fire({
                    icon: 'error',
                    title: 'Exact Amount Required',
                    html: `
                        <p style="font-size: 14px; color: #475569; text-align: left; line-height: 1.5;">
                            The institutional license requires the <strong>exact payment of ₱${plan.amount.toLocaleString()}</strong>.
                            <br><br>
                            Amount entered: <strong>₱${(amountPaid || 0).toLocaleString()}</strong>.
                            <br><br>
                            <span style="color: #dc2626; font-weight: 700;">Underpayment is not permitted.</span> System access cannot be activated until the exact balance is settled in full.
                        </p>
                    `,
                    confirmButtonColor: '#0057E7'
                });
            } else {
                alert(`Payment Rejected: You must pay the exact amount of ₱${plan.amount.toLocaleString()}. Underpayment (₱${amountPaid}) cannot activate system access.`);
            }
            if (amountInput) amountInput.focus();
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Validating GCash Payment...`;
        }

        const coordinatorName = currentCoordinatorProfile
            ? `${currentCoordinatorProfile.first_name || 'Coordinator'} ${currentCoordinatorProfile.last_name || ''}`.trim()
            : 'School Scholarship Coordinator';

        const coordinatorEmail = currentCoordinatorProfile?.email || 'coordinator@school.edu.ph';
        const paymentLabel = selectedPaymentMethod === 'GCash' ? 'GCash (QR Ph)' : selectedPaymentMethod;

        try {
            await new Promise(r => setTimeout(r, 800));

            const result = await window.SubscriptionClient.processPayment({
                schoolId: schoolId,
                coordinatorId: currentCoordinatorProfile?.id,
                coordinatorName: coordinatorName,
                coordinatorEmail: coordinatorEmail,
                planCode: selectedPlanCode,
                paymentMethod: paymentLabel,
                referenceNumber: enteredRef,
                amountPaid: amountPaid,
                notes: `Completed via ${paymentLabel} Portal by ${coordinatorName} for ${currentAdminSchoolName}`
            });

            // Close GCash Modal
            const gcashModal = document.getElementById('gcash-portal-modal');
            if (gcashModal) gcashModal.classList.remove('show');

            closeCheckoutModal();

            // Refresh Hero & Invoices
            await refreshSubscriptionData(true);

            // Open Receipt Modal
            if (result && result.invoice) {
                openReceiptModal(result.invoice);
            }

            if (window.showToast) {
                window.showToast('success', 'Payment Validated & Activated!', 'Institutional subscription activated. Full system access is restored.');
            }

        } catch (err) {
            console.error('Payment error:', err);
            const msg = err.message || '';
            if (msg.includes('already been recorded') || msg.includes('Duplicate submissions')) {
                alert(`Payment Validation Failed: ${msg}\n\nPlease check your GCash receipt to make sure you entered the correct reference number.`);
            } else if (msg.includes('404')) {
                alert('Payment processing failed (HTTP 404): The subscription endpoint was not found on the active backend server.\n\nPlease verify that your local backend (http://localhost:3000) is running, or push your backend updates to your production host.');
            } else {
                alert('Payment processing failed: ' + msg);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };

    /**
     * Legacy submitSubscriptionPayment - delegates to proceedToPaymentPortal
     */
    window.submitSubscriptionPayment = function () {
        window.proceedToPaymentPortal();
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
        if (!currentSubscription || !currentSubscription.invoices || !currentSubscription.invoices[index]) return;
        openReceiptModal(currentSubscription.invoices[index]);
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
