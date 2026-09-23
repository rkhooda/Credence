// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {RolesAndPermissions} from "../src/RolesAndPermissions.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {AssetNFT} from "../src/AssetNFT.sol";
import {CredentialVault} from "../src/CredentialVault.sol";
import {CredentialAssetBridge} from "../src/CredentialAssetBridge.sol";
import {AuditLog} from "../src/AuditLog.sol";

/**
 * @notice Deploys all SIH platform contracts and configures initial roles.
 *
 * @dev Deployment order:
 *      1. RolesAndPermissions (central RBAC)
 *      2. IdentityRegistry (identity management)
 *      3. AssetNFT (asset management)
 *      4. CredentialVault (credential verification)
 *      5. CredentialAssetBridge (links credentials ↔ assets)
 *      6. AuditLog (centralized logging)
 *
 *      After deployment, configure cross-contract roles:
 *      - Grant MANAGER_ROLE in RolesAndPermissions to AssetNFT admin
 *      - Grant ASSET_MANAGER_ROLE in AssetNFT to CredentialAssetBridge
 *      - etc.
 */
contract DeployAll is Script {
    // Deployment state
    RolesAndPermissions public rolesAndPermissions;
    IdentityRegistry public identityRegistry;
    AssetNFT public assetNFT;
    CredentialVault public credentialVault;
    CredentialAssetBridge public credentialAssetBridge;
    AuditLog public auditLog;

    // Configuration from environment
    address public admin;
    address public initialManager;
    address public initialAuditor;
    address public initialIssuer;

    string public initialIssuerName;
    string public initialIssuerAccreditation;
    string public initialIssuerWebsite;

    function run() external returns (
        RolesAndPermissions,
        IdentityRegistry,
        AssetNFT,
        CredentialVault,
        CredentialAssetBridge,
        AuditLog
    ) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Load configuration from environment
        admin = vm.envOr("ADMIN_ADDRESS", deployer);
        initialManager = vm.envOr("INITIAL_MANAGER_ADDRESS", deployer);
        initialAuditor = vm.envOr("INITIAL_AUDITOR_ADDRESS", deployer);
        initialIssuer = vm.envOr("INITIAL_ISSUER_ADDRESS", deployer);

        string memory issuerName = vm.envOr("INITIAL_ISSUER_NAME", string("SIH Demo University"));
        initialIssuerName = bytes(issuerName).length > 0 ? issuerName : "SIH Demo University";
        
        string memory issuerAccreditation = vm.envOr("INITIAL_ISSUER_ACCREDITATION", string("SIH-ACCREDITATION"));
        initialIssuerAccreditation = issuerAccreditation;
        
        string memory issuerWebsite = vm.envOr("INITIAL_ISSUER_WEBSITE", string("https://sih.example"));
        initialIssuerWebsite = issuerWebsite;

        vm.startBroadcast(deployerKey);

        // 1. Deploy RolesAndPermissions (central RBAC)
        console.log("Deploying RolesAndPermissions...");
        rolesAndPermissions = new RolesAndPermissions(admin);
        console.log("RolesAndPermissions deployed at:", address(rolesAndPermissions));

        // Grant initial roles
        if (initialManager != address(0)) {
            rolesAndPermissions.grantRole(rolesAndPermissions.MANAGER_ROLE(), initialManager);
            console.log("Granted MANAGER_ROLE to:", initialManager);
        }
        if (initialAuditor != address(0)) {
            rolesAndPermissions.grantRole(rolesAndPermissions.AUDITOR_ROLE(), initialAuditor);
            console.log("Granted AUDITOR_ROLE to:", initialAuditor);
        }

        // 2. Deploy IdentityRegistry
        console.log("Deploying IdentityRegistry...");
        identityRegistry = new IdentityRegistry(admin);
        console.log("IdentityRegistry deployed at:", address(identityRegistry));

        if (initialManager != address(0)) {
            identityRegistry.grantRole(identityRegistry.IDENTITY_MANAGER_ROLE(), initialManager);
        }

        // 3. Deploy AssetNFT
        console.log("Deploying AssetNFT...");
        assetNFT = new AssetNFT(admin);
        console.log("AssetNFT deployed at:", address(assetNFT));

        // Grant asset manager role to CredentialAssetBridge (will be deployed next)
        // For now, grant to admin
        assetNFT.grantRole(assetNFT.ASSET_MANAGER_ROLE(), admin);
        console.log("Granted ASSET_MANAGER_ROLE to admin");
        if (initialManager != address(0)) {
            assetNFT.grantRole(assetNFT.ASSET_MANAGER_ROLE(), initialManager);
        }
        if (initialAuditor != address(0)) {
            assetNFT.grantRole(assetNFT.AUDITOR_ROLE(), initialAuditor);
        }

        // 4. Deploy CredentialVault
        console.log("Deploying CredentialVault...");
        credentialVault = new CredentialVault(admin);
        console.log("CredentialVault deployed at:", address(credentialVault));

        // Register initial issuer
        credentialVault.registerIssuer(initialIssuer, initialIssuerName, initialIssuerAccreditation, initialIssuerWebsite);
        console.log("Registered initial issuer:", initialIssuer);

        // 5. Deploy CredentialAssetBridge
        console.log("Deploying CredentialAssetBridge...");
        credentialAssetBridge = new CredentialAssetBridge(admin, credentialVault, assetNFT);
        console.log("CredentialAssetBridge deployed at:", address(credentialAssetBridge));

        // Grant bridge manager role to admin
        credentialAssetBridge.grantRole(credentialAssetBridge.BRIDGE_MANAGER_ROLE(), admin);
        if (initialManager != address(0)) {
            credentialAssetBridge.grantRole(credentialAssetBridge.BRIDGE_MANAGER_ROLE(), initialManager);
        }

        // Grant ASSET_MANAGER_ROLE in AssetNFT to CredentialAssetBridge
        assetNFT.grantRole(assetNFT.ASSET_MANAGER_ROLE(), address(credentialAssetBridge));
        console.log("Granted ASSET_MANAGER_ROLE to CredentialAssetBridge");

        // 6. Deploy AuditLog
        console.log("Deploying AuditLog...");
        auditLog = new AuditLog(admin);
        console.log("AuditLog deployed at:", address(auditLog));

        vm.stopBroadcast();

        // Log summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Admin:", admin);
        console.log("RolesAndPermissions:", address(rolesAndPermissions));
        console.log("IdentityRegistry:", address(identityRegistry));
        console.log("AssetNFT:", address(assetNFT));
        console.log("CredentialVault:", address(credentialVault));
        console.log("CredentialAssetBridge:", address(credentialAssetBridge));
        console.log("AuditLog:", address(auditLog));
        console.log("Initial Manager:", initialManager);
        console.log("Initial Auditor:", initialAuditor);
        console.log("Initial Issuer:", initialIssuer);
    }
}
