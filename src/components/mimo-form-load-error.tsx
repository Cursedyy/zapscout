export function MimoFormLoadError() {
  return (
    <main className="mimo-app flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="max-w-md space-y-4 rounded-2xl border bg-card p-6">
        <p className="text-2xl font-bold">MiMo. Esse Pode!</p>
        <h1 className="text-xl font-semibold">Não foi possível abrir o formulário</h1>
        <p>
          Confira sua conexão e reabra o link. Se estiver no Instagram ou WhatsApp, use a opção
          Abrir no navegador para continuar no Chrome ou Safari.
        </p>
        <a
          className="block rounded-md bg-primary px-4 py-3 text-center text-primary-foreground"
          href="/influenciadores?reabrir=1"
        >
          Reabrir formulário
        </a>
        <a
          className="block text-center underline"
          href="https://zapscout.lovable.app/influenciadores?campanha=mimo"
        >
          Abrir link alternativo
        </a>
      </section>
    </main>
  );
}