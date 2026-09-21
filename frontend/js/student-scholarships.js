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
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                        <div class="skeleton-shimmer" style="width: 120px; height: 24px; border-radius: 12px;"></div>
                        <div class="skeleton-shimmer" style="width: 50px; height: 16px; border-radius: 6px;"></div>
                    </div>
                    <div class="sch-card-header" style="margin-bottom: 16px;">
                        <div class="card-icon skeleton-shimmer" style="width: 48px; height: 48px; border-radius: 13px; flex-shrink: 0;"></div>
                        <div class="card-title-group" style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                            <div class="skeleton-shimmer" style="width: 85%; height: 20px; border-radius: 6px;"></div>
                            <div class="skeleton-shimmer" style="width: 60%; height: 14px; border-radius: 4px;"></div>
                        </div>
                    </div>
                    <div class="sch-card-footer" style="padding-top: 16px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div class="skeleton-shimmer" style="width: 100px; height: 14px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 70px; height: 12px; border-radius: 4px;"></div>
                        </div>
                        <div class="skeleton-shimmer" style="width: 110px; height: 38px; border-radius: 9px;"></div>
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

            // Check Profile Completeness (Middle name is optional as some students don't have one)
            isProfileComplete = !!(
                profile.first_name && profile.last_name &&
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
                        .select('school_id, first_name, last_name, middle_name, program, year_level, gwa, schools(name)')
                        .eq('id_number', profile.id_number)
                        .maybeSingle();

                    if (masterlistData) {
                        if (!studentSchoolId && masterlistData.school_id) {
                            studentSchoolId = masterlistData.school_id;
                        }
                        if (masterlistData.first_name) profile.first_name = masterlistData.first_name;
                        if (masterlistData.last_name) profile.last_name = masterlistData.last_name;
                        if (masterlistData.middle_name) profile.middle_name = masterlistData.middle_name;
                        if (masterlistData.program) profile.program = masterlistData.program;
                        if (masterlistData.year_level) profile.year_level = masterlistData.year_level;
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
    const escapeHtml = (str) => {
        if (!str || typeof str !== 'string') return str || '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

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

    // --- ACADEMIC ELIGIBILITY & MATCHING HELPERS ---
    const checkProgramMatch = (rawEligibleProgs, studentProg) => {
        const rawProgs = parseArray(rawEligibleProgs);
        if (!rawProgs || rawProgs.length === 0) return { matches: true, allowedText: 'Open to All' };

        const progOpenKeywords = ['open to all', 'all programs', 'all departments', 'any', 'all', 'all courses', 'all degree programs', 'open to all courses', 'open to all programs', 'open to all departments'];
        const isProgOpen = rawProgs.some(p => progOpenKeywords.includes(p.toLowerCase().trim()));
        if (isProgOpen) return { matches: true, allowedText: 'Open to All' };

        const studentProgClean = (studentProg || '').trim();
        const allowedText = rawProgs.join(', ');
        if (!studentProgClean) {
            return {
                matches: false,
                reason: 'missing_profile',
                allowedText: allowedText
            };
        }

        const sLower = studentProgClean.toLowerCase();
        const words = studentProgClean.split(/[\s\-_/()]+/).filter(w => w.length > 0);
        const sAcronym = words.map(w => w[0].toLowerCase()).join('');

        const matches = rawProgs.some(rawP => {
            const pLower = rawP.toLowerCase().trim();
            if (pLower === sLower) return true;
            if (pLower.includes(sLower) || sLower.includes(pLower)) return true;

            const pWords = rawP.split(/[\s\-_/()]+/).filter(w => w.length > 0);
            const pAcronym = pWords.map(w => w[0].toLowerCase()).join('');
            if (pAcronym.length >= 2 && (pAcronym === sLower || pAcronym === sAcronym)) return true;
            if (sAcronym.length >= 2 && (sAcronym === pLower || sAcronym === pAcronym)) return true;

            return false;
        });

        return {
            matches: matches,
            reason: matches ? 'matched' : 'mismatch',
            allowedText: allowedText
        };
    };

    const checkYearMatch = (rawEligibleYears, studentYear) => {
        const rawYears = parseArray(rawEligibleYears);
        if (!rawYears || rawYears.length === 0) return { matches: true, allowedText: 'Open to All' };

        const yearOpenKeywords = ['open to all', 'all year levels', 'all years', 'any', 'all', 'open to all year levels'];
        const isYearOpen = rawYears.some(y => yearOpenKeywords.includes(y.toLowerCase().trim()));
        if (isYearOpen) return { matches: true, allowedText: 'Open to All' };

        const studentYearClean = (studentYear || '').trim();
        const allowedText = rawYears.join(', ');
        if (!studentYearClean) {
            return {
                matches: false,
                reason: 'missing_profile',
                allowedText: allowedText
            };
        }

        const canonicalYear = (str) => {
            const lower = (str || '').toLowerCase().trim();
            if (lower.includes('1st') || lower.includes('first') || lower.includes('grade 11') || lower.includes('freshman') || lower === '1') return '1';
            if (lower.includes('2nd') || lower.includes('second') || lower.includes('grade 12') || lower.includes('sophomore') || lower === '2') return '2';
            if (lower.includes('3rd') || lower.includes('third') || lower.includes('junior') || lower === '3') return '3';
            if (lower.includes('4th') || lower.includes('fourth') || lower.includes('senior') || lower === '4') return '4';
            if (lower.includes('5th') || lower.includes('fifth') || lower === '5') return '5';
            if (lower.includes('graduat')) return 'graduating';
            return lower;
        };

        const sCanonical = canonicalYear(studentYearClean);

        const matches = rawYears.some(rawY => {
            const yLower = rawY.toLowerCase().trim();
            if (yLower === studentYearClean.toLowerCase()) return true;
            if (yLower.includes(studentYearClean.toLowerCase()) || studentYearClean.toLowerCase().includes(yLower)) return true;

            const yCanonical = canonicalYear(rawY);
            if (yCanonical && sCanonical && yCanonical === sCanonical) return true;

            return false;
        });

        return {
            matches: matches,
            reason: matches ? 'matched' : 'mismatch',
            allowedText: allowedText
        };
    };

    const checkGwaMatch = (sch, studentGwa) => {
        const minGwa = sch.gwa_requirement || sch.min_gwa || sch.min_college_gwa || sch.min_hs_average || sch.eligibility_rules?.gwa?.minimum || sch.eligibility_gwa;
        if (!minGwa || !studentGwa) return { matches: true, requiredGwa: minGwa };

        const studentGwaNum = parseFloat(studentGwa);
        const reqGwaNum = parseFloat(minGwa);

        if (isNaN(studentGwaNum) || isNaN(reqGwaNum)) return { matches: true, requiredGwa: minGwa };

        let matches = true;
        if (reqGwaNum <= 5.0) {
            // Philippine grading scale: 1.0 is highest, 5.0 is failing. GWA must be <= requirement (e.g. 1.50 <= 1.75)
            matches = studentGwaNum <= reqGwaNum;
        } else {
            // Percentage scale: e.g. 85, 90. GWA must be >= requirement (e.g. 88 >= 85)
            matches = studentGwaNum >= reqGwaNum;
        }

        return {
            matches: matches,
            requiredGwa: minGwa,
            studentGwa: studentGwa
        };
    };

    const checkGenderMatch = (rawEligibleGender, studentGender) => {
        if (!rawEligibleGender) return { matches: true };
        const gLower = rawEligibleGender.toLowerCase().trim();
        if (!gLower || gLower === 'all' || gLower === 'any' || gLower === 'open to all' || gLower === 'both' || gLower === 'null') return { matches: true };

        const sLower = (studentGender || '').toLowerCase().trim();
        if (!sLower) return { matches: true };

        const matches = (gLower === sLower || gLower.includes(sLower) || sLower.includes(gLower));
        return {
            matches: matches,
            requiredGender: rawEligibleGender
        };
    };

    function validateEligibility(sch) {
        // 1. Availability / Dates Check
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

        // 2. Slots Capacity Check
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

        // 3. Duplicate / Existing Application for this scholarship
        const existingApp = (allUserApps || []).find(a => a.scholarship_id === sch.id);
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

        // Categorize existing student applications
        const activeGrants = (allUserApps || []).filter(a =>
            ['Approved', 'Grantee'].includes(a.status)
        );
        const pendingApps = (allUserApps || []).filter(a =>
            ['Submitted', 'Under Review', 'Pending', 'Revision', 'Evaluating', 'For Interview'].includes(a.status)
        );
        const allActiveAndPending = [...activeGrants, ...pendingApps];
        const targetCat = normalizeCategory(sch.category);

        // 4. "No Other Scholarships" Exclusivity Rule
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

        // 5. Institutional Assistance Policies Validation (school_policies)
        const isPolicyGloballyEnabled = policyData ? (policyData.global_enabled ?? true) : true;
        if (isPolicyGloballyEnabled) {
            // A. Category Quota Limits
            const appsInSameCategory = allActiveAndPending.filter(a => {
                const appCat = getAppCategory(a);
                return appCat === targetCat;
            });

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

        // 6. Strict Academic Information Alignment:
        // A. Academic Program / Course
        const studentProgram = profile?.program || profile?.course || '';
        const progMatch = checkProgramMatch(sch.eligibility_programs, studentProgram);
        if (!progMatch.matches) {
            if (progMatch.reason === 'missing_profile') {
                return {
                    text: 'Not Eligible (Program)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Program Requirement Not Met',
                    msg: 'Please update your academic program in Profile Settings to verify your eligibility for this program.'
                };
            }
            return {
                text: 'Not Eligible (Program)',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Program Requirement Not Met',
                msg: `Your profile indicates you are enrolled in <b>${escapeHtml(studentProgram)}</b>.<br><br>This educational assistance is strictly limited to students in the following program(s):<br><i>${escapeHtml(progMatch.allowedText)}</i>`
            };
        }

        // B. Academic Year Level
        const studentYear = profile?.year_level || '';
        const yearMatch = checkYearMatch(sch.eligibility_years, studentYear);
        if (!yearMatch.matches) {
            if (yearMatch.reason === 'missing_profile') {
                return {
                    text: 'Not Eligible (Year)',
                    icon: 'lock',
                    class: 'btn-disabled',
                    action: 'restricted',
                    title: 'Year Level Requirement Not Met',
                    msg: 'Please update your year level in Profile Settings to verify your eligibility for this program.'
                };
            }
            return {
                text: 'Not Eligible (Year)',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Year Level Requirement Not Met',
                msg: `Your profile indicates you are a <b>${escapeHtml(studentYear)}</b> student.<br><br>This educational assistance is strictly limited to the following year level(s):<br><i>${escapeHtml(yearMatch.allowedText)}</i>`
            };
        }

        // C. Gender Requirement
        const studentGender = profile?.gender || '';
        const genderMatch = checkGenderMatch(sch.eligibility_gender || sch.gender, studentGender);
        if (!genderMatch.matches) {
            return {
                text: 'Not Eligible (Gender)',
                icon: 'lock',
                class: 'btn-disabled',
                action: 'restricted',
                title: 'Gender Requirement Not Met',
                msg: `This educational assistance is restricted to <b>${escapeHtml(genderMatch.requiredGender)}</b> applicants.`
            };
        }

        // 7. Profile Completion Check
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

        // 8. Fully Eligible & Ready to Apply!
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
                <div class="sch-card-top-bar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 8px;">
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
            window.location.href = 'profile-settings.html';
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

    // Priority calculation function to rank active / Apply Now cards first
    const getScholarshipPriority = (sch) => {
        const btnState = validateEligibility(sch);
        const isClosed = sch.display_status === 'Closed';

        // 1. Actionable Apply: "Apply Now" or "Continue Application" -> Priority 1
        if (btnState.action === 'apply') {
            if (btnState.text === 'Apply Now') return 1;
            if (btnState.text === 'Continue Application') return 2;
            return 3;
        }

        // 2. Needs Profile Completion but Scholarship is Active -> Priority 2
        if (btnState.action === 'profile' && !isClosed) {
            return 4;
        }

        // 3. Opening Soon / Upcoming -> Priority 3
        if (sch.display_status === 'Upcoming') {
            return 5;
        }

        // 4. Already Applied / Existing application view -> Priority 4
        if (btnState.text === 'Already Applied' || btnState.action === 'view') {
            return 6;
        }

        // 5. Restricted by academic policy / program / year / GWA / slots full but not closed -> Priority 5
        if (!isClosed) {
            return 7;
        }

        // 6. Closed programs -> Lowest Priority (Bottom)
        return 8;
    };

    // --- FILTER LOGIC (Category & Keyword Search + Priority Ranking) ---
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

        // Priority sort: "Apply Now" / active scholarships first
        filteredScholarships.sort((a, b) => {
            const pA = getScholarshipPriority(a);
            const pB = getScholarshipPriority(b);
            if (pA !== pB) return pA - pB;

            // Secondary sort: creation date descending (newest programs first)
            const dateA = new Date(a.created_at || a.start_date || 0).getTime();
            const dateB = new Date(b.created_at || b.start_date || 0).getTime();
            return dateB - dateA;
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