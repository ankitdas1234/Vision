import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuthProvider from "./auth/AuthProvider";
import ProtectedRoute from "./auth/ProtectedRoute";
import RoleRoute from "./auth/RoleRoute";
import DashboardLayout from "./layouts/DashboardLayout";

import Home from "./pages/Home.jsx";
import Docs from "./pages/Docs.jsx";
import Blog from "./pages/Blog.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Unauthorized from "./pages/Unauthorized.jsx";

import Dashboard from "./pages/Dashboard.jsx";
import Monitoring from "./pages/Monitoring.jsx";
import Robot from "./pages/Robot.jsx";
import LiveCamera from "./pages/LiveCamera.jsx";
import PersonTracking from "./pages/PersonTracking.jsx";
import Audio from "./pages/Audio.jsx";
import Ultrasonic from "./pages/Ultrasonic.jsx";
import People from "./pages/People.jsx";
import Objects from "./pages/Objects.jsx";
import Memory from "./pages/Memory.jsx";
import Brain from "./pages/Brain.jsx";
import MentalIntelligence from "./pages/MentalIntelligence.jsx";
import Decisions from "./pages/Decisions.jsx";
import Reactions from "./pages/Reactions.jsx";
import Tasks from "./pages/Tasks.jsx";
import Commands from "./pages/Commands.jsx";
import EyeControl from "./pages/EyeControl.jsx";
import LegControl from "./pages/LegControl.jsx";
import GaitControl from "./pages/GaitControl.jsx";
import Telemetry from "./pages/Telemetry.jsx";
import Compiler from "./pages/Compiler.jsx";
import Simulation from "./pages/Simulation.jsx";
import Logs from "./pages/Logs.jsx";
import Safety from "./pages/Safety.jsx";
import Settings from "./pages/Settings.jsx";
import Users from "./pages/Users.jsx";
import UserProfile from "./pages/UserProfile.jsx";
import PersonProfile from "./pages/PersonProfile.jsx";
import ObjectProfile from "./pages/ObjectProfile.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Compiler: its own page, outside the dashboard layout */}
          <Route
            path="/compiler"
            element={
              <ProtectedRoute>
                <RoleRoute minRole="ADMIN">
                  <Compiler standalone />
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          {/* Protected — everything under /dashboard requires an authenticated session */}
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Routes>
                    <Route index element={<Dashboard />} />
                    <Route path="monitoring" element={<Monitoring />} />
                    <Route path="robot" element={<Robot />} />
                    <Route path="camera" element={<LiveCamera />} />
                    <Route path="tracking" element={<PersonTracking />} />
                    <Route path="audio" element={<Audio />} />
                    <Route path="ultrasonic" element={<Ultrasonic />} />
                    <Route
                      path="people"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <People />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="people/:id"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <PersonProfile />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="objects"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <Objects />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="objects/:id"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <ObjectProfile />
                        </RoleRoute>
                      }
                    />
                    <Route path="memory" element={<Memory />} />
                    <Route path="memory/*" element={<Navigate to="/dashboard/memory" replace />} />
                    <Route path="brain" element={<Brain />} />
                    <Route path="mental" element={<MentalIntelligence />} />
                    <Route path="decisions" element={<Decisions />} />
                    <Route path="reactions" element={<Reactions />} />
                    <Route path="tasks" element={<Tasks />} />
                    <Route path="commands" element={<Commands />} />
                    <Route path="control/eye" element={<EyeControl />} />
                    <Route path="control/leg" element={<LegControl />} />
                    <Route path="control/gait" element={<GaitControl />} />
                    <Route path="telemetry" element={<Telemetry />} />
                    <Route path="simulation" element={<Simulation />} />
                    <Route
                      path="compiler"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <Compiler />
                        </RoleRoute>
                      }
                    />
                    {/* /dashboard/scripts is retired — Compiler now covers everything it
                        did (bulk multi-line source, Compile + Run in one place) plus the
                        mode toggle and kill switch; redirect any old bookmarks/links. */}
                    <Route path="scripts" element={<Navigate to="/dashboard/compiler" replace />} />
                    <Route path="logs" element={<Logs />} />
                    <Route path="safety" element={<Safety />} />
                    <Route path="settings" element={<Settings />} />
                    <Route
                      path="users"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <Users />
                        </RoleRoute>
                      }
                    />
                    <Route
                      path="users/:id"
                      element={
                        <RoleRoute minRole="ADMIN">
                          <UserProfile />
                        </RoleRoute>
                      }
                    />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </DashboardLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
