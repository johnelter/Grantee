const supabase = require('../supabaseClient');
const { sendNotification } = require('../notificationService'); 

const createComment = async (req, res) => {
    try {
        // 1. Extract data from the frontend request
        // Ensure your frontend fetch/axios call is actually sending these exact keys!
        const { announcement_id, user_id, content, student_name } = req.body; 

        // 2. Insert the comment into the database
        const { data: comment, error: commentError } = await supabase
            .from('comments')
            .insert([{ announcement_id, user_id, content }])
            .select()
            .single();

        if (commentError) {
            console.error('Database Error inserting comment:', commentError);
            throw commentError;
        }

        // 3. Fetch the announcement to find the Admin who posted it
        // IMPORTANT: Verify that the column name in your announcements table is exactly 'admin_id'
        const { data: announcement, error: announcementError } = await supabase
            .from('announcements')
            .select('admin_id, title') 
            .eq('id', announcement_id)
            .single();

        if (announcementError) {
            console.error("Could not find announcement to notify admin:", announcementError);
        }

        // 4. Trigger Notification to the Admin
        if (announcement && announcement.admin_id) {
            await sendNotification({
                userId: announcement.admin_id, 
                eventType: 'NEW_COMMENT', // Triggers Medium Priority (Yellow) and comment icon
                resourceId: announcement_id,
                subject: 'New Student Comment',
                message: `${student_name || 'A student'} commented on "${announcement.title}".`,
                sendEmail: true, 
                sendInApp: true
            });
        }

        // 5. Return success to the frontend
        res.status(201).json({ success: true, comment });
        
    } catch (error) {
        console.error('Critical Error in createComment:', error);
        res.status(500).json({ success: false, error: 'Failed to post comment' });
    }
};

module.exports = { 
    createComment 
};