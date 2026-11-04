function getZonedParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function utcToDateTimeInput(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getZonedParts(date, timeZone);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function dateTimeInputToUtc(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const expectedUtcParts = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = expectedUtcParts;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedParts(new Date(timestamp), timeZone);
    const representedUtcParts = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const adjustment = expectedUtcParts - representedUtcParts;
    timestamp += adjustment;
    if (adjustment === 0) break;
  }

  const result = new Date(timestamp);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

export function formatInTimeZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
