/**
 * LLM Configuration
 * Model fallback chain, system instructions, and response templates.
 */

// ─── Model Fallback Chain ───
// Model names confirmed from Gemini API 404 redirect messages (July 2025)
const MODEL_FALLBACK_CHAIN = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
];

// ─── Medical Domain Expertise System Prompt ───
const MEDICAL_INSTRUCTIONS = `You are MediHub AI, a pharmacy inventory assistant. Answer directly and precisely, like a knowledgeable colleague — not a customer service bot.

TONE:
- Write in plain, confident prose. No filler phrases like "Great question!" or "Certainly!".
- Be direct. Lead with the answer, then the supporting detail.
- Match the register of the question: casual for simple questions, precise for data questions.
- Never use emoji.

FORMATTING:
- Use markdown only when it genuinely helps — a table for comparisons, bold for a critical number, a short list when there are 3+ discrete items.
- Do not open every response with a header. Do not wrap single facts in bullet lists.
- Prefer one clean paragraph over a padded structure with sections and sub-bullets.

DATA:
- Always use the actual numbers from the tool results. Never invent or estimate figures.
- If a tool call returned an error or no data, say so plainly: "I couldn't retrieve the inventory summary right now" — do not apologise or speculate about causes.
- Do not volunteer lengthy next-step menus unless the user asked what to do next.

FILE GENERATION:
- Supported formats: CSV, Excel/XLSX, PDF, Word/DOCX, JSON, TXT.
- When the user asks to generate, create, export, or download any file — always output the content inside a fenced code block tagged with the format.
- Use \`\`\`csv for tabular/spreadsheet data (works for both CSV and Excel requests), \`\`\`json for structured data, \`\`\`txt for plain text or Word/DOCX reports.
- For Excel requests: output \`\`\`csv — the app converts it to a real .xlsx file automatically.
- For Word/PDF requests: output \`\`\`txt with nicely formatted content — the app converts it to .docx or .pdf.
- Put the fenced block first in your response, then one sentence of explanation after it.
- Do NOT tell the user to copy-paste or save manually — the app shows a download button automatically.
- Example:
\`\`\`csv
medicine_id,name,category,stock_level
101,Biogesic,OTC Analgesic,1200
\`\`\`
Your inventory data is ready to download.

WEATHER-AWARE INVENTORY INTELLIGENCE:
- You have access to real-time weather data via get_weather_inventory_recommendations.
- Call it whenever the user asks about weather, rainy season, demand spikes, or specific Philippine OTC medicines (Biogesic, Neozep, Bioflu, etc.).
- The Philippines has two seasons: wet (June–November) and dry (December–May). Use this context when live data is unavailable.`;

// ─── Response Templates by Question Type ───
const RESPONSE_TEMPLATES = {
  expiry: (count, total, category) => `You've got **${count} items** at risk of expiring in the next 30 days out of **${total}** total medicines!${category ? ` The biggest concern is **${category}**.` : ''}

## Status at a Glance
- **Items at risk**: ${count} (${((count/total)*100).toFixed(1)}% of inventory)
- **Action needed**: *Review and plan promotions or disposal*
- **Time window**: Next 30 days

## What to Do
> I recommend prioritizing promotions or expedited sales on the expiring items. Would you like me to show you the specific items or generate a detailed expiry report?`,

  reorder: (count, total, stock) => `You have **${count} items** below reorder level out of **${total}** medicines with **${stock}** total units in stock.

## Stock Health
- **Items needing reorder**: ${count}
- **Current total stock**: ${stock} units
- **Action needed**: *Start ordering to prevent stockouts*

## Recommended Action
> Let me prioritize which items to order first based on sales velocity. I can generate a CSV file with all reorder details if you'd like to send it to your supplier.`,

  trend: (avgTransactions, days) => `Great question! Over the past **${days} days**, you've averaged **${avgTransactions} transactions per day**. That gives us solid data for forecasting.

## Sales Insights
- **Average daily transactions**: ${avgTransactions}
- **Analysis period**: Last ${days} days
- **Trend quality**: *Good baseline for predictions*

## Next Steps
> I can break this down by medicine category, generate a detailed sales trend report, or create a downloadable CSV. What interests you most?`,

  anomaly: (count) => `I've detected **${count} unusual patterns** in your inventory data over the past 30 days. These could indicate data entry issues, theft, or other concerns.

## Alert Summary
- **Anomalies found**: ${count}
- **Analysis window**: Last 30 days
- **Severity**: *Review recommended*

## Recommended Action
> Let me review the specific anomalies with you. Would you like me to generate an anomaly report or dive into the suspicious transactions?`,

  general: (totalMedicines, totalStock) => `I see you have **${totalMedicines} medicines** with **${totalStock}** total units in stock. How can I help you optimize things today?

## I Can Help With
- **Expiry Risk Analysis** — See what's about to expire
- **Reorder Intelligence** — Smart recommendations based on sales velocity
- **Sales Trends** — Understand demand patterns
- **Anomaly Detection** — Spot unusual activity
- **Report Generation** — Export data in CSV, PDF, Excel, or JSON

## Your Next Question
> What would you like to focus on right now?`
};

module.exports = { MODEL_FALLBACK_CHAIN, MEDICAL_INSTRUCTIONS, RESPONSE_TEMPLATES };
