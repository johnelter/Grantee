document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. AUTH CHECK & INIT ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }
    const studentId = session.user.id;
    let studentSchoolId = null; // Global variable to hold the student's school UUID

    const gridContainer = document.getElementById('scholarship-grid');
    const resultCount = document.getElementById('result-count');
    let allScholarships = [];
    let filteredScholarships = [];

    // --- 2. FETCH PROFILE & SCHOOL FROM MASTERLIST ---
    async function loadProfile() {
        try {
            // Step 1: Get the student's basic profile
            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profileError) throw profileError;

            if (profile) {
                // Step 2: Use their id_number to find their school in the masterlist
                const { data: masterlistData, error: masterlistError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('school_id, schools(name)')
                    .eq('id_number', profile.id_number)
                    .single();

                if (masterlistError) {
                    console.warn("Could not find student in masterlist to assign school.");
                }

                // Save the school_id to filter the scholarships later
                studentSchoolId = masterlistData ? masterlistData.school_id : null;

                // Update UI Elements
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.program || profile.course || 'Student Profile';
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            }
        } catch (error) {
            console.error("Error loading profile and masterlist data:", error);
        }
    }

    // --- 3. UTILITIES & STATUS CALCULATION ---
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getBadgeHTML = (category) => {
        if (!category) return '';
        const catLower = category.toLowerCase();
        let bg = 'rgba(16, 185, 129, 0.1)', color = 'var(--primary-color)'; 
        
        if (catLower.includes('need')) { bg = 'rgba(59, 130, 246, 0.1)'; color = '#3b82f6'; }
        if (catLower.includes('talent')) { bg = 'rgba(139, 92, 246, 0.1)'; color = '#8b5cf6'; }
        if (catLower.includes('departmental')) { bg = 'rgba(99, 102, 241, 0.1)'; color = '#6366f1'; }

        return `<span style="background:${bg}; color:${color}; padding:6px 12px; border-radius:12px; font-size:11px; font-weight:700;">${category}</span>`;
    };

    const calculateDynamicStatus = (sch) => {
        if (sch.status === 'Draft') return 'Draft';
        if (!sch.start_date || !sch.end_date) return sch.status || 'Draft';

        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const start = new Date(sch.start_date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(sch.end_date);
        end.setHours(23, 59, 59, 999); 

        if (today < start) return 'Upcoming';
        if (today >= start && today <= end) return 'Active';
        return 'Closed';
    };

    // --- 4. FETCH DATA FROM SUPABASE (Isolated by School ID) ---
    const loadScholarships = async () => {
        try {
            if (!studentSchoolId) {
                gridContainer.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #ef4444;">Error: No school assigned to your profile. Please contact support.</div>';
                return;
            }

            gridContainer.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #64748b;">Loading scholarships...</div>';
            
            // STRICT FILTER: Only pull scholarships where the school_id matches the student's school_id
            const { data: rawData, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('school_id', studentSchoolId) // The Multi-Tenant Filter!
                .neq('status', 'Draft')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            allScholarships = rawData.map(sch => ({
                ...sch,
                display_status: calculateDynamicStatus(sch)
            }));
            
            filteredScholarships = [...allScholarships];
            renderCards(filteredScholarships);

        } catch (error) {
            console.error('Error fetching scholarships:', error);
            gridContainer.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #ef4444;">Failed to load scholarships. Please check your connection.</div>`;
        }
    };

    // --- 5. RENDER CARDS ---
    const renderCards = (data) => {
        if(resultCount) resultCount.innerText = data.length;

        if (data.length === 0) {
            gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:60px; color:var(--text-muted); background: #fff; border-radius: 12px; border: 1px solid var(--border-color);">No scholarships match your criteria.</div>`;
            return;
        }

        gridContainer.innerHTML = '';
        
        data.forEach(sch => {
            const card = document.createElement('div');
            card.className = 'sch-card';
            
            const isUpcoming = sch.display_status === 'Upcoming';
            const isClosed = sch.display_status === 'Closed';

            let applyBtnText = 'Apply Now →';
            let applyBtnDisabled = '';

            if (isUpcoming) {
                applyBtnText = 'Opening Soon';
                applyBtnDisabled = 'disabled';
            } else if (isClosed) {
                applyBtnText = 'Application Closed';
                applyBtnDisabled = 'disabled';
            }

            const cardOpacity = isClosed ? 'opacity: 0.6; pointer-events: none;' : '';
            const slotsText = sch.available_slots ? `${sch.available_slots} Left` : 'Varies';

            card.innerHTML = `
                <div style="display:flex; justify-content:flex-start; margin-bottom:16px;">
                    ${getBadgeHTML(sch.category)}
                    ${isClosed ? '<span style="margin-left:auto; font-size:11px; font-weight:bold; color:var(--danger-color); background:#fee2e2; padding:4px 10px; border-radius:12px;">CLOSED</span>' : ''}
                </div>
                
                <div class="sch-card-header" style="${cardOpacity}">
                    <div class="card-icon">🎓</div>
                    <div class="card-title-group">
                        <h3>${sch.title}</h3>
                        <span>${sch.department || 'All Departments'}</span>
                    </div>
                </div>

                <p style="${cardOpacity}">
                    ${sch.description ? sch.description.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...' : 'No description provided.'}
                </p>

                <div class="sch-card-footer" style="${cardOpacity}">
                    <div class="deadline-text">
                        Deadline: <strong style="${isClosed ? 'color:var(--danger-color); text-decoration:line-through;' : 'color:var(--text-main);'}">${formatDate(sch.end_date)}</strong>
                        <br><span style="font-size: 11px;">Slots: ${slotsText}</span>
                    </div>
                    <button class="btn-primary btn-apply" data-id="${sch.id}" ${applyBtnDisabled}>${applyBtnText}</button>
                </div>
            `;
            gridContainer.appendChild(card);
        });
    };
    
    // --- 6. SEARCH & FILTER LOGIC ---
    const applyFilters = () => {
        const searchInput = document.getElementById('search-input');
        const sideCat = document.getElementById('side-filter-category');
        const topCat = document.getElementById('filter-category');
        const sideDept = document.getElementById('side-filter-dept');
        const statusFil = document.getElementById('filter-status');

        const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
        const catVal = (sideCat && sideCat.value) ? sideCat.value : (topCat && topCat.value ? topCat.value : '');
        const deptVal = sideDept ? sideDept.value : '';
        const statusVal = statusFil ? statusFil.value : '';

        filteredScholarships = allScholarships.filter(sch => {
            const matchesSearch = (sch.title || '').toLowerCase().includes(searchVal);
            const matchesCat = catVal === '' || sch.category === catVal;
            const matchesDept = deptVal === '' || deptVal === 'All Departments' || sch.department === deptVal;
            const matchesStatus = statusVal === '' || sch.display_status === statusVal;

            return matchesSearch && matchesCat && matchesDept && matchesStatus;
        });

        renderCards(filteredScholarships);
    };

    if(document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if(document.getElementById('filter-category')) document.getElementById('filter-category').addEventListener('change', applyFilters);
    if(document.getElementById('side-filter-category')) document.getElementById('side-filter-category').addEventListener('change', applyFilters);
    if(document.getElementById('side-filter-dept')) document.getElementById('side-filter-dept').addEventListener('change', applyFilters);
    if(document.getElementById('filter-status')) document.getElementById('filter-status').addEventListener('change', applyFilters);
    if(document.getElementById('apply-filters-btn')) document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);

    if(document.getElementById('clear-filters')) {
        document.getElementById('clear-filters').addEventListener('click', (e) => {
            e.preventDefault();
            if(document.getElementById('search-input')) document.getElementById('search-input').value = '';
            if(document.getElementById('side-filter-category')) document.getElementById('side-filter-category').value = '';
            if(document.getElementById('side-filter-dept')) document.getElementById('side-filter-dept').value = '';
            if(document.getElementById('filter-category')) document.getElementById('filter-category').value = '';
            if(document.getElementById('filter-status')) document.getElementById('filter-status').value = '';
            applyFilters();
        });
    }

    gridContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-apply');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        window.location.href = `apply-scholarships.html?id=${id}`;
    });

    // --- 5. AI CHAT TOGGLE (Global Window Function) ---
    window.toggleChat = () => {
        const widget = document.getElementById('ai-chat-widget');
        if (widget) widget.classList.toggle('open');
    };


    // --- 7. UI WIDGETS (Dropdown & Modal Logout) ---
    
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
    const logoutTriggers = document.querySelectorAll('#logout-btn, #sidebar-logout-btn, #dropdown-logout-btn');

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
                    window.location.href = 'login.html';
                } catch (error) {
                    console.error("Logout Error:", error);
                    alert("Failed to logout. Please try again.");
                    modalConfirm.innerText = "Yes";
                }
            });
        }
    }

    // --- 8. INITIALIZATION BOOT SEQUENCE ---
    // We MUST await loadProfile first so we have the studentSchoolId before loading scholarships!
    await loadProfile();
    await loadScholarships();
});