document.addEventListener('DOMContentLoaded', async () => {

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    let adminSchoolId = null; // Holds the school ID to filter the dashboard

    // --- 2. LOAD PROFILE DATA INTO HEADER ---
    async function loadProfile() {
        try {
            // Fetch profile AND the associated school name using a foreign key join
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*, schools(name)') 
                .eq('id', adminId)
                .single();

            if (profile) {
                // Ensure ONLY admins can access this page
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                // Lock the dashboard to this admin's school
                adminSchoolId = profile.school_id;

                // Update Header Name & Avatar
                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';

                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                }

                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                // Update School Display under the welcome message
                if (document.getElementById('admin-school-display')) {
                    const schoolName = profile.schools ? profile.schools.name : 'Unassigned School';
                    document.getElementById('admin-school-display').innerHTML = `<i class="fas fa-university"></i> Assigned to: <strong>${schoolName}</strong>`;
                }
            }
        } catch (error) {
            console.error("Error loading admin profile:", error);
        }
    }

    // --- 3. FETCH & RENDER DASHBOARD DATA ---
    const loadDashboardData = async () => {
        if (!adminSchoolId) return; // Safety check: stop if no school is assigned

        try {
            // 1. Fetch Scholarships EXPLICITLY for this admin's school
            const { data: scholarships, error: scholError } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('school_id', adminSchoolId); 
            
            if (scholError) throw scholError;

            // 2. Fetch Applications ONLY for the scholarships belonging to this school
            let applications = [];
            
            // Only fetch applications if the school actually has scholarships created
            if (scholarships.length > 0) {
                const scholIds = scholarships.map(s => s.id);
                
                const { data: apps, error: appError } = await window.supabaseClient
                    .from('applications')
                    .select(`*, scholarships(title)`)
                    .in('scholarship_id', scholIds) 
                    .order('created_at', { ascending: false });
                
                if (appError) throw appError;
                applications = apps;
            }

            // Execute rendering functions
            renderTopMetrics(scholarships, applications);
            renderNotifications(applications);
            renderRecentActivity(applications);
            renderApplicationOverview(applications);
            renderScholarshipOverview(scholarships);
            renderTopScholarships(scholarships, applications);
            renderScholarshipPerformance(scholarships, applications);

        } catch (error) {
            console.error("Dashboard Loading Error:", error.message);
        }
    };

    const renderTopMetrics = (scholarships, applications) => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const totalSchol = scholarships.length;
        const activeSchol = scholarships.filter(s => s.status === 'Active').length;

        const totalApps = applications.length;
        const appsThisMonth = applications.filter(a => new Date(a.created_at) >= startOfMonth).length;

        const pending = applications.filter(a => a.status === 'Pending' || a.status === 'Under Review');
        const approved = applications.filter(a => a.status === 'Approved');
        const rejected = applications.filter(a => a.status === 'Rejected');

        const approvedThisMonth = approved.filter(a => new Date(a.created_at) >= startOfMonth).length;
        const rejectedThisMonth = rejected.filter(a => new Date(a.created_at) >= startOfMonth).length;

        if (document.getElementById('metric-total-scholarships')) document.getElementById('metric-total-scholarships').innerText = totalSchol;
        if (document.getElementById('metric-active-scholarships')) document.getElementById('metric-active-scholarships').innerText = activeSchol;
        if (document.getElementById('metric-total-applications')) document.getElementById('metric-total-applications').innerText = totalApps;
        if (document.getElementById('metric-apps-this-month')) document.getElementById('metric-apps-this-month').innerText = `This Month: ${appsThisMonth}`;
        if (document.getElementById('metric-pending-review')) document.getElementById('metric-pending-review').innerText = pending.length;
        if (document.getElementById('metric-approved')) document.getElementById('metric-approved').innerText = approved.length;
        if (document.getElementById('metric-approved-this-month')) document.getElementById('metric-approved-this-month').innerText = `This Month: ${approvedThisMonth}`;
        if (document.getElementById('metric-rejected')) document.getElementById('metric-rejected').innerText = rejected.length;
        if (document.getElementById('metric-rejected-this-month')) document.getElementById('metric-rejected-this-month').innerText = `This Month: ${rejectedThisMonth}`;
    };

    const renderNotifications = (applications) => {
        const list = document.getElementById('notification-list');
        const badge = document.getElementById('nav-notification-badge');
        if (!list || !badge) return;

        // Filter for applications that require admin attention
        const pendingApps = applications.filter(a => a.status === 'Pending' || a.status === 'Under Review');

        // Update the red badge number
        if (pendingApps.length > 0) {
            badge.innerText = pendingApps.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }

        if (pendingApps.length === 0) {
            list.innerHTML = '<div style="padding: 30px 15px; text-align: center; color: #94a3b8; font-size: 13px;">You are all caught up!<br>No pending applications.</div>';
            return;
        }

        list.innerHTML = '';

        // Show only the 5 most recent pending applications in the dropdown
        pendingApps.slice(0, 5).forEach(app => {
            const dateObj = new Date(app.created_at);
            const timeString = dateObj.toLocaleDateString() === new Date().toLocaleDateString()
                ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : dateObj.toLocaleDateString();

            const scholTitle = app.scholarships ? app.scholarships.title : 'Scholarship Program';

            list.innerHTML += `
                <div class="notif-item" onclick="window.location.href='admin-applications.html'">
                    <div class="notif-icon">📄</div>
                    <div class="notif-content">
                        <p><strong>Action Required:</strong> A new application for <em>${scholTitle}</em> is waiting for your review.</p>
                        <span class="notif-time">${timeString}</span>
                    </div>
                </div>
            `;
        });
    };

    const renderRecentActivity = (applications) => {
        const container = document.getElementById('recent-activity-list');
        if (!container) return;
        container.innerHTML = '';

        const recentApps = applications.slice(0, 4);

        if (recentApps.length === 0) {
            container.innerHTML = '<div style="padding: 15px; text-align: center; color: #64748b;">No recent activity found.</div>';
            return;
        }

        recentApps.forEach(app => {
            const dateObj = new Date(app.created_at);
            const timeString = dateObj.toLocaleDateString() === new Date().toLocaleDateString()
                ? 'Today, ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : dateObj.toLocaleDateString();

            let icon = '📄';
            let iconClass = 'icon-blue';
            let actionText = 'New application submitted';

            if (app.status === 'Approved') { icon = '✅'; iconClass = 'icon-light-green'; actionText = 'Application was approved'; }
            if (app.status === 'Rejected') { icon = '❌'; iconClass = 'icon-red'; actionText = 'Application was rejected'; }

            const scholTitle = app.scholarships ? app.scholarships.title : 'Scholarship Program';

            container.innerHTML += `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">${icon}</div>
                    <div class="activity-details">
                        <p><strong>${actionText}</strong></p>
                        <span>${scholTitle}</span>
                    </div>
                    <div class="activity-time">${timeString}</div>
                </div>
            `;
        });
    };

    const renderApplicationOverview = (apps) => {
        const total = apps.length;
        if (document.getElementById('app-overview-total')) document.getElementById('app-overview-total').innerText = total;

        if (total === 0) return;

        const pending = apps.filter(a => a.status === 'Pending').length;
        const eval = apps.filter(a => a.status === 'Under Review').length;
        const approved = apps.filter(a => a.status === 'Approved').length;
        const rejected = apps.filter(a => a.status === 'Rejected').length;

        const pPct = ((pending / total) * 100);
        const ePct = ((eval / total) * 100);
        const aPct = ((approved / total) * 100);
        const rPct = ((rejected / total) * 100);

        if (document.getElementById('app-legend-pending')) document.getElementById('app-legend-pending').innerText = `${pending} (${pPct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-eval')) document.getElementById('app-legend-eval').innerText = `${eval} (${ePct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-approved')) document.getElementById('app-legend-approved').innerText = `${approved} (${aPct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-rejected')) document.getElementById('app-legend-rejected').innerText = `${rejected} (${rPct.toFixed(1)}%)`;

        const pStop = pPct;
        const eStop = pStop + ePct;
        const aStop = eStop + aPct;

        const gradient = `conic-gradient(
            #eab308 0% ${pStop}%, 
            #3b82f6 ${pStop}% ${eStop}%, 
            #10b981 ${eStop}% ${aStop}%, 
            #ef4444 ${aStop}% 100%
        )`;
        if (document.getElementById('app-overview-chart')) document.getElementById('app-overview-chart').style.background = gradient;
    };

    const renderScholarshipOverview = (scholarships) => {
        const total = scholarships.length;
        if (document.getElementById('schol-overview-total')) document.getElementById('schol-overview-total').innerText = total;

        const container = document.getElementById('schol-legend-container');
        if (!container) return;

        if (total === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted);">No active scholarships</div>';
            return;
        }

        const categories = {};
        scholarships.forEach(s => {
            const cat = s.category || 'Uncategorized';
            categories[cat] = (categories[cat] || 0) + 1;
        });

        const colors = ['#10b981', '#3b82f6', '#eab308', '#8b5cf6', '#f97316', '#94a3b8'];
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
                <div class="legend-item">
                    <span class="dot" style="background:${color}"></span> ${cat} 
                    <span class="val">${count} (${pct.toFixed(1)}%)</span>
                </div>`;

            currentPct = nextPct;
        });

        if (document.getElementById('schol-overview-chart')) document.getElementById('schol-overview-chart').style.background = `conic-gradient(${gradientStops.join(', ')})`;
        container.innerHTML = legendHTML;
    };

    const renderTopScholarships = (scholarships, applications) => {
        const tbody = document.getElementById('top-scholarships-tbody');
        if (!tbody) return;

        const counts = scholarships.map(schol => {
            return {
                title: schol.title,
                count: applications.filter(a => a.scholarship_id === schol.id).length
            };
        });

        counts.sort((a, b) => b.count - a.count);
        const top5 = counts.slice(0, 5);

        if (top5.length === 0 || top5[0].count === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Not enough data yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        top5.forEach((item, index) => {
            if (item.count > 0) {
                tbody.innerHTML += `
                    <tr>
                        <td><span class="rank-badge">${index + 1}</span> ${item.title}</td>
                        <td class="text-right"><span class="count-badge">${item.count}</span></td>
                    </tr>
                `;
            }
        });
    };

    const renderScholarshipPerformance = (scholarships, applications) => {
        const container = document.getElementById('performance-bars-container');
        if (!container) return;

        const stats = scholarships.map(schol => {
            const appsForSchol = applications.filter(a => a.scholarship_id === schol.id);
            const total = appsForSchol.length;
            const approved = appsForSchol.filter(a => a.status === 'Approved').length;
            const approvalRate = total === 0 ? 0 : (approved / total) * 100;
            const shortTitle = schol.title.split(' ').slice(0, 2).join('<br>');

            return { title: shortTitle, rate: approvalRate, totalApps: total };
        });

        stats.sort((a, b) => b.totalApps - a.totalApps);
        const top5Stats = stats.slice(0, 5);

        if (top5Stats.length === 0 || top5Stats[0].totalApps === 0) {
            container.innerHTML = '<div style="width: 100%; text-align: center; color: var(--text-muted); align-self: center;">No performance data available.</div>';
            return;
        }

        container.innerHTML = '';
        top5Stats.forEach(stat => {
            const barHeight = Math.max(stat.rate, 2);
            container.innerHTML += `
                <div class="bar-col">
                    <span class="bar-val">${stat.rate.toFixed(1)}%</span>
                    <div class="bar bg-green" style="height: ${barHeight}%;"></div>
                    <span class="bar-label">${stat.title}</span>
                </div>
            `;
        });
    };

    // --- 4. INTERACTIVE DROPDOWN LOGIC ---
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');
    const notifToggle = document.getElementById('notification-toggle');
    const notifMenu = document.getElementById('notification-menu');

    // Toggle Profile
    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notifMenu) notifMenu.classList.remove('show'); // Close bell
            profileMenu.classList.toggle('show');
        });
    }

    // Toggle Notifications
    if (notifToggle && notifMenu) {
        notifToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (profileMenu) profileMenu.classList.remove('show'); // Close profile
            notifMenu.classList.toggle('show');
        });
    }

    // Click outside to close both
    document.addEventListener('click', (e) => {
        if (profileMenu && profileToggle && !profileToggle.contains(e.target)) {
            profileMenu.classList.remove('show');
        }
        if (notifMenu && notifToggle && !notifToggle.contains(e.target)) {
            notifMenu.classList.remove('show');
        }
    });

    // --- 5. LOGOUT MODAL LOGIC ---
    const logoutModal = document.getElementById('logout-modal');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');

    const logoutBtns = [
        document.getElementById('sidebar-logout-btn'),
        document.getElementById('dropdown-logout-btn')
    ];

    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                logoutModal.style.display = 'flex';
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
                modalConfirm.innerText = "Logging out...";
                modalConfirm.disabled = true;
                await window.supabaseClient.auth.signOut();
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Logout error:", error);
                alert("Failed to logout. Please try again.");
                modalConfirm.innerText = "Logout";
                modalConfirm.disabled = false;
            }
        });
    }

    // --- BOOT PROCESS ---
    await loadProfile();
    await loadDashboardData();
});