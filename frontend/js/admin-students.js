document.addEventListener('DOMContentLoaded', async () => {
    
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
    // 2. HEADER PROFILE & LOGOUT
    // ==========================================
    async function initProfile() {
        try {
            const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', adminId).single();
            if (profile) {
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;

                const name = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                document.getElementById('header-name').innerText = name;
                if (profile.avatar_url) document.getElementById('header-avatar').src = profile.avatar_url;

                fetchEnrolledStudents();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }

    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');
    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('show'); });
        document.addEventListener('click', (e) => { if (!profileToggle.contains(e.target)) profileMenu.classList.remove('show'); });
    }

    document.getElementById('dropdown-logout-btn').addEventListener('click', (e) => {
        e.preventDefault(); document.getElementById('logout-modal').style.display = 'flex'; profileMenu.classList.remove('show');
    });
    if(document.getElementById('modal-cancel')) document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('logout-modal').style.display = 'none');
    if(document.getElementById('modal-confirm')) document.getElementById('modal-confirm').addEventListener('click', async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });

    // ==========================================
    // 3. FETCH & RENDER ENROLLED STUDENTS
    // ==========================================
    const tbody = document.getElementById('students-tbody');

    async function fetchEnrolledStudents() {
        if (!currentAdminSchoolId) {
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red" style="padding:40px;">No school assigned to this admin.</td></tr>`;
            return;
        }

        try {
            const { data: students, error } = await window.supabaseClient
                .from('enrolled_masterlist')
                .select('*')
                .eq('school_id', currentAdminSchoolId)
                .order('last_name', { ascending: true });

            if (error) throw error;
            
            const { data: profiles, error: profError } = await window.supabaseClient
                .from('profiles')
                .select('id_number, gender')
                .not('id_number', 'is', null);

            if (!profError && profiles && students) {
                students.forEach(s => {
                    const liveProfile = profiles.find(p => p.id_number === s.id_number);
                    if (liveProfile && liveProfile.gender) {
                        s.gender = liveProfile.gender; 
                    }
                });
            }

            allStudents = students || [];

            const activeStudents = allStudents.filter(s => s.status !== 'Unenrolled');
            if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = activeStudents.length;
            
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            
            const newThisMonth = activeStudents.filter(s => {
                if(!s.created_at) return false;
                const createdAt = new Date(s.created_at);
                return createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
            }).length;
            
            if (document.getElementById('stat-new')) document.getElementById('stat-new').innerText = newThisMonth;

            applyFilters();
        } catch (err) {
            console.error("Error fetching students:", err);
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red" style="padding:40px;">Failed to load students. ${err.message}</td></tr>`;
        }
    }

    function renderTable(data) {
        if (document.getElementById('entries-info')) document.getElementById('entries-info').innerText = `Showing ${data.length} students`;

        if (!tbody) return;
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:40px;">No students found matching your criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(s => {
            const tr = document.createElement('tr');
            const mName = s.middle_name ? ` ${s.middle_name.charAt(0)}.` : '';
            const fullName = `${s.last_name}, ${s.first_name}${mName}`;
            
            const statusText = s.status || 'Enrolled';
            const badgeBg = statusText === 'Unenrolled' ? '#fee2e2' : '#dcfce7';
            const badgeColor = statusText === 'Unenrolled' ? '#ef4444' : '#166534';

            tr.innerHTML = `
                <td style="color:#0f172a; font-weight:600; vertical-align: middle;">${s.id_number}</td>
                <td style="vertical-align: middle;">${fullName}</td>
                <td style="vertical-align: middle;">${s.program || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.year_level || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.gender || 'N/A'}</td>
                <td style="vertical-align: middle;"><span style="background:${badgeBg}; color:${badgeColor}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">${statusText}</span></td>
                <td style="text-align: right; vertical-align: middle;">
                    <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                        <button onclick="editStudent('${s.id}')" style="padding: 6px 16px; border: 1px solid #3b82f6; background: #dbeafe; color: #3b82f6; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s;">Edit</button>
                        <button onclick="deleteStudent('${s.id}')" style="padding: 6px 16px; border: 1px solid #ef4444; background: #fee2e2; color: #ef4444; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: 0.2s;">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
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
            if(studentForm) studentForm.reset();
            document.getElementById('student-db-id').value = '';
            document.getElementById('student-modal-title').innerText = "Add New Student";
            if(document.getElementById('stu-status')) document.getElementById('stu-status').value = 'Enrolled';
            studentModal.style.display = 'flex';
        });
    }

    window.editStudent = (id) => {
        const s = allStudents.find(x => x.id === id);
        if(!s) return;
        
        document.getElementById('student-db-id').value = s.id;
        document.getElementById('stu-id-number').value = s.id_number || '';
        document.getElementById('stu-fname').value = s.first_name || '';
        document.getElementById('stu-lname').value = s.last_name || '';
        if (mnameInput) mnameInput.value = s.middle_name || ''; 
        
        document.getElementById('stu-program').value = s.program || '';
        document.getElementById('stu-year').value = s.year_level || ''; 
        if (document.getElementById('stu-gender')) document.getElementById('stu-gender').value = s.gender || ''; 
        if (document.getElementById('stu-status')) document.getElementById('stu-status').value = s.status || 'Enrolled';
        
        document.getElementById('student-modal-title').innerText = "Edit Student";
        studentModal.style.display = 'flex';
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
            
            const isDuplicate = allStudents.some(s => s.id_number.toLowerCase() === inputIdNumber.toLowerCase() && s.id !== id);
            if (isDuplicate) {
                Swal.fire('Duplicate Entry', `A student with the ID Number "${inputIdNumber}" is already in the masterlist!`, 'error');
                return;
            }

            btn.disabled = true; btn.innerText = "Saving...";

            const genderVal = document.getElementById('stu-gender') ? document.getElementById('stu-gender').value : null;
            const middleNameVal = document.getElementById('stu-mname') ? document.getElementById('stu-mname').value.trim() : '';
            const statusVal = document.getElementById('stu-status') ? document.getElementById('stu-status').value : 'Enrolled';
            
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
                text: `You are about to import ${pendingImportPayload.length} new students. Proceed?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: 'Yes, Import!'
            });

            if (!confirmResult.isConfirmed) return;

            btnConfirmImport.disabled = true;
            btnConfirmImport.innerText = "Importing...";
            importStatus.innerHTML = `<span style="color:var(--primary-color);">Saving ${pendingImportPayload.length} students to database...</span>`;

            try {
                const { error } = await window.supabaseClient.from('enrolled_masterlist').insert(pendingImportPayload);
                if(error) throw error;

                // SWEET ALERT SUCCESS MESSAGE
                Swal.fire('Success!', `Successfully imported ${pendingImportPayload.length} students!`, 'success');
                
                importModal.style.display = 'none';
                resetImportModal();
                fetchEnrolledStudents();

            } catch(err) {
                console.error("Database Insert Error:", err);
                importStatus.innerHTML = `<div class="text-red" style="text-align:left; background:#fee2e2; padding:10px; border-radius:6px; border:1px solid #ef4444;">Import failed: ${err.message}</div>`;
                btnConfirmImport.disabled = false;
                btnConfirmImport.innerText = "Try Again";
            }
        });
    }

    // ==========================================
    // 7. MOBILE HAMBURGER MENU TOGGLE
    // ==========================================
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuToggle && sidebar && sidebarOverlay) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        });

        // Close sidebar when clicking outside
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Boot
    populateDropdowns();
    initProfile();
});