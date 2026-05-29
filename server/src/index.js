import http from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { authenticationSucceeded, checkAuthRateLimit, createUser, establishSession, findRequestUser, requireAuth, requireTrustedOrigin, revokeSession, verifyUser } from "./auth.js";
import { assertProductionConfig, config } from "./config.js";
import { initializeDatabase } from "./db.js";
import { cancelExecution, getExecution, startExecution, subscribeExecution } from "./engine.js";
import { getExecutionHistory, listExecutionHistory, markInterruptedExecutions } from "./history.js";
import { deleteArtifact, getArtifact, listArtifacts } from "./artifacts.js";
import { createWorkflow, createWorkflowFromTemplate, createWorkflowTemplate, deleteWorkflow, deleteWorkflowTemplate, getWorkflow, listWorkflowTemplates, listWorkflows, updateWorkflow } from "./store.js";
import { openTerminal } from "./terminal.js";
import { startScheduler } from "./scheduler.js";

const app = express();
const clientDist = path.resolve(fileURLToPath(new URL("../../client/dist", import.meta.url)));

if (config.nodeEnv === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  strictTransportSecurity: config.nodeEnv === "production" ? undefined : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/auth/config", (_req, res) => res.json({ registrationEnabled: config.registrationEnabled, terminalEnabled: config.terminalEnabled }));
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));
app.post("/api/auth/register", requireTrustedOrigin, checkAuthRateLimit, async (req, res, next) => {
  if (!config.registrationEnabled) return res.status(403).json({ error: "Account registration is disabled." });
  try {
    const user = await createUser(req.body.email, req.body.password);
    await establishSession(res, user);
    authenticationSucceeded(req);
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/login", requireTrustedOrigin, checkAuthRateLimit, async (req, res) => {
  try {
    const user = await verifyUser(req.body.email, req.body.password);
    await establishSession(res, user);
    authenticationSucceeded(req);
    res.json({ user });
  } catch {
    res.status(401).json({ error: "Invalid email or password." });
  }
});
app.post("/api/auth/logout", requireTrustedOrigin, async (req, res, next) => {
  try {
    await revokeSession(req, res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use("/api/workflows", requireTrustedOrigin, requireAuth);
app.get("/api/workflows", async (req, res, next) => {
  try { res.json(await listWorkflows(req.user.id)); } catch (error) { next(error); }
});
app.get("/api/workflows/:id", async (req, res, next) => {
  try {
    const workflow = await getWorkflow(req.user.id, req.params.id);
    if (!workflow) return res.status(404).json({ error: "Workflow not found." });
    res.json(workflow);
  } catch (error) { next(error); }
});
app.post("/api/workflows", async (req, res, next) => {
  try { res.status(201).json(await createWorkflow(req.user.id, req.body)); } catch (error) { next(error); }
});
app.put("/api/workflows/:id", async (req, res, next) => {
  try {
    const workflow = await updateWorkflow(req.user.id, req.params.id, req.body);
    if (!workflow) return res.status(404).json({ error: "Workflow not found." });
    res.json(workflow);
  } catch (error) { next(error); }
});
app.delete("/api/workflows/:id", async (req, res, next) => {
  try {
    if (!(await deleteWorkflow(req.user.id, req.params.id))) return res.status(404).json({ error: "Workflow not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});
app.post("/api/workflows/:id/run", async (req, res, next) => {
  try {
    const workflow = await getWorkflow(req.user.id, req.params.id);
    if (!workflow) return res.status(404).json({ error: "Workflow not found." });
    res.status(202).json(startExecution(workflow, req.user.id, req.body?.inputs || {}));
  } catch (error) { next(error); }
});

app.use("/api/executions", requireTrustedOrigin, requireAuth);
app.get("/api/executions", async (req, res, next) => {
  try { res.json(await listExecutionHistory(req.user.id, req.query.workflowId)); } catch (error) { next(error); }
});
app.get("/api/executions/:id", async (req, res, next) => {
  try {
    const running = getExecution(req.params.id, req.user.id);
    if (running) return res.json(running);
    const execution = await getExecutionHistory(req.user.id, req.params.id);
    if (!execution) return res.status(404).json({ error: "Execution not found." });
    res.json(execution);
  } catch (error) { next(error); }
});
app.post("/api/executions/:id/cancel", (req, res) => {
  if (!cancelExecution(req.params.id, req.user.id)) return res.status(409).json({ error: "Execution is not running." });
  res.status(202).json({ status: "cancelling" });
});

app.use("/api/templates", requireTrustedOrigin, requireAuth);
app.get("/api/templates", async (req, res, next) => {
  try { res.json(await listWorkflowTemplates(req.user.id)); } catch (error) { next(error); }
});
app.post("/api/templates", async (req, res, next) => {
  try { res.status(201).json(await createWorkflowTemplate(req.user.id, req.body)); } catch (error) { next(error); }
});
app.post("/api/templates/:id/create-workflow", async (req, res, next) => {
  try {
    const workflow = await createWorkflowFromTemplate(req.user.id, req.params.id);
    if (!workflow) return res.status(404).json({ error: "Template not found." });
    res.status(201).json(workflow);
  } catch (error) { next(error); }
});
app.delete("/api/templates/:id", async (req, res, next) => {
  try {
    if (!(await deleteWorkflowTemplate(req.user.id, req.params.id))) return res.status(404).json({ error: "Template not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use("/api/artifacts", requireTrustedOrigin, requireAuth);
app.get("/api/artifacts", async (req, res, next) => {
  try { res.json(await listArtifacts(req.user.id, req.query.workflowId)); } catch (error) { next(error); }
});
app.get("/api/artifacts/:id/download", async (req, res, next) => {
  try {
    const artifact = await getArtifact(req.user.id, req.params.id);
    if (!artifact) return res.status(404).json({ error: "Output file not found." });
    res.setHeader("content-type", artifact.contentType);
    res.setHeader("content-disposition", `attachment; filename="${artifact.filename.replaceAll('"', "")}"`);
    res.send(artifact.content);
  } catch (error) { next(error); }
});
app.delete("/api/artifacts/:id", async (req, res, next) => {
  try {
    if (!(await deleteArtifact(req.user.id, req.params.id))) return res.status(404).json({ error: "Output file not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "Request failed." });
});

const server = http.createServer(app);
const socketServer = new WebSocketServer({ noServer: true });
socketServer.on("connection", async (socket, request) => {
  try {
    if (request.headers.origin !== config.clientOrigin) {
      socket.close(1008, "Connection origin is not allowed.");
      return;
    }
    const user = await findRequestUser(request);
    if (!user) {
      socket.close(1008, "Authentication required.");
      return;
    }
    const executionId = new URL(request.url, `http://${request.headers.host}`).searchParams.get("executionId");
    const unsubscribe = subscribeExecution(executionId, user.id, (event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    if (!unsubscribe) {
      socket.close(1008, "Execution not found.");
      return;
    }
    socket.on("close", unsubscribe);
  } catch {
    socket.close(1011, "Unable to authenticate connection.");
  }
});

const terminalServer = new WebSocketServer({ noServer: true });
terminalServer.on("connection", async (socket, request) => {
  try {
    if (!config.terminalEnabled) {
      socket.close(1008, "Interactive terminal is disabled.");
      return;
    }
    if (request.headers.origin !== config.clientOrigin) {
      socket.close(1008, "Connection origin is not allowed.");
      return;
    }
    const user = await findRequestUser(request);
    if (!user) {
      socket.close(1008, "Authentication required.");
      return;
    }
    openTerminal(socket, user);
  } catch {
    socket.close(1011, "Unable to open terminal.");
  }
});

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
  const webSocketServer = pathname === "/ws"
    ? socketServer
    : pathname === "/terminal"
      ? terminalServer
      : null;

  if (!webSocketServer) {
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

async function start() {
  assertProductionConfig();
  await initializeDatabase();
  await markInterruptedExecutions();
  server.listen(config.port, config.host, () => {
    console.log(`CLIFlow listening on http://${config.host}:${config.port}`);
  });
  startScheduler();
}

start().catch((error) => {
  console.error("Unable to start CLIFlow:", error.message);
  process.exitCode = 1;
});
