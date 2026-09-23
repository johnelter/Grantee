document.addEventListener('DOMContentLoaded', async () => {
    // Toast UI Helper (Top Center UI Toast Design)
    function showUIToast(type = 'success', title = '', message = '', duration = 3500) {
        return new Promise((resolve) => {
            // Dismiss any open loading or dialog modal immediately
            if (typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                Swal.close();
            }

            let container = document.getElementById('custom-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'custom-toast-container';
                document.body.appendChild(container);
            }

            type = (type || 'success').toLowerCase();
            if (!['success', 'error', 'info', 'warning'].includes(type)) {
                type = 'info';
            }

            let iconSvg = '';
            if (type === 'success') {
                iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                if (!title) title = 'Success';
            } else if (type === 'error') {
                iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                if (!title) title = 'Error';
            } else if (type === 'info') {
                iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
                if (!title) title = 'Info';
            } else if (type === 'warning') {
                iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
                if (!title) title = 'Warning';
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
                    resolve();
                }, 300);
            };

            const closeBtn = toast.querySelector('.toast-close-btn');
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

    window.showUIToast = showUIToast;
    window.showToast = showUIToast;

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

            // STEP 2: Fetch School & Masterlist Syncing (Authoritative Source for Personal & Academic Data)
            let schoolName = 'Unassigned School';
            let masterFirstName = profile.first_name || '';
            let masterMiddleName = profile.middle_name || '';
            let masterLastName = profile.last_name || '';
            let masterIdNumber = profile.id_number || '';
            let masterGender = profile.gender || '';
            let masterYear = profile.year_level || '';
            let masterProgram = profile.program || profile.course || '';
            let masterSchoolId = profile.school_id || null;

            if (profile.id_number) {
                const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('id_number, first_name, middle_name, last_name, gender, year_level, program, school_id, schools(name)')
                    .eq('id_number', profile.id_number)
                    .maybeSingle();

                if (!masterlistError && masterlistData) {
                    if (masterlistData.schools) schoolName = masterlistData.schools.name;

                    if (masterlistData.first_name) masterFirstName = masterlistData.first_name;
                    if (masterlistData.last_name) masterLastName = masterlistData.last_name;
                    if (masterlistData.middle_name !== undefined && masterlistData.middle_name !== null) {
                        masterMiddleName = masterlistData.middle_name;
                    }
                    if (masterlistData.id_number) masterIdNumber = masterlistData.id_number;
                    if (masterlistData.gender) masterGender = masterlistData.gender;
                    if (masterlistData.year_level) masterYear = masterlistData.year_level;
                    if (masterlistData.program) masterProgram = masterlistData.program;
                    if (masterlistData.school_id) masterSchoolId = masterlistData.school_id;

                    // Auto-sync the profiles table silently with ALL authoritative masterlist data
                    const needsSync = (
                        (profile.first_name || '') !== (masterFirstName || '') ||
                        (profile.last_name || '') !== (masterLastName || '') ||
                        (profile.middle_name || '') !== (masterMiddleName || '') ||
                        (profile.id_number || '') !== (masterIdNumber || '') ||
                        (profile.gender || '') !== (masterGender || '') ||
                        (profile.year_level || '') !== (masterYear || '') ||
                        (profile.program || '') !== (masterProgram || '') ||
                        (masterSchoolId && profile.school_id !== masterSchoolId)
                    );

                    if (needsSync) {
                        const syncUpdates = {
                            first_name: masterFirstName,
                            last_name: masterLastName,
                            middle_name: masterMiddleName,
                            id_number: masterIdNumber,
                            gender: masterGender,
                            year_level: masterYear,
                            program: masterProgram
                        };
                        if (masterSchoolId) syncUpdates.school_id = masterSchoolId;

                        await window.supabaseClient.from('profiles').update(syncUpdates).eq('id', userId);

                        // Keep local in-memory profile up to date
                        Object.assign(profile, syncUpdates);
                    }
                }
            }

            // --- Update Header & Avatars ---
            if (profile) {
                const firstName = masterFirstName || profile.first_name || 'Student';
                const lastName = masterLastName || profile.last_name || '';
                const fullName = `${firstName} ${lastName}`.trim();
                const progName = masterProgram || profile.program || 'Student';

                sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));

                if (document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = fullName;
                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = fullName;
                if (document.getElementById('header-program')) document.getElementById('header-program').innerText = progName;

                if (profile.avatar_url) {
                    if (headerAvatarImg) headerAvatarImg.src = profile.avatar_url;
                    if (profileAvatarImg) profileAvatarImg.src = profile.avatar_url;
                    const modalAvatarImg = document.getElementById('modal-avatar-img');
                    if (modalAvatarImg) modalAvatarImg.src = profile.avatar_url;
                    const modalDownloadBtn = document.getElementById('modal-download-photo-btn');
                    if (modalDownloadBtn) modalDownloadBtn.href = profile.avatar_url;
                }
                if (document.getElementById('modal-preview-name')) document.getElementById('modal-preview-name').innerText = fullName;
                if (document.getElementById('modal-preview-program')) document.getElementById('modal-preview-program').innerText = progName;
            }

            // --- Locked Personal Information ---
            if (document.getElementById('first_name')) document.getElementById('first_name').value = masterFirstName;
            if (document.getElementById('middle_name')) document.getElementById('middle_name').value = masterMiddleName;
            if (document.getElementById('last_name')) document.getElementById('last_name').value = masterLastName;
            if (document.getElementById('email')) document.getElementById('email').value = profile.email || '';
            if (document.getElementById('student_id')) document.getElementById('student_id').value = masterIdNumber;

            if (profile.created_at && document.getElementById('reg_date')) {
                const regDate = new Date(profile.created_at);
                document.getElementById('reg_date').value = regDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }

            // --- Locked Academic Information ---
            if (document.getElementById('school')) document.getElementById('school').value = schoolName;
            if (document.getElementById('program')) document.getElementById('program').value = masterProgram;
            if (document.getElementById('year_level')) document.getElementById('year_level').value = masterYear;

            // --- Editable Fields (Personal) ---
            if (document.getElementById('dob')) document.getElementById('dob').value = profile.date_of_birth || '';
            if (document.getElementById('contact_number')) document.getElementById('contact_number').value = profile.contact_number || '';
            if (document.getElementById('address')) document.getElementById('address').value = profile.address || '';
            if (document.getElementById('gender')) document.getElementById('gender').value = masterGender;

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
                            <div class="twofa-active-banner">
                                <div class="twofa-active-text">
                                    <i data-lucide="shield-check" class="twofa-shield-icon"></i>
                                    <span>Two-Factor Authentication is Active.</span>
                                </div>
                                <button type="button" id="disable-2fa-btn" class="btn-disable-2fa">Turn Off 2FA</button>
                            </div>
                        `;

                        if (window.lucide) {
                            window.lucide.createIcons({ root: setup2faSection });
                        }

                        document.getElementById('disable-2fa-btn').addEventListener('click', async () => {
                            const result = await Swal.fire({
                                title: 'Disable 2FA?',
                                text: "Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.",
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#d94841',
                                confirmButtonText: 'Yes, turn it off'
                            });

                            if (result.isConfirmed) {
                                const disableBtn = document.getElementById('disable-2fa-btn');
                                if (disableBtn) {
                                    disableBtn.disabled = true;
                                    disableBtn.innerText = 'Disabling...';
                                }

                                try {
                                    const { error: unenrollError } = await window.supabaseClient.auth.mfa.unenroll({ factorId: activeFactorId });
                                    if (unenrollError) throw unenrollError;

                                    if (typeof Swal !== 'undefined') Swal.close();
                                    await showUIToast('success', 'Success', '2FA has been successfully disabled.', 2500);
                                    window.location.reload();
                                } catch (err) {
                                    if (typeof Swal !== 'undefined') Swal.close();
                                    showUIToast('error', 'Error', 'Failed to disable 2FA: ' + err.message);
                                    if (disableBtn) {
                                        disableBtn.disabled = false;
                                        disableBtn.innerText = 'Turn Off 2FA';
                                    }
                                }
                            }
                        });
                    }
                }
            }

        } catch (err) {
            console.error("Error loading profile:", err);
        } finally {
            // Remove skeleton loading from top header
            const headerTitlesBox = document.getElementById('header-titles-box');
            const profileDropdownToggle = document.getElementById('profile-dropdown-toggle');
            if (headerTitlesBox) headerTitlesBox.classList.remove('is-loading');
            if (profileDropdownToggle) profileDropdownToggle.classList.remove('is-loading');

            // Smoothly remove skeleton and reveal loaded content
            const skeletonState = document.getElementById('profile-skeleton-state');
            const loadedContent = document.getElementById('profile-loaded-content');
            if (skeletonState) {
                skeletonState.style.display = 'none';
            }
            if (loadedContent) {
                loadedContent.style.display = 'flex';
                loadedContent.style.animation = 'profileFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            }
            if (window.lucide) {
                window.lucide.createIcons();
            }
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
                confirmButtonColor: '#2e6b45',
                confirmButtonText: 'Yes, Save'
            });

            if (result.isConfirmed) {
                const saveBtn = personalForm.querySelector('button[type="submit"]');
                const origHtml = saveBtn ? saveBtn.innerHTML : '';
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';
                }

                try {
                    const updates = {
                        gender: document.getElementById('gender')?.value || null,
                        date_of_birth: document.getElementById('dob')?.value || null,
                        contact_number: document.getElementById('contact_number')?.value.trim() || null,
                        address: document.getElementById('address')?.value.trim() || null,
                        updated_at: new Date()
                    };

                    const { error } = await window.supabaseClient.from('profiles').update(updates).eq('id', userId);
                    if (error) throw error;

                    // Also sync gender back to enrolled_masterlist if available
                    const studentIdVal = document.getElementById('student_id')?.value?.trim();
                    if (updates.gender && studentIdVal) {
                        try {
                            await window.supabaseClient
                                .from('enrolled_masterlist')
                                .update({ gender: updates.gender })
                                .eq('id_number', studentIdVal);
                        } catch (mErr) {
                            console.warn("Masterlist gender sync note:", mErr);
                        }
                    }

                    // Immediately update local profile cache
                    try {
                        const cached = sessionStorage.getItem('grantee_student_profile');
                        if (cached) {
                            const p = JSON.parse(cached);
                            Object.assign(p, updates);
                            sessionStorage.setItem('grantee_student_profile', JSON.stringify(p));
                        }
                    } catch (e) {}

                    if (typeof Swal !== 'undefined') Swal.close();
                    showUIToast('success', 'Success', 'Your personal profile settings have been successfully updated.');
                } catch (error) {
                    if (typeof Swal !== 'undefined') Swal.close();
                    showUIToast('error', 'Error', "Failed to save updates: " + error.message);
                } finally {
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = origHtml;
                        if (window.lucide) window.lucide.createIcons({ root: saveBtn });
                    }
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
                confirmButtonColor: '#2e6b45',
                confirmButtonText: 'Yes, Save'
            });

            if (result.isConfirmed) {
                const saveBtn = academicForm.querySelector('button[type="submit"]');
                const origHtml = saveBtn ? saveBtn.innerHTML : '';
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';
                }

                try {
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

                    // Immediately update local profile cache
                    try {
                        const cached = sessionStorage.getItem('grantee_student_profile');
                        if (cached) {
                            const p = JSON.parse(cached);
                            Object.assign(p, updates);
                            sessionStorage.setItem('grantee_student_profile', JSON.stringify(p));
                        }
                    } catch (e) {}

                    if (typeof Swal !== 'undefined') Swal.close();
                    showUIToast('success', 'Success', 'Your academic profile settings have been successfully updated.');
                } catch (error) {
                    if (typeof Swal !== 'undefined') Swal.close();
                    showUIToast('error', 'Error', "Failed to save updates: " + error.message);
                } finally {
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.innerHTML = origHtml;
                        if (window.lucide) window.lucide.createIcons({ root: saveBtn });
                    }
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
                showUIToast('error', 'Error', "New passwords do not match. Please try again.");
                return;
            }

            if (currentPassword === newPassword) {
                showUIToast('error', 'Error', "New password cannot be the same as your current password.");
                return;
            }

            const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;
            if (!strongPasswordRegex.test(newPassword)) {
                showUIToast(
                    'warning',
                    'Security Requirement',
                    'Password must be at least 8 characters with uppercase, lowercase, number, and special character.'
                );
                return;
            }

            const btn = document.getElementById('btn-save-password');
            const originalBtnContent = btn.innerHTML;
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

                await showUIToast(
                    'success',
                    'Password Updated',
                    'Your password has been changed securely. You will now be logged out.',
                    3000
                );

                setTimeout(async () => {
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                }, 1000);

            } catch (err) {
                console.error("Password change error:", err);
                showUIToast('error', 'Error', err.message);
            } finally {
                btn.innerHTML = originalBtnContent;
                btn.disabled = false;
                if (window.lucide) window.lucide.createIcons({ root: btn });
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
                    issuer: 'Grantee System',
                    friendlyName: `Grantee App ${randomId}`
                });

                if (error) throw error;
                factorId = data.id;

                const totpUri = data.totp.uri || `otpauth://totp/Grantee%20System:${encodeURIComponent(userEmail || 'Student')}?secret=${data.totp.secret}&issuer=Grantee%20System`;
                const secretKey = data.totp.secret;

                qrCodeContainer.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;">
                        <div id="qr-code-box">
                            <div id="qr-canvas-holder"></div>
                        </div>
                        <p style="font-size: 13px; color: var(--text-muted); text-align: center; margin: 0; max-width: 400px; line-height: 1.4;">
                            Scan this QR code with <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or any 2FA app.
                        </p>
                        <div style="font-size: 12px; color: var(--text-muted); text-align: center; margin-top: 4px; width: 100%;">
                            Can't scan the QR code? Enter this secret key manually into your app:
                            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px;">
                                <strong style="color: var(--text-heading); font-family: monospace; font-size: 15px; letter-spacing: 2px; background: var(--bg-card-secondary); padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border-color); user-select: all;">
                                    ${secretKey}
                                </strong>
                                <button type="button" id="copy-totp-secret-btn" title="Copy Secret Key" class="btn-copy-key" aria-label="Copy secret key">
                                    <i data-lucide="copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                const holder = document.getElementById('qr-canvas-holder');
                let qrRendered = false;

                // 1. Primary: Use QRCode.js library for clean, instant, high-contrast QR code
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
                        
                        // QRCode.js produces both a working <canvas> and an <img>. Hide working canvas to prevent duplicate vertical stacking.
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

                // 2. Secondary: Parse Supabase data.totp.qr_code (handles data:image and inline <svg>)
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

                // 3. Tertiary: High-speed QR Server image fallback
                if (!qrRendered && holder) {
                    const encodedUri = encodeURIComponent(totpUri);
                    holder.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedUri}&margin=2" alt="2FA QR Code" style="width: 200px; height: 200px; display: block; border-radius: 4px;">`;
                }

                // Attach copy secret button handler
                const copyBtn = document.getElementById('copy-totp-secret-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        navigator.clipboard.writeText(secretKey).then(() => {
                            copyBtn.innerHTML = '<i data-lucide="check"></i>';
                            if (window.lucide) window.lucide.createIcons({ root: copyBtn });
                            setTimeout(() => {
                                copyBtn.innerHTML = '<i data-lucide="copy"></i>';
                                if (window.lucide) window.lucide.createIcons({ root: copyBtn });
                            }, 2000);
                        });
                    });
                }

                if (window.lucide) {
                    window.lucide.createIcons({ root: qrCodeContainer });
                }

                setup2faSection.style.display = 'block';
                start2faBtn.style.display = 'none';

            } catch (error) {
                showUIToast('error', 'Error', "Error starting 2FA setup: " + error.message);
                start2faBtn.innerHTML = '<i data-lucide="key-round"></i> Set Up 2FA';
                start2faBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons({ root: start2faBtn });
            }
        });
    }

    if (confirm2faBtn) {
        confirm2faBtn.addEventListener('click', async () => {
            const code = verify2faInput.value.trim();

            if (code.length !== 6) {
                showUIToast('warning', 'Warning', "Please enter a valid 6-digit code.");
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

                await showUIToast('success', 'Success', "2FA has been successfully enabled! You will be asked for a code next time you log in.", 3000);
                window.location.reload();

            } catch (error) {
                showUIToast('error', 'Error', "Invalid code. Please try again. " + error.message);
                confirm2faBtn.innerHTML = '<i data-lucide="check"></i> Confirm';
                confirm2faBtn.disabled = false;
                if (window.lucide) window.lucide.createIcons({ root: confirm2faBtn });
                verify2faInput.value = '';
                verify2faInput.focus();
            }
        });
    }

    // ==========================================
    // 5. AVATAR PREVIEW LIGHTBOX MODAL & UPLOAD
    // ==========================================
    const avatarClickableWrapper = document.getElementById('avatar-clickable-wrapper') || profileAvatarImg;
    const avatarPreviewModal = document.getElementById('avatar-preview-modal');
    const closeAvatarModalBtn = document.getElementById('close-avatar-modal');
    const modalAvatarImg = document.getElementById('modal-avatar-img');
    const modalPreviewName = document.getElementById('modal-preview-name');
    const modalPreviewProgram = document.getElementById('modal-preview-program');
    const modalDownloadBtn = document.getElementById('modal-download-photo-btn');
    const modalChangePhotoBtn = document.getElementById('modal-change-photo-btn');
    const btnChangePhoto = document.getElementById('change-photo-btn');
    const avatarUploadInput = document.getElementById('avatar-upload');

    function openAvatarPreview() {
        const avatarSrc = profileAvatarImg ? profileAvatarImg.src : 'assets/default-avatar.png';
        const studentName = document.getElementById('header-name')?.innerText || 'Student Profile Photo';
        const studentProg = document.getElementById('header-program')?.innerText || 'Program';

        if (modalAvatarImg) modalAvatarImg.src = avatarSrc;
        if (modalPreviewName) modalPreviewName.innerText = studentName;
        if (modalPreviewProgram) modalPreviewProgram.innerText = studentProg;
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
            // Do not open preview modal if user specifically clicked the camera upload button or file input
            if (e.target.closest('#change-photo-btn') || e.target.id === 'avatar-upload') {
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
            if (avatarUploadInput) avatarUploadInput.click();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && avatarPreviewModal && avatarPreviewModal.style.display === 'flex') {
            closeAvatarPreview();
        }
    });

    if (btnChangePhoto && avatarUploadInput) {
        btnChangePhoto.addEventListener('click', (e) => {
            e.stopPropagation();
            avatarUploadInput.click();
        });
    }

    if (avatarUploadInput) {
        avatarUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const origHtml = btnChangePhoto ? btnChangePhoto.innerHTML : '';
            if (btnChangePhoto) {
                btnChangePhoto.disabled = true;
                btnChangePhoto.innerHTML = '<span class="loading-spinner"></span> Uploading...';
            }

            try {
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

                // Update the images on the current screen and modal
                if (profileAvatarImg) profileAvatarImg.src = cacheBustedUrl;
                if (headerAvatarImg) headerAvatarImg.src = cacheBustedUrl;
                if (modalAvatarImg) modalAvatarImg.src = cacheBustedUrl;
                if (modalDownloadBtn) modalDownloadBtn.href = cacheBustedUrl;

                // Update session storage
                try {
                    const cached = sessionStorage.getItem('grantee_student_profile');
                    if (cached) {
                        const p = JSON.parse(cached);
                        p.avatar_url = cacheBustedUrl;
                        sessionStorage.setItem('grantee_student_profile', JSON.stringify(p));
                    }
                } catch (e) {}

                if (typeof Swal !== 'undefined') Swal.close();
                showUIToast('success', 'Success', 'Profile photo updated successfully.');

            } catch (error) {
                console.error("Upload error:", error);
                if (typeof Swal !== 'undefined') Swal.close();
                showUIToast('error', 'Error', "Failed to upload photo: " + error.message);
            } finally {
                if (btnChangePhoto) {
                    btnChangePhoto.disabled = false;
                    btnChangePhoto.innerHTML = origHtml;
                    if (window.lucide) window.lucide.createIcons({ root: btnChangePhoto });
                }
                avatarUploadInput.value = '';
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

                showUIToast('success', 'Success', 'Notification preferences updated.');
            } catch (err) {
                console.error('Error saving prefs:', err);
                showUIToast('error', 'Error', err.message);
            } finally {
                btn.innerText = 'Save Preferences';
                btn.disabled = false;
            }
        });
    }

    // Initialize Page
    loadProfileData();
});

window.togglePasswordVisibility = function(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input || !button) return;
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = '<i data-lucide="eye"></i>';
    } else {
        input.type = 'password';
        button.innerHTML = '<i data-lucide="eye-off"></i>';
    }
    if (window.lucide) {
        window.lucide.createIcons({ root: button });
    }
};