import { getExecution, startExecution } from "./engine.js";
import { listScheduledWorkflowRows } from "./store.js";

const POLL_MS = 30000;
const activeScheduledRuns = new Map();
let timer = null;

function expandCronField(field, min, max, dayOfWeek = false) {
  const values = new Set();
  const addValue = (value) => {
    const normalized = dayOfWeek && value === 7 ? 0 : value;
    if (normalized < min || normalized > max) throw new Error(`Cron value ${value} is outside ${min}-${max}.`);
    values.add(normalized);
  };

  for (const part of String(field).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error("Empty cron field segment.");
    const [rangePart, stepPart] = trimmed.split("/");
    const step = stepPart == null ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step <= 0) throw new Error("Cron step must be a positive integer.");

    let start;
    let end;
    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const [rangeStart, rangeEnd] = rangePart.split("-").map(Number);
      start = rangeStart;
      end = rangeEnd;
    } else {
      start = Number(rangePart);
      end = Number(rangePart);
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) throw new Error(`Invalid cron range: ${trimmed}.`);
    for (let value = start; value <= end; value += step) addValue(value);
  }
  return values;
}

export function cronMatches(cron, date = new Date()) {
  const fields = String(cron || "").trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron must have five fields.");
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const weekday = date.getDay();
  return expandCronField(minuteField, 0, 59).has(minute)
    && expandCronField(hourField, 0, 23).has(hour)
    && expandCronField(dayField, 1, 31).has(day)
    && expandCronField(monthField, 1, 12).has(month)
    && expandCronField(weekdayField, 0, 7, true).has(weekday);
}

function minuteKey(date = new Date()) {
  return date.toISOString().slice(0, 16);
}

function isStillRunning(key, userId) {
  const executionId = activeScheduledRuns.get(key);
  if (!executionId) return false;
  const execution = getExecution(executionId, userId);
  if (execution?.status === "running") return true;
  activeScheduledRuns.delete(key);
  return false;
}

async function tick() {
  const now = new Date();
  const currentMinute = minuteKey(now);
  const rows = await listScheduledWorkflowRows();
  for (const { userId, workflow } of rows) {
    const schedule = workflow.schedule || {};
    if (!schedule.enabled || !schedule.cron) continue;
    const key = `${userId}:${workflow.id}`;
    if (isStillRunning(key, userId)) continue;
    if (activeScheduledRuns.get(`${key}:minute`) === currentMinute) continue;
    try {
      if (!cronMatches(schedule.cron, now)) continue;
      const execution = startExecution(workflow, userId, schedule.inputs || {});
      activeScheduledRuns.set(key, execution.id);
      activeScheduledRuns.set(`${key}:minute`, currentMinute);
      console.log(`Scheduled workflow started: ${workflow.name} (${workflow.id}) execution=${execution.id}`);
    } catch (error) {
      console.error(`Scheduled workflow skipped: ${workflow.name} (${workflow.id})`, error.message);
      activeScheduledRuns.set(`${key}:minute`, currentMinute);
    }
  }
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((error) => console.error("Scheduler tick failed:", error.message));
  }, POLL_MS);
  tick().catch((error) => console.error("Scheduler startup tick failed:", error.message));
}
