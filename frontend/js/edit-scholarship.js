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
        alert("No scholarship ID provided in the URL.");
        window.location.href = 'admin-scholarships.html';
        return;
    }

    const adminId = session.user.id;

    // Load Profile into Header
    try {
        const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', adminId).single();
        if (profile) {
            // Kick out non-admins
            if (profile.role !== 'admin') {
                window.location.href = 'student-dashboard.html';
                return;
            }

            // Update Header Name & Avatar
            const firstName = profile.first_name || 'Admin';
            const lastName = profile.last_name || '';
            
            if (document.getElementById('header-name')) {
                document.getElementById('header-name').innerText = `${firstName} ${lastName}`.trim();
            }
            if (profile.avatar_url && document.getElementById('header-avatar')) {
                document.getElementById('header-avatar').src = profile.avatar_url;
            }
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
    // 3. UI ELEMENTS & ELIGIBILITY SYNC LOGIC
    // ==========================================
    const gwaToggle = document.getElementById('gwa_enabled');
    const yearToggle = document.getElementById('year_enabled');
    const programToggle = document.getElementById('program_enabled');
    const gwaInput = document.getElementById('gwa_value');
    const yearInputs = document.querySelectorAll('#year_list input[type="checkbox"]');
    const programSelect = document.getElementById('eligible_programs');

    const formBuilderContainer = document.getElementById('form-builder-container');
    const docBuilderContainer = document.getElementById('doc-builder-container');
    let docRequirements = [];

    const syncEligibilityUI = () => {
        if (gwaToggle && gwaInput) {
            gwaInput.disabled = !gwaToggle.checked;
            if(!gwaToggle.checked) gwaInput.value = '';
        }
        if (yearToggle && yearInputs.length > 0) {
            yearInputs.forEach(cb => {
                cb.disabled = !yearToggle.checked;
                if(!yearToggle.checked) cb.checked = false;
            });
        }
        if (programToggle && programSelect) {
            programSelect.disabled = !programToggle.checked;
            if(!programToggle.checked) programSelect.selectedIndex = -1;
        }
    };

    if (gwaToggle) gwaToggle.addEventListener('change', syncEligibilityUI);
    if (yearToggle) yearToggle.addEventListener('change', syncEligibilityUI);
    if (programToggle) programToggle.addEventListener('change', syncEligibilityUI);


    // ==========================================
    // 4. DYNAMIC FORM BUILDER LOGIC
    // ==========================================
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
    // 5. DOCUMENT BUILDER LOGIC
    // ==========================================
    function renderDocs() {
        if (!docBuilderContainer) return;
        docBuilderContainer.innerHTML = '';
        
        docRequirements.forEach((doc, index) => {
            const row = document.createElement('div');
            row.className = 'doc-req-item';
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 1fr 1fr 1fr 1fr 0.5fr';
            row.style.gap = '15px';
            row.style.alignItems = 'center';
            row.style.marginBottom = '10px';
            row.style.padding = '12px';
            row.style.background = '#f8fafc';
            row.style.border = '1px solid #e2e8f0';
            row.style.borderRadius = '8px';

            const ocrDisabledStyle = !doc.isDefault ? "opacity: 0.5; cursor: not-allowed;" : "";

            row.innerHTML = `
                <div>
                    <input type="text" class="doc-name" value="${doc.name}" onchange="updateDoc(${index}, 'name', this.value)" ${doc.isDefault ? 'readonly' : ''} style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; ${doc.isDefault ? 'background:#f1f5f9; color:#475569;' : ''}">
                </div>
                <div style="font-size: 12px; color: #64748b; font-weight: 500;">PDF, JPG, PNG</div>
                <div>
                    <select class="doc-size" onchange="updateDoc(${index}, 'size', this.value)" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
                        <option value="2" ${doc.size == 2 ? 'selected' : ''}>2 MB</option>
                        <option value="5" ${doc.size == 5 ? 'selected' : ''}>5 MB</option>
                        <option value="10" ${doc.size == 10 ? 'selected' : ''}>10 MB</option>
                    </select>
                </div>
                <div>
                    <label class="toggle-switch">
                        <input type="checkbox" class="doc-required" onchange="updateDoc(${index}, 'required', this.checked)" ${doc.required ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                <div>
                    <label class="toggle-switch" style="${ocrDisabledStyle}">
                        <input type="checkbox" class="doc-ocr" onchange="updateDoc(${index}, 'ocr', this.checked)" ${doc.ocr ? 'checked' : ''} ${!doc.isDefault ? 'disabled' : ''}>
                        <span class="slider" style="background-color: ${doc.ocr ? '#10b981' : '#ccc'};"></span>
                    </label>
                </div>
                <div style="text-align: right; display:flex; justify-content:flex-end; align-items:center;">
                    ${doc.isDefault 
                        ? `<span style="color:#94a3b8; font-size:10px; font-style:italic; font-weight:bold; text-align:center; line-height:1.2;">System<br>Field</span>` 
                        : `<button type="button" onclick="removeDoc(${index})" style="color:#ef4444; border:none; background:transparent; cursor:pointer; font-size:16px;">🗑️</button>`
                    }
                </div>
            `;
            docBuilderContainer.appendChild(row);
        });
    }

    window.updateDoc = (index, key, value) => {
        docRequirements[index][key] = value;
        if(key === 'ocr') { renderDocs(); } 
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
                name: "New Document Requirement",
                size: 5,
                required: true,
                ocr: false,
                isDefault: false
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
            if(document.getElementById('sch_category')) document.getElementById('sch_category').value = sch.category || 'Academic';
            if(document.getElementById('sch_description')) document.getElementById('sch_description').value = sch.description || '';
            if(document.getElementById('sch_slots')) document.getElementById('sch_slots').value = sch.available_slots || 0;
            if(document.getElementById('sch_start')) document.getElementById('sch_start').value = sch.start_date || '';
            if(document.getElementById('sch_end')) document.getElementById('sch_end').value = sch.end_date || '';

            if (sch.eligibility_rules) {
                if (sch.eligibility_rules.gwa && gwaToggle) {
                    gwaToggle.checked = sch.eligibility_rules.gwa.enabled;
                    gwaInput.value = sch.eligibility_rules.gwa.minimum || '';
                }
                if (sch.eligibility_rules.year_levels && yearToggle) {
                    yearToggle.checked = sch.eligibility_rules.year_levels.enabled;
                    const allowedYears = sch.eligibility_rules.year_levels.allowed || [];
                    yearInputs.forEach(cb => cb.checked = allowedYears.includes(cb.value));
                }
                if (sch.eligibility_rules.program_department && programToggle) {
                    programToggle.checked = sch.eligibility_rules.program_department.enabled;
                    const allowedProgs = sch.eligibility_rules.program_department.allowed || [];
                    if (programSelect) {
                        Array.from(programSelect.options).forEach(opt => {
                            opt.selected = allowedProgs.includes(opt.value);
                        });
                    }
                }
            }
            syncEligibilityUI();

            if (sch.form_fields && sch.form_fields.length > 0) {
                sch.form_fields.forEach(field => {
                    addFormFieldRow(field.label, field.type, field.required, field.allow_multiple || false, field.options || []);
                });
            } else {
                addFormFieldRow('Why do you deserve this scholarship?', 'Text', true);
            }

            if (sch.document_requirements && sch.document_requirements.length > 0) {
                docRequirements = sch.document_requirements.map((doc, idx) => ({
                    id: idx,
                    name: doc.name,
                    size: doc.max_size || 5,
                    required: doc.required,
                    ocr: doc.ocr_enabled || false,
                    isDefault: doc.is_system_default || false
                }));
            } else {
                docRequirements = [{ id: 1, name: "General Weighted Average (Report Card/TOR)", size: 5, required: true, ocr: true, isDefault: true }];
            }
            renderDocs();

        } catch (err) {
            console.error("Failed to load scholarship:", err);
            alert("Error loading details: " + err.message);
        }
    };


    // ==========================================
    // 7. GATHER & SAVE (UPDATE)
    // ==========================================
    const gatherScholarshipData = (status) => {
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

        const finalDocs = docRequirements.map(doc => ({
            name: doc.name,
            max_size: doc.size,
            required: doc.required,
            ocr_enabled: doc.ocr,
            is_system_default: doc.isDefault,
            allowed_types: ['PDF', 'JPG', 'PNG']
        }));

        let selectedPrograms = [];
        if (programSelect && !programSelect.disabled) {
            selectedPrograms = Array.from(programSelect.selectedOptions).map(opt => opt.value);
        }

        return {
            title: document.getElementById('sch_title') ? document.getElementById('sch_title').value.trim() : 'Untitled',
            category: document.getElementById('sch_category') ? document.getElementById('sch_category').value : 'Academic',
            description: document.getElementById('sch_description') ? document.getElementById('sch_description').value.trim() : '',
            available_slots: document.getElementById('sch_slots') ? (parseInt(document.getElementById('sch_slots').value) || 0) : 0,
            start_date: document.getElementById('sch_start') ? document.getElementById('sch_start').value : null,
            end_date: document.getElementById('sch_end') ? document.getElementById('sch_end').value : null,
            eligibility_rules: {
                gwa: {
                    enabled: gwaToggle ? gwaToggle.checked : false,
                    minimum: gwaInput && gwaToggle.checked ? gwaInput.value : ''
                },
                year_levels: {
                    enabled: yearToggle ? yearToggle.checked : false,
                    allowed: yearToggle && yearToggle.checked ? Array.from(document.querySelectorAll('#year_list input:checked')).map(cb => cb.value) : []
                },
                program_department: {
                    enabled: programToggle ? programToggle.checked : false,
                    allowed: selectedPrograms
                }
            },
            form_fields: formFields,
            document_requirements: finalDocs,
            status: status
        };
    };

    const updateScholarship = async (e, status, btnElement) => {
        if (e) e.preventDefault(); 

        try {
            const payload = gatherScholarshipData(status);

            if (!payload.title || !payload.start_date) {
                alert("Please fill in the Scholarship Name and Application Start Date.");
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

            alert(`Scholarship successfully updated as ${status}!`);
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