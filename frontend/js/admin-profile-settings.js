// js/admin-profile-settings.js
(async function () {

    // ==========================================
    // 1. AUTH CHECK & INITIALIZATION
    // ==========================================
    if (!window.supabaseClient) {
        console.error("Supabase client not initialized.");
        return;
    }

    let session = null;
    try {
        const { data, error: sessionError } = await window.supabaseClient.auth.getSession();
        if (sessionError || !data || !data.session) {
            window.location.href = 'login.html';
            return;
        }
        session = data.session;
    } catch (e) {
        console.error("Session check error:", e);
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    const adminEmail = session.user.email || '';

    // ==========================================
    // UI TOAST SYSTEM (TOP CENTER - EXACT DESIGN)
    // ==========================================
    function showUIToast(type = 'success', title = '', message = '', duration = 4000) {
        if (typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
            Swal.close();
        }

        let container = document.getElementById('custom-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'custom-toast-container';
            document.body.appendChild(container);
        }

        // Clean & normalize type
        type = (type || 'success').toLowerCase();
        if (!['success', 'error', 'info', 'warning'].includes(type)) {
            type = 'info';
        }

        // SVGs matching the visual design reference
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            if (!title) title = 'Success';
            if (!message) message = 'Your changes are saved successfully';
        } else if (type === 'error') {
            iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            if (!title) title = 'Error';
            if (!message) message = 'Error has occurred while saving changes.';
        } else if (type === 'info') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
            if (!title) title = 'Info';
            if (!message) message = 'New settings available on your account.';
        } else if (type === 'warning') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
            if (!title) title = 'Warning';
            if (!message) message = 'Please check the entered values.';
        }

        const toast = document.createElement('div');
        toast.className = `custom-ui-toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-left-bar"></div>
            <div class="toast-icon-wrapper">
                ${iconSvg}
            </div>
            <div class="toast-details">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message || ''}</div>
            </div>
            <button type="button" class="toast-close-btn" aria-label="Close notification">&times;</button>
        `;

        container.appendChild(toast);

        // Entrance animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('toast-show');
            });
        });

        let isDismissed = false;
        const dismissToast = () => {
            if (isDismissed) return;
            isDismissed = true;
            toast.classList.remove('toast-show');
            toast.classList.add('toast-hide');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 320);
        };

        const closeBtn = toast.querySelector('.toast-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissToast();
            });
        }

        // Auto dismiss after duration
        const autoDismissTimer = setTimeout(dismissToast, duration || 3800);

        // Pause on hover
        toast.addEventListener('mouseenter', () => clearTimeout(autoDismissTimer));
        toast.addEventListener('mouseleave', () => {
            if (!isDismissed) {
                setTimeout(dismissToast, 2000);
            }
        });
    }
    window.showUIToast = showUIToast;
    window.showToast = showUIToast;

    // --- STRONG PASSWORD VALIDATOR ---
    const validatePasswordStrength = (password) => {
        if (!password || password.length < 8) return "Password must be at least 8 characters long.";
        if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
        if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
        if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
        return null;
    };

    // ==========================================
    // 2. LOAD PROFILE DATA & 2FA STATUS
    // ==========================================
    async function loadProfile() {
        try {
            // 1. Populate Email Field
            const emailInput = document.getElementById('prof-email');
            if (emailInput) {
                emailInput.value = adminEmail;
            }

            // 2. Fetch Profile from Supabase with safe relation join fallback
            let profile = null;
            try {
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('*, schools(name)')
                    .eq('id', adminId)
                    .single();

                if (error) throw error;
                profile = data;
            } catch (relationErr) {
                console.warn("Retrying profile fetch without relation join...", relationErr);
                const { data, error } = await window.supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', adminId)
                    .single();

                if (error) throw error;
                profile = data;
            }

            if (profile) {
                // Check if user is student and should be redirected
                if (profile.role === 'student') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                // Populate Form Fields
                const fnInput = document.getElementById('prof-firstname');
                if (fnInput) fnInput.value = profile.first_name || '';

                const mnInput = document.getElementById('prof-middlename');
                if (mnInput) mnInput.value = profile.middle_name || '';

                const lnInput = document.getElementById('prof-lastname');
                if (lnInput) lnInput.value = profile.last_name || '';

                const phInput = document.getElementById('prof-phone');
                if (phInput) phInput.value = profile.contact_number || '';

                // Populate Display Elements & Locked Fields
                const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin User';
                const schoolName = (profile.schools && profile.schools.name) ? profile.schools.name : (profile.school_name || "No School Assigned");
                const roleDisplay = profile.role === 'admin' ? 'Coordinator' : (profile.role || 'Coordinator');

                const profSchool = document.getElementById('prof-school');
                if (profSchool) profSchool.value = schoolName;

                const profRole = document.getElementById('prof-role');
                if (profRole) profRole.value = roleDisplay;

                const headerName = document.getElementById('header-name');
                if (headerName) headerName.innerText = fullName;

                const headerRole = document.getElementById('header-role');
                if (headerRole) headerRole.innerText = roleDisplay;

                const displayFullName = document.getElementById('display-full-name');
                if (displayFullName) displayFullName.innerText = fullName;

                const displayRole = document.getElementById('display-role');
                if (displayRole) displayRole.innerText = roleDisplay;

                const displaySchool = document.getElementById('display-school');
                if (displaySchool) displaySchool.innerText = schoolName;

                const adminSchoolDisplay = document.getElementById('admin-school-display');
                if (adminSchoolDisplay) {
                    adminSchoolDisplay.innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>${schoolName}</span>`;
                }

                // Populate Avatar Images
                const avatarUrl = profile.avatar_url || 'assets/admin-avatar.png';
                const headerAvatar = document.getElementById('header-avatar');
                if (headerAvatar) headerAvatar.src = avatarUrl;

                const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
                if (settingsAvatarPreview) settingsAvatarPreview.src = avatarUrl;

                const modalAvatarImg = document.getElementById('modal-avatar-img');
                if (modalAvatarImg) modalAvatarImg.src = avatarUrl;

                // Sync sessionStorage cache
                sessionStorage.setItem('grantee_admin_profile', JSON.stringify({
                    name: fullName,
                    role: roleDisplay,
                    avatar_url: avatarUrl,
                    school_name: schoolName,
                    school_id: profile.school_id
                }));

                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }

                // Check 2FA Status
                await check2FAStatus();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to load profile details: ' + (err.message || 'Unknown error')
                });
            }
        } finally {
            // Hide skeleton and smoothly reveal actual settings content
            const skeletonEl = document.getElementById('settings-skeleton-state');
            const loadedEl = document.getElementById('settings-loaded-content');
            if (skeletonEl) skeletonEl.style.display = 'none';
            if (loadedEl) {
                loadedEl.style.display = 'grid';
                loadedEl.classList.add('fade-in-content');
            }
        }
    }

    // ==========================================
    // 3. UPDATE PERSONAL INFORMATION
    // ==========================================
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('btn-save-profile');
            const originalText = saveBtn ? saveBtn.innerHTML : 'Save Changes';
            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
                saveBtn.disabled = true;
            }

            const updates = {
                first_name: (document.getElementById('prof-firstname')?.value || '').trim(),
                middle_name: (document.getElementById('prof-middlename')?.value || '').trim(),
                last_name: (document.getElementById('prof-lastname')?.value || '').trim(),
                contact_number: (document.getElementById('prof-phone')?.value || '').trim()
            };

            try {
                const { error } = await window.supabaseClient
                    .from('profiles')
                    .update(updates)
                    .eq('id', adminId);

                if (error) throw error;

                showUIToast('success', 'Success', 'Profile successfully updated!');
                await loadProfile();

            } catch (err) {
                console.error("Update error:", err);
                showUIToast('error', 'Update Failed', err.message || 'Failed to update profile.');
            } finally {
                if (saveBtn) {
                    saveBtn.innerHTML = originalText;
                    saveBtn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    // 4. STANDARD PASSWORD UPDATE
    // ==========================================
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = document.getElementById('current-password')?.value || '';
            const newPassword = document.getElementById('new-password')?.value || '';
            const confirmPassword = document.getElementById('confirm-password')?.value || '';

            if (newPassword !== confirmPassword) {
                showUIToast('error', 'Mismatch', 'New passwords do not match. Please try again.');
                return;
            }

            if (currentPassword === newPassword) {
                showUIToast('warning', 'Invalid Choice', 'New password cannot be the same as the current password.');
                return;
            }

            const passwordError = validatePasswordStrength(newPassword);
            if (passwordError) {
                showUIToast('warning', 'Weak Password', passwordError);
                return;
            }

            const btn = document.getElementById('btn-change-password') || document.getElementById('btn-save-password');
            const originalText = btn ? btn.innerHTML : 'Update Password';
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
                btn.disabled = true;
            }

            try {
                const { error: signInError } = await window.supabaseClient.auth.signInWithPassword({
                    email: adminEmail,
                    password: currentPassword
                });

                if (signInError) throw new Error("Incorrect current password. Please try again.");

                if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';
                const { error: updateError } = await window.supabaseClient.auth.updateUser({
                    password: newPassword
                });

                if (updateError) throw updateError;

                showUIToast('success', 'Password Updated', 'For security, you will now be logged out.');
                setTimeout(async () => {
                    sessionStorage.removeItem('grantee_admin_profile');
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                }, 1800);

            } catch (err) {
                console.error("Password change error:", err);
                showUIToast('error', 'Update Failed', err.message || 'Password update failed.');
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    // 5. OTP PASSWORD RESET FLOW
    // ==========================================
    const forgotPasswordLink = document.getElementById('forgot-password-link') || document.getElementById('btn-send-otp');
    const otpModal = document.getElementById('otp-modal');
    const otpResetForm = document.getElementById('otp-reset-form');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();

            if (typeof Swal !== 'undefined') {
                const confirmSend = await Swal.fire({
                    title: 'Send OTP?',
                    text: `A reset OTP will be sent to ${adminEmail}. Proceed?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#10b981',
                    confirmButtonText: 'Yes, send it'
                });

                if (!confirmSend.isConfirmed) return;
            }

            try {
                const { error } = await window.supabaseClient.auth.resetPasswordForEmail(adminEmail);
                if (error) throw error;

                showUIToast('success', 'OTP Sent', 'Please check your email inbox for the 6-digit code.');
                if (otpModal) otpModal.style.display = 'flex';

            } catch (err) {
                console.error("OTP request error:", err);
                showUIToast('error', 'Failed to Send', err.message || 'Failed to send OTP.');
            }
        });
    }

    if (otpResetForm) {
        otpResetForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const token = document.getElementById('otp-code')?.value.trim();
            const newPassword = document.getElementById('otp-new-password')?.value;
            const verifyBtn = document.getElementById('btn-verify-otp');

            const passwordError = validatePasswordStrength(newPassword);
            if (passwordError) {
                showUIToast('warning', 'Weak Password', passwordError);
                return;
            }

            if (verifyBtn) {
                verifyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
                verifyBtn.disabled = true;
            }

            try {
                const { error: verifyError } = await window.supabaseClient.auth.verifyOtp({
                    email: adminEmail,
                    token: token,
                    type: 'recovery'
                });

                if (verifyError) throw verifyError;

                const { error: updateError } = await window.supabaseClient.auth.updateUser({
                    password: newPassword
                });

                if (updateError) throw updateError;

                showUIToast('success', 'Password Reset', 'Password successfully reset! You will now be logged out.');
                setTimeout(async () => {
                    sessionStorage.removeItem('grantee_admin_profile');
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                }, 1800);

            } catch (err) {
                console.error("OTP verification error:", err);
                showUIToast('error', 'Verification Failed', err.message || 'OTP verification failed.');
                if (verifyBtn) {
                    verifyBtn.innerHTML = "Verify & Reset";
                    verifyBtn.disabled = false;
                }
            }
        });
    }

    // ==========================================
    // 6. TWO-FACTOR AUTHENTICATION (2FA) SETUP
    // ==========================================
    const unregisteredSection = document.getElementById('unregistered-2fa-section');
    const active2faSection = document.getElementById('active-2fa-section');
    const setup2faSection = document.getElementById('setup-2fa-section');
    const enable2faBtn = document.getElementById('enable-2fa-btn') || document.getElementById('start-2fa-btn');
    const disable2faBtn = document.getElementById('disable-2fa-btn');
    const confirm2faBtn = document.getElementById('confirm-2fa-btn');
    const verify2faInput = document.getElementById('verify-2fa-input');
    const qrCodeContainer = document.getElementById('qr-code-container');
    let factorId = null;

    async function check2FAStatus() {
        try {
            if (!window.supabaseClient.auth.mfa) return;
            const { data: factors, error } = await window.supabaseClient.auth.mfa.listFactors();
            if (error) throw error;

            const is2faEnabled = factors && factors.totp && factors.totp.some(f => f.status === 'verified');
            if (is2faEnabled) {
                if (unregisteredSection) unregisteredSection.style.display = 'none';
                if (setup2faSection) setup2faSection.style.display = 'none';
                if (active2faSection) active2faSection.style.display = 'block';
            } else {
                if (active2faSection) active2faSection.style.display = 'none';
                if (setup2faSection) setup2faSection.style.display = 'none';
                if (unregisteredSection) unregisteredSection.style.display = 'block';
            }
        } catch (err) {
            console.warn("Error checking 2FA status:", err);
            if (unregisteredSection) unregisteredSection.style.display = 'block';
        }
    }

    if (enable2faBtn) {
        enable2faBtn.addEventListener('click', async () => {
            const originalText = enable2faBtn.innerHTML;
            enable2faBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';
            enable2faBtn.disabled = true;

            try {
                const { data, error } = await window.supabaseClient.auth.mfa.enroll({
                    factorType: 'totp',
                    issuer: 'Grantee System Admin',
                    friendlyName: `Admin App ${Math.floor(Math.random() * 10000)}`
                });
                if (error) throw error;

                factorId = data.id;

                const totpUri = data.totp.uri || `otpauth://totp/Grantee%20System%20Admin:${encodeURIComponent(adminEmail || 'Admin')}?secret=${data.totp.secret}&issuer=Grantee%20System`;
                const secretKey = data.totp.secret;

                if (qrCodeContainer) {
                    qrCodeContainer.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;">
                            <div style="display: inline-flex; align-items: center; justify-content: center; background: #ffffff !important; padding: 14px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid var(--border-color, #e2e8f0); width: 228px; height: 228px; box-sizing: border-box; margin: 0 auto;">
                                <div id="admin-qr-canvas-holder" style="width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; background: #ffffff;"></div>
                            </div>
                            <p style="font-size: 13px; color: #64748b; text-align: center; margin: 0; max-width: 400px; line-height: 1.4;">
                                Scan this QR code with <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or any 2FA app.
                            </p>
                            <div style="font-size: 12px; color: #64748b; text-align: center; margin-top: 4px; width: 100%;">
                                Can't scan the QR code? Enter this secret key manually into your authenticator app:
                                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px;">
                                    <strong style="color: #0f172a; font-family: monospace; font-size: 15px; letter-spacing: 2px; background: #f1f5f9; padding: 6px 14px; border-radius: 6px; border: 1px solid #e2e8f0; user-select: all;">
                                        ${secretKey}
                                    </strong>
                                    <button type="button" id="copy-totp-secret" title="Copy Secret Key" style="background: #10b981; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">
                                        <i class="fa-regular fa-copy"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;

                    const holder = document.getElementById('admin-qr-canvas-holder');
                    let qrRendered = false;

                    if (typeof QRCode !== 'undefined' && holder) {
                        try {
                            holder.innerHTML = '';
                            new QRCode(holder, {
                                text: totpUri,
                                width: 200,
                                height: 200,
                                colorDark: "#000000",
                                colorLight: "#ffffff",
                                correctLevel: QRCode.CorrectLevel.M
                            });
                            
                            const hideWorkingCanvas = () => {
                                const canvasEl = holder.querySelector('canvas');
                                const imgEl = holder.querySelector('img');
                                if (canvasEl && imgEl) {
                                    canvasEl.style.display = 'none';
                                }
                            };
                            hideWorkingCanvas();
                            setTimeout(hideWorkingCanvas, 50);

                            qrRendered = true;
                        } catch (e) {
                            console.warn("QRCodeJS generation failed, falling back:", e);
                        }
                    }

                    if (!qrRendered && holder && data.totp.qr_code) {
                        const rawQr = String(data.totp.qr_code).trim();
                        if (rawQr.startsWith('data:image') || rawQr.startsWith('http')) {
                            holder.innerHTML = `<img src="${rawQr}" alt="2FA QR Code" style="width: 200px; height: 200px; display: block; border-radius: 4px; image-rendering: pixelated;">`;
                            qrRendered = true;
                        } else if (rawQr.startsWith('<svg')) {
                            holder.innerHTML = rawQr;
                            const svg = holder.querySelector('svg');
                            if (svg) {
                                svg.setAttribute('width', '200');
                                svg.setAttribute('height', '200');
                                svg.style.width = '200px';
                                svg.style.height = '200px';
                                svg.style.display = 'block';
                            }
                            qrRendered = true;
                        }
                    }

                    if (!qrRendered && holder) {
                        const encodedUri = encodeURIComponent(totpUri);
                        holder.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedUri}&margin=2" alt="2FA QR Code" style="width: 200px; height: 200px; display: block; border-radius: 4px;">`;
                    }

                    const copyBtn = document.getElementById('copy-totp-secret');
                    if (copyBtn) {
                        copyBtn.addEventListener('click', () => {
                            navigator.clipboard.writeText(secretKey);
                            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                            setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
                        });
                    }
                }

                if (setup2faSection) setup2faSection.style.display = 'block';
                if (unregisteredSection) unregisteredSection.style.display = 'none';

            } catch (error) {
                console.error("2FA Enroll Error:", error);
                showUIToast('error', 'Setup Error', error.message || '2FA setup error.');
            } finally {
                enable2faBtn.innerHTML = originalText;
                enable2faBtn.disabled = false;
            }
        });
    }

    if (confirm2faBtn) {
        confirm2faBtn.addEventListener('click', async () => {
            const code = (verify2faInput?.value || '').trim();
            if (code.length !== 6) {
                showUIToast('warning', 'Invalid Code', 'Please enter a valid 6-digit verification code.');
                return;
            }

            confirm2faBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            confirm2faBtn.disabled = true;

            try {
                const { data: challenge, error: challengeError } = await window.supabaseClient.auth.mfa.challenge({ factorId });
                if (challengeError) throw challengeError;

                const { error: verifyError } = await window.supabaseClient.auth.mfa.verify({
                    factorId,
                    challengeId: challenge.id,
                    code: code
                });

                if (verifyError) throw verifyError;

                showUIToast('success', '2FA Enabled', 'Two-factor authentication is now active.');

                if (setup2faSection) setup2faSection.style.display = 'none';
                if (unregisteredSection) unregisteredSection.style.display = 'none';
                if (active2faSection) active2faSection.style.display = 'block';

            } catch (error) {
                console.error("2FA Verification Error:", error);
                showUIToast('error', 'Verification Failed', error.message || '2FA verification failed.');
                if (verify2faInput) {
                    verify2faInput.value = '';
                    verify2faInput.focus();
                }
            } finally {
                confirm2faBtn.innerText = "Confirm";
                confirm2faBtn.disabled = false;
            }
        });
    }

    if (disable2faBtn) {
        disable2faBtn.addEventListener('click', async () => {
            if (typeof Swal !== 'undefined') {
                const confirm = await Swal.fire({
                    title: 'Turn Off 2FA?',
                    text: "Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#ef4444',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Yes, turn it off'
                });

                if (!confirm.isConfirmed) return;
            }

            disable2faBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Turning Off...';
            disable2faBtn.disabled = true;

            try {
                const { data: factors, error: listError } = await window.supabaseClient.auth.mfa.listFactors();
                if (listError) throw listError;

                const activeFactor = factors.totp.find(f => f.status === 'verified');
                if (!activeFactor) throw new Error("No active 2FA factor found.");

                const { error: unenrollError } = await window.supabaseClient.auth.mfa.unenroll({ factorId: activeFactor.id });
                if (unenrollError) throw unenrollError;

                showUIToast('success', '2FA Disabled', 'Two-Factor Authentication has been turned off.');

                if (active2faSection) active2faSection.style.display = 'none';
                if (setup2faSection) setup2faSection.style.display = 'none';
                if (unregisteredSection) unregisteredSection.style.display = 'block';

            } catch (error) {
                console.error("2FA Disable Error:", error);
                showUIToast('error', 'Error', error.message || 'Failed to turn off 2FA.');
            } finally {
                disable2faBtn.innerText = 'Turn Off 2FA';
                disable2faBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // 7. AVATAR UPLOAD
    // ==========================================
    const avatarInput = document.getElementById('avatar-upload');
    const uploadStatus = document.getElementById('upload-status');

    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Instant local preview
            const reader = new FileReader();
            reader.onload = (re) => {
                const preview = document.getElementById('settings-avatar-preview');
                if (preview) preview.src = re.target.result;
                const headerAv = document.getElementById('header-avatar');
                if (headerAv) headerAv.src = re.target.result;
                const modalAv = document.getElementById('modal-avatar-img');
                if (modalAv) modalAv.src = re.target.result;
            };
            reader.readAsDataURL(file);

            if (uploadStatus) {
                uploadStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading avatar...';
                uploadStatus.style.color = "var(--primary-color)";
            }

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${adminId}-${Date.now()}.${fileExt}`;
                const filePath = `admin/${fileName}`;

                const { error: uploadError } = await window.supabaseClient.storage
                    .from('avatars')
                    .upload(filePath, file, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = window.supabaseClient.storage
                    .from('avatars')
                    .getPublicUrl(filePath);

                const avatarUrl = publicUrlData.publicUrl;

                const { error: updateError } = await window.supabaseClient
                    .from('profiles')
                    .update({ avatar_url: avatarUrl })
                    .eq('id', adminId);

                if (updateError) throw updateError;

                if (uploadStatus) {
                    uploadStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Avatar updated successfully!';
                    setTimeout(() => { uploadStatus.innerHTML = ""; }, 3500);
                }
                showUIToast('success', 'Success', 'Avatar updated successfully!');

                await loadProfile();

            } catch (err) {
                console.error("Avatar upload failed:", err);
                if (uploadStatus) {
                    uploadStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload failed.';
                    uploadStatus.style.color = "var(--danger-color)";
                }
                showUIToast('error', 'Upload Failed', err.message || 'Avatar upload failed.');
            }
        });
    }

    // ==========================================
    // 8. AVATAR PREVIEW LIGHTBOX MODAL
    // ==========================================
    const avatarClickableWrapper = document.getElementById('avatar-clickable-wrapper') || document.getElementById('settings-avatar-preview');
    const avatarPreviewModal = document.getElementById('avatar-preview-modal');
    const closeAvatarModalBtn = document.getElementById('close-avatar-modal');
    const modalAvatarImg = document.getElementById('modal-avatar-img');
    const modalPreviewName = document.getElementById('modal-preview-name');
    const modalPreviewRole = document.getElementById('modal-preview-role');
    const modalDownloadBtn = document.getElementById('modal-download-photo-btn');
    const modalChangePhotoBtn = document.getElementById('modal-change-photo-btn');

    function openAvatarPreview() {
        const previewEl = document.getElementById('settings-avatar-preview');
        const avatarSrc = previewEl ? previewEl.src : 'assets/admin-avatar.png';
        const adminName = document.getElementById('display-full-name')?.innerText || 'Admin Profile Photo';
        const adminRole = document.getElementById('display-role')?.innerText || 'Scholarship Coordinator';

        if (modalAvatarImg) modalAvatarImg.src = avatarSrc;
        if (modalPreviewName) modalPreviewName.innerText = adminName;
        if (modalPreviewRole) modalPreviewRole.innerText = adminRole;
        if (modalDownloadBtn) modalDownloadBtn.href = avatarSrc;

        if (avatarPreviewModal) {
            avatarPreviewModal.style.display = 'flex';
        }
    }

    function closeAvatarPreview() {
        if (avatarPreviewModal) {
            avatarPreviewModal.style.display = 'none';
        }
    }

    if (avatarClickableWrapper) {
        avatarClickableWrapper.addEventListener('click', (e) => {
            // Do not open modal if user specifically clicked the camera upload button or file input
            if (e.target.closest('.avatar-upload-btn') || e.target.id === 'avatar-upload') {
                return;
            }
            openAvatarPreview();
        });
    }

    if (closeAvatarModalBtn) {
        closeAvatarModalBtn.addEventListener('click', closeAvatarPreview);
    }

    if (avatarPreviewModal) {
        avatarPreviewModal.addEventListener('click', (e) => {
            if (e.target === avatarPreviewModal) {
                closeAvatarPreview();
            }
        });
    }

    if (modalChangePhotoBtn) {
        modalChangePhotoBtn.addEventListener('click', () => {
            closeAvatarPreview();
            const fileInput = document.getElementById('avatar-upload');
            if (fileInput) fileInput.click();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && avatarPreviewModal && avatarPreviewModal.style.display === 'flex') {
            closeAvatarPreview();
        }
    });

    // Initial load
    await loadProfile();

})();

window.togglePasswordVisibility = function (inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = button.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    }
};
