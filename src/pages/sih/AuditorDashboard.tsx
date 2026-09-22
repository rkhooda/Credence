import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { BadgeCheck, Database, Activity, Search, Loader2, Eye, FileText, Shield, Package, Users, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useSihContext } from "@/hooks/use-sih";
import { ensureSepolia, getInjectedProvider, getAssetNFTRO, getIdentityRegistryRO, getCredentialVaultRO, getAuditLogRO } from "@/lib/contract";
import { AddressChip } from "@/components/data/AddressChip";
import { describeError } from "@/lib/issuance";
import { cn } from "@/lib/utils";

interface AssetRecord {
  tokenId: string;
  owner: string;
  assignee: string;
  assetType: number;
  status: number;
  metadataURI: string;
  properties: string;
  createdAt: number;
  updatedAt: number;
}

interface IdentityRecord {
  did: string;
  name: string;
  email: string;
  kycStatus: number;
  isActive: boolean;
  wallets: string[];
}

interface AuditLogRecord {
  eventType: string;
  actor: string;
  subject: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

interface CredentialSummary {
  issuerCount: number;
}

const ASSET_TYPES = [
  { value: "document", label: "Document" },
  { value: "certificate", label: "Certificate" },
  { value: "degree", label: "Degree" },
  { value: "license", label: "License" },
  { value: "artifact", label: "Artifact" },
  { value: "digital_good", label: "Digital Good" },
];

const ASSET_STATUS = [
  { value: 0, label: "Draft", color: "bg-muted text-muted-foreground border-border" },
  { value: 1, label: "Active", color: "bg-success/20 text-success border-success/30" },
  { value: 2, label: "Transferred", color: "bg-blue/20 text-blue border-blue/30" },
  { value: 3, label: "Retired", color: "bg-destructive/20 text-destructive border-destructive/30" },
  { value: 4, label: "Lost", color: "bg-warning/20 text-warning border-warning/30" },
];

export default function AuditorDashboard() {
  const { toast } = useToast();
  const { address } = useWallet(null);
  const { role: sihRole, loading: roleLoading, identity, isConfigured } = useSihContext(null);

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [identities, setIdentities] = useState<IdentityRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assets" | "identities" | "credentials" | "audit">("assets");
  const [search, setSearch] = useState("");

  // Guards
  useEffect(() => {
    if (!roleLoading && isConfigured && !sihRole.isAtLeastAuditor) {
      toast({ title: "Access denied", description: "Only auditors and admins can access this dashboard.", variant: "destructive" });
    }
  }, [sihRole, roleLoading, isConfigured, toast]);

  const loadAll = useCallback(async () => {
    if (!isConfigured || !address) return;

    setLoading(true);
    try {
      const assetNFT = getAssetNFTRO();
      const registry = getIdentityRegistryRO();
      const vault = getCredentialVaultRO();
      const audit = getAuditLogRO();

      // Load all assets
      const totalSupply = await assetNFT.totalSupply();
      const assetList = [];
      for (let i = 0; i < Number(totalSupply); i++) {
        const tokenId = await assetNFT.tokenByIndex(i);
        const [owner, assignee, assetType, status, metadataURI, properties, createdAt, updatedAt] = await Promise.all([
          assetNFT.ownerOf(tokenId),
          assetNFT.assigneeOf(tokenId).catch(() => ethers.ZeroAddress),
          assetNFT.assetTypeOf(tokenId),
          assetNFT.statusOf(tokenId),
          assetNFT.tokenURI(tokenId).catch(() => ""),
          assetNFT.propertiesOf(tokenId).catch(() => "{}"),
          assetNFT.createdAt(tokenId),
          assetNFT.updatedAt(tokenId),
        ]);
        assetList.push({
          tokenId: tokenId.toString(),
          owner,
          assignee,
          assetType: Number(assetType),
          status: Number(status),
          metadataURI,
          properties,
          createdAt: Number(createdAt),
          updatedAt: Number(updatedAt),
        });
      }
      setAssets(assetList.reverse());

      // Load all identities
      const dids = await registry.getAllDIDs();
      const identityList = await Promise.all(
        dids.slice(0, 100).map(async (did: string) => {
          const id = await registry.getIdentity(did);
          return { did, name: id[1], email: id[2], kycStatus: Number(id[3]), isActive: id[4], wallets: id[5] };
        })
      );
      setIdentities(identityList);

      // Load credentials (sample - would need event scanning in production)
      // For now, just show count from contract
      const issuerCount = await vault.getIssuers().then((arr: string[]) => arr.length);
      setCredentials([{ issuerCount }]);

      // Load audit logs
      const logs = await audit.queryEntries({ eventTypes: [], fromBlock: 0, toBlock: 0, limit: 100 });
      setAuditLogs(logs);
    } catch (err) {
      console.error("Failed to load audit data:", err);
      toast({ title: "Load failed", description: describeError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isConfigured, address, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const getStatusLabel = (status: number) => ASSET_STATUS[status]?.label || `Unknown (${status})`;
  const getStatusColor = (status: number) => ASSET_STATUS[status]?.color || "bg-muted text-muted-foreground border-border";
  const getTypeLabel = (type: number) => ASSET_TYPES[type]?.label || `Type ${type}`;

  if (!address) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <BadgeCheck className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
          <p className="mt-2 text-muted-foreground">Connect your auditor wallet to access the audit dashboard.</p>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold">SIH Platform Not Configured</h2>
          <p className="mt-2 text-muted-foreground">Contract addresses not set. Configure VITE_*_ADDRESS environment variables.</p>
        </div>
      </div>
    );
  }

  if (!sihRole.isAtLeastAuditor) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
          <p className="mt-2 text-muted-foreground">Your role: {sihRole.role}. Only auditors and admins can access this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-muted">
            <BadgeCheck className="h-5 w-5 text-amber" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Auditor Dashboard</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <AddressChip address={address} size="sm" />
              {identity && <span>{identity.name}</span>}
              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", "bg-amber/20 text-amber border-amber/30")}>
                Auditor
              </span>
            </div>
          </div>
        </div>

        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh All
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="assets">
            <Package className="h-4 w-4" /> Assets ({assets.length})
          </TabsTrigger>
          <TabsTrigger value="identities">
            <Users className="h-4 w-4" /> Identities ({identities.length})
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <FileText className="h-4 w-4" /> Credentials
          </TabsTrigger>
          <TabsTrigger value="audit">
            <History className="h-4 w-4" /> Audit Log ({auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* Assets */}
        <TabsContent value="assets" className="mt-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assets…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Token ID</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Owner</th>
                    <th className="p-3">Assignee</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : assets.filter(a =>
                    search === "" ||
                    a.tokenId.includes(search) ||
                    a.owner.toLowerCase().includes(search.toLowerCase()) ||
                    (a.assignee && a.assignee.toLowerCase().includes(search.toLowerCase()))
                  ).map((asset) => (
                    <tr key={asset.tokenId} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">#{asset.tokenId}</td>
                      <td className="p-3 text-sm capitalize">{getTypeLabel(asset.assetType)}</td>
                      <td className="p-3">
                        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", getStatusColor(asset.status))}>
                          {getStatusLabel(asset.status)}
                        </span>
                      </td>
                      <td className="p-3"><AddressChip address={asset.owner} size="sm" /></td>
                      <td className="p-3">
                        {asset.assignee && asset.assignee !== ethers.ZeroAddress ? (
                          <AddressChip address={asset.assignee} size="sm" />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(asset.createdAt * 1000).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`https://ipfs.io/ipfs/${asset.metadataURI.replace("ipfs://", "")}`} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Identities */}
        <TabsContent value="identities" className="mt-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search identities…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">DID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">KYC</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Wallets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : identities.filter(i =>
                    search === "" ||
                    i.name?.toLowerCase().includes(search.toLowerCase()) ||
                    i.email?.toLowerCase().includes(search.toLowerCase()) ||
                    i.did?.toLowerCase().includes(search.toLowerCase()) ||
                    i.wallets?.some((w: string) => w.toLowerCase().includes(search.toLowerCase()))
                  ).map((id) => (
                    <tr key={id.did} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{id.did?.slice(0, 16)}…</td>
                      <td className="p-3 text-sm">{id.name || "—"}</td>
                      <td className="p-3 text-sm text-muted-foreground">{id.email || "—"}</td>
                      <td className="p-3">
                        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                          id.kycStatus === 2 ? "bg-success/20 text-success border-success/30" :
                          id.kycStatus === 1 ? "bg-warning/20 text-warning border-warning/30" :
                          "bg-muted text-muted-foreground border-border"
                        )}>
                          {id.kycStatus === 2 ? "Verified" : id.kycStatus === 1 ? "Pending" : "None"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                          id.isActive ? "bg-success/20 text-success border-success/30" : "bg-destructive/20 text-destructive border-destructive/30"
                        )}>
                          {id.isActive ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground font-mono">
                        {id.wallets?.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Credentials */}
        <TabsContent value="credentials" className="mt-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-base font-semibold">Credential Vault Overview</h2>
            <p className="mt-1 text-sm text-muted-foreground">Read-only view of issued credentials across the platform.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Registered Issuers</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums">{credentials[0]?.issuerCount || "—"}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Identities</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums">{identities.length}</dd>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Assets</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums">{assets.length}</dd>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-sm text-muted-foreground">
                Full credential verification requires holder consent (decryption key). Use the public <Button variant="ghost" size="sm" asChild>
                <a href="/verify">Verify</a></Button> page for individual checks.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Audit Logs */}
        <TabsContent value="audit" className="mt-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search audit logs…"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Event</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">Block</th>
                    <th className="p-3">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : auditLogs.filter(l =>
                    search === "" ||
                    l.eventType?.toLowerCase().includes(search.toLowerCase()) ||
                    l.actor?.toLowerCase().includes(search.toLowerCase()) ||
                    l.subject?.toLowerCase().includes(search.toLowerCase()) ||
                    l.transactionHash?.toLowerCase().includes(search.toLowerCase())
                  ).map((log) => (
                    <tr key={log.transactionHash + log.logIndex} className="hover:bg-muted/30">
                      <td className="p-3 text-sm font-medium">{log.eventType}</td>
                      <td className="p-3"><AddressChip address={log.actor} size="sm" /></td>
                      <td className="p-3 text-xs font-mono">{log.subject?.slice(0, 20)}…</td>
                      <td className="p-3 text-xs text-muted-foreground">{log.blockNumber}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`https://sepolia.etherscan.io/tx/${log.transactionHash}`} target="_blank" rel="noopener noreferrer">
                            <Activity className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}