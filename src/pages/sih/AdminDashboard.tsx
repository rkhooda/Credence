import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { Shield, Users, Database, Activity, AlertTriangle, Loader2, Plus, Search, Settings, Key } from "lucide-react";
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
import { ensureSepolia, getInjectedProvider, getRolesAndPermissions, getIdentityRegistry, getRolesAndPermissionsRO, getIdentityRegistryRO } from "@/lib/contract";
import { AddressChip } from "@/components/data/AddressChip";
import { describeError } from "@/lib/issuance";
import { cn } from "@/lib/utils";

interface IdentityRecord {
  did: string;
  name: string;
  email: string;
  kycStatus: number;
  isActive: boolean;
  wallets: string[];
}

interface RolesContract {
  MANAGER_ROLE: () => Promise<string>;
  AUDITOR_ROLE: () => Promise<string>;
  paused: () => Promise<boolean>;
  getRoleMembers: (role: string) => Promise<string[]>;
  getRolePermissions: (role: string) => Promise<boolean[]>;
  Permission?: Record<string, number>;
  hasPermission: (address: string, permission: number) => Promise<boolean>;
  grantPermission: (role: string, permission: number) => Promise<unknown>;
  revokePermission: (role: string, permission: number) => Promise<unknown>;
}

interface SignedRolesContract extends RolesContract {
  grantRole: (role: string, account: string) => Promise<unknown>;
  revokeRole: (role: string, account: string) => Promise<unknown>;
  unpause: () => Promise<unknown>;
  pause: () => Promise<unknown>;
}

const PERMISSIONS = [
  "RoleGrant", "RoleRevoke", "IdentityCreate", "IdentityUpdateMetadata",
  "IdentityVerify", "IdentitySuspend", "IdentityRevoke",
  "AssetMint", "AssetBurn", "AssetAssign", "AssetTransfer",
  "AssetForceTransfer", "AssetUpdateMetadata",
  "DocumentVerify", "DocumentRevoke",
  "SystemPause", "SystemUnpause", "AuditReadAll",
];

export default function AdminDashboard() {
  const { toast } = useToast();
  const { address } = useWallet(null);
  const { role: sihRole, loading: roleLoading, identity, isConfigured } = useSihContext(null);

  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<string[]>([]);
  const [auditors, setAuditors] = useState<string[]>([]);
  const [identities, setIdentities] = useState<IdentityRecord[]>([]);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Permission management
  const [selectedRole, setSelectedRole] = useState<"manager" | "auditor">("manager");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permLoading, setPermLoading] = useState(false);

  // Guard: only admins can access
  useEffect(() => {
    if (!roleLoading && isConfigured && sihRole.role !== "admin") {
      toast({ title: "Access denied", description: "Only platform admins can access this dashboard.", variant: "destructive" });
    }
  }, [sihRole, roleLoading, isConfigured, toast]);

  const load = useCallback(async () => {
    if (!isConfigured || !address) return;

    setLoading(true);
    try {
      const roles = getRolesAndPermissionsRO();
      const registry = getIdentityRegistryRO();

      const [p, managerRole, auditorRole] = await Promise.all([
        roles.paused(),
        (roles as RolesContract).MANAGER_ROLE(),
        (roles as RolesContract).AUDITOR_ROLE(),
      ]);
      const [m, a] = await Promise.all([
        roles.getRoleMembers(managerRole),
        roles.getRoleMembers(auditorRole),
      ]);

      setPaused(p);
      setManagers(m.map((addr: string) => ethers.getAddress(addr)));
      setAuditors(a.map((addr: string) => ethers.getAddress(addr)));

      // Load identities (sample - in production would use pagination)
      const dids = await registry.getAllDIDs();
      const identityList = await Promise.all(
        dids.slice(0, 50).map(async (did: string) => {
          const id = await registry.getIdentity(did);
          return { did, name: id[1], email: id[2], kycStatus: Number(id[3]), isActive: id[4], wallets: id[5] };
        })
      );
      setIdentities(identityList);
    } catch (err) {
      console.error("Failed to load admin data:", err);
      toast({ title: "Load failed", description: describeError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isConfigured, address, toast]);

  useEffect(() => {
    load();
  }, [isConfigured, address, load]);

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

  const togglePause = () => runAction(async (signer) => {
    const roles = getRolesAndPermissions(signer) as SignedRolesContract;
    if (paused) await roles.unpause();
    else await roles.pause();
    toast({ title: paused ? "System unpaused" : "System paused" });
  });

  const grantRole = (roleType: "manager" | "auditor", targetAddress: string) => runAction(async (signer) => {
    const roles = getRolesAndPermissions(signer) as SignedRolesContract;
    const roleHash = roleType === "manager"
      ? await roles.MANAGER_ROLE()
      : await roles.AUDITOR_ROLE();
    await roles.grantRole(roleHash, targetAddress);
    toast({ title: `${roleType} role granted` });
  });

  const revokeRole = (roleType: "manager" | "auditor", targetAddress: string) => runAction(async (signer) => {
    const roles = getRolesAndPermissions(signer) as SignedRolesContract;
    const roleHash = roleType === "manager"
      ? await roles.MANAGER_ROLE()
      : await roles.AUDITOR_ROLE();
    await roles.revokeRole(roleHash, targetAddress);
    toast({ title: `${roleType} role revoked` });
  });

  const loadPermissions = async () => {
    if (!isConfigured) return;
    setPermLoading(true);
    try {
      const roles = getRolesAndPermissionsRO() as RolesContract;
      const roleHash = selectedRole === "manager"
        ? await roles.MANAGER_ROLE()
        : await roles.AUDITOR_ROLE();
      const perms = await roles.getRolePermissions(roleHash);
      const permMap: Record<string, boolean> = {};
      PERMISSIONS.forEach((p, i) => { permMap[p] = perms[i]; });
      setPermissions(permMap);
    } catch (err) {
      toast({ title: "Failed to load permissions", description: describeError(err), variant: "destructive" });
    } finally {
      setPermLoading(false);
    }
  };

  const savePermissions = () => runAction(async (signer) => {
    const roles = getRolesAndPermissions(signer) as SignedRolesContract;
    const roleHash = selectedRole === "manager"
      ? await roles.MANAGER_ROLE()
      : await roles.AUDITOR_ROLE();
    for (const [perm, enabled] of Object.entries(permissions)) {
      const permValue = roles.Permission?.[perm];
      if (permValue !== undefined) {
        if (enabled) await roles.grantPermission(roleHash, permValue);
        else await roles.revokePermission(roleHash, permValue);
      }
    }
    toast({ title: "Permissions updated" });
  });

  const filteredIdentities = identities.filter((id) => {
    const matchesSearch = search === "" ||
      id.name?.toLowerCase().includes(search.toLowerCase()) ||
      id.email?.toLowerCase().includes(search.toLowerCase()) ||
      id.did?.toLowerCase().includes(search.toLowerCase()) ||
      id.wallets?.some((w: string) => w.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = filter === "all" ||
      (filter === "active" && id.isActive) ||
      (filter === "inactive" && !id.isActive) ||
      (filter === "kyc" && id.kycStatus === 2);
    return matchesSearch && matchesFilter;
  });

  const getStatusLabel = (status: number) => {
    const labels = ["None", "Pending", "Active", "Revoked", "Suspended"];
    return labels[status] || `Unknown (${status})`;
  };
  const getStatusColor = (status: number) => {
    const colors = [
      "bg-muted text-muted-foreground border-border",
      "bg-warning/20 text-warning border-warning/30",
      "bg-success/20 text-success border-success/30",
      "bg-destructive/20 text-destructive border-destructive/30",
      "bg-destructive/20 text-destructive border-destructive/30",
    ];
    return colors[status] || "bg-muted text-muted-foreground border-border";
  };

  if (!address) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">Connect Wallet</h2>
          <p className="mt-2 text-muted-foreground">Connect your admin wallet to access the platform administration dashboard.</p>
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

  if (sihRole.role !== "admin") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
          <p className="mt-2 text-muted-foreground">Your role: {sihRole.role}. Only platform admins can access this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-muted">
            <Shield className="h-5 w-5 text-purple" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Platform Administration</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <AddressChip address={address} size="sm" />
              {identity && <span>{identity.name}</span>}
              <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border", "bg-purple/20 text-purple border-purple/30")}>
                Platform Admin
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={paused ? "default" : "outline"} onClick={togglePause} disabled={loading}>
            {paused ? (
              <> <Activity className="h-4 w-4" /> System Paused </ >
            ) : (
              <> <Activity className="h-4 w-4" /> Pause System </ >
            )}
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <Loader2 className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </header>

      <Tabs defaultValue="roles" className="mt-8">
        <TabsList>
          <TabsTrigger value="roles">
            <Users className="h-4 w-4" /> Role Management
          </TabsTrigger>
          <TabsTrigger value="permissions">
            <Key className="h-4 w-4" /> Permissions
          </TabsTrigger>
          <TabsTrigger value="identities">
            <Database className="h-4 w-4" /> Identities
          </TabsTrigger>
        </TabsList>

        {/* Role Management */}
        <TabsContent value="roles" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Managers</h2>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">{managers.length}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Can create identities, mint assets, manage transfers, unpause system.</p>
              <div className="mt-4 space-y-2">
                {managers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No managers assigned.</p>
                ) : (
                  managers.map((addr) => (
                    <div key={addr} className="flex items-center justify-between">
                      <AddressChip address={addr} size="sm" />
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={busyAddress === addr} onClick={() => { setBusyAddress(addr); revokeRole("manager", addr); setBusyAddress(null); }}>
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
                <div className="flex gap-2 pt-2">
                  <Input placeholder="0x…" className="flex-1 font-mono text-xs" id="new-manager" />
                  <Button size="sm" onClick={() => {
                    const input = document.getElementById("new-manager") as HTMLInputElement;
                    if (input?.value) { grantRole("manager", input.value); input.value = ""; }
                  }}>
                    <Plus className="h-4 w-4" /> Grant
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Auditors</h2>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">{auditors.length}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Read-only access to all platform data and audit logs.</p>
              <div className="mt-4 space-y-2">
                {auditors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No auditors assigned.</p>
                ) : (
                  auditors.map((addr) => (
                    <div key={addr} className="flex items-center justify-between">
                      <AddressChip address={addr} size="sm" />
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={busyAddress === addr} onClick={() => { setBusyAddress(addr); revokeRole("auditor", addr); setBusyAddress(null); }}>
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
                <div className="flex gap-2 pt-2">
                  <Input placeholder="0x…" className="flex-1 font-mono text-xs" id="new-auditor" />
                  <Button size="sm" onClick={() => {
                    const input = document.getElementById("new-auditor") as HTMLInputElement;
                    if (input?.value) { grantRole("auditor", input.value); input.value = ""; }
                  }}>
                    <Plus className="h-4 w-4" /> Grant
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </TabsContent>

        {/* Permissions */}
        <TabsContent value="permissions" className="mt-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Permission Matrix</h2>
              <Select value={selectedRole} onValueChange={(v) => { setSelectedRole(v as "manager" | "auditor"); loadPermissions(); }}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="auditor">Auditor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Toggle permissions for the selected role. Changes take effect immediately on-chain.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSIONS.map((perm) => (
                <label key={perm} className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={permissions[perm] ?? false}
                    onChange={(e) => setPermissions((p) => ({ ...p, [perm]: e.target.checked }))}
                    disabled={permLoading}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium capitalize">{perm.replace(/([A-Z])/g, " $1").trim()}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={savePermissions} disabled={permLoading}>
                {permLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <> <Settings className="h-4 w-4" /> Save Permissions </>}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Identities */}
        <TabsContent value="identities" className="mt-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, DID, wallet…"
                  className="pl-9"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="kyc">KYC Verified</SelectItem>
                </SelectContent>
              </Select>
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
                  ) : filteredIdentities.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No identities found</td></tr>
                  ) : (
                    filteredIdentities.map((id) => (
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}