(async function () {

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    const tbody = document.getElementById('scholarships-tbody');
    let allScholarships = [];
    let filteredScholarships = [];
    let currentAdminSchoolId = null;

    // Clean up any rogue unattached calendar elements
    document.querySelectorAll('.flatpickr-calendar:not(.open):not(.inline)').forEach(el => el.remove());

    // Initialize initial Lucide icons on page
    if (window.lucide) {
        lucide.createIcons();
    }

    // Helper: Skeleton Rows for table
    function renderSkeletonRows() {
        if (!tbody) return;
        tbody.innerHTML = `
            <tr>
                <td>
                    <div class="scholarship-name-cell">
                        <div class="skeleton-table-icon skeleton-box"></div>
                        <div>
                            <div class="skeleton-table-title skeleton-line"></div>
                            <div class="skeleton-table-sub skeleton-line"></div>
                        </div>
                    </div>
                </td>
                <td><div class="skeleton-table-badge skeleton-pill"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td style="text-align: center;">
                    <div class="skeleton-table-apps skeleton-line"></div>
                    <div class="skeleton-table-slots skeleton-line"></div>
                </td>
                <td>
                    <div class="skeleton-btn-group">
                        <div class="skeleton-table-btn skeleton-box"></div>
                        <div class="skeleton-table-btn skeleton-box"></div>
                    </div>
                </td>
            </tr>
            <tr>
                <td>
                    <div class="scholarship-name-cell">
                        <div class="skeleton-table-icon skeleton-box"></div>
                        <div>
                            <div class="skeleton-table-title skeleton-line" style="width: 220px;"></div>
                            <div class="skeleton-table-sub skeleton-line" style="width: 140px;"></div>
                        </div>
                    </div>
                </td>
                <td><div class="skeleton-table-badge skeleton-pill" style="width: 130px;"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td style="text-align: center;">
                    <div class="skeleton-table-apps skeleton-line"></div>
                    <div class="skeleton-table-slots skeleton-line"></div>
                </td>
                <td>
                    <div class="skeleton-btn-group">
                        <div class="skeleton-table-btn skeleton-box"></div>
                        <div class="skeleton-table-btn skeleton-box"></div>
                    </div>
                </td>
            </tr>
            <tr>
                <td>
                    <div class="scholarship-name-cell">
                        <div class="skeleton-table-icon skeleton-box"></div>
                        <div>
                            <div class="skeleton-table-title skeleton-line" style="width: 160px;"></div>
                            <div class="skeleton-table-sub skeleton-line" style="width: 110px;"></div>
                        </div>
                    </div>
                </td>
                <td><div class="skeleton-table-badge skeleton-pill"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td style="text-align: center;">
                    <div class="skeleton-table-apps skeleton-line"></div>
                    <div class="skeleton-table-slots skeleton-line"></div>
                </td>
                <td>
                    <div class="skeleton-btn-group">
                        <div class="skeleton-table-btn skeleton-box"></div>
                        <div class="skeleton-table-btn skeleton-box"></div>
                    </div>
                </td>
            </tr>
            <tr>
                <td>
                    <div class="scholarship-name-cell">
                        <div class="skeleton-table-icon skeleton-box"></div>
                        <div>
                            <div class="skeleton-table-title skeleton-line" style="width: 190px;"></div>
                            <div class="skeleton-table-sub skeleton-line" style="width: 130px;"></div>
                        </div>
                    </div>
                </td>
                <td><div class="skeleton-table-badge skeleton-pill" style="width: 120px;"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td style="text-align: center;">
                    <div class="skeleton-table-apps skeleton-line"></div>
                    <div class="skeleton-table-slots skeleton-line"></div>
                </td>
                <td>
                    <div class="skeleton-btn-group">
                        <div class="skeleton-table-btn skeleton-box"></div>
                        <div class="skeleton-table-btn skeleton-box"></div>
                    </div>
                </td>
            </tr>
            <tr>
                <td>
                    <div class="scholarship-name-cell">
                        <div class="skeleton-table-icon skeleton-box"></div>
                        <div>
                            <div class="skeleton-table-title skeleton-line" style="width: 170px;"></div>
                            <div class="skeleton-table-sub skeleton-line" style="width: 100px;"></div>
                        </div>
                    </div>
                </td>
                <td><div class="skeleton-table-badge skeleton-pill"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-date skeleton-line"></div></td>
                <td><div class="skeleton-table-badge-sm skeleton-pill"></div></td>
                <td style="text-align: center;">
                    <div class="skeleton-table-apps skeleton-line"></div>
                    <div class="skeleton-table-slots skeleton-line"></div>
                </td>
                <td>
                    <div class="skeleton-btn-group">
                        <div class="skeleton-table-btn skeleton-box"></div>
                        <div class="skeleton-table-btn skeleton-box"></div>
                    </div>
                </td>
            </tr>
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
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                currentAdminSchoolId = profile.school_id;

                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';
                const fullName = `${firstName} ${lastName}`.trim();
                const schoolName = profile.schools ? profile.schools.name : 'Unassigned School';

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
                }

                // Remove loading skeleton from header
                const headerTitlesBox = document.getElementById('header-titles-box');
                if (headerTitlesBox) {
                    headerTitlesBox.classList.remove('is-loading');
                }

                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
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
        }
    }

    // --- 3. DATA FORMATTERS & BADGE GENERATORS ---
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getStatusHTML = (status) => {
        const lowerStatus = (status || 'Draft').toLowerCase();
        if (lowerStatus === 'active') {
            return `<span class="status-indicator status-active">Active</span>`;
        }
        if (lowerStatus === 'upcoming') {
            return `<span class="status-indicator status-upcoming">Upcoming</span>`;
        }
        if (lowerStatus === 'draft') {
            return `<span class="status-indicator status-draft">Draft</span>`;
        }
        return `<span class="status-indicator status-closed">Closed</span>`;
    };

    const getTypeBadge = (type) => {
        const safeType = type || 'Institution-Funded Educational Assistance';
        let badgeClass = 'badge-cat-inst';

        if (safeType === 'Ched Educational Assistance') {
            badgeClass = 'badge-cat-ched';
        } else if (safeType === 'Private Educational Assistance') {
            badgeClass = 'badge-cat-priv';
        } else if (safeType === 'Government Educational Assistance') {
            badgeClass = 'badge-cat-gov';
        }

        return `<span class="badge-category ${badgeClass}">${safeType}</span>`;
    };

    const getScholarshipTypeBadge = (schType) => {
        const safeType = schType || 'Merit-Based';
        const isNeed = safeType.toLowerCase().includes('need');
        const badgeClass = isNeed ? 'need-based' : 'merit-based';
        return `<span class="badge-type ${badgeClass}">${safeType}</span>`;
    };

    const calculateDynamicStatus = (sch) => {
        if (sch.status === 'Draft') return 'Draft';
        if (!sch.start_date || !sch.end_date) return sch.status || 'Draft';

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const start = new Date(sch.start_date); start.setHours(0, 0, 0, 0);
        const end = new Date(sch.end_date); end.setHours(23, 59, 59, 999);

        if (today < start) return 'Upcoming';
        if (today >= start && today <= end) return 'Active';
        return 'Closed';
    };

    // --- 4. FETCH & LOAD SCHOLARSHIPS ---
    const loadScholarships = async () => {
        try {
            if (!currentAdminSchoolId) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 40px; color: var(--danger-color);">Account error: No school assigned to this admin.</td></tr>`;
                removeStatSkeletons();
                return;
            }

            const { data: rawData, error } = await window.supabaseClient
                .from('scholarships')
                .select(`*, applications(id, status)`)
                .eq('school_id', currentAdminSchoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            allScholarships = (rawData || []).map(sch => {
                const totalAppsCount = sch.applications ? sch.applications.length : 0;
                const passedAppsCount = sch.applications ? sch.applications.filter(app => app.status === 'Passed').length : 0;
                let isUnlimited = sch.slots === 'Open' || !sch.slots;
                let remaining = null;

                if (!isUnlimited) {
                    const totalSlots = parseInt(sch.slots) || 0;
                    remaining = Math.max(0, totalSlots - passedAppsCount);
                }

                return {
                    ...sch,
                    applications_count: totalAppsCount,
                    passed_count: passedAppsCount,
                    remaining_slots: remaining,
                    is_unlimited: isUnlimited,
                    dynamic_status: calculateDynamicStatus(sch)
                };
            });

            filteredScholarships = [...allScholarships];
            updateTopStats(allScholarships);
            applyFilters();

        } catch (error) {
            console.error('Error fetching data:', error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 40px; color: var(--danger-color);">Failed to load data from database.</td></tr>`;
            removeStatSkeletons();
            Swal.fire({
                title: 'Error',
                text: 'Failed to load data from database.',
                icon: 'error',
                confirmButtonColor: '#1F3D2E'
            });
        }
    };

    const removeStatSkeletons = () => {
        document.querySelectorAll('.stat-card.is-loading').forEach(card => {
            card.classList.remove('is-loading');
        });
    };

    const updateTopStats = (data) => {
        const total = data.length;
        const active = data.filter(s => s.dynamic_status === 'Active').length;
        const closed = data.filter(s => s.dynamic_status === 'Closed' || s.dynamic_status === 'Draft').length;

        const countTotal = document.getElementById('count-total');
        const countActive = document.getElementById('count-active');
        const countClosed = document.getElementById('count-closed');

        if (countTotal) countTotal.innerText = total;
        if (countActive) countActive.innerText = active;
        if (countClosed) countClosed.innerText = closed;

        // Remove loading state from stat cards
        removeStatSkeletons();
    };

    const renderTable = (data) => {
        const entriesInfo = document.getElementById('entries-info');
        if (entriesInfo) {
            entriesInfo.innerText = data.length === 0
                ? `Showing 0 to 0 of 0 entries`
                : `Showing 1 to ${data.length} of ${data.length} entries`;
        }

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="padding:48px 20px; text-align:center; color:var(--text-muted); font-size: 14px;">No matching educational assistance programs found.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';

        data.forEach(sch => {
            let slotsDisplay = '';
            if (sch.is_unlimited) {
                slotsDisplay = `<div style="font-size:11.5px; margin-top:3px; color:var(--text-muted);">Unlimited Slots</div>`;
            } else if (sch.remaining_slots === 0) {
                slotsDisplay = `<div style="font-size:11.5px; margin-top:3px; font-weight:700; color:var(--danger-color);">FULL (0/${sch.slots} Left)</div>`;
            } else {
                slotsDisplay = `<div style="font-size:11.5px; margin-top:3px; font-weight:700; color:var(--moss-green);">${sch.remaining_slots}/${sch.slots} Slot(s) Left</div>`;
            }

            // Stripping HTML from description for the table preview
            let rawTextDesc = 'No description provided';
            if (sch.description) {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = sch.description;
                rawTextDesc = (tempDiv.textContent || tempDiv.innerText || "").trim();
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="scholarship-name-cell">
                        <div class="icon-box">
                            <i data-lucide="graduation-cap"></i>
                        </div>
                        <div>
                            <strong>${sch.title}</strong>
                            <span>${rawTextDesc.substring(0, 42) + (rawTextDesc.length > 42 ? '...' : '')}</span>
                        </div>
                    </div>
                </td>
                <td>${getTypeBadge(sch.category)}</td>
                <td>${getScholarshipTypeBadge(sch.scholarship_type)}</td>
                <td>${formatDate(sch.start_date)}</td>
                <td>${formatDate(sch.end_date)}</td>
                <td>${getStatusHTML(sch.dynamic_status)}</td>
                <td style="text-align:center;">
                    <div style="font-weight:700; color:var(--text-heading);">${sch.applications_count || 0} Apps</div>
                    ${slotsDisplay}
                </td>
                <td>
                    <div class="action-buttons-group">
                        ${sch.dynamic_status === 'Draft' || sch.status === 'Draft' ? `<button class="table-action-btn action-edit" data-id="${sch.id}" title="Edit Program"><i data-lucide="pencil"></i></button>` : ''}
                        <button class="table-action-btn action-view" data-id="${sch.id}" title="Preview Program"><i data-lucide="eye"></i></button>
                        <button class="table-action-btn action-delete" data-id="${sch.id}" title="Delete Program"><i data-lucide="trash-2"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) {
            lucide.createIcons();
        }
    };

    const applyFilters = () => {
        const searchInput = document.getElementById('search-input');
        const statusFilterInput = document.getElementById('filter-status');
        const categoryFilterInput = document.getElementById('filter-type');
        const schTypeFilterInput = document.getElementById('filter-scholarship-type');
        const sortByInput = document.getElementById('sort-by');

        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const statusFilter = statusFilterInput ? statusFilterInput.value : '';
        const categoryFilter = categoryFilterInput ? categoryFilterInput.value : '';
        const schTypeFilter = schTypeFilterInput ? schTypeFilterInput.value : '';
        const sortBy = sortByInput ? sortByInput.value : '';

        filteredScholarships = allScholarships.filter(sch => {
            const matchesSearch = !searchTerm || 
                (sch.title || '').toLowerCase().includes(searchTerm) || 
                (sch.description || '').toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === '' || sch.dynamic_status === statusFilter;
            const matchesCategory = categoryFilter === '' || sch.category === categoryFilter;
            const matchesSchType = schTypeFilter === '' || sch.scholarship_type === schTypeFilter;

            return matchesSearch && matchesStatus && matchesCategory && matchesSchType;
        });

        if (sortBy) {
            filteredScholarships.sort((a, b) => {
                let dateA, dateB;
                if (sortBy.startsWith('start')) {
                    dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
                    dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
                } else if (sortBy.startsWith('end')) {
                    dateA = a.end_date ? new Date(a.end_date).getTime() : Number.MAX_SAFE_INTEGER;
                    dateB = b.end_date ? new Date(b.end_date).getTime() : Number.MAX_SAFE_INTEGER;
                }
                return sortBy.endsWith('asc') ? dateA - dateB : dateB - dateA;
            });
        }

        renderTable(filteredScholarships);
    };

    if (document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if (document.getElementById('filter-status')) document.getElementById('filter-status').addEventListener('change', applyFilters);
    if (document.getElementById('filter-type')) document.getElementById('filter-type').addEventListener('change', applyFilters);
    if (document.getElementById('filter-scholarship-type')) document.getElementById('filter-scholarship-type').addEventListener('change', applyFilters);
    if (document.getElementById('sort-by')) document.getElementById('sort-by').addEventListener('change', applyFilters);

    // ==========================================
    // 5. PREVIEW SCHOLARSHIP POPUP
    // ==========================================
    const showPreviewModal = (sch) => {
        let dateText = 'No Deadline';
        if (sch.start_date && sch.end_date) {
            const options = { year: 'numeric', month: 'short', day: 'numeric' };
            const sDate = new Date(sch.start_date).toLocaleDateString('en-US', options);
            const eDate = new Date(sch.end_date).toLocaleDateString('en-US', options);
            dateText = `${sDate} to ${eDate}`;
        } else if (sch.end_date) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            dateText = new Date(sch.end_date).toLocaleDateString('en-US', options);
        }

        const safeParse = (data) => {
            if (typeof data === 'string') {
                try { return JSON.parse(data); } catch (e) { return []; }
            }
            return Array.isArray(data) ? data : [];
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

        const formatText = (text, rule) => {
            if (!text || typeof text !== 'string') return text;
            if (rule === 'UPPERCASE') return text.toUpperCase();
            if (rule === 'lowercase') return text.toLowerCase();
            if (rule === 'Capitalize Each Word') return text.replace(/\b\w/g, l => l.toUpperCase());
            return text;
        };

        const autoFmt = (typeof sch.auto_collected_formats === 'string') 
            ? (() => { try { return JSON.parse(sch.auto_collected_formats); } catch(e) { return {}; } })()
            : (sch.auto_collected_formats || {});

        const formFields = safeParse(sch.form_fields);
        const docConfigs = safeParse(sch.document_configurations);
        const eligibilityYears = safeParse(sch.eligibility_years);

        let html = `
        <div class="preview-mockup">
            <div class="preview-mockup-header">
                <span style="display:inline-flex; align-items:center; gap:8px;"><i data-lucide="graduation-cap" style="width: 18px; height: 18px;"></i> Educational Assistance Application Form</span>
                <span class="hide-on-mobile" style="font-size:12px; opacity:0.9;">Please review your details carefully before submitting.</span>
            </div>
            
            <div class="preview-mockup-body">
                <div class="preview-badges">
                    <span class="preview-badge-cat">${escapeHtml(sch.category || 'Institution-Funded')}</span>
                    <span class="preview-badge-type">${escapeHtml(sch.scholarship_type || 'Merit-Based')}</span>
                </div>
                
                <h2 class="preview-title">${escapeHtml(sch.title || 'Untitled Educational Assistance')}</h2>
                <div class="preview-subtitle">${escapeHtml(sch.department || 'General Admin')}</div>

                <div class="preview-split">
                    <div>
                        <h4 style="font-size:15px; font-weight:700; margin-bottom:8px; color: var(--text-heading);">About this Educational Assistance</h4>
                        <div class="preview-description">${sch.description || 'An educational assistance program that recognizes students with outstanding academic performance.'}</div>
                        
                        <h4 style="font-size:15px; font-weight:700; margin-bottom:8px; color: var(--text-heading);">Eligibility Requirements</h4>
                        <ul class="preview-eligibility-list">
                            ${sch.min_hs_average ? `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have a High School Average of <b>${sch.min_hs_average}</b> or better.</span></li>` : ''}
                            ${sch.min_college_gwa ? `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have a College GWA of <b>${sch.min_college_gwa}</b> or better.</span></li>` : ''}
                            ${sch.min_hs_subject_grade ? `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have NO individual High School subject grade lower than <b>${sch.min_hs_subject_grade}</b>.</span></li>` : ''}
                            ${sch.min_college_subject_grade ? `<li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Must have NO individual College subject grade lower than <b>${sch.min_college_subject_grade}</b>.</span></li>` : ''}
                            <li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Open to Year Levels: <b>${eligibilityYears.length > 0 ? eligibilityYears.join(', ') : 'Any'}</b>.</span></li>
                            <li class="preview-eligibility-item"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> <span>Open to Programs: <b>${(() => {
                                const ep = safeParse(sch.eligibility_programs);
                                if (!ep || ep.length === 0) return 'Any';
                                return `${ep.length} Programs selected`;
                            })()}</b>.</span></li>
                        </ul>
                    </div>
                    
                    <div class="preview-info-box">
                        <div class="preview-info-label">Application Period / Deadline</div>
                        <div class="preview-info-value text-red">${dateText}</div>
                        
                        <div class="preview-info-label">Batch / Cohort</div>
                        <div class="preview-info-value">${escapeHtml(sch.batch || 'N/A')}</div>

                        <div class="preview-info-label">Semester</div>
                        <div class="preview-info-value">${escapeHtml(sch.semester || 'N/A')}</div>

                        <div class="preview-info-label">Available Slots</div>
                        <div class="preview-info-value">${escapeHtml(sch.slots || 'Unlimited')}</div>

                        <div class="preview-info-label">School Year</div>
                        <div class="preview-info-value">${escapeHtml(sch.school_year || 'N/A')}</div>
                        
                        <div class="preview-info-label">Status</div>
                        <div class="preview-info-value text-green">ACTIVE</div>
                    </div>
                </div>

                <div style="text-align: center; margin: 28px 0 22px 0; border-top: 1px solid var(--border-color); padding-top: 24px;">
                    <h2 style="font-size: 20px; font-weight: 800; color: var(--text-heading); margin-bottom: 4px;">Application Form</h2>
                    <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 4px;">Complete the required fields below.</p>
                    <p style="color: var(--text-light); font-size: 12px; font-style: italic; max-width: 600px; margin: 0 auto;">Note: Profile information and responses will automatically be converted according to institutional formatting requirements.</p>
                </div>

                <div class="preview-section-title">1. Applicant Profile</div>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px;">This information is permanently tied to your account. To edit, go to Profile Settings.</p>
                
                <div class="preview-field-grid">
                    <div class="preview-input-group"><label>Student ID Number</label><input type="text" class="preview-input" value="202302709" readonly></div>
                    <div class="preview-input-group"><label>Email Address</label><input type="text" class="preview-input" value="${formatText('student@gmail.com', autoFmt['Email Address'] || autoFmt['Email'])}" readonly></div>
                    <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Full Name</label><input type="text" class="preview-input" value="${formatText('John Jeffrey T. Cañete', autoFmt['Full Name'])}" readonly></div>
                    <div class="preview-input-group"><label>Date of Birth</label><input type="text" class="preview-input" value="N/A" readonly></div>
                    <div class="preview-input-group"><label>Gender</label><input type="text" class="preview-input" value="${formatText('Male', autoFmt['Gender'])}" readonly></div>
                    <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Contact Number</label><input type="text" class="preview-input" value="09123456789" readonly></div>
                    <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Address</label><input type="text" class="preview-input" value="${formatText('N/A', autoFmt['Address'])}" readonly></div>
                    <div class="preview-input-group"><label>Program</label><input type="text" class="preview-input" value="${formatText('BS Information Technology', autoFmt['Program'])}" readonly></div>
                    <div class="preview-input-group"><label>Year Level</label><input type="text" class="preview-input" value="${formatText('4th year', autoFmt['Year Level'])}" readonly></div>
                </div>

                <div class="preview-section-title">2. Questionnaire</div>
                ${formFields.length === 0 ? '<p style="font-size:13px; color: var(--text-muted); margin-bottom: 20px;">No custom questions added.</p>' : ''}
                <div class="preview-field-grid">
                    ${formFields.map(f => `
                        <div class="preview-input-group" style="margin-bottom:12px; ${['Textarea', 'Text'].includes(f.type) ? 'grid-column: 1 / -1;' : ''}">
                            <label>${escapeHtml(f.label)} ${f.required ? '<span class="text-red">*</span>' : ''}</label>
                            ${['Dropdown'].includes(f.type)
                                ? `<select class="preview-input preview-input-active" disabled><option>Select option...</option>${(f.options || []).map(o => `<option>${escapeHtml(o)}</option>`).join('')}</select>`
                                : (f.type === 'Selection'
                                    ? `<div style="padding-top:6px; display:flex; flex-direction:column; gap:8px;">${(f.options || []).map(opt => `<label class="radio-checkbox-label" style="font-size:13px; color:var(--text-main); display:inline-flex; align-items:center; gap:6px;"><input type="${f.allow_multiple ? 'checkbox' : 'radio'}" disabled> ${escapeHtml(opt)}</label>`).join('')}</div>`
                                    : `<input type="text" class="preview-input preview-input-active" placeholder="${f.type === 'Date' ? 'Select Date (YYYY-MM-DD)' : 'Enter your answer...'}" disabled>`
                                )
                            }
                        </div>
                    `).join('')}
                </div>

                <div class="preview-section-title">3. Document Uploads</div>
                ${(() => {
                    const hasOcr = docConfigs.some(d => d.ocr_enabled !== false);
                    if (!hasOcr) return '';
                    return `
                    <div class="preview-ai-banner">
                        <i data-lucide="bot" style="width: 22px; height: 22px; flex-shrink: 0; color: var(--river-blue);"></i>
                        <div>
                            <strong>AI Verification Active:</strong> Please ensure your documents are clear and legible. Our AI system will scan the contents to verify authenticity, signatures, and ensure your grades meet the minimum eligibility rules for this educational assistance.
                        </div>
                    </div>`;
                })()}

                ${docConfigs.length === 0 ? '<p style="font-size:13px; color: var(--text-muted);">No documents required.</p>' : ''}
                
                <div>
                    ${docConfigs.map(d => {
                        const hasDesc = d.description && d.description.trim() !== '';
                        const isOcr = d.ocr_enabled !== false;
                        const ocrBadge = isOcr
                            ? `<span class="preview-ocr-badge active"><i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> AI OCR Active</span>`
                            : `<span class="preview-ocr-badge inactive"><i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Standard Upload</span>`;

                        return `
                        <div class="preview-doc-box">
                            <div class="preview-doc-header">
                                <label style="font-size:13.5px; font-weight:700; color: var(--text-heading); display:inline-flex; align-items:center; gap:6px; margin:0;">
                                    <i data-lucide="upload" style="width: 15px; height: 15px; color: var(--moss-green);"></i> Upload ${escapeHtml(d.name)} ${d.required !== false ? '<span style="color:var(--danger-color);">*</span>' : '<span style="font-size:11px; color:var(--text-muted); font-weight:normal; margin-left:2px;">(Optional)</span>'}
                                </label>
                                <div>${ocrBadge}</div>
                            </div>
                            
                            ${hasDesc ? `
                            <div class="preview-doc-instruction">
                                <div class="preview-instruction-title">
                                    <i data-lucide="info" style="width: 13px; height: 13px;"></i> Document Description & Student Instructions:
                                </div>
                                <div class="preview-instruction-body">${escapeHtml(d.description).replace(/\n/g, '<br>')}</div>
                            </div>
                            ` : ''}

                            <div style="font-size:11px; color: var(--text-muted); margin-bottom:12px;">Allowed formats: PDF, JPG, PNG (Max size: ${d.max_size || 5}MB)</div>
                            <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
                                <button type="button" style="padding:8px 18px; background:var(--card-bg); border:1px solid var(--border-dark); border-radius:8px; font-size:13px; font-weight:600; cursor:not-allowed; color: var(--text-muted); display:inline-flex; align-items:center; gap:6px;"><i data-lucide="folder-open" style="width:14px; height:14px;"></i> Choose File</button>
                                <span style="font-size:11px; color: var(--text-muted);">No file selected</span>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>

                <button type="button" class="preview-submit-btn">Submit Application</button>
            </div>
        </div>`;

        Swal.fire({
            html: html,
            width: '1080px',
            padding: '0',
            showConfirmButton: false,
            showCloseButton: true,
            allowOutsideClick: false,
            allowEscapeKey: true,
            customClass: {
                popup: 'preview-swal-popup'
            },
            didOpen: () => {
                if (window.lucide) lucide.createIcons();
            }
        });
    };

    // --- 6. ACTION BUTTONS (VIEW & DELETE LOGIC) ---
    tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const scholarshipId = btn.getAttribute('data-id');
        const targetScholarship = allScholarships.find(s => s.id == scholarshipId);

        if (btn.classList.contains('action-edit')) {
            window.location.href = `create-scholarship.html?id=${scholarshipId}`;
        } else if (btn.classList.contains('action-view')) {
            if (targetScholarship) showPreviewModal(targetScholarship);
        } else if (btn.classList.contains('action-delete')) {

            Swal.fire({
                title: 'Delete this program?',
                text: "Are you sure you want to permanently delete this educational assistance program? All related applications will be lost.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#D94841',
                cancelButtonColor: '#586F62',
                confirmButtonText: 'Yes, delete it',
                cancelButtonText: 'Cancel'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        btn.disabled = true;
                        btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i>';
                        if (window.lucide) lucide.createIcons();

                        const { error } = await window.supabaseClient.from('scholarships').delete().eq('id', scholarshipId);
                        if (error) throw error;

                        Swal.fire({
                            title: 'Deleted!',
                            text: 'Educational assistance program deleted successfully.',
                            icon: 'success',
                            confirmButtonColor: '#1F3D2E'
                        });
                        loadScholarships();
                    } catch (error) {
                        console.error('Delete error:', error);
                        Swal.fire({
                            title: 'Error!',
                            text: 'Cannot delete this program. There may be existing applications tied to it.',
                            icon: 'error',
                            confirmButtonColor: '#1F3D2E'
                        });
                        btn.disabled = false;
                        btn.innerHTML = '<i data-lucide="trash-2"></i>';
                        if (window.lucide) lucide.createIcons();
                    }
                }
            });
        }
    });

    // --- 7. EXPORT DROPDOWN & EXPORT LOGIC ---
    const exportBtn = document.getElementById('export-btn');
    const exportDropdownMenu = document.getElementById('export-dropdown-menu');
    const exportDropdownWrapper = document.querySelector('.export-dropdown-wrapper');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');

    const toggleExportDropdown = (forceClose = false) => {
        if (!exportDropdownMenu || !exportBtn || !exportDropdownWrapper) return;
        
        const isCurrentlyOpen = exportDropdownMenu.classList.contains('show');
        if (forceClose || isCurrentlyOpen) {
            exportDropdownMenu.classList.remove('show');
            exportDropdownWrapper.classList.remove('open');
            exportBtn.setAttribute('aria-expanded', 'false');
        } else {
            exportDropdownMenu.classList.add('show');
            exportDropdownWrapper.classList.add('open');
            exportBtn.setAttribute('aria-expanded', 'true');
        }
    };

    if (exportBtn) {
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (filteredScholarships.length === 0) {
                Swal.fire({
                    title: 'No Data to Export',
                    text: 'There are no educational assistance records matching your current filter criteria.',
                    icon: 'info',
                    confirmButtonColor: '#1F3D2E'
                });
                return;
            }
            toggleExportDropdown();
        });
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExportDropdown(true);
            exportToCSV();
        });
    }

    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExportDropdown(true);
            exportToPDF();
        });
    }

    // Close dropdown on click outside or on Escape
    document.addEventListener('click', (e) => {
        if (exportDropdownWrapper && !exportDropdownWrapper.contains(e.target)) {
            toggleExportDropdown(true);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toggleExportDropdown(true);
        }
    });

    function exportToCSV() {
        let csvContent = "Educational Assistance Name,Category,Type,Opening Date,Deadline,Status,Total Applications,Remaining Slots\n";

        filteredScholarships.forEach(sch => {
            const name = `"${(sch.title || 'Untitled').replace(/"/g, '""')}"`;
            const category = `"${sch.category || 'General'}"`;
            const type = `"${sch.scholarship_type || 'Merit-Based'}"`;
            const start = formatDate(sch.start_date);
            const end = formatDate(sch.end_date);
            const status = sch.dynamic_status || 'Unknown';
            const appsCount = sch.applications_count || 0;
            const slots = sch.is_unlimited ? 'Unlimited' : sch.remaining_slots;

            csvContent += `${name},${category},${type},${start},${end},${status},${appsCount},${slots}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const today = new Date().toISOString().split('T')[0];

        link.setAttribute("href", url);
        link.setAttribute("download", `Educational_Assistance_Export_${today}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportToPDF() {
        if (!window.jspdf) {
            Swal.fire({
                title: 'Error',
                text: 'PDF library failed to load. Please check your internet connection.',
                icon: 'error',
                confirmButtonColor: '#1F3D2E'
            });
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(14);
        doc.text("Educational Assistance Programs Report", 14, 15);
        doc.setFontSize(10);

        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`Generated on: ${today}`, 14, 22);

        const tableColumn = ["Program Name", "Category", "Type", "Start Date", "Deadline", "Status", "Apps", "Slots"];
        const tableRows = [];

        filteredScholarships.forEach(sch => {
            const rowData = [
                sch.title || 'Untitled',
                sch.category || 'General',
                sch.scholarship_type || 'Merit-Based',
                formatDate(sch.start_date),
                formatDate(sch.end_date),
                sch.dynamic_status || 'Unknown',
                sch.applications_count || 0,
                sch.is_unlimited ? 'Unlimited' : sch.remaining_slots
            ];
            tableRows.push(rowData);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [31, 61, 46] },
            columnStyles: {
                0: { cellWidth: 50 },
            }
        });

        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`Educational_Assistance_Export_${dateStr}.pdf`);
    }

    // INIT
    loadProfile();
})();
