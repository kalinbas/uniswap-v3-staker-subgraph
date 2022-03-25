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
import { Incentive, Position, OwnerStaker, IncentivePosition, OwnerStakerReward, Stake, Unstake, Claim } from '../generated/schema';

export function handleIncentiveCreated(event: IncentiveCreated): void {
  let incentiveIdTuple: Array<ethereum.Value> = [
    ethereum.Value.fromAddress(event.params.rewardToken),
    ethereum.Value.fromAddress(event.params.pool),
    ethereum.Value.fromUnsignedBigInt(event.params.startTime),
    ethereum.Value.fromUnsignedBigInt(event.params.endTime),
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

  entity.rewardToken = event.params.rewardToken;
  entity.pool = event.params.pool;
  entity.startTime = event.params.startTime;
  entity.endTime = event.params.endTime;
  entity.refundee = event.params.refundee;
  entity.reward = event.params.reward;
  entity.ended = false;

  entity.save();
}

export function handleIncentiveEnded(event: IncentiveEnded): void {
  let entity = Incentive.load(event.params.incentiveId.toHex());
  if (entity != null) {
    entity.ended = true;
    entity.save();
  }
}

export function handleRewardClaimed(event: RewardClaimed): void {

  let stakerContract = UniV3Staker.bind(event.address);
  let owner = OwnerStaker.load(event.params.to.toHex() + event.address.toHex());
  let rewardToken: Bytes = null;
  if (owner) {

    // find out which rewardtoken was claimed by using amount of claim - xtremely hacky shit
    let rewards = owner.rewards.split(",").filter(x => !!x);
    for (let i = 0; i < rewards.length; i++) {
      let key = rewards[i];
      let ownerReward = OwnerStakerReward.load(key);
      if (ownerReward) {
        let currentRewards = stakerContract.rewards(Address.fromString(ownerReward.rewardToken.toHex()), Address.fromString(event.params.to.toHex()));
        // check if rewards have changed exactly like predicted
        if (ownerReward.lastRewards.minus(currentRewards).equals(event.params.reward)) {
          rewardToken = ownerReward.rewardToken;
          ownerReward.claimed = ownerReward.claimed.plus(event.params.reward);
          ownerReward.lastRewards = currentRewards;
          ownerReward.save();
          break;
        }
      }
    }

    // find all incentives of owner that still have claimable amounts
    let incentives = owner.incentives.split(",").filter(x => !!x);
    let incompleteIncentives: IncentivePosition[] = [];
    let incompleteSum = BigInt.fromI32(0);
    for (let i = 0; i < incentives.length; i++) {
      let key = incentives[i];
      let incentivePosition = IncentivePosition.load(key);
      let incentive = Incentive.load(incentivePosition.incentive);
      if (incentive.rewardToken.equals(rewardToken)) {
        if (incentivePosition.claimed.lt(incentivePosition.reward)) {
          incompleteIncentives.push(<IncentivePosition>incentivePosition);
          incompleteSum = incompleteSum.plus(incentivePosition.reward.minus(incentivePosition.claimed));
        }
      }
    }

    if (incompleteSum.gt(BigInt.fromI32(0))) {
      // distribute claimed amount equally
      let precision = BigInt.fromI32(10).pow(8);
      let factor = event.params.reward.gt(incompleteSum) ? precision : event.params.reward.times(precision).div(incompleteSum);
      for (let i = 0; i < incompleteIncentives.length; i++) {
        let incentivePosition = incompleteIncentives[i];
        let amount = incentivePosition.reward.minus(incentivePosition.claimed).times(factor).div(precision);
        incentivePosition.claimed = incentivePosition.claimed.plus(amount);
        incentivePosition.save();

        let claim = new Claim(event.transaction.hash.toHex() + "#" + event.logIndex.toHex() + "_" + i.toString());
        claim.txHash = event.transaction.hash;
        claim.timestamp = event.block.timestamp;
        claim.position = incentivePosition.position;
        claim.amount = amount;
        claim.rewardToken = rewardToken;
        claim.save();
      }
    }
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
  stake.save();

  let incentivePosition = IncentivePosition.load(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());
  if (!incentivePosition) {
    incentivePosition = new IncentivePosition(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());
    incentivePosition.position = event.params.tokenId.toString();
    incentivePosition.incentive = event.params.incentiveId.toHex();
    incentivePosition.reward = new BigInt(0);
    incentivePosition.claimed = new BigInt(0);
    incentivePosition.save();

    let owner = OwnerStaker.load(position.owner.toHex() + event.address.toHex());
    if (!owner) {
      owner = new OwnerStaker(position.owner.toHex() + event.address.toHex());
      owner.address = position.owner;
      owner.staker = event.address;
      owner.rewards = "";
      owner.incentives = "";
    }
    owner.incentives += incentivePosition.id + ",";
    owner.save();
  }
}

export function handleTokenUnstaked(event: TokenUnstaked): void {

  // IncentivePosition add collect amount
  let position = Position.load(event.params.tokenId.toString());

  let unstake = new Unstake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  unstake.txHash = event.transaction.hash;
  unstake.timestamp = event.block.timestamp;
  unstake.position = position.id;
  unstake.save();

  let incentive = Incentive.load(event.params.incentiveId.toHex());

  let incentivePosition = IncentivePosition.load(event.params.incentiveId.toHex() + "#" + event.params.tokenId.toString());

  let stakerContract = UniV3Staker.bind(event.address)

  let currentRewards = stakerContract.rewards(Address.fromString(incentive.rewardToken.toHex()), Address.fromString(position.owner.toHex()));

  let ownerReward = OwnerStakerReward.load(incentive.rewardToken.toHex() + position.owner.toHex());
  if (!ownerReward) {
    ownerReward = new OwnerStakerReward(incentive.rewardToken.toHex() + position.owner.toHex());
    ownerReward.rewardToken = incentive.rewardToken;
    ownerReward.owner = position.owner;
    ownerReward.claimed = BigInt.fromI32(0);
    incentivePosition.reward = incentivePosition.reward.plus(currentRewards);

    // add to list of rewards for querying
    let owner = OwnerStaker.load(position.owner.toHex() + event.address.toHex());
    owner.rewards += ownerReward.id + ",";
    owner.save();
  } else {
    incentivePosition.reward = incentivePosition.reward.plus(currentRewards.minus(ownerReward.lastRewards));
  }
  ownerReward.lastRewards = currentRewards;
  ownerReward.save();
  incentivePosition.save();
}