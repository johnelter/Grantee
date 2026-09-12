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
        if (value === 'grantee' || value === 'passed' || value === 'approved') return 'approved';
        if (value === 'declined' || value === 'rejected') return 'rejected';
        if (value === 'pending' || value === 'under review' || value === 'submitted' || value === 'review') return 'pending';
        return value || 'pending';
    };

    const getDisplayStatus = (status) => {
        const normalized = normalizeApplicantStatus(status);
        if (normalized === 'approved') return 'Approved';
        if (normalized === 'rejected') return 'Rejected';
        if (normalized === 'pending') return 'Pending';
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
        const titleEl = document.getElementById('active-sch-title');
        if (titleEl) titleEl.innerText = scholarshipObj.title;

        if (viewGrid) viewGrid.style.display = 'none';
        if (viewList) viewList.style.display = 'block';

        activeTabStatus = 'Pending';
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'Pending'`)) {
                btn.classList.add('active');
            }
        });

        const badge = document.getElementById('main-status-badge');
        if (badge) {
            badge.innerHTML = `<i data-lucide="clock" style="width: 12px; height: 12px;"></i> Pending Evaluation`;
            badge.className = 'badge-status badge-pending';
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        await loadApplicationsForActiveTab();
    };

    window.showGrid = () => {
        if (viewList) viewList.style.display = 'none';
        if (viewGrid) viewGrid.style.display = 'block';
        loadScholarships();
    };

    async function loadApplicationsForActiveTab() {
        showApplicantsTableSkeleton();

        try {
            if (!activeScholarshipData || !activeScholarshipData.id) {
                console.warn("No active scholarship selected.");
                return;
            }

            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, middle_name, last_name, id_number, email, contact_number, date_of_birth, gender, address, program, year_level, avatar_url ), scholarships (title)')
                .eq('scholarship_id', activeScholarshipData.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Supabase load applications error:", error);
                throw error;
            }

            currentApplications = (apps || []).filter(a => (a.status || '').toLowerCase() !== 'draft');

            // Update Tab Badge Counts
            const pendingCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'pending').length;
            const approvedCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'approved').length;
            const rejectedCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'rejected').length;

            if (document.getElementById('tab-count-pending')) document.getElementById('tab-count-pending').innerText = pendingCount;
            if (document.getElementById('tab-count-approved')) document.getElementById('tab-count-approved').innerText = approvedCount;
            if (document.getElementById('tab-count-rejected')) document.getElementById('tab-count-rejected').innerText = rejectedCount;

            filterTable();

        } catch (err) {
            console.error("Error loading applications:", err);
            const tbody = document.getElementById('applicants-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger-color); text-align:center; padding:36px; font-size:13.5px;"><i data-lucide="alert-circle" style="width:18px; height:18px; display:inline-block; vertical-align:middle; margin-right:6px;"></i> Failed to load applicants: ${err.message || 'Check console'}.</td></tr>`;
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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

        const badge = document.getElementById('main-status-badge');
        if (badge) {
            if (status === 'Pending') {
                badge.innerHTML = `<i data-lucide="clock" style="width: 12px; height: 12px;"></i> Pending Evaluation`;
                badge.className = 'badge-status badge-pending';
            } else if (status === 'Approved') {
                badge.innerHTML = `<i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Approved Applicants`;
                badge.className = 'badge-status badge-approved';
            } else if (status === 'Rejected') {
                badge.innerHTML = `<i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Rejected Applicants`;
                badge.className = 'badge-status badge-rejected';
            }
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        if (!currentApplications || currentApplications.length === 0) {
            loadApplicationsForActiveTab();
        } else {
            filterTable();
        }
    };

    // --- 6. TABLE WITH SORTING ---
    window.filterTable = () => {
        const searchInput = document.getElementById('search-applicant');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const sortSelect = document.getElementById('sort-date-select');
        const sortOrder = sortSelect ? sortSelect.value : 'desc';
        const tbody = document.getElementById('applicants-tbody');
        if (!tbody) return;

        let filteredApps = (currentApplications || []).filter(app => {
            const currentAppStatus = normalizeApplicantStatus(app.status);

            const matchStatus = activeTabStatus === 'Pending'
                ? (currentAppStatus === 'pending')
                : activeTabStatus === 'Approved'
                    ? (currentAppStatus === 'approved')
                    : (currentAppStatus === 'rejected');

            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.toLowerCase();

            const sid = (app.profiles?.id_number || '').toLowerCase();
            const email = (app.profiles?.email || '').toLowerCase();

            const matchSearch = !searchTerm || fullName.includes(searchTerm) || sid.includes(searchTerm) || email.includes(searchTerm);

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
            document.getElementById('showing-entries').innerText = filteredApps.length > 0
                ? `Showing 1 to ${filteredApps.length} of ${filteredApps.length} entries`
                : `Showing 0 entries`;
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
            if (normalizedStatus === 'rejected') {
                statusClass = 'badge-rejected';
                statusIcon = 'x-circle';
                displayStatus = 'Rejected';
            }

            let actionsHtml = '';
            if (activeTabStatus === 'Pending') {
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end; align-items: center;">
                        <button type="button" class="btn-approve" onclick="confirmUpdateStatus('${app.id}', 'Approved', 'Approve')" title="Approve applicant">
                            <i data-lucide="check" style="width: 14px; height: 14px;"></i> Approve
                        </button>
                        <button type="button" class="btn-reject" onclick="confirmUpdateStatus('${app.id}', 'Rejected', 'Reject')" title="Reject applicant">
                            <i data-lucide="x" style="width: 14px; height: 14px;"></i> Reject
                        </button>
                        <button type="button" class="btn-outline" onclick="openApplicantModal('${app.id}')" title="View applicant responses and documents">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View Responses
                        </button>
                    </div>
                `;
            } else if (activeTabStatus === 'Approved') {
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end; align-items: center;">
                        <button type="button" class="btn-outline" onclick="openApplicantModal('${app.id}')" title="View applicant responses and documents">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View Responses
                        </button>
                    </div>
                `;
            } else { // Rejected
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end; align-items: center;">
                        <button type="button" class="btn-outline" onclick="openApplicantModal('${app.id}')" title="View applicant responses and documents">
                            <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View Responses
                        </button>
                        <button type="button" class="btn-remove" onclick="deleteApplication('${app.id}')" title="Delete application">
                            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i> Delete
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

    // --- 7. APPLICANT EVALUATION & RESPONSES MODAL ---
    window.closeApplicantModal = () => {
        const modal = document.getElementById('applicant-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    window.openApplicantModal = (appId) => {
        const app = currentApplications.find(a => a.id === appId);
        if (!app) {
            Swal.fire('Error', 'Applicant data not found.', 'error');
            return;
        }

        const modal = document.getElementById('applicant-modal');
        const modalName = document.getElementById('modal-applicant-name');
        const modalMeta = document.getElementById('modal-applicant-meta');
        const modalStatusBadge = document.getElementById('modal-status-badge');
        const modalBody = document.getElementById('modal-applicant-body');
        const modalDateText = document.getElementById('modal-date-text');
        const modalActionButtons = document.getElementById('modal-action-buttons');

        if (!modal || !modalBody) return;

        const fname = app.profiles?.first_name || '';
        const mname = app.profiles?.middle_name || '';
        const lname = app.profiles?.last_name || '';
        const displayName = `${fname} ${mname ? mname + ' ' : ''}${lname}`.trim() || 'Applicant';
        const initials = ((fname[0] || '') + (lname[0] || '')).toUpperCase() || 'A';

        const sid = app.profiles?.id_number || 'N/A';
        const email = app.profiles?.email || 'N/A';
        const dob = app.profiles?.date_of_birth || 'N/A';
        const gender = app.profiles?.gender || 'N/A';
        const contact = app.profiles?.contact_number || 'N/A';
        const address = app.profiles?.address || 'N/A';
        const program = app.profiles?.program || 'N/A';
        const yearLevel = app.profiles?.year_level || 'N/A';
        const dateStr = new Date(app.created_at).toLocaleString();

        const profileFormats = activeScholarshipData?.auto_collected_formats || {};
        const formattedEmail = formatText(email, profileFormats['Email Address'] || profileFormats['Email']);
        const formattedName = formatText(displayName, profileFormats['Full Name']);
        const formattedGender = formatText(gender, profileFormats['Gender']);
        const formattedAddress = formatText(address, profileFormats['Address']);
        const formattedProgram = formatText(program, profileFormats['Program']);
        const formattedYearLevel = formatText(yearLevel, profileFormats['Year Level']);

        const normalizedStatus = normalizeApplicantStatus(app.status);
        const dispStat = getDisplayStatus(app.status);

        // Header details
        if (modalName) modalName.innerText = displayName;
        if (modalMeta) modalMeta.innerText = `Student ID: ${sid} • Program: ${formattedProgram} (${formattedYearLevel})`;

        if (modalStatusBadge) {
            let badgeClass = 'badge-pending';
            let badgeIcon = 'clock';
            if (normalizedStatus === 'approved') {
                badgeClass = 'badge-approved';
                badgeIcon = 'check-circle-2';
            } else if (normalizedStatus === 'rejected' || normalizedStatus === 'declined') {
                badgeClass = 'badge-rejected';
                badgeIcon = 'x-circle';
            }
            modalStatusBadge.className = `badge-status ${badgeClass}`;
            modalStatusBadge.innerHTML = `<i data-lucide="${badgeIcon}" style="width: 12px; height: 12px;"></i> ${dispStat}`;
        }

        // Avatar
        const avatarHtml = app.profiles?.avatar_url
            ? `<img src="${app.profiles.avatar_url}" alt="${displayName}" class="modal-profile-avatar" onerror="this.onerror=null; this.outerHTML='<div class=\\'modal-profile-avatar-fallback\\'>${initials}</div>'">`
            : `<div class="modal-profile-avatar-fallback">${initials}</div>`;

        // Rejection Reason Notice (If status is Rejected / Declined / Revoked or remarks present)
        let rejectionBannerHtml = '';
        if (normalizedStatus === 'rejected' || normalizedStatus === 'declined' || normalizedStatus === 'revoked' || (app.remarks && app.remarks.trim())) {
            rejectionBannerHtml = `
                <div class="modal-rejection-card" style="margin-bottom: 20px; background: rgba(217, 72, 65, 0.08); border: 1px solid rgba(217, 72, 65, 0.25); border-radius: 12px; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <i data-lucide="alert-circle" style="width: 17px; height: 17px; color: var(--danger-color);"></i>
                        <strong style="color: var(--danger-color); font-size: 14px; font-weight: 700;">Rejection Reason & Evaluation Remarks</strong>
                    </div>
                    <p style="margin: 0; font-size: 13.5px; color: var(--text-main); line-height: 1.5; font-weight: 500;">
                        ${app.remarks || 'Application was not approved during evaluation.'}
                    </p>
                </div>
            `;
        }

        // Profile Section HTML
        let bodyHtml = `
            ${rejectionBannerHtml}
            <div class="modal-profile-card">
                <div class="modal-profile-header">
                    ${avatarHtml}
                    <div>
                        <h4 style="margin: 0 0 3px 0; font-size: 16px; font-weight: 700; color: var(--text-heading);">${formattedName}</h4>
                        <span style="font-size: 12.5px; color: var(--text-muted);">${formattedEmail} • ID: ${sid}</span>
                    </div>
                </div>

                <div class="modal-grid-fields">
                    <div class="modal-field-item">
                        <label>Student ID</label>
                        <span>${sid}</span>
                    </div>
                    <div class="modal-field-item">
                        <label>Email Address</label>
                        <span>${formattedEmail}</span>
                    </div>
                    <div class="modal-field-item">
                        <label>Contact Number</label>
                        <span>${contact}</span>
                    </div>
                    <div class="modal-field-item">
                        <label>Gender</label>
                        <span>${formattedGender}</span>
                    </div>
                    <div class="modal-field-item">
                        <label>Date of Birth</label>
                        <span>${dob}</span>
                    </div>
                    <div class="modal-field-item">
                        <label>Year Level</label>
                        <span>${formattedYearLevel}</span>
                    </div>
                    <div class="modal-field-item" style="grid-column: 1 / -1;">
                        <label>Program / Degree</label>
                        <span>${formattedProgram}</span>
                    </div>
                    <div class="modal-field-item" style="grid-column: 1 / -1;">
                        <label>Permanent Address</label>
                        <span>${formattedAddress}</span>
                    </div>
                </div>
            </div>
        `;

        // Form Responses Section HTML
        bodyHtml += `
            <div>
                <div class="modal-section-title">
                    <i data-lucide="clipboard-list"></i> Form Responses
                </div>
        `;

        const hasResponses = app.form_responses && Object.keys(app.form_responses).length > 0;
        if (hasResponses) {
            bodyHtml += `<div class="modal-response-list">`;
            const schema = activeScholarshipData?.form_fields || activeScholarshipData?.form_schema || [];

            schema.forEach(field => {
                if (field.type === 'heading' || field.type === 'text') {
                    bodyHtml += `<div class="modal-section-heading">${field.label}</div>`;
                } else {
                    const answer = app.form_responses && Object.prototype.hasOwnProperty.call(app.form_responses, field.label)
                        ? app.form_responses[field.label]
                        : '';
                    const renderedAnswer = renderFormattedAnswer(answer, field);
                    bodyHtml += `
                        <div class="form-response-card">
                            <div class="form-response-label">${field.label}</div>
                            <div class="form-response-val">${renderedAnswer}</div>
                        </div>
                    `;
                }
            });

            // Fallback for custom fields not in schema
            for (const [q, a] of Object.entries(app.form_responses || {})) {
                if (!schema.find(f => f.label === q)) {
                    const renderedAnswer = renderFormattedAnswer(a, null);
                    bodyHtml += `
                        <div class="form-response-card">
                            <div class="form-response-label">${q}</div>
                            <div class="form-response-val">${renderedAnswer}</div>
                        </div>
                    `;
                }
            }
            bodyHtml += `</div>`;
        } else {
            bodyHtml += `
                <div class="empty-response-note">
                    <i data-lucide="info" style="width: 18px; height: 18px; display: block; margin: 0 auto 6px auto; color: var(--text-light);"></i>
                    No additional form questions were configured for this assistance program.
                </div>
            `;
        }
        bodyHtml += `</div>`;

        // Documents & AI Extraction Section HTML
        bodyHtml += `
            <div>
                <div class="modal-section-title">
                    <i data-lucide="file-check"></i> Submitted Documents & Verification Data
                </div>
        `;

        if (app.documents && app.documents.length > 0) {
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';

                const actionLinks = fileUrl
                    ? `<div style="display: flex; gap: 8px; align-items: center;">
                           <button type="button" onclick="viewDocumentFull('${fileUrl}')" class="btn-outline" style="padding: 5px 12px; font-size: 12px;"><i data-lucide="maximize-2" style="width:13px; height:13px;"></i> Full View</button>
                           <button type="button" onclick="forceDownload('${fileUrl}', '${doc.name || 'document'}')" class="btn-approve" style="padding: 5px 12px; font-size: 12px;"><i data-lucide="download" style="width:13px; height:13px;"></i> Download</button>
                       </div>`
                    : '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().includes('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:360px; border:none; display:block; border-radius:8px;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; max-height:360px; object-fit:contain; display:block; margin: 0 auto; border-radius:8px;">`;
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

                bodyHtml += `
                    <div class="document-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                            <div style="font-weight:600; font-size:14px; color:var(--text-heading); display:flex; align-items:center; gap:6px;">
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
        } else {
            bodyHtml += `
                <div class="empty-response-note">
                    <i data-lucide="file-text" style="width: 18px; height: 18px; display: block; margin: 0 auto 6px auto; color: var(--text-light);"></i>
                    No document attachments were submitted with this application.
                </div>
            `;
        }
        bodyHtml += `</div>`;

        modalBody.innerHTML = bodyHtml;

        // Footer details
        if (modalDateText) modalDateText.innerText = `Applied on: ${dateStr}`;

        if (modalActionButtons) {
            let footerBtnsHtml = '';
            if (normalizedStatus === 'pending' || normalizedStatus === 'under review') {
                footerBtnsHtml = `
                    <button type="button" class="btn-reject" onclick="confirmUpdateStatus('${app.id}', 'Rejected', 'Reject')">
                        <i data-lucide="x" style="width: 14px; height: 14px;"></i> Reject
                    </button>
                    <button type="button" class="btn-approve" onclick="confirmUpdateStatus('${app.id}', 'Approved', 'Approve')">
                        <i data-lucide="check" style="width: 14px; height: 14px;"></i> Approve
                    </button>
                    <button type="button" class="btn-outline" onclick="closeApplicantModal()"><i data-lucide="x" style="width: 14px; height: 14px;"></i> Close</button>
                `;
            } else if (normalizedStatus === 'approved') {
                footerBtnsHtml = `
                    <span class="badge-status badge-approved"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Approved</span>
                    <button type="button" class="btn-outline" onclick="closeApplicantModal()"><i data-lucide="x" style="width: 14px; height: 14px;"></i> Close</button>
                `;
            } else {
                footerBtnsHtml = `
                    <button type="button" class="btn-remove" onclick="deleteApplication('${app.id}')">
                        <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Delete Application
                    </button>
                    <button type="button" class="btn-outline" onclick="closeApplicantModal()"><i data-lucide="x" style="width: 14px; height: 14px;"></i> Close</button>
                `;
            }
            modalActionButtons.innerHTML = footerBtnsHtml;
        }

        modal.style.display = 'flex';
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    window.viewApplicantDetails = window.openApplicantModal;

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

    // --- PREDEFINED REJECTION REASONS CONFIGURATION ---
    const PREDEFINED_REJECTION_REASONS = [
        {
            id: 'incomplete_docs',
            label: 'Incomplete or unclear document submissions',
            description: 'Submitted document attachments are incomplete, expired, unreadable, or missing required pages.'
        },
        {
            id: 'academic_criteria',
            label: 'Academic qualifications not met',
            description: 'Academic performance or GWA does not satisfy the minimum requirements for this program.'
        },
        {
            id: 'financial_criteria',
            label: 'Income threshold / Financial criteria exceeded',
            description: 'Household income or financial criteria exceed the maximum threshold for this educational assistance.'
        },
        {
            id: 'ineligible_program_year',
            label: 'Ineligible degree program or year level',
            description: 'Current degree program, major, or year level is not eligible under this program\'s guidelines.'
        },
        {
            id: 'slot_limit',
            label: 'Program quota / slots already filled',
            description: 'The maximum quota or slots for this educational assistance program have been fully reached.'
        },
        {
            id: 'conflicting_scholarship',
            label: 'Conflicting active scholarship or assistance',
            description: 'Applicant already holds an active educational assistance program that cannot be combined.'
        },
        {
            id: 'unverified_records',
            label: 'Institutional verification failed',
            description: 'Submitted information could not be verified against the institution\'s official enrolled masterlist.'
        },
        {
            id: 'past_deadline',
            label: 'Late submission / Deadline passed',
            description: 'Application or required supplementary documents were submitted after the designated deadline.'
        },
        {
            id: 'other',
            label: 'Other reason (Custom explanation)',
            description: 'Provide a custom reason explaining why this application is rejected.'
        }
    ];

    // --- 8. POLICY VALIDATION & APPROVAL LOGIC ---
    window.confirmUpdateStatus = async (appId, newStatus, actionName) => {
        if (newStatus === 'Approved') {
            await processApprovalWithPolicyValidation(appId);
        } else if (newStatus === 'Rejected') {
            await handleRejectWithReason(appId);
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

    async function handleRejectWithReason(appId) {
        const targetApp = currentApplications.find(a => a.id === appId);
        if (!targetApp) {
            Swal.fire('Error', 'Applicant record not found.', 'error');
            return;
        }

        const fname = targetApp.profiles?.first_name || '';
        const lname = targetApp.profiles?.last_name || '';
        const studentName = `${fname} ${lname}`.trim() || 'Applicant';
        const programTitle = activeScholarshipData?.title || 'Educational Assistance';

        let optionsHtml = PREDEFINED_REJECTION_REASONS.map((r, i) => {
            const isFirst = i === 0;
            return `<option value="${r.id}" ${isFirst ? 'selected' : ''}>${r.label}</option>`;
        }).join('');

        const initialDesc = PREDEFINED_REJECTION_REASONS[0].description;

        const { value: rejectionData } = await Swal.fire({
            title: `<div style="display:flex; align-items:center; gap:8px; justify-content:center; color: #D94841; font-size:18px; font-weight:700;"><i data-lucide="x-circle" style="width:22px; height:22px;"></i> Reject Application</div>`,
            html: `
                <div style="text-align: left; font-size: 13.5px; color: var(--text-main); line-height: 1.5;">
                    <div style="background: rgba(217, 72, 65, 0.08); border: 1px solid rgba(217, 72, 65, 0.25); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
                        <strong style="color: var(--text-heading); display: block; font-size: 13.5px;">Applicant: ${studentName}</strong>
                        <span style="color: var(--text-muted); font-size: 12px;">Program: ${programTitle}</span>
                    </div>

                    <label for="swal-reject-select" style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; color: var(--text-heading);">
                        Select Rejection Reason <span style="color: #D94841;">*</span>
                    </label>
                    <select id="swal-reject-select" class="swal2-select" style="width: 100%; margin: 0 0 8px 0; padding: 10px 12px; font-size: 13px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-main);">
                        ${optionsHtml}
                    </select>

                    <div id="swal-reason-desc" style="font-size: 12px; color: var(--text-muted); background: var(--card-bg-secondary); padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; border: 1px solid var(--border-color); line-height: 1.45;">
                        ${initialDesc}
                    </div>

                    <div id="swal-custom-container" style="display: none; margin-bottom: 14px;">
                        <label for="swal-custom-reason" style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; color: var(--text-heading);">
                            Specify Custom Reason <span style="color: #D94841;">*</span>
                        </label>
                        <textarea id="swal-custom-reason" rows="3" placeholder="Provide a brief and precise explanation for rejecting this application..." style="width: 100%; padding: 10px 12px; font-size: 13px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-main); resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                    </div>

                    <div id="swal-notes-container" style="margin-bottom: 6px;">
                        <label for="swal-optional-notes" style="display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px; color: var(--text-muted);">
                            Additional notes or specific guidance for student (optional)
                        </label>
                        <input id="swal-optional-notes" type="text" placeholder="e.g. You may reapply once 2nd semester grades are available." style="width: 100%; padding: 8px 12px; font-size: 12.5px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-main); box-sizing: border-box;">
                    </div>

                    <div style="font-size: 11.5px; color: var(--text-light); margin-top: 10px; display: flex; align-items: flex-start; gap: 5px;">
                        <i data-lucide="info" style="width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px;"></i>
                        <span>This reason will be visible to the student in their View Details modal and included in their notifications.</span>
                    </div>
                </div>
            `,
            width: '540px',
            showCancelButton: true,
            confirmButtonColor: '#D94841',
            cancelButtonColor: '#586F62',
            confirmButtonText: 'Confirm Rejection',
            cancelButtonText: 'Cancel',
            didOpen: () => {
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                const selectEl = document.getElementById('swal-reject-select');
                const descEl = document.getElementById('swal-reason-desc');
                const customContainer = document.getElementById('swal-custom-container');
                const customInput = document.getElementById('swal-custom-reason');
                const notesContainer = document.getElementById('swal-notes-container');

                selectEl.addEventListener('change', () => {
                    const selectedId = selectEl.value;
                    const selectedObj = PREDEFINED_REJECTION_REASONS.find(r => r.id === selectedId);
                    if (selectedObj) {
                        descEl.innerText = selectedObj.description;
                    }

                    if (selectedId === 'other') {
                        customContainer.style.display = 'block';
                        descEl.style.display = 'none';
                        notesContainer.style.display = 'none';
                        if (customInput) customInput.focus();
                    } else {
                        customContainer.style.display = 'none';
                        descEl.style.display = 'block';
                        notesContainer.style.display = 'block';
                    }
                });
            },
            preConfirm: () => {
                const selectEl = document.getElementById('swal-reject-select');
                const customInput = document.getElementById('swal-custom-reason');
                const notesInput = document.getElementById('swal-optional-notes');
                const selectedId = selectEl ? selectEl.value : '';

                if (!selectedId) {
                    Swal.showValidationMessage('Please select a rejection reason.');
                    return false;
                }

                if (selectedId === 'other') {
                    const customText = customInput ? customInput.value.trim() : '';
                    if (!customText) {
                        Swal.showValidationMessage('Please provide your custom rejection reason.');
                        return false;
                    }
                    return { reason: customText, isCustom: true };
                } else {
                    const selectedObj = PREDEFINED_REJECTION_REASONS.find(r => r.id === selectedId);
                    const baseDesc = selectedObj ? selectedObj.description : 'Application requirements were not satisfied.';
                    const notes = notesInput ? notesInput.value.trim() : '';
                    const fullReason = notes ? `${baseDesc} (${notes})` : baseDesc;
                    return { reason: fullReason, isCustom: false };
                }
            }
        });

        if (rejectionData && rejectionData.reason) {
            await logSystemAction('Applicant Rejected', `Rejected with reason: "${rejectionData.reason}"`, targetApp.student_id);
            await updateStatus(appId, 'Rejected', rejectionData.reason);
        }
    }

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

    window.updateStatus = async (appId, newStatus, reason = '') => {
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
            if (newStatus === 'Rejected' || newStatus === 'Declined') {
                updatePayload.remarks = reason || targetApp.remarks || 'Application not approved during evaluation.';
            } else if (newStatus === 'Approved') {
                updatePayload.remarks = null;
            }

            const { error: updateError } = await window.supabaseClient
                .from('applications')
                .update(updatePayload)
                .eq('id', appId);

            if (updateError) throw updateError;

            // Update targetApp in local memory
            targetApp.status = newStatus;
            targetApp.remarks = updatePayload.remarks;

            const schName = targetApp.scholarships ? targetApp.scholarships.title : (activeScholarshipData?.title || 'the educational assistance program');

            // Dynamic Notification Messaging based on evaluation
            let notifTitle = `Application Update`;
            let notifMsg = `Your application for ${schName} has been updated to ${newStatus}.`;
            let notifHtml = '';

            if (newStatus === 'Approved') {
                notifTitle = 'Application Approved';
                notifMsg = `Congratulations! Your application for "${schName}" has been approved.`;
                notifHtml = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: #6B7F4E; margin-top: 0;">Application Approved</h2>
                        <p>Congratulations! Your application for <strong>${schName}</strong> has been evaluated and approved.</p>
                        <p>Please log in to your student dashboard to view your grantee status and benefits.</p>
                    </div>
                `;
            } else if (newStatus === 'Declined' || newStatus === 'Rejected') {
                const finalRejectionReason = updatePayload.remarks || 'Application requirements not met.';
                notifTitle = 'Application Rejected';
                notifMsg = `Your application for "${schName}" has been rejected. Reason: ${finalRejectionReason}`;
                notifHtml = `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: #D94841; margin-top: 0;">Application Rejected</h2>
                        <p>Dear student,</p>
                        <p>We regret to inform you that your application for <strong>${schName}</strong> was not approved following evaluation.</p>
                        <div style="margin: 16px 0; padding: 14px 18px; background-color: #fef2f2; border-left: 4px solid #D94841; border-radius: 6px;">
                            <strong style="color: #991b1b; display: block; margin-bottom: 4px; font-size: 13px;">Reason for Rejection:</strong>
                            <span style="color: #374151; font-size: 14px; line-height: 1.5;">${finalRejectionReason}</span>
                        </div>
                        <p style="font-size: 13px; color: #64748b;">Log in to your student portal to review your application details.</p>
                    </div>
                `;
            }

            // Direct in-app notification insert to Supabase for immediate real-time delivery
            if (targetApp.student_id) {
                try {
                    await window.supabaseClient.from('notifications').insert([{
                        user_id: targetApp.student_id,
                        title: notifTitle,
                        message: notifMsg,
                        is_read: false,
                        type: 'application',
                        priority: newStatus === 'Approved' ? 'low' : 'high',
                        action_link: `student-applications.html?app_id=${appId}`
                    }]);
                } catch (notifErr) {
                    console.warn("Direct in-app notification insert warning:", notifErr);
                }
            }

            // Dispatch notification payload for Brevo email dispatch
            const payload = {
                userIds: [targetApp.student_id],
                eventType: 'applications',
                resourceId: appId,
                subject: notifTitle,
                message: notifMsg,
                htmlContent: notifHtml
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

            if (typeof closeApplicantModal === 'function') {
                closeApplicantModal();
            }

            await Swal.fire('Success!', `Applicant successfully ${newStatus === 'Approved' ? 'Approved' : 'Rejected'}.`, 'success');
            loadApplicationsForActiveTab();

        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Failed to update status: ' + (err.message || ''), 'error');
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

                if (typeof closeApplicantModal === 'function') {
                    closeApplicantModal();
                }

                await logSystemAction('Deleted Application', `Deleted application ID: ${appId}`);
                await Swal.fire('Deleted!', 'The application has been deleted.', 'success');
                loadApplicationsForActiveTab();
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Failed to delete application.', 'error');
            }
        }
    };

    window.viewApplicantDetails = window.openApplicantModal;

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

    function sanitizeFilename(name) {
        if (!name || typeof name !== 'string') return 'Educational_Assistance';
        return name
            .replace(/[^a-zA-Z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function exportToCSV(appsToExport, targetStatus) {
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM for Excel compatibility

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
            const date = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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

        const programName = sanitizeFilename(activeScholarshipData?.title);
        const statusTag = sanitizeFilename(targetStatus === 'All' ? 'All' : targetStatus);
        const filename = `${programName}_${statusTag}_Applicants_Export_${new Date().getTime()}.csv`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
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

        const schTitle = activeScholarshipData?.title || 'Educational Assistance';
        const displayLabel = targetStatus === 'All' ? 'All Applicants' : `${targetStatus} Applicants`;

        doc.setFontSize(16);
        doc.setTextColor(31, 61, 46);
        doc.text(`${displayLabel} - ${schTitle}`, 40, 38);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • Total Records: ${appsToExport.length}`, 40, 54);

        const tableColumn = ["#", "Student ID", "Full Name", "Program & Year", "Contact", "Email", "Evaluation Status", "Date Applied"];
        const tableRows = [];

        appsToExport.forEach((app, index) => {
            const sid = app.profiles?.id_number || 'N/A';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '') || 'Applicant';
            const program = app.profiles?.program || 'N/A';
            const yearLevel = app.profiles?.year_level || 'N/A';
            const progYear = `${program}\n(${yearLevel})`;
            const contact = app.profiles?.contact_number || 'N/A';
            const email = app.profiles?.email || 'N/A';
            const status = getDisplayStatus(app.status);
            const date = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            tableRows.push([index + 1, sid, fullName, progYear, contact, email, status, date]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 68,
            styles: { fontSize: 8, cellPadding: 5 },
            headStyles: { fillColor: [107, 127, 78], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [244, 246, 242] },
            columnStyles: {
                0: { cellWidth: 24 },
                1: { cellWidth: 70 },
                2: { cellWidth: 120 },
                3: { cellWidth: 100 },
                4: { cellWidth: 80 },
                5: { cellWidth: 120 },
                6: { cellWidth: 85, fontStyle: 'bold' },
                7: { cellWidth: 70 }
            }
        });

        const programName = sanitizeFilename(activeScholarshipData?.title);
        const statusTag = sanitizeFilename(targetStatus === 'All' ? 'All' : targetStatus);
        const filename = `${programName}_${statusTag}_Applicants_Export_${new Date().getTime()}.pdf`;

        doc.save(filename);
    }

    window.exportAllApplicants = (format) => {
        closeExportDropdown();
        const appsToExport = currentApplications || [];

        if (!appsToExport || appsToExport.length === 0) {
            Swal.fire('Empty', 'No applicant records found for this educational assistance program.', 'info');
            return;
        }

        if (format === 'csv') {
            exportToCSV(appsToExport, 'All');
        } else if (format === 'pdf') {
            exportToPDF(appsToExport, 'All');
        }
    };

    window.exportCurrentTab = window.exportAllApplicants;

    window.exportPendingList = () => {
        closeExportDropdown();
        exportByStatus('Pending');
    };
    window.exportApprovedList = () => {
        closeExportDropdown();
        exportByStatus('Approved');
    };
    window.exportGranteeList = window.exportApprovedList;
    window.exportRejectedList = () => {
        closeExportDropdown();
        exportByStatus('Rejected');
    };

    function closeExportDropdown() {
        const menu = document.getElementById('export-dropdown-menu');
        const wrapper = document.querySelector('.export-dropdown-wrapper');
        if (menu) menu.classList.remove('show');
        if (wrapper) wrapper.classList.remove('open');
        const toggleBtn = document.getElementById('export-dropdown-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleExportDropdown(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('export-dropdown-menu');
        const wrapper = document.querySelector('.export-dropdown-wrapper');
        const toggleBtn = document.getElementById('export-dropdown-toggle');
        if (!menu) return;

        const isOpen = menu.classList.contains('show');
        if (isOpen) {
            closeExportDropdown();
        } else {
            menu.classList.add('show');
            if (wrapper) wrapper.classList.add('open');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        }
    }

    // Export Dropdown Click Listeners
    const exportToggleBtn = document.getElementById('export-dropdown-toggle');
    if (exportToggleBtn) {
        exportToggleBtn.addEventListener('click', toggleExportDropdown);
    }

    document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.export-dropdown-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            closeExportDropdown();
        }
    });

    // Modal Event Listeners (Backdrop click and Escape key)
    const appModal = document.getElementById('applicant-modal');
    if (appModal) {
        appModal.addEventListener('click', (e) => {
            if (e.target.id === 'applicant-modal') {
                closeApplicantModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeExportDropdown();
            const modalEl = document.getElementById('applicant-modal');
            if (modalEl && modalEl.style.display === 'flex') {
                closeApplicantModal();
            }
        }
    });

    // INIT
    showProgramCardsSkeleton();
    await loadProfile();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
})();
