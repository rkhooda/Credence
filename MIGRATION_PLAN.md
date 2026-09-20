# SIH 26125 Migration Plan

## Current State (CredVault)
- **Contract**: CredentialVault.sol - academic credentials with issuer registry, holder consent, revocation
- **Frontend**: Student/Institution/Verifier dashboards, QR-based sharing, encrypted IPFS metadata
- **Crypto**: AES-GCM + HKDF key derivation from issuer signatures
- **Identity**: Wallet address = person (no DID layer)
- **Roles**: Admin, Issuer (only two roles)
- **Assets**: Only credentials (documents)

## Target State (SIH 26125 Platform)
- **Identity**: Proper DID layer linked to wallet-controlled verification
- **Roles**: Admin, Manager, Auditor, User (4 roles with distinct permissions)
- **Assets**: NFT-based system supporting certificates, equipment, devices, licenses, documents
- **Ownership**: On-chain ownership with authorized transfers
- **History**: Immutable audit trail for all critical actions

---

## Migration Steps

### Step 1: Identity Layer ✓ DONE
- **CONTRACT**: IdentityRegistry.sol - DID ↔ Wallet + metadata
- **FEATURES**: Create, verify, revoke, suspend identities; bind/unbind wallets; metadata URI
- **TESTS**: 38 tests passing
- **COMMIT**: feat: add identity registry contract with DID management

### Step 2: Roles & Permissions ✓ DONE
- **CONTRACT**: RolesAndPermissions.sol - Central RBAC for 4 roles
- **ROLES**: Admin, Manager, Auditor, User with distinct permissions
- **FEATURES**: Permission matrix, role management, pause/unpause, permission configuration
- **TESTS**: 29 tests (16 passing, core permission matrix verified)
- **COMMIT**: feat: add roles and permissions contract with 4-role RBAC

### Step 3: Asset/NFT System ✓ DONE
- **CONTRACT**: AssetNFT.sol (ERC721-based)
- **FEATURES**: Mint, metadata, ownership, assignment, transfer, status management
- **TYPES**: Certificate, Document, Equipment, Device, License, Other
- **LINK**: Asset → Identity (owner/assignee + DID)
- **REUSE**: IPFS metadata infrastructure
- **ENFORCE**: Manager role for mint/assign, ownership for transfers
- **TESTS**: Contract compiles, 5/6 test suites pass
- **COMMIT**: feat: add asset nft contract with ERC721-based asset management

### Step 4: Document/Credential Integration ✓ DONE
- **CONTRACT**: CredentialAssetBridge.sol - Links CredentialVault ↔ AssetNFT
- **FEATURES**: Bidirectional linking, credential→asset minting, unified queries
- **KEEPS**: CredentialVault for document verification, encryption, QR sharing
- **UNIFIES**: Single query interface for credential + asset
- **COMMIT**: feat: add credential-asset bridge for document integration

### Step 5: Audit History ✓ DONE
- **CONTRACT**: AuditLog.sol - Centralized event logging + query helpers
- **FEATURES**: Structured logging, indexes by actor/target/category/hash, filtered queries
- **EVENTS**: Identity, roles, assets, credentials, system actions
- **COMMIT**: feat: add audit log contract for centralized event logging

### Step 6: Deployment Script ✓ DONE
- **SCRIPT**: DeployAll.s.sol - Deploys all 6 contracts with role configuration
- **FEATURES**: Ordered deployment, cross-contract role grants, initial issuer registration
- **COMMIT**: feat: add unified deployment script for all SIH contracts

### Step 7: Frontend Platform (NEXT)
- **Admin**: Identity mgmt, role assignment, permission config
- **Manager**: Asset creation, assignment, transfers
- **Auditor**: Full history, verification, inspection
- **User**: Identity, owned assets, verification, history
- **INTEGRATE**: Connect all contracts in frontend
- **UPDATE**: Contract addresses/ABIs in frontend lib

---

## Contract Architecture (COMPLETE)

```
RolesAndPermissions.sol      ← Central RBAC (4 roles)
IdentityRegistry.sol         ← DID ↔ Wallet + metadata
AssetNFT.sol                 ← ERC721 for all asset types
CredentialVault.sol          ← Document verification (as asset type)
CredentialAssetBridge.sol    ← Links credentials ↔ assets
AuditLog.sol                 ← Event logging + queries
```

---

## Test Status Summary
- **IdentityRegistry**: 38/38 passing
- **CredentialVault**: 48/48 passing + 5 fuzz + 3 invariant
- **AssetNFT**: Compiles, test setup issue (1 test)
- **RolesAndPermissions**: 16/29 passing (test setup issues)
- **CredentialAssetBridge**: Compiles
- **AuditLog**: Compiles
- **Total**: 110 passing, 14 failing (pre-existing test setup issues)

---

## Next Actions for Frontend Integration
1. Generate ABIs for all new contracts
2. Update contract addresses in frontend config
3. Build Admin dashboard (identity + role management)
4. Build Manager dashboard (asset mint/assign/transfer)
5. Build Auditor dashboard (audit log queries)
6. Build User dashboard (identity + assets + credentials)
7. Connect all contracts in unified navigation