document.addEventListener('DOMContentLoaded', async () => {

    let applicationsData = [];
    let currentProfile = null; // Store student profile for the modal
    const tbody = document.getElementById('applications-tbody');

    // --- CUSTOM UI: ALERTS ---
    const injectCustomUIStyles = () => {
        if (document.getElementById('custom-ui-styles')) return;
        const style = document.createElement('style');
        style.id = 'custom-ui-styles';
        style.innerHTML = `
            .custom-toast { position: fixed; bottom: 30px; right: 30px; background: #fff; padding: 16px 24px; border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; z-index: 10000; transform: translateY(100px); opacity: 0; transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); font-size: 14px; font-weight: 500; color: #334155; border-left: 4px solid var(--primary-color); }
            .custom-toast.show { transform: translateY(0); opacity: 1; }
            .custom-toast.error { border-left-color: #ef4444; }
            .custom-toast.success { border-left-color: #10b981; }
            
            /* Scrollbar styling for extracted data box */
            .ai-data-box::-webkit-scrollbar { width: 6px; }
            .ai-data-box::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        `;
        document.head.appendChild(style);
    };

    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        
        // Updated to use FontAwesome Icons
        const icon = type === 'success' ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:18px;"></i>' : '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; font-size:18px;"></i>';
        
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    injectCustomUIStyles();

    // --- MAIN APPLICATION LOGIC ---
    const loadMyApplications = async () => {
        try {
            const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
            if (sessionError || !session) {
                window.location.href = 'login.html';
                return;
            }
            const studentId = session.user.id;

            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profileError || !profile) {
                window.location.href = 'login.html';
                return;
            }

            if (profile.role !== 'student') {
                window.location.href = 'admin-dashboard.html';
                return;
            }

            if (profile) {
                currentProfile = profile; // Save globally for the details modal
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                
                if(document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.program || profile.course || 'Student';
                if(profile.avatar_url && document.getElementById('header-avatar')) {
                    document.getElementById('header-avatar').src = profile.avatar_url;
                }
            }

            const { data: apps, error: fetchError } = await window.supabaseClient
                .from('applications')
                .select(`*, scholarships ( title )`)
                .eq('student_id', studentId)
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            applicationsData = apps || [];

            updateMetrics(applicationsData);
            renderTable(applicationsData);
            updateStatusTracker(applicationsData);

        } catch (error) {
            console.error("Error loading applications:", error);
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger-color);"><i class="fa-solid fa-triangle-exclamation"></i> Error loading data. Check console.</td></tr>`;
        }
    };

    const updateMetrics = (apps) => {
        const total = apps.length;
        const review = apps.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
        const approved = apps.filter(a => a.status === 'Approved' || a.status === 'Grantee').length;
        const rejected = apps.filter(a => a.status === 'Rejected' || a.status === 'Declined' || a.status === 'Revoked').length;

        if(document.getElementById('count-total')) document.getElementById('count-total').innerText = total;
        if(document.getElementById('count-review')) document.getElementById('count-review').innerText = review;
        if(document.getElementById('count-approved')) document.getElementById('count-approved').innerText = approved;
        if(document.getElementById('count-rejected')) document.getElementById('count-rejected').innerText = rejected;
    };

    const renderTable = (apps) => {
        if (!tbody) return;

        if (apps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-folder-open" style="font-size:24px; margin-bottom:10px; display:block;"></i> You have not submitted any applications yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';

        apps.forEach(app => {
            // FIX: Check for internal program title first, fallback to outside assistance name
            const programName = app.scholarships?.title || app.outside_assistance_name || 'Unknown Program';

            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            let badgeClass = 'badge-review';
            let progress = 50;
            let barColor = '#f59e0b';
            let displayStatus = 'Under Review';

            const statusLower = (app.status || 'pending').toLowerCase();

            if (statusLower === 'approved' || statusLower === 'grantee') {
                badgeClass = 'badge-approved';
                progress = 100;
                barColor = '#10b981'; // success green
                displayStatus = 'Approved';
            } else if (statusLower === 'revoked') {
                badgeClass = 'badge-rejected'; // using rejected badge styling for revoked
                progress = 100;
                barColor = '#ef4444'; // danger red
                displayStatus = 'Revoked';
            } else if (statusLower === 'rejected' || statusLower === 'declined') {
                badgeClass = 'badge-rejected';
                progress = 100;
                barColor = '#ef4444'; // danger red
                displayStatus = 'Rejected';
            } else {
                badgeClass = 'badge-review';
                progress = 50;
                barColor = '#f59e0b'; // warning yellow
                displayStatus = 'Under Review';
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong style="color: var(--text-main);">${programName}</strong>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Application ID: ${app.id.substring(0, 8).toUpperCase()}</div>
                </td>
                <td>
                    <div>${dateStr}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${timeStr}</div>
                </td>
                <td><span class="badge-status ${badgeClass}">${displayStatus}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="flex:1; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                            <div style="width: ${progress}%; background: ${barColor}; height:100%; border-radius:3px;"></div>
                        </div>
                        <span style="font-size:11px; font-weight:600; width:30px;">${progress}%</span>
                    </div>
                </td>
                <td>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-outline" style="padding: 6px 12px; font-size: 11px;" onclick="viewDetails('${app.id}')"><i class="fa-solid fa-eye"></i> View Details</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const updateStatusTracker = (apps) => {
        if (apps.length === 0) return;

        const latestApp = apps[0]; 
        
        // FIX: Also look for outside_assistance_name here
        const programName = latestApp.scholarships?.title || latestApp.outside_assistance_name || 'Program';
        const createdDate = new Date(latestApp.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

        if(document.getElementById('latest-app-title')) document.getElementById('latest-app-title').innerText = `(${programName})`;
        if(document.getElementById('date-submitted')) document.getElementById('date-submitted').innerText = createdDate;

        const statusLower = (latestApp.status || '').toLowerCase();

        const stepSub = document.getElementById('step-submitted');
        const stepRev = document.getElementById('step-review');
        const stepFinal = document.getElementById('step-final');

        const line1 = document.getElementById('line-1');
        const line2 = document.getElementById('line-2');

        if(!stepSub) return; 

        [stepSub, stepRev, stepFinal].forEach(el => { if(el) el.classList.remove('completed', 'active') });
        [line1, line2].forEach(el => { if(el) el.classList.remove('active') });

        // Step 1: Submitted (Always active if application exists)
        if(stepSub) stepSub.classList.add('active');
        
        if (statusLower === 'pending' || statusLower === 'under review') {
            if(line1) line1.classList.add('active');
            if(stepRev) stepRev.classList.add('active');
        }
        else if (statusLower === 'approved' || statusLower === 'rejected' || statusLower === 'grantee' || statusLower === 'declined' || statusLower === 'revoked') {
            if(stepRev) stepRev.classList.add('active');
            if(stepFinal) stepFinal.classList.add('active');
            if(line1) line1.classList.add('active');
            if(line2) line2.classList.add('active');
            
            const finalNode = document.getElementById('date-final');
            if(finalNode) finalNode.innerText = 'Determined';
        }
    };

    // --- MODAL: VIEW DETAILS (READ-ONLY) ---
    window.viewDetails = (appId) => {
        const app = applicationsData.find(a => a.id === appId);
        if (!app) return;

        const existingModal = document.getElementById('app-details-modal');
        if (existingModal) existingModal.remove();

        const statusColor = (app.status === 'Approved' || app.status === 'Grantee') ? '#166534' : ((app.status === 'Rejected' || app.status === 'Declined' || app.status === 'Revoked') ? '#991b1b' : '#b45309');
        const statusBg = (app.status === 'Approved' || app.status === 'Grantee') ? '#dcfce7' : ((app.status === 'Rejected' || app.status === 'Declined' || app.status === 'Revoked') ? '#fee2e2' : '#fef3c7');
        const displayStatus = (app.status === 'Pending' || app.status === 'Under Review') ? 'Under Review' : (app.status === 'Grantee' ? 'Approved' : (app.status === 'Declined' ? 'Rejected' : app.status));

        // FIX: Ensure the modal title reads outside programs properly
        const modalTitle = app.scholarships?.title || app.outside_assistance_name || 'Program Application';

        // 1. Applicant Profile
        const fname = currentProfile?.first_name || '';
        const mname = currentProfile?.middle_name || '';
        const lname = currentProfile?.last_name || '';
        const name = `${fname} ${mname ? mname + ' ' : ''}${lname}`.trim();
        
        const sid = currentProfile?.id_number || 'N/A';
        const email = currentProfile?.email || 'N/A';
        const dob = currentProfile?.date_of_birth || 'N/A';
        const gender = currentProfile?.gender || 'N/A';
        const contact = currentProfile?.contact_number || 'N/A';
        const address = currentProfile?.address || 'N/A';
        const program = currentProfile?.program || currentProfile?.course || 'N/A'; 
        const yearLevel = currentProfile?.year_level || 'N/A';

        let profileHTML = `
            <div style="background:#fff; border:1px solid var(--border-dark); border-top: 8px solid #3b82f6; border-radius:12px; padding:24px; margin-bottom:20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
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
            </div>
        `;

        // 2. Questionnaire Responses
        let formFieldsHTML = '';
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            for (const [question, answer] of Object.entries(app.form_responses)) {
                formFieldsHTML += `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left: 4px solid var(--primary-color); border-radius:6px; padding:16px; margin-bottom:15px;">
                        <div style="font-weight:600; font-size:14px; margin-bottom:8px; color:#1e293b;">${question}</div>
                        <div style="font-size:14px; color:#475569;">${answer || '<span style="font-style:italic;">No response provided</span>'}</div>
                    </div>
                `;
            }
        } else {
            formFieldsHTML = '<div style="padding: 15px; background: #f1f5f9; border-radius: 6px; color: var(--text-muted); font-size: 13px; text-align:center;">No questionnaire responses for this application.</div>';
        }

        // 3. Document Uploads & OCR
        let docsHTML = '';
        if (app.documents && app.documents.length > 0) {
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';
                
                const fullViewLink = fileUrl 
                    ? `<a href="${fileUrl}" target="_blank" style="font-size:13px; color:#3b82f6; text-decoration:none; font-weight:600; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-expand"></i> Full View</a>` 
                    : '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().split('?')[0].endsWith('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:350px; border:none; display:block;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; max-height:350px; object-fit:contain; display:block; margin: 0 auto;">`;
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
                        <div class="ai-data-box" style="flex: 1; min-width: 250px; max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; padding: 15px; font-size: 13px;">
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                                <strong style="color:#0f172a; font-size:13px;"><i class="fa-solid fa-wand-magic-sparkles" style="color:#10b981;"></i> AI Extracted Information</strong>
                            </div>
                            <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column;">
                                ${liHtml}
                            </ul>
                        </div>
                    `;
                }

                docsHTML += `
                    <div style="background:#fff; border:1px solid var(--border-dark); border-radius:12px; padding:20px; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="font-weight:600; font-size:14px; color:var(--text-main);"><i class="fa-solid fa-paperclip"></i> ${doc.name || 'Requirement'}</div>
                            ${fullViewLink}
                        </div>
                        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 250px; border: 1px solid var(--border-dark); border-radius: 8px; overflow: hidden; background:#f8fafc;">
                                ${previewContent}
                            </div>
                            ${extractedDataHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            docsHTML = '<div style="padding: 15px; background: #f1f5f9; border-radius: 6px; color: var(--text-muted); font-size: 13px; text-align:center;">No documents uploaded.</div>';
        }

        const modalHTML = `
            <div id="app-details-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter: blur(2px);">
                <div style="background:#ffffff; width:90%; max-width:750px; max-height:85vh; overflow-y:auto; border-radius:12px; padding:30px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-color); padding-bottom:15px; margin-bottom:25px;">
                        <div>
                            <h2 style="margin:0; font-size:20px; color:var(--text-main); font-weight:700;">${modalTitle}</h2>
                            <div style="display:flex; align-items:center; gap: 10px; margin-top: 8px;">
                                <span style="font-size:13px; color:var(--text-muted);">Application ID: ${app.id.substring(0, 8).toUpperCase()}</span>
                                <span style="background:${statusBg}; color:${statusColor}; font-size:11px; font-weight:bold; padding:4px 10px; border-radius:12px;">${displayStatus}</span>
                            </div>
                        </div>
                        <button onclick="document.getElementById('app-details-modal').remove()" style="background:none; border:none; font-size:20px; color:#94a3b8; cursor:pointer; line-height:1;"><i class="fa-solid fa-xmark"></i></button>
                    </div>

                    <div style="margin-bottom:30px;">
                        <h3 style="font-size:15px; color:var(--text-main); margin-bottom:15px;"><i class="fa-solid fa-address-card"></i> Applicant Profile</h3>
                        ${profileHTML}
                    </div>

                    <div style="margin-bottom:30px;">
                        <h3 style="font-size:15px; color:var(--text-main); margin-bottom:15px;"><i class="fa-solid fa-clipboard-question"></i> Questionnaire Responses</h3>
                        <div id="read-only-form-fields">
                            ${formFieldsHTML}
                        </div>
                    </div>

                    <div style="margin-bottom:25px;">
                        <h3 style="font-size:15px; color:var(--text-main); margin-bottom:15px;"><i class="fa-solid fa-file-invoice"></i> Submitted Documents & AI Verification</h3>
                        ${docsHTML}
                    </div>

                    <div style="display:flex; justify-content:flex-end; border-top:1px solid var(--border-color); padding-top:20px;">
                        <button type="button" onclick="document.getElementById('app-details-modal').remove()" style="padding:10px 24px; border:none; background:var(--primary-color); color:#fff; font-weight:600; border-radius:6px; cursor:pointer; transition:0.2s;">Close View</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    };

    // Boot
    loadMyApplications();
});