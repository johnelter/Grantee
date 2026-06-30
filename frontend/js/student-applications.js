document.addEventListener('DOMContentLoaded', async () => {

    let applicationsData = [];
    const tbody = document.getElementById('applications-tbody');

    // --- CUSTOM UI: ALERTS & CONFIRMS ---
    // Injects the CSS for the custom alerts so you don't need to touch your CSS files
    const injectCustomUIStyles = () => {
        if (document.getElementById('custom-ui-styles')) return;
        const style = document.createElement('style');
        style.id = 'custom-ui-styles';
        style.innerHTML = `
            .custom-toast { position: fixed; bottom: 30px; right: 30px; background: #fff; padding: 16px 24px; border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); display: flex; align-items: center; gap: 12px; z-index: 10000; transform: translateY(100px); opacity: 0; transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); font-size: 14px; font-weight: 500; color: #334155; border-left: 4px solid var(--primary-color); }
            .custom-toast.show { transform: translateY(0); opacity: 1; }
            .custom-toast.error { border-left-color: #ef4444; }
            .custom-toast.success { border-left-color: #10b981; }
            
            .custom-confirm-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; justify-content: center; align-items: center; z-index: 10000; opacity: 0; visibility: hidden; transition: all 0.2s ease; }
            .custom-confirm-overlay.show { opacity: 1; visibility: visible; }
            .custom-confirm-box { background: #fff; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); transform: scale(0.95); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .custom-confirm-overlay.show .custom-confirm-box { transform: scale(1); }
            .custom-confirm-title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 10px; }
            .custom-confirm-msg { font-size: 14px; color: #64748b; margin-bottom: 25px; line-height: 1.5; }
            .custom-confirm-actions { display: flex; gap: 10px; justify-content: center; }
            .custom-confirm-btn { padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; flex: 1; transition: 0.2s; font-size: 14px; }
            .custom-confirm-cancel { background: #f1f5f9; color: #475569; }
            .custom-confirm-cancel:hover { background: #e2e8f0; }
            .custom-confirm-proceed { background: #ef4444; color: #fff; }
            .custom-confirm-proceed:hover { background: #dc2626; }
        `;
        document.head.appendChild(style);
    };

    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        const icon = type === 'success' ? '✅' : '⚠️';
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        document.body.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Remove after 3.5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    };

    const showConfirm = (title, message, onConfirm) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-confirm-overlay';
        overlay.innerHTML = `
            <div class="custom-confirm-box">
                <div class="custom-confirm-title">${title}</div>
                <div class="custom-confirm-msg">${message}</div>
                <div class="custom-confirm-actions">
                    <button class="custom-confirm-btn custom-confirm-cancel" id="confirm-cancel-btn">Cancel</button>
                    <button class="custom-confirm-btn custom-confirm-proceed" id="confirm-proceed-btn">Proceed</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => overlay.classList.add('show'), 10);

        const closeConfirm = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 200);
        };

        document.getElementById('confirm-cancel-btn').addEventListener('click', closeConfirm);
        document.getElementById('confirm-proceed-btn').addEventListener('click', () => {
            closeConfirm();
            onConfirm();
        });
    };

    injectCustomUIStyles();

    // --- MAIN APPLICATION LOGIC ---
    const loadMyApplications = async () => {
        try {
            const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
            if (sessionError || !session) {
                window.location.href = 'login-student.html';
                return;
            }
            const studentId = session.user.id;

            const { data: profile, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profileError || !profile) {
                window.location.href = 'login-student.html';
                return;
            }

            if (profile.role !== 'student') {
                window.location.href = 'admin-dashboard.html';
                return;
            }

            if (profile) {
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                
                if(document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.course || 'Student';
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
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger-color);">Error loading data. Check console.</td></tr>`;
        }
    };

    const updateMetrics = (apps) => {
        const total = apps.length;
        const review = apps.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
        const approved = apps.filter(a => a.status === 'Approved').length;
        const rejected = apps.filter(a => a.status === 'Rejected').length;
        const withdrawn = apps.filter(a => a.status === 'Withdrawn').length;

        if(document.getElementById('count-total')) document.getElementById('count-total').innerText = total;
        if(document.getElementById('count-review')) document.getElementById('count-review').innerText = review;
        if(document.getElementById('count-approved')) document.getElementById('count-approved').innerText = approved;
        if(document.getElementById('count-rejected')) document.getElementById('count-rejected').innerText = rejected;
        if(document.getElementById('count-withdrawn')) document.getElementById('count-withdrawn').innerText = withdrawn;
    };

    const renderTable = (apps) => {
        if (!tbody) return;

        if (apps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">You have not submitted any applications yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';

        apps.forEach(app => {
            const scholarshipName = app.scholarships ? app.scholarships.title : 'Unknown Scholarship';

            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            let badgeClass = 'badge-pending';
            let progress = 33;
            let barColor = '#3b82f6';

            const statusLower = (app.status || '').toLowerCase();

            if (statusLower === 'under review') {
                badgeClass = 'badge-review';
                progress = 66;
                barColor = '#f59e0b';
            } else if (statusLower === 'approved') {
                badgeClass = 'badge-approved';
                progress = 100;
                barColor = 'var(--success-color)';
            } else if (statusLower === 'rejected') {
                badgeClass = 'badge-rejected';
                progress = 100;
                barColor = 'var(--danger-color)';
            } else if (statusLower === 'withdrawn') {
                badgeClass = 'badge-withdrawn';
                progress = 0;
                barColor = 'var(--text-muted)';
            }

            const showWithdrawBtn = (statusLower === 'pending' || statusLower === 'under review');
            const showDeleteBtn = (statusLower === 'withdrawn');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong style="color: var(--text-main);">${scholarshipName}</strong>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Application ID: ${app.id.substring(0, 8).toUpperCase()}</div>
                </td>
                <td>
                    <div>${dateStr}</div>
                    <div style="font-size:11px; color:var(--text-muted);">${timeStr}</div>
                </td>
                <td><span class="badge-status ${badgeClass}">${app.status || 'Pending'}</span></td>
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
                        <button class="btn-outline" style="padding: 6px 12px; font-size: 11px;" onclick="viewDetails('${app.id}')">View Details</button>
                        ${showWithdrawBtn ? `<button class="btn-outline" style="padding: 6px 12px; font-size: 11px; color: var(--danger-color); border-color: var(--danger-color);" onclick="withdrawApplication('${app.id}')">Withdraw</button>` : ''}
                        ${showDeleteBtn ? `<button class="btn-outline" style="padding: 6px 12px; font-size: 11px; color: var(--danger-color); border-color: var(--danger-color); background: #fee2e2;" onclick="deleteApplication('${app.id}')"><i class="fas fa-xmark"></i> Delete</button>` : ''}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    const updateStatusTracker = (apps) => {
        if (apps.length === 0) return;

        const latestApp = apps[0]; 
        const scholarshipName = latestApp.scholarships ? latestApp.scholarships.title : '';
        const createdDate = new Date(latestApp.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

        if(document.getElementById('latest-app-title')) document.getElementById('latest-app-title').innerText = `(${scholarshipName})`;
        if(document.getElementById('date-submitted')) document.getElementById('date-submitted').innerText = createdDate;

        const statusLower = (latestApp.status || '').toLowerCase();

        const stepSub = document.getElementById('step-submitted');
        const stepRev = document.getElementById('step-review');
        const stepEval = document.getElementById('step-eval');
        const stepFinal = document.getElementById('step-final');

        const line1 = document.getElementById('line-1');
        const line2 = document.getElementById('line-2');
        const line3 = document.getElementById('line-3');

        if(!stepSub) return; 

        [stepSub, stepRev, stepEval, stepFinal].forEach(el => el.classList.remove('completed', 'active'));
        [line1, line2, line3].forEach(el => el.classList.remove('active'));

        if (statusLower === 'pending') {
            stepSub.classList.add('active');
        }
        else if (statusLower === 'under review') {
            stepSub.classList.add('active');
            line1.classList.add('active');
            stepRev.classList.add('active');
        }
        else if (statusLower === 'approved' || statusLower === 'rejected') {
            stepSub.classList.add('active');
            stepRev.classList.add('active');
            stepEval.classList.add('active');
            stepFinal.classList.add('active');
            line1.classList.add('active');
            line2.classList.add('active');
            line3.classList.add('active');
            if(document.getElementById('date-final')) document.getElementById('date-final').innerText = createdDate;
        }
    };

    // --- MODAL: VIEW DETAILS ---
    window.viewDetails = (appId) => {
        const app = applicationsData.find(a => a.id === appId);
        if (!app) return;

        const existingModal = document.getElementById('app-details-modal');
        if (existingModal) existingModal.remove();

        let formFieldsHTML = '';
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            for (const [question, answer] of Object.entries(app.form_responses)) {
                const safeId = "resp_" + question.replace(/[^a-zA-Z0-9]/g, "_");
                formFieldsHTML += `
                    <div style="margin-bottom: 20px;">
                        <label style="display:block; font-size:14px; font-weight:600; color:var(--text-main); margin-bottom:8px;">${question}</label>
                        <input type="text" id="${safeId}" data-question="${question}" value="${answer}" 
                            style="width:100%; padding:12px; border:1px solid var(--border-color); border-radius:6px; font-size:14px; background:#f8fafc; color:var(--text-main); outline:none; transition:0.2s; box-sizing:border-box;" 
                            onfocus="this.style.borderColor='var(--primary-color)'; this.style.background='#ffffff';" 
                            onblur="this.style.borderColor='var(--border-color)'; this.style.background='#f8fafc';">
                    </div>
                `;
            }
        } else {
            formFieldsHTML = '<div style="padding: 15px; background: #f1f5f9; border-radius: 6px; color: var(--text-muted); font-size: 13px; text-align:center;">No custom form fields for this application.</div>';
        }

        let docsHTML = '';
        if (app.documents && app.documents.length > 0) {
            app.documents.forEach(doc => {
                const isVerified = doc.status === 'Verified';
                const badgeColor = isVerified ? 'var(--success-color)' : 'var(--text-muted)';
                const badgeBg = isVerified ? '#dcfce7' : '#f1f5f9';
                const statusText = isVerified ? 'Verified ✓' : 'Uploaded';

                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().split('?')[0].endsWith('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:100%; border:none;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; height:100%; object-fit:contain; background:#e2e8f0;">`;
                    }
                } else {
                    previewContent = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted);">
                            <span style="font-size:36px; margin-bottom:8px;">📄</span>
                            <span style="font-size:14px; font-weight:600; color:#475569;">Document Attached</span>
                            <span style="font-size:12px;">Stored securely in database</span>
                        </div>
                    `;
                }

                docsHTML += `
                    <div style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 20px; overflow: hidden; background: #ffffff;">
                        <div style="padding: 15px; background: #f8fafc; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:14px; color:var(--text-main);">${doc.name || 'Requirement'}</strong>
                            <span style="font-size:11px; padding:4px 10px; background:${badgeBg}; color:${badgeColor}; border-radius:12px; font-weight:bold;">${statusText}</span>
                        </div>
                        <div style="height: 220px; background: #f1f5f9; position: relative;">
                            ${previewContent}
                        </div>
                    </div>
                `;
            });
        } else {
            docsHTML = '<div style="padding: 15px; background: #f1f5f9; border-radius: 6px; color: var(--text-muted); font-size: 13px; text-align:center;">No documents uploaded for this application.</div>';
        }

        const modalHTML = `
            <div id="app-details-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); display:flex; justify-content:center; align-items:center; z-index:9999; backdrop-filter: blur(2px);">
                <div style="background:#ffffff; width:90%; max-width:650px; max-height:85vh; overflow-y:auto; border-radius:12px; padding:30px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                    
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid var(--border-color); padding-bottom:15px; margin-bottom:25px;">
                        <div>
                            <h2 style="margin:0; font-size:20px; color:var(--text-main); font-weight:700;">${app.scholarships?.title || 'Scholarship Application'}</h2>
                            <span style="font-size:13px; color:var(--text-muted); display:block; margin-top:4px;">Application ID: ${app.id.substring(0, 8).toUpperCase()}</span>
                        </div>
                        <button onclick="document.getElementById('app-details-modal').remove()" style="background:none; border:none; font-size:28px; color:#94a3b8; cursor:pointer; line-height:1;">&times;</button>
                    </div>

                    <div style="margin-bottom:35px;">
                        <h3 style="font-size:15px; color:var(--primary-color); border-left:4px solid var(--primary-color); padding-left:10px; margin-bottom:20px;">Application Form Details</h3>
                        <div id="edit-form-fields">
                            ${formFieldsHTML}
                        </div>
                    </div>

                    <div style="margin-bottom:25px;">
                        <h3 style="font-size:15px; color:var(--primary-color); border-left:4px solid var(--primary-color); padding-left:10px; margin-bottom:15px;">Uploaded Documents</h3>
                        <p style="font-size:12px; color:var(--text-muted); margin-bottom:20px; background:#f8fafc; padding:10px; border-radius:6px; border:1px solid var(--border-color);">
                            <span style="color:var(--danger-color); font-weight:bold;">Note:</span> Document files are locked and cannot be altered after initial submission.
                        </p>
                        ${docsHTML}
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:12px; border-top:1px solid var(--border-color); padding-top:25px;">
                        <button type="button" onclick="document.getElementById('app-details-modal').remove()" style="padding:10px 20px; border:1px solid #cbd5e1; background:#fff; color:#475569; font-weight:600; border-radius:6px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">Cancel</button>
                        <button type="button" id="save-app-btn" onclick="saveApplicationChanges('${app.id}')" style="padding:10px 20px; border:none; background:var(--primary-color); color:#fff; font-weight:600; border-radius:6px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='var(--primary-hover)'" onmouseout="this.style.background='var(--primary-color)'">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    };

    window.saveApplicationChanges = async (appId) => {
        const app = applicationsData.find(a => a.id === appId);
        if (!app) return;

        const saveBtn = document.getElementById('save-app-btn');
        saveBtn.innerText = "Saving...";
        saveBtn.disabled = true;

        let updatedResponses = { ...app.form_responses };
        const inputs = document.querySelectorAll('#edit-form-fields input');

        inputs.forEach(input => {
            const originalQuestion = input.getAttribute('data-question');
            if (originalQuestion) {
                updatedResponses[originalQuestion] = input.value;
            }
        });

        try {
            const { error } = await window.supabaseClient
                .from('applications')
                .update({ form_responses: updatedResponses })
                .eq('id', appId);

            if (error) throw error;

            showToast('Application details updated successfully!');
            document.getElementById('app-details-modal').remove();

            loadMyApplications();

        } catch (err) {
            console.error(err);
            showToast('Failed to update: ' + err.message, 'error');
            saveBtn.innerText = "Save Changes";
            saveBtn.disabled = false;
        }
    };

    // --- WITHDRAW LOGIC ---
    window.withdrawApplication = async (appId) => {
        showConfirm(
            "Withdraw Application", 
            "Are you sure you want to withdraw this application? This action cannot be undone.", 
            async () => {
                try {
                    const { error } = await window.supabaseClient
                        .from('applications')
                        .update({ status: 'Withdrawn' })
                        .eq('id', appId);

                    if (error) throw error;

                    showToast('Application successfully withdrawn.');
                    loadMyApplications(); 

                } catch (err) {
                    console.error("Error withdrawing:", err);
                    showToast("Failed to withdraw: " + err.message, 'error');
                }
            }
        );
    };

    // --- DELETE LOGIC (Only for Withdrawn Applications) ---
    window.deleteApplication = async (appId) => {
        showConfirm(
            "Permanently Delete", 
            "Are you sure you want to permanently delete this application?", 
            async () => {
                try {
                    const { error } = await window.supabaseClient
                        .from('applications')
                        .delete()
                        .eq('id', appId);

                    // Check if error was caused by Supabase Row Level Security (RLS)
                    if (error) {
                        if (error.code === '42501') {
                            throw new Error("Database Security Policy (RLS) is preventing deletion. Check Supabase table policies.");
                        }
                        throw error;
                    }

                    showToast('Application permanently deleted.');
                    loadMyApplications();

                } catch (err) {
                    console.error("Error deleting application:", err);
                    showToast("Deletion failed: " + err.message, 'error');
                }
            }
        );
    };

    // --- AI CHAT TOGGLE ---
    window.toggleChat = () => {
        const widget = document.getElementById('ai-chat-widget');
        if(widget) widget.classList.toggle('open');
    };

    // Boot
    loadMyApplications();
});