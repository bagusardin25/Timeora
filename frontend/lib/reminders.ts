export type ReminderEvent = {
  id: string;
  title: string;
  date: string;
  start_time: string;
  participants?: string;
  reminder_minutes?: number | null;
};

export type ReminderDelivery = {
  key: string;
  title: string;
  body: string;
  event: ReminderEvent;
};

export type ReminderPermissionState = NotificationPermission | "unsupported";

type TimerHandle = number | ReturnType<typeof setTimeout>;

type ReminderSchedulerOptions = {
  now?: () => Date;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  permission?: () => ReminderPermissionState;
  notify?: (title: string, options: NotificationOptions) => void;
  fallback?: (delivery: ReminderDelivery) => void;
};

function parseLocalEventStart(event: ReminderEvent): Date {
  return new Date(`${event.date}T${event.start_time}`);
}

export function getReminderFireTime(event: ReminderEvent): Date | null {
  if (event.reminder_minutes === null || event.reminder_minutes === undefined) {
    return null;
  }
  const start = parseLocalEventStart(event);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() - event.reminder_minutes * 60_000);
}

export function getReminderDelayMs(event: ReminderEvent, now = new Date()): number | null {
  const fireTime = getReminderFireTime(event);
  if (!fireTime) return null;
  return fireTime.getTime() - now.getTime();
}

export function gmailSearchUrl(event: Pick<ReminderEvent, "title" | "participants">): string {
  const terms = [event.title, event.participants].filter(Boolean).join(" ");
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(terms)}`;
}

export async function requestReminderPermission(): Promise<ReminderPermissionState> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

function currentReminderPermission(): ReminderPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

function reminderKey(event: ReminderEvent): string {
  return `${event.id}:${event.date}:${event.start_time}:${event.reminder_minutes ?? "none"}`;
}

function reminderBody(event: ReminderEvent): string {
  const time = event.start_time.slice(0, 5);
  const participants = event.participants ? ` · ${event.participants}` : "";
  return `Starts at ${time}${participants}`;
}

export function createReminderScheduler(options: ReminderSchedulerOptions = {}) {
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle) => window.clearTimeout(handle));
  const permission = options.permission ?? currentReminderPermission;
  const notify = options.notify ?? ((title, notificationOptions) => {
    if (typeof Notification !== "undefined") {
      new Notification(title, notificationOptions);
    }
  });
  const fallback = options.fallback ?? (() => undefined);
  const timers = new Map<string, TimerHandle>();
  const delivered = new Set<string>();

  const deliver = (event: ReminderEvent) => {
    const key = reminderKey(event);
    if (delivered.has(key)) return;
    delivered.add(key);
    timers.delete(key);

    const delivery: ReminderDelivery = {
      key,
      title: event.title,
      body: reminderBody(event),
      event,
    };

    if (permission() === "granted") {
      notify(`Upcoming: ${event.title}`, {
        body: delivery.body,
        tag: key,
      });
      return;
    }

    fallback(delivery);
  };

  return {
    schedule(events: ReminderEvent[]) {
      const nextKeys = new Set<string>();

      for (const event of events) {
        const fireTime = getReminderFireTime(event);
        if (!fireTime) continue;

        const start = parseLocalEventStart(event);
        if (Number.isNaN(start.getTime()) || start.getTime() <= now().getTime()) {
          continue;
        }

        const key = reminderKey(event);
        nextKeys.add(key);
        if (delivered.has(key)) continue;

        const delayMs = fireTime.getTime() - now().getTime();
        if (delayMs <= 0) {
          deliver(event);
          continue;
        }

        if (timers.has(key)) continue;
        timers.set(key, setTimer(() => deliver(event), delayMs));
      }

      for (const [key, handle] of timers) {
        if (!nextKeys.has(key)) {
          clearTimer(handle);
          timers.delete(key);
        }
      }
    },
    cancel() {
      for (const handle of timers.values()) {
        clearTimer(handle);
      }
      timers.clear();
    },
  };
}
