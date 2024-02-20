// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IHLQTYStaking.sol";


contract LQTYStakingScript is CheckContract {
    IHLQTYStaking immutable LQTYStaking;

    constructor(address _lqtyStakingAddress) public {
        checkContract(_lqtyStakingAddress);
        LQTYStaking = IHLQTYStaking(_lqtyStakingAddress);
    }

    function stake(uint _LQTYamount) external {
        LQTYStaking.stake(_LQTYamount);
    }
}
