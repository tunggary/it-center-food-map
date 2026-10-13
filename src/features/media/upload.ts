export async function uploadRawPhoto(signedUrl: string, blob: Blob): Promise<void> {
  const response = await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: blob });
  if (response.ok) return;
  if (response.status === 400 || response.status === 409) {
    const error = await response.json().catch(() => null) as { error?: string; statusCode?: string | number } | null;
    // A lost upload response can leave the immutable object already present.
    // Only Storage's precise duplicate response advances to server finalize validation.
    if (error?.error === 'Duplicate' && String(error.statusCode) === '409') return;
  }
  throw new Error('사진 업로드에 실패했어요. 선택한 파일을 유지했어요.');
}
