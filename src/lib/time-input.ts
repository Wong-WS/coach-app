export type HalfDay = 'AM' | 'PM';

export interface ParseOptions {
  /** Bias AM/PM when the user types a bare 1–11 with no suffix. */
  contextHalfDay?: HalfDay;
}

/**
 * Parse a free-text time string into canonical "HH:MM" (24h).
 * Returns null if the input cannot be unambiguously interpreted.
 */
export function parseTimeInput(raw: string, opts: ParseOptions = {}): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // Detect am/pm suffix (with or without space/period).
  const suffixMatch = trimmed.match(/\s*(a\.?m\.?|p\.?m\.?|a|p)\s*$/);
  const hasPM = suffixMatch ? /^p/.test(suffixMatch[1]) : false;
  const hasAM = suffixMatch ? /^a/.test(suffixMatch[1]) : false;
  const body = suffixMatch ? trimmed.slice(0, -suffixMatch[0].length).trim() : trimmed;

  // Extract hour and minute from the body.
  let hour: number;
  let minute: number;

  if (/^\d{1,2}[:\s]\d{1,2}$/.test(body)) {
    // "9:05", "13:5", "9 30"
    const [h, m] = body.split(/[:\s]/).map(Number);
    hour = h;
    minute = m;
  } else if (/^\d+$/.test(body)) {
    // Pure digits: "9", "905", "21", "1305"
    if (body.length <= 2) {
      hour = Number(body);
      minute = 0;
    } else if (body.length === 3) {
      hour = Number(body.slice(0, 1));
      minute = Number(body.slice(1));
    } else if (body.length === 4) {
      hour = Number(body.slice(0, 2));
      minute = Number(body.slice(2));
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || minute < 0 || minute >= 60) return null;

  // Apply AM/PM logic.
  if (hasAM || hasPM) {
    if (hour < 1 || hour > 12) return null; // "13pm" etc. is nonsense
    if (hasAM) hour = hour === 12 ? 0 : hour;
    if (hasPM) hour = hour === 12 ? 12 : hour + 12;
  } else {
    // No suffix — apply 24h rules + context bias.
    if (hour >= 24) return null;
    if (hour >= 13) {
      // Leave as 24h interpretation.
    } else if (opts.contextHalfDay === 'PM') {
      if (hour === 12) {
        // noon stays 12
      } else {
        hour += 12;
      }
    } else if (opts.contextHalfDay === 'AM') {
      if (hour === 12) hour = 0;
    }
    // Otherwise (no context): hour stays as typed (1–12 → 01:00–12:00, 0 → 00:00).
  }

  if (hour >= 24) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
