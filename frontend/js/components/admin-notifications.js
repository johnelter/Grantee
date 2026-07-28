// js/components/admin-notifications.js
document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('notification-container');
    if (!container) return;

    // 1. Inject HTML Structure
    container.innerHTML = `
        <div class="notification-bell dropdown-toggle relative cursor-pointer" id="notification-toggle">
            <i class="fas fa-bell text-gray-600 text-xl hover:text-blue-600 transition-colors"></i>
            <span class="badge absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden" id="nav-notification-badge" style="display: none;"></span>
            
            <div class="profile-dropdown-menu notification-menu absolute right-0 mt-3 w-80 bg-white rounded-lg shadow-xl border border-gray-100 z-50 cursor-default" id="notification-menu">
                <div class="notif-header p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h4 class="font-semibold text-gray-800 text-sm"><i class="fas fa-inbox mr-2 text-gray-500"></i>Notifications</h4>
                    <div class="flex gap-3">
                        <button class="text-[11px] text-gray-500 hover:text-red-600 font-medium focus:outline-none" id="clear-read-btn" title="Clear read notifications"><i class="fas fa-trash-alt"></i></button>
                        <button class="mark-read text-[11px] text-blue-600 hover:text-blue-800 font-medium focus:outline-none" id="mark-all-read-btn">Mark all read</button>
                    </div>
                </div>
                <div class="notif-list max-h-[400px] overflow-y-auto" id="notification-list">
                    <div class="text-center p-6 text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>Loading...</div>
                </div>
            </div>
        </div>
    `;

    const notifToggle = document.getElementById('notification-toggle');
    const notifMenu = document.getElementById('notification-menu');
    const badge = document.getElementById('nav-notification-badge');
    const listContainer = document.getElementById('notification-list');
    const markAllBtn = document.getElementById('mark-all-read-btn');
    const clearReadBtn = document.getElementById('clear-read-btn');

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) return;
    const userId = session.user.id; 

    // Helper: Map DB Type and Priority to Tailwind Styles
    const getNotificationStyle = (type, priority) => {
        let icon = 'fa-bell';
        let colorClass = 'text-gray-500 bg-gray-100';
        let borderClass = 'border-l-4 border-transparent'; 

        // Priority Indicators (Left Border)
        if (priority === 'high') borderClass = 'border-l-4 border-red-500';
        else if (priority === 'medium') borderClass = 'border-l-4 border-yellow-400';
        else if (priority === 'low') borderClass = 'border-l-4 border-green-500';

        // Type Icons & Colors
        switch (type) {
            case 'application': icon = 'fa-file-signature'; colorClass = 'text-blue-600 bg-blue-100'; break;
            case 'document': icon = 'fa-file-upload'; colorClass = 'text-indigo-600 bg-indigo-100'; break;
            case 'comment': icon = 'fa-comment-dots'; colorClass = 'text-purple-600 bg-purple-100'; break;
            case 'deadline': icon = 'fa-clock'; colorClass = 'text-orange-600 bg-orange-100'; break;
            case 'status': icon = 'fa-user-check'; colorClass = 'text-emerald-600 bg-emerald-100'; break;
            case 'import': icon = 'fa-file-csv'; colorClass = 'text-teal-600 bg-teal-100'; break;
            case 'announcement': icon = 'fa-bullhorn'; colorClass = 'text-cyan-600 bg-cyan-100'; break;
            case 'alert':
            case 'system': icon = 'fa-exclamation-triangle'; colorClass = 'text-red-600 bg-red-100'; break;
        }
        return { icon, colorClass, borderClass };
    };

    const loadNotifications = async () => {
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
    };

    const renderNotifications = (notifications) => {
        const unreadCount = notifications.filter(n => n.is_read !== true).length;
        
        if (unreadCount > 0) {
            badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
            badge.classList.remove('hidden');
        } else {
            badge.innerText = '';
            badge.style.display = 'none';
            badge.classList.add('hidden');
        }

        if (notifications.length === 0) {
            listContainer.innerHTML = '<div class="text-center p-6 text-gray-400 text-sm">No new notifications</div>';
            return;
        }

        listContainer.innerHTML = notifications.map(notif => {
            const timeString = notif.created_at ? new Date(notif.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now';
            const isRead = notif.is_read === true;
            
            // Apply styling logic
            const style = getNotificationStyle(notif.type, notif.priority);
            
            // Create wrapper based on whether an action_link exists
            const wrapperTag = notif.action_link ? 'a' : 'div';
            const hrefAttr = notif.action_link ? `href="${notif.action_link}"` : '';
            const cursorClass = notif.action_link ? 'cursor-pointer hover:bg-gray-50' : '';

            return `
                <${wrapperTag} ${hrefAttr} class="block p-3 border-b border-gray-100 transition-colors ${style.borderClass} ${isRead ? 'opacity-60 bg-white' : 'bg-blue-50/10'} ${cursorClass}" data-id="${notif.id}">
                    <div class="flex items-start gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${style.colorClass}">
                            <i class="fas ${style.icon}"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-xs font-bold text-gray-800 mb-0.5">${notif.title}</p>
                            <p class="text-[11px] text-gray-600 leading-tight">${notif.message}</p>
                            <span class="text-[10px] text-gray-400 mt-1 block">${timeString}</span>
                        </div>
                        ${!isRead ? '<span class="w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0"></span>' : ''}
                    </div>
                </${wrapperTag}>
            `;
        }).join('');

        // Attach click listener to mark single notification as read when clicked
        document.querySelectorAll('#notification-list a').forEach(link => {
            link.addEventListener('click', async (e) => {
                const notifId = e.currentTarget.getAttribute('data-id');
                // Don't block navigation, just fire and forget the update
                window.supabaseClient.from('notifications').update({ is_read: true }).eq('id', notifId).then();
            });
        });
    };

    // Mark All as Read
    markAllBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        badge.innerText = '';
        badge.style.display = 'none';
        badge.classList.add('hidden');
        document.querySelectorAll('#notification-list .bg-blue-600').forEach(dot => dot.remove());
        document.querySelectorAll('#notification-list > *').forEach(el => {
            el.classList.add('opacity-60', 'bg-white');
            el.classList.remove('bg-blue-50/10');
        });

        await window.supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .neq('is_read', true); 
    });

    // Clear Old (Read) Notifications
    clearReadBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // Optimistically clear them from UI
        const readItems = Array.from(document.querySelectorAll('#notification-list > *')).filter(el => el.classList.contains('opacity-60'));
        readItems.forEach(el => el.remove());

        if (document.getElementById('notification-list').children.length === 0) {
            listContainer.innerHTML = '<div class="text-center p-6 text-gray-400 text-sm">No new notifications</div>';
        }

        // Delete from DB
        await window.supabaseClient
            .from('notifications')
            .delete()
            .eq('user_id', userId)
            .eq('is_read', true);
    });

    // Dropdown Toggle Logic
    notifToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        notifMenu.classList.toggle('show');
        notifToggle.classList.toggle('active-state');
        
        const profileMenu = document.getElementById('profile-menu');
        const profileToggle = document.getElementById('profile-dropdown-toggle');
        if (profileMenu && profileMenu.classList.contains('show')) {
            profileMenu.classList.remove('show');
            if (profileToggle) profileToggle.classList.remove('active-state');
        }
    });

    notifMenu.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
        if (notifMenu.classList.contains('show') && !notifToggle.contains(e.target)) {
            notifMenu.classList.remove('show');
            notifToggle.classList.remove('active-state');
        }
    });

    await loadNotifications();

    // Set up Realtime Subscription
    window.supabaseClient
        .channel('admin-notifications')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            (payload) => {
                console.log('Realtime notification received:', payload);
                loadNotifications();
            }
        )
        .subscribe();
});