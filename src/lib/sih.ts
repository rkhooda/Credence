/**
 * SIH Platform: Identity & Role Management
 *
 * Handles the core wallet → identity → role flow:
 * 1. Connect wallet
 * 2. Look up DID from IdentityRegistry
 * 3. Determine role from RolesAndPermissions
 * 4. Load appropriate dashboard
 *
 * The blockchain is the source of truth for all authorization.
 */
import { ethers } from "ethers";
import { getIdentityRegistryRO, getRolesAndPermissionsRO, isSihPlatformConfigured } from "./contract";
import { readCached } from "./sih-cache";

export type SihRole = "admin" | "manager" | "auditor" | "user" | "unregistered";

export interface IdentityInfo {
  did: string | null;
  name: string;
  email: string;
  kycStatus: number; // 0=none, 1=pending, 2=verified, 3=rejected
  isActive: boolean;
  wallets: string[];
}

export interface RoleInfo {
  role: SihRole;
  isAtLeastManager: boolean;
  isAtLeastAuditor: boolean;
  isAdmin: boolean;
  permissions: string[];
}

/**
 * Resolves the identity for a connected wallet address.
 * Returns null if the wallet has no registered identity.
 */
export async function resolveIdentity(walletAddress: string): Promise<IdentityInfo | null> {
  if (!isSihPlatformConfigured()) return null;

  const registry = getIdentityRegistryRO();
  const checksummed = ethers.getAddress(walletAddress);

  try {
    // Check if wallet has any DIDs
    const dids = await registry.getDIDsForWallet(checksummed);
    if (!dids || dids.length === 0) return null;

    // Use the first (primary) DID
    const primaryDid = dids[0];
    const identity = await registry.getIdentity(primaryDid);

    return {
      did: identity[0],           // did
      name: identity[1],          // name
      email: identity[2],         // email
      kycStatus: Number(identity[3]), // kycStatus
      isActive: identity[4],      // isActive
      wallets: identity[5],       // wallets
    };
  } catch (err) {
    console.warn(`Failed to resolve identity for ${walletAddress}:`, err);
    return null;
  }
}

/**
 * Determines the SIH role for a wallet address by querying RolesAndPermissions.
 * The blockchain contract is the authority — no localStorage or frontend-only logic.
 */
export async function resolveRole(walletAddress: string): Promise<RoleInfo> {
  if (!isSihPlatformConfigured()) {
    return { role: "user", isAtLeastManager: false, isAtLeastAuditor: false, isAdmin: false, permissions: [] };
  }

  const roles = getRolesAndPermissionsRO();
  const checksummed = ethers.getAddress(walletAddress);

  try {
    const [isAdmin, isAtLeastManager, isAtLeastAuditor, roleName] = await Promise.all([
      roles.isAdmin({ from: checksummed }),
      roles.isAtLeastManager({ from: checksummed }),
      roles.isAtLeastAuditor({ from: checksummed }),
      roles.getCallerRoleName({ from: checksummed }),
    ]);

    let role: SihRole = "user";
    if (isAdmin) role = "admin";
    else if (isAtLeastManager) role = "manager";
    else if (isAtLeastAuditor) role = "auditor";
    else if (roleName && roleName !== "User") role = roleName.toLowerCase() as SihRole;

    return {
      role,
      isAtLeastManager,
      isAtLeastAuditor,
      isAdmin,
      // Permissions are loaded only in the Admin permission tab. Resolving
      // them here caused 16 extra RPC calls on every dashboard mount.
      permissions: [],
    };
  } catch (err) {
    console.warn(`Failed to resolve role for ${walletAddress}:`, err);
    throw new Error("Could not read platform roles. Check that the app is using the Sepolia network and RPC endpoint.", { cause: err });
  }
}

interface RolesContract {
  hasPermission: (role: string, permission: number) => Promise<boolean>;
  getCallerRoleName: (overrides?: { from: string }) => Promise<string>;
  MANAGER_ROLE: () => Promise<string>;
  AUDITOR_ROLE: () => Promise<string>;
  DEFAULT_ADMIN_ROLE: () => Promise<string>;
}

/**
 * Gets the permission names for a given address by checking all permission constants.
 */
async function getPermissionsForAddress(roles: RolesContract, address: string): Promise<string[]> {
  const permissionNames = [
    "IdentityCreate", "IdentityVerify", "IdentityRevoke", "IdentitySuspend", "IdentityUpdateMetadata",
    "AssetMint", "AssetBurn", "AssetAssign", "AssetTransfer", "AssetForceTransfer", "AssetUpdateMetadata",
    "SystemPause", "SystemUnpause", "RoleGrant", "RoleRevoke", "AuditReadAll",
  ];

  const callerRole = await roles.getCallerRoleName({ from: address });
  const role = callerRole === "Admin" ? await roles.DEFAULT_ADMIN_ROLE() : callerRole === "Manager" ? await roles.MANAGER_ROLE() : callerRole === "Auditor" ? await roles.AUDITOR_ROLE() : ethers.ZeroHash;
  const checks = await Promise.all(
    permissionNames.map(async (name, permissionValue) => {
      try {
        return (await roles.hasPermission(role, permissionValue)) ? name : null;
      } catch {
        return null;
      }
    }),
  );
  return checks.filter((name): name is string => name !== null);
}

/**
 * Combined function: wallet → identity → role
 * This is the main entry point for the SIH platform flow.
 */
async function resolveSihContextUncached(walletAddress: string): Promise<{
  identity: IdentityInfo | null;
  role: RoleInfo;
}> {
  const [identity, role] = await Promise.all([
    resolveIdentity(walletAddress),
    resolveRole(walletAddress),
  ]);

  if (!identity && role.role === "user") return { identity, role: { ...role, role: "unregistered" } };
  return { identity, role };
}

export function resolveSihContext(walletAddress: string): Promise<{
  identity: IdentityInfo | null;
  role: RoleInfo;
}> {
  const key = ethers.getAddress(walletAddress).toLowerCase();
  return readCached(`sih:context:${key}`, () => resolveSihContextUncached(walletAddress));
}

/**
 * Human-readable role label for UI display.
 */
export function roleLabel(role: SihRole): string {
  const labels: Record<SihRole, string> = {
    admin: "Platform Admin",
    manager: "Manager",
    auditor: "Auditor",
    user: "User",
    unregistered: "Unregistered",
  };
  return labels[role] ?? "Unknown";
}

/**
 * Role color classes for UI.
 */
export function roleColorClasses(role: SihRole): string {
  const classes: Record<SihRole, string> = {
    admin: "bg-purple/20 text-purple border-purple/30",
    manager: "bg-blue/20 text-blue border-blue/30",
    auditor: "bg-amber/20 text-amber border-amber/30",
    user: "bg-muted text-muted-foreground border-border",
    unregistered: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return classes[role] ?? "bg-muted text-muted-foreground border-border";
}
