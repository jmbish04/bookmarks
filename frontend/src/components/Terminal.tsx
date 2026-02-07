import { useEffect, useRef, useState } from "react";
import { fetchLogs, type SystemLog } from "../lib/api";
import { Terminal as LucideTerminal, Loader2, Minimize2, Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function Terminal({ expanded = false, onClose }: { expanded?: boolean; onClose?: () => void }) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    let interval: number;

    const load = async () => {
      try {
        const data = await fetchLogs();
        setLogs(data.reverse()); 
        setLoading(false);
      } catch (e) {
        console.error(e);
      }
    };

    load(); 
    interval = window.setInterval(load, 2000); 

    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (scrollRef.current && autoScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      // If user is within 50px of bottom, enable auto-scroll. Otherwise disable.
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(atBottom);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`fixed bottom-4 right-4 bg-[#0c0c0c] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 transition-all duration-300 ${
        isExpanded ? "w-[800px] h-[500px]" : "w-[400px] h-[300px]"
      }`}
    >
      {/* Header */}
      <div className="bg-white/5 px-4 py-2 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <LucideTerminal className="w-3 h-3" />
          <span>TERMINAL output --watch</span>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-muted-foreground hover:text-white">
                {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
            {onClose && (
                <button onClick={onClose} className="text-muted-foreground hover:text-red-400">
                    <span className="text-xs">✕</span>
                </button>
            )}
        </div>
      </div>

      {/* Content */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1"
      >
        {loading && logs.length === 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Initializing stream...
            </div>
        )}
        
        <AnimatePresence initial={false}>
            {logs.map((log) => (
            <motion.div 
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex gap-3"
            >
                <span className="text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className={`font-bold ${
                    log.level === "ERROR" ? "text-red-500" :
                    log.level === "WARN" ? "text-yellow-500" :
                    "text-blue-500"
                }`}>
                    [{log.level}]
                </span>
                <span className="text-slate-400 min-w-[100px]">{log.component}:</span>
                <span className="text-slate-300 break-all">{log.message}</span>
            </motion.div>
            ))}
        </AnimatePresence>
        
        {/* Cursor */}
        <div className="flex items-center gap-2 mt-2">
            <span className="text-green-500">➜</span>
            <span className="w-2 h-4 bg-slate-500/50 animate-pulse" />
        </div>
      </div>
    </motion.div>
  );
}
