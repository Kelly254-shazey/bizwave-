# BizWave SME User Guide (English & Kiswahili Quick Reference)

*Welcome to **BizWave** — "Your business. Understood. Your next move. Clear." ("Biashara yako. Inaeleweka. Hatua yako ijayo. Iko wazi.")*

---

## 1. Getting Started (Kuanza Kutumia BizWave)

1. **Create Your Workspace**: Click **Register** on the BizWave website, enter your name, work email, business name, and select your industry template (**Retail**, **Restaurants & Cafes**, **Wholesale & Distribution**, **Salons & Wellness**, **Professional Services**, or **General SME**).
2. **Personalize Your Portal (Onboarding Wizard)**:
   - Choose your brand color and upload/link your business logo.
   - Add additional branches (e.g., Westlands Flagship, Kilimani Express).
   - Invite team members with exact role permissions (Finance Officer, Inventory Manager, Branch Manager, Customer Service Agent, or Read-Only Auditor).
3. **Switch Language Anytime**: Click **EN / SW** in the top bar of your workspace to switch between English and Kiswahili.

---

## 2. Importing Your Business Data (`BizWave Analytics -> Data Imports`)

BizWave works with spreadsheets (`.csv`, `.xlsx`), M-Pesa statements, and POS/JSON exports:
1. Open **Analytics** -> **Data Imports**.
2. Upload your sales CSV/XLSX file (or click **Load Sample CSV** to test the pipeline).
3. **Map & Validate**: Review column mappings. BizWave checks every row for missing dates, invalid KES amounts, or duplicate receipt numbers — **invalid rows are highlighted clearly with exact row numbers and never silently dropped**.
4. **Commit**: Click **Commit Valid Rows** to update your dashboards, inventory ledger, and financial summaries immediately.

---

## 3. Understanding Your Dashboard & KPIs

- Hover or click the **`i`** icon on any KPI card (Total Revenue, Gross Profit, Expenses, Net Profit, Order Volume, Average Order Value) to inspect the **exact formula** and **date-range comparison** (`vs prev period`).
- Check the **Data Coverage** card at the top to see how many days of sales, expense, and SKU data back your insights.
- Use the **Branch Selector** at the top to compare all branches combined or drill into one specific shop.
- Need to correct a mistake on a sale or stock count?
  - **Sales Returns**: Click **Return** on any sale to record a traceable negative reversal (original receipts are never deleted for KRA audit safety).
  - **Inventory Adjustments**: Record wastage, breakage, or stock-take adjustments under **Analytics -> Inventory & Stock** with a mandatory reason.
  - **M-Pesa Reconciliation**: Under **Analytics -> Finance & M-Pesa**, click **Reconcile** to match Till/Paybill inflows against recorded sales.

---

## 4. Forecasting & Anomaly Alerts (`BizWave Predict`)

Available on **Growth**, **Intelligence**, and **Enterprise** plans:
- **Sales Forecast**: Predicts revenue over 7, 14, or 30 days with **80% and 95% confidence bands** and real backtest accuracy (`MAPE`, `MAE`).
- **Stockout-Aware Demand Forecast**: Estimates upcoming units needed for a specific SKU while flagging days where past stockouts suppressed demand.
- **Cash-Flow Forecast**: Clearly separates **Confirmed Obligations** (recorded bills & invoices due) from **Estimated Operational Flows**.
- **Not Enough History Yet?**: If your business has fewer than 14 days of data, BizWave clearly displays `Insufficient Data` with exact guidance on how many more days to import — it never invents fake numbers.
- **Customer Segments (RFM & Churn)**: Identifies Champions, Loyal Customers, and At-Risk customers so you can follow up before they churn.

---

## 5. Asking Your Grounded Business Assistant (`BizWave AI`)

Ask questions naturally in **English or Kiswahili**:
- *"Why did sales change this week?"* / *"Kwa nini mauzo yalibadilika wiki hii?"*
- *"Which products are running low on stock?"* / *"Ni bidhaa zipi zinaisha?"*
- *"Compare Westlands and Kilimani branch performance"*
- *"How is my M-Pesa reconciliation looking?"*

Every BizWave AI response displays:
- **Verified Provenance** (exact date range, branch scope, and database tables queried).
- **Supporting Charts** rendered directly inside the conversation.
- **Structured Recommendations** distinguishing observed facts, estimates, and next actions.
- Rate answers with thumbs up/down to help improve relevance.

---

## 6. Consent-First Customer Communications (`BizWave Connect`)

Available on **Intelligence** and **Enterprise** plans:
1. **Configure Providers**: Under **Connect -> Providers**, enter your **Africa's Talking** (SMS/Voice/USSD) or **Meta WhatsApp Cloud API** credentials. They are encrypted with AES-256-GCM immediately. *(Until live credentials are configured, messages safely queue as `Pending Provider Config` and never pretend to be sent.)*
2. **Manage Kenya DPA 2019 Consent**: Under **Customers & DPA Consent**, toggle per-channel SMS/WhatsApp opt-in or export a customer's complete DPA 2019 data portability package in one click.
3. **Launch Campaigns**: Pick an approved English or Kiswahili template and target audience — BizWave automatically excludes anyone without valid channel consent.

---

## 7. Security Best Practices for SME Owners
- Enable **Two-Factor Authentication (TOTP MFA)** under **Settings** using Google Authenticator or Authy.
- Give each staff member their own login and lowest-necessary role (e.g., Branch Manager scoped only to their shop).
- Review **Billing & Audit -> Immutable Audit Log Trail** periodically to verify all sensitive changes.
