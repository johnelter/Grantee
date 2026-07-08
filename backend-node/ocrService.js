// backend-node/ocrService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function validateDocumentWithGemini(fileBuffer, mimeType, documentType, applicantName, minHsAvg, minCollegeGwa, minHsSubject, minCollegeSubject) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ENHANCED SCHEMA: Force the AI to list the subjects first, reducing hallucination/skipping errors
    const schemas = {
        "Report Card (Form 138) (High School Level)": [
            "Student Name", 
            "School Name", 
            "Grade Level", 
            "School Year", 
            "General Average", 
            "List of All Subjects and their Final Grades",
            "Lowest Final Subject Grade (Numerical)", 
            "Principal Signature"
        ],
        "Barangay Clearance": ["Name", "Barangay", "Municipality", "Issue Date", "Barangay Captain Signature"],
        "Certificate of Residency": ["Name", "Address", "Barangay", "Years of Residency", "Signature", "Date"],
        "Certification from the School Principal": ["Total Graduating Population", "Student Rank", "Student Name", "School Name", "Signature"],
        "General Weighted Average (College Level)": [
            "Student Name", 
            "School Name", 
            "ID Number", 
            "Extracted Semesters (List of unique Semesters & School Years with their individual GWAs)", 
            "Cumulative GWA (Calculated average of all unique semesters)", 
            "List of All Subjects and their Final Grades",
            "Lowest Performing Subject Grade (Highest numerical value extracted among ALL final subject grades)", 
            "Signatures"
        ],
        "Official Honor Certificate": ["Student Name", "Top Ranking", "School Name", "School Year", "Signature"]
    };

    const targetSchema = schemas[documentType] || ["Document Contents"];

    // DYNAMIC RULE SELECTION
    let specificRuleInstruction = "No specific grade rules apply to this document.";
    
    if (documentType === "Report Card (Form 138) (High School Level)") {
        let hsRules = [];
        if (minHsAvg && minHsAvg !== 'null' && minHsAvg !== '0') hsRules.push(`The General Average MUST be greater than or equal to ${minHsAvg}`);
        if (minHsSubject && minHsSubject !== 'null' && minHsSubject !== '0') hsRules.push(`EVERY single individual subject's FINAL GRADE on the report card MUST be greater than or equal to ${minHsSubject}`);
        
        specificRuleInstruction = hsRules.length > 0 ? `Rules to evaluate: ${hsRules.join(" AND ")}. (Ignore any College rules).` : "No specific grade rules apply.";
    } 
    else if (documentType === "General Weighted Average (College Level)") {
        let colRules = [];
        if (minCollegeGwa && minCollegeGwa !== 'null' && minCollegeGwa !== '5') colRules.push(`The Cumulative GWA MUST be less than or equal to ${minCollegeGwa}`);
        if (minCollegeSubject && minCollegeSubject !== 'null' && minCollegeSubject !== '5') colRules.push(`EVERY single individual subject's FINAL GRADE on the transcript MUST be less than or equal to ${minCollegeSubject}`);
        
        specificRuleInstruction = colRules.length > 0 ? `Rules to evaluate: ${colRules.join(" AND ")}. (Note: 1.0 is the highest/best grade, meaning lower numbers are better. Ignore any High School rules).` : "No specific grade rules apply.";
    }

    const documentPart = {
        inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: mimeType
        }
    };

    // HIGHLY OPTIMIZED PROMPT: Added strict guidelines for table reading
    const prompt = `
    You are an elite AI Document Validator for a scholarship system, specializing in highly accurate table data extraction from academic transcripts and report cards.
    I have attached an image or PDF of a document.
    
    Document Type Expected: ${documentType}
    Applicant Name: ${applicantName}

    TABLE READING & GRADE EXTRACTION GUIDELINES (CRITICAL):
    1. IDENTIFY FINAL GRADES ONLY: Completely ignore periodical grades (Q1, Q2, Q3, Q4, Prelim, Midterm). Extract only the "Final Grade", "Semester Grade", or "Final Rating" column for each subject.
    2. IGNORE UNITS/CREDITS: In college transcripts, do not confuse the course units/credits (e.g., 3.0, 5.0) with the actual subject grade. Grades are usually in a separate column.
    3. HIGH SCHOOL VS COLLEGE SYSTEMS: 
       - High School grades are usually out of 100 (e.g., 85, 90). 
       - College GWAs and grades are typically 1.0 to 5.0 (where 1.0 is Excellent and 3.0 is Passing. Higher numbers mean worse performance).
    4. THOROUGH EXTRACTION: Scan EVERY row in the grade tables to ensure no subject is missed before determining the lowest score.

    Perform the following tasks strictly by reading the attached document:
    1. Extract these fields: ${targetSchema.join(", ")}. 
    2. List any missing fields based on the Expected Document Type.
    3. MULTI-SEMESTER LOGIC (If applicable): If evaluating a multi-semester document, calculate the Cumulative General Weighted Average (CGWA) by averaging the unique semester GWAs.
    4. ELIGIBILITY VALIDATION: Evaluate the document against this specific set of rules: "${specificRuleInstruction}". Determine if the extracted grades meet ALL of these rules perfectly. If no rule applies to this document type, evaluate as true.
    5. VALID SOURCE: Determine if the document appears valid and official (e.g., look for signatures, stamps, official layouts).

    Respond STRICTLY in JSON format:
    {
        "extracted_data": { "field_name": "value" },
        "missing_information": ["List of missing fields"],
        "meets_eligibility": boolean,
        "is_valid_source": boolean,
        "rejection_reason": "Provide reason if false, else null"
    }`;

    try {
        const result = await model.generateContent([prompt, documentPart]);
        const response = await result.response;
        
        // Clean markdown formatting if present
        const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '');
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Gemini AI Validation Error:", error);
        throw new Error("Failed to process document validation.");
    }
}

module.exports = { validateDocumentWithGemini };