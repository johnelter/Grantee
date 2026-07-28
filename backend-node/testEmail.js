require('dotenv').config();
const { sendNotification } = require('./notificationService');

async function run() {
    try {
        console.log("Sending email...");
        const result = await sendNotification({
            userId: null,
            recipientEmail: 'test@example.com',
            eventType: 'test',
            subject: 'Test Notification',
            message: 'This is a test.',
            sendEmail: true,
            sendInApp: false
        });
        console.log("Result:", result);
    } catch(err) {
        console.error("Error:", err);
    }
}
run();
