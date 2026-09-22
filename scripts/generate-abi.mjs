#!/usr/bin/env node
/**
 * Extracts ABIs from Foundry build artifacts into typed TypeScript modules.
 *
 * Regenerate with `npm run contract:abi` after any change to contract interfaces.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(root, "src/lib/abis");

const CONTRACTS = [
  { name: "RolesAndPermissions", source: "Backend-Contracts/out/RolesAndPermissions.sol/RolesAndPermissions.json" },
  { name: "IdentityRegistry", source: "Backend-Contracts/out/IdentityRegistry.sol/IdentityRegistry.json" },
  { name: "AssetNFT", source: "Backend-Contracts/out/AssetNFT.sol/AssetNFT.json" },
  { name: "CredentialVault", source: "Backend-Contracts/out/CredentialVault.sol/CredentialVault.json" },
  { name: "CredentialAssetBridge", source: "Backend-Contracts/out/CredentialAssetBridge.sol/CredentialAssetBridge.json" },
  { name: "AuditLog", source: "Backend-Contracts/out/AuditLog.sol/AuditLog.json" },
];

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

for (const contract of CONTRACTS) {
  const ARTIFACT = resolve(root, contract.source);
  const OUTPUT = resolve(OUT_DIR, `${contract.name}Abi.ts`);

  let artifact;
  try {
    artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  } catch {
    console.error(`Could not read ${ARTIFACT}\nRun "npm run contract:build" first.`);
    process.exit(1);
  }

  if (!Array.isArray(artifact.abi) || artifact.abi.length === 0) {
    console.error(`Artifact ${contract.name} contains no ABI — was the contract compiled?`);
    process.exit(1);
  }

  const banner = `// GENERATED FILE — do not edit by hand.
// Source: Backend-Contracts/src/${contract.name}.sol
// Regenerate: npm run contract:abi
`;

  writeFileSync(
    OUTPUT,
    `${banner}export const ${contract.name.toUpperCase()}_ABI = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`
  );

  const counts = new Map();
  for (const entry of artifact.abi) {
    counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
  }
  console.log(`Wrote ${OUTPUT}`);
  for (const [type, count] of counts) console.log(`  ${count} ${type}`);
}

console.log("\nAll ABIs generated successfully.");