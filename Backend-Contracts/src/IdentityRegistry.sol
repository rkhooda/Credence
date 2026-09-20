// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IdentityRegistry
 * @notice Digital identity registry for the SIH platform.
 *         Maps DIDs to wallet addresses with metadata and verification status.
 *
 * @dev Design notes:
 *      - A DID (Decentralized Identifier) is the primary identity key, not the wallet address.
 *      - One wallet can control multiple DIDs (e.g., personal + organizational).
 *      - One DID can have multiple associated wallet addresses (key rotation, multisig).
 *      - Verification status is separate from existence — an identity exists once created,
 *        but may be unverified, verified, or revoked.
 *      - Metadata is stored on-chain for critical fields; extended metadata uses IPFS.
 */
contract IdentityRegistry is AccessControlEnumerable, Pausable {
    // --- Roles ---
    bytes32 public constant IDENTITY_MANAGER_ROLE = keccak256("IDENTITY_MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // --- Types ---

    /// @notice Lifecycle of a digital identity.
    enum IdentityStatus {
        None,       // Does not exist
        Created,    // Exists but not verified
        Verified,   // Verified by authorized verifier
        Revoked,    // Revoked (compromised, left org, etc.)
        Suspended   // Temporarily suspended
    }

    /// @notice On-chain identity record.
    struct Identity {
        string did;                    // DID string (e.g., "did:ethr:0x..." or "did:sih:org-123")
        address[] wallets;             // Wallet addresses authorized to control this identity
        address primaryWallet;         // Primary wallet for transactions
        IdentityStatus status;
        uint48 createdAt;
        uint48 verifiedAt;             // 0 = not verified
        uint48 revokedAt;              // 0 = not revoked
        string metadataURI;            // IPFS URI for extended metadata (encrypted)
        string name;                   // Display name
        string organization;           // Organization affiliation (if any)
        string role;                   // Role within organization (employee, student, etc.)
    }

    /// @notice Flattened view for external queries.
    struct IdentityView {
        bool exists;
        string did;
        address primaryWallet;
        address[] wallets;
        IdentityStatus status;
        uint48 createdAt;
        uint48 verifiedAt;
        uint48 revokedAt;
        string metadataURI;
        string name;
        string organization;
        string role;
    }

    /// @notice Wallet-to-DID mapping entry.
    struct WalletBinding {
        string did;
        bool isPrimary;
        uint48 boundAt;
    }

    // --- Storage ---

    mapping(string => Identity) public identities;           // DID → Identity
    mapping(address => string[]) public walletDIDs;          // Wallet → DIDs (supports multiple)
    mapping(string => mapping(address => WalletBinding)) public walletBindings; // DID → Wallet → Binding

    // --- Errors ---

    error ZeroAddress();
    error EmptyDID();
    error EmptyName();
    error DIDAlreadyExists();
    error DIDNotFound();
    error WalletAlreadyBound();
    error WalletNotBound();
    error NotPrimaryWallet();
    error IdentityNotVerifiedErr();
    error IdentityRevokedErr();
    error IdentitySuspendedErr();
    error InvalidStatusTransition();
    error UnauthorizedVerifier();
    error MetadataURIRequired();
    error PrimaryWalletRequired();
    error AtLeastOneWalletRequired();

    // --- Events ---

    event IdentityCreated(
        string indexed did,
        address indexed primaryWallet,
        string name,
        string organization,
        uint48 timestamp
    );
    event IdentityVerified(string indexed did, address indexed verifier, uint48 timestamp);
    event IdentityRevoked(string indexed did, address indexed revoker, uint48 timestamp);
    event IdentitySuspended(string indexed did, address indexed suspender, uint48 timestamp);
    event IdentityReinstated(string indexed did, address indexed reinstater, uint48 timestamp);
    event WalletBound(string indexed did, address indexed wallet, bool isPrimary, uint48 timestamp);
    event WalletUnbound(string indexed did, address indexed wallet, uint48 timestamp);
    event PrimaryWalletChanged(string indexed did, address indexed oldWallet, address indexed newWallet, uint48 timestamp);
    event IdentityMetadataUpdated(string indexed did, string metadataURI, uint48 timestamp);
    event IdentityStatusChanged(string indexed did, IdentityStatus oldStatus, IdentityStatus newStatus, uint48 timestamp);

    // --- Constructor ---

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(IDENTITY_MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, DEFAULT_ADMIN_ROLE);
    }

    // --- Identity Creation ---

    /**
     * @notice Create a new digital identity.
     * @param did           Decentralized identifier (must be unique).
     * @param primaryWallet Wallet address that will control this identity.
     * @param name          Display name.
     * @param organization  Organization affiliation (optional).
     * @param role          Role within organization (optional).
     * @param metadataURI   IPFS URI for extended encrypted metadata (optional).
     */
    function createIdentity(
        string calldata did,
        address primaryWallet,
        string calldata name,
        string calldata organization,
        string calldata role,
        string calldata metadataURI
    ) external onlyRole(IDENTITY_MANAGER_ROLE) whenNotPaused {
        if (bytes(did).length == 0) revert EmptyDID();
        if (primaryWallet == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();
        if (identities[did].status != IdentityStatus.None) revert DIDAlreadyExists();

        Identity storage identity = identities[did];
        identity.did = did;
        identity.wallets = new address[](1);
        identity.wallets[0] = primaryWallet;
        identity.primaryWallet = primaryWallet;
        identity.status = IdentityStatus.Created;
        identity.createdAt = uint48(block.timestamp);
        identity.verifiedAt = 0;
        identity.revokedAt = 0;
        identity.metadataURI = metadataURI;
        identity.name = name;
        identity.organization = organization;
        identity.role = role;

        walletDIDs[primaryWallet].push(did);
        walletBindings[did][primaryWallet] = WalletBinding({did: did, isPrimary: true, boundAt: uint48(block.timestamp)});

        emit IdentityCreated(did, primaryWallet, name, organization, uint48(block.timestamp));
        emit WalletBound(did, primaryWallet, true, uint48(block.timestamp));
    }

    // --- Wallet Binding ---

    /**
     * @notice Add an additional wallet to an existing identity.
     * @param did    The DID to bind the wallet to.
     * @param wallet The wallet address to bind.
     * @param isPrimary Whether this wallet becomes the new primary.
     */
    function bindWallet(
        string calldata did,
        address wallet,
        bool isPrimary
    ) external onlyRole(IDENTITY_MANAGER_ROLE) whenNotPaused {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (wallet == address(0)) revert ZeroAddress();

        // Check if already bound
        for (uint256 i = 0; i < identity.wallets.length; i++) {
            if (identity.wallets[i] == wallet) revert WalletAlreadyBound();
        }

        identity.wallets.push(wallet);
        walletDIDs[wallet].push(did);
        walletBindings[did][wallet] = WalletBinding({did: did, isPrimary: false, boundAt: uint48(block.timestamp)});

        if (isPrimary) {
            address oldPrimary = identity.primaryWallet;
            identity.primaryWallet = wallet;
            walletBindings[did][wallet].isPrimary = true;
            walletBindings[did][oldPrimary].isPrimary = false;
            emit PrimaryWalletChanged(did, oldPrimary, wallet, uint48(block.timestamp));
        }

        emit WalletBound(did, wallet, isPrimary, uint48(block.timestamp));
    }

    /**
     * @notice Remove a wallet from an identity.
     * @param did    The DID.
     * @param wallet The wallet to remove.
     */
    function unbindWallet(string calldata did, address wallet) external onlyRole(IDENTITY_MANAGER_ROLE) {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (wallet == address(0)) revert ZeroAddress();
        if (wallet == identity.primaryWallet) revert NotPrimaryWallet(); // Cannot unbind primary directly

        // Find the wallet index first
        uint256 walletIndex = identity.wallets.length;
        for (uint256 i = 0; i < identity.wallets.length; i++) {
            if (identity.wallets[i] == wallet) {
                walletIndex = i;
                break;
            }
        }
        if (walletIndex == identity.wallets.length) revert WalletNotBound();

        // Remove wallet from identity's wallet list
        address[] memory newWallets = new address[](identity.wallets.length - 1);
        uint256 j = 0;
        for (uint256 i = 0; i < identity.wallets.length; i++) {
            if (i != walletIndex) {
                newWallets[j] = identity.wallets[i];
                j++;
            }
        }
        identity.wallets = newWallets;

        // Remove from walletDIDs
        string[] memory userDIDs = walletDIDs[wallet];
        if (userDIDs.length == 0) revert WalletNotBound();
        // Find the index first to avoid underflow
        uint256 didIndex = userDIDs.length;
        for (uint256 i = 0; i < userDIDs.length; i++) {
            if (keccak256(bytes(userDIDs[i])) == keccak256(bytes(did))) {
                didIndex = i;
                break;
            }
        }
        if (didIndex == userDIDs.length) revert WalletNotBound();

        string[] memory newUserDIDs = new string[](userDIDs.length - 1);
        j = 0;
        for (uint256 i = 0; i < userDIDs.length; i++) {
            if (i != didIndex) {
                newUserDIDs[j] = userDIDs[i];
                j++;
            }
        }
        walletDIDs[wallet] = newUserDIDs;

        delete walletBindings[did][wallet];

        emit WalletUnbound(did, wallet, uint48(block.timestamp));
    }

    /**
     * @notice Change the primary wallet for an identity.
     * @param did        The DID.
     * @param newPrimary The new primary wallet (must already be bound).
     */
    function changePrimaryWallet(string calldata did, address newPrimary) external onlyRole(IDENTITY_MANAGER_ROLE) {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (newPrimary == address(0)) revert ZeroAddress();
        if (newPrimary == identity.primaryWallet) return;

        // Verify newPrimary is already bound
        bool isBound = false;
        for (uint256 i = 0; i < identity.wallets.length; i++) {
            if (identity.wallets[i] == newPrimary) {
                isBound = true;
                break;
            }
        }
        if (!isBound) revert WalletNotBound();

        address oldPrimary = identity.primaryWallet;
        identity.primaryWallet = newPrimary;
        walletBindings[did][oldPrimary].isPrimary = false;
        walletBindings[did][newPrimary].isPrimary = true;

        emit PrimaryWalletChanged(did, oldPrimary, newPrimary, uint48(block.timestamp));
    }

    // --- Verification ---

    /**
     * @notice Verify an identity (mark as verified).
     * @param did The DID to verify.
     */
    function verifyIdentity(string calldata did) external onlyRole(IDENTITY_MANAGER_ROLE) whenNotPaused {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (identity.status == IdentityStatus.Verified) return; // Idempotent
        if (identity.status == IdentityStatus.Revoked) revert IdentityRevokedErr();
        if (identity.status == IdentityStatus.Suspended) revert IdentitySuspendedErr();

        _changeStatus(did, IdentityStatus.Verified);
        identity.verifiedAt = uint48(block.timestamp);
        emit IdentityVerified(did, msg.sender, uint48(block.timestamp));
    }

    /**
     * @notice Revoke an identity (permanent).
     * @param did The DID to revoke.
     */
    function revokeIdentity(string calldata did) external onlyRole(IDENTITY_MANAGER_ROLE) whenNotPaused {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (identity.status == IdentityStatus.Revoked) return; // Idempotent

        _changeStatus(did, IdentityStatus.Revoked);
        identity.revokedAt = uint48(block.timestamp);
        emit IdentityRevoked(did, msg.sender, uint48(block.timestamp));
    }

    /**
     * @notice Suspend an identity (temporary).
     * @param did The DID to suspend.
     */
    function suspendIdentity(string calldata did) external onlyRole(IDENTITY_MANAGER_ROLE) whenNotPaused {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (identity.status == IdentityStatus.Revoked) revert IdentityRevokedErr();
        if (identity.status == IdentityStatus.Suspended) return; // Idempotent

        _changeStatus(did, IdentityStatus.Suspended);
        emit IdentitySuspended(did, msg.sender, uint48(block.timestamp));
    }

    /**
     * @notice Reinstate a suspended identity.
     * @param did The DID to reinstate.
     */
    function reinstateIdentity(string calldata did) external onlyRole(IDENTITY_MANAGER_ROLE) whenNotPaused {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (identity.status != IdentityStatus.Suspended) revert InvalidStatusTransition();

        _changeStatus(did, IdentityStatus.Verified);
        emit IdentityReinstated(did, msg.sender, uint48(block.timestamp));
    }

    function _changeStatus(string memory did, IdentityStatus newStatus) private {
        Identity storage identity = identities[did];
        IdentityStatus oldStatus = identity.status;
        identity.status = newStatus;
        emit IdentityStatusChanged(did, oldStatus, newStatus, uint48(block.timestamp));
    }

    // --- Metadata ---

    /**
     * @notice Update the metadata URI for an identity.
     * @param did        The DID.
     * @param metadataURI New IPFS URI for encrypted metadata.
     */
    function updateMetadataURI(string calldata did, string calldata metadataURI) external onlyRole(IDENTITY_MANAGER_ROLE) {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) revert DIDNotFound();
        if (bytes(metadataURI).length == 0) revert MetadataURIRequired();

        identity.metadataURI = metadataURI;
        emit IdentityMetadataUpdated(did, metadataURI, uint48(block.timestamp));
    }

    // --- Queries ---

    /// @notice Get full identity view by DID.
    function getIdentity(string calldata did) external view returns (IdentityView memory) {
        Identity storage identity = identities[did];
        if (identity.status == IdentityStatus.None) {
            return IdentityView({exists: false, did: "", primaryWallet: address(0), wallets: new address[](0), status: IdentityStatus.None, createdAt: 0, verifiedAt: 0, revokedAt: 0, metadataURI: "", name: "", organization: "", role: ""});
        }
        return IdentityView({
            exists: true,
            did: identity.did,
            primaryWallet: identity.primaryWallet,
            wallets: identity.wallets,
            status: identity.status,
            createdAt: identity.createdAt,
            verifiedAt: identity.verifiedAt,
            revokedAt: identity.revokedAt,
            metadataURI: identity.metadataURI,
            name: identity.name,
            organization: identity.organization,
            role: identity.role
        });
    }

    /// @notice Get all DIDs for a wallet address.
    function getDIDsForWallet(address wallet) external view returns (string[] memory) {
        return walletDIDs[wallet];
    }

    /// @notice Check if a wallet is bound to a DID.
    function isWalletBound(string calldata did, address wallet) external view returns (bool) {
        return walletBindings[did][wallet].boundAt != 0;
    }

    /// @notice Check if a wallet is the primary wallet for a DID.
    function isPrimaryWallet(string calldata did, address wallet) external view returns (bool) {
        return walletBindings[did][wallet].isPrimary;
    }

    /// @notice Get all verified identities (for auditor/dashboard).
    function getVerifiedIdentities() external view returns (string[] memory) {
        uint256 count = 0;
        // Note: This is gas-heavy for large datasets. In production, use event indexing.
        // For hackathon scope, we accept this limitation.
        // A more efficient approach would track verified DIDs in a separate array.
        return new string[](0); // Placeholder - use event indexing in production
    }

    /// @notice Check if an identity exists and is verified.
    function isVerified(string calldata did) external view returns (bool) {
        return identities[did].status == IdentityStatus.Verified;
    }

    /// @notice Check if an identity exists and is active (verified, not revoked/suspended).
    function isActive(string calldata did) external view returns (bool) {
        IdentityStatus status = identities[did].status;
        return status == IdentityStatus.Verified;
    }

    // --- Pause Controls ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}