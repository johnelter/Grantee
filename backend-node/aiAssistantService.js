const { GoogleGenerativeAI } = require("@google/generative-ai");
const supabase = require('./supabaseClient');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function handleStudentChat(studentId, messages) {
    // 1. Fetch relevant student context from database
    let contextStr = "Student Context:\n";
    try {
        // Get profile
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', studentId).single();
        if (profile) {
            contextStr += `- Name: ${profile.first_name} ${profile.last_name}\n`;
            contextStr += `- Program: ${profile.program || 'N/A'}\n`;
            contextStr += `- Year Level: ${profile.year_level || 'N/A'}\n`;
            contextStr += `- GWA: ${profile.gwa || 'N/A'}\n`;
        }

        // Get recent applications
        const { data: applications } = await supabase.from('applications').select('*, scholarships(title)').eq('student_id', studentId).order('created_at', { ascending: false }).limit(10);
        if (applications && applications.length > 0) {
            contextStr += "\nRecent Applications:\n";
            applications.forEach(app => {
                contextStr += `- ${app.scholarships?.title || 'Unknown'} (Status: ${app.status}, Date: ${new Date(app.created_at).toLocaleDateString()})\n`;
            });
        } else {
            contextStr += "\nRecent Applications: None\n";
        }

        // Get available scholarships
        const { data: scholarships } = await supabase.from('scholarships').select('*').eq('status', 'Open');
        if (scholarships && scholarships.length > 0) {
            contextStr += "\nCurrently Open Scholarships/Assistance:\n";
            scholarships.forEach(s => {
                contextStr += `- ${s.title} (Deadline: ${s.end_date ? new Date(s.end_date).toLocaleDateString() : 'N/A'}, Req GWA: ${s.min_college_gwa || 'N/A'})\n`;
            });
        }
    } catch (e) {
        console.error("Error fetching context for AI:", e);
    }

const systemPrompt = `You are a helpful and friendly AI assistant for the 'Grantee' Scholarship Management System.
You help students with questions about Educational Assistance, Eligibility, Requirements, Deadlines, Application Status, Announcements, Assistance Policies, and System Navigation.
Be concise, polite, and encouraging. Use the following context about the student and the system to provide accurate, personalized answers. If you do not know the answer based on the context, instruct them to contact the Scholarship Office.

CRITICAL INSTRUCTIONS:
- The "Recent Applications" list contains the ONLY applications the student has submitted. If it says "None", the student has NEVER submitted any applications.
- The "Currently Open Scholarships/Assistance" list shows options available for anyone to apply to. These are NOT the student's applications. Do not confuse the two.
- Do not hallucinate or assume the student has applied to an open scholarship unless it is explicitly listed in "Recent Applications".

${contextStr}

Respond directly to the user's latest query considering the conversation history. Do not use Markdown formatting like **bold** unless necessary. Use plain text.
`;

    // Prepare history for Gemini
    const chatHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "System prompt (read only):\n" + systemPrompt }]
                },
                {
                    role: "model",
                    parts: [{ text: "Understood. I am ready." }]
                },
                {
                    role: "user",
                    parts: [{ text: "Hello!" }]
                },
                ...chatHistory.slice(0, -1) // First message is 'model' ("Hi there!"), then 'user'
            ]
        });

        const latestMessage = chatHistory[chatHistory.length - 1].parts[0].text;
        const result = await chat.sendMessage(latestMessage);
        
        return result.response.text();
    } catch (error) {
        console.error("Gemini AI Chat Error:", error);
        throw error;
    }
}

module.exports = { handleStudentChat };
