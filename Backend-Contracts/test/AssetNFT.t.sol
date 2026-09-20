// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AssetNFT} from "../src/AssetNFT.sol";

contract AssetNFTTest is Test {
    AssetNFT public assetNFT;

    address public immutable ADMIN = vm.addr(0x1);
    address public immutable MANAGER = vm.addr(0x2);
    address public immutable AUDITOR = vm.addr(0x3);
    address public immutable OWNER1 = vm.addr(0x4);
    address public immutable OWNER2 = vm.addr(0x5);
    address public immutable ASSIGNEE1 = vm.addr(0x6);
    address public immutable ASSIGNEE2 = vm.addr(0x7);
    address public immutable RANDOM = vm.addr(0x8);

    string public constant METADATA_URI = "ipfs://bafyAssetMeta";
    string public constant DID_1 = "did:sih:owner-001";
    string public constant DID_2 = "did:sih:owner-002";

    function setUp() public {
        assetNFT = new AssetNFT(ADMIN);

        // Grant manager role to MANAGER
        bytes32 managerRole = assetNFT.ASSET_MANAGER_ROLE();
        bytes32 auditorRole = assetNFT.AUDITOR_ROLE();
        vm.prank(ADMIN);
        assetNFT.grantRole(managerRole, MANAGER);
        vm.prank(ADMIN);
        assetNFT.grantRole(auditorRole, AUDITOR);

        vm.warp(1_700_000_000);
    }

    // --- Helpers ---

    function _mintCertificate(address owner, address assignee) internal returns (uint256) {
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        return assetNFT.mintAsset(AssetNFT.AssetType.Certificate, owner, assignee, DID_1, METADATA_URI);
    }

    function _mintEquipment(address owner, address assignee) internal returns (uint256) {
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        return assetNFT.mintAsset(AssetNFT.AssetType.Equipment, owner, assignee, DID_1, METADATA_URI);
    }

    // --- Minting ---

    function test_MintCertificate_CreatesAsset() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        assertEq(tokenId, 0);
        assertEq(assetNFT.totalAssets(), 1);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertTrue(view_.exists);
        assertEq(view_.tokenId, tokenId);
        assertEq(uint8(view_.assetType), uint8(AssetNFT.AssetType.Certificate));
        assertEq(view_.owner, OWNER1);
        assertEq(view_.assignee, ASSIGNEE1);
        assertEq(view_.did, DID_1);
        assertEq(view_.metadataURI, METADATA_URI);
        assertEq(uint8(view_.status), uint8(AssetNFT.AssetStatus.Active));
        assertEq(view_.createdAt, 1_700_000_000);
    }

    function test_MintMultipleAssets_IncrementsTokenId() public {
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Document, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Equipment, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Device, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.License, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Other, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);

        assertEq(assetNFT.totalAssets(), 6);
    }

    function test_RevertWhen_MintZeroOwner() public {
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, address(0), ASSIGNEE1, DID_1, METADATA_URI);
    }

    function test_RevertWhen_MintZeroAssignee() public {
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, OWNER1, address(0), DID_1, METADATA_URI);
    }

    function test_RevertWhen_MintEmptyMetadata() public {
        vm.expectRevert(AssetNFT.EmptyMetadataURI.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, OWNER1, ASSIGNEE1, DID_1, "");
    }

    function test_RevertWhen_MintInvalidAssetType() public {
        vm.expectRevert(AssetNFT.InvalidAssetType.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType(uint8(99)), OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
    }

    function test_RevertWhen_NonManagerMints() public {
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(RANDOM);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
    }

    function test_Mint_EmitsEvent() public {
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);

        vm.expectEmit(true, true, true, true);
        emit AssetNFT.AssetMinted(0, AssetNFT.AssetType.Certificate, OWNER1, ASSIGNEE1, DID_1, METADATA_URI, 1_700_000_000);
    }

    function test_Mint_UpdatesMappings() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        uint256[] memory ownerAssets = assetNFT.getOwnerAssets(OWNER1);
        assertEq(ownerAssets.length, 1);
        assertEq(ownerAssets[0], tokenId);

        uint256[] memory assigneeAssets = assetNFT.getAssigneeAssets(ASSIGNEE1);
        assertEq(assigneeAssets.length, 1);
        assertEq(assigneeAssets[0], tokenId);

        uint256[] memory didAssets = assetNFT.getDIDAssets(DID_1);
        assertEq(didAssets.length, 1);
        assertEq(didAssets[0], tokenId);
    }

    // --- Assignment ---

    function test_AssignAsset_ChangesAssignee() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.assignAsset(tokenId, ASSIGNEE2);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(view_.assignee, ASSIGNEE2);

        uint256[] memory oldAssigneeAssets = assetNFT.getAssigneeAssets(ASSIGNEE1);
        assertEq(oldAssigneeAssets.length, 0);

        uint256[] memory newAssigneeAssets = assetNFT.getAssigneeAssets(ASSIGNEE2);
        assertEq(newAssigneeAssets.length, 1);
        assertEq(newAssigneeAssets[0], tokenId);
    }

    function test_AssignAsset_EmitsEvent() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.assignAsset(tokenId, ASSIGNEE2);

        vm.expectEmit(true, true, true, true);
        emit AssetNFT.AssetAssigned(tokenId, ASSIGNEE1, ASSIGNEE2, 1_700_000_000);
    }

    function test_RevertWhen_AssignNotFound() public {
        vm.expectRevert(AssetNFT.AssetNotFound.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.assignAsset(999, ASSIGNEE2);
    }

    function test_RevertWhen_AssignZeroAddress() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.assignAsset(tokenId, address(0));
    }

    function test_RevertWhen_NonManagerAssigns() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(RANDOM);
        assetNFT.assignAsset(tokenId, ASSIGNEE2);
    }

    // --- Ownership Transfer ---

    function test_TransferOwnership_ByOwner() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        vm.prank(OWNER1);
        assetNFT.transferOwnership(tokenId, OWNER2);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(view_.owner, OWNER2);
        assertEq(view_.assignee, ASSIGNEE1);
    }

    function test_TransferOwnership_ByAssignee() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        vm.prank(ASSIGNEE1);
        assetNFT.transferOwnership(tokenId, OWNER2);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(view_.owner, OWNER2);
    }

    function test_TransferOwnership_ByManager() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.transferOwnership(tokenId, OWNER2);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(view_.owner, OWNER2);
    }

    function test_TransferOwnership_UpdatesMappings() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        vm.prank(OWNER1);
        assetNFT.transferOwnership(tokenId, OWNER2);

        uint256[] memory oldOwnerAssets = assetNFT.getOwnerAssets(OWNER1);
        assertEq(oldOwnerAssets.length, 0);

        uint256[] memory newOwnerAssets = assetNFT.getOwnerAssets(OWNER2);
        assertEq(newOwnerAssets.length, 1);
        assertEq(newOwnerAssets[0], tokenId);
    }

    function test_TransferOwnership_UpdatesAssigneeIfOwner() public {
        uint256 tokenId = _mintCertificate(OWNER1, OWNER1);

        vm.prank(OWNER1);
        assetNFT.transferOwnership(tokenId, OWNER2);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(view_.owner, OWNER2);
        assertEq(view_.assignee, OWNER2);
    }

    function test_TransferOwnership_EmitsEvent() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        vm.expectEmit(true, true, true, true);
        emit AssetNFT.AssetTransferred(tokenId, OWNER1, OWNER2, 1_700_000_000);

        vm.prank(OWNER1);
        assetNFT.transferOwnership(tokenId, OWNER2);
    }

    function test_RevertWhen_TransferNotFound() public {
        vm.expectRevert(AssetNFT.AssetNotFound.selector);
        vm.prank(OWNER1);
        assetNFT.transferOwnership(999, OWNER2);
    }

    function test_RevertWhen_TransferZeroAddress() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        vm.prank(OWNER1);
        assetNFT.transferOwnership(tokenId, address(0));
    }

    function test_RevertWhen_TransferUnauthorized() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        vm.expectRevert(AssetNFT.NotOwnerOrManager.selector);
        vm.prank(RANDOM);
        assetNFT.transferOwnership(tokenId, OWNER2);
    }

    // --- Status Management ---

    function test_UpdateStatus_ActiveToRetired() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Retired);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(uint8(view_.status), uint8(AssetNFT.AssetStatus.Retired));
    }

    function test_UpdateStatus_ActiveToLost() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Lost);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(uint8(view_.status), uint8(AssetNFT.AssetStatus.Lost));
    }

    function test_UpdateStatus_LostToActive() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.startPrank(MANAGER);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Lost);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Active);
        vm.stopPrank();

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(uint8(view_.status), uint8(AssetNFT.AssetStatus.Active));
    }

    function test_UpdateStatus_EmitsEvent() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Retired);

        vm.expectEmit(true, true, true, true);
        emit AssetNFT.AssetStatusChanged(tokenId, AssetNFT.AssetStatus.Active, AssetNFT.AssetStatus.Retired, 1_700_000_000);
    }

    function test_RevertWhen_InvalidStatusTransition() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.startPrank(MANAGER);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Retired);
        vm.stopPrank();

        vm.expectRevert(AssetNFT.InvalidStatusTransition.selector);
        vm.prank(MANAGER);
        assetNFT.updateStatus(tokenId, AssetNFT.AssetStatus.Active);
    }

    function test_RevertWhen_StatusNotFound() public {
        vm.expectRevert(AssetNFT.AssetNotFound.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.updateStatus(999, AssetNFT.AssetStatus.Retired);
    }

    // --- Retire / Lost ---

    function test_RetireAsset_SetsRetired() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.retireAsset(tokenId);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(uint8(view_.status), uint8(AssetNFT.AssetStatus.Retired));
    }

    function test_ReportLost_SetsLost() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.reportLost(tokenId);

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(uint8(view_.status), uint8(AssetNFT.AssetStatus.Lost));
    }

    // --- Metadata Update ---

    function test_UpdateMetadataURI_Updates() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.updateMetadataURI(tokenId, "ipfs://newMeta");

        AssetNFT.AssetView memory view_ = assetNFT.getAsset(tokenId);
        assertEq(view_.metadataURI, "ipfs://newMeta");
    }

    function test_RevertWhen_UpdateMetadataEmpty() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        vm.expectRevert(AssetNFT.EmptyMetadataURI.selector);
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(MANAGER);
        assetNFT.updateMetadataURI(tokenId, "");
    }

    // --- Queries ---

    function test_GetAsset_UnknownTokenId_ReturnsEmpty() public {
        AssetNFT.AssetView memory view_ = assetNFT.getAsset(999);
        assertFalse(view_.exists);
    }

    function test_GetOwnerAssets_ReturnsCorrect() public {
        uint256 id1 = _mintCertificate(OWNER1, ASSIGNEE1);
        uint256 id2 = _mintEquipment(OWNER1, ASSIGNEE1);
        uint256 id3 = _mintCertificate(OWNER2, ASSIGNEE2);

        uint256[] memory assets1 = assetNFT.getOwnerAssets(OWNER1);
        assertEq(assets1.length, 2);

        uint256[] memory assets2 = assetNFT.getOwnerAssets(OWNER2);
        assertEq(assets2.length, 1);
    }

    function test_GetAssigneeAssets_ReturnsCorrect() public {
        uint256 id1 = _mintCertificate(OWNER1, ASSIGNEE1);
        uint256 id2 = _mintCertificate(OWNER1, ASSIGNEE2);

        uint256[] memory assets1 = assetNFT.getAssigneeAssets(ASSIGNEE1);
        assertEq(assets1.length, 1);

        uint256[] memory assets2 = assetNFT.getAssigneeAssets(ASSIGNEE2);
        assertEq(assets2.length, 1);
    }

    function test_GetDIDAssets_ReturnsCorrect() public {
        _mintCertificate(OWNER1, ASSIGNEE1);
        _mintCertificate(OWNER2, ASSIGNEE1);

        uint256[] memory didAssets = assetNFT.getDIDAssets(DID_1);
        assertEq(didAssets.length, 2);
    }

    function test_IsAssetManager_ReturnsCorrect() public {
        vm.prank(ADMIN);
        assertTrue(assetNFT.isAssetManager());

        vm.prank(MANAGER);
        assertTrue(assetNFT.isAssetManager());

        vm.prank(OWNER1);
        assertFalse(assetNFT.isAssetManager());
    }

    function test_IsOwnerOrAssignee_ReturnsCorrect() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);

        vm.prank(OWNER1);
        assertTrue(assetNFT.isOwnerOrAssignee(tokenId));

        vm.prank(ASSIGNEE1);
        assertTrue(assetNFT.isOwnerOrAssignee(tokenId));

        vm.prank(RANDOM);
        assertFalse(assetNFT.isOwnerOrAssignee(tokenId));
    }

    // --- Pause ---

    function test_PauseBlocksMinting() public {
        bytes32 role = assetNFT.ASSET_MANAGER_ROLE();
        vm.prank(ADMIN);
        assetNFT.pause();

        vm.expectRevert(AssetNFT.EnforcedPause.selector);
        vm.prank(MANAGER);
        assetNFT.mintAsset(AssetNFT.AssetType.Certificate, OWNER1, ASSIGNEE1, DID_1, METADATA_URI);
    }

    function test_UnpauseRestoresMinting() public {
        vm.startPrank(ADMIN);
        assetNFT.pause();
        assetNFT.unpause();
        vm.stopPrank();

        _mintCertificate(OWNER1, ASSIGNEE1);
        assertEq(assetNFT.totalAssets(), 1);
    }

    function test_RevertWhen_NonAdminPauses() public {
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        vm.prank(MANAGER);
        assetNFT.pause();
    }

    // --- ERC721 Basics ---

    function test_OwnerOf_ReturnsOwner() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        assertEq(assetNFT.ownerOf(tokenId), OWNER1);
    }

    function test_TokenURI_ReturnsMetadataURI() public {
        uint256 tokenId = _mintCertificate(OWNER1, ASSIGNEE1);
        assertEq(assetNFT.tokenURI(tokenId), METADATA_URI);
    }

    function test_BalanceOf_ReturnsCorrect() public {
        _mintCertificate(OWNER1, ASSIGNEE1);
        _mintCertificate(OWNER1, ASSIGNEE1);
        _mintCertificate(OWNER2, ASSIGNEE2);

        assertEq(assetNFT.balanceOf(OWNER1), 2);
        assertEq(assetNFT.balanceOf(OWNER2), 1);
    }

    // --- Deployment Guards ---

    function test_RevertWhen_DeployWithZeroAdmin() public {
        vm.expectRevert(AssetNFT.ZeroAddress.selector);
        new AssetNFT(address(0));
    }
}