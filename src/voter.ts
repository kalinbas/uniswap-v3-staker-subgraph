import {
  GaugeCreated,
  GaugeKilled,
  GaugeRevived
} from '../generated/Voter/Voter';

import { CLGauge as CLGaugeTemplate } from '../generated/templates'

export function handleGaugeCreated(event: GaugeCreated): void {
  CLGaugeTemplate.create(event.params.gauge)
}

export function handleGaugeKilled(event: GaugeKilled): void {

}

export function handleGaugeRevived(event: GaugeRevived): void {

}