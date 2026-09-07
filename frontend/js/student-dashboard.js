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

                if (document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = `${firstName} ${lastName}`.trim();
                if (document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.program || profile.course || 'Student';
                if (profile.avatar_url && document.getElementById('header-avatar')) {
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
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger-color);">Error loading data. Check console.</td></tr>`;
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
                const fullName = `${firstName} ${lastName}`.trim();
                const progName = profile.program || profile.course || 'Student Profile';

                sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));

                if (document.getElementById('welcome-text')) {
                    document.getElementById('welcome-text').innerText = `Welcome back, ${firstName}! 👋`;
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

            // Filter out applications added by admin (they have null form_responses)
            const applications = (apps || []).filter(app => app.form_responses !== null);

            // A. Update Overview Stats & Remove Skeleton Shimmer
            const submittedCount = applications.length;
            const reviewCount = applications.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
            const approvedCount = applications.filter(a => a.status === 'Approved' || a.status === 'Grantee').length;
            const rejectedCount = applications.filter(a => a.status === 'Rejected' || a.status === 'Declined' || a.status === 'Revoked').length;

            ['stat-submitted', 'stat-review', 'stat-approved', 'stat-rejected'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('is-loading');
            });

            if (document.getElementById('stat-submitted')) document.getElementById('stat-submitted').innerText = submittedCount;
            if (document.getElementById('stat-review')) document.getElementById('stat-review').innerText = reviewCount;
            if (document.getElementById('stat-approved')) document.getElementById('stat-approved').innerText = approvedCount;
            if (document.getElementById('stat-rejected')) document.getElementById('stat-rejected').innerText = rejectedCount;

            // B. Render "My Recent Applications" (Limit to 5 for UI cleanliness)
            const recentList = document.getElementById('recent-applications-list');
            if (!recentList) return;

            if (applications.length === 0) {
                recentList.innerHTML = `<div class="list-empty-state">You have not submitted any educational assistance applications yet.</div>`;
                return;
            }

            recentList.innerHTML = '';
            applications.slice(0, 5).forEach(app => {
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
                    <div class="list-item" style="cursor:pointer;" onclick="window.location.href='student-applications.html?app_id=${app.id}'">
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

    // --- 4. FETCH RECOMMENDED SCHOLARSHIPS ---
    async function loadRecommendations() {
        try {
            const recList = document.getElementById('recommended-scholarships-list');
            if (!recList) return;

            // Helper to safely parse JSON arrays
            const parseArray = (val) => {
                if (!val) return [];
                if (Array.isArray(val)) return val;
                try {
                    const parsed = JSON.parse(val);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    if (typeof val === 'string') return val.split(',').map(s => s.trim());
                    return [];
                }
            };

            // Fetch profile
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            let studentSchoolId = profile ? profile.school_id : null;
            if (profile && !studentSchoolId && profile.id_number) {
                const { data: masterlistData } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id')
                    .eq('id_number', profile.id_number)
                    .single();
                if (masterlistData) studentSchoolId = masterlistData.school_id;
            }

            // Fetch applications
            const { data: userApps } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships ( category )')
                .eq('student_id', studentId);

            const allUserApps = userApps || [];

            // Fetch school policies
            let policyQuery = window.supabaseClient.from('school_policies').select('*');
            if (studentSchoolId) {
                policyQuery = policyQuery.eq('school_id', studentSchoolId);
            }
            const { data: policies } = await policyQuery.single();
            const policyData = policies || null;

            // Fetch active scholarships
            let schQuery = window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('status', 'Active')
                .order('created_at', { ascending: false });

            if (studentSchoolId) {
                schQuery = schQuery.eq('school_id', studentSchoolId);
            }

            const { data: scholarships, error } = await schQuery;

            if (error) throw error;

            if (!scholarships || scholarships.length === 0) {
                recList.innerHTML = `<div class="list-empty-state">No active educational assistance available at the moment.</div>`;
                return;
            }

            // Filter Recommendations (Do not display if completely ineligible)
            const filteredSch = scholarships.filter(sch => {
                // 1. Check if closed or expired
                if (sch.display_status === 'Closed') return false;
                if (sch.end_date && new Date(sch.end_date) < new Date()) return false;

                // 2. Check slots
                if (sch.slots !== 'Open' && sch.available_slots === 0) return false;

                // 3. Check if already applied
                const hasApplied = allUserApps.some(a => a.scholarship_id === sch.id);
                if (hasApplied) return false;

                if (!profile) return false;

                // 4. Program Eligibility
                const rawProgs = parseArray(sch.eligibility_programs);
                const eligibleProgs = rawProgs.map(p => p.toLowerCase().trim());
                const studentProgLower = (profile.program || profile.course || '').toLowerCase().trim();
                const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any'];
                const isProgOpen = eligibleProgs.length === 0 || eligibleProgs.some(p => progOpenKeywords.includes(p));
                if (!isProgOpen) {
                    if (!studentProgLower) return false;
                    const matchesProg = eligibleProgs.some(p => p === studentProgLower || p.includes(studentProgLower) || studentProgLower.includes(p));
                    if (!matchesProg) return false;
                }

                // 5. Year Level Eligibility
                const rawYears = parseArray(sch.eligibility_years);
                const eligibleYears = rawYears.map(y => y.toLowerCase().trim());
                const studentYearLower = (profile.year_level || '').toLowerCase().trim();
                const yearOpenKeywords = ['open to all', 'all year levels', 'any'];
                const isYearOpen = eligibleYears.length === 0 || eligibleYears.some(y => yearOpenKeywords.includes(y));
                if (!isYearOpen) {
                    if (!studentYearLower) return false;
                    const matchesYear = eligibleYears.some(y => y === studentYearLower || y.includes(studentYearLower) || studentYearLower.includes(y));
                    if (!matchesYear) return false;
                }

                // 6. GWA Eligibility
                if (sch.min_college_gwa && parseFloat(sch.min_college_gwa) > 0) {
                    const studentGwa = parseFloat(profile.gwa);
                    if (isNaN(studentGwa)) return false;
                    if (studentGwa > parseFloat(sch.min_college_gwa)) return false;
                }

                return true;
            });

            // If none pass the filter
            if (filteredSch.length === 0) {
                recList.innerHTML = `<div class="list-empty-state">No educational assistance currently matches your academic profile.</div>`;
                return;
            }

            recList.innerHTML = '';

            // Determine if Profile is Complete (Personal Information)
            const requiredProfileFields = ['first_name', 'middle_name', 'last_name', 'email', 'id_number', 'date_of_birth', 'gender', 'contact_number', 'address'];
            const isProfileComplete = profile && requiredProfileFields.every(field => profile[field] && profile[field].toString().trim() !== '');

            // Take Top 2 Recommendations to show
            filteredSch.slice(0, 2).forEach((sch) => {
                const deadline = sch.end_date ? new Date(sch.end_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No Deadline';
                const cleanDesc = sch.description ? sch.description.replace(/<[^>]*>?/gm, '').substring(0, 70) + '...' : 'Open for applications.';

                // Format Min GWA for display
                const minGwaDisplay = sch.min_college_gwa ? sch.min_college_gwa : 'N/A';

                // Check Button Disabled Logic
                let btnDisabled = false;
                let btnText = 'Apply Now';
                let btnClass = 'btn-apply';
                let btnLink = `apply-scholarships.html?id=${sch.id}`;

                if (!isProfileComplete) {
                    btnText = 'Complete Personal Information';
                    btnLink = 'profile-settings.html';
                    btnClass = 'btn-apply btn-warning';
                } else if (policyData && policyData.global_enabled) {
                    const activeApps = allUserApps.filter(a => ['Approved', 'Grantee'].includes(a.status));
                    const targetCat = sch.category;

                    if (activeApps.length >= (policyData.global_limit || 0) && (policyData.global_limit || 0) > 0) {
                        btnDisabled = true;
                        btnText = 'Limit Reached';
                        btnClass = 'btn-apply btn-disabled';
                    }

                    const catLimits = policyData.category_limits || {};
                    const comboRules = policyData.combination_rules || {};

                    if (!btnDisabled && catLimits[targetCat] && !catLimits[targetCat].unlimited) {
                        const activeInTargetCat = activeApps.filter(a =>
                            (a.scholarships?.category || a.outside_assistance_name) === targetCat
                        ).length;
                        if (activeInTargetCat >= catLimits[targetCat].limit) {
                            btnDisabled = true;
                            btnText = 'Category Full';
                            btnClass = 'btn-apply btn-disabled';
                        }
                    }

                    if (!btnDisabled) {
                        for (let activeApp of activeApps) {
                            const activeCat = activeApp.scholarships?.category || activeApp.outside_assistance_name;
                            if (activeCat && activeCat !== targetCat) {
                                const comboKey = `${activeCat}::${targetCat}`;
                                if (comboRules[comboKey] === false) {
                                    btnDisabled = true;
                                    btnText = 'Not Allowed';
                                    btnClass = 'btn-apply btn-disabled';
                                    break;
                                }
                            }
                        }
                    }
                }

                const btnHTML = btnDisabled ?
                    `<button class="${btnClass}" disabled title="${btnText}">${btnText}</button>` :
                    `<a href="${btnLink}" class="${btnClass}">${btnText}</a>`;

                recList.innerHTML += `
                    <div class="list-item rec-list-item">
                        <div class="rec-main-info">
                            <div class="item-icon icon-sch-rec"><i data-lucide="graduation-cap"></i></div>
                            <div class="item-details">
                                <h4>${sch.title}</h4>
                                <p>${cleanDesc}</p>
                                <p class="meta-gwa">Min College GWA: <strong>${minGwaDisplay}</strong></p>
                                <p class="meta-deadline">Deadline: ${deadline}</p>
                            </div>
                        </div>
                        <div class="item-meta">
                            ${btnHTML}
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

    // --- X. FETCH ANNOUNCEMENTS ---
    async function loadAnnouncements() {
        try {
            const container = document.getElementById('announcements-list-container');
            if (!container) return;

            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            const { data: userApps } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships(title)')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });

            const userApp = (userApps && userApps.length > 0) ? userApps[0] : null;

            let query = window.supabaseClient
                .from('announcements')
                .select('*, profiles:author_id ( first_name, last_name )')
                .eq('status', 'Published')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (profile && profile.school_id) {
                query = query.eq('school_id', profile.school_id);
            }

            const { data: announcements, error } = await query;

            if (error) throw error;

            if (!announcements || announcements.length === 0) {
                container.innerHTML = `<div class="list-empty-state">No announcements available at the moment.</div>`;
                return;
            }

            function isAudienceMatch(announcement, profile, applications) {
                const aud = announcement.audience_type;
                if (!aud) return true;

                const audStr = aud.toLowerCase().trim();

                if (audStr === 'all_students' || audStr === 'all_enrolled_students' || audStr === 'all') return true;

                if (audStr.startsWith('prog_') && profile && profile.program) {
                    return profile.program.toLowerCase() === audStr.replace('prog_', '').toLowerCase();
                }

                if (audStr.startsWith('app_')) {
                    const scholarshipKeyword = audStr.replace('app_', '').toLowerCase();

                    if (applications && applications.length > 0) {
                        return applications.some(app => {
                            const title = app.scholarships?.title?.toLowerCase() || '';
                            return title.includes(scholarshipKeyword);
                        });
                    }
                    return false;
                }

                if (audStr.includes('active') || audStr.includes('approved')) {
                    if (applications && applications.length > 0) {
                        return applications.some(app => app.status.toLowerCase() === 'approved' || app.status.toLowerCase() === 'grantee');
                    }
                    return profile && profile.is_approved === true;
                }

                if (audStr.includes('pending')) {
                    if (applications && applications.length > 0) {
                        return applications.some(app => app.status.toLowerCase() === 'pending');
                    }
                    return profile && profile.is_approved === false;
                }

                if (audStr.includes('rejected')) {
                    if (applications && applications.length > 0) {
                        return applications.some(app => app.status.toLowerCase() === 'rejected');
                    }
                    return false;
                }

                return false;
            }

            function getCategoryIcon(category) {
                if (!category) return { icon: '📢', cssClass: 'icon-cat-general' };
                const cat = category.toLowerCase();
                if (cat.includes('educational assistance') || cat.includes('scholarship')) return { icon: '🎓', cssClass: 'icon-cat-edu' };
                if (cat.includes('reminder') || cat.includes('deadline')) return { icon: '📅', cssClass: 'icon-cat-reminder' };
                if (cat.includes('event')) return { icon: '🗓️', cssClass: 'icon-cat-event' };
                return { icon: '📢', cssClass: 'icon-cat-general' };
            }

            let filtered = announcements.filter(ann => isAudienceMatch(ann, profile, userApps || []));

            if (filtered.length === 0) {
                container.innerHTML = `<div class="list-empty-state">No announcements available for you at the moment.</div>`;
                return;
            }

            container.innerHTML = '';

            filtered.slice(0, 5).forEach(ann => {
                const dateStr = new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                let tempDiv = document.createElement("div");
                tempDiv.innerHTML = ann.content || "";
                let excerpt = tempDiv.textContent || tempDiv.innerText || "";
                if (excerpt.length > 80) excerpt = excerpt.substring(0, 80) + '...';

                container.innerHTML += `
                    <div class="list-item announcement-list-item" style="cursor:pointer;" onclick="window.location.href='student-announcements.html?id=${ann.id}'">
                        <div class="item-icon icon-announcement-item"><i data-lucide="megaphone"></i></div>
                        <div class="item-details">
                            <h4>${ann.title || 'Untitled'}</h4>
                            <p>${excerpt}</p>
                        </div>
                        <div class="item-meta">
                            <span class="meta-date">${dateStr}</span>
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

    // --- INIT ---
    loadProfile();
    loadApplications();
    loadRecommendations();
    loadAnnouncements();

    if (window.lucide) { window.lucide.createIcons(); }
});