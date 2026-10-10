export function ConfigError({ errors }: { errors: readonly string[] }) {
  return (
    <main className="mx-auto max-w-page px-6 py-8">
      <h1 className="m-0 text-heading font-semibold">VT Alarm Monitor</h1>
      <div role="alert" className="mt-4 rounded-panel border border-warn bg-surface p-4">
        <p className="m-0 text-body-sm font-semibold">The app is misconfigured</p>
        <ul className="mb-0 mt-2 pl-4 text-caption text-fg-secondary">
          {errors.map((e) => (
            <li key={e} className="font-mono">
              {e}
            </li>
          ))}
        </ul>
        <p className="mb-0 mt-3 text-caption text-fg-muted">
          Check frontend/.env against .env.example, then reload.
        </p>
      </div>
    </main>
  );
}
