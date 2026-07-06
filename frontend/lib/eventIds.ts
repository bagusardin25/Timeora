export function baseEventId(eventId: string): string {
  return eventId.replace(/_\d{4}-\d{2}-\d{2}$/, "");
}
