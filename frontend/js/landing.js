document.addEventListener('DOMContentLoaded', async () => {

    const schoolSelect = document.getElementById('school-select');
    const loginBtn = document.getElementById('btn-login-nav');
    const scholarshipsSection = document.getElementById('scholarships-section');
    const scholarshipGrid = document.getElementById('scholarship-grid');
    const selectedSchoolTitle = document.getElementById('selected-school-title');

    // --- 1. FETCH ACTUAL SCHOOL RECORDS FROM DATABASE ---
    async function loadSchools() {
        try {
            const { data: schools, error } = await window.supabaseClient
                .from('schools')
                .select('id, name')
                .order('name', { ascending: true });

            if (error) throw error;

            if (schools && schools.length > 0) {
                schools.forEach(school => {
                    const option = document.createElement('option');
                    option.value = school.id; 
                    option.textContent = school.name; 
                    schoolSelect.appendChild(option);
                });
            } else {
                schoolSelect.innerHTML = '<option disabled selected>No schools available</option>';
            }

        } catch (err) {
            console.error("Error fetching schools list:", err);
            schoolSelect.innerHTML = '<option disabled selected>Failed to load schools</option>';
        }
    }

    // --- 2. FETCH SCHOLARSHIPS ISOLATED BY SCHOOL ID ---
    async function fetchScholarshipsBySchool(schoolId) {
        try {
            scholarshipGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color:#64748b;">Loading scholarships...</p>';
            
            const { data: scholarships, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('status', 'Active')
                .eq('school_id', schoolId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            scholarshipGrid.innerHTML = '';

            if (!scholarships || scholarships.length === 0) {
                scholarshipGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
                        <p style="color: #64748b; margin: 0;">No active scholarships available for this school right now.</p>
                    </div>
                `;
                return;
            }

            scholarships.forEach(sch => {
                // Safe checks for nested JSON data
                const requirementsText = sch.eligibility_rules?.gwa?.enabled 
                    ? `Minimum GWA requirement: <strong>${sch.eligibility_rules.gwa.minimum}</strong>` 
                    : 'Open to standard academic profiles';

                const safeDescription = sch.description 
                    ? sch.description.replace(/<[^>]*>?/gm, '').substring(0, 95) + '...' 
                    : 'Open for application submissions.';

                const slotsText = sch.available_slots ? `${sch.available_slots} Slots Left` : 'Slots Vary';
                const categoryText = sch.category || 'General Grant';

                const card = document.createElement('div');
                card.className = 'sch-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom: 12px;">
                        <span style="background: #e6f4ea; color: #137333; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase;">
                            ${categoryText}
                        </span>
                        <span style="font-size: 12px; color: #64748b; font-weight: 600;">
                            ${slotsText}
                        </span>
                    </div>
                    <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px;">${sch.title}</h3>
                    <p style="margin-top: 0; margin-bottom: 16px; color: #475569; font-size: 14px; line-height: 1.5;">
                        ${safeDescription}
                    </p>
                    <div class="sch-reqs" style="border-left: 3px solid var(--primary-color, #3b82f6); padding-left: 10px; font-size: 13px; color: #334155; background: #f8fafc; padding: 8px 8px 8px 12px; border-radius: 0 4px 4px 0;">
                        ${requirementsText}
                    </div>    
                `;
                scholarshipGrid.appendChild(card);
            });

        } catch (err) {
            console.error("Error fetching matching scholarships:", err);
            scholarshipGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ef4444;">Failed to load available scholarships. Please check your connection.</p>';
        }
    }

    // --- 3. SELECTION EVENT HANDLER ---
    schoolSelect.addEventListener('change', (e) => {
        const schoolId = e.target.value;
        const schoolName = schoolSelect.options[schoolSelect.selectedIndex].text;
        
        if (schoolId) {
            localStorage.setItem('granteeSelectedSchoolId', schoolId);
            localStorage.setItem('granteeSelectedSchool', schoolName);
            
            if(loginBtn) loginBtn.style.display = 'block';

            if(scholarshipsSection) scholarshipsSection.classList.remove('hidden');
            if(selectedSchoolTitle) selectedSchoolTitle.innerText = `Available Scholarships at ${schoolName}`;

            fetchScholarshipsBySchool(schoolId);
        }
    });

    // --- 4. NAVIGATION SAFETY INTERCEPTOR ---
    if(loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            if (!schoolSelect.value || schoolSelect.value === 'Choose your school...') {
                e.preventDefault();
                alert("Please select your school from the dropdown list to proceed.");
                schoolSelect.focus();
            }
        });
    }

    // Boot
    loadSchools();
});