import { ethereum, crypto, Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  AddPool,
  SetPool,
  Deposit,
  Withdraw,
  Harvest,
  UpdateLiquidity,
  NewUpkeepPeriod,
  UpdateUpkeepPeriod
} from '../generated/MasterChefV3/MasterChefV3';
import { UpkeepPeriod, Incentive, Position, IncentivePosition, Stake, Unstake, Claim, Global } from '../generated/schema';

let ZERO_BI = BigInt.fromI32(0)
let ONE_BI = BigInt.fromI32(1)
let ADDRESS_ZERO = Address.fromString('0x0000000000000000000000000000000000000000')
let ADDRESS_CAKE = Address.fromString('0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82')

function getGlobal(): Global {
  let global = Global.load("1")
  if (!global) {
    global = new Global("1")
    global.poolCount = ZERO_BI
    global.allocPointTotal = ZERO_BI
    global.currentPeriod = ZERO_BI
  }
  return global!
}

export function handleNewUpkeepPeriod(event: NewUpkeepPeriod): void {
  let period = new UpkeepPeriod(event.params.periodNumber.toString());
  period.startTime = event.params.startTime
  period.endTime = event.params.endTime
  period.cakePerSecond = event.params.cakePerSecond
  period.cakeAmount = event.params.cakeAmount
  period.save()

  let global = getGlobal()
  global.currentPeriod = event.params.periodNumber
  global.save()

  updatePools(global, period)
}

function updatePools(global: Global, period: UpkeepPeriod): void {
  // update incentive reward and times for all pools
  let poolCount = global.poolCount.toI32()
  for (let i = 1; i <= poolCount; i++) {
    let incentive = Incentive.load(i.toString());
    if (incentive) {
      incentive.startTime = period.startTime
      incentive.endTime = period.endTime
      incentive.reward = period.cakeAmount.times(incentive.allocPoint).div(global.allocPointTotal)
      incentive.save()
    }
  }
}


export function handleUpdateUpkeepPeriod(event: UpdateUpkeepPeriod): void {
  let period = UpkeepPeriod.load(event.params.periodNumber.toString())
  if (period) {
    period.endTime = event.params.newEndTime
    period.cakeAmount = period.cakeAmount.minus(event.params.remainingCake)
    period.save()
  }
}

export function handleAddPool(event: AddPool): void {

  let incentive = Incentive.load(event.params.pid.toString());
  let global = getGlobal()
  let period = UpkeepPeriod.load(global.currentPeriod.toString())

  incentive = new Incentive(event.params.pid.toString());
  incentive.reward = ZERO_BI;
  global.poolCount = global.poolCount.plus(ONE_BI)
  global.allocPointTotal = global.allocPointTotal.plus(event.params.allocPoint)

  incentive.contract = event.address
  incentive.rewardToken = ADDRESS_CAKE
  incentive.pool = event.params.v3Pool
  if (period) {
    incentive.startTime = period.startTime;
    incentive.endTime = period.endTime;
  }
  incentive.vestingPeriod = ZERO_BI;
  incentive.refundee = ADDRESS_ZERO;
  incentive.reward = ZERO_BI;
  incentive.started = true;
  incentive.expired = false;
  incentive.ended = false;
  incentive.allocPoint = event.params.allocPoint
  
  incentive.save()
  global.save()

  if (period) {
    updatePools(global, period!)
  }
}

export function handleSetPool(event: SetPool): void {
  let incentive = Incentive.load(event.params.pid.toString())
  if (incentive) {
      let global = getGlobal()
      let period = UpkeepPeriod.load(global.currentPeriod.toString())
      global.allocPointTotal = global.allocPointTotal.minus(incentive.allocPoint).plus(event.params.allocPoint)
      incentive.allocPoint = event.params.allocPoint
      incentive.save()
      global.save()

      if (period) {
        updatePools(global, period!)
      }
  }
}

export function handleDeposit(event: Deposit): void {
  let position = Position.load(event.params.tokenId.toString());
  if (!position) {
    position = new Position(event.params.tokenId.toString());
    position.owner = event.params.from;
  }
  position.liquidity = event.params.liquidity;
  position.save();

  let stake = new Stake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  stake.txHash = event.transaction.hash;
  stake.timestamp = event.block.timestamp;
  stake.position = position.id;
  stake.blockNumber = event.block.number;
  stake.save();

  let incentivePosition = IncentivePosition.load(event.params.pid.toString() + "#" + event.params.tokenId.toString());
  if (!incentivePosition) {
    incentivePosition = new IncentivePosition(event.params.pid.toString() + "#" + event.params.tokenId.toString());
    incentivePosition.position = event.params.tokenId.toString()
    incentivePosition.incentive = event.params.pid.toString()
    incentivePosition.claimed = new BigInt(0);
  }
  incentivePosition.staked = true;
  incentivePosition.save();
}

export function handleWithdraw(event: Withdraw): void {

  // IncentivePosition add collect amount
  let position = Position.load(event.params.tokenId.toString())!

  let unstake = new Unstake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  unstake.txHash = event.transaction.hash;
  unstake.timestamp = event.block.timestamp;
  unstake.position = position.id;
  unstake.blockNumber = event.block.number;
  unstake.save();

  let incentivePosition = IncentivePosition.load(event.params.pid.toString() + "#" + event.params.tokenId.toString())!
  incentivePosition.staked = false;
  incentivePosition.save();
}

export function handleUpdateLiquidity(event: UpdateLiquidity): void {
  let position = Position.load(event.params.tokenId.toString())
  if (position) {
    position.liquidity = event.params.liquidity
    position.save()
  }
}

export function handleHarvest(event: Harvest): void {

  let incentivePosition = IncentivePosition.load(event.params.pid.toString() + "#" + event.params.tokenId.toString())!;

  let claim = new Claim(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  claim.txHash = event.transaction.hash;
  claim.timestamp = event.block.timestamp;
  claim.blockNumber = event.block.number;
  claim.position = event.params.tokenId.toString()
  claim.to = event.params.to;
  claim.amount = event.params.reward;
  claim.rewardToken = ADDRESS_CAKE;
  claim.save();

  incentivePosition.claimed = incentivePosition.claimed.plus(event.params.reward)
  incentivePosition.save();
}