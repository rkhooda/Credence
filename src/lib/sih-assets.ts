import { ethers } from "ethers";
import { getAssetNFTRO, getReadOnlyProvider, queryFilterChunked, SIH_DEPLOYMENT_BLOCK } from "./contract";
import { readCached } from "./sih-cache";

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

async function mapInBatches<T, R>(items: T[], mapper: (item: T) => Promise<R>, batchSize = 4): Promise<R[]> {
  const result: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    result.push(...await Promise.all(items.slice(index, index + batchSize).map(mapper)));
  }
  return result;
}

export async function fetchAssets(force = false): Promise<AssetRecord[]> {
  return readCached("assets:all", async () => {
    const contract = getAssetNFTRO();
    const count = Number(await contract.totalAssets());
    const assets = await mapInBatches(Array.from({ length: count }, (_, index) => index), async (index) => {
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
    });
    return assets.filter((asset): asset is AssetRecord => asset !== null).reverse();
  }, force);
}

/** Fetch only assets relevant to a wallet. This avoids scanning every token for
 * the user overview, which is especially important as the registry grows. */
export async function fetchAssetsForAddress(address: string, force = false): Promise<AssetRecord[]> {
  return readCached(`assets:address:${address.toLowerCase()}`, async () => {
    const contract = getAssetNFTRO();
    const [owned, assigned] = await Promise.all([
      contract.getOwnerAssets(address),
      contract.getAssigneeAssets(address),
    ]);
    const tokenIds = [...new Set([...owned, ...assigned].map((id: bigint) => id.toString()))];
    const assets = await mapInBatches(tokenIds, async (tokenId) => {
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
    });
    return assets.filter((asset): asset is AssetRecord => asset !== null).reverse();
  }, force);
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
  const logs = (await Promise.all(filters.map((filter) => queryFilterChunked(contract, filter, SIH_DEPLOYMENT_BLOCK, head)))).flat();
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
