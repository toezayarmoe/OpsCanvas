import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState, useReactFlow } from "reactflow";
import "reactflow/dist/style.css";
import { LogOut, Play, Save, Workflow } from "lucide-react";
import { api } from "./lib/api";
import { createNode } from "./lib/catalog";
import NodeCard from "./components/NodeCard";
import NodeInspector from "./components/NodeInspector";
import Sidebar from "./components/Sidebar";
import ExecutionConsole from "./components/ExecutionConsole";
import TemplateModal from "./components/TemplateModal";
import AuthScreen from "./components/AuthScreen";

const nodeTypes = { variable: NodeCard, command: NodeCard, ssh: NodeCard, docker: NodeCard, webhook: NodeCard };
const emptyWorkflow = () => ({ name: "Untitled workflow", description: "", nodes: [], edges: [], templates: [] });
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
  const { screenToFlowPosition } = useReactFlow();
  const [workflow, setWorkflow] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [events, setEvents] = useState([]);
  const [execution, setExecution] = useState(null);
  const [templateModal, setTemplateModal] = useState(false);
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

  const loadWorkflow = useCallback(async (id) => {
    const loaded = await api.get(id);
    setWorkflow(loaded);
    setNodes(loaded.nodes.map((node) => ({ ...node, data: { ...node.data, status: "idle" } })));
    setEdges(loaded.edges);
    setSelectedNodeId(null);
    setEvents([]);
    setExecution(null);
    setDirty(false);
  }, [setEdges, setNodes]);

  useEffect(() => {
    (async () => {
      try {
        const settings = await api.authConfig();
        setRegistrationEnabled(settings.registrationEnabled);
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
  }, [loadWorkflow, refreshWorkflows, user]);

  useEffect(() => () => socket.current?.close(), []);

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
  const handleEdgesChange = (changes) => { onEdgesChange(changes); markChanged(); };
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

  const openSocket = (run) => {
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
      if (event.type === "execution.completed") setExecution((current) => ({ ...current, status: event.status }));
    };
    connection.onerror = () => setNotice("Live log connection was interrupted.");
  };

  const setNodeStatus = (id, status) => setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, status } } : node));

  const runWorkflow = async () => {
    try {
      const saved = await saveWorkflow();
      if (!saved) return;
      setEvents([]);
      setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, status: "pending" } })));
      const run = await api.run(saved.id);
      setExecution(run);
      openSocket(run);
    } catch (error) {
      handleRequestError(error);
    }
  };

  const createNew = async () => {
    try {
      const created = await api.create(emptyWorkflow());
      await refreshWorkflows();
      await loadWorkflow(created.id);
    } catch (error) { handleRequestError(error); }
  };

  const addTemplate = (template) => {
    setWorkflow((current) => ({ ...current, templates: [...(current.templates || []), template] }));
    setTemplateModal(false);
    markChanged();
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
    setExecution(null);
    setEvents([]);
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
      <Sidebar
        workflows={workflows}
        activeId={workflow.id}
        templates={workflow.templates || []}
        onLoad={(id) => loadWorkflow(id).catch(handleRequestError)}
        onNew={createNew}
        onOpenTemplate={() => setTemplateModal(true)}
        onDragStart={(event, type, definition) => event.dataTransfer.setData("application/cliflow", JSON.stringify({ type, definition }))}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#0b0f16] px-6">
          <div className="flex items-center gap-4">
            <Workflow size={17} className="text-zinc-500" />
            <input
              value={workflow.name}
              onChange={(event) => { setWorkflow({ ...workflow, name: event.target.value }); markChanged(); }}
              className="w-64 bg-transparent text-base font-semibold outline-none"
            />
            <span className="rounded-md bg-zinc-800/70 px-2 py-1 text-[11px] text-zinc-500">{stats}</span>
          </div>
          <div className="flex gap-2">
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
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1" onDrop={addDroppedNode} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
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
              events={events}
              execution={execution}
              selectedNodeId={selectedNodeId}
              onClear={() => setEvents([])}
              onCancel={() => api.cancel(execution.id).catch(handleRequestError)}
            />
          </div>
          <NodeInspector node={selectedNode} onUpdate={updateNode} onDelete={deleteNode} onClose={() => setSelectedNodeId(null)} />
        </div>
        {templateModal && <TemplateModal onClose={() => setTemplateModal(false)} onCreate={addTemplate} />}
      </div>
    </main>
  );
}
