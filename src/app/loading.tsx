export default function RootLoading() {
  return (
    <div className="min-h-[80vh] max-w-5xl mx-auto p-4 sm:p-6 space-y-5 animate-pulse">
      <div className="h-20 rounded-[28px] bg-white/80 border border-zinc-200/70" />
      <div className="h-12 w-64 rounded-full bg-white/70" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-32 rounded-[24px] bg-white/80 border border-zinc-200/70" />
        <div className="h-32 rounded-[24px] bg-white/80 border border-zinc-200/70" />
        <div className="h-32 rounded-[24px] bg-white/80 border border-zinc-200/70" />
        <div className="h-32 rounded-[24px] bg-white/80 border border-zinc-200/70" />
      </div>
    </div>
  );
}
