document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 0. INJECT CSS & MODAL HTML FOR FULL VIEW ---
    const style = document.createElement('style');
    style.innerHTML = `
        /* Chrome, Safari, Edge, Opera */
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        /* Firefox */
        input[type="number"] {
            -moz-appearance: textfield;
        }
        /* Scrollbar styling for extracted data box */
        .ai-data-box::-webkit-scrollbar { width: 6px; }
        .ai-data-box::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        
        /* Document Full View Modal CSS */
        .doc-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15, 23, 42, 0.9); z-index: 99999;
            display: none; justify-content: center; align-items: center;
            backdrop-filter: blur(4px);
        }
        .doc-modal-content {
            width: 90vw; height: 90vh; background: #000; border-radius: 8px;
            position: relative; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .doc-modal-close {
            position: absolute; top: 15px; right: 20px;
            font-size: 28px; font-weight: bold; color: #fff;
            background: #ef4444; border: none; border-radius: 50%;
            width: 40px; height: 40px; cursor: pointer; z-index: 100000;
            display: flex; align-items: center; justify-content: center;
            transition: 0.2s;
        }
        .doc-modal-close:hover { background: #dc2626; transform: scale(1.05); }
    `;
    document.head.appendChild(style);

    const modalHtml = `
        <div id="full-view-modal" class="doc-modal-overlay">
            <div class="doc-modal-content">
                <button class="doc-modal-close" onclick="document.getElementById('full-view-modal').style.display='none'">×</button>
                <div id="full-view-content" style="width:100%; height:100%;"></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // --- 1. DYNAMICALLY LOAD LIBRARIES (PDF.js for previews) ---
    async function loadPDFJS() {
        if (window.pdfjsLib) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const scholarshipId = urlParams.get('id');

    // --- 2. AUTH CHECK ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }
    
    const studentId = session.user.id;
    const studentEmail = session.user.email;

    let requiredDocsCount = 0;
    let validatedDocsCount = 0;
    let uploadedDocumentsList = [];
    let extractedDataStore = {}; 
    
    let currentScholarship = null;
    let studentFullName = '';
    
    window.tempFileUrls = {}; // Global store for local blob URLs for the Full View

    // --- 2.5 DROPDOWN MENU LOGIC ---
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

    const logoutBtn = document.getElementById('dropdown-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }

    // --- 3. INIT FUNCTION ---
    async function init() {
        try {
            // A. Fetch Student Profile
            const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', studentId).single();
            
            if(profile) {
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                studentFullName = `${firstName} ${profile.middle_name ? profile.middle_name + ' ' : ''}${lastName}`.trim();

                // Check Masterlist for official academic records
                let masterProgram = profile.program || profile.course;
                if (profile.id_number) {
                    const { data: masterlistData } = await window.supabaseClient
                        .from('enrolled_masterlist')
                        .select('program')
                        .eq('id_number', profile.id_number)
                        .single();

                    if (masterlistData && masterlistData.program) {
                        masterProgram = masterlistData.program;
                    }
                }

                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = masterProgram || 'Student Profile';
                if(profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                if(document.getElementById('prof-id')) document.getElementById('prof-id').value = profile.id_number || 'N/A';
                if(document.getElementById('prof-email')) document.getElementById('prof-email').value = studentEmail || 'N/A';
                if(document.getElementById('prof-fullname')) document.getElementById('prof-fullname').value = studentFullName;
                if(document.getElementById('prof-program')) document.getElementById('prof-program').value = masterProgram || 'N/A';
                if(document.getElementById('prof-year')) document.getElementById('prof-year').value = profile.year_level || 'N/A';
                
                // --- NEW ADDITIONS TO APPLICANT PROFILE ---
                if(document.getElementById('prof-dob')) document.getElementById('prof-dob').value = profile.date_of_birth || 'N/A';
                if(document.getElementById('prof-gender')) document.getElementById('prof-gender').value = profile.gender || 'N/A';
                if(document.getElementById('prof-contact')) document.getElementById('prof-contact').value = profile.contact_number || 'N/A';
                if(document.getElementById('prof-address')) document.getElementById('prof-address').value = profile.address || 'N/A';
            }

            // B. Fetch Scholarship Details
            const { data: sch } = await window.supabaseClient.from('scholarships').select('*').eq('id', scholarshipId).single();
            currentScholarship = sch; 
            
            if(document.getElementById('sch-category')) document.getElementById('sch-category').innerText = sch.category || 'Institution-Funded Educational Assistance';
            
            if(document.getElementById('sch-type')) document.getElementById('sch-type').innerText = sch.scholarship_type || 'Merit-Based';
            
            if(document.getElementById('sch-title')) document.getElementById('sch-title').innerText = sch.title;
            if(document.getElementById('sch-provider')) document.getElementById('sch-provider').innerText = sch.department || 'General Admin';
            if(document.getElementById('sch-description')) document.getElementById('sch-description').innerHTML = sch.description || 'No description provided.';
            
            const dateObj = sch.end_date ? new Date(sch.end_date) : null;
            if(document.getElementById('sch-deadline')) document.getElementById('sch-deadline').innerText = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No Deadline';
            if(document.getElementById('sch-slots')) document.getElementById('sch-slots').innerText = sch.slots || 'Unlimited';

            // C. Render Eligibility Rules
            const elList = document.getElementById('sch-eligibility');
            if (elList) {
                elList.innerHTML = ''; 
                let hasRules = false;
                
                if (sch.min_college_gwa) {
                    elList.innerHTML += `<li>Must have a College GWA of <strong>${sch.min_college_gwa}</strong> or better (1.0 is highest).</li>`;
                    hasRules = true;
                }
                if (sch.min_hs_average) {
                    elList.innerHTML += `<li>Must have a High School Average of <strong>${sch.min_hs_average}</strong> or better.</li>`;
                    hasRules = true;
                }
                if (sch.min_college_subject_grade) {
                    elList.innerHTML += `<li>Must have NO individual College subject grade lower than <strong>${sch.min_college_subject_grade}</strong>.</li>`;
                    hasRules = true;
                }
                if (sch.min_hs_subject_grade) {
                    elList.innerHTML += `<li>Must have NO individual High School subject grade lower than <strong>${sch.min_hs_subject_grade}</strong>.</li>`;
                    hasRules = true;
                }
                if (sch.eligibility_years && sch.eligibility_years.length > 0) {
                    elList.innerHTML += `<li>Open to Year Levels: <strong>${sch.eligibility_years.join(', ')}</strong>.</li>`;
                    hasRules = true;
                }
                if (sch.eligibility_programs && sch.eligibility_programs.length > 0) {
                    elList.innerHTML += `<li>Open to Programs: <strong>${sch.eligibility_programs.join(', ')}</strong>.</li>`;
                    hasRules = true;
                }
                if (!hasRules) elList.innerHTML = `<li>No specific eligibility restrictions for this educational assistance program.</li>`;
            }

            // D. Render Dynamic Questionnaire
            const questionsContainer = document.getElementById('dynamic-questions');
            if (sch.form_fields && questionsContainer) {
                sch.form_fields.forEach((field, i) => {
                    const div = document.createElement('div');
                    div.style.marginBottom = '20px';
                    const reqStr = field.required ? 'required' : '';
                    const reqIcon = field.required ? '<span style="color:#ef4444; margin-left:4px;">*</span>' : '';
                    
                    let inputHtml = '';
                    if (field.type === 'Selection') {
                        const inputType = field.allow_multiple ? 'checkbox' : 'radio';
                        let optionsHtml = '';
                        field.options.forEach((opt) => {
                            optionsHtml += `<label class="radio-checkbox-label"><input type="${inputType}" name="q_${i}" value="${opt}" ${reqStr}> ${opt}</label>`;
                        });
                        inputHtml = `<div style="padding-top:10px;">${optionsHtml}</div>`;
                    } else if (field.type === 'Dropdown') {
                        let optionsHtml = field.options.map(o => `<option value="${o}">${o}</option>`).join('');
                        inputHtml = `<select class="dynamic-select" name="q_${i}" ${reqStr}><option value="">Select...</option>${optionsHtml}</select>`;
                    } else if (field.type === 'Date') {
                        inputHtml = `<input type="date" class="dynamic-input" name="q_${i}" ${reqStr}>`;
                    } else {
                        const htmlType = (field.type && field.type.toLowerCase() === 'number') ? 'number' : 'text';
                        inputHtml = `<input type="${htmlType}" class="dynamic-input" name="q_${i}" placeholder="Enter your answer..." ${reqStr}>`;
                    }
                    
                    div.innerHTML = `<label style="display:block; font-size:13px; font-weight:600; color:#1e293b; margin-bottom:8px;">${field.label}${reqIcon}</label>${inputHtml}`;
                    if(field.type === 'Textarea' || field.type === 'Text') div.style.gridColumn = '1 / -1';
                    
                    questionsContainer.appendChild(div);
                });
            }

            // E. Render Document Uploads
            const ocrContainer = document.getElementById('ocr-documents-container');
            
            let docsConfigList = [];
            if (sch.document_configurations && sch.document_configurations.length > 0) {
                docsConfigList = sch.document_configurations;
            } else if (sch.required_documents && sch.required_documents.length > 0) {
                docsConfigList = sch.required_documents.map(name => ({
                    name: name, required: true, ocr_enabled: true, max_size: 5
                }));
            }

            if (docsConfigList.length > 0 && ocrContainer) {
                docsConfigList.forEach((docConfig, i) => {
                    const docName = docConfig.name;
                    const isReq = docConfig.required !== false; 
                    const isOcr = docConfig.ocr_enabled !== false; 
                    const maxSize = docConfig.max_size || 5;

                    if (isReq) requiredDocsCount++;
                    
                    const reqMarker = isReq ? `<span style="color:#ef4444;">*</span>` : `<span style="font-size:12px; color:#64748b; font-weight:normal; margin-left:4px;">(Optional)</span>`;
                    const ocrBadge = isOcr ? `<span style="font-size:10px; background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle;">⚡ AI Scan</span>` : '';
                    
                    const div = document.createElement('div');
                    div.className = 'doc-dashed-box';
                    div.id = `block_${i}`;
                    
                    div.innerHTML = `
                        <div id="zone_${i}">
                            <div class="doc-title">📄 Upload ${docName} ${reqMarker} ${ocrBadge}</div>
                            <div class="doc-subtitle">Allowed: PDF, JPG, PNG (Max: ${maxSize}MB)</div>
                            <input type="file" id="file_${i}" accept="image/*,application/pdf" style="display:none">
                            <button type="button" class="btn-upload" onclick="document.getElementById('file_${i}').click()">Choose File</button>
                            <div id="fname_${i}" style="margin-top: 10px; font-size: 12px; color: #64748b;">No file selected</div>
                        </div>

                        <div id="loader_${i}" style="display:none; text-align:center; padding: 20px; color: var(--primary-color); font-weight: bold;">
                            ⚙️ AI is validating document... Please wait...
                        </div>

                        <div id="grid_${i}" style="display:none; text-align:left;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
                                <h4 style="margin: 0; font-size: 14px; font-weight: bold; color: #0f172a;">${docName}</h4>
                                <div>
                                    <button type="button" onclick="openFullView('${i}')" style="font-size:11px; padding:4px 10px; background:#e0e7ff; color:#3730a3; border:none; border-radius:12px; font-weight:bold; cursor:pointer; margin-right:8px; transition:0.2s;">🔍 Full View</button>
                                    <span id="status_badge_${i}" style="font-size:11px; padding:4px 10px; background:#e2e8f0; color:#334155; border-radius:12px; font-weight:bold;">Pending</span>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 15px; margin-bottom: 15px; flex-wrap: wrap;">
                                <div id="preview_container_${i}" style="flex: 1; min-width: 250px; height: 220px; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc;"></div>
                                
                                <div id="extracted_data_${i}" class="ai-data-box" style="flex: 1; min-width: 250px; height: 220px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; padding: 15px; font-size: 13px;">
                                    <div style="color: #64748b; text-align: center; margin-top: 80px;">Waiting for extraction...</div>
                                </div>
                            </div>
                            
                            <div style="display:flex; justify-content:center; gap:10px;">
                                <button type="button" style="background:#fff; border:1px solid #ef4444; color:#ef4444; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;" onclick="removeFile(${i})">Change File</button>
                                <button type="button" id="confirm_${i}" style="background:var(--primary-color); border:none; color:#fff; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;" onclick="confirmData(${i}, ${isReq}, '${docName}')">Confirm Upload</button>
                            </div>
                        </div>
                    `;
                    ocrContainer.appendChild(div);

                    document.getElementById(`file_${i}`).addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if(!file) return;

                        if (file.size > maxSize * 1024 * 1024) {
                            alert(`File is too large! Maximum allowed size for this document is ${maxSize}MB.`);
                            e.target.value = ''; 
                            return;
                        }

                        processDocumentSelection(file, i, docName, isOcr);
                    });
                });
            }

            if (requiredDocsCount === 0) {
                document.getElementById('btn-submit-app').disabled = false;
            }

        } catch (err) {
            console.error("Error initializing page:", err);
            alert("Failed to load details.");
        }
    }

    // --- 4. BACKEND OCR OR BYPASS LOGIC ---
    async function processDocumentSelection(file, index, expectedDocName, isOcrEnabled) {
        document.getElementById(`zone_${index}`).style.display = 'none';
        
        const fileUrl = URL.createObjectURL(file);
        window.tempFileUrls[index] = { url: fileUrl, type: file.type };

        const previewContainer = document.getElementById(`preview_container_${index}`);

        if (file.type === 'application/pdf') {
            previewContainer.innerHTML = `<iframe src="${fileUrl}#toolbar=0" width="100%" height="100%" style="border:none; display:block;"></iframe>`;
        } else {
            previewContainer.innerHTML = `<img src="${fileUrl}" style="width:100%; height:100%; object-fit:contain; display:block; margin: 0 auto;">`;
        }

        if (!isOcrEnabled) {
            const dataContainer = document.getElementById(`extracted_data_${index}`);
            if(dataContainer) dataContainer.innerHTML = `<div style="color: #64748b; text-align: center; margin-top: 80px;">AI Scan Disabled by Admin. Proceed to upload.</div>`;
            
            const badge = document.getElementById(`status_badge_${index}`);
            badge.innerText = "Ready ✓";
            badge.style.background = '#e2e8f0';
            badge.style.color = '#334155';

            const confirmBtn = document.getElementById(`confirm_${index}`);
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';

            document.getElementById(`grid_${index}`).style.display = 'block';
            return; 
        }

        const loader = document.getElementById(`loader_${index}`);
        loader.style.display = 'block';

        try {
            const formData = new FormData();
            formData.append('document', file);
            formData.append('documentType', expectedDocName);
            formData.append('applicantName', studentFullName);
            formData.append('minHsAvg', currentScholarship.min_hs_average || 0);
            formData.append('minCollegeGwa', currentScholarship.min_college_gwa || 5.0);
            
            formData.append('minHsSubject', currentScholarship.min_hs_subject_grade || 0);
            formData.append('minCollegeSubject', currentScholarship.min_college_subject_grade || 5.0);

            const BACKEND_URL = 'http://localhost:3000/api/validate-document'; 
            
            const response = await fetch(BACKEND_URL, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error("Backend validation failed.");

            const validationResult = await response.json();
            
            extractedDataStore[index] = validationResult.extracted_data || {}; 
            const dataContainer = document.getElementById(`extracted_data_${index}`);
            
            if (validationResult.extracted_data) {
                let html = `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                        <span style="font-size:16px;">✨</span>
                        <strong style="color:#0f172a; font-size:14px;">AI Extracted Information</strong>
                    </div>
                    <ul style="padding-left:0; margin:0; list-style:none; display:flex; flex-direction:column; gap:8px;">
                `;
                
                for (const [key, value] of Object.entries(validationResult.extracted_data)) {
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

                    html += `
                        <li style="background:#fff; border:1px solid #e2e8f0; padding:8px 10px; border-radius:4px;">
                            <span style="display:block; font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; margin-bottom:4px;">${key}</span>
                            <div style="color:#1e293b; font-weight:400; font-size:12px; line-height:1.4;">${displayValue}</div>
                        </li>
                    `;
                }
                html += '</ul>';
                dataContainer.innerHTML = html;
            }

            const badge = document.getElementById(`status_badge_${index}`);
            const confirmBtn = document.getElementById(`confirm_${index}`);

            if (validationResult.is_valid_source && validationResult.meets_eligibility) {
                badge.innerText = "Verified ✓";
                badge.style.background = '#dcfce7';
                badge.style.color = '#166534';
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            } else {
                badge.innerText = "Verification Failed ❌";
                badge.style.background = '#fee2e2';
                badge.style.color = '#991b1b';
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
                
                let errorMsg = `Upload Rejected: ${validationResult.rejection_reason || 'Document does not meet requirements.'}`;
                if (validationResult.missing_information && validationResult.missing_information.length > 0) {
                    errorMsg += `\nMissing Fields: ${validationResult.missing_information.join(', ')}`;
                }
                
                setTimeout(() => alert(errorMsg), 500);
            }

            loader.style.display = 'none';
            document.getElementById(`grid_${index}`).style.display = 'block';

        } catch (err) {
            console.error("Validation Error:", err);
            alert(`Validation failed. Please ensure the backend is running and the file is legible.`);
            window.removeFile(index);
        }
    }

    async function uploadFileToSupabase(file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${studentId}/${scholarshipId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await window.supabaseClient.storage
            .from('scholarship-docs') 
            .upload(fileName, file);

        if (error) throw new Error("Storage permission denied. Ensure your Supabase RLS policy allows authenticated uploads.");

        const { data: publicUrlData } = window.supabaseClient.storage
            .from('scholarship-docs')
            .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
    }

    // --- 5. DOCUMENT CONFIRMATION & FULL VIEW UTILS ---
    window.openFullView = (index) => {
        const fileData = window.tempFileUrls[index];
        if (!fileData) return;
        
        const contentContainer = document.getElementById('full-view-content');
        if (fileData.type === 'application/pdf') {
            contentContainer.innerHTML = `<iframe src="${fileData.url}#toolbar=0" width="100%" height="100%" style="border:none; display:block;"></iframe>`;
        } else {
            contentContainer.innerHTML = `<img src="${fileData.url}" style="width:100%; height:100%; object-fit:contain; display:block; background:#000;">`;
        }
        
        document.getElementById('full-view-modal').style.display = 'flex';
    };

    window.removeFile = (index) => {
        document.getElementById(`file_${index}`).value = '';
        if (document.getElementById(`fname_${index}`)) document.getElementById(`fname_${index}`).innerText = 'No file selected';
        document.getElementById(`zone_${index}`).style.display = 'block';
        document.getElementById(`grid_${index}`).style.display = 'none';
        document.getElementById(`loader_${index}`).style.display = 'none';
        extractedDataStore[index] = {}; 
        delete window.tempFileUrls[index]; 
    };

    window.confirmData = async (index, isRequired, docName) => {
        const btn = document.getElementById(`confirm_${index}`);
        btn.innerText = 'Uploading...';
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.style.cursor = 'wait';
        btn.previousElementSibling.disabled = true;
        btn.previousElementSibling.style.opacity = '0.6';

        try {
            const fileInput = document.getElementById(`file_${index}`);
            const file = fileInput.files[0];
            let fileUrl = null;

            if (file) {
                fileUrl = await uploadFileToSupabase(file);
            }

            uploadedDocumentsList.push({ 
                name: docName, 
                status: 'Attached', 
                file_url: fileUrl,
                extracted_data: extractedDataStore[index] || {} 
            });

            btn.innerText = '✔ Uploaded';
            btn.style.background = '#e2e8f0';
            btn.style.color = '#475569';
            btn.style.cursor = 'not-allowed';

            if(isRequired) validatedDocsCount++;
            
            if(validatedDocsCount >= requiredDocsCount) {
                document.getElementById('btn-submit-app').disabled = false;
            }

        } catch (err) {
            console.error("Upload error:", err);
            alert(err.message);
            btn.innerText = 'Confirm Upload';
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.previousElementSibling.disabled = false;
            btn.previousElementSibling.style.opacity = '1';
        }
    };

    // --- 6. FINAL FORM SUBMISSION ---
    document.getElementById('scholarship-application-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('btn-submit-app');
        const formResponses = {};
        
        if (currentScholarship && currentScholarship.form_fields) {
            for (let i = 0; i < currentScholarship.form_fields.length; i++) {
                const field = currentScholarship.form_fields[i];
                
                if (field.type === 'Selection') {
                    const inputs = document.querySelectorAll(`[name="q_${i}"]:checked`);
                    if (field.required && inputs.length === 0) {
                        alert(`Please answer the required question: ${field.label}`);
                        return; // Exits submission safely
                    }
                    if (inputs.length > 0) {
                        formResponses[field.label] = Array.from(inputs).map(inp => inp.value).join(', ');
                    }
                } else {
                    const input = document.querySelector(`[name="q_${i}"]`);
                    if (field.required && (!input || !input.value.trim())) {
                        alert(`Please answer the required question: ${field.label}`);
                        return; // Exits submission safely
                    }
                    if (input && input.value) {
                        formResponses[field.label] = input.value.trim();
                    }
                }
            }
        }

        submitBtn.innerText = 'Submitting...';
        submitBtn.disabled = true;

        try {
            const payload = {
                student_id: studentId,
                scholarship_id: scholarshipId,
                status: 'Pending',
                form_responses: formResponses,
                documents: uploadedDocumentsList
            };

            const { error } = await window.supabaseClient.from('applications').insert([payload]);
            if (error) throw error;

            alert('Application Submitted Successfully!');
            window.location.href = 'student-applications.html';
            
        } catch (err) {
            console.error("Submission Error:", err);
            alert("Failed to submit application: " + err.message);
            submitBtn.innerText = 'Submit Application';
            submitBtn.disabled = false;
        }
    });

    init();
});