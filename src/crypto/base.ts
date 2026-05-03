/**
 * Base crypto ramp provider abstract class
 */

import {
  OnRampParams,
  OffRampParams,
  RampQuote,
  RampResult,
  CryptoRampCapabilities,
  CryptoNetwork,
} from './types';

export function validateWalletAddress(address: string, network: CryptoNetwork): void {
  const patterns: Record<CryptoNetwork, RegExp> = {
    BTC: /^([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})$/,
    ETH: /^0x[a-fA-F0-9]{40}$/,
    POLYGON: /^0x[a-fA-F0-9]{40}$/,
    BSC: /^0x[a-fA-F0-9]{40}$/,
    TRON: /^T[A-Za-z1-9]{33}$/,
  };
  const re = patterns[network];
  if (!re) throw new Error(`Unsupported network: ${network}`);
  if (!re.test(address)) throw new Error(`Invalid ${network} wallet address`);
}

export abstract class CryptoRampProvider {
  abstract readonly name: string;

  abstract getQuote(
    direction: 'on' | 'off',
    fiatAmount: number,
    fiatCurrency: string,
    cryptoAsset: string,
    network: string
  ): Promise<RampQuote>;

  abstract createOnRamp(params: OnRampParams): Promise<RampResult>;

  abstract createOffRamp(params: OffRampParams): Promise<RampResult>;

  abstract getRamp(id: string): Promise<RampResult>;

  abstract parseWebhook(body: any, headers?: any): any;

  abstract verifyWebhook(body: any, headers?: any): boolean;

  abstract getCapabilities(): CryptoRampCapabilities;
}
