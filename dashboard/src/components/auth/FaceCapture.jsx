import { useState, useRef, useEffect } from "react";
import { FiCamera } from "react-icons/fi";

/** Optional face photo so Vision can recognise the new user. Calls onChange(base64 | null). */
export default function FaceCapture({ onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [live, setLive] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState(null);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setLive(false); };
  useEffect(() => stop, []);
  useEffect(() => { if (live && videoRef.current) videoRef.current.srcObject = streamRef.current; }, [live]);

  const start = async () => {
    setError(null);
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setLive(true);
    } catch {
      setError("Camera unavailable. You can add a photo later.");
    }
  };
  const snap = () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const url = c.toDataURL("image/jpeg", 0.9);
    setPhoto(url); onChange(url.split(",")[1]); stop();
  };
  const clear = () => { setPhoto(null); onChange(null); };

  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-3.5">
      <div className="text-[13px] font-medium text-slate-700">Face recognition <span className="text-slate-400 font-normal">(optional)</span></div>
      <p className="text-xs text-slate-500 mb-2.5">Add a photo so Vision recognises you. Skip it and link later.</p>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {photo ? (
        <div className="flex items-center gap-3">
          <img src={photo} alt="Your photo" className="w-14 h-14 rounded-lg object-cover" />
          <button type="button" onClick={() => { clear(); start(); }} className="text-xs text-slate-600 hover:underline">Retake</button>
          <button type="button" onClick={clear} className="text-xs text-slate-600 hover:underline">Remove</button>
        </div>
      ) : live ? (
        <div className="flex items-center gap-3">
          <video ref={videoRef} autoPlay muted playsInline className="w-28 h-20 rounded-lg bg-black object-cover" />
          <button type="button" onClick={snap} className="text-xs py-1.5 px-3 rounded-lg bg-[#1b1b1c] text-white font-medium">Capture</button>
          <button type="button" onClick={stop} className="text-xs text-slate-600 hover:underline">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={start} className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 hover:text-black">
          <FiCamera className="w-4 h-4" /> Use camera
        </button>
      )}
    </div>
  );
}
