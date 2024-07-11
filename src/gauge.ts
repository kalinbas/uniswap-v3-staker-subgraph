import { ethereum, crypto, Address, BigInt, log } from '@graphprotocol/graph-ts';

import {
  ClaimRewards,
  Deposit,
  Withdraw,
  NotifyReward
} from '../generated/templates/CLGauge/CLGauge';

import { CLGauge } from '../generated/Voter/CLGauge'
import { Incentive, Position, Stake, Unstake, Claim } from '../generated/schema';


export function handleDeposit(event: Deposit): void {
  let position = Position.load(event.params.tokenId.toString());
  if (!position) {
    position = new Position(event.params.tokenId.toString());
  }
  position.owner = event.params.user;
  position.liquidity = event.params.liquidityToStake;
  position.staked = true;
  position.save();

  let stake = new Stake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  stake.txHash = event.transaction.hash;
  stake.timestamp = event.block.timestamp;
  stake.position = position.id;
  stake.blockNumber = event.block.number;
  stake.save();
}

export function handleWithdraw(event: Withdraw): void {
  let position = Position.load(event.params.tokenId.toString())!;
  position.staked = false;
  position.liquidity = BigInt.fromI32(0);
  position.owner = Address.zero();
  position.save();

  let unstake = new Unstake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  unstake.txHash = event.transaction.hash;
  unstake.timestamp = event.block.timestamp;
  unstake.position = position.id;
  unstake.blockNumber = event.block.number;
  unstake.save();
}

export function handleClaimRewards(event: ClaimRewards): void {

  let contract = CLGauge.bind(event.address)
  let rewardToken = contract.try_rewardToken()
  if (rewardToken.reverted) {
    log.warning("gauge contract call reverted", []);
  }

  let claim = new Claim(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  claim.txHash = event.transaction.hash;
  claim.timestamp = event.block.timestamp;
  claim.blockNumber = event.block.number;
  claim.amount = event.params.amount;
  claim.rewardToken = rewardToken.value;
  claim.owner = event.params.from;
  claim.save();
}

export function handleNotifyReward(event: NotifyReward): void {

  let contract = CLGauge.bind(event.address)
  let rewardToken = contract.try_rewardToken()
  let endTime = contract.try_periodFinish()
  let rewardRate = contract.try_rewardRate()
  let pool = contract.try_pool()

  if (rewardToken.reverted || endTime.reverted || rewardRate.reverted || pool.reverted) {
    log.warning("gauge contract call reverted", []);
  } else {
    let incentive = new Incentive(event.transaction.hash.toHex() + "#" + event.logIndex.toHex())
    incentive.reward = rewardRate.value.times(endTime.value.minus(event.block.timestamp))
    incentive.rewardToken = rewardToken.value
    incentive.startTime = event.block.timestamp
    incentive.endTime = endTime.value
    incentive.gauge = event.address;
    incentive.pool = pool.value;
    incentive.save();
  }


}

