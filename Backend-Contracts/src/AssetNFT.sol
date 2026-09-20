// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title AssetNFT
 * @notice Minimal NFT-based asset management for SIH platform.
 *         Uses ERC721 + manual URI storage + minimal role system.
 */
contract AssetNFT is ERC721 {
    // --- Roles ---
    bytes32 public constant ASSET_MANAGER_ROLE = keccak256("ASSET_MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");

    address public immutable _admin;
    mapping(bytes32 => mapping(address => bool)) public hasRole;
    mapping(bytes32 => bytes32) public roleAdmin;
    mapping(bytes32 => address[]) public roleMembers;

    // --- Types ---
    enum AssetType { Certificate, Document, Equipment, Device, License, Other }
    enum AssetStatus { None, Active, Transferred, Retired, Lost }

    struct Asset {
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
    uint256 public tokenCounter;
    mapping(uint256 => Asset) public assets;
    mapping(address => uint256[]) public ownerAssets;
    mapping(address => uint256[]) public assigneeAssets;
    mapping(string => uint256[]) public didAssets;
    mapping(uint256 => string) private _tokenURIs;
    bool public paused;

    // --- Errors ---
    error ZeroAddress();
    error EmptyMetadataURI();
    error AssetNotFound();
    error UnauthorizedTransfer();
    error InvalidAssetType();
    error InvalidStatusTransition();
    error NotOwnerOrManager();
    error EnforcedPause();

    // --- Events ---
    event AssetMinted(uint256 indexed tokenId, AssetType assetType, address indexed owner, address indexed assignee, string did, string metadataURI, uint48 timestamp);
    event AssetAssigned(uint256 indexed tokenId, address indexed fromAssignee, address indexed toAssignee, uint48 timestamp);
    event AssetTransferred(uint256 indexed tokenId, address indexed fromOwner, address indexed toOwner, uint48 timestamp);
    event AssetStatusChanged(uint256 indexed tokenId, AssetStatus oldStatus, AssetStatus newStatus, uint48 timestamp);
    event AssetMetadataUpdated(uint256 indexed tokenId, string metadataURI, uint48 timestamp);
    event AssetRetired(uint256 indexed tokenId, address indexed by, uint48 timestamp);
    event AssetReportedLost(uint256 indexed tokenId, address indexed by, uint48 timestamp);
    event RoleAssigned(bytes32 indexed role, address indexed account, address indexed by);
    event DebugAdminCheck(address indexed caller, address indexed adminVal);
    event RoleRemoved(bytes32 indexed role, address indexed account, address indexed by);
    event Paused(address by);
    event Unpaused(address by);

    // --- Constructor ---
    constructor(address initialAdmin) ERC721("SIH Asset", "SASSET") {
        _admin = initialAdmin;
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(ASSET_MANAGER_ROLE, initialAdmin);
    }

    // --- Role System ---
    function _grantRole(bytes32 role, address account) internal {
        if (!checkRole(role, account)) {
            hasRole[role][account] = true;
            roleMembers[role].push(account);
        }
    }

    function _revokeRole(bytes32 role, address account) internal {
        if (checkRole(role, account)) {
            hasRole[role][account] = false;
        }
    }

    function checkRole(bytes32 role, address account) public view returns (bool) {
        return hasRole[role][account];
    }

    function getMsgSender() external view returns (address) {
        return msg.sender;
    }

    function getRoleMember(bytes32 role, uint256 index) external view returns (address) {
        return roleMembers[role][index];
    }

    function getRoleMemberCount(bytes32 role) external view returns (uint256) {
        return roleMembers[role].length;
    }

    function checkAdmin() external view returns (address, address) {
        return (msg.sender, _admin);
    }

    function _getAdmin() internal view returns (address) {
        return _admin;
    }

    // --- Modifiers ---
    modifier onlyAdmin() {
        if (msg.sender != _getAdmin()) revert ZeroAddress();
        _;
    }

    modifier onlyRole(bytes32 role) {
        if (!checkRole(role, msg.sender)) revert ZeroAddress();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert EnforcedPause();
        _;
    }

    // --- Role Management ---
    function grantRole(bytes32 role, address account) external {
        if (msg.sender != _admin) {
            emit DebugAdminCheck(msg.sender, _admin);
            revert ZeroAddress();
        }
        if (account == address(0)) revert ZeroAddress();
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyAdmin {
        _revokeRole(role, account);
    }

    // --- Pause ---
    function pause() external onlyAdmin { paused = true; }
    function unpause() external onlyAdmin { paused = false; }

    // --- Minting ---
    function mintAsset(AssetType assetType, address owner_, address assignee, string calldata did, string calldata metadataURI) external onlyRole(ASSET_MANAGER_ROLE) whenNotPaused returns (uint256) {
        if (owner_ == address(0) || assignee == address(0)) revert ZeroAddress();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (uint256(assetType) > uint256(AssetType.Other)) revert InvalidAssetType();

        uint256 tokenId = tokenCounter++;
        assets[tokenId] = Asset({tokenId: tokenId, assetType: assetType, owner: owner_, assignee: assignee, did: did, metadataURI: metadataURI, status: AssetStatus.Active, createdAt: uint48(block.timestamp), updatedAt: uint48(block.timestamp)});
        ownerAssets[owner_].push(tokenId);
        assigneeAssets[assignee].push(tokenId);
        if (bytes(did).length > 0) didAssets[did].push(tokenId);
        _safeMint(owner_, tokenId);
        _tokenURIs[tokenId] = metadataURI;
        emit AssetMinted(tokenId, assetType, owner_, assignee, did, metadataURI, uint48(block.timestamp));
        return tokenId;
    }

    // --- Assignment ---
    function assignAsset(uint256 tokenId, address newAssignee) external onlyRole(ASSET_MANAGER_ROLE) whenNotPaused {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (newAssignee == address(0)) revert ZeroAddress();
        if (asset.assignee == newAssignee) return;
        address oldAssignee = asset.assignee;
        asset.assignee = newAssignee;
        asset.updatedAt = uint48(block.timestamp);
        _removeFromAssigneeAssets(oldAssignee, tokenId);
        assigneeAssets[newAssignee].push(tokenId);
        emit AssetAssigned(tokenId, oldAssignee, newAssignee, uint48(block.timestamp));
    }

    // --- Ownership Transfer ---
    function transferOwnership(uint256 tokenId, address newOwner) external whenNotPaused {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (newOwner == address(0)) revert ZeroAddress();
        if (asset.owner == newOwner) return;
        if (msg.sender != asset.owner && msg.sender != asset.assignee && !checkRole(ASSET_MANAGER_ROLE, msg.sender)) revert NotOwnerOrManager();
        address oldOwner = asset.owner;
        asset.owner = newOwner;
        asset.updatedAt = uint48(block.timestamp);
        _removeFromOwnerAssets(oldOwner, tokenId);
        ownerAssets[newOwner].push(tokenId);
        if (asset.assignee == oldOwner) {
            asset.assignee = newOwner;
            _removeFromAssigneeAssets(oldOwner, tokenId);
            assigneeAssets[newOwner].push(tokenId);
        }
        _transfer(oldOwner, newOwner, tokenId);
        emit AssetTransferred(tokenId, oldOwner, newOwner, uint48(block.timestamp));
    }

    // --- Status Management ---
    function updateStatus(uint256 tokenId, AssetStatus newStatus) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (asset.status == newStatus) return;
        _validateStatusTransition(asset.status, newStatus);
        AssetStatus oldStatus = asset.status;
        asset.status = newStatus;
        asset.updatedAt = uint48(block.timestamp);
        emit AssetStatusChanged(tokenId, oldStatus, newStatus, uint48(block.timestamp));
    }

    function _validateStatusTransition(AssetStatus from, AssetStatus to) internal view {
        if (from == AssetStatus.Active && to != AssetStatus.Transferred && to != AssetStatus.Retired && to != AssetStatus.Lost) revert InvalidStatusTransition();
        if (from == AssetStatus.Transferred && to != AssetStatus.Active && to != AssetStatus.Retired) revert InvalidStatusTransition();
        if (from == AssetStatus.Lost && to != AssetStatus.Active && to != AssetStatus.Retired) revert InvalidStatusTransition();
        if (from == AssetStatus.Retired || from == AssetStatus.None) revert InvalidStatusTransition();
    }

    // --- Metadata ---
    function updateMetadataURI(uint256 tokenId, string calldata metadataURI) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        asset.metadataURI = metadataURI;
        asset.updatedAt = uint48(block.timestamp);
        _tokenURIs[tokenId] = metadataURI;
        emit AssetMetadataUpdated(tokenId, metadataURI, uint48(block.timestamp));
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(assets[tokenId].status != AssetStatus.None, "ERC721Metadata: URI query for nonexistent token");
        return _tokenURIs[tokenId];
    }

    // --- Retire / Lost ---
    function retireAsset(uint256 tokenId) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (asset.status == AssetStatus.Retired) return;
        this.updateStatus(tokenId, AssetStatus.Retired);
        emit AssetRetired(tokenId, msg.sender, uint48(block.timestamp));
    }

    function reportLost(uint256 tokenId) external onlyRole(ASSET_MANAGER_ROLE) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        if (asset.status == AssetStatus.Lost) return;
        this.updateStatus(tokenId, AssetStatus.Lost);
        emit AssetReportedLost(tokenId, msg.sender, uint48(block.timestamp));
    }

    // --- Queries ---
    function getAsset(uint256 tokenId) external view returns (AssetView memory) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) return AssetView({exists:false, tokenId:0, assetType:AssetType.Other, owner:address(0), assignee:address(0), did:"", metadataURI:"", status:AssetStatus.None, createdAt:0, updatedAt:0});
        return AssetView({exists:true, tokenId:asset.tokenId, assetType:asset.assetType, owner:asset.owner, assignee:asset.assignee, did:asset.did, metadataURI:asset.metadataURI, status:asset.status, createdAt:asset.createdAt, updatedAt:asset.updatedAt});
    }
    function getOwnerAssets(address owner_) external view returns (uint256[] memory) { return ownerAssets[owner_]; }
    function getAssigneeAssets(address assignee) external view returns (uint256[] memory) { return assigneeAssets[assignee]; }
    function getDIDAssets(string calldata did) external view returns (uint256[] memory) { return didAssets[did]; }
    function totalAssets() external view returns (uint256) { return tokenCounter; }
    function isAssetManager() external view returns (bool) { return checkRole(ASSET_MANAGER_ROLE, msg.sender); }
    function isOwnerOrAssignee(uint256 tokenId) external view returns (bool) {
        Asset storage asset = assets[tokenId];
        if (asset.status == AssetStatus.None) revert AssetNotFound();
        return msg.sender == asset.owner || msg.sender == asset.assignee;
    }

    // --- Internal Helpers ---
    function _removeFromOwnerAssets(address owner_, uint256 tokenId) internal {
        uint256[] storage arr = ownerAssets[owner_];
        for (uint256 i = 0; i < arr.length; i++) { if (arr[i] == tokenId) { arr[i] = arr[arr.length - 1]; arr.pop(); break; } }
    }
    function _removeFromAssigneeAssets(address assignee, uint256 tokenId) internal {
        uint256[] storage arr = assigneeAssets[assignee];
        for (uint256 i = 0; i < arr.length; i++) { if (arr[i] == tokenId) { arr[i] = arr[arr.length - 1]; arr.pop(); break; } }
    }
}