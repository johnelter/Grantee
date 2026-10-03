const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// In-memory cache to avoid redundant AI calls for repeated comments
const moderationCache = new Map();
const MAX_CACHE_SIZE = 500;

// Fast regex for safe greetings & pleasantries in English, Cebuano, and Tagalog (0ms)
const FAST_SAFE_REGEX = /^(hello|hi|hey|good\s+(morning|afternoon|evening|day)|thanks|thank\s+you|noted|copy|okay|ok|yes|no|congrats|congratulations|good\s+luck|amen|po|opo|maayong\s+(buntag|hapon|gabii|adlaw)|salamat|daghang\s+salamat|way\s+sapayan)[\s.,!?-]*$/i;

// Fast profanity, rude terms, and spam pre-filters in English and Cebuano / Bisaya
const FAST_FORBIDDEN_PATTERNS = [
    // English profanity & severe insults
    /\b(fuck|fucking|fucker|shit|shitty|bitch|asshole|cunt|dick|pussy|motherfuck|motherfucker|dumbass|bastard|stfu|dipshit|retard)\b/i,
    
    // Cebuano / Bisaya profanity & vulgarities
    /\b(yawa|ywa|piste|pisti|bilat|belat|burikat|bigaon|kayat|iyot|otin|oten|pakyu|pakyow|linti|animas|kolera)\b/i,
    
    // Cebuano / Bisaya rude insults & demeaning phrases
    /\b(bogoa|mga\s+bogo|bogo\s+ka|bogo\s+man|inutil|buang\s+ka|buang\s+man|atay\s+ka|atay\s+man|bahog\s+lubot|bahog\s+bilat|way\s+batasan|walay\s+batasan|way\s+buot|walay\s+buot|walay\s+kwenta|way\s+kwenta|walay\s+pulos|way\s+pulos|walay\s+ayo|way\s+ayo|walay\s+klaro|way\s+klaro)\b/i,
    
    // Angry, villainous, threatening, death wishes & curse phrases (English, Cebuano, Tagalog)
    /\b(i\s+will\s+destroy|will\s+destroy\s+you|make\s+you\s+pay|you\s+will\s+pay|you\s+will\s+suffer|suffer\s+for\s+this|rot\s+in\s+hell|burn\s+in\s+hell|drop\s+dead|curse\s+you|curse\s+all\s+of\s+you|watch\s+your\s+back|regret\s+this|make\s+you\s+regret|my\s+revenge|take\s+revenge|pathetic\s+fools|worthless\s+scum|evil\s+coordinators|you\s+are\s+evil|i\s+hate\s+all\s+of\s+you|i\s+hate\s+you\s+all)\b/i,
    /\b(mamatay\s+unta|pangamatay\s+mo|pangamatay\s+unta|patyon\s+ta\s+mo|patyon\s+mo|gabaan\s+ra\s+mo|magabaan\s+unta|magabaan\s+mo|gabaan\s+mo|demonyo\s+mo|mga\s+demonyo|mga\s+hayop|salbahe\s+kaayo|salbahis|ipabarang|ipabarangay|ipatulfo|bwisit|bwesit|leche|letse)\b/i,
    
    // Tagalog / Common Filipino profanities & insults
    /\b(putangina|tangina|tang\s+ina|gago|tarantado|tanga|ulol|pucha|punyeta|bwisit|bwesit|salbahe|hayop\s+kayo|mamatay\s+kayo)\b/i,
    
    // Malicious links & spam
    /(https?:\/\/|t\.me\/|wa\.me\/|telegram\.me|crypto|casino|free\s*money|buy\s+now)/i
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
    
    for (const pattern of FAST_FORBIDDEN_PATTERNS) {
        if (pattern.test(lower)) {
            return { passed: false, reason: "Comment contains rude, aggressive, or prohibited language." };
        }
    }
    
    const toxicPatterns = [
        /\b(clown|clowns|idiots?|stupid|morons?|dumbass|useless|scumbag|trash|loser|stfu|shut\s*up)\b/i,
        /\b(bogo|inutil|buang|yawa|pisti|peste|bilat|burikat|bigaon|pakyu|kolera|linti|animas|bulok)\b/i,
        /\b(bulok|way\s+batasan|walay\s+batasan|way\s+buot|walay\s+buot|way\s+kwenta|walay\s+kwenta)\b/i,
        /\b(worst\s+school|fire\s+these|fucking|shitty|evil|demonyo|salbahe)\b/i
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

    // 3. Fast profanity / rude / toxic / angry terms pre-filter
    for (const pattern of FAST_FORBIDDEN_PATTERNS) {
        if (pattern.test(lower)) {
            const res = { 
                passed: false, 
                reason: "Comment contains rude, aggressive, or prohibited language." 
            };
            if (moderationCache.size >= MAX_CACHE_SIZE) moderationCache.clear();
            moderationCache.set(lower, res);
            return res;
        }
    }

    // 4. Gemini AI Model with bilingual English & Cebuano moderation understanding
    try {
        const systemInstruction = `You are an expert bilingual AI Comment Moderator for a Philippine school educational assistance announcement board. You are fluent in English, Cebuano (Bisaya / Binisaya), and Filipino (Tagalog/Taglish).

Your job is to analyze comments submitted by students and determine if they are acceptable or if they violate community standards.

=== STRICT MODERATION RULES ===
1. REJECT RUDE, HOSTILE, AGGRESSIVE, ANGRY, OR VILLAINOUS PHRASES:
   - Hostile threats, angry character statements, intimidation, or vengeful remarks (e.g., "I will destroy you", "You will pay for this", "I will make you suffer", "Rot in hell", "Burn in hell", "Drop dead", "Curse you all", "I hate all of you", "Watch your back", "You'll regret this", "You are evil", "Pathetic fools", "Worthless scum").
   - Cebuano hostile threats, death wishes, or curse phrases: e.g., "mamatay unta mo", "pangamatay mo", "gabaan ra mo", "magabaan unta mo", "patyon ta mo", "demonyo mo", "salbahe mo", "hayop mo", "walay pulos", "way ayo", "mga bogo", "inutil", "buang", "yawa", "pisti", "bulok", "animas", "kolera".
   - Personal attacks, demeaning insults, hostile mocking, aggressive sarcasm, or bullying against coordinators, staff, the school, or fellow students.

2. REJECT PROFANITY, VULGARITY & OBSCENITY:
   - Any sexually explicit terms, vulgar slang, or offensive curses in English, Cebuano, or Tagalog.

3. REJECT HARASSMENT, THREATS, HATE SPEECH & VIOLENCE:
   - Any intimidation, harassment, hate speech, or wishes of harm.

4. REJECT SPAM, SCAMS & COMMERCIAL ADS:
   - Advertising, cryptocurrency promos, gambling, external chat links (Telegram/WhatsApp), or spam.

5. ALLOW CONSTRUCTIVE, POLITE, OR NORMAL STUDENT INQUIRIES & EXPRESSIONS:
   - Normal student questions, respectful inquiries, confusion, and polite follow-ups in English, Cebuano, or Tagalog (e.g., "Kanus-a ang releasing sa allowance?", "Salamat kaayo!", "Asa ta pwede mag submit ug requirements?", "What time is the payout tomorrow?", "Thank you po").
   - Constructive feedback or questions without hostile insults, threats, or profanity.

=== REQUIRED OUTPUT FORMAT ===
Respond ONLY with a JSON object:
{"passed": true, "reason": null}
or
{"passed": false, "reason": "Comment contains rude, aggressive, or inappropriate language."}`;

        const modelNames = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"];
        let parsed = null;

        for (const modelName of modelNames) {
            try {
                const model = genAI.getGenerativeModel({
                    model: modelName,
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
                parsed = extractJson(textResp);
                if (parsed && typeof parsed.passed === 'boolean') {
                    break;
                }
            } catch (modelErr) {
                console.warn(`Model ${modelName} failed or quota reached, trying next model...`);
            }
        }

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

