const supabase = require('../supabaseClient');
const { sendNotification, notifyCoordinators } = require('../notificationService');

// In-memory per-scholarship lock mutex to serialize concurrent incoming requests
const scholarshipLocks = new Map();

async function acquireScholarshipLock(scholarshipId) {
    const key = String(scholarshipId);
    while (scholarshipLocks.has(key)) {
        await scholarshipLocks.get(key);
    }
    let release;
    const lockPromise = new Promise((resolve) => {
        release = resolve;
    });
    scholarshipLocks.set(key, lockPromise);
    return () => {
        scholarshipLocks.delete(key);
        release();
    };
}

/**
 * Atomic Application Submission Handler
 * Handles concurrency control, atomic slot reservation, FCFS timestamping,
 * and automatic waitlisting for excess applicants.
 */
const submitApplication = async (req, res) => {
    const {
        student_id,
        scholarship_id,
        form_responses,
        documents,
        student_name,
        student_school_id,
        gwa,
        docs_completed_at
    } = req.body;

    if (!student_id || !scholarship_id) {
        return res.status(400).json({
            success: false,
            error: 'student_id and scholarship_id are required.'
        });
    }

    // 1. Acquire pessimistic lock for this specific scholarship
    const releaseLock = await acquireScholarshipLock(scholarship_id);

    try {
        const serverTimestamp = new Date().toISOString();

        // 2. Fetch latest scholarship status under lock
        const { data: scholarship, error: schError } = await supabase
            .from('scholarships')
            .select('*')
            .eq('id', scholarship_id)
            .single();

        if (schError || !scholarship) {
            return res.status(404).json({
                success: false,
                error: 'Scholarship program not found.'
            });
        }

        // 3. Check Deadline
        if (scholarship.end_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const endDate = new Date(scholarship.end_date);
            endDate.setHours(23, 59, 59, 999);

            if (today > endDate) {
                return res.status(400).json({
                    success: false,
                    error: 'Applications for this educational assistance program are now closed (deadline passed).'
                });
            }
        }

        // 4. Duplicate Check (Prevent multiple active applications for same student & scholarship)
        const { data: existingApp, error: dupError } = await supabase
            .from('applications')
            .select('id, status')
            .eq('student_id', student_id)
            .eq('scholarship_id', scholarship_id)
            .maybeSingle();

        if (existingApp && !['rejected', 'declined', 'revoked', 'withdrawn'].includes((existingApp.status || '').toLowerCase())) {
            return res.status(400).json({
                success: false,
                error: `You already have an existing application for this program (Status: ${existingApp.status}).`
            });
        }

        // 5. Evaluate Slot Availability Under Lock
        const isUnlimited = scholarship.slots === 'Open' || !scholarship.slots || String(scholarship.slots).toLowerCase() === 'open';
        let availableSlots = 0;

        if (isUnlimited) {
            availableSlots = 999999;
        } else if (scholarship.available_slots !== undefined && scholarship.available_slots !== null && !isNaN(parseInt(scholarship.available_slots, 10))) {
            availableSlots = parseInt(scholarship.available_slots, 10);
        } else {
            const maxSlots = parseInt(scholarship.slots, 10) || 0;
            const { data: activeApps } = await supabase
                .from('applications')
                .select('id, status')
                .eq('scholarship_id', scholarship_id);

            const occupiedCount = (activeApps || []).filter(app => {
                const st = (app.status || '').toLowerCase().trim();
                return !['rejected', 'declined', 'revoked', 'withdrawn', 'draft', 'waitlisted'].includes(st);
            }).length;

            availableSlots = Math.max(0, maxSlots - occupiedCount);
        }

        // 6. ALLOCATION DECISION
        if (availableSlots > 0) {
            // === PRIMARY SLOT RESERVATION ===
            const newAvail = isUnlimited ? null : Math.max(0, availableSlots - 1);

            // Update remaining slots in scholarships table
            if (!isUnlimited) {
                await supabase
                    .from('scholarships')
                    .update({ available_slots: newAvail, updated_at: serverTimestamp })
                    .eq('id', scholarship_id);
            }

            // Insert application with 'Pending' status (Slot Reserved)
            const payload = {
                student_id,
                scholarship_id,
                status: 'Pending',
                form_responses: form_responses || {},
                documents: documents || [],
                created_at: serverTimestamp,
                remarks: `Primary slot secured at ${serverTimestamp}.`
            };

            const { data: newApp, error: insertError } = await supabase
                .from('applications')
                .insert([payload])
                .select()
                .single();

            if (insertError) throw insertError;

            // Send Confirmation In-App Notification & Email
            const notifPayload = {
                userId: student_id,
                eventType: 'applications',
                subject: 'Application Submitted - Slot Secured',
                message: `Your application for ${scholarship.title} was received and a slot has been reserved.`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: #1F3D2E; margin-top: 0;">Application Submitted & Slot Reserved</h2>
                        <p>Your educational assistance application for <strong>${scholarship.title}</strong> has been successfully received.</p>
                        <p><strong>Status:</strong> Slot Reserved (Under Review)</p>
                        <p><strong>Server Timestamp:</strong> ${serverTimestamp}</p>
                    </div>
                `,
                sendEmail: true,
                sendInApp: true
            };

            sendNotification(notifPayload).catch(err => console.error("Notification error:", err));

            // Notify Coordinators
            if (student_school_id || scholarship.school_id) {
                notifyCoordinators({
                    schoolId: student_school_id || scholarship.school_id,
                    eventType: 'NEW_APPLICATION',
                    subject: 'New Application Received',
                    message: `New application received from ${student_name || 'a student'} for ${scholarship.title}.`,
                    resourceId: scholarship_id
                }).catch(err => console.error("Coordinator notification error:", err));
            }

            return res.status(200).json({
                success: true,
                status: 'Accepted',
                isWaitlisted: false,
                message: 'Your educational assistance application has been successfully submitted and a slot has been reserved.',
                application_id: newApp.id,
                remaining_slots: newAvail,
                timestamp: serverTimestamp
            });

        } else {
            // === SLOTS FULL: PLACE ON WAITLIST ===
            // Count current waitlist to assign next queue number
            const { count: waitlistCount } = await supabase
                .from('applications')
                .select('*', { count: 'exact', head: true })
                .eq('scholarship_id', scholarship_id)
                .eq('status', 'Waitlisted');

            const waitlistPosition = (waitlistCount || 0) + 1;

            const waitlistRemarks = `All primary slots filled. Placed on Waitlist at Position #${waitlistPosition} (Server timestamp: ${serverTimestamp}).`;

            const payload = {
                student_id,
                scholarship_id,
                status: 'Waitlisted',
                form_responses: form_responses || {},
                documents: documents || [],
                created_at: serverTimestamp,
                remarks: waitlistRemarks
            };

            const { data: waitlistApp, error: waitlistError } = await supabase
                .from('applications')
                .insert([payload])
                .select()
                .single();

            if (waitlistError) throw waitlistError;

            // Send Waitlist Notification
            sendNotification({
                userId: student_id,
                eventType: 'applications',
                subject: `Application Waitlisted - Position #${waitlistPosition}`,
                message: `All regular slots for ${scholarship.title} were filled. You have been placed on the Waitlist at Position #${waitlistPosition}.`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8fafc; border-radius: 10px;">
                        <h2 style="color: #d97706; margin-top: 0;">Application Placed on Waitlist</h2>
                        <p>All primary slots for <strong>${scholarship.title}</strong> have just been filled.</p>
                        <p>Your application has been received and assigned to <strong>Waitlist Position #${waitlistPosition}</strong>.</p>
                        <p>If any accepted applicant cancels or is deemed ineligible, waitlisted applicants will be promoted in order of their position.</p>
                    </div>
                `,
                sendEmail: true,
                sendInApp: true
            }).catch(err => console.error("Waitlist notification error:", err));

            return res.status(200).json({
                success: true,
                status: 'Waitlisted',
                isWaitlisted: true,
                waitlist_position: waitlistPosition,
                message: `All primary slots have just been filled. Your application has been placed on the Waitlist at Position #${waitlistPosition}.`,
                application_id: waitlistApp.id,
                timestamp: serverTimestamp
            });
        }

    } catch (error) {
        console.error('Submit application error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to process application.'
        });
    } finally {
        // Always release lock so next concurrent request can proceed
        releaseLock();
    }
};

module.exports = {
    submitApplication
};
