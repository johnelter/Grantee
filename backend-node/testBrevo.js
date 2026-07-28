
require('dotenv').config();
const { sendNotification } = require('./notificationService');

async function test() {
  try {
    const res = await sendNotification({
      userId: null,
      recipientEmail: 'test@example.com',
      eventType: 'security',
      resourceId: null,
      subject: 'Brevo Test',
      message: null,
      htmlContent: '<h1>Brevo is working!</h1>',
      sendEmail: true,
      sendInApp: false
    });
    console.log(res);
  } catch(e) { console.error(e); }
}
test();
