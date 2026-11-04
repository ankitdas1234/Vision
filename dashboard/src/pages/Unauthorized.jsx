import { Link } from "react-router-dom";

export default function Unauthorized() {
  return (
    <div className="min-h-screen bg-vision-bg flex flex-col items-center justify-center text-center px-6">
      <div className="text-2xl font-semibold text-vision-danger mb-2">Access denied</div>
      <p className="text-sm text-vision-muted mb-6">Your account doesn't have permission to view this page.</p>
      <Link to="/dashboard" className="px-4 py-2 rounded-lg bg-vision-hover/5 text-vision-text text-sm hover:bg-vision-hover/10">Back to dashboard</Link>
    </div>
  );
}
