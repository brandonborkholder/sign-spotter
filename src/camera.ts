export const MAX_PHOTO_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

export type CameraSession = {
  stream: MediaStream;
  digitalZoom: number;
  zoomLabel: string;
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

export function calculateZoomCrop(
  width: number,
  height: number,
  zoom = 1,
): { x: number; y: number; width: number; height: number } {
  if (width <= 0 || height <= 0 || zoom < 1) {
    throw new CameraError("The camera returned an invalid zoom area.");
  }
  const cropWidth = width / zoom;
  const cropHeight = height / zoom;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
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
  zoom = 1,
): Promise<Blob> {
  const crop = calculateZoomCrop(sourceWidth, sourceHeight, zoom);
  const size = calculateContainSize(crop.width, crop.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new CameraError("Chrome could not prepare the photograph.");
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size.width,
    size.height,
  );
  return canvasBlob(canvas);
}

type ZoomCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step?: number };
};

export async function applyPreferredZoom(track: MediaStreamTrack, preferred = 2): Promise<boolean> {
  const capabilities = track.getCapabilities?.() as ZoomCapabilities | undefined;
  const zoom = capabilities?.zoom;
  if (!zoom || !Number.isFinite(zoom.min) || !Number.isFinite(zoom.max)) return false;
  if (zoom.min > preferred || zoom.max < preferred) return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: preferred } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
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
    const hardwareZoom = await applyPreferredZoom(stream.getVideoTracks()[0]!);
    const digitalZoom = hardwareZoom ? 1 : 2;
    video.srcObject = stream;
    video.classList.toggle("digital-zoom-2x", digitalZoom === 2);
    await video.play();
    return {
      stream,
      digitalZoom,
      zoomLabel: hardwareZoom ? "2× zoom" : "2× digital zoom",
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

export function captureVideoFrame(video: HTMLVideoElement, digitalZoom = 1): Promise<Blob> {
  return drawToJpeg(video, video.videoWidth, video.videoHeight, digitalZoom);
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
