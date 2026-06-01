import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState, useReactFlow } from "reactflow";
import "reactflow/dist/style.css";
import { ChevronLeft, ChevronRight, LogOut, Play, Save, Trash2, Workflow } from "lucide-react";
import { api } from "./lib/api";
import { createNode } from "./lib/catalog";
import { exportWorkflowFile, importWorkflowFile } from "./lib/workflowFile";
import NodeCard from "./components/NodeCard";
import NodeInspector from "./components/NodeInspector";
import Sidebar from "./components/Sidebar";
import ExecutionConsole from "./components/ExecutionConsole";
import ArtifactsPanel from "./components/ArtifactsPanel";
import TemplateModal from "./components/TemplateModal";
import AuthScreen from "./components/AuthScreen";
import WorkflowInputsModal from "./components/WorkflowInputsModal";
import WorkflowScheduleModal from "./components/WorkflowScheduleModal";
import ExecutionHistoryPanel from "./components/ExecutionHistoryPanel";
import WorkflowTemplatesPanel from "./components/WorkflowTemplatesPanel";

const nodeTypes = { variable: NodeCard, output: NodeCard, parser: NodeCard, jsontable: NodeCard, foreach: NodeCard, conditional: NodeCard, command: NodeCard, ssh: NodeCard, docker: NodeCard, webhook: NodeCard };
const InteractiveTerminal = lazy(() => import("./components/InteractiveTerminal"));
const emptyWorkflow = () => ({ name: "Untitled workflow", description: "", inputs: {}, schedule: { enabled: false, cron: "", inputs: {} }, nodes: [], edges: [], templates: [] });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const serializeNodes = (nodes) => nodes.map(({ id, type, position, data }) => ({
  id,
  type,
  position,
  data: { ...data, status: "idle" },
}));
const serializeEdges = (edges) => edges.map(({ id, source, target, sourceHandle, targetHandle, animated, style }) => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  animated,
  style,
}));

export default function App() {
  const initialized = useRef(false);
  const socket = useRef(null);
  const importFile = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const [workflow, setWorkflow] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [events, setEvents] = useState([]);
  const [execution, setExecution] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [runningExecutions, setRunningExecutions] = useState([]);
  const [workflowTemplates, setWorkflowTemplates] = useState([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(288);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [consoleHeight, setConsoleHeight] = useState(224);
  const [consoleCollapsed, setConsoleCollapsed] = useState(false);
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [inputsModal, setInputsModal] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);

  function handleRequestError(error) {
    if (error.status === 401) {
      socket.current?.close();
      initialized.current = false;
      setUser(null);
      setWorkflow(null);
      setWorkflows([]);
      setNotice("Your session has expired. Sign in again.");
      return;
    }
    setNotice(error.message);
  }

  const refreshWorkflows = useCallback(async () => setWorkflows(await api.list()), []);
  const refreshArtifacts = useCallback(async (workflowId) => setArtifacts(await api.artifacts(workflowId)), []);
  const refreshHistory = useCallback(async (workflowId) => setHistory(await api.executions(workflowId)), []);
  const refreshRunningExecutions = useCallback(async () => {
    const runs = await api.executions();
    setRunningExecutions(runs.filter((run) => run.status === "running"));
  }, []);
  const refreshTemplates = useCallback(async () => setWorkflowTemplates(await api.templates()), []);

  const loadWorkflow = useCallback(async (id) => {
    const [loaded, outputFiles] = await Promise.all([api.get(id), api.artifacts(id)]);
    setWorkflow(loaded);
    setNodes(loaded.nodes.map((node) => ({ ...node, data: { ...node.data, status: "idle" } })));
    setEdges(loaded.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEvents([]);
    setExecution(null);
    setArtifacts(outputFiles);
    setArtifactsOpen(false);
    setHistoryOpen(false);
    setHistory([]);
    setHistoryDetail(null);
    setTemplatesOpen(false);
    setDirty(false);
  }, [setEdges, setNodes]);

  useEffect(() => {
    (async () => {
      try {
        const settings = await api.authConfig();
        setRegistrationEnabled(settings.registrationEnabled);
        setTerminalEnabled(settings.terminalEnabled);
        const session = await api.me();
        setUser(session.user);
      } catch (error) {
        if (error.status !== 401) setNotice(error.message);
      } finally {
        setSessionLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        const available = await api.list();
        setWorkflows(available);
        await Promise.all([refreshTemplates(), refreshRunningExecutions()]);
        if (available.length) {
          await loadWorkflow(available[0].id);
        } else {
          const created = await api.create({ ...emptyWorkflow(), name: "Starter workflow" });
          await refreshWorkflows();
          await loadWorkflow(created.id);
        }
      } catch (error) {
        handleRequestError(error);
      }
    })();
  }, [loadWorkflow, refreshRunningExecutions, refreshTemplates, refreshWorkflows, user]);

  useEffect(() => () => socket.current?.close(), []);

  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(() => {
      refreshRunningExecutions().catch(handleRequestError);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refreshRunningExecutions, user]);

  const saveWorkflow = useCallback(async () => {
    if (!workflow) return null;
    const body = { ...workflow, nodes: serializeNodes(nodes), edges: serializeEdges(edges) };
    const saved = workflow.id ? await api.update(workflow.id, body) : await api.create(body);
    setWorkflow(saved);
    setDirty(false);
    await refreshWorkflows();
    return saved;
  }, [edges, nodes, refreshWorkflows, workflow]);

  const markChanged = () => setDirty(true);
  const handleNodesChange = (changes) => { onNodesChange(changes); markChanged(); };
  const handleEdgesChange = (changes) => {
    onEdgesChange(changes);
    if (changes.some((change) => change.type === "remove" && change.id === selectedEdgeId)) setSelectedEdgeId(null);
    markChanged();
  };
  const onConnect = useCallback((parameters) => {
    setEdges((current) => addEdge({ ...parameters, animated: true, style: { stroke: "#34d399" } }, current));
    setDirty(true);
  }, [setEdges]);

  const addDroppedNode = useCallback((event) => {
    event.preventDefault();
    const payload = event.dataTransfer.getData("application/cliflow");
    if (!payload) return;
    const { type, definition } = JSON.parse(payload);
    setNodes((current) => current.concat(createNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }), definition)));
    setDirty(true);
  }, [screenToFlowPosition, setNodes]);

  const updateNode = (patch) => {
    setNodes((current) => current.map((node) => node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node));
    markChanged();
  };

  const deleteNode = (id) => {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
    markChanged();
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    markChanged();
  };

  const openSocket = (run, workflowId) => {
    socket.current?.close();
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const connection = new WebSocket(`${protocol}://${location.host}/ws?executionId=${run.id}`);
    socket.current = connection;
    connection.onmessage = ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === "node.log") setEvents((current) => current.concat(event));
      if (event.type === "node.started") setNodeStatus(event.nodeId, "running");
      if (event.type === "node.completed") setNodeStatus(event.nodeId, "success");
      if (event.type === "node.failed") setNodeStatus(event.nodeId, event.result.status);
      if (event.type === "node.skipped") setNodeStatus(event.nodeId, "skipped");
      if (event.type === "node.cancelled") setNodeStatus(event.nodeId, "cancelled");
      if (event.type === "execution.completed") {
        setExecution((current) => ({ ...current, status: event.status }));
        refreshArtifacts(workflowId).catch(handleRequestError);
        refreshHistory(workflowId).catch(handleRequestError);
        refreshRunningExecutions().catch(handleRequestError);
      }
    };
    connection.onerror = () => setNotice("Live log connection was interrupted.");
  };

  const setNodeStatus = (id, status) => setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, status } } : node));

  const executeWorkflow = async (runInputs = {}) => {
    try {
      const saved = await saveWorkflow();
      if (!saved) return;
      setEvents([]);
      setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, status: "pending" } })));
      const run = await api.run(saved.id, runInputs);
      setExecution(run);
      refreshRunningExecutions().catch(handleRequestError);
      openSocket(run, saved.id);
    } catch (error) {
      handleRequestError(error);
    }
  };

  const runWorkflow = async () => {
    if (Object.keys(workflow.inputs || {}).length) {
      setInputsModal("run");
      return;
    }
    await executeWorkflow();
  };

  const createNew = async () => {
    try {
      const created = await api.create(emptyWorkflow());
      await refreshWorkflows();
      await loadWorkflow(created.id);
    } catch (error) { handleRequestError(error); }
  };

  const deleteWorkflow = async (id) => {
    const target = workflows.find((item) => item.id === id);
    const name = target?.name || "this workflow";
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.remove(id);
      const remaining = (await api.list()).filter((item) => item.id !== id);
      setWorkflows(remaining);
      if (workflow?.id !== id) return;
      if (remaining.length) {
        await loadWorkflow(remaining[0].id);
        return;
      }
      const created = await api.create({ ...emptyWorkflow(), name: "Starter workflow" });
      await refreshWorkflows();
      await loadWorkflow(created.id);
    } catch (error) { handleRequestError(error); }
  };

  const addTemplate = (template) => {
    setWorkflow((current) => ({ ...current, templates: [...(current.templates || []), template] }));
    setTemplateModal(false);
    markChanged();
  };

  const startResize = (event, apply) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    document.body.classList.add("select-none");
    const onMove = (moveEvent) => apply(moveEvent.clientX - startX, moveEvent.clientY - startY);
    const onUp = () => {
      document.body.classList.remove("select-none");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resizeLeftPanel = (event) => {
    const initialWidth = leftPanelWidth;
    startResize(event, (deltaX) => setLeftPanelWidth(clamp(initialWidth + deltaX, 220, 480)));
  };

  const resizeRightPanel = (event) => {
    const initialWidth = rightPanelWidth;
    startResize(event, (deltaX) => setRightPanelWidth(clamp(initialWidth - deltaX, 260, 540)));
  };

  const resizeConsole = (event) => {
    const initialHeight = consoleHeight;
    startResize(event, (_deltaX, deltaY) => setConsoleHeight(clamp(initialHeight - deltaY, 120, 460)));
  };

  const exportWorkflow = () => {
    const file = exportWorkflowFile(workflow, serializeNodes(nodes), serializeEdges(edges));
    const url = URL.createObjectURL(new Blob([file.contents], { type: "application/json" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = file.filename;
    download.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflow = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Workflow imports support files up to 1 MB.");
      const imported = importWorkflowFile(await file.text());
      const created = await api.create(imported);
      await refreshWorkflows();
      await loadWorkflow(created.id);
    } catch (error) {
      handleRequestError(error);
    } finally {
      event.target.value = "";
    }
  };

  const stats = useMemo(() => `${nodes.length} nodes  /  ${edges.length} connections`, [edges.length, nodes.length]);

  const logout = async () => {
    try { await api.logout(); } catch { /* discard local session even if it expired */ }
    socket.current?.close();
    initialized.current = false;
    setUser(null);
    setWorkflow(null);
    setWorkflows([]);
    setNodes([]);
    setEdges([]);
    setSelectedEdgeId(null);
    setExecution(null);
    setEvents([]);
    setArtifacts([]);
    setArtifactsOpen(false);
    setHistoryOpen(false);
    setHistory([]);
    setHistoryDetail(null);
    setRunningExecutions([]);
    setWorkflowTemplates([]);
    setTemplatesOpen(false);
    setTerminalOpen(false);
    setInputsModal(null);
    setScheduleModal(false);
  };

  const openHistory = async () => {
    try {
      const runs = await api.executions(workflow.id);
      setHistory(runs);
      setHistoryOpen(true);
      if (runs[0]) setHistoryDetail(await api.execution(runs[0].id));
      else setHistoryDetail(null);
    } catch (error) { handleRequestError(error); }
  };

  const selectHistory = async (id) => {
    try { setHistoryDetail(await api.execution(id)); } catch (error) { handleRequestError(error); }
  };

  const openExecutionState = async (id) => {
    try {
      const run = await api.execution(id);
      setHistoryDetail(run);
      const targetWorkflowId = run.workflowId || workflow.id;
      const statuses = run.nodes || {};
      if (targetWorkflowId !== workflow.id) {
        const [loaded, outputFiles] = await Promise.all([api.get(targetWorkflowId), api.artifacts(targetWorkflowId)]);
        setWorkflow(loaded);
        setEdges(loaded.edges);
        setArtifacts(outputFiles);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setArtifactsOpen(false);
        setTemplatesOpen(false);
        setDirty(false);
        setNodes(loaded.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            status: statuses[node.id]?.status || "idle",
          },
        })));
      } else {
        setNodes((current) => current.map((node) => ({
          ...node,
          data: {
            ...node.data,
            status: statuses[node.id]?.status || "idle",
          },
        })));
      }
      setExecution(run);
      setEvents(run.events?.filter((event) => event.type === "node.log") || []);
      setHistoryOpen(false);
      await refreshRunningExecutions();
      if (run.status === "running") {
        openSocket(run, targetWorkflowId);
      } else {
        socket.current?.close();
      }
    } catch (error) {
      handleRequestError(error);
    }
  };

  const saveAsWorkflowTemplate = async () => {
    try {
      const saved = await saveWorkflow();
      if (!saved) return;
      await api.createTemplate({
        name: saved.name,
        description: saved.description || "",
        workflow: { ...saved, nodes: serializeNodes(nodes), edges: serializeEdges(edges) },
      });
      await refreshTemplates();
      setTemplatesOpen(true);
    } catch (error) { handleRequestError(error); }
  };

  const openTemplates = async () => {
    try {
      await refreshTemplates();
      setTemplatesOpen(true);
    } catch (error) { handleRequestError(error); }
  };

  const createFromWorkflowTemplate = async (id) => {
    try {
      const created = await api.createFromTemplate(id);
      await refreshWorkflows();
      await loadWorkflow(created.id);
      setTemplatesOpen(false);
    } catch (error) { handleRequestError(error); }
  };

  if (sessionLoading) return <div className="flex h-screen items-center justify-center bg-[#080b12] text-sm text-zinc-500">Loading CLIFlow...</div>;
  if (!user) return <AuthScreen registrationEnabled={registrationEnabled} message={notice} onAuthenticated={(authenticatedUser) => { setNotice(""); setUser(authenticatedUser); }} />;
  if (!workflow && notice) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#080b12] text-sm text-zinc-400">
        <p>{notice}</p>
        <button onClick={logout} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200">Return to sign in</button>
      </div>
    );
  }
  if (!workflow) return <div className="flex h-screen items-center justify-center bg-[#080b12] text-sm text-zinc-500">Loading CLIFlow...</div>;

  return (
    <main className="flex h-screen overflow-hidden bg-[#080b12] text-zinc-100">
      {leftPanelOpen && (
        <>
          <Sidebar
            width={leftPanelWidth}
            workflows={workflows}
            activeId={workflow.id}
            templates={workflow.templates || []}
            runningExecutions={runningExecutions}
            onLoad={(id) => loadWorkflow(id).catch(handleRequestError)}
            onNew={createNew}
            onDeleteWorkflow={deleteWorkflow}
            onOpenTemplate={() => setTemplateModal(true)}
            onCollapse={() => setLeftPanelOpen(false)}
            onDragStart={(event, type, definition) => event.dataTransfer.setData("application/cliflow", JSON.stringify({ type, definition }))}
            onRefreshRunning={() => refreshRunningExecutions().catch(handleRequestError)}
            onResumeRunning={openExecutionState}
            actions={{
              openInputs: () => setInputsModal("configure"),
              openSchedule: () => setScheduleModal(true),
              openOutputs: () => { setArtifactsOpen(true); refreshArtifacts(workflow.id).catch(handleRequestError); },
              openHistory,
              openTemplates,
              saveTemplate: saveAsWorkflowTemplate,
              importWorkflow: () => importFile.current?.click(),
              exportWorkflow,
              toggleTerminal: () => setTerminalOpen((open) => !open),
            }}
            terminalEnabled={terminalEnabled}
            terminalOpen={terminalOpen}
            inputsCount={Object.keys(workflow.inputs || {}).length}
            outputsCount={artifacts.length}
            scheduleEnabled={Boolean(workflow.schedule?.enabled)}
          />
          <div
            onMouseDown={resizeLeftPanel}
            title="Resize node library"
            className="z-20 w-1 shrink-0 cursor-col-resize border-r border-zinc-800/60 bg-[#080b12] hover:bg-emerald-500/40"
          />
        </>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0b0f16] px-6">
          <div className="flex items-center gap-4">
            <Workflow size={17} className="text-zinc-500" />
            <input
              value={workflow.name}
              onChange={(event) => { setWorkflow({ ...workflow, name: event.target.value }); markChanged(); }}
              className="w-64 bg-transparent text-base font-semibold outline-none"
            />
          </div>
          <div className="flex gap-2">
            <input ref={importFile} type="file" accept=".json,.cliflow.json,application/json" className="hidden" onChange={importWorkflow} />
            <button onClick={() => saveWorkflow().catch(handleRequestError)} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
              <Save size={15} /> {dirty ? "Save changes" : "Saved"}
            </button>
            <button onClick={runWorkflow} disabled={execution?.status === "running"} className="flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">
              <Play size={15} fill="currentColor" /> Run workflow
            </button>
            <button onClick={logout} title={`Sign out ${user.email}`} className="ml-2 flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:text-white">
              <LogOut size={15} />
            </button>
          </div>
        </header>
        {notice && (
          <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-rose-500/30 bg-[#1a1018] px-4 py-3 text-sm text-rose-200 shadow-panel">
            {notice}<button onClick={() => setNotice("")} className="text-rose-400">Dismiss</button>
          </div>
        )}
        {artifactsOpen && (
          <ArtifactsPanel
            artifacts={artifacts}
            hasOutputNode={nodes.some((node) => node.type === "output")}
            onClose={() => setArtifactsOpen(false)}
            onDelete={async (id) => {
              try {
                await api.removeArtifact(id);
                await refreshArtifacts(workflow.id);
              } catch (error) { handleRequestError(error); }
            }}
          />
        )}
        {historyOpen && (
          <ExecutionHistoryPanel
            executions={history}
            detail={historyDetail}
            onClose={() => setHistoryOpen(false)}
            onRefresh={() => openHistory()}
            onResume={openExecutionState}
            onSelect={selectHistory}
          />
        )}
        {templatesOpen && (
          <WorkflowTemplatesPanel
            templates={workflowTemplates}
            onClose={() => setTemplatesOpen(false)}
            onRefresh={refreshTemplates}
            onCreateFromTemplate={createFromWorkflowTemplate}
            onDelete={async (id) => {
              try {
                await api.removeTemplate(id);
                await refreshTemplates();
              } catch (error) { handleRequestError(error); }
            }}
          />
        )}
        {terminalOpen && (
          <Suspense fallback={null}>
            <InteractiveTerminal onClose={() => setTerminalOpen(false)} />
          </Suspense>
        )}
        {!leftPanelOpen && (
          <button
            onClick={() => setLeftPanelOpen(true)}
            title="Show node library"
            className="absolute left-4 top-20 z-10 flex items-center gap-1 rounded-lg border border-zinc-700 bg-[#11151e] px-2.5 py-2 text-xs text-zinc-300 shadow-panel hover:border-emerald-500/40 hover:text-white"
          >
            <ChevronRight size={15} /> Library
          </button>
        )}
        {!rightPanelOpen && (
          <button
            onClick={() => setRightPanelOpen(true)}
            title="Show node inspector"
            className="absolute right-4 top-20 z-10 flex items-center gap-1 rounded-lg border border-zinc-700 bg-[#11151e] px-2.5 py-2 text-xs text-zinc-300 shadow-panel hover:border-emerald-500/40 hover:text-white"
          >
            Inspector <ChevronLeft size={15} />
          </button>
        )}
        {selectedEdgeId && (
          <button
            onClick={deleteSelectedEdge}
            title="Delete selected connection"
            className="absolute left-1/2 top-20 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-rose-500/40 bg-[#1a1018] px-3 py-2 text-xs text-rose-200 shadow-panel hover:bg-rose-500/20"
          >
            <Trash2 size={14} /> Delete connection
          </button>
        )}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1" onDrop={addDroppedNode} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}>
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-zinc-800/80 bg-[#0b0f16]/90 px-3 py-1.5 text-[11px] font-medium text-zinc-400 shadow-panel backdrop-blur">
                {stats}
              </div>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
                onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
                onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
                onEdgesDelete={() => { setSelectedEdgeId(null); markChanged(); }}
                onNodesDelete={(removed) => { removed.forEach((node) => deleteNode(node.id)); }}
                fitView
                deleteKeyCode={["Backspace", "Delete"]}
                defaultEdgeOptions={{ animated: true, style: { stroke: "#34d399" } }}
              >
                <Background color="#1d2430" gap={20} size={1} />
                <Controls position="bottom-left" />
                <MiniMap nodeColor="#27303f" maskColor="rgba(8,11,18,.78)" />
              </ReactFlow>
            </div>
            <ExecutionConsole
              height={consoleHeight}
              events={events}
              execution={execution}
              selectedNodeId={selectedNodeId}
              onClear={() => setEvents([])}
              onCancel={() => api.cancel(execution.id).catch(handleRequestError)}
              collapsed={consoleCollapsed}
              onToggleCollapsed={() => setConsoleCollapsed((collapsed) => !collapsed)}
              onResizeStart={resizeConsole}
            />
          </div>
          {rightPanelOpen && (
            <>
              <div
                onMouseDown={resizeRightPanel}
                title="Resize inspector"
                className="z-20 w-1 shrink-0 cursor-col-resize border-l border-zinc-800/60 bg-[#080b12] hover:bg-emerald-500/40"
              />
              <NodeInspector
                width={rightPanelWidth}
                node={selectedNode}
                onUpdate={updateNode}
                onDelete={deleteNode}
                onClose={() => setSelectedNodeId(null)}
                onCollapse={() => setRightPanelOpen(false)}
              />
            </>
          )}
        </div>
        {templateModal && <TemplateModal onClose={() => setTemplateModal(false)} onCreate={addTemplate} />}
        {inputsModal && (
          <WorkflowInputsModal
            mode={inputsModal}
            inputs={workflow.inputs || {}}
            onClose={() => setInputsModal(null)}
            onSubmit={(inputs) => {
              if (inputsModal === "configure") {
                setWorkflow((current) => ({ ...current, inputs }));
                setInputsModal(null);
                markChanged();
                return;
              }
              setInputsModal(null);
              executeWorkflow(inputs);
            }}
          />
        )}
        {scheduleModal && (
          <WorkflowScheduleModal
            schedule={workflow.schedule}
            workflowInputs={workflow.inputs || {}}
            onClose={() => setScheduleModal(false)}
            onSubmit={(schedule) => {
              setWorkflow((current) => ({ ...current, schedule }));
              setScheduleModal(false);
              markChanged();
            }}
          />
        )}
      </div>
    </main>
  );
}
