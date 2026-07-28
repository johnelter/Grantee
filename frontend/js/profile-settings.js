document.addEventListener('DOMContentLoaded', async () => {

    // Forms and Buttons
    const personalForm = document.getElementById('personal-info-form');
    const academicForm = document.getElementById('academic-info-form');
    const passwordForm = document.getElementById('password-form');

    // Header Elements
    const headerName = document.getElementById('header-name');
    const headerAvatarImg = document.getElementById('header-avatar');
    const profileAvatarImg = document.getElementById('profile-avatar');

    // 2FA Elements
    const start2faBtn = document.getElementById('start-2fa-btn');
    const setup2faSection = document.getElementById('setup-2fa-section');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const verify2faInput = document.getElementById('verify-2fa-input');
    const confirm2faBtn = document.getElementById('confirm-2fa-btn');
    let factorId = null;
    let activeFactorId = null;

    // Check if user is logged in
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();

    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // --- Inject Exact Years to prevent database mismatch ---
    const EXACT_YEARS = ["1st year", "2nd year", "3rd year", "4th year", "Irregular"];
    const yearSelect = document.getElementById('year_level');
    if (yearSelect) {
        yearSelect.innerHTML = '<option value="">Select Year</option>' + EXACT_YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    // ==========================================
    // 1. FETCH AND DISPLAY DATA (SMART SYNC)
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

            // STEP 2: Fetch School & Masterlist Syncing
            let schoolName = 'Unassigned School';
            let masterGender = profile.gender; // Defaults to what the student saved
            let masterYear = profile.year_level;
            let masterProgram = profile.program || profile.course;

            if (profile.id_number) {
                const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id, schools(name), gender, year_level, program')
                    .eq('id_number', profile.id_number)
                    .single();

                if (!masterlistError && masterlistData) {
                    if (masterlistData.schools) schoolName = masterlistData.schools.name;

                    if (!masterGender && masterlistData.gender) {
                        masterGender = masterlistData.gender;
                    }

                    if (masterlistData.year_level) masterYear = masterlistData.year_level;
                    if (masterlistData.program) masterProgram = masterlistData.program;

                    // Auto-correct the profiles table silently for Academic Info ONLY
                    if (profile.year_level !== masterYear || profile.program !== masterProgram) {
                        window.supabaseClient.from('profiles').update({
                            year_level: masterYear,
                            program: masterProgram
                        }).eq('id', userId).then();
                    }
                }
            }

            // --- Update Header & Avatars ---
            if (profile) {
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';

                if (document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = `${firstName} ${lastName}`.trim();
                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                if (document.getElementById('header-program')) document.getElementById('header-program').innerText = masterProgram || 'Student';

                if (profile.avatar_url) {
                    if (headerAvatarImg) headerAvatarImg.src = profile.avatar_url;
                    if (profileAvatarImg) profileAvatarImg.src = profile.avatar_url;
                }
            }

            // --- Locked Personal Information ---
            if (document.getElementById('first_name')) document.getElementById('first_name').value = profile.first_name || '';
            if (document.getElementById('middle_name')) document.getElementById('middle_name').value = profile.middle_name || '';
            if (document.getElementById('last_name')) document.getElementById('last_name').value = profile.last_name || '';
            if (document.getElementById('email')) document.getElementById('email').value = profile.email || '';
            if (document.getElementById('student_id')) document.getElementById('student_id').value = profile.id_number || '';

            if (profile.created_at && document.getElementById('reg_date')) {
                const regDate = new Date(profile.created_at);
                document.getElementById('reg_date').value = regDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }

            // --- Locked Academic Information ---
            if (document.getElementById('school')) document.getElementById('school').value = schoolName;
            if (document.getElementById('program')) document.getElementById('program').value = masterProgram || '';
            if (document.getElementById('year_level')) document.getElementById('year_level').value = masterYear || '';

            // --- Editable Fields (Personal) ---
            if (document.getElementById('suffix')) document.getElementById('suffix').value = profile.suffix || '';
            if (document.getElementById('dob')) document.getElementById('dob').value = profile.date_of_birth || '';
            if (document.getElementById('contact_number')) document.getElementById('contact_number').value = profile.contact_number || '';
            if (document.getElementById('address')) document.getElementById('address').value = profile.address || '';
            if (document.getElementById('gender')) document.getElementById('gender').value = masterGender || '';

            // --- Editable Fields (Academic) ---
            if (document.getElementById('gwa')) document.getElementById('gwa').value = profile.gwa || '';

            // --- Notification Preferences ---
            if (profile.email_preferences) {
                const prefs = profile.email_preferences;
                if (document.getElementById('pref-announcements')) document.getElementById('pref-announcements').checked = prefs.announcements !== false;
                if (document.getElementById('pref-applications')) document.getElementById('pref-applications').checked = prefs.applications !== false;
                if (document.getElementById('pref-beneficiary')) document.getElementById('pref-beneficiary').checked = prefs.beneficiary !== false;
            }

            // --- CHECK 2FA STATUS ---
            const { data: mfaData, error: mfaError } = await window.supabaseClient.auth.mfa.listFactors();
            if (!mfaError && mfaData && mfaData.totp && mfaData.totp.length > 0) {
                const activeFactor = mfaData.totp.find(f => f.status === 'verified');
                if (activeFactor) {
                    activeFactorId = activeFactor.id;
                    if (start2faBtn && setup2faSection) {
                        start2faBtn.style.display = 'none';
                        setup2faSection.style.display = 'block';
                        setup2faSection.style.borderTop = 'none';

                        setup2faSection.innerHTML = `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:#ecfdf5; padding:15px; border-radius:8px; border:1px solid #10b981;">
                                <p style="color: #065f46; font-weight: 600; margin: 0; font-size:14px;">✅ Two-Factor Authentication is Active.</p>
                                <button type="button" id="disable-2fa-btn" style="background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">Turn Off 2FA</button>
                            </div>
                        `;

                        document.getElementById('disable-2fa-btn').addEventListener('click', async () => {
                            const result = await Swal.fire({
                                title: 'Disable 2FA?',
                                text: "Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.",
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#ef4444',
                                confirmButtonText: 'Yes, turn it off'
                            });

                            if (result.isConfirmed) {
                                try {
                                    Swal.fire({ title: 'Disabling...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                                    const { error: unenrollError } = await window.supabaseClient.auth.mfa.unenroll({ factorId: activeFactorId });
                                    if (unenrollError) throw unenrollError;

                                    await Swal.fire('Disabled!', '2FA has been successfully disabled.', 'success');
                                    window.location.reload();
                                } catch (err) {
                                    Swal.fire('Error', 'Failed to disable 2FA: ' + err.message, 'error');
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
    // 2. SAVING PROFILE (Personal & Academic)
    // ==========================================

    if (personalForm) {
        personalForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const result = await Swal.fire({
                title: 'Save Changes',
                text: 'Are you sure you want to save these changes to your personal profile?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'Yes, Save'
            });

            if (result.isConfirmed) {
                try {
                    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                    const updates = {
                        suffix: document.getElementById('suffix')?.value.trim() || null,
                        gender: document.getElementById('gender')?.value || null,
                        date_of_birth: document.getElementById('dob')?.value || null,
                        contact_number: document.getElementById('contact_number')?.value.trim() || null,
                        address: document.getElementById('address')?.value.trim() || null,
                        updated_at: new Date()
                    };

                    const { error } = await window.supabaseClient.from('profiles').update(updates).eq('id', userId);
                    if (error) throw error;

                    Swal.fire('Success!', 'Your personal profile settings have been successfully updated.', 'success');
                } catch (error) {
                    Swal.fire('Error', "Failed to save updates: " + error.message, 'error');
                }
            }
        });
    }

    if (academicForm) {
        academicForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const result = await Swal.fire({
                title: 'Save Changes',
                text: 'Are you sure you want to save these changes to your academic profile?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'Yes, Save'
            });

            if (result.isConfirmed) {
                try {
                    Swal.fire({ title: 'Saving...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                    const gwaInput = document.getElementById('gwa')?.value;
                    const updates = { updated_at: new Date() };

                    if (gwaInput && gwaInput.trim() !== "") {
                        updates.gwa = parseFloat(gwaInput);
                    } else {
                        updates.gwa = null;
                    }

                    const { error } = await window.supabaseClient.from('profiles').update(updates).eq('id', userId);

                    if (error) {
                        if (error.message.includes('gwa')) throw new Error("The database is missing the 'gwa' column! Please contact the administrator.");
                        throw error;
                    }

                    Swal.fire('Success!', 'Your academic profile settings have been successfully updated.', 'success');
                } catch (error) {
                    Swal.fire('Error', "Failed to save updates: " + error.message, 'error');
                }
            }
        });
    }

    // ==========================================
    // 3. SECURITY SETTINGS (Update Password)
    // ==========================================
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword !== confirmPassword) {
                Swal.fire('Error', "New passwords do not match. Please try again.", 'error');
                return;
            }

            if (currentPassword === newPassword) {
                Swal.fire('Error', "New password cannot be the same as your current password.", 'error');
                return;
            }

            const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
            if (!strongPasswordRegex.test(newPassword)) {
                Swal.fire(
                    'Security Requirement',
                    "Password must be at least 8 characters long and contain:\n\n• One uppercase letter (A-Z)\n• One lowercase letter (a-z)\n• One number (0-9)\n• One special character (e.g., !@#$%^&*)",
                    'warning'
                );
                return;
            }

            const btn = document.getElementById('btn-save-password');
            btn.innerText = "Verifying...";
            btn.disabled = true;

            try {
                const { error: signInError } = await window.supabaseClient.auth.signInWithPassword({
                    email: userEmail,
                    password: currentPassword
                });

                if (signInError) throw new Error("Incorrect current password. Please try again.");

                btn.innerText = "Updating...";
                const { error: updateError } = await window.supabaseClient.auth.updateUser({
                    password: newPassword
                });

                if (updateError) throw updateError;

                Swal.fire({
                    title: 'Password Updated',
                    text: 'Your password has been changed securely. You will now be logged out.',
                    icon: 'success',
                    timer: 3000,
                    showConfirmButton: false
                });

                setTimeout(async () => {
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                }, 3000);

            } catch (err) {
                console.error("Password change error:", err);
                Swal.fire('Error', err.message, 'error');
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
                // 1. CLEANUP: Forcefully remove ALL existing TOTP factors to prevent naming collisions
                const { data: existingFactors } = await window.supabaseClient.auth.mfa.listFactors();
                if (existingFactors && existingFactors.totp) {
                    for (const factor of existingFactors.totp) {
                        await window.supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
                    }
                }

                // 2. ENROLL: Append a random number to guarantee a 100% unique friendlyName
                const randomId = Math.floor(Math.random() * 10000);
                const { data, error } = await window.supabaseClient.auth.mfa.enroll({
                    factorType: 'totp',
                    friendlyName: `Grantee App ${randomId}`
                });

                if (error) throw error;
                factorId = data.id;

                qrCodeContainer.innerHTML = `<div style="display: inline-block; background: #fff; padding: 12px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); width: 220px; height: 220px; margin: 0 auto;">
                    ${data.totp.qr_code.replace('<svg', '<svg width="200" height="200" style="display:block; margin:0 auto;"')}
                </div>`;

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
                Swal.fire('Error', "Error starting 2FA setup: " + error.message, 'error');
                start2faBtn.innerText = "Set Up 2FA";
                start2faBtn.disabled = false;
            }
        });
    }

    if (confirm2faBtn) {
        confirm2faBtn.addEventListener('click', async () => {
            const code = verify2faInput.value.trim();

            if (code.length !== 6) {
                Swal.fire('Warning', "Please enter a valid 6-digit code.", 'warning');
                return;
            }

            confirm2faBtn.innerText = "Verifying...";
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

                await Swal.fire('Success', "2FA has been successfully enabled! You will be asked for a code next time you log in.", 'success');
                window.location.reload();

            } catch (error) {
                Swal.fire('Error', "Invalid code. Please try again. " + error.message, 'error');
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

    if (btnChangePhoto && avatarUploadInput) {
        btnChangePhoto.addEventListener('click', () => {
            avatarUploadInput.click();
        });

        avatarUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                btnChangePhoto.innerText = "Uploading...";
                btnChangePhoto.disabled = true;

                // Optional loading state while upload runs
                Swal.fire({ title: 'Uploading photo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

                const fileExt = file.name.split('.').pop();
                const filePath = `${userId}.${fileExt}`;

                const { error: uploadError } = await window.supabaseClient.storage
                    .from('avatars')
                    .upload(filePath, file, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = window.supabaseClient.storage
                    .from('avatars')
                    .getPublicUrl(filePath);

                // FIX: Attach a unique timestamp to the URL so the browser never caches the old image
                const cacheBustedUrl = `${publicUrl}?t=${new Date().getTime()}`;

                // Save the timestamped URL directly to the database
                await window.supabaseClient
                    .from('profiles')
                    .update({ avatar_url: cacheBustedUrl })
                    .eq('id', userId);

                // Update the images on the current screen
                if (profileAvatarImg) profileAvatarImg.src = cacheBustedUrl;
                if (headerAvatarImg) headerAvatarImg.src = cacheBustedUrl;

                Swal.fire('Success!', 'Profile photo updated successfully.', 'success');

            } catch (error) {
                console.error("Upload error:", error);
                Swal.fire('Error', "Failed to upload photo: " + error.message, 'error');
            } finally {
                btnChangePhoto.innerText = "Change Photo";
                btnChangePhoto.disabled = false;
            }
        });
    }

    // ==========================================
    // 6. DOWNLOAD PDF PROFILE (WITH ADDRESS)
    // ==========================================
    const downloadBtn = document.querySelector('.action-item');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function (e) {
            e.preventDefault();

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const firstName = document.getElementById('first_name') ? document.getElementById('first_name').value : '';
            const lastName = document.getElementById('last_name') ? document.getElementById('last_name').value : '';
            const studentIdVal = document.getElementById('student_id') ? document.getElementById('student_id').value : '';
            const program = document.getElementById('program') ? document.getElementById('program').value : '';
            const email = document.getElementById('email') ? document.getElementById('email').value : '';

            const contact = document.getElementById('contact_number') ? document.getElementById('contact_number').value : 'N/A';
            const address = document.getElementById('address') ? document.getElementById('address').value : 'N/A';
            const gwa = document.getElementById('gwa') ? document.getElementById('gwa').value : 'N/A';

            // Re-fetch the locked year level
            const yearLevel = document.getElementById('year_level') ? document.getElementById('year_level').value : 'N/A';

            doc.setFontSize(22);
            doc.text("Student Profile Report", 20, 20);

            doc.setFontSize(12);
            doc.text(`Name: ${firstName} ${lastName}`, 20, 40);
            doc.text(`Student ID: ${studentIdVal}`, 20, 50);
            doc.text(`Program: ${program}`, 20, 60);
            doc.text(`Year Level: ${yearLevel}`, 20, 70);
            doc.text(`Email: ${email}`, 20, 80);
            doc.text(`Contact Number: ${contact}`, 20, 90);
            doc.text(`Address: ${address}`, 20, 100);
            doc.text(`Current GWA: ${gwa}`, 20, 110);

            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 130);

            doc.save(`Profile_${lastName}.pdf`);
        });
    }

    // ==========================================
    // NOTIFICATION PREFERENCES
    // ==========================================
    const prefsForm = document.getElementById('notification-prefs-form');
    if (prefsForm) {
        prefsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btn-save-prefs');
            try {
                btn.innerText = 'Saving...';
                btn.disabled = true;

                const preferences = {
                    announcements: document.getElementById('pref-announcements').checked,
                    applications: document.getElementById('pref-applications').checked,
                    beneficiary: document.getElementById('pref-beneficiary').checked,
                    security: true // Always true
                };

                const response = await fetch('/api/update-notification-preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, preferences })
                });

                if (!response.ok) throw new Error('Failed to update preferences on server.');
                
                // Also update supabase directly just in case local state needs it immediately
                await window.supabaseClient.from('profiles').update({ email_preferences: preferences }).eq('id', userId);

                Swal.fire('Success', 'Notification preferences updated.', 'success');
            } catch (err) {
                console.error('Error saving prefs:', err);
                Swal.fire('Error', err.message, 'error');
            } finally {
                btn.innerText = 'Save Preferences';
                btn.disabled = false;
            }
        });
    }

    // Initialize Page
    loadProfileData();
});