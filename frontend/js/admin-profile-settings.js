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

                // Populate Display Elements
                const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin User';
                const schoolName = (profile.schools && profile.schools.name) ? profile.schools.name : (profile.school_name || "No School Assigned");
                const roleDisplay = profile.role === 'admin' ? 'Coordinator' : (profile.role || 'Coordinator');

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
                    adminSchoolDisplay.innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>Assigned to: <strong>${schoolName}</strong></span>`;
                }

                // Populate Avatar Images
                const avatarUrl = profile.avatar_url || 'assets/admin-avatar.png';
                const headerAvatar = document.getElementById('header-avatar');
                if (headerAvatar) headerAvatar.src = avatarUrl;

                const settingsAvatarPreview = document.getElementById('settings-avatar-preview');
                if (settingsAvatarPreview) settingsAvatarPreview.src = avatarUrl;

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

                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Success',
                        text: 'Profile successfully updated!',
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
                await loadProfile();

            } catch (err) {
                console.error("Update error:", err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Failed to Update', text: err.message });
                } else {
                    alert("Failed to update profile: " + err.message);
                }
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
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Mismatch', text: 'New passwords do not match. Please try again.' });
                } else {
                    alert('New passwords do not match.');
                }
                return;
            }

            if (currentPassword === newPassword) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'warning', title: 'Invalid Choice', text: 'New password cannot be the same as the current password.' });
                } else {
                    alert('New password cannot be the same as current password.');
                }
                return;
            }

            const passwordError = validatePasswordStrength(newPassword);
            if (passwordError) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'warning', title: 'Weak Password', text: passwordError });
                } else {
                    alert(passwordError);
                }
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

                if (typeof Swal !== 'undefined') {
                    await Swal.fire({
                        icon: 'success',
                        title: 'Password Updated',
                        text: 'For security, you will now be logged out.',
                        timer: 2500,
                        showConfirmButton: false
                    });
                } else {
                    alert('Password updated! You will now be logged out.');
                }

                sessionStorage.removeItem('grantee_admin_profile');
                await window.supabaseClient.auth.signOut();
                window.location.href = 'login.html';

            } catch (err) {
                console.error("Password change error:", err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Update Failed', text: err.message });
                } else {
                    alert("Update failed: " + err.message);
                }
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

                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: 'OTP Sent', text: 'Please check your email inbox for the 6-digit code.', timer: 2000, showConfirmButton: false });
                }
                if (otpModal) otpModal.style.display = 'flex';

            } catch (err) {
                console.error("OTP request error:", err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Failed to Send', text: err.message });
                } else {
                    alert("Failed to send OTP: " + err.message);
                }
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
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'warning', title: 'Weak Password', text: passwordError });
                } else {
                    alert(passwordError);
                }
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

                if (typeof Swal !== 'undefined') {
                    await Swal.fire({
                        icon: 'success',
                        title: 'Password Reset',
                        text: 'Password successfully reset! You will now be logged out.',
                        timer: 2500,
                        showConfirmButton: false
                    });
                }
                sessionStorage.removeItem('grantee_admin_profile');
                await window.supabaseClient.auth.signOut();
                window.location.href = 'login.html';

            } catch (err) {
                console.error("OTP verification error:", err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Verification Failed', text: err.message });
                } else {
                    alert("Verification failed: " + err.message);
                }
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

                if (qrCodeContainer) {
                    qrCodeContainer.innerHTML = `
                        <div style="display: inline-block; background: #fff; padding: 12px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin: 0 auto;">
                            ${data.totp.qr_code}
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 15px; line-height: 1.4;">
                            Can't scan the QR code? Enter this secret key manually into your authenticator app:<br>
                            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px;">
                                <strong style="color: #0f172a; font-family: monospace; font-size: 15px; letter-spacing: 2px; background: #f1f5f9; padding: 6px 12px; border-radius: 4px; border: 1px solid #e2e8f0;">
                                    ${data.totp.secret}
                                </strong>
                                <button type="button" id="copy-totp-secret" title="Copy Secret Key" style="background: #10b981; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">
                                    <i class="fa-regular fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    `;

                    const copyBtn = document.getElementById('copy-totp-secret');
                    if (copyBtn) {
                        copyBtn.addEventListener('click', () => {
                            navigator.clipboard.writeText(data.totp.secret);
                            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                            setTimeout(() => { copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 2000);
                        });
                    }

                    const svgEl = qrCodeContainer.querySelector('svg');
                    if (svgEl) {
                        svgEl.style.width = '180px';
                        svgEl.style.height = '180px';
                        svgEl.style.display = 'block';
                        svgEl.style.margin = '0 auto';
                    }
                }

                if (setup2faSection) setup2faSection.style.display = 'block';
                if (unregisteredSection) unregisteredSection.style.display = 'none';

            } catch (error) {
                console.error("2FA Enroll Error:", error);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Setup Error', text: error.message });
                } else {
                    alert("Setup error: " + error.message);
                }
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
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'warning', title: 'Invalid Code', text: 'Please enter a valid 6-digit verification code.' });
                } else {
                    alert('Please enter a 6-digit code.');
                }
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

                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: '2FA Enabled', text: 'Two-factor authentication is now active.' });
                }

                if (setup2faSection) setup2faSection.style.display = 'none';
                if (unregisteredSection) unregisteredSection.style.display = 'none';
                if (active2faSection) active2faSection.style.display = 'block';

            } catch (error) {
                console.error("2FA Verification Error:", error);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Verification Failed', text: error.message });
                } else {
                    alert("Verification failed: " + error.message);
                }
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

                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: '2FA Disabled', text: 'Two-Factor Authentication has been turned off.' });
                }

                if (active2faSection) active2faSection.style.display = 'none';
                if (setup2faSection) setup2faSection.style.display = 'none';
                if (unregisteredSection) unregisteredSection.style.display = 'block';

            } catch (error) {
                console.error("2FA Disable Error:", error);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: error.message });
                }
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

                await loadProfile();

            } catch (err) {
                console.error("Avatar upload failed:", err);
                if (uploadStatus) {
                    uploadStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload failed.';
                    uploadStatus.style.color = "var(--danger-color)";
                }
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Upload Failed', text: err.message });
                }
            }
        });
    }

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
