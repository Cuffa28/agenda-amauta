import { addDays, BA_TZ, BA_UTC_OFFSET, formatDateLong } from "./dates";

export interface FollowUpPreview {
  startIso: string;
  endIso: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  endDate: string;
  endsNextDay: boolean;
  durationLabel: string;
  timezone: typeof BA_TZ;
  timezoneLabel: string;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Vista previa de un evento en hora de Buenos Aires. No incluye invitados. */
export function buildFollowUpPreview(input: {
  date: string;
  time: string;
  durationMinutes: number;
}): FollowUpPreview {
  const [h = NaN, m = NaN] = input.time.split(":").map(Number);
  const totalEnd = h * 60 + m + input.durationMinutes;
  const dayOffset = Math.floor(totalEnd / 1440);
  const endMinutes = totalEnd % 1440;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const endDate = addDays(input.date, dayOffset);
  return {
    startIso: `${input.date}T${input.time}:00${BA_UTC_OFFSET}`,
    endIso: `${endDate}T${endTime}:00${BA_UTC_OFFSET}`,
    dateLabel: formatDateLong(input.date),
    startTime: input.time,
    endTime,
    endDate,
    endsNextDay: dayOffset > 0,
    durationLabel: formatDuration(input.durationMinutes),
    timezone: BA_TZ,
    timezoneLabel: "Hora de Buenos Aires (UTC−03:00)",
  };
}

