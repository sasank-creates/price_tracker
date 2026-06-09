Build a full-stack product price monitoring web app with a minimal frontend and a strong backend.

Preferred stack:
- Frontend: Next.js
- Backend: Node.js with Express or Fastify
- Database: PostgreSQL using Supabase free tier or local PostgreSQL
- ORM: Prisma
- Job scheduling: node-cron or BullMQ if Redis is available
- Scraping: Playwright as the main scraper, with Cheerio for lightweight HTML parsing
- Email service: Nodemailer with SMTP
- AI fallback: Gemini only as a backup when scraping fails
- Use free or free-tier tools first. Prefer open-source and no-paid services unless absolutely necessary.

Goal:
The user should be able to add:
1. Product URL
2. Expected price
3. Email address
4. Check interval in minutes or hours

Frontend requirements:
- Keep the UI simple, clean, and minimal
- Use only the necessary form fields: product URL, expected price, email, and interval
- Show added products in a list
- Show current price, expected price, last checked time, and status:
  - price above target
  - price reached target
  - scraping failed
- Allow editing and deleting monitored products
- Add a “Check now” button
- Add a simple price history view or chart if possible

Backend requirements:
- Fetch the product page from Amazon or Flipkart
- Extract the current product price
- Build the scraper in a modular way so extraction logic can be updated easily
- First try to detect the correct price attribute automatically from the page HTML
- If the price is undefined, missing, or cannot be extracted:
  - send the page HTML or a DOM snippet to the Gemini API
  - ask Gemini to identify the attribute, selector, or element that contains the product price
  - store and cache the discovered selector or extraction rule
  - reuse that selector for future requests for the same site or product pattern
  - do not call Gemini again unless extraction fails or the page structure changes
- Compare the extracted price with the expected price
- If current price is less than or equal to expected price:
  - send a structured email notification to the user using Nodemailer
  - include the product name, product link, current price, expected price, and a clear call to action
- Save every check result in the database so the user can see price history

Email requirements:
- Use Nodemailer with SMTP
- Use a professional HTML email template
- Include product name, product URL, current price, expected price, checked time, and a button to open the product page
- Make the email clear, readable, and mobile friendly
- Include unsubscribe support

Database requirements:
- Store users, products, check history, extracted selectors, notification status, and failure logs
- Keep a timestamp for every price check
- Keep the last successful selector for each site or product pattern
- Support multiple products per user

Scheduler requirements:
- Run checks at the interval chosen by the user
- Support repeated background jobs
- Prevent duplicate checks for the same product at the same time
- Add retry logic for temporary failures
- Add notification cooldown so the same price drop does not spam the user

Extra features to include:
- Price history chart
- Manual “check now” button
- Email unsubscribe option
- Logging and error tracking
- Admin panel to view failed scrapes
- Site detection for Amazon and Flipkart
- Fallback scraping strategy if the main selector fails
- Rate limiting and respectful scraping behavior
- Optional proxy rotation only where legally allowed and only for reliability, not for bypassing access restrictions

Environment file requirement:
- Create a `.env.example` file with all required environment variables
- Include placeholders for:
  - DATABASE_URL
  - NEXT_PUBLIC_APP_URL
  - SMTP_HOST
  - SMTP_PORT
  - SMTP_USER
  - SMTP_PASS
  - EMAIL_FROM
  - GEMINI_API_KEY
  - CRON_INTERVAL
  - REDIS_URL if needed
  - any proxy credentials if used
- Do not hardcode secrets in the source code

Technical output expected:
- Folder structure
- Database schema
- API routes
- Scraper service
- Gemini fallback integration
- Nodemailer email template
- Background job logic
- Error handling
- `.env.example`
- Deployment-ready code

Important design rule:
The frontend must stay simple. Most of the intelligence should live in the backend.