document.addEventListener('DOMContentLoaded', () => {

    // State Trackers
    let isIdVerified = false;
    let isEmailVerified = false;
    let studentData = null;

    // Elements
    const idInput = document.getElementById('reg_id');
    const btnVerifyId = document.getElementById('btn-verify-id');
    const idStatus = document.getElementById('id-status');

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
        icon.addEventListener('click', function() {
            // Find the input field based on the data-target attribute
            const targetId = this.getAttribute('data-target');
            const inputField = targetId ? document.getElementById(targetId) : this.previousElementSibling;

            if (inputField && inputField.tagName === 'INPUT') {
                if (inputField.type === 'password') {
                    inputField.type = 'text';
                    this.style.opacity = '0.5'; // Visual feedback that it's active
                    this.title = "Hide Password";
                } else {
                    inputField.type = 'password';
                    this.style.opacity = '1';
                    this.title = "Show Password";
                }
            }
        });
    });

    // ==========================================
    // 1. VERIFY STUDENT ID
    // ==========================================
    btnVerifyId.addEventListener('click', async () => {
        const idVal = idInput.value.trim();
        if (!idVal) {
            idStatus.innerText = "Please enter an ID number.";
            idStatus.className = "status-msg msg-error";
            return;
        }

        try {
            btnVerifyId.innerText = "Checking...";
            btnVerifyId.disabled = true;
            btnVerifyId.classList.add('disabled-style');

            const response = await fetch('http://localhost:3000/api/verify-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_number: idVal })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            // Success! Populate data
            studentData = data;
            isIdVerified = true;

            idStatus.innerText = "✓ Student identity confirmed.";
            idStatus.className = "status-msg msg-success";
            idInput.disabled = true;
            btnVerifyId.style.display = 'none';

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

        } catch (error) {
            idStatus.innerText = "❌ " + error.message;
            idStatus.className = "status-msg msg-error";
            btnVerifyId.innerText = "Verify";
            btnVerifyId.disabled = false;
            btnVerifyId.classList.remove('disabled-style');
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
            return;
        }

        try {
            btnSendOtp.innerText = "Sending...";
            btnSendOtp.disabled = true;
            btnSendOtp.classList.add('disabled-style');
            emailInput.disabled = true; // Temporarily lock the input while waiting

            const response = await fetch('http://localhost:3000/api/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailVal })
            });

            if (!response.ok) throw new Error('Failed to send OTP');

            emailStatus.innerText = "Code sent! Please check your inbox (or terminal).";
            emailStatus.className = "status-msg msg-success";
            
            // Show OTP Input and the "Change Email" button
            otpSection.style.display = 'block';
            if (btnChangeEmail) btnChangeEmail.style.display = 'inline-block';

        } catch (error) {
            emailStatus.innerText = "❌ Error sending code.";
            emailStatus.className = "status-msg msg-error";
            btnSendOtp.innerText = "Verify";
            btnSendOtp.disabled = false;
            btnSendOtp.classList.remove('disabled-style');
            emailInput.disabled = false;
        }
    });

    // ==========================================
    // 2.5 RESET EMAIL (Change Email Button)
    // ==========================================
    if (btnChangeEmail) {
        btnChangeEmail.addEventListener('click', (e) => {
            e.preventDefault(); 
            
            // Unlock the email input and reset the send button
            emailInput.disabled = false;
            btnSendOtp.disabled = false;
            btnSendOtp.classList.remove('disabled-style');
            btnSendOtp.innerText = "Verify";
            
            // Hide the OTP section and the change button
            otpSection.style.display = 'none';
            btnChangeEmail.style.display = 'none';
            
            // Clear the status text and old OTP inputs
            emailStatus.innerText = "";
            otpInput.value = ""; 
        });
    }

    // ==========================================
    // 3. CONFIRM OTP
    // ==========================================
    btnConfirmOtp.addEventListener('click', async () => {
        const code = otpInput.value.trim();
        const emailVal = emailInput.value.trim();

        try {
            const response = await fetch('http://localhost:3000/api/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailVal, code: code })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            // Success!
            isEmailVerified = true;
            otpSection.style.display = 'none';
            btnSendOtp.style.display = 'none';
            if (btnChangeEmail) btnChangeEmail.style.display = 'none'; 
            
            emailStatus.innerText = "✓ Email verified securely.";
            emailStatus.className = "status-msg msg-success";
            emailInput.disabled = true; 

            // Unlock Password & Register button
            passInput.disabled = false;
            passConfirmInput.disabled = false;
            btnRegister.disabled = false;
            btnRegister.classList.remove('disabled-style');

        } catch (error) {
            alert(error.message);
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
            alert("Passwords do not match!");
            return;
        }

        // 🛑 NEW LOGIC: Strong Password Validation
        // Requires: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
        if (!strongPasswordRegex.test(pass)) {
            alert("Security Requirement: Password must be at least 8 characters long and contain:\n\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (e.g., !@#$%^&*)");
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
                    program: studentData.program,
                    year_level: studentData.year_level, // Synced from Masterlist update
                    gender: studentData.gender,         // Synced from Masterlist update
                    email: emailInput.value.trim(),
                    is_approved: true // Auto-approved because they passed masterlist verification
                })
                .eq('id', authData.user.id);

            if (profileError) throw profileError;

            alert("Registration Successful! You can now log in.");
            window.location.href = "login.html";

        } catch (error) {
            console.error(error);
            alert("Registration failed: " + error.message);
            btnRegister.innerText = "Complete Registration";
            btnRegister.disabled = false;
            btnRegister.classList.remove('disabled-style');
        }
    });
});