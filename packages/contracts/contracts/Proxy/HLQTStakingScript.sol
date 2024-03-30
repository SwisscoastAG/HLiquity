// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IHLQTStaking.sol";


contract HLQTStakingScript is CheckContract {
    IHLQTStaking immutable HLQTStaking;

    constructor(address _hlqtStakingAddress) public {
        checkContract(_hlqtStakingAddress);
        HLQTStaking = IHLQTStaking(_hlqtStakingAddress);
    }

    function stake(uint _HLQTamount) external {
        HLQTStaking.stake(_HLQTamount);
    }
}
