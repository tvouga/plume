/**
 * Shown when VITE_AZURE_CLIENT_ID isn't set yet. This is the only piece of
 * setup that genuinely needs a human, so we make it friendly and copy-paste-able.
 */
export function SetupNeeded() {
  return (
    <div className="flex min-h-full items-center justify-center bg-paper-soft px-6 py-10">
      <div className="w-full max-w-lg animate-fade-in rounded-2xl bg-paper p-8 shadow-soft">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          One quick setup step
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
          Plume needs a free Microsoft “app registration” so it’s allowed to
          open your mailbox. It takes about 3 minutes and you only do it once.
        </p>

        <ol className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-soft">
          <Step n={1}>
            Go to{' '}
            <a
              className="text-accent underline underline-offset-2"
              href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
              target="_blank"
              rel="noreferrer"
            >
              the App registrations page
            </a>{' '}
            and click <b>New registration</b>.
          </Step>
          <Step n={2}>
            Name it <code className="rounded bg-paper-sunk px-1.5 py-0.5">Plume</code>.
            Under <b>Redirect URI</b>, pick <b>Single-page application (SPA)</b>{' '}
            and paste:
            <code className="mt-1 block break-all rounded bg-paper-sunk px-2 py-1 text-[13px]">
              {window.location.origin}
            </code>
          </Step>
          <Step n={3}>
            Click <b>Register</b>. Copy the{' '}
            <b>Application (client) ID</b> shown on the next page.
          </Step>
          <Step n={4}>
            In the Plume project, copy <code className="rounded bg-paper-sunk px-1.5 py-0.5">.env.example</code>{' '}
            to <code className="rounded bg-paper-sunk px-1.5 py-0.5">.env</code>,
            paste the ID after{' '}
            <code className="rounded bg-paper-sunk px-1.5 py-0.5">VITE_AZURE_CLIENT_ID=</code>,
            then restart the dev server.
          </Step>
        </ol>

        <p className="mt-6 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          That’s the only manual step. After it, just refresh and sign in.
        </p>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}
