// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "./IVerifyProofAggregation.sol";

contract MagicSquareVerifier {

    // ZKVerify proxy contract on Sepolia: 0xEA0A0f1EfB1088F4ff0Def03741Cb2C64F89361E
    address public zkVerify;

    constructor(address _zkVerify) {
        zkVerify = _zkVerify;
    }

    /// @notice Verifies the aggregation proof on-chain using ZKVerify's contract
    /// @param _leaf          leaf from aggregation.json
    /// @param _aggregationId aggregationId from aggregation.json
    /// @param _domainId      domainId from aggregation.json (0 = Sepolia)
    /// @param _merklePath    proof array from aggregation.json
    /// @param _leafCount     numberOfLeaves from aggregation.json
    /// @param _index         leafIndex from aggregation.json
    function checkHash(
        bytes32 _leaf,
        uint256 _aggregationId,
        uint256 _domainId,
        bytes32[] calldata _merklePath,
        uint256 _leafCount,
        uint256 _index
    ) public view returns (bool) {

        require(
            IVerifyProofAggregation(zkVerify).verifyProofAggregation(
                _domainId,
                _aggregationId,
                _leaf,
                _merklePath,
                _leafCount,
                _index
            ),
            "Invalid proof"
        );

        return true;
    }
}
