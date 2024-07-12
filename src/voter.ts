import {
  GaugeCreated,
  GaugeKilled,
  GaugeRevived
} from '../generated/Voter/Voter';

import { CLGauge as CLGaugeTemplate } from '../generated/templates'
import { CLGauge } from '../generated/Voter/CLGauge'
import { Gauge } from '../generated/schema';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleGaugeCreated(event: GaugeCreated): void {
  let contract = CLGauge.bind(event.params.gauge);
  let nft = contract.try_nft();
  let rewardToken = contract.try_rewardToken();
  // only works if CLGauge
  if (!nft.reverted && !rewardToken.reverted) {
    CLGaugeTemplate.create(event.params.gauge)
    let gauge = new Gauge(event.params.gauge.toHex())
    gauge.pool = event.params.pool;
    gauge.rewardToken = rewardToken.value;
    gauge.claimTotal = BigInt.fromI32(0);
    gauge.save();
  }
}

export function handleGaugeKilled(event: GaugeKilled): void {

}

export function handleGaugeRevived(event: GaugeRevived): void {

}