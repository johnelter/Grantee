(async function () {

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    let adminSchoolId = null;
    let currentFilter = localStorage.getItem('admin_dashboard_filter') || 'This Month';

    // --- 2. SKELETON HELPERS ---
    const showSkeletonStates = () => {
        // Metric Cards
        const metricCards = ['card-metric-scholarships', 'card-metric-applications', 'card-metric-pending', 'card-metric-outcomes'];
        metricCards.forEach(id => {
            const card = document.getElementById(id);
            if (card) card.classList.add('is-loading');
        });

        // Top Scholarships Skeleton
        const topTbody = document.getElementById('top-scholarships-tbody');
        if (topTbody) {
            topTbody.innerHTML = `
                <tr>
                    <td class="p-0">
                        <div class="skeleton-table-row-top"><div class="flex items-center"><div class="skeleton-rank-badge"></div><div class="skeleton-schol-title"></div></div><div class="skeleton-schol-count"></div></div>
                        <div class="skeleton-table-row-top"><div class="flex items-center"><div class="skeleton-rank-badge"></div><div class="skeleton-schol-title"></div></div><div class="skeleton-schol-count"></div></div>
                        <div class="skeleton-table-row-top"><div class="flex items-center"><div class="skeleton-rank-badge"></div><div class="skeleton-schol-title"></div></div><div class="skeleton-schol-count"></div></div>
                    </td>
                </tr>`;
        }

        // Performance Bars Skeleton
        const perfBars = document.getElementById('performance-bars-container');
        if (perfBars) {
            perfBars.innerHTML = `
                <div class="skeleton-bar-col">
                    <div class="skeleton-bar-rate"></div>
                    <div class="skeleton-bar-track"><div class="skeleton-bar-placeholder" style="height: 65%;"></div></div>
                    <div class="skeleton-bar-title"></div>
                </div>
                <div class="skeleton-bar-col">
                    <div class="skeleton-bar-rate"></div>
                    <div class="skeleton-bar-track"><div class="skeleton-bar-placeholder" style="height: 85%;"></div></div>
                    <div class="skeleton-bar-title"></div>
                </div>
                <div class="skeleton-bar-col">
                    <div class="skeleton-bar-rate"></div>
                    <div class="skeleton-bar-track"><div class="skeleton-bar-placeholder" style="height: 40%;"></div></div>
                    <div class="skeleton-bar-title"></div>
                </div>
                <div class="skeleton-bar-col">
                    <div class="skeleton-bar-rate"></div>
                    <div class="skeleton-bar-track"><div class="skeleton-bar-placeholder" style="height: 75%;"></div></div>
                    <div class="skeleton-bar-title"></div>
                </div>
                <div class="skeleton-bar-col">
                    <div class="skeleton-bar-rate"></div>
                    <div class="skeleton-bar-track"><div class="skeleton-bar-placeholder" style="height: 50%;"></div></div>
                    <div class="skeleton-bar-title"></div>
                </div>`;
        }

        // Audit Trail Skeleton
        const auditTbody = document.getElementById('audit-trail-tbody');
        if (auditTbody) {
            auditTbody.innerHTML = `
                <tr class="skeleton-audit-row">
                    <td><div class="skeleton-line skeleton-line-time"></div></td>
                    <td><div class="skeleton-line skeleton-line-user"></div></td>
                    <td><div class="skeleton-line skeleton-line-action"></div></td>
                    <td><div class="skeleton-pill skeleton-pill-module"></div></td>
                    <td><div class="skeleton-line skeleton-line-details"></div></td>
                </tr>
                <tr class="skeleton-audit-row">
                    <td><div class="skeleton-line skeleton-line-time"></div></td>
                    <td><div class="skeleton-line skeleton-line-user"></div></td>
                    <td><div class="skeleton-line skeleton-line-action"></div></td>
                    <td><div class="skeleton-pill skeleton-pill-module"></div></td>
                    <td><div class="skeleton-line skeleton-line-details"></div></td>
                </tr>
                <tr class="skeleton-audit-row">
                    <td><div class="skeleton-line skeleton-line-time"></div></td>
                    <td><div class="skeleton-line skeleton-line-user"></div></td>
                    <td><div class="skeleton-line skeleton-line-action"></div></td>
                    <td><div class="skeleton-pill skeleton-pill-module"></div></td>
                    <td><div class="skeleton-line skeleton-line-details"></div></td>
                </tr>`;
        }

        // Category Legend Skeleton
        const catLegend = document.getElementById('schol-legend-container');
        if (catLegend) {
            catLegend.innerHTML = `
                <div class="skeleton-legend-item"><div class="skeleton-legend-left"><div class="skeleton-dot"></div><div class="skeleton-legend-title"></div></div><div class="skeleton-legend-val"></div></div>
                <div class="skeleton-legend-item"><div class="skeleton-legend-left"><div class="skeleton-dot"></div><div class="skeleton-legend-title"></div></div><div class="skeleton-legend-val"></div></div>
                <div class="skeleton-legend-item"><div class="skeleton-legend-left"><div class="skeleton-dot"></div><div class="skeleton-legend-title"></div></div><div class="skeleton-legend-val"></div></div>`;
        }
    };

    // --- 3. LOAD PROFILE DATA INTO HEADER ---
    async function loadProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*, schools(name)')
                .eq('id', adminId)
                .single();

            if (profile) {
                if (!['admin', 'coordinator'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                adminSchoolId = profile.school_id;
                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';
                const fullName = `${firstName} ${lastName}`.trim();
                const schoolName = profile.schools ? profile.schools.name : 'Unassigned School';

                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = fullName;
                }

                if (document.getElementById('header-role')) {
                    document.getElementById('header-role').innerText = profile.role === 'admin' ? 'Coordinator' : profile.role;
                }

                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                if (document.getElementById('admin-school-display')) {
                    document.getElementById('admin-school-display').innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>Assigned to: <strong>${schoolName}</strong></span>`;
                }

                const titlesBox = document.getElementById('header-titles-box');
                if (titlesBox) {
                    titlesBox.classList.remove('is-loading');
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
            }
        } catch (error) {
            console.error("Error loading admin profile:", error);
        }
    }

    // --- 3.1 TRACK COORDINATOR LOGIN ACTIVITY ---
    async function trackCoordinatorLogin() {
        if (!adminId || !adminSchoolId) return;

        const sessionKey = `grantee_coordinator_login_logged_${adminId}`;
        if (sessionStorage.getItem(sessionKey)) {
            return; // Already logged for this session
        }

        try {
            const cachedProfile = sessionStorage.getItem('grantee_admin_profile');
            let adminName = 'Coordinator';
            let adminRole = 'Coordinator';
            if (cachedProfile) {
                try {
                    const parsed = JSON.parse(cachedProfile);
                    adminName = parsed.name || 'Coordinator';
                    adminRole = parsed.role || 'Coordinator';
                } catch (e) { }
            }

            const { error } = await window.supabaseClient
                .from('audit_logs')
                .insert([{
                    admin_id: adminId,
                    school_id: adminSchoolId,
                    action: 'Coordinator Logged In',
                    module: 'Authentication',
                    details: JSON.stringify({
                        details: `${adminName} (${adminRole}) logged in to the dashboard.`,
                        timestamp: new Date().toISOString()
                    })
                }]);

            if (!error) {
                sessionStorage.setItem(sessionKey, new Date().toISOString());
            }
        } catch (e) {
            console.warn("Could not record coordinator login in activity log:", e);
        }
    }

    // --- 4. DATE FILTER LOGIC ---
    const getDateRange = (filter) => {
        const now = new Date();
        let startDate = new Date();
        let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Check for Custom Dates from localStorage
        const customKey = `admin_dates_${filter.replace(/\s+/g, '_')}`;
        const savedDates = localStorage.getItem(customKey);

        if (savedDates && (filter === 'Current Semester' || filter === 'Current School Year' || filter === 'Custom Date Range')) {
            try {
                const parsed = JSON.parse(savedDates);
                if (parsed.start && parsed.end) {
                    const parsedStart = new Date(parsed.start);
                    const parsedEnd = new Date(parsed.end);
                    parsedEnd.setHours(23, 59, 59, 999);
                    return { start: parsedStart.toISOString(), end: parsedEnd.toISOString() };
                }
            } catch (e) { }
        }

        switch (filter) {
            case 'Today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'This Week':
                const firstDay = now.getDate() - now.getDay();
                startDate = new Date(now.setDate(firstDay));
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'This Month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'Current Semester':
                const semStartMonth = now.getMonth() >= 5 ? 5 : 0;
                startDate = new Date(now.getFullYear(), semStartMonth, 1);
                break;
            case 'Current School Year':
                const syStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
                startDate = new Date(syStartYear, 7, 1);
                break;
            case 'Custom Date Range':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1); // fallback
                break;
            default:
                startDate = new Date(2000, 0, 1);
        }
        return { start: startDate.toISOString(), end: endDate.toISOString() };
    };

    // Filter Dropdown and Flatpickr Range Picker UI Logic
    const filterSelect = document.getElementById('dashboard-date-filter');
    const customWrapper = document.getElementById('custom-date-wrapper');
    const customDateRangeInput = document.getElementById('custom-date-range-picker');
    const customStart = document.getElementById('custom-start-date');
    const customEnd = document.getElementById('custom-end-date');
    const customInputBox = document.querySelector('.custom-date-input-box');
    let customDateRangePicker = null;

    const initFlatpickr = () => {
        const inputEl = document.getElementById('custom-date-range-picker');
        if (!inputEl) return;

        if (typeof flatpickr === 'undefined') {
            // Retry if flatpickr script is still loading
            setTimeout(initFlatpickr, 100);
            return;
        }

        if (customDateRangePicker) {
            try {
                customDateRangePicker.destroy();
            } catch (e) {}
        }

        customDateRangePicker = flatpickr(inputEl, {
            mode: "range",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "M j, Y",
            altInputClass: "flatpickr-custom-input",
            static: false,
            appendTo: document.body,
            disableMobile: true,
            locale: {
                rangeSeparator: "  to  "
            },
            onOpen: (selectedDates, dateStr, instance) => {
                if (instance && instance.calendarContainer) {
                    instance.calendarContainer.style.zIndex = '999999';
                }
            },
            onChange: (selectedDates) => {
                if (selectedDates.length === 2) {
                    const d1 = selectedDates[0];
                    const d2 = selectedDates[1];
                    const startStr = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
                    const endStr = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;

                    if (customStart) customStart.value = startStr;
                    if (customEnd) customEnd.value = endStr;

                    const customKey = `admin_dates_${currentFilter.replace(/\s+/g, '_')}`;
                    localStorage.setItem(customKey, JSON.stringify({
                        start: startStr,
                        end: endStr
                    }));
                    showSkeletonStates();
                    loadDashboardData();
                }
            }
        });

        // Ensure clicking anywhere in the custom-date-input-box triggers calendar open
        if (customInputBox) {
            customInputBox.onclick = (e) => {
                if (customDateRangePicker && !customDateRangePicker.isOpen) {
                    customDateRangePicker.open();
                }
            };
        }
    };

    // Initialize flatpickr immediately or when ready
    initFlatpickr();

    const updateCustomDateUI = (autoOpen = false) => {
        if (!customWrapper) return;
        const needsCustom = ['Current Semester', 'Current School Year', 'Custom Date Range'].includes(currentFilter);

        if (needsCustom) {
            customWrapper.classList.remove('hidden');
            customWrapper.classList.add('flex');
            customWrapper.style.display = 'flex';

            if (!customDateRangePicker) {
                initFlatpickr();
            }

            const range = getDateRange(currentFilter);
            const startStr = range.start.split('T')[0];
            const endStr = range.end.split('T')[0];

            if (customStart) customStart.value = startStr;
            if (customEnd) customEnd.value = endStr;

            if (customDateRangePicker) {
                customDateRangePicker.setDate([startStr, endStr], false);
                if (autoOpen && currentFilter === 'Custom Date Range') {
                    setTimeout(() => {
                        if (customDateRangePicker && !customDateRangePicker.isOpen) {
                            customDateRangePicker.open();
                        }
                    }, 50);
                }
            }
        } else {
            customWrapper.classList.add('hidden');
            customWrapper.classList.remove('flex');
            customWrapper.style.display = 'none';
            if (customDateRangePicker && customDateRangePicker.isOpen) {
                customDateRangePicker.close();
            }
        }
    };

    if (filterSelect) {
        if ([...filterSelect.options].some(o => o.value === currentFilter)) {
            filterSelect.value = currentFilter;
        }

        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            localStorage.setItem('admin_dashboard_filter', currentFilter);
            updateCustomDateUI(true);
            showSkeletonStates();
            loadDashboardData();
        });

        updateCustomDateUI(false);
    }

    // --- 5. FETCH & RENDER DASHBOARD DATA ---
    let allDashboardScholarships = [];
    let allDashboardApplications = [];
    let allDashboardAuditLogs = [];

    const loadDashboardData = async () => {
        if (!adminSchoolId) return;

        const { start, end } = getDateRange(currentFilter);

        try {
            // Fetch ALL Scholarships for this school
            const { data: scholarships, error: scholError } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('school_id', adminSchoolId);

            if (scholError) throw scholError;
            allDashboardScholarships = scholarships || [];

            // Fetch Applications (excluding unsubmitted drafts) with joined profiles and scholarships
            let applications = [];
            if (scholarships && scholarships.length > 0) {
                const scholIds = scholarships.map(s => s.id);
                const { data: apps, error: appError } = await window.supabaseClient
                    .from('applications')
                    .select(`
                        *,
                        scholarships (
                            title,
                            category
                        ),
                        profiles (
                            id,
                            first_name,
                            middle_name,
                            last_name,
                            id_number,
                            email,
                            contact_number,
                            program,
                            year_level,
                            avatar_url
                        )
                    `)
                    .in('scholarship_id', scholIds)
                    .neq('status', 'Draft')
                    .gte('created_at', start)
                    .lte('created_at', end)
                    .order('created_at', { ascending: false });

                if (appError) throw appError;
                applications = (apps || []).map(app => {
                    const fullSchol = (scholarships || []).find(s => s.id === app.scholarship_id);
                    return {
                        ...app,
                        scholarships: {
                            ...(fullSchol || {}),
                            ...(app.scholarships || {})
                        }
                    };
                });
            }
            allDashboardApplications = applications;

            // Fetch Audit Logs (All records in date range)
            const { data: auditLogs, error: auditError } = await window.supabaseClient
                .from('audit_logs')
                .select('*, profiles(first_name, last_name, email, avatar_url)')
                .eq('school_id', adminSchoolId)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: false });

            if (auditError) console.warn("Audit logs error:", auditError);
            allDashboardAuditLogs = auditLogs || [];

            // Fetch Notifications for Recent Activity
            const { data: recentNotifs, error: notifError } = await window.supabaseClient
                .from('notifications')
                .select('*')
                .eq('admin_id', adminId)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: false })
                .limit(10);

            if (notifError) console.warn("Notifications error:", notifError);

            // Combine both logs for Recent Activity timeline
            const combinedActivity = [
                ...(allDashboardAuditLogs || []).map(l => ({ ...l, type: 'audit', message: `${l.action} - ${l.module}` })),
                ...(recentNotifs || []).map(n => ({ ...n, type: 'notification' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

            renderTopMetrics(scholarships || [], applications);
            renderRecentActivity(combinedActivity);
            renderAuditTrail(allDashboardAuditLogs.slice(0, 10));
            renderApplicationOverview(applications);
            renderScholarshipOverview(scholarships || []);
            renderTopScholarships(scholarships || [], applications);
            renderScholarshipPerformance(scholarships || [], applications);

            // If any metric modal is open, refresh its data in real-time
            const isModalOpen = (id) => {
                const el = document.getElementById(id);
                return el && (el.classList.contains('show') || el.classList.contains('active') || el.style.display === 'flex');
            };
            if (isModalOpen('metric-modal-scholarships')) {
                updateTotalScholarshipsModalCounts();
                renderTotalScholarshipsModalTable();
            }
            if (isModalOpen('metric-modal-applications')) {
                updateTotalApplicationsModalCounts();
                renderTotalApplicationsModalTable();
            }
            if (isModalOpen('metric-modal-pending')) {
                updatePendingReviewModalCounts();
                renderPendingReviewModalTable();
            }
            if (isModalOpen('metric-modal-outcomes')) {
                updateProcessedOutcomesModalCounts();
                renderProcessedOutcomesModalTable();
            }

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Data Load Failed',
                text: error.message || 'Unable to refresh dashboard data.'
            });
        }
    };

    const normalizeApplicantStatus = (status) => {
        const val = (status || '').toString().trim().toLowerCase();
        if (val === 'grantee' || val === 'approved') return 'Approved';
        if (val === 'declined' || val === 'rejected') return 'Rejected';
        if (val === 'under review' || val === 'under_review' || val === 'evaluating') return 'Under Review';
        if (val === 'draft') return 'Draft';
        return 'Pending';
    };

    const calculateDynamicStatus = (sch) => {
        if (!sch) return 'Draft';
        if (sch.status === 'Draft') return 'Draft';
        if (!sch.start_date || !sch.end_date) return sch.status || 'Draft';

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const start = new Date(sch.start_date); start.setHours(0, 0, 0, 0);
        const end = new Date(sch.end_date); end.setHours(23, 59, 59, 999);

        if (today < start) return 'Upcoming';
        if (today >= start && today <= end) return 'Active';
        return 'Closed';
    };

    const formatApplicationPeriod = (sch) => {
        if (!sch) return 'Open / Ongoing';
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        if (sch.start_date && sch.end_date) {
            const sDate = new Date(sch.start_date).toLocaleDateString('en-US', options);
            const eDate = new Date(sch.end_date).toLocaleDateString('en-US', options);
            return `${sDate} - ${eDate}`;
        } else if (sch.end_date || sch.deadline) {
            const eDate = new Date(sch.end_date || sch.deadline).toLocaleDateString('en-US', options);
            return `Until ${eDate}`;
        } else if (sch.start_date) {
            const sDate = new Date(sch.start_date).toLocaleDateString('en-US', options);
            return `From ${sDate}`;
        }
        return 'Open / Ongoing';
    };

    const getEducationalAssistanceStatusBadge = (status) => {
        const s = (status || 'Draft').toLowerCase();
        if (s === 'active') {
            return `<span class="status-active-badge"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Active</span>`;
        }
        if (s === 'upcoming') {
            return `<span class="status-upcoming-badge"><i data-lucide="calendar-clock" style="width: 12px; height: 12px;"></i> Upcoming</span>`;
        }
        if (s === 'draft') {
            return `<span class="status-draft-badge"><i data-lucide="file-edit" style="width: 12px; height: 12px;"></i> Draft</span>`;
        }
        return `<span class="status-closed-badge"><i data-lucide="x-circle" style="width: 12px; height: 12px;"></i> Closed</span>`;
    };

    const renderTopMetrics = (scholarships, applications) => {
        const activeSchol = scholarships.filter(s => calculateDynamicStatus(s) === 'Active').length;
        const totalApps = applications.length;

        const pending = applications.filter(a => {
            const st = normalizeApplicantStatus(a.status);
            return st === 'Pending' || st === 'Under Review';
        });
        const approved = applications.filter(a => normalizeApplicantStatus(a.status) === 'Approved');
        const rejected = applications.filter(a => normalizeApplicantStatus(a.status) === 'Rejected');

        const updateEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        updateEl('metric-total-scholarships', scholarships.length);
        updateEl('metric-active-scholarships', activeSchol);
        updateEl('metric-total-applications', totalApps);
        updateEl('metric-pending-review', pending.length);
        updateEl('metric-approved', approved.length);
        updateEl('metric-rejected', rejected.length);

        // Remove loading skeletons from cards
        ['card-metric-scholarships', 'card-metric-applications', 'card-metric-pending', 'card-metric-outcomes'].forEach(id => {
            const card = document.getElementById(id);
            if (card) card.classList.remove('is-loading');
        });
    };

    const renderRecentActivity = (notifs) => {
        const container = document.getElementById('recent-activity-list');
        if (!container) return;
        container.innerHTML = '';

        if (notifs.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-sm" style="color: var(--text-muted);">No recent activity found in this period.</div>';
            return;
        }

        const grouped = {};
        notifs.forEach(notif => {
            const dateObj = new Date(notif.created_at);
            const today = new Date();
            const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

            let groupName = dateObj.toLocaleDateString();
            if (dateObj.toDateString() === today.toDateString()) groupName = 'Today';
            else if (dateObj.toDateString() === yesterday.toDateString()) groupName = 'Yesterday';

            if (!grouped[groupName]) grouped[groupName] = [];
            grouped[groupName].push(notif);
        });

        const timeAgo = (date) => {
            const seconds = Math.floor((new Date() - new Date(date)) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + " years ago";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + " months ago";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + " days ago";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + " hours ago";
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + " minutes ago";
            return Math.floor(seconds) + " seconds ago";
        };

        let html = '';
        Object.keys(grouped).forEach(dateGroup => {
            html += `<div class="activity-date-group mb-5">
                        <h4 class="text-xs font-bold uppercase tracking-wider mb-3" style="color: var(--text-muted);">${dateGroup}</h4>`;

            grouped[dateGroup].forEach((notif, index) => {
                let lucideIcon = 'bell';
                let borderColor = 'var(--text-muted)';
                let title = notif.message;
                let desc = 'System Update';
                let actionUser = '';

                if (notif.type === 'audit') {
                    if (notif.action.includes('Announcement')) { lucideIcon = 'megaphone'; borderColor = 'var(--moss-green)'; }
                    else if (notif.action.includes('Educational Assistance')) { lucideIcon = 'graduation-cap'; borderColor = 'var(--river-blue)'; }
                    else if (notif.action.includes('Beneficiary') || notif.action.includes('Applicant')) { lucideIcon = 'user-check'; borderColor = 'var(--moss-green)'; }
                    else { lucideIcon = 'settings'; borderColor = 'var(--text-muted)'; }

                    title = notif.action;
                    try {
                        const d = JSON.parse(notif.details);
                        desc = d.title || d.details || notif.module;
                    } catch (e) { desc = notif.details || notif.module; }

                    if (notif.profiles) {
                        actionUser = `<div class="flex items-center gap-1 mb-1 text-xs" style="color: var(--text-muted);"><i data-lucide="user" style="width: 12px; height: 12px;"></i> ${notif.profiles.first_name} ${notif.profiles.last_name}</div>`;
                    }
                } else {
                    if (notif.type === 'application') { lucideIcon = 'file-signature'; borderColor = 'var(--moss-green)'; }
                    else if (notif.type === 'document') { lucideIcon = 'file-up'; borderColor = 'var(--river-blue)'; }
                    else if (notif.type === 'alert') { lucideIcon = 'alert-triangle'; borderColor = 'var(--metric-rejected-color)'; }
                    else if (notif.type === 'comment') { lucideIcon = 'message-square'; borderColor = 'var(--sand-beige)'; }
                    else if (notif.type === 'status') { lucideIcon = 'check-circle'; borderColor = 'var(--moss-green)'; }

                    if (notif.message.includes(' - ')) {
                        const parts = notif.message.split(' - ');
                        title = parts[0];
                        desc = parts.slice(1).join(' - ');
                    }
                }

                html += `
                <div class="activity-item pl-3 mb-4 cursor-pointer p-2 rounded-r transition-colors" style="border-left: 2px solid ${borderColor};" onclick="if('${notif.action_link}' && '${notif.action_link}' !== '#' && '${notif.action_link}' !== 'undefined') window.location.href='${notif.action_link}'">
                    ${actionUser}
                    <div class="flex items-center gap-2 mb-1">
                        <i data-lucide="${lucideIcon}" style="width: 16px; height: 16px;"></i>
                        <span class="font-bold text-sm" style="color: var(--text-heading);">${title}</span>
                    </div>
                    <p class="text-sm mb-1" style="color: var(--text-muted);">${desc}</p>
                    <span class="text-xs" style="color: var(--text-light);">${timeAgo(notif.created_at)}</span>
                </div>`;

                if (index < grouped[dateGroup].length - 1) {
                    html += `<hr class="my-4" style="border-color: var(--border-color);">`;
                }
            });
            html += `</div>`;
        });
        container.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    let cachedTargetUserProfiles = {};

    const formatLogDetails = (detailsRaw, targetProfiles = cachedTargetUserProfiles) => {
        if (!detailsRaw) return '-';
        try {
            if (typeof detailsRaw === 'string' && detailsRaw.startsWith('{')) {
                const parsed = JSON.parse(detailsRaw);
                let dText = parsed.details || '';

                if (!dText) {
                    const parts = [];
                    for (const [key, value] of Object.entries(parsed)) {
                        if (key !== 'targetUserId') {
                            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
                            parts.push(`${formattedKey}: ${value}`);
                        }
                    }
                    dText = parts.join(', ');
                }

                if (parsed.targetUserId) {
                    const targetName = targetProfiles[parsed.targetUserId] || 'Unknown User';
                    dText += dText ? ` (Target User: ${targetName})` : `Target User: ${targetName}`;
                }
                return dText || detailsRaw;
            }
        } catch (e) {}
        return detailsRaw;
    };

    const fetchTargetUserProfiles = async (logs) => {
        const missingIds = [];
        logs.forEach(log => {
            try {
                if (log.details && log.details.startsWith('{')) {
                    const parsed = JSON.parse(log.details);
                    if (parsed.targetUserId && !cachedTargetUserProfiles[parsed.targetUserId] && !missingIds.includes(parsed.targetUserId)) {
                        missingIds.push(parsed.targetUserId);
                    }
                }
            } catch (e) {}
        });

        if (missingIds.length > 0) {
            const { data: profiles } = await window.supabaseClient
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', missingIds);

            if (profiles) {
                profiles.forEach(p => {
                    cachedTargetUserProfiles[p.id] = `${p.first_name} ${p.last_name}`.trim();
                });
            }
        }
    };

    const renderAuditTrail = async (logs) => {
        const tbody = document.getElementById('audit-trail-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8" style="color: var(--text-muted); font-size: 13px;">No activity logs found for this period.</td></tr>';
            return;
        }

        await fetchTargetUserProfiles(logs);

        let html = '';
        logs.forEach(log => {
            const timeString = new Date(log.created_at).toLocaleString();
            const userName = log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'Unknown Admin';
            const detailsText = formatLogDetails(log.details);

            html += `
                <tr>
                    <td style="color: var(--text-muted); font-size: 12px;">${timeString}</td>
                    <td>
                        <span class="flex items-center gap-1.5" style="font-weight: 500; color: var(--text-heading);">
                            <i data-lucide="user" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                            ${userName}
                        </span>
                    </td>
                    <td style="font-weight: 600; color: var(--text-heading);">${log.action || '-'}</td>
                    <td><span class="audit-module-badge">${log.module || 'System'}</span></td>
                    <td style="color: var(--text-muted); font-size: 12.5px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtmlAttr(detailsText)}">${detailsText}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    const renderApplicationOverview = (apps) => {
        const total = apps.length;
        if (document.getElementById('app-overview-total')) document.getElementById('app-overview-total').innerText = total;

        const pending = apps.filter(a => normalizeApplicantStatus(a.status) === 'Pending').length;
        const evalCount = apps.filter(a => normalizeApplicantStatus(a.status) === 'Under Review').length;
        const approved = apps.filter(a => normalizeApplicantStatus(a.status) === 'Approved').length;
        const rejected = apps.filter(a => normalizeApplicantStatus(a.status) === 'Rejected').length;

        const pPct = total === 0 ? 0 : ((pending / total) * 100);
        const ePct = total === 0 ? 0 : ((evalCount / total) * 100);
        const aPct = total === 0 ? 0 : ((approved / total) * 100);
        const rPct = total === 0 ? 0 : ((rejected / total) * 100);

        if (document.getElementById('app-legend-pending')) document.getElementById('app-legend-pending').innerText = `${pending} (${pPct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-eval')) document.getElementById('app-legend-eval').innerText = `${evalCount} (${ePct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-approved')) document.getElementById('app-legend-approved').innerText = `${approved} (${aPct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-rejected')) document.getElementById('app-legend-rejected').innerText = `${rejected} (${rPct.toFixed(1)}%)`;

        if (total === 0) {
            if (document.getElementById('app-overview-chart')) {
                document.getElementById('app-overview-chart').style.background = `conic-gradient(var(--border-color) 0% 100%)`;
            }
            return;
        }

        const pStop = pPct;
        const eStop = pStop + ePct;
        const aStop = eStop + aPct;

        const gradient = `conic-gradient(
            #DCC8A3 0% ${pStop}%, 
            #4C6A73 ${pStop}% ${eStop}%, 
            #6B7F4E ${eStop}% ${aStop}%, 
            #5A4A3A ${aStop}% 100%
        )`;
        if (document.getElementById('app-overview-chart')) document.getElementById('app-overview-chart').style.background = gradient;
    };

    const renderScholarshipOverview = (scholarships) => {
        const total = scholarships.length;
        if (document.getElementById('schol-overview-total')) document.getElementById('schol-overview-total').innerText = total;

        const container = document.getElementById('schol-legend-container');
        if (!container) return;

        if (total === 0) {
            container.innerHTML = '<div class="text-center py-4 text-sm" style="color: var(--text-muted);">No active programs found</div>';
            if (document.getElementById('schol-overview-chart')) {
                document.getElementById('schol-overview-chart').style.background = `conic-gradient(var(--border-color) 0% 100%)`;
            }
            return;
        }

        const categories = {};
        scholarships.forEach(s => {
            const cat = s.category || 'Uncategorized';
            categories[cat] = (categories[cat] || 0) + 1;
        });

        // Exact palette tokens from the image
        const colors = ['#1F3D2E', '#6B7F4E', '#A2B5A0', '#DCC8A3', '#4C6A73', '#5A4A3A'];
        let gradientStops = [];
        let currentPct = 0;
        let legendHTML = '';

        Object.keys(categories).forEach((cat, index) => {
            const count = categories[cat];
            const pct = (count / total) * 100;
            const nextPct = currentPct + pct;
            const color = colors[index % colors.length];

            gradientStops.push(`${color} ${currentPct}% ${nextPct}%`);

            legendHTML += `
                <div class="legend-row">
                    <span class="legend-label">
                        <span class="legend-dot" style="background-color:${color};"></span>
                        <span>${cat}</span>
                    </span> 
                    <span class="legend-value">${count} (${pct.toFixed(1)}%)</span>
                </div>`;

            currentPct = nextPct;
        });

        if (document.getElementById('schol-overview-chart')) {
            document.getElementById('schol-overview-chart').style.background = `conic-gradient(${gradientStops.join(', ')})`;
        }
        container.innerHTML = legendHTML;
    };

    const escapeHtmlAttr = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const renderTopScholarships = (scholarships, applications) => {
        const tbody = document.getElementById('top-scholarships-tbody');
        if (!tbody) return;

        const counts = scholarships.map(schol => {
            return {
                id: schol.id,
                title: schol.title,
                count: applications.filter(a => a.scholarship_id === schol.id).length
            };
        });

        counts.sort((a, b) => b.count - a.count);
        const top5 = counts.slice(0, 5);

        if (top5.length === 0 || top5[0].count === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center py-6" style="color: var(--text-muted); font-size: 13px;">No educational assistance application data yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        top5.forEach((item, index) => {
            if (item.count > 0) {
                const safeTitle = escapeHtmlAttr(item.title);
                tbody.innerHTML += `
                    <tr class="clickable-row group" onclick="openScholarshipApplicantsModal('${item.id}')" title="Click to view applicants list for ${safeTitle}">
                        <td>
                            <div class="flex items-center gap-2">
                                <span class="rank-badge">${index + 1}</span>
                                <span class="top-schol-name">${safeTitle}</span>
                            </div>
                        </td>
                        <td class="count-badge">
                            <div class="flex items-center justify-end gap-2">
                                <span class="count-number">${item.count}</span>
                                <i data-lucide="chevron-right" class="top-schol-arrow" style="width: 15px; height: 15px; color: var(--text-light); transition: all 0.2s ease;"></i>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    const renderScholarshipPerformance = (scholarships, applications) => {
        const container = document.getElementById('performance-bars-container');
        if (!container) return;

        const stats = scholarships.map(schol => {
            const appsForSchol = applications.filter(a => a.scholarship_id === schol.id);
            const total = appsForSchol.length;
            const approved = appsForSchol.filter(a => normalizeApplicantStatus(a.status) === 'Approved').length;
            const approvalRate = total === 0 ? 0 : (approved / total) * 100;

            return {
                id: schol.id,
                title: schol.title,
                fullTitle: schol.title,
                rate: approvalRate,
                totalApps: total,
                approvedApps: approved
            };
        });

        stats.sort((a, b) => b.totalApps - a.totalApps);
        const top5Stats = stats.slice(0, 5);

        if (top5Stats.length === 0 || top5Stats[0].totalApps === 0) {
            container.innerHTML = '<div class="w-full text-center py-8" style="color: var(--text-muted); font-size: 13px;">No performance data available for this filter period.</div>';
            return;
        }

        container.innerHTML = '';
        top5Stats.forEach(stat => {
            const barHeight = Math.max(stat.rate, 4);
            const safeFullTitle = escapeHtmlAttr(stat.fullTitle);
            const safeTitle = escapeHtmlAttr(stat.title);
            container.innerHTML += `
                <div class="bar-col group" onclick="openScholarshipApplicantsModal('${stat.id}', 'Approved')" title="${safeFullTitle} • ${stat.approvedApps}/${stat.totalApps} Approved (${stat.rate.toFixed(1)}%)">
                    <div class="bar-top-stats">
                        <span class="bar-rate-label">${stat.rate.toFixed(1)}%</span>
                        <span class="bar-sub-ratio">${stat.approvedApps}/${stat.totalApps} app${stat.totalApps === 1 ? '' : 's'}</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar" style="height: ${barHeight}%;"></div>
                    </div>
                    <div class="bar-col-name-wrapper">
                        <span class="bar-col-name" title="${safeFullTitle}">${safeTitle}</span>
                    </div>
                </div>
            `;
        });
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    // ==========================================================================
    // --- 7.1 METRIC MODAL: TOTAL EDUCATIONAL ASSISTANCE DIRECTORY & BREAKDOWN ---
    // ==========================================================================
    let modalMscholActiveFilter = 'All';
    let modalMscholSearchQuery = '';

    window.openTotalScholarshipsModal = (initialStatus = 'All') => {
        const modal = document.getElementById('metric-modal-scholarships');
        if (!modal) return;

        const searchInput = document.getElementById('modal-mschol-search');
        if (searchInput) searchInput.value = '';
        modalMscholSearchQuery = '';
        modalMscholActiveFilter = initialStatus || 'All';

        // Reset tab buttons
        document.querySelectorAll('#modal-mschol-tabs .modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-status') === modalMscholActiveFilter);
        });

        // Show modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show', 'active'), 10);
        document.body.style.overflow = 'hidden';

        updateTotalScholarshipsModalCounts();
        renderTotalScholarshipsModalTable();
    };

    window.closeTotalScholarshipsModal = () => {
        const modal = document.getElementById('metric-modal-scholarships');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    };

    function updateTotalScholarshipsModalCounts() {
        const total = allDashboardScholarships.length;
        const active = allDashboardScholarships.filter(s => calculateDynamicStatus(s) === 'Active').length;
        const upcoming = allDashboardScholarships.filter(s => calculateDynamicStatus(s) === 'Upcoming').length;
        const closed = allDashboardScholarships.filter(s => {
            const st = calculateDynamicStatus(s);
            return st === 'Closed' || st === 'Draft';
        }).length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('modal-mschol-stat-total', total);
        setTxt('modal-mschol-stat-active', active);
        setTxt('modal-mschol-stat-closed', closed);

        setTxt('modal-mschol-tab-all', total);
        setTxt('modal-mschol-tab-active', active);
        setTxt('modal-mschol-tab-upcoming', upcoming);
        setTxt('modal-mschol-tab-closed', closed);
        setTxt('modal-mschol-total-count', total);
    }

    function renderTotalScholarshipsModalTable() {
        const tbody = document.getElementById('modal-mschol-tbody');
        if (!tbody) return;

        let filtered = allDashboardScholarships.filter(schol => {
            const dynamicSt = calculateDynamicStatus(schol);

            // Tab filter
            if (modalMscholActiveFilter === 'Active' && dynamicSt !== 'Active') return false;
            if (modalMscholActiveFilter === 'Upcoming' && dynamicSt !== 'Upcoming') return false;
            if (modalMscholActiveFilter === 'Closed' && dynamicSt !== 'Closed' && dynamicSt !== 'Draft') return false;

            // Search filter
            if (modalMscholSearchQuery) {
                const q = modalMscholSearchQuery.toLowerCase();
                const title = (schol.title || '').toLowerCase();
                const cat = (schol.category || '').toLowerCase();
                const batch = (schol.batch || '').toString().toLowerCase();
                const sem = (schol.semester || '').toLowerCase();
                const sy = (schol.school_year || '').toLowerCase();
                const desc = (schol.description || '').toLowerCase();

                const matches = title.includes(q) || cat.includes(q) || batch.includes(q) || sem.includes(q) || sy.includes(q) || desc.includes(q);
                if (!matches) return false;
            }

            return true;
        });

        const showingCountEl = document.getElementById('modal-mschol-showing-count');
        if (showingCountEl) showingCountEl.innerText = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-10 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="graduation-cap" style="width: 28px; height: 28px; color: var(--text-light);"></i>
                            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-heading);">No educational assistance programs found</span>
                            <span style="font-size: 12px; color: var(--text-muted);">No programs match your search query or filter.</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach((s, index) => {
            const title = s.title || 'Untitled Assistance Program';
            const safeTitle = escapeHtmlAttr(title);
            const category = s.category || 'General Assistance';
            const slots = s.slots ? `${s.slots} Slots` : 'Flexible';
            
            // Academic term info
            const termParts = [];
            if (s.batch) termParts.push(`Batch ${s.batch}`);
            if (s.semester) termParts.push(s.semester);
            if (s.school_year) termParts.push(`SY ${s.school_year}`);
            const termStr = termParts.join(' • ') || 'All Academic Terms';

            // Period info
            const periodStr = formatApplicationPeriod(s);

            // Dynamic Status badge
            const dynamicSt = calculateDynamicStatus(s);
            const statusBadge = getEducationalAssistanceStatusBadge(dynamicSt);

            html += `
                <tr>
                    <td style="color: var(--text-light); font-size: 12px; font-weight: 600;">${index + 1}</td>
                    <td>
                        <div>
                            <div class="schol-table-title" title="${safeTitle}">${safeTitle}</div>
                            <div class="schol-table-meta">${termStr}</div>
                        </div>
                    </td>
                    <td><span class="audit-module-badge">${escapeHtmlAttr(category)}</span></td>
                    <td><span class="applicant-id-pill">${slots}</span></td>
                    <td style="font-size: 12px; color: var(--text-muted);">
                        <div class="flex items-center gap-1.5">
                            <i data-lucide="calendar" style="width: 12px; height: 12px; color: var(--text-light);"></i>
                            <span>${escapeHtmlAttr(periodStr)}</span>
                        </div>
                    </td>
                    <td>${statusBadge}</td>
                    <td style="text-align: right;">
                        <button class="btn-review-applicant-mini" onclick="closeTotalScholarshipsModal(); openScholarshipApplicantsModal('${s.id}')" title="View applicant submissions for this program">
                            <i data-lucide="users" style="width: 12px; height: 12px;"></i> Applicants
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // ==========================================================================
    // --- 7.2 METRIC MODAL: TOTAL APPLICATIONS REGISTRY ---
    // ==========================================================================
    let modalMappsActiveFilter = 'All';
    let modalMappsSearchQuery = '';

    window.openTotalApplicationsModal = (initialStatus = 'All') => {
        const modal = document.getElementById('metric-modal-applications');
        if (!modal) return;

        const searchInput = document.getElementById('modal-mapps-search');
        if (searchInput) searchInput.value = '';
        modalMappsSearchQuery = '';
        modalMappsActiveFilter = initialStatus || 'All';

        const subtitleEl = document.getElementById('modal-mapps-subtitle');
        if (subtitleEl) {
            subtitleEl.innerText = `Comprehensive record of all applications for ${currentFilter} (${allDashboardApplications.length} records)`;
        }

        // Reset tab buttons
        document.querySelectorAll('#modal-mapps-tabs .modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-status') === modalMappsActiveFilter);
        });

        // Show modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show', 'active'), 10);
        document.body.style.overflow = 'hidden';

        updateTotalApplicationsModalCounts();
        renderTotalApplicationsModalTable();
    };

    window.closeTotalApplicationsModal = () => {
        const modal = document.getElementById('metric-modal-applications');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    };

    function updateTotalApplicationsModalCounts() {
        const total = allDashboardApplications.length;
        const pending = allDashboardApplications.filter(a => normalizeApplicantStatus(a.status) === 'Pending').length;
        const review = allDashboardApplications.filter(a => normalizeApplicantStatus(a.status) === 'Under Review').length;
        const approved = allDashboardApplications.filter(a => normalizeApplicantStatus(a.status) === 'Approved').length;
        const rejected = allDashboardApplications.filter(a => normalizeApplicantStatus(a.status) === 'Rejected').length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('modal-mapps-stat-total', total);
        setTxt('modal-mapps-stat-pending', pending);
        setTxt('modal-mapps-stat-review', review);
        setTxt('modal-mapps-stat-approved', approved);
        setTxt('modal-mapps-stat-rejected', rejected);

        setTxt('modal-mapps-tab-all', total);
        setTxt('modal-mapps-tab-pending', pending);
        setTxt('modal-mapps-tab-review', review);
        setTxt('modal-mapps-tab-approved', approved);
        setTxt('modal-mapps-tab-rejected', rejected);
        setTxt('modal-mapps-total-count', total);
    }

    function renderTotalApplicationsModalTable() {
        const tbody = document.getElementById('modal-mapps-tbody');
        if (!tbody) return;

        let filtered = allDashboardApplications.filter(app => {
            const st = normalizeApplicantStatus(app.status);

            // Tab Filter
            if (modalMappsActiveFilter !== 'All') {
                if (modalMappsActiveFilter === 'Pending' && st !== 'Pending') return false;
                if (modalMappsActiveFilter === 'Under Review' && st !== 'Under Review') return false;
                if (modalMappsActiveFilter === 'Approved' && st !== 'Approved') return false;
                if (modalMappsActiveFilter === 'Rejected' && st !== 'Rejected') return false;
            }

            // Search Query Filter
            if (modalMappsSearchQuery) {
                const q = modalMappsSearchQuery.toLowerCase();
                const p = app.profiles || {};
                const s = app.scholarships || {};
                const name = `${p.first_name || ''} ${p.middle_name || ''} ${p.last_name || ''}`.toLowerCase();
                const idNum = (p.id_number || '').toLowerCase();
                const email = (p.email || '').toLowerCase();
                const scholTitle = (s.title || '').toLowerCase();
                const scholCat = (s.category || '').toLowerCase();
                const prog = (p.program || '').toLowerCase();
                const year = (p.year_level || '').toLowerCase();

                const matches = name.includes(q) || idNum.includes(q) || email.includes(q) || scholTitle.includes(q) || scholCat.includes(q) || prog.includes(q) || year.includes(q);
                if (!matches) return false;
            }

            return true;
        });

        const showingCountEl = document.getElementById('modal-mapps-showing-count');
        if (showingCountEl) showingCountEl.innerText = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-10 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="file-text" style="width: 28px; height: 28px; color: var(--text-light);"></i>
                            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-heading);">No applications found</span>
                            <span style="font-size: 12px; color: var(--text-muted);">No student applications match your search query or status filter.</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach((app, index) => {
            const p = app.profiles || {};
            const s = app.scholarships || {};
            const firstName = p.first_name || '';
            const lastName = p.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim() || 'Applicant';
            const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'AP';
            const email = p.email || 'No email';
            const studentId = p.id_number || '-';
            const scholTitle = s.title || 'Educational Assistance Program';
            const scholCat = s.category || 'General';
            const course = p.program || '-';
            const year = p.year_level ? ` • ${p.year_level}` : '';
            const courseYear = course !== '-' ? `${course}${year}` : (year ? p.year_level : '-');
            const dateStr = app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

            const normStatus = normalizeApplicantStatus(app.status);
            let statusBadgeClass = 'status-pending';
            let statusIcon = 'clock';

            if (normStatus === 'Approved') {
                statusBadgeClass = 'status-approved';
                statusIcon = 'check-circle-2';
            } else if (normStatus === 'Under Review') {
                statusBadgeClass = 'status-review';
                statusIcon = 'file-search';
            } else if (normStatus === 'Rejected') {
                statusBadgeClass = 'status-rejected';
                statusIcon = 'x-circle';
            }

            const avatarHtml = p.avatar_url
                ? `<img src="${p.avatar_url}" alt="${escapeHtmlAttr(fullName)}" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : initials;

            html += `
                <tr>
                    <td style="color: var(--text-light); font-size: 12px; font-weight: 600;">${index + 1}</td>
                    <td>
                        <div class="applicant-profile-cell">
                            <div class="applicant-avatar-circle">${avatarHtml}</div>
                            <div>
                                <div class="applicant-name-text">${escapeHtmlAttr(fullName)}</div>
                                <div class="applicant-email-text">${escapeHtmlAttr(email)}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="applicant-id-pill">${escapeHtmlAttr(studentId)}</span></td>
                    <td>
                        <div>
                            <div style="font-weight: 600; color: var(--text-heading); font-size: 13px;">${escapeHtmlAttr(scholTitle)}</div>
                            <span class="audit-module-badge" style="font-size: 10.5px; padding: 1px 7px; margin-top: 2px;">${escapeHtmlAttr(scholCat)}</span>
                        </div>
                    </td>
                    <td style="font-size: 12.5px; color: var(--text-main); max-width: 170px;">${escapeHtmlAttr(courseYear)}</td>
                    <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
                    <td>
                        <span class="app-status-badge ${statusBadgeClass}">
                            <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i>
                            ${normStatus}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <a href="admin-applications.html?scholarship_id=${app.scholarship_id || ''}&status=${encodeURIComponent(normStatus === 'Under Review' ? 'Pending' : normStatus)}&applicant_id=${app.id}" class="btn-review-applicant-mini" title="Open and evaluate application">
                            <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> Review
                        </a>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // ==========================================================================
    // --- 7.3 METRIC MODAL: PENDING REVIEW QUEUE ---
    // ==========================================================================
    let modalMpendingActiveFilter = 'All';
    let modalMpendingSearchQuery = '';

    window.openPendingReviewModal = (initialStatus = 'All') => {
        const modal = document.getElementById('metric-modal-pending');
        if (!modal) return;

        const searchInput = document.getElementById('modal-mpending-search');
        if (searchInput) searchInput.value = '';
        modalMpendingSearchQuery = '';
        modalMpendingActiveFilter = initialStatus || 'All';

        const pendingList = allDashboardApplications.filter(a => ['Pending', 'Under Review'].includes(normalizeApplicantStatus(a.status)));
        const subtitleEl = document.getElementById('modal-mpending-subtitle');
        if (subtitleEl) {
            subtitleEl.innerText = `Applications awaiting coordinator screening or committee evaluation for ${currentFilter} (${pendingList.length} awaiting)`;
        }

        // Reset tab buttons
        document.querySelectorAll('#modal-mpending-tabs .modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-status') === modalMpendingActiveFilter);
        });

        // Show modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show', 'active'), 10);
        document.body.style.overflow = 'hidden';

        updatePendingReviewModalCounts();
        renderPendingReviewModalTable();
    };

    window.closePendingReviewModal = () => {
        const modal = document.getElementById('metric-modal-pending');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    };

    function updatePendingReviewModalCounts() {
        const pendingList = allDashboardApplications.filter(a => ['Pending', 'Under Review'].includes(normalizeApplicantStatus(a.status)));
        const totalPending = pendingList.length;
        const initialPending = pendingList.filter(a => normalizeApplicantStatus(a.status) === 'Pending').length;
        const underReview = pendingList.filter(a => normalizeApplicantStatus(a.status) === 'Under Review').length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('modal-mpending-stat-total', totalPending);
        setTxt('modal-mpending-stat-pending', initialPending);
        setTxt('modal-mpending-stat-review', underReview);

        setTxt('modal-mpending-tab-all', totalPending);
        setTxt('modal-mpending-tab-pending', initialPending);
        setTxt('modal-mpending-tab-review', underReview);
        setTxt('modal-mpending-total-count', totalPending);
    }

    function renderPendingReviewModalTable() {
        const tbody = document.getElementById('modal-mpending-tbody');
        if (!tbody) return;

        const pendingList = allDashboardApplications.filter(a => ['Pending', 'Under Review'].includes(normalizeApplicantStatus(a.status)));

        let filtered = pendingList.filter(app => {
            const st = normalizeApplicantStatus(app.status);

            // Tab Filter
            if (modalMpendingActiveFilter !== 'All') {
                if (modalMpendingActiveFilter === 'Pending' && st !== 'Pending') return false;
                if (modalMpendingActiveFilter === 'Under Review' && st !== 'Under Review') return false;
            }

            // Search Query Filter
            if (modalMpendingSearchQuery) {
                const q = modalMpendingSearchQuery.toLowerCase();
                const p = app.profiles || {};
                const s = app.scholarships || {};
                const name = `${p.first_name || ''} ${p.middle_name || ''} ${p.last_name || ''}`.toLowerCase();
                const idNum = (p.id_number || '').toLowerCase();
                const email = (p.email || '').toLowerCase();
                const scholTitle = (s.title || '').toLowerCase();
                const prog = (p.program || '').toLowerCase();
                const year = (p.year_level || '').toLowerCase();

                const matches = name.includes(q) || idNum.includes(q) || email.includes(q) || scholTitle.includes(q) || prog.includes(q) || year.includes(q);
                if (!matches) return false;
            }

            return true;
        });

        const showingCountEl = document.getElementById('modal-mpending-showing-count');
        if (showingCountEl) showingCountEl.innerText = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-10 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="check-circle" style="width: 28px; height: 28px; color: var(--success-green);"></i>
                            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-heading);">All caught up!</span>
                            <span style="font-size: 12px; color: var(--text-muted);">No pending applications currently require evaluation.</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach((app, index) => {
            const p = app.profiles || {};
            const s = app.scholarships || {};
            const firstName = p.first_name || '';
            const lastName = p.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim() || 'Applicant';
            const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'AP';
            const email = p.email || 'No email';
            const studentId = p.id_number || '-';
            const scholTitle = s.title || 'Educational Assistance Program';
            const scholCat = s.category || 'General';
            const course = p.program || '-';
            const year = p.year_level ? ` • ${p.year_level}` : '';
            const courseYear = course !== '-' ? `${course}${year}` : (year ? p.year_level : '-');
            
            const dateObj = app.created_at ? new Date(app.created_at) : null;
            const dateStr = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

            const normStatus = normalizeApplicantStatus(app.status);
            const statusBadgeClass = normStatus === 'Under Review' ? 'status-review' : 'status-pending';
            const statusIcon = normStatus === 'Under Review' ? 'file-search' : 'clock';

            const avatarHtml = p.avatar_url
                ? `<img src="${p.avatar_url}" alt="${escapeHtmlAttr(fullName)}" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : initials;

            html += `
                <tr>
                    <td style="color: var(--text-light); font-size: 12px; font-weight: 600;">${index + 1}</td>
                    <td>
                        <div class="applicant-profile-cell">
                            <div class="applicant-avatar-circle">${avatarHtml}</div>
                            <div>
                                <div class="applicant-name-text">${escapeHtmlAttr(fullName)}</div>
                                <div class="applicant-email-text">${escapeHtmlAttr(email)}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="applicant-id-pill">${escapeHtmlAttr(studentId)}</span></td>
                    <td>
                        <div>
                            <div style="font-weight: 600; color: var(--text-heading); font-size: 13px;">${escapeHtmlAttr(scholTitle)}</div>
                            <span class="audit-module-badge" style="font-size: 10.5px; padding: 1px 7px; margin-top: 2px;">${escapeHtmlAttr(scholCat)}</span>
                        </div>
                    </td>
                    <td style="font-size: 12.5px; color: var(--text-main); max-width: 170px;">${escapeHtmlAttr(courseYear)}</td>
                    <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
                    <td>
                        <span class="app-status-badge ${statusBadgeClass}">
                            <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i>
                            ${normStatus}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <a href="admin-applications.html?scholarship_id=${app.scholarship_id || ''}&status=Pending&applicant_id=${app.id}" class="btn-review-applicant-mini" style="background-color: var(--primary-color); color: #fff; border-color: var(--primary-color);" title="Evaluate application immediately">
                            <i data-lucide="clipboard-check" style="width: 12px; height: 12px;"></i> Evaluate
                        </a>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // ==========================================================================
    // --- 7.4 METRIC MODAL: PROCESSED DECISIONS (APPROVED & REJECTED) ---
    // ==========================================================================
    let modalMoutcomesActiveFilter = 'All';
    let modalMoutcomesSearchQuery = '';

    window.openProcessedOutcomesModal = (initialStatus = 'All') => {
        const modal = document.getElementById('metric-modal-outcomes');
        if (!modal) return;

        const searchInput = document.getElementById('modal-moutcomes-search');
        if (searchInput) searchInput.value = '';
        modalMoutcomesSearchQuery = '';
        modalMoutcomesActiveFilter = initialStatus || 'All';

        const decidedList = allDashboardApplications.filter(a => ['Approved', 'Rejected'].includes(normalizeApplicantStatus(a.status)));
        const subtitleEl = document.getElementById('modal-moutcomes-subtitle');
        if (subtitleEl) {
            subtitleEl.innerText = `Processed application outcomes for ${currentFilter} (${decidedList.length} total processed decisions)`;
        }

        // Reset tab buttons
        document.querySelectorAll('#modal-moutcomes-tabs .modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-status') === modalMoutcomesActiveFilter);
        });

        // Show modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show', 'active'), 10);
        document.body.style.overflow = 'hidden';

        updateProcessedOutcomesModalCounts();
        renderProcessedOutcomesModalTable();
    };

    window.closeProcessedOutcomesModal = () => {
        const modal = document.getElementById('metric-modal-outcomes');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    };

    function updateProcessedOutcomesModalCounts() {
        const decidedList = allDashboardApplications.filter(a => ['Approved', 'Rejected'].includes(normalizeApplicantStatus(a.status)));
        const total = decidedList.length;
        const approved = decidedList.filter(a => normalizeApplicantStatus(a.status) === 'Approved').length;
        const rejected = decidedList.filter(a => normalizeApplicantStatus(a.status) === 'Rejected').length;

        const approvedPct = total > 0 ? ((approved / total) * 100).toFixed(1) : '0';
        const rejectedPct = total > 0 ? ((rejected / total) * 100).toFixed(1) : '0';

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setTxt('modal-moutcomes-stat-total', total);
        setTxt('modal-moutcomes-stat-approved', approved);
        setTxt('modal-moutcomes-pct-approved', `${approvedPct}%`);
        setTxt('modal-moutcomes-stat-rejected', rejected);
        setTxt('modal-moutcomes-pct-rejected', `${rejectedPct}%`);

        setTxt('modal-moutcomes-tab-all', total);
        setTxt('modal-moutcomes-tab-approved', approved);
        setTxt('modal-moutcomes-tab-rejected', rejected);
        setTxt('modal-moutcomes-total-count', total);
    }

    function renderProcessedOutcomesModalTable() {
        const tbody = document.getElementById('modal-moutcomes-tbody');
        if (!tbody) return;

        const decidedList = allDashboardApplications.filter(a => ['Approved', 'Rejected'].includes(normalizeApplicantStatus(a.status)));

        let filtered = decidedList.filter(app => {
            const st = normalizeApplicantStatus(app.status);

            // Tab Filter
            if (modalMoutcomesActiveFilter !== 'All') {
                if (modalMoutcomesActiveFilter === 'Approved' && st !== 'Approved') return false;
                if (modalMoutcomesActiveFilter === 'Rejected' && st !== 'Rejected') return false;
            }

            // Search Query Filter
            if (modalMoutcomesSearchQuery) {
                const q = modalMoutcomesSearchQuery.toLowerCase();
                const p = app.profiles || {};
                const s = app.scholarships || {};
                const name = `${p.first_name || ''} ${p.middle_name || ''} ${p.last_name || ''}`.toLowerCase();
                const idNum = (p.id_number || '').toLowerCase();
                const email = (p.email || '').toLowerCase();
                const scholTitle = (s.title || '').toLowerCase();
                const prog = (p.program || '').toLowerCase();
                const year = (p.year_level || '').toLowerCase();

                const matches = name.includes(q) || idNum.includes(q) || email.includes(q) || scholTitle.includes(q) || prog.includes(q) || year.includes(q);
                if (!matches) return false;
            }

            return true;
        });

        const showingCountEl = document.getElementById('modal-moutcomes-showing-count');
        if (showingCountEl) showingCountEl.innerText = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-10 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="inbox" style="width: 28px; height: 28px; color: var(--text-light);"></i>
                            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-heading);">No processed decisions found</span>
                            <span style="font-size: 12px; color: var(--text-muted);">No approved or rejected records match your search filter.</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach((app, index) => {
            const p = app.profiles || {};
            const s = app.scholarships || {};
            const firstName = p.first_name || '';
            const lastName = p.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim() || 'Applicant';
            const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'AP';
            const email = p.email || 'No email';
            const studentId = p.id_number || '-';
            const scholTitle = s.title || 'Educational Assistance Program';
            const scholCat = s.category || 'General';
            const course = p.program || '-';
            const year = p.year_level ? ` • ${p.year_level}` : '';
            const courseYear = course !== '-' ? `${course}${year}` : (year ? p.year_level : '-');
            
            const dateObj = app.created_at ? new Date(app.created_at) : null;
            const dateStr = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

            const normStatus = normalizeApplicantStatus(app.status);
            const isApproved = normStatus === 'Approved';
            const statusBadgeClass = isApproved ? 'status-approved' : 'status-rejected';
            const statusIcon = isApproved ? 'check-circle-2' : 'x-circle';

            const avatarHtml = p.avatar_url
                ? `<img src="${p.avatar_url}" alt="${escapeHtmlAttr(fullName)}" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : initials;

            const actionBtn = isApproved
                ? `<a href="admin-applications.html?scholarship_id=${app.scholarship_id || ''}&status=Approved&applicant_id=${app.id}" class="btn-review-applicant-mini" style="background-color: rgba(46, 107, 69, 0.12); color: var(--success-green); border-color: rgba(46, 107, 69, 0.3);" title="View responses in applications">
                       <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> Details
                   </a>`
                : `<a href="admin-applications.html?scholarship_id=${app.scholarship_id || ''}&status=Rejected&applicant_id=${app.id}" class="btn-review-applicant-mini" title="View responses in applications">
                       <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> Details
                   </a>`;

            html += `
                <tr>
                    <td style="color: var(--text-light); font-size: 12px; font-weight: 600;">${index + 1}</td>
                    <td>
                        <div class="applicant-profile-cell">
                            <div class="applicant-avatar-circle">${avatarHtml}</div>
                            <div>
                                <div class="applicant-name-text">${escapeHtmlAttr(fullName)}</div>
                                <div class="applicant-email-text">${escapeHtmlAttr(email)}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="applicant-id-pill">${escapeHtmlAttr(studentId)}</span></td>
                    <td>
                        <div>
                            <div style="font-weight: 600; color: var(--text-heading); font-size: 13px;">${escapeHtmlAttr(scholTitle)}</div>
                            <span class="audit-module-badge" style="font-size: 10.5px; padding: 1px 7px; margin-top: 2px;">${escapeHtmlAttr(scholCat)}</span>
                        </div>
                    </td>
                    <td style="font-size: 12.5px; color: var(--text-main); max-width: 170px;">${escapeHtmlAttr(courseYear)}</td>
                    <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">${dateStr}</td>
                    <td>
                        <span class="app-status-badge ${statusBadgeClass}">
                            <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i>
                            ${normStatus}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        ${actionBtn}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // --- 8. SCHOLARSHIP APPLICANTS MODAL LOGIC ---
    let modalScholarshipData = null;
    let modalAllApplicants = [];
    let modalActiveFilter = 'All';
    let modalSearchQuery = '';

    const normalizeModalStatus = (status) => {
        const val = (status || '').toString().trim().toLowerCase();
        if (val === 'grantee' || val === 'approved') return 'Approved';
        if (val === 'declined' || val === 'rejected') return 'Rejected';
        if (val === 'under review' || val === 'under_review' || val === 'evaluating') return 'Under Review';
        if (val === 'draft') return 'Draft';
        return 'Pending';
    };

    window.openScholarshipApplicantsModal = async (scholarshipId, initialStatus = 'All') => {
        if (!scholarshipId) return;

        const modal = document.getElementById('scholarship-applicants-modal');
        if (!modal) return;

        const titleEl = document.getElementById('modal-schol-title');
        const categoryEl = document.getElementById('modal-schol-category');
        const subtitleEl = document.getElementById('modal-schol-subtitle');
        const tbody = document.getElementById('modal-applicants-tbody');
        const manageLink = document.getElementById('modal-btn-manage-all');
        const searchInput = document.getElementById('modal-applicant-search');

        if (manageLink) {
            manageLink.href = (initialStatus && initialStatus !== 'All')
                ? `admin-applications.html?scholarship_id=${scholarshipId}&status=${encodeURIComponent(initialStatus)}`
                : `admin-applications.html?scholarship_id=${scholarshipId}`;
        }
        if (searchInput) searchInput.value = '';

        modalSearchQuery = '';
        modalActiveFilter = initialStatus || 'All';

        // Check if scholarship info is in local dashboard memory
        const cachedSchol = allDashboardScholarships.find(s => s.id === scholarshipId);
        if (cachedSchol) {
            modalScholarshipData = cachedSchol;
            if (titleEl) titleEl.innerText = cachedSchol.title;
            if (categoryEl) categoryEl.innerText = cachedSchol.category || 'General';

            let subtitleParts = [];
            if (cachedSchol.batch) subtitleParts.push(`Batch: ${cachedSchol.batch}`);
            if (cachedSchol.semester) subtitleParts.push(`Semester: ${cachedSchol.semester}`);
            if (cachedSchol.school_year) subtitleParts.push(`SY: ${cachedSchol.school_year}`);
            if (cachedSchol.slots) subtitleParts.push(`Slots: ${cachedSchol.slots}`);
            if (subtitleEl) subtitleEl.innerText = subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'Educational Assistance Program';
        } else {
            if (titleEl) titleEl.innerText = 'Educational Assistance Program';
            if (categoryEl) categoryEl.innerText = 'Loading...';
            if (subtitleEl) subtitleEl.innerText = 'Fetching details...';
        }

        // Set Tab Buttons
        document.querySelectorAll('#modal-status-tabs .modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-status') === modalActiveFilter);
        });

        // Skeleton loading rows for modal table
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-8 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-3">
                            <i data-lucide="loader-2" class="animate-spin" style="width: 24px; height: 24px; color: var(--moss-green);"></i>
                            <span style="font-size: 13px; font-weight: 500;">Loading applicants data...</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }

        // Show Modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show', 'active'), 10);
        document.body.style.overflow = 'hidden';

        try {
            // Fetch Scholarship details if not cached
            if (!cachedSchol) {
                const { data: sch, error: schErr } = await window.supabaseClient
                    .from('scholarships')
                    .select('*')
                    .eq('id', scholarshipId)
                    .single();

                if (!schErr && sch) {
                    modalScholarshipData = sch;
                    if (titleEl) titleEl.innerText = sch.title;
                    if (categoryEl) categoryEl.innerText = sch.category || 'General';
                    
                    let subtitleParts = [];
                    if (sch.batch) subtitleParts.push(`Batch: ${sch.batch}`);
                    if (sch.semester) subtitleParts.push(`Semester: ${sch.semester}`);
                    if (sch.school_year) subtitleParts.push(`SY: ${sch.school_year}`);
                    if (sch.slots) subtitleParts.push(`Slots: ${sch.slots}`);
                    if (subtitleEl) subtitleEl.innerText = subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'Educational Assistance Program';
                }
            }

            // Fetch Applicants with Profiles for this scholarship (excluding unsubmitted drafts)
            const { data: apps, error: appErr } = await window.supabaseClient
                .from('applications')
                .select(`
                    id,
                    status,
                    created_at,
                    student_id,
                    scholarship_id,
                    profiles (
                        id,
                        first_name,
                        middle_name,
                        last_name,
                        id_number,
                        email,
                        contact_number,
                        program,
                        year_level,
                        avatar_url
                    )
                `)
                .eq('scholarship_id', scholarshipId)
                .neq('status', 'Draft')
                .order('created_at', { ascending: false });

            if (appErr) throw appErr;

            modalAllApplicants = apps || [];

            // Update Counts on Tab Badges & Table
            updateModalTabCounts();
            renderModalApplicantsTable();

        } catch (err) {
            console.error("Error loading scholarship applicants:", err);
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-8 text-center" style="color: var(--danger-red); font-size: 13px;">
                            <i data-lucide="alert-circle" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i>
                            Failed to load applicant records. Please try again.
                        </td>
                    </tr>
                `;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            }
        }
    };

    window.closeScholarshipApplicantsModal = () => {
        const modal = document.getElementById('scholarship-applicants-modal');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    };

    function updateModalTabCounts() {
        const allCount = modalAllApplicants.length;
        const pendingCount = modalAllApplicants.filter(a => normalizeModalStatus(a.status) === 'Pending').length;
        const reviewCount = modalAllApplicants.filter(a => normalizeModalStatus(a.status) === 'Under Review').length;
        const approvedCount = modalAllApplicants.filter(a => normalizeModalStatus(a.status) === 'Approved').length;
        const rejectedCount = modalAllApplicants.filter(a => normalizeModalStatus(a.status) === 'Rejected').length;

        if (document.getElementById('modal-tab-count-all')) document.getElementById('modal-tab-count-all').innerText = allCount;
        if (document.getElementById('modal-tab-count-pending')) document.getElementById('modal-tab-count-pending').innerText = pendingCount;
        if (document.getElementById('modal-tab-count-review')) document.getElementById('modal-tab-count-review').innerText = reviewCount;
        if (document.getElementById('modal-tab-count-approved')) document.getElementById('modal-tab-count-approved').innerText = approvedCount;
        if (document.getElementById('modal-tab-count-rejected')) document.getElementById('modal-tab-count-rejected').innerText = rejectedCount;
        if (document.getElementById('modal-total-count')) document.getElementById('modal-total-count').innerText = allCount;
    }

    function renderModalApplicantsTable() {
        const tbody = document.getElementById('modal-applicants-tbody');
        if (!tbody) return;

        let filtered = modalAllApplicants.filter(app => {
            const normStatus = normalizeModalStatus(app.status);
            
            // Status Tab Filter
            if (modalActiveFilter !== 'All') {
                if (modalActiveFilter === 'Pending' && normStatus !== 'Pending') return false;
                if (modalActiveFilter === 'Under Review' && normStatus !== 'Under Review') return false;
                if (modalActiveFilter === 'Approved' && normStatus !== 'Approved') return false;
                if (modalActiveFilter === 'Rejected' && normStatus !== 'Rejected') return false;
            }

            // Search Query Filter
            if (modalSearchQuery) {
                const q = modalSearchQuery.toLowerCase();
                const p = app.profiles || {};
                const name = `${p.first_name || ''} ${p.middle_name || ''} ${p.last_name || ''}`.toLowerCase();
                const idNum = (p.id_number || '').toLowerCase();
                const email = (p.email || '').toLowerCase();
                const prog = (p.program || '').toLowerCase();
                const year = (p.year_level || '').toLowerCase();

                const matches = name.includes(q) || idNum.includes(q) || email.includes(q) || prog.includes(q) || year.includes(q);
                if (!matches) return false;
            }

            return true;
        });

        if (document.getElementById('modal-showing-count')) {
            document.getElementById('modal-showing-count').innerText = filtered.length;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-10 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="inbox" style="width: 28px; height: 28px; color: var(--text-light);"></i>
                            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-heading);">No applicants found</span>
                            <span style="font-size: 12px; color: var(--text-muted);">No applicant records match your search or status filter.</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach((app, index) => {
            const p = app.profiles || {};
            const firstName = p.first_name || '';
            const lastName = p.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim() || 'Applicant';
            const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'A';
            const email = p.email || 'No email';
            const studentId = p.id_number || '-';
            const course = p.program || '-';
            const year = p.year_level ? ` • ${p.year_level}` : '';
            const courseYear = course !== '-' ? `${course}${year}` : (year ? p.year_level : '-');

            const dateStr = app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
            
            const normStatus = normalizeModalStatus(app.status);
            let statusBadgeClass = 'status-pending';
            let statusIcon = 'clock';

            if (normStatus === 'Approved') {
                statusBadgeClass = 'status-approved';
                statusIcon = 'check-circle-2';
            } else if (normStatus === 'Under Review') {
                statusBadgeClass = 'status-review';
                statusIcon = 'file-search';
            } else if (normStatus === 'Rejected') {
                statusBadgeClass = 'status-rejected';
                statusIcon = 'x-circle';
            }

            const avatarHtml = p.avatar_url
                ? `<img src="${p.avatar_url}" alt="${fullName}" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : initials;

            html += `
                <tr>
                    <td style="color: var(--text-light); font-size: 12px; font-weight: 600;">${index + 1}</td>
                    <td>
                        <div class="applicant-profile-cell">
                            <div class="applicant-avatar-circle">${avatarHtml}</div>
                            <div>
                                <div class="applicant-name-text">${fullName}</div>
                                <div class="applicant-email-text">${email}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="applicant-id-pill">${studentId}</span></td>
                    <td style="font-size: 12.5px; color: var(--text-main); max-width: 180px;">${courseYear}</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${dateStr}</td>
                    <td>
                        <span class="app-status-badge ${statusBadgeClass}">
                            <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i>
                            ${normStatus}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <a href="admin-applications.html?scholarship_id=${app.scholarship_id}&status=${encodeURIComponent(normStatus === 'Under Review' ? 'Pending' : normStatus)}&applicant_id=${app.id}" class="btn-review-applicant-mini" title="Open and evaluate application">
                            <i data-lucide="external-link" style="width: 13px; height: 13px;"></i> Review
                        </a>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // Modal Filter Events & Dismissal
    const modalSearchInput = document.getElementById('modal-applicant-search');
    if (modalSearchInput) {
        modalSearchInput.addEventListener('input', (e) => {
            modalSearchQuery = e.target.value.trim();
            renderModalApplicantsTable();
        });
    }

    const modalTabsContainer = document.getElementById('modal-status-tabs');
    if (modalTabsContainer) {
        modalTabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.modal-status-tab');
            if (!tabBtn) return;
            modalActiveFilter = tabBtn.getAttribute('data-status') || 'All';
            document.querySelectorAll('.modal-status-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderModalApplicantsTable();
        });
    }

    const modalCloseBtn = document.getElementById('modal-applicants-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeScholarshipApplicantsModal);

    const modalBtnClose = document.getElementById('modal-btn-close');
    if (modalBtnClose) modalBtnClose.addEventListener('click', closeScholarshipApplicantsModal);

    const applicantsModalEl = document.getElementById('scholarship-applicants-modal');
    if (applicantsModalEl) {
        applicantsModalEl.addEventListener('click', (e) => {
            if (e.target === applicantsModalEl) closeScholarshipApplicantsModal();
        });
    }

    // --- 9. ALL ACTIVITY LOGS MODAL LOGIC ---
    let modalActivitySearchQuery = '';
    let modalActivityActiveModule = 'All';

    const getModuleCategory = (log) => {
        const mod = (log.module || '').toLowerCase();
        const act = (log.action || '').toLowerCase();
        if (mod.includes('scholar') || act.includes('scholar') || mod.includes('grant') || act.includes('educational assistance')) return 'Scholarship';
        if (mod.includes('app') || act.includes('app') || mod.includes('beneficiar') || act.includes('applicant') || act.includes('grantee')) return 'Application';
        if (mod.includes('announc') || act.includes('announc') || mod.includes('news')) return 'Announcement';
        if (mod.includes('auth') || act.includes('auth') || mod.includes('login') || act.includes('login') || mod.includes('user') || mod.includes('system') || mod.includes('session') || mod.includes('security')) return 'Authentication';
        return 'Other';
    };

    window.openAllActivityModal = async () => {
        const modal = document.getElementById('all-activity-modal');
        if (!modal) return;

        const searchInput = document.getElementById('modal-activity-search');
        if (searchInput) searchInput.value = '';
        modalActivitySearchQuery = '';
        modalActivityActiveModule = 'All';

        // Reset Tab Buttons
        document.querySelectorAll('#modal-activity-module-tabs .modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-module') === 'All');
        });

        // Update Subtitle with current date filter and count info
        const subtitleEl = document.getElementById('modal-activity-subtitle');
        if (subtitleEl) {
            subtitleEl.innerText = `Chronological activity records for ${currentFilter} (${allDashboardAuditLogs.length} total entries)`;
        }

        // Show Modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show', 'active'), 10);
        document.body.style.overflow = 'hidden';

        // Ensure target user profiles are loaded
        await fetchTargetUserProfiles(allDashboardAuditLogs);

        // Update counts & render table
        updateActivityModalCounts();
        renderActivityModalTable();
    };

    window.closeAllActivityModal = () => {
        const modal = document.getElementById('all-activity-modal');
        if (!modal) return;
        modal.classList.remove('show', 'active');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 200);
    };

    function updateActivityModalCounts() {
        const allCount = allDashboardAuditLogs.length;
        const scholCount = allDashboardAuditLogs.filter(l => getModuleCategory(l) === 'Scholarship').length;
        const appCount = allDashboardAuditLogs.filter(l => getModuleCategory(l) === 'Application').length;
        const annCount = allDashboardAuditLogs.filter(l => getModuleCategory(l) === 'Announcement').length;
        const authCount = allDashboardAuditLogs.filter(l => getModuleCategory(l) === 'Authentication').length;
        const otherCount = allDashboardAuditLogs.filter(l => getModuleCategory(l) === 'Other').length;

        if (document.getElementById('modal-activity-count-all')) document.getElementById('modal-activity-count-all').innerText = allCount;
        if (document.getElementById('modal-activity-count-schol')) document.getElementById('modal-activity-count-schol').innerText = scholCount;
        if (document.getElementById('modal-activity-count-app')) document.getElementById('modal-activity-count-app').innerText = appCount;
        if (document.getElementById('modal-activity-count-ann')) document.getElementById('modal-activity-count-ann').innerText = annCount;
        if (document.getElementById('modal-activity-count-auth')) document.getElementById('modal-activity-count-auth').innerText = authCount;
        if (document.getElementById('modal-activity-count-other')) document.getElementById('modal-activity-count-other').innerText = otherCount;
        if (document.getElementById('modal-activity-total-count')) document.getElementById('modal-activity-total-count').innerText = allCount;
    }

    function renderActivityModalTable() {
        const tbody = document.getElementById('modal-activity-tbody');
        if (!tbody) return;

        let filtered = allDashboardAuditLogs.filter(log => {
            // Category Tab Filter
            if (modalActivityActiveModule !== 'All') {
                const cat = getModuleCategory(log);
                if (cat !== modalActivityActiveModule) return false;
            }

            // Search Filter
            if (modalActivitySearchQuery) {
                const q = modalActivitySearchQuery.toLowerCase();
                const userName = log.profiles ? `${log.profiles.first_name || ''} ${log.profiles.last_name || ''}`.toLowerCase() : 'unknown admin';
                const action = (log.action || '').toLowerCase();
                const module = (log.module || '').toLowerCase();
                const details = formatLogDetails(log.details).toLowerCase();
                const dateStr = new Date(log.created_at).toLocaleString().toLowerCase();

                const matches = userName.includes(q) || action.includes(q) || module.includes(q) || details.includes(q) || dateStr.includes(q);
                if (!matches) return false;
            }

            return true;
        });

        if (document.getElementById('modal-activity-showing-count')) {
            document.getElementById('modal-activity-showing-count').innerText = filtered.length;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-12 text-center" style="color: var(--text-muted);">
                        <div class="flex flex-col items-center justify-center gap-2">
                            <i data-lucide="history" style="width: 28px; height: 28px; color: var(--text-light);"></i>
                            <span style="font-size: 13.5px; font-weight: 600; color: var(--text-heading);">No activity logs found</span>
                            <span style="font-size: 12px; color: var(--text-muted);">No activity records match your search or module filter.</span>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach((log, index) => {
            const timeObj = new Date(log.created_at);
            const timeFormatted = timeObj.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            const p = log.profiles || {};
            const firstName = p.first_name || '';
            const lastName = p.last_name || '';
            const userName = `${firstName} ${lastName}`.trim() || 'Admin User';
            const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || 'AU';
            const avatarUrl = p.avatar_url;

            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${userName}" onerror="this.onerror=null; this.parentElement.innerHTML='${initials}'">`
                : initials;

            const detailsText = formatLogDetails(log.details);
            const safeDetails = escapeHtmlAttr(detailsText);

            html += `
                <tr>
                    <td style="color: var(--text-light); font-size: 12px; font-weight: 600;">${index + 1}</td>
                    <td style="color: var(--text-muted); font-size: 12px; white-space: nowrap;">
                        <span class="flex items-center gap-1.5">
                            <i data-lucide="clock" style="width: 12px; height: 12px; color: var(--text-light);"></i>
                            ${timeFormatted}
                        </span>
                    </td>
                    <td>
                        <div class="activity-user-badge">
                            <div class="activity-user-avatar">${avatarHtml}</div>
                            <span>${userName}</span>
                        </div>
                    </td>
                    <td><span class="activity-action-text">${log.action || '-'}</span></td>
                    <td><span class="audit-module-badge">${log.module || 'System'}</span></td>
                    <td><div class="activity-details-cell" title="${safeDetails}">${detailsText}</div></td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }

    // Activity Modal Filter Events & Dismissal
    const modalActivitySearchInput = document.getElementById('modal-activity-search');
    if (modalActivitySearchInput) {
        modalActivitySearchInput.addEventListener('input', (e) => {
            modalActivitySearchQuery = e.target.value.trim();
            renderActivityModalTable();
        });
    }

    const modalActivityTabsContainer = document.getElementById('modal-activity-module-tabs');
    if (modalActivityTabsContainer) {
        modalActivityTabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.modal-status-tab');
            if (!tabBtn) return;
            modalActivityActiveModule = tabBtn.getAttribute('data-module') || 'All';
            document.querySelectorAll('#modal-activity-module-tabs .modal-status-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderActivityModalTable();
        });
    }

    const modalActivityCloseBtn = document.getElementById('modal-activity-close-btn');
    if (modalActivityCloseBtn) modalActivityCloseBtn.addEventListener('click', closeAllActivityModal);

    const modalActivityBtnClose = document.getElementById('modal-activity-btn-close');
    if (modalActivityBtnClose) modalActivityBtnClose.addEventListener('click', closeAllActivityModal);

    const activityModalEl = document.getElementById('all-activity-modal');
    if (activityModalEl) {
        activityModalEl.addEventListener('click', (e) => {
            if (e.target === activityModalEl) closeAllActivityModal();
        });
    }

    // ==========================================================================
    // METRIC CARDS CLICK & KEYBOARD EVENT HANDLERS
    // ==========================================================================
    const cardSchol = document.getElementById('card-metric-scholarships');
    if (cardSchol) {
        cardSchol.addEventListener('click', (e) => {
            e.preventDefault();
            openTotalScholarshipsModal();
        });
        cardSchol.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openTotalScholarshipsModal();
            }
        });
    }

    const cardApps = document.getElementById('card-metric-applications');
    if (cardApps) {
        cardApps.addEventListener('click', (e) => {
            e.preventDefault();
            openTotalApplicationsModal();
        });
        cardApps.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openTotalApplicationsModal();
            }
        });
    }

    const cardPending = document.getElementById('card-metric-pending');
    if (cardPending) {
        cardPending.addEventListener('click', (e) => {
            e.preventDefault();
            openPendingReviewModal();
        });
        cardPending.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPendingReviewModal();
            }
        });
    }

    const cardOutcomes = document.getElementById('card-metric-outcomes');
    if (cardOutcomes) {
        cardOutcomes.addEventListener('click', (e) => {
            e.preventDefault();
            openProcessedOutcomesModal();
        });
        cardOutcomes.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProcessedOutcomesModal();
            }
        });
    }

    // ==========================================================================
    // METRIC MODALS EVENT LISTENERS (SEARCH & TABS)
    // ==========================================================================
    // 1. Total Scholarships Modal Listeners
    const modalMscholSearchInput = document.getElementById('modal-mschol-search');
    if (modalMscholSearchInput) {
        modalMscholSearchInput.addEventListener('input', (e) => {
            modalMscholSearchQuery = e.target.value.trim();
            renderTotalScholarshipsModalTable();
        });
    }

    const modalMscholTabsContainer = document.getElementById('modal-mschol-tabs');
    if (modalMscholTabsContainer) {
        modalMscholTabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.modal-status-tab');
            if (!tabBtn) return;
            modalMscholActiveFilter = tabBtn.getAttribute('data-status') || 'All';
            document.querySelectorAll('#modal-mschol-tabs .modal-status-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderTotalScholarshipsModalTable();
        });
    }

    // 2. Total Applications Modal Listeners
    const modalMappsSearchInput = document.getElementById('modal-mapps-search');
    if (modalMappsSearchInput) {
        modalMappsSearchInput.addEventListener('input', (e) => {
            modalMappsSearchQuery = e.target.value.trim();
            renderTotalApplicationsModalTable();
        });
    }

    const modalMappsTabsContainer = document.getElementById('modal-mapps-tabs');
    if (modalMappsTabsContainer) {
        modalMappsTabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.modal-status-tab');
            if (!tabBtn) return;
            modalMappsActiveFilter = tabBtn.getAttribute('data-status') || 'All';
            document.querySelectorAll('#modal-mapps-tabs .modal-status-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderTotalApplicationsModalTable();
        });
    }

    // 3. Pending Review Modal Listeners
    const modalMpendingSearchInput = document.getElementById('modal-mpending-search');
    if (modalMpendingSearchInput) {
        modalMpendingSearchInput.addEventListener('input', (e) => {
            modalMpendingSearchQuery = e.target.value.trim();
            renderPendingReviewModalTable();
        });
    }

    const modalMpendingTabsContainer = document.getElementById('modal-mpending-tabs');
    if (modalMpendingTabsContainer) {
        modalMpendingTabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.modal-status-tab');
            if (!tabBtn) return;
            modalMpendingActiveFilter = tabBtn.getAttribute('data-status') || 'All';
            document.querySelectorAll('#modal-mpending-tabs .modal-status-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderPendingReviewModalTable();
        });
    }

    // 4. Processed Outcomes Modal Listeners
    const modalMoutcomesSearchInput = document.getElementById('modal-moutcomes-search');
    if (modalMoutcomesSearchInput) {
        modalMoutcomesSearchInput.addEventListener('input', (e) => {
            modalMoutcomesSearchQuery = e.target.value.trim();
            renderProcessedOutcomesModalTable();
        });
    }

    const modalMoutcomesTabsContainer = document.getElementById('modal-moutcomes-tabs');
    if (modalMoutcomesTabsContainer) {
        modalMoutcomesTabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.modal-status-tab');
            if (!tabBtn) return;
            modalMoutcomesActiveFilter = tabBtn.getAttribute('data-status') || 'All';
            document.querySelectorAll('#modal-moutcomes-tabs .modal-status-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderProcessedOutcomesModalTable();
        });
    }

    // ==========================================================================
    // BACKDROP CLICK & GLOBAL ESCAPE DISMISSAL FOR ALL MODALS
    // ==========================================================================
    const modalBackdropList = [
        { id: 'metric-modal-scholarships', closeFn: closeTotalScholarshipsModal },
        { id: 'metric-modal-applications', closeFn: closeTotalApplicationsModal },
        { id: 'metric-modal-pending', closeFn: closePendingReviewModal },
        { id: 'metric-modal-outcomes', closeFn: closeProcessedOutcomesModal },
        { id: 'scholarship-applicants-modal', closeFn: closeScholarshipApplicantsModal },
        { id: 'all-activity-modal', closeFn: closeAllActivityModal }
    ];

    modalBackdropList.forEach(({ id, closeFn }) => {
        const modalEl = document.getElementById(id);
        if (modalEl) {
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) closeFn();
            });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modalBackdropList.forEach(({ id, closeFn }) => {
                const el = document.getElementById(id);
                if (el && (el.classList.contains('show') || el.classList.contains('active') || el.style.display === 'flex')) {
                    closeFn();
                }
            });
        }
    });

    // --- BOOT PROCESS ---
    showSkeletonStates();
    await loadProfile();
    await trackCoordinatorLogin();
    await loadDashboardData();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
})();
