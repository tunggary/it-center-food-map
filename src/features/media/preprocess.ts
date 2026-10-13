export async function preprocessPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPEG·PNG·WebP 사진을 선택해 주세요. HEIC는 JPEG로 변환한 뒤 올려 주세요.');
  if (file.size > 10 * 1024 * 1024) throw new Error('원본 사진은 10MiB까지 선택할 수 있어요.');
  const header = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const chunks = new TextDecoder('latin1').decode(header);
  if ((file.type === 'image/png' && chunks.includes('acTL')) || (file.type === 'image/webp' && chunks.includes('ANIM'))) throw new Error('움직이는 사진은 지원하지 않아요. 정지 사진을 선택해 주세요.');
  let image: ImageBitmap;
  try { image = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('사진을 읽지 못했어요. JPEG로 변환한 뒤 다시 선택해 주세요.'); }
  try {
    if (image.width * image.height > 40_000_000) throw new Error('원본 사진은 40MP까지 선택할 수 있어요.');
    let scale = Math.min(1, 1280 / Math.max(image.width, image.height), Math.sqrt(2_000_000 / (image.width * image.height)));
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서 사진을 변환할 수 없어요.');
    for (let step = 0; step < 7; step++) {
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(.5, .86 - step * .06)));
      if (blob && blob.size <= 512 * 1024) return blob;
      scale *= .8;
    }
    throw new Error('사진을 충분히 줄이지 못했어요. 작은 사진으로 다시 선택해 주세요.');
  } finally { image.close(); }
}
