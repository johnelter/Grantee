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
                schoolEl.innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>${profile.school_name}</span>`;
            }
        }
    } catch (e) {
        console.warn('Hydrate admin profile error:', e);
    }
}

// --- ADMIN THEME ENGINE (Default: Light Mode, Persistent per user/browser) ---
function getAdminStoredTheme() {
    try {
        const theme = localStorage.getItem('grantee_admin_theme');
        if (theme) return theme;
        const cached = sessionStorage.getItem('grantee_admin_profile');
        if (cached) {
            const profile = JSON.parse(cached);
            if (profile && profile.id) {
                const userTheme = localStorage.getItem(`grantee_admin_theme_${profile.id}`);
                if (userTheme) return userTheme;
            }
        }
        const globalTheme = localStorage.getItem('grantee_theme');
        if (globalTheme) return globalTheme;
    } catch (e) {}
    return 'light';
}

function applyAdminTheme(theme) {
    if (!theme) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
        document.body.classList.toggle('light-theme', theme !== 'dark');
    }
    try {
        localStorage.setItem('grantee_admin_theme', theme);
        localStorage.setItem('grantee_theme', theme);

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
            
            // Ensure user-scoped theme is synchronized with current active theme
            const currentActiveTheme = getAdminStoredTheme();
            localStorage.setItem(`grantee_admin_theme_${user.id}`, currentActiveTheme);

            hydrateAdminProfile(document);
            applyAdminTheme(currentActiveTheme);
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }
    } catch (err) {
        console.warn('Error fetching admin profile in sidebar-loader:', err);
    }
}

// --- 1. INJECT SIDEBAR (Instant hydration from cache + background fresh fetch) ---
async function loadAdminSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    highlightActiveSidebarMenu();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    if (sidebarContainer.querySelector('#app-sidebar')) {
        return; // Sidebar is embedded statically in HTML, zero reload!
    }

    const path = window.location.pathname;
    const isAdminPage = path.includes('admin') || path.includes('create-scholarship');
    const sidebarFile = isAdminPage ? 'components/admin-sidebar.html' : 'components/student-sidebar.html';
    const cacheKey = isAdminPage ? 'grantee_cached_admin_sidebar' : 'grantee_cached_student_sidebar';

    const cachedHtml = sessionStorage.getItem(cacheKey);
    if (cachedHtml && !sidebarContainer.querySelector('#app-sidebar')) {
        sidebarContainer.innerHTML = cachedHtml;
        highlightActiveSidebarMenu();
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    try {
        const response = await fetch(sidebarFile);
        if (response.ok) {
            const html = await response.text();
            sessionStorage.setItem(cacheKey, html);
            if (!sidebarContainer.querySelector('#app-sidebar')) {
                sidebarContainer.innerHTML = html;
                highlightActiveSidebarMenu();
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        }
    } catch (error) {
        console.warn('Failed to load sidebar component:', error);
    }
}

// --- 2. ENSURE LOGOUT MODAL EXISTS & INITIALIZE LOGIC ---
async function loadLogoutModal() {
    if (document.getElementById('logout-modal')) {
        initGlobalLogoutLogic();
        return;
    }
    const cacheKey = 'grantee_cached_logout_modal';
    const cachedModal = sessionStorage.getItem(cacheKey);
    if (cachedModal && !document.getElementById('logout-modal')) {
        document.body.insertAdjacentHTML('beforeend', cachedModal);
    }
    try {
        const modalResponse = await fetch('components/logout-modal.html');
        if (modalResponse.ok) {
            const modalHtml = await modalResponse.text();
            sessionStorage.setItem(cacheKey, modalHtml);
            if (!document.getElementById('logout-modal')) {
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            }
        }
    } catch (error) {
        console.warn('Failed to load logout modal component:', error);
    }
    initGlobalLogoutLogic();
}

// Immediately hydrate profile on load
hydrateAdminProfile(document);

// Initial sidebar attempt as early as possible
if (document.getElementById('sidebar-container')) {
    loadAdminSidebar();
}

document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme and hydrate again on DOMContentLoaded
    applyAdminTheme(getAdminStoredTheme());
    hydrateAdminProfile(document);

    // Background profile refresh
    setTimeout(() => {
        fetchAndCacheAdminProfile();
    }, 100);

    // Inject sidebar and logout modal
    await loadAdminSidebar();
    await loadLogoutModal();

    // Only clean up detached/orphaned body-level flatpickr calendars from prior pages if any
    document.querySelectorAll('body > .flatpickr-calendar:not(.open):not(.inline)').forEach(el => {
        if (!document.querySelector('.flatpickr-input')) el.remove();
    });
});

// Helper to highlight active menu item based on current URL
function highlightActiveSidebarMenu() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;
    const currentPath = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
    const links = sidebarContainer.querySelectorAll('a.menu-item');
    links.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (!linkHref) return;
        const linkBase = linkHref.split('?')[0].split('#')[0];
        if (linkBase === currentPath || 
            (linkBase.includes('admin-scholarships') && currentPath.includes('create-scholarship')) ||
            (linkBase.includes('admin-scholarships') && currentPath.includes('view-scholarship'))) {
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
        const cancelBtn = e.target.closest('#logout-modal #modal-cancel, #logout-modal .global-btn-cancel, #logout-modal .modal-cancel-btn');
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
        const confirmBtn = e.target.closest('#logout-modal #modal-confirm, #logout-modal .global-btn-confirm');
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

// --- 0. SPA DOMContentLoaded POLYFILL ---
(function () {
    const origDocAdd = document.addEventListener;
    const origWinAdd = window.addEventListener;

    document.addEventListener = function (type, listener, options) {
        if (type === 'DOMContentLoaded' && (document.readyState === 'interactive' || document.readyState === 'complete')) {
            setTimeout(() => {
                try {
                    listener.call(document, new Event('DOMContentLoaded'));
                } catch (e) {
                    console.error('DOMContentLoaded listener error:', e);
                }
            }, 0);
            return;
        }
        return origDocAdd.call(document, type, listener, options);
    };

    window.addEventListener = function (type, listener, options) {
        if (type === 'DOMContentLoaded' && (document.readyState === 'interactive' || document.readyState === 'complete')) {
            setTimeout(() => {
                try {
                    listener.call(window, new Event('DOMContentLoaded'));
                } catch (e) {
                    console.error('DOMContentLoaded listener error:', e);
                }
            }, 0);
            return;
        }
        return origWinAdd.call(window, type, listener, options);
    };
})();

// ==========================================
// HIGH-PERFORMANCE INSTANT NAVIGATION PREFETCHER (ADMIN)
// ==========================================
function initAdminPagePrefetcher() {
    const prefetchedUrls = new Set();
    function prefetchPage(url) {
        if (!url || prefetchedUrls.has(url)) return;
        prefetchedUrls.add(url);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
    }

    // Prefetch on hover or touch for instant ~0ms navigation
    document.addEventListener('mouseover', (e) => {
        const a = e.target.closest('a');
        if (a && a.href && a.origin === window.location.origin) {
            prefetchPage(a.href);
        }
    }, { passive: true });

    document.addEventListener('touchstart', (e) => {
        const a = e.target.closest('a');
        if (a && a.href && a.origin === window.location.origin) {
            prefetchPage(a.href);
        }
    }, { passive: true });

    // Idle prefetch of common admin destinations
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
            [
                'admin-dashboard.html',
                'admin-scholarships.html',
                'admin-applications.html',
                'admin-active-scholars.html',
                'admin-policies.html',
                'admin-students.html',
                'admin-announcements.html',
                'admin-profile-settings.html',
                'create-scholarship.html'
            ].forEach(p => prefetchPage(p));
        });
    }
}
initAdminPagePrefetcher();

// --- SIDEBAR NAVIGATION INITIALIZER ---
function initSidebarNavigation() {
    highlightActiveSidebarMenu();
}

// ==========================================
// GLOBAL ADMIN UI TOAST SYSTEM (TOP CENTER)
// ==========================================
if (!window.showUIToast) {
    window.showUIToast = function (type = 'success', title = '', message = '') {
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
    };
    window.showToast = window.showUIToast;
}

// ==========================================
// BACK TO TOP BUTTON COMPONENT (ADMIN)
// ==========================================
function initAdminBackToTop() {
    let btn = document.getElementById('back-to-top-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'back-to-top-btn';
        btn.className = 'back-to-top-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Back to top');
        btn.setAttribute('title', 'Back to top');
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
        `;
        document.body.appendChild(btn);
    }

    const getScrollTargets = () => [
        document.querySelector('.dashboard-scroll-area'),
        document.querySelector('.main-content'),
        document.querySelector('.content-scroll-area'),
        window
    ].filter(Boolean);

    function checkScroll() {
        let maxScroll = 0;
        getScrollTargets().forEach(el => {
            const scrollTop = el === window ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) : el.scrollTop;
            if (scrollTop > maxScroll) maxScroll = scrollTop;
        });

        if (maxScroll > 200) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }

    getScrollTargets().forEach(el => {
        el.addEventListener('scroll', checkScroll, { passive: true });
    });
    window.addEventListener('scroll', checkScroll, { passive: true });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        getScrollTargets().forEach(el => {
            if (el === window) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                el.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminBackToTop);
} else {
    initAdminBackToTop();
}

