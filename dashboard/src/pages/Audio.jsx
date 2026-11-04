import { useEffect, useState, useRef } from "react";
import { audioApi } from "../api/audio";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import Button from "../components/common/Button";

export default function Audio() {
  const [state, setState] = useState(null);
  const [text, setText] = useState("Hello, I am Vision.");
  const [voiceConfigured, setVoiceConfigured] = useState(true);
  const audioRef = useRef(null);

  const refresh = () => audioApi.state().then((r) => setState(r.state)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const speak = async () => {
    const result = await audioApi.speak(text);
    refresh();
    const audioBase64 = result?.result?.audioBase64;
    if (audioBase64 && audioRef.current) {
      audioRef.current.src = `data:${result.result.mimeType ?? "audio/mpeg"};base64,${audioBase64}`;
      audioRef.current.play();
      setVoiceConfigured(true);
    } else {
      setVoiceConfigured(false);
    }
  };

  return (
    <Card title="Audio">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-vision-muted">State:</span>
        <Badge tone={state === "LISTENING" || state === "SPEAKING" ? "ok" : "neutral"}>{state ?? "…"}</Badge>
      </div>
      <div className="flex gap-2 mb-6">
        <Button onClick={() => audioApi.startListening().then(refresh)}>Start Listening</Button>
        <Button variant="ghost" onClick={() => audioApi.stopListening().then(refresh)}>Stop Listening</Button>
        <Button variant="danger" onClick={() => audioApi.stop().then(refresh)}>Stop Audio</Button>
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 bg-vision-hover/5 rounded-lg px-3 py-2 text-sm outline-none" />
        <Button onClick={speak}>Speak / Preview Voice</Button>
      </div>
      <audio ref={audioRef} className="w-full mt-3" controls />
      {!voiceConfigured && (
        <p className="text-xs text-vision-warn mt-2">No audio returned — if TTS_PROVIDER=mock this is expected (silent mode). If using the free Edge voice, check the server has outbound internet access. See docs/audio.md.</p>
      )}
      <p className="text-xs text-vision-muted mt-4">Speech-to-text and text-to-speech run server-side. Movement intents from speech still go through the Command Registry like any other command.</p>
    </Card>
  );
}
