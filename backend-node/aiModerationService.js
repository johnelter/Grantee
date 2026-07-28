const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function moderateComment(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const prompt = `You are an AI Comment Moderator for an educational institution's student announcement board.
Review the following comment based on these community guidelines:
- No offensive language, hate speech, or harassment
- No spam, promotional content, or suspicious links
- No excessive repeated characters (e.g., "aaaaaaa")
- Must be a coherent message

IMPORTANT INSTRUCTIONS:
- Be highly lenient.
- Allow casual conversation, short greetings (e.g. "Hello", "Thanks", "Ok"), questions, and normal student interactions.
- DO NOT block comments for being "meaningless" unless it is literal gibberish.
- Only block comments if they clearly and unambiguously violate the rules.

Comment to review: "${text}"

Respond STRICTLY in JSON format:
{
    "passed": boolean,
    "reason": "If passed is false, provide a concise, user-friendly reason based on the guidelines. If true, return null."
}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Gemini Moderation Error:", error);
        // Fallback to true if AI fails
        return { passed: true, reason: null };
    }
}

module.exports = { moderateComment };
