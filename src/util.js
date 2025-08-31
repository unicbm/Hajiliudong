/**
 * Utility functions for key masking and utilities
 */

/**
 * Mask API key for display (only show first 4 and last 4 characters)
 * @param {string} key - The API key to mask
 * @returns {string} - Masked key
 */
export function maskKey(key) {
  if (!key || key.length <= 8) {
    return '***';
  }
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

/**
 * Delay function returning a Promise
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} - Promise that resolves after delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}