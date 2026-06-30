document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login-student.html'; 
        return; 
    }
    const studentId = session.user.id;

    // --- 2. LOAD PROFILE ---
    async function loadProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profile) {
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.course || 'Student Profile';
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            }
        } catch (error) {
            console.error("Error loading profile:", error);
        }
    }

    // --- 3. UI INTERACTIONS (TABS & PANES) ---
    
    // Simple Tab Switching (Visual Only for now)
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    // Handle click on an Announcement Card
    window.showDetail = (type) => {
        // Remove active class from all cards
        document.querySelectorAll('.announcement-card').forEach(card => {
            card.classList.remove('active');
        });

        // Add active class to the clicked card
        event.currentTarget.classList.add('active');

        // Show the Detail Pane, Hide the Empty state
        document.getElementById('empty-pane').style.display = 'none';
        document.getElementById('detail-pane').style.display = 'block';

        // NOTE: In a fully dynamic app, you would fetch data from the database here 
        // and inject it into the #detail-pane HTML based on the card's ID.
        // For this UI mockup, the HTML is pre-filled with the 'Scholarship' example.
    };

    // Close Detail Pane
    window.closeDetail = () => {
        document.getElementById('detail-pane').style.display = 'none';
        document.getElementById('empty-pane').style.display = 'flex';
        
        document.querySelectorAll('.announcement-card').forEach(card => {
            card.classList.remove('active');
        });
    };

    // --- 4. DROPDOWN & LOGOUT LOGIC ---
    
    // Profile Dropdown
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            profileMenu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target)) {
                profileMenu.classList.remove('show');
            }
        });
    }

    // Logout Modal Logic
    const logoutModal = document.getElementById('logout-modal');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const logoutTriggers = document.querySelectorAll('#sidebar-logout-btn, #dropdown-logout-btn');

    if (logoutModal) {
        logoutTriggers.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                logoutModal.style.display = 'flex';
                if(profileMenu) profileMenu.classList.remove('show'); 
            });
        });

        if(modalCancel) modalCancel.addEventListener('click', () => logoutModal.style.display = 'none');
        
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) logoutModal.style.display = 'none';
        });

        if(modalConfirm) {
            modalConfirm.addEventListener('click', async () => {
                try {
                    modalConfirm.innerText = "Logging out...";
                    await window.supabaseClient.auth.signOut();
                    window.location.href = 'login-student.html';
                } catch (error) {
                    console.error("Logout Error:", error);
                    alert("Failed to logout. Please try again.");
                    modalConfirm.innerText = "Yes";
                }
            });
        }
    }

    // --- 5. AI CHAT TOGGLE ---
    window.toggleChat = () => {
        const widget = document.getElementById('ai-chat-widget');
        if(widget) widget.classList.toggle('open');
    };

    // Initialize Page
    loadProfile();
});