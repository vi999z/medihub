/**
 * Parse CSV text into an array of row objects.
 * Handles quoted fields, escaped quotes, and commas inside quotes.
 */
export function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row');
  }

  function parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Read a File object and return its text content.
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}