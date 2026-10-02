(async function() {

    // ==========================================
    // 1. AUTH CHECK & INITIALIZATION
    // ==========================================
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    const adminId = session.user.id;
    let currentAdminSchoolId = null;
    let currentAdminSchool = null;
    let activeBeneficiaries = [];
    let currentFilteredBeneficiaries = [];
    let schoolScholarships = [];
    let masterlistMap = {}; 

    // Strictly Allowed Categories (Assistance Policies)
    const ALLOWED_CATEGORIES = [
        'Institution-Funded Educational Assistance',
        'Ched Educational Assistance',
        'Private Educational Assistance',
        'Government Educational Assistance'
    ];

    function showToast(type = 'success', title = '', message = '', duration = 4000) {
        if (window.showUIToast) {
            window.showUIToast(type, title, message, duration);
        } else if (window.showToast) {
            window.showToast(type, title, message, duration);
        } else {
            console.log(`[Toast ${type}] ${title}: ${message}`);
        }
    }

    // ==========================================
    // 2. HEADER PROFILE & DROPDOWN LOGIC
    // ==========================================
    async function initProfile() {
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
                currentAdminSchool = schoolName;

                const name = `${profile.first_name || 'Admin'} ${profile.last_name || ''}`.trim();
                if (document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
                if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

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

                await fetchMasterlistData();
                await fetchScholarshipList();
                await fetchActiveBeneficiaries();
            }
        } catch (err) {
            console.error("Error loading profile:", err);
        } finally {
            document.getElementById('header-titles-box')?.classList.remove('is-loading');
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        }
    }



    // ==========================================
    // 3. FETCH DATA (Masterlist & Programs)
    // ==========================================
    function isValidValue(val) {
        if (val === null || val === undefined) return false;
        const s = String(val).trim();
        if (!s) return false;
        const lower = s.toLowerCase();
        return lower !== 'n/a' && lower !== 'na' && lower !== 'null' && lower !== 'undefined' && lower !== 'none' && lower !== '-';
    }

    function findMasterlistStudent(app) {
        if (!app) return {};

        const profile = app.profiles || {};
        const candidateIds = [
            profile.id_number,
            app.id_number,
            app.student_id
        ];

        for (const rawId of candidateIds) {
            if (!rawId) continue;
            const strId = String(rawId).trim();
            if (!strId) continue;

            if (masterlistMap[strId]) return masterlistMap[strId];
            if (masterlistMap[strId.toLowerCase()]) return masterlistMap[strId.toLowerCase()];
            const stripped = strId.toLowerCase().replace(/[\s\-_]/g, '');
            if (masterlistMap[stripped]) return masterlistMap[stripped];
        }

        // Lookup by email
        const email = (profile.email || app.email || '').toString().trim().toLowerCase();
        if (email && masterlistMap[`email:${email}`]) {
            return masterlistMap[`email:${email}`];
        }

        // Lookup by name
        const lname = (profile.last_name || app.last_name || '').toString().trim().toLowerCase();
        const fname = (profile.first_name || app.first_name || '').toString().trim().toLowerCase();
        if (lname && fname && masterlistMap[`name:${lname}|${fname}`]) {
            return masterlistMap[`name:${lname}|${fname}`];
        }

        return {};
    }

    function resolveProgramAndYear(masterInfo, profile, app) {
        masterInfo = masterInfo || {};
        profile = profile || {};
        app = app || {};

        let program = 'N/A';
        if (isValidValue(masterInfo.program)) {
            program = String(masterInfo.program).trim();
        } else if (isValidValue(masterInfo.course)) {
            program = String(masterInfo.course).trim();
        } else if (isValidValue(profile.program)) {
            program = String(profile.program).trim();
        } else if (isValidValue(profile.course)) {
            program = String(profile.course).trim();
        } else if (isValidValue(app.program)) {
            program = String(app.program).trim();
        } else if (isValidValue(app.course)) {
            program = String(app.course).trim();
        }

        let yearLevel = 'N/A';
        if (isValidValue(masterInfo.year_level)) {
            yearLevel = String(masterInfo.year_level).trim();
        } else if (isValidValue(masterInfo.year)) {
            yearLevel = String(masterInfo.year).trim();
        } else if (isValidValue(profile.year_level)) {
            yearLevel = String(profile.year_level).trim();
        } else if (isValidValue(profile.year)) {
            yearLevel = String(profile.year).trim();
        } else if (isValidValue(app.year_level)) {
            yearLevel = String(app.year_level).trim();
        } else if (isValidValue(app.year)) {
            yearLevel = String(app.year).trim();
        }

        return { program, yearLevel };
    }

    function resolveStudentDisplayId(app, masterInfo) {
        const profile = app.profiles || {};
        masterInfo = masterInfo || {};

        if (isValidValue(profile.id_number)) return String(profile.id_number).trim();
        if (isValidValue(masterInfo.id_number)) return String(masterInfo.id_number).trim();
        if (isValidValue(app.id_number)) return String(app.id_number).trim();
        if (isValidValue(app.student_id)) return String(app.student_id).trim();
        return 'N/A';
    }

    function resolveStudentFullName(app, masterInfo) {
        const profile = app.profiles || {};
        masterInfo = masterInfo || {};

        const fname = profile.first_name || masterInfo.first_name || app.first_name || '';
        const lname = profile.last_name || masterInfo.last_name || app.last_name || '';
        const mnameRaw = profile.middle_name || masterInfo.middle_name || app.middle_name || '';
        const mname = mnameRaw ? ` ${mnameRaw.trim().charAt(0)}.` : '';

        if (fname || lname) {
            return `${lname.trim()}${lname && fname ? ', ' : ''}${fname.trim()}${mname}`.trim();
        }
        return profile.email || masterInfo.email || app.email || 'Student Record';
    }

    async function fetchMasterlistData() {
        try {
            masterlistMap = {};
            const PAGE_SIZE = 1000;
            let from = 0;
            let hasMore = true;
            let allMasterlist = [];

            if (currentAdminSchoolId) {
                while (hasMore) {
                    const { data, error } = await window.supabaseClient
                        .from('enrolled_masterlist')
                        .select('*')
                        .eq('school_id', currentAdminSchoolId)
                        .range(from, from + PAGE_SIZE - 1);

                    if (error) {
                        console.warn("Error querying masterlist for school:", error);
                        break;
                    }

                    if (data && data.length > 0) {
                        allMasterlist = allMasterlist.concat(data);
                        from += PAGE_SIZE;
                        hasMore = data.length === PAGE_SIZE;
                    } else {
                        hasMore = false;
                    }
                }
            }

            // Fallback / General fetch: If no records found with school filter, fetch all enrolled masterlist
            if (allMasterlist.length === 0) {
                from = 0;
                hasMore = true;
                while (hasMore) {
                    const { data, error } = await window.supabaseClient
                        .from('enrolled_masterlist')
                        .select('*')
                        .range(from, from + PAGE_SIZE - 1);

                    if (error) {
                        console.warn("Error querying enrolled_masterlist:", error);
                        break;
                    }

                    if (data && data.length > 0) {
                        allMasterlist = allMasterlist.concat(data);
                        from += PAGE_SIZE;
                        hasMore = data.length === PAGE_SIZE;
                    } else {
                        hasMore = false;
                    }
                }
            }

            allMasterlist.forEach(student => {
                if (!student) return;
                const rawId = student.id_number ? String(student.id_number) : '';
                const cleanId = rawId.trim();
                const lowerId = cleanId.toLowerCase();
                const strippedId = lowerId.replace(/[\s\-_]/g, '');

                if (rawId) masterlistMap[rawId] = student;
                if (cleanId) masterlistMap[cleanId] = student;
                if (lowerId) masterlistMap[lowerId] = student;
                if (strippedId) masterlistMap[strippedId] = student;

                if (student.email) {
                    const cleanEmail = String(student.email).trim().toLowerCase();
                    if (cleanEmail) masterlistMap[`email:${cleanEmail}`] = student;
                }

                const lname = (student.last_name || '').toString().trim().toLowerCase();
                const fname = (student.first_name || '').toString().trim().toLowerCase();
                if (lname && fname) {
                    masterlistMap[`name:${lname}|${fname}`] = student;
                }
            });
        } catch (err) { console.error("Error fetching masterlist:", err); }
    }

    function updateFilterDropdowns() {
        const filterSelect = document.getElementById('filter-scholarship');
        const batchFilter = document.getElementById('filter-batch');
        const semFilter = document.getElementById('filter-semester');
        const syFilter = document.getElementById('filter-school-year');

        const curSch = filterSelect ? filterSelect.value : '';
        const curBatch = batchFilter ? batchFilter.value : '';
        const curSem = semFilter ? semFilter.value : '';
        const curSy = syFilter ? syFilter.value : '';

        // 1. POPULATE EDUCATIONAL ASSISTANCE DROPDOWN
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">All Educational Assistance</option>';

            const internalList = [];
            if (schoolScholarships && schoolScholarships.length > 0) {
                schoolScholarships.forEach(sch => {
                    if (!internalList.some(s => s.id === sch.id)) {
                        internalList.push({ id: sch.id, title: sch.title });
                    }
                });
            }
            activeBeneficiaries.forEach(app => {
                if (app.scholarship_id && app.scholarships?.title) {
                    if (!internalList.some(s => s.id === app.scholarship_id)) {
                        internalList.push({ id: app.scholarship_id, title: app.scholarships.title });
                    }
                }
            });

            const outsideSet = new Set();
            activeBeneficiaries.forEach(app => {
                if (!app.scholarship_id && app.outside_assistance_name) {
                    const cleanName = app.outside_assistance_name.trim();
                    if (cleanName) outsideSet.add(cleanName);
                }
            });

            if (internalList.length > 0 && outsideSet.size > 0) {
                const intGroup = document.createElement('optgroup');
                intGroup.label = 'Internal Educational Assistance';
                internalList.forEach(sch => {
                    intGroup.appendChild(new Option(sch.title, `sch_${sch.id}`));
                });
                filterSelect.appendChild(intGroup);

                const outGroup = document.createElement('optgroup');
                outGroup.label = 'Outside Educational Assistance';
                Array.from(outsideSet).sort((a, b) => a.localeCompare(b)).forEach(name => {
                    outGroup.appendChild(new Option(name, `outside_${name}`));
                });
                filterSelect.appendChild(outGroup);
            } else {
                internalList.forEach(sch => {
                    filterSelect.add(new Option(sch.title, `sch_${sch.id}`));
                });
                Array.from(outsideSet).sort((a, b) => a.localeCompare(b)).forEach(name => {
                    filterSelect.add(new Option(`${name} (Outside Assistance)`, `outside_${name}`));
                });
            }

            if (curSch) {
                const hasOption = Array.from(filterSelect.options).some(o => o.value === curSch);
                if (hasOption) {
                    filterSelect.value = curSch;
                } else if (curSch.startsWith('sch_') || curSch.startsWith('outside_')) {
                    const raw = curSch.replace(/^sch_|^outside_/, '');
                    const matchOpt = Array.from(filterSelect.options).find(o => o.value.endsWith(raw));
                    if (matchOpt) filterSelect.value = matchOpt.value;
                }
            }
        }

        // 2. POPULATE SCHOOL YEAR DROPDOWN
        if (syFilter) {
            syFilter.innerHTML = '<option value="">All School Years</option>';
            const uniqueSYs = new Set();

            schoolScholarships.forEach(sch => {
                if (sch.school_year && isValidValue(sch.school_year)) uniqueSYs.add(String(sch.school_year).trim());
            });
            activeBeneficiaries.forEach(app => {
                const sy = app.outside_sy || app.scholarships?.school_year;
                if (sy && isValidValue(sy)) uniqueSYs.add(String(sy).trim());
            });

            Array.from(uniqueSYs).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).forEach(sy => {
                syFilter.add(new Option(sy, sy));
            });

            if (curSy && Array.from(syFilter.options).some(o => o.value === curSy)) {
                syFilter.value = curSy;
            }
        }

        // 3. POPULATE SEMESTER DROPDOWN
        if (semFilter) {
            semFilter.innerHTML = '<option value="">All Semesters</option>';
            const uniqueSems = new Set();

            schoolScholarships.forEach(sch => {
                if (sch.semester && isValidValue(sch.semester)) uniqueSems.add(String(sch.semester).trim());
            });
            activeBeneficiaries.forEach(app => {
                const sem = app.outside_semester || app.scholarships?.semester;
                if (sem && isValidValue(sem)) uniqueSems.add(String(sem).trim());
            });

            const semOrder = ['1st Semester', '2nd Semester', 'Summer', 'Midyear', '3rd Semester', 'Trimester 1', 'Trimester 2', 'Trimester 3'];
            const sortedSems = Array.from(uniqueSems).sort((a, b) => {
                const idxA = semOrder.indexOf(a);
                const idxB = semOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.localeCompare(b);
            });

            sortedSems.forEach(s => {
                semFilter.add(new Option(s, s));
            });

            if (curSem && Array.from(semFilter.options).some(o => o.value === curSem)) {
                semFilter.value = curSem;
            }
        }

        // 4. POPULATE BATCH DROPDOWN
        if (batchFilter) {
            batchFilter.innerHTML = '<option value="">All Batches</option>';
            const uniqueBatches = new Set();

            schoolScholarships.forEach(sch => {
                if (sch.batch && isValidValue(sch.batch)) uniqueBatches.add(String(sch.batch).trim());
            });
            activeBeneficiaries.forEach(app => {
                const batch = app.outside_batch || app.scholarships?.batch;
                if (batch && isValidValue(batch)) uniqueBatches.add(String(batch).trim());
            });

            Array.from(uniqueBatches).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(b => {
                batchFilter.add(new Option(b, b));
            });

            if (curBatch && Array.from(batchFilter.options).some(o => o.value === curBatch)) {
                batchFilter.value = curBatch;
            }
        }
    }

    async function fetchScholarshipList() {
        try {
            const { data } = await window.supabaseClient
                .from('scholarships')
                .select('id, title, category, batch, semester, school_year, start_date, end_date')
                .eq('school_id', currentAdminSchoolId)
                .neq('status', 'Draft');

            if (data) {
                schoolScholarships = data;
                const manualSelect = document.getElementById('manual-scholarship-select');
                if (manualSelect) {
                    manualSelect.innerHTML = '<option value="">-- No Internal Program (Outside Assistance) --</option>';
                    data.forEach(sch => {
                        manualSelect.add(new Option(`${sch.title} (${sch.category || 'Institution-Funded Educational Assistance'})`, sch.id));
                    });
                }
                updateFilterDropdowns();
            }
        } catch (err) { console.error(err); }
    }

    // ==========================================
    // 4. FETCH & RENDER ACTIVE BENEFICIARIES
    // ==========================================
    const tbody = document.getElementById('beneficiaries-tbody') || document.getElementById('scholars-tbody');

    // ---- Multi-select state ----
    let selectedIds = new Set();

    function updateBulkToolbar() {
        const bar = document.getElementById('bulk-action-bar');
        const countEl = document.getElementById('bulk-selected-count');
        const headerCb = document.getElementById('select-all-checkbox');
        if (!bar) return;
        const count = selectedIds.size;
        if (count > 0) {
            bar.classList.add('visible');
            if (countEl) countEl.textContent = `${count.toLocaleString()} beneficiar${count !== 1 ? 'ies' : 'y'} selected`;
        } else {
            bar.classList.remove('visible');
        }
        if (headerCb) {
            const allCbs = tbody ? [...tbody.querySelectorAll('.row-checkbox')] : [];
            const allChecked = allCbs.length > 0 && allCbs.every(cb => cb.checked);
            const someChecked = allCbs.some(cb => cb.checked);
            headerCb.checked = allChecked;
            headerCb.indeterminate = someChecked && !allChecked;
        }
    }

    async function fetchActiveBeneficiaries() {
        try {
            const { data: schData, error: schError } = await window.supabaseClient
                .from('scholarships')
                .select('id')
                .eq('school_id', currentAdminSchoolId);

            if (schError) throw schError;
            const schIds = schData ? schData.map(s => s.id) : [];

            // Paginate through applications to bypass Supabase 1000 limit
            const PAGE_SIZE = 1000;
            let allBeneficiaries = [];
            let from = 0;
            let hasMore = true;

            while (hasMore) {
                const { data: batch, error: appError } = await window.supabaseClient
                    .from('applications')
                    .select('*, profiles ( id, first_name, last_name, middle_name, id_number, email, school_id, program, year_level ), scholarships (id, title, category, school_id, batch, semester, school_year, start_date, end_date)')
                    .in('status', ['Grantee', 'Passed', 'Approved', 'grantee', 'passed', 'approved'])
                    .order('created_at', { ascending: false })
                    .range(from, from + PAGE_SIZE - 1);

                if (appError) throw appError;

                if (batch && batch.length > 0) {
                    allBeneficiaries = allBeneficiaries.concat(batch);
                    from += PAGE_SIZE;
                    hasMore = batch.length === PAGE_SIZE;
                } else {
                    hasMore = false;
                }
            }

            // If any application has missing profile object but student_id exists, fetch missing profiles
            const missingProfileIds = allBeneficiaries
                .filter(app => !app.profiles && app.student_id)
                .map(app => app.student_id);

            if (missingProfileIds.length > 0) {
                const uniqueMissing = [...new Set(missingProfileIds)];
                const { data: fetchedProfiles } = await window.supabaseClient
                    .from('profiles')
                    .select('id, first_name, last_name, middle_name, id_number, email, school_id, program, year_level')
                    .in('id', uniqueMissing);

                if (fetchedProfiles && fetchedProfiles.length > 0) {
                    const pMap = {};
                    fetchedProfiles.forEach(p => { pMap[p.id] = p; });
                    allBeneficiaries.forEach(app => {
                        if (!app.profiles && app.student_id && pMap[app.student_id]) {
                            app.profiles = pMap[app.student_id];
                        }
                    });
                }
            }

            activeBeneficiaries = allBeneficiaries.filter(app => {
                if (app.scholarship_id) {
                    return schIds.includes(app.scholarship_id);
                }
                if (currentAdminSchoolId && app.profiles?.school_id) {
                    return app.profiles.school_id === currentAdminSchoolId;
                }
                const masterInfo = findMasterlistStudent(app);
                if (currentAdminSchoolId && masterInfo.school_id) {
                    return masterInfo.school_id === currentAdminSchoolId;
                }
                return true;
            });

            if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = activeBeneficiaries.length.toLocaleString();
            updateFilterDropdowns();
            applyFilters();
        } catch (err) {
            console.error("Error fetching active beneficiaries:", err);
            if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#ef4444; padding:40px;">Failed to load data. Please check the console.</td></tr>`;
        }
    }

    function escapeHtml(str) {
        if (!str || typeof str !== 'string') return str || '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getCategoryBadge(category) {
        if (!category) return `<span class="category-badge-pill cat-badge-outside">Outside Assistance</span>`;
        const catLower = category.toLowerCase();
        let cls = 'cat-badge-inst';
        let label = 'Institution-Funded';

        if (catLower.includes('ched')) {
            cls = 'cat-badge-ched';
            label = 'CHED Assistance';
        } else if (catLower.includes('priv')) {
            cls = 'cat-badge-priv';
            label = 'Private Assistance';
        } else if (catLower.includes('gov')) {
            cls = 'cat-badge-gov';
            label = "Gov't Assistance";
        } else if (catLower.includes('inst')) {
            cls = 'cat-badge-inst';
            label = 'Institution-Funded';
        } else if (catLower.includes('outside')) {
            cls = 'cat-badge-outside';
            label = 'Outside Assistance';
        } else {
            label = category.replace(/\s+Educational\s+Assistance/gi, '').replace(/\s+Scholarship/gi, '').trim() || category;
        }
        return `<span class="category-badge-pill ${cls}" title="${escapeHtml(category)}">${escapeHtml(label)}</span>`;
    }

    function formatDate(dateString) {
        if (!dateString) return 'Not Set';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function renderTable(data) {
        if (document.getElementById('entries-info')) document.getElementById('entries-info').innerText = `Showing ${data.length} active beneficiaries`;
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:40px;">No active beneficiaries found matching criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.forEach(app => {
            const tr = document.createElement('tr');

            const masterInfo = findMasterlistStudent(app);
            const studentId = resolveStudentDisplayId(app, masterInfo);
            const fullName = resolveStudentFullName(app, masterInfo);
            const { program, yearLevel } = resolveProgramAndYear(masterInfo, app.profiles, app);

            const isOutside = !app.scholarship_id;
            const schTitle = isOutside ? (app.outside_assistance_name || 'Outside Assistance') : (app.scholarships?.title || 'Unknown Assistance');
            const categoryValue = app.category || app.scholarships?.category || 'Outside Assistance';
            const catBadge = getCategoryBadge(categoryValue);

            const batch = app.outside_batch || app.scholarships?.batch || '';
            const semester = app.outside_semester || app.scholarships?.semester || '';
            const schoolYear = app.outside_sy || app.scholarships?.school_year || '';
            const duration = app.duration || 'Not Set';
            const dateAdded = formatDate(app.created_at);
            
            const termDetails = [];
            if (batch) termDetails.push(`<div><span style="color:var(--text-muted);">Batch:</span> ${escapeHtml(String(batch))}</div>`);
            if (semester) termDetails.push(`<div><span style="color:var(--text-muted);">Sem:</span> ${escapeHtml(String(semester))}</div>`);
            if (schoolYear) termDetails.push(`<div><span style="color:var(--text-muted);">SY:</span> ${escapeHtml(String(schoolYear))}</div>`);
            const detailsHtml = termDetails.length > 0 ? termDetails.join('') : '<span style="color:var(--text-muted);">-</span>';

            const email = app.profiles?.email || masterInfo.email || '';
            const emailHtml = email ? `<div style="font-size:11px; color:var(--text-muted); margin-top:3px; word-break:break-all;">${escapeHtml(email)}</div>` : '';

            tr.innerHTML = `
                <td style="text-align:center; vertical-align:middle;">
                    <input type="checkbox" class="row-checkbox" data-id="${app.id}" ${selectedIds.has(app.id) ? 'checked' : ''}>
                </td>
                <td>
                    <strong style="color:var(--text-heading); font-size:13px; display:block;">${escapeHtml(studentId)}</strong>
                    ${emailHtml}
                </td>
                <td style="font-weight: 600; color:var(--text-heading); line-height:1.35;">${escapeHtml(fullName)}</td>
                <td>
                    <div style="color:var(--text-main); font-weight:600; font-size:12.5px; line-height:1.35;">${escapeHtml(program)}</div>
                    <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">${escapeHtml(yearLevel)}</div>
                </td>
                <td>
                    <strong style="color:var(--primary-color); display:block; margin-bottom:4px; font-size:13px; line-height:1.3;">${escapeHtml(schTitle)}</strong>
                    ${catBadge}
                </td>
                <td style="font-size:12px; line-height:1.4; color:var(--text-main);">
                    <div>${detailsHtml}</div>
                </td>
                <td style="font-size:12.5px; color:var(--text-muted); font-weight:500; white-space:nowrap;">
                    ${dateAdded}
                </td>
                <td>
                    <span style="font-weight:600; font-size:12.5px; color:var(--text-main); white-space:nowrap;">${escapeHtml(duration)}</span>
                </td>
                <td style="text-align: center; padding-right:14px; white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; justify-content: center;">
                        <button class="btn-table-edit" title="Edit Assistance Details" onclick="openEditDetailsModal('${app.id}')">
                            <i data-lucide="pencil" style="width:15px; height:15px;"></i>
                        </button>
                        <button class="btn-table-revoke" title="Revoke Assistance" onclick="revokeAssistance('${app.id}')">
                            <i data-lucide="trash-2" style="width:15px; height:15px;"></i>
                        </button>
                    </div>
                </td>
            `;

            if (selectedIds.has(app.id)) tr.classList.add('row-selected');

            // Wire checkbox
            const cb = tr.querySelector('.row-checkbox');
            cb.addEventListener('change', () => {
                if (cb.checked) { selectedIds.add(app.id); tr.classList.add('row-selected'); }
                else { selectedIds.delete(app.id); tr.classList.remove('row-selected'); }
                updateBulkToolbar();
            });

            tbody.appendChild(tr);
        });

        updateBulkToolbar();
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    // ---- Select All ----
    const selectAllCb = document.getElementById('select-all-checkbox');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', () => {
            const allCbs = tbody ? tbody.querySelectorAll('.row-checkbox') : [];
            allCbs.forEach(cb => {
                const id = cb.dataset.id;
                cb.checked = selectAllCb.checked;
                const row = cb.closest('tr');
                if (selectAllCb.checked) { selectedIds.add(id); if (row) row.classList.add('row-selected'); }
                else { selectedIds.delete(id); if (row) row.classList.remove('row-selected'); }
            });
            updateBulkToolbar();
        });
    }

    // ---- Clear Selection ----
    const btnClearSelection = document.getElementById('btn-clear-selection');
    if (btnClearSelection) {
        btnClearSelection.addEventListener('click', () => {
            selectedIds.clear();
            const allCbs = tbody ? tbody.querySelectorAll('.row-checkbox') : [];
            allCbs.forEach(cb => { cb.checked = false; const row = cb.closest('tr'); if (row) row.classList.remove('row-selected'); });
            if (selectAllCb) { selectAllCb.checked = false; selectAllCb.indeterminate = false; }
            updateBulkToolbar();
        });
    }

    // ---- Bulk Revoke ----
    const btnBulkRevoke = document.getElementById('btn-bulk-revoke');
    if (btnBulkRevoke) {
        btnBulkRevoke.addEventListener('click', async () => {
            if (selectedIds.size === 0) return;
            const count = selectedIds.size;
            const result = await Swal.fire({
                title: `Revoke ${count.toLocaleString()} Beneficiar${count !== 1 ? 'ies' : 'y'}?`,
                html: `You are about to <strong>revoke educational assistance</strong> for <strong>${count.toLocaleString()} beneficiar${count !== 1 ? 'ies' : 'y'}</strong>.<br><br><span style="color:#64748b;font-size:13px;">They will be removed from the active beneficiary list and policy counts will update.</span>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#94a3b8',
                confirmButtonText: `Yes, Revoke ${count.toLocaleString()}`,
                cancelButtonText: 'Cancel'
            });

            if (!result.isConfirmed) return;

            Swal.fire({ title: 'Revoking...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            try {
                const idsToRevoke = [...selectedIds];
                for (const id of idsToRevoke) {
                    const targetApp = activeBeneficiaries.find(a => a.id === id);
                    if (targetApp && targetApp.student_id && targetApp.scholarship_id) {
                        await window.supabaseClient
                            .from('applications')
                            .update({ status: 'Revoked', remarks: 'Assistance Revoked by Administrator (Bulk Action)' })
                            .eq('student_id', targetApp.student_id)
                            .eq('scholarship_id', targetApp.scholarship_id);
                    } else if (targetApp && targetApp.student_id && targetApp.outside_assistance_name) {
                        await window.supabaseClient
                            .from('applications')
                            .update({ status: 'Revoked', remarks: 'Assistance Revoked by Administrator (Bulk Action)' })
                            .eq('student_id', targetApp.student_id)
                            .is('scholarship_id', null)
                            .eq('outside_assistance_name', targetApp.outside_assistance_name);
                    } else {
                        await window.supabaseClient
                            .from('applications')
                            .update({ status: 'Revoked', remarks: 'Assistance Revoked by Administrator (Bulk Action)' })
                            .eq('id', id);
                    }
                }

                selectedIds.clear();
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('success', 'Revoked!', `${count.toLocaleString()} beneficiar${count !== 1 ? 'ies have' : 'y has'} been revoked.`);
                fetchActiveBeneficiaries();
            } catch (err) {
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('error', 'Revoke Failed', 'Bulk revoke failed: ' + err.message);
            }
        });
    }

    window.editDuration = async (appId, currentDuration) => {
        const { value: newDuration } = await Swal.fire({
            title: 'Set Assistance Duration',
            input: 'select',
            inputOptions: {
                '1 Semester': '1 Semester',
                '2 Semesters (1 Year)': '2 Semesters (1 Year)',
                '3 Semesters (1.5 Years)': '3 Semesters (1.5 Years)',
                '4 Semesters (2 Years)': '4 Semesters (2 Years)',
                '5 Semesters (2.5 Years)': '5 Semesters (2.5 Years)',
                '6 Semesters (3 Years)': '6 Semesters (3 Years)',
                '7 Semesters (3.5 Years)': '7 Semesters (3.5 Years)',
                '8 Semesters (4 Years)': '8 Semesters (4 Years)',
                'Until Graduation': 'Until Graduation'
            },
            inputPlaceholder: 'Select a standard duration',
            inputValue: currentDuration !== 'Not Set' ? currentDuration : '',
            showCancelButton: true,
            confirmButtonColor: '#10b981'
        });

        if (newDuration) {
            Swal.fire({ title: 'Updating...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            try {
                const { error } = await window.supabaseClient.from('applications').update({ duration: newDuration }).eq('id', appId);
                if (error) throw error;
                
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('success', 'Saved!', 'The duration has been successfully updated.');
                fetchActiveBeneficiaries();
            } catch (err) { 
                console.error("Database Error on Update Duration:", err);
                const errorText = err.message || 'Unknown Database Restriction';
                
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('error', 'Failed to Update Duration', errorText);
            }
        }
    };

    window.revokeAssistance = async (appId) => {
        const result = await Swal.fire({
            title: 'Revoke Assistance?',
            text: "Are you sure you want to revoke this beneficiary's educational assistance? They will immediately be removed from the active limits tracked by the institutional policies.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Yes, Revoke'
        });

        if (result.isConfirmed) {
            try {
                Swal.fire({ title: 'Processing...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                
                const targetApp = activeBeneficiaries.find(a => a.id === appId);
                
                // Update target application and any duplicate records for the same student + program
                let updatePromise;
                if (targetApp && targetApp.student_id && targetApp.scholarship_id) {
                    updatePromise = window.supabaseClient
                        .from('applications')
                        .update({ status: 'Revoked', remarks: 'Assistance Revoked by Administrator' })
                        .eq('student_id', targetApp.student_id)
                        .eq('scholarship_id', targetApp.scholarship_id);
                } else if (targetApp && targetApp.student_id && targetApp.outside_assistance_name) {
                    updatePromise = window.supabaseClient
                        .from('applications')
                        .update({ status: 'Revoked', remarks: 'Assistance Revoked by Administrator' })
                        .eq('student_id', targetApp.student_id)
                        .is('scholarship_id', null)
                        .eq('outside_assistance_name', targetApp.outside_assistance_name);
                } else {
                    updatePromise = window.supabaseClient
                        .from('applications')
                        .update({ status: 'Revoked', remarks: 'Assistance Revoked by Administrator' })
                        .eq('id', appId);
                }

                const { error } = await updatePromise;
                if (error) throw error;
                
                // Notify coordinators of the status change
                const app = activeBeneficiaries.find(a => a.id === appId);
                if (app && currentAdminSchoolId) {
                    const studentName = app.profiles ? `${app.profiles.first_name || ''} ${app.profiles.last_name || ''}`.trim() : 'A student';
                    await fetch('https://grantee-backend-n5f4.onrender.com/api/notify-coordinators', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolId: currentAdminSchoolId,
                            eventType: 'BENEFICIARY_UPDATE',
                            subject: 'Beneficiary Status Changed',
                            message: `Beneficiary status revoked for ${studentName}.`,
                            resourceId: appId
                        })
                    }).catch(e => console.error("Notification failed:", e));
                }

                await window.supabaseClient.from('audit_logs').insert([{
                    admin_id: adminId,
                    school_id: currentAdminSchoolId,
                    action: 'Revoked Assistance',
                    module: 'Active Beneficiaries',
                    details: JSON.stringify({ details: `Revoked active assistance for application ID: ${appId}` })
                }]);

                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('success', 'Revoked', 'The assistance has been revoked and policy counts have been updated.');
                fetchActiveBeneficiaries();
            } catch (err) { 
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('error', 'Revoke Failed', 'Failed to revoke assistance.'); 
            }
        }
    };

    function applyFilters() {
        const term = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        const schFilterVal = document.getElementById('filter-scholarship')?.value || '';
        const batch = (document.getElementById('filter-batch')?.value || '').toLowerCase().trim();
        const sem = (document.getElementById('filter-semester')?.value || '').toLowerCase().trim();
        const sy = (document.getElementById('filter-school-year')?.value || '').toLowerCase().trim();

        const filtered = activeBeneficiaries.filter(app => {
            const masterInfo = findMasterlistStudent(app);
            const studentId = resolveStudentDisplayId(app, masterInfo).toLowerCase();
            const fullName = resolveStudentFullName(app, masterInfo).toLowerCase();
            const fname = (app.profiles?.first_name || masterInfo.first_name || '').toLowerCase();
            const lname = (app.profiles?.last_name || masterInfo.last_name || '').toLowerCase();
            const email = (app.profiles?.email || masterInfo.email || '').toLowerCase();
            const schTitle = (app.scholarship_id ? (app.scholarships?.title || '') : (app.outside_assistance_name || 'Outside Assistance')).toLowerCase();
            const categoryVal = (app.category || app.scholarships?.category || '').toLowerCase();
            const { program: progVal, yearLevel: yrVal } = resolveProgramAndYear(masterInfo, app.profiles, app);
            const prog = progVal.toLowerCase();
            const yr = yrVal.toLowerCase();

            const matchSearch = term === '' ||
                studentId.includes(term) ||
                fname.includes(term) ||
                lname.includes(term) ||
                fullName.includes(term) ||
                email.includes(term) ||
                schTitle.includes(term) ||
                categoryVal.includes(term) ||
                prog.includes(term) ||
                yr.includes(term);

            // Educational Assistance Filter
            let matchSch = true;
            if (schFilterVal !== '') {
                if (schFilterVal.startsWith('outside_')) {
                    const targetOutside = schFilterVal.replace('outside_', '').toLowerCase().trim();
                    const appOutside = (app.outside_assistance_name || '').toLowerCase().trim();
                    matchSch = !app.scholarship_id && appOutside === targetOutside;
                } else if (schFilterVal.startsWith('sch_')) {
                    const targetSchId = schFilterVal.replace('sch_', '');
                    matchSch = String(app.scholarship_id) === String(targetSchId);
                } else {
                    matchSch = String(app.scholarship_id) === String(schFilterVal) ||
                        (!app.scholarship_id && (app.outside_assistance_name || '').toLowerCase().trim() === schFilterVal.toLowerCase().trim());
                }
            }

            const appBatch = (app.outside_batch || app.scholarships?.batch || '').toLowerCase().trim();
            const appSem = (app.outside_semester || app.scholarships?.semester || '').toLowerCase().trim();
            const appSy = (app.outside_sy || app.scholarships?.school_year || '').toLowerCase().trim();

            const matchBatch = batch === "" || appBatch === batch;
            const matchSem = sem === "" || appSem === sem;
            const matchSy = sy === "" || appSy === sy;

            return matchSearch && matchSch && matchBatch && matchSem && matchSy;
        });

        currentFilteredBeneficiaries = filtered;
        renderTable(filtered);
    }

    if (document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if (document.getElementById('filter-scholarship')) document.getElementById('filter-scholarship').addEventListener('change', applyFilters);
    if (document.getElementById('filter-batch')) document.getElementById('filter-batch').addEventListener('change', applyFilters);
    if (document.getElementById('filter-semester')) document.getElementById('filter-semester').addEventListener('change', applyFilters);
    if (document.getElementById('filter-school-year')) document.getElementById('filter-school-year').addEventListener('change', applyFilters);


    // ==========================================
    // POLICY VALIDATION ENGINE
    // ==========================================
    function validateAgainstPolicies(newCategory, activeList, policyData, idNumber) {
        if (!policyData) return true; 

        // Deduplicate activeList by unique program
        const uniqueActiveList = [];
        const seenKeys = new Set();
        for (const item of (activeList || [])) {
            const key = item.scholarship_id 
                ? `sch_${item.scholarship_id}` 
                : (item.outside_assistance_name ? `out_${item.outside_assistance_name.toLowerCase().trim()}` : (item.id || Math.random()));
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueActiveList.push(item);
            }
        }

        // 1. GLOBAL LIMIT CHECK
        if (policyData.global_enabled && policyData.global_limit > 0) {
            if (uniqueActiveList.length >= policyData.global_limit) {
                throw new Error(`PolicyLimitReached: Student [${idNumber}] reached global maximum limit of ${policyData.global_limit} active program(s).`);
            }
        }

        // 2. CATEGORY LIMIT CHECK
        if (policyData.category_limits && policyData.category_limits[newCategory]) {
            const catPolicy = policyData.category_limits[newCategory];
            if (!catPolicy.unlimited) {
                if (catPolicy.limit === 0) {
                     throw new Error(`CategoryLimitReached: Institution has completely disabled/blocked ${newCategory}.`);
                }
                const sameCatCount = uniqueActiveList.filter(app => (app.category || '').toLowerCase() === newCategory.toLowerCase()).length;
                if (sameCatCount >= catPolicy.limit) {
                    throw new Error(`CategoryLimitReached: Student [${idNumber}] exceeded maximum limit of ${catPolicy.limit} for ${newCategory}.`);
                }
            }
        }

        // 3. COMBINATION MATRIX RULES CHECK
        if (policyData.combination_rules) {
            for (let existing of uniqueActiveList) {
                const existingCat = existing.category || '';
                if (existingCat && existingCat.toLowerCase() !== newCategory.toLowerCase()) {
                    const comboKey = `${newCategory}::${existingCat}`;
                    const comboKeyReverse = `${existingCat}::${newCategory}`;
                    if (policyData.combination_rules[comboKey] === false || policyData.combination_rules[comboKeyReverse] === false) {
                        throw new Error(`CombinationRuleViolation: Policy forbids combining [${newCategory}] with their existing [${existingCat}].`);
                    }
                }
            }
        }

        return true;
    }


    // ==========================================
    // 6. IMPORT EXCEL / CSV BULK UPLOAD WITH VALIDATION
    // ==========================================
    const importModal = document.getElementById('import-modal');
    const importInput = document.getElementById('import-file-input');
    const importStatus = document.getElementById('import-status');

    if (document.getElementById('btn-open-import')) {
        document.getElementById('btn-open-import').addEventListener('click', () => {
            if (importInput) importInput.value = '';
            if (importStatus) importStatus.innerHTML = '';
            if (importModal) importModal.style.display = 'flex';
        });
    }

    window.downloadTemplate = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Student ID,Last Name,First Name,Middle Name,Educational Assistance Name,Educational Assistance Category,School Year (Optional),Semester (Optional),Batch (Optional),Duration (Optional)\r\n";
        csvContent += "20230001,Doe,John,Smith,Ched Scholarship,Ched Educational Assistance,2024-2025,1st Semester,Batch 1,1 Year\r\n";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "Import_Beneficiaries_Template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    function suggestCategory(schName) {
        if (!schName) return '';
        const name = schName.toLowerCase();
        if (name.includes('sm foundation') || name.includes('private') || name.includes('ngo') || name.includes('foundation')) return 'Private Educational Assistance';
        if (name.includes('dost') || name.includes('government') || name.includes('lgu') || name.includes('mayor')) return 'Government Educational Assistance';
        if (name.includes('ched') || name.includes('unifast') || name.includes('tulong dunong') || name.includes('merit')) return 'Ched Educational Assistance';
        if (name.includes('university') || name.includes('academic') || name.includes('entrance') || name.includes('institutional') || name.includes('school')) return 'Institution-Funded Educational Assistance';
        return '';
    }

    if (importInput) {
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
                showToast('error', 'Invalid File', 'Only CSV and Excel (.xlsx, .xls) files are supported.');
                importInput.value = '';
                return;
            }

            importStatus.innerHTML = `<span style="color:var(--primary-color); display:flex; align-items:center; gap:8px;"><i data-lucide="loader" style="width:16px;height:16px;animation:spin 1s linear infinite;"></i> Reading & Validating file: ${file.name}...</span>`;
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

            try {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) throw new Error("The uploaded file is empty.");

                let validRecords = [];
                let invalidRecords = [];
                let unenrolledSkipped = [];
                let crosscheckData = []; 

                jsonData.forEach((row, index) => {
                    const rowNum = index + 2; 
                    const sid = row['Student ID'] || row['ID'] || row['ID Number'];
                    const assistance = row['Educational Assistance Name'] || row['Educational Assistance'];
                    const providedCategory = (row['Educational Assistance Category'] || row['Category'] || '').toString().trim();

                    if (sid && assistance) {
                        const sidStr = sid.toString().trim();
                        const studentName = `${row['Last Name'] || ''}, ${row['First Name'] || ''}`.replace(/^,\s*/, '').trim() || 'Unknown';
                        
                        const record = {
                            rowNum,
                            id_number: sidStr,
                            student_name: studentName,
                            assistance_name: assistance.toString().trim(),
                            category_input: providedCategory,
                            sy: row['School Year (Optional)'] || null,
                            sem: row['Semester (Optional)'] || null,
                            batch: row['Batch (Optional)'] || null,
                            duration: row['Duration (Optional)'] || null
                        };

                        const masterMatch = masterlistMap[sidStr] || masterlistMap[sidStr.toLowerCase()] || masterlistMap[sidStr.toLowerCase().replace(/[\s\-_]/g, '')];
                        const isEnrolledInSchool = masterMatch && (!currentAdminSchoolId || !masterMatch.school_id || String(masterMatch.school_id) === String(currentAdminSchoolId));

                        if (!isEnrolledInSchool) {
                            unenrolledSkipped.push(record);
                            crosscheckData.push({ ...record, renderStatus: 'unenrolled' });
                            return; 
                        }

                        const matchedCat = ALLOWED_CATEGORIES.find(cat => cat.toLowerCase() === providedCategory.toLowerCase());

                        if (matchedCat) {
                            record.category = matchedCat; 
                            validRecords.push(record);
                            crosscheckData.push({ ...record, renderStatus: 'valid' });
                        } else {
                            const suggestedCat = suggestCategory(record.assistance_name);
                            record.suggested = suggestedCat;
                            record.selected = suggestedCat || ''; 
                            invalidRecords.push(record);
                            crosscheckData.push({ ...record, renderStatus: 'invalid', invalidIdx: invalidRecords.length - 1 });
                        }
                    }
                });

                if (crosscheckData.length === 0) {
                    throw new Error("No recognizable records found. Please ensure your headers match the template.");
                }

                const hasImportableRecords = validRecords.length > 0 || invalidRecords.length > 0;
                const allSkipped = !hasImportableRecords && unenrolledSkipped.length > 0;

                // ALWAYS SHOW THE CROSSCHECKING VIEW
                let html = `
                    <div style="background:var(--card-bg, #fff); border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:15px; margin-top:15px; text-align:left;">
                        <h4 style="margin-top:0; color:var(--text-heading, #0f172a); margin-bottom:10px;">Import Crosschecking View</h4>
                        <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap: wrap;">
                            <div style="font-size:13px;"><strong>Ready to Import:</strong> <span style="color:#10b981;">${validRecords.length}</span></div>
                            <div style="font-size:13px;"><strong>Needs Review:</strong> <span style="color:#f59e0b;">${invalidRecords.length}</span></div>
                            <div style="font-size:13px;"><strong>Failed (Not in School Masterlist):</strong> <span style="color:#ef4444;">${unenrolledSkipped.length}</span></div>
                        </div>
                `;

                if (allSkipped) {
                    html += `
                        <div style="background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; padding:12px; border-radius:6px; font-size:13px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                            <i data-lucide="ban" style="width:18px; height:18px; flex-shrink:0;"></i>
                            <span><strong>Import Disabled:</strong> All records in this file were skipped because none were found in the official Enrolled Masterlist for this school. No records can be imported.</span>
                        </div>
                    `;
                } else if (invalidRecords.length > 0) {
                    html += `
                        <div style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:10px; border-radius:6px; font-size:13px; margin-bottom:15px; display:flex; align-items:center; gap:8px;">
                            <i data-lucide="alert-circle" style="width:16px; height:16px; flex-shrink:0;"></i>
                            <span><strong>Attention:</strong> Some records contain non-standard educational assistance categories. You can review or adjust them below before confirming import.</span>
                        </div>
                    `;
                }

                html += `
                        <div style="overflow-x:auto; margin-bottom:15px; max-height: 400px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                                <thead style="background:var(--table-header-bg, #f8fafc); position: sticky; top: 0; z-index: 1; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                                    <tr>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Row</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Student ID</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Name</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Assistance Program</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Original CSV Category</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Final Assessed Category</th>
                                        <th style="padding:10px 8px; border-bottom:1px solid var(--border-color, #e2e8f0);">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                crosscheckData.forEach((row) => {
                    let finalCatHtml = '';
                    let statusHtml = '';
                    
                    if (row.renderStatus === 'valid') {
                        finalCatHtml = `<span style="color:var(--text-main, #334155); font-weight:500;">${row.category}</span>`;
                        statusHtml = `<span style="color:#10b981; font-weight:bold; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="check" style="width:13px; height:13px;"></i> Ready</span>`;
                    } 
                    else if (row.renderStatus === 'invalid') {
                        let options = `<option value="">-- Select Valid Category --</option>`;
                        ALLOWED_CATEGORIES.forEach(cat => { 
                            const isSelected = (row.selected === cat) ? 'selected' : '';
                            options += `<option value="${cat}" ${isSelected}>${cat}</option>`; 
                        });
                        
                        const borderCol = row.selected ? '#10b981' : '#ef4444';
                        finalCatHtml = `
                            ${row.suggested ? `<div style="font-size:11px; color:#10b981; margin-bottom:4px;">Suggested: ${row.suggested}</div>` : ''}
                            <select class="category-correction-select" data-index="${row.invalidIdx}" style="width:100%; padding:4px; border-radius:4px; border:1px solid ${borderCol}; background:var(--input-bg, #fff); color:var(--text-main, #0f172a);">
                                ${options}
                            </select>
                        `;
                        if (row.selected) {
                            statusHtml = `<span id="status-row-${row.invalidIdx}" style="color:#10b981; font-weight:bold; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="check" style="width:13px; height:13px;"></i> Ready</span>`;
                        } else {
                            statusHtml = `<span id="status-row-${row.invalidIdx}" style="color:#f59e0b; font-weight:bold;">Needs Review</span>`;
                        }
                    }
                    else if (row.renderStatus === 'unenrolled') {
                        finalCatHtml = `<span style="color:var(--text-muted, #94a3b8); font-style:italic;">Not In School Masterlist</span>`;
                        statusHtml = `<span style="color:#ef4444; font-weight:bold; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="x" style="width:13px; height:13px;"></i> Skipped</span>`;
                    }

                    html += `
                        <tr style="border-bottom:1px solid var(--border-color, #f1f5f9); ${row.renderStatus === 'unenrolled' ? 'background:rgba(239, 68, 68, 0.08);' : ''}">
                            <td style="padding:8px;">${row.rowNum}</td>
                            <td style="padding:8px; font-weight:600;">${row.id_number}</td>
                            <td style="padding:8px; white-space:nowrap;">${row.student_name}</td>
                            <td style="padding:8px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${row.assistance_name}">${row.assistance_name}</td>
                            <td style="padding:8px; color:var(--text-muted, #64748b);">${row.category_input || '<i>Blank</i>'}</td>
                            <td style="padding:8px;">${finalCatHtml}</td>
                            <td style="padding:8px;">${statusHtml}</td>
                        </tr>
                    `;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                `;

                if (unenrolledSkipped.length > 0) {
                    const schoolLabel = currentAdminSchool ? `<strong>${escapeHtml(currentAdminSchool)}</strong>` : 'this specific school';
                    html += `
                        <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); border-radius:6px; padding:12px; margin-bottom:15px;">
                            <h5 style="margin:0 0 8px 0; color:#ef4444; display:flex; align-items:center; gap:6px;">
                                <i data-lucide="alert-triangle" style="width:15px; height:15px;"></i> Skipped (Not in School Masterlist) Details
                            </h5>
                            <p style="margin:0 0 8px 0; font-size:12px; color:var(--text-main, #b91c1c);">The following students were found in the file but do not exist in the official Enrolled Masterlist for ${schoolLabel}. They will be skipped during import.</p>
                            <ul style="margin:0; padding-left:22px; font-size:12px; color:#ef4444; max-height:120px; overflow-y:auto; line-height: 1.6;">
                    `;
                    unenrolledSkipped.forEach(u => {
                        html += `<li><strong>${u.id_number}</strong> - ${u.student_name}</li>`;
                    });
                    html += `</ul></div>`;
                }

                const disabledAttr = allSkipped ? 'disabled' : '';
                const cursorStyle = allSkipped ? 'cursor:not-allowed; opacity:0.5;' : 'cursor:pointer; opacity:1;';
                const buttonTitle = allSkipped ? 'title="Cannot import: All records are skipped because they do not exist in the school masterlist."' : '';
                
                html += `
                        <div style="text-align:right; margin-top: 20px;">
                            <button id="btn-confirm-import" ${disabledAttr} ${buttonTitle} style="background:var(--primary-color); color:#ffffff; border:none; padding:10px 20px; border-radius:6px; font-weight:600; transition:0.2s; ${cursorStyle}">
                                Confirm & Import Records
                            </button>
                        </div>
                    </div>
                `;
                
                importStatus.innerHTML = html;
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    lucide.createIcons();
                }
                
                const confirmBtn = document.getElementById('btn-confirm-import');
                if (confirmBtn) {
                    if (allSkipped) {
                        confirmBtn.disabled = true;
                        confirmBtn.style.cursor = 'not-allowed';
                        confirmBtn.style.opacity = '0.5';
                        confirmBtn.style.pointerEvents = 'none';
                        confirmBtn.onclick = null;
                    } else {
                        confirmBtn.disabled = false;
                        confirmBtn.style.cursor = 'pointer';
                        confirmBtn.style.opacity = '1';
                        confirmBtn.style.pointerEvents = 'auto';
                        confirmBtn.onclick = () => {
                            const unmapped = invalidRecords.filter(r => !r.selected);
                            if (unmapped.length > 0) {
                                showToast('warning', 'Category Selection Required', `Please select a valid Educational Assistance Category for all ${unmapped.length} record(s) needing review before importing.`);
                                document.querySelectorAll('.category-correction-select').forEach(sel => {
                                    const idx = sel.getAttribute('data-index');
                                    if (!invalidRecords[idx].selected) {
                                        sel.style.borderColor = '#ef4444';
                                        sel.focus();
                                    }
                                });
                                return;
                            }
                            executeFinalImport(validRecords, invalidRecords, unenrolledSkipped.map(u => u.id_number));
                        };
                    }
                }
                
                const selects = document.querySelectorAll('.category-correction-select');
                selects.forEach(sel => {
                    sel.addEventListener('change', (e) => {
                        const idx = e.target.getAttribute('data-index');
                        const val = e.target.value;
                        invalidRecords[idx].selected = val;
                        
                        const statusTd = document.getElementById(`status-row-${idx}`);
                        if(val) {
                            statusTd.innerHTML = `<span style="color:#10b981; font-weight:bold; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="check" style="width:13px; height:13px;"></i> Ready</span>`;
                            e.target.style.borderColor = '#10b981';
                        } else {
                            statusTd.innerHTML = `<span style="color:#f59e0b; font-weight:bold;">Needs Review</span>`;
                            e.target.style.borderColor = '#ef4444';
                        }
                        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
                    });
                });

            } catch (err) {
                console.error("Import Error:", err);
                showToast('error', 'Import Failed', err.message || 'An unexpected parsing issue occurred.');
                importStatus.innerHTML = '';
            }
        });
    }

    // ==========================================================
    // BULK IMPORT EXECUTION WITH STRICT POLICY CHECKING
    // ==========================================================
    async function executeFinalImport(valid, correctedInvalid, skippedIds) {
        Swal.fire({
            title: 'Processing Records...',
            text: 'Importing valid beneficiaries and verifying strict institutional policy tracking...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });
        
        try {
            // Fetch strict policies directly from the database configuration
            let policyConfig = null;
            try {
                const { data: policyData } = await window.supabaseClient.from('school_policies').select('*').eq('school_id', currentAdminSchoolId).single();
                if (policyData) policyConfig = policyData;
            } catch (e) {
                console.warn("Could not retrieve custom limits from policies table. Continuing with basic inserts.");
            }

            const finalRecords = [...valid];
            correctedInvalid.forEach(r => {
                r.category = r.selected; 
                finalRecords.push(r);
            });

            const validIds = finalRecords.map(s => s.id_number);
            const { data: matchedProfiles, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('id, id_number, school_id')
                .in('id_number', validIds);

            if (profileError) throw profileError;

            const profileMap = {};
            const studentUuids = [];
            if (matchedProfiles) {
                matchedProfiles.forEach(p => {
                    profileMap[p.id_number] = p.id;
                    studentUuids.push(p.id);
                });
            }

            // Fetch current active applications for ALL students in the payload
            let currentActiveApps = [];
            if (studentUuids.length > 0) {
                const { data, error } = await window.supabaseClient
                    .from('applications')
                    .select('id, student_id, scholarship_id, outside_assistance_name, status, category')
                    .in('student_id', studentUuids)
                    .in('status', ['Grantee', 'Passed', 'Approved', 'grantee', 'passed', 'approved']);

                if (error) throw error;
                currentActiveApps = data || [];
            }

            // Map the active applications exactly to the students UUIDs (deduplicating by unique program)
            const activeUserMap = {};
            currentActiveApps.forEach(app => {
                if (!activeUserMap[app.student_id]) activeUserMap[app.student_id] = [];
                const key = app.scholarship_id ? `sch_${app.scholarship_id}` : `out_${(app.outside_assistance_name || '').toLowerCase().trim()}`;
                if (!activeUserMap[app.student_id].some(a => (a.scholarship_id ? `sch_${a.scholarship_id}` : `out_${(a.outside_assistance_name || '').toLowerCase().trim()}`) === key)) {
                    activeUserMap[app.student_id].push(app);
                }
            });

            const processPromises = finalRecords.map(async row => {
                const studentUuid = profileMap[row.id_number];

                if (!studentUuid) {
                    throw new Error(`ProfileNotRegistered:${row.id_number}`); 
                }

                if (currentAdminSchoolId && matchedProfiles) {
                    const studentProf = matchedProfiles.find(p => p.id === studentUuid);
                    if (studentProf && studentProf.school_id && String(studentProf.school_id) !== String(currentAdminSchoolId)) {
                        throw new Error(`ProfileSchoolMismatch:${row.id_number}`);
                    }
                }

                const internalProgram = schoolScholarships.find(s => s.title.toLowerCase() === row.assistance_name.toLowerCase());
                const finalCategory = row.category;
                
                // Keep track of their current memory list so sequential rows don't bypass checks
                const studentActiveList = activeUserMap[studentUuid] || []; 

                // 1. Check if it's already a duplicate of this EXACT program
                if (internalProgram) {
                    const { data: existingApps } = await window.supabaseClient
                        .from('applications')
                        .select('id, status, duration')
                        .eq('student_id', studentUuid)
                        .eq('scholarship_id', internalProgram.id);

                    if (existingApps && existingApps.length > 0) {
                        const extApp = existingApps[0];
                        
                        if (['Grantee', 'Passed', 'Approved', 'grantee', 'passed', 'approved'].includes(extApp.status)) return 'Duplicate';
                        
                        // Enforce Admin Policies Before Reactivation (excluding this program)
                        const otherActiveList = studentActiveList.filter(a => a.scholarship_id !== internalProgram.id);
                        validateAgainstPolicies(finalCategory, otherActiveList, policyConfig, row.id_number);

                        const { error: updateError } = await window.supabaseClient.from('applications').update({
                            status: 'Grantee',
                            remarks: 'Auto-Approved/Re-activated via Beneficiary Bulk Import',
                            duration: row.duration || extApp.duration,
                            category: finalCategory
                        }).eq('id', extApp.id);
                        
                        if (updateError) throw updateError;
                        
                        // Append to memory array to block subsequent rows if they exceed the limit
                        studentActiveList.push({ category: finalCategory, scholarship_id: internalProgram.id }); 
                        return 'Updated';
                    }
                } else {
                    // OUTSIDE ASSISTANCE CHECK
                    const { data: existingOutside } = await window.supabaseClient
                        .from('applications')
                        .select('id, status, duration')
                        .eq('student_id', studentUuid)
                        .is('scholarship_id', null)
                        .eq('outside_assistance_name', row.assistance_name);

                    if (existingOutside && existingOutside.length > 0) {
                        const extOut = existingOutside[0];
                        
                        if (['Grantee', 'Passed', 'Approved', 'grantee', 'passed', 'approved'].includes(extOut.status)) return 'Duplicate';

                        // Enforce Admin Policies Before Reactivation (excluding this outside program)
                        const otherActiveList = studentActiveList.filter(a => (a.outside_assistance_name || '').toLowerCase().trim() !== row.assistance_name.toLowerCase().trim());
                        validateAgainstPolicies(finalCategory, otherActiveList, policyConfig, row.id_number);

                        const { error: updateOutError } = await window.supabaseClient.from('applications').update({
                            status: 'Grantee',
                            remarks: 'Re-activated Outside Assistance via Bulk Import',
                            duration: row.duration || extOut.duration,
                            category: finalCategory,
                            outside_sy: row.sy,
                            outside_semester: row.sem,
                            outside_batch: row.batch
                        }).eq('id', extOut.id);

                        if (updateOutError) throw updateOutError;
                        studentActiveList.push({ category: finalCategory, outside_assistance_name: row.assistance_name }); 
                        return 'Updated';
                    }
                }

                // 2. Enforce Admin Policies Before New Insertion
                const otherActiveList = studentActiveList.filter(a => {
                    if (internalProgram && a.scholarship_id) return a.scholarship_id !== internalProgram.id;
                    if (!internalProgram && a.outside_assistance_name) return (a.outside_assistance_name || '').toLowerCase().trim() !== row.assistance_name.toLowerCase().trim();
                    return true;
                });
                validateAgainstPolicies(finalCategory, otherActiveList, policyConfig, row.id_number);

                // 3. Proceed to Insert
                if (internalProgram) {
                    const { error: insertError } = await window.supabaseClient.from('applications').insert({
                        student_id: studentUuid,
                        scholarship_id: internalProgram.id,
                        status: 'Grantee',
                        duration: row.duration,
                        category: finalCategory,
                        remarks: 'Directly Imported Beneficiary'
                    });
                    if (insertError) throw insertError; 
                } else {
                    const { error: outsideInsertError } = await window.supabaseClient.from('applications').insert({
                        student_id: studentUuid,
                        scholarship_id: null,
                        outside_assistance_name: row.assistance_name,
                        outside_sy: row.sy,
                        outside_semester: row.sem,
                        outside_batch: row.batch,
                        duration: row.duration,
                        category: finalCategory, 
                        status: 'Grantee',
                        remarks: 'Imported Outside Educational Assistance'
                    });
                    if (outsideInsertError) throw outsideInsertError; 
                }

                // Append to memory array
                studentActiveList.push({ category: finalCategory }); 
                return 'Inserted';
            });

            const results = await Promise.allSettled(processPromises);
            
            let insertCount = 0; let updateCount = 0; let duplicateCount = 0;
            let noAccountSkipped = 0; let policyRejections = new Set();
            let hasFailures = false;

            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    if (result.value === 'Inserted') insertCount++;
                    if (result.value === 'Updated') updateCount++;
                    if (result.value === 'Duplicate') duplicateCount++;
                } else if (result.status === 'rejected') {
                    hasFailures = true;
                    const errString = String(result.reason.message || result.reason);
                    
                    if (errString.includes("ProfileNotRegistered")) {
                        noAccountSkipped++;
                    } else if (errString.includes("ProfileSchoolMismatch")) {
                        const sid = errString.split(':')[1] || '';
                        policyRejections.add(`Student [${sid}] belongs to a different school.`);
                    } else if (errString.includes("PolicyLimitReached") || errString.includes("CategoryLimitReached") || errString.includes("CombinationRuleViolation")) {
                        // Clean up the error message for the display
                        policyRejections.add(errString.replace(/^(Error: )?(PolicyLimitReached:|CategoryLimitReached:|CombinationRuleViolation:)\s*/i, ''));
                    } else if (errString.toLowerCase().includes('policy') || errString.includes('row-level security')) {
                        policyRejections.add("Database RLS prevented modification of an active record.");
                    } else {
                        policyRejections.add(`System Error: ${errString}`);
                    }
                }
            });

            if (correctedInvalid.length > 0) {
                await window.supabaseClient.from('audit_logs').insert([{
                    admin_id: adminId,
                    school_id: currentAdminSchoolId,
                    action: 'Bulk Import Category Correction',
                    module: 'Active Beneficiaries',
                    details: JSON.stringify({ details: `Admin manually corrected categories for ${correctedInvalid.length} records.` })
                }]);
            }

            let summaryHtml = `<div style="text-align: left; font-size: 14px; margin-top: 10px;">`;
            if (insertCount > 0 || updateCount > 0) {
                summaryHtml += `<p style="margin-bottom: 5px; color: #166534;">✓ <strong>${updateCount}</strong> pending applications auto-approved.</p>`;
                summaryHtml += `<p style="margin-bottom: 15px; color: #166534;">✓ <strong>${insertCount}</strong> new beneficiaries successfully written.</p>`;
            }

            if (hasFailures || duplicateCount > 0 || skippedIds.length > 0 || noAccountSkipped > 0) {
                summaryHtml += `<div style="background:#fef2f2; border:1px solid #fca5a5; padding:10px; border-radius:6px; max-height:200px; overflow-y:auto;">`;
                summaryHtml += `<h5 style="margin:0 0 8px 0; color:#991b1b;">Import Warnings & Policy Rejections:</h5>`;
                
                if (duplicateCount > 0) summaryHtml += `<p style="color:#b45309; font-size:13px; margin: 0 0 4px 0;"><strong>- Double Entry / Skipped:</strong> ${duplicateCount} record(s) already actively registered in this specific program.</p>`;
                if (skippedIds.length > 0) summaryHtml += `<p style="color:#ef4444; font-size:13px; margin: 0 0 4px 0;"><strong>- Skipped:</strong> ${skippedIds.length} ID(s) not found in the ${escapeHtml(currentAdminSchool || 'school')} Enrolled Masterlist.</p>`;
                if (noAccountSkipped > 0) summaryHtml += `<p style="color:#ef4444; font-size:13px; margin: 0 0 4px 0;"><strong>- Skipped:</strong> ${noAccountSkipped} enrolled IDs have not registered a profile yet.</p>`;
                
                if (policyRejections.size > 0) {
                    policyRejections.forEach(rejection => {
                        summaryHtml += `<p style="color:#991b1b; font-size:13px; margin: 4px 0; font-weight: bold;">- ${rejection}</p>`;
                    });
                }
                summaryHtml += `</div>`;
            }
            summaryHtml += `</div>`;

            if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
            
            let toastType = 'success';
            let toastTitle = 'Import Successful!';

            if (insertCount === 0 && updateCount === 0) {
                // All processed records were Double Entry, Skipped, or Rejected
                toastType = 'warning';
                if (policyRejections.size > 0 && duplicateCount === 0 && skippedIds.length === 0 && noAccountSkipped === 0) {
                    toastType = 'error';
                    toastTitle = 'Import Blocked by Policy';
                } else if (duplicateCount > 0 && skippedIds.length === 0 && noAccountSkipped === 0) {
                    toastTitle = 'Double Entry / Skipped';
                } else if (duplicateCount > 0 || skippedIds.length > 0 || noAccountSkipped > 0) {
                    toastTitle = 'Double Entry / Skipped';
                } else {
                    toastTitle = 'No Records Imported';
                }
            } else if (hasFailures || duplicateCount > 0 || skippedIds.length > 0 || noAccountSkipped > 0) {
                toastType = 'warning';
                toastTitle = 'Import Completed with Warnings';
            } else {
                toastType = 'success';
                toastTitle = 'Import Successful!';
            }

            showToast(
                toastType,
                toastTitle,
                summaryHtml,
                8000
            );

            if (document.getElementById('import-modal')) document.getElementById('import-modal').style.display = 'none';
            if (document.getElementById('import-file-input')) document.getElementById('import-file-input').value = '';
            if (document.getElementById('import-status')) document.getElementById('import-status').innerHTML = '';
            
            fetchActiveBeneficiaries();

        } catch (err) {
            if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
            showToast('error', 'Import Interrupted', err.message || 'The script failed before reaching the database loop.', 6000);
        }
    }

    // ==========================================
    // 7. MANUALLY ADD BENEFICIARY WITH POLICIES
    // ==========================================
    function updateManualAddFormFields() {
        const schSelect = document.getElementById('manual-scholarship-select');
        const schId = schSelect ? schSelect.value : '';
        const outsideContainer = document.getElementById('manual-outside-name-container');
        const outsideInput = document.getElementById('manual-outside-name');
        const termRow = document.getElementById('manual-term-row');
        const syInput = document.getElementById('manual-sy');
        const semSelect = document.getElementById('manual-semester');
        const categoryContainer = document.getElementById('manual-category-container');
        const categorySelect = document.getElementById('manual-category');
        const internalInfoContainer = document.getElementById('manual-internal-info-container');
        const batchInput = document.getElementById('manual-batch');
        const durationSelect = document.getElementById('manual-duration');

        // Always keep Term Row, Category, Batch, and Duration containers visible in the layout
        if (termRow) termRow.style.display = 'grid';
        if (categoryContainer) categoryContainer.style.display = 'block';

        if (schId) {
            // INTERNAL PROGRAM SELECTED:
            // Outside Assistance Name is not applicable
            if (outsideContainer) outsideContainer.style.display = 'none';
            if (outsideInput) {
                outsideInput.value = '';
                outsideInput.required = false;
            }

            // Lock School Year (SY), Semester, and Category (Visible but Read-Only / Disabled)
            if (syInput) {
                syInput.disabled = true;
                syInput.style.backgroundColor = 'var(--input-bg, #F8FAF7)';
                syInput.style.cursor = 'not-allowed';
            }
            if (semSelect) {
                semSelect.disabled = true;
                semSelect.style.backgroundColor = 'var(--input-bg, #F8FAF7)';
                semSelect.style.cursor = 'not-allowed';
            }
            if (categorySelect) {
                categorySelect.disabled = true;
                categorySelect.style.backgroundColor = 'var(--input-bg, #F8FAF7)';
                categorySelect.style.cursor = 'not-allowed';
                categorySelect.required = false;
            }

            // Show informational banner
            if (internalInfoContainer) {
                internalInfoContainer.style.display = 'block';
                if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
            }

            // Pre-fill values from the selected internal program
            const matchedSch = schoolScholarships.find(s => s.id === schId);
            if (matchedSch) {
                if (matchedSch.category && categorySelect) {
                    const existingOption = Array.from(categorySelect.options).find(opt => opt.value === matchedSch.category);
                    if (existingOption) {
                        categorySelect.value = matchedSch.category;
                    } else {
                        categorySelect.add(new Option(matchedSch.category, matchedSch.category, true, true));
                    }
                }
                if (syInput) syInput.value = matchedSch.school_year || '';
                if (semSelect) semSelect.value = matchedSch.semester || '';
                if (batchInput) batchInput.value = matchedSch.batch || '';
            }

            // Batch and Assistance Duration remain fully editable
            if (batchInput) {
                batchInput.disabled = false;
                batchInput.style.backgroundColor = '';
                batchInput.style.cursor = '';
            }
            if (durationSelect) {
                durationSelect.disabled = false;
                durationSelect.style.backgroundColor = '';
                durationSelect.style.cursor = '';
            }
        } else {
            // NO INTERNAL PROGRAM (OUTSIDE ASSISTANCE):
            // Outside Assistance Name, School Year (SY), Semester, Batch, Category, and Duration are all cleared and editable
            if (outsideContainer) outsideContainer.style.display = 'block';
            if (outsideInput) {
                outsideInput.value = '';
                outsideInput.required = true;
            }

            if (syInput) {
                syInput.value = '';
                syInput.disabled = false;
                syInput.style.backgroundColor = '';
                syInput.style.cursor = '';
            }
            if (semSelect) {
                semSelect.value = '';
                semSelect.disabled = false;
                semSelect.style.backgroundColor = '';
                semSelect.style.cursor = '';
            }
            if (categorySelect) {
                categorySelect.value = '';
                categorySelect.disabled = false;
                categorySelect.style.backgroundColor = '';
                categorySelect.style.cursor = '';
                categorySelect.required = true;
            }
            if (batchInput) {
                batchInput.value = '';
                batchInput.disabled = false;
                batchInput.style.backgroundColor = '';
                batchInput.style.cursor = '';
            }
            if (durationSelect) {
                durationSelect.value = 'Not Set';
                durationSelect.disabled = false;
                durationSelect.style.backgroundColor = '';
                durationSelect.style.cursor = '';
            }

            if (internalInfoContainer) internalInfoContainer.style.display = 'none';
        }
    }

    if (document.getElementById('btn-add-manual')) {
        document.getElementById('btn-add-manual').addEventListener('click', () => {
            const form = document.getElementById('form-manual-add');
            if (form) form.reset();
            updateManualAddFormFields();
            document.getElementById('manual-add-modal').style.display = 'flex';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        });
    }

    if (document.getElementById('manual-scholarship-select')) {
        document.getElementById('manual-scholarship-select').addEventListener('change', () => {
            updateManualAddFormFields();
        });
    }

    if (document.getElementById('form-manual-add')) {
        document.getElementById('form-manual-add').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-submit-manual');
            const sid = document.getElementById('manual-student-id').value.trim();
            const schId = document.getElementById('manual-scholarship-select').value;
            const outsideName = document.getElementById('manual-outside-name')?.value.trim();
            let category = document.getElementById('manual-category')?.value.trim();
            const duration = document.getElementById('manual-duration')?.value || 'Not Set';
            const manualBatch = document.getElementById('manual-batch')?.value.trim() || null;

            if (!schId && !outsideName) {
                showToast("warning", "Required Field", "Please select an Internal Program OR provide an Outside Assistance Name.");
                return;
            }

            if (schId) {
                const internalSch = schoolScholarships.find(s => s.id === schId);
                if (internalSch && internalSch.category) {
                    category = internalSch.category;
                } else if (!category) {
                    category = 'Institution-Funded Educational Assistance';
                }
            } else {
                if (!category) {
                    showToast("warning", "Required Field", "Please select an Educational Assistance Category to track policies accurately.");
                    return;
                }
            }

            const masterMatch = masterlistMap[sid] || masterlistMap[sid.toLowerCase()] || masterlistMap[sid.toLowerCase().replace(/[\s\-_]/g, '')];
            const isEnrolledInSchool = masterMatch && (!currentAdminSchoolId || !masterMatch.school_id || String(masterMatch.school_id) === String(currentAdminSchoolId));
            if (!isEnrolledInSchool) {
                const schoolMsg = currentAdminSchool ? ` for ${currentAdminSchool}` : '';
                showToast("error", "Not Enrolled", `This Student ID is not found in the official Enrolled Masterlist${schoolMsg}.`, 5000);
                return;
            }

            btn.innerHTML = 'Adding...';
            btn.disabled = true;

            try {
                const { data: profile } = await window.supabaseClient.from('profiles').select('id, school_id').eq('id_number', sid).single();
                if (!profile) throw new Error("Student has not registered an account yet.");
                if (currentAdminSchoolId && profile.school_id && String(profile.school_id) !== String(currentAdminSchoolId)) {
                    throw new Error(`This student profile is registered under a different school.`);
                }

                // FETCH POLICIES & CURRENT ACTIVE PROGRAMS FOR THIS STUDENT
                let policyConfig = null;
                const { data: policyData } = await window.supabaseClient.from('school_policies').select('*').eq('school_id', currentAdminSchoolId).single();
                if (policyData) policyConfig = policyData;

                const { data: currentApps } = await window.supabaseClient
                    .from('applications')
                    .select('id, category, scholarship_id, outside_assistance_name, status')
                    .eq('student_id', profile.id)
                    .in('status', ['Grantee', 'Passed', 'Approved', 'grantee', 'passed', 'approved']);

                // Filter out the program currently being added/reactivated so it doesn't count against itself
                const otherActiveApps = (currentApps || []).filter(a => {
                    if (schId && a.scholarship_id) {
                        return a.scholarship_id !== schId;
                    }
                    if (!schId && outsideName && a.outside_assistance_name) {
                        return (a.outside_assistance_name || '').toLowerCase().trim() !== outsideName.toLowerCase().trim();
                    }
                    return true;
                });

                // Deduplicate otherActiveApps by unique program
                const uniqueOtherActive = [];
                const seenKeys = new Set();
                for (const a of otherActiveApps) {
                    const key = a.scholarship_id ? `sch_${a.scholarship_id}` : `out_${(a.outside_assistance_name || '').toLowerCase().trim()}`;
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        uniqueOtherActive.push(a);
                    }
                }

                // VALIDATE!
                validateAgainstPolicies(category, uniqueOtherActive, policyConfig, sid);

                // Check if existing record exists for this student + program (e.g. Revoked, Rejected, or duplicate)
                let existingAppQuery = window.supabaseClient
                    .from('applications')
                    .select('id, status')
                    .eq('student_id', profile.id);

                if (schId) {
                    existingAppQuery = existingAppQuery.eq('scholarship_id', schId);
                } else {
                    existingAppQuery = existingAppQuery.is('scholarship_id', null).eq('outside_assistance_name', outsideName);
                }

                const { data: existingRecords } = await existingAppQuery;

                const progName = schId ? (schoolScholarships.find(s => s.id === schId)?.title || 'Educational Assistance') : outsideName;
                const studentFullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
                const displayName = studentFullName ? `${studentFullName} [${sid}]` : `Student [${sid}]`;

                // Check if student is ALREADY an active beneficiary in this exact program (Double Entry)
                const alreadyActiveRecord = (existingRecords || []).find(r => 
                    ['grantee', 'passed', 'approved'].includes((r.status || '').toLowerCase())
                );

                if (alreadyActiveRecord) {
                    const confirmUpdate = await Swal.fire({
                        title: 'Double Entry Detected',
                        html: `<div style="text-align: left; font-size: 14px; line-height: 1.6;">
                            <p style="margin-bottom: 8px;"><strong>${escapeHtml(displayName)}</strong> is <strong>already an active beneficiary</strong> for <span style="color: #10b981; font-weight: 600;">${escapeHtml(progName)}</span>.</p>
                            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">Would you like to update their current beneficiary record with the new category (<strong>${escapeHtml(category)}</strong>) and duration (<strong>${escapeHtml(duration)}</strong>), or cancel to prevent duplicate entries?</p>
                        </div>`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#10b981',
                        cancelButtonColor: '#64748b',
                        confirmButtonText: 'Yes, Update Record',
                        cancelButtonText: 'Cancel (Ignore)'
                    });

                    if (!confirmUpdate.isConfirmed) {
                        return;
                    }
                }

                const manualSy = schId ? null : (document.getElementById('manual-sy')?.value.trim() || null);
                const manualSem = schId ? null : (document.getElementById('manual-semester')?.value.trim() || null);

                const payload = {
                    student_id: profile.id,
                    scholarship_id: schId || null,
                    outside_assistance_name: schId ? null : outsideName,
                    outside_sy: manualSy,
                    outside_semester: manualSem,
                    outside_batch: manualBatch,
                    category: category,
                    duration: duration,
                    status: 'Grantee',
                    remarks: alreadyActiveRecord ? 'Updated by Administrator' : 'Manually Added by Administrator'
                };

                let insertedAppId = null;
                if (existingRecords && existingRecords.length > 0) {
                    // Update existing record to reactivate/update instead of creating duplicate rows
                    const extId = existingRecords[0].id;
                    const { error: updateErr } = await window.supabaseClient
                        .from('applications')
                        .update(payload)
                        .eq('id', extId);
                    if (updateErr) throw updateErr;
                    insertedAppId = extId;
                } else {
                    const { data: insertedApp, error: insertErr } = await window.supabaseClient
                        .from('applications')
                        .insert(payload)
                        .select()
                        .single();
                    if (insertErr) throw insertErr;
                    insertedAppId = insertedApp?.id || null;
                }

                // If this wasn't already active, send new enrollment notifications
                if (!alreadyActiveRecord) {
                    // 1. In-App Notification
                    try {
                        await window.supabaseClient.from('notifications').insert([{
                            user_id: profile.id,
                            title: 'Enrolled as Active Beneficiary',
                            message: `You have been officially enrolled as an Active Beneficiary for ${progName}.`,
                            type: 'application',
                            action_link: insertedAppId ? `student-applications.html?app_id=${insertedAppId}` : 'student-applications.html',
                            is_read: false
                        }]);
                    } catch (notifErr) {
                        console.error("In-app notification failed:", notifErr);
                    }

                    // 2. Dispatch Email / Push notification via backend
                    try {
                        fetch('https://grantee-backend-n5f4.onrender.com/api/dispatch-notification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userIds: [profile.id],
                                eventType: 'APPLICATION_APPROVED',
                                subject: `Active Beneficiary: ${progName}`,
                                message: `You have been officially enrolled as an Active Beneficiary for "${progName}".`,
                                htmlContent: `
                                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                                        <h2 style="color: #6B7F4E; margin-top: 0;">Active Beneficiary Confirmation</h2>
                                        <p>Congratulations! You have been officially enrolled as an Active Beneficiary for <strong>${progName}</strong>.</p>
                                        <p>Log in to your student dashboard to review your status and benefit schedules.</p>
                                    </div>
                                `,
                                resourceId: insertedAppId
                            })
                        }).catch(e => console.error("Notification dispatch failed:", e));
                    } catch (dispatchErr) {
                        console.error("Notification dispatch error:", dispatchErr);
                    }
                }

                try {
                    await window.supabaseClient.from('audit_logs').insert([{
                        admin_id: adminId,
                        school_id: currentAdminSchoolId,
                        action: alreadyActiveRecord ? 'Updated Beneficiary Record' : 'Manually Added Beneficiary',
                        module: 'Active Beneficiaries',
                        details: JSON.stringify({ details: `${alreadyActiveRecord ? 'Updated existing' : 'Added'} Student ID ${sid} in assistance program. Category mapped: ${category}`, targetUserId: profile.id })
                    }]);
                } catch (auditErr) {
                    console.error("Audit log failed:", auditErr);
                }

                if (alreadyActiveRecord) {
                    showToast("success", "Record Updated", `Beneficiary record for ${escapeHtml(displayName)} has been successfully updated.`);
                } else {
                    showToast("success", "Success", "Beneficiary manually added successfully.");
                }
                document.getElementById('form-manual-add').reset();
                document.getElementById('manual-add-modal').style.display = 'none';
                fetchActiveBeneficiaries();

            } catch (err) { 
                console.error("Manual add beneficiary error:", err);
                const isPolicyError = /^(Error: )?(PolicyLimitReached:|CategoryLimitReached:|CombinationRuleViolation:)/i.test(err.message || '');
                if (isPolicyError) {
                    const cleanError = (err.message || '').replace(/^(Error: )?(PolicyLimitReached:|CategoryLimitReached:|CombinationRuleViolation:)\s*/i, '');
                    showToast("error", "Policy Blocked", cleanError, 6000);
                } else {
                    showToast("error", "Error", err.message || "Failed to add beneficiary.");
                }
            } finally { 
                btn.innerHTML = 'Add Beneficiary'; btn.disabled = false; 
            }
        });
    }

    // ==========================================
    // 8. EDIT ASSISTANCE DETAILS MODAL HANDLER
    // ==========================================
    window.openEditDetailsModal = (appId) => {
        const app = activeBeneficiaries.find(a => a.id === appId);
        if (!app) {
            showToast("error", "Beneficiary Not Found", "Beneficiary record not found.");
            return;
        }

        const masterInfo = findMasterlistStudent(app);
        const studentId = resolveStudentDisplayId(app, masterInfo);
        const fullName = resolveStudentFullName(app, masterInfo);
        const displayName = fullName ? `${fullName} (${studentId})` : studentId;

        const isOutside = !app.scholarship_id;
        const schTitle = isOutside ? (app.outside_assistance_name || 'Outside Assistance') : (app.scholarships?.title || 'Unknown Assistance');
        const categoryValue = app.category || app.scholarships?.category || (isOutside ? 'Outside Assistance' : 'Institution-Funded Educational Assistance');

        if (document.getElementById('edit-app-id')) document.getElementById('edit-app-id').value = app.id;
        if (document.getElementById('edit-student-display')) document.getElementById('edit-student-display').textContent = displayName;
        if (document.getElementById('edit-program-display')) document.getElementById('edit-program-display').textContent = schTitle;

        const badgeContainer = document.getElementById('edit-type-badge-container');
        if (badgeContainer) {
            const badgeLabel = isOutside ? 'Outside Educational Assistance' : 'Internal Educational Assistance';
            const badgeClass = isOutside ? 'cat-badge-outside' : 'cat-badge-inst';
            badgeContainer.innerHTML = `<span class="category-badge-pill ${badgeClass}" style="font-size: 11px;">${badgeLabel}</span>`;
        }

        const outsideContainer = document.getElementById('edit-outside-name-container');
        const outsideInput = document.getElementById('edit-outside-name');
        const termRow = document.getElementById('edit-term-row');
        const categoryContainer = document.getElementById('edit-category-container');
        const internalInfoContainer = document.getElementById('edit-internal-info-container');

        const currentSy = app.outside_sy || app.scholarships?.school_year || '';
        const currentSem = app.outside_semester || app.scholarships?.semester || '';
        const currentBatch = app.outside_batch || app.scholarships?.batch || '';
        const currentDuration = app.duration || 'Not Set';

        // Populate common editable fields (Batch and Duration)
        if (document.getElementById('edit-batch')) document.getElementById('edit-batch').value = currentBatch;
        if (document.getElementById('edit-duration')) document.getElementById('edit-duration').value = currentDuration;

        if (isOutside) {
            // OUTSIDE ASSISTANCE: Coordinator can edit Outside Assistance Name, School Year (SY), Semester, Batch, Duration, and Category
            if (outsideContainer) outsideContainer.style.display = 'block';
            if (outsideInput) {
                outsideInput.value = app.outside_assistance_name || '';
                outsideInput.required = true;
            }

            if (termRow) termRow.style.display = 'grid';
            if (document.getElementById('edit-sy')) document.getElementById('edit-sy').value = currentSy;
            if (document.getElementById('edit-semester')) document.getElementById('edit-semester').value = currentSem;

            if (categoryContainer) categoryContainer.style.display = 'block';
            if (document.getElementById('edit-category')) {
                const catSelect = document.getElementById('edit-category');
                catSelect.required = true;
                const matchOpt = Array.from(catSelect.options).find(opt => opt.value === categoryValue);
                if (matchOpt) {
                    catSelect.value = categoryValue;
                } else if (categoryValue) {
                    catSelect.add(new Option(categoryValue, categoryValue, true, true));
                }
            }

            if (internalInfoContainer) internalInfoContainer.style.display = 'none';
        } else {
            // INTERNAL ASSISTANCE: Coordinator can ONLY edit Batch and Assistance Duration
            if (outsideContainer) outsideContainer.style.display = 'none';
            if (outsideInput) {
                outsideInput.value = '';
                outsideInput.required = false;
            }

            if (termRow) termRow.style.display = 'none';
            if (categoryContainer) categoryContainer.style.display = 'none';
            if (document.getElementById('edit-category')) {
                document.getElementById('edit-category').required = false;
            }

            if (internalInfoContainer) internalInfoContainer.style.display = 'block';
        }

        const modal = document.getElementById('edit-details-modal');
        if (modal) {
            modal.style.display = 'flex';
            if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        }
    };

    const formEditDetails = document.getElementById('form-edit-details');
    if (formEditDetails) {
        formEditDetails.addEventListener('submit', async (e) => {
            e.preventDefault();
            const appId = document.getElementById('edit-app-id')?.value;
            if (!appId) return;

            const targetApp = activeBeneficiaries.find(a => a.id === appId);
            if (!targetApp) {
                showToast("error", "Beneficiary Not Found", "Beneficiary record not found.");
                return;
            }

            const isOutside = !targetApp.scholarship_id;
            const btn = document.getElementById('btn-submit-edit-details');
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true; }

            try {
                let updatePayload = {};

                if (isOutside) {
                    const newOutsideName = document.getElementById('edit-outside-name')?.value.trim();
                    if (!newOutsideName) {
                        showToast("warning", "Required Field", "Please provide the Outside Assistance Name.");
                        if (btn) { btn.innerHTML = 'Save Assistance Details'; btn.disabled = false; }
                        return;
                    }
                    const newSy = document.getElementById('edit-sy')?.value.trim() || null;
                    const newSem = document.getElementById('edit-semester')?.value.trim() || null;
                    const newBatch = document.getElementById('edit-batch')?.value.trim() || null;
                    const newDuration = document.getElementById('edit-duration')?.value || 'Not Set';
                    const newCategory = document.getElementById('edit-category')?.value || 'Institution-Funded Educational Assistance';

                    updatePayload = {
                        outside_assistance_name: newOutsideName,
                        outside_sy: newSy,
                        outside_semester: newSem,
                        outside_batch: newBatch,
                        duration: newDuration,
                        category: newCategory
                    };
                } else {
                    // Internal Assistance: Coordinator can ONLY edit Batch and Assistance Duration
                    const newBatch = document.getElementById('edit-batch')?.value.trim() || null;
                    const newDuration = document.getElementById('edit-duration')?.value || 'Not Set';

                    updatePayload = {
                        outside_batch: newBatch,
                        duration: newDuration
                    };
                }

                const { error: updateErr } = await window.supabaseClient
                    .from('applications')
                    .update(updatePayload)
                    .eq('id', appId);

                if (updateErr) throw updateErr;

                // Log audit
                try {
                    await window.supabaseClient.from('audit_logs').insert([{
                        admin_id: adminId,
                        school_id: currentAdminSchoolId,
                        action: 'Updated Assistance Details',
                        module: 'Active Beneficiaries',
                        details: JSON.stringify({ 
                            appId, 
                            isOutside,
                            updatePayload, 
                            targetUserId: targetApp?.student_id 
                        })
                    }]);
                } catch (auditErr) {
                    console.error("Audit log failed:", auditErr);
                }

                showToast("success", "Saved!", "Assistance details have been successfully updated.");
                document.getElementById('edit-details-modal').style.display = 'none';
                fetchActiveBeneficiaries();

            } catch (err) {
                console.error("Error updating assistance details:", err);
                showToast("error", "Update Failed", err.message || "Failed to update assistance details.");
            } finally {
                if (btn) { btn.innerHTML = 'Save Assistance Details'; btn.disabled = false; }
            }
        });
    }

    // ==========================================
    // 9. EXPORT LIST TO EXCEL & PDF (Streamlined Dropdown)
    // ==========================================
    const btnExportToggle = document.getElementById('btn-export-toggle');
    const exportMenu = document.getElementById('export-menu');
    const btnExportExcel = document.getElementById('export-excel-btn');
    const btnExportPdf = document.getElementById('export-pdf-btn');

    if (btnExportToggle && exportMenu) {
        btnExportToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
            btnExportToggle.classList.toggle('active', exportMenu.classList.contains('show'));
        });

        document.addEventListener('click', (e) => {
            if (!exportMenu.contains(e.target) && !btnExportToggle.contains(e.target)) {
                exportMenu.classList.remove('show');
                btnExportToggle.classList.remove('active');
            }
        });
    }

    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            if (exportMenu) {
                exportMenu.classList.remove('show');
                if (btnExportToggle) btnExportToggle.classList.remove('active');
            }
            if (currentFilteredBeneficiaries.length === 0) {
                showToast('info', 'Empty Data', 'There are no active beneficiaries matching the current filters to export.');
                return;
            }
            exportToExcel();
        });
    }

    if (btnExportPdf) {
        btnExportPdf.addEventListener('click', () => {
            if (exportMenu) {
                exportMenu.classList.remove('show');
                if (btnExportToggle) btnExportToggle.classList.remove('active');
            }
            if (currentFilteredBeneficiaries.length === 0) {
                showToast('info', 'Empty Data', 'There are no active beneficiaries matching the current filters to export.');
                return;
            }
            exportToPDF();
        });
    }

    function getExportData() {
        return currentFilteredBeneficiaries.map(app => {
            const masterInfo = findMasterlistStudent(app);
            const studentId = resolveStudentDisplayId(app, masterInfo);

            const fname = app.profiles?.first_name || masterInfo.first_name || 'N/A';
            const lname = app.profiles?.last_name || masterInfo.last_name || 'N/A';
            const mname = app.profiles?.middle_name || masterInfo.middle_name || '';
            
            const { program, yearLevel } = resolveProgramAndYear(masterInfo, app.profiles, app);
            
            const isOutside = !app.scholarship_id;
            const schTitle = isOutside ? (app.outside_assistance_name || 'Outside Assistance') : (app.scholarships?.title || 'Unknown');
            const categoryValue = app.category || app.scholarships?.category || 'Outside Assistance';
            
            const batch = app.scholarships?.batch || app.outside_batch || 'N/A';
            const semester = app.scholarships?.semester || app.outside_semester || 'N/A';
            const sy = app.scholarships?.school_year || app.outside_sy || 'N/A';
            const duration = app.duration || 'Not Set';
            const dateAdded = app.created_at ? new Date(app.created_at).toLocaleDateString('en-US') : 'Not Set';

            return {
                "Student ID": studentId,
                "Last Name": lname,
                "First Name": fname,
                "Middle Name": mname,
                "Program": program,
                "Year Level": yearLevel,
                "Assistance Program": schTitle,
                "Category": categoryValue,
                "Batch": batch,
                "Semester": semester,
                "School Year": sy,
                "Duration": duration,
                "Date Added": dateAdded
            };
        });
    }

    function exportToExcel() {
        Swal.fire({ title: 'Generating Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // Wrap in setTimeout to allow the SweetAlert UI to render fully before blocking the main thread
        setTimeout(() => {
            try {
                const data = getExportData();
                const worksheet = XLSX.utils.json_to_sheet(data);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Active Beneficiaries");
                
                const today = new Date().toISOString().split('T')[0];
                XLSX.writeFile(workbook, `Active_Beneficiaries_Export_${today}.xlsx`);
                
                // Explicitly close the loading modal before showing success
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('success', 'Exported!', 'Your Excel file has been downloaded.');
            } catch (error) {
                console.error("Excel Export Error: ", error);
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('error', 'Export Failed', 'There was an error generating the Excel file. Please check the console.');
            }
        }, 500);
    }

    function exportToPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('error', 'Library Missing', 'jsPDF library is not loaded. Please add the CDN links to your HTML.');
            return;
        }

        Swal.fire({ title: 'Generating PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // Wrap in setTimeout to prevent thread locking from overlapping with the spinner animation
        setTimeout(() => {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('landscape'); 
                
                const data = getExportData();
                const headers = Object.keys(data[0]);
                const rows = data.map(obj => Object.values(obj));
                const todayDate = new Date().toLocaleDateString('en-US');

                doc.setFontSize(14);
                doc.setTextColor(15, 23, 42); 
                doc.text('Active Beneficiaries Report', 14, 15);
                doc.setFontSize(10);
                doc.setTextColor(100, 116, 139); 
                doc.text(`Generated on: ${todayDate} | Total Records: ${data.length}`, 14, 21);

                doc.autoTable({
                    head: [headers],
                    body: rows,
                    startY: 26,
                    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    margin: { top: 10, left: 10, right: 10 }
                });

                const fileNameDate = new Date().toISOString().split('T')[0];
                doc.save(`Active_Beneficiaries_Export_${fileNameDate}.pdf`);
                
                // Explicitly close the loading modal before showing success
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('success', 'Exported!', 'Your PDF file has been downloaded.');
            } catch (error) {
                console.error("PDF Export Error: ", error);
                if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
                showToast('error', 'Export Failed', 'There was an error generating the PDF file. Please check the console.');
            }
        }, 500);
    }

    // Boot
    initProfile();
})();
