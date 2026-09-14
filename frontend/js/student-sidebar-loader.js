// --- INSTANT PROFILE HYDRATION HELPER ---
function hydrateUserProfile(root = document) {
    try {
        const cachedProfile = sessionStorage.getItem('grantee_student_profile');
        if (cachedProfile) {
            const profile = JSON.parse(cachedProfile);
            const nameEl = root.getElementById ? root.getElementById('header-name') : root.querySelector('#header-name');
            const programEl = root.getElementById ? root.getElementById('header-program') : root.querySelector('#header-program');
            const avatarEl = root.getElementById ? root.getElementById('header-avatar') : root.querySelector('#header-avatar');

            if (nameEl && profile.name) nameEl.innerText = profile.name;
            if (programEl && profile.program) programEl.innerText = profile.program;
            if (avatarEl && profile.avatar_url) avatarEl.src = profile.avatar_url;
        }

        const cachedUnread = sessionStorage.getItem('grantee_notif_unread');
        if (cachedUnread !== null) {
            const count = parseInt(cachedUnread, 10);
            const badgeEl = root.getElementById ? root.getElementById('notification-badge') : root.querySelector('#notification-badge');
            if (badgeEl) {
                if (count > 0) {
                    badgeEl.innerText = count > 9 ? '9+' : count;
                    badgeEl.style.display = 'flex';
                } else {
                    badgeEl.style.display = 'none';
                }
            }
        }
    } catch (e) {
        console.warn('Hydrate profile error:', e);
    }
}

// --- THEME ENGINE ---
function getStoredTheme() {
    try {
        const cached = sessionStorage.getItem('grantee_student_profile');
        if (cached) {
            const profile = JSON.parse(cached);
            if (profile && profile.id) {
                const userTheme = localStorage.getItem(`grantee_student_theme_${profile.id}`);
                if (userTheme) return userTheme;
            }
        }
    } catch (e) { }
    return localStorage.getItem('grantee_student_theme') || 'light';
}

function applyTheme(theme) {
    if (!theme) theme = 'light';
    document.documentElement.setAttribute('data-theme', theme);
    if (document.body) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
        document.body.classList.toggle('light-theme', theme !== 'dark');
    }
    localStorage.setItem('grantee_student_theme', theme);

    try {
        const cached = sessionStorage.getItem('grantee_student_profile');
        if (cached) {
            const profile = JSON.parse(cached);
            if (profile && profile.id) {
                localStorage.setItem(`grantee_student_theme_${profile.id}`, theme);
            }
        }
    } catch (e) { }

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
        if (window.lucide && window.lucide.createIcons) {
            try { window.lucide.createIcons({ root: btn }); } catch (e) { window.lucide.createIcons(); }
        }
    });
}

// Immediate initial execution
applyTheme(getStoredTheme());

// --- MOBILE SIDEBAR & OVERLAY CONTROLS ---
function getOrCreateSidebarOverlay() {
    let overlay = document.getElementById('sidebar-overlay') || document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }
    return overlay;
}

function openMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
    getOrCreateSidebarOverlay();
    const overlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
    const mainContent = document.querySelector('.main-content');

    if (sidebar) {
        sidebar.classList.add('active', 'show');
    }
    overlays.forEach(o => o.classList.add('active', 'show'));
    document.body.classList.add('sidebar-open');
    if (mainContent) {
        mainContent.classList.add('sidebar-blurred');
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
    const overlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
    const mainContent = document.querySelector('.main-content');

    if (sidebar) {
        sidebar.classList.remove('active', 'show');
    }
    overlays.forEach(o => o.classList.remove('active', 'show'));
    document.body.classList.remove('sidebar-open');
    if (mainContent) {
        mainContent.classList.remove('sidebar-blurred');
    }
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
    const isOpen = sidebar && (sidebar.classList.contains('active') || sidebar.classList.contains('show'));
    if (isOpen) {
        closeMobileSidebar();
    } else {
        openMobileSidebar();
    }
}

// Expose globally on window
window.openMobileSidebar = openMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.toggleMobileSidebar = toggleMobileSidebar;
window.openStudentSidebar = openMobileSidebar;
window.closeStudentSidebar = closeMobileSidebar;
window.toggleStudentSidebar = toggleMobileSidebar;

// --- GLOBAL DELEGATED CONTROLS (Run once) ---
let delegatedInitialized = false;

function initGlobalDelegatedHandlers() {
    if (delegatedInitialized) return;
    delegatedInitialized = true;

    // Ensure overlay exists in DOM early
    getOrCreateSidebarOverlay();

    // 1. Mobile Menu & Overlay Handler
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('#mobile-menu-toggle, .hamburger-btn');
        const overlay = e.target.closest('#sidebar-overlay, .sidebar-overlay');
        const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
        const isOpen = sidebar && (sidebar.classList.contains('active') || sidebar.classList.contains('show'));

        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            toggleMobileSidebar();
            return;
        }

        if (overlay) {
            e.preventDefault();
            e.stopPropagation();
            closeMobileSidebar();
            return;
        }

        // If sidebar is open on mobile/tablet and user clicks outside the sidebar, close it
        if (isOpen && window.innerWidth <= 1024) {
            if (!sidebar.contains(e.target) && !e.target.closest('#mobile-menu-toggle, .hamburger-btn')) {
                closeMobileSidebar();
            }
        }
    });

    document.addEventListener('touchstart', (e) => {
        const overlay = e.target.closest('#sidebar-overlay, .sidebar-overlay');
        if (overlay) {
            e.preventDefault();
            closeMobileSidebar();
        }
    }, { passive: false });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            closeMobileSidebar();
            const profileMenu = document.getElementById('profile-menu');
            if (profileMenu) profileMenu.classList.remove('show');
            const notifDropdown = document.getElementById('notification-dropdown');
            if (notifDropdown) {
                notifDropdown.style.display = 'none';
                notifDropdown.classList.remove('show');
            }
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            closeMobileSidebar();
        }
    });

    // 2. Profile Dropdown Handler
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('#profile-dropdown-toggle, .user-profile.dropdown-toggle');
        const menu = document.getElementById('profile-menu');
        const notifDropdown = document.getElementById('notification-dropdown');

        if (toggle) {
            e.stopPropagation();
            // Close notification dropdown if open
            if (notifDropdown) {
                notifDropdown.style.display = 'none';
                notifDropdown.classList.remove('show');
            }
            if (menu) {
                menu.classList.toggle('show');
                toggle.classList.toggle('active-state');
            }
            return;
        }

        // Close menu if a link inside it is clicked
        if (menu && menu.contains(e.target) && e.target.closest('a')) {
            menu.classList.remove('show');
            const profileToggle = document.getElementById('profile-dropdown-toggle');
            if (profileToggle) profileToggle.classList.remove('active-state');
            return;
        }

        // Close menu if clicked outside
        if (menu && !menu.contains(e.target)) {
            menu.classList.remove('show');
            const profileToggle = document.getElementById('profile-dropdown-toggle');
            if (profileToggle) profileToggle.classList.remove('active-state');
        }
    });

    // 3. Global Logout Modal Handler
    document.addEventListener('click', async (e) => {
        const trigger = e.target.closest('#dropdown-logout-btn, #sidebar-logout-btn, .logout-trigger');
        const cancelBtn = e.target.closest('#logout-modal #modal-cancel, #logout-modal .global-btn-cancel');
        const confirmBtn = e.target.closest('#logout-modal #modal-confirm, #logout-modal .global-btn-confirm');
        const modal = document.getElementById('logout-modal');
        const profileMenu = document.getElementById('profile-menu');

        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            if (profileMenu) profileMenu.classList.remove('show');
            if (modal) {
                modal.style.display = 'flex';
            }
            return;
        }

        if (cancelBtn) {
            e.preventDefault();
            if (modal) modal.style.display = 'none';
            return;
        }

        if (confirmBtn) {
            e.preventDefault();
            if (window.supabaseClient) {
                try {
                    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                    confirmBtn.disabled = true;

                    sessionStorage.removeItem('grantee_student_profile');
                    sessionStorage.removeItem('grantee_notif_unread');

                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error("Logout Error:", error);
                    alert("Failed to logout safely.");
                    confirmBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> Logout';
                    confirmBtn.disabled = false;
                }
            } else {
                window.location.href = 'login.html';
            }
            return;
        }

        // Close if backdrop clicked
        if (modal && e.target === modal) {
            modal.style.display = 'none';
        }

        // 4. Theme Toggle Handler
        const themeBtn = e.target.closest('#theme-toggle, .btn-theme-toggle');
        if (themeBtn) {
            e.preventDefault();
            e.stopPropagation();
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
        }
    });
}

// Execute delegated handlers immediately so clicks and mobile drawer work without waiting
initGlobalDelegatedHandlers();

// --- 1. INJECT SIDEBAR (Instant hydration from cache + background fresh fetch) ---
async function loadStudentSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    const sidebarFile = 'components/student-sidebar.html';
    const cacheKey = 'grantee_cached_student_sidebar';

    const cachedHtml = sessionStorage.getItem(cacheKey);
    const hasSidebarInDOM = !!sidebarContainer.querySelector('#app-sidebar');

    // Instant synchronous hydration if cached and not yet in DOM
    if (cachedHtml && !hasSidebarInDOM) {
        sidebarContainer.innerHTML = cachedHtml;
        highlightActiveMenu();
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    try {
        const response = await fetch(sidebarFile);
        if (response.ok) {
            const html = await response.text();
            const wasDifferent = (cachedHtml !== html);
            sessionStorage.setItem(cacheKey, html);
            if (!sidebarContainer.querySelector('#app-sidebar') || wasDifferent) {
                sidebarContainer.innerHTML = html;
                highlightActiveMenu();
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        }
    } catch (error) {
        console.warn('Failed to load student sidebar component:', error);
    }
}

// --- 2. INJECT LOGOUT MODAL ---
async function loadStudentLogoutModal() {
    if (document.getElementById('logout-modal')) return;
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
}

// Initial sidebar attempt as early as possible
if (document.getElementById('sidebar-container')) {
    loadStudentSidebar();
}

document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme
    applyTheme(getStoredTheme());

    // Immediate hydration to prevent header reload flash
    hydrateUserProfile();

    // Start delegated event listeners
    initGlobalDelegatedHandlers();

    // Inject Student Sidebar CSS if not present
    if (!document.querySelector('link[href*="student-sidebar.css"]')) {
        const sidebarCSS = document.createElement('link');
        sidebarCSS.rel = 'stylesheet';
        sidebarCSS.href = 'css/student-sidebar.css';
        document.head.appendChild(sidebarCSS);
    }

    // Inject Lucide Script if not present
    if (!document.querySelector('script[src*="lucide"]')) {
        const lucideScript = document.createElement('script');
        lucideScript.src = 'https://unpkg.com/lucide@latest';
        lucideScript.onload = () => {
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };
        document.head.appendChild(lucideScript);
    } else if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Inject sidebar and logout modal
    await loadStudentSidebar();
    await loadStudentLogoutModal();
});

function highlightActiveMenu() {
    let currentPath = window.location.pathname.split('/').pop().split('?')[0].split('#')[0] || 'student-dashboard.html';
    if (!currentPath || currentPath === 'index.html') currentPath = 'student-dashboard.html';
    if (currentPath === 'apply-scholarships.html') currentPath = 'student-scholarships.html';

    const links = document.querySelectorAll('#sidebar-container a.menu-item, #app-sidebar a.menu-item');
    links.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (!linkHref) return;
        const linkBase = linkHref.split('?')[0].split('#')[0];
        if (linkBase === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
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
// ZERO-FLASH SPA ROUTING ENGINE (STUDENT)
// ==========================================

// Preload all student stylesheets in background so transitions are instantaneous
function preloadStudentStylesheets() {
    const studentStyles = [
        'css/student-sidebar.css',
        'css/student-dashboard.css',
        'css/student-scholarships.css',
        'css/student-applications.css',
        'css/student-announcements.css',
        'css/profile-settings.css',
        'css/apply-scholarships.css'
    ];
    setTimeout(() => {
        studentStyles.forEach(stylePath => {
            const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.getAttribute('href') && l.getAttribute('href').includes(stylePath));
            if (!exists) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = stylePath;
                document.head.appendChild(link);
            }
        });
    }, 150);
}
preloadStudentStylesheets();

const studentPageCache = new Map();
let isStudentNavigating = false;

async function navigateToStudentPage(targetUrl, pushState = true) {
    if (isStudentNavigating) return;

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname.split('/').pop() || 'student-dashboard.html';
    const targetPath = new URL(targetUrl, window.location.href).pathname.split('/').pop() || 'student-dashboard.html';

    if (currentUrl === targetUrl) return;

    isStudentNavigating = true;

    // 1. Immediately update active sidebar link
    let targetBase = targetPath.split('?')[0].split('#')[0];
    if (targetBase === 'apply-scholarships.html') targetBase = 'student-scholarships.html';

    const sidebarContainer = document.getElementById('sidebar-container');
    const links = document.querySelectorAll('#sidebar-container a.menu-item, #app-sidebar a.menu-item, .sidebar a.menu-item');
    links.forEach(link => {
        const linkHref = link.getAttribute('href');
        if (!linkHref) return;
        const linkBase = linkHref.split('?')[0].split('#')[0];
        if (linkBase === targetBase) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // 2. Close mobile drawer if open
    const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay') || document.querySelector('.sidebar-overlay');
    if (sidebar) sidebar.classList.remove('active', 'show');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active', 'show');
    if (sidebarContainer) sidebarContainer.classList.remove('active', 'show');
    document.body.classList.remove('sidebar-open');

    // 3. Smooth main-content micro-transition
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.transition = 'opacity 0.12s ease';
        mainContent.style.opacity = '0.88';
        mainContent.classList.remove('sidebar-blurred');
    }

    try {
        let html = studentPageCache.get(targetUrl);
        if (!html) {
            const response = await fetch(targetUrl);
            if (!response.ok) throw new Error('Page fetch failed: ' + response.status);
            html = await response.text();
            studentPageCache.set(targetUrl, html);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newMain = doc.querySelector('.main-content');

        if (!newMain || !mainContent) {
            window.location.href = targetUrl;
            return;
        }

        // 4. Preload incoming stylesheets before swapping content
        const incomingStyles = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
        const stylePromises = [];
        incomingStyles.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            const fullHref = new URL(href, targetUrl).href;
            const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l => l.href === fullHref);
            if (!exists) {
                const newLink = document.createElement('link');
                newLink.rel = 'stylesheet';
                newLink.href = href;
                const p = new Promise(resolve => {
                    newLink.onload = resolve;
                    newLink.onerror = resolve;
                });
                stylePromises.push(p);
                document.head.appendChild(newLink);
            }
        });

        if (stylePromises.length > 0) {
            await Promise.race([
                Promise.all(stylePromises),
                new Promise(r => setTimeout(r, 200))
            ]);
        }

        // 5. Ensure external CDN libraries are loaded
        const incomingLibScripts = Array.from(doc.querySelectorAll('script[src]')).filter(s => {
            const src = s.getAttribute('src') || '';
            return src.startsWith('http') || src.includes('cdn') || src.includes('cdnjs') || src.includes('unpkg');
        });

        for (const lib of incomingLibScripts) {
            const src = lib.getAttribute('src');
            const exists = Array.from(document.querySelectorAll('script')).some(s => s.src === src);
            if (!exists) {
                await new Promise(resolve => {
                    const script = document.createElement('script');
                    script.src = src;
                    script.onload = resolve;
                    script.onerror = resolve;
                    document.head.appendChild(script);
                });
            }
        }

        // 6. Preserve existing header profile details
        const curName = document.getElementById('header-name')?.innerText;
        const curProgram = document.getElementById('header-program')?.innerText;
        const curAvatar = document.getElementById('header-avatar')?.src;
        const curBadge = document.getElementById('notification-badge')?.innerText;
        const curBadgeDisplay = document.getElementById('notification-badge')?.style.display;

        if (curName && curName !== 'Loading...' && newMain.querySelector('#header-name')) {
            newMain.querySelector('#header-name').innerText = curName;
        }
        if (curProgram && newMain.querySelector('#header-program')) {
            newMain.querySelector('#header-program').innerText = curProgram;
        }
        if (curAvatar && newMain.querySelector('#header-avatar')) {
            newMain.querySelector('#header-avatar').src = curAvatar;
        }
        if (curBadge && newMain.querySelector('#notification-badge')) {
            newMain.querySelector('#notification-badge').innerText = curBadge;
            newMain.querySelector('#notification-badge').style.display = curBadgeDisplay || 'none';
        }

        // Hydrate from cache
        hydrateUserProfile(newMain);

        // 7. Swap main content HTML and class list
        mainContent.innerHTML = newMain.innerHTML;
        mainContent.className = newMain.className;

        // 8. Sync Modals (Keep #logout-modal)
        document.querySelectorAll('.modal-overlay, .global-modal-overlay').forEach(m => {
            if (m.id !== 'logout-modal') m.remove();
        });
        doc.querySelectorAll('.modal-overlay, .global-modal-overlay').forEach(m => {
            if (m.id !== 'logout-modal') {
                document.body.appendChild(m.cloneNode(true));
            }
        });

        // 9. Clean up flatpickr calendars
        document.querySelectorAll('.flatpickr-calendar:not(.open):not(.inline), select.flatpickr-monthDropdown-months, .flatpickr-wrapper').forEach(el => el.remove());

        // 10. Update document title & history state
        document.title = doc.title;
        if (pushState) {
            window.history.pushState({ url: targetUrl }, '', targetUrl);
        }

        // Scroll mainContent to top
        mainContent.scrollTop = 0;
        window.scrollTo(0, 0);

        // 11. Re-initialize Student Notifications if present
        if (typeof window.initStudentNotifications === 'function') {
            window.initStudentNotifications();
        }

        // 12. Re-initialize Lucide Icons
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }

        // 13. Apply theme
        applyTheme(getStoredTheme());

        // 14. Execute page-specific controller scripts
        const pageScripts = Array.from(doc.querySelectorAll('script')).filter(s => {
            const src = s.getAttribute('src') || '';
            if (src) {
                return !src.includes('student-sidebar-loader') &&
                       !src.includes('sidebar-loader') &&
                       !src.includes('supabase-config') &&
                       !src.includes('components/') &&
                       !src.startsWith('http') &&
                       !src.includes('cdn');
            }
            return s.innerHTML.trim().length > 0 && !s.innerHTML.includes('grantee_student_theme');
        });

        for (const script of pageScripts) {
            if (script.src) {
                const scriptBaseName = script.src.split('/').pop().split('?')[0];
                document.querySelectorAll(`script[src*="${scriptBaseName}"]`).forEach(el => el.remove());
                
                const newScript = document.createElement('script');
                newScript.src = script.src + (script.src.includes('?') ? '&' : '?') + '_t=' + Date.now();
                document.body.appendChild(newScript);
            } else if (script.innerHTML.trim()) {
                const newScript = document.createElement('script');
                newScript.innerHTML = script.innerHTML;
                document.body.appendChild(newScript);
            }
        }

        // Smooth fade in
        requestAnimationFrame(() => {
            if (mainContent) {
                mainContent.style.opacity = '1';
            }
        });

    } catch (err) {
        console.error('Student SPA Navigation error, falling back to full navigation:', err);
        window.location.href = targetUrl;
    } finally {
        isStudentNavigating = false;
    }
}
window.navigateToStudentPage = navigateToStudentPage;

// --- UNIFIED STUDENT LINK INTERCEPTOR ---
document.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    const link = e.target.closest('a');
    if (!link || !link.href) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (link.hasAttribute('download') || link.getAttribute('target') === '_blank') return;

    const targetUrl = link.href;
    const origin = window.location.origin;
    if (!targetUrl.startsWith(origin)) return;

    const targetPath = new URL(targetUrl).pathname.split('/').pop();
    const isStudentTarget = targetPath.includes('student-') || targetPath.includes('profile-settings') || targetPath.includes('apply-scholarships');

    if (isStudentTarget) {
        e.preventDefault();
        navigateToStudentPage(targetUrl, true);
    }
});

// Handle browser back and forward buttons
window.addEventListener('popstate', (e) => {
    navigateToStudentPage(window.location.href, false);
});

// --- SIDEBAR NAVIGATION ---
function initSidebarNavigation() {
    highlightActiveMenu();
}

// ==========================================
// BACK TO TOP BUTTON COMPONENT
// ==========================================
function initBackToTopButton() {
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
    document.addEventListener('DOMContentLoaded', initBackToTopButton);
} else {
    initBackToTopButton();
}

// ==========================================
// GLOBAL STUDENT UI TOAST SYSTEM (TOP CENTER)
// ==========================================
if (!window.showUIToast) {
    window.showUIToast = function (type = 'success', title = '', message = '', duration = 3500) {
        return new Promise((resolve) => {
            // Dismiss any open loading or dialog modal immediately
            if (typeof Swal !== 'undefined' && typeof Swal.isVisible === 'function' && Swal.isVisible()) {
                Swal.close();
            }

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
                iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                if (!title) title = 'Success';
            } else if (type === 'error') {
                iconSvg = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                if (!title) title = 'Error';
            } else if (type === 'info') {
                iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
                if (!title) title = 'Info';
            } else if (type === 'warning') {
                iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
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
                    resolve();
                }, 300);
            };

            const closeBtn = toast.querySelector('.toast-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dismissToast();
                });
            }

            let autoDismissTimer = setTimeout(dismissToast, duration);

            toast.addEventListener('mouseenter', () => clearTimeout(autoDismissTimer));
            toast.addEventListener('mouseleave', () => {
                if (!isDismissed) {
                    autoDismissTimer = setTimeout(dismissToast, 1800);
                }
            });
        });
    };
    window.showToast = window.showUIToast;
}

