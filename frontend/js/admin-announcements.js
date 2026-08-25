document.addEventListener('DOMContentLoaded', async () => {

    document.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));

    // ==========================================
    // 1. AUTH CHECK & INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login-student.html';
        return;
    }

    const adminId = session.user.id;
    let currentAdminSchoolId = null;
    let allAnnouncements = [];
    let currentSelectedAnnId = null;

    async function initProfile() {
        try {
            const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', adminId).single();
            if (profile) {
                if (!['admin', 'coordinator'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;
                const headerName = document.getElementById('header-name');
                if (headerName) headerName.innerText = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();

                if (profile.avatar_url) {
                    const headerAvatar = document.getElementById('header-avatar');
                    if (headerAvatar) headerAvatar.src = profile.avatar_url;
                }

                await runAutomatedStatusUpdates();
                fetchAnnouncements();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }

    // Header Profile & Dropdown
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
            profileToggle.classList.toggle('active-state');
        });

        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target)) {
                profileMenu.classList.remove('show');
                profileToggle.classList.remove('active-state');
            }
        });
    }

    // ==========================================
    // LOGOUT MODAL LOGIC (CUSTOM HTML)
    // ==========================================
    const logoutModal = document.getElementById('logout-modal');
    document.getElementById('dropdown-logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (profileMenu) profileMenu.classList.remove('show');
        if (profileToggle) profileToggle.classList.remove('active-state');
        if (logoutModal) logoutModal.style.display = 'flex';
    });

    document.getElementById('modal-cancel')?.addEventListener('click', () => {
        if (logoutModal) logoutModal.style.display = 'none';
    });

    // document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    //     try {
    //         Swal.fire({ title: 'Logging out...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    //         const { error } = await window.supabaseClient.auth.signOut();
    //         if (error) throw error;
    //         window.location.href = 'login.html';
    //     } catch (err) {
    //         Swal.fire('Error', 'Failed to log out. Please try again.', 'error');
    //     }
    // });

    // ==========================================
    // 8. MOBILE HAMBURGER MENU TOGGLE
    // ==========================================
    const hamburgerBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar-container');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn && sidebar && overlay) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = sidebar.classList.contains('active');
            if (isActive) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.remove('active');
            } else {
                sidebar.classList.add('active');
                overlay.classList.add('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.add('active');
            }
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        });
    }

    // ==========================================
    // 2. BACKGROUND TASKS & STATS
    // ==========================================
    async function runAutomatedStatusUpdates() {
        if (!currentAdminSchoolId) return;
        const now = new Date().toISOString();
        try {
            await window.supabaseClient.from('announcements')
                .update({ status: 'Published' })
                .eq('school_id', currentAdminSchoolId)
                .eq('status', 'Scheduled')
                .lte('scheduled_at', now);

            await window.supabaseClient.from('announcements')
                .update({ status: 'Archived' })
                .eq('school_id', currentAdminSchoolId)
                .in('status', ['Published', 'Scheduled'])
                .lte('expires_at', now)
                .not('expires_at', 'is', null);
        } catch (err) { }
    }

    function updateDashboardStats(data) {
        if (!document.getElementById('stat-total')) return;

        const published = data.filter(a => a.status === 'Published').length;
        const scheduled = data.filter(a => a.status === 'Scheduled').length;
        const drafts = data.filter(a => a.status === 'Draft').length;
        const archived = data.filter(a => a.status === 'Archived').length;
        const totalComments = data.reduce((sum, a) => sum + (a.announcement_comments ? a.announcement_comments.length : 0), 0);

        document.getElementById('stat-total').innerText = data.length;
        document.getElementById('stat-published').innerText = published;
        document.getElementById('stat-scheduled').innerText = scheduled;
        document.getElementById('stat-drafts').innerText = drafts;
        document.getElementById('stat-archived').innerText = archived;
        document.getElementById('stat-comments').innerText = totalComments;
    }

    // ==========================================
    // 3. FETCH DATA & FILTERING
    // ==========================================
    const container = document.getElementById('announcements-container');

    async function fetchAnnouncements() {
        if (!currentAdminSchoolId) return;
        try {
            const { data, error } = await window.supabaseClient
                .from('announcements')
                .select(`*, profiles:author_id ( first_name, last_name, avatar_url, role ), announcement_comments ( id ), announcement_reads ( student_id )`)
                .eq('school_id', currentAdminSchoolId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            allAnnouncements = data || [];
            updateDashboardStats(allAnnouncements);
            applyFilters();
        } catch (err) {
            console.error("Fetch Announcements Error:", err);
            if (container) container.innerHTML = `<div class="text-center text-red" style="padding: 40px;">Failed to load feed. ${err.message || 'Check database connection.'}</div>`;
        }
    }

    function applyFilters() {
        const term = document.getElementById('search-input')?.value.toLowerCase() || '';
        const statusStr = document.getElementById('filter-status')?.value || 'all';
        const catStr = document.getElementById('filter-category')?.value || 'all';
        const audStr = document.getElementById('filter-audience')?.value || 'all';
        const sortVal = document.getElementById('sort-date')?.value || 'desc';

        let filtered = allAnnouncements.filter(a => {
            const matchesSearch = (a.title && a.title.toLowerCase().includes(term)) || (a.content && a.content.toLowerCase().includes(term));
            const matchesStatus = statusStr === 'all' || a.status.toLowerCase() === statusStr;
            const matchesCat = catStr === 'all' || (a.category && a.category.toLowerCase() === catStr);
            const matchesAud = audStr === 'all' || a.audience_type === audStr;
            return matchesSearch && matchesStatus && matchesCat && matchesAud;
        });

        filtered.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortVal === 'desc' ? dateB - dateA : dateA - dateB;
        });

        filtered.sort((a, b) => (b.is_pinned === true) - (a.is_pinned === true));
        renderAnnouncementsList(filtered);
    }

    ['search-input', 'filter-status', 'filter-category', 'filter-audience', 'sort-date'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFilters);
    });

    // ==========================================
    // 4. RENDER MASTER LIST (CENTER COLUMN)
    // ==========================================
    window.toggleSeeMore = (id) => {
        const el = document.getElementById(`content-${id}`);
        const btn = document.getElementById(`btn-see-more-${id}`);
        if (!el || !btn) return;
        if (el.classList.contains('card-text-truncated')) {
            el.classList.remove('card-text-truncated');
            btn.innerText = 'See less';
        } else {
            el.classList.add('card-text-truncated');
            btn.innerText = 'See more';
        }
    };

    window.generateImageGrid = (urls, customStyle = 'margin: 0 20px 16px 20px;') => {
        if (!urls || urls.length === 0) return '';
        const count = urls.length;
        let imagesHtml = '';
        let layoutClass = '';

        if (count === 1) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img" alt="Announcement Image">`;
            layoutClass = 'fb-layout-1';
        } else if (count === 2) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img"><img src="${urls[1]}" class="fb-img">`;
            layoutClass = 'fb-layout-2';
        } else if (count === 3) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img span-top"><img src="${urls[1]}" class="fb-img"><img src="${urls[2]}" class="fb-img">`;
            layoutClass = 'fb-layout-3';
        } else if (count === 4) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img"><img src="${urls[1]}" class="fb-img"><img src="${urls[2]}" class="fb-img"><img src="${urls[3]}" class="fb-img">`;
            layoutClass = 'fb-layout-4';
        } else {
            imagesHtml = `
                <img src="${urls[0]}" class="fb-img">
                <img src="${urls[1]}" class="fb-img">
                <img src="${urls[2]}" class="fb-img">
                <img src="${urls[3]}" class="fb-img">
            `;
            if (count === 5) {
                imagesHtml += `<img src="${urls[4]}" class="fb-img">`;
            } else {
                imagesHtml += `<div class="more-images-container" data-more="+${count - 5}"><img src="${urls[4]}" class="fb-img"></div>`;
            }
            layoutClass = 'fb-layout-5';
        }

        return `<div class="fb-layout ${layoutClass}" style="${customStyle}">${imagesHtml}</div>`;
    };

    function renderAnnouncementsList(data) {
        if (!container) return;
        if (data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted" style="padding: 40px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #fff;">No announcements found.</div>`;
            return;
        }

        container.innerHTML = '';
        data.forEach(ann => {
            const dateStr = new Date(ann.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

            let authorName = "System Administrator";
            let authorAvatar = "assets/admin-avatar.png";
            if (ann.profiles) {
                authorName = `${ann.profiles.first_name || ''} ${ann.profiles.last_name || ''}`.trim();
                if (ann.profiles.avatar_url) authorAvatar = ann.profiles.avatar_url;
            }

            const commentCount = ann.announcement_comments ? ann.announcement_comments.length : 0;
            const menuId = `menu-feed-${ann.id}`;

            let audienceStr = ann.audience_type === 'all_enrolled_students' || ann.audience_type === 'all_students' ? 'All Enrolled Students' : 'Targeted';
            let pinnedBadge = ann.is_pinned ? `<span style="color:#f59e0b; margin-right:4px;" title="Pinned"><i class="fa-solid fa-thumbtack"></i></span>` : '';

            // Check if content is long to add "See more"
            let tempDiv = document.createElement("div");
            tempDiv.innerHTML = ann.content || '';
            const plainText = tempDiv.textContent || tempDiv.innerText || "";
            const isLong = plainText.length > 250;

            let catStyle = "border:1px solid #86efac; color:#16a34a; background:#f0fdf4;";
            let catIcon = "fa-solid fa-bullhorn";
            if (ann.category === 'Educational Assistance') {
                catStyle = "border:1px solid #93c5fd; color:#1d4ed8; background:#eff6ff;";
                catIcon = "fa-solid fa-graduation-cap";
            } else if (ann.category === 'Reminder') {
                catStyle = "border:1px solid #fde047; color:#a16207; background:#fefce8;";
                catIcon = "fa-regular fa-clock";
            } else if (ann.category === 'Event') {
                catStyle = "border:1px solid #d8b4fe; color:#7e22ce; background:#faf5ff;";
                catIcon = "fa-regular fa-calendar";
            }

            const commentsBadgeStyle = ann.allow_comments !== false ? 
                "background:#dcfce7; color:#166534;" : 
                "background:#fee2e2; color:#991b1b;";

            let coverHtml = window.generateImageGrid(ann.image_urls);

            const card = document.createElement('div');
            card.className = `social-card`;
            card.dataset.id = ann.id;

            card.innerHTML = `
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; padding: 20px 20px 10px 20px;">
                    <div class="card-meta-row" style="display:flex; align-items:center; gap:10px;">
                        <span style="background:#dcfce7; color:#166534; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;">${ann.status}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img src="${authorAvatar}" class="card-avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                            <span style="font-size:14px; font-weight:500; color:#475569;">${authorName}</span>
                            <span style="color:#cbd5e1; font-size:10px;">&bull;</span>
                            <span style="font-size:14px; color:#64748b;">${dateStr}</span>
                        </div>
                    </div>
                    <div class="post-options-container">
                        <button class="btn-option btn-menu-toggle" data-target="${menuId}" style="background:#fff; border:1px solid #e2e8f0; color:#475569; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; display:flex; align-items:center; gap:6px; cursor:pointer;"><i class="fa-solid fa-ellipsis"></i> Options</button>
                        <div class="post-options-menu" id="${menuId}" style="display:none; position:absolute; right:0; top:35px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:10; width:170px; overflow:hidden;">
                            <button class="btn-edit-ann" data-id="${ann.id}"><i class="fa-solid fa-pen" style="width:16px;"></i> Edit</button>
                            <button class="btn-pin-ann" data-id="${ann.id}" data-pinned="${ann.is_pinned}">${pinnedBadge}<i class="fa-solid fa-thumbtack" style="width:16px;"></i> ${ann.is_pinned ? 'Unpin' : 'Pin'}</button>
                            <button class="btn-comments-ann" data-id="${ann.id}" data-state="${ann.allow_comments}"><i class="fa-solid fa-${ann.allow_comments !== false ? 'lock' : 'unlock'}" style="width:16px;"></i> ${ann.allow_comments !== false ? 'Close Comments' : 'Open Comments'}</button>
                            <button class="btn-duplicate-ann" data-id="${ann.id}"><i class="fa-regular fa-copy" style="width:16px;"></i> Duplicate</button>
                            ${ann.status === 'Archived' ? `<button class="btn-unarchive-ann" data-id="${ann.id}"><i class="fa-solid fa-box-open" style="width:16px;"></i> Unarchive</button>` : `<button class="btn-archive-ann" data-id="${ann.id}"><i class="fa-solid fa-box-archive" style="width:16px;"></i> Archive</button>`}
                            <button class="btn-delete-ann" data-id="${ann.id}" style="color:#ef4444;"><i class="fa-regular fa-trash-can" style="width:16px;"></i> Delete</button>
                        </div>
                    </div>
                </div>
                <h3 class="card-title" style="margin: 0 20px 10px 20px; font-size: 20px;">${pinnedBadge}${ann.title}</h3>
                <div class="card-tags-row" style="display:flex; gap:10px; margin: 0 20px 20px 20px; flex-wrap:wrap;">
                    <span style="border:1px solid #e2e8f0; color:#475569; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px; text-transform:uppercase;"><i class="fa-solid fa-users"></i> ${audienceStr}</span>
                    <span style="${catStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="${catIcon}"></i> ${ann.category || 'General'}</span>
                    <span style="${commentsBadgeStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-${ann.allow_comments !== false ? 'comments' : 'lock'}"></i> ${ann.allow_comments !== false ? 'Comments Open' : 'Comments Closed'}</span>
                </div>
                <div class="card-body" style="padding-top:0;">
                    <div class="card-text-content ${isLong ? 'card-text-truncated' : ''}" id="content-${ann.id}">
                        ${ann.content || ''}
                    </div>
                    ${isLong ? `<button class="btn-see-more" id="btn-see-more-${ann.id}" onclick="toggleSeeMore('${ann.id}')">See more</button>` : ''}
                </div>
                ${coverHtml}
                <div class="card-actions">
                    <button class="btn-comment-action" onclick="window.selectAnnouncement('${ann.id}')">
                        <i class="fa-regular fa-comment"></i> Comment (${commentCount})
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // ==========================================
    // 5. RENDER DETAIL VIEW MODAL
    // ==========================================
    window.selectAnnouncement = (id) => {
        currentSelectedAnnId = id;

        const ann = allAnnouncements.find(a => a.id === id);
        const detailContainer = document.getElementById('announcement-detail-view');
        if (!ann || !detailContainer) return;

        const dateStr = new Date(ann.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

        let authorName = "System Administrator";
        let authorAvatar = "assets/admin-avatar.png";
        if (ann.profiles) {
            authorName = `${ann.profiles.first_name || ''} ${ann.profiles.last_name || ''}`.trim();
            if (ann.profiles.avatar_url) authorAvatar = ann.profiles.avatar_url;
        }

        let coverHtml = window.generateImageGrid(ann.image_urls);

        let attachmentsHtml = '';
        if (ann.attachments && Array.isArray(ann.attachments) && ann.attachments.length > 0) {
            let filesListHtml = ann.attachments.map(file => `
                <div class="attachment-box-readonly" style="padding: 10px; border: 1px solid var(--border-dark); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div class="file-info" style="display: flex; gap: 10px; align-items: center;">
                        <i class="fa-solid fa-file-pdf" style="color: #ef4444; font-size: 20px;"></i>
                        <div>
                            <span class="file-name" title="${file.name}" style="display: block; font-size: 13px; font-weight: 600;">${file.name}</span>
                            <span class="file-size" style="font-size: 11px; color: var(--text-muted);">${file.size || 'View File'}</span>
                        </div>
                    </div>
                    <a href="${file.url}" target="_blank" class="btn-view-file" style="color: var(--primary-color);"><i class="fa-solid fa-eye"></i></a>
                </div>
            `).join('');

            attachmentsHtml = `
                <div class="detail-attachments-section" style="padding: 0 20px 16px 20px;">
                    <h4 class="detail-attachments-title" style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">Attachments (${ann.attachments.length})</h4>
                    <div class="attachment-grid">${filesListHtml}</div>
                </div>
            `;
        }

        let audienceStr = ann.audience_type === 'all_enrolled_students' || ann.audience_type === 'all_students' ? 'All Enrolled Students' : 'Targeted';
        let pinnedBadge = ann.is_pinned ? `<span style="color:#f59e0b; margin-right:4px;" title="Pinned"><i class="fa-solid fa-thumbtack"></i></span>` : '';

        let catStyle = "border:1px solid #86efac; color:#16a34a; background:#f0fdf4;";
        let catIcon = "fa-solid fa-bullhorn";
        if (ann.category === 'Educational Assistance') {
            catStyle = "border:1px solid #93c5fd; color:#1d4ed8; background:#eff6ff;";
            catIcon = "fa-solid fa-graduation-cap";
        } else if (ann.category === 'Reminder') {
            catStyle = "border:1px solid #fde047; color:#a16207; background:#fefce8;";
            catIcon = "fa-regular fa-clock";
        } else if (ann.category === 'Event') {
            catStyle = "border:1px solid #d8b4fe; color:#7e22ce; background:#faf5ff;";
            catIcon = "fa-regular fa-calendar";
        }

        const commentsBadgeStyle = ann.allow_comments !== false ? 
            "background:#dcfce7; color:#166534;" : 
            "background:#fee2e2; color:#991b1b;";

        // We re-use the exact same styling as the feed card for consistency
        detailContainer.innerHTML = `
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; padding: 20px 20px 10px 20px;">
                <div class="card-meta-row" style="display:flex; align-items:center; gap:10px;">
                    <span style="background:#dcfce7; color:#166534; padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700;">${ann.status}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <img src="${authorAvatar}" class="card-avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                        <span style="font-size:14px; font-weight:500; color:#475569;">${authorName}</span>
                        <span style="color:#cbd5e1; font-size:10px;">&bull;</span>
                        <span style="font-size:14px; color:#64748b;">${dateStr}</span>
                    </div>
                </div>
                <div class="post-options-container">
                    <button class="btn-option btn-menu-toggle" style="visibility:hidden; padding: 6px 12px;"><i class="fa-solid fa-ellipsis"></i> Options</button>
                </div>
            </div>
            <h3 class="card-title" style="margin: 0 20px 10px 20px; font-size: 20px;">${pinnedBadge}${ann.title}</h3>
            <div class="card-tags-row" style="display:flex; gap:10px; margin: 0 20px 20px 20px; flex-wrap:wrap;">
                <span style="border:1px solid #e2e8f0; color:#475569; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px; text-transform:uppercase;"><i class="fa-solid fa-users"></i> ${audienceStr}</span>
                <span style="${catStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="${catIcon}"></i> ${ann.category || 'General'}</span>
                <span style="${commentsBadgeStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-${ann.allow_comments !== false ? 'comments' : 'lock'}"></i> ${ann.allow_comments !== false ? 'Comments Open' : 'Comments Closed'}</span>
            </div>
            <div class="card-body" style="padding-top:0; padding-bottom: 16px;">
                <div class="card-text-content">
                    ${ann.content || ''}
                </div>
            </div>
            ${coverHtml}
            ${attachmentsHtml}
        `;

        loadComments(ann.id, ann.allow_comments !== false);
        
        // Open the modal
        const viewModal = document.getElementById('view-announcement-modal');
        if (viewModal) {
            viewModal.style.display = 'flex';
        }
    };

    // ==========================================
    // EVENT DELEGATION FOR ALL BUTTONS
    // ==========================================
    document.body.addEventListener('click', (e) => {
        const menuToggleBtn = e.target.closest('.btn-menu-toggle');
        if (menuToggleBtn) {
            e.stopPropagation();
            const targetId = menuToggleBtn.getAttribute('data-target');
            document.querySelectorAll('.post-options-menu').forEach(menu => {
                if (menu.id !== targetId) menu.style.display = 'none';
            });
            const targetMenu = document.getElementById(targetId);
            if (targetMenu) targetMenu.style.display = targetMenu.style.display === 'none' ? 'block' : 'none';
            return;
        }

        if (!e.target.closest('.post-options-menu')) {
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.style.display = 'none');
        }

        if (e.target.closest('#btn-trigger-post')) {
            e.preventDefault();
            window.openCreateModal();
            return;
        }

        if (e.target.closest('#modal-close-ann') || (e.target.tagName === 'BUTTON' && e.target.innerText.trim() === 'Cancel')) {
            e.preventDefault();
            const annModal = document.getElementById('announcement-modal');
            if (annModal) annModal.style.display = 'none';
            return;
        }

        if (e.target.closest('#modal-close-view')) {
            e.preventDefault();
            const viewModal = document.getElementById('view-announcement-modal');
            if (viewModal) viewModal.style.display = 'none';
            return;
        }

        const editBtn = e.target.closest('.btn-edit-ann');
        if (editBtn) {
            e.preventDefault();
            window.editAnnouncement(editBtn.getAttribute('data-id'));
            return;
        }

        const pinBtn = e.target.closest('.btn-pin-ann');
        if (pinBtn) {
            e.preventDefault();
            window.togglePin(pinBtn.getAttribute('data-id'), pinBtn.getAttribute('data-pinned') === 'true');
            return;
        }

        const commBtn = e.target.closest('.btn-comments-ann');
        if (commBtn) {
            e.preventDefault();
            window.toggleCommentsStatus(commBtn.getAttribute('data-id'), commBtn.getAttribute('data-state') !== 'false');
            return;
        }

        const dupBtn = e.target.closest('.btn-duplicate-ann');
        if (dupBtn) {
            e.preventDefault();
            window.duplicateAnnouncement(dupBtn.getAttribute('data-id'));
            return;
        }

        const archiveBtn = e.target.closest('.btn-archive-ann');
        if (archiveBtn) { e.preventDefault(); window.archiveAnnouncement(archiveBtn.getAttribute('data-id')); return; }

        const unarchiveBtn = e.target.closest('.btn-unarchive-ann');
        if (unarchiveBtn) { e.preventDefault(); window.unarchiveAnnouncement(unarchiveBtn.getAttribute('data-id')); return; }

        const delBtn = e.target.closest('.btn-delete-ann');
        if (delBtn) {
            e.preventDefault();
            window.deleteAnnouncement(delBtn.getAttribute('data-id'));
            return;
        }
    });

    // ==========================================
    // 6. CREATE / EDIT LOGIC & LIVE PREVIEWS
    // ==========================================
    window.editingImageUrls = [];
    window.editingAttachments = [];

    const editor = document.getElementById('ann-content');
    document.querySelectorAll('.rte-btn').forEach(btn => {
        btn.addEventListener('mousedown', function (e) {
            e.preventDefault();
        });

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const command = this.getAttribute('data-command');
            let value = this.getAttribute('data-value') || null;

            if (command === 'createLink') {
                value = prompt('Enter URL:');
                if (!value) return;
            }

            if (document.activeElement !== editor) {
                editor.focus();
            }

            document.execCommand(command, false, value);
            updateRteToolbarState();
        });
    });

    if (editor) {
        editor.addEventListener('keyup', updateRteToolbarState);
        editor.addEventListener('mouseup', updateRteToolbarState);
    }

    function updateRteToolbarState() {
        document.querySelectorAll('.rte-btn').forEach(btn => {
            const command = btn.getAttribute('data-command');
            try {
                if (command && document.queryCommandState(command)) {
                    btn.classList.add('active');
                    btn.style.background = '#e2e8f0';
                } else {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                }
            } catch (e) {
                // Ignore unsupported commands for queryCommandState like formatBlock
            }
        });
    }

    function renderPreviewImageGrid(fileUrls) {
        const previewGrid = document.getElementById('preview-image-grid');
        if (!previewGrid) return;
        if (!fileUrls || fileUrls.length === 0) { previewGrid.innerHTML = ''; return; }

        previewGrid.innerHTML = window.generateImageGrid(fileUrls, 'height: 150px; margin-bottom: 0;');
    }

    window.renderEditingMedia = () => {
        const container = document.getElementById('edit-media-preview-container');
        const imgContainer = document.getElementById('edit-existing-images');
        const fileContainer = document.getElementById('edit-existing-files');

        if (!container || !imgContainer || !fileContainer) return;

        if (window.editingImageUrls.length === 0 && window.editingAttachments.length === 0) {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }

        imgContainer.innerHTML = '';
        window.editingImageUrls.forEach((url, index) => {
            imgContainer.innerHTML += `
                <div class="edit-media-item">
                    <img src="${url}">
                    <button type="button" onclick="removeEditingImage(${index})" title="Remove Image"><i class="fa-solid fa-times"></i></button>
                </div>
            `;
        });

        fileContainer.innerHTML = '';
        window.editingAttachments.forEach((file, index) => {
            fileContainer.innerHTML += `
                <div class="edit-file-item">
                    <span><i class="fa-solid fa-file"></i> ${file.name}</span>
                    <button type="button" onclick="removeEditingFile(${index})" title="Remove File"><i class="fa-solid fa-times"></i></button>
                </div>
            `;
        });

        const imageUploadInput = document.getElementById('ann-image-upload');
        let newUrls = [];
        if (imageUploadInput && imageUploadInput.files) {
            newUrls = Array.from(imageUploadInput.files).map(f => URL.createObjectURL(f));
        }
        renderPreviewImageGrid([...window.editingImageUrls, ...newUrls]);
    };

    window.removeEditingImage = (index) => { window.editingImageUrls.splice(index, 1); window.renderEditingMedia(); };
    window.removeEditingFile = (index) => { window.editingAttachments.splice(index, 1); window.renderEditingMedia(); };

    const imageUpload = document.getElementById('ann-image-upload');
    const fileUpload = document.getElementById('ann-file-upload');

    imageUpload?.addEventListener('change', (e) => {
        const container = document.getElementById('new-image-preview-container');
        container.innerHTML = '';
        const files = e.target.files;
        const newUrls = [];

        Array.from(files).forEach((file) => {
            const url = URL.createObjectURL(file);
            newUrls.push(url);
            container.innerHTML += `
                <div class="media-thumbnail">
                    <img src="${url}">
                    <div class="media-hover-actions">
                        <span style="color:#fff; font-size:10px; font-weight:bold;">New</span>
                    </div>
                </div>
            `;
        });
        renderPreviewImageGrid([...window.editingImageUrls, ...newUrls]);
    });

    fileUpload?.addEventListener('change', (e) => {
        const container = document.getElementById('new-file-preview-container');
        container.innerHTML = '';
        Array.from(e.target.files).forEach((file) => {
            const size = (file.size / 1024).toFixed(1) + ' KB';
            container.innerHTML += `
                <div class="attachment-card-upload">
                    <div class="file-info">
                        <i class="fa-solid fa-file-pdf" style="color:#ef4444; font-size:18px;"></i>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:12px; font-weight:600; color:#0f172a;">${file.name}</span>
                            <span style="font-size:10px; color:#64748b;">${size} &bull; Ready to upload</span>
                        </div>
                    </div>
                </div>
            `;
        });
    });

    const titleInput = document.getElementById('ann-title');
    const categoryInput = document.getElementById('ann-category');
    const audienceInput = document.getElementById('ann-audience');
    const statusInput = document.getElementById('ann-status');
    const contentInput = document.getElementById('ann-content');
    const commentsToggle = document.getElementById('ann-allow-comments');

    function updateLivePreview() {
        if (!document.getElementById('preview-title')) return;

        document.getElementById('preview-title').innerText = (titleInput?.value.trim()) || 'Announcement Title Will Appear Here';

        const catVal = categoryInput?.value || 'General';
        let catIcon = '<i class="fa-solid fa-bullhorn"></i>';
        if (catVal === 'Educational Assistance') catIcon = '<i class="fa-solid fa-graduation-cap"></i>';
        if (catVal === 'Reminder') catIcon = '<i class="fa-regular fa-clock"></i>';
        if (catVal === 'Event') catIcon = '<i class="fa-regular fa-calendar"></i>';
        document.getElementById('preview-category').innerHTML = `${catIcon} ${catVal}`;

        document.getElementById('preview-audience').innerText = (audienceInput?.value === 'all_enrolled_students' || audienceInput?.value === 'all_students') ? 'All Students' : 'Targeted';
        document.getElementById('preview-status').innerText = statusInput?.value || 'Published';

        const commentsAllowed = commentsToggle?.checked !== false;
        const iconSpan = document.getElementById('preview-comment-icon');
        if (iconSpan) {
            iconSpan.parentElement.style.color = commentsAllowed ? '#94a3b8' : '#ef4444';
            iconSpan.parentElement.innerHTML = commentsAllowed ? '<i class="fa-regular fa-comment"></i> 0' : '<i class="fa-solid fa-lock"></i> Off';
        }

        let excerpt = "Start writing content to see a preview of the excerpt...";
        if (contentInput) {
            let tempDiv = document.createElement("div");
            tempDiv.innerHTML = contentInput.innerHTML;
            excerpt = tempDiv.textContent || tempDiv.innerText || excerpt;
            if (excerpt.length > 80 && excerpt !== "Start writing content to see a preview of the excerpt...") excerpt = excerpt.substring(0, 80) + '...';
        }
        document.getElementById('preview-excerpt').innerText = excerpt;
    }

    [titleInput, contentInput].forEach(el => el?.addEventListener('input', updateLivePreview));
    [categoryInput, audienceInput, statusInput, commentsToggle].forEach(el => el?.addEventListener('change', updateLivePreview));

    window.openCreateModal = () => {
        const annModal = document.getElementById('announcement-modal');
        if (!annModal) return;

        const form = document.getElementById('announcement-form');
        if (form) form.reset();

        const idField = document.getElementById('announcement-id');
        if (idField) idField.value = '';

        const contentField = document.getElementById('ann-content');
        if (contentField) contentField.innerHTML = '';

        window.editingImageUrls = [];
        window.editingAttachments = [];
        window.renderEditingMedia();

        const newImgPreview = document.getElementById('new-image-preview-container');
        if (newImgPreview) newImgPreview.innerHTML = '';

        const newFilePreview = document.getElementById('new-file-preview-container');
        if (newFilePreview) newFilePreview.innerHTML = '';

        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) modalTitle.innerText = "Create Announcement";

        if (commentsToggle) commentsToggle.checked = true;
        toggleScheduleDate();
        updateLivePreview();
        annModal.style.display = 'flex';
    };

    document.getElementById('ann-status')?.addEventListener('change', toggleScheduleDate);
    function toggleScheduleDate() {
        const status = document.getElementById('ann-status')?.value;
        const schedContainer = document.getElementById('schedule-date-container');
        if (schedContainer) schedContainer.style.display = status === 'Scheduled' ? 'block' : 'none';
    }

    window.editAnnouncement = (id) => {
        const annModal = document.getElementById('announcement-modal');
        if (!annModal) return;
        const ann = allAnnouncements.find(x => x.id === id);
        if (!ann) return;

        document.getElementById('announcement-id').value = ann.id;
        document.getElementById('ann-title').value = ann.title;
        document.getElementById('ann-category').value = ann.category || 'General';
        document.getElementById('ann-audience').value = ann.audience_type || 'all_students';
        document.getElementById('ann-content').innerHTML = ann.content;
        document.getElementById('ann-status').value = ann.status;
        document.getElementById('ann-allow-comments').checked = ann.allow_comments !== false;

        window.editingImageUrls = ann.image_urls && Array.isArray(ann.image_urls) ? [...ann.image_urls] : [];
        window.editingAttachments = ann.attachments && Array.isArray(ann.attachments) ? [...ann.attachments] : [];
        window.renderEditingMedia();

        document.getElementById('ann-image-upload').value = '';
        document.getElementById('ann-file-upload').value = '';
        document.getElementById('new-image-preview-container').innerHTML = '';
        document.getElementById('new-file-preview-container').innerHTML = '';

        if (ann.scheduled_at) {
            const dt = new Date(ann.scheduled_at);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            document.getElementById('ann-scheduled-at').value = dt.toISOString().slice(0, 16);
        }
        if (ann.expires_at) document.getElementById('ann-expires-at').value = ann.expires_at.split('T')[0];

        toggleScheduleDate();
        updateLivePreview();
        document.getElementById('modal-title').innerText = "Edit Announcement";
        annModal.style.display = 'flex';
    };

    window.duplicateAnnouncement = (id) => {
        const annModal = document.getElementById('announcement-modal');
        if (!annModal) return;
        const ann = allAnnouncements.find(x => x.id === id);
        if (!ann) return;

        document.getElementById('announcement-id').value = ''; // new id
        document.getElementById('ann-title').value = ann.title + ' (Copy)';
        document.getElementById('ann-category').value = ann.category || 'General';
        document.getElementById('ann-audience').value = ann.audience_type || 'all_students';
        document.getElementById('ann-content').innerHTML = ann.content || '';
        document.getElementById('ann-status').value = 'Draft'; // always duplicate to draft
        document.getElementById('ann-allow-comments').checked = ann.allow_comments !== false;

        window.editingImageUrls = ann.image_urls && Array.isArray(ann.image_urls) ? [...ann.image_urls] : [];
        window.editingAttachments = ann.attachments && Array.isArray(ann.attachments) ? [...ann.attachments] : [];
        window.renderEditingMedia();

        document.getElementById('ann-image-upload').value = '';
        document.getElementById('ann-file-upload').value = '';
        document.getElementById('new-image-preview-container').innerHTML = '';
        document.getElementById('new-file-preview-container').innerHTML = '';

        document.getElementById('ann-scheduled-at').value = '';
        document.getElementById('ann-expires-at').value = '';

        toggleScheduleDate();
        updateLivePreview();
        document.getElementById('modal-title').innerText = "Duplicate Announcement";
        annModal.style.display = 'flex';
    };

    async function uploadMedia(file, folderPath) {
        if (!file) return null;
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = `${folderPath}/${fileName}`;
        const { error } = await window.supabaseClient.storage.from('announcements').upload(filePath, file);
        if (error) throw new Error(`Failed to upload ${file.name}`);
        const { data: publicUrlData } = window.supabaseClient.storage.from('announcements').getPublicUrl(filePath);
        return publicUrlData.publicUrl;
    }

    document.getElementById('btn-save-announcement')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-save-announcement');
        const id = document.getElementById('announcement-id').value;
        const status = document.getElementById('ann-status').value;
        const contentHtml = document.getElementById('ann-content').innerHTML.trim();
        const title = document.getElementById('ann-title').value.trim();

        if (!title || !contentHtml) {
            Swal.fire({ icon: 'warning', title: 'Missing Details', text: 'Please provide both a title and content.' });
            return;
        }

        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

        try {
            let finalImageUrls = [...window.editingImageUrls];
            let finalAttachments = [...window.editingAttachments];

            const imageFiles = document.getElementById('ann-image-upload').files;
            if (imageFiles && imageFiles.length > 0) {
                for (let i = 0; i < imageFiles.length; i++) {
                    const url = await uploadMedia(imageFiles[i], 'images');
                    finalImageUrls.push(url);
                }
            }

            const docFiles = document.getElementById('ann-file-upload').files;
            if (docFiles && docFiles.length > 0) {
                for (let i = 0; i < docFiles.length; i++) {
                    const url = await uploadMedia(docFiles[i], 'documents');
                    finalAttachments.push({ name: docFiles[i].name, url: url, size: (docFiles[i].size / 1024).toFixed(1) + ' KB' });
                }
            }

            const payload = {
                school_id: currentAdminSchoolId,
                author_id: adminId,
                title: title,
                category: document.getElementById('ann-category').value,
                audience_type: document.getElementById('ann-audience').value,
                content: contentHtml,
                status: status,
                allow_comments: document.getElementById('ann-allow-comments').checked,
                image_urls: finalImageUrls,
                attachments: finalAttachments,
                scheduled_at: status === 'Scheduled' ? new Date(document.getElementById('ann-scheduled-at').value).toISOString() : null,
                expires_at: document.getElementById('ann-expires-at').value ? new Date(document.getElementById('ann-expires-at').value).toISOString() : null,
                updated_at: new Date().toISOString()
            };

            let insertedId = id;
            if (id) {
                const { error } = await window.supabaseClient.from('announcements').update(payload).eq('id', id);
                if (error) throw error;
            } else {
                const { data, error } = await window.supabaseClient.from('announcements').insert([payload]).select('id').single();
                if (error) throw error;
                insertedId = data.id;
            }

            if (status === 'Published' && !id) {
                sendNotifications(payload.audience_type, payload.title); // Fire and forget so it doesn't block UI
            }

            try {
                await window.supabaseClient.from('audit_logs').insert([{
                    admin_id: adminId,
                    school_id: currentAdminSchoolId,
                    action: id ? 'Announcement edited' : (status === 'Published' ? 'Announcement published' : 'Announcement drafted'),
                    module: 'Announcements',
                    details: JSON.stringify({ title: payload.title, id: insertedId, status: status })
                }]);
            } catch (e) { }

            const annModal = document.getElementById('announcement-modal');
            if (annModal) annModal.style.display = 'none';
            Swal.fire({ icon: 'success', title: 'Saved!', timer: 1500, showConfirmButton: false });
            fetchAnnouncements();
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: err.message });
        } finally {
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save Announcement';
        }
    });

    // ==========================================
    // 8. COMMENT SYSTEM & MODERATION
    // ==========================================
    const commentsList = document.getElementById('comments-list');

    function moderateContent(text) {
        const forbiddenWords = ['fuck', 'shit', 'bitch', 'asshole', 'http://', 'https://', 'buy now', 'crypto', 'casino'];
        const textLower = text.toLowerCase();
        for (let word of forbiddenWords) {
            if (textLower.includes(word)) return { passed: false, reason: 'Contains inappropriate language, hate speech, or suspicious links.' };
        }
        if (/(.)\1{10,}/.test(text)) return { passed: false, reason: 'Contains spam-like repeated characters.' };
        return { passed: true };
    }

    window.loadComments = async (annId, commentsEnabled) => {
        const commentsList = document.getElementById('comments-list');
        const replyBox = document.getElementById('comment-input-area');
        const commentsHeader = document.getElementById('comments-count-header');

        if (!commentsList) return;

        if (!commentsEnabled) {
            if (replyBox) replyBox.style.display = 'none';
            if (commentsHeader) commentsHeader.innerText = `Comments (Closed)`;
        } else {
            if (replyBox) replyBox.style.display = 'block';
        }

        commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading comments...</div>`;

        try {
            const { data, error } = await window.supabaseClient
                .from('announcement_comments')
                .select(`id, content, created_at, user_id, is_pinned, is_hidden, profiles ( first_name, last_name, role, avatar_url )`)
                .eq('announcement_id', annId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (commentsHeader) commentsHeader.innerText = `Comments (${data.length})`;
            renderComments(data, commentsEnabled);
        } catch (err) {
            commentsList.innerHTML = `<div class="text-center text-red" style="padding: 20px;">Error loading comments. Ensure table exists.</div>`;
        }
    };

    function renderComments(comments, commentsEnabled) {
        if (!comments || comments.length === 0) {
            commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;">No comments yet.</div>`;
            return;
        }

        commentsList.innerHTML = '';
        comments.forEach(c => {
            const isMe = c.user_id === adminId;

            // Display proper Author name
            let authorName = "Unknown User";
            if (c.profiles) {
                authorName = `${c.profiles.first_name || ''} ${c.profiles.last_name || ''}`.trim();
                if (c.profiles.role === 'admin' || c.profiles.role === 'coordinator') authorName += ` <span class="badge-author">Staff</span>`;
            }

            const avatarUrl = c.profiles?.avatar_url || 'assets/default-avatar.png';

            let timeString = "";
            const diffMs = new Date() - new Date(c.created_at);
            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor(diffMs / (1000 * 60));
            if (diffHrs > 24) timeString = Math.floor(diffHrs / 24) + "d ago";
            else if (diffHrs > 0) timeString = diffHrs + "h ago";
            else timeString = diffMins === 0 ? "Just now" : diffMins + "m ago";

            const pinnedLabel = c.is_pinned ? `<span style="color:#f59e0b; font-size:11px; margin-right:8px;"><i class="fa-solid fa-thumbtack"></i> Pinned</span>` : '';
            const hiddenLabel = c.is_hidden ? `<span style="color:#ef4444; font-size:11px; margin-right:8px;"><i class="fa-solid fa-eye-slash"></i> Hidden</span>` : '';

            // Moderation Tools (ALWAYS DISPLAYED for Admin, regardless of who posted it)
            let modTools = `
                <button onclick="pinComment('${c.id}', ${c.is_pinned})" class="btn-comment-mod" style="color:#f59e0b;" title="Pin"><i class="fa-solid fa-thumbtack"></i> Pin</button>
                <button onclick="toggleHideComment('${c.id}', ${c.is_hidden || false})" class="btn-comment-mod" style="color:#64748b;" title="${c.is_hidden ? 'Unhide' : 'Hide'} Comment"><i class="fa-solid fa-eye${c.is_hidden ? '' : '-slash'}"></i> ${c.is_hidden ? 'Unhide' : 'Hide'}</button>
                ${isMe ? `<button onclick="editComment('${c.id}', '${c.content.replace(/'/g, "\\'")}')" class="btn-comment-mod" style="color:#3b82f6;" title="Edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
                <button onclick="deleteComment('${c.id}')" class="btn-comment-mod text-red" title="Delete Permanently"><i class="fa-regular fa-trash-can" style="color:#ef4444;"></i> Delete</button>
            `;

            const hiddenStyling = c.is_hidden ? 'opacity: 0.6; filter: grayscale(50%);' : '';
            const rawNameForReply = (c.profiles?.first_name || 'Student') + ' ' + (c.profiles?.last_name || '');

            const commentHtml = `
                <div class="comment-item" style="${hiddenStyling}">
                    <img src="${avatarUrl}" class="comment-avatar" alt="User" onerror="this.src='assets/default-avatar.png'">
                    <div class="comment-body-wrapper" style="flex: 1;">
                        <div class="comment-top-row" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span class="comment-author" style="font-size:13px; font-weight:600; color:var(--text-main);">${isMe ? "You" : authorName} ${pinnedLabel} ${hiddenLabel}</span>
                            <span class="comment-time" style="font-size:11px; color:#94a3b8;">${timeString}</span>
                        </div>
                        <div class="comment-text" style="${c.is_hidden ? 'text-decoration: line-through; color: #94a3b8;' : 'font-size:13px; color:#334155; line-height:1.5;'}">${c.content}</div>
                        <div class="comment-actions" style="display:flex; gap:12px; margin-top:6px; align-items:center;">
                            <button class="btn-comment-mod" onclick="replyToUser('${rawNameForReply.replace(/'/g, "\\'").trim()}')"><i class="fa-regular fa-comment"></i> Reply</button>
                            ${modTools}
                        </div>
                    </div>
                </div>
            `;

            commentsList.insertAdjacentHTML('beforeend', commentHtml);
        });
        commentsList.scrollTop = commentsList.scrollHeight;
    }

    window.replyToUser = (name) => {
        const input = document.getElementById('reply-input');
        if (input) {
            input.value = `@${name} ` + input.value;
            input.focus();
        }
    };

    window.toggleHideComment = async (id, currentState) => {
        try {
            await window.supabaseClient.from('announcement_comments').update({ is_hidden: !currentState }).eq('id', id);
            const annId = currentSelectedAnnId;
            const ann = allAnnouncements.find(a => a.id === annId);
            window.loadComments(annId, ann ? ann.allow_comments !== false : true);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to update visibility.' });
        }
    };

    window.pinComment = async (id, isPinned) => {
        await window.supabaseClient.from('announcement_comments').update({ is_pinned: !isPinned }).eq('id', id);
        const annId = currentSelectedAnnId;
        const ann = allAnnouncements.find(a => a.id === annId);
        window.loadComments(annId, ann ? ann.allow_comments !== false : true);
    };

    window.editComment = async (id, oldText) => {
        const { value: newText } = await Swal.fire({
            title: 'Edit Reply',
            input: 'textarea',
            inputValue: oldText,
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            customClass: { input: 'swal-custom-textarea' }
        });

        if (newText && newText !== oldText) {
            await window.supabaseClient.from('announcement_comments').update({ content: newText }).eq('id', id);
            const annId = currentSelectedAnnId;
            const ann = allAnnouncements.find(a => a.id === annId);
            window.loadComments(annId, ann ? ann.allow_comments !== false : true);
        }
    };

    document.getElementById('btn-send-reply')?.addEventListener('click', async () => {
        const input = document.getElementById('reply-input');
        const annId = currentSelectedAnnId;
        const text = input.value.trim();
        const btn = document.getElementById('btn-send-reply');

        if (!text || !annId) return;

        const moderation = moderateContent(text);
        if (!moderation.passed) {
            Swal.fire({ icon: 'error', title: 'Violation Detected', text: moderation.reason });
            return;
        }

        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        try {
            const payload = { announcement_id: annId, user_id: adminId, content: text };
            await window.supabaseClient.from('announcement_comments').insert([payload]);
            input.value = '';

            const ann = allAnnouncements.find(a => a.id === annId);
            window.loadComments(annId, ann ? ann.allow_comments !== false : true);
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to send reply.' });
        } finally {
            btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
    });

    window.deleteComment = async (commentId) => {
        const confirmAction = await Swal.fire({
            title: 'Delete Student Comment?',
            text: "Are you sure you want to permanently delete this student's comment? This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Yes, delete it!'
        });

        if (confirmAction.isConfirmed) {
            await window.supabaseClient.from('announcement_comments').delete().eq('id', commentId);
            const annId = currentSelectedAnnId;
            const ann = allAnnouncements.find(a => a.id === annId);
            window.loadComments(annId, ann ? ann.allow_comments !== false : true);
            Swal.fire({ icon: 'success', title: 'Deleted', text: 'The comment has been removed.', timer: 1500, showConfirmButton: false });
        }
    };

    // ==========================================
    // 10. NOTIFICATION HELPER
    // ==========================================
    async function sendNotifications(audience, title) {
        try {
            let query = window.supabaseClient.from('profiles').select('id').eq('school_id', currentAdminSchoolId);

            if (audience === 'approved_students') {
                query = query.eq('is_approved', true);
            } else if (audience.startsWith('prog_')) {
                query = query.eq('program', audience.replace('prog_', ''));
            }

            const { data: targetUsers, error } = await query;
            if (error || !targetUsers || targetUsers.length === 0) return;

            const userIds = targetUsers.map(u => u.id);

            const payload = {
                userIds: userIds,
                eventType: 'announcements',
                subject: 'New Announcement',
                message: `A new announcement has been published: ${title}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: #10b981;">New Announcement</h2>
                        <p>A new announcement has been published on the Grantee System:</p>
                        <blockquote style="border-left: 4px solid #10b981; padding-left: 10px; color: #475569;">
                            <strong>${title}</strong>
                        </blockquote>
                        <p>Log in to your student dashboard to read the full details.</p>
                    </div>
                `
            };

            await fetch('https://grantee-backend-n5f4.onrender.com/api/dispatch-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

        } catch (err) {
            console.error("Failed to send notification:", err);
        }
    }

    // ==========================================
    // 11. MEDIA VIEWER MODAL
    // ==========================================
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('fb-img') || e.target.classList.contains('detail-cover-image') || e.target.closest('.more-images-container')) {
            let imgSrc = e.target.src;
            if (e.target.closest('.more-images-container') && !e.target.src) {
                imgSrc = e.target.closest('.more-images-container').querySelector('img').src;
            }
            if (imgSrc) {
                const modal = document.getElementById('media-viewer-modal');
                if (!modal) return;
                document.getElementById('viewer-image').src = imgSrc;
                document.getElementById('viewer-image').style.display = 'block';
                document.getElementById('viewer-iframe').style.display = 'none';
                modal.style.display = 'flex';
            }
        }

        const fileBtn = e.target.closest('.btn-view-file');
        if (fileBtn) {
            e.preventDefault();
            const fileUrl = fileBtn.href;
            const modal = document.getElementById('media-viewer-modal');
            if (!modal) return;
            document.getElementById('viewer-iframe').src = fileUrl;
            document.getElementById('viewer-iframe').style.display = 'block';
            document.getElementById('viewer-image').style.display = 'none';
            modal.style.display = 'flex';
        }

        if (e.target.closest('#close-media-viewer') || e.target.id === 'media-viewer-modal') {
            document.getElementById('media-viewer-modal').style.display = 'none';
            document.getElementById('viewer-iframe').src = '';
            document.getElementById('viewer-image').src = '';
        }
    });

    // ==========================================
    // 12. MISSING ANNOUNCEMENT ACTIONS
    // ==========================================
    window.togglePin = async (id, isPinned) => {
        try {
            await window.supabaseClient.from('announcements').update({ is_pinned: !isPinned }).eq('id', id);

            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: !isPinned ? 'Announcement pinned.' : 'Announcement unpinned.',
                showConfirmButton: false,
                timer: 2000
            });
            fetchAnnouncements();
        } catch (err) {
            console.error("Error toggling pin:", err);
            Swal.fire('Error', 'Failed to update pin status.', 'error');
        }
    };

    window.toggleCommentsStatus = async (id, currentStatus) => {
        try {
            await window.supabaseClient.from('announcements').update({ allow_comments: !currentStatus }).eq('id', id);

            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: !currentStatus ? 'Comments enabled.' : 'Comments disabled.',
                showConfirmButton: false,
                timer: 2000
            });
            fetchAnnouncements();
        } catch (err) {
            console.error("Error toggling comments:", err);
            Swal.fire('Error', 'Failed to update comment settings.', 'error');
        }
    };

    window.archiveAnnouncement = async (id) => {
        try {
            await window.supabaseClient.from('announcements').update({ status: 'Archived' }).eq('id', id);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Announcement archived.',
                showConfirmButton: false,
                timer: 2000
            });
            fetchAnnouncements();
        } catch (err) {
            console.error("Error archiving:", err);
            Swal.fire('Error', 'Failed to archive announcement.', 'error');
        }
    };

    window.unarchiveAnnouncement = async (id) => {
        try {
            await window.supabaseClient.from('announcements').update({ status: 'Draft' }).eq('id', id);
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Announcement moved to drafts.',
                showConfirmButton: false,
                timer: 2000
            });
            fetchAnnouncements();
        } catch (err) {
            console.error("Error unarchiving:", err);
            Swal.fire('Error', 'Failed to unarchive announcement.', 'error');
        }
    };

    window.duplicateAnnouncement = async (id) => {
        try {
            const ann = allAnnouncements.find(a => a.id === id);
            if (!ann) return;

            const duplicate = {
                title: ann.title + ' - Copy',
                content: ann.content,
                category: ann.category,
                audience_type: ann.audience_type,
                status: 'Draft',
                allow_comments: ann.allow_comments,
                is_pinned: false,
                cover_image: ann.cover_image,
                attachments: ann.attachments,
                author_id: currentAdminId,
                school_id: currentAdminSchoolId
            };

            const { data, error } = await window.supabaseClient.from('announcements').insert([duplicate]).select();
            if (error) throw error;

            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Announcement duplicated.',
                showConfirmButton: false,
                timer: 2000
            });

            fetchAnnouncements();

            if (data && data[0]) {
                setTimeout(() => {
                    window.editAnnouncement(data[0].id);
                }, 1000);
            }

        } catch (err) {
            console.error("Error duplicating:", err);
            Swal.fire('Error', 'Failed to duplicate announcement.', 'error');
        }
    };

    window.deleteAnnouncement = async (id) => {
        const confirmDelete = await Swal.fire({
            title: 'Delete Announcement?',
            text: "This will permanently delete this announcement and all its comments. This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Yes, delete it!'
        });

        if (confirmDelete.isConfirmed) {
            try {
                await window.supabaseClient.from('announcement_comments').delete().eq('announcement_id', id);
                await window.supabaseClient.from('announcement_reads').delete().eq('announcement_id', id);
                await window.supabaseClient.from('announcements').delete().eq('id', id);

                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: 'Announcement deleted.',
                    showConfirmButton: false,
                    timer: 2000
                });
                fetchAnnouncements();

                const annModal = document.getElementById('announcement-modal');
                if (annModal && annModal.style.display !== 'none' && currentSelectedAnnId === id) {
                    annModal.style.display = 'none';
                }
            } catch (err) {
                console.error("Error deleting:", err);
                Swal.fire('Error', 'Failed to delete announcement.', 'error');
            }
        }
    };

    // ==========================================
    // 9. LIGHTBOX / MEDIA VIEWER LOGIC
    // ==========================================
    let lightboxImages = [];
    let lightboxCurrentIndex = 0;

    const modalViewer = document.getElementById('media-viewer-modal');
    const closeViewerBtn = document.getElementById('close-media-viewer');
    const viewerImg = document.getElementById('viewer-image');
    const viewerIframe = document.getElementById('viewer-iframe');
    const btnPrev = document.getElementById('prev-media');
    const btnNext = document.getElementById('next-media');
    const mediaCounter = document.getElementById('media-counter');

    function openLightbox(images, startIndex = 0) {
        if (!images || images.length === 0) return;
        lightboxImages = images;
        lightboxCurrentIndex = startIndex;
        showLightboxImage();
        if (modalViewer) {
            modalViewer.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    function showLightboxImage() {
        if (!lightboxImages || lightboxImages.length === 0) return;
        const url = lightboxImages[lightboxCurrentIndex];
        
        if (viewerImg) {
            viewerImg.src = url;
            viewerImg.style.display = 'block';
        }
        if (viewerIframe) viewerIframe.style.display = 'none';

        if (mediaCounter) {
            if (lightboxImages.length > 1) {
                mediaCounter.innerText = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;
                mediaCounter.style.display = 'block';
                if (btnPrev) btnPrev.style.display = lightboxCurrentIndex > 0 ? 'flex' : 'none';
                if (btnNext) btnNext.style.display = lightboxCurrentIndex < lightboxImages.length - 1 ? 'flex' : 'none';
            } else {
                mediaCounter.style.display = 'none';
                if (btnPrev) btnPrev.style.display = 'none';
                if (btnNext) btnNext.style.display = 'none';
            }
        }
    }

    if (closeViewerBtn) {
        closeViewerBtn.addEventListener('click', () => {
            if (modalViewer) modalViewer.style.display = 'none';
            if (viewerImg) viewerImg.src = '';
            document.body.style.overflow = '';
        });
    }

    if (btnPrev) {
        btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lightboxCurrentIndex > 0) {
                lightboxCurrentIndex--;
                showLightboxImage();
            }
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lightboxCurrentIndex < lightboxImages.length - 1) {
                lightboxCurrentIndex++;
                showLightboxImage();
            }
        });
    }

    document.addEventListener('click', (e) => {
        const fbImg = e.target.closest('.fb-img');
        const moreContainer = e.target.closest('.more-images-container');
        
        if (fbImg || moreContainer) {
            const card = e.target.closest('.social-card') || e.target.closest('.detail-card');
            if (!card) return;
            const annId = card.dataset.id;
            
            let targetAnn = null;
            if (!annId && card.classList.contains('detail-card')) {
                targetAnn = allAnnouncements.find(a => a.id === currentSelectedAnnId);
            } else if (annId) {
                targetAnn = allAnnouncements.find(a => a.id == annId);
            }

            if (targetAnn && targetAnn.image_urls && targetAnn.image_urls.length > 0) {
                let index = 0;
                let clickedImg = null;
                
                if (moreContainer) {
                    clickedImg = moreContainer.querySelector('img');
                } else if (fbImg) {
                    clickedImg = fbImg;
                }
                
                if (clickedImg) {
                    const src = clickedImg.getAttribute('src');
                    if (src) {
                        index = targetAnn.image_urls.findIndex(url => url.includes(src) || src.includes(url));
                    }
                }
                
                if (index === -1) index = 0;
                openLightbox(targetAnn.image_urls, index);
            }
        }
    });

    // Boot
    initProfile();
});