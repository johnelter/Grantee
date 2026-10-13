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

    // --- RANKED SHORTLIST & EDUCATIONAL CRITERIA STATE ---
    let rankedShortlist = [];
    let allEvaluatedShortlist = [];
    let filteredShortlist = [];
    let shortlistFilterTier = 'all';
    let shortlistFilterGwa = 'all';
    let shortlistFilterProgram = 'all';
    let shortlistFilterYear = 'all';
    let shortlistFilterMinScore = 0;
    let shortlistSearchTerm = '';
    let shortlistSummaryData = null;

    // --- HTML ESCAPE HELPER ---
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- MODERN TOAST NOTIFICATION UTILITY (TOP CENTER - LIGHT & DARK THEME) ---
    function showUIToast(type = 'success', title = '', message = '', duration = 4000) {
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
            iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            if (!title) title = 'Success';
        } else if (type === 'error') {
            iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            if (!title) title = 'Error';
        } else if (type === 'info') {
            iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            if (!title) title = 'Info';
        } else if (type === 'warning') {
            iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
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
            }, 320);
        };

        const closeBtn = toast.querySelector('.toast-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissToast();
            });
        }

        const autoDismissTimer = setTimeout(dismissToast, duration || 3800);

        toast.addEventListener('mouseenter', () => {
            clearTimeout(autoDismissTimer);
        });

        toast.addEventListener('mouseleave', () => {
            if (!isDismissed) {
                setTimeout(dismissToast, 2000);
            }
        });
    }

    window.showUIToast = showUIToast;
    window.showToast = showUIToast;

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
        if (value === 'waitlisted' || value === 'waitlist') return 'waitlisted';
        if (value === 'pending' || value === 'under review' || value === 'submitted' || value === 'review') return 'pending';
        return value || 'pending';
    };

    const getDisplayStatus = (status) => {
        const normalized = normalizeApplicantStatus(status);
        if (normalized === 'approved') return 'Approved';
        if (normalized === 'rejected') return 'Rejected';
        if (normalized === 'waitlisted') return 'Waitlisted';
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
                        <span>${schoolName}</span>
                    `;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                }

                // Remove loading skeleton from header
                const headerTitlesBox = document.getElementById('header-titles-box');
                if (headerTitlesBox) {
                    headerTitlesBox.classList.remove('is-loading');
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
            const headerTitlesBox = document.getElementById('header-titles-box');
            if (headerTitlesBox) {
                headerTitlesBox.classList.remove('is-loading');
            }
            showUIToast('error', 'Error', 'Failed to load profile data.');
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
    async function loadScholarships(autoOpenFromUrl = true) {
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
            window.allScholarships = allScholarships;

            // Global shortcut to open Ranked Shortlist tab directly from anywhere
            window.openRankedShortlist = (scholarshipId) => {
                const list = window.allScholarships || allScholarships || [];
                const found = list.find(s => String(s.id) === String(scholarshipId));
                if (found) {
                    window.openScholarship(found, 'Shortlist');
                } else {
                    window.openScholarship(scholarshipId, 'Shortlist');
                }
            };

            renderScholarshipCards();

            // Auto-open target scholarship if provided in URL parameter (e.g. from Dashboard Top Scholarships, Metric Modals, etc.)
            if (autoOpenFromUrl) {
                const urlParams = new URLSearchParams(window.location.search);
                const targetScholId = urlParams.get('scholarship_id') || urlParams.get('id');
                const targetStatus = urlParams.get('status') || urlParams.get('tab');
                const targetApplicantId = urlParams.get('applicant_id') || urlParams.get('app_id') || urlParams.get('applicant');

                if (targetScholId) {
                    const targetSchol = allScholarships.find(s => String(s.id) === String(targetScholId));
                    if (targetSchol) {
                        await openScholarship(targetSchol, targetStatus, targetApplicantId);
                    }
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
            const waitlistedCount = apps.filter(a => normalizeApplicantStatus(a.status) === 'waitlisted').length;

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
                    ${waitlistedCount > 0 ? `
                    <div style="text-align:center;">
                        <span class="card-stat-label" style="color: #b45309;">Waitlisted</span>
                        <span style="font-weight: 700; color: #d97706; font-size: 14px;">${waitlistedCount}</span>
                    </div>
                    ` : ''}
                    <div style="text-align:right;">
                        <span class="card-stat-label">Approved</span>
                        <span class="card-stat-val-approved">${approvedCount}</span>
                    </div>
                </div>

                <button type="button" class="btn-card-shortlist" onclick="event.stopPropagation(); if (window.openRankedShortlist) { window.openRankedShortlist('${sch.id}'); } else { window.openScholarship('${sch.id}', 'Shortlist'); }">
                    <i data-lucide="sparkles" style="width: 14px; height: 14px;"></i> View Ranked Shortlist
                </button>
            `;

            // Explicit direct event listener for maximum reliability
            const shortlistBtn = card.querySelector('.btn-card-shortlist');
            if (shortlistBtn) {
                shortlistBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.openScholarship(sch, 'Shortlist');
                };
            }

            cardsContainer.appendChild(card);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    // --- 5. VIEW APPLICANTS FOR A PROGRAM ---
    window.openScholarship = async (scholarshipObj, initialTab, targetApplicantId) => {
        if (scholarshipObj && typeof scholarshipObj !== 'object') {
            const list = window.allScholarships || allScholarships || [];
            scholarshipObj = list.find(s => String(s.id) === String(scholarshipObj)) || { id: String(scholarshipObj), title: 'Educational Assistance Program' };
        }
        if (!scholarshipObj) return;

        activeScholarshipData = scholarshipObj;
        const titleEl = document.getElementById('active-sch-title');
        if (titleEl) titleEl.innerText = scholarshipObj.title;

        if (viewGrid) viewGrid.style.display = 'none';
        if (viewList) viewList.style.display = 'block';

        let targetTab = 'Pending';
        if (initialTab) {
            const norm = initialTab.trim().toLowerCase();
            if (norm === 'shortlist' || norm === 'ranked') targetTab = 'Shortlist';
            else if (norm === 'approved') targetTab = 'Approved';
            else if (norm === 'waitlisted' || norm === 'waitlist') targetTab = 'Waitlisted';
            else if (norm === 'rejected' || norm === 'declined') targetTab = 'Rejected';
            else targetTab = 'Pending';
        }

        activeTabStatus = targetTab;
        const sortSelect = document.getElementById('sort-date-select');
        if (sortSelect) {
            if (targetTab === 'Pending' || targetTab === 'Waitlisted') {
                sortSelect.value = 'asc';
            }
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            const onclickAttr = btn.getAttribute('onclick') || '';
            if (onclickAttr.includes(`'${targetTab}'`)) {
                btn.classList.add('active');
            }
        });
        const shortlistTabBtn = document.getElementById('tab-btn-shortlist');
        if (targetTab === 'Shortlist' && shortlistTabBtn) {
            shortlistTabBtn.classList.add('active');
        }

        const badge = document.getElementById('main-status-badge');
        if (badge) {
            if (targetTab === 'Shortlist') {
                badge.innerHTML = `<i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> Ranked Shortlist & Merit Evaluation`;
                badge.className = 'badge-status badge-approved';
            } else if (targetTab === 'Pending') {
                badge.innerHTML = `<i data-lucide="clock" style="width: 12px; height: 12px;"></i> Pending Evaluation`;
                badge.className = 'badge-status badge-pending';
            } else if (targetTab === 'Waitlisted') {
                badge.innerHTML = `<i data-lucide="list-ordered" style="width: 12px; height: 12px;"></i> Waitlisted Applicants`;
                badge.className = 'badge-status badge-revision';
            } else if (targetTab === 'Approved') {
                badge.innerHTML = `<i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Approved Applicants`;
                badge.className = 'badge-status badge-approved';
            } else if (targetTab === 'Rejected') {
                badge.innerHTML = `<i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Rejected Applicants`;
                badge.className = 'badge-status badge-rejected';
            }
        }

        const overviewContainer = document.getElementById('shortlist-overview-container');
        const filtersPanel = document.getElementById('shortlist-filters-panel');
        const stdControls = document.getElementById('standard-table-controls');
        const thead = document.getElementById('applicants-table-thead');

        if (targetTab === 'Shortlist') {
            if (overviewContainer) overviewContainer.style.display = 'block';
            if (filtersPanel) filtersPanel.style.display = 'flex';
            if (stdControls) stdControls.style.display = 'none';
            if (thead) {
                thead.innerHTML = `
                    <tr>
                        <th style="width: 62px;">Rank</th>
                        <th>Candidate Name & ID</th>
                        <th>Program & Year</th>
                        <th>Academic Merit (GWA)</th>
                        <th>Qualification Score</th>
                        <th>Shortlist Status & Recommendation</th>
                        <th style="text-align: right;">Evaluation Actions</th>
                    </tr>
                `;
            }
        } else {
            if (overviewContainer) overviewContainer.style.display = 'none';
            if (filtersPanel) filtersPanel.style.display = 'none';
            if (stdControls) stdControls.style.display = 'flex';
            if (thead) {
                thead.innerHTML = `
                    <tr>
                        <th style="width: 48px;">#</th>
                        <th>Applicant Name</th>
                        <th>Student ID</th>
                        <th>Email</th>
                        <th>Date Applied</th>
                        <th>Evaluation Status</th>
                        <th style="text-align: right;"></th>
                    </tr>
                `;
            }
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        await loadApplicationsForActiveTab();

        // If targetApplicantId was specified, switch to their status tab if needed and open their View Responses modal
        if (targetApplicantId && currentApplications && currentApplications.length > 0) {
            const targetApp = currentApplications.find(a => String(a.id) === String(targetApplicantId));
            if (targetApp) {
                const appNorm = normalizeApplicantStatus(targetApp.status);
                let neededTab = 'Pending';
                if (appNorm === 'approved') neededTab = 'Approved';
                else if (appNorm === 'waitlisted') neededTab = 'Waitlisted';
                else if (appNorm === 'rejected') neededTab = 'Rejected';

                if (activeTabStatus !== neededTab) {
                    window.switchTab(neededTab);
                }

                setTimeout(() => {
                    if (typeof window.openApplicantModal === 'function') {
                        window.openApplicantModal(targetApp.id);
                    }
                }, 100);
            }
        }
    };

    window.showGrid = () => {
        try {
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) {
            console.warn("Could not clean URL search params:", e);
        }

        if (typeof window.closeApplicantModal === 'function') {
            window.closeApplicantModal();
        }

        activeScholarshipData = null;
        currentApplications = [];

        if (viewList) viewList.style.display = 'none';
        if (viewGrid) viewGrid.style.display = 'block';

        loadScholarships(false);
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
                .select('*, profiles ( first_name, middle_name, last_name, id_number, email, contact_number, date_of_birth, gender, address, program, year_level, avatar_url, gwa ), scholarships (title)')
                .eq('scholarship_id', activeScholarshipData.id)
                .order('created_at', { ascending: true });

            if (error) {
                console.error("Supabase load applications error:", error);
                throw error;
            }

            currentApplications = (apps || []).filter(a => (a.status || '').toLowerCase() !== 'draft');

            // Generate Ranked Shortlist based on educational criteria
            await generateRankedShortlist();

            // Update Tab Badge Counts
            const pendingCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'pending').length;
            const waitlistedCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'waitlisted').length;
            const approvedCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'approved').length;
            const rejectedCount = currentApplications.filter(a => normalizeApplicantStatus(a.status) === 'rejected').length;
            const qualifiedCount = rankedShortlist.filter(c => c.is_strictly_eligible).length;

            if (document.getElementById('tab-count-pending')) document.getElementById('tab-count-pending').innerText = pendingCount;
            if (document.getElementById('tab-count-waitlisted')) document.getElementById('tab-count-waitlisted').innerText = waitlistedCount;
            if (document.getElementById('tab-count-approved')) document.getElementById('tab-count-approved').innerText = approvedCount;
            if (document.getElementById('tab-count-rejected')) document.getElementById('tab-count-rejected').innerText = rejectedCount;
            if (document.getElementById('tab-count-shortlist')) document.getElementById('tab-count-shortlist').innerText = rankedShortlist.length;

            const overviewContainer = document.getElementById('shortlist-overview-container');
            const filtersPanel = document.getElementById('shortlist-filters-panel');
            const stdControls = document.getElementById('standard-table-controls');

            if (activeTabStatus === 'Shortlist') {
                if (overviewContainer) overviewContainer.style.display = 'block';
                if (filtersPanel) filtersPanel.style.display = 'flex';
                if (stdControls) stdControls.style.display = 'none';

                renderShortlistOverview();
                renderShortlistFilters();
                filterShortlist();
            } else {
                if (overviewContainer) overviewContainer.style.display = 'none';
                if (filtersPanel) filtersPanel.style.display = 'none';
                if (stdControls) stdControls.style.display = 'flex';

                filterTable();
            }

        } catch (err) {
            console.error("Error loading applications:", err);
            const tbody = document.getElementById('applicants-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger-color); text-align:center; padding:36px; font-size:13.5px;"><i data-lucide="alert-circle" style="width:18px; height:18px; display:inline-block; vertical-align:middle; margin-right:6px;"></i> Failed to load applicants: ${err.message || 'Check console'}.</td></tr>`;
            }
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    }

    window.switchTab = async (status) => {
        activeTabStatus = status;

        const sortSelect = document.getElementById('sort-date-select');
        if (sortSelect && (status === 'Pending' || status === 'Waitlisted')) {
            sortSelect.value = 'asc';
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${status}'`)) {
                btn.classList.add('active');
            }
        });
        const shortlistTabBtn = document.getElementById('tab-btn-shortlist');
        if (status === 'Shortlist' && shortlistTabBtn) {
            shortlistTabBtn.classList.add('active');
        }

        const badge = document.getElementById('main-status-badge');
        if (badge) {
            if (status === 'Shortlist') {
                badge.innerHTML = `<i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> Ranked Shortlist & Merit Evaluation`;
                badge.className = 'badge-status badge-approved';
            } else if (status === 'Pending') {
                badge.innerHTML = `<i data-lucide="clock" style="width: 12px; height: 12px;"></i> Pending Evaluation`;
                badge.className = 'badge-status badge-pending';
            } else if (status === 'Waitlisted') {
                badge.innerHTML = `<i data-lucide="list-ordered" style="width: 12px; height: 12px;"></i> Waitlisted Applicants`;
                badge.className = 'badge-status badge-revision';
            } else if (status === 'Approved') {
                badge.innerHTML = `<i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Approved Applicants`;
                badge.className = 'badge-status badge-approved';
            } else if (status === 'Rejected') {
                badge.innerHTML = `<i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Rejected Applicants`;
                badge.className = 'badge-status badge-rejected';
            }
        }

        const overviewContainer = document.getElementById('shortlist-overview-container');
        const filtersPanel = document.getElementById('shortlist-filters-panel');
        const stdControls = document.getElementById('standard-table-controls');
        const thead = document.getElementById('applicants-table-thead');

        if (status === 'Shortlist') {
            if (overviewContainer) overviewContainer.style.display = 'block';
            if (filtersPanel) filtersPanel.style.display = 'flex';
            if (stdControls) stdControls.style.display = 'none';

            if (thead) {
                thead.innerHTML = `
                    <tr>
                        <th style="width: 62px;">Rank</th>
                        <th>Candidate Name & ID</th>
                        <th>Program & Year</th>
                        <th>Academic Merit (GWA)</th>
                        <th>Qualification Score</th>
                        <th>Shortlist Status & Recommendation</th>
                        <th style="text-align: right;">Evaluation Actions</th>
                    </tr>
                `;
            }
            if (!rankedShortlist || rankedShortlist.length === 0) {
                await generateRankedShortlist();
            }
            renderShortlistOverview();
            renderShortlistFilters();
            filterShortlist();
        } else {
            if (overviewContainer) overviewContainer.style.display = 'none';
            if (filtersPanel) filtersPanel.style.display = 'none';
            if (stdControls) stdControls.style.display = 'flex';

            if (thead) {
                thead.innerHTML = `
                    <tr>
                        <th style="width: 48px;">#</th>
                        <th>Applicant Name</th>
                        <th>Student ID</th>
                        <th>Email</th>
                        <th>Date Applied</th>
                        <th>Evaluation Status</th>
                        <th style="text-align: right;"></th>
                    </tr>
                `;
            }

            if (!currentApplications || currentApplications.length === 0) {
                await loadApplicationsForActiveTab();
            } else {
                filterTable();
            }
        }

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    // --- 6. TABLE WITH SORTING ---
    window.filterTable = () => {
        if (activeTabStatus === 'Shortlist') {
            filterShortlist();
            return;
        }

        const thead = document.getElementById('applicants-table-thead');
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width: 48px;">#</th>
                    <th>Applicant Name</th>
                    <th>Student ID</th>
                    <th>Email</th>
                    <th>Date Applied</th>
                    <th>Evaluation Status</th>
                    <th style="text-align: right;"></th>
                </tr>
            `;
        }

        const searchInput = document.getElementById('search-applicant');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const sortSelect = document.getElementById('sort-date-select');
        const sortOrder = sortSelect ? sortSelect.value : (activeTabStatus === 'Pending' || activeTabStatus === 'Waitlisted' ? 'asc' : 'desc');
        const tbody = document.getElementById('applicants-tbody');
        if (!tbody) return;

        let filteredApps = (currentApplications || []).filter(app => {
            const currentAppStatus = normalizeApplicantStatus(app.status);

            const matchStatus = activeTabStatus === 'Pending'
                ? (currentAppStatus === 'pending')
                : activeTabStatus === 'Waitlisted'
                    ? (currentAppStatus === 'waitlisted')
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

        // Update Waitlist Notice & Slot Extension Quick Action Banner
        const waitlistBanner = document.getElementById('waitlist-extend-banner');
        if (waitlistBanner) {
            if (activeTabStatus === 'Waitlisted' && filteredApps.length > 0) {
                waitlistBanner.style.display = 'block';
                waitlistBanner.innerHTML = `
                    <div style="background: rgba(245, 158, 11, 0.1); border: 1.5px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 260px; flex: 1;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(245, 158, 11, 0.2); color: #d97706; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i data-lucide="clock" style="width: 18px; height: 18px;"></i>
                            </div>
                            <div>
                                <div style="font-weight: 700; color: #b45309; font-size: 13.5px;">${filteredApps.length} Waitlisted Applicant(s) in Queue</div>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 1px;">When you extend application slots, waitlisted applicants covered by the new slots are automatically promoted to <b>Pending</b> in order of submission!</div>
                            </div>
                        </div>
                        <a href="admin-scholarships.html" class="btn-primary" style="padding: 7px 15px; font-size: 12.5px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;">
                            <i data-lucide="user-plus" style="width: 14px; height: 14px;"></i> Extend Slots in Educational Assistance
                        </a>
                    </div>
                `;
            } else {
                waitlistBanner.style.display = 'none';
            }
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
            } else if (normalizedStatus === 'waitlisted') {
                statusClass = 'badge-revision';
                statusIcon = 'list-ordered';
                displayStatus = 'Waitlisted';
            } else if (normalizedStatus === 'rejected') {
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
            } else if (activeTabStatus === 'Waitlisted') {
                // Coordinators can view waitlisted applicant details/responses but CANNOT approve or reject them
                actionsHtml = `
                    <div style="display:flex; gap:8px; justify-content: flex-end; align-items: center;">
                        <span class="count-pill" style="font-size: 11.5px; padding: 4px 10px; background: rgba(245, 158, 11, 0.12); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.3);">
                            <i data-lucide="lock" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 3px;"></i> Waitlisted (Locked)
                        </span>
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
            showUIToast('error', 'Error', 'Applicant data not found.');
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
            } else if (normalizedStatus === 'waitlisted') {
                badgeClass = 'badge-revision';
                badgeIcon = 'list-ordered';
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

        // Rejection / Waitlist / Decision / Remarks Notice
        let rejectionBannerHtml = '';
        if (normalizedStatus === 'rejected' || normalizedStatus === 'declined' || normalizedStatus === 'revoked') {
            const isRevoked = normalizedStatus === 'revoked';
            rejectionBannerHtml = `
                <div class="modal-rejection-card" style="margin-bottom: 20px; background: rgba(217, 72, 65, 0.08); border: 1px solid rgba(217, 72, 65, 0.25); border-radius: 12px; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <i data-lucide="alert-circle" style="width: 17px; height: 17px; color: var(--danger-color);"></i>
                        <strong style="color: var(--danger-color); font-size: 14px; font-weight: 700;">${isRevoked ? 'Revocation Reason & Remarks' : 'Rejection Reason & Evaluation Remarks'}</strong>
                    </div>
                    <p style="margin: 0; font-size: 13.5px; color: var(--text-main); line-height: 1.5; font-weight: 500;">
                        ${app.remarks || (isRevoked ? 'Beneficiary status was revoked by the institution.' : 'Application was not approved during evaluation.')}
                    </p>
                </div>
            `;
        } else if (normalizedStatus === 'waitlisted') {
            rejectionBannerHtml = `
                <div class="modal-waitlist-card" style="margin-bottom: 20px; background: rgba(245, 158, 11, 0.09); border: 1px solid rgba(245, 158, 11, 0.3); border-left: 4px solid #f59e0b; border-radius: 12px; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <i data-lucide="list-ordered" style="width: 17px; height: 17px; color: #d97706;"></i>
                        <strong style="color: #b45309; font-size: 14px; font-weight: 700;">Waitlist Status & Information</strong>
                    </div>
                    <p style="margin: 0; font-size: 13.5px; color: var(--text-main); line-height: 1.5; font-weight: 500;">
                        ${app.remarks || 'This applicant was placed on the Waitlist due to exhausted primary slots. Evaluation actions are locked.'}
                    </p>
                </div>
            `;
        } else if ((normalizedStatus === 'approved' || normalizedStatus === 'grantee' || normalizedStatus === 'passed') && app.remarks && app.remarks.trim()) {
            rejectionBannerHtml = `
                <div class="modal-approval-card" style="margin-bottom: 20px; background: rgba(107, 127, 78, 0.09); border: 1px solid rgba(107, 127, 78, 0.28); border-left: 4px solid var(--moss-green, #6B7F4E); border-radius: 12px; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <i data-lucide="check-circle-2" style="width: 17px; height: 17px; color: var(--moss-green, #6B7F4E);"></i>
                        <strong style="color: var(--moss-green, #6B7F4E); font-size: 14px; font-weight: 700;">Approval Remarks & Evaluation Notes</strong>
                    </div>
                    <p style="margin: 0; font-size: 13.5px; color: var(--text-main); line-height: 1.5; font-weight: 500;">
                        ${app.remarks}
                    </p>
                </div>
            `;
        } else if (app.remarks && app.remarks.trim()) {
            rejectionBannerHtml = `
                <div class="modal-remarks-card" style="margin-bottom: 20px; background: rgba(100, 116, 139, 0.08); border: 1px solid rgba(100, 116, 139, 0.25); border-radius: 12px; padding: 16px 20px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <i data-lucide="info" style="width: 17px; height: 17px; color: var(--text-muted);"></i>
                        <strong style="color: var(--text-heading); font-size: 14px; font-weight: 700;">Evaluation Remarks & Notes</strong>
                    </div>
                    <p style="margin: 0; font-size: 13.5px; color: var(--text-main); line-height: 1.5; font-weight: 500;">
                        ${app.remarks}
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
                `;
            } else if (normalizedStatus === 'waitlisted') {
                footerBtnsHtml = `
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); padding: 8px 14px; border-radius: 8px; color: #b45309; font-size: 13px; font-weight: 500;">
                            <i data-lucide="lock" style="width: 16px; height: 16px; color: #f59e0b;"></i>
                            <span><strong>Waitlisted Application:</strong> Evaluation & Approval actions are locked. Waitlisted applicants will be promoted in order when a primary slot opens up.</span>
                        </div>
                        <button type="button" class="btn-outline" onclick="closeApplicantModal()">Close</button>
                    </div>
                `;
            } else if (normalizedStatus === 'approved') {
                footerBtnsHtml = `
                    <span class="badge-status badge-approved"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Approved</span>
                `;
            } else {
                footerBtnsHtml = `
                    <button type="button" class="btn-remove" onclick="deleteApplication('${app.id}')">
                        <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i> Delete Application
                    </button>
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
        const targetApp = currentApplications.find(a => a.id === appId);
        if (targetApp && normalizeApplicantStatus(targetApp.status) === 'waitlisted') {
            await Swal.fire({
                title: 'Action Restricted',
                html: 'This applicant is currently on the <strong>Waitlist</strong>.<br><br>Coordinators cannot approve or reject waitlisted applicants while they are waiting in the queue.',
                icon: 'warning',
                confirmButtonColor: '#1F3D2E'
            });
            return;
        }

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
            showUIToast('error', 'Error', 'Applicant record not found.');
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
            showUIToast('error', 'Error', 'Failed to evaluate assistance policies. Please try again.');
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

            // Recalculate & sync available_slots for this scholarship
            if (targetApp.scholarship_id) {
                try {
                    const { data: schRow } = await window.supabaseClient.from('scholarships').select('id, slots').eq('id', targetApp.scholarship_id).single();
                    if (schRow && schRow.slots && schRow.slots !== 'Open' && String(schRow.slots).toLowerCase() !== 'open') {
                        const { data: allSchApps } = await window.supabaseClient.from('applications').select('id, status').eq('scholarship_id', targetApp.scholarship_id).neq('status', 'Draft');
                        const totalApps = (allSchApps || []).length;
                        const totalSlots = parseInt(schRow.slots, 10) || 0;
                        const newAvail = Math.max(0, totalSlots - totalApps);
                        await window.supabaseClient.from('scholarships').update({ available_slots: newAvail }).eq('id', targetApp.scholarship_id);
                    }
                } catch (slotSyncErr) {
                    console.warn("Could not sync scholarship available_slots:", slotSyncErr);
                }
            }

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

            showUIToast('success', 'Success', `Applicant successfully ${newStatus === 'Approved' ? 'Approved' : 'Rejected'}.`);
            loadApplicationsForActiveTab();

        } catch (err) {
            console.error(err);
            showUIToast('error', 'Error', 'Failed to update status: ' + (err.message || ''));
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
                showUIToast('success', 'Deleted', 'The application has been deleted.');
                loadApplicationsForActiveTab();
            } catch (err) {
                console.error(err);
                showUIToast('error', 'Error', 'Failed to delete application.');
            }
        }
    };

    window.viewApplicantDetails = window.openApplicantModal;

    // =========================================================================
    // 8.5 RANKED SHORTLIST & MULTI-CRITERIA EVALUATION ENGINE
    // =========================================================================

    /**
     * Checks whether an educational assistance program has specific educational criteria
     */
    function hasEducationalCriteria(scholarship) {
        if (!scholarship) return false;
        const hasCollegeGwa = scholarship.min_college_gwa !== null && scholarship.min_college_gwa !== undefined && parseFloat(scholarship.min_college_gwa) > 0;
        const hasHsAvg = scholarship.min_hs_average !== null && scholarship.min_hs_average !== undefined && parseFloat(scholarship.min_hs_average) > 0;

        const progs = Array.isArray(scholarship.eligibility_programs)
            ? scholarship.eligibility_programs.filter(p => p && p !== 'All' && p !== 'Any' && String(p).trim().length > 0)
            : [];
        const hasProgs = progs.length > 0;

        const years = Array.isArray(scholarship.eligibility_years)
            ? scholarship.eligibility_years.filter(y => y && y !== 'All' && y !== 'Any' && String(y).trim().length > 0)
            : [];
        const hasYears = years.length > 0;

        const docs = Array.isArray(scholarship.required_documents)
            ? scholarship.required_documents.filter(d => d && String(d).trim().length > 0)
            : [];
        const hasDocs = docs.length > 0;

        return hasCollegeGwa || hasHsAvg || hasProgs || hasYears || hasDocs;
    }

    /**
     * Normalizes and extracts student's GWA or general grade average SOLELY from the application
     * (Uploaded documents OCR extracted_data or application form responses).
     * Does NOT pull from the student's profile settings.
     */
    function extractStudentGwa(app) {
        // 1. From uploaded documents OCR extracted_data
        if (Array.isArray(app.documents)) {
            for (const doc of app.documents) {
                const ext = doc.extracted_data || {};
                const possibleKeys = [
                    'Cumulative GWA', 'GWA', 'gwa', 'General Average', 
                    'General Weighted Average', 'Average', 'average',
                    'Final Grade', 'Computed GWA'
                ];
                for (const key of possibleKeys) {
                    if (ext[key] !== undefined && ext[key] !== null && !isNaN(parseFloat(ext[key]))) {
                        const parsed = parseFloat(ext[key]);
                        if (parsed > 0 && parsed <= 100) {
                            return { value: parsed, source: `Application Document OCR: ${doc.name || 'Grade Document'}` };
                        }
                    }
                }
                if (Array.isArray(ext['Extracted Semesters']) && ext['Extracted Semesters'].length > 0) {
                    const lastSem = ext['Extracted Semesters'][ext['Extracted Semesters'].length - 1];
                    if (lastSem && lastSem.GWA !== undefined && !isNaN(parseFloat(lastSem.GWA))) {
                        const parsed = parseFloat(lastSem.GWA);
                        if (parsed > 0 && parsed <= 100) {
                            return { value: parsed, source: `Application Document OCR: ${doc.name || 'Transcript'}` };
                        }
                    }
                }
            }
        }

        // 2. From application form responses (answers submitted in this application)
        if (app.form_responses && typeof app.form_responses === 'object') {
            for (const [key, val] of Object.entries(app.form_responses)) {
                const lowerKey = key.toLowerCase();
                if (
                    lowerKey.includes('gwa') || 
                    lowerKey.includes('general weighted average') || 
                    lowerKey.includes('grade average') || 
                    (lowerKey.includes('average') && !lowerKey.includes('income'))
                ) {
                    const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ''));
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                        return { value: parsed, source: 'Application Form Response' };
                    }
                }
            }
        }

        // Never fall back to profile settings - evaluation is strictly based on the application
        return { value: null, source: 'Pending Grade Verification' };
    }

    /**
     * Extracts student degree program & year level from application form responses first,
     * falling back to profile record if not specified on the application form.
     */
    function extractProgramAndYear(app) {
        let program = '';
        let year = '';

        if (app.form_responses && typeof app.form_responses === 'object') {
            for (const [key, val] of Object.entries(app.form_responses)) {
                const lk = key.toLowerCase();
                if (!program && (lk.includes('course') || lk.includes('degree') || lk.includes('program') || lk.includes('field of study'))) {
                    program = String(val).trim();
                }
                if (!year && (lk.includes('year level') || lk.includes('current year') || lk.includes('year') || lk.includes('grade level'))) {
                    year = String(val).trim();
                }
            }
        }

        if (!program) {
            program = (app.profiles?.program || 'N/A').trim();
        }
        if (!year) {
            year = (app.profiles?.year_level || 'N/A').trim();
        }

        return { program, year };
    }

    function evaluateCandidate(app, scholarship, maxSlots) {
        const hasCriteria = hasEducationalCriteria(scholarship);
        const { program: studentProgram, year: studentYear } = extractProgramAndYear(app);
        const gwaInfo = extractStudentGwa(app);
        const studentGwa = gwaInfo.value;
        const submittedDocs = Array.isArray(app.documents) ? app.documents : [];

        const appliedDateObj = app.created_at ? new Date(app.created_at) : new Date();
        const appliedDateStr = appliedDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const appliedTimeStr = appliedDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const criteriaBreakdown = {
            academicMerit: { max: 45, score: 0, details: '', passed: true },
            programMatch: { max: 20, score: 0, details: '', passed: true },
            yearMatch: { max: 15, score: 0, details: '', passed: true },
            documentCompleteness: { max: 15, score: 0, details: '', passed: true },
            timeliness: { max: 5, score: 0, details: '', passed: true }
        };

        let isStrictlyEligible = true;
        const disqualifications = [];
        const flags = [];

        // =========================================================================
        // SCENARIO A: PROGRAM HAS NO EDUCATIONAL CRITERIA
        // (Ranked strictly by Date & Time Applied: First-Come, First-Served)
        // =========================================================================
        if (!hasCriteria) {
            criteriaBreakdown.academicMerit.score = 45;
            criteriaBreakdown.academicMerit.details = studentGwa !== null 
                ? `Application GWA: ${studentGwa.toFixed(2)} (Open Criteria / No Minimum GWA Required)`
                : 'Open Educational Criteria (No Minimum GWA Required for this program)';

            criteriaBreakdown.programMatch.score = 20;
            criteriaBreakdown.programMatch.details = studentProgram !== 'N/A' 
                ? `Open to all degree programs (${studentProgram})`
                : 'Open to all degree programs';

            criteriaBreakdown.yearMatch.score = 15;
            criteriaBreakdown.yearMatch.details = studentYear !== 'N/A' 
                ? `Open to all year levels (${studentYear})`
                : 'Open to all year levels';

            criteriaBreakdown.documentCompleteness.score = 15;
            criteriaBreakdown.documentCompleteness.details = 'No specific mandatory document upload required';

            criteriaBreakdown.timeliness.score = 5;
            criteriaBreakdown.timeliness.details = `Applied promptly on ${appliedDateStr} at ${appliedTimeStr} (First-Come, First-Served)`;

            return {
                applicant_id: app.id,
                student_id: app.student_id,
                student_number: app.profiles?.id_number || 'N/A',
                first_name: app.profiles?.first_name || '',
                middle_name: app.profiles?.middle_name || '',
                last_name: app.profiles?.last_name || '',
                full_name: `${app.profiles?.last_name || ''}, ${app.profiles?.first_name || ''} ${app.profiles?.middle_name || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Applicant',
                email: app.profiles?.email || 'N/A',
                contact_number: app.profiles?.contact_number || 'N/A',
                gender: app.profiles?.gender || 'N/A',
                program: studentProgram,
                year_level: studentYear,
                avatar_url: app.profiles?.avatar_url || null,
                current_status: app.status,
                created_at: app.created_at,
                applied_date_str: appliedDateStr,
                applied_time_str: appliedTimeStr,
                gwa: studentGwa,
                gwa_display: studentGwa !== null ? (studentGwa <= 5.0 ? studentGwa.toFixed(2) : studentGwa.toFixed(1) + '%') : 'FCFS (No Min GWA)',
                gwa_source: gwaInfo.source,
                total_score: 100,
                has_educational_criteria: false,
                is_strictly_eligible: true,
                disqualifications: [],
                flags: [],
                tier: 'qualified',
                recommendation: `Meets open criteria (Ranked by Application Date & Time: ${appliedDateStr} ${appliedTimeStr})`,
                breakdown: criteriaBreakdown,
                documents_count: submittedDocs.length,
                form_responses: app.form_responses || {}
            };
        }

        // =========================================================================
        // SCENARIO B: PROGRAM HAS SPECIFIC EDUCATIONAL CRITERIA
        // =========================================================================

        // 1. Academic Merit Evaluation (45 Pts)
        const minCollegeGwa = scholarship.min_college_gwa !== null && scholarship.min_college_gwa !== undefined && parseFloat(scholarship.min_college_gwa) > 0 ? parseFloat(scholarship.min_college_gwa) : null;
        const minHsAvg = scholarship.min_hs_average !== null && scholarship.min_hs_average !== undefined && parseFloat(scholarship.min_hs_average) > 0 ? parseFloat(scholarship.min_hs_average) : null;

        if (studentGwa !== null) {
            if (studentGwa <= 5.0) {
                // Philippine 1.00 - 5.00 grading scale (1.00 is highest, 5.00 failing)
                if (minCollegeGwa !== null) {
                    if (studentGwa <= minCollegeGwa) {
                        const ratio = Math.max(0, 1 - ((studentGwa - 1.0) / Math.max(0.5, (minCollegeGwa - 1.0 || 1.0))));
                        const pts = 34 + (ratio * 11);
                        criteriaBreakdown.academicMerit.score = Math.min(45, Math.round(pts * 10) / 10);
                        criteriaBreakdown.academicMerit.details = `Application GWA ${studentGwa.toFixed(2)} satisfies requirement (<= ${minCollegeGwa.toFixed(2)})`;
                    } else {
                        isStrictlyEligible = false;
                        criteriaBreakdown.academicMerit.passed = false;
                        criteriaBreakdown.academicMerit.score = Math.max(5, Math.round((30 - (studentGwa - minCollegeGwa) * 10) * 10) / 10);
                        criteriaBreakdown.academicMerit.details = `Application GWA ${studentGwa.toFixed(2)} misses required cutoff (<= ${minCollegeGwa.toFixed(2)})`;
                        disqualifications.push(`Academic GWA ${studentGwa.toFixed(2)} does not meet minimum requirement (<= ${minCollegeGwa.toFixed(2)})`);
                    }
                } else {
                    if (studentGwa <= 1.25) criteriaBreakdown.academicMerit.score = 45;
                    else if (studentGwa <= 1.50) criteriaBreakdown.academicMerit.score = 42;
                    else if (studentGwa <= 1.75) criteriaBreakdown.academicMerit.score = 38;
                    else if (studentGwa <= 2.00) criteriaBreakdown.academicMerit.score = 34;
                    else if (studentGwa <= 2.50) criteriaBreakdown.academicMerit.score = 28;
                    else criteriaBreakdown.academicMerit.score = 20;
                    criteriaBreakdown.academicMerit.details = `Application GWA ${studentGwa.toFixed(2)} evaluated for merit (${gwaInfo.source})`;
                }
            } else {
                // Percentage scale (75 - 100)
                if (minHsAvg !== null) {
                    if (studentGwa >= minHsAvg) {
                        const ratio = Math.min(1, Math.max(0, (studentGwa - minHsAvg) / (100 - minHsAvg || 10)));
                        criteriaBreakdown.academicMerit.score = Math.round((35 + ratio * 10) * 10) / 10;
                        criteriaBreakdown.academicMerit.details = `Average ${studentGwa.toFixed(1)}% satisfies requirement (>= ${minHsAvg.toFixed(1)}%)`;
                    } else {
                        isStrictlyEligible = false;
                        criteriaBreakdown.academicMerit.passed = false;
                        criteriaBreakdown.academicMerit.score = 10;
                        criteriaBreakdown.academicMerit.details = `Average ${studentGwa.toFixed(1)}% misses required cutoff (>= ${minHsAvg.toFixed(1)}%)`;
                        disqualifications.push(`Average grade ${studentGwa.toFixed(1)}% does not meet minimum requirement (>= ${minHsAvg.toFixed(1)}%)`);
                    }
                } else {
                    if (studentGwa >= 95) criteriaBreakdown.academicMerit.score = 45;
                    else if (studentGwa >= 90) criteriaBreakdown.academicMerit.score = 41;
                    else if (studentGwa >= 85) criteriaBreakdown.academicMerit.score = 36;
                    else if (studentGwa >= 75) criteriaBreakdown.academicMerit.score = 28;
                    criteriaBreakdown.academicMerit.details = `Average ${studentGwa.toFixed(1)}% evaluated for merit (${gwaInfo.source})`;
                }
            }
        } else {
            criteriaBreakdown.academicMerit.score = 30; // Provisional
            criteriaBreakdown.academicMerit.details = 'Pending official grade verification';
            flags.push('GWA awaiting official document extraction');
        }

        // 2. Program Alignment Evaluation (20 Pts)
        const eligiblePrograms = Array.isArray(scholarship.eligibility_programs)
            ? scholarship.eligibility_programs.filter(p => p && p !== 'All' && p !== 'Any' && String(p).trim().length > 0)
            : [];

        if (eligiblePrograms.length === 0) {
            criteriaBreakdown.programMatch.score = 20;
            criteriaBreakdown.programMatch.details = studentProgram ? `Open to all degree programs (${studentProgram})` : 'Open to all degree programs';
        } else {
            const matchesProgram = eligiblePrograms.some(p => {
                const cleanP = p.trim().toLowerCase();
                const cleanStud = studentProgram.toLowerCase();
                return cleanStud.includes(cleanP) || cleanP.includes(cleanStud);
            });

            if (matchesProgram) {
                criteriaBreakdown.programMatch.score = 20;
                criteriaBreakdown.programMatch.details = `Degree course matches eligible programs: ${studentProgram}`;
            } else {
                criteriaBreakdown.programMatch.score = 0;
                criteriaBreakdown.programMatch.passed = false;
                isStrictlyEligible = false;
                criteriaBreakdown.programMatch.details = `Course '${studentProgram || 'N/A'}' not in target degree programs`;
                disqualifications.push(`Degree course (${studentProgram || 'N/A'}) does not match eligible programs`);
            }
        }

        // 3. Year Level Alignment Evaluation (15 Pts)
        const eligibleYears = Array.isArray(scholarship.eligibility_years)
            ? scholarship.eligibility_years.filter(y => y && y !== 'All' && y !== 'Any' && String(y).trim().length > 0)
            : [];

        if (eligibleYears.length === 0) {
            criteriaBreakdown.yearMatch.score = 15;
            criteriaBreakdown.yearMatch.details = studentYear ? `Open to all levels (${studentYear})` : 'Open to all year levels';
        } else {
            const matchesYear = eligibleYears.some(y => {
                const cleanY = y.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanStudY = studentYear.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cleanStudY.includes(cleanY) || cleanY.includes(cleanStudY);
            });

            if (matchesYear) {
                criteriaBreakdown.yearMatch.score = 15;
                criteriaBreakdown.yearMatch.details = `Year level matches eligible cohorts: ${studentYear}`;
            } else {
                criteriaBreakdown.yearMatch.score = 0;
                criteriaBreakdown.yearMatch.passed = false;
                isStrictlyEligible = false;
                criteriaBreakdown.yearMatch.details = `Year level '${studentYear || 'N/A'}' not in eligible cohorts`;
                disqualifications.push(`Year level (${studentYear || 'N/A'}) does not match eligible cohorts`);
            }
        }

        // 4. Document Completeness & OCR Verification (15 Pts)
        const requiredDocs = Array.isArray(scholarship.required_documents)
            ? scholarship.required_documents.filter(d => d && String(d).trim().length > 0)
            : [];

        if (requiredDocs.length === 0) {
            criteriaBreakdown.documentCompleteness.score = 15;
            criteriaBreakdown.documentCompleteness.details = 'No specific document upload required';
        } else {
            let attachedRequiredCount = 0;
            let ocrVerifiedCount = 0;

            requiredDocs.forEach(reqName => {
                const cleanReq = reqName.toLowerCase().trim();
                const found = submittedDocs.find(d => (d.name || '').toLowerCase().trim().includes(cleanReq) || cleanReq.includes((d.name || '').toLowerCase().trim()));
                if (found && (found.file_url || found.url)) {
                    attachedRequiredCount++;
                    if (found.extracted_data && Object.keys(found.extracted_data).length > 0) {
                        ocrVerifiedCount++;
                    }
                }
            });

            const docRatio = attachedRequiredCount / requiredDocs.length;
            let docPts = docRatio * 12;
            if (ocrVerifiedCount > 0) {
                docPts += Math.min(3, (ocrVerifiedCount / requiredDocs.length) * 3);
            }

            criteriaBreakdown.documentCompleteness.score = Math.round(docPts * 10) / 10;
            criteriaBreakdown.documentCompleteness.details = `${attachedRequiredCount} of ${requiredDocs.length} mandatory documents attached (${ocrVerifiedCount} AI verified)`;

            if (docRatio < 1.0) {
                flags.push(`Missing ${requiredDocs.length - attachedRequiredCount} required documents`);
                if (docRatio < 0.5) {
                    criteriaBreakdown.documentCompleteness.passed = false;
                }
            }
        }

        // 5. Submission Timeliness (5 Pts)
        if (app.created_at && scholarship.start_date && scholarship.end_date) {
            const start = new Date(scholarship.start_date).getTime();
            const end = new Date(scholarship.end_date).getTime();
            const applied = new Date(app.created_at).getTime();
            const windowDuration = Math.max(1, end - start);
            const elapsed = Math.max(0, applied - start);
            const timeRatio = Math.min(1, elapsed / windowDuration);
            const timePts = 5.0 - (timeRatio * 2.0);
            criteriaBreakdown.timeliness.score = Math.max(2.5, Math.round(timePts * 10) / 10);
            criteriaBreakdown.timeliness.details = `Applied promptly on ${appliedDateStr} at ${appliedTimeStr}`;
        } else {
            criteriaBreakdown.timeliness.score = 5.0;
            criteriaBreakdown.timeliness.details = `Application received on ${appliedDateStr} at ${appliedTimeStr}`;
        }

        const totalScore = Math.min(100, Math.max(0, Math.round((
            criteriaBreakdown.academicMerit.score +
            criteriaBreakdown.programMatch.score +
            criteriaBreakdown.yearMatch.score +
            criteriaBreakdown.documentCompleteness.score +
            criteriaBreakdown.timeliness.score
        ) * 10) / 10));

        let tier = 'qualified';
        let recommendation = '';

        if (!isStrictlyEligible) {
            tier = 'ineligible';
            recommendation = 'Does not meet mandatory educational criteria';
        } else if (flags.length > 0 && flags.some(f => f.includes('Missing') || f.includes('awaiting'))) {
            tier = 'conditional';
            recommendation = 'Conditional candidate (Pending document or grade verification)';
        } else {
            tier = 'qualified';
            recommendation = 'Meets all educational assistance requirements';
        }

        return {
            applicant_id: app.id,
            student_id: app.student_id,
            student_number: app.profiles?.id_number || 'N/A',
            first_name: app.profiles?.first_name || '',
            middle_name: app.profiles?.middle_name || '',
            last_name: app.profiles?.last_name || '',
            full_name: `${app.profiles?.last_name || ''}, ${app.profiles?.first_name || ''} ${app.profiles?.middle_name || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Applicant',
            email: app.profiles?.email || 'N/A',
            contact_number: app.profiles?.contact_number || 'N/A',
            gender: app.profiles?.gender || 'N/A',
            program: studentProgram || 'N/A',
            year_level: studentYear || 'N/A',
            avatar_url: app.profiles?.avatar_url || null,
            current_status: app.status,
            created_at: app.created_at,
            applied_date_str: appliedDateStr,
            applied_time_str: appliedTimeStr,
            gwa: studentGwa,
            gwa_display: studentGwa !== null ? (studentGwa <= 5.0 ? studentGwa.toFixed(2) : studentGwa.toFixed(1) + '%') : 'N/A',
            gwa_source: gwaInfo.source,
            total_score: totalScore,
            has_educational_criteria: true,
            is_strictly_eligible: isStrictlyEligible,
            disqualifications,
            flags,
            tier,
            recommendation,
            breakdown: criteriaBreakdown,
            documents_count: submittedDocs.length,
            form_responses: app.form_responses || {}
        };
    }

    async function generateRankedShortlist() {
        if (!activeScholarshipData) return;

        const maxSlots = activeScholarshipData.slots === 'Open' || !activeScholarshipData.slots ? 999999 : parseInt(activeScholarshipData.slots, 10) || 0;
        const hasCriteria = hasEducationalCriteria(activeScholarshipData);

        // Attempt Backend API first, with seamless browser fallback
        let serverData = null;
        try {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:' || !window.location.hostname;
            const apiUrl = isLocal
                ? `http://localhost:3000/api/scholarships/${activeScholarshipData.id}/ranked-shortlist`
                : `https://grantee-backend-n5f4.onrender.com/api/scholarships/${activeScholarshipData.id}/ranked-shortlist`;
            
            const resp = await fetch(apiUrl);
            if (resp.ok) {
                const json = await resp.json();
                if (json && json.success && Array.isArray(json.shortlist)) {
                    serverData = json;
                }
            }
        } catch (e) {
            // Server offline or network error; fallback to client computation
        }

        if (serverData) {
            rankedShortlist = serverData.shortlist;
            allEvaluatedShortlist = serverData.all_evaluated || serverData.shortlist;
            shortlistSummaryData = serverData.summary;
        } else {
            // Client-side Ranking Computation - Only pending applicants will be ranked
            const pendingApps = (currentApplications || []).filter(a => normalizeApplicantStatus(a.status) === 'pending');
            const totalApproved = (currentApplications || []).filter(a => normalizeApplicantStatus(a.status) === 'approved').length;
            const availableSlots = maxSlots === 999999 ? 999999 : Math.max(0, maxSlots - totalApproved);

            const candidates = pendingApps.map(app => evaluateCandidate(app, activeScholarshipData, availableSlots));

            if (!hasCriteria) {
                // === NO CRITERIA: Strictly rank by Date and Time Applied (First-Come, First-Served) ===
                candidates.sort((a, b) => {
                    const timeA = new Date(a.created_at).getTime();
                    const timeB = new Date(b.created_at).getTime();
                    if (timeA !== timeB) return timeA - timeB;
                    return String(a.applicant_id).localeCompare(String(b.applicant_id));
                });
            } else {
                // === HAS CRITERIA: Rank by eligibility, score, GWA, then submission time ===
                candidates.sort((a, b) => {
                    if (a.is_strictly_eligible !== b.is_strictly_eligible) {
                        return a.is_strictly_eligible ? -1 : 1;
                    }
                    if (b.total_score !== a.total_score) {
                        return b.total_score - a.total_score;
                    }
                    if (a.gwa !== null && b.gwa !== null) {
                        if (a.gwa <= 5.0 && b.gwa <= 5.0) return a.gwa - b.gwa;
                        return b.gwa - a.gwa;
                    }
                    if (a.gwa !== null && b.gwa === null) return -1;
                    if (a.gwa === null && b.gwa !== null) return 1;

                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                });
            }

            // Top 75% Shortlist Cutoff Calculation
            const totalPending = candidates.length;
            const shortlistCutoffCount = totalPending > 0 ? Math.max(1, Math.ceil(totalPending * 0.75)) : 0;

            let slottedCount = 0;
            candidates.forEach((cand, idx) => {
                cand.rank = idx + 1;
                cand.is_shortlisted = idx < shortlistCutoffCount;
                cand.shortlist_cutoff_rank = shortlistCutoffCount;
                cand.total_pending = totalPending;
                cand.shortlist_percentage = 75;

                if (cand.is_shortlisted) {
                    if (cand.is_strictly_eligible && cand.tier !== 'ineligible') {
                        if (slottedCount < availableSlots) {
                            slottedCount++;
                            cand.tier = 'slotted';
                            cand.recommendation = !hasCriteria
                                ? `Grantee Slot Reserved (Rank #${cand.rank} of ${maxSlots === 999999 ? 'Open' : availableSlots} available slots - Applied First-Come, First-Served on ${cand.applied_date_str || ''} at ${cand.applied_time_str || ''})`
                                : `Grantee Slot Reserved (Rank #${cand.rank} of ${maxSlots === 999999 ? 'Open' : availableSlots} available slots - Score: ${cand.total_score}%)`;
                            cand.is_slotted = true;
                        } else {
                            cand.tier = 'qualified';
                            const queuePos = slottedCount - availableSlots + 1;
                            cand.recommendation = !hasCriteria
                                ? `Priority Runner-Up (Rank #${cand.rank}, Queue #${queuePos} - Applied First-Come, First-Served on ${cand.applied_date_str || ''} at ${cand.applied_time_str || ''})`
                                : `Priority Runner-Up (Rank #${cand.rank}, Queue Position #${queuePos})`;
                            cand.is_slotted = false;
                        }
                    } else {
                        cand.is_slotted = false;
                    }
                } else {
                    // Beyond the 75% shortlist cutoff
                    cand.tier = 'cutoff';
                    cand.is_slotted = false;
                    cand.recommendation = `Below 75% Cutoff (Rank #${cand.rank} of ${totalPending} pending applicants - Fell outside top 75% shortlist threshold of ${shortlistCutoffCount} candidates)`;
                }
            });

            allEvaluatedShortlist = candidates;
            rankedShortlist = candidates.filter(c => c.is_shortlisted);

            const qualifiedCount = rankedShortlist.filter(c => c.is_strictly_eligible).length;
            const slottedCandidates = rankedShortlist.filter(c => c.is_slotted);
            const topShortlistCount = slottedCandidates.length;

            const gwaSum = slottedCandidates.filter(c => c.gwa !== null && c.gwa <= 5.0).reduce((acc, c) => acc + c.gwa, 0);
            const gwaCount = slottedCandidates.filter(c => c.gwa !== null && c.gwa <= 5.0).length;
            const avgSlottedGwa = gwaCount > 0 ? (gwaSum / gwaCount).toFixed(2) : null;

            const cutoffCandidate = rankedShortlist[rankedShortlist.length - 1];
            const cutoffScore = cutoffCandidate ? cutoffCandidate.total_score : (candidates[0] ? candidates[0].total_score : 100);

            shortlistSummaryData = {
                total_evaluated: candidates.length,
                total_pending: totalPending,
                shortlist_quota: shortlistCutoffCount,
                shortlist_percentage: 75,
                total_shortlisted: rankedShortlist.length,
                unshortlisted_count: candidates.length - rankedShortlist.length,
                total_slots: activeScholarshipData.slots === 'Open' ? 'Open' : maxSlots,
                available_slots: maxSlots === 999999 ? 'Open' : availableSlots,
                already_approved: totalApproved,
                qualified_candidates: qualifiedCount,
                slotted_grantees: topShortlistCount,
                runners_up: Math.max(0, qualifiedCount - topShortlistCount),
                average_shortlist_gwa: avgSlottedGwa,
                shortlist_cutoff_score: cutoffScore,
                shortlist_cutoff_rank: shortlistCutoffCount,
                has_educational_criteria: hasCriteria,
                ranking_method: hasCriteria ? 'Educational Criteria Scoring (100 Pts)' : 'Date & Time Applied (First-Come, First-Served)'
            };
        }

        filteredShortlist = [...rankedShortlist];
    }

    function renderShortlistOverview() {
        const container = document.getElementById('shortlist-overview-container');
        if (!container || !activeScholarshipData) return;

        const sch = activeScholarshipData;
        const hasCriteria = hasEducationalCriteria(sch);
        const providerName = sch.department || sch.category || 'General Administration';
        const isProviderPrivate = (sch.category || '').toLowerCase().includes('private') || (sch.category || '').toLowerCase().includes('company');

        const criteriaList = [];
        if (!hasCriteria) {
            criteriaList.push(`<span><i data-lucide="check-circle-2"></i> Criteria: <strong>Open / No Minimum GWA Required</strong></span>`);
            criteriaList.push(`<span><i data-lucide="arrow-down-up"></i> Ranking Method: <strong>Date & Time Applied (First to Apply = Rank 1)</strong></span>`);
            criteriaList.push(`<span><i data-lucide="scissors"></i> Shortlist Cutoff: <strong>Top 75% of Pending Pool</strong></span>`);
            criteriaList.push(`<span><i data-lucide="users"></i> Slots: <strong>${sch.slots || 'Open'}</strong></span>`);
        } else {
            if (sch.min_college_gwa) criteriaList.push(`<span><i data-lucide="graduation-cap"></i> Min College GWA: <strong>${sch.min_college_gwa}</strong></span>`);
            if (sch.min_hs_average) criteriaList.push(`<span><i data-lucide="award"></i> Min HS Avg: <strong>${sch.min_hs_average}%</strong></span>`);
            if (sch.eligibility_years && sch.eligibility_years.length > 0) criteriaList.push(`<span><i data-lucide="calendar"></i> Cohorts: <strong>${sch.eligibility_years.join(', ')}</strong></span>`);
            if (sch.eligibility_programs && sch.eligibility_programs.length > 0) {
                const progText = sch.eligibility_programs.length === 1 ? sch.eligibility_programs[0] : `${sch.eligibility_programs.length} Eligible Degree Programs`;
                criteriaList.push(`<span><i data-lucide="book-open"></i> Programs: <strong>${progText}</strong></span>`);
            } else {
                criteriaList.push(`<span><i data-lucide="book-open"></i> Programs: <strong>All Degrees</strong></span>`);
            }
            criteriaList.push(`<span><i data-lucide="scissors"></i> Shortlist Cutoff: <strong>Top 75% of Pending Pool</strong></span>`);
            criteriaList.push(`<span><i data-lucide="users"></i> Slots: <strong>${sch.slots || 'Open'}</strong></span>`);
        }

        const totalPendingCount = (shortlistSummaryData && (shortlistSummaryData.total_evaluated || shortlistSummaryData.total_pending))
            ? (shortlistSummaryData.total_evaluated || shortlistSummaryData.total_pending)
            : (allEvaluatedShortlist && allEvaluatedShortlist.length > 0 ? allEvaluatedShortlist.length : rankedShortlist.length);

        const summary = shortlistSummaryData || {
            total_evaluated: totalPendingCount,
            total_pending: totalPendingCount,
            shortlist_quota: rankedShortlist.length,
            shortlist_percentage: 75,
            total_shortlisted: rankedShortlist.length,
            qualified_candidates: rankedShortlist.filter(c => c.is_strictly_eligible).length,
            slotted_grantees: rankedShortlist.filter(c => c.tier === 'slotted').length,
            shortlist_cutoff_score: rankedShortlist[0] ? rankedShortlist[0].total_score : 0,
            average_shortlist_gwa: hasCriteria ? '1.25' : null
        };

        const pendingSlottedCount = rankedShortlist.filter(c => c.tier === 'slotted' && normalizeApplicantStatus(c.current_status) === 'pending').length;

        container.innerHTML = `
            <div class="shortlist-overview-card">
                <div class="shortlist-header-row">
                    <div class="shortlist-title-block">
                        <div class="shortlist-provider-badge">
                            <i data-lucide="${isProviderPrivate ? 'building-2' : 'landmark'}" style="width: 14px; height: 14px;"></i>
                            <span>${isProviderPrivate ? 'Sponsoring Provider:' : 'Educational Assistance Provider:'} ${escapeHtml(providerName)}</span>
                        </div>
                        <h3 class="shortlist-heading">
                            <span>${hasCriteria ? 'Merit-Ranked Shortlist Evaluation' : 'First-Come, First-Served (FCFS) Ranked Shortlist'}</span>
                            <span class="badge-status badge-approved" style="font-size: 11.5px; padding: 3px 10px;">
                                <i data-lucide="scissors" style="width: 13px; height: 13px;"></i>
                                Top 75% Shortlist Cutoff Active
                            </span>
                        </h3>
                        <div class="shortlist-criteria-pills">
                            ${criteriaList.map(c => `<div class="criteria-pill">${c}</div>`).join('')}
                        </div>
                    </div>

                    <div class="shortlist-actions-cluster">
                        <button type="button" class="btn-outline" onclick="exportShortlist('pdf')" title="Export formatted PDF report for company providers and coordinators">
                            <i data-lucide="file-text" style="width: 14px; height: 14px; color: #d97706;"></i>
                            <span>Export Evaluation Report (PDF)</span>
                        </button>
                        <button type="button" class="btn-outline" onclick="exportShortlist('csv')" title="Export ranked shortlist as Excel spreadsheet">
                            <i data-lucide="file-spreadsheet" style="width: 14px; height: 14px; color: var(--moss-green);"></i>
                            <span>Export CSV (Excel)</span>
                        </button>
                        ${pendingSlottedCount > 0 ? `
                        <button type="button" class="btn-approve" onclick="batchApproveTopShortlist()" title="Approve all top-ranked slotted candidates in one action">
                            <i data-lucide="check-check" style="width: 14px; height: 14px;"></i>
                            <span>Batch Approve Slotted (${pendingSlottedCount})</span>
                        </button>
                        ` : ''}
                    </div>
                </div>

                <div class="shortlist-stats-grid">
                    <div class="shortlist-stat-box">
                        <div class="stat-box-icon stat-icon-blue">
                            <i data-lucide="users" style="width: 20px; height: 20px;"></i>
                        </div>
                        <div class="stat-box-content">
                            <span class="stat-box-label">Pending Pool</span>
                            <span class="stat-box-val">${totalPendingCount}</span>
                        </div>
                    </div>
                    <div class="shortlist-stat-box">
                        <div class="stat-box-icon stat-icon-green">
                            <i data-lucide="award" style="width: 20px; height: 20px;"></i>
                        </div>
                        <div class="stat-box-content">
                            <span class="stat-box-label">Shortlisted (Top 75%)</span>
                            <span class="stat-box-val">${rankedShortlist.length}</span>
                        </div>
                    </div>
                    <div class="shortlist-stat-box">
                        <div class="stat-box-icon stat-icon-gold">
                            <i data-lucide="check-circle" style="width: 20px; height: 20px;"></i>
                        </div>
                        <div class="stat-box-content">
                            <span class="stat-box-label">Slotted Grantees</span>
                            <span class="stat-box-val">${summary.slotted_grantees}</span>
                        </div>
                    </div>
                    <div class="shortlist-stat-box">
                        <div class="stat-box-icon stat-icon-purple">
                            <i data-lucide="${hasCriteria ? 'sparkles' : 'clock'}" style="width: 20px; height: 20px;"></i>
                        </div>
                        <div class="stat-box-content">
                            <span class="stat-box-label">${hasCriteria ? (summary.average_shortlist_gwa ? 'Avg Shortlist GWA' : 'Shortlist Cutoff Score') : 'Shortlist Ranking'}</span>
                            <span class="stat-box-val" style="font-size: ${hasCriteria ? '20px' : '15px'};">${hasCriteria ? (summary.average_shortlist_gwa || (summary.shortlist_cutoff_score + '%')) : 'Top 75% FCFS'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    function renderShortlistFilters() {
        const panel = document.getElementById('shortlist-filters-panel');
        if (!panel) return;

        // Collect unique programs & years from candidates
        const programsSet = new Set();
        const yearsSet = new Set();
        const poolForFilters = allEvaluatedShortlist && allEvaluatedShortlist.length > 0 ? allEvaluatedShortlist : rankedShortlist;
        poolForFilters.forEach(c => {
            if (c.program && c.program !== 'N/A') programsSet.add(c.program);
            if (c.year_level && c.year_level !== 'N/A') yearsSet.add(c.year_level);
        });

        const slottedCount = rankedShortlist.filter(c => c.tier === 'slotted').length;
        const qualifiedCount = rankedShortlist.filter(c => c.tier === 'qualified' || (c.is_strictly_eligible && c.tier !== 'slotted')).length;
        const conditionalCount = rankedShortlist.filter(c => c.tier === 'conditional').length;
        const ineligibleCount = rankedShortlist.filter(c => c.tier === 'ineligible').length;
        const cutoffCount = (allEvaluatedShortlist || []).filter(c => c.tier === 'cutoff' || !c.is_shortlisted).length;

        panel.innerHTML = `
            <div class="filter-tier-tabs">
                <span style="font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-right: 4px; letter-spacing: 0.04em;">Shortlist Tiers:</span>
                <button type="button" class="filter-tier-btn ${shortlistFilterTier === 'all' ? 'active' : ''}" onclick="setShortlistTier('all')">
                    Ranked Shortlist (Top 75%) <span class="tier-pill-count">${rankedShortlist.length}</span>
                </button>
                <button type="button" class="filter-tier-btn ${shortlistFilterTier === 'slotted' ? 'active' : ''}" onclick="setShortlistTier('slotted')">
                    <i data-lucide="award" style="width: 13px; height: 13px; color: #d97706;"></i>
                    Top Slotted Grantees <span class="tier-pill-count">${slottedCount}</span>
                </button>
                <button type="button" class="filter-tier-btn ${shortlistFilterTier === 'qualified' ? 'active' : ''}" onclick="setShortlistTier('qualified')">
                    <i data-lucide="check-circle-2" style="width: 13px; height: 13px; color: var(--moss-green);"></i>
                    Qualified Runners-Up <span class="tier-pill-count">${qualifiedCount}</span>
                </button>
                <button type="button" class="filter-tier-btn ${shortlistFilterTier === 'conditional' ? 'active' : ''}" onclick="setShortlistTier('conditional')">
                    <i data-lucide="alert-triangle" style="width: 13px; height: 13px; color: #b45309;"></i>
                    Conditional Review <span class="tier-pill-count">${conditionalCount}</span>
                </button>
                ${ineligibleCount > 0 ? `
                <button type="button" class="filter-tier-btn ${shortlistFilterTier === 'ineligible' ? 'active' : ''}" onclick="setShortlistTier('ineligible')">
                    <i data-lucide="x-circle" style="width: 13px; height: 13px; color: var(--danger-color);"></i>
                    Ineligible <span class="tier-pill-count">${ineligibleCount}</span>
                </button>
                ` : ''}
                ${cutoffCount > 0 ? `
                <button type="button" class="filter-tier-btn ${shortlistFilterTier === 'cutoff' ? 'active' : ''}" onclick="setShortlistTier('cutoff')" title="Applicants who fell outside the top 75% shortlist cutoff">
                    <i data-lucide="scissors" style="width: 13px; height: 13px; color: var(--text-muted);"></i>
                    Below 75% Cutoff <span class="tier-pill-count">${cutoffCount}</span>
                </button>
                ` : ''}
            </div>

            <div class="shortlist-controls-row">
                <div class="shortlist-dropdowns-group">
                    <select id="shortlist-gwa-filter" class="filter-select-mini" onchange="updateShortlistFilters()" aria-label="Filter by GWA / Academic Standing">
                        <option value="all" ${shortlistFilterGwa === 'all' ? 'selected' : ''}>🎓 All Academic Standings</option>
                        <option value="highest_honors" ${shortlistFilterGwa === 'highest_honors' ? 'selected' : ''}>★ Highest Honors (1.00 – 1.25)</option>
                        <option value="high_honors" ${shortlistFilterGwa === 'high_honors' ? 'selected' : ''}>★ High Honors (1.26 – 1.50)</option>
                        <option value="honors" ${shortlistFilterGwa === 'honors' ? 'selected' : ''}>★ Honors (1.51 – 1.75)</option>
                        <option value="good_standing" ${shortlistFilterGwa === 'good_standing' ? 'selected' : ''}>Good Standing (1.76 – 2.00)</option>
                        <option value="pass" ${shortlistFilterGwa === 'pass' ? 'selected' : ''}>Passing (2.01+)</option>
                    </select>

                    <select id="shortlist-prog-filter" class="filter-select-mini" onchange="updateShortlistFilters()" aria-label="Filter by Degree Program">
                        <option value="all" ${shortlistFilterProgram === 'all' ? 'selected' : ''}>📚 All Degree Programs</option>
                        ${Array.from(programsSet).sort().map(p => `<option value="${p}" ${shortlistFilterProgram === p ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>

                    <select id="shortlist-year-filter" class="filter-select-mini" onchange="updateShortlistFilters()" aria-label="Filter by Year Level">
                        <option value="all" ${shortlistFilterYear === 'all' ? 'selected' : ''}>📅 All Year Levels</option>
                        ${Array.from(yearsSet).sort().map(y => `<option value="${y}" ${shortlistFilterYear === y ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>

                    <select id="shortlist-score-filter" class="filter-select-mini" onchange="updateShortlistFilters()" aria-label="Filter by Qualification Score">
                        <option value="0" ${shortlistFilterMinScore === 0 ? 'selected' : ''}>📊 All Scores</option>
                        <option value="90" ${shortlistFilterMinScore === 90 ? 'selected' : ''}>Score ≥ 90% (Outstanding)</option>
                        <option value="80" ${shortlistFilterMinScore === 80 ? 'selected' : ''}>Score ≥ 80% (Very Good)</option>
                        <option value="70" ${shortlistFilterMinScore === 70 ? 'selected' : ''}>Score ≥ 70% (Satisfactory)</option>
                    </select>
                </div>

                <div class="shortlist-search-cluster">
                    <div class="shortlist-search-box">
                        <i data-lucide="search"></i>
                        <input type="text" id="shortlist-search-input" placeholder="Search candidate, ID, course..." value="${escapeHtml(shortlistSearchTerm)}" onkeyup="onShortlistSearch(this.value)">
                        <button type="button" id="shortlist-search-clear" class="btn-clear-search" onclick="clearShortlistSearch()" title="Clear search" style="display: ${shortlistSearchTerm ? 'inline-flex' : 'none'};">
                            <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                        </button>
                    </div>
                    <button type="button" class="btn-reset-filters" onclick="resetShortlistFilters()" title="Reset all filters">
                        <i data-lucide="rotate-ccw" style="width: 13px; height: 13px;"></i> Reset
                    </button>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    window.setShortlistTier = (tier) => {
        shortlistFilterTier = tier;
        renderShortlistFilters();
        filterShortlist();
    };

    window.updateShortlistFilters = () => {
        const gwaSel = document.getElementById('shortlist-gwa-filter');
        const progSel = document.getElementById('shortlist-prog-filter');
        const yearSel = document.getElementById('shortlist-year-filter');
        const scoreSel = document.getElementById('shortlist-score-filter');

        if (gwaSel) shortlistFilterGwa = gwaSel.value;
        if (progSel) shortlistFilterProgram = progSel.value;
        if (yearSel) shortlistFilterYear = yearSel.value;
        if (scoreSel) shortlistFilterMinScore = parseFloat(scoreSel.value) || 0;

        filterShortlist();
    };

    window.onShortlistSearch = (val) => {
        shortlistSearchTerm = (val || '').trim().toLowerCase();
        const clearBtn = document.getElementById('shortlist-search-clear');
        if (clearBtn) {
            clearBtn.style.display = shortlistSearchTerm ? 'inline-flex' : 'none';
        }
        filterShortlist();
    };

    window.clearShortlistSearch = () => {
        shortlistSearchTerm = '';
        const input = document.getElementById('shortlist-search-input');
        if (input) {
            input.value = '';
            input.focus();
        }
        const clearBtn = document.getElementById('shortlist-search-clear');
        if (clearBtn) {
            clearBtn.style.display = 'none';
        }
        filterShortlist();
    };

    window.resetShortlistFilters = () => {
        shortlistFilterTier = 'all';
        shortlistFilterGwa = 'all';
        shortlistFilterProgram = 'all';
        shortlistFilterYear = 'all';
        shortlistFilterMinScore = 0;
        shortlistSearchTerm = '';
        renderShortlistFilters();
        filterShortlist();
    };

    function filterShortlist() {
        const sourcePool = shortlistFilterTier === 'cutoff'
            ? (allEvaluatedShortlist && allEvaluatedShortlist.length > 0 ? allEvaluatedShortlist : rankedShortlist)
            : rankedShortlist;

        filteredShortlist = sourcePool.filter(cand => {
            // Tier Filter
            if (shortlistFilterTier === 'slotted' && cand.tier !== 'slotted') return false;
            if (shortlistFilterTier === 'qualified' && (cand.tier !== 'qualified' && cand.tier !== 'slotted')) return false;
            if (shortlistFilterTier === 'conditional' && cand.tier !== 'conditional') return false;
            if (shortlistFilterTier === 'ineligible' && cand.tier !== 'ineligible') return false;
            if (shortlistFilterTier === 'cutoff' && cand.tier !== 'cutoff' && cand.is_shortlisted) return false;

            // GWA Filter
            if (shortlistFilterGwa !== 'all') {
                if (cand.gwa === null) return false;
                if (cand.gwa <= 5.0) {
                    if (shortlistFilterGwa === 'highest_honors' && cand.gwa > 1.25) return false;
                    if (shortlistFilterGwa === 'high_honors' && (cand.gwa <= 1.25 || cand.gwa > 1.50)) return false;
                    if (shortlistFilterGwa === 'honors' && (cand.gwa <= 1.50 || cand.gwa > 1.75)) return false;
                    if (shortlistFilterGwa === 'good_standing' && (cand.gwa <= 1.75 || cand.gwa > 2.00)) return false;
                    if (shortlistFilterGwa === 'pass' && cand.gwa <= 2.00) return false;
                }
            }

            // Program Filter
            if (shortlistFilterProgram !== 'all') {
                if ((cand.program || '').toLowerCase() !== shortlistFilterProgram.toLowerCase()) return false;
            }

            // Year Level Filter
            if (shortlistFilterYear !== 'all') {
                if ((cand.year_level || '').toLowerCase() !== shortlistFilterYear.toLowerCase()) return false;
            }

            // Min Score Filter
            if (shortlistFilterMinScore > 0) {
                if (cand.total_score < shortlistFilterMinScore) return false;
            }

            // Search Term
            if (shortlistSearchTerm) {
                const matchName = cand.full_name.toLowerCase().includes(shortlistSearchTerm);
                const matchId = cand.student_number.toLowerCase().includes(shortlistSearchTerm);
                const matchEmail = cand.email.toLowerCase().includes(shortlistSearchTerm);
                const matchProg = cand.program.toLowerCase().includes(shortlistSearchTerm);
                if (!matchName && !matchId && !matchEmail && !matchProg) return false;
            }

            return true;
        });

        renderShortlistTable();
    }

    function renderShortlistTable() {
        const thead = document.getElementById('applicants-table-thead');
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width: 62px;">Rank</th>
                    <th>Candidate Name & ID</th>
                    <th>Program & Year</th>
                    <th>Academic Merit (GWA)</th>
                    <th>Qualification Score</th>
                    <th>Shortlist Status & Recommendation</th>
                    <th style="text-align: right;">Evaluation Actions</th>
                </tr>
            `;
        }

        const tbody = document.getElementById('applicants-tbody');
        if (!tbody) return;

        const hasCriteria = hasEducationalCriteria(activeScholarshipData);

        const totalPendingCount = (shortlistSummaryData && (shortlistSummaryData.total_evaluated || shortlistSummaryData.total_pending))
            ? (shortlistSummaryData.total_evaluated || shortlistSummaryData.total_pending)
            : (allEvaluatedShortlist && allEvaluatedShortlist.length > 0 ? allEvaluatedShortlist.length : rankedShortlist.length);

        const countLabel = document.getElementById('table-count-label');
        if (countLabel) {
            if (shortlistFilterTier === 'cutoff') {
                countLabel.innerText = `Showing ${filteredShortlist.length} Applicants Below 75% Cutoff (Excluded from Shortlist)`;
            } else {
                countLabel.innerText = `Showing ${filteredShortlist.length} of ${rankedShortlist.length} Shortlisted Candidates (Top 75% of ${totalPendingCount} Pending Applicants)`;
            }
        }

        const showingEntries = document.getElementById('showing-entries');
        if (showingEntries) {
            showingEntries.innerText = filteredShortlist.length > 0
                ? `Showing 1 to ${filteredShortlist.length} of ${filteredShortlist.length} entries`
                : 'Showing 0 entries';
        }

        if (filteredShortlist.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 48px 20px; color: var(--text-muted); font-size: 13.5px;">
                        <i data-lucide="filter-x" style="width: 32px; height: 32px; color: var(--text-light); margin: 0 auto 10px auto; display: block;"></i>
                        <strong style="color: var(--text-heading); display: block; font-size: 15px; margin-bottom: 4px;">No candidates match filter criteria</strong>
                        Try clearing or relaxing your GWA, program, or tier filters to see more shortlisted students.
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        tbody.innerHTML = '';
        filteredShortlist.forEach((cand) => {
            const tr = document.createElement('tr');

            // Rank Badge
            let rankBadgeClass = 'rank-standard';
            let rankDisplay = `#${cand.rank}`;
            if (cand.rank === 1) {
                rankBadgeClass = 'rank-gold';
                rankDisplay = '🥇 1';
            } else if (cand.rank === 2) {
                rankBadgeClass = 'rank-silver';
                rankDisplay = '🥈 2';
            } else if (cand.rank === 3) {
                rankBadgeClass = 'rank-bronze';
                rankDisplay = '🥉 3';
            }

            // GWA Tag
            let gwaHighlightClass = '';
            let honorTag = '';
            if (cand.gwa !== null && cand.gwa <= 5.0) {
                if (cand.gwa <= 1.25) {
                    gwaHighlightClass = 'gwa-highest-honors';
                    honorTag = '<span style="font-size:10px; color:#b45309; font-weight:700; display:block;">Highest Honors</span>';
                } else if (cand.gwa <= 1.50) {
                    gwaHighlightClass = 'gwa-high-honors';
                    honorTag = '<span style="font-size:10px; color:var(--moss-green); font-weight:700; display:block;">High Honors</span>';
                } else if (cand.gwa <= 1.75) {
                    honorTag = '<span style="font-size:10px; color:var(--river-blue); font-weight:600; display:block;">Honors</span>';
                }
            }

            // Score Meter Bar (for criteria) or FCFS Badge (for open programs)
            let fillClass = 'fill-average';
            let ratingTag = 'Good';
            let ratingClass = 'rating-good';
            if (cand.total_score >= 90) {
                fillClass = 'fill-excellent';
                ratingTag = 'Outstanding';
                ratingClass = 'rating-excellent';
            } else if (cand.total_score >= 80) {
                fillClass = 'fill-good';
                ratingTag = 'Very Good';
                ratingClass = 'rating-very-good';
            } else if (cand.total_score < 70) {
                fillClass = 'fill-poor';
                ratingTag = 'Review';
                ratingClass = 'rating-poor';
            }

            // Tier Badge
            let tierClass = 'tier-qualified';
            let tierIcon = 'check-circle';
            let tierTitle = 'Qualified Candidate';
            if (cand.tier === 'slotted') {
                tierClass = 'tier-slotted';
                tierIcon = 'award';
                tierTitle = 'Slotted Grantee';
            } else if (cand.tier === 'cutoff' || !cand.is_shortlisted) {
                tierClass = 'tier-cutoff';
                tierIcon = 'scissors';
                tierTitle = 'Below 75% Cutoff';
            } else if (cand.tier === 'conditional') {
                tierClass = 'tier-conditional';
                tierIcon = 'alert-triangle';
                tierTitle = 'Conditional Review';
            } else if (cand.tier === 'ineligible') {
                tierClass = 'tier-ineligible';
                tierIcon = 'x-circle';
                tierTitle = 'Ineligible';
            }

            const initials = ((cand.first_name[0] || '') + (cand.last_name[0] || '')).toUpperCase() || 'A';
            const avatarHtml = cand.avatar_url
                ? `<img src="${cand.avatar_url}" alt="${cand.full_name}" style="width: 34px; height: 34px; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : `<div style="width: 34px; height: 34px; border-radius: 50%; background: var(--border-color); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 700;">${initials}</div>`;

            // Evaluation actions
            const normStatus = normalizeApplicantStatus(cand.current_status);
            let actionButtonsHtml = `
                <div style="display:flex; gap:6px; justify-content: flex-end; align-items: center;">
                    <button type="button" class="btn-outline" onclick="openCriteriaScorecard('${cand.applicant_id}')" title="Inspect educational criteria match and score details" style="padding: 5px 10px; font-size: 12px;">
                        <i data-lucide="award" style="width: 13px; height: 13px; color: #d97706;"></i> Scorecard
                    </button>
                    <button type="button" class="btn-outline" onclick="openApplicantModal('${cand.applicant_id}')" title="View submitted responses and document attachments" style="padding: 5px 10px; font-size: 12px;">
                        <i data-lucide="file-text" style="width: 13px; height: 13px;"></i> Responses
                    </button>
            `;

            if (normStatus === 'pending') {
                actionButtonsHtml += `
                    <button type="button" class="btn-approve" onclick="confirmUpdateStatus('${cand.applicant_id}', 'Approved', 'Approve')" title="Approve applicant" style="padding: 5px 10px; font-size: 12px;">
                        <i data-lucide="check" style="width: 13px; height: 13px;"></i>
                    </button>
                    <button type="button" class="btn-reject" onclick="confirmUpdateStatus('${cand.applicant_id}', 'Rejected', 'Reject')" title="Reject applicant" style="padding: 5px 10px; font-size: 12px;">
                        <i data-lucide="x" style="width: 13px; height: 13px;"></i>
                    </button>
                `;
            } else if (normStatus === 'approved') {
                actionButtonsHtml += `
                    <span class="badge-status badge-approved" style="font-size: 11px; padding: 3px 8px;">
                        <i data-lucide="check-circle-2" style="width: 11px; height: 11px;"></i> Approved
                    </span>
                `;
            }

            actionButtonsHtml += `</div>`;

            // Column 4: GWA HTML
            const gwaColHtml = cand.gwa !== null && cand.gwa <= 5.0
                ? `
                    <div class="gwa-highlight-pill ${gwaHighlightClass}">
                        <i data-lucide="graduation-cap" style="width: 13px; height: 13px;"></i>
                        <span>${cand.gwa_display}</span>
                    </div>
                    ${honorTag}
                `
                : `
                    <div class="gwa-highlight-pill" style="background: rgba(148, 163, 184, 0.12); color: var(--text-muted); border-color: rgba(148, 163, 184, 0.25);">
                        <i data-lucide="${hasCriteria ? 'clock' : 'check'}" style="width: 13px; height: 13px;"></i>
                        <span>${hasCriteria ? 'Pending OCR' : 'No Min GWA'}</span>
                    </div>
                    <span style="font-size:10px; color:var(--text-muted); font-weight:600; display:block;">${hasCriteria ? 'Awaiting Grade' : 'Open Program'}</span>
                `;

            // Column 5: Score / FCFS HTML
            const scoreColHtml = (!hasCriteria || cand.has_educational_criteria === false)
                ? `
                    <div class="score-cell-container">
                        <div class="score-cell-header">
                            <span class="score-badge-val" style="font-size: 12px; color: var(--moss-green); font-weight: 700;">Rank #${cand.rank} (FCFS)</span>
                            <span class="score-rating-pill rating-excellent">100% Eligible</span>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px; display: flex; align-items: center; gap: 4px;">
                            <i data-lucide="clock" style="width: 11px; height: 11px;"></i>
                            <span>Applied: ${cand.applied_date_str || (cand.created_at ? new Date(cand.created_at).toLocaleDateString() : '')} ${cand.applied_time_str || ''}</span>
                        </div>
                    </div>
                `
                : `
                    <div class="score-cell-container">
                        <div class="score-cell-header">
                            <span class="score-badge-val">${cand.total_score}%</span>
                            <span class="score-rating-pill ${ratingClass}">${ratingTag}</span>
                        </div>
                        <div class="score-meter-bar">
                            <div class="score-meter-fill ${fillClass}" style="width: ${cand.total_score}%;"></div>
                        </div>
                    </div>
                `;

            tr.innerHTML = `
                <td>
                    <div class="rank-badge ${rankBadgeClass}">${rankDisplay}</div>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${avatarHtml}
                        <div>
                            <div style="color: var(--text-heading); font-weight: 700; font-size: 13.5px; cursor: pointer;" onclick="openCriteriaScorecard('${cand.applicant_id}')" title="Click to view scorecard">
                                ${escapeHtml(cand.full_name)}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
                                <span class="count-pill" style="font-size: 10.5px; padding: 2px 6px;">ID: ${escapeHtml(cand.student_number)}</span>
                                <span>${escapeHtml(cand.email)}</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td>
                    <div style="color: var(--text-heading); font-size: 13px; font-weight: 600;">${escapeHtml(cand.program)}</div>
                    <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(cand.year_level)}</div>
                </td>
                <td>${gwaColHtml}</td>
                <td>${scoreColHtml}</td>
                <td>
                    <div class="tier-badge ${tierClass}">
                        <i data-lucide="${tierIcon}" style="width: 12px; height: 12px;"></i>
                        <span>${tierTitle}</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; max-width: 220px; line-height: 1.3;">
                        ${escapeHtml(cand.recommendation)}
                    </div>
                </td>
                <td>${actionButtonsHtml}</td>
            `;

            tbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    // --- 8.6 CRITERIA SCORECARD & DETAILED BREAKDOWN MODAL ---
    window.closeScorecardModal = () => {
        const modal = document.getElementById('shortlist-scorecard-modal');
        if (modal) modal.style.display = 'none';
    };

    window.openCriteriaScorecard = (applicantId) => {
        const candidatePool = (allEvaluatedShortlist && allEvaluatedShortlist.length > 0) ? allEvaluatedShortlist : rankedShortlist;
        const cand = candidatePool.find(c => String(c.applicant_id) === String(applicantId));
        if (!cand) {
            showUIToast('error', 'Error', 'Candidate scorecard data not found.');
            return;
        }

        const modal = document.getElementById('shortlist-scorecard-modal');
        const modalName = document.getElementById('scorecard-applicant-name');
        const modalMeta = document.getElementById('scorecard-applicant-meta');
        const modalTier = document.getElementById('scorecard-tier-badge');
        const modalBody = document.getElementById('scorecard-modal-body');
        const modalRankText = document.getElementById('scorecard-rank-text');
        const modalActions = document.getElementById('scorecard-action-buttons');

        if (!modal || !modalBody) return;

        if (modalName) modalName.innerText = cand.full_name;
        if (modalMeta) modalMeta.innerText = `${cand.program} (${cand.year_level}) • Student ID: ${cand.student_number}`;

        if (modalTier) {
            let tierClass = 'tier-qualified';
            let tierLabel = 'Qualified Candidate';
            if (cand.tier === 'slotted') {
                tierClass = 'tier-slotted';
                tierLabel = 'Slotted Grantee (Slot Secured)';
            } else if (cand.tier === 'cutoff' || !cand.is_shortlisted) {
                tierClass = 'tier-cutoff';
                tierLabel = 'Below 75% Cutoff (Not Shortlisted)';
            } else if (cand.tier === 'conditional') {
                tierClass = 'tier-conditional';
                tierLabel = 'Conditional Candidate';
            } else if (cand.tier === 'ineligible') {
                tierClass = 'tier-ineligible';
                tierLabel = 'Ineligible (Criteria Not Met)';
            }
            modalTier.className = `tier-badge ${tierClass}`;
            modalTier.innerHTML = `<i data-lucide="${cand.tier === 'slotted' ? 'award' : (cand.tier === 'cutoff' ? 'scissors' : (cand.is_strictly_eligible ? 'check-circle' : 'x-circle'))}" style="width: 12px; height: 12px;"></i> ${tierLabel}`;
        }

        if (modalRankText) {
            const totalPending = cand.total_pending || (allEvaluatedShortlist && allEvaluatedShortlist.length > 0 ? allEvaluatedShortlist.length : rankedShortlist.length);
            const cutoffQuota = cand.shortlist_cutoff_rank || rankedShortlist.length;
            modalRankText.innerText = cand.is_shortlisted
                ? `Rank: #${cand.rank} of ${totalPending} Pending Applicants (Shortlisted • Top 75% Cutoff #${cutoffQuota})`
                : `Rank: #${cand.rank} of ${totalPending} Pending Applicants (Below 75% Shortlist Cutoff #${cutoffQuota})`;
        }

        const b = cand.breakdown;
        const sch = activeScholarshipData || {};
        const providerName = sch.department || sch.category || 'Educational Assistance Sponsor';

        let bodyHtml = `
            <!-- Overall Score & Merit Header Gauge -->
            <div class="scorecard-header-gauge">
                <div class="scorecard-gauge-left">
                    <div class="scorecard-circle-score">
                        <span class="score-num">${cand.total_score}%</span>
                        <span class="score-max">OVERALL</span>
                    </div>
                    <div>
                        <div style="font-size: 15px; font-weight: 800; color: var(--text-heading); margin-bottom: 2px;">
                            ${cand.tier === 'slotted' ? '🏆 Recommended for Immediate Grant Award' : (cand.is_strictly_eligible ? '⭐ Qualified for Grant Selection' : '⚠️ Action Required / Disqualified')}
                        </div>
                        <div style="font-size: 12.5px; color: var(--text-muted); line-height: 1.4;">
                            ${escapeHtml(cand.recommendation)}
                        </div>
                        <div style="margin-top: 6px; font-size: 11.5px; color: var(--river-blue); font-weight: 600;">
                            🏢 Sponsoring Provider: ${providerName}
                        </div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div class="count-pill" style="font-size: 13px; font-weight: 700; padding: 6px 14px;">
                        Candidate Rank: #${cand.rank}
                    </div>
                </div>
            </div>

            <!-- Disqualification / Warning Alerts if present -->
            ${cand.disqualifications && cand.disqualifications.length > 0 ? `
                <div style="background: rgba(217, 72, 65, 0.08); border: 1px solid rgba(217, 72, 65, 0.25); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px;">
                    <div style="font-size: 13px; font-weight: 700; color: var(--danger-color); display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                        <i data-lucide="alert-circle" style="width: 15px; height: 15px;"></i> Educational Criteria Disqualification
                    </div>
                    <ul style="margin: 0; padding-left: 20px; font-size: 12.5px; color: var(--text-main);">
                        ${cand.disqualifications.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            <!-- Criteria-by-Criteria Score Breakdown List -->
            <div class="modal-section-title" style="margin-bottom: 10px;">
                <i data-lucide="sliders-horizontal"></i> Educational Criteria Score Breakdown (100 Pts Total)
            </div>

            <div class="criteria-list-container">
                <!-- 1. Academic Merit -->
                <div class="criterion-card-item">
                    <div class="criterion-card-header">
                        <div class="criterion-name-group">
                            <i data-lucide="graduation-cap" style="width: 16px; height: 16px; color: var(--moss-green);"></i>
                            <span>1. Academic Performance & Merit (Weight: 45 Pts)</span>
                        </div>
                        <div>
                            <span class="criterion-passed-tag ${b.academicMerit.passed ? 'tag-pass' : 'tag-fail'}">
                                ${b.academicMerit.passed ? '✓ Meets Requirement' : '✗ Misses Cutoff'} (${b.academicMerit.score} / 45 pts)
                            </span>
                        </div>
                    </div>
                    <div class="criterion-details-desc">
                        ${escapeHtml(b.academicMerit.details)}
                    </div>
                    <div class="criterion-score-progress">
                        <div class="criterion-score-fill ${b.academicMerit.passed ? '' : 'fail-fill'}" style="width: ${(b.academicMerit.score / 45) * 100}%;"></div>
                    </div>
                </div>

                <!-- 2. Degree Program Alignment -->
                <div class="criterion-card-item">
                    <div class="criterion-card-header">
                        <div class="criterion-name-group">
                            <i data-lucide="book-open" style="width: 16px; height: 16px; color: var(--moss-green);"></i>
                            <span>2. Degree Program Alignment (Weight: 20 Pts)</span>
                        </div>
                        <div>
                            <span class="criterion-passed-tag ${b.programMatch.passed ? 'tag-pass' : 'tag-fail'}">
                                ${b.programMatch.passed ? '✓ Course Match' : '✗ Program Ineligible'} (${b.programMatch.score} / 20 pts)
                            </span>
                        </div>
                    </div>
                    <div class="criterion-details-desc">
                        ${escapeHtml(b.programMatch.details)}
                    </div>
                    <div class="criterion-score-progress">
                        <div class="criterion-score-fill ${b.programMatch.passed ? '' : 'fail-fill'}" style="width: ${(b.programMatch.score / 20) * 100}%;"></div>
                    </div>
                </div>

                <!-- 3. Year Level Alignment -->
                <div class="criterion-card-item">
                    <div class="criterion-card-header">
                        <div class="criterion-name-group">
                            <i data-lucide="calendar" style="width: 16px; height: 16px; color: var(--moss-green);"></i>
                            <span>3. Year Level Cohort Alignment (Weight: 15 Pts)</span>
                        </div>
                        <div>
                            <span class="criterion-passed-tag ${b.yearMatch.passed ? 'tag-pass' : 'tag-fail'}">
                                ${b.yearMatch.passed ? '✓ Cohort Match' : '✗ Year Level Ineligible'} (${b.yearMatch.score} / 15 pts)
                            </span>
                        </div>
                    </div>
                    <div class="criterion-details-desc">
                        ${escapeHtml(b.yearMatch.details)}
                    </div>
                    <div class="criterion-score-progress">
                        <div class="criterion-score-fill ${b.yearMatch.passed ? '' : 'fail-fill'}" style="width: ${(b.yearMatch.score / 15) * 100}%;"></div>
                    </div>
                </div>

                <!-- 4. Documents & Verification -->
                <div class="criterion-card-item">
                    <div class="criterion-card-header">
                        <div class="criterion-name-group">
                            <i data-lucide="file-check" style="width: 16px; height: 16px; color: var(--moss-green);"></i>
                            <span>4. Required Documents Completeness & AI OCR (Weight: 15 Pts)</span>
                        </div>
                        <div>
                            <span class="criterion-passed-tag ${b.documentCompleteness.passed ? 'tag-pass' : 'tag-fail'}">
                                ${b.documentCompleteness.passed ? '✓ Verified Documents' : '⚠ Missing Requirements'} (${b.documentCompleteness.score} / 15 pts)
                            </span>
                        </div>
                    </div>
                    <div class="criterion-details-desc">
                        ${escapeHtml(b.documentCompleteness.details)}
                    </div>
                    <div class="criterion-score-progress">
                        <div class="criterion-score-fill" style="width: ${(b.documentCompleteness.score / 15) * 100}%;"></div>
                    </div>
                </div>

                <!-- 5. Submission Timeliness -->
                <div class="criterion-card-item">
                    <div class="criterion-card-header">
                        <div class="criterion-name-group">
                            <i data-lucide="clock" style="width: 16px; height: 16px; color: var(--moss-green);"></i>
                            <span>5. Application Submission Timeliness (Weight: 5 Pts)</span>
                        </div>
                        <div>
                            <span class="criterion-passed-tag tag-pass">
                                ✓ Timely Submission (${b.timeliness.score} / 5 pts)
                            </span>
                        </div>
                    </div>
                    <div class="criterion-details-desc">
                        ${escapeHtml(b.timeliness.details)}
                    </div>
                    <div class="criterion-score-progress">
                        <div class="criterion-score-fill" style="width: ${(b.timeliness.score / 5) * 100}%;"></div>
                    </div>
                </div>
            </div>

            <!-- Provider & Coordinator Evaluation Sign-off Preview -->
            <div class="evaluation-signoff-card">
                <div class="evaluation-signoff-header">
                    <i data-lucide="file-signature" style="width: 15px; height: 15px; color: var(--moss-green);"></i>
                    <span>Official Evaluation Audit Trail & Committee Sign-Off</span>
                </div>
                <div class="evaluation-signoff-grid">
                    <div class="signoff-box">
                        <strong>Evaluated By:</strong> Scholarship Coordinator
                        <div style="font-size: 11px; margin-top: 2px;">Office of Student Affairs / Grant Management</div>
                    </div>
                    <div class="signoff-box">
                        <strong>Reviewed & Endorsed By:</strong> ${providerName}
                        <div style="font-size: 11px; margin-top: 2px;">Educational Assistance Sponsoring Representative</div>
                    </div>
                </div>
            </div>
        `;

        modalBody.innerHTML = bodyHtml;

        // Modal Action Buttons
        if (modalActions) {
            let actionsHtml = `
                <button type="button" class="btn-outline" onclick="openApplicantModal('${cand.applicant_id}')">
                    <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> View Full Application Responses
                </button>
            `;

            if (normalizeApplicantStatus(cand.current_status) === 'pending') {
                actionsHtml += `
                    <button type="button" class="btn-reject" onclick="closeScorecardModal(); confirmUpdateStatus('${cand.applicant_id}', 'Rejected', 'Reject')">
                        <i data-lucide="x" style="width: 14px; height: 14px;"></i> Reject
                    </button>
                    <button type="button" class="btn-approve" onclick="closeScorecardModal(); confirmUpdateStatus('${cand.applicant_id}', 'Approved', 'Approve')">
                        <i data-lucide="check" style="width: 14px; height: 14px;"></i> Approve as Grantee
                    </button>
                `;
            } else {
                actionsHtml += `
                    <button type="button" class="btn-approve" onclick="closeScorecardModal()">
                        <i data-lucide="check" style="width: 14px; height: 14px;"></i> Done
                    </button>
                `;
            }

            modalActions.innerHTML = actionsHtml;
        }

        modal.style.display = 'flex';

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    // --- 8.7 BATCH APPROVE TOP SHORTLIST ---
    window.batchApproveTopShortlist = async () => {
        const pendingSlotted = rankedShortlist.filter(c => c.tier === 'slotted' && normalizeApplicantStatus(c.current_status) === 'pending');

        if (pendingSlotted.length === 0) {
            showUIToast('info', 'All Slotted Approved', 'All top-ranked candidates within the program slots are already approved.');
            return;
        }

        const confirm = await Swal.fire({
            title: `Approve All ${pendingSlotted.length} Slotted Candidates?`,
            text: `This will grant approval to all ${pendingSlotted.length} top-ranked students who meet educational criteria and fit within the available slots.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#1F3D2E',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: `Yes, Approve ${pendingSlotted.length} Candidates!`
        });

        if (!confirm.isConfirmed) return;

        Swal.fire({
            title: 'Processing Batch Approvals...',
            text: 'Updating grantee records and reserving slots...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const updatePromises = pendingSlotted.map(cand => 
                window.supabaseClient
                    .from('applications')
                    .update({ status: 'Approved', remarks: `Approved via Ranked Shortlist Evaluation (Rank #${cand.rank}, Score: ${cand.total_score}%).` })
                    .eq('id', cand.applicant_id)
            );

            await Promise.all(updatePromises);

            await logSystemAction('Batch Approved Shortlist', `Approved ${pendingSlotted.length} slotted candidates for ${activeScholarshipData?.title || 'Scholarship'}`);

            Swal.close();
            showUIToast('success', 'Batch Approval Successful', `Successfully approved ${pendingSlotted.length} shortlisted grantees!`);
            await loadApplicationsForActiveTab();
        } catch (err) {
            console.error("Batch Approval Error:", err);
            Swal.close();
            showUIToast('error', 'Error', 'Failed to batch approve candidates: ' + err.message);
        }
    };

    // --- 8.8 EXPORT RANKED SHORTLIST (CSV AND PDF) ---
    window.exportShortlist = async (targetFormat) => {
        closeExportDropdown();

        // 1. Ensure rankedShortlist is loaded and populated
        if (!rankedShortlist || rankedShortlist.length === 0) {
            Swal.fire({
                title: 'Preparing Ranked Shortlist...',
                text: 'Loading candidate evaluation scores and merit rankings...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
            try {
                await generateRankedShortlist();
                Swal.close();
            } catch (err) {
                Swal.close();
                console.error("Error generating shortlist for export:", err);
            }
        }

        // Export all candidates who are on the ranked shortlist
        const candidatesToExport = (rankedShortlist && rankedShortlist.length > 0)
            ? rankedShortlist
            : ((allEvaluatedShortlist && allEvaluatedShortlist.length > 0) ? allEvaluatedShortlist : []);

        if (candidatesToExport.length === 0) {
            showUIToast('info', 'No Data', 'No candidates found on the ranked shortlist for this educational assistance program.');
            return;
        }

        let format = targetFormat;
        if (!format) {
            const { value: selectedFormat } = await Swal.fire({
                title: 'Export Ranked Shortlist',
                text: `Export all ${candidatesToExport.length} candidates on the ranked shortlist with their exact data:`,
                icon: 'question',
                input: 'select',
                inputOptions: {
                    'csv': `Ranked Shortlist Spreadsheet (CSV / Excel) - ${candidatesToExport.length} candidates`,
                    'pdf': `Official Evaluation Report (PDF with Sign-Off) - ${candidatesToExport.length} candidates`
                },
                inputPlaceholder: 'Select an export format',
                showCancelButton: true,
                confirmButtonColor: '#1F3D2E',
                confirmButtonText: 'Export'
            });
            format = selectedFormat;
        }

        if (!format) return;

        if (format === 'csv') {
            exportShortlistToCSV(candidatesToExport);
        } else if (format === 'pdf') {
            exportShortlistToPDF(candidatesToExport);
        }
    };

    function exportShortlistToCSV(candidatesToExport) {
        // Guarantee all candidates who are on the ranked shortlist are exported
        const candidatePool = (Array.isArray(candidatesToExport) && candidatesToExport.length > 0)
            ? candidatesToExport
            : ((rankedShortlist && rankedShortlist.length > 0) ? rankedShortlist : (allEvaluatedShortlist || []));

        if (!candidatePool || candidatePool.length === 0) {
            showUIToast('info', 'No Data', 'No ranked shortlist candidates found to export.');
            return;
        }

        const sch = activeScholarshipData || {};
        const programTitle = sch.title || 'Educational Assistance Program';
        const providerName = sch.department || sch.category || 'General Administration';
        const institutionName = currentAdminSchool?.name || 'Institution of Higher Education';

        // Check if scholarship has custom application form questions
        const schema = sch.form_fields || sch.form_schema || [];
        const questionFields = Array.isArray(schema) ? schema.filter(f => f && f.type !== 'heading' && f.type !== 'text') : [];

        let csvContent = "\uFEFF"; // UTF-8 BOM for Microsoft Excel compatibility

        // Complete & Exact Headers
        const headers = [
            "Rank",
            "Shortlist Cutoff Status",
            "Shortlist Tier",
            "Slot Allocation",
            "Student ID",
            "Full Name",
            "Last Name",
            "First Name",
            "Middle Name",
            "Gender",
            "Email Address",
            "Contact Number",
            "Degree Program",
            "Year Level",
            "Numerical GWA",
            "GWA Display",
            "GWA Source",
            "Academic Merit Score (/45)",
            "Academic Merit Evaluation Details",
            "Degree Program Match Score (/20)",
            "Degree Program Evaluation Details",
            "Year Level Cohort Score (/15)",
            "Year Level Evaluation Details",
            "Documents & AI OCR Score (/15)",
            "Documents & OCR Evaluation Details",
            "Submission Timeliness Score (/5)",
            "Submission Timeliness Details",
            "Total Qualification Score (%)",
            "Strict Eligibility (Passed All Cutoffs)",
            "Committee Recommendation",
            "Evaluation Flags & Missing Requirements",
            "Disqualification Remarks",
            "Current Application Status",
            "Date Applied",
            "Time Applied",
            "Submission Server Timestamp",
            "Scholarship Program",
            "Educational Assistance Provider",
            "Institution / School"
        ];

        // Append custom question headers if configured
        questionFields.forEach(q => {
            const cleanLabel = (q.label || '').replace(/<[^>]*>?/gm, '').replace(/[\r\n]+/g, ' ').trim();
            headers.push(`Form Response: ${cleanLabel}`);
        });

        csvContent += headers.map(h => `"${sanitizeCsvValue(h)}"`).join(",") + "\r\n";

        // Candidate Rows with exact verified data
        candidatePool.forEach(cand => {
            const b = cand.breakdown || {};
            const appliedDate = cand.applied_date_str || (cand.created_at ? new Date(cand.created_at).toLocaleDateString('en-US') : 'N/A');
            const appliedTime = cand.applied_time_str || (cand.created_at ? new Date(cand.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A');
            const createdTimestamp = cand.created_at || 'N/A';

            let tierText = 'Qualified Candidate';
            if (cand.tier === 'slotted') tierText = 'Top Slotted Grantee';
            else if (cand.tier === 'cutoff' || !cand.is_shortlisted) tierText = 'Below 75% Cutoff';
            else if (cand.tier === 'conditional') tierText = 'Conditional Review';
            else if (cand.tier === 'ineligible' || !cand.is_strictly_eligible) tierText = 'Ineligible';

            const slotText = cand.is_slotted ? 'Reserved Grantee Slot' : 'Waitlisted / Priority Runner-Up';
            const cutoffStatus = cand.is_shortlisted ? 'Shortlisted (Top 75%)' : 'Below 75% Cutoff';
            const strictEligText = cand.is_strictly_eligible ? 'Yes (Meets All Cutoffs)' : 'No (Missed Required Cutoffs)';

            const flagsText = Array.isArray(cand.flags) && cand.flags.length > 0 ? cand.flags.join('; ') : 'None';
            const disqText = Array.isArray(cand.disqualifications) && cand.disqualifications.length > 0 ? cand.disqualifications.join('; ') : 'None';

            const acadScore = (b.academicMerit && b.academicMerit.score !== undefined) ? b.academicMerit.score : 'N/A';
            const acadDetails = b.academicMerit?.details || '';

            const progScore = (b.programMatch && b.programMatch.score !== undefined) ? b.programMatch.score : 'N/A';
            const progDetails = b.programMatch?.details || '';

            const yrScore = (b.yearMatch && b.yearMatch.score !== undefined) ? b.yearMatch.score : 'N/A';
            const yrDetails = b.yearMatch?.details || '';

            const docScore = (b.documentCompleteness && b.documentCompleteness.score !== undefined) ? b.documentCompleteness.score : 'N/A';
            const docDetails = b.documentCompleteness?.details || '';

            const timeScore = (b.timeliness && b.timeliness.score !== undefined) ? b.timeliness.score : 'N/A';
            const timeDetails = b.timeliness?.details || '';

            const gwaNum = (cand.gwa !== null && cand.gwa !== undefined) ? cand.gwa : 'N/A';

            const rowData = [
                cand.rank,
                cutoffStatus,
                tierText,
                slotText,
                cand.student_number || 'N/A',
                cand.full_name || 'Applicant',
                cand.last_name || '',
                cand.first_name || '',
                cand.middle_name || '',
                cand.gender || 'N/A',
                cand.email || 'N/A',
                cand.contact_number || 'N/A',
                cand.program || 'N/A',
                cand.year_level || 'N/A',
                gwaNum,
                cand.gwa_display || 'N/A',
                cand.gwa_source || 'Application Form / OCR',
                acadScore,
                acadDetails,
                progScore,
                progDetails,
                yrScore,
                yrDetails,
                docScore,
                docDetails,
                timeScore,
                timeDetails,
                `${cand.total_score !== undefined ? cand.total_score : 100}%`,
                strictEligText,
                cand.recommendation || '',
                flagsText,
                disqText,
                getDisplayStatus(cand.current_status),
                appliedDate,
                appliedTime,
                createdTimestamp,
                programTitle,
                providerName,
                institutionName
            ];

            // Append custom form answers
            questionFields.forEach(q => {
                let answer = '';
                if (cand.form_responses && Object.prototype.hasOwnProperty.call(cand.form_responses, q.label)) {
                    answer = renderFormattedAnswer(cand.form_responses[q.label], q);
                }
                rowData.push(answer);
            });

            csvContent += rowData.map(val => `"${sanitizeCsvValue(val)}"`).join(",") + "\r\n";
        });

        const programName = sanitizeFilename(activeScholarshipData?.title || 'Scholarship');
        const filename = `${programName}_Ranked_Shortlist_Evaluation_${Date.now()}.csv`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showUIToast('success', 'Export Complete', `Successfully exported all ${candidatePool.length} shortlisted candidates with complete evaluation data.`);
    }

    window.exportShortlistToCSV = exportShortlistToCSV;

    function exportShortlistToPDF(candidatesToExport) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showUIToast('error', 'Missing Library', 'jsPDF is required to generate the PDF evaluation report.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'pt', 'a4');

        const sch = activeScholarshipData || {};
        const schTitle = sch.title || 'Educational Assistance Program';
        const providerName = sch.department || sch.category || 'General Administration';
        const schoolName = currentAdminSchool?.name || 'Institution of Higher Education';

        const summary = shortlistSummaryData || {
            total_evaluated: candidatesToExport.length,
            qualified_candidates: candidatesToExport.filter(c => c.is_strictly_eligible).length,
            slotted_grantees: candidatesToExport.filter(c => c.tier === 'slotted').length,
            average_shortlist_gwa: '1.25',
            shortlist_cutoff_score: 85
        };

        // Header Styling
        doc.setFillColor(31, 61, 46); // Forest shade
        doc.rect(0, 0, 842, 65, 'F');

        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text("OFFICIAL RANKED SHORTLIST & EVALUATION REPORT", 40, 32);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(220, 230, 222);
        doc.text(`Prepared for Sponsoring Company / Educational Assistance Provider & School Coordinator`, 40, 48);

        // Document Metadata Block
        doc.setFontSize(11);
        doc.setTextColor(31, 61, 46);
        doc.setFont('helvetica', 'bold');
        doc.text(`Program: ${schTitle}`, 40, 85);
        doc.text(`Institution: ${schoolName}`, 40, 100);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(70, 70, 70);
        doc.text(`Educational Provider: ${providerName}`, 480, 85);
        doc.text(`Evaluation Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, 480, 100);

        // Executive Summary Metrics Box
        doc.setFillColor(244, 246, 242);
        doc.roundedRect(40, 112, 762, 38, 4, 4, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 61, 46);
        doc.text(`Total Evaluated: ${summary.total_evaluated}`, 55, 134);
        doc.text(`Available Slots: ${sch.slots || 'Open'}`, 210, 134);
        doc.text(`Qualified Candidates: ${summary.qualified_candidates}`, 350, 134);
        doc.text(`Slotted Grantees: ${summary.slotted_grantees}`, 510, 134);
        doc.text(`Cutoff Score: ${summary.shortlist_cutoff_score}%`, 670, 134);

        // Table Data
        const tableColumn = ["Rank", "Student ID", "Candidate Full Name", "Degree Program & Year", "GWA", "Score (%)", "Shortlist Status", "Committee Recommendation"];
        const tableRows = [];

        candidatesToExport.forEach(cand => {
            const progYear = `${cand.program}\n(${cand.year_level})`;
            const tierText = cand.tier === 'slotted' ? 'Top Slotted' : (cand.is_strictly_eligible ? 'Qualified' : (cand.tier === 'conditional' ? 'Conditional' : 'Ineligible'));

            tableRows.push([
                cand.rank === 1 ? '#1 (Gold)' : (cand.rank === 2 ? '#2 (Silver)' : (cand.rank === 3 ? '#3 (Bronze)' : `#${cand.rank}`)),
                cand.student_number,
                cand.full_name,
                progYear,
                cand.gwa_display,
                `${cand.total_score}%`,
                tierText,
                cand.recommendation
            ]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 160,
            styles: { fontSize: 8, cellPadding: 5, overflow: 'linebreak' },
            headStyles: { fillColor: [107, 127, 78], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 247] },
            columnStyles: {
                0: { cellWidth: 50, fontStyle: 'bold' },
                1: { cellWidth: 70 },
                2: { cellWidth: 120, fontStyle: 'bold' },
                3: { cellWidth: 140 },
                4: { cellWidth: 45, fontStyle: 'bold' },
                5: { cellWidth: 55, fontStyle: 'bold' },
                6: { cellWidth: 75 },
                7: { cellWidth: 205 }
            },
            didDrawPage: (data) => {
                // Footer
                const pageNumber = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(140);
                doc.text(`Grantee Smart Scholarship Management System • Page ${data.pageNumber}`, 40, 580);
            }
        });

        // Sign-off Block on the last page
        const finalY = doc.lastAutoTable.finalY || 400;
        let signY = finalY + 30;

        if (signY > 500) {
            doc.addPage();
            signY = 60;
        }

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 61, 46);
        doc.text("COMMITTEE EVALUATION & APPROVAL ENDORSEMENT", 40, signY);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text("We hereby certify that the students above have been evaluated against established criteria and ranked for grant allocation.", 40, signY + 14);

        const sigLineY = signY + 50;

        // Signature Line 1: Coordinator
        doc.setDrawColor(180);
        doc.line(40, sigLineY, 260, sigLineY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 61, 46);
        doc.text("SCHOLARSHIP COORDINATOR", 40, sigLineY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text("Office of Student Financial Assistance", 40, sigLineY + 24);
        doc.text("Date: ________________________", 40, sigLineY + 36);

        // Signature Line 2: Sponsoring Provider
        doc.line(480, sigLineY, 700, sigLineY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 61, 46);
        doc.text("EDUCATIONAL ASSISTANCE PROVIDER", 480, sigLineY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(`Authorized Representative (${providerName})`, 480, sigLineY + 24);
        doc.text("Date: ________________________", 480, sigLineY + 36);

        const programName = sanitizeFilename(sch.title || 'Scholarship');
        const filename = `${programName}_Official_Shortlist_Evaluation_Report_${Date.now()}.pdf`;

        doc.save(filename);
        showUIToast('success', 'PDF Report Generated', `Official Evaluation Report downloaded successfully.`);
    }

    // --- 9. EXPORT OPTIONS (CSV AND PDF) ---
    window.exportByStatus = async (targetStatus) => {
        const appsToExport = currentApplications.filter(app => {
            const normalizedStatus = normalizeApplicantStatus(app.status);
            if (targetStatus === 'Pending') return normalizedStatus === 'pending' || normalizedStatus === 'under review';
            if (targetStatus === 'Approved') return normalizedStatus === 'approved';
            if (targetStatus === 'Waitlisted') return normalizedStatus === 'waitlisted';
            return normalizedStatus === targetStatus.toLowerCase();
        });

        if (appsToExport.length === 0) {
            showUIToast('info', 'Empty', `No data to export for ${targetStatus} applicants.`);
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
            showUIToast('error', 'Missing Library', 'jsPDF is required to export to PDF. Please ensure jsPDF is available.');
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
            showUIToast('info', 'Empty', 'No applicant records found for this educational assistance program.');
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

    const scorecardModal = document.getElementById('shortlist-scorecard-modal');
    if (scorecardModal) {
        scorecardModal.addEventListener('click', (e) => {
            if (e.target.id === 'shortlist-scorecard-modal') {
                closeScorecardModal();
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
            const scorecardEl = document.getElementById('shortlist-scorecard-modal');
            if (scorecardEl && scorecardEl.style.display === 'flex') {
                closeScorecardModal();
            }
        }
    });

    // --- REALTIME SYNC ENGINE ---
    let liveRefreshTimer = null;
    function triggerAdminApplicationsRefresh() {
        if (liveRefreshTimer) clearTimeout(liveRefreshTimer);
        liveRefreshTimer = setTimeout(async () => {
            if (activeScholarshipData && activeScholarshipData.id) {
                await loadApplicationsForActiveTab();
            } else {
                loadScholarships(false);
            }
        }, 300);
    }

    if (window.supabaseClient) {
        const liveChannel = window.supabaseClient
            .channel(`admin-apps-live-${Date.now()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
                triggerAdminApplicationsRefresh();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, () => {
                triggerAdminApplicationsRefresh();
            })
            .subscribe();

        window.addEventListener('beforeunload', () => {
            try { window.supabaseClient.removeChannel(liveChannel); } catch (e) {}
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            triggerAdminApplicationsRefresh();
        }
    });
    window.addEventListener('focus', () => {
        triggerAdminApplicationsRefresh();
    });

    // INIT
    showProgramCardsSkeleton();
    await loadProfile();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
})();
