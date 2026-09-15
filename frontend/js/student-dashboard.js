document.addEventListener('DOMContentLoaded', async () => {

    let applicationsData = [];
    let currentProfile = null;

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }
    const studentId = session.user.id;

    // --- 2. FETCH PROFILE & SCHOOL FROM MASTERLIST ---
    async function loadProfile() {
        try {
            // Step 1: Get the student's basic profile
            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profileError) throw profileError;

            if (profile) {
                currentProfile = profile; // Store for application modal

                // Step 2: Use their id_number to find their school in the masterlist
                const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id, schools(name)')
                    .eq('id_number', profile.id_number)
                    .single();

                if (masterlistData && masterlistData.school_id) {
                    currentProfile.school_id = masterlistData.school_id;
                }

                if (masterlistError) {
                    console.warn("Could not find student in masterlist to assign school.");
                }

                // Update UI Elements
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                const schoolName = masterlistData && masterlistData.schools ? masterlistData.schools.name : 'Unassigned School';
                const fullName = `${firstName} ${lastName}`.trim();
                const progName = profile.program || profile.course || 'Student Profile';

                sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));

                if (document.getElementById('welcome-text')) {
                    document.getElementById('welcome-text').innerText = `Welcome back, ${firstName}!`;
                }
                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = fullName;
                }
                if (document.getElementById('header-program')) {
                    document.getElementById('header-program').innerText = progName;
                }
                if (document.getElementById('student-school-display')) {
                    document.getElementById('student-school-display').innerHTML = `<i data-lucide="school" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> <strong>${schoolName}</strong>`;
                }
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                // Remove skeleton loading from header titles
                const headerTitlesBox = document.getElementById('header-titles-box');
                if (headerTitlesBox) headerTitlesBox.classList.remove('is-loading');
                const headerTitles = document.querySelector('.header-titles');
                if (headerTitles) headerTitles.classList.remove('is-loading');

                if (window.lucide) { window.lucide.createIcons(); }
            }
        } catch (error) {
            console.error("Error loading profile and masterlist data:", error);
            const headerTitlesBox = document.getElementById('header-titles-box');
            if (headerTitlesBox) headerTitlesBox.classList.remove('is-loading');
        }
    }

    // --- 3. FETCH APPLICATIONS (Overview & Recent) ---
    async function loadApplications() {
        try {
            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships (title)')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Filter out applications added by admin (they have null form_responses)
            const applications = (apps || []).filter(app => app.form_responses !== null);
            applicationsData = applications; // Save globally for details modal

            // A. Update Overview Stats & Remove Skeleton Shimmer
            const submittedCount = applications.length;
            const reviewCount = applications.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
            const approvedCount = applications.filter(a => a.status === 'Approved' || a.status === 'Grantee').length;
            const rejectedCount = applications.filter(a => a.status === 'Rejected' || a.status === 'Declined' || a.status === 'Revoked').length;

            ['stat-submitted', 'stat-review', 'stat-approved', 'stat-rejected'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('is-loading');
            });

            if (document.getElementById('stat-submitted')) document.getElementById('stat-submitted').innerText = submittedCount;
            if (document.getElementById('stat-review')) document.getElementById('stat-review').innerText = reviewCount;
            if (document.getElementById('stat-approved')) document.getElementById('stat-approved').innerText = approvedCount;
            if (document.getElementById('stat-rejected')) document.getElementById('stat-rejected').innerText = rejectedCount;

            // B. Render "My Recent Applications" (Limit to 5 for UI cleanliness)
            const recentList = document.getElementById('recent-applications-list');
            if (!recentList) return;

            if (applications.length === 0) {
                recentList.innerHTML = `<div class="list-empty-state">You have not submitted any educational assistance applications yet.</div>`;
                return;
            }

            recentList.innerHTML = '';
            applications.slice(0, 5).forEach(app => {
                const title = app.scholarships?.title || app.outside_assistance_name || 'Unknown Program';
                const dateStr = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

                // Determine Badge styling based on status
                let badgeClass = 'badge-pending';
                let iconClass = 'icon-submitted';
                let lucideIcon = 'file-text';

                if (app.status === 'Submitted' || app.status === 'Pending') { badgeClass = 'badge-pending'; iconClass = 'icon-submitted'; lucideIcon = 'file-text'; }
                else if (app.status === 'Under Review') { badgeClass = 'badge-review'; iconClass = 'icon-review'; lucideIcon = 'clock'; }
                else if (app.status === 'Request Revision') { badgeClass = 'badge-revision'; iconClass = 'icon-revision'; lucideIcon = 'edit-3'; }
                else if (app.status === 'Approved' || app.status === 'Grantee') { badgeClass = 'badge-approved'; iconClass = 'icon-approved'; lucideIcon = 'check-circle-2'; }
                else if (app.status === 'Rejected' || app.status === 'Declined' || app.status === 'Revoked') { badgeClass = 'badge-rejected'; iconClass = 'icon-rejected'; lucideIcon = 'x-circle'; }
                else if (app.status === 'Withdrawn') { badgeClass = 'badge-withdrawn'; iconClass = 'icon-withdrawn'; lucideIcon = 'ban'; }

                recentList.innerHTML += `
                    <div class="list-item" style="cursor:pointer;" onclick="window.openApplicationDetails('${app.id}')" title="Click to view full application details">
                        <div class="item-icon ${iconClass}"><i data-lucide="${lucideIcon}"></i></div>
                        <div class="item-details">
                            <h4>${title}</h4>
                            <p>Academic Year ${new Date().getFullYear()}-${new Date().getFullYear() + 1}</p>
                        </div>
                        <div class="item-meta">
                            <span class="badge-status ${badgeClass}">${app.status || 'Submitted'}</span>
                            <span class="meta-date">Applied on ${dateStr}</span>
                        </div>
                    </div>
                `;
            });

            if (window.lucide) { window.lucide.createIcons(); }

        } catch (error) {
            console.error("Error loading applications:", error);
            ['stat-submitted', 'stat-review', 'stat-approved', 'stat-rejected'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('is-loading');
            });
            if (document.getElementById('recent-applications-list')) {
                document.getElementById('recent-applications-list').innerHTML = `<div style="padding:20px; color:var(--danger-color); font-size:13px;">Error loading applications.</div>`;
            }
        }
    }

    // --- 3B. MODAL: APPLICATION DETAILS (Complete Information) ---
    window.openApplicationDetails = (appId) => {
        const app = applicationsData.find(a => a.id === appId);
        if (!app) return;

        const existingModal = document.getElementById('app-details-modal');
        if (existingModal) existingModal.remove();

        let badgeClass = 'badge-review';
        let displayStatus = 'Under Review';
        const statusLower = (app.status || 'pending').toLowerCase();

        if (statusLower === 'approved' || statusLower === 'grantee') {
            badgeClass = 'badge-approved';
            displayStatus = 'Approved';
        } else if (statusLower === 'rejected' || statusLower === 'declined') {
            badgeClass = 'badge-rejected';
            displayStatus = 'Rejected';
        } else if (statusLower === 'revoked') {
            badgeClass = 'badge-rejected';
            displayStatus = 'Revoked';
        } else if (statusLower === 'submitted' || statusLower === 'pending') {
            badgeClass = 'badge-submitted';
            displayStatus = app.status || 'Submitted';
        } else if (statusLower === 'request revision') {
            badgeClass = 'badge-revision';
            displayStatus = 'Revision Required';
        } else if (statusLower === 'withdrawn') {
            badgeClass = 'badge-withdrawn';
            displayStatus = 'Withdrawn';
        }

        const modalTitle = app.scholarships?.title || app.outside_assistance_name || 'Educational Assistance Application';

        // Rejection Reason Alert Card (If application was rejected/declined/revoked or remarks present)
        let rejectionAlertHTML = '';
        if (statusLower === 'rejected' || statusLower === 'declined' || statusLower === 'revoked' || (app.remarks && app.remarks.trim())) {
            const finalReasonText = app.remarks && app.remarks.trim()
                ? app.remarks.trim()
                : 'Your application was not approved during evaluation. Please contact your scholarship coordinator for more details.';

            rejectionAlertHTML = `
                <div class="modal-rejection-box" style="margin-bottom: 24px;">
                    <div class="modal-rejection-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="x-circle" style="width: 18px; height: 18px; color: var(--danger-color);"></i>
                            <strong style="color: var(--danger-color); font-size: 14.5px;">Application Decision: ${displayStatus}</strong>
                        </div>
                        <span class="modal-rejection-tag">Evaluation Outcome</span>
                    </div>
                    <div class="modal-rejection-body">
                        <div class="modal-rejection-label">Reason / Remarks:</div>
                        <p class="modal-rejection-text">${finalReasonText}</p>
                    </div>
                </div>
            `;
        }

        // 1. Applicant Profile Data
        const fname = currentProfile?.first_name || '';
        const mname = currentProfile?.middle_name || '';
        const lname = currentProfile?.last_name || '';
        const name = `${fname} ${mname ? mname + ' ' : ''}${lname}`.trim() || 'Student Name';

        const sid = currentProfile?.id_number || 'N/A';
        const email = currentProfile?.email || 'N/A';
        const dob = currentProfile?.date_of_birth || 'N/A';
        const gender = currentProfile?.gender || 'N/A';
        const contact = currentProfile?.contact_number || 'N/A';
        const address = currentProfile?.address || 'N/A';
        const program = currentProfile?.program || currentProfile?.course || 'N/A';
        const yearLevel = currentProfile?.year_level || 'N/A';

        let profileHTML = `
            <div class="modal-profile-box">
                <div class="modal-profile-grid">
                    <div class="profile-field-row"><strong>Student ID:</strong> <span>${sid}</span></div>
                    <div class="profile-field-row"><strong>Email:</strong> <span>${email}</span></div>
                    
                    <div class="profile-field-row" style="grid-column: 1 / -1;"><strong>Full Name:</strong> <span>${name}</span></div>
                    
                    <div class="profile-field-row"><strong>Date of Birth:</strong> <span>${dob}</span></div>
                    <div class="profile-field-row"><strong>Gender:</strong> <span>${gender}</span></div>
                    
                    <div class="profile-field-row" style="grid-column: 1 / -1;"><strong>Contact Number:</strong> <span>${contact}</span></div>
                    <div class="profile-field-row" style="grid-column: 1 / -1;"><strong>Address:</strong> <span>${address}</span></div>
                    
                    <div class="profile-field-row"><strong>Program:</strong> <span>${program}</span></div>
                    <div class="profile-field-row"><strong>Year Level:</strong> <span>${yearLevel}</span></div>
                </div>
            </div>
        `;

        // 2. Questionnaire Responses
        let formFieldsHTML = '';
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            for (const [question, answer] of Object.entries(app.form_responses)) {
                formFieldsHTML += `
                    <div class="modal-response-box">
                        <div class="modal-response-question">${question}</div>
                        <div class="modal-response-answer">${answer || '<span style="font-style:italic; opacity:0.7;">No response provided</span>'}</div>
                    </div>
                `;
            }
        } else {
            formFieldsHTML = '<div style="padding: 16px; background: var(--bg-card-secondary); border-radius: 10px; color: var(--text-muted); font-size: 13.5px; text-align: center; border: 1px solid var(--border-color);">No questionnaire responses for this application.</div>';
        }

        // 3. Document Uploads & AI Verification
        let docsHTML = '';
        if (app.documents && app.documents.length > 0) {
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';

                const fullViewLink = fileUrl
                    ? `<a href="${fileUrl}" target="_blank" class="modal-doc-link"><i data-lucide="external-link"></i> Full View</a>`
                    : '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().split('?')[0].endsWith('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:320px; border:none; display:block; border-radius: 8px;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; max-height:320px; object-fit:contain; display:block; margin: 0 auto; border-radius: 8px;">`;
                    }
                } else {
                    previewContent = `
                        <div style="padding:40px 20px; text-align:center; color: var(--text-muted);">
                            <i data-lucide="file-x" style="width:32px; height:32px; margin: 0 auto 10px; display:block;"></i>
                            <strong style="display:block;">File preview not available</strong>
                        </div>`;
                }

                let extractedDataHtml = '';
                if (doc.extracted_data && Object.keys(doc.extracted_data).length > 0) {
                    let liHtml = '';

                    for (const [key, value] of Object.entries(doc.extracted_data)) {
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

                        liHtml += `
                            <li style="background:var(--bg-card-secondary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; margin-bottom:8px;">
                                <span style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">${key}</span>
                                <div style="color:var(--text-heading); font-weight:500; font-size:12.5px; line-height:1.4;">${displayValue}</div>
                            </li>
                        `;
                    }

                    extractedDataHtml = `
                        <div class="modal-ai-box" style="flex: 1; min-width: 260px; max-height: 320px; overflow-y: auto;">
                            <div class="modal-ai-box-title">
                                <i data-lucide="sparkles"></i> AI Extracted Information
                            </div>
                            <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column;">
                                ${liHtml}
                            </ul>
                        </div>
                    `;
                }

                docsHTML += `
                    <div class="modal-doc-card">
                        <div class="modal-doc-header">
                            <div class="modal-doc-title"><i data-lucide="paperclip"></i> ${doc.name || 'Submitted Document'}</div>
                            ${fullViewLink}
                        </div>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 260px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-card);">
                                ${previewContent}
                            </div>
                            ${extractedDataHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            docsHTML = '<div style="padding: 16px; background: var(--bg-card-secondary); border-radius: 10px; color: var(--text-muted); font-size: 13.5px; text-align: center; border: 1px solid var(--border-color);">No documents uploaded for this application.</div>';
        }

        const modalHTML = `
            <div id="app-details-modal" class="modal-overlay-custom">
                <div class="modal-dialog-custom">
                    
                    <div class="modal-header-custom">
                        <div>
                            <h2>${modalTitle}</h2>
                            <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                                <span style="font-size: 13px; color: var(--text-muted);">Application ID: ${app.id.substring(0, 8).toUpperCase()}</span>
                                <span class="badge-status ${badgeClass}">${displayStatus}</span>
                            </div>
                        </div>
                        <button class="modal-close-btn" onclick="document.getElementById('app-details-modal')?.remove()" aria-label="Close modal">
                            <i data-lucide="x"></i>
                        </button>
                    </div>

                    <div class="modal-body-custom">
                        ${rejectionAlertHTML}

                        <div style="margin-bottom: 26px;">
                            <h3 class="modal-section-title"><i data-lucide="user"></i> Applicant Profile</h3>
                            ${profileHTML}
                        </div>

                        <div style="margin-bottom: 26px;">
                            <h3 class="modal-section-title"><i data-lucide="clipboard-list"></i> Questionnaire Responses</h3>
                            <div id="read-only-form-fields">
                                ${formFieldsHTML}
                            </div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <h3 class="modal-section-title"><i data-lucide="file-check"></i> Submitted Documents & AI Verification</h3>
                            ${docsHTML}
                        </div>
                    </div>

                    <div class="modal-footer-custom">
                        <button type="button" class="btn-modal-close" onclick="document.getElementById('app-details-modal')?.remove()">Close View</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        if (window.lucide) { window.lucide.createIcons(); }

        // Close on overlay backdrop click
        const modalEl = document.getElementById('app-details-modal');
        if (modalEl) {
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) modalEl.remove();
            });
        }
    };
    window.viewDetails = window.openApplicationDetails;

    // --- 4. FETCH RECOMMENDED SCHOLARSHIPS ---
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

    const calculateDynamicStatus = (sch) => {
        if (sch.status === 'Draft') return 'Draft';
        if (!sch.start_date || !sch.end_date) return sch.status || 'Draft';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(sch.start_date); start.setHours(0, 0, 0, 0);
        const end = new Date(sch.end_date); end.setHours(23, 59, 59, 999);

        if (today < start) return 'Upcoming';
        if (today > end) return 'Closed';
        return 'Active';
    };

    const parseArray = (val) => {
        if (!val || val === 'null' || val === '[]' || val === '[""]') return [];
        let arr = [];
        if (Array.isArray(val)) {
            arr = val.map(String);
        } else if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                arr = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
            } catch (e) {
                arr = val.includes(',') ? val.split(',').map(s => String(s).trim()) : [String(val).trim()];
            }
        }
        return arr.filter(item => item && item.toLowerCase() !== 'null' && item.toLowerCase() !== 'undefined');
    };

    function validateEligibility(sch, profile, isProfileComplete, allUserApps, policyData) {
        // 1. Profile Completion Validation
        if (!isProfileComplete) {
            return {
                text: 'Complete Profile',
                icon: 'user-check',
                class: 'btn-warning',
                action: 'profile',
                title: 'Profile Incomplete',
                msg: 'Please complete your personal and academic profile in Profile Settings before applying for educational assistance.'
            };
        }

        // 2. Duplicate Application Validation for THIS specific scholarship
        const existingApp = allUserApps.find(a => a.scholarship_id === sch.id);
        if (existingApp) {
            const stat = existingApp.status;
            if (stat === 'Draft') {
                return {
                    text: 'Continue Application',
                    icon: 'arrow-right',
                    class: 'btn-primary',
                    action: 'apply',
                    title: '',
                    msg: ''
                };
            }
            return {
                text: 'Already Applied',
                icon: 'check-circle-2',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Already Applied',
                msg: `You already have an existing application (${stat}) for <b>${sch.title}</b>. You can track your application status under My Applications.`
            };
        }

        // 3. Availability Validation (Dates & Status)
        if (sch.display_status === 'Upcoming') {
            return {
                text: 'Opening Soon',
                icon: 'clock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Applications Not Yet Open',
                msg: 'Applications for this educational assistance program have not opened yet. Please check back when the application period starts.'
            };
        }
        if (sch.display_status === 'Closed') {
            return {
                text: 'Closed',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Application Closed',
                msg: 'Applications for this educational assistance program are currently closed because the application deadline has passed.'
            };
        }

        // 4. Availability Validation (Slots)
        const hasUnlimitedSlots = sch.slots === 'Open';
        if (!hasUnlimitedSlots && sch.available_slots === 0) {
            return {
                text: 'Slots Full',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Slots Full',
                msg: 'This educational assistance has reached its maximum beneficiary capacity and no slots remain available.'
            };
        }

        // Categorize existing student applications
        const activeGrants = allUserApps.filter(a =>
            ['Approved', 'Grantee'].includes(a.status)
        );
        const pendingApps = allUserApps.filter(a =>
            ['Submitted', 'Under Review', 'Pending', 'Revision', 'Evaluating', 'For Interview'].includes(a.status)
        );
        const allActiveAndPending = [...activeGrants, ...pendingApps];

        const targetCat = normalizeCategory(sch.category);

        // 5. "No Other Scholarships" Exclusivity Rule
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
                return {
                    text: 'Application Not Allowed',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Application Not Allowed',
                    msg: `Application not allowed because you have a pending application for <b>${pendingTitle}</b>.<br><br>This educational assistance program requires applicants to have no other pending or active scholarship applications.`
                };
            }
            if (activeGrants.length > 0) {
                const activeTitle = activeGrants[0].scholarships?.title || activeGrants[0].outside_assistance_name || 'an active grant';
                return {
                    text: 'Not Eligible (Active Grant)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Application Not Allowed',
                    msg: `Application not allowed because you already hold an active grant (<b>${activeTitle}</b>).<br><br>This educational assistance requires holding no other scholarships.`
                };
            }
        }

        // 6. Institutional Assistance Policies Validation (school_policies)
        // A. Category Quota Limits: Already has a scholarship on this category
        const appsInSameCategory = allActiveAndPending.filter(a => {
            const appCat = getAppCategory(a);
            return appCat === targetCat;
        });

        const isPolicyGloballyEnabled = policyData ? (policyData.global_enabled ?? true) : true;

        if (isPolicyGloballyEnabled) {
            // Check specific category limits from policies or default institutional rules
            const catLimits = policyData?.category_limits || {};
            const catPolicy = catLimits[targetCat];

            if (catPolicy) {
                if (!catPolicy.unlimited) {
                    const maxLimit = typeof catPolicy.limit === 'number' ? catPolicy.limit : 1;
                    if (maxLimit === 0) {
                        return {
                            text: 'Category Disabled',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Category Restricted',
                            msg: `Applications for the <b>${targetCat}</b> category are currently restricted by institutional policy.`
                        };
                    }
                    if (appsInSameCategory.length >= maxLimit) {
                        const existingTitle = appsInSameCategory[0].scholarships?.title || appsInSameCategory[0].outside_assistance_name || 'an existing scholarship';
                        return {
                            text: 'Category Limit Reached',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Category Limit Reached',
                            msg: `You already have an active or pending scholarship under the <b>${targetCat}</b> category (<i>${existingTitle}</i>).<br><br>Institutional policy permits a maximum of ${maxLimit} program(s) in this category.`
                        };
                    }
                }
            } else {
                // Default policy: Institution-Funded & CHED categories allow maximum 1 grant per student
                if (targetCat.includes('Institution') || targetCat.includes('Ched')) {
                    if (appsInSameCategory.length >= 1) {
                        const existingTitle = appsInSameCategory[0].scholarships?.title || appsInSameCategory[0].outside_assistance_name || 'an existing scholarship';
                        return {
                            text: 'Category Limit Reached',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Category Limit Reached',
                            msg: `You already have an active or pending scholarship under the <b>${targetCat}</b> category (<i>${existingTitle}</i>).<br><br>Institutional policy permits only 1 educational assistance in this category.`
                        };
                    }
                }
            }

            // B. Category Combination Rules Check
            if (policyData && policyData.combination_rules) {
                for (let sa of allActiveAndPending) {
                    const existingCat = getAppCategory(sa);
                    if (existingCat && existingCat !== targetCat) {
                        const comboKey = `${existingCat}::${targetCat}`;
                        const comboKeyReverse = `${targetCat}::${existingCat}`;
                        if (policyData.combination_rules[comboKey] === false || policyData.combination_rules[comboKeyReverse] === false) {
                            const existingTitle = sa.scholarships?.title || sa.outside_assistance_name || existingCat;
                            return {
                                text: 'Not Eligible (Policy)',
                                icon: 'lock',
                                class: 'btn-disabled',
                                action: 'restricted',
                                title: 'Combination Not Permitted',
                                msg: `Institutional policy does not allow combining <b>${targetCat}</b> with your existing grant/application in <b>${existingCat}</b> (<i>${existingTitle}</i>).`
                            };
                        }
                    }
                }
            }

            // C. Global Program Limit Check
            if (policyData && policyData.global_limit > 0) {
                if (allActiveAndPending.length >= policyData.global_limit) {
                    return {
                        text: 'Global Limit Reached',
                        icon: 'lock',
                        class: 'btn-disabled',
                        action: 'restricted',
                        title: 'Institutional Limit Reached',
                        msg: `You have reached the maximum number (${policyData.global_limit}) of active or pending educational assistance programs allowed by institutional policy.`
                    };
                }
            }
        }

        // 7. STRICT Program Eligibility Validation
        const rawProgs = parseArray(sch.eligibility_programs);
        const eligibleProgs = rawProgs.map(p => p.toLowerCase().trim());
        const studentProgLower = (profile?.program || profile?.course || '').toLowerCase().trim();
        const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any', 'all'];
        const isProgOpen = eligibleProgs.length === 0 || eligibleProgs.some(p => progOpenKeywords.includes(p));

        if (!isProgOpen) {
            if (!studentProgLower) {
                return {
                    text: 'Not Eligible (Program)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Program Requirement Not Met',
                    msg: 'Please update your academic program in Profile Settings to verify your eligibility for this program.'
                };
            }
            const matchesProg = eligibleProgs.some(p => p === studentProgLower || p.includes(studentProgLower) || studentProgLower.includes(p));
            if (!matchesProg) {
                const allowedProgsText = rawProgs.join(', ');
                return {
                    text: 'Not Eligible (Program)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Program Requirement Not Met',
                    msg: `Your profile indicates you are enrolled in <b>${profile?.program || profile?.course}</b>.<br><br>This educational assistance is strictly limited to students in the following program(s):<br><i>${allowedProgsText}</i>`
                };
            }
        }

        // 8. STRICT Year Level Eligibility Validation
        const rawYears = parseArray(sch.eligibility_years);
        const eligibleYears = rawYears.map(y => y.toLowerCase().trim());
        const studentYearLower = (profile?.year_level || '').toLowerCase().trim();
        const yearOpenKeywords = ['open to all', 'all year levels', 'all years', 'any', 'all'];
        const isYearOpen = eligibleYears.length === 0 || eligibleYears.some(y => yearOpenKeywords.includes(y));

        if (!isYearOpen) {
            if (!studentYearLower) {
                return {
                    text: 'Not Eligible (Year)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Year Level Requirement Not Met',
                    msg: 'Please update your year level in Profile Settings to verify your eligibility for this program.'
                };
            }
            const matchesYear = eligibleYears.some(y => y === studentYearLower || y.includes(studentYearLower) || studentYearLower.includes(y));
            if (!matchesYear) {
                const allowedYearsText = rawYears.join(', ');
                return {
                    text: 'Not Eligible (Year)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Year Level Requirement Not Met',
                    msg: `Your profile indicates you are a <b>${profile?.year_level}</b> student.<br><br>This educational assistance is strictly limited to the following year level(s):<br><i>${allowedYearsText}</i>`
                };
            }
        }

        // 9. STRICT GWA Eligibility Validation
        const minGwa = sch.gwa_requirement || sch.min_gwa || sch.min_college_gwa || sch.min_hs_average || sch.eligibility_rules?.gwa?.minimum || sch.eligibility_gwa;
        if (minGwa && profile?.gwa) {
            const studentGwaNum = parseFloat(profile.gwa);
            const reqGwaNum = parseFloat(minGwa);
            if (!isNaN(studentGwaNum) && !isNaN(reqGwaNum)) {
                if (reqGwaNum <= 5.0) {
                    if (studentGwaNum > reqGwaNum) {
                        return {
                            text: 'Not Eligible (GWA)',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Academic Grade Requirement Not Met',
                            msg: `Your profile indicates a GWA of <b>${profile.gwa}</b>.<br><br>This educational assistance requires a minimum GWA of <b>${minGwa}</b> or better.`
                        };
                    }
                } else if (studentGwaNum < reqGwaNum) {
                    return {
                        text: 'Not Eligible (GWA)',
                        icon: 'lock',
                        class: 'btn-disabled',
                        action: 'restricted',
                        title: 'Academic Grade Requirement Not Met',
                        msg: `Your profile indicates a GWA of <b>${profile.gwa}</b>.<br><br>This educational assistance requires a minimum average of <b>${minGwa}</b>.`
                    };
                }
            }
        }

        // 10. Successful Validation -> Eligible!
        return {
            text: 'Apply Now',
            icon: 'arrow-right',
            class: 'btn-primary',
            action: 'apply',
            title: '',
            msg: ''
        };
    }

    const getScholarshipPriority = (sch, profile, isProfileComplete, allUserApps, policyData) => {
        const btnState = validateEligibility(sch, profile, isProfileComplete, allUserApps, policyData);
        const isClosed = sch.display_status === 'Closed';

        if (btnState.action === 'apply') {
            if (btnState.text === 'Apply Now') return 1;
            if (btnState.text === 'Continue Application') return 2;
            return 3;
        }
        if (btnState.action === 'profile' && !isClosed) {
            return 4;
        }
        if (sch.display_status === 'Upcoming') {
            return 5;
        }
        if (btnState.text.includes('Limit') || btnState.text.includes('Category') || btnState.text.includes('Slots')) {
            return 6;
        }
        if (btnState.text.includes('Not Eligible')) {
            return 7;
        }
        if (btnState.text === 'Already Applied') {
            return 8;
        }
        if (isClosed || btnState.text === 'Closed') {
            return 9;
        }
        return 10;
    };

    async function loadRecommendations() {
        try {
            const recList = document.getElementById('recommended-scholarships-list');
            if (!recList) return;

            // Fetch profile
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            let studentSchoolId = profile ? profile.school_id : null;
            if (profile && profile.id_number) {
                const { data: masterlistData } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id, year_level, program')
                    .eq('id_number', profile.id_number)
                    .maybeSingle();
                if (masterlistData) {
                    if (!studentSchoolId && masterlistData.school_id) studentSchoolId = masterlistData.school_id;
                    if (!profile.year_level && masterlistData.year_level) profile.year_level = masterlistData.year_level;
                    if (!profile.program && masterlistData.program) profile.program = masterlistData.program;
                }
            }

            // Fetch applications with full scholarships join
            const { data: userApps } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships (*)')
                .eq('student_id', studentId);

            const allUserApps = userApps || [];

            // Fetch school policies
            let policyQuery = window.supabaseClient.from('school_policies').select('*');
            if (studentSchoolId) {
                policyQuery = policyQuery.eq('school_id', studentSchoolId);
            }
            const { data: policies } = await policyQuery.maybeSingle();
            const policyData = policies || null;

            // Fetch scholarships
            let schQuery = window.supabaseClient
                .from('scholarships')
                .select('*')
                .neq('status', 'Draft')
                .order('created_at', { ascending: false });

            if (studentSchoolId) {
                schQuery = schQuery.eq('school_id', studentSchoolId);
            }

            let { data: rawScholarships, error } = await schQuery;

            // Fallback if no school-specific scholarships found
            if ((!rawScholarships || rawScholarships.length === 0) && studentSchoolId) {
                const { data: fallbackData } = await window.supabaseClient
                    .from('scholarships')
                    .select('*')
                    .neq('status', 'Draft')
                    .order('created_at', { ascending: false });
                if (fallbackData && fallbackData.length > 0) {
                    rawScholarships = fallbackData;
                }
            }

            if (error && (!rawScholarships || rawScholarships.length === 0)) throw error;

            if (!rawScholarships || rawScholarships.length === 0) {
                recList.innerHTML = `<div class="list-empty-state">No active educational assistance available at the moment.</div>`;
                return;
            }

            // Compute dynamic status for each scholarship
            const scholarshipsWithStatus = rawScholarships.map(sch => ({
                ...sch,
                display_status: calculateDynamicStatus(sch)
            }));

            // Determine if Profile is Complete
            const requiredProfileFields = ['first_name', 'middle_name', 'last_name', 'email', 'id_number', 'date_of_birth', 'gender', 'contact_number', 'address'];
            const isProfileComplete = profile && requiredProfileFields.every(field => profile[field] && profile[field].toString().trim() !== '');

            // STRICT FILTER FOR RECOMMENDED FOR YOU:
            // Do not recommend educational assistance if the student's year level is not eligible (or if scholarship is closed)
            const yearEligibleScholarships = scholarshipsWithStatus.filter(sch => {
                // 1. Year level eligibility validation
                const rawYears = parseArray(sch.eligibility_years);
                const eligibleYears = rawYears.map(y => y.toLowerCase().trim());
                const studentYearLower = (profile?.year_level || '').toLowerCase().trim();
                const yearOpenKeywords = ['open to all', 'all year levels', 'all years', 'any', 'all'];
                const isYearOpen = eligibleYears.length === 0 || eligibleYears.some(y => yearOpenKeywords.includes(y));

                if (!isYearOpen) {
                    if (!studentYearLower) return false;
                    const matchesYear = eligibleYears.some(y => y === studentYearLower || y.includes(studentYearLower) || studentYearLower.includes(y));
                    if (!matchesYear) return false;
                }

                // 2. Do not recommend closed programs
                if (sch.display_status === 'Closed') return false;

                return true;
            });

            if (yearEligibleScholarships.length === 0) {
                recList.innerHTML = `<div class="list-empty-state">No educational assistance currently matches your year level.</div>`;
                return;
            }

            // Sort eligible scholarships using exact priority matching student-scholarships.html
            yearEligibleScholarships.sort((a, b) => {
                const prioA = getScholarshipPriority(a, profile, isProfileComplete, allUserApps, policyData);
                const prioB = getScholarshipPriority(b, profile, isProfileComplete, allUserApps, policyData);
                if (prioA !== prioB) return prioA - prioB;
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });

            // Take Top 2 Recommendations to display
            const recommendedToShow = yearEligibleScholarships.slice(0, 2);

            recList.innerHTML = '';

            recommendedToShow.forEach((sch) => {
                const deadline = sch.end_date ? new Date(sch.end_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No Deadline';
                const cleanDesc = sch.description ? sch.description.replace(/<[^>]*>?/gm, '').substring(0, 70) + '...' : 'Open for applications.';
                const minGwaDisplay = sch.min_college_gwa ? sch.min_college_gwa : 'N/A';

                const btnState = validateEligibility(sch, profile, isProfileComplete, allUserApps, policyData);

                recList.innerHTML += `
                    <div class="list-item rec-list-item">
                        <div class="rec-main-info">
                            <div class="item-icon icon-sch-rec"><i data-lucide="graduation-cap"></i></div>
                            <div class="item-details">
                                <h4>${sch.title}</h4>
                                <p>${cleanDesc}</p>
                                <p class="meta-gwa">Min College GWA: <strong>${minGwaDisplay}</strong></p>
                                <p class="meta-deadline">Deadline: ${deadline}</p>
                            </div>
                        </div>
                        <div class="item-meta">
                            <button class="btn-action ${btnState.class}" data-action="${btnState.action}" data-id="${sch.id}" data-title="${btnState.title || ''}" data-msg="${btnState.msg || ''}">
                                ${btnState.text}
                                <i data-lucide="${btnState.icon}"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            if (window.lucide) { window.lucide.createIcons(); }

        } catch (error) {
            console.error("Error loading recommendations:", error);
            if (document.getElementById('recommended-scholarships-list')) {
                document.getElementById('recommended-scholarships-list').innerHTML = `<div class="list-empty-state" style="color:var(--danger-color);">Error loading recommendations.</div>`;
            }
        }
    }

    // Attach click handler for Recommended for You list items
    const recListContainer = document.getElementById('recommended-scholarships-list');
    if (recListContainer) {
        recListContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-action, .btn-apply');
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');
            const msg = btn.getAttribute('data-msg');
            const title = btn.getAttribute('data-title') || 'Application Restricted';

            if (action === 'restricted') {
                Swal.fire({
                    title: title,
                    html: msg,
                    icon: 'info',
                    confirmButtonText: 'Understood',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)'
                });
            } else if (action === 'profile') {
                Swal.fire({
                    title: 'Profile Incomplete',
                    html: msg,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'Complete Profile',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)'
                }).then((res) => {
                    if (res.isConfirmed) window.location.href = 'profile-settings.html';
                });
            } else if (action === 'view') {
                Swal.fire({
                    title: 'Application Exists',
                    html: msg,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'View Applications',
                    cancelButtonText: 'Close',
                    confirmButtonColor: 'var(--primary-color, #1F3D2E)'
                }).then((res) => {
                    if (res.isConfirmed) window.location.href = 'student-applications.html';
                });
            } else if (action === 'apply') {
                window.location.href = `apply-scholarships.html?id=${id}`;
            }
        });
    }



    // --- 6. DROP-DOWN PROFILE MENU LOGIC ---
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target)) {
                profileMenu.classList.remove('show');
            }
        });
    }

    // --- 7. UNIFIED LOGOUT MODAL LOGIC ---
    const logoutModal = document.getElementById('logout-modal');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    const logoutTriggers = [
        document.getElementById('logout-btn'),
        document.getElementById('dropdown-logout-btn')
    ];

    logoutTriggers.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (logoutModal) logoutModal.style.display = 'flex';
                if (profileMenu) profileMenu.classList.remove('show');
            });
        }
    });

    if (modalCancel) {
        modalCancel.addEventListener('click', () => {
            logoutModal.style.display = 'none';
        });
    }

    if (logoutModal) {
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) logoutModal.style.display = 'none';
        });
    }

    if (modalConfirm) {
        modalConfirm.addEventListener('click', async () => {
            try {
                modalConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                modalConfirm.disabled = true;
                if (window.supabaseClient && window.supabaseClient.auth) {
                    await window.supabaseClient.auth.signOut();
                }
                localStorage.removeItem('studentUser');
                sessionStorage.clear();
                window.location.replace('login-student.html');
            } catch (error) {
                console.error("Logout error:", error);
                window.location.replace('login-student.html');
            }
        });
    }

    // --- 5. FETCH ANNOUNCEMENTS (Top 3 Recent) ---
    async function loadAnnouncements() {
        try {
            const container = document.getElementById('announcements-list-container');
            if (!container) return;

            // Ensure profile is loaded
            let profile = currentProfile;
            if (!profile) {
                const { data: p } = await window.supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', studentId)
                    .single();
                profile = p;
                currentProfile = p;
            }

            // Resolve school_id with fallback to enrolled_masterlist
            let schoolId = profile?.school_id;
            if (!schoolId && profile?.id_number) {
                const { data: masterlistData } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id')
                    .eq('id_number', profile.id_number)
                    .single();
                if (masterlistData && masterlistData.school_id) {
                    schoolId = masterlistData.school_id;
                    if (profile) profile.school_id = schoolId;
                }
            }

            let query = window.supabaseClient
                .from('announcements')
                .select('*, profiles:author_id ( first_name, last_name, avatar_url, role ), announcement_comments ( id )')
                .eq('status', 'Published')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (schoolId) {
                query = query.eq('school_id', schoolId);
            }

            const { data: announcements, error } = await query;

            if (error) throw error;

            if (!announcements || announcements.length === 0) {
                container.innerHTML = `
                    <div class="list-empty-state">
                        <i data-lucide="megaphone-off" style="width: 28px; height: 28px; margin: 0 auto 8px auto; display: block; opacity: 0.5;"></i>
                        No announcements available at the moment.
                    </div>
                `;
                if (window.lucide) { window.lucide.createIcons(); }
                return;
            }

            function isAudienceMatch(announcement, pProfile, applications) {
                const aud = announcement.audience_type;
                if (!aud) return true;

                const audStr = aud.toLowerCase().trim();

                if (audStr === 'all_students' || audStr === 'all_enrolled_students' || audStr === 'all') return true;

                const studentProg = (pProfile?.program || pProfile?.course || '').toLowerCase().trim();
                if (audStr.startsWith('prog_') && studentProg) {
                    const targetProg = audStr.replace('prog_', '').toLowerCase().trim();
                    return studentProg === targetProg || studentProg.includes(targetProg) || targetProg.includes(studentProg);
                }

                if (audStr.startsWith('app_')) {
                    const scholarshipKeyword = audStr.replace('app_', '').toLowerCase().trim();
                    if (applications && applications.length > 0) {
                        return applications.some(app => {
                            const title = app.scholarships?.title?.toLowerCase() || '';
                            return title.includes(scholarshipKeyword);
                        });
                    }
                    return false;
                }

                if (audStr.includes('active') || audStr.includes('approved') || audStr.includes('grantee')) {
                    if (applications && applications.length > 0) {
                        return applications.some(app => {
                            const st = (app.status || '').toLowerCase();
                            return st === 'approved' || st === 'grantee';
                        });
                    }
                    return pProfile && pProfile.is_approved === true;
                }

                if (audStr.includes('pending')) {
                    if (applications && applications.length > 0) {
                        return applications.some(app => (app.status || '').toLowerCase() === 'pending');
                    }
                    return pProfile && pProfile.is_approved === false;
                }

                if (audStr.includes('rejected')) {
                    if (applications && applications.length > 0) {
                        return applications.some(app => (app.status || '').toLowerCase() === 'rejected');
                    }
                    return false;
                }

                return false;
            }

            const userApps = applicationsData || [];
            let filtered = announcements.filter(ann => isAudienceMatch(ann, profile, userApps));

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="list-empty-state">
                        <i data-lucide="megaphone-off" style="width: 28px; height: 28px; margin: 0 auto 8px auto; display: block; opacity: 0.5;"></i>
                        No announcements available for you at the moment.
                    </div>
                `;
                if (window.lucide) { window.lucide.createIcons(); }
                return;
            }

            container.innerHTML = '';

            // Strictly display only 3 recent announcement posts on the student dashboard
            const top3Announcements = filtered.slice(0, 3);

            top3Announcements.forEach(ann => {
                const dateStr = new Date(ann.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });

                // Clean plain text excerpt
                let tempDiv = document.createElement("div");
                tempDiv.innerHTML = ann.content || "";
                let excerpt = tempDiv.textContent || tempDiv.innerText || "";
                excerpt = excerpt.replace(/\s+/g, ' ').trim();
                if (excerpt.length > 130) excerpt = excerpt.substring(0, 130) + '...';
                if (!excerpt) excerpt = 'Click to read full announcement details.';

                let authorName = "Coordinator";
                if (ann.profiles) {
                    const fn = ann.profiles.first_name || '';
                    const ln = ann.profiles.last_name || '';
                    authorName = `${fn} ${ln}`.trim() || authorName;
                }

                const isPinned = ann.is_pinned === true;
                const pinnedBadge = isPinned ? `<span class="badge-pinned-tag"><i data-lucide="pin" style="width: 11px; height: 11px;"></i> Pinned</span>` : '';

                let catClass = 'tag-cat-general';
                const catLower = (ann.category || '').toLowerCase();
                if (catLower.includes('educational') || catLower.includes('assistance') || catLower.includes('scholarship')) {
                    catClass = 'tag-cat-edu';
                } else if (catLower.includes('reminder') || catLower.includes('urgent')) {
                    catClass = 'tag-cat-reminder';
                } else if (catLower.includes('event')) {
                    catClass = 'tag-cat-event';
                }

                const commentCount = ann.announcement_comments ? ann.announcement_comments.length : 0;
                const commentCountBadge = commentCount > 0 ?
                    `<span class="meta-dot">&bull;</span><span class="meta-comments"><i data-lucide="message-square" style="width:12px;height:12px;"></i> ${commentCount}</span>` : '';

                container.innerHTML += `
                    <div class="list-item announcement-list-item" style="cursor:pointer;" onclick="openAnnouncementDetails('${ann.id}')">
                        <div class="item-icon icon-announcement-item"><i data-lucide="megaphone"></i></div>
                        <div class="item-details">
                            <div class="announcement-item-top">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0;">
                                    <h4 class="announcement-title">${ann.title || 'Untitled Announcement'}</h4>
                                    ${pinnedBadge}
                                    <span class="badge-cat-tag ${catClass}">${ann.category || 'General'}</span>
                                </div>
                            </div>
                            <p class="announcement-excerpt">${excerpt}</p>
                            <div class="announcement-item-meta">
                                <span class="meta-author"><i data-lucide="user" style="width:12px;height:12px;"></i> ${authorName}</span>
                                <span class="meta-dot">&bull;</span>
                                <span class="meta-date"><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${dateStr}</span>
                                ${commentCountBadge}
                            </div>
                        </div>
                        <div class="item-meta announcement-meta-action">
                            <button type="button" class="btn-read-announcement" aria-label="Read Announcement">
                                <span>Read</span>
                                <i data-lucide="chevron-right" style="width:14px;height:14px;"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            if (window.lucide) { window.lucide.createIcons(); }

        } catch (error) {
            console.error("Error loading announcements:", error);
            if (document.getElementById('announcements-list-container')) {
                document.getElementById('announcements-list-container').innerHTML = `<div class="list-empty-state" style="color:var(--danger-color);">Error loading announcements.</div>`;
            }
        }
    }

    // --- ANNOUNCEMENT DETAILS MODAL ON DASHBOARD ---
    window.openAnnouncementDetails = async function (annId) {
        try {
            const { data: ann, error } = await window.supabaseClient
                .from('announcements')
                .select('*, profiles:author_id ( first_name, last_name, avatar_url, role )')
                .eq('id', annId)
                .single();

            if (error || !ann) {
                console.error("Error fetching announcement details:", error);
                window.location.href = `student-announcements.html?id=${annId}`;
                return;
            }

            const existingModal = document.getElementById('ann-details-modal');
            if (existingModal) existingModal.remove();

            const dateStr = new Date(ann.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });

            let authorName = "Scholarship Coordinator";
            if (ann.profiles) {
                authorName = `${ann.profiles.first_name || ''} ${ann.profiles.last_name || ''}`.trim() || authorName;
            }

            const isPinned = ann.is_pinned === true;
            const pinnedBadge = isPinned ? `<span class="badge-status badge-approved" style="display:inline-flex; align-items:center; gap:4px;"><i data-lucide="pin" style="width:12px;height:12px;"></i> Pinned</span>` : '';

            // Handle images
            let imageUrls = ann.image_urls;
            if (typeof imageUrls === 'string') {
                try { imageUrls = JSON.parse(imageUrls); } catch (e) { imageUrls = imageUrls ? [imageUrls] : []; }
            }
            if (!Array.isArray(imageUrls)) imageUrls = [];

            let imagesHTML = '';
            if (imageUrls.length > 0) {
                imagesHTML = `
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 16px;">
                        ${imageUrls.map(url => `
                            <a href="${url}" target="_blank" style="display: block; border-radius: 10px; overflow: hidden; border: 1px solid var(--border-color);">
                                <img src="${url}" alt="Announcement attachment" style="width: 100%; height: 160px; object-fit: cover; display: block;">
                            </a>
                        `).join('')}
                    </div>
                `;
            }

            const modalHTML = `
                <div id="ann-details-modal" class="modal-overlay-custom">
                    <div class="modal-dialog-custom" style="max-width: 680px;">
                        <div class="modal-header-custom">
                            <div>
                                <h2>${ann.title || 'Announcement'}</h2>
                                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px;">
                                    <span style="font-size: 13px; color: var(--text-muted);"><i data-lucide="calendar" style="width:13px; height:13px; display:inline-block; vertical-align:middle; margin-right:3px;"></i>${dateStr}</span>
                                    <span style="font-size: 13px; color: var(--text-muted);">&bull;</span>
                                    <span style="font-size: 13px; color: var(--text-muted);"><i data-lucide="user" style="width:13px; height:13px; display:inline-block; vertical-align:middle; margin-right:3px;"></i>${authorName}</span>
                                    ${pinnedBadge}
                                </div>
                            </div>
                            <button class="modal-close-btn" onclick="document.getElementById('ann-details-modal')?.remove()" aria-label="Close modal">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                        <div class="modal-body-custom">
                            <div class="announcement-modal-body-content" style="font-size: 14.5px; line-height: 1.65; color: var(--text-main); word-break: break-word;">
                                ${ann.content || '<p style="color:var(--text-muted);">No content.</p>'}
                            </div>
                            ${imagesHTML}
                        </div>
                        <div class="modal-footer-custom" style="display: flex; justify-content: flex-end; align-items: center; padding: 18px 28px; border-top: 1px solid var(--border-color); background: var(--card-bg);">
                            <button type="button" class="btn-modal-close" onclick="document.getElementById('ann-details-modal')?.remove()">Close</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHTML);
            if (window.lucide) { window.lucide.createIcons(); }

            const modalEl = document.getElementById('ann-details-modal');
            if (modalEl) {
                modalEl.addEventListener('click', (e) => {
                    if (e.target === modalEl) modalEl.remove();
                });
            }
        } catch (err) {
            console.error("Error opening announcement details:", err);
            window.location.href = `student-announcements.html?id=${annId}`;
        }
    };

    // --- INIT ---
    loadProfile();
    loadApplications();
    loadRecommendations();
    loadAnnouncements();

    if (window.lucide) { window.lucide.createIcons(); }
});