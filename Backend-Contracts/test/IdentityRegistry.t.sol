// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry public registry;

    address public immutable ADMIN = vm.addr(0x1);
    address public immutable MANAGER = vm.addr(0x2);
    address public immutable AUDITOR = vm.addr(0x3);
    address public immutable USER1 = vm.addr(0x4);
    address public immutable USER2 = vm.addr(0x5);
    address public immutable USER3 = vm.addr(0x6);
    address public immutable RANDOM = vm.addr(0x7);

    string public constant DID_1 = "did:sih:user-001";
    string public constant DID_2 = "did:sih:org-001";
    string public constant NAME_1 = "Alice Kumar";
    string public constant ORG_1 = "TechCorp";
    string public constant ROLE_1 = "Engineer";
    string public constant METADATA_URI = "ipfs://bafyIdentityMeta";

    function setUp() public {
        registry = new IdentityRegistry(ADMIN);

        vm.startPrank(ADMIN);
        registry.grantRole(registry.IDENTITY_MANAGER_ROLE(), MANAGER);
        registry.grantRole(registry.AUDITOR_ROLE(), AUDITOR);
        vm.stopPrank();

        vm.warp(1_700_000_000);
    }

    // --- Helpers ---

    function _createIdentity(string memory did, address primary, string memory name) internal {
        vm.prank(MANAGER);
        registry.createIdentity(did, primary, name, ORG_1, ROLE_1, METADATA_URI);
    }

    // --- Creation ---

    function test_CreateIdentity_SetsAllFields() public {
        _createIdentity(DID_1, USER1, NAME_1);

        IdentityRegistry.IdentityView memory view_ = registry.getIdentity(DID_1);
        assertTrue(view_.exists);
        assertEq(view_.did, DID_1);
        assertEq(view_.primaryWallet, USER1);
        assertEq(view_.wallets.length, 1);
        assertEq(view_.wallets[0], USER1);
        assertEq(uint8(view_.status), uint8(IdentityRegistry.IdentityStatus.Created));
        assertEq(view_.name, NAME_1);
        assertEq(view_.organization, ORG_1);
        assertEq(view_.role, ROLE_1);
        assertEq(view_.metadataURI, METADATA_URI);
        assertEq(view_.createdAt, 1_700_000_000);
        assertEq(view_.verifiedAt, 0);
        assertEq(view_.revokedAt, 0);
    }

    function test_CreateIdentity_EmitsEvents() public {
        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.IdentityCreated(DID_1, USER1, NAME_1, ORG_1, 1_700_000_000);

        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.WalletBound(DID_1, USER1, true, 1_700_000_000);

        _createIdentity(DID_1, USER1, NAME_1);
    }

    function test_RevertWhen_EmptyDID() public {
        vm.expectRevert(IdentityRegistry.EmptyDID.selector);
        vm.prank(MANAGER);
        registry.createIdentity("", USER1, NAME_1, ORG_1, ROLE_1, METADATA_URI);
    }

    function test_RevertWhen_ZeroPrimaryWallet() public {
        vm.expectRevert(IdentityRegistry.ZeroAddress.selector);
        vm.prank(MANAGER);
        registry.createIdentity(DID_1, address(0), NAME_1, ORG_1, ROLE_1, METADATA_URI);
    }

    function test_RevertWhen_EmptyName() public {
        vm.expectRevert(IdentityRegistry.EmptyName.selector);
        vm.prank(MANAGER);
        registry.createIdentity(DID_1, USER1, "", ORG_1, ROLE_1, METADATA_URI);
    }

    function test_RevertWhen_DIDAlreadyExists() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(IdentityRegistry.DIDAlreadyExists.selector);
        vm.prank(MANAGER);
        registry.createIdentity(DID_1, USER2, "Bob", ORG_1, ROLE_1, METADATA_URI);
    }

    function test_RevertWhen_NonManagerCreates() public {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, RANDOM, registry.IDENTITY_MANAGER_ROLE())
        );
        vm.prank(RANDOM);
        registry.createIdentity(DID_1, USER1, NAME_1, ORG_1, ROLE_1, METADATA_URI);
    }

    // --- Wallet Binding ---

    function test_BindWallet_AddsSecondaryWallet() public {
        _createIdentity(DID_1, USER1, NAME_1);

        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);

        IdentityRegistry.IdentityView memory view_ = registry.getIdentity(DID_1);
        assertEq(view_.wallets.length, 2);
        assertTrue(view_.wallets[0] == USER1 || view_.wallets[1] == USER1);
        assertTrue(view_.wallets[0] == USER2 || view_.wallets[1] == USER2);
        assertEq(view_.primaryWallet, USER1); // Unchanged

        string[] memory user2DIDs = registry.getDIDsForWallet(USER2);
        assertEq(user2DIDs.length, 1);
        assertEq(user2DIDs[0], DID_1);
    }

    function test_BindWallet_ChangesPrimary() public {
        _createIdentity(DID_1, USER1, NAME_1);

        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, true);

        IdentityRegistry.IdentityView memory view_ = registry.getIdentity(DID_1);
        assertEq(view_.primaryWallet, USER2);
        assertTrue(registry.isPrimaryWallet(DID_1, USER2));
        assertFalse(registry.isPrimaryWallet(DID_1, USER1));
    }

    function test_BindWallet_EmitsEvents() public {
        _createIdentity(DID_1, USER1, NAME_1);

        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.WalletBound(DID_1, USER2, false, 1_700_000_000);

        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);
    }

    function test_RevertWhen_BindWallet_AlreadyBound() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);

        vm.expectRevert(IdentityRegistry.WalletAlreadyBound.selector);
        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);
    }

    function test_RevertWhen_BindWallet_ZeroAddress() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(IdentityRegistry.ZeroAddress.selector);
        vm.prank(MANAGER);
        registry.bindWallet(DID_1, address(0), false);
    }

    function test_RevertWhen_BindWallet_DIDNotFound() public {
        vm.expectRevert(IdentityRegistry.DIDNotFound.selector);
        vm.prank(MANAGER);
        registry.bindWallet("did:sih:nonexistent", USER1, false);
    }

    function test_UnbindWallet_RemovesSecondary() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);

        vm.prank(MANAGER);
        registry.unbindWallet(DID_1, USER2);

        IdentityRegistry.IdentityView memory view_ = registry.getIdentity(DID_1);
        assertEq(view_.wallets.length, 1);
        assertEq(view_.wallets[0], USER1);

        string[] memory user2DIDs = registry.getDIDsForWallet(USER2);
        assertEq(user2DIDs.length, 0);
    }

    function test_RevertWhen_UnbindPrimaryWallet() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(IdentityRegistry.NotPrimaryWallet.selector);
        vm.prank(MANAGER);
        registry.unbindWallet(DID_1, USER1);
    }

    function test_RevertWhen_UnbindNotBound() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(IdentityRegistry.WalletNotBound.selector);
        vm.prank(MANAGER);
        registry.unbindWallet(DID_1, USER2);
    }

    function test_ChangePrimaryWallet_SwitchesPrimary() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);

        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.PrimaryWalletChanged(DID_1, USER1, USER2, 1_700_000_000);

        vm.prank(MANAGER);
        registry.changePrimaryWallet(DID_1, USER2);

        assertEq(registry.getIdentity(DID_1).primaryWallet, USER2);
        assertTrue(registry.isPrimaryWallet(DID_1, USER2));
        assertFalse(registry.isPrimaryWallet(DID_1, USER1));
    }

    function test_RevertWhen_ChangePrimary_NotBound() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(IdentityRegistry.WalletNotBound.selector);
        vm.prank(MANAGER);
        registry.changePrimaryWallet(DID_1, USER2);
    }

    // --- Verification ---

    function test_VerifyIdentity_ChangesStatus() public {
        _createIdentity(DID_1, USER1, NAME_1);
        assertEq(uint8(registry.getIdentity(DID_1).status), uint8(IdentityRegistry.IdentityStatus.Created));

        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);

        assertEq(uint8(registry.getIdentity(DID_1).status), uint8(IdentityRegistry.IdentityStatus.Verified));
        assertTrue(registry.isVerified(DID_1));
        assertTrue(registry.isActive(DID_1));
        assertGt(registry.getIdentity(DID_1).verifiedAt, 0);
    }

    function test_VerifyIdentity_EmitsEvents() public {
        _createIdentity(DID_1, USER1, NAME_1);

        vm.warp(1_700_000_000);

        // _changeStatus emits first, then IdentityVerified
        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.IdentityStatusChanged(DID_1, IdentityRegistry.IdentityStatus.Created, IdentityRegistry.IdentityStatus.Verified, 1_700_000_000);

        vm.expectEmit(true, true, false, true);
        emit IdentityRegistry.IdentityVerified(DID_1, MANAGER, 1_700_000_000);

        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);
    }

    function test_RevertWhen_VerifyRevoked() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);
        vm.prank(MANAGER);
        registry.revokeIdentity(DID_1);

        vm.expectRevert(IdentityRegistry.IdentityRevokedErr.selector);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);
    }

    function test_RevertWhen_VerifySuspended() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.suspendIdentity(DID_1);

        vm.expectRevert(IdentityRegistry.IdentitySuspendedErr.selector);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);
    }

    function test_RevertWhen_NonManagerVerifies() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, RANDOM, registry.IDENTITY_MANAGER_ROLE())
        );
        vm.prank(RANDOM);
        registry.verifyIdentity(DID_1);
    }

    // --- Revocation ---

    function test_RevokeIdentity_ChangesStatus() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);

        vm.prank(MANAGER);
        registry.revokeIdentity(DID_1);

        assertEq(uint8(registry.getIdentity(DID_1).status), uint8(IdentityRegistry.IdentityStatus.Revoked));
        assertFalse(registry.isVerified(DID_1));
        assertFalse(registry.isActive(DID_1));
        assertGt(registry.getIdentity(DID_1).revokedAt, 0);
    }

    function test_RevokeIdentity_Idempotent() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.revokeIdentity(DID_1);
        vm.prank(MANAGER);
        registry.revokeIdentity(DID_1); // Should not revert

        assertEq(uint8(registry.getIdentity(DID_1).status), uint8(IdentityRegistry.IdentityStatus.Revoked));
    }

    // --- Suspension ---

    function test_SuspendIdentity_ChangesStatus() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);

        vm.prank(MANAGER);
        registry.suspendIdentity(DID_1);

        assertEq(uint8(registry.getIdentity(DID_1).status), uint8(IdentityRegistry.IdentityStatus.Suspended));
        assertFalse(registry.isActive(DID_1));
    }

    function test_ReinstateIdentity_RestoresVerified() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);
        vm.prank(MANAGER);
        registry.suspendIdentity(DID_1);

        vm.prank(MANAGER);
        registry.reinstateIdentity(DID_1);

        assertEq(uint8(registry.getIdentity(DID_1).status), uint8(IdentityRegistry.IdentityStatus.Verified));
        assertTrue(registry.isActive(DID_1));
    }

    function test_RevertWhen_ReinstateNotSuspended() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.verifyIdentity(DID_1);

        vm.expectRevert(IdentityRegistry.InvalidStatusTransition.selector);
        vm.prank(MANAGER);
        registry.reinstateIdentity(DID_1);
    }

    // --- Metadata ---

    function test_UpdateMetadataURI_Updates() public {
        _createIdentity(DID_1, USER1, NAME_1);

        vm.prank(MANAGER);
        registry.updateMetadataURI(DID_1, "ipfs://newCID");

        assertEq(registry.getIdentity(DID_1).metadataURI, "ipfs://newCID");
    }

    function test_RevertWhen_UpdateMetadata_Empty() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.expectRevert(IdentityRegistry.MetadataURIRequired.selector);
        vm.prank(MANAGER);
        registry.updateMetadataURI(DID_1, "");
    }

    // --- Queries ---

    function test_GetIdentity_UnknownDID_ReturnsEmpty() public {
        IdentityRegistry.IdentityView memory view_ = registry.getIdentity("did:sih:unknown");
        assertFalse(view_.exists);
        assertEq(view_.did, "");
        assertEq(view_.primaryWallet, address(0));
    }

    function test_GetDIDsForWallet_ReturnsAll() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.createIdentity(DID_2, USER1, "TechCorp Identity", ORG_1, "Admin", METADATA_URI);

        string[] memory dids = registry.getDIDsForWallet(USER1);
        assertEq(dids.length, 2);
    }

    function test_IsWalletBound_ReturnsCorrect() public {
        _createIdentity(DID_1, USER1, NAME_1);
        assertTrue(registry.isWalletBound(DID_1, USER1));
        assertFalse(registry.isWalletBound(DID_1, USER2));
    }

    function test_IsPrimaryWallet_ReturnsCorrect() public {
        _createIdentity(DID_1, USER1, NAME_1);
        vm.prank(MANAGER);
        registry.bindWallet(DID_1, USER2, false);

        assertTrue(registry.isPrimaryWallet(DID_1, USER1));
        assertFalse(registry.isPrimaryWallet(DID_1, USER2));
    }

    // --- Pause ---

    function test_PauseBlocksCreation() public {
        vm.prank(ADMIN);
        registry.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(MANAGER);
        registry.createIdentity(DID_1, USER1, NAME_1, ORG_1, ROLE_1, METADATA_URI);
    }

    function test_UnpauseRestoresCreation() public {
        vm.startPrank(ADMIN);
        registry.pause();
        registry.unpause();
        vm.stopPrank();

        _createIdentity(DID_1, USER1, NAME_1);
        assertTrue(registry.getIdentity(DID_1).exists);
    }

    function test_RevertWhen_NonAdminPauses() public {
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, MANAGER, adminRole)
        );
        vm.prank(MANAGER);
        registry.pause();
    }

    // --- Deployment Guard ---

    function test_RevertWhen_DeployWithZeroAdmin() public {
        vm.expectRevert(IdentityRegistry.ZeroAddress.selector);
        new IdentityRegistry(address(0));
    }
}