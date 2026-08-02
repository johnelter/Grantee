document.addEventListener('DOMContentLoaded', async () => {

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    let adminSchoolId = null; 
    let currentFilter = localStorage.getItem('admin_dashboard_filter') || 'This Month';

    // --- 2. GLOBAL COMPONENTS & DROPDOWNS ---
    
    // Mobile Sidebar Logic (FIXED)
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebarContainer = document.getElementById('sidebar-container');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (mobileMenuToggle && sidebarContainer && sidebarOverlay) {
        // Toggle menu open/closed when clicking the hamburger button
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = sidebarContainer.classList.contains('active');
            
            if (isActive) {
                // Close it
                sidebarContainer.classList.remove('active');
                sidebarOverlay.classList.remove('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.remove('active');
            } else {
                // Open it
                sidebarContainer.classList.add('active');
                sidebarOverlay.classList.add('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.add('active');
            }
        });

        // Close menu by clicking the dark overlay
        sidebarOverlay.addEventListener('click', () => {
            sidebarContainer.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        });
    }

    // Dropdown Elements
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');
    const notifToggle = document.getElementById('notification-toggle');
    const notifMenu = document.getElementById('notification-menu');

    // Profile Dropdown Toggle
    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
            profileToggle.classList.toggle('active-state');
            
            // Close notif if open
            if (notifMenu) notifMenu.classList.add('hidden'); 
        });
    }

    // Global Click Listener to Close Dropdowns and Sidebar
    document.addEventListener('click', (e) => {
        // Close Profile Menu
        if (profileMenu && profileMenu.classList.contains('show') && !profileToggle.contains(e.target)) {
            profileMenu.classList.remove('show');
            profileToggle.classList.remove('active-state');
        }

        // Close Mobile Sidebar if clicking outside of it
        if (sidebarContainer && sidebarContainer.classList.contains('active') && !sidebarContainer.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
            sidebarContainer.classList.remove('active');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        }
    });

    // --- 3. LOAD PROFILE DATA INTO HEADER ---
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

                adminSchoolId = profile.school_id;
                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';

                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                }

                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                if (document.getElementById('admin-school-display')) {
                    const schoolName = profile.schools ? profile.schools.name : 'Unassigned School';
                    document.getElementById('admin-school-display').innerHTML = `<i class="fas fa-university"></i> Assigned to: <strong>${schoolName}</strong>`;
                }
            }
        } catch (error) {
            console.error("Error loading admin profile:", error);
        }
    }

    // --- 4. DATE FILTER LOGIC ---
    const getDateRange = (filter) => {
        const now = new Date();
        let startDate = new Date();
        let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Check for Custom Dates from localStorage
        const customKey = `admin_dates_${filter.replace(/\\s+/g, '_')}`;
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
            } catch(e) {}
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

    // Filter Dropdown and UI Logic
    const filterSelect = document.getElementById('dashboard-date-filter');
    const customWrapper = document.getElementById('custom-date-wrapper');
    const customStart = document.getElementById('custom-start-date');
    const customEnd = document.getElementById('custom-end-date');

    const updateCustomDateUI = () => {
        if (!customWrapper) return;
        const needsCustom = ['Current Semester', 'Current School Year', 'Custom Date Range'].includes(currentFilter);
        
        if (needsCustom) {
            customWrapper.classList.remove('hidden');
            customWrapper.classList.add('flex');
            
            const range = getDateRange(currentFilter);
            if(customStart && customEnd) {
                customStart.value = range.start.split('T')[0];
                customEnd.value = range.end.split('T')[0];
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
            loadDashboardData(); 
        });

        if (customStart && customEnd) {
            const handleCustomDateChange = () => {
                if (customStart.value && customEnd.value) {
                    const customKey = `admin_dates_${currentFilter.replace(/\\s+/g, '_')}`;
                    localStorage.setItem(customKey, JSON.stringify({
                        start: customStart.value,
                        end: customEnd.value
                    }));
                    loadDashboardData();
                }
            };
            customStart.addEventListener('change', handleCustomDateChange);
            customEnd.addEventListener('change', handleCustomDateChange);
        }

        updateCustomDateUI();
    }

    // --- 5. FETCH & RENDER DASHBOARD DATA ---
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

            // Fetch Applications
            let applications = [];
            if (scholarships && scholarships.length > 0) {
                const scholIds = scholarships.map(s => s.id);
                const { data: apps, error: appError } = await window.supabaseClient
                    .from('applications')
                    .select(`*, scholarships(title, category)`)
                    .in('scholarship_id', scholIds)
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

            renderTopMetrics(scholarships, applications);
            renderRecentActivity(combinedActivity);
            renderAuditTrail(auditLogs || []);
            renderApplicationOverview(applications);
            renderScholarshipOverview(scholarships);
            renderTopScholarships(scholarships, applications);
            renderScholarshipPerformance(scholarships, applications);

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Data Load Failed',
                text: error.message || 'Unable to refresh dashboard data.'
            });
        }
    };

    const renderTopMetrics = (scholarships, applications) => {
        const activeSchol = scholarships.filter(s => s.status === 'Active').length;
        const totalApps = applications.length;
        
        const pending = applications.filter(a => a.status === 'Pending' || a.status === 'Under Review');
        const approved = applications.filter(a => a.status === 'Approved');
        const rejected = applications.filter(a => a.status === 'Rejected');

        const updateEl = (id, val) => { if (document.getElementById(id)) document.getElementById(id).innerText = val; };

        updateEl('metric-total-scholarships', scholarships.length);
        updateEl('metric-active-scholarships', activeSchol);
        updateEl('metric-total-applications', totalApps);
        updateEl('metric-pending-review', pending.length);
        updateEl('metric-approved', approved.length);
        updateEl('metric-rejected', rejected.length);
    };

    const renderRecentActivity = (notifs) => {
        const container = document.getElementById('recent-activity-list');
        if (!container) return;
        container.innerHTML = '';

        if (notifs.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-gray-400 text-sm">No recent activity found in this period.</div>';
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
                        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">${dateGroup}</h4>`;
            
            grouped[dateGroup].forEach((notif, index) => {
                let iconClass = 'fa-bell text-gray-500';
                let borderColor = 'border-gray-500';
                let title = notif.message;
                let desc = 'System Update';
                let actionUser = '';

                if (notif.type === 'audit') {
                    if (notif.action.includes('Announcement')) { iconClass = 'fa-bullhorn text-blue-500'; borderColor = 'border-blue-500'; }
                    else if (notif.action.includes('Educational Assistance')) { iconClass = 'fa-graduation-cap text-indigo-500'; borderColor = 'border-indigo-500'; }
                    else if (notif.action.includes('Beneficiary') || notif.action.includes('Applicant')) { iconClass = 'fa-user-check text-green-500'; borderColor = 'border-green-500'; }
                    else { iconClass = 'fa-cog text-gray-500'; borderColor = 'border-gray-500'; }
                    
                    title = notif.action;
                    try {
                        const d = JSON.parse(notif.details);
                        desc = d.title || d.details || notif.module;
                    } catch(e) { desc = notif.details || notif.module; }

                    if (notif.profiles) {
                        actionUser = `<div class="flex items-center gap-1 mb-1 text-xs text-gray-500"><i class="fas fa-user-circle"></i> ${notif.profiles.first_name} ${notif.profiles.last_name}</div>`;
                    }
                } else {
                    if (notif.type === 'application') { iconClass = 'fa-file-signature text-blue-500'; borderColor = 'border-blue-500'; }
                    else if (notif.type === 'document') { iconClass = 'fa-file-upload text-indigo-500'; borderColor = 'border-indigo-500'; }
                    else if (notif.type === 'alert') { iconClass = 'fa-exclamation-triangle text-red-500'; borderColor = 'border-red-500'; }
                    else if (notif.type === 'comment') { iconClass = 'fa-comment-dots text-purple-500'; borderColor = 'border-purple-500'; }
                    else if (notif.type === 'status') { iconClass = 'fa-check-circle text-green-500'; borderColor = 'border-green-500'; }

                    if (notif.message.includes(' - ')) {
                        const parts = notif.message.split(' - ');
                        title = parts[0];
                        desc = parts.slice(1).join(' - ');
                    }
                }

                html += `
                <div class="activity-item border-l-2 ${borderColor} pl-3 mb-4 cursor-pointer hover:bg-gray-50 p-2 rounded-r transition-colors" onclick="if('${notif.action_link}' && '${notif.action_link}' !== '#' && '${notif.action_link}' !== 'undefined') window.location.href='${notif.action_link}'">
                    ${actionUser}
                    <div class="flex items-center gap-2 mb-1">
                        <i class="fas ${iconClass}"></i>
                        <span class="font-bold text-sm text-gray-800">${title}</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-1">${desc}</p>
                    <span class="text-xs text-gray-400">${timeAgo(notif.created_at)}</span>
                </div>`;
                
                if (index < grouped[dateGroup].length - 1) {
                    html += `<hr class="my-4 border-gray-100">`;
                }
            });
            html += `</div>`;
        });
        container.innerHTML = html;
    };

    const renderAuditTrail = async (logs) => {
        const tbody = document.getElementById('audit-trail-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-6">No audit logs found for this period.</td></tr>';
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
            } catch(e) {}
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
                                // Capitalize first letter of key for better readability
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
            } catch (e) {}

            html += `
                <tr class="border-b hover:bg-gray-50 transition-colors">
                    <td class="py-3 px-4 text-xs text-gray-500">${timeString}</td>
                    <td class="py-3 px-4 text-sm text-gray-800"><i class="fas fa-user-circle text-gray-400 mr-1"></i>${userName}</td>
                    <td class="py-3 px-4 text-sm font-medium text-gray-800">${log.action}</td>
                    <td class="py-3 px-4 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-full inline-block mt-2 px-2 py-1">${log.module}</td>
                    <td class="py-3 px-4 text-xs text-gray-500">${detailsText}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    };

    const renderApplicationOverview = (apps) => {
        const total = apps.length;
        if (document.getElementById('app-overview-total')) document.getElementById('app-overview-total').innerText = total;

        if (total === 0) return;

        const pending = apps.filter(a => a.status === 'Pending').length;
        const evalCount = apps.filter(a => a.status === 'Under Review').length;
        const approved = apps.filter(a => a.status === 'Approved').length;
        const rejected = apps.filter(a => a.status === 'Rejected').length;

        const pPct = ((pending / total) * 100);
        const ePct = ((evalCount / total) * 100);
        const aPct = ((approved / total) * 100);
        const rPct = ((rejected / total) * 100);

        if (document.getElementById('app-legend-pending')) document.getElementById('app-legend-pending').innerText = `${pending} (${pPct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-eval')) document.getElementById('app-legend-eval').innerText = `${evalCount} (${ePct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-approved')) document.getElementById('app-legend-approved').innerText = `${approved} (${aPct.toFixed(1)}%)`;
        if (document.getElementById('app-legend-rejected')) document.getElementById('app-legend-rejected').innerText = `${rejected} (${rPct.toFixed(1)}%)`;

        const pStop = pPct;
        const eStop = pStop + ePct;
        const aStop = eStop + aPct;

        const gradient = `conic-gradient(
            #facc15 0% ${pStop}%, 
            #3b82f6 ${pStop}% ${eStop}%, 
            #22c55e ${eStop}% ${aStop}%, 
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
            container.innerHTML = '<div class="text-center text-gray-400 text-sm">No active scholarships</div>';
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
                <div class="flex justify-between items-center text-sm">
                    <span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full" style="background-color:${color}"></span> ${cat}</span> 
                    <span class="font-medium">${count} (${pct.toFixed(1)}%)</span>
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
            tbody.innerHTML = '<tr><td colspan="2" class="text-center text-gray-400 py-4">Not enough data yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        top5.forEach((item, index) => {
            if (item.count > 0) {
                tbody.innerHTML += `
                    <tr class="border-b hover:bg-gray-50 transition-colors">
                        <td class="py-3 px-2 text-sm text-gray-800"><span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2 font-bold">${index + 1}</span> ${item.title}</td>
                        <td class="text-right py-3 px-2"><span class="font-bold text-gray-800">${item.count}</span></td>
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

            return { title: shortTitle, rate: approvalRate, totalApps: total, fullTitle: schol.title };
        });

        stats.sort((a, b) => b.totalApps - a.totalApps);
        const top5Stats = stats.slice(0, 5);

        if (top5Stats.length === 0 || top5Stats[0].totalApps === 0) {
            container.innerHTML = '<div class="w-full text-center text-gray-400 mt-10">No performance data available.</div>';
            return;
        }

        container.innerHTML = '';
        top5Stats.forEach(stat => {
            const barHeight = Math.max(stat.rate, 2);
            container.innerHTML += `
                <div class="bar-col group cursor-pointer" title="${stat.fullTitle} - ${stat.rate.toFixed(1)}% Approved">
                    <span class="text-xs mb-1 font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">${stat.rate.toFixed(1)}%</span>
                    <div class="bar bg-green-500 hover:bg-green-600 shadow-sm" style="height: ${barHeight}%;"></div>
                    <span class="absolute -bottom-8 text-[10px] text-gray-500 leading-tight w-16 text-center">${stat.title}</span>
                </div>
            `;
        });
    };

    // --- 6. LOGOUT MODAL LOGIC WITH SWEETALERT ---
    document.addEventListener('click', (e) => {
        if (e.target.closest('#sidebar-logout-btn') || e.target.closest('#dropdown-logout-btn')) {
            e.preventDefault();
            Swal.fire({
                title: 'Are you sure?',
                text: "You will be logged out of your session.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#ef4444',
                confirmButtonText: '<i class="fas fa-sign-out-alt"></i> Yes, logout'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        Swal.fire({
                            title: 'Logging out...',
                            allowOutsideClick: false,
                            didOpen: () => Swal.showLoading()
                        });
                        await window.supabaseClient.auth.signOut();
                        window.location.href = 'login.html';
                    } catch (error) {
                        console.error("Logout error:", error);
                        Swal.fire('Error!', 'Failed to logout. Please try again.', 'error');
                    }
                }
            });
        }
    });

    // --- BOOT PROCESS ---
    await loadProfile();
    await loadDashboardData();
});