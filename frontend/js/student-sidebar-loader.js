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
    } catch (e) {}
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
        if (window.lucide && window.lucide.createIcons) {
            try { window.lucide.createIcons({ root: btn }); } catch (e) { window.lucide.createIcons(); }
        }
    });
}

// Immediate initial execution
applyTheme(getStoredTheme());

// --- GLOBAL DELEGATED CONTROLS (Run once) ---
let delegatedInitialized = false;

function initGlobalDelegatedHandlers() {
    if (delegatedInitialized) return;
    delegatedInitialized = true;

    // 1. Mobile Menu & Overlay Handler
    document.addEventListener('click', (e) => {
        const toggle = e.target.closest('#mobile-menu-toggle, .hamburger-btn');
        const overlay = e.target.closest('#sidebar-overlay, .sidebar-overlay');
        const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
        const allOverlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');

        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            if (sidebar) {
                const isActive = sidebar.classList.contains('active');
                if (isActive) {
                    sidebar.classList.remove('active', 'show');
                    allOverlays.forEach(o => o.classList.remove('active', 'show'));
                } else {
                    sidebar.classList.add('active', 'show');
                    allOverlays.forEach(o => o.classList.add('active', 'show'));
                }
            }
            return;
        }

        if (overlay) {
            e.preventDefault();
            if (sidebar) sidebar.classList.remove('active', 'show');
            allOverlays.forEach(o => o.classList.remove('active', 'show'));
        }
    });

    document.addEventListener('touchstart', (e) => {
        const overlay = e.target.closest('#sidebar-overlay, .sidebar-overlay');
        if (overlay) {
            const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
            const allOverlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
            if (sidebar) sidebar.classList.remove('active', 'show');
            allOverlays.forEach(o => o.classList.remove('active', 'show'));
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
            const allOverlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
            if (sidebar) sidebar.classList.remove('active', 'show');
            allOverlays.forEach(o => o.classList.remove('active', 'show'));
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
        const cancelBtn = e.target.closest('#modal-cancel, .global-btn-cancel');
        const confirmBtn = e.target.closest('#modal-confirm, .global-btn-confirm');
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

    // --- 1. INJECT SIDEBAR ---
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
        if (!sidebarContainer.querySelector('#app-sidebar')) {
            const sidebarFile = 'components/student-sidebar.html';

            try {
                const response = await fetch(sidebarFile);
                if (response.ok) {
                    const html = await response.text();
                    sidebarContainer.innerHTML = html;

                    // Highlight active link
                    highlightActiveMenu();
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
        } else {
            highlightActiveMenu();
            initSidebarNavigation();
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    // --- 2. INJECT LOGOUT MODAL ---
    try {
        if (!document.getElementById('logout-modal')) {
            const modalResponse = await fetch('components/logout-modal.html');
            if (modalResponse.ok) {
                const modalHtml = await modalResponse.text();
                document.body.insertAdjacentHTML('beforeend', modalHtml);
            }
        }
    } catch (error) {
        console.error('Failed to load logout modal component:', error);
    }
});

function highlightActiveMenu() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const links = document.querySelectorAll('#sidebar-container a.menu-item');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// --- SPA NAVIGATION FOR SIDEBAR ---
function initSidebarNavigation() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer || sidebarContainer.dataset.navBound === 'true') return;
    sidebarContainer.dataset.navBound = 'true';

    sidebarContainer.addEventListener('click', async (e) => {
        const link = e.target.closest('a.menu-item');
        if (link && link.href && !link.href.startsWith('javascript:') && !link.href.includes('#')) {
            e.preventDefault();
            const url = link.href;
            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            const targetPath = new URL(url, window.location.href).pathname.split('/').pop();

            if (currentPath === targetPath) return;

            // Close mobile sidebar immediately ONLY if on mobile viewport
            const sidebar = document.getElementById('app-sidebar') || document.querySelector('.sidebar');
            const allOverlays = document.querySelectorAll('#sidebar-overlay, .sidebar-overlay');
            if (sidebar && window.innerWidth <= 1024) {
                sidebar.classList.remove('active', 'show');
                allOverlays.forEach(o => o.classList.remove('active', 'show'));
            }

            // Update active link visually
            document.querySelectorAll('a.menu-item').forEach(el => el.classList.remove('active'));
            link.classList.add('active');

            try {
                // Apply skeleton loading to header-titles and dim scrollable body ONLY
                const currentTitles = document.querySelector('.header-titles');
                if (currentTitles) {
                    currentTitles.classList.add('is-loading');
                }

                const scrollArea = document.querySelector('.dashboard-scroll-area, .content-wrapper');
                if (scrollArea) {
                    scrollArea.style.opacity = '0.4';
                    scrollArea.style.transition = 'opacity 0.2s ease';
                }

                const response = await fetch(url);
                if (!response.ok) throw new Error('Network response was not ok');
                const html = await response.text();

                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const newMain = doc.querySelector('.main-content');
                const mainContent = document.querySelector('.main-content');

                if (newMain && mainContent) {
                    // Pre-load incoming stylesheets BEFORE swapping DOM to prevent layout jump
                    const newLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
                    const currentLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));

                    const loadPromises = [];
                    newLinks.forEach(n => {
                        if (!currentLinks.find(curr => curr.href === n.href)) {
                            const newLink = document.createElement('link');
                            newLink.rel = 'stylesheet';
                            newLink.href = n.href;
                            const p = new Promise(resolve => {
                                newLink.onload = resolve;
                                newLink.onerror = resolve;
                            });
                            loadPromises.push(p);
                            document.head.appendChild(newLink);
                        }
                    });

                    if (loadPromises.length > 0) {
                        await Promise.race([
                            Promise.all(loadPromises),
                            new Promise(r => setTimeout(r, 120))
                        ]);
                    }

                    // Preserve existing profile header details into newMain before swapping to prevent reload flash
                    const curName = document.getElementById('header-name')?.innerText;
                    const curProgram = document.getElementById('header-program')?.innerText;
                    const curAvatar = document.getElementById('header-avatar')?.src;
                    const curBadge = document.getElementById('notification-badge')?.innerText;
                    const curBadgeDisplay = document.getElementById('notification-badge')?.style.display;

                    if (curName && newMain.querySelector('#header-name')) newMain.querySelector('#header-name').innerText = curName;
                    if (curProgram && newMain.querySelector('#header-program')) newMain.querySelector('#header-program').innerText = curProgram;
                    if (curAvatar && newMain.querySelector('#header-avatar')) newMain.querySelector('#header-avatar').src = curAvatar;
                    if (curBadge && newMain.querySelector('#notification-badge')) {
                        newMain.querySelector('#notification-badge').innerText = curBadge;
                        newMain.querySelector('#notification-badge').style.display = curBadgeDisplay || 'none';
                    }

                    // Hydrate from cache
                    hydrateUserProfile(newMain);

                    // Add temporary skeleton class to the incoming header-titles
                    const incomingTitles = newMain.querySelector('.header-titles');
                    if (incomingTitles) {
                        incomingTitles.classList.add('is-loading');
                    }

                    // Update main content
                    mainContent.innerHTML = newMain.innerHTML;
                    mainContent.className = newMain.className;

                    // Sync theme button icon
                    applyTheme(getStoredTheme());

                    // Update Title
                    document.title = doc.title;

                    // Update URL
                    window.history.pushState({}, '', url);
                    highlightActiveMenu();

                    // Smoothly remove skeleton loading from header-titles after brief transition
                    setTimeout(() => {
                        const activeTitles = document.querySelector('.header-titles');
                        if (activeTitles) {
                            activeTitles.classList.remove('is-loading');
                        }
                    }, 280);

                    // Re-initialize notification engine on new page
                    if (window.initStudentNotifications) {
                        window.initStudentNotifications();
                    }

                    // Remove obsolete stylesheets that aren't on the incoming page (never removing core styles)
                    currentLinks.forEach(curr => {
                        if (!curr.href.includes('student-sidebar.css') &&
                            !curr.href.includes('font-awesome') &&
                            !curr.href.includes('cdnjs') &&
                            !newLinks.find(n => n.href === curr.href)) {
                            curr.remove();
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

                    // Execute page-specific scripts to initialize logic (from head and body)
                    const newScripts = doc.querySelectorAll('script');
                    newScripts.forEach(script => {
                        if (script.src) {
                            if (!script.src.includes('sidebar-loader')
                                && !script.src.includes('supabase-config')
                                && !script.src.includes('components/')) {

                                // Remove old script element if it exists (for our custom js)
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
                            // Don't re-run toggle listeners or redundant boilerplate scripts
                            if (!script.innerHTML.includes('mobileMenuToggle') && !script.innerHTML.includes('modalConfirm')) {
                                const newScript = document.createElement('script');
                                newScript.innerHTML = script.innerHTML;
                                document.body.appendChild(newScript);
                            }
                        }
                    });

                    // Re-initialize icons
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                } else {
                    window.location.href = url;
                }
            } catch (error) {
                console.error('SPA Navigation error:', error);
                window.location.href = url; // Fallback
            }
        }
    });
}

// Handle browser back/forward buttons
window.addEventListener('popstate', () => {
    window.location.reload();
});
