import "./index.css";

const sampleBookmarks = [
  { id: 1, title: "Cloudflare Workers Architecture", summary: "Serverless patterns for edge runtimes." },
  { id: 2, title: "Raindrop Sync Guide", summary: "Best practices for bookmark ingestion." }
];

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Personal Knowledge Pipeline</p>
          <h1 className="text-4xl font-semibold tracking-tight">Bookmarks Dashboard</h1>
          <p className="text-lg text-muted-foreground">
            Search, read, and listen to your saved knowledge with AI summaries and daily podcasts.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-medium">Search library</h2>
              <p className="text-sm text-muted-foreground">Vector search across your archive.</p>
            </div>
            <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
              <input
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Search bookmarks"
              />
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Search
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {sampleBookmarks.map((bookmark) => (
            <article key={bookmark.id} className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">{bookmark.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{bookmark.summary}</p>
              <div className="mt-4 flex items-center gap-3">
                <button className="rounded-md border border-border px-3 py-1 text-sm text-foreground">
                  Read
                </button>
                <button className="rounded-md bg-secondary px-3 py-1 text-sm text-secondary-foreground">
                  Listen
                </button>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Daily Podcast</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Stay updated with AI-generated audio summaries of your latest articles.
          </p>
          <button className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Play latest episode
          </button>
        </section>
      </div>
    </div>
  );
}
