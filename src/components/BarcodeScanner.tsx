"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onDetected: (isbn: string) => void;
  onClose: () => void;
};

// Book barcodes are EAN-13 codes that start with 978 or 979 (the ISBN-13 itself).
const isIsbnBarcode = (code: string) => /^97[89]\d{10}$/.test(code);

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

/**
 * Full-screen camera view that reads a book's barcode. Uses the browser's BarcodeDetector where
 * it exists (Chrome, Android) and ZXing otherwise (iOS Safari).
 */
export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const done = useRef(false);
  // Kept in a ref so a parent re-render doesn't restart the camera.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const finish = (code: string) => {
      if (done.current || !isIsbnBarcode(code)) return;
      done.current = true;
      navigator.vibrate?.(60);
      onDetectedRef.current(code);
    };

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use the camera here. The camera needs a secure (https) connection.");
        return;
      }
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      };

      const Native = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      const nativeOk = Native && (!Native.getSupportedFormats || (await Native.getSupportedFormats()).includes("ean_13"));

      try {
        if (nativeOk) {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) return;
          video.srcObject = stream;
          await video.play();
          setReady(true);
          const detector = new Native!({ formats: ["ean_13"] });
          const tick = async () => {
            if (cancelled || done.current) return;
            try {
              for (const r of await detector.detect(video)) finish(r.rawValue);
            } catch {
              // A frame that couldn't be read; keep going.
            }
            timer = setTimeout(tick, 120);
          };
          tick();
        } else {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);
          const hints = new Map<import("@zxing/library").DecodeHintType, unknown>([
            [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
            [DecodeHintType.TRY_HARDER, true],
          ]);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
          const controls = await reader.decodeFromConstraints(constraints, video, (result) => {
            if (result) finish(result.getText());
          });
          if (cancelled) controls.stop();
          else {
            stopZxing = () => controls.stop();
            setReady(true);
          }
        }
      } catch (err) {
        const name = (err as Error).name;
        setError(
          name === "NotAllowedError"
            ? "Camera access was blocked. Allow the camera for this site in Settings, then try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : "The camera couldn't start. Try again, or type the ISBN instead.",
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Esc closes on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan a barcode" className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-cover" />

        {/* Guide frame over a dimmed surround. */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-36 w-[78%] max-w-sm rounded-xl shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)]">
            {["top-0 left-0 border-t-2 border-l-2 rounded-tl-xl", "top-0 right-0 border-t-2 border-r-2 rounded-tr-xl", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl"].map((c) => (
              <span key={c} className={`absolute size-7 border-white ${c}`} />
            ))}
            {ready && !error && <span className="absolute inset-x-4 top-1/2 h-px animate-pulse bg-white/70" />}
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <span className="text-sm text-white/80">Scan a book&rsquo;s barcode</span>
          <button type="button" onClick={onClose} className="rounded-full border border-white/25 bg-black/40 px-4 py-1.5 text-sm text-white backdrop-blur">
            Cancel
          </button>
        </div>
      </div>

      <div className="px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-sm">
        {error ? (
          <p className="text-danger">{error}</p>
        ) : (
          <p className="text-white/60">{ready ? "Line up the barcode on the back cover inside the frame." : "Starting the camera…"}</p>
        )}
      </div>
    </div>
  );
}
