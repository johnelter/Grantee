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
    let targetRemoveAppId = null;
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
                // Ensure only admins can access this page
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }

                currentAdminSchoolId = profile.school_id;

                // Update Header Name & Avatar
                const firstName = profile.first_name || 'Admin';
                const lastName = profile.last_name || '';
                
                if (document.getElementById('header-name')) {
                    document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                }
                
                if (profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }

                // Initialize fetching only after we have the school ID
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

    // Logout Modal
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

    // --- 4. FETCH SCHOLARSHIPS (ISOLATED BY SCHOOL) ---
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
            cardsContainer.innerHTML = '<div class="empty-state">No scholarships created yet. Please go to the Scholarships tab to add one.</div>';
            return;
        }

        allScholarships.forEach((sch, i) => {
            const icon = icons[i % icons.length];
            const bg = colors[i % colors.length];
            
            const pendingCount = sch.applications.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
            const passedCount = sch.applications.filter(a => a.status === 'Passed').length;

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
                        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block;">Pending</span>
                        <span style="color:#0f172a; font-size:18px; font-weight:800;">${pendingCount}</span>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block;">Passed</span>
                        <span style="color:#10b981; font-size:18px; font-weight:800;">${passedCount}</span>
                    </div>
                </div>
            `;
            cardsContainer.appendChild(card);
        });
    }

    // --- 5. VIEW APPLICANTS FOR A SCHOLARSHIP ---
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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Loading applications...</td></tr>`;
        }
        
        try {
            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, profiles ( first_name, middle_name, last_name, id_number, email, contact_number ), scholarships (title)')
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
            if(activeTabStatus !== 'Individual') tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444; text-align:center; padding:40px;">Failed to load applicants.</td></tr>`;
        }
    }

    window.switchTab = (status) => {
        activeTabStatus = status;
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if(btn.innerText.includes(status)) btn.classList.add('active');
        });

        const tableView = document.getElementById('table-view-container');
        const indivView = document.getElementById('individual-view-container');
        const badge = document.getElementById('main-status-badge');

        if (status === 'Individual') {
            tableView.style.display = 'none';
            indivView.style.display = 'block';
            badge.innerText = 'Individual Review';
            badge.className = 'badge-status';
            badge.style.background = '#e0e7ff';
            badge.style.color = '#3730a3';
        } else {
            tableView.style.display = 'block';
            indivView.style.display = 'none';
            if(status === 'Pending') { badge.innerText = 'Pending Applications'; badge.className = 'badge-status badge-review'; }
            if(status === 'Confirmed') { badge.innerText = 'Confirmed Applicants'; badge.className = 'badge-status badge-approved'; }
            if(status === 'Passed') { badge.innerText = 'Passed Applicants'; badge.className = 'badge-status'; badge.style.background = '#dcfce7'; badge.style.color = '#166534'; }
            if(status === 'Rejected') { badge.innerText = 'Rejected Applicants'; badge.className = 'badge-status badge-rejected'; }
        }

        loadApplicationsForActiveTab();
    };

    // --- 6. TABLE WITH SORTING ---
    window.filterTable = () => {
        const searchTerm = document.getElementById('search-applicant').value.toLowerCase();
        const sortSelect = document.getElementById('sort-date-select');
        const sortOrder = sortSelect ? sortSelect.value : 'desc';
        
        let filteredApps = currentApplications.filter(app => {
            const matchStatus = activeTabStatus === 'Pending' 
                ? (app.status === 'Pending' || app.status === 'Under Review')
                : app.status === activeTabStatus;
            
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
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + 
                            dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            
            const fname = app.profiles?.first_name || '';
            const mname = app.profiles?.middle_name || '';
            const lname = app.profiles?.last_name || '';
            
            // Format: Last Name, First Name, Middle Name
            const name = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '');
            
            const studentId = app.profiles?.id_number || 'N/A';
            const email = app.profiles?.email || 'N/A';
            
            let statusClass = 'badge-review';
            if(app.status === 'Confirmed') statusClass = 'badge-approved';
            if(app.status === 'Passed') { statusClass = 'badge-approved'; } // Styling logic overlap
            if(app.status === 'Rejected') statusClass = 'badge-rejected';

            let actionsHtml = '';
            if (activeTabStatus === 'Pending') {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-approve" onclick="updateStatus('${app.id}', 'Confirmed')">✓ Confirm App</button>
                        <button class="btn-reject" onclick="openRemoveModal('${app.id}')">✕ Reject</button>
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')">👁️ View</button>
                    </div>
                `;
            } else if (activeTabStatus === 'Confirmed') {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-approve" style="background:#10b981;" onclick="updateStatus('${app.id}', 'Passed')">🏆 Passed</button>
                        <button class="btn-reject" onclick="openRemoveModal('${app.id}')">✕ Reject</button>
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')">👁️ View</button>
                    </div>
                `;
            } else {
                actionsHtml = `
                    <div style="display:flex; gap:8px;">
                        <button class="btn-outline" style="padding:6px 12px; font-size:13px;" onclick="viewApplicantDetails('${app.id}')">👁️ View</button>
                        <button class="btn-remove" onclick="openRemoveModal('${app.id}')">🗑️ Remove</button>
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

    // --- 7. INDIVIDUAL GOOGLE FORMS VIEW ---
    window.initIndividualView = () => {
        const select = document.getElementById('individual-applicant-select');
        select.innerHTML = '';
        
        if (currentApplications.length === 0) {
            select.innerHTML = '<option value="">No applicants found</option>';
            document.getElementById('gform-content').innerHTML = '<div style="text-align:center; padding:40px; color:#64748b;">No applications available for this scholarship.</div>';
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
        
        // Dynamically assign buttons in the individual view based on status
        const btnApprove = document.getElementById('indiv-btn-approve');
        if (btnApprove) {
            if (app.status === 'Pending' || app.status === 'Under Review') {
                btnApprove.innerText = '✓ Confirm App';
                btnApprove.onclick = () => updateStatus(app.id, 'Confirmed');
                btnApprove.style.display = 'inline-block';
            } else if (app.status === 'Confirmed') {
                btnApprove.innerText = '🏆 Mark as Passed';
                btnApprove.onclick = () => updateStatus(app.id, 'Passed');
                btnApprove.style.display = 'inline-block';
            } else {
                btnApprove.style.display = 'none'; // Hide if already passed or rejected
            }
        }
        
        document.getElementById('indiv-btn-reject').onclick = () => updateStatus(app.id, 'Rejected');
        document.getElementById('indiv-btn-remove').onclick = () => openRemoveModal(app.id);

        const gformContent = document.getElementById('gform-content');
        
        const fname = app.profiles?.first_name || '';
        const mname = app.profiles?.middle_name || '';
        const lname = app.profiles?.last_name || '';
        const name = `${lname}, ${fname} ${mname}`.trim().replace(/,\s*$/, '');
        
        const sid = app.profiles?.id_number || 'N/A';
        const email = app.profiles?.email || 'N/A';
        const contact = app.profiles?.contact_number || 'N/A';
        const date = new Date(app.created_at).toLocaleString();
        
        let html = `
            <div style="background:#fff; border:1px solid var(--border-dark); border-top: 8px solid #10b981; border-radius:12px; padding:24px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <h2 style="font-size: 24px; margin-top:0; margin-bottom: 16px; color: #0f172a;">Applicant Profile</h2>
                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Name:</strong> <span style="color:#475569">${name}</span></div>
                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Student ID:</strong> <span style="color:#475569">${sid}</span></div>
                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Email:</strong> <span style="color:#475569">${email}</span></div>
                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Contact Number:</strong> <span style="color:#475569">${contact}</span></div>
                <div style="font-size: 14px; color: #0f172a; margin-bottom: 12px;"><strong>Status:</strong> <span style="color:${app.status === 'Confirmed' || app.status === 'Passed' ? '#166534' : (app.status === 'Rejected' ? '#991b1b' : '#b45309')}">${app.status}</span></div>
                <div style="font-size: 14px; color: #0f172a;"><strong>Submitted:</strong> <span style="color:#475569">${date}</span></div>
            </div>
        `;

        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            for (const [q, a] of Object.entries(app.form_responses)) {
                html += `
                    <div style="background:#fff; border:1px solid var(--border-dark); border-radius:12px; padding:24px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="font-weight:600; font-size:15px; margin-bottom:12px;">${q}</div>
                        <div style="font-size:14px; color:#475569;">${a || '<span style="font-style:italic;">No answer provided</span>'}</div>
                    </div>
                `;
            }
        }

        if (app.documents && app.documents.length > 0) {
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';
                
                const fullViewLink = fileUrl 
                    ? `<a href="${fileUrl}" target="_blank" style="font-size:13px; color:#3b82f6; text-decoration:none; font-weight:600; display:flex; align-items:center; gap:4px;">↗ Full View</a>` 
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
                            <span style="font-size: 32px; display:block; margin-bottom: 12px;">⚠️</span>
                            <strong style="display:block; margin-bottom:4px;">File not available</strong>
                        </div>`;
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
                        <div style="border: 1px solid var(--border-dark); border-radius: 8px; overflow: hidden; background:#f8fafc;">
                            ${previewContent}
                        </div>
                    </div>
                `;
            });
        }
        
        gformContent.innerHTML = html;
    };


    // --- 8. DATA UPDATES, NOTIFICATIONS & MODALS ---
    window.updateStatus = async (appId, newStatus, reason = null) => {
        try {
            const targetApp = currentApplications.find(a => a.id === appId);
            if (!targetApp) throw new Error("Application not found locally.");

            const updatePayload = { status: newStatus };
            if (reason) updatePayload.remarks = reason;

            const { error: updateError } = await window.supabaseClient
                .from('applications')
                .update(updatePayload)
                .eq('id', appId);

            if (updateError) throw updateError;
            
            const schName = targetApp.scholarships ? targetApp.scholarships.title : 'a scholarship';
            const { error: notifError } = await window.supabaseClient
                .from('notifications')
                .insert([{
                    user_id: targetApp.student_id, 
                    title: `Application ${newStatus}`,
                    message: `Your application for ${schName} has been marked as ${newStatus}.`,
                    is_read: false
                }]);

            if (notifError) console.error("Notification trigger failed:", notifError);

            loadApplicationsForActiveTab();

        } catch (err) {
            console.error(err);
            alert("Failed to update status.");
        }
    };

    window.openRemoveModal = (appId) => {
        targetRemoveAppId = appId;
        document.getElementById('modal-remove').style.display = 'flex';
    };

    window.closeModal = (id) => {
        document.getElementById(id).style.display = 'none';
    };

    window.toggleCustomReason = () => {
        const select = document.getElementById('remove-reason-select');
        const customArea = document.getElementById('remove-reason-custom');
        customArea.style.display = select.value === 'custom' ? 'block' : 'none';
    };

    window.confirmRemove = () => {
        const select = document.getElementById('remove-reason-select');
        let reason = select.value;
        if (reason === 'custom') {
            reason = document.getElementById('remove-reason-custom').value;
        }

        if(!reason) { alert("Please provide a reason."); return; }

        updateStatus(targetRemoveAppId, 'Rejected', reason);
        closeModal('modal-remove');
    };

    window.viewApplicantDetails = (appId) => {
        activeIndividualAppId = appId;
        switchTab('Individual');
    };


    // --- 9. EXPORT TO EXCEL ---
    
    // Helper function used by the specific export buttons
    window.exportByStatus = (targetStatus) => {
        const appsToExport = currentApplications.filter(app => {
            if (targetStatus === 'Pending') return app.status === 'Pending' || app.status === 'Under Review';
            return app.status === targetStatus;
        });

        if (appsToExport.length === 0) {
            alert(`No data to export for ${targetStatus} applicants.`); return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student ID,Last Name,First Name,Middle Name,Email,Contact Number,Status,Submission Date";
        
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
            const status = app.status || '';
            const date = new Date(app.created_at).toLocaleString();

            let row = `"${sid}","${lname}","${fname}","${mname}","${email}","${contact}","${status}","${date}"`;
            
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

    // Global hooks for the HTML buttons to call
    window.exportPendingList = () => exportByStatus('Pending');
    window.exportPassedList = () => exportByStatus('Passed');


    // --- 10. IMPORT PASSERS LOGIC (Excel / CSV) ---
    window.openOcrModal = () => { document.getElementById('modal-ocr').style.display = 'flex'; };

    document.getElementById('ocr-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        const modalBody = document.querySelector('#modal-ocr .modal-body');
        modalBody.innerHTML = `
            <div style="padding: 40px 0; text-align: center;">
                <h3 style="color:#3b82f6;">⚙️ Processing File...</h3>
                <p style="color:#64748b; font-size:13px;">Extracting Student IDs from ${file.name}</p>
            </div>
        `;

        try {
            let extractedIds = [];
            if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                jsonData.forEach(row => {
                    for (const key in row) {
                        if (key.toString().toLowerCase().includes('id') && row[key]) {
                            extractedIds.push(row[key].toString().trim());
                        }
                    }
                });
            } else {
                throw new Error("Unsupported file type. Please use .xlsx, .xls, or .csv");
            }

            if (extractedIds.length === 0) throw new Error("No valid Student IDs found in the document."); 

            let passedCount = 0;
            for (let id of extractedIds) {
                // Find applications that are Pending, Under Review, or Confirmed.
                const targetApp = currentApplications.find(a => 
                    a.profiles?.id_number === id && 
                    (a.status === 'Pending' || a.status === 'Under Review' || a.status === 'Confirmed')
                );

                if (targetApp) {
                    await window.updateStatus(targetApp.id, 'Passed', 'Auto-Passed via List Import');
                    passedCount++;
                }
            }

            modalBody.innerHTML = `
                <div style="padding: 40px 0; text-align: center;">
                    <h3 style="color:#10b981; font-size: 24px; margin-bottom: 10px;">✅ Success</h3>
                    <p style="color:#334155; font-size:15px; font-weight:bold;">Successfully marked ${passedCount} applicants as Passed.</p>
                    <button class="btn-outline" style="margin-top:20px;" onclick="closeModal('modal-ocr'); window.location.reload();">Close & Refresh</button>
                </div>
            `;
        } catch (err) {
            console.error(err);
            modalBody.innerHTML = `
                <div style="padding: 40px 0; text-align: center;">
                    <h3 style="color:#ef4444; font-size: 24px; margin-bottom: 10px;">❌ Error</h3>
                    <p style="color:#64748b; font-size:13px;">${err.message}</p>
                    <button class="btn-outline" style="margin-top:20px;" onclick="closeModal('modal-ocr'); window.location.reload();">Close</button>
                </div>
            `;
        }
    });

    // INIT
    loadProfile();
});