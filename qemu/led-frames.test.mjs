import test from 'node:test';
import assert from 'node:assert/strict';
import {validArenaFrame} from './led-frames.mjs';

test('accept complete front/rear frames including genuine green',()=>{
  for(const pin of [5,17])for(const count of [171,342])
    assert.equal(validArenaFrame({event:'leds',pin,pixels:'00ff00'.repeat(count),bits:count*24}),true);
});
test('reject truncated, overrun and partial-pixel frames',()=>{
  for(const count of [0,170,343,384])
    assert.equal(validArenaFrame({event:'leds',pin:5,pixels:'ff0000'.repeat(count),bits:count*24}),false);
  assert.equal(validArenaFrame({event:'leds',pin:5,pixels:'ff0000'.repeat(342),bits:8209}),false);
  assert.equal(validArenaFrame({event:'leds',pin:5,pixels:'zz0000'.repeat(342),bits:8208}),false);
});
