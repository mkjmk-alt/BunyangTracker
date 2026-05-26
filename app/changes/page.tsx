export const dynamic = "force-dynamic";

export default function ChangesPage() {
  return (
    <main className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">변경 이력</h1>
          <p className="text-muted-foreground">실시간으로 감지된 모든 변경 사항입니다.</p>
        </div>
        
        <div className="rounded-xl border bg-card p-12 text-center subtle-shadow">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-accent p-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
            </div>
          </div>
          <h3 className="text-lg font-bold">변경 이력 데이터 없음</h3>
          <p className="text-muted-foreground">수집이 시작되면 여기에 변경 사항이 표시됩니다.</p>
        </div>
      </div>
    </main>
  );
}
