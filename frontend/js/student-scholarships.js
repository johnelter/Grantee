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

    // Helper to normalize scholarship category names across database variations
    const normalizeCategory = (cat) => {
        if (!cat || typeof cat !== 'string') return '';
        const lower = cat.toLowerCase().trim();
        if (lower.includes('institution')) return 'Institution-Funded Educational Assistance';
        if (lower.includes('ched')) return 'Ched Educational Assistance';
        if (lower.includes('private')) return 'Private Educational Assistance';
        if (lower.includes('government') || lower.includes('gov')) return 'Government Educational Assistance';
        return cat.trim();
    };

    const getAppCategory = (app) => {
        const raw = app.category || app.scholarships?.category || app.outside_category || '';
        return normalizeCategory(raw);
    };

    // --- 2. SKELETON LOADING ENGINE ---
    function renderScholarshipsSkeleton() {
        if (!gridContainer) return;
        let skeletonHTML = '';
        for (let i = 0; i < 6; i++) {
            skeletonHTML += `
                <div class="sch-card sch-skeleton-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div class="skeleton-shimmer" style="width: 110px; height: 22px; border-radius: 12px;"></div>
                        <div class="skeleton-shimmer" style="width: 50px; height: 16px; border-radius: 6px;"></div>
                    </div>
                    <div class="sch-card-header" style="margin-bottom: 14px;">
                        <div class="card-icon skeleton-shimmer" style="width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;"></div>
                        <div class="card-title-group" style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                            <div class="skeleton-shimmer" style="width: 80%; height: 18px;"></div>
                            <div class="skeleton-shimmer" style="width: 60%; height: 12px;"></div>
                        </div>
                    </div>
                    <div class="sch-card-footer" style="padding-top: 14px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div class="skeleton-shimmer" style="width: 90px; height: 12px;"></div>
                            <div class="skeleton-shimmer" style="width: 65px; height: 11px;"></div>
                        </div>
                        <div class="skeleton-shimmer" style="width: 105px; height: 36px; border-radius: 8px;"></div>
                    </div>
                </div>
            `;
        }
        gridContainer.innerHTML = skeletonHTML;
    }

    // --- 3. INITIALIZATION SEQUENCE ---
    async function init() {
        try {
            renderScholarshipsSkeleton();

            await loadProfileAndMasterlist();

            await Promise.all([
                loadPolicies(),
                loadStudentApplications(),
                loadScholarships()
            ]);

            applyFilters();
        } catch (err) {
            console.error("Initialization error:", err);
        } finally {
            const titlesBox = document.getElementById('header-titles-box');
            if (titlesBox) titlesBox.classList.remove('is-loading');
            const headerTitles = document.querySelector('.header-titles');
            if (headerTitles) headerTitles.classList.remove('is-loading');
        }
    }

    // --- 4. DATA FETCHING ---
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

            // 1. First check school_id directly from student profile
            studentSchoolId = profile.school_id || null;

            // 2. Also query masterlist by id_number if available to supplement/verify academic info
            if (profile.id_number) {
                try {
                    const { data: masterlistData } = await window.supabaseClient
                        .from('enrolled_masterlist')
                        .select('school_id, program, year_level, gwa, schools(name)')
                        .eq('id_number', profile.id_number)
                        .maybeSingle();

                    if (masterlistData) {
                        if (!studentSchoolId && masterlistData.school_id) {
                            studentSchoolId = masterlistData.school_id;
                        }
                        if (!profile.program && masterlistData.program) profile.program = masterlistData.program;
                        if (!profile.year_level && masterlistData.year_level) profile.year_level = masterlistData.year_level;
                        if (!profile.gwa && masterlistData.gwa) profile.gwa = masterlistData.gwa;
                    }
                } catch (mErr) {
                    console.warn("Masterlist lookup note:", mErr);
                }
            }

            // Header UI
            const name = `${profile.first_name || 'Student'} ${profile.last_name || ''}`.trim();
            const prog = profile.program || profile.course || 'Student Profile';
            sessionStorage.setItem('grantee_student_profile', JSON.stringify({
                name: name,
                program: prog,
                avatar_url: profile.avatar_url || 'assets/default-avatar.png'
            }));

            if (document.getElementById('header-name')) document.getElementById('header-name').innerText = name;
            if (document.getElementById('header-program')) document.getElementById('header-program').innerText = prog;
            if (profile.avatar_url && document.getElementById('header-avatar')) document.getElementById('header-avatar').src = profile.avatar_url;

        } catch (error) {
            console.error("Error loading profile:", error);
        } finally {
            const titlesBox = document.getElementById('header-titles-box');
            if (titlesBox) titlesBox.classList.remove('is-loading');
            const headerTitles = document.querySelector('.header-titles');
            if (headerTitles) headerTitles.classList.remove('is-loading');
        }
    }

    async function loadPolicies() {
        try {
            let policyQuery = window.supabaseClient.from('school_policies').select('*');
            if (studentSchoolId) {
                policyQuery = policyQuery.eq('school_id', studentSchoolId);
            }
            const { data: pol } = await policyQuery.maybeSingle();
            policyData = pol || null;
        } catch (err) {
            console.warn("No active policies found for this institution.");
        }
    }

    async function loadStudentApplications() {
        try {
            const { data: apps, error } = await window.supabaseClient
                .from('applications')
                .select('*, scholarships(*)')
                .eq('student_id', studentId);
            if (error) throw error;
            allUserApps = apps || [];
        } catch (err) {
            console.error("Error loading student applications:", err);
            allUserApps = [];
        }
    }

    async function loadScholarships() {
        try {
            let schQuery = window.supabaseClient
                .from('scholarships')
                .select('*')
                .neq('status', 'Draft')
                .order('created_at', { ascending: false });

            if (studentSchoolId) {
                schQuery = schQuery.eq('school_id', studentSchoolId);
            }

            let { data: rawData, error } = await schQuery;

            // Fallback: If filtered by school returned nothing, load all active non-draft scholarships
            if ((!rawData || rawData.length === 0) && studentSchoolId) {
                const { data: fallbackData } = await window.supabaseClient
                    .from('scholarships')
                    .select('*')
                    .neq('status', 'Draft')
                    .order('created_at', { ascending: false });
                if (fallbackData && fallbackData.length > 0) {
                    rawData = fallbackData;
                }
            }

            if (error && (!rawData || rawData.length === 0)) throw error;

            allScholarships = (rawData || []).map(sch => ({
                ...sch,
                display_status: calculateDynamicStatus(sch)
            }));
        } catch (error) {
            console.error('Error fetching assistance programs:', error);
            gridContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 48px 24px; color: var(--danger-color); background: var(--bg-card); border-radius: 14px; border: 1px solid var(--border-color); box-shadow: var(--card-shadow);">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--danger-light); color: var(--danger-color); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                        <i data-lucide="alert-triangle" style="width: 24px; height: 24px;"></i>
                    </div>
                    <h4 style="font-size: 16px; font-weight: 700; color: var(--danger-color); margin-bottom: 4px;">Failed to Load Programs</h4>
                    <p style="font-size: 13px; color: var(--text-muted); max-width: 420px; margin: 0 auto;">Unable to fetch educational assistance programs right now. Please refresh the page.</p>
                </div>
            `;
            if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
        }
    }

    // --- 5. VALIDATION ENGINE & ASSISTANCE POLICIES ---
    const parseArray = (val) => {
        if (!val || val === 'null' || val === '[]' || val === '[""]') return [];
        let arr = [];
        if (Array.isArray(val)) {
            arr = val.map(String);
        } else if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                arr = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
            } catch (e) {
                arr = val.includes(',') ? val.split(',').map(s => String(s).trim()) : [String(val).trim()];
            }
        }
        return arr.filter(item => item && item.toLowerCase() !== 'null' && item.toLowerCase() !== 'undefined');
    };

    function validateEligibility(sch) {
        // 1. Profile Completion Validation
        if (!isProfileComplete) {
            return {
                text: 'Complete Profile',
                icon: 'user-check',
                class: 'btn-warning',
                action: 'profile',
                title: 'Profile Incomplete',
                msg: 'Please complete your personal and academic profile in Profile Settings before applying for educational assistance.'
            };
        }

        // 2. Duplicate Application Validation for THIS specific scholarship
        const existingApp = allUserApps.find(a => a.scholarship_id === sch.id);
        if (existingApp) {
            const stat = existingApp.status;
            if (stat === 'Draft') {
                return {
                    text: 'Continue Application',
                    icon: 'arrow-right',
                    class: 'btn-primary',
                    action: 'apply',
                    title: '',
                    msg: ''
                };
            }
            return {
                text: 'Already Applied',
                icon: 'check-circle-2',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Already Applied',
                msg: `You already have an existing application (${stat}) for <b>${sch.title}</b>. You can track your application status under My Applications.`
            };
        }

        // 3. Availability Validation (Dates & Status)
        if (sch.display_status === 'Upcoming') {
            return {
                text: 'Opening Soon',
                icon: 'clock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Applications Not Yet Open',
                msg: 'Applications for this educational assistance program have not opened yet. Please check back when the application period starts.'
            };
        }
        if (sch.display_status === 'Closed') {
            return {
                text: 'Closed',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Application Closed',
                msg: 'Applications for this educational assistance program are currently closed because the application deadline has passed.'
            };
        }

        // 4. Availability Validation (Slots)
        const hasUnlimitedSlots = sch.slots === 'Open';
        if (!hasUnlimitedSlots && sch.available_slots === 0) {
            return {
                text: 'Slots Full',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Slots Full',
                msg: 'This educational assistance has reached its maximum beneficiary capacity and no slots remain available.'
            };
        }

        // Categorize existing student applications
        const activeGrants = allUserApps.filter(a =>
            ['Approved', 'Grantee'].includes(a.status)
        );
        const pendingApps = allUserApps.filter(a =>
            ['Submitted', 'Under Review', 'Pending', 'Revision', 'Evaluating', 'For Interview'].includes(a.status)
        );
        const allActiveAndPending = [...activeGrants, ...pendingApps];

        const targetCat = normalizeCategory(sch.category);

        // 5. "No Other Scholarships" Exclusivity Rule
        const hasNoOtherScholarshipsRule = Boolean(
            sch.no_other_scholarships === true ||
            sch.no_other_scholarship === true ||
            sch.allow_other_scholarships === false ||
            sch.eligibility_no_other_scholarships === true ||
            sch.eligibility_rules?.no_other_scholarships === true ||
            sch.eligibility_rules?.allow_other_scholarships === false ||
            (typeof sch.description === 'string' && /no\s+other\s+(scholarship|assistance|grant)/i.test(sch.description)) ||
            (typeof sch.title === 'string' && /no\s+other\s+(scholarship|assistance|grant)/i.test(sch.title))
        );

        if (hasNoOtherScholarshipsRule) {
            if (pendingApps.length > 0) {
                const pendingTitle = pendingApps[0].scholarships?.title || 'another educational assistance program';
                return {
                    text: 'Application Not Allowed',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Application Not Allowed',
                    msg: `Application not allowed because you have a pending application for <b>${pendingTitle}</b>.<br><br>This educational assistance program requires applicants to have no other pending or active scholarship applications.`
                };
            }
            if (activeGrants.length > 0) {
                const activeTitle = activeGrants[0].scholarships?.title || activeGrants[0].outside_assistance_name || 'an active grant';
                return {
                    text: 'Not Eligible (Active Grant)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Application Not Allowed',
                    msg: `Application not allowed because you already hold an active grant (<b>${activeTitle}</b>).<br><br>This educational assistance requires holding no other scholarships.`
                };
            }
        }

        // 6. Institutional Assistance Policies Validation (school_policies)
        // A. Category Quota Limits: Already has a scholarship on this category
        const appsInSameCategory = allActiveAndPending.filter(a => {
            const appCat = getAppCategory(a);
            return appCat === targetCat;
        });

        const isPolicyGloballyEnabled = policyData ? (policyData.global_enabled ?? true) : true;

        if (isPolicyGloballyEnabled) {
            // Check specific category limits from policies or default institutional rules
            const catLimits = policyData?.category_limits || {};
            const catPolicy = catLimits[targetCat];

            if (catPolicy) {
                if (!catPolicy.unlimited) {
                    const maxLimit = typeof catPolicy.limit === 'number' ? catPolicy.limit : 1;
                    if (maxLimit === 0) {
                        return {
                            text: 'Category Disabled',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Category Restricted',
                            msg: `Applications for the <b>${targetCat}</b> category are currently restricted by institutional policy.`
                        };
                    }
                    if (appsInSameCategory.length >= maxLimit) {
                        const existingTitle = appsInSameCategory[0].scholarships?.title || appsInSameCategory[0].outside_assistance_name || 'an existing scholarship';
                        return {
                            text: 'Category Limit Reached',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Category Limit Reached',
                            msg: `You already have an active or pending scholarship under the <b>${targetCat}</b> category (<i>${existingTitle}</i>).<br><br>Institutional policy permits a maximum of ${maxLimit} program(s) in this category.`
                        };
                    }
                }
            } else {
                // Default policy: Institution-Funded & CHED categories allow maximum 1 grant per student
                if (targetCat.includes('Institution') || targetCat.includes('Ched')) {
                    if (appsInSameCategory.length >= 1) {
                        const existingTitle = appsInSameCategory[0].scholarships?.title || appsInSameCategory[0].outside_assistance_name || 'an existing scholarship';
                        return {
                            text: 'Category Limit Reached',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Category Limit Reached',
                            msg: `You already have an active or pending scholarship under the <b>${targetCat}</b> category (<i>${existingTitle}</i>).<br><br>Institutional policy permits only 1 educational assistance in this category.`
                        };
                    }
                }
            }

            // B. Category Combination Rules Check
            if (policyData && policyData.combination_rules) {
                for (let sa of allActiveAndPending) {
                    const existingCat = getAppCategory(sa);
                    if (existingCat && existingCat !== targetCat) {
                        const comboKey = `${existingCat}::${targetCat}`;
                        const comboKeyReverse = `${targetCat}::${existingCat}`;
                        if (policyData.combination_rules[comboKey] === false || policyData.combination_rules[comboKeyReverse] === false) {
                            const existingTitle = sa.scholarships?.title || sa.outside_assistance_name || existingCat;
                            return {
                                text: 'Not Eligible (Policy)',
                                icon: 'lock',
                                class: 'btn-disabled',
                                action: 'restricted',
                                title: 'Combination Not Permitted',
                                msg: `Institutional policy does not allow combining <b>${targetCat}</b> with your existing grant/application in <b>${existingCat}</b> (<i>${existingTitle}</i>).`
                            };
                        }
                    }
                }
            }

            // C. Global Program Limit Check
            if (policyData && policyData.global_limit > 0) {
                if (allActiveAndPending.length >= policyData.global_limit) {
                    return {
                        text: 'Global Limit Reached',
                        icon: 'lock',
                        class: 'btn-disabled',
                        action: 'restricted',
                        title: 'Institutional Limit Reached',
                        msg: `You have reached the maximum number (${policyData.global_limit}) of active or pending educational assistance programs allowed by institutional policy.`
                    };
                }
            }
        }

        // 7. STRICT Program Eligibility Validation
        const rawProgs = parseArray(sch.eligibility_programs);
        const eligibleProgs = rawProgs.map(p => p.toLowerCase().trim());
        const studentProgLower = (profile.program || profile.course || '').toLowerCase().trim();
        const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any', 'all'];
        const isProgOpen = eligibleProgs.length === 0 || eligibleProgs.some(p => progOpenKeywords.includes(p));

        if (!isProgOpen) {
            if (!studentProgLower) {
                return {
                    text: 'Not Eligible (Program)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Program Requirement Not Met',
                    msg: 'Please update your academic program in Profile Settings to verify your eligibility for this program.'
                };
            }
            const matchesProg = eligibleProgs.some(p => p === studentProgLower || p.includes(studentProgLower) || studentProgLower.includes(p));
            if (!matchesProg) {
                const allowedProgsText = rawProgs.join(', ');
                return {
                    text: 'Not Eligible (Program)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Program Requirement Not Met',
                    msg: `Your profile indicates you are enrolled in <b>${profile.program || profile.course}</b>.<br><br>This educational assistance is strictly limited to students in the following program(s):<br><i>${allowedProgsText}</i>`
                };
            }
        }

        // 8. STRICT Year Level Eligibility Validation
        const rawYears = parseArray(sch.eligibility_years);
        const eligibleYears = rawYears.map(y => y.toLowerCase().trim());
        const studentYearLower = (profile.year_level || '').toLowerCase().trim();
        const yearOpenKeywords = ['open to all', 'all year levels', 'all years', 'any', 'all'];
        const isYearOpen = eligibleYears.length === 0 || eligibleYears.some(y => yearOpenKeywords.includes(y));

        if (!isYearOpen) {
            if (!studentYearLower) {
                return {
                    text: 'Not Eligible (Year)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Year Level Requirement Not Met',
                    msg: 'Please update your year level in Profile Settings to verify your eligibility for this program.'
                };
            }
            const matchesYear = eligibleYears.some(y => y === studentYearLower || y.includes(studentYearLower) || studentYearLower.includes(y));
            if (!matchesYear) {
                const allowedYearsText = rawYears.join(', ');
                return {
                    text: 'Not Eligible (Year)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Year Level Requirement Not Met',
                    msg: `Your profile indicates you are a <b>${profile.year_level}</b> student.<br><br>This educational assistance is strictly limited to the following year level(s):<br><i>${allowedYearsText}</i>`
                };
            }
        }

        // 9. STRICT GWA (General Weighted Average) Eligibility Validation
        const minGwa = sch.gwa_requirement || sch.min_gwa || sch.min_college_gwa || sch.min_hs_average || sch.eligibility_rules?.gwa?.minimum || sch.eligibility_gwa;
        if (minGwa && profile.gwa) {
            const studentGwaNum = parseFloat(profile.gwa);
            const reqGwaNum = parseFloat(minGwa);
            if (!isNaN(studentGwaNum) && !isNaN(reqGwaNum)) {
                if (reqGwaNum <= 5.0) {
                    if (studentGwaNum > reqGwaNum) {
                        return {
                            text: 'Not Eligible (GWA)',
                            icon: 'lock',
                            class: 'btn-disabled',
                            action: 'restricted',
                            title: 'Academic Grade Requirement Not Met',
                            msg: `Your profile indicates a GWA of <b>${profile.gwa}</b>.<br><br>This educational assistance requires a minimum GWA of <b>${minGwa}</b> or better.`
                        };
                    }
                } else if (studentGwaNum < reqGwaNum) {
                    return {
                        text: 'Not Eligible (GWA)',
                        icon: 'lock',
                        class: 'btn-disabled',
                        action: 'restricted',
                        title: 'Academic Grade Requirement Not Met',
                        msg: `Your profile indicates a GWA of <b>${profile.gwa}</b>.<br><br>This educational assistance requires a minimum average of <b>${minGwa}</b>.`
                    };
                }
            }
        }

        // 10. Successful Validation -> Eligible!
        return {
            text: 'Apply Now',
            icon: 'arrow-right',
            class: 'btn-primary',
            action: 'apply',
            title: '',
            msg: ''
        };
    }

    // --- 6. RENDER CARDS WITH BRIEF DESCRIPTION ---
    const getBadgeHTML = (category) => {
        if (!category) return '';
        const catLower = category.toLowerCase();
        let badgeClass = 'sch-badge-default';

        if (catLower.includes('institution')) {
            badgeClass = 'sch-badge-institution';
        } else if (catLower.includes('ched')) {
            badgeClass = 'sch-badge-ched';
        } else if (catLower.includes('private')) {
            badgeClass = 'sch-badge-private';
        } else if (catLower.includes('government')) {
            badgeClass = 'sch-badge-government';
        }

        return `<span class="sch-badge ${badgeClass}">${category}</span>`;
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
        if (resultCount) resultCount.innerText = data.length;

        if (data.length === 0) {
            gridContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 24px; color: var(--text-muted); background: var(--bg-card); border-radius: 14px; border: 1px solid var(--border-color); box-shadow: var(--card-shadow);">
                    <div style="width: 52px; height: 52px; border-radius: 14px; background: var(--bg-card-secondary); color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
                        <i data-lucide="search-x" style="width: 26px; height: 26px;"></i>
                    </div>
                    <h4 style="font-size: 16px; font-weight: 700; color: var(--text-heading); margin-bottom: 6px;">No Assistance Programs Found</h4>
                    <p style="font-size: 13.5px; color: var(--text-muted); max-width: 400px; margin: 0 auto;">No educational assistance matches your search or filters. Try adjusting your criteria or clearing filters.</p>
                </div>
            `;
            if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
            return;
        }

        gridContainer.innerHTML = '';

        data.forEach(sch => {
            const card = document.createElement('div');
            card.className = 'sch-card';

            const btnState = validateEligibility(sch);
            const isClosed = sch.display_status === 'Closed';
            const cardOpacity = isClosed ? 'opacity: 0.72;' : '';
            const isUnlimitedSlots = sch.slots === 'Open';
            const slotsText = isUnlimitedSlots ? 'Unlimited' : (sch.available_slots !== null ? `${sch.available_slots} Left` : 'Varies');

            // Compute brief description regarding required program & year
            const progs = parseArray(sch.eligibility_programs).map(p => p.trim());
            const years = parseArray(sch.eligibility_years).map(y => y.trim());

            const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any', 'all'];
            const yearOpenKeywords = ['open to all', 'all year levels', 'all years', 'any', 'all'];

            const isProgOpen = progs.length === 0 || progs.some(p => progOpenKeywords.includes(p.toLowerCase()));
            const isYearOpen = years.length === 0 || years.some(y => yearOpenKeywords.includes(y.toLowerCase()));

            let briefDesc = 'Open to all programs and year levels.';
            if (!isProgOpen && !isYearOpen) {
                briefDesc = 'Requires a specific degree program and year level.';
            } else if (!isProgOpen && isYearOpen) {
                briefDesc = 'Requires a specific degree program.';
            } else if (isProgOpen && !isYearOpen) {
                briefDesc = 'Requires a specific year level.';
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 8px;">
                    ${getBadgeHTML(sch.category)}
                    ${isClosed ? '<span class="sch-badge sch-badge-closed"><i data-lucide="lock" style="width:11px;height:11px;"></i> CLOSED</span>' : ''}
                </div>
                
                <div class="sch-card-header" style="${cardOpacity}">
                    <div class="card-icon">
                        <i data-lucide="graduation-cap"></i>
                    </div>
                    <div class="card-title-group">
                        <h3>${sch.title}</h3>
                        <span class="sch-brief-desc"><i data-lucide="info" style="width:12px;height:12px;flex-shrink:0;"></i> ${briefDesc}</span>
                    </div>
                </div>

                <div class="sch-card-footer" style="${cardOpacity}">
                    <div class="deadline-text">
                        Deadline: <strong class="${isClosed ? 'text-danger' : ''}" style="${isClosed ? 'text-decoration: line-through;' : ''}">${formatDate(sch.end_date)}</strong>
                        <div class="slots-pill">
                            <i data-lucide="users"></i> Slots: ${slotsText}
                        </div>
                    </div>
                    <button class="btn-action ${btnState.class}" data-action="${btnState.action}" data-id="${sch.id}" data-title="${btnState.title || ''}" data-msg="${btnState.msg}">
                        ${btnState.text}
                        <i data-lucide="${btnState.icon}"></i>
                    </button>
                </div>
            `;
            gridContainer.appendChild(card);
        });

        // Initialize Lucide icons on newly rendered cards
        if (window.lucide && window.lucide.createIcons) {
            window.lucide.createIcons();
        }
    };

    // --- 7. EVENT LISTENERS ---
    gridContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-action');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const msg = btn.getAttribute('data-msg');
        const title = btn.getAttribute('data-title') || 'Application Restricted';

        if (action === 'restricted') {
            Swal.fire({
                title: title,
                html: msg,
                icon: 'info',
                confirmButtonText: 'Understood',
                confirmButtonColor: 'var(--primary-color, #1F3D2E)'
            });
        } else if (action === 'profile') {
            Swal.fire({
                title: 'Profile Incomplete',
                html: msg,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Complete Profile',
                cancelButtonText: 'Cancel',
                confirmButtonColor: 'var(--primary-color, #1F3D2E)'
            }).then((res) => {
                if (res.isConfirmed) window.location.href = 'profile-settings.html';
            });
        } else if (action === 'view') {
            Swal.fire({
                title: 'Application Exists',
                html: msg,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'View Applications',
                cancelButtonText: 'Close',
                confirmButtonColor: 'var(--primary-color, #1F3D2E)'
            }).then((res) => {
                if (res.isConfirmed) window.location.href = 'student-applications.html';
            });
        } else if (action === 'apply') {
            window.location.href = `apply-scholarships.html?id=${id}`;
        }
    });

    // --- FILTER LOGIC (Category & Keyword Search) ---
    const applyFilters = () => {
        const searchInput = document.getElementById('search-input');
        const catSelect = document.getElementById('category-filter') || document.getElementById('side-filter-category');

        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';

        let catVal = catSelect ? catSelect.value.trim() : '';
        if (catVal.toLowerCase() === 'all categories') catVal = '';

        filteredScholarships = allScholarships.filter(sch => {
            const matchesSearch = !searchVal || 
                (sch.title || '').toLowerCase().includes(searchVal) ||
                (sch.description || '').toLowerCase().includes(searchVal);

            const matchesCat = !catVal || 
                normalizeCategory(sch.category) === normalizeCategory(catVal) || 
                sch.category === catVal;

            return matchesSearch && matchesCat;
        });

        renderCards(filteredScholarships);
    };

    const searchInputEl = document.getElementById('search-input');
    if (searchInputEl) searchInputEl.addEventListener('input', applyFilters);

    const catSelectEl = document.getElementById('category-filter') || document.getElementById('side-filter-category');
    if (catSelectEl) catSelectEl.addEventListener('change', applyFilters);

    // --- 8. PROFILE DROPDOWN & LOGOUT MODAL ---
    const profileToggle = document.getElementById('profile-dropdown-toggle');
    const profileMenu = document.getElementById('profile-menu');
    const logoutModal = document.getElementById('logout-modal');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');
    const logoutBtn = document.getElementById('dropdown-logout-btn');

    if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
            profileToggle.classList.toggle('active-state', profileMenu.classList.contains('show'));
        });

        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target) && !profileMenu.contains(e.target)) {
                profileMenu.classList.remove('show');
                profileToggle.classList.remove('active-state');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (profileMenu) profileMenu.classList.remove('show');
            if (profileToggle) profileToggle.classList.remove('active-state');
            if (logoutModal) logoutModal.style.display = 'flex';
        });
    }

    if (modalCancel && logoutModal) {
        modalCancel.addEventListener('click', (e) => {
            e.preventDefault();
            logoutModal.style.display = 'none';
        });
    }

    if (logoutModal) {
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) logoutModal.style.display = 'none';
        });
    }

    if (modalConfirm) {
        modalConfirm.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                modalConfirm.innerText = 'Logging out...';
                modalConfirm.disabled = true;
                if (window.supabaseClient && window.supabaseClient.auth) {
                    await window.supabaseClient.auth.signOut();
                }
                localStorage.removeItem('studentUser');
                sessionStorage.clear();
                window.location.replace('login-student.html');
            } catch (err) {
                console.error("Logout error:", err);
                window.location.replace('login-student.html');
            }
        });
    }

    // --- 9. START SCRIPT & INITIAL ICONS ---
    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }
    init();
});