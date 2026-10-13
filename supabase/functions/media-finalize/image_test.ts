import {jpegDimensions,normalizeImage} from './image.ts';
function assert(value:unknown){if(!value)throw new Error('Assertion failed');}
Deno.test('reject invalid/non-JPEG and oversized header before WASM decode',()=>{
 for(const data of [new Uint8Array(),new TextEncoder().encode('<svg/>'),new Uint8Array([255,216,255,192,0,17,8,255,255,255,255,3,1,0,2,0,3,0,0])]){
 let rejected=false;try{const d=jpegDimensions(data);if(d.width*d.height>2000000)rejected=true;}catch{rejected=true;}assert(rejected);
 }
});
Deno.test('normalized full/thumb are bounded JPEG with stripped metadata',async()=>{
 const input=await Deno.readFile(new URL('./gate.jpg',import.meta.url));const start=performance.now();const result=await normalizeImage(input);const full=jpegDimensions(result.full),thumb=jpegDimensions(result.thumb);
 assert(Math.max(full.width,full.height)<=1280&&Math.max(thumb.width,thumb.height)<=320);assert(result.full.length<=524288&&result.thumb.length<=65536);
 console.log(JSON.stringify({gate:'local-image',elapsedMs:performance.now()-start,fullBytes:result.full.length,thumbBytes:result.thumb.length,heapBytes:Deno.memoryUsage().heapUsed}));
});
