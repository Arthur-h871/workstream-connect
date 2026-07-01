import { supabase } from "backend/api/supabase";

const DEFAULT_INTERVAL_MS = 30_000;

type MonitorStream = {
  index: number;
  stream: MediaStream;
  video: HTMLVideoElement;
};

export type CaptureHandle = {
  addMonitor: () => Promise<void>;
  stopCapture: () => void;
  monitorCount: () => number;
  pause: () => void;
  resume: () => void;
};

type StartCaptureArgs = {
  sessionId: string;
  userId: string;
  organizationId: string;
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

function createOffscreenVideo(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video
        .play()
        .then(() => resolve(video))
        .catch(reject);
    };
    video.onerror = () => reject(new Error("Falha ao carregar stream de captura"));
  });
}

async function captureFrame(monitor: MonitorStream): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = monitor.video.videoWidth;
  canvas.height = monitor.video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponível");
  ctx.drawImage(monitor.video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem do frame"))),
      "image/png",
    );
  });
}

async function uploadFrame(args: {
  blob: Blob;
  userId: string;
  sessionId: string;
  organizationId: string;
  monitorIndex: number;
}): Promise<void> {
  const capturedAt = new Date();
  const path = `${args.userId}/${args.sessionId}/${args.monitorIndex}/${capturedAt.getTime()}.png`;

  const { error: uploadError } = await supabase.storage
    .from("screenshots")
    .upload(path, args.blob, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("screenshots").insert({
    session_id: args.sessionId,
    user_id: args.userId,
    organization_id: args.organizationId,
    captured_at: capturedAt.toISOString(),
    storage_path: path,
    file_size_bytes: args.blob.size,
    monitor_index: args.monitorIndex,
  });
  if (insertError) throw insertError;
}

export async function startCapture(args: StartCaptureArgs): Promise<CaptureHandle> {
  const monitors: MonitorStream[] = [];
  const intervalMs = args.intervalMs ?? DEFAULT_INTERVAL_MS;
  let paused = false;

  async function addMonitor(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" } as MediaTrackConstraints,
      audio: false,
    });
    const video = await createOffscreenVideo(stream);
    const index = monitors.length;
    const monitor: MonitorStream = { index, stream, video };
    monitors.push(monitor);

    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      const pos = monitors.indexOf(monitor);
      if (pos !== -1) monitors.splice(pos, 1);
    });
  }

  async function tick(): Promise<void> {
    if (paused) return;
    await Promise.allSettled(
      monitors.map(async (monitor) => {
        try {
          const blob = await captureFrame(monitor);
          await uploadFrame({
            blob,
            userId: args.userId,
            sessionId: args.sessionId,
            organizationId: args.organizationId,
            monitorIndex: monitor.index,
          });
        } catch (error) {
          args.onError?.(error);
        }
      }),
    );
  }

  await addMonitor();
  const intervalId = setInterval(tick, intervalMs);

  return {
    addMonitor,
    monitorCount: () => monitors.length,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    stopCapture: () => {
      clearInterval(intervalId);
      for (const monitor of monitors) {
        monitor.stream.getTracks().forEach((track) => track.stop());
        monitor.video.srcObject = null;
      }
      monitors.length = 0;
    },
  };
}
