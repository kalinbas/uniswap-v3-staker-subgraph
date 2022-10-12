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
import { Incentive, Position, OwnerStaker, IncentivePosition, Stake, Unstake, Claim } from '../generated/schema';

export function handleIncentiveCreated(event: IncentiveCreated): void {
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

  let entity = Incentive.load(incentiveId.toHex());
  if (entity == null) {
    entity = new Incentive(incentiveId.toHex());
  }

  entity.contract = event.address;
  entity.rewardToken = event.params.rewardToken;
  entity.pool = event.params.pool;
  entity.startTime = event.params.startTime;
  entity.endTime = event.params.endTime;
  entity.vestingPeriod = event.params.vestingPeriod;
  entity.refundee = event.params.refundee;
  entity.reward = event.params.reward;
  entity.ended = false;

  entity.save();
}

export function handleIncentiveEnded(event: IncentiveEnded): void {
  let entity = Incentive.load(event.params.incentiveId.toHex());
  if (entity != null) {
    entity.ended = true;
    entity.refund = event.params.refund;
    entity.save();
  }
}

export function handleRewardClaimed(event: RewardClaimed): void {

  let owner = OwnerStaker.load(event.params.to.toHex() + event.address.toHex());
  let incentivePosition = IncentivePosition.load(owner.lastUnstakedIncentivePosition);
  if (owner.lastUnstakedIncentivePosition) {
    let incentive = Incentive.load(incentivePosition.incentive);
    let claim = new Claim(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
    claim.txHash = event.transaction.hash;
    claim.timestamp = event.block.timestamp;
    claim.blockNumber = event.block.number;
    claim.position = incentivePosition.position;
    claim.amount = event.params.reward;
    claim.rewardToken = incentive.rewardToken;
    claim.save();

    incentivePosition.claimed = incentivePosition.claimed.plus(event.params.reward);
    incentivePosition.save();

    owner.lastUnstakedIncentivePosition = null;
    owner.lastUnstakedTxHash = null;
    owner.save();
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

  let owner = OwnerStaker.load(position.owner.toHex() + event.address.toHex());
  if (!owner) {
    owner = new OwnerStaker(position.owner.toHex() + event.address.toHex());
    owner.address = position.owner;
    owner.staker = event.address;
  }

  let incentivePosition = IncentivePosition.load(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());
  incentivePosition.staked = false;
  incentivePosition.save();


  // only set position once - assume first following claim will be the correct one
  if (!owner.lastUnstakedIncentivePosition) {
    owner.lastUnstakedIncentivePosition = event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString();
    owner.lastUnstakedTxHash = event.transaction.hash;
    owner.save();
  }
}