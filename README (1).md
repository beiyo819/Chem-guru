# ⚗️ Chem Lab Reports (v2)

Student portal + admin panel for writing chemistry lab reports, with M-Pesa subscriptions,
fingerprint/passkey security, report storage, and live admin monitoring.

Report format: Cover page → Objectives → Introduction → Reagents & Apparatus → Procedure →
Data sheet → Discussion → Conclusions → Calculations → References.

## Run it (2 minutes)
```bash
npm install          # only installs nodemailer (for email); everything else is built in
cp .env.example .env # then edit .env
npm start
```
Student site: http://localhost:3000   Admin: http://localhost:3000/admin
Needs Node 18+. Run `npm test` to verify everything works (uses M-Pesa simulation).

**First thing:** set `ADMIN_USER` and `ADMIN_PASS` in `.env`.

## How a student uses it
1. Fills in: experiment details (topic, title…), reagents & apparatus, their procedure (typed, pasted or uploaded as .txt) and the data-sheet table.
2. Presses **✨ Generate my report**. The website rewrites the procedure as numbered points in the past tense with no personal pronouns, and writes
   the objectives, introduction, discussion, conclusions, calculations and references.
3. Gets the finished report in your video's format (cover page → … → references), can edit any text, and uses **Print / Save as PDF**.

**AI writer:** set `ANTHROPIC_API_KEY` in `.env` (key from https://console.anthropic.com). Without it, the procedure is still rewritten by the built-in rule-based
rewriter, but the other sections are only basic drafts. Students are limited to 15 generations per hour to control cost. Students should always check the calculations.

## Features
**Admin**: turn payments on/off (free access for all) · reset all activities · live view of who is online and every ongoing
activity · all registered students (name, reg no, phone, email, subscriptions, photo) · one-tap email to all students ·
add/edit subjects, prices and any number of instructions per subject · payments list · reset a student's password · remove a student.

**Student**: login with phone number + password every time (active subscription → straight in; expired → must subscribe first) ·
subscriptions with live countdown · M-Pesa STK push payment · activity history · storage of all saved reports (autosave) ·
profile photo · change email/password only after fingerprint/passkey approval · delete account.

## M-Pesa setup (Safaricom Daraja)
1. Create an app at https://developer.safaricom.co.ke → get **Consumer Key** and **Consumer Secret**.
2. Fill `.env`: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`.
   Sandbox test values (shortcode `174379` + the sandbox passkey) are shown on the Daraja "Lipa na M-Pesa Online" simulator page.
3. `CALLBACK_BASE_URL` must be a **public HTTPS** address Safaricom can reach (your deployed site, or an `ngrok` URL while testing locally).
4. To receive real money: complete Daraja **Go Live** for your Paybill/Till, then set `MPESA_ENV=production` and your real shortcode/passkey.
   Till numbers: set `MPESA_TXN_TYPE=CustomerBuyGoodsOnline` and `MPESA_TILL=<till number>`.
5. No credentials yet? Set `MPESA_SIMULATE=true` – payments auto-succeed after 4 seconds so you can demo the whole system.

The server confirms payments two ways: Safaricom's callback, and a status query fallback if the callback is delayed.

## Email
Set `SMTP_*` in `.env` (Gmail: use an *App Password*). Without SMTP, emails are written to `data/outbox.log` instead of being sent.

## Fingerprint / passkey
Uses WebAuthn (phone fingerprint, face, or screen lock). It needs **HTTPS** (or localhost) and `APP_URL` must exactly match
the address in the browser. Students set it up once in Profile (confirming their password), then it is required for email/password changes.

## Deploy
Any Node host works (Render, Railway, Fly.io, a VPS). Set the `.env` values as environment variables, and **keep the `data/`
folder on a persistent disk/volume** (that is where students, reports and payments are stored; back it up). A `Dockerfile` is included.

## Security notes
- Passwords are hashed with scrypt. **Nobody, including the admin, can read a student's password** – the admin panel offers
  "Reset" to issue a temporary one instead. This is deliberate: showing passwords would put every student at risk.
- Data is stored in a JSON file (`data/db.json`) – ideal for a class/school-sized deployment. For thousands of
  concurrent users, move to a real database.
- Sessions are in memory; restarting the server logs everyone out.
