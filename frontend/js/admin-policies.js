document.addEventListener('DOMContentLoaded', async () => {

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }

    const adminId = session.user.id;
    let currentAdminSchoolId = null;
    let policyData = {};

    // Standardized Categories based on your system requirements
    const categoriesArray = [
        "Institution-Funded Educational Assistance",
        "Ched Educational Assistance",
        "Private Educational Assistance",
        "Government Educational Assistance"
    ];

    function getCategoryIcon(cat) {
        if (cat.includes("Institution")) return { bg: "#e0e7ff", color: "#4f46e5", icon: "fa-building-columns" };
        if (cat.includes("Ched")) return { bg: "#dcfce7", color: "#16a34a", icon: "fa-graduation-cap" };
        if (cat.includes("Private")) return { bg: "#fef3c7", color: "#d97706", icon: "fa-handshake" };
        if (cat.includes("Government")) return { bg: "#fce7f3", color: "#9333ea", icon: "fa-landmark" };
        return { bg: "#f1f5f9", color: "#64748b", icon: "fa-layer-group" };
    }

    // --- DOM Elements ---
    const chkGlobalEnabled = document.getElementById('pol-global-enabled');
    const inputGlobalLimit = document.getElementById('pol-global-limit');
    const badgeGlobalStatus = document.getElementById('global-limit-status');
    const btnSetZero = document.getElementById('btn-set-unlimited-global');

    const chkAutoValidate = document.getElementById('pol-auto-validate');
    const chkAllowOverride = document.getElementById('pol-allow-override');
    const btnSave = document.getElementById('btn-save-policies');

    const categoryCard = document.getElementById('category-limits-container');
    const matrixCard = document.getElementById('matrix-container');
    const summaryCard = document.getElementById('summary-container'); 

    // --- 2. INITIALIZATION ---
    async function init() {
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
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
                if(profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                await loadPolicies();
            }
        } catch (error) {
            console.error("Error initializing:", error);
        }
    }

    async function loadPolicies() {
        try {
            const { data: policy, error } = await window.supabaseClient
                .from('school_policies')
                .select('*')
                .eq('school_id', currentAdminSchoolId)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (policy) {
                policyData = policy;
                chkGlobalEnabled.checked = policy.global_enabled ?? true;
                inputGlobalLimit.value = policy.global_limit ?? 3;
                if (chkAutoValidate) chkAutoValidate.checked = policy.auto_validate ?? true;
                if (chkAllowOverride) chkAllowOverride.checked = policy.allow_override ?? true;
            }

            renderCategoryLimits();
            renderMatrix();
            renderSummary();
            attachDynamicListeners();
            triggerGlobalUIUpdates();

        } catch (err) {
            console.error("Error fetching policies:", err);
            renderCategoryLimits();
            renderMatrix();
            renderSummary();
            attachDynamicListeners();
            triggerGlobalUIUpdates();
        }
    }

    // --- 3. DYNAMIC UI GENERATORS ---
    function renderCategoryLimits() {
        let html = `
            <div class="card-header" style="margin-bottom: 10px;">
                <h3 style="font-size: 16px; margin: 0; font-weight: 700;">2. Per Category Limits</h3>
            </div>
            <p class="hint-text mb-20" style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">Set the maximum number of active educational assistance programs allowed per category.</p>
        `;

        categoriesArray.forEach(cat => {
            const safeId = cat.replace(/\s+/g, '_').toLowerCase();
            const styling = getCategoryIcon(cat);
            
            const limitsObj = policyData.category_limits || {};
            const defaultUnli = (cat.includes("Government") || cat.includes("Private"));
            
            const val = limitsObj[cat]?.limit ?? (defaultUnli ? 0 : 1);
            const unli = limitsObj[cat]?.unlimited ?? defaultUnli;

            html += `
            <div class="category-limit-row" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9; margin-bottom: 15px;">
                <div class="cat-label" style="display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600;">
                    <div class="cat-icon" style="background: ${styling.bg}; color: ${styling.color}; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px;"><i class="fa-solid ${styling.icon}"></i></div>
                    <span>${cat}</span>
                </div>
                <div class="cat-controls" style="display: flex; align-items: center; gap: 15px;">
                    <div class="input-group" style="margin: 0; width: 80px;">
                        <label style="font-size: 10px; display: block; margin-bottom: 4px; color: var(--text-muted);">Max Allowed</label>
                        <select id="limit_${safeId}" data-cat="${cat}" class="form-input dynamic-limit" style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 6px;" ${unli ? 'disabled' : ''}>
                            <option value="0" ${val == 0 ? 'selected' : ''}>0</option>
                            <option value="1" ${val == 1 ? 'selected' : ''}>1</option>
                            <option value="2" ${val == 2 ? 'selected' : ''}>2</option>
                            <option value="3" ${val == 3 ? 'selected' : ''}>3</option>
                            <option value="4" ${val == 4 ? 'selected' : ''}>4</option>
                            <option value="5" ${val == 5 ? 'selected' : ''}>5</option>
                        </select>
                    </div>
                    <label class="checkbox-label" style="font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" id="unli_${safeId}" data-cat="${cat}" class="dynamic-unli" ${unli ? 'checked' : ''}> Unlimited
                    </label>
                </div>
            </div>
            `;
        });
        categoryCard.innerHTML = html;
    }

    function renderMatrix() {
        const shortLabels = {
            "Institution-Funded Educational Assistance": "Institution",
            "Ched Educational Assistance": "CHED",
            "Private Educational Assistance": "Private",
            "Government Educational Assistance": "Government"
        };

        let html = `
            <div class="card-header" style="margin-bottom: 10px;">
                <h3 style="font-size: 16px; margin: 0; font-weight: 700;">3. Category Combination Rules</h3>
            </div>
            <p class="hint-text mb-20" style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">Choose which categories can be combined by a student simultaneously.</p>
            <div style="overflow-x: auto;">
                <table class="matrix-table" style="width: 100%; border-collapse: collapse; font-size: 13px; min-width: 600px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 10px; text-align: left;"></th>
        `;

        categoriesArray.forEach(cat => {
            html += `<th style="padding: 10px; text-align: center; color: var(--text-muted); font-weight:600;">${shortLabels[cat]}</th>`;
        });
        html += `</tr></thead><tbody>`;

        const comboObj = policyData.combination_rules || {};

        categoriesArray.forEach((rowCat, i) => {
            html += `<tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 12px 10px; font-weight: 600; color:var(--text-main);">${rowCat}</td>`;
            
            categoriesArray.forEach((colCat, j) => {
                if (i === j) {
                    html += `<td style="padding: 12px 10px; text-align: center; color: #cbd5e1;">—</td>`;
                } else {
                    const comboKey = `${rowCat}::${colCat}`;
                    const isChecked = comboObj[comboKey] ?? true; 
                    
                    if (j < i) {
                        html += `<td style="padding: 12px 10px; text-align: center;">
                                    <input type="checkbox" data-row="${rowCat}" data-col="${colCat}" class="dynamic-combo mirror-combo" ${isChecked ? 'checked' : ''} disabled style="opacity: 0.5; width: 16px; height: 16px;">
                                 </td>`;
                    } else {
                        html += `<td style="padding: 12px 10px; text-align: center;">
                                    <input type="checkbox" data-row="${rowCat}" data-col="${colCat}" class="dynamic-combo master-combo" ${isChecked ? 'checked' : ''} style="cursor:pointer; width: 16px; height: 16px; accent-color: var(--primary-color);">
                                 </td>`;
                    }
                }
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        matrixCard.innerHTML = html;
    }

    function renderSummary() {
        let html = `
            <div class="card-header" style="margin-bottom: 15px;">
                <h3 style="font-size: 16px; margin: 0; font-weight: 700;">5. Policy Summary</h3>
            </div>
            <div class="summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
        `;
        
        // Global Limit Summary
        const globalUnli = !chkGlobalEnabled.checked || parseInt(inputGlobalLimit.value) === 0;
        const globalVal = globalUnli ? "∞" : inputGlobalLimit.value;
        const globalSize = globalUnli ? "32px" : "24px";
        
        html += `
            <div class="summary-card" style="background: linear-gradient(135deg, #f8fafc 0%, #f8fbff 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div class="sum-icon" style="background: #dcfce7; color: #166534; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;"><i class="fa-solid fa-shield-halved"></i></div>
                <div>
                    <span style="display: block; font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em;">Global Limit</span>
                    <strong style="display: block; font-size: ${globalSize}; color: var(--text-main); line-height: 1.2; margin: 3px 0;">${globalVal}</strong>
                    <span style="font-size: 11px; color: var(--text-muted);">active assistances</span>
                </div>
            </div>
        `;

        // Category Limit Summary Cards
        categoriesArray.forEach(cat => {
            const safeId = cat.replace(/\s+/g, '_').toLowerCase();
            const unliEl = document.getElementById(`unli_${safeId}`);
            const limitEl = document.getElementById(`limit_${safeId}`);
            
            const isUnli = unliEl ? unliEl.checked : false;
            const limitVal = limitEl ? limitEl.value : "0";
            
            const finalVal = isUnli || parseInt(limitVal) === 0 ? "∞" : limitVal;
            const finalSize = finalVal === "∞" ? "32px" : "24px";

            const styling = getCategoryIcon(cat);
            let shortName = cat.replace(" Educational Assistance", "").replace("Institution-Funded", "Institution");

            html += `
            <div class="summary-card" style="background: linear-gradient(135deg, #f8fafc 0%, #f8fbff 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div class="sum-icon" style="background: ${styling.bg}; color: ${styling.color}; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;"><i class="fa-solid ${styling.icon}"></i></div>
                <div style="overflow: hidden;">
                    <span style="display: block; font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${cat}">${shortName}</span>
                    <strong style="display: block; font-size: ${finalSize}; color: var(--text-main); line-height: 1.2; margin: 3px 0;">${finalVal}</strong>
                    <span style="font-size: 11px; color: var(--text-muted);">active limit</span>
                </div>
            </div>
            `;
        });

        html += `</div>`;
        summaryCard.innerHTML = html;
    }

    function attachDynamicListeners() {
        document.querySelectorAll('.dynamic-unli').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const safeId = e.target.id.replace('unli_', '');
                document.getElementById(`limit_${safeId}`).disabled = e.target.checked;
                renderSummary();
            });
        });
        
        document.querySelectorAll('.dynamic-limit').forEach(sel => {
            sel.addEventListener('change', () => renderSummary());
        });

        document.querySelectorAll('.master-combo').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const row = e.target.dataset.row;
                const col = e.target.dataset.col;
                const mirror = document.querySelector(`.mirror-combo[data-row="${col}"][data-col="${row}"]`);
                if(mirror) mirror.checked = e.target.checked;
            });
        });
    }

    function triggerGlobalUIUpdates() {
        inputGlobalLimit.disabled = !chkGlobalEnabled.checked;
        badgeGlobalStatus.innerText = chkGlobalEnabled.checked ? "Enabled" : "Disabled";
        badgeGlobalStatus.style.background = chkGlobalEnabled.checked ? "#dcfce7" : "#f1f5f9";
        badgeGlobalStatus.style.color = chkGlobalEnabled.checked ? "#166534" : "#475569";
        renderSummary();
    }

    chkGlobalEnabled.addEventListener('change', triggerGlobalUIUpdates);
    inputGlobalLimit.addEventListener('input', triggerGlobalUIUpdates);
    btnSetZero.addEventListener('click', () => {
        inputGlobalLimit.value = 0;
        triggerGlobalUIUpdates();
    });

    async function savePolicies() {
        const category_limits = {};
        categoriesArray.forEach(cat => {
            const safeId = cat.replace(/\s+/g, '_').toLowerCase();
            const unliEl = document.getElementById(`unli_${safeId}`);
            const limitEl = document.getElementById(`limit_${safeId}`);
            const unli = unliEl ? unliEl.checked : false;
            const limit = limitEl ? parseInt(limitEl.value) : 0;
            category_limits[cat] = { unlimited: unli || limit === 0, limit: unli ? 0 : limit };
        });

        const combination_rules = {};
        document.querySelectorAll('.master-combo').forEach(chk => {
            const row = chk.dataset.row;
            const col = chk.dataset.col;
            combination_rules[`${row}::${col}`] = chk.checked;
            combination_rules[`${col}::${row}`] = chk.checked;
        });

        const payload = {
            school_id: currentAdminSchoolId,
            global_enabled: chkGlobalEnabled.checked,
            global_limit: parseInt(inputGlobalLimit.value) || 0,
            category_limits: category_limits,
            combination_rules: combination_rules,
            auto_validate: chkAutoValidate?.checked ?? true,
            allow_override: chkAllowOverride?.checked ?? true,
            updated_at: new Date().toISOString()
        };

        try {
            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            btnSave.disabled = true;

            const { error } = await window.supabaseClient
                .from('school_policies')
                .upsert(payload, { onConflict: 'school_id' });

            if (error) throw error;

            Swal.fire({
                title: 'Saved!',
                text: 'Your assistance policies have been successfully updated.',
                icon: 'success',
                confirmButtonColor: '#10b981'
            });

        } catch (err) {
            console.error("Save Error:", err);
            Swal.fire('Error', 'Failed to save policies. Please ensure your database table is updated with JSONB columns.', 'error');
        } finally {
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save All Changes';
            btnSave.disabled = false;
        }
    }

    // Ensure the form prevents default submit behavior and forwards to our save handler.
    const policiesForm = document.getElementById('policies-form');
    if (policiesForm) {
        policiesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await savePolicies();
        });
    }

    if (btnSave) {
        document.body.addEventListener('click', async (e) => {
            const target = e.target.closest('#btn-save-policies');
            if (!target) return;
            e.preventDefault();
            await savePolicies();
        });
    } else {
        console.error('Save button not found: #btn-save-policies');
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
    // 8. MOBILE HAMBURGER MENU TOGGLE
    // ==========================================
    const hamburgerBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar-container');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn && sidebar && overlay) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = sidebar.classList.contains('active');
            if (isActive) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.remove('active');
            } else {
                sidebar.classList.add('active');
                overlay.classList.add('active');
                const innerSidebar = document.querySelector('.sidebar');
                if (innerSidebar) innerSidebar.classList.add('active');
            }
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            const innerSidebar = document.querySelector('.sidebar');
            if (innerSidebar) innerSidebar.classList.remove('active');
        });
    } 

    init();
});