import test from 'node:test';
import assert from 'node:assert/strict';
import {v20SafeError} from '../lib/v20-safe-error.mjs';

test('V20 errors are localized in all six languages without leaking provider details',()=>{
 const messages=['it','en','es','fr','de','pt'].map(v20SafeError);
 assert.equal(new Set(messages).size,6);
 for(const message of messages){assert.ok(message.length>30);assert.doesNotMatch(message,/supabase|postgres|SQLSTATE|permission denied/i);}
});
test('V20 errors default to Italian for unknown or invalid locale',()=>{
 assert.equal(v20SafeError('zz'),v20SafeError('it'));
 assert.equal(v20SafeError(null),v20SafeError('it'));
 assert.equal(v20SafeError('en-GB'),v20SafeError('en'));
});
