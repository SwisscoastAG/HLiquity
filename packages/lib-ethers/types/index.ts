
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Log } from "@ethersproject/abstract-provider";
import { BytesLike } from "@ethersproject/bytes";
import {
  Overrides,
  CallOverrides,
  PayableOverrides,
  EventFilter
} from "@ethersproject/contracts";

import { _TypedLiquityContract, _TypedLogDescription } from "../src/contracts";

interface ActivePoolCalls {
  NAME(_overrides?: CallOverrides): Promise<string>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  defaultPoolAddress(_overrides?: CallOverrides): Promise<string>;
  getETH(_overrides?: CallOverrides): Promise<BigNumber>;
  getHCHFDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  stabilityPoolAddress(_overrides?: CallOverrides): Promise<string>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface ActivePoolTransactions {
  decreaseHCHFDebt(_amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  increaseHCHFDebt(_amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  sendETH(_account: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  setAddresses(_borrowerOperationsAddress: string, _troveManagerAddress: string, _stabilityPoolAddress: string, _defaultPoolAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface ActivePool
  extends _TypedLiquityContract<ActivePoolCalls, ActivePoolTransactions> {
  readonly filters: {
    ActivePoolAddressChanged(_newActivePoolAddress?: null): EventFilter;
    ActivePoolETHBalanceUpdated(_ETH?: null): EventFilter;
    ActivePoolHCHFDebtUpdated(_HCHFDebt?: null): EventFilter;
    BorrowerOperationsAddressChanged(_newBorrowerOperationsAddress?: null): EventFilter;
    DefaultPoolAddressChanged(_newDefaultPoolAddress?: null): EventFilter;
    ETHBalanceUpdated(_newBalance?: null): EventFilter;
    EtherSent(_to?: null, _amount?: null): EventFilter;
    HCHFBalanceUpdated(_newBalance?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    StabilityPoolAddressChanged(_newStabilityPoolAddress?: null): EventFilter;
    TroveManagerAddressChanged(_newTroveManagerAddress?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressChanged"): _TypedLogDescription<{ _newActivePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "ActivePoolETHBalanceUpdated"): _TypedLogDescription<{ _ETH: BigNumber }>[];
  extractEvents(logs: Log[], name: "ActivePoolHCHFDebtUpdated"): _TypedLogDescription<{ _HCHFDebt: BigNumber }>[];
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressChanged"): _TypedLogDescription<{ _newBorrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "DefaultPoolAddressChanged"): _TypedLogDescription<{ _newDefaultPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "ETHBalanceUpdated"): _TypedLogDescription<{ _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "EtherSent"): _TypedLogDescription<{ _to: string; _amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "HCHFBalanceUpdated"): _TypedLogDescription<{ _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "StabilityPoolAddressChanged"): _TypedLogDescription<{ _newStabilityPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _newTroveManagerAddress: string }>[];
}

interface BorrowerOperationsCalls {
  BORROWING_FEE_FLOOR(_overrides?: CallOverrides): Promise<BigNumber>;
  CCR(_overrides?: CallOverrides): Promise<BigNumber>;
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  HCHF_GAS_COMPENSATION(_overrides?: CallOverrides): Promise<BigNumber>;
  MCR(_overrides?: CallOverrides): Promise<BigNumber>;
  MIN_NET_DEBT(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  PERCENT_DIVISOR(_overrides?: CallOverrides): Promise<BigNumber>;
  _100pct(_overrides?: CallOverrides): Promise<BigNumber>;
  activePool(_overrides?: CallOverrides): Promise<string>;
  defaultPool(_overrides?: CallOverrides): Promise<string>;
  getCompositeDebt(_debt: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  getEntireSystemColl(_overrides?: CallOverrides): Promise<BigNumber>;
  getEntireSystemDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  hchfToken(_overrides?: CallOverrides): Promise<string>;
  hlqtStaking(_overrides?: CallOverrides): Promise<string>;
  hlqtStakingAddress(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  priceFeed(_overrides?: CallOverrides): Promise<string>;
  sortedTroves(_overrides?: CallOverrides): Promise<string>;
  troveManager(_overrides?: CallOverrides): Promise<string>;
}

interface BorrowerOperationsTransactions {
  addColl(_upperHint: string, _lowerHint: string, _overrides?: PayableOverrides): Promise<void>;
  adjustTrove(_maxFeePercentage: BigNumberish, _collWithdrawal: BigNumberish, _HCHFChange: BigNumberish, _isDebtIncrease: boolean, _upperHint: string, _lowerHint: string, _overrides?: PayableOverrides): Promise<void>;
  claimCollateral(_overrides?: Overrides): Promise<void>;
  closeTrove(_overrides?: Overrides): Promise<void>;
  moveETHGainToTrove(_borrower: string, _upperHint: string, _lowerHint: string, _overrides?: PayableOverrides): Promise<void>;
  openTrove(_maxFeePercentage: BigNumberish, _HCHFAmount: BigNumberish, _upperHint: string, _lowerHint: string, _overrides?: PayableOverrides): Promise<void>;
  repayHCHF(_HCHFAmount: BigNumberish, _upperHint: string, _lowerHint: string, _overrides?: Overrides): Promise<void>;
  setAddresses(_troveManagerAddress: string, _activePoolAddress: string, _defaultPoolAddress: string, _stabilityPoolAddress: string, _gasPoolAddress: string, _collSurplusPoolAddress: string, _priceFeedAddress: string, _sortedTrovesAddress: string, _hchfTokenAddress: string, _hlqtStakingAddress: string, _overrides?: Overrides): Promise<void>;
  withdrawColl(_collWithdrawal: BigNumberish, _upperHint: string, _lowerHint: string, _overrides?: Overrides): Promise<void>;
  withdrawHCHF(_maxFeePercentage: BigNumberish, _HCHFAmount: BigNumberish, _upperHint: string, _lowerHint: string, _overrides?: Overrides): Promise<void>;
}

export interface BorrowerOperations
  extends _TypedLiquityContract<BorrowerOperationsCalls, BorrowerOperationsTransactions> {
  readonly filters: {
    ActivePoolAddressChanged(_activePoolAddress?: null): EventFilter;
    CollSurplusPoolAddressChanged(_collSurplusPoolAddress?: null): EventFilter;
    DefaultPoolAddressChanged(_defaultPoolAddress?: null): EventFilter;
    GasPoolAddressChanged(_gasPoolAddress?: null): EventFilter;
    HCHFBorrowingFeePaid(_borrower?: string | null, _HCHFFee?: null): EventFilter;
    HCHFTokenAddressChanged(_hchfTokenAddress?: null): EventFilter;
    HLQTStakingAddressChanged(_hlqtStakingAddress?: null): EventFilter;
    LQTYStakingAddressChanged(_hlqtStakingAddress?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    PriceFeedAddressChanged(_newPriceFeedAddress?: null): EventFilter;
    SortedTrovesAddressChanged(_sortedTrovesAddress?: null): EventFilter;
    StabilityPoolAddressChanged(_stabilityPoolAddress?: null): EventFilter;
    TroveCreated(_borrower?: string | null, arrayIndex?: null): EventFilter;
    TroveManagerAddressChanged(_newTroveManagerAddress?: null): EventFilter;
    TroveUpdated(_borrower?: string | null, _debt?: null, _coll?: null, stake?: null, operation?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressChanged"): _TypedLogDescription<{ _activePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "CollSurplusPoolAddressChanged"): _TypedLogDescription<{ _collSurplusPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "DefaultPoolAddressChanged"): _TypedLogDescription<{ _defaultPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "GasPoolAddressChanged"): _TypedLogDescription<{ _gasPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "HCHFBorrowingFeePaid"): _TypedLogDescription<{ _borrower: string; _HCHFFee: BigNumber }>[];
  extractEvents(logs: Log[], name: "HCHFTokenAddressChanged"): _TypedLogDescription<{ _hchfTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "HLQTStakingAddressChanged"): _TypedLogDescription<{ _hlqtStakingAddress: string }>[];
  extractEvents(logs: Log[], name: "LQTYStakingAddressChanged"): _TypedLogDescription<{ _hlqtStakingAddress: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "PriceFeedAddressChanged"): _TypedLogDescription<{ _newPriceFeedAddress: string }>[];
  extractEvents(logs: Log[], name: "SortedTrovesAddressChanged"): _TypedLogDescription<{ _sortedTrovesAddress: string }>[];
  extractEvents(logs: Log[], name: "StabilityPoolAddressChanged"): _TypedLogDescription<{ _stabilityPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "TroveCreated"): _TypedLogDescription<{ _borrower: string; arrayIndex: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _newTroveManagerAddress: string }>[];
  extractEvents(logs: Log[], name: "TroveUpdated"): _TypedLogDescription<{ _borrower: string; _debt: BigNumber; _coll: BigNumber; stake: BigNumber; operation: number }>[];
}

interface CollSurplusPoolCalls {
  NAME(_overrides?: CallOverrides): Promise<string>;
  activePoolAddress(_overrides?: CallOverrides): Promise<string>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  getCollateral(_account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getETH(_overrides?: CallOverrides): Promise<BigNumber>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface CollSurplusPoolTransactions {
  accountSurplus(_account: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  claimColl(_account: string, _overrides?: Overrides): Promise<void>;
  setAddresses(_borrowerOperationsAddress: string, _troveManagerAddress: string, _activePoolAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface CollSurplusPool
  extends _TypedLiquityContract<CollSurplusPoolCalls, CollSurplusPoolTransactions> {
  readonly filters: {
    ActivePoolAddressChanged(_newActivePoolAddress?: null): EventFilter;
    BorrowerOperationsAddressChanged(_newBorrowerOperationsAddress?: null): EventFilter;
    CollBalanceUpdated(_account?: string | null, _newBalance?: null): EventFilter;
    EtherSent(_to?: null, _amount?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    TroveManagerAddressChanged(_newTroveManagerAddress?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressChanged"): _TypedLogDescription<{ _newActivePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressChanged"): _TypedLogDescription<{ _newBorrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "CollBalanceUpdated"): _TypedLogDescription<{ _account: string; _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "EtherSent"): _TypedLogDescription<{ _to: string; _amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _newTroveManagerAddress: string }>[];
}

interface CommunityIssuanceCalls {
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  HLQTSupplyCap(_overrides?: CallOverrides): Promise<BigNumber>;
  ISSUANCE_FACTOR(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  SECONDS_IN_ONE_MINUTE(_overrides?: CallOverrides): Promise<BigNumber>;
  deploymentTime(_overrides?: CallOverrides): Promise<BigNumber>;
  hlqtToken(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  stabilityPoolAddress(_overrides?: CallOverrides): Promise<string>;
  totalHLQTIssued(_overrides?: CallOverrides): Promise<BigNumber>;
}

interface CommunityIssuanceTransactions {
  issueHLQT(_overrides?: Overrides): Promise<BigNumber>;
  sendHLQT(_account: string, _HLQTamount: BigNumberish, _overrides?: Overrides): Promise<void>;
  setAddresses(_hlqtTokenAddress: string, _stabilityPoolAddress: string, _overrides?: Overrides): Promise<void>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
}

export interface CommunityIssuance
  extends _TypedLiquityContract<CommunityIssuanceCalls, CommunityIssuanceTransactions> {
  readonly filters: {
    HLQTTokenAddressSet(_hlqtTokenAddress?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    StabilityPoolAddressSet(_stabilityPoolAddress?: null): EventFilter;
    TotalHLQTIssuedUpdated(_totalHLQTIssued?: null): EventFilter;
    Transfer(token?: string | null, from?: string | null, to?: string | null, value?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "HLQTTokenAddressSet"): _TypedLogDescription<{ _hlqtTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "StabilityPoolAddressSet"): _TypedLogDescription<{ _stabilityPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "TotalHLQTIssuedUpdated"): _TypedLogDescription<{ _totalHLQTIssued: BigNumber }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ token: string; from: string; to: string; value: BigNumber }>[];
}

interface DefaultPoolCalls {
  NAME(_overrides?: CallOverrides): Promise<string>;
  activePoolAddress(_overrides?: CallOverrides): Promise<string>;
  getETH(_overrides?: CallOverrides): Promise<BigNumber>;
  getHCHFDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface DefaultPoolTransactions {
  decreaseHCHFDebt(_amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  increaseHCHFDebt(_amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  sendETHToActivePool(_amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  setAddresses(_troveManagerAddress: string, _activePoolAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface DefaultPool
  extends _TypedLiquityContract<DefaultPoolCalls, DefaultPoolTransactions> {
  readonly filters: {
    ActivePoolAddressChanged(_newActivePoolAddress?: null): EventFilter;
    DefaultPoolAddressChanged(_newDefaultPoolAddress?: null): EventFilter;
    DefaultPoolETHBalanceUpdated(_ETH?: null): EventFilter;
    DefaultPoolHCHFDebtUpdated(_HCHFDebt?: null): EventFilter;
    ETHBalanceUpdated(_newBalance?: null): EventFilter;
    EtherSent(_to?: null, _amount?: null): EventFilter;
    HCHFBalanceUpdated(_newBalance?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    StabilityPoolAddressChanged(_newStabilityPoolAddress?: null): EventFilter;
    TroveManagerAddressChanged(_newTroveManagerAddress?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressChanged"): _TypedLogDescription<{ _newActivePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "DefaultPoolAddressChanged"): _TypedLogDescription<{ _newDefaultPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "DefaultPoolETHBalanceUpdated"): _TypedLogDescription<{ _ETH: BigNumber }>[];
  extractEvents(logs: Log[], name: "DefaultPoolHCHFDebtUpdated"): _TypedLogDescription<{ _HCHFDebt: BigNumber }>[];
  extractEvents(logs: Log[], name: "ETHBalanceUpdated"): _TypedLogDescription<{ _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "EtherSent"): _TypedLogDescription<{ _to: string; _amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "HCHFBalanceUpdated"): _TypedLogDescription<{ _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "StabilityPoolAddressChanged"): _TypedLogDescription<{ _newStabilityPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _newTroveManagerAddress: string }>[];
}

interface ERC20MockCalls {
  allowance(owner: string, spender: string, _overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  decimals(_overrides?: CallOverrides): Promise<number>;
  name(_overrides?: CallOverrides): Promise<string>;
  symbol(_overrides?: CallOverrides): Promise<string>;
  totalSupply(_overrides?: CallOverrides): Promise<BigNumber>;
}

interface ERC20MockTransactions {
  approve(spender: string, amount: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  approveInternal(owner: string, spender: string, value: BigNumberish, _overrides?: Overrides): Promise<void>;
  burn(account: string, amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  decreaseAllowance(spender: string, subtractedValue: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  increaseAllowance(spender: string, addedValue: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  mint(account: string, amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  transfer(recipient: string, amount: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  transferFrom(sender: string, recipient: string, amount: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  transferInternal(from: string, to: string, value: BigNumberish, _overrides?: Overrides): Promise<void>;
}

export interface ERC20Mock
  extends _TypedLiquityContract<ERC20MockCalls, ERC20MockTransactions> {
  readonly filters: {
    Approval(owner?: string | null, spender?: string | null, value?: null): EventFilter;
    Transfer(from?: string | null, to?: string | null, value?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "Approval"): _TypedLogDescription<{ owner: string; spender: string; value: BigNumber }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ from: string; to: string; value: BigNumber }>[];
}

interface GasPoolCalls {
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  hchfToken(_overrides?: CallOverrides): Promise<string>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface GasPoolTransactions {
  approveToken(token: string, spender: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
}

export interface GasPool
  extends _TypedLiquityContract<GasPoolCalls, GasPoolTransactions> {
  readonly filters: {
  };
}

interface HintHelpersCalls {
  BORROWING_FEE_FLOOR(_overrides?: CallOverrides): Promise<BigNumber>;
  CCR(_overrides?: CallOverrides): Promise<BigNumber>;
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  HCHF_GAS_COMPENSATION(_overrides?: CallOverrides): Promise<BigNumber>;
  MCR(_overrides?: CallOverrides): Promise<BigNumber>;
  MIN_NET_DEBT(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  PERCENT_DIVISOR(_overrides?: CallOverrides): Promise<BigNumber>;
  _100pct(_overrides?: CallOverrides): Promise<BigNumber>;
  activePool(_overrides?: CallOverrides): Promise<string>;
  computeCR(_coll: BigNumberish, _debt: BigNumberish, _price: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  computeNominalCR(_coll: BigNumberish, _debt: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  defaultPool(_overrides?: CallOverrides): Promise<string>;
  getApproxHint(_CR: BigNumberish, _numTrials: BigNumberish, _inputRandomSeed: BigNumberish, _overrides?: CallOverrides): Promise<{ hintAddress: string; diff: BigNumber; latestRandomSeed: BigNumber }>;
  getEntireSystemColl(_overrides?: CallOverrides): Promise<BigNumber>;
  getEntireSystemDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  getRedemptionHints(_HCHFamount: BigNumberish, _price: BigNumberish, _maxIterations: BigNumberish, _overrides?: CallOverrides): Promise<{ firstRedemptionHint: string; partialRedemptionHintNICR: BigNumber; truncatedHCHFamount: BigNumber }>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  priceFeed(_overrides?: CallOverrides): Promise<string>;
  sortedTroves(_overrides?: CallOverrides): Promise<string>;
  troveManager(_overrides?: CallOverrides): Promise<string>;
}

interface HintHelpersTransactions {
  setAddresses(_sortedTrovesAddress: string, _troveManagerAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface HintHelpers
  extends _TypedLiquityContract<HintHelpersCalls, HintHelpersTransactions> {
  readonly filters: {
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    SortedTrovesAddressChanged(_sortedTrovesAddress?: null): EventFilter;
    TroveManagerAddressChanged(_troveManagerAddress?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "SortedTrovesAddressChanged"): _TypedLogDescription<{ _sortedTrovesAddress: string }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _troveManagerAddress: string }>[];
}

interface IERC20Calls {
  allowance(owner: string, spender: string, _overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  totalSupply(_overrides?: CallOverrides): Promise<BigNumber>;
}

interface IERC20Transactions {
  approve(spender: string, amount: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  transfer(recipient: string, amount: BigNumberish, _overrides?: Overrides): Promise<boolean>;
  transferFrom(sender: string, recipient: string, amount: BigNumberish, _overrides?: Overrides): Promise<boolean>;
}

export interface IERC20
  extends _TypedLiquityContract<IERC20Calls, IERC20Transactions> {
  readonly filters: {
    Approval(owner?: string | null, spender?: string | null, value?: null): EventFilter;
    Transfer(from?: string | null, to?: string | null, value?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "Approval"): _TypedLogDescription<{ owner: string; spender: string; value: BigNumber }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ from: string; to: string; value: BigNumber }>[];
}

interface LockupContractFactoryCalls {
  NAME(_overrides?: CallOverrides): Promise<string>;
  SECONDS_IN_ONE_YEAR(_overrides?: CallOverrides): Promise<BigNumber>;
  hlqtTokenAddress(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  isRegisteredLockup(_contractAddress: string, _overrides?: CallOverrides): Promise<boolean>;
  lockupContractToDeployer(arg0: string, _overrides?: CallOverrides): Promise<string>;
  owner(_overrides?: CallOverrides): Promise<string>;
}

interface LockupContractFactoryTransactions {
  deployLockupContract(_beneficiary: string, _unlockTime: BigNumberish, _overrides?: Overrides): Promise<void>;
  setHLQTTokenAddress(_hlqtTokenAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface LockupContractFactory
  extends _TypedLiquityContract<LockupContractFactoryCalls, LockupContractFactoryTransactions> {
  readonly filters: {
    HLQTTokenAddressSet(_hlqtTokenAddress?: null): EventFilter;
    LockupContractDeployedThroughFactory(_lockupContractAddress?: null, _beneficiary?: null, _unlockTime?: null, _deployer?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
  };
  extractEvents(logs: Log[], name: "HLQTTokenAddressSet"): _TypedLogDescription<{ _hlqtTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "LockupContractDeployedThroughFactory"): _TypedLogDescription<{ _lockupContractAddress: string; _beneficiary: string; _unlockTime: BigNumber; _deployer: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
}

interface HCHFTokenCalls {
  balanceOf(account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  decimals(_overrides?: CallOverrides): Promise<number>;
  getTokenAddress(_overrides?: CallOverrides): Promise<string>;
  name(_overrides?: CallOverrides): Promise<string>;
  stabilityPoolAddress(_overrides?: CallOverrides): Promise<string>;
  symbol(_overrides?: CallOverrides): Promise<string>;
  tokenAddress(_overrides?: CallOverrides): Promise<string>;
  totalSupply(_overrides?: CallOverrides): Promise<BigNumber>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface HCHFTokenTransactions {
  burn(_account: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  mint(_account: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  returnFromPool(_poolAddress: string, _receiver: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  sendToPool(_sender: string, _poolAddress: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
}

export interface HCHFToken
  extends _TypedLiquityContract<HCHFTokenCalls, HCHFTokenTransactions> {
  readonly filters: {
    BorrowerOperationsAddressChanged(_newBorrowerOperationsAddress?: null): EventFilter;
    MetadataSet(admin?: string | null, metadata?: null): EventFilter;
    MintedToken(newTotalSupply?: null, serialNumbers?: null): EventFilter;
    ResponseCode(responseCode?: null): EventFilter;
    StabilityPoolAddressChanged(_newStabilityPoolAddress?: null): EventFilter;
    TokensBurned(burner?: string | null, token?: string | null, amount?: null): EventFilter;
    TokensMinted(minter?: string | null, token?: string | null, amount?: null, account?: string | null): EventFilter;
    Transfer(token?: string | null, from?: string | null, to?: string | null, value?: null): EventFilter;
    TroveManagerAddressChanged(_troveManagerAddress?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressChanged"): _TypedLogDescription<{ _newBorrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "MetadataSet"): _TypedLogDescription<{ admin: string; metadata: string }>[];
  extractEvents(logs: Log[], name: "MintedToken"): _TypedLogDescription<{ newTotalSupply: BigNumber; serialNumbers: BigNumber[] }>[];
  extractEvents(logs: Log[], name: "ResponseCode"): _TypedLogDescription<{ responseCode: BigNumber }>[];
  extractEvents(logs: Log[], name: "StabilityPoolAddressChanged"): _TypedLogDescription<{ _newStabilityPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "TokensBurned"): _TypedLogDescription<{ burner: string; token: string; amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "TokensMinted"): _TypedLogDescription<{ minter: string; token: string; amount: BigNumber; account: string }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ token: string; from: string; to: string; value: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _troveManagerAddress: string }>[];
}

interface HLQTStakingCalls {
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  F_ETH(_overrides?: CallOverrides): Promise<BigNumber>;
  F_HCHF(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  activePoolAddress(_overrides?: CallOverrides): Promise<string>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  getPendingETHGain(_user: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getPendingHCHFGain(_user: string, _overrides?: CallOverrides): Promise<BigNumber>;
  hchfToken(_overrides?: CallOverrides): Promise<string>;
  hlqtToken(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  snapshots(arg0: string, _overrides?: CallOverrides): Promise<{ F_ETH_Snapshot: BigNumber; F_HCHF_Snapshot: BigNumber }>;
  stakes(arg0: string, _overrides?: CallOverrides): Promise<BigNumber>;
  totalHLQTStaked(_overrides?: CallOverrides): Promise<BigNumber>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface HLQTStakingTransactions {
  increaseF_ETH(_ETHFee: BigNumberish, _overrides?: Overrides): Promise<void>;
  increaseF_HCHF(_HCHFFee: BigNumberish, _overrides?: Overrides): Promise<void>;
  setAddresses(_hlqtTokenAddress: string, _hchfTokenAddress: string, _troveManagerAddress: string, _borrowerOperationsAddress: string, _activePoolAddress: string, _overrides?: Overrides): Promise<void>;
  stake(_HLQTamount: BigNumberish, _overrides?: Overrides): Promise<void>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  unstake(_HLQTamount: BigNumberish, _overrides?: Overrides): Promise<void>;
}

export interface HLQTStaking
  extends _TypedLiquityContract<HLQTStakingCalls, HLQTStakingTransactions> {
  readonly filters: {
    ActivePoolAddressSet(_activePoolAddress?: null): EventFilter;
    BorrowerOperationsAddressSet(_borrowerOperationsAddress?: null): EventFilter;
    EtherSent(_account?: null, _amount?: null): EventFilter;
    F_ETHUpdated(_F_ETH?: null): EventFilter;
    F_HCHFUpdated(_F_HCHF?: null): EventFilter;
    HCHFTokenAddressSet(_hchfTokenAddress?: null): EventFilter;
    HLQTTokenAddressSet(_hlqtTokenAddress?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    StakeChanged(staker?: string | null, newStake?: null): EventFilter;
    StakerSnapshotsUpdated(_staker?: null, _F_ETH?: null, _F_HCHF?: null): EventFilter;
    StakingGainsWithdrawn(staker?: string | null, HCHFGain?: null, ETHGain?: null): EventFilter;
    TotalHLQTStakedUpdated(_totalHLQTStaked?: null): EventFilter;
    Transfer(token?: string | null, from?: string | null, to?: string | null, value?: null): EventFilter;
    TroveManagerAddressSet(_troveManager?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressSet"): _TypedLogDescription<{ _activePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressSet"): _TypedLogDescription<{ _borrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "EtherSent"): _TypedLogDescription<{ _account: string; _amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "F_ETHUpdated"): _TypedLogDescription<{ _F_ETH: BigNumber }>[];
  extractEvents(logs: Log[], name: "F_HCHFUpdated"): _TypedLogDescription<{ _F_HCHF: BigNumber }>[];
  extractEvents(logs: Log[], name: "HCHFTokenAddressSet"): _TypedLogDescription<{ _hchfTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "HLQTTokenAddressSet"): _TypedLogDescription<{ _hlqtTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "StakeChanged"): _TypedLogDescription<{ staker: string; newStake: BigNumber }>[];
  extractEvents(logs: Log[], name: "StakerSnapshotsUpdated"): _TypedLogDescription<{ _staker: string; _F_ETH: BigNumber; _F_HCHF: BigNumber }>[];
  extractEvents(logs: Log[], name: "StakingGainsWithdrawn"): _TypedLogDescription<{ staker: string; HCHFGain: BigNumber; ETHGain: BigNumber }>[];
  extractEvents(logs: Log[], name: "TotalHLQTStakedUpdated"): _TypedLogDescription<{ _totalHLQTStaked: BigNumber }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ token: string; from: string; to: string; value: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressSet"): _TypedLogDescription<{ _troveManager: string }>[];
}

interface HLQTTokenCalls {
  ONE_YEAR_IN_SECONDS(_overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  communityIssuanceAddress(_overrides?: CallOverrides): Promise<string>;
  decimals(_overrides?: CallOverrides): Promise<number>;
  getDeploymentStartTime(_overrides?: CallOverrides): Promise<BigNumber>;
  getLpRewardsEntitlement(_overrides?: CallOverrides): Promise<BigNumber>;
  getTokenAddress(_overrides?: CallOverrides): Promise<string>;
  hlqtStakingAddress(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  lockupContractFactory(_overrides?: CallOverrides): Promise<string>;
  multisigAddress(_overrides?: CallOverrides): Promise<string>;
  name(_overrides?: CallOverrides): Promise<string>;
  owner(_overrides?: CallOverrides): Promise<string>;
  symbol(_overrides?: CallOverrides): Promise<string>;
  tokenAddress(_overrides?: CallOverrides): Promise<string>;
  totalSupply(_overrides?: CallOverrides): Promise<BigNumber>;
}

interface HLQTTokenTransactions {
  initialize(_bountyAddress: string, _lpRewardsAddress: string, _overrides?: Overrides): Promise<void>;
  sendToHLQTStaking(_sender: string, _amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
}

export interface HLQTToken
  extends _TypedLiquityContract<HLQTTokenCalls, HLQTTokenTransactions> {
  readonly filters: {
    CommunityIssuanceAddressSet(_communityIssuanceAddress?: null): EventFilter;
    HLQTStakingAddressSet(_hlqtStakingAddress?: null): EventFilter;
    LockupContractFactoryAddressSet(_lockupContractFactoryAddress?: null): EventFilter;
    MetadataSet(admin?: string | null, metadata?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    TokenTransfer(token?: string | null, sender?: string | null, receiver?: string | null, amount?: null): EventFilter;
    TokensBurned(burner?: string | null, token?: string | null, amount?: null): EventFilter;
    TokensMinted(minter?: string | null, token?: string | null, amount?: null, account?: string | null): EventFilter;
    Transfer(from?: string | null, to?: string | null, value?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "CommunityIssuanceAddressSet"): _TypedLogDescription<{ _communityIssuanceAddress: string }>[];
  extractEvents(logs: Log[], name: "HLQTStakingAddressSet"): _TypedLogDescription<{ _hlqtStakingAddress: string }>[];
  extractEvents(logs: Log[], name: "LockupContractFactoryAddressSet"): _TypedLogDescription<{ _lockupContractFactoryAddress: string }>[];
  extractEvents(logs: Log[], name: "MetadataSet"): _TypedLogDescription<{ admin: string; metadata: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "TokenTransfer"): _TypedLogDescription<{ token: string; sender: string; receiver: string; amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "TokensBurned"): _TypedLogDescription<{ burner: string; token: string; amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "TokensMinted"): _TypedLogDescription<{ minter: string; token: string; amount: BigNumber; account: string }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ from: string; to: string; value: BigNumber }>[];
}

interface MultiTroveGetterCalls {
  getMultipleSortedTroves(_startIdx: BigNumberish, _count: BigNumberish, _overrides?: CallOverrides): Promise<{ owner: string; debt: BigNumber; coll: BigNumber; stake: BigNumber; snapshotETH: BigNumber; snapshotHCHFDebt: BigNumber }[]>;
  sortedTroves(_overrides?: CallOverrides): Promise<string>;
  troveManager(_overrides?: CallOverrides): Promise<string>;
}

interface MultiTroveGetterTransactions {
}

export interface MultiTroveGetter
  extends _TypedLiquityContract<MultiTroveGetterCalls, MultiTroveGetterTransactions> {
  readonly filters: {
  };
}

interface PriceFeedCalls {
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  HBAR_USD_PYTH(_overrides?: CallOverrides): Promise<string>;
  HBAR_USD_SUPRA(_overrides?: CallOverrides): Promise<BigNumber>;
  MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND(_overrides?: CallOverrides): Promise<BigNumber>;
  MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  TIMEOUT(_overrides?: CallOverrides): Promise<BigNumber>;
  USD_CHF_PYTH(_overrides?: CallOverrides): Promise<string>;
  USD_CHF_SUPRA(_overrides?: CallOverrides): Promise<BigNumber>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  lastGoodPrice(_overrides?: CallOverrides): Promise<BigNumber>;
  owner(_overrides?: CallOverrides): Promise<string>;
  pythCaller(_overrides?: CallOverrides): Promise<string>;
  status(_overrides?: CallOverrides): Promise<number>;
  supraCaller(_overrides?: CallOverrides): Promise<string>;
  troveManagerAddress(_overrides?: CallOverrides): Promise<string>;
}

interface PriceFeedTransactions {
  fetchPrice(_overrides?: Overrides): Promise<BigNumber>;
  setAddresses(_pythCallerAddress: string, _supraCallerAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface PriceFeed
  extends _TypedLiquityContract<PriceFeedCalls, PriceFeedTransactions> {
  readonly filters: {
    LastGoodPriceUpdated(_lastGoodPrice?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    PriceFeedStatusChanged(newStatus?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "LastGoodPriceUpdated"): _TypedLogDescription<{ _lastGoodPrice: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "PriceFeedStatusChanged"): _TypedLogDescription<{ newStatus: number }>[];
}

interface PriceFeedTestnetCalls {
  getPrice(_overrides?: CallOverrides): Promise<BigNumber>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
}

interface PriceFeedTestnetTransactions {
  fetchPrice(_overrides?: Overrides): Promise<BigNumber>;
  setPrice(price: BigNumberish, _overrides?: Overrides): Promise<boolean>;
}

export interface PriceFeedTestnet
  extends _TypedLiquityContract<PriceFeedTestnetCalls, PriceFeedTestnetTransactions> {
  readonly filters: {
    LastGoodPriceUpdated(_lastGoodPrice?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
  };
  extractEvents(logs: Log[], name: "LastGoodPriceUpdated"): _TypedLogDescription<{ _lastGoodPrice: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
}

interface SortedTrovesCalls {
  NAME(_overrides?: CallOverrides): Promise<string>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  contains(_id: string, _overrides?: CallOverrides): Promise<boolean>;
  data(_overrides?: CallOverrides): Promise<{ head: string; tail: string; maxSize: BigNumber; size: BigNumber }>;
  findInsertPosition(_NICR: BigNumberish, _prevId: string, _nextId: string, _overrides?: CallOverrides): Promise<[string, string]>;
  getFirst(_overrides?: CallOverrides): Promise<string>;
  getLast(_overrides?: CallOverrides): Promise<string>;
  getMaxSize(_overrides?: CallOverrides): Promise<BigNumber>;
  getNext(_id: string, _overrides?: CallOverrides): Promise<string>;
  getPrev(_id: string, _overrides?: CallOverrides): Promise<string>;
  getSize(_overrides?: CallOverrides): Promise<BigNumber>;
  isEmpty(_overrides?: CallOverrides): Promise<boolean>;
  isFull(_overrides?: CallOverrides): Promise<boolean>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  owner(_overrides?: CallOverrides): Promise<string>;
  troveManager(_overrides?: CallOverrides): Promise<string>;
  validInsertPosition(_NICR: BigNumberish, _prevId: string, _nextId: string, _overrides?: CallOverrides): Promise<boolean>;
}

interface SortedTrovesTransactions {
  insert(_id: string, _NICR: BigNumberish, _prevId: string, _nextId: string, _overrides?: Overrides): Promise<void>;
  reInsert(_id: string, _newNICR: BigNumberish, _prevId: string, _nextId: string, _overrides?: Overrides): Promise<void>;
  remove(_id: string, _overrides?: Overrides): Promise<void>;
  setParams(_size: BigNumberish, _troveManagerAddress: string, _borrowerOperationsAddress: string, _overrides?: Overrides): Promise<void>;
}

export interface SortedTroves
  extends _TypedLiquityContract<SortedTrovesCalls, SortedTrovesTransactions> {
  readonly filters: {
    BorrowerOperationsAddressChanged(_borrowerOperationsAddress?: null): EventFilter;
    NodeAdded(_id?: null, _NICR?: null): EventFilter;
    NodeRemoved(_id?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    SortedTrovesAddressChanged(_sortedDoublyLLAddress?: null): EventFilter;
    TroveManagerAddressChanged(_troveManagerAddress?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressChanged"): _TypedLogDescription<{ _borrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "NodeAdded"): _TypedLogDescription<{ _id: string; _NICR: BigNumber }>[];
  extractEvents(logs: Log[], name: "NodeRemoved"): _TypedLogDescription<{ _id: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "SortedTrovesAddressChanged"): _TypedLogDescription<{ _sortedDoublyLLAddress: string }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _troveManagerAddress: string }>[];
}

interface StabilityPoolCalls {
  BORROWING_FEE_FLOOR(_overrides?: CallOverrides): Promise<BigNumber>;
  CCR(_overrides?: CallOverrides): Promise<BigNumber>;
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  HCHF_GAS_COMPENSATION(_overrides?: CallOverrides): Promise<BigNumber>;
  MCR(_overrides?: CallOverrides): Promise<BigNumber>;
  MIN_NET_DEBT(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  P(_overrides?: CallOverrides): Promise<BigNumber>;
  PERCENT_DIVISOR(_overrides?: CallOverrides): Promise<BigNumber>;
  SCALE_FACTOR(_overrides?: CallOverrides): Promise<BigNumber>;
  _100pct(_overrides?: CallOverrides): Promise<BigNumber>;
  activePool(_overrides?: CallOverrides): Promise<string>;
  borrowerOperations(_overrides?: CallOverrides): Promise<string>;
  communityIssuance(_overrides?: CallOverrides): Promise<string>;
  currentEpoch(_overrides?: CallOverrides): Promise<BigNumber>;
  currentScale(_overrides?: CallOverrides): Promise<BigNumber>;
  defaultPool(_overrides?: CallOverrides): Promise<string>;
  depositSnapshots(arg0: string, _overrides?: CallOverrides): Promise<{ S: BigNumber; P: BigNumber; G: BigNumber; scale: BigNumber; epoch: BigNumber }>;
  deposits(arg0: string, _overrides?: CallOverrides): Promise<{ initialValue: BigNumber; frontEndTag: string }>;
  epochToScaleToG(arg0: BigNumberish, arg1: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  epochToScaleToSum(arg0: BigNumberish, arg1: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  frontEndSnapshots(arg0: string, _overrides?: CallOverrides): Promise<{ S: BigNumber; P: BigNumber; G: BigNumber; scale: BigNumber; epoch: BigNumber }>;
  frontEndStakes(arg0: string, _overrides?: CallOverrides): Promise<BigNumber>;
  frontEnds(arg0: string, _overrides?: CallOverrides): Promise<{ kickbackRate: BigNumber; registered: boolean }>;
  getCompoundedFrontEndStake(_frontEnd: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getCompoundedHCHFDeposit(_depositor: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getDepositorETHGain(_depositor: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getDepositorHLQTGain(_depositor: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getETH(_overrides?: CallOverrides): Promise<BigNumber>;
  getEntireSystemColl(_overrides?: CallOverrides): Promise<BigNumber>;
  getEntireSystemDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  getFrontEndHLQTGain(_frontEnd: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getTotalHCHFDeposits(_overrides?: CallOverrides): Promise<BigNumber>;
  hchfToken(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  lastETHError_Offset(_overrides?: CallOverrides): Promise<BigNumber>;
  lastHCHFLossError_Offset(_overrides?: CallOverrides): Promise<BigNumber>;
  lastHLQTError(_overrides?: CallOverrides): Promise<BigNumber>;
  owner(_overrides?: CallOverrides): Promise<string>;
  priceFeed(_overrides?: CallOverrides): Promise<string>;
  sortedTroves(_overrides?: CallOverrides): Promise<string>;
  troveManager(_overrides?: CallOverrides): Promise<string>;
}

interface StabilityPoolTransactions {
  offset(_debtToOffset: BigNumberish, _collToAdd: BigNumberish, _overrides?: Overrides): Promise<void>;
  provideToSP(_amount: BigNumberish, _frontEndTag: string, _overrides?: Overrides): Promise<void>;
  registerFrontEnd(_kickbackRate: BigNumberish, _overrides?: Overrides): Promise<void>;
  setAddresses(_borrowerOperationsAddress: string, _troveManagerAddress: string, _activePoolAddress: string, _hchfTokenAddress: string, _sortedTrovesAddress: string, _priceFeedAddress: string, _communityIssuanceAddress: string, _overrides?: Overrides): Promise<void>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  withdrawETHGainToTrove(_upperHint: string, _lowerHint: string, _overrides?: Overrides): Promise<void>;
  withdrawFromSP(_amount: BigNumberish, _overrides?: Overrides): Promise<void>;
}

export interface StabilityPool
  extends _TypedLiquityContract<StabilityPoolCalls, StabilityPoolTransactions> {
  readonly filters: {
    ActivePoolAddressChanged(_newActivePoolAddress?: null): EventFilter;
    BorrowerOperationsAddressChanged(_newBorrowerOperationsAddress?: null): EventFilter;
    CommunityIssuanceAddressChanged(_newCommunityIssuanceAddress?: null): EventFilter;
    DefaultPoolAddressChanged(_newDefaultPoolAddress?: null): EventFilter;
    DepositSnapshotUpdated(_depositor?: string | null, _P?: null, _S?: null, _G?: null): EventFilter;
    ETHGainWithdrawn(_depositor?: string | null, _ETH?: null, _HCHFLoss?: null): EventFilter;
    EpochUpdated(_currentEpoch?: null): EventFilter;
    EtherSent(_to?: null, _amount?: null): EventFilter;
    FrontEndRegistered(_frontEnd?: string | null, _kickbackRate?: null): EventFilter;
    FrontEndSnapshotUpdated(_frontEnd?: string | null, _P?: null, _G?: null): EventFilter;
    FrontEndStakeChanged(_frontEnd?: string | null, _newFrontEndStake?: null, _depositor?: null): EventFilter;
    FrontEndTagSet(_depositor?: string | null, _frontEnd?: string | null): EventFilter;
    G_Updated(_G?: null, _epoch?: null, _scale?: null): EventFilter;
    HCHFTokenAddressChanged(_newHCHFTokenAddress?: null): EventFilter;
    HLQTPaidToDepositor(_depositor?: string | null, _HLQT?: null): EventFilter;
    HLQTPaidToFrontEnd(_frontEnd?: string | null, _HLQT?: null): EventFilter;
    HLQTPaidToFrontEndFailed(_frontEnd?: string | null, _HLQT?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    P_Updated(_P?: null): EventFilter;
    PriceFeedAddressChanged(_newPriceFeedAddress?: null): EventFilter;
    S_Updated(_S?: null, _epoch?: null, _scale?: null): EventFilter;
    ScaleUpdated(_currentScale?: null): EventFilter;
    SortedTrovesAddressChanged(_newSortedTrovesAddress?: null): EventFilter;
    StabilityPoolETHBalanceUpdated(_newBalance?: null): EventFilter;
    StabilityPoolHCHFBalanceUpdated(_newBalance?: null): EventFilter;
    Transfer(token?: string | null, from?: string | null, to?: string | null, value?: null): EventFilter;
    TroveManagerAddressChanged(_newTroveManagerAddress?: null): EventFilter;
    UserDepositChanged(_depositor?: string | null, _newDeposit?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressChanged"): _TypedLogDescription<{ _newActivePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressChanged"): _TypedLogDescription<{ _newBorrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "CommunityIssuanceAddressChanged"): _TypedLogDescription<{ _newCommunityIssuanceAddress: string }>[];
  extractEvents(logs: Log[], name: "DefaultPoolAddressChanged"): _TypedLogDescription<{ _newDefaultPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "DepositSnapshotUpdated"): _TypedLogDescription<{ _depositor: string; _P: BigNumber; _S: BigNumber; _G: BigNumber }>[];
  extractEvents(logs: Log[], name: "ETHGainWithdrawn"): _TypedLogDescription<{ _depositor: string; _ETH: BigNumber; _HCHFLoss: BigNumber }>[];
  extractEvents(logs: Log[], name: "EpochUpdated"): _TypedLogDescription<{ _currentEpoch: BigNumber }>[];
  extractEvents(logs: Log[], name: "EtherSent"): _TypedLogDescription<{ _to: string; _amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "FrontEndRegistered"): _TypedLogDescription<{ _frontEnd: string; _kickbackRate: BigNumber }>[];
  extractEvents(logs: Log[], name: "FrontEndSnapshotUpdated"): _TypedLogDescription<{ _frontEnd: string; _P: BigNumber; _G: BigNumber }>[];
  extractEvents(logs: Log[], name: "FrontEndStakeChanged"): _TypedLogDescription<{ _frontEnd: string; _newFrontEndStake: BigNumber; _depositor: string }>[];
  extractEvents(logs: Log[], name: "FrontEndTagSet"): _TypedLogDescription<{ _depositor: string; _frontEnd: string }>[];
  extractEvents(logs: Log[], name: "G_Updated"): _TypedLogDescription<{ _G: BigNumber; _epoch: BigNumber; _scale: BigNumber }>[];
  extractEvents(logs: Log[], name: "HCHFTokenAddressChanged"): _TypedLogDescription<{ _newHCHFTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "HLQTPaidToDepositor"): _TypedLogDescription<{ _depositor: string; _HLQT: BigNumber }>[];
  extractEvents(logs: Log[], name: "HLQTPaidToFrontEnd"): _TypedLogDescription<{ _frontEnd: string; _HLQT: BigNumber }>[];
  extractEvents(logs: Log[], name: "HLQTPaidToFrontEndFailed"): _TypedLogDescription<{ _frontEnd: string; _HLQT: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "P_Updated"): _TypedLogDescription<{ _P: BigNumber }>[];
  extractEvents(logs: Log[], name: "PriceFeedAddressChanged"): _TypedLogDescription<{ _newPriceFeedAddress: string }>[];
  extractEvents(logs: Log[], name: "S_Updated"): _TypedLogDescription<{ _S: BigNumber; _epoch: BigNumber; _scale: BigNumber }>[];
  extractEvents(logs: Log[], name: "ScaleUpdated"): _TypedLogDescription<{ _currentScale: BigNumber }>[];
  extractEvents(logs: Log[], name: "SortedTrovesAddressChanged"): _TypedLogDescription<{ _newSortedTrovesAddress: string }>[];
  extractEvents(logs: Log[], name: "StabilityPoolETHBalanceUpdated"): _TypedLogDescription<{ _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "StabilityPoolHCHFBalanceUpdated"): _TypedLogDescription<{ _newBalance: BigNumber }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ token: string; from: string; to: string; value: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveManagerAddressChanged"): _TypedLogDescription<{ _newTroveManagerAddress: string }>[];
  extractEvents(logs: Log[], name: "UserDepositChanged"): _TypedLogDescription<{ _depositor: string; _newDeposit: BigNumber }>[];
}

interface TroveManagerCalls {
  BETA(_overrides?: CallOverrides): Promise<BigNumber>;
  BOOTSTRAP_PERIOD(_overrides?: CallOverrides): Promise<BigNumber>;
  BORROWING_FEE_FLOOR(_overrides?: CallOverrides): Promise<BigNumber>;
  CCR(_overrides?: CallOverrides): Promise<BigNumber>;
  DECIMAL_PRECISION(_overrides?: CallOverrides): Promise<BigNumber>;
  HCHF_GAS_COMPENSATION(_overrides?: CallOverrides): Promise<BigNumber>;
  L_ETH(_overrides?: CallOverrides): Promise<BigNumber>;
  L_HCHFDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  MAX_BORROWING_FEE(_overrides?: CallOverrides): Promise<BigNumber>;
  MCR(_overrides?: CallOverrides): Promise<BigNumber>;
  MINUTE_DECAY_FACTOR(_overrides?: CallOverrides): Promise<BigNumber>;
  MIN_NET_DEBT(_overrides?: CallOverrides): Promise<BigNumber>;
  NAME(_overrides?: CallOverrides): Promise<string>;
  PERCENT_DIVISOR(_overrides?: CallOverrides): Promise<BigNumber>;
  REDEMPTION_FEE_FLOOR(_overrides?: CallOverrides): Promise<BigNumber>;
  SECONDS_IN_ONE_MINUTE(_overrides?: CallOverrides): Promise<BigNumber>;
  TroveOwners(arg0: BigNumberish, _overrides?: CallOverrides): Promise<string>;
  Troves(arg0: string, _overrides?: CallOverrides): Promise<{ debt: BigNumber; coll: BigNumber; stake: BigNumber; status: number; arrayIndex: BigNumber }>;
  _100pct(_overrides?: CallOverrides): Promise<BigNumber>;
  activePool(_overrides?: CallOverrides): Promise<string>;
  baseRate(_overrides?: CallOverrides): Promise<BigNumber>;
  borrowerOperationsAddress(_overrides?: CallOverrides): Promise<string>;
  checkRecoveryMode(_price: BigNumberish, _overrides?: CallOverrides): Promise<boolean>;
  defaultPool(_overrides?: CallOverrides): Promise<string>;
  getBorrowingFee(_HCHFDebt: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  getBorrowingFeeWithDecay(_HCHFDebt: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  getBorrowingRate(_overrides?: CallOverrides): Promise<BigNumber>;
  getBorrowingRateWithDecay(_overrides?: CallOverrides): Promise<BigNumber>;
  getCurrentICR(_borrower: string, _price: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  getEntireDebtAndColl(_borrower: string, _overrides?: CallOverrides): Promise<{ debt: BigNumber; coll: BigNumber; pendingHCHFDebtReward: BigNumber; pendingETHReward: BigNumber }>;
  getEntireSystemColl(_overrides?: CallOverrides): Promise<BigNumber>;
  getEntireSystemDebt(_overrides?: CallOverrides): Promise<BigNumber>;
  getNominalICR(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getPendingETHReward(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getPendingHCHFDebtReward(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getRedemptionFeeWithDecay(_ETHDrawn: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  getRedemptionRate(_overrides?: CallOverrides): Promise<BigNumber>;
  getRedemptionRateWithDecay(_overrides?: CallOverrides): Promise<BigNumber>;
  getTCR(_price: BigNumberish, _overrides?: CallOverrides): Promise<BigNumber>;
  getTroveColl(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getTroveDebt(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getTroveFromTroveOwnersArray(_index: BigNumberish, _overrides?: CallOverrides): Promise<string>;
  getTroveOwnersCount(_overrides?: CallOverrides): Promise<BigNumber>;
  getTroveStake(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  getTroveStatus(_borrower: string, _overrides?: CallOverrides): Promise<BigNumber>;
  hasPendingRewards(_borrower: string, _overrides?: CallOverrides): Promise<boolean>;
  hchfToken(_overrides?: CallOverrides): Promise<string>;
  hlqtStaking(_overrides?: CallOverrides): Promise<string>;
  hlqtToken(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  lastETHError_Redistribution(_overrides?: CallOverrides): Promise<BigNumber>;
  lastFeeOperationTime(_overrides?: CallOverrides): Promise<BigNumber>;
  lastHCHFDebtError_Redistribution(_overrides?: CallOverrides): Promise<BigNumber>;
  owner(_overrides?: CallOverrides): Promise<string>;
  priceFeed(_overrides?: CallOverrides): Promise<string>;
  rewardSnapshots(arg0: string, _overrides?: CallOverrides): Promise<{ ETH: BigNumber; HCHFDebt: BigNumber }>;
  sortedTroves(_overrides?: CallOverrides): Promise<string>;
  stabilityPool(_overrides?: CallOverrides): Promise<string>;
  totalCollateralSnapshot(_overrides?: CallOverrides): Promise<BigNumber>;
  totalStakes(_overrides?: CallOverrides): Promise<BigNumber>;
  totalStakesSnapshot(_overrides?: CallOverrides): Promise<BigNumber>;
}

interface TroveManagerTransactions {
  addTroveOwnerToArray(_borrower: string, _overrides?: Overrides): Promise<BigNumber>;
  applyPendingRewards(_borrower: string, _overrides?: Overrides): Promise<void>;
  batchLiquidateTroves(_troveArray: string[], _overrides?: Overrides): Promise<void>;
  closeTrove(_borrower: string, _overrides?: Overrides): Promise<void>;
  decayBaseRateFromBorrowing(_overrides?: Overrides): Promise<void>;
  decreaseTroveColl(_borrower: string, _collDecrease: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  decreaseTroveDebt(_borrower: string, _debtDecrease: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  increaseTroveColl(_borrower: string, _collIncrease: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  increaseTroveDebt(_borrower: string, _debtIncrease: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  liquidate(_borrower: string, _overrides?: Overrides): Promise<void>;
  liquidateTroves(_n: BigNumberish, _overrides?: Overrides): Promise<void>;
  redeemCollateral(_HCHFamount: BigNumberish, _firstRedemptionHint: string, _upperPartialRedemptionHint: string, _lowerPartialRedemptionHint: string, _partialRedemptionHintNICR: BigNumberish, _maxIterations: BigNumberish, _maxFeePercentage: BigNumberish, _overrides?: Overrides): Promise<void>;
  removeStake(_borrower: string, _overrides?: Overrides): Promise<void>;
  setAddresses(_borrowerOperationsAddress: string, _activePoolAddress: string, _defaultPoolAddress: string, _stabilityPoolAddress: string, _gasPoolAddress: string, _collSurplusPoolAddress: string, _priceFeedAddress: string, _hchfTokenAddress: string, _sortedTrovesAddress: string, _hlqtTokenAddress: string, _hlqtStakingAddress: string, _overrides?: Overrides): Promise<void>;
  setTroveStatus(_borrower: string, _num: BigNumberish, _overrides?: Overrides): Promise<void>;
  updateStakeAndTotalStakes(_borrower: string, _overrides?: Overrides): Promise<BigNumber>;
  updateTroveRewardSnapshots(_borrower: string, _overrides?: Overrides): Promise<void>;
}

export interface TroveManager
  extends _TypedLiquityContract<TroveManagerCalls, TroveManagerTransactions> {
  readonly filters: {
    ActivePoolAddressChanged(_activePoolAddress?: null): EventFilter;
    BaseRateUpdated(_baseRate?: null): EventFilter;
    BorrowerOperationsAddressChanged(_newBorrowerOperationsAddress?: null): EventFilter;
    CollSurplusPoolAddressChanged(_collSurplusPoolAddress?: null): EventFilter;
    DefaultPoolAddressChanged(_defaultPoolAddress?: null): EventFilter;
    GasPoolAddressChanged(_gasPoolAddress?: null): EventFilter;
    HCHFTokenAddressChanged(_newHCHFTokenAddress?: null): EventFilter;
    LQTYStakingAddressChanged(_hlqtStakingAddress?: null): EventFilter;
    LQTYTokenAddressChanged(_hlqtTokenAddress?: null): EventFilter;
    LTermsUpdated(_L_ETH?: null, _L_HCHFDebt?: null): EventFilter;
    LastFeeOpTimeUpdated(_lastFeeOpTime?: null): EventFilter;
    Liquidation(_liquidatedDebt?: null, _liquidatedColl?: null, _collGasCompensation?: null, _HCHFGasCompensation?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    PriceFeedAddressChanged(_newPriceFeedAddress?: null): EventFilter;
    Redemption(_attemptedHCHFAmount?: null, _actualHCHFAmount?: null, _ETHSent?: null, _ETHFee?: null): EventFilter;
    SortedTrovesAddressChanged(_sortedTrovesAddress?: null): EventFilter;
    StabilityPoolAddressChanged(_stabilityPoolAddress?: null): EventFilter;
    SystemSnapshotsUpdated(_totalStakesSnapshot?: null, _totalCollateralSnapshot?: null): EventFilter;
    TotalStakesUpdated(_newTotalStakes?: null): EventFilter;
    TroveIndexUpdated(_borrower?: null, _newIndex?: null): EventFilter;
    TroveLiquidated(_borrower?: string | null, _debt?: null, _coll?: null, _operation?: null): EventFilter;
    TroveSnapshotsUpdated(_L_ETH?: null, _L_HCHFDebt?: null): EventFilter;
    TroveUpdated(_borrower?: string | null, _debt?: null, _coll?: null, _stake?: null, _operation?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "ActivePoolAddressChanged"): _TypedLogDescription<{ _activePoolAddress: string }>[];
  extractEvents(logs: Log[], name: "BaseRateUpdated"): _TypedLogDescription<{ _baseRate: BigNumber }>[];
  extractEvents(logs: Log[], name: "BorrowerOperationsAddressChanged"): _TypedLogDescription<{ _newBorrowerOperationsAddress: string }>[];
  extractEvents(logs: Log[], name: "CollSurplusPoolAddressChanged"): _TypedLogDescription<{ _collSurplusPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "DefaultPoolAddressChanged"): _TypedLogDescription<{ _defaultPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "GasPoolAddressChanged"): _TypedLogDescription<{ _gasPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "HCHFTokenAddressChanged"): _TypedLogDescription<{ _newHCHFTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "LQTYStakingAddressChanged"): _TypedLogDescription<{ _hlqtStakingAddress: string }>[];
  extractEvents(logs: Log[], name: "LQTYTokenAddressChanged"): _TypedLogDescription<{ _hlqtTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "LTermsUpdated"): _TypedLogDescription<{ _L_ETH: BigNumber; _L_HCHFDebt: BigNumber }>[];
  extractEvents(logs: Log[], name: "LastFeeOpTimeUpdated"): _TypedLogDescription<{ _lastFeeOpTime: BigNumber }>[];
  extractEvents(logs: Log[], name: "Liquidation"): _TypedLogDescription<{ _liquidatedDebt: BigNumber; _liquidatedColl: BigNumber; _collGasCompensation: BigNumber; _HCHFGasCompensation: BigNumber }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "PriceFeedAddressChanged"): _TypedLogDescription<{ _newPriceFeedAddress: string }>[];
  extractEvents(logs: Log[], name: "Redemption"): _TypedLogDescription<{ _attemptedHCHFAmount: BigNumber; _actualHCHFAmount: BigNumber; _ETHSent: BigNumber; _ETHFee: BigNumber }>[];
  extractEvents(logs: Log[], name: "SortedTrovesAddressChanged"): _TypedLogDescription<{ _sortedTrovesAddress: string }>[];
  extractEvents(logs: Log[], name: "StabilityPoolAddressChanged"): _TypedLogDescription<{ _stabilityPoolAddress: string }>[];
  extractEvents(logs: Log[], name: "SystemSnapshotsUpdated"): _TypedLogDescription<{ _totalStakesSnapshot: BigNumber; _totalCollateralSnapshot: BigNumber }>[];
  extractEvents(logs: Log[], name: "TotalStakesUpdated"): _TypedLogDescription<{ _newTotalStakes: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveIndexUpdated"): _TypedLogDescription<{ _borrower: string; _newIndex: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveLiquidated"): _TypedLogDescription<{ _borrower: string; _debt: BigNumber; _coll: BigNumber; _operation: number }>[];
  extractEvents(logs: Log[], name: "TroveSnapshotsUpdated"): _TypedLogDescription<{ _L_ETH: BigNumber; _L_HCHFDebt: BigNumber }>[];
  extractEvents(logs: Log[], name: "TroveUpdated"): _TypedLogDescription<{ _borrower: string; _debt: BigNumber; _coll: BigNumber; _stake: BigNumber; _operation: number }>[];
}

interface SaucerSwapPoolCalls {
  NAME(_overrides?: CallOverrides): Promise<string>;
  balanceOf(account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  duration(_overrides?: CallOverrides): Promise<BigNumber>;
  earned(account: string, _overrides?: CallOverrides): Promise<BigNumber>;
  hlqtToken(_overrides?: CallOverrides): Promise<string>;
  isOwner(_overrides?: CallOverrides): Promise<boolean>;
  lastTimeRewardApplicable(_overrides?: CallOverrides): Promise<BigNumber>;
  lastUpdateTime(_overrides?: CallOverrides): Promise<BigNumber>;
  owner(_overrides?: CallOverrides): Promise<string>;
  periodFinish(_overrides?: CallOverrides): Promise<BigNumber>;
  rewardPerToken(_overrides?: CallOverrides): Promise<BigNumber>;
  rewardPerTokenStored(_overrides?: CallOverrides): Promise<BigNumber>;
  rewardRate(_overrides?: CallOverrides): Promise<BigNumber>;
  rewards(arg0: string, _overrides?: CallOverrides): Promise<BigNumber>;
  totalSupply(_overrides?: CallOverrides): Promise<BigNumber>;
  uniToken(_overrides?: CallOverrides): Promise<string>;
  userRewardPerTokenPaid(arg0: string, _overrides?: CallOverrides): Promise<BigNumber>;
}

interface SaucerSwapPoolTransactions {
  claimReward(_overrides?: Overrides): Promise<void>;
  setParams(_uniTokenAddress: string, _duration: BigNumberish, _overrides?: Overrides): Promise<void>;
  stake(amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  transferFrom(token: string, from: string, to: string, amount: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  transferFromNFT(token: string, from: string, to: string, serialNumber: BigNumberish, _overrides?: Overrides): Promise<BigNumber>;
  withdraw(amount: BigNumberish, _overrides?: Overrides): Promise<void>;
  withdrawAndClaim(_overrides?: Overrides): Promise<void>;
}

export interface SaucerSwapPool
  extends _TypedLiquityContract<SaucerSwapPoolCalls, SaucerSwapPoolTransactions> {
  readonly filters: {
    HLQTTokenAddressChanged(_hlqtTokenAddress?: null): EventFilter;
    OwnershipTransferred(previousOwner?: string | null, newOwner?: string | null): EventFilter;
    RewardAdded(reward?: null): EventFilter;
    RewardPaid(user?: string | null, reward?: null): EventFilter;
    Staked(user?: string | null, amount?: null): EventFilter;
    Transfer(token?: string | null, from?: string | null, to?: string | null, value?: null): EventFilter;
    UniTokenAddressChanged(_uniTokenAddress?: null): EventFilter;
    Withdrawn(user?: string | null, amount?: null): EventFilter;
  };
  extractEvents(logs: Log[], name: "HLQTTokenAddressChanged"): _TypedLogDescription<{ _hlqtTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "OwnershipTransferred"): _TypedLogDescription<{ previousOwner: string; newOwner: string }>[];
  extractEvents(logs: Log[], name: "RewardAdded"): _TypedLogDescription<{ reward: BigNumber }>[];
  extractEvents(logs: Log[], name: "RewardPaid"): _TypedLogDescription<{ user: string; reward: BigNumber }>[];
  extractEvents(logs: Log[], name: "Staked"): _TypedLogDescription<{ user: string; amount: BigNumber }>[];
  extractEvents(logs: Log[], name: "Transfer"): _TypedLogDescription<{ token: string; from: string; to: string; value: BigNumber }>[];
  extractEvents(logs: Log[], name: "UniTokenAddressChanged"): _TypedLogDescription<{ _uniTokenAddress: string }>[];
  extractEvents(logs: Log[], name: "Withdrawn"): _TypedLogDescription<{ user: string; amount: BigNumber }>[];
}
