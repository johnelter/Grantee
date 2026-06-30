document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    const tbody = document.getElementById('scholarships-tbody');
    let allScholarships = []; 
    let filteredScholarships = []; 
    let currentAdminSchoolId = null;

    // --- 2. LOAD PROFILE DATA INTO HEADER ---
    async function loadProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', adminId)
                .single();

            if (profile) {
                // Ensure only admins can access this page
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                currentAdminSchoolId = profile.school_id;

                // Update Header Name & Avatar
                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';
                
                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                }
                
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                // Call loadScholarships only after we have the school ID
                loadScholarships();
            }
        } catch (error) {
            console.error("Error loading admin profile:", error);
        }
    }

    // --- 3. INTERACTIVE DROPDOWN & MODAL LOGIC ---
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            profileMenu.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target)) profileMenu.classList.remove('show');
        });
    }

    // Logout Modal
    const logoutModal = document.getElementById('logout-modal');
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    const logoutBtns = [document.getElementById('dropdown-logout-btn')]; 

    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                logoutModal.style.display = 'flex';
                if (profileMenu) profileMenu.classList.remove('show'); 
            });
        }
    });

    if (modalCancel) modalCancel.addEventListener('click', () => logoutModal.style.display = 'none');
    if (logoutModal) logoutModal.addEventListener('click', (e) => { if (e.target === logoutModal) logoutModal.style.display = 'none'; });

    if (modalConfirm) {
        modalConfirm.addEventListener('click', async () => {
            try {
                modalConfirm.innerText = "Logging out...";
                modalConfirm.disabled = true;
                await window.supabaseClient.auth.signOut();
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Logout error:", error);
                alert("Failed to logout. Please try again.");
                modalConfirm.innerText = "Logout";
                modalConfirm.disabled = false;
            }
        });
    }

    // --- 4. DATA LOGIC (Formatters, Filters, UI Render) ---
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getStatusHTML = (status) => {
        const lowerStatus = (status || 'Draft').toLowerCase();
        if (lowerStatus === 'active') return `<span class="status-indicator status-active">Active</span>`;
        if (lowerStatus === 'upcoming') return `<span class="status-indicator status-upcoming">Upcoming</span>`;
        if (lowerStatus === 'draft') return `<span class="status-indicator" style="color:var(--text-muted); background:#f1f5f9;">● Draft</span>`;
        return `<span class="status-indicator status-closed">Closed</span>`;
    };

    const getTypeBadge = (type) => {
        const isNeedBased = (type || '').toLowerCase().includes('need');
        return `<span class="badge-type ${isNeedBased ? 'need-based' : ''}">${type || 'N/A'}</span>`;
    };

    const calculateDynamicStatus = (sch) => {
        if (sch.status === 'Draft') return 'Draft';
        if (!sch.start_date || !sch.end_date) return sch.status || 'Draft';

        const today = new Date(); today.setHours(0, 0, 0, 0); 
        const start = new Date(sch.start_date); start.setHours(0, 0, 0, 0);
        const end = new Date(sch.end_date); end.setHours(23, 59, 59, 999); 

        if (today < start) return 'Upcoming';
        if (today >= start && today <= end) return 'Active';
        return 'Closed';
    };

    // Fetch Scholarships specifically for this Admin's School
    const loadScholarships = async () => {
        try {
            if (!currentAdminSchoolId) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red" style="padding: 40px;">Account error: No school assigned to this admin.</td></tr>`;
                return;
            }

            const { data: rawData, error } = await window.supabaseClient
                .from('scholarships')
                .select(`*, applications(id)`)
                .eq('school_id', currentAdminSchoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            allScholarships = rawData.map(sch => {
                const appsCount = sch.applications ? sch.applications.length : 0;
                
                // Calculate dynamic remaining slots, ensuring it never goes below 0
                let remaining = null;
                if (sch.available_slots !== null && sch.available_slots !== undefined) {
                    remaining = Math.max(0, sch.available_slots - appsCount);
                }

                return {
                    ...sch,
                    applications_count: appsCount,
                    remaining_slots: remaining,
                    dynamic_status: calculateDynamicStatus(sch)
                };
            });
            
            filteredScholarships = [...allScholarships]; 
            updateTopStats(allScholarships); 
            applyFilters();

        } catch (error) {
            console.error('Error fetching scholarships:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red" style="padding: 40px;">Failed to load data from database.</td></tr>`;
        }
    };

    const updateTopStats = (data) => {
        if(document.getElementById('count-total')) document.getElementById('count-total').innerText = data.length;
        if(document.getElementById('count-active')) document.getElementById('count-active').innerText = data.filter(s => s.dynamic_status === 'Active').length;
        if(document.getElementById('count-upcoming')) document.getElementById('count-upcoming').innerText = data.filter(s => s.dynamic_status === 'Upcoming').length;
        if(document.getElementById('count-closed')) document.getElementById('count-closed').innerText = data.filter(s => s.dynamic_status === 'Closed' || s.dynamic_status === 'Draft').length;
    };

    const renderTable = (data) => {
        const entriesInfo = document.getElementById('entries-info');
        if(entriesInfo) entriesInfo.innerText = `Showing 1 to ${data.length} of ${data.length} entries`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="padding:40px; text-align:center; color:#64748b;">No matching scholarships found.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        
        data.forEach(sch => {
            // Determine how to display the slots visually based on remaining amount
            let slotsDisplay = '';
            if (sch.remaining_slots === null) {
                slotsDisplay = `<div style="font-size:11px; margin-top:4px; color:#64748b;">Unlimited Slots</div>`;
            } else if (sch.remaining_slots === 0) {
                slotsDisplay = `<div style="font-size:11px; margin-top:4px; font-weight:bold; color:#ef4444;">FULL (0 Slots)</div>`;
            } else {
                slotsDisplay = `<div style="font-size:11px; margin-top:4px; font-weight:bold; color:#10b981;">${sch.remaining_slots} Slot(s) Left</div>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="scholarship-name-cell">
                        <div style="width:36px;height:36px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;">🎓</div>
                        <div>
                            <strong>${sch.title}</strong>
                            <span>${sch.description ? sch.description.substring(0, 40) + '...' : 'No description'}</span>
                        </div>
                    </div>
                </td>
                <td>${getTypeBadge(sch.category)}</td>
                <td>${formatDate(sch.start_date)}</td>
                <td>${formatDate(sch.end_date)}</td>
                <td>${getStatusHTML(sch.dynamic_status)}</td>
                <td style="text-align:center;">
                    <div style="font-weight:600;">${sch.applications_count || 0} Apps</div>
                    ${slotsDisplay}
                </td>
                <td class="action-btns">
                    <button class="btn-icon action-view" data-id="${sch.id}" title="View">👁️</button>
                    <button class="btn-icon action-edit" data-id="${sch.id}" title="Edit">✏️</button>
                    <button class="btn-icon action-delete" data-id="${sch.id}" title="Delete" style="color: #ef4444;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const applyFilters = () => {
        const searchInput = document.getElementById('search-input');
        const statusFilterInput = document.getElementById('filter-status');
        const typeFilterInput = document.getElementById('filter-type');
        const sortByInput = document.getElementById('sort-by');

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const statusFilter = statusFilterInput ? statusFilterInput.value : '';
        const typeFilter = typeFilterInput ? typeFilterInput.value : '';
        const sortBy = sortByInput ? sortByInput.value : '';

        filteredScholarships = allScholarships.filter(sch => {
            const matchesSearch = (sch.title || '').toLowerCase().includes(searchTerm) || (sch.description || '').toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === '' || sch.dynamic_status === statusFilter;
            const matchesType = typeFilter === '' || sch.category === typeFilter;
            return matchesSearch && matchesStatus && matchesType;
        });

        if (sortBy) {
            filteredScholarships.sort((a, b) => {
                let dateA, dateB;
                if (sortBy.startsWith('start')) {
                    dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
                    dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
                } else if (sortBy.startsWith('end')) {
                    dateA = a.end_date ? new Date(a.end_date).getTime() : Number.MAX_SAFE_INTEGER;
                    dateB = b.end_date ? new Date(b.end_date).getTime() : Number.MAX_SAFE_INTEGER;
                }
                return sortBy.endsWith('asc') ? dateA - dateB : dateB - dateA;
            });
        }

        renderTable(filteredScholarships);
    };

    if(document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if(document.getElementById('filter-status')) document.getElementById('filter-status').addEventListener('change', applyFilters);
    if(document.getElementById('filter-type')) document.getElementById('filter-type').addEventListener('change', applyFilters);
    if(document.getElementById('sort-by')) document.getElementById('sort-by').addEventListener('change', applyFilters);

    // ACTION BUTTONS (DELETE LOGIC)
    tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const scholarshipId = btn.getAttribute('data-id');

        if (btn.classList.contains('action-view')) {
            window.location.href = `admin-applications.html?id=${scholarshipId}`;
        } else if (btn.classList.contains('action-edit')) {
            window.location.href = `edit-scholarship.html?id=${scholarshipId}`;
        } else if (btn.classList.contains('action-delete')) {
            const confirmDelete = confirm('Are you sure you want to permanently delete this scholarship? All related applications will also be affected.');
            if (confirmDelete) {
                try {
                    btn.disabled = true;
                    btn.innerText = "⏳";
                    const { error } = await window.supabaseClient.from('scholarships').delete().eq('id', scholarshipId);
                    if (error) throw error;
                    
                    alert('Scholarship deleted successfully.');
                    loadScholarships(); 
                } catch (error) {
                    console.error('Delete error:', error);
                    alert('Error deleting scholarship. Please check if there are existing applications tied to this scholarship blocking the deletion.');
                    btn.disabled = false;
                    btn.innerText = "🗑️";
                }
            }
        }
    });

    // INIT
    loadProfile();
});