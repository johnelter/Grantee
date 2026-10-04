require('dotenv').config();
const supabase = require('./supabaseClient');

// ======================================================
// Brevo API Configuration
// ======================================================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@grantee.com';
const SENDER_NAME = 'Grantee Notifications';

// ======================================================
// Helper Functions & Templates
// ======================================================

/**
 * Checks user preferences to determine if an email should be sent.
 */
function isEmailEnabled(preferences, category) {
    if (!preferences) return true;
    if (category === 'security' || category === 'urgent' || category === 'SYSTEM_ERROR' || category === 'DEADLINE_REMINDER' || category === 'DEADLINE_APPROACHING') {
        return true;
    }
    if (category === 'deadlines' && preferences.deadlines !== undefined) {
        return preferences.deadlines !== false;
    }
    const catLower = (category || '').toLowerCase();
    if (catLower.includes('beneficiary') || catLower === 'grantee' || catLower.includes('enrolled')) {
        if (preferences.beneficiary !== undefined) return preferences.beneficiary !== false;
    }
    if (catLower.includes('application')) {
        if (preferences.applications !== undefined) return preferences.applications !== false;
    }
    if (catLower.includes('announcement')) {
        if (preferences.announcements !== undefined) return preferences.announcements !== false;
    }
    return preferences[category] !== false;
}

/**
 * Generates an ultra-clean, modern, branded HTML Email for Deadline Approaching reminders.
 */
function generateDeadlineEmailHtml({
    recipientName = 'Student',
    scholarshipTitle,
    schoolName,
    deadlineFormatted,
    diffDays,
    daysRemainingText,
    actionLink = null,
    category = 'Educational Assistance',
    scholarshipType = null,
    description = null
}) {
    const headerTitle = schoolName || 'Grantee Educational Assistance';
    const dateStr = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const rawBaseUrl = process.env.FRONTEND_URL || 'https://grantee-drab.vercel.app';
    const baseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/\/frontend$/, '');

    const targetUrl = actionLink
        ? (actionLink.startsWith('http') ? actionLink : `${baseUrl}/${actionLink.replace(/^\/+/, '')}`)
        : `${baseUrl}/student-scholarships.html`;

    // Visual urgency styles based on remaining days
    let badgeBg = '#fef3c7';
    let badgeColor = '#92400e';
    let badgeBorder = '#fde68a';
    let urgencyBadge = `⏰ ${diffDays} DAYS REMAINING`;
    let highlightBg = '#fffbeb';
    let highlightBorder = '#f59e0b';

    if (diffDays === 0) {
        badgeBg = '#fee2e2';
        badgeColor = '#991b1b';
        badgeBorder = '#fecaca';
        urgencyBadge = `🚨 FINAL HOURS — CLOSES TODAY!`;
        highlightBg = '#fef2f2';
        highlightBorder = '#ef4444';
    } else if (diffDays === 1) {
        badgeBg = '#ffedd5';
        badgeColor = '#9a3412';
        badgeBorder = '#fed7aa';
        urgencyBadge = `⚠️ URGENT — CLOSES TOMORROW!`;
        highlightBg = '#fff7ed';
        highlightBorder = '#f97316';
    }

    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.07);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
                <div style="text-transform: uppercase; font-size: 11px; letter-spacing: 2px; font-weight: 700; opacity: 0.9; margin-bottom: 4px;">Official Notification</div>
                <h1 style="margin: 0; font-size: 22px; font-weight: 700; line-height: 1.3;">${headerTitle}</h1>
            </div>

            <!-- Body Container -->
            <div style="padding: 32px 28px; background-color: #ffffff; color: #334155;">
                <!-- Urgency Badge -->
                <div style="text-align: center; margin-bottom: 24px;">
                    <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">
                        ${urgencyBadge}
                    </span>
                </div>

                <p style="margin-top: 0; font-size: 16px; color: #0f172a; font-weight: 600;">Hello ${recipientName},</p>
                
                <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
                    This is an important reminder that the application deadline for the educational assistance program at your enrolled institution is approaching fast.
                </p>

                <!-- Information Card -->
                <div style="background-color: ${highlightBg}; border-left: 4px solid ${highlightBorder}; border-radius: 8px; padding: 20px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; width: 140px; vertical-align: top;"><strong>Program:</strong></td>
                            <td style="padding: 6px 0; color: #0f172a; font-weight: 700; font-size: 15px;">${scholarshipTitle}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; vertical-align: top;"><strong>Institution:</strong></td>
                            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${schoolName || 'Your Enrolled School'}</td>
                        </tr>
                        ${category ? `
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; vertical-align: top;"><strong>Category:</strong></td>
                            <td style="padding: 6px 0; color: #334155;">${category}</td>
                        </tr>` : ''}
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; vertical-align: top;"><strong>Application Deadline:</strong></td>
                            <td style="padding: 6px 0; color: #b91c1c; font-weight: 700;">${deadlineFormatted}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; color: #64748b; vertical-align: top;"><strong>Time Remaining:</strong></td>
                            <td style="padding: 6px 0; color: #b91c1c; font-weight: 700;">${daysRemainingText}</td>
                        </tr>
                    </table>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #475569;">
                    If you haven't applied yet or have a pending draft, please log in to your student portal immediately to complete and submit your application along with all required documents before the system closes.
                </p>

                <!-- Call to Action Button -->
                <div style="text-align: center; margin: 32px 0 16px 0;">
                    <a href="${targetUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);">
                        View & Apply for Assistance &rarr;
                    </a>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f1f5f9; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.5;">
                <p style="margin: 0 0 4px 0;">You are receiving this notice because you are actively enrolled as a student at <strong>${schoolName || 'this institution'}</strong> in the Grantee System.</p>
                <p style="margin: 0; color: #94a3b8;">Sent on ${dateStr} &bull; Automated notification, please do not reply directly.</p>
            </div>
        </div>
    `;
}

/**
 * Centralized Email Template Generator
 */
function generateEmailTemplate(subject, bodyContent, schoolName = null, actionLink = null, recipientName = null) {
    const headerTitle = schoolName ? schoolName : 'Grantee';
    const dateStr = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const greeting = recipientName ? `<p style="margin-top: 0; font-weight: 600; color: #0f172a;">Hello ${recipientName},</p>` : '';
    const rawBaseUrl = process.env.FRONTEND_URL || 'https://grantee-drab.vercel.app';
    const baseUrl = rawBaseUrl.replace(/\/+$/, '').replace(/\/frontend$/, '');

    let targetUrl = `${baseUrl}/login.html`;
    let buttonText = 'Log In to Portal';

    if (actionLink && actionLink !== '#') {
        targetUrl = actionLink.startsWith('http') ? actionLink : `${baseUrl}/${actionLink.replace(/^\/+/, '')}`;
        if (actionLink.includes('scholarship') || actionLink.includes('assistance')) {
            buttonText = 'View Educational Assistance';
        } else if (actionLink.includes('application')) {
            buttonText = 'View Application';
        } else if (actionLink.includes('announcement')) {
            buttonText = 'View Announcement';
        } else {
            buttonText = 'View in Portal';
        }
    }

    const buttonHtml = `
        <div style="text-align: center; margin-top: 28px; margin-bottom: 12px;">
            <a href="${targetUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);">${buttonText}</a>
        </div>
    `;

    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); background-color: #ffffff;">
            <div style="background-color: #10b981; padding: 24px; text-align: center; color: #ffffff;">
                <h2 style="margin: 0; font-size: 22px; font-weight: 700;">${headerTitle}</h2>
            </div>
            <div style="padding: 32px; color: #334155; background-color: #ffffff;">
                <h3 style="margin-top: 0; font-size: 18px; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">${subject}</h3>
                <div style="font-size: 15px; line-height: 1.6;">
                    ${greeting}
                    ${bodyContent}
                    <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">Event time: ${dateStr}</p>
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
        case 'DEADLINE_REMINDER':
        case 'DEADLINE_APPROACHING':
            type = 'deadline'; priority = 'high'; actionLink = `student-scholarships.html${idParam}`; break;
        case 'APPLICATION_REJECTED':
            type = 'application'; priority = 'high'; actionLink = resourceId ? `student-applications.html?app_id=${resourceId}` : `student-applications.html`; break;
        case 'applications':
            type = 'application'; priority = 'high'; actionLink = resourceId ? `student-applications.html?app_id=${resourceId}` : `student-applications.html`; break;
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
        case 'announcements':
            type = 'announcement'; priority = 'low'; actionLink = `student-announcements.html${idParam}`; break;
        case 'BENEFICIARY_UPDATE':
        case 'DECISION_MADE':
            type = 'status'; priority = 'low'; actionLink = `admin-active-scholars.html${idParam}`; break;
        case 'APPLICATION_APPROVED':
        case 'BENEFICIARY_ENROLLED':
        case 'ACTIVE_BENEFICIARY_ENROLLED':
        case 'ACTIVE_BENEFICIARY':
            type = 'application'; priority = 'low'; actionLink = resourceId ? `student-applications.html?app_id=${resourceId}` : `student-applications.html`; break;
        case 'BENEFICIARY_REVOKED':
            type = 'application'; priority = 'high'; actionLink = resourceId ? `student-applications.html?app_id=${resourceId}` : `student-applications.html`; break;

        default:
            type = 'system'; priority = 'low'; actionLink = 'login.html';
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
            // Deduplication check for in-app notifications on the exact same subject & user within 20 hours
            const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
            const { data: existingInApp } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', userId)
                .eq('title', subject)
                .gte('created_at', twentyHoursAgo)
                .maybeSingle();

            if (!existingInApp) {
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
        }

        // 2. Resolve & Validate Target Email
        if (!sendEmail) return { status: 'skipped', reason: 'Email disabled by payload' };

        let finalRecipientEmail = recipientEmail;
        let recipientDisplayName = null;

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
                recipientDisplayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Student';
            }
        }

        if (!finalRecipientEmail) return { status: 'failed', error: 'No valid recipient email address found.' };

        // 3. Duplicate Prevention Logic for Email Logs
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

        const formattedHtml = htmlContent
            ? htmlContent
            : generateEmailTemplate(subject, `<p>${message}</p>`, schoolName, finalActionLink, recipientDisplayName);

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
            .select('first_name, last_name, school, school_id')
            .eq('id', adminId)
            .single();

        if (adminError || !admin) {
            console.error('[NotificationService] Admin profile not found.');
            return { success: false, error: 'Admin profile not found.' };
        }

        const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'School Administrator';
        const schoolName = admin.school;
        const schoolId = admin.school_id;

        if (!schoolId && !schoolName) {
            return { success: false, error: 'Admin has no school assigned. Cannot resolve target students.' };
        }

        let query = supabase
            .from('profiles')
            .select('id, email, first_name, last_name, email_preferences')
            .eq('role', 'student');

        if (schoolId) {
            query = query.eq('school_id', schoolId);
        } else {
            query = query.eq('school', schoolName);
        }

        const { data: students, error: studentsError } = await query;

        if (studentsError || !students || students.length === 0) {
            console.log(`[NotificationService] No target students found for school: ${schoolName || schoolId}`);
            return { success: true, count: 0, school: schoolName };
        }

        const contextualHtml = `
            <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 6px;">
                <p style="margin: 0; font-size: 14px; color: #166534;">
                    <strong>Posted by:</strong> ${adminName} <br>
                    <strong>Institution:</strong> ${schoolName || 'Your School'}
                </p>
            </div>
            ${htmlContent || `<p>${message}</p>`}
        `;

        let sentCount = 0;
        const notificationPromises = students.map(student =>
            sendNotification({
                userId: student.id,
                recipientEmail: student.email,
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
            .select('id, email, first_name, last_name')
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
                sendEmail: true,
                sendInApp: true,
                customActionLink: 'admin-scholarships.html'
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

// ======================================================
// Approaching Deadline Notification Engine
// ======================================================

/**
 * Notifies ONLY the students enrolled in the specific institution that offers
 * an Educational Assistance program whose deadline is fast approaching.
 */
async function notifySchoolStudentsAboutDeadline({
    scholarship,
    diffDays,
    schoolName,
    deadlineFormatted,
    daysText
}) {
    if (!scholarship || !scholarship.school_id) {
        console.warn('[NotificationService] Skipping scholarship without school_id:', scholarship?.title);
        return { success: false, count: 0, reason: 'Missing school_id on scholarship' };
    }

    try {
        // Find ALL students enrolled in this specific institution
        const { data: students, error: studentError } = await supabase
            .from('profiles')
            .select('id, email, first_name, last_name, email_preferences')
            .eq('role', 'student')
            .eq('school_id', scholarship.school_id);

        if (studentError) {
            console.error(`[NotificationService] Error fetching students for school ${scholarship.school_id}:`, studentError);
            return { success: false, count: 0, error: studentError.message };
        }

        if (!students || students.length === 0) {
            console.log(`[NotificationService] No enrolled students found for school ID ${scholarship.school_id} (${schoolName})`);
            return { success: true, count: 0, school: schoolName };
        }

        // Craft subject line with urgency indicators
        let subjectUrgency = `${diffDays} days left`;
        if (diffDays === 0) {
            subjectUrgency = 'TODAY IS THE LAST DAY!';
        } else if (diffDays === 1) {
            subjectUrgency = 'TOMORROW IS THE DEADLINE!';
        }

        const emailSubject = `⏰ Urgent Reminder: Application Deadline Approaching for ${scholarship.title} (${subjectUrgency})`;
        const inAppTitle = `Deadline Approaching: ${scholarship.title}`;
        const inAppMessage = `The application deadline for ${scholarship.title} at ${schoolName || 'your institution'} is ${diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`} (${deadlineFormatted}). Submit your application before it closes!`;

        let sentCount = 0;
        const milestoneResourceId = `${scholarship.id}_deadline_${diffDays}d`;

        const notificationPromises = students.map(async (student) => {
            if (!student.email) return;

            const studentName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';

            // Generate targeted rich HTML email
            const emailHtml = generateDeadlineEmailHtml({
                recipientName: studentName,
                scholarshipTitle: scholarship.title,
                schoolName: schoolName,
                deadlineFormatted: deadlineFormatted,
                diffDays: diffDays,
                daysRemainingText: daysText,
                actionLink: `student-scholarships.html?id=${scholarship.id}`,
                category: scholarship.category || 'Educational Assistance',
                scholarshipType: scholarship.scholarship_type,
                description: scholarship.description
            });

            const result = await sendNotification({
                userId: student.id,
                recipientEmail: student.email,
                eventType: 'DEADLINE_REMINDER',
                resourceId: milestoneResourceId,
                subject: emailSubject,
                message: inAppMessage,
                htmlContent: emailHtml,
                sendEmail: true,
                sendInApp: true,
                schoolName: schoolName,
                customActionLink: `student-scholarships.html?id=${scholarship.id}`
            });

            if (result.status === 'sent' || result.status === 'skipped') {
                sentCount++;
            }
        });

        await Promise.allSettled(notificationPromises);

        console.log(`[NotificationService] Deadline reminder (${diffDays}d) dispatched to ${sentCount}/${students.length} enrolled students at ${schoolName || scholarship.school_id}.`);
        return { success: true, count: sentCount, totalStudents: students.length, school: schoolName };

    } catch (err) {
        console.error('[NotificationService] notifySchoolStudentsAboutDeadline Error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Checks all active Educational Assistance programs and sends approaching deadline notifications
 * to enrolled students of the specific institution and school coordinators.
 *
 * Supported milestone days: [7, 5, 3, 2, 1, 0] (e.g., 7 days, 5 days, 3 days, 2 days, 1 day, and 0 days / today).
 */
async function checkAndNotifyApproachingDeadlines({
    targetDays = [7, 5, 3, 2, 1, 0],
    schoolId = null
} = {}) {
    console.log('[NotificationService] Running approaching deadline check...');

    try {
        // 1. Fetch schools mapping for human-readable institution names
        const { data: schoolsData, error: schoolsError } = await supabase
            .from('schools')
            .select('id, name');

        const schoolsMap = {};
        if (!schoolsError && schoolsData) {
            schoolsData.forEach(s => {
                schoolsMap[s.id] = (s.name || '').trim();
            });
        }

        // 2. Query all active / upcoming scholarships
        let query = supabase
            .from('scholarships')
            .select('id, title, category, scholarship_type, description, start_date, end_date, school_id, status')
            .neq('status', 'Draft')
            .neq('status', 'Closed');

        if (schoolId) {
            query = query.eq('school_id', schoolId);
        }

        const { data: scholarships, error: scholError } = await query;

        if (scholError) {
            console.error('[NotificationService] Error fetching scholarships:', scholError);
            return { success: false, error: scholError.message };
        }

        if (!scholarships || scholarships.length === 0) {
            console.log('[NotificationService] No active scholarships found for deadline check.');
            return { success: true, processedScholarships: 0, notifiedStudents: 0, details: [] };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalNotifiedStudents = 0;
        let totalNotifiedCoordinators = 0;
        const processDetails = [];

        for (const schol of scholarships) {
            const rawDeadline = schol.end_date;
            if (!rawDeadline) continue;

            const deadlineDate = new Date(rawDeadline);
            deadlineDate.setHours(0, 0, 0, 0);

            // Difference in calendar days
            const diffTime = deadlineDate.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            // Check if diffDays matches approaching target milestones
            if (targetDays.includes(diffDays)) {
                const schoolName = schoolsMap[schol.school_id] || 'Partner Institution';
                const formattedDeadline = deadlineDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                let daysText = `${diffDays} day(s) remaining`;
                if (diffDays === 0) daysText = 'Closes Today (Final Day)';
                else if (diffDays === 1) daysText = 'Closes Tomorrow (1 day left)';

                console.log(`[NotificationService] Approaching deadline detected for "${schol.title}" at "${schoolName}" (${daysText})`);

                // 1. Notify ONLY the students enrolled in this specific institution
                const studentResult = await notifySchoolStudentsAboutDeadline({
                    scholarship: schol,
                    diffDays,
                    schoolName,
                    deadlineFormatted: formattedDeadline,
                    daysText
                });

                if (studentResult.success) {
                    totalNotifiedStudents += (studentResult.count || 0);
                }

                // 2. Also notify the school coordinators of this institution
                const coordResult = await notifyCoordinators({
                    schoolId: schol.school_id,
                    eventType: 'DEADLINE_REMINDER',
                    subject: `[Coordinator Alert] Application Deadline Approaching: ${schol.title} (${daysText})`,
                    message: `The application deadline for ${schol.title} is ${diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : `in ${diffDays} day(s)`} (${formattedDeadline}).`,
                    resourceId: `${schol.id}_coord_deadline_${diffDays}d`,
                    htmlContent: `
                        <div style="padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 8px 0; color: #92400e;">Deadline Reminder: ${schol.title}</h4>
                            <p style="margin: 0; color: #78350f; font-size: 14px;">
                                The application deadline for <strong>${schol.title}</strong> at <strong>${schoolName}</strong> is approaching in <strong>${daysText}</strong> (${formattedDeadline}).
                            </p>
                        </div>
                        <p>Please review pending applications and encourage eligible students to complete their requirements before the deadline.</p>
                    `
                });

                if (coordResult.success) {
                    totalNotifiedCoordinators += (coordResult.count || 0);
                }

                processDetails.push({
                    scholarshipId: schol.id,
                    title: schol.title,
                    schoolId: schol.school_id,
                    schoolName: schoolName,
                    deadline: rawDeadline,
                    formattedDeadline: formattedDeadline,
                    diffDays: diffDays,
                    studentsNotified: studentResult.count || 0,
                    coordinatorsNotified: coordResult.count || 0
                });
            }
        }

        const summary = {
            success: true,
            timestamp: new Date().toISOString(),
            processedScholarships: scholarships.length,
            approachingScholarshipsCount: processDetails.length,
            totalNotifiedStudents,
            totalNotifiedCoordinators,
            details: processDetails
        };

        console.log(`[NotificationService] Approaching deadline check completed: ${totalNotifiedStudents} students & ${totalNotifiedCoordinators} coordinators notified across ${processDetails.length} programs.`);
        return summary;

    } catch (err) {
        console.error('[NotificationService] checkAndNotifyApproachingDeadlines Critical Error:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    sendNotification,
    sendTargetedSchoolNotification,
    notifyCoordinators,
    sendRawEmail,
    generateEmailTemplate,
    generateDeadlineEmailHtml,
    notifySchoolStudentsAboutDeadline,
    checkAndNotifyApproachingDeadlines
};