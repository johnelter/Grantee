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
    let customDateRangePicker = null;

    if (customDateRangeInput && typeof flatpickr !== 'undefined') {
        customDateRangePicker = flatpickr(customDateRangeInput, {
            mode: "range",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "M j, Y",
            altInputClass: "flatpickr-custom-input",
            static: true,
            locale: {
                rangeSeparator: "  to  "
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
    }

    const updateCustomDateUI = () => {
        if (!customWrapper) return;
        const needsCustom = ['Current Semester', 'Current School Year', 'Custom Date Range'].includes(currentFilter);

        if (needsCustom) {
            customWrapper.classList.remove('hidden');
            customWrapper.classList.add('flex');

            const range = getDateRange(currentFilter);
            const startStr = range.start.split('T')[0];
            const endStr = range.end.split('T')[0];

            if (customStart) customStart.value = startStr;
            if (customEnd) customEnd.value = endStr;

            if (customDateRangePicker) {
                customDateRangePicker.setDate([startStr, endStr], false);
            }
        } else {
            customWrapper.classList.add('hidden');
            customWrapper.classList.remove('flex');
        }
    };

    if (filterSelect) {
        if ([...filterSelect.options].some(o => o.value === currentFilter)) {
            filterSelect.value = currentFilter;
        }

        filterSelect.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            localStorage.setItem('admin_dashboard_filter', currentFilter);
            updateCustomDateUI();
            showSkeletonStates();
            loadDashboardData();
        });

        updateCustomDateUI();
    }

    // --- 5. FETCH & RENDER DASHBOARD DATA ---
    let allDashboardScholarships = [];

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

            // Fetch Applications (excluding unsubmitted drafts)
            let applications = [];
            if (scholarships && scholarships.length > 0) {
                const scholIds = scholarships.map(s => s.id);
                const { data: apps, error: appError } = await window.supabaseClient
                    .from('applications')
                    .select(`*, scholarships(title, category)`)
                    .in('scholarship_id', scholIds)
                    .neq('status', 'Draft')
                    .gte('created_at', start)
                    .lte('created_at', end)
                    .order('created_at', { ascending: false });

                if (appError) throw appError;
                applications = apps || [];
            }

            // Fetch Audit Logs
            const { data: auditLogs, error: auditError } = await window.supabaseClient
                .from('audit_logs')
                .select('*, profiles(first_name, last_name)')
                .eq('school_id', adminSchoolId)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: false })
                .limit(20);

            if (auditError) console.warn("Audit logs error:", auditError);

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
                ...(auditLogs || []).map(l => ({ ...l, type: 'audit', message: `${l.action} - ${l.module}` })),
                ...(recentNotifs || []).map(n => ({ ...n, type: 'notification' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

            renderTopMetrics(scholarships || [], applications);
            renderRecentActivity(combinedActivity);
            renderAuditTrail(auditLogs || []);
            renderApplicationOverview(applications);
            renderScholarshipOverview(scholarships || []);
            renderTopScholarships(scholarships || [], applications);
            renderScholarshipPerformance(scholarships || [], applications);

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

    const renderTopMetrics = (scholarships, applications) => {
        const activeSchol = scholarships.filter(s => s.status === 'Active').length;
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

    const renderAuditTrail = async (logs) => {
        const tbody = document.getElementById('audit-trail-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8" style="color: var(--text-muted); font-size: 13px;">No activity logs found for this period.</td></tr>';
            return;
        }

        // Pre-fetch target users to avoid N+1 queries
        let targetUserIds = [];
        logs.forEach(log => {
            try {
                if (log.details && log.details.startsWith('{')) {
                    const parsed = JSON.parse(log.details);
                    if (parsed.targetUserId && !targetUserIds.includes(parsed.targetUserId)) {
                        targetUserIds.push(parsed.targetUserId);
                    }
                }
            } catch (e) { }
        });

        let targetUserProfiles = {};
        if (targetUserIds.length > 0) {
            const { data: profiles } = await window.supabaseClient
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', targetUserIds);

            if (profiles) {
                profiles.forEach(p => {
                    targetUserProfiles[p.id] = `${p.first_name} ${p.last_name}`;
                });
            }
        }

        let html = '';
        logs.forEach(log => {
            const timeString = new Date(log.created_at).toLocaleString();
            const userName = log.profiles ? `${log.profiles.first_name} ${log.profiles.last_name}` : 'Unknown Admin';

            let detailsText = log.details || '-';
            try {
                if (log.details && log.details.startsWith('{')) {
                    const parsed = JSON.parse(log.details);
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
                        const targetName = targetUserProfiles[parsed.targetUserId] || 'Unknown User';
                        dText += dText ? ` (Target User: ${targetName})` : `Target User: ${targetName}`;
                    }
                    detailsText = dText;
                }
            } catch (e) { }

            html += `
                <tr>
                    <td style="color: var(--text-muted); font-size: 12px;">${timeString}</td>
                    <td>
                        <span class="flex items-center gap-1.5" style="font-weight: 500; color: var(--text-heading);">
                            <i data-lucide="user" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
                            ${userName}
                        </span>
                    </td>
                    <td style="font-weight: 600; color: var(--text-heading);">${log.action}</td>
                    <td><span class="audit-module-badge">${log.module}</span></td>
                    <td style="color: var(--text-muted); font-size: 12.5px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${detailsText}">${detailsText}</td>
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
            tbody.innerHTML = '<tr><td colspan="2" class="text-center py-6" style="color: var(--text-muted); font-size: 13px;">No scholarship application data yet.</td></tr>';
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
                <div class="bar-col group" onclick="openScholarshipApplicantsModal('${stat.id}')" title="${safeFullTitle} • ${stat.approvedApps}/${stat.totalApps} Approved (${stat.rate.toFixed(1)}%)">
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

    window.openScholarshipApplicantsModal = async (scholarshipId) => {
        if (!scholarshipId) return;

        const modal = document.getElementById('scholarship-applicants-modal');
        if (!modal) return;

        const titleEl = document.getElementById('modal-schol-title');
        const categoryEl = document.getElementById('modal-schol-category');
        const subtitleEl = document.getElementById('modal-schol-subtitle');
        const tbody = document.getElementById('modal-applicants-tbody');
        const manageLink = document.getElementById('modal-btn-manage-all');
        const searchInput = document.getElementById('modal-applicant-search');

        if (manageLink) manageLink.href = `admin-applications.html?scholarship_id=${scholarshipId}`;
        if (searchInput) searchInput.value = '';

        modalSearchQuery = '';
        modalActiveFilter = 'All';

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
            if (titleEl) titleEl.innerText = 'Scholarship Program';
            if (categoryEl) categoryEl.innerText = 'Loading...';
            if (subtitleEl) subtitleEl.innerText = 'Fetching details...';
        }

        // Reset Tab Buttons
        document.querySelectorAll('.modal-status-tab').forEach(t => {
            t.classList.toggle('active', t.getAttribute('data-status') === 'All');
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
                        <a href="admin-applications.html?scholarship_id=${app.scholarship_id}" class="btn-review-applicant-mini" title="Open and evaluate application">
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

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('scholarship-applicants-modal');
            if (modal && (modal.classList.contains('show') || modal.classList.contains('active'))) {
                closeScholarshipApplicantsModal();
            }
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
