import { useEffect, useState, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { Shield, Users, Database, Activity, AlertTriangle, Loader2, Plus, Search, Settings, Key, Eye, X, CheckCircle, PauseCircle, RotateCcw, Trash2, UserPlus, FileText, History, Filter, ChevronDown, ChevronUp } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";
import { useSihContext } from "@/hooks/use-sih";
import { ensureSepolia, getInjectedProvider, getRolesAndPermissions, getIdentityRegistry, getRolesAndPermissionsRO, getIdentityRegistryRO, getAuditLogRO, isSihPlatformConfigured } from "@/lib/contract";
import { AddressChip } from "@/components/data/AddressChip";
import { describeError } from "@/lib/issuance";
import { cn } from "@/lib/utils";

interface IdentityRecord {
  did: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  kycStatus: number;
  isActive: boolean;
  wallets: string[];
  primaryWallet: string;
  createdAt: number;
  verifiedAt: number;
  revokedAt: number;
  metadataURI: string;
  status: "Created" | "Verified" | "Revoked" | "Suspended";
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

interface IdentityRegistryContract {
  IDENTITY_MANAGER_ROLE: () => Promise<string>;
  hasRole: (role: string, account: string) => Promise<boolean>;
  grantRole: (role: string, account: string) => Promise<unknown>;
  createIdentity: (did: string, primaryWallet: string, name: string, organization: string, role: string, metadataURI: string) => Promise<unknown>;
  verifyIdentity: (did: string) => Promise<unknown>;
  suspendIdentity: (did: string) => Promise<unknown>;
  reinstateIdentity: (did: string) => Promise<unknown>;
  revokeIdentity: (did: string) => Promise<unknown>;
  updateMetadataURI: (did: string, metadataURI: string) => Promise<unknown>;
  bindWallet: (did: string, wallet: string, isPrimary: boolean) => Promise<unknown>;
  unbindWallet: (did: string, wallet: string) => Promise<unknown>;
  changePrimaryWallet: (did: string, newPrimary: string) => Promise<unknown>;
  getIdentity: (did: string) => Promise<unknown>;
  getDIDsForWallet: (wallet: string) => Promise<string[]>;
  isVerified: (did: string) => Promise<boolean>;
  isActive: (did: string) => Promise<boolean>;
  paused: () => Promise<boolean>;
  unpause: () => Promise<unknown>;
}

type SignedIdentityRegistryContract = IdentityRegistryContract;

interface AuditLogContract {
  getRecentEntries: (limit: number, offset: number) => Promise<AuditEntry[]>;
  getEntriesByCategory: (category: number, limit: number, offset: number) => Promise<AuditEntry[]>;
  getEntriesByActor: (actor: string, limit: number, offset: number) => Promise<AuditEntry[]>;
  getEntriesByTarget: (target: string, limit: number, offset: number) => Promise<AuditEntry[]>;
  getEntriesByHash: (targetHash: string, limit: number, offset: number) => Promise<AuditEntry[]>;
  queryEntries: (filter: QueryFilter) => Promise<AuditEntry[]>;
  totalEntries: () => Promise<number>;
  ActionCategory?: Record<string, number>;
}

interface AuditEntry {
  index: bigint;
  category: number;
  actor: string;
  target: string;
  targetHash: string;
  details: string;
  timestamp: number;
  blockNumber: bigint;
  txHash: string;
}

interface QueryFilter {
  category: number;
  actor: string;
  target: string;
  targetHash: string;
  fromTimestamp: number;
  toTimestamp: number;
  limit: number;
  offset: number;
}

// Must stay in the same order as RolesAndPermissions.Permission (bool[16]).
// DocumentVerify/DocumentRevoke are not part of the deployed contract enum.
const PERMISSIONS = [
  "IdentityCreate", "IdentityVerify", "IdentityRevoke", "IdentitySuspend", "IdentityUpdateMetadata",
  "AssetMint", "AssetBurn", "AssetAssign", "AssetTransfer", "AssetForceTransfer", "AssetUpdateMetadata",
  "SystemPause", "SystemUnpause", "RoleGrant", "RoleRevoke", "AuditReadAll",
] as const;
const PERMISSION_INDEX = Object.fromEntries(PERMISSIONS.map((permission, index) => [permission, index]));

const AUDIT_CATEGORIES = [
  { value: 0, label: "Identity Created" },
  { value: 1, label: "Identity Verified" },
  { value: 2, label: "Identity Revoked" },
  { value: 3, label: "Identity Suspended" },
  { value: 4, label: "Identity Reinstated" },
  { value: 5, label: "Identity Metadata Updated" },
  { value: 6, label: "Wallet Bound" },
  { value: 7, label: "Wallet Unbound" },
  { value: 8, label: "Primary Wallet Changed" },
  { value: 9, label: "Role Granted" },
  { value: 10, label: "Role Revoked" },
  { value: 11, label: "Permission Granted" },
  { value: 12, label: "Permission Revoked" },
  { value: 13, label: "Asset Minted" },
  { value: 14, label: "Asset Assigned" },
  { value: 15, label: "Asset Transferred" },
  { value: 16, label: "Asset Status Changed" },
  { value: 17, label: "Asset Metadata Updated" },
  { value: 18, label: "Asset Retired" },
  { value: 19, label: "Asset Reported Lost" },
  { value: 20, label: "Credential Issued" },
  { value: 21, label: "Credential Accepted" },
  { value: 22, label: "Credential Rejected" },
  { value: 23, label: "Credential Revoked" },
  { value: 24, label: "Credential Reinstated" },
  { value: 25, label: "Credential Linked to Asset" },
  { value: 26, label: "System Paused" },
  { value: 27, label: "System Unpaused" },
  { value: 28, label: "Contract Upgraded" },
];

const STATUS_COLORS = {
  Created: "bg-warning/20 text-warning border-warning/30",
  Verified: "bg-success/20 text-success border-success/30",
  Revoked: "bg-destructive/20 text-destructive border-destructive/30",
  Suspended: "bg-destructive/20 text-destructive border-destructive/30",
};

const KYC_LABELS = ["None", "Pending", "Verified", "Rejected"];

function formatTimestamp(ts: number): string {
  if (!ts || ts === 0) return "—";
  return new Date(ts * 1000).toLocaleString();
}

function formatAddress(addr: string): string {
  if (!addr || addr === ethers.ZeroAddress) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function ensureIdentityManager(registry: IdentityRegistryContract, signer: ethers.Signer): Promise<void> {
  if (await registry.paused()) {
    const unpauseTx = await registry.unpause() as ethers.TransactionResponse;
    await unpauseTx.wait();
  }
  const account = await signer.getAddress();
  const managerRole = await registry.IDENTITY_MANAGER_ROLE();
  if (await registry.hasRole(managerRole, account)) return;

  const tx = await registry.grantRole(managerRole, account) as ethers.TransactionResponse;
  await tx.wait();
}

const adminSnapshots = new Map<string, { paused: boolean; managers: string[]; auditors: string[]; identities: IdentityRecord[] }>();

export default function AdminDashboard() {
  const { toast } = useToast();
  const { address } = useWallet("sih");
  const { role: sihRole, loading: roleLoading, identity, isConfigured, error: contextError } = useSihContext("sih");

  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<string[]>([]);
  const [auditors, setAuditors] = useState<string[]>([]);
  const [identities, setIdentities] = useState<IdentityRecord[]>([]);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);
  const [busyDid, setBusyDid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Permission management
  const [selectedRole, setSelectedRole] = useState<"manager" | "auditor">("manager");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permLoading, setPermLoading] = useState(false);

  // Identity creation
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    did: "",
    primaryWallet: "",
    name: "",
    organization: "",
    role: "",
    metadataURI: "",
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Identity detail
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedIdentity, setSelectedIdentity] = useState<IdentityRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
    variant?: "destructive" | "default";
  } | null>(null);

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState<Partial<QueryFilter>>({});
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(true);
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<number | "all">("all");
  const [auditActivated, setAuditActivated] = useState(false);

  // Guard: only admins can access
  useEffect(() => {
    if (!roleLoading && isConfigured && sihRole.role !== "admin") {
      toast({ title: "Access denied", description: "Only platform admins can access this dashboard.", variant: "destructive" });
    }
  }, [sihRole, roleLoading, isConfigured, toast]);

  const load = useCallback(async (force = false) => {
    if (!isConfigured || !address) return;

    const cacheKey = address.toLowerCase();
    const cached = !force ? adminSnapshots.get(cacheKey) : undefined;
    if (cached) {
      setPaused(cached.paused);
      setManagers(cached.managers);
      setAuditors(cached.auditors);
      setIdentities(cached.identities);
      setLoading(false);
      return;
    }

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

      // IdentityRegistry is append-only and exposes creation events rather than a
      // broad getAllDIDs view. Read the event index, then hydrate each record.
      const identityEvents = await registry.queryFilter(registry.filters.IdentityCreated(), 1, "latest");
      const dids = identityEvents.flatMap((event) => "args" in event && event.args?.did ? [String(event.args.did)] : []);
      const identityList = await Promise.all(
        dids.slice(0, 100).map(async (did: string) => {
          const id = await registry.getIdentity(did);
          const statusMap = ["Created", "Verified", "Revoked", "Suspended"];
          return {
            did: id[1],
            name: id[9],
            email: "",
            organization: id[10] || "",
            role: id[11] || "",
            kycStatus: Number(id[4]),
            isActive: Number(id[4]) === 1 || Number(id[4]) === 2,
            wallets: id[3],
            primaryWallet: id[2],
            createdAt: Number(id[5]),
            verifiedAt: Number(id[6]),
            revokedAt: Number(id[7]),
            metadataURI: id[8],
            status: statusMap[Number(id[4]) - 1] || "Created",
          } as IdentityRecord;
        })
      );
      setIdentities(identityList);
      adminSnapshots.set(cacheKey, { paused: p, managers: m.map((addr: string) => ethers.getAddress(addr)), auditors: a.map((addr: string) => ethers.getAddress(addr)), identities: identityList });
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

  const runAction = async (action: (signer: ethers.Signer) => Promise<void>, onSuccess?: () => void) => {
    try {
      await ensureSepolia();
      const provider = new ethers.BrowserProvider(getInjectedProvider()!);
      const signer = await provider.getSigner();
      await action(signer);
      toast({ title: "Success", description: "Transaction confirmed" });
      load(true);
      onSuccess?.();
    } catch (err) {
      setCreateLoading(false);
      toast({ title: "Action failed", description: describeError(err), variant: "destructive" });
    }
  };

  const runIdentityAction = async (
    did: string,
    action: (contract: SignedIdentityRegistryContract) => Promise<unknown>,
    successMessage: string
  ) => {
    setBusyDid(did);
    await runAction(async (signer) => {
      const registry = getIdentityRegistry(signer) as SignedIdentityRegistryContract;
      await ensureIdentityManager(registry, signer);
      await action(registry);
    }, () => toast({ title: successMessage }));
    setBusyDid(null);
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

  const confirmAndRun = (title: string, description: string, action: () => void, variant: "destructive" | "default" = "destructive") => {
    setConfirmAction({ open: true, title, description, action, variant });
  };

  const createIdentity = () => {
    if (!createForm.did || !createForm.primaryWallet || !createForm.name) {
      toast({ title: "Validation error", description: "DID, primary wallet, and name are required", variant: "destructive" });
      return;
    }
    if (!ethers.isAddress(createForm.primaryWallet)) {
      toast({ title: "Validation error", description: "Invalid wallet address", variant: "destructive" });
      return;
    }
    setCreateLoading(true);
    runAction(async (signer) => {
      const registry = getIdentityRegistry(signer) as SignedIdentityRegistryContract;
      await ensureIdentityManager(registry, signer);
      await registry.createIdentity(
        createForm.did,
        createForm.primaryWallet,
        createForm.name,
        createForm.organization,
        createForm.role,
        createForm.metadataURI
      );
    }, () => {
      toast({ title: "Identity created" });
      setCreateDialogOpen(false);
      setCreateForm({ did: "", primaryWallet: "", name: "", organization: "", role: "", metadataURI: "" });
      setCreateLoading(false);
    });
  };

  const verifyIdentity = (did: string) => runIdentityAction(did, (r) => r.verifyIdentity(did), "Identity verified");
  const suspendIdentity = (did: string) => runIdentityAction(did, (r) => r.suspendIdentity(did), "Identity suspended");
  const reinstateIdentity = (did: string) => runIdentityAction(did, (r) => r.reinstateIdentity(did), "Identity reinstated");
  const revokeIdentity = (did: string) => runIdentityAction(did, (r) => r.revokeIdentity(did), "Identity revoked");

  const loadPermissions = async (roleToLoad: "manager" | "auditor" = selectedRole) => {
    if (!isConfigured) return;
    setPermLoading(true);
    try {
      const roles = getRolesAndPermissionsRO() as RolesContract;
      const roleHash = roleToLoad === "manager"
        ? await roles.MANAGER_ROLE()
        : await roles.AUDITOR_ROLE();
      const perms = await roles.getRolePermissions(roleHash);
      const permMap: Record<string, boolean> = {};
      PERMISSIONS.forEach((p, i) => { permMap[p] = Boolean(perms[i]); });
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
      const permValue = PERMISSION_INDEX[perm as keyof typeof PERMISSION_INDEX];
      if (permValue !== undefined) {
        if (enabled) await roles.grantPermission(roleHash, permValue);
        else await roles.revokePermission(roleHash, permValue);
      }
    }
    toast({ title: "Permissions updated" });
  });

  const openDetail = async (did: string) => {
    setDetailLoading(true);
    try {
      const registry = getIdentityRegistryRO();
      const id = await registry.getIdentity(did);
      if (!id[0]) {
        toast({ title: "Not found", description: "Identity does not exist", variant: "destructive" });
        return;
      }
      const statusMap = ["Created", "Verified", "Revoked", "Suspended"];
      const record: IdentityRecord = {
        did: id[1],
        name: id[9],
        email: "",
        organization: id[10] || "",
        role: id[11] || "",
        kycStatus: Number(id[4]),
        isActive: Number(id[4]) === 1 || Number(id[4]) === 2,
        wallets: id[3],
        primaryWallet: id[2],
        createdAt: Number(id[5]),
        verifiedAt: Number(id[6]),
        revokedAt: Number(id[7]),
        metadataURI: id[8],
        status: statusMap[Number(id[4]) - 1] || "Created",
      };
      setSelectedIdentity(record);
      setDetailDialogOpen(true);
    } catch (err) {
      toast({ title: "Failed to load details", description: describeError(err), variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const loadAuditLog = useCallback(async (append = false) => {
    if (!isConfigured) return;
    setAuditLoading(true);
    try {
      const audit = getAuditLogRO() as AuditLogContract;

      let entries: AuditEntry[];
      if (auditCategoryFilter !== "all") {
        entries = await audit.getEntriesByCategory(auditCategoryFilter, 50, append ? auditOffset : 0);
      } else {
        entries = await audit.getRecentEntries(50, append ? auditOffset : 0);
      }

      if (append) {
        setAuditEntries((prev) => [...prev, ...entries]);
      } else {
        setAuditEntries(entries);
      }
      setAuditHasMore(entries.length === 50);
      if (!append) setAuditOffset(entries.length);
    } catch (err) {
      toast({ title: "Failed to load audit log", description: describeError(err), variant: "destructive" });
    } finally {
      setAuditLoading(false);
    }
  }, [isConfigured, auditCategoryFilter, auditOffset, toast]);

  // Audit data is intentionally deferred: it is a separate tab and can be a
  // large on-chain read. This keeps the admin overview responsive.
  useEffect(() => {
    if (isConfigured && auditActivated) loadAuditLog(false);
  }, [isConfigured, auditActivated, auditCategoryFilter, loadAuditLog]);

  const loadMoreAudit = () => {
    loadAuditLog(true);
  };

  const filteredIdentities = useMemo(() => identities.filter((id) => {
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
  }), [identities, search, filter]);

  const getStatusLabel = (status: number) => {
    const labels = ["Created", "Verified", "Revoked", "Suspended"];
    return labels[status] || `Unknown (${status})`;
  };

  const getStatusColor = (status: number) => {
    const colors = [
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

  if (roleLoading || loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-3">Loading platform administration…</p>
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

  if (contextError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-semibold">Platform connection unavailable</h2>
        <p className="mt-2 text-muted-foreground">{contextError}</p>
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
            <h1 className="text-xl font-semibold tracking-tight">Identity & access administration</h1>
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

      <Tabs defaultValue="roles" className="mt-8" onValueChange={(value) => { if (value === "audit") setAuditActivated(true); if (value === "permissions") void loadPermissions(); }}>
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
          <TabsTrigger value="audit">
            <History className="h-4 w-4" /> Audit Log
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
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={busyAddress === addr} onClick={() => confirmAndRun(
                        "Revoke Manager Role",
                        `Remove Manager role from ${formatAddress(addr)}? This action cannot be undone.`,
                        () => { setBusyAddress(addr); revokeRole("manager", addr); setBusyAddress(null); }
                      )}>
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
                <div className="flex gap-2 pt-2">
                  <Input placeholder="0x…" className="flex-1 font-mono text-xs" id="new-manager" />
                  <Button size="sm" onClick={() => {
                    const input = document.getElementById("new-manager") as HTMLInputElement;
                    if (input?.value) { confirmAndRun("Grant Manager Role", `Grant Manager role to ${input.value}?`, () => { grantRole("manager", input.value); input.value = ""; }); }
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
                      <Button variant="ghost" size="sm" className="text-destructive" disabled={busyAddress === addr} onClick={() => confirmAndRun(
                        "Revoke Auditor Role",
                        `Remove Auditor role from ${formatAddress(addr)}?`,
                        () => { setBusyAddress(addr); revokeRole("auditor", addr); setBusyAddress(null); }
                      )}>
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
                <div className="flex gap-2 pt-2">
                  <Input placeholder="0x…" className="flex-1 font-mono text-xs" id="new-auditor" />
                  <Button size="sm" onClick={() => {
                    const input = document.getElementById("new-auditor") as HTMLInputElement;
                    if (input?.value) { confirmAndRun("Grant Auditor Role", `Grant Auditor role to ${input.value}?`, () => { grantRole("auditor", input.value); input.value = ""; }); }
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
              <Select value={selectedRole} onValueChange={(v) => { const nextRole = v as "manager" | "auditor"; setSelectedRole(nextRole); void loadPermissions(nextRole); }}>
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
            <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap gap-4 items-center">
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
              <Button onClick={() => setCreateDialogOpen(true)}><UserPlus className="h-4 w-4" /> Create Identity</Button>
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
                    <th className="p-3">Primary Wallet</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : filteredIdentities.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No identities found</td></tr>
                  ) : (
                    filteredIdentities.map((id) => (
                      <tr key={id.did} className="hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{id.did?.slice(0, 20)}…</td>
                        <td className="p-3 text-sm">{id.name || "—"}</td>
                        <td className="p-3 text-sm text-muted-foreground">{id.email || "—"}</td>
                        <td className="p-3">
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                            id.kycStatus === 2 ? "bg-success/20 text-success border-success/30" :
                            id.kycStatus === 1 ? "bg-warning/20 text-warning border-warning/30" :
                            "bg-muted text-muted-foreground border-border"
                          )}>
                            {KYC_LABELS[id.kycStatus] || "None"}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full border",
                            STATUS_COLORS[id.status as keyof typeof STATUS_COLORS] || "bg-muted text-muted-foreground border-border"
                          )}>
                            {id.status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground font-mono">
                          {formatAddress(id.primaryWallet)}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openDetail(id.did)} disabled={detailLoading || busyDid === id.did} title="View details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {id.status === "Created" && (
                              <Button variant="ghost" size="icon" onClick={() => confirmAndRun(
                                "Verify Identity",
                                `Mark ${id.name || id.did} as verified?`,
                                () => verifyIdentity(id.did)
                              )} disabled={busyDid === id.did} title="Verify">
                                <CheckCircle className="h-4 w-4 text-success" />
                              </Button>
                            )}
                            {id.status === "Verified" && (
                              <Button variant="ghost" size="icon" onClick={() => confirmAndRun(
                                "Suspend Identity",
                                `Temporarily suspend ${id.name || id.did}? They will lose platform access until reinstated.`,
                                () => suspendIdentity(id.did)
                              )} disabled={busyDid === id.did} title="Suspend">
                                <PauseCircle className="h-4 w-4 text-warning" />
                              </Button>
                            )}
                            {id.status === "Suspended" && (
                              <Button variant="ghost" size="icon" onClick={() => confirmAndRun(
                                "Reinstate Identity",
                                `Restore ${id.name || id.did} to verified status?`,
                                () => reinstateIdentity(id.did),
                                "default"
                              )} disabled={busyDid === id.did} title="Reinstate">
                                <RotateCcw className="h-4 w-4 text-success" />
                              </Button>
                            )}
                            {(id.status === "Created" || id.status === "Verified" || id.status === "Suspended") && (
                              <Button variant="ghost" size="icon" onClick={() => confirmAndRun(
                                "Revoke Identity",
                                `Permanently revoke ${id.name || id.did}? This action is irreversible.`,
                                () => revokeIdentity(id.did)
                              )} disabled={busyDid === id.did} title="Revoke">
                                <Trash2 className="h-4 w-4 text-destructive" />
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

        {/* Audit Log */}
        <TabsContent value="audit" className="mt-6">
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border flex flex-wrap gap-4 items-center justify-between">
              <h2 className="text-base font-semibold">Audit Log</h2>
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={auditCategoryFilter} onValueChange={(v) => { setAuditCategoryFilter(v); setAuditOffset(0); }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {AUDIT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={loadMoreAudit} disabled={auditLoading || !auditHasMore}>
                  {auditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <> <ChevronDown className="h-4 w-4" /> Load More </>}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="p-3">Time</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Details</th>
                    <th className="p-3">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLoading && auditEntries.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : auditEntries.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No audit entries found</td></tr>
                  ) : (
                    auditEntries.map((entry) => (
                      <tr key={entry.index.toString()} className="hover:bg-muted/30">
                        <td className="p-3 text-xs font-mono">{formatTimestamp(entry.timestamp)}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full border bg-muted text-muted-foreground border-border">
                            {AUDIT_CATEGORIES.find(c => c.value === entry.category)?.label || `Unknown (${entry.category})`}
                          </span>
                        </td>
                        <td className="p-3 text-xs font-mono text-muted-foreground">{formatAddress(entry.actor)}</td>
                        <td className="p-3 text-xs font-mono text-muted-foreground">{formatAddress(entry.target)}</td>
                        <td className="p-3 text-sm max-w-xs truncate">{entry.details}</td>
                        <td className="p-3 text-xs font-mono text-muted-foreground">{entry.txHash.slice(0, 10)}…</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Identity Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Identity</DialogTitle>
            <DialogDescription>Register a new identity on the platform. Requires IDENTITY_MANAGER_ROLE.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="did">DID *</Label>
              <Input id="did" placeholder="did:sih:user-001" value={createForm.did} onChange={(e) => setCreateForm({...createForm, did: e.target.value})} />
              <p className="text-xs text-muted-foreground">Unique decentralized identifier (e.g., did:sih:org-123)</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="primaryWallet">Primary Wallet *</Label>
              <Input id="primaryWallet" placeholder="0x…" value={createForm.primaryWallet} onChange={(e) => setCreateForm({...createForm, primaryWallet: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" placeholder="John Doe" value={createForm.name} onChange={(e) => setCreateForm({...createForm, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="organization">Organization</Label>
              <Input id="organization" placeholder="Acme Corp" value={createForm.organization} onChange={(e) => setCreateForm({...createForm, organization: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="Engineer" value={createForm.role} onChange={(e) => setCreateForm({...createForm, role: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="metadataURI">Metadata URI (IPFS)</Label>
              <Input id="metadataURI" placeholder="ipfs://bafy..." value={createForm.metadataURI} onChange={(e) => setCreateForm({...createForm, metadataURI: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={createLoading}>Cancel</Button>
            <Button onClick={createIdentity} disabled={createLoading}>
              {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <> <UserPlus className="h-4 w-4" /> Create </>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Identity Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedIdentity?.name || "Identity Details"}</DialogTitle>
            <DialogDescription>DID: {selectedIdentity?.did}</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : selectedIdentity ? (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <span className={cn("px-3 py-1 text-sm font-medium rounded-full border inline-flex items-center gap-2",
                  STATUS_COLORS[selectedIdentity.status as keyof typeof STATUS_COLORS] || "bg-muted text-muted-foreground border-border"
                )}>
                  <span className="relative flex h-2 w-2">
                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                      selectedIdentity.status === "Verified" ? "bg-success" :
                      selectedIdentity.status === "Created" ? "bg-warning" : "bg-destructive"
                    )} />
                    <span className={cn("relative inline-flex rounded-full h-2 w-2",
                      selectedIdentity.status === "Verified" ? "bg-success" :
                      selectedIdentity.status === "Created" ? "bg-warning" : "bg-destructive"
                    )} />
                  </span>
                  {selectedIdentity.status}
                </span>
              </div>
              <div className="grid gap-2">
                <Label>KYC Status</Label>
                <span className={cn("px-3 py-1 text-sm font-medium rounded-full border inline-flex items-center gap-2",
                  selectedIdentity.kycStatus === 2 ? "bg-success/20 text-success border-success/30" :
                  selectedIdentity.kycStatus === 1 ? "bg-warning/20 text-warning border-warning/30" :
                  "bg-muted text-muted-foreground border-border"
                )}>
                  {KYC_LABELS[selectedIdentity.kycStatus] || "None"}
                </span>
              </div>
              <div className="grid gap-2">
                <Label>Organization</Label>
                <p className="text-sm text-muted-foreground">{selectedIdentity.organization || "—"}</p>
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <p className="text-sm text-muted-foreground">{selectedIdentity.role || "—"}</p>
              </div>
              <div className="grid gap-2">
                <Label>Primary Wallet</Label>
                <AddressChip address={selectedIdentity.primaryWallet} size="md" />
              </div>
              <div className="grid gap-2">
                <Label>Additional Wallets</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedIdentity.wallets.filter(w => w !== selectedIdentity.primaryWallet).map((w, i) => (
                    <AddressChip key={i} address={w} size="sm" />
                  ))}
                  {selectedIdentity.wallets.length <= 1 && <span className="text-sm text-muted-foreground">None</span>}
                </div>
              </div>
              <div className="grid gap-2 border-t pt-4">
                <Label>Timestamps</Label>
                <div className="grid gap-1 text-sm text-muted-foreground">
                  <div className="flex justify-between"><span>Created</span><span className="font-mono">{formatTimestamp(selectedIdentity.createdAt)}</span></div>
                  <div className="flex justify-between"><span>Verified</span><span className="font-mono">{formatTimestamp(selectedIdentity.verifiedAt)}</span></div>
                  <div className="flex justify-between"><span>Revoked</span><span className="font-mono">{formatTimestamp(selectedIdentity.revokedAt)}</span></div>
                </div>
              </div>
              {selectedIdentity.metadataURI && (
                <div className="grid gap-2 border-t pt-4">
                  <Label>Metadata URI</Label>
                  <p className="text-xs text-muted-foreground font-mono truncate">{selectedIdentity.metadataURI}</p>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction?.open ?? false} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmAction?.action(); setConfirmAction(null); }} variant={confirmAction?.variant === "destructive" ? "destructive" : "default"}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
