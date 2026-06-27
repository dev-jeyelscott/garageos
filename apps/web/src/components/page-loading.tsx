import { Card, Container } from './ui';

export function PageLoading({ label = 'Loading page...' }: { readonly label?: string }) {
  return (
    <main className="min-h-dvh bg-background py-10 text-foreground">
      <Container className="max-w-3xl">
        <Card className="p-6">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </Card>
      </Container>
    </main>
  );
}
