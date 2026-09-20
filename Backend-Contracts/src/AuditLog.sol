// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {AssetNFT} from "./AssetNFT.sol";

/**
 * @title AuditLog
 * @notice Centralized audit logging for the SIH platform.
 *         Provides structured event emission and on-chain query capabilities.
 *
 * @dev This contract does NOT replace Solidity events - those are the source of truth.
 *      This contract provides:
 *      1. Structured event emission with consistent format
 *      2. On-chain index for efficient querying (complements event logs)
 *      3. Standardized action codes for filtering
 *      4. Actor/target correlation for audit trails
 *
 *      Events are still emitted via Solidity events for off-chain indexing.
 *      This contract's storage provides on-chain query capability for the auditor dashboard.
 */
contract AuditLog is AccessControlEnumerable, Pausable {
    // --- Roles ---
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // --- Types ---

    /// @notice Standardized action categories for filtering
    enum ActionCategory {
        // Identity actions
        IdentityCreated,
        IdentityVerified,
        IdentityRevoked,
        IdentitySuspended,
        IdentityReinstated,
        IdentityMetadataUpdated,
        WalletBound,
        WalletUnbound,
        PrimaryWalletChanged,

        // Role actions
        RoleGranted,
        RoleRevoked,
        PermissionGranted,
        PermissionRevoked,

        // Asset actions
        AssetMinted,
        AssetAssigned,
        AssetTransferred,
        AssetStatusChanged,
        AssetMetadataUpdated,
        AssetRetired,
        AssetReportedLost,

        // Credential actions
        CredentialIssued,
        CredentialAccepted,
        CredentialRejected,
        CredentialRevoked,
        CredentialReinstated,
        CredentialLinkedToAsset,

        // System actions
        SystemPaused,
        SystemUnpaused,
        ContractUpgraded
    }

    /// @notice Audit log entry
    struct AuditEntry {
        uint256 index;
        ActionCategory category;
        address actor;              // Who performed the action
        address target;             // Primary target address (if applicable)
        bytes32 targetHash;         // Target identifier (tokenId, documentHash, DID, etc.)
        string details;             // Human-readable details / JSON
        uint48 timestamp;
        uint256 blockNumber;
        bytes32 txHash;
    }

    /// @notice Filter parameters for queries
    struct QueryFilter {
        ActionCategory category;
        address actor;
        address target;
        bytes32 targetHash;
        uint48 fromTimestamp;
        uint48 toTimestamp;
        uint256 limit;
        uint256 offset;
    }

    // --- Storage ---

    /// @notice All audit entries (append-only)
    AuditEntry[] public entries;

    /// @notice Index: actor -> entry indices
    mapping(address => uint256[]) public actorIndex;

    /// @notice Index: target -> entry indices
    mapping(address => uint256[]) public targetIndex;

    /// @notice Index: category -> entry indices
    mapping(ActionCategory => uint256[]) public categoryIndex;

    /// @notice Index: targetHash -> entry indices
    mapping(bytes32 => uint256[]) public hashIndex;

    // --- Errors ---

    error ZeroAddress();
    error UnauthorizedAudit();
    error LogNotFound();

    // --- Events ---

    event AuditEntryCreated(
        uint256 indexed index,
        ActionCategory category,
        address indexed actor,
        address indexed target,
        bytes32 targetHash,
        uint48 timestamp
    );

    // --- Constructor ---

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(AUDITOR_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(AUDITOR_ROLE, initialAdmin);
    }

    // --- Log Creation ---

    /**
     * @notice Create an audit log entry.
     * @param category    The action category.
     * @param actor       The actor who performed the action.
     * @param target      The target address (address(0) if none).
     * @param targetHash  The target identifier (tokenId, documentHash, DID, etc.).
     * @param details     Human-readable details or JSON.
     */
    function log(
        ActionCategory category,
        address actor,
        address target,
        bytes32 targetHash,
        string memory details
    ) internal onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused returns (uint256) {
        uint256 index = entries.length;

        AuditEntry memory entry = AuditEntry({
            index: index,
            category: category,
            actor: actor,
            target: target,
            targetHash: targetHash,
            details: details,
            timestamp: uint48(block.timestamp),
            blockNumber: block.number,
            txHash: bytes32(block.prevrandao) // Using prevrandao as tx identifier proxy
        });

        entries.push(entry);

        // Update indexes
        actorIndex[actor].push(index);
        if (target != address(0)) targetIndex[target].push(index);
        categoryIndex[category].push(index);
        if (targetHash != bytes32(0)) hashIndex[targetHash].push(index);

        emit AuditEntryCreated(index, category, actor, target, targetHash, uint48(block.timestamp));

        return index;
    }

    // --- Convenience Logging Functions ---

    function logIdentityCreated(
        address actor,
        string calldata did,
        address wallet,
        string calldata name
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        log(
            ActionCategory.IdentityCreated,
            actor,
            wallet,
            keccak256(bytes(did)),
            string(abi.encodePacked("Created identity: ", name, " (", did, ")"))
        );
    }

    function logAssetMinted(
        address actor,
        uint256 tokenId,
        AssetNFT.AssetType assetType,
        address owner
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        log(
            ActionCategory.AssetMinted,
            actor,
            owner,
            bytes32(tokenId),
            string(abi.encodePacked("Minted asset #", Strings.toString(tokenId), " type: ", Strings.toString(uint256(assetType))))
        );
    }

    function logCredentialIssued(
        address actor,
        address holder,
        bytes32 documentHash,
        string calldata title
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        log(
            ActionCategory.CredentialIssued,
            actor,
            holder,
            documentHash,
            string(abi.encodePacked("Issued credential: ", title))
        );
    }

    // --- Queries ---

    /// @notice Get total number of audit entries.
    function totalEntries() external view returns (uint256) {
        return entries.length;
    }

    /// @notice Get audit entry by index.
    function getEntry(uint256 index) external view returns (AuditEntry memory) {
        if (index >= entries.length) revert LogNotFound();
        return entries[index];
    }

    /// @notice Get recent entries (up to limit).
    function getRecentEntries(uint256 limit, uint256 offset) external view returns (AuditEntry[] memory) {
        uint256 start = offset < entries.length ? offset : entries.length;
        uint256 end = (start + limit < entries.length) ? start + limit : entries.length;
        uint256 count = end - start;

        AuditEntry[] memory result = new AuditEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = entries[end - 1 - i]; // Reverse chronological
        }
        return result;
    }

    /// @notice Query entries by actor.
    function getEntriesByActor(address actor, uint256 limit, uint256 offset) external view returns (AuditEntry[] memory) {
        uint256[] storage indices = actorIndex[actor];
        return _getEntriesFromIndices(indices, limit, offset);
    }

    /// @notice Query entries by target address.
    function getEntriesByTarget(address target, uint256 limit, uint256 offset) external view returns (AuditEntry[] memory) {
        uint256[] storage indices = targetIndex[target];
        return _getEntriesFromIndices(indices, limit, offset);
    }

    /// @notice Query entries by category.
    function getEntriesByCategory(ActionCategory category, uint256 limit, uint256 offset) external view returns (AuditEntry[] memory) {
        uint256[] storage indices = categoryIndex[category];
        return _getEntriesFromIndices(indices, limit, offset);
    }

    /// @notice Query entries by target hash (documentHash, tokenId, DID).
    function getEntriesByHash(bytes32 targetHash, uint256 limit, uint256 offset) external view returns (AuditEntry[] memory) {
        uint256[] storage indices = hashIndex[targetHash];
        return _getEntriesFromIndices(indices, limit, offset);
    }

    /// @notice Advanced filtered query.
    function queryEntries(QueryFilter calldata filter) external view returns (AuditEntry[] memory) {
        // Determine which index to use (prefer most selective)
        uint256[] storage indices;
        if (filter.actor != address(0)) {
            indices = actorIndex[filter.actor];
        } else if (filter.target != address(0)) {
            indices = targetIndex[filter.target];
        } else if (filter.category != ActionCategory.IdentityCreated) { // 0 is valid, check if explicitly set
            // Can't easily detect if category was set, so use category index if actor/target not set
            indices = categoryIndex[filter.category];
        } else if (filter.targetHash != bytes32(0)) {
            indices = hashIndex[filter.targetHash];
        } else {
            // No filter - use all entries (expensive for large datasets)
            uint256[] memory allIndices = new uint256[](entries.length);
            for (uint256 i = 0; i < entries.length; i++) {
                allIndices[i] = i;
            }
            return _getFilteredEntriesFromIndicesMemory(allIndices, filter);
        }
    }

    function _getEntriesFromIndices(
        uint256[] storage indices,
        uint256 limit,
        uint256 offset
    ) internal view returns (AuditEntry[] memory) {
        uint256 start = offset < indices.length ? offset : indices.length;
        uint256 end = (start + limit < indices.length) ? start + limit : indices.length;
        uint256 count = end - start;

        AuditEntry[] memory result = new AuditEntry[](count);
        for (uint256 i = 0; i < count; i++) {
            // Reverse chronological (newest first)
            result[i] = entries[indices[indices.length - 1 - (start + i)]];
        }
        return result;
    }

    function _getFilteredEntriesFromIndices(
        uint256[] storage indices,
        QueryFilter calldata filter
    ) internal view returns (AuditEntry[] memory) {
        AuditEntry[] memory temp = new AuditEntry[](indices.length);
        uint256 count = 0;

        for (uint256 i = indices.length; i > 0; i--) {
            uint256 idx = indices[i - 1];
            AuditEntry storage entry = entries[idx];

            // Apply filters
            if (filter.actor != address(0) && entry.actor != filter.actor) continue;
            if (filter.target != address(0) && entry.target != filter.target) continue;
            if (filter.category != ActionCategory.IdentityCreated && entry.category != filter.category) continue;
            if (filter.targetHash != bytes32(0) && entry.targetHash != filter.targetHash) continue;
            if (filter.fromTimestamp != 0 && entry.timestamp < filter.fromTimestamp) continue;
            if (filter.toTimestamp != 0 && entry.timestamp > filter.toTimestamp) continue;

            temp[count] = entry;
            count++;

            if (filter.limit != 0 && count >= filter.limit + filter.offset) break;
        }

        uint256 start = filter.offset < count ? filter.offset : count;
        uint256 end = (filter.limit != 0 && start + filter.limit < count) ? start + filter.limit : count;
        uint256 resultCount = end - start;

        AuditEntry[] memory result = new AuditEntry[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = temp[start + i];
        }
        return result;
    }

    function _getFilteredEntriesFromIndicesMemory(
        uint256[] memory indices,
        QueryFilter calldata filter
    ) internal view returns (AuditEntry[] memory) {
        AuditEntry[] memory temp = new AuditEntry[](indices.length);
        uint256 count = 0;

        for (uint256 i = indices.length; i > 0; i--) {
            uint256 idx = indices[i - 1];
            AuditEntry storage entry = entries[idx];

            // Apply filters
            if (filter.actor != address(0) && entry.actor != filter.actor) continue;
            if (filter.target != address(0) && entry.target != filter.target) continue;
            if (filter.category != ActionCategory.IdentityCreated && entry.category != filter.category) continue;
            if (filter.targetHash != bytes32(0) && entry.targetHash != filter.targetHash) continue;
            if (filter.fromTimestamp != 0 && entry.timestamp < filter.fromTimestamp) continue;
            if (filter.toTimestamp != 0 && entry.timestamp > filter.toTimestamp) continue;

            temp[count] = entry;
            count++;

            if (filter.limit != 0 && count >= filter.limit + filter.offset) break;
        }

        uint256 start = filter.offset < count ? filter.offset : count;
        uint256 end = (filter.limit != 0 && start + filter.limit < count) ? start + filter.limit : count;
        uint256 resultCount = end - start;

        AuditEntry[] memory result = new AuditEntry[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = temp[start + i];
        }
        return result;
    }

    // --- Role Management ---

    function grantRole(bytes32 role, address account) public override(AccessControl, IAccessControl) onlyRole(DEFAULT_ADMIN_ROLE) {
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override(AccessControl, IAccessControl) onlyRole(DEFAULT_ADMIN_ROLE) {
        super.revokeRole(role, account);
    }

    // --- Pause ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}