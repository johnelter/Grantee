document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize local Supabase connection
    const supabaseUrl = 'https://hcclmoretabvymrgukdl.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2xtb3JldGFidnltcmd1a2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MTMxNTAsImV4cCI6MjA5NTA4OTE1MH0.jY_9BXEsmN7_-UMYHDOdp2MetismTVGbT2-33PVVEy8';
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    // 2. Security Check: Verify session state
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        alert("Access Denied. Please sign in first.");
        window.location.href = "login.html";
        return;
    }

    const user = session.user;

    // 3. Get profile details to update user names on the screen
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single();

    if (profile) {
        const fullName = `${profile.first_name} ${profile.last_name}`;
        if (document.getElementById('user-display-name')) document.getElementById('user-display-name').textContent = fullName;
        if (document.querySelector('.student-name')) document.querySelector('.student-name').textContent = fullName;
    }

    // 4. Fetch dashboard data from your local Node API
    try {
        const response = await fetch(`http://localhost:3000/api/student-dashboard/${user.id}`);
        const data = await response.json();

        if (response.ok) {
            console.log("Dashboard database values loaded:", data);
            // Dynamic data binding can be written here to render lists into elements
        }
    } catch (err) {
        console.error("Failed to sync backend metrics:", err);
    }

    // 5. Light/Dark Mode Switcher Control
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const htmlTag = document.documentElement;
            const currentTheme = htmlTag.getAttribute('data-theme');
            htmlTag.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // 6. Handle Safe Logout Routine
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabaseClient.auth.signOut();
            alert("Logged out successfully.");
            window.location.href = "login.html";
        });
    }

    // ==========================================
    // 7. Notification Bell Logic
    // ==========================================
    const notifBell = document.getElementById('notification-bell');
    const notifDropdown = document.getElementById('notification-dropdown');
    const notifBadge = document.getElementById('notification-badge');
    const notifList = document.getElementById('notification-list');

    // Fetch and render notifications
    async function loadNotifications() {
        try {
            // Assumes you have a 'notifications' table with: id, user_id, title, message, is_read, created_at
            const { data: notifications, error } = await supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!notifications || notifications.length === 0) {
                if (notifList) notifList.innerHTML = '<div style="padding: 15px; text-align: center; color: #64748b; font-size: 13px;">No new notifications</div>';
                if (notifBadge) notifBadge.style.display = 'none';
                return;
            }

            // Update badge count for unread notifications
            const unreadCount = notifications.filter(n => !n.is_read).length;
            if (notifBadge) {
                if (unreadCount > 0) {
                    notifBadge.textContent = unreadCount;
                    notifBadge.style.display = 'flex';
                } else {
                    notifBadge.style.display = 'none';
                }
            }

            // Render list
            if (notifList) {
                notifList.innerHTML = notifications.map(n => `
                    <div class="notification-item" style="padding: 12px 15px; border-bottom: 1px solid #e2e8f0; background: ${n.is_read ? '#fff' : '#f8fafc'};">
                        <strong style="display: block; font-size: 13px; color: #0f172a;">${n.title || 'Notification'}</strong>
                        <p style="margin: 4px 0 0; font-size: 12px; color: #475569; line-height: 1.4;">${n.message}</p>
                        <span style="display: block; margin-top: 6px; font-size: 10px; color: #94a3b8;">${new Date(n.created_at).toLocaleString()}</span>
                    </div>
                `).join('');
            }
        } catch (err) {
            console.error("Error loading notifications:", err);
            if (notifList) notifList.innerHTML = '<div style="padding: 15px; text-align: center; color: #ef4444; font-size: 13px;">Failed to load notifications.</div>';
        }
    }

    // Toggle Dropdown Menu
    if (notifBell && notifDropdown) {
        notifBell.addEventListener('click', async (e) => {
            e.stopPropagation();
            const isOpen = notifDropdown.classList.contains('show');
            
            // Toggle visibility
            if (isOpen) {
                notifDropdown.classList.remove('show');
                notifDropdown.style.display = 'none';
            } else {
                notifDropdown.classList.add('show');
                notifDropdown.style.display = 'block';
                
                // Mark as read in database when opened
                if (notifBadge && notifBadge.style.display !== 'none') {
                    notifBadge.style.display = 'none'; // hide badge instantly for UX
                    await supabaseClient
                        .from('notifications')
                        .update({ is_read: true })
                        .eq('user_id', user.id)
                        .eq('is_read', false);
                }
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!notifBell.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.classList.remove('show');
                notifDropdown.style.display = 'none';
            }
        });
    }

    // Initialize notification fetch on load
    loadNotifications();
});