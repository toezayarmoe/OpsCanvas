import { useState } from "react";
import { Download, FileText, Table2, Trash2, X } from "lucide-react";
import JsonTableViewer from "./JsonTableViewer";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArtifactsPanel({ artifacts, hasOutputNode, onClose, onDelete }) {
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreviewId, setLoadingPreviewId] = useState(null);

  const openTablePreview = async (artifact) => {
    setPreviewError("");
    setLoadingPreviewId(artifact.id);
    try {
      const response = await fetch(`/api/artifacts/${artifact.id}/download`, { credentials: "include" });
      if (!response.ok) throw new Error(`Unable to load artifact (${response.status}).`);
      setPreview({ title: artifact.filename, content: await response.text() });
    } catch (error) {
      setPreviewError(error.message);
    } finally {
      setLoadingPreviewId(null);
    }
  };

  return (
    <>
      <aside className="absolute right-5 top-20 z-20 w-[430px] rounded-2xl border border-zinc-800 bg-[#10151f] p-4 shadow-panel">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Artifacts</p>
            <h2 className="mt-1 text-base font-semibold">Output files</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={17} /></button>
        </header>
        {previewError && (
          <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{previewError}</p>
        )}
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {artifacts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
              {hasOutputNode
                ? "Run the workflow successfully to create downloadable files from its Output file node."
                : "This workflow has no Output file node. Drag one onto the canvas and connect it to the node whose result you want to download."}
            </p>
          ) : artifacts.map((artifact) => (
            <div key={artifact.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#0b0f17] p-3">
              <FileText size={17} className="shrink-0 text-zinc-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200">{artifact.filename}</p>
                <p className="mt-1 text-[11px] text-zinc-500">{formatBytes(artifact.sizeBytes)} / {new Date(artifact.createdAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => openTablePreview(artifact)}
                title="View JSON table"
                disabled={loadingPreviewId === artifact.id}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-blue-300 disabled:opacity-50"
              >
                <Table2 size={15} />
              </button>
              <a href={`/api/artifacts/${artifact.id}/download`} title="Download" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300">
                <Download size={15} />
              </a>
              <button onClick={() => onDelete(artifact.id)} title="Delete" className="rounded-lg p-2 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </aside>
      {preview && (
        <JsonTableViewer
          title={preview.title}
          content={preview.content}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
