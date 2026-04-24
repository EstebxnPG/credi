type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
  bullets: string[];
};

export function ModulePage({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  bullets,
}: ModulePageProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <article className="glass-panel p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-stone-500">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
          {description}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button type="button" className="button-primary">
            {primaryAction}
          </button>
          <button type="button" className="button-muted">
            {secondaryAction}
          </button>
        </div>
      </article>

      <article className="glass-panel p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
          Siguiente conexion
        </p>
        <div className="mt-4 space-y-3">
          {bullets.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-stone-800/10 bg-white/65 px-4 py-4 text-sm text-stone-700"
            >
              {item}
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
