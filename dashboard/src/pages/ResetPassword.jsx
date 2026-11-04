import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { authApi } from "../auth/authApi"; // Preserved your core authentication engine

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Reset password - Vision";
  }, []);

  const isFormValid = password.length >= 8;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err.message || "Reset failed");
    }
  };

  return (
    <div className="min-h-screen cool w-full flex items-center justify-center bg-white">
      <div className="flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-[360px] flex flex-col items-center text-center">
          
          {/* Logo element */}
          <Link to="/">
            <img src="/images/Vision.png" className="w-16 mb-6" alt="Logo" />
          </Link>

          {/* Descriptive Headings */}
          <h1 className="text-2xl font-bold text-[#121212] mb-2">
            Set a new password
          </h1>
          <p className="text-slate-500 text-[15px] mb-8">
            Choose a strong password for your account.
          </p>

          {/* Form Processing */}
          <form onSubmit={submit} className="w-full">
            <div className="w-full space-y-3 mb-4">
              {done ? (
                <p className="text-slate-600 text-sm text-center bg-slate-50 py-4 px-3 rounded-xl border border-slate-100">
                  Password updated — redirecting to login…
                </p>
              ) : (
                <>
                  <input
                    type="password"
                    placeholder="New password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#f4f4f5] border-none text-black rounded-xl px-4 py-3.5 text-[15px] focus:ring-2 focus:ring-black outline-none transition-all"
                    required
                    minLength={8}
                  />

                  {error && (
                    <p className="text-red-500 text-sm text-center font-medium my-1">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!isFormValid}
                    className={`w-full font-semibold py-3.5 rounded-xl transition-all duration-300 ${
                      isFormValid
                        ? "bg-[#1b1b1c] text-white shadow-lg shadow-black/10 cursor-pointer hover:opacity-90 active:scale-[0.98]"
                        : "bg-[#8b8df8]/20 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    Reset password
                  </button>
                </>
              )}
            </div>
          </form>

          {/* Bottom redirection utility */}
          <p className="text-[14px] text-slate-500 flex items-center justify-center gap-1.5 mt-4">
            <Link to="/login" className="text-black font-medium hover:underline">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
