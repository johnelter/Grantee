const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');

const app = express();
const port = 3000;

// Allow your frontend to communicate with this backend
app.use(cors());
app.use(express.json());

// Set up Multer to store uploaded files in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

// --- OCR API ENDPOINT ---
app.post('/api/ocr/scan', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No document uploaded' });
        }

        console.log('Scanning document...');

        // Run Tesseract OCR on the uploaded file buffer
        const { data: { text } } = await Tesseract.recognize(
            req.file.buffer,
            'eng', // English language recognition
            { logger: m => console.log(m.status, Math.round(m.progress * 100) + '%') }
        );

        console.log('Scan Complete!');

        // --- SIMULATED AI EXTRACTION ---
        // In a full production app, you would pass 'text' to Google Gemini here to parse out the specific GWA and Name. 
        // For now, we return the raw text to the frontend.
        
        res.json({
            success: true,
            raw_text: text,
            message: "Document successfully scanned!"
        });

    } catch (error) {
        console.error('OCR Error:', error);
        res.status(500).json({ error: 'Failed to process document' });
    }
});

app.listen(port, () => {
    console.log(`Grantee Backend running at http://localhost:${port}`);
});