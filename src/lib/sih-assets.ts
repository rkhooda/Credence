import { ethers } from "ethers";
import { getAssetNFTRO, getReadOnlyProvider } from "./contract";

export const ASSET_TYPES = ["Certificate", "Document", "Equipment", "Device", "License", "Other"] as const;
export const ASSET_STATUS = ["None", "Active", "Transferred", "Retired", "Lost"] as const;

export interface AssetRecord {
  tokenId: string;
  assetType: number;
  owner: string;
  assignee: string;
  did: string;
  metadataURI: string;
  status: number;
  createdAt: number;
  updatedAt: number;
}

export function assetTypeLabel(value: number): string { return ASSET_TYPES[value] ?? `Type ${value}`; }
export function assetStatusLabel(value: number): string { return ASSET_STATUS[value] ?? `Status ${value}`; }

export async function fetchAssets(): Promise<AssetRecord[]> {
  const contract = getAssetNFTRO();
  const count = Number(await contract.totalAssets());
  const assets = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const view = await contract.getAsset(index);
    if (!view.exists) return null;
    return {
      tokenId: view.tokenId.toString(),
      assetType: Number(view.assetType),
      owner: view.owner,
      assignee: view.assignee,
      did: view.did,
      metadataURI: view.metadataURI,
      status: Number(view.status),
      createdAt: Number(view.createdAt),
      updatedAt: Number(view.updatedAt),
    } satisfies AssetRecord;
  }));
  return assets.filter((asset): asset is AssetRecord => asset !== null).reverse();
}

/** Fetch only assets relevant to a wallet. This avoids scanning every token for
 * the user overview, which is especially important as the registry grows. */
export async function fetchAssetsForAddress(address: string): Promise<AssetRecord[]> {
  const contract = getAssetNFTRO();
  const [owned, assigned] = await Promise.all([
    contract.getOwnerAssets(address),
    contract.getAssigneeAssets(address),
  ]);
  const tokenIds = [...new Set([...owned, ...assigned].map((id: bigint) => id.toString()))];
  const assets = await Promise.all(tokenIds.map(async (tokenId) => {
    const view = await contract.getAsset(tokenId);
    if (!view.exists) return null;
    return {
      tokenId: view.tokenId.toString(),
      assetType: Number(view.assetType),
      owner: view.owner,
      assignee: view.assignee,
      did: view.did,
      metadataURI: view.metadataURI,
      status: Number(view.status),
      createdAt: Number(view.createdAt),
      updatedAt: Number(view.updatedAt),
    } satisfies AssetRecord;
  }));
  return assets.filter((asset): asset is AssetRecord => asset !== null).reverse();
}

export async function fetchAssetHistory(tokenId?: string): Promise<Array<{
  kind: string;
  tokenId: string;
  from?: string;
  to?: string;
  actor?: string;
  blockNumber: number;
  transactionHash: string;
}>> {
  const contract = getAssetNFTRO();
  const provider = getReadOnlyProvider();
  const head = await provider.getBlockNumber();
  const filters = [
    contract.filters.AssetMinted(),
    contract.filters.AssetAssigned(),
    contract.filters.AssetTransferred(),
    contract.filters.AssetStatusChanged(),
    contract.filters.AssetMetadataUpdated(),
  ];
  const logs = (await Promise.all(filters.map((filter) => contract.queryFilter(filter, 1, head)))).flat();
  const result = logs.flatMap((log) => {
    if (!(log instanceof ethers.EventLog)) return [];
    const args = log.args;
    const id = args.tokenId?.toString() ?? "";
    if (tokenId && id !== tokenId) return [];
    const kind = log.fragment.name;
    return [{
      kind,
      tokenId: id,
      from: args.fromAssignee ?? args.fromOwner ?? args.oldStatus?.toString(),
      to: args.toAssignee ?? args.toOwner ?? args.newStatus?.toString(),
      actor: args.by,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
    }];
  });
  return result.sort((a, b) => b.blockNumber - a.blockNumber);
}
