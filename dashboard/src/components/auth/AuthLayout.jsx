import { Link } from "react-router-dom";

export default function AuthLayout({
  title,
  subtitle,
  children,
  switchTo,
  switchLabel,
  note,
}) {
  return (
    <div className="min-h-screen w-full cool bg-[#F0F2F5] flex items-center justify-center p-4 sm:p-6 text-[#1F1F1F]">
      <div className="auth-in w-full max-w-[1024px] min-h-[540px] bg-white rounded-[28px] shadow-[0_1px_3px_rgba(60,64,67,0.3),0_4px_8px_3px_rgba(60,64,67,0.15)] flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 p-8 sm:p-10 md:p-14 flex flex-col">
          <div className="mb-auto">
            <Link to="/" aria-label="Vision home" className="inline-block mb-8">
              <img
                src="/images/Vision.png"
                className="w-12 h-12 object-contain"
                alt="Vision"
              />
            </Link>
            <h1 className="text-[32px] md:text-[40px] font-normal leading-tight tracking-tight mb-4">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[#444746] text-lg cool">{subtitle}</p>
            )}
          </div>
          <div className="hidden md:block text-gray-400 text-sm mt-10">
            Vision · control room for your robot
          </div>
        </div>

        <div className="flex-1 p-8 sm:p-10 md:p-14 flex flex-col justify-center">
          <div className="w-full max-w-[360px] mx-auto">
            {children}

            {switchTo && (
              <>
                <div className="flex items-center my-8">
                  <div className="flex-grow border-t border-gray-200" />
                  <span className="px-4 text-xs font-medium text-gray-400 uppercase tracking-widest">
                    or
                  </span>
                  <div className="flex-grow border-t border-gray-200" />
                </div>
                <Link
                  to={switchTo}
                  className="block w-full py-2.5 rounded-full border border-[#747775] text-gray-900 text-sm font-semibold text-center hover:bg-[#F1F3F4] transition-colors"
                >
                  {switchLabel}
                </Link>
              </>
            )}

            {note && (
              <p className="mt-8 text-xs text-gray-500 text-center leading-relaxed">
                {note}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Black when valid, same style as Forgot Password */
export const submitCls = (isValid) =>
  `w-full h-11 cool rounded-lg font-medium transition-all duration-300 ${
    isValid
      ? "bg-[#1b1b1c] text-white shadow-lg shadow-black/10 cursor-pointer hover:opacity-90 active:scale-[0.98]"
      : "bg-gray-100 text-slate-500 cursor-not-allowed"
  }`;
