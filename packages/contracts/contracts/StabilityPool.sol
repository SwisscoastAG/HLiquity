// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import './Interfaces/IBorrowerOperations.sol';
import './Interfaces/IStabilityPool.sol';
import './Interfaces/IBorrowerOperations.sol';
import './Interfaces/ITroveManager.sol';
import './Interfaces/IHCHFToken.sol';
import './Interfaces/ISortedTroves.sol';
import "./Interfaces/ICommunityIssuance.sol";
import "./Dependencies/LiquityBase.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/LiquitySafeMath128.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";
import "./Dependencies/BaseHST.sol";

/*
 * The Stability Pool holds HCHF tokens deposited by Stability Pool depositors.
 *
 * When a trove is liquidated, then depending on system conditions, some of its HCHF debt gets offset with
 * HCHF in the Stability Pool:  that is, the offset debt evaporates, and an equal amount of HCHF tokens in the Stability Pool is burned.
 *
 * Thus, a liquidation causes each depositor to receive a HCHF loss, in proportion to their deposit as a share of total deposits.
 * They also receive an ETH gain, as the ETH collateral of the liquidated trove is distributed among Stability depositors,
 * in the same proportion.
 *
 * When a liquidation occurs, it depletes every deposit by the same fraction: for example, a liquidation that depletes 40%
 * of the total HCHF in the Stability Pool, depletes 40% of each deposit.
 *
 * A deposit that has experienced a series of liquidations is termed a "compounded deposit": each liquidation depletes the deposit,
 * multiplying it by some factor in range ]0,1[
 *
 *
 * --- IMPLEMENTATION ---
 *
 * We use a highly scalable method of tracking deposits and ETH gains that has O(1) complexity.
 *
 * When a liquidation occurs, rather than updating each depositor's deposit and ETH gain, we simply update two state variables:
 * a product P, and a sum S.
 *
 * A mathematical manipulation allows us to factor out the initial deposit, and accurately track all depositors' compounded deposits
 * and accumulated ETH gains over time, as liquidations occur, using just these two variables P and S. When depositors join the
 * Stability Pool, they get a snapshot of the latest P and S: P_t and S_t, respectively.
 *
 * The formula for a depositor's accumulated ETH gain is derived here:
 * https://github.com/liquity/dev/blob/main/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
 *
 * For a given deposit d_t, the ratio P/P_t tells us the factor by which a deposit has decreased since it joined the Stability Pool,
 * and the term d_t * (S - S_t)/P_t gives us the deposit's total accumulated ETH gain.
 *
 * Each liquidation updates the product P and sum S. After a series of liquidations, a compounded deposit and corresponding ETH gain
 * can be calculated using the initial deposit, the depositor’s snapshots of P and S, and the latest values of P and S.
 *
 * Any time a depositor updates their deposit (withdrawal, top-up) their accumulated ETH gain is paid out, their new deposit is recorded
 * (based on their latest compounded deposit and modified by the withdrawal/top-up), and they receive new snapshots of the latest P and S.
 * Essentially, they make a fresh deposit that overwrites the old one.
 *
 *
 * --- SCALE FACTOR ---
 *
 * Since P is a running product in range ]0,1] that is always-decreasing, it should never reach 0 when multiplied by a number in range ]0,1[.
 * Unfortunately, Solidity floor division always reaches 0, sooner or later.
 *
 * A series of liquidations that nearly empty the Pool (and thus each multiply P by a very small number in range ]0,1[ ) may push P
 * to its 18 digit decimal limit, and round it to 0, when in fact the Pool hasn't been emptied: this would break deposit tracking.
 *
 * So, to track P accurately, we use a scale factor: if a liquidation would cause P to decrease to <1e-4 (and be rounded to 0 by Solidity),
 * we first multiply P by 1e4, and increment a currentScale factor by 1.
 *
 * The added benefit of using 1e4 for the scale factor (rather than 1e8) is that it ensures negligible precision loss close to the
 * scale boundary: when P is at its minimum value of 1e4, the relative precision loss in P due to floor division is only on the
 * order of 1e-4.
 *
 * --- EPOCHS ---
 *
 * Whenever a liquidation fully empties the Stability Pool, all deposits should become 0. However, setting P to 0 would make P be 0
 * forever, and break all future reward calculations.
 *
 * So, every time the Stability Pool is emptied by a liquidation, we reset P = 1 and currentScale = 0, and increment the currentEpoch by 1.
 *
 * --- TRACKING DEPOSIT OVER SCALE CHANGES AND EPOCHS ---
 *
 * When a deposit is made, it gets snapshots of the currentEpoch and the currentScale.
 *
 * When calculating a compounded deposit, we compare the current epoch to the deposit's epoch snapshot. If the current epoch is newer,
 * then the deposit was present during a pool-emptying liquidation, and necessarily has been depleted to 0.
 *
 * Otherwise, we then compare the current scale to the deposit's scale snapshot. If they're equal, the compounded deposit is given by d_t * P/P_t.
 * If it spans one scale change, it is given by d_t * P/(P_t * 1e4). If it spans more than one scale change, we define the compounded deposit
 * as 0, since it is now less than 1e-4'th of its initial value (e.g. a deposit of 1 billion HCHF has depleted to < 1 HCHF).
 *
 *
 *  --- TRACKING DEPOSITOR'S ETH GAIN OVER SCALE CHANGES AND EPOCHS ---
 *
 * In the current epoch, the latest value of S is stored upon each scale change, and the mapping (scale -> S) is stored for each epoch.
 *
 * This allows us to calculate a deposit's accumulated ETH gain, during the epoch in which the deposit was non-zero and earned ETH.
 *
 * We calculate the depositor's accumulated ETH gain for the scale at which they made the deposit, using the ETH gain formula:
 * e_1 = d_t * (S - S_t) / P_t
 *
 * and also for scale after, taking care to divide the latter by a factor of 1e4:
 * e_2 = d_t * S / (P_t * 1e4)
 *
 * The gain in the second scale will be full, as the starting point was in the previous scale, thus no need to subtract anything.
 * The deposit therefore was present for reward events from the beginning of that second scale.
 *
 *        S_i-S_t + S_{i+1}
 *      .<--------.------------>
 *      .         .
 *      . S_i     .   S_{i+1}
 *   <--.-------->.<----------->
 *   S_t.         .
 *   <->.         .
 *      t         .
 *  |---+---------|-------------|-----...
 *         i            i+1
 *
 * The sum of (e_1 + e_2) captures the depositor's total accumulated ETH gain, handling the case where their
 * deposit spanned one scale change. We only care about gains across one scale change, since the compounded
 * deposit is defined as being 0 once it has spanned more than one scale change.
 *
 *
 * --- UPDATING P WHEN A LIQUIDATION OCCURS ---
 *
 * Please see the implementation spec in the proof document, which closely follows on from the compounded deposit / ETH gain derivations:
 * https://github.com/liquity/liquity/blob/master/papers/Scalable_Reward_Distribution_with_Compounding_Stakes.pdf
 *
 *
 * --- HLQT ISSUANCE TO STABILITY POOL DEPOSITORS ---
 *
 * An HLQT issuance event occurs at every deposit operation, and every liquidation.
 *
 * Each deposit is tagged with the address of the front end through which it was made.
 *
 * All deposits earn a share of the issued HLQT in proportion to the deposit as a share of total deposits. The HLQT earned
 * by a given deposit, is split between the depositor and the front end through which the deposit was made, based on the front end's kickbackRate.
 *
 * Please see the system Readme for an overview:
 * https://github.com/liquity/dev/blob/main/README.md#lqty-issuance-to-stability-providers
 *
 * We use the same mathematical product-sum approach to track HLQT gains for depositors, where 'G' is the sum corresponding to HLQT gains.
 * The product P (and snapshot P_t) is re-used, as the ratio P/P_t tracks a deposit's depletion due to liquidations.
 *
 */
contract StabilityPool is LiquityBase, Ownable, CheckContract, IStabilityPool, BaseHST {
    using LiquitySafeMath128 for uint128;
    string constant public NAME = "StabilityPool";

    IBorrowerOperations public borrowerOperations;

    ITroveManager public troveManager;

    IHCHFToken public hchfToken;

    // Needed to check if there are pending liquidations
    ISortedTroves public sortedTroves;

    ICommunityIssuance public communityIssuance;

    uint256 internal ETH;  // deposited ether tracker

    // Tracker for HCHF held in the pool. Changes when users deposit/withdraw, and when Trove debt is offset.
    uint256 internal totalHCHFDeposits;

   // --- Data structures ---

    struct FrontEnd {
        uint kickbackRate;
        bool registered;
    }

    struct Deposit {
        uint initialValue;
        address frontEndTag;
    }

    struct Snapshots {
        uint S;
        uint P;
        uint G;
        uint128 scale;
        uint128 epoch;
    }

    mapping (address => Deposit) public deposits;  // depositor address -> Deposit struct
    mapping (address => Snapshots) public depositSnapshots;  // depositor address -> snapshots struct

    mapping (address => FrontEnd) public frontEnds;  // front end address -> FrontEnd struct
    mapping (address => uint) public frontEndStakes; // front end address -> last recorded total deposits, tagged with that front end
    mapping (address => Snapshots) public frontEndSnapshots; // front end address -> snapshots struct

    /*  Product 'P': Running product by which to multiply an initial deposit, in order to find the current compounded deposit,
    * after a series of liquidations have occurred, each of which cancel some HCHF debt with the deposit.
    *
    * During its lifetime, a deposit's value evolves from d_t to d_t * P / P_t , where P_t
    * is the snapshot of P taken at the instant the deposit was made. 18-digit decimal.
    */
    uint public P = DECIMAL_PRECISION;

    uint public constant SCALE_FACTOR = 1e4;

    // Each time the scale of P shifts by SCALE_FACTOR, the scale is incremented by 1
    uint128 public currentScale;

    // With each offset that fully empties the Pool, the epoch is incremented by 1
    uint128 public currentEpoch;

    /* ETH Gain sum 'S': During its lifetime, each deposit d_t earns an ETH gain of ( d_t * [S - S_t] )/P_t, where S_t
    * is the depositor's snapshot of S taken at the time t when the deposit was made.
    *
    * The 'S' sums are stored in a nested mapping (epoch => scale => sum):
    *
    * - The inner mapping records the sum S at different scales
    * - The outer mapping records the (scale => sum) mappings, for different epochs.
    */
    mapping (uint128 => mapping(uint128 => uint)) public epochToScaleToSum;

    /*
    * Similarly, the sum 'G' is used to calculate HLQT gains. During it's lifetime, each deposit d_t earns a HLQT gain of
    *  ( d_t * [G - G_t] )/P_t, where G_t is the depositor's snapshot of G taken at time t when  the deposit was made.
    *
    *  HLQT reward events occur are triggered by depositor operations (new deposit, topup, withdrawal), and liquidations.
    *  In each case, the HLQT reward is issued (i.e. G is updated), before other state changes are made.
    */
    mapping (uint128 => mapping(uint128 => uint)) public epochToScaleToG;

    // Error tracker for the error correction in the HLQT issuance calculation
    uint public lastHLQTError;
    // Error trackers for the error correction in the offset calculation
    uint public lastETHError_Offset;
    uint public lastHCHFLossError_Offset;

    // --- Events ---

    event StabilityPoolETHBalanceUpdated(uint _newBalance);
    event StabilityPoolHCHFBalanceUpdated(uint _newBalance);

    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event HCHFTokenAddressChanged(address _newHCHFTokenAddress);
    event SortedTrovesAddressChanged(address _newSortedTrovesAddress);
    event PriceFeedAddressChanged(address _newPriceFeedAddress);
    event CommunityIssuanceAddressChanged(address _newCommunityIssuanceAddress);

    event P_Updated(uint _P);
    event S_Updated(uint _S, uint128 _epoch, uint128 _scale);
    event G_Updated(uint _G, uint128 _epoch, uint128 _scale);
    event EpochUpdated(uint128 _currentEpoch);
    event ScaleUpdated(uint128 _currentScale);

    event FrontEndRegistered(address indexed _frontEnd, uint _kickbackRate);
    event FrontEndTagSet(address indexed _depositor, address indexed _frontEnd);

    event DepositSnapshotUpdated(address indexed _depositor, uint _P, uint _S, uint _G);
    event FrontEndSnapshotUpdated(address indexed _frontEnd, uint _P, uint _G);
    event UserDepositChanged(address indexed _depositor, uint _newDeposit);
    event FrontEndStakeChanged(address indexed _frontEnd, uint _newFrontEndStake, address _depositor);

    event ETHGainWithdrawn(address indexed _depositor, uint _ETH, uint _HCHFLoss);
    event HLQTPaidToDepositor(address indexed _depositor, uint _HLQT);
    event HLQTPaidToFrontEnd(address indexed _frontEnd, uint _HLQT);
    event HLQTPaidToFrontEndFailed(address indexed _frontEnd, uint _HLQT);
    event EtherSent(address _to, uint _amount);

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _activePoolAddress,
        address _hchfTokenAddress,
        address _sortedTrovesAddress,
        address _priceFeedAddress,
        address _communityIssuanceAddress
    )
        external
        override
        onlyOwner
    {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_hchfTokenAddress);
        checkContract(_sortedTrovesAddress);
        checkContract(_priceFeedAddress);
        checkContract(_communityIssuanceAddress);

        borrowerOperations = IBorrowerOperations(_borrowerOperationsAddress);
        troveManager = ITroveManager(_troveManagerAddress);
        activePool = IActivePool(_activePoolAddress);
        hchfToken = IHCHFToken(_hchfTokenAddress);
        sortedTroves = ISortedTroves(_sortedTrovesAddress);
        priceFeed = IPriceFeed(_priceFeedAddress);
        communityIssuance = ICommunityIssuance(_communityIssuanceAddress);

        // associate contract account with HCHF
        _associateToken(address(this), hchfToken.getTokenAddress());

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit HCHFTokenAddressChanged(_hchfTokenAddress);
        emit SortedTrovesAddressChanged(_sortedTrovesAddress);
        emit PriceFeedAddressChanged(_priceFeedAddress);
        emit CommunityIssuanceAddressChanged(_communityIssuanceAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    function getETH() external view override returns (uint) {
        return ETH;
    }

    function getTotalHCHFDeposits() external view override returns (uint) {
        return totalHCHFDeposits;
    }

    // --- External Depositor Functions ---

    /*  provideToSP():
    *
    * - Triggers a HLQT issuance, based on time passed since the last issuance. The HLQT issuance is shared between *all* depositors and front ends
    * - Tags the deposit with the provided front end tag param, if it's a new deposit
    * - Sends depositor's accumulated gains (HLQT, ETH) to depositor
    * - Sends the tagged front end's accumulated HLQT gains to the tagged front end
    * - Increases deposit and tagged front end's stake, and takes new snapshots for each.
    */
    function provideToSP(uint _amount, address _frontEndTag) external override {
        _requireFrontEndIsRegisteredOrZero(_frontEndTag);
        _requireFrontEndNotRegistered(msg.sender);
        _requireNonZeroAmount(_amount);

        uint initialDeposit = deposits[msg.sender].initialValue;

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerHLQTIssuance(communityIssuanceCached);

        if (initialDeposit == 0) {_setFrontEndTag(msg.sender, _frontEndTag);}
        uint depositorETHGain = getDepositorETHGain(msg.sender);
        uint compoundedHCHFDeposit = getCompoundedHCHFDeposit(msg.sender);
        uint HCHFLoss = initialDeposit.sub(compoundedHCHFDeposit); // Needed only for event log

        // First pay out any HLQT gains
        address frontEnd = deposits[msg.sender].frontEndTag;
        _payOutHLQTGains(communityIssuanceCached, msg.sender, frontEnd);

        // Update front end stake
        uint compoundedFrontEndStake = getCompoundedFrontEndStake(frontEnd);
        uint newFrontEndStake = compoundedFrontEndStake.add(_amount);
        _updateFrontEndStakeAndSnapshots(frontEnd, newFrontEndStake);
        emit FrontEndStakeChanged(frontEnd, newFrontEndStake, msg.sender);

        _sendHCHFtoStabilityPool(msg.sender, _amount);

        uint newDeposit = compoundedHCHFDeposit.add(_amount);
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit ETHGainWithdrawn(msg.sender, depositorETHGain, HCHFLoss); // HCHF Loss required for event log

        _sendETHGainToDepositor(depositorETHGain);
     }

    /*  withdrawFromSP():
    *
    * - Triggers a HLQT issuance, based on time passed since the last issuance. The HLQT issuance is shared between *all* depositors and front ends
    * - Removes the deposit's front end tag if it is a full withdrawal
    * - Sends all depositor's accumulated gains (HLQT, ETH) to depositor
    * - Sends the tagged front end's accumulated HLQT gains to the tagged front end
    * - Decreases deposit and tagged front end's stake, and takes new snapshots for each.
    *
    * If _amount > userDeposit, the user withdraws all of their compounded deposit.
    */
    function withdrawFromSP(uint _amount) external override {
        if (_amount !=0) {_requireNoUnderCollateralizedTroves();}
        uint initialDeposit = deposits[msg.sender].initialValue;
        _requireUserHasDeposit(initialDeposit);

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerHLQTIssuance(communityIssuanceCached);

        uint depositorETHGain = getDepositorETHGain(msg.sender);

        uint compoundedHCHFDeposit = getCompoundedHCHFDeposit(msg.sender);
        uint HCHFtoWithdraw = LiquityMath._min(_amount, compoundedHCHFDeposit);
        uint HCHFLoss = initialDeposit.sub(compoundedHCHFDeposit); // Needed only for event log

        // First pay out any HLQT gains
        address frontEnd = deposits[msg.sender].frontEndTag;
        _payOutHLQTGains(communityIssuanceCached, msg.sender, frontEnd);
        
        // Update front end stake
        uint compoundedFrontEndStake = getCompoundedFrontEndStake(frontEnd);
        uint newFrontEndStake = compoundedFrontEndStake.sub(HCHFtoWithdraw);
        _updateFrontEndStakeAndSnapshots(frontEnd, newFrontEndStake);
        emit FrontEndStakeChanged(frontEnd, newFrontEndStake, msg.sender);

        _sendHCHFToDepositor(msg.sender, HCHFtoWithdraw);

        // Update deposit
        uint newDeposit = compoundedHCHFDeposit.sub(HCHFtoWithdraw);
        _updateDepositAndSnapshots(msg.sender, newDeposit);
        emit UserDepositChanged(msg.sender, newDeposit);

        emit ETHGainWithdrawn(msg.sender, depositorETHGain, HCHFLoss);  // HCHF Loss required for event log

        _sendETHGainToDepositor(depositorETHGain);
    }

    /* withdrawETHGainToTrove:
    * - Triggers a HLQT issuance, based on time passed since the last issuance. The HLQT issuance is shared between *all* depositors and front ends
    * - Sends all depositor's HLQT gain to  depositor
    * - Sends all tagged front end's HLQT gain to the tagged front end
    * - Transfers the depositor's entire ETH gain from the Stability Pool to the caller's trove
    * - Leaves their compounded deposit in the Stability Pool
    * - Updates snapshots for deposit and tagged front end stake */
    function withdrawETHGainToTrove(address _upperHint, address _lowerHint) external override {
        uint initialDeposit = deposits[msg.sender].initialValue;
        _requireUserHasDeposit(initialDeposit);
        _requireUserHasTrove(msg.sender);
        _requireUserHasETHGain(msg.sender);

        ICommunityIssuance communityIssuanceCached = communityIssuance;

        _triggerHLQTIssuance(communityIssuanceCached);

        uint depositorETHGain = getDepositorETHGain(msg.sender);

        uint compoundedHCHFDeposit = getCompoundedHCHFDeposit(msg.sender);
        uint HCHFLoss = initialDeposit.sub(compoundedHCHFDeposit); // Needed only for event log

        // First pay out any HLQT gains
        address frontEnd = deposits[msg.sender].frontEndTag;
        _payOutHLQTGains(communityIssuanceCached, msg.sender, frontEnd);

        // Update front end stake
        uint compoundedFrontEndStake = getCompoundedFrontEndStake(frontEnd);
        uint newFrontEndStake = compoundedFrontEndStake;
        _updateFrontEndStakeAndSnapshots(frontEnd, newFrontEndStake);
        emit FrontEndStakeChanged(frontEnd, newFrontEndStake, msg.sender);

        _updateDepositAndSnapshots(msg.sender, compoundedHCHFDeposit);

        /* Emit events before transferring ETH gain to Trove.
         This lets the event log make more sense (i.e. so it appears that first the ETH gain is withdrawn
        and then it is deposited into the Trove, not the other way around). */
        emit ETHGainWithdrawn(msg.sender, depositorETHGain, HCHFLoss);
        emit UserDepositChanged(msg.sender, compoundedHCHFDeposit);

        ETH = ETH.sub(depositorETHGain);
        emit StabilityPoolETHBalanceUpdated(ETH);
        emit EtherSent(msg.sender, depositorETHGain);

        borrowerOperations.moveETHGainToTrove{ value: depositorETHGain }(msg.sender, _upperHint, _lowerHint);
    }

    // --- HLQT issuance functions ---

    function _triggerHLQTIssuance(ICommunityIssuance _communityIssuance) internal {
        uint HLQTIssuance = _communityIssuance.issueHLQT();
       _updateG(HLQTIssuance);
    }

    function _updateG(uint _HLQTIssuance) internal {
        uint totalHCHF = totalHCHFDeposits; // cached to save an SLOAD
        /*
        * When total deposits is 0, G is not updated. In this case, the HLQT issued can not be obtained by later
        * depositors - it is missed out on, and remains in the balanceof the CommunityIssuance contract.
        *
        */
        if (totalHCHF == 0 || _HLQTIssuance == 0) {return;}

        uint HLQTPerUnitStaked;
        HLQTPerUnitStaked =_computeHLQTPerUnitStaked(_HLQTIssuance, totalHCHF);

        uint marginalHLQTGain = HLQTPerUnitStaked.mul(P);
        epochToScaleToG[currentEpoch][currentScale] = epochToScaleToG[currentEpoch][currentScale].add(marginalHLQTGain);

        emit G_Updated(epochToScaleToG[currentEpoch][currentScale], currentEpoch, currentScale);
    }

    function _computeHLQTPerUnitStaked(uint _HLQTIssuance, uint _totalHCHFDeposits) internal returns (uint) {
        /*  
        * Calculate the HLQT-per-unit staked.  Division uses a "feedback" error correction, to keep the
        * cumulative error low in the running total G:
        *
        * 1) Form a numerator which compensates for the floor division error that occurred the last time this 
        * function was called.  
        * 2) Calculate "per-unit-staked" ratio.
        * 3) Multiply the ratio back by its denominator, to reveal the current floor division error.
        * 4) Store this error for use in the next correction when this function is called.
        * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
        */
        uint HLQTNumerator = _HLQTIssuance.mul(DECIMAL_PRECISION).add(lastHLQTError);

        uint HLQTPerUnitStaked = HLQTNumerator.div(_totalHCHFDeposits);
        lastHLQTError = HLQTNumerator.sub(HLQTPerUnitStaked.mul(_totalHCHFDeposits));

        return HLQTPerUnitStaked;
    }

    // --- Liquidation functions ---

    /*
    * Cancels out the specified debt against the HCHF contained in the Stability Pool (as far as possible)
    * and transfers the Trove's ETH collateral from ActivePool to StabilityPool.
    * Only called by liquidation functions in the TroveManager.
    */
    function offset(uint _debtToOffset, uint _collToAdd) external override {
        _requireCallerIsTroveManager();
        uint totalHCHF = totalHCHFDeposits; // cached to save an SLOAD
        if (totalHCHF == 0 || _debtToOffset == 0) { return; }

        _triggerHLQTIssuance(communityIssuance);

        (uint ETHGainPerUnitStaked,
            uint HCHFLossPerUnitStaked) = _computeRewardsPerUnitStaked(_collToAdd, _debtToOffset, totalHCHF);

        _updateRewardSumAndProduct(ETHGainPerUnitStaked, HCHFLossPerUnitStaked);  // updates S and P

        _moveOffsetCollAndDebt(_collToAdd, _debtToOffset);
    }

    // --- Offset helper functions ---

    function _computeRewardsPerUnitStaked(
        uint _collToAdd,
        uint _debtToOffset,
        uint _totalHCHFDeposits
    )
        internal
        returns (uint ETHGainPerUnitStaked, uint HCHFLossPerUnitStaked)
    {
        /*
        * Compute the HCHF and ETH rewards. Uses a "feedback" error correction, to keep
        * the cumulative error in the P and S state variables low:
        *
        * 1) Form numerators which compensate for the floor division errors that occurred the last time this 
        * function was called.  
        * 2) Calculate "per-unit-staked" ratios.
        * 3) Multiply each ratio back by its denominator, to reveal the current floor division error.
        * 4) Store these errors for use in the next correction when this function is called.
        * 5) Note: static analysis tools complain about this "division before multiplication", however, it is intended.
        */
        uint ETHNumerator = _collToAdd.mul(DECIMAL_PRECISION).add(lastETHError_Offset);

        assert(_debtToOffset <= _totalHCHFDeposits);
        if (_debtToOffset == _totalHCHFDeposits) {
            HCHFLossPerUnitStaked = DECIMAL_PRECISION;  // When the Pool depletes to 0, so does each deposit
            lastHCHFLossError_Offset = 0;
        } else {
            uint HCHFLossNumerator = _debtToOffset.mul(DECIMAL_PRECISION).sub(lastHCHFLossError_Offset);
            /*
            * Add 1 to make error in quotient positive. We want "slightly too much" HCHF loss,
            * which ensures the error in any given compoundedHCHFDeposit favors the Stability Pool.
            */
            HCHFLossPerUnitStaked = (HCHFLossNumerator.div(_totalHCHFDeposits)).add(1);
            lastHCHFLossError_Offset = (HCHFLossPerUnitStaked.mul(_totalHCHFDeposits)).sub(HCHFLossNumerator);
        }

        ETHGainPerUnitStaked = ETHNumerator.div(_totalHCHFDeposits);
        lastETHError_Offset = ETHNumerator.sub(ETHGainPerUnitStaked.mul(_totalHCHFDeposits));

        return (ETHGainPerUnitStaked, HCHFLossPerUnitStaked);
    }

    // Update the Stability Pool reward sum S and product P
    function _updateRewardSumAndProduct(uint _ETHGainPerUnitStaked, uint _HCHFLossPerUnitStaked) internal {
        uint currentP = P;
        uint newP;

        assert(_HCHFLossPerUnitStaked <= DECIMAL_PRECISION);
        /*
        * The newProductFactor is the factor by which to change all deposits, due to the depletion of Stability Pool HCHF in the liquidation.
        * We make the product factor 0 if there was a pool-emptying. Otherwise, it is (1 - HCHFLossPerUnitStaked)
        */
        uint newProductFactor = uint(DECIMAL_PRECISION).sub(_HCHFLossPerUnitStaked);

        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint currentS = epochToScaleToSum[currentEpochCached][currentScaleCached];

        /*
        * Calculate the new S first, before we update P.
        * The ETH gain for any given depositor from a liquidation depends on the value of their deposit
        * (and the value of totalDeposits) prior to the Stability being depleted by the debt in the liquidation.
        *
        * Since S corresponds to ETH gain, and P to deposit loss, we update S first.
        */
        uint marginalETHGain = _ETHGainPerUnitStaked.mul(currentP);
        uint newS = currentS.add(marginalETHGain);
        epochToScaleToSum[currentEpochCached][currentScaleCached] = newS;
        emit S_Updated(newS, currentEpochCached, currentScaleCached);

        // If the Stability Pool was emptied, increment the epoch, and reset the scale and product P
        if (newProductFactor == 0) {
            currentEpoch = currentEpochCached.add(1);
            emit EpochUpdated(currentEpoch);
            currentScale = 0;
            emit ScaleUpdated(currentScale);
            newP = DECIMAL_PRECISION;

        // If multiplying P by a non-zero product factor would reduce P below the scale boundary, increment the scale
        } else if (currentP.mul(newProductFactor).div(DECIMAL_PRECISION) < SCALE_FACTOR) {
            newP = currentP.mul(newProductFactor).mul(SCALE_FACTOR).div(DECIMAL_PRECISION); 
            currentScale = currentScaleCached.add(1);
            emit ScaleUpdated(currentScale);
        } else {
            newP = currentP.mul(newProductFactor).div(DECIMAL_PRECISION);
        }

        assert(newP > 0);
        P = newP;

        emit P_Updated(newP);
    }

    function _moveOffsetCollAndDebt(uint _collToAdd, uint _debtToOffset) internal {
        IActivePool activePoolCached = activePool;

        // Cancel the liquidated HCHF debt with the HCHF in the stability pool
        activePoolCached.decreaseHCHFDebt(_debtToOffset);
        _decreaseHCHF(_debtToOffset);

        // Burn the debt that was successfully offset
        _approve(hchfToken.getTokenAddress(), address(hchfToken), _debtToOffset);
        hchfToken.burn(address(this), _debtToOffset);

        activePoolCached.sendETH(address(this), _collToAdd);
    }

    function _decreaseHCHF(uint _amount) internal {
        uint newTotalHCHFDeposits = totalHCHFDeposits.sub(_amount);
        totalHCHFDeposits = newTotalHCHFDeposits;
        emit StabilityPoolHCHFBalanceUpdated(newTotalHCHFDeposits);
    }

    // --- Reward calculator functions for depositor and front end ---

    /* Calculates the ETH gain earned by the deposit since its last snapshots were taken.
    * Given by the formula:  E = d0 * (S - S(0))/P(0)
    * where S(0) and P(0) are the depositor's snapshots of the sum S and product P, respectively.
    * d0 is the last recorded deposit value.
    */
    function getDepositorETHGain(address _depositor) public view override returns (uint) {
        uint initialDeposit = deposits[_depositor].initialValue;

        if (initialDeposit == 0) { return 0; }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint ETHGain = _getETHGainFromSnapshots(initialDeposit, snapshots);
        return ETHGain;
    }

    function _getETHGainFromSnapshots(uint initialDeposit, Snapshots memory snapshots) internal view returns (uint) {
        /*
        * Grab the sum 'S' from the epoch at which the stake was made. The ETH gain may span up to one scale change.
        * If it does, the second portion of the ETH gain is scaled by 1e4.
        * If the gain spans no scale change, the second portion will be 0.
        */
        uint128 epochSnapshot = snapshots.epoch;
        uint128 scaleSnapshot = snapshots.scale;
        uint S_Snapshot = snapshots.S;
        uint P_Snapshot = snapshots.P;

        uint firstPortion = epochToScaleToSum[epochSnapshot][scaleSnapshot].sub(S_Snapshot);
        uint secondPortion = epochToScaleToSum[epochSnapshot][scaleSnapshot.add(1)].div(SCALE_FACTOR);

        uint ETHGain = initialDeposit.mul(firstPortion.add(secondPortion)).div(P_Snapshot).div(DECIMAL_PRECISION);

        return ETHGain;
    }

    /*
    * Calculate the HLQT gain earned by a deposit since its last snapshots were taken.
    * Given by the formula:  HLQT = d0 * (G - G(0))/P(0)
    * where G(0) and P(0) are the depositor's snapshots of the sum G and product P, respectively.
    * d0 is the last recorded deposit value.
    */
    function getDepositorHLQTGain(address _depositor) public view override returns (uint) {
        uint initialDeposit = deposits[_depositor].initialValue;
        if (initialDeposit == 0) {return 0;}

        address frontEndTag = deposits[_depositor].frontEndTag;

        /*
        * If not tagged with a front end, the depositor gets a 100% cut of what their deposit earned.
        * Otherwise, their cut of the deposit's earnings is equal to the kickbackRate, set by the front end through
        * which they made their deposit.
        */
        uint kickbackRate = frontEndTag == address(0) ? DECIMAL_PRECISION : frontEnds[frontEndTag].kickbackRate;

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint HLQTGain = kickbackRate.mul(_getHLQTGainFromSnapshots(initialDeposit, snapshots)).div(DECIMAL_PRECISION);

        return HLQTGain;
    }

    /*
    * Return the HLQT gain earned by the front end. Given by the formula:  E = D0 * (G - G(0))/P(0)
    * where G(0) and P(0) are the depositor's snapshots of the sum G and product P, respectively.
    *
    * D0 is the last recorded value of the front end's total tagged deposits.
    */
    function getFrontEndHLQTGain(address _frontEnd) public view override returns (uint) {
        uint frontEndStake = frontEndStakes[_frontEnd];
        if (frontEndStake == 0) { return 0; }

        uint kickbackRate = frontEnds[_frontEnd].kickbackRate;
        uint frontEndShare = uint(DECIMAL_PRECISION).sub(kickbackRate);

        Snapshots memory snapshots = frontEndSnapshots[_frontEnd];

        uint HLQTGain = frontEndShare.mul(_getHLQTGainFromSnapshots(frontEndStake, snapshots)).div(DECIMAL_PRECISION);
        return HLQTGain;
    }

    function _getHLQTGainFromSnapshots(uint initialStake, Snapshots memory snapshots) internal view returns (uint) {
       /*
        * Grab the sum 'G' from the epoch at which the stake was made. The HLQT gain may span up to one scale change.
        * If it does, the second portion of the HLQT gain is scaled by 1e4.
        * If the gain spans no scale change, the second portion will be 0.
        */
        uint128 epochSnapshot = snapshots.epoch;
        uint128 scaleSnapshot = snapshots.scale;
        uint G_Snapshot = snapshots.G;
        uint P_Snapshot = snapshots.P;

        uint firstPortion = epochToScaleToG[epochSnapshot][scaleSnapshot].sub(G_Snapshot);
        uint secondPortion = epochToScaleToG[epochSnapshot][scaleSnapshot.add(1)].div(SCALE_FACTOR);

        uint HLQTGain = initialStake.mul(firstPortion.add(secondPortion)).div(P_Snapshot).div(DECIMAL_PRECISION);

        return HLQTGain;
    }

    // --- Compounded deposit and compounded front end stake ---

    /*
    * Return the user's compounded deposit. Given by the formula:  d = d0 * P/P(0)
    * where P(0) is the depositor's snapshot of the product P, taken when they last updated their deposit.
    */
    function getCompoundedHCHFDeposit(address _depositor) public view override returns (uint) {
        uint initialDeposit = deposits[_depositor].initialValue;
        if (initialDeposit == 0) { return 0; }

        Snapshots memory snapshots = depositSnapshots[_depositor];

        uint compoundedDeposit = _getCompoundedStakeFromSnapshots(initialDeposit, snapshots);
        return compoundedDeposit;
    }

    /*
    * Return the front end's compounded stake. Given by the formula:  D = D0 * P/P(0)
    * where P(0) is the depositor's snapshot of the product P, taken at the last time
    * when one of the front end's tagged deposits updated their deposit.
    *
    * The front end's compounded stake is equal to the sum of its depositors' compounded deposits.
    */
    function getCompoundedFrontEndStake(address _frontEnd) public view override returns (uint) {
        uint frontEndStake = frontEndStakes[_frontEnd];
        if (frontEndStake == 0) { return 0; }

        Snapshots memory snapshots = frontEndSnapshots[_frontEnd];

        uint compoundedFrontEndStake = _getCompoundedStakeFromSnapshots(frontEndStake, snapshots);
        return compoundedFrontEndStake;
    }

    // Internal function, used to calculcate compounded deposits and compounded front end stakes.
    function _getCompoundedStakeFromSnapshots(
        uint initialStake,
        Snapshots memory snapshots
    )
        internal
        view
        returns (uint)
    {
        uint snapshot_P = snapshots.P;
        uint128 scaleSnapshot = snapshots.scale;
        uint128 epochSnapshot = snapshots.epoch;

        // If stake was made before a pool-emptying event, then it has been fully cancelled with debt -- so, return 0
        if (epochSnapshot < currentEpoch) { return 0; }

        uint compoundedStake;
        uint128 scaleDiff = currentScale.sub(scaleSnapshot);

        /* Compute the compounded stake. If a scale change in P was made during the stake's lifetime,
        * account for it. If more than one scale change was made, then the stake has decreased by a factor of
        * at least 1e-4 -- so return 0.
        */
        if (scaleDiff == 0) {
            compoundedStake = initialStake.mul(P).div(snapshot_P);
        } else if (scaleDiff == 1) {
            compoundedStake = initialStake.mul(P).div(snapshot_P).div(SCALE_FACTOR);
        } else { // if scaleDiff >= 2
            compoundedStake = 0;
        }

        /*
        * If compounded deposit is less than a billionth of the initial deposit, return 0.
        *
        * NOTE: originally, this line was in place to stop rounding errors making the deposit too large. However, the error
        * corrections should ensure the error in P "favors the Pool", i.e. any given compounded deposit should slightly less
        * than it's theoretical value.
        *
        * Thus it's unclear whether this line is still really needed.
        */
        if (compoundedStake < initialStake.div(1e4)) {return 0;}

        return compoundedStake;
    }

    // --- Sender functions for HCHF deposit, ETH gains and HLQT gains ---

    // Transfer the HCHF tokens from the user to the Stability Pool's address, and update its recorded HCHF
    function _sendHCHFtoStabilityPool(address _address, uint _amount) internal {
        hchfToken.sendToPool(_address, address(this), _amount);
        uint newTotalHCHFDeposits = totalHCHFDeposits.add(_amount);
        totalHCHFDeposits = newTotalHCHFDeposits;
        emit StabilityPoolHCHFBalanceUpdated(newTotalHCHFDeposits);
    }

    function _sendETHGainToDepositor(uint _amount) internal {
        if (_amount == 0) {return;}
        uint newETH = ETH.sub(_amount);
        ETH = newETH;
        emit StabilityPoolETHBalanceUpdated(newETH);
        emit EtherSent(msg.sender, _amount);

        (bool success, ) = msg.sender.call{ value: _amount }("");
        require(success, "StabilityPool: sending ETH failed");
    }

    // Send HCHF to user and decrease HCHF in Pool
    function _sendHCHFToDepositor(address _depositor, uint HCHFWithdrawal) internal {
        if (HCHFWithdrawal == 0) {return;}


        _approve(hchfToken.getTokenAddress(), address(hchfToken), HCHFWithdrawal);
        hchfToken.returnFromPool(address(this), _depositor, HCHFWithdrawal);
        _decreaseHCHF(HCHFWithdrawal);
    }

    // --- External Front End functions ---

    // Front end makes a one-time selection of kickback rate upon registering
    function registerFrontEnd(uint _kickbackRate) external override {
        _requireFrontEndNotRegistered(msg.sender);
        _requireUserHasNoDeposit(msg.sender);
        _requireValidKickbackRate(_kickbackRate);

        frontEnds[msg.sender].kickbackRate = _kickbackRate;
        frontEnds[msg.sender].registered = true;

        emit FrontEndRegistered(msg.sender, _kickbackRate);
    }

    // --- Stability Pool Deposit Functionality ---
    function _setFrontEndTag(address _depositor, address _frontEndTag) internal {
        deposits[_depositor].frontEndTag = _frontEndTag;
        emit FrontEndTagSet(_depositor, _frontEndTag);
    }


    function _updateDepositAndSnapshots(address _depositor, uint _newValue) internal {
        deposits[_depositor].initialValue = _newValue;

        if (_newValue == 0) {
            delete deposits[_depositor].frontEndTag;
            delete depositSnapshots[_depositor];
            emit DepositSnapshotUpdated(_depositor, 0, 0, 0);
            return;
        }
        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint currentP = P;

        // Get S and G for the current epoch and current scale
        uint currentS = epochToScaleToSum[currentEpochCached][currentScaleCached];
        uint currentG = epochToScaleToG[currentEpochCached][currentScaleCached];

        // Record new snapshots of the latest running product P, sum S, and sum G, for the depositor
        depositSnapshots[_depositor].P = currentP;
        depositSnapshots[_depositor].S = currentS;
        depositSnapshots[_depositor].G = currentG;
        depositSnapshots[_depositor].scale = currentScaleCached;
        depositSnapshots[_depositor].epoch = currentEpochCached;

        emit DepositSnapshotUpdated(_depositor, currentP, currentS, currentG);
    }

    function _updateFrontEndStakeAndSnapshots(address _frontEnd, uint _newValue) internal {
        frontEndStakes[_frontEnd] = _newValue;

        if (_newValue == 0) {
            delete frontEndSnapshots[_frontEnd];
            emit FrontEndSnapshotUpdated(_frontEnd, 0, 0);
            return;
        }

        uint128 currentScaleCached = currentScale;
        uint128 currentEpochCached = currentEpoch;
        uint currentP = P;

        // Get G for the current epoch and current scale
        uint currentG = epochToScaleToG[currentEpochCached][currentScaleCached];

        // Record new snapshots of the latest running product P and sum G for the front end
        frontEndSnapshots[_frontEnd].P = currentP;
        frontEndSnapshots[_frontEnd].G = currentG;
        frontEndSnapshots[_frontEnd].scale = currentScaleCached;
        frontEndSnapshots[_frontEnd].epoch = currentEpochCached;

        emit FrontEndSnapshotUpdated(_frontEnd, currentP, currentG);
    }

    function _payOutHLQTGains(ICommunityIssuance _communityIssuance, address _depositor, address _frontEnd) internal {
        // Pay out front end's HLQT gain
        if (_frontEnd != address(0)) {
            uint frontEndHLQTGain = getFrontEndHLQTGain(_frontEnd);
            try _communityIssuance.sendHLQT(_frontEnd, frontEndHLQTGain) {
                emit HLQTPaidToFrontEnd(_frontEnd, frontEndHLQTGain);
            } catch {
                // if transfer to frontend fails, send tokens to depositor
                _communityIssuance.sendHLQT(_depositor, frontEndHLQTGain);
                emit HLQTPaidToFrontEndFailed(_frontEnd, frontEndHLQTGain);
            }
        }

        // Pay out depositor's HLQT gain
        uint depositorHLQTGain = getDepositorHLQTGain(_depositor);
        _communityIssuance.sendHLQT(_depositor, depositorHLQTGain);
        emit HLQTPaidToDepositor(_depositor, depositorHLQTGain);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require( msg.sender == address(activePool), "StabilityPool: Caller is not ActivePool");
    }

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == address(troveManager), "StabilityPool: Caller is not TroveManager");
    }

    function _requireNoUnderCollateralizedTroves() internal {
        uint price = priceFeed.fetchPrice();
        address lowestTrove = sortedTroves.getLast();
        uint ICR = troveManager.getCurrentICR(lowestTrove, price);
        require(ICR >= MCR, "StabilityPool: Cannot withdraw while there are troves with ICR < MCR");
    }

    function _requireUserHasDeposit(uint _initialDeposit) internal pure {
        require(_initialDeposit > 0, 'StabilityPool: User must have a non-zero deposit');
    }

     function _requireUserHasNoDeposit(address _address) internal view {
        uint initialDeposit = deposits[_address].initialValue;
        require(initialDeposit == 0, 'StabilityPool: User must have no deposit');
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, 'StabilityPool: Amount must be non-zero');
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(troveManager.getTroveStatus(_depositor) == 1, "StabilityPool: caller must have an active trove to withdraw ETHGain to");
    }

    function _requireUserHasETHGain(address _depositor) internal view {
        uint ETHGain = getDepositorETHGain(_depositor);
        require(ETHGain > 0, "StabilityPool: caller must have non-zero ETH Gain");
    }

    function _requireFrontEndNotRegistered(address _address) internal view {
        require(!frontEnds[_address].registered, "StabilityPool: must not already be a registered front end");
    }

     function _requireFrontEndIsRegisteredOrZero(address _address) internal view {
        require(frontEnds[_address].registered || _address == address(0),
            "StabilityPool: Tag must be a registered front end, or the zero address");
    }

    function  _requireValidKickbackRate(uint _kickbackRate) internal pure {
        require (_kickbackRate <= DECIMAL_PRECISION, "StabilityPool: Kickback rate must be in range [0,1]");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        ETH = ETH.add(msg.value);
        StabilityPoolETHBalanceUpdated(ETH);
    }
}
