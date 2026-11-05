/** Longest side of an uploaded progress photo: sharp on a phone, small to send. */
const MAX_SIDE = 1280

/**
 * Shrinks a photo from the camera or gallery to a JPEG of at most 1280 px, so check-ins send
 * quickly on mobile data. Falls back to the original file if the browser can't read it.
 */
export async function resizePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    return blob ?? file
  } catch {
    return file
  }
}
