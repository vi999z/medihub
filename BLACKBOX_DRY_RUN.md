# MEDIHUB — Black Box Dry Run (Appendix A)

Step-by-step browser checks for each Appendix A test case. Follow the
**Before you start** section first: several tests need specific data or
services, and fail for reasons unrelated to the code without them.

---

## Before you start

**Accounts**
- One **Administrator** account and one **Pharmacist** account.

**Services (check the day before)**
- **Gemini API key** set and within quota (tests 25–27).
- **OpenWeatherMap key** set (test 26). Without it the page shows "Seasonal est." instead of live weather.
- **Photos (test 1)** are stored in the MySQL database; nothing to set up.
- Open the site a few minutes early. Free hosting sleeps when idle, and the first load can take about a minute.
- **Camera tests (17):** use the HTTPS site, or `localhost` on the same computer. Browsers block the camera on plain `http://` addresses such as `http://192.168…`.

**Test data** (prepare once; the steps below assume it exists)

| Needed for | Data |
|---|---|
| 4, 31 | At least one medicine in **QMC** and one in **MT Carmel** |
| 6, 3 | At least one supplier |
| 7 | A medicine with **reorder level 10** and **15 units** in stock |
| 20, 23 | Several medicines with sales spread over the last few weeks |
| 21 | Active batches with different expiry dates |
| 22 | One medicine with **9 sales of 1 unit** and then **1 sale of 40 units** within 30 days |
| 26 | Weather-sensitive medicines in stock (e.g. Biogesic, Neozep, Bioflu, Cetirizine) with some sales |
| 37 | At least **15 expired or depleted batches** with sales history (the model needs this much data to train) |

Movements and alerts use **Philippine time** (Asia/Manila).

---

## Test steps

### 1. Medicine Records
1. Log in as Pharmacist → **Medicines** → **Add medicine**.
2. Click **Choose photo** and pick a JPG or PNG under 5 MB. Enter Name `Test Paracetamol`, Category `Analgesic`, Dosage form `Tablet`, Strength `500mg`, Unit `box`, Reorder level `10`, Branch `QMC`. Click **Save medicine**.
3. **Expected:** "Medicine added" appears and the medicine shows in the catalog with its photo.
4. *Invalid input:* open **Add medicine**, leave Unit empty, and save. **Expected:** "Unit is required"; nothing is saved.

### 2. CSV Import
1. **Medicines** → **Import medicine list** → **Download CSV Template**.
2. Fill in 3 rows: 2 valid, and 1 with an empty `name` or `reorder_level` = `abc`. Upload the file.
3. **Expected:** the preview marks the bad row invalid with the reason, and the 2 good rows valid.
4. Click **Import 2 medicine(s)**. **Expected:** both appear in the catalog; the invalid row is not imported.

### 3. Receive Stock
1. **Batches** → **Receive stock**. Choose a medicine and enter Batch number `LOT-1001`, Quantity `50`, Cost price `10.00`, Selling price `15.00`, Manufacture date (a past date), Expiry date (at least 30 days ahead), and a Supplier.
2. Click **Receive stock**.
3. **Expected:** "Batch received"; the batch card shows 50 remaining. The medicine's stock in **Medicines** goes up by 50, and **Transactions** shows a **Stock in** movement.
4. *Invalid input:* an expiry date of yesterday. **Expected:** "Expiry date must be after today".

### 4. Branch Records
1. **Medicines** → branch filter → **MT Carmel**. **Expected:** only MT Carmel medicines are listed.
2. **Dashboard** → **All branches** dropdown → **QMC**. **Expected:** the stock-status counts and the "Needs attention" list change to QMC only.

### 5. Search and Filter
1. **Medicines** → type part of a medicine name in the search box. **Expected:** only matching medicines are shown.
2. Click a category chip (e.g. **Analgesic**). **Expected:** only that category is shown.
3. Choose **Low stock** in the stock-level filter. **Expected:** only low-stock medicines are shown.

### 6. Suppliers
1. **Suppliers** → **Add supplier**. Enter Name `Test Supplier`, Phone `+63 912 345 6789`, Email `test@supplier.ph`. Click **Save supplier**. **Expected:** the supplier appears in the list.
2. Click **Edit**, change the phone number, and save. **Expected:** the change is shown.
3. **Batches** → **Receive stock** → open the Supplier dropdown. **Expected:** `Test Supplier` is listed.

### 7. Low-Stock Alert
1. Use the medicine with reorder level 10 and 15 units. **Transactions** → **New transaction** → choose its batch, **Sale or dispense**, Quantity `6` → **Save movement**.
2. Open **Alerts**. **Expected:** a new **Warning** alert "… is low on stock: 9 remaining (reorder level: 10)", and the bell shows a dot.

### 8. Near-Expiry Alert
1. **Batches** → **Receive stock** with an expiry date **5 days from today**.
2. Open **Alerts**. **Expected:** a new alert "… expires in 5 day(s)". It's a **Warning** for 4–7 days, **Critical** for 3 days or fewer, and **Info** for 8–14 days.

### 9. Expired Batch
1. **Batches** → **Edit** an active batch → set the Expiry date to **yesterday** → **Update batch**.
2. **Expected:** the batch card shows **Expired**, and **Alerts** shows a **Critical** alert "… has expired and should be pulled from shelves."

### 10. Notifications Page
1. Open **Alerts**. **Expected:** each card shows its severity (**Critical**, **Warning** or **Info**) and whether it's Read or Unread.
2. Click **Mark as read** on one alert. **Expected:** its status changes to Read.
3. Tick **Unread only**. **Expected:** read alerts are hidden. Click **Mark all read**. **Expected:** none remain unread.

### 11. Sale
1. **Transactions** → **New transaction** → an active batch → **Sale or dispense**, Quantity `2` → **Save movement**.
2. **Expected:** "Transaction recorded"; the batch has 2 fewer units, and a **Sale** card appears in Movements.
3. Repeat with an **expired** or **recalled** batch. **Expected:** "This batch is expired and cannot be sold. Record a disposal instead."

### 12. Adjustment
1. **New transaction** → **Adjust quantity** → **Adjust by: Adding stock**, Quantity `3`, Reason `recount`. **Expected:** stock goes up by 3; an **Adjustment** card is logged.
2. Repeat with **Removing stock**. **Expected:** stock goes down by 3; it is logged.

### 13. Disposal
1. **New transaction** → choose an **expired** batch (marked "expired" in the list) → **Dispose stock**, Quantity = all remaining units → **Save movement**.
2. **Expected:** the batch has 0 remaining and stays **Expired**. The medicine's usable stock doesn't include it.
3. **Batches** → **Export** → **Wasted medicines (Excel)**. **Expected:** the batch is listed with the disposed quantity and its waste value.

### 14. Return
1. **New transaction** → a batch that has had a sale → **Return stock**, Quantity `1`. **Expected:** stock goes up by 1, and a **Return** card is logged.

### 15. Transaction History
1. Open **Transactions**. **Expected:** cards for Stock in, Sale, Adjustment, Disposal and Return (from tests 3 and 11–14).
2. Set the type filter to **Disposal**. **Expected:** only disposals are shown.
3. Pick today's date in the date filter. **Expected:** only today's movements are shown.

### 16. Audit Log
1. Log in as Administrator → **Audit Log**.
2. **Expected:** entries for the actions above (created medicine, received batch, stock transactions, login), each with the user, action, date and time.

### 17. Camera Scan
1. **Scanner** → **Start scanning** → allow camera access. Hold a medicine barcode or a batch QR code in the frame.
2. **Expected:** "Code captured" shows the code and its format. Click **Add to stock**. **Expected:** the **Receive stock** form opens with the code as the Batch number.

### 18. Image Scan
1. **Scanner** → **Upload photo** → choose a clear photo of a barcode or QR code.
2. **Expected:** the code is read (QR, EAN-13, EAN-8, UPC-A, UPC-E or Code 128). **Add to stock** opens **Receive stock** with the code as the Batch number.
3. Upload a photo with no code. **Expected:** "No QR code or barcode was found in that photo".

### 19. QR Code Generation
1. **Batches** → **QR** on any batch. **Expected:** a QR code with the medicine and batch number.
2. Click **Download QR code**. **Expected:** a PNG downloads. Scanning it in test 18 reads the batch's ID.

### 20. Demand Forecast
1. **AI Assistant** → **Insights** → **Demand forecast**.
2. **Expected:** each medicine with sales shows its average demand per day, the projected demand for the next 14 days, a trend (Rising, Steady or Falling), current stock, and a daily forecast bar chart.

### 21. Expiry Risk Prediction
1. **Insights** → **Expiry risk**. **Expected:** batches with a risk percentage, a signal label, an explanation, and a recommended action.

### 22. Anomaly Detection
1. **Insights** → **Anomalies**. **Expected:** the 40-unit sale from the test data is listed with a Z-score and an explanation.

### 23. Reorder Recommendation
1. **Insights** → **Reorder suggestions**. **Expected:** only medicines that need restocking (under 30 days of stock, or at or below their reorder level), each with a suggested order quantity.

### 24. AI Insights Export
1. **Insights** → **Export** → **Expiry risk (Excel)**, then **Reorder suggestions (Excel)**, **Anomalies (Excel)**, and **Full AI Insights (PDF)** and **(Word)**.
2. **Expected:** each file downloads and opens, showing the same data as the page.

### 25. Inventory Questions
1. **AI Assistant** → **Chat** → ask "How many units of Biogesic do we have?", then "What is expiring this week?"
2. **Expected:** answers that match the **Medicines** and **Batches** pages.

### 26. Seasonal Stocking Advice
1. **AI Assistant** → **Weather Restock**. **Expected:** current weather, the wet or dry season, and medicines recommended for restocking with reasons.
2. Optionally ask the chat: "What should I restock for the rainy season?"

### 27. File Request
1. In **Chat**, type "Generate an Excel file of expiring items". **Expected:** an `.xlsx` file downloads.
2. Repeat with "… as a Word document" and "… as a PDF". **Expected:** a `.docx` and a `.pdf` download. All three open correctly.

### 28. Conversation History
1. In **Chat**, ask a question and wait for the answer. **Expected:** the conversation appears in the **Conversations** sidebar on its own (no Save step).
2. Go to another page, return, and click it in the sidebar. **Expected:** the messages are restored.
3. Log in as another user. **Expected:** the first user's conversations are not listed.

### 29. Report Generation
1. **Batches** → **Export** → generate **Active**, **Expiring soon**, **Expired**, **Depleted**, **Recalled** and **Wasted medicines**.
2. **Transactions** → **Export** → **All transactions — 30d (Excel)**. **Alerts** → **Export** → **All alerts (Excel)**.
3. **Expected:** each report downloads, with matching data.

### 30. Export Formats
1. From **Batches** → **Export**, download one report each as **Excel**, **PDF** and **Word**, plus **Current view (CSV)**.
2. **Expected:** each file opens in Excel, a PDF reader or Word. Tables are readable, zeros are shown, and long reports continue across pages.

### 31. Dashboard
1. Open **Dashboard**. **Expected:** sales today, inventory value, retail value, margin, the out of stock / low / expiring / healthy counts, a 7-day sales chart, top sellers, and the "Needs attention" list.
2. Change the **branch**, **category** and **date** filters. **Expected:** the counts and the list update.

### 32. Valid Login
1. Log out. Enter a valid email address and password → **Log in**. **Expected:** the Dashboard opens.

### 33. Invalid Login
1. Enter a valid email address with a wrong password → **Log in**. **Expected:** "Invalid credentials" and you stay on the login page.

### 34. Role Restriction
1. Log in as Pharmacist. **Expected:** Users, Audit Log and Maintenance are not in the menu.
2. Type `/#/users`, `/#/audit-log` and `/#/maintenance` in the address bar. **Expected:** each one sends you back to the Dashboard.

### 35. User Management
1. As Administrator → **Users** → **Add account**: full name, email, an 8+ character temporary password, role **Pharmacist** → **Create account**. **Expected:** the account appears.
2. **Edit** it and change the role to Administrator. **Expected:** saved.
3. **Reset** → confirm. **Expected:** a temporary password is shown.
4. **Deactivate** → confirm. **Expected:** the card shows Inactive, and that user can no longer log in.
5. On **your own** card. **Expected:** there's no Deactivate or Reset button, and the Role field is locked when editing.

### 36. Maintenance Tasks
1. As Administrator → **Maintenance**. **Expected:** Clear transaction history, Clear logs and notifications, Remove expired medicine, Remove depleted batches, Reset pharmacy system, Wipe all data.
2. Run **Remove depleted batches** → confirm. **Expected:** a success message; depleted batches disappear from **Batches**; **Audit Log** records it.
3. *Run the reset and wipe actions last, or skip them during the dry run: they delete data.*

### 37. Model Retraining
1. As Administrator → **AI Assistant** → **Insights** → **Retrain model**.
2. **Expected:** "Model retrained successfully on N resolved batches…". If it says training was skipped, there are fewer than 15 expired or depleted batches; add more test data.

### 38. Logout
1. Avatar menu (top right) → **Log out**. **Expected:** the login page opens.
2. Press the browser's Back button, or open `/#/dashboard`. **Expected:** you're sent back to the login page.
