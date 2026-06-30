document.addEventListener('DOMContentLoaded', async () => {
    
    // --- AUTH & ID CHECK ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const scholarshipId = urlParams.get('id');

    if (!scholarshipId) {
        alert("No scholarship ID provided.");
        window.location.href = 'admin-scholarships.html';
        return;
    }

    // --- DOM Elements ---
    const titleEl = document.getElementById('preview-title');
    const categoryEl = document.getElementById('preview-category');
    const deptEl = document.getElementById('preview-department');
    const descEl = document.getElementById('preview-description');
    const deadlineEl = document.getElementById('preview-deadline');
    const slotsEl = document.getElementById('preview-slots');
    const statusEl = document.getElementById('preview-status');
    const eligibilityListEl = document.getElementById('preview-eligibility');
    
    const customFieldsContainer = document.getElementById('preview-custom-fields');
    const documentsContainer = document.getElementById('preview-documents');

    // --- FETCH DATA ---
    async function loadPreviewData() {
        try {
            const { data: sch, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('id', scholarshipId)
                .single();

            if (error) throw error;

            // 1. Setup Header & Details
            titleEl.innerText = sch.title;
            categoryEl.innerText = sch.category;
            deptEl.innerText = sch.department || 'General Admin';
            descEl.innerHTML = sch.description || 'No description provided.';
            
            if (sch.end_date) {
                const deadline = new Date(sch.end_date);
                deadlineEl.innerText = deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            } else {
                deadlineEl.innerText = 'No deadline set';
            }
            
            slotsEl.innerText = sch.available_slots || 'Unlimited';
            statusEl.innerText = sch.status.toUpperCase();

            // 2. Setup Eligibility List
            eligibilityListEl.innerHTML = '';
            if (sch.eligibility_rules) {
                const rules = sch.eligibility_rules;
                let hasRules = false;

                if (rules.gwa && rules.gwa.enabled) {
                    eligibilityListEl.innerHTML += `<li>Must have a General Weighted Average (GWA) of <strong>${rules.gwa.minimum}</strong> or better.</li>`;
                    hasRules = true;
                }
                if (rules.year_levels && rules.year_levels.enabled && rules.year_levels.allowed.length > 0) {
                    eligibilityListEl.innerHTML += `<li>Open to the following year levels: <strong>${rules.year_levels.allowed.join(', ')}</strong>.</li>`;
                    hasRules = true;
                }
                if (rules.program_department && rules.program_department.enabled && rules.program_department.allowed.length > 0) {
                    eligibilityListEl.innerHTML += `<li>Strictly for students enrolled in: <strong>${rules.program_department.allowed.join(', ')}</strong>.</li>`;
                    hasRules = true;
                }
                
                if (!hasRules) {
                    eligibilityListEl.innerHTML = '<li>Open to all students (No specific restrictions).</li>';
                }
            } else {
                eligibilityListEl.innerHTML = '<li>Open to all students.</li>';
            }

            // 3. Render Custom Form Fields
            customFieldsContainer.innerHTML = '';
            if (sch.form_fields && sch.form_fields.length > 0) {
                sch.form_fields.forEach(field => {
                    const fieldDiv = document.createElement('div');
                    fieldDiv.className = 'input-group full-width'; 
                    
                    const requiredStar = field.required ? '<span class="text-red">*</span>' : '';
                    let inputHtml = '';

                    if (field.type === 'Text' || field.type === 'Email' || field.type === 'Number') {
                        const inputType = field.type.toLowerCase();
                        inputHtml = `<input type="${inputType}" placeholder="Enter your ${field.label.toLowerCase()}..." disabled>`;
                    } 
                    else if (field.type === 'Dropdown') {
                        let optionsHtml = '<option value="">Select an option...</option>';
                        if (field.options) field.options.forEach(opt => optionsHtml += `<option value="${opt}">${opt}</option>`);
                        inputHtml = `<select disabled>${optionsHtml}</select>`;
                    }
                    else if (field.type === 'Selection') {
                        let radioHtml = '<div class="radio-group">';
                        if (field.options) field.options.forEach(opt => radioHtml += `<label><input type="radio" disabled> ${opt}</label>`);
                        radioHtml += '</div>';
                        inputHtml = radioHtml;
                    }

                    fieldDiv.innerHTML = `<label>${field.label} ${requiredStar}</label>${inputHtml}`;
                    customFieldsContainer.appendChild(fieldDiv);
                });
            } else {
                customFieldsContainer.innerHTML = '<p style="font-size:13px; color:#94a3b8; grid-column: 1/-1;">No additional questions required.</p>';
            }

            // 4. Render Document Requirements
            documentsContainer.innerHTML = '';
            if (sch.document_requirements && sch.document_requirements.length > 0) {
                sch.document_requirements.forEach(doc => {
                    const docDiv = document.createElement('div');
                    docDiv.className = 'doc-upload-box';
                    const requiredStar = doc.required ? '<span class="text-red">*</span>' : '';
                    
                    docDiv.innerHTML = `
                        <strong>📄 ${doc.name} ${requiredStar}</strong>
                        <span>Allowed formats: PDF, JPG, PNG (Max size: ${doc.max_size})</span>
                        <div class="fake-upload-btn">Choose File</div>
                    `;
                    documentsContainer.appendChild(docDiv);
                });
            } else {
                documentsContainer.innerHTML = '<p style="font-size:13px; color:#94a3b8;">No documents required.</p>';
            }

        } catch (error) {
            console.error("Error loading preview:", error);
            titleEl.innerText = "Error Loading Scholarship";
            descEl.innerText = "Could not retrieve data.";
        }
    }

    loadPreviewData();
});