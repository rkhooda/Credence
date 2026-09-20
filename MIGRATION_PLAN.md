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

### Step 1: Identity Layer ✓ (Foundation exists - extend)
- **KEEP**: Wallet connection, key derivation, local key storage
- **EXTEND**: Add IdentityRegistry contract mapping DID → wallet + metadata
- **NEW**: DID document structure, identity verification, wallet binding

### Step 2: Roles & Permissions
- **REBUILD**: Replace 2-role system with 4-role RBAC
- **CONTRACT**: AccessControl with Admin, Manager, Auditor, User roles
- **ENFORCE**: All critical operations protected by smart contract checks
- **FRONTEND**: Role-aware navigation and dashboards

### Step 3: Asset/NFT System
- **NEW**: AssetNFT contract (ERC721-based)
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
- **NEW**: Audit log contract or comprehensive event indexing
- **FRONTEND**: Auditor dashboard with filterable history

### Step 6: Frontend Platform
- **Admin**: Identity mgmt, role assignment, permission config
- **Manager**: Asset creation, assignment, transfers
- **Auditor**: Full history, verification, inspection
- **User**: Identity, owned assets, verification, history

---

## Contract Architecture

```
IdentityRegistry.sol     ← NEW: DID ↔ Wallet + metadata
AccessControl.sol        ← EXTEND: 4 roles with permissions
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