import { Card, Container, Skeleton } from '../../../components/ui';

export function AppShellLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <Container className="flex min-h-16 items-center justify-between gap-3 py-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-11 w-36 rounded-xl" />
        </Container>
      </header>
      <Container className="grid gap-4 py-4 md:grid-cols-[15rem_1fr] md:py-6">
        <Card className="hidden space-y-2 p-3 md:block">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </Card>
        <main className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </main>
      </Container>
    </div>
  );
}
