document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }

    const adminId = session.user.id;
    let allScholarships = [];
    let currentApplications = []; 
    let currentFilteredApps = []; 
    let activeScholarshipData = null;
    let activeTabStatus = 'Pending';
    let activeIndividualAppId = null; 
    let currentAdminSchoolId = null;
    let currentAdminSchool = null;
    let currentAdminRole = null; // Store role for policy override checks

    const formatText = (text, rule) => {
        if (!text || typeof text !== 'string') return text;
        if (rule === 'UPPERCASE') return text.toUpperCase();
        if (rule === 'lowercase') return text.toLowerCase();
        if (rule === 'Capitalize Each Word') return text.replace(/\b\w/g, (char) => char.toUpperCase());
        return text;
    };

    const normalizeApplicantStatus = (status) => {
        const value = (status || '').toString().trim().toLowerCase();
        if (value === 'grantee') return 'approved';
        if (value === 'declined') return 'rejected';
        return value;
    };

    const getDisplayStatus = (status) => {
        const normalized = normalizeApplicantStatus(status);
        if (normalized === 'approved') return 'Approved';
        if (normalized === 'rejected' || normalized === 'declined') return 'Rejected';
        if (normalized === 'pending' || normalized === 'under review') return 'Pending';
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    };

    const renderFormattedAnswer = (value, field) => {
        if (value === null || value === undefined || value === '') {
            return '<span style="font-style:italic;">No response provided</span>';
        }
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        const formattedValue = typeof value === 'string'
            ? formatText(value, field?.format_rule || 'No formatting')
            : String(value);
        return formattedValue;
    };

    const sanitizeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/"/g, '""')
            .replace(/(\r\n|\n|\r)/gm, ' ')
            .replace(/<[^>]*>?/gm, '');
    };

    // UI Elements
    const viewGrid = document.getElementById('view-scholarships-grid');
    const viewList = document.getElementById('view-applicants-list');
    const cardsContainer = document.getElementById('scholarship-cards-container');
    const tbody = document.getElementById('applicants-tbody');

    // --- 2. LOAD PROFILE DATA INTO HEADER ---
    async function loadProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', adminId)
                .single();

            if (profile) {
                // Allow admin, coordinator, and staff to view the module
                if (!['admin', 'coordinator', 'staff'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                currentAdminSchoolId = profile.school_id;
                currentAdminSchool = profile.school;
                currentAdminRole = profile.role;

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
            Swal.fire('Error', 'Failed to load profile data.', 'error');
        }
    }

    // --- 3. SYSTEM LOGGING UTILITY ---
    async function logSystemAction(action, details, targetUserId = null) {
        try {
            await window.supabaseClient.from('audit_logs').insert([{
                admin_id: adminId,
                school_id: currentAdminSchoolId,
                action: action,
                module: 'Applications',
                details: JSON.stringify({ details, targetUserId })
            }]);
        } catch (e) {
            console.warn("Audit logging failed:", e);
        }
    }

    // --- 4. FETCH EDUCATIONAL ASSISTANCE PROGRAMS ---
    async function loadScholarships() {
        try {
            if (!currentAdminSchoolId) {
                cardsContainer.innerHTML = '<div style="color:#ef4444; grid-column:1/-1; padding:20px; text-align:center;">Account error: No school assigned to this admin.</div>';
                return;
            }

            const { data: scholarships, error } = await window.supabaseClient
                .from('scholarships')
                .select('*, applications ( status )')
                .eq('school_id', currentAdminSchoolId) 
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            allScholarships = scholarships;
            renderScholarshipCards();
        } catch (err) {
            console.error(err);
            cardsContainer.innerHTML = '<div style="color:#ef4444; grid-column:1/-1; padding:20px; text-align:center;">Failed to load data.</div>';
        }
    }

    function renderScholarshipCards() {
        cardsContainer.innerHTML = '';
        
        const icons = [
            '<i class="fa-solid fa-graduation-cap"></i>', 
            '<i class="fa-solid fa-book-open"></i>', 
            '<i class="fa-solid fa-users"></i>', 
            '<i class="fa-solid fa-medal"></i>', 
            '<i class="fa-solid fa-laptop-code"></i>', 
            '<i class="fa-solid fa-globe"></i>'
        ];
        const colors = ['#dcfce7', '#e0e7ff', '#f3e8ff', '#fef3c7', '#fee2e2'];

        if (allScholarships.length === 0) {
            cardsContainer.innerHTML = '<div class="empty-state">No educational assistance programs created yet.</div>';
            return;
        }

        allScholarships.forEach((sch, i) => {
            const icon = icons[i % icons.length];
            const bg = colors[i % colors.length];
            
            const pendingCount = sch.applications.filter(a => normalizeApplicantStatus(a.status) === 'pending' || normalizeApplicantStatus(a.status) === 'under review').length;
            const approvedCount = sch.applications.filter(a => normalizeApplicantStatus(a.status) === 'approved').length;

            const card = document.createElement('div');
            card.className = 'data-panel';
            card.style.cursor = 'pointer';
            card.style.transition = '0.2s';
            card.onmouseover = () => card.style.transform = 'translateY(-3px)';
            card.onmouseout = () => card.style.transform = 'translateY(0)';
            card.onclick = () => openScholarship(sch);
            
            let detailsHtml = '';
            if (sch.batch || sch.semester || sch.school_year) {
                let parts = [];
                if (sch.batch) parts.push(`<strong>Batch:</strong> ${sch.batch}`);
                if (sch.semester) parts.push(`<strong>Semester:</strong> ${sch.semester}`);
                if (sch.school_year) parts.push(`<strong>School Year:</strong> ${sch.school_year}`);
                
                detailsHtml = `
                <div style="font-size:12px; color:var(--text-muted); margin-bottom:15px; background:#f1f5f9; padding:10px; border-radius:6px; line-height: 1.5;">
                    ${parts.join('<br>')}
                </div>`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                    <div style="background:${bg}; width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; color:#334155;">${icon}</div>
                    <span style="color:#cbd5e1; font-weight:bold;"><i class="fa-solid fa-arrow-right"></i></span>
                </div>
                <h3 style="font-size:16px; margin-bottom:8px; color:var(--text-main);">${sch.title}</h3>
                
                ${detailsHtml}

                <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-dark); padding-top:15px;">
                    <div>
                        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block;">Pending</span>
                        <span style="color:#0f172a; font-size:18px; font-weight:800;">${pendingCount}</span>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block;">Approved</span>
                        <span style="color:#10b981; font-size:18px; font-weight:800;">${approvedCount}</span>
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
        });
    }

    // --- 5. VIEW APPLICANTS FOR A PROGRAM ---
    window.openScholarship = async (scholarshipObj) => {
        activeScholarshipData = scholarshipObj;
        document.getElementById('active-sch-title').innerText = scholarshipObj.title;
        viewGrid.style.display = 'none';
        viewList.style.display = 'block';
        switchTab('Pending');
    };

    window.showGrid = () => {
        viewList.style.display = 'none';
        viewGrid.style.display = 'block';
        loadScholarships(); 
    };

    async function loadApplicationsForActiveTab() {
        if(activeTabStatus !== 'Individual') {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Loading applicants...</td></tr>`;
        }
        
        try {
            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, middle_name, last_name, id_number, email, contact_number, date_of_birth, gender, address, program, year_level ), scholarships (title)')
                .eq('scholarship_id', activeScholarshipData.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            currentApplications = apps || [];
            
            if (activeTabStatus === 'Individual') {
                initIndividualView();
            } else {
                filterTable(); 
            }
            
        } catch (err) {
            console.error(err);
            if(activeTabStatus !== 'Individual') tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444; text-align:center; padding:40px;">Failed to load applicants. Check console for details.</td></tr>`;
        }
    }

    window.switchTab = (status) => {
        activeTabStatus = status;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick').includes(`'${status}'`)) {
                btn.classList.add('active');
            }
        });

        const evalTabBtn = document.getElementById('tab-evaluate-applicant');
        if (evalTabBtn) {
            if (status === 'Individual') {
                evalTabBtn.style.display = 'flex';
            } else {
                evalTabBtn.style.display = 'none';
            }
        }

        const tableView = document.getElementById('table-view-container');
        const indivView = document.getElementById('individual-view-container');
        const badge = document.getElementById('main-status-badge');

        if (status === 'Individual') {
            tableView.style.display = 'none';
            indivView.style.display = 'block';
            badge.innerText = 'Evaluating Applicant';
            badge.className = 'badge-status';
            badge.style.background = '#e0e7ff';
            badge.style.color = '#3730a3';
        } else {
            tableView.style.display = 'block';
            indivView.style.display = 'none';
            if(status === 'Pending') { badge.innerText = 'Pending Evaluation'; badge.className = 'badge-status badge-review'; }
            if(status === 'Approved') { badge.innerText = 'Approved Applicants'; badge.className = 'badge-status'; badge.style.background = '#dcfce7'; badge.style.color = '#166534'; }
            if(status === 'Rejected') { badge.innerText = 'Rejected Applicants'; badge.className = 'badge-status badge-rejected'; }
        }

        loadApplicationsForActiveTab();
    };

    // --- 6. TABLE WITH SORTING ---
    window.filterTable = () => {
        const searchTerm = document.getElementById('search-applicant').value.toLowerCase().trim();
        const sortSelect = document.getElementById('sort-date-select');
        const sortOrder = sortSelect ? sortSelect.value : 'desc';
        
        let filteredApps = currentApplications.filter(app => {
            const currentAppStatus = normalizeApplicantStatus(app.status);
            
            let targetStatus = activeTabStatus.toLowerCase();
            if (activeTabStatus === 'Approved') targetStatus = 'approved';
            if (activeTabStatus === 'Rejected') targetStatus = 'declined'; 

            const matchStatus = activeTabStatus === 'Pending'
                ? (currentAppStatus === 'pending' || currentAppStatus === 'under review')
                : activeTabStatus === 'Approved'
                    ? (currentAppStatus === 'approved')
                    : (currentAppStatus === 'rejected' || currentAppStatus === 'declined');
            
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.toLowerCase();
            
            const sid = (app.profiles?.id_number || '').toLowerCase();
            const email = (app.profiles?.email || '').toLowerCase();
            
            const matchSearch = fullName.includes(searchTerm) || sid.includes(searchTerm) || email.includes(searchTerm);
            
            return matchStatus && matchSearch;
        });

        filteredApps.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        currentFilteredApps = filteredApps;

        document.getElementById('table-count-label').innerText = `Total ${activeTabStatus}: ${filteredApps.length}`;
        document.getElementById('showing-entries').innerText = `Showing 1 to ${filteredApps.length} of ${filteredApps.length} entries`;

        if (filteredApps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b; font-size: 14px;">No applicants found matching your criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        filteredApps.forEach((app, index) => {
            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const name = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '');
            
            const studentId = app.profiles?.id_number || 'N/A';
            const email = app.profiles?.email || 'N/A';
            
            const normalizedStatus = normalizeApplicantStatus(app.status);
            let statusClass = 'badge-review';
            let displayStatus = getDisplayStatus(app.status);
            
            if(normalizedStatus === 'approved') {
                statusClass = 'badge-approved';
                displayStatus = 'Approved';
            }
            if(normalizedStatus === 'rejected' || normalizedStatus === 'declined') {
                statusClass = 'badge-rejected';
                displayStatus = 'Rejected';
            }

            let actionsHtml = '';
            if (activeTabStatus === 'Pending') {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-approve" onclick="confirmUpdateStatus('${app.id}', 'Approved', 'Approve')"><i class="fa-solid fa-check"></i> Approve</button>
                        <button class="btn-reject" onclick="confirmUpdateStatus('${app.id}', 'Rejected', 'Reject')"><i class="fa-solid fa-xmark"></i> Reject</button>
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')"><i class="fa-solid fa-eye"></i> View Responses</button>
                    </div>
                `;
            } else if (activeTabStatus === 'Approved') {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')"><i class="fa-solid fa-eye"></i> View Responses</button>
                    </div>
                `;
            } else { // Rejected
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')"><i class="fa-solid fa-eye"></i> View Responses</button>
                        <button class="btn-remove" style="background:#fee2e2; color:#ef4444; border:1px solid #ef4444; padding:6px 12px; border-radius:6px; font-size:13px; cursor:pointer;" onclick="deleteApplication('${app.id}')"><i class="fa-solid fa-trash-can"></i> Delete</button>
                    </div>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color:#64748b; font-weight:500;">${index + 1}</td>
                <td style="color:#0f172a; font-weight:600;">${name}</td>
                <td style="color:#475569;">${studentId}</td>
                <td style="color:#475569;">${email}</td>
                <td style="color:#475569; font-size:13px;">${dateStr}</td>
                <td><span class="badge-status ${statusClass}">${displayStatus}</span></td>
                <td>${actionsHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    };

    // --- 7. APPLICANT EVALUATION VIEW ---
    window.initIndividualView = () => {
        const select = document.getElementById('individual-applicant-select');
        select.innerHTML = '';
        
        if (currentApplications.length === 0) {
            select.innerHTML = '<option value="">No applicants found</option>';
            document.getElementById('gform-content').innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;">No applicants available for evaluation.</div>';
            return;
        }

        currentApplications.forEach(app => {
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const name = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '');
            
            let dispStat = getDisplayStatus(app.status);

            const opt = document.createElement('option');
            opt.value = app.id;
            opt.text = `${name} - ${app.profiles?.id_number || ''} (${dispStat})`;
            select.appendChild(opt);
        });

        if (activeIndividualAppId && currentApplications.some(a => a.id === activeIndividualAppId)) {
            select.value = activeIndividualAppId;
            renderIndividualApp(activeIndividualAppId);
        } else {
            renderIndividualApp(currentApplications[0].id);
        }
    };

    window.renderIndividualApp = (appId) => {
        activeIndividualAppId = appId;
        const app = currentApplications.find(a => a.id === appId);
        if(!app) return;
        
        const btnApprove = document.getElementById('indiv-btn-approve');
        const btnReject = document.getElementById('indiv-btn-reject');
        
        if (btnApprove) btnApprove.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
        if (btnReject) btnReject.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject';

        const normalizedStatus = normalizeApplicantStatus(app.status);
        if (normalizedStatus === 'pending' || normalizedStatus === 'under review') {
            if(btnApprove) { btnApprove.style.display = 'inline-block'; btnApprove.onclick = () => confirmUpdateStatus(app.id, 'Approved', 'Approve'); }
            if(btnReject) { btnReject.style.display = 'inline-block'; btnReject.onclick = () => confirmUpdateStatus(app.id, 'Rejected', 'Reject'); }
        } else if (normalizedStatus === 'approved') {
            if(btnApprove) btnApprove.style.display = 'none'; 
            if(btnReject) btnReject.style.display = 'none'; 
        } else { // Declined / Rejected
            if(btnApprove) btnApprove.style.display = 'none'; 
            if(btnReject) btnReject.style.display = 'none';
        }

        const gformContent = document.getElementById('gform-content');
        
        const fname = app.profiles?.first_name || '';
        const mname = app.profiles?.middle_name || '';
        const lname = app.profiles?.last_name || '';
        const name = `${fname} ${mname ? mname + ' ' : ''}${lname}`.trim();
        
        const sid = app.profiles?.id_number || 'N/A';
        const email = app.profiles?.email || 'N/A';
        const dob = app.profiles?.date_of_birth || 'N/A';
        const gender = app.profiles?.gender || 'N/A';
        const contact = app.profiles?.contact_number || 'N/A';
        const address = app.profiles?.address || 'N/A';
        const program = app.profiles?.program || 'N/A'; 
        const yearLevel = app.profiles?.year_level || 'N/A';
        const date = new Date(app.created_at).toLocaleString();
        const profileFormats = activeScholarshipData?.auto_collected_formats || {};
        const formattedName = formatText(`${fname} ${mname ? mname + ' ' : ''}${lname}`.trim(), profileFormats['Full Name']);
        const formattedGender = formatText(gender, profileFormats['Gender']);
        const formattedAddress = formatText(address, profileFormats['Address']);
        const formattedProgram = formatText(program, profileFormats['Program']);
        const formattedYearLevel = formatText(yearLevel, profileFormats['Year Level']);
        const dispStat = getDisplayStatus(app.status);
        
        let html = `
            <div style="background:#fff; border:1px solid var(--border-dark); border-top: 8px solid #3b82f6; border-radius:12px; padding:24px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <h2 style="font-size: 20px; margin-top:0; margin-bottom: 16px; color: #0f172a;"><i class="fa-solid fa-address-card"></i> Applicant Profile</h2>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="font-size: 14px; color: #0f172a;"><strong>Student ID:</strong> <span style="color:#475569">${sid}</span></div>
                    <div style="font-size: 14px; color: #0f172a;"><strong>Email:</strong> <span style="color:#475569">${email}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a; grid-column: 1 / -1;"><strong>Full Name:</strong> <span style="color:#475569">${formattedName}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a;"><strong>Date of Birth:</strong> <span style="color:#475569">${dob}</span></div>
                    <div style="font-size: 14px; color: #0f172a;"><strong>Gender:</strong> <span style="color:#475569">${formattedGender}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a; grid-column: 1 / -1;"><strong>Contact Number:</strong> <span style="color:#475569">${contact}</span></div>
                    <div style="font-size: 14px; color: #0f172a; grid-column: 1 / -1;"><strong>Address:</strong> <span style="color:#475569">${formattedAddress}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a;"><strong>Program:</strong> <span style="color:#475569">${formattedProgram}</span></div>
                    <div style="font-size: 14px; color: #0f172a;"><strong>Year Level:</strong> <span style="color:#475569">${formattedYearLevel}</span></div>
                </div>

                <hr style="border: 0; height: 1px; background: #e2e8f0; margin: 20px 0;">

                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Evaluation Status:</strong> <span style="color:${dispStat === 'Approved' ? '#166534' : (dispStat === 'Rejected' ? '#991b1b' : '#b45309')}">${dispStat}</span></div>
                <div style="font-size: 14px; color: #0f172a;"><strong>Applied On:</strong> <span style="color:#475569">${date}</span></div>
            </div>
        `;

        // 1. Applicant Responses
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            html += `<h3 style="font-size:16px; color:var(--text-main); margin-bottom:15px; margin-top:30px;"><i class="fa-solid fa-clipboard-question"></i> Form Responses</h3>`;
            
            const schema = activeScholarshipData?.form_fields || activeScholarshipData?.form_schema || [];
            
            schema.forEach(field => {
                if (field.type === 'heading' || field.type === 'text') {
                    html += `<div style="margin: 20px 0 10px 0;">${field.label}</div>`;
                } else {
                    const answer = app.form_responses && Object.prototype.hasOwnProperty.call(app.form_responses, field.label)
                        ? app.form_responses[field.label]
                        : '';
                    const renderedAnswer = renderFormattedAnswer(answer, field);
                    html += `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left: 4px solid var(--primary-color); border-radius:6px; padding:16px; margin-bottom:15px;">
                            <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#1e293b;">${field.label}</div>
                            <div style="font-size:14px; color:#475569;">${renderedAnswer}</div>
                        </div>
                    `;
                }
            });

            // Fallback for fields that might not be in the current schema
            for (const [q, a] of Object.entries(app.form_responses || {})) {
                if (!schema.find(f => f.label === q)) {
                    const renderedAnswer = renderFormattedAnswer(a, null);
                    html += `
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left: 4px solid var(--primary-color); border-radius:6px; padding:16px; margin-bottom:15px;">
                            <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#1e293b;">${q}</div>
                            <div style="font-size:14px; color:#475569;">${renderedAnswer}</div>
                        </div>
                    `;
                }
            }
        }

        // 2. Extracted Documents
        if (app.documents && app.documents.length > 0) {
            html += `<h3 style="font-size:16px; color:var(--text-main); margin-bottom:15px; margin-top:30px;"><i class="fa-solid fa-file-invoice"></i> Submitted Documents & AI Data</h3>`;
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';
                
                // NEW: Full View Modal and Download button (no new tab required for viewing)
                const actionLinks = fileUrl 
                    ? `<div style="display: flex; gap: 15px; align-items: center;">
                           <button onclick="viewDocumentFull('${fileUrl}')" style="background:none; border:none; font-size:13px; color:#3b82f6; text-decoration:none; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-expand"></i> Full View</button>
                           <button onclick="forceDownload('${fileUrl}', '${doc.name || 'document'}')" style="background:none; border:none; font-size:13px; color:#10b981; text-decoration:none; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-download"></i> Download</button>
                       </div>` 
                    : '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().includes('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:450px; border:none; display:block;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; max-height:450px; object-fit:contain; display:block; margin: 0 auto;">`;
                    }
                } else {
                    previewContent = `
                        <div style="padding:40px 20px; text-align:center; color:#64748b;">
                            <i class="fa-solid fa-file-circle-xmark" style="font-size:24px; margin-bottom:10px;"></i>
                            <strong style="display:block; margin-bottom:4px;">File not available</strong>
                        </div>`;
                }

                let extractedDataHtml = '';
                if (doc.extracted_data && Object.keys(doc.extracted_data).length > 0) {
                    let liHtml = '';
                    
                    for (const [key, value] of Object.entries(doc.extracted_data)) {
                        let displayValue = '';

                        if (Array.isArray(value)) {
                            displayValue = value.map(item => {
                                if (typeof item === 'object' && item !== null) {
                                    return Object.entries(item).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>');
                                }
                                return item;
                            }).join('<div style="height:1px; background:#e2e8f0; margin:6px 0;"></div>');
                            
                        } else if (typeof value === 'object' && value !== null) {
                            displayValue = Object.entries(value).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>');
                        } else {
                            displayValue = value || 'N/A';
                        }

                        liHtml += `
                            <li style="background:#fff; border:1px solid #e2e8f0; padding:8px 10px; border-radius:4px; margin-bottom:8px;">
                                <span style="display:block; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${key}</span>
                                <div style="color:#1e293b; font-weight:400; font-size:12px; line-height:1.4;">${displayValue}</div>
                            </li>
                        `;
                    }
                    
                    extractedDataHtml = `
                        <div class="ai-data-box" style="flex: 1; min-width: 280px; max-height: 450px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; padding: 15px; font-size: 13px;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                                <strong style="color:#0f172a; font-size:14px;"><i class="fa-solid fa-wand-magic-sparkles" style="color:#10b981;"></i> AI Extracted Information</strong>
                            </div>
                            <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column;">
                                ${liHtml}
                            </ul>
                        </div>
                    `;
                }

                html += `
                    <div style="background:#fff; border:1px solid var(--border-dark); border-radius:12px; padding:24px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                            <div style="font-weight:600; font-size:15px;">
                                <i class="fa-solid fa-paperclip"></i> ${doc.name} 
                                <span style="font-size:10px; font-weight:bold; color:#166534; background:#dcfce7; padding:4px 8px; border-radius:4px; margin-left:8px;">${doc.status || 'Attached'}</span>
                            </div>
                            ${actionLinks}
                        </div>
                        
                        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 280px; border: 1px solid var(--border-dark); border-radius: 8px; overflow: hidden; background:#f8fafc;">
                                ${previewContent}
                            </div>
                            ${extractedDataHtml}
                        </div>
                    </div>
                `;
            });
        }
        
        gformContent.innerHTML = html;
    };

    // --- NEW: DOCUMENT VIEWER MODAL AND DOWNLOAD LOGIC ---
    window.viewDocumentFull = (url) => {
        const isPdf = url.toLowerCase().includes('.pdf');
        const contentHtml = isPdf
            ? `<iframe src="${url}#toolbar=0" style="width:100%; height:80vh; border:none; display:block;"></iframe>`
            : `<img src="${url}" style="max-width:100%; max-height:80vh; object-fit:contain; display:block; margin: 0 auto;">`;

        Swal.fire({
            title: 'Document Viewer',
            html: contentHtml,
            width: '85%',
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                popup: 'swal-wide-doc'
            }
        });
    };

    window.forceDownload = async (url, filename) => {
        try {
            Swal.fire({ title: 'Downloading...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = blobUrl;
            
            // Set extension if missing
            let downloadName = filename;
            if (!downloadName.includes('.')) {
                const ext = url.split('.').pop().split(/\#|\?/)[0]; 
                downloadName += `.${ext}`;
            }
            
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            
            window.URL.revokeObjectURL(blobUrl);
            Swal.close();
        } catch (e) {
            console.error('Download error, falling back to new tab:', e);
            // Fallback just in case of strict CORS blocking fetch
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            a.remove();
            Swal.close();
        }
    };


    // --- 8. POLICY VALIDATION & APPROVAL LOGIC ---
    window.confirmUpdateStatus = async (appId, newStatus, actionName) => {
        if (newStatus === 'Approved') {
            await processApprovalWithPolicyValidation(appId);
        } else {
            // Standard Confirmation for Rejections
            const result = await Swal.fire({
                title: `Confirm ${actionName}`,
                text: `Are you sure you want to ${actionName.toLowerCase()} this applicant?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: `Yes, ${actionName}!`
            });

            if (result.isConfirmed) {
                const targetApp = currentApplications.find(a => a.id === appId);
                await logSystemAction(`Applicant ${newStatus}`, `Applicant evaluation updated to ${newStatus}.`, targetApp?.student_id);
                await updateStatus(appId, newStatus);
            }
        }
    };

    async function processApprovalWithPolicyValidation(appId) {
        Swal.fire({ 
            title: 'Validating Policies...', 
            text: 'Checking institution limits and combination rules.',
            allowOutsideClick: false, 
            didOpen: () => { Swal.showLoading(); } 
        });

        try {
            const targetApp = currentApplications.find(a => a.id === appId);
            if (!targetApp) throw new Error("Applicant not found locally.");

            // Fetch institution policies
            const { data: policies, error: policyError } = await window.supabaseClient
                .from('school_policies')
                .select('*')
                .eq('school_id', currentAdminSchoolId)
                .single();

            // Fetch the applicant's existing approved applications to cross-reference
            const { data: activeApps, error: activeError } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships(title, category)')
                .eq('student_id', targetApp.student_id)
                .in('status', ['Approved', 'Grantee']);

            if (activeError) throw activeError;

            let violation = null;
            let activeCount = activeApps ? activeApps.length : 0;
            let targetCat = activeScholarshipData.category || 'Institution-Funded Educational Assistance';
            let catCount = activeApps ? activeApps.filter(a => a.scholarships?.category === targetCat).length : 0;
            
            let activeListHTML = activeApps && activeCount > 0 
                ? activeApps.map(a => `<li style="margin-bottom: 4px;"><strong>${a.scholarships?.title}</strong> (${a.scholarships?.category})</li>`).join('') 
                : '<li>No active assistance programs.</li>';

            // Check against policies
            if (policies && policies.global_enabled) {
                // Global Limit Check
                if (policies.global_limit > 0 && activeCount >= policies.global_limit) {
                    violation = "Approving this applicant will exceed the maximum number of active educational assistance programs allowed by the institution.";
                }

                // Category Limit Check
                if (!violation && policies.category_limits && policies.category_limits[targetCat] && !policies.category_limits[targetCat].unlimited) {
                    if (catCount >= policies.category_limits[targetCat].limit) {
                        violation = `Approving this applicant will exceed the active limit for the ${targetCat} category.`;
                    }
                }

                // Combination Rules Check
                if (!violation && policies.combination_rules) {
                    for (let sa of (activeApps || [])) {
                        let activeCat = sa.scholarships?.category;
                        if (activeCat && activeCat !== targetCat) {
                            let comboKey = `${activeCat}::${targetCat}`;
                            let comboKeyReverse = `${targetCat}::${activeCat}`;
                            if (policies.combination_rules[comboKey] === false || policies.combination_rules[comboKeyReverse] === false) {
                                violation = `Institutional policy does not allow combining ${activeCat} with ${targetCat}.`;
                                break;
                            }
                        }
                    }
                }
            }

            if (violation) {
                const canOverride = ['admin', 'coordinator'].includes(currentAdminRole);
                
                const result = await Swal.fire({
                    title: 'Policy Violation Detected',
                    html: `
                        <div style="text-align: left; font-size: 14px; background: #fee2e2; padding: 15px; border-radius: 8px; color: #991b1b; margin-bottom: 15px;">
                            <strong><i class="fa-solid fa-triangle-exclamation"></i> Warning:</strong> ${violation}
                        </div>
                        <div style="text-align: left; font-size: 13px;">
                            <p style="margin-bottom: 8px;"><strong>Current Active Records (${activeCount}):</strong></p>
                            <ul style="padding-left: 20px; color: #475569;">${activeListHTML}</ul>
                            <p style="margin-top: 12px;"><strong>Category Focus (${targetCat}):</strong> ${catCount} active</p>
                        </div>
                        ${!canOverride ? '<p style="color:#ef4444; font-size:13px; font-weight:bold; margin-top:15px;"><i class="fa-solid fa-ban"></i> Staff users are not allowed to override policy restrictions.</p>' : ''}
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    showConfirmButton: canOverride,
                    confirmButtonText: 'Override and Approve',
                    cancelButtonText: 'Cancel Approval',
                    confirmButtonColor: '#f59e0b'
                });

                if (result.isConfirmed && canOverride) {
                    await logSystemAction('Policy Override Approval', `Admin overrode policy: [${violation}] for Application ID: ${appId}`, targetApp.student_id);
                    await updateStatus(appId, 'Approved');
                }
            } else {
                // No policies violated, confirm standard approval
                const result = await Swal.fire({
                    title: `Confirm Approval`,
                    text: `Are you sure you want to approve this applicant? No institution policies are violated.`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#94a3b8',
                    confirmButtonText: `Yes, Approve!`
                });

                if (result.isConfirmed) {
                    await logSystemAction('Standard Approval', `Approved application ID: ${appId} normally.`, targetApp.student_id);
                    await updateStatus(appId, 'Approved');
                }
            }

        } catch (error) {
            console.error("Policy evaluation error:", error);
            Swal.fire('Error', 'Failed to evaluate assistance policies. Please try again.', 'error');
        }
    }

    window.updateStatus = async (appId, newStatus) => {
        try {
            Swal.fire({
                title: 'Processing...',
                text: 'Updating applicant status.',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            const targetApp = currentApplications.find(a => a.id === appId);
            if (!targetApp) throw new Error("Applicant not found locally.");

            const updatePayload = { status: newStatus };

            const { error: updateError } = await window.supabaseClient
                .from('applications')
                .update(updatePayload)
                .eq('id', appId);

            if (updateError) throw updateError;
            
            const schName = targetApp.scholarships ? targetApp.scholarships.title : 'the educational assistance program';
            
            // Dynamic Notification Messaging based on evaluation
            let notifTitle = `Application Update`;
            let notifMsg = `Your application for ${schName} has been updated to ${newStatus}.`;
            
            if (newStatus === 'Approved') {
                notifTitle = 'Application Approved';
                notifMsg = `Your application for ${schName} has been approved.`;
            } else if (newStatus === 'Declined' || newStatus === 'Rejected') {
                notifTitle = 'Application Rejected';
                notifMsg = `We regret to inform you that your application for the ${schName} has been rejected.`;
            }

            const payload = {
                userIds: [targetApp.student_id],
                eventType: 'applications',
                subject: notifTitle,
                message: notifMsg,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: ${newStatus === 'Approved' ? '#10b981' : '#ef4444'};">${notifTitle}</h2>
                        <p>${notifMsg}</p>
                        <p>Log in to your student dashboard for more information.</p>
                    </div>
                `
            };

            await fetch('https://grantee-backend-n5f4.onrender.com/api/dispatch-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(e => console.error("Notification dispatch failed:", e));

            // Notify Coordinators of Final Decision or Pending Review
            if (currentAdminSchoolId) {
                if (newStatus === 'Approved' || newStatus === 'Declined' || newStatus === 'Rejected') {
                    const decisionStr = newStatus === 'Approved' ? 'Approved' : 'Rejected';
                    const studentName = targetApp.profiles ? `${targetApp.profiles.first_name || ''} ${targetApp.profiles.last_name || ''}`.trim() : 'A student';
                    
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'DECISION_MADE',
                            subject: 'Application Decision Reached',
                            message: `Decision reached on ${studentName}'s application (Status: ${decisionStr})`,
                            resourceId: appId
                        })
                    }).catch(e => console.error("Coordinator notification failed:", e));
                    
                    if (newStatus === 'Approved' && targetApp.scholarships && targetApp.scholarships.slots) {
                        const { count: currentApprovedCount } = await window.supabaseClient
                            .from('applications')
                            .select('id', { count: 'exact', head: true })
                            .eq('scholarship_id', targetApp.scholarship_id)
                            .eq('status', 'Approved');
                            
                        if (currentApprovedCount >= targetApp.scholarships.slots) {
                            await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    schoolId: currentAdminSchoolId,
                                    eventType: 'SLOT_LIMIT_REACHED',
                                    subject: 'Slot Limit Reached',
                                    message: `The maximum slot limit (${targetApp.scholarships.slots}) for ${targetApp.scholarships.title} has been reached.`,
                                    resourceId: targetApp.scholarship_id
                                })
                            }).catch(e => console.error("Slot limit notification failed:", e));
                        }
                    }
                } else if (newStatus === 'Pending' || newStatus === 'Under Review' || newStatus === 'Pending Review') {
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'PENDING_REVIEW_REMINDER',
                            subject: 'Application Requires Action',
                            message: `An application for ${schName} has been marked as ${newStatus} and requires review.`,
                            resourceId: appId
                        })
                    }).catch(e => console.error("Pending review notification failed:", e));
                }
            }

            await Swal.fire('Success!', `Applicant successfully ${newStatus === 'Approved' ? 'Approved' : 'Rejected'}.`, 'success');
            loadApplicationsForActiveTab();

        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Failed to update status.', 'error');
        }
    };

    window.deleteApplication = async (appId) => {
        const result = await Swal.fire({
            title: 'Delete Application?',
            text: "Are you sure you want to permanently delete this application? This cannot be undone.",
            icon: 'error',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Yes, delete it!'
        });

        if(result.isConfirmed) {
            try {
                Swal.fire({
                    title: 'Deleting...',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                const { error } = await window.supabaseClient
                    .from('applications')
                    .delete()
                    .eq('id', appId);

                if (error) throw error;
                
                await logSystemAction('Deleted Application', `Deleted application ID: ${appId}`);
                await Swal.fire('Deleted!', 'The application has been deleted.', 'success');
                loadApplicationsForActiveTab();
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Failed to delete application.', 'error');
            }
        }
    };

    window.viewApplicantDetails = (appId) => {
        activeIndividualAppId = appId;
        switchTab('Individual');
    };

    // --- 9. EXPORT OPTIONS (CSV AND PDF) ---
    window.exportByStatus = async (targetStatus) => {
        const appsToExport = currentApplications.filter(app => {
            const normalizedStatus = normalizeApplicantStatus(app.status);
            if (targetStatus === 'Pending') return normalizedStatus === 'pending' || normalizedStatus === 'under review';
            if (targetStatus === 'Approved') return normalizedStatus === 'approved';
            return normalizedStatus === targetStatus.toLowerCase();
        });

        if (appsToExport.length === 0) {
            Swal.fire('Empty', `No data to export for ${targetStatus} applicants.`, 'info'); 
            return;
        }

        // New Selection Modal
        const { value: format } = await Swal.fire({
            title: `Export ${targetStatus} Applicants`,
            text: `Select the desired file format for exporting ${appsToExport.length} records:`,
            icon: 'question',
            input: 'select',
            inputOptions: {
                'csv': 'CSV Excel (.csv)',
                'pdf': 'PDF Document (.pdf)'
            },
            inputPlaceholder: 'Select an export format',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            confirmButtonText: 'Export'
        });

        if (!format) return;

        if (format === 'csv') {
            exportToCSV(appsToExport, targetStatus);
        } else if (format === 'pdf') {
            exportToPDF(appsToExport, targetStatus);
        }
    };

    function exportToCSV(appsToExport, targetStatus) {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Base profile headers
        csvContent += "Student ID,Last Name,First Name,Middle Name,Email,Contact Number,Program,Year Level,Evaluation Status,Date Applied";
        
        // Dynamic Question Headers
        const schema = activeScholarshipData?.form_fields || activeScholarshipData?.form_schema || [];
        const questionFields = schema.filter(f => f.type !== 'heading' && f.type !== 'text');
        
        questionFields.forEach(q => {
            let cleanLabel = (q.label || '').replace(/<[^>]*>?/gm, '').replace(/,/g, '');
            csvContent += `,"Q: ${cleanLabel}"`; 
        });
        csvContent += "\r\n";

        // Rows
        appsToExport.forEach(app => {
            const sid = app.profiles?.id_number || '';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const email = app.profiles?.email || '';
            const contact = app.profiles?.contact_number || '';
            const program = app.profiles?.program || '';
            const yearLevel = app.profiles?.year_level || '';
            const profileFormats = activeScholarshipData?.auto_collected_formats || {};
            const formattedProgram = formatText(program, profileFormats['Program']);
            const formattedYearLevel = formatText(yearLevel, profileFormats['Year Level']);
            
            const status = getDisplayStatus(app.status);
            const date = new Date(app.created_at).toLocaleDateString();

            let row = `"${sanitizeCsvValue(sid)}","${sanitizeCsvValue(lname)}","${sanitizeCsvValue(fname)}","${sanitizeCsvValue(mname)}","${sanitizeCsvValue(email)}","${sanitizeCsvValue(contact)}","${sanitizeCsvValue(formattedProgram)}","${sanitizeCsvValue(formattedYearLevel)}","${sanitizeCsvValue(status)}","${sanitizeCsvValue(date)}"`;
            
            questionFields.forEach(q => {
                const rawAnswer = app.form_responses && Object.prototype.hasOwnProperty.call(app.form_responses, q.label)
                    ? app.form_responses[q.label]
                    : '';
                const answer = sanitizeCsvValue(renderFormattedAnswer(rawAnswer, q));
                row += `,"${answer}"`;
            });

            csvContent += row + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${targetStatus}_Applicants_Export_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportToPDF(appsToExport, targetStatus) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            Swal.fire('Missing Library', 'jsPDF is required to export to PDF. Please ensure jsPDF and jsPDF-AutoTable are linked in your HTML.', 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'pt', 'a4');

        doc.setFontSize(16);
        doc.text(`${targetStatus} Applicants - ${activeScholarshipData.title}`, 40, 40);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 55);

        const tableColumn = ["Student ID", "Full Name", "Program & Year", "Contact", "Email", "Date Applied"];
        const tableRows = [];

        appsToExport.forEach(app => {
            const sid = app.profiles?.id_number || 'N/A';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const fullName = `${lname}, ${fname} ${mname}`.trim();
            const program = app.profiles?.program || 'N/A';
            const yearLevel = app.profiles?.year_level || 'N/A';
            const progYear = `${program}\n(${yearLevel})`;
            const contact = app.profiles?.contact_number || 'N/A';
            const email = app.profiles?.email || 'N/A';
            const date = new Date(app.created_at).toLocaleDateString();

            tableRows.push([sid, fullName, progYear, contact, email, date]);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 70,
            styles: { fontSize: 8, cellPadding: 4 },
            headStyles: { fillColor: [59, 130, 246] },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        doc.save(`${targetStatus}_Applicants_Export_${new Date().getTime()}.pdf`);
    }

    window.exportPendingList = () => exportByStatus('Pending');
    window.exportApprovedList = () => exportByStatus('Approved');
    window.exportGranteeList = window.exportApprovedList;

    // INIT
    loadProfile();
});