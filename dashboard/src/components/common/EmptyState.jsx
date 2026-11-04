export default function EmptyState({ message = "Nothing here yet." }) {
  return <div className="text-sm text-vision-muted py-6 text-center">{message}</div>;
}
