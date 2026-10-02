require('dotenv').config();
const { moderateComment } = require('./aiModerationService');

async function runTests() {
    console.log("=== TESTING AI MODERATION (ENGLISH & CEBUANO) ===\n");

    const testCases = [
        // 1. Cebuano rude/insulting comments (Should FAIL)
        { text: "Pisting yawa man diay mo mga bogo", expected: false, desc: "Cebuano profanity & insult (bogo)" },
        { text: "Bulok man kaayo inyong serbisyo way batasan", expected: false, desc: "Cebuano rude/insult (way batasan / bulok)" },
        { text: "Inutil kaayo ning mga coordinator diri", expected: false, desc: "Cebuano/Filipino insult (inutil)" },
        { text: "Yawa ngano dugay kaayo ang allowance", expected: false, desc: "Cebuano profanity (yawa)" },
        { text: "Pakyow ka buang", expected: false, desc: "Cebuano profanity + insult (buang)" },

        // 2. English rude/insulting comments (Should FAIL)
        { text: "This is fucking stupid, you all are useless idiots", expected: false, desc: "English profanity & insults" },
        { text: "Shut up you dumbass", expected: false, desc: "English rude insult" },
        { text: "Worst school ever, fire these clown coordinators", expected: false, desc: "English hostile demeaning comment" },

        // 3. Cebuano polite/normal student comments (Should PASS)
        { text: "Maayong buntag po! Kanus-a po ang releasing sa allowance?", expected: true, desc: "Cebuano polite question" },
        { text: "Salamat kaayo sa update Ma'am!", expected: true, desc: "Cebuano gratitude" },
        { text: "Asa dapit mag pasa sa Certificate of Enrollment?", expected: true, desc: "Cebuano inquiry" },
        { text: "Unsaon pag apply kung 2nd year student?", expected: true, desc: "Cebuano inquiry" },

        // 4. English polite/normal student comments (Should PASS)
        { text: "Good morning! Are 3rd year engineering students eligible for this grant?", expected: true, desc: "English polite question" },
        { text: "Thank you for the announcement!", expected: true, desc: "English polite gratitude" }
    ];

    let passedAll = true;

    for (const test of testCases) {
        try {
            const result = await moderateComment(test.text);
            const isMatch = result.passed === test.expected;
            const statusIcon = isMatch ? "[PASS]" : "[FAIL]";
            console.log(`${statusIcon} "${test.text}"`);
            console.log(`       Desc: ${test.desc}`);
            console.log(`       Result: passed=${result.passed}, reason=${result.reason || 'None'}`);
            if (!isMatch) passedAll = false;
        } catch (e) {
            console.error(`[ERROR] Test "${test.text}" threw error:`, e.message);
            passedAll = false;
        }
        console.log("");
    }

    console.log(`=== OVERALL RESULT: ${passedAll ? "ALL TESTS PASSED SUCCESSFULLY!" : "SOME TESTS FAILED"} ===`);
}

runTests();
