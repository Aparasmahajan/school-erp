// Telemetry worker thread: delivers this school's audit events and health reports to the
// Control console, off the main thread so requests are never slowed by it.
//
// Plain JavaScript on purpose: worker threads load files directly, without the TypeScript
// loader the main process runs under.
//
// - Events are kept in an outbox file until the Control console confirms them, so a
//   network outage or restart loses nothing (up to MAX_QUEUE events; older ones are
//   dropped and the count is reported).
// - Failures back off exponentially up to 5 minutes.
// - Only the latest heartbeat is kept; an old health report is worthless.

import { parentPort, workerData } from 'node:worker_threads';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const { url, schoolId, installKey, flushMs, outboxPath } = workerData;
const MAX_QUEUE = 10_000;
const BATCH = 200;
const MAX_BACKOFF_MS = 5 * 60_000;

let queue = loadOutbox();
let heartbeat = null;
let dropped = 0;
let backoffMs = 0;
let timer = null;
let inflight = null;

function loadOutbox() {
  try {
    return existsSync(outboxPath) ? JSON.parse(readFileSync(outboxPath, 'utf8')) : [];
  } catch {
    return [];
  }
}

function saveOutbox() {
  try {
    mkdirSync(path.dirname(outboxPath), { recursive: true });
    const tmp = `${outboxPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(queue), { mode: 0o600 });
    renameSync(tmp, outboxPath);
  } catch (err) {
    console.error('[telemetry] could not save the outbox:', err.message);
  }
}

async function post(route, body) {
  const res = await fetch(`${url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${installKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
}

async function send() {
  try {
    if (heartbeat) {
      const hb = { ...heartbeat, queued: queue.length, dropped };
      await post('/api/ingest/heartbeat', hb);
      if (heartbeat && heartbeat.at === hb.at) heartbeat = null;
    }
    while (queue.length) {
      const batch = queue.slice(0, BATCH);
      await post('/api/ingest/events', { schoolId, events: batch });
      queue = queue.slice(batch.length);
      saveOutbox();
    }
    backoffMs = 0;
  } catch (err) {
    backoffMs = Math.min(backoffMs ? backoffMs * 2 : flushMs, MAX_BACKOFF_MS);
    if (err.status === 401 || err.status === 403) {
      console.error('[telemetry] the Control console refused this school. Check CONTROL_SCHOOL_ID and CONTROL_INSTALL_KEY.');
    } else {
      console.warn(`[telemetry] could not reach the Control console (${err.message}); retrying in ${Math.round(backoffMs / 1000)} s`);
    }
  }
}

function flush() {
  if (!inflight) {
    inflight = send().finally(() => {
      inflight = null;
      schedule();
    });
  }
  return inflight;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(flush, backoffMs || flushMs);
}

parentPort.on('message', (msg) => {
  if (msg.type === 'event') {
    queue.push(msg.event);
    if (queue.length > MAX_QUEUE) {
      dropped += queue.length - MAX_QUEUE;
      queue = queue.slice(-MAX_QUEUE);
    }
    saveOutbox();
    if (queue.length >= BATCH && !backoffMs) void flush();
  } else if (msg.type === 'heartbeat') {
    heartbeat = msg.data;
    if (!backoffMs) void flush();
  } else if (msg.type === 'flush') {
    // Explicit request (shutdown, tests): try now, even while backing off.
    void (async () => {
      await flush();
      if (queue.length || heartbeat) await flush();
      parentPort.postMessage({ type: 'flushed', queued: queue.length });
    })();
  }
});

schedule();
