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

    // Change Hardcoded Emojis to FontAwesome Icons in the Stats Grid
    const statIcons = document.querySelectorAll('.stat-icon');
    if (statIcons.length >= 3) {
        statIcons[0].innerHTML = '<i class="fa-solid fa-book"></i>';
        statIcons[1].innerHTML = '<i class="fa-solid fa-envelope-open-text"></i>';
        statIcons[2].innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    }

    // --- 2. LOAD PROFILE DATA INTO HEADER ---
    async function loadProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', adminId)
                .single();

            if (profile) {
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                currentAdminSchoolId = profile.school_id;

                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';

                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                }

                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                loadScholarships();
            }
        } catch (error) {
            console.error("Error loading admin profile:", error);
        }
    }

    // --- 3. INTERACTIVE DROPDOWN & MOBILE LOGIC ---
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebarContainer = document.getElementById('sidebar-container');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (mobileMenuToggle && sidebarContainer && sidebarOverlay) {
        mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = sidebarContainer.classList.contains('active');
            if (isActive) {
                sidebarContainer.classList.remove('active');
                sidebarOverlay.classList.remove('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.remove('active');
            } else {
                sidebarContainer.classList.add('active');
                sidebarOverlay.classList.add('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.add('active');
            }
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebarContainer.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        });
    }

    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
            profileToggle.classList.toggle('active-state');
        });
        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target)) {
                profileMenu.classList.remove('show');
                profileToggle.classList.remove('active-state');
            }
        });
    }

    // LOGOUT LOGIC WITH SWEETALERT
    // const logoutBtns = [document.getElementById('dropdown-logout-btn')];
    // logoutBtns.forEach(btn => {
    //     if (btn) {
    //         btn.addEventListener('click', (e) => {
    //             e.preventDefault();
    //             if (profileMenu) profileMenu.classList.remove('show');
                
    //             Swal.fire({
    //                 title: 'Are you sure?',
    //                 text: "You will be logged out of your session.",
    //                 icon: 'warning',
    //                 showCancelButton: true,
    //                 confirmButtonColor: '#3b82f6',
    //                 cancelButtonColor: '#ef4444',
    //                 confirmButtonText: '<i class="fas fa-sign-out-alt"></i> Yes, logout'
    //             }).then(async (result) => {
    //                 if (result.isConfirmed) {
    //                     try {
    //                         Swal.fire({
    //                             title: 'Logging out...',
    //                             allowOutsideClick: false,
    //                             didOpen: () => Swal.showLoading()
    //                         });
    //                         await window.supabaseClient.auth.signOut();
    //                         window.location.href = 'login.html';
    //                     } catch (error) {
    //                         console.error("Logout error:", error);
    //                         Swal.fire('Error!', 'Failed to logout. Please try again.', 'error');
    //                     }
    //                 }
    //             });
    //         });
    //     }
    // });

    // Remove old modal logic if it exists in HTML to prevent conflicts
    const oldLogoutModal = document.getElementById('logout-modal');
    if (oldLogoutModal) oldLogoutModal.remove();

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
        const safeType = type || 'Institution-Funded Educational Assistance';
        let bg = '#f1f5f9';
        let color = '#475569';

        if (safeType === 'Institution-Funded Educational Assistance') { bg = '#e0e7ff'; color = '#3730a3'; }
        else if (safeType === 'Ched Educational Assistance') { bg = '#dcfce7'; color = '#166534'; }
        else if (safeType === 'Private Educational Assistance') { bg = '#fce7f3'; color = '#9d174d'; }
        else if (safeType === 'Government Educational Assistance') { bg = '#fef3c7'; color = '#92400e'; }

        return `<span style="background:${bg}; color:${color}; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold; display:inline-block; white-space:nowrap;">${safeType}</span>`;
    };

    const getScholarshipTypeBadge = (schType) => {
        const safeType = schType || 'Merit-Based';
        let bg = safeType === 'Need-Based' ? '#f3e8ff' : '#dbeafe';
        let color = safeType === 'Need-Based' ? '#6b21a8' : '#1e40af';
        return `<span style="background:${bg}; color:${color}; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold; display:inline-block; white-space:nowrap;">${safeType}</span>`;
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

    const loadScholarships = async () => {
        try {
            if (!currentAdminSchoolId) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red" style="padding: 40px;">Account error: No school assigned to this admin.</td></tr>`;
                return;
            }

            const { data: rawData, error } = await window.supabaseClient
                .from('scholarships')
                .select(`*, applications(id, status)`)
                .eq('school_id', currentAdminSchoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            allScholarships = rawData.map(sch => {
                const totalAppsCount = sch.applications ? sch.applications.length : 0;
                const passedAppsCount = sch.applications ? sch.applications.filter(app => app.status === 'Passed').length : 0;
                let isUnlimited = sch.slots === 'Open' || !sch.slots;
                let remaining = null;

                if (!isUnlimited) {
                    const totalSlots = parseInt(sch.slots) || 0;
                    remaining = Math.max(0, totalSlots - passedAppsCount);
                }

                return {
                    ...sch,
                    applications_count: totalAppsCount,
                    passed_count: passedAppsCount,
                    remaining_slots: remaining,
                    is_unlimited: isUnlimited,
                    dynamic_status: calculateDynamicStatus(sch)
                };
            });

            filteredScholarships = [...allScholarships];
            updateTopStats(allScholarships);
            applyFilters();

        } catch (error) {
            console.error('Error fetching data:', error);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red" style="padding: 40px;">Failed to load data from database.</td></tr>`;
            Swal.fire('Error', 'Failed to load data from database.', 'error');
        }
    };

    const updateTopStats = (data) => {
        if (document.getElementById('count-total')) document.getElementById('count-total').innerText = data.length;
        if (document.getElementById('count-active')) document.getElementById('count-active').innerText = data.filter(s => s.dynamic_status === 'Active').length;
        if (document.getElementById('count-closed')) document.getElementById('count-closed').innerText = data.filter(s => s.dynamic_status === 'Closed' || s.dynamic_status === 'Draft').length;
    };

    const renderTable = (data) => {
        const entriesInfo = document.getElementById('entries-info');
        if (entriesInfo) entriesInfo.innerText = `Showing 1 to ${data.length} of ${data.length} entries`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="padding:40px; text-align:center; color:#64748b;">No matching educational assistance programs found.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';

        data.forEach(sch => {
            let slotsDisplay = '';
            if (sch.is_unlimited) {
                slotsDisplay = `<div style="font-size:11px; margin-top:4px; color:#64748b;">Unlimited Slots</div>`;
            } else if (sch.remaining_slots === 0) {
                slotsDisplay = `<div style="font-size:11px; margin-top:4px; font-weight:bold; color:#ef4444;">FULL (0/${sch.slots} Left)</div>`;
            } else {
                slotsDisplay = `<div style="font-size:11px; margin-top:4px; font-weight:bold; color:#10b981;">${sch.remaining_slots}/${sch.slots} Slot(s) Left</div>`;
            }

            // Stripping HTML from description for the table preview
            let rawTextDesc = 'No description';
            if (sch.description) {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = sch.description;
                rawTextDesc = tempDiv.textContent || tempDiv.innerText || "";
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="scholarship-name-cell">
                        <div style="width:36px;height:36px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--primary-color);">
                            <i class="fa-solid fa-graduation-cap"></i>
                        </div>
                        <div>
                            <strong>${sch.title}</strong>
                            <span>${rawTextDesc.substring(0, 40) + (rawTextDesc.length > 40 ? '...' : '')}</span>
                        </div>
                    </div>
                </td>
                <td style="vertical-align: middle;">${getTypeBadge(sch.category)}</td>
                <td style="vertical-align: middle;">${getScholarshipTypeBadge(sch.scholarship_type)}</td>
                <td style="vertical-align: middle;">${formatDate(sch.start_date)}</td>
                <td style="vertical-align: middle;">${formatDate(sch.end_date)}</td>
                <td style="vertical-align: middle;">${getStatusHTML(sch.dynamic_status)}</td>
                <td style="text-align:center; vertical-align: middle;">
                    <div style="font-weight:600;">${sch.applications_count || 0} Apps</div>
                    ${slotsDisplay}
                </td>
                <td style="vertical-align: middle;">
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;">
                        <button class="action-view" data-id="${sch.id}" title="View Application Form" style="padding: 6px 16px; border: 1px solid #3b82f6; background: #dbeafe; color: #3b82f6; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s;"><i class="fa-solid fa-eye" style="margin-right: 4px;"></i> View</button>
                        <button class="action-delete" data-id="${sch.id}" title="Delete" style="padding: 6px 16px; border: 1px solid #ef4444; background: #fee2e2; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s;"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const applyFilters = () => {
        const searchInput = document.getElementById('search-input');
        const statusFilterInput = document.getElementById('filter-status');
        const categoryFilterInput = document.getElementById('filter-type'); 
        const schTypeFilterInput = document.getElementById('filter-scholarship-type'); 
        const sortByInput = document.getElementById('sort-by');

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const statusFilter = statusFilterInput ? statusFilterInput.value : '';
        const categoryFilter = categoryFilterInput ? categoryFilterInput.value : '';
        const schTypeFilter = schTypeFilterInput ? schTypeFilterInput.value : '';
        const sortBy = sortByInput ? sortByInput.value : '';

        filteredScholarships = allScholarships.filter(sch => {
            const matchesSearch = (sch.title || '').toLowerCase().includes(searchTerm) || (sch.description || '').toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === '' || sch.dynamic_status === statusFilter;
            const matchesCategory = categoryFilter === '' || sch.category === categoryFilter;
            const matchesSchType = schTypeFilter === '' || sch.scholarship_type === schTypeFilter;

            return matchesSearch && matchesStatus && matchesCategory && matchesSchType;
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

    if (document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if (document.getElementById('filter-status')) document.getElementById('filter-status').addEventListener('change', applyFilters);
    if (document.getElementById('filter-type')) document.getElementById('filter-type').addEventListener('change', applyFilters);
    if (document.getElementById('filter-scholarship-type')) document.getElementById('filter-scholarship-type').addEventListener('change', applyFilters); 
    if (document.getElementById('sort-by')) document.getElementById('sort-by').addEventListener('change', applyFilters);

    // --- 5. PREVIEW MODAL LOGIC (ACCURATE APPLICATION VIEW VIA SWEETALERT) ---
    const showPreviewModal = (sch) => {
        let dateText = "Not Set";
        if (sch.end_date) {
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            dateText = new Date(sch.end_date).toLocaleDateString('en-US', options);
        }

        const safeParse = (data) => {
            if (typeof data === 'string') {
                try { return JSON.parse(data); } catch(e) { return []; }
            }
            return Array.isArray(data) ? data : [];
        };

        const formFields = safeParse(sch.form_fields);
        const docConfigs = safeParse(sch.document_configurations);
        const eligibilityYears = safeParse(sch.eligibility_years);

        let html = `
        <style>
            /* Mobile responsiveness for the SweetAlert modal */
            .preview-mockup-body { padding: 30px; }
            .preview-split { display: grid; grid-template-columns: 2fr 1fr; gap: 30px; margin-bottom: 30px; }
            .preview-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            
            @media (max-width: 768px) {
                .preview-mockup-body { padding: 15px !important; }
                .preview-split { grid-template-columns: 1fr !important; gap: 15px !important; }
                .preview-field-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
                .swal2-popup.preview-swal-popup { width: 95% !important; max-width: 100% !important; padding: 0 !important; }
            }
        </style>
        <div class="preview-mockup" style="text-align: left; width: 100%;">
            <div class="preview-mockup-header" style="background: #1e293b; color: #fff; padding: 12px 20px; font-size: 14px; font-weight: 500; display: flex; justify-content: space-between; align-items: center; border-radius: 8px 8px 0 0;">
                <span><i class="fa-solid fa-graduation-cap" style="margin-right: 6px;"></i> Educational Assistance Application Form</span>
            </div>
            
            <div class="preview-mockup-body" style="max-height: 80vh; overflow-y: auto;">
                <div class="preview-badges" style="display: flex; gap: 10px; margin-bottom: 15px;">
                    <span class="preview-badge-cat" style="background: #065f46; color: #fff; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">${sch.category || 'Institution-Funded'}</span>
                    <span class="preview-badge-type" style="background: #e0e7ff; color: #3730a3; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">${sch.scholarship_type || 'Merit-Based'}</span>
                </div>
                
                <h2 class="preview-title" style="font-size: 24px; font-weight: 800; margin-bottom: 5px; color: #0f172a; line-height: 1.3;">${sch.title || 'Untitled Educational Assistance'}</h2>
                <div class="preview-subtitle" style="color: #64748b; font-size: 13px; margin-bottom: 25px;">General Admin</div>

                <!-- Handled by responsive class .preview-split -->
                <div class="preview-split">
                    <div>
                        <h4 style="font-size:16px; margin-bottom:10px; color:#0f172a;">About this Educational Assistance</h4>
                        
                        <!-- Rich Text formatting strictly maintained here -->
                        <div style="font-size:13.5px; color:#334155; margin-bottom:20px; line-height:1.6; word-break: break-word;">${sch.description || 'No description provided.'}</div>
                        
                        <h4 style="font-size:16px; margin-bottom:10px; color:#0f172a;">Eligibility Requirements</h4>
                        <ul style="list-style:none; font-size:13.5px; color:#334155; padding:0;">
                            ${sch.min_college_gwa ? `<li style="margin-bottom:6px;"><i class="fa-solid fa-check text-green" style="color: #10b981; margin-right: 6px;"></i> Must have a College GWA of <b>${sch.min_college_gwa}</b> or better.</li>` : ''}
                            ${sch.min_college_subject_grade ? `<li style="margin-bottom:6px;"><i class="fa-solid fa-check text-green" style="color: #10b981; margin-right: 6px;"></i> Must have NO individual College subject grade lower than <b>${sch.min_college_subject_grade}</b>.</li>` : ''}
                            <li style="margin-bottom:6px;"><i class="fa-solid fa-check text-green" style="color: #10b981; margin-right: 6px;"></i> Open to Year Levels: <b>${eligibilityYears.length > 0 ? eligibilityYears.join(', ') : 'Any'}</b>.</li>
                        </ul>
                    </div>
                    
                    <div class="preview-info-box" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; background: #f8fafc; height: fit-content;">
                        <div class="preview-info-label" style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Application Deadline</div>
                        <div class="preview-info-value" style="font-size: 14px; color: #ef4444; font-weight: 600; margin-bottom: 15px;">${dateText}</div>
                        
                        <div class="preview-info-label" style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Available Slots</div>
                        <div class="preview-info-value" style="font-size: 14px; color: #0f172a; font-weight: 600; margin-bottom: 15px;">${sch.slots || 'Open'}</div>
                        
                        <div class="preview-info-label" style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Status</div>
                        <div class="preview-info-value" style="font-size: 14px; color: #10b981; font-weight: 600;">ACTIVE</div>
                    </div>
                </div>

                <div style="text-align:center; margin-bottom:30px; border-top: 1px solid #e2e8f0; padding-top: 30px;">
                    <h2 style="font-size:22px; margin-bottom:5px; color: #0f172a;">Application Form</h2>
                    <p style="color:#64748b; font-size:13px;">Complete the required fields below.</p>
                </div>

                <div class="preview-section-title" style="font-size: 18px; font-weight: 700; margin-bottom: 5px; color: #0f172a;">1. Applicant Profile</div>
                <p style="font-size:12px; color:#64748b; margin-bottom:15px;">This information is permanently tied to your account. To edit, go to Profile Settings.</p>
                
                <!-- Handled by responsive class .preview-field-grid -->
                <div class="preview-field-grid" style="margin-bottom: 30px;">
                    <div style="display: flex; flex-direction: column;"><label style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Student ID Number</label><input type="text" value="202302709" readonly style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #94a3b8; font-size: 13px;"></div>
                    <div style="display: flex; flex-direction: column;"><label style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Email Address</label><input type="text" value="student@gmail.com" readonly style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #94a3b8; font-size: 13px;"></div>
                    <div style="display: flex; flex-direction: column; grid-column: 1 / -1;"><label style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Full Name</label><input type="text" value="John Jeffrey T. Cañete" readonly style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #94a3b8; font-size: 13px;"></div>
                    <div style="display: flex; flex-direction: column;"><label style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Gender</label><input type="text" value="Male" readonly style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #94a3b8; font-size: 13px;"></div>
                    <div style="display: flex; flex-direction: column;"><label style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Program</label><input type="text" value="BS Information Technology" readonly style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #94a3b8; font-size: 13px;"></div>
                    <div style="display: flex; flex-direction: column;"><label style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px;">Year Level</label><input type="text" value="3rd year" readonly style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f1f5f9; color: #94a3b8; font-size: 13px;"></div>
                </div>

                <div class="preview-section-title" style="font-size: 18px; font-weight: 700; margin-bottom: 15px; color: #0f172a;">2. Questionnaire</div>
                ${formFields.length === 0 ? '<p style="font-size:13px; color:#64748b; margin-bottom:30px;">No custom questions added.</p>' : ''}
                
                <div style="margin-bottom: 30px;">
                    ${formFields.map(f => `
                        <div style="margin-bottom:15px; display: flex; flex-direction: column;">
                            <label style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px;">${f.label} ${f.required ? '<span style="color: #ef4444;">*</span>' : ''}</label>
                            ${['Dropdown', 'Selection'].includes(f.type) 
                                ? `<select style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: #fff; cursor: not-allowed;" disabled><option>Select option...</option>${(f.options || []).map(o=>`<option>${o}</option>`).join('')}</select>`
                                : `<input type="text" placeholder="Enter your answer..." style="padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: #fff; cursor: not-allowed;" disabled>`
                            }
                        </div>
                    `).join('')}
                </div>

                <div class="preview-section-title" style="font-size: 18px; font-weight: 700; margin-bottom: 15px; color: #0f172a;">3. Document Uploads</div>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 6px; color: #1e40af; font-size: 12px; display: flex; gap: 10px; align-items: flex-start; margin-bottom: 20px;">
                    <i class="fa-solid fa-robot" style="font-size:18px; margin-top: 2px;"></i>
                    <div>
                        <strong>AI Verification Active:</strong> Please ensure your documents are clear and legible. Our AI system will scan the contents to verify authenticity.
                    </div>
                </div>

                ${docConfigs.length === 0 ? '<p style="font-size:13px; color:#64748b;">No documents required.</p>' : ''}
                
                <!-- Handled by responsive class .preview-field-grid -->
                <div class="preview-field-grid">
                    ${docConfigs.map(d => `
                        <div style="border: 1px dashed #cbd5e1; padding: 20px; border-radius: 8px; text-align: center; background: #f8fafc;">
                            <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:5px;">
                                <i class="fa-solid fa-file-arrow-up" style="margin-right: 4px;"></i> Upload ${d.name} ${d.required ? '<span style="color: #ef4444;">*</span>' : ''}
                            </label>
                            <div style="font-size:11px; color:#64748b; margin-bottom:10px;">Allowed: PDF, JPG, PNG (Max: ${d.max_size}MB)</div>
                            <button type="button" style="padding:8px 20px; background:#fff; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; cursor:not-allowed;" disabled>Choose File</button>
                        </div>
                    `).join('')}
                </div>

                <div style="text-align: right; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    <button type="button" style="background: var(--primary-color, #10b981); color: #fff; padding: 10px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: not-allowed; opacity: 0.7;" disabled>Submit Application</button>
                </div>
            </div>
        </div>`;

        Swal.fire({
            html: html,
            width: '800px',
            padding: '0',
            showConfirmButton: false,
            showCloseButton: true,
            allowOutsideClick: false,
            allowEscapeKey: true,
            customClass: {
                popup: 'preview-swal-popup'
            }
        });
    };

    // ACTION BUTTONS (VIEW & DELETE LOGIC WITH SWEETALERT)
    tbody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const scholarshipId = btn.getAttribute('data-id');
        const targetScholarship = allScholarships.find(s => s.id == scholarshipId);

        if (btn.classList.contains('action-view')) {
            if (targetScholarship) showPreviewModal(targetScholarship);
        } else if (btn.classList.contains('action-delete')) {
            
            Swal.fire({
                title: 'Delete this program?',
                text: "Are you sure you want to permanently delete this educational assistance program? All related applications will be lost.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fa-solid fa-trash-can"></i> Yes, delete it'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    try {
                        const originalHtml = btn.innerHTML;
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                        
                        const { error } = await window.supabaseClient.from('scholarships').delete().eq('id', scholarshipId);
                        if (error) throw error;

                        Swal.fire('Deleted!', 'Educational assistance program deleted successfully.', 'success');
                        loadScholarships();
                    } catch (error) {
                        console.error('Delete error:', error);
                        Swal.fire('Error!', 'Cannot delete this program. There may be existing applications tied to it.', 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                    }
                }
            });
        }
    });

    // --- 6. EXPORT TO CSV & PDF LOGIC ---
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            // Check if there is data to export
            if (filteredScholarships.length === 0) {
                Swal.fire('No Data', 'There is no data to export based on your current filters.', 'info');
                return;
            }

            // Ask the user which format they prefer
            Swal.fire({
                title: 'Export Data',
                text: 'Choose the format you want to export:',
                icon: 'question',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-file-csv" style="margin-right: 4px;"></i> CSV',
                denyButtonText: '<i class="fa-solid fa-file-pdf" style="margin-right: 4px;"></i> PDF',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#3b82f6', // Blue for CSV
                denyButtonColor: '#ef4444'     // Red for PDF
            }).then((result) => {
                if (result.isConfirmed) {
                    exportToCSV();
                } else if (result.isDenied) {
                    exportToPDF();
                }
            });
        });
    }

    function exportToCSV() {
        let csvContent = "Educational Assistance Name,Category,Type,Opening Date,Deadline,Status,Total Applications,Remaining Slots\n";

        filteredScholarships.forEach(sch => {
            const name = `"${(sch.title || 'Untitled').replace(/"/g, '""')}"`;
            const category = `"${sch.category || 'General'}"`;
            const type = `"${sch.scholarship_type || 'Merit-Based'}"`;
            const start = formatDate(sch.start_date);
            const end = formatDate(sch.end_date);
            const status = sch.dynamic_status || 'Unknown';
            const appsCount = sch.applications_count || 0;
            const slots = sch.is_unlimited ? 'Unlimited' : sch.remaining_slots;

            csvContent += `${name},${category},${type},${start},${end},${status},${appsCount},${slots}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const today = new Date().toISOString().split('T')[0];
        
        link.setAttribute("href", url);
        link.setAttribute("download", `Educational_Assistance_Export_${today}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportToPDF() {
        // Ensure the jsPDF library loaded correctly
        if (!window.jspdf) {
            Swal.fire('Error', 'PDF library failed to load. Please check your internet connection.', 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        // Create a landscape document to fit all the columns nicely
        const doc = new jsPDF('landscape'); 

        // Add a title to the PDF
        doc.setFontSize(14);
        doc.text("Educational Assistance Programs Report", 14, 15);
        doc.setFontSize(10);
        
        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.text(`Generated on: ${today}`, 14, 22);

        // Define Table Columns and Rows
        const tableColumn = ["Program Name", "Category", "Type", "Start Date", "Deadline", "Status", "Apps", "Slots"];
        const tableRows = [];

        filteredScholarships.forEach(sch => {
            const rowData = [
                sch.title || 'Untitled',
                sch.category || 'General',
                sch.scholarship_type || 'Merit-Based',
                formatDate(sch.start_date),
                formatDate(sch.end_date),
                sch.dynamic_status || 'Unknown',
                sch.applications_count || 0,
                sch.is_unlimited ? 'Unlimited' : sch.remaining_slots
            ];
            tableRows.push(rowData);
        });

        // Generate the auto-table
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [16, 185, 129] }, // Matches your var(--primary-color)
            columnStyles: {
                0: { cellWidth: 50 }, // Give the title column a bit more room
            }
        });

        // Trigger Download
        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`Educational_Assistance_Export_${dateStr}.pdf`);
    }

    // INIT
    loadProfile();
});