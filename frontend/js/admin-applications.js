(async function () {
    // Clean up any dangling flatpickr elements or dropdowns left over from other pages
    document.querySelectorAll('.flatpickr-calendar:not(.open):not(.inline), select.flatpickr-monthDropdown-months, .flatpickr-wrapper').forEach(el => el.remove());

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    let allScholarships = [];
    let currentApplications = [];
    let currentFilteredApps = [];
    let activeScholarshipData = null;
    let activeTabStatus = 'Pending';
    let activeIndividualAppId = null;
    let currentAdminSchoolId = null;
    let currentAdminSchool = null;
    let currentAdminRole = null;

    const formatText = (text, rule) => {
        if (!text || typeof text !== 'string') return text;
        if (rule === 'UPPERCASE') return text.toUpperCase();
        if (rule === 'lowercase') return text.toLowerCase();
        if (rule === 'Capitalize Each Word') return text.replace(/\b\w/g, (char) => char.toUpperCase());
        return text;
    };

    const normalizeApplicantStatus = (status) => {
        const value = (status || '').toString().trim().toLowerCase();
        if (value === 'grantee') return 'approved';
        if (value === 'declined') return 'rejected';
        return value;
    };

    const getDisplayStatus = (status) => {
        const normalized = normalizeApplicantStatus(status);
        if (normalized === 'approved') return 'Approved';
        if (normalized === 'rejected' || normalized === 'declined') return 'Rejected';
        if (normalized === 'pending' || normalized === 'under review') return 'Pending';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    };

    const renderFormattedAnswer = (value, field) => {
        if (value === null || value === undefined || value === '') {
            return '<span style="font-style:italic; color: var(--text-light);">No response provided</span>';
        }
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        const formattedValue = typeof value === 'string'
            ? formatText(value, field?.format_rule || 'No formatting')
            : String(value);
        return formattedValue;
    };

    const sanitizeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/"/g, '""')
            .replace(/(\r\n|\n|\r)/gm, ' ')
            .replace(/<[^>]*>?/gm, '');
    };

    // UI Elements
    const viewGrid = document.getElementById('view-scholarships-grid');
    const viewList = document.getElementById('view-applicants-list');
    const cardsContainer = document.getElementById('scholarship-cards-container');
    const tbody = document.getElementById('applicants-tbody');

    // --- SKELETON LOADING ENGINE ---
    function showProgramCardsSkeleton() {
        if (!cardsContainer) return;
        let html = '';
        for (let i = 0; i < 6; i++) {
            html += `
                <div class="skeleton-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div class="skeleton-card-icon"></div>
                        <div class="skeleton-pill" style="width: 32px; height: 16px;"></div>
                    </div>
                    <div class="skeleton-card-title"></div>
                    <div class="skeleton-card-details"></div>
                    <div class="skeleton-card-footer">
                        <div class="skeleton-card-stat"></div>
                        <div class="skeleton-card-stat"></div>
                    </div>
                </div>
            `;
        }
        cardsContainer.innerHTML = html;
    }

    function showApplicantsTableSkeleton() {
        if (!tbody) return;
        let html = '';
        for (let i = 0; i < 5; i++) {
            html += `
                <tr class="skeleton-table-row">
                    <td><div class="skeleton-line" style="width: 20px;"></div></td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="skeleton-avatar"></div>
                            <div style="display: flex; flex-direction: column; gap: 6px; width: 140px;">
                                <div class="skeleton-line" style="width: 90%;"></div>
                                <div class="skeleton-line" style="width: 60%; height: 10px;"></div>
                            </div>
                        </div>
                    </td>
                    <td><div class="skeleton-pill" style="width: 80px; height: 22px;"></div></td>
                    <td><div class="skeleton-line" style="width: 150px;"></div></td>
                    <td><div class="skeleton-line" style="width: 90px;"></div></td>
                    <td><div class="skeleton-pill" style="width: 90px; height: 24px;"></div></td>
                    <td style="text-align: right;">
                        <div style="display: flex; gap: 6px; justify-content: flex-end;">
                            <div class="skeleton-btn-mini"></div>
                            <div class="skeleton-btn-mini"></div>
                        </div>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    }

    function showIndividualAppSkeleton() {
        const gformContent = document.getElementById('gform-content');
        if (!gformContent) return;
        gformContent.innerHTML = `
            <div class="skeleton-card skeleton-profile-card" style="margin-bottom: 22px; padding: 24px;">
                <div class="skeleton-line" style="width: 200px; height: 22px; margin-bottom: 16px;"></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px;">
                    <div class="skeleton-line" style="width: 85%;"></div>
                    <div class="skeleton-line" style="width: 85%;"></div>
                    <div class="skeleton-line" style="width: 95%;"></div>
                    <div class="skeleton-line" style="width: 75%;"></div>
                    <div class="skeleton-line" style="width: 80%;"></div>
                    <div class="skeleton-line" style="width: 70%;"></div>
                </div>
            </div>
            <div class="skeleton-card skeleton-response-card" style="margin-bottom: 14px; padding: 18px;">
                <div class="skeleton-line" style="width: 40%; height: 16px; margin-bottom: 8px;"></div>
                <div class="skeleton-line" style="width: 80%; height: 14px;"></div>
            </div>
            <div class="skeleton-card skeleton-response-card" style="margin-bottom: 14px; padding: 18px;">
                <div class="skeleton-line" style="width: 50%; height: 16px; margin-bottom: 8px;"></div>
                <div class="skeleton-line" style="width: 70%; height: 14px;"></div>
            </div>
        `;
    }

    // --- 2. LOAD PROFILE DATA INTO HEADER ---
    async function loadProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*, schools(name)')
                .eq('id', adminId)
                .single();

            if (profile) {
                if (!['admin', 'coordinator', 'staff'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                currentAdminSchoolId = profile.school_id;
                const schoolName = profile.schools ? profile.schools.name : (profile.school || 'Unassigned School');
                currentAdminSchool = schoolName;
                currentAdminRole = profile.role;

                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';
                const fullName = `${firstName} ${lastName}`.trim();

                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = fullName;
                }

                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                if (document.getElementById('admin-school-display')) {
                    document.getElementById('admin-school-display').innerHTML = `
                        <i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i>
                        <span>Assigned to: <strong>${schoolName}</strong></span>
                    `;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                }

                sessionStorage.setItem('grantee_admin_profile', JSON.stringify({
                    name: fullName,
                    role: profile.role === 'admin' ? 'Coordinator' : profile.role,
                    avatar_url: profile.avatar_url || 'assets/admin-avatar.png',
                    school_name: schoolName,
                    school_id: profile.school_id
                }));

                loadScholarships();
            }
        } catch (error) {
            console.error("Error loading admin profile:", error);
            Swal.fire('Error', 'Failed to load profile data.', 'error');
        }
    }

    // --- 3. SYSTEM LOGGING UTILITY ---
    async function logSystemAction(action, details, targetUserId = null) {
        try {
            await window.supabaseClient.from('audit_logs').insert([{
                admin_id: adminId,
                school_id: currentAdminSchoolId,
                action: action,
                module: 'Applications',
                details: JSON.stringify({ details, targetUserId })
            }]);
        } catch (e) {
            console.warn("Audit logging failed:", e);
        }
    }

    // --- 4. FETCH EDUCATIONAL ASSISTANCE PROGRAMS ---
    async function loadScholarships() {
        try {
            showProgramCardsSkeleton();

            if (!currentAdminSchoolId) {
                cardsContainer.innerHTML = '<div style="color:var(--danger-color); grid-column:1/-1; padding:24px; text-align:center;">Account error: No school assigned to this admin.</div>';
                return;
            }

            const { data: scholarships, error } = await window.supabaseClient
                .from('scholarships')
                .select('*, applications ( status )')
                .eq('school_id', currentAdminSchoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            allScholarships = scholarships || [];
            renderScholarshipCards();

            // Auto-open target scholarship if provided in URL parameter (e.g. from Dashboard Top Scholarships or Performance Chart)
            const urlParams = new URLSearchParams(window.location.search);
            const targetScholId = urlParams.get('scholarship_id') || urlParams.get('id');
            if (targetScholId) {
                const targetSchol = allScholarships.find(s => String(s.id) === String(targetScholId));
                if (targetSchol) {
                    openScholarship(targetSchol);
                }
            }
        } catch (err) {
            console.error(err);
            cardsContainer.innerHTML = '<div style="color:var(--danger-color); grid-column:1/-1; padding:24px; text-align:center;">Failed to load educational assistance programs.</div>';
        }
    }

    function renderScholarshipCards() {
        cardsContainer.innerHTML = '';

        if (allScholarships.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox" style="width: 32px; height: 32px; color: var(--text-light); margin-bottom: 8px;"></i>
                    <p style="font-weight: 600; color: var(--text-heading);">No educational assistance programs created yet.</p>
                    <span style="color: var(--text-muted); font-size: 13px;">Create new programs under Scholarship Management to start receiving applications.</span>
                </div>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        allScholarships.forEach((sch) => {
            const apps = sch.applications || [];
            const pendingCount = apps.filter(a => {
                const st = normalizeApplicantStatus(a.status);
                return st === 'pending' || st === 'under review';
            }).length;
            const approvedCount = apps.filter(a => normalizeApplicantStatus(a.status) === 'approved').length;

            const card = document.createElement('div');
            card.className = 'data-panel card-hoverable';
            card.onclick = () => openScholarship(sch);

            let detailsHtml = '';
            let parts = [];
            if (sch.batch) parts.push(`<strong>Batch:</strong> ${sch.batch}`);
            if (sch.semester) parts.push(`<strong>Semester:</strong> ${sch.semester}`);
            if (sch.school_year) parts.push(`<strong>SY:</strong> ${sch.school_year}`);
            if (sch.slots) parts.push(`<strong>Slots:</strong> ${sch.slots}`);

            if (parts.length > 0) {
                detailsHtml = `<div class="card-metadata-box">${parts.join(' • ')}</div>`;
            }

            const categoryHtml = sch.category
                ? `<div class="card-category-tag"><i data-lucide="tag" style="width: 12px; height: 12px;"></i> ${sch.category}</div>`
                : `<div class="card-category-tag"><i data-lucide="award" style="width: 12px; height: 12px;"></i> General Assistance</div>`;

            card.innerHTML = `
                <div>
                    <div class="card-top-row">
                        <!-- UNIFIED CONSISTENT ICON BADGE ACROSS ALL DATA PANELS -->
                        <div class="card-icon-badge" title="Educational Assistance Program">
                            <i data-lucide="award" style="width: 22px; height: 22px;"></i>
                        </div>
                        <i data-lucide="chevron-right" class="card-arrow-icon" style="width: 18px; height: 18px;"></i>
                    </div>
                    <h3 class="card-title">${sch.title}</h3>
                    ${categoryHtml}
                    ${detailsHtml}
                </div>

                <div class="card-stats-row">
                    <div>
                        <span class="card-stat-label">Pending</span>
                        <span class="card-stat-val-pending">${pendingCount}</span>
                    </div>
                    <div style="text-align:right;">
                        <span class="card-stat-label">Approved</span>
                        <span class="card-stat-val-approved">${approvedCount}</span>
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    // --- 5. VIEW APPLICANTS FOR A PROGRAM ---
    window.openScholarship = async (scholarshipObj) => {
        activeScholarshipData = scholarshipObj;
        document.getElementById('active-sch-title').innerText = scholarshipObj.title;
        viewGrid.style.display = 'none';
        viewList.style.display = 'block';
        switchTab('Pending');
    };

    window.showGrid = () => {
        viewList.style.display = 'none';
        viewGrid.style.display = 'block';
        loadScholarships();
    };

    async function loadApplicationsForActiveTab() {
        if (activeTabStatus !== 'Individual') {
            showApplicantsTableSkeleton();
        } else {
            showIndividualAppSkeleton();
        }

        try {
            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, middle_name, last_name, id_number, email, contact_number, date_of_birth, gender, address, program, year_level, avatar_url ), scholarships (title)')
                .eq('scholarship_id', activeScholarshipData.id)
                .neq('status', 'Draft')
                .order('created_at', { ascending: false });

            if (error) throw error;

            currentApplications = apps || [];

            // Update Tab Badge Counts
            const pendingCount = currentApplications.filter(a => {
                const st = normalizeApplicantStatus(a.status);
                return st === 'pending' || st === 'under review';
            }).length;
            const approvedCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'approved').length;
            const rejectedCount = currentApplications.filter(a => {
                const st = normalizeApplicantStatus(a.status);
                return st === 'rejected' || st === 'declined';
            }).length;

            if (document.getElementById('tab-count-pending')) document.getElementById('tab-count-pending').innerText = pendingCount;
            if (document.getElementById('tab-count-approved')) document.getElementById('tab-count-approved').innerText = approvedCount;
            if (document.getElementById('tab-count-rejected')) document.getElementById('tab-count-rejected').innerText = rejectedCount;

            if (activeTabStatus === 'Individual') {
                initIndividualView();
            } else {
                filterTable();
            }

        } catch (err) {
            console.error("Error loading applications:", err);
            if (activeTabStatus !== 'Individual') {
                tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger-color); text-align:center; padding:36px; font-size:13.5px;"><i data-lucide="alert-circle" style="width:18px; height:18px; display:inline-block; vertical-align:middle; margin-right:6px;"></i> Failed to load applicants. Check console for details.</td></tr>`;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            }
        }
    }

    window.switchTab = (status) => {
        activeTabStatus = status;

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${status}'`)) {
                btn.classList.add('active');
            }
        });

        const evalTabBtn = document.getElementById('tab-evaluate-applicant');
        if (evalTabBtn) {
            evalTabBtn.style.display = status === 'Individual' ? 'inline-flex' : 'none';
        }

        const tableView = document.getElementById('table-view-container');
        const indivView = document.getElementById('individual-view-container');
        const badge = document.getElementById('main-status-badge');

        if (status === 'Individual') {
            tableView.style.display = 'none';
            indivView.style.display = 'block';
            badge.innerHTML = `<i data-lucide="user-check" style="width: 12px; height: 12px;"></i> Evaluating Applicant`;
            badge.className = 'badge-status';
            badge.style.background = 'var(--badge-eval-bg)';
            badge.style.color = 'var(--badge-eval-color)';
            badge.style.border = '1px solid var(--border-color)';
        } else {
            tableView.style.display = 'block';
            indivView.style.display = 'none';
            if (status === 'Pending') {
                badge.innerHTML = `<i data-lucide="clock" style="width: 12px; height: 12px;"></i> Pending Evaluation`;
                badge.className = 'badge-status badge-pending';
                badge.style.background = '';
                badge.style.color = '';
                badge.style.border = '';
            }
            if (status === 'Approved') {
                badge.innerHTML = `<i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Approved Applicants`;
                badge.className = 'badge-status badge-approved';
                badge.style.background = '';
                badge.style.color = '';
                badge.style.border = '';
            }
            if (status === 'Rejected') {
                badge.innerHTML = `<i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Rejected Applicants`;
                badge.className = 'badge-status badge-rejected';
                badge.style.background = '';
                badge.style.color = '';
                badge.style.border = '';
            }
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        loadApplicationsForActiveTab();
    };

    // --- 6. TABLE WITH SORTING ---
    window.filterTable = () => {
        const searchInput = document.getElementById('search-applicant');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const sortSelect = document.getElementById('sort-date-select');
        const sortOrder = sortSelect ? sortSelect.value : 'desc';

        let filteredApps = currentApplications.filter(app => {
            const currentAppStatus = normalizeApplicantStatus(app.status);

            const matchStatus = activeTabStatus === 'Pending'
                ? (currentAppStatus === 'pending' || currentAppStatus === 'under review')
                : activeTabStatus === 'Approved'
                    ? (currentAppStatus === 'approved')
                    : (currentAppStatus === 'rejected' || currentAppStatus === 'declined');

            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.toLowerCase();

            const sid = (app.profiles?.id_number || '').toLowerCase();
            const email = (app.profiles?.email || '').toLowerCase();

            const matchSearch = fullName.includes(searchTerm) || sid.includes(searchTerm) || email.includes(searchTerm);

            return matchStatus && matchSearch;
        });

        filteredApps.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        currentFilteredApps = filteredApps;

        if (document.getElementById('table-count-label')) {
            document.getElementById('table-count-label').innerText = `Total ${activeTabStatus}: ${filteredApps.length}`;
        }
        if (document.getElementById('showing-entries')) {
            document.getElementById('showing-entries').innerText = `Showing 1 to ${filteredApps.length} of ${filteredApps.length} entries`;
        }

        if (filteredApps.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:44px 20px; color:var(--text-muted); font-size: 13.5px;">
                        <i data-lucide="inbox" style="width: 28px; height: 28px; color: var(--text-light); margin-bottom: 8px; display: block; margin: 0 auto 8px auto;"></i>
                        <span style="font-weight: 600; color: var(--text-heading); display: block; margin-bottom: 2px;">No applicants found</span>
                        No applicant records match your search or status filter.
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        tbody.innerHTML = '';
        filteredApps.forEach((app, index) => {
            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '') || 'Applicant';
            const initials = ((fname[0] || '') + (lname[0] || '')).toUpperCase() || 'A';

            const studentId = app.profiles?.id_number || 'N/A';
            const email = app.profiles?.email || 'N/A';

            const normalizedStatus = normalizeApplicantStatus(app.status);
            let statusClass = 'badge-pending';
            let statusIcon = 'clock';
            let displayStatus = getDisplayStatus(app.status);

            if (normalizedStatus === 'approved') {
                statusClass = 'badge-approved';
                statusIcon = 'check-circle-2';
                displayStatus = 'Approved';
            }
            if (normalizedStatus === 'rejected' || normalizedStatus === 'declined') {
                statusClass = 'badge-rejected';
                statusIcon = 'x-circle';
                displayStatus = 'Rejected';
            }

            let actionsHtml = '';
            if (activeTabStatus === 'Pending') {
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end;">
                        <button class="btn-approve" onclick="confirmUpdateStatus('${app.id}', 'Approved', 'Approve')">
                            <i data-lucide="check" style="width: 14px; height: 14px;"></i> Approve
                        </button>
                        <button class="btn-reject" onclick="confirmUpdateStatus('${app.id}', 'Rejected', 'Reject')">
                            <i data-lucide="x" style="width: 14px; height: 14px;"></i> Reject
                        </button>
                        <button class="btn-outline" onclick="viewApplicantDetails('${app.id}')">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View
                        </button>
                    </div>
                `;
            } else if (activeTabStatus === 'Approved') {
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end;">
                        <button class="btn-outline" onclick="viewApplicantDetails('${app.id}')">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View Responses
                        </button>
                    </div>
                `;
            } else { // Rejected
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end;">
                        <button class="btn-outline" onclick="viewApplicantDetails('${app.id}')">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View Responses
                        </button>
                        <button class="btn-remove" onclick="deleteApplication('${app.id}')">
                            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Delete
                        </button>
                    </div>
                `;
            }

            const avatarHtml = app.profiles?.avatar_url
                ? `<img src="${app.profiles.avatar_url}" alt="${fullName}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : `<div style="width: 32px; height: 32px; border-radius: 50%; background: var(--border-color); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 700;">${initials}</div>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color:var(--text-light); font-weight:600; font-size: 12px;">${index + 1}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${avatarHtml}
                        <span style="color:var(--text-heading); font-weight:600;">${fullName}</span>
                    </div>
                </td>
                <td><span class="count-pill" style="font-size: 12px; padding: 4px 10px;">${studentId}</span></td>
                <td style="color:var(--text-muted);">${email}</td>
                <td style="color:var(--text-muted); font-size:13px;">${dateStr}</td>
                <td>
                    <span class="badge-status ${statusClass}">
                        <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i> ${displayStatus}
                    </span>
                </td>
                <td>${actionsHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    // --- 7. APPLICANT EVALUATION VIEW ---
    window.initIndividualView = () => {
        const select = document.getElementById('individual-applicant-select');
        select.innerHTML = '';

        if (currentApplications.length === 0) {
            select.innerHTML = '<option value="">No applicants found</option>';
            document.getElementById('gform-content').innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">No applicants available for evaluation.</div>';
            return;
        }

        currentApplications.forEach(app => {
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const name = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '');

            let dispStat = getDisplayStatus(app.status);

            const opt = document.createElement('option');
            opt.value = app.id;
            opt.text = `${name} - ${app.profiles?.id_number || ''} (${dispStat})`;
            select.appendChild(opt);
        });

        if (activeIndividualAppId && currentApplications.some(a => a.id === activeIndividualAppId)) {
            select.value = activeIndividualAppId;
            renderIndividualApp(activeIndividualAppId);
        } else {
            renderIndividualApp(currentApplications[0].id);
        }
    };

    window.renderIndividualApp = (appId) => {
        activeIndividualAppId = appId;
        const app = currentApplications.find(a => a.id === appId);
        if (!app) return;

        const btnApprove = document.getElementById('indiv-btn-approve');
        const btnReject = document.getElementById('indiv-btn-reject');

        if (btnApprove) btnApprove.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px;"></i> Select as Grantee';
        if (btnReject) btnReject.innerHTML = '<i data-lucide="x" style="width: 14px; height: 14px;"></i> Decline';

        const normalizedStatus = normalizeApplicantStatus(app.status);
        if (normalizedStatus === 'pending' || normalizedStatus === 'under review') {
            if (btnApprove) { btnApprove.style.display = 'inline-flex'; btnApprove.onclick = () => confirmUpdateStatus(app.id, 'Approved', 'Approve'); }
            if (btnReject) { btnReject.style.display = 'inline-flex'; btnReject.onclick = () => confirmUpdateStatus(app.id, 'Rejected', 'Reject'); }
        } else if (normalizedStatus === 'approved') {
            if (btnApprove) btnApprove.style.display = 'none';
            if (btnReject) btnReject.style.display = 'none';
        } else {
            if (btnApprove) btnApprove.style.display = 'none';
            if (btnReject) btnReject.style.display = 'none';
        }

        const gformContent = document.getElementById('gform-content');

        const fname = app.profiles?.first_name || '';
        const mname = app.profiles?.middle_name || '';
        const lname = app.profiles?.last_name || '';
        const name = `${fname} ${mname ? mname + ' ' : ''}${lname}`.trim() || 'Applicant';

        const sid = app.profiles?.id_number || 'N/A';
        const email = app.profiles?.email || 'N/A';
        const dob = app.profiles?.date_of_birth || 'N/A';
        const gender = app.profiles?.gender || 'N/A';
        const contact = app.profiles?.contact_number || 'N/A';
        const address = app.profiles?.address || 'N/A';
        const program = app.profiles?.program || 'N/A';
        const yearLevel = app.profiles?.year_level || 'N/A';
        const date = new Date(app.created_at).toLocaleString();
        const profileFormats = activeScholarshipData?.auto_collected_formats || {};
        const formattedEmail = formatText(email, profileFormats['Email Address'] || profileFormats['Email']);
        const formattedName = formatText(`${fname} ${mname ? mname + ' ' : ''}${lname}`.trim(), profileFormats['Full Name']);
        const formattedGender = formatText(gender, profileFormats['Gender']);
        const formattedAddress = formatText(address, profileFormats['Address']);
        const formattedProgram = formatText(program, profileFormats['Program']);
        const formattedYearLevel = formatText(yearLevel, profileFormats['Year Level']);
        const dispStat = getDisplayStatus(app.status);

        let html = `
            <div class="applicant-profile-card">
                <h2>
                    <i data-lucide="user" style="width: 20px; height: 20px; color: var(--moss-green);"></i> Applicant Profile
                </h2>
                
                <div class="applicant-grid-fields">
                    <div class="applicant-field-item"><strong>Student ID:</strong> <span>${sid}</span></div>
                    <div class="applicant-field-item"><strong>Email:</strong> <span>${formattedEmail}</span></div>
                    
                    <div class="applicant-field-item" style="grid-column: 1 / -1;"><strong>Full Name:</strong> <span>${formattedName}</span></div>
                    
                    <div class="applicant-field-item"><strong>Date of Birth:</strong> <span>${dob}</span></div>
                    <div class="applicant-field-item"><strong>Gender:</strong> <span>${formattedGender}</span></div>
                    
                    <div class="applicant-field-item" style="grid-column: 1 / -1;"><strong>Contact Number:</strong> <span>${contact}</span></div>
                    <div class="applicant-field-item" style="grid-column: 1 / -1;"><strong>Address:</strong> <span>${formattedAddress}</span></div>
                    
                    <div class="applicant-field-item"><strong>Program:</strong> <span>${formattedProgram}</span></div>
                    <div class="applicant-field-item"><strong>Year Level:</strong> <span>${formattedYearLevel}</span></div>
                </div>

                <hr style="border: 0; height: 1px; background: var(--border-color); margin: 20px 0;">

                <div style="display: flex; gap: 24px; flex-wrap: wrap; font-size: 13.5px;">
                    <div><strong style="color: var(--text-muted);">Evaluation Status:</strong> <span class="badge-status ${dispStat === 'Approved' ? 'badge-approved' : (dispStat === 'Rejected' ? 'badge-rejected' : 'badge-pending')}" style="margin-left: 6px;">${dispStat}</span></div>
                    <div><strong style="color: var(--text-muted);">Applied On:</strong> <span style="color: var(--text-main); margin-left: 4px;">${date}</span></div>
                </div>
            </div>
        `;

        // 1. Applicant Responses
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            html += `<h3 style="font-size:16px; font-weight:700; color:var(--text-heading); margin-bottom:16px; margin-top:28px; display:flex; align-items:center; gap:8px;"><i data-lucide="clipboard-list" style="width:18px; height:18px; color:var(--moss-green);"></i> Form Responses</h3>`;

            const schema = activeScholarshipData?.form_fields || activeScholarshipData?.form_schema || [];

            schema.forEach(field => {
                if (field.type === 'heading' || field.type === 'text') {
                    html += `<div style="margin: 20px 0 10px 0; font-weight:700; color:var(--text-heading); font-size:15px;">${field.label}</div>`;
                } else {
                    const answer = app.form_responses && Object.prototype.hasOwnProperty.call(app.form_responses, field.label)
                        ? app.form_responses[field.label]
                        : '';
                    const renderedAnswer = renderFormattedAnswer(answer, field);
                    html += `
                        <div class="form-response-card">
                            <div class="form-response-label">${field.label}</div>
                            <div class="form-response-val">${renderedAnswer}</div>
                        </div>
                    `;
                }
            });

            // Fallback for fields not in current schema
            for (const [q, a] of Object.entries(app.form_responses || {})) {
                if (!schema.find(f => f.label === q)) {
                    const renderedAnswer = renderFormattedAnswer(a, null);
                    html += `
                        <div class="form-response-card">
                            <div class="form-response-label">${q}</div>
                            <div class="form-response-val">${renderedAnswer}</div>
                        </div>
                    `;
                }
            }
        }

        // 2. Extracted Documents
        if (app.documents && app.documents.length > 0) {
            html += `<h3 style="font-size:16px; font-weight:700; color:var(--text-heading); margin-bottom:16px; margin-top:28px; display:flex; align-items:center; gap:8px;"><i data-lucide="file-check" style="width:18px; height:18px; color:var(--moss-green);"></i> Submitted Documents & AI Data</h3>`;
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';

                const actionLinks = fileUrl
                    ? `<div style="display: flex; gap: 12px; align-items: center;">
                           <button onclick="viewDocumentFull('${fileUrl}')" class="btn-text" style="color: var(--river-blue);"><i data-lucide="maximize-2" style="width:13px; height:13px;"></i> Full View</button>
                           <button onclick="forceDownload('${fileUrl}', '${doc.name || 'document'}')" class="btn-text" style="color: var(--moss-green);"><i data-lucide="download" style="width:13px; height:13px;"></i> Download</button>
                       </div>`
                    : '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().includes('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:450px; border:none; display:block; border-radius:8px;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; max-height:450px; object-fit:contain; display:block; margin: 0 auto; border-radius:8px;">`;
                    }
                } else {
                    previewContent = `
                        <div style="padding:40px 20px; text-align:center; color:var(--text-muted);">
                            <i data-lucide="file-x" style="width:32px; height:32px; margin-bottom:10px; display:block; margin: 0 auto 10px auto; color:var(--text-light);"></i>
                            <strong style="display:block; margin-bottom:4px; color:var(--text-heading);">File not available</strong>
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
                            <li>
                                <span style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px; letter-spacing:0.03em;">${key}</span>
                                <div style="color:var(--text-main); font-weight:400; font-size:12.5px; line-height:1.4;">${displayValue}</div>
                            </li>
                        `;
                    }

                    extractedDataHtml = `
                        <div class="ai-data-box">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                                <strong style="color:var(--text-heading); font-size:13.5px; display:flex; align-items:center; gap:6px;">
                                    <i data-lucide="sparkles" style="width:15px; height:15px; color:var(--moss-green);"></i> AI Extracted Information
                                </strong>
                            </div>
                            <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column;">
                                ${liHtml}
                            </ul>
                        </div>
                    `;
                }

                html += `
                    <div class="document-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                            <div style="font-weight:600; font-size:14.5px; color:var(--text-heading); display:flex; align-items:center; gap:6px;">
                                <i data-lucide="paperclip" style="width:16px; height:16px; color:var(--moss-green);"></i> ${doc.name} 
                                <span class="badge-status badge-approved" style="font-size:10px; padding:3px 8px; margin-left:6px;">${doc.status || 'Attached'}</span>
                            </div>
                            ${actionLinks}
                        </div>
                        
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 280px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background:var(--card-bg-secondary);">
                                ${previewContent}
                            </div>
                            ${extractedDataHtml}
                        </div>
                    </div>
                `;
            });
        }

        gformContent.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    // --- DOCUMENT VIEWER MODAL AND DOWNLOAD LOGIC ---
    window.viewDocumentFull = (url) => {
        const isPdf = url.toLowerCase().includes('.pdf');
        const contentHtml = isPdf
            ? `<iframe src="${url}#toolbar=0" style="width:100%; height:80vh; border:none; display:block; border-radius: 8px;"></iframe>`
            : `<img src="${url}" style="max-width:100%; max-height:80vh; object-fit:contain; display:block; margin: 0 auto; border-radius: 8px;">`;

        Swal.fire({
            title: 'Document Viewer',
            html: contentHtml,
            width: '85%',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                popup: 'swal-wide-doc'
            }
        });
    };

    window.forceDownload = async (url, filename) => {
        try {
            Swal.fire({ title: 'Downloading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;

            let downloadName = filename;
            if (!downloadName.includes('.')) {
                const ext = url.split('.').pop().split(/\#|\?/)[0];
                downloadName += `.${ext}`;
            }

            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            window.URL.revokeObjectURL(blobUrl);
            Swal.close();
        } catch (e) {
            console.error('Download error, falling back to new tab:', e);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            a.remove();
            Swal.close();
        }
    };

    // --- 8. POLICY VALIDATION & APPROVAL LOGIC ---
    window.confirmUpdateStatus = async (appId, newStatus, actionName) => {
        if (newStatus === 'Approved') {
            await processApprovalWithPolicyValidation(appId);
        } else {
            const result = await Swal.fire({
                title: `Confirm ${actionName}`,
                text: `Are you sure you want to ${actionName.toLowerCase()} this applicant?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#D94841',
                cancelButtonColor: '#586F62',
                confirmButtonText: `Yes, ${actionName}!`
            });

            if (result.isConfirmed) {
                const targetApp = currentApplications.find(a => a.id === appId);
                await logSystemAction(`Applicant ${newStatus}`, `Applicant evaluation updated to ${newStatus}.`, targetApp?.student_id);
                await updateStatus(appId, newStatus);
            }
        }
    };

    async function processApprovalWithPolicyValidation(appId) {
        Swal.fire({
            title: 'Validating Policies...',
            text: 'Checking institution limits and combination rules.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const targetApp = currentApplications.find(a => a.id === appId);
            if (!targetApp) throw new Error("Applicant not found locally.");

            // Fetch institution policies
            const { data: policies } = await window.supabaseClient
                .from('school_policies')
                .select('*')
                .eq('school_id', currentAdminSchoolId)
                .single();

            // Fetch the applicant's existing approved applications to cross-reference
            const { data: activeApps, error: activeError } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships(title, category)')
                .eq('student_id', targetApp.student_id)
                .in('status', ['Approved', 'Grantee']);

            if (activeError) throw activeError;

            let violation = null;
            let activeCount = activeApps ? activeApps.length : 0;
            let targetCat = activeScholarshipData.category || 'Institution-Funded Educational Assistance';
            let catCount = activeApps ? activeApps.filter(a => a.scholarships?.category === targetCat).length : 0;

            let activeListHTML = activeApps && activeCount > 0
                ? activeApps.map(a => `<li style="margin-bottom: 4px;"><strong>${a.scholarships?.title}</strong> (${a.scholarships?.category})</li>`).join('')
                : '<li>No active assistance programs.</li>';

            // Check against policies
            if (policies && policies.global_enabled) {
                // Global Limit Check
                if (policies.global_limit > 0 && activeCount >= policies.global_limit) {
                    violation = "Approving this applicant will exceed the maximum number of active educational assistance programs allowed by the institution.";
                }

                // Category Limit Check
                if (!violation && policies.category_limits && policies.category_limits[targetCat] && !policies.category_limits[targetCat].unlimited) {
                    if (catCount >= policies.category_limits[targetCat].limit) {
                        violation = `Approving this applicant will exceed the active limit for the ${targetCat} category.`;
                    }
                }

                // Combination Rules Check
                if (!violation && policies.combination_rules) {
                    for (let sa of (activeApps || [])) {
                        let activeCat = sa.scholarships?.category;
                        if (activeCat && activeCat !== targetCat) {
                            let comboKey = `${activeCat}::${targetCat}`;
                            let comboKeyReverse = `${targetCat}::${activeCat}`;
                            if (policies.combination_rules[comboKey] === false || policies.combination_rules[comboKeyReverse] === false) {
                                violation = `Institutional policy does not allow combining ${activeCat} with ${targetCat}.`;
                                break;
                            }
                        }
                    }
                }
            }

            if (violation) {
                const canOverride = ['admin', 'coordinator'].includes(currentAdminRole);

                const result = await Swal.fire({
                    title: 'Policy Violation Detected',
                    html: `
                        <div style="text-align: left; font-size: 14px; background: rgba(217, 72, 65, 0.15); border: 1px solid rgba(217, 72, 65, 0.3); padding: 15px; border-radius: 8px; color: var(--danger-color); margin-bottom: 15px;">
                            <strong>Warning:</strong> ${violation}
                        </div>
                        <div style="text-align: left; font-size: 13px;">
                            <p style="margin-bottom: 8px;"><strong>Current Active Records (${activeCount}):</strong></p>
                            <ul style="padding-left: 20px; color: var(--text-muted);">${activeListHTML}</ul>
                            <p style="margin-top: 12px;"><strong>Category Focus (${targetCat}):</strong> ${catCount} active</p>
                        </div>
                        ${!canOverride ? '<p style="color:var(--danger-color); font-size:13px; font-weight:bold; margin-top:15px;">Staff users are not allowed to override policy restrictions.</p>' : ''}
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    showConfirmButton: canOverride,
                    confirmButtonText: 'Override and Approve',
                    cancelButtonText: 'Cancel Approval',
                    confirmButtonColor: '#6B7F4E'
                });

                if (result.isConfirmed && canOverride) {
                    await logSystemAction('Policy Override Approval', `Admin overrode policy: [${violation}] for Application ID: ${appId}`, targetApp.student_id);
                    await updateStatus(appId, 'Approved');
                }
            } else {
                // No policies violated, confirm standard approval
                const result = await Swal.fire({
                    title: `Confirm Approval`,
                    text: `Are you sure you want to approve this applicant? No institution policies are violated.`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#6B7F4E',
                    cancelButtonColor: '#586F62',
                    confirmButtonText: `Yes, Approve!`
                });

                if (result.isConfirmed) {
                    await logSystemAction('Standard Approval', `Approved application ID: ${appId} normally.`, targetApp.student_id);
                    await updateStatus(appId, 'Approved');
                }
            }

        } catch (error) {
            console.error("Policy evaluation error:", error);
            Swal.fire('Error', 'Failed to evaluate assistance policies. Please try again.', 'error');
        }
    }

    window.updateStatus = async (appId, newStatus) => {
        try {
            Swal.fire({
                title: 'Processing...',
                text: 'Updating applicant status.',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            const targetApp = currentApplications.find(a => a.id === appId);
            if (!targetApp) throw new Error("Applicant not found locally.");

            const updatePayload = { status: newStatus };

            const { error: updateError } = await window.supabaseClient
                .from('applications')
                .update(updatePayload)
                .eq('id', appId);

            if (updateError) throw updateError;

            const schName = targetApp.scholarships ? targetApp.scholarships.title : 'the educational assistance program';

            // Dynamic Notification Messaging based on evaluation
            let notifTitle = `Application Update`;
            let notifMsg = `Your application for ${schName} has been updated to ${newStatus}.`;

            if (newStatus === 'Approved') {
                notifTitle = 'Application Approved';
                notifMsg = `Your application for ${schName} has been approved.`;
            } else if (newStatus === 'Declined' || newStatus === 'Rejected') {
                notifTitle = 'Application Rejected';
                notifMsg = `We regret to inform you that your application for ${schName} has been rejected.`;
            }

            const payload = {
                userIds: [targetApp.student_id],
                eventType: 'applications',
                subject: notifTitle,
                message: notifMsg,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: ${newStatus === 'Approved' ? '#6B7F4E' : '#D94841'};">${notifTitle}</h2>
                        <p>${notifMsg}</p>
                        <p>Log in to your student dashboard for more information.</p>
                    </div>
                `
            };

            await fetch('https://grantee-backend-n5f4.onrender.com/api/dispatch-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(e => console.error("Notification dispatch failed:", e));

            // Notify Coordinators of Final Decision
            if (currentAdminSchoolId) {
                if (newStatus === 'Approved' || newStatus === 'Declined' || newStatus === 'Rejected') {
                    const decisionStr = newStatus === 'Approved' ? 'Approved' : 'Rejected';
                    const studentName = targetApp.profiles ? `${targetApp.profiles.first_name || ''} ${targetApp.profiles.last_name || ''}`.trim() : 'A student';

                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'DECISION_MADE',
                            subject: 'Application Decision Reached',
                            message: `Decision reached on ${studentName}'s application (Status: ${decisionStr})`,
                            resourceId: appId
                        })
                    }).catch(e => console.error("Coordinator notification failed:", e));

                    if (newStatus === 'Approved' && targetApp.scholarships && targetApp.scholarships.slots) {
                        const { count: currentApprovedCount } = await window.supabaseClient
                            .from('applications')
                            .select('id', { count: 'exact', head: true })
                            .eq('scholarship_id', targetApp.scholarship_id)
                            .eq('status', 'Approved');

                        if (currentApprovedCount >= targetApp.scholarships.slots) {
                            await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    schoolId: currentAdminSchoolId,
                                    eventType: 'SLOT_LIMIT_REACHED',
                                    subject: 'Slot Limit Reached',
                                    message: `The maximum slot limit (${targetApp.scholarships.slots}) for ${targetApp.scholarships.title} has been reached.`,
                                    resourceId: targetApp.scholarship_id
                                })
                            }).catch(e => console.error("Slot limit notification failed:", e));
                        }
                    }
                }
            }

            await Swal.fire('Success!', `Applicant successfully ${newStatus === 'Approved' ? 'Approved' : 'Rejected'}.`, 'success');
            loadApplicationsForActiveTab();

        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Failed to update status.', 'error');
        }
    };

    window.deleteApplication = async (appId) => {
        const result = await Swal.fire({
            title: 'Delete Application?',
            text: "Are you sure you want to permanently delete this application? This cannot be undone.",
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#D94841',
            cancelButtonColor: '#586F62',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            try {
                Swal.fire({
                    title: 'Deleting...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                const { error } = await window.supabaseClient
                    .from('applications')
                    .delete()
                    .eq('id', appId);

                if (error) throw error;

                await logSystemAction('Deleted Application', `Deleted application ID: ${appId}`);
                await Swal.fire('Deleted!', 'The application has been deleted.', 'success');
                loadApplicationsForActiveTab();
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Failed to delete application.', 'error');
            }
        }
    };

    window.viewApplicantDetails = (appId) => {
        activeIndividualAppId = appId;
        switchTab('Individual');
    };

    // --- 9. EXPORT OPTIONS (CSV AND PDF) ---
    window.exportByStatus = async (targetStatus) => {
        const appsToExport = currentApplications.filter(app => {
            const normalizedStatus = normalizeApplicantStatus(app.status);
            if (targetStatus === 'Pending') return normalizedStatus === 'pending' || normalizedStatus === 'under review';
            if (targetStatus === 'Approved') return normalizedStatus === 'approved';
            return normalizedStatus === targetStatus.toLowerCase();
        });

        if (appsToExport.length === 0) {
            Swal.fire('Empty', `No data to export for ${targetStatus} applicants.`, 'info');
            return;
        }

        const { value: format } = await Swal.fire({
            title: `Export ${targetStatus} Applicants`,
            text: `Select the desired file format for exporting ${appsToExport.length} records:`,
            icon: 'question',
            input: 'select',
            inputOptions: {
                'csv': 'CSV Excel (.csv)',
                'pdf': 'PDF Document (.pdf)'
            },
            inputPlaceholder: 'Select an export format',
            showCancelButton: true,
            confirmButtonColor: '#6B7F4E',
            confirmButtonText: 'Export'
        });

        if (!format) return;

        if (format === 'csv') {
            exportToCSV(appsToExport, targetStatus);
        } else if (format === 'pdf') {
            exportToPDF(appsToExport, targetStatus);
        }
    };

    function exportToCSV(appsToExport, targetStatus) {
        let csvContent = "data:text/csv;charset=utf-8,";

        // Base profile headers
        csvContent += "Student ID,Last Name,First Name,Middle Name,Email,Contact Number,Program,Year Level,Evaluation Status,Date Applied";

        // Dynamic Question Headers
        const schema = activeScholarshipData?.form_fields || activeScholarshipData?.form_schema || [];
        const questionFields = schema.filter(f => f.type !== 'heading' && f.type !== 'text');

        questionFields.forEach(q => {
            let cleanLabel = (q.label || '').replace(/<[^>]*>?/gm, '').replace(/,/g, '');
            csvContent += `,"Q: ${cleanLabel}"`;
        });
        csvContent += "\r\n";

        // Rows
        appsToExport.forEach(app => {
            const sid = app.profiles?.id_number || '';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const email = app.profiles?.email || '';
            const contact = app.profiles?.contact_number || '';
            const program = app.profiles?.program || '';
            const yearLevel = app.profiles?.year_level || '';
            const profileFormats = activeScholarshipData?.auto_collected_formats || {};
            const formattedEmail = formatText(email, profileFormats['Email Address'] || profileFormats['Email']);
            const formattedProgram = formatText(program, profileFormats['Program']);
            const formattedYearLevel = formatText(yearLevel, profileFormats['Year Level']);

            const status = getDisplayStatus(app.status);
            const date = new Date(app.created_at).toLocaleDateString();

            let row = `"${sanitizeCsvValue(sid)}","${sanitizeCsvValue(lname)}","${sanitizeCsvValue(fname)}","${sanitizeCsvValue(mname)}","${sanitizeCsvValue(formattedEmail)}","${sanitizeCsvValue(contact)}","${sanitizeCsvValue(formattedProgram)}","${sanitizeCsvValue(formattedYearLevel)}","${sanitizeCsvValue(status)}","${sanitizeCsvValue(date)}"`;

            questionFields.forEach(q => {
                const rawAnswer = app.form_responses && Object.prototype.hasOwnProperty.call(app.form_responses, q.label)
                    ? app.form_responses[q.label]
                    : '';
                const answer = sanitizeCsvValue(renderFormattedAnswer(rawAnswer, q));
                row += `,"${answer}"`;
            });

            csvContent += row + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${targetStatus}_Applicants_Export_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportToPDF(appsToExport, targetStatus) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            Swal.fire('Missing Library', 'jsPDF is required to export to PDF. Please ensure jsPDF and jsPDF-AutoTable are linked in your HTML.', 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'pt', 'a4');

        doc.setFontSize(16);
        doc.text(`${targetStatus} Applicants - ${activeScholarshipData.title}`, 40, 40);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 55);

        const tableColumn = ["Student ID", "Full Name", "Program & Year", "Contact", "Email", "Date Applied"];
        const tableRows = [];

        appsToExport.forEach(app => {
            const sid = app.profiles?.id_number || 'N/A';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.trim();
            const program = app.profiles?.program || 'N/A';
            const yearLevel = app.profiles?.year_level || 'N/A';
            const progYear = `${program}\n(${yearLevel})`;
            const contact = app.profiles?.contact_number || 'N/A';
            const email = app.profiles?.email || 'N/A';
            const date = new Date(app.created_at).toLocaleDateString();

            tableRows.push([sid, fullName, progYear, contact, email, date]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 70,
            styles: { fontSize: 8, cellPadding: 4 },
            headStyles: { fillColor: [107, 127, 78] },
            alternateRowStyles: { fillColor: [244, 246, 242] }
        });

        doc.save(`${targetStatus}_Applicants_Export_${new Date().getTime()}.pdf`);
    }

    window.exportPendingList = () => exportByStatus('Pending');
    window.exportApprovedList = () => exportByStatus('Approved');
    window.exportGranteeList = window.exportApprovedList;

    // INIT
    showProgramCardsSkeleton();
    await loadProfile();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
})();
