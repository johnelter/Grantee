(async function () {

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
            const headerTitles = document.getElementById('header-titles-box');
            if (headerTitles) headerTitles.classList.remove('is-loading');
        } finally {
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }
    }

    // ==========================================
    // 3. FETCH & RENDER ENROLLED STUDENTS
    // ==========================================
    const tbody = document.getElementById('students-tbody');

    function renderSkeletonLoading() {
        if (document.getElementById('stat-total')) {
            document.getElementById('stat-total').innerHTML = '<div class="skeleton-stat-num"></div>';
        }
        if (document.getElementById('entries-info')) {
            document.getElementById('entries-info').innerHTML = '<div class="skeleton-line" style="width: 160px; height: 14px;"></div>';
        }
        if (tbody) {
            const rowTemplates = [
                { idW: '100px', nameW: '160px', progW: '220px' },
                { idW: '110px', nameW: '190px', progW: '250px' },
                { idW: '95px', nameW: '140px', progW: '210px' },
                { idW: '105px', nameW: '175px', progW: '230px' },
                { idW: '100px', nameW: '155px', progW: '200px' },
                { idW: '115px', nameW: '180px', progW: '240px' }
            ];
            tbody.innerHTML = rowTemplates.map(r => `
                <tr class="skeleton-row">
                    <td style="padding: 15px 18px; vertical-align: middle;"><div class="skeleton-box skeleton-cb"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-id" style="width: ${r.idW};"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-name" style="width: ${r.nameW};"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-program" style="width: ${r.progW};"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-year"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-line skeleton-w-gender"></div></td>
                    <td style="vertical-align: middle;"><div class="skeleton-pill"></div></td>
                    <td style="text-align: right; vertical-align: middle; padding-right: 20px;">
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
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red" style="padding:40px;">No school assigned to this admin.</td></tr>`;
            const headerTitles = document.getElementById('header-titles-box');
            if (headerTitles) headerTitles.classList.remove('is-loading');
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
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-red" style="padding:40px;">Failed to load students. ${err.message}</td></tr>`;
        } finally {
            const headerTitles = document.getElementById('header-titles-box');
            if (headerTitles) headerTitles.classList.remove('is-loading');
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
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

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
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
            const badgeClass = statusText === 'Unenrolled' ? 'badge-status-unenrolled' : 'badge-status-enrolled';
            const badgeIcon = statusText === 'Unenrolled' ? 'alert-circle' : 'check-circle-2';

            tr.innerHTML = `
                <td style="padding: 15px 18px; vertical-align: middle;">
                    <input type="checkbox" class="row-checkbox" data-id="${s.id}" ${selectedIds.has(s.id) ? 'checked' : ''}>
                </td>
                <td style="color:var(--text-heading); font-weight:700; vertical-align: middle;">${s.id_number}</td>
                <td style="vertical-align: middle; font-weight:600;">${fullName}</td>
                <td style="vertical-align: middle; color:var(--text-muted);">${s.program || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.year_level || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.gender || 'N/A'}</td>
                <td style="vertical-align: middle;">
                    <span class="${badgeClass}">
                        <i data-lucide="${badgeIcon}" style="width: 12px; height: 12px;"></i>
                        ${statusText}
                    </span>
                </td>
                <td style="text-align: right; vertical-align: middle; padding-right: 20px;">
                    <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
                        <button onclick="editStudent('${s.id}')" title="Edit Student" class="btn-table-action btn-table-edit">
                            <i data-lucide="pencil" style="width: 15px; height: 15px;"></i>
                        </button>
                        <button onclick="deleteStudent('${s.id}')" title="Delete Student" class="btn-table-action btn-table-delete">
                            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
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

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
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
                html: `You are about to <strong>permanently delete ${count.toLocaleString()} student${count !== 1 ? 's' : ''}</strong> from the masterlist.<br><br><span style="color:var(--text-muted);font-size:13px;">Tip: Edit their status to <b>"Unenrolled"</b> instead to retain records.</span>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#D94841',
                cancelButtonColor: '#6B7F4E',
                confirmButtonText: `Yes, Delete ${count.toLocaleString()}`,
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
    // 4. ADD / EDIT STUDENT MODAL LOGIC
    // ==========================================
    const studentModal = document.getElementById('student-modal');
    const studentForm = document.getElementById('student-form');
    const mnameInput = document.getElementById('stu-mname');
    if (mnameInput) mnameInput.placeholder = "Middle Name (Optional)";

    if (document.getElementById('btn-open-add')) {
        document.getElementById('btn-open-add').addEventListener('click', () => {
            if (studentForm) studentForm.reset();
            document.getElementById('student-db-id').value = '';
            document.getElementById('student-modal-title').innerHTML = `<i data-lucide="user-plus" style="width: 20px; height: 20px; color: var(--moss-green);"></i> Add New Student`;

            const statusGroup = document.getElementById('stu-status-group');
            const genderStatusGrid = document.getElementById('stu-gender-status-grid');
            if (statusGroup) statusGroup.style.display = 'none';
            if (genderStatusGrid) genderStatusGrid.style.gridTemplateColumns = '1fr';

            studentModal.style.display = 'flex';
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
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

        if (document.getElementById('student-modal-title')) {
            document.getElementById('student-modal-title').innerHTML = `<i data-lucide="edit" style="width: 20px; height: 20px; color: var(--moss-green);"></i> Edit Student Information`;
        }
        if (studentModal) studentModal.style.display = 'flex';
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    };

    if (studentForm) {
        studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const confirmResult = await Swal.fire({
                title: 'Save Student?',
                text: "Are you sure you want to save this student's information?",
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#1F3D2E',
                cancelButtonColor: '#6B7F4E',
                confirmButtonText: 'Yes, Save Information'
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
                        }).eq('id_number', payload.id_number).then(({ error: syncErr }) => {
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
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Student`;
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        });
    }

    window.deleteStudent = async (id) => {
        const result = await Swal.fire({
            title: 'Delete Student?',
            text: "Are you sure you want to permanently remove this student? (Note: To keep records, Edit their status to 'Unenrolled' instead.)",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#D94841',
            cancelButtonColor: '#6B7F4E',
            confirmButtonText: 'Yes, Delete!'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await window.supabaseClient.from('enrolled_masterlist').delete().eq('id', id);
                if (error) throw error;
                Swal.fire('Deleted!', 'The student has been deleted.', 'success');
                fetchEnrolledStudents();
            } catch (err) {
                Swal.fire('Error', 'Failed to delete record: ' + err.message, 'error');
            }
        }
    };

    // ==========================================
    // 5. IMPORT EXCEL / CSV (APPEND ONLY) WITH PREVIEW
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
        ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 45 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Enrolled_Students_Template.xlsx");
    };

    function resetImportModal() {
        if (importInput) importInput.value = '';
        importStatus.innerHTML = `
            <div style="margin-bottom: 15px; font-size: 13px; color: var(--text-muted); background: var(--card-bg-secondary); padding: 12px 16px; border-radius: 10px; border: 1px dashed var(--border-dark);">
                <strong>Need the standard column format?</strong><br>
                <a href="#" onclick="downloadImportTemplate(); return false;" style="color: var(--moss-green); font-weight: 700; text-decoration: underline; display: inline-flex; align-items: center; gap: 5px; margin-top: 6px;">
                    <i data-lucide="download" style="width: 14px; height: 14px;"></i> Download Excel Template (.xlsx)
                </a>
            </div>
        `;
        importUploadArea.style.display = 'block';
        importPreviewArea.style.display = 'none';
        pendingImportPayload = [];
        pendingDuplicateRecords = [];
        const modalContent = document.querySelector('#import-modal .modal-content-sm');
        if (modalContent) modalContent.style.maxWidth = '520px';

        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
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
            if (!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
                importStatus.innerHTML = "<span class='text-red'>Only CSV and Excel files (.xlsx, .xls) are supported.</span>";
                return;
            }

            importStatus.innerHTML = `<span style="color:var(--moss-green); font-weight: 600;">Reading ${file.name}...</span>`;

            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];

                const rawData = XLSX.utils.sheet_to_json(worksheet);
                const rawGrid = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (rawData.length === 0) throw new Error("File is empty or headers are not on the first row.");

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

                    if (sid && fname && lname) {
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

                if (pendingImportPayload.length === 0 && pendingDuplicateRecords.length === 0) {
                    const detectedHeaders = Object.keys(rawData[0]).join(', ');
                    throw new Error(`Could not find valid data.<br><br><b>Detected Columns:</b> [${detectedHeaders}]<br><br>Please ensure your sheet has 'Student ID', 'First Name', and 'Last Name/Surname' on Row 1.`);
                }

                if (pendingImportPayload.length === 0 && pendingDuplicateRecords.length > 0) {
                    throw new Error(`No new students to add. All ${pendingDuplicateRecords.length} students in the file are already in the system.`);
                }

                const modalContent = document.querySelector('#import-modal .modal-content-sm');
                if (modalContent) modalContent.style.maxWidth = '1400px';

                importUploadArea.style.display = 'none';
                importPreviewArea.style.display = 'block';
                importStatus.innerHTML = '';
                btnConfirmImport.disabled = false;
                btnConfirmImport.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px;"></i> Confirm & Import`;

                // --- 1. POPULATE RAW GRID (LEFT) ---
                rawThead.innerHTML = '';
                rawTbody.innerHTML = '';
                if (rawGrid.length > 0) {
                    const headers = rawGrid[0];
                    let theadHtml = '<tr>';
                    headers.forEach(h => {
                        theadHtml += `<th>${h || ''}</th>`;
                    });
                    theadHtml += '</tr>';
                    rawThead.innerHTML = theadHtml;

                    const maxRows = Math.min(rawGrid.length, 51);
                    for (let i = 1; i < maxRows; i++) {
                        let trHtml = '<tr>';
                        for (let j = 0; j < headers.length; j++) {
                            const cellValue = rawGrid[i][j] !== undefined ? rawGrid[i][j] : '';
                            trHtml += `<td>${cellValue}</td>`;
                        }
                        trHtml += '</tr>';
                        rawTbody.innerHTML += trHtml;
                    }
                    if (rawGrid.length > 51) {
                        rawTbody.innerHTML += `<tr><td colspan="${headers.length}" style="padding: 10px; text-align: center; color: var(--text-muted); font-style: italic;">...and ${rawGrid.length - 51} more rows</td></tr>`;
                    }
                }

                // --- 2. POPULATE PROCESSED GRID (RIGHT) ---
                previewCount.innerText = `${pendingImportPayload.length} Valid Student(s) to import`;
                previewTbody.innerHTML = '';

                const displayRows = pendingImportPayload.slice(0, 50);
                displayRows.forEach(p => {
                    previewTbody.innerHTML += `
                        <tr>
                            <td style="font-weight:600;">${p.id_number}</td>
                            <td>${p.first_name}</td>
                            <td>${p.middle_name}</td>
                            <td>${p.last_name}</td>
                            <td>${p.program}</td>
                            <td>${p.year_level}</td>
                            <td>${p.gender}</td>
                        </tr>
                    `;
                });
                if (pendingImportPayload.length > 50) {
                    previewTbody.innerHTML += `<tr><td colspan="7" style="padding: 10px; text-align: center; color: var(--text-muted); font-style: italic;">...and ${pendingImportPayload.length - 50} more students</td></tr>`;
                }

                if (pendingDuplicateRecords.length > 0) {
                    previewDuplicates.style.display = 'block';
                    previewDuplicates.innerHTML = `
                        <strong>⚠️ Skipping ${pendingDuplicateRecords.length} Duplicate(s):</strong><br>
                        <span style="font-size:12px; opacity:0.9;">These IDs already exist in the system and will be ignored.</span><br>
                        <div style="margin-top: 8px; font-size: 12px; max-height: 80px; overflow-y: auto;">
                            ${pendingDuplicateRecords.join('<br>')}
                        </div>
                    `;
                } else {
                    previewDuplicates.style.display = 'none';
                }

                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }

            } catch (err) {
                console.error("Import Parsing Error:", err);
                importStatus.innerHTML = `<div class="text-red" style="text-align:left; background:var(--danger-light); padding:12px; border-radius:10px; border:1px solid rgba(217, 72, 65, 0.3);">${err.message}</div>`;
                importInput.value = '';
            }
        });
    }

    if (btnCancelImport) btnCancelImport.addEventListener('click', () => resetImportModal());

    if (btnConfirmImport) {
        btnConfirmImport.addEventListener('click', async () => {
            if (pendingImportPayload.length === 0) return;

            // SWEET ALERT CONFIRMATION BEFORE IMPORT
            const confirmResult = await Swal.fire({
                title: 'Execute Import?',
                text: `You are about to import ${pendingImportPayload.length.toLocaleString()} new students. Proceed?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#1F3D2E',
                cancelButtonColor: '#6B7F4E',
                confirmButtonText: 'Yes, Import Now'
            });

            if (!confirmResult.isConfirmed) return;

            btnConfirmImport.disabled = true;
            btnConfirmImport.innerText = "Importing...";

            // Chunk into batches of 1000 to support importing large datasets
            const BATCH_SIZE = 1000;
            const totalRecords = pendingImportPayload.length;
            const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
            let insertedCount = 0;

            try {
                for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                    const batch = pendingImportPayload.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
                    const batchNum = batchIndex + 1;

                    importStatus.innerHTML = `<span style="color:var(--moss-green); font-weight:600;">Importing batch ${batchNum} of ${totalBatches} (${insertedCount.toLocaleString()} / ${totalRecords.toLocaleString()} students saved)...</span>`;

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

            } catch (err) {
                console.error("Database Insert Error:", err);
                importStatus.innerHTML = `<div class="text-red" style="text-align:left; background:var(--danger-light); padding:12px; border-radius:10px; border:1px solid rgba(217, 72, 65, 0.3);">Import failed at batch ${Math.ceil((insertedCount + 1) / BATCH_SIZE)}: ${err.message}<br><small>${insertedCount.toLocaleString()} of ${totalRecords.toLocaleString()} students were saved before the error.</small></div>`;

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
                btnConfirmImport.innerHTML = `<i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i> Try Again`;
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }
        });
    }

    // Boot
    populateDropdowns();
    initProfile();
})();
