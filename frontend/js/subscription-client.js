/**
 * subscription-client.js
 * Frontend Client Module for Grantee Institutional Licensing & Subscription System
 * 
 * Handles license verification, payments, invoices, caching, and account lockout enforcement
 * for Coordinators and Students.
 */

(function (window) {
    'use strict';

    const CACHE_KEY_PREFIX = 'grantee_sub_cache_';
    const CACHE_TTL_MS = 30 * 1000; // 30 seconds fresh cache for rapid response

    function getBackendEndpoints(path) {
        const hostname = window.location.hostname || 'localhost';
        const isLocal = hostname === 'localhost' ||
                        hostname === '127.0.0.1' ||
                        hostname === '0.0.0.0' ||
                        hostname.startsWith('192.168.') ||
                        hostname.startsWith('10.') ||
                        window.location.protocol === 'file:';

        const endpoints = [];

        if (isLocal) {
            // Priority order for local development to prevent 127.0.0.1 vs localhost drops
            if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
                endpoints.push(`http://${hostname}:3000${path}`);
            }
            endpoints.push(`http://127.0.0.1:3000${path}`);
            endpoints.push(`http://localhost:3000${path}`);
            endpoints.push(`https://grantee-backend-n5f4.onrender.com${path}`);
        } else {
            endpoints.push(`https://grantee-backend-n5f4.onrender.com${path}`);
            endpoints.push(`http://127.0.0.1:3000${path}`);
            endpoints.push(`http://localhost:3000${path}`);
        }

        return endpoints;
    }

    async function fetchWithFallback(path, options = {}) {
        const endpoints = getBackendEndpoints(path);
        let lastErr = null;

        for (const url of endpoints) {
            try {
                const isLocalUrl = url.includes('localhost') || url.includes('127.0.0.1') || url.includes(':3000');
                // Local server responds quickly (3.5s timeout is ample if running, fails fast to Render if not)
                // Render cloud endpoint gets up to 60s to survive free-tier cold starts
                const timeoutMs = options.timeoutMs || (isLocalUrl ? 3500 : 60000);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                const res = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    return await res.json();
                } else {
                    const errData = await res.json().catch(() => ({}));
                    lastErr = new Error(errData.error || `HTTP ${res.status}`);
                }
            } catch (err) {
                lastErr = err;
            }
        }

        throw lastErr || new Error('All backend endpoints failed.');
    }

    const SubscriptionClient = {
        /**
         * Check school subscription access status (allowed: true/false)
         */
        async checkAccess(schoolId, forceFresh = false) {
            if (!schoolId) {
                return {
                    allowed: false,
                    status: 'no_school',
                    school_name: 'Unassigned School',
                    reason: 'No school associated with this account.'
                };
            }

            // Check cache unless forceFresh is set
            if (!forceFresh) {
                try {
                    const cached = sessionStorage.getItem(CACHE_KEY_PREFIX + schoolId);
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Date.now() - parsed._cachedAt < CACHE_TTL_MS) {
                            return parsed.data;
                        }
                    }
                } catch (e) {}
            }

            try {
                const data = await fetchWithFallback(`/api/subscription/check/${schoolId}`);
                
                // Save to cache
                try {
                    sessionStorage.setItem(CACHE_KEY_PREFIX + schoolId, JSON.stringify({
                        _cachedAt: Date.now(),
                        data: data
                    }));
                } catch (e) {}

                return data;
            } catch (err) {
                console.warn('[SubscriptionClient] Backend unreachable for check, falling back to cached or lenient fallback:', err);
                
                // Fallback: check if we have any cached data
                try {
                    const cached = sessionStorage.getItem(CACHE_KEY_PREFIX + schoolId);
                    if (cached) {
                        return JSON.parse(cached).data;
                    }
                } catch (e) {}

                // Default safe fallback if network is completely down
                return {
                    allowed: true, // Don't permanently lock out on transient network error if no record
                    status: 'active',
                    school_name: 'Institution',
                    days_remaining: 30,
                    fallback: true
                };
            }
        },

        /**
         * Get full subscription record including invoice history & plan details
         */
        async getDetails(schoolId, forceFresh = false) {
            if (!schoolId) return null;
            try {
                const res = await fetchWithFallback(`/api/subscription/status/${schoolId}`);
                return res.subscription || null;
            } catch (err) {
                console.error('[SubscriptionClient] Error getting subscription details:', err);
                return null;
            }
        },

        /**
         * Get available licensing plans
         */
        async getPlans() {
            try {
                const res = await fetchWithFallback('/api/subscription/plans');
                return res.plans || [];
            } catch (err) {
                return [
                    {
                        id: 'plan_monthly',
                        code: 'monthly',
                        name: 'Monthly Institutional License',
                        billing_cycle: 'monthly',
                        price_php: 2499,
                        period_days: 30
                    },
                    {
                        id: 'plan_yearly',
                        code: 'yearly',
                        name: 'Yearly Institutional License',
                        billing_cycle: 'yearly',
                        price_php: 24990,
                        period_days: 365,
                        recommended: true
                    }
                ];
            }
        },

        /**
         * Process coordinator payment
         */
        async processPayment(paymentPayload) {
            try {
                const res = await fetchWithFallback('/api/subscription/process-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(paymentPayload)
                });

                // Invalidate cache
                if (paymentPayload.schoolId) {
                    sessionStorage.removeItem(CACHE_KEY_PREFIX + paymentPayload.schoolId);
                }

                return res;
            } catch (err) {
                console.error('[SubscriptionClient] Payment processing error:', err);
                throw err;
            }
        },

        /**
         * Get payment gateway & receiving bank accounts configuration
         */
        async getPaymentConfig() {
            try {
                return await fetchWithFallback('/api/subscription/payment-config');
            } catch (err) {
                console.warn('[SubscriptionClient] Using default fallback payment config:', err);
                return {
                    success: true,
                    currency: 'PHP',
                    paymongo_configured: false,
                    receiving_accounts: {
                        banks: [
                            {
                                id: 'bank_landbank',
                                bank_name: 'Landbank of the Philippines',
                                account_name: 'Grantee Educational Technologies Inc.',
                                account_number: '0912-3841-88',
                                branch: 'Institutional Government Hub',
                                is_primary: true
                            },
                            {
                                id: 'bank_bdo',
                                bank_name: 'BDO Unibank',
                                account_name: 'Grantee Educational Technologies Inc.',
                                account_number: '0048-2918-4921',
                                branch: 'Corporate Banking Center'
                            },
                            {
                                id: 'bank_bpi',
                                bank_name: 'Bank of the Philippine Islands (BPI)',
                                account_name: 'Grantee Educational Technologies Inc.',
                                account_number: '2841-9920-14',
                                branch: 'Ayala Commercial Branch'
                            }
                        ],
                        wallets: [
                            {
                                id: 'wallet_gcash',
                                wallet_name: 'GCash Corporate Merchant',
                                account_name: 'Grantee Platform Merchant',
                                mobile_number: '0917-123-4567'
                            },
                            {
                                id: 'wallet_maya',
                                wallet_name: 'Maya Business / QR Ph',
                                account_name: 'Grantee Platform Merchant',
                                mobile_number: '0918-987-6543'
                            }
                        ]
                    }
                };
            }
        },

        /**
         * Create online PayMongo checkout session
         */
        async createCheckoutSession(payload) {
            try {
                return await fetchWithFallback('/api/subscription/create-checkout-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (err) {
                console.error('[SubscriptionClient] Checkout session error:', err);
                throw err;
            }
        },

        /**
         * Verify session upon redirect
         */
        async verifyCheckoutSession(sessionId, schoolId) {
            try {
                const cleanSessionId = (sessionId && !sessionId.includes('{')) ? sessionId : 'pending';
                const query = schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : '';
                return await fetchWithFallback(`/api/subscription/verify-checkout-session/${encodeURIComponent(cleanSessionId)}${query}`);
            } catch (err) {
                console.error('[SubscriptionClient] Verify session error:', err);
                throw err;
            }
        },

        /**
         * Simulate subscription status (active, expired, unpaid) for evaluation / testing
         */
        async simulateStatus(schoolId, status) {
            try {
                const res = await fetchWithFallback('/api/subscription/simulate-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ schoolId, status })
                });

                // Clear cache
                sessionStorage.removeItem(CACHE_KEY_PREFIX + schoolId);
                return res;
            } catch (err) {
                console.error('[SubscriptionClient] Simulation error:', err);
                throw err;
            }
        },

        /**
         * Clear cached subscription for a school
         */
        clearCache(schoolId) {
            if (schoolId) {
                sessionStorage.removeItem(CACHE_KEY_PREFIX + schoolId);
            }
        },

        /**
         * Render an informative Student Lockout Overlay / Modal
         */
        showStudentLockoutUI(schoolName, reason) {
            const cleanSchool = schoolName || 'Your Institution';
            
            // Check if SweetAlert2 is available
            if (window.Swal) {
                window.Swal.fire({
                    icon: 'warning',
                    iconColor: '#e11d48',
                    title: '<span style="color: #0f172a; font-weight: 800; font-size: 22px;">Institutional Access Suspended</span>',
                    html: `
                        <div style="text-align: left; font-size: 14px; color: #475569; line-height: 1.6;">
                            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                                <div style="font-weight: 700; color: #9f1239; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                                    <span>⚠️ Inactive Institutional License</span>
                                </div>
                                <div style="color: #be123c;">
                                    Student accounts for <strong>${cleanSchool}</strong> cannot be accessed because the institution's Grantee system subscription is currently unpaid or expired.
                                </div>
                            </div>
                            <p style="margin-bottom: 10px;">
                                To keep the platform running over the long term, institutions pay an annual or monthly license fee. 
                                This fee is processed through your <strong>School Coordinator's Account</strong>.
                            </p>
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 14px;">
                                <strong style="color: #0f172a; display: block; margin-bottom: 4px;">What should you do?</strong>
                                <span style="font-size: 13px; color: #64748b;">
                                    Please contact your institution's <strong>Scholarship Office / School Coordinator</strong> to renew the Grantee license fee. Access will be immediately restored once payment is confirmed.
                                </span>
                            </div>
                        </div>
                    `,
                    confirmButtonText: 'Understood & Sign Out',
                    confirmButtonColor: '#1F3D2E',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    customClass: {
                        popup: 'subscription-lock-popup'
                    }
                }).then(async () => {
                    if (window.supabaseClient) {
                        await window.supabaseClient.auth.signOut();
                    }
                    window.location.replace('login.html');
                });
                return;
            }

            // Fallback native alert
            alert(`[Institutional License Required]\n\nStudent accounts for ${cleanSchool} cannot be accessed because the institution's Grantee system subscription is currently unpaid or expired.\n\nPlease contact your school's scholarship coordinator.`);
            window.location.replace('login.html');
        },

        /**
         * Render an unclosable full-page Student Lockout Wall
         */
        injectStudentLockWall(schoolName) {
            if (document.getElementById('grantee-student-lock-wall')) return;
            const cleanSchool = schoolName || 'Your Institution';

            const wallHTML = `
                <div id="grantee-student-lock-wall" style="
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 999999; padding: 20px; font-family: 'Inter', system-ui, sans-serif;
                ">
                    <div style="
                        background: #ffffff; border-radius: 16px; width: 100%; max-width: 540px;
                        padding: 36px 32px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
                        text-align: center; border: 1px solid #fee2e2;
                    ">
                        <div style="
                            width: 64px; height: 64px; border-radius: 50%; background: #fee2e2;
                            color: #dc2626; display: inline-flex; align-items: center; justify-content: center;
                            font-size: 28px; margin-bottom: 20px;
                        ">
                            🔒
                        </div>
                        <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">
                            Institutional Access Suspended
                        </h2>
                        <div style="
                            display: inline-block; background: #fee2e2; color: #b91c1c; font-size: 12px;
                            font-weight: 700; padding: 4px 12px; border-radius: 9999px; margin-bottom: 18px;
                            letter-spacing: 0.5px; text-transform: uppercase;
                        ">
                            Subscription Renewal Required
                        </div>
                        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 16px; text-align: left;">
                            The Grantee Educational Assistance Management license for <strong>${cleanSchool}</strong> is currently inactive or expired.
                        </p>
                        <div style="
                            background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
                            padding: 16px; text-align: left; font-size: 13px; color: #475569; line-height: 1.5;
                            margin-bottom: 24px;
                        ">
                            <strong style="color: #0f172a; display: block; margin-bottom: 4px;">ℹ️ Coordinator Action Required</strong>
                            To keep Grantee running over the long term, schools maintain an active monthly or yearly license. 
                            The fee is processed directly through your <strong>School Coordinator's Account</strong>.
                            <br><br>
                            Please contact your school scholarship coordinator or administrative office to renew the license.
                        </div>
                        <button id="lock-wall-signout-btn" style="
                            width: 100%; padding: 12px; background: #1F3D2E; color: #ffffff;
                            font-weight: 700; font-size: 14px; border: none; border-radius: 8px;
                            cursor: pointer; transition: background 0.2s;
                        ">
                            Sign Out to Login
                        </button>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', wallHTML);

            const btn = document.getElementById('lock-wall-signout-btn');
            if (btn) {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    btn.innerText = 'Signing out...';
                    if (window.supabaseClient) {
                        await window.supabaseClient.auth.signOut();
                    }
                    localStorage.removeItem('granteeSelectedSchoolId');
                    sessionStorage.clear();
                    window.location.replace('login.html');
                });
            }
        }
    };

    window.SubscriptionClient = SubscriptionClient;
})(window);
