document.addEventListener('DOMContentLoaded', async () => {
    
    // ==========================================
    // 1. AUTH CHECK & HEADER PROFILE LOGIC
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    let currentAdminSchoolId = null;
    const adminId = session.user.id;

    try {
        const { data: profile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', adminId)
            .single();

        if (profileError) throw profileError;

        if (profile) {
            if (profile.role !== 'admin') {
                window.location.href = 'student-dashboard.html';
                return;
            }
            currentAdminSchoolId = profile.school_id;

            const firstName = profile.first_name || 'Admin';
            const lastName = profile.last_name || '';
            
            if (document.getElementById('header-name')) document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
            if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;
        }
    } catch (err) {
        console.error("Error fetching admin profile:", err);
    }

    // ==========================================
    // 2. DROPDOWN & LOGOUT MODAL LOGIC
    // ==========================================
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
    const logoutBtn = document.getElementById('dropdown-logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (logoutModal) logoutModal.style.display = 'flex';
            if (profileMenu) profileMenu.classList.remove('show'); 
        });
    }

    if (modalCancel) modalCancel.addEventListener('click', () => logoutModal.style.display = 'none');
    if (logoutModal) logoutModal.addEventListener('click', (e) => { if (e.target === logoutModal) logoutModal.style.display = 'none'; });

    if (modalConfirm) {
        modalConfirm.addEventListener('click', async () => {
            modalConfirm.innerText = "Logging out...";
            modalConfirm.disabled = true;
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }

    // ==========================================
    // 3. DYNAMIC SLOTS LOGIC
    // ==========================================
    const dynamicSlotsCb = document.getElementById('dynamicSlots');
    const fixedSlotsInput = document.getElementById('fixedSlots');

    if (dynamicSlotsCb && fixedSlotsInput) {
        dynamicSlotsCb.addEventListener('change', (e) => {
            fixedSlotsInput.style.display = e.target.checked ? 'none' : 'block';
            if(e.target.checked) fixedSlotsInput.value = '';
        });
    }

    // ==========================================
    // 4. FORM BUILDER (Auto-Collected & Custom)
    // ==========================================
    
    const autoFields = ["Full Name", "Gender", "Address", "Program", "Year Level"];
    const autoFieldsContainer = document.getElementById('auto-fields-container');
    
    if (autoFieldsContainer) {
        autoFieldsContainer.innerHTML = '';
        autoFields.forEach(field => {
            autoFieldsContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px 15px; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:8px;">
                    <div style="font-size:14px; font-weight:600; color:#334155;">🔒 ${field}</div>
                    <select class="auto-field-format" data-field="${field}" style="padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; outline:none; cursor:pointer;">
                        <option value="No formatting">No formatting</option>
                        <option value="UPPERCASE">Convert to UPPERCASE</option>
                        <option value="lowercase">Convert to lowercase</option>
                        <option value="Capitalize Each Word">Capitalize Each Word</option>
                    </select>
                </div>
            `;
        });
    }

    const formBuilderContainer = document.getElementById('form-builder-container');
    const addFieldBtn = document.getElementById('add-field-btn');

    const addFormFieldRow = (label = '', type = 'Text', required = true) => {
        const row = document.createElement('div');
        row.className = 'builder-row form-field-item';
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '10px';
        row.style.marginBottom = '15px';
        row.style.padding = '15px';
        row.style.background = '#f8fafc';
        row.style.border = '1px solid #e2e8f0';
        row.style.borderRadius = '8px';

        row.innerHTML = `
            <div style="display:flex; gap:15px; align-items:center; flex-wrap:wrap;">
                <div style="flex:1; min-width: 250px;">
                    <input type="text" class="field-label" value="${label}" placeholder="e.g. Estimated Annual Family Income" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; outline:none;">
                </div>
                <div>
                    <select class="field-type" style="padding:8px; border:1px solid #cbd5e1; border-radius:4px; outline:none; cursor:pointer;">
                        <option value="Text" ${type === 'Text' ? 'selected' : ''}>Text</option>
                        <option value="Number" ${type === 'Number' ? 'selected' : ''}>Number</option>
                        <option value="Email" ${type === 'Email' ? 'selected' : ''}>Email</option>
                        <option value="Date" ${type === 'Date' ? 'selected' : ''}>Date</option>
                        <option value="Dropdown" ${type === 'Dropdown' ? 'selected' : ''}>Dropdown</option>
                        <option value="Selection" ${type === 'Selection' ? 'selected' : ''}>Selection (Radio/Checkbox)</option>
                    </select>
                </div>
                <div>
                    <select class="field-format" style="padding:8px; border:1px solid #cbd5e1; border-radius:4px; outline:none; cursor:pointer; display:${type === 'Text' ? 'block' : 'none'};">
                        <option value="No formatting">No formatting</option>
                        <option value="UPPERCASE">UPPERCASE</option>
                        <option value="lowercase">lowercase</option>
                        <option value="Capitalize Each Word">Capitalize Each Word</option>
                    </select>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label class="toggle-switch"><input type="checkbox" class="field-required" ${required ? 'checked' : ''}><span class="slider"></span></label> 
                    <span style="font-size:13px; font-weight:500;">Required</span>
                </div>
                <div class="action-btns">
                    <button type="button" class="btn-icon delete-row-btn" style="color:#ef4444; border:none; background:transparent; cursor:pointer; font-size:18px;"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            
            <div class="options-container" style="display: ${['Dropdown', 'Selection'].includes(type) ? 'block' : 'none'}; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                <div class="multiple-choice-toggle" style="display: ${type === 'Selection' ? 'flex' : 'none'}; align-items:center; gap:8px; margin-bottom:15px; background: #e0e7ff; padding: 10px; border-radius: 6px;">
                    <label class="toggle-switch"><input type="checkbox" class="field-multiple"><span class="slider"></span></label>
                    <span style="font-size:13px; font-weight:600; color:#3730a3;">Allow students to select multiple options (Checkboxes)</span>
                </div>
                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:8px;">Custom Options</label>
                <div class="options-list"></div>
                <button type="button" class="btn-outline add-option-btn" style="padding:6px 12px; font-size:12px; margin-top:8px;">+ Add Option</button>
            </div>
        `;
        
        const typeSelect = row.querySelector('.field-type');
        const formatSelect = row.querySelector('.field-format');
        const optionsContainer = row.querySelector('.options-container');
        const multipleContainer = row.querySelector('.multiple-choice-toggle');
        const optionsList = row.querySelector('.options-list');
        const addOptionBtn = row.querySelector('.add-option-btn');

        typeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            formatSelect.style.display = val === 'Text' ? 'block' : 'none';
            if (val === 'Dropdown' || val === 'Selection') {
                optionsContainer.style.display = 'block';
                multipleContainer.style.display = val === 'Selection' ? 'flex' : 'none';
                if(optionsList.children.length === 0) createOptionInput(optionsList);
            } else {
                optionsContainer.style.display = 'none';
            }
        });

        const createOptionInput = (listContainer) => {
            const optDiv = document.createElement('div');
            optDiv.style.display = 'flex';
            optDiv.style.gap = '8px';
            optDiv.style.marginBottom = '8px';
            optDiv.innerHTML = `
                <input type="text" class="option-input" placeholder="Enter option..." style="flex:1; padding:8px 12px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; outline:none;">
                <button type="button" class="remove-option-btn" style="color:#ef4444; border:none; background:transparent; cursor:pointer; font-weight:bold; padding: 0 10px;"><i class="fa-solid fa-xmark"></i></button>
            `;
            optDiv.querySelector('.remove-option-btn').addEventListener('click', () => optDiv.remove());
            listContainer.appendChild(optDiv);
        };

        addOptionBtn.addEventListener('click', () => createOptionInput(optionsList));
        row.querySelector('.delete-row-btn').addEventListener('click', () => row.remove());
        
        if (formBuilderContainer) formBuilderContainer.appendChild(row);
    };

    addFormFieldRow('Why do you deserve this educational assistance?', 'Text', true);
    if(addFieldBtn) addFieldBtn.addEventListener('click', () => addFormFieldRow());


    // ==========================================
    // 5. DOCUMENT BUILDER
    // ==========================================
    const docBuilderContainer = document.getElementById('doc-builder-container');
    const addDocBtn = document.getElementById('add-doc-btn');

    let docRequirements = [
        { id: 1, name: "Report Card (Form 138) (High School Level)", description: "", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true },
        { id: 2, name: "General Weighted Average (College Level)", description: "", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true },
        { id: 3, name: "Certification from the School Principal", description: "", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true },
        { id: 4, name: "Official Honor Certificate", description: "", size: 5, required: false, ocr: true, isDefault: true, isIncluded: true },
        { id: 5, name: "Certificate of Residency", description: "", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true },
        { id: 6, name: "Barangay Clearance", description: "", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true },
        { id: 7, name: "Certificate of Indigency", description: "Verifies family income. System will extract Name, Address, Date Issued, and Signature.", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true }
    ];

    function renderDocs() {
        if(!docBuilderContainer) return;
        docBuilderContainer.innerHTML = '';

        docRequirements.forEach((doc, index) => {
            const row = document.createElement('div');
            row.className = 'doc-req-item';
            
            const isRowActive = doc.isIncluded !== false;
            row.style.opacity = isRowActive ? '1' : '0.5';
            row.style.border = '1px solid #e2e8f0';
            row.style.borderRadius = '8px';
            row.style.marginBottom = '15px';
            row.style.padding = '15px';
            row.style.background = '#f8fafc';
            row.style.transition = '0.3s all';

            const disableInputsAttr = !isRowActive ? 'disabled' : '';
            const inputBg = doc.isDefault || !isRowActive ? 'background:#f1f5f9; color:#475569;' : 'background:#fff;';

            const isOcrClickable = doc.isDefault && isRowActive;
            const ocrDisabledAttr = isOcrClickable ? '' : 'disabled';
            const ocrCursor = isOcrClickable ? 'pointer' : 'not-allowed';
            const ocrBgColor = (doc.ocr && isRowActive) ? '#10b981' : '#cbd5e1'; 

            row.innerHTML = `
                <div style="display: flex; gap: 15px; align-items: flex-start; flex-wrap: wrap;">
                    
                    <div style="flex: 2; min-width: 250px;">
                        <label style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:5px; display:block;">Document Name</label>
                        <input type="text" class="doc-name" value="${doc.name}" onchange="updateDoc(${index}, 'name', this.value)" ${doc.isDefault || !isRowActive ? 'readonly' : ''} style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; outline:none; ${inputBg}">
                        <input type="text" class="doc-desc mt-10" placeholder="Optional brief description/instructions for the student..." value="${doc.description || ''}" onchange="updateDoc(${index}, 'description', this.value)" ${disableInputsAttr} style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; outline:none;">
                    </div>
                    
                    <div style="flex: 1; min-width: 100px;">
                        <label style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:5px; display:block;">Max Size</label>
                        <select class="doc-size" onchange="updateDoc(${index}, 'size', this.value)" ${disableInputsAttr} style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; outline:none; cursor:${isRowActive ? 'pointer' : 'not-allowed'};">
                            <option value="2" ${doc.size == 2 ? 'selected' : ''}>2 MB</option>
                            <option value="5" ${doc.size == 5 ? 'selected' : ''}>5 MB</option>
                            <option value="10" ${doc.size == 10 ? 'selected' : ''}>10 MB</option>
                        </select>
                    </div>
                    
                    <div style="flex: 1; min-width: 120px; text-align:center;">
                        <label style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:5px; display:block;">AI OCR Scan</label>
                        <label class="toggle-switch" title="${doc.isDefault ? 'Enable OCR AI Validation?' : 'AI Scan is only available for system default documents'}">
                            <input type="checkbox" class="doc-ocr" onchange="updateDoc(${index}, 'ocr', this.checked)" ${doc.ocr ? 'checked' : ''} ${ocrDisabledAttr}>
                            <span class="slider" style="background-color: ${ocrBgColor}; cursor:${ocrCursor};"></span>
                        </label>
                    </div>
                    
                    <div style="flex: 1; min-width: 120px; display:flex; justify-content:flex-end; align-items:center;">
                        ${doc.isDefault 
                            ? `<div style="text-align:center;">
                                 <label style="font-size:12px; font-weight:600; color:#64748b; margin-bottom:5px; display:block;">Include</label>
                                 <label class="toggle-switch" title="Include this default document?">
                                     <input type="checkbox" onchange="updateDoc(${index}, 'isIncluded', this.checked)" ${doc.isIncluded ? 'checked' : ''}>
                                     <span class="slider" style="background-color: ${doc.isIncluded ? '#3b82f6' : '#cbd5e1'};"></span>
                                 </label>
                               </div>` 
                            : `<button type="button" onclick="removeDoc(${index})" style="color:#ef4444; margin-top:20px; border:none; background:transparent; cursor:pointer; font-size:14px; padding:6px 12px; border-radius:4px; border:1px solid #fecaca;"><i class="fa-solid fa-trash-can"></i> Remove</button>`
                        }
                    </div>
                </div>
            `;
            docBuilderContainer.appendChild(row);
        });
    }

    window.updateDoc = (index, key, value) => {
        docRequirements[index][key] = value;
        if (key === 'isIncluded') {
            if (value === false) docRequirements[index].required = false;
            else docRequirements[index].required = true;
            renderDocs();
        }
        if (key === 'ocr') renderDocs();
    };

    window.removeDoc = (index) => {
        docRequirements.splice(index, 1);
        renderDocs();
    };

    if(addDocBtn) {
        addDocBtn.addEventListener('click', () => {
            docRequirements.push({
                id: Date.now(),
                name: "New Custom Document",
                description: "",
                size: 5,
                required: true,
                ocr: false, 
                isDefault: false,
                isIncluded: true
            });
            renderDocs();
        });
    }

    renderDocs();

    // ==========================================
    // 6. VISUAL RTE TOOLBAR LOGIC (WYSIWYG)
    // ==========================================
    const rteButtons = document.querySelectorAll('.rte-toolbar button');
    const editor = document.getElementById('sch_description_editor');
    const hiddenDescInput = document.getElementById('sch_description');

    if (rteButtons.length > 0 && editor && hiddenDescInput) {
        
        // Update hidden input on typing
        editor.addEventListener('input', () => {
            hiddenDescInput.value = editor.innerHTML;
        });

        // Function to highlight active buttons based on cursor position
        const updateToolbarState = () => {
            rteButtons.forEach(btn => {
                const cmd = btn.getAttribute('data-cmd');
                if (cmd && document.queryCommandState(cmd)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        };

        // Listen for user navigation/typing inside the editor
        editor.addEventListener('keyup', updateToolbarState);
        editor.addEventListener('mouseup', updateToolbarState);
        editor.addEventListener('click', updateToolbarState);

        rteButtons.forEach(btn => {
            // Prevent the button click from stealing focus from the text editor!
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
            });

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const cmd = btn.getAttribute('data-cmd');
                if (cmd) {
                    // Executes formatting natively in the browser
                    document.execCommand(cmd, false, null);
                    
                    editor.focus();
                    hiddenDescInput.value = editor.innerHTML; 
                    updateToolbarState(); // Instantly update active states
                }
            });
        });
    }

    // ==========================================
    // 7. GATHER DATA
    // ==========================================
    const gatherScholarshipData = (status) => {
        
        const autoFormats = {};
        document.querySelectorAll('.auto-field-format').forEach(select => {
            autoFormats[select.dataset.field] = select.value;
        });

        const formFields = [];
        document.querySelectorAll('.form-field-item').forEach(row => {
            const type = row.querySelector('.field-type').value;
            const formatRule = row.querySelector('.field-format').value;
            let options = [];

            if (type === 'Dropdown' || type === 'Selection') {
                row.querySelectorAll('.option-input').forEach(opt => {
                    if (opt.value.trim() !== '') options.push(opt.value.trim());
                });
            }

            formFields.push({
                label: row.querySelector('.field-label').value.trim(),
                type: type,
                format_rule: type === 'Text' ? formatRule : 'No formatting',
                required: row.querySelector('.field-required').checked,
                allow_multiple: type === 'Selection' ? row.querySelector('.field-multiple').checked : false,
                options: options 
            });
        });

        const activeDocs = docRequirements.filter(doc => doc.isIncluded !== false);
        const finalDocsNames = activeDocs.map(doc => doc.name); 

        const structuredDocs = activeDocs.map(doc => ({
            name: doc.name,
            description: doc.description,
            max_size: doc.size,
            required: doc.required,
            ocr_enabled: doc.ocr,
            is_system_default: doc.isDefault,
            allowed_types: ['PDF', 'JPG', 'PNG']
        }));

        const batch = document.getElementById('sch_batch') ? document.getElementById('sch_batch').value : '';
        const semester = document.getElementById('sch_semester') ? document.getElementById('sch_semester').value : '';
        const schoolYear = document.getElementById('sch_school_year') ? document.getElementById('sch_school_year').value : '';

        const isDynamicSlots = document.getElementById('dynamicSlots') ? document.getElementById('dynamicSlots').checked : false;
        const slotsValue = isDynamicSlots ? "Open" : (parseInt(document.getElementById('fixedSlots')?.value) || 0);

        const getSelectedOptions = (id) => {
            const el = document.getElementById(id);
            return el ? Array.from(el.selectedOptions).map(opt => opt.value) : [];
        };
        const targetYears = getSelectedOptions('eligibilityYears');
        const targetPrograms = getSelectedOptions('eligibilityPrograms');

        const minHsAvg = document.getElementById('minHsAverage')?.value ? parseFloat(document.getElementById('minHsAverage').value) : null;
        const minColGwa = document.getElementById('minCollegeGwa')?.value ? parseFloat(document.getElementById('minCollegeGwa').value) : null;
        const minHsSubject = document.getElementById('minHsSubject')?.value ? parseFloat(document.getElementById('minHsSubject').value) : null; 
        const minColSubject = document.getElementById('minCollegeSubject')?.value ? parseFloat(document.getElementById('minCollegeSubject').value) : null; 

        return {
            title: document.getElementById('sch_title')?.value.trim() || document.getElementById('title')?.value.trim(),
            category: document.getElementById('sch_category')?.value || 'Institution-Funded Educational Assistance',
            scholarship_type: document.getElementById('sch_type')?.value || 'Merit-Based',
            description: document.getElementById('sch_description')?.value.trim() || document.getElementById('description')?.value.trim(),
            start_date: document.getElementById('sch_start')?.value || null,
            end_date: document.getElementById('sch_end')?.value || null,
            batch: batch,
            semester: semester,
            school_year: schoolYear,
            slots: slotsValue.toString(),
            available_slots: isDynamicSlots ? 0 : (parseInt(document.getElementById('fixedSlots')?.value) || 0),
            eligibility_years: targetYears,
            eligibility_programs: targetPrograms,
            min_hs_average: minHsAvg,
            min_college_gwa: minColGwa,
            min_hs_subject_grade: minHsSubject,
            min_college_subject_grade: minColSubject,
            required_documents: finalDocsNames, 
            document_configurations: structuredDocs, 
            form_fields: formFields,
            auto_collected_formats: autoFormats,
            status: status,
            school_id: currentAdminSchoolId 
        };
    };

    // ==========================================
    // 8. PREVIEW & SAVE LOGIC
    // ==========================================
    const publishBtn = document.getElementById('publish-btn');
    const draftBtn = document.getElementById('save-draft-btn');
    const previewBtn = document.getElementById('preview-btn');

    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const data = gatherScholarshipData('Preview');
            
            let dateText = "Not Set";
            if (data.end_date) {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                dateText = new Date(data.end_date).toLocaleDateString('en-US', options);
            }

            let html = `
            <div class="preview-mockup">
                <div class="preview-mockup-header">
                    <span><i class="fa-solid fa-graduation-cap"></i> Educational Assistance Application Form</span>
                    <span>Please review your details carefully before submitting.</span>
                </div>
                <div class="preview-mockup-body">
                    <div class="preview-badges">
                        <span class="preview-badge-cat">${data.category || 'Institution-Funded'}</span>
                        <span class="preview-badge-type">${data.scholarship_type || 'Merit-Based'}</span>
                    </div>
                    
                    <div class="preview-title">${data.title || 'Untitled Educational Assistance'}</div>
                    <div class="preview-subtitle">General Admin</div>

                    <div class="preview-split">
                        <div>
                            <h4 style="font-size:16px; margin-bottom:10px;">About this Educational Assistance</h4>
                            <div style="font-size:13px; color:#475569; margin-bottom:20px; line-height:1.6;">${data.description || 'An educational assistance program that recognizes students with outstanding academic performance.'}</div>
                            
                            <h4 style="font-size:16px; margin-bottom:10px;">Eligibility Requirements</h4>
                            <ul style="list-style:none; font-size:13px; color:#475569; padding:0;">
                                ${data.min_college_gwa ? `<li style="margin-bottom:6px;"><i class="fa-solid fa-check text-green"></i> Must have a College GWA of <b>${data.min_college_gwa}</b> or better.</li>` : ''}
                                ${data.min_college_subject_grade ? `<li style="margin-bottom:6px;"><i class="fa-solid fa-check text-green"></i> Must have NO individual College subject grade lower than <b>${data.min_college_subject_grade}</b>.</li>` : ''}
                                <li style="margin-bottom:6px;"><i class="fa-solid fa-check text-green"></i> Open to Year Levels: <b>${data.eligibility_years.length > 0 ? data.eligibility_years.join(', ') : 'Any'}</b>.</li>
                            </ul>
                        </div>
                        
                        <div class="preview-info-box">
                            <div class="preview-info-label">Application Deadline</div>
                            <div class="preview-info-value text-red">${dateText}</div>
                            
                            <div class="preview-info-label">Available Slots</div>
                            <div class="preview-info-value">${data.slots}</div>
                            
                            <div class="preview-info-label">Status</div>
                            <div class="preview-info-value text-green">ACTIVE</div>
                        </div>
                    </div>

                    <div style="text-align:center; margin-bottom:30px;">
                        <h2 style="font-size:22px; margin-bottom:5px;">Application Form</h2>
                        <p style="color:#64748b; font-size:13px;">Complete the required fields below.</p>
                    </div>

                    <div class="preview-section-title">1. Applicant Profile</div>
                    <p style="font-size:12px; color:#64748b; margin-bottom:15px;">This information is permanently tied to your account. To edit, go to Profile Settings.</p>
                    
                    <div class="preview-field-grid">
                        <div class="preview-input-group"><label>Student ID Number</label><input type="text" class="preview-input" value="202302709" readonly></div>
                        <div class="preview-input-group"><label>Email Address</label><input type="text" class="preview-input" value="student@gmail.com" readonly></div>
                        <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Full Name</label><input type="text" class="preview-input" value="John Jeffrey T. Cañete" readonly></div>
                        <div class="preview-input-group"><label>Date of Birth</label><input type="text" class="preview-input" value="N/A" readonly></div>
                        <div class="preview-input-group"><label>Gender</label><input type="text" class="preview-input" value="Male" readonly></div>
                        <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Address</label><input type="text" class="preview-input" value="N/A" readonly></div>
                        <div class="preview-input-group"><label>Program</label><input type="text" class="preview-input" value="BS Information Technology" readonly></div>
                        <div class="preview-input-group"><label>Year Level</label><input type="text" class="preview-input" value="4th year" readonly></div>
                    </div>

                    <div class="preview-section-title">2. Questionnaire</div>
                    ${data.form_fields.length === 0 ? '<p style="font-size:13px; color:#64748b;">No custom questions added.</p>' : ''}
                    ${data.form_fields.map(f => `
                        <div class="preview-input-group" style="margin-bottom:15px;">
                            <label>${f.label} ${f.required ? '<span class="text-red">*</span>' : ''}</label>
                            ${['Dropdown', 'Selection'].includes(f.type) 
                                ? `<select class="preview-input preview-input-active"><option>Select option...</option>${f.options.map(o=>`<option>${o}</option>`).join('')}</select>`
                                : `<input type="text" class="preview-input preview-input-active" placeholder="Enter your answer...">`
                            }
                        </div>
                    `).join('')}

                    <div class="preview-section-title">3. Document Uploads</div>
                    <div class="preview-ai-banner">
                        <i class="fa-solid fa-robot" style="font-size:18px;"></i>
                        <div>
                            <strong>AI Verification Active:</strong> Please ensure your documents are clear and legible. Our AI system will scan the contents to verify authenticity, signatures, and ensure your grades meet the minimum eligibility rules for this educational assistance.
                        </div>
                    </div>

                    ${data.document_configurations.length === 0 ? '<p style="font-size:13px; color:#64748b;">No documents required.</p>' : ''}
                    ${data.document_configurations.map(d => `
                        <div class="preview-doc-box">
                            <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:5px;">
                                <i class="fa-solid fa-file-arrow-up"></i> Upload ${d.name} ${d.required ? '<span class="text-red">*</span>' : ''}
                                ${d.ocr_enabled ? '<span style="color:#2563eb; font-size:10px; margin-left:5px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Scan</span>' : ''}
                            </label>
                            <div style="font-size:11px; color:#64748b; margin-bottom:10px;">Allowed: PDF, JPG, PNG (Max: ${d.max_size}MB)</div>
                            <button type="button" style="padding:6px 16px; background:#fff; border:1px solid #cbd5e1; border-radius:4px; font-size:12px; cursor:not-allowed;">Choose File</button>
                            <span style="font-size:11px; color:#94a3b8; margin-left:10px;">No file selected</span>
                        </div>
                    `).join('')}

                    <button type="button" class="preview-submit-btn">Submit Application</button>
                </div>
            </div>`;

            Swal.fire({
                html: html,
                width: '800px',
                padding: '0',
                showConfirmButton: false,
                showCloseButton: true,
                allowOutsideClick: false,
                allowEscapeKey: false,
                customClass: {
                    popup: 'preview-swal-popup'
                }
            });
        });
    }

    const saveScholarship = async (status, btnElement) => {
        try {
            const payload = gatherScholarshipData(status);

            if (!payload.title) {
                Swal.fire('Missing Information', 'Please provide an Educational Assistance Name.', 'warning');
                return;
            }

            if (!payload.school_id) {
                Swal.fire('Account Error', 'Cannot save: Your admin account is not linked to a school.', 'error');
                return;
            }

            if (status === 'Active') {
                const confirm = await Swal.fire({
                    title: 'Ready to Publish?',
                    text: "Once published, students will be able to view and apply to this assistance program.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#10b981',
                    cancelButtonColor: '#94a3b8',
                    confirmButtonText: 'Yes, Publish Now!'
                });
                if (!confirm.isConfirmed) return;
            }

            btnElement.innerText = "Saving...";
            btnElement.disabled = true;

            const { error } = await window.supabaseClient.from('scholarships').insert([payload]);

            if (error) throw error;

            await Swal.fire({
                title: 'Success!',
                text: `Educational Assistance successfully saved as ${status}!`,
                icon: 'success',
                confirmButtonColor: '#10b981'
            });
            
            window.location.href = 'admin-scholarships.html';

        } catch (error) {
            console.error('Error saving:', error);
            Swal.fire('Save Failed', error.message, 'error');
        } finally {
            btnElement.innerText = status === 'Active' ? 'Publish Educational Assistance' : 'Save as Draft';
            btnElement.disabled = false;
        }
    };

    if(publishBtn) publishBtn.addEventListener('click', () => saveScholarship('Active', publishBtn));
    if(draftBtn) draftBtn.addEventListener('click', () => saveScholarship('Draft', draftBtn));

    // ==========================================
    // 9. MOBILE HAMBURGER MENU TOGGLE
    // ==========================================
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuToggle && sidebar && sidebarOverlay) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }
});