import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (amount, currency = 'UYU') => {
  const options = {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'UYU' ? 0 : 2
  };
  const locale = currency === 'UYU' ? 'es-UY' : 'en-US';
  return new Intl.NumberFormat(locale, options).format(amount || 0);
};

export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('es-UY', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};