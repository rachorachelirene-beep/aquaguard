export async function fetchJsonWithTimeout(
  url,
  { timeoutMs = 5000, ...options } = {}
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request returned HTTP ${response.status}.`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Camera API request timed out.", { cause: error });
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
