const express = require("express");
const crypto = require("crypto");
const { Inngest } = require("inngest");
const { serve } = require("inngest/express");

process.env.INNGEST_DEV = process.env.INNGEST_DEV || "1";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// In-memory data store for reports
const reports = new Map();

// Stage 0: Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Stage 1 & 2: Inngest Client
const inngest = new Inngest({ id: "report-api", isDev: true });

// Function 1: say-hello (Event-triggered)
const sayHello = inngest.createFunction(
  { id: "say-hello", triggers: [{ event: "test/hello" }] },
  async ({ event, step }) => {
    await step.sleep("sleep-5-seconds", "5s");
    return "Hello from the background!";
  }
);

// Function 2: make-report (Event-triggered with sleep, run, and retries)
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    triggers: [{ event: "report/requested" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    // Step 1: Simulate slow task (e.g. AI generation, data export)
    await step.sleep("do-the-slow-work", "8s");

    // Step 2: Build report result and update in-memory store
    const result = await step.run("build-report", async () => {
      // Stage 3: Throw error if topic is "fail" to demonstrate retry & backoff
      if (topic === "fail") {
        throw new Error("The report oven is broken!");
      }

      const completedReport = {
        id,
        topic,
        status: "done",
        result: `Comprehensive report on '${topic}'. Generated successfully.`,
        completedAt: new Date().toISOString(),
      };
      reports.set(id, completedReport);
      return completedReport;
    });

    return result;
  }
);

// Function 3: heartbeat (Stage 4: Cron-triggered scheduled job every minute)
const heartbeat = inngest.createFunction(
  {
    id: "heartbeat",
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    return await step.run("log-summary", async () => {
      let pending = 0;
      let done = 0;
      let failed = 0;

      for (const report of reports.values()) {
        if (report.status === "pending") pending++;
        else if (report.status === "done") done++;
        else if (report.status === "failed") failed++;
      }

      const summary = `[Heartbeat Cron] Report Status Summary -> Pending: ${pending}, Done: ${done}, Failed: ${failed} (Total: ${reports.size})`;
      console.log(summary);
      return { pending, done, failed, total: reports.size, summary };
    });
  }
);

// Stage 2 & 3: POST /reports endpoint with input validation
app.post("/reports", async (req, res) => {
  const { topic } = req.body || {};

  // Stage 3: Input validation - reject missing/empty topic at the door with 400 Bad Request
  if (!topic || typeof topic !== "string" || topic.trim() === "") {
    return res.status(400).json({ error: "Missing or invalid 'topic' in request body" });
  }

  const id = crypto.randomUUID();

  const initialReport = {
    id,
    topic,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  reports.set(id, initialReport);

  // Send event to Inngest to trigger background processing
  await inngest.send({
    name: "report/requested",
    data: { id, topic },
  });

  // Return immediately with 202 Accepted
  res.status(202).json({
    id,
    status: "pending",
  });
});

// Stage 2: GET /reports/:id endpoint (Status polling)
app.get("/reports/:id", (req, res) => {
  const { id } = req.params;
  const report = reports.get(id);

  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }

  res.status(200).json(report);
});

// Serve Inngest functions at /api/inngest
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [sayHello, makeReport, heartbeat],
  })
);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
