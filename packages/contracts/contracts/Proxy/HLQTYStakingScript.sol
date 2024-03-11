// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IHLQTYStaking.sol";


contract HLQTYStakingScript is CheckContract {
    IHLQTYStaking immutable HLQTYStaking;

    constructor(address _hlqtyStakingAddress) public {
        checkContract(_hlqtyStakingAddress);
        HLQTYStaking = IHLQTYStaking(_hlqtyStakingAddress);
    }

    function stake(uint _HLQTYamount) external {
        HLQTYStaking.stake(_HLQTYamount);
    }
}
