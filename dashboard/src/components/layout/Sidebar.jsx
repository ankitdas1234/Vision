import { useState, useRef, useEffect, useMemo } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuthStore, hasRole } from "../../auth/authStore";
import { logout } from "../../auth/AuthProvider";
import { useSimMode } from "../../hooks/useSimMode";
import Avatar from "../common/Avatar";
import {PanelRight, PanelLeft, BrainCircuit, Brain} from "lucide-react";
import {
  HiOutlineViewGrid,
  HiOutlineChartBar,
  HiOutlineChip,
  HiOutlineVideoCamera,
  HiOutlineUserGroup,
  HiOutlineSpeakerphone,
  HiOutlineStatusOnline,
  HiOutlineDatabase,
  HiOutlineLightBulb,
  HiOutlineSparkles,
  HiOutlineSwitchHorizontal,
  HiOutlineLightningBolt,
  HiOutlineClipboardList,
  HiOutlineTerminal,
  HiOutlineEye,
  HiOutlineArrowsExpand,
  HiOutlineTrendingUp,
  HiOutlineDocumentText,
  HiOutlineShieldCheck,
  HiOutlineCog,
  HiOutlineCode,
  HiOutlineUsers,
  HiOutlineCube,
  HiOutlineUserCircle,
  HiOutlineLogout,
  HiOutlineSearch,
  HiOutlineMenu,
  HiOutlineChevronLeft,
  HiOutlineX,
  HiOutlinePlus,
  HiOutlinePlay,
} from "react-icons/hi";

const MAIN_LINKS = [
  { to: "", label: "Dashboard", icon: HiOutlineViewGrid, group: "Main" },
  { to: "monitoring", label: "Monitoring", icon: HiOutlineChartBar, group: "Main" },
  { to: "robot", label: "Robot", icon: HiOutlineChip, group: "Main" },
  { to: "camera", label: "Live Camera", icon: HiOutlineVideoCamera, group: "Main" },
  { to: "tracking", label: "Person Tracking", icon: HiOutlineUserGroup, group: "Main" },
  { to: "audio", label: "Audio", icon: HiOutlineSpeakerphone, group: "Sensing" },
  { to: "ultrasonic", label: "Ultrasonic", icon: HiOutlineStatusOnline, group: "Sensing" },
  { to: "memory", label: "Memory Lookup", icon: HiOutlineDatabase, group: "Memory" },
  { to: "brain", label: "Brain", icon: Brain, group: "Brain" },
  { to: "mental", label: "Mental Intelligence", icon: HiOutlineLightBulb, group: "Brain" },
  { to: "decisions", label: "Decisions", icon: BrainCircuit, group: "Brain" },
  { to: "reactions", label: "Reactions", icon: HiOutlineLightningBolt, group: "Brain" },
  { to: "tasks", label: "Tasks", icon: HiOutlineClipboardList, group: "Control" },
  { to: "commands", label: "Commands", icon: HiOutlineTerminal, group: "Control" },
  { to: "control/eye", label: "Eye Control", icon: HiOutlineEye, group: "Control" },
  { to: "control/leg", label: "Leg Control", icon: HiOutlineArrowsExpand, group: "Control" },
  { to: "control/gait", label: "Gait Control", icon: HiOutlineTrendingUp, group: "Control" },
  { to: "telemetry", label: "Telemetry", icon: HiOutlineChartBar, group: "System" },
  { to: "logs", label: "Logs", icon: HiOutlineDocumentText, group: "System" },
  { to: "safety", label: "Safety", icon: HiOutlineShieldCheck, group: "System" },
];

// Only shown when the server runs ROBOT_MODE=simulation (see hooks/useSimMode.js).
const SIM_LINKS = [
  { to: "simulation", label: "Simulation", icon: HiOutlinePlay, group: "Simulation" },
];

const ADMIN_LINKS = [
  { to: "compiler", label: "Compiler", icon: HiOutlineCode, group: "Admin" },
  { to: "people", label: "People", icon: HiOutlineUsers, group: "Admin" },
  { to: "objects", label: "Objects", icon: HiOutlineCube, group: "Admin" },
  { to: "users", label: "Users", icon: HiOutlineUserCircle, group: "Admin" },
];

export default function Sidebar() {
  const { user } = useAuthStore();
  const isAdmin = hasRole(user, "ADMIN");
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const menuRef = useRef(null);
  const searchInputRef = useRef(null);

  const { available: simAvailable } = useSimMode();

  const allLinks = useMemo(
    () => [...MAIN_LINKS, ...(simAvailable ? SIM_LINKS : []), ...(isAdmin ? ADMIN_LINKS : [])],
    [isAdmin, simAvailable]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allLinks;
    return allLinks.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        l.group.toLowerCase().includes(q)
    );
  }, [query, allLinks]);

  const grouped = useMemo(() => {
    const map = {};
    results.forEach((item) => {
      if (!map[item.group]) map[item.group] = [];
      map[item.group].push(item);
    });
    return map;
  }, [results]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setSelected(null);
    }
  }, [searchOpen]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    if (searchOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login");
  };

  const goTo = (to) => {
    navigate(`/dashboard${to ? `/${to}` : ""}`);
    setSearchOpen(false);
  };

  return (
    <>
    <div className="x1">
      <nav
        className={`h-screen sticky top-0 flex flex-col bg-[#F5F3F2] border-r border-black/5 transition-[width] duration-300 ease-in-out ${
          collapsed ? "w-[62px]" : "w-[275px]"
        }`}
      >
        {/* ===== BLOCK 1: Logo + Search + Collapse ===== */}
        {collapsed ? (
          <div className="flex items-center justify-center h-14 shrink-0">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-[#555] hover:bg-black/5 hover:text-black transition"
              title="Expand"
            >
              <PanelRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-3 h-14 shrink-0">
            <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0">
              <img
                src="/images/Vision.png"
                alt="Vision"
                className="w-8 h-8 object-contain shrink-0"
              />
            </Link>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-[#555] hover:bg-black/5 hover:text-black transition"
                title="Search"
              >
                <HiOutlineSearch className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-[#555] hover:bg-black/5 hover:text-black transition"
                title="Collapse"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ===== BLOCK 2: Nav links (extra top gap, tight item spacing) ===== */}
        <div
          className="flex-1 overflow-y-auto px-2 pt-5 space-y-0.4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <style>{`
            nav div::-webkit-scrollbar { display: none; }
            @keyframes panelIn {
              from { opacity: 0; transform: scale(0.98) translateY(8px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>

          {allLinks.map(({ to, href, label, icon: Icon }) => (
            <NavLink
              key={to || "root"}
              to={href || `/dashboard${to ? `/${to}` : ""}`}
              end={to === ""}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-xl transition-all duration-150 ${
                  collapsed
                    ? "justify-center w-11 h-10 mx-auto"
                    : "gap-3 px-3 py-2"
                } ${
                  isActive
                    ? "bg-[#EBE9E9] text-[#121212] font-medium"
                    : "text-[#555] hover:bg-[#EBE9E9] hover:text-[#121212]"
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <span className="text-[15px] truncate">{label}</span>
              )}
            </NavLink>
          ))}
        </div>

        {/* ===== PROFILE ===== */}
        {user && (
          <div className="relative shrink-0 p-2 border-t border-black/5" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`w-full flex items-center rounded-xl transition hover:bg-black/5 ${
                collapsed ? "justify-center p-2" : "gap-3 px-2 py-2"
              }`}
            >
              <Avatar src={user.avatarUrl} name={user.name} size="sm" />
              {!collapsed && (
                <p className="flex-1 min-w-0 text-left text-[14px] font-medium text-[#121212] truncate">
                  {user.name || "User"}
                </p>
              )}
            </button>

            {menuOpen && (
              <div
                className={`absolute bottom-full mb-2 bg-[#FFFFFF] rounded-2xl shadow-xl border border-black/5 py-2 z-50 ${
                  collapsed ? "left-2 min-w-[220px]" : "left-2 right-2"
                }`}
                style={{ animation: "panelIn 0.15s ease-out both" }}
              >
                <div className="px-4 py-2 border-b border-black/5">
                  <p className="text-[14px] font-medium text-[#666] truncate">{user.email}</p>
                </div>
                <Link
                  to="/dashboard/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-[#121212] hover:bg-black/5"
                >
                  <HiOutlineCog className="w-5 h-5 text-[#666]" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-[#121212] hover:bg-black/5"
                >
                  <HiOutlineLogout className="w-5 h-5 text-[#666]" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ================= SEARCH PANEL ================= */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[100] flex backdrop-blur-sm items-center justify-center px-4"
          style={{ animation: "fadeIn 0.12s ease-out both" }}
        >
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setSearchOpen(false)}
          />

          <div
            className="relative w-full max-w-[1110px] h-[min(520px,78vh)] bg-white rounded-3xl shadow-2xl border border-black/[0.06] flex flex-col overflow-hidden"
            style={{ animation: "panelIn 0.18s ease-out both" }}
          >
            <div className="flex items-center gap-3 px-4 h-[52px] border-b border-black/[0.06] shrink-0">
              <HiOutlineSearch className="w-[18px] h-[30px] text-[#999] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="flex-1 text-[15px] text-[#121212] placeholder:text-[#bbb] outline-none bg-transparent"
              />
              <div className="hidden sm:flex items-center bg-gray-100 rounded-full p-0.5">
                <span className="px-3 py-1 rounded-full text-[12px] font-medium bg-white text-[#121212] shadow-sm">
                  Pages
                </span>
                <span className="px-3 py-1 rounded-full text-[12px] text-[#888]">
                  {isAdmin ? "Admin" : "User"}
                </span>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <div
                className="w-full sm:w-[48%] border-r border-black/[0.06] overflow-y-auto"
                style={{ scrollbarWidth: "thin" }}
              >
                {!query && (
                  <div className="pt-3 pb-1">
                    <div className="flex items-center justify-between px-4 mb-1">
                      <span className="text-[12px] text-[#999]">Actions</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo("")}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] text-[#121212] hover:bg-[#f4f4f5] transition-colors"
                    >
                      <HiOutlinePlus className="w-4 h-4 text-[#666]" />
                      Go to Dashboard
                    </button>
                  </div>
                )}

                {results.length === 0 ? (
                  <p className="text-center text-[13px] text-[#aaa] py-12">
                    No results for “{query}”
                  </p>
                ) : (
                  Object.entries(grouped).map(([group, items]) => (
                    <div key={group} className="pt-3 pb-1">
                      <p className="px-4 mb-1 text-[12px] text-[#999]">{group}</p>
                      {items.map((item) => {
                        const Icon = item.icon;
                        const isSelected = selected === (item.to || "root");
                        return (
                          <button
                            key={item.to || "root"}
                            type="button"
                            onClick={() => goTo(item.to)}
                            onMouseEnter={() => setSelected(item.to || "root")}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] transition-colors ${
                              isSelected
                                ? "bg-[#f4f4f5] text-[#121212]"
                                : "text-[#121212] hover:bg-[#f7f7f8]"
                            }`}
                          >
                            <Icon className="w-4 h-4 text-[#666] shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              <div className="hidden sm:flex flex-1 items-center justify-center">
                {selected ? (
                  (() => {
                    const item = allLinks.find((l) => (l.to || "root") === selected);
                    if (!item) return null;
                    const Icon = item.icon;
                    return (
                      <div className="text-center px-8">
                        <div className="w-12 h-12 rounded-2xl bg-[#f4f4f5] flex items-center justify-center mx-auto mb-3">
                          <Icon className="w-6 h-6 text-[#444]" />
                        </div>
                        <p className="text-[15px] font-medium text-[#121212] mb-1">{item.label}</p>
                        <p className="text-[12px] text-[#999] mb-4">{item.group}</p>
                        <button
                          type="button"
                          onClick={() => goTo(item.to)}
                          className="text-[13px] px-4 py-2 rounded-full bg-[#f4f4f5] text-[#121212] hover:bg-[#ebebeb] transition"
                        >
                          Open
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <p className="text-[14px] text-[#bbb]">Select a page to preview</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}