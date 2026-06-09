# 📊 PriceTracker

A full-stack product price monitoring web app that tracks prices on Amazon, Flipkart, and other popular e-commerce websites, and sends email alerts when prices drop to your target. It features a fully responsive modern UI, interactive charts, and intelligent scraping.

## Key Features

- **Smart Scraper** — Playwright + Cheerio with an optimized 4-tier extraction strategy:
  1. **Cached Selector** (Stored in Database)
  2. **Known Site-Specific CSS Selectors** (Amazon, Flipkart, Meesho, Myntra, etc.)
  3. **Cheerio Lightweight HTML Parser & JSON-LD Structure Data**
  4. **Google Gemini 1.5 Flash AI Fallback** — dynamically analyzes the page HTML to find the price and discovers/caches a CSS selector for future runs.
- **Immediate Initialization** — Newly added products are immediately checked in the background.
- **Smart Frontend Polling** — The frontend automatically polls for price changes and status changes when a check is triggered, displaying a live progress bar.
- **Background Jobs** — `node-cron` scheduler with configurable run intervals.
- **Notification Cooldown** — No spam protection (6-hour cooldown per product target alerts).
- **Email Alerts** — Fully styled HTML notifications sent via SMTP with Nodemailer.
- **Price History Charts** — Interactive line charts drawn on a Canvas.
- **Admin Dashboard** — View scraper failures, database stats, and cached selectors.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js (App Router), Vanilla CSS, HTML5 |
| **Backend** | Node.js + Express |
| **Database** | MongoDB |
| **ORM** | Prisma Client |
| **Scraping** | Playwright + Cheerio |
| **AI Fallback** | Google Gemini 1.5 Flash API |
| **Email** | Nodemailer (SMTP) |
| **Scheduler** | node-cron |
| **Logging** | Winston Logger |

---

## Quick Start Guide

### Prerequisites
- Node.js 18+ installed.
- A MongoDB cluster or database URI (e.g., MongoDB Atlas).
- A Google Gemini API Key (from Google AI Studio).
- SMTP credentials (e.g. Google Gmail App Passwords).

---

### Setup Instructions

#### 1. Setup Backend Environment

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create your `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
3. Update the variables inside `.env`:
   - `DATABASE_URL`: Your MongoDB connection string.
   - `PORT`: Port to run the server on (default: `4000`).
   - `SMTP_USER` / `SMTP_PASS`: Credentials to send email alerts.
   - `GEMINI_API_KEY`: API Key for Gemini fallback.

#### 2. Run Database Migrations

Generate the Prisma Client and push schemas to MongoDB:
```bash
npx prisma generate
npx prisma db push
```

#### 3. Install Dependencies
Run installation inside both backend and frontend directories:
```bash
# In backend/
npm install
npx playwright install chromium

# In frontend/
cd ../frontend
npm install
```

#### 4. Setup Frontend Environment

1. Create a `.env.local` inside the `frontend/` folder:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:4000/api
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

---

### Running the Project

You can run both projects in development mode:

#### Start Backend:
```bash
cd backend
npm run dev
```

#### Start Frontend:
```bash
cd frontend
npm run dev
```

- **Frontend Home**: http://localhost:3000
- **Backend API**: http://localhost:4000/api
- **Admin Dashboard**: http://localhost:3000/admin

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/products` | Add product to monitor & triggers immediate check |
| `GET` | `/api/products` | List all monitored products |
| `GET` | `/api/products/:id` | Get details (history, notification counts) |
| `PUT` | `/api/products/:id` | Edit target price / interval |
| `DELETE` | `/api/products/:id` | Stop monitoring and delete |
| `POST` | `/api/products/:id/check` | Trigger manual price check |
| `GET` | `/api/products/:id/history` | Historical price data points |
| `GET` | `/api/admin/stats` | Database & status stats |
| `GET` | `/api/admin/failures` | Logs of scraper errors |
| `GET/POST`| `/api/unsubscribe/:token` | Unsubscribe email alerts |
