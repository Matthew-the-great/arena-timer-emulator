// The ArenaTimer board has 171 pixels per strip, or 342 with its rear face.
// Reject truncated/overrun transport frames without altering any valid colors.
export function validArenaFrame(frame) {
  if(frame.event!=='leds'||![5,17].includes(frame.pin)||typeof frame.pixels!=='string')return false;
  const pixels=frame.pixels.length/6;
  return [171,342].includes(pixels)&&/^[a-f0-9]+$/.test(frame.pixels)&&
    (frame.bits===undefined||frame.bits===pixels*24);
}
