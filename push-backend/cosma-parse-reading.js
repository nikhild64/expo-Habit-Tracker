/**
 * Parse Gemini JSON chat/rashifal output into display prose.
 * Handles markdown fences and truncated JSON when maxOutputTokens cuts mid-string.
 */

function stripMarkdownFences(s) {
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? s).trim();
}

function unescapeJsonString(s) {
  try {
    return JSON.parse(`"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch {
    return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function extractTextFieldFromBrokenJson(raw) {
  const complete = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (complete?.[1]) return unescapeJsonString(complete[1]);

  const partial = raw.match(/"text"\s*:\s*"([\s\S]*)$/);
  if (partial?.[1]) {
    let t = partial[1];
    if (t.endsWith('"}')) t = t.slice(0, -2);
    else if (t.endsWith('"')) t = t.slice(0, -1);
    return unescapeJsonString(t).trim();
  }

  return null;
}

function normalizeCitations(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c) =>
      c &&
      typeof c === 'object' &&
      typeof c.planet === 'string' &&
      typeof c.house === 'number',
  );
}

export function parseModelReading(input, fallbackCitations = []) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return { text: '', citations: fallbackCitations };

  if (!trimmed.startsWith('{') && !trimmed.startsWith('```')) {
    return { text: trimmed, citations: fallbackCitations };
  }

  const jsonStr = stripMarkdownFences(trimmed);

  try {
    const obj = JSON.parse(jsonStr);
    if (typeof obj.text === 'string' && obj.text.trim().length > 0) {
      const nested = obj.text.trim();
      if (nested.startsWith('{')) {
        return parseModelReading(nested, normalizeCitations(obj.citations));
      }
      const citations = normalizeCitations(obj.citations);
      return {
        text: obj.text.trim(),
        citations: citations.length > 0 ? citations : fallbackCitations,
      };
    }
  } catch {
    // truncated JSON
  }

  const extracted = extractTextFieldFromBrokenJson(jsonStr);
  if (extracted && extracted.length > 0) {
    return { text: extracted, citations: fallbackCitations };
  }

  return { text: trimmed, citations: fallbackCitations };
}
