require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const supabase = require('./supabaseClient');
const { validateDocumentWithGemini } = require('./ocrService');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Set up Multer to store uploaded files in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });


// ============================================================================
// 1. SMART AI OCR VALIDATOR (Direct to Gemini)
// ============================================================================
app.post('/api/validate-document', upload.single('document'), async (req, res) => {
    console.log("Request received!");
    try {
        if (!req.file) {
            console.log("No file detected in request");
            return res.status(400).json({ error: 'No document uploaded' });
        }

        console.log("File received, name:", req.file.originalname);
        
        // Destructure ALL variables from req.body exactly once
        const { 
            documentType, 
            applicantName, 
            minHsAvg, 
            minCollegeGwa, 
            minHsSubject, 
            minCollegeSubject 
        } = req.body;
        
        const fileBuffer = req.file.buffer;
        const mimeType = req.file.mimetype; // Tells Gemini if it's an image or a PDF

        console.log(`Received ${mimeType}. Passing directly to Gemini AI for high-speed validation...`);

        // Pass all variables to the updated OCR service function
        const validationResult = await validateDocumentWithGemini(
            fileBuffer,
            mimeType,
            documentType,
            applicantName,
            minHsAvg,
            minCollegeGwa,
            minHsSubject,       // NEW
            minCollegeSubject   // NEW
        );

        console.log('Validation complete!');
        res.status(200).json(validationResult);

    } catch (error) {
        console.error("Endpoint Error:", error);
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 2. MASTERLIST VALIDATOR ROUTE
// ============================================================================
app.post('/api/validate-student', async (req, res) => {
    const studentIdInput = (req.body.studentId || '').trim();
    const typedNameInput = (req.body.typedName || '').trim().toLowerCase();
    const googleNameInput = (req.body.googleName || '').trim().toLowerCase();

    try {
        const { data: masterlistRow, error } = await supabase
            .from('enrolled_masterlist')
            .select('*')
            .eq('id_number', studentIdInput)
            .single();

        if (error || !masterlistRow) {
            return res.status(400).json({ error: "Student ID Number not found in the enrolled masterlist." });
        }

        const dbFirstName = (masterlistRow.first_name || '').trim();
        const dbMiddleName = (masterlistRow.middle_name && masterlistRow.middle_name !== 'NULL') ? masterlistRow.middle_name.trim() : '';
        const dbLastName = (masterlistRow.last_name || '').trim();

        const dbFullName = `${dbFirstName} ${dbMiddleName} ${dbLastName}`.replace(/\s+/g, ' ').trim().toLowerCase();

        const matchesTyped = dbFullName.includes(typedNameInput) || typedNameInput.includes(dbFullName);
        const matchesGoogle = dbFullName.includes(googleNameInput) || googleNameInput.includes(dbFullName);

        if (!matchesTyped && !matchesGoogle) {
            return res.status(400).json({
                error: "Provided name details do not match the official record for this Student ID."
            });
        }

        res.status(200).json({ message: "Verification confirmed. Student is actively enrolled." });

    } catch (err) {
        res.status(500).json({ error: "Internal validation server error: " + err.message });
    }
});


// ============================================================================
// 3. STUDENT DASHBOARD METRICS
// ============================================================================
app.get('/api/student-dashboard/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const { data: apps, error: appsError } = await supabase
            .from('profiles')
            .select('id, id_number')
            .eq('id', userId);

        if (appsError) throw appsError;

        res.status(200).json({
            metrics: {
                total: 2,
                pending: 1,
                approved: 1,
                rejected: 0
            },
            recentApplications: [
                { scholarship: "Academic Excellence Scholarship", status: "Pending", date: "May 20, 2026" },
                { scholarship: "STEM Scholarship", status: "Approved", date: "May 10, 2026" }
            ],
            availableScholarships: [
                { title: "Academic Excellence Scholarship", deadline: "June 30, 2026" },
                { title: "Financial Need Scholarship", deadline: "July 15, 2026" },
                { title: "STEM Scholarship", deadline: "August 1, 2026" }
            ]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 4. ADMIN DASHBOARD METRICS
// ============================================================================
app.get('/api/admin-dashboard', async (req, res) => {
    try {
        const { count: totalUsers, error: userCountError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        if (userCountError) throw userCountError;

        res.status(200).json({
            metrics: {
                totalApplications: 128,
                pendingApplications: 45,
                approvedApplications: 67,
                rejectedApplications: 16,
                totalUsers: totalUsers || 354
            },
            recentApplications: [
                { applicant: "Juan Dela Cruz", scholarship: "Academic Excellence", status: "Pending", date: "May 20, 2026" },
                { applicant: "Maria Reyes", scholarship: "Financial Need", status: "Pending", date: "May 19, 2026" },
                { applicant: "Pedro Garcia", scholarship: "STEM Scholarship", status: "Approved", date: "May 18, 2026" },
                { applicant: "Anna Lee", scholarship: "Academic Excellence", status: "Rejected", date: "May 17, 2026" }
            ]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 5. ADMIN: SCHOLARSHIPS API (With Auto-Sync)
// ============================================================================
app.get('/api/scholarships', async (req, res) => {
    try {
        const { data: scholarships, error } = await supabase
            .from('scholarships')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const updatesPromises = [];

        scholarships.forEach(sch => {
            if (sch.status === 'Draft' || !sch.start_date || !sch.end_date) return;

            const start = new Date(sch.start_date);
            start.setHours(0, 0, 0, 0);

            const end = new Date(sch.end_date);
            end.setHours(23, 59, 59, 999);

            let correctStatus = 'Draft';
            if (today < start) {
                correctStatus = 'Upcoming';
            } else if (today >= start && today <= end) {
                correctStatus = 'Active';
            } else {
                correctStatus = 'Closed';
            }

            if (sch.status !== correctStatus) {
                console.log(`Syncing scholarship "${sch.title}": ${sch.status} -> ${correctStatus}`);
                sch.status = correctStatus;
                updatesPromises.push(
                    supabase.from('scholarships').update({ status: correctStatus }).eq('id', sch.id)
                );
            }
        });

        if (updatesPromises.length > 0) {
            await Promise.all(updatesPromises);
            console.log(`Successfully auto-synced ${updatesPromises.length} statuses in Supabase.`);
        }

        res.status(200).json(scholarships);

    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 6. STUDENT: FETCH AVAILABLE SCHOLARSHIPS 
// ============================================================================
app.get('/api/student/available-scholarships', async (req, res) => {
    try {
        const { data: scholarships, error } = await supabase
            .from('scholarships')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const availableScholarships = scholarships.filter(sch => {
            if (sch.status === 'Draft' || !sch.start_date || !sch.end_date) return false;

            const start = new Date(sch.start_date);
            start.setHours(0, 0, 0, 0);

            const end = new Date(sch.end_date);
            end.setHours(23, 59, 59, 999);

            if (today >= start && today <= end) {
                sch.display_status = 'Active';
            } else if (today < start) {
                sch.display_status = 'Upcoming';
            } else {
                sch.display_status = 'Closed';
            }

            return true;
        });

        res.status(200).json(availableScholarships);

    } catch (error) {
        console.error('Student Fetch Error:', error);
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 7. STUDENT: FETCH SINGLE SCHOLARSHIP DETAILS
// ============================================================================
app.get('/api/student/scholarships/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('scholarships')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 8. STUDENT: SAVE APPLICATION DRAFT (Step 1)
// ============================================================================
app.post('/api/student/applications', async (req, res) => {
    try {
        const { scholarship_id, student_id, form_data, status } = req.body;

        const { data, error } = await supabase
            .from('applications')
            .insert([{
                scholarship_id,
                student_id,
                form_data,
                status: status || 'Draft'
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(200).json({ success: true, application_id: data.id, message: "Draft saved successfully." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ============================================================================
// 9. STUDENT: FETCH MY APPLICATIONS
// ============================================================================
app.get('/api/student/:studentId/applications', async (req, res) => {
    try {
        const { studentId } = req.params;

        const { data: applications, error } = await supabase
            .from('applications')
            .select(`
                *,
                scholarships:scholarship_id (
                    title
                )
            `)
            .eq('student_id', studentId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Map the results so the frontend gets exactly what it expects
        const formattedApplications = applications.map(app => {
            return {
                ...app,
                scholarships: app.scholarships || { title: 'Unknown Scholarship' }
            };
        });

        res.status(200).json(formattedApplications);

    } catch (error) {
        console.error('Fetch Applications Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// 10. STUDENT REGISTRATION & VERIFICATION ENDPOINTS
// ============================================================================

// Verify ID and Fetch Masterlist Data
app.post('/api/verify-id', async (req, res) => {
    const { id_number } = req.body;
    try {
        const { data: student, error } = await supabase
            .from('enrolled_masterlist')
            .select('*')
            .eq('id_number', id_number)
            .single();

        if (error || !student) {
            return res.status(404).json({ error: 'ID Number not found in the official enrolled masterlist.' });
        }

        const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('id_number', id_number)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'An account is already registered with this ID Number.' });
        }

        res.status(200).json(student);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// REAL EMAIL OTP SYSTEM (Using Nodemailer)
// ============================================================================
const otpDatabase = {}; // Temporarily holds codes in memory

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpDatabase[email] = code;

    const mailOptions = {
        from: `"Grantee System" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Grantee - Your Verification Code',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center; background-color: #f8fafc; border-radius: 10px;">
                <h2 style="color: #10b981;">Grantee Scholarship Management</h2>
                <p>Hello,</p>
                <p>You requested an email verification for your student registration.</p>
                <h1 style="font-size: 40px; letter-spacing: 5px; color: #1e293b; background: white; padding: 10px; border-radius: 8px; display: inline-block;">${code}</h1>
                <p style="color: #64748b; font-size: 12px;">This code will expire shortly. Do not share it with anyone.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Real email successfully sent to ${email}`);

        res.status(200).json({ message: 'Verification code sent to your inbox!' });
    } catch (error) {
        console.error('Nodemailer Error:', error);
        res.status(500).json({ error: 'Failed to send email. Check your server credentials.' });
    }
});

// ============================================================================
// CONFIRM OTP CODE
// ============================================================================
app.post('/api/verify-otp', (req, res) => {
    const { email, code } = req.body;

    if (otpDatabase[email] && otpDatabase[email] === code) {
        delete otpDatabase[email];
        res.status(200).json({ message: 'Email verified successfully!' });
    } else {
        res.status(400).json({ error: 'Invalid or expired verification code.' });
    }
});

// ============================================================================
// START THE SERVER
// ============================================================================
app.get('/api/test', (req, res) => {
    res.json({ message: "Backend is reachable!" });
});

app.listen(PORT, () => {
    console.log(`Grantee Master Backend running on port ${PORT}`);
});