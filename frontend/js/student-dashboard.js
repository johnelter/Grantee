document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }
    const studentId = session.user.id;

    // --- MAIN APPLICATION LOGIC ---
    const loadMyApplications = async () => {
        try {
            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profileError || !profile) {
                window.location.href = 'login.html';
                return;
            }

            if (profile.role !== 'student') {
                window.location.href = 'admin-dashboard.html';
                return;
            }

            if (profile) {
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                
                if(document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.program || profile.course || 'Student';
                if(profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            }

            const { data: apps, error: fetchError } = await window.supabaseClient
                .from('applications')
                .select(`*, scholarships ( title )`)
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            const applicationsData = apps || [];

            if (typeof updateMetrics === 'function') updateMetrics(applicationsData);
            if (typeof renderTable === 'function') renderTable(applicationsData);
            if (typeof updateStatusTracker === 'function') updateStatusTracker(applicationsData);

        } catch (error) {
            console.error("Error loading applications:", error);
            const tbody = document.getElementById('applications-tbody'); 
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger-color);">Error loading data. Check console.</td></tr>`;
        }
    };

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
                // Step 2: Use their id_number to find their school in the masterlist
                const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id, schools(name)')
                    .eq('id_number', profile.id_number)
                    .single();

                if (masterlistError) {
                    console.warn("Could not find student in masterlist to assign school.");
                }

                // Update UI Elements
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                const schoolName = masterlistData && masterlistData.schools ? masterlistData.schools.name : 'Unassigned School';

                if (document.getElementById('welcome-text')) {
                    document.getElementById('welcome-text').innerText = `Welcome back, ${firstName}! 👋`;
                }
                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                }
                if (document.getElementById('header-program')) {
                    document.getElementById('header-program').innerText = profile.program || profile.course || 'Student Profile';
                }
                if (document.getElementById('student-school-display')) {
                    document.getElementById('student-school-display').innerHTML = `🏫 <strong>${schoolName}</strong>`;
                }
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            }
        } catch (error) {
            console.error("Error loading profile and masterlist data:", error);
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

            // A. Update Overview Stats
            const submittedCount = applications.filter(a => a.status === 'Pending').length;
            const reviewCount = applications.filter(a => a.status === 'Under Review').length;
            const approvedCount = applications.filter(a => a.status === 'Approved').length;
            const rejectedCount = applications.filter(a => a.status === 'Rejected').length;

            if(document.getElementById('stat-submitted')) document.getElementById('stat-submitted').innerText = submittedCount;
            if(document.getElementById('stat-review')) document.getElementById('stat-review').innerText = reviewCount;
            if(document.getElementById('stat-approved')) document.getElementById('stat-approved').innerText = approvedCount;
            if(document.getElementById('stat-rejected')) document.getElementById('stat-rejected').innerText = rejectedCount;

            // B. Render "My Recent Applications" (Limit to 3 for UI cleanliness)
            const recentList = document.getElementById('recent-applications-list');
            if (!recentList) return;
            
            if (applications.length === 0) {
                recentList.innerHTML = `<div style="padding:20px; text-align:center; color:#64748b; font-size:13px;">You haven't submitted any applications yet.</div>`;
                return;
            }

            recentList.innerHTML = '';
            applications.slice(0, 3).forEach(app => {
                const title = app.scholarships ? app.scholarships.title : 'Unknown Scholarship';
                const dateStr = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                
                // Determine Badge styling based on status
                let badgeClass = 'badge-pending';
                let iconStr = '🎓';
                let iconBg = '#f1f5f9';
                let iconColor = '#475569';

                if(app.status === 'Under Review') { badgeClass = 'badge-review'; iconStr = '⏳'; iconBg = '#fef3c7'; iconColor = '#d97706'; }
                if(app.status === 'Approved') { badgeClass = 'badge-approved'; iconStr = '✓'; iconBg = '#dcfce7'; iconColor = '#10b981'; }
                if(app.status === 'Rejected') { badgeClass = 'badge-rejected'; iconStr = '🏛️'; iconBg = '#e0e7ff'; iconColor = '#3b82f6'; } 

                recentList.innerHTML += `
                    <div class="list-item">
                        <div class="item-icon" style="background:${iconBg}; color:${iconColor};">${iconStr}</div>
                        <div class="item-details">
                            <h4>${title}</h4>
                            <p>Academic Year ${new Date().getFullYear()}-${new Date().getFullYear() + 1}</p>
                        </div>
                        <div class="item-meta">
                            <span class="badge-status ${badgeClass}">${app.status || 'Pending'}</span>
                            <span class="meta-date">Applied on ${dateStr}</span>
                        </div>
                    </div>
                `;
            });

        } catch (error) {
            console.error("Error loading applications:", error);
            if(document.getElementById('recent-applications-list')) {
                document.getElementById('recent-applications-list').innerHTML = `<div style="padding:20px; color:red; font-size:13px;">Error loading applications.</div>`;
            }
        }
    }

    // --- 4. FETCH RECOMMENDED SCHOLARSHIPS ---
    async function loadRecommendations() {
        try {
            // Get active scholarships
            const { data: scholarships, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('status', 'Active')
                .order('created_at', { ascending: false })
                .limit(2); // Match UI by showing just top 2

            if (error) throw error;

            const recList = document.getElementById('recommended-scholarships-list');
            if (!recList) return;
            
            if (!scholarships || scholarships.length === 0) {
                recList.innerHTML = `<div style="padding:20px; text-align:center; color:#64748b; font-size:13px;">No active scholarships available at the moment.</div>`;
                return;
            }

            recList.innerHTML = '';
            
            const icons = ['🌿', '💖', '⭐', '📚'];
            const bgs = ['#ecfccb', '#ffe4e6', '#fef3c7', '#e0e7ff'];
            const colors = ['#65a30d', '#e11d48', '#d97706', '#4f46e5'];

            scholarships.forEach((sch, index) => {
                const icon = icons[index % icons.length];
                const bg = bgs[index % bgs.length];
                const color = colors[index % colors.length];
                
                const deadline = sch.end_date ? new Date(sch.end_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No Deadline';
                // Strip HTML from description if it exists
                const cleanDesc = sch.description ? sch.description.replace(/<[^>]*>?/gm, '').substring(0, 70) + '...' : 'Open for applications.';

                recList.innerHTML += `
                    <div class="list-item">
                        <div class="item-icon" style="background:${bg}; color:${color};">${icon}</div>
                        <div class="item-details">
                            <h4>${sch.title}</h4>
                            <p>${cleanDesc}</p>
                            <p style="margin-top:6px; font-size:11px; font-weight:600; color:#10b981;">Deadline: ${deadline}</p>
                        </div>
                        <div class="item-meta" style="justify-content:center;">
                            <a href="apply-scholarships.html?id=${sch.id}" class="btn-apply">Apply Now</a>
                        </div>
                    </div>
                `;
            });

        } catch (error) {
            console.error("Error loading recommendations:", error);
            if(document.getElementById('recommended-scholarships-list')) {
                document.getElementById('recommended-scholarships-list').innerHTML = `<div style="padding:20px; color:red; font-size:13px;">Error loading recommendations.</div>`;
            }
        }
    }

    // --- 5. AI CHAT TOGGLE (Global Window Function) ---
    window.toggleChat = () => {
        const widget = document.getElementById('ai-chat-widget');
        if(widget) widget.classList.toggle('open');
    };

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
                modalConfirm.innerText = "Logging out...";
                modalConfirm.disabled = true;
                await window.supabaseClient.auth.signOut();
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Logout error:", error);
                alert("Failed to logout. Please try again.");
                modalConfirm.innerText = "Yes";
                modalConfirm.disabled = false;
            }
        });
    }

    // --- 8. NOTIFICATION BELL LOGIC ---
    const notifBell = document.getElementById('notification-bell');
    const notifDropdown = document.getElementById('notification-dropdown');
    const notifBadge = document.getElementById('notification-badge');
    const notifList = document.getElementById('notification-list');

    async function loadNotifications() {
        if (!notifList) return; 

        try {
            const { data: notifications, error } = await window.supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', studentId) 
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!notifications || notifications.length === 0) {
                notifList.innerHTML = '<div style="padding: 15px; text-align: center; color: #64748b; font-size: 13px;">No new notifications</div>';
                if (notifBadge) notifBadge.style.display = 'none';
                return;
            }

            const unreadCount = notifications.filter(n => !n.is_read).length;
            if (notifBadge) {
                if (unreadCount > 0) {
                    notifBadge.textContent = unreadCount;
                    notifBadge.style.display = 'flex';
                } else {
                    notifBadge.style.display = 'none';
                }
            }

            notifList.innerHTML = notifications.map(n => `
                <div class="notification-item" style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; background: ${n.is_read ? '#fff' : '#f8fafc'}; text-align: left;">
                    <strong style="display: block; font-size: 13px; color: #0f172a;">${n.title || 'Notification'}</strong>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #475569; line-height: 1.4;">${n.message}</p>
                    <span style="display: block; margin-top: 6px; font-size: 10px; color: #94a3b8;">${new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            `).join('');

        } catch (err) {
            console.error("Error loading notifications:", err);
            notifList.innerHTML = '<div style="padding: 15px; text-align: center; color: #ef4444; font-size: 13px;">Make sure the "notifications" table exists in Supabase!</div>';
        }
    }

    if (notifBell && notifDropdown) {
        notifBell.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const isHidden = notifDropdown.style.display === 'none' || notifDropdown.style.display === '';
            
            if (isHidden) {
                notifDropdown.style.display = 'block';
                notifDropdown.classList.add('show');
                
                if (notifBadge && notifBadge.style.display !== 'none') {
                    notifBadge.style.display = 'none'; 
                    
                    window.supabaseClient
                        .from('notifications')
                        .update({ is_read: true })
                        .eq('user_id', studentId)
                        .eq('is_read', false)
                        .then(({error}) => {
                            if (error) console.error("Could not mark as read:", error);
                        });
                }
            } else {
                notifDropdown.style.display = 'none';
                notifDropdown.classList.remove('show');
            }
        });

        document.addEventListener('click', (e) => {
            if (!notifBell.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.style.display = 'none';
                notifDropdown.classList.remove('show');
            }
        });
    }

    // --- INIT ---
    loadProfile();
    loadApplications();
    loadRecommendations();
    loadNotifications();
    
    // Explicitly call loadMyApplications if it's meant to be run on load
    // loadMyApplications(); 
});