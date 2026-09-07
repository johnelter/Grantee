document.addEventListener('DOMContentLoaded', async () => {
    const escapeHtml = (str) => {
        if (!str || typeof str !== 'string') return str || '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

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

    // ==========================================
    // 1A. URL PARAM CHECK FOR EDIT MODE
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const scholarshipId = urlParams.get('id');
    const isEditMode = !!scholarshipId;

    if (isEditMode) {
        document.title = "Edit Educational Assistance - Grantee Admin";
        const breadcrumbs = document.querySelector('.breadcrumbs span');
        if (breadcrumbs) breadcrumbs.innerText = "Edit Program";
        const h1 = document.querySelector('.header-titles h1');
        if (h1) h1.innerText = "Edit Educational Assistance";
        const welcomeText = document.querySelector('.header-titles .welcome-text');
        if (welcomeText) welcomeText.innerText = "Update educational assistance details, application form, requirements, and eligibility rules.";
        
        const draftBtn = document.getElementById('save-draft-btn');
        if (draftBtn) draftBtn.innerHTML = '<i data-lucide="file-pen-line" style="width: 16px; height: 16px;"></i> Update Draft';
        
        const publishBtn = document.getElementById('publish-btn');
        if (publishBtn) publishBtn.innerHTML = '<i data-lucide="send" style="width: 16px; height: 16px;"></i> Update & Publish';
    }

    try {
        const { data: profile, error: profileError } = await window.supabaseClient
            .from('profiles')
            .select(`*, schools ( name )`)
            .eq('id', adminId)
            .single();

        if (profileError) throw profileError;

        if (profile) {
            if (!['admin', 'coordinator'].includes(profile.role)) {
                window.location.href = 'student-dashboard.html';
                return;
            }
            currentAdminSchoolId = profile.school_id;

            const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin User';
            const schoolName = (profile.schools && profile.schools.name) ? profile.schools.name : "No School Assigned";

            if (document.getElementById('header-name')) document.getElementById('header-name').innerText = fullName;
            if (document.getElementById('header-role')) document.getElementById('header-role').innerText = profile.role === 'admin' ? 'Coordinator' : profile.role;
            if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

            if (document.getElementById('admin-school-display')) {
                document.getElementById('admin-school-display').innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>Assigned to: <strong>${schoolName}</strong></span>`;
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
            }

            sessionStorage.setItem('grantee_admin_profile', JSON.stringify({
                name: fullName,
                role: profile.role === 'admin' ? 'Coordinator' : profile.role,
                avatar_url: profile.avatar_url || 'assets/admin-avatar.png',
                school_name: schoolName,
                school_id: profile.school_id
            }));
        }
    } catch (err) {
        console.error("Error fetching admin profile:", err);
    } finally {
        const headerTitlesBox = document.getElementById('header-titles-box');
        if (headerTitlesBox) {
            headerTitlesBox.classList.remove('is-loading');
        }
    }



    // ==========================================
    // 2B. DYNAMIC SCHOOL YEAR POPULATION
    // ==========================================
    const populateSchoolYearDropdown = (selectedYear = null) => {
        const schoolYearSelect = document.getElementById('sch_school_year');
        if (!schoolYearSelect) return;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0 = Jan, 5 = Jun
        // Academic year in PH generally starts around June/August
        const startAcademicYear = currentMonth >= 5 ? currentYear : currentYear - 1;

        const yearsList = [];
        // Include 1 year prior
        yearsList.push(`${startAcademicYear - 1}-${startAcademicYear}`);
        // Current and next 5 upcoming school years
        for (let i = 0; i <= 5; i++) {
            const y = startAcademicYear + i;
            yearsList.push(`${y}-${y + 1}`);
        }

        // If an existing scholarship is being edited with another school year, add it
        if (selectedYear && !yearsList.includes(selectedYear)) {
            yearsList.unshift(selectedYear);
        }

        schoolYearSelect.innerHTML = '<option value="">Select School Year</option>';
        yearsList.forEach(sy => {
            const opt = document.createElement('option');
            opt.value = sy;
            const isCurrent = sy === `${startAcademicYear}-${startAcademicYear + 1}`;
            opt.textContent = isCurrent ? `${sy} (Current SY)` : sy;
            schoolYearSelect.appendChild(opt);
        });

        if (selectedYear) {
            schoolYearSelect.value = selectedYear;
        } else if (!isEditMode) {
            // Default to current academic school year
            schoolYearSelect.value = `${startAcademicYear}-${startAcademicYear + 1}`;
        }
    };

    populateSchoolYearDropdown();

    // ==========================================
    // 3. DYNAMIC SLOTS & NUMBER INPUT GUARDS
    // ==========================================
    const dynamicSlotsCb = document.getElementById('dynamicSlots');
    const fixedSlotsInput = document.getElementById('fixedSlots');

    if (dynamicSlotsCb && fixedSlotsInput) {
        dynamicSlotsCb.addEventListener('change', (e) => {
            fixedSlotsInput.style.display = e.target.checked ? 'none' : 'block';
            if (e.target.checked) fixedSlotsInput.value = '';
        });
    }

    // Number input guard helper to prevent negative values & clamp max
    const setupNumberInputGuards = (inputEl, minVal, maxVal, isFloat = false) => {
        if (!inputEl) return;

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+') {
                e.preventDefault();
            }
        });

        inputEl.addEventListener('input', (e) => {
            const valStr = e.target.value;
            if (valStr === '') return;

            let num = isFloat ? parseFloat(valStr) : parseInt(valStr, 10);
            if (isNaN(num)) {
                e.target.value = '';
                return;
            }

            if (num < minVal) {
                e.target.value = minVal;
            } else if (maxVal !== null && num > maxVal) {
                e.target.value = maxVal;
            }
        });

        inputEl.addEventListener('paste', (e) => {
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            if (pasteData.includes('-') || pasteData.includes('e') || pasteData.includes('+')) {
                e.preventDefault();
                const sanitized = pasteData.replace(/[^0-9.]/g, '');
                let num = isFloat ? parseFloat(sanitized) : parseInt(sanitized, 10);
                if (!isNaN(num)) {
                    if (num < minVal) num = minVal;
                    if (maxVal !== null && num > maxVal) num = maxVal;
                    document.execCommand('insertText', false, num.toString());
                }
            }
        });
    };

    // Attach guards to Available Slots and Academic Requirements
    setupNumberInputGuards(fixedSlotsInput, 1, 999999, false);
    setupNumberInputGuards(document.getElementById('minHsAverage'), 0, 100, true);
    setupNumberInputGuards(document.getElementById('minHsSubject'), 0, 100, true);
    setupNumberInputGuards(document.getElementById('minCollegeGwa'), 0, 5.0, true);
    setupNumberInputGuards(document.getElementById('minCollegeSubject'), 0, 5.0, true);

    // ==========================================
    // 3B. FLATPICKR DATE RANGE PICKER
    // ==========================================
    let dateRangePicker = null;
    const dateRangeInput = document.getElementById('sch_date_range');
    const startInput = document.getElementById('sch_start');
    const endInput = document.getElementById('sch_end');

    if (dateRangeInput && typeof flatpickr !== 'undefined') {
        dateRangePicker = flatpickr(dateRangeInput, {
            mode: "range",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "F j, Y",
            altInputClass: "form-input",
            locale: {
                rangeSeparator: "  to  "
            },
            onChange: (selectedDates) => {
                if (selectedDates.length === 2) {
                    const d1 = selectedDates[0];
                    const d2 = selectedDates[1];
                    const startStr = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
                    const endStr = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
                    if (startInput) startInput.value = startStr;
                    if (endInput) endInput.value = endStr;
                } else if (selectedDates.length === 1) {
                    const d1 = selectedDates[0];
                    const startStr = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`;
                    if (startInput) startInput.value = startStr;
                    if (endInput) endInput.value = startStr;
                } else {
                    if (startInput) startInput.value = '';
                    if (endInput) endInput.value = '';
                }
            }
        });
    }

    // ==========================================
    // 3C. TOUCH-FRIENDLY ELIGIBILITY CHECKBOX LISTS
    // ==========================================
    const availableYearLevels = [
        "Incoming 1st year",
        "1st year",
        "2nd year",
        "3rd year",
        "4th year",
        "Irregular"
    ];

    const availablePrograms = [
        "Bachelor of Science in Accountancy",
        "Bachelor of Science in Business Administration, Major in Financial Management",
        "Bachelor of Science in Hospitality Management",
        "Bachelor of Science in Tourism Management",
        "Bachelor of Elementary Education",
        "Bachelor of Secondary Education, Major in English",
        "Bachelor of Secondary Education, Major in Mathematics",
        "Bachelor of Secondary Education, Major in Filipino",
        "Bachelor of Secondary Education, Major in Science",
        "Bachelor of Secondary Education, Major in Social Studies",
        "Bachelor of Science in Information Technology",
        "Bachelor of Science in Criminology",
        "Bachelor of Science in Psychology"
    ];

    const yearLevelsContainer = document.getElementById('year-levels-container');
    const programsContainer = document.getElementById('programs-container');
    const toggleAllYearsBtn = document.getElementById('toggle-all-years');
    const toggleAllProgramsBtn = document.getElementById('toggle-all-programs');
    const searchProgramsInput = document.getElementById('search-programs-input');

    const renderCheckboxLists = () => {
        if (yearLevelsContainer) {
            yearLevelsContainer.innerHTML = '';
            availableYearLevels.forEach(yr => {
                const card = document.createElement('label');
                card.className = 'touch-checkbox-card';
                card.innerHTML = `
                    <input type="checkbox" class="eligibility-year-checkbox" value="${yr}">
                    <span class="touch-checkbox-label">${yr}</span>
                `;
                const cb = card.querySelector('input');
                cb.addEventListener('change', () => {
                    card.classList.toggle('is-checked', cb.checked);
                    updateToggleYearsButtonText();
                });
                yearLevelsContainer.appendChild(card);
            });
        }

        if (programsContainer) {
            programsContainer.innerHTML = '';
            availablePrograms.forEach(prog => {
                const card = document.createElement('label');
                card.className = 'touch-checkbox-card program-card-item';
                card.dataset.name = prog.toLowerCase();
                card.innerHTML = `
                    <input type="checkbox" class="eligibility-program-checkbox" value="${prog}">
                    <span class="touch-checkbox-label">${prog}</span>
                `;
                const cb = card.querySelector('input');
                cb.addEventListener('change', () => {
                    card.classList.toggle('is-checked', cb.checked);
                    updateToggleProgramsButtonText();
                });
                programsContainer.appendChild(card);
            });
        }
    };

    const updateToggleYearsButtonText = () => {
        if (!toggleAllYearsBtn) return;
        const all = document.querySelectorAll('.eligibility-year-checkbox');
        const checked = document.querySelectorAll('.eligibility-year-checkbox:checked');
        const isAllSelected = all.length > 0 && all.length === checked.length;
        toggleAllYearsBtn.innerHTML = isAllSelected 
            ? '<i data-lucide="x" style="width:14px;height:14px;"></i> Deselect All' 
            : '<i data-lucide="check-check" style="width:14px;height:14px;"></i> Select All';
        toggleAllYearsBtn.classList.toggle('active-all', isAllSelected);
        if (window.lucide) lucide.createIcons();
    };

    const updateToggleProgramsButtonText = () => {
        if (!toggleAllProgramsBtn) return;
        const all = document.querySelectorAll('.eligibility-program-checkbox');
        const checked = document.querySelectorAll('.eligibility-program-checkbox:checked');
        const isAllSelected = all.length > 0 && all.length === checked.length;
        toggleAllProgramsBtn.innerHTML = isAllSelected 
            ? '<i data-lucide="x" style="width:14px;height:14px;"></i> Deselect All' 
            : '<i data-lucide="check-check" style="width:14px;height:14px;"></i> Select All';
        toggleAllProgramsBtn.classList.toggle('active-all', isAllSelected);
        if (window.lucide) lucide.createIcons();
    };

    if (toggleAllYearsBtn) {
        toggleAllYearsBtn.addEventListener('click', () => {
            const all = document.querySelectorAll('.eligibility-year-checkbox');
            const checked = document.querySelectorAll('.eligibility-year-checkbox:checked');
            const shouldCheck = all.length !== checked.length;
            all.forEach(cb => {
                cb.checked = shouldCheck;
                const card = cb.closest('.touch-checkbox-card');
                if (card) card.classList.toggle('is-checked', shouldCheck);
            });
            updateToggleYearsButtonText();
        });
    }

    if (toggleAllProgramsBtn) {
        toggleAllProgramsBtn.addEventListener('click', () => {
            const all = document.querySelectorAll('.eligibility-program-checkbox');
            const checked = document.querySelectorAll('.eligibility-program-checkbox:checked');
            const shouldCheck = all.length !== checked.length;
            all.forEach(cb => {
                cb.checked = shouldCheck;
                const card = cb.closest('.touch-checkbox-card');
                if (card) card.classList.toggle('is-checked', shouldCheck);
            });
            updateToggleProgramsButtonText();
        });
    }

    if (searchProgramsInput) {
        searchProgramsInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            document.querySelectorAll('.program-card-item').forEach(card => {
                const name = card.dataset.name || '';
                card.style.display = name.includes(q) ? 'flex' : 'none';
            });
        });
    }

    renderCheckboxLists();

    // ==========================================
    // 4. FORM BUILDER (Auto-Collected & Custom)
    // ==========================================

    const autoFields = ["Full Name", "Email Address", "Gender", "Address", "Program", "Year Level"];
    const autoFieldsContainer = document.getElementById('auto-fields-container');

    if (autoFieldsContainer) {
        autoFieldsContainer.innerHTML = '';
        autoFields.forEach(field => {
            autoFieldsContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:10px 16px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:8px;">
                    <div style="font-size:14px; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:8px;">
                        <i data-lucide="lock" style="width:14px; height:14px; color:var(--text-muted);"></i> ${field}
                    </div>
                    <select class="auto-field-format" data-field="${field}" style="padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:12px; outline:none; cursor:pointer; background:var(--card-bg); color:var(--text-main);">
                        <option value="No formatting">No formatting</option>
                        <option value="UPPERCASE">Convert to UPPERCASE</option>
                        <option value="lowercase">Convert to lowercase</option>
                        <option value="Capitalize Each Word">Capitalize Each Word</option>
                    </select>
                </div>
            `;
        });
        if (window.lucide) lucide.createIcons();
    }

    const formBuilderContainer = document.getElementById('form-builder-container');
    const addFieldBtn = document.getElementById('add-field-btn');

    const addFormFieldRow = (label = '', type = 'Text', required = true, allowMultiple = false, optionsArray = []) => {
        if (!formBuilderContainer) return;

        const rowId = 'field-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

        // Main table row
        const mainRow = document.createElement('tr');
        mainRow.className = 'form-field-main-row builder-main-row';
        mainRow.dataset.rowId = rowId;

        // Expandable sub-row
        const detailsRow = document.createElement('tr');
        detailsRow.dataset.rowId = rowId;

        const isChoices = ['Dropdown', 'Selection'].includes(type);
        const shouldAutoExpand = isChoices;

        mainRow.innerHTML = `
            <td style="text-align: center;">
                <button type="button" class="btn-expand-row ${shouldAutoExpand ? 'is-expanded' : ''}" title="Expand / Collapse options & configuration">
                    <i data-lucide="chevron-right" class="expand-chevron"></i>
                </button>
            </td>
            <td>
                <textarea class="field-label form-input auto-expand-input" rows="1" placeholder="e.g. Please state your estimated annual family income and source of livelihood...">${label}</textarea>
            </td>
            <td>
                <select class="field-type form-input" style="width:100%;">
                    <option value="Text" ${type === 'Text' ? 'selected' : ''}>Text</option>
                    <option value="Number" ${type === 'Number' ? 'selected' : ''}>Number</option>
                    <option value="Email" ${type === 'Email' ? 'selected' : ''}>Email</option>
                    <option value="Date" ${type === 'Date' ? 'selected' : ''}>Date</option>
                    <option value="Dropdown" ${type === 'Dropdown' ? 'selected' : ''}>Dropdown</option>
                    <option value="Selection" ${type === 'Selection' ? 'selected' : ''}>Selection (Radio/Checkbox)</option>
                </select>
            </td>
            <td>
                <select class="field-format form-input" style="width:100%; display:${type === 'Text' ? 'block' : 'none'};">
                    <option value="No formatting">No formatting</option>
                    <option value="UPPERCASE">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="Capitalize Each Word">Capitalize Each Word</option>
                </select>
                <span class="non-text-format-hint" style="font-size:12px; color:var(--text-muted); display:${type === 'Text' ? 'none' : 'block'};">Standard</span>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center;">
                    <label class="toggle-switch" title="Is this question mandatory?">
                        <input type="checkbox" class="field-required" ${required ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center;">
                    <button type="button" class="btn-icon-table delete-row-btn" style="color:var(--danger-color);" title="Delete Question">
                        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                    </button>
                </div>
            </td>
        `;

        detailsRow.className = `form-field-details-row builder-details-row ${shouldAutoExpand ? 'is-open' : ''}`;
        detailsRow.innerHTML = `
            <td colspan="6" class="details-cell">
                <div class="details-content-box">
                    <div class="options-container" style="display: ${isChoices ? 'block' : 'none'};">
                        <div class="multiple-choice-toggle" style="display: ${type === 'Selection' ? 'flex' : 'none'}; align-items:center; gap:8px; margin-bottom:14px; background: rgba(76, 106, 115, 0.1); padding: 10px 14px; border-radius: 6px; border: 1px solid rgba(76, 106, 115, 0.2);">
                            <label class="toggle-switch"><input type="checkbox" class="field-multiple" ${allowMultiple ? 'checked' : ''}><span class="slider"></span></label>
                            <span style="font-size:13px; font-weight:600; color:var(--river-blue);">Allow students to select multiple options (Checkboxes)</span>
                        </div>
                        <div class="details-field-header">
                            <div class="details-field-label"><i data-lucide="list" style="width:14px;height:14px;"></i> Custom Options / Choices</div>
                        </div>
                        <div class="options-list"></div>
                        <button type="button" class="btn-outline add-option-btn" style="padding:6px 14px; font-size:12px; margin-top:8px; display:inline-flex; align-items:center; gap:6px;">
                            <i data-lucide="plus" style="width:13px;height:13px;"></i> Add Option
                        </button>
                    </div>
                    <div class="text-hint-container" style="display: ${isChoices ? 'none' : 'block'}; font-size:12px; color:var(--text-muted);">
                        <i data-lucide="info" style="width:14px;height:14px; display:inline-block; vertical-align:middle; margin-right:4px; color:var(--forest-shade);"></i>
                        <span>This field collects single-entry input from the applicant. You can set formatting rules in the table column.</span>
                    </div>
                </div>
            </td>
        `;

        const expandBtn = mainRow.querySelector('.btn-expand-row');
        const fieldLabelTextarea = mainRow.querySelector('.field-label');
        const typeSelect = mainRow.querySelector('.field-type');
        const formatSelect = mainRow.querySelector('.field-format');
        const nonTextFormatHint = mainRow.querySelector('.non-text-format-hint');
        const deleteBtn = mainRow.querySelector('.delete-row-btn');

        const optionsContainer = detailsRow.querySelector('.options-container');
        const textHintContainer = detailsRow.querySelector('.text-hint-container');
        const multipleContainer = detailsRow.querySelector('.multiple-choice-toggle');
        const optionsList = detailsRow.querySelector('.options-list');
        const addOptionBtn = detailsRow.querySelector('.add-option-btn');

        // Auto-expand textarea height as coordinator types
        const adjustFieldLabelHeight = () => {
            fieldLabelTextarea.style.height = 'auto';
            fieldLabelTextarea.style.height = Math.max(38, fieldLabelTextarea.scrollHeight) + 'px';
        };
        fieldLabelTextarea.addEventListener('input', adjustFieldLabelHeight);
        setTimeout(adjustFieldLabelHeight, 0);

        // Expand toggle handler
        const toggleExpand = () => {
            const isOpen = detailsRow.classList.toggle('is-open');
            expandBtn.classList.toggle('is-expanded', isOpen);
            mainRow.classList.toggle('expanded-parent', isOpen);
            if (window.lucide) lucide.createIcons();
        };

        expandBtn.addEventListener('click', toggleExpand);

        typeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const isText = val === 'Text';
            const isChoiceType = val === 'Dropdown' || val === 'Selection';

            formatSelect.style.display = isText ? 'block' : 'none';
            nonTextFormatHint.style.display = isText ? 'none' : 'block';

            if (isChoiceType) {
                optionsContainer.style.display = 'block';
                textHintContainer.style.display = 'none';
                multipleContainer.style.display = val === 'Selection' ? 'flex' : 'none';
                if (optionsList.children.length === 0) createOptionInput(optionsList);
                if (!detailsRow.classList.contains('is-open')) {
                    toggleExpand();
                }
            } else {
                optionsContainer.style.display = 'none';
                textHintContainer.style.display = 'block';
            }
        });

        const createOptionInput = (listContainer, val = '') => {
            const optDiv = document.createElement('div');
            optDiv.style.display = 'flex';
            optDiv.style.gap = '8px';
            optDiv.style.marginBottom = '8px';
            optDiv.innerHTML = `
                <input type="text" class="option-input form-input" value="${val}" placeholder="Enter option text..." style="flex:1; padding:6px 12px; font-size:13px;">
                <button type="button" class="btn-icon-table remove-option-btn" style="color:var(--danger-color); padding: 0 6px;" title="Remove Option">
                    <i data-lucide="x" style="width:15px;height:15px;"></i>
                </button>
            `;
            optDiv.querySelector('.remove-option-btn').addEventListener('click', () => optDiv.remove());
            listContainer.appendChild(optDiv);
            if (window.lucide) lucide.createIcons();
        };

        if (optionsArray && optionsArray.length > 0) {
            optionsArray.forEach(opt => createOptionInput(optionsList, opt));
        }

        addOptionBtn.addEventListener('click', () => createOptionInput(optionsList));

        deleteBtn.addEventListener('click', () => {
            mainRow.remove();
            detailsRow.remove();
        });

        formBuilderContainer.appendChild(mainRow);
        formBuilderContainer.appendChild(detailsRow);

        if (shouldAutoExpand) {
            mainRow.classList.add('expanded-parent');
        }

        if (window.lucide) lucide.createIcons();
    };

    addFormFieldRow('Why do you deserve this educational assistance?', 'Text', true);
    if (addFieldBtn) addFieldBtn.addEventListener('click', () => addFormFieldRow());


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
        { id: 7, name: "Certificate of Indigency", description: "", size: 5, required: true, ocr: true, isDefault: true, isIncluded: true }
    ];

    function renderDocs() {
        if (!docBuilderContainer) return;
        docBuilderContainer.innerHTML = '';

        docRequirements.forEach((doc, index) => {
            const isRowActive = doc.isIncluded !== false;
            const disableInputsAttr = !isRowActive ? 'disabled' : '';
            const inputBg = doc.isDefault || !isRowActive ? 'background:var(--input-bg); color:var(--text-muted);' : 'background:var(--card-bg); color:var(--text-main);';

            const isOcrClickable = doc.isDefault && isRowActive;
            const ocrDisabledAttr = isOcrClickable ? '' : 'disabled';
            const ocrCursor = isOcrClickable ? 'pointer' : 'not-allowed';
            const ocrBgColor = (doc.ocr && isRowActive) ? 'var(--forest-shade)' : 'var(--border-color)';

            const mainRow = document.createElement('tr');
            mainRow.className = `doc-main-row builder-main-row`;
            if (!isRowActive) mainRow.style.opacity = '0.55';

            const detailsRow = document.createElement('tr');
            detailsRow.className = `doc-details-row builder-details-row`;

            mainRow.innerHTML = `
                <td style="text-align: center;">
                    <button type="button" class="btn-expand-row" title="Expand description and student instructions">
                        <i data-lucide="chevron-right" class="expand-chevron"></i>
                    </button>
                </td>
                <td>
                    <input type="text" class="doc-name form-input" value="${escapeHtml(doc.name)}" onchange="updateDoc(${index}, 'name', this.value)" ${doc.isDefault || !isRowActive ? 'readonly' : ''} style="${inputBg}; width:100%;">
                </td>
                <td>
                    <select class="doc-size form-input" onchange="updateDoc(${index}, 'size', this.value)" ${disableInputsAttr} style="width:100%;">
                        <option value="2" ${doc.size == 2 ? 'selected' : ''}>2 MB</option>
                        <option value="5" ${doc.size == 5 ? 'selected' : ''}>5 MB</option>
                        <option value="10" ${doc.size == 10 ? 'selected' : ''}>10 MB</option>
                    </select>
                </td>
                <td style="text-align: center;">
                    <div style="display:flex; justify-content:center;">
                        <label class="toggle-switch" title="${doc.isDefault ? 'Enable OCR AI Validation?' : 'AI Scan is only available for system default documents'}">
                            <input type="checkbox" class="doc-ocr" onchange="updateDoc(${index}, 'ocr', this.checked)" ${doc.ocr ? 'checked' : ''} ${ocrDisabledAttr}>
                            <span class="slider" style="background-color: ${ocrBgColor}; cursor:${ocrCursor};"></span>
                        </label>
                    </div>
                </td>
                <td style="text-align: center;">
                    <div style="display:flex; justify-content:center;">
                        ${doc.isDefault
                            ? `<label class="toggle-switch" title="Include this default document?">
                                    <input type="checkbox" onchange="updateDoc(${index}, 'isIncluded', this.checked)" ${doc.isIncluded ? 'checked' : ''}>
                                    <span class="slider" style="background-color: ${doc.isIncluded ? 'var(--forest-shade)' : 'var(--border-color)'};"></span>
                               </label>`
                            : `<span class="table-status-badge table-status-default">Required</span>`
                        }
                    </div>
                </td>
                <td style="text-align: center;">
                    <div style="display:flex; justify-content:center;">
                        ${doc.isDefault
                            ? `<span class="table-status-badge table-status-default" title="System default requirement"><i data-lucide="lock" style="width:12px;height:12px;"></i> System</span>`
                            : `<button type="button" onclick="removeDoc(${index})" class="btn-icon-table" style="color:var(--danger-color);" title="Remove Custom Requirement"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>`
                        }
                    </div>
                </td>
            `;

            detailsRow.innerHTML = `
                <td colspan="6" class="details-cell">
                    <div class="details-content-box">
                        <div class="details-field-header">
                            <div class="details-field-label">
                                <i data-lucide="file-text" style="width: 14px; height: 14px;"></i> Document Description & Student Instructions
                            </div>
                            ${doc.ocr ? `<span class="table-status-badge table-status-ocr"><i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> AI OCR Extraction Active</span>` : ''}
                        </div>
                        <textarea class="doc-desc form-input auto-expand-input" rows="2" placeholder="Optional brief instructions for the student (e.g., Must show official seal, clear signature, GWA breakdown)..." onchange="updateDoc(${index}, 'description', this.value)" oninput="updateDoc(${index}, 'description', this.value)" ${disableInputsAttr}>${doc.description || ''}</textarea>
                    </div>
                </td>
            `;

            const expandBtn = mainRow.querySelector('.btn-expand-row');
            const docDescTextarea = detailsRow.querySelector('.doc-desc');

            const adjustDocDescHeight = () => {
                docDescTextarea.style.height = 'auto';
                docDescTextarea.style.height = Math.max(64, docDescTextarea.scrollHeight) + 'px';
            };
            docDescTextarea.addEventListener('input', adjustDocDescHeight);

            expandBtn.addEventListener('click', () => {
                const isOpen = detailsRow.classList.toggle('is-open');
                expandBtn.classList.toggle('is-expanded', isOpen);
                mainRow.classList.toggle('expanded-parent', isOpen);
                if (isOpen) {
                    setTimeout(adjustDocDescHeight, 0);
                }
                if (window.lucide) lucide.createIcons();
            });

            docBuilderContainer.appendChild(mainRow);
            docBuilderContainer.appendChild(detailsRow);
        });

        if (window.lucide) lucide.createIcons();
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

    if (addDocBtn) {
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
        document.querySelectorAll('.form-field-main-row').forEach(row => {
            const type = row.querySelector('.field-type').value;
            const formatRule = row.querySelector('.field-format').value;
            const rowId = row.dataset.rowId;
            let options = [];

            const detailsRow = row.nextElementSibling && row.nextElementSibling.classList.contains('form-field-details-row') 
                ? row.nextElementSibling 
                : document.querySelector(`.form-field-details-row[data-row-id="${rowId}"]`);

            if (type === 'Dropdown' || type === 'Selection') {
                if (detailsRow) {
                    detailsRow.querySelectorAll('.option-input').forEach(opt => {
                        if (opt.value.trim() !== '') options.push(opt.value.trim());
                    });
                }
            }

            const allowMultiple = (type === 'Selection' && detailsRow) 
                ? detailsRow.querySelector('.field-multiple')?.checked || false 
                : false;

            formFields.push({
                label: row.querySelector('.field-label').value.trim(),
                type: type,
                format_rule: type === 'Text' ? formatRule : 'No formatting',
                required: row.querySelector('.field-required').checked,
                allow_multiple: allowMultiple,
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

        const batch = document.getElementById('sch_batch') ? document.getElementById('sch_batch').value.trim() : '';
        const semester = document.getElementById('sch_semester') ? document.getElementById('sch_semester').value : '';
        const schoolYear = document.getElementById('sch_school_year') ? document.getElementById('sch_school_year').value : '';

        const isDynamicSlots = document.getElementById('dynamicSlots') ? document.getElementById('dynamicSlots').checked : false;
        let fixedSlotsVal = parseInt(document.getElementById('fixedSlots')?.value, 10);
        if (isNaN(fixedSlotsVal) || fixedSlotsVal < 1) fixedSlotsVal = 0;
        const slotsValue = isDynamicSlots ? "Open" : fixedSlotsVal;

        // Collect selected year levels and programs from touch-friendly checkboxes
        const targetYears = Array.from(document.querySelectorAll('.eligibility-year-checkbox:checked')).map(cb => cb.value);
        const targetPrograms = Array.from(document.querySelectorAll('.eligibility-program-checkbox:checked')).map(cb => cb.value);

        let minHsAvg = document.getElementById('minHsAverage')?.value ? parseFloat(document.getElementById('minHsAverage').value) : null;
        if (minHsAvg !== null) {
            if (minHsAvg < 0) minHsAvg = 0;
            if (minHsAvg > 100) minHsAvg = 100;
        }

        let minColGwa = document.getElementById('minCollegeGwa')?.value ? parseFloat(document.getElementById('minCollegeGwa').value) : null;
        if (minColGwa !== null) {
            if (minColGwa < 0) minColGwa = 0;
            if (minColGwa > 5.0) minColGwa = 5.0;
        }

        let minHsSubject = document.getElementById('minHsSubject')?.value ? parseFloat(document.getElementById('minHsSubject').value) : null;
        if (minHsSubject !== null) {
            if (minHsSubject < 0) minHsSubject = 0;
            if (minHsSubject > 100) minHsSubject = 100;
        }

        let minColSubject = document.getElementById('minCollegeSubject')?.value ? parseFloat(document.getElementById('minCollegeSubject').value) : null;
        if (minColSubject !== null) {
            if (minColSubject < 0) minColSubject = 0;
            if (minColSubject > 5.0) minColSubject = 5.0;
        }

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
            available_slots: isDynamicSlots ? 0 : fixedSlotsVal,
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
            if (data.start_date && data.end_date) {
                const options = { year: 'numeric', month: 'short', day: 'numeric' };
                const sDate = new Date(data.start_date).toLocaleDateString('en-US', options);
                const eDate = new Date(data.end_date).toLocaleDateString('en-US', options);
                dateText = `${sDate} to ${eDate}`;
            } else if (data.end_date) {
                const options = { year: 'numeric', month: 'long', day: 'numeric' };
                dateText = new Date(data.end_date).toLocaleDateString('en-US', options);
            }

            let html = `
            <div class="preview-mockup">
                <div class="preview-mockup-header">
                    <span><i data-lucide="graduation-cap" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> Educational Assistance Application Form</span>
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
                            <h4 style="font-size:16px; margin-bottom:10px; color: var(--text-main);">About this Educational Assistance</h4>
                            <div class="preview-description" style="font-size:13px; color: var(--text-muted); margin-bottom:20px; line-height:1.6;">${data.description || 'An educational assistance program that recognizes students with outstanding academic performance.'}</div>
                            
                            <h4 style="font-size:16px; margin-bottom:10px; color: var(--text-main);">Eligibility Requirements</h4>
                            <ul class="preview-eligibility-list" style="list-style:none; font-size:13px; color: var(--text-muted); padding:0;">
                                ${data.min_hs_average ? `<li class="preview-eligibility-item" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> Must have a High School Average of <b>${data.min_hs_average}</b> or better.</li>` : ''}
                                ${data.min_college_gwa ? `<li class="preview-eligibility-item" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> Must have a College GWA of <b>${data.min_college_gwa}</b> or better.</li>` : ''}
                                ${data.min_hs_subject_grade ? `<li class="preview-eligibility-item" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> Must have NO High School subject grade lower than <b>${data.min_hs_subject_grade}</b>.</li>` : ''}
                                ${data.min_college_subject_grade ? `<li class="preview-eligibility-item" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> Must have NO individual College subject grade lower than <b>${data.min_college_subject_grade}</b>.</li>` : ''}
                                <li class="preview-eligibility-item" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> Open to Year Levels: <b>${data.eligibility_years.length > 0 ? data.eligibility_years.join(', ') : 'Any'}</b>.</li>
                                <li class="preview-eligibility-item" style="margin-bottom:6px; display:flex; align-items:center; gap:6px;"><i data-lucide="check" style="color: var(--moss-green); width: 16px; height: 16px; flex-shrink: 0;"></i> Open to Programs: <b>${data.eligibility_programs.length > 0 ? (data.eligibility_programs.length === availablePrograms.length ? 'All Programs' : `${data.eligibility_programs.length} Programs selected`) : 'Any'}</b>.</li>
                            </ul>
                        </div>
                        
                        <div class="preview-info-box">
                            <div class="preview-info-label">Application Period</div>
                            <div class="preview-info-value text-red" style="font-size:13px;">${dateText}</div>
                            
                            <div class="preview-info-label">Available Slots</div>
                            <div class="preview-info-value">${data.slots}</div>

                            <div class="preview-info-label">School Year</div>
                            <div class="preview-info-value">${data.school_year || 'N/A'}</div>
                            
                            <div class="preview-info-label">Status</div>
                            <div class="preview-info-value text-green">ACTIVE</div>
                        </div>
                    </div>

                    <div style="text-align:center; margin-bottom:30px;">
                        <h2 style="font-size:22px; margin-bottom:5px; color: var(--text-main);">Application Form</h2>
                        <p style="color: var(--text-muted); font-size:13px;">Complete the required fields below.</p>
                    </div>

                    <div class="preview-section-title">1. Applicant Profile</div>
                    <p style="font-size:12px; color: var(--text-muted); margin-bottom:15px;">This information is permanently tied to your account. To edit, go to Profile Settings.</p>
                    
                    ${(() => {
                        const fmt = (val, rule) => {
                            if (!val || typeof val !== 'string') return val;
                            if (rule === 'UPPERCASE') return val.toUpperCase();
                            if (rule === 'lowercase') return val.toLowerCase();
                            if (rule === 'Capitalize Each Word') return val.replace(/\b\w/g, l => l.toUpperCase());
                            return val;
                        };
                        const af = data.auto_collected_formats || {};
                        return `
                    <div class="preview-field-grid">
                        <div class="preview-input-group"><label>Student ID Number</label><input type="text" class="preview-input" value="202302709" readonly></div>
                        <div class="preview-input-group"><label>Email Address</label><input type="text" class="preview-input" value="${fmt('student@gmail.com', af['Email Address'] || af['Email'])}" readonly></div>
                        <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Full Name</label><input type="text" class="preview-input" value="${fmt('John Jeffrey T. Cañete', af['Full Name'])}" readonly></div>
                        <div class="preview-input-group"><label>Date of Birth</label><input type="text" class="preview-input" value="N/A" readonly></div>
                        <div class="preview-input-group"><label>Gender</label><input type="text" class="preview-input" value="${fmt('Male', af['Gender'])}" readonly></div>
                        <div class="preview-input-group" style="grid-column: 1 / -1;"><label>Address</label><input type="text" class="preview-input" value="${fmt('N/A', af['Address'])}" readonly></div>
                        <div class="preview-input-group"><label>Program</label><input type="text" class="preview-input" value="${fmt('BS Information Technology', af['Program'])}" readonly></div>
                        <div class="preview-input-group"><label>Year Level</label><input type="text" class="preview-input" value="${fmt('4th year', af['Year Level'])}" readonly></div>
                    </div>`;
                    })()}

                    <div class="preview-section-title">2. Questionnaire</div>
                    ${data.form_fields.length === 0 ? '<p style="font-size:13px; color: var(--text-muted);">No custom questions added.</p>' : ''}
                    ${data.form_fields.map(f => `
                        <div class="preview-input-group" style="margin-bottom:15px;">
                            <label>${f.label} ${f.required ? '<span class="text-red">*</span>' : ''}</label>
                            ${['Dropdown', 'Selection'].includes(f.type)
                    ? `<select class="preview-input preview-input-active"><option>Select option...</option>${f.options.map(o => `<option>${o}</option>`).join('')}</select>`
                    : `<input type="text" class="preview-input preview-input-active" placeholder="Enter your answer...">`
                }
                        </div>
                    `).join('')}

                    <div class="preview-section-title">3. Document Uploads</div>
                    ${(() => {
                        const hasOcr = data.document_configurations.some(d => d.ocr_enabled);
                        if (!hasOcr) return '';
                        return `
                        <div class="preview-ai-banner">
                            <i data-lucide="bot" style="width: 22px; height: 22px; flex-shrink: 0; color: var(--river-blue);"></i>
                            <div>
                                <strong>AI Verification Active:</strong> Please ensure your documents are clear and legible. Our AI system will scan the contents to verify authenticity, signatures, and ensure your grades meet the minimum eligibility rules for this educational assistance.
                            </div>
                        </div>`;
                    })()}

                    ${data.document_configurations.length === 0 ? '<p style="font-size:13px; color: var(--text-muted);">No documents required.</p>' : ''}
                    ${data.document_configurations.map(d => {
                        const hasDesc = d.description && d.description.trim() !== '';
                        const ocrBadge = d.ocr_enabled
                            ? `<span class="preview-ocr-badge active"><i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> AI OCR Validation Active</span>`
                            : `<span class="preview-ocr-badge inactive"><i data-lucide="file-text" style="width: 12px; height: 12px;"></i> Standard Upload</span>`;
                        
                        return `
                        <div class="preview-doc-box">
                            <div class="preview-doc-header">
                                <label style="font-size:13.5px; font-weight:700; color: var(--text-main); display:inline-flex; align-items:center; gap:6px; margin:0;">
                                    <i data-lucide="upload" style="width: 15px; height: 15px; color: var(--forest-shade);"></i> Upload ${escapeHtml(d.name)} ${d.required ? '<span class="text-red">*</span>' : '<span style="font-size:11px; color:var(--text-muted); font-weight:normal; margin-left:2px;">(Optional)</span>'}
                                </label>
                                <div>${ocrBadge}</div>
                            </div>

                            ${hasDesc ? `
                            <div class="preview-doc-instruction">
                                <div class="preview-instruction-title">
                                    <i data-lucide="info" style="width: 13px; height: 13px;"></i> Document Description & Student Instructions:
                                </div>
                                <div class="preview-instruction-body">${escapeHtml(d.description).replace(/\n/g, '<br>')}</div>
                            </div>
                            ` : ''}

                            <div style="font-size:11px; color: var(--text-muted); margin-bottom:10px;">Allowed formats: PDF, JPG, PNG (Max size: ${d.max_size}MB)</div>
                            <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
                                <button type="button" style="padding:6px 16px; background:var(--card-bg); border:1px solid var(--border-color); border-radius:6px; font-size:12px; cursor:not-allowed; color: var(--text-muted);">Choose File</button>
                                <span style="font-size:11px; color: var(--text-muted);">No file selected</span>
                            </div>
                        </div>
                        `;
                    }).join('')}

                    <button type="button" class="preview-submit-btn">Submit Application</button>
                </div>
            </div>`;

            Swal.fire({
                html: html,
                width: '1080px',
                padding: '0',
                showConfirmButton: false,
                showCloseButton: true,
                allowOutsideClick: false,
                allowEscapeKey: false,
                customClass: {
                    popup: 'preview-swal-popup'
                },
                didOpen: () => {
                    if (window.lucide) lucide.createIcons();
                }
            });
        });
    }

    // ==========================================
    // 8A. LOAD SCHOLARSHIP DATA (EDIT MODE)
    // ==========================================
    const loadScholarshipData = async () => {
        try {
            const { data: sch, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('id', scholarshipId)
                .single();

            if (error) throw error;

            if (document.getElementById('sch_title')) document.getElementById('sch_title').value = sch.title || '';
            if (document.getElementById('sch_category')) document.getElementById('sch_category').value = sch.category || 'Institution-Funded Educational Assistance';
            if (document.getElementById('sch_type')) document.getElementById('sch_type').value = sch.scholarship_type || 'Merit-Based';

            if (document.getElementById('sch_description')) document.getElementById('sch_description').value = sch.description || '';
            if (document.getElementById('sch_description_editor')) document.getElementById('sch_description_editor').innerHTML = sch.description || '';
            if (document.getElementById('sch_batch')) document.getElementById('sch_batch').value = sch.batch || '';
            if (document.getElementById('sch_semester')) document.getElementById('sch_semester').value = sch.semester || '';
            
            // School year dropdown load
            if (sch.school_year) {
                populateSchoolYearDropdown(sch.school_year);
            }

            // Application Period (Date Range) load
            if (sch.start_date && sch.end_date) {
                if (document.getElementById('sch_start')) document.getElementById('sch_start').value = sch.start_date;
                if (document.getElementById('sch_end')) document.getElementById('sch_end').value = sch.end_date;
                if (dateRangePicker) {
                    dateRangePicker.setDate([sch.start_date, sch.end_date], true);
                }
            } else if (sch.start_date) {
                if (document.getElementById('sch_start')) document.getElementById('sch_start').value = sch.start_date;
                if (document.getElementById('sch_end')) document.getElementById('sch_end').value = sch.start_date;
                if (dateRangePicker) {
                    dateRangePicker.setDate([sch.start_date], true);
                }
            }

            // Slots Loading
            const dynamicSlotsCb = document.getElementById('dynamicSlots');
            const fixedSlotsInput = document.getElementById('fixedSlots');
            if (sch.slots === 'Open') {
                if (dynamicSlotsCb) dynamicSlotsCb.checked = true;
                if (fixedSlotsInput) fixedSlotsInput.style.display = 'none';
            } else {
                if (dynamicSlotsCb) dynamicSlotsCb.checked = false;
                if (fixedSlotsInput) {
                    fixedSlotsInput.style.display = 'block';
                    fixedSlotsInput.value = sch.slots || 0;
                }
            }

            // Academic Grades Loading
            if (document.getElementById('minHsAverage')) document.getElementById('minHsAverage').value = sch.min_hs_average || '';
            if (document.getElementById('minCollegeGwa')) document.getElementById('minCollegeGwa').value = sch.min_college_gwa || '';
            if (document.getElementById('minHsSubject')) document.getElementById('minHsSubject').value = sch.min_hs_subject_grade || '';
            if (document.getElementById('minCollegeSubject')) document.getElementById('minCollegeSubject').value = sch.min_college_subject_grade || '';

            // Eligibility Years Loading (Checkboxes)
            if (sch.eligibility_years) {
                const yearsArr = Array.isArray(sch.eligibility_years) ? sch.eligibility_years : [];
                document.querySelectorAll('.eligibility-year-checkbox').forEach(cb => {
                    cb.checked = yearsArr.includes(cb.value);
                    const card = cb.closest('.touch-checkbox-card');
                    if (card) card.classList.toggle('is-checked', cb.checked);
                });
                updateToggleYearsButtonText();
            }

            // Eligibility Programs Loading (Checkboxes)
            if (sch.eligibility_programs) {
                const progsArr = Array.isArray(sch.eligibility_programs) ? sch.eligibility_programs : [];
                document.querySelectorAll('.eligibility-program-checkbox').forEach(cb => {
                    cb.checked = progsArr.includes(cb.value);
                    const card = cb.closest('.touch-checkbox-card');
                    if (card) card.classList.toggle('is-checked', cb.checked);
                });
                updateToggleProgramsButtonText();
            }

            // Form Fields Loading
            const formBuilderContainer = document.getElementById('form-builder-container');
            if (formBuilderContainer) formBuilderContainer.innerHTML = '';
            if (sch.form_fields && sch.form_fields.length > 0) {
                sch.form_fields.forEach(field => {
                    addFormFieldRow(field.label, field.type, field.required, field.allow_multiple || false, field.options || []);
                });
            } else {
                addFormFieldRow('Why do you deserve this educational assistance?', 'Text', true);
            }

            // Auto formats loading
            if (sch.auto_collected_formats) {
                document.querySelectorAll('.auto-field-format').forEach(select => {
                    const fieldName = select.dataset.field;
                    if (sch.auto_collected_formats[fieldName]) {
                        select.value = sch.auto_collected_formats[fieldName];
                    }
                });
            }

            // Document Configs Loading (With Smart Merge for missing defaults)
            if (sch.document_configurations && sch.document_configurations.length > 0) {
                let loadedDocs = sch.document_configurations.map((doc, idx) => ({
                    id: Date.now() + idx,
                    name: doc.name,
                    description: doc.description || "",
                    size: doc.max_size || 5,
                    required: true,
                    ocr: doc.ocr_enabled || false,
                    isDefault: doc.is_system_default || false,
                    isIncluded: true
                }));

                const coreDefaultDocs = [
                    { name: "Report Card (Form 138) (High School Level)", description: "", size: 5, required: true, ocr: true, isDefault: true },
                    { name: "General Weighted Average (College Level)", description: "", size: 5, required: true, ocr: true, isDefault: true },
                    { name: "Certification from the School Principal", description: "", size: 5, required: true, ocr: true, isDefault: true },
                    { name: "Official Honor Certificate", description: "", size: 5, required: true, ocr: true, isDefault: true },
                    { name: "Certificate of Residency", description: "", size: 5, required: true, ocr: true, isDefault: true },
                    { name: "Barangay Clearance", description: "", size: 5, required: true, ocr: true, isDefault: true },
                    { name: "Certificate of Indigency", description: "", size: 5, required: true, ocr: true, isDefault: true }
                ];

                coreDefaultDocs.forEach(def => {
                    const existsInDb = loadedDocs.find(ld => ld.name === def.name);
                    if (!existsInDb) {
                        loadedDocs.push({
                            id: Date.now() + Math.random(),
                            name: def.name,
                            description: def.description,
                            size: def.size,
                            required: true,
                            ocr: def.ocr,
                            isDefault: true,
                            isIncluded: false
                        });
                    }
                });

                loadedDocs.sort((a, b) => (b.isDefault === a.isDefault ? 0 : b.isDefault ? 1 : -1));
                docRequirements = loadedDocs;

            }
            renderDocs();

        } catch (err) {
            console.error("Failed to load educational assistance data:", err);
            Swal.fire("Error", "Error loading details: " + err.message, "error");
        }
    };

    if (isEditMode) {
        loadScholarshipData();
    }

    const saveScholarship = async (status, btnElement) => {
        try {
            const payload = gatherScholarshipData(status);

            if (!payload.title || !payload.start_date) {
                Swal.fire('Missing Information', 'Please provide an Educational Assistance Name and Application Start Date.', 'warning');
                return;
            }

            if (!payload.school_id) {
                Swal.fire('Account Error', 'Cannot save: Your admin account is not linked to a school.', 'error');
                return;
            }

            if (status === 'Active') {
                const confirm = await Swal.fire({
                    title: isEditMode ? 'Ready to Update & Publish?' : 'Ready to Publish?',
                    text: isEditMode ? "The changes will be live immediately for students." : "Once published, students will be able to view and apply to this assistance program.",
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#1F3D2E',
                    cancelButtonColor: '#94a3b8',
                    confirmButtonText: isEditMode ? 'Yes, Update Now!' : 'Yes, Publish Now!'
                });
                if (!confirm.isConfirmed) return;
            }

            btnElement.innerText = isEditMode ? "Updating..." : "Saving...";
            btnElement.disabled = true;

            if (isEditMode) {
                const { error } = await window.supabaseClient.from('scholarships').update(payload).eq('id', scholarshipId);
                if (error) throw error;
                
                try {
                    await window.supabaseClient.from('audit_logs').insert([{
                        admin_id: adminId,
                        school_id: currentAdminSchoolId,
                        action: 'Educational Assistance edited',
                        module: 'Scholarships',
                        details: JSON.stringify({ title: payload.title, id: scholarshipId, status: status })
                    }]);
                } catch (e) { console.warn("Audit logging failed:", e); }

            } else {
                const { error } = await window.supabaseClient.from('scholarships').insert([payload]);
                if (error) throw error;
                
                try {
                    await window.supabaseClient.from('audit_logs').insert([{
                        admin_id: adminId,
                        school_id: currentAdminSchoolId,
                        action: 'Educational Assistance created',
                        module: 'Scholarships',
                        details: JSON.stringify({ title: payload.title, status: status })
                    }]);
                } catch (e) { console.warn("Audit logging failed:", e); }
            }

            await Swal.fire({
                title: 'Success!',
                text: isEditMode ? 'Educational Assistance successfully updated!' : `Educational Assistance successfully saved as ${status}!`,
                icon: 'success',
                confirmButtonColor: '#1F3D2E'
            });
            
            window.location.href = 'admin-scholarships.html';

        } catch (error) {
            console.error('Error saving:', error);
            Swal.fire('Save Failed', error.message, 'error');
        } finally {
            if (isEditMode) {
                btnElement.innerHTML = status === 'Active' ? '<i data-lucide="send" style="width: 16px; height: 16px;"></i> Update & Publish' : '<i data-lucide="file-pen-line" style="width: 16px; height: 16px;"></i> Update Draft';
            } else {
                btnElement.innerHTML = status === 'Active' ? '<i data-lucide="send" style="width: 16px; height: 16px;"></i> Publish Educational Assistance' : '<i data-lucide="file-pen-line" style="width: 16px; height: 16px;"></i> Save as Draft';
            }
            btnElement.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    };

    if (publishBtn) publishBtn.addEventListener('click', () => saveScholarship('Active', publishBtn));
    if (draftBtn) draftBtn.addEventListener('click', () => saveScholarship('Draft', draftBtn));

    // Initialize all Lucide icons on page ready
    if (window.lucide) {
        lucide.createIcons();
    }
});