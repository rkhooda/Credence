import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { LayoutDashboard, Package, User, Shield, Search, Loader2, FileText, Key, Download, ExternalLink, History, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ensureSepolia, getInjectedProvider, getAssetNFTRO, getIdentityRegistryRO, getCredentialVaultRO, getCredentialAssetBridgeRO } from "@/lib/contract";
import { AddressChip } from "@/components/data/AddressChip";
import { HashDisplay } from "@/components/data/HashDisplay";
import { describeError } from "@/lib/issuance";
import { cn } from "@/lib/utils";
import { fetchCredentialsForHolder, CredentialMetadata } from "@/lib/credentials";

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

interface CredentialRecord {
  documentHash: string;
  holder: string;
  issuer: string;
  issuerName: string;
  status: number;
  isValid: boolean;
  isExpired: boolean;
  issuedAt: Date;
  expiresAt: Date | null;
  metadataURI: string;
  metadata: CredentialMetadata | null;
  transactionHash: string;
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

export default function UserDashboard() {
  const { toast } = useToast();
  const { address } = useWallet(null);
  const { role: sihRole, loading: roleLoading, identity, isConfigured } = useSihContext(null);

  const [ownedAssets, setOwnedAssets] = useState<AssetRecord[]>([]);
  const [assignedAssets, setAssignedAssets] = useState<AssetRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assets" | "credentials" | "identity">("assets");
  const [search, setSearch] = useState("");

  // Guards
  useEffect(() => {
    if (!roleLoading && isConfigured && sihRole.role === "unregistered") {
      toast({ title: "No identity found", description: "Your wallet has no registered identity. Contact an admin to register.", variant: "destructive" });
    }
  }, [sihRole, roleLoading, isConfigured, toast]);

  const loadAll = useCallback(async () => {
    if (!isConfigured || !address) return;

    setLoading(true);
    try {
      const assetNFT = getAssetNFTRO();
      const registry = getIdentityRegistryRO();
      const vault = getCredentialVaultRO();

      // Load assets owned by this address
      const totalSupply = await assetNFT.totalSupply();
      const owned: AssetRecord[] = [];
      const assigned: AssetRecord[] = [];

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

        const asset = {
          tokenId: tokenId.toString(),
          owner,
          assignee,
          assetType: Number(assetType),
          status: Number(status),
          metadataURI,
          properties,
          createdAt: Number(createdAt),
          updatedAt: Number(updatedAt),
        };

        if (owner.toLowerCase() === address.toLowerCase()) owned.push(asset);
        if (assignee.toLowerCase() === address.toLowerCase()) assigned.push(asset);
      }

      setOwnedAssets(owned.reverse());
      setAssignedAssets(assigned.reverse());

      // Load credentials issued to this address
      try {
        const creds = await fetchCredentialsForHolder(address);
        setCredentials(creds);
      } catch (err) {
        console.warn("Could not load credentials:", err);
      }
    } catch (err) {
      console.error("Failed to load user data:", err);
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
          <LayoutDashboard className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
          <p className="mt-2 text-muted-foreground">Connect your wallet to view your identity, assets, and credentials.</p>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold">SIH Platform Not Configured</h2>
          <p className="mt-2 text-muted-foreground">Contract addresses not set. Configure VITE_*_ADDRESS environment variables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-muted">
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Your Dashboard</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <AddressChip address={address} size="sm" />
              {identity && (
                <>
                  <span>{identity.name}</span>
                  <span>•</span>
                  <span>{identity.email}</span>
                </>
              )}
              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                sihRole.role === "admin" ? "bg-purple/20 text-purple border-purple/30" :
                sihRole.role === "manager" ? "bg-blue/20 text-blue border-blue/30" :
                sihRole.role === "auditor" ? "bg-amber/20 text-amber border-amber/30" :
                "bg-muted text-muted-foreground border-border"
              )}>
                {sihRole.role === "user" ? "User" : sihRole.role.charAt(0).toUpperCase() + sihRole.role.slice(1)}
              </span>
            </div>
          </div>
        </div>

        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="assets">
            <Package className="h-4 w-4" /> My Assets ({ownedAssets.length + assignedAssets.length})
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <FileText className="h-4 w-4" /> Credentials ({credentials.length})
          </TabsTrigger>
          <TabsTrigger value="identity">
            <User className="h-4 w-4" /> Identity
          </TabsTrigger>
        </TabsList>

        {/* Assets */}
        <TabsContent value="assets" className="mt-6">
          <div className="space-y-6">
            {/* Owned Assets */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Owned Assets ({ownedAssets.length})
                </h2>
                <div className="relative max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search owned assets…"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="p-3">Token ID</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Assignee</th>
                      <th className="p-3">Created</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                    ) : ownedAssets.filter(a =>
                      search === "" ||
                      a.tokenId.includes(search) ||
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
                        <td className="p-3">
                          {asset.assignee && asset.assignee !== ethers.ZeroAddress ? (
                            <AddressChip address={asset.assignee} size="sm" />
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(asset.createdAt * 1000).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" asChild>
                              <a href={`https://ipfs.io/ipfs/${asset.metadataURI.replace("ipfs://", "")}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            </section>

            {/* Assigned Assets */}
            <section>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
                <User className="h-4 w-4" /> Assigned to Me ({assignedAssets.length})
              </h2>
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="p-3">Token ID</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Owner</th>
                      <th className="p-3">Created</th>
                      <th className="p-3">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assignedAssets.filter(a =>
                      search === "" ||
                      a.tokenId.includes(search) ||
                      a.owner.toLowerCase().includes(search.toLowerCase())
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
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(asset.createdAt * 1000).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <Button variant="ghost" size="icon" asChild>
                            <a href={`https://ipfs.io/ipfs/${asset.metadataURI.replace("ipfs://", "")}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            </section>
          </div>
        </TabsContent>

        {/* Credentials */}
        <TabsContent value="credentials" className="mt-6">
          <div className="space-y-4">
            {loading ? (
              <div className="text-center text-muted-foreground py-8">Loading credentials…</div>
            ) : credentials.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">No credentials yet</h3>
                <p className="mt-2 text-muted-foreground">Credentials issued to this wallet will appear here.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {credentials.map((cred) => (
                  <div key={cred.documentHash} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{cred.metadata?.title || "Encrypted credential"}</h3>
                        <p className="text-sm text-muted-foreground capitalize">{cred.metadata?.type || "credential"}</p>
                      </div>
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                        cred.status === 2 ? "bg-success/20 text-success border-success/30" :
                        cred.status === 1 ? "bg-warning/20 text-warning border-warning/30" :
                        cred.status === 3 ? "bg-destructive/20 text-destructive border-destructive/30" :
                        "bg-muted text-muted-foreground border-border"
                      )}>
                        {cred.status === 2 ? "Verified" : cred.status === 1 ? "Pending" : cred.status === 3 ? "Revoked" : "Declined"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <AddressChip address={cred.issuer} size="sm" showCopy={false} />
                        <span>{cred.issuerName}</span>
                      </div>
                      <HashDisplay value={cred.documentHash} lead={10} tail={8} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      {cred.status === 1 && (
                        <>
                          <Button variant="outline" size="sm" className="flex-1">Accept</Button>
                          <Button variant="ghost" size="sm" className="text-destructive">Decline</Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <a href={`https://ipfs.io/ipfs/${cred.metadataURI.replace("ipfs://", "")}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          View
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Identity */}
        <TabsContent value="identity" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <User className="h-4 w-4" /> Your Identity
              </h2>
              {identity ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-lg border border-border bg-muted">
                      <User className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{identity.name || "Unnamed"}</h3>
                      <p className="text-sm text-muted-foreground">{identity.email || "No email"}</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-4 border-t border-border">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">DID</dt>
                        <dd className="mt-1 font-mono text-sm break-all">{identity.did}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">KYC Status</dt>
                        <dd className="mt-1">
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                            identity.kycStatus === 2 ? "bg-success/20 text-success border-success/30" :
                            identity.kycStatus === 1 ? "bg-warning/20 text-warning border-warning/30" :
                            "bg-muted text-muted-foreground border-border"
                          )}>
                            {identity.kycStatus === 2 ? "Verified" : identity.kycStatus === 1 ? "Pending" : "Not Started"}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Account Status</dt>
                        <dd className="mt-1">
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                            identity.isActive ? "bg-success/20 text-success border-success/30" : "bg-destructive/20 text-destructive border-destructive/30"
                          )}>
                            {identity.isActive ? "Active" : "Suspended"}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                        <dd className="mt-1 font-medium capitalize">{sihRole.role}</dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Linked Wallets</dt>
                      <dd className="mt-1 flex flex-wrap gap-2">
                        {identity.wallets?.map((w: string, i: number) => (
                          <AddressChip key={i} address={w} size="sm" showCopy={false} />
                        ))}
                      </dd>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-center text-muted-foreground">
                  <User className="mx-auto h-12 w-12" />
                  <p className="mt-2">No identity registered for this wallet.</p>
                  <p className="text-sm">Contact a platform admin to create your identity.</p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <History className="h-4 w-4" /> Activity Summary
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Owned Assets</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">{ownedAssets.length}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Assigned Assets</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">{assignedAssets.length}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Credentials</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">{credentials.length}</dd>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active Credentials</dt>
                  <dd className="mt-1 text-3xl font-semibold tabular-nums">
                    {credentials.filter(c => c.status === 2).length}
                  </dd>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}