require('dotenv').config();
const { handleStudentChat } = require('./aiAssistantService');

async function test() {
    try {
        console.log("=== TEST 1: Open Educational Assistance Query (Guest) ===");
        const reply1 = await handleStudentChat('guest_student', [
            { role: 'user', content: "What educational assistance programs are currently open?" }
        ]);
        console.log("Reply 1:\n", reply1, "\n");

        console.log("=== TEST 2: Personalized Student Eligibility (Student Riza) ===");
        const reply2 = await handleStudentChat('4eea7896-66e2-40a0-930c-82f2e2a75caf', [
            { role: 'user', content: "Who am I, and what educational assistance programs can I apply for?" }
        ]);
        console.log("Reply 2:\n", reply2, "\n");

        console.log("=== TEST 3: Institutional Assistance Policy Query ===");
        const reply3 = await handleStudentChat('4eea7896-66e2-40a0-930c-82f2e2a75caf', [
            { role: 'user', content: "How many educational assistance grants can I receive at the same time?" }
        ]);
        console.log("Reply 3:\n", reply3, "\n");

    } catch (e) {
        console.error("Test failed with error:", e);
    }
}

test();
