export const MAX_PHOTO_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

export type CameraSession = {
  stream: MediaStream;
  stop(): void;
};

export class CameraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CameraError";
  }
}

export function calculateContainSize(
  width: number,
  height: number,
  maxEdge = MAX_PHOTO_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new CameraError("The camera returned an invalid image size.");
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new CameraError("Chrome could not encode the captured photograph."));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

async function drawToJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<Blob> {
  const size = calculateContainSize(sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new CameraError("Chrome could not prepare the photograph.");
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvasBlob(canvas);
}

export async function startCamera(video: HTMLVideoElement): Promise<CameraSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("Camera preview is unavailable in this browser.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    video.srcObject = stream;
    await video.play();
    return {
      stream,
      stop() {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      },
    };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    const message =
      name === "NotAllowedError"
        ? "Camera permission was denied. Allow it in Chrome site settings or choose a photo."
        : "The rear camera could not be started. You can choose a photo instead.";
    throw new CameraError(message);
  }
}

export function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  return drawToJpeg(video, video.videoWidth, video.videoHeight);
}

export async function resizePhotoFile(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new CameraError("Choose an image file.");
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      return await drawToJpeg(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    if (error instanceof CameraError) throw error;
    throw new CameraError("Chrome could not read that photograph.");
  }
}
