document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 0. CUSTOM UI TOAST SYSTEM (TOP CENTER)
    // ==========================================
    function showUIToast(type = 'success', title = '', message = '', duration = 3500) {
        return new Promise((resolve) => {
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

            const autoDismissTimer = setTimeout(dismissToast, duration);

            toast.addEventListener('mouseenter', () => clearTimeout(autoDismissTimer));
            toast.addEventListener('mouseleave', () => {
                if (!isDismissed) {
                    setTimeout(dismissToast, 2000);
                }
            });
        });
    }
    window.showUIToast = showUIToast;
    window.showToast = showUIToast;

    // --- 1. INJECT MODAL HTML FOR FULL VIEW ---
    const modalHtml = `
        <div id="full-view-modal" class="doc-modal-overlay" style="display: none;">
            <div class="doc-modal-content">
                <button class="doc-modal-close" onclick="document.getElementById('full-view-modal').style.display='none'" aria-label="Close View">
                    <i data-lucide="x" style="width: 20px; height: 20px;"></i>
                </button>
                <div id="full-view-content" style="width:100%; height:100%;"></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('full-view-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'full-view-modal') {
            document.getElementById('full-view-modal').style.display = 'none';
        }
    });

    // --- 2. DYNAMICALLY LOAD LIBRARIES (PDF.js for previews) ---
    async function loadPDFJS() {
        if (window.pdfjsLib) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const scholarshipId = urlParams.get('id');

    // --- 3. AUTH CHECK ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const studentId = session.user.id;
    const studentEmail = session.user.email;

    let requiredDocsCount = 0;
    let validatedDocsCount = 0;
    let uploadedDocumentsList = [];
    let extractedDataStore = {};

    let currentScholarship = null;
    let studentFullName = '';
    let studentSchoolId = null;

    window.tempFileUrls = {}; // Global store for local blob URLs for the Full View

    // --- TEXT FORMATTING & ESCAPING UTILITY ---
    const escapeHtml = (str) => {
        if (!str || typeof str !== 'string') return str || '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const formatText = (text, rule) => {
        if (!text || typeof text !== 'string') return text;
        if (rule === 'UPPERCASE') return text.toUpperCase();
        if (rule === 'lowercase') return text.toLowerCase();
        if (rule === 'Capitalize Each Word') return text.replace(/\b\w/g, l => l.toUpperCase());
        return text; // 'No formatting' or unknown fallback
    };

    // Helper to refresh Lucide icons
    const refreshIcons = () => {
        if (window.lucide) {
            lucide.createIcons();
        }
    };

    // --- 4. INIT FUNCTION ---
    async function init() {
        try {
            // A. Fetch Educational Assistance Details First (To get formatting rules and slot data)
            const { data: sch, error: schError } = await window.supabaseClient
                .from('scholarships')
                .select('*, applications(id, status)')
                .eq('id', scholarshipId)
                .single();

            if (schError || !sch) {
                await Swal.fire({
                    title: 'Program Not Found',
                    text: 'The requested educational assistance program does not exist or has been removed.',
                    icon: 'error',
                    confirmButtonText: 'Back to Programs',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                    allowOutsideClick: false
                });
                window.location.href = 'student-scholarships.html';
                return;
            }

            if (sch.status === 'Draft') {
                await Swal.fire({
                    title: 'Program Unavailable',
                    text: 'This educational assistance program is currently not open for applications.',
                    icon: 'info',
                    confirmButtonText: 'Back to Programs',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                    allowOutsideClick: false
                });
                window.location.href = 'student-scholarships.html';
                return;
            }

            // Check if deadline has passed
            if (sch.end_date) {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const endDate = new Date(sch.end_date); endDate.setHours(23, 59, 59, 999);
                if (today > endDate) {
                    await Swal.fire({
                        title: 'Application Closed',
                        html: `Applications for <b>${sch.title}</b> are closed because the application deadline has passed.`,
                        icon: 'warning',
                        confirmButtonText: 'Back to Programs',
                        confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                        allowOutsideClick: false
                    });
                    window.location.href = 'student-scholarships.html';
                    return;
                }
            }

            // Calculate slots and capacity
            const isUnlimited = sch.slots === 'Open' || !sch.slots || String(sch.slots).toLowerCase() === 'open';
            const totalSlots = isUnlimited ? null : (parseInt(sch.slots, 10) || 0);
            let remainingSlots = null;
            if (!isUnlimited) {
                if (sch.available_slots !== undefined && sch.available_slots !== null && !isNaN(parseInt(sch.available_slots, 10))) {
                    remainingSlots = Math.max(0, parseInt(sch.available_slots, 10));
                } else {
                    const nonDraftApps = (sch.applications || []).filter(a => (a.status || '').toLowerCase() !== 'draft');
                    const occupiedApps = nonDraftApps.filter(app => {
                        const st = (app.status || '').toLowerCase().trim();
                        return st !== 'rejected' && st !== 'declined' && st !== 'revoked' && st !== 'withdrawn';
                    });
                    remainingSlots = Math.max(0, totalSlots - occupiedApps.length);
                }
            }
            const occupiedCount = isUnlimited ? 0 : (totalSlots !== null ? Math.max(0, totalSlots - (remainingSlots || 0)) : 0);

            if (!isUnlimited && remainingSlots <= 0) {
                await Swal.fire({
                    title: 'Slots Full',
                    html: `This educational assistance program (<b>${sch.title}</b>) has reached its maximum applicant capacity (<b>${occupiedCount}/${totalSlots} slots taken</b>) and no slots remain available.`,
                    icon: 'warning',
                    confirmButtonText: 'Back to Programs',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                    allowOutsideClick: false
                });
                window.location.href = 'student-scholarships.html';
                return;
            }

            currentScholarship = sch;
            const autoFmt = sch.auto_collected_formats || {};

            if (document.getElementById('sch-category')) document.getElementById('sch-category').innerText = sch.category || 'Institution-Funded';
            if (document.getElementById('sch-type')) document.getElementById('sch-type').innerText = sch.scholarship_type || 'Merit-Based';
            if (document.getElementById('sch-title')) document.getElementById('sch-title').innerText = sch.title || 'Untitled Program';
            if (document.getElementById('sch-provider')) document.getElementById('sch-provider').innerText = sch.department || 'General Admin';
            if (document.getElementById('sch-description')) document.getElementById('sch-description').innerHTML = sch.description || 'No description provided.';

            const dateObj = sch.end_date ? new Date(sch.end_date) : null;
            if (document.getElementById('sch-deadline')) document.getElementById('sch-deadline').innerText = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No Deadline';

            // Batch, Semester, and School Year Integrations
            if (document.getElementById('sch-batch')) document.getElementById('sch-batch').innerText = sch.batch || 'N/A';
            if (document.getElementById('sch-semester')) document.getElementById('sch-semester').innerText = sch.semester || 'N/A';
            if (document.getElementById('sch-school-year')) document.getElementById('sch-school-year').innerText = sch.school_year || 'N/A';

            if (document.getElementById('sch-slots')) {
                document.getElementById('sch-slots').innerText = isUnlimited ? 'Unlimited' : `${remainingSlots} / ${totalSlots} Slots Left`;
            }

            if (document.getElementById('sch-status')) {
                document.getElementById('sch-status').innerText = 'ACTIVE';
            }

            // B. Fetch Student Profile
            const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', studentId).single();

            // Helper to normalize scholarship category names across database variations
            const normalizeCategory = (cat) => {
                if (!cat || typeof cat !== 'string') return '';
                const lower = cat.toLowerCase().trim();
                if (lower.includes('institution')) return 'Institution-Funded Educational Assistance';
                if (lower.includes('ched')) return 'Ched Educational Assistance';
                if (lower.includes('private')) return 'Private Educational Assistance';
                if (lower.includes('government') || lower.includes('gov')) return 'Government Educational Assistance';
                return cat.trim();
            };

            const getAppCategory = (app) => {
                const raw = app.category || app.scholarships?.category || app.outside_category || '';
                return normalizeCategory(raw);
            };

            // DUPLICATE & POLICY CHECKS
            const { data: userApps } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships(*)')
                .eq('student_id', studentId);

            const allUserApps = userApps || [];
            const existingApp = allUserApps.find(a => a.scholarship_id === scholarshipId && a.status !== 'Draft');

            if (existingApp) {
                await Swal.fire({
                    title: 'Already Applied',
                    html: `You have already submitted an application (${existingApp.status}) for <b>${sch.title}</b>.`,
                    icon: 'warning',
                    confirmButtonText: 'Go Back',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                    allowOutsideClick: false
                });
                window.location.href = 'student-scholarships.html';
                return;
            }

            // Check Assistance Policies & Exclusivity
            const activeGrants = allUserApps.filter(a => ['Approved', 'Grantee'].includes(a.status));
            const pendingApps = allUserApps.filter(a => ['Submitted', 'Under Review', 'Pending', 'Revision', 'Evaluating', 'For Interview'].includes(a.status));
            const allActiveAndPending = [...activeGrants, ...pendingApps];
            const targetCat = normalizeCategory(sch.category);

            // "No Other Scholarships" Exclusivity Check
            const hasNoOtherScholarshipsRule = Boolean(
                sch.no_other_scholarships === true ||
                sch.no_other_scholarship === true ||
                sch.allow_other_scholarships === false ||
                sch.eligibility_no_other_scholarships === true ||
                sch.eligibility_rules?.no_other_scholarships === true ||
                sch.eligibility_rules?.allow_other_scholarships === false ||
                (typeof sch.description === 'string' && /no\s+other\s+(scholarship|assistance|grant)/i.test(sch.description)) ||
                (typeof sch.title === 'string' && /no\s+other\s+(scholarship|assistance|grant)/i.test(sch.title))
            );

            if (hasNoOtherScholarshipsRule) {
                if (pendingApps.length > 0) {
                    const pendingTitle = pendingApps[0].scholarships?.title || 'another educational assistance program';
                    await Swal.fire({
                        title: 'Application Not Allowed',
                        html: `Application not allowed because you have a pending application for <b>${pendingTitle}</b>.<br><br>This educational assistance program requires applicants to have no other pending or active scholarship applications.`,
                        icon: 'info',
                        confirmButtonText: 'Go Back',
                        confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                        allowOutsideClick: false
                    });
                    window.location.href = 'student-scholarships.html';
                    return;
                }
                if (activeGrants.length > 0) {
                    const activeTitle = activeGrants[0].scholarships?.title || activeGrants[0].outside_assistance_name || 'an active grant';
                    await Swal.fire({
                        title: 'Application Not Allowed',
                        html: `Application not allowed because you already hold an active grant (<b>${activeTitle}</b>).<br><br>This educational assistance requires holding no other scholarships.`,
                        icon: 'info',
                        confirmButtonText: 'Go Back',
                        confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                        allowOutsideClick: false
                    });
                    window.location.href = 'student-scholarships.html';
                    return;
                }
            }

            // Institutional Assistance Policies
            let policyQuery = window.supabaseClient.from('school_policies').select('*');
            if (sch.school_id) {
                policyQuery = policyQuery.eq('school_id', sch.school_id);
            }
            const { data: policyData } = await policyQuery.maybeSingle();

            const isPolicyGloballyEnabled = policyData ? (policyData.global_enabled ?? true) : true;
            if (isPolicyGloballyEnabled) {
                const appsInSameCategory = allActiveAndPending.filter(a => getAppCategory(a) === targetCat);
                const catLimits = policyData?.category_limits || {};
                const catPolicy = catLimits[targetCat];

                if (catPolicy) {
                    if (!catPolicy.unlimited) {
                        const maxLimit = typeof catPolicy.limit === 'number' ? catPolicy.limit : 1;
                        if (maxLimit === 0 || appsInSameCategory.length >= maxLimit) {
                            const existingTitle = appsInSameCategory[0]?.scholarships?.title || appsInSameCategory[0]?.outside_assistance_name || 'an existing scholarship';
                            await Swal.fire({
                                title: 'Category Limit Reached',
                                html: `You already have an active or pending scholarship under the <b>${targetCat}</b> category (<i>${existingTitle}</i>).<br><br>Institutional policy permits a maximum of ${maxLimit} program(s) in this category.`,
                                icon: 'info',
                                confirmButtonText: 'Go Back',
                                confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                                allowOutsideClick: false
                            });
                            window.location.href = 'student-scholarships.html';
                            return;
                        }
                    }
                } else if (targetCat.includes('Institution') || targetCat.includes('Ched')) {
                    if (appsInSameCategory.length >= 1) {
                        const existingTitle = appsInSameCategory[0]?.scholarships?.title || appsInSameCategory[0]?.outside_assistance_name || 'an existing scholarship';
                        await Swal.fire({
                            title: 'Category Limit Reached',
                            html: `You already have an active or pending scholarship under the <b>${targetCat}</b> category (<i>${existingTitle}</i>).<br><br>Institutional policy permits only 1 educational assistance in this category.`,
                            icon: 'info',
                            confirmButtonText: 'Go Back',
                            confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                            allowOutsideClick: false
                        });
                        window.location.href = 'student-scholarships.html';
                        return;
                    }
                }

                // Combination rules check
                if (policyData && policyData.combination_rules) {
                    for (let sa of allActiveAndPending) {
                        const existingCat = getAppCategory(sa);
                        if (existingCat && existingCat !== targetCat) {
                            const comboKey = `${existingCat}::${targetCat}`;
                            const comboKeyReverse = `${targetCat}::${existingCat}`;
                            if (policyData.combination_rules[comboKey] === false || policyData.combination_rules[comboKeyReverse] === false) {
                                const existingTitle = sa.scholarships?.title || sa.outside_assistance_name || existingCat;
                                await Swal.fire({
                                    title: 'Combination Not Permitted',
                                    html: `Institutional policy does not allow combining <b>${targetCat}</b> with your existing grant/application in <b>${existingCat}</b> (<i>${existingTitle}</i>).`,
                                    icon: 'info',
                                    confirmButtonText: 'Go Back',
                                    confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                                    allowOutsideClick: false
                                });
                                window.location.href = 'student-scholarships.html';
                                return;
                            }
                        }
                    }
                }

                // Global limit check
                if (policyData && policyData.global_limit > 0) {
                    if (allActiveAndPending.length >= policyData.global_limit) {
                        await Swal.fire({
                            title: 'Institutional Limit Reached',
                            html: `You have reached the maximum number (${policyData.global_limit}) of active or pending educational assistance programs allowed by institutional policy.`,
                            icon: 'info',
                            confirmButtonText: 'Go Back',
                            confirmButtonColor: 'var(--primary-color, #1F3D2E)',
                            allowOutsideClick: false
                        });
                        window.location.href = 'student-scholarships.html';
                        return;
                    }
                }
            }

            if (profile) {
                studentSchoolId = profile.school_id || null;
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                // Check Masterlist for official authoritative records
                let masterProgram = profile.program || profile.course;
                let masterFirstName = profile.first_name || 'Student';
                let masterLastName = profile.last_name || '';
                let masterMiddleName = profile.middle_name || '';
                let masterYear = profile.year_level || '';
                let masterGender = profile.gender || '';

                if (profile.id_number) {
                    const { data: masterlistData } = await window.supabaseClient
                        .from('enrolled_masterlist')
                        .select('first_name, last_name, middle_name, program, year_level, gender')
                        .eq('id_number', profile.id_number)
                        .maybeSingle();

                    if (masterlistData) {
                        if (masterlistData.first_name) masterFirstName = masterlistData.first_name;
                        if (masterlistData.last_name) masterLastName = masterlistData.last_name;
                        if (masterlistData.middle_name !== undefined && masterlistData.middle_name !== null) masterMiddleName = masterlistData.middle_name;
                        if (masterlistData.program) masterProgram = masterlistData.program;
                        if (masterlistData.year_level) masterYear = masterlistData.year_level;
                        if (masterlistData.gender) masterGender = masterlistData.gender;
                    }
                }

                studentFullName = `${masterFirstName} ${masterMiddleName ? masterMiddleName + ' ' : ''}${masterLastName}`.trim();
                const fullName = `${masterFirstName} ${masterLastName}`.trim();
                const progName = masterProgram || 'Student Profile';

                sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));

                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = fullName;
                if (document.getElementById('header-program')) document.getElementById('header-program').innerText = progName;
                if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                if (document.getElementById('prof-id')) document.getElementById('prof-id').value = profile.id_number || 'N/A';
                if (document.getElementById('prof-email')) document.getElementById('prof-email').value = formatText(studentEmail || 'N/A', autoFmt['Email Address'] || autoFmt['Email']);
                if (document.getElementById('prof-dob')) document.getElementById('prof-dob').value = profile.date_of_birth || 'N/A';
                if (document.getElementById('prof-contact')) document.getElementById('prof-contact').value = profile.contact_number || 'N/A';

                // Formatted Auto-Collected Profile Information
                if (document.getElementById('prof-fullname')) document.getElementById('prof-fullname').value = formatText(studentFullName, autoFmt['Full Name']);
                if (document.getElementById('prof-gender')) document.getElementById('prof-gender').value = formatText(masterGender || 'N/A', autoFmt['Gender']);
                if (document.getElementById('prof-address')) document.getElementById('prof-address').value = formatText(profile.address || 'N/A', autoFmt['Address']);
                if (document.getElementById('prof-program')) document.getElementById('prof-program').value = formatText(masterProgram || 'N/A', autoFmt['Program']);
                if (document.getElementById('prof-year')) document.getElementById('prof-year').value = formatText(masterYear || 'N/A', autoFmt['Year Level']);
            }

            // C. Render Eligibility Rules
            const elList = document.getElementById('sch-eligibility');
            if (elList) {
                elList.innerHTML = '';
                let hasRules = false;

                if (sch.min_college_gwa) {
                    elList.innerHTML += `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have a College GWA of <strong>${sch.min_college_gwa}</strong> or better.</span></li>`;
                    hasRules = true;
                }
                if (sch.min_hs_average) {
                    elList.innerHTML += `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have a High School Average of <strong>${sch.min_hs_average}</strong> or better.</span></li>`;
                    hasRules = true;
                }
                if (sch.min_college_subject_grade) {
                    elList.innerHTML += `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have NO individual College subject grade lower than <strong>${sch.min_college_subject_grade}</strong>.</span></li>`;
                    hasRules = true;
                }
                if (sch.min_hs_subject_grade) {
                    elList.innerHTML += `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have NO individual High School subject grade lower than <strong>${sch.min_hs_subject_grade}</strong>.</span></li>`;
                    hasRules = true;
                }
                if (sch.eligibility_years && sch.eligibility_years.length > 0) {
                    elList.innerHTML += `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Open to Year Levels: <strong>${sch.eligibility_years.join(', ')}</strong>.</span></li>`;
                    hasRules = true;
                }
                if (sch.eligibility_programs && sch.eligibility_programs.length > 0) {
                    elList.innerHTML += `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Open to Programs: <strong>${sch.eligibility_programs.length} Programs selected</strong>.</span></li>`;
                    hasRules = true;
                }
                if (!hasRules) elList.innerHTML = `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>No specific eligibility restrictions for this educational assistance program.</span></li>`;
            }

            // D. Render Dynamic Questionnaire with Custom Formatting Rules
            const questionsContainer = document.getElementById('dynamic-questions');
            if (sch.form_fields && questionsContainer) {
                questionsContainer.innerHTML = '';
                sch.form_fields.forEach((field, i) => {
                    const div = document.createElement('div');
                    div.className = 'preview-input-group';
                    div.style.marginBottom = '15px';
                    const reqStr = field.required ? 'required' : '';
                    const reqIcon = field.required ? '<span class="text-red">*</span>' : '';

                    let inputHtml = '';
                    if (field.type === 'Selection') {
                        const inputType = field.allow_multiple ? 'checkbox' : 'radio';
                        let optionsHtml = '';
                        field.options.forEach((opt) => {
                            optionsHtml += `<label class="radio-checkbox-label"><input type="${inputType}" name="q_${i}" value="${escapeHtml(opt)}" ${reqStr}> ${escapeHtml(opt)}</label>`;
                        });
                        inputHtml = `<div style="padding-top:6px; display:flex; flex-direction:column; gap:8px;">${optionsHtml}</div>`;
                    } else if (field.type === 'Dropdown') {
                        let optionsHtml = (field.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
                        inputHtml = `<select class="preview-input preview-input-active dynamic-select" name="q_${i}" ${reqStr}><option value="">Select option...</option>${optionsHtml}</select>`;
                    } else if (field.type === 'Date') {
                        inputHtml = `<input type="date" class="preview-input preview-input-active dynamic-input" name="q_${i}" ${reqStr}>`;
                    } else {
                        const htmlType = (field.type && field.type.toLowerCase() === 'number') ? 'number' : 'text';
                        const formatRule = field.format_rule || 'No formatting';
                        inputHtml = `<input type="${htmlType}" class="preview-input preview-input-active dynamic-input" name="q_${i}" placeholder="Enter your answer..." ${reqStr} data-format="${formatRule}">`;
                    }

                    div.innerHTML = `<label>${escapeHtml(field.label)} ${reqIcon}</label>${inputHtml}`;
                    if (field.type === 'Textarea' || field.type === 'Text') div.style.gridColumn = '1 / -1';

                    questionsContainer.appendChild(div);
                });

                // Attach real-time formatter to all text inputs that have rules
                document.querySelectorAll('.dynamic-input[data-format]').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const rule = e.target.getAttribute('data-format');
                        if (rule && rule !== 'No formatting') {
                            const start = e.target.selectionStart;
                            const end = e.target.selectionEnd;
                            e.target.value = formatText(e.target.value, rule);
                            e.target.setSelectionRange(start, end);
                        }
                    });
                });
            }

            // Safe parse helper for JSON/Array columns
            const safeParseArray = (data) => {
                if (!data) return [];
                if (typeof data === 'string') {
                    try {
                        const parsed = JSON.parse(data);
                        return Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        return [];
                    }
                }
                return Array.isArray(data) ? data : [];
            };

            // E. Render Document Uploads
            const ocrContainer = document.getElementById('ocr-documents-container');

            let rawDocs = safeParseArray(sch.document_configurations);
            if (rawDocs.length === 0) {
                const rawReq = safeParseArray(sch.required_documents);
                if (rawReq.length > 0) {
                    rawDocs = rawReq.map(item => {
                        if (typeof item === 'string' && item.trim()) {
                            return { name: item.trim(), required: true, ocr_enabled: true, max_size: 5, description: "" };
                        } else if (item && typeof item === 'object' && item.name) {
                            return item;
                        }
                        return null;
                    }).filter(Boolean);
                }
            }

            // Filter out any entries without a valid document name
            const docsConfigList = rawDocs.filter(d => d && typeof d === 'object' && typeof d.name === 'string' && d.name.trim().length > 0);

            const hasAnyOcr = docsConfigList.some(d => d.ocr_enabled !== false);
            const aiNoticeBanner = document.getElementById('ai-verification-banner') || document.querySelector('.preview-ai-banner');
            if (aiNoticeBanner) {
                aiNoticeBanner.style.display = (hasAnyOcr && docsConfigList.length > 0) ? 'flex' : 'none';
            }

            if (docsConfigList.length > 0 && ocrContainer) {
                ocrContainer.innerHTML = '';
                docsConfigList.forEach((docConfig, i) => {
                    const docName = docConfig.name;
                    const isReq = docConfig.required !== false;
                    const isOcr = docConfig.ocr_enabled !== false;
                    const maxSize = docConfig.max_size || 5;
                    const docDesc = docConfig.description || '';

                    if (isReq) requiredDocsCount++;

                    const reqMarker = isReq ? '<span class="text-red">*</span>' : '<span style="font-size:11px; color:var(--text-muted); font-weight:normal; margin-left:2px;">(Optional)</span>';
                    const ocrBadge = isOcr
                        ? `<span class="preview-ocr-badge active"><i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> AI OCR Validation Active</span>`
                        : `<span class="preview-ocr-badge inactive"><i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Standard Upload</span>`;

                    const descHtml = docDesc && docDesc.trim() ? `
                        <div class="preview-doc-instruction">
                            <div class="preview-instruction-title">
                                <i data-lucide="info" style="width: 13px; height: 13px;"></i> Document Description & Student Instructions:
                            </div>
                            <div class="preview-instruction-body">${escapeHtml(docDesc).replace(/\n/g, '<br>')}</div>
                        </div>
                    ` : '';

                    const div = document.createElement('div');
                    div.className = 'preview-doc-box';
                    div.id = `block_${i}`;

                    div.innerHTML = `
                        <div id="zone_${i}">
                            <div class="preview-doc-header">
                                <label style="font-size:13.5px; font-weight:700; color: var(--text-main); display:inline-flex; align-items:center; gap:6px; margin:0;">
                                    <i data-lucide="upload" style="width: 15px; height: 15px; color: var(--forest-shade);"></i> Upload ${escapeHtml(docName)} ${reqMarker}
                                </label>
                                <div>${ocrBadge}</div>
                            </div>
                            ${descHtml}
                            <div style="font-size:11px; color: var(--text-muted); margin-bottom:12px;">Allowed formats: PDF, JPG, PNG (Max size: ${maxSize}MB)</div>
                            <input type="file" id="file_${i}" accept="image/*,application/pdf" style="display:none">
                            <div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap;">
                                <button type="button" class="btn-choose-file" onclick="document.getElementById('file_${i}').click()"><i data-lucide="folder-open" style="width:14px; height:14px; margin-right:6px;"></i> Choose File</button>
                                <span id="fname_${i}" style="font-size: 11px; color: var(--text-muted);">No file selected</span>
                            </div>
                        </div>

                        <div id="loader_${i}" style="display:none; text-align:center; padding: 25px 20px; color: var(--forest-shade); font-weight: 600;">
                            <i data-lucide="loader-2" class="spin-icon" style="width:26px; height:26px; margin-bottom:8px; display:inline-block;"></i>
                            <div>AI is validating document... Please wait...</div>
                        </div>

                        <div id="grid_${i}" style="display:none; text-align:left;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border-dark); padding-bottom: 12px; margin-bottom: 15px; flex-wrap:wrap; gap:10px;">
                                <div>
                                    <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-main);">${escapeHtml(docName)}</h4>
                                    ${docDesc && docDesc.trim() ? `<div style="font-size: 11.5px; color: var(--forest-shade); margin-top: 3px;"><i data-lucide="info" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:3px;"></i> ${escapeHtml(docDesc)}</div>` : ''}
                                </div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    ${ocrBadge}
                                    <span id="status_badge_${i}" style="font-size:11px; padding:4px 10px; background:#e2e8f0; color:#334155; border-radius:12px; font-weight:bold;">Pending</span>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
                                <div style="flex: 1; min-width: 260px; display: flex; flex-direction: column;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <span style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Attached Document</span>
                                        <button type="button" onclick="openFullView('${i}')" class="btn-full-view" title="Open Full View">
                                            <i data-lucide="maximize-2"></i> Full View
                                        </button>
                                    </div>
                                    <div id="preview_container_${i}" style="height: 220px; overflow: hidden; border: 1px solid var(--border-dark); border-radius: 6px; background: #f8fafc; position: relative;"></div>
                                </div>
                                
                                <div style="flex: 1; min-width: 260px; display: flex; flex-direction: column;">
                                    <div style="margin-bottom: 8px; display: flex; align-items: center; height: 32px;">
                                        <span style="font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Verification & Details</span>
                                    </div>
                                    <div id="extracted_data_${i}" class="ai-data-box" style="height: 220px; overflow-y: auto; border: 1px solid var(--border-dark); border-radius: 6px; background: #f8fafc; padding: 15px; font-size: 13px;">
                                        <div style="color: var(--text-muted); text-align: center; margin-top: 80px;">Waiting for extraction...</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display:flex; justify-content:center; align-items:center; gap:12px; flex-wrap:wrap; padding-top: 6px;">
                                <button type="button" onclick="openFullView('${i}')" class="btn-full-view" style="padding: 8px 18px;">
                                    <i data-lucide="expand"></i> Full View
                                </button>
                                <button type="button" class="btn-change-file" onclick="removeFile(${i})">
                                    <i data-lucide="refresh-cw" style="width:13px; height:13px; margin-right:4px;"></i> Change File
                                </button>
                                <button type="button" id="confirm_${i}" class="btn-confirm-upload" onclick="confirmData(${i}, ${isReq}, '${escapeHtml(docName)}')">
                                    <i data-lucide="check" style="width:14px; height:14px; margin-right:4px;"></i> Confirm Upload
                                </button>
                            </div>
                        </div>
                    `;
                    ocrContainer.appendChild(div);

                    document.getElementById(`file_${i}`).addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (!file) return;

                        if (file.size > maxSize * 1024 * 1024) {
                            Swal.fire('File Too Large', `Maximum allowed size for this document is ${maxSize}MB.`, 'error');
                            e.target.value = '';
                            return;
                        }

                        processDocumentSelection(file, i, docName, isOcr);
                    });
                });
            } else if (ocrContainer) {
                ocrContainer.innerHTML = '<p class="no-docs-message" style="font-size: 13.5px; color: var(--text-muted); padding: 14px 18px; background: var(--bg-card-secondary); border: 1px solid var(--border-color); border-radius: 8px; margin: 0 0 10px 0; display: flex; align-items: center; gap: 10px; font-weight: 500;"><i data-lucide="file-check-2" style="width: 18px; height: 18px; color: var(--palette-moss-green, #6B7F4E); flex-shrink: 0;"></i> <span>No documents required.</span></p>';
            }

            const formObj = document.getElementById('scholarship-application-form');
            if (formObj) {
                formObj.addEventListener('input', checkFormValidity);
                formObj.addEventListener('change', checkFormValidity);
            }
            checkFormValidity();

            // Hide skeleton placeholder and reveal actual application content
            const skeletonEl = document.getElementById('application-skeleton');
            const contentEl = document.getElementById('application-content');
            const headerBox = document.getElementById('header-titles-box');

            if (skeletonEl) skeletonEl.style.display = 'none';
            if (contentEl) {
                contentEl.style.display = 'block';
                contentEl.style.animation = 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
            }
            if (headerBox) headerBox.classList.remove('is-loading');

            refreshIcons();

        } catch (err) {
            console.error("Error initializing page:", err);
            const skeletonEl = document.getElementById('application-skeleton');
            const contentEl = document.getElementById('application-content');
            const headerBox = document.getElementById('header-titles-box');

            if (skeletonEl) skeletonEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'block';
            if (headerBox) headerBox.classList.remove('is-loading');

            Swal.fire('Loading Error', 'Failed to load educational assistance details. Please try again.', 'error');
        }
    }

    const checkFormValidity = () => {
        let isQuestionsValid = true;
        if (currentScholarship && currentScholarship.form_fields) {
            for (let i = 0; i < currentScholarship.form_fields.length; i++) {
                const field = currentScholarship.form_fields[i];
                if (!field.required) continue;

                if (field.type === 'Selection') {
                    const inputs = document.querySelectorAll(`[name="q_${i}"]:checked`);
                    if (inputs.length === 0) {
                        isQuestionsValid = false;
                        break;
                    }
                } else {
                    const input = document.querySelector(`[name="q_${i}"]`);
                    if (!input || !input.value.trim()) {
                        isQuestionsValid = false;
                        break;
                    }
                }
            }
        }

        const isDocsValid = validatedDocsCount >= requiredDocsCount;
        document.getElementById('btn-submit-app').disabled = !(isQuestionsValid && isDocsValid);
    };

    // --- 5. BACKEND OCR OR BYPASS LOGIC ---
    async function processDocumentSelection(file, index, expectedDocName, isOcrEnabled) {
        document.getElementById(`zone_${index}`).style.display = 'none';

        const fileUrl = URL.createObjectURL(file);
        window.tempFileUrls[index] = { url: fileUrl, type: file.type };

        const previewContainer = document.getElementById(`preview_container_${index}`);

        if (file.type === 'application/pdf') {
            previewContainer.innerHTML = `<iframe src="${fileUrl}#toolbar=0" width="100%" height="100%" style="border:none; display:block;"></iframe>`;
        } else {
            previewContainer.innerHTML = `<img src="${fileUrl}" style="width:100%; height:100%; object-fit:contain; display:block; margin: 0 auto;">`;
        }

        if (!isOcrEnabled) {
            const dataContainer = document.getElementById(`extracted_data_${index}`);
            if (dataContainer) {
                dataContainer.innerHTML = `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                        <span style="color:var(--stat-approved-color);"><i data-lucide="check-circle-2" style="width:16px; height:16px;"></i></span>
                        <strong style="color:var(--text-heading); font-size:14px;">Document Attached</strong>
                    </div>
                    <div style="background:var(--bg-card); border:1px solid var(--border-color); padding:12px; border-radius:8px; font-size:12px; color:var(--text-muted); line-height:1.6;">
                        <p style="margin:0 0 6px 0;"><strong style="color:var(--text-heading);">File Name:</strong> ${escapeHtml(file.name)}</p>
                        <p style="margin:0 0 8px 0;"><strong style="color:var(--text-heading);">File Size:</strong> ${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        <div style="background:var(--stat-approved-bg); border:1px solid var(--stat-approved-border); color:var(--stat-approved-color); padding:8px 10px; border-radius:6px; font-size:11.5px;">
                            <i data-lucide="check" style="width:13px; height:13px; display:inline-block; vertical-align:middle; margin-right:3px;"></i> Standard document upload. No automated AI scanning is required for this document. Admin will verify this attachment directly upon review.
                        </div>
                    </div>
                `;
            }

            const badge = document.getElementById(`status_badge_${index}`);
            badge.innerText = "Ready ✓";
            badge.style.background = 'var(--stat-approved-bg)';
            badge.style.color = 'var(--stat-approved-color)';
            badge.style.border = '1px solid var(--stat-approved-border)';

            const confirmBtn = document.getElementById(`confirm_${index}`);
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';

            document.getElementById(`grid_${index}`).style.display = 'block';
            refreshIcons();
            return;
        }

        const loader = document.getElementById(`loader_${index}`);
        loader.style.display = 'block';
        refreshIcons();

        try {
            const formData = new FormData();
            formData.append('document', file);
            formData.append('documentType', expectedDocName);
            formData.append('applicantName', studentFullName);
            formData.append('minHsAvg', currentScholarship.min_hs_average || 0);
            formData.append('minCollegeGwa', currentScholarship.min_college_gwa || 5.0);

            formData.append('minHsSubject', currentScholarship.min_hs_subject_grade || 0);
            formData.append('minCollegeSubject', currentScholarship.min_college_subject_grade || 5.0);

            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const endpoints = isLocal
                ? ['http://localhost:3000/api/validate-document', 'https://grantee-backend-n5f4.onrender.com/api/validate-document']
                : ['https://grantee-backend-n5f4.onrender.com/api/validate-document', 'http://localhost:3000/api/validate-document'];

            let response = null;
            let lastFetchError = null;

            for (const url of endpoints) {
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        body: formData
                    });
                    if (response && response.ok) break;
                } catch (e) {
                    lastFetchError = e;
                }
            }

            if (!response || !response.ok) {
                let errMessage = "Validation failed. Please ensure the backend is running and the file is legible.";
                if (response) {
                    try {
                        const errJson = await response.json();
                        if (errJson && errJson.error) errMessage = errJson.error;
                    } catch (_) {}
                } else if (lastFetchError) {
                    errMessage = `Network error: Could not reach the backend server (${lastFetchError.message || 'Connection failed'}).`;
                }
                throw new Error(errMessage);
            }

            const validationResult = await response.json();

            extractedDataStore[index] = validationResult.extracted_data || {};
            const dataContainer = document.getElementById(`extracted_data_${index}`);

            if (validationResult.extracted_data) {
                let html = `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                        <span style="color:var(--palette-moss-green);"><i data-lucide="sparkles" style="width:16px; height:16px;"></i></span>
                        <strong style="color:var(--text-heading); font-size:14px;">AI Extracted Information</strong>
                    </div>
                    <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column; gap:8px;">
                `;

                for (const [key, value] of Object.entries(validationResult.extracted_data)) {
                    let displayValue = '';

                    if (Array.isArray(value)) {
                        displayValue = value.map(item => {
                            if (typeof item === 'object' && item !== null) {
                                return Object.entries(item).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>');
                            }
                            return item;
                        }).join('<div style="height:1px; background:var(--border-color); margin:6px 0;"></div>');

                    } else if (typeof value === 'object' && value !== null) {
                        displayValue = Object.entries(value).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>');
                    } else {
                        displayValue = value || 'N/A';
                    }

                    html += `
                        <li style="background:var(--bg-card); border:1px solid var(--border-color); padding:8px 10px; border-radius:6px;">
                            <span style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">${key}</span>
                            <div style="color:var(--text-main); font-weight:500; font-size:12.5px; line-height:1.4;">${displayValue}</div>
                        </li>
                    `;
                }
                html += '</ul>';
                dataContainer.innerHTML = html;
            }

            const badge = document.getElementById(`status_badge_${index}`);
            const confirmBtn = document.getElementById(`confirm_${index}`);

            if (validationResult.is_valid_source && validationResult.meets_eligibility) {
                badge.innerText = "Verified ✓";
                badge.style.background = 'var(--stat-approved-bg)';
                badge.style.color = 'var(--stat-approved-color)';
                badge.style.border = '1px solid var(--stat-approved-border)';
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            } else {
                badge.innerHTML = "Verification Failed <i data-lucide='x' style='width:12px; height:12px;'></i>";
                badge.style.background = 'var(--stat-rejected-bg)';
                badge.style.color = 'var(--stat-rejected-color)';
                badge.style.border = '1px solid var(--stat-rejected-border)';
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';

                let errorMsg = `Upload Rejected: ${validationResult.rejection_reason || 'Document does not meet requirements.'}`;
                if (validationResult.missing_information && validationResult.missing_information.length > 0) {
                    errorMsg += `\nMissing Fields: ${validationResult.missing_information.join(', ')}`;
                }

                setTimeout(() => Swal.fire('Verification Failed', errorMsg, 'error'), 500);
            }

            loader.style.display = 'none';
            document.getElementById(`grid_${index}`).style.display = 'block';
            refreshIcons();

        } catch (err) {
            console.error("Validation Error:", err);
            Swal.fire('Validation Error', err.message || 'Validation failed. Please ensure the backend is running and the file is legible.', 'error');
            window.removeFile(index);
        }
    }

    async function uploadFileToSupabase(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${studentId}/${scholarshipId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error } = await window.supabaseClient.storage
            .from('scholarship-docs')
            .upload(fileName, file);

        if (error) throw new Error("Storage permission denied. Ensure your Supabase RLS policy allows authenticated uploads.");

        const { data: publicUrlData } = window.supabaseClient.storage
            .from('scholarship-docs')
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
    }

    // --- 6. DOCUMENT CONFIRMATION & FULL VIEW UTILS ---
    window.openFullView = (index) => {
        const fileData = window.tempFileUrls[index];
        if (!fileData) return;

        const contentContainer = document.getElementById('full-view-content');
        if (fileData.type === 'application/pdf') {
            contentContainer.innerHTML = `<iframe src="${fileData.url}#toolbar=0" width="100%" height="100%" style="border:none; display:block;"></iframe>`;
        } else {
            contentContainer.innerHTML = `<img src="${fileData.url}" style="width:100%; height:100%; object-fit:contain; display:block; background:#000;">`;
        }

        document.getElementById('full-view-modal').style.display = 'flex';
        refreshIcons();
    };

    window.removeFile = (index) => {
        document.getElementById(`file_${index}`).value = '';
        if (document.getElementById(`fname_${index}`)) document.getElementById(`fname_${index}`).innerText = 'No file selected';
        document.getElementById(`zone_${index}`).style.display = 'block';
        document.getElementById(`grid_${index}`).style.display = 'none';
        document.getElementById(`loader_${index}`).style.display = 'none';
        extractedDataStore[index] = {};
        delete window.tempFileUrls[index];
        refreshIcons();
    };

    window.confirmData = async (index, isRequired, docName) => {
        const btn = document.getElementById(`confirm_${index}`);
        btn.innerHTML = '<i data-lucide="loader-2" class="spin-icon" style="width:14px; height:14px; margin-right:4px;"></i> Uploading...';
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.style.cursor = 'wait';
        btn.previousElementSibling.disabled = true;
        btn.previousElementSibling.style.opacity = '0.6';
        refreshIcons();

        try {
            const fileInput = document.getElementById(`file_${index}`);
            const file = fileInput.files[0];
            let fileUrl = null;

            if (file) {
                fileUrl = await uploadFileToSupabase(file);
            }

            uploadedDocumentsList.push({
                name: docName,
                status: 'Attached',
                file_url: fileUrl,
                extracted_data: extractedDataStore[index] || {}
            });

            btn.innerHTML = '<i data-lucide="check" style="width:14px; height:14px; margin-right:4px;"></i> Uploaded';
            btn.style.background = 'var(--bg-card-secondary)';
            btn.style.color = 'var(--text-muted)';
            btn.style.border = '1px solid var(--border-color)';
            btn.style.cursor = 'not-allowed';
            refreshIcons();

            if (isRequired) validatedDocsCount++;

            checkFormValidity();

        } catch (err) {
            console.error("Upload error:", err);
            Swal.fire('Upload Error', err.message, 'error');
            btn.innerHTML = '<i data-lucide="check" style="width:14px; height:14px; margin-right:4px;"></i> Confirm Upload';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.previousElementSibling.disabled = false;
            btn.previousElementSibling.style.opacity = '1';
            refreshIcons();
        }
    };

    // --- 7. FINAL FORM SUBMISSION ---
    document.getElementById('scholarship-application-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('btn-submit-app');
        const formResponses = {};

        if (currentScholarship && currentScholarship.form_fields) {
            for (let i = 0; i < currentScholarship.form_fields.length; i++) {
                const field = currentScholarship.form_fields[i];

                if (field.type === 'Selection') {
                    const inputs = document.querySelectorAll(`[name="q_${i}"]:checked`);
                    if (field.required && inputs.length === 0) {
                        Swal.fire('Required Field', `Please answer the required question: ${field.label}`, 'warning');
                        return; // Exits submission safely
                    }
                    if (inputs.length > 0) {
                        formResponses[field.label] = Array.from(inputs).map(inp => inp.value).join(', ');
                    }
                } else {
                    const input = document.querySelector(`[name="q_${i}"]`);
                    if (field.required && (!input || !input.value.trim())) {
                        Swal.fire('Required Field', `Please answer the required question: ${field.label}`, 'warning');
                        return; // Exits submission safely
                    }
                    if (input && input.value) {
                        formResponses[field.label] = input.value.trim();
                    }
                }
            }
        }

        submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin-icon" style="width:16px; height:16px; margin-right:6px;"></i> Submitting...';
        submitBtn.disabled = true;
        refreshIcons();

        try {
            const submissionPayload = {
                student_id: studentId,
                scholarship_id: scholarshipId,
                form_responses: formResponses,
                documents: uploadedDocumentsList,
                student_name: studentFullName,
                student_school_id: studentSchoolId,
                docs_completed_at: new Date().toISOString()
            };

            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const endpoints = isLocal
                ? ['http://localhost:3000/api/student/submit-application', 'https://grantee-backend-n5f4.onrender.com/api/student/submit-application']
                : ['https://grantee-backend-n5f4.onrender.com/api/student/submit-application', 'http://localhost:3000/api/student/submit-application'];

            let resultData = null;
            let backendSucceeded = false;

            // 1. ATTEMPT BACKEND ATOMIC ENDPOINT FIRST
            for (const url of endpoints) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(submissionPayload)
                    });

                    if (response) {
                        const rawText = await response.text();
                        let json = null;
                        try {
                            json = JSON.parse(rawText);
                        } catch (_) {
                            // Non-JSON HTML response (e.g. 404 from Render before deployment)
                        }

                        if (response.ok && json && json.success) {
                            resultData = json;
                            backendSucceeded = true;
                            break;
                        } else if (json && json.error) {
                            // Definite validation error from server (e.g. deadline closed or duplicate)
                            throw new Error(json.error);
                        }
                    }
                } catch (fetchErr) {
                    // If it's a real business error thrown above, rethrow
                    if (fetchErr.message && !fetchErr.message.includes('fetch') && !fetchErr.message.includes('NetworkError') && !fetchErr.message.includes('JSON')) {
                        throw fetchErr;
                    }
                }
            }

            // 2. RESILIENT FALLBACK: If backend endpoint is offline / not yet deployed to Render, handle directly via Supabase
            if (!backendSucceeded) {
                console.log("[Apply] Backend endpoint unavailable; executing direct Supabase atomic allocation fallback...");

                // 2a. Duplicate Check
                const { data: existingApp } = await window.supabaseClient
                    .from('applications')
                    .select('id, status')
                    .eq('student_id', studentId)
                    .eq('scholarship_id', scholarshipId)
                    .maybeSingle();

                if (existingApp && !['rejected', 'declined', 'revoked', 'withdrawn'].includes((existingApp.status || '').toLowerCase())) {
                    throw new Error(`You already have an active application for this scholarship (Status: ${existingApp.status}).`);
                }

                // 2b. Fetch latest scholarship slots & deadline
                const { data: latestSch, error: schErr } = await window.supabaseClient
                    .from('scholarships')
                    .select('*')
                    .eq('id', scholarshipId)
                    .single();

                if (schErr || !latestSch) throw new Error("Could not verify scholarship details.");

                if (latestSch.end_date) {
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    const endDate = new Date(latestSch.end_date); endDate.setHours(23, 59, 59, 999);
                    if (today > endDate) {
                        throw new Error("Applications for this educational assistance program are now closed.");
                    }
                }

                const isUnlim = latestSch.slots === 'Open' || !latestSch.slots || String(latestSch.slots).toLowerCase() === 'open';
                let curAvail = 999999;
                if (!isUnlim) {
                    const maxSlots = parseInt(latestSch.slots, 10) || 0;
                    if (latestSch.available_slots !== undefined && latestSch.available_slots !== null && !isNaN(parseInt(latestSch.available_slots, 10))) {
                        curAvail = parseInt(latestSch.available_slots, 10);
                    } else {
                        const { data: activeApps } = await window.supabaseClient
                            .from('applications')
                            .select('id, status')
                            .eq('scholarship_id', scholarshipId);

                        const occupied = (activeApps || []).filter(a => !['rejected', 'declined', 'revoked', 'withdrawn', 'draft', 'waitlisted'].includes((a.status || '').toLowerCase().trim())).length;
                        curAvail = Math.max(0, maxSlots - occupied);
                    }
                }

                // 2c. Allocate: Primary Slot vs Waitlist
                if (curAvail > 0) {
                    // Decrement slots
                    if (!isUnlim) {
                        const newAvail = Math.max(0, curAvail - 1);
                        await window.supabaseClient.from('scholarships').update({ available_slots: newAvail }).eq('id', scholarshipId);
                    }

                    const appPayload = {
                        student_id: studentId,
                        scholarship_id: scholarshipId,
                        status: 'Pending',
                        form_responses: formResponses,
                        documents: uploadedDocumentsList,
                        created_at: new Date().toISOString(),
                        remarks: `Primary slot secured at ${new Date().toISOString()}`
                    };

                    const { error: insertErr } = await window.supabaseClient.from('applications').insert([appPayload]);
                    if (insertErr) throw insertErr;

                    resultData = {
                        success: true,
                        isWaitlisted: false,
                        message: 'Your educational assistance application has been successfully submitted and a slot has been reserved.'
                    };

                    // Send Notifications
                    const notifPayload = {
                        userIds: [studentId],
                        eventType: 'applications',
                        subject: 'Application Submitted',
                        message: 'Your educational assistance application has been successfully submitted and is under review.',
                        htmlContent: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                                <h2 style="color: #1F3D2E; margin-top: 0;">Application Submitted</h2>
                                <p>Your application has been successfully submitted and a slot has been reserved.</p>
                            </div>
                        `
                    };
                    fetch('https://grantee-backend-n5f4.onrender.com/api/dispatch-notification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(notifPayload)
                    }).catch(() => {});

                } else {
                    // Slots full: Place on Waitlist
                    const { count: waitlistCount } = await window.supabaseClient
                        .from('applications')
                        .select('*', { count: 'exact', head: true })
                        .eq('scholarship_id', scholarshipId)
                        .eq('status', 'Waitlisted');

                    const waitlistPos = (waitlistCount || 0) + 1;

                    const appPayload = {
                        student_id: studentId,
                        scholarship_id: scholarshipId,
                        status: 'Waitlisted',
                        form_responses: formResponses,
                        documents: uploadedDocumentsList,
                        created_at: new Date().toISOString(),
                        remarks: `All primary slots filled. Placed on Waitlist at Position #${waitlistPos}.`
                    };

                    const { error: insertErr } = await window.supabaseClient.from('applications').insert([appPayload]);
                    if (insertErr) throw insertErr;

                    resultData = {
                        success: true,
                        isWaitlisted: true,
                        waitlist_position: waitlistPos,
                        message: `All regular slots have been filled. You have been placed on the Waitlist at Position #${waitlistPos}.`
                    };
                }

                // Notify Coordinators
                if (studentSchoolId) {
                    fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: studentSchoolId,
                            eventType: 'NEW_APPLICATION',
                            subject: 'New Application Received',
                            message: `New application received from ${studentFullName} for ${currentScholarship?.title || 'Educational Assistance'}.`,
                            resourceId: scholarshipId
                        })
                    }).catch(() => {});
                }
            }

            // 3. RENDER ALLOCATION OUTCOME
            if (resultData && resultData.isWaitlisted) {
                const waitlistPos = resultData.waitlist_position || 1;
                await Swal.fire({
                    title: 'Application Waitlisted',
                    html: `
                        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: var(--text-color);">
                            <p style="margin-bottom: 12px;">All primary slots for <strong>${currentScholarship?.title || 'this scholarship'}</strong> were just filled by concurrent submissions.</p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                                <strong style="color: #92400e; display: block; margin-bottom: 4px;">Waitlist Position Assigned: #${waitlistPos}</strong>
                                <span style="color: #78350f; font-size: 13px;">Your application has been successfully saved. If a slot opens up, waitlisted students are prioritized in order.</span>
                            </div>
                        </div>
                    `,
                    icon: 'info',
                    confirmButtonText: 'View My Applications',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)'
                });

                window.location.href = 'student-applications.html';
                return;
            }

            // Primary Slot Reserved
            showUIToast(
                'success',
                'Application Submitted',
                resultData?.message || 'Your educational assistance application has been successfully submitted and a slot has been reserved.',
                3500
            );

            setTimeout(() => {
                window.location.href = 'student-applications.html';
            }, 2500);

        } catch (err) {
            console.error("Submission Error:", err);
            showUIToast('error', 'Submission Failed', err.message || 'Failed to submit application.');
            submitBtn.innerText = 'Submit Application';
            submitBtn.disabled = false;
            refreshIcons();
        }
    });

    init();
});