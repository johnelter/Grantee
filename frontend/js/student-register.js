document.addEventListener('DOMContentLoaded', () => {

    // State Trackers
    let isIdVerified = false;
    let isEmailVerified = false;
    let studentData = null;

    // Elements
    const idInput = document.getElementById('reg_id');
    const btnVerifyId = document.getElementById('btn-verify-id');
    const idStatus = document.getElementById('id-status');
    const btnChangeId = document.getElementById('btn-change-id');

    const emailInput = document.getElementById('reg_email');
    const btnSendOtp = document.getElementById('btn-send-otp');
    const emailStatus = document.getElementById('email-status');
    const btnChangeEmail = document.getElementById('btn-change-email');

    const otpSection = document.getElementById('otp-section');
    const otpInput = document.getElementById('reg_otp');
    const btnConfirmOtp = document.getElementById('btn-confirm-otp');

    const passInput = document.getElementById('reg_pass');
    const passConfirmInput = document.getElementById('reg_pass_confirm');
    const btnRegister = document.getElementById('btn-register');

    // ==========================================
    // 0. PASSWORD VISIBILITY TOGGLE (EYE ICON)
    // ==========================================
    const togglePasswordIcons = document.querySelectorAll('.toggle-password');
    togglePasswordIcons.forEach(icon => {
        icon.addEventListener('click', function () {
            // Find the input field based on the data-target attribute
            const targetId = this.getAttribute('data-target');
            const inputField = targetId ? document.getElementById(targetId) : this.previousElementSibling;

            if (inputField && inputField.tagName === 'INPUT') {
                const iTag = this.querySelector('i');
                if (inputField.type === 'password') {
                    inputField.type = 'text';
                    if (iTag) {
                        iTag.classList.remove('fa-eye-slash');
                        iTag.classList.add('fa-eye');
                    }
                    this.title = "Hide Password";
                } else {
                    inputField.type = 'password';
                    if (iTag) {
                        iTag.classList.remove('fa-eye');
                        iTag.classList.add('fa-eye-slash');
                    }
                    this.title = "Show Password";
                }
            }
        });
    });

    // ==========================================
    // BACKEND COMMUNICATION HELPER
    // ==========================================
    async function fetchBackend(endpoint, body) {
        const isLocal = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.protocol === 'file:';
        
        const candidateUrls = isLocal
            ? [`http://localhost:3000${endpoint}`, `https://grantee-backend-n5f4.onrender.com${endpoint}`]
            : [`https://grantee-backend-n5f4.onrender.com${endpoint}`, `http://localhost:3000${endpoint}`];

        let lastErr = null;
        for (const url of candidateUrls) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                return res;
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error('Unable to connect to the verification server.');
    }

    // ==========================================
    // 1. VERIFY STUDENT ID
    // ==========================================
    btnVerifyId.addEventListener('click', async () => {
        const idVal = idInput.value.trim();
        if (!idVal) {
            idStatus.innerText = "Please enter an ID number.";
            idStatus.className = "status-msg msg-error";
            showCustomToast('warning', 'ID Required', 'Please enter your Student ID number.');
            return;
        }

        try {
            btnVerifyId.innerText = "Checking...";
            btnVerifyId.disabled = true;
            btnVerifyId.classList.add('disabled-style');

            const response = await fetchBackend('/api/verify-id', { id_number: idVal });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) throw new Error(data.error || 'Failed to verify ID number.');

            // Success! Populate data
            studentData = data;
            isIdVerified = true;

            idStatus.innerText = "✓ Student identity confirmed.";
            idStatus.className = "status-msg msg-success";
            idInput.disabled = true;
            btnVerifyId.style.display = 'none';
            if (btnChangeId) btnChangeId.style.display = 'inline-block';

            // Fill and show the autofill section
            document.getElementById('reg_first').value = studentData.first_name || '';
            document.getElementById('reg_last').value = studentData.last_name || '';
            document.getElementById('reg_middle').value = studentData.middle_name || '';
            document.getElementById('reg_program').value = studentData.program || '';
            document.getElementById('autofill-section').style.display = 'block';

            // Unlock Email step
            emailInput.disabled = false;
            btnSendOtp.disabled = false;
            btnSendOtp.classList.remove('disabled-style');

            showCustomToast('success', 'Identity Confirmed', 'Student record verified successfully.');

        } catch (error) {
            idStatus.innerText = "❌ " + error.message;
            idStatus.className = "status-msg msg-error";
            btnVerifyId.innerText = "Verify";
            btnVerifyId.disabled = false;
            btnVerifyId.classList.remove('disabled-style');
            showCustomToast('error', 'Verification Failed', error.message || 'Failed to verify ID number.');
        }
    });

    // ==========================================
    // 1.5 RESET / CHANGE STUDENT ID
    // ==========================================
    function resetIdVerification() {
        // Unlock ID input
        idInput.disabled = false;
        idInput.focus();
        idInput.select();

        // Restore Verify Button & hide Change ID link
        btnVerifyId.style.display = 'inline-flex';
        btnVerifyId.disabled = false;
        btnVerifyId.innerText = 'Verify';
        btnVerifyId.classList.remove('disabled-style');
        if (btnChangeId) btnChangeId.style.display = 'none';

        // Clear ID status & hide autofill details
        idStatus.innerText = '';
        idStatus.className = 'status-msg';
        const autofillSection = document.getElementById('autofill-section');
        if (autofillSection) autofillSection.style.display = 'none';
        document.getElementById('reg_first').value = '';
        document.getElementById('reg_last').value = '';
        document.getElementById('reg_middle').value = '';
        document.getElementById('reg_program').value = '';

        // Reset state tracker
        isIdVerified = false;
        studentData = null;

        // Reset & lock subsequent email steps
        resetEmailVerification();
        emailInput.disabled = true;
        emailInput.value = '';
        btnSendOtp.disabled = true;
        btnSendOtp.classList.add('disabled-style');
    }

    if (btnChangeId) {
        btnChangeId.addEventListener('click', (e) => {
            e.preventDefault();
            resetIdVerification();
        });
    }

    idInput.addEventListener('input', () => {
        if (isIdVerified) {
            resetIdVerification();
        }
    });

    // ==========================================
    // 2. SEND EMAIL OTP
    // ==========================================
    btnSendOtp.addEventListener('click', async () => {
        const emailVal = emailInput.value.trim();
        if (!emailVal || !emailVal.includes('@')) {
            emailStatus.innerText = "Please enter a valid email address.";
            emailStatus.className = "status-msg msg-error";
            showCustomToast('warning', 'Invalid Email', 'Please enter a valid email address.');
            return;
        }

        try {
            btnSendOtp.innerText = "Checking...";
            btnSendOtp.disabled = true;
            btnSendOtp.classList.add('disabled-style');
            emailInput.disabled = true; // Temporarily lock the input while waiting

            // 1. Direct Supabase RPC check if the function exists
            if (window.supabaseClient) {
                try {
                    const { data: isRegistered, error: rpcErr } = await window.supabaseClient
                        .rpc('check_email_registered', { check_email: emailVal });
                    if (!rpcErr && isRegistered === true) {
                        throw new Error("This email address is already in use by another user. Please use a different email.");
                    }
                } catch (rpcEx) {
                    if (rpcEx && rpcEx.message && rpcEx.message.includes('already in use')) {
                        throw rpcEx;
                    }
                }
            }

            btnSendOtp.innerText = "Sending...";

            const response = await fetchBackend('/api/send-otp', { email: emailVal });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send OTP');
            }

            emailStatus.innerText = "Code sent! Please check your email inbox.";
            emailStatus.className = "status-msg msg-success";

            // Show OTP Input and the "Change Email" button
            otpSection.style.display = 'block';
            if (btnChangeEmail) btnChangeEmail.style.display = 'inline-block';

            showCustomToast('info', 'Code Sent', 'Please check your email inbox for the 6-digit OTP code.');

        } catch (error) {
            emailStatus.innerText = "❌ " + (error.message || 'Error sending code.');
            emailStatus.className = "status-msg msg-error";
            btnSendOtp.innerText = "Verify";
            btnSendOtp.disabled = false;
            btnSendOtp.classList.remove('disabled-style');
            emailInput.disabled = false;
            showCustomToast('error', 'Error Sending Code', error.message || 'Error sending code.');
        }
    });

    // ==========================================
    // 2.5 RESET EMAIL (Change Email Button)
    // ==========================================
    function resetEmailVerification() {
        // Unlock the email input and reset the send button
        emailInput.disabled = false;
        emailInput.focus();
        emailInput.select();

        btnSendOtp.style.display = 'inline-flex';
        btnSendOtp.disabled = false;
        btnSendOtp.classList.remove('disabled-style');
        btnSendOtp.innerText = "Verify";

        // Hide the OTP section and the change button
        otpSection.style.display = 'none';
        if (btnChangeEmail) btnChangeEmail.style.display = 'none';

        // Clear the status text and old OTP inputs
        emailStatus.innerText = "";
        emailStatus.className = "status-msg";
        otpInput.value = "";

        // Reset state
        isEmailVerified = false;

        // Reset & lock password & registration submit
        passInput.disabled = true;
        passInput.value = '';
        passConfirmInput.disabled = true;
        passConfirmInput.value = '';
        btnRegister.disabled = true;
        btnRegister.classList.add('disabled-style');
    }

    if (btnChangeEmail) {
        btnChangeEmail.addEventListener('click', (e) => {
            e.preventDefault();
            resetEmailVerification();
        });
    }

    emailInput.addEventListener('input', () => {
        if (isEmailVerified) {
            resetEmailVerification();
        }
    });

    // ==========================================
    // 3. CONFIRM OTP
    // ==========================================
    btnConfirmOtp.addEventListener('click', async () => {
        const code = otpInput.value.trim();
        const emailVal = emailInput.value.trim();

        if (!code) {
            showCustomToast('warning', 'OTP Required', 'Please enter the 6-digit verification code sent to your email.');
            return;
        }

        try {
            btnConfirmOtp.innerText = 'Verifying...';
            btnConfirmOtp.disabled = true;

            const response = await fetchBackend('/api/verify-otp', { email: emailVal, code: code });

            const data = await response.json().catch(() => ({}));
            btnConfirmOtp.innerText = 'Confirm';
            btnConfirmOtp.disabled = false;

            if (!response.ok) throw new Error(data.error || 'Invalid or expired verification code.');

            // Success!
            isEmailVerified = true;
            otpSection.style.display = 'none';
            btnSendOtp.style.display = 'none';
            if (btnChangeEmail) btnChangeEmail.style.display = 'inline-block';

            emailStatus.innerText = "✓ Email verified securely.";
            emailStatus.className = "status-msg msg-success";
            emailInput.disabled = true;

            // Unlock Password & Register button
            passInput.disabled = false;
            passConfirmInput.disabled = false;
            btnRegister.disabled = false;
            btnRegister.classList.remove('disabled-style');

            showCustomToast('success', 'Email Verified', 'Your email address has been verified successfully.');

        } catch (error) {
            btnConfirmOtp.innerText = 'Confirm';
            btnConfirmOtp.disabled = false;
            showCustomToast('error', 'Verification Failed', error.message || 'Invalid or expired verification code.');
        }
    });

    // ==========================================
    // 4. FINAL REGISTRATION
    // ==========================================
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!isIdVerified || !isEmailVerified) return;

        const pass = passInput.value;
        const confirmPass = passConfirmInput.value;

        if (pass !== confirmPass) {
            showCustomToast('warning', 'Passwords Mismatch', 'The passwords you entered do not match. Please try again.');
            return;
        }

        // 🛑 NEW LOGIC: Strong Password Validation
        // Requires: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
        if (!strongPasswordRegex.test(pass)) {
            showCustomToast('warning', 'Weak Password', 'Password must be at least 8 characters long and contain an uppercase, lowercase, number, and special character.');
            return;
        }

        try {
            btnRegister.innerText = "Creating Account...";
            btnRegister.disabled = true;
            btnRegister.classList.add('disabled-style');

            // Pull the school_id securely from the verified Masterlist Data
            const assignedSchoolId = studentData.school_id;

            if (!assignedSchoolId) {
                throw new Error("Your masterlist record is missing an assigned school. Please contact your coordinator.");
            }

            // 1. Create the user in Supabase Auth, passing the secure masterlist school_id
            const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
                email: emailInput.value.trim(),
                password: pass,
                options: {
                    data: {
                        school_id: assignedSchoolId
                    }
                }
            });

            if (authError) throw authError;

            // --- SECURITY CHECK (Ghost User Fix) ---
            if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
                throw new Error("An account with this email address already exists.");
            }

            // 2. UPDATE the profile data (The database trigger already INSERTED the row!)
            const { error: profileError } = await window.supabaseClient
                .from('profiles')
                .update({
                    role: 'student',
                    id_number: studentData.id_number,
                    first_name: studentData.first_name,
                    middle_name: studentData.middle_name,
                    last_name: studentData.last_name,
                    date_of_birth: studentData.date_of_birth || null,
                    program: studentData.program,
                    year_level: studentData.year_level, // Synced from Masterlist update
                    gender: studentData.gender,         // Synced from Masterlist update
                    school_id: assignedSchoolId,        // Syncing with enrolled_masterlist
                    email: emailInput.value.trim(),
                    is_approved: true // Auto-approved because they passed masterlist verification
                })
                .eq('id', authData.user.id);

            if (profileError) throw profileError;

            showCustomToast('success', 'Registration Successful', 'Your account has been created successfully!');

            Swal.fire({
                title: 'Success!',
                text: 'Registration Successful! You can now log in.',
                icon: 'success',
                confirmButtonText: 'Login Now',
                confirmButtonColor: '#10b981'
            }).then(() => {
                window.location.href = "login.html";
            });

        } catch (error) {
            console.error(error);
            showCustomToast('error', 'Registration Failed', error.message);
            btnRegister.innerText = "Complete Registration";
            btnRegister.disabled = false;
            btnRegister.classList.remove('disabled-style');
        }
    });
});

// ==========================================
// CUSTOM UI TOAST SYSTEM (TOP CENTER - EXACT MATCH)
// ==========================================
function showCustomToast(type = 'info', title = '', message = '', duration = 4000) {
    return new Promise((resolve) => {
        // If only 2 arguments are provided (type, message)
        if (arguments.length === 2) {
            message = title;
            title = '';
        }

        let container = document.getElementById('custom-toast-container');
        if (!container) {
            container = document.querySelector('.toast-container');
        }
        if (!container) {
            container = document.createElement('div');
            container.id = 'custom-toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        type = (type || 'info').toLowerCase();
        if (!['success', 'error', 'info', 'warning'].includes(type)) {
            type = 'info';
        }

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            if (!title) title = 'Success';
        } else if (type === 'error') {
            iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            if (!title) title = 'Error';
        } else if (type === 'info') {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            if (!title) title = 'Info';
        } else if (type === 'warning') {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            if (!title) title = 'Warning';
        }

        const toast = document.createElement('div');
        toast.className = `custom-ui-toast toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-left-bar"></div>
            <div class="toast-icon-wrapper toast-icon">
                ${iconSvg}
            </div>
            <div class="toast-details toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message || ''}</div>
            </div>
            <button type="button" class="toast-close-btn toast-close" aria-label="Close notification">&times;</button>
        `;

        container.appendChild(toast);

        // Trigger entrance animation smoothly
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('toast-show');
                toast.classList.add('active');
            });
        });

        let isDismissed = false;
        const dismissToast = () => {
            if (isDismissed) return;
            isDismissed = true;
            toast.classList.remove('toast-show', 'active');
            toast.classList.add('toast-hide', 'exit');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                resolve();
            }, 300);
        };

        const closeBtn = toast.querySelector('.toast-close-btn') || toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissToast();
            });
        }

        let autoDismissTimer = setTimeout(dismissToast, duration);

        toast.addEventListener('mouseenter', () => clearTimeout(autoDismissTimer));
        toast.addEventListener('mouseleave', () => {
            if (!isDismissed) {
                autoDismissTimer = setTimeout(dismissToast, 1800);
            }
        });
    });
}

// Global aliases for convenience
window.showCustomToast = showCustomToast;
window.showUIToast = showCustomToast;
window.showToast = showCustomToast;