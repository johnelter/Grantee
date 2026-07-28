const supabase = require('./supabaseClient');

// ======================================================
// Brevo API Configuration
// ======================================================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@grantee.com';
const SENDER_NAME = 'Grantee Notifications';

// ======================================================
// Helper Functions
// ======================================================

/**
 * Checks user preferences to determine if an email should be sent.
 */
function isEmailEnabled(preferences, category) {
    if (!preferences) return true;
    if (category === 'security' || category === 'urgent' || category === 'SYSTEM_ERROR') return true;
    return preferences[category] !== false;
}

/**
 * Centralized Email Template Generator
 */
function generateEmailTemplate(subject, bodyContent, schoolName = null, actionLink = null, adminName = null) {
    const headerTitle = schoolName ? schoolName : 'Grantee';
    const dateStr = new Date().toLocaleString();
    const adminGreeting = adminName ? `<p style="margin-top: 0;">Hello ${adminName},</p>` : '';
    const buttonHtml = actionLink && actionLink !== '#' ? `
        <div style="text-align: center; margin-top: 24px;">
            <a href="http://localhost:3000${actionLink}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">View Details</a>
        </div>
    ` : '';

    return `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="background-color: #10b981; padding: 24px; text-align: center; color: #ffffff;">
                <h2 style="margin: 0; font-size: 22px; font-weight: 700;">${headerTitle}</h2>
            </div>
            <div style="padding: 32px; color: #334155; background-color: #ffffff;">
                <h3 style="margin-top: 0; font-size: 18px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">${subject}</h3>
                <div style="font-size: 15px; line-height: 1.6;">
                    ${adminGreeting}
                    ${bodyContent}
                    <p style="margin-top: 16px; font-size: 13px; color: #64748b;">Event time: ${dateStr}</p>
                    ${buttonHtml}
                </div>
            </div>
            <div style="background-color: #f8fafc; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0;">This is an automated message from the Grantee System. Please do not reply directly to this email.</p>
            </div>
        </div>
    `;
}

/**
 * Internal Helper to send payload to Brevo API
 */
async function dispatchBrevoEmail(toEmail, subject, htmlContent) {
    if (!BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY environment variable.");

    const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: SENDER_NAME, email: SENDER_EMAIL },
            to: [{ email: toEmail }],
            subject: subject,
            htmlContent: htmlContent
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Brevo API request failed');
    }

    return await response.json();
}

/**
 * Automates the Type, Priority, and Redirection Links based on Event Type
 */
function getNotificationMetadata(eventType, resourceId) {
    let type = 'system';
    let priority = 'low';
    let actionLink = '#';
    const idParam = resourceId ? `?id=${resourceId}` : '';

    switch (eventType) {
        // --- HIGH PRIORITY (Red) ---
        case 'NEW_APPLICATION':
            type = 'application'; priority = 'high'; actionLink = `admin-applications.html${idParam}`; break;
        case 'DOCUMENT_RESUBMITTED':
            type = 'document'; priority = 'high'; actionLink = `admin-applications.html${idParam}`; break;
        case 'SLOT_LIMIT_REACHED':
            type = 'alert'; priority = 'high'; actionLink = `admin-scholarships.html`; break;
        case 'PENDING_REVIEW_REMINDER':
            type = 'alert'; priority = 'high'; actionLink = `admin-applications.html?filter=pending`; break;
        case 'EMAIL_DELIVERY_FAILURE':
        case 'SYSTEM_ERROR':
            type = 'system'; priority = 'high'; actionLink = `admin-dashboard.html`; break;

        // --- MEDIUM PRIORITY (Yellow) ---
        case 'NEW_COMMENT':
        case 'REPLY_COMMENT':
            type = 'comment'; priority = 'medium'; actionLink = `admin-announcements.html${idParam}`; break;
        case 'AI_MODERATION_ALERT':
            type = 'alert'; priority = 'medium'; actionLink = `admin-announcements.html?filter=flagged`; break;
        case 'IMPORT_COMPLETED':
        case 'IMPORT_FAILED':
            type = 'import'; priority = 'medium'; actionLink = `admin-students.html`; break;

        // --- LOW PRIORITY (Green) ---
        case 'ANNOUNCEMENT_PUBLISHED':
        case 'SCHEDULED_ANNOUNCEMENT_PUBLISHED':
            type = 'announcement'; priority = 'low'; actionLink = `admin-announcements.html${idParam}`; break;
        case 'DEADLINE_REMINDER':
            type = 'deadline'; priority = 'low'; actionLink = `admin-scholarships.html${idParam}`; break;
        case 'BENEFICIARY_UPDATE':
        case 'DECISION_MADE':
            type = 'status'; priority = 'low'; actionLink = `admin-active-scholars.html${idParam}`; break;
        case 'EDUCATIONAL_ASSISTANCE_CLOSED':
            type = 'alert'; priority = 'low'; actionLink = `admin-scholarships.html${idParam}`; break;


        default:
            type = 'system'; priority = 'low'; actionLink = '#';
    }

    return { type, priority, actionLink };
}

// ======================================================
// Core Notification Service
// ======================================================

/**
 * Centralized function to dispatch a SINGLE system notification (In-App + Email).
 */
async function sendNotification({
    userId,
    recipientEmail,
    eventType,
    resourceId,
    subject,
    message,
    htmlContent,
    sendEmail = true,
    sendInApp = true,
    schoolName = null,
    customActionLink = null // Optional override for the automated routing
}) {
    try {
        const metadata = getNotificationMetadata(eventType, resourceId);
        const finalActionLink = customActionLink || metadata.actionLink;

        // 1. Create In-App Notification (Matches strictly to the updated schema)
        if (sendInApp && userId) {
            const { error: inAppError } = await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    title: subject,
                    message: message,
                    is_read: false,
                    type: metadata.type,
                    priority: metadata.priority,
                    action_link: finalActionLink
                });

            if (inAppError) console.error('[NotificationService] In-app notification error:', inAppError);
        }

        // 2. Resolve & Validate Target Email
        if (!sendEmail) return { status: 'skipped', reason: 'Email disabled by payload' };

        let finalRecipientEmail = recipientEmail;
        let adminName = null;

        if (userId) {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('email, email_preferences, first_name, last_name')
                .eq('id', userId)
                .single();

            if (profileError) return { status: 'failed', error: 'Could not resolve user profile for email.' };

            if (profile) {
                if (!isEmailEnabled(profile.email_preferences, eventType)) {
                    return { status: 'skipped', reason: 'User opted out of this email category' };
                }
                finalRecipientEmail = profile.email;
                adminName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Coordinator';
            }
        }

        if (!finalRecipientEmail) return { status: 'failed', error: 'No valid recipient email address found.' };

        // 3. Duplicate Prevention Logic
        if (userId && resourceId) {
            const { data: existingLog } = await supabase
                .from('email_logs')
                .select('id, status')
                .eq('user_id', userId)
                .eq('event_type', eventType)
                .eq('resource_id', resourceId)
                .eq('status', 'sent')
                .maybeSingle();

            if (existingLog) return { status: 'skipped', reason: 'Duplicate email prevented (already sent)' };
        }

        // 4. Create Pending Email Log
        let logId = null;
        if (userId) {
            const { data: logEntry } = await supabase
                .from('email_logs')
                .insert({
                    user_id: userId,
                    event_type: eventType,
                    resource_id: resourceId || null,
                    recipient_email: finalRecipientEmail,
                    status: 'pending'
                })
                .select('id')
                .single();
            if (logEntry) logId = logEntry.id;
        }

        // 5. Dispatch Email via Brevo REST API
        let emailStatus = 'pending';
        let errorMessage = null;

        const formattedHtml = generateEmailTemplate(subject, htmlContent || `<p>${message}</p>`, schoolName, finalActionLink, adminName);

        try {
            await dispatchBrevoEmail(finalRecipientEmail, subject, formattedHtml);
            emailStatus = 'sent';
        } catch (err) {
            emailStatus = 'failed';
            errorMessage = err.message || 'Unknown Brevo API error';
            console.error('[NotificationService] Dispatch failed:', errorMessage);
        }

        // 6. Update Database Log
        if (logId) {
            await supabase.from('email_logs').update({ status: emailStatus, error_message: errorMessage }).eq('id', logId);
        }

        return { status: emailStatus, error: errorMessage };

    } catch (err) {
        console.error('[NotificationService] Critical Execution Error:', err);
        throw err;
    }
}

// ======================================================
// Batch & Targeted Services
// ======================================================

/**
 * Broadcasts an email to all students matching the triggering Admin's school.
 */
async function sendTargetedSchoolNotification({
    adminId,
    eventType,
    resourceId,
    subject,
    message,
    htmlContent
}) {
    try {
        const { data: admin, error: adminError } = await supabase
            .from('profiles')
            .select('first_name, last_name, school')
            .eq('id', adminId)
            .single();

        if (adminError || !admin) {
            console.error('[NotificationService] Admin profile not found.');
            return { success: false, error: 'Admin profile not found.' };
        }

        const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'School Administrator';
        const schoolName = admin.school;

        if (!schoolName) {
            return { success: false, error: 'Admin has no school assigned. Cannot resolve target students.' };
        }

        const { data: students, error: studentsError } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('school', schoolName)
            .not('student_id', 'is', null);

        if (studentsError || !students || students.length === 0) {
            console.log(`[NotificationService] No target students found for school: ${schoolName}`);
            return { success: true, count: 0, school: schoolName };
        }

        const contextualHtml = `
            <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 6px;">
                <p style="margin: 0; font-size: 14px; color: #166534;">
                    <strong>Posted by:</strong> ${adminName} <br>
                    <strong>Institution:</strong> ${schoolName}
                </p>
            </div>
            ${htmlContent || `<p>${message}</p>`}
        `;

        let sentCount = 0;
        const notificationPromises = students.map(student =>
            sendNotification({
                userId: student.id,
                eventType,
                resourceId,
                subject,
                message,
                htmlContent: contextualHtml,
                schoolName: schoolName
            }).then(result => {
                if (result.status === 'sent' || result.status === 'skipped') sentCount++;
            })
        );

        await Promise.allSettled(notificationPromises);

        console.log(`[NotificationService] Successfully processed school notification for ${sentCount}/${students.length} students at ${schoolName}.`);
        return { success: true, count: sentCount, school: schoolName };

    } catch (error) {
        console.error('[NotificationService] Targeted Notification Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Raw Email Sender
 */
async function sendRawEmail({ to, subject, htmlContent }) {
    const formattedHtml = generateEmailTemplate(subject, htmlContent);
    try {
        await dispatchBrevoEmail(to, subject, formattedHtml);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Notify all admins/coordinators of a specific school (or all if no school provided)
 */
async function notifyCoordinators({ schoolId, eventType, subject, message, resourceId, htmlContent }) {
    try {
        let query = supabase
            .from('profiles')
            .select('id, email')
            .in('role', ['admin', 'coordinator']);

        if (schoolId) {
            query = query.eq('school_id', schoolId);
        }

        const { data: admins, error: adminsError } = await query;

        if (adminsError || !admins || admins.length === 0) {
            console.log(`[NotificationService] No admins found for school: ${schoolId}`);
            return { success: true, count: 0 };
        }

        let sentCount = 0;
        const notificationPromises = admins.map(admin =>
            sendNotification({
                userId: admin.id,
                recipientEmail: admin.email,
                eventType,
                resourceId,
                subject,
                message,
                htmlContent,
                sendEmail: true, // Notify on the admin email account
                sendInApp: true
            }).then(result => {
                if (result.status === 'sent' || result.status === 'skipped' || result.status === 'pending') sentCount++;
            })
        );

        await Promise.allSettled(notificationPromises);
        console.log(`[NotificationService] Dispatched ${sentCount} notifications to coordinators of ${schoolId || 'All'}.`);

        return { success: true, count: sentCount };
    } catch (error) {
        console.error('[NotificationService] notifyCoordinators Error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendNotification,
    sendTargetedSchoolNotification,
    notifyCoordinators,
    sendRawEmail,
    generateEmailTemplate
};