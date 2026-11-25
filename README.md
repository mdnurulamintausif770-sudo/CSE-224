# Health AI Monitoring System — Student Wellness DBMS

A full-stack React + Express + Gemini wellness monitoring and normalized 3NF relational DBMS web application designed for student health check-ins, fever & stress tracking, symptom guidance, recovery routines, role-based analytics, and JSON/CSV backup.

## Key Features

- **Instant Center Orb Entry:** Opens smoothly on a futuristic cosmic orb with zero blocking loading screens and empty initial tables (`[]`).
- **Dynamic Per-Tab Theme:** Smoothly transitions across Futuristic Purple, Light Blue/Cyan, Teal/Aqua, Emerald/Mint, Soft Violet-Blue, and Magenta-Purple palettes.
- **Multilingual Health AI & Voice Dictation:** Supports voice-to-text input across multiple world languages with strictly text-only structured guidance and practical coping steps (wellness awareness only, not clinical diagnosis).
- **Daily Health & Fever Tracker:** Log temperature, fever status, sleep, hydration, stress levels, contributing stress factors, and review visual recovery trends with inline revision.
- **Symptom & First-Aid Guide + Wellness & Recovery Routine:** Interactive checklists, AI symptom helper, and pinned recovery schedules.
- **Normalized 6-Table 3NF Relational DBMS (`localStorage`):**
  - `departments` (`dept_id`, `dept_name`, `building`)
  - `users` (`user_id`, `student_id`, `username`, `password_hash`, `role`)
  - `students` (`student_id`, `dept_id`, `user_id`, `name`, `email`, `semester`, `class_section`, `roll_no`, `age`)
  - `stress_reports` (`report_id`, `student_id`, `stress_level`, `submission_date`, `remarks`, wellness metrics)
  - `stress_factors` (`factor_id`, `factor_name`, `description`)
  - `report_factors` (`report_id`, `factor_id` M:N bridge with referential integrity checks)
- **Role-Based Views & Analytics:** Switch between `Student`, `Counselor`, and `Admin` views, filter/revise reports, inspect chronological stress history, factor counts, high-stress alerts (`stress_level >= 8`), semester/weekly/monthly averages, and JSON/CSV backup & restore.

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and set your Gemini API key (optional — local fallback mode works automatically if omitted):
   ```bash
   cp .env.example .env
   ```
3. Start development server (`http://localhost:3000`):
   ```bash
   npm run dev
   ```
4. Build and run production server locally:
   ```bash
   npm run build
   npm start
   ```

## Deploying as a Node.js Web Service on Render

1. Push this repository to GitHub (`.gitignore` excludes `node_modules/`, `dist/`, and `.env*`).
2. Create a new **Web Service** on [Render](https://render.com) connected to your GitHub repo:
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
3. Add environment variable in Render Dashboard (optional for live Gemini AI):
   - `GEMINI_API_KEY` = your Gemini API key
4. Health check endpoint: `/api/health` returns `{ "status": "ok", "ok": true }`.
