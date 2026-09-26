import { useCallback, useEffect, useState } from "react";
import { useWallet, type WalletRole } from "@/hooks/use-wallet";
import { isSihPlatformConfigured } from "@/lib/contract";
import { resolveSihContext, type IdentityInfo, type RoleInfo, type SihRole } from "@/lib/sih";
export { roleLabel, roleColorClasses } from "@/lib/sih";

export interface SihContext {
  /** Whether SIH platform contracts are configured */
  isConfigured: boolean;
  /** The resolved identity (DID, name, email, etc.) */
  identity: IdentityInfo | null;
  /** The resolved role and permissions */
  role: RoleInfo;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: string | null;
  /** Refresh the context */
  refresh: () => Promise<void>;
}

/**
 * Hook that resolves the full SIH context for the current wallet.
 * This replaces the old role-based logic with blockchain-authoritative data.
 */
export function useSihContext(role: WalletRole | null): SihContext {
  const { address } = useWallet(role);
  const [context, setContext] = useState<SihContext>({
    isConfigured: isSihPlatformConfigured(),
    identity: null,
    role: { role: "user", isAtLeastManager: false, isAtLeastAuditor: false, isAdmin: false, permissions: [] },
    loading: true,
    error: null,
    refresh: async () => {},
  });

  const refresh = useCallback(async () => {
    if (!address) {
      setContext((prev) => ({ ...prev, loading: false, identity: null, role: { role: "user", isAtLeastManager: false, isAtLeastAuditor: false, isAdmin: false, permissions: [] } }));
      return;
    }

    setContext((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const configured = isSihPlatformConfigured();

      if (!configured) {
        setContext({
          isConfigured: false,
          identity: null,
          role: { role: "user", isAtLeastManager: false, isAtLeastAuditor: false, isAdmin: false, permissions: [] },
          loading: false,
          error: null,
          refresh,
        });
        return;
      }

      const { identity, role: roleInfo } = await resolveSihContext(address);
      setContext({
        isConfigured: true,
        identity,
        role: roleInfo,
        loading: false,
        error: null,
        refresh,
      });
    } catch (err) {
      console.error("Failed to resolve SIH context:", err);
      setContext((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load identity and role",
      }));
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...context, refresh };
}

/**
 * Simplified hook for components that only need the role.
 */
export function useSihRole(role: WalletRole | null): { role: RoleInfo; loading: boolean; refresh: () => Promise<void> } {
  const { role: roleInfo, loading, refresh } = useSihContext(role);
  return { role: roleInfo, loading, refresh };
}

/**
 * Simplified hook for components that only need the identity.
 */
export function useSihIdentity(role: WalletRole | null): { identity: IdentityInfo | null; loading: boolean; refresh: () => Promise<void> } {
  const { identity, loading, refresh } = useSihContext(role);
  return { identity, loading, refresh };
}
