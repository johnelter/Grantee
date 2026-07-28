require('dotenv').config();
const { BrevoClient } = require('@getbrevo/brevo');

async function testEmail() {
    console.log("Using API Key:", process.env.BREVO_API_KEY ? "Found" : "Missing");
    
    const brevo = new BrevoClient({
        apiKey: process.env.BREVO_API_KEY || ''
    });

    try {
        const response = await brevo.transactionalEmails.sendTransacEmail({
            subject: "Test Email from Grantee System",
            sender: {
                name: "Grantee Test",
                email: "geligjohnelter@gmail.com"
            },
            to: [
                {
                    // Sending to the same email for testing purposes
                    email: "geligjohnelter@gmail.com" 
                }
            ],
            htmlContent: "<p>This is a test to verify Brevo is working.</p>"
        });

        console.log("SUCCESS! Email sent.");
        console.log("Response:", response);
    } catch (err) {
        console.error("FAILED to send email.");
        console.error("Status:", err.response?.statusCode || err.status || 'Unknown');
        console.error("Error Message:", err.response?.body || err.message);
    }
}

testEmail();
