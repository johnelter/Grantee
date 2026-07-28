const supabase = require('../supabaseClient');
// Import both sendTargetedSchoolNotification and sendNotification from the service
const { sendTargetedSchoolNotification, sendNotification } = require('../notificationService'); 

const createAnnouncement = async (req, res) => {
    try {
        // 1. Get data from the frontend request payload
        const { title, excerpt, full_content, adminId } = req.body; 

        // 2. Save the announcement to the database
        const { data: newAnnouncement, error: dbError } = await supabase
            .from('announcements')
            .insert([{ title, excerpt, full_content, admin_id: adminId }])
            .select()
            .single();

        if (dbError) throw dbError;

        // 3. Insert In-App Notification (For the admin's notification bell)
        // Utilizes the centralized service to automatically apply Type, Priority, and Links
        await sendNotification({
            userId: adminId, 
            eventType: 'ANNOUNCEMENT_PUBLISHED', // Triggers Low Priority (Green) and fa-bullhorn icon
            resourceId: newAnnouncement.id,
            subject: 'Announcement Published',
            message: `You successfully posted: ${title}`,
            sendEmail: false, // Prevents sending an email to the admin for their own post
            sendInApp: true
        });

        // 4. Trigger the Targeted Email Service (Broadcast to assigned students)
        await sendTargetedSchoolNotification({
            adminId: adminId,
            eventType: 'ANNOUNCEMENT_PUBLISHED', 
            resourceId: newAnnouncement.id,
            subject: `New Announcement: ${title}`,
            message: excerpt,
            htmlContent: `<p>${full_content}</p>`
        });

        // 5. Send success response back to frontend
        res.status(201).json({
            success: true,
            message: 'Announcement posted successfully!',
            data: newAnnouncement
        });

    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ success: false, error: 'Failed to create announcement.' });
    }
};

// Exporting using standard CommonJS module syntax
module.exports = {
    createAnnouncement
};