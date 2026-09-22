import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { UserCog, Package, Truck, RotateCcw, Search, Loader2, Plus, Eye, Edit, Trash2, AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useSihContext } from "@/hooks/use-sih";
import { ensureSepolia, getInjectedProvider, getAssetNFT, getAssetNFTRO, getRolesAndPermissionsRO } from "@/lib/contract";
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

const ASSET_TYPES = [
  { value: "document", label: "Document", icon: "📄" },
  { value: "certificate", label: "Certificate", icon: "📜" },
  { value: "degree", label: "Degree", icon: "🎓" },
  { value: "license", label: "License", icon: "🪪" },
  { value: "artifact", label: "Artifact", icon: "🏺" },
  { value: "digital_good", label: "Digital Good", icon: "💾" },
];

const ASSET_STATUS = [
  { value: 0, label: "Draft", color: "bg-muted text-muted-foreground border-border" },
  { value: 1, label: "Active", color: "bg-success/20 text-success border-success/30" },
  { value: 2, label: "Transferred", color: "bg-blue/20 text-blue border-blue/30" },
  { value: 3, label: "Retired", color: "bg-destructive/20 text-destructive border-destructive/30" },
  { value: 4, label: "Lost", color: "bg-warning/20 text-warning border-warning/30" },
];

export default function ManagerDashboard() {
  const { toast } = useToast();
  const { address } = useWallet(null);
  const { role: sihRole, loading: roleLoading, identity, isConfigured } = useSihContext(null);

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Mint form
  const [mintOpen, setMintOpen] = useState(false);
  const [mintForm, setMintForm] = useState({
    assetType: "document",
    name: "",
    description: "",
    metadataURI: "",
    owner: "",
    assignee: "",
    properties: "{}",
  });
  const [mintLoading, setMintLoading] = useState(false);

  // Assign/transfer form
  const [actionOpen, setActionOpen] = useState<{ type: "assign" | "transfer"; tokenId: string } | null>(null);
  const [actionForm, setActionForm] = useState({ to: "" });
  const [actionLoading, setActionLoading] = useState(false);

  // Update metadata
  const [metadataOpen, setMetadataOpen] = useState<string | null>(null);
  const [metadataForm, setMetadataForm] = useState({ metadataURI: "", properties: "{}" });
  const [metadataLoading, setMetadataLoading] = useState(false);

  // Guard: only managers+ can access
  useEffect(() => {
    if (!roleLoading && isConfigured && !sihRole.isAtLeastManager) {
      toast({ title: "Access denied", description: "Only managers and admins can access this dashboard.", variant: "destructive" });
    }
  }, [sihRole, roleLoading, isConfigured, toast]);

  const load = useCallback(async () => {
    if (!isConfigured || !address) return;

    setLoading(true);
    try {
      const assetNFT = getAssetNFTRO();
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
    } catch (err) {
      console.error("Failed to load assets:", err);
      toast({ title: "Load failed", description: describeError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isConfigured, address, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action: (signer: ethers.Signer) => Promise<void>) => {
    try {
      await ensureSepolia();
      const provider = new ethers.BrowserProvider(getInjectedProvider()!);
      const signer = await provider.getSigner();
      await action(signer);
      load();
    } catch (err) {
      toast({ title: "Action failed", description: describeError(err), variant: "destructive" });
    }
  };

  const handleMint = () => runAction(async (signer) => {
    const assetNFT = getAssetNFT(signer);
    const assetTypeIndex = ASSET_TYPES.findIndex(t => t.value === mintForm.assetType);
    const tx = await assetNFT.mint(
      mintForm.owner || address,
      assetTypeIndex,
      mintForm.metadataURI,
      mintForm.properties,
      mintForm.assignee || ethers.ZeroAddress
    );
    await tx.wait();
    toast({ title: "Asset minted", description: `Token ${mintForm.name || "created"}` });
    setMintOpen(false);
    setMintForm({ assetType: "document", name: "", description: "", metadataURI: "", owner: "", assignee: "", properties: "{}" });
  });

  const handleAssign = (tokenId: string) => runAction(async (signer) => {
    const assetNFT = getAssetNFT(signer);
    const tx = await assetNFT.assign(tokenId, actionForm.to);
    await tx.wait();
    toast({ title: "Asset assigned", description: `Assigned to ${actionForm.to}` });
    setActionOpen(null);
    setActionForm({ to: "" });
  });

  const handleTransfer = (tokenId: string) => runAction(async (signer) => {
    const assetNFT = getAssetNFT(signer);
    const tx = await assetNFT.transferFrom(address, actionForm.to, tokenId);
    await tx.wait();
    toast({ title: "Asset transferred", description: `Transferred to ${actionForm.to}` });
    setActionOpen(null);
    setActionForm({ to: "" });
  });

  const handleUpdateStatus = (tokenId: string, newStatus: number) => runAction(async (signer) => {
    const assetNFT = getAssetNFT(signer);
    const tx = await assetNFT.updateStatus(tokenId, newStatus);
    await tx.wait();
    toast({ title: "Status updated", description: `New status: ${ASSET_STATUS[newStatus]?.label || newStatus}` });
  });

  const handleUpdateMetadata = (tokenId: string) => runAction(async (signer) => {
    const assetNFT = getAssetNFT(signer);
    const tx = await assetNFT.updateMetadata(tokenId, metadataForm.metadataURI, metadataForm.properties);
    await tx.wait();
    toast({ title: "Metadata updated" });
    setMetadataOpen(null);
    setMetadataForm({ metadataURI: "", properties: "{}" });
  });

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = search === "" ||
      asset.tokenId.includes(search) ||
      asset.owner.toLowerCase().includes(search.toLowerCase()) ||
      (asset.assignee && asset.assignee.toLowerCase().includes(search.toLowerCase())) ||
      asset.metadataURI.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || ASSET_TYPES[asset.assetType]?.value === filterType;
    const matchesStatus = filterStatus === "all" || asset.status.toString() === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getStatusLabel = (status: number) => ASSET_STATUS[status]?.label || `Unknown (${status})`;
  const getStatusColor = (status: number) => ASSET_STATUS[status]?.color || "bg-muted text-muted-foreground border-border";
  const getTypeLabel = (type: number) => ASSET_TYPES[type]?.label || `Type ${type}`;
  const getTypeIcon = (type: number) => ASSET_TYPES[type]?.icon || "❓";

  if (!address) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <UserCog className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
          <p className="mt-2 text-muted-foreground">Connect your manager wallet to access the asset management dashboard.</p>
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

  if (!sihRole.isAtLeastManager) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
          <p className="mt-2 text-muted-foreground">Your role: {sihRole.role}. Only managers and admins can access this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-muted">
            <UserCog className="h-5 w-5 text-blue" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Asset Management</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <AddressChip address={address} size="sm" />
              {identity && <span>{identity.name}</span>}
              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", "bg-blue/20 text-blue border-blue/30")}>
                Manager
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setMintOpen(true)}>
            <Plus className="h-4 w-4" /> Mint Asset
          </Button>
        </div>
      </header>

      <Tabs defaultValue="assets" className="mt-8">
        <TabsList>
          <TabsTrigger value="assets">
            <Package className="h-4 w-4" /> Assets ({assets.length})
          </TabsTrigger>
          <TabsTrigger value="mint">
            <Plus className="h-4 w-4" /> Mint New
          </TabsTrigger>
        </TabsList>

        {/* Assets List */}
        <TabsContent value="assets" className="mt-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by token ID, owner, assignee, CID…"
                  className="pl-9"
                />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {ASSET_STATUS.map((s) => <SelectItem key={s.value} value={s.value.toString()}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : filteredAssets.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No assets found</td></tr>
                  ) : (
                    filteredAssets.map((asset) => (
                      <tr key={asset.tokenId} className="hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">#{asset.tokenId}</td>
                        <td className="p-3 flex items-center gap-1">
                          <span>{getTypeIcon(asset.assetType)}</span>
                          <span className="text-sm capitalize">{getTypeLabel(asset.assetType)}</span>
                        </td>
                        <td className="p-3">
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", getStatusColor(asset.status))}>
                            {getStatusLabel(asset.status)}
                          </span>
                        </td>
                        <td className="p-3"><AddressChip address={asset.owner} size="sm" /></td>
                        <td className="p-3">
                          {asset.assignee && asset.assignee !== ethers.ZeroAddress ? (
                            <AddressChip address={asset.assignee} size="sm" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(asset.createdAt * 1000).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setActionOpen({ type: "assign", tokenId: asset.tokenId }); setActionForm({ to: "" }); }}>
                              <Truck className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setActionOpen({ type: "transfer", tokenId: asset.tokenId }); setActionForm({ to: "" }); }}>
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setMetadataOpen(asset.tokenId); setMetadataForm({ metadataURI: asset.metadataURI, properties: asset.properties }); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            {asset.status === 1 && (
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleUpdateStatus(asset.tokenId, 3)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Mint Form */}
        <TabsContent value="mint" className="mt-6">
          <div className="rounded-lg border border-border bg-card p-6 max-w-2xl">
            <h2 className="text-base font-semibold">Mint New Asset</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create a new asset on-chain. Only managers and admins can mint.</p>

            <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="assetType">Asset Type</Label>
                <Select value={mintForm.assetType} onValueChange={(v) => setMintForm((f) => ({ ...f, assetType: v }))}>
                  <SelectTrigger id="assetType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={mintForm.name}
                  onChange={(e) => setMintForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bachelor of Computer Science Certificate"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={mintForm.description}
                  onChange={(e) => setMintForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <Label htmlFor="metadataURI">Metadata URI (IPFS CID)</Label>
                <Input
                  id="metadataURI"
                  value={mintForm.metadataURI}
                  onChange={(e) => setMintForm((f) => ({ ...f, metadataURI: e.target.value }))}
                  placeholder="ipfs://Qm..."
                />
              </div>

              <div>
                <Label htmlFor="properties">Properties (JSON)</Label>
                <Textarea
                  id="properties"
                  value={mintForm.properties}
                  onChange={(e) => setMintForm((f) => ({ ...f, properties: e.target.value }))}
                  rows={3}
                  placeholder='{"key": "value"}'
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <Label htmlFor="owner">Owner Address</Label>
                <Input
                  id="owner"
                  value={mintForm.owner}
                  onChange={(e) => setMintForm((f) => ({ ...f, owner: e.target.value }))}
                  placeholder={address}
                  className="font-mono text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">Defaults to your address if left blank.</p>
              </div>

              <div>
                <Label htmlFor="assignee">Assignee Address (optional)</Label>
                <Input
                  id="assignee"
                  value={mintForm.assignee}
                  onChange={(e) => setMintForm((f) => ({ ...f, assignee: e.target.value }))}
                  placeholder="0x…"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMintOpen(false)}>Cancel</Button>
              <Button onClick={handleMint} disabled={mintLoading || !mintForm.name || !mintForm.metadataURI}>
                {mintLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mint Asset"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Assign/Transfer Dialog */}
      {actionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border bg-card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold">
              {actionOpen.type === "assign" ? "Assign Asset" : "Transfer Asset"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Token #{actionOpen.tokenId} — enter recipient address
            </p>
            <div className="mt-4">
              <Label htmlFor="action-to">Recipient Address</Label>
              <Input
                id="action-to"
                value={actionForm.to}
                onChange={(e) => setActionForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="0x…"
                className="mt-1.5 font-mono text-xs"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionOpen(null)}>Cancel</Button>
              <Button onClick={() => actionOpen.type === "assign" ? handleAssign(actionOpen.tokenId) : handleTransfer(actionOpen.tokenId)} disabled={actionLoading || !actionForm.to}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionOpen.type === "assign" ? "Assign" : "Transfer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Update Metadata Dialog */}
      {metadataOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-border bg-card p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold">Update Metadata</h2>
            <p className="mt-1 text-sm text-muted-foreground">Token #{metadataOpen}</p>
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="meta-uri">Metadata URI (IPFS CID)</Label>
                <Input
                  id="meta-uri"
                  value={metadataForm.metadataURI}
                  onChange={(e) => setMetadataForm((f) => ({ ...f, metadataURI: e.target.value }))}
                  placeholder="ipfs://Qm..."
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="meta-props">Properties (JSON)</Label>
                <Textarea
                  id="meta-props"
                  value={metadataForm.properties}
                  onChange={(e) => setMetadataForm((f) => ({ ...f, properties: e.target.value }))}
                  rows={3}
                  placeholder='{"key": "value"}'
                  className="mt-1.5 font-mono text-xs"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMetadataOpen(null)}>Cancel</Button>
              <Button onClick={() => handleUpdateMetadata(metadataOpen)} disabled={metadataLoading}>
                {metadataLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}