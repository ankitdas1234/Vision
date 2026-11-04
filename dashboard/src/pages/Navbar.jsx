export function Navbar() {
  return (
    <nav className="fixed top-10 left-0 right-0 mx-auto w-max z-50">
        <div className="flex items-center bg-[#110f15] text-white/90 rounded-full py-2 px-2 pl-3 shadow-2xl border border-white/5">
          <div className="flex items-center justify-center mr-4">
            <img className="w-8 opacity-90" src="/images/Vision.png" alt="Logo" />
          </div>
          <div className="flex cursor-pointer items-center gap-4 text-[14px] font-medium mr-6">
            <a href="#Features" className="flex items-center gap-1 hover:text-white transition-opacity opacity-80 hover:opacity-100">Features</a>
            <a href="#Pricing" className="opacity-80 hover:opacity-100 transition-opacity">Pricing</a>
            <a href="/blog" className="opacity-80 hover:opacity-100 transition-opacity">Blog</a>
            <a href="/docs" className="opacity-80 hover:opacity-100 transition-opacity">Docs</a>
          </div>
          <div className="flex items-center">
            <a href="/login" className="text-[14px] cursor-pointer font-medium px-4 opacity-80 hover:opacity-100 transition-opacity">Login</a>
            <a href="/register" className="bg-white cursor-pointer hover:bg-gray-200 text-black text-[14px] font-semibold px-4 py-1.5 rounded-full transition-all active:scale-95 shadow-sm">Register</a>
          </div>
        </div>
      </nav>
  );
}
