const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require('./supabaseClient');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// In-memory student context cache (30s TTL) to accelerate multi-turn conversation
const studentContextCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

/**
 * Normalizes assistance category names to canonical format
 */
function normalizeCategory(cat) {
    if (!cat || typeof cat !== 'string') return 'General Educational Assistance';
    const lower = cat.toLowerCase().trim();
    if (lower.includes('institution')) return 'Institution-Funded Educational Assistance';
    if (lower.includes('ched')) return 'Ched Educational Assistance';
    if (lower.includes('private')) return 'Private Educational Assistance';
    if (lower.includes('government') || lower.includes('gov')) return 'Government Educational Assistance';
    return cat.trim();
}

/**
 * Parses JSON strings or arrays safely
 */
function safeParseArray(val) {
    if (!val || val === 'null' || val === '[]' || val === '[""]') return [];
    if (Array.isArray(val)) return val.map(String).filter(Boolean);
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
            return [String(parsed)].filter(Boolean);
        } catch (e) {
            return val.split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    return [];
}

/**
 * Builds comprehensive, verified context string for Gia AI
 */
async function getStudentContextData(studentId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isRegisteredStudent = studentId && studentId !== 'guest_student';

    // 1. Fetch live data from Supabase in parallel
    const [profileRes, appsRes, scholRes, annRes, policyRes] = await Promise.all([
        isRegisteredStudent ? supabase.from('profiles').select('*').eq('id', studentId).maybeSingle() : Promise.resolve({ data: null }),
        isRegisteredStudent ? supabase.from('applications').select('*, scholarships(*)').eq('student_id', studentId).order('created_at', { ascending: false }).limit(8) : Promise.resolve({ data: null }),
        supabase.from('scholarships').select('*').neq('status', 'Draft').order('created_at', { ascending: false }),
        supabase.from('announcements').select('title, category, content, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('school_policies').select('*').limit(1).maybeSingle()
    ]);

    let profile = profileRes.data || null;

    // 2. Check masterlist for enriched student records if student ID number exists
    if (profile && (profile.id_number || profile.student_id)) {
        const idNum = profile.id_number || profile.student_id;
        try {
            const { data: masterlistData } = await supabase
                .from('enrolled_masterlist')
                .select('first_name, last_name, middle_name, program, year_level, gwa, school_id')
                .eq('id_number', idNum)
                .maybeSingle();

            if (masterlistData) {
                if (!profile.gwa && masterlistData.gwa) profile.gwa = masterlistData.gwa;
                if (!profile.program && masterlistData.program) profile.program = masterlistData.program;
                if (!profile.year_level && masterlistData.year_level) profile.year_level = masterlistData.year_level;
            }
        } catch (mErr) {
            // Ignore masterlist error
        }
    }

    // 3. Deduplicate and Categorize Educational Assistance Programs
    const allScholarships = scholRes.data || [];
    const seenTitles = new Map();
    const openPrograms = [];
    const closedOrUpcoming = [];

    allScholarships.forEach(s => {
        const start = s.start_date ? new Date(s.start_date) : null;
        if (start) start.setHours(0, 0, 0, 0);

        const end = s.end_date ? new Date(s.end_date) : null;
        if (end) end.setHours(23, 59, 59, 999);

        const isDateActive = (!start || today >= start) && (!end || today <= end);
        const isStatusActive = s.status === 'Active' || s.status === 'Open';
        const isOpen = isStatusActive && isDateActive;

        // Required documents
        const reqDocsArr = safeParseArray(s.required_documents);
        const docConfigsArr = Array.isArray(s.document_configurations) ? s.document_configurations.map(d => d.name) : [];
        const mergedDocs = Array.from(new Set([...reqDocsArr, ...docConfigsArr])).filter(Boolean);
        const reqDocs = mergedDocs.length > 0 ? mergedDocs.join(', ') : 'Certificate of Enrollment, Grade Slip / Transcript';

        // Eligibility years and programs
        const eligYearsArr = safeParseArray(s.eligibility_years);
        const eligProgramsArr = safeParseArray(s.eligibility_programs);

        const eligYears = eligYearsArr.length > 0 ? eligYearsArr.join(', ') : 'Open to All Year Levels';
        const eligPrograms = eligProgramsArr.length > 0 ? eligProgramsArr.join(', ') : 'Open to All Degree Programs';

        const dlStr = s.end_date ? new Date(s.end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Ongoing / Open';
        const startStr = s.start_date ? new Date(s.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

        const cleanDesc = s.description ? s.description.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';

        const normCat = normalizeCategory(s.category);
        const uniqueKey = `${(s.title || '').toLowerCase().trim()}::${normCat.toLowerCase()}`;

        const progInfo = {
            title: s.title,
            category: normCat,
            type: s.scholarship_type || 'Merit-Based / Need-Based',
            slots: s.slots || s.available_slots || 'Open Slots',
            deadline: dlStr,
            period: `${startStr} to ${dlStr}`,
            minGwa: s.min_college_gwa ? String(s.min_college_gwa) : 'None required',
            minHsAvg: s.min_hs_average ? String(s.min_hs_average) : null,
            eligYears,
            eligYearsArr,
            eligPrograms,
            eligProgramsArr,
            reqDocs,
            description: cleanDesc
        };

        // Deduplicate keeping open/active one
        if (!seenTitles.has(uniqueKey) || isOpen) {
            seenTitles.set(uniqueKey, { isOpen, progInfo });
        }
    });

    seenTitles.forEach(({ isOpen, progInfo }) => {
        if (isOpen) {
            openPrograms.push(progInfo);
        } else {
            closedOrUpcoming.push(progInfo);
        }
    });

    return {
        profile,
        applications: appsRes.data || [],
        openPrograms,
        closedOrUpcoming,
        policy: policyRes.data || null,
        announcements: annRes.data || []
    };
}

/**
 * Builds formatted context string for LLM
 */
async function getStudentContext(studentId) {
    const cacheKey = studentId || 'guest_student';
    const cached = studentContextCache.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        return cached.contextStr;
    }

    try {
        const data = await getStudentContextData(studentId);
        const { profile, applications, openPrograms, policy, announcements } = data;

        let contextStr = "=== GRANTEE SYSTEM LIVE DATABASE CONTEXT ===\n";

        // Student Profile
        if (profile) {
            contextStr += "\n[STUDENT IDENTITY & ACADEMIC PROFILE]\n";
            contextStr += `- Full Name: ${profile.first_name || ''} ${profile.last_name || ''}`.trim() + "\n";
            contextStr += `- Program / Major: ${profile.program || 'Not specified'}\n`;
            contextStr += `- Year Level: ${profile.year_level || 'Not specified'}\n`;
            contextStr += `- General Weighted Average (GWA): ${profile.gwa ? profile.gwa : 'Not recorded yet'}\n`;
            if (profile.id_number || profile.student_id) {
                contextStr += `- Student ID Number: ${profile.id_number || profile.student_id}\n`;
            }
            if (profile.email) {
                contextStr += `- Email: ${profile.email}\n`;
            }
        } else {
            contextStr += "\n[STUDENT IDENTITY & ACADEMIC PROFILE]\n";
            contextStr += "- Status: Guest Student (Browsing public catalog / Not logged in).\n";
        }

        // Applications
        if (applications && applications.length > 0) {
            contextStr += "\n[STUDENT'S SUBMITTED APPLICATIONS & STATUSES]\n";
            applications.forEach(app => {
                const progTitle = app.scholarships?.title || app.title || 'Educational Assistance Program';
                const appCat = normalizeCategory(app.scholarships?.category || app.category);
                const subDate = app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
                contextStr += `- **${progTitle}** (${appCat}) -> Status: **${app.status || 'Pending'}** (Submitted: ${subDate})\n`;
            });
        } else if (profile) {
            contextStr += "\n[STUDENT'S SUBMITTED APPLICATIONS & STATUSES]\n";
            contextStr += "- No applications submitted yet.\n";
        }

        // Open Programs
        contextStr += "\n[CURRENTLY OPEN EDUCATIONAL ASSISTANCE PROGRAMS (ACCEPTING APPLICATIONS)]\n";
        if (openPrograms.length > 0) {
            openPrograms.forEach((p, idx) => {
                contextStr += `${idx + 1}. **${p.title}**\n`;
                contextStr += `   - Category: ${p.category} | Type: ${p.type} | Available Slots: ${p.slots}\n`;
                contextStr += `   - Application Deadline: ${p.deadline} (Application Window: ${p.period})\n`;
                contextStr += `   - Eligible Year Levels: ${p.eligYears}\n`;
                contextStr += `   - Eligible Degree Programs: ${p.eligPrograms}\n`;
                contextStr += `   - Minimum GWA Requirement: ${p.minGwa} (Philippine grading: 1.00 is highest/best)\n`;
                if (p.minHsAvg) contextStr += `   - Minimum High School Average: ${p.minHsAvg}\n`;
                contextStr += `   - Required Documents: ${p.reqDocs}\n`;
                if (p.description) contextStr += `   - Overview: ${p.description}\n`;
            });
        } else {
            contextStr += "- There are currently no open programs accepting applications at this moment.\n";
        }

        // Institutional Policies
        if (policy) {
            contextStr += "\n[INSTITUTIONAL ASSISTANCE POLICIES]\n";
            contextStr += `- Maximum Active Assistance Grants per Student: ${policy.global_limit || 2}\n`;
            contextStr += `- Combination Rules: Students may combine CHED, Private, and Institution-Funded assistance within the limit.\n`;
        }

        // Latest Announcements
        if (announcements && announcements.length > 0) {
            contextStr += "\n[OFFICIAL ANNOUNCEMENTS & DEADLINE NOTICES]\n";
            announcements.forEach(a => {
                const aDate = a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recent';
                const aText = a.content ? a.content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '';
                contextStr += `- [${aDate}] **${a.title}**: ${aText}\n`;
            });
        }

        studentContextCache.set(cacheKey, {
            contextStr,
            timestamp: now
        });

        return contextStr;
    } catch (e) {
        console.error("Error building context for Gia AI:", e);
        return "=== GRANTEE SYSTEM CONTEXT ===\n- General student assistance support available.\n";
    }
}

/**
 * Generates an instant, highly accurate response directly from live database records
 * when the AI API rate limit or network fails.
 */
async function generateSmartFallbackReply(userQuery, studentId) {
    try {
        const data = await getStudentContextData(studentId);
        const { profile, applications, openPrograms, announcements, policy } = data;
        const q = (userQuery || '').toLowerCase();

        // 1. Status query
        if (q.includes('status') || q.includes('my application') || q.includes('track') || q.includes('submitted')) {
            if (!profile) {
                return "Hi! 👋 To check your application status, please log in with your student account. Once logged in, you can view the live status of all your applications under **'My Applications'**! ✨";
            }
            if (!applications || applications.length === 0) {
                return `Hi ${profile.first_name || 'there'}! 👋 You haven't submitted any educational assistance applications yet. You can browse all open programs under **'Available Programs'** and apply today! 🎓`;
            }
            let reply = `Hi ${profile.first_name || 'there'}! 👋 Here is the current status of your submitted educational assistance application(s):\n\n`;
            applications.forEach(app => {
                const progTitle = app.scholarships?.title || app.title || 'Educational Assistance';
                const statusEmoji = app.status === 'Approved' ? '✅' : (app.status === 'Rejected' ? '❌' : '⏳');
                reply += `* ${statusEmoji} **${progTitle}**: **${app.status || 'Pending'}**\n`;
            });
            reply += `\nYou can track real-time evaluations under your **'My Applications'** dashboard. 📋`;
            return reply;
        }

        // 2. Who am I / Profile query
        if (q.includes('who am i') || q.includes('my name') || q.includes('my course') || q.includes('my gwa') || q.includes('my profile')) {
            if (!profile) {
                return "Hi! 👋 You are currently browsing as a guest student. To check your personalized academic records and eligible programs, please log in with your student account! ✨";
            }
            let reply = `Hi **${profile.first_name || ''} ${profile.last_name || ''}**! 👋 Here are your current student records on Grantee:\n\n`;
            reply += `* **Course / Major:** ${profile.program || 'Not recorded'}\n`;
            reply += `* **Year Level:** ${profile.year_level || 'Not recorded'}\n`;
            reply += `* **GWA:** ${profile.gwa || 'Not recorded yet'}\n`;
            if (profile.id_number || profile.student_id) reply += `* **Student ID:** ${profile.id_number || profile.student_id}\n`;
            reply += `\nFeel free to ask which educational assistance programs match your academic standing! 🎓`;
            return reply;
        }

        // 3. Document requirements query
        if (q.includes('document') || q.includes('requirement') || q.includes('file') || q.includes('prepare')) {
            let reply = "Hello! 👋 Here are the required documents for currently open educational assistance programs:\n\n";
            if (openPrograms.length > 0) {
                openPrograms.slice(0, 4).forEach(p => {
                    reply += `* **${p.title}** (${p.category}):\n  📄 Requirements: *${p.reqDocs}*\n  ⏰ Deadline: ${p.deadline}\n\n`;
                });
                reply += "💡 *Tip:* Please prepare clear scans or photos in **PDF, JPG, or PNG** format before submitting your application. ✨";
            } else {
                reply += "Standard documents usually include your **Certificate of Enrollment**, **Latest Grade Slip / Transcript**, and **Valid ID**.";
            }
            return reply;
        }

        // 4. Announcements & Deadlines query
        if (q.includes('announcement') || q.includes('news') || q.includes('update') || q.includes('deadline')) {
            let reply = "Hello! 👋 Here are the latest official announcements and reminders from the educational assistance office:\n\n";
            if (announcements && announcements.length > 0) {
                announcements.slice(0, 3).forEach(a => {
                    const clean = a.content ? a.content.replace(/<[^>]*>?/gm, '').trim() : '';
                    reply += `📢 **${a.title}** (${a.category || 'General'})\n${clean}\n\n`;
                });
            } else {
                reply += "There are no new broadcast announcements at this moment. Please check the open programs list for individual application deadlines! 🎓";
            }
            return reply;
        }

        // 5. Open / Available programs query (Default fallback)
        if (openPrograms.length > 0) {
            let reply = `Hello! I'm **Gia**, your friendly educational assistance companion. ✨\n\nHere are the **educational assistance programs currently open and accepting applications**:\n\n`;
            openPrograms.forEach(p => {
                reply += `* 🎓 **${p.title}** (${p.category})\n`;
                reply += `  • **Type:** ${p.type} | **Slots:** ${p.slots}\n`;
                reply += `  • **Application Deadline:** ${p.deadline}\n`;
                reply += `  • **Eligible Levels:** ${p.eligYears}\n`;
                if (p.minGwa && p.minGwa !== 'None required') reply += `  • **Min GWA:** ${p.minGwa}\n`;
                reply += `\n`;
            });
            reply += `To apply, simply navigate to the **'Available Programs'** or **'Apply for Assistance'** tab in your dashboard, select your program, and submit your requirements! 📋✨`;
            return reply;
        } else {
            return "Hello! I'm **Gia**, your educational assistance companion. ✨ Currently, there are no active educational assistance programs open for application right at this moment, but new programs are posted regularly! Please stay tuned to the announcements board.";
        }
    } catch (fallbackErr) {
        console.error("Smart fallback error:", fallbackErr);
        return "Hi there! 👋 I'm **Gia**, your educational assistance companion. How can I assist you with educational assistance programs, eligibility criteria, required documents, or application deadlines today? ✨";
    }
}

/**
 * Handles incoming chat messages with Google Gemini Generative AI
 */
async function handleStudentChat(studentId, messages) {
    const contextStr = await getStudentContext(studentId);

    const systemPrompt = `You are "Gia", the smart, highly accurate, empathetic, and friendly female AI educational assistance companion for the Grantee Educational Assistance Management System.

=== YOUR CORE CAPABILITIES & INTELLIGENCE RULES ===

1. **ACCURACY REGARDING OPEN ASSISTANCE PROGRAMS**:
   - Always refer directly to the section "[CURRENTLY OPEN EDUCATIONAL ASSISTANCE PROGRAMS (ACCEPTING APPLICATIONS)]".
   - When asked what programs are open, available, or accepting applications, ALWAYS present the actual open programs listed in that section with their exact titles, categories, and deadlines.
   - NEVER state that there are no programs open when the context contains active programs!

2. **SMART PERSONALIZED ELIGIBILITY CHECKING**:
   - When a student asks "What can I apply for?", "Am I eligible?", or "Who am I?", inspect their academic profile (Name, Program/Course, Year Level, GWA) and submitted applications.
   - Check if their Year Level and Course match the program's eligibility criteria:
     * If a program requires "Incoming 1st year" and the student is "3rd year", point this out clearly and recommend programs where they DO qualify (such as "Open to All Year Levels").
     * In Philippine college grading, a GWA of 1.00 to 1.75 is high honor/top grade. Lower numbers mean better grades (e.g. 1.25 is better than 1.75).
   - If they haven't submitted an application yet, guide them on which open program best fits their profile.
   - If they are a guest (not logged in), present the open programs and warmly suggest logging in to submit an application.

3. **APPLICATION GUIDANCE & NAVIGATION**:
   - How to apply: Guide students to go to the **"Available Programs"** or **"Apply for Assistance"** section in their student dashboard, click "Apply Now" on the desired program, fill out the required information, attach required PDF/JPG documents, and click "Submit Application".
   - Document requirements: When asked about documents, list the exact required documents specified for each program.
   - Tracking: Explain that students can track real-time progress under **"My Applications"**.

4. **TERMINOLOGY ENFORCEMENT**:
   - Always use the term **"educational assistance"** (or "educational assistance program") instead of "scholarship" or "scholarships".
   - Never refer to programs, grants, or aid as "scholarships".

5. **CONVERSATIONAL TONE & PRESENTATION**:
   - Be concise, structured, friendly, and helpful. Use clear bullet points and appropriate emojis (🎓, ✨, 📋, 💡, 📢).
   - Avoid generic robotic responses.

${contextStr}`;

    // Clean and validate messages for multi-turn conversation
    const formattedContents = [];
    let lastUserQuery = '';

    for (const msg of (messages || [])) {
        if (!msg || !msg.content) continue;
        const role = (msg.role === 'user') ? 'user' : 'model';
        const cleanText = String(msg.content)
            .replace(/<[^>]*>?/gm, '')
            .trim();
        if (!cleanText) continue;

        if (role === 'user') {
            lastUserQuery = cleanText;
        }

        // Skip leading model greeting if it's the very first message
        if (formattedContents.length === 0 && role === 'model') {
            continue;
        }

        // Combine consecutive messages from same role to maintain alternation
        if (formattedContents.length > 0 && formattedContents[formattedContents.length - 1].role === role) {
            formattedContents[formattedContents.length - 1].parts[0].text += "\n" + cleanText;
        } else {
            formattedContents.push({
                role: role,
                parts: [{ text: cleanText }]
            });
        }
    }

    if (formattedContents.length === 0) {
        formattedContents.push({ role: 'user', parts: [{ text: "Hello Gia!" }] });
    } else if (formattedContents[formattedContents.length - 1].role !== 'user') {
        formattedContents.push({ role: 'user', parts: [{ text: "Hello Gia!" }] });
    }

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt,
            generationConfig: {
                maxOutputTokens: 1000,
                temperature: 0.25
            }
        });

        const result = await model.generateContent({
            contents: formattedContents
        });
        
        let replyText = result.response.text();

        // Ensure "scholarship" terminology is strictly transformed to "educational assistance"
        if (replyText) {
            replyText = replyText
                .replace(/\bScholarships\b/g, 'Educational Assistance Programs')
                .replace(/\bscholarships\b/g, 'educational assistance programs')
                .replace(/\bScholarship\b/g, 'Educational Assistance')
                .replace(/\bscholarship\b/g, 'educational assistance');
        }

        return replyText;
    } catch (error) {
        console.warn("Gia AI Primary Model Error (falling back to smart contextual responder):", error.message);
        // Instant intelligent fallback directly from live database records
        return await generateSmartFallbackReply(lastUserQuery, studentId);
    }
}

module.exports = { handleStudentChat };
