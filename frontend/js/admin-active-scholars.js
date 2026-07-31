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
    let currentAdminSchool = null;
    let activeBeneficiaries = [];
    let currentFilteredBeneficiaries = [];
    let schoolScholarships = [];
    let masterlistMap = {}; 

    // Strictly Allowed Categories (Assistance Policies)
    const ALLOWED_CATEGORIES = [
        'Institution-Funded Educational Assistance',
        'Ched Educational Assistance',
        'Private Educational Assistance',
        'Government Educational Assistance'
    ];

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
                if (!['admin', 'coordinator'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;
                currentAdminSchool = profile.school;

                const name = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
                if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                await fetchMasterlistData();
                await fetchScholarshipList();
                await fetchActiveBeneficiaries();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }

    // ==========================================
    // 3. FETCH DATA (Masterlist & Programs)
    // ==========================================
    async function fetchMasterlistData() {
        try {
            const { data } = await window.supabaseClient
                .from('enrolled_masterlist')
                .select('id_number, program, year_level, first_name, last_name');

            if (data) {
                data.forEach(student => {
                    masterlistMap[student.id_number] = student;
                });
            }
        } catch (err) { console.error("Error fetching masterlist:", err); }
    }

    async function fetchScholarshipList() {
        try {
            const { data } = await window.supabaseClient
                .from('scholarships')
                .select('id, title, category, batch, semester, school_year, start_date, end_date')
                .eq('school_id', currentAdminSchoolId)
                .neq('status', 'Draft');

            if (data) {
                schoolScholarships = data;
                const filterSelect = document.getElementById('filter-scholarship');
                const manualSelect = document.getElementById('manual-scholarship-select');
                const uniqueBatches = new Set();
                const uniqueSems = new Set();
                const uniqueSYs = new Set();

                data.forEach(sch => {
                    if (filterSelect) filterSelect.add(new Option(sch.title, sch.id));
                    if (manualSelect) manualSelect.add(new Option(`${sch.title} (${sch.category || 'Institution-Funded Educational Assistance'})`, sch.id));

                    if (sch.batch) uniqueBatches.add(sch.batch);
                    if (sch.semester) uniqueSems.add(sch.semester);
                    if (sch.school_year) uniqueSYs.add(sch.school_year);
                });

                const batchFilter = document.getElementById('filter-batch');
                const semFilter = document.getElementById('filter-semester');
                const syFilter = document.getElementById('filter-school-year');

                if (batchFilter) uniqueBatches.forEach(b => batchFilter.add(new Option(b, b)));
                if (semFilter) uniqueSems.forEach(s => semFilter.add(new Option(s, s)));
                if (syFilter) uniqueSYs.forEach(s => syFilter.add(new Option(s, s)));
            }
        } catch (err) { console.error(err); }
    }

    // ==========================================
    // 4. FETCH & RENDER ACTIVE BENEFICIARIES
    // ==========================================
    const tbody = document.getElementById('beneficiaries-tbody') || document.getElementById('scholars-tbody');

    async function fetchActiveBeneficiaries() {
        try {
            const { data: schData, error: schError } = await window.supabaseClient
                .from('scholarships')
                .select('id')
                .eq('school_id', currentAdminSchoolId);

            if (schError) throw schError;
            const schIds = schData ? schData.map(s => s.id) : [];

            const { data: beneficiaries, error: appError } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, last_name, middle_name, id_number, email ), scholarships (id, title, category, school_id, batch, semester, school_year, start_date, end_date)')
                .in('status', ['Grantee', 'Passed', 'Approved'])
                .order('created_at', { ascending: false });

            if (appError) throw appError;

            activeBeneficiaries = (beneficiaries || []).filter(app => {
                return schIds.includes(app.scholarship_id) || app.scholarship_id === null;
            });

            if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = activeBeneficiaries.length;
            applyFilters();
        } catch (err) {
            console.error("Error fetching active beneficiaries:", err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444; padding:40px;">Failed to load data. Please check the console.</td></tr>`;
        }
    }

    function getCategoryBadge(category) {
        if (!category) return `<span style="background:#f1f5f9; color:#475569; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">Outside Assistance</span>`;
        const catLower = category.toLowerCase();
        let bg = 'rgba(16, 185, 129, 0.1)', color = 'var(--success-color)';
        if (catLower.includes('need')) { bg = 'rgba(59, 130, 246, 0.1)'; color = '#3b82f6'; }
        if (catLower.includes('talent')) { bg = 'rgba(139, 92, 246, 0.1)'; color = '#8b5cf6'; }
        return `<span style="background:${bg}; color:${color}; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:700;">${category}</span>`;
    }

    function formatDate(dateString) {
        if (!dateString) return 'Not Set';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function renderTable(data) {
        if (document.getElementById('entries-info')) document.getElementById('entries-info').innerText = `Showing ${data.length} active beneficiaries`;
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:40px;">No active beneficiaries found matching criteria.</td></tr>`;
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

            const masterInfo = masterlistMap[studentId] || {};
            const program = masterInfo.program || app.profiles?.program || 'N/A';
            const yearLevel = masterInfo.year_level || app.profiles?.year_level || 'N/A';

            const isOutside = !app.scholarship_id;
            const schTitle = isOutside ? (app.outside_assistance_name || 'Outside Assistance') : (app.scholarships?.title || 'Unknown Assistance');
            const categoryValue = app.category || app.scholarships?.category || 'Outside Assistance';
            const catBadge = getCategoryBadge(categoryValue);

            const batch = app.scholarships?.batch || app.outside_batch || '';
            const semester = app.scholarships?.semester || app.outside_semester || '';
            const schoolYear = app.scholarships?.school_year || app.outside_sy || '';
            const duration = app.duration || 'Not Set';
            const dateRewarded = formatDate(app.created_at);
            
            const termDetails = [];
            if (batch) termDetails.push(`<div><span style="color:var(--text-muted);">Batch:</span> ${batch}</div>`);
            if (semester) termDetails.push(`<div><span style="color:var(--text-muted);">Sem:</span> ${semester}</div>`);
            if (schoolYear) termDetails.push(`<div><span style="color:var(--text-muted);">SY:</span> ${schoolYear}</div>`);
            const detailsHtml = termDetails.length > 0 ? termDetails.join('') : '';

            tr.innerHTML = `
                <td>
                    <strong style="color:#0f172a;">${studentId}</strong>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${app.profiles?.email || ''}</div>
                </td>
                <td style="font-weight: 500;">${fullName}</td>
                <td>
                    <div style="color:#0f172a; font-weight:600; font-size:12px;">${program}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${yearLevel}</div>
                </td>
                <td>
                    <strong style="color:var(--primary-color); display:block; margin-bottom:4px;">${schTitle}</strong>
                    ${catBadge}
                </td>
                <td style="font-size:12px;">
                    ${detailsHtml}
                </td>
                <td style="font-size:13px; color:#475569; font-weight:500;">
                    ${dateRewarded}
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-weight:600; font-size:13px; color:#334155;">${duration}</span>
                        <button style="background:none; border:none; color:var(--primary-color); cursor:pointer; font-size:12px;" onclick="editDuration('${app.id}', '${duration}')" title="Edit Duration"><i class="fa-solid fa-pen-to-square"></i></button>
                    </div>
                </td>
                <td style="text-align: right;">
                    <button style="background:#fee2e2; color:#ef4444; border:1px solid #fecaca; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;" title="Revoke Assistance" onclick="revokeAssistance('${app.id}')"><i class="fa-solid fa-xmark"></i> Revoke</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.editDuration = async (appId, currentDuration) => {
        const { value: newDuration } = await Swal.fire({
            title: 'Set Assistance Duration',
            input: 'select',
            inputOptions: {
                '1 Semester': '1 Semester',
                '2 Semesters (1 Year)': '2 Semesters (1 Year)',
                '3 Semesters (1.5 Years)': '3 Semesters (1.5 Years)',
                '4 Semesters (2 Years)': '4 Semesters (2 Years)',
                '5 Semesters (2.5 Years)': '5 Semesters (2.5 Years)',
                '6 Semesters (3 Years)': '6 Semesters (3 Years)',
                '7 Semesters (3.5 Years)': '7 Semesters (3.5 Years)',
                '8 Semesters (4 Years)': '8 Semesters (4 Years)',
                'Until Graduation': 'Until Graduation'
            },
            inputPlaceholder: 'Select a standard duration',
            inputValue: currentDuration !== 'Not Set' ? currentDuration : '',
            showCancelButton: true,
            confirmButtonColor: '#10b981'
        });

        if (newDuration) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const { error } = await window.supabaseClient.from('applications').update({ duration: newDuration }).eq('id', appId);
                if (error) throw error;
                
                Swal.fire('Saved!', 'The duration has been successfully updated.', 'success');
                fetchActiveBeneficiaries();
            } catch (err) { 
                console.error("Database Error on Update Duration:", err);
                const errorText = err.message || 'Unknown Database Restriction';
                
                let policyWarning = (errorText.toLowerCase().includes('policy') || errorText.includes('row-level security')) 
                    ? "Warning: Your database Assistance Policies or Row-Level Security rules are actively blocking updates to this record." 
                    : "Database update rejected.";

                Swal.fire({
                    title: 'Failed to update duration',
                    html: `<div style="text-align:left; font-size:13px; background:#fef2f2; color:#991b1b; padding:10px; border-radius:6px; border:1px solid #fca5a5;">
                            <strong>Reason:</strong> ${errorText}<br>
                            <small style="color:#6b7280; display:block; margin-top:8px; font-weight:bold;">${policyWarning}</small>
                           </div>`,
                    icon: 'error'
                });
            }
        }
    };

    window.revokeAssistance = async (appId) => {
        const result = await Swal.fire({
            title: 'Revoke Assistance?',
            text: "Are you sure you want to revoke this beneficiary's educational assistance? They will immediately be removed from the active limits tracked by the institutional policies.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Revoke'
        });

        if (result.isConfirmed) {
            try {
                Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const { error } = await window.supabaseClient.from('applications').update({ 
                    status: 'Revoked', 
                    remarks: 'Assistance Revoked by Administrator' 
                }).eq('id', appId);
                if (error) throw error;
                
                // Notify coordinators of the status change
                const app = activeBeneficiaries.find(a => a.id === appId);
                if (app && currentAdminSchoolId) {
                    const studentName = app.profiles ? `${app.profiles.first_name || ''} ${app.profiles.last_name || ''}`.trim() : 'A student';
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'BENEFICIARY_UPDATE',
                            subject: 'Beneficiary Status Changed',
                            message: `Beneficiary status revoked for ${studentName}.`,
                            resourceId: appId
                        })
                    }).catch(e => console.error("Notification failed:", e));
                }

                await window.supabaseClient.from('audit_logs').insert([{
                    admin_id: adminId,
                    school_id: currentAdminSchoolId,
                    action: 'Revoked Assistance',
                    module: 'Active Beneficiaries',
                    details: JSON.stringify({ details: `Revoked active assistance for application ID: ${appId}` })
                }]);

                Swal.fire('Revoked', 'The assistance has been revoked and policy counts have been updated.', 'success');
                fetchActiveBeneficiaries();
            } catch (err) { Swal.fire('Error', 'Failed to revoke assistance.', 'error'); }
        }
    };

    function applyFilters() {
        const term = document.getElementById('search-input')?.value.toLowerCase() || '';
        const schId = document.getElementById('filter-scholarship')?.value || '';
        const batch = document.getElementById('filter-batch')?.value || '';
        const sem = document.getElementById('filter-semester')?.value || '';
        const sy = document.getElementById('filter-school-year')?.value || '';

        const filtered = activeBeneficiaries.filter(app => {
            const matchSearch = (app.profiles?.id_number || '').toLowerCase().includes(term) ||
                (app.profiles?.first_name || '').toLowerCase().includes(term) ||
                (app.profiles?.last_name || '').toLowerCase().includes(term) ||
                (app.outside_assistance_name || '').toLowerCase().includes(term);
            const matchSch = schId === "" || String(app.scholarship_id) === String(schId);
            const matchBatch = batch === "" || String(app.scholarships?.batch || app.outside_batch || '') === String(batch);
            const matchSem = sem === "" || String(app.scholarships?.semester || app.outside_semester || '') === String(sem);
            const matchSy = sy === "" || String(app.scholarships?.school_year || app.outside_sy || '') === String(sy);
            return matchSearch && matchSch && matchBatch && matchSem && matchSy;
        });

        currentFilteredBeneficiaries = filtered;
        renderTable(filtered);
    }

    if (document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if (document.getElementById('filter-scholarship')) document.getElementById('filter-scholarship').addEventListener('change', applyFilters);
    if (document.getElementById('filter-batch')) document.getElementById('filter-batch').addEventListener('change', applyFilters);
    if (document.getElementById('filter-semester')) document.getElementById('filter-semester').addEventListener('change', applyFilters);
    if (document.getElementById('filter-school-year')) document.getElementById('filter-school-year').addEventListener('change', applyFilters);


    // ==========================================
    // POLICY VALIDATION ENGINE
    // ==========================================
    function validateAgainstPolicies(newCategory, activeList, policyData, idNumber) {
        if (!policyData) return true; 

        // 1. GLOBAL LIMIT CHECK
        if (policyData.global_enabled && policyData.global_limit > 0) {
            if (activeList.length >= policyData.global_limit) {
                throw new Error(`PolicyLimitReached: Student [${idNumber}] reached global maximum limit of ${policyData.global_limit} active program(s).`);
            }
        }

        // 2. CATEGORY LIMIT CHECK
        if (policyData.category_limits && policyData.category_limits[newCategory]) {
            const catPolicy = policyData.category_limits[newCategory];
            if (!catPolicy.unlimited) {
                if (catPolicy.limit === 0) {
                     throw new Error(`CategoryLimitReached: Institution has completely disabled/blocked ${newCategory}.`);
                }
                const sameCatCount = activeList.filter(app => app.category === newCategory).length;
                if (sameCatCount >= catPolicy.limit) {
                    throw new Error(`CategoryLimitReached: Student [${idNumber}] exceeded maximum limit of ${catPolicy.limit} for ${newCategory}.`);
                }
            }
        }

        // 3. COMBINATION MATRIX RULES CHECK
        if (policyData.combination_rules) {
            for (let existing of activeList) {
                if (existing.category !== newCategory) {
                    const comboKey = `${newCategory}::${existing.category}`;
                    if (policyData.combination_rules[comboKey] === false) {
                        throw new Error(`CombinationRuleViolation: Policy forbids combining [${newCategory}] with their existing [${existing.category}].`);
                    }
                }
            }
        }

        return true;
    }


    // ==========================================
    // 6. IMPORT EXCEL / CSV BULK UPLOAD WITH VALIDATION
    // ==========================================
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-file-input');
    const importStatus = document.getElementById('import-status');

    if (document.getElementById('btn-open-import')) {
        document.getElementById('btn-open-import').addEventListener('click', () => {
            if (importInput) importInput.value = '';
            if (importStatus) importStatus.innerHTML = '';
            if (importModal) importModal.style.display = 'flex';
        });
    }

    window.downloadTemplate = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student ID,Last Name,First Name,Middle Name,Educational Assistance Name,Educational Assistance Category,School Year (Optional),Semester (Optional),Batch (Optional),Duration (Optional)\r\n";
        csvContent += "20230001,Doe,John,Smith,Ched Scholarship,Ched Educational Assistance,2024-2025,1st Semester,Batch 1,1 Year\r\n";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Import_Beneficiaries_Template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    function suggestCategory(schName) {
        if (!schName) return '';
        const name = schName.toLowerCase();
        if (name.includes('sm foundation') || name.includes('private') || name.includes('ngo') || name.includes('foundation')) return 'Private Educational Assistance';
        if (name.includes('dost') || name.includes('government') || name.includes('lgu') || name.includes('mayor')) return 'Government Educational Assistance';
        if (name.includes('ched') || name.includes('unifast') || name.includes('tulong dunong') || name.includes('merit')) return 'Ched Educational Assistance';
        if (name.includes('university') || name.includes('academic') || name.includes('entrance') || name.includes('institutional') || name.includes('school')) return 'Institution-Funded Educational Assistance';
        return '';
    }

    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
                Swal.fire('Invalid File', 'Only CSV and Excel (.xlsx, .xls) files are supported.', 'error');
                importInput.value = '';
                return;
            }

            importStatus.innerHTML = `<span style="color:var(--primary-color);"><i class="fa-solid fa-spinner fa-spin"></i> Reading & Validating file: ${file.name}...</span>`;

            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) throw new Error("The uploaded file is empty.");

                let validRecords = [];
                let invalidRecords = [];
                let unenrolledSkipped = [];
                let crosscheckData = []; 

                jsonData.forEach((row, index) => {
                    const rowNum = index + 2; 
                    const sid = row['Student ID'] || row['ID'] || row['ID Number'];
                    const assistance = row['Educational Assistance Name'] || row['Educational Assistance'];
                    const providedCategory = (row['Educational Assistance Category'] || row['Category'] || '').toString().trim();

                    if (sid && assistance) {
                        const sidStr = sid.toString().trim();
                        const studentName = `${row['Last Name'] || ''}, ${row['First Name'] || ''}`.replace(/^,\s*/, '').trim() || 'Unknown';
                        
                        const record = {
                            rowNum,
                            id_number: sidStr,
                            student_name: studentName,
                            assistance_name: assistance.toString().trim(),
                            category_input: providedCategory,
                            sy: row['School Year (Optional)'] || null,
                            sem: row['Semester (Optional)'] || null,
                            batch: row['Batch (Optional)'] || null,
                            duration: row['Duration (Optional)'] || null
                        };

                        if (!masterlistMap[sidStr]) {
                            unenrolledSkipped.push(record);
                            crosscheckData.push({ ...record, renderStatus: 'unenrolled' });
                            return; 
                        }

                        const matchedCat = ALLOWED_CATEGORIES.find(cat => cat.toLowerCase() === providedCategory.toLowerCase());

                        if (matchedCat) {
                            record.category = matchedCat; 
                            validRecords.push(record);
                            crosscheckData.push({ ...record, renderStatus: 'valid' });
                        } else {
                            record.suggested = suggestCategory(record.assistance_name);
                            record.selected = ''; 
                            invalidRecords.push(record);
                            crosscheckData.push({ ...record, renderStatus: 'invalid', invalidIdx: invalidRecords.length - 1 });
                        }
                    }
                });

                if (crosscheckData.length === 0) {
                    throw new Error("No recognizable records found. Please ensure your headers match the template.");
                }

                // ALWAYS SHOW THE CROSSCHECKING VIEW
                let html = `
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-top:15px; text-align:left;">
                        <h4 style="margin-top:0; color:#0f172a; margin-bottom:10px;">Import Crosschecking View</h4>
                        <div style="display:flex; gap:15px; margin-bottom:15px;">
                            <div style="font-size:13px;"><strong>Ready to Import:</strong> <span style="color:#10b981;">${validRecords.length}</span></div>
                            <div style="font-size:13px;"><strong>Needs Review:</strong> <span style="color:#f59e0b;">${invalidRecords.length}</span></div>
                            <div style="font-size:13px;"><strong>Failed (Not Enrolled):</strong> <span style="color:#ef4444;">${unenrolledSkipped.length}</span></div>
                        </div>
                `;

                if (invalidRecords.length > 0) {
                    html += `
                        <div style="background:#fef3c7; color:#b45309; padding:10px; border-radius:6px; font-size:13px; margin-bottom:15px;">
                            <strong><i class="fa-solid fa-circle-exclamation"></i> Attention:</strong> Some records contain invalid educational assistance categories. Please map them to an accepted institutional category before importing.
                        </div>
                    `;
                }

                html += `
                        <div style="overflow-x:auto; margin-bottom:15px; max-height: 400px; border: 1px solid #e2e8f0; border-radius: 6px;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                                <thead style="background:#f8fafc; position: sticky; top: 0; z-index: 1; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                                    <tr>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Row</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Student ID</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Name</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Assistance Program</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Original CSV Category</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Final Assessed Category</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid #e2e8f0;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                crosscheckData.forEach((row) => {
                    let finalCatHtml = '';
                    let statusHtml = '';
                    
                    if (row.renderStatus === 'valid') {
                        finalCatHtml = `<span style="color:#334155; font-weight:500;">${row.category}</span>`;
                        statusHtml = `<span style="color:#10b981; font-weight:bold;"><i class="fa-solid fa-check"></i> Ready</span>`;
                    } 
                    else if (row.renderStatus === 'invalid') {
                        let options = `<option value="">-- Select Valid Category --</option>`;
                        ALLOWED_CATEGORIES.forEach(cat => { options += `<option value="${cat}">${cat}</option>`; });
                        
                        finalCatHtml = `
                            <div style="font-size:11px; color:#10b981; margin-bottom:4px;">Suggested: ${row.suggested || 'None'}</div>
                            <select class="category-correction-select" data-index="${row.invalidIdx}" style="width:100%; padding:4px; border-radius:4px; border:1px solid #ef4444;">
                                ${options}
                            </select>
                        `;
                        statusHtml = `<span id="status-row-${row.invalidIdx}" style="color:#f59e0b; font-weight:bold;">Needs Review</span>`;
                    }
                    else if (row.renderStatus === 'unenrolled') {
                        finalCatHtml = `<span style="color:#94a3b8; font-style:italic;">Cannot Assess</span>`;
                        statusHtml = `<span style="color:#ef4444; font-weight:bold;"><i class="fa-solid fa-xmark"></i> Failed</span>`;
                    }

                    html += `
                        <tr style="border-bottom:1px solid #f1f5f9; ${row.renderStatus === 'unenrolled' ? 'background:#fef2f2;' : ''}">
                            <td style="padding:8px;">${row.rowNum}</td>
                            <td style="padding:8px; font-weight:600;">${row.id_number}</td>
                            <td style="padding:8px; white-space:nowrap;">${row.student_name}</td>
                            <td style="padding:8px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${row.assistance_name}">${row.assistance_name}</td>
                            <td style="padding:8px; color:#64748b;">${row.category_input || '<i>Blank</i>'}</td>
                            <td style="padding:8px;">${finalCatHtml}</td>
                            <td style="padding:8px;">${statusHtml}</td>
                        </tr>
                    `;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;

                if (unenrolledSkipped.length > 0) {
                    html += `
                        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:12px; margin-bottom:15px;">
                            <h5 style="margin:0 0 8px 0; color:#991b1b; display:flex; align-items:center; gap:6px;">
                                <i class="fa-solid fa-triangle-exclamation"></i> Failed (Not Enrolled) Details
                            </h5>
                            <p style="margin:0 0 8px 0; font-size:12px; color:#b91c1c;">The following students were found in the CSV but do not exist in the official Enrolled Masterlist. They will be ignored during import.</p>
                            <ul style="margin:0; padding-left:22px; font-size:12px; color:#991b1b; max-height:120px; overflow-y:auto; line-height: 1.6;">
                    `;
                    unenrolledSkipped.forEach(u => {
                        html += `<li><strong>${u.id_number}</strong> - ${u.student_name}</li>`;
                    });
                    html += `</ul></div>`;
                }

                const disabledAttr = invalidRecords.length > 0 ? 'disabled' : '';
                const cursorStyle = invalidRecords.length > 0 ? 'cursor:not-allowed; opacity:0.5;' : 'cursor:pointer; opacity:1;';
                
                html += `
                        <div style="text-align:right; margin-top: 20px;">
                            <button id="btn-confirm-import" ${disabledAttr} style="background:var(--primary-color); color:#ffffff; border:none; padding:10px 20px; border-radius:6px; font-weight:600; transition:0.2s; ${cursorStyle}">
                                Confirm & Import Records
                            </button>
                        </div>
                    </div>
                `;
                
                importStatus.innerHTML = html;
                
                if (invalidRecords.length === 0) {
                    document.getElementById('btn-confirm-import').onclick = () => executeFinalImport(validRecords, invalidRecords, unenrolledSkipped.map(u => u.id_number));
                }
                
                const selects = document.querySelectorAll('.category-correction-select');
                selects.forEach(sel => {
                    sel.addEventListener('change', (e) => {
                        const idx = e.target.getAttribute('data-index');
                        const val = e.target.value;
                        invalidRecords[idx].selected = val;
                        
                        const statusTd = document.getElementById(`status-row-${idx}`);
                        if(val) {
                            statusTd.innerHTML = `<span style="color:#10b981; font-weight:bold;">Ready</span>`;
                            e.target.style.borderColor = '#10b981';
                        } else {
                            statusTd.innerHTML = `<span style="color:#f59e0b; font-weight:bold;">Needs Review</span>`;
                            e.target.style.borderColor = '#ef4444';
                        }
                        checkAllResolved();
                    });
                });

                function checkAllResolved() {
                    const allResolved = invalidRecords.every(r => r.selected !== '');
                    const btn = document.getElementById('btn-confirm-import');
                    if (allResolved) {
                        btn.disabled = false;
                        btn.style.cursor = 'pointer';
                        btn.style.opacity = '1';
                        btn.onclick = () => executeFinalImport(validRecords, invalidRecords, unenrolledSkipped.map(u => u.id_number));
                    } else {
                        btn.disabled = true;
                        btn.style.cursor = 'not-allowed';
                        btn.style.opacity = '0.5';
                        btn.onclick = null;
                    }
                }

            } catch (err) {
                console.error("Import Error:", err);
                Swal.fire('Import Failed', err.message || 'An unexpected parsing issue occurred.', 'error');
                importStatus.innerHTML = '';
            }
        });
    }

    // ==========================================================
    // BULK IMPORT EXECUTION WITH STRICT POLICY CHECKING
    // ==========================================================
    async function executeFinalImport(valid, correctedInvalid, skippedIds) {
        Swal.fire({
            title: 'Processing Records...',
            text: 'Importing valid beneficiaries and verifying strict institutional policy tracking...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
        
        try {
            // Fetch strict policies directly from the database configuration
            let policyConfig = null;
            try {
                const { data: policyData } = await window.supabaseClient.from('school_policies').select('*').eq('school_id', currentAdminSchoolId).single();
                if (policyData) policyConfig = policyData;
            } catch (e) {
                console.warn("Could not retrieve custom limits from policies table. Continuing with basic inserts.");
            }

            const finalRecords = [...valid];
            correctedInvalid.forEach(r => {
                r.category = r.selected; 
                finalRecords.push(r);
            });

            const validIds = finalRecords.map(s => s.id_number);
            const { data: matchedProfiles, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('id, id_number')
                .in('id_number', validIds);

            if (profileError) throw profileError;

            const profileMap = {};
            const studentUuids = [];
            if (matchedProfiles) {
                matchedProfiles.forEach(p => {
                    profileMap[p.id_number] = p.id;
                    studentUuids.push(p.id);
                });
            }

            // Fetch current active applications for ALL students in the payload
            let currentActiveApps = [];
            if (studentUuids.length > 0) {
                const { data, error } = await window.supabaseClient
                    .from('applications')
                    .select('id, student_id, scholarship_id, outside_assistance_name, status, category')
                    .in('student_id', studentUuids)
                    .in('status', ['Grantee', 'Passed', 'Approved']);

                if (error) throw error;
                currentActiveApps = data || [];
            }

            // Map the active applications exactly to the students UUIDs
            const activeUserMap = {};
            currentActiveApps.forEach(app => {
                if (!activeUserMap[app.student_id]) activeUserMap[app.student_id] = [];
                activeUserMap[app.student_id].push(app);
            });

            const processPromises = finalRecords.map(async row => {
                const studentUuid = profileMap[row.id_number];

                if (!studentUuid) {
                    throw new Error(`ProfileNotRegistered:${row.id_number}`); 
                }

                const internalProgram = schoolScholarships.find(s => s.title.toLowerCase() === row.assistance_name.toLowerCase());
                const finalCategory = row.category;
                
                // Keep track of their current memory list so sequential rows don't bypass checks
                const studentActiveList = activeUserMap[studentUuid] || []; 

                // 1. Check if it's already a duplicate of this EXACT program
                if (internalProgram) {
                    const { data: existingApps } = await window.supabaseClient
                        .from('applications')
                        .select('id, status, duration')
                        .eq('student_id', studentUuid)
                        .eq('scholarship_id', internalProgram.id);

                    if (existingApps && existingApps.length > 0) {
                        const extApp = existingApps[0];
                        
                        if (['Grantee', 'Passed', 'Approved'].includes(extApp.status)) return 'Duplicate';
                        
                        // Enforce Admin Policies Before Reactivation
                        validateAgainstPolicies(finalCategory, studentActiveList, policyConfig, row.id_number);

                        const { error: updateError } = await window.supabaseClient.from('applications').update({
                            status: 'Grantee',
                            remarks: 'Auto-Approved/Re-activated via Beneficiary Bulk Import',
                            duration: row.duration || extApp.duration,
                            category: finalCategory
                        }).eq('id', extApp.id);
                        
                        if (updateError) throw updateError;
                        
                        // Append to memory array to block subsequent rows if they exceed the limit
                        studentActiveList.push({ category: finalCategory }); 
                        return 'Updated';
                    }
                } else {
                    // OUTSIDE ASSISTANCE CHECK
                    const { data: existingOutside } = await window.supabaseClient
                        .from('applications')
                        .select('id, status, duration')
                        .eq('student_id', studentUuid)
                        .is('scholarship_id', null)
                        .eq('outside_assistance_name', row.assistance_name);

                    if (existingOutside && existingOutside.length > 0) {
                        const extOut = existingOutside[0];
                        
                        if (['Grantee', 'Passed', 'Approved'].includes(extOut.status)) return 'Duplicate';

                        // Enforce Admin Policies Before Reactivation
                        validateAgainstPolicies(finalCategory, studentActiveList, policyConfig, row.id_number);

                        const { error: updateOutError } = await window.supabaseClient.from('applications').update({
                            status: 'Grantee',
                            remarks: 'Re-activated Outside Assistance via Bulk Import',
                            duration: row.duration || extOut.duration,
                            category: finalCategory,
                            outside_sy: row.sy,
                            outside_semester: row.sem,
                            outside_batch: row.batch
                        }).eq('id', extOut.id);

                        if (updateOutError) throw updateOutError;
                        studentActiveList.push({ category: finalCategory }); 
                        return 'Updated';
                    }
                }

                // 2. Enforce Admin Policies Before New Insertion
                validateAgainstPolicies(finalCategory, studentActiveList, policyConfig, row.id_number);

                // 3. Proceed to Insert
                if (internalProgram) {
                    const { error: insertError } = await window.supabaseClient.from('applications').insert({
                        student_id: studentUuid,
                        scholarship_id: internalProgram.id,
                        status: 'Grantee',
                        duration: row.duration,
                        category: finalCategory,
                        remarks: 'Directly Imported Beneficiary'
                    });
                    if (insertError) throw insertError; 
                } else {
                    const { error: outsideInsertError } = await window.supabaseClient.from('applications').insert({
                        student_id: studentUuid,
                        scholarship_id: null,
                        outside_assistance_name: row.assistance_name,
                        outside_sy: row.sy,
                        outside_semester: row.sem,
                        outside_batch: row.batch,
                        duration: row.duration,
                        category: finalCategory, 
                        status: 'Grantee',
                        remarks: 'Imported Outside Educational Assistance'
                    });
                    if (outsideInsertError) throw outsideInsertError; 
                }

                // Append to memory array
                studentActiveList.push({ category: finalCategory }); 
                return 'Inserted';
            });

            const results = await Promise.allSettled(processPromises);
            
            let insertCount = 0; let updateCount = 0; let duplicateCount = 0;
            let noAccountSkipped = 0; let policyRejections = new Set();
            let hasFailures = false;

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value === 'Inserted') insertCount++;
                    if (result.value === 'Updated') updateCount++;
                    if (result.value === 'Duplicate') duplicateCount++;
                } else if (result.status === 'rejected') {
                    hasFailures = true;
                    const errString = String(result.reason.message || result.reason);
                    
                    if (errString.includes("ProfileNotRegistered")) {
                        noAccountSkipped++;
                    } else if (errString.includes("PolicyLimitReached") || errString.includes("CategoryLimitReached") || errString.includes("CombinationRuleViolation")) {
                        // Clean up the error message for the display
                        policyRejections.add(errString.replace(/^(Error: )?(PolicyLimitReached:|CategoryLimitReached:|CombinationRuleViolation:)\s*/i, ''));
                    } else if (errString.toLowerCase().includes('policy') || errString.includes('row-level security')) {
                        policyRejections.add("Database RLS prevented modification of an active record.");
                    } else {
                        policyRejections.add(`System Error: ${errString}`);
                    }
                }
            });

            if (correctedInvalid.length > 0) {
                await window.supabaseClient.from('audit_logs').insert([{
                    admin_id: adminId,
                    school_id: currentAdminSchoolId,
                    action: 'Bulk Import Category Correction',
                    module: 'Active Beneficiaries',
                    details: JSON.stringify({ details: `Admin manually corrected categories for ${correctedInvalid.length} records.` })
                }]);
            }

            let summaryHtml = `<div style="text-align: left; font-size: 14px; margin-top: 10px;">`;
            if (insertCount > 0 || updateCount > 0) {
                summaryHtml += `<p style="margin-bottom: 5px; color: #166534;"><i class="fa-solid fa-check"></i> <strong>${updateCount}</strong> pending applications auto-approved.</p>`;
                summaryHtml += `<p style="margin-bottom: 15px; color: #166534;"><i class="fa-solid fa-check"></i> <strong>${insertCount}</strong> new beneficiaries successfully written.</p>`;
            }

            if (hasFailures || duplicateCount > 0 || skippedIds.length > 0 || noAccountSkipped > 0) {
                summaryHtml += `<div style="background:#fef2f2; border:1px solid #fca5a5; padding:10px; border-radius:6px; max-height:200px; overflow-y:auto;">`;
                summaryHtml += `<h5 style="margin:0 0 8px 0; color:#991b1b;">Import Warnings & Policy Rejections:</h5>`;
                
                if (duplicateCount > 0) summaryHtml += `<p style="color:#b45309; font-size:13px; margin: 0 0 4px 0;"><strong>- Ignored:</strong> ${duplicateCount} records already actively registered in this specific program.</p>`;
                if (skippedIds.length > 0) summaryHtml += `<p style="color:#ef4444; font-size:13px; margin: 0 0 4px 0;"><strong>- Skipped:</strong> ${skippedIds.length} IDs are missing from the Masterlist.</p>`;
                if (noAccountSkipped > 0) summaryHtml += `<p style="color:#ef4444; font-size:13px; margin: 0 0 4px 0;"><strong>- Skipped:</strong> ${noAccountSkipped} enrolled IDs have not registered a profile yet.</p>`;
                
                if (policyRejections.size > 0) {
                    policyRejections.forEach(rejection => {
                        summaryHtml += `<p style="color:#991b1b; font-size:13px; margin: 4px 0; font-weight: bold;">- ${rejection}</p>`;
                    });
                }
                summaryHtml += `</div>`;
            }
            summaryHtml += `</div>`;

            await Swal.fire({
                title: hasFailures ? 'Import Completed with Exceptions' : 'Import Successful!',
                html: summaryHtml,
                icon: hasFailures ? 'warning' : 'success',
                confirmButtonColor: '#10b981',
                width: 600
            });

            if (document.getElementById('import-modal')) document.getElementById('import-modal').style.display = 'none';
            if (document.getElementById('import-file-input')) document.getElementById('import-file-input').value = '';
            if (document.getElementById('import-status')) document.getElementById('import-status').innerHTML = '';
            
            fetchActiveBeneficiaries();

        } catch (err) {
            Swal.fire({
                title: 'Import Interrupted',
                text: err.message || 'The script failed before reaching the database loop.',
                icon: 'error',
                confirmButtonColor: '#ef4444'
            });
        }
    }

    // ==========================================
    // 7. MANUALLY ADD BENEFICIARY WITH POLICIES
    // ==========================================
    if (document.getElementById('btn-add-manual')) {
        document.getElementById('btn-add-manual').addEventListener('click', () => {
            document.getElementById('manual-add-modal').style.display = 'flex';
        });
    }

    if (document.getElementById('form-manual-add')) {
        document.getElementById('form-manual-add').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-submit-manual');
            const sid = document.getElementById('manual-student-id').value.trim();
            const schId = document.getElementById('manual-scholarship-select').value;
            const outsideName = document.getElementById('manual-outside-name').value.trim();
            let category = document.getElementById('manual-category').value.trim();
            const duration = document.getElementById('manual-duration').value;

            if (!schId && !outsideName) {
                Swal.fire("Required", "Please select an Internal Program OR provide an Outside Assistance Name.", "warning");
                return;
            }

            if (!category) {
                Swal.fire("Required", "Please select an Educational Assistance Category to track policies accurately.", "warning");
                return;
            }

            if (!masterlistMap[sid]) {
                Swal.fire("Not Enrolled", "This Student ID is not found in the Enrolled Masterlist.", "error");
                return;
            }

            if (schId) {
                const internalSch = schoolScholarships.find(s => s.id === schId);
                if (internalSch && internalSch.category) { category = internalSch.category; }
            }

            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
            btn.disabled = true;

            try {
                const { data: profile } = await window.supabaseClient.from('profiles').select('id').eq('id_number', sid).single();
                if (!profile) throw new Error("Student has not registered an account yet.");

                // FETCH POLICIES & CURRENT ACTIVE PROGRAMS FOR THIS STUDENT
                let policyConfig = null;
                const { data: policyData } = await window.supabaseClient.from('school_policies').select('*').eq('school_id', currentAdminSchoolId).single();
                if (policyData) policyConfig = policyData;

                const { data: currentApps } = await window.supabaseClient
                    .from('applications')
                    .select('id, category')
                    .eq('student_id', profile.id)
                    .in('status', ['Grantee', 'Passed', 'Approved']);

                // VALIDATE!
                validateAgainstPolicies(category, currentApps || [], policyConfig, sid);

                // INSERT IF VALID
                const payload = {
                    student_id: profile.id,
                    scholarship_id: schId || null,
                    outside_assistance_name: schId ? null : outsideName,
                    category: category,
                    duration: duration,
                    status: 'Grantee',
                    remarks: 'Manually Added by Administrator'
                };

                const { error } = await window.supabaseClient.from('applications').insert(payload);
                if (error) throw error;

                await window.supabaseClient.from('audit_logs').insert([{
                    admin_id: adminId,
                    school_id: currentAdminSchoolId,
                    action: 'Manually Added Beneficiary',
                    module: 'Active Beneficiaries',
                    details: JSON.stringify({ details: `Added Student ID ${sid} to assistance program. Category mapped: ${category}`, targetUserId: profile.id })
                }]);

                Swal.fire("Success", "Beneficiary manually added successfully.", "success");
                document.getElementById('form-manual-add').reset();
                document.getElementById('manual-add-modal').style.display = 'none';
                fetchActiveBeneficiaries();

            } catch (err) { 
                const cleanError = err.message.replace(/^(Error: )?(PolicyLimitReached:|CategoryLimitReached:|CombinationRuleViolation:)\s*/i, '');
                Swal.fire("Policy Blocked", cleanError, "error");
            } finally { 
                btn.innerHTML = 'Add Beneficiary'; btn.disabled = false; 
            }
        });
    }

    if (document.getElementById('manual-scholarship-select')) {
        document.getElementById('manual-scholarship-select').addEventListener('change', (e) => {
            const outsideInput = document.getElementById('manual-outside-name');
            const categorySelect = document.getElementById('manual-category');
            if (e.target.value) {
                outsideInput.value = '';
                outsideInput.disabled = true;
                
                const matchedSch = schoolScholarships.find(s => s.id === e.target.value);
                if (matchedSch && matchedSch.category) {
                    const existingOption = Array.from(categorySelect.options).find(opt => opt.value === matchedSch.category);
                    if (existingOption) { categorySelect.value = matchedSch.category; } 
                    else { categorySelect.add(new Option(matchedSch.category, matchedSch.category, true, true)); }
                    categorySelect.disabled = true;
                }
            } else {
                outsideInput.disabled = false;
                categorySelect.disabled = false;
            }
        });
    }

    // ==========================================
    // 8. MOBILE HAMBURGER MENU TOGGLE
    // ==========================================
    const hamburgerBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar-container');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn && sidebar && overlay) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = sidebar.classList.contains('active');
            if (isActive) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.remove('active');
            } else {
                sidebar.classList.add('active');
                overlay.classList.add('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.add('active');
            }
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        });
    }

    // ==========================================
    // 9. EXPORT LIST TO EXCEL & PDF
    // ==========================================
    const btnExport = document.getElementById('btn-export'); 

    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            if (currentFilteredBeneficiaries.length === 0) {
                Swal.fire('Empty Data', 'There are no active beneficiaries matching the current filters to export.', 'info');
                return;
            }

            const formatChoice = await Swal.fire({
                title: 'Export Beneficiaries',
                text: 'Select your preferred file format for the export:',
                icon: 'question',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '<i class="fa-solid fa-file-excel"></i> Excel',
                denyButtonText: '<i class="fa-solid fa-file-pdf"></i> PDF',
                confirmButtonColor: '#10b981',
                denyButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                cancelButtonText: 'Cancel'
            });

            if (formatChoice.isConfirmed) {
                exportToExcel();
            } else if (formatChoice.isDenied) {
                exportToPDF();
            }
        });
    }

    function getExportData() {
        return currentFilteredBeneficiaries.map(app => {
            const studentId = app.profiles?.id_number || 'N/A';
            const lname = app.profiles?.last_name || 'N/A';
            const fname = app.profiles?.first_name || 'N/A';
            const mname = app.profiles?.middle_name || '';
            
            const masterInfo = masterlistMap[studentId] || {};
            const program = masterInfo.program || app.profiles?.program || 'N/A';
            const yearLevel = masterInfo.year_level || app.profiles?.year_level || 'N/A';
            
            const isOutside = !app.scholarship_id;
            const schTitle = isOutside ? (app.outside_assistance_name || 'Outside Assistance') : (app.scholarships?.title || 'Unknown');
            const categoryValue = app.category || app.scholarships?.category || 'Outside Assistance';
            
            const batch = app.scholarships?.batch || app.outside_batch || 'N/A';
            const semester = app.scholarships?.semester || app.outside_semester || 'N/A';
            const sy = app.scholarships?.school_year || app.outside_sy || 'N/A';
            const duration = app.duration || 'Not Set';
            const dateRewarded = app.created_at ? new Date(app.created_at).toLocaleDateString('en-US') : 'Not Set';

            return {
                "Student ID": studentId,
                "Last Name": lname,
                "First Name": fname,
                "Middle Name": mname,
                "Program": program,
                "Year Level": yearLevel,
                "Assistance Program": schTitle,
                "Category": categoryValue,
                "Batch": batch,
                "Semester": semester,
                "School Year": sy,
                "Duration": duration,
                "Date Rewarded": dateRewarded
            };
        });
    }

    function exportToExcel() {
        Swal.fire({ title: 'Generating Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // Wrap in setTimeout to allow the SweetAlert UI to render fully before blocking the main thread
        setTimeout(() => {
            try {
                const data = getExportData();
                const worksheet = XLSX.utils.json_to_sheet(data);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Active Beneficiaries");
                
                const today = new Date().toISOString().split('T')[0];
                XLSX.writeFile(workbook, `Active_Beneficiaries_Export_${today}.xlsx`);
                
                // Explicitly close the loading modal before showing success
                Swal.close();
                Swal.fire('Exported!', 'Your Excel file has been downloaded.', 'success');
            } catch (error) {
                console.error("Excel Export Error: ", error);
                Swal.close();
                Swal.fire('Export Failed', 'There was an error generating the Excel file. Please check the console.', 'error');
            }
        }, 500);
    }

    function exportToPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            Swal.fire('Library Missing', 'jsPDF library is not loaded. Please add the CDN links to your HTML.', 'error');
            return;
        }

        Swal.fire({ title: 'Generating PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // Wrap in setTimeout to prevent thread locking from overlapping with the spinner animation
        setTimeout(() => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('landscape'); 
                
                const data = getExportData();
                const headers = Object.keys(data[0]);
                const rows = data.map(obj => Object.values(obj));
                const todayDate = new Date().toLocaleDateString('en-US');

                doc.setFontSize(14);
                doc.setTextColor(15, 23, 42); 
                doc.text('Active Beneficiaries Report', 14, 15);
                doc.setFontSize(10);
                doc.setTextColor(100, 116, 139); 
                doc.text(`Generated on: ${todayDate} | Total Records: ${data.length}`, 14, 21);

                doc.autoTable({
                    head: [headers],
                    body: rows,
                    startY: 26,
                    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    margin: { top: 10, left: 10, right: 10 }
                });

                const fileNameDate = new Date().toISOString().split('T')[0];
                doc.save(`Active_Beneficiaries_Export_${fileNameDate}.pdf`);
                
                // Explicitly close the loading modal before showing success
                Swal.close();
                Swal.fire('Exported!', 'Your PDF file has been downloaded.', 'success');
            } catch (error) {
                console.error("PDF Export Error: ", error);
                Swal.close();
                Swal.fire('Export Failed', 'There was an error generating the PDF file. Please check the console.', 'error');
            }
        }, 500);
    }

    // Boot
    initProfile();
});