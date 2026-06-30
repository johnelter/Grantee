document.addEventListener('DOMContentLoaded', async () => {

    // Forms and Buttons
    const personalForm = document.getElementById('personal-info-form');
    const academicForm = document.getElementById('academic-info-form');
    const passwordForm = document.getElementById('password-form');
    
    // Header Elements
    const headerName = document.getElementById('header-name');
    const headerAvatarImg = document.getElementById('header-avatar');
    const profileAvatarImg = document.getElementById('profile-avatar');

    // Modal Elements
    const saveConfirmModal = document.getElementById('save-confirm-modal');
    const saveProceedBtn = document.getElementById('save-proceed-btn');
    const saveCancelBtn = document.getElementById('save-cancel-btn');
    const successModal = document.getElementById('success-modal');
    const successCloseBtn = document.getElementById('success-close-btn');

    // 2FA Elements
    const start2faBtn = document.getElementById('start-2fa-btn');
    const setup2faSection = document.getElementById('setup-2fa-section');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const verify2faInput = document.getElementById('verify-2fa-input');
    const confirm2faBtn = document.getElementById('confirm-2fa-btn');
    let factorId = null; // Used during 2FA setup
    let activeFactorId = null; // Used for 2FA teardown

    // State variable to track which form is currently being saved
    let activeSaveForm = null;

    // Check if user is logged in
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // ==========================================
    // 1. FETCH AND DISPLAY DATA
    // ==========================================
    async function loadProfileData() {
        try {
            // STEP 1: Fetch User Profile Data
            const { data: profile, error } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;

            // STEP 2: Fetch School strictly from the Masterlist (Single Source of Truth)
            let schoolName = 'Unassigned School';
            if (profile.id_number) {
                const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id, schools(name)')
                    .eq('id_number', profile.id_number)
                    .single();

                if (!masterlistError && masterlistData && masterlistData.schools) {
                    schoolName = masterlistData.schools.name;
                }
            }

            // --- Update Header & Avatar ---
            if (profile) {
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                
                if(document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.program || profile.course || 'Student';
                if(profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            }

            // --- Locked Personal Information ---
            if(document.getElementById('first_name')) document.getElementById('first_name').value = profile.first_name || '';
            if(document.getElementById('middle_name')) document.getElementById('middle_name').value = profile.middle_name || '';
            if(document.getElementById('last_name')) document.getElementById('last_name').value = profile.last_name || '';
            if(document.getElementById('email')) document.getElementById('email').value = profile.email || '';
            if(document.getElementById('student_id')) document.getElementById('student_id').value = profile.id_number || '';
            
            // Format Registration Date
            if (profile.created_at && document.getElementById('reg_date')) {
                const regDate = new Date(profile.created_at);
                document.getElementById('reg_date').value = regDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }

            // --- Locked Academic Information ---
            if(document.getElementById('school')) document.getElementById('school').value = schoolName; 
            if(document.getElementById('program')) document.getElementById('program').value = profile.program || profile.course || ''; 

            // --- Editable Fields (Personal) ---
            if(document.getElementById('suffix')) document.getElementById('suffix').value = profile.suffix || '';
            if(document.getElementById('gender')) document.getElementById('gender').value = profile.gender || '';
            if(document.getElementById('dob')) document.getElementById('dob').value = profile.date_of_birth || '';
            if(document.getElementById('contact_number')) document.getElementById('contact_number').value = profile.contact_number || '';

            // --- Editable Fields (Academic) ---
            if(document.getElementById('year_level')) document.getElementById('year_level').value = profile.year_level || '';
            if(document.getElementById('gwa')) document.getElementById('gwa').value = profile.gwa || '';

            // --- CHECK 2FA STATUS (With Turn Off Logic) ---
            const { data: mfaData, error: mfaError } = await window.supabaseClient.auth.mfa.listFactors();
            if (!mfaError && mfaData && mfaData.totp && mfaData.totp.length > 0) {
                
                // Check if any of the factors are actually verified and active
                const activeFactor = mfaData.totp.find(f => f.status === 'verified');
                
                if (activeFactor) {
                    activeFactorId = activeFactor.id;
                    if(start2faBtn && setup2faSection) {
                        start2faBtn.style.display = 'none';
                        setup2faSection.style.display = 'block';
                        setup2faSection.style.borderTop = 'none';
                        
                        // Inject the Active status and the Turn Off Button
                        setup2faSection.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:#ecfdf5; padding:15px; border-radius:8px; border:1px solid #10b981;">
                                <p style="color: #065f46; font-weight: 600; margin: 0; font-size:14px;">✅ Two-Factor Authentication is Active.</p>
                                <button type="button" id="disable-2fa-btn" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">Turn Off 2FA</button>
                            </div>
                        `;

                        // Add event listener to the newly created Turn Off button
                        document.getElementById('disable-2fa-btn').addEventListener('click', async () => {
                            const isConfirmed = confirm("Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.");
                            if (isConfirmed) {
                                try {
                                    const btn = document.getElementById('disable-2fa-btn');
                                    btn.innerText = "Disabling...";
                                    btn.disabled = true;

                                    const { error: unenrollError } = await window.supabaseClient.auth.mfa.unenroll({ factorId: activeFactorId });
                                    if (unenrollError) throw unenrollError;
                                    
                                    alert("2FA has been successfully disabled.");
                                    window.location.reload(); // Refresh the page to reset the UI
                                } catch (err) {
                                    alert("Failed to disable 2FA: " + err.message);
                                    document.getElementById('disable-2fa-btn').innerText = "Turn Off 2FA";
                                    document.getElementById('disable-2fa-btn').disabled = false;
                                }
                            }
                        });
                    }
                }
            }

        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }

    // ==========================================
    // 2. MODAL LOGIC FOR SAVING PROFILE
    // ==========================================

    if(personalForm) {
        personalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            activeSaveForm = 'personal';
            saveConfirmModal.style.display = 'flex';
        });
    }

    if(academicForm) {
        academicForm.addEventListener('submit', (e) => {
            e.preventDefault();
            activeSaveForm = 'academic';
            saveConfirmModal.style.display = 'flex';
        });
    }

    if (saveCancelBtn) {
        saveCancelBtn.addEventListener('click', () => {
            saveConfirmModal.style.display = 'none';
            activeSaveForm = null;
        });
    }

    if (successCloseBtn) {
        successCloseBtn.addEventListener('click', () => {
            successModal.style.display = 'none';
        });
    }

    if (saveProceedBtn) {
        saveProceedBtn.addEventListener('click', async () => {
            saveProceedBtn.innerText = "Saving...";
            saveProceedBtn.disabled = true;

            try {
                if (activeSaveForm === 'personal') {
                    const updates = {
                        suffix: document.getElementById('suffix') ? document.getElementById('suffix').value.trim() : null,
                        gender: document.getElementById('gender') ? document.getElementById('gender').value : null,
                        date_of_birth: document.getElementById('dob') ? document.getElementById('dob').value || null : null,
                        contact_number: document.getElementById('contact_number') ? document.getElementById('contact_number').value.trim() || null : null,
                        updated_at: new Date()
                    };
                    const { error } = await window.supabaseClient.from('profiles').update(updates).eq('id', userId);
                    if (error) throw error;
                } 
                else if (activeSaveForm === 'academic') {
                    const updates = {
                        year_level: document.getElementById('year_level') ? document.getElementById('year_level').value : null,
                        gwa: document.getElementById('gwa') ? document.getElementById('gwa').value || null : null,
                        updated_at: new Date()
                    };
                    const { error } = await window.supabaseClient.from('profiles').update(updates).eq('id', userId);
                    if (error) throw error;
                }

                // Hide confirm modal, show success modal
                saveConfirmModal.style.display = 'none';
                document.getElementById('success-title').innerText = "Success!";
                document.getElementById('success-message').innerText = "Your profile settings have been successfully updated.";
                successModal.style.display = 'flex';

            } catch (error) {
                console.error("Error updating info:", error);
                alert("Failed to save updates.");
                saveConfirmModal.style.display = 'none';
            } finally {
                saveProceedBtn.innerText = "Yes, Save";
                saveProceedBtn.disabled = false;
                activeSaveForm = null;
            }
        });
    }

    // ==========================================
    // 3. SECURITY SETTINGS (Update Password)
    // ==========================================
    if(passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword !== confirmPassword) {
                alert("New passwords do not match. Please try again.");
                return;
            }

            if (currentPassword === newPassword) {
                alert("New password cannot be the same as your current password.");
                return;
            }

            // Strong password regex requirement
            const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
            if (!strongPasswordRegex.test(newPassword)) {
                alert("Security Requirement: Password must be at least 8 characters long and contain:\n\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (e.g., !@#$%^&*)");
                return;
            }

            const btn = document.getElementById('btn-save-password');
            btn.innerText = "Verifying...";
            btn.disabled = true;

            try {
                // STEP 1: Verify Current Password via a silent re-login
                const { error: signInError } = await window.supabaseClient.auth.signInWithPassword({
                    email: userEmail,
                    password: currentPassword
                });

                if (signInError) {
                    throw new Error("Incorrect current password. Please try again.");
                }

                // STEP 2: Update to New Password
                btn.innerText = "Updating...";
                const { error: updateError } = await window.supabaseClient.auth.updateUser({
                    password: newPassword
                });

                if (updateError) throw updateError;

                // Show Success Modal, then log them out to re-authenticate
                document.getElementById('success-title').innerText = "Password Updated";
                document.getElementById('success-message').innerText = "Your password has been changed securely. You will now be logged out.";
                successModal.style.display = 'flex';
                
                setTimeout(async () => {
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                }, 3000);

            } catch (err) {
                console.error("Password change error:", err);
                alert(err.message);
            } finally {
                btn.innerText = "Update Password";
                btn.disabled = false;
                passwordForm.reset();
            }
        });
    }

    // ==========================================
    // 4. TWO-FACTOR AUTHENTICATION (2FA) SETUP
    // ==========================================
    if (start2faBtn) {
        start2faBtn.addEventListener('click', async () => {
            start2faBtn.innerText = "Generating QR Code...";
            start2faBtn.disabled = true;

            try {
                // 1. CLEANUP: Find and remove any stuck 'unverified' factors
                const { data: existingFactors } = await window.supabaseClient.auth.mfa.listFactors();
                if (existingFactors && existingFactors.totp) {
                    for (const factor of existingFactors.totp) {
                        if (factor.status === 'unverified') {
                            await window.supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
                        }
                    }
                }

                // 2. ENROLL: Create a new factor with a proper name
                const { data, error } = await window.supabaseClient.auth.mfa.enroll({
                    factorType: 'totp',
                    friendlyName: 'Grantee Student App' 
                });

                if (error) throw error;

                factorId = data.id;

                // Inject the generated QR Code (SVG)
                qrCodeContainer.innerHTML = data.totp.qr_code;
                
                // Add the manual secret key fallback just in case their camera fails
                qrCodeContainer.innerHTML += `
                    <p style="font-size: 12px; color: #64748b; margin-top: 15px; line-height: 1.4;">
                        Can't scan the QR code? Enter this secret key manually into your app:<br>
                        <strong style="color: #0f172a; font-family: monospace; font-size: 16px; letter-spacing: 2px; word-break: break-all; display: inline-block; margin-top: 5px; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">
                            ${data.totp.secret}
                        </strong>
                    </p>
                `;
                
                // Show the verify input section, hide the start button
                setup2faSection.style.display = 'block';
                start2faBtn.style.display = 'none';

            } catch (error) {
                alert("Error starting 2FA setup: " + error.message);
                start2faBtn.innerText = "Set Up 2FA";
                start2faBtn.disabled = false;
            }
        });
    }

    if (confirm2faBtn) {
        confirm2faBtn.addEventListener('click', async () => {
            const code = verify2faInput.value.trim();
            
            if (code.length !== 6) {
                alert("Please enter a valid 6-digit code.");
                return;
            }

            confirm2faBtn.innerText = "Verifying...";
            confirm2faBtn.disabled = true;

            try {
                // Create a challenge for the factor
                const { data: challenge, error: challengeError } = await window.supabaseClient.auth.mfa.challenge({ factorId });
                if (challengeError) throw challengeError;

                // Verify the code
                const { data: verifyData, error: verifyError } = await window.supabaseClient.auth.mfa.verify({
                    factorId,
                    challengeId: challenge.id,
                    code: code
                });

                if (verifyError) throw verifyError;

                // Success
                alert("2FA has been successfully enabled! You will be asked for a code next time you log in.");
                window.location.reload(); // Refresh to lock in the "Turn Off" UI

            } catch (error) {
                alert("Invalid code. Please try again. " + error.message);
                confirm2faBtn.innerText = "Confirm";
                confirm2faBtn.disabled = false;
                verify2faInput.value = '';
                verify2faInput.focus();
            }
        });
    }

    // ==========================================
    // 5. PROFILE PHOTO PREVIEW & UPLOAD
    // ==========================================
    const btnChangePhoto = document.getElementById('change-photo-btn');
    const avatarUploadInput = document.getElementById('avatar-upload');

    if(btnChangePhoto && avatarUploadInput) {
        btnChangePhoto.addEventListener('click', () => {
            avatarUploadInput.click();
        });

        avatarUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                btnChangePhoto.innerText = "Uploading...";
                btnChangePhoto.disabled = true;

                const fileExt = file.name.split('.').pop();
                const filePath = `${userId}.${fileExt}`;

                const { error: uploadError } = await window.supabaseClient.storage
                    .from('avatars')
                    .upload(filePath, file, { upsert: true });
                
                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = window.supabaseClient.storage
                    .from('avatars')
                    .getPublicUrl(filePath);

                // Update Database with new URL
                await window.supabaseClient
                    .from('profiles')
                    .update({ avatar_url: publicUrl })
                    .eq('id', userId);

                // Update UI
                profileAvatarImg.src = publicUrl;
                headerAvatarImg.src = publicUrl;

                document.getElementById('success-title').innerText = "Success!";
                document.getElementById('success-message').innerText = "Profile photo updated successfully.";
                successModal.style.display = 'flex';

            } catch (error) {
                console.error("Upload error:", error);
                alert("Failed to upload photo: " + error.message);
            } finally {
                btnChangePhoto.innerText = "Change Photo";
                btnChangePhoto.disabled = false;
            }
        });
    }

    // ==========================================
    // 6. DOWNLOAD PDF PROFILE
    // ==========================================
    const downloadBtn = document.querySelector('.action-item');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function(e) {
            e.preventDefault(); 

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const firstName = document.getElementById('first_name') ? document.getElementById('first_name').value : '';
            const lastName = document.getElementById('last_name') ? document.getElementById('last_name').value : '';
            const studentIdVal = document.getElementById('student_id') ? document.getElementById('student_id').value : '';
            const program = document.getElementById('program') ? document.getElementById('program').value : '';
            const email = document.getElementById('email') ? document.getElementById('email').value : '';
            
            // New dynamic fields for the report
            const contact = document.getElementById('contact_number') ? document.getElementById('contact_number').value : 'N/A';
            const gwa = document.getElementById('gwa') ? document.getElementById('gwa').value : 'N/A';

            doc.setFontSize(22);
            doc.text("Student Profile Report", 20, 20);
            
            doc.setFontSize(12);
            doc.text(`Name: ${firstName} ${lastName}`, 20, 40);
            doc.text(`Student ID: ${studentIdVal}`, 20, 50);
            doc.text(`Program: ${program}`, 20, 60);
            doc.text(`Email: ${email}`, 20, 70);
            doc.text(`Contact Number: ${contact}`, 20, 80);
            doc.text(`Current GWA: ${gwa}`, 20, 90);
            
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 110);

            doc.save(`Profile_${lastName}.pdf`);
        });
    }

    // Initialize Page
    loadProfileData();
});