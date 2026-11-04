import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import Badge from "../components/common/Badge";
import { usersApi } from "../api/users";
import { settingsApi } from "../api/settings";
import { useAuthStore, hasRole } from "../auth/authStore";
import { authStore } from "../auth/authStore";
import { useTheme } from "../state/ThemeContext";

import {
  HiOutlineUser,
  HiOutlineColorSwatch,
  HiOutlineChip,
  HiOutlineCamera,
  HiOutlineX,
  HiOutlineCog,
} from "react-icons/hi";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const TABS = [
  { id: "account", label: "Account", icon: HiOutlineUser },
  { id: "appearance", label: "Appearance", icon: HiOutlineColorSwatch },
  { id: "robot", label: "Robot Mode", icon: HiOutlineChip },
  { id: "face", label: "Face Link", icon: HiOutlineCamera },
];

/* ---------- Account ---------- */
function AccountPanel() {
  const { user } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const updatedUser = await usersApi.uploadAvatar(imageBase64);
      authStore.set({ user: { ...user, ...updatedUser } });
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      const updatedUser = await usersApi.removeAvatar();
      authStore.set({ user: { ...user, ...updatedUser } });
    } catch (err) {
      setError(err.message || "Failed to remove");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">Account</h2>
        <p className="text-sm text-[#888] mt-0.5">Your profile and photo</p>
      </div>

      <div className="flex items-center gap-4 py-3 border-b border-black/5">
        <Avatar src={user?.avatarUrl} name={user?.name} size="lg" />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#121212] truncate">
            {user?.name || "User"}
          </p>
          <p className="text-[13px] text-[#888] truncate">{user?.email}</p>
          {user?.role && (
            <span className="inline-block mt-1">
              <Badge tone={user.role === "ADMIN" ? "ok" : "neutral"}>
                {user.role}
              </Badge>
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-[13px] font-medium text-[#121212] mb-2">Profile picture</p>
        <p className="text-[12px] text-[#888] mb-3">
          Shown in the sidebar and header. Square images work best.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 rounded-md text-[13px] font-medium bg-[#f4f4f5] text-[#121212] hover:bg-[#ebebeb] transition disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload photo"}
          </button>
          {user?.avatarUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={handleRemove}
              className="px-4 py-2 rounded-xl text-[13px] font-medium text-[#888] hover:bg-black/5 transition disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>
    </div>
  );
}

/* ---------- Appearance ---------- */
function AppearancePanel() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">Appearance</h2>
        <p className="text-sm text-[#888] mt-0.5">Theme and display</p>
      </div>

      <div className="flex items-center justify-between py-3 border-black/5">
        <div>
          <p className="text-[14px] font-medium text-[#121212]">Theme</p>
          <p className="text-[12px] text-[#888]">
            {isLight ? "Light mode" : "Dark mode"}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
          className="relative w-[40px] h-[24px] rounded-full transition-colors duration-200 ease-out shrink-0 border-0 cursor-pointer p-0"
          style={{
            backgroundColor: isLight ? "#34c759" : "#e9e9eb",
          }}
        >
          <span
            className="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white transition-all duration-200 ease-out pointer-events-none"
            style={{
              right: isLight ? "2px" : "18px",
              boxShadow:
                "0px 2px 6px rgba(0, 0, 0, 0.15), 0px 2px 1px rgba(0, 0, 0, 0.06)",
            }}
          />
        </button>
      </div>
    </div>
  );
}

/* ---------- Robot Mode ---------- */

function RobotModePanel() {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN");
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    settingsApi
      .getRobotMode()
      .then((res) => setMode(res.mode))
      .catch(() => setMode("simulation"));
  }, []);

  const switchMode = async (next) => {
    if (!isAdmin || busy || next === mode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await settingsApi.setRobotMode(next);
      setMode(res.mode);
    } catch (err) {
      setError(err.message || "Failed to switch mode");
    } finally {
      setBusy(false);
    }
  };

  const isHardware = mode === "hardware";

  if (mode === null) {
    return <p className="text-sm text-[#888]">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">Robot Mode</h2>
        <p className="text-sm text-[#888] mt-0.5">
          Hardware vs simulation — no .env or restart needed
        </p>
      </div>

      <div className="flex items-center justify-between py-3 border-black/5">
        <div>
          <p className="text-[14px] font-medium text-[#121212]">
            {isHardware ? "Hardware mode" : "Simulation mode"}
          </p>
          <p className="text-[12px] text-[#888]">
            {isHardware ? "Running on real robot" : "Running in simulation"}
          </p>
        </div>

        <button
          type="button"
          disabled={!isAdmin || busy}
          onClick={() => switchMode(isHardware ? "simulation" : "hardware")}
          aria-label={isHardware ? "Switch to simulation" : "Switch to hardware"}
          className="relative w-[40px] h-[24px] rounded-full transition-colors duration-200 ease-out shrink-0 border-0 cursor-pointer p-0 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: isHardware ? "#34c7" : "#34c759",
          }}
        >
          <span
            className="absolute top-[2px] w-[20px] h-[20px] rounded-full bg-white transition-all duration-200 ease-out pointer-events-none"
            style={{
              left: isHardware ? "18px" : "2px",
              boxShadow:
                "0px 2px 6px rgba(0, 0, 0, 0.06), 0px 2px 1px rgba(0, 0, 0, 0.06)",
            }}
          />
        </button>
      </div>

      {!isAdmin && (
        <p className="text-[12px] text-[#888]">Only admins can change robot mode.</p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* ---------- Face Link ---------- */
function FaceLinkPanel() {
  const { user } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  if (user?.personId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[#121212]">Face Link</h2>
          <p className="text-sm text-[#888] mt-0.5">Linked to Vision</p>
        </div>
        <p className="text-[14px] text-[#555]">
          This account is linked — Vision recognizes you as the same person
          whether you meet in person or log in here.
        </p>
      </div>
    );
  }

  const startCamera = async () => {
    setError(null);
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError("Camera access was denied or isn't available.");
      setCapturing(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCapturing(false);
  };

  const captureAndLink = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    stopCamera();
    setBusy(true);
    setError(null);
    try {
      const linked = await usersApi.linkFace(imageBase64);
      authStore.set({
        user: {
          ...user,
          personId: linked.linkedPerson?.id ?? linked.personId,
        },
      });
      setResult(
        linked.matchedExisting
          ? "Welcome back — Vision already knew you!"
          : "Linked — Vision will recognize you next time."
      );
    } catch (err) {
      setError(err.message || "Linking failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#121212]">Face Link</h2>
        <p className="text-sm text-[#888] mt-0.5">
          Link this account to your real-world identity
        </p>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {result ? (
        <p className="text-[14px] text-emerald-600">{result}</p>
      ) : capturing ? (
        <div className="flex items-center gap-4">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-36 h-28 rounded-xl bg-black object-cover"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={captureAndLink}
              className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[#1b1b1c] text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Linking…" : "Capture & Link"}
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="px-4 py-2 rounded-xl text-[13px] text-[#888] hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startCamera}
          className="px-4 py-2.5 rounded-xl text-[13px] font-medium bg-[#f4f4f5] text-[#121212] hover:bg-[#ebebeb] transition"
        >
          Use my camera
        </button>
      )}
    </div>
  );
}

/* ---------- Main modal ---------- */
export default function Settings() {
  const [tab, setTab] = useState("account");
  const navigate = useNavigate();

  const content = {
    account: <AccountPanel />,
    appearance: <AppearancePanel />,
    robot: <RobotModePanel />,
    face: <FaceLinkPanel />,
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") navigate(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navigate]);

  return (
    <div
      className="fixed inset-0 z-[100] x1 flex backdrop-blur-sm items-center justify-center px-4"
      style={{ animation: "fadeIn 0.15s ease-out both" }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: scale(0.97) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Coloured + blurred backdrop */}
      <div
        className="absolute inset-0  bg-black/20"
        onClick={() => navigate(-1)}
        style={{ animation: "fadeIn 0.12s ease-out both" }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-[980px] h-[min(520px,78vh)] bg-white rounded-2xl shadow-2xl border border-white/20 flex overflow-hidden"
        style={{ animation: "panelIn 0.2s ease-out both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <div className="w-[200px] shrink-0 border-r border-black/[0.06] bg-[#fafafa] p-4 flex flex-col">
          <div className="flex items-center gap-2 px-1 mb-2">
            <HiOutlineCog className="w-4 h-4 text-[#888]" />
            <span className="text-[12px] font-medium text-[#666]">Settings</span>
          </div>

          <nav className="space-y-0 flex-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`w-full flex items-center gap-2.5 px-1 py-1 rounded-xl text-[15px] transition-all ${tab === id
                  ? "bg-black/8 text-[#121212] bg-black/5 font-medium"
                  : "text-[#666] hover:bg-black/5 hover:text-[#121212]"
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-end px-4 h-12 border-b border-black/[0.04] shrink-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:bg-black/5 hover:text-black transition"
              title="Close"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{content[tab]}</div>
        </div>
      </div>
    </div>
  );
}