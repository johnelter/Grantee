document.addEventListener('DOMContentLoaded', async () => {
    
    // 🛑 NUCLEAR OPTION: Prevent ANY form on this page from refreshing the browser
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => e.preventDefault());
    });

    // ==========================================
    // 1. AUTH, URL PARAM CHECK & HEADER PROFILE
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const scholarshipId = urlParams.get('id');

    if (!scholarshipId) {
        alert("No educational assistance ID provided in the URL.");
        window.location.href = 'admin-scholarships.html';
        return;
    }

    const adminId = session.user.id;

    try {
        const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', adminId).single();
        if (profile) {
            if (profile.role !== 'admin') {
                window.location.href = 'student-dashboard.html';
                return;
            }

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
    // 4. DYNAMIC FORM BUILDER LOGIC
    // ==========================================
    const formBuilderContainer = document.getElementById('form-builder-container');

    const addFormFieldRow = (label = '', type = 'Text', required = true, allowMultiple = false, optionsArray = []) => {
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
            <div style="display:flex; gap:15px; align-items:center;">
                <div style="flex:1;">
                    <input type="text" class="field-label" value="${label}" placeholder="e.g. Estimated Annual Family Income" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
                </div>
                <div>
                    <select class="field-type" style="padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value="Text" ${type === 'Text' ? 'selected' : ''}>Text</option>
                        <option value="Number" ${type === 'Number' ? 'selected' : ''}>Number</option>
                        <option value="Email" ${type === 'Email' ? 'selected' : ''}>Email</option>
                        <option value="Date" ${type === 'Date' ? 'selected' : ''}>Date (e.g. Birthdate)</option>
                        <option value="Dropdown" ${type === 'Dropdown' ? 'selected' : ''}>Dropdown</option>
                        <option value="Selection" ${type === 'Selection' ? 'selected' : ''}>Selection (Radio / Checkbox)</option>
                    </select>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <label class="toggle-switch"><input type="checkbox" class="field-required" ${required ? 'checked' : ''}><span class="slider"></span></label> 
                    <span style="font-size:13px;">Required</span>
                </div>
                <div class="action-btns"><button type="button" class="btn-icon delete-row-btn" style="color:#ef4444; border:none; background:transparent; cursor:pointer;">🗑️</button></div>
            </div>
            
            <div class="options-container" style="display: ${['Dropdown', 'Selection'].includes(type) ? 'block' : 'none'}; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                
                <div class="multiple-choice-toggle" style="display: ${type === 'Selection' ? 'flex' : 'none'}; align-items:center; gap:8px; margin-bottom:15px; background: #e0e7ff; padding: 10px; border-radius: 6px;">
                    <label class="toggle-switch"><input type="checkbox" class="field-multiple" ${allowMultiple ? 'checked' : ''}><span class="slider"></span></label>
                    <span style="font-size:13px; font-weight:600; color:#3730a3;">Allow students to select multiple options (Checkboxes)</span>
                </div>

                <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:8px;">Custom Options</label>
                <div class="options-list">
                </div>
                <button type="button" class="btn-outline add-option-btn" style="padding:4px 10px; font-size:12px; margin-top:8px;">+ Add Option</button>
            </div>
        `;
        
        const typeSelect = row.querySelector('.field-type');
        const optionsContainer = row.querySelector('.options-container');
        const multipleContainer = row.querySelector('.multiple-choice-toggle');
        const optionsList = row.querySelector('.options-list');
        const addOptionBtn = row.querySelector('.add-option-btn');

        const createOptionInput = (listContainer, val = '') => {
            const optDiv = document.createElement('div');
            optDiv.style.display = 'flex';
            optDiv.style.gap = '8px';
            optDiv.style.marginBottom = '8px';
            optDiv.innerHTML = `
                <input type="text" class="option-input" value="${val}" placeholder="Enter option..." style="flex:1; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px;">
                <button type="button" class="remove-option-btn" style="color:#ef4444; border:none; background:transparent; cursor:pointer; font-weight:bold;">✕</button>
            `;
            optDiv.querySelector('.remove-option-btn').addEventListener('click', () => optDiv.remove());
            listContainer.appendChild(optDiv);
        };

        if (optionsArray && optionsArray.length > 0) {
            optionsArray.forEach(opt => createOptionInput(optionsList, opt));
        }

        typeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Dropdown' || e.target.value === 'Selection') {
                optionsContainer.style.display = 'block';
                multipleContainer.style.display = e.target.value === 'Selection' ? 'flex' : 'none';
                if(optionsList.children.length === 0) createOptionInput(optionsList);
            } else {
                optionsContainer.style.display = 'none';
            }
        });

        addOptionBtn.addEventListener('click', () => createOptionInput(optionsList));
        row.querySelector('.delete-row-btn').addEventListener('click', () => row.remove());
        
        if (formBuilderContainer) formBuilderContainer.appendChild(row);
    };

    const addFieldBtn = document.getElementById('add-field-btn');
    if (addFieldBtn) addFieldBtn.addEventListener('click', () => addFormFieldRow());


    // ==========================================
    // 5. DOCUMENT BUILDER LOGIC (REMOVED MANDATORY BUTTON)
    // ==========================================
    const docBuilderContainer = document.getElementById('doc-builder-container');
    let docRequirements = [];

    // The core defaults expected in the system
    const coreDefaultDocs = [
        { name: "Report Card (Form 138) (High School Level)", size: 5, required: true, ocr: true, isDefault: true },
        { name: "General Weighted Average (College Level)", size: 5, required: true, ocr: true, isDefault: true },
        { name: "Certification from the School Principal", size: 5, required: true, ocr: true, isDefault: true },
        { name: "Official Honor Certificate", size: 5, required: true, ocr: true, isDefault: true },
        { name: "Certificate of Residency", size: 5, required: true, ocr: true, isDefault: true },
        { name: "Barangay Clearance", size: 5, required: true, ocr: true, isDefault: true }
    ];

    function renderDocs() {
        if (!docBuilderContainer) return;
        docBuilderContainer.innerHTML = '';
        
        // Removed "Mandatory" from Header Labels
        docBuilderContainer.innerHTML = `
            <div style="display: grid; grid-template-columns: 2.5fr 1fr 1fr 1.5fr; gap: 15px; padding: 0 12px 8px 12px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">
                <div>Document Name</div>
                <div>Max Size</div>
                <div>AI OCR Scan</div>
                <div style="text-align: right;">Include</div>
            </div>
        `;

        docRequirements.forEach((doc, index) => {
            const row = document.createElement('div');
            row.className = 'doc-req-item';
            row.style.display = 'grid';
            // Adjusted grid template to account for removed column
            row.style.gridTemplateColumns = '2.5fr 1fr 1fr 1.5fr';
            row.style.gap = '15px';
            row.style.alignItems = 'center';
            row.style.marginBottom = '10px';
            row.style.padding = '12px';
            row.style.background = '#f8fafc';
            row.style.border = '1px solid #e2e8f0';
            row.style.borderRadius = '8px';
            row.style.transition = '0.2s opacity';

            const isRowActive = doc.isIncluded !== false;
            row.style.opacity = isRowActive ? '1' : '0.5';

            const disableInputsAttr = !isRowActive ? 'disabled' : '';
            const inputBg = doc.isDefault || !isRowActive ? 'background:#f1f5f9; color:#475569;' : 'background:#fff;';

            // AI Logic: OCR is ONLY allowed on default documents. Custom documents disable the OCR toggle.
            const isOcrClickable = doc.isDefault && isRowActive;
            const ocrDisabledAttr = isOcrClickable ? '' : 'disabled';
            const ocrCursor = isOcrClickable ? 'pointer' : 'not-allowed';

            row.innerHTML = `
                <div>
                    <input type="text" class="doc-name" value="${doc.name}" onchange="updateDoc(${index}, 'name', this.value)" ${doc.isDefault || !isRowActive ? 'readonly' : ''} style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-family:'Inter', sans-serif; outline:none; ${inputBg}">
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Allowed: PDF, JPG, PNG</div>
                </div>
                
                <div>
                    <select class="doc-size" onchange="updateDoc(${index}, 'size', this.value)" ${disableInputsAttr} style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; font-family:'Inter', sans-serif; outline:none; cursor:${isRowActive ? 'pointer' : 'not-allowed'};">
                        <option value="2" ${doc.size == 2 ? 'selected' : ''}>2 MB</option>
                        <option value="5" ${doc.size == 5 ? 'selected' : ''}>5 MB</option>
                        <option value="10" ${doc.size == 10 ? 'selected' : ''}>10 MB</option>
                    </select>
                </div>
                
                <!-- Mandatory Toggle Removed -->
                
                <div style="display:flex; align-items:center;">
                    <label class="toggle-switch" title="${doc.isDefault ? 'Enable OCR AI Validation?' : 'AI Scan is only available for system default documents'}">
                        <input type="checkbox" onchange="updateDoc(${index}, 'ocr', this.checked)" ${doc.ocr ? 'checked' : ''} ${ocrDisabledAttr}>
                        <span class="slider" style="cursor:${ocrCursor};"></span>
                    </label>
                </div>
                
                <div style="text-align: right; display:flex; justify-content:flex-end; align-items:center; gap:8px;">
                    ${doc.isDefault 
                        ? ` <span style="font-size:12px; font-weight:600; color:#475569;">Include:</span>
                            <label class="toggle-switch" title="Include this default document?">
                                <input type="checkbox" onchange="updateDoc(${index}, 'isIncluded', this.checked)" ${doc.isIncluded ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>` 
                        : `<button type="button" onclick="removeDoc(${index})" style="color:#ef4444; border:none; background:transparent; cursor:pointer; font-size:16px; padding:4px 8px; border-radius:4px; border:1px solid #fecaca;" title="Remove Custom Document">🗑️ Remove</button>`
                    }
                </div>
            `;
            docBuilderContainer.appendChild(row);
        });
    }

    window.updateDoc = (index, key, value) => {
        docRequirements[index][key] = value;
        
        // Safety check: If they turn a document OFF, reset its required and OCR stats internally
        if (key === 'isIncluded' && value === false) {
            docRequirements[index].ocr = false;
        }

        // We only re-render the HTML if the "Include" button is toggled so the row grays out.
        // Toggling OCR does NOT need a re-render, allowing smooth CSS animations to play!
        if(key === 'isIncluded') { 
            renderDocs(); 
        } 
    };

    window.removeDoc = (index) => {
        docRequirements.splice(index, 1);
        renderDocs();
    };

    const addDocBtn = document.getElementById('add-doc-btn');
    if (addDocBtn) {
        addDocBtn.addEventListener('click', () => {
            docRequirements.push({
                id: Date.now(),
                name: "New Custom Document",
                size: 5,
                required: true, // Forces background state to true
                ocr: false,
                isDefault: false,
                isIncluded: true
            });
            renderDocs();
        });
    }

    // ==========================================
    // 6. FETCH EXISTING DATA FROM DATABASE
    // ==========================================
    const loadScholarshipData = async () => {
        try {
            const { data: sch, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('id', scholarshipId)
                .single();

            if (error) throw error;

            if(document.getElementById('sch_title')) document.getElementById('sch_title').value = sch.title || '';
            // Load Updated Category & Scholarship Type
            if(document.getElementById('sch_category')) document.getElementById('sch_category').value = sch.category || 'Institution-Funded Educational Assistance';
            if(document.getElementById('sch_type')) document.getElementById('sch_type').value = sch.scholarship_type || 'Merit-Based';
            
            if(document.getElementById('sch_description')) document.getElementById('sch_description').value = sch.description || '';
            if(document.getElementById('sch_start')) document.getElementById('sch_start').value = sch.start_date || '';
            if(document.getElementById('sch_end')) document.getElementById('sch_end').value = sch.end_date || '';

            // Slots Loading
            if (sch.slots === 'Open') {
                if(dynamicSlotsCb) dynamicSlotsCb.checked = true;
                if(fixedSlotsInput) fixedSlotsInput.style.display = 'none';
            } else {
                if(dynamicSlotsCb) dynamicSlotsCb.checked = false;
                if(fixedSlotsInput) {
                    fixedSlotsInput.style.display = 'block';
                    fixedSlotsInput.value = sch.slots || 0;
                }
            }

            // Academic Grades Loading (INCLUDING INDIVIDUAL SUBJECTS)
            if (document.getElementById('minHsAverage')) document.getElementById('minHsAverage').value = sch.min_hs_average || '';
            if (document.getElementById('minCollegeGwa')) document.getElementById('minCollegeGwa').value = sch.min_college_gwa || '';
            if (document.getElementById('minHsSubject')) document.getElementById('minHsSubject').value = sch.min_hs_subject_grade || '';
            if (document.getElementById('minCollegeSubject')) document.getElementById('minCollegeSubject').value = sch.min_college_subject_grade || '';

            // Eligibility Years Loading
            const yearSelect = document.getElementById('eligibilityYears');
            if (yearSelect && sch.eligibility_years) {
                Array.from(yearSelect.options).forEach(opt => {
                    opt.selected = sch.eligibility_years.includes(opt.value);
                });
            }

            // Eligibility Programs Loading
            const progSelect = document.getElementById('eligibilityPrograms');
            if (progSelect && sch.eligibility_programs) {
                Array.from(progSelect.options).forEach(opt => {
                    opt.selected = sch.eligibility_programs.includes(opt.value);
                });
            }

            // Form Fields Loading
            if (sch.form_fields && sch.form_fields.length > 0) {
                sch.form_fields.forEach(field => {
                    addFormFieldRow(field.label, field.type, field.required, field.allow_multiple || false, field.options || []);
                });
            } else {
                addFormFieldRow('Why do you deserve this educational assistance?', 'Text', true);
            }

            // Document Configs Loading (With Smart Merge for missing defaults)
            if (sch.document_configurations && sch.document_configurations.length > 0) {
                let loadedDocs = sch.document_configurations.map((doc, idx) => ({
                    id: Date.now() + idx,
                    name: doc.name,
                    size: doc.max_size || 5,
                    required: true, // Forces background state to true
                    ocr: doc.ocr_enabled || false,
                    isDefault: doc.is_system_default || false,
                    isIncluded: true
                }));

                // Smart Merge: Find any core defaults that are missing from the DB (because they were turned off)
                coreDefaultDocs.forEach(def => {
                    const existsInDb = loadedDocs.find(ld => ld.name === def.name);
                    if (!existsInDb) {
                        loadedDocs.push({
                            id: Date.now() + Math.random(),
                            name: def.name,
                            size: def.size,
                            required: true, // Forces background state to true
                            ocr: def.ocr,
                            isDefault: true,
                            isIncluded: false // It was missing, so it must have been turned off
                        });
                    }
                });

                // Sort so system defaults always appear at the top
                loadedDocs.sort((a, b) => (b.isDefault === a.isDefault ? 0 : b.isDefault ? 1 : -1));
                docRequirements = loadedDocs;

            } else if (sch.required_documents && sch.required_documents.length > 0) {
                // Legacy fallback handling
                let legacyDocs = sch.required_documents.map((docName, idx) => ({
                    id: Date.now() + idx,
                    name: docName,
                    size: 5,
                    required: true,
                    ocr: false,
                    isDefault: coreDefaultDocs.some(d => d.name === docName),
                    isIncluded: true
                }));

                coreDefaultDocs.forEach(def => {
                    if (!legacyDocs.find(ld => ld.name === def.name)) {
                        legacyDocs.push({
                            ...def,
                            id: Date.now() + Math.random(),
                            isIncluded: false
                        });
                    }
                });

                legacyDocs.sort((a, b) => (b.isDefault === a.isDefault ? 0 : b.isDefault ? 1 : -1));
                docRequirements = legacyDocs;

            } else {
                // If totally empty, inject standard defaults included
                docRequirements = coreDefaultDocs.map(d => ({ ...d, isIncluded: true }));
            }
            
            renderDocs();

        } catch (err) {
            console.error("Failed to load educational assistance data:", err);
            alert("Error loading details: " + err.message);
        }
    };


    // ==========================================
    // 7. GATHER & SAVE (UPDATE)
    // ==========================================
    const gatherScholarshipData = (status) => {
        // Form Fields
        const formFields = [];
        document.querySelectorAll('.form-field-item').forEach(row => {
            const type = row.querySelector('.field-type').value;
            let options = [];
            if (type === 'Dropdown' || type === 'Selection') {
                row.querySelectorAll('.option-input').forEach(opt => {
                    if (opt.value.trim() !== '') options.push(opt.value.trim());
                });
            }
            formFields.push({
                label: row.querySelector('.field-label').value.trim(),
                type: type,
                required: row.querySelector('.field-required').checked,
                allow_multiple: type === 'Selection' ? row.querySelector('.field-multiple').checked : false,
                options: options 
            });
        });

        // Filter only included documents
        const activeDocs = docRequirements.filter(doc => doc.isIncluded !== false);

        const finalDocsNames = activeDocs.map(doc => doc.name);
        const structuredDocs = activeDocs.map(doc => ({
            name: doc.name,
            max_size: doc.size,
            required: true, // Forces output to true automatically
            ocr_enabled: doc.ocr,
            is_system_default: doc.isDefault,
            allowed_types: ['PDF', 'JPG', 'PNG']
        }));

        // Dynamic Slots
        const isDynamicSlots = document.getElementById('dynamicSlots') ? document.getElementById('dynamicSlots').checked : false;
        const slotsValue = isDynamicSlots ? "Open" : (parseInt(document.getElementById('fixedSlots')?.value) || 0);

        // Eligibility Multi-Selects
        const getSelectedOptions = (selectId) => {
            const selectEl = document.getElementById(selectId);
            if (!selectEl) return [];
            return Array.from(selectEl.selectedOptions).map(opt => opt.value);
        };
        const targetYears = getSelectedOptions('eligibilityYears');
        const targetPrograms = getSelectedOptions('eligibilityPrograms');

        // Academic Requirements (UPDATED TO CAPTURE SUBJECT LIMITS)
        const hsInput = document.getElementById('minHsAverage');
        const colInput = document.getElementById('minCollegeGwa');
        const hsSubjectInput = document.getElementById('minHsSubject'); 
        const colSubjectInput = document.getElementById('minCollegeSubject');

        const minHsAvg = hsInput && hsInput.value ? parseFloat(hsInput.value) : null;
        const minColGwa = colInput && colInput.value ? parseFloat(colInput.value) : null;
        const minHsSubject = hsSubjectInput && hsSubjectInput.value ? parseFloat(hsSubjectInput.value) : null; 
        const minColSubject = colSubjectInput && colSubjectInput.value ? parseFloat(colSubjectInput.value) : null; 

        return {
            title: document.getElementById('sch_title') ? document.getElementById('sch_title').value.trim() : 'Untitled',
            category: document.getElementById('sch_category') ? document.getElementById('sch_category').value : 'Institution-Funded Educational Assistance', // <-- Fallback Updated Here
            scholarship_type: document.getElementById('sch_type') ? document.getElementById('sch_type').value : 'Merit-Based',
            description: document.getElementById('sch_description') ? document.getElementById('sch_description').value.trim() : '',
            start_date: document.getElementById('sch_start') ? document.getElementById('sch_start').value : null,
            end_date: document.getElementById('sch_end') ? document.getElementById('sch_end').value : null,
            
            slots: slotsValue.toString(),
            available_slots: isDynamicSlots ? 0 : (parseInt(document.getElementById('fixedSlots')?.value) || 0), // <-- FIXED NULL CONSTRAINT
            
            eligibility_years: targetYears,
            eligibility_programs: targetPrograms,
            
            min_hs_average: minHsAvg,
            min_college_gwa: minColGwa,
            min_hs_subject_grade: minHsSubject,
            min_college_subject_grade: minColSubject,
            
            required_documents: finalDocsNames,
            document_configurations: structuredDocs,
            form_fields: formFields,
            
            status: status
        };
    };

    const updateScholarship = async (e, status, btnElement) => {
        if (e) e.preventDefault(); 

        try {
            const payload = gatherScholarshipData(status);

            if (!payload.title || !payload.start_date) {
                alert("Please fill in the Educational Assistance Name and Application Start Date.");
                return;
            }

            btnElement.innerText = "Updating...";
            btnElement.disabled = true;

            const { error } = await window.supabaseClient
                .from('scholarships')
                .update(payload)
                .eq('id', scholarshipId);

            if (error) {
                console.error("Supabase Error Object:", error);
                throw new Error(error.message || "Unknown database error");
            }

            alert(`Educational Assistance successfully updated!`);
            window.location.href = 'admin-scholarships.html';

        } catch (error) {
            console.error('Catch Block Error:', error);
            alert('CRITICAL ERROR:\n' + error.message);
        } finally {
            btnElement.innerText = status === 'Active' ? 'Update & Publish' : 'Update Draft';
            btnElement.disabled = false;
        }
    };

    const publishBtn = document.getElementById('publish-btn');
    const draftBtn = document.getElementById('save-draft-btn');
    
    if(publishBtn) {
        publishBtn.type = 'button';
        publishBtn.innerText = "Update & Publish";
        publishBtn.addEventListener('click', (e) => updateScholarship(e, 'Active', publishBtn));
    }
    
    if(draftBtn) {
        draftBtn.type = 'button';
        draftBtn.innerText = "Update Draft";
        draftBtn.addEventListener('click', (e) => updateScholarship(e, 'Draft', draftBtn));
    }

    // Boot
    loadScholarshipData();
});