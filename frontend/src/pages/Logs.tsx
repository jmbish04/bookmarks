import { useEffect, useState } from "react";
import { fetchLogs, type SystemLog } from "../lib/api";
import { Loader2, RefreshCw, AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { motion } from "framer-motion";

export function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogs();
      setLogs(data);
    } catch (err) {
      setError("Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const getIcon = (level: string) => {
    switch (level) {
      case "INFO": return <Info className="w-4 h-4 text-blue-400" />;
      case "WARN": return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case "ERROR": return <AlertOctagon className="w-4 h-4 text-red-400" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">System Logs</h2>
        <button 
          onClick={loadLogs} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200">
          {error}
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl overflow-hidden glass-panel">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="p-4 font-medium text-muted-foreground w-20">Level</th>
                <th className="p-4 font-medium text-muted-foreground w-32">Component</th>
                <th className="p-4 font-medium text-muted-foreground">Message</th>
                <th className="p-4 font-medium text-muted-foreground w-48">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading logs...
                  </td>
                </tr>
              ) : logs.map((log) => (
                <motion.tr 
                  key={log.id} 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {getIcon(log.level)}
                      <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-white/5 ${
                        log.level === 'ERROR' ? 'text-red-400' : 
                        log.level === 'WARN' ? 'text-yellow-400' : 'text-blue-400'
                      }`}>
                        {log.level}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">{log.component}</td>
                  <td className="p-4">
                    <div className="font-medium">{log.message}</div>
                    {log.metadata && (
                      <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto max-w-lg">
                        {log.metadata}
                      </pre>
                    )}
                  </td>
                  <td className="p-4 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </motion.tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
