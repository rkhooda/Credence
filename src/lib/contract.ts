import { ethers } from "ethers";
import { CREDENTIAL_VAULT_ABI } from "./credentialVaultAbi";
import { ROLES_AND_PERMISSIONS_ABI } from "./abis/RolesAndPermissionsAbi";
import { IDENTITY_REGISTRY_ABI } from "./abis/IdentityRegistryAbi";
import { ASSET_NFT_ABI } from "./abis/AssetNFTAbi";
import { CREDENTIAL_ASSET_BRIDGE_ABI } from "./abis/CredentialAssetBridgeAbi";
import { AUDIT_LOG_ABI } from "./abis/AuditLogAbi";

export { CREDENTIAL_VAULT_ABI } from "./credentialVaultAbi";
export { ROLES_AND_PERMISSIONS_ABI } from "./abis/RolesAndPermissionsAbi";
export { IDENTITY_REGISTRY_ABI } from "./abis/IdentityRegistryAbi";
export { ASSET_NFT_ABI } from "./abis/AssetNFTAbi";
export { CREDENTIAL_ASSET_BRIDGE_ABI } from "./abis/CredentialAssetBridgeAbi";
export { AUDIT_LOG_ABI } from "./abis/AuditLogAbi";

/**
 * SIH Platform Contract Configuration
 *
 * All 6 contracts share the same admin (the deployer).
 * Addresses can be overridden via VITE_* environment variables.
 * Fallback addresses point to the legacy CredentialVault deployment for backwards compatibility.
 */

// Legacy contract (kept for backwards compatibility)
export const LEGACY_CONTRACT_ADDRESS: string =
  (import.meta.env.VITE_LEGACY_CONTRACT_ADDRESS as string | undefined) ??
  "0x26Eb4c3f71ab6735e6c4b5a04D88fa902c46C8B3";

// New SIH Platform contracts
export const ROLES_AND_PERMISSIONS_ADDRESS: string =
  (import.meta.env.VITE_ROLES_AND_PERMISSIONS_ADDRESS as string | undefined) ?? "";

export const IDENTITY_REGISTRY_ADDRESS: string =
  (import.meta.env.VITE_IDENTITY_REGISTRY_ADDRESS as string | undefined) ?? "";

export const ASSET_NFT_ADDRESS: string =
  (import.meta.env.VITE_ASSET_NFT_ADDRESS as string | undefined) ?? "";

export const CREDENTIAL_VAULT_ADDRESS: string =
  (import.meta.env.VITE_CREDENTIAL_VAULT_ADDRESS as string | undefined) ??
  LEGACY_CONTRACT_ADDRESS;

export const CREDENTIAL_ASSET_BRIDGE_ADDRESS: string =
  (import.meta.env.VITE_CREDENTIAL_ASSET_BRIDGE_ADDRESS as string | undefined) ?? "";

export const AUDIT_LOG_ADDRESS: string =
  (import.meta.env.VITE_AUDIT_LOG_ADDRESS as string | undefined) ?? "";

/**
 * Whether the new SIH platform contracts are deployed and configured.
 * If false, the app falls back to legacy CredentialVault-only mode.
 */
export function isSihPlatformConfigured(): boolean {
  return !!(
    ROLES_AND_PERMISSIONS_ADDRESS &&
    IDENTITY_REGISTRY_ADDRESS &&
    ASSET_NFT_ADDRESS &&
    CREDENTIAL_VAULT_ADDRESS &&
    CREDENTIAL_ASSET_BRIDGE_ADDRESS &&
    AUDIT_LOG_ADDRESS
  );
}

export const CHAIN_ID: number =
  Number((import.meta.env.VITE_CHAIN_ID as string | undefined) ?? 11155111);

export const RPC_URLS: string[] = [
  import.meta.env.VITE_RPC_URL as string | undefined,
  "https://sepolia.gateway.tenderly.co",
  "https://eth-sepolia.api.onfinality.io/public",
  "https://sepolia.drpc.org",
].filter((url): url is string => Boolean(url));

export const RPC_URL: string = RPC_URLS[0];

const LOG_CHUNK_SIZE = 9_000;
const RPC_TIMEOUT_MS = 15_000;

function createProvider(url: string): ethers.JsonRpcProvider {
  const request = new ethers.FetchRequest(url);
  request.timeout = RPC_TIMEOUT_MS;
  return new ethers.JsonRpcProvider(request, CHAIN_ID, { staticNetwork: true });
}

async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  head: number,
): Promise<(ethers.EventLog | ethers.Log)[]> {
  const logs: (ethers.EventLog | ethers.Log)[] = [];
  for (let from = 1; from <= head; from += LOG_CHUNK_SIZE) {
    const to = Math.min(from + LOG_CHUNK_SIZE - 1, head);
    logs.push(...(await contract.queryFilter(filter, from, to)));
  }
  return logs;
}

export async function queryEventsFromDeployment(
  buildFilters: (contract: ethers.Contract) => ethers.DeferredTopicFilter[],
): Promise<(ethers.EventLog | ethers.Log)[][]> {
  let lastError: unknown = new Error("No Sepolia RPC endpoints configured.");

  for (const url of RPC_URLS) {
    const provider = createProvider(url);
    try {
      try {
        return await Promise.all(buildFilters((abi) => new ethers.Contract("", abi, provider)).map((f) => f.queryFilter(f, 1)));
      } catch (err) {
        lastError = err;
        const head = await provider.getBlockNumber();
        return await Promise.all(buildFilters((abi) => new ethers.Contract("", abi, provider)).map((f) => queryFilterChunked(f, f, head)));
      }
    } catch (err) {
      lastError = err;
      console.warn(`Log query failed against ${url}, trying next RPC:`, err);
    } finally {
      provider.destroy();
    }
  }

  throw lastError;
}

export function getReadOnlyProvider(): ethers.JsonRpcProvider {
  return createProvider(RPC_URL);
}

export function getInjectedProvider(): ethers.Eip1193Provider | undefined {
  return (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;
}

export async function ensureSepolia(): Promise<void> {
  const ethereum = getInjectedProvider();
  if (!ethereum) throw new Error("MetaMask is not installed.");
  const hexChainId = `0x${CHAIN_ID.toString(16)}`;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] });
  } catch (err) {
    if ((err as { code?: number })?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hexChainId,
          chainName: "Sepolia Testnet",
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
    } else {
      throw err;
    }
  }
}

function contractOrThrow(address: string, name: string): string {
  if (!address) throw new Error(`${name} contract address not configured. Set VITE_${name.toUpperCase()}_ADDRESS.`);
  return address;
}

/** Returns a read-only contract instance for the given ABI and address. */
function getReadOnlyContract<T extends ethers.Contract>(
  abi: ethers.InterfaceAbi,
  address: string,
): T {
  const provider = getReadOnlyProvider();
  return new ethers.Contract(address, abi, provider) as T;
}

/** Returns a contract instance connected to a signer. */
function getSignedContract<T extends ethers.Contract>(
  abi: ethers.InterfaceAbi,
  address: string,
  signer: ethers.Signer,
): T {
  return new ethers.Contract(address, abi, signer) as T;
}

// --- SIH Platform Contract Accessors (Read-Only) ---

export function getRolesAndPermissionsRO() {
  return getReadOnlyContract(ROLES_AND_PERMISSIONS_ABI, contractOrThrow(ROLES_AND_PERMISSIONS_ADDRESS, "RolesAndPermissions"));
}

export function getIdentityRegistryRO() {
  return getReadOnlyContract(IDENTITY_REGISTRY_ABI, contractOrThrow(IDENTITY_REGISTRY_ADDRESS, "IdentityRegistry"));
}

export function getAssetNFTRO() {
  return getReadOnlyContract(ASSET_NFT_ABI, contractOrThrow(ASSET_NFT_ADDRESS, "AssetNFT"));
}

export function getCredentialVaultRO() {
  return getReadOnlyContract(CREDENTIAL_VAULT_ABI, contractOrThrow(CREDENTIAL_VAULT_ADDRESS, "CredentialVault"));
}

export function getCredentialAssetBridgeRO() {
  return getReadOnlyContract(CREDENTIAL_ASSET_BRIDGE_ABI, contractOrThrow(CREDENTIAL_ASSET_BRIDGE_ADDRESS, "CredentialAssetBridge"));
}

export function getAuditLogRO() {
  return getReadOnlyContract(AUDIT_LOG_ABI, contractOrThrow(AUDIT_LOG_ADDRESS, "AuditLog"));
}

// --- SIH Platform Contract Accessors (Signed) ---

export function getRolesAndPermissions(signer: ethers.Signer) {
  return getSignedContract(ROLES_AND_PERMISSIONS_ABI, contractOrThrow(ROLES_AND_PERMISSIONS_ADDRESS, "RolesAndPermissions"), signer);
}

export function getIdentityRegistry(signer: ethers.Signer) {
  return getSignedContract(IDENTITY_REGISTRY_ABI, contractOrThrow(IDENTITY_REGISTRY_ADDRESS, "IdentityRegistry"), signer);
}

export function getAssetNFT(signer: ethers.Signer) {
  return getSignedContract(ASSET_NFT_ABI, contractOrThrow(ASSET_NFT_ADDRESS, "AssetNFT"), signer);
}

export function getCredentialVault(signer: ethers.Signer) {
  return getSignedContract(CREDENTIAL_VAULT_ABI, contractOrThrow(CREDENTIAL_VAULT_ADDRESS, "CredentialVault"), signer);
}

export function getCredentialAssetBridge(signer: ethers.Signer) {
  return getSignedContract(CREDENTIAL_ASSET_BRIDGE_ABI, contractOrThrow(CREDENTIAL_ASSET_BRIDGE_ADDRESS, "CredentialAssetBridge"), signer);
}

export function getAuditLog(signer: ethers.Signer) {
  return getSignedContract(AUDIT_LOG_ABI, contractOrThrow(AUDIT_LOG_ADDRESS, "AuditLog"), signer);
}

// --- Legacy CredentialVault Accessors (for backwards compatibility) ---

export function getContract(providerOrSigner: ethers.ContractRunner) {
  return new ethers.Contract(LEGACY_CONTRACT_ADDRESS, CREDENTIAL_VAULT_ABI, providerOrSigner);
}

export const DEPLOYMENT_BLOCK = 1;