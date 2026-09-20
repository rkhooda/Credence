// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title RolesAndPermissions
 * @notice Central role-based access control for the SIH platform.
 *         Defines four roles with distinct permissions enforced on-chain.
 *
 * @dev Role hierarchy and permissions:
 *
 *      ADMIN (DEFAULT_ADMIN_ROLE)
 *      ├── Can grant/revoke all roles
 *      ├── Can pause/unpause the entire system
 *      ├── Can upgrade contracts (if upgradeable)
 *      ├── Can manage identity registry (create, verify, revoke identities)
 *      ├── Can manage asset contracts (mint, burn, force transfer)
 *      └── Can access all audit logs
 *
 *      MANAGER (MANAGER_ROLE)
 *      ├── Can create/mint assets
 *      ├── Can assign assets to identities
 *      ├── Can transfer assets (with authorization)
 *      ├── Can verify identities (mark as verified)
 *      ├── Can revoke/suspend identities
 *      └── Can view all assets and identities
 *
 *      AUDITOR (AUDITOR_ROLE)
 *      ├── Can read all identities and their status
 *      ├── Can read all assets and ownership
 *      ├── Can read all audit events
 *      ├── Can verify asset ownership
 *      ├── Cannot modify any state
 *      └── Cannot access encrypted metadata without keys
 *
 *      USER (USER_ROLE - implicit, no special role needed)
 *      ├── Can view own identity
 *      ├── Can view owned/assigned assets
 *      ├── Can verify own asset ownership
 *      ├── Can transfer owned assets (with authorization)
 *      └── Can request identity verification
 *
 *      Permission enforcement:
 *      - All write operations check caller's role via hasRole()
 *      - Read operations are generally public (view functions)
 *      - Asset transfers require either MANAGER_ROLE or ownership
 *      - Identity changes require MANAGER_ROLE or ADMIN
 */
contract RolesAndPermissions is AccessControlEnumerable, Pausable {
    // --- Role Definitions ---

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // USER_ROLE is implicit - any address with a verified identity is a user
    // No special role needed for basic user permissions

    // --- Types ---

    /// @notice Permission categories for granular control
    enum Permission {
        // Identity permissions
        IdentityCreate,
        IdentityVerify,
        IdentityRevoke,
        IdentitySuspend,
        IdentityUpdateMetadata,

        // Asset permissions
        AssetMint,
        AssetBurn,
        AssetAssign,
        AssetTransfer,
        AssetForceTransfer,
        AssetUpdateMetadata,

        // System permissions
        SystemPause,
        SystemUnpause,
        RoleGrant,
        RoleRevoke,

        // Audit permissions
        AuditReadAll
    }

    /// @notice Total number of permissions (used for array sizing)
    uint256 public constant PERMISSION_COUNT = 16;

    /// @notice Role-to-permission mapping (fixed at deployment, can be extended via governance)
    struct RolePermissions {
        bool[PERMISSION_COUNT] permissions;
    }

    // --- Storage ---

    /// @notice Tracks which permissions each role has
    mapping(bytes32 => RolePermissions) rolePermissions;

    /// @notice Tracks if permissions have been initialized
    bool public permissionsInitialized;

    // --- Errors ---

    error ZeroAddress();
    error PermissionDenied(bytes32 role, Permission permission);
    error RoleNotSupported(bytes32 role);
    error PermissionsAlreadyInitialized();
    error PermissionsNotInitialized();
    error InvalidPermission();

    // --- Events ---

    event RoleAssigned(bytes32 indexed role, address indexed account, address indexed by);
    event RoleRemoved(bytes32 indexed role, address indexed account, address indexed by);
    event PermissionGranted(bytes32 indexed role, Permission permission);
    event PermissionRevoked(bytes32 indexed role, Permission permission);
    event PermissionsInitialized(address indexed by);
    event SystemPaused(address indexed by);
    event SystemUnpaused(address indexed by);

    // --- Constructor ---

    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _setRoleAdmin(MANAGER_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, DEFAULT_ADMIN_ROLE);

        // Initialize default permissions
        _initializeDefaultPermissions();
    }

    // --- Permission Checks ---

    /**
     * @notice Check if a role has a specific permission.
     */
    function hasPermission(bytes32 role, Permission permission) public view returns (bool) {
        if (!permissionsInitialized) revert PermissionsNotInitialized();
        if (uint256(permission) >= PERMISSION_COUNT) revert InvalidPermission();
        return rolePermissions[role].permissions[uint256(permission)];
    }

    /**
     * @notice Check if caller has a specific permission.
     * @dev Reverts if caller lacks the permission.
     */
    function requirePermission(Permission permission) internal view {
        bytes32 role = _getCallerRole();
        if (!hasPermission(role, permission)) {
            revert PermissionDenied(role, permission);
        }
    }

    /**
     * @notice Get the highest role the caller has.
     * @return The role bytes32, or bytes32(0) if none.
     */
    function _getCallerRole() internal view returns (bytes32) {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return DEFAULT_ADMIN_ROLE;
        if (hasRole(MANAGER_ROLE, msg.sender)) return MANAGER_ROLE;
        if (hasRole(AUDITOR_ROLE, msg.sender)) return AUDITOR_ROLE;
        return bytes32(0); // User (no special role)
    }

    // --- Permission Initialization ---

    function _initializeDefaultPermissions() internal {
        if (permissionsInitialized) revert PermissionsAlreadyInitialized();

        // ADMIN (DEFAULT_ADMIN_ROLE) - all permissions
        _grantAllPermissions(DEFAULT_ADMIN_ROLE);

        // MANAGER_ROLE - operational permissions
        _grantPermission(MANAGER_ROLE, Permission.IdentityCreate);
        _grantPermission(MANAGER_ROLE, Permission.IdentityVerify);
        _grantPermission(MANAGER_ROLE, Permission.IdentityRevoke);
        _grantPermission(MANAGER_ROLE, Permission.IdentitySuspend);
        _grantPermission(MANAGER_ROLE, Permission.IdentityUpdateMetadata);

        _grantPermission(MANAGER_ROLE, Permission.AssetMint);
        _grantPermission(MANAGER_ROLE, Permission.AssetAssign);
        _grantPermission(MANAGER_ROLE, Permission.AssetTransfer);
        _grantPermission(MANAGER_ROLE, Permission.AssetUpdateMetadata);

        _grantPermission(MANAGER_ROLE, Permission.SystemUnpause);

        // AUDITOR_ROLE - read-only permissions
        _grantPermission(AUDITOR_ROLE, Permission.AuditReadAll);

        permissionsInitialized = true;
        emit PermissionsInitialized(msg.sender);
    }

    function _grantAllPermissions(bytes32 role) internal {
        for (uint256 i = 0; i < PERMISSION_COUNT; i++) {
            rolePermissions[role].permissions[i] = true;
        }
    }

    function _grantPermission(bytes32 role, Permission permission) internal {
        rolePermissions[role].permissions[uint256(permission)] = true;
        emit PermissionGranted(role, permission);
    }

    function _revokePermission(bytes32 role, Permission permission) internal {
        rolePermissions[role].permissions[uint256(permission)] = false;
        emit PermissionRevoked(role, permission);
    }

    // --- Role Management (Admin only) ---

    /**
     * @notice Grant a role to an account.
     * @param role The role to grant.
     * @param account The account to grant the role to.
     */
    function grantRole(bytes32 role, address account) public override(AccessControl, IAccessControl) {
        requirePermission(Permission.RoleGrant);
        if (account == address(0)) revert ZeroAddress();
        if (!_isSupportedRole(role)) revert RoleNotSupported(role);

        super.grantRole(role, account);
        emit RoleAssigned(role, account, msg.sender);
    }

    /**
     * @notice Revoke a role from an account.
     * @param role The role to revoke.
     * @param account The account to revoke the role from.
     */
    function revokeRole(bytes32 role, address account) public override(AccessControl, IAccessControl) {
        requirePermission(Permission.RoleRevoke);
        if (account == address(0)) revert ZeroAddress();
        if (!_isSupportedRole(role)) revert RoleNotSupported(role);

        super.revokeRole(role, account);
        emit RoleRemoved(role, account, msg.sender);
    }

    function _isSupportedRole(bytes32 role) internal view returns (bool) {
        return role == DEFAULT_ADMIN_ROLE || role == MANAGER_ROLE || role == AUDITOR_ROLE;
    }

    // --- System Pause (Admin only) ---

    function pause() external {
        requirePermission(Permission.SystemPause);
        _pause();
        emit SystemPaused(msg.sender);
    }

    function unpause() external {
        requirePermission(Permission.SystemUnpause);
        _unpause();
        emit SystemUnpaused(msg.sender);
    }

    // --- Permission Configuration (Admin only) ---

    /**
     * @notice Grant a permission to a role (admin only).
     * @param role The role to grant the permission to.
     * @param permission The permission to grant.
     */
    function grantPermission(bytes32 role, Permission permission) external {
        requirePermission(Permission.RoleGrant);
        if (!_isSupportedRole(role)) revert RoleNotSupported(role);
        if (uint256(permission) >= PERMISSION_COUNT) revert InvalidPermission();

        _grantPermission(role, permission);
    }

    /**
     * @notice Revoke a permission from a role (admin only).
     * @param role The role to revoke the permission from.
     * @param permission The permission to revoke.
     */
    function revokePermission(bytes32 role, Permission permission) external {
        requirePermission(Permission.RoleGrant);
        if (!_isSupportedRole(role)) revert RoleNotSupported(role);
        if (uint256(permission) >= PERMISSION_COUNT) revert InvalidPermission();
        if (role == DEFAULT_ADMIN_ROLE) revert PermissionDenied(role, permission); // Admin keeps all

        _revokePermission(role, permission);
    }

    // --- Queries ---

    /// @notice Get all members of a role.
    function getRoleMembers(bytes32 role) public view override returns (address[] memory) {
        if (!_isSupportedRole(role) && role != DEFAULT_ADMIN_ROLE) revert RoleNotSupported(role);
        uint256 count = getRoleMemberCount(role);
        address[] memory members = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            members[i] = getRoleMember(role, i);
        }
        return members;
    }

    /// @notice Get permission matrix for a role.
    function getRolePermissions(bytes32 role) external view returns (bool[PERMISSION_COUNT] memory) {
        return rolePermissions[role].permissions;
    }

    /// @notice Check if caller is at least a Manager.
    function isAtLeastManager() external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender);
    }

    /// @notice Check if caller is at least an Auditor.
    function isAtLeastAuditor() external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(MANAGER_ROLE, msg.sender) || hasRole(AUDITOR_ROLE, msg.sender);
    }

    /// @notice Check if caller is an Admin.
    function isAdmin() external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Get caller's role as string.
    function getCallerRoleName() external view returns (string memory) {
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) return "Admin";
        if (hasRole(MANAGER_ROLE, msg.sender)) return "Manager";
        if (hasRole(AUDITOR_ROLE, msg.sender)) return "Auditor";
        return "User";
    }
}