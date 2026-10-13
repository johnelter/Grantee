const supabase = require('../supabaseClient');

/**
 * Checks whether an educational assistance program has specific educational criteria
 */
function hasEducationalCriteria(scholarship) {
    if (!scholarship) return false;
    const hasCollegeGwa = scholarship.min_college_gwa !== null && scholarship.min_college_gwa !== undefined && parseFloat(scholarship.min_college_gwa) > 0;
    const hasHsAvg = scholarship.min_hs_average !== null && scholarship.min_hs_average !== undefined && parseFloat(scholarship.min_hs_average) > 0;

    const progs = Array.isArray(scholarship.eligibility_programs)
        ? scholarship.eligibility_programs.filter(p => p && p !== 'All' && p !== 'Any' && String(p).trim().length > 0)
        : [];
    const hasProgs = progs.length > 0;

    const years = Array.isArray(scholarship.eligibility_years)
        ? scholarship.eligibility_years.filter(y => y && y !== 'All' && y !== 'Any' && String(y).trim().length > 0)
        : [];
    const hasYears = years.length > 0;

    const docs = Array.isArray(scholarship.required_documents)
        ? scholarship.required_documents.filter(d => d && String(d).trim().length > 0)
        : [];
    const hasDocs = docs.length > 0;

    return hasCollegeGwa || hasHsAvg || hasProgs || hasYears || hasDocs;
}

/**
 * Normalizes and extracts student's GWA or general grade average SOLELY from the application
 * (Uploaded documents OCR extracted_data or application form responses).
 * Does NOT pull from the student's profile settings.
 */
function extractStudentGwa(app) {
    // 1. From uploaded documents OCR extracted_data
    if (Array.isArray(app.documents)) {
        for (const doc of app.documents) {
            const ext = doc.extracted_data || {};
            // Look for Cumulative GWA, GWA, or average in OCR document data
            const possibleKeys = [
                'Cumulative GWA', 'GWA', 'gwa', 'General Average', 
                'General Weighted Average', 'Average', 'average',
                'Final Grade', 'Computed GWA'
            ];
            for (const key of possibleKeys) {
                if (ext[key] !== undefined && ext[key] !== null && !isNaN(parseFloat(ext[key]))) {
                    const parsed = parseFloat(ext[key]);
                    if (parsed > 0 && parsed <= 100) {
                        return { value: parsed, source: `Application Document OCR: ${doc.name || 'Grade Document'}` };
                    }
                }
            }
            if (Array.isArray(ext['Extracted Semesters']) && ext['Extracted Semesters'].length > 0) {
                const lastSem = ext['Extracted Semesters'][ext['Extracted Semesters'].length - 1];
                if (lastSem && lastSem.GWA !== undefined && !isNaN(parseFloat(lastSem.GWA))) {
                    const parsed = parseFloat(lastSem.GWA);
                    if (parsed > 0 && parsed <= 100) {
                        return { value: parsed, source: `Application Document OCR: ${doc.name || 'Transcript'}` };
                    }
                }
            }
        }
    }

    // 2. From application form responses (answers submitted in this application)
    if (app.form_responses && typeof app.form_responses === 'object') {
        for (const [key, val] of Object.entries(app.form_responses)) {
            const lowerKey = key.toLowerCase();
            if (
                lowerKey.includes('gwa') || 
                lowerKey.includes('general weighted average') || 
                lowerKey.includes('grade average') || 
                (lowerKey.includes('average') && !lowerKey.includes('income'))
            ) {
                const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ''));
                if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                    return { value: parsed, source: 'Application Form Response' };
                }
            }
        }
    }

    // Never fall back to profile settings - evaluation is strictly based on the application
    return { value: null, source: 'No Grade Data in Application' };
}

/**
 * Extracts student degree program & year level from application form responses first,
 * falling back to profile record if not specified on the application form.
 */
function extractProgramAndYear(app) {
    let program = '';
    let year = '';

    if (app.form_responses && typeof app.form_responses === 'object') {
        for (const [key, val] of Object.entries(app.form_responses)) {
            const lk = key.toLowerCase();
            if (!program && (lk.includes('course') || lk.includes('degree') || lk.includes('program') || lk.includes('field of study'))) {
                program = String(val).trim();
            }
            if (!year && (lk.includes('year level') || lk.includes('current year') || lk.includes('year') || lk.includes('grade level'))) {
                year = String(val).trim();
            }
        }
    }

    if (!program) {
        program = (app.profiles?.program || 'N/A').trim();
    }
    if (!year) {
        year = (app.profiles?.year_level || 'N/A').trim();
    }

    return { program, year };
}

/**
 * Evaluate single applicant against educational criteria
 */
function evaluateApplicant(app, scholarship, maxSlots) {
    const hasCriteria = hasEducationalCriteria(scholarship);
    const { program: studentProgram, year: studentYear } = extractProgramAndYear(app);
    const gwaInfo = extractStudentGwa(app);
    const studentGwa = gwaInfo.value;
    const submittedDocs = Array.isArray(app.documents) ? app.documents : [];

    const appliedDateObj = app.created_at ? new Date(app.created_at) : new Date();
    const appliedDateStr = appliedDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const appliedTimeStr = appliedDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const criteriaBreakdown = {
        academicMerit: { max: 45, score: 0, details: '', passed: true },
        programMatch: { max: 20, score: 0, details: '', passed: true },
        yearMatch: { max: 15, score: 0, details: '', passed: true },
        documentCompleteness: { max: 15, score: 0, details: '', passed: true },
        timeliness: { max: 5, score: 0, details: '', passed: true }
    };

    let isStrictlyEligible = true;
    const disqualifications = [];
    const flags = [];

    // =========================================================================
    // SCENARIO A: PROGRAM HAS NO EDUCATIONAL CRITERIA
    // (Ranked strictly by Date & Time Applied: First-Come, First-Served)
    // =========================================================================
    if (!hasCriteria) {
        criteriaBreakdown.academicMerit.score = 45;
        criteriaBreakdown.academicMerit.details = studentGwa !== null 
            ? `Application GWA: ${studentGwa.toFixed(2)} (Open Criteria / No Minimum GWA Required)`
            : 'Open Educational Criteria (No Minimum GWA Required for this program)';

        criteriaBreakdown.programMatch.score = 20;
        criteriaBreakdown.programMatch.details = studentProgram !== 'N/A' 
            ? `Open to all degree programs (${studentProgram})`
            : 'Open to all degree programs';

        criteriaBreakdown.yearMatch.score = 15;
        criteriaBreakdown.yearMatch.details = studentYear !== 'N/A' 
            ? `Open to all year levels (${studentYear})`
            : 'Open to all year levels';

        criteriaBreakdown.documentCompleteness.score = 15;
        criteriaBreakdown.documentCompleteness.details = 'No specific mandatory document upload required';

        criteriaBreakdown.timeliness.score = 5;
        criteriaBreakdown.timeliness.details = `Applied promptly on ${appliedDateStr} at ${appliedTimeStr} (First-Come, First-Served)`;

        return {
            applicant_id: app.id,
            student_id: app.student_id,
            student_number: app.profiles?.id_number || 'N/A',
            first_name: app.profiles?.first_name || '',
            middle_name: app.profiles?.middle_name || '',
            last_name: app.profiles?.last_name || '',
            full_name: `${app.profiles?.last_name || ''}, ${app.profiles?.first_name || ''} ${app.profiles?.middle_name || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Applicant',
            email: app.profiles?.email || 'N/A',
            contact_number: app.profiles?.contact_number || 'N/A',
            gender: app.profiles?.gender || 'N/A',
            program: studentProgram,
            year_level: studentYear,
            avatar_url: app.profiles?.avatar_url || null,
            current_status: app.status,
            created_at: app.created_at,
            applied_date_str: appliedDateStr,
            applied_time_str: appliedTimeStr,
            gwa: studentGwa,
            gwa_display: studentGwa !== null ? (studentGwa <= 5.0 ? studentGwa.toFixed(2) : studentGwa.toFixed(1) + '%') : 'FCFS (No Min GWA)',
            gwa_source: gwaInfo.source,
            total_score: 100,
            has_educational_criteria: false,
            is_strictly_eligible: true,
            disqualifications: [],
            flags: [],
            tier: 'qualified',
            recommendation: `Meets open criteria (Ranked by Application Date & Time: ${appliedDateStr} ${appliedTimeStr})`,
            breakdown: criteriaBreakdown,
            documents_count: submittedDocs.length,
            form_responses: app.form_responses || {}
        };
    }

    // =========================================================================
    // SCENARIO B: PROGRAM HAS SPECIFIC EDUCATIONAL CRITERIA
    // (Evaluated based on application submitted data)
    // =========================================================================

    // --- 1. ACADEMIC MERIT EVALUATION (45 Points) ---
    const minCollegeGwa = scholarship.min_college_gwa !== null && scholarship.min_college_gwa !== undefined && parseFloat(scholarship.min_college_gwa) > 0
        ? parseFloat(scholarship.min_college_gwa)
        : null;
    const minHsAvg = scholarship.min_hs_average !== null && scholarship.min_hs_average !== undefined && parseFloat(scholarship.min_hs_average) > 0
        ? parseFloat(scholarship.min_hs_average)
        : null;

    if (studentGwa !== null) {
        if (studentGwa <= 5.0) {
            // Philippine 1.0 - 5.0 scale (1.00 is highest, 5.00 failing)
            if (minCollegeGwa !== null) {
                if (studentGwa <= minCollegeGwa) {
                    const normalizedRatio = Math.max(0, 1 - ((studentGwa - 1.0) / Math.max(0.5, (minCollegeGwa - 1.0 || 1.0))));
                    const pts = 34 + (normalizedRatio * 11);
                    criteriaBreakdown.academicMerit.score = Math.min(45, Math.round(pts * 10) / 10);
                    criteriaBreakdown.academicMerit.details = `Application GWA ${studentGwa.toFixed(2)} meets criterion (<= ${minCollegeGwa.toFixed(2)}) [${gwaInfo.source}]`;
                } else {
                    isStrictlyEligible = false;
                    criteriaBreakdown.academicMerit.passed = false;
                    criteriaBreakdown.academicMerit.score = Math.max(5, Math.round((30 - (studentGwa - minCollegeGwa) * 10) * 10) / 10);
                    criteriaBreakdown.academicMerit.details = `Application GWA ${studentGwa.toFixed(2)} does not meet cutoff (<= ${minCollegeGwa.toFixed(2)})`;
                    disqualifications.push(`Application GWA (${studentGwa.toFixed(2)}) is below required threshold (<= ${minCollegeGwa.toFixed(2)})`);
                }
            } else {
                if (studentGwa <= 1.25) criteriaBreakdown.academicMerit.score = 45;
                else if (studentGwa <= 1.50) criteriaBreakdown.academicMerit.score = 42;
                else if (studentGwa <= 1.75) criteriaBreakdown.academicMerit.score = 38;
                else if (studentGwa <= 2.00) criteriaBreakdown.academicMerit.score = 34;
                else if (studentGwa <= 2.50) criteriaBreakdown.academicMerit.score = 28;
                else criteriaBreakdown.academicMerit.score = 20;
                criteriaBreakdown.academicMerit.details = `Application GWA ${studentGwa.toFixed(2)} evaluated for academic merit [${gwaInfo.source}]`;
            }
        } else {
            // Percentage 75 - 100 scale
            if (minHsAvg !== null) {
                if (studentGwa >= minHsAvg) {
                    const ratio = Math.min(1, Math.max(0, (studentGwa - minHsAvg) / (100 - minHsAvg || 10)));
                    criteriaBreakdown.academicMerit.score = Math.round((35 + ratio * 10) * 10) / 10;
                    criteriaBreakdown.academicMerit.details = `Application Average ${studentGwa.toFixed(1)}% meets criterion (>= ${minHsAvg.toFixed(1)}%) [${gwaInfo.source}]`;
                } else {
                    isStrictlyEligible = false;
                    criteriaBreakdown.academicMerit.passed = false;
                    criteriaBreakdown.academicMerit.score = 10;
                    criteriaBreakdown.academicMerit.details = `Application Average ${studentGwa.toFixed(1)}% is below cutoff (>= ${minHsAvg.toFixed(1)}%)`;
                    disqualifications.push(`Application average grade (${studentGwa.toFixed(1)}%) does not meet minimum (>= ${minHsAvg.toFixed(1)}%)`);
                }
            } else {
                if (studentGwa >= 95) criteriaBreakdown.academicMerit.score = 45;
                else if (studentGwa >= 90) criteriaBreakdown.academicMerit.score = 41;
                else if (studentGwa >= 85) criteriaBreakdown.academicMerit.score = 36;
                else criteriaBreakdown.academicMerit.score = 28;
                criteriaBreakdown.academicMerit.details = `Application Average ${studentGwa.toFixed(1)}% evaluated for academic merit [${gwaInfo.source}]`;
            }
        }
    } else {
        if (minCollegeGwa !== null || minHsAvg !== null) {
            criteriaBreakdown.academicMerit.score = 20;
            criteriaBreakdown.academicMerit.passed = false;
            criteriaBreakdown.academicMerit.details = 'No verified grade attached in application (Requires grade document/OCR)';
            flags.push('Missing verified grade document on application');
        } else {
            criteriaBreakdown.academicMerit.score = 35;
            criteriaBreakdown.academicMerit.details = 'Open academic criterion / No specific grade required';
        }
    }

    // --- 2. PROGRAM / DEGREE ALIGNMENT (20 Points) ---
    const eligiblePrograms = Array.isArray(scholarship.eligibility_programs)
        ? scholarship.eligibility_programs.filter(p => p && p !== 'All' && p !== 'Any' && String(p).trim().length > 0)
        : [];

    if (eligiblePrograms.length === 0) {
        criteriaBreakdown.programMatch.score = 20;
        criteriaBreakdown.programMatch.details = studentProgram !== 'N/A' 
            ? `Open to all degree programs (${studentProgram})` 
            : 'Open to all degree programs';
    } else {
        const matchesProgram = eligiblePrograms.some(p => {
            const cleanP = p.trim().toLowerCase();
            const cleanStud = studentProgram.toLowerCase();
            return cleanStud.includes(cleanP) || cleanP.includes(cleanStud);
        });

        if (matchesProgram) {
            criteriaBreakdown.programMatch.score = 20;
            criteriaBreakdown.programMatch.details = `Matches eligible degree: ${studentProgram}`;
        } else {
            criteriaBreakdown.programMatch.score = 0;
            criteriaBreakdown.programMatch.passed = false;
            isStrictlyEligible = false;
            criteriaBreakdown.programMatch.details = `Course '${studentProgram}' not in target programs`;
            disqualifications.push(`Degree program (${studentProgram}) does not match target courses`);
        }
    }

    // --- 3. YEAR LEVEL ALIGNMENT (15 Points) ---
    const eligibleYears = Array.isArray(scholarship.eligibility_years)
        ? scholarship.eligibility_years.filter(y => y && y !== 'All' && y !== 'Any' && String(y).trim().length > 0)
        : [];

    if (eligibleYears.length === 0) {
        criteriaBreakdown.yearMatch.score = 15;
        criteriaBreakdown.yearMatch.details = studentYear !== 'N/A' 
            ? `Open to all year levels (${studentYear})` 
            : 'Open to all year levels';
    } else {
        const matchesYear = eligibleYears.some(y => {
            const cleanY = y.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanStudY = studentYear.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanStudY.includes(cleanY) || cleanY.includes(cleanStudY);
        });

        if (matchesYear) {
            criteriaBreakdown.yearMatch.score = 15;
            criteriaBreakdown.yearMatch.details = `Matches eligible year level: ${studentYear}`;
        } else {
            criteriaBreakdown.yearMatch.score = 0;
            criteriaBreakdown.yearMatch.passed = false;
            isStrictlyEligible = false;
            criteriaBreakdown.yearMatch.details = `Year level '${studentYear}' not in target levels`;
            disqualifications.push(`Year level (${studentYear}) does not match eligible cohorts`);
        }
    }

    // --- 4. DOCUMENT COMPLETENESS & AI OCR VERIFICATION (15 Points) ---
    const requiredDocs = Array.isArray(scholarship.required_documents)
        ? scholarship.required_documents.filter(d => d && String(d).trim().length > 0)
        : [];

    if (requiredDocs.length === 0) {
        criteriaBreakdown.documentCompleteness.score = 15;
        criteriaBreakdown.documentCompleteness.details = 'No specific mandatory document upload required';
    } else {
        let attachedRequiredCount = 0;
        let ocrVerifiedCount = 0;

        requiredDocs.forEach(reqName => {
            const cleanReq = reqName.toLowerCase().trim();
            const found = submittedDocs.find(d => (d.name || '').toLowerCase().trim().includes(cleanReq) || cleanReq.includes((d.name || '').toLowerCase().trim()));
            if (found && (found.file_url || found.url)) {
                attachedRequiredCount++;
                if (found.extracted_data && Object.keys(found.extracted_data).length > 0) {
                    ocrVerifiedCount++;
                }
            }
        });

        const docRatio = attachedRequiredCount / requiredDocs.length;
        let docPts = docRatio * 12;
        if (ocrVerifiedCount > 0) {
            docPts += Math.min(3, (ocrVerifiedCount / requiredDocs.length) * 3);
        }

        criteriaBreakdown.documentCompleteness.score = Math.round(docPts * 10) / 10;
        criteriaBreakdown.documentCompleteness.details = `${attachedRequiredCount} of ${requiredDocs.length} required documents attached (${ocrVerifiedCount} AI verified)`;

        if (docRatio < 1.0) {
            flags.push(`Missing ${requiredDocs.length - attachedRequiredCount} required documents`);
            if (docRatio < 0.5) {
                criteriaBreakdown.documentCompleteness.passed = false;
            }
        }
    }

    // --- 5. SUBMISSION TIMELINESS & READINESS (5 Points) ---
    if (app.created_at && scholarship.start_date && scholarship.end_date) {
        const start = new Date(scholarship.start_date).getTime();
        const end = new Date(scholarship.end_date).getTime();
        const applied = new Date(app.created_at).getTime();
        const windowDuration = Math.max(1, end - start);
        const elapsed = Math.max(0, applied - start);
        const timeRatio = Math.min(1, elapsed / windowDuration);
        const timePts = 5.0 - (timeRatio * 2.0);
        criteriaBreakdown.timeliness.score = Math.max(2.5, Math.round(timePts * 10) / 10);
        criteriaBreakdown.timeliness.details = `Applied promptly on ${appliedDateStr} at ${appliedTimeStr}`;
    } else {
        criteriaBreakdown.timeliness.score = 5.0;
        criteriaBreakdown.timeliness.details = `Application received on ${appliedDateStr} at ${appliedTimeStr}`;
    }

    const totalScore = Math.min(100, Math.max(0, Math.round((
        criteriaBreakdown.academicMerit.score +
        criteriaBreakdown.programMatch.score +
        criteriaBreakdown.yearMatch.score +
        criteriaBreakdown.documentCompleteness.score +
        criteriaBreakdown.timeliness.score
    ) * 10) / 10));

    let tier = 'qualified';
    let recommendation = '';

    if (!isStrictlyEligible) {
        tier = 'ineligible';
        recommendation = 'Does not satisfy mandatory educational criteria';
    } else if (flags.length > 0 && flags.some(f => f.includes('Missing'))) {
        tier = 'conditional';
        recommendation = 'Conditional candidate (Pending required document upload)';
    } else {
        tier = 'qualified';
        recommendation = 'Meets all educational assistance criteria';
    }

    return {
        applicant_id: app.id,
        student_id: app.student_id,
        student_number: app.profiles?.id_number || 'N/A',
        first_name: app.profiles?.first_name || '',
        middle_name: app.profiles?.middle_name || '',
        last_name: app.profiles?.last_name || '',
        full_name: `${app.profiles?.last_name || ''}, ${app.profiles?.first_name || ''} ${app.profiles?.middle_name || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Applicant',
        email: app.profiles?.email || 'N/A',
        contact_number: app.profiles?.contact_number || 'N/A',
        gender: app.profiles?.gender || 'N/A',
        program: studentProgram,
        year_level: studentYear,
        avatar_url: app.profiles?.avatar_url || null,
        current_status: app.status,
        created_at: app.created_at,
        applied_date_str: appliedDateStr,
        applied_time_str: appliedTimeStr,
        gwa: studentGwa,
        gwa_display: studentGwa !== null ? (studentGwa <= 5.0 ? studentGwa.toFixed(2) : studentGwa.toFixed(1) + '%') : 'No App Grade',
        gwa_source: gwaInfo.source,
        total_score: totalScore,
        has_educational_criteria: true,
        is_strictly_eligible: isStrictlyEligible,
        disqualifications,
        flags,
        tier,
        recommendation,
        breakdown: criteriaBreakdown,
        documents_count: submittedDocs.length,
        form_responses: app.form_responses || {}
    };
}

/**
 * Controller: Generate Ranked Shortlist for a Scholarship
 */
const getRankedShortlist = async (req, res) => {
    const { scholarshipId } = req.params;

    if (!scholarshipId) {
        return res.status(400).json({ success: false, error: 'scholarshipId parameter is required.' });
    }

    try {
        // 1. Fetch Scholarship Details & Criteria
        const { data: scholarship, error: schError } = await supabase
            .from('scholarships')
            .select('*')
            .eq('id', scholarshipId)
            .single();

        if (schError || !scholarship) {
            return res.status(404).json({ success: false, error: 'Scholarship program not found.' });
        }

        // 2. Fetch All Applications with Profiles
        const { data: applications, error: appsError } = await supabase
            .from('applications')
            .select('id, student_id, scholarship_id, status, created_at, documents, form_responses, profiles:student_id ( id_number, first_name, middle_name, last_name, email, contact_number, program, year_level, gender, avatar_url, gwa )')
            .eq('scholarship_id', scholarshipId)
            .order('created_at', { ascending: true });

        if (appsError) {
            return res.status(500).json({ success: false, error: appsError.message });
        }

        const allApps = applications || [];
        const isPending = (status) => {
            const s = (status || '').toString().trim().toLowerCase();
            return s === 'pending' || s === 'under review' || s === 'submitted' || s === 'review';
        };

        const totalApproved = allApps.filter(a => {
            const s = (a.status || '').toString().trim().toLowerCase();
            return s === 'approved' || s === 'grantee' || s === 'passed';
        }).length;

        // Only the pending applicants will be ranked
        const pendingApps = allApps.filter(a => isPending(a.status));
        const rawSlots = scholarship.slots === 'Open' || !scholarship.slots ? 999999 : parseInt(scholarship.slots, 10) || 0;
        const availableSlots = rawSlots === 999999 ? 999999 : Math.max(0, rawSlots - totalApproved);
        const hasCriteria = hasEducationalCriteria(scholarship);

        // 3. Evaluate each pending applicant
        const evaluatedCandidates = pendingApps.map(app => evaluateApplicant(app, scholarship, availableSlots));

        // 4. Sort and Rank candidates
        if (!hasCriteria) {
            // === SCENARIO 1: NO EDUCATIONAL CRITERIA ===
            // Rank strictly based on Date and Time Applied (Earliest applicant is Rank 1)
            evaluatedCandidates.sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return String(a.applicant_id).localeCompare(String(b.applicant_id));
            });
        } else {
            // === SCENARIO 2: HAS EDUCATIONAL CRITERIA ===
            // Sorting precedence:
            // a. Strict eligibility (Eligible > Ineligible)
            // b. Total Score (Highest to lowest)
            // c. Date and Time Applied (Earliest first for tie-breaker)
            evaluatedCandidates.sort((a, b) => {
                if (a.is_strictly_eligible !== b.is_strictly_eligible) {
                    return a.is_strictly_eligible ? -1 : 1;
                }
                if (b.total_score !== a.total_score) {
                    return b.total_score - a.total_score;
                }
                if (a.gwa !== null && b.gwa !== null) {
                    if (a.gwa <= 5.0 && b.gwa <= 5.0) {
                        return a.gwa - b.gwa;
                    }
                    return b.gwa - a.gwa;
                }
                if (a.gwa !== null && b.gwa === null) return -1;
                if (a.gwa === null && b.gwa !== null) return 1;

                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
        }

        // 5. Calculate 75% Shortlist Cutoff & Assign Ranks and Slot Recommendations
        // In accordance with shortlist policy, the ranked shortlist includes the top 75% of the pending applicant population.
        const totalPending = evaluatedCandidates.length;
        const shortlistCutoffCount = totalPending > 0 ? Math.max(1, Math.ceil(totalPending * 0.75)) : 0;

        let slottedCount = 0;
        evaluatedCandidates.forEach((candidate, idx) => {
            candidate.rank = idx + 1;
            candidate.is_shortlisted = idx < shortlistCutoffCount;
            candidate.shortlist_cutoff_rank = shortlistCutoffCount;
            candidate.total_pending = totalPending;
            candidate.shortlist_percentage = 75;

            if (candidate.is_shortlisted) {
                if (candidate.is_strictly_eligible && candidate.tier !== 'ineligible') {
                    if (slottedCount < availableSlots) {
                        slottedCount++;
                        candidate.tier = 'slotted';
                        candidate.is_slotted = true;
                        if (!hasCriteria) {
                            candidate.recommendation = `Grantee Slot Reserved (Rank #${candidate.rank} of ${rawSlots === 999999 ? 'Open' : availableSlots} available slots - Applied First-Come, First-Served on ${candidate.applied_date_str} at ${candidate.applied_time_str})`;
                        } else {
                            candidate.recommendation = `Grantee Slot Reserved (Rank #${candidate.rank} of ${rawSlots === 999999 ? 'Open' : availableSlots} available slots - Score: ${candidate.total_score}%)`;
                        }
                    } else {
                        candidate.tier = 'qualified';
                        candidate.is_slotted = false;
                        const queuePos = slottedCount - availableSlots + 1;
                        if (!hasCriteria) {
                            candidate.recommendation = `Priority Runner-Up (Rank #${candidate.rank}, Queue #${queuePos} - Applied First-Come, First-Served on ${candidate.applied_date_str} at ${candidate.applied_time_str})`;
                        } else {
                            candidate.recommendation = `Priority Runner-Up (Rank #${candidate.rank}, Queue Position #${queuePos})`;
                        }
                    }
                } else {
                    candidate.is_slotted = false;
                }
            } else {
                // Beyond the 75% Shortlist Cutoff
                candidate.tier = 'cutoff';
                candidate.is_slotted = false;
                candidate.recommendation = `Below 75% Cutoff (Rank #${candidate.rank} of ${totalPending} pending applicants - Fell outside the top 75% shortlist threshold of ${shortlistCutoffCount} candidates)`;
            }
        });

        // 6. Partition into Shortlisted (Top 75%) and Unshortlisted
        const shortlistedCandidates = evaluatedCandidates.filter(c => c.is_shortlisted);
        const unshortlistedCandidates = evaluatedCandidates.filter(c => !c.is_shortlisted);

        // 7. Calculate Summary Metrics for Providers and Coordinators
        const qualifiedCount = shortlistedCandidates.filter(c => c.is_strictly_eligible).length;
        const slottedCandidates = shortlistedCandidates.filter(c => c.is_slotted);
        const topShortlistCount = slottedCandidates.length;

        const gwaSum = slottedCandidates.filter(c => c.gwa !== null && c.gwa <= 5.0).reduce((acc, c) => acc + c.gwa, 0);
        const gwaCount = slottedCandidates.filter(c => c.gwa !== null && c.gwa <= 5.0).length;
        const avgSlottedGwa = gwaCount > 0 ? (gwaSum / gwaCount).toFixed(2) : null;

        const cutoffCandidate = shortlistedCandidates[shortlistedCandidates.length - 1];
        const cutoffScore = cutoffCandidate ? cutoffCandidate.total_score : (evaluatedCandidates[0] ? evaluatedCandidates[0].total_score : 100);

        return res.status(200).json({
            success: true,
            has_educational_criteria: hasCriteria,
            ranking_method: hasCriteria ? 'Merit-Based Criteria' : 'Date and Time Applied (First-Come, First-Served)',
            scholarship: {
                id: scholarship.id,
                title: scholarship.title,
                category: scholarship.category || 'Educational Assistance',
                department: scholarship.department || 'General Administration',
                batch: scholarship.batch || null,
                semester: scholarship.semester || null,
                school_year: scholarship.school_year || null,
                slots: scholarship.slots,
                available_slots: scholarship.available_slots,
                min_college_gwa: scholarship.min_college_gwa,
                min_hs_average: scholarship.min_hs_average,
                eligibility_programs: scholarship.eligibility_programs || [],
                eligibility_years: scholarship.eligibility_years || [],
                required_documents: scholarship.required_documents || []
            },
            summary: {
                total_evaluated: evaluatedCandidates.length,
                total_pending: totalPending,
                shortlist_quota: shortlistCutoffCount,
                shortlist_percentage: 75,
                total_shortlisted: shortlistedCandidates.length,
                unshortlisted_count: unshortlistedCandidates.length,
                total_slots: scholarship.slots === 'Open' ? 'Open' : rawSlots,
                available_slots: rawSlots === 999999 ? 'Open' : availableSlots,
                already_approved: totalApproved,
                qualified_candidates: qualifiedCount,
                slotted_grantees: topShortlistCount,
                runners_up: Math.max(0, qualifiedCount - topShortlistCount),
                average_shortlist_gwa: avgSlottedGwa,
                shortlist_cutoff_score: cutoffScore,
                shortlist_cutoff_rank: shortlistCutoffCount,
                has_educational_criteria: hasCriteria,
                ranking_method: hasCriteria ? 'Educational Criteria Scoring (100 Pts)' : 'Date & Time Applied (First-Come, First-Served)'
            },
            shortlist: shortlistedCandidates,
            all_evaluated: evaluatedCandidates
        });

    } catch (err) {
        console.error("Shortlist Generation Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getRankedShortlist,
    evaluateApplicant,
    extractStudentGwa,
    hasEducationalCriteria
};
