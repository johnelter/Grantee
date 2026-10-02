const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// In-memory cache to avoid redundant AI calls for repeated comments
const moderationCache = new Map();
const MAX_CACHE_SIZE = 500;

// Fast regex for safe greetings & pleasantries in English, Cebuano, and Tagalog (0ms)
const FAST_SAFE_REGEX = /^(hello|hi|hey|good\s+(morning|afternoon|evening|day)|thanks|thank\s+you|noted|copy|okay|ok|yes|no|congrats|congratulations|good\s+luck|amen|po|opo|maayong\s+(buntag|hapon|gabii|adlaw)|salamat|daghang\s+salamat|way\s+sapayan)[\s.,!?-]*$/i;

// Fast profanity, rude terms, and spam pre-filters in English and Cebuano / Bisaya
const FAST_FORBIDDEN_WORDS = [
    // English profanity & severe insults
    'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'motherfuck', 'dumbass', 'bastard', 'stfu', 'dipshit', 'retard',
    
    // Cebuano / Bisaya profanity & vulgarities
    'yawa', 'ywa', 'piste', 'pisti', 'bilat', 'belat', 'burikat', 'bigaon', 'kayat', 'iyot', 'otin', 'oten', 'pakyu', 'pakyow', 'linti', 'animas', 'kolera',
    
    // Cebuano / Bisaya rude insults & demeaning phrases
    'bogoa', 'mga bogo', 'bogo ka', 'bogo man', 'inutil', 'buang ka', 'buang man', 'atay ka', 'atay man', 'bahog lubot', 'bahog bilat', 'way batasan', 'walay batasan', 'way buot', 'walay buot', 'walay kwenta', 'way kwenta', 'walay pulos', 'way pulos',
    
    // Tagalog / Common Filipino profanities
    'putangina', 'tangina', 'tang ina', 'gago', 'tarantado', 'tanga', 'ulol', 'pucha', 'punyeta',
    
    // Malicious links & spam
    'http://', 'https://', 't.me/', 'wa.me/', 'telegram.me', 'crypto', 'casino', 'free money'
];

/**
 * Robust JSON extractor from model text output
 */
function extractJson(text) {
    if (!text || typeof text !== 'string') return null;
    try {
        return JSON.parse(text);
    } catch (e1) {
        try {
            const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
            const startIdx = cleaned.indexOf('{');
            const endIdx = cleaned.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                const sub = cleaned.substring(startIdx, endIdx + 1);
                return JSON.parse(sub);
            }
        } catch (e2) {}
    }
    return null;
}

/**
 * Intelligent heuristic fallback for English & Cebuano in case AI API is rate-limited or offline
 */
function heuristicModeration(text) {
    const lower = text.toLowerCase();
    
    for (const bad of FAST_FORBIDDEN_WORDS) {
        if (lower.includes(bad)) {
            return { passed: false, reason: "Comment contains rude, inappropriate, or prohibited language." };
        }
    }
    
    const toxicPatterns = [
        /\b(clown|clowns|idiots?|stupid|morons?|dumbass|useless|scumbag|trash|loser|stfu|shut\s*up)\b/i,
        /\b(bogo|inutil|buang|yawa|pisti|peste|bilat|burikat|bigaon|pakyu|kolera|linti|animas)\b/i,
        /\b(bulok|way\s+batasan|walay\s+batasan|way\s+buot|walay\s+buot|way\s+kwenta|walay\s+kwenta)\b/i,
        /\b(worst\s+school|fire\s+these|fucking|shitty)\b/i
    ];
    
    for (const pattern of toxicPatterns) {
        if (pattern.test(lower)) {
            return { passed: false, reason: "Comment contains rude or demeaning language." };
        }
    }
    
    return { passed: true, reason: null };
}

async function moderateComment(text) {
    if (!text || typeof text !== 'string') {
        return { passed: false, reason: "Comment text is empty or invalid." };
    }

    const trimmed = text.trim();
    if (!trimmed) {
        return { passed: false, reason: "Comment text cannot be empty." };
    }

    const lower = trimmed.toLowerCase();

    // 1. Instant check for common greetings / safe words
    if (FAST_SAFE_REGEX.test(lower)) {
        return { passed: true, reason: null };
    }

    // 2. Cache hit
    if (moderationCache.has(lower)) {
        return moderationCache.get(lower);
    }

    // 3. Fast profanity / rude / scam links pre-filter (English & Cebuano)
    for (const bad of FAST_FORBIDDEN_WORDS) {
        if (lower.includes(bad)) {
            const res = { 
                passed: false, 
                reason: "Comment contains rude, inappropriate, or prohibited language." 
            };
            if (moderationCache.size >= MAX_CACHE_SIZE) moderationCache.clear();
            moderationCache.set(lower, res);
            return res;
        }
    }

    // 4. Fast Gemini model with bilingual English & Cebuano moderation understanding
    try {
        const systemInstruction = `You are an expert bilingual AI Comment Moderator for a Philippine school educational assistance announcement board. You are fluent in English, Cebuano (Bisaya / Binisaya), and Filipino (Tagalog/Taglish).

Your job is to analyze comments submitted by students and determine if they are acceptable or if they violate community standards.

=== MODERATION RULES ===
1. REJECT RUDE, DISRESPECTFUL, DEMEANING, OR TOXIC COMMENTS (IN ENGLISH OR CEBUANO):
   - Personal attacks, insults, or demeaning language directed at coordinators, staff, the school, or fellow students.
   - Cebuano rude expressions/insults: e.g., "bogo", "bogoa ninyo", "inutil", "buang", "walay buot / way buot", "walay batasan / way batasan", "walay kwenta", "bulok", "yawa", "pisti / piste", "bilat", "burikat", "bigaon", "atay", "animas", "kolera", "damak", etc.
   - English rude expressions/insults: e.g., "idiot", "stupid", "dumbass", "moron", "loser", "shut up", "useless coordinators", "fuck you", "shitty system", "trash", "clown", "fire these clowns", etc.
   - Hostile complaints, disrespectful mocking, aggressive sarcasm, or bullying.

2. REJECT PROFANITY, VULGARITY & OBSCENITY:
   - Any sexually explicit terms, vulgar slang, or offensive curses in English or Cebuano.

3. REJECT HARASSMENT, THREATS & HATE SPEECH:
   - Any intimidation, harassment, hate speech, or wishes of harm.

4. REJECT SPAM, SCAMS & COMMERCIAL ADS:
   - Advertising, cryptocurrency promos, gambling, external chat links (Telegram/WhatsApp), or spam.

5. ALLOW CONSTRUCTIVE, POLITE, OR NORMAL STUDENT INQUIRIES & EXPRESSIONS:
   - Normal student questions, respectful inquiries, confusion, and polite follow-ups in English, Cebuano, or Tagalog (e.g., "Kanus-a ang releasing sa allowance?", "Salamat kaayo!", "Asa ta pwede mag submit ug requirements?", "What time is the payout tomorrow?", "Thank you po").
   - Constructive feedback or questions without hostile insults or profanity.

=== REQUIRED OUTPUT FORMAT ===
Respond ONLY with a JSON object:
{"passed": true, "reason": null}
or
{"passed": false, "reason": "Comment contains rude or inappropriate language."}`;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemInstruction,
            generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 120,
                temperature: 0.0
            }
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `Analyze this comment: "${trimmed}"` }] }]
        });
        const response = await result.response;
        const textResp = response.text().trim();
        const parsed = extractJson(textResp);

        if (parsed && typeof parsed.passed === 'boolean') {
            const safeResult = {
                passed: parsed.passed === true,
                reason: parsed.passed === true ? null : (parsed.reason || "Comment contains rude or inappropriate language.")
            };

            if (moderationCache.size >= MAX_CACHE_SIZE) moderationCache.clear();
            moderationCache.set(lower, safeResult);
            return safeResult;
        }

        // If JSON parsing was unexpected, fallback to heuristic
        const fallbackRes = heuristicModeration(trimmed);
        if (moderationCache.size >= MAX_CACHE_SIZE) moderationCache.clear();
        moderationCache.set(lower, fallbackRes);
        return fallbackRes;

    } catch (error) {
        console.error("Gemini Moderation Error:", error.message || error);
        // Instant intelligent heuristic fallback on network or rate limit failure
        const fallbackRes = heuristicModeration(trimmed);
        return fallbackRes;
    }
}

module.exports = { moderateComment };

