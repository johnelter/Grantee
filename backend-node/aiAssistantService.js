const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require('./supabaseClient');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// In-memory student context cache (60s TTL) to accelerate multi-turn chat
const studentContextCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

async function getStudentContext(studentId) {
    if (!studentId || studentId === 'guest_student') {
        return "Student Context: Guest or unauthenticated student exploring available assistance.\n";
    }

    const cached = studentContextCache.get(studentId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        return cached.contextStr;
    }

    let contextStr = "Student Context:\n";
    try {
        const [profileRes, appsRes, scholRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', studentId).maybeSingle(),
            supabase.from('applications').select('*, scholarships(title)').eq('student_id', studentId).order('created_at', { ascending: false }).limit(6),
            supabase.from('scholarships').select('*').eq('status', 'Open').limit(8)
        ]);

        const profile = profileRes.data;
        if (profile) {
            contextStr += `- Full Name: ${profile.first_name || ''} ${profile.last_name || ''}\n`;
            contextStr += `- Program / Major: ${profile.program || 'N/A'}\n`;
            contextStr += `- Year Level: ${profile.year_level || 'N/A'}\n`;
            contextStr += `- General Weighted Average (GWA): ${profile.gwa || 'N/A'}\n`;
            if (profile.student_id || profile.id_number) {
                contextStr += `- Student ID Number: ${profile.student_id || profile.id_number}\n`;
            }
        }

        const applications = appsRes.data;
        if (applications && applications.length > 0) {
            contextStr += "\nRecent Applications Submitted by this Student:\n";
            applications.forEach(app => {
                const dateStr = app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A';
                contextStr += `- ${app.scholarships?.title || 'Educational Assistance'} (Status: ${app.status || 'Pending'}, Date: ${dateStr})\n`;
            });
        } else {
            contextStr += "\nRecent Applications Submitted by this Student: None (Student has not submitted any application yet)\n";
        }

        const scholarships = scholRes.data;
        if (scholarships && scholarships.length > 0) {
            contextStr += "\nCurrently Open Scholarships / Assistance Programs:\n";
            scholarships.forEach(s => {
                const dlStr = s.end_date ? new Date(s.end_date).toLocaleDateString() : 'Ongoing';
                contextStr += `- ${s.title} (Deadline: ${dlStr}, Req Min GWA: ${s.min_college_gwa || 'None'})\n`;
            });
        } else {
            contextStr += "\nCurrently Open Scholarships: None at this moment.\n";
        }

        studentContextCache.set(studentId, {
            contextStr,
            timestamp: now
        });

    } catch (e) {
        console.error("Error fetching student context for Rantee AI:", e);
    }

    return contextStr;
}

async function handleStudentChat(studentId, messages) {
    const contextStr = await getStudentContext(studentId);

    const systemPrompt = `You are "Rantee" 🌱, the smart, friendly, empathetic, and accommodating AI scholarship companion for the 'Grantee' Scholarship Management System.

Your Persona & Core Intelligence:
- You are genuinely intelligent, knowledgeable, empathetic, warm, and conversational.
- When students ask personal or self-identification questions (e.g., "who am i?", "what is my name?", "what is my course / GWA?", "what is my application status?"), inspect the Student Context below and answer accurately and warmly using their real details!
- If the student is a guest or not yet logged in with records, warmly invite them to log in or introduce yourself.
- For questions about open scholarships, eligibility, document requirements, deadlines, or navigation, give direct, well-structured, easy-to-read answers with bullet points and friendly formatting.
- Use natural phrasing with occasional friendly emojis (🌱, 🎓, ✨, 📋, 💡). Never sound like a rigid robot.

${contextStr}`;

    // Clean and validate messages for multi-turn conversation
    const formattedContents = [];
    for (const msg of (messages || [])) {
        if (!msg || !msg.content) continue;
        const role = (msg.role === 'user') ? 'user' : 'model';
        const cleanText = String(msg.content)
            .replace(/<[^>]*>?/gm, '') // strip HTML
            .trim();
        if (!cleanText) continue;

        // Skip leading model greeting if it's the very first message
        if (formattedContents.length === 0 && role === 'model') {
            continue;
        }

        // Combine consecutive messages from same role to maintain strict alternation
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
        formattedContents.push({ role: 'user', parts: [{ text: "Hello Rantee!" }] });
    } else if (formattedContents[formattedContents.length - 1].role !== 'user') {
        formattedContents.push({ role: 'user', parts: [{ text: "Hello Rantee!" }] });
    }

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt,
            generationConfig: {
                maxOutputTokens: 450,
                temperature: 0.4
            }
        });

        const result = await model.generateContent({
            contents: formattedContents
        });
        
        return result.response.text();
    } catch (error) {
        console.error("Rantee AI Chat Error:", error);
        throw error;
    }
}

module.exports = { handleStudentChat };
