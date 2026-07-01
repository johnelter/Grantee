# Grantee System 🎓

## Project Description
The Grantee System is a full-stack Scholarship Management and Inquiry System designed to streamline application workflows for students and administrators. It allows students to apply for grants, verify their identity via OTP, and track their application status. Administrators have a centralized dashboard to review, approve, and reject applications with detailed remarks, ensuring transparency and efficiency in the scholarship process.

**Live Frontend:** [Grantee on Vercel](https://grantee.vercel.app) *(Update with your actual Vercel deployment URL)*  
**Live API:** [Grantee Backend on Render](https://grantee-api.onrender.com)

---

## Features

### 👨‍🎓 For Students
* **Account Creation & Login:** Secure authentication powered by Supabase.
* **Identity Verification:** Real-time email OTP verification system.
* **Application Management:** Submit, track, and update scholarship applications.
* **Responsive UI:** Clean, modern interface optimized for mobile and desktop screens.

### 👨‍💻 For Administrators
* **Centralized Dashboard:** Real-time overview of all pending, passed, and rejected applications.
* **Quick Actions:** One-click status updates directly modifying the database records.
* **Audit Trail:** Rejection remark modal that saves specific reasons for denied applications.

---

## Technology Stack

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla ES6+)
* **Backend:** Node.js, Express.js
* **Database & Authentication:** Supabase (PostgreSQL)
* **Hosting / Deployment:** 
  * Frontend: Vercel
  * Backend API: Render.com

---

## Installation Guide

### Prerequisites
Make sure you have the following installed on your machine:
* [Node.js](https://nodejs.org/) (v14 or higher)
* [Git](https://git-scm.com/)
* A [Supabase](https://supabase.com/) account and project setup.

### 1. Clone the Repository
```bash
git clone [https://github.com/johnelter/Grantee.git](https://github.com/johnelter/Grantee.git)
cd Grantee