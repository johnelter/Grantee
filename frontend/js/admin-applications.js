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
    let activeScholarshipId = null;
    let activeTabStatus = 'Pending';
    let activeIndividualAppId = null; 
    let currentAdminSchoolId = null;

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
        const icons = ['🎓', '📖', '👥', '🥇', '💻', '🌍'];
        const colors = ['#dcfce7', '#e0e7ff', '#f3e8ff', '#fef3c7', '#fee2e2'];

        if (allScholarships.length === 0) {
            cardsContainer.innerHTML = '<div class="empty-state">No educational assistance programs created yet.</div>';
            return;
        }

        allScholarships.forEach((sch, i) => {
            const icon = icons[i % icons.length];
            const bg = colors[i % colors.length];
            
            const pendingCount = sch.applications.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
            const granteeCount = sch.applications.filter(a => a.status === 'Grantee').length;

            const card = document.createElement('div');
            card.className = 'data-panel';
            card.style.cursor = 'pointer';
            card.style.transition = '0.2s';
            card.onmouseover = () => card.style.transform = 'translateY(-3px)';
            card.onmouseout = () => card.style.transform = 'translateY(0)';
            card.onclick = () => openScholarship(sch.id, sch.title);
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
                    <div style="background:${bg}; width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px;">${icon}</div>
                    <span style="color:#cbd5e1; font-weight:bold;">&rarr;</span>
                </div>
                <h3 style="font-size:16px; margin-bottom:8px; color:var(--text-main);">${sch.title}</h3>
                <p style="font-size:13px; color:var(--text-muted); margin-bottom:20px;">${sch.description ? sch.description.substring(0, 80) + '...' : 'No description provided.'}</p>
                
                <div style="display:flex; justify-content:space-between; border-top:1px solid var(--border-dark); padding-top:15px;">
                    <div>
                        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block;">Pending Evaluation</span>
                        <span style="color:#0f172a; font-size:18px; font-weight:800;">${pendingCount}</span>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block;">Selected Grantees</span>
                        <span style="color:#10b981; font-size:18px; font-weight:800;">${granteeCount}</span>
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
        });
    }

    // --- 5. VIEW APPLICANTS FOR A PROGRAM ---
    window.openScholarship = async (id, title) => {
        activeScholarshipId = id;
        document.getElementById('active-sch-title').innerText = title;
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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Loading applicants...</td></tr>`;
        }
        
        try {
            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, middle_name, last_name, id_number, email, contact_number, date_of_birth, gender, address, program, year_level ), scholarships (title)')
                .eq('scholarship_id', activeScholarshipId)
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
        
        // FIX: Match the button based on its exact onclick attribute instead of visible text
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('onclick').includes(`'${status}'`)) {
                btn.classList.add('active');
            }
        });

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
            // FIX: Make status matching strictly case-insensitive and ignore accidental spaces
            const currentAppStatus = (app.status || '').trim().toLowerCase();
            const targetStatus = activeTabStatus.toLowerCase();

            const matchStatus = activeTabStatus === 'Pending' 
                ? (currentAppStatus === 'pending' || currentAppStatus === 'under review')
                : currentAppStatus === targetStatus;
            
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
            // ... (The rest of the code remains identical)
            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const name = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '');
            
            const studentId = app.profiles?.id_number || 'N/A';
            const email = app.profiles?.email || 'N/A';
            
            let statusClass = 'badge-review';
            if(app.status === 'Grantee') statusClass = 'badge-approved'; 
            if(app.status === 'Declined') statusClass = 'badge-rejected';

            let actionsHtml = '';
            if (activeTabStatus === 'Pending') {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-approve" onclick="updateStatus('${app.id}', 'Grantee')">Approve</button>
                        <button class="btn-reject" onclick="updateStatus('${app.id}', 'Declined')">Decline</button>
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')">View Responses</button>
                    </div>
                `;
            } else if (activeTabStatus === 'Grantee') {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-reject" onclick="updateStatus('${app.id}', 'Rejected')">Reject</button>
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')">View Responses</button>
                    </div>
                `;
            } else { // Declined
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-approve" onclick="updateStatus('${app.id}', 'Grantee')">Approve</button>
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')">View Responses</button>
                        <button class="btn-remove" style="background:#fee2e2; color:#ef4444; border:1px solid #ef4444;" onclick="deleteApplication('${app.id}')">Delete</button>
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
                <td><span class="badge-status ${statusClass}">${app.status}</span></td>
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

            const opt = document.createElement('option');
            opt.value = app.id;
            opt.text = `${name} - ${app.profiles?.id_number || ''} (${app.status})`;
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
        
        if (btnApprove) btnApprove.innerText = 'Approve';
        if (btnReject) btnReject.innerText = 'Reject';

        if (app.status === 'Pending' || app.status === 'Under Review') {
            if(btnApprove) { btnApprove.style.display = 'inline-block'; btnApprove.onclick = () => updateStatus(app.id, 'Grantee'); }
            if(btnReject) { btnReject.style.display = 'inline-block'; btnReject.onclick = () => updateStatus(app.id, 'Rejected'); }
        } else if (app.status === 'Grantee') {
            if(btnApprove) btnApprove.style.display = 'none'; 
            if(btnReject) { btnReject.style.display = 'inline-block'; btnReject.onclick = () => updateStatus(app.id, 'Rejected'); }
        } else { // Declined
            if(btnApprove) { btnApprove.style.display = 'inline-block'; btnApprove.onclick = () => updateStatus(app.id, 'Grantee'); }
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
        
        let html = `
            <div style="background:#fff; border:1px solid var(--border-dark); border-top: 8px solid #3b82f6; border-radius:12px; padding:24px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <h2 style="font-size: 20px; margin-top:0; margin-bottom: 16px; color: #0f172a;">Applicant Profile</h2>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="font-size: 14px; color: #0f172a;"><strong>Student ID:</strong> <span style="color:#475569">${sid}</span></div>
                    <div style="font-size: 14px; color: #0f172a;"><strong>Email:</strong> <span style="color:#475569">${email}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a; grid-column: 1 / -1;"><strong>Full Name:</strong> <span style="color:#475569">${name}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a;"><strong>Date of Birth:</strong> <span style="color:#475569">${dob}</span></div>
                    <div style="font-size: 14px; color: #0f172a;"><strong>Gender:</strong> <span style="color:#475569">${gender}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a; grid-column: 1 / -1;"><strong>Contact Number:</strong> <span style="color:#475569">${contact}</span></div>
                    <div style="font-size: 14px; color: #0f172a; grid-column: 1 / -1;"><strong>Address:</strong> <span style="color:#475569">${address}</span></div>
                    
                    <div style="font-size: 14px; color: #0f172a;"><strong>Program:</strong> <span style="color:#475569">${program}</span></div>
                    <div style="font-size: 14px; color: #0f172a;"><strong>Year Level:</strong> <span style="color:#475569">${yearLevel}</span></div>
                </div>

                <hr style="border: 0; height: 1px; background: #e2e8f0; margin: 20px 0;">

                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Evaluation Status:</strong> <span style="color:${app.status === 'Grantee' ? '#166534' : (app.status === 'Rejected' ? '#991b1b' : '#b45309')}">${app.status}</span></div>
                <div style="font-size: 14px; color: #0f172a;"><strong>Applied On:</strong> <span style="color:#475569">${date}</span></div>
            </div>
        `;

        // 1. Applicant Responses
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            html += `<h3 style="font-size:16px; color:var(--text-main); margin-bottom:15px; margin-top:30px;">Applicant Responses</h3>`;
            for (const [q, a] of Object.entries(app.form_responses)) {
                html += `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left: 4px solid var(--primary-color); border-radius:6px; padding:16px; margin-bottom:15px;">
                        <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#1e293b;">${q}</div>
                        <div style="font-size:14px; color:#475569;">${a || '<span style="font-style:italic;">No response provided</span>'}</div>
                    </div>
                `;
            }
        }

        // 2. Extracted Documents
        if (app.documents && app.documents.length > 0) {
            html += `<h3 style="font-size:16px; color:var(--text-main); margin-bottom:15px; margin-top:30px;">Submitted Documents & AI Data</h3>`;
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';
                
                const fullViewLink = fileUrl 
                    ? `<a href="${fileUrl}" target="_blank" style="font-size:13px; color:#3b82f6; text-decoration:none; font-weight:600; display:flex; align-items:center; gap:4px;">Full View</a>` 
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
                                <strong style="color:#0f172a; font-size:14px;">AI Extracted Information</strong>
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
                                ${doc.name} 
                                <span style="font-size:10px; font-weight:bold; color:#166534; background:#dcfce7; padding:4px 8px; border-radius:4px; margin-left:8px;">${doc.status || 'Attached'}</span>
                            </div>
                            ${fullViewLink}
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


    // --- 8. DATA UPDATES & NOTIFICATIONS ---
    window.updateStatus = async (appId, newStatus) => {
        try {
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
            
            if (newStatus === 'Grantee') {
                notifTitle = `Congratulations! You are a Grantee`;
                notifMsg = `You have been selected as a grantee for the ${schName}!`;
            } else if (newStatus === 'Declined') {
                notifTitle = `Application Declined`;
                notifMsg = `We regret to inform you that your application for the ${schName} has been declined.`;
            }

            const { error: notifError } = await window.supabaseClient
                .from('notifications')
                .insert([{
                    user_id: targetApp.student_id, 
                    title: notifTitle,
                    message: notifMsg,
                    is_read: false
                }]);

            if (notifError) console.error("Notification trigger failed:", notifError);

            loadApplicationsForActiveTab();

        } catch (err) {
            console.error(err);
            alert("Failed to update status.");
        }
    };

    window.deleteApplication = async (appId) => {
        if(confirm("Are you sure you want to permanently delete this application? This cannot be undone.")) {
            try {
                const { error } = await window.supabaseClient
                    .from('applications')
                    .delete()
                    .eq('id', appId);

                if (error) throw error;
                
                loadApplicationsForActiveTab();
            } catch (err) {
                console.error(err);
                alert("Failed to delete application.");
            }
        }
    };

    window.viewApplicantDetails = (appId) => {
        activeIndividualAppId = appId;
        switchTab('Individual');
    };


    // --- 9. EXPORT TO EXCEL ---
    window.exportByStatus = (targetStatus) => {
        const appsToExport = currentApplications.filter(app => {
            if (targetStatus === 'Pending') return app.status === 'Pending' || app.status === 'Under Review';
            return app.status === targetStatus;
        });

        if (appsToExport.length === 0) {
            alert(`No data to export for ${targetStatus} applicants.`); return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student ID,Last Name,First Name,Middle Name,Email,Contact Number,Program,Year Level,Evaluation Status,Date Applied";
        
        let allQuestions = new Set();
        appsToExport.forEach(app => {
            if(app.form_responses) Object.keys(app.form_responses).forEach(q => allQuestions.add(q));
        });
        
        allQuestions.forEach(q => { csvContent += `,"Q: ${q.replace(/,/g, '')}"`; });
        csvContent += "\r\n";

        appsToExport.forEach(app => {
            const sid = app.profiles?.id_number || '';
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            const email = app.profiles?.email || '';
            const contact = app.profiles?.contact_number || '';
            const program = app.profiles?.program || '';
            const yearLevel = app.profiles?.year_level || '';
            const status = app.status || '';
            const date = new Date(app.created_at).toLocaleDateString();

            let row = `"${sid}","${lname}","${fname}","${mname}","${email}","${contact}","${program}","${yearLevel}","${status}","${date}"`;
            
            allQuestions.forEach(q => {
                const answer = app.form_responses && app.form_responses[q] ? app.form_responses[q].replace(/,/g, ';').replace(/\n/g, ' ') : '';
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
    };

    window.exportPendingList = () => exportByStatus('Pending');
    window.exportGranteeList = () => exportByStatus('Grantee');

    // INIT
    loadProfile();
});