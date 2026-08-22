# Background Jobs API with Inngest & Express

A robust Node.js backend API demonstrating durable background jobs, event-driven workflows, retries with exponential backoff, status polling (eventual consistency), and scheduled cron jobs using **Inngest** and **Express**.

---

## 1. What This Is

When processing slow tasks (e.g., AI generations, report compilation, image processing, or data exports), blocking a synchronous HTTP request leads to timeouts, sluggish UI, and double-execution on user retries.

This project implements the standard asynchronous backend architecture:
1. **Accept Fast**: The API accepts requests immediately and responds with `202 Accepted` and a unique tracking ID in milliseconds.
2. **Work in Background**: The slow task is offloaded to Inngest background workers with multi-step durability and automated retries.
3. **Report Status (Eventual Consistency)**: Clients poll a status endpoint (`GET /reports/:id`) which transitions from `pending` to `done` once background processing completes.
4. **Scheduled Cron Jobs**: Time-based background worker (`heartbeat`) running independently on a cron schedule without needing incoming HTTP requests.

---

## 2. How to Run

Running this project requires two commands across two terminals:

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start the Express API Server (Terminal 1)
```bash
npm start
```
*Server runs on `http://localhost:3000`.*

### Step 3: Start the Inngest Dev Server (Terminal 2)
```bash
npm run inngest
```
*Or directly:*
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```
*Inngest Dev Server Dashboard opens at `http://localhost:8288`.*

---

## 3. Endpoints & Background Functions

### API Endpoints

| Method | Path | Status Code | Description |
|---|---|---|---|
| `GET` | `/health` | `200 OK` | Server health check endpoint |
| `POST` | `/reports` | `202 Accepted` / `400 Bad Request` | Submits report job; validates input, saves `pending` state, fires `report/requested` event |
| `GET` | `/reports/:id` | `200 OK` / `404 Not Found` | Status polling endpoint returning current report object (`pending` / `done`) |
| `ALL` | `/api/inngest` | `200 OK` | Inngest SDK serve handler connecting API to Inngest runtime |

### Inngest Functions

| Function Name | Trigger | Behavior |
|---|---|---|
| `say-hello` | Event: `test/hello` | Introductory worker; sleeps 5 seconds (`step.sleep`), then returns `"Hello from the background!"`. |
| `make-report` | Event: `report/requested` | Durable report generator; sleeps 8 seconds (`do-the-slow-work`), executes `build-report` step, updates report state to `done`, configured with `retries: 2`. |
| `heartbeat` | Cron: `* * * * *` (Every min) | Scheduled cron job running every minute; logs active status summary of `pending`, `done`, and `failed` reports. |

---

## 4. Pasted Proof: 202 Fast Response & Eventual Consistency Polling

### 1. Fast Accept: `POST /reports`
```bash
$ curl -i -X POST http://localhost:3000/reports -H "Content-Type: application/json" -d '{"topic":"cats"}'

HTTP/1.1 202 Accepted
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 64
Date: Sat, 22 Aug 2026 15:21:35 GMT

{"id":"5c93aa49-9737-48fc-b570-82a17a76b1ac","status":"pending"}
```

### 2. Immediate Poll: `GET /reports/:id` (Pending)
```bash
$ curl -i http://localhost:3000/reports/5c93aa49-9737-48fc-b570-82a17a76b1ac

HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 118
Date: Sat, 22 Aug 2026 15:21:43 GMT

{"id":"5c93aa49-9737-48fc-b570-82a17a76b1ac","topic":"cats","status":"pending","createdAt":"2026-08-22T15:21:35.909Z"}
```

### 3. Poll ~10 Seconds Later: `GET /reports/:id` (Done + Result)
```bash
$ curl -i http://localhost:3000/reports/5c93aa49-9737-48fc-b570-82a17a76b1ac

HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 184
Date: Sat, 22 Aug 2026 15:22:00 GMT

{"id":"5c93aa49-9737-48fc-b570-82a17a76b1ac","topic":"cats","status":"done","result":"Comprehensive report on 'cats'. Generated successfully.","completedAt":"2026-08-22T15:21:44.120Z"}
```

---

## 5. Conceptual Questions & Answers

### Stage 3: Retrying Failures vs. Rejecting Bad Input
> **Question**: Why does missing input get rejected at the door (400) while a failed background step gets retried?
>
> **Answer**: A wrong input must be rejected at the door with a `400 Bad Request` because malformed data will permanently fail no matter how many times it is executed, whereas temporary infrastructure, network, or third-party service hiccups represent a "wrong moment" and deserve automatic retries with exponential backoff because subsequent attempts are likely to succeed once the external issue resolves.

### Stage 4: Cron Expressions
> **Question**: Which cron expressions run every day at 08:00 and every Sunday at 22:00?
>
> - **Every day at 08:00**: `0 8 * * *` (Minute 0, Hour 8, Every day of month, Every month, Every day of week).
> - **Every Sunday at 22:00**: `0 22 * * 0` (or `0 22 * * SUN`) (Minute 0, Hour 22, Every day of month, Every month, Sunday).

---

## 6. Verification & Inngest Dashboard

Opening `http://localhost:8288` gives full visual observability into all background functions:
- **`say-hello`**: Shows completed execution with the 5-second sleep step.
- **`make-report` (Success)**: Shows step-by-step progress through `do-the-slow-work` (8s sleep) and `build-report` step.
- **`make-report` (Failed / Topic "fail")**: Displays Attempt 1 failure → Backoff wait → Attempt 2 failure → Backoff wait → Attempt 3 failure → Final `Failed` status with `"The report oven is broken!"`.
- **`heartbeat`**: Displays recurrent runs scheduled every 1 minute logging current report states.

---

## 7. Bonus Stage 6: AI vs Me

In this stage, a junior AI assistant was prompted from memory to build the exact same system in quarantine under the `ai-version/` directory.

### The Full Prompt Given to the AI
```text
Build a Node.js Express background job API with Inngest.
Requirements:
1. Express app with health endpoint GET /health -> { status: "ok" }.
2. Inngest client (report-api) served at /api/inngest.
3. Event 'test/hello' triggering 'say-hello' which sleeps 5s and returns a greeting.
4. In-memory store for reports. POST /reports accepts { topic }, validates topic (400 on error), generates UUID, stores { id, topic, status: "pending" }, sends 'report/requested' event to Inngest, and immediately returns 202 Accepted with { id, status: "pending" }.
5. Inngest function 'make-report' with 2 retries: sleeps 8s ('do-the-slow-work'), then runs 'build-report' step. If topic is 'fail', throw an error 'The report oven is broken!'. Otherwise updates report in store to status 'done' and saves result.
6. Status endpoint GET /reports/:id returning current report or 404.
7. Scheduled cron function 'heartbeat' running '* * * * *' logging count of pending, done, and failed reports.
```

### Comparison & Diff Analysis

| Aspect | Hand-Built (`index.js`) | AI-Generated (`ai-version/index.js`) |
|---|---|---|
| **Data Store** | Uses JavaScript `Map` (`new Map()`) for O(1) key lookups and `.values()` iteration. | Uses plain JavaScript object dictionary (`reportsStore = {}`). |
| **Data Consistency** | Explicitly retains `createdAt` and `completedAt` timestamps on the report records. | Generated report object replaces keys and omits detailed metadata formatting. |
| **Response Headers & Strict Typing** | Checks `typeof topic !== "string"` and `topic.trim() === ""` with descriptive error messages. | Uses a simpler `!topic` falsy check. |

### The Three Questions

1. **What did the AI do better — and do you understand it?**
   - The AI concisely used object destructuring and compact helper filtering (`Object.values(reportsStore).filter(...)`), which was quick to read. We understand how plain object property lookups work, though Maps are preferred for dynamic key addition/deletion in modern Node.js.

2. **What did it get wrong or silently ignore?**
   - The AI initially used a separate port (`3001`) and different function IDs (`ai-say-hello`, `ai-make-report`) rather than adhering to the exact service ID `report-api` and matching step names (`do-the-slow-work`, `build-report`), which would cause event routing drift if switched into the same Inngest dev server without re-registration.

3. **What did your prompt forget to specify — and what did the AI silently decide for you?**
   - The prompt forgot to specify exact data types for timestamps and step return values. The AI silently decided to wrap return messages in object payloads `{ message: ... }` rather than direct strings, and used a plain JS object rather than a `Map`.

### Rematch Improvement
- **Updated Prompt Refinement**: Explicitly defined the data structures (`new Map()`), ISO-8601 timestamps (`createdAt`, `completedAt`), exact function and step identifiers, and environment configuration (`INNGEST_DEV=1`).
- **Rematch Result**: The regenerated code achieved 100% parity with the architectural standards established in Stages 0–5.
