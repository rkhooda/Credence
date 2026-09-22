// GENERATED FILE — do not edit by hand.
// Source: Backend-Contracts/src/AuditLog.sol
// Regenerate: npm run contract:abi
export const AUDITLOG_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialAdmin",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "AUDITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "actorIndex",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "categoryIndex",
    "inputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum AuditLog.ActionCategory"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "entries",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "category",
        "type": "uint8",
        "internalType": "enum AuditLog.ActionCategory"
      },
      {
        "name": "actor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "targetHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "details",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "timestamp",
        "type": "uint48",
        "internalType": "uint48"
      },
      {
        "name": "blockNumber",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "txHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEntriesByActor",
    "inputs": [
      {
        "name": "actor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AuditLog.AuditEntry[]",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEntriesByCategory",
    "inputs": [
      {
        "name": "category",
        "type": "uint8",
        "internalType": "enum AuditLog.ActionCategory"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AuditLog.AuditEntry[]",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEntriesByHash",
    "inputs": [
      {
        "name": "targetHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AuditLog.AuditEntry[]",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEntriesByTarget",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AuditLog.AuditEntry[]",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getEntry",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AuditLog.AuditEntry",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRecentEntries",
    "inputs": [
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AuditLog.AuditEntry[]",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleMember",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleMemberCount",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleMembers",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashIndex",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "logAssetMinted",
    "inputs": [
      {
        "name": "actor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "assetType",
        "type": "uint8",
        "internalType": "enum AssetNFT.AssetType"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "logCredentialIssued",
    "inputs": [
      {
        "name": "actor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "holder",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "documentHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "logIdentityCreated",
    "inputs": [
      {
        "name": "actor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "did",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "wallet",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "queryEntries",
    "inputs": [
      {
        "name": "filter",
        "type": "tuple",
        "internalType": "struct AuditLog.QueryFilter",
        "components": [
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "fromTimestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "toTimestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "limit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "offset",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple[]",
        "internalType": "struct AuditLog.AuditEntry[]",
        "components": [
          {
            "name": "index",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "category",
            "type": "uint8",
            "internalType": "enum AuditLog.ActionCategory"
          },
          {
            "name": "actor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "target",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "targetHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "details",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "timestamp",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "blockNumber",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "txHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "targetIndex",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalEntries",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AuditEntryCreated",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "category",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum AuditLog.ActionCategory"
      },
      {
        "name": "actor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "target",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "targetHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "timestamp",
        "type": "uint48",
        "indexed": false,
        "internalType": "uint48"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LogNotFound",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedAudit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;
