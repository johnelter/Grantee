/**
 * Student Notifications Engine
 * Supports initial load, SPA dynamic transitions, realtime Supabase push, and delegated UI controls.
 */

(function () {
    let studentId = null;
    let notifChannel = null;
    let isInitialized = false;

    // Helper to determine redirect URL based on keywords
    function getRedirectUrl(notification) {
        const title = (notification.title || '').toLowerCase();
        const msg = (notification.message || '').toLowerCase();
        const combined = title + ' ' + msg;

        if (combined.includes('announcement')) return 'student-announcements.html';
        if (combined.includes('application') || combined.includes('approved') || combined.includes('rejected') || combined.includes('revision')) return 'student-applications.html';
        if (combined.includes('deadline') || combined.includes('assistance') || combined.includes('scholarship')) return 'student-scholarships.html';
        
        return 'student-dashboard.html';
    }

    // Function to fetch and render notifications
    async function loadNotifications() {
        const notifList = document.getElementById('notification-list');
        const notifBadge = document.getElementById('notification-badge');

        if (!studentId && window.supabaseClient) {
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session) studentId = session.user.id;
            } catch (e) {
                console.warn('Notifications auth session error:', e);
            }
        }

        if (!studentId || !window.supabaseClient) {
            // Restore from session cache if available
            const cachedUnread = sessionStorage.getItem('grantee_notif_unread');
            if (cachedUnread !== null && notifBadge) {
                const count = parseInt(cachedUnread, 10);
                if (count > 0) {
                    notifBadge.textContent = count > 9 ? '9+' : count;
                    notifBadge.style.display = 'flex';
                } else {
                    notifBadge.style.display = 'none';
                }
            }
            return;
        }

        try {
            const { data: notifications, error } = await window.supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', studentId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!notifications || notifications.length === 0) {
                if (notifList) {
                    notifList.innerHTML = '<div style="padding: 24px 16px; text-align: center; color: #64748b; font-size: 13px;">No new notifications</div>';
                }
                if (notifBadge) notifBadge.style.display = 'none';
                sessionStorage.setItem('grantee_notif_unread', '0');
                return;
            }

            const unreadCount = notifications.filter(n => !n.is_read).length;
            sessionStorage.setItem('grantee_notif_unread', unreadCount.toString());
            
            if (notifBadge) {
                if (unreadCount > 0) {
                    notifBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                    notifBadge.style.display = 'flex';
                } else {
                    notifBadge.style.display = 'none';
                }
            }

            if (notifList) {
                notifList.innerHTML = notifications.map(n => {
                    const redirectUrl = getRedirectUrl(n);
                    const bgStyle = n.is_read ? '#ffffff' : '#f8fafc';
                    const indicator = n.is_read ? '' : '<span style="display:inline-block; width:8px; height:8px; background:#10b981; border-radius:50%; margin-right:8px; flex-shrink:0;"></span>';
                    
                    return `
                    <div class="notification-item" data-id="${n.id}" data-url="${redirectUrl}" style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; background: ${bgStyle}; text-align: left; cursor: pointer; transition: background 0.2s;" data-read="${n.is_read}">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <strong style="display: flex; align-items: center; font-size: 13px; color: #0f172a; line-height: 1.3;">
                                ${indicator}${n.title || 'Notification'}
                            </strong>
                            <span style="font-size: 10px; color: #94a3b8; white-space: nowrap;">
                                ${new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #475569; line-height: 1.45;">${n.message}</p>
                    </div>
                    `;
                }).join('');

                // Hover effects
                const items = notifList.querySelectorAll('.notification-item');
                items.forEach(item => {
                    item.addEventListener('mouseenter', () => { item.style.background = '#f1f5f9'; });
                    item.addEventListener('mouseleave', () => { 
                        item.style.background = item.getAttribute('data-read') === 'true' ? '#ffffff' : '#f8fafc'; 
                    });
                });
            }

        } catch (err) {
            console.error("Error loading notifications:", err);
            if (notifList) {
                notifList.innerHTML = '<div style="padding: 16px; text-align: center; color: #ef4444; font-size: 13px;">Error loading notifications.</div>';
            }
        }
    }

    // Initialize & bind delegated event handlers
    function initDelegatedControls() {
        if (isInitialized) return;
        isInitialized = true;

        // Delegated click on notification bell toggle
        document.addEventListener('click', async (e) => {
            const bellBtn = e.target.closest('#notification-bell');
            const notifItem = e.target.closest('.notification-item');
            const notifDropdown = document.getElementById('notification-dropdown');
            const notifBadge = document.getElementById('notification-badge');
            const profileMenu = document.getElementById('profile-menu');
            const profileToggle = document.getElementById('profile-dropdown-toggle');

            // 1. Click on Bell Toggle
            if (bellBtn) {
                e.preventDefault();
                e.stopPropagation();

                // Close profile menu if open
                if (profileMenu) profileMenu.classList.remove('show');
                if (profileToggle) profileToggle.classList.remove('active-state');

                if (notifDropdown) {
                    const isHidden = notifDropdown.style.display === 'none' || !notifDropdown.classList.contains('show');

                    if (isHidden) {
                        notifDropdown.style.display = 'block';
                        notifDropdown.classList.add('show');

                        // Refresh notifications
                        await loadNotifications();

                        // Mark unread as read
                        if (studentId && window.supabaseClient) {
                            if (notifBadge && notifBadge.style.display !== 'none') {
                                notifBadge.style.display = 'none';
                                sessionStorage.setItem('grantee_notif_unread', '0');

                                window.supabaseClient
                                    .from('notifications')
                                    .update({ is_read: true })
                                    .eq('user_id', studentId)
                                    .eq('is_read', false)
                                    .then(() => {
                                        // Update read visuals
                                        if (notifDropdown) {
                                            notifDropdown.querySelectorAll('.notification-item').forEach(el => {
                                                el.setAttribute('data-read', 'true');
                                                el.style.background = '#ffffff';
                                                const dot = el.querySelector('strong span');
                                                if (dot) dot.remove();
                                            });
                                        }
                                    });
                            }
                        }
                    } else {
                        notifDropdown.style.display = 'none';
                        notifDropdown.classList.remove('show');
                    }
                }
                return;
            }

            // 2. Click on a Notification Item inside dropdown
            if (notifItem) {
                const targetUrl = notifItem.getAttribute('data-url');
                if (notifDropdown) {
                    notifDropdown.style.display = 'none';
                    notifDropdown.classList.remove('show');
                }
                if (targetUrl) {
                    window.location.href = targetUrl;
                }
                return;
            }

            // 3. Click Outside Dropdown
            if (notifDropdown && !notifDropdown.contains(e.target)) {
                notifDropdown.style.display = 'none';
                notifDropdown.classList.remove('show');
            }
        });
    }

    // Set up Realtime listener
    function setupRealtimeListener() {
        if (!studentId || !window.supabaseClient || notifChannel) return;

        try {
            notifChannel = window.supabaseClient
                .channel(`student-notifications-${studentId}`)
                .on(
                    'postgres_changes',
                    { 
                        event: 'INSERT', 
                        schema: 'public', 
                        table: 'notifications', 
                        filter: `user_id=eq.${studentId}` 
                    },
                    (payload) => {
                        console.log('New notification received:', payload);
                        loadNotifications();
                    }
                )
                .subscribe();
        } catch (e) {
            console.warn('Realtime channel error:', e);
        }
    }

    // Master initial/re-initial function
    async function initStudentNotifications() {
        initDelegatedControls();

        if (!studentId && window.supabaseClient) {
            try {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session) studentId = session.user.id;
            } catch (e) {
                console.warn('Session fetch error:', e);
            }
        }

        await loadNotifications();
        setupRealtimeListener();
    }

    // Expose globally for SPA router
    window.initStudentNotifications = initStudentNotifications;

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStudentNotifications);
    } else {
        initStudentNotifications();
    }
})();