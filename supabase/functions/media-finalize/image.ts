import { ImageMagick, initializeImageMagick, MagickFormat } from '@imagemagick/magick-wasm';
// Vendored, pinned 0.0.44 WASM is a deployable static file, never a remote runtime dependency.
let ready:Promise<void>|undefined;
export function jpegDimensions(data:Uint8Array):{width:number,height:number}{
 if(data.length<4||data[0]!==255||data[1]!==216)throw new Error('INVALID_JPEG');
 for(let pos=2;pos+3<data.length;){if(data[pos++]!==255)throw new Error('INVALID_JPEG');while(data[pos]===255)pos++;const marker=data[pos++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
 const length=data[pos]*256+data[pos+1];if(length<2||pos+length>data.length)throw new Error('INVALID_JPEG');
 if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)throw new Error('INVALID_JPEG');return {height:data[pos+3]*256+data[pos+4],width:data[pos+5]*256+data[pos+6]};}pos+=length;}
 throw new Error('INVALID_JPEG');
}
export async function normalizeImage(bytes:Uint8Array){
 const dimensions=jpegDimensions(bytes);if(bytes.length>524288||dimensions.width*dimensions.height>2000000||dimensions.width<1||dimensions.height<1)throw new Error('MEDIA_TOO_LARGE');
 ready??=Deno.readFile(new URL('./magick.wasm.gz',import.meta.url)).then(async data=>new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())).then(initializeImageMagick);await ready;
 let full=new Uint8Array(),thumb=new Uint8Array();
 ImageMagick.read(bytes,image=>{
 if(image.width*image.height>2000000)throw new Error('MEDIA_TOO_LARGE');image.autoOrient();image.strip();
 if(Math.max(image.width,image.height)>1280){const ratio=1280/Math.max(image.width,image.height);image.resize(Math.max(1,Math.round(image.width*ratio)),Math.max(1,Math.round(image.height*ratio)));}
 for(let quality=85;quality>=25;quality-=10){image.quality=quality;image.write(MagickFormat.Jpeg,data=>{full=new Uint8Array(data);});if(full.length<=524288)break;}
 if(full.length>524288)throw new Error('MEDIA_TOO_LARGE');
 const ratio=Math.min(1,320/Math.max(image.width,image.height));image.resize(Math.max(1,Math.round(image.width*ratio)),Math.max(1,Math.round(image.height*ratio)));image.strip();
 for(let quality=80;quality>=20;quality-=10){image.quality=quality;image.write(MagickFormat.Jpeg,data=>{thumb=new Uint8Array(data);});if(thumb.length<=65536)break;}
 if(thumb.length>65536)throw new Error('MEDIA_TOO_LARGE');
 });return {full,thumb};
}
