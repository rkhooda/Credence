// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {CredentialVault} from "./CredentialVault.sol";
import {AssetNFT} from "./AssetNFT.sol";

/**
 * @title CredentialAssetBridge
 * @notice Bridge between CredentialVault and AssetNFT for document credentials.
 *         When a credential is issued, optionally mints a corresponding AssetNFT.
 *
 * @dev This contract acts as a coordinator:
 *      1. CredentialVault handles the credential lifecycle (issue, accept, revoke, verify)
 *      2. AssetNFT handles the asset ownership and transfer
 *      3. This bridge links them together for document-type assets
 *
 *      The bridge is optional - credentials can exist without assets, and assets
 *      can exist without credentials. But for document credentials, we create both.
 */
contract CredentialAssetBridge is AccessControlEnumerable, Pausable {
    // --- Roles ---
    bytes32 public constant BRIDGE_MANAGER_ROLE = keccak256("BRIDGE_MANAGER_ROLE");

    // --- Storage ---

    CredentialVault public immutable credentialVault;
    AssetNFT public immutable assetNFT;

    /// @notice Mapping: documentHash -> asset tokenId
    mapping(bytes32 => uint256) public credentialToAsset;
    /// @notice Existence bit keeps token 0 distinguishable from an unlinked credential.
    mapping(bytes32 => bool) public credentialAssetLinked;

    /// @notice Mapping: asset tokenId -> documentHash
    mapping(uint256 => bytes32) public assetToCredential;

    // --- Errors ---

    error ZeroAddress();
    error CredentialNotFound();
    error AssetNotFound();
    error AlreadyLinked();
    error NotLinked();
    error UnauthorizedBridge();
    error CredentialVaultMismatch();
    error AssetNFTMismatch();

    // --- Events ---

    event CredentialLinkedToAsset(
        bytes32 indexed documentHash,
        uint256 indexed tokenId,
        address indexed holder,
        uint48 timestamp
    );
    event AssetLinkedToCredential(
        uint256 indexed tokenId,
        bytes32 indexed documentHash,
        address indexed holder,
        uint48 timestamp
    );

    // --- Constructor ---

    constructor(
        address initialAdmin,
        CredentialVault _credentialVault,
        AssetNFT _assetNFT
    ) {
        if (initialAdmin == address(0)) revert ZeroAddress();
        if (address(_credentialVault) == address(0)) revert ZeroAddress();
        if (address(_assetNFT) == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(BRIDGE_MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _grantRole(BRIDGE_MANAGER_ROLE, initialAdmin);

        credentialVault = _credentialVault;
        assetNFT = _assetNFT;
    }

    // --- Bridge Operations ---

    /**
     * @notice Link an existing credential to a newly minted asset.
     * @param holder        The credential holder.
     * @param documentHash  The credential's document hash.
     * @param metadataURI   IPFS URI for the asset metadata.
     * @param assetType     The asset type (default: Document).
     * @return tokenId      The minted asset tokenId.
     */
    function linkCredentialToAsset(
        address holder,
        bytes32 documentHash,
        string calldata metadataURI,
        AssetNFT.AssetType assetType
    ) external onlyRole(BRIDGE_MANAGER_ROLE) whenNotPaused returns (uint256) {
        // Verify credential exists
        CredentialVault.CredentialView memory credView = credentialVault.verifyCredential(holder, documentHash);
        if (credView.status == CredentialVault.Status.None) revert CredentialNotFound();

        // Check not already linked
        if (credentialAssetLinked[documentHash]) revert AlreadyLinked();

        // Mint asset
        uint256 tokenId = assetNFT.mintAsset(
            assetType,
            holder,           // owner
            holder,           // assignee (initially same)
            "",               // DID - could be fetched from IdentityRegistry
            metadataURI
        );

        // Create bidirectional link
        credentialToAsset[documentHash] = tokenId;
        credentialAssetLinked[documentHash] = true;
        assetToCredential[tokenId] = documentHash;

        emit CredentialLinkedToAsset(documentHash, tokenId, holder, uint48(block.timestamp));
        return tokenId;
    }

    /**
     * @notice Link an existing asset to a credential (for pre-existing assets).
     * @param tokenId      The asset tokenId.
     * @param holder       The credential holder.
     * @param documentHash The credential's document hash.
     */
    function linkAssetToCredential(
        uint256 tokenId,
        address holder,
        bytes32 documentHash
    ) external onlyRole(BRIDGE_MANAGER_ROLE) {
        // Verify asset exists and is owned by holder
        AssetNFT.AssetView memory assetView = assetNFT.getAsset(tokenId);
        if (!assetView.exists) revert AssetNotFound();
        if (assetView.owner != holder) revert UnauthorizedBridge();

        // Verify credential exists
        CredentialVault.CredentialView memory credView = credentialVault.verifyCredential(holder, documentHash);
        if (credView.status == CredentialVault.Status.None) revert CredentialNotFound();

        // Check not already linked
        if (credentialAssetLinked[documentHash]) revert AlreadyLinked();
        if (assetToCredential[tokenId] != bytes32(0)) revert AlreadyLinked();

        // Create bidirectional link
        credentialToAsset[documentHash] = tokenId;
        credentialAssetLinked[documentHash] = true;
        assetToCredential[tokenId] = documentHash;

        emit AssetLinkedToCredential(tokenId, documentHash, holder, uint48(block.timestamp));
    }

    // --- Queries ---

    /// @notice Get asset tokenId for a credential.
    function getAssetForCredential(bytes32 documentHash) external view returns (uint256) {
        return credentialToAsset[documentHash];
    }

    /// @notice Get documentHash for an asset.
    function getCredentialForAsset(uint256 tokenId) external view returns (bytes32) {
        return assetToCredential[tokenId];
    }

    /// @notice Check if a credential is linked to an asset.
    function isCredentialLinked(bytes32 documentHash) external view returns (bool) {
        return credentialAssetLinked[documentHash];
    }

    /// @notice Check if an asset is linked to a credential.
    function isAssetLinked(uint256 tokenId) external view returns (bool) {
        return assetToCredential[tokenId] != bytes32(0);
    }

    /// @notice Get full credential + asset view.
    function getCredentialAssetView(address holder, bytes32 documentHash)
        external
        view
        returns (
            CredentialVault.CredentialView memory credView,
            AssetNFT.AssetView memory assetView,
            bool linked
        )
    {
        credView = credentialVault.verifyCredential(holder, documentHash);
        uint256 tokenId = credentialToAsset[documentHash];
        linked = credentialAssetLinked[documentHash];
        if (linked) {
            assetView = assetNFT.getAsset(tokenId);
        }
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
