document.addEventListener('DOMContentLoaded', async () => {
    
    // ==========================================
    // 1. AUTH CHECK & INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html'; 
        return;
    }

    const adminId = session.user.id;
    const adminEmail = session.user.email;

    // --- STRONG PASSWORD VALIDATOR ---
    const validatePasswordStrength = (password) => {
        if (password.length < 8) return "Password must be at least 8 characters long.";
        if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
        if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
        if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one special character.";
        return null; 
    };

    // ==========================================
    // 2. HEADER DROPDOWN & ROBUST MOBILE HAMBURGER
    // ==========================================
    
    // Dropdown Logic
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            profileMenu.classList.toggle('show');
            profileToggle.classList.toggle('active-state');
        });
    }

    // Body Event Delegation for clicking outside and Hamburger Menu
    document.body.addEventListener('click', (e) => {
        // Close Dropdown if clicked outside
        if (profileToggle && profileMenu && !profileToggle.contains(e.target)) {
            profileMenu.classList.remove('show');
            profileToggle.classList.remove('active-state');
        }

        // Toggle Sidebar on Hamburger click
        const hamburgerBtn = e.target.closest('#mobile-menu-toggle');
        if (hamburgerBtn) {
            const sidebar = document.querySelector('.sidebar');
            const sidebarContainer = document.getElementById('sidebar-container');
            const overlay = document.getElementById('sidebar-overlay');
            
            if (sidebar) sidebar.classList.toggle('active');
            if (sidebarContainer) sidebarContainer.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
            return;
        }

        // Close Sidebar on Overlay click
        if (e.target.id === 'sidebar-overlay') {
            const sidebar = document.querySelector('.sidebar');
            const sidebarContainer = document.getElementById('sidebar-container');
            
            if (sidebar) sidebar.classList.remove('active');
            if (sidebarContainer) sidebarContainer.classList.remove('active');
            e.target.classList.remove('active');
        }
    });

    // Logout Modal Logic
    const logoutModal = document.getElementById('logout-modal');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    const logoutBtn = document.getElementById('dropdown-logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (logoutModal) logoutModal.style.display = 'flex';
            if (profileMenu) profileMenu.classList.remove('show'); 
            if (profileToggle) profileToggle.classList.remove('active-state');
        });
    }

    if (modalCancel) modalCancel.addEventListener('click', () => logoutModal.style.display = 'none');
    if (logoutModal) logoutModal.addEventListener('click', (e) => { if (e.target === logoutModal) logoutModal.style.display = 'none'; });

    if (modalConfirm) {
        modalConfirm.addEventListener('click', async () => {
            try {
                Swal.fire({ title: 'Logging out...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                await window.supabaseClient.auth.signOut();
                window.location.href = 'login.html';
            } catch (err) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to log out. Please try again.' });
            }
        });
    }

    // ==========================================
    // 3. LOAD PROFILE DATA & 2FA STATUS
    // ==========================================
    async function loadProfile() {
        try {
            document.getElementById('prof-email').value = adminEmail;

            const { data: profile, error } = await window.supabaseClient
                .from('profiles')
                .select(`*, schools ( name )`)
                .eq('id', adminId)
                .single();

            if (error) throw error;

            if (profile) {
                if (!['admin', 'coordinator'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                // Populate Form Fields
                document.getElementById('prof-firstname').value = profile.first_name || '';
                document.getElementById('prof-middlename').value = profile.middle_name || '';
                document.getElementById('prof-lastname').value = profile.last_name || '';
                document.getElementById('prof-phone').value = profile.contact_number || '';

                // Populate Display Elements
                const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin User';
                document.getElementById('header-name').innerText = fullName;
                document.getElementById('display-full-name').innerText = fullName;

                if (profile.schools && profile.schools.name) {
                    document.getElementById('display-school').innerText = profile.schools.name;
                } else {
                    document.getElementById('display-school').innerText = "No School Assigned";
                }

                // Populate Avatar
                if (profile.avatar_url) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                    document.getElementById('settings-avatar-preview').src = profile.avatar_url;
                }

                // CHECK 2FA STATUS
                const { data: mfaData, error: mfaError } = await window.supabaseClient.auth.mfa.listFactors();
                if (!mfaError && mfaData && mfaData.totp && mfaData.totp.length > 0) {
                    const start2faBtn = document.getElementById('start-2fa-btn');
                    const setup2faSection = document.getElementById('setup-2fa-section');
                    if(start2faBtn && setup2faSection) {
                        start2faBtn.style.display = 'none';
                        setup2faSection.style.display = 'block';
                        setup2faSection.style.borderTop = 'none';
                        setup2faSection.innerHTML = '<p style="color: #10b981; font-weight: bold; margin: 0;"><i class="fa-solid fa-circle-check"></i> 2FA is currently Active.</p>';
                    }
                }
            }
        } catch (err) {
            console.error("Error loading profile:", err);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to load profile details.' });
        }
    }

    // ==========================================
    // 4. UPDATE PERSONAL INFORMATION
    // ==========================================
    const profileForm = document.getElementById('profile-form');
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('btn-save-profile');
        saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        const updates = {
            first_name: document.getElementById('prof-firstname').value.trim(),
            middle_name: document.getElementById('prof-middlename').value.trim(),
            last_name: document.getElementById('prof-lastname').value.trim(),
            contact_number: document.getElementById('prof-phone').value.trim()
        };

        try {
            const { error } = await window.supabaseClient
                .from('profiles')
                .update(updates)
                .eq('id', adminId);

            if (error) throw error;

            Swal.fire({ icon: 'success', title: 'Success', text: 'Profile successfully updated!', timer: 1500, showConfirmButton: false });
            loadProfile(); 

        } catch (err) {
            console.error("Update error:", err);
            Swal.fire({ icon: 'error', title: 'Failed to Update', text: err.message });
        } finally {
            saveBtn.innerText = "Save Changes";
            saveBtn.disabled = false;
        }
    });

    // ==========================================
    // 5. STANDARD PASSWORD UPDATE
    // ==========================================
    const passwordForm = document.getElementById('password-form');
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            Swal.fire({ icon: 'error', title: 'Mismatch', text: 'New passwords do not match. Please try again.' });
            return;
        }

        if (currentPassword === newPassword) {
            Swal.fire({ icon: 'warning', title: 'Invalid Choice', text: 'New password cannot be the same as the current password.' });
            return;
        }

        const passwordError = validatePasswordStrength(newPassword);
        if (passwordError) {
            Swal.fire({ icon: 'warning', title: 'Weak Password', text: passwordError });
            return;
        }

        const btn = document.getElementById('btn-save-password');
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
        btn.disabled = true;

        try {
            const { error: signInError } = await window.supabaseClient.auth.signInWithPassword({
                email: adminEmail,
                password: currentPassword
            });

            if (signInError) throw new Error("Incorrect current password. Please try again.");

            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Updating...';
            const { error: updateError } = await window.supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (updateError) throw updateError;

            await Swal.fire({ icon: 'success', title: 'Password Updated', text: 'For security, you will now be logged out.', timer: 2500, showConfirmButton: false });
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';

        } catch (err) {
            console.error("Password change error:", err);
            Swal.fire({ icon: 'error', title: 'Update Failed', text: err.message });
            btn.innerText = "Update Password";
            btn.disabled = false;
        }
    });

    // ==========================================
    // 6. OTP PASSWORD RESET FLOW
    // ==========================================
    const sendOtpBtn = document.getElementById('btn-send-otp');
    const otpModal = document.getElementById('otp-modal');
    const otpResetForm = document.getElementById('otp-reset-form');

    sendOtpBtn.addEventListener('click', async () => {
        const confirmSend = await Swal.fire({
            title: 'Send OTP?',
            text: `An OTP will be sent to ${adminEmail}. Proceed?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Yes, send it'
        });

        if (!confirmSend.isConfirmed) return;

        sendOtpBtn.innerText = "Sending...";
        sendOtpBtn.disabled = true;

        try {
            const { error } = await window.supabaseClient.auth.resetPasswordForEmail(adminEmail);
            if (error) throw error;
            
            Swal.fire({ icon: 'success', title: 'OTP Sent', text: 'Please check your email inbox.', timer: 1500, showConfirmButton: false });
            otpModal.style.display = 'flex'; 

        } catch (err) {
            console.error("OTP request error:", err);
            Swal.fire({ icon: 'error', title: 'Failed to Send', text: err.message });
        } finally {
            sendOtpBtn.innerText = "Forgot Password? Send OTP";
            sendOtpBtn.disabled = false;
        }
    });

    otpResetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const token = document.getElementById('otp-code').value.trim();
        const newPassword = document.getElementById('otp-new-password').value;
        const verifyBtn = document.getElementById('btn-verify-otp');

        const passwordError = validatePasswordStrength(newPassword);
        if (passwordError) {
            Swal.fire({ icon: 'warning', title: 'Weak Password', text: passwordError });
            return;
        }

        verifyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
        verifyBtn.disabled = true;

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

            await Swal.fire({ icon: 'success', title: 'Password Reset', text: 'Password successfully reset! You will now be logged out.', timer: 2500, showConfirmButton: false });
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';

        } catch (err) {
            console.error("OTP verification error:", err);
            Swal.fire({ icon: 'error', title: 'Verification Failed', text: err.message });
            verifyBtn.innerText = "Verify & Reset";
            verifyBtn.disabled = false;
        }
    });

    // ==========================================
    // 7. TWO-FACTOR AUTHENTICATION (2FA) SETUP
    // ==========================================
    const start2faBtn = document.getElementById('start-2fa-btn');
    const setup2faSection = document.getElementById('setup-2fa-section');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const verify2faInput = document.getElementById('verify-2fa-input');
    const confirm2faBtn = document.getElementById('confirm-2fa-btn');
    let factorId = null;

    if (start2faBtn) {
        start2faBtn.addEventListener('click', async () => {
            start2faBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';
            start2faBtn.disabled = true;

            try {
                const { data, error } = await window.supabaseClient.auth.mfa.enroll({ factorType: 'totp' });
                if (error) throw error;

                factorId = data.id;

                qrCodeContainer.innerHTML = data.totp.qr_code;
                qrCodeContainer.innerHTML += `
                    <p style="font-size: 12px; color: #64748b; margin-top: 15px; line-height: 1.4;">
                        Can't scan the QR code? Enter this secret key manually into your app:<br>
                        <strong style="color: #0f172a; font-family: monospace; font-size: 16px; letter-spacing: 2px; word-break: break-all; display: inline-block; margin-top: 5px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">
                            ${data.totp.secret}
                        </strong>
                    </p>
                `;
                
                setup2faSection.style.display = 'block';
                start2faBtn.style.display = 'none';

            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Setup Error', text: error.message });
                start2faBtn.innerText = "Set Up 2FA";
                start2faBtn.disabled = false;
            }
        });
    }

    if (confirm2faBtn) {
        confirm2faBtn.addEventListener('click', async () => {
            const code = verify2faInput.value.trim();
            if (code.length !== 6) {
                Swal.fire({ icon: 'warning', title: 'Invalid Code', text: 'Please enter a valid 6-digit code.' });
                return;
            }

            confirm2faBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            confirm2faBtn.disabled = true;

            try {
                const { data: challenge, error: challengeError } = await window.supabaseClient.auth.mfa.challenge({ factorId });
                if (challengeError) throw challengeError;

                const { data: verifyData, error: verifyError } = await window.supabaseClient.auth.mfa.verify({
                    factorId,
                    challengeId: challenge.id,
                    code: code
                });

                if (verifyError) throw verifyError;

                Swal.fire({ icon: 'success', title: '2FA Enabled', text: 'You will be asked for a code next time you log in.' });
                
                setup2faSection.style.borderTop = 'none';
                setup2faSection.innerHTML = '<p style="color: #10b981; font-weight: bold; margin: 0;"><i class="fa-solid fa-circle-check"></i> 2FA is currently Active.</p>';

            } catch (error) {
                Swal.fire({ icon: 'error', title: 'Verification Failed', text: 'Invalid code. Please try again. ' + error.message });
                confirm2faBtn.innerText = "Confirm";
                confirm2faBtn.disabled = false;
                verify2faInput.value = '';
                verify2faInput.focus();
            }
        });
    }

    // ==========================================
    // 8. AVATAR UPLOAD
    // ==========================================
    const avatarInput = document.getElementById('avatar-upload');
    const uploadStatus = document.getElementById('upload-status');

    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('settings-avatar-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);

            uploadStatus.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading...';
            uploadStatus.style.color = "var(--primary-color)";

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${adminId}-${Math.random()}.${fileExt}`;
                const filePath = `admin/${fileName}`;

                const { error: uploadError } = await window.supabaseClient.storage
                    .from('avatars')
                    .upload(filePath, file);

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

                uploadStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Avatar updated!';
                setTimeout(() => { uploadStatus.innerHTML = ""; }, 3000);
                
                loadProfile(); 

            } catch (err) {
                console.error("Avatar upload failed:", err);
                uploadStatus.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload failed.';
                uploadStatus.style.color = "var(--danger-color)";
                Swal.fire({ icon: 'error', title: 'Upload Failed', text: err.message });
            }
        });
    }

    // 8. MOBILE HAMBURGER MENU TOGGLE
    // ==========================================
    const hamburgerBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar-container');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn && sidebar && overlay) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = sidebar.classList.contains('active');
            if (isActive) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.remove('active');
            } else {
                sidebar.classList.add('active');
                overlay.classList.add('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.add('active');
            }
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        });
    }

    loadProfile();
});