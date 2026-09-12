const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// In-memory cache to avoid redundant AI calls for repeated comments
const moderationCache = new Map();
const MAX_CACHE_SIZE = 500;

// Fast regex for safe phrases to return immediately (0ms)
const FAST_SAFE_REGEX = /^(hello|hi|hey|good\s+(morning|afternoon|evening|day)|thanks|thank\s+you|noted|copy|okay|ok|yes|no|congrats|congratulations|good\s+luck|amen|po|opo)[\s.,!?-]*$/i;

async function moderateComment(text) {
    if (!text || typeof text !== 'string') {
        return { passed: false, reason: "Comment text is empty or invalid." };
    }

    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // 1. Instant check for common greetings / safe words
    if (FAST_SAFE_REGEX.test(lower)) {
        return { passed: true, reason: null };
    }

    // 2. Cache hit
    if (moderationCache.has(lower)) {
        return moderationCache.get(lower);
    }

    // 3. Fast profanity / scam links pre-filter
    const basicForbidden = ['fuck', 'shit', 'bitch', 'asshole', 'http://', 'https://', 't.me/', 'wa.me/', 'crypto', 'casino'];
    for (const bad of basicForbidden) {
        if (lower.includes(bad)) {
            const res = { passed: false, reason: "Comment contains prohibited words or external links." };
            if (moderationCache.size >= MAX_CACHE_SIZE) moderationCache.clear();
            moderationCache.set(lower, res);
            return res;
        }
    }

    // 4. Fast Gemini model with structured JSON output and low token count
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 80,
                temperature: 0.0
            }
        });

        const prompt = `You are an AI Comment Moderator for a student educational announcement board.
Review this comment: "${trimmed}"

Guidelines:
- Lenient: Allow normal student conversations, questions, greetings, and feedback.
- Reject only: severe vulgarity/profanity, harassment, malicious spam, or commercial advertisements.

Output JSON:
{"passed": true, "reason": null} or {"passed": false, "reason": "concise user-friendly reason"}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textResp = response.text().trim();
        const parsed = JSON.parse(textResp);

        const safeResult = {
            passed: parsed.passed === true,
            reason: parsed.passed === true ? null : (parsed.reason || "Violates community guidelines.")
        };

        if (moderationCache.size >= MAX_CACHE_SIZE) moderationCache.clear();
        moderationCache.set(lower, safeResult);
        return safeResult;
    } catch (error) {
        console.error("Gemini Moderation Error:", error);
        // Fail-open fallback so student is never blocked on AI failure
        return { passed: true, reason: null };
    }
}

module.exports = { moderateComment };

