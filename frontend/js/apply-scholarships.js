document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 0. INJECT CSS TO HIDE NUMBER SPINNERS ---
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
    `;
    document.head.appendChild(style);

    // --- 1. DYNAMICALLY LOAD LIBRARIES ---
    const tesseractScript = document.createElement('script');
    tesseractScript.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    document.head.appendChild(tesseractScript);

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

    // --- 3. INIT FUNCTION ---
    async function init() {
        try {
            // A. Fetch Student Profile (Fill Form & Header)
            const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', studentId).single();
            
            if(profile) {
                // Fill Header
                const firstName = profile.first_name || 'Student';
                const lastName = profile.last_name || '';
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
                if(document.getElementById('header-program')) document.getElementById('header-program').innerText = profile.course || 'Student Profile';
                if(profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                // Fill Application Form Read-Only Fields
                if(document.getElementById('prof-id')) document.getElementById('prof-id').value = profile.id_number || 'N/A';
                if(document.getElementById('prof-email')) document.getElementById('prof-email').value = studentEmail || 'N/A';
                if(document.getElementById('prof-fullname')) document.getElementById('prof-fullname').value = `${firstName} ${profile.middle_name ? profile.middle_name + ' ' : ''}${lastName}`.trim();
                if(document.getElementById('prof-program')) document.getElementById('prof-program').value = profile.course || 'N/A';
                if(document.getElementById('prof-year')) document.getElementById('prof-year').value = profile.year_level || 'N/A';
            }

            // B. Fetch Scholarship Details
            const { data: sch } = await window.supabaseClient.from('scholarships').select('*').eq('id', scholarshipId).single();
            
            if(document.getElementById('sch-category')) document.getElementById('sch-category').innerText = sch.category || 'Scholarship';
            if(document.getElementById('sch-title')) document.getElementById('sch-title').innerText = sch.title;
            if(document.getElementById('sch-provider')) document.getElementById('sch-provider').innerText = sch.department || 'General Admin';
            if(document.getElementById('sch-description')) document.getElementById('sch-description').innerHTML = sch.description || 'No description provided.';
            
            const dateObj = sch.end_date ? new Date(sch.end_date) : null;
            if(document.getElementById('sch-deadline')) document.getElementById('sch-deadline').innerText = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No Deadline';
            if(document.getElementById('sch-slots')) document.getElementById('sch-slots').innerText = sch.available_slots || 'Unlimited';

            // C. Render Eligibility Rules
            const elList = document.getElementById('sch-eligibility');
            if (elList) {
                elList.innerHTML = ''; 
                if (sch.eligibility_rules) {
                    let hasRules = false;
                    if (sch.eligibility_rules.gwa && sch.eligibility_rules.gwa.enabled) {
                        elList.innerHTML += `<li>Must have a GWA of <strong>${sch.eligibility_rules.gwa.minimum}</strong> or better.</li>`;
                        hasRules = true;
                    }
                    if (sch.eligibility_rules.year_levels && sch.eligibility_rules.year_levels.enabled && sch.eligibility_rules.year_levels.allowed.length > 0) {
                        elList.innerHTML += `<li>Open to Year Levels: <strong>${sch.eligibility_rules.year_levels.allowed.join(', ')}</strong>.</li>`;
                        hasRules = true;
                    }
                    if (sch.eligibility_rules.program_department && sch.eligibility_rules.program_department.enabled && sch.eligibility_rules.program_department.allowed.length > 0) {
                        elList.innerHTML += `<li>Open to Programs: <strong>${sch.eligibility_rules.program_department.allowed.join(', ')}</strong>.</li>`;
                        hasRules = true;
                    }
                    if (!hasRules) elList.innerHTML = `<li>No specific eligibility restrictions for this scholarship.</li>`;
                }
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
                            optionsHtml += `
                                <label class="radio-checkbox-label">
                                    <input type="${inputType}" name="q_${i}" value="${opt}" ${reqStr}>
                                    ${opt}
                                </label>
                            `;
                        });
                        inputHtml = `<div style="padding-top:10px;">${optionsHtml}</div>`;
                    } else if (field.type === 'Dropdown') {
                        let optionsHtml = field.options.map(o => `<option value="${o}">${o}</option>`).join('');
                        inputHtml = `<select class="dynamic-select" name="q_${i}" ${reqStr}><option value="">Select...</option>${optionsHtml}</select>`;
                    } else if (field.type === 'Date') {
                        inputHtml = `<input type="date" class="dynamic-input" name="q_${i}" ${reqStr}>`;
                    } else {
                        const isNumber = field.type && field.type.toLowerCase() === 'number';
                        const htmlType = isNumber ? 'number' : 'text';
                        inputHtml = `<input type="${htmlType}" class="dynamic-input" name="q_${i}" placeholder="Enter your answer..." ${reqStr}>`;
                    }
                    
                    div.innerHTML = `<label style="display:block; font-size:13px; font-weight:600; color:#1e293b; margin-bottom:8px;">${field.label}${reqIcon}</label>${inputHtml}`;
                    if(field.type === 'Textarea' || field.type === 'Text') div.style.gridColumn = '1 / -1';
                    
                    questionsContainer.appendChild(div);
                });
            }

            // E. Render Document Uploads (Dashed Boxes)
            const ocrContainer = document.getElementById('ocr-documents-container');
            if (sch.document_requirements && ocrContainer) {
                sch.document_requirements.forEach((doc, i) => {
                    if (!doc.required) return; 
                    requiredDocsCount++;
                    
                    const div = document.createElement('div');
                    div.className = 'doc-dashed-box';
                    div.id = `block_${i}`;
                    
                    div.innerHTML = `
                        <div id="zone_${i}">
                            <div class="doc-title">📄 Upload ${doc.name} <span style="color:#ef4444;">*</span></div>
                            <div class="doc-subtitle">Allowed formats: PDF, JPG, PNG</div>
                            <input type="file" id="file_${i}" accept="image/*,application/pdf" style="display:none">
                            <button type="button" class="btn-upload" onclick="document.getElementById('file_${i}').click()">Choose File</button>
                            <div id="fname_${i}" style="margin-top: 10px; font-size: 12px; color: #64748b;">No file selected</div>
                        </div>

                        <div id="loader_${i}" style="display:none; text-align:center; padding: 20px; color: var(--primary-color); font-weight: bold;">
                            ⚙️ Processing document... Please wait...
                        </div>

                        <div id="grid_${i}" style="display:none; text-align:left;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
                                <h4 style="margin: 0; font-size: 14px; font-weight: bold; color: #0f172a;">${doc.name}</h4>
                                <span id="status_badge_${i}" style="font-size:11px; padding:4px 10px; background:#dcfce7; color:#166534; border-radius:12px; font-weight:bold;">Pending</span>
                            </div>
                            <div id="preview_container_${i}" style="height: 180px; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; margin-bottom: 15px;"></div>
                            
                            <div style="display:flex; justify-content:center; gap:10px;">
                                <button type="button" style="background:#fff; border:1px solid #ef4444; color:#ef4444; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;" onclick="removeFile(${i})">Change File</button>
                                <button type="button" id="confirm_${i}" style="background:var(--primary-color); border:none; color:#fff; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;" onclick="confirmData(${i}, ${doc.required}, '${doc.name}')">Confirm Upload</button>
                            </div>
                        </div>
                    `;
                    ocrContainer.appendChild(div);

                    document.getElementById(`file_${i}`).addEventListener('change', (e) => {
                        if(doc.ocr_enabled) {
                            handleLocalScan(e, i, doc.name);
                        } else {
                            handleStandardUpload(e, i, doc.name);
                        }
                    });
                });
            }

            if (requiredDocsCount === 0) {
                document.getElementById('btn-submit-app').disabled = false;
            }

        } catch (err) {
            console.error("Error initializing page:", err);
            alert("Failed to load scholarship details.");
        }
    }


    // --- 4. UPLOAD & HIGH-ACCURACY OCR VERIFICATION ---
    function handleStandardUpload(event, index, docName) {
        const file = event.target.files[0];
        if(!file) return;

        document.getElementById(`zone_${index}`).style.display = 'none';
        document.getElementById(`grid_${index}`).style.display = 'block';
        
        const fileUrl = URL.createObjectURL(file);
        const previewContainer = document.getElementById(`preview_container_${index}`);
        const badge = document.getElementById(`status_badge_${index}`);
        
        badge.innerText = 'Attached';
        badge.style.background = '#e2e8f0';
        badge.style.color = '#475569';
        
        if (file.type === 'application/pdf') {
            previewContainer.innerHTML = `<iframe src="${fileUrl}#toolbar=0" width="100%" height="100%" style="border:none; display:block;"></iframe>`;
        } else {
            previewContainer.innerHTML = `<img src="${fileUrl}" style="width:100%; height:100%; object-fit:contain; display:block; margin: 0 auto;">`;
        }
    }

    async function handleLocalScan(event, index, expectedDocName) {
        const file = event.target.files[0];
        if(!file) return;

        document.getElementById(`zone_${index}`).style.display = 'none';
        const loader = document.getElementById(`loader_${index}`);
        loader.style.display = 'block';

        try {
            const fileUrl = URL.createObjectURL(file);
            const previewContainer = document.getElementById(`preview_container_${index}`);
            let imageSource = fileUrl;

            if (file.type === 'application/pdf') {
                previewContainer.innerHTML = `<iframe src="${fileUrl}#toolbar=0" width="100%" height="100%" style="border:none; display:block;"></iframe>`;
                await loadPDFJS();
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1);
                
                const viewport = page.getViewport({ scale: 2.0 }); 
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                imageSource = canvas.toDataURL('image/png');
            } else {
                previewContainer.innerHTML = `<img src="${fileUrl}" style="width:100%; height:100%; object-fit:contain; display:block;">`;
            }

            Tesseract.recognize(imageSource, 'eng').then(({ data: { text } }) => {
                
                // OCR Optimization: Standardize the text for searching
                const cleanText = text.toUpperCase().replace(/\s+/g, ' '); 
                const noSpaceText = text.toUpperCase().replace(/\s/g, ''); 
                
                let isMatch = false;

                // 1. Logic for GWA / Report Card
                if (expectedDocName.includes("Average") || expectedDocName.includes("GWA") || expectedDocName.includes("Report Card")) {
                    const hasReport = cleanText.includes("REPORT ON RATINGS") || noSpaceText.includes("REPORTONRATINGS");
                    const hasCourse = cleanText.includes("COURSE/LEVEL") || noSpaceText.includes("COURSE/LEVEL");
                    const hasCrmc = cleanText.includes("ROOSEVELT MEMORIAL") || noSpaceText.includes("ROOSEVELTMEMORIAL");
                    const hasGwa = cleanText.includes("WEIGHTED AVERAGE") || noSpaceText.includes("WEIGHTEDAVERAGE");
                    
                    isMatch = hasReport || hasCourse || hasCrmc || hasGwa;

                // 2. Strict Logic for Barangay Clearance
                } else if (expectedDocName.includes("Barangay Clearance")) {
                    const hasClearanceTitle = cleanText.includes("BARANGAY CLEARANCE") || noSpaceText.includes("BARANGAYCLEARANCE");
                    const hasNoRecord = cleanText.includes("NO RECORD") || noSpaceText.includes("NORECORD");
                    const hasGoodMoral = cleanText.includes("GOOD MORAL") || noSpaceText.includes("GOODMORAL");
                    const hasLawAbiding = cleanText.includes("LAW ABIDING") || noSpaceText.includes("LAWABIDING");
                    
                    // Crucial: Must NOT be a Certificate of Residency
                    const isNotResidency = !cleanText.includes("CERTIFICATE OF RESIDENCY") && !noSpaceText.includes("CERTIFICATEOFRESIDENCY");
                    
                    isMatch = (hasClearanceTitle || hasNoRecord || hasGoodMoral || hasLawAbiding) && isNotResidency;

                // 3. Strict Logic for Certificate of Residency
                } else if (expectedDocName.includes("Residency") || expectedDocName.includes("Certificate of Residency")) {
                    const hasCertRes = cleanText.includes("CERTIFICATE OF RESIDENCY") || noSpaceText.includes("CERTIFICATEOFRESIDENCY");
                    const hasResident = cleanText.includes("PERMANENT RESIDENT") || noSpaceText.includes("PERMANENTRESIDENT");
                    
                    // Crucial: Must NOT be a Barangay Clearance
                    const isNotClearance = !cleanText.includes("BARANGAY CLEARANCE") && !noSpaceText.includes("BARANGAYCLEARANCE");

                    isMatch = (hasCertRes || hasResident) && isNotClearance;
                }

                const badge = document.getElementById(`status_badge_${index}`);
                const confirmBtn = document.getElementById(`confirm_${index}`);

                if (isMatch) {
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

                    setTimeout(() => {
                        alert(`Upload Rejected.\n\nCould not verify this as a "${expectedDocName}". Please ensure the picture is clear and the correct document is uploaded.`);
                    }, 500);
                }

                loader.style.display = 'none';
                document.getElementById(`grid_${index}`).style.display = 'block';
            });

        } catch (err) {
            console.error("Scanning Error:", err);
            alert(`Verification failed!\nReason: ${err.message}`);
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

    // --- 5. DOCUMENT CONFIRMATION UTILS ---
    window.removeFile = (index) => {
        document.getElementById(`file_${index}`).value = '';
        if (document.getElementById(`fname_${index}`)) document.getElementById(`fname_${index}`).innerText = 'No file selected';
        document.getElementById(`zone_${index}`).style.display = 'block';
        document.getElementById(`grid_${index}`).style.display = 'none';
        document.getElementById(`loader_${index}`).style.display = 'none';
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

            uploadedDocumentsList.push({ name: docName, status: 'Verified', file_url: fileUrl });

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
        const sch = await window.supabaseClient.from('scholarships').select('form_fields').eq('id', scholarshipId).single();
        
        if (sch.data && sch.data.form_fields) {
            for (let i = 0; i < sch.data.form_fields.length; i++) {
                const field = sch.data.form_fields[i];
                
                if (field.type === 'Selection') {
                    const inputs = document.querySelectorAll(`[name="q_${i}"]:checked`);
                    if (field.required && inputs.length === 0) {
                        alert(`Please answer the required question: ${field.label}`);
                        return;
                    }
                    if (inputs.length > 0) {
                        formResponses[field.label] = Array.from(inputs).map(inp => inp.value).join(', ');
                    }
                } else {
                    const input = document.querySelector(`[name="q_${i}"]`);
                    if (field.required && (!input || !input.value.trim())) {
                        alert(`Please answer the required question: ${field.label}`);
                        return;
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