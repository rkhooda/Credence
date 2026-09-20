// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title AssetNFT
 * @notice NFT-based asset management for the SIH platform.
 *         Supports multiple asset types with metadata, ownership, and transfer controls.
 *
 * @dev Asset types:
 *      - Certificate: Academic/professional certificates
 *      - Document: Encrypted documents (credential flow)
 *      - Equipment: Physical equipment/assets
 *      - Device: IoT/edge devices
 *      - License: Software/service licenses
 *      - Other: Generic assets
 *
 *      Each asset is an NFT with:
 *      - Unique tokenId (sequential)
 *      - AssetType classification
 *      - Owner (identity DID or wallet)
 *      - Assignee (current holder, may differ from owner)
 *      - Metadata URI (IPFS, encrypted for sensitive assets)
 *      - Status (Active, Transferred, Retired, Lost)
 *      - Created timestamp
 *
 *      Permissions (enforced via RolesAndPermissions):
 *      - MANAGER_ROLE: Mint, assign, transfer, update metadata
 *      - Owner/Assignee: Transfer (with authorization), view
 *      - AUDITOR_ROLE: Read all
 */
contract AssetNFT is ERC721URIStorage, AccessControlEnumerable, Pausable, Ownable {
    // --- Roles ---
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // --- Types ---

    /// @notice Asset classification types
    enum AssetType {
        Certificate,
        Document,
        Equipment,
        Device,
        License,
        Other
    }

    /// @notice Asset lifecycle status
    enum AssetStatus {
        None,       // Not minted
        Active,     // Normal active asset
        Transferred, // In transfer process
        Retired,    // Permanently retired
        Lost        // Reported lost/stolen
    }

    /// @notice On-chain asset record
    struct Asset {
        uint256 tokenId;
        AssetType assetType;
        address owner;           // Owner wallet (controls the asset)
        address assignee;        // Current assignee (may differ from owner)
        string did;              // Owner's DID (optional)
        string metadataURI;      // IPFS URI for metadata (encrypted for sensitive)
        AssetStatus status;
        uint48 createdAt;
        uint48 updatedAt;
    }

    /// @notice Flattened view for external queries
    struct AssetView {
        bool exists;
        uint256 tokenId;
        AssetType assetType;
        address owner;
        address assignee;
        string did;
        string metadataURI;
        AssetStatus status;
        uint48 createdAt;
        uint48 updatedAt;
    }

    // --- Storage ---

    /// @notice Token ID counter
    uint256 public tokenCounter;

    /// @notice Asset records by tokenId
    mapping(uint256 => Asset) public assets;

    /// @notice Reverse lookup: owner -> tokenIds
    mapping(address => uint256[]) public ownerAssets;

    /// @notice Reverse lookup: assignee -> tokenIds
    mapping(address => uint256[]) public assigneeAssets;

    /// @notice Reverse lookup: DID -> tokenIds
    mapping(string => uint256[]) public didAssets;

    // --- Errors ---

    error ZeroAddress();
    error EmptyMetadataURI();
    error EmptyDID();
    error AssetNotFound();
    error AssetAlreadyExists();
    error UnauthorizedTransfer();
    error UnauthorizedMint();
    error InvalidAssetType();
    error InvalidStatusTransition();
    error NotOwnerOrAssignee();
    error NotAssetManager();
    error TokenIdMismatch();

    // --- Events ---

    event AssetMinted(
        uint256 indexed tokenId,
        AssetType assetType,
        address indexed owner,
        address indexed assignee,
        string did,
        string metadataURI,
        uint48 timestamp
    );
    event AssetAssigned(
        uint256 indexed tokenId,
        address indexed fromAssignee,
        address indexed toAssignee,
        uint48 timestamp
    );
    event AssetTransferred(
        uint256 indexed tokenId,
        address indexed fromOwner,
        address indexed toOwner,
        uint48 timestamp
    );
    event AssetStatusChanged(
        uint256 indexed tokenId,
        AssetStatus oldStatus,
        AssetStatus newStatus,
        uint48 timestamp
    );
    event AssetMetadataUpdated(
        uint256 indexed tokenId,
        string metadataURI,
        uint48 timestamp
    );
    event AssetRetired(
        uint256 indexed tokenId,
        address indexed by,
        uint48 timestamp
    );
    event AssetReportedLost(
        uint256 indexed tokenId,
        address indexed by,
        uint48 timestamp
    );
    event RoleAssigned(bytes32 indexed role, address indexed account, address indexed by);
    event RoleRemoved(bytes32 indexed role, address indexed account, address indexed by);

    // --- Constructor ---

    constructor(address initialAdmin) ERC721("SIH Asset", "SASSET") Ownable(initialAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(ASSET_MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, DEFAULT_ADMIN_ROLE);

        // Grant initial admin the manager role
        _grantRole(ASSET_MANAGER_ROLE, initialAdmin);

        tokenCounter = 0;
    }

    // --- Minting ---

    /**
     * @notice Mint a new asset NFT.
     * @param assetType       Type of asset.
     * @param owner           Owner wallet address.
     * @param assignee        Initial assignee (can be same as owner).
     * @param did             Owner's DID (optional).
     * @param metadataURI     IPFS URI for encrypted metadata.
     * @return tokenId        The minted token ID.
     */
    function mintAsset(
        AssetType assetType,
        address owner,
        address assignee,
        string calldata did,
        string calldata metadataURI
    ) external onlyRole(ASSET_MANAGER_ROLE) whenNotPaused returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        if (assignee == address(0)) revert ZeroAddress();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (uint256(assetType) > uint256(AssetType.Other)) revert InvalidAssetType();

        uint256 tokenId = tokenCounter;
        tokenCounter++;

        assets[tokenId] = Asset({
            tokenId: tokenId,
            assetType: assetType,
            owner: owner,
            assignee: assignee,
            did: did,
            metadataURI: metadataURI,
            status: AssetStatus.Active,
            createdAt: uint48(block.timestamp),
            updatedAt: uint48(block.timestamp)
        });

        ownerAssets[owner].push(tokenId);
        assigneeAssets[assignee].push(tokenId);
        if (bytes(did).length > 0) {
            didAssets[did].push(tokenId);
        }

        _safeMint(owner, tokenId);
        _setTokenURI(tokenId, metadataURI);

        emit AssetMinted(tokenId, assetType, owner, assignee, did, metadataURI, uint48(block.timestamp));
        return tokenId;
    }

    // --- Assignment ---

    /**
     * @notice Assign asset to a new assignee (manager only).
     * @param tokenId     The asset token ID.
     * @param newAssignee The new assignee address.
     */
    function assignAsset(uint256 tokenId, address newAssignee) external onlyRole(ASSET_MANAGER_ROLE) whenNotPaused {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (newAssignee == address(0)) revert ZeroAddress();
        if (asset.assignee == newAssignee) return; // No change

        address oldAssignee = asset.assignee;
        asset.assignee = newAssignee;
        asset.updatedAt = uint48(block.timestamp);

        // Update assigneeAssets mapping
        _removeFromAssigneeAssets(oldAssignee, tokenId);
        assigneeAssets[newAssignee].push(tokenId);

        emit AssetAssigned(tokenId, oldAssignee, newAssignee, uint48(block.timestamp));
    }

    // --- Ownership Transfer ---

    /**
     * @notice Transfer asset ownership (owner or manager only).
     * @param tokenId    The asset token ID.
     * @param newOwner   The new owner address.
     */
    function transferOwnership(uint256 tokenId, address newOwner) external whenNotPaused {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (newOwner == address(0)) revert ZeroAddress();
        if (asset.owner == newOwner) return; // No change

        // Check authorization: owner, assignee, or manager
        bool isAuthorized = msg.sender == asset.owner || msg.sender == asset.assignee || hasRole(ASSET_MANAGER_ROLE, msg.sender);
        if (!isAuthorized) revert UnauthorizedTransfer();

        address oldOwner = asset.owner;
        asset.owner = newOwner;
        asset.updatedAt = uint48(block.timestamp);

        // Update ownerAssets mapping
        _removeFromOwnerAssets(oldOwner, tokenId);
        ownerAssets[newOwner].push(tokenId);

        // Also update assignee if assignee was the old owner
        if (asset.assignee == oldOwner) {
            asset.assignee = newOwner;
            _removeFromAssigneeAssets(oldOwner, tokenId);
            assigneeAssets[newOwner].push(tokenId);
        }

        // ERC721 transfer
        _transfer(oldOwner, newOwner, tokenId);

        emit AssetTransferred(tokenId, oldOwner, newOwner, uint48(block.timestamp));
    }

    // --- Status Management ---

    /**
     * @notice Update asset status (manager only).
     * @param tokenId    The asset token ID.
     * @param newStatus  The new status.
     */
    function updateStatus(uint256 tokenId, AssetStatus newStatus) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (asset.status == newStatus) return;

        // Validate transition
        _validateStatusTransition(asset.status, newStatus);

        AssetStatus oldStatus = asset.status;
        asset.status = newStatus;
        asset.updatedAt = uint48(block.timestamp);

        emit AssetStatusChanged(tokenId, oldStatus, newStatus, uint48(block.timestamp));
    }

    function _validateStatusTransition(AssetStatus from, AssetStatus to) internal view {
        // Define valid transitions
        if (from == AssetStatus.Active) {
            if (to != AssetStatus.Transferred && to != AssetStatus.Retired && to != AssetStatus.Lost) {
                revert InvalidStatusTransition();
            }
        } else if (from == AssetStatus.Transferred) {
            if (to != AssetStatus.Active && to != AssetStatus.Retired) {
                revert InvalidStatusTransition();
            }
        } else if (from == AssetStatus.Lost) {
            if (to != AssetStatus.Active && to != AssetStatus.Retired) {
                revert InvalidStatusTransition();
            }
        } else if (from == AssetStatus.Retired) {
            revert InvalidStatusTransition(); // Retired is terminal
        } else if (from == AssetStatus.None) {
            revert InvalidStatusTransition();
        }
    }

    // --- Metadata ---

    /**
     * @notice Update asset metadata URI (manager only).
     * @param tokenId     The asset token ID.
     * @param metadataURI New IPFS URI.
     */
    function updateMetadataURI(uint256 tokenId, string calldata metadataURI) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();

        asset.metadataURI = metadataURI;
        asset.updatedAt = uint48(block.timestamp);
        _setTokenURI(tokenId, metadataURI);

        emit AssetMetadataUpdated(tokenId, metadataURI, uint48(block.timestamp));
    }

    // --- Retire / Lost ---

    /**
     * @notice Retire an asset permanently (manager only).
     * @param tokenId The asset token ID.
     */
    function retireAsset(uint256 tokenId) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (asset.status == AssetStatus.Retired) return;

        this.updateStatus(tokenId, AssetStatus.Retired);
        emit AssetRetired(tokenId, msg.sender, uint48(block.timestamp));
    }

    /**
     * @notice Report an asset as lost (manager only).
     * @param tokenId The asset token ID.
     */
    function reportLost(uint256 tokenId) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (asset.status == AssetStatus.Lost) return;

        this.updateStatus(tokenId, AssetStatus.Lost);
        emit AssetReportedLost(tokenId, msg.sender, uint48(block.timestamp));
    }

    // --- Role Management ---

    function grantRole(bytes32 role, address account) public override(AccessControl, IAccessControl) onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        super.grantRole(role, account);
        emit RoleAssigned(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) public override(AccessControl, IAccessControl) onlyOwner {
        super.revokeRole(role, account);
        emit RoleRemoved(role, account, msg.sender);
    }

    // --- Pause ---

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- Queries ---

    /// @notice Get asset view by tokenId.
    function getAsset(uint256 tokenId) external view returns (AssetView memory) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) {
            return AssetView({exists: false, tokenId: 0, assetType: AssetType.Other, owner: address(0), assignee: address(0), did: "", metadataURI: "", status: AssetStatus.None, createdAt: 0, updatedAt: 0});
        }
        return AssetView({
            exists: true,
            tokenId: asset.tokenId,
            assetType: asset.assetType,
            owner: asset.owner,
            assignee: asset.assignee,
            did: asset.did,
            metadataURI: asset.metadataURI,
            status: asset.status,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt
        });
    }

    /// @notice Get all asset tokenIds for an owner.
    function getOwnerAssets(address owner) external view returns (uint256[] memory) {
        return ownerAssets[owner];
    }

    /// @notice Get all asset tokenIds for an assignee.
    function getAssigneeAssets(address assignee) external view returns (uint256[] memory) {
        return assigneeAssets[assignee];
    }

    /// @notice Get all asset tokenIds for a DID.
    function getDIDAssets(string calldata did) external view returns (uint256[] memory) {
        return didAssets[did];
    }

    /// @notice Get total number of minted assets.
    function totalAssets() external view returns (uint256) {
        return tokenCounter;
    }

    /// @notice Check if caller is asset manager.
    function isAssetManager() external view returns (bool) {
        return hasRole(ASSET_MANAGER_ROLE, msg.sender);
    }

    /// @notice Check if caller owns or is assigned an asset.
    function isOwnerOrAssignee(uint256 tokenId) external view returns (bool) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        return msg.sender == asset.owner || msg.sender == asset.assignee;
    }

    // --- ERC721 Overrides ---

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return super.tokenURI(tokenId);
    }

    // --- Internal Helpers ---

    function _removeFromOwnerAssets(address owner, uint256 tokenId) internal {
        uint256[] storage arr = ownerAssets[owner];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == tokenId) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
    }

    function _removeFromAssigneeAssets(address assignee, uint256 tokenId) internal {
        uint256[] storage arr = assigneeAssets[assignee];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == tokenId) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
    }

    // --- Deployment Guards ---

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, AccessControlEnumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}