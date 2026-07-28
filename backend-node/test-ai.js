require('dotenv').config();
const { handleStudentChat } = require('./aiAssistantService');

async function test() {
    try {
        console.log("Testing AI Chat...");
        const messages = [
            { role: 'model', content: "Hi there! 👋 I'm your AI assistant." },
            { role: 'user', content: "What scholarships am I eligible for?" }
        ];
        
        // Pass a dummy UUID if needed, or null
        const reply = await handleStudentChat("00000000-0000-0000-0000-000000000000", messages);
        console.log("Reply:", reply);
    } catch (e) {
        console.error("Test failed with error:", e);
    }
}

test();
