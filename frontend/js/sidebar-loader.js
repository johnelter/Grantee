document.addEventListener('DOMContentLoaded', async () => {

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
                const currentPath = window.location.pathname.split('/').pop() || 'index.html';
                const links = sidebarContainer.querySelectorAll('a.menu-item');
                links.forEach(link => {
                    if (link.getAttribute('href') === currentPath) {
                        link.classList.add('active');
                    }
                });

                initMobileMenu();
            }
        } catch (error) {
            console.error('Failed to load sidebar component:', error);
        }
    }

    // --- 2. INJECT LOGOUT MODAL & INITIALIZE LOGIC ---
    try {
        const modalResponse = await fetch('components/logout-modal.html');
        if (modalResponse.ok) {
            const modalHtml = await modalResponse.text();
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            initGlobalLogoutLogic(); // Start logic once modal is in the DOM
        }
    } catch (error) {
        console.error('Failed to load logout modal component:', error);
    }
});

// --- MOBILE MENU FUNCTION ---
function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuToggle && sidebar && sidebarOverlay) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }
}

// --- GLOBAL LOGOUT FUNCTION ---
function initGlobalLogoutLogic() {
    const logoutModal = document.getElementById('logout-modal');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    const profileMenu = document.getElementById('profile-menu');

    // Find any button with these IDs (in the header or sidebar)
    const logoutTriggers = document.querySelectorAll('#dropdown-logout-btn, #sidebar-logout-btn, .logout-trigger');

    // Open Modal
    logoutTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (logoutModal) logoutModal.style.display = 'flex';
            if (profileMenu) profileMenu.classList.remove('show');
        });
    });

    // Close Modal on Cancel
    if (modalCancel) {
        modalCancel.addEventListener('click', () => {
            logoutModal.style.display = 'none';
        });
    }

    // Close Modal on Outside Click
    if (logoutModal) {
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) logoutModal.style.display = 'none';
        });
    }

    // Process Logout on Confirm
    if (modalConfirm) {
        modalConfirm.addEventListener('click', async () => {
            if (window.supabaseClient) {
                try {
                    modalConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                    modalConfirm.disabled = true;

                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error("Logout Error:", error);
                    alert("Failed to logout safely.");
                    modalConfirm.innerHTML = '<i class="fa-solid fa-power-off"></i> Logout';
                    modalConfirm.disabled = false;
                }
            }
        });
    }
}

