document.addEventListener('DOMContentLoaded', async () => {
    
    // --- 1. AUTH CHECK & GLOBAL STATE ---
    const { data: { session }, error: sessionError } = await window.supabaseClient.auth.getSession();
    if (sessionError || !session) { 
        window.location.href = 'login.html'; 
        return; 
    }
    const studentId = session.user.id;
    
    let profile = null;
    let studentSchoolId = null; 
    let policyData = null;
    let allUserApps = [];
    let allScholarships = [];
    let filteredScholarships = [];
    let isProfileComplete = false;

    const gridContainer = document.getElementById('scholarship-grid');
    const resultCount = document.getElementById('result-count');

    // --- 2. INITIALIZATION SEQUENCE ---
    async function init() {
        gridContainer.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Loading available educational assistance...</div>';

        await loadProfileAndMasterlist();
        if (!studentSchoolId) return; // UI handled in loadProfileAndMasterlist

        await Promise.all([
            loadPolicies(),
            loadStudentApplications(),
            loadScholarships()
        ]);

        applyFilters();
    }

    // --- 3. DATA FETCHING ---
    async function loadProfileAndMasterlist() {
        try {
            const { data: prof, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', studentId)
                .single();

            if (profileError) throw profileError;
            profile = prof;

            // Check Profile Completeness
            isProfileComplete = !!(
                profile.first_name && profile.middle_name && profile.last_name && 
                profile.email && profile.id_number && profile.date_of_birth && 
                profile.gender && profile.contact_number && profile.address
            );

            // Fetch school_id from masterlist
            const { data: masterlistData } = await window.supabaseClient
                .from('enrolled_masterlist')
                .select('school_id, schools(name)')
                .eq('id_number', profile.id_number)
                .single();

            studentSchoolId = masterlistData ? masterlistData.school_id : null;

            if (!studentSchoolId) {
                gridContainer.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #ef4444;">Error: No institution assigned to your profile. Please contact support.</div>';
            }

            // Header UI
            const name = `${profile.first_name || 'Student'} ${profile.last_name || ''}`.trim();
            if(document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
            if(document.getElementById('header-program')) document.getElementById('header-program').innerText = studentProgram || 'Student Profile';
            if(profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

        } catch (error) {
            console.error("Error loading profile:", error);
        }
    }

    async function loadPolicies() {
        try {
            const { data: pol } = await window.supabaseClient
                .from('school_policies')
                .select('*')
                .eq('school_id', studentSchoolId)
                .single();
            policyData = pol || null;
        } catch (err) {
            console.warn("No active policies found for this institution.");
        }
    }

    async function loadStudentApplications() {
        try {
            const { data: apps } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships(category)')
                .eq('student_id', studentId);
            allUserApps = apps || [];
        } catch (err) {
            console.error("Error loading student applications:", err);
        }
    }

    async function loadScholarships() {
        try {
            const { data: rawData, error } = await window.supabaseClient
                .from('scholarships')
                .select('*')
                .eq('school_id', studentSchoolId)
                .neq('status', 'Draft')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            allScholarships = rawData.map(sch => ({
                ...sch,
                display_status: calculateDynamicStatus(sch)
            }));
        } catch (error) {
            console.error('Error fetching assistance programs:', error);
            gridContainer.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #ef4444;">Failed to load educational assistance programs.</div>`;
        }
    }

    // --- 4. VALIDATION ENGINE ---
    
    // Aggressive JSON Array Parser (Removes nulls, empty brackets, and false values)
    const parseArray = (val) => {
        if (!val || val === 'null' || val === '[]' || val === '[""]') return [];
        let arr = [];
        if (Array.isArray(val)) {
            arr = val.map(String);
        } else if (typeof val === 'string') {
            try { 
                const parsed = JSON.parse(val); 
                arr = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
            } catch(e) { 
                arr = val.includes(',') ? val.split(',').map(s => String(s).trim()) : [String(val).trim()]; 
            }
        }
        return arr.filter(item => item && item.toLowerCase() !== 'null' && item.toLowerCase() !== 'undefined');
    };

    function validateEligibility(sch) {
        // 1. Profile Completion Validation
        if (!isProfileComplete) {
            return { text: 'Complete Profile', class: 'btn-warning', action: 'profile', msg: 'Please complete your profile information before applying for educational assistance.' };
        }

        // 2. Duplicate Application Validation
        const existingApp = allUserApps.find(a => a.scholarship_id === sch.id);
        if (existingApp) {
            const stat = existingApp.status;
            if (stat === 'Draft') {
                return { text: 'Continue Application', class: 'btn-primary', action: 'apply', msg: '' };
            }
            return { text: 'Already Applied', class: 'btn-disabled', action: 'restricted', msg: 'You already have an existing application for this educational assistance.' };
        }

        // 3. Availability Validation (Dates & Status)
        if (sch.display_status === 'Upcoming') {
            return { text: 'Opening Soon', class: 'btn-disabled', action: 'restricted', msg: 'Applications for this educational assistance have not opened yet.' };
        }
        if (sch.display_status === 'Closed') {
            return { text: 'Closed', class: 'btn-disabled', action: 'restricted', msg: 'Applications for this educational assistance are already closed.' };
        }

        // 4. Availability Validation (Slots)
        const hasUnlimitedSlots = sch.slots === 'Open';
        if (!hasUnlimitedSlots && sch.available_slots === 0) {
            return { text: 'Full', class: 'btn-disabled', action: 'restricted', msg: 'This educational assistance has already reached its maximum number of beneficiaries.' };
        }

        // 5. STRICT Program Eligibility Validation (Using eligibility_programs)
        const rawProgs = parseArray(sch.eligibility_programs);
        const eligibleProgs = rawProgs.map(p => p.toLowerCase().trim());
        const studentProgLower = (profile.program || profile.course || '').toLowerCase().trim();
        const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any'];
        const isProgOpen = eligibleProgs.length === 0 || eligibleProgs.some(p => progOpenKeywords.includes(p));
                           
        if (!isProgOpen) {
            if (!studentProgLower) {
                return { text: 'Not Eligible (Program)', class: 'btn-disabled', action: 'restricted', msg: 'Please update your academic program in Profile Settings to check eligibility.' };
            }
            const matchesProg = eligibleProgs.some(p => p === studentProgLower || p.includes(studentProgLower) || studentProgLower.includes(p));
            if (!matchesProg) {
                const allowedProgsText = rawProgs.join(', ');
                return { text: 'Not Eligible (Program)', class: 'btn-disabled', action: 'restricted', msg: `Your profile indicates you are enrolled in <b>${profile.program || profile.course}</b>.<br><br>This educational assistance is strictly limited to the following program(s):<br><i>${allowedProgsText}</i>` };
            }
        }

        // 6. STRICT Year Level Eligibility Validation (Using eligibility_years)
        const rawYears = parseArray(sch.eligibility_years);
        const eligibleYears = rawYears.map(y => y.toLowerCase().trim());
        const studentYearLower = (profile.year_level || '').toLowerCase().trim();
        const yearOpenKeywords = ['open to all', 'all year levels', 'any'];
        const isYearOpen = eligibleYears.length === 0 || eligibleYears.some(y => yearOpenKeywords.includes(y));

        if (!isYearOpen) {
            if (!studentYearLower) {
                return { text: 'Not Eligible (Year Level)', class: 'btn-disabled', action: 'restricted', msg: 'Please update your year level in Profile Settings to check eligibility.' };
            }
            const matchesYear = eligibleYears.some(y => y === studentYearLower || y.includes(studentYearLower) || studentYearLower.includes(y));
            if (!matchesYear) {
                const allowedYearsText = rawYears.join(', ');
                return { text: 'Not Eligible (Year Level)', class: 'btn-disabled', action: 'restricted', msg: `Your profile indicates you are a <b>${profile.year_level}</b> student.<br><br>This educational assistance is strictly limited to the following year level(s):<br><i>${allowedYearsText}</i>` };
            }
        }

        // 7. Assistance Policies Validation (Global, Category, Combination)
        if (policyData && policyData.global_enabled) {
            const activeApps = allUserApps.filter(a => ['Approved', 'Grantee'].includes(a.status));
            const targetCat = sch.category;
            
            // Global Limit Check
            if (activeApps.length >= (policyData.global_limit || 0) && (policyData.global_limit || 0) > 0) {
                return { text: 'Not Eligible', class: 'btn-disabled', action: 'restricted', msg: 'You have reached the maximum number of active educational assistance programs allowed by institutional policy.' };
            }

            const catLimits = policyData.category_limits || {};
            const comboRules = policyData.combination_rules || {};

            // Category Limit Check
            if (catLimits[targetCat] && !catLimits[targetCat].unlimited) {
                const activeInTargetCat = activeApps.filter(a => 
                    (a.scholarships?.category || a.outside_assistance_name) === targetCat
                ).length;
                
                if (activeInTargetCat >= catLimits[targetCat].limit) {
                    return { text: 'Not Eligible', class: 'btn-disabled', action: 'restricted', msg: `You already hold an active ${targetCat} and cannot apply for another.` };
                }
            }

            // Combination Rules Check
            for (let activeApp of activeApps) {
                const activeCat = activeApp.scholarships?.category || activeApp.outside_assistance_name;
                if (activeCat && activeCat !== targetCat) {
                    const comboKey = `${activeCat}::${targetCat}`;
                    if (comboRules[comboKey] === false) {
                        return { text: 'Not Eligible', class: 'btn-disabled', action: 'restricted', msg: `Institutional policy does not allow combining ${activeCat} with ${targetCat}.` };
                    }
                }
            }
        }

        // 8. Successful Validation
        return { text: 'Apply Now →', class: 'btn-primary', action: 'apply', msg: '' };
    }


    // --- 5. RENDER CARDS ---
    const getBadgeHTML = (category) => {
        if (!category) return '';
        const catLower = category.toLowerCase();
        let bg = 'rgba(16, 185, 129, 0.1)', color = 'var(--primary-color)'; 
        if (catLower.includes('institution')) { bg = '#e0e7ff'; color = '#4f46e5'; }
        if (catLower.includes('ched')) { bg = '#dcfce7'; color = '#16a34a'; }
        if (catLower.includes('private')) { bg = '#fef3c7'; color = '#d97706'; }
        if (catLower.includes('government')) { bg = '#fce7f3'; color = '#9333ea'; }
        return `<span style="background:${bg}; color:${color}; padding:6px 12px; border-radius:12px; font-size:11px; font-weight:700;">${category}</span>`;
    };

    const calculateDynamicStatus = (sch) => {
        if (sch.status === 'Draft') return 'Draft';
        if (!sch.start_date || !sch.end_date) return sch.status || 'Draft';

        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const start = new Date(sch.start_date); start.setHours(0, 0, 0, 0);
        const end = new Date(sch.end_date); end.setHours(23, 59, 59, 999); 

        if (today < start) return 'Upcoming';
        if (today > end) return 'Closed';
        return 'Active';
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const renderCards = (data) => {
        if(resultCount) resultCount.innerText = data.length;

        if (data.length === 0) {
            gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:60px; color:var(--text-muted); background: #fff; border-radius: 12px; border: 1px solid var(--border-color);">No educational assistance programs match your criteria.</div>`;
            return;
        }

        gridContainer.innerHTML = '';
        
        data.forEach(sch => {
            const card = document.createElement('div');
            card.className = 'sch-card';
            
            const btnState = validateEligibility(sch);
            const isClosed = sch.display_status === 'Closed';
            const cardOpacity = isClosed ? 'opacity: 0.7;' : '';
            const isUnlimitedSlots = sch.slots === 'Open';
            const slotsText = isUnlimitedSlots ? 'Unlimited' : (sch.available_slots !== null ? `${sch.available_slots} Left` : 'Varies');

            let btnStyles = '';
            if(btnState.class === 'btn-disabled') btnStyles = 'background: #f1f5f9; color: #94a3b8; cursor: not-allowed; border: 1px solid #e2e8f0;';
            if(btnState.class === 'btn-warning') btnStyles = 'background: #fef3c7; color: #d97706; border: 1px solid #fde68a;';
            if(btnState.class === 'btn-outline') btnStyles = 'background: transparent; color: var(--primary-color); border: 1px solid var(--primary-color);';

            // --- FORCED LOGIC: Calculate Subtitle based entirely on Program and Year Level rules ---
            const progs = parseArray(sch.eligibility_programs).map(p => p.trim());
            const years = parseArray(sch.eligibility_years).map(y => y.trim());
            
            const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any'];
            const yearOpenKeywords = ['open to all', 'all year levels', 'any'];

            const isProgOpen = progs.length === 0 || progs.some(p => progOpenKeywords.includes(p.toLowerCase()));
            const isYearOpen = years.length === 0 || years.some(y => yearOpenKeywords.includes(y.toLowerCase()));

            let subtitleText = '';
            if (isProgOpen && isYearOpen) {
                subtitleText = 'Open to All Programs & Levels';
            } else if (!isProgOpen && isYearOpen) {
                subtitleText = progs.length === 1 ? progs[0] : 'Selected Programs Only';
            } else if (isProgOpen && !isYearOpen) {
                subtitleText = years.length === 1 ? years[0] : 'Selected Year Levels Only';
            } else {
                subtitleText = 'Specific Program & Year Required';
            }

            // Append department explicitly only if it has real data (ignores default 'Open to all' in department field)
            if (sch.department && !progOpenKeywords.includes(sch.department.toLowerCase()) && sch.department.toLowerCase() !== 'null') {
                subtitleText = `${sch.department} • ${subtitleText}`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:flex-start; margin-bottom:16px;">
                    ${getBadgeHTML(sch.category)}
                    ${isClosed ? '<span style="margin-left:auto; font-size:11px; font-weight:bold; color:var(--danger-color); background:#fee2e2; padding:4px 10px; border-radius:12px;">CLOSED</span>' : ''}
                </div>
                
                <div class="sch-card-header" style="${cardOpacity}">
                    <div class="card-icon">🎓</div>
                    <div class="card-title-group">
                        <h3>${sch.title}</h3>
                        <span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">${subtitleText}</span>
                    </div>
                </div>

                <p style="${cardOpacity}">
                    ${sch.description ? sch.description.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...' : 'No description provided.'}
                </p>

                <div class="sch-card-footer" style="${cardOpacity}">
                    <div class="deadline-text">
                        Deadline: <strong style="${isClosed ? 'color:var(--danger-color); text-decoration:line-through;' : 'color:var(--text-main);'}">${formatDate(sch.end_date)}</strong>
                        <br><span style="font-size: 11px;">Slots: ${slotsText}</span>
                    </div>
                    <button class="btn-action ${btnState.class}" style="${btnStyles}" data-action="${btnState.action}" data-id="${sch.id}" data-msg="${btnState.msg}">${btnState.text}</button>
                </div>
            `;
            gridContainer.appendChild(card);
        });
    };
    
    // --- 6. EVENT LISTENERS ---
    
    // Card Button Click Handler
    gridContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-action');
        if (!btn) return;
        
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const msg = btn.getAttribute('data-msg');

        if (action === 'restricted') {
            Swal.fire({
                title: 'Not Eligible',
                html: msg,
                icon: 'warning',
                confirmButtonColor: '#3b82f6'
            });
        } else if (action === 'profile') {
            Swal.fire({
                title: 'Profile Incomplete',
                html: msg,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Complete Profile',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#10b981'
            }).then((res) => {
                if(res.isConfirmed) window.location.href = 'profile-settings.html';
            });
        } else if (action === 'view') {
            Swal.fire({
                title: 'Application Exists',
                text: msg,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'View Applications',
                cancelButtonText: 'Close',
                confirmButtonColor: '#3b82f6'
            }).then((res) => {
                if(res.isConfirmed) window.location.href = 'student-applications.html';
            });
        } else if (action === 'apply') {
            window.location.href = `apply-scholarships.html?id=${id}`;
        }
    });

    // --- ENHANCED FILTER LOGIC ---
    const applyFilters = () => {
        const searchInput = document.getElementById('search-input');
        const sideCat = document.getElementById('side-filter-category');
        const sideProgram = document.getElementById('side-filter-program');
        const sideYear = document.getElementById('side-filter-year');

        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
        
        // Grab values and check for the default "All Categories", "All Programs", "All Year Levels" text
        let catVal = sideCat ? sideCat.value.trim() : '';
        if (catVal.toLowerCase() === 'all categories') catVal = '';

        let progVal = sideProgram ? sideProgram.value.toLowerCase().trim() : '';
        if (progVal === 'all programs') progVal = '';

        let yearVal = sideYear ? sideYear.value.toLowerCase().trim() : '';
        if (yearVal === 'all year levels') yearVal = '';

        filteredScholarships = allScholarships.filter(sch => {
            const matchesSearch = (sch.title || '').toLowerCase().includes(searchVal);
            const matchesCat = catVal === '' || sch.category === catVal;
            
            // Program Filter matching
            const eligibleProgs = parseArray(sch.eligibility_programs).map(p => p.toLowerCase().trim());
            const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any'];
            const isProgOpen = eligibleProgs.length === 0 || eligibleProgs.some(p => progOpenKeywords.includes(p));
            
            const matchesProg = progVal === '' || isProgOpen || eligibleProgs.some(p => p === progVal || p.includes(progVal) || progVal.includes(p));

            // Year Level Filter matching
            const eligibleYears = parseArray(sch.eligibility_years).map(y => y.toLowerCase().trim());
            const yearOpenKeywords = ['open to all', 'all year levels', 'any'];
            const isYearOpen = eligibleYears.length === 0 || eligibleYears.some(y => yearOpenKeywords.includes(y));

            const matchesYear = yearVal === '' || isYearOpen || eligibleYears.some(y => y === yearVal || y.includes(yearVal) || yearVal.includes(y));

            return matchesSearch && matchesCat && matchesProg && matchesYear;
        });

        renderCards(filteredScholarships);
    };

    if(document.getElementById('search-input')) document.getElementById('search-input').addEventListener('input', applyFilters);
    if(document.getElementById('side-filter-category')) document.getElementById('side-filter-category').addEventListener('change', applyFilters);
    if(document.getElementById('side-filter-program')) document.getElementById('side-filter-program').addEventListener('change', applyFilters);
    if(document.getElementById('side-filter-year')) document.getElementById('side-filter-year').addEventListener('change', applyFilters);
    if(document.getElementById('apply-filters-btn')) document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);

    // Look for elements strictly by the text "Clear all" if ID is not fully mapped
    const clearFiltersLink = document.getElementById('clear-filters') || Array.from(document.querySelectorAll('a')).find(el => el.textContent.trim().toLowerCase() === 'clear all');
    
    if(clearFiltersLink) {
        clearFiltersLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(document.getElementById('search-input')) document.getElementById('search-input').value = '';
            
            // Reset dropdowns to their first option (which typically is "All...")
            const catDrop = document.getElementById('side-filter-category');
            if(catDrop) catDrop.selectedIndex = 0;
            
            const progDrop = document.getElementById('side-filter-program');
            if(progDrop) progDrop.selectedIndex = 0;
            
            const yearDrop = document.getElementById('side-filter-year');
            if(yearDrop) yearDrop.selectedIndex = 0;

            applyFilters();
        });
    }

    // Profile Dropdown Fix (Overriding inline display styles)
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');

    if (profileToggle && profileMenu) {
        let isMenuOpen = false;

        const setMenuState = (isOpen) => {
            isMenuOpen = isOpen;
            // Using inline style display to override any HTML display:none properties
            profileMenu.style.display = isOpen ? 'flex' : 'none'; 
            profileToggle.classList.toggle('active-state', isOpen);
            profileToggle.setAttribute('aria-expanded', String(isOpen));
            profileMenu.setAttribute('aria-hidden', String(!isOpen));
        };

        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            setMenuState(!isMenuOpen);
        });

        profileToggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMenuState(!isMenuOpen);
            }
        });

        profileMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        profileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => setMenuState(false));
        });

        document.addEventListener('click', () => setMenuState(false));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setMenuState(false);
        });
    }

    // --- 7. START SCRIPT ---
    init();
});