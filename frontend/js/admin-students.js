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

        if (filterProgram) {
            filterProgram.innerHTML = '<option value="">All Programs</option>' + EXACT_PROGRAMS.map(p => `<option value="${p}">${p}</option>`).join('');
        }
        if (stuProgram) {
            stuProgram.innerHTML = '<option value="">Select Program</option>' + EXACT_PROGRAMS.map(p => `<option value="${p}">${p}</option>`).join('');
        }

        if (filterYear) {
            filterYear.innerHTML = '<option value="">All Years</option>' + EXACT_YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
        }
        if (stuYear) {
            stuYear.innerHTML = '<option value="">Select Year Level</option>' + EXACT_YEARS.map(y => `<option value="${y}">${y}</option>`).join('');
        }
    }


    // ==========================================
    // 2. HEADER PROFILE & DROPDOWN LOGIC
    // ==========================================
    async function initProfile() {
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

            // STATS UPDATE: Total & Added This Month
            if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = allStudents.length;
            
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            
            const newThisMonth = allStudents.filter(s => {
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
        if (document.getElementById('entries-info')) document.getElementById('entries-info').innerText = `Showing ${data.length} enrolled students`;

        if (!tbody) return;
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:40px;">No enrolled students found. Add one or import a list.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(s => {
            const tr = document.createElement('tr');
            
            const mName = s.middle_name ? ` ${s.middle_name.charAt(0)}.` : '';
            const fullName = `${s.last_name}, ${s.first_name}${mName}`;
            
            tr.innerHTML = `
                <td style="color:#0f172a; font-weight:600; vertical-align: middle;">${s.id_number}</td>
                <td style="vertical-align: middle;">${fullName}</td>
                <td style="vertical-align: middle;">${s.program || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.year_level || 'N/A'}</td>
                <td style="vertical-align: middle;">${s.gender || 'N/A'}</td>
                <td style="vertical-align: middle;"><span class="status-badge">Enrolled</span></td>
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
    // 4. ADD / EDIT STUDENT MODAL LOGIC
    // ==========================================
    const studentModal = document.getElementById('student-modal');
    const studentForm = document.getElementById('student-form');

    // Make middle name placeholder obvious
    const mnameInput = document.getElementById('stu-mname');
    if (mnameInput) {
        mnameInput.placeholder = "";
    }

    if (document.getElementById('btn-open-add')) {
        document.getElementById('btn-open-add').addEventListener('click', () => {
            if(studentForm) studentForm.reset();
            document.getElementById('student-db-id').value = '';
            document.getElementById('student-modal-title').innerText = "Add New Student";
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
        if (mnameInput) mnameInput.value = s.middle_name || ''; // Added Middle Name support
        
        document.getElementById('stu-program').value = s.program || '';
        document.getElementById('stu-year').value = s.year_level || ''; 
        if (document.getElementById('stu-gender')) document.getElementById('stu-gender').value = s.gender || ''; 
        
        document.getElementById('student-modal-title').innerText = "Edit Student";
        studentModal.style.display = 'flex';
    };

    if (studentForm) {
        studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-save-student');
            
            const id = document.getElementById('student-db-id').value;
            const inputIdNumber = document.getElementById('stu-id-number').value.trim();
            
            // CHECK FOR DUPLICATE ID (Double Entry Prevention)
            const isDuplicate = allStudents.some(s => s.id_number.toLowerCase() === inputIdNumber.toLowerCase() && s.id !== id);
            if (isDuplicate) {
                alert(`A student with the ID Number "${inputIdNumber}" is already in the enrolled list!`);
                return;
            }

            btn.disabled = true; btn.innerText = "Saving...";

            const genderVal = document.getElementById('stu-gender') ? document.getElementById('stu-gender').value : null;
            const middleNameVal = document.getElementById('stu-mname') ? document.getElementById('stu-mname').value.trim() : '';
            
            const payload = {
                school_id: currentAdminSchoolId,
                id_number: inputIdNumber,
                first_name: document.getElementById('stu-fname').value.trim(),
                last_name: document.getElementById('stu-lname').value.trim(),
                middle_name: middleNameVal, // Saving Middle Name
                program: document.getElementById('stu-program').value,
                year_level: document.getElementById('stu-year').value, 
                gender: genderVal 
            };

            try {
                if (id) {
                    const { error } = await window.supabaseClient.from('enrolled_masterlist').update(payload).eq('id', id);
                    if (error) throw error;

                    if (payload.id_number) {
                        window.supabaseClient.from('profiles').update({
                            first_name: payload.first_name,
                            last_name: payload.last_name,
                            middle_name: payload.middle_name, // Sync Middle Name
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
                studentModal.style.display = 'none';
                fetchEnrolledStudents();
            } catch (err) {
                console.error("Save Error:", err);
                alert("Failed to save student: " + err.message);
            } finally {
                btn.disabled = false; btn.innerText = "Save Student";
            }
        });
    }

    window.deleteStudent = async (id) => {
        if(confirm("Are you sure you want to remove this student from the enrolled masterlist?")) {
            try {
                const { error } = await window.supabaseClient.from('enrolled_masterlist').delete().eq('id', id);
                if(error) throw error;
                fetchEnrolledStudents();
            } catch(err) {
                alert("Error deleting record.");
            }
        }
    };


    // ==========================================
    // 5. IMPORT EXCEL / CSV BULK UPLOAD
    // ==========================================
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-file-input');
    const importStatus = document.getElementById('import-status');

    // Global function to download the template using SheetJS
    window.downloadImportTemplate = () => {
        const headers = [['Student ID', 'First Name', 'Middle Name', 'Last Name/Surname', 'Program', 'Year Level', 'Gender']];
        const sampleData = [['2024-0001', 'Juan', 'Dela Cruz', 'Santos', 'Bachelor of Science in Information Technology', '1st year', 'Male']];
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]);
        
        // Auto-size columns slightly for better visibility
        ws['!cols'] = [{wch: 15}, {wch: 20}, {wch: 15}, {wch: 25}, {wch: 45}, {wch: 15}, {wch: 12}];

        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Enrolled_Students_Template.xlsx");
    };

    if (document.getElementById('btn-open-import')) {
        document.getElementById('btn-open-import').addEventListener('click', () => {
            if(importInput) importInput.value = '';
            
            // Add the template download link directly into the modal status area
            importStatus.innerHTML = `
                <div style="margin-bottom: 15px; font-size: 13px; color: #475569; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
                    <strong>Need the correct format?</strong><br>
                    <a href="#" onclick="downloadImportTemplate(); return false;" style="color: var(--primary-color); font-weight: 600; text-decoration: underline; display: inline-block; margin-top: 4px;">📥 Download Excel Template</a>
                </div>
            `;
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

            importStatus.innerHTML = `<span style="color:var(--primary-color);">Processing ${file.name}...</span>`;

            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawData = XLSX.utils.sheet_to_json(worksheet);

                if(rawData.length === 0) throw new Error("File is empty or headers are not on the first row.");

                let uploadPayload = [];
                let duplicateRecords = [];
                let seenIdsInFile = new Set();
                const existingIdsInDb = new Set(allStudents.map(s => s.id_number.toLowerCase()));
                
                // SUPER SMART MATCHER: 2-Pass Safe Search
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
                            duplicateRecords.push(`${fname.toString().trim()} ${lname.toString().trim()} (${cleanSid})`);
                        } else {
                            seenIdsInFile.add(sidLower);
                            uploadPayload.push({
                                school_id: currentAdminSchoolId,
                                id_number: cleanSid,
                                first_name: fname.toString().trim(),
                                last_name: lname.toString().trim(),
                                middle_name: mname.toString().trim(),
                                program: program.toString().trim(),
                                year_level: yLevel.toString().trim(),
                                gender: gender.toString().trim()
                            });
                        }
                    }
                });

                if(uploadPayload.length === 0 && duplicateRecords.length === 0) {
                    const detectedHeaders = Object.keys(rawData[0]).join(', ');
                    throw new Error(`Could not find valid data.<br><br><b>Detected Columns:</b> [${detectedHeaders}]<br><br>Please ensure your sheet has 'Student ID', 'First Name', and 'Last Name/Surname' on Row 1.`);
                }

                if(uploadPayload.length === 0 && duplicateRecords.length > 0) {
                    throw new Error("No new students were added. All valid students in the file are already in the system.");
                }

                importStatus.innerHTML = `<span style="color:var(--primary-color);">Saving ${uploadPayload.length} new students to database...</span>`;

                const { error } = await window.supabaseClient.from('enrolled_masterlist').insert(uploadPayload);
                if(error) throw error;

                let finalStatusHtml = `<span style="color:#10b981; font-weight:600;">✅ Successfully imported ${uploadPayload.length} new students!</span>`;
                
                if (duplicateRecords.length > 0) {
                    finalStatusHtml += `
                        <div style="margin-top: 15px; padding: 12px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 6px; color: #991b1b; text-align: left; font-size: 13px; max-height: 140px; overflow-y: auto;">
                            <strong>⚠️ Skipped ${duplicateRecords.length} Duplicate(s):</strong><br>
                            <span style="font-size:12px; opacity:0.9;">These students are already in the enrollment list.</span><br><br>
                            ${duplicateRecords.join('<br>')}
                        </div>
                    `;
                }

                importStatus.innerHTML = finalStatusHtml;
                fetchEnrolledStudents();

                if (duplicateRecords.length === 0) {
                    setTimeout(() => {
                        importModal.style.display = 'none';
                    }, 2000);
                }

            } catch (err) {
                console.error("Import Error:", err);
                importStatus.innerHTML = `<div class="text-red" style="text-align:left; background:#fee2e2; padding:10px; border-radius:6px; border:1px solid #ef4444;">${err.message}</div>`;
            }
        });
    }

    // Boot
    populateDropdowns();
    initProfile();
});