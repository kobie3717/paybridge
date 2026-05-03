/**
 * Crypto on/off-ramp types
 */

import { Customer, Currency } from '../types';
import { RoutingMeta } from '../routing-types';

export type CryptoAsset = 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'BNB' | 'SOL' | string;

export type CryptoNetwork = 'BTC' | 'ETH' | 'TRON' | 'POLYGON' | 'BSC' | 'SOLANA' | string;

export type RampDirection = 'on' | 'off';

export type RampStatus = 'pending' | 'completed' | 'failed' | 'expired';

export interface OnRampParams {
  fiatAmount: number;
  fiatCurrency: Currency;
  asset: CryptoAsset;
  network: CryptoNetwork;
  destinationWallet: string;
  customer: Customer;
  urls: {
    success: string;
    cancel: string;
    webhook: string;
  };
  reference: string;
  metadata?: Record<string, any>;
}

export interface BankAccount {
  accountNumber: string;
  branchCode: string;
  accountHolder: string;
  bankName: string;
}

export interface OffRampParams {
  cryptoAmount: number;
  asset: CryptoAsset;
  network: CryptoNetwork;
  sourceWallet?: string;
  fiatCurrency: Currency;
  bankAccount: BankAccount;
  customer: Customer;
  urls?: {
    success: string;
    cancel: string;
    webhook: string;
  };
  reference: string;
  metadata?: Record<string, any>;
}

export interface RampQuote {
  fiatAmount: number;
  cryptoAmount: number;
  rate: number;
  feeFixed: number;
  feePercent: number;
  feeTotal: number;
  expiresAt: string;
}

export interface RampResult {
  id: string;
  direction: RampDirection;
  status: RampStatus;
  quote: RampQuote;
  checkoutUrl?: string;
  depositAddress?: string;
  depositTag?: string;
  txHash?: string;
  createdAt: string;
  expiresAt?: string;
  raw?: any;
  routingMeta?: RoutingMeta;
}

export interface CryptoRampCapabilities {
  supportedAssets: CryptoAsset[];
  supportedNetworks: CryptoNetwork[];
  supportedFiat: Currency[];
  country: string;
  kycRequired: boolean;
  onRampLimits?: {
    min: number;
    max: number;
  };
  offRampLimits?: {
    min: number;
    max: number;
  };
  fees: {
    onRampPercent: number;
    offRampPercent: number;
  };
  experimental?: boolean;
}
