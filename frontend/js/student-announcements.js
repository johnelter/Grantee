document.addEventListener('DOMContentLoaded', async () => {

    // ==========================================
    // 0. DYNAMIC INJECTIONS (Modals & FB Styles)
    // ==========================================
    const fbStyles = `
        <style>
            .fb-layout { display: grid; gap: 4px; margin-top: 15px; border-radius: 8px; overflow: hidden; background: #000; }
            .fb-img { width: 100%; height: 100%; object-fit: cover; cursor: pointer; transition: 0.2s; }
            .fb-img:hover { filter: brightness(0.85); }
            .fb-layout-1 { grid-template-columns: 1fr; max-height: 400px; }
            .fb-layout-2 { grid-template-columns: 1fr 1fr; height: 300px; }
            .fb-layout-3 { grid-template-columns: 1.5fr 1fr; grid-template-rows: 1fr 1fr; height: 350px; }
            .fb-layout-3 .span-left { grid-row: 1 / 3; height: 100%; }
            .fb-layout-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; height: 350px; }
            .more-images-container { position: relative; cursor: pointer; height: 100%; }
            .more-images-container::after { content: attr(data-more); position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); color: white; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; }
            
            /* Attachment Styles */
            .detail-attachments { margin-top: 25px; padding-top: 20px; border-top: 1px solid var(--border-dark, #e2e8f0); }
            .attachments-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; margin-top: 15px; }
            .attachment-box { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; }
            .attachment-info { flex: 1; display: flex; flex-direction: column; }
            .attachment-info strong { font-size: 13px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
            .attachment-info span { font-size: 11px; color: #64748b; }
            .btn-view-file { background: #e2e8f0; color: #334155; padding: 6px 10px; border-radius: 6px; text-decoration: none; transition: 0.2s; }
            .btn-view-file:hover { background: #cbd5e1; }
            
            /* Toast UI Styles */
            #toast-container { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 999999; display: flex; flex-direction: column; gap: 10px; }
            .custom-toast { display: flex; align-items: center; background: #fff; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 350px; padding: 12px 15px; position: relative; overflow: hidden; animation: toastSlideIn 0.3s ease-out forwards; }
            .custom-toast.hide { animation: toastSlideOut 0.3s ease-in forwards; }
            .toast-indicator { position: absolute; left: 0; top: 0; bottom: 0; width: 6px; }
            .toast-icon { font-size: 14px; margin-right: 15px; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; color: #fff; flex-shrink: 0; }
            .toast-content { flex: 1; }
            .toast-title { font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 2px; }
            .toast-message { font-size: 13px; color: #64748b; line-height: 1.4; }
            .toast-close { background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 0 0 0 10px; }
            @keyframes toastSlideIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes toastSlideOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-20px); } }
            .custom-toast.error .toast-indicator { background: #ef4444; }
            .custom-toast.error .toast-icon { background: #ef4444; }
            .custom-toast.success .toast-indicator { background: #10b981; }
            .custom-toast.success .toast-icon { background: #10b981; }
            .custom-toast.warning .toast-indicator { background: #f59e0b; }
            .custom-toast.warning .toast-icon { background: #f59e0b; }
            .custom-toast.info .toast-indicator { background: #3b82f6; }
            .custom-toast.info .toast-icon { background: #3b82f6; }
            
            /* Fix SweetAlert z-index so it shows over the modal */
            .swal2-container { z-index: 99999 !important; }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', fbStyles);

    window.showToast = (type, title, message) => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
        
        let iconClass = 'fa-solid fa-info';
        if (type === 'error') iconClass = 'fa-solid fa-xmark';
        if (type === 'success') iconClass = 'fa-solid fa-check';
        if (type === 'warning') iconClass = 'fa-solid fa-exclamation';
        
        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-indicator"></div>
            <div class="toast-icon"><i class="${iconClass}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
        `;
        
        container.appendChild(toast);
        
        const closeBtn = toast.querySelector('.toast-close');
        const hideToast = () => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        };
        closeBtn.addEventListener('click', hideToast);
        setTimeout(hideToast, 5000);
    };

    const mediaModalHtml = `
        <div id="media-viewer-modal" class="modal-overlay hidden" style="z-index: 9999; display: none;">
            <div style="position: relative; width: 90%; max-width: 900px; height: 85vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <button id="close-media-viewer" style="position: absolute; top: -35px; right: 0; background: none; border: none; color: white; font-size: 28px; cursor: pointer; transition: 0.2s;"><i class="fa-solid fa-xmark"></i></button>
                <img id="viewer-image" style="max-width: 100%; max-height: 100%; display: none; border-radius: 8px; object-fit: contain; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <iframe id="viewer-iframe" style="width: 100%; height: 100%; display: none; border: none; border-radius: 8px; background: #f8fafc; box-shadow: 0 10px 25px rgba(0,0,0,0.5);"></iframe>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', mediaModalHtml);


    // ==========================================
    // 1. AUTH CHECK & STATE INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login-student.html';
        return;
    }

    let studentId = session.user.id;
    let studentProfile = null;
    let studentApplication = null;
    let studentApplications = [];
    let allAnnouncements = [];
    let readAnnouncementIds = new Set();

    const urlParams = new URLSearchParams(window.location.search);
    let currentSelectedId = urlParams.get('id');

    let currentTab = 'All';
    let searchQuery = '';
    let sortMode = 'desc';

    // Initialize Chat visibility
    const initChat = document.querySelector('.chat-body');
    const initChatInput = document.querySelector('.chat-input-area');
    if (initChat) initChat.style.display = 'none';
    if (initChatInput) initChatInput.style.display = 'none';


    // ==========================================
    // 2. LOAD PROFILE & READ STATUS
    // ==========================================
    async function initializeApp() {
        try {
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
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));

                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = fullName;
                if (document.getElementById('header-program')) document.getElementById('header-program').innerText = progName;
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            } else if (profileError) {
                console.warn("Could not load profile details:", profileError);
                studentProfile = { id: studentId };
            }

            const { data: appData } = await window.supabaseClient
                .from('applications')
                .select('status, scholarships(title)')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });

            if (appData && appData.length > 0) {
                studentApplications = appData;
                studentApplication = appData[0];
            }

            const { data: readData, error: readError } = await window.supabaseClient
                .from('announcement_reads')
                .select('announcement_id')
                .eq('student_id', studentId);

            if (readData) {
                readAnnouncementIds = new Set(readData.map(r => r.announcement_id));
            } else if (readError) {
                console.warn("Could not load read statuses.", readError);
            }

            await fetchAnnouncements();

        } catch (error) {
            console.error("Error initializing app:", error);
        }
    }

    // ==========================================
    // 3. FETCH & FILTER ANNOUNCEMENTS
    // ==========================================
    async function fetchAnnouncements() {
        try {
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
                applyFiltersAndRender();
                return;
            }

            allAnnouncements = data.filter(ann => isAudienceMatch(ann, studentProfile, studentApplications));

            applyFiltersAndRender();

        } catch (err) {
            console.error("Error fetching announcements:", err);
            const container = document.getElementById('announcements-list-container');
            if (container) container.innerHTML = `<div class="text-center text-red" style="padding: 40px;"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load announcements. Please check database connection.</div>`;
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
                return applications.some(app => app.status.toLowerCase() === 'approved');
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

    function applyFiltersAndRender() {
        const catFilter = document.getElementById('filter-category')?.value || 'all';
        let filtered = allAnnouncements.filter(a => {
            const matchesSearch = (a.title && a.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (a.content && a.content.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCategory = catFilter === 'all' || (a.category && a.category.toLowerCase() === catFilter.toLowerCase());
            return matchesSearch && matchesCategory;
        });

        filtered.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortMode === 'desc' ? dateB - dateA : dateA - dateB;
        });

        filtered.sort((a, b) => (b.is_pinned === true) - (a.is_pinned === true));
        renderFeed(filtered);
    }

    document.getElementById('filter-category')?.addEventListener('change', applyFiltersAndRender);

    // ==========================================
    // 4. UI RENDERING: FEED PANE
    // ==========================================
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

    function renderFeed(data) {
        const container = document.getElementById('announcements-list-container');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted" style="padding: 40px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #fff;">No announcements found.</div>`;
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
            const newBadge = !isRead ? `<span style="background-color: #ef4444; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; text-transform: uppercase;">New</span>` : '';
            let pinnedBadge = ann.is_pinned ? `<span style="background-color: #10b981; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);"><i class="fa-solid fa-thumbtack"></i> Pinned</span>` : '';

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
                        ${newBadge}
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img src="${authorAvatar}" class="card-avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                            <span style="font-size:14px; font-weight:500; color:#475569;">${authorName}</span>
                            <span style="color:#cbd5e1; font-size:10px;">&bull;</span>
                            <span style="font-size:14px; color:#64748b;">${dateStr}</span>
                        </div>
                    </div>
                </div>
                <div class="card-tags-row" style="display:flex; gap:10px; margin: 0 20px 10px 20px; flex-wrap:wrap;">
                    ${pinnedBadge}
                    <span style="${catStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="${catIcon}"></i> ${ann.category || 'General'}</span>
                    <span style="${commentsBadgeStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-${ann.allow_comments !== false ? 'comments' : 'lock'}"></i> ${ann.allow_comments !== false ? 'Comments Open' : 'Comments Closed'}</span>
                </div>
                <h3 class="card-title" style="margin: 0 20px 20px 20px; font-size: 20px;">${ann.title}</h3>
                <div class="card-body" style="padding-top:0;">
                    <div class="card-text-content ${isLong ? 'card-text-truncated' : ''}" id="content-${ann.id}">
                        ${ann.content || ''}
                    </div>
                    ${isLong ? `<button class="btn-see-more" id="btn-see-more-${ann.id}" onclick="toggleSeeMore('${ann.id}')">See more</button>` : ''}
                </div>
                ${coverHtml}
                <div class="card-actions">
                    <button class="btn-comment-action" onclick="window.openAnnouncementModal('${ann.id}')">
                        <i class="fa-regular fa-comment"></i> Comment (${commentCount})
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
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


    function getCategoryClass(category) {
        if (!category) return 'general';
        const cat = category.toLowerCase();
        if (cat.includes('educational assistance')) return 'general'; 
        if (cat.includes('reminder')) return 'reminder';
        if (cat.includes('event')) return 'event';
        return 'general';
    }

    // ==========================================
    // 5. UI RENDERING: MODAL DETAIL VIEW
    // ==========================================
    window.openAnnouncementModal = async (id) => {
        currentSelectedId = id;

        const activeAnn = allAnnouncements.find(a => a.id == id);
        if (!activeAnn) return;

        const detailContainer = document.getElementById('announcement-detail-view');
        if (!detailContainer) return;
        
        const modal = document.getElementById('view-announcement-modal');
        if (modal) modal.style.display = 'flex';

        if (!readAnnouncementIds.has(id)) {
            readAnnouncementIds.add(id);
            // Hide the NEW badge directly in the DOM
            const card = document.querySelector(`.social-card[data-id="${id}"]`);
            if (card) {
                const newBadge = card.querySelector('span[style*="background-color: #ef4444"]');
                if (newBadge) newBadge.remove();
            }
            window.supabaseClient.from('announcement_reads').insert([{ student_id: studentId, announcement_id: id }]).then();
        }

        const dateStr = new Date(activeAnn.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        
        let authorName = "Scholarship Office";
        let authorAvatar = "assets/admin-avatar.png";
        if (activeAnn.profiles) {
            authorName = `${activeAnn.profiles.first_name || ''} ${activeAnn.profiles.last_name || ''}`.trim();
            if (activeAnn.profiles.avatar_url) authorAvatar = activeAnn.profiles.avatar_url;
        }

        let pinnedBadge = activeAnn.is_pinned ? `<span style="background-color: #10b981; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);"><i class="fa-solid fa-thumbtack"></i> Pinned</span>` : '';

        let catStyle = "border:1px solid #86efac; color:#16a34a; background:#f0fdf4;";
        let catIcon = "fa-solid fa-bullhorn";
        if (activeAnn.category === 'Educational Assistance') {
            catStyle = "border:1px solid #93c5fd; color:#1d4ed8; background:#eff6ff;";
            catIcon = "fa-solid fa-graduation-cap";
        } else if (activeAnn.category === 'Reminder') {
            catStyle = "border:1px solid #fde047; color:#a16207; background:#fefce8;";
            catIcon = "fa-regular fa-clock";
        } else if (activeAnn.category === 'Event') {
            catStyle = "border:1px solid #d8b4fe; color:#7e22ce; background:#faf5ff;";
            catIcon = "fa-regular fa-calendar";
        }

        let audienceStr = activeAnn.audience_type === 'all_enrolled_students' || activeAnn.audience_type === 'all_students' ? 'All Enrolled Students' : 'Targeted';
        
        let coverHtml = window.generateImageGrid(activeAnn.image_urls);

        let eduButtonHtml = '';
        if (activeAnn.category && activeAnn.category.toLowerCase().includes('educational assistance')) {
            eduButtonHtml = `
                <button class="btn-primary-large" onclick="window.location.href='student-educational-assistance.html'" style="width: 100%; margin: 20px 0; padding: 15px; border-radius: 8px; font-weight: 600; font-size: 15px; background: #10b981; color: white; border: none; cursor: pointer; transition: 0.2s;">
                    View Educational Assistance Details <i class="fa-solid fa-arrow-right" style="margin-left: 8px;"></i>
                </button>
            `;
        }

        let attachmentsHtml = '';
        if (activeAnn.attachments && Array.isArray(activeAnn.attachments) && activeAnn.attachments.length > 0) {
            const filesList = activeAnn.attachments.map(file => `
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
                    <h4 class="detail-attachments-title" style="font-size: 13px; color: var(--text-muted); margin-bottom: 10px;">Attachments (${activeAnn.attachments.length})</h4>
                    <div class="attachment-grid">${filesList}</div>
                </div>
            `;
        }

        detailContainer.innerHTML = `
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; padding: 20px 20px 10px 20px;">
                <div class="card-meta-row" style="display:flex; align-items:center; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <img src="${authorAvatar}" class="card-avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
                        <span style="font-size:14px; font-weight:500; color:#475569;">${authorName}</span>
                        <span style="color:#cbd5e1; font-size:10px;">&bull;</span>
                        <span style="font-size:14px; color:#64748b;">${dateStr}</span>
                    </div>
                </div>
            </div>
            <div class="card-tags-row" style="display:flex; gap:10px; margin: 0 20px 10px 20px; flex-wrap:wrap;">
                ${pinnedBadge}
                <span style="border:1px solid #e2e8f0; color:#475569; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px; text-transform:uppercase;"><i class="fa-solid fa-users"></i> ${audienceStr}</span>
                <span style="${catStyle} padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="${catIcon}"></i> ${activeAnn.category || 'General'}</span>
            </div>
            <h3 class="card-title" style="margin: 0 20px 20px 20px; font-size: 20px; text-align: left;">${activeAnn.title}</h3>
            <div class="card-body" style="padding-top:0; text-align: left; padding: 0 20px;">
                <div class="card-text-content">
                    ${activeAnn.content || 'No content provided.'}
                </div>
            </div>
            ${coverHtml}
            ${eduButtonHtml}
            ${attachmentsHtml}
        `;

        loadComments(id, activeAnn.allow_comments !== false);
    }

    document.getElementById('modal-close-view')?.addEventListener('click', () => {
        document.getElementById('view-announcement-modal').style.display = 'none';
        currentSelectedId = null;
    });

    // ==========================================
    // 6. UI RENDERING: RIGHT COMMENTS PANE
    // ==========================================
    async function loadComments(announcementId, isAllowed) {
        const commentsHeader = document.getElementById('comments-count-header');
        const commentsList = document.getElementById('comments-list');
        const commentInputArea = document.getElementById('comment-input-area');

        if (!commentsList) return;

        commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>`;

        if (!isAllowed) {
            if (commentInputArea) commentInputArea.classList.add('hidden');
            if (commentsHeader) commentsHeader.innerText = `Comments (Closed)`;
            commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;"><i class="fa-solid fa-lock"></i> Comments are turned off for this post.</div>`;
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

            if (commentsHeader) commentsHeader.innerText = `Comments (${comments.length})`;

            if (comments.length === 0) {
                commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;">No comments yet. Be the first to ask a question!</div>`;
                return;
            }

            commentsList.innerHTML = '';
            comments.forEach(c => {
                const isCoordinator = c.profiles?.role === 'admin' || c.profiles?.role === 'coordinator';
                const isMe = c.user_id === studentId;

                let displayName = isMe ? 'You' : `${c.profiles?.first_name || 'Student'} ${c.profiles?.last_name || ''}`.trim();
                let nameHtml = `<span style="font-weight: 700; color: #1e293b; font-size: 14px;">${displayName}</span>`;
                if (isCoordinator) {
                    nameHtml += ` <span style="background: var(--primary-color, #10b981); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">Author</span>`;
                }

                const avatarUrl = c.profiles?.avatar_url || 'assets/default-avatar.png';

                let timeString = "";
                const diffMs = new Date() - new Date(c.created_at);
                const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMins = Math.floor(diffMs / (1000 * 60));
                if (diffHrs > 24) timeString = Math.floor(diffHrs / 24) + "d ago";
                else if (diffHrs > 0) timeString = diffHrs + "h ago";
                else timeString = diffMins === 0 ? "Just now" : diffMins + "m ago";

                const replyActionBtn = `<button style="background:none; border:none; color:#64748b; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;" onclick="replyToUser('${displayName.replace(/'/g, "\\'").replace(/<[^>]*>?/gm, '').trim()}')"><i class="fa-regular fa-comment"></i> Reply</button>`;
                const editBtn = isMe ? `<button style="background:none; border:none; color:#3b82f6; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;" onclick="editMyComment('${c.id}', \`${c.content.replace(/`/g, "\\`")}\`)"><i class="fa-solid fa-pen"></i> Edit</button>` : '';
                const deleteBtn = isMe ? `<button style="background:none; border:none; color:#ef4444; font-size:13px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px;" onclick="deleteMyComment('${c.id}')"><i class="fa-regular fa-trash-can"></i> Delete</button>` : '';

                const commentHtml = `
                    <div class="comment-item" style="border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; padding: 15px; margin-bottom: 15px; display:flex; gap: 15px;">
                        <img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" alt="User" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/><text x=%2250%22 y=%2250%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22 fill=%22%2364748b%22><i class=%22fa-solid fa-user%22></i></text></svg>'">
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 4px;">
                                <div style="display:flex; align-items:center;">
                                    ${nameHtml}
                                </div>
                                <span style="font-size:12px; color:#94a3b8; font-weight:500;">${timeString}</span>
                            </div>
                            <div style="font-size:14px; color:#475569; margin-bottom: 12px; line-height: 1.5; word-break: break-word; text-align: left;">${c.content}</div>
                            <div style="display:flex; gap: 15px; align-items:center;">
                                ${replyActionBtn}
                                ${editBtn}
                                ${deleteBtn}
                            </div>
                        </div>
                    </div>
                `;
                commentsList.insertAdjacentHTML('beforeend', commentHtml);
            });

            commentsList.scrollTop = commentsList.scrollHeight;

        } catch (err) {
            console.error(err);
            commentsList.innerHTML = `<div class="text-center text-red" style="padding: 20px;">Failed to load comments.</div>`;
        }
    }

    // ==========================================
    // 7. AI MODERATION & POSTING COMMENTS (UPDATED)
    // ==========================================

    let lastCommentText = "";

    async function checkAiModeration(text) {
        const t = text.toLowerCase().trim();

        if (t.length < 2) {
            return { passed: false, reason: "Comment is too short or irrelevant." };
        }
        if (t === lastCommentText) {
            return { passed: false, reason: "Duplicate comment detected." };
        }

        try {
            const response = await fetch('https://grantee-backend-n5f4.onrender.com/api/moderate-comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                throw new Error("Backend moderation failed");
            }

            const data = await response.json();
            return data;
        } catch (err) {
            console.error("AI Moderation Error:", err);
            return { passed: true };
        }
    }

    const sendCommentBtn = document.getElementById('btn-send-reply');
    const commentInput = document.getElementById('reply-input');

    if (sendCommentBtn && commentInput) {
        sendCommentBtn.addEventListener('click', async () => {
            const text = commentInput.value.trim();
            if (!text || !currentSelectedId) return;

            sendCommentBtn.disabled = true;
            sendCommentBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

            const modCheck = await checkAiModeration(text);
            if (!modCheck.passed) {
                window.showToast('error', 'Comment Blocked', 'Your comment may violate guidelines.<br>AI Flag: ' + modCheck.reason);
                sendCommentBtn.disabled = false;
                sendCommentBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';

                // Notify admin of AI moderation alert
                const schoolId = studentProfile?.school_id;
                if (schoolId) {
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: schoolId,
                            eventType: 'AI_MODERATION_ALERT',
                            subject: 'AI Moderation Alert',
                            message: `AI flagged a student comment for review: ${modCheck.reason}.`,
                            resourceId: currentSelectedId
                        })
                    }).catch(e => console.error("Moderation alert failed:", e));
                }

                return;
            }

            try {
                // 1. Get the student's full name to display on the admin's notification
                const studentName = studentProfile ? `${studentProfile.first_name || ''} ${studentProfile.last_name || ''}`.trim() : 'A student';
                
                const payload = {
                    announcement_id: currentSelectedId,
                    user_id: studentId,
                    content: text,
                    student_name: studentName // Crucial for the backend controller to read
                };

                // 2. Attempt to hit your backend API so commentController.js runs
                // Note: Change '/api/comments' to match whatever route you created in your Node/Express app!
                const response = await fetch('/api/comments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    console.warn("Backend API not found, falling back to direct browser database insert.");
                    
                    // FALLBACK: If the API route isn't set up yet, directly insert the comment...
                    const { error } = await window.supabaseClient.from('announcement_comments').insert([{
                        announcement_id: currentSelectedId,
                        user_id: studentId,
                        content: text,
                        is_hidden: false
                    }]);
                    if (error) throw error;

                    // ...AND directly insert the admin notification!
                    const { data: ann } = await window.supabaseClient.from('announcements')
                        .select('admin_id, title')
                        .eq('id', currentSelectedId)
                        .single();

                    if (ann && ann.admin_id) {
                        await window.supabaseClient.from('notifications').insert([{
                            user_id: ann.admin_id,
                            title: 'New Student Comment',
                            message: `${studentName} commented on "${ann.title}".`,
                            type: 'comment',
                            priority: 'medium',
                            action_link: `/admin-announcements.html?id=${currentSelectedId}`,
                            is_read: false
                        }]);
                    }
                }

                // 3. Reset input and reload the comment list visually
                lastCommentText = text.toLowerCase().trim();
                commentInput.value = '';
                loadComments(currentSelectedId, true);

            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Failed to post comment.', 'error');
            } finally {
                sendCommentBtn.disabled = false;
                sendCommentBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            }
        });

        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendCommentBtn.click();
            }
        });
    }

    window.deleteMyComment = async (commentId) => {
        const confirm = await Swal.fire({
            title: 'Delete Comment?',
            text: "Are you sure you want to remove your comment?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Delete'
        });

        if (confirm.isConfirmed) {
            await window.supabaseClient.from('announcement_comments').delete().eq('id', commentId);
            loadComments(currentSelectedId, true);
        }
    };

    window.editMyComment = async (commentId, oldContent) => {
        const { value: newText } = await Swal.fire({
            title: 'Edit Comment',
            input: 'textarea',
            inputValue: oldContent,
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            confirmButtonText: 'Update'
        });

        if (newText && newText.trim() !== oldContent) {
            await window.supabaseClient.from('announcement_comments').update({ content: newText.trim() }).eq('id', commentId);
            loadComments(currentSelectedId, true);
        }
    };

    window.replyToUser = (name) => {
        const commentInput = document.getElementById('reply-input');
        if (commentInput) {
            commentInput.value = `@${name} ` + commentInput.value;
            commentInput.focus();
        }
    };

    // ==========================================
    // 8. TABS, SEARCH & FILTER EVENTS
    // ==========================================

    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');

            currentTab = e.currentTarget.innerText.trim();
            applyFiltersAndRender();
        });
    });

    // ID FIX: Match HTML
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            applyFiltersAndRender();
        });
    }

    // ==========================================
    // 9. MEDIA VIEWER & CHAT TOGGLE
    // ==========================================
    document.addEventListener('click', function (e) {

        // Image Viewer
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
                modal.classList.remove('hidden');
                modal.style.display = 'flex'; // Force flex display for centering
            }
        }

        // File Viewer
        const fileBtn = e.target.closest('.btn-view-file');
        if (fileBtn) {
            e.preventDefault();
            const fileUrl = fileBtn.href;
            const modal = document.getElementById('media-viewer-modal');
            if (!modal) return;
            document.getElementById('viewer-iframe').src = fileUrl;
            document.getElementById('viewer-iframe').style.display = 'block';
            document.getElementById('viewer-image').style.display = 'none';
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }

        // Close Viewer
        if (e.target.closest('#close-media-viewer') || e.target.id === 'media-viewer-modal') {
            const modal = document.getElementById('media-viewer-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                document.getElementById('viewer-iframe').src = '';
                document.getElementById('viewer-image').src = '';
            }
        }
    });

    // ==========================================
    // 10. DROPDOWNS, LOGOUT
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

    // ==========================================
    // NOTIFICATION PREFERENCES
    // ==========================================
    const prefsForm = document.getElementById('notification-prefs-form');
    if (prefsForm) {
        prefsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('btn-save-prefs');
            try {
                btn.innerText = 'Saving...';
                btn.disabled = true;

                const preferences = {
                    announcements: document.getElementById('pref-announcements').checked,
                    applications: document.getElementById('pref-applications').checked,
                    beneficiary: document.getElementById('pref-beneficiary').checked,
                    security: true // Always true
                };

                const response = await fetch('/api/update-notification-preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, preferences })
                });

                if (!response.ok) throw new Error('Failed to update preferences on server.');
                
                // Also update supabase directly just in case local state needs it immediately
                await window.supabaseClient.from('profiles').update({ email_preferences: preferences }).eq('id', userId);

                Swal.fire('Success', 'Notification preferences updated.', 'success');
            } catch (err) {
                console.error('Error saving prefs:', err);
                Swal.fire('Error', err.message, 'error');
            } finally {
                btn.innerText = 'Save Preferences';
                btn.disabled = false;
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
                logoutModal.classList.remove('hidden');
                logoutModal.style.display = 'flex';
                if (profileMenu) profileMenu.classList.remove('show');
            });
        });

        if (modalCancel) {
            modalCancel.addEventListener('click', () => {
                logoutModal.classList.add('hidden');
                logoutModal.style.display = 'none';
            });
        }

        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) {
                logoutModal.classList.add('hidden');
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
                    alert("Failed to logout. Please try again.");
                    modalConfirm.innerText = "Yes";
                }
            });
        }
    }

    initializeApp();
});