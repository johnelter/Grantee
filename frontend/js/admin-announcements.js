(async function () {

    document.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));

    // ==========================================
    // UI TOAST HELPER (TOP CENTER - EXACT DESIGN)
    // ==========================================
    function showUIToast(type = 'success', title = '', message = '') {
        let container = document.getElementById('custom-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'custom-toast-container';
            document.body.appendChild(container);
        }

        // Clean & normalize type
        type = (type || 'success').toLowerCase();
        if (!['success', 'error', 'info', 'warning'].includes(type)) {
            type = 'info';
        }

        // SVGs matching the visual design reference
        let iconSvg = '';
        if (type === 'success') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            if (!title) title = 'Success';
        } else if (type === 'error') {
            iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            if (!title) title = 'Error';
        } else if (type === 'info') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
            if (!title) title = 'Info';
        } else if (type === 'warning') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
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

        // Entrance animation
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

        // Auto dismiss after 3.5 seconds
        const autoDismissTimer = setTimeout(dismissToast, 3500);

        // Pause on hover
        toast.addEventListener('mouseenter', () => clearTimeout(autoDismissTimer));
        toast.addEventListener('mouseleave', () => {
            if (!isDismissed) {
                setTimeout(dismissToast, 2000);
            }
        });
    }
    window.showUIToast = showUIToast;
    window.showToast = showUIToast;

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
            const { data: profile } = await window.supabaseClient.from('profiles').select('*, schools(name)').eq('id', adminId).single();
            if (profile) {
                if (!['admin', 'coordinator'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;
                const schoolName = profile.schools ? profile.schools.name : 'Unassigned School';
                const fullName = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();

                const headerTitles = document.getElementById('header-titles-box');
                if (headerTitles) headerTitles.classList.remove('is-loading');

                const headerName = document.getElementById('header-name');
                if (headerName) headerName.innerText = fullName;

                if (profile.avatar_url) {
                    const headerAvatar = document.getElementById('header-avatar');
                    if (headerAvatar) headerAvatar.src = profile.avatar_url;
                }

                if (document.getElementById('admin-school-display')) {
                    document.getElementById('admin-school-display').innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>Assigned to: <strong>${schoolName}</strong></span>`;
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

                await runAutomatedStatusUpdates();
                fetchAnnouncements();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
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

        document.querySelectorAll('.stat-card.is-loading').forEach(c => c.classList.remove('is-loading'));
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
            container.innerHTML = `<div class="text-center text-muted" style="padding: 40px; border: 1px dashed var(--border-color); border-radius: 12px; background: var(--card-bg);">No announcements found.</div>`;
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
            let pinnedBadge = ann.is_pinned ? `<span class="tag-pinned"><i data-lucide="pin"></i> Pinned</span>` : '';

            // Check if content is long to add "See more"
            let tempDiv = document.createElement("div");
            tempDiv.innerHTML = ann.content || '';
            const plainText = tempDiv.textContent || tempDiv.innerText || "";
            const isLong = plainText.length > 250;

            let catIcon = "megaphone";
            let catClass = "cat-general";
            if (ann.category === 'Educational Assistance') {
                catIcon = "graduation-cap";
                catClass = "cat-assistance";
            } else if (ann.category === 'Reminder') {
                catIcon = "clock";
                catClass = "cat-reminder";
            } else if (ann.category === 'Event') {
                catIcon = "calendar";
                catClass = "cat-event";
            }

            const statusClass = `tag-status-${(ann.status || 'draft').toLowerCase()}`;
            const commentsPill = ann.allow_comments !== false ?
                `<span class="tag-pill tag-comments comments-open"><i data-lucide="message-square"></i> Comments Open</span>` :
                `<span class="tag-pill tag-comments comments-closed"><i data-lucide="lock"></i> Comments Closed</span>`;

            let coverHtml = window.generateImageGrid(ann.image_urls);

            const card = document.createElement('div');
            card.className = `social-card`;
            card.dataset.id = ann.id;

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-author-group">
                        <img src="${authorAvatar}" class="card-avatar" alt="${authorName}" onerror="this.src='assets/admin-avatar.png'">
                        <div class="card-author-meta">
                            <div class="card-author-title-row">
                                <span class="card-author-name">${authorName}</span>
                                <span class="tag-status-pill ${statusClass}">${ann.status}</span>
                                ${pinnedBadge}
                            </div>
                            <div class="card-author-date-row">
                                <span class="card-post-date">${dateStr}</span>
                            </div>
                        </div>
                    </div>
                    <div class="post-options-container">
                        <button type="button" class="btn-option btn-menu-toggle" data-target="${menuId}">
                            <i data-lucide="more-horizontal"></i>
                            <span>Options</span>
                        </button>
                        <div class="post-options-menu" id="${menuId}">
                            <button type="button" class="btn-edit-ann" data-id="${ann.id}"><i data-lucide="edit-3"></i> Edit Announcement</button>
                            <button type="button" class="btn-pin-ann" data-id="${ann.id}" data-pinned="${ann.is_pinned}"><i data-lucide="pin"></i> ${ann.is_pinned ? 'Unpin from Top' : 'Pin to Top'}</button>
                            <button type="button" class="btn-comments-ann" data-id="${ann.id}" data-state="${ann.allow_comments}"><i data-lucide="${ann.allow_comments !== false ? 'lock' : 'unlock'}"></i> ${ann.allow_comments !== false ? 'Close Comments' : 'Open Comments'}</button>
                            <button type="button" class="btn-duplicate-ann" data-id="${ann.id}"><i data-lucide="copy"></i> Duplicate</button>
                            ${ann.status === 'Archived' ? `<button type="button" class="btn-unarchive-ann" data-id="${ann.id}"><i data-lucide="archive-restore"></i> Unarchive</button>` : `<button type="button" class="btn-archive-ann" data-id="${ann.id}"><i data-lucide="archive"></i> Archive</button>`}
                            <div class="options-menu-divider"></div>
                            <button type="button" class="btn-delete-ann" data-id="${ann.id}"><i data-lucide="trash-2"></i> Delete</button>
                        </div>
                    </div>
                </div>
                <div class="card-tags-row">
                    <span class="tag-pill tag-audience"><i data-lucide="users"></i> ${audienceStr}</span>
                    <span class="tag-pill tag-category ${catClass}"><i data-lucide="${catIcon}"></i> ${ann.category || 'General'}</span>
                    ${commentsPill}
                </div>
                <h3 class="card-title">${ann.title}</h3>
                <div class="card-body">
                    <div class="card-text-content ${isLong ? 'card-text-truncated' : ''}" id="content-${ann.id}">
                        ${ann.content || ''}
                    </div>
                    ${isLong ? `<button type="button" class="btn-see-more" id="btn-see-more-${ann.id}" onclick="toggleSeeMore('${ann.id}')">See more</button>` : ''}
                </div>
                ${coverHtml}
                <div class="card-actions">
                    <button type="button" class="btn-comment-action" onclick="window.selectAnnouncement('${ann.id}')">
                        <i data-lucide="message-square"></i> Comments (${commentCount})
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
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
                <div class="attachment-box-readonly">
                    <div class="file-info">
                        <i data-lucide="file-text" class="file-icon"></i>
                        <div>
                            <span class="file-name" title="${file.name}">${file.name}</span>
                            <span class="file-size">${file.size || 'View File'}</span>
                        </div>
                    </div>
                    <a href="${file.url}" target="_blank" class="btn-view-file" title="View Document"><i data-lucide="eye"></i></a>
                </div>
            `).join('');

            attachmentsHtml = `
                <div class="detail-attachments-section">
                    <h4 class="detail-attachments-title">Attachments (${ann.attachments.length})</h4>
                    <div class="attachment-grid">${filesListHtml}</div>
                </div>
            `;
        }

        let audienceStr = ann.audience_type === 'all_enrolled_students' || ann.audience_type === 'all_students' ? 'All Enrolled Students' : 'Targeted';
        let pinnedBadge = ann.is_pinned ? `<span class="tag-pinned"><i data-lucide="pin"></i> Pinned</span>` : '';

        let catIcon = "megaphone";
        let catClass = "cat-general";
        if (ann.category === 'Educational Assistance') {
            catIcon = "graduation-cap";
            catClass = "cat-assistance";
        } else if (ann.category === 'Reminder') {
            catIcon = "clock";
            catClass = "cat-reminder";
        } else if (ann.category === 'Event') {
            catIcon = "calendar";
            catClass = "cat-event";
        }

        const statusClass = `tag-status-${(ann.status || 'draft').toLowerCase()}`;
        const commentsPill = ann.allow_comments !== false ?
            `<span class="tag-pill tag-comments comments-open"><i data-lucide="message-square"></i> Comments Open</span>` :
            `<span class="tag-pill tag-comments comments-closed"><i data-lucide="lock"></i> Comments Closed</span>`;

        detailContainer.innerHTML = `
            <div class="card-header">
                <div class="card-author-group">
                    <img src="${authorAvatar}" class="card-avatar" alt="${authorName}" onerror="this.src='assets/admin-avatar.png'">
                    <div class="card-author-meta">
                        <div class="card-author-title-row">
                            <span class="card-author-name">${authorName}</span>
                            <span class="tag-status-pill ${statusClass}">${ann.status}</span>
                            ${pinnedBadge}
                        </div>
                        <div class="card-author-date-row">
                            <span class="card-post-date">${dateStr}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-tags-row">
                <span class="tag-pill tag-audience"><i data-lucide="users"></i> ${audienceStr}</span>
                <span class="tag-pill tag-category ${catClass}"><i data-lucide="${catIcon}"></i> ${ann.category || 'General'}</span>
                ${commentsPill}
            </div>
            <h3 class="card-title">${ann.title}</h3>
            <div class="card-body" style="padding-top:0; padding-bottom: 16px;">
                <div class="card-text-content">
                    ${ann.content || ''}
                </div>
            </div>
            ${coverHtml}
            ${attachmentsHtml}
        `;

        loadComments(ann.id, ann.allow_comments !== false);

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

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
                if (menu.id !== targetId) menu.classList.remove('show');
            });
            const targetMenu = document.getElementById(targetId);
            if (targetMenu) targetMenu.classList.toggle('show');
            return;
        }

        if (!e.target.closest('.post-options-menu')) {
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
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
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
            window.editAnnouncement(editBtn.getAttribute('data-id'));
            return;
        }

        const pinBtn = e.target.closest('.btn-pin-ann');
        if (pinBtn) {
            e.preventDefault();
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
            window.togglePin(pinBtn.getAttribute('data-id'), pinBtn.getAttribute('data-pinned') === 'true');
            return;
        }

        const commBtn = e.target.closest('.btn-comments-ann');
        if (commBtn) {
            e.preventDefault();
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
            window.toggleCommentsStatus(commBtn.getAttribute('data-id'), commBtn.getAttribute('data-state') !== 'false');
            return;
        }

        const dupBtn = e.target.closest('.btn-duplicate-ann');
        if (dupBtn) {
            e.preventDefault();
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
            window.duplicateAnnouncement(dupBtn.getAttribute('data-id'));
            return;
        }

        const archiveBtn = e.target.closest('.btn-archive-ann');
        if (archiveBtn) {
            e.preventDefault();
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
            window.archiveAnnouncement(archiveBtn.getAttribute('data-id'));
            return;
        }

        const unarchiveBtn = e.target.closest('.btn-unarchive-ann');
        if (unarchiveBtn) {
            e.preventDefault();
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
            window.unarchiveAnnouncement(unarchiveBtn.getAttribute('data-id'));
            return;
        }

        const delBtn = e.target.closest('.btn-delete-ann');
        if (delBtn) {
            e.preventDefault();
            document.querySelectorAll('.post-options-menu').forEach(menu => menu.classList.remove('show'));
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
                    <button type="button" onclick="removeEditingImage(${index})" title="Remove Image"><i data-lucide="x"></i></button>
                </div>
            `;
        });

        fileContainer.innerHTML = '';
        window.editingAttachments.forEach((file, index) => {
            fileContainer.innerHTML += `
                <div class="edit-file-item">
                    <span><i data-lucide="file-text"></i> ${file.name}</span>
                    <button type="button" onclick="removeEditingFile(${index})" title="Remove File"><i data-lucide="x"></i></button>
                </div>
            `;
        });

        const imageUploadInput = document.getElementById('ann-image-upload');
        let newUrls = [];
        if (imageUploadInput && imageUploadInput.files) {
            newUrls = Array.from(imageUploadInput.files).map(f => URL.createObjectURL(f));
        }
        renderPreviewImageGrid([...window.editingImageUrls, ...newUrls]);

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    window.removeEditingImage = (index) => { window.editingImageUrls.splice(index, 1); window.renderEditingMedia(); };
    window.removeEditingFile = (index) => { window.editingAttachments.splice(index, 1); window.renderEditingMedia(); };

    const imageUpload = document.getElementById('ann-image-upload');
    const fileUpload = document.getElementById('ann-file-upload');

    imageUpload?.addEventListener('change', (e) => {
        const container = document.getElementById('new-image-preview-container');
        if (!container) return;
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
        if (!container) return;
        container.innerHTML = '';
        Array.from(e.target.files).forEach((file) => {
            const size = (file.size / 1024).toFixed(1) + ' KB';
            container.innerHTML += `
                <div class="attachment-card-upload">
                    <div class="file-info">
                        <i data-lucide="file-text" style="color:var(--nature-primary); width:18px; height:18px;"></i>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:12px; font-weight:600; color:var(--text-main);">${file.name}</span>
                            <span style="font-size:10px; color:var(--text-muted);">${size} &bull; Ready to upload</span>
                        </div>
                    </div>
                </div>
            `;
        });
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
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
        let catIcon = '<i data-lucide="megaphone"></i>';
        if (catVal === 'Educational Assistance') catIcon = '<i data-lucide="graduation-cap"></i>';
        if (catVal === 'Reminder') catIcon = '<i data-lucide="clock"></i>';
        if (catVal === 'Event') catIcon = '<i data-lucide="calendar"></i>';
        document.getElementById('preview-category').innerHTML = `${catIcon} ${catVal}`;

        document.getElementById('preview-audience').innerText = (audienceInput?.value === 'all_enrolled_students' || audienceInput?.value === 'all_students') ? 'All Students' : 'Targeted';
        document.getElementById('preview-status').innerText = statusInput?.value || 'Published';

        const commentsAllowed = commentsToggle?.checked !== false;
        const iconSpan = document.getElementById('preview-comment-icon');
        if (iconSpan) {
            iconSpan.parentElement.style.color = commentsAllowed ? 'var(--text-muted)' : 'var(--status-danger-text)';
            iconSpan.parentElement.innerHTML = commentsAllowed ? '<i data-lucide="message-square"></i> 0' : '<i data-lucide="lock"></i> Off';
        }

        let excerpt = "Start writing content to see a preview of the excerpt...";
        if (contentInput) {
            let tempDiv = document.createElement("div");
            tempDiv.innerHTML = contentInput.innerHTML;
            excerpt = tempDiv.textContent || tempDiv.innerText || excerpt;
            if (excerpt.length > 80 && excerpt !== "Start writing content to see a preview of the excerpt...") excerpt = excerpt.substring(0, 80) + '...';
        }
        document.getElementById('preview-excerpt').innerText = excerpt;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
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
            showUIToast('warning', 'Missing Details', 'Please provide both a title and content.');
            return;
        }

        btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> Saving...';

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
            showUIToast('success', 'Saved Successfully', id ? 'Announcement updated.' : 'Announcement published.');
            fetchAnnouncements();
        } catch (err) {
            showUIToast('error', 'Error Saving', err.message);
        } finally {
            btn.disabled = false; btn.innerHTML = '<i data-lucide="check"></i> Save Announcement';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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

        commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><span class="loading-spinner" style="display:inline-block; vertical-align:middle; margin-right:8px;"></span> Loading comments...</div>`;

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

            const pinnedLabel = c.is_pinned ? `<span class="comment-status-pill pinned"><i data-lucide="pin"></i> Pinned</span>` : '';
            const hiddenLabel = c.is_hidden ? `<span class="comment-status-pill hidden"><i data-lucide="eye-off"></i> Hidden</span>` : '';

            // Moderation Tools (ALWAYS DISPLAYED for Admin, regardless of who posted it)
            let modTools = `
                <button onclick="pinComment('${c.id}', ${c.is_pinned})" class="btn-comment-mod" style="color:${c.is_pinned ? 'var(--text-muted)' : 'var(--nature-accent)'};" title="${c.is_pinned ? 'Unpin' : 'Pin'}"><i data-lucide="pin"></i> ${c.is_pinned ? 'Unpin' : 'Pin'}</button>
                <button onclick="toggleHideComment('${c.id}', ${c.is_hidden || false})" class="btn-comment-mod" title="${c.is_hidden ? 'Unhide' : 'Hide'} Comment"><i data-lucide="${c.is_hidden ? 'eye' : 'eye-off'}"></i> ${c.is_hidden ? 'Unhide' : 'Hide'}</button>
                ${isMe ? `<button onclick="editComment('${c.id}', '${c.content.replace(/'/g, "\\'")}')" class="btn-comment-mod" title="Edit"><i data-lucide="edit-3"></i> Edit</button>` : ''}
                <button onclick="deleteComment('${c.id}')" class="btn-comment-mod text-red" title="Delete Permanently"><i data-lucide="trash-2"></i> Delete</button>
            `;

            const hiddenStyling = c.is_hidden ? 'opacity: 0.6; filter: grayscale(50%);' : '';
            const rawNameForReply = (c.profiles?.first_name || 'Student') + ' ' + (c.profiles?.last_name || '');

            const commentHtml = `
                <div class="comment-item" style="${hiddenStyling}">
                    <img src="${avatarUrl}" class="comment-avatar" alt="User" onerror="this.src='assets/default-avatar.png'">
                    <div class="comment-body-wrapper" style="flex: 1;">
                        <div class="comment-top-row">
                            <span class="comment-author">${isMe ? "You" : authorName} ${pinnedLabel} ${hiddenLabel}</span>
                            <span class="comment-time">${timeString}</span>
                        </div>
                        <div class="comment-text" style="${c.is_hidden ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${c.content}</div>
                        <div class="comment-actions">
                            <button class="btn-comment-mod" onclick="replyToUser('${rawNameForReply.replace(/'/g, "\\'").trim()}')"><i data-lucide="message-square"></i> Reply</button>
                            ${modTools}
                        </div>
                    </div>
                </div>
            `;

            commentsList.insertAdjacentHTML('beforeend', commentHtml);
        });
        commentsList.scrollTop = commentsList.scrollHeight;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
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
            showUIToast('info', 'Visibility Updated', !currentState ? 'Comment hidden.' : 'Comment unhidden.');
        } catch (err) {
            showUIToast('error', 'Error', 'Failed to update visibility.');
        }
    };

    window.pinComment = async (id, isPinned) => {
        try {
            await window.supabaseClient.from('announcement_comments').update({ is_pinned: !isPinned }).eq('id', id);
            const annId = currentSelectedAnnId;
            const ann = allAnnouncements.find(a => a.id === annId);
            window.loadComments(annId, ann ? ann.allow_comments !== false : true);
            showUIToast('success', !isPinned ? 'Comment Pinned' : 'Comment Unpinned', !isPinned ? 'Comment pinned to the top.' : 'Comment unpinned.');
        } catch (err) {
            showUIToast('error', 'Error', 'Failed to update comment pin.');
        }
    };

    window.editComment = async (id, oldText) => {
        const { value: newText } = await Swal.fire({
            title: 'Edit Reply',
            input: 'textarea',
            inputValue: oldText,
            showCancelButton: true,
            confirmButtonText: 'Save Changes',
            cancelButtonText: 'Cancel',
            customClass: {
                popup: 'swal-nature-popup',
                input: 'swal-custom-textarea',
                confirmButton: 'swal-nature-confirm',
                cancelButton: 'swal-nature-cancel'
            }
        });

        if (newText !== undefined && newText !== null && newText.trim() !== '' && newText !== oldText) {
            try {
                await window.supabaseClient.from('announcement_comments').update({ content: newText.trim() }).eq('id', id);
                const annId = currentSelectedAnnId;
                const ann = allAnnouncements.find(a => a.id === annId);
                window.loadComments(annId, ann ? ann.allow_comments !== false : true);
                showUIToast('success', 'Comment Updated', 'Your reply has been edited.');
            } catch (err) {
                showUIToast('error', 'Error', 'Failed to edit reply.');
            }
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
            showUIToast('error', 'Violation Detected', moderation.reason);
            return;
        }

        btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span>';
        try {
            const payload = { announcement_id: annId, user_id: adminId, content: text };
            await window.supabaseClient.from('announcement_comments').insert([payload]);
            input.value = '';

            const ann = allAnnouncements.find(a => a.id === annId);
            window.loadComments(annId, ann ? ann.allow_comments !== false : true);
            showUIToast('success', 'Comment Posted', 'Your reply has been posted.');
        } catch (err) {
            showUIToast('error', 'Error', 'Failed to send reply.');
        } finally {
            btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i>';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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
            confirmButtonText: 'Yes, delete it!',
            customClass: {
                popup: 'swal-nature-popup'
            }
        });

        if (confirmAction.isConfirmed) {
            try {
                await window.supabaseClient.from('announcement_comments').delete().eq('id', commentId);
                const annId = currentSelectedAnnId;
                const ann = allAnnouncements.find(a => a.id === annId);
                window.loadComments(annId, ann ? ann.allow_comments !== false : true);
                showUIToast('success', 'Comment Deleted', 'The comment has been removed.');
            } catch (err) {
                showUIToast('error', 'Error', 'Failed to delete comment.');
            }
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

            showUIToast('success', !isPinned ? 'Announcement Pinned' : 'Announcement Unpinned', !isPinned ? 'Announcement pinned to top.' : 'Announcement unpinned.');
            fetchAnnouncements();
        } catch (err) {
            console.error("Error toggling pin:", err);
            showUIToast('error', 'Error', 'Failed to update pin status.');
        }
    };

    window.toggleCommentsStatus = async (id, currentStatus) => {
        try {
            await window.supabaseClient.from('announcements').update({ allow_comments: !currentStatus }).eq('id', id);

            showUIToast('success', 'Comments Updated', !currentStatus ? 'Comments have been enabled.' : 'Comments have been disabled.');
            fetchAnnouncements();
        } catch (err) {
            console.error("Error toggling comments:", err);
            showUIToast('error', 'Error', 'Failed to update comment settings.');
        }
    };

    window.archiveAnnouncement = async (id) => {
        try {
            await window.supabaseClient.from('announcements').update({ status: 'Archived' }).eq('id', id);
            showUIToast('info', 'Announcement Archived', 'Post moved to archives.');
            fetchAnnouncements();
        } catch (err) {
            console.error("Error archiving:", err);
            showUIToast('error', 'Error', 'Failed to archive announcement.');
        }
    };

    window.unarchiveAnnouncement = async (id) => {
        try {
            await window.supabaseClient.from('announcements').update({ status: 'Draft' }).eq('id', id);
            showUIToast('success', 'Announcement Restored', 'Post restored to drafts.');
            fetchAnnouncements();
        } catch (err) {
            console.error("Error unarchiving:", err);
            showUIToast('error', 'Error', 'Failed to unarchive announcement.');
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
            confirmButtonText: 'Yes, delete it!',
            customClass: {
                popup: 'swal-nature-popup'
            }
        });

        if (confirmDelete.isConfirmed) {
            try {
                await window.supabaseClient.from('announcement_comments').delete().eq('announcement_id', id);
                await window.supabaseClient.from('announcement_reads').delete().eq('announcement_id', id);
                await window.supabaseClient.from('announcements').delete().eq('id', id);

                showUIToast('success', 'Announcement Deleted', 'Post has been permanently deleted.');
                fetchAnnouncements();

                const annModal = document.getElementById('announcement-modal');
                if (annModal && annModal.style.display !== 'none' && currentSelectedAnnId === id) {
                    annModal.style.display = 'none';
                }
            } catch (err) {
                console.error("Error deleting:", err);
                showUIToast('error', 'Error', 'Failed to delete announcement.');
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
})();
