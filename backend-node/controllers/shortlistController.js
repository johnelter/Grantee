const supabase = require('../supabaseClient');

/**
 * Safely parses array data whether stored as a JSON array, JSON string, or comma-separated string
 */
function parseArrayField(val) {
    if (!val || val === 'null' || val === '[]') return [];
    if (Array.isArray(val)) return val.map(s => typeof s === 'string' ? s.trim() : s).filter(Boolean);
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(s => typeof s === 'string' ? s.trim() : s).filter(Boolean);
            } catch (e) {}
        }
        return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

/**
 * Extracts required documents list combining required_documents and document_configurations
 */
function extractRequiredDocuments(scholarship) {
    if (!scholarship) return [];
    let docs = parseArrayField(scholarship.required_documents);
    if (docs.length === 0 && scholarship.document_configurations) {
        let configs = scholarship.document_configurations;
        if (typeof configs === 'string') {
            try { configs = JSON.parse(configs); } catch(e) { configs = []; }
        }
        if (Array.isArray(configs)) {
            docs = configs.map(c => typeof c === 'string' ? c : (c.name || c.document_type || c.type || '')).filter(Boolean);
        }
    }
    return docs;
}

/**
 * Checks whether an educational assistance program has specific educational criteria configured
 */
function hasEducationalCriteria(scholarship) {
    if (!scholarship) return false;
    const hasCollegeGwa = (scholarship.min_college_gwa !== null && scholarship.min_college_gwa !== undefined && parseFloat(scholarship.min_college_gwa) > 0) ||
                          (scholarship.min_gwa !== null && scholarship.min_gwa !== undefined && parseFloat(scholarship.min_gwa) > 0);
    const hasHsAvg = scholarship.min_hs_average !== null && scholarship.min_hs_average !== undefined && parseFloat(scholarship.min_hs_average) > 0;
    const hasCollegeSubject = scholarship.min_college_subject_grade !== null && scholarship.min_college_subject_grade !== undefined && parseFloat(scholarship.min_college_subject_grade) > 0;
    const hasHsSubject = scholarship.min_hs_subject_grade !== null && scholarship.min_hs_subject_grade !== undefined && parseFloat(scholarship.min_hs_subject_grade) > 0;

    const progs = parseArrayField(scholarship.eligibility_programs).filter(p => p !== 'All' && p !== 'Any');
    const hasProgs = progs.length > 0;

    const years = parseArrayField(scholarship.eligibility_years).filter(y => y !== 'All' && y !== 'Any');
    const hasYears = years.length > 0;

    const docs = extractRequiredDocuments(scholarship);
    const hasDocs = docs.length > 0;

    return hasCollegeGwa || hasHsAvg || hasCollegeSubject || hasHsSubject || hasProgs || hasYears || hasDocs;
}

/**
 * Normalizes and extracts student's GWA or general grade average
 * Prioritizes:
 * 1. Uploaded documents OCR extracted_data (primary verified source)
 * 2. Application form responses
 * 3. Enrolled masterlist / student profile official GWA
 */
function extractStudentGwa(app) {
    // 1. From uploaded documents OCR extracted_data
    if (Array.isArray(app.documents)) {
        for (const doc of app.documents) {
            const ext = doc.extracted_data || {};
            const possibleKeys = [
                'Cumulative GWA', 'GWA', 'gwa', 'General Average', 
                'General Weighted Average', 'Average', 'average',
                'Final Grade', 'Computed GWA', 'Grade Average'
            ];
            for (const key of possibleKeys) {
                if (ext[key] !== undefined && ext[key] !== null) {
                    const parsed = parseFloat(String(ext[key]).replace(/[^0-9.]/g, ''));
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                        return { value: parsed, source: `Document OCR: ${doc.name || doc.document_type || 'Grade Document'}` };
                    }
                }
            }
            if (Array.isArray(ext['Extracted Semesters']) && ext['Extracted Semesters'].length > 0) {
                const lastSem = ext['Extracted Semesters'][ext['Extracted Semesters'].length - 1];
                if (lastSem && lastSem.GWA !== undefined) {
                    const parsed = parseFloat(String(lastSem.GWA).replace(/[^0-9.]/g, ''));
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
                        return { value: parsed, source: `Document OCR: ${doc.name || doc.document_type || 'Transcript'}` };
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

    // 3. Fallback to student profile / enrolled masterlist record
    const profileGwa = app.profiles?.gwa || app.gwa;
    if (profileGwa !== undefined && profileGwa !== null) {
        const parsed = parseFloat(String(profileGwa).replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
            return { value: parsed, source: 'Enrolled Masterlist / Student Profile' };
        }
    }

    return { value: null, source: 'Pending Official Grade Verification' };
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
        program = (app.profiles?.program || app.program || 'N/A').trim();
    }
    if (!year) {
        year = (app.profiles?.year_level || app.year_level || 'N/A').trim();
    }

    return { program, year };
}

/**
 * Evaluate single applicant against educational criteria using 100-point scoring model
 * or order strictly by date submitted if no educational criteria are configured
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
    // SCENARIO A: PROGRAM HAS NO EDUCATIONAL CRITERIA CONFIGURED
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
            recommendation: `Meets open criteria (Ordered by Application Date & Time: ${appliedDateStr} ${appliedTimeStr})`,
            breakdown: criteriaBreakdown,
            documents_count: submittedDocs.length,
            form_responses: app.form_responses || {}
        };
    }

    // =========================================================================
    // SCENARIO B: PROGRAM HAS SPECIFIC EDUCATIONAL CRITERIA CONFIGURED
    // (Evaluated using the 100-Point Scoring Model)
    // =========================================================================

    // --- 1. ACADEMIC PERFORMANCE & MERIT (45 Points) ---
    const minCollegeGwa = (scholarship.min_college_gwa !== null && scholarship.min_college_gwa !== undefined && parseFloat(scholarship.min_college_gwa) > 0)
        ? parseFloat(scholarship.min_college_gwa)
        : (scholarship.min_gwa !== null && scholarship.min_gwa !== undefined && parseFloat(scholarship.min_gwa) > 0 ? parseFloat(scholarship.min_gwa) : null);
    const minHsAvg = scholarship.min_hs_average !== null && scholarship.min_hs_average !== undefined && parseFloat(scholarship.min_hs_average) > 0
        ? parseFloat(scholarship.min_hs_average)
        : null;

    if (studentGwa !== null) {
        if (studentGwa <= 5.0) {
            // Philippine 1.0 - 5.0 scale (1.00 is highest honors, 5.00 failing)
            if (minCollegeGwa !== null) {
                if (studentGwa <= minCollegeGwa) {
                    const normalizedRatio = Math.max(0, 1 - ((studentGwa - 1.0) / Math.max(0.5, (minCollegeGwa - 1.0 || 1.0))));
                    const pts = 35 + (normalizedRatio * 10);
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
                    const ratio = Math.min(1, Math.max(0, (studentGwa - minHsAvg) / Math.max(5, (100 - minHsAvg))));
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
            criteriaBreakdown.academicMerit.details = 'No verified grade attached in application (Requires official grade document/OCR)';
            flags.push('Missing verified grade document on application');
        } else {
            criteriaBreakdown.academicMerit.score = 35;
            criteriaBreakdown.academicMerit.details = 'Open academic criterion / No specific grade required';
        }
    }

    // --- 2. DEGREE PROGRAM ALIGNMENT (20 Points) ---
    const eligiblePrograms = parseArrayField(scholarship.eligibility_programs).filter(p => p !== 'All' && p !== 'Any');

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

    // --- 3. YEAR-LEVEL ALIGNMENT (15 Points) ---
    const eligibleYears = parseArrayField(scholarship.eligibility_years).filter(y => y !== 'All' && y !== 'Any');

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

    // --- 4. DOCUMENT COMPLETENESS & AI-ASSISTED DOCUMENT PROCESSING (15 Points) ---
    const requiredDocs = extractRequiredDocuments(scholarship);

    if (requiredDocs.length === 0) {
        criteriaBreakdown.documentCompleteness.score = 15;
        criteriaBreakdown.documentCompleteness.details = 'No specific mandatory document upload required';
    } else {
        let attachedRequiredCount = 0;
        let ocrVerifiedCount = 0;

        requiredDocs.forEach(reqName => {
            const cleanReq = reqName.toLowerCase().trim();
            const found = submittedDocs.find(d => {
                const docName = (d.name || d.document_type || d.type || '').toLowerCase().trim();
                return docName.includes(cleanReq) || cleanReq.includes(docName);
            });
            if (found && (found.file_url || found.url || found.path || found.file_name || found.extracted_data || found.ocr_status)) {
                attachedRequiredCount++;
                if (
                    (found.extracted_data && Object.keys(found.extracted_data).length > 0) ||
                    found.meets_eligibility === true ||
                    found.is_valid_source === true ||
                    found.ocr_status === 'completed' ||
                    found.ocr_status === 'verified'
                ) {
                    ocrVerifiedCount++;
                }
            }
        });

        // Completeness: up to 10 points
        const completenessRatio = attachedRequiredCount / requiredDocs.length;
        const completenessScore = completenessRatio * 10;

        // AI-Assisted Document Processing: up to 5 points
        const aiProcessedRatio = ocrVerifiedCount / requiredDocs.length;
        const aiProcessedScore = aiProcessedRatio * 5;

        const totalDocScore = Math.min(15, Math.round((completenessScore + aiProcessedScore) * 10) / 10);
        criteriaBreakdown.documentCompleteness.score = totalDocScore;
        criteriaBreakdown.documentCompleteness.details = `${attachedRequiredCount} of ${requiredDocs.length} mandatory documents submitted (${ocrVerifiedCount} verified via AI OCR) • Completeness: ${completenessScore.toFixed(1)}/10 pts, AI Processing: ${aiProcessedScore.toFixed(1)}/5 pts`;

        if (completenessRatio < 1.0) {
            flags.push(`Missing ${requiredDocs.length - attachedRequiredCount} required documents`);
            if (completenessRatio < 0.5) {
                criteriaBreakdown.documentCompleteness.passed = false;
            }
        }
    }

    // --- 5. APPLICATION SUBMISSION TIMELINESS (5 Points) ---
    if (app.created_at && scholarship.start_date && scholarship.end_date) {
        const start = new Date(scholarship.start_date).getTime();
        const end = new Date(scholarship.end_date).getTime();
        const applied = new Date(app.created_at).getTime();
        const windowDuration = Math.max(1, end - start);
        const elapsed = Math.max(0, applied - start);
        const timeRatio = Math.min(1, elapsed / windowDuration);
        const timePts = 5.0 - (timeRatio * 1.5);
        criteriaBreakdown.timeliness.score = Math.max(3.0, Math.min(5.0, Math.round(timePts * 10) / 10));
        criteriaBreakdown.timeliness.details = `Applied promptly on ${appliedDateStr} at ${appliedTimeStr} (${timeRatio <= 0.3 ? 'Early Applicant' : 'On-Time Submission'})`;
    } else {
        criteriaBreakdown.timeliness.score = 5.0;
        criteriaBreakdown.timeliness.details = `Application received on ${appliedDateStr} at ${appliedTimeStr} (On-Time Submission)`;
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
            // === SCENARIO 1: NO EDUCATIONAL CRITERIA CONFIGURED ===
            // Pure First-Come, First-Served: Rank strictly based on Date and Time Applied (Earliest applicant is Rank 1)
            evaluatedCandidates.sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return String(a.applicant_id).localeCompare(String(b.applicant_id));
            });
        } else {
            // === SCENARIO 2: HAS EDUCATIONAL CRITERIA CONFIGURED ===
            // Multi-dimensional merit ranking hierarchy:
            // 1. Strict Eligibility (Eligible candidates rank above Ineligible/Disqualified)
            // 2. Total 100-Point Score (Descending: highest score first)
            // 3. Tie-Breaker A: Academic Merit / GWA (Lower GWA in 1.0-5.0 is better; Higher in 75-100% is better)
            // 4. Tie-Breaker B: Degree Program Alignment Score (20 pts > 12 pts > 0)
            // 5. Tie-Breaker C: Document Completeness & AI OCR Processing Score (15 pts > 10 pts > 0)
            // 6. Tie-Breaker D: Application Submission Timestamp (Earliest applicant breaks ties)
            // 7. Stable tie-breaker: Deterministic applicant ID comparison
            evaluatedCandidates.sort((a, b) => {
                // Tier 1: Strict Eligibility
                if (a.is_strictly_eligible !== b.is_strictly_eligible) {
                    return a.is_strictly_eligible ? -1 : 1;
                }
                // Tier 2: Total 100-Point Score
                if (Math.abs(b.total_score - a.total_score) > 0.01) {
                    return b.total_score - a.total_score;
                }
                // Tier 3: Academic Merit (GWA)
                if (a.gwa !== null && b.gwa !== null && Math.abs(a.gwa - b.gwa) > 0.001) {
                    if (a.gwa <= 5.0 && b.gwa <= 5.0) {
                        return a.gwa - b.gwa; // Lower GWA is superior (e.g. 1.10 beats 1.25)
                    }
                    return b.gwa - a.gwa; // Higher percentage is superior (e.g. 96% beats 90%)
                }
                if (a.gwa !== null && b.gwa === null) return -1;
                if (a.gwa === null && b.gwa !== null) return 1;

                // Tier 4: Degree Program Alignment Score
                const progA = a.breakdown?.programMatch?.score || 0;
                const progB = b.breakdown?.programMatch?.score || 0;
                if (Math.abs(progB - progA) > 0.01) {
                    return progB - progA;
                }

                // Tier 5: Document Completeness & AI-Assisted OCR Verification
                const docA = a.breakdown?.documentCompleteness?.score || 0;
                const docB = b.breakdown?.documentCompleteness?.score || 0;
                if (Math.abs(docB - docA) > 0.01) {
                    return docB - docA;
                }

                // Tier 6: Submission Timeliness / Chronological Application Time
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                if (timeA !== timeB) return timeA - timeB;

                // Tier 7: Deterministic ID comparison
                return String(a.applicant_id).localeCompare(String(b.applicant_id));
            });
        }

        // 5. Assign Exact Ranks and Allocate Available Grantee Slots
        const totalPending = evaluatedCandidates.length;
        let slottedCount = 0;

        evaluatedCandidates.forEach((candidate, idx) => {
            candidate.rank = idx + 1;
            candidate.is_shortlisted = true; // All evaluated candidates are properly ranked
            candidate.total_pending = totalPending;

            if (candidate.is_strictly_eligible && candidate.tier !== 'ineligible') {
                if (slottedCount < availableSlots) {
                    slottedCount++;
                    candidate.tier = 'slotted';
                    candidate.is_slotted = true;
                    if (!hasCriteria) {
                        candidate.recommendation = `Grantee Slot Allocated (Rank #${candidate.rank} of ${rawSlots === 999999 ? 'Open' : availableSlots} available slots - Applied First-Come, First-Served on ${candidate.applied_date_str} at ${candidate.applied_time_str})`;
                    } else {
                        candidate.recommendation = `Grantee Slot Allocated (Rank #${candidate.rank} of ${rawSlots === 999999 ? 'Open' : availableSlots} available slots - Qualification Score: ${candidate.total_score}%)`;
                    }
                } else {
                    candidate.tier = 'qualified';
                    candidate.is_slotted = false;
                    const queuePos = (idx + 1) - slottedCount;
                    if (!hasCriteria) {
                        candidate.recommendation = `Qualified Runner-Up (Rank #${candidate.rank}, Queue Position #${queuePos} - Applied on ${candidate.applied_date_str} at ${candidate.applied_time_str})`;
                    } else {
                        candidate.recommendation = `Qualified Runner-Up (Rank #${candidate.rank}, Queue Position #${queuePos} - Meets all criteria, queued for next open slot)`;
                    }
                }
            } else if (candidate.tier === 'conditional') {
                candidate.is_slotted = false;
                candidate.recommendation = `Conditional Candidate (Rank #${candidate.rank} - Requires document review and verification)`;
            } else {
                candidate.tier = 'ineligible';
                candidate.is_slotted = false;
                const reason = (candidate.disqualifications && candidate.disqualifications.length > 0)
                    ? candidate.disqualifications.join('; ')
                    : 'Does not satisfy mandatory educational criteria';
                candidate.recommendation = `Ineligible (Rank #${candidate.rank} - ${reason})`;
            }
        });

        // 6. Summary Metrics for Sponsoring Providers and Coordinators
        const qualifiedCount = evaluatedCandidates.filter(c => c.is_strictly_eligible).length;
        const slottedCandidates = evaluatedCandidates.filter(c => c.is_slotted);
        const topShortlistCount = slottedCandidates.length;

        const gwaSum = slottedCandidates.filter(c => c.gwa !== null && c.gwa <= 5.0).reduce((acc, c) => acc + c.gwa, 0);
        const gwaCount = slottedCandidates.filter(c => c.gwa !== null && c.gwa <= 5.0).length;
        const avgSlottedGwa = gwaCount > 0 ? (gwaSum / gwaCount).toFixed(2) : null;

        return res.status(200).json({
            success: true,
            has_educational_criteria: hasCriteria,
            ranking_method: hasCriteria ? '100-Point Educational Criteria Scoring Model' : 'Date & Time Applied (First-Come, First-Served)',
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
                total_ranked: evaluatedCandidates.length,
                total_slots: scholarship.slots === 'Open' ? 'Open' : rawSlots,
                available_slots: rawSlots === 999999 ? 'Open' : availableSlots,
                already_approved: totalApproved,
                qualified_candidates: qualifiedCount,
                slotted_grantees: topShortlistCount,
                runners_up: Math.max(0, qualifiedCount - topShortlistCount),
                conditional_count: evaluatedCandidates.filter(c => c.tier === 'conditional').length,
                ineligible_count: evaluatedCandidates.filter(c => c.tier === 'ineligible').length,
                average_slotted_gwa: avgSlottedGwa,
                has_educational_criteria: hasCriteria,
                ranking_method: hasCriteria ? '100-Point Educational Criteria Scoring Model' : 'Date & Time Applied (First-Come, First-Served)'
            },
            shortlist: evaluatedCandidates,
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
    extractProgramAndYear,
    hasEducationalCriteria,
    parseArrayField,
    extractRequiredDocuments
};
