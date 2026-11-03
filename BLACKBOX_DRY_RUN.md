# MEDIHUB — Black Box Dry Run (37 test cases, five IT experts)

Step-by-step browser checks for each test case. Do the **Before you start** section first: several tests need specific data or services and fail for reasons unrelated to the code without them.

---

## Before you start

**Accounts:** one **Administrator** and one **Pharmacist**.

**Load the demo data:** log in as Administrator → **Maintenance** → **Load demo data** (takes up to a minute). Do this the morning of the evaluation so expiry dates line up with the alert windows. Then **AI Assistant → Insights → Retrain model**.

**Services (check the day before)**
- **Gemini API key** set and within quota (tests 25–27).
- **OpenWeatherMap key** set (test 26). Without it the page shows "Seasonal est." instead of live weather.
- Open the site a few minutes early, or keep it awake with a monitor on `/api/health`. Free hosting sleeps when idle and the first load can take about a minute.
- **Camera (test 17):** use the HTTPS site, or `localhost` on the same computer. Browsers block the camera on plain `http://192.168…` addresses.
- Photos (test 1) are stored in the MySQL database; nothing to set up.

**Demo data to use in the steps**
- Barcodes: Biogesic `DEMO480100001`, Neozep Forte `DEMO480100002`, Bioflu `DEMO480100003`.
- Expired batches with stock: Cetirizine (QMC) and Ibuprofen (MT Carmel).
- Out of stock: Oresol (QMC) and Loperamide (MT Carmel). Low stock: Neozep Forte, Loratadine, Multivitamins + Zinc.
- Expiring soon: Bioflu (2 days), Ambroxol (3), Solmux (6), Mefenamic Acid (10), Robitussin DM (12).

All dates and times use **Philippine time**.

---

## Theme 1: Batch-level inventory management

**1. Medicine Records.** Log in as Pharmacist → **Medicines → Add medicine**. Click **Choose photo** and pick a JPG or PNG. Enter Name `Test Paracetamol`, Category `Analgesic`, Dosage form `Tablet`, Strength `500mg`, Unit `box`, Reorder level `10`, Branch `QMC` → **Save medicine**.
*Expected:* "Medicine added"; the card appears in the catalog with its photo. *Invalid input:* leave Unit empty and save → "Unit is required".

**2. CSV Import.** **Medicines → Import medicine list → Download CSV Template.** Fill 3 rows: 2 valid, 1 with an empty `name`. Upload it.
*Expected:* the preview marks the bad row invalid with the reason and the others valid. Click **Import 2 medicine(s)** → both appear; the invalid row does not.

**3. Receive Stock.** **Batches → Receive stock.** Choose **Branch** `QMC`, then a **Medicine** (the list shows only QMC medicines). Enter Batch number `LOT-1001`, Quantity `50`, Cost `10.00`, Selling `15.00`, a Manufacture date in the past, an Expiry date at least a month away, and a Supplier → **Receive stock**.
*Expected:* "Batch received"; the batch card shows 50 remaining and the QMC tag; the medicine's stock goes up by 50; **Transactions** shows a **Stock in** movement. *Invalid:* expiry date of yesterday → "Expiry date must be after today".

**4. Branch Records.** **Batches →** branch filter **MT Carmel** → only MT Carmel batches (each card has an MT Carmel tag). Change it to **QMC** → only QMC. Also **Medicines** and **Dashboard** have the same branch filter.

**5. Search and Filter.** **Medicines:** type part of a name → matching medicines only. Click a category chip → that category only. Choose **Low stock** in the stock-level filter → only low-stock medicines.

**6. Suppliers.** **Suppliers → Add supplier:** Name `Test Supplier`, Phone `+63 912 345 6789`, Email `test@supplier.ph` → **Save supplier**. **Edit** it and change the phone. Then **Batches → Receive stock** → the Supplier dropdown lists `Test Supplier`.

## Theme 2: Automated alerts

**7. Low-Stock Alert.** Take a medicine with reorder level 10 and 15 units. **Transactions → New transaction** → its batch, **Sale or dispense**, Quantity `6` → **Save movement**. Open **Alerts**: a **Warning** "… is low on stock: 9 remaining (reorder level: 10)". At zero stock the alert is **Critical** ("out of stock").

**8. Near-Expiry Alert.** **Batches → Receive stock** with an expiry date **5 days from today**. **Alerts** shows "… expires in 5 day(s)". Severity: **Warning** for 4–7 days, **Critical** for 3 or fewer, **Info** for 8–14.

**9. Expired Batch.** **Batches → Edit** an active batch → set Expiry date to **yesterday** → **Update batch**. The card shows **Expired** and **Alerts** has a **Critical** "has expired and should be pulled from shelves" alert.

**10. Notifications Page.** Open **Alerts**: every card shows its severity (Critical / Warning / Info) and Read or Unread. Click **Mark as read** on one → it becomes Read. Tick **Unread only** → read alerts disappear. **Mark all read** → none left unread.

## Theme 3: Stock movement and audit trail

**11. Sale.** **Transactions → New transaction** → an active batch → **Sale or dispense**, Quantity `2` → save. Stock drops by 2 and a **Sale** card appears. Expired and recalled batches are **not listed** for a sale (the fail-safe); the server also rejects them with "…cannot be sold. Record a disposal instead."

**12. Adjustment.** **New transaction → Adjust quantity.** Leave Reason empty → "Give a reason for the adjustment". Enter Reason `recount`, **Adjust by: Adding stock**, Quantity `3` → stock +3. Repeat with **Removing stock** → stock −3. Both appear as **Adjustment** with their reason.

**13. Disposal.** **New transaction → Dispose stock** → pick an **expired** batch (e.g. Cetirizine) → Quantity = its remaining units. The batch drops to 0 and stays **Expired**; the medicine's usable stock excludes it. **Export → Wasted medicines (Excel)** lists it with the disposed quantity.

**14. Return.** **New transaction → Return stock** on a batch that had a sale, Quantity `1` → stock +1; a **Return** card appears.

**15. Transaction History.** **Transactions** shows Stock in, Sale, Adjustment, Disposal and Return cards. Use the type filter (e.g. **Disposal**) and the **date picker** to narrow the list.

**16. Audit Log.** As Administrator → **Audit Log**: entries for the actions above (and logins), each with user, action, date and time. There is no way to delete them.

## Theme 4: Barcode and QR code scanning

**17. Camera Scan.** **Scanner → Start scanning** and allow the camera. Hold a barcode or QR code in the frame (use a printed medicine QR from test 20, or a product barcode registered on a medicine).
*Expected:* "Code scanned" with a green **Found** card naming the medicine; **Open medicine record** opens that medicine's details.

**18. Image Scan.** **Scanner → Upload photo** with a clear photo of a code (QR, EAN-13, EAN-8, UPC-A, UPC-E or Code 128). The same **Found** card appears and **Open medicine record** opens the match. A photo with no code → "No QR code or barcode was found in that photo".

**19. Unknown Code.** Scan or upload a code nothing uses. *Expected:* "No medicine or batch uses this code yet", with two buttons: **Add as new medicine** (the Add medicine form opens with the code in the Barcode field) and **Receive as a batch** (Receive stock opens with the code as the batch number).

**19b. QR with details fills the form in.** Open `docs/sample-qr/index.html` (made by `node client/scripts/generateSampleQr.mjs`) and scan the codes on screen, or upload the PNG files.
- Code 1 (known medicine): the scanner shows what it read and a green "Found in the catalog" card; **Review and receive** opens Receive Stock with batch number, quantity, dates, prices and supplier already filled in. Save; the stock appears on that medicine.
- Code 2 (new medicine): **Receive as unlinked batch** opens the form with "Not connected to a medicine yet" ticked and the name, barcode and branch filled in; **Create medicine from the code** opens the Add medicine form filled in.
- Code 3 (manufacturer GS1 pack code): barcode, expiry date, lot and quantity are read; the rest is left for you.
- Code 4 (bad values): the scanner lists warnings and leaves the bad expiry date and quantity blank instead of accepting them.

**19c. Batches and medicines: connected or not.** Receive a batch with "Not connected to a medicine yet" ticked. On **Batches** it shows a **Not linked** tag and the filter "Not linked to a medicine" finds it; it is not counted in any medicine's stock and cannot be sold. **Link to medicine** (suggests a match by barcode or name, only medicines of the same branch) connects it; its stock then counts and alerts apply as usual.

**20. QR Code Generation.** **Medicines →** the **QR** button on any medicine card (or the QR icon in its details) → a QR code appears → **Download QR code** saves a PNG. Scanning that PNG in test 18 finds the same medicine. (Batches have their own QR on the **Batches** page.)

## Theme 5: AI-assisted analytics

**21. Demand Forecast.** **AI Assistant → Insights → Demand forecast:** each medicine with sales shows average demand per day, the projected 14-day demand, a trend (Rising / Steady / Falling), current stock and a daily forecast bar chart.

**22. Expiry Risk Prediction.** **Insights → Expiry risk:** batches with a risk %, a signal, an explanation and a recommended action.

**23. Anomaly Detection.** **Insights → Anomalies:** the 60-unit Vitamin C sale is flagged with a Z-score and explanation.

**24. Reorder Recommendation.** **Insights → Reorder suggestions:** only medicines that need restocking, each with a suggested quantity.

## Theme 6: AI assistant

**25. Inventory Questions.** **AI Assistant → Chat:** ask "How many boxes of Biogesic do we have?" and "What is expiring this week?" Answers match the **Medicines** and **Batches** pages. Record a sale, ask again: the answer reflects it.

**26. Seasonal Stocking Advice.** **Weather Restock:** shows current weather, the wet/dry season and recommended medicines with reasons. Optionally ask the chat "What should I restock for the rainy season?"

**27. File Request.** In **Chat**: "Generate an Excel file of expiring items" → an `.xlsx` downloads; repeat with "…as a Word document" and "…as a PDF". All open correctly.

**28. Conversation History.** Ask a question. The conversation appears in **Conversations** on its own (no Save step). Go to another page and back, click it → messages restored. Log in as another user → the first user's conversations are not listed.

## Theme 7: Report generation and export

**29. Report Generation.** **Batches → Export:** the **Report** list has Active batches, Expiring soon, Expired, Depleted, Recalled, Wasted medicines, Low stock and Inventory value. **Transactions → Export** gives stock movements; **Alerts → Export** gives alerts. Generate each; the data matches the pages.

**29b. Reports page and sales.** Open **Reports** in the sidebar. Pick a report from the grouped list (stock, sales, movements, alerts), a branch (or All branches) and, where it applies, a batch status or period; choose a format; **Download**. The **Sales** report lists units sold and returned, net sales and estimated profit per medicine, with totals per branch when All branches is chosen. A bad date range shows a clear message instead of a file.

**30. Export Formats.** In the Export dialog, choose each **Format** in turn — Excel, PDF, Word, CSV — for the same report. *Expected:* each file downloads and opens correctly (tables readable, zeros shown, long reports continue across pages).

## Theme 8: User accounts and role-based access

**31. Valid Login.** Log out. The field is labelled **Username (email address)**. Enter a valid address and password → **Log in** → the Dashboard opens.

**32. Invalid Login.** Valid address, wrong password → "Invalid credentials", you stay on the login page. After 5 wrong attempts the account is locked for 15 minutes ("Too many failed attempts…").

**33. Role Restriction.** As Pharmacist: Users, Audit Log, Branches and Maintenance are not in the menu. Typing `/#/users`, `/#/audit-log`, `/#/branches` or `/#/maintenance` sends you to the Dashboard. (The server also refuses these requests.)

**34. User Management.** As Administrator → **Users → Add account** (name, email, 8+ character password, role) → **Create account**. **Edit** it; **Reset** shows a temporary password; **Deactivate** makes that person unable to log in immediately. On your own card there is no Deactivate and the Role field is locked.

**35. Logout.** Avatar menu → **Log out** → login page. Press Back or open `/#/dashboard` → you are sent back to the login page.

## Others

**36. Dashboard.** Shows summary cards (sales today, inventory value, retail value, margin), the stock-status boxes, items needing attention, the 7-day sales chart and top sellers, and a **Stock by category** card. Change the **branch**, **category** and **date** filters → the counts, list and category bars update. If there are unread critical alerts a red banner at the top links to **Alerts**.

**37. Theme Switching.** Click the moon/sun icon in the top bar. *Expected:* **every page** (Dashboard, Medicines, Batches, Suppliers, Transactions, Alerts, Scanner, AI Assistant, and as Administrator Users, Audit Log, Branches, Maintenance) and every pop-up switch to the dark theme with readable text, and back again. The choice is remembered after a reload.

---

## Extra checks (quality characteristics)

- **Backup and restore (Recoverability):** Maintenance → **Download backup**; later **Restore from backup** with that file (typed-confirmation dialog). Do the restore on a test copy first. It replaces all current data.
- **Audit log protection (Non-repudiation):** Maintenance → **Clear notifications** removes alerts but the Audit Log keeps every entry.
- **Branches (Flexibility):** as Administrator → **Branches → Add branch**; the new branch appears in the medicine form, Receive stock, and every branch filter.
- **Text size (Inclusivity):** the "A" icon in the top bar cycles normal / large / extra large.
- **Help (Learnability):** the **?** icon shows tips for the page you are on.
- **Fault tolerance:** upload a photo with no code in the Scanner; the page keeps working and offers to try again.
