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
