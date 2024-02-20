pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

interface IGasPool{
    function approve(address token, address spender, uint256 amount) external returns (int responseCode);
}