import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, ExternalLink, Loader2, Shield, UserCog, BadgeCheck, LayoutDashboard, ShieldAlert } from "lucide-react";
import metaMaskLogo from "@/assets/MetaMask-logo.png";
import { LogoMark } from "@/components/Logo";
import { AddressChip } from "@/components/data/AddressChip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { WALLET_STORAGE_KEY, chainName, useWallet, type WalletRole } from "@/hooks/use-wallet";
import { CHAIN_ID, ensureSepolia, getInjectedProvider, isSihPlatformConfigured } from "@/lib/contract";
import { describeError } from "@/lib/issuance";
import { resolveSihContext, roleLabel, roleColorClasses } from "@/lib/sih";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

const SIH_ROLES = {
  admin: {
    title: "Platform Admin",
    lede: "Manage the entire platform: configure roles, pause the system, view all audit logs, and oversee platform health.",
    icon: Shield,
    dashboard: "/admin",
    color: "text-purple border-purple/30 bg-purple/10",
  },
  manager: {
    title: "Asset Manager",
    lede: "Create and manage digital assets, assign ownership, transfer assets, and oversee the asset lifecycle.",
    icon: UserCog,
    dashboard: "/manager",
    color: "text-blue border-blue/30 bg-blue/10",
  },
  auditor: {
    title: "Auditor",
    lede: "Read-only access to all platform data: view identities, assets, credentials, and complete audit history.",
    icon: BadgeCheck,
    dashboard: "/auditor",
    color: "text-amber border-amber/30 bg-amber/10",
  },
  user: {
    title: "User",
    lede: "View your identity, manage your assets, verify credentials, and track your transaction history.",
    icon: LayoutDashboard,
    dashboard: "/user",
    color: "text-muted border-border bg-muted",
  },
} as const;

type Phase = "idle" | "connecting" | "resolving" | "switching";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  connecting: "Check your wallet…",
  resolving: "Resolving identity & role…",
  switching: "Confirm the network switch…",
};

export default function SihPortalConnect() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { address, chainId } = useWallet("sih");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(true);
  const [resolvedRole, setResolvedRole] = useState<keyof typeof SIH_ROLES | null>(null);

  useEffect(() => setHasWallet(Boolean(getInjectedProvider())), []);

  const connect = async () => {
    setError(null);

    const ethereum = getInjectedProvider();
    if (!ethereum) {
      setHasWallet(false);
      setError("No Ethereum wallet detected in this browser.");
      return;
    }

    try {
      setPhase("connecting");
      let nextRole: keyof typeof SIH_ROLES = "user";

      await ethereum.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
      const account = accounts?.[0];
      if (!account) return;

      // Resolve SIH context (identity + role from blockchain)
      setPhase("resolving");
      try {
        const { role } = await resolveSihContext(account);
        if (role.role === "unregistered" || role.role === "user") {
          // User has no special role, but can still access user dashboard
          nextRole = "user";
        } else {
          nextRole = role.role;
        }
        setResolvedRole(nextRole);
        setPhase("switching");
        await ensureSepolia();
      } catch (err) {
        console.warn("Could not resolve SIH context:", err);
        setError("Could not reach Sepolia to resolve identity and role. Check your connection and try again.");
        return;
      }

      localStorage.setItem(WALLET_STORAGE_KEY.sih, account);

      navigate(SIH_ROLES[nextRole].dashboard);
    } catch (err) {
      const message = describeError(err);
      if (message === "Rejected in wallet.") {
        setError("Connection cancelled. Approve the request in your wallet to continue.");
      } else {
        setError(message);
        toast({ title: "Could not connect", description: message, variant: "destructive" });
      }
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  if (!isSihPlatformConfigured()) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md border border-border bg-muted">
            <Shield className="h-4.5 w-4.5 text-foreground" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Credence</h1>
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <h3 className="font-medium text-destructive">Platform Not Configured</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The SIH platform contracts are not deployed or configured. Set the contract addresses in your environment variables
                (VITE_ROLES_AND_PERMISSIONS_ADDRESS, VITE_IDENTITY_REGISTRY_ADDRESS, etc.) to enable the platform.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Public verification remains available from the main navigation. Platform access will be enabled after the six SIH contracts are configured.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-lg flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-md border border-border bg-muted">
          <Shield className="h-4.5 w-4.5 text-foreground" aria-hidden="true" />
        </span>
          <h1 className="text-xl font-semibold tracking-tight">Platform access</h1>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Connect your wallet to resolve your on-chain identity and role. Credence routes you to the workspace your
        blockchain permissions allow — no manual role selection is needed.
      </p>

      {resolvedRole && (() => {
        const config = SIH_ROLES[resolvedRole];
        const Icon = config.icon;
        const colorParts = config.color.split(" ");
        return (
          <div className="mt-4 rounded-lg border p-4" style={{ borderColor: colorParts[1] }}>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: colorParts[2] }}>
                <Icon className="h-4 w-4" style={{ color: colorParts[0] }} aria-hidden="true" />
              </span>
              <div>
                <div className="font-medium" style={{ color: colorParts[0] }}>
                  {config.title} detected
                </div>
                <div className="text-xs text-muted-foreground">Your dashboard: {config.dashboard}</div>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="mt-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-center gap-5">
          <div className="flex flex-col items-center gap-2">
            <span className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-background">
              <LogoMark className="h-6 w-6" />
            </span>
            <span className="text-[11px] text-muted-foreground">Credence</span>
          </div>

          <span className="mb-6 h-px w-10 bg-border-strong" aria-hidden="true" />

          <div className="flex flex-col items-center gap-2">
            <span className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-background">
              <img src={metaMaskLogo} alt="" className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="text-[11px] text-muted-foreground">MetaMask</span>
          </div>
        </div>

        <div className="rule-engraved my-6" />

        {address ? (
          <div>
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              <span className="font-medium">Wallet connected</span>
            </div>
            <div className="mt-3 rounded-md border border-border bg-muted/60 px-3 py-2.5">
              <AddressChip address={address} size="sm" />
            </div>
            {resolvedRole && (
              <div className="mt-3 flex items-center gap-2">
                <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", roleColorClasses(resolvedRole))}>
                  {SIH_ROLES[resolvedRole].title}
                </span>
              </div>
            )}
            <Button className="mt-4 w-full" onClick={() => navigate(resolvedRole ? SIH_ROLES[resolvedRole].dashboard : "/user")}>
              Continue to dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={connect} disabled={busy}>
              Use a different wallet
            </Button>
          </div>
        ) : hasWallet ? (
          <Button className="w-full" size="lg" onClick={connect} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {PHASE_LABEL[phase as Exclude<Phase, "idle">]}
              </>
            ) : (
              <>
                <img src={metaMaskLogo} alt="" className="h-4 w-4" aria-hidden="true" />
                Connect wallet
              </>
            )}
          </Button>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground">
              This portal needs a browser wallet. MetaMask is the supported browser wallet for this deployment.
            </p>
            <Button asChild className="mt-4 w-full">
              <a href={METAMASK_INSTALL_URL} target="_blank" rel="noopener noreferrer">
                Install MetaMask
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-foreground/80">{error}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>Requires</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 font-medium text-foreground">
            {chainName(CHAIN_ID)}
          </span>
          {chainId !== null && chainId !== CHAIN_ID && (
            <span className="text-destructive">· wallet is on {chainName(chainId)}, it will be asked to switch</span>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(SIH_ROLES).map(([key, config]) => {
          const Icon = config.icon;
          const isActive = resolvedRole === key;
          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border p-4 transition-all",
                isActive
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ backgroundColor: config.color.split(" ")[2] }}>
                  <Icon className="h-4 w-4" style={{ color: config.color.split(" ")[0] }} aria-hidden="true" />
                </span>
                <span className="font-medium" style={{ color: config.color.split(" ")[0] }}>{config.title}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{config.lede}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
