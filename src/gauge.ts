import { ethereum, crypto, Address, BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  GaugeCreated,
  GaugeKilled,
  GaugeRevived
} from '../generated/Voter/Voter';
import {
  ClaimRewards,
  Deposit,
  Withdraw,
  NotifyReward
} from '../generated/templates/CLGauge/CLGauge';
import { CLGauge as CLGaugeTemplate } from '../generated/templates'
import { CLGauge } from '../generated/Voter/CLGauge'
import { Incentive, Position, Stake, Unstake, Claim } from '../generated/schema';

export function handleGaugeCreated(event: GaugeCreated): void {
  if (event.params.gaugeFactory.toHexString() === "0x327147ee440252b893a771345025b41a267ad985" || event.params.gaugeFactory.toHexString() === "0x327147eE440252b893A771345025B41A267Ad985") {
    CLGaugeTemplate.create(event.params.gauge)
  }  
}

export function handleGaugeKilled(event: GaugeKilled): void {

}

export function handleGaugeRevived(event: GaugeRevived): void {

}

export function handleDeposit(event: Deposit): void {
  let position = Position.load(event.params.tokenId.toString());
  if (!position) {
    position = new Position(event.params.tokenId.toString());
  }
  position.owner = event.params.user;
  position.liquidity = event.params.liquidityToStake;
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

  let unstake = new Unstake(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  unstake.txHash = event.transaction.hash;
  unstake.timestamp = event.block.timestamp;
  unstake.position = position.id;
  unstake.blockNumber = event.block.number;
  unstake.save();
}

export function handleClaimRewards(event: ClaimRewards): void {

  let contract = CLGauge.bind(event.address)
  let rewardToken = contract.rewardToken()

  let claim = new Claim(event.transaction.hash.toHex() + "#" + event.logIndex.toHex());
  claim.txHash = event.transaction.hash;
  claim.timestamp = event.block.timestamp;
  claim.blockNumber = event.block.number;
  claim.amount = event.params.amount;
  claim.rewardToken = rewardToken;
  claim.save();
}

export function handleNotifyReward(event: NotifyReward): void {

  let contract = CLGauge.bind(event.address)
  let rewardToken = contract.rewardToken()
  let endTime = contract.periodFinish()
  let pool = contract.pool()

  let incentive = new Incentive(event.transaction.hash.toHex() + "#" + event.logIndex.toHex())
  incentive.reward = event.params.amount
  incentive.rewardToken = rewardToken
  incentive.startTime = event.block.timestamp
  incentive.endTime = endTime
  incentive.gauge = event.address;
  incentive.pool = pool;
  incentive.save();
}

