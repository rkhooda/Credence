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

### Step 2: Roles & Permissions (IN PROGRESS)
- **NEW**: RolesAndPermissions.sol - Central RBAC for 4 roles
- **ROLES**:
  - Admin: Full system control, role assignment, contract pause
  - Manager: Asset creation, assignment, transfer; identity verification
  - Auditor: Read-only access to all data, audit history, verification
  - User: View own identity, owned assets, verify ownership
- **ENFORCE**: All critical operations protected by smart contract checks
- **INTEGRATE**: IdentityRegistry, AssetNFT, CredentialVault use this RBAC

### Step 3: Asset/NFT System
- **NEW**: AssetNFT.sol (ERC721-based)
- **FEATURES**: Mint, metadata, ownership, transfer, burn
- **TYPES**: Certificate, Document, Equipment, Device, License, Other
- **LINK**: Asset → Identity (owner/assignee)
- **REUSE**: IPFS + encryption infrastructure

### Step 4: Document/Credential Integration
- **EXTEND**: Move existing credential flow into asset model
- **MAP**: Credential → Asset type "Document"
- **KEEP**: Encryption, verification, QR sharing, key backup
- **UNIFY**: Single asset dashboard for all types

### Step 5: Audit History
- **EXTEND**: Events for identity, roles, assets, ownership changes
- **NEW**: AuditLog.sol - Event emission + query helpers
- **FRONTEND**: Auditor dashboard with filterable history

### Step 6: Frontend Platform
- **Admin**: Identity mgmt, role assignment, permission config
- **Manager**: Asset creation, assignment, transfers
- **Auditor**: Full history, verification, inspection
- **User**: Identity, owned assets, verification, history

---

## Contract Architecture

```
RolesAndPermissions.sol  ← NEW: Central RBAC (4 roles)
IdentityRegistry.sol     ← DONE: DID ↔ Wallet + metadata
AssetNFT.sol             ← NEW: ERC721 for all asset types
CredentialVault.sol      ← KEEP: Document verification (as asset type)
AuditLog.sol             ← NEW: Event emission + query helpers
```

---

## Test Strategy
- Every new contract: unit, fuzz, invariant tests
- Authorization tests for each role/operation
- Ownership transfer tests
- Identity/asset linking tests
- Integration tests for credential→asset migration