export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      <p className="muted">Этот раздел появится в следующих версиях.</p>
    </section>
  );
}
