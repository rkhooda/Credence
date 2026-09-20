// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {RolesAndPermissions} from "../src/RolesAndPermissions.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract RolesAndPermissionsTest is Test {
    RolesAndPermissions public roles;

    address public immutable ADMIN = vm.addr(0x1);
    address public immutable MANAGER = vm.addr(0x2);
    address public immutable AUDITOR = vm.addr(0x3);
    address public immutable USER1 = vm.addr(0x4);
    address public immutable USER2 = vm.addr(0x5);
    address public immutable RANDOM = vm.addr(0x6);

    bytes32 constant DEFAULT_ADMIN_ROLE = keccak256("DEFAULT_ADMIN_ROLE");

    function setUp() public {
        roles = new RolesAndPermissions(ADMIN);

        vm.startPrank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), MANAGER);
        roles.grantRole(roles.AUDITOR_ROLE(), AUDITOR);
        vm.stopPrank();
    }

    // --- Permission Matrix Tests ---

    function test_AdminHasAllPermissions() public {
        for (uint256 i = 0; i < 16; i++) {
            RolesAndPermissions.Permission perm = RolesAndPermissions.Permission(i);
            assertTrue(roles.hasPermission(DEFAULT_ADMIN_ROLE, perm), "Admin should have all permissions");
        }
    }

    function test_ManagerHasOperationalPermissions() public {
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.IdentityCreate));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.IdentityVerify));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.IdentityRevoke));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.IdentitySuspend));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.IdentityUpdateMetadata));

        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetMint));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetAssign));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetTransfer));
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetUpdateMetadata));

        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.SystemUnpause));
    }

    function test_ManagerLacksAdminPermissions() public {
        assertFalse(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.RoleGrant));
        assertFalse(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.RoleRevoke));
        assertFalse(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.SystemPause));
        assertFalse(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetBurn));
        assertFalse(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetForceTransfer));
    }

    function test_AuditorHasReadOnlyPermissions() public {
        assertTrue(roles.hasPermission(roles.AUDITOR_ROLE(), RolesAndPermissions.Permission.AuditReadAll));

        assertFalse(roles.hasPermission(roles.AUDITOR_ROLE(), RolesAndPermissions.Permission.IdentityCreate));
        assertFalse(roles.hasPermission(roles.AUDITOR_ROLE(), RolesAndPermissions.Permission.AssetMint));
        assertFalse(roles.hasPermission(roles.AUDITOR_ROLE(), RolesAndPermissions.Permission.RoleGrant));
    }

    function test_UserHasNoSpecialPermissions() public {
        bytes32 userRole = bytes32(0);
        for (uint256 i = 0; i < 16; i++) {
            RolesAndPermissions.Permission perm = RolesAndPermissions.Permission(i);
            assertFalse(roles.hasPermission(userRole, perm), "User should not have special permissions");
        }
    }

    // --- Role Management ---

    function test_AdminCanGrantManagerRole() public {
        vm.prank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), USER1);
        assertTrue(roles.hasRole(roles.MANAGER_ROLE(), USER1));
    }

    function test_AdminCanGrantAuditorRole() public {
        vm.prank(ADMIN);
        roles.grantRole(roles.AUDITOR_ROLE(), USER1);
        assertTrue(roles.hasRole(roles.AUDITOR_ROLE(), USER1));
    }

    function test_AdminCanRevokeRole() public {
        vm.startPrank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), USER1);
        assertTrue(roles.hasRole(roles.MANAGER_ROLE(), USER1));

        roles.revokeRole(roles.MANAGER_ROLE(), USER1);
        assertFalse(roles.hasRole(roles.MANAGER_ROLE(), USER1));
        vm.stopPrank();
    }

    function test_GrantRole_EmitsRoleAssignedEvent() public {
        vm.expectEmit(true, true, false, true);
        emit RolesAndPermissions.RoleAssigned(roles.MANAGER_ROLE(), USER1, ADMIN);

        vm.prank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), USER1);
    }

    function test_RevokeRole_EmitsRoleRemovedEvent() public {
        vm.startPrank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), USER1);
        vm.stopPrank();

        vm.expectEmit(true, true, false, true);
        emit RolesAndPermissions.RoleRemoved(roles.MANAGER_ROLE(), USER1, ADMIN);

        vm.prank(ADMIN);
        roles.revokeRole(roles.MANAGER_ROLE(), USER1);
    }

    function test_RevertWhen_GrantingToZeroAddress() public {
        vm.expectRevert(RolesAndPermissions.ZeroAddress.selector);
        vm.prank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), address(0));
    }

    function test_RevertWhen_GrantingUnsupportedRole() public {
        vm.expectRevert(RolesAndPermissions.RoleNotSupported.selector);
        vm.prank(ADMIN);
        roles.grantRole(keccak256("UNSUPPORTED_ROLE"), USER1);
    }

    function test_RevertWhen_RevokeUnsupportedRole() public {
        vm.expectRevert(RolesAndPermissions.RoleNotSupported.selector);
        vm.prank(ADMIN);
        roles.revokeRole(keccak256("UNSUPPORTED_ROLE"), USER1);
    }

    // --- Role Queries ---

    function test_GetRoleMembers_ReturnsCorrectMembers() public {
        vm.startPrank(ADMIN);
        roles.grantRole(roles.MANAGER_ROLE(), USER1);
        roles.grantRole(roles.MANAGER_ROLE(), USER2);
        vm.stopPrank();

        address[] memory managers = roles.getRoleMembers(roles.MANAGER_ROLE());
        assertEq(managers.length, 3);
    }

    function test_GetRolePermissions_ReturnsMatrix() public {
        bool[16] memory perms = roles.getRolePermissions(roles.MANAGER_ROLE());
        assertTrue(perms[uint256(RolesAndPermissions.Permission.IdentityCreate)]);
        assertTrue(perms[uint256(RolesAndPermissions.Permission.AssetMint)]);
        assertFalse(perms[uint256(RolesAndPermissions.Permission.RoleGrant)]);
    }

    function test_IsAtLeastManager_ReturnsCorrect() public {
        vm.prank(ADMIN);
        assertTrue(roles.isAtLeastManager());

        vm.prank(MANAGER);
        assertTrue(roles.isAtLeastManager());

        vm.prank(AUDITOR);
        assertFalse(roles.isAtLeastManager());

        vm.prank(USER1);
        assertFalse(roles.isAtLeastManager());
    }

    function test_IsAtLeastAuditor_ReturnsCorrect() public {
        vm.prank(ADMIN);
        assertTrue(roles.isAtLeastAuditor());

        vm.prank(MANAGER);
        assertTrue(roles.isAtLeastAuditor());

        vm.prank(AUDITOR);
        assertTrue(roles.isAtLeastAuditor());

        vm.prank(USER1);
        assertFalse(roles.isAtLeastAuditor());
    }

    function test_IsAdmin_ReturnsCorrect() public {
        vm.prank(ADMIN);
        assertTrue(roles.isAdmin());

        vm.prank(MANAGER);
        assertFalse(roles.isAdmin());

        vm.prank(AUDITOR);
        assertFalse(roles.isAdmin());

        vm.prank(USER1);
        assertFalse(roles.isAdmin());
    }

    function test_GetCallerRoleName_ReturnsCorrect() public {
        vm.prank(ADMIN);
        assertEq(roles.getCallerRoleName(), "Admin");

        vm.prank(MANAGER);
        assertEq(roles.getCallerRoleName(), "Manager");

        vm.prank(AUDITOR);
        assertEq(roles.getCallerRoleName(), "Auditor");

        vm.prank(USER1);
        assertEq(roles.getCallerRoleName(), "User");
    }

    // --- Pause/Unpause ---

    function test_AdminCanPause() public {
        vm.prank(ADMIN);
        roles.pause();
        assertTrue(roles.paused());
    }

    function test_AdminCanUnpause() public {
        vm.startPrank(ADMIN);
        roles.pause();
        roles.unpause();
        vm.stopPrank();
        assertFalse(roles.paused());
    }

    function test_ManagerCanUnpause() public {
        vm.startPrank(ADMIN);
        roles.pause();
        vm.stopPrank();

        vm.prank(MANAGER);
        roles.unpause();
        assertFalse(roles.paused());
    }

    function test_RevertWhen_ManagerPauses() public {
        vm.expectRevert(RolesAndPermissions.PermissionDenied.selector);
        vm.prank(MANAGER);
        roles.pause();
    }

    function test_RevertWhen_AuditorUnpauses() public {
        vm.startPrank(ADMIN);
        roles.pause();
        vm.stopPrank();

        vm.expectRevert(RolesAndPermissions.PermissionDenied.selector);
        vm.prank(AUDITOR);
        roles.unpause();
    }

    // --- Permission Configuration ---

    function test_AdminCanGrantPermissionToRole() public {
        vm.prank(ADMIN);
        roles.grantPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetBurn);
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetBurn));
    }

    function test_AdminCanRevokePermissionFromRole() public {
        assertTrue(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetMint));

        vm.prank(ADMIN);
        roles.revokePermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetMint);

        assertFalse(roles.hasPermission(roles.MANAGER_ROLE(), RolesAndPermissions.Permission.AssetMint));
    }

    function test_RevertWhen_RevokeAdminPermission() public {
        vm.expectRevert(RolesAndPermissions.PermissionDenied.selector);
        vm.prank(ADMIN);
        roles.revokePermission(DEFAULT_ADMIN_ROLE, RolesAndPermissions.Permission.RoleGrant);
    }

    function test_RevertWhen_NonAdminGrantsPermission() public {
        vm.expectRevert(RolesAndPermissions.PermissionDenied.selector);
        vm.prank(MANAGER);
        roles.grantPermission(roles.AUDITOR_ROLE(), RolesAndPermissions.Permission.AuditReadAll);
    }

    // --- Deployment Guards ---

    function test_RevertWhen_DeployWithZeroAdmin() public {
        vm.expectRevert(RolesAndPermissions.ZeroAddress.selector);
        new RolesAndPermissions(address(0));
    }
}