import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  AudioWaveform, 
  BookOpen, 
  Search, 
  Plus, 
  Settings, 
  Library,
  Headphones,
  ExternalLink,
  RefreshCw,
  Activity
} from "lucide-react";
import { LogsPage } from "./pages/Logs";
import { fetchBookmarks, type Bookmark, triggerSync, fetchAuthStatus } from "./lib/api";
import { Terminal } from "./components/Terminal";
import "./index.css";

// --- Components ---

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="glass-panel p-6 rounded-2xl flex items-center justify-between"
    >
      <div>
        <p className="text-sm text-muted-foreground font-medium mb-1">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </div>
      <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
    </motion.div>
  );
}

function SearchBar() {
  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center gap-2 bg-muted/40 border border-white/5 rounded-full px-4 py-3 shadow-inner focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <Search className="w-5 h-5 text-muted-foreground" />
        <input 
          type="text"
          placeholder="Ask your library..."
          className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center gap-1.5 px-2">
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted font-mono text-[10px] font-medium text-muted-foreground px-1.5">
            ⌘ K
          </kbd>
        </div>
      </div>
    </div>
  );
}

function PodcastPlayer() {
  return (
    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-50">
        <AudioWaveform className="w-24 h-24 text-primary/10" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h3 className="text-sm font-medium tracking-wide text-primary">DAILY DIGEST</h3>
        </div>
        
        <h2 className="text-xl font-semibold mb-2">Morning Briefing</h2>
        <p className="text-muted-foreground text-sm mb-6 max-w-[80%]">
          Your AI-curated summary of "Cloudflare Workers" and 5 other articles.
        </p>
        
        <div className="flex items-center gap-4">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            className="bg-primary text-primary-foreground hover:bg-white hover:text-black px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Headphones className="w-4 h-4" />
            Play Episode
          </motion.button>
          <span className="text-xs font-mono text-muted-foreground">12:45</span>
        </div>
      </div>
    </div>
  );
}

function BookmarkCard({ bookmark, onSync }: { bookmark: Bookmark, onSync?: () => void }) {
  return (
    <motion.article 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-5 rounded-xl group hover:border-primary/20 transition-colors"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex gap-2">
          {bookmark.tags?.map(tag => (
            <span key={tag} className="text-[10px] uppercase tracking-wider font-semibold text-primary/80 bg-primary/10 px-2 py-1 rounded-md">
              {tag}
            </span>
          ))}
        </div>
        <a href={bookmark.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      
      <h3 className="text-lg font-semibold leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
        {bookmark.title || bookmark.url}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
        {bookmark.summary}
      </p>
      
      <div className="flex items-center gap-3 pt-4 border-t border-white/5">
        <button className="text-xs font-medium flex items-center gap-1.5 hover:text-primary transition-colors">
          <BookOpen className="w-3 h-3" />
          Read
        </button>
        {onSync && (
            <button onClick={onSync} className="text-xs font-medium flex items-center gap-1.5 hover:text-primary transition-colors">
              <RefreshCw className="w-3 h-3" />
              Re-sync
            </button>
        )}
      </div>
    </motion.article>
  );
}

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState("library");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean; systemConfigured: boolean } | null>(null);
  
  // Real-time Sync State
  const [showTerminal, setShowTerminal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Initial data load
    const loadData = async () => {
      try {
        const [items, status] = await Promise.all([
          fetchBookmarks().catch(err => {
            console.error("Bookmark fetch failed", err);
            return [];
          }),
          fetchAuthStatus().catch(err => {
            console.error("Auth status check failed", err);
            return null;
          })
        ]);
        setBookmarks(items);
        setAuthStatus(status);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeTab]);

  const handleSync = async () => {
      if (isSyncing) return;
     
      setIsSyncing(true);
      setShowTerminal(true); // Open terminal to show progress
      try {
          await triggerSync(); 
          
          // Poll list a few times or wait for a delay
          setTimeout(async () => {
              try {
                  const items = await fetchBookmarks();
                  setBookmarks(items);
              } catch(e) { console.error(e) }
              setIsSyncing(false);
          }, 3000); 
          
      } catch (e) {
          console.error(e);
          setIsSyncing(false);
      }
  };

  const isConnected = authStatus?.authenticated || authStatus?.systemConfigured;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8 flex gap-8">
        
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 h-[calc(100vh-4rem)] sticky top-8">
          <div className="mb-10 flex items-center gap-3 px-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Library className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Bookmarks</span>
          </div>

          <nav className="space-y-1.5 flex-1">
            {[ 
              { id: "library", icon: BookOpen, label: "Library" },
              { id: "podcasts", icon: Headphones, label: "Podcasts" },
              { id: "logs", icon: Activity, label: "System Logs" },
              { id: "settings", icon: Settings, label: "Settings" }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === item.id 
                    ? "bg-white/10 text-primary shadow-sm ring-1 ring-white/10" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto">
            <button className="w-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" />
              Add Resource
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 pb-12">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight mb-1">
                {activeTab === "logs" ? "System Diagnostics" : "Good Afternoon"}
              </h1>
              <p className="text-muted-foreground">
                 {activeTab === "logs" ? "Monitor real-time system operations." : "Here's what's happening in your library."}
              </p>
            </div>
            <div className="flex items-center gap-4">
               <button 
                onClick={handleSync}
                disabled={isSyncing}
                className={`h-9 px-4 rounded-full border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors gap-2 text-sm font-medium ${isSyncing ? "opacity-50 cursor-not-allowed" : ""}`}
                title="Sync Now"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </button>
              
              <button 
                 onClick={() => setShowTerminal(!showTerminal)}
                 className={`h-9 w-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors ${showTerminal ? "bg-white/10 text-white" : "bg-white/5 text-muted-foreground"}`}
                 title="Toggle Terminal"
              >
                  <Activity className="w-4 h-4" />
              </button>
              <div className="flex -space-x-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 w-8 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-xs font-medium">
                    {i}
                  </div>
                ))}
              </div>
            </div>
          </header>

          {/* Terminal Overlay */}
          {showTerminal && (
              <Terminal onClose={() => setShowTerminal(false)} />
          )}

          {activeTab === "logs" ? (
            <LogsPage />
          ) : (
            <div className="space-y-8">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard label="Total Saved" value={String(bookmarks.length)} icon={Library} />
                <MetricCard label="Unread" value="-" icon={BookOpen} />
                <MetricCard label="Podcasts" value="-" icon={Headphones} />
              </div>

              {/* Search */}
              <SearchBar />

              {/* Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: List */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Recent Saves</h2>
                    <button className="text-sm text-primary hover:underline">View all</button>
                  </div>
                  
                  {loading ? (
                    <div className="text-center py-10 text-muted-foreground">Loading bookmarks...</div>
                  ) : (
                    <div className="space-y-4">
                      {bookmarks.map(bm => (
                        <BookmarkCard key={bm.id} bookmark={bm} onSync={handleSync} />
                      ))}
                      {bookmarks.length === 0 && (
                          <div className="p-8 border border-dashed border-white/10 rounded-xl text-center text-muted-foreground">
                              {isConnected ? "Syncing library..." : "Connect Raindrop to start syncing."}
                          </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Widgets */}
                <div className="space-y-6">
                  <PodcastPlayer />
                  
                  <div className="glass-panel p-6 rounded-2xl">
                    <h3 className="font-semibold mb-4">Sync Status</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Raindrop.io</span>
                        {isConnected ? (
                          <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                            <div className="h-1.5 w-1.5 rounded-full bg-current" />
                            Connected
                          </span>
                        ) : (
                          <a 
                            href="https://app.raindrop.io/settings/integrations"
                            target="_blank"
                            rel="noreferrer"
                            className="bg-primary hover:bg-white hover:text-black text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            Configure Token
                          </a>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Last Sync</span>
                        <span>{authStatus?.systemConfigured ? "System Managed" : "-"}</span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full bg-primary rounded-full transition-all duration-1000 ${isConnected ? "w-[100%]" : "w-[0%]"}`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
