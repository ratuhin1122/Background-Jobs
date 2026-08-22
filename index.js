const express = require("express");
const { Inngest } = require("inngest");
const { serve } = require("inngest/express");

process.env.INNGEST_DEV = process.env.INNGEST_DEV || "1";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Stage 0: Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Stage 1: Inngest Client & say-hello Function
const inngest = new Inngest({ id: "report-api", isDev: true });

const sayHello = inngest.createFunction(
  { id: "say-hello", triggers: [{ event: "test/hello" }] },
  async ({ event, step }) => {
    await step.sleep("sleep-5-seconds", "5s");
    return "Hello from the background!";
  }
);

// Serve Inngest functions at /api/inngest
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [sayHello],
  })
);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
