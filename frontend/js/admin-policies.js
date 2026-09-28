(async function() {

    // --- 1. AUTH CHECK & INITIALIZATION ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }

    const adminId = session.user.id;
    let currentAdminSchoolId = null;
    let policyData = {};

    // Standardized Categories based on system requirements
    const categoriesArray = [
        "Institution-Funded Educational Assistance",
        "Ched Educational Assistance",
        "Private Educational Assistance",
        "Government Educational Assistance"
    ];

    function getCategoryIcon(cat) {
        if (cat.includes("Institution")) return { badgeClass: "cat-inst", icon: "building-2" };
        if (cat.includes("Ched")) return { badgeClass: "cat-ched", icon: "graduation-cap" };
        if (cat.includes("Private")) return { badgeClass: "cat-priv", icon: "handshake" };
        if (cat.includes("Government")) return { badgeClass: "cat-gov", icon: "award" };
        return { badgeClass: "cat-inst", icon: "layers" };
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

    // --- 2. INITIALIZATION ---
    async function init() {
        try {
            const { data: profile } = await window.supabaseClient
                .from('profiles')
                .select('*, schools(name)')
                .eq('id', adminId)
                .single();

            if (profile) {
                if (!['admin', 'coordinator'].includes(profile.role)) {
                    window.location.href = 'student-dashboard.html';
                    return;
                }
                currentAdminSchoolId = profile.school_id;
                const schoolName = profile.schools ? profile.schools.name : (profile.school || 'Unassigned School');
                
                const name = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                if(document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
                if(profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

                if (document.getElementById('admin-school-display')) {
                    document.getElementById('admin-school-display').innerHTML = `<i data-lucide="school" style="width: 15px; height: 15px; display: inline-block; vertical-align: middle;"></i> <span>${schoolName}</span>`;
                    if (typeof lucide !== 'undefined' && lucide.createIcons) {
                        lucide.createIcons();
                    }
                }

                sessionStorage.setItem('grantee_admin_profile', JSON.stringify({
                    name: name,
                    role: profile.role === 'admin' ? 'Coordinator' : profile.role,
                    avatar_url: profile.avatar_url || 'assets/admin-avatar.png',
                    school_name: schoolName,
                    school_id: profile.school_id
                }));

                await loadPolicies();
            }
        } catch (error) {
            console.error("Error initializing:", error);
        } finally {
            document.getElementById('header-titles-box')?.classList.remove('is-loading');
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
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
                if (chkGlobalEnabled) chkGlobalEnabled.checked = policy.global_enabled ?? true;
                if (inputGlobalLimit) inputGlobalLimit.value = policy.global_limit ?? 3;
                if (chkAutoValidate) chkAutoValidate.checked = policy.auto_validate ?? true;
                if (chkAllowOverride) chkAllowOverride.checked = policy.allow_override ?? true;
            }

            renderCategoryLimits();
            renderMatrix();
            attachDynamicListeners();
            triggerGlobalUIUpdates();

        } catch (err) {
            console.error("Error fetching policies:", err);
            renderCategoryLimits();
            renderMatrix();
            attachDynamicListeners();
            triggerGlobalUIUpdates();
        }
    }

    // --- 3. DYNAMIC UI GENERATORS ---
    function renderCategoryLimits() {
        if (!categoryCard) return;

        let html = `
            <div class="card-header">
                <h3>2. Per Category Limits</h3>
            </div>
            <p class="hint-text mb-20">Set the maximum number of active educational assistance programs allowed per category.</p>
        `;

        categoriesArray.forEach(cat => {
            const safeId = cat.replace(/\s+/g, '_').toLowerCase();
            const styling = getCategoryIcon(cat);
            
            const limitsObj = policyData.category_limits || {};
            const defaultUnli = (cat.includes("Government") || cat.includes("Private"));
            
            const val = limitsObj[cat]?.limit ?? (defaultUnli ? 0 : 1);
            const unli = limitsObj[cat]?.unlimited ?? defaultUnli;

            html += `
            <div class="category-limit-row">
                <div class="cat-label">
                    <div class="cat-icon-badge ${styling.badgeClass}">
                        <i data-lucide="${styling.icon}" style="width: 18px; height: 18px;"></i>
                    </div>
                    <span>${cat}</span>
                </div>
                <div class="cat-controls">
                    <div class="input-group" style="margin: 0; width: 90px;">
                        <label style="font-size: 11px; display: block; margin-bottom: 4px; color: var(--text-muted);">Max Allowed</label>
                        <select id="limit_${safeId}" data-cat="${cat}" class="form-input dynamic-limit" style="width: 100%; padding: 6px 8px; border-radius: 6px;" ${unli ? 'disabled' : ''}>
                            <option value="0" ${val == 0 ? 'selected' : ''}>0</option>
                            <option value="1" ${val == 1 ? 'selected' : ''}>1</option>
                            <option value="2" ${val == 2 ? 'selected' : ''}>2</option>
                            <option value="3" ${val == 3 ? 'selected' : ''}>3</option>
                            <option value="4" ${val == 4 ? 'selected' : ''}>4</option>
                            <option value="5" ${val == 5 ? 'selected' : ''}>5</option>
                        </select>
                    </div>
                    <label class="checkbox-label" style="font-size: 13px;">
                        <input type="checkbox" id="unli_${safeId}" data-cat="${cat}" class="dynamic-unli" ${unli ? 'checked' : ''}> Unlimited
                    </label>
                </div>
            </div>
            `;
        });
        categoryCard.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    function renderMatrix() {
        if (!matrixCard) return;

        const shortLabels = {
            "Institution-Funded Educational Assistance": "Institution",
            "Ched Educational Assistance": "CHED",
            "Private Educational Assistance": "Private",
            "Government Educational Assistance": "Government"
        };

        let html = `
            <div class="card-header">
                <h3>3. Category Combination Rules</h3>
            </div>
            <p class="hint-text mb-20">Choose which categories can be combined by a student simultaneously.</p>
            <div class="matrix-table-container">
                <table class="matrix-table">
                    <thead>
                        <tr>
                            <th>Category</th>
        `;

        categoriesArray.forEach(cat => {
            html += `<th>${shortLabels[cat]}</th>`;
        });
        html += `</tr></thead><tbody>`;

        const comboObj = policyData.combination_rules || {};

        categoriesArray.forEach((rowCat, i) => {
            html += `<tr>
                        <td>${rowCat}</td>`;
            
            categoriesArray.forEach((colCat, j) => {
                if (i === j) {
                    html += `<td style="color: var(--text-muted); font-weight: bold;">—</td>`;
                } else {
                    const comboKey = `${rowCat}::${colCat}`;
                    const isChecked = comboObj[comboKey] ?? true; 
                    
                    if (j < i) {
                        html += `<td>
                                    <input type="checkbox" data-row="${rowCat}" data-col="${colCat}" class="dynamic-combo mirror-combo" ${isChecked ? 'checked' : ''} disabled style="opacity: 0.5;">
                                 </td>`;
                    } else {
                        html += `<td>
                                    <input type="checkbox" data-row="${rowCat}" data-col="${colCat}" class="dynamic-combo master-combo" ${isChecked ? 'checked' : ''}>
                                 </td>`;
                    }
                }
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        matrixCard.innerHTML = html;
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    function attachDynamicListeners() {
        document.querySelectorAll('.dynamic-unli').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const safeId = e.target.id.replace('unli_', '');
                const sel = document.getElementById(`limit_${safeId}`);
                if (sel) sel.disabled = e.target.checked;
            });
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
        if (inputGlobalLimit && chkGlobalEnabled) {
            inputGlobalLimit.disabled = !chkGlobalEnabled.checked;
        }
        if (badgeGlobalStatus && chkGlobalEnabled) {
            badgeGlobalStatus.innerText = chkGlobalEnabled.checked ? "Enabled" : "Disabled";
            if (chkGlobalEnabled.checked) {
                badgeGlobalStatus.classList.remove("disabled");
            } else {
                badgeGlobalStatus.classList.add("disabled");
            }
        }
    }

    if (chkGlobalEnabled) chkGlobalEnabled.addEventListener('change', triggerGlobalUIUpdates);
    if (inputGlobalLimit) inputGlobalLimit.addEventListener('input', triggerGlobalUIUpdates);
    if (btnSetZero) {
        btnSetZero.addEventListener('click', () => {
            if (inputGlobalLimit) inputGlobalLimit.value = 0;
            triggerGlobalUIUpdates();
        });
    }

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
            global_enabled: chkGlobalEnabled ? chkGlobalEnabled.checked : true,
            global_limit: inputGlobalLimit ? (parseInt(inputGlobalLimit.value) || 0) : 0,
            category_limits: category_limits,
            combination_rules: combination_rules,
            auto_validate: chkAutoValidate?.checked ?? true,
            allow_override: chkAllowOverride?.checked ?? true,
            updated_at: new Date().toISOString()
        };

        try {
            if (btnSave) {
                btnSave.innerHTML = '<i data-lucide="loader" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i> <span>Saving...</span>';
                btnSave.disabled = true;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            }

            const { error } = await window.supabaseClient
                .from('school_policies')
                .upsert(payload, { onConflict: 'school_id' });

            if (error) throw error;

            showUIToast('success', 'Success', 'Your changes are saved successfully');

        } catch (err) {
            console.error("Save Error:", err);
            showUIToast('error', 'Error', 'Error has occurred while saving changes.');
        } finally {
            if (btnSave) {
                btnSave.innerHTML = '<i data-lucide="save" style="width: 16px; height: 16px;"></i> <span>Save All Changes</span>';
                btnSave.disabled = false;
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            }
        }
    }

    // ==========================================
    // TOAST UI DESIGN NOTIFICATION SYSTEM
    // ==========================================
    function showUIToast(type = 'success', title = '', message = '') {
        if (typeof window.showUIToast === 'function' && window.showUIToast !== showUIToast) {
            window.showUIToast(type, title, message);
            return;
        }

        let container = document.getElementById('custom-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'custom-toast-container';
            document.body.appendChild(container);
        }

        type = (type || 'success').toLowerCase();
        if (!['success', 'error', 'info', 'warning'].includes(type)) {
            type = 'info';
        }

        let iconSvg = '';
        if (type === 'success') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            if (!title) title = 'Success';
            if (!message) message = 'Your changes are saved successfully';
        } else if (type === 'error') {
            iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            if (!title) title = 'Error';
            if (!message) message = 'Error has occurred while saving changes.';
        } else if (type === 'info') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
            if (!title) title = 'Info';
            if (!message) message = 'New settings available on your account.';
        } else if (type === 'warning') {
            iconSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
            if (!title) title = 'Warning';
            if (!message) message = 'Please check your inputs.';
        }

        const toast = document.createElement('div');
        toast.className = `custom-ui-toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-left-bar"></div>
            <div class="toast-icon-wrapper">
                ${iconSvg}
            </div>
            <div class="toast-details">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message || ''}</div>
            </div>
            <button type="button" class="toast-close-btn" aria-label="Close notification">&times;</button>
        `;

        container.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('toast-show');
            });
        });

        let isDismissed = false;
        const dismissToast = () => {
            if (isDismissed) return;
            isDismissed = true;
            toast.classList.remove('toast-show');
            toast.classList.add('toast-hide');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 320);
        };

        const closeBtn = toast.querySelector('.toast-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dismissToast();
            });
        }

        const autoDismissTimer = setTimeout(dismissToast, 3500);

        toast.addEventListener('mouseenter', () => clearTimeout(autoDismissTimer));
        toast.addEventListener('mouseleave', () => {
            if (!isDismissed) {
                setTimeout(dismissToast, 2000);
            }
        });
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
        btnSave.addEventListener('click', async (e) => {
            e.preventDefault();
            await savePolicies();
        });
    }

    // Dynamic Header Offset for Sticky Actions Bar
    function syncHeaderHeight() {
        const header = document.querySelector('.top-header');
        if (header) {
            const height = header.offsetHeight;
            if (height > 0) {
                document.documentElement.style.setProperty('--top-header-height', `${height}px`);
            }
        }
    }

    window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('load', syncHeaderHeight);
    const headerElem = document.querySelector('.top-header');
    if (headerElem && window.ResizeObserver) {
        new ResizeObserver(syncHeaderHeight).observe(headerElem);
    }
    syncHeaderHeight();

    init();
})();
