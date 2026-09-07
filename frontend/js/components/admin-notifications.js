// js/components/admin-notifications.js
(function () {
    let notifChannel = null;

    const bellSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;

    window.initAdminNotifications = async function () {
        const container = document.getElementById('notification-container');
        if (!container) return;

        // 1. Inject HTML Structure with inline SVG icon for instant zero-flash display
        container.innerHTML = `
            <button type="button" class="notification-bell" id="notification-toggle" title="Notifications" aria-label="Notifications">
                <i data-lucide="bell">${bellSvg}</i>
                <span class="badge" id="nav-notification-badge" style="display: none;"></span>
            </button>
            
            <div class="profile-dropdown-menu notification-menu" id="notification-menu" style="display: none;">
                <div class="notif-header">
                    <div class="notif-header-title">
                        <i data-lucide="bell" style="width: 16px; height: 16px;"></i>
                        <h4>Notifications</h4>
                    </div>
                    <div class="notif-header-actions">
                        <button type="button" class="btn-clear-read" id="clear-read-btn" title="Clear read notifications">
                            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                        </button>
                        <button type="button" class="btn-mark-all" id="mark-all-read-btn">
                            Mark all as read
                        </button>
                    </div>
                </div>
                <div class="notif-list" id="notification-list">
                    <div class="notif-empty">
                        <i data-lucide="loader-2" class="animate-spin" style="width: 20px; height: 20px; color: #94a3b8;"></i>
                        <span>Loading notifications...</span>
                    </div>
                </div>
            </div>
        `;

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        const notifToggle = document.getElementById('notification-toggle');
        const notifMenu = document.getElementById('notification-menu');
        const badge = document.getElementById('nav-notification-badge');
        const listContainer = document.getElementById('notification-list');
        const markAllBtn = document.getElementById('mark-all-read-btn');
        const clearReadBtn = document.getElementById('clear-read-btn');

        if (!window.supabaseClient) return;

        let session = null;
        try {
            const { data } = await window.supabaseClient.auth.getSession();
            session = data ? data.session : null;
        } catch (e) {
            console.warn("Notification session error:", e);
        }

        if (!session || !session.user) return;
        const userId = session.user.id;

        // Helper: Map DB Type to Icon and Themed Color
        const getNotificationStyle = (type) => {
            switch (type) {
                case 'application':
                    return { icon: 'file-text', color: '#2563eb', bg: '#eff6ff' };
                case 'document':
                    return { icon: 'upload', color: '#4f46e5', bg: '#eef2ff' };
                case 'comment':
                    return { icon: 'message-square', color: '#9333ea', bg: '#f3e8ff' };
                case 'deadline':
                    return { icon: 'clock', color: '#d97706', bg: '#fef3c7' };
                case 'status':
                    return { icon: 'user-check', color: '#059669', bg: '#ecfdf5' };
                case 'import':
                    return { icon: 'file-spreadsheet', color: '#0d9488', bg: '#f0fdfa' };
                case 'announcement':
                    return { icon: 'megaphone', color: '#0891b2', bg: '#ecfeff' };
                case 'alert':
                case 'system':
                    return { icon: 'alert-triangle', color: '#e11d48', bg: '#fff1f2' };
                default:
                    return { icon: 'bell', color: '#64748b', bg: '#f1f5f9' };
            }
        };

        const loadNotifications = async () => {
            try {
                const { data, error } = await window.supabaseClient
                    .from('notifications')
                    .select('*')
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(30);

                if (error) {
                    console.error('Error fetching notifications:', error);
                    return;
                }
                renderNotifications(data || []);
            } catch (err) {
                console.warn('Load notifications failed:', err);
            }
        };

        const renderNotifications = (notifications) => {
            const unreadCount = notifications.filter(n => n.is_read !== true).length;

            if (badge) {
                if (unreadCount > 0) {
                    badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
                    badge.style.display = 'flex';
                } else {
                    badge.innerText = '';
                    badge.style.display = 'none';
                }
            }

            if (!listContainer) return;

            if (notifications.length === 0) {
                listContainer.innerHTML = `
                    <div class="notif-empty">
                        <i data-lucide="inbox" style="width: 28px; height: 28px; color: #cbd5e1; stroke-width: 1.5;"></i>
                        <span style="font-weight: 500; color: #64748b;">No new notifications</span>
                        <span style="font-size: 11px; color: #94a3b8;">You're all caught up!</span>
                    </div>
                `;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                return;
            }

            listContainer.innerHTML = notifications.map(notif => {
                const timeString = notif.created_at ? new Date(notif.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
                const isRead = notif.is_read === true;
                const style = getNotificationStyle(notif.type);
                const wrapperTag = notif.action_link ? 'a' : 'div';
                const hrefAttr = notif.action_link ? `href="${notif.action_link}"` : '';

                return `
                    <${wrapperTag} ${hrefAttr} class="notif-item ${isRead ? 'is-read' : 'is-unread'}" data-id="${notif.id}">
                        <div class="notif-icon-box" style="background-color: ${style.bg}; color: ${style.color};">
                            <i data-lucide="${style.icon}" style="width: 16px; height: 16px;"></i>
                        </div>
                        <div class="notif-content">
                            <h5 class="notif-title">${notif.title || 'Notification'}</h5>
                            <p class="notif-message">${notif.message || ''}</p>
                            <span class="notif-time">
                                <i data-lucide="clock" style="width: 11px; height: 11px;"></i>
                                ${timeString}
                            </span>
                        </div>
                        ${!isRead ? '<span class="notif-unread-dot"></span>' : ''}
                    </${wrapperTag}>
                `;
            }).join('');

            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }

            // Click listener on notification links
            listContainer.querySelectorAll('a[data-id]').forEach(link => {
                link.addEventListener('click', async (e) => {
                    const notifId = e.currentTarget.getAttribute('data-id');
                    try {
                        await window.supabaseClient.from('notifications').update({ is_read: true }).eq('id', notifId);
                    } catch (err) { }
                });
            });
        };

        // Mark all as read
        if (markAllBtn) {
            markAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (badge) {
                    badge.innerText = '';
                    badge.style.display = 'none';
                }
                listContainer.querySelectorAll('.notif-item').forEach(el => {
                    el.classList.remove('is-unread');
                    el.classList.add('is-read');
                    const dot = el.querySelector('.notif-unread-dot');
                    if (dot) dot.remove();
                });

                try {
                    await window.supabaseClient
                        .from('notifications')
                        .update({ is_read: true })
                        .eq('user_id', userId)
                        .neq('is_read', true);
                } catch (err) {
                    console.error("Mark all read error:", err);
                }
            });
        }

        // Clear read notifications
        if (clearReadBtn) {
            clearReadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const readItems = listContainer.querySelectorAll('.notif-item.is-read');
                readItems.forEach(el => el.remove());

                if (listContainer.children.length === 0) {
                    listContainer.innerHTML = `
                        <div class="notif-empty">
                            <i data-lucide="inbox" style="width: 28px; height: 28px; color: #cbd5e1; stroke-width: 1.5;"></i>
                            <span style="font-weight: 500; color: #64748b;">No new notifications</span>
                        </div>
                    `;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                }

                try {
                    await window.supabaseClient
                        .from('notifications')
                        .delete()
                        .eq('user_id', userId)
                        .eq('is_read', true);
                } catch (err) {
                    console.error("Clear read error:", err);
                }
            });
        }

        await loadNotifications();

        // Realtime Subscription (ensure single channel)
        if (!notifChannel) {
            try {
                notifChannel = window.supabaseClient
                    .channel('admin-notifications-realtime')
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
                        () => {
                            loadNotifications();
                        }
                    )
                    .subscribe();
            } catch (e) {
                console.warn("Realtime notif subscription error:", e);
            }
        }
    };

    // Auto-run on DOM ready and immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.initAdminNotifications());
    } else {
        window.initAdminNotifications();
    }
})();