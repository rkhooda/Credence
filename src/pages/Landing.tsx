import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Database,
  FileSearch,
  Fingerprint,
  KeyRound,
  Network,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHAIN_ID, isSihPlatformConfigured } from "@/lib/contract";
import { chainName } from "@/hooks/use-wallet";

const CAPABILITIES = [
  {
    icon: Fingerprint,
    eyebrow: "01 · Identity",
    title: "A trusted identity registry",
    body: "Map a wallet to a verifiable identity, status and DID. Identity state is resolved from the IdentityRegistry contract.",
  },
  {
    icon: KeyRound,
    eyebrow: "02 · Access control",
    title: "Permissions with accountability",
    body: "Roles determine what each participant can do. Admin, Manager, Auditor and User access is enforced on-chain.",
  },
  {
    icon: Database,
    eyebrow: "03 · Asset registry",
    title: "Every asset has a chain of custody",
    body: "Register certificates, documents, equipment, devices and licenses with ownership, assignment and lifecycle history.",
  },
  {
    icon: Blocks,
    eyebrow: "04 · Audit history",
    title: "Evidence that survives the handoff",
    body: "Transfers, role changes and platform activity remain inspectable through blockchain state and contract events.",
  },
];

const CUSTODY_STEPS = [
  ["Identity", "Who is this wallet?", Fingerprint],
  ["Role", "What may they do?", KeyRound],
  ["Asset", "What is registered?", Database],
  ["Ownership", "Who holds it now?", WalletCards],
  ["Audit", "What changed and when?", ShieldCheck],
] as const;

export default function Landing() {
  const configured = isSihPlatformConfigured();

  return (
    <main>
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20 lg:px-8 lg:py-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Blockchain identity & asset management
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[4.25rem]">
              Identity, access and assets — with a <span className="text-primary">chain of custody.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Credence is a blockchain-backed platform for trusted identities, role-based permissions and owned or
              assigned digital and physical assets.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/sih-portal">
                  Enter platform
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/verify">
                  <FileSearch className="h-4 w-4" aria-hidden="true" />
                  Verify an asset or document
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Protocol model</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">One record, every handoff</h2>
              </div>
              <Network className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-1">
              {CUSTODY_STEPS.map(([label, description, Icon], index) => (
                <div key={label} className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/70">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">0{index + 1}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  {index < CUSTODY_STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-border-strong" aria-hidden="true" />}
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-xs">
              <span className="text-muted-foreground">Network readiness</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-success" : "bg-warning"}`} aria-hidden="true" />
                {configured ? chainName(CHAIN_ID) : "Awaiting contract configuration"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">Platform foundation</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Control the lifecycle, not just the document.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Certificates and documents are supported asset types inside a larger identity and access system. The same
              controls apply to equipment, devices, licenses and other registered resources.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {CAPABILITIES.map(({ icon: Icon, eyebrow, title, body }) => (
              <article key={title} className="bg-card p-6 sm:p-7">
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em]">{eyebrow}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/40">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
          <div className="flex items-start gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-background text-primary">
              <BadgeCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Documents belong in the same chain of custody.</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Preserve the existing encrypted credential flow while connecting a certificate or document to its
                identity, asset record and verifiable history.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/verify">
              Open verification
              <Search className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
