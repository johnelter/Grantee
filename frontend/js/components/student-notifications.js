document.addEventListener('DOMContentLoaded', async () => {
    const notifBell = document.getElementById('notification-bell');
    if (!notifBell) return;

    let notifDropdown = document.getElementById('notification-dropdown');
    let notifBadge = document.getElementById('notification-badge');

    // Fallback: Create dropdown if it doesn't exist in the HTML
    if (!notifDropdown) {
        notifDropdown = document.createElement('div');
        notifDropdown.id = 'notification-dropdown';
        notifDropdown.className = 'notification-dropdown';
        notifDropdown.style = 'display: none; position: absolute; right: 0; top: 100%; margin-top: 10px; width: 320px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 1000; overflow: hidden;';
        
        notifDropdown.innerHTML = `
            <div class="notification-header" style="padding: 10px 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; font-size: 14px;">
                <strong>Notifications</strong>
            </div>
            <div id="notification-list" class="notification-list-body" style="max-height: 300px; overflow-y: auto;">
            </div>
        `;
        
        const parent = notifBell.parentElement;
        parent.style.position = 'relative';
        parent.appendChild(notifDropdown);
    }
    
    let notifList = document.getElementById('notification-list');
    if (!notifList) return;

    let studentId = null;
    
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) studentId = session.user.id;
    } catch(e) {
        console.error("Auth session error:", e);
    }

    if (!studentId) return;

    // Helper to determine redirect URL based on keywords
    function getRedirectUrl(notification) {
        const title = (notification.title || '').toLowerCase();
        const msg = (notification.message || '').toLowerCase();
        const combined = title + ' ' + msg;

        if (combined.includes('announcement')) return 'student-announcements.html';
        if (combined.includes('application') || combined.includes('approved') || combined.includes('rejected') || combined.includes('revision')) return 'student-applications.html';
        if (combined.includes('deadline') || combined.includes('assistance') || combined.includes('scholarship')) return 'student-scholarships.html';
        
        return 'student-dashboard.html'; // Default for general system updates
    }

    // Function to fetch and render notifications
    async function loadNotifications() {
        try {
            const { data: notifications, error } = await window.supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', studentId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!notifications || notifications.length === 0) {
                notifList.innerHTML = '<div style="padding: 20px; text-align: center; color: #64748b; font-size: 13px;">No new notifications</div>';
                if (notifBadge) notifBadge.style.display = 'none';
                return;
            }

            const unreadCount = notifications.filter(n => !n.is_read).length;
            
            if (notifBadge) {
                if (unreadCount > 0) {
                    notifBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                    notifBadge.style.display = 'flex';
                } else {
                    notifBadge.style.display = 'none';
                }
            }

            notifList.innerHTML = notifications.map(n => {
                const redirectUrl = getRedirectUrl(n);
                const bgStyle = n.is_read ? '#ffffff' : '#f8fafc';
                const indicator = n.is_read ? '' : '<span style="display:inline-block; width:8px; height:8px; background:#10b981; border-radius:50%; margin-right:6px;"></span>';
                
                return `
                <div class="notification-item" onclick="window.location.href='${redirectUrl}'" style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; background: ${bgStyle}; text-align: left; cursor: pointer; transition: background 0.2s;" data-read="${n.is_read}">
                    <strong style="display: flex; align-items: center; font-size: 13px; color: #0f172a;">
                        ${indicator}${n.title || 'System Notification'}
                    </strong>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #475569; line-height: 1.4;">${n.message}</p>
                    <span style="display: block; margin-top: 6px; font-size: 10px; color: #94a3b8;">
                        ${new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                `;
            }).join('');

            // Add hover effects for interactivity
            const items = notifList.querySelectorAll('.notification-item');
            items.forEach(item => {
                item.addEventListener('mouseenter', () => { item.style.background = '#f1f5f9'; });
                item.addEventListener('mouseleave', () => { 
                    item.style.background = item.getAttribute('data-read') === 'true' ? '#ffffff' : '#f8fafc'; 
                });
            });

        } catch (err) {
            console.error("Error loading notifications:", err);
            notifList.innerHTML = '<div style="padding: 15px; text-align: center; color: #ef4444; font-size: 13px;">Error loading notifications.</div>';
        }
    }

    // Toggle Dropdown & Mark as Read
    notifBell.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isHidden = notifDropdown.style.display === 'none' || notifDropdown.style.display === '';
        
        if (isHidden) {
            notifDropdown.style.display = 'block';
            notifDropdown.classList.add('show');
            
            // If there are unread notifications, clear badge immediately for responsive UI, then update DB
            if (notifBadge && notifBadge.style.display !== 'none') {
                notifBadge.style.display = 'none'; 
                
                const { error } = await window.supabaseClient
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', studentId)
                    .eq('is_read', false);

                if (error) {
                    console.error("Could not mark as read in database:", error);
                } else {
                    // Refresh list silently in the background to update item backgrounds
                    loadNotifications();
                }
            }
        } else {
            notifDropdown.style.display = 'none';
            notifDropdown.classList.remove('show');
        }
    });

    // Close Dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!notifBell.contains(e.target) && !notifDropdown.contains(e.target)) {
            notifDropdown.style.display = 'none';
            notifDropdown.classList.remove('show');
        }
    });

    // Initialize initial load
    await loadNotifications();

    // ----------------------------------------------------
    // Supabase Realtime Subscription
    // Listens for new notifications pushed by the backend
    // ----------------------------------------------------
    const notificationChannel = window.supabaseClient
        .channel('public:notifications')
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
                // Reload list and update badge instantly when a new row is added
                loadNotifications();
            }
        )
        .subscribe();
});