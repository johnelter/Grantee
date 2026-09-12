/**
 * Student Notifications Engine
 * Supports initial load, SPA dynamic transitions, realtime Supabase push, and delegated UI controls.
 */

(function () {
    let studentId = null;
    let notifChannel = null;
    let isInitialized = false;

    // Helper to determine redirect URL based on action_link or keywords
    function getRedirectUrl(notification) {
        if (notification.action_link && notification.action_link !== '#' && !notification.action_link.startsWith('http://localhost')) {
            return notification.action_link;
        }

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
                    notifList.innerHTML = '<div class="notification-empty">No new notifications</div>';
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
                    const readClass = n.is_read ? 'notification-read' : 'notification-unread';
                    const indicator = n.is_read ? '' : '<span class="notification-dot"></span>';
                    
                    return `
                    <div class="notification-item ${readClass}" data-id="${n.id}" data-url="${redirectUrl}" data-read="${n.is_read}">
                        <div class="notification-item-header">
                            <strong class="notification-title">
                                ${indicator}${n.title || 'Notification'}
                            </strong>
                            <span class="notification-time">
                                ${new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                        <p class="notification-message">${n.message}</p>
                    </div>
                    `;
                }).join('');
            }

        } catch (err) {
            console.error("Error loading notifications:", err);
            if (notifList) {
                notifList.innerHTML = '<div class="notification-empty is-error">Error loading notifications.</div>';
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
                                                el.classList.remove('notification-unread');
                                                el.classList.add('notification-read');
                                                const dot = el.querySelector('.notification-dot');
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