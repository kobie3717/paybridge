/**
 * Currency conversion utilities
 */

import { Currency } from '../types';

/**
 * Convert major currency unit to minor unit (cents)
 * @example toMinorUnit(299.00, 'ZAR') => 29900
 */
export function toMinorUnit(amount: number, currency: Currency): number {
  const decimals = getDecimalPlaces(currency);
  return Math.round(amount * Math.pow(10, decimals));
}

/**
 * Convert minor unit (cents) to major currency unit
 * @example toMajorUnit(29900, 'ZAR') => 299.00
 */
export function toMajorUnit(amount: number, currency: Currency): number {
  const decimals = getDecimalPlaces(currency);
  return amount / Math.pow(10, decimals);
}

/**
 * Get decimal places for currency
 * Most currencies use 2 decimal places, some use 0
 */
export function getDecimalPlaces(currency: Currency): number {
  // Zero decimal currencies
  const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];

  if (zeroDecimalCurrencies.includes(currency)) {
    return 0;
  }

  return 2;
}

/**
 * Format amount with currency symbol
 * @example formatCurrency(299.00, 'ZAR') => "R299.00"
 */
export function formatCurrency(amount: number, currency: Currency): string {
  const symbols: Record<Currency, string> = {
    ZAR: 'R',
    USD: '$',
    EUR: '€',
    GBP: '£',
    NGN: '₦',
  };

  const symbol = symbols[currency] || currency;
  const decimals = getDecimalPlaces(currency);

  return `${symbol}${amount.toFixed(decimals)}`;
}

/**
 * Validate amount is positive and has correct decimal places
 */
export function validateAmount(amount: number, currency: Currency): void {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const decimals = getDecimalPlaces(currency);
  const multiplier = Math.pow(10, decimals);

  if (Math.round(amount * multiplier) !== amount * multiplier) {
    throw new Error(`Amount must have at most ${decimals} decimal places for ${currency}`);
  }
}
