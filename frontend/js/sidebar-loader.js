// --- 0. SPA DOMContentLoaded FIX ---
// Ensures scripts injected dynamically that listen to DOMContentLoaded will still run
(function () {
    function overrideListener(obj) {
        if (!obj) return;
        const original = obj.addEventListener;
        obj.addEventListener = function (type, listener, options) {
            if (type === 'DOMContentLoaded' && (document.readyState === 'interactive' || document.readyState === 'complete')) {
                setTimeout(() => listener.call(obj, new Event('DOMContentLoaded')), 0);
                return;
            }
            return original.call(obj, type, listener, options);
        };
    }
    overrideListener(document);
    overrideListener(window);
})();

// --- ADMIN PROFILE INSTANT HYDRATION HELPER ---
function hydrateAdminProfile(root = document) {
    try {
        const cachedProfile = sessionStorage.getItem('grantee_admin_profile');
        if (cachedProfile) {
            const profile = JSON.parse(cachedProfile);
            const nameEl = root.getElementById ? root.getElementById('header-name') : root.querySelector('#header-name');
            const roleEl = root.getElementById ? root.getElementById('header-role') : root.querySelector('#header-role');
            const avatarEl = root.getElementById ? root.getElementById('header-avatar') : root.querySelector('#header-avatar');
            const schoolEl = root.getElementById ? root.getElementById('admin-school-display') : root.querySelector('#admin-school-display');

            if (nameEl && profile.name && profile.name !== 'Loading...') nameEl.innerText = profile.name;
            if (roleEl && profile.role) roleEl.innerText = profile.role;
            if (avatarEl && profile.avatar_url) avatarEl.src = profile.avatar_url;
            if (schoolEl && profile.school_name) {
                schoolEl.innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>Assigned to: <strong>${profile.school_name}</strong></span>`;
            }
        }
    } catch (e) {
        console.warn('Hydrate admin profile error:', e);
    }
}

// --- ADMIN THEME ENGINE (Default: Light Mode, Persistent per user/browser) ---
function getAdminStoredTheme() {
    try {
        const cached = sessionStorage.getItem('grantee_admin_profile');
        if (cached) {
            const profile = JSON.parse(cached);
            if (profile && profile.id) {
                const userTheme = localStorage.getItem(`grantee_admin_theme_${profile.id}`);
                if (userTheme) return userTheme;
            }
        }
    } catch (e) {}
    return localStorage.getItem('grantee_admin_theme') || 'light';
}

function applyAdminTheme(theme) {
    if (!theme) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
        document.body.classList.toggle('light-theme', theme !== 'dark');
    }
    localStorage.setItem('grantee_admin_theme', theme);

    try {
        const cached = sessionStorage.getItem('grantee_admin_profile');
        if (cached) {
            const profile = JSON.parse(cached);
            if (profile && profile.id) {
                localStorage.setItem(`grantee_admin_theme_${profile.id}`, theme);
            }
        }
    } catch (e) {}

    // Update all theme toggle buttons on the page
    document.querySelectorAll('#theme-toggle, .btn-theme-toggle').forEach(btn => {
        if (theme === 'dark') {
            btn.innerHTML = '<i data-lucide="sun" style="color: #DCC8A3; width: 20px; height: 20px;"></i>';
            btn.setAttribute('title', 'Switch to Light Mode');
            btn.setAttribute('aria-label', 'Switch to Light Mode');
        } else {
            btn.innerHTML = '<i data-lucide="moon" style="color: #586F62; width: 20px; height: 20px;"></i>';
            btn.setAttribute('title', 'Switch to Dark Mode');
            btn.setAttribute('aria-label', 'Switch to Dark Mode');
        }
        if (window.lucide && lucide.createIcons) {
            try { lucide.createIcons({ root: btn }); } catch (e) { lucide.createIcons(); }
        }
    });
}

// Immediate initial execution
applyAdminTheme(getAdminStoredTheme());

// Automatically fetch and cache admin profile in the background
async function fetchAndCacheAdminProfile() {
    if (!window.supabaseClient) return;
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) return;

        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('*, schools(name)')
            .eq('id', user.id)
            .single();

        if (profile) {
            const firstName = profile.first_name || 'Admin';
            const lastName = profile.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            const schoolName = profile.schools ? profile.schools.name : (profile.school_name || 'Unassigned School');
            const roleName = profile.role === 'admin' ? 'Coordinator' : (profile.role || 'Coordinator');

            const profileData = {
                id: user.id,
                name: fullName,
                role: roleName,
                avatar_url: profile.avatar_url || 'assets/admin-avatar.png',
                school_name: schoolName,
                school_id: profile.school_id
            };

            sessionStorage.setItem('grantee_admin_profile', JSON.stringify(profileData));
            hydrateAdminProfile(document);
            applyAdminTheme(getAdminStoredTheme());
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }
    } catch (err) {
        console.warn('Error fetching admin profile in sidebar-loader:', err);
    }
}

// Immediately hydrate profile on load
hydrateAdminProfile(document);

document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme and hydrate again on DOMContentLoaded
    applyAdminTheme(getAdminStoredTheme());
    hydrateAdminProfile(document);

    // If Supabase client is ready, fetch latest profile in background
    setTimeout(() => {
        fetchAndCacheAdminProfile();
    }, 100);

    // --- 1. INJECT SIDEBAR ---
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        const path = window.location.pathname;
        const isAdminPage = path.includes('admin') || path.includes('create-scholarship');
        const sidebarFile = isAdminPage ? 'components/admin-sidebar.html' : 'components/student-sidebar.html';

        try {
            const response = await fetch(sidebarFile);
            if (response.ok) {
                const html = await response.text();
                sidebarContainer.innerHTML = html;

                // Highlight active link
                highlightActiveSidebarMenu();

                initMobileMenu();
                initSidebarNavigation();

                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            }
        } catch (error) {
            console.error('Failed to load sidebar component:', error);
            if (window.location.protocol === 'file:') {
                alert("WARNING: The sidebar cannot be loaded because you are opening this file directly from your computer (file:// protocol). Browsers block local file fetching for security reasons. Please serve this folder using a local web server (like VS Code Live Server) to see the sidebar and use the SPA navigation.");
            }
        }
    }

    // --- 2. ENSURE LOGOUT MODAL EXISTS & INITIALIZE LOGIC ---
    if (!document.getElementById('logout-modal')) {
        try {
            const modalResponse = await fetch('components/logout-modal.html');
            if (modalResponse.ok) {
                const modalHtml = await modalResponse.text();
                if (!document.getElementById('logout-modal')) {
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                }
            }
        } catch (error) {
            console.error('Failed to load logout modal component:', error);
        }
    }
    initGlobalLogoutLogic();
});

// Helper to highlight active menu item based on current URL
function highlightActiveSidebarMenu() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;
    const currentPath = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
    const links = sidebarContainer.querySelectorAll('a.menu-item');
    links.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (linkHref === currentPath || (linkHref.includes('admin-scholarships') && currentPath.includes('create-scholarship'))) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// --- GLOBAL DELEGATED CONTROLS (Run once immediately) ---
let adminDelegatedInitialized = false;

function initGlobalAdminDelegatedHandlers() {
    if (adminDelegatedInitialized) return;
    adminDelegatedInitialized = true;

    // Helper: Ensure an overlay exists in DOM
    function getOrCreateOverlay() {
        let overlay = document.getElementById('sidebar-overlay') || document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'sidebar-overlay';
            overlay.className = 'sidebar-overlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    // Helper: Close mobile sidebar
    function closeMobileSidebar() {
        const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
        const overlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
        if (sidebar) sidebar.classList.remove('active', 'show');
        overlays.forEach(o => o.classList.remove('active', 'show'));
        const sidebarContainer = document.getElementById('sidebar-container');
        if (sidebarContainer) sidebarContainer.classList.remove('active', 'show');
    }

    // Helper: Toggle mobile sidebar
    function toggleMobileSidebar() {
        const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
        getOrCreateOverlay();
        const overlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
        const sidebarContainer = document.getElementById('sidebar-container');

        if (sidebar) {
            const isActive = sidebar.classList.contains('active') || sidebar.classList.contains('show');
            if (isActive) {
                sidebar.classList.remove('active', 'show');
                overlays.forEach(o => o.classList.remove('active', 'show'));
                if (sidebarContainer) sidebarContainer.classList.remove('active', 'show');
            } else {
                sidebar.classList.add('active', 'show');
                overlays.forEach(o => o.classList.add('active', 'show'));
                if (sidebarContainer) sidebarContainer.classList.add('active', 'show');
            }
        }
    }

    // 1. Unified Click Handler for Mobile Menu, Overlay, Dropdowns, Theme Toggle, and Navigation Links
    document.addEventListener('click', (e) => {
        const themeToggle = e.target.closest('#theme-toggle, .btn-theme-toggle');
        const mobileToggle = e.target.closest('#mobile-menu-toggle, .hamburger-btn');
        const overlay = e.target.closest('#sidebar-overlay, .sidebar-overlay');
        const menuLink = e.target.closest('#app-sidebar a.menu-item, .sidebar a.menu-item, #sidebar-container a.menu-item');
        const profileToggle = e.target.closest('#profile-dropdown-toggle, .user-profile.dropdown-toggle');
        const notifToggle = e.target.closest('#notification-toggle, .notification-bell');
        const profileMenu = document.getElementById('profile-menu');
        const notifMenu = document.getElementById('notification-menu');
        const pt = document.getElementById('profile-dropdown-toggle');
        const nt = document.getElementById('notification-toggle');

        // 0. Theme Toggle Click
        if (themeToggle) {
            e.preventDefault();
            e.stopPropagation();
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyAdminTheme(nextTheme);
            return;
        }

        // A. Mobile Hamburger Click
        if (mobileToggle) {
            e.preventDefault();
            e.stopPropagation();
            toggleMobileSidebar();
            return;
        }

        // B. Sidebar Overlay Click
        if (overlay) {
            e.preventDefault();
            e.stopPropagation();
            closeMobileSidebar();
            return;
        }

        // C. Sidebar Nav Link Click on Mobile (Auto-close sidebar upon tapping link)
        if (menuLink && window.innerWidth <= 1024) {
            closeMobileSidebar();
        }

        // D. Profile Dropdown Clicked
        if (profileToggle) {
            if (e.target.closest('#profile-menu')) return;
            e.stopPropagation();
            if (profileMenu) {
                const isShow = profileMenu.classList.toggle('show');
                profileMenu.style.display = isShow ? 'flex' : 'none';
                profileToggle.classList.toggle('active-state', isShow);
            }
            if (notifMenu) {
                notifMenu.classList.remove('show');
                notifMenu.style.display = 'none';
                if (nt) nt.classList.remove('active-state');
            }
            return;
        }

        // E. Notification Bell Clicked
        if (notifToggle) {
            if (e.target.closest('#notification-menu')) return;
            e.stopPropagation();
            if (notifMenu) {
                const isShow = notifMenu.classList.toggle('show');
                notifMenu.style.display = isShow ? 'flex' : 'none';
                notifToggle.classList.toggle('active-state', isShow);
            }
            if (profileMenu) {
                profileMenu.classList.remove('show');
                profileMenu.style.display = 'none';
                if (pt) pt.classList.remove('active-state');
            }
            return;
        }

        // F. Clicked Outside Dropdowns - Close both menus
        if (profileMenu && !profileMenu.contains(e.target)) {
            profileMenu.classList.remove('show');
            profileMenu.style.display = 'none';
            if (pt) pt.classList.remove('active-state');
        }
        if (notifMenu && !notifMenu.contains(e.target)) {
            notifMenu.classList.remove('show');
            notifMenu.style.display = 'none';
            if (nt) nt.classList.remove('active-state');
        }
    });

    // 2. Touchstart handler for mobile overlays
    document.addEventListener('touchstart', (e) => {
        const overlay = e.target.closest('#sidebar-overlay, .sidebar-overlay');
        if (overlay) {
            closeMobileSidebar();
        }
    }, { passive: true });

    // 3. Escape key to close mobile sidebar and menus
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileSidebar();
            const profileMenu = document.getElementById('profile-menu');
            const notifMenu = document.getElementById('notification-menu');
            const pt = document.getElementById('profile-dropdown-toggle');
            const nt = document.getElementById('notification-toggle');
            if (profileMenu) {
                profileMenu.classList.remove('show');
                profileMenu.style.display = 'none';
                if (pt) pt.classList.remove('active-state');
            }
            if (notifMenu) {
                notifMenu.classList.remove('show');
                notifMenu.style.display = 'none';
                if (nt) nt.classList.remove('active-state');
            }
        }
    });
}

// Run immediately
initGlobalAdminDelegatedHandlers();

// Legacy compatibility
function initMobileMenu() {
    initGlobalAdminDelegatedHandlers();
}

// --- GLOBAL LOGOUT FUNCTION ---
let isLogoutLogicInitialized = false;
function initGlobalLogoutLogic() {
    if (isLogoutLogicInitialized) return;
    isLogoutLogicInitialized = true;

    // 1. Open Logout Modal
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#dropdown-logout-btn, #sidebar-logout-btn, .logout-trigger');
        if (btn) {
            e.preventDefault();
            const logoutModal = document.getElementById('logout-modal');
            if (logoutModal) logoutModal.style.display = 'flex';
            const profileMenu = document.getElementById('profile-menu');
            if (profileMenu) {
                profileMenu.classList.remove('show');
                profileMenu.style.display = 'none';
            }
            const pt = document.getElementById('profile-dropdown-toggle');
            if (pt) pt.classList.remove('active-state');
        }
    });

    // 2. Close Modal on Cancel
    document.addEventListener('click', (e) => {
        const cancelBtn = e.target.closest('#modal-cancel, .global-btn-cancel, .modal-cancel-btn');
        if (cancelBtn) {
            e.preventDefault();
            const logoutModal = document.getElementById('logout-modal');
            if (logoutModal) logoutModal.style.display = 'none';
        }
    });

    // 3. Close Modal on Outside Backdrop Click
    document.addEventListener('click', (e) => {
        const logoutModal = document.getElementById('logout-modal');
        if (logoutModal && e.target === logoutModal) {
            logoutModal.style.display = 'none';
        }
    });

    // 4. Process Logout on Confirm
    document.addEventListener('click', async (e) => {
        const confirmBtn = e.target.closest('#modal-confirm, .global-btn-confirm');
        if (confirmBtn) {
            e.preventDefault();
            if (window.supabaseClient) {
                try {
                    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                    confirmBtn.disabled = true;

                    sessionStorage.removeItem('grantee_admin_profile');
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error("Logout Error:", error);
                    alert("Failed to logout safely.");
                    confirmBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Logout';
                    confirmBtn.disabled = false;
                }
            } else {
                sessionStorage.removeItem('grantee_admin_profile');
                window.location.href = 'login.html';
            }
        }
    });
}

// --- SPA NAVIGATION FOR SIDEBAR ---
function initSidebarNavigation() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    sidebarContainer.addEventListener('click', async (e) => {
        const link = e.target.closest('a.menu-item');
        if (link && link.href && link.href.startsWith(window.location.origin) && !link.href.includes('#')) {
            e.preventDefault();
            const url = link.href;
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            const targetPath = new URL(url).pathname.split('/').pop();

            if (currentPath === targetPath) return;

            // Update active link visually
            document.querySelectorAll('a.menu-item').forEach(el => el.classList.remove('active'));
            link.classList.add('active');

            // Close mobile sidebar if open
            const sidebar = document.getElementById('app-sidebar');
            const sidebarOverlay = document.getElementById('sidebar-overlay');
            if (sidebarContainer.classList.contains('active')) {
                sidebarContainer.classList.remove('active');
                sidebarOverlay.classList.remove('active');
                if (sidebar) sidebar.classList.remove('active');
            }

            try {
                const mainContent = document.querySelector('.main-content');

                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                const html = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const newMain = doc.querySelector('.main-content');
                if (newMain && mainContent) {
                    // 1. Preserve existing profile header details into newMain before swapping to prevent reload flash
                    const curName = document.getElementById('header-name')?.innerText;
                    const curRole = document.getElementById('header-role')?.innerText;
                    const curAvatar = document.getElementById('header-avatar')?.src;
                    const curSchoolHtml = document.getElementById('admin-school-display')?.innerHTML;

                    if (curName && curName !== 'Loading...' && newMain.querySelector('#header-name')) {
                        newMain.querySelector('#header-name').innerText = curName;
                    }
                    if (curRole && newMain.querySelector('#header-role')) {
                        newMain.querySelector('#header-role').innerText = curRole;
                    }
                    if (curAvatar && newMain.querySelector('#header-avatar')) {
                        newMain.querySelector('#header-avatar').src = curAvatar;
                    }
                    if (curSchoolHtml && newMain.querySelector('#admin-school-display')) {
                        newMain.querySelector('#admin-school-display').innerHTML = curSchoolHtml;
                    }

                    // Hydrate from sessionStorage cache
                    hydrateAdminProfile(newMain);

                    // 2. Add skeleton loading class to incoming header-titles
                    const incomingTitles = newMain.querySelector('.header-titles');
                    if (incomingTitles) {
                        incomingTitles.classList.add('is-loading');
                    }

                    // 3. Update main content DOM
                    mainContent.innerHTML = newMain.innerHTML;
                    mainContent.className = newMain.className;

                    // Initialize notifications on new page DOM
                    if (typeof window.initAdminNotifications === 'function') {
                        window.initAdminNotifications();
                    }

                    // 4. Update Document Title & URL
                    document.title = doc.title;
                    window.history.pushState({}, '', url);
                    highlightActiveSidebarMenu();

                    // 5. Smoothly remove skeleton loading from header-titles after brief transition
                    setTimeout(() => {
                        const activeTitles = document.querySelector('.header-titles');
                        if (activeTitles) {
                            activeTitles.classList.remove('is-loading');
                        }
                        applyAdminTheme(getAdminStoredTheme());
                        if (typeof lucide !== 'undefined' && lucide.createIcons) {
                            lucide.createIcons();
                        }
                    }, 280);

                    // 6. Sync Modals (Crucial for action buttons that open modals)
                    const oldModals = document.querySelectorAll('.modal-overlay');
                    oldModals.forEach(m => m.remove());

                    const newModals = doc.querySelectorAll('.modal-overlay');
                    newModals.forEach(m => {
                        if (m.id !== 'logout-modal') {
                            document.body.appendChild(m.cloneNode(true));
                        }
                    });

                    // 7. Sync Bulk Action Bar
                    const oldActionBar = document.getElementById('bulk-action-bar');
                    if (oldActionBar) oldActionBar.remove();

                    const newActionBar = doc.getElementById('bulk-action-bar');
                    if (newActionBar) {
                        document.body.appendChild(newActionBar.cloneNode(true));
                    }

                    // 8. Sync stylesheets
                    const newLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
                    const currentLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));

                    currentLinks.forEach(curr => {
                        if (!curr.href.includes('sidebar.css') &&
                            !curr.href.includes('font-awesome') &&
                            !curr.href.includes('admin-global.css') &&
                            !newLinks.find(n => n.href === curr.href)) {
                            curr.remove();
                        }
                    });

                    newLinks.forEach(n => {
                        if (!currentLinks.find(curr => curr.href === n.href)) {
                            const newLink = document.createElement('link');
                            newLink.rel = 'stylesheet';
                            newLink.href = n.href;
                            document.head.appendChild(newLink);
                        }
                    });

                    const currentStyles = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML.trim());
                    doc.querySelectorAll('style').forEach(style => {
                        if (!currentStyles.includes(style.innerHTML.trim())) {
                            const newStyle = document.createElement('style');
                            newStyle.innerHTML = style.innerHTML;
                            document.head.appendChild(newStyle);
                        }
                    });

                    // 9. Execute page-specific scripts to initialize logic
                    const newScripts = doc.querySelectorAll('script');
                    newScripts.forEach(script => {
                        if (script.src) {
                            if (!script.src.includes('sidebar-loader')
                                && !script.src.includes('supabase-config')
                                && !script.src.includes('components/')) {

                                if (script.src.includes('js/')) {
                                    const scriptName = script.src.split('/').pop();
                                    const existing = document.querySelector(`script[src*="${scriptName}"]`);
                                    if (existing) existing.remove();
                                }

                                const isLib = !script.src.includes('js/') && document.querySelector(`script[src="${script.src}"]`);
                                if (!isLib) {
                                    const newScript = document.createElement('script');
                                    newScript.src = script.src;
                                    document.body.appendChild(newScript);
                                }
                            }
                        } else if (script.innerHTML.trim() !== '') {
                            const newScript = document.createElement('script');
                            newScript.innerHTML = script.innerHTML;
                            document.body.appendChild(newScript);
                        }
                    });

                    // 10. Re-initialize Lucide Icons
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                } else {
                    window.location.href = url;
                }
            } catch (error) {
                console.error('SPA Navigation error:', error);
                window.location.href = url;
            }
        }
    });
}

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    window.location.reload();
});
