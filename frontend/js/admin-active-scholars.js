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
    let activeScholars = [];
    let schoolScholarships = [];

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

                // Load Data
                fetchScholarshipList();
                fetchActiveScholars();
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
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('logout-modal').style.display = 'none');
    document.getElementById('modal-confirm').addEventListener('click', async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });

    // ==========================================
    // 3. FETCH SCHOLARSHIPS (For Filters & Import)
    // ==========================================
    async function fetchScholarshipList() {
        try {
            const { data } = await window.supabaseClient
                .from('scholarships')
                .select('id, title, category')
                .eq('school_id', currentAdminSchoolId)
                .neq('status', 'Draft');

            if (data) {
                schoolScholarships = data;
                const filterSelect = document.getElementById('filter-scholarship');
                const importSelect = document.getElementById('import-scholarship-select');
                
                data.forEach(sch => {
                    // Populate Filter
                    const opt1 = document.createElement('option');
                    opt1.value = sch.id;
                    opt1.text = sch.title;
                    filterSelect.appendChild(opt1);

                    // Populate Import Modal
                    const opt2 = document.createElement('option');
                    opt2.value = sch.id;
                    opt2.text = `${sch.title} (${sch.category})`;
                    importSelect.appendChild(opt2);
                });
            }
        } catch (err) { console.error(err); }
    }

    // ==========================================
    // 4. FETCH & RENDER ACTIVE SCHOLARS
    // ==========================================
    const tbody = document.getElementById('scholars-tbody');

    async function fetchActiveScholars() {
        try {
            // STEP 1: Get all scholarship IDs for this admin's school
            const { data: schData, error: schError } = await window.supabaseClient
                .from('scholarships')
                .select('id')
                .eq('school_id', currentAdminSchoolId);

            if (schError) throw schError;

            // If the school has no scholarships, they can't have active scholars
            if (!schData || schData.length === 0) {
                activeScholars = [];
                document.getElementById('stat-total').innerText = 0;
                applyFilters();
                return;
            }

            const schIds = schData.map(s => s.id);

            // STEP 2: Get all 'Passed' applications strictly for those scholarship IDs
            const { data: scholars, error: appError } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, last_name, middle_name, id_number, email ), scholarships (id, title, category, school_id)')
                .eq('status', 'Passed')
                .in('scholarship_id', schIds)
                .order('created_at', { ascending: false });

            if (appError) throw appError;
            
            activeScholars = scholars || [];
            document.getElementById('stat-total').innerText = activeScholars.length;

            applyFilters();
        } catch (err) {
            console.error("Error fetching active scholars:", err);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-red" style="padding:40px;">Failed to load data. Please check the console.</td></tr>`;
        }
    }

    function getCategoryBadge(category) {
        if (!category) return '';
        const catLower = category.toLowerCase();
        let bg = 'rgba(16, 185, 129, 0.1)', color = 'var(--success-color)'; 
        if (catLower.includes('need')) { bg = 'rgba(59, 130, 246, 0.1)'; color = '#3b82f6'; }
        if (catLower.includes('talent')) { bg = 'rgba(139, 92, 246, 0.1)'; color = '#8b5cf6'; }
        return `<span style="background:${bg}; color:${color}; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">${category}</span>`;
    }

    function renderTable(data) {
        document.getElementById('entries-info').innerText = `Showing ${data.length} active scholars`;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:40px;">No active scholars found matching criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(app => {
            const tr = document.createElement('tr');
            
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name ? ` ${app.profiles.middle_name.charAt(0)}.` : '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname}${mname}`;
            const studentId = app.profiles?.id_number || 'N/A';
            const schTitle = app.scholarships?.title || 'N/A';
            const catBadge = getCategoryBadge(app.scholarships?.category);
            const dateAwarded = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            tr.innerHTML = `
                <td style="color:#0f172a; font-weight:600;">${studentId}</td>
                <td>
                    <div style="font-weight: 500;">${fullName}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${app.profiles?.email || ''}</div>
                </td>
                <td style="font-weight: 500; color: var(--primary-color);">${schTitle}</td>
                <td>${catBadge}</td>
                <td style="color:#475569; font-size:13px;">${dateAwarded}</td>
                <td style="text-align: right;">
                    <button class="btn-icon" title="View Details" onclick="window.location.href='admin-applications.html'">👁️</button>
                    <button class="btn-icon" title="Revoke Scholarship" style="color:var(--danger-color);" onclick="revokeScholarship('${app.id}')">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.revokeScholarship = async (appId) => {
        if(confirm("Are you sure you want to revoke this scholarship? Their status will be changed to 'Rejected'.")) {
            try {
                const { error } = await window.supabaseClient.from('applications').update({ status: 'Rejected', remarks: 'Revoked by Admin' }).eq('id', appId);
                if(error) throw error;
                fetchActiveScholars(); // Reload
            } catch(err) {
                alert("Error revoking scholarship.");
            }
        }
    };

    function applyFilters() {
        const term = document.getElementById('search-input').value.toLowerCase();
        const schId = document.getElementById('filter-scholarship').value;

        const filtered = activeScholars.filter(app => {
            const matchSearch = (app.profiles?.id_number || '').toLowerCase().includes(term) || 
                                (app.profiles?.first_name || '').toLowerCase().includes(term) || 
                                (app.profiles?.last_name || '').toLowerCase().includes(term);
            const matchSch = schId === "" || app.scholarship_id === schId;
            return matchSearch && matchSch;
        });

        renderTable(filtered);
    }

    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('filter-scholarship').addEventListener('change', applyFilters);

    // ==========================================
    // 5. EXPORT ACTIVE SCHOLARS
    // ==========================================
    document.getElementById('btn-export').addEventListener('click', () => {
        if (activeScholars.length === 0) { alert("No data to export."); return; }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student ID,Last Name,First Name,Middle Name,Email,Scholarship Title,Category,Date Awarded\r\n";

        activeScholars.forEach(app => {
            const sid = app.profiles?.id_number || '';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const email = app.profiles?.email || '';
            const schTitle = app.scholarships?.title || '';
            const cat = app.scholarships?.category || '';
            const date = new Date(app.created_at).toLocaleDateString();

            csvContent += `"${sid}","${lname}","${fname}","${mname}","${email}","${schTitle}","${cat}","${date}"\r\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Active_Scholars_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // ==========================================
    // 6. IMPORT EXCEL / CSV BULK UPLOAD
    // ==========================================
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-file-input');
    const importStatus = document.getElementById('import-status');
    const importSelect = document.getElementById('import-scholarship-select');

    document.getElementById('btn-open-import').addEventListener('click', () => {
        importInput.value = '';
        importSelect.value = '';
        importStatus.innerHTML = '';
        importModal.style.display = 'flex';
    });

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const targetSchId = importSelect.value;

        if(!file) return;
        if(!targetSchId) {
            alert("Please select a Scholarship Program first.");
            importInput.value = '';
            return;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        if(ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
            importStatus.innerHTML = "<span class='text-red'>Only CSV and Excel files are supported.</span>";
            return;
        }

        importStatus.innerHTML = `<span style="color:var(--primary-color);">Processing ${file.name}...</span>`;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if(jsonData.length === 0) throw new Error("File is empty.");

            let studentIds = [];
            jsonData.forEach(row => {
                const sid = row['Student ID'] || row['ID'] || row['ID Number'];
                if(sid) studentIds.push(sid.toString().trim());
            });

            if(studentIds.length === 0) throw new Error("Could not find 'Student ID' column.");

            importStatus.innerHTML = `<span style="color:var(--primary-color);">Found ${studentIds.length} IDs. Verifying profiles...</span>`;

            // Look up Student UUIDs based on ID Numbers
            const { data: matchedProfiles, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('id, id_number')
                .in('id_number', studentIds);

            if (profileError) throw profileError;

            if (!matchedProfiles || matchedProfiles.length === 0) {
                throw new Error("None of the Student IDs in the file match registered student profiles.");
            }

            importStatus.innerHTML = `<span style="color:var(--primary-color);">Registering ${matchedProfiles.length} scholars...</span>`;

            // Prepare applications payload
            const uploadPayload = matchedProfiles.map(p => ({
                student_id: p.id,
                scholarship_id: targetSchId,
                status: 'Passed',
                remarks: 'Auto-Imported Active Scholar'
            }));

            // Bulk Insert
            const { error } = await window.supabaseClient.from('applications').insert(uploadPayload);
            if(error) throw error;

            importStatus.innerHTML = `<span style="color:var(--success-color);">✅ Successfully imported ${uploadPayload.length} Active Scholars!</span>`;
            
            if (matchedProfiles.length < studentIds.length) {
                importStatus.innerHTML += `<br><span style="font-size:11px; color:#ef4444;">Note: ${studentIds.length - matchedProfiles.length} IDs were skipped because they haven't created an account yet.</span>`;
            }

            setTimeout(() => {
                importModal.style.display = 'none';
                fetchActiveScholars();
            }, 3000);

        } catch (err) {
            console.error("Import Error:", err);
            importStatus.innerHTML = `<span class="text-red">Import failed: ${err.message}</span>`;
        }
    });

    // Boot
    initProfile();
});