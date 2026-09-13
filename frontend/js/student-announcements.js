document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 0. CUSTOM UI TOAST SYSTEM (TOP CENTER)
    // ==========================================
    function showUIToast(type = 'success', title = '', message = '') {
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

        const autoDismissTimer = setTimeout(dismissToast, 3500);

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
    // 0.1 MODAL INJECTION HELPER (Guarantees modals exist)
    // ==========================================
    function ensureAnnouncementModals() {
        let modal = document.getElementById('view-announcement-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'view-announcement-modal';
            modal.className = 'announcement-modal-overlay';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="announcement-modal-card">
                    <div class="modal-header">
                        <div class="modal-header-title-box">
                            <i data-lucide="message-square-quote" class="modal-header-icon"></i>
                            <h3 class="modal-title">Announcement Post & Discussion</h3>
                        </div>
                        <button type="button" class="close-btn" id="modal-close-view" aria-label="Close dialog">
                            <i data-lucide="x"></i>
                        </button>
                    </div>

                    <div class="modal-body-scroll">
                        <div id="announcement-detail-view" class="announcement-detail-box"></div>

                        <div class="comments-section">
                            <div class="comments-header" id="comments-count-header">
                                <div class="comments-header-left">
                                    <i data-lucide="messages-square"></i>
                                    <span>Comments (0)</span>
                                </div>
                                <span class="comments-guideline-pill"><i data-lucide="shield-check"></i> Monitored Discussion</span>
                            </div>

                            <div class="comments-list" id="comments-list">
                                <div class="comments-loading-state">
                                    <span class="loading-spinner"></span> Loading comments...
                                </div>
                            </div>

                            <div class="comment-input-area" id="comment-input-area">
                                <div class="comment-input-card">
                                    <input type="text" id="reply-input" placeholder="Write a comment or ask a question..." autocomplete="off">
                                    <button class="btn-send-reply" id="btn-send-reply" title="Post comment">
                                        <i data-lucide="send"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const mainContainer = document.querySelector('.main-content') || document.body;
            mainContainer.appendChild(modal);
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }

        let mediaViewer = document.getElementById('media-viewer-modal');
        if (!mediaViewer) {
            mediaViewer = document.createElement('div');
            mediaViewer.id = 'media-viewer-modal';
            mediaViewer.className = 'media-viewer-overlay';
            mediaViewer.style.display = 'none';
            mediaViewer.innerHTML = `
                <div class="media-viewer-wrapper">
                    <button id="close-media-viewer" class="btn-close-viewer" title="Close"><i data-lucide="x"></i></button>
                    
                    <button id="prev-media" class="btn-nav-media btn-prev" title="Previous Image" style="display: none;">
                        <i data-lucide="chevron-left"></i>
                    </button>
                    
                    <div class="media-content-container">
                        <img id="viewer-image" class="lightbox-img" alt="Announcement Media Preview" style="display: none;">
                        <iframe id="viewer-iframe" class="lightbox-frame" title="Attachment Document Preview" style="display: none;"></iframe>
                    </div>

                    <button id="next-media" class="btn-nav-media btn-next" title="Next Image" style="display: none;">
                        <i data-lucide="chevron-right"></i>
                    </button>

                    <div id="media-counter" class="media-counter" style="display: none;">1 / 1</div>
                </div>
            `;
            const mainContainer = document.querySelector('.main-content') || document.body;
            mainContainer.appendChild(mediaViewer);
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
        return modal;
    }
    ensureAnnouncementModals();

    // ==========================================
    // 1. AUTH CHECK & STATE INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login-student.html';
        return;
    }

    const studentId = session.user.id;
    let studentProfile = null;
    let studentApplications = [];
    let allAnnouncements = [];
    let readAnnouncementIds = new Set();

    const urlParams = new URLSearchParams(window.location.search);
    let currentSelectedId = urlParams.get('id');

    let searchQuery = '';
    let sortMode = 'desc';

    // ==========================================
    // 2. LOAD PROFILE, APPLICATIONS & READ STATUS
    // ==========================================
    async function initializeApp() {
        try {
            ensureAnnouncementModals();

            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profile) {
                studentProfile = profile;
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                const fullName = `${firstName} ${lastName}`.trim();
                const progName = profile.program || 'Student Profile';

                sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                    id: studentId,
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));

                const nameEl = document.getElementById('header-name');
                const progEl = document.getElementById('header-program');
                const avatarEl = document.getElementById('header-avatar');
                const titlesBox = document.getElementById('header-titles-box');

                if (nameEl) nameEl.innerText = fullName;
                if (progEl) progEl.innerText = progName;
                if (avatarEl && profile.avatar_url) avatarEl.src = profile.avatar_url;
                if (titlesBox) titlesBox.classList.remove('is-loading');
            } else if (profileError) {
                console.warn("Could not load profile details:", profileError);
                studentProfile = { id: studentId };
            }

            const { data: appData } = await window.supabaseClient
                .from('applications')
                .select('status, scholarships(title)')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });

            if (appData) {
                studentApplications = appData;
            }

            const { data: readData, error: readError } = await window.supabaseClient
                .from('announcement_reads')
                .select('announcement_id')
                .eq('student_id', studentId);

            if (readData) {
                readAnnouncementIds = new Set(readData.map(r => r.announcement_id));
            } else if (readError) {
                console.warn("Could not load read statuses:", readError);
            }

            await fetchAnnouncements();
            setupRealtimeAnnouncements();

            if (currentSelectedId) {
                setTimeout(() => {
                    openAnnouncementModal(currentSelectedId);
                }, 300);
            }

        } catch (error) {
            console.error("Error initializing app:", error);
        }
    }

    // ==========================================
    // 3. FETCH & FILTER ANNOUNCEMENTS
    // ==========================================
    async function fetchAnnouncements(isSilent = false) {
        try {
            // Refresh read statuses in background
            try {
                const { data: readData } = await window.supabaseClient
                    .from('announcement_reads')
                    .select('announcement_id')
                    .eq('student_id', studentId);
                if (readData) {
                    readAnnouncementIds = new Set(readData.map(r => r.announcement_id));
                }
            } catch (e) { }

            let query = window.supabaseClient
                .from('announcements')
                .select(`
                    *, 
                    profiles:author_id ( first_name, last_name, avatar_url, role ), 
                    announcement_comments ( id )
                `)
                .eq('status', 'Published')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });

            if (studentProfile && studentProfile.school_id) {
                query = query.eq('school_id', studentProfile.school_id);
            }

            const { data, error } = await query;

            if (error) throw error;
            if (!data) {
                allAnnouncements = [];
                updateStatsOverview([]);
                applyFiltersAndRender();
                return;
            }

            allAnnouncements = data.filter(ann => isAudienceMatch(ann, studentProfile, studentApplications));

            updateStatsOverview(allAnnouncements);
            applyFiltersAndRender();

        } catch (err) {
            console.error("Error fetching announcements:", err);
            if (!isSilent) {
                const container = document.getElementById('announcements-list-container');
                if (container && (!allAnnouncements || allAnnouncements.length === 0)) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 48px 24px; background: var(--card-bg); border-radius: 16px; border: 1px dashed var(--border-color); color: var(--danger-color);">
                            <i data-lucide="alert-triangle" style="width: 32px; height: 32px; margin: 0 auto 12px auto; display: block;"></i>
                            <p style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">Failed to load announcements</p>
                            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Please check your connection and refresh the page.</p>
                        </div>
                    `;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                }
            }
        }
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
                return applications.some(app => app.status && app.status.toLowerCase() === 'approved');
            }
            return profile && profile.is_approved === true;
        }

        if (audStr.includes('pending')) {
            if (applications && applications.length > 0) {
                return applications.some(app => app.status && app.status.toLowerCase() === 'pending');
            }
            return profile && profile.is_approved === false;
        }

        if (audStr.includes('rejected')) {
            if (applications && applications.length > 0) {
                return applications.some(app => app.status && app.status.toLowerCase() === 'rejected');
            }
            return false;
        }

        return false;
    }

    // ==========================================
    // 4. STATS OVERVIEW CONTROLLER
    // ==========================================
    function updateStatsOverview(announcements) {
        const totalCount = announcements.length;
        const unreadCount = announcements.filter(a => !readAnnouncementIds.has(a.id)).length;
        
        const categoriesSet = new Set();
        announcements.forEach(a => {
            if (a.category) categoriesSet.add(a.category.toLowerCase().trim());
        });
        const categoriesCount = categoriesSet.size;

        const discussionsCount = announcements.filter(a => a.allow_comments !== false).length;

        const statTotal = document.getElementById('stat-total');
        const statUnread = document.getElementById('stat-unread');
        const statCategories = document.getElementById('stat-categories');
        const statDiscussions = document.getElementById('stat-discussions');

        if (statTotal) { statTotal.innerText = totalCount; statTotal.classList.remove('is-loading'); }
        if (statUnread) { statUnread.innerText = unreadCount; statUnread.classList.remove('is-loading'); }
        if (statCategories) { statCategories.innerText = categoriesCount; statCategories.classList.remove('is-loading'); }
        if (statDiscussions) { statDiscussions.innerText = discussionsCount; statDiscussions.classList.remove('is-loading'); }
    }

    // ==========================================
    // 5. FILTERING & SORTING
    // ==========================================
    function applyFiltersAndRender() {
        const catFilter = document.getElementById('filter-category')?.value || 'all';
        const sortSelect = document.getElementById('filter-sort')?.value || 'desc';

        let filtered = allAnnouncements.filter(a => {
            const matchesSearch = !searchQuery || 
                (a.title && a.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (a.content && a.content.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCategory = catFilter === 'all' || (a.category && a.category.toLowerCase() === catFilter.toLowerCase());
            return matchesSearch && matchesCategory;
        });

        filtered.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortSelect === 'desc' ? dateB - dateA : dateA - dateB;
        });

        // Always pin pinned posts to top
        filtered.sort((a, b) => (b.is_pinned === true) - (a.is_pinned === true));
        renderFeed(filtered);
    }

    document.getElementById('filter-category')?.addEventListener('change', applyFiltersAndRender);
    document.getElementById('filter-sort')?.addEventListener('change', applyFiltersAndRender);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            applyFiltersAndRender();
        });
    }

    // ==========================================
    // 6. MULTI-IMAGE GRID HELPER
    // ==========================================
    window.generateImageGrid = (urls) => {
        if (!urls) return '';
        if (typeof urls === 'string') {
            try {
                urls = JSON.parse(urls);
            } catch (e) {
                urls = [urls];
            }
        }
        if (!Array.isArray(urls) || urls.length === 0) return '';
        const count = urls.length;
        let imagesHtml = '';
        let layoutClass = '';

        if (count === 1) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img" alt="Announcement Image" loading="lazy">`;
            layoutClass = 'fb-layout-1';
        } else if (count === 2) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img" loading="lazy"><img src="${urls[1]}" class="fb-img" loading="lazy">`;
            layoutClass = 'fb-layout-2';
        } else if (count === 3) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img span-top" loading="lazy"><img src="${urls[1]}" class="fb-img" loading="lazy"><img src="${urls[2]}" class="fb-img" loading="lazy">`;
            layoutClass = 'fb-layout-3';
        } else if (count === 4) {
            imagesHtml = `<img src="${urls[0]}" class="fb-img" loading="lazy"><img src="${urls[1]}" class="fb-img" loading="lazy"><img src="${urls[2]}" class="fb-img" loading="lazy"><img src="${urls[3]}" class="fb-img" loading="lazy">`;
            layoutClass = 'fb-layout-4';
        } else {
            imagesHtml = `
                <img src="${urls[0]}" class="fb-img" loading="lazy">
                <img src="${urls[1]}" class="fb-img" loading="lazy">
                <img src="${urls[2]}" class="fb-img" loading="lazy">
                <img src="${urls[3]}" class="fb-img" loading="lazy">
            `;
            if (count === 5) {
                imagesHtml += `<img src="${urls[4]}" class="fb-img" loading="lazy">`;
            } else {
                imagesHtml += `<div class="more-images-container" data-more="+${count - 4}"><img src="${urls[4]}" class="fb-img" loading="lazy"></div>`;
            }
            layoutClass = 'fb-layout-5';
        }

        return `<div class="fb-layout ${layoutClass}">${imagesHtml}</div>`;
    };

    // ==========================================
    // 7. SOCIAL FEED RENDERER
    // ==========================================
    function renderFeed(data) {
        const container = document.getElementById('announcements-list-container');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px 24px; background: var(--card-bg); border-radius: 18px; border: 1px dashed var(--border-color); color: var(--text-muted);">
                    <i data-lucide="inbox" style="width: 36px; height: 36px; margin: 0 auto 12px auto; display: block; color: var(--border-dark);"></i>
                    <h3 style="font-size: 16px; font-weight: 700; color: var(--text-heading); margin-bottom: 4px;">No Announcements Found</h3>
                    <p style="font-size: 13px; margin: 0;">There are no announcements matching your current filters.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        container.innerHTML = '';
        data.forEach(ann => {
            const isRead = readAnnouncementIds.has(ann.id);
            const dateStr = new Date(ann.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

            let authorName = "Scholarship Office";
            let authorAvatar = "assets/admin-avatar.png";
            if (ann.profiles) {
                authorName = `${ann.profiles.first_name || ''} ${ann.profiles.last_name || ''}`.trim();
                if (ann.profiles.avatar_url) authorAvatar = ann.profiles.avatar_url;
            }

            const commentCount = ann.announcement_comments ? ann.announcement_comments.length : 0;
            const newBadge = !isRead ? `<span class="badge-new-pill">New</span>` : '';
            const pinnedBadge = ann.is_pinned ? `<span class="tag-badge tag-pinned"><i data-lucide="pin"></i> Pinned</span>` : '';

            let catClass = 'tag-category-general';
            let catIcon = 'bullhorn';
            const catLower = (ann.category || '').toLowerCase();
            if (catLower.includes('educational') || catLower.includes('assistance') || catLower.includes('scholarship')) {
                catClass = 'tag-category-edu';
                catIcon = 'graduation-cap';
            } else if (catLower.includes('reminder')) {
                catClass = 'tag-category-reminder';
                catIcon = 'clock';
            } else if (catLower.includes('event')) {
                catClass = 'tag-category-event';
                catIcon = 'calendar';
            }

            const commentsOpen = ann.allow_comments !== false && ann.allow_comments !== 'false' && ann.allow_comments !== 0;
            const commentsBadge = commentsOpen ? 
                `<span class="tag-badge tag-comments-open"><i data-lucide="messages-square"></i> Comments Open</span>` : 
                `<span class="tag-badge tag-comments-closed"><i data-lucide="lock"></i> Comments Closed</span>`;

            let tempDiv = document.createElement("div");
            tempDiv.innerHTML = ann.content || '';
            const plainText = tempDiv.textContent || tempDiv.innerText || "";
            const isLong = plainText.length > 250;

            let rawImages = ann.image_urls;
            if (typeof rawImages === 'string') {
                try {
                    rawImages = JSON.parse(rawImages);
                } catch (e) {
                    rawImages = rawImages ? [rawImages] : [];
                }
            }
            const coverHtml = window.generateImageGrid(rawImages);

            const card = document.createElement('div');
            card.className = `social-card ${ann.is_pinned ? 'is-pinned-card' : ''}`;
            card.dataset.id = ann.id;

            card.innerHTML = `
                <div class="card-header-wrapper">
                    <div class="card-author-row">
                        <img src="${authorAvatar}" class="card-avatar" alt="${authorName}" onerror="this.src='assets/admin-avatar.png'">
                        <div class="card-author-meta">
                            <div class="author-name-line">
                                <span class="author-name-text">${authorName}</span>
                                <span class="author-role-badge">Coordinator</span>
                            </div>
                            <span class="post-time-meta">${dateStr}</span>
                        </div>
                    </div>
                    ${newBadge}
                </div>

                <div class="card-tags-row">
                    ${pinnedBadge}
                    <span class="tag-badge ${catClass}"><i data-lucide="${catIcon}"></i> ${ann.category || 'General'}</span>
                    ${commentsBadge}
                </div>

                <h3 class="card-title">${ann.title}</h3>

                <div class="card-body">
                    <div class="card-text-content ${isLong ? 'card-text-truncated' : ''}" id="content-${ann.id}">
                        ${ann.content || ''}
                    </div>
                    ${isLong ? `<button class="btn-see-more" id="btn-see-more-${ann.id}" onclick="toggleSeeMore('${ann.id}')">See more</button>` : ''}
                </div>

                ${coverHtml}

                <div class="card-actions">
                    <button type="button" class="btn-comment-action" data-id="${ann.id}" onclick="openAnnouncementModal('${ann.id}')">
                        <i data-lucide="message-square"></i>
                        <span>Comments (${commentCount})</span>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

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

    // ==========================================
    // 8. ANNOUNCEMENT POST & COMMENTS MODAL
    // ==========================================
    window.openAnnouncementModal = async (id) => {
        try {
            currentSelectedId = id;
            ensureAnnouncementModals();

            let activeAnn = allAnnouncements.find(a => String(a.id) === String(id));
            if (!activeAnn) {
                // Fallback direct Supabase fetch
                const { data, error } = await window.supabaseClient
                    .from('announcements')
                    .select(`
                        *, 
                        profiles:author_id ( first_name, last_name, avatar_url, role ), 
                        announcement_comments ( id )
                    `)
                    .eq('id', id)
                    .single();
                if (data && !error) {
                    activeAnn = data;
                }
            }

            if (!activeAnn) {
                console.warn("Announcement not found for ID:", id);
                return;
            }

            const detailContainer = document.getElementById('announcement-detail-view');
            const modal = document.getElementById('view-announcement-modal');
            if (!detailContainer || !modal) return;

            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            // Mark as read in real-time
            if (!readAnnouncementIds.has(id)) {
                readAnnouncementIds.add(id);
                const card = document.querySelector(`.social-card[data-id="${id}"]`);
                if (card) {
                    const newBadge = card.querySelector('.badge-new-pill');
                    if (newBadge) newBadge.remove();
                }
                updateStatsOverview(allAnnouncements);
                window.supabaseClient.from('announcement_reads').insert([{ student_id: studentId, announcement_id: id }]).then();
            }

            const dateStr = new Date(activeAnn.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

            let authorName = "Scholarship Office";
            let authorAvatar = "assets/admin-avatar.png";
            if (activeAnn.profiles) {
                authorName = `${activeAnn.profiles.first_name || ''} ${activeAnn.profiles.last_name || ''}`.trim();
                if (activeAnn.profiles.avatar_url) authorAvatar = activeAnn.profiles.avatar_url;
            }

            const pinnedBadge = activeAnn.is_pinned ? `<span class="tag-badge tag-pinned"><i data-lucide="pin"></i> Pinned</span>` : '';

            let catClass = 'tag-category-general';
            let catIcon = 'bullhorn';
            const catLower = (activeAnn.category || '').toLowerCase();
            if (catLower.includes('educational') || catLower.includes('assistance') || catLower.includes('scholarship')) {
                catClass = 'tag-category-edu';
                catIcon = 'graduation-cap';
            } else if (catLower.includes('reminder')) {
                catClass = 'tag-category-reminder';
                catIcon = 'clock';
            } else if (catLower.includes('event')) {
                catClass = 'tag-category-event';
                catIcon = 'calendar';
            }

            // Safe parsing of image_urls
            let imageUrls = activeAnn.image_urls;
            if (typeof imageUrls === 'string') {
                try {
                    imageUrls = JSON.parse(imageUrls);
                } catch (e) {
                    imageUrls = imageUrls ? [imageUrls] : [];
                }
            }
            if (!Array.isArray(imageUrls)) imageUrls = [];

            const coverHtml = window.generateImageGrid(imageUrls);

            // Safe parsing of attachments
            let attachments = activeAnn.attachments;
            if (typeof attachments === 'string') {
                try {
                    attachments = JSON.parse(attachments);
                } catch (e) {
                    attachments = [];
                }
            }
            if (!Array.isArray(attachments)) attachments = [];

            let attachmentsHtml = '';
            if (attachments.length > 0) {
                const filesList = attachments.map(file => `
                    <div class="attachment-box-readonly">
                        <div class="file-info">
                            <i data-lucide="file-text"></i>
                            <div>
                                <span class="file-name" title="${file.name || 'Attachment'}">${file.name || 'Attachment'}</span>
                                <span class="file-size">${file.size || 'Attachment document'}</span>
                            </div>
                        </div>
                        <a href="${file.url || file.file_url || '#'}" target="_blank" class="btn-view-file" title="View document">
                            <i data-lucide="external-link"></i>
                        </a>
                    </div>
                `).join('');

                attachmentsHtml = `
                    <div class="detail-attachments-section">
                        <h4 class="detail-attachments-title">
                            <i data-lucide="paperclip" style="width: 15px; height: 15px; color: var(--fern-green);"></i>
                            Attachments (${attachments.length})
                        </h4>
                        <div class="attachment-grid">${filesList}</div>
                    </div>
                `;
            }

            detailContainer.innerHTML = `
                <div class="card-header-wrapper" style="padding: 0 0 14px 0;">
                    <div class="card-author-row">
                        <img src="${authorAvatar}" class="card-avatar" alt="${authorName}" onerror="this.src='assets/admin-avatar.png'">
                        <div class="card-author-meta">
                            <div class="author-name-line">
                                <span class="author-name-text">${authorName}</span>
                                <span class="author-role-badge">Coordinator</span>
                            </div>
                            <span class="post-time-meta">${dateStr}</span>
                        </div>
                    </div>
                </div>

                <div class="card-tags-row" style="padding: 0 0 14px 0;">
                    ${pinnedBadge}
                    <span class="tag-badge ${catClass}"><i data-lucide="${catIcon}"></i> ${activeAnn.category || 'General'}</span>
                </div>

                <h3 class="card-title" style="padding: 0 0 12px 0; font-size: 20px;">${activeAnn.title}</h3>

                <div class="card-body" style="padding: 0 0 16px 0;">
                    <div class="card-text-content">
                        ${activeAnn.content || 'No description provided.'}
                    </div>
                </div>

                ${coverHtml}
                ${attachmentsHtml}
            `;

            // Reset input and send button state unconditionally
            const sendBtn = document.getElementById('btn-send-reply');
            const inputEl = document.getElementById('reply-input');
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i data-lucide="send"></i>';
            }
            if (inputEl) {
                inputEl.disabled = false;
                inputEl.value = '';
            }

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            const isCommentsAllowed = activeAnn.allow_comments !== false && activeAnn.allow_comments !== 'false' && activeAnn.allow_comments !== 0;
            loadComments(id, isCommentsAllowed);
        } catch (modalErr) {
            console.error("Error opening announcement modal:", modalErr);
        }
    };

    window.closeAnnouncementModal = () => {
        const modal = document.getElementById('view-announcement-modal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
        currentSelectedId = null;

        const sendBtn = document.getElementById('btn-send-reply');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i data-lucide="send"></i>';
        }
    };

    // ==========================================
    // 9. COMMENTS DISCUSSION ENGINE
    // ==========================================
    async function loadComments(announcementId, isAllowed = true) {
        const commentsHeader = document.getElementById('comments-count-header');
        const commentsList = document.getElementById('comments-list');
        const commentInputArea = document.getElementById('comment-input-area');

        if (!commentsList) return;

        commentsList.innerHTML = `<div class="comments-loading-state"><span class="loading-spinner"></span> Loading comments...</div>`;

        if (!isAllowed) {
            if (commentInputArea) commentInputArea.classList.add('hidden');
            if (commentsHeader) {
                commentsHeader.innerHTML = `
                    <div class="comments-header-left">
                        <i data-lucide="lock" style="color: var(--danger-color);"></i>
                        <span>Comments (Closed)</span>
                    </div>
                `;
            }
            commentsList.innerHTML = `
                <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
                    <i data-lucide="lock" style="width: 24px; height: 24px; margin: 0 auto 8px auto; display: block; color: var(--border-dark);"></i>
                    Comments are closed for this announcement.
                </div>
            `;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            return;
        }

        if (commentInputArea) commentInputArea.classList.remove('hidden');

        try {
            const { data: comments, error } = await window.supabaseClient
                .from('announcement_comments')
                .select(`id, content, created_at, user_id, profiles ( first_name, last_name, avatar_url, role )`)
                .eq('announcement_id', announcementId)
                .eq('is_hidden', false)
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (commentsHeader) {
                commentsHeader.innerHTML = `
                    <div class="comments-header-left">
                        <i data-lucide="messages-square"></i>
                        <span>Comments (${(comments || []).length})</span>
                    </div>
                    <span class="comments-guideline-pill"><i data-lucide="shield-check"></i> Monitored Discussion</span>
                `;
            }

            if (!comments || comments.length === 0) {
                commentsList.innerHTML = `
                    <div style="text-align: center; padding: 28px 16px; color: var(--text-muted); font-size: 13px;">
                        <i data-lucide="message-square-plus" style="width: 28px; height: 28px; margin: 0 auto 8px auto; display: block; color: var(--fern-green);"></i>
                        No comments yet. Be the first to ask a question!
                    </div>
                `;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                return;
            }

            commentsList.innerHTML = '';
            comments.forEach(c => {
                const isCoordinator = c.profiles?.role === 'admin' || c.profiles?.role === 'coordinator';
                const isMe = c.user_id === studentId;

                const displayName = isMe ? 'You' : `${c.profiles?.first_name || 'Student'} ${c.profiles?.last_name || ''}`.trim();
                const avatarUrl = c.profiles?.avatar_url || 'assets/default-avatar.png';

                let timeString = "";
                const diffMs = new Date() - new Date(c.created_at);
                const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMins = Math.floor(diffMs / (1000 * 60));
                if (diffHrs > 24) timeString = Math.floor(diffHrs / 24) + "d ago";
                else if (diffHrs > 0) timeString = diffHrs + "h ago";
                else timeString = diffMins === 0 ? "Just now" : diffMins + "m ago";

                const replyActionBtn = `<button type="button" class="btn-comment-tool" onclick="replyToUser('${displayName.replace(/'/g, "\\'").replace(/<[^>]*>?/gm, '').trim()}')"><i data-lucide="message-square"></i> Reply</button>`;
                const editBtn = isMe ? `<button type="button" class="btn-comment-tool tool-edit" onclick="editMyComment('${c.id}', \`${c.content.replace(/`/g, "\\`").replace(/'/g, "\\'")}\`)"><i data-lucide="edit-3"></i> Edit</button>` : '';
                const deleteBtn = isMe ? `<button type="button" class="btn-comment-tool tool-delete" onclick="deleteMyComment('${c.id}')"><i data-lucide="trash-2"></i> Delete</button>` : '';

                const commentHtml = `
                    <div class="comment-item">
                        <img src="${avatarUrl}" class="comment-avatar" alt="${displayName}" onerror="this.src='assets/default-avatar.png'">
                        <div class="comment-content-box">
                            <div class="comment-top-row">
                                <div class="comment-author-name">
                                    <span>${displayName}</span>
                                    ${isCoordinator ? `<span class="badge-author-tag">Coordinator</span>` : ''}
                                </div>
                                <span class="comment-time-text">${timeString}</span>
                            </div>
                            <div class="comment-text-body">${c.content}</div>
                            <div class="comment-actions-row">
                                ${replyActionBtn}
                                ${editBtn}
                                ${deleteBtn}
                            </div>
                        </div>
                    </div>
                `;
                commentsList.insertAdjacentHTML('beforeend', commentHtml);
            });

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            commentsList.scrollTop = commentsList.scrollHeight;

        } catch (err) {
            console.error("Error loading comments:", err);
            commentsList.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--danger-color);">Failed to load comments.</div>`;
        }
    }

    // ==========================================
    // 10. AI MODERATION & POSTING (UNBREAKABLE)
    // ==========================================
    const clientModerationCache = new Map();

    async function checkAiModeration(text) {
        const t = text.toLowerCase().trim();

        if (t.length < 2) {
            return { passed: false, reason: "Comment is too short or empty." };
        }

        // Fast local profanity & URL pre-filter (instant, 0ms)
        const forbiddenWords = ['fuck', 'shit', 'bitch', 'asshole', 'http://', 'https://', 'www.', 'buy now', 'crypto', 'casino', 'gambling'];
        for (let word of forbiddenWords) {
            if (t.includes(word)) {
                return { passed: false, reason: "Comment contains prohibited words or external links." };
            }
        }

        // Instant allow for standard greetings, questions, or polite phrases (0ms)
        const instantSafePattern = /^(hello|hi|hey|good\s+(morning|afternoon|evening|day)|thanks|thank\s+you|noted|copy|okay|ok|yes|no|when\s+is|what\s+time|where|how\s+to|question|is\s+there|po|opo)[\s\w.,?!@#+-]*$/i;
        if (instantSafePattern.test(t) && t.length < 60) {
            return { passed: true };
        }

        if (clientModerationCache.has(t)) {
            return clientModerationCache.get(t);
        }

        // Fast fetch with 1.8s AbortController timeout to prevent hanging UI
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1800);

            const response = await fetch('https://grantee-backend-n5f4.onrender.com/api/moderate-comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response && response.ok) {
                const data = await response.json();
                clientModerationCache.set(t, data);
                return data;
            }
        } catch (err) {
            // Gracefully pass local verification if remote moderation service is unreachable
        }
        return { passed: true };
    }

    async function handleSendComment() {
        const commentInput = document.getElementById('reply-input');
        const sendCommentBtn = document.getElementById('btn-send-reply');

        if (!commentInput || !sendCommentBtn) return;
        if (sendCommentBtn.disabled) return;

        const text = commentInput.value.trim();
        if (!text) return;
        if (!currentSelectedId) {
            showUIToast('error', 'Error', 'No announcement selected.');
            return;
        }

        try {
            sendCommentBtn.disabled = true;
            sendCommentBtn.innerHTML = '<span class="loading-spinner"></span>';

            const modCheck = await checkAiModeration(text);
            if (!modCheck.passed) {
                showUIToast('error', 'Comment Blocked', modCheck.reason);
                return;
            }

            const payload = {
                announcement_id: currentSelectedId,
                user_id: studentId,
                content: text
            };

            const { error } = await window.supabaseClient.from('announcement_comments').insert([payload]);
            if (error) throw error;

            commentInput.value = '';
            showUIToast('success', 'Comment Posted', 'Your reply has been added to the discussion.');
            loadComments(currentSelectedId, true);

            // Update comment count on active announcement in cache and card
            const activeAnn = allAnnouncements.find(a => String(a.id) === String(currentSelectedId));
            if (activeAnn) {
                if (!activeAnn.announcement_comments) activeAnn.announcement_comments = [];
                activeAnn.announcement_comments.push({ id: 'temp-' + Date.now() });
                const card = document.querySelector(`.social-card[data-id="${currentSelectedId}"]`);
                if (card) {
                    const btn = card.querySelector('.btn-comment-action span');
                    if (btn) btn.innerText = `Comments (${activeAnn.announcement_comments.length})`;
                }
            }

        } catch (err) {
            console.error("Error posting comment:", err);
            showUIToast('error', 'Error', err.message || 'Failed to post comment.');
        } finally {
            sendCommentBtn.disabled = false;
            sendCommentBtn.innerHTML = '<i data-lucide="send"></i>';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    }
    window.handleSendComment = handleSendComment;

    window.replyToUser = (name) => {
        const input = document.getElementById('reply-input');
        if (input) {
            input.value = `@${name} ` + input.value;
            input.focus();
        }
    };

    window.deleteMyComment = async (commentId) => {
        const confirmDelete = await Swal.fire({
            title: 'Delete Comment?',
            text: "Are you sure you want to remove your comment?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Yes, delete it',
            customClass: {
                popup: 'swal-nature-popup'
            }
        });

        if (confirmDelete.isConfirmed) {
            try {
                await window.supabaseClient.from('announcement_comments').delete().eq('id', commentId);
                showUIToast('success', 'Comment Deleted', 'Your comment has been removed.');
                if (currentSelectedId) loadComments(currentSelectedId, true);
            } catch (err) {
                showUIToast('error', 'Error', 'Failed to delete comment.');
            }
        }
    };

    window.editMyComment = async (commentId, oldContent) => {
        const { value: newText } = await Swal.fire({
            title: 'Edit Comment',
            input: 'textarea',
            inputValue: oldContent,
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

        if (newText !== undefined && newText !== null && newText.trim() !== '' && newText.trim() !== oldContent) {
            try {
                await window.supabaseClient.from('announcement_comments').update({ content: newText.trim() }).eq('id', commentId);
                showUIToast('success', 'Comment Updated', 'Your comment has been edited.');
                if (currentSelectedId) loadComments(currentSelectedId, true);
            } catch (err) {
                showUIToast('error', 'Error', 'Failed to update comment.');
            }
        }
    };

    // ==========================================
    // 10.1 GLOBAL DELEGATED EVENT LISTENERS
    // ==========================================
    document.addEventListener('click', (e) => {
        // Open announcement modal from Comments button
        const commentActionBtn = e.target.closest('.btn-comment-action, [data-open-announcement]');
        if (commentActionBtn) {
            e.preventDefault();
            const id = commentActionBtn.dataset.id || commentActionBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (id) {
                openAnnouncementModal(id);
            }
            return;
        }

        // Send comment button
        const sendBtn = e.target.closest('#btn-send-reply, .btn-send-reply');
        if (sendBtn) {
            e.preventDefault();
            handleSendComment();
            return;
        }

        // Close announcement modal button
        const closeViewBtn = e.target.closest('#modal-close-view, .announcement-modal-card .close-btn');
        if (closeViewBtn) {
            e.preventDefault();
            closeAnnouncementModal();
            return;
        }

        // Close announcement modal backdrop
        if (e.target.id === 'view-announcement-modal') {
            closeAnnouncementModal();
            return;
        }

        // Lightbox image click
        const fbImg = e.target.closest('.fb-img');
        if (fbImg) {
            const layout = fbImg.closest('.fb-layout');
            if (layout) {
                const allImgs = Array.from(layout.querySelectorAll('.fb-img')).map(img => img.src);
                const idx = allImgs.indexOf(fbImg.src);
                openLightbox(allImgs, idx >= 0 ? idx : 0);
            }
            return;
        }

        // Close lightbox
        const closeLightboxBtn = e.target.closest('#close-media-viewer');
        if (closeLightboxBtn || e.target.id === 'media-viewer-modal') {
            const modalViewer = document.getElementById('media-viewer-modal');
            const viewerImg = document.getElementById('viewer-image');
            if (modalViewer) modalViewer.style.display = 'none';
            if (viewerImg) viewerImg.src = '';
            document.body.style.overflow = '';
            return;
        }

        // Prev media
        if (e.target.closest('#prev-media')) {
            e.stopPropagation();
            if (lightboxCurrentIndex > 0) {
                lightboxCurrentIndex--;
                showLightboxImage();
            }
            return;
        }

        // Next media
        if (e.target.closest('#next-media')) {
            e.stopPropagation();
            if (lightboxCurrentIndex < lightboxImages.length - 1) {
                lightboxCurrentIndex++;
                showLightboxImage();
            }
            return;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.id === 'reply-input' || e.target.classList.contains('reply-input-field'))) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendComment();
            }
        }
        if (e.key === 'Escape') {
            const annModal = document.getElementById('view-announcement-modal');
            if (annModal && annModal.style.display !== 'none') {
                closeAnnouncementModal();
            }
            const mediaModal = document.getElementById('media-viewer-modal');
            if (mediaModal && mediaModal.style.display !== 'none') {
                mediaModal.style.display = 'none';
                document.body.style.overflow = '';
            }
        }
    });

    // ==========================================
    // 11. MEDIA LIGHTBOX & VIEWER LOGIC
    // ==========================================
    let lightboxImages = [];
    let lightboxCurrentIndex = 0;

    function openLightbox(images, startIndex = 0) {
        if (!images || images.length === 0) return;
        ensureAnnouncementModals();
        lightboxImages = images;
        lightboxCurrentIndex = startIndex;
        showLightboxImage();
        const modalViewer = document.getElementById('media-viewer-modal');
        if (modalViewer) {
            modalViewer.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }
    window.openLightbox = openLightbox;

    function showLightboxImage() {
        if (!lightboxImages || lightboxImages.length === 0) return;
        const url = lightboxImages[lightboxCurrentIndex];
        const viewerImg = document.getElementById('viewer-image');
        const viewerIframe = document.getElementById('viewer-iframe');
        const mediaCounter = document.getElementById('media-counter');
        const btnPrev = document.getElementById('prev-media');
        const btnNext = document.getElementById('next-media');

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

    // ==========================================
    // 12. SUPABASE REALTIME ANNOUNCEMENTS UPDATE
    // ==========================================
    let realtimeChannel = null;

    function setupRealtimeAnnouncements() {
        try {
            if (realtimeChannel) {
                window.supabaseClient.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }

            realtimeChannel = window.supabaseClient
                .channel('student-announcements-live-sync')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'announcements'
                    },
                    async (payload) => {
                        console.log('Realtime Postgres announcement change received:', payload);
                        await fetchAnnouncements(true);

                        if (payload.eventType === 'INSERT') {
                            if (payload.new && payload.new.status === 'Published') {
                                showUIToast('info', 'New Announcement', payload.new.title ? `"${payload.new.title}" was just posted.` : 'A new announcement was published.');
                            }
                        } else if (payload.eventType === 'UPDATE') {
                            if (currentSelectedId && String(currentSelectedId) === String(payload.new?.id)) {
                                openAnnouncementModal(currentSelectedId);
                            }
                            if (payload.new && payload.new.status === 'Published') {
                                showUIToast('info', 'Announcement Updated', payload.new.title ? `"${payload.new.title}" was updated.` : 'An announcement was updated.');
                            }
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'announcement_comments'
                    },
                    async (payload) => {
                        // If student is viewing the announcement where comments changed, reload comments
                        if (currentSelectedId) {
                            const changedAnnId = payload.new?.announcement_id || payload.old?.announcement_id;
                            if (changedAnnId === currentSelectedId) {
                                const ann = allAnnouncements.find(a => String(a.id) === String(currentSelectedId));
                                loadComments(currentSelectedId, ann ? (ann.allow_comments !== false && ann.allow_comments !== 'false' && ann.allow_comments !== 0) : true);
                            }
                        }
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Successfully subscribed to student announcements realtime channel.');
                    }
                });
        } catch (err) {
            console.warn('Realtime announcements setup error:', err);
        }
    }

    // Auto-refresh when tab/browser becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            fetchAnnouncements(true);
        }
    });

    // Background polling fallback every 25 seconds
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            fetchAnnouncements(true);
        }
    }, 25000);

    // ==========================================
    // 13. DROPDOWNS & LOGOUT
    // ==========================================
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

    const logoutModal = document.getElementById('logout-modal');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const logoutTriggers = document.querySelectorAll('#sidebar-logout-btn, #dropdown-logout-btn');

    if (logoutModal) {
        logoutTriggers.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                logoutModal.style.display = 'flex';
                if (profileMenu) profileMenu.classList.remove('show');
            });
        });

        if (modalCancel) {
            modalCancel.addEventListener('click', () => {
                logoutModal.style.display = 'none';
            });
        }

        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) {
                logoutModal.style.display = 'none';
            }
        });

        if (modalConfirm) {
            modalConfirm.addEventListener('click', async () => {
                try {
                    modalConfirm.innerText = "Logging out...";
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login-student.html';
                } catch (error) {
                    console.error("Logout Error:", error);
                    window.location.href = 'login-student.html';
                }
            });
        }
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Start App
    initializeApp();
});