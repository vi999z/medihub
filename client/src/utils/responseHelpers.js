export async function parseJsonResponse(response) {
  if (!response) {
    return null;
  }

  const text = await response.text();
  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${error.message}`);
  }
}
