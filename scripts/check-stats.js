import { KeyManager } from '../src/keyManager.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create key manager
const keyManager = KeyManager.fromEnv();

// Get health stats
const health = keyManager.health();

// Calculate stats
const disabledKeys = health.keys.filter(k => k.disabled);
const validKeys = health.keys.filter(k => !k.disabled);
const keysWithBalance = health.keys.filter(k => k.totalBalance && k.totalBalance > 0);
const keysWithoutBalance = health.keys.filter(k => !k.totalBalance || k.totalBalance <= 0);

console.log('========================================');
console.log('       KEY STATUS SUMMARY');
console.log('========================================');
console.log(`Total Keys:      ${health.totalKeys}`);
console.log(`Valid Keys:      ${validKeys.length}`);
console.log(`Disabled Keys:   ${disabledKeys.length}`);
console.log(`With Balance:    ${keysWithBalance.length}`);
console.log(`Without Balance: ${keysWithoutBalance.length}`);
console.log('========================================');

if (disabledKeys.length > 0) {
  console.log('\nDISABLED KEYS DETAILS:');
  console.log('----------------------------------------');
  disabledKeys.forEach(key => {
    const reason = key.disabledReason || 'Unknown';
    const disabledAt = key.disabledAt ? new Date(key.disabledAt).toLocaleString() : 'Unknown';
    console.log(`Key ${key.id}: ${key.keyMasked}`);
    console.log(`  Reason: ${reason}`);
    console.log(`  Disabled At: ${disabledAt}`);
    console.log('');
  });
}

console.log('Service is now running...\n');