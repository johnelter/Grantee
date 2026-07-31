const supabaseUrl = 'https://hcclmoretabvymrgukdl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2xtb3JldGFidnltcmd1a2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTMxNTAsImV4cCI6MjA5NTA4OTE1MH0.jY_9BXEsmN7_-UMYHDOdp2MetismTVGbT2-33PVVEy8';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// --- 0. SECURE SESSION HANDLING ---
// This listens for token expirations or remote sign-outs and secures the app
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        // Clear any sensitive local storage data
        localStorage.removeItem('granteeSelectedSchoolId');
        localStorage.removeItem('granteeSelectedSchool');
        
        // Force redirect to login if they are on a protected dashboard
        const publicPages = ['login.html', 'index.html', 'student-register.html', 'reset-password.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (!publicPages.includes(currentPage) && currentPage !== '') {
            window.location.replace('login.html');
        }
    }
});

// --- INJECT 2FA MODAL UI ---
const injectMfaUI = () => {
    if (document.getElementById('mfa-modal-overlay')) return;
    const mfaHTML = `
        <style>
            .mfa-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 10000; opacity: 0; visibility: hidden; transition: 0.2s ease; }
            .mfa-modal-overlay.show { opacity: 1; visibility: visible; }
            .mfa-modal-box { background: #fff; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
            .mfa-title { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
            .mfa-desc { font-size: 14px; color: #64748b; margin-bottom: 20px; line-height: 1.5; }
            .mfa-input { width: 100%; padding: 12px; font-size: 24px; text-align: center; letter-spacing: 8px; border: 2px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; outline: none; transition: 0.2s; font-family: monospace; }
            .mfa-input:focus { border-color: #3b82f6; }
            .mfa-btn { width: 100%; padding: 12px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer; transition: 0.2s; }
            .mfa-btn:hover { background: #2563eb; }
            .mfa-btn:disabled { background: #94a3b8; cursor: not-allowed; }
            .mfa-cancel { margin-top: 15px; display: block; font-size: 13px; color: #64748b; cursor: pointer; text-decoration: none; }
            .mfa-cancel:hover { color: #ef4444; }
        </style>
        <div id="mfa-modal-overlay" class="mfa-modal-overlay">
            <div class="mfa-modal-box">
                <div class="mfa-title">Two-Factor Authentication</div>
                <div class="mfa-desc">Enter the 6-digit code from your authenticator app to continue.</div>
                <input type="text" id="mfa-code-input" class="mfa-input" maxlength="6" placeholder="000000" autocomplete="off">
                <button id="mfa-verify-btn" class="mfa-btn">Verify Code</button>
                <a class="mfa-cancel" id="mfa-cancel-btn">Cancel Login</a>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', mfaHTML);
};
document.addEventListener('DOMContentLoaded', injectMfaUI);

// --- STRONG PASSWORD VALIDATOR ---
const validatePasswordStrength = (password) => {
    if (password.length < 8) return "Password must be at least 8 characters long.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one special character.";
    return null; // Valid password
};

// --- 1. STUDENT REGISTRATION HANDLER ---
const studentRegisterForm = document.getElementById('student-register-form');
if (studentRegisterForm) {
    studentRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const firstName = document.getElementById('firstName').value.trim();
        const middleName = document.getElementById('middleName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const studentId = document.getElementById('studentId').value.trim();
        const course = document.getElementById('course').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            alert("Passwords do not match!");
            return;
        }

        // Apply Strong Password Rules
        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
            alert(passwordError);
            return;
        }

        try {
            const selectedSchoolId = localStorage.getItem('granteeSelectedSchoolId');
            if (!selectedSchoolId) {
                alert("School association missing. Please return to the home page and select a school.");
                window.location.href = 'index.html';
                return;
            }

            const response = await fetch('https://grantee-backend-n5f4.onrender.com/api/validate-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, middleName, lastName, studentId })
            });

            const validationData = await response.json();
            if (!response.ok) throw new Error(validationData.error);

            const { data, error: authError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        role: 'student',
                        first_name: firstName,
                        middle_name: middleName,
                        last_name: lastName,
                        id_number: studentId,
                        course: course,
                        school_id: selectedSchoolId 
                    }
                }
            });
            
            if (authError) throw authError;

            alert(`Registration successful! We have sent a verification link to ${email}. You must click the link in your email before you can log in.`);
            window.location.href = 'login.html';
        } catch (error) {
            alert(error.message);
        }
    });
}

// --- 2. GLOBAL LOGIN DRIVER MATRIX WITH 2FA ---
const finalizeLoginProcess = async (userId, submitBtn, originalBtnText) => {
    try {
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('role, is_approved')
            .eq('id', userId)
            .single();
            
        if (profileError) throw profileError;

        // Block entry if a STUDENT account is flagged as not approved (Admins bypass this)
        if (profile.role !== 'admin' && profile.is_approved === false) {
            Swal.fire({
                title: 'Pending Approval',
                text: 'Your account access is currently set to pending. Please wait for an administrator to approve your account.',
                icon: 'info',
                confirmButtonColor: '#10b981'
            });
            await supabaseClient.auth.signOut();
            if(submitBtn) {
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            }
            return;
        }

        const targetDashboard = (profile.role === 'admin') ? 'admin-dashboard.html' : 'student-dashboard.html';

        if(submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in...';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.8';
        }

        // Add a tiny delay just to show the beautiful signing in state before the browser navigates away
        setTimeout(() => {
            window.location.href = targetDashboard;
        }, 500);

    } catch (error) {
        Swal.fire({
            title: 'Error',
            text: 'Failed to route user profile: ' + error.message,
            icon: 'error',
            confirmButtonColor: '#10b981'
        });
        if(submitBtn) {
            submitBtn.innerText = originalBtnText;
            submitBtn.disabled = false;
        }
    }
};

const handleLoginSubmit = async (emailId, passwordId) => {
    const email = document.getElementById(emailId).value.trim();
    const password = document.getElementById(passwordId).value;

    const submitBtn = document.querySelector(`#${emailId}`).closest('form').querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerText;
    submitBtn.innerText = "Authenticating...";
    submitBtn.disabled = true;

    try {
        // Step 1: Standard Password Authentication
        const { data, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
        
        if (loginError) {
            if (loginError.message === 'Email not confirmed') {
                throw new Error("You must verify your email address before logging in. Please check your inbox for the verification link.");
            }
            throw loginError;
        }

        // Step 2: Check MFA (2FA) Status
        const { data: mfaData, error: mfaError } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
        if (mfaError) throw mfaError;

        // If user is enrolled in 2FA (aal2 required) but currently only validated via password (aal1)
        if (mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
            
            // Get user's active TOTP factor
            const { data: factorsData, error: factorsError } = await supabaseClient.auth.mfa.listFactors();
            if (factorsError) throw factorsError;
            
            const totpFactor = factorsData.totp[0];
            if (!totpFactor) throw new Error("2FA is required but no authenticator app is configured.");

            // Create Challenge
            const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId: totpFactor.id });
            if (challengeError) throw challengeError;

            // Show Custom UI Modal to enter the 6-digit code
            const modal = document.getElementById('mfa-modal-overlay');
            const verifyBtn = document.getElementById('mfa-verify-btn');
            const codeInput = document.getElementById('mfa-code-input');
            const cancelBtn = document.getElementById('mfa-cancel-btn');
            
            modal.classList.add('show');
            codeInput.value = '';
            codeInput.focus();

            // Handle Verification
            verifyBtn.onclick = async () => {
                const code = codeInput.value.trim();
                if (code.length !== 6) {
                    alert("Please enter a valid 6-digit code.");
                    return;
                }
                
                verifyBtn.innerText = "Verifying...";
                verifyBtn.disabled = true;

                const { data: verifyData, error: verifyError } = await supabaseClient.auth.mfa.verify({
                    factorId: totpFactor.id,
                    challengeId: challengeData.id,
                    code: code
                });

                if (verifyError) {
                    alert("Invalid 2FA Code. Please try again.");
                    verifyBtn.innerText = "Verify Code";
                    verifyBtn.disabled = false;
                    codeInput.value = '';
                    codeInput.focus();
                } else {
                    // Success! Hide modal and finish routing
                    modal.classList.remove('show');
                    await finalizeLoginProcess(data.user.id, submitBtn, originalBtnText);
                }
            };

            // Handle Cancelation
            cancelBtn.onclick = async () => {
                modal.classList.remove('show');
                await supabaseClient.auth.signOut();
                submitBtn.innerText = originalBtnText;
                submitBtn.disabled = false;
            };

        } else {
            // No 2FA required for this user, proceed normally
            await finalizeLoginProcess(data.user.id, submitBtn, originalBtnText);
        }

    } catch (error) {
        Swal.fire({
            title: 'Authentication Failed',
            text: error.message,
            icon: 'error',
            confirmButtonColor: '#10b981'
        });
        submitBtn.innerText = originalBtnText;
        submitBtn.disabled = false;
    }
};

const studentLoginForm = document.getElementById('student-login-form');
if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', (e) => { e.preventDefault(); handleLoginSubmit('loginEmail', 'loginPassword'); });
}

const adminLoginForm = document.getElementById('admin-login-form') || document.getElementById('staff-login-form');
if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => { 
        e.preventDefault(); 
        const emailInputId = document.getElementById('adminLoginEmail') ? 'adminLoginEmail' : 'staffLoginEmail';
        const passInputId = document.getElementById('adminLoginPassword') ? 'adminLoginPassword' : 'staffLoginPassword';
        handleLoginSubmit(emailInputId, passInputId); 
    });
}

// --- 3. GOOGLE OAUTH SIGN-IN LOGIC ---
const handleGoogleSignIn = async () => {
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/frontend/login.html'
            }
        });
        if (error) throw error;
    } catch (error) {
        alert('Google Sign-In failed: ' + error.message);
    }
};

const googleBtns = document.querySelectorAll('.btn-google-oauth');
googleBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleGoogleSignIn();
    });
});

// --- 4. FORGOT PASSWORD LOGIC (SWEETALERT) ---
document.addEventListener('DOMContentLoaded', () => {
    const forgotPasswordLinks = document.querySelectorAll('a[href="#"], .forgot-password-link');

    forgotPasswordLinks.forEach(link => {
        if (link.innerText.toLowerCase().includes('forgot password')) {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                
                const { value: email } = await Swal.fire({
                    title: 'Reset Password',
                    input: 'email',
                    inputLabel: 'Enter your registered email address',
                    inputPlaceholder: 'name@example.com',
                    showCancelButton: true,
                    confirmButtonText: 'Send Link',
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#cbd5e1'
                });
                
                if (email) {
                    try {
                        const client = typeof window.supabaseClient !== 'undefined' ? window.supabaseClient : supabaseClient;
                        if (!client) throw new Error("Supabase connection not found.");
                        
                        Swal.fire({
                            title: 'Sending...',
                            allowOutsideClick: false,
                            didOpen: () => { Swal.showLoading(); }
                        });

                        let basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
                        const { error } = await client.auth.resetPasswordForEmail(email, {
                            redirectTo: window.location.origin + basePath + 'reset-password.html' 
                        });

                        if (error) throw error;

                        Swal.fire({
                            title: 'Sent!',
                            text: `Password reset instructions have been sent to ${email}. Please check your inbox (and spam folder).`,
                            icon: 'success',
                            confirmButtonColor: '#10b981'
                        });

                    } catch (error) {
                        Swal.fire({
                            title: 'Error',
                            text: `Error sending password reset: ${error.message}`,
                            icon: 'error',
                            confirmButtonColor: '#10b981'
                        });
                    }
                }
            });
        }
    });
});

// --- 5. PASSWORD VISIBILITY TOGGLE ---
document.addEventListener('DOMContentLoaded', () => {
    const togglePassword = document.getElementById('toggleLoginPassword');
    const passwordInput = document.getElementById('loginPassword');

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            const icon = togglePassword.querySelector('i');
            if (type === 'text') {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            } else {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        });
    }
});