import { ethereum, crypto, Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  IncentiveCreated,
  IncentiveEnded,
  TokenStaked,
  TokenUnstaked,
  RewardClaimed,
  UniV3Staker,
  EndIncentiveCall
} from '../generated/UniV3Staker/UniV3Staker';
import { Incentive, Position, OwnerRewardToken, IncentivePosition, Stake, Unstake, Claim, Data, TokenData } from '../generated/schema';

let ZERO_BI = BigInt.fromI32(0)
let ONE_BI = BigInt.fromI32(1)

export function handleIncentiveCreated(event: IncentiveCreated): void {

  let stats = Data.load("1");
  if (!stats) {
    stats = new Data("1");
    stats.stakedPositions = ZERO_BI;
    stats.activeIncentives = ZERO_BI;
    stats.save();
  }

  let incentiveIdTuple: Array<ethereum.Value> = [
    ethereum.Value.fromAddress(event.params.rewardToken),
    ethereum.Value.fromAddress(event.params.pool),
    ethereum.Value.fromUnsignedBigInt(event.params.startTime),
    ethereum.Value.fromUnsignedBigInt(event.params.endTime),
    ethereum.Value.fromUnsignedBigInt(event.params.vestingPeriod),
    ethereum.Value.fromAddress(event.params.refundee),
  ];
  let incentiveIdEncoded = ethereum.encode(
    ethereum.Value.fromTuple(incentiveIdTuple as ethereum.Tuple)
  )!;
  let incentiveId = crypto.keccak256(incentiveIdEncoded);

  let incentive = Incentive.load(incentiveId.toHex());
  if (incentive == null) {
    incentive = new Incentive(incentiveId.toHex());
    incentive.reward = ZERO_BI;
  }

  incentive.contract = event.address;
  incentive.rewardToken = event.params.rewardToken;
  incentive.pool = event.params.pool;
  incentive.startTime = event.params.startTime;
  incentive.endTime = event.params.endTime;
  incentive.vestingPeriod = event.params.vestingPeriod;
  incentive.refundee = event.params.refundee;
  incentive.reward = incentive.reward.plus(event.params.reward);
  incentive.started = false;
  incentive.expired = false;
  incentive.ended = false;
  
  incentive.save();
}

export function handleIncentiveEnded(event: IncentiveEnded): void {
  let incentive = Incentive.load(event.params.incentiveId.toHex());
  if (incentive != null) {

    if (!incentive.started) {
      incentive.started  = true;
      incentive.expired = true;
    } else if (incentive.started && !incentive.expired) {
      // if all unstakes where made before end of incentive
      let stats = Data.load("1");
      stats.activeIncentives = stats.activeIncentives.minus(ONE_BI);  
      incentive.expired = true;
      stats.save();
    }

    incentive.ended = true;
    incentive.refund = event.params.refund;
    incentive.save();
  }
}

export function handleRewardClaimed(event: RewardClaimed): void {

  // try to find owner - usually should be tx from account 
  let owner = OwnerRewardToken.load(event.transaction.from.toHex() + event.params.rewardToken.toHex());
  if (!owner) {
    owner = OwnerRewardToken.load(event.params.to.toHex() + event.params.rewardToken.toHex());
  }

  let incentivePosition = IncentivePosition.load(owner.lastUnstakedIncentivePosition);

  let claim = new Claim(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  claim.txHash = event.transaction.hash;
  claim.timestamp = event.block.timestamp;
  claim.blockNumber = event.block.number;
  if (incentivePosition) {
    claim.position = incentivePosition.position;
  }
  claim.to = event.params.to;
  claim.amount = event.params.reward;
  claim.rewardToken = event.params.rewardToken;
  claim.save();


  let tokenData = TokenData.load(event.params.rewardToken.toHex());
  if (!tokenData) {
    tokenData = new TokenData(event.params.rewardToken.toHex());
    tokenData.totalClaimed = ZERO_BI;
  }
  tokenData.totalClaimed = tokenData.totalClaimed.plus(event.params.reward);
  tokenData.save();

  if (incentivePosition) {
    incentivePosition.claimed = incentivePosition.claimed.plus(event.params.reward);
    incentivePosition.save();
  }
}

export function handleTokenStaked(event: TokenStaked): void {
  let position = Position.load(event.params.tokenId.toString());
  if (!position) {
    position = new Position(event.params.tokenId.toString());
    position.owner = event.transaction.from;
  }
  position.liquidity = event.params.liquidity;
  position.save();

  let stats = Data.load("1");
  stats.stakedPositions = stats.stakedPositions.plus(ONE_BI);

  let incentive = Incentive.load(event.params.incentiveId.toHex());
  if (!incentive.started) {
    stats.activeIncentives = stats.activeIncentives.plus(ONE_BI);    
    incentive.started = true;
    incentive.save();
  }

  stats.save();

  let stake = new Stake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  stake.txHash = event.transaction.hash;
  stake.timestamp = event.block.timestamp;
  stake.position = position.id;
  stake.blockNumber = event.block.number;
  stake.save();

  let incentivePosition = IncentivePosition.load(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());
  if (!incentivePosition) {
    incentivePosition = new IncentivePosition(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());
    incentivePosition.position = event.params.tokenId.toString();
    incentivePosition.incentive = event.params.incentiveId.toHex();
    incentivePosition.claimed = new BigInt(0);
  }
  incentivePosition.staked = true;
  incentivePosition.save();
}

export function handleTokenUnstaked(event: TokenUnstaked): void {

  // IncentivePosition add collect amount
  let position = Position.load(event.params.tokenId.toString());

  let unstake = new Unstake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  unstake.txHash = event.transaction.hash;
  unstake.timestamp = event.block.timestamp;
  unstake.position = position.id;
  unstake.blockNumber = event.block.number;
  unstake.save();

  let incentive = Incentive.load(event.params.incentiveId.toHex());

  let stats = Data.load("1");
  stats.stakedPositions = stats.stakedPositions.minus(ONE_BI);

  if (!incentive.expired && event.block.timestamp.ge(incentive.endTime)) {
    stats.activeIncentives = stats.activeIncentives.minus(ONE_BI);    
    incentive.expired = true;
    incentive.save();
  }

  stats.save();

  let owner = OwnerRewardToken.load(position.owner.toHex() + incentive.rewardToken.toHex());
  if (!owner) {
    owner = new OwnerRewardToken(position.owner.toHex() + incentive.rewardToken.toHex());
    owner.address = position.owner;
    owner.rewardToken = incentive.rewardToken;
  }

  let incentivePosition = IncentivePosition.load(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());
  incentivePosition.staked = false;
  incentivePosition.save();
  
  // assume following claims for reward token will be for this incentive positions rewards
  owner.lastUnstakedIncentivePosition = event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString();
  owner.save();
}