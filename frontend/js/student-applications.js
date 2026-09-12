document.addEventListener('DOMContentLoaded', async () => {

    let applicationsData = [];
    let currentProfile = null; // Store student profile for the modal
    const tbody = document.getElementById('applications-tbody');

    // Helper to refresh Lucide icons safely
    const refreshIcons = () => {
        if (typeof window.lucide !== 'undefined' && window.lucide.createIcons) {
            window.lucide.createIcons();
        }
    };

    // --- CUSTOM UI: ALERTS (Harmonized Nature Theme & Lucide) ---
    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        
        const iconName = type === 'success' ? 'check-circle-2' : 'alert-triangle';
        toast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${message}</span>`;
        document.body.appendChild(toast);
        refreshIcons();
        
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 350);
        }, 3500);
    };

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
                const fullName = `${firstName} ${lastName}`.trim();
                const progName = profile.program || profile.course || 'Student';

                sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                    name: fullName,
                    program: progName,
                    avatar_url: profile.avatar_url || 'assets/default-avatar.png'
                }));
                
                if(document.getElementById('display-user-name')) document.getElementById('display-user-name').innerText = fullName;
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = fullName;
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = progName;
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

            // Filter out applications added by admin without form responses if needed
            applicationsData = (apps || []).filter(app => app.form_responses !== null);

            // Remove header loading state
            const headerBox = document.getElementById('header-titles-box');
            if (headerBox) headerBox.classList.remove('is-loading');

            updateMetrics(applicationsData);
            updateStatusTracker(applicationsData);

            // Handle status filtering
            const statusFilter = document.getElementById('status-filter');
            if (statusFilter) {
                statusFilter.addEventListener('change', (e) => {
                    const filterValue = e.target.value;
                    let filteredApps = applicationsData;
                    
                    if (filterValue !== 'all') {
                        filteredApps = applicationsData.filter(app => {
                            const statusLower = (app.status || 'pending').toLowerCase();
                            if (filterValue === 'under_review') {
                                return statusLower === 'pending' || statusLower === 'under review';
                            } else if (filterValue === 'approved') {
                                return statusLower === 'approved' || statusLower === 'grantee';
                            } else if (filterValue === 'rejected') {
                                return statusLower === 'rejected' || statusLower === 'declined';
                            } else if (filterValue === 'revoked') {
                                return statusLower === 'revoked';
                            }
                            return true;
                        });
                    }
                    renderTable(filteredApps);
                });
                
                // Apply filter from URL if present
                const urlParams = new URLSearchParams(window.location.search);
                const filterParam = urlParams.get('filter');
                if (filterParam && [...statusFilter.options].some(o => o.value === filterParam)) {
                    statusFilter.value = filterParam;
                    statusFilter.dispatchEvent(new Event('change'));
                } else {
                    renderTable(applicationsData);
                }
                
                // Apply app_id auto-open and highlight
                const appIdParam = urlParams.get('app_id');
                if (appIdParam) {
                    setTimeout(() => {
                        const row = document.getElementById(`app-row-${appIdParam}`);
                        if (row) {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            row.style.transition = 'background-color 0.5s ease';
                            row.style.backgroundColor = 'var(--stat-review-bg)';
                            setTimeout(() => { row.style.backgroundColor = ''; }, 2500);
                        }
                        if (typeof window.viewDetails === 'function') {
                            window.viewDetails(appIdParam);
                        }
                    }, 400);
                }
            } else {
                renderTable(applicationsData);
            }

            refreshIcons();

        } catch (error) {
            console.error("Error loading applications:", error);
            const headerBox = document.getElementById('header-titles-box');
            if (headerBox) headerBox.classList.remove('is-loading');

            document.querySelectorAll('.stat-value.is-loading').forEach(el => {
                el.classList.remove('is-loading');
                el.innerText = '0';
            });

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px 20px; color: var(--danger-color);">
                            <i data-lucide="alert-triangle" style="width: 32px; height: 32px; margin: 0 auto 10px; display: block;"></i>
                            <div style="font-weight: 600; margin-bottom: 4px;">Error loading applications</div>
                            <div style="font-size: 12px; color: var(--text-muted);">Please refresh the page or try again later.</div>
                        </td>
                    </tr>`;
                refreshIcons();
            }
        }
    };

    const updateMetrics = (apps) => {
        const total = apps.length;
        const review = apps.filter(a => a.status === 'Pending' || a.status === 'Under Review').length;
        const approved = apps.filter(a => a.status === 'Approved' || a.status === 'Grantee').length;
        const rejected = apps.filter(a => a.status === 'Rejected' || a.status === 'Declined' || a.status === 'Revoked').length;

        const totalEl = document.getElementById('count-total');
        const reviewEl = document.getElementById('count-review');
        const approvedEl = document.getElementById('count-approved');
        const rejectedEl = document.getElementById('count-rejected');

        if (totalEl) {
            totalEl.classList.remove('is-loading');
            totalEl.innerText = total;
        }
        if (reviewEl) {
            reviewEl.classList.remove('is-loading');
            reviewEl.innerText = review;
        }
        if (approvedEl) {
            approvedEl.classList.remove('is-loading');
            approvedEl.innerText = approved;
        }
        if (rejectedEl) {
            rejectedEl.classList.remove('is-loading');
            rejectedEl.innerText = rejected;
        }
    };

    const renderTable = (apps) => {
        if (!tbody) return;

        if (apps.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 50px 20px; color: var(--text-muted);">
                        <i data-lucide="folder-open" style="width: 40px; height: 40px; margin: 0 auto 12px; display: block; opacity: 0.6;"></i>
                        <div style="font-weight: 600; font-size: 15px; color: var(--text-heading); margin-bottom: 4px;">No Applications Found</div>
                        <div style="font-size: 13px;">You have not submitted any applications matching this filter.</div>
                    </td>
                </tr>`;
            refreshIcons();
            return;
        }

        tbody.innerHTML = '';

        apps.forEach(app => {
            const programName = app.scholarships?.title || app.outside_assistance_name || 'Educational Assistance';

            const dateObj = new Date(app.created_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            let badgeClass = 'badge-review';
            let progress = 50;
            let barColor = 'var(--stat-review-color)';
            let displayStatus = 'Under Review';

            const statusLower = (app.status || 'pending').toLowerCase();

            if (statusLower === 'approved' || statusLower === 'grantee') {
                badgeClass = 'badge-approved';
                progress = 100;
                barColor = 'var(--stat-approved-color)';
                displayStatus = 'Approved';
            } else if (statusLower === 'revoked') {
                badgeClass = 'badge-rejected';
                progress = 100;
                barColor = 'var(--stat-rejected-color)';
                displayStatus = 'Revoked';
            } else if (statusLower === 'rejected' || statusLower === 'declined') {
                badgeClass = 'badge-rejected';
                progress = 100;
                barColor = 'var(--stat-rejected-color)';
                displayStatus = 'Rejected';
            } else {
                badgeClass = 'badge-review';
                progress = 50;
                barColor = 'var(--stat-review-color)';
                displayStatus = 'Under Review';
            }

            const tr = document.createElement('tr');
            tr.id = `app-row-${app.id}`;
            const remarkPreview = ((statusLower === 'rejected' || statusLower === 'declined' || statusLower === 'revoked') && app.remarks)
                ? `<div style="font-size: 11px; color: var(--stat-rejected-color); margin-top: 4px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;" title="Reason: ${app.remarks}"><i data-lucide="info" style="width:11px; height:11px; display:inline-block; vertical-align:middle; margin-right:3px;"></i>${app.remarks}</div>`
                : '';

            tr.innerHTML = `
                <td>
                    <strong style="color: var(--text-heading); display: block; font-size: 14px; font-weight: 700;">${programName}</strong>
                    <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px;">Application ID: ${app.id.substring(0, 8).toUpperCase()}</div>
                </td>
                <td>
                    <div style="font-weight: 600; color: var(--text-heading);">${dateStr}</div>
                    <div style="font-size: 11.5px; color: var(--text-muted);">${timeStr}</div>
                </td>
                <td>
                    <span class="badge-status ${badgeClass}">${displayStatus}</span>
                    ${remarkPreview}
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 130px;">
                        <div style="flex: 1; height: 7px; background: var(--bg-card-secondary); border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${progress}%; background: ${barColor}; height: 100%; border-radius: 4px; transition: width 0.4s ease;"></div>
                        </div>
                        <span style="font-size: 12px; font-weight: 700; color: var(--text-heading); width: 34px;">${progress}%</span>
                    </div>
                </td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-table-action" onclick="viewDetails('${app.id}')">
                            <i data-lucide="eye"></i> View Details
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        refreshIcons();
    };

    const updateStatusTracker = (apps) => {
        if (apps.length === 0) {
            const trackerTitle = document.getElementById('latest-app-title');
            if (trackerTitle) trackerTitle.innerText = '';
            return;
        }

        const latestApp = apps[0]; 
        const programName = latestApp.scholarships?.title || latestApp.outside_assistance_name || 'Assistance Program';
        const createdDate = new Date(latestApp.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

        if(document.getElementById('latest-app-title')) {
            document.getElementById('latest-app-title').innerText = `(${programName})`;
        }
        if(document.getElementById('date-submitted')) {
            document.getElementById('date-submitted').innerText = createdDate;
        }

        const statusLower = (latestApp.status || '').toLowerCase();

        const stepSub = document.getElementById('step-submitted');
        const stepRev = document.getElementById('step-review');
        const stepFinal = document.getElementById('step-final');

        const line1 = document.getElementById('line-1');
        const line2 = document.getElementById('line-2');

        if(!stepSub) return; 

        [stepSub, stepRev, stepFinal].forEach(el => { if(el) el.classList.remove('completed', 'active', 'step-approved', 'step-rejected') });
        [line1, line2].forEach(el => { if(el) el.classList.remove('active') });

        // Step 1: Submitted (Always active if application exists)
        if(stepSub) stepSub.classList.add('active');
        
        if (statusLower === 'pending' || statusLower === 'under review') {
            if(line1) line1.classList.add('active');
            if(stepRev) stepRev.classList.add('active');
            const dateRev = document.getElementById('date-review');
            if (dateRev) dateRev.innerText = 'In Progress';
            const finalNode = document.getElementById('date-final');
            if (finalNode) finalNode.innerText = '--';
        }
        else if (statusLower === 'approved' || statusLower === 'rejected' || statusLower === 'grantee' || statusLower === 'declined' || statusLower === 'revoked') {
            if(stepRev) stepRev.classList.add('active');
            if(stepFinal) {
                stepFinal.classList.add('active');
                if (statusLower === 'approved' || statusLower === 'grantee') {
                    stepFinal.classList.add('step-approved');
                } else {
                    stepFinal.classList.add('step-rejected');
                }
            }
            if(line1) line1.classList.add('active');
            if(line2) line2.classList.add('active');
            
            const dateRev = document.getElementById('date-review');
            if (dateRev) dateRev.innerText = 'Reviewed';

            const finalNode = document.getElementById('date-final');
            if(finalNode) {
                if (statusLower === 'approved' || statusLower === 'grantee') {
                    finalNode.innerText = 'Approved';
                } else {
                    finalNode.innerText = 'Rejected';
                }
            }
        }

        refreshIcons();
    };

    // --- MODAL: VIEW DETAILS (Harmonized Nature Themed Modal) ---
    window.viewDetails = (appId) => {
        const app = applicationsData.find(a => a.id === appId);
        if (!app) return;

        const existingModal = document.getElementById('app-details-modal');
        if (existingModal) existingModal.remove();

        let badgeClass = 'badge-review';
        let displayStatus = 'Under Review';
        const statusLower = (app.status || 'pending').toLowerCase();

        if (statusLower === 'approved' || statusLower === 'grantee') {
            badgeClass = 'badge-approved';
            displayStatus = 'Approved';
        } else if (statusLower === 'rejected' || statusLower === 'declined') {
            badgeClass = 'badge-rejected';
            displayStatus = 'Rejected';
        } else if (statusLower === 'revoked') {
            badgeClass = 'badge-rejected';
            displayStatus = 'Revoked';
        }

        const modalTitle = app.scholarships?.title || app.outside_assistance_name || 'Educational Assistance Application';

        // Rejection Reason Alert Card (If application was rejected or remarks present)
        let rejectionAlertHTML = '';
        if (statusLower === 'rejected' || statusLower === 'declined' || statusLower === 'revoked' || (app.remarks && app.remarks.trim())) {
            const finalReasonText = app.remarks && app.remarks.trim()
                ? app.remarks.trim()
                : 'Your application was not approved during evaluation. Please contact your scholarship coordinator for more details.';

            rejectionAlertHTML = `
                <div class="modal-rejection-box" style="margin-bottom: 24px;">
                    <div class="modal-rejection-header">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="x-circle" style="width: 18px; height: 18px; color: var(--danger-color);"></i>
                            <strong style="color: var(--danger-color); font-size: 14.5px;">Application Decision: Rejected</strong>
                        </div>
                        <span class="modal-rejection-tag">Evaluation Outcome</span>
                    </div>
                    <div class="modal-rejection-body">
                        <div class="modal-rejection-label">Reason for Rejection:</div>
                        <p class="modal-rejection-text">${finalReasonText}</p>
                    </div>
                </div>
            `;
        }

        // 1. Applicant Profile Data
        const fname = currentProfile?.first_name || '';
        const mname = currentProfile?.middle_name || '';
        const lname = currentProfile?.last_name || '';
        const name = `${fname} ${mname ? mname + ' ' : ''}${lname}`.trim() || 'Student Name';
        
        const sid = currentProfile?.id_number || 'N/A';
        const email = currentProfile?.email || 'N/A';
        const dob = currentProfile?.date_of_birth || 'N/A';
        const gender = currentProfile?.gender || 'N/A';
        const contact = currentProfile?.contact_number || 'N/A';
        const address = currentProfile?.address || 'N/A';
        const program = currentProfile?.program || currentProfile?.course || 'N/A'; 
        const yearLevel = currentProfile?.year_level || 'N/A';

        let profileHTML = `
            <div class="modal-profile-box">
                <div class="modal-profile-grid">
                    <div class="profile-field-row"><strong>Student ID:</strong> <span>${sid}</span></div>
                    <div class="profile-field-row"><strong>Email:</strong> <span>${email}</span></div>
                    
                    <div class="profile-field-row" style="grid-column: 1 / -1;"><strong>Full Name:</strong> <span>${name}</span></div>
                    
                    <div class="profile-field-row"><strong>Date of Birth:</strong> <span>${dob}</span></div>
                    <div class="profile-field-row"><strong>Gender:</strong> <span>${gender}</span></div>
                    
                    <div class="profile-field-row" style="grid-column: 1 / -1;"><strong>Contact Number:</strong> <span>${contact}</span></div>
                    <div class="profile-field-row" style="grid-column: 1 / -1;"><strong>Address:</strong> <span>${address}</span></div>
                    
                    <div class="profile-field-row"><strong>Program:</strong> <span>${program}</span></div>
                    <div class="profile-field-row"><strong>Year Level:</strong> <span>${yearLevel}</span></div>
                </div>
            </div>
        `;

        // 2. Questionnaire Responses
        let formFieldsHTML = '';
        if (app.form_responses && Object.keys(app.form_responses).length > 0) {
            for (const [question, answer] of Object.entries(app.form_responses)) {
                formFieldsHTML += `
                    <div class="modal-response-box">
                        <div class="modal-response-question">${question}</div>
                        <div class="modal-response-answer">${answer || '<span style="font-style:italic; opacity:0.7;">No response provided</span>'}</div>
                    </div>
                `;
            }
        } else {
            formFieldsHTML = '<div style="padding: 16px; background: var(--bg-card-secondary); border-radius: 10px; color: var(--text-muted); font-size: 13.5px; text-align: center; border: 1px solid var(--border-color);">No questionnaire responses for this application.</div>';
        }

        // 3. Document Uploads & AI Verification
        let docsHTML = '';
        if (app.documents && app.documents.length > 0) {
            app.documents.forEach(doc => {
                const fileUrl = doc.file_url || doc.url;
                let previewContent = '';
                
                const fullViewLink = fileUrl 
                    ? `<a href="${fileUrl}" target="_blank" class="modal-doc-link"><i data-lucide="external-link"></i> Full View</a>` 
                    : '';

                if (fileUrl) {
                    if (fileUrl.toLowerCase().split('?')[0].endsWith('.pdf')) {
                        previewContent = `<iframe src="${fileUrl}#toolbar=0" style="width:100%; height:320px; border:none; display:block; border-radius: 8px;"></iframe>`;
                    } else {
                        previewContent = `<img src="${fileUrl}" style="width:100%; max-height:320px; object-fit:contain; display:block; margin: 0 auto; border-radius: 8px;">`;
                    }
                } else {
                    previewContent = `
                        <div style="padding:40px 20px; text-align:center; color: var(--text-muted);">
                            <i data-lucide="file-x" style="width:32px; height:32px; margin: 0 auto 10px; display:block;"></i>
                            <strong style="display:block;">File preview not available</strong>
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
                            }).join('<div style="height:1px; background:var(--border-color); margin:6px 0;"></div>');
                            
                        } else if (typeof value === 'object' && value !== null) {
                            displayValue = Object.entries(value).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join('<br>');
                        } else {
                            displayValue = value || 'N/A';
                        }

                        liHtml += `
                            <li style="background:var(--bg-card-secondary); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; margin-bottom:8px;">
                                <span style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">${key}</span>
                                <div style="color:var(--text-heading); font-weight:500; font-size:12.5px; line-height:1.4;">${displayValue}</div>
                            </li>
                        `;
                    }
                    
                    extractedDataHtml = `
                        <div class="modal-ai-box" style="flex: 1; min-width: 260px; max-height: 320px; overflow-y: auto;">
                            <div class="modal-ai-box-title">
                                <i data-lucide="sparkles"></i> AI Extracted Information
                            </div>
                            <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column;">
                                ${liHtml}
                            </ul>
                        </div>
                    `;
                }

                docsHTML += `
                    <div class="modal-doc-card">
                        <div class="modal-doc-header">
                            <div class="modal-doc-title"><i data-lucide="paperclip"></i> ${doc.name || 'Submitted Document'}</div>
                            ${fullViewLink}
                        </div>
                        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 260px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-card);">
                                ${previewContent}
                            </div>
                            ${extractedDataHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            docsHTML = '<div style="padding: 16px; background: var(--bg-card-secondary); border-radius: 10px; color: var(--text-muted); font-size: 13.5px; text-align: center; border: 1px solid var(--border-color);">No documents uploaded for this application.</div>';
        }

        const modalHTML = `
            <div id="app-details-modal" class="modal-overlay-custom">
                <div class="modal-dialog-custom">
                    
                    <div class="modal-header-custom">
                        <div>
                            <h2>${modalTitle}</h2>
                            <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                                <span style="font-size: 13px; color: var(--text-muted);">Application ID: ${app.id.substring(0, 8).toUpperCase()}</span>
                                <span class="badge-status ${badgeClass}">${displayStatus}</span>
                            </div>
                        </div>
                        <button class="modal-close-btn" onclick="document.getElementById('app-details-modal').remove()" aria-label="Close modal">
                            <i data-lucide="x"></i>
                        </button>
                    </div>

                    <div class="modal-body-custom">
                        ${rejectionAlertHTML}

                        <div style="margin-bottom: 26px;">
                            <h3 class="modal-section-title"><i data-lucide="user"></i> Applicant Profile</h3>
                            ${profileHTML}
                        </div>

                        <div style="margin-bottom: 26px;">
                            <h3 class="modal-section-title"><i data-lucide="clipboard-list"></i> Questionnaire Responses</h3>
                            <div id="read-only-form-fields">
                                ${formFieldsHTML}
                            </div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <h3 class="modal-section-title"><i data-lucide="file-check"></i> Submitted Documents & AI Verification</h3>
                            ${docsHTML}
                        </div>
                    </div>

                    <div class="modal-footer-custom">
                        <button type="button" class="btn-modal-close" onclick="document.getElementById('app-details-modal').remove()">Close View</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        refreshIcons();

        // Close on overlay backdrop click
        const modalEl = document.getElementById('app-details-modal');
        if (modalEl) {
            modalEl.addEventListener('click', (e) => {
                if (e.target === modalEl) modalEl.remove();
            });
        }
    };

    // Boot
    loadMyApplications();
});