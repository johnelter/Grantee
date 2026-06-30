document.addEventListener('DOMContentLoaded', async () => {
    
    // 🛑 Prevent Form Refresh
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
    let adminNameStr = "Admin";
    let adminAvatarUrl = "assets/admin-avatar.png";

    // ==========================================
    // 2. HEADER PROFILE & DROPDOWN
    // ==========================================
    async function initProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', adminId)
                .single();

            if (profile) {
                if (profile.role !== 'admin') { window.location.href = 'student-dashboard.html'; return; }
                currentAdminSchoolId = profile.school_id;

                adminNameStr = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                document.getElementById('header-name').innerText = adminNameStr;
                
                if (profile.avatar_url) {
                    adminAvatarUrl = profile.avatar_url;
                    document.getElementById('header-avatar').src = adminAvatarUrl;
                    if(document.getElementById('create-box-avatar')) {
                        document.getElementById('create-box-avatar').src = adminAvatarUrl;
                    }
                }

                fetchScholarshipsForDropdown();
                fetchAnnouncements();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }

    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');
    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('show'); });
        document.addEventListener('click', (e) => { if (!profileToggle.contains(e.target)) profileMenu.classList.remove('show'); });
    }

    document.getElementById('dropdown-logout-btn').addEventListener('click', (e) => {
        e.preventDefault(); document.getElementById('logout-modal').style.display = 'flex'; profileMenu.classList.remove('show');
    });
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('logout-modal').style.display = 'none');
    document.getElementById('modal-confirm').addEventListener('click', async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'login-student.html';
    });

    // ==========================================
    // 3. FETCH DATA (Scholarships & Announcements)
    // ==========================================
    const container = document.getElementById('announcements-container');

    async function fetchScholarshipsForDropdown() {
        if (!currentAdminSchoolId) return;
        const { data } = await window.supabaseClient.from('scholarships').select('id, title').eq('school_id', currentAdminSchoolId);
        const group = document.getElementById('target-scholarships-group');
        group.innerHTML = '';
        if (data) {
            data.forEach(sch => {
                const opt = document.createElement('option');
                opt.value = sch.id;
                opt.text = `Applicants of: ${sch.title}`;
                group.appendChild(opt);
            });
        }
    }

    async function fetchAnnouncements() {
        if (!currentAdminSchoolId) {
            container.innerHTML = `<div class="text-center text-red" style="padding: 40px;">No school assigned to this admin.</div>`;
            return;
        }

        try {
            // Join announcements with the author's profile and the targeted scholarship title
            const { data, error } = await window.supabaseClient
                .from('announcements')
                .select(`
                    *,
                    scholarships ( title ),
                    profiles ( first_name, last_name, avatar_url, role ),
                    announcement_comments ( id )
                `)
                .eq('school_id', currentAdminSchoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            allAnnouncements = data || [];
            applyFilters();
            
            // After loading announcements, fetch the recent comments for the sidebar
            fetchRecentComments();

        } catch (err) {
            console.error("Fetch error:", err);
            container.innerHTML = `<div class="text-center text-red" style="padding: 40px;">Make sure the 'announcements' table exists in Supabase.</div>`;
        }
    }

    function renderAnnouncements(data) {
        if (data.length === 0) {
            container.innerHTML = `<div class="text-center text-muted" style="padding: 40px; border: 1px dashed var(--border-dark); border-radius: 12px; background: #fff;">No announcements found. Create a post above.</div>`;
            return;
        }

        container.innerHTML = '';
        data.forEach(ann => {
            const dateStr = new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            let statusPill = 'pill-published';
            let statusText = 'PUBLISHED';
            if (ann.type === 'Schedule') { statusPill = 'pill-scheduled'; statusText = 'SCHEDULED'; }
            if (ann.type === 'Draft') { statusPill = 'pill-draft'; statusText = 'DRAFT'; } 

            let targetText = "👥 All Enrolled Students";
            if (ann.target_scholarship_id && ann.scholarships) {
                targetText = `🎯 Applicants: ${ann.scholarships.title}`;
            }

            const commentCount = ann.announcement_comments ? ann.announcement_comments.length : 0;
            
            // Get author details securely from the joined profile data
            let authorName = "System Administrator";
            let authorAvatar = "assets/admin-avatar.png";
            if(ann.profiles) {
                authorName = `${ann.profiles.first_name || ''} ${ann.profiles.last_name || ''}`.trim();
                if(ann.profiles.avatar_url) authorAvatar = ann.profiles.avatar_url;
            }

            // Generate unique ID for the dropdown menu
            const menuId = `menu-${ann.id}`;

            const card = document.createElement('div');
            card.className = 'social-card';
            card.style.marginBottom = '20px';
            
            card.innerHTML = `
                <div class="post-header">
                    <div class="post-author-info">
                        <img src="${authorAvatar}" alt="Author" class="avatar-img" onerror="this.src='assets/admin-avatar.png'">
                        <div class="author-text">
                            <h4>${authorName}</h4>
                            <div class="author-meta">
                                <span>${dateStr}</span> &bull; <span>${targetText}</span> 
                                <span class="status-pill ${statusPill}">${statusText}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="post-options-container">
                        <button class="post-options" onclick="togglePostMenu('${menuId}', event)">•••</button>
                        <div class="post-options-menu" id="${menuId}">
                            <button onclick="editAnnouncement('${ann.id}')">✏️ Edit Post</button>
                            <button class="delete-btn" onclick="deleteAnnouncement('${ann.id}')">🗑️ Delete Post</button>
                        </div>
                    </div>

                </div>
                <div class="post-content">
                    <h3>${ann.title}</h3>
                    <p>${ann.content.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="post-actions">
                    <button onclick="openComments('${ann.id}', '${ann.title.replace(/'/g, "\\'")}')">💬 Comment (${commentCount})</button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Dropdown toggle logic
    window.togglePostMenu = (menuId, event) => {
        event.stopPropagation();
        document.querySelectorAll('.post-options-menu').forEach(menu => {
            if (menu.id !== menuId) menu.classList.remove('show');
        });
        const menu = document.getElementById(menuId);
        if (menu) menu.classList.toggle('show');
    };

    // Close post menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-options-container')) {
            document.querySelectorAll('.post-options-menu').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });

    function applyFilters() {
        const term = document.getElementById('search-input').value.toLowerCase();
        const filtered = allAnnouncements.filter(a => {
            return a.title.toLowerCase().includes(term) || a.content.toLowerCase().includes(term);
        });
        renderAnnouncements(filtered);
    }

    document.getElementById('search-input').addEventListener('input', applyFilters);


    // ==========================================
    // 3b. FETCH & RENDER RECENT COMMENTS SIDEBAR
    // ==========================================
    async function fetchRecentComments() {
        const sidebarContainer = document.getElementById('recent-comments-container');
        const countBadge = document.getElementById('recent-comments-count');
        
        const annIds = allAnnouncements.map(a => a.id);
        if (annIds.length === 0) {
            sidebarContainer.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;">No comments yet.</div>`;
            return;
        }

        try {
            // Fetch top 5 most recent comments across all announcements this admin owns
            const { data, error } = await window.supabaseClient
                .from('announcement_comments')
                .select(`
                    *,
                    profiles ( first_name, last_name, avatar_url ),
                    announcements ( title )
                `)
                .in('announcement_id', annIds)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;

            if (!data || data.length === 0) {
                sidebarContainer.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;">No comments yet.</div>`;
                return;
            }

            countBadge.innerText = `${data.length} New`;
            sidebarContainer.innerHTML = '';

            data.forEach(c => {
                const authorName = c.profiles ? `${c.profiles.first_name || ''} ${c.profiles.last_name || ''}`.trim() : "Unknown Student";
                const avatar = (c.profiles && c.profiles.avatar_url) ? c.profiles.avatar_url : "assets/default-avatar.png";
                
                const timeDiff = Math.abs(new Date() - new Date(c.created_at));
                const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
                let timeStr = hoursDiff > 0 ? `${hoursDiff} hours ago` : 'Just now';

                const annTitle = c.announcements ? c.announcements.title : 'an announcement';

                const html = `
                    <div class="sidebar-comment">
                        <div class="sidebar-comment-header">
                            <img src="${avatar}" alt="Avatar" class="avatar-img" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/><text x=%2250%22 y=%2250%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2240%22 fill=%22%2364748b%22>👤</text></svg>'">
                            <div>
                                <h5>${authorName}</h5>
                                <div class="sidebar-comment-text">${c.content.length > 80 ? c.content.substring(0, 80) + '...' : c.content}</div>
                            </div>
                        </div>
                        <div class="sidebar-comment-meta">
                            <span>${timeStr}</span>
                            <a onclick="openComments('${c.announcement_id}', '${annTitle.replace(/'/g, "\\'")}')">Reply</a>
                        </div>
                        <a class="sidebar-comment-link" onclick="openComments('${c.announcement_id}', '${annTitle.replace(/'/g, "\\'")}')">
                            ↳ on ${annTitle}
                        </a>
                    </div>
                `;
                sidebarContainer.insertAdjacentHTML('beforeend', html);
            });

        } catch (err) {
            console.error("Sidebar comments error:", err);
            sidebarContainer.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;">Unable to load comments.</div>`;
        }
    }


    // ==========================================
    // 4. CREATE / EDIT ANNOUNCEMENTS MODAL
    // ==========================================
    const annModal = document.getElementById('announcement-modal');
    const annForm = document.getElementById('announcement-form');

    // Both the Top Action Button AND the Inline "What's on your mind" box open the Create Post Modal
    document.getElementById('btn-open-create').addEventListener('click', openCreateModal);
    if(document.getElementById('btn-trigger-post')) {
        document.getElementById('btn-trigger-post').addEventListener('click', openCreateModal);
    }

    function openCreateModal() {
        annForm.reset();
        document.getElementById('announcement-id').value = '';
        document.getElementById('modal-title').innerText = "Create Post";
        annModal.style.display = 'flex';
    }

    window.editAnnouncement = (id) => {
        const ann = allAnnouncements.find(x => x.id === id);
        if(!ann) return;
        
        document.getElementById('announcement-id').value = ann.id;
        document.getElementById('ann-title').value = ann.title;
        document.getElementById('ann-type').value = ann.type || 'General';
        document.getElementById('ann-target').value = ann.target_scholarship_id || 'all';
        document.getElementById('ann-content').value = ann.content;
        
        document.getElementById('modal-title').innerText = "Edit Post";
        annModal.style.display = 'flex';
    };

    document.getElementById('btn-save-announcement').addEventListener('click', async () => {
        const btn = document.getElementById('btn-save-announcement');
        const id = document.getElementById('announcement-id').value;
        const targetVal = document.getElementById('ann-target').value;

        const payload = {
            school_id: currentAdminSchoolId,
            title: document.getElementById('ann-title').value.trim(),
            type: document.getElementById('ann-type').value,
            content: document.getElementById('ann-content').value.trim(),
            target_scholarship_id: targetVal === 'all' ? null : targetVal,
            author_id: adminId
        };

        if(!payload.title || !payload.content) {
            alert("Title and content are required."); return;
        }

        btn.disabled = true; btn.innerText = "Posting...";
        try {
            if (id) {
                const { error } = await window.supabaseClient.from('announcements').update(payload).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient.from('announcements').insert([payload]);
                if (error) throw error;
            }
            annModal.style.display = 'none';
            fetchAnnouncements(); // Refresh feed and sidebar
        } catch (err) {
            console.error(err);
            alert("Failed to save announcement.");
        } finally {
            btn.disabled = false; btn.innerText = "Post Announcement";
        }
    });

    window.deleteAnnouncement = async (id) => {
        if(confirm("Are you sure you want to delete this announcement? All comments will also be deleted.")) {
            try {
                const { error } = await window.supabaseClient.from('announcements').delete().eq('id', id);
                if(error) throw error;
                fetchAnnouncements();
            } catch(err) {
                alert("Error deleting record.");
            }
        }
    };


    // ==========================================
    // 5. CHAT / COMMENTS SYSTEM LOGIC
    // ==========================================
    const commentsModal = document.getElementById('comments-modal');
    const commentsList = document.getElementById('comments-list');
    
    window.openComments = async (annId, annTitle) => {
        document.getElementById('reply-ann-id').value = annId;
        document.getElementById('comments-ann-title').innerText = annTitle;
        commentsModal.style.display = 'flex';
        commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px;">Loading comments...</div>`;

        try {
            // Fetch comments joined with user profile data
            const { data, error } = await window.supabaseClient
                .from('announcement_comments')
                .select(`
                    id, content, created_at, user_id,
                    profiles ( first_name, last_name, role )
                `)
                .eq('announcement_id', annId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            renderComments(data);
        } catch (err) {
            console.error(err);
            commentsList.innerHTML = `<div class="text-center text-red" style="padding: 20px;">Error loading comments.</div>`;
        }
    };

    function renderComments(comments) {
        if (!comments || comments.length === 0) {
            commentsList.innerHTML = `<div class="text-center text-muted" style="padding: 20px; font-size: 13px;">No comments yet.</div>`;
            return;
        }

        commentsList.innerHTML = '';
        comments.forEach(c => {
            const isMe = c.user_id === adminId;
            const isAdmin = c.profiles?.role === 'admin';
            
            let authorName = "Unknown User";
            if (c.profiles) {
                authorName = `${c.profiles.first_name || ''} ${c.profiles.last_name || ''}`.trim();
                if (isAdmin) authorName += " (Admin)";
            }

            const dateStr = new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

            const bubble = document.createElement('div');
            bubble.className = `comment-bubble ${isAdmin ? 'admin' : 'student'}`;
            
            const displayName = isMe ? "You" : authorName;

            bubble.innerHTML = `
                <div class="comment-author">${displayName}</div>
                <div class="comment-text">${c.content}</div>
                <div class="comment-date">${dateStr}</div>
            `;
            commentsList.appendChild(bubble);
        });

        commentsList.scrollTop = commentsList.scrollHeight; // Auto scroll to bottom
    }

    document.getElementById('btn-send-reply').addEventListener('click', async () => {
        const input = document.getElementById('reply-input');
        const annId = document.getElementById('reply-ann-id').value;
        const text = input.value.trim();
        const btn = document.getElementById('btn-send-reply');

        if(!text) return;

        btn.disabled = true; btn.innerText = "...";
        try {
            const payload = {
                announcement_id: annId,
                user_id: adminId,
                content: text
            };

            const { error } = await window.supabaseClient.from('announcement_comments').insert([payload]);
            if (error) throw error;
            
            input.value = '';
            // Refresh comments modal
            openComments(annId, document.getElementById('comments-ann-title').innerText);
            // Refresh background UI to update the sidebar & comment counts
            fetchAnnouncements(); 
            
        } catch (err) {
            console.error(err);
            alert("Failed to send reply.");
        } finally {
            btn.disabled = false; btn.innerText = "Send";
        }
    });

    // Boot
    initProfile();
});