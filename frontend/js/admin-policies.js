document.addEventListener('DOMContentLoaded', async () => {
    
    // ==========================================
    // 1. AUTH CHECK & INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login-student.html';
        return;
    }

    const adminId = session.user.id;
    let currentAdminSchoolId = null;

    // ==========================================
    // 2. HEADER PROFILE & DROPDOWN LOGIC
    // ==========================================
    async function initProfile() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', adminId)
                .single();

            if (profile) {
                if (profile.role !== 'admin') {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;

                const name = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                document.getElementById('header-name').innerText = name;
                if (profile.avatar_url) document.getElementById('header-avatar').src = profile.avatar_url;

                // Load the policies after getting school ID
                loadPolicies();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        }
    }

    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');
    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('show'); });
        document.addEventListener('click', (e) => { if (!profileToggle.contains(e.target)) profileMenu.classList.remove('show'); });
    }

    document.getElementById('dropdown-logout-btn').addEventListener('click', (e) => {
        e.preventDefault(); document.getElementById('logout-modal').style.display = 'flex'; profileMenu.classList.remove('show');
    });
    document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('logout-modal').style.display = 'none');
    document.getElementById('modal-confirm').addEventListener('click', async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'login-student.html';
    });


    // ==========================================
    // 3. UI INTERACTIVITY & SUMMARY UPDATES
    // ==========================================
    
    // Elements
    const globalLimitToggle = document.getElementById('pol-global-enabled');
    const globalLimitInput = document.getElementById('pol-global-limit');
    const globalStatusBadge = document.getElementById('global-limit-status');

    const catChedSelect = document.getElementById('pol-cat-ched');
    const catChedUnli = document.getElementById('pol-unli-ched');
    const catSchoolSelect = document.getElementById('pol-cat-school');
    const catSchoolUnli = document.getElementById('pol-unli-school');
    const catOutsideSelect = document.getElementById('pol-cat-outside');
    const catOutsideUnli = document.getElementById('pol-unli-outside');

    const comboCheckboxes = document.querySelectorAll('.matrix-table .custom-checkbox:not([disabled])');

    // Sync Global Limit Toggle
    globalLimitToggle.addEventListener('change', () => {
        globalLimitInput.disabled = !globalLimitToggle.checked;
        globalStatusBadge.innerText = globalLimitToggle.checked ? "Enabled" : "Disabled";
        globalStatusBadge.className = globalLimitToggle.checked ? "status-badge" : "status-badge disabled";
        updateSummary();
    });

    // Sync Unlimited Checkboxes with Selects
    function bindUnlimitedToggle(checkbox, selectElement) {
        checkbox.addEventListener('change', () => {
            selectElement.disabled = checkbox.checked;
            if (checkbox.checked) selectElement.value = "0";
            updateSummary();
        });
        selectElement.addEventListener('change', () => {
            if (selectElement.value == "0") checkbox.checked = true;
            updateSummary();
        });
    }

    bindUnlimitedToggle(catChedUnli, catChedSelect);
    bindUnlimitedToggle(catSchoolUnli, catSchoolSelect);
    bindUnlimitedToggle(catOutsideUnli, catOutsideSelect);

    // Sync any input change to the summary panel
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', updateSummary);
        el.addEventListener('change', updateSummary);
    });

    // Update Summary Function
    window.updateSummary = () => {
        // Global
        if (!globalLimitToggle.checked || globalLimitInput.value == "0") {
            document.getElementById('sum-global').innerText = "∞";
            document.getElementById('sum-global').style.fontSize = "32px";
        } else {
            document.getElementById('sum-global').innerText = globalLimitInput.value;
            document.getElementById('sum-global').style.fontSize = "24px";
        }

        // CHED
        if (catChedUnli.checked || catChedSelect.value == "0") {
            document.getElementById('sum-ched').innerText = "∞";
            document.getElementById('sum-ched').style.fontSize = "32px";
        } else {
            document.getElementById('sum-ched').innerText = catChedSelect.value;
            document.getElementById('sum-ched').style.fontSize = "24px";
        }

        // School
        if (catSchoolUnli.checked || catSchoolSelect.value == "0") {
            document.getElementById('sum-school').innerText = "∞";
            document.getElementById('sum-school').style.fontSize = "32px";
        } else {
            document.getElementById('sum-school').innerText = catSchoolSelect.value;
            document.getElementById('sum-school').style.fontSize = "24px";
        }

        // Outside
        if (catOutsideUnli.checked || catOutsideSelect.value == "0") {
            document.getElementById('sum-outside').innerText = "∞";
            document.getElementById('sum-outside').style.fontSize = "32px";
        } else {
            document.getElementById('sum-outside').innerText = catOutsideSelect.value;
            document.getElementById('sum-outside').style.fontSize = "24px";
        }

        // Combo
        let anyComboAllowed = false;
        comboCheckboxes.forEach(cb => { if(cb.checked) anyComboAllowed = true; });
        document.getElementById('sum-combo').innerText = anyComboAllowed ? "Yes" : "No";
        document.getElementById('sum-combo').style.color = anyComboAllowed ? "var(--text-main)" : "var(--danger-color)";
    };

    // Mirror Matrix checkboxes logic (If A + B is allowed, B + A must be allowed)
    document.getElementById('combo-ched-school').addEventListener('change', (e) => document.getElementById('combo-school-ched').checked = e.target.checked);
    document.getElementById('combo-ched-outside').addEventListener('change', (e) => document.getElementById('combo-outside-ched').checked = e.target.checked);
    document.getElementById('combo-school-outside').addEventListener('change', (e) => document.getElementById('combo-outside-school').checked = e.target.checked);


    // ==========================================
    // 4. LOAD AND SAVE SETTINGS (Supabase)
    // ==========================================

    async function loadPolicies() {
        if (!currentAdminSchoolId) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('school_policies')
                .select('*')
                .eq('school_id', currentAdminSchoolId)
                .single();

            // If a record exists, populate the UI
            if (data) {
                // 1. Global
                globalLimitToggle.checked = data.global_limit_enabled;
                globalLimitInput.value = data.global_limit;
                
                // 2. Categories
                if (data.category_limits) {
                    const cl = data.category_limits;
                    catChedSelect.value = cl.ched;
                    catChedUnli.checked = cl.ched == 0;
                    
                    catSchoolSelect.value = cl.school;
                    catSchoolUnli.checked = cl.school == 0;
                    
                    catOutsideSelect.value = cl.outside;
                    catOutsideUnli.checked = cl.outside == 0;
                }

                // 3. Matrix
                if (data.combination_rules) {
                    const cr = data.combination_rules;
                    document.getElementById('combo-ched-school').checked = cr.ched_school;
                    document.getElementById('combo-school-ched').checked = cr.ched_school;
                    
                    document.getElementById('combo-ched-outside').checked = cr.ched_outside;
                    document.getElementById('combo-outside-ched').checked = cr.ched_outside;
                    
                    document.getElementById('combo-school-outside').checked = cr.school_outside;
                    document.getElementById('combo-outside-school').checked = cr.school_outside;
                }

                // 4. Others
                document.getElementById('pol-count-pending').checked = data.count_pending;
                document.getElementById('pol-count-expired').checked = data.count_expired;
                document.getElementById('pol-auto-validate').checked = data.auto_validate;
                document.getElementById('pol-allow-override').checked = data.allow_override;
            }
            
            // Force UI update to match loaded data
            globalLimitToggle.dispatchEvent(new Event('change'));
            catChedUnli.dispatchEvent(new Event('change'));
            catSchoolUnli.dispatchEvent(new Event('change'));
            catOutsideUnli.dispatchEvent(new Event('change'));
            updateSummary();

        } catch (err) {
            // Ignore 406 (Table not found) or PGRST116, it just means no policies saved yet.
            console.log("No existing policies found or table missing. Using defaults.", err.message);
            updateSummary(); // Initialize with HTML defaults
        }
    }

    document.getElementById('btn-save-policies').addEventListener('click', async () => {
        if (!currentAdminSchoolId) {
            alert("Cannot save policies. No school linked to this admin account.");
            return;
        }

        const btn = document.getElementById('btn-save-policies');
        btn.disabled = true;
        btn.innerText = "💾 Saving...";

        const payload = {
            school_id: currentAdminSchoolId,
            global_limit_enabled: globalLimitToggle.checked,
            global_limit: parseInt(globalLimitInput.value) || 0,
            category_limits: {
                ched: parseInt(catChedSelect.value) || 0,
                school: parseInt(catSchoolSelect.value) || 0,
                outside: parseInt(catOutsideSelect.value) || 0
            },
            combination_rules: {
                ched_school: document.getElementById('combo-ched-school').checked,
                ched_outside: document.getElementById('combo-ched-outside').checked,
                school_outside: document.getElementById('combo-school-outside').checked
            },
            count_pending: document.getElementById('pol-count-pending').checked,
            count_expired: document.getElementById('pol-count-expired').checked,
            auto_validate: document.getElementById('pol-auto-validate').checked,
            allow_override: document.getElementById('pol-allow-override').checked,
            updated_at: new Date().toISOString()
        };

        try {
            // UPSERT data into school_policies
            const { error } = await window.supabaseClient
                .from('school_policies')
                .upsert(payload, { onConflict: 'school_id' });

            if (error) throw error;
            
            alert("Scholarship Policies successfully saved!");

        } catch (err) {
            console.error("Save error:", err);
            alert("Failed to save policies. Please ensure the 'school_policies' table exists in your database.");
        } finally {
            btn.disabled = false;
            btn.innerText = "💾 Save All Changes";
        }
    });

    // Boot
    initProfile();
});