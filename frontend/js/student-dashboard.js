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

                // Step 2: Use their id_number to fetch authoritative masterlist details
                let masterFirstName = profile.first_name || 'Student';
                let masterMiddleName = profile.middle_name || '';
                let masterLastName = profile.last_name || '';
                let masterProgram = profile.program || profile.course || 'Student Profile';
                let masterYear = profile.year_level || '';
                let masterGender = profile.gender || '';
                let schoolName = 'Unassigned School';

                if (profile.id_number) {
                    const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                        .from('enrolled_masterlist')
                        .select('school_id, schools(name), first_name, last_name, middle_name, program, year_level, gender, gwa')
                        .eq('id_number', profile.id_number)
                        .maybeSingle();

                    if (masterlistData) {
                        if (masterlistData.schools) schoolName = masterlistData.schools.name;
                        if (masterlistData.school_id) currentProfile.school_id = masterlistData.school_id;
                        if (masterlistData.first_name) masterFirstName = masterlistData.first_name;
                        if (masterlistData.last_name) masterLastName = masterlistData.last_name;
                        if (masterlistData.middle_name !== undefined && masterlistData.middle_name !== null) masterMiddleName = masterlistData.middle_name;
                        if (masterlistData.program) masterProgram = masterlistData.program;
                        if (masterlistData.year_level) masterYear = masterlistData.year_level;
                        if (masterlistData.gender) masterGender = masterlistData.gender;
                        if (!profile.gwa && masterlistData.gwa) profile.gwa = masterlistData.gwa;

                        // Silent sync to profile table if coordinator updated records
                        const needsSync = (
                            (profile.first_name || '') !== (masterFirstName || '') ||
                            (profile.last_name || '') !== (masterLastName || '') ||
                            (profile.middle_name || '') !== (masterMiddleName || '') ||
                            (profile.program || '') !== (masterProgram || '') ||
                            (profile.year_level || '') !== (masterYear || '') ||
                            (profile.gender || '') !== (masterGender || '') ||
                            (masterlistData.school_id && profile.school_id !== masterlistData.school_id)
                        );

                        if (needsSync) {
                            const syncData = {
                                first_name: masterFirstName,
                                last_name: masterLastName,
                                middle_name: masterMiddleName,
                                program: masterProgram,
                                year_level: masterYear,
                                gender: masterGender
                            };
                            if (masterlistData.school_id) syncData.school_id = masterlistData.school_id;
                            window.supabaseClient.from('profiles').update(syncData).eq('id', studentId).then();
                            Object.assign(currentProfile, syncData);
                        }
                    } else if (masterlistError) {
                        console.warn("Could not find student in masterlist to assign school.");
                    }
                }

                // Update UI Elements
                const firstName = masterFirstName;
                const lastName = masterLastName;
                const fullName = `${firstName} ${lastName}`.trim();
                const progName = masterProgram;

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

            const applications = apps || [];
            applicationsData = applications; // Save globally for details modal

            // A. Update Overview Stats & Remove Skeleton Shimmer
            const submittedCount = applications.length;
            const reviewCount = applications.filter(a => {
                const st = (a.status || 'pending').toLowerCase();
                return st === 'pending' || st === 'under review' || st === 'submitted' || st === 'request revision';
            }).length;
            const approvedCount = applications.filter(a => {
                const st = (a.status || '').toLowerCase();
                return st === 'approved' || st === 'grantee' || st === 'passed';
            }).length;
            const rejectedCount = applications.filter(a => {
                const st = (a.status || '').toLowerCase();
                return st === 'rejected' || st === 'declined' || st === 'revoked';
            }).length;

            ['stat-submitted', 'stat-review', 'stat-approved', 'stat-rejected'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('is-loading');
            });

            if (document.getElementById('stat-submitted')) document.getElementById('stat-submitted').innerText = submittedCount;
            if (document.getElementById('stat-review')) document.getElementById('stat-review').innerText = reviewCount;
            if (document.getElementById('stat-approved')) document.getElementById('stat-approved').innerText = approvedCount;
            if (document.getElementById('stat-rejected')) document.getElementById('stat-rejected').innerText = rejectedCount;

            // B. Render "My Recent Applications" (Only student-submitted applications; coordinator-added ones are notified via in-app/email alerts)
            const recentList = document.getElementById('recent-applications-list');
            if (!recentList) return;

            const studentSubmittedApps = applications.filter(app => app.form_responses !== null);

            if (studentSubmittedApps.length === 0) {
                recentList.innerHTML = `<div class="list-empty-state">You have not submitted any educational assistance applications yet.</div>`;
                return;
            }

            recentList.innerHTML = '';
            studentSubmittedApps.slice(0, 5).forEach(app => {
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

        if (statusLower === 'approved' || statusLower === 'grantee' || statusLower === 'passed') {
            badgeClass = 'badge-approved';
            displayStatus = statusLower === 'grantee' ? 'Active Grantee' : 'Approved';
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

        // Decision / Status Alert Card
        let decisionAlertHTML = '';
        if (statusLower === 'rejected' || statusLower === 'declined' || statusLower === 'revoked') {
            const isRevoked = statusLower === 'revoked';
            const defaultMsg = isRevoked
                ? 'Educational assistance status was revoked by the institution.'
                : 'Your application was not approved during evaluation. Please contact your scholarship coordinator for more details.';
            const finalReasonText = app.remarks && app.remarks.trim() ? app.remarks.trim() : defaultMsg;
            const decisionHeading = isRevoked ? 'Beneficiary Status: Revoked' : 'Application Decision: Rejected';
            const reasonLabel = isRevoked ? 'Reason for Revocation:' : 'Reason for Rejection:';

            decisionAlertHTML = `
                <div class="modal-rejection-box" style="margin-bottom: 24px;">
                    <div class="modal-rejection-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="x-circle" style="width: 18px; height: 18px; color: var(--danger-color);"></i>
                            <strong style="color: var(--danger-color); font-size: 14.5px;">${decisionHeading}</strong>
                        </div>
                        <span class="modal-rejection-tag">${isRevoked ? 'Revoked' : 'Evaluation Outcome'}</span>
                    </div>
                    <div class="modal-rejection-body">
                        <div class="modal-rejection-label">${reasonLabel}</div>
                        <p class="modal-rejection-text">${finalReasonText}</p>
                    </div>
                </div>
            `;
        } else if (statusLower === 'approved' || statusLower === 'grantee' || statusLower === 'passed') {
            const isGrantee = statusLower === 'grantee';
            const decisionHeading = isGrantee ? 'Beneficiary Status: Active Grantee' : 'Application Decision: Approved';
            const defaultMsg = 'Congratulations! Your educational assistance application has been approved and you are currently an active grantee.';
            const remarksText = app.remarks && app.remarks.trim() ? app.remarks.trim() : defaultMsg;
            const remarksLabel = app.remarks && app.remarks.trim() ? 'Coordinator Remarks / Notes:' : 'Status Details:';

            decisionAlertHTML = `
                <div class="modal-approved-box" style="margin-bottom: 24px;">
                    <div class="modal-approved-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="check-circle-2" style="width: 18px; height: 18px; color: var(--stat-approved-color);"></i>
                            <strong style="color: var(--stat-approved-color); font-size: 14.5px;">${decisionHeading}</strong>
                        </div>
                        <span class="modal-approved-tag">${isGrantee ? 'Active Beneficiary' : 'Approved'}</span>
                    </div>
                    <div class="modal-approved-body">
                        <div class="modal-approved-label">${remarksLabel}</div>
                        <p class="modal-approved-text">${remarksText}</p>
                    </div>
                </div>
            `;
        } else if (statusLower === 'request revision') {
            const revisionText = app.remarks && app.remarks.trim()
                ? app.remarks.trim()
                : 'Please review your application documents and resubmit the requested revisions.';

            decisionAlertHTML = `
                <div class="modal-revision-box" style="margin-bottom: 24px;">
                    <div class="modal-revision-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="alert-triangle" style="width: 18px; height: 18px; color: var(--badge-revision-color, #d97706);"></i>
                            <strong style="color: var(--badge-revision-color, #d97706); font-size: 14.5px;">Application Decision: Revision Required</strong>
                        </div>
                        <span class="modal-revision-tag">Action Required</span>
                    </div>
                    <div class="modal-revision-body">
                        <div class="modal-revision-label">Coordinator Revision Instructions:</div>
                        <p class="modal-revision-text">${revisionText}</p>
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
                        ${decisionAlertHTML}

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

    const escapeHtml = (str) => {
        if (!str || typeof str !== 'string') return str || '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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

    // --- ACADEMIC ELIGIBILITY & MATCHING HELPERS ---
    const checkProgramMatch = (rawEligibleProgs, studentProg) => {
        const rawProgs = parseArray(rawEligibleProgs);
        if (!rawProgs || rawProgs.length === 0) return { matches: true, allowedText: 'Open to All' };

        const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any', 'all', 'all courses', 'all degree programs', 'open to all courses', 'open to all programs', 'open to all departments'];
        const isProgOpen = rawProgs.some(p => progOpenKeywords.includes(p.toLowerCase().trim()));
        if (isProgOpen) return { matches: true, allowedText: 'Open to All' };

        const studentProgClean = (studentProg || '').trim();
        const allowedText = rawProgs.join(', ');
        if (!studentProgClean) {
            return {
                matches: false,
                reason: 'missing_profile',
                allowedText: allowedText
            };
        }

        const sLower = studentProgClean.toLowerCase();
        const words = studentProgClean.split(/[\s\-_/()]+/).filter(w => w.length > 0);
        const sAcronym = words.map(w => w[0].toLowerCase()).join('');

        const matches = rawProgs.some(rawP => {
            const pLower = rawP.toLowerCase().trim();
            if (pLower === sLower) return true;
            if (pLower.includes(sLower) || sLower.includes(pLower)) return true;

            const pWords = rawP.split(/[\s\-_/()]+/).filter(w => w.length > 0);
            const pAcronym = pWords.map(w => w[0].toLowerCase()).join('');
            if (pAcronym.length >= 2 && (pAcronym === sLower || pAcronym === sAcronym)) return true;
            if (sAcronym.length >= 2 && (sAcronym === pLower || sAcronym === pAcronym)) return true;

            return false;
        });

        return {
            matches: matches,
            reason: matches ? 'matched' : 'mismatch',
            allowedText: allowedText
        };
    };

    const checkYearMatch = (rawEligibleYears, studentYear) => {
        const rawYears = parseArray(rawEligibleYears);
        if (!rawYears || rawYears.length === 0) return { matches: true, allowedText: 'Open to All' };

        const yearOpenKeywords = ['open to all', 'all year levels', 'all years', 'any', 'all', 'open to all year levels'];
        const isYearOpen = rawYears.some(y => yearOpenKeywords.includes(y.toLowerCase().trim()));
        if (isYearOpen) return { matches: true, allowedText: 'Open to All' };

        const studentYearClean = (studentYear || '').trim();
        const allowedText = rawYears.join(', ');
        if (!studentYearClean) {
            return {
                matches: false,
                reason: 'missing_profile',
                allowedText: allowedText
            };
        }

        const canonicalYear = (str) => {
            const lower = (str || '').toLowerCase().trim();
            if (lower.includes('1st') || lower.includes('first') || lower.includes('grade 11') || lower.includes('freshman') || lower === '1') return '1';
            if (lower.includes('2nd') || lower.includes('second') || lower.includes('grade 12') || lower.includes('sophomore') || lower === '2') return '2';
            if (lower.includes('3rd') || lower.includes('third') || lower.includes('junior') || lower === '3') return '3';
            if (lower.includes('4th') || lower.includes('fourth') || lower.includes('senior') || lower === '4') return '4';
            if (lower.includes('5th') || lower.includes('fifth') || lower === '5') return '5';
            if (lower.includes('graduat')) return 'graduating';
            return lower;
        };

        const sCanonical = canonicalYear(studentYearClean);

        const matches = rawYears.some(rawY => {
            const yLower = rawY.toLowerCase().trim();
            if (yLower === studentYearClean.toLowerCase()) return true;
            if (yLower.includes(studentYearClean.toLowerCase()) || studentYearClean.toLowerCase().includes(yLower)) return true;

            const yCanonical = canonicalYear(rawY);
            if (yCanonical && sCanonical && yCanonical === sCanonical) return true;

            return false;
        });

        return {
            matches: matches,
            reason: matches ? 'matched' : 'mismatch',
            allowedText: allowedText
        };
    };

    const checkGwaMatch = (sch, studentGwa) => {
        const minGwa = sch.gwa_requirement || sch.min_gwa || sch.min_college_gwa || sch.min_hs_average || sch.eligibility_rules?.gwa?.minimum || sch.eligibility_gwa;
        if (!minGwa || !studentGwa) return { matches: true, requiredGwa: minGwa };

        const studentGwaNum = parseFloat(studentGwa);
        const reqGwaNum = parseFloat(minGwa);

        if (isNaN(studentGwaNum) || isNaN(reqGwaNum)) return { matches: true, requiredGwa: minGwa };

        let matches = true;
        if (reqGwaNum <= 5.0) {
            // Philippine grading scale: 1.0 is highest, 5.0 is failing. GWA must be <= requirement (e.g. 1.50 <= 1.75)
            matches = studentGwaNum <= reqGwaNum;
        } else {
            // Percentage scale: e.g. 85, 90. GWA must be >= requirement (e.g. 88 >= 85)
            matches = studentGwaNum >= reqGwaNum;
        }

        return {
            matches: matches,
            requiredGwa: minGwa,
            studentGwa: studentGwa
        };
    };

    const checkGenderMatch = (rawEligibleGender, studentGender) => {
        if (!rawEligibleGender) return { matches: true };
        const gLower = rawEligibleGender.toLowerCase().trim();
        if (!gLower || gLower === 'all' || gLower === 'any' || gLower === 'open to all' || gLower === 'both' || gLower === 'null') return { matches: true };

        const sLower = (studentGender || '').toLowerCase().trim();
        if (!sLower) return { matches: true };

        const matches = (gLower === sLower || gLower.includes(sLower) || sLower.includes(gLower));
        return {
            matches: matches,
            requiredGender: rawEligibleGender
        };
    };

    function validateEligibility(sch, profile, isProfileComplete, allUserApps, policyData) {
        // 1. Availability / Dates Check
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

        // 2. Slots Capacity Check
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

        // 3. Duplicate / Existing Application for this scholarship
        const existingApp = (allUserApps || []).find(a => a.scholarship_id === sch.id);
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

        // Categorize existing student applications
        const activeGrants = (allUserApps || []).filter(a =>
            ['Approved', 'Grantee'].includes(a.status)
        );
        const pendingApps = (allUserApps || []).filter(a =>
            ['Submitted', 'Under Review', 'Pending', 'Revision', 'Evaluating', 'For Interview'].includes(a.status)
        );
        const allActiveAndPending = [...activeGrants, ...pendingApps];
        const targetCat = normalizeCategory(sch.category);

        // 4. "No Other Scholarships" Exclusivity Rule
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

        // 5. Institutional Assistance Policies Validation (school_policies)
        const isPolicyGloballyEnabled = policyData ? (policyData.global_enabled ?? true) : true;
        if (isPolicyGloballyEnabled) {
            // A. Category Quota Limits
            const appsInSameCategory = allActiveAndPending.filter(a => {
                const appCat = getAppCategory(a);
                return appCat === targetCat;
            });

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

        // 6. Strict Academic Information Alignment:
        // A. Academic Program / Course
        const studentProgram = profile?.program || profile?.course || '';
        const progMatch = checkProgramMatch(sch.eligibility_programs, studentProgram);
        if (!progMatch.matches) {
            if (progMatch.reason === 'missing_profile') {
                return {
                    text: 'Not Eligible (Program)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Program Requirement Not Met',
                    msg: 'Please update your academic program in Profile Settings to verify your eligibility for this program.'
                };
            }
            return {
                text: 'Not Eligible (Program)',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Program Requirement Not Met',
                msg: `Your profile indicates you are enrolled in <b>${escapeHtml(studentProgram)}</b>.<br><br>This educational assistance is strictly limited to students in the following program(s):<br><i>${escapeHtml(progMatch.allowedText)}</i>`
            };
        }

        // B. Academic Year Level
        const studentYear = profile?.year_level || '';
        const yearMatch = checkYearMatch(sch.eligibility_years, studentYear);
        if (!yearMatch.matches) {
            if (yearMatch.reason === 'missing_profile') {
                return {
                    text: 'Not Eligible (Year)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Year Level Requirement Not Met',
                    msg: 'Please update your year level in Profile Settings to verify your eligibility for this program.'
                };
            }
            return {
                text: 'Not Eligible (Year)',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Year Level Requirement Not Met',
                msg: `Your profile indicates you are a <b>${escapeHtml(studentYear)}</b> student.<br><br>This educational assistance is strictly limited to the following year level(s):<br><i>${escapeHtml(yearMatch.allowedText)}</i>`
            };
        }

        // C. Gender Requirement
        const studentGender = profile?.gender || '';
        const genderMatch = checkGenderMatch(sch.eligibility_gender || sch.gender, studentGender);
        if (!genderMatch.matches) {
            return {
                text: 'Not Eligible (Gender)',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Gender Requirement Not Met',
                msg: `This educational assistance is restricted to <b>${escapeHtml(genderMatch.requiredGender)}</b> applicants.`
            };
        }

        // 7. Profile Completion Check
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

        // 8. Fully Eligible & Ready to Apply!
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
                    .select('school_id, year_level, program, gender, gwa')
                    .eq('id_number', profile.id_number)
                    .maybeSingle();
                if (masterlistData) {
                    if (!studentSchoolId && masterlistData.school_id) studentSchoolId = masterlistData.school_id;
                    if (!profile.year_level && masterlistData.year_level) profile.year_level = masterlistData.year_level;
                    if (!profile.program && masterlistData.program) profile.program = masterlistData.program;
                    if (!profile.gender && masterlistData.gender) profile.gender = masterlistData.gender;
                    if (!profile.gwa && masterlistData.gwa) profile.gwa = masterlistData.gwa;
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
                const countEl = document.getElementById('recommended-scholarships-count');
                if (countEl) countEl.innerText = '0';
                return;
            }

            // Compute dynamic status for each scholarship
            const scholarshipsWithStatus = rawScholarships.map(sch => ({
                ...sch,
                display_status: calculateDynamicStatus(sch)
            }));

            // Determine if Profile is Complete (Middle name is optional as some students don't have one)
            const requiredProfileFields = ['first_name', 'last_name', 'email', 'id_number', 'date_of_birth', 'gender', 'contact_number', 'address'];
            const isProfileComplete = profile && requiredProfileFields.every(field => profile[field] && profile[field].toString().trim() !== '');

            // STRICT FILTER FOR "RECOMMENDED FOR YOU":
            // 1. Must be Active
            // 2. Must strictly meet GWA requirement (do not put on Recommended for You if grade requirement is not met)
            // 3. Must strictly match degree program, year level, gender, and school
            // 4. Must be okay to apply (action !== 'restricted' — no already applied, no quota limits reached, no exclusivity violations)
            const eligibleRecommendations = scholarshipsWithStatus.filter(sch => {
                // Must be Active
                if (sch.display_status !== 'Active') return false;

                // Academic Grade Requirement check: Do not recommend if current GWA does not meet requirement
                const studentGwa = profile?.gwa || profile?.general_weighted_average;
                const gwaMatch = checkGwaMatch(sch, studentGwa);
                if (!gwaMatch.matches) return false;

                // Validate eligibility against student's academic profile & policies
                const btnState = validateEligibility(sch, profile, isProfileComplete, allUserApps, policyData);

                // Exclude any non-actionable or restricted scholarship
                if (btnState.action === 'restricted') return false;

                return true;
            });

            // Populate Section Header Count
            const countEl = document.getElementById('recommended-scholarships-count');
            if (countEl) countEl.innerText = eligibleRecommendations.length.toString();

            if (eligibleRecommendations.length === 0) {
                recList.innerHTML = `<div class="list-empty-state">No educational assistance currently matches your academic profile at this time.</div>`;
                return;
            }

            // Sort Recommended:
            // 1st: "Apply Now" (highest priority)
            // 2nd: "Continue Application"
            // 3rd: "Complete Profile"
            eligibleRecommendations.sort((a, b) => {
                const prioA = getScholarshipPriority(a, profile, isProfileComplete, allUserApps, policyData);
                const prioB = getScholarshipPriority(b, profile, isProfileComplete, allUserApps, policyData);
                if (prioA !== prioB) return prioA - prioB;
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            });

            recList.innerHTML = '';
            eligibleRecommendations.forEach(sch => {
                const deadline = sch.end_date ? new Date(sch.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Deadline';
                const departmentMeta = sch.department ? `<p class="item-meta">${escapeHtml(sch.department)}</p>` : '';
                const btnState = validateEligibility(sch, profile, isProfileComplete, allUserApps, policyData);

                recList.innerHTML += `
                    <div class="list-item rec-list-item">
                        <div class="rec-main-info">
                            <div class="item-icon icon-sch-rec">
                                <i data-lucide="graduation-cap"></i>
                            </div>
                            <div class="item-details">
                                <h4 class="item-title">${escapeHtml(sch.title)}</h4>
                                ${departmentMeta}
                                <p class="meta-deadline">Deadline: ${deadline}</p>
                            </div>
                        </div>
                        <div class="item-meta">
                            <button class="btn-action ${btnState.class}" data-action="${btnState.action}" data-id="${sch.id}" data-title="${escapeHtml(btnState.title || '')}" data-msg="${escapeHtml(btnState.msg || '')}">
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
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: title,
                        html: msg,
                        icon: 'info',
                        confirmButtonText: 'Understood',
                        confirmButtonColor: 'var(--primary-color, #1F3D2E)'
                    });
                } else {
                    alert(title + "\n\n" + msg);
                }
            } else if (action === 'profile') {
                // Directly direct the student to profile-settings.html without unnecessary modal
                window.location.href = 'profile-settings.html';
            } else if (action === 'view') {
                if (typeof Swal !== 'undefined') {
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
                } else {
                    window.location.href = 'student-applications.html';
                }
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