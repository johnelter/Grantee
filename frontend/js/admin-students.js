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

                // Load the students only after getting the school ID
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

    // Logout logic
    document.getElementById('dropdown-logout-btn').addEventListener('click', (e) => {
        e.preventDefault(); document.getElementById('logout-modal').style.display = 'flex'; profileMenu.classList.remove('show');
    });
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('logout-modal').style.display = 'none');
    document.getElementById('modal-confirm').addEventListener('click', async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });

    // ==========================================
    // 3. FETCH & RENDER ENROLLED STUDENTS
    // ==========================================
    const tbody = document.getElementById('students-tbody');

    async function fetchEnrolledStudents() {
        if (!currentAdminSchoolId) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red" style="padding:40px;">No school assigned to this admin.</td></tr>`;
            return;
        }

        try {
            const { data: students, error } = await window.supabaseClient
                .from('enrolled_masterlist')
                .select('*')
                .eq('school_id', currentAdminSchoolId)
                .order('last_name', { ascending: true });

            if (error) throw error;
            
            allStudents = students || [];

            // Stats update
            document.getElementById('stat-total').innerText = allStudents.length;
            const newThisMonth = allStudents.filter(s => {
                if(!s.created_at) return false;
                return new Date(s.created_at).getMonth() === new Date().getMonth();
            }).length;
            document.getElementById('stat-new').innerText = newThisMonth;

            applyFilters();
        } catch (err) {
            console.error("Error fetching students:", err);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-red" style="padding:40px;">Failed to load students. ${err.message}</td></tr>`;
        }
    }

    function renderTable(data) {
        document.getElementById('entries-info').innerText = `Showing ${data.length} enrolled students`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:40px;">No enrolled students found. Add one or import a list.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(s => {
            const tr = document.createElement('tr');
            
            // Handle optional middle name safely
            const mName = s.middle_name ? ` ${s.middle_name.charAt(0)}.` : '';
            const fullName = `${s.last_name}, ${s.first_name}${mName}`;
            
            tr.innerHTML = `
                <td style="color:#0f172a; font-weight:600;">${s.id_number}</td>
                <td>${fullName}</td>
                <td>${s.program || 'N/A'}</td>
                <td>${s.year_level || 'N/A'}</td>
                <td>${s.gender || 'N/A'}</td>
                <td><span class="status-badge">Enrolled</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon" title="Edit" onclick="editStudent('${s.id}')">✏️</button>
                    <button class="btn-icon" title="Delete" style="color:var(--danger-color);" onclick="deleteStudent('${s.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function applyFilters() {
        const term = document.getElementById('search-input').value.toLowerCase();
        const prog = document.getElementById('filter-program').value;
        const year = document.getElementById('filter-year').value;

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

    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('filter-program').addEventListener('change', applyFilters);
    document.getElementById('filter-year').addEventListener('change', applyFilters);


    // ==========================================
    // 4. ADD / EDIT STUDENT MODAL LOGIC
    // ==========================================
    const studentModal = document.getElementById('student-modal');
    const studentForm = document.getElementById('student-form');

    document.getElementById('btn-open-add').addEventListener('click', () => {
        studentForm.reset();
        document.getElementById('student-db-id').value = '';
        document.getElementById('student-modal-title').innerText = "Add New Student";
        studentModal.style.display = 'flex';
    });

    window.editStudent = (id) => {
        const s = allStudents.find(x => x.id === id);
        if(!s) return;
        
        document.getElementById('student-db-id').value = s.id;
        document.getElementById('stu-id-number').value = s.id_number;
        document.getElementById('stu-fname').value = s.first_name;
        document.getElementById('stu-lname').value = s.last_name;
        document.getElementById('stu-program').value = s.program;
        document.getElementById('stu-year').value = s.year_level; // Load Year Level
        if (document.getElementById('stu-gender')) document.getElementById('stu-gender').value = s.gender || ''; // Load Gender
        
        document.getElementById('student-modal-title').innerText = "Edit Student";
        studentModal.style.display = 'flex';
    };

    studentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-student');
        btn.disabled = true; btn.innerText = "Saving...";

        const id = document.getElementById('student-db-id').value;
        const genderVal = document.getElementById('stu-gender') ? document.getElementById('stu-gender').value : null;
        
        const payload = {
            school_id: currentAdminSchoolId,
            id_number: document.getElementById('stu-id-number').value.trim(),
            first_name: document.getElementById('stu-fname').value.trim(),
            last_name: document.getElementById('stu-lname').value.trim(),
            program: document.getElementById('stu-program').value,
            year_level: document.getElementById('stu-year').value, // Save Year Level
            gender: genderVal // Save Gender
        };

        try {
            if (id) {
                const { error } = await window.supabaseClient.from('enrolled_masterlist').update(payload).eq('id', id);
                if (error) throw error;
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

    document.getElementById('btn-open-import').addEventListener('click', () => {
        importInput.value = '';
        importStatus.innerHTML = '';
        importModal.style.display = 'flex';
    });

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        
        // Strict format restriction
        if(ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
            importStatus.innerHTML = "<span class='text-red'>Only CSV and Excel files (.xlsx, .xls) are supported.</span>";
            return;
        }

        importStatus.innerHTML = `<span style="color:var(--primary-color);">Processing ${file.name}...</span>`;

        try {
            const buffer = await file.arrayBuffer();
            // The SheetJS library handles both XLSX and CSV transparently using read()
            const workbook = XLSX.read(buffer);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if(jsonData.length === 0) throw new Error("File is empty.");

            let uploadPayload = [];
            
            // Map rows based on expected headers
            jsonData.forEach(row => {
                const sid = row['Student ID'] || row['ID'] || row['ID Number'];
                const fname = row['First Name'] || row['Firstname'];
                const lname = row['Last Name'] || row['Lastname'];
                const mname = row['Middle Name'] || row['Middlename'] || '';
                const yLevel = row['Year Level'] || row['Year'] || '1st Year';
                const gender = row['Gender'] || row['Sex'] || 'Not Specified';
                
                if(sid && fname && lname) {
                    uploadPayload.push({
                        school_id: currentAdminSchoolId,
                        id_number: sid.toString().trim(),
                        first_name: fname.toString().trim(),
                        last_name: lname.toString().trim(),
                        middle_name: mname.toString().trim(),
                        program: (row['Program'] || row['Course'] || 'N/A').toString().trim(),
                        year_level: yLevel.toString().trim(),
                        gender: gender.toString().trim()
                    });
                }
            });

            if(uploadPayload.length === 0) throw new Error("Could not find valid columns. Ensure your sheet has 'Student ID', 'First Name', and 'Last Name' headers.");

            importStatus.innerHTML = `<span style="color:var(--primary-color);">Saving ${uploadPayload.length} students to database...</span>`;

            // Bulk Insert
            const { error } = await window.supabaseClient.from('enrolled_masterlist').insert(uploadPayload);
            if(error) throw error;

            importStatus.innerHTML = `<span style="color:var(--primary-color);">✅ Successfully imported ${uploadPayload.length} students!</span>`;
            setTimeout(() => {
                importModal.style.display = 'none';
                fetchEnrolledStudents();
            }, 1500);

        } catch (err) {
            console.error("Import Error:", err);
            importStatus.innerHTML = `<span class="text-red">Import failed: ${err.message}</span>`;
        }
    });

    // Boot
    initProfile();
});