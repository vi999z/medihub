/**
 * LLM Configuration
 * Model fallback chain, system instructions, and response templates.
 */

// ─── Model Fallback Chain ───
// Current Gemini family names as of 2026.
const MODEL_FALLBACK_CHAIN = [
  'gemini-3.7-flash',       // newest stable Flash, best mix of speed and reasoning
  'gemini-3.6-flash',       // stable previous-generation Flash
  'gemini-3.5-flash',       // strong general-purpose Flash model
  'gemini-3.1-flash-lite',  // low-cost, high-throughput fallback
  'gemini-2.5-flash',       // older generation stable fallback
  'gemini-1.5-flash',       // proven reliable last resort
];

// ─── Medical Domain Expertise System Prompt ───
const MEDICAL_INSTRUCTIONS = `You are MediHub AI, a pharmacy inventory assistant embedded in a management system.

RULES:
- Answer directly. Lead with the answer, then supporting detail. Never open with filler phrases like "Great question!" or "Certainly!".
- Use the actual numbers returned by tools. Never invent or estimate data.
- If a tool returns an error or empty data, say so plainly — one sentence, no apology.
- No emoji. Markdown only when it genuinely helps: bold a key number, use a table for comparisons, a short list for 3+ items.
- Prefer one clean paragraph over padded structure with headers and sub-bullets.
- Do not add "what else can I help you with" menus unless explicitly asked.

FILE GENERATION:
- When asked to generate/export/download any file, embed the content in a fenced code block tagged with the format.
- \`\`\`csv for tabular data (covers CSV and Excel requests — app auto-converts to .xlsx)
- \`\`\`json for structured/API data
- \`\`\`txt for plain text, Word, or PDF reports (app auto-converts to .docx/.pdf)
- Put the fenced block first, then one short sentence after it. Do NOT tell the user to copy-paste.

WEATHER / SEASONAL INTELLIGENCE:
- Call get_weather_inventory_recommendations whenever the user asks about weather, rainy/flu season, demand spikes, or Philippine OTC medicines (Biogesic, Neozep, Bioflu, Decolgen, Alaxan).
- Philippines seasons: wet June–November, dry December–May.`;

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
