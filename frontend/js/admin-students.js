(async function() {
    
    // ==========================================
    // 1. AUTH CHECK & INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    let currentAdminSchoolId = null;
    let allStudents = [];
    
    let pendingImportPayload = [];
    let currentAdminSchool = null;
    let pendingDuplicateRecords = [];

    // ==========================================
    // 1.5 EXACT PROGRAMS & YEAR LEVELS
    // ==========================================
    const EXACT_PROGRAMS = [
        "Bachelor of Science in Accountancy",
        "Bachelor of Science in Business Administration, Major in Financial Management",
        "Bachelor of Science in Hospitality Management",
        "Bachelor of Science in Tourism Management",
        "Bachelor of Elementary Education",
        "Bachelor of Secondary Education, Major in English",
        "Bachelor of Secondary Education, Major in Mathematics",
        "Bachelor of Secondary Education, Major in Filipino",
        "Bachelor of Secondary Education, Major in Science",
        "Bachelor of Secondary Education, Major in Social Studies",
        "Bachelor of Science in Information Technology",
        "Bachelor of Science in Criminology",
        "Bachelor of Science in Psychology"
    ];

    const EXACT_YEARS = [
        "1st year",
        "2nd year",
        "3rd year",
        "4th year",
        "Irregular"
    ];

    function populateDropdowns() {
        const filterProgram = document.getElementById('filter-program');
        const stuProgram = document.getElementById('stu-program');
        const filterYear = document.getElementById('filter-year');
        const stuYear = document.getElementById('stu-year');

        if (filterProgram) filterProgram.innerHTML = '<option value="">All Programs</option>' + EXACT_PROGRAMS.map(p => `<option value="${p}">${p}</option>`).join('');
        if (stuProgram) stuProgram.innerHTML = '<option value="">Select Program</option>' + EXACT_PROGRAMS.map(p => `<option value="${p}">${p}</option>`).join('');
        if (filterYear) filterYear.innerHTML = '<option value="">All Years</option>' + EXACT_YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
        if (stuYear) stuYear.innerHTML = '<option value="">Select Year Level</option>' + EXACT_YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    // ==========================================
    // 2. HEADER PROFILE, DROPDOWN & LOGOUT
    // ==========================================
    async function initProfile() {
        try {
            const { data: profile } = await window.supabaseClient.from('profiles').select('*, schools(name)').eq('id', adminId).single();
            if (profile) {
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;
                const schoolName = profile.schools ? profile.schools.name : (profile.school || 'Unassigned School');
                currentAdminSchool = schoolName;

                const name = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
                if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                if (document.getElementById('admin-school-display')) {
                    document.getElementById('admin-school-display').innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>Assigned to: <strong>${schoolName}</strong></span>`;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                }

                sessionStorage.setItem('grantee_admin_profile', JSON.stringify({
                    name: name,
                    role: profile.role === 'admin' ? 'Coordinator' : profile.role,
                    avatar_url: profile.avatar_url || 'assets/admin-avatar.png',
                    school_name: schoolName,
                    school_id: profile.school_id
                }));

                fetchEnrolledStudents();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }



    // ==========================================
    // 3. FETCH & RENDER ENROLLED STUDENTS
    // ==========================================
    const tbody = document.getElementById('students-tbody');

    function renderSkeletonLoading() {
        if (document.getElementById('stat-total')) {
            document.getElementById('stat-total').innerHTML = '<span class="stat-loading-skeleton"></span>';
        }
        if (document.getElementById('entries-info')) {
            document.getElementById('entries-info').innerHTML = '<div class="skeleton-line" style="width: 160px; height: 14px;"></div>';
        }
        if (tbody) {
            const rowTemplates = [
                { idW: '100px', nameW: '160px', progW: '220px' },
                { idW: '110px', nameW: '190px', progW: '250px' },
                { idW: '95px',  nameW: '140px', progW: '210px' },
                { idW: '105px', nameW: '175px', progW: '230px' },
                { idW: '100px', nameW: '155px', progW: '200px' },
                { idW: '115px', nameW: '180px', progW: '240px' }
            ];
            tbody.innerHTML = rowTemplates.map(r => `
                <tr class="skeleton-row">
                    <td style="padding: 15px; vertical-align: middle;"><div class="skeleton-box skeleton-cb"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-id" style="width: ${r.idW};"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-name" style="width: ${r.nameW};"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-program" style="width: ${r.progW};"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-year"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-gender"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-pill"></div></td>
                    <td style="text-align: right; vertical-align: middle; padding-right: 12px;">
                        <div class="skeleton-actions-group">
                            <div class="skeleton-btn-action"></div>
                            <div class="skeleton-btn-action"></div>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    }

    async function fetchEnrolledStudents() {
        if (!currentAdminSchoolId) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red" style="padding:40px;">No school assigned to this admin.</td></tr>`;
            return;
        }

        renderSkeletonLoading();

        try {
            // Paginate through ALL records to bypass Supabase's default 1000-row limit
            const PAGE_SIZE = 1000;
            let allFetched = [];
            let from = 0;
            let hasMore = true;

            while (hasMore) {
                const { data: page, error } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .select('*')
                    .eq('school_id', currentAdminSchoolId)
                    .order('last_name', { ascending: true })
                    .range(from, from + PAGE_SIZE - 1);

                if (error) throw error;

                if (page && page.length > 0) {
                    allFetched = allFetched.concat(page);
                    from += PAGE_SIZE;
                    hasMore = page.length === PAGE_SIZE; // If we got a full page, there may be more
                } else {
                    hasMore = false;
                }
            }

            const students = allFetched;
            
            // Paginate profiles fetch as well
            let allProfiles = [];
            let profFrom = 0;
            let profHasMore = true;
            while (profHasMore) {
                const { data: profPage, error: profError } = await window.supabaseClient
                    .from('profiles')
                    .select('id_number, gender')
                    .not('id_number', 'is', null)
                    .range(profFrom, profFrom + PAGE_SIZE - 1);
                if (profError) break;
                if (profPage && profPage.length > 0) {
                    allProfiles = allProfiles.concat(profPage);
                    profFrom += PAGE_SIZE;
                    profHasMore = profPage.length === PAGE_SIZE;
                } else {
                    profHasMore = false;
                }
            }

            if (allProfiles.length > 0 && students.length > 0) {
                students.forEach(s => {
                    const liveProfile = allProfiles.find(p => p.id_number === s.id_number);
                    if (liveProfile && liveProfile.gender) {
                        s.gender = liveProfile.gender; 
                    }
                });
            }

            allStudents = students || [];

            const activeStudents = allStudents.filter(s => s.status !== 'Unenrolled');
            if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = activeStudents.length.toLocaleString();

            applyFilters();
        } catch (err) {
            console.error("Error fetching students:", err);
            if(tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red" style="padding:40px;">Failed to load students. ${err.message}</td></tr>`;
        }
    }

    // Track selected student IDs for bulk operations
    let selectedIds = new Set();

    function updateBulkToolbar() {
        const bar = document.getElementById('bulk-action-bar');
        const countEl = document.getElementById('bulk-selected-count');
        const headerCb = document.getElementById('select-all-checkbox');
        if (!bar) return;

        const count = selectedIds.size;
        if (count > 0) {
            bar.classList.add('visible');
            if (countEl) countEl.textContent = `${count.toLocaleString()} student${count !== 1 ? 's' : ''} selected`;
        } else {
            bar.classList.remove('visible');
        }

        // Sync select-all checkbox state (indeterminate when only some rows are checked)
        if (headerCb) {
            const allVisibleCheckboxes = tbody ? [...tbody.querySelectorAll('.row-checkbox')] : [];
            const allChecked = allVisibleCheckboxes.length > 0 && allVisibleCheckboxes.every(cb => cb.checked);
            const someChecked = allVisibleCheckboxes.some(cb => cb.checked);
            headerCb.checked = allChecked;
            headerCb.indeterminate = someChecked && !allChecked;
        }
    }

    function renderTable(data) {
        if (document.getElementById('entries-info')) document.getElementById('entries-info').innerText = `Showing ${data.length.toLocaleString()} students`;

        if (!tbody) return;
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:40px;">No students found matching your criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(s => {
            const tr = document.createElement('tr');
            if (selectedIds.has(s.id)) tr.classList.add('row-selected');
            const mName = s.middle_name ? ` ${s.middle_name.charAt(0)}.` : '';
            const fullName = `${s.last_name}, ${s.first_name}${mName}`;
            
            const statusText = s.status || 'Enrolled';
            const badgeBg = statusText === 'Unenrolled' ? '#fee2e2' : '#dcfce7';
            const badgeColor = statusText === 'Unenrolled' ? '#ef4444' : '#166534';

            tr.innerHTML = `
                <td style="padding: 15px; vertical-align: middle;">
                    <input type="checkbox" class="row-checkbox" data-id="${s.id}" ${selectedIds.has(s.id) ? 'checked' : ''}>
                </td>
                <td style="color:#0f172a; font-weight:600; vertical-align: middle;">${s.id_number}</td>
                <td style="vertical-align: middle;">${fullName}</td>
                <td style="vertical-align: middle;">${s.program || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.year_level || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.gender || 'N/A'}</td>
                <td style="vertical-align: middle;"><span style="background:${badgeBg}; color:${badgeColor}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">${statusText}</span></td>
                <td style="text-align: right; vertical-align: middle; padding-right: 12px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button onclick="editStudent('${s.id}')" title="Edit Student"
                            style="display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border: 1px solid #3b82f6; background: #dbeafe; color: #3b82f6; border-radius: 8px; cursor: pointer; transition: background 0.2s, transform 0.15s; flex-shrink:0;"
                            onmouseover="this.style.background='#bfdbfe'; this.style.transform='scale(1.08)'"
                            onmouseout="this.style.background='#dbeafe'; this.style.transform='scale(1)'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button onclick="deleteStudent('${s.id}')" title="Delete Student"
                            style="display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border: 1px solid #ef4444; background: #fee2e2; color: #ef4444; border-radius: 8px; cursor: pointer; transition: background 0.2s, transform 0.15s; flex-shrink:0;"
                            onmouseover="this.style.background='#fecaca'; this.style.transform='scale(1.08)'"
                            onmouseout="this.style.background='#fee2e2'; this.style.transform='scale(1)'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                        </button>
                    </div>
                </td>
            `;

            // Wire up this row's checkbox
            const cb = tr.querySelector('.row-checkbox');
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedIds.add(s.id);
                    tr.classList.add('row-selected');
                } else {
                    selectedIds.delete(s.id);
                    tr.classList.remove('row-selected');
                }
                updateBulkToolbar();
            });

            tbody.appendChild(tr);
        });

        updateBulkToolbar();
    }

    // ---- Select All checkbox ----
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', () => {
            const allCheckboxes = tbody ? tbody.querySelectorAll('.row-checkbox') : [];
            allCheckboxes.forEach(cb => {
                const id = cb.dataset.id;
                cb.checked = selectAllCb.checked;
                const row = cb.closest('tr');
                if (selectAllCb.checked) {
                    selectedIds.add(id);
                    if (row) row.classList.add('row-selected');
                } else {
                    selectedIds.delete(id);
                    if (row) row.classList.remove('row-selected');
                }
            });
            updateBulkToolbar();
        });
    }

    // ---- Clear Selection button ----
    const btnClearSelection = document.getElementById('btn-clear-selection');
    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', () => {
            selectedIds.clear();
            const allCheckboxes = tbody ? tbody.querySelectorAll('.row-checkbox') : [];
            allCheckboxes.forEach(cb => {
                cb.checked = false;
                const row = cb.closest('tr');
                if (row) row.classList.remove('row-selected');
            });
            if (selectAllCb) { selectAllCb.checked = false; selectAllCb.indeterminate = false; }
            updateBulkToolbar();
        });
    }

    // ---- Bulk Delete button ----
    const btnBulkDelete = document.getElementById('btn-bulk-delete');
    if (btnBulkDelete) {
        btnBulkDelete.addEventListener('click', async () => {
            if (selectedIds.size === 0) return;

            const count = selectedIds.size;
            const result = await Swal.fire({
                title: `Delete ${count.toLocaleString()} Student${count !== 1 ? 's' : ''}?`,
                html: `You are about to <strong>permanently delete ${count.toLocaleString()} student${count !== 1 ? 's' : ''}</strong> from the masterlist.<br><br><span style="color:#64748b;font-size:13px;">Tip: Edit their status to <b>"Unenrolled"</b> instead to keep records.</span>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: `<i class="fa-solid fa-trash"></i> Yes, Delete ${count.toLocaleString()}`,
                cancelButtonText: 'Cancel'
            });

            if (!result.isConfirmed) return;

            Swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                const idsToDelete = [...selectedIds];
                const { error } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .delete()
                    .in('id', idsToDelete);

                if (error) throw error;

                selectedIds.clear();
                Swal.fire('Deleted!', `${count.toLocaleString()} student${count !== 1 ? 's' : ''} have been removed.`, 'success');
                fetchEnrolledStudents();
            } catch (err) {
                Swal.fire('Error', 'Bulk delete failed: ' + err.message, 'error');
            }
        });
    }

    function applyFilters() {
        const termInput = document.getElementById('search-input');
        const progInput = document.getElementById('filter-program');
        const yearInput = document.getElementById('filter-year');
        
        const term = termInput ? termInput.value.toLowerCase() : '';
        const prog = progInput ? progInput.value : '';
        const year = yearInput ? yearInput.value : '';

        const filtered = allStudents.filter(s => {
            const matchSearch = (s.id_number || '').toLowerCase().includes(term) || 
                                (s.first_name || '').toLowerCase().includes(term) || 
                                (s.last_name || '').toLowerCase().includes(term);
            const matchProg = prog === "" || s.program === prog;
            const matchYear = year === "" || s.year_level === year;
            return matchSearch && matchProg && matchYear;
        });

        renderTable(filtered);
    }

    if (document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if (document.getElementById('filter-program')) document.getElementById('filter-program').addEventListener('change', applyFilters);
    if (document.getElementById('filter-year')) document.getElementById('filter-year').addEventListener('change', applyFilters);

    // ==========================================
    // 4. UNENROLL ALL LOGIC (PASSWORD PROTECTED)
    // ==========================================
    const btnUnenrollAll = document.getElementById('btn-unenroll-all');
    if (btnUnenrollAll) {
        btnUnenrollAll.addEventListener('click', async () => {
            
            const activeStudents = allStudents.filter(s => s.status !== 'Unenrolled');
            if (activeStudents.length === 0) {
                Swal.fire('No Action Needed', 'All students are already marked as Unenrolled.', 'info');
                return;
            }

            const { value: password } = await Swal.fire({
                title: 'Security Verification',
                html: `This will instantly change the status of <b>${activeStudents.length}</b> enrolled students to <b>"Unenrolled"</b>.<br><br>Please enter your admin password to proceed.`,
                input: 'password',
                inputPlaceholder: 'Enter your password',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Verify & Unenroll All',
                inputValidator: (value) => {
                    if (!value) {
                        return 'You need to enter your password!'
                    }
                }
            });

            if (password) {
                Swal.fire({ title: 'Verifying Identity...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                const { error: authError } = await window.supabaseClient.auth.signInWithPassword({
                    email: user.email,
                    password: password
                });

                if (authError) {
                    Swal.fire('Security Error', 'Incorrect password. Action aborted.', 'error');
                    return;
                }

                Swal.fire({ title: 'Updating Database...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const { error: updateError } = await window.supabaseClient
                    .from('enrolled_masterlist')
                    .update({ status: 'Unenrolled' })
                    .eq('school_id', currentAdminSchoolId)
                    .neq('status', 'Unenrolled');

                if (updateError) {
                    Swal.fire('Database Error', 'Failed to update records: ' + updateError.message, 'error');
                } else {
                    Swal.fire('Success!', 'All active students have been marked as Unenrolled.', 'success');
                    fetchEnrolledStudents();
                }
            }
        });
    }

    // ==========================================
    // 5. ADD / EDIT STUDENT MODAL LOGIC
    // ==========================================
    const studentModal = document.getElementById('student-modal');
    const studentForm = document.getElementById('student-form');
    const mnameInput = document.getElementById('stu-mname');
    if (mnameInput) mnameInput.placeholder = "Middle Name (Optional)";

    if (document.getElementById('btn-open-add')) {
        document.getElementById('btn-open-add').addEventListener('click', () => {
            if (studentForm) studentForm.reset();
            document.getElementById('student-db-id').value = '';
            document.getElementById('student-modal-title').innerText = "Add New Student";
            
            const statusGroup = document.getElementById('stu-status-group');
            const genderStatusGrid = document.getElementById('stu-gender-status-grid');
            if (statusGroup) statusGroup.style.display = 'none';
            if (genderStatusGrid) genderStatusGrid.style.gridTemplateColumns = '1fr';

            studentModal.style.display = 'flex';
        });
    }

    window.editStudent = (id) => {
        const s = allStudents.find(x => String(x.id) === String(id));
        if (!s) {
            console.error("Student not found for id:", id);
            return;
        }
        
        if (studentForm) studentForm.reset();
        if (document.getElementById('student-db-id')) document.getElementById('student-db-id').value = s.id;
        if (document.getElementById('stu-id-number')) document.getElementById('stu-id-number').value = s.id_number || '';
        if (document.getElementById('stu-fname')) document.getElementById('stu-fname').value = s.first_name || '';
        if (document.getElementById('stu-lname')) document.getElementById('stu-lname').value = s.last_name || '';
        if (mnameInput) mnameInput.value = s.middle_name || ''; 
        
        if (document.getElementById('stu-program')) document.getElementById('stu-program').value = s.program || '';
        if (document.getElementById('stu-year')) document.getElementById('stu-year').value = s.year_level || ''; 
        if (document.getElementById('stu-gender')) document.getElementById('stu-gender').value = s.gender || ''; 
        
        const statusGroup = document.getElementById('stu-status-group');
        const genderStatusGrid = document.getElementById('stu-gender-status-grid');
        const stuStatus = document.getElementById('stu-status');
        if (statusGroup) statusGroup.style.display = 'block';
        if (genderStatusGrid) genderStatusGrid.style.gridTemplateColumns = '1fr 1fr';
        if (stuStatus) stuStatus.value = s.status || 'Enrolled';
        
        if (document.getElementById('student-modal-title')) document.getElementById('student-modal-title').innerText = "Edit Student";
        if (studentModal) studentModal.style.display = 'flex';
    };

    if (studentForm) {
        studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const confirmResult = await Swal.fire({
                title: 'Save Student?',
                text: "Are you sure you want to save this student's information?",
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Yes, Save it'
            });

            if (!confirmResult.isConfirmed) return;

            const btn = document.getElementById('btn-save-student');
            const id = document.getElementById('student-db-id').value;
            const inputIdNumber = document.getElementById('stu-id-number').value.trim();
            
            const isDuplicate = allStudents.some(s => s.id_number.toLowerCase() === inputIdNumber.toLowerCase() && String(s.id) !== String(id));
            if (isDuplicate) {
                Swal.fire('Duplicate Entry', `A student with the ID Number "${inputIdNumber}" is already in the masterlist!`, 'error');
                return;
            }

            btn.disabled = true; btn.innerText = "Saving...";

            const genderVal = document.getElementById('stu-gender') ? document.getElementById('stu-gender').value : null;
            const middleNameVal = document.getElementById('stu-mname') ? document.getElementById('stu-mname').value.trim() : '';
            const statusInput = document.getElementById('stu-status');
            const statusVal = id ? (statusInput && statusInput.value ? statusInput.value : 'Enrolled') : 'Enrolled';
            
            const payload = {
                school_id: currentAdminSchoolId,
                id_number: inputIdNumber,
                first_name: document.getElementById('stu-fname').value.trim(),
                last_name: document.getElementById('stu-lname').value.trim(),
                middle_name: middleNameVal, 
                program: document.getElementById('stu-program').value,
                year_level: document.getElementById('stu-year').value, 
                gender: genderVal,
                status: statusVal
            };

            try {
                if (id) {
                    const { error } = await window.supabaseClient.from('enrolled_masterlist').update(payload).eq('id', id);
                    if (error) throw error;

                    if (payload.id_number) {
                        window.supabaseClient.from('profiles').update({
                            first_name: payload.first_name,
                            last_name: payload.last_name,
                            middle_name: payload.middle_name, 
                            program: payload.program,
                            year_level: payload.year_level,
                            gender: payload.gender
                        }).eq('id_number', payload.id_number).then(({error: syncErr}) => {
                            if (syncErr) console.warn("Background sync to profile skipped:", syncErr);
                        });
                    }
                } else {
                    const { error } = await window.supabaseClient.from('enrolled_masterlist').insert([payload]);
                    if (error) throw error;
                }
                
                Swal.fire('Success!', 'Student information saved successfully.', 'success');
                studentModal.style.display = 'none';
                fetchEnrolledStudents();
            } catch (err) {
                console.error("Save Error:", err);
                Swal.fire('Save Failed', err.message, 'error');
            } finally {
                btn.disabled = false; btn.innerText = "Save Student";
            }
        });
    }

    window.deleteStudent = async (id) => {
        const result = await Swal.fire({
            title: 'Delete Student?',
            text: "Are you sure you want to permanently remove this student? (Note: To keep records, Edit their status to 'Unenrolled' instead.)",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Yes, Delete!'
        });

        if(result.isConfirmed) {
            try {
                const { error } = await window.supabaseClient.from('enrolled_masterlist').delete().eq('id', id);
                if(error) throw error;
                Swal.fire('Deleted!', 'The student has been deleted.', 'success');
                fetchEnrolledStudents();
            } catch(err) {
                Swal.fire('Error', 'Failed to delete record: ' + err.message, 'error');
            }
        }
    };

    // ==========================================
    // 6. IMPORT EXCEL / CSV (APPEND ONLY) WITH PREVIEW
    // ==========================================
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-file-input');
    const importStatus = document.getElementById('import-status');
    const importUploadArea = document.getElementById('import-upload-area');
    const importPreviewArea = document.getElementById('import-preview-area');
    const previewTbody = document.getElementById('preview-tbody');
    const rawThead = document.getElementById('raw-thead');
    const rawTbody = document.getElementById('raw-tbody');
    const previewCount = document.getElementById('preview-count');
    const previewDuplicates = document.getElementById('preview-duplicates');
    const btnCancelImport = document.getElementById('btn-cancel-import');
    const btnConfirmImport = document.getElementById('btn-confirm-import');

    window.downloadImportTemplate = () => {
        const headers = [['Student ID', 'First Name', 'Middle Name', 'Last Name/Surname', 'Program', 'Year Level', 'Gender']];
        const sampleData = [['2024-0001', 'Juan', 'Dela Cruz', 'Santos', 'Bachelor of Science in Information Technology', '1st year', 'Male']];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]);
        ws['!cols'] = [{wch: 15}, {wch: 20}, {wch: 15}, {wch: 25}, {wch: 45}, {wch: 15}, {wch: 12}];
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Enrolled_Students_Template.xlsx");
    };

    function resetImportModal() {
        if(importInput) importInput.value = '';
        importStatus.innerHTML = `
            <div style="margin-bottom: 15px; font-size: 13px; color: #475569; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
                <strong>Need the correct format?</strong><br>
                <a href="#" onclick="downloadImportTemplate(); return false;" style="color: var(--primary-color); font-weight: 600; text-decoration: underline; display: inline-block; margin-top: 4px;">📥 Download Excel Template</a>
            </div>
        `;
        importUploadArea.style.display = 'block';
        importPreviewArea.style.display = 'none';
        pendingImportPayload = [];
        pendingDuplicateRecords = [];
        const modalContent = document.querySelector('#import-modal .modal-content-sm');
        if(modalContent) modalContent.style.maxWidth = '500px';
    }

    if (document.getElementById('btn-open-import')) {
        document.getElementById('btn-open-import').addEventListener('click', () => {
            resetImportModal();
            importModal.style.display = 'flex';
        });
    }

    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            if(ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
                importStatus.innerHTML = "<span class='text-red'>Only CSV and Excel files (.xlsx, .xls) are supported.</span>";
                return;
            }

            importStatus.innerHTML = `<span style="color:var(--primary-color);">Reading ${file.name}...</span>`;

            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                const rawData = XLSX.utils.sheet_to_json(worksheet);
                const rawGrid = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if(rawData.length === 0) throw new Error("File is empty or headers are not on the first row.");

                pendingImportPayload = [];
                pendingDuplicateRecords = [];
                let seenIdsInFile = new Set();
                const existingIdsInDb = new Set(allStudents.map(s => s.id_number.toLowerCase()));
                
                const findColumn = (row, possibleNames) => {
                    const rowKeys = Object.keys(row);
                    for (let key of rowKeys) {
                        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (possibleNames.includes(cleanKey)) return row[key];
                    }
                    for (let key of rowKeys) {
                        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                        for (let p of possibleNames) {
                            if (p.length >= 4 && cleanKey.includes(p)) return row[key];
                        }
                    }
                    return null;
                };

                rawData.forEach(row => {
                    const sid = findColumn(row, ['studentid', 'idnumber', 'studentno', 'sn', 'studid', 'id', 'idno']);
                    const fname = findColumn(row, ['firstname', 'first', 'fname', 'givenname']);
                    const lname = findColumn(row, ['lastname', 'surname', 'last', 'lname', 'lastnamesurname']);
                    const mname = findColumn(row, ['middlename', 'middle', 'mname']) || '';
                    const yLevel = findColumn(row, ['yearlevel', 'year', 'level', 'ylevel']) || '1st year';
                    const gender = findColumn(row, ['gender', 'sex']) || 'Not Specified';
                    const program = findColumn(row, ['program', 'course', 'degree']) || 'N/A';
                    
                    if(sid && fname && lname) {
                        const cleanSid = sid.toString().trim();
                        const sidLower = cleanSid.toLowerCase();

                        if (existingIdsInDb.has(sidLower) || seenIdsInFile.has(sidLower)) {
                            pendingDuplicateRecords.push(`${fname.toString().trim()} ${lname.toString().trim()} (${cleanSid})`);
                        } else {
                            seenIdsInFile.add(sidLower);
                            pendingImportPayload.push({
                                school_id: currentAdminSchoolId,
                                id_number: cleanSid,
                                first_name: fname.toString().trim(),
                                last_name: lname.toString().trim(),
                                middle_name: mname.toString().trim(),
                                program: program.toString().trim(),
                                year_level: yLevel.toString().trim(),
                                gender: gender.toString().trim(),
                                status: 'Enrolled' // Default to Enrolled upon import
                            });
                        }
                    }
                });

                if(pendingImportPayload.length === 0 && pendingDuplicateRecords.length === 0) {
                    const detectedHeaders = Object.keys(rawData[0]).join(', ');
                    throw new Error(`Could not find valid data.<br><br><b>Detected Columns:</b> [${detectedHeaders}]<br><br>Please ensure your sheet has 'Student ID', 'First Name', and 'Last Name/Surname' on Row 1.`);
                }

                if(pendingImportPayload.length === 0 && pendingDuplicateRecords.length > 0) {
                    throw new Error(`No new students to add. All ${pendingDuplicateRecords.length} students in the file are already in the system.`);
                }

                const modalContent = document.querySelector('#import-modal .modal-content-sm');
                if(modalContent) modalContent.style.maxWidth = '1400px';

                importUploadArea.style.display = 'none';
                importPreviewArea.style.display = 'block';
                importStatus.innerHTML = '';
                btnConfirmImport.disabled = false;
                btnConfirmImport.innerText = "Confirm & Import";

                // --- 1. POPULATE RAW GRID (LEFT) ---
                rawThead.innerHTML = '';
                rawTbody.innerHTML = '';
                if(rawGrid.length > 0) {
                    const headers = rawGrid[0];
                    let theadHtml = '<tr>';
                    headers.forEach(h => {
                        theadHtml += `<th style="padding: 10px; font-weight: 600; color: #475569;">${h || ''}</th>`;
                    });
                    theadHtml += '</tr>';
                    rawThead.innerHTML = theadHtml;

                    const maxRows = Math.min(rawGrid.length, 51);
                    for(let i = 1; i < maxRows; i++) {
                        let trHtml = '<tr style="border-bottom: 1px solid #e2e8f0;">';
                        for(let j = 0; j < headers.length; j++) {
                            const cellValue = rawGrid[i][j] !== undefined ? rawGrid[i][j] : '';
                            trHtml += `<td style="padding: 8px;">${cellValue}</td>`;
                        }
                        trHtml += '</tr>';
                        rawTbody.innerHTML += trHtml;
                    }
                    if(rawGrid.length > 51) {
                        rawTbody.innerHTML += `<tr><td colspan="${headers.length}" style="padding: 10px; text-align: center; color: #64748b; font-style: italic;">...and ${rawGrid.length - 51} more rows</td></tr>`;
                    }
                }

                // --- 2. POPULATE PROCESSED GRID (RIGHT) ---
                previewCount.innerText = `${pendingImportPayload.length} Valid Student(s) to import`;
                previewTbody.innerHTML = '';
                
                const displayRows = pendingImportPayload.slice(0, 50);
                displayRows.forEach(p => {
                    previewTbody.innerHTML += `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px;">${p.id_number}</td>
                            <td style="padding: 8px;">${p.first_name}</td>
                            <td style="padding: 8px;">${p.middle_name}</td>
                            <td style="padding: 8px;">${p.last_name}</td>
                            <td style="padding: 8px;">${p.program}</td>
                            <td style="padding: 8px;">${p.year_level}</td>
                            <td style="padding: 8px;">${p.gender}</td>
                        </tr>
                    `;
                });
                if(pendingImportPayload.length > 50) {
                    previewTbody.innerHTML += `<tr><td colspan="7" style="padding: 10px; text-align: center; color: #64748b; font-style: italic;">...and ${pendingImportPayload.length - 50} more students</td></tr>`;
                }

                if(pendingDuplicateRecords.length > 0) {
                    previewDuplicates.style.display = 'block';
                    previewDuplicates.innerHTML = `
                        <strong>⚠️ Skipping ${pendingDuplicateRecords.length} Duplicate(s):</strong><br>
                        <span style="font-size:11px; opacity:0.9;">These IDs already exist in the system and will be ignored.</span><br>
                        <div style="margin-top: 8px; font-size: 12px; max-height: 80px; overflow-y: auto;">
                            ${pendingDuplicateRecords.join('<br>')}
                        </div>
                    `;
                } else {
                    previewDuplicates.style.display = 'none';
                }

            } catch (err) {
                console.error("Import Parsing Error:", err);
                importStatus.innerHTML = `<div class="text-red" style="text-align:left; background:#fee2e2; padding:10px; border-radius:6px; border:1px solid #ef4444;">${err.message}</div>`;
                importInput.value = ''; 
            }
        });
    }

    if(btnCancelImport) btnCancelImport.addEventListener('click', () => resetImportModal());

    if(btnConfirmImport) {
        btnConfirmImport.addEventListener('click', async () => {
            if(pendingImportPayload.length === 0) return;

            // SWEET ALERT CONFIRMATION BEFORE IMPORT
            const confirmResult = await Swal.fire({
                title: 'Execute Import?',
                text: `You are about to import ${pendingImportPayload.length.toLocaleString()} new students. Proceed?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Yes, Import!'
            });

            if (!confirmResult.isConfirmed) return;

            btnConfirmImport.disabled = true;
            btnConfirmImport.innerText = "Importing...";

            // Chunk into batches of 1000 to support importing more than 1000 students
            const BATCH_SIZE = 1000;
            const totalRecords = pendingImportPayload.length;
            const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
            let insertedCount = 0;
            let lastError = null;

            try {
                for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                    const batch = pendingImportPayload.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
                    const batchNum = batchIndex + 1;

                    importStatus.innerHTML = `<span style="color:var(--primary-color);">Importing batch ${batchNum} of ${totalBatches} (${insertedCount.toLocaleString()} / ${totalRecords.toLocaleString()} students saved)...</span>`;

                    const { error } = await window.supabaseClient.from('enrolled_masterlist').insert(batch);
                    if (error) throw error;

                    insertedCount += batch.length;
                }

                // SWEET ALERT SUCCESS MESSAGE
                Swal.fire('Success!', `Successfully imported ${insertedCount.toLocaleString()} students!`, 'success');
                
                // Notify coordinators of successful import
                if (currentAdminSchoolId) {
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'IMPORT_COMPLETED',
                            subject: 'Bulk Import Finished',
                            message: `CSV Import completed successfully. ${insertedCount.toLocaleString()} records imported.`
                        })
                    }).catch(e => console.error("Notification failed:", e));
                }

                importModal.style.display = 'none';
                resetImportModal();
                fetchEnrolledStudents();

            } catch(err) {
                console.error("Database Insert Error:", err);
                importStatus.innerHTML = `<div class="text-red" style="text-align:left; background:#fee2e2; padding:10px; border-radius:6px; border:1px solid #ef4444;">Import failed at batch ${Math.ceil((insertedCount + 1) / BATCH_SIZE)}: ${err.message}<br><small>${insertedCount.toLocaleString()} of ${totalRecords.toLocaleString()} students were saved before the error.</small></div>`;
                
                // Notify coordinators of failed import
                if (currentAdminSchoolId) {
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'IMPORT_FAILED',
                            subject: 'Import Errors',
                            message: `CSV Import encountered validation errors: ${err.message}. ${insertedCount} of ${totalRecords} records imported before failure.`
                        })
                    }).catch(e => console.error("Notification failed:", e));
                }

                btnConfirmImport.disabled = false;
                btnConfirmImport.innerText = "Try Again";
            }
        });
    }

    // Boot
    populateDropdowns();
    initProfile();
})();
